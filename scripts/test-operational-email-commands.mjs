// Comandos operacionais por e-mail (RESOLVIDO / ENVIAR PARA): parser puro + processador de respostas REAL com store em memória.
// Sem e-mail real, banco ou rede. Cobre aplicação autorizada, evidência, destinatário inelegível, remetente sem permissão,
// ambiguidade, texto citado, duplicidade, alerta já resolvido, reprocessamento após falha e confirmação de sucesso/rejeição.
// Uso: node scripts/test-operational-email-commands.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const forecastLib = await import("../apps/web/lib/risk-alerts/forecast");
const { applyAlertAction } = await import("../apps/web/lib/risk-alerts/alert-state-machine");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { SUGGESTED_INGESTION_ALERT_SEVERITY } = await import("../apps/web/lib/risk-alerts/pilot-readiness");
const { buildReplyConfirmationParts } = await import("../apps/web/lib/risk-alerts/replies/reply-confirmation");
const { buildImmediateRiskAlertEmail, formatDateTimeBR } = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails");

const { extractForecastFromText, parseForecastInput, applyForecastPrecision, resolveForecast, formatForecastLine } = forecastLib;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const readSource = (relative) => readFileSync(path.join(repoRoot, relative), "utf8").replace(/\r\n?/g, "\n");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

// ------------------------------------------------------------------ fixtures
const PROJECT = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "cccccccc-0000-4000-8000-000000000001";
const U_RESP = "aaaaaaaa-0000-4000-8000-000000000001"; // responsável (allowlist)
const U_L2 = "aaaaaaaa-0000-4000-8000-000000000002";
const U_L3 = "aaaaaaaa-0000-4000-8000-000000000003";
const U_OUT = "aaaaaaaa-0000-4000-8000-000000000009"; // membro ativo fora da allowlist
const NOW = "2026-11-18T13:00:00.000Z"; // 18/11 10:00 Brasília
const RECEIVED = "2026-11-18T12:30:00.000Z";
const TZ = "America/Sao_Paulo";
const settings = { projectId: PROJECT, timezone: TZ, businessDayStartHour: 8, businessDayEndHour: 18, updatedAt: "" };
const responsibles = [{ id: "r1", projectId: PROJECT, area: "PLANEJAMENTO", responsibleDirectUserId: U_RESP, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U_L2, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U_L3, boardInvitationId: null, boardName: null, updatedAt: "" }];
const rule = (riskLevel) => ({ id: `rule-${riskLevel}`, projectId: PROJECT, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 3, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const matrixRules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule);
const recipients = () => new Map([
  [U_RESP, { userId: U_RESP, name: "Responsavel", email: "responsavel@axion.com.br", membershipStatus: "ACTIVE" }],
  [U_L2, { userId: U_L2, name: "Nivel Dois", email: "nivel.dois@axion.com.br", membershipStatus: "ACTIVE" }],
  [U_L3, { userId: U_L3, name: "Diretoria", email: "diretoria@axion.com.br", membershipStatus: "ACTIVE" }],
  [U_OUT, { userId: U_OUT, name: "Fora", email: "fora@axion.com.br", membershipStatus: "ACTIVE" }],
]);
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: [U_RESP, U_L2, U_L3], senderDomain: "axion.com.br", severityMap: SUGGESTED_INGESTION_ALERT_SEVERITY, pilotProjectConfirmedAt: NOW };
const policyFor = (riskLevel) => resolveMatrixPolicy({ rules: matrixRules, responsibles, settings, area: "PLANEJAMENTO", riskLevel });
const snapshot = (o = {}) => ({ id: CASE_ID, projectId: PROJECT, sourceType: "SCHEDULE_COMPARISON", sourceId: "cmp-1", riskLevel: "HIGH", state: "OPEN", currentLevel: "RESPONSAVEL", topLevelReachedAt: null, currentResponsibleUserId: U_RESP, previousResponsibleUserId: null, slaActionId: "act-1", title: "Cronograma W46", reference: "W46", activeForward: null, escalatedLevels: [], ...o });
function act(action, payload = {}, o = {}) {
  const snap = o.snapshot ?? snapshot(o.snap ?? {});
  return applyAlertAction({ now: o.now ?? NOW, snapshot: snap, action, actorUserId: o.actor ?? U_RESP, origin: o.origin ?? "WEB", payload, policy: policyFor(snap.riskLevel), config, recipients: recipients(), eligibleForwardUserIds: [U_L2, U_L3] });
}
const fmt = (iso) => formatDateTimeBR(iso, TZ);

