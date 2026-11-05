// Notificações por e-mail dos registros de campo SSMA (registro CRÍTICO e ação corretiva em ATRASO): destinatários,
// envio com as travas do piloto (FakeEmailProvider aplica o MESMO guard do provedor real), dedupe, concorrência,
// falha com nova tentativa, ausência de destinatário, aviso visível e verificações estruturais (auditoria, fail-closed).
// Nenhum e-mail real, nenhuma rede. Uso: node scripts/test-ssma-field-notifications.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

// Circuito fechado: modo piloto, destinatário único do piloto e trava de destino único.
process.env.ACC_OUTBOUND_MODE = "pilot";
process.env.ACC_PILOT_RECIPIENT = "crm@axion.com.br";
process.env.ACC_EMAIL_ONLY_RECIPIENT = "crm@axion.com.br";
process.env.AXION_EMAIL_PROVIDER = "fake";
delete process.env.ACC_PROJECT_PILOT_PROJECT_ID;

register("./ts-module-resolver.mjs", import.meta.url);
const core = await import("../apps/web/lib/ssma/field-notifications/core.ts");
const { buildCriticalRecordEmail, buildOverdueActionEmail } = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const { describeNotification, groupNotificationRows } = await import("../apps/web/lib/ssma/field-notifications/view.ts");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider.ts");
const { notifyEvent, resolveRecipients, MAX_ATTEMPTS, safeErrorMessage, isOverdue, saoPauloDate } = core;

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const member = (userId, over = {}) => ({ userId, name: userId, email: `${userId}@axion.exemplo`, area: null, permission: "COLABORADOR", status: "ACTIVE", ...over });
const KEY = { projectId: "p1", recordId: "r1", actionId: "a1", event: "CRITICAL_RECORD", eventDate: "2026-11-05" };

// Armazenamento falso com a MESMA semântica do banco (unique, claim atômico).
function fakeStore() {
  const rows = new Map();
  const k = (key, email) => `${key.recordId}|${key.event}|${key.eventDate}|${email}`;
  let seq = 0;
  return {
    rows,
    async ensureDelivery(key, rcpt) { const id = k(key, rcpt.email); if (!rows.has(id)) rows.set(id, { id, status: "PENDING", attemptCount: 0, claimed: false, key }); const r = rows.get(id); return { id, status: r.status, attemptCount: r.attemptCount }; },
    async ensureSuppressed(key, reason) { const id = k(key, core.NO_RECIPIENT_PLACEHOLDER); if (!rows.has(id)) rows.set(id, { id, status: "SUPPRESSED", attemptCount: 0, reason, key }); },
    async claim(id) { const r = rows.get(id); if (!r || r.claimed || !["PENDING", "FAILED"].includes(r.status)) return false; r.claimed = true; r.attemptCount += 1; return true; },
    async markSent(id) { const r = rows.get(id); r.status = "SENT"; r.claimed = false; },
    async markFailed(id, error) { const r = rows.get(id); r.status = "FAILED"; r.claimed = false; r.error = error; },
    seq: () => ++seq,
  };
}
function setup({ failFor = new Set(), delayMs = 0 } = {}) {
  const store = fakeStore();
  const guarded = [];
  const provider = new FakeEmailProvider({ onGuardedInput: (i) => guarded.push(i), shouldFail: (i) => failFor.has(i.to) });
  const audits = [];
  const mailer = {
    async deliver({ to, content, projectId, correlationId }) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const result = await provider.send({ to, subject: content.subject, text: content.text, html: content.html, correlationId, vera: { projectId, context: "ssma" } });
      return { providerMessageId: result.providerMessageId, sentAt: result.sentAt };
    },
  };
  const deps = { store, mailer, audit: async (e) => void audits.push(e) };
  return { store, guarded, audits, deps, failFor };
}
const content = () => buildCriticalRecordEmail({ projectName: "O1 — Obra 1", recipientName: "Ana", category: "EPI", location: "Bloco A", description: "Operário sem capacete <b>x</b>", occurredAt: "05/11/2026 10:00", reportedByName: "Bruno", accUrl: "https://acc.exemplo.invalid/p1/ssma-registros" });

