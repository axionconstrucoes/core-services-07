// Recuperação de semanas perdidas (checkpoint em lotes, classificação por evidência, responsável à época)
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

await check("1. CRONOGRAMA_NAO_RECEBIDO (coleta íntegra + caixa integrada): cria alerta 'detectado com atraso' com classificação, responsável à época e prazo original; 26/10 já alertada e 19/10 recebida não duplicam", async () => {
  const s = memoryStore({ receivedWeeks: ["2026-10-19"], sCurveWeeks: ["2026-10-19"], workbookWeeks: ["2026-10-19"], alerts: [{ projectId: WEG, weekStart: "2026-10-26", kind: "MISSING_WEEKLY_SCHEDULE" }], checkpoint: "2026-10-12" });
  const out = await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  assert(JSON.stringify(out.examinedWeeks) === JSON.stringify(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]), out.examinedWeeks.join(","));
  const c = created(s);
  assert(out.createdLate === 2 && c.length === 2 && c.every((a) => a.kind === "MISSING_WEEKLY_SCHEDULE"), c.map((a) => `${a.weekStart}/${a.kind}`).join(","));
  for (const a of c) {
    assert(late.isLateDetectedDetail(a.detail) && a.detail.includes("CRONOGRAMA_NAO_RECEBIDO"), a.detail);
    assert(a.detail.includes(`prazo original ${a.deadlineAt}`) && a.detail.includes("em 2026-11-18T15:00:00.000Z"));
  }
  assert(c.find((a) => a.weekStart === "2026-11-02").deadlineAt === "2026-11-06T21:00:00.000Z");
  assert(out.outcomes.some((o) => o.weekStart === "2026-10-26" && o.result === "ALREADY_ALERTED"));
  assert(out.outcomes.some((o) => o.weekStart === "2026-10-19" && o.kind === "MISSING_WEEKLY_SCHEDULE" && o.result === "RECEIVED"));
});

await check("2. EVIDENCIA_INCOMPLETA_INTEGRACAO: coleta sem execução após prazo+margem OU caixa do responsável não integrada => sem alerta (ninguém cobrado), pendência de integração auditada", async () => {
  const stale = memoryStore({ lastSuccessfulCollectionAt: "2026-11-05T12:00:00Z", checkpoint: "2026-10-26" });
  const out = await absence.createMissedWeekAbsenceAlerts(stale, cfg(), NOW);
  assert(created(stale).length === 0 && out.integrationPending === 2, `${created(stale).length} ${out.integrationPending}`);
  const o = out.outcomes.filter((x) => x.kind === "MISSING_WEEKLY_SCHEDULE");
  assert(o.every((x) => x.result === "INTEGRATION_PENDING" && x.classification === "EVIDENCIA_INCOMPLETA_INTEGRACAO" && x.reasons.includes("COLETA_SEM_EXECUCAO_APOS_PRAZO")), JSON.stringify(o));
  assert(stale.audit.filter((a) => a.action === absence.MISSED_WEEK_INTEGRATION_PENDING_ACTION).length === 2);
  const noMailbox = memoryStore({ integratedMailboxes: [], checkpoint: "2026-10-26" });
  const out2 = await absence.createMissedWeekAbsenceAlerts(noMailbox, cfg(), NOW);
  assert(created(noMailbox).length === 0 && out2.outcomes.filter((x) => x.kind === "MISSING_WEEKLY_SCHEDULE").every((x) => x.reasons.includes("CAIXA_DO_RESPONSAVEL_NAO_INTEGRADA")));
  // Sem margem: coleta logo após o prazo (menos de 6 h) ainda não cobre a janela.
  const tight = classif.classifyMissedWeek({ scheduleReceived: false, mppCollectedWithoutAcceptedSchedule: false, lastSuccessfulCollectionAt: "2026-11-06T22:00:00Z", responsibleAtTime: { ...RICARDO, source: "TRANSFER_HISTORY", isCurrent: false }, responsibleMailboxIntegrated: true }, new Date("2026-11-06T21:00:00Z"));
  assert(tight.classification === "EVIDENCIA_INCOMPLETA_INTEGRACAO");
  const unknown = classif.classifyMissedWeek({ scheduleReceived: false, mppCollectedWithoutAcceptedSchedule: false, lastSuccessfulCollectionAt: "2026-11-18T00:00:00Z", responsibleAtTime: { userId: null, email: null, source: "UNKNOWN", isCurrent: false }, responsibleMailboxIntegrated: false }, new Date("2026-11-06T21:00:00Z"));
  assert(unknown.classification === "EVIDENCIA_INCOMPLETA_INTEGRACAO" && unknown.reasons.includes("RESPONSAVEL_NAO_IDENTIFICADO"));
});

