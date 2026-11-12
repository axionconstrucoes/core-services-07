// Matriz de fontes por projeto/usuário: critérios verificáveis dos faróis (verde só com evidência operacional; nada manual).
// Uso: node scripts/test-user-integration-matrix.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { buildUserSourceRows, buildSharedSourceRows } = await import("../apps/web/lib/integrations/user-integration-matrix");

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const NOW = new Date("2026-11-11T22:00:00Z");
const MAIL = "a@axion.com.br";
const member = (id = "u1", email = MAIL, status = "ACTIVE") => ({ userId: id, status, area: "DIRETORIA", user: { name: email.split("@")[0], email } });
const mailbox = (extra = {}) => ({ mailbox: MAIL, emails: 10, bodiesAvailable: 10, lastMessageAt: "2026-11-05T12:39:18Z", attachments: 0, attachmentsStored: 0, attachmentsProcessed: 0, attachmentsPending: 0, attachmentsError: 0, ...extra });
const authz = (status = "AUTORIZADO") => [{ user_id: "u1", account_email: MAIL, status, requested_at: "2026-11-11T13:34:00Z" }];
const control = (extra = {}) => ({ mailbox_address: MAIL, technical_permission_status: "CONFIRMADA", collection_enabled: true, individual_consent_status: "AUTORIZADO", corporate_authorization_status: "AUTORIZADA", period_start: "2026-01-01T00:00:00Z", period_end: "2027-01-01T00:00:00Z", revoked_at: null, last_sync_at: "2026-11-11T21:00:00Z", last_sync_status: "SUCESSO", ...extra });
const ingestion = { projectEnabled: true, mailboxes: [{ mailbox: MAIL, enabled: true }] };
const evidence = (over = {}) => ({
  measuredAt: NOW.toISOString(), alertRecipientUserIds: [], authorizations: authz(), controls: [control()], ingestion, mailboxes: [mailbox()], unassignedEmails: 23, warnings: [],
  shared: { diario: null, weekly: null, construmanager: null, ssma: null }, ...over,
});
const one = (over = {}, m = member()) => buildUserSourceRows([m], evidence(over), NOW)[0];
const label = (b) => `${b.ok ? "VERDE" : "VERMELHO"}:${b.label}`;

