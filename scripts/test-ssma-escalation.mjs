// Continuidade de cobrança das ações corretivas SSMA (escopo WEG): escalonamento pela Matriz ESG_SSMA, trava de níveis
// históricos, sem duplicidade (Gestor x Diretoria, mesmo destinatário), previsão pendente/vencida. Puro: sem rede/banco/e-mail.
// Uso: node scripts/test-ssma-escalation.mjs

import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const E = await import("../apps/web/lib/ssma/field-notifications/escalation.ts");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy.ts");
const { buildSsmaEscalationEmail, buildSsmaForecastExpiredEmail } = await import("../apps/web/lib/ssma/field-notifications/escalation-content.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 500)}`);
    failed += 1;
  }
}

const WEG = "00000000-0000-4000-8000-000000000001";
const CARLOS = "d813cb30-45dc-4fb2-9dd1-831ea8412933";
const REY = "c7bfe367-bac6-4263-8dd1-2b8b561e8cec";
const rule = { id: "r-high", projectId: WEG, riskLevel: "HIGH", area: null, timeUnit: "BUSINESS_HOURS", assumeDeadlineValue: 4, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 4, boardAfterValue: 4, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: false, isDefault: false, active: true, createdAt: "2026-09-20T00:00:00Z" };
const responsibles = [{ id: "x", projectId: WEG, area: "ESG_SSMA", responsibleDirectUserId: CARLOS, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: REY, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: REY, boardInvitationId: null, boardName: null, updatedAt: "" }];
const policy = resolveMatrixPolicy({ rules: [rule], responsibles, settings: null, area: "ESG_SSMA", riskLevel: "HIGH", projectId: WEG });
const emptyLedger = () => E.buildSsmaEscalationLedger([]);
const action = (over = {}) => ({ id: "sla-1", status: "PENDING", currentEscalationLevel: "RESPONSAVEL", assumeDueAt: "2026-11-06T17:45:08.278Z", respondDueAt: null, completeDueAt: "2026-11-07T02:59:59Z", acknowledgedAt: null, completedAt: null, contractualDeadline: null, ...over });
const ACTIVATION = "2026-11-18T05:20:00.000Z";
const plan = (over = {}) =>
  E.planSsmaEscalation({ action: action(over.action), correctiveActionClosed: false, linkedToRiskCase: false, policy, nowIso: over.now ?? "2026-11-18T05:30:00.000Z", activationAt: over.activation ?? ACTIVATION, ledger: over.ledger ?? emptyLedger(), ...(over.extra ?? {}) });

await check("política: Matriz ESG_SSMA ALTO 4/4/4 h úteis, Gestor e Diretoria = Reynaldo, calendário com feriados da WEG", () => {
  assert.equal(policy.status, "OK");
  assert.equal(policy.level2UserId, REY);
  assert.equal(policy.level3UserId, REY);
  assert.equal(policy.rule.timeUnit, "BUSINESS_HOURS");
  assert.ok(policy.businessHours.holidayCalendarId, "calendário de feriados aplicado à WEG");
});

await check("ações atuais (vencidas antes da ativação): níveis registrados (Gestor e Diretoria), limite atingido, envio TRAVADO para os dois níveis", () => {
  const p = plan();
  assert.deepEqual(p.levelSteps.map((s) => `${s.from}->${s.to}`), ["RESPONSAVEL->ESCALAO_1", "ESCALAO_1->DIRETORIA"]);
  assert.deepEqual(p.communications.map((c) => `${c.level}:${c.mode}`), ["ESCALAO_1:DECISION_REQUIRED", "DIRETORIA:DECISION_REQUIRED"]);
  assert.equal(p.recordTopLevel, true);
  assert.equal(p.communications.filter((c) => c.mode === "SEND" || c.mode === "SEND_APPROVED_REISSUE").length, 0);
});

await check("idempotência: na execução seguinte nada é reauditado nem enviado (decisão pendente registrada)", () => {
  const ledger = E.buildSsmaEscalationLedger([
    { action: E.SSMA_ESCALATION_DECISION_REQUIRED, detail: JSON.stringify({ level: "ESCALAO_1" }) },
    { action: E.SSMA_ESCALATION_DECISION_REQUIRED, detail: JSON.stringify({ level: "DIRETORIA" }) },
    { action: E.SSMA_ESCALATION_TOP_LEVEL, detail: "{}" },
  ]);
  const p = plan({ action: { currentEscalationLevel: "DIRETORIA" }, ledger });
  assert.equal(p.levelSteps.length, 0);
  assert.equal(p.communications.length, 0);
  assert.equal(p.recordTopLevel, false);
});

