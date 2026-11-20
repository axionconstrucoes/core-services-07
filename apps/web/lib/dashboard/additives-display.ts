// Valor de "Aditivos" do Dashboard: SOMENTE da fonte estruturada
// (project_additional_proposals CONTRACTED + ADITIVO_CONTRATUAL, via
// computeAditivosContratuaisSummary). Não existe valor de contrato-base em
// nenhuma tabela, então NUNCA se deriva "aditivo = total - base" com número
// fixo no código. Sem aditivo formalizado = "sem fonte" (null), não zero.
// Puro, sem I/O.

export interface AdditivesDisplayInput {
  /** Quantidade de aditivos contratuais formalizados na fonte estruturada. */
  quantity: number;
  /** Soma dos acréscimos/reduções formalizados. */
  netValue: number;
}

export interface AdditivesDisplay {
  /** null = sem fonte estruturada (dado ausente, não zero). */
  value: number | null;
  status: "FORMALIZED" | "NO_SOURCE";
  source: string;
}

export const ADDITIVES_SOURCE_LABEL =
  "Aditivos contratuais formalizados (propostas adicionais contratadas como aditivo contratual)";

export function resolveAdditivesDisplay(input: AdditivesDisplayInput | null | undefined): AdditivesDisplay {
  if (!input || !Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.netValue)) {
    return { value: null, status: "NO_SOURCE", source: ADDITIVES_SOURCE_LABEL };
  }
  return { value: input.netValue, status: "FORMALIZED", source: ADDITIVES_SOURCE_LABEL };
}

export function formatAdditivesMil(display: AdditivesDisplay): string {
  return display.value === null ? "Sem fonte" : `R$ ${Math.round(display.value / 1000).toLocaleString("pt-BR")}`;
}