check("caso ideal: aceite, controle confirmado, período vigente, sync recente, corpos e anexos processados => tudo verde", () => {
  const r = one({ mailboxes: [mailbox({ attachments: 3, attachmentsStored: 3, attachmentsProcessed: 3 })] });
  ok(r.authorization.ok && r.technical.ok && r.collection.ok && r.material.ok && r.overall.ok, [r.authorization, r.technical, r.collection, r.material].map(label).join(" | "));
  ok(r.collection.at === "2026-11-11T21:00:00Z", "a coleta atual deve citar a data da evidência");
});
check("ausência de dados: sem aceite, controle, caixa ou mensagens => tudo vermelho", () => {
  const r = one({ authorizations: [], controls: [], mailboxes: [], ingestion: null });
  ok(!r.authorization.ok && !r.technical.ok && !r.collection.ok && !r.material.ok && !r.overall.ok, "alguma etapa verde sem prova");
});
check("mensagens antigas + controle ausente (tabela inexistente): 'Histórico importado', nunca coleta atual", () => {
  const r = one({ controls: null });
  ok(!r.collection.ok && r.collection.label === "Histórico importado", label(r.collection));
  ok(!r.technical.ok && /tabela de controles/.test(r.technical.reason), "conexão técnica deve citar a tabela ausente");
  ok(r.collection.at === "2026-11-05T12:39:18Z", "histórico deve citar a data da última mensagem");
});
check("controle existe mas sem registro da caixa: 'Coleta não comprovada'", () => {
  const r = one({ controls: [control({ mailbox_address: "outra@axion.com.br" })] });
  ok(!r.collection.ok && r.collection.label === "Coleta não comprovada", label(r.collection));
});
check("período futuro, vencido e inválido nunca geram verde operacional", () => {
  ok(one({ controls: [control({ period_start: "2027-01-01T00:00:00Z", period_end: "2027-06-01T00:00:00Z" })] }).collection.label === "Período futuro", "futuro");
  ok(one({ controls: [control({ period_start: "2025-01-01T00:00:00Z", period_end: "2026-01-01T00:00:00Z" })] }).collection.label === "Período vencido", "vencido");
  for (const bad of [{ period_start: null, period_end: null }, { period_start: "2026-06-01T00:00:00Z", period_end: "2026-01-01T00:00:00Z" }, { period_start: "lixo", period_end: "2027-01-01T00:00:00Z" }]) {
    const r = one({ controls: [control(bad)] });
    ok(!r.collection.ok && r.collection.label === "Período inválido", JSON.stringify(bad) + " => " + label(r.collection));
  }
});
check("revogação: aceite revogado/recusado, controle revogado ou consentimento revogado bloqueiam", () => {
  ok(!one({ authorizations: authz("REVOGADO") }).collection.ok, "aceite revogado");
  ok(!one({ authorizations: authz("RECUSADO") }).authorization.ok, "aceite recusado");
  const revoked = one({ controls: [control({ revoked_at: "2026-11-10T00:00:00Z" })] });
  ok(!revoked.collection.ok && !revoked.technical.ok && revoked.collection.label === "Revogada", label(revoked.collection));
  ok(one({ controls: [control({ individual_consent_status: "REVOGADO" })] }).collection.label === "Revogada", "consentimento revogado");
});
check("caixa desabilitada na ingestão, coleta individual desligada e última sincronização antiga ou com erro", () => {
  ok(one({ ingestion: { projectEnabled: true, mailboxes: [{ mailbox: MAIL, enabled: false }] } }).collection.label === "Caixa fora da coleta", "caixa desabilitada");
  ok(one({ ingestion: { projectEnabled: false, mailboxes: [{ mailbox: MAIL, enabled: true }] } }).collection.label === "Caixa fora da coleta", "obra desligada");
  ok(one({ controls: [control({ collection_enabled: false })] }).collection.label === "Coleta desligada", "desligada");
  ok(one({ controls: [control({ last_sync_at: "2026-11-01T00:00:00Z" })] }).collection.label === "Coleta desatualizada", "desatualizada");
  ok(one({ controls: [control({ last_sync_status: "ERRO" })] }).collection.label === "Última coleta com falha", "erro");
  ok(one({ controls: [control({ last_sync_at: null })] }).collection.label === "Coleta não comprovada", "sem sync");
});
check("falha de consulta (null) jamais gera verde e não quebra o modelo", () => {
  const r = one({ authorizations: null, controls: null, mailboxes: null, ingestion: null, unassignedEmails: null });
  ok(!r.authorization.ok && !r.technical.ok && !r.collection.ok && !r.material.ok && r.emails === null, "verde sem consulta");
});
check("aceite de OUTRA caixa ou de outro usuário não vale", () => {
  const r = one({ authorizations: [{ user_id: "u2", account_email: MAIL, status: "AUTORIZADO", requested_at: "x" }, { user_id: "u1", account_email: "outra@axion.com.br", status: "AUTORIZADO", requested_at: "x" }] });
  ok(!r.authorization.ok, "aceite indevido aceito");
});
check("usuário inativo nunca coleta; vínculo ACTIVE sozinho não torna nada verde", () => {
  ok(one({}, member("u1", MAIL, "INACTIVE")).collection.label === "Usuário inativo", "inativo");
  const r = one({ authorizations: [], controls: [], mailboxes: [], ingestion: null }, member("u9", "novo@axion.com.br"));
  ok(!r.overall.ok, "ACTIVE sem fonte não pode ser verde");
});
check("material: corpos ausentes, anexos pendentes/erro/não armazenados e 'sem anexos' com corpo disponível", () => {
  ok(one({ mailboxes: [mailbox({ bodiesAvailable: 7 })] }).material.label === "Corpos ausentes", "corpos ausentes");
  const pend = one({ mailboxes: [mailbox({ attachments: 416, attachmentsStored: 416, attachmentsProcessed: 35, attachmentsPending: 381 })] }).material;
  ok(!pend.ok && /381 pendentes/.test(pend.reason) && /416 armazenados/.test(pend.reason) && /35 processados/.test(pend.reason), pend.reason);
  ok(!one({ mailboxes: [mailbox({ attachments: 2, attachmentsStored: 2, attachmentsProcessed: 1, attachmentsError: 1 })] }).material.ok, "erro de processamento");
  ok(!one({ mailboxes: [mailbox({ attachments: 2, attachmentsStored: 1, attachmentsProcessed: 1 })] }).material.ok, "anexo não armazenado");
  const none = one({ mailboxes: [mailbox()] }).material;
  ok(none.ok && none.label === "Corpos disponíveis" && /não é verificada/.test(none.reason), "sem anexos mas com corpo não é defeito, e a ressalva deve constar");
  ok(one({ mailboxes: [mailbox({ bodiesAvailable: null })] }).material.label === "Sem comprovação", "contagem de corpos indisponível");
});
check("estático: nenhum controle permite marcar farol manualmente; coletor somente leitura sem tokens/conteúdo", () => {
  const src = readFileSync(new URL("../apps/web/lib/integrations/get-user-integration-evidence.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(src), "coletor deve ser somente leitura");
  ok(!/token|refresh_token|select\("[^"]*body_text/.test(src), "coletor não pode ler tokens nem corpos");
  const cmp = readFileSync(new URL("../apps/web/components/integrations/source-beacon.tsx", import.meta.url), "utf8");
  ok(!/onClick|<input|<button/.test(cmp), "farol não pode ser interativo");
  ok(/sr-only/.test(cmp) && /✓/.test(cmp) && /✕/.test(cmp) && /Evidência de/.test(cmp), "farol precisa de texto, ícone e data");
});

// Fontes compartilhadas
const shared = (over = {}) => ({
  diario: { reports: 187, lastRunStatus: "SUCESSO", lastRunAt: "2026-11-11T07:05:20Z", lastRunErrors: 0, lastRunCreated: 0, integrationStatus: "CONECTADO" },
  weekly: { workbooks: 56, workbooksExtracted: 4, workbooksPartial: 2, workbooksPendingReview: 50, workbooksOther: 0, sheets: 280, sheetsExtracted: 106, sheetsPartial: 0, sheetsMissing: 92, sheetsPendingReview: 82, sheetsOther: 0, lastAt: "2026-11-05T00:00:00Z" },
  construmanager: { integrationStatus: "CONECTADO", lastRunStatus: "SUCESSO", lastRunAt: "2026-11-11T19:35:58Z", stored: 2, pending: 201, humanDecision: 0, other: 0 },
  ssma: { integrationStatus: "CONECTADO", lastSyncAt: null, lastCheckAt: null, lastCheckError: false, submissions: 0, photos: 0, photosSynced: 0, photosFailed: 0, photosPending: 0 },
  ...over,
});
const rows = (over) => Object.fromEntries(buildSharedSourceRows(evidence({ shared: shared(over) }), NOW).map((r) => [r.key, r]));

check("semanais: estados pendentes/parciais/ausentes mantêm vermelho e discriminam quantidades; só 100% extraído fica verde", () => {
  const r = rows().semanal;
  ok(!r.collection.ok && !r.availability.ok, "não pode ficar verde");
  ok(/56 \(4 extraídos, 2 parciais, 50 em revisão humana, 0 outros\/erro\)/.test(r.collection.reason) && /280 \(106 extraídas, 0 parciais, 92 ausentes, 82 em revisão humana/.test(r.collection.reason), r.collection.reason);
  ok(/106 planilhas disponíveis/.test(r.availability.reason), "quantidade disponível");
  const full = rows({ weekly: { workbooks: 3, workbooksExtracted: 3, workbooksPartial: 0, workbooksPendingReview: 0, workbooksOther: 0, sheets: 12, sheetsExtracted: 12, sheetsPartial: 0, sheetsMissing: 0, sheetsPendingReview: 0, sheetsOther: 0, lastAt: "2026-11-05T00:00:00Z" } }).semanal;
  ok(full.collection.ok && full.availability.ok, "completo deve ser verde");
  const zero = rows({ weekly: { workbooks: 0, workbooksExtracted: 0, workbooksPartial: 0, workbooksPendingReview: 0, workbooksOther: 0, sheets: 0, sheetsExtracted: 0, sheetsPartial: 0, sheetsMissing: 0, sheetsPendingReview: 0, sheetsOther: 0, lastAt: null } }).semanal;
  ok(!zero.connection.ok && !zero.collection.ok && !zero.availability.ok, "zero documentos nunca é verde");
  const err = rows({ weekly: { ...shared().weekly, workbooks: 1, workbooksExtracted: 0, workbooksPartial: 0, workbooksPendingReview: 0, workbooksOther: 1, sheets: 1, sheetsExtracted: 1, sheetsPendingReview: 0, sheetsMissing: 0 } }).semanal;
  ok(!err.collection.ok, "pacote com erro/outro estado impede verde");
});
check("Construmanager: catálogo conectado não comprova conteúdo; pendentes e zero documentos ficam vermelhos; armazenado não é disponível", () => {
  const r = rows().construmanager;
  ok(r.connection.ok, "catálogo conectado é verde apenas na etapa de conexão");
  ok(!r.collection.ok && /2 armazenados; 201 pendentes/.test(r.collection.reason), r.collection.reason);
  ok(!r.availability.ok && /extração e processamento/i.test(r.availability.reason), "disponibilidade exige prova de extração");
  const done = rows({ construmanager: { ...shared().construmanager, stored: 203, pending: 0 } }).construmanager;
  ok(done.collection.ok && !done.availability.ok, "download completo é verde, mas disponibilidade segue sem prova de extração");
  const zero = rows({ construmanager: { ...shared().construmanager, stored: 0, pending: 0 } }).construmanager;
  ok(!zero.collection.ok && zero.collection.label === "Zero documentos", "zero documentos");
  ok(!rows({ construmanager: { ...shared().construmanager, stored: 5, pending: 0, other: 2 } }).construmanager.collection.ok, "erro impede verde");
  ok(!rows({ construmanager: { ...shared().construmanager, stored: 5, pending: 0, humanDecision: 1 } }).construmanager.collection.ok, "decisão humana pendente impede verde");
});
check("SSMA: 'CONECTADO' sozinho não comprova; exige verificação, fotos sincronizadas com arquivo e registros", () => {
  const s0 = rows().ssma;
  ok(!s0.connection.ok && !s0.collection.ok && !s0.availability.ok && /sozinho não comprova/.test(s0.connection.reason), "conectado sem evidência deve ser vermelho");
  const good = rows({ ssma: { integrationStatus: "CONECTADO", lastSyncAt: "2026-11-10T12:00:00Z", lastCheckAt: "2026-11-10T11:00:00Z", lastCheckError: false, submissions: 21, photos: 22, photosSynced: 22, photosFailed: 0, photosPending: 0 } }).ssma;
  ok(good.connection.ok && good.collection.ok && good.availability.ok, "com evidências completas deve ser verde");
  const failing = rows({ ssma: { integrationStatus: "CONECTADO", lastSyncAt: "2026-11-10T12:00:00Z", lastCheckAt: "2026-11-10T11:00:00Z", lastCheckError: false, submissions: 21, photos: 34, photosSynced: 22, photosFailed: 12, photosPending: 0 } }).ssma;
  ok(!failing.collection.ok && /12 com falha/.test(failing.collection.reason) && !failing.availability.ok, "falhas mantêm vermelho");
  ok(!rows({ ssma: { ...good.__ignored, integrationStatus: "CONECTADO", lastSyncAt: "x", lastCheckAt: "2026-11-10T11:00:00Z", lastCheckError: true, submissions: 1, photos: 1, photosSynced: 1, photosFailed: 0, photosPending: 0 } }).ssma.connection.ok, "erro na última verificação impede verde");
});
check("Diário: execução antiga ou com erro não é 'coletando'; zero novos com execução recente é verde", () => {
  ok(rows().diario.collection.ok && rows().diario.availability.ok, "execução recente sem erro");
  ok(!rows({ diario: { ...shared().diario, lastRunAt: "2026-11-01T00:00:00Z" } }).diario.collection.ok, "execução antiga");
  ok(!rows({ diario: { ...shared().diario, lastRunErrors: 2 } }).diario.connection.ok, "execução com erros");
  ok(!rows({ diario: { ...shared().diario, reports: 0 } }).diario.availability.ok, "zero relatórios");
});
check("fontes compartilhadas nunca são atribuídas individualmente: aviso presente em todas e evidência traz data", () => {
  const all = Object.values(rows());
  ok(all.every((r) => r.facts.some((f) => /não prova conta individual/.test(f))), "aviso ausente");
  ok(rows().construmanager.connection.at === "2026-11-11T19:35:58Z", "data da evidência");
});
check("consultas compartilhadas indisponíveis (null) => vermelho 'Sem comprovação'", () => {
  const all = Object.values(rows({ diario: null, weekly: null, construmanager: null, ssma: null }));
  ok(all.every((r) => !r.connection.ok && !r.collection.ok && !r.availability.ok), "verde sem consulta");
});
check("papéis independentes: receber alerta não torna ninguém fonte, e fornecer não implica receber", () => {
  const members = [{ userId: "u1", status: "ACTIVE", area: null, user: { name: "A", email: "a@axion.com.br" } }, { userId: "u2", status: "ACTIVE", area: null, user: { name: "B", email: "b@axion.com.br" } }];
  const ev = { ...evidence(), alertRecipientUserIds: ["u2"], mailboxes: [{ ...mailbox(), mailbox: "a@axion.com.br" }] };
  const rows = Object.fromEntries(buildUserSourceRows(members, ev, NOW).map((r) => [r.userId, r]));
  ok(rows.u1.providesInformation === true && rows.u1.receivesAlerts === false, "u1");
  ok(rows.u2.providesInformation === false && rows.u2.receivesAlerts === true, "u2");
  ok(rows.u2.overall.ok === false, "overall");
  const unknown = buildUserSourceRows(members, { ...ev, alertRecipientUserIds: null }, NOW);
  ok(unknown.every((r) => r.receivesAlerts === null), "null");
});
console.log(`\n${passed} OK, ${failed} falha(s)`); process.exit(failed ? 1 : 0);
