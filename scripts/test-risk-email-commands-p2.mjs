// P2 — alertas de RISCO operados pelo próprio e-mail: processador REAL (processAlertReplies) com store em memória e token
// por item em memória. Cobre: RESOLVIDO com anexo em ALTO (evidência "anexo:<sha256>:<nome>"), EM ANDAMENTO explícito com
// previsão (e incompleto => resposta pedindo, nada gravado), ENVIAR PARA por nome único/ambíguo/LEITURA, autenticação
// obrigatória com resposta explicativa, token por item do consolidado (correlação antes do legado, consumo, já usado,
// expirado), idempotência, confirmação só após gravar e limite de taxa. Sem e-mail real, banco ou rede.
// Uso: node scripts/test-risk-email-commands-p2.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { SUGGESTED_INGESTION_ALERT_SEVERITY } = await import("../apps/web/lib/risk-alerts/pilot-readiness");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { buildReplyConfirmationParts } = await import("../apps/web/lib/risk-alerts/replies/reply-confirmation");
const { createMemoryEmailReplyTokenStore, issueEmailReplyToken } = await import("../apps/web/lib/email-replies/reply-tokens");
const { SenderRateLimiter } = await import("../apps/web/lib/email-replies/sender-rate-limit");

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

const PROJECT = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "cccccccc-0000-4000-8000-000000000001";
const CASE_2 = "cccccccc-0000-4000-8000-000000000002";
const U_RESP = "aaaaaaaa-0000-4000-8000-000000000001";
const U_L2 = "aaaaaaaa-0000-4000-8000-000000000002";
const U_L3 = "aaaaaaaa-0000-4000-8000-000000000003";
const U_DIGEST = "aaaaaaaa-0000-4000-8000-000000000004"; // recebeu só o consolidado (não é destinatário do caso)
const U_LEIT = "aaaaaaaa-0000-4000-8000-000000000005";
const U_ANA1 = "aaaaaaaa-0000-4000-8000-000000000006";
const U_ANA2 = "aaaaaaaa-0000-4000-8000-000000000007";
const NOW = "2026-11-20T13:00:00.000Z";
const RECEIVED = "2026-11-20T12:30:00.000Z";
const TZ = "America/Sao_Paulo";
const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const settings = { projectId: PROJECT, timezone: TZ, businessDayStartHour: 8, businessDayEndHour: 18, updatedAt: "" };
const responsibles = [{ id: "r1", projectId: PROJECT, area: "PLANEJAMENTO", responsibleDirectUserId: U_RESP, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U_L2, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U_L3, boardInvitationId: null, boardName: null, updatedAt: "" }];
const rule = (riskLevel) => ({ id: `rule-${riskLevel}`, projectId: PROJECT, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 3, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const matrixRules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule);
const people = [
  [U_RESP, "Responsavel", "responsavel@axion.com.br", "COLABORADOR"],
  [U_L2, "Nivel Dois", "nivel.dois@axion.com.br", "COLABORADOR"],
  [U_L3, "Diretoria", "diretoria@axion.com.br", "ADMINISTRADOR"],
  [U_DIGEST, "Leitor Consolidado", "consolidado@axion.com.br", "COLABORADOR"],
  [U_LEIT, "Leo Leitura", "leo@axion.com.br", "LEITURA"],
  [U_ANA1, "Ana Lima", "ana1@axion.com.br", "COLABORADOR"],
  [U_ANA2, "Ana Lima", "ana2@axion.com.br", "COLABORADOR"],
];
const recipients = () => new Map(people.map(([userId, name, email]) => [userId, { userId, name, email, membershipStatus: "ACTIVE" }]));
const targetCandidates = people.map(([userId, name, email, permission]) => ({ userId, name, email, permission, membershipStatus: "ACTIVE" }));
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: people.map(([id]) => id), senderDomain: "axion.com.br", severityMap: SUGGESTED_INGESTION_ALERT_SEVERITY, pilotProjectConfirmedAt: NOW };
const snapshot = (o = {}) => ({ id: CASE_ID, projectId: PROJECT, sourceType: "SCHEDULE_COMPARISON", sourceId: "cmp-1", riskLevel: "HIGH", state: "OPEN", currentLevel: "RESPONSAVEL", topLevelReachedAt: null, currentResponsibleUserId: U_RESP, previousResponsibleUserId: null, slaActionId: "act-1", title: "Cronograma W46", reference: "W46", activeForward: null, escalatedLevels: [], ...o });
void resolveMatrixPolicy;

