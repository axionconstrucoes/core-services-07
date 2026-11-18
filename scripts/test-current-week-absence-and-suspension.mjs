// Semana CORRENTE com o mesmo critério de evidência da recuperação (#218) e SUSPENSÃO de comunicação por caso
// nos alertas de ausência ("detectado com atraso") + trava:
// alerta detectado com atraso NÃO gera e-mail, ação SLA nem escalonamento sem decisão humana
// auditada de reemissão. Funções REAIS com stores em memória. Nenhum banco, rede ou e-mail.
// Uso: node scripts/test-missed-week-absence-alerts.mjs
import net from "node:net";
import { register } from "node:module";

const leaked = Object.keys(process.env).filter((k) => /^(SUPABASE_|NEXT_PUBLIC_SUPABASE|GOOGLE_(?!GMAIL_INBOUND_MAILBOX$)|ANTHROPIC_API_KEY|ELEVENLABS_|CRON_SECRET|ACC_RISK_ALERTS_)/.test(k));
if (leaked.length > 0) {
  console.error(`ABORTADO: credenciais no ambiente (${leaked.join(", ")}). Rode com ambiente limpo.`);
  process.exit(2);
}
globalThis.fetch = async () => {
  throw new Error("NETWORK_BLOCKED");
};
net.Socket.prototype.connect = function blockedConnect() {
  throw new Error("NETWORK_BLOCKED");
};
register("./ts-module-resolver.mjs", import.meta.url);

const absence = await import("../apps/web/lib/schedule/weekly-ingestion/create-absence-alerts");
const late = await import("../apps/web/lib/schedule/weekly-ingestion/late-detection");
const classif = await import("../apps/web/lib/schedule/weekly-ingestion/missed-week-classification");
const { collectIngestionAlertCases, caseKeyOf } = await import("../apps/web/lib/risk-alerts/collect-risk-cases");
const { planRiskAlerts } = await import("../apps/web/lib/risk-alerts/plan-risk-alerts");
const ledgerMod = await import("../apps/web/lib/risk-alerts/communication-ledger");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");

let passed = 0;
let failed = 0;
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};
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

const WEG = "00000000-0000-4000-8000-000000000001";
// Configuração equivalente à da WEG: prazo sexta 18:00 em Brasília.
const cfg = (o = {}) => ({
  id: "cfg-1",
  projectId: WEG,
  enabled: true,
  deadlineWeekday: 5,
  deadlineTime: "18:00",
  timezone: "America/Sao_Paulo",
  monitoringStartAt: "2026-09-01T00:00:00Z",
  monitoringEndAt: null,
  alertRecipientUserIds: [],
  ...o,
});

const RICARDO = { userId: "r0000000-0000-4000-8000-0000000000aa", email: "ricardo.martins@axion.com.br" };
const JAIME = { userId: "b2222222-0000-4000-8000-000000000012", email: "jaime.ramos@axion.com.br" };
// Transição real: 17/11/2026 22:31 UTC (RISK_ALERT_RESPONSIBLE_TRANSFERRED), várias linhas por caso.
const TRANSFERS = [0, 1, 2].map(() => ({ at: "2026-11-17T22:31:53.972Z", from: RICARDO, to: JAIME }));

/**
 * Store em memória com evidência por semana. Padrões: coleta íntegra (última coleta muito depois),
 * caixas do Ricardo e do Jaime integradas, transição em 17/11 — sobrescreva por teste.
 */
