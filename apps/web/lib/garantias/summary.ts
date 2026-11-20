// Indicadores da lista de garantias (puro). Sem casos => SEM DADOS (null), nunca zero. `today` = AAAA-MM-DD (injetado: sem data fixa).

import type { WarrantyCaseView } from "./types";
import { WARRANTY_OPEN_STATES } from "./labels";

export interface CaseSummary {
  total: number | null;
  open: number | null;
  reopened: number | null;
  overdue: number | null;
  highCritical: number | null;
}

export function summarizeCases(cases: readonly WarrantyCaseView[], today: string): CaseSummary {
  if (cases.length === 0) return { total: null, open: null, reopened: null, overdue: null, highCritical: null };
  const isOpen = (c: WarrantyCaseView) => (WARRANTY_OPEN_STATES as readonly string[]).includes(c.state);
  return {
    total: cases.length,
    open: cases.filter(isOpen).length,
    reopened: cases.filter((c) => c.reopenCount > 0).length,
    // prazo vencido: caso em aberto com prazo informado anterior a hoje (sem prazo não conta: SEM DADOS, não "no prazo")
    overdue: cases.filter((c) => isOpen(c) && c.dueDate !== null && c.dueDate < today).length,
    highCritical: cases.filter((c) => c.criticality === "HIGH" || c.criticality === "CRITICAL").length,
  };
}
