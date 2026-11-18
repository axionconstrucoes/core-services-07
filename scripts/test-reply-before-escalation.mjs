// Resposta recebida antes do prazo × leitura atrasada × escalonamento CRÍTICO (T+61).
// Cenário pedido: alerta em T0, prazo de assunção T+60, resposta RECEBIDA pelo Gmail em T+59, leitor só PROCESSA em T+65,
// ciclo de escalonamento roda em T+61.
//   1. Com verificação pontual da caixa (credencial disponível): o escalonamento de T+61 é RETIDO (sem e-mail), com auditoria.
//   2. Sem verificação possível (credencial ausente/erro): o escalonamento segue e registra "não foi possível verificar respostas"
//      sem afirmar ausência de resposta; em T+65 o processamento registra recebimento em T+59 e a CORREÇÃO auditada.
//   3. Resposta incompleta (sem previsão): recebimento e pendência de previsão registrados separadamente.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-reply-before-escalation.mjs
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { applyEscalationReplyGate } = await import("../apps/web/lib/risk-alerts/escalation-reply-gate");
const { checkRepliesBeforeEscalation } = await import("../apps/web/lib/risk-alerts/replies/reply-verifier");
const { assessReplyTiming, hasForecast } = await import("../apps/web/lib/risk-alerts/replies/reply-timing");
const { hashReplyToken } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); }
}

const T0 = Date.parse("2026-11-18T12:00:00Z");
const at = (min) => new Date(T0 + min * 60000).toISOString();
const ms = (min) => String(T0 + min * 60000);
const MAILBOX = "crm@exemplo.invalid";
const TOKEN = "tokentokentokentoken123";

const escalationPlan = () => ({
  escalations: [{ slaActionId: "sla-1", caseKey: "K1", expectedCurrentLevel: "RESPONSAVEL", newLevel: "ESCALATION_2", reason: "assume", reasons: ["Prazo de assunção vencido."], deadlineAt: at(60) }],
  outbox: [
    { caseKey: "K1", notificationType: "ESCALATION", idempotencyKey: "K1:ESCALATION:ESCALATION_2:u2" },
    { caseKey: "K2", notificationType: "IMMEDIATE", idempotencyKey: "K2:IMMEDIATE" },
  ],
  audit: [{ action: "RISK_ALERT_DEADLINE_EXPIRED", entityType: "SLA_ACTION", entityId: "sla-1", detail: "vencido" }],
});

function fakeGmail({ threadMessages = [], plusMessages = [], profile = MAILBOX, throws = false } = {}) {
  return {
    async getProfileEmail() { if (throws) throw new Error("x"); return profile; },
    async listMessageIds() { if (throws) throw new Error("x"); return plusMessages.map((m) => m.id); },
    async getMessageMeta(id) { return plusMessages.find((m) => m.id === id) ?? null; },
    async getThreadMessages() { if (throws) throw new Error("x"); return threadMessages; },
  };
}
const lookup = (known = []) => ({
  async conversationsForCase() { return [{ providerThreadId: "th-1", replyTokenHash: hashReplyToken(TOKEN), firstSentAt: at(0) }]; },
  async knownMessageIds() { return new Set(known); },
});
const req = [{ caseKey: "K1", caseId: "case-1", projectId: "p", deadlineAt: at(60) }];
const replyT59 = { id: "m-59", internalDate: ms(59), headers: { from: "responsavel@exemplo.invalid" } };

await t("verificador: resposta na thread recebida em T+59, ainda não processada => REPLY_FOUND com a data do Gmail", async () => {
  const r = await checkRepliesBeforeEscalation(req, { gmail: fakeGmail({ threadMessages: [{ id: "out", internalDate: ms(0), headers: { from: MAILBOX } }, replyT59] }), mailbox: MAILBOX, lookup: lookup() });
  assert.deepEqual(r.get("K1"), { status: "REPLY_FOUND", receivedAt: at(59) });
});
await t("verificador: resposta via Reply-To opaco (token do caso pelo hash) => REPLY_FOUND", async () => {
  const plus = [{ id: "m-plus", internalDate: ms(58), headers: { from: "r@exemplo.invalid", to: `crm+alerta-${TOKEN}@exemplo.invalid` } }];
  const r = await checkRepliesBeforeEscalation(req, { gmail: fakeGmail({ plusMessages: plus }), mailbox: MAILBOX, lookup: lookup() });
  assert.equal(r.get("K1").status, "REPLY_FOUND");
});
await t("verificador: mensagem já registrada, da própria caixa ou recebida após o prazo não conta => NO_REPLY", async () => {
  const msgs = [replyT59, { id: "own", internalDate: ms(30), headers: { from: `ACC <${MAILBOX}>` } }, { id: "late", internalDate: ms(62), headers: { from: "r@exemplo.invalid" } }];
  const r = await checkRepliesBeforeEscalation(req, { gmail: fakeGmail({ threadMessages: msgs }), mailbox: MAILBOX, lookup: lookup(["m-59"]) });
  assert.deepEqual(r.get("K1"), { status: "NO_REPLY" });
});
await t("verificador: sem credencial, conta errada ou erro do Gmail => UNAVAILABLE (nunca NO_REPLY)", async () => {
  assert.equal((await checkRepliesBeforeEscalation(req, { gmail: null, mailbox: null, lookup: lookup() })).get("K1").status, "UNAVAILABLE");
  assert.equal((await checkRepliesBeforeEscalation(req, { gmail: fakeGmail({ profile: "outra@exemplo.invalid" }), mailbox: MAILBOX, lookup: lookup() })).get("K1").status, "UNAVAILABLE");
  assert.equal((await checkRepliesBeforeEscalation(req, { gmail: fakeGmail({ throws: true }), mailbox: MAILBOX, lookup: lookup() })).get("K1").status, "UNAVAILABLE");
});

