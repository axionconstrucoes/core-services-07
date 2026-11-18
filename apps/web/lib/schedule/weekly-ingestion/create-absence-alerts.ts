// Alerta de AUSÊNCIA do cronograma semanal — único e idempotente por
// (projeto, semana, tipo). Considera "recebido" um intake
// AUTHORIZED_AUTO, APPROVED_HUMAN_REVIEW, PENDING_HUMAN_REVIEW ou
// RECEIVED_DUPLICATE da semana: um envio válido cujo .mpp já era
// conhecido COMPROVA que o envio ocorreu (obrigação semanal cumprida),
// mesmo sem versão nova. A entrega aos destinatários internos
// (config.alertRecipientUserIds) é etapa posterior, fora deste módulo
// (ver docs/weekly-schedule-email-ingestion.md).

import type { AbsenceAlertRecord, AbsenceAlertStore, OpenAbsenceAlert } from "./store";
import type { WeeklyScheduleIngestionConfig } from "./types";
import { isWithinMonitoringWindow } from "./evaluate-weekly-schedule-email";
import { formatLateDetectionDetail } from "./late-detection";
import {
  classifyMissedWeek,
  type MissedWeekClassification,
  type MissedWeekReason,
  type ResponsibleAtTime,
} from "./missed-week-classification";
import { previousWeekStart, resolveCurrentWeekDeadline, resolveWeekStart, resolveWeeklyDeadline } from "./week-window";

export interface AbsenceAlertOutcome {
  projectId: string;
  weekStart: string;
  deadlineAt: string;
  result: "NOT_DUE" | "RECEIVED" | "CREATED" | "ALREADY_ALERTED" | "OUTSIDE_WINDOW" | "DISABLED" | "NO_SCHEDULE_YET" | "STORE_UNSUPPORTED";
  alertId: string | null;
}

/**
 * Alerta de AUSÊNCIA DA PLANILHA DO RELATÓRIO SEMANAL (.xlsx). Mesmas
 * garantias dos demais alertas de ausência: devido só após o prazo
 * semanal (deadline_weekday/deadline_time/timezone da configuração),
 * dentro da janela de monitoramento, quando o cronograma da semana FOI
 * recebido (a planilha viaja no mesmo envio semanal) e NENHUM
 * weekly_report_workbooks está ligado a intake daquela semana. Planilha
 * inválida/pendente de revisão conta como recebida (não é ausência).
 * Idempotente por (projeto, semana, kind) — UNIQUE no banco. Uma nova
 * semana gera um novo alerta; a chegada posterior é tratada por
 * resolveAbsenceAlertsWithEvidence.
 */
export async function createWeeklyWorkbookAbsenceAlert(
  store: AbsenceAlertStore,
  config: WeeklyScheduleIngestionConfig & { workbookAlertEnabled?: boolean },
  now: Date = new Date()
): Promise<AbsenceAlertOutcome> {
  const { weekStart, deadlineAt, isPastDeadline } = resolveCurrentWeekDeadline(now, config);
  const base = { projectId: config.projectId, weekStart, deadlineAt: deadlineAt.toISOString(), alertId: null };

  if (!config.enabled || config.workbookAlertEnabled === false) return { ...base, result: "DISABLED" };
  if (!store.hasWorkbookForWeek) return { ...base, result: "STORE_UNSUPPORTED" };
  if (!isWithinMonitoringWindow(now.toISOString(), config)) return { ...base, result: "OUTSIDE_WINDOW" };
  if (!isPastDeadline) return { ...base, result: "NOT_DUE" };
  if (!(await store.hasReceivedScheduleForWeek(config.projectId, weekStart))) return { ...base, result: "NO_SCHEDULE_YET" };
  if (await store.hasWorkbookForWeek(config.projectId, weekStart)) return { ...base, result: "RECEIVED" };

  const inserted = await store.insertAlert({
    projectId: config.projectId,
    configId: config.id,
    kind: "MISSING_WEEKLY_REPORT_WORKBOOK",
    weekStart,
    deadlineAt: deadlineAt.toISOString(),
    recipientUserIds: config.alertRecipientUserIds,
    detail: `Cronograma semanal recebido na semana de ${weekStart}, mas nenhuma planilha do relatório semanal (.xlsx) foi identificada nos anexos até o prazo-limite ${deadlineAt.toISOString()}.`,
  });
  if (!inserted.created) return { ...base, result: "ALREADY_ALERTED" };

  await store.writeAudit({
    projectId: config.projectId,
    action: "WEEKLY_REPORT_WORKBOOK_MISSING_ALERT_CREATED",
    entityType: "WEEKLY_SCHEDULE_INGESTION_ALERT",
    entityId: inserted.id ?? `${config.projectId}:${weekStart}:WORKBOOK`,
    detail: `Alerta de ausência da planilha do relatório semanal criado para a semana de ${weekStart}.`,
  });
  return { ...base, result: "CREATED", alertId: inserted.id };
}