const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { parseOperationalEmailCommand } = await import("../apps/web/lib/risk-alerts/replies/operational-email-command");
const pipelineParse = (body) => pipeline.parseReplyBody(body).clean;

// ------------------------------------------------------------------ 1. parser
await check("1. Parser: RESOLVIDO e ENVIAR PARA reconhecidos só quando abrem o texto novo", () => {
  const a = parseOperationalEmailCommand("RESOLVIDO: trocado o fornecedor, foto no drive");
  assert(a.command?.kind === "RESOLVE" && /fornecedor/.test(a.command.note), JSON.stringify(a));
  const b = parseOperationalEmailCommand("Concluído - instalado e testado.");
  assert(b.command?.kind === "RESOLVE", JSON.stringify(b));
  const c = parseOperationalEmailCommand("ENVIAR PARA: nivel.dois@axion.com.br  confirme o prazo");
  assert(c.command?.kind === "FORWARD" && c.command.targetEmail === "nivel.dois@axion.com.br" && /prazo/.test(c.command.instruction), JSON.stringify(c));
  const d = parseOperationalEmailCommand("enviar para <Nivel.Dois@Axion.com.br>");
  assert(d.command?.kind === "FORWARD" && d.command.targetEmail === "nivel.dois@axion.com.br", JSON.stringify(d));
});
await check("2. Parser: negação, parcial, comando no meio, dois comandos e combinações NÃO viram comando", () => {
  for (const text of [
    "Não resolvido ainda, aguardando material",
    "Ainda não concluído",
    "RESOLVIDO: não, parcial",
    "Estamos tratando. RESOLVIDO amanhã",
    "RESOLVIDO\nENVIAR PARA: nivel.dois@axion.com.br",
    "Resolvido, mas há impedimento no fornecedor",
    "Resolvido e encaminho ao gerente",
    "Em andamento. Conclusão prevista para 20/11/2026 às 15h.",
    "",
  ]) {
    assert(parseOperationalEmailCommand(text).command === null, `deveria ser null: ${text}`);
  }
});
await check("3. Parser: texto citado não é comando (só o texto novo conta)", () => {
  const body = "Em andamento.\n\nEm ter., 17 de nov. de 2026 às 10:00, ACC escreveu:\n> RESOLVIDO: teste\n> ENVIAR PARA: x@axion.com.br";
  const clean = pipelineParse(body);
  assert(parseOperationalEmailCommand(clean).command === null, clean);
});

// ------------------------------------------------------------------ 2. processador real
function makeStore({ riskLevel = "MEDIUM", inbound, state = "OPEN", failApplyOnce = false }) {
  const calls = { applied: [], updates: [], audits: [], confirmations: [] };
  let failures = failApplyOnce ? 1 : 0;
  const caseRecord = { id: CASE_ID, area: "PLANEJAMENTO", riskLevel, status: "OPEN", state, visibleCode: "ABCD1234" };
  const store = {
    async listInboundToProcess() { return inbound; },
    async loadProjectSnapshot() { return { config, recipients: recipients(), matrixRules, areaResponsibles: responsibles, settings }; },
    async loadCorrelationIndex() { return { byMessageId: new Map([["<root@acc>", CASE_ID]]), byReplyTokenHash: new Map(), byVisibleCode: new Map(), seenMessageIds: new Set() }; },
    async updateInboundMessage(id, patch) { calls.updates.push({ id, ...patch }); },
    async loadCaseSnapshotForAction() { return { snapshot: snapshot({ riskLevel, state }), record: caseRecord, alertRecipientUserIds: [U_RESP, U_L2] }; },
    async audit(_p, events) { calls.audits.push(...events); },
    async applyTransition(caseId, transition) {
      if (failures > 0) { failures -= 1; throw new Error("falha simulada do banco"); }
      calls.applied.push({ caseId, transition });
      return { state: transition.caseUpdate.state, escalationId: null };
    },
    async loadCaseForecastEvents() { return []; },
    async recordForecastReply() {},
    async enqueueReplyConfirmation(_p, _c, entry) { calls.confirmations.push(entry); },
  };
  return { store, calls };
}
const inboundMsg = (o = {}) => ({ id: o.id ?? "in-1", projectId: PROJECT, providerMessageId: o.id ?? "in-1", receivedAt: RECEIVED, bodyOriginal: o.body, headers: { from: o.from ?? "responsavel@axion.com.br", to: ["crm+alerta-tok@axion.com.br"], messageId: o.messageId ?? `<${o.id ?? "in-1"}@mail>`, inReplyTo: "<root@acc>", references: [], subject: "RE: alerta", autoSubmitted: null } });
const run = (store) => processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);