function memoryStore({
  receivedWeeks = [],
  sCurveWeeks = [],
  workbookWeeks = [],
  mppCollectedWeeks = [],
  alerts = [],
  lastSuccessfulCollectionAt = "2026-11-18T01:45:00Z",
  integratedMailboxes = [RICARDO.email, JAIME.email],
  current = JAIME,
  transfers = TRANSFERS,
  checkpoint = null,
  withEvidence = true,
} = {}) {
  const store = {
    alerts: alerts.map((a, i) => ({ id: `pre-${i}`, ...a })),
    audit: [],
    checkpoints: checkpoint ? [checkpoint] : [],
    async hasReceivedScheduleForWeek(_p, w) { return receivedWeeks.includes(w); },
    async hasSCurveForWeek(_p, w) { return sCurveWeeks.includes(w); },
    async hasWorkbookForWeek(_p, w) { return workbookWeeks.includes(w); },
    async insertAlert(record) {
      if (store.alerts.some((a) => a.projectId === record.projectId && a.weekStart === record.weekStart && a.kind === record.kind)) return { created: false, id: null };
      const id = `al-${store.alerts.length + 1}`;
      store.alerts.push({ id, ...record });
      return { created: true, id };
    },
    async writeAudit(entry) { store.audit.push(entry); },
  };
  if (withEvidence) {
    store.loadMissedWeeksCheckpoint = async () => store.checkpoints.at(-1) ?? null;
    store.saveMissedWeeksCheckpoint = async (_p, week, summary) => {
      store.checkpoints.push(week);
      store.audit.push({ action: absence.MISSED_WEEKS_CHECKPOINT_ACTION, entityType: "WEEKLY_SCHEDULE_INGESTION_CONFIG", entityId: WEG, detail: JSON.stringify({ lastVerifiedWeekStart: week, ...summary }) });
    };
    store.loadMissedWeekEvidence = async (_cfg, week, deadlineAt) => {
      const responsibleAtTime = classif.resolveResponsibleAt(deadlineAt.toISOString(), current, transfers);
      return {
        scheduleReceived: receivedWeeks.includes(week),
        mppCollectedWithoutAcceptedSchedule: mppCollectedWeeks.includes(week),
        lastSuccessfulCollectionAt,
        responsibleAtTime,
        responsibleMailboxIntegrated: Boolean(responsibleAtTime.email && integratedMailboxes.includes(responsibleAtTime.email)),
      };
    };
  }
  return store;
}

// "Agora" = quarta 18/11/2026 (semana de 16/11, prazo ainda não vencido).
const NOW = new Date("2026-11-18T15:00:00Z");
const created = (s) => s.alerts.filter((a) => !a.id.startsWith("pre-"));

const suspension = await import("../apps/web/lib/risk-alerts/case-communication-suspension");

// Semana de 16/11 (prazo sex 20/11 18:00 BRT = 21:00Z). "Agora" depois do prazo.
const AFTER = new Date("2026-11-21T10:00:00Z");

await check("C1. Semana corrente, caixa do responsável (Jaime) NÃO integrada: sem alerta, pendência de integração auditada", async () => {
  const s = memoryStore({ integratedMailboxes: [RICARDO.email], lastSuccessfulCollectionAt: "2026-11-21T09:00:00Z" });
  const o = await absence.createWeeklyAbsenceAlert(s, cfg(), AFTER);
  assert(o.result === "INTEGRATION_PENDING", o.result);
  assert(o.reasons.includes("CAIXA_DO_RESPONSAVEL_NAO_INTEGRADA"));
  assert(s.alerts.length === 0, "nenhum alerta");
  assert(s.audit.filter((a) => a.action === absence.CURRENT_WEEK_INTEGRATION_PENDING_ACTION).length === 1);
});

await check("C2. Semana corrente, coleta sem execução ≥6 h após o prazo: pendência (não atribui falta)", async () => {
  const s = memoryStore({ lastSuccessfulCollectionAt: "2026-11-20T22:00:00Z" });
  const o = await absence.createWeeklyAbsenceAlert(s, cfg(), AFTER);
  assert(o.result === "INTEGRATION_PENDING" && o.reasons.includes("COLETA_SEM_EXECUCAO_APOS_PRAZO"), JSON.stringify(o));
  assert(s.alerts.length === 0);
});

await check("C3. Semana corrente, .mpp coletado sem cronograma aceito: RECEIVED_NOT_PROCESSED, sem alerta", async () => {
  const s = memoryStore({ mppCollectedWeeks: ["2026-11-16"] });
  const o = await absence.createWeeklyAbsenceAlert(s, cfg(), AFTER);
  assert(o.result === "RECEIVED_NOT_PROCESSED", o.result);
  assert(s.alerts.length === 0);
});