export interface AbsenceResolutionOutcome {
  projectId: string;
  examined: number;
  resolved: number;
  resolvedAlertIds: string[];
}

/**
 * Chegada posterior da evidência resolve o alerta de ausência (resolved_at)
 * — e, por consequência, o caso de risco correspondente é encerrado pelo
 * ciclo de alertas (INGESTION_ALERT closed = resolved_at). Idempotente:
 * cada alerta é resolvido uma única vez; o que ainda não tem evidência
 * permanece aberto. Não cria, não reabre, não apaga nada.
 */
export async function resolveAbsenceAlertsWithEvidence(store: AbsenceAlertStore, projectId: string): Promise<AbsenceResolutionOutcome> {
  const outcome: AbsenceResolutionOutcome = { projectId, examined: 0, resolved: 0, resolvedAlertIds: [] };
  if (!store.listOpenAbsenceAlerts || !store.resolveAbsenceAlert) return outcome;
  const open: OpenAbsenceAlert[] = await store.listOpenAbsenceAlerts(projectId);
  for (const alert of open) {
    outcome.examined += 1;
    const hasEvidence = await absenceEvidenceExists(store, alert);
    if (!hasEvidence) continue;
    const detailSuffix = ` Evidência recebida posteriormente (${alert.kind}, semana de ${alert.weekStart}); alerta resolvido automaticamente.`;
    const resolved = await store.resolveAbsenceAlert(alert.id, `Resolvido:${detailSuffix}`);
    if (!resolved) continue;
    outcome.resolved += 1;
    outcome.resolvedAlertIds.push(alert.id);
    await store.writeAudit({
      projectId,
      action: "WEEKLY_ABSENCE_ALERT_RESOLVED",
      entityType: "WEEKLY_SCHEDULE_INGESTION_ALERT",
      entityId: alert.id,
      detail: `Alerta de ausência ${alert.kind} da semana de ${alert.weekStart} resolvido: evidência recebida posteriormente.`,
    });
  }
  return outcome;
}

async function absenceEvidenceExists(store: AbsenceAlertStore, alert: OpenAbsenceAlert): Promise<boolean> {
  switch (alert.kind) {
    case "MISSING_WEEKLY_SCHEDULE":
      return store.hasReceivedScheduleForWeek(alert.projectId, alert.weekStart);
    case "MISSING_S_CURVE":
      return store.hasSCurveForWeek(alert.projectId, alert.weekStart);
    case "MISSING_WEEKLY_REPORT_WORKBOOK":
      return store.hasWorkbookForWeek ? store.hasWorkbookForWeek(alert.projectId, alert.weekStart) : false;
    default:
      return false;
  }
}