await check("3. RECEBIDO_NAO_PROCESSADO: .mpp coletado (ou intake não aceito) sem cronograma aceito => sem alerta, pendência de processamento", async () => {
  const s = memoryStore({ mppCollectedWeeks: ["2026-11-02"], checkpoint: "2026-10-26" });
  const out = await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  const w = out.outcomes.find((x) => x.weekStart === "2026-11-02" && x.kind === "MISSING_WEEKLY_SCHEDULE");
  assert(w.result === "RECEIVED_NOT_PROCESSED" && w.classification === "RECEBIDO_NAO_PROCESSADO", JSON.stringify(w));
  assert(created(s).map((a) => a.weekStart).join(",") === "2026-11-09", "só a semana íntegra sem nada recebido gera alerta");
});

await check("4. Atribuição histórica: antes da transição de 17/11 = Ricardo (histórico, sem cobrança a quem saiu); depois = Jaime (atual)", async () => {
  const before = classif.resolveResponsibleAt("2026-11-13T21:00:00.000Z", JAIME, TRANSFERS);
  assert(before.userId === RICARDO.userId && before.source === "TRANSFER_HISTORY" && before.isCurrent === false, JSON.stringify(before));
  const after = classif.resolveResponsibleAt("2026-11-20T21:00:00.000Z", JAIME, TRANSFERS);
  assert(after.userId === JAIME.userId && after.source === "CURRENT_MATRIX" && after.isCurrent === true);
  assert(classif.normalizeTransfers(TRANSFERS).length === 1, "linhas repetidas da mesma transição consolidadas");
  assert(JSON.stringify(classif.parseTransferDetail("Planejamento WEG: responsável atual transferido de ricardo.martins@axion.com.br para jaime.ramos@axion.com.br por decisão do administrador (17/11/2026).")) === JSON.stringify({ fromEmail: "ricardo.martins@axion.com.br", toEmail: "jaime.ramos@axion.com.br" }));
  const s = memoryStore({ checkpoint: "2026-11-02" });
  await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  const a = created(s)[0];
  assert(a && a.weekStart === "2026-11-09" && a.detail.includes(RICARDO.userId) && a.detail.includes("registro histórico, sem cobrança"), a?.detail);
  // Caixa do Ricardo não integrada => a semana dele vira pendência de integração (não cobra).
  const noRicardo = memoryStore({ checkpoint: "2026-11-02", integratedMailboxes: [JAIME.email] });
  const out = await absence.createMissedWeekAbsenceAlerts(noRicardo, cfg(), NOW);
  assert(created(noRicardo).length === 0 && out.integrationPending === 1);
});

await check("5. Checkpoint: lotes de até 4 semanas desde o início do monitoramento, nenhuma semana descartada, retomada exata, checkpoint auditável; dry-run não grava", async () => {
  const s = memoryStore({ lastSuccessfulCollectionAt: null, integratedMailboxes: [] });
  const config = cfg({ monitoringStartAt: "2026-08-20T15:13:58Z" }); // início efetivo da WEG
  const all = [];
  let rounds = 0;
  for (;;) {
    rounds += 1;
    const out = await absence.createMissedWeekAbsenceAlerts(s, config, NOW);
    assert(out.examinedWeeks.length <= 4, "lote máximo de 4");
    all.push(...out.examinedWeeks);
    if (!out.moreWeeksPending) break;
    assert(rounds < 10);
  }
  assert(all[0] === "2026-08-17" && all.at(-1) === "2026-11-09" && all.length === 13 && new Set(all).size === 13, all.join(","));
  assert(rounds === 4 && s.checkpoints.at(-1) === "2026-11-09");
  assert(s.audit.filter((a) => a.action === absence.MISSED_WEEKS_CHECKPOINT_ACTION).length === 4);
  const done = await absence.createMissedWeekAbsenceAlerts(s, config, NOW);
  assert(done.examinedWeeks.length === 0 && !done.moreWeeksPending, "nada a refazer");
  // Dry-run: classifica sem gravar nada.
  const d = memoryStore({ checkpoint: "2026-10-26" });
  const dry = await absence.createMissedWeekAbsenceAlerts(d, cfg(), NOW, { dryRun: true });
  assert(dry.outcomes.filter((o) => o.result === "WOULD_CREATE_LATE").length === 2 && d.alerts.length === 0 && d.audit.length === 0 && d.checkpoints.length === 1 && dry.checkpointAfter === null);
  // Sem evidência confiável no store: nunca declara ausência.
  const legacy = memoryStore({ withEvidence: false });
  const out = await absence.createMissedWeekAbsenceAlerts(legacy, cfg(), NOW);
  assert(out.outcomes[0].result === "STORE_UNSUPPORTED" && legacy.alerts.length === 0);
  assert((await absence.createMissedWeekAbsenceAlerts(memoryStore(), cfg({ enabled: false }), NOW)).examinedWeeks.length === 0);
});

await check("6. Curva S e planilha: semana com cronograma recebido e sem Curva S/planilha é recuperada (com a marca)", async () => {
  const s = memoryStore({ receivedWeeks: ["2026-11-09"], checkpoint: "2026-11-02" });
  const out = await absence.createMissedWeekAbsenceAlerts(s, cfg(), NOW);
  assert(created(s).map((a) => a.kind).sort().join(",") === "MISSING_S_CURVE,MISSING_WEEKLY_REPORT_WORKBOOK" && out.createdLate === 2);
  assert(created(s).every((a) => late.isLateDetectedDetail(a.detail)));
  const off = memoryStore({ receivedWeeks: ["2026-11-09"], checkpoint: "2026-11-02" });
  await absence.createMissedWeekAbsenceAlerts(off, cfg({ sCurveAlertEnabled: false, workbookAlertEnabled: false }), NOW);
  assert(off.alerts.length === 0);
});

