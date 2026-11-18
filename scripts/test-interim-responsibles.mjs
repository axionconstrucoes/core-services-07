// Responsável operacional TEMPORÁRIO do Nível 1 (ex.: FINANCEIRO enquanto a titular conclui o cadastro).
// Funções REAIS (interim-responsibles, resolveMatrixPolicy, planRiskAlerts, evaluatePilotReadiness) com
// fixtures sintéticas. Nenhum banco, nenhuma rede, nenhum e-mail.
// Uso: node scripts/test-interim-responsibles.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveActiveInterims, applyInterimResponsibles, describeInterimStatus } = await import("../apps/web/lib/risk-alerts/interim-responsibles");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { planRiskAlerts } = await import("../apps/web/lib/risk-alerts/plan-risk-alerts");
const { evaluatePilotReadiness } = await import("../apps/web/lib/risk-alerts/pilot-readiness");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const U_INTERIM = "aaaaaaaa-0000-4000-8000-000000000001"; // substituto (também Diretoria)
const U_TITULAR = "aaaaaaaa-0000-4000-8000-000000000002"; // titular definitiva após o 1º login
const U_PLAN = "aaaaaaaa-0000-4000-8000-000000000003";
const INVITE = "bbbbbbbb-0000-4000-8000-000000000001";
const TZ = "America/Sao_Paulo";
const NOW = "2026-09-22T15:00:00.000Z";

const row = (area, overrides = {}) => ({
  id: `r-${area}`, projectId: PROJECT, area,
  responsibleDirectUserId: null, responsibleDirectInvitationId: null, responsibleDirectName: null,
  secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null,
  escalation1UserId: null, escalation1InvitationId: null, escalation1Name: null,
  escalation2UserId: null, escalation2Name: null,
  boardUserId: U_INTERIM, boardInvitationId: null, boardName: null, updatedAt: "",
  ...overrides,
});
const matrix = (financeiro = {}) => [
  row("FINANCEIRO", { responsibleDirectInvitationId: INVITE, ...financeiro }),
  row("ADMINISTRATIVO", { responsibleDirectInvitationId: INVITE, escalation1UserId: U_PLAN }),
  row("PLANEJAMENTO", { responsibleDirectUserId: U_PLAN }),
];
const audit = (overrides = {}) => ({
  project_id: PROJECT, occurred_at: "2026-11-17T23:00:00.000Z", actor_type: "USER", actor_user_id: U_INTERIM,
  action: "SLA_INTERIM_RESPONSIBLE_ASSIGNED", entity_type: "SLA_AREA_RESPONSIBLES", entity_id: `${PROJECT}:FINANCEIRO`,
  detail: JSON.stringify({ area: "FINANCEIRO", interimUserId: U_INTERIM, reason: "titular sem cadastro" }),
  ...overrides,
});
const settings = { projectId: PROJECT, timezone: TZ, businessDayStartHour: 8, businessDayEndHour: 18, updatedAt: "" };
const rule = (riskLevel, overrides = {}) => ({
  id: `rule-${riskLevel}`, projectId: PROJECT, riskLevel, area: null, timeUnit: "BUSINESS_HOURS",
  assumeDeadlineValue: 4, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 4, boardAfterValue: 4,
  notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true, ...overrides,
});
const rules = [rule("LOW"), rule("MEDIUM"), rule("HIGH"), rule("CRITICAL", { timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, escalation2AfterValue: 1, boardAfterValue: 2 })];
const recipients = (titularStatus = "ACTIVE") =>
  new Map([
    [U_INTERIM, { userId: U_INTERIM, name: "Interino", email: "interino@axion.com.br", membershipStatus: "ACTIVE" }],
    [U_TITULAR, { userId: U_TITULAR, name: "Titular", email: "titular@axion.com.br", membershipStatus: titularStatus }],
    [U_PLAN, { userId: U_PLAN, name: "Plan", email: "plan@axion.com.br", membershipStatus: "ACTIVE" }],
  ]);
