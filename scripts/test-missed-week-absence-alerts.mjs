// Recuperação de semanas perdidas nos alertas de ausência ("detectado com atraso") + trava:
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

function memoryStore({ receivedWeeks = [], sCurveWeeks = [], workbookWeeks = [], alerts = [] } = {}) {
  const store = {
    alerts: alerts.map((a, i) => ({ id: `pre-${i}`, ...a })),
    audit: [],
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
  return store;
}

// "Agora" = quarta 18/11/2026 (semana de 16/11, prazo ainda não vencido).
const NOW = new Date("2026-11-18T15:00:00Z");

await check("1. Semanas perdidas (02/11 e 09/11) criadas com marca 'detectado com atraso', prazo original e auditoria própria; 26/10 já alertada e 19/10 recebida não duplicam", async () => {
  const s = memoryStore({ receivedWeeks: ["2026-10-19"], sCurveWeeks: ["2026-10-19"], workbookWeeks: ["2026-10-19"], alerts: [{ projectId: WEG, weekStart: "2026-10-26", kind: "MISSING_WEEKLY_SCHEDULE" }] });
  const out = await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  assert(JSON.stringify(out.examinedWeeks) === JSON.stringify(["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19"]), out.examinedWeeks.join(","));
  const created = s.alerts.filter((a) => !a.id.startsWith("pre-"));
  assert(out.createdLate === 2 && created.length === 2, `criados: ${created.map((a) => `${a.weekStart}/${a.kind}`).join(",")}`);
  assert(created.every((a) => a.kind === "MISSING_WEEKLY_SCHEDULE"), "só cronograma (sem cronograma => Curva S/planilha NO_SCHEDULE_YET)");
  assert(created.map((a) => a.weekStart).sort().join(",") === "2026-11-02,2026-11-09");
  for (const a of created) {
    assert(late.isLateDetectedDetail(a.detail), a.detail);
    assert(a.detail.includes("em 2026-11-18T15:00:00.000Z"), "data de detecção");
    assert(a.detail.includes(`prazo original ${a.deadlineAt}`), "prazo original");
  }
  assert(created.find((a) => a.weekStart === "2026-11-02").deadlineAt === "2026-11-06T21:00:00.000Z", "prazo original de 02/11 = sexta 18:00 BRT");
  assert(s.audit.filter((e) => e.action === "WEEKLY_ABSENCE_ALERT_DETECTED_LATE").length === 2);
  assert(out.outcomes.some((o) => o.weekStart === "2026-10-26" && o.kind === "MISSING_WEEKLY_SCHEDULE" && o.result === "ALREADY_ALERTED"));
  assert(out.outcomes.some((o) => o.weekStart === "2026-10-19" && o.kind === "MISSING_WEEKLY_SCHEDULE" && o.result === "RECEIVED"));
});

await check("2. Idempotência: segunda execução não cria nada novo", async () => {
  const s = memoryStore({ receivedWeeks: ["2026-10-19"], sCurveWeeks: ["2026-10-19"], workbookWeeks: ["2026-10-19"] });
  await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  const before = s.alerts.length;
  const again = await absence.createMissedWeekAbsenceAlerts(s, cfg(), new Date("2026-11-18T16:00:00Z"));
  assert(again.createdLate === 0 && s.alerts.length === before, `${again.createdLate} / ${s.alerts.length}`);
});

await check("3. Teto: nunca examina mais de 4 semanas anteriores, mesmo pedindo mais; janela de monitoramento respeitada", async () => {
  const s = memoryStore();
  const out = await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW, 50);
  assert(out.examinedWeeks.length === 4 && out.examinedWeeks.at(-1) === "2026-10-19", out.examinedWeeks.join(","));
  const narrow = memoryStore();
  const out2 = await absence.createMissedWeekAbsenceAlerts(narrow, cfg({ monitoringStartAt: "2026-11-05T00:00:00Z" }), NOW);
  assert(narrow.alerts.map((a) => a.weekStart).join(",") === "2026-11-09,2026-11-02", narrow.alerts.map((a) => a.weekStart).join(","));
  assert(out2.outcomes.filter((o) => o.result === "OUTSIDE_WINDOW").length === 2);
  assert((await absence.createMissedWeekAbsenceAlerts(memoryStore(), cfg({ enabled: false }), NOW)).examinedWeeks.length === 0, "desligado => nada");
});