function makeStore({ riskLevel = "HIGH", inbound, state = "OPEN", failApplyOnce = false, alertRecipients = [U_RESP, U_L2] }) {
  const calls = { applied: [], updates: [], audits: [], confirmations: [], order: [] };
  let failures = failApplyOnce ? 1 : 0;
  const store = {
    async listInboundToProcess() { return inbound; },
    async loadProjectSnapshot() { return { config, recipients: recipients(), matrixRules, areaResponsibles: responsibles, settings }; },
    async loadCorrelationIndex() { return { byMessageId: new Map([["<root@acc>", CASE_ID]]), byReplyTokenHash: new Map(), byVisibleCode: new Map(), seenMessageIds: new Set() }; },
    async updateInboundMessage(id, patch) { calls.updates.push({ id, ...patch }); calls.order.push(`update:${patch.status}`); },
    async loadCaseSnapshotForAction(caseId) { return { snapshot: snapshot({ id: caseId, riskLevel, state }), record: { id: caseId, area: "PLANEJAMENTO", riskLevel, status: "OPEN", state, visibleCode: "ABCD1234" }, alertRecipientUserIds: alertRecipients }; },
    async audit(_p, events) { calls.audits.push(...events); },
    async applyTransition(caseId, transition) {
      if (failures > 0) { failures -= 1; throw new Error("falha simulada do banco"); }
      calls.applied.push({ caseId, transition });
      calls.order.push("applyTransition");
      return { state: transition.caseUpdate.state, escalationId: null };
    },
    async loadCaseForecastEvents() { return []; },
    async recordForecastReply() { calls.order.push("recordForecastReply"); },
    async enqueueReplyConfirmation(_p, _c, entry) { calls.confirmations.push(entry); calls.order.push("enqueueReplyConfirmation"); },
  };
  return { store, calls };
}
const msg = (o = {}) => ({
  id: o.id ?? "in-1",
  projectId: PROJECT,
  providerMessageId: o.providerMessageId ?? o.id ?? "in-1",
  receivedAt: o.receivedAt ?? RECEIVED,
  bodyOriginal: o.body,
  headers: { from: o.from ?? "responsavel@axion.com.br", to: o.to ?? ["crm+alerta-tok@axion.com.br"], messageId: o.messageId ?? `<${o.id ?? "in-1"}@mail>`, inReplyTo: o.inReplyTo === undefined ? "<root@acc>" : o.inReplyTo, references: [], subject: "RE: alerta", autoSubmitted: null, authenticationResults: o.auth === undefined ? AUTH_OK : o.auth },
});
const run = (store, options = {}) => processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { targetCandidates, ...options });
const SHA = "b".repeat(64);
const stored = [{ sha256: SHA, fileName: "laudo-medicao.pdf", mimeType: "application/pdf", sizeBytes: 4096, storagePath: `${PROJECT}/alertas-evidencias-email/${CASE_ID}/${SHA}-laudo-medicao.pdf` }];

// ------------------------------------------------------------------ RESOLVIDO com anexo
await check("1. RESOLVIDO (ALTO) com ANEXO => aplicado; evidence = 'anexo:<sha256>:<nome>' + texto; confirmação na mesma transação", async () => {
  const { store, calls } = makeStore({ inbound: [msg({ body: "RESOLVIDO: medição refeita, laudo anexo" })] });
  const r = await run(store, { attachmentsFor: async () => stored });
  assert(r.applied === 1 && calls.applied.length === 1, JSON.stringify(r));
  const t = calls.applied[0].transition;
  const ev = JSON.stringify(t.events ?? t);
  assert(ev.includes(`anexo:${SHA}:laudo-medicao.pdf`), `evidência sem o anexo: ${ev.slice(0, 400)}`);
  assert(["RESOLVED", "RESOLUTION_PROPOSED"].includes(t.caseUpdate.state));
  assert(calls.confirmations.length === 0 && t.outbox.some((e) => e.notificationType === "ACTION_CONFIRMATION"), "confirmação vai na transação");
});
await check("2. RESOLVIDO (ALTO) sem texto e sem anexo => rejeição pedindo o que falta; nada aplicado", async () => {
  const { store, calls } = makeStore({ inbound: [msg({ body: "RESOLVIDO: \r\n\r\n(descreva a solução e anexe a evidência)" })] });
  await run(store, { attachmentsFor: async () => [] });
  assert(calls.applied.length === 0 && calls.confirmations.length === 1 && calls.confirmations[0].payloadSummary.rejected === true, JSON.stringify(calls.confirmations));
});