const config = (allow = [U_INTERIM, U_PLAN]) => ({ enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: allow, senderDomain: "axion.com.br" });
const finCase = (overrides = {}) => ({
  sourceType: "WEEKLY_REPORT_SHEET", sourceId: "sheet-fin", area: "FINANCEIRO", riskLevel: "HIGH", title: "Relatório semanal — aba Financeiro (W43)",
  summary: "s", impact: "", recommendation: null, fingerprint: "fp-fin", originPath: "", closed: false, reference: "W43 · Financeiro", ...overrides,
});
function planWith(resp, overrides = {}) {
  return planRiskAlerts({
    now: overrides.now ?? NOW, projectId: PROJECT, projectName: "Obra", featureEnabled: true, providerConfigured: true, dryRun: false,
    config: overrides.config ?? config(), timeZone: TZ, cases: overrides.cases ?? [finCase()], existingCases: overrides.existingCases ?? [],
    linkedActions: overrides.linkedActions ?? new Map(),
    policyFor: (area, riskLevel) => resolveMatrixPolicy({ rules, responsibles: resp, settings, area, riskLevel }),
    recipients: overrides.recipients ?? recipients(), existingIdempotencyKeys: new Set(), previousDigestSentAt: null,
    interimAreas: overrides.interimAreas ?? new Set(["FINANCEIRO"]),
  });
}
const readinessFor = (resp, areas) =>
  evaluatePilotReadiness({
    featureEnabled: true, config: config(), providerConfigured: true, explicitRuleLevels: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    matrixStatuses: areas.map((area) => {
      const p = resolveMatrixPolicy({ rules, responsibles: resp, settings, area, riskLevel: "HIGH" });
      return { area, status: p.status, missing: p.missing };
    }),
    allowlistValid: true, projectConfirmed: true, workspaceConfigured: true, severityMapConfigured: true, replyMailboxConfigured: true,
    replyMailbox: "crm@axion.com.br", deliveryOverrideEmail: null, projectPilotProfileInvalid: false,
  });

