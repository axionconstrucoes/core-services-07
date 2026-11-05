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

export interface SsmaDashboardMetrics {
  /** Há pelo menos um registro SSMA na obra (formulário enviado ou registro de campo). */
  hasData: boolean;
  /** Origem dos números, para rastreabilidade na tela. */
  sources: { forms: number; fieldRecords: number };
  accidentsWithLeave: number | null;
  accidentsWithoutLeave: number | null;
  /** Acidentes registrados sem a classificação de afastamento (dado antigo/incompleto). */
  accidentsUnclassified: number | null;
  /** Ocorrências de segurança = acidentes (trilha A) + registros de campo do tipo OCORRÊNCIA (trilha B). */
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
  const fieldOccurrences = views.filter((view) => view.kind === "OCORRENCIA").length;

  const latestAccidentDay = accidents
    .map((row) => (row.occurred_at ? dayNumber(row.occurred_at) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const todayDay = dayNumber(`${today}T00:00:00Z`);

  return {
    hasData: true,
    sources,
    accidentsWithLeave: withLeave,
    accidentsWithoutLeave: withoutLeave,
    accidentsUnclassified: accidents.length - withLeave - withoutLeave,
    occurrences: accidents.length + fieldOccurrences,
    daysWithoutAccident: latestAccidentDay === undefined ? null : Math.max(0, todayDay - latestAccidentDay),
    openCorrectiveActions: summary.openActions,
    overdueCorrectiveActions: summary.overdueActions,
    criticalOpen: summary.critical,
  };
}