console.log("\n======================================\nSSMA — NOTIFICAÇÕES DE CAMPO (e-mail, circuito fechado)\n======================================");

await check("destinatários: ativos (não LEITURA) das áreas Engenharia e SSMA/ESG + responsável; inativo, leitura e sem e-mail excluídos; sem duplicar", () => {
  const members = [
    member("eng", { area: "ENGENHARIA" }), member("ssma", { area: "ESG_SSMA" }), member("resp", { area: "COMERCIAL" }), member("com", { area: "COMERCIAL" }),
    member("lei", { area: "ENGENHARIA", permission: "LEITURA" }), member("off", { area: "ENGENHARIA", status: "INACTIVE" }), member("semmail", { area: "ENGENHARIA", email: " " }),
    member("dup", { area: "ESG_SSMA", email: "ENG@axion.exemplo" }), member("sem-area"),
  ];
  const crit = resolveRecipients({ event: "CRITICAL_RECORD", responsibleUserId: "resp", members });
  assert.deepEqual(crit.recipients.map((r) => r.userId).sort(), ["eng", "resp", "ssma"], "crítico");
  assert.equal(crit.withoutEmail, 1);
  const over = resolveRecipients({ event: "ACTION_OVERDUE", responsibleUserId: "resp", members });
  assert.deepEqual(over.recipients.map((r) => r.userId).sort(), ["dup", "resp", "ssma"], "atraso: responsável + SSMA/ESG (Engenharia não; o e-mail repetido só entra uma vez)");
});

await check("envio: cada destinatário recebe UM e-mail; travas do piloto aplicadas (vai só para o destinatário do piloto, assunto [TESTE CONTROLADO], sem Cc/Bcc)", async () => {
  const { deps, guarded, store } = setup();
  const recipients = [{ userId: "a", name: "Ana", email: "ana@axion.exemplo" }, { userId: "b", name: "Bruno", email: "bruno@axion.exemplo" }];
  const s = await notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "registro r1" });
  assert.deepEqual([s.sent, s.failed, s.alreadySent], [2, 0, 0]);
  assert.equal(guarded.length, 2);
  assert.ok(guarded.every((g) => g.to === "crm@axion.com.br" && /^\[TESTE CONTROLADO\] /.test(g.subject) && !g.cc && !g.bcc), "travas do piloto");
  assert.ok([...store.rows.values()].every((r) => r.status === "SENT" && r.attemptCount === 1));
});

await check("prevenção de duplicidade: repetir a solicitação (reenvio, fila offline, cron) não envia de novo", async () => {
  const { deps, guarded } = setup();
  const recipients = [{ userId: "a", name: "Ana", email: "ana@axion.exemplo" }];
  await notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "x" });
  const again = await notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "x" });
  const third = await notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "x" });
  assert.deepEqual([again.sent, again.alreadySent, third.sent, third.alreadySent], [0, 1, 0, 1]);
  assert.equal(guarded.length, 1, "um único e-mail saiu");
});

await check("concorrência: duas execuções simultâneas da mesma solicitação enviam UMA vez", async () => {
  const { deps, guarded } = setup({ delayMs: 20 });
  const recipients = [{ userId: "a", name: "Ana", email: "ana@axion.exemplo" }, { userId: "b", name: "Bruno", email: "bruno@axion.exemplo" }];
  const [x, y] = await Promise.all([notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "x" }), notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "x" })]);
  assert.equal(x.sent + y.sent, 2, "no total, 2 envios (um por destinatário)");
  assert.equal(guarded.length, 2);
});