export async function createWeeklyAbsenceAlert(
  store: AbsenceAlertStore,
  config: WeeklyScheduleIngestionConfig,
  now: Date = new Date()
): Promise<AbsenceAlertOutcome> {
  const { weekStart, deadlineAt, isPastDeadline } = resolveCurrentWeekDeadline(now, config);
  const base = { projectId: config.projectId, weekStart, deadlineAt: deadlineAt.toISOString(), alertId: null };

  if (!config.enabled) return { ...base, result: "DISABLED" };
  if (!isWithinMonitoringWindow(now.toISOString(), config)) return { ...base, result: "OUTSIDE_WINDOW" };
  if (!isPastDeadline) return { ...base, result: "NOT_DUE" };

  if (await store.hasReceivedScheduleForWeek(config.projectId, weekStart)) {
    return { ...base, result: "RECEIVED" };
  }

  const inserted = await store.insertAlert({
    projectId: config.projectId,
    configId: config.id,
    kind: "MISSING_WEEKLY_SCHEDULE",
    weekStart,
    deadlineAt: deadlineAt.toISOString(),
    recipientUserIds: config.alertRecipientUserIds,
    detail:
      `Nenhum cronograma semanal (.mpp) autorizado foi recebido na semana de ${weekStart} ` +
      `até o prazo-limite ${deadlineAt.toISOString()} (${config.timezone}).`,
  });

  if (!inserted.created) return { ...base, result: "ALREADY_ALERTED" };

  await store.writeAudit({
    projectId: config.projectId,
    action: "WEEKLY_SCHEDULE_MISSING_ALERT_CREATED",
    entityType: "WEEKLY_SCHEDULE_INGESTION_ALERT",
    entityId: inserted.id ?? `${config.projectId}:${weekStart}`,
    detail: `Alerta de ausência do cronograma semanal criado para a semana de ${weekStart}.`,
  });

  return { ...base, result: "CREATED", alertId: inserted.id };
}

/**
 * Alerta de AUSÊNCIA DA CURVA S (configurável: só quando
 * config.sCurveAlertEnabled). Devido quando o prazo semanal passou, o
 * cronograma semanal FOI recebido e nenhuma Curva S foi identificada
 * nos anexos daquela semana. Idempotente por (projeto, semana, kind).
 */
export async function createWeeklySCurveAbsenceAlert(
  store: AbsenceAlertStore,
  config: WeeklyScheduleIngestionConfig & { sCurveAlertEnabled?: boolean },
  now: Date = new Date()
): Promise<AbsenceAlertOutcome> {
  const { weekStart, deadlineAt, isPastDeadline } = resolveCurrentWeekDeadline(now, config);
  const base = { projectId: config.projectId, weekStart, deadlineAt: deadlineAt.toISOString(), alertId: null };

  if (!config.enabled || config.sCurveAlertEnabled === false) return { ...base, result: "DISABLED" };
  if (!isWithinMonitoringWindow(now.toISOString(), config)) return { ...base, result: "OUTSIDE_WINDOW" };
  if (!isPastDeadline) return { ...base, result: "NOT_DUE" };
  if (!(await store.hasReceivedScheduleForWeek(config.projectId, weekStart))) return { ...base, result: "NO_SCHEDULE_YET" };
  if (await store.hasSCurveForWeek(config.projectId, weekStart)) return { ...base, result: "RECEIVED" };

  const inserted = await store.insertAlert({
    projectId: config.projectId,
    configId: config.id,
    kind: "MISSING_S_CURVE",
    weekStart,
    deadlineAt: deadlineAt.toISOString(),
    recipientUserIds: config.alertRecipientUserIds,
    detail: `Relatório semanal recebido na semana de ${weekStart}, mas nenhuma Curva S foi identificada nos anexos até o prazo-limite ${deadlineAt.toISOString()}.`,
  });
  if (!inserted.created) return { ...base, result: "ALREADY_ALERTED" };

  await store.writeAudit({
    projectId: config.projectId,
    action: "WEEKLY_S_CURVE_MISSING_ALERT_CREATED",
    entityType: "WEEKLY_SCHEDULE_INGESTION_ALERT",
    entityId: inserted.id ?? `${config.projectId}:${weekStart}:S_CURVE`,
    detail: `Alerta de ausência da Curva S criado para a semana de ${weekStart}.`,
  });
  return { ...base, result: "CREATED", alertId: inserted.id };
}

/** Lote máximo de semanas verificadas por execução (o checkpoint garante que nenhuma semana é descartada). */
export const MISSED_WEEKS_MAX = 4;

export const MISSED_WEEKS_CHECKPOINT_ACTION = "WEEKLY_ABSENCE_WEEKS_VERIFIED_CHECKPOINT";
export const MISSED_WEEK_INTEGRATION_PENDING_ACTION = "WEEKLY_ABSENCE_INTEGRATION_PENDING";

