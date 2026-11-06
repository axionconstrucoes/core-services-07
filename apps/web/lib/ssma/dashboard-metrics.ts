// Indicadores ESTRUTURADOS de SSMA para o Dashboard. Puro (sem rede/React), testável.
//
// Substitui a heurística por regex sobre texto livre: cada número vem de um campo definido do banco.
//  - Trilha A (formulários): `ssma_form_submissions` SUBMITTED; acidente = checklist `ocorrencia-acidente`,
//    classificação = campo `afastamento` ("Com afastamento" | "Sem afastamento").
//  - Trilha B (registros de campo): `ssma_field_records` (+ ação corretiva embutida); quase-acidente = categoria
//    estruturada "Quase-acidente" (lista fechada).
//
// Regras de ouro:
//  - ZERO ≠ SEM DADO. Sem nenhum registro SSMA (nem formulário nem registro de campo) todos os indicadores são `null`.
//  - DUPLA CONTAGEM: acidente de formulário e ocorrência de campo próximos no tempo são apenas SUGESTÃO de duplicidade
//    ("possível duplicidade"). Só um VÍNCULO EXPLÍCITO confirmado por humano (decisão SAME_FACT em `ssma_incident_links`)
//    desconta um relato do total. Nada é descontado por proximidade; dois acidentes distintos no mesmo intervalo contam 2.

import { mapFieldRecordRow, summarizeFieldRecords, type FieldRecordRow } from "./field-records/field-record-view";

export const ACCIDENT_CHECKLIST_SLUG = "ocorrencia-acidente";
export const LEAVE_FIELD_ID = "afastamento";
export const WITH_LEAVE = "Com afastamento";
export const WITHOUT_LEAVE = "Sem afastamento";
/** Categoria estruturada (lista fechada de FIELD_RECORD_CATEGORIES) que define quase-acidente. */
export const NEAR_MISS_CATEGORY = "Quase-acidente";
/** Formulários (trilha A) com o campo estruturado de classificação: slug "riscos-apontados", campo `classificacao`. */
export const FORM_CLASSIFICATION_FIELD_ID = "classificacao";
export const FORM_NEAR_MISS_SLUGS: readonly string[] = ["riscos-apontados"];

/** Dois relatos feitos até 24 h um do outro são SUGERIDOS como possível mesmo fato (nunca descontados sozinhos). */
export const POSSIBLE_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SsmaFormMetricsRow {
  id?: string;
  checklist_slug: string | null;
  occurred_at: string | null;
  field_values: Record<string, unknown> | null;
}

export interface SsmaIncidentLinkRow {
  form_submission_id: string;
  field_record_id: string;
  decision: "SAME_FACT" | "DISTINCT_FACTS" | string;
}

export interface PossibleDuplicate {
  formSubmissionId: string;
  fieldRecordId: string;
  formOccurredAt: string;
  recordOccurredAt: string;
  gapMinutes: number;
}

