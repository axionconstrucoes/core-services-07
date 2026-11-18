// Análise PURA das abas extraídas: métricas, cruzamentos e risco por
// limites do projeto. Fatos separados de inferências; sem limite =>
// REVIEW_REQUIRED informando os limites ausentes; nada é inventado.
//
// Separação inviolável: avanço físico (Curva S) × financeiro × recursos
// (Histograma) × SSMA — cada aba tem métricas próprias e nunca mistura
// unidades. A aba Linha de Base é WEEKLY_REPORT_BASELINE_SHEET e é
// COMPARADA com a OFFICIAL_SCHEDULE_BASELINE do MPP — jamais a substitui.

import type { ExpertId } from "../../ai/types";
import { analyzeSCurve, crossCheckSCurveWithMpp, type MppFactsForCrossCheck } from "../s-curve/analyze-s-curve";
import { classifySCurveRisk } from "../s-curve/classify-s-curve-risk";
import type { SCurveMetrics } from "../s-curve/types";
import type { ReportReference } from "./report-reference";
import type { ScheduleRiskClassification, ScheduleRiskDimension, ScheduleRiskThreshold } from "../weekly-ingestion/types";
import type {
  BaselineSheetData,
  CurvaSSheetData,
  FinancialColumnKey,
  FinancialSheetData,
  HistogramSheetData,
  SheetAlert,
  SsmaSheetData,
  WeeklyReportSheetCategory,
} from "./types";

export const SHEET_EXPERT: Record<WeeklyReportSheetCategory, ExpertId> = {
  CURVA_S: "planning-director",
  LINHA_BASE: "planning-director",
  HISTOGRAMA: "planning-director",
  FINANCEIRO: "commercial-director",
  SSMA: "esg-director",
};

/** Consolidador multidisciplinar existente (síntese; nunca substitui decisão humana). */
export const WEEKLY_REPORT_CONSOLIDATOR: ExpertId = "ceo";

export function routeSheetToExpert(category: WeeklyReportSheetCategory): ExpertId {
  return SHEET_EXPERT[category];
}

type Severity = Exclude<ScheduleRiskClassification, "REVIEW_REQUIRED">;

function severityFor(value: number, threshold: ScheduleRiskThreshold): Severity {
  if (value >= threshold.critical) return "CRITICAL";
  if (value >= threshold.high) return "HIGH";
  if (value >= threshold.medium) return "MEDIUM";
  return "LOW";
}