await check("C4. Semana corrente, coleta íntegra e caixa integrada: cria o alerta (CRONOGRAMA_NAO_RECEBIDO)", async () => {
  const s = memoryStore({ lastSuccessfulCollectionAt: "2026-11-21T09:00:00Z" });
  const o = await absence.createWeeklyAbsenceAlert(s, cfg(), AFTER);
  assert(o.result === "CREATED", o.result);
  assert(s.alerts.length === 1 && /CRONOGRAMA_NAO_RECEBIDO/.test(s.alerts[0].detail));
});

await check("C5. Pendência da semana corrente não é auditada de novo a cada execução (mesma chave)", async () => {
  const s = memoryStore({ integratedMailboxes: [], lastSuccessfulCollectionAt: "2026-11-21T09:00:00Z" });
  s.hasAuditEntry = async (_p, action, entityId, key) => s.audit.some((a) => a.action === action && a.entityId === entityId && JSON.parse(a.detail).key === key);
  await absence.createWeeklyAbsenceAlert(s, cfg(), AFTER);
  await absence.createWeeklyAbsenceAlert(s, cfg(), new Date("2026-11-21T11:00:00Z"));
  assert(s.audit.filter((a) => a.action === absence.CURRENT_WEEK_INTEGRATION_PENDING_ACTION).length === 1);
});

await check("C6. Store sem evidência (legado) mantém o comportamento anterior; antes do prazo continua NOT_DUE", async () => {
  const legacy = memoryStore({ withEvidence: false });
  assert((await absence.createWeeklyAbsenceAlert(legacy, cfg(), AFTER)).result === "CREATED");
  const s = memoryStore({ integratedMailboxes: [] });
  assert((await absence.createWeeklyAbsenceAlert(s, cfg(), NOW)).result === "NOT_DUE");
});

