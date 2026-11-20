// Previsão de término e resposta direta por e-mail — executa as funções REAIS (puras) e o
// processador de respostas REAL com uma store em memória. Nenhum e-mail real, nenhum banco.
//
// Cobre: status + previsão (data e horário), data sem horário em ALTO/CRÍTICO, sem data,
// ambígua/contraditória, histórico citado ignorado, remetente não autorizado, duplicada,
// fora de ordem, MÉDIO/BAIXO só registro, escalonamento com status/previsão visíveis,
// previsão vencida sem resolução, confirmação ao responsável (uma por mensagem, após a
// persistência), prazos SLA intocados.
//
// Uso: node scripts/test-risk-alert-forecast.mjs

import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const forecastLib = await import("../apps/web/lib/risk-alerts/forecast");
const { applyAlertAction } = await import("../apps/web/lib/risk-alerts/alert-state-machine");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { SUGGESTED_INGESTION_ALERT_SEVERITY } = await import("../apps/web/lib/risk-alerts/pilot-readiness");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
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

// ------------------------------------------------------------------ 1. extração
await check("1. Extrai data E horário do corpo ('Conclusão prevista para 20/11/2026 às 15h') no fuso de Brasília", () => {
  const r = extractForecastFromText("Em andamento. Conclusão prevista para 20/11/2026 às 15h.", RECEIVED);
  assert(r.status === "VALID" && r.hasTime === true, JSON.stringify(r));
  assert(r.iso === "2026-11-20T18:00:00.000Z", r.iso);
  const r2 = extractForecastFromText("Tomando providências, previsão: 21/11 15:30", RECEIVED);
  assert(r2.status === "VALID" && r2.iso === "2026-11-21T18:30:00.000Z" && r2.hasTime, JSON.stringify(r2));
  const r3 = extractForecastFromText("Providenciando; término previsto para 22/11/2026 às 9h45", RECEIVED);
  assert(r3.status === "VALID" && r3.iso === "2026-11-22T12:45:00.000Z", JSON.stringify(r3));
});
await check("2. Só data: VÁLIDA para MÉDIO/BAIXO (fim do dia); ALTO/CRÍTICO exigem horário (TIME_REQUIRED)", () => {
  const r = extractForecastFromText("Em andamento, previsão 25/11/2026", RECEIVED);
  assert(r.status === "VALID" && r.hasTime === false && r.iso === "2026-11-26T02:59:00.000Z", JSON.stringify(r));
  assert(applyForecastPrecision(r, "RECORD_ONLY").status === "VALID");
  const tracked = applyForecastPrecision(r, "TRACKED");
  assert(tracked.status === "INVALID" && tracked.reason === "TIME_REQUIRED");
});
await check("3. Sem data / data solta sem expressão de previsão => MISSING (nunca adivinha)", () => {
  assert(extractForecastFromText("Estamos providenciando.", RECEIVED).status === "MISSING");
  assert(extractForecastFromText("Em andamento. Reunião ocorreu em 10/11.", RECEIVED).status === "MISSING");
});
await check("4. Datas contraditórias => AMBIGUOUS; mesma data repetida => válida", () => {
  const amb = extractForecastFromText("Previsão 20/11/2026 às 15h, mas talvez conclusão em 22/11/2026 às 10h.", RECEIVED);
  assert(amb.status === "INVALID" && amb.reason === "AMBIGUOUS", JSON.stringify(amb));
  const same = extractForecastFromText("Previsão 20/11/2026 às 15h. Confirmo conclusão em 20/11/2026 às 15h.", RECEIVED);
  assert(same.status === "VALID", JSON.stringify(same));
});
await check("5. Data passada (em relação ao recebimento) => PAST; dia inválido (31/02) => UNPARSEABLE", () => {
  const past = extractForecastFromText("Previsão: 10/11/2026 às 10h", RECEIVED);
  assert(past.status === "INVALID" && past.reason === "PAST");
  const bad = extractForecastFromText("Previsão: 31/02/2027 às 10h", RECEIVED);
  assert(bad.status === "INVALID" && bad.reason === "UNPARSEABLE", JSON.stringify(bad));
});
await check("6. Campo da tela: datetime-local (Brasília) e AAAA-MM-DD; vazio => MISSING", () => {
  const r = parseForecastInput("2026-11-20T15:00", NOW);
  assert(r.status === "VALID" && r.iso === "2026-11-20T18:00:00.000Z" && r.hasTime);
  const d = parseForecastInput("2026-11-20", NOW);
  assert(d.status === "VALID" && !d.hasTime);
  assert(parseForecastInput("", NOW).status === "MISSING");
});