await check("chaves distintas não se confundem: outro prazo (atraso) ou outro dia gera novo aviso; outro registro também", async () => {
  const { deps, guarded } = setup();
  const r = [{ userId: "a", name: "Ana", email: "ana@axion.exemplo" }];
  const over = { ...KEY, event: "ACTION_OVERDUE", eventDate: "2026-11-01" };
  await notifyEvent(deps, { key: over, recipients: r, content, entityLabel: "x" });
  await notifyEvent(deps, { key: over, recipients: r, content, entityLabel: "x" });
  await notifyEvent(deps, { key: { ...over, eventDate: "2026-11-08" }, recipients: r, content, entityLabel: "x" });
  await notifyEvent(deps, { key: { ...over, recordId: "r2" }, recipients: r, content, entityLabel: "x" });
  assert.equal(guarded.length, 3);
});

await check("falha do provedor: entrega FAILED com motivo limpo (sem e-mail/token), nova tentativa envia só o que falhou, auditoria registrada", async () => {
  const failFor = new Set(["falha@axion.exemplo"]);
  const { deps, store, audits, guarded } = setup({ failFor });
  const recipients = [{ userId: "a", name: "Ana", email: "ana@axion.exemplo" }, { userId: "x", name: "Falha", email: "falha@axion.exemplo" }];
  const s1 = await notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "registro r1" });
  assert.deepEqual([s1.sent, s1.failed], [1, 1]);
  const bad = [...store.rows.values()].find((r) => r.status === "FAILED");
  assert.ok(bad.error && !/@/.test(bad.error), "motivo sem e-mail");
  assert.ok(audits.some((a) => a.action === "SSMA_FIELD_NOTIFICATION_FAILED"));
  failFor.clear();
  const s2 = await notifyEvent(deps, { key: KEY, recipients, content, entityLabel: "registro r1" });
  assert.deepEqual([s2.sent, s2.alreadySent, s2.failed], [1, 1, 0], "só a falha é reenviada");
  assert.equal(guarded.length, 2);
});

await check(`limite de tentativas (${MAX_ATTEMPTS}): depois disso para de insistir (e a linha FAILED continua visível)`, async () => {
  const failFor = new Set(["falha@axion.exemplo"]);
  const { deps, store } = setup({ failFor });
  const r = [{ userId: "x", name: "X", email: "falha@axion.exemplo" }];
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await notifyEvent(deps, { key: KEY, recipients: r, content, entityLabel: "x" });
  const row = [...store.rows.values()][0];
  assert.deepEqual([row.status, row.attemptCount], ["FAILED", MAX_ATTEMPTS]);
});

await check("sem destinatário: linha SUPPRESSED (1 só), auditoria TARGET_NOT_CONFIGURED e resumo com noRecipient — nada é enviado nem engolido", async () => {
  const { deps, store, audits, guarded } = setup();
  const s = await notifyEvent(deps, { key: KEY, recipients: [], withoutEmail: 2, content, entityLabel: "registro r1" });
  const s2 = await notifyEvent(deps, { key: KEY, recipients: [], withoutEmail: 2, content, entityLabel: "registro r1" });
  assert.deepEqual([s.noRecipient, s.withoutEmail, guarded.length, store.rows.size], [true, 2, 0, 1]);
  assert.equal([...store.rows.values()][0].reason, "EMAIL_MISSING");
  assert.equal(audits.filter((a) => a.action === "SSMA_FIELD_NOTIFICATION_TARGET_NOT_CONFIGURED").length, 2);
  assert.ok(s2.noRecipient);
});

await check("falha de auditoria não derruba o envio", async () => {
  const { deps, guarded } = setup();
  deps.audit = async () => { throw new Error("audit down"); };
  const s = await notifyEvent(deps, { key: KEY, recipients: [{ userId: "a", name: "Ana", email: "ana@axion.exemplo" }], content, entityLabel: "x" });
  assert.equal(s.sent, 1); assert.equal(guarded.length, 1);
});