await check("1. ASSIGNED humano ativa; SYSTEM, outro projeto, detalhe inválido e área divergente são ignorados", () => {
  assert(resolveActiveInterims(PROJECT, [audit()]).get("FINANCEIRO")?.interimUserId === U_INTERIM);
  assert(resolveActiveInterims(PROJECT, [audit({ actor_type: "SYSTEM", actor_user_id: null })]).size === 0, "SYSTEM não vale");
  assert(resolveActiveInterims(PROJECT, [audit({ project_id: OTHER, entity_id: `${OTHER}:FINANCEIRO` })]).size === 0, "outro projeto");
  assert(resolveActiveInterims(PROJECT, [audit({ detail: "{" })]).size === 0, "detalhe inválido");
  assert(resolveActiveInterims(PROJECT, [audit({ entity_id: `${PROJECT}:ADMINISTRATIVO` })]).size === 0, "área do detalhe ≠ entidade");
});
await check("2. REVOKED mais recente encerra; ASSIGNED posterior reativa", () => {
  const revoked = audit({ action: "SLA_INTERIM_RESPONSIBLE_REVOKED", occurred_at: "2026-11-18T10:00:00.000Z" });
  assert(resolveActiveInterims(PROJECT, [audit(), revoked]).size === 0);
  assert(resolveActiveInterims(PROJECT, [audit(), revoked, audit({ occurred_at: "2026-11-19T10:00:00.000Z" })]).size === 1);
});
await check("3. Matriz gravada preservada; só o Nível 1 do FINANCEIRO muda para o motor; ADMINISTRATIVO intacto", () => {
  const stored = matrix();
  const snapshot = JSON.stringify(stored);
  const applied = applyInterimResponsibles(stored, resolveActiveInterims(PROJECT, [audit()]));
  assert(JSON.stringify(stored) === snapshot, "linhas gravadas não podem ser mutadas");
  const fin = applied.find((r) => r.area === "FINANCEIRO");
  const adm = applied.find((r) => r.area === "ADMINISTRATIVO");
  assert(fin.responsibleDirectUserId === U_INTERIM && fin.responsibleDirectInvitationId === null && fin.boardUserId === U_INTERIM);
  assert(JSON.stringify(adm) === JSON.stringify(stored.find((r) => r.area === "ADMINISTRATIVO")), "ADMINISTRATIVO não muda");
});
await check("4. Readiness: sem substituição o bloqueio global continua; com ela o FINANCEIRO fica OK e o ADMINISTRATIVO segue em revisão", () => {
  assert(readinessFor(matrix(), ["FINANCEIRO", "PLANEJAMENTO"]).blockers.includes("CONFIGURATION_REVIEW_REQUIRED"), "validação global preservada");
  const applied = applyInterimResponsibles(matrix(), resolveActiveInterims(PROJECT, [audit()]));
  const r = readinessFor(applied, ["FINANCEIRO", "PLANEJAMENTO"]);
  assert(r.ready && r.blockers.length === 0, JSON.stringify(r.blockers));
  assert(readinessFor(applied, ["ADMINISTRATIVO"]).blockers.includes("CONFIGURATION_REVIEW_REQUIRED"), "ADMINISTRATIVO não foi regularizado silenciosamente");
});
await check("5. Alerta imediato do FINANCEIRO vai só ao substituto; ação SLA nasce com ele", () => {
  const applied = applyInterimResponsibles(matrix(), resolveActiveInterims(PROJECT, [audit()]));
  const p = planWith(applied);
  const immediate = p.outbox.filter((e) => e.notificationType === "IMMEDIATE");
  assert(immediate.length === 1 && immediate[0].recipient.userId === U_INTERIM && immediate[0].recipient.status === "PENDING");
  assert(p.slaActionCreates[0].responsibleUserId === U_INTERIM);
});
await check("6. Escalonamento para a Diretoria = o próprio substituto: nível sobe, sem e-mail duplicado, auditado", () => {
  const applied = applyInterimResponsibles(matrix(), resolveActiveInterims(PROJECT, [audit()]));
  const existing = { id: "case-fin", sourceType: "WEEKLY_REPORT_SHEET", sourceId: "sheet-fin", area: "FINANCEIRO", riskLevel: "HIGH", previousRiskLevel: null, fingerprint: "fp-fin", status: "OPEN", slaActionId: "act-fin", lastDigestWindow: null, firstSeenAt: "2026-09-21T12:00:00.000Z", lastChangedAt: "2026-09-21T12:00:00.000Z", closedAt: null, title: "t", summary: "s", impact: "", recommendation: null, originPath: "", reference: "" };
  const linked = { id: "act-fin", status: "PENDING", currentEscalationLevel: "RESPONSAVEL", assumeDueAt: "2026-09-21T16:00:00.000Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, contractualDeadline: null, responsibleUserId: U_INTERIM };
  const p = planWith(applied, { existingCases: [existing], linkedActions: new Map([["act-fin", linked]]) });
  assert(p.escalations.length === 1 && p.escalations[0].newLevel === "DIRETORIA", JSON.stringify(p.escalations));
  assert(!p.outbox.some((e) => e.notificationType === "ESCALATION"), "sem segundo e-mail ao mesmo usuário");
  assert(p.audit.some((a) => a.action === "RISK_ALERT_ESCALATION_RECIPIENT_DEDUPED"));
  // destinatário diferente continua recebendo normalmente
  const other = planWith(applied, { existingCases: [existing], linkedActions: new Map([["act-fin", { ...linked, responsibleUserId: U_PLAN }]]) });
  assert(other.outbox.some((e) => e.notificationType === "ESCALATION" && e.recipient.userId === U_INTERIM));
  // sem substituição ativa na área, a regra geral (escalonamento é outro evento) não muda
  const general = planWith(applied, { existingCases: [existing], linkedActions: new Map([["act-fin", linked]]), interimAreas: new Set() });
  assert(general.outbox.some((e) => e.notificationType === "ESCALATION" && e.recipient.userId === U_INTERIM), "regra geral preservada");
});
await check("7. 1º login da titular (convite vira usuário) NÃO troca o roteamento; status informa quando ela está apta", () => {
  const interims = resolveActiveInterims(PROJECT, [audit()]);
  assert(describeInterimStatus(matrix(), interims, recipients(), [U_INTERIM])[0].definitiveStatus === "PENDING_INVITATION");
  const activated = matrix({ responsibleDirectUserId: U_TITULAR, responsibleDirectInvitationId: null });
  const p = planWith(applyInterimResponsibles(activated, interims));
  assert(p.outbox.filter((e) => e.notificationType === "IMMEDIATE").every((e) => e.recipient.userId === U_INTERIM), "continua no substituto");
  assert(describeInterimStatus(activated, interims, recipients("INVITED"), [U_INTERIM])[0].definitiveStatus === "NOT_ACTIVE_MEMBER");
  assert(describeInterimStatus(activated, interims, recipients(), [U_INTERIM])[0].definitiveStatus === "NOT_IN_PILOT_ALLOWLIST");
  assert(describeInterimStatus(activated, interims, recipients(), [U_INTERIM, U_TITULAR])[0].definitiveStatus === "READY_TO_TAKE_OVER");
});
await check("8. Critério financeiro sem limite (REVIEW_REQUIRED) não gera e-mail nem bloqueia o caso aprovado de outra aba", () => {
  const applied = applyInterimResponsibles(matrix(), resolveActiveInterims(PROJECT, [audit()]));
  const plan = { sourceType: "SCHEDULE_COMPARISON", sourceId: "cmp-1", area: "PLANEJAMENTO", riskLevel: "HIGH", title: "Cronograma", summary: "s", impact: "", recommendation: null, fingerprint: "fp-plan", originPath: "", closed: false, reference: "W43" };
  const p = planWith(applied, { cases: [finCase({ riskLevel: "REVIEW_REQUIRED" }), plan] });
  assert(!p.outbox.some((e) => e.caseKey && e.caseKey.includes("sheet-fin")), "REVIEW_REQUIRED sem e-mail");
  assert(p.outbox.some((e) => e.notificationType === "IMMEDIATE" && e.recipient.userId === U_PLAN), "outro critério funciona");
  assert(p.caseUpserts.some((u) => u.input.riskLevel === "REVIEW_REQUIRED" && u.policy === null), "caso financeiro fica em revisão");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