function classifySingle(
  dimension: ScheduleRiskDimension,
  value: number | null,
  adverse: boolean,
  thresholds: ScheduleRiskThreshold[]
): { classification: ScheduleRiskClassification; reasons: string[]; missing: ScheduleRiskDimension[] } {
  const threshold = thresholds.find((item) => item.dimension === dimension);
  if (value === null) return { classification: "REVIEW_REQUIRED", reasons: [`${dimension}: não mensurável nesta aba.`], missing: [] };
  if (!threshold) {
    return {
      classification: "REVIEW_REQUIRED",
      reasons: [`${dimension}: sem limite configurado para o projeto${adverse ? " — variação adversa exige revisão" : ""}. Limite ausente: ${dimension}.`],
      missing: [dimension],
    };
  }
  const severity = adverse ? severityFor(value, threshold) : "LOW";
  return { classification: severity, reasons: [`${dimension}: ${value} => ${severity} (limites ${threshold.medium}/${threshold.high}/${threshold.critical}).`], missing: [] };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------------
// CURVA S
// ------------------------------------------------------------------

export interface CurvaSContext {
  mppFacts: MppFactsForCrossCheck | null;
  previousDeviationPp: number | null;
  baselineSheet: BaselineSheetData | null;
  extractionConfidence: number;
  thresholds: ScheduleRiskThreshold[];
  workWeekLabel: string | null;
}

export function analyzeCurvaSSheet(data: CurvaSSheetData, context: CurvaSContext) {
  const metrics: SCurveMetrics = analyzeSCurve(data.series, { cutoffDate: data.cutoffDate, previousDeviationPp: context.previousDeviationPp });
  const crossCheck = crossCheckSCurveWithMpp(metrics, context.mppFacts, { extractionConfidence: context.extractionConfidence, sCurveWorkWeekLabel: context.workWeekLabel });
  const risk = classifySCurveRisk(metrics, crossCheck, context.thresholds, { extractionConfidence: context.extractionConfidence });
  const alerts: SheetAlert[] = crossCheck.issues.map((issue) => ({ code: issue.code, detail: issue.detail, severity: issue.code === "LOW_CONFIDENCE" ? "WARNING" : "CRITICAL" }));

  // Curva S planejada × aba Linha de Base (planejado do próprio Excel).
  const baselinePlanned = context.baselineSheet?.plannedSeries;
  const planned = data.series.find((series) => series.type === "PHYSICAL_PLANNED");
  if (baselinePlanned && planned && metrics.cutoffPeriod) {
    const basePoint = baselinePlanned.points.find((point) => point.period === metrics.cutoffPeriod);
    const curvePoint = planned.points.find((point) => point.period === metrics.cutoffPeriod);
    if (basePoint && curvePoint && Math.abs(basePoint.value - curvePoint.value) > 0.05) {
      alerts.push({
        code: "PLANNED_DIFFERS_FROM_BASELINE_SHEET",
        detail: `Planejado da Curva S (${curvePoint.value}%) difere da aba Linha de Base (${basePoint.value}%) no período ${metrics.cutoffPeriod} — possível replanejamento sem aprovação.`,
        severity: "WARNING",
      });
    }
  }
  return { metrics: { ...metrics, mppCrossCheck: crossCheck }, crossCheck, risk, alerts };
}

// ------------------------------------------------------------------
// LINHA DE BASE (comparação, nunca substituição)
// ------------------------------------------------------------------

export interface OfficialBaselineFacts {
  scheduleVersionId: string;
  finalPlannedDate: string | null;
  milestones: Array<{ name: string; plannedEnd: string | null }>;
}

export interface BaselineSheetContext {
  officialBaseline: OfficialBaselineFacts | null;
  previousBaselineSheet: BaselineSheetData | null;
  curvaS: CurvaSSheetData | null;
  thresholds: ScheduleRiskThreshold[];
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function analyzeBaselineSheet(data: BaselineSheetData, context: BaselineSheetContext) {
  const alerts: SheetAlert[] = [];
  const divergences: Array<{ code: string; detail: string; days?: number }> = [];

  if (!context.officialBaseline) {
    alerts.push({ code: "OFFICIAL_BASELINE_NOT_SET", detail: "Baseline oficial do MPP não definida — a aba Linha de Base NÃO a substitui; defina a baseline oficial com justificativa.", severity: "WARNING" });
  } else {
    const finalDelta = daysBetween(data.finalPlannedDate, context.officialBaseline.finalPlannedDate);
    if (finalDelta !== null && finalDelta !== 0) {
      divergences.push({ code: "FINAL_DATE_DIFFERS", detail: `Data final da aba Linha de Base (${data.finalPlannedDate}) difere da baseline oficial do MPP (${context.officialBaseline.finalPlannedDate}) em ${finalDelta} dia(s).`, days: Math.abs(finalDelta) });
    }
    const officialByName = new Map(context.officialBaseline.milestones.map((milestone) => [normalizeName(milestone.name), milestone]));
    for (const row of data.rows.filter((item) => item.isMilestone && item.plannedEnd)) {
      const official = officialByName.get(normalizeName(row.label));
      if (!official) continue;
      const delta = daysBetween(row.plannedEnd, official.plannedEnd);
      if (delta !== null && delta !== 0) divergences.push({ code: "MILESTONE_DIFFERS", detail: `Marco "${row.label}": aba ${row.plannedEnd} × baseline oficial ${official.plannedEnd} (${delta} dia(s)).`, days: Math.abs(delta) });
    }
  }

  // Alteração retroativa / mudança da linha planejada vs semana anterior.
  if (context.previousBaselineSheet?.plannedSeries && data.plannedSeries) {
    const previous = new Map(context.previousBaselineSheet.plannedSeries.points.map((point) => [point.period, point.value]));
    const changed = data.plannedSeries.points.filter((point) => previous.has(point.period) && Math.abs((previous.get(point.period) ?? 0) - point.value) > 0.05);
    if (changed.length > 0) {
      divergences.push({ code: "PLANNED_LINE_CHANGED", detail: `Linha planejada alterada em ${changed.length} período(s) já reportado(s) (alteração retroativa/revisão sem aprovação): ${changed.slice(0, 5).map((point) => point.period).join(", ")}.` });
    }
  }
  // Percentuais planejados diferentes da Curva S.
  if (context.curvaS && data.plannedSeries) {
    const curvePlanned = context.curvaS.series.find((series) => series.type === "PHYSICAL_PLANNED");
    if (curvePlanned) {
      const byPeriod = new Map(curvePlanned.points.map((point) => [point.period, point.value]));
      const mismatched = data.plannedSeries.points.filter((point) => byPeriod.has(point.period) && Math.abs((byPeriod.get(point.period) ?? 0) - point.value) > 0.05);
      if (mismatched.length > 0) divergences.push({ code: "PLANNED_PERCENT_DIFFERS_FROM_CURVE", detail: `Percentuais planejados da aba divergem da Curva S em ${mismatched.length} período(s).` });
    }
  }

  for (const divergence of divergences) alerts.push({ code: divergence.code, detail: divergence.detail, severity: "WARNING" });
  const maxDays = divergences.reduce<number | null>((max, item) => (item.days !== undefined && (max === null || item.days > max) ? item.days : max), null);
  const risk = classifySingle("BASELINE_SHEET_DIVERGENCE_DAYS", context.officialBaseline ? (maxDays ?? 0) : null, divergences.length > 0, context.thresholds);
  if (divergences.length > 0 && risk.classification !== "REVIEW_REQUIRED") {
    risk.reasons.push("Qualquer mudança de baseline exige revisão humana, justificativa, usuário, data, histórico e permissão — a aba nunca substitui a baseline oficial.");
  }
  return {
    metrics: { finalPlannedDate: data.finalPlannedDate, rowCount: data.rows.length, milestoneCount: data.rows.filter((row) => row.isMilestone).length, divergences, officialBaselineScheduleVersionId: context.officialBaseline?.scheduleVersionId ?? null },
    crossCheck: { officialBaseline: context.officialBaseline, divergenceCount: divergences.length, maxDivergenceDays: maxDays },
    risk,
    alerts,
  };
}

// ------------------------------------------------------------------
// FINANCEIRO
// ------------------------------------------------------------------

/**
 * Natureza dos valores da aba financeira, inferida SOMENTE dos cabeçalhos.
 * BILLING_PRODUCTION: realizado = faturamento/medição/produção (receita do
 * contrato) — ficar ABAIXO do previsto é atraso de execução financeira,
 * NUNCA estouro de custo. COST: custo/desembolso — ficar ACIMA é adverso.
 * UNKNOWN: direção adversa indefinida => REVIEW_REQUIRED.
 */
export type FinancialValueNature = "BILLING_PRODUCTION" | "COST" | "UNKNOWN";

export function detectFinancialValueNature(data: Pick<FinancialSheetData, "headers" | "columns">): FinancialValueNature {
  const realizadoHeader = data.columns.realizado ?? data.columns.acumulado_realizado ?? "";
  const headerText = data.headers.join(" | ");
  const costInRealizado = /custo|cost|desembols|despesa/i.test(realizadoHeader);
  const billingInRealizado = /fatur|medi[çc]|receita|produ[çc]/i.test(realizadoHeader);
  if (costInRealizado && !billingInRealizado) return "COST";
  if (billingInRealizado) return "BILLING_PRODUCTION";
  const billing = /fatur|medi[çc][ãa]o|receita/i.test(headerText);
  const cost = /custo|cost|desembols|despesa/i.test(headerText);
  if (billing && !cost) return "BILLING_PRODUCTION";
  if (cost && !billing) return "COST";
  return "UNKNOWN";
}

export interface FinancialAnalysisContext {
  /** Data de referência do relatório (envio do e-mail semanal, AAAA-MM-DD). Sem ela não há corte. */
  referenceDate?: string | null;
  /** Semana do pacote (e-mail). */
  reportWeekLabel?: string | null;
  fileName?: string | null;
  /** Letras das colunas na aba (locator) — rastreabilidade até a célula. */
  columnLetters?: Partial<Record<FinancialColumnKey, string>> | null;
  /** Referência resolvida do PRÓPRIO relatório (prevalece sobre referenceDate). */
  reference?: ReportReference | null;
  /** Versões anteriores da aba (mesmo projeto), da mais antiga à mais recente — evidência de reprevisão. */
  previousVersions?: FinancialPreviousVersion[] | null;
}

export interface FinancialPreviousVersion {
  label: string | null;
  rows: Array<{ period: string; previsto: number | null }>;
}

/**
 * Natureza do PREVISTO da planilha:
 * REFORECAST — evidência de reprevisão (previsto = realizado em mês encerrado
 * ou previsto do mesmo mês alterado entre versões semanais);
 * DECLARED_BASELINE_UNVERIFIED — cabeçalho declara linha de base, sem evidência contrária;
 * UNKNOWN — sem evidência. Nunca "linha de base aprovada" sem documento de aprovação.
 */
export type FinancialBaseKind = "REFORECAST" | "DECLARED_BASELINE_UNVERIFIED" | "UNKNOWN";

export const FINANCIAL_BASE_DISCLAIMER =
  "Proximidade entre previsto e realizado NÃO comprova cumprimento da meta original: o previsto desta planilha pode ser reprevisto a cada semana (meses encerrados ajustados ao realizado). Indicador apenas informativo.";

export function classifyFinancialBase(
  data: Pick<FinancialSheetData, "columns" | "rows">,
  closedPeriods: string[],
  previousVersions: FinancialPreviousVersion[] = []
): { baseKind: FinancialBaseKind; evidence: string[] } {
  const evidence: string[] = [];
  const closedSet = new Set(closedPeriods);
  const equal = data.rows.filter(
    (row) => closedSet.has(row.period) && typeof row.values.previsto === "number" && typeof row.values.realizado === "number" && Math.abs((row.values.previsto as number) - (row.values.realizado as number)) < 0.01
  );
  if (equal.length) evidence.push(`Previsto igual ao realizado em ${equal.length} mês(es) encerrado(s): ${equal.map((row) => row.period.slice(0, 7)).join(", ")}.`);
  const current = new Map(data.rows.map((row) => [row.period, typeof row.values.previsto === "number" ? (row.values.previsto as number) : null]));
  for (const version of previousVersions) {
    for (const row of version.rows) {
      const now = current.get(row.period);
      if (typeof now === "number" && typeof row.previsto === "number" && Math.abs(now - row.previsto) >= 0.01) {
        evidence.push(`Previsto de ${row.period.slice(0, 7)} difere entre versões: ${round2(row.previsto)} (${version.label ?? "outra versão"}) × ${round2(now)} (este relatório).`);
      }
    }
  }
  if (evidence.length) return { baseKind: "REFORECAST", evidence: evidence.slice(0, 20) };
  const header = data.columns.previsto ?? data.columns.acumulado_previsto ?? "";
  if (/linha\s+de\s+base|baseline|\bLB\s?\d|contratual|aprovad/i.test(header)) return { baseKind: "DECLARED_BASELINE_UNVERIFIED", evidence: [`Cabeçalho "${header}" declara linha de base (aprovação não verificada).`] };
  return { baseKind: "UNKNOWN", evidence: [] };
}

export type FinancialPeriodStatus = "CLOSED" | "CURRENT_PARTIAL" | "FUTURE" | "UNDATED";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Data civil em Brasília (AAAA-MM-DD) de um instante ISO; inválido => null. */
export function toBrasiliaDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function monthBounds(date: string): { start: string; end: string } | null {
  if (!ISO_DATE.test(date)) return null;
  const [y, m] = date.split("-").map(Number);
  const month = String(m).padStart(2, "0");
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${month}-01`, end: `${y}-${month}-${String(lastDay).padStart(2, "0")}` };
}

function isMonthlySeries(rows: FinancialSheetData["rows"]): boolean {
  if (rows.length === 0) return false;
  const months = new Set<string>();
  for (const row of rows) {
    if (!row.date || !ISO_DATE.test(row.date) || !row.date.endsWith("-01")) return false;
    const key = row.date.slice(0, 7);
    if (months.has(key)) return false;
    months.add(key);
  }
  return true;
}

function weekLabelOfFile(fileName: string | null | undefined): string | null {
  const match = fileName ? /\bW\s*(\d{1,3})\b/i.exec(fileName) : null;
  return match ? `W${Number(match[1])}` : null;
}

type FinancialRow = FinancialSheetData["rows"][number];

/**
 * Indicador FINANCIAL_DEVIATION_PERCENT corrigido (método CUTOFF_CLOSED_MONTHS_V2).
 *
 * Fórmula: desvio% = (Realizado acumulado até o corte − Previsto acumulado
 * até o MESMO corte) / |Previsto até o corte| × 100. Negativo = realizado
 * abaixo do previsto.
 *
 * Corte = fim do último mês CALENDÁRIO encerrado antes da data de
 * referência do relatório (não o último mês com valor ≠ 0 — zero é dado
 * válido). O mês corrente (parcial) e os futuros ficam FORA: nunca se
 * compara mês parcial com previsto do mês inteiro, e não há rateio linear.
 * Sem data de referência, série não mensal, valor ausente/fórmula sem valor
 * armazenado num mês encerrado, previsto zero ou natureza indefinida =>
 * NÃO MENSURÁVEL (REVIEW_REQUIRED) com o motivo.
 *
 * O cálculo ANTIGO (realizado parcial × previsto de todo o horizonte) é
 * preservado em metrics.legacyFullHorizon para rastreabilidade.
 */
export function analyzeFinancialSheet(data: FinancialSheetData, thresholds: ScheduleRiskThreshold[], context: FinancialAnalysisContext = {}) {
  const sum = (key: FinancialColumnKey, rows: FinancialRow[] = data.rows) => {
    const values = rows.map((row) => row.values[key]).filter((value): value is number => typeof value === "number");
    return values.length ? round2(values.reduce((acc, value) => acc + value, 0)) : null;
  };
  const last = (key: FinancialColumnKey) => {
    for (let i = data.rows.length - 1; i >= 0; i -= 1) {
      const value = data.rows[i].values[key];
      if (typeof value === "number") return value;
    }
    return null;
  };

  // ---- Indicador ORIGINAL (preservado; NÃO usado para classificar) ----
  const legacyPlanned = last("acumulado_previsto") ?? sum("previsto");
  const legacyActual = last("acumulado_realizado") ?? sum("realizado");
  const legacyFullHorizon = {
    method: "LEGACY_FULL_HORIZON",
    note: "Realizado parcial comparado com o previsto de TODO o horizonte (inclui meses futuros) — substituído por CUTOFF_CLOSED_MONTHS_V2.",
    plannedTotal: legacyPlanned,
    actualTotal: legacyActual,
    deviationAbsolute: legacyPlanned !== null && legacyActual !== null ? round2(legacyActual - legacyPlanned) : null,
    deviationPercent: legacyPlanned && legacyActual !== null ? round2(((legacyActual - legacyPlanned) / Math.abs(legacyPlanned)) * 100) : null,
  };

  const alerts: SheetAlert[] = [];
  const notMeasurable: string[] = [];
  if (data.unit === "PERCENT") alerts.push({ code: "FINANCIAL_IN_PERCENT", detail: "Aba financeira em percentual — não confundir com avanço físico.", severity: "INFO" });

  const valueNature = detectFinancialValueNature(data);
  // Referência do PRÓPRIO relatório (report-reference.ts) prevalece; a data
  // avulsa (envio) só é usada quando o chamador não resolveu a referência.
  const reference = context.reference ?? null;
  const referenceDate = reference
    ? reference.referenceDate
    : context.referenceDate && ISO_DATE.test(context.referenceDate)
      ? context.referenceDate
      : null;
  if (reference) {
    for (const warning of reference.warnings) alerts.push({ code: warning.code, detail: warning.detail, severity: "WARNING" });
    for (const blocker of reference.blockers) notMeasurable.push(`referência do relatório: ${blocker}`);
  }
  const fileWeek = weekLabelOfFile(context.fileName);
  if (!reference && fileWeek && context.reportWeekLabel && fileWeek.toUpperCase() !== context.reportWeekLabel.toUpperCase()) {
    alerts.push({
      code: "FILE_WEEK_LABEL_DIFFERS",
      detail: `Arquivo rotulado ${fileWeek} anexado ao pacote ${context.reportWeekLabel} — corte definido pela data de referência do pacote (${referenceDate ?? "ausente"}).`,
      severity: "INFO",
    });
  }

  const monthly = isMonthlySeries(data.rows);
  const periodStatus = (row: FinancialRow): FinancialPeriodStatus => {
    const bounds = row.date ? monthBounds(row.date) : null;
    if (!bounds || !referenceDate || !monthly) return "UNDATED";
    if (bounds.end < referenceDate) return "CLOSED";
    if (bounds.start > referenceDate) return "FUTURE";
    return "CURRENT_PARTIAL";
  };
  const classified = data.rows.map((row) => ({ row, status: periodStatus(row) }));
  const closed = classified.filter((item) => item.status === "CLOSED").map((item) => item.row);
  const current = classified.filter((item) => item.status === "CURRENT_PARTIAL").map((item) => item.row);
  const future = classified.filter((item) => item.status === "FUTURE").map((item) => item.row);

  if (!referenceDate && !(reference && reference.blockers.length)) notMeasurable.push("data de referência do relatório ausente — sem data de corte não há comparação na mesma data");
  if (!monthly) notMeasurable.push("série não é mensal com datas inequívocas — sem distribuição aprovada para obter o previsto na data de corte (rateio linear não é usado)");
  if (referenceDate && monthly && closed.length === 0) notMeasurable.push("nenhum mês encerrado antes da data de referência");
  if (valueNature === "UNKNOWN") notMeasurable.push("natureza dos valores (faturamento/medição × custo) não identificada nos cabeçalhos — direção adversa indefinida");

  const lastClosed = closed.length ? closed[closed.length - 1] : null;
  const useCumulative = Boolean(lastClosed && typeof lastClosed.values.acumulado_previsto === "number" && typeof lastClosed.values.acumulado_realizado === "number");
  const previstoKey: FinancialColumnKey = useCumulative ? "acumulado_previsto" : "previsto";
  const realizadoKey: FinancialColumnKey = useCumulative ? "acumulado_realizado" : "realizado";

  const unavailableCells: string[] = [];
  const missingCells: string[] = [];
  const zeroPeriods: string[] = [];
  const checkRows = useCumulative && lastClosed ? [lastClosed] : closed;
  for (const row of checkRows) {
    for (const key of [previstoKey, realizadoKey]) {
      const value = row.values[key];
      if (typeof value === "number") {
        if (value === 0) zeroPeriods.push(`${row.period} (${key})`);
        continue;
      }
      (row.unavailable?.includes(key) ? unavailableCells : missingCells).push(`${row.period} (${key})`);
    }
  }
  if (unavailableCells.length) notMeasurable.push(`fórmula sem valor armazenado em mês encerrado: ${unavailableCells.join(", ")}`);
  if (missingCells.length) notMeasurable.push(`valor ausente em mês encerrado: ${missingCells.join(", ")}`);
  if (zeroPeriods.length) {
    alerts.push({ code: "ZERO_VALUE_IN_CLOSED_PERIOD", detail: `Valor zero em mês encerrado tratado como dado válido (não descartado): ${zeroPeriods.join(", ")}. Confirme se é zero real.`, severity: "WARNING" });
  }

  const futureWithActual = future.filter((row) => typeof row.values.realizado === "number" && row.values.realizado !== 0);
  if (futureWithActual.length) {
    alerts.push({ code: "FUTURE_PERIOD_HAS_ACTUAL", detail: `Realizado preenchido em mês futuro em relação à referência: ${futureWithActual.map((row) => row.period).join(", ")} — ignorado no cálculo; revisar a planilha.`, severity: "WARNING" });
  }
  for (const row of current) {
    alerts.push({
      code: "PARTIAL_PERIOD_EXCLUDED",
      detail: `Mês corrente ${row.period} excluído (parcial na data ${referenceDate}): realizado ${row.values.realizado ?? "—"} × previsto do mês inteiro ${row.values.previsto ?? "—"} não são comparáveis.`,
      severity: "INFO",
    });
  }

  const plannedAtCutoff = useCumulative && lastClosed ? (lastClosed.values.acumulado_previsto as number) : closed.length ? sum(previstoKey, closed) : null;
  const actualAtCutoff = useCumulative && lastClosed ? (lastClosed.values.acumulado_realizado as number) : closed.length ? sum(realizadoKey, closed) : null;
  if (notMeasurable.length === 0 && (plannedAtCutoff === null || plannedAtCutoff === 0)) {
    notMeasurable.push("previsto acumulado zero ou ausente na data de corte — percentual indefinido");
  }

  // Previsto reescrito com o realizado em meses encerrados: a coluna
  // "previsto" funciona como reprevisão, não como linha de base aprovada.
  const rebased = closed.filter(
    (row) => typeof row.values.previsto === "number" && typeof row.values.realizado === "number" && Math.abs((row.values.previsto as number) - (row.values.realizado as number)) < 0.01
  );
  if (rebased.length) {
    alerts.push({
      code: "PLAN_EQUALS_ACTUAL_IN_CLOSED_PERIODS",
      detail: `Previsto idêntico ao realizado em ${rebased.length} de ${closed.length} mês(es) encerrado(s) (${rebased.map((row) => row.period).join(", ")}) — indício de reprevisão; o previsto da planilha pode não ser a linha de base aprovada.`,
      severity: "WARNING",
    });
  }

  const base = classifyFinancialBase(data, closed.map((row) => row.period), context.previousVersions ?? []);
  if (base.baseKind === "REFORECAST") {
    alerts.push({ code: "BASE_IS_REFORECAST", detail: `Previsto da planilha é REPREVISÃO, não linha de base aprovada (${base.evidence.length} evidência(s)). ${FINANCIAL_BASE_DISCLAIMER}`, severity: "WARNING" });
  }

  const measurable = notMeasurable.length === 0;
  const cutoffDate = lastClosed?.date ? (monthBounds(lastClosed.date)?.end ?? null) : null;
  const deviationAbsolute = measurable ? round2((actualAtCutoff as number) - (plannedAtCutoff as number)) : null;
  const deviationPercent = measurable ? round2((((actualAtCutoff as number) - (plannedAtCutoff as number)) / Math.abs(plannedAtCutoff as number)) * 100) : null;
  const adverse = deviationPercent !== null && (valueNature === "COST" ? deviationPercent > 0 : deviationPercent < 0);

  const letters = context.columnLetters ?? {};
  const cellOf = (key: FinancialColumnKey, row: FinancialRow) => (letters[key] && row.sourceRow ? `${letters[key]}${row.sourceRow}` : null);
  const sources = closed.map((row) => ({
    period: row.period,
    previsto: row.values[previstoKey] ?? null,
    previstoCell: cellOf(previstoKey, row),
    realizado: row.values[realizadoKey] ?? null,
    realizadoCell: cellOf(realizadoKey, row),
  }));

  // Tendência: desvio por mês ENCERRADO (nunca o mês parcial/futuro).
  const periodDeviations = closed
    .map((row) => (typeof row.values.previsto === "number" && typeof row.values.realizado === "number" ? row.values.realizado - row.values.previsto : null))
    .filter((value): value is number => value !== null);
  const recent = periodDeviations.slice(-3);
  const trend = recent.length >= 2 ? (recent[recent.length - 1] > recent[0] ? "IMPROVING" : recent[recent.length - 1] < recent[0] ? "WORSENING" : "STABLE") : "UNKNOWN";

  let risk: { classification: ScheduleRiskClassification; reasons: string[]; missing: ScheduleRiskDimension[] };
  if (!measurable) {
    risk = { classification: "REVIEW_REQUIRED", reasons: [`FINANCIAL_DEVIATION_PERCENT: não mensurável na mesma data de corte — ${notMeasurable.join("; ")}.`], missing: [] };
  } else {
    risk = classifySingle("FINANCIAL_DEVIATION_PERCENT", Math.abs(deviationPercent as number), adverse, thresholds);
    const meaning =
      valueNature === "BILLING_PRODUCTION"
        ? `realizado (faturamento/medição) ${(deviationPercent as number) < 0 ? "abaixo" : "acima"} do previsto até ${cutoffDate} — execução financeira, NÃO estouro de custo`
        : `custo realizado ${(deviationPercent as number) > 0 ? "acima" : "abaixo"} do previsto até ${cutoffDate}`;
    risk.reasons.push(
      `Desvio ${deviationPercent}% (${meaning}); referência ${referenceDate} (${reference ? reference.source : "informada"}), ${closed.length} mês(es) encerrado(s); base do previsto: ${base.baseKind}.` +
        (base.baseKind === "REFORECAST" ? " Proximidade previsto×realizado não comprova cumprimento da meta original." : "")
    );
  }

  const cumulative = data.rows.map((row) => ({ period: row.period, previsto: row.values.acumulado_previsto ?? null, realizado: row.values.acumulado_realizado ?? null }));
  return {
    metrics: {
      unit: data.unit,
      columnsMapped: Object.keys(data.columns),
      method: "CUTOFF_CLOSED_MONTHS_V2",
      informativeOnly: true,
      baseKind: base.baseKind,
      baseEvidence: base.evidence,
      baseDisclaimer: FINANCIAL_BASE_DISCLAIMER,
      referenceSource: reference ? reference.source : referenceDate ? "PROVIDED" : "NONE",
      reportWeekLabel: reference?.reportWeekLabel ?? context.reportWeekLabel ?? null,
      referenceWeekLabels: reference?.weekLabels ?? null,
      valueNature,
      referenceDate,
      cutoffDate,
      comparable: measurable,
      notMeasurableReasons: notMeasurable,
      periods: classified.map((item) => ({ period: item.row.period, status: item.status })),
      sources,
      plannedTotal: measurable ? plannedAtCutoff : null,
      actualTotal: measurable ? actualAtCutoff : null,
      deviationAbsolute,
      deviationPercent,
      trend,
      legacyFullHorizon,
      // Colunas de fluxo: soma dos meses ENCERRADOS até o corte.
      medido: sum("medido", closed),
      faturado: sum("faturado", closed),
      recebido: sum("recebido", closed),
      custo: sum("custo", closed),
      receita: sum("receita", closed),
      desembolso: sum("desembolso", closed),
      cumulative,
    },
    crossCheck: null,
    risk,
    alerts,
  };
}

// ------------------------------------------------------------------
// HISTOGRAMA
// ------------------------------------------------------------------

export function analyzeHistogramSheet(
  data: HistogramSheetData,
  context: { thresholds: ScheduleRiskThreshold[]; physicalTrend: SCurveMetrics["trend"] | null; physicalDeviationPp: number | null; criticalActivityCount: number | null }
) {
  const planned = data.rows.map((row) => row.planned).filter((value): value is number => value !== null);
  const actual = data.rows.map((row) => row.actual).filter((value): value is number => value !== null);
  const plannedTotal = planned.length ? round2(planned.reduce((a, b) => a + b, 0)) : null;
  const actualTotal = actual.length ? round2(actual.reduce((a, b) => a + b, 0)) : null;
  const shortfallPercent = plannedTotal && actualTotal !== null ? round2(((plannedTotal - actualTotal) / plannedTotal) * 100) : null;
  const perPeriod = data.rows.filter((row) => row.planned !== null && row.actual !== null).map((row) => ({ period: row.period, category: row.category, gap: round2((row.actual ?? 0) - (row.planned ?? 0)) }));
  const recent = perPeriod.slice(-3).map((item) => item.gap);
  const trend = recent.length >= 2 ? (recent[recent.length - 1] > recent[0] ? "IMPROVING" : recent[recent.length - 1] < recent[0] ? "WORSENING" : "STABLE") : "UNKNOWN";

  const alerts: SheetAlert[] = [];
  if (data.resourceType === "UNKNOWN") alerts.push({ code: "RESOURCE_TYPE_UNKNOWN", detail: "Tipo de recurso não identificado — não presumido como mão de obra.", severity: "INFO" });
  if (shortfallPercent !== null && shortfallPercent > 0 && (context.physicalTrend === "AGGRAVATION" || (context.physicalDeviationPp ?? 0) < 0)) {
    alerts.push({ code: "INSUFFICIENT_RESOURCES_FOR_RECOVERY", detail: `Recursos ${shortfallPercent}% abaixo do previsto com avanço físico atrasado/agravando — indício de insuficiência de recursos para recuperação.`, severity: "CRITICAL" });
  }
  if (shortfallPercent !== null && shortfallPercent < 0) alerts.push({ code: "RESOURCE_EXCESS", detail: `Recursos ${Math.abs(shortfallPercent)}% acima do previsto.`, severity: "INFO" });
  if (context.criticalActivityCount !== null && context.criticalActivityCount > 0 && shortfallPercent !== null && shortfallPercent > 0) {
    alerts.push({ code: "SHORTFALL_WITH_CRITICAL_ACTIVITIES", detail: `${context.criticalActivityCount} atividade(s) crítica(s) no MPP com falta de recursos (${shortfallPercent}%).`, severity: "WARNING" });
  }
  const risk = classifySingle("HISTOGRAM_SHORTFALL_PERCENT", shortfallPercent === null ? null : Math.max(0, shortfallPercent), shortfallPercent !== null && shortfallPercent > 0, context.thresholds);
  return { metrics: { resourceType: data.resourceType, resourceEvidence: data.resourceEvidence, unit: data.unit, plannedTotal, actualTotal, shortfallPercent, trend, perPeriod: perPeriod.slice(0, 200) }, crossCheck: { physicalTrend: context.physicalTrend, physicalDeviationPp: context.physicalDeviationPp, criticalActivityCount: context.criticalActivityCount }, risk, alerts };
}

// ------------------------------------------------------------------
// SSMA (componente do relatório semanal; alimenta o Expert ESG/SSMA)
// ------------------------------------------------------------------

export function analyzeSsmaSheet(data: SsmaSheetData) {
  const latest = data.indicators.map((indicator) => {
    const values = indicator.values.filter((item) => item.value !== null);
    const last = values[values.length - 1] ?? null;
    const previous = values[values.length - 2] ?? null;
    return {
      key: indicator.key,
      label: indicator.label,
      latest: last?.value ?? null,
      latestPeriod: last?.period ?? null,
      previous: previous?.value ?? null,
      trend: last && previous ? (last.value! > previous.value! ? "UP" : last.value! < previous.value! ? "DOWN" : "STABLE") : "UNKNOWN",
    };
  });
  const alerts: SheetAlert[] = [];
  for (const item of latest) {
    if (/acidente|incidente|quase_acidentes|desvios/.test(item.key) && item.latest !== null && item.latest > 0) {
      alerts.push({ code: "SSMA_OCCURRENCE", detail: `${item.label}: ${item.latest} no período ${item.latestPeriod}.`, severity: /acidentes(_com_afastamento)?$/.test(item.key) ? "CRITICAL" : "WARNING" });
    }
  }
  return {
    metrics: { indicators: latest, classificationNote: "Componente do RELATORIO_SEMANAL_PLANEJAMENTO (não é RELATORIO_DIARIO_SSMA_ESG); avaliação pelo Expert ESG/SSMA." },
    crossCheck: null,
    risk: { classification: null as ScheduleRiskClassification | null, reasons: ["Risco SSMA é avaliado pelo Expert ESG/SSMA com os indicadores extraídos."], missing: [] as ScheduleRiskDimension[] },
    alerts,
  };
}