export interface MissedWeekAlertOutcome {
  weekStart: string;
  deadlineAt: string;
  kind: AbsenceAlertRecord["kind"];
  result:
    | "CREATED_LATE"
    | "WOULD_CREATE_LATE"
    | "ALREADY_ALERTED"
    | "RECEIVED"
    | "INTEGRATION_PENDING"
    | "RECEIVED_NOT_PROCESSED"
    | "NO_SCHEDULE_YET"
    | "DISABLED"
    | "OUTSIDE_WINDOW"
    | "STORE_UNSUPPORTED";
  alertId: string | null;
  classification?: MissedWeekClassification;
  reasons?: MissedWeekReason[];
  responsibleAtTime?: ResponsibleAtTime;
}

export interface MissedWeeksOutcome {
  projectId: string;
  /** Semana inicial do lote (após o checkpoint ou o início do monitoramento). */
  startWeek: string | null;
  checkpointBefore: string | null;
  /** Checkpoint gravado por este lote (null em dry-run ou sem semanas verificadas). */
  checkpointAfter: string | null;
  examinedWeeks: string[];
  createdLate: number;
  integrationPending: number;
  /** true quando ainda há semanas vencidas depois do lote (a próxima execução continua). */
  moreWeeksPending: boolean;
  outcomes: MissedWeekAlertOutcome[];
}