await check("liberação humana (USER) da Diretoria histórica => uma reemissão, informando Gestor pulado; liberação SYSTEM é ignorada", () => {
  const base = [
    { action: E.SSMA_ESCALATION_DECISION_REQUIRED, detail: JSON.stringify({ level: "ESCALAO_1" }) },
    { action: E.SSMA_ESCALATION_DECISION_REQUIRED, detail: JSON.stringify({ level: "DIRETORIA" }) },
  ];
  const sys = plan({ action: { currentEscalationLevel: "DIRETORIA" }, ledger: E.buildSsmaEscalationLedger([...base, { action: E.SSMA_ESCALATION_REISSUE_APPROVED, detail: JSON.stringify({ level: "DIRETORIA" }), actor_type: "SYSTEM" }]) });
  assert.equal(sys.communications.length, 0);
  const user = plan({ action: { currentEscalationLevel: "DIRETORIA" }, ledger: E.buildSsmaEscalationLedger([...base, { action: E.SSMA_ESCALATION_REISSUE_APPROVED, detail: JSON.stringify({ level: "DIRETORIA" }), actor_type: "USER" }]) });
  assert.deepEqual(user.communications.map((c) => `${c.level}:${c.mode}:${c.recipientUserId}:${c.gestorSkipped}`), [`DIRETORIA:SEND_APPROVED_REISSUE:${REY}:true`]);
  const after = plan({ action: { currentEscalationLevel: "DIRETORIA" }, ledger: E.buildSsmaEscalationLedger([...base, { action: E.SSMA_ESCALATION_REISSUE_APPROVED, detail: JSON.stringify({ level: "DIRETORIA" }), actor_type: "USER" }, { action: E.SSMA_ESCALATION_SENT, detail: JSON.stringify({ level: "DIRETORIA" }) }]) });
  assert.equal(after.communications.length, 0, "não repete após o envio");
});

// Ação NOVA: prazo de assumir quinta 19/11 16:00 BRT (19:00Z), depois da ativação.
const fresh = { assumeDueAt: "2026-11-19T19:00:00.000Z", completeDueAt: "2026-11-26T21:00:00.000Z" };
await check("limites com feriado: 4 h úteis após qui 19/11 16:00 pulam sex 20/11 (Consciência Negra) => seg 23/11 10:00 BRT", () => {
  const t = E.ssmaEscalationThresholds(action(fresh), policy);
  assert.equal(t.gestorAt, "2026-11-19T19:00:00.000Z");
  assert.equal(t.diretoriaAt, "2026-11-23T13:00:00.000Z");
});

await check("limite futuro do Gestor => mensagem ao Gestor (Reynaldo) uma vez; Diretoria depois, sem repetir o Gestor", () => {
  const g = plan({ action: fresh, now: "2026-11-19T19:30:00.000Z" });
  assert.deepEqual(g.communications.map((c) => `${c.level}:${c.mode}:${c.recipientUserId}`), [`ESCALAO_1:SEND:${REY}`]);
  const ledger = E.buildSsmaEscalationLedger([{ action: E.SSMA_ESCALATION_SENT, detail: JSON.stringify({ level: "ESCALAO_1" }) }]);
  const d = plan({ action: { ...fresh, currentEscalationLevel: "ESCALAO_1" }, now: "2026-11-23T13:30:00.000Z", ledger });
  assert.deepEqual(d.communications.map((c) => `${c.level}:${c.mode}:${c.gestorSkipped}`), ["DIRETORIA:SEND:false"]);
});

await check("Gestor e Diretoria vencidos na MESMA execução (agendador atrasado) => só a Diretoria, com Gestor pulado (sem 2 e-mails ao mesmo endereço)", () => {
  const p = plan({ action: fresh, now: "2026-11-23T14:00:00.000Z" });
  assert.deepEqual(p.communications.map((c) => `${c.level}:${c.mode}:${c.gestorSkipped}`), ["ESCALAO_1:SUPERSEDED:false", "DIRETORIA:SEND:true"]);
});

await check("nunca os dois caminhos: ação SLA vinculada a caso de risco é ignorada; ação concluída também", () => {
  assert.equal(plan({ extra: { linkedToRiskCase: true } }).skippedReason, "LINKED_TO_RISK_CASE");
  assert.equal(plan({ extra: { correctiveActionClosed: true } }).skippedReason, "CLOSED");
  assert.equal(plan({ action: { status: "COMPLETED" } }).skippedReason, "CLOSED");
});

await check("resposta (assumir) não reinicia SLA: limite passa a contar do prazo ORIGINAL de concluir", () => {
  const t = E.ssmaEscalationThresholds(action({ acknowledgedAt: "2026-11-18T12:00:00Z" }), policy);
  assert.equal(t.checkpointAt, "2026-11-07T02:59:59Z");
  assert.equal(t.checkpointReason, "NOT_COMPLETED");
});

