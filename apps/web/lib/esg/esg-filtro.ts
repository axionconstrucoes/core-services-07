// Filtros do drill-down do Dashboard -> /[projectId]/esg?filtro=<valor>.
// Puro. Filtro inválido é ignorado (retorna null).

import type { EsgBucket } from "@/lib/dashboard-visual/compute-esg-summary";

export const ESG_FILTROS = {
  cumpridas: { bucket: "cumprida", label: "Cumpridas" },
  pendentes: { bucket: "pendente", label: "Pendentes" },
  vencidas: { bucket: "vencida", label: "Vencidas" },
  revisao: { bucket: "aguardandoRevisao", label: "Aguardando revisão" },
  evidencias: { bucket: "evidenciaPendente", label: "Evidências pendentes" },
} as const satisfies Record<string, { bucket: EsgBucket; label: string }>;

export type EsgFiltro = keyof typeof ESG_FILTROS;

export function parseEsgFiltro(value: string | string[] | undefined): EsgFiltro | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && Object.prototype.hasOwnProperty.call(ESG_FILTROS, raw) ? (raw as EsgFiltro) : null;
}