await check("4. Curva S e planilha: semana com cronograma recebido e sem Curva S/planilha também é recuperada (com a marca)", async () => {
  const s = memoryStore({ receivedWeeks: ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19"], sCurveWeeks: ["2026-11-02", "2026-10-26", "2026-10-19"], workbookWeeks: ["2026-11-02", "2026-10-26", "2026-10-19"] });
  const out = await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  assert(s.alerts.map((a) => `${a.weekStart}:${a.kind}`).sort().join(",") === "2026-11-09:MISSING_S_CURVE,2026-11-09:MISSING_WEEKLY_REPORT_WORKBOOK", s.alerts.map((a) => `${a.weekStart}:${a.kind}`).join(","));
  assert(s.alerts.every((a) => late.isLateDetectedDetail(a.detail)) && out.createdLate === 2);
  const off = memoryStore({ receivedWeeks: ["2026-11-09"] });
  await absence.createMissedWeekAbsenceAlerts(off, cfg({ sCurveAlertEnabled: false, workbookAlertEnabled: false }), NOW, 1);
  assert(off.alerts.length === 0, "desligados por configuração");
});

await check("5. Semana corrente segue o comportamento normal (sem marca de atraso)", async () => {
  const s = memoryStore();
  const friday = new Date("2026-11-20T21:05:00Z"); // após o prazo da semana de 16/11
  const current = await absence.createWeeklyAbsenceAlert(s, cfg(), friday);
  assert(current.result === "CREATED" && current.weekStart === "2026-11-16");
  assert(!late.isLateDetectedDetail(s.alerts[0].detail), "alerta no prazo não leva a marca");
  const missed = await absence.createMissedWeekAbsenceAlerts(s, cfg(), friday);
  assert(!missed.examinedWeeks.includes("2026-11-16"), "a recuperação nunca toca a semana corrente");
});

// ---------------- Trava no ciclo de alertas de risco ----------------
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

await check("6. Coleta: só o alerta com a marca vira caso 'detectedLate'", () => {
  assert(lateCase.detectedLate === true && lateCase.riskLevel === "HIGH");
  assert(!normalCase.detectedLate, "alerta no prazo não é marcado");
});

await check("7. Caso NOVO detectado com atraso, alertas LIGADOS: registra o caso, mas nenhum e-mail, ação SLA ou escalonamento", () => {
  const p = planRiskAlerts(basePlan());
  assert(p.caseUpserts.length === 1 && p.caseUpserts[0].change === "NEW", "caso registrado/visível");
  assert(p.outbox.length === 0, `sem e-mail: ${p.outbox.map((e) => e.idempotencyKey).join(",")}`);
  assert(p.slaActionCreates.length === 0 && p.escalations.length === 0, "sem SLA nem cadeia");
  assert((p.lateDetectionHeld ?? []).includes(LATE_KEY), "retido");
});

await check("8. Ciclos seguintes sem decisão: continua sem envio; auditoria de decisão pendente uma única vez", () => {
  const p = planRiskAlerts(basePlan({ existingCases: [existingLate] }));
  assert(p.outbox.length === 0 && p.slaActionCreates.length === 0);
  assert(p.audit.filter((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION && a.entityId === "case-late").length === 1);
  const again = planRiskAlerts(basePlan({ existingCases: [existingLate], reissueDecisionRecordedCaseIds: new Set(["case-late"]) }));
  assert(!again.audit.some((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION) && again.outbox.length === 0);
  const system = ledgerMod.resolveReissueApprovals([{ id: "x", occurred_at: PLAN_NOW, actor_type: "SYSTEM", actor_user_id: null, action: ledgerMod.REISSUE_APPROVED_ACTION, entity_type: "RISK_ALERT_CASE", entity_id: "case-late" }]);
  assert(planRiskAlerts(basePlan({ existingCases: [existingLate], reissueApprovals: system })).outbox.length === 0, "decisão de SYSTEM não libera");
});

await check("9. Com decisão humana auditada: libera UMA comunicação (chave REISSUE:<decisão>) e cria a ação SLA; repetir a decisão não duplica", () => {
  const approvals = ledgerMod.resolveReissueApprovals([{ id: "aud-late-1", occurred_at: PLAN_NOW, actor_type: "USER", actor_user_id: U.rey, action: ledgerMod.REISSUE_APPROVED_ACTION, entity_type: "RISK_ALERT_CASE", entity_id: "case-late" }]);
  const p = planRiskAlerts(basePlan({ existingCases: [existingLate], reissueApprovals: approvals }));
  assert(p.outbox.length === 1 && p.outbox[0].idempotencyKey === `${LATE_KEY}:REISSUE:aud-late-1:${U.jaime}`, p.outbox.map((e) => e.idempotencyKey).join(","));
  assert(p.outbox[0].recipient.status === "PENDING" && p.slaActionCreates.length === 1);
  const used = planRiskAlerts(basePlan({ existingCases: [existingLate], reissueApprovals: approvals, existingIdempotencyKeys: new Set(p.outbox.map((e) => e.idempotencyKey)) }));
  assert(used.outbox.length === 0, "mesma decisão não reemite");
});

await check("10. Alerta da semana corrente (sem marca) mantém o comportamento normal: imediato ao responsável", () => {
  const p = planRiskAlerts(basePlan({ cases: [normalCase] }));
  assert(p.outbox.length === 1 && p.outbox[0].notificationType === "IMMEDIATE" && p.outbox[0].recipient.userId === U.jaime, p.outbox.map((e) => e.idempotencyKey).join(","));
  assert(!(p.lateDetectionHeld ?? []).length);
});

await check("11. Integração: script semanal chama a recuperação na fase de alertas", async () => {
  const { readFileSync } = await import("node:fs");
  const worker = readFileSync(new URL("./weekly-schedule-email-ingest.mjs", import.meta.url), "utf8");
  assert(worker.includes("createMissedWeekAbsenceAlerts(alertStore, config, new Date())"));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