await check("7. Semana corrente segue o comportamento normal (sem marca de atraso) e nunca é tocada pela recuperação", async () => {
  const s = memoryStore({ checkpoint: "2026-11-09" });
  const friday = new Date("2026-11-20T21:05:00Z");
  const current = await absence.createWeeklyAbsenceAlert(s, cfg(), friday);
  assert(current.result === "CREATED" && current.weekStart === "2026-11-16" && !late.isLateDetectedDetail(s.alerts[0].detail));
  const missed = await absence.createMissedWeekAbsenceAlerts(s, cfg(), friday);
  assert(missed.examinedWeeks.length === 0);
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

await check("8. Coleta: só o alerta com a marca vira caso 'detectedLate'", () => {
  assert(lateCase.detectedLate === true && lateCase.riskLevel === "HIGH");
  assert(!normalCase.detectedLate, "alerta no prazo não é marcado");
});

await check("9. Caso NOVO detectado com atraso, alertas LIGADOS: registra o caso, mas nenhum e-mail, ação SLA ou escalonamento", () => {
  const p = planRiskAlerts(basePlan());
  assert(p.caseUpserts.length === 1 && p.caseUpserts[0].change === "NEW", "caso registrado/visível");
  assert(p.outbox.length === 0, `sem e-mail: ${p.outbox.map((e) => e.idempotencyKey).join(",")}`);
  assert(p.slaActionCreates.length === 0 && p.escalations.length === 0, "sem SLA nem cadeia");
  assert((p.lateDetectionHeld ?? []).includes(LATE_KEY), "retido");
});

await check("10. Ciclos seguintes sem decisão: continua sem envio; auditoria de decisão pendente uma única vez", () => {
  const p = planRiskAlerts(basePlan({ existingCases: [existingLate] }));
  assert(p.outbox.length === 0 && p.slaActionCreates.length === 0);
  assert(p.audit.filter((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION && a.entityId === "case-late").length === 1);
  const again = planRiskAlerts(basePlan({ existingCases: [existingLate], reissueDecisionRecordedCaseIds: new Set(["case-late"]) }));
  assert(!again.audit.some((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION) && again.outbox.length === 0);
  const system = ledgerMod.resolveReissueApprovals([{ id: "x", occurred_at: PLAN_NOW, actor_type: "SYSTEM", actor_user_id: null, action: ledgerMod.REISSUE_APPROVED_ACTION, entity_type: "RISK_ALERT_CASE", entity_id: "case-late" }]);
  assert(planRiskAlerts(basePlan({ existingCases: [existingLate], reissueApprovals: system })).outbox.length === 0, "decisão de SYSTEM não libera");
});

await check("11. Com decisão humana auditada: libera UMA comunicação (chave REISSUE:<decisão>) e cria a ação SLA; repetir a decisão não duplica", () => {
  const approvals = ledgerMod.resolveReissueApprovals([{ id: "aud-late-1", occurred_at: PLAN_NOW, actor_type: "USER", actor_user_id: U.rey, action: ledgerMod.REISSUE_APPROVED_ACTION, entity_type: "RISK_ALERT_CASE", entity_id: "case-late" }]);
  const p = planRiskAlerts(basePlan({ existingCases: [existingLate], reissueApprovals: approvals }));
  assert(p.outbox.length === 1 && p.outbox[0].idempotencyKey === `${LATE_KEY}:REISSUE:aud-late-1:${U.jaime}`, p.outbox.map((e) => e.idempotencyKey).join(","));
  assert(p.outbox[0].recipient.status === "PENDING" && p.slaActionCreates.length === 1);
  const used = planRiskAlerts(basePlan({ existingCases: [existingLate], reissueApprovals: approvals, existingIdempotencyKeys: new Set(p.outbox.map((e) => e.idempotencyKey)) }));
  assert(used.outbox.length === 0, "mesma decisão não reemite");
});

await check("12. Alerta da semana corrente (sem marca) mantém o comportamento normal: imediato ao responsável", () => {
  const p = planRiskAlerts(basePlan({ cases: [normalCase] }));
  assert(p.outbox.length === 1 && p.outbox[0].notificationType === "IMMEDIATE" && p.outbox[0].recipient.userId === U.jaime, p.outbox.map((e) => e.idempotencyKey).join(","));
  assert(!(p.lateDetectionHeld ?? []).length);
});

await check("13. Integração: script semanal chama a recuperação na fase de alertas", async () => {
  const { readFileSync } = await import("node:fs");
  const worker = readFileSync(new URL("./weekly-schedule-email-ingest.mjs", import.meta.url), "utf8");
  assert(worker.includes("createMissedWeekAbsenceAlerts(alertStore, config, new Date())"));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