await check("4. RESOLVIDO (MÉDIO) por remetente autorizado => RESOLVED aplicado, confirmação na MESMA transação", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg({ body: "RESOLVIDO: item entregue e conferido" })] });
  const r = await run(store);
  assert(r.applied === 1 && calls.applied.length === 1, JSON.stringify(r));
  const t = calls.applied[0].transition;
  assert(t.action === "RESOLVED" && t.caseUpdate.state === "RESOLVED" && t.caseUpdate.slaActionStatus === "COMPLETED", JSON.stringify(t.caseUpdate));
  const conf = t.outbox.find((e) => e.idempotencyKey === `${CASE_ID}:REPLY_CONFIRMATION:msg-in-1`);
  assert(conf && conf.payloadSummary.statusLabel === "Resolvido" && !conf.payloadSummary.rejected, JSON.stringify(conf));
  assert(calls.confirmations.length === 0, "a confirmação de sucesso vai na transição, não separada");
});
await check("5. RESOLVIDO (ALTO) sem evidência => rejeitado: nada aplicado, confirmação de REJEIÇÃO (sem falso sucesso)", async () => {
  const { store, calls } = makeStore({ riskLevel: "HIGH", inbound: [inboundMsg({ body: "RESOLVIDO" })] });
  const r = await run(store);
  assert(calls.applied.length === 0 && r.applied === 0, JSON.stringify(r));
  assert(calls.confirmations.length === 1 && calls.confirmations[0].payloadSummary.rejected === true && calls.confirmations[0].payloadSummary.rejectionCode === "JUSTIFICATION_REQUIRED", JSON.stringify(calls.confirmations));
  const parts = buildReplyConfirmationParts(calls.confirmations[0].payloadSummary, { timeZone: TZ, formatDate: fmt, responsibleName: "Responsavel" });
  const text = [...parts.rows.map((x) => x.join(": ")), ...parts.paragraphs].join("\n");
  assert(/NÃO aplicado/.test(text) && /EVIDÊNCIA|evidência/i.test(text), text);
  assert(calls.audits.some((a) => a.action === "RISK_ALERT_EMAIL_COMMAND_REJECTED"));
  assert(/rejeitado/.test(calls.updates.at(-1).statusReason));
});
await check("6. RESOLVIDO (ALTO) com evidência no texto => sem falso sucesso (RESOLVED ou resolução proposta, conforme a Matriz)", async () => {
  const { store, calls } = makeStore({ riskLevel: "HIGH", inbound: [inboundMsg({ body: "RESOLVIDO: medição refeita, relatório 123 no drive" })] });
  await run(store);
  assert(calls.applied.length === 1, JSON.stringify(calls.confirmations));
  const t = calls.applied[0].transition;
  const conf = t.outbox.find((e) => e.notificationType === "ACTION_CONFIRMATION");
  assert(["RESOLVED", "RESOLUTION_PROPOSED"].includes(t.caseUpdate.state) && conf.payloadSummary.toState === t.caseUpdate.state, JSON.stringify(t.caseUpdate));
  if (t.caseUpdate.state === "RESOLUTION_PROPOSED") assert(/aguardando revisão humana/.test(conf.payloadSummary.statusLabel), "resolução proposta deve dizer que aguarda revisão");
});
await check("7. ENVIAR PARA membro elegível => FORWARD aplicado, responsável muda, encaminhado notificado, autor confirmado", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg({ body: "ENVIAR PARA: nivel.dois@axion.com.br favor assumir" })] });
  const r = await run(store);
  assert(r.applied === 1 && calls.applied.length === 1, JSON.stringify(r));
  const t = calls.applied[0].transition;
  assert(t.action === "FORWARD" && t.forward.toUserId === U_L2 && t.forward.fromUserId === U_RESP && t.caseUpdate.currentResponsibleUserId === U_L2, JSON.stringify(t.forward));
  assert(t.outbox.some((e) => e.notificationType === "FORWARD" && e.recipientUserId === U_L2));
  assert(t.outbox.some((e) => e.idempotencyKey === `${CASE_ID}:REPLY_CONFIRMATION:msg-in-1` && e.recipientUserId === U_RESP));
});
await check("8. ENVIAR PARA desconhecido, externo ou o próprio remetente => rejeitado com confirmação; nada aplicado", async () => {
  for (const [id, body] of [["x1", "ENVIAR PARA: ninguem@axion.com.br"], ["x2", "ENVIAR PARA: alguem@gmail.com"], ["x3", "ENVIAR PARA: responsavel@axion.com.br"]]) {
    const { store, calls } = makeStore({ inbound: [inboundMsg({ id, body })] });
    await run(store);
    assert(calls.applied.length === 0, `${id} aplicou`);
    assert(calls.confirmations.length === 1 && calls.confirmations[0].payloadSummary.rejected === true, `${id}: ${JSON.stringify(calls.confirmations)}`);
  }
});
await check("9. Remetente SEM permissão (fora do alerta/allowlist ou domínio externo) => nada aplicado, nenhuma confirmação", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg({ id: "u1", from: "fora@axion.com.br", body: "RESOLVIDO: ok" }), inboundMsg({ id: "u2", from: "x@gmail.com", body: "ENVIAR PARA: nivel.dois@axion.com.br" })] });
  const r = await run(store);
  assert(calls.applied.length === 0 && calls.confirmations.length === 0 && r.unauthorized === 2, JSON.stringify(r));
});
await check("10. Resposta AMBÍGUA (resolvido + encaminho / dois comandos / impedimento) => revisão humana, nada aplicado", async () => {
  const bodies = ["Resolvido e encaminho ao gerente", "RESOLVIDO\nENVIAR PARA: nivel.dois@axion.com.br", "Concluído e há impedimento no fornecedor"];
  const { store, calls } = makeStore({ inbound: bodies.map((body, i) => inboundMsg({ id: `m${i}`, body })) });
  const r = await run(store);
  assert(calls.applied.length === 0 && r.reviewRequired === 3, JSON.stringify(r));
  assert(calls.updates.every((u) => u.status === "REVIEW_REQUIRED"));
});
await check("11. Duplicada (mesmo Message-ID) => aplicada uma vez; segunda ignorada", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg({ id: "d1", messageId: "<dup@x>", body: "RESOLVIDO: ok" }), inboundMsg({ id: "d2", messageId: "<dup@x>", body: "RESOLVIDO: ok" })] });
  const r = await run(store);
  assert(calls.applied.length === 1 && r.ignored === 1, JSON.stringify(r));
});
await check("12. Alerta JÁ resolvido => novo RESOLVIDO rejeitado (ALREADY_RESOLVED), sem novo evento", async () => {
  const { store, calls } = makeStore({ state: "RESOLVED", inbound: [inboundMsg({ body: "RESOLVIDO: de novo" })] });
  await run(store);
  assert(calls.applied.length === 0 && calls.confirmations[0]?.payloadSummary.rejectionCode === "ALREADY_RESOLVED", JSON.stringify(calls.confirmations));
});
await check("13. Falha ao persistir => revisão (sem confirmação de sucesso); reprocessar a mesma mensagem aplica UMA vez", async () => {
  const { store, calls } = makeStore({ failApplyOnce: true, inbound: [inboundMsg({ body: "RESOLVIDO: ok" })] });
  const first = await run(store);
  assert(first.applied === 0 && first.reviewRequired === 1 && calls.applied.length === 0 && calls.confirmations.length === 0, JSON.stringify(first));
  assert(calls.updates.at(-1).status === "REVIEW_REQUIRED");
  const second = await run(store);
  assert(second.applied === 1 && calls.applied.length === 1, JSON.stringify(second));
  assert(calls.applied[0].transition.outbox.filter((e) => e.idempotencyKey.includes(":REPLY_CONFIRMATION:")).length === 1);
});
await check("14. Texto citado com RESOLVIDO não executa; 'Em andamento' novo segue o fluxo existente", async () => {
  const body = "Em andamento. Conclusão prevista para 20/11/2026 às 15h.\n\nEm ter., 17 de nov. de 2026 às 10:00, ACC escreveu:\n> RESOLVIDO: teste";
  const { store, calls } = makeStore({ riskLevel: "HIGH", inbound: [inboundMsg({ body })] });
  await run(store);
  assert(calls.applied.length === 1 && calls.applied[0].transition.action === "TAKING_ACTION", JSON.stringify(calls.applied.map((a) => a.transition.action)));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