await t("T+61 com resposta encontrada: escalonamento RETIDO — sem e-mail de escalonamento, sem DEADLINE_EXPIRED, auditoria de retenção", async () => {
  const { plan, decisions } = applyEscalationReplyGate(escalationPlan(), new Map([["K1", { status: "REPLY_FOUND", receivedAt: at(59) }]]), at(61));
  assert.equal(decisions[0].outcome, "HELD_PENDING_REPLY");
  assert.equal(plan.escalations.length, 0);
  assert.deepEqual(plan.outbox.map((o) => o.idempotencyKey), ["K2:IMMEDIATE"], "outros envios intactos");
  assert.ok(!plan.audit.some((a) => a.action === "RISK_ALERT_DEADLINE_EXPIRED"));
  assert.ok(plan.audit.some((a) => a.action === "RISK_ALERT_ESCALATION_HELD_PENDING_REPLY" && a.detail.includes(at(59))));
});
await t("retenção limitada: resposta ainda não processada 31 min após o prazo => escalonamento segue, registrando que NÃO é ausência de resposta", async () => {
  const { plan, decisions } = applyEscalationReplyGate(escalationPlan(), new Map([["K1", { status: "REPLY_FOUND", receivedAt: at(59) }]]), at(91));
  assert.equal(decisions[0].outcome, "PROCEEDED_HOLD_EXPIRED");
  assert.equal(plan.escalations.length, 1);
  assert.ok(plan.audit.some((a) => a.action === "RISK_ALERT_ESCALATION_REPLY_PENDING_PROCESSING" && /Não indica ausência/.test(a.detail)));
});
await t("T+61 sem verificação possível: escalonamento segue + 'não foi possível verificar respostas' (sem afirmar ausência)", async () => {
  const { plan, decisions } = applyEscalationReplyGate(escalationPlan(), new Map([["K1", { status: "UNAVAILABLE", reason: "credencial ausente" }]]), at(61));
  assert.equal(decisions[0].outcome, "PROCEEDED_NOT_VERIFIED");
  assert.equal(plan.escalations.length, 1);
  const note = plan.audit.find((a) => a.action === "RISK_ALERT_REPLIES_NOT_VERIFIED");
  assert.ok(note && /Não foi possível verificar respostas/.test(note.detail) && /NÃO significa que o responsável não respondeu/.test(note.detail));
});
await t("sem resposta: escalonamento segue sem auditoria extra", async () => {
  const { plan, decisions } = applyEscalationReplyGate(escalationPlan(), new Map([["K1", { status: "NO_REPLY" }]]), at(61));
  assert.equal(decisions[0].outcome, "PROCEEDED_NO_REPLY");
  assert.equal(plan.audit.length, 1);
});

const context = { assumeDueAt: at(60), respondDueAt: null, completeDueAt: null, acknowledgedAt: null, escalations: [{ toLevel: "ESCALATION_2", escalatedAt: at(61) }] };
await t("T+65 processa a resposta recebida em T+59: registra recebimento (T+59) ≠ processamento (T+65) e CORREÇÃO do escalonamento de T+61", async () => {
  const r = assessReplyTiming({ caseId: "case-1", messageId: "m-59", receivedAt: at(59), processedAt: at(65), classification: "STATUS_UPDATE", text: "Estamos tratando, conclusão até sexta 14h.", context });
  assert.equal(r.receivedBeforeDeadline, true);
  assert.equal(r.correctedEscalations, 1);
  const received = r.events.find((e) => e.action === "RISK_ALERT_REPLY_RECEIVED");
  assert.ok(received.detail.includes(`recebida em ${at(59)}`) && received.detail.includes(`processada em ${at(65)}`) && received.detail.includes("dentro do prazo"));
  const correction = r.events.find((e) => e.action === "RISK_ALERT_ESCALATION_REPLY_CORRECTION");
  assert.ok(correction && /ANTES do escalonamento/.test(correction.detail) && /não houve ausência de resposta/.test(correction.detail) && /nenhum registro apagado/.test(correction.detail));
  assert.equal(r.forecastPending, false);
});
await t("resposta incompleta (sem previsão): recebimento + pendência de previsão em registros separados", async () => {
  const r = assessReplyTiming({ caseId: "case-1", messageId: "m-2", receivedAt: at(59), processedAt: at(65), classification: "ACKNOWLEDGEMENT", text: "Ciente, vou verificar.", context: { ...context, escalations: [] } });
  assert.deepEqual(r.events.map((e) => e.action), ["RISK_ALERT_REPLY_RECEIVED", "RISK_ALERT_REPLY_FORECAST_PENDING"]);
});
await t("resposta recebida DEPOIS do escalonamento não gera correção; sem data confiável não afirma prazo", async () => {
  const late = assessReplyTiming({ caseId: "c", messageId: "m", receivedAt: at(62), processedAt: at(65), classification: "STATUS_UPDATE", text: "amanhã", context });
  assert.equal(late.correctedEscalations, 0);
  assert.equal(late.receivedBeforeDeadline, false);
  const noDate = assessReplyTiming({ caseId: "c", messageId: "m", receivedAt: null, processedAt: at(65), classification: "OTHER", text: "", context });
  assert.ok(noDate.events[0].detail.includes("sem data de recebimento confiável"));
  assert.equal(noDate.correctedEscalations, 0);
});
await t("detector de previsão", () => {
  for (const yes of ["até 20/11", "na sexta-feira", "amanhã cedo", "às 14h", "em 2 dias"]) assert.ok(hasForecast(yes), yes);
  for (const no of ["Ciente.", "Vou verificar com a equipe", "Recebido, obrigado"]) assert.ok(!hasForecast(no), no);
});

console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