// ------------------------------------------------------------------ EM ANDAMENTO explícito
await check("3. EM ANDAMENTO explícito com 'Previsão: dd/mm/aaaa hh:mm' (ALTO) => TOMANDO PROVIDÊNCIAS com previsão VÁLIDA", async () => {
  const { store, calls } = makeStore({ inbound: [msg({ body: "EM ANDAMENTO: equipe acionada para refazer a medição\nPrevisão: 25/11/2026 15:00" })] });
  const r = await run(store);
  assert(r.applied === 1 && calls.applied[0].transition.action === "TAKING_ACTION", JSON.stringify(r));
  const f = calls.applied[0].transition.forecast;
  assert(f?.status === "VALID" && f.forecastAt === "2026-11-25T18:00:00.000Z", JSON.stringify(f));
});
await check("4. EM ANDAMENTO explícito incompleto (ALTO sem horário; texto-guia sem data; sem providência) => resposta pedindo, NADA gravado", async () => {
  for (const body of ["EM ANDAMENTO: refazer medição\nPrevisão: 25/11/2026", "EM ANDAMENTO: (providência em curso)\r\nPrevisão: dd/mm/aaaa hh:mm", "EM ANDAMENTO:\nPrevisão: 25/11/2026 15:00"]) {
    const { store, calls } = makeStore({ inbound: [msg({ body })] });
    await run(store);
    assert(calls.applied.length === 0, `aplicou: ${body}`);
    const c = calls.confirmations[0];
    assert(c && c.payloadSummary.rejected && c.payloadSummary.rejectionCode === "IN_PROGRESS_INCOMPLETE" && /Previsão: dd\/mm\/aaaa hh:mm/.test(c.payloadSummary.rejectionReason), JSON.stringify(c?.payloadSummary));
  }
});
await check("5. EM ANDAMENTO explícito em MÉDIO com só a data => registrado (sem ação automática), confirmação depois do registro", async () => {
  const { store, calls } = makeStore({ riskLevel: "MEDIUM", inbound: [msg({ body: "EM ANDAMENTO: ajuste do procedimento\nPrevisão: 25/11/2026" })] });
  const r = await run(store);
  assert(r.recorded === 1 && calls.order.indexOf("recordForecastReply") < calls.order.indexOf("enqueueReplyConfirmation"), JSON.stringify(calls.order));
});

// ------------------------------------------------------------------ ENVIAR PARA por nome
await check("6. ENVIAR PARA por NOME único => FORWARD ao membro; justificativa vira a instrução", async () => {
  const { store, calls } = makeStore({ inbound: [msg({ body: "ENVIAR PARA: nivel dois\nJustificativa: frente B é dele" })] });
  const r = await run(store);
  assert(r.applied === 1 && calls.applied[0].transition.forward.toUserId === U_L2, JSON.stringify(r));
});
await check("7. ENVIAR PARA nome AMBÍGUO / perfil LEITURA / inexistente / vazio => rejeição explicada; nada aplicado", async () => {
  for (const [body, code] of [["ENVIAR PARA: Ana Lima, assumir", "TARGET_AMBIGUOUS"], ["ENVIAR PARA: Leo Leitura, assumir", "FORWARD_TARGET_INVALID"], ["ENVIAR PARA: Fulano Inexistente", "FORWARD_TARGET_INVALID"], ["ENVIAR PARA: (nome completo ou e-mail corporativo)\r\nJustificativa: ", "TARGET_MISSING"]]) {
    const { store, calls } = makeStore({ inbound: [msg({ body })] });
    await run(store);
    assert(calls.applied.length === 0 && calls.confirmations[0]?.payloadSummary.rejectionCode === code, `${body}: ${JSON.stringify(calls.confirmations[0]?.payloadSummary)}`);
  }
});

