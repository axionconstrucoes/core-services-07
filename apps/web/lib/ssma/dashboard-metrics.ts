// Indicadores ESTRUTURADOS de SSMA para o Dashboard. Puro (sem rede/React), testável.
//
// Substitui a heurística por regex sobre texto livre: cada número vem de um campo definido do banco.
//  - Trilha A (formulários): `ssma_form_submissions` SUBMITTED; acidente = checklist `ocorrencia-acidente`,
//    classificação = campo `afastamento` ("Com afastamento" | "Sem afastamento").
//  - Trilha B (registros de campo): `ssma_field_records` + ação corretiva embutida.
//
// Regra de ouro: ZERO ≠ SEM DADO. Se a obra não tem nenhum registro SSMA (nem formulário nem registro de campo),
// todos os indicadores são `null` (o painel mostra "—"). Havendo qualquer registro, um indicador sem ocorrência
// é 0 de verdade. Nenhum valor é inventado ou estimado.

import { mapFieldRecordRow, summarizeFieldRecords, type FieldRecordRow } from "./field-records/field-record-view";

export const ACCIDENT_CHECKLIST_SLUG = "ocorrencia-acidente";
export const LEAVE_FIELD_ID = "afastamento";
export const WITH_LEAVE = "Com afastamento";
export const WITHOUT_LEAVE = "Sem afastamento";

export interface SsmaFormMetricsRow {
  checklist_slug: string | null;
  occurred_at: string | null;
  field_values: Record<string, unknown> | null;
}

/** Dois relatos (formulário de acidente × registro de campo OCORRÊNCIA) feitos até 24 h um do outro contam como o MESMO fato. */
export const SAME_FACT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SsmaDashboardMetrics {
  /** Há pelo menos um registro SSMA na obra (formulário enviado ou registro de campo). */
  hasData: boolean;
  /** Origem dos números, para rastreabilidade na tela. */
  sources: { forms: number; fieldRecords: number };
  /** Período coberto pelos dados (primeiro e último fato registrado, ISO); null sem dados. */
  period: { firstAt: string; lastAt: string } | null;
  /** Origem de cada total de ocorrências (antes de descontar duplicidade) e quantos relatos foram descontados por serem o mesmo fato. */
  occurrenceSources: { forms: number; fieldRecords: number; duplicatesDiscounted: number } | null;
  accidentsWithLeave: number | null;
  accidentsWithoutLeave: number | null;
  /** Acidentes registrados sem a classificação de afastamento (dado antigo/incompleto). */
  accidentsUnclassified: number | null;
  /** Ocorrências de segurança = acidentes (trilha A) + registros de campo OCORRÊNCIA (trilha B), sem contar duas vezes o mesmo fato. */
  occurrences: number | null;
  /** Dias desde o último acidente registrado; null se nunca houve acidente registrado (não há base para contar). */
  daysWithoutAccident: number | null;
  /** Ações corretivas ainda não concluídas / em atraso / registros críticos em aberto (trilha B). */
  openCorrectiveActions: number | null;
  overdueCorrectiveActions: number | null;
  criticalOpen: number | null;
}

function dayNumber(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 86_400_000);
}

export function computeSsmaDashboardMetrics(input: {
  forms: readonly SsmaFormMetricsRow[];
  fieldRecords: readonly FieldRecordRow[];
  /** AAAA-MM-DD (fuso do servidor/obra). */
  today: string;
}): SsmaDashboardMetrics {
  const { forms, fieldRecords, today } = input;
  const sources = { forms: forms.length, fieldRecords: fieldRecords.length };
  if (forms.length + fieldRecords.length === 0) {
    return {
      hasData: false,
      sources,
      period: null,
      occurrenceSources: null,
      accidentsWithLeave: null,
      accidentsWithoutLeave: null,
      accidentsUnclassified: null,
      occurrences: null,
      daysWithoutAccident: null,
      openCorrectiveActions: null,
      overdueCorrectiveActions: null,
      criticalOpen: null,
    };
  }

  const accidents = forms.filter((row) => row.checklist_slug === ACCIDENT_CHECKLIST_SLUG);
  const leaveOf = (row: SsmaFormMetricsRow) => (typeof row.field_values?.[LEAVE_FIELD_ID] === "string" ? (row.field_values[LEAVE_FIELD_ID] as string).trim() : "");
  const withLeave = accidents.filter((row) => leaveOf(row) === WITH_LEAVE).length;
  const withoutLeave = accidents.filter((row) => leaveOf(row) === WITHOUT_LEAVE).length;

  const views = fieldRecords.map((row) => mapFieldRecordRow(row, new Map()));
  const summary = summarizeFieldRecords(views, today);
  const fieldOccurrenceViews = views.filter((view) => view.kind === "OCORRENCIA");
  const fieldOccurrences = fieldOccurrenceViews.length;

  // Mesmo fato nas duas trilhas: um registro de campo OCORRÊNCIA até 24 h de um acidente do formulário, 1 para 1
  // (o formulário é a fonte oficial do acidente). Cada acidente "consome" no máximo um registro de campo.
  const accidentTimes = accidents.map((row) => (row.occurred_at ? new Date(row.occurred_at).getTime() : Number.NaN));
  const used = new Set<number>();
  let duplicatesDiscounted = 0;
  for (const view of [...fieldOccurrenceViews].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const at = new Date(view.occurredAt).getTime();
    let best = -1;
    let bestGap = Infinity;
    accidentTimes.forEach((time, index) => {
      if (used.has(index) || !Number.isFinite(time)) return;
      const gap = Math.abs(time - at);
      if (gap <= SAME_FACT_WINDOW_MS && gap < bestGap) { best = index; bestGap = gap; }
    });
    if (best >= 0) { used.add(best); duplicatesDiscounted += 1; }
  }

  const factTimes = [...forms.map((row) => row.occurred_at), ...fieldRecords.map((row) => row.occurred_at)]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const latestAccidentDay = accidents
    .map((row) => (row.occurred_at ? dayNumber(row.occurred_at) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const todayDay = dayNumber(`${today}T00:00:00Z`);

  return {
    hasData: true,
    sources,
    period: factTimes.length ? { firstAt: new Date(factTimes[0]).toISOString(), lastAt: new Date(factTimes[factTimes.length - 1]).toISOString() } : null,
    occurrenceSources: { forms: accidents.length, fieldRecords: fieldOccurrences, duplicatesDiscounted },
    accidentsWithLeave: withLeave,
    accidentsWithoutLeave: withoutLeave,
    accidentsUnclassified: accidents.length - withLeave - withoutLeave,
    occurrences: accidents.length + fieldOccurrences - duplicatesDiscounted,
    daysWithoutAccident: latestAccidentDay === undefined ? null : Math.max(0, todayDay - latestAccidentDay),
    openCorrectiveActions: summary.openActions,
    overdueCorrectiveActions: summary.overdueActions,
    criticalOpen: summary.critical,
  };
}
