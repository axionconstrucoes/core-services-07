// Diferenca de DATAS entre duas revisoes do cronograma - PURA, sem I/O.
//
// Complementa compare-schedule-versions.ts (que agrega: atraso do marco final,
// marcos contratuais que escorregaram, duracoes, caminho critico) listando, por
// atividade, a alteracao de inicio/termino entre a revisao de referencia e a
// atual, e os marcos AMEACADOS. Produz so FATOS mensuraveis (dias de
// deslocamento, folga, percentual); nenhuma causa de atraso nem impacto
// contratual e inferido aqui (isso exige evidencia humana/documental).
//
// Casamento de atividades: mesma chave de compare-schedule-versions
// (unique_id -> external_task_id -> wbs+nome). Atividades-resumo sao ignoradas.

import type { ContextScheduleActivity } from "../../ai/context/types";
import { activityKey, toDays, type ScheduleSnapshot } from "./compare-schedule-versions";

export interface ActivityDateChange {
  key: string;
  name: string;
  isMilestone: boolean;
  isCritical: boolean;
  startBefore: string | null;
  startAfter: string | null;
  startDeltaDays: number | null;
  endBefore: string | null;
  endAfter: string | null;
  endDeltaDays: number | null;
}

export type ThreatReason = "SLIPPED" | "LOW_FLOAT" | "OVERDUE_NOT_COMPLETE";

export interface ThreatenedMilestone {
  key: string;
  name: string;
  plannedEnd: string | null;
  slipDays: number | null;
  totalFloatDays: number | null;
  reasons: ThreatReason[];
}

export interface ScheduleDateComparison {
  currentScheduleVersionId: string;
  referenceScheduleVersionId: string;
  /** Atividades (folhas) casadas nas duas revisoes. */
  matched: number;
  /** Atividades cujo inicio OU termino mudou. */
  changed: ActivityDateChange[];
  /** Folhas que existem so na atual / so na referencia (nunca "perdidas" em silencio). */
  addedKeys: string[];
  removedKeys: string[];
  postponedCount: number;
  advancedCount: number;
  maxPostponementDays: number | null;
  threatenedMilestones: ThreatenedMilestone[];
}

export interface ScheduleDateComparisonOptions {
  /** Instante de referencia (ISO) quando a revisao nao traz status_date. */
  asOf: string;
  /** Folga total (dias) igual ou abaixo da qual um marco e considerado ameacado. Padrao 0. */
  lowFloatDays?: number;
  /** Limita o tamanho das listas devolvidas (padrao 200). */
  maxItems?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value.length === 10 ? `${value}T00:00:00Z` : value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function diffDays(after: string | null, before: string | null): number | null {
  const a = dateMs(after);
  const b = dateMs(before);
  if (a === null || b === null) return null;
  return Math.round((a - b) / DAY_MS);
}

function isLeaf(activity: ContextScheduleActivity): boolean {
  return activity.isSummaryTask !== true;
}

function isComplete(activity: ContextScheduleActivity): boolean {
  const percent = activity.percentComplete === null || activity.percentComplete === undefined ? null : Number(activity.percentComplete);
  if (percent !== null && Number.isFinite(percent)) return percent >= 100;
  return activity.status === "CONCLUIDA";
}

export function compareScheduleDates(
  current: ScheduleSnapshot,
  reference: ScheduleSnapshot,
  options: ScheduleDateComparisonOptions
): ScheduleDateComparison {
  const maxItems = options.maxItems ?? 200;
  const lowFloat = options.lowFloatDays ?? 0;
  const referenceByKey = new Map(reference.activities.filter(isLeaf).map((a) => [activityKey(a), a]));
  const currentLeaves = current.activities.filter(isLeaf);
  const currentKeys = new Set(currentLeaves.map(activityKey));
  const statusRef = dateMs(current.statusDate) ?? dateMs(options.asOf);

  const changed: ActivityDateChange[] = [];
  const threatened: ThreatenedMilestone[] = [];
  const addedKeys: string[] = [];
  let matched = 0;
  let postponed = 0;
  let advanced = 0;
  let maxPostponement: number | null = null;

  for (const activity of currentLeaves) {
    const key = activityKey(activity);
    const before = referenceByKey.get(key);
    if (!before) {
      addedKeys.push(key);
      continue;
    }
    matched += 1;
    const startDelta = diffDays(activity.plannedStart, before.plannedStart);
    const endDelta = diffDays(activity.plannedEnd, before.plannedEnd);
    if ((startDelta ?? 0) !== 0 || (endDelta ?? 0) !== 0) {
      changed.push({
        key,
        name: activity.name,
        isMilestone: activity.isMilestone === true,
        isCritical: activity.isCritical === true,
        startBefore: before.plannedStart,
        startAfter: activity.plannedStart,
        startDeltaDays: startDelta,
        endBefore: before.plannedEnd,
        endAfter: activity.plannedEnd,
        endDeltaDays: endDelta,
      });
      const worst = Math.max(startDelta ?? 0, endDelta ?? 0);
      const best = Math.min(startDelta ?? 0, endDelta ?? 0);
      if (worst > 0) postponed += 1;
      else if (best < 0) advanced += 1;
      if (endDelta !== null && (maxPostponement === null || endDelta > maxPostponement)) maxPostponement = endDelta;
    }

    if (activity.isMilestone === true) {
      const reasons: ThreatReason[] = [];
      if (endDelta !== null && endDelta > 0) reasons.push("SLIPPED");
      const floatDays = toDays(activity.totalFloatValue, activity.totalFloatUnit);
      if (floatDays !== null && floatDays <= lowFloat) reasons.push("LOW_FLOAT");
      const end = dateMs(activity.plannedEnd);
      if (statusRef !== null && end !== null && end < statusRef && !isComplete(activity)) reasons.push("OVERDUE_NOT_COMPLETE");
      if (reasons.length > 0) {
        threatened.push({ key, name: activity.name, plannedEnd: activity.plannedEnd, slipDays: endDelta, totalFloatDays: floatDays, reasons });
      }
    }
  }

  const removedKeys = [...referenceByKey.keys()].filter((key) => !currentKeys.has(key));

  changed.sort((a, b) => (b.endDeltaDays ?? 0) - (a.endDeltaDays ?? 0));
  threatened.sort((a, b) => b.reasons.length - a.reasons.length || (b.slipDays ?? 0) - (a.slipDays ?? 0));

  return {
    currentScheduleVersionId: current.scheduleVersionId,
    referenceScheduleVersionId: reference.scheduleVersionId,
    matched,
    changed: changed.slice(0, maxItems),
    addedKeys: addedKeys.slice(0, maxItems),
    removedKeys: removedKeys.slice(0, maxItems),
    postponedCount: postponed,
    advancedCount: advanced,
    maxPostponementDays: maxPostponement,
    threatenedMilestones: threatened.slice(0, maxItems),
  };
}