// ------------------------------------------------------------------ autenticação
await check("8. Sem Authentication-Results / servidor não confiável => NÃO autorizado, nada aplicado, resposta EXPLICATIVA ao membro (não silenciosa)", async () => {
  for (const [auth, reason] of [[null, "AUTH_MISSING"], ["evil.example; dmarc=pass header.from=axion.com.br", "AUTH_UNTRUSTED"], ["mx.google.com; dmarc=fail header.from=axion.com.br", "AUTH_FAILED"]]) {
    const { store, calls } = makeStore({ inbound: [msg({ body: "RESOLVIDO: feito", auth })] });
    const r = await run(store);
    assert(r.unauthorized === 1 && calls.applied.length === 0, JSON.stringify(r));
    assert(calls.confirmations.length === 1 && calls.confirmations[0].recipientUserId === U_RESP && calls.confirmations[0].payloadSummary.rejectionCode === reason, JSON.stringify(calls.confirmations));
    const parts = buildReplyConfirmationParts(calls.confirmations[0].payloadSummary, { timeZone: TZ, formatDate: (x) => x, responsibleName: "R" });
    assert(/NÃO aplicado/.test(JSON.stringify(parts)) && /DMARC|autentica/i.test(JSON.stringify(parts)));
    assert(calls.updates.at(-1).status === "UNAUTHORIZED_REPLY");
  }
  // Remetente desconhecido: recusa silenciosa (sem resposta a endereço não cadastrado).
  const { store, calls } = makeStore({ inbound: [msg({ body: "RESOLVIDO", from: "x@axion.com.br", auth: null })] });
  await run(store);
  assert(calls.confirmations.length === 0);
});

// ------------------------------------------------------------------ token por item
async function itemToken(caseId, recipientUserId, nowIso = NOW) {
  const tokenStore = createMemoryEmailReplyTokenStore();
  const issued = await issueEmailReplyToken(tokenStore, { projectId: PROJECT, subjectKind: "RISK_CASE", subjectId: caseId, recipientUserId, nowIso });
  return { tokenStore, issued, map: new Map(tokenStore.rows.map((r) => [r.tokenHash, r])) };
}
await check("9. Token POR ITEM do consolidado: correlaciona ANTES do legado (sem In-Reply-To), autoriza o destinatário do item e é consumido no RESOLVIDO", async () => {
  const { tokenStore, issued, map } = await itemToken(CASE_2, U_DIGEST);
  const { store, calls } = makeStore({ riskLevel: "MEDIUM", inbound: [msg({ body: "RESOLVIDO: item conferido em campo", from: "consolidado@axion.com.br", inReplyTo: null, to: [`crm+alerta-${issued.token}@axion.com.br`] })] });
  const r = await run(store, { itemReplyTokens: map, tokenStore });
  assert(r.applied === 1 && calls.applied[0].caseId === CASE_2, JSON.stringify(r));
  assert(calls.updates.at(-1).correlationMethod === "REPLY_TO_TOKEN");
  assert(tokenStore.rows[0].consumedByMessageId === "in-1", "token consumido");
});
await check("10. Token por item já usado por OUTRA mensagem / expirado => rejeição explicada; nada aplicado", async () => {
  const used = await itemToken(CASE_2, U_DIGEST);
  await used.tokenStore.consume(used.issued.tokenHash, "outra-msg");
  used.map.get(used.issued.tokenHash).consumedByMessageId = "outra-msg";
  let ctx = makeStore({ riskLevel: "MEDIUM", inbound: [msg({ body: "RESOLVIDO: ok", from: "consolidado@axion.com.br", inReplyTo: null, to: [`crm+alerta-${used.issued.token}@axion.com.br`] })] });
  await run(ctx.store, { itemReplyTokens: used.map, tokenStore: used.tokenStore });
  assert(ctx.calls.applied.length === 0 && ctx.calls.confirmations[0]?.payloadSummary.rejectionCode === "TOKEN_ALREADY_USED", JSON.stringify(ctx.calls.confirmations));
  const old = await itemToken(CASE_2, U_DIGEST, "2026-10-01T00:00:00.000Z");
  ctx = makeStore({ riskLevel: "MEDIUM", inbound: [msg({ body: "RESOLVIDO: ok", from: "consolidado@axion.com.br", inReplyTo: null, to: [`crm+alerta-${old.issued.token}@axion.com.br`] })] });
  await run(ctx.store, { itemReplyTokens: old.map, tokenStore: old.tokenStore });
  assert(ctx.calls.applied.length === 0 && ctx.calls.confirmations[0]?.payloadSummary.rejectionCode === "TOKEN_EXPIRED");
});
await check("11. Remetente que NÃO é o destinatário do item nem do caso => NOT_RECIPIENT (o token não autoriza terceiros)", async () => {
  const { map, tokenStore, issued } = await itemToken(CASE_2, U_DIGEST);
  const { store, calls } = makeStore({ inbound: [msg({ body: "RESOLVIDO: ok", from: "ana1@axion.com.br", inReplyTo: null, to: [`crm+alerta-${issued.token}@axion.com.br`] })] });
  const r = await run(store, { itemReplyTokens: map, tokenStore });
  assert(r.unauthorized === 1 && calls.applied.length === 0 && calls.updates.at(-1).statusReason === "NOT_RECIPIENT", JSON.stringify(calls.updates.at(-1)));
});