// ------------------------------------------------------------------ 2. máquina de estados
await check("7. TELA ALTO: data e horário => evento com forecast_at; EM ANDAMENTO não escalona extraordinariamente (critério de 18/11/2026)", () => {
  const t = act("TAKING_ACTION", { text: "Reprogramando", forecastAt: "2026-11-20T15:00" });
  assert(t.ok, t.message);
  const ev = t.events.find((e) => e.actionType === "TAKING_ACTION");
  assert(ev.forecastAt === "2026-11-20T18:00:00.000Z");
  assert(t.forecast.status === "VALID" && t.forecast.tracking === "TRACKED");
  assert(t.escalation === null && !t.outbox.some((e) => e.notificationType === "ESCALATION"), "sem escalonamento extraordinário");
  assert(t.forecast.forecastAt === ev.forecastAt, "a previsão continua registrada no evento e no resumo");
});
await check("8. TELA ALTO: só data => recusada (exige horário); data passada => recusada; sem data => aceita com pendência", () => {
  const noTime = act("TAKING_ACTION", { text: "x", forecastAt: "2026-11-20" });
  assert(!noTime.ok && noTime.code === "FORECAST_INVALID" && /horário/.test(noTime.message));
  const past = act("TAKING_ACTION", { text: "x", forecastAt: "2026-11-01T10:00" });
  assert(!past.ok && past.code === "FORECAST_INVALID");
  const none = act("TAKING_ACTION", { text: "x" });
  assert(none.ok && none.forecast.status === "PENDING" && none.events[0].forecastAt === null);
  assert(none.escalation === null && !none.caseUpdate.currentLevel, "sem data: pendência registrada, nenhum escalonamento extraordinário e nenhum prazo alterado");
});
await check("9. Previsão NÃO mexe em prazos SLA nem cancela escalonamentos (caseUpdate sem prazos; sem cancelamento)", () => {
  const t = act("TAKING_ACTION", { text: "x", forecastAt: "2026-11-20T15:00" });
  const keys = Object.keys(t.caseUpdate);
  assert(!keys.some((k) => /due|deadline|sla(?!ActionStatus)/i.test(k)), keys.join(","));
  assert(t.escalation === null && !keys.includes("currentLevel"), "não escalona extraordinariamente nem muda o nível");
  const sm = readSource("apps/web/lib/risk-alerts/alert-state-machine.ts");
  assert(!/assumeDueAt\s*=\s*forecast|respondDueAt.*forecast|completeDueAt.*forecast/.test(sm));
});
await check("10. MÉDIO pela tela: só data aceita; sem escalonamento imediato", () => {
  const t = act("TAKING_ACTION", { text: "x", forecastAt: "2026-11-25" }, { snap: { riskLevel: "MEDIUM" } });
  assert(t.ok && t.forecast.status === "VALID" && t.forecast.tracking === "RECORD_ONLY");
  assert(!t.outbox.some((e) => e.notificationType === "ESCALATION"));
});
await check("11. E-MAIL: uma confirmação por mensagem (chave pela mensagem), ao autor, avaliada pela allowlist", () => {
  const t = act("TAKING_ACTION", { text: "x", messageId: "msg-1", forecastAt: "2026-11-20T18:00:00.000Z", forecastHasTime: true, forecastReferenceAt: RECEIVED }, { origin: "EMAIL" });
  const conf = t.outbox.filter((e) => e.notificationType === "ACTION_CONFIRMATION");
  assert(conf.length === 1 && conf[0].idempotencyKey === `${CASE_ID}:REPLY_CONFIRMATION:msg-msg-1` && conf[0].recipientUserId === U_RESP && conf[0].status === "PENDING");
  assert(conf[0].payloadSummary.forecastStatus === "VALID");
  const ev = t.events.find((e) => e.actionType === "TAKING_ACTION");
  assert(ev.idempotencyKey === `${CASE_ID}:TAKING_ACTION:${U_RESP}:msg-msg-1`, "evento idempotente pela mensagem");
  const out = act("TAKING_ACTION", { text: "x", messageId: "msg-2" }, { origin: "EMAIL", actor: U_OUT });
  const c2 = out.outbox.find((e) => e.notificationType === "ACTION_CONFIRMATION");
  assert(c2.status === "SUPPRESSED" && c2.suppressionReason === "PILOT_RECIPIENT_SUPPRESSED", "fora da allowlist => suprimida");
  const web = act("TAKING_ACTION", { text: "x" });
  assert(!web.outbox.some((e) => e.notificationType === "ACTION_CONFIRMATION"), "ação pela tela não gera confirmação por e-mail");
});
await check("12. E-MAIL ALTO só com data => PENDING (TIME_REQUIRED) e confirmação pede data E horário", () => {
  const t = act("TAKING_ACTION", { text: "x", messageId: "m3", forecastAt: "2026-11-26T02:59:00.000Z", forecastHasTime: false, forecastReferenceAt: RECEIVED }, { origin: "EMAIL" });
  assert(t.ok && t.forecast.status === "PENDING" && /horário/.test(t.forecast.problem));
  const conf = t.outbox.find((e) => e.notificationType === "ACTION_CONFIRMATION");
  const parts = buildReplyConfirmationParts(conf.payloadSummary, { timeZone: TZ, formatDate: fmt, responsibleName: "Responsavel" });
  const text = [...parts.rows.map((r) => r.join(": ")), ...parts.paragraphs].join("\n");
  assert(/PENDENTE/.test(text) && /data E o horário/.test(text) && /não reiniciam prazos/.test(text), text);
});