await check("C7. Recebido na semana corrente continua RECEIVED", async () => {
  const s = memoryStore({ receivedWeeks: ["2026-11-16"], integratedMailboxes: [] });
  assert((await absence.createWeeklyAbsenceAlert(s, cfg(), AFTER)).result === "RECEIVED");
});
const U = { rey: "a1111111-0000-4000-8000-000000000011", jaime: "b2222222-0000-4000-8000-000000000012", carlos: "c3333333-0000-4000-8000-000000000013" };
const EMAIL = { [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br" };
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const resp = { id: "resp-PLAN", projectId: WEG, area: "PLANEJAMENTO", responsibleDirectUserId: U.jaime, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U.carlos, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: "2026-11-17T00:00:00Z" };
const recipients = () => new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
const riskConfig = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: [U.rey, U.jaime, U.carlos], senderDomain: "axion.com.br", severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" }, pilotProjectConfirmedAt: "2026-11-17T00:00:00Z", pilotDeliveryOverrideEmail: null };
const policyFor = (area, riskLevel) => resolveMatrixPolicy({ rules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule), responsibles: [resp], settings: null, area, riskLevel });
const PLAN_NOW = "2026-11-18T16:00:00.000Z";

const lateRow = { id: "al-late", project_id: WEG, kind: "MISSING_WEEKLY_SCHEDULE", week_start: "2026-11-02", deadline_at: "2026-11-06T21:00:00.000Z", detail: late.formatLateDetectionDetail(NOW, new Date("2026-11-06T21:00:00Z"), "Nenhum cronograma."), resolved_at: null, created_at: "2026-11-18T15:00:00Z" };
const normalRow = { id: "al-now", project_id: WEG, kind: "MISSING_WEEKLY_SCHEDULE", week_start: "2026-11-16", deadline_at: "2026-11-20T21:00:00.000Z", detail: "Nenhum cronograma.", resolved_at: null, created_at: "2026-11-20T21:05:00Z" };
const [lateCase, normalCase] = collectIngestionAlertCases([lateRow, normalRow], riskConfig.severityMap);
const LATE_KEY = caseKeyOf(lateCase);
const existingLate = { id: "case-late", sourceType: "INGESTION_ALERT", sourceId: "al-late", area: "PLANEJAMENTO", riskLevel: "HIGH", previousRiskLevel: null, fingerprint: lateCase.fingerprint, status: "OPEN", slaActionId: null, lastDigestWindow: null, firstSeenAt: PLAN_NOW, lastChangedAt: PLAN_NOW, closedAt: null, title: "t", summary: "s", impact: "", recommendation: null, originPath: "", reference: lateCase.reference, state: "OPEN", currentLevel: "RESPONSAVEL", currentResponsibleUserId: null, previousResponsibleUserId: null, topLevelReachedAt: null };
const basePlan = (o = {}) => ({
  now: PLAN_NOW,
  projectId: WEG,
  projectName: "P",
  featureEnabled: true,
  providerConfigured: true,
  dryRun: false,
  config: riskConfig,
  timeZone: "America/Sao_Paulo",
  cases: [lateCase],
  existingCases: [],
  linkedActions: new Map(),
  policyFor,
  recipients: recipients(),
  existingIdempotencyKeys: new Set(),
  previousDigestSentAt: null,
  outboxHistory: [],
  ...o,
});


const susRow = (action, actor = "USER", at = PLAN_NOW, entity = "case-sus") => ({ project_id: WEG, occurred_at: at, actor_type: actor, actor_user_id: actor === "USER" ? U.rey : null, action, entity_type: "RISK_ALERT_CASE", entity_id: entity, detail: JSON.stringify({ reason: "AUSENCIA_NAO_COMPROVADA" }) });

await check("S1. Resolução da suspensão: registro humano mais recente decide; SYSTEM é ignorado", () => {
  const set1 = suspension.resolveSuspendedCaseIds(WEG, [susRow(suspension.CASE_SUSPENDED_ACTION)]);
  assert(set1.has("case-sus"));
  const resumed = suspension.resolveSuspendedCaseIds(WEG, [susRow(suspension.CASE_SUSPENDED_ACTION, "USER", "2026-11-18T10:00:00Z"), susRow(suspension.CASE_RESUMED_ACTION, "USER", "2026-11-18T11:00:00Z")]);
  assert(!resumed.has("case-sus"));
  const sys = suspension.resolveSuspendedCaseIds(WEG, [susRow(suspension.CASE_SUSPENDED_ACTION, "SYSTEM")]);
  assert(!sys.has("case-sus"));
});

// Caso de ausência (semana corrente, sem marca de atraso) já aberto, com ação SLA vencida em Diretoria.
const normalKey = caseKeyOf(normalCase);
const existingNormal = { ...existingLate, id: "case-sus", sourceId: "al-now", fingerprint: normalCase.fingerprint, reference: normalCase.reference, slaActionId: "sla-sus" };
const linkedSus = new Map([["sla-sus", { id: "sla-sus", status: "PENDING", currentEscalationLevel: "RESPONSAVEL", assumeDueAt: "2026-11-18T10:00:00Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, contractualDeadline: null, responsibleUserId: U.jaime }]]);

await check("S2. Caso SUSPENSO: registra/apresenta o caso, mas nenhum e-mail, escalonamento, limite atingido ou reemissão (mesmo com decisão)", () => {
  const approvals = ledgerMod.resolveReissueApprovals([{ id: "aud-x", occurred_at: PLAN_NOW, actor_type: "USER", actor_user_id: U.rey, action: ledgerMod.REISSUE_APPROVED_ACTION, entity_type: "RISK_ALERT_CASE", entity_id: "case-sus" }]);
  const p = planRiskAlerts(basePlan({ cases: [normalCase], existingCases: [existingNormal], linkedActions: linkedSus, reissueApprovals: approvals, suspendedCaseIds: new Set(["case-sus"]) }));
  assert(p.caseUpserts.length === 1, "caso registrado");
  assert(p.outbox.length === 0, p.outbox.map((e) => e.idempotencyKey).join(","));
  assert(p.escalations.length === 0 && p.topLevelReached.length === 0 && p.slaActionCreates.length === 0);
  assert((p.communicationSuspended ?? []).includes(normalKey));
});

await check("S3. Sem suspensão o mesmo caso volta a escalonar normalmente (suspensão não altera prazos)", () => {
  const p = planRiskAlerts(basePlan({ cases: [normalCase], existingCases: [existingNormal], linkedActions: linkedSus }));
  assert(p.escalations.length === 1, `esperado escalonamento: ${p.escalations.length}`);
});

console.log(`\n${passed} OK, ${failed} FALHA(S)`);
process.exit(failed > 0 ? 1 : 0);