// ------------------------------------------------------------------ idempotência / confirmação após gravar / taxa
await check("12. Idempotência: a MESMA mensagem duas vezes no lote => aplicada uma vez; consumo do token pela mesma mensagem é idempotente", async () => {
  const { map, tokenStore, issued } = await itemToken(CASE_ID, U_RESP);
  const twice = [msg({ id: "d1", messageId: "<dup@x>", body: "RESOLVIDO: ok conferido", inReplyTo: null, to: [`crm+alerta-${issued.token}@axion.com.br`] }), msg({ id: "d2", providerMessageId: "d1", messageId: "<dup@x>", body: "RESOLVIDO: ok conferido", inReplyTo: null, to: [`crm+alerta-${issued.token}@axion.com.br`] })];
  const { store, calls } = makeStore({ riskLevel: "MEDIUM", inbound: twice });
  const r = await run(store, { itemReplyTokens: map, tokenStore });
  assert(calls.applied.length === 1 && r.ignored === 1, JSON.stringify(r));
  assert(await tokenStore.consume(issued.tokenHash, "d1", NOW) === true);
});
await check("13. Falha ao gravar => sem confirmação, token LIBERADO; nova rodada aplica e confirma uma vez", async () => {
  const { map, tokenStore, issued } = await itemToken(CASE_ID, U_RESP);
  const { store, calls } = makeStore({ riskLevel: "MEDIUM", failApplyOnce: true, inbound: [msg({ body: "RESOLVIDO: ok", inReplyTo: null, to: [`crm+alerta-${issued.token}@axion.com.br`] })] });
  const first = await run(store, { itemReplyTokens: map, tokenStore });
  assert(first.applied === 0 && calls.confirmations.length === 0 && tokenStore.rows[0].consumedByMessageId === null, JSON.stringify({ first, tok: tokenStore.rows[0] }));
  const second = await run(store, { itemReplyTokens: map, tokenStore });
  assert(second.applied === 1 && calls.applied.length === 1 && calls.applied[0].transition.outbox.filter((e) => e.idempotencyKey.includes(":REPLY_CONFIRMATION:")).length === 1);
});
await check("14. Limite por remetente/hora: excedente vai à revisão humana (nada aplicado, sem resposta), demais seguem; resultado de cada mensagem é registrado", async () => {
  const inbound = [1, 2, 3].map((i) => msg({ id: `r${i}`, messageId: `<r${i}@x>`, body: "EM ANDAMENTO: troca\nPrevisão: 25/11/2026 15:00", receivedAt: `2026-11-20T12:3${i}:00.000Z` }));
  const { store, calls } = makeStore({ inbound });
  const logged = [];
  const r = await run(store, { senderRateLimiter: new SenderRateLimiter(2), onMessageProcessed: async (e) => logged.push(e) });
  assert(r.rateLimited === 1 && calls.applied.length === 2, JSON.stringify(r));
  assert(calls.updates.find((u) => u.id === "r3").status === "REVIEW_REQUIRED" && calls.audits.some((a) => a.action === "RISK_ALERT_EMAIL_RATE_LIMITED"));
  assert(logged.length === 3 && logged.map((l) => l.status).join(",") === "PROCESSED,PROCESSED,REVIEW_REQUIRED", JSON.stringify(logged.map((l) => l.status)));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