export interface SsmaDashboardMetrics {
  /** Há pelo menos um registro SSMA na obra (formulário enviado ou registro de campo). */
  hasData: boolean;
  /** Origem dos números, para rastreabilidade na tela. */
  sources: { forms: number; fieldRecords: number };
  /** Período coberto pelos dados (primeiro e último fato registrado, ISO); null sem dados. */
  period: { firstAt: string; lastAt: string } | null;
  /** Origem de ocorrências: relatos por trilha, vínculos confirmados (descontados) e sugestões ainda sem decisão. */
  occurrenceSources: { forms: number; fieldRecords: number; confirmedSameFact: number; possibleDuplicates: number } | null;
  accidentsWithLeave: number | null;
  accidentsWithoutLeave: number | null;
  /** Acidentes registrados sem a classificação de afastamento (dado antigo/incompleto). */
  accidentsUnclassified: number | null;
  /** Ocorrências de segurança = acidentes (trilha A) + registros de campo OCORRÊNCIA (trilha B) − vínculos CONFIRMADOS. */
  occurrences: number | null;
  /**
   * Quase-acidentes = registros de campo com a categoria estruturada "Quase-acidente" + formulários "Riscos apontados" com
   * classificação "Quase-acidente"; origem (por trilha) e período próprios. Registros antigos sem classificação NÃO entram.
   * Atenção: o mesmo fato registrado nas duas trilhas não é descontado (não há vínculo para quase-acidente).
   */
  nearMisses: number | null;
  nearMissSource: { fieldRecords: number; forms: number; period: { firstAt: string; lastAt: string } | null } | null;
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

function span(times: number[]): { firstAt: string; lastAt: string } | null {
  const sorted = times.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  return sorted.length ? { firstAt: new Date(sorted[0]).toISOString(), lastAt: new Date(sorted[sorted.length - 1]).toISOString() } : null;
}

/**
 * Pares (formulário de acidente × registro de campo OCORRÊNCIA) até 24 h um do outro, 1 para 1 (o mais próximo primeiro),
 * que AINDA NÃO têm decisão humana. Servem para a revisão (confirmar "mesmo fato" ou "fatos distintos"); não alteram totais.
 */
export function findPossibleDuplicates(input: {
  forms: readonly SsmaFormMetricsRow[];
  fieldRecords: readonly FieldRecordRow[];
  links?: readonly SsmaIncidentLinkRow[];
}): PossibleDuplicate[] {
  const links = input.links ?? [];
  const decided = new Set(links.map((link) => `${link.form_submission_id}|${link.field_record_id}`));
  const sameForms = new Set(links.filter((link) => link.decision === "SAME_FACT").map((link) => link.form_submission_id));
  const sameRecords = new Set(links.filter((link) => link.decision === "SAME_FACT").map((link) => link.field_record_id));
  const accidents = input.forms.filter((row) => row.checklist_slug === ACCIDENT_CHECKLIST_SLUG && row.id && row.occurred_at && !sameForms.has(row.id));
  const occurrences = input.fieldRecords.filter((row) => row.kind === "OCORRENCIA" && !sameRecords.has(row.id));

  const pairs: Array<PossibleDuplicate & { gap: number }> = [];
  for (const form of accidents) {
    const formAt = new Date(form.occurred_at as string).getTime();
    for (const record of occurrences) {
      if (decided.has(`${form.id}|${record.id}`)) continue;
      const recordAt = new Date(record.occurred_at).getTime();
      const gap = Math.abs(formAt - recordAt);
      if (Number.isFinite(gap) && gap <= POSSIBLE_DUPLICATE_WINDOW_MS) {
        pairs.push({ formSubmissionId: form.id as string, fieldRecordId: record.id, formOccurredAt: form.occurred_at as string, recordOccurredAt: record.occurred_at, gapMinutes: Math.round(gap / 60_000), gap });
      }
    }
  }
  pairs.sort((a, b) => a.gap - b.gap || a.formSubmissionId.localeCompare(b.formSubmissionId) || a.fieldRecordId.localeCompare(b.fieldRecordId));
  const usedForms = new Set<string>();
  const usedRecords = new Set<string>();
  const result: PossibleDuplicate[] = [];
  for (const pair of pairs) {
    if (usedForms.has(pair.formSubmissionId) || usedRecords.has(pair.fieldRecordId)) continue;
    usedForms.add(pair.formSubmissionId);
    usedRecords.add(pair.fieldRecordId);
    result.push({ formSubmissionId: pair.formSubmissionId, fieldRecordId: pair.fieldRecordId, formOccurredAt: pair.formOccurredAt, recordOccurredAt: pair.recordOccurredAt, gapMinutes: pair.gapMinutes });
  }
  return result;
}

export function computeSsmaDashboardMetrics(input: {
  forms: readonly SsmaFormMetricsRow[];
  fieldRecords: readonly FieldRecordRow[];
  /** Decisões humanas sobre duplicidade (ssma_incident_links). Ausente/indisponível = nenhum vínculo (nada é descontado). */
  links?: readonly SsmaIncidentLinkRow[];
  /** AAAA-MM-DD (fuso do servidor/obra). */
  today: string;
}): SsmaDashboardMetrics {
  const { forms, fieldRecords, today } = input;
  const links = input.links ?? [];
  const sources = { forms: forms.length, fieldRecords: fieldRecords.length };
  if (forms.length + fieldRecords.length === 0) {
    return {
      hasData: false, sources, period: null, occurrenceSources: null,
      accidentsWithLeave: null, accidentsWithoutLeave: null, accidentsUnclassified: null, occurrences: null,
      nearMisses: null, nearMissSource: null, daysWithoutAccident: null,
      openCorrectiveActions: null, overdueCorrectiveActions: null, criticalOpen: null,
    };
  }

  const accidents = forms.filter((row) => row.checklist_slug === ACCIDENT_CHECKLIST_SLUG);
  const leaveOf = (row: SsmaFormMetricsRow) => (typeof row.field_values?.[LEAVE_FIELD_ID] === "string" ? (row.field_values[LEAVE_FIELD_ID] as string).trim() : "");
  const withLeave = accidents.filter((row) => leaveOf(row) === WITH_LEAVE).length;
  const withoutLeave = accidents.filter((row) => leaveOf(row) === WITHOUT_LEAVE).length;

  const views = fieldRecords.map((row) => mapFieldRecordRow(row, new Map()));
  const summary = summarizeFieldRecords(views, today);
  const fieldOccurrenceViews = views.filter((view) => view.kind === "OCORRENCIA");

  // Só vínculo SAME_FACT que aponta para um acidente e uma ocorrência realmente existentes, 1:1, desconta do total.
  const accidentIds = new Set(accidents.map((row) => row.id).filter((id): id is string => Boolean(id)));
  const occurrenceIds = new Set(fieldOccurrenceViews.map((view) => view.id));
  const usedForms = new Set<string>();
  const usedRecords = new Set<string>();
  let confirmedSameFact = 0;
  for (const link of links) {
    if (link.decision !== "SAME_FACT") continue;
    if (!accidentIds.has(link.form_submission_id) || !occurrenceIds.has(link.field_record_id)) continue;
    if (usedForms.has(link.form_submission_id) || usedRecords.has(link.field_record_id)) continue;
    usedForms.add(link.form_submission_id);
    usedRecords.add(link.field_record_id);
    confirmedSameFact += 1;
  }
  const possibleDuplicates = findPossibleDuplicates({ forms, fieldRecords, links }).length;

  const latestAccidentDay = accidents
    .map((row) => (row.occurred_at ? dayNumber(row.occurred_at) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const todayDay = dayNumber(`${today}T00:00:00Z`);
  const allTimes = [...forms.map((row) => row.occurred_at), ...fieldRecords.map((row) => row.occurred_at)]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime());
  const nearMissRows = fieldRecords.filter((row) => row.category === NEAR_MISS_CATEGORY);
  const nearMissForms = forms.filter(
    (row) => row.checklist_slug && FORM_NEAR_MISS_SLUGS.includes(row.checklist_slug) && String(row.field_values?.[FORM_CLASSIFICATION_FIELD_ID] ?? "").trim() === NEAR_MISS_CATEGORY
  );
  const nearMissTimes = [
    ...nearMissRows.map((row) => new Date(row.occurred_at).getTime()),
    ...nearMissForms.map((row) => (row.occurred_at ? new Date(row.occurred_at).getTime() : Number.NaN)),
  ];

  return {
    hasData: true,
    sources,
    period: span(allTimes),
    occurrenceSources: { forms: accidents.length, fieldRecords: fieldOccurrenceViews.length, confirmedSameFact, possibleDuplicates },
    accidentsWithLeave: withLeave,
    accidentsWithoutLeave: withoutLeave,
    accidentsUnclassified: accidents.length - withLeave - withoutLeave,
    occurrences: accidents.length + fieldOccurrenceViews.length - confirmedSameFact,
    nearMisses: nearMissRows.length + nearMissForms.length,
    nearMissSource: { fieldRecords: nearMissRows.length, forms: nearMissForms.length, period: span(nearMissTimes) },
    daysWithoutAccident: latestAccidentDay === undefined ? null : Math.max(0, todayDay - latestAccidentDay),
    openCorrectiveActions: summary.openActions,
    overdueCorrectiveActions: summary.overdueActions,
    criticalOpen: summary.critical,
  };
}
