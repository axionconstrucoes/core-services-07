// Reprocessamento APENAS DE EXIBIÇÃO da aba Financeiro já extraída — puro.
//
// Recalcula as métricas informativas (método CUTOFF_CLOSED_MONTHS_V2 com a
// referência do próprio relatório) a partir dos DADOS JÁ EXTRAÍDOS. Nunca
// toca classificação, motivos ou alertas da aba (o fingerprint dos casos não
// muda => nenhum caso é alterado e nada é notificado). O valor anterior é
// preservado DENTRO das métricas (previousMetrics/previousCutoffDate; o
// original da primeira execução nunca é sobrescrito). Idempotente pelo hash
// das entradas.

import { createHash } from "node:crypto";

import { analyzeFinancialSheet, type FinancialPreviousVersion } from "./analyze-sheets";
import { resolveReportReference } from "./report-reference";
import type { FinancialColumnKey, FinancialSheetData } from "./types";

export const FINANCIAL_DISPLAY_REPROCESS_VERSION = "FIN_DISPLAY_V1";

export interface FinancialDisplayReprocessInput {
  sheetId: string;
  sheetStatus: string;
  data: FinancialSheetData;
  currentMetrics: Record<string, unknown> | null;
  currentCutoffDate: string | null;
  columnLetters: Partial<Record<FinancialColumnKey, string>> | null;
  fileName: string | null;
  emailSentDate: string | null;
  emailSubject: string | null;
  subjectWeekLabel: string | null;
  contentWeekLabel: string | null;
  /** Último salvamento do arquivo (Brasília, AAAA-MM-DD) lido do pacote; null quando ausente. */
  documentModifiedDate: string | null;
  previousVersions: FinancialPreviousVersion[];
}

export interface FinancialDisplayReprocessPlan {
  sheetId: string;
  action: "UPDATE" | "SKIP_UNCHANGED" | "SKIP_HUMAN_CUTOFF" | "SKIP_NO_DATA";
  inputsHash: string;
  newMetrics: Record<string, unknown> | null;
  /** Nova data de corte gravada (null quando não mensurável). Corte definido por humano nunca é alterado. */
  newCutoffDate: string | null;
  summary: {
    referenceDate: string | null;
    referenceSource: string;
    cutoffDate: string | null;
    baseKind: string;
    comparable: boolean;
    reasons: string[];
    plannedAtCutoff: number | null;
    actualAtCutoff: number | null;
    deviationPercent: number | null;
    previousDeviationPercent: number | null;
    previousMethod: string;
  };
}

const HUMAN_STATUSES = new Set(["HUMAN_MAPPED", "HUMAN_VALIDATED"]);

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function planFinancialDisplayReprocess(input: FinancialDisplayReprocessInput): FinancialDisplayReprocessPlan {
  const current = input.currentMetrics ?? {};
  const original = (current.previousMetrics as Record<string, unknown> | undefined) ?? current;
  const previousMethod = typeof original.method === "string" ? original.method : "LEGACY_FULL_HORIZON";
  const previousDeviationPercent = num((original.legacyFullHorizon as Record<string, unknown> | undefined)?.deviationPercent) ?? num(original.deviationPercent);

  const inputsHash = stableHash({
    v: FINANCIAL_DISPLAY_REPROCESS_VERSION,
    data: input.data,
    letters: input.columnLetters,
    fileName: input.fileName,
    emailSentDate: input.emailSentDate,
    emailSubject: input.emailSubject,
    subjectWeekLabel: input.subjectWeekLabel,
    contentWeekLabel: input.contentWeekLabel,
    documentModifiedDate: input.documentModifiedDate,
    previousVersions: input.previousVersions,
  });

  const empty = (action: FinancialDisplayReprocessPlan["action"]): FinancialDisplayReprocessPlan => ({
    sheetId: input.sheetId,
    action,
    inputsHash,
    newMetrics: null,
    newCutoffDate: input.currentCutoffDate,
    summary: { referenceDate: null, referenceSource: "NONE", cutoffDate: input.currentCutoffDate, baseKind: "UNKNOWN", comparable: false, reasons: [], plannedAtCutoff: null, actualAtCutoff: null, deviationPercent: null, previousDeviationPercent, previousMethod },
  });
  if (!Array.isArray(input.data?.rows) || input.data.rows.length === 0) return empty("SKIP_NO_DATA");

  const reference = resolveReportReference({
    emailSentDate: input.emailSentDate,
    emailSubject: input.emailSubject,
    subjectWeekLabel: input.subjectWeekLabel,
    fileName: input.fileName,
    contentWeekLabel: input.contentWeekLabel,
    documentModifiedDate: input.documentModifiedDate,
  });
  // Limites NÃO entram: o reprocessamento é só de exibição (classificação intocada).
  const analysis = analyzeFinancialSheet(input.data, [], { reference, previousVersions: input.previousVersions, fileName: input.fileName, reportWeekLabel: input.subjectWeekLabel, columnLetters: input.columnLetters });
  const m = analysis.metrics as Record<string, unknown>;

  const humanCutoff = HUMAN_STATUSES.has(input.sheetStatus) && input.currentCutoffDate !== null;
  const newMetrics: Record<string, unknown> = {
    ...m,
    displayOnlyAlerts: analysis.alerts,
    previousMetrics: original,
    previousCutoffDate: (current.previousMetrics ? current.previousCutoffDate : input.currentCutoffDate) ?? null,
    displayReprocess: { version: FINANCIAL_DISPLAY_REPROCESS_VERSION, inputsHash, documentModifiedDate: input.documentModifiedDate },
  };
  const summary: FinancialDisplayReprocessPlan["summary"] = {
    referenceDate: (m.referenceDate as string | null) ?? null,
    referenceSource: String(m.referenceSource ?? "NONE"),
    cutoffDate: (m.cutoffDate as string | null) ?? null,
    baseKind: String(m.baseKind ?? "UNKNOWN"),
    comparable: Boolean(m.comparable),
    reasons: (m.notMeasurableReasons as string[]) ?? [],
    plannedAtCutoff: num(m.plannedTotal),
    actualAtCutoff: num(m.actualTotal),
    deviationPercent: num(m.deviationPercent),
    previousDeviationPercent,
    previousMethod,
  };

  const already = (current.displayReprocess as { inputsHash?: string } | undefined)?.inputsHash === inputsHash;
  return {
    sheetId: input.sheetId,
    action: already ? "SKIP_UNCHANGED" : humanCutoff ? "SKIP_HUMAN_CUTOFF" : "UPDATE",
    inputsHash,
    newMetrics,
    newCutoffDate: humanCutoff ? input.currentCutoffDate : summary.cutoffDate,
    summary,
  };
}

/** Linha de log SEM valores monetários, nomes ou ids (repositório público): id opaco + datas + flags. */
export function maskedPlanLine(plan: FinancialDisplayReprocessPlan): string {
  const s = plan.summary;
  const opaque = createHash("sha256").update(plan.sheetId).digest("hex").slice(0, 8);
  const reason = s.comparable ? "-" : s.reasons.length ? (s.reasons[0].startsWith("referência") ? "REFERENCIA" : "OUTRO") : "-";
  return [opaque, plan.action, `ref=${s.referenceDate ?? "-"}`, `fonte=${s.referenceSource}`, `corte=${s.cutoffDate ?? "-"}`, `base=${s.baseKind}`, `mensuravel=${s.comparable ? "sim" : "nao"}`, `motivo=${reason}`].join(" ");
}