function nextWeekStart(weekStart: string): string {
  const base = new Date(`${weekStart}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 7);
  return base.toISOString().slice(0, 10);
}

/** Primeira semana a verificar: depois do checkpoint; sem checkpoint, a do início do monitoramento; sem início, 4 semanas atrás. */
export function resolveFirstMissedWeek(
  checkpoint: string | null,
  config: Pick<WeeklyScheduleIngestionConfig, "monitoringStartAt" | "timezone">,
  currentWeekStart: string
): string {
  if (checkpoint) return nextWeekStart(checkpoint);
  if (config.monitoringStartAt) return resolveWeekStart(new Date(config.monitoringStartAt), config.timezone);
  let week = currentWeekStart;
  for (let i = 0; i < MISSED_WEEKS_MAX; i += 1) week = previousWeekStart(week);
  return week;
}

/**
 * RECUPERAÇÃO DE SEMANAS PERDIDAS, em lotes com checkpoint. A regra semanal só olha a semana corrente;
 * aqui verificamos, em ordem cronológica, as semanas vencidas desde o checkpoint (ou desde o início do
 * monitoramento), até `batchSize` por execução. O checkpoint (auditoria
 * WEEKLY_ABSENCE_WEEKS_VERIFIED_CHECKPOINT) garante que nenhuma semana é descartada.
 *
 * Cada semana sem cronograma aceito é CLASSIFICADA pela evidência efetiva de coleta e processamento:
 *   - CRONOGRAMA_NAO_RECEBIDO (coleta íntegra e caixa do responsável à época integrada): cria o alerta de
 *     ausência com a marca "detectado com atraso", a classificação e o responsável à época;
 *   - EVIDENCIA_INCOMPLETA_INTEGRACAO / RECEBIDO_NAO_PROCESSADO: NÃO cria alerta (ninguém é cobrado) e
 *     registra pendência de integração (WEEKLY_ABSENCE_INTEGRATION_PENDING).
 * Alertas criados aqui NÃO geram e-mail por padrão (trava de reemissão do ciclo de alertas).
 * `dryRun`: classifica sem gravar nada (nem alerta, nem auditoria, nem checkpoint).
 */
export async function createMissedWeekAbsenceAlerts(
  store: AbsenceAlertStore,
  config: WeeklyScheduleIngestionConfig & { sCurveAlertEnabled?: boolean; workbookAlertEnabled?: boolean },
  now: Date = new Date(),
  options: { batchSize?: number; dryRun?: boolean } = {}
): Promise<MissedWeeksOutcome> {
  const batchSize = Math.max(0, Math.floor(options.batchSize ?? MISSED_WEEKS_MAX));
  const dryRun = options.dryRun === true;
  const outcome: MissedWeeksOutcome = {
    projectId: config.projectId,
    startWeek: null,
    checkpointBefore: null,
    checkpointAfter: null,
    examinedWeeks: [],
    createdLate: 0,
    integrationPending: 0,
    moreWeeksPending: false,
    outcomes: [],
  };
  if (!config.enabled) return outcome;
  if (!store.loadMissedWeekEvidence || !store.loadMissedWeeksCheckpoint || (!dryRun && !store.saveMissedWeeksCheckpoint)) {
    // Sem evidência confiável não se declara ausência (nunca cobra sem prova).
    outcome.outcomes.push({ weekStart: "", deadlineAt: "", kind: "MISSING_WEEKLY_SCHEDULE", result: "STORE_UNSUPPORTED", alertId: null });
    return outcome;
  }

  const currentWeekStart = resolveCurrentWeekDeadline(now, config).weekStart;
  outcome.checkpointBefore = await store.loadMissedWeeksCheckpoint(config.projectId);
  let weekStart = resolveFirstMissedWeek(outcome.checkpointBefore, config, currentWeekStart);
  outcome.startWeek = weekStart;
  let lastVerified: string | null = null;

  while (weekStart < currentWeekStart) {
    const deadlineAt = resolveWeeklyDeadline(weekStart, config);
    if (deadlineAt.getTime() > now.getTime()) break;
    if (outcome.examinedWeeks.length >= batchSize) {
      outcome.moreWeeksPending = true;
      break;
    }
    const deadlineIso = deadlineAt.toISOString();
    const thisWeek = weekStart;
    outcome.examinedWeeks.push(thisWeek);
    lastVerified = thisWeek;
    weekStart = nextWeekStart(weekStart);
    const push = (o: Omit<MissedWeekAlertOutcome, "weekStart" | "deadlineAt">) => outcome.outcomes.push({ weekStart: thisWeek, deadlineAt: deadlineIso, ...o });

    if (!isWithinMonitoringWindow(deadlineIso, config)) {
      push({ kind: "MISSING_WEEKLY_SCHEDULE", result: "OUTSIDE_WINDOW", alertId: null });
      continue;
    }

    const evidence = await store.loadMissedWeekEvidence(config, thisWeek, deadlineAt);
    const { classification, reasons } = classifyMissedWeek(evidence, deadlineAt);
    const responsibleAtTime = evidence.responsibleAtTime;
    const candidates: Array<{ kind: MissedWeekAlertOutcome["kind"]; detail: string }> = [];

    if (classification === "RECEBIDO") {
      push({ kind: "MISSING_WEEKLY_SCHEDULE", result: "RECEIVED", alertId: null, classification });
    } else if (classification === "CRONOGRAMA_NAO_RECEBIDO") {
      const who = responsibleAtTime.isCurrent
        ? `responsável à época: usuário ${responsibleAtTime.userId ?? "?"} (atual)`
        : `responsável à época: usuário ${responsibleAtTime.userId ?? "?"} (anterior à transição — registro histórico, sem cobrança a quem saiu)`;
      candidates.push({
        kind: "MISSING_WEEKLY_SCHEDULE",
        detail: `[CRONOGRAMA_NAO_RECEBIDO; ${who}] Nenhum cronograma semanal (.mpp) autorizado foi recebido na semana de ${thisWeek} até o prazo-limite ${deadlineIso} (${config.timezone}); coleta íntegra e caixa do responsável integrada.`,
      });
    } else {
      outcome.integrationPending += 1;
      push({
        kind: "MISSING_WEEKLY_SCHEDULE",
        result: classification === "RECEBIDO_NAO_PROCESSADO" ? "RECEIVED_NOT_PROCESSED" : "INTEGRATION_PENDING",
        alertId: null,
        classification,
        reasons,
        responsibleAtTime,
      });
      if (!dryRun) {
        await store.writeAudit({
          projectId: config.projectId,
          action: MISSED_WEEK_INTEGRATION_PENDING_ACTION,
          entityType: "WEEKLY_SCHEDULE_INGESTION_CONFIG",
          entityId: `${config.projectId}:${thisWeek}`,
          detail: JSON.stringify({
            weekStart: thisWeek,
            deadlineAt: deadlineIso,
            classification,
            reasons,
            responsibleAtTime: { userId: responsibleAtTime.userId, source: responsibleAtTime.source, isCurrent: responsibleAtTime.isCurrent },
            note: "Sem alerta de ausência e sem cobrança ao responsável: pendência de integração/processamento.",
          }),
        });
      }
    }

    const scheduleReceived = classification === "RECEBIDO";
    if (config.sCurveAlertEnabled === false) push({ kind: "MISSING_S_CURVE", result: "DISABLED", alertId: null });
    else if (!scheduleReceived) push({ kind: "MISSING_S_CURVE", result: "NO_SCHEDULE_YET", alertId: null });
    else if (await store.hasSCurveForWeek(config.projectId, thisWeek)) push({ kind: "MISSING_S_CURVE", result: "RECEIVED", alertId: null });
    else
      candidates.push({
        kind: "MISSING_S_CURVE",
        detail: `Relatório semanal recebido na semana de ${thisWeek}, mas nenhuma Curva S foi identificada nos anexos até o prazo-limite ${deadlineIso}.`,
      });

    if (config.workbookAlertEnabled === false) push({ kind: "MISSING_WEEKLY_REPORT_WORKBOOK", result: "DISABLED", alertId: null });
    else if (!store.hasWorkbookForWeek) push({ kind: "MISSING_WEEKLY_REPORT_WORKBOOK", result: "STORE_UNSUPPORTED", alertId: null });
    else if (!scheduleReceived) push({ kind: "MISSING_WEEKLY_REPORT_WORKBOOK", result: "NO_SCHEDULE_YET", alertId: null });
    else if (await store.hasWorkbookForWeek(config.projectId, thisWeek)) push({ kind: "MISSING_WEEKLY_REPORT_WORKBOOK", result: "RECEIVED", alertId: null });
    else
      candidates.push({
        kind: "MISSING_WEEKLY_REPORT_WORKBOOK",
        detail: `Cronograma semanal recebido na semana de ${thisWeek}, mas nenhuma planilha do relatório semanal (.xlsx) foi identificada nos anexos até o prazo-limite ${deadlineIso}.`,
      });

    for (const candidate of candidates) {
      const extra = candidate.kind === "MISSING_WEEKLY_SCHEDULE" ? { classification, reasons, responsibleAtTime } : {};
      if (dryRun) {
        push({ kind: candidate.kind, result: "WOULD_CREATE_LATE", alertId: null, ...extra });
        continue;
      }
      const inserted = await store.insertAlert({
        projectId: config.projectId,
        configId: config.id,
        kind: candidate.kind,
        weekStart: thisWeek,
        deadlineAt: deadlineIso,
        recipientUserIds: config.alertRecipientUserIds,
        detail: formatLateDetectionDetail(now, deadlineAt, candidate.detail),
      });
      if (!inserted.created) {
        push({ kind: candidate.kind, result: "ALREADY_ALERTED", alertId: null, ...extra });
        continue;
      }
      outcome.createdLate += 1;
      push({ kind: candidate.kind, result: "CREATED_LATE", alertId: inserted.id, ...extra });
      await store.writeAudit({
        projectId: config.projectId,
        action: "WEEKLY_ABSENCE_ALERT_DETECTED_LATE",
        entityType: "WEEKLY_SCHEDULE_INGESTION_ALERT",
        entityId: inserted.id ?? `${config.projectId}:${thisWeek}:${candidate.kind}`,
        detail: `Alerta de ausência ${candidate.kind} da semana de ${thisWeek} detectado com atraso em ${now.toISOString()} (prazo original ${deadlineIso}). Sem e-mail automático: depende de decisão de reemissão.`,
      });
    }
  }

  if (!dryRun && lastVerified && store.saveMissedWeeksCheckpoint) {
    await store.saveMissedWeeksCheckpoint(config.projectId, lastVerified, {
      verifiedWeeks: outcome.examinedWeeks,
      createdLate: outcome.createdLate,
      integrationPending: outcome.integrationPending,
      at: now.toISOString(),
    });
    outcome.checkpointAfter = lastVerified;
  }
  return outcome;
}