// ------------------------------------------------------------------ 3. previsão vigente
const ev = (o) => ({ actionType: "TAKING_ACTION", forecastAt: null, effectiveAt: NOW, createdAt: NOW, actorUserId: U_RESP, text: null, ...o });
await check("13. Vigente = maior data de ORIGEM (fora de ordem não sobrescreve); alteração e justificativa visíveis", () => {
  const events = [
    ev({ forecastAt: "2026-11-25T18:00:00.000Z", effectiveAt: "2026-11-18T14:00:00.000Z", createdAt: "2026-11-18T14:01:00.000Z", text: "Fornecedor atrasou a entrega" }),
    ev({ forecastAt: "2026-11-20T18:00:00.000Z", effectiveAt: "2026-11-18T12:00:00.000Z", createdAt: "2026-11-18T15:00:00.000Z" }), // processada depois, recebida antes
  ];
  const s = resolveForecast({ events, riskLevel: "HIGH", caseClosed: false, nowIso: "2026-11-18T16:00:00.000Z" });
  assert(s.forecastAt === "2026-11-25T18:00:00.000Z" && s.previousForecastAt === "2026-11-20T18:00:00.000Z" && s.status === "ON_TRACK");
  const line = formatForecastLine(s, fmt);
  assert(/alterada/.test(line) && /Fornecedor atrasou/.test(line), line);
});
await check("14. Previsão vencida sem resolução => EXPIRED (destacada); em andamento sem data => PENDING; encerrado => CLOSED", () => {
  const s = resolveForecast({ events: [ev({ forecastAt: "2026-11-19T18:00:00.000Z" })], riskLevel: "CRITICAL", caseClosed: false, nowIso: "2026-11-20T12:00:00.000Z" });
  assert(s.status === "EXPIRED" && /VENCIDA/.test(formatForecastLine(s, fmt)));
  assert(resolveForecast({ events: [ev({})], riskLevel: "HIGH", caseClosed: false, nowIso: NOW }).status === "PENDING");
  assert(resolveForecast({ events: [], riskLevel: "HIGH", caseClosed: false, nowIso: NOW }).status === "NOT_REQUESTED");
  assert(resolveForecast({ events: [ev({ forecastAt: "2026-11-19T18:00:00.000Z" })], riskLevel: "HIGH", caseClosed: true, nowIso: NOW }).status === "CLOSED");
});
await check("15. E-mail de ESCALONAMENTO mostra que o responsável respondeu, o status e a previsão (inclusive vencida)", () => {
  const content = { kind: "ESCALATION", caseTitle: "Cronograma W46", reference: "W46", riskLevel: "HIGH", area: "PLANEJAMENTO", summary: "s", impact: "", recommendation: null, originPath: "x", slaActionId: null, levelLabel: "Escalonamento 1", previousLevelLabel: "Responsável", responsibleName: "Responsavel", deadlineLabel: "Escalonado em", deadlineAt: NOW, requiresAcknowledgment: true, requiresJustification: true, escalationReason: "Prazo da Matriz vencido", changed: false, forecastLine: "19/11/2026 15:00 (VENCIDA — informe nova previsão ou resolva)", responderLine: "Em andamento (Tomando providências) — informado por Responsavel em 18/11/2026 09:30." };
  const built = buildImmediateRiskAlertEmail({ content, projectId: PROJECT, projectName: "OBRA", recipientName: "Nivel Dois", baseUrl: "https://acc.example", timeZone: TZ, generatedAt: NOW, actionButtons: [], actionLinks: { RESOLVED: "https://acc.example/x" }, visibleCode: "ABCD1234" });
  assert(/Resposta do responsável: Em andamento/.test(built.text) && /Previsão de conclusão: 19\/11\/2026 15:00 \(VENCIDA/.test(built.text), built.text);
  assert(/data e horário/i.test(built.text), "e-mail pede a previsão com data e horário");
});

// ------------------------------------------------------------------ 4. processador real com store em memória
function makeStore({ riskLevel = "HIGH", inbound, history = [], state = "OPEN", snapshotExtra = {}, areaResponsibles = responsibles }) {
  const calls = { applied: [], updates: [], audits: [], forecastReplies: [], confirmations: [] };
  const caseRecord = { id: CASE_ID, area: "PLANEJAMENTO", riskLevel, status: "OPEN", state, visibleCode: "ABCD1234" };
  const store = {
    async listInboundToProcess() { return inbound; },
    async loadProjectSnapshot() { return { config, recipients: recipients(), matrixRules, areaResponsibles, settings, ...snapshotExtra }; },
    async loadCorrelationIndex() { return { byMessageId: new Map([["<root@acc>", CASE_ID]]), byReplyTokenHash: new Map(), byVisibleCode: new Map(), seenMessageIds: new Set() }; },
    async updateInboundMessage(id, patch) { calls.updates.push({ id, ...patch }); },
    async loadCaseSnapshotForAction() { return { snapshot: snapshot({ riskLevel, state }), record: caseRecord, alertRecipientUserIds: [U_RESP, U_L2] }; },
    async audit(_p, events) { calls.audits.push(...events); },
    async applyTransition(caseId, transition) { calls.applied.push({ caseId, transition }); return { state: transition.caseUpdate.state, escalationId: null }; },
    async loadCaseForecastEvents() { return history; },
    async recordForecastReply(input) { calls.forecastReplies.push(input); },
    async enqueueReplyConfirmation(_p, _c, entry) { calls.confirmations.push(entry); },
  };
  return { store, calls };
}
// P2: autenticação do remetente obrigatória (DMARC/DKIM alinhado, servidor confiável) — fixtures com Authentication-Results do Gmail.
const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const inboundMsg = (o = {}) => ({ id: o.id ?? "in-1", projectId: PROJECT, providerMessageId: o.id ?? "in-1", receivedAt: o.receivedAt ?? RECEIVED, bodyOriginal: o.body ?? "Em andamento. Conclusão prevista para 20/11/2026 às 15h.", headers: { from: o.from ?? "responsavel@axion.com.br", to: ["crm+alerta-tok@axion.com.br"], messageId: o.messageId ?? `<${o.id ?? "in-1"}@mail>`, inReplyTo: "<root@acc>", references: [], subject: "RE: alerta", autoSubmitted: o.autoSubmitted ?? null, authenticationResults: AUTH_OK } });

await check("16. Fluxo real: status + previsão (ALTO) => ação aplicada com previsão, confirmação na MESMA transação, auditoria", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg()] });
  const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(r.applied === 1 && calls.applied.length === 1);
  const t = calls.applied[0].transition;
  assert(t.events.find((e) => e.actionType === "TAKING_ACTION").forecastAt === "2026-11-20T18:00:00.000Z");
  assert(t.outbox.some((e) => e.idempotencyKey === `${CASE_ID}:REPLY_CONFIRMATION:msg-in-1`), "confirmação dentro da transação");
  assert(calls.audits.some((a) => a.action === "RISK_ALERT_FORECAST_RECORDED"));
  assert(/previsão de conclusão registrada/.test(calls.updates.at(-1).statusReason));
});
await check("17. Histórico citado ignorado: data só na citação NÃO vira previsão (pendência)", async () => {
  const body = "Estamos providenciando.\n\nEm ter., 17 de nov. de 2026 às 10:00, ACC escreveu:\n> Previsão: 30/11/2026 às 10h";
  const { store, calls } = makeStore({ inbound: [inboundMsg({ body })] });
  await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  const t = calls.applied[0].transition;
  assert(t.forecast.status === "PENDING" && t.events[0].forecastAt === null);
  const pending = calls.audits.filter((a) => /FORECAST_PENDING/.test(a.action));
  assert(pending.length === 1 && pending[0].action === "RISK_ALERT_REPLY_FORECAST_PENDING", "pendência de previsão = um único registro (o do #227): " + JSON.stringify(pending.map((p) => p.action)));
});
await check("17b. ALTO com data sem horário: pendência única (#227) com o motivo do extrator; data com horário => nenhuma pendência", async () => {
  const noTime = makeStore({ inbound: [inboundMsg({ body: "Em andamento, previsão 25/11/2026" })] });
  await processAlertReplies(noTime.store, PROJECT, NOW, ["crm@axion.com.br"]);
  const p1 = noTime.calls.audits.filter((a) => /FORECAST_PENDING/.test(a.action));
  assert(p1.length === 1 && /horário/.test(p1[0].detail), JSON.stringify(p1));
  const ok = makeStore({ inbound: [inboundMsg()] });
  await processAlertReplies(ok.store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(!ok.calls.audits.some((a) => /FORECAST_PENDING/.test(a.action)) && ok.calls.audits.some((a) => a.action === "RISK_ALERT_REPLY_RECEIVED"));
});
await check("18. Remetente não autorizado / resposta automática => nada aplicado nem confirmado", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg({ id: "a", from: "fora@axion.com.br" }), inboundMsg({ id: "b", autoSubmitted: "auto-replied" }), inboundMsg({ id: "c", from: "x@gmail.com" })] });
  const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(calls.applied.length === 0 && calls.confirmations.length === 0, JSON.stringify(r));
  assert(r.unauthorized === 2 && r.ignored === 1, JSON.stringify(r));
});
await check("19. Duplicada (mesmo Message-ID duas vezes no lote) => aplicada uma vez", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg({ id: "d1", messageId: "<dup@x>" }), inboundMsg({ id: "d2", messageId: "<dup@x>" })] });
  const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(calls.applied.length === 1 && r.ignored === 1, JSON.stringify(r));
});
await check("20. Fora de ordem: há atualização mais recente => só histórico + confirmação (sem alterar o alerta)", async () => {
  const history = [ev({ forecastAt: "2026-11-25T18:00:00.000Z", effectiveAt: "2026-11-18T12:50:00.000Z" })];
  const { store, calls } = makeStore({ inbound: [inboundMsg()], history });
  const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(calls.applied.length === 0 && calls.forecastReplies.length === 1 && r.recorded === 1);
  assert(calls.confirmations.length === 1 && calls.confirmations[0].payloadSummary.outOfOrder === true);
  assert(calls.audits.some((a) => a.action === "RISK_ALERT_REPLY_OUT_OF_ORDER"));
});
await check("21. MÉDIO: só data => registrada (REPLY_RECEIVED) e exibida; sem ação/escalonamento; confirmação após o registro", async () => {
  const { store, calls } = makeStore({ riskLevel: "MEDIUM", inbound: [inboundMsg({ body: "Em andamento, previsão 25/11/2026" })] });
  await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(calls.applied.length === 0 && calls.forecastReplies.length === 1 && calls.forecastReplies[0].forecastAt === "2026-11-26T02:59:00.000Z");
  assert(calls.confirmations.length === 1 && !calls.confirmations[0].idempotencyKey.includes("ESCALATION"));
});
await check("21b. Exceção do piloto por nível (#219): escalonamento por resposta usa o substituto do Nível 2, como o ciclo", async () => {
  const noLevel2 = [{ ...responsibles[0], escalation1UserId: null }];
  const override = { area: "PLANEJAMENTO", level: "LEVEL_2", recipientUserId: U_L2, reason: "piloto", setAt: NOW, setByUserId: U_L3, auditId: "aud-1" };
  const without = makeStore({ inbound: [inboundMsg()], areaResponsibles: noLevel2 });
  await processAlertReplies(without.store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(without.calls.applied[0].transition.escalation === null, "sem exceção: a resposta de andamento não escalona");
  const withOverride = makeStore({ inbound: [inboundMsg()], areaResponsibles: noLevel2, snapshotExtra: { pilotLevelOverrides: [override] } });
  await processAlertReplies(withOverride.store, PROJECT, NOW, ["crm@axion.com.br"]);
  const t = withOverride.calls.applied[0].transition;
  // EM ANDAMENTO por resposta de e-mail NÃO escalona (critério de 18/11/2026); a exceção do piloto por nível segue valendo
  // para os escalonamentos NORMAIS e para a ação OUTRO (cobertos em test-pilot-level-overrides).
  assert(t.escalation === null && !t.outbox.some((e) => e.notificationType === "ESCALATION"), JSON.stringify(t.escalation));
});
await check("21c. Área informativa (FINANCEIRO): resposta só registrada — sem ação, escalonamento nem confirmação", async () => {
  const { store, calls } = makeStore({ inbound: [inboundMsg()], snapshotExtra: { informativeAreas: ["PLANEJAMENTO"] } });
  const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"]);
  assert(r.recorded === 1 && calls.applied.length === 0 && calls.confirmations.length === 0 && /informativa/.test(calls.updates.at(-1).statusReason));
});
await check("22. Classificação: 'Tomando providências' e 'Ciente, estamos providenciando' => STATUS_UPDATE inequívoco", () => {
  const a = pipeline.classifyReply("Tomando providências.");
  assert(a.classification === "STATUS_UPDATE" && !a.ambiguous, JSON.stringify(a));
  const b = pipeline.classifyReply("Ciente, estamos providenciando.");
  assert(b.classification === "STATUS_UPDATE" && !b.ambiguous && pipeline.replyToFormalAction(b) === "TAKING_ACTION", JSON.stringify(b));
});
await check("23. Estáticos: confirmação só por outbox (worker), sem envio no processador; chaves idempotentes; FINANCEIRO não tocado", () => {
  const proc = readSource("apps/web/lib/risk-alerts/replies/process-alert-replies.ts");
  assert(!/provider\.send|sendEmail|gmail\./.test(proc), "processador nunca envia e-mail");
  const store = readSource("apps/web/lib/risk-alerts/supabase-store.ts");
  assert(store.includes('onConflict: "idempotency_key", ignoreDuplicates: true') && store.includes(":FORECAST_REPLY:msg-"));
  assert(!/FINANCEIRO/.test(readSource("apps/web/lib/risk-alerts/forecast.ts")));
});

await check("24. Dry-run da fase replies (crm@): sem --apply, escritas só em memória, SSMA não roda, store falha fechada", () => {
  const script = readSource("scripts/weekly-schedule-email-ingest.mjs");
  assert(script.includes('const repliesDryRun = args.includes("--replies-dry-run");'));
  assert(script.includes("if (repliesDryRun) {\n        // Somente memória"), "captura não grava alert_email_messages");
  assert(script.includes("gmail && mailbox && !repliesDryRun"), "SSMA não roda no dry-run");
  assert(script.includes("dry-run: chamada não permitida"), "store falha fechada");
  const wf = readSource(".github/workflows/weekly-schedule-email-ingestion.yml");
  assert(wf.includes('node scripts/weekly-schedule-email-ingest.mjs "$project_id" --phase=replies --replies-dry-run') && !/--apply --phase=replies --replies-dry-run/.test(wf));
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
