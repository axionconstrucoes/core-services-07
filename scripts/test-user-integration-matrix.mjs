// Matriz de fontes por projeto/usuário: critérios verificáveis dos faróis (verde só com prova; nada manual).
// Uso: node scripts/test-user-integration-matrix.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { buildUserSourceRows, buildSharedSourceRows } = await import("../apps/web/lib/integrations/user-integration-matrix");

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const NOW = new Date("2026-11-11T22:00:00Z");
const member = (id, email, status = "ACTIVE") => ({ userId: id, status, area: "DIRETORIA", user: { name: email.split("@")[0], email } });
const mailbox = (mb, extra = {}) => ({ mailbox: mb, emails: 678, lastMessageAt: "2026-11-05T12:39:18Z", attachments: 0, attachmentsProcessed: 0, attachmentsPending: 0, ...extra });
const evidence = (over = {}) => ({
  measuredAt: NOW.toISOString(), authorizations: [], controls: null, mailboxes: [], unassignedEmails: 23, warnings: [],
  shared: { diario: null, weekly: null, construmanager: null, ssma: null }, ...over,
});
const row = (rows, id) => rows.find((r) => r.userId === id);

check("vínculo ACTIVE sozinho nunca fica verde: usuário sem aceite, caixa nem controle tem todas as etapas vermelhas", () => {
  const [r] = buildUserSourceRows([member("u1", "carlos@axion.com.br")], evidence(), NOW);
  ok(!r.authorization.ok && !r.technical.ok && !r.collection.ok && !r.material.ok && !r.overall.ok, "alguma etapa verde sem prova");
});
check("aceite AUTORIZADO + mensagens importadas: aceite e coleta verdes, mas conexão técnica continua vermelha sem a tabela de controles", () => {
  const ev = evidence({ authorizations: [{ user_id: "u1", account_email: "reynaldo@axion.com.br", status: "AUTORIZADO", requested_at: "2026-11-11T13:34:00Z" }], mailboxes: [mailbox("reynaldo@axion.com.br")] });
  const r = row(buildUserSourceRows([member("u1", "reynaldo@axion.com.br")], ev, NOW), "u1");
  ok(r.authorization.ok && r.collection.ok, "aceite/coleta deveriam ser verdes");
  ok(!r.technical.ok && /tabela de controles/.test(r.technical.reason), "conexão técnica deve citar a tabela ausente");
  ok(!r.overall.ok, "resumo não pode ser verde com etapa vermelha");
});
check("mensagens sem aceite autorizado: coleta vermelha ('Sem aceite válido')", () => {
  const ev = evidence({ mailboxes: [mailbox("a@axion.com.br")] });
  const r = buildUserSourceRows([member("u1", "a@axion.com.br")], ev, NOW)[0];
  ok(!r.collection.ok && r.collection.label === "Sem aceite válido", r.collection.label);
});
check("aceite de OUTRA caixa ou de outro usuário não vale", () => {
  const ev = evidence({ authorizations: [{ user_id: "u2", account_email: "a@axion.com.br", status: "AUTORIZADO", requested_at: "x" }, { user_id: "u1", account_email: "outra@axion.com.br", status: "AUTORIZADO", requested_at: "x" }] });
  ok(!buildUserSourceRows([member("u1", "a@axion.com.br")], ev, NOW)[0].authorization.ok, "aceite indevido aceito");
});
check("resumo verde só com as quatro etapas comprovadas (controle CONFIRMADA, coleta e anexos 100% processados)", () => {
  const ev = evidence({
    authorizations: [{ user_id: "u1", account_email: "a@axion.com.br", status: "AUTORIZADO", requested_at: "x" }],
    controls: [{ mailbox_address: "a@axion.com.br", technical_permission_status: "CONFIRMADA", collection_enabled: true, individual_consent_status: "AUTORIZADO", corporate_authorization_status: "AUTORIZADA", period_start: null, period_end: null, revoked_at: null, last_sync_at: null, last_sync_status: null }],
    mailboxes: [mailbox("a@axion.com.br", { attachments: 3, attachmentsProcessed: 3 })],
  });
  ok(buildUserSourceRows([member("u1", "a@axion.com.br")], ev, NOW)[0].overall.ok, "deveria ser verde");
});
check("anexos pendentes mantêm o material vermelho com a contagem no motivo", () => {
  const ev = evidence({ mailboxes: [mailbox("a@axion.com.br", { attachments: 416, attachmentsProcessed: 35, attachmentsPending: 381 })] });
  const r = buildUserSourceRows([member("u1", "a@axion.com.br")], ev, NOW)[0];
  ok(!r.material.ok && /381 de 416/.test(r.material.reason), r.material.reason);
});
check("controle revogado, desligado ou período vencido tornam a coleta vermelha mesmo com aceite", () => {
  const base = { technical_permission_status: "CONFIRMADA", collection_enabled: true, individual_consent_status: "AUTORIZADO", corporate_authorization_status: "AUTORIZADA", period_start: null, period_end: null, revoked_at: null, last_sync_at: null, last_sync_status: null, mailbox_address: "a@axion.com.br" };
  for (const control of [{ ...base, revoked_at: "2026-11-01" }, { ...base, collection_enabled: false }, { ...base, period_end: "2026-01-01T00:00:00Z" }]) {
    const ev = evidence({ authorizations: [{ user_id: "u1", account_email: "a@axion.com.br", status: "AUTORIZADO", requested_at: "x" }], controls: [control], mailboxes: [mailbox("a@axion.com.br")] });
    ok(!buildUserSourceRows([member("u1", "a@axion.com.br")], ev, NOW)[0].collection.ok, "coleta verde indevida");
  }
});
check("consultas indisponíveis (null) jamais geram verde", () => {
  const ev = evidence({ authorizations: null, controls: null, mailboxes: null, unassignedEmails: null });
  const r = buildUserSourceRows([member("u1", "a@axion.com.br")], ev, NOW)[0];
  ok(!r.authorization.ok && !r.technical.ok && !r.collection.ok && !r.material.ok && r.emails === null, "verde sem consulta");
});
check("fontes compartilhadas: valores medidos de 11/11 mantêm disponibilidade vermelha onde há pendências", () => {
  const shared = {
    diario: { reports: 187, lastRunStatus: "SUCESSO", lastRunAt: "2026-11-11T07:05:20Z", lastRunErrors: 0, lastRunCreated: 0, integrationStatus: "CONECTADO" },
    weekly: { workbooks: 56, workbooksPendingReview: 50, sheets: 280, sheetsExtracted: 106, sheetsMissing: 92, sheetsPendingReview: 82 },
    construmanager: { integrationStatus: "CONECTADO", lastRunStatus: "SUCESSO", lastRunAt: "2026-11-11T19:35:58Z", stored: 2, pending: 201, humanDecision: 0, other: 0 },
    ssma: { integrationStatus: "PENDENTE", lastSyncAt: null },
  };
  const rows = buildSharedSourceRows(evidence({ shared }));
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  ok(by.diario.availability.ok && by.diario.collection.ok, "diário comprovado deve ser verde (zero novos não é falha)");
  ok(!by.semanal.availability.ok && /106 de 280/.test(by.semanal.availability.reason), "semanal parcial");
  ok(!by.construmanager.availability.ok && /201 conteúdos pendentes/.test(by.construmanager.availability.reason), "construmanager pendente");
  ok(!by.ssma.connection.ok && !by.ssma.availability.ok, "SSMA pendente");
  ok(rows.every((r) => r.facts.some((f) => /não prova conta individual/.test(f))), "aviso de fonte compartilhada ausente");
});
check("estático: nenhum controle permite marcar farol manualmente e nenhuma escrita/migration/envio no coletor", () => {
  const src = readFileSync(new URL("../apps/web/lib/integrations/get-user-integration-evidence.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(src), "coletor deve ser somente leitura");
  ok(!/token|refresh_token|body_text|body_html/.test(src), "coletor não pode ler tokens nem corpos");
  const cmp = readFileSync(new URL("../apps/web/components/integrations/source-beacon.tsx", import.meta.url), "utf8");
  ok(!/onClick|<input|<button/.test(cmp), "farol não pode ser interativo");
  ok(/sr-only/.test(cmp) && /✓/.test(cmp) && /✕/.test(cmp), "farol precisa de texto e ícone além da cor");
});
console.log(`\n${passed} OK, ${failed} falha(s)`); process.exit(failed ? 1 : 0);