await check("previsão: sem resposta / pendente / válida / vencida — linha visível nas mensagens", () => {
  const fmt = (iso) => new Date(iso).toISOString().slice(0, 16);
  assert.match(E.ssmaForecastLine(E.ssmaForecastState([]), "2026-11-18T00:00:00Z", fmt), /não respondeu/);
  const pending = E.ssmaForecastState([{ receivedAt: "2026-11-18T10:00:00Z", status: "IN_PROGRESS", forecastStatus: "INVALID", forecastProblem: "Risco ALTO/CRÍTICO: informe a data E o horário" }]);
  assert.equal(pending.kind, "PENDING");
  assert.match(E.ssmaForecastLine(pending, "2026-11-18T11:00:00Z", fmt), /PENDENTE/);
  const valid = E.ssmaForecastState([
    { receivedAt: "2026-11-18T10:00:00Z", status: "IN_PROGRESS", forecastStatus: "VALID", forecastAt: "2026-11-20T18:00:00Z" },
    { receivedAt: "2026-11-18T09:00:00Z", status: "IN_PROGRESS", forecastStatus: "VALID", forecastAt: "2026-11-30T18:00:00Z", outOfOrder: true },
  ]);
  assert.equal(valid.kind, "VALID");
  assert.equal(valid.forecastAt, "2026-11-20T18:00:00Z");
  assert.match(E.ssmaForecastLine(valid, "2026-11-21T00:00:00Z", fmt), /VENCIDA/);
});

await check("previsão vencida sem conclusão: aviso ao responsável UMA vez por previsão (ALTO/CRÍTICO); MÉDIO/BAIXO só registram", () => {
  const state = { kind: "VALID", forecastAt: "2026-11-20T18:00:00Z", receivedAt: "2026-11-18T10:00:00Z" };
  assert.equal(E.forecastExpiryNoticeDue({ severity: "ALTA", state, nowIso: "2026-11-20T17:00:00Z", correctiveActionClosed: false, notifiedForecasts: new Set() }).due, false);
  assert.equal(E.forecastExpiryNoticeDue({ severity: "ALTA", state, nowIso: "2026-11-20T19:00:00Z", correctiveActionClosed: false, notifiedForecasts: new Set() }).due, true);
  assert.equal(E.forecastExpiryNoticeDue({ severity: "ALTA", state, nowIso: "2026-11-21T19:00:00Z", correctiveActionClosed: false, notifiedForecasts: new Set(["2026-11-20T18:00:00Z"]) }).due, false);
  assert.equal(E.forecastExpiryNoticeDue({ severity: "MEDIA", state, nowIso: "2026-11-21T19:00:00Z", correctiveActionClosed: false, notifiedForecasts: new Set() }).due, false);
  assert.equal(E.forecastExpiryNoticeDue({ severity: "ALTA", state: { kind: "PENDING", problem: null, receivedAt: "x" }, nowIso: "2026-11-21T19:00:00Z", correctiveActionClosed: false, notifiedForecasts: new Set() }).due, false);
  assert.equal(E.forecastExpiryNoticeDue({ severity: "ALTA", state, nowIso: "2026-11-21T19:00:00Z", correctiveActionClosed: true, notifiedForecasts: new Set() }).due, false);
});

const ctx = {
  projectName: "WEG", recipientName: "Reynaldo", severity: "ALTA", category: "Ato inseguro", location: "Galpao", description: "d", occurredAt: "06/11/2026 10:43",
  accUrl: "https://acc/x", visibleCode: "2BF391C1", responsibleName: "Carlos Evandro", assumeDue: "06/11/2026 14:45", completeDue: "06/11/2026 23:59", forecastLine: "PENDENTE — previsão não informada",
};
await check("mensagens: nível identificado (Gestor x Diretoria), prazos originais, previsão/pendência, Gestor pulado, reemissão; sem faixa de teste", () => {
  const d = buildSsmaEscalationEmail({ ...ctx, levelLabel: "Nível 3 · Diretoria", thresholdAt: "07/11/2026 13:00", gestorSkipped: true, reissue: true, priorNotice: "18/11/2026 02:01" });
  assert.match(d.subject, /ESCALONAMENTO NÍVEL 3 · DIRETORIA/);
  assert.match(d.subject, /REEMISSÃO/);
  assert.match(d.text, /Prazo original para assumir: 06\/11\/2026 14:45/);
  assert.match(d.text, /Previsão de conclusão: PENDENTE/);
  assert.match(d.text, /Nível 2 · Gestor não gerou mensagem/);
  assert.doesNotMatch(d.text + d.subject + d.html, /TESTE|PILOTO/);
  const g = buildSsmaEscalationEmail({ ...ctx, levelLabel: "Nível 2 · Gestor", thresholdAt: "x", gestorSkipped: false, reissue: false, priorNotice: null });
  assert.match(g.subject, /ESCALONAMENTO NÍVEL 2 · GESTOR/);
  assert.notEqual(g.subject, d.subject);
  const f = buildSsmaForecastExpiredEmail({ ...ctx, recipientName: "Carlos", forecastAt: "20/11/2026 15:00", escalationState: "Nível 3 · Diretoria" });
  assert.match(f.subject, /PREVISÃO DE CONCLUSÃO VENCIDA/);
  assert.match(f.text, /VENCIDA/);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