await check("conteúdo: fato, prazo e dias de atraso corretos; HTML escapado; diferencia fato × revisão humana", () => {
  const c = content();
  assert.match(c.subject, /^Registro crítico de campo — /);
  assert.ok(c.text.includes("Operário sem capacete <b>x</b>") && !c.html.includes("<b>x</b>") && c.html.includes("&lt;b&gt;x&lt;/b&gt;"), "escape");
  assert.match(c.text, /revisão humana/);
  const o = buildOverdueActionEmail({ projectName: "O1", recipientName: null, category: "EPI", location: "A", description: "d", occurredAt: "x", reportedByName: "Bruno", accUrl: "https://x.invalid", dueDate: "01/11/2026", daysOverdue: 4, responsibleName: "Carlos" });
  assert.match(o.subject, /^Ação corretiva em atraso — /);
  assert.ok(/Prazo da ação: 01\/11\/2026/.test(o.text) && /Dias de atraso: 4/.test(o.text) && /Responsável: Carlos/.test(o.text));
});

await check("regra de atraso e fuso: prazo vencido = antes de hoje e não concluída; dia em America/Sao_Paulo", () => {
  assert.equal(isOverdue({ status: "ABERTA", dueDate: "2026-11-04" }, "2026-11-05"), true);
  assert.equal(isOverdue({ status: "ABERTA", dueDate: "2026-11-05" }, "2026-11-05"), false);
  assert.equal(isOverdue({ status: "CONCLUIDA", dueDate: "2026-10-01" }, "2026-11-05"), false);
  assert.equal(saoPauloDate("2026-11-06T01:30:00Z"), "2026-11-05", "01:30Z ainda é 05/11 em São Paulo");
  assert.ok(!/@|ya29/.test(safeErrorMessage(new Error("falha ana@x.com ya29.abc123"))));
});

await check("aviso visível: ausência de destinatário e falha aparecem; enviado aparece como ok", () => {
  const rows = [
    { record_id: "r", event: "CRITICAL_RECORD", sent: 0, failed: 0, suppressed: 1, pending: 0 },
    { record_id: "r", event: "ACTION_OVERDUE", sent: 1, failed: 1, suppressed: 0, pending: 0 },
    { record_id: "q", event: "CRITICAL_RECORD", sent: 2, failed: 0, suppressed: 0, pending: 0 },
  ];
  const g = groupNotificationRows(rows);
  const r = describeNotification(g.get("r"));
  assert.equal(r[0].tone, "error"); assert.match(r[0].text, /NÃO enviado — nenhum destinatário/);
  assert.equal(r[1].tone, "warn"); assert.match(r[1].text, /falhou para 1/);
  assert.equal(describeNotification(g.get("q"))[0].tone, "ok");
  assert.deepEqual(describeNotification([]), []);
});

await check("estrutura: auditoria SYSTEM com actor_label nulo; sender/servidor só no servidor; cron fail-closed com Bearer e dryRun FALSO; rota exige autor/administrador; envio de campo não usa service_role no navegador", () => {
  const server = rd("apps/web/lib/ssma/field-notifications/server.ts");
  assert.ok(server.startsWith('import "server-only"') && /actor_label: null/.test(server) && !/actor_label: "/.test(server));
  const cron = rd("apps/web/app/api/cron/ssma-notifications/route.ts");
  assert.ok(cron.includes("isCronRequestAuthorized") && cron.includes('process.env.ACC_SSMA_NOTIFICATIONS_ENABLED !== "true"') && cron.includes("FakeEmailProvider") && cron.includes('"dryRun") === "1"'));
  const route = rd("apps/web/app/api/ssma/field-records/notifications/route.ts");
  assert.ok(route.includes("getAuthUser") === false && route.includes("auth.getUser()") && route.includes('permission !== "ADMINISTRADOR"') && route.includes("reported_by_user_id"));
  assert.ok(!/SUPABASE_SECRET_KEY|service_role|createSupabaseAdminClient/.test(rd("apps/web/lib/ssma/field-records/supabase-transport.ts")));
  assert.ok(!/SUPABASE_SECRET_KEY|service_role|createSupabaseAdminClient/.test(rd("apps/web/components/ssma/field-records/field-records-app.tsx")));
  const wf = rd(".github/workflows/ssma-notifications.yml");
  assert.ok(wf.includes("/api/cron/ssma-notifications") && wf.includes("Authorization: Bearer") && !/GOOGLE_|SUPABASE_/.test(wf));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
