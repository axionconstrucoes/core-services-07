import { normalizeText } from "./tax-id";

// Adiantamentos: valor adiantado != saldo não amortizado != saldo devido != valor indenizável.
export interface AdvanceInput {
  advancedAmount: number;
  amortizations: number[];
  guaranteedLimit?: number | null;
  policyMaxAmount?: number | null;
  /** Informados por quem tem a fonte; NUNCA derivados aqui. */
  balanceDueInformed?: number | null;
  indemnifiableInformed?: number | null;
}
export interface AdvanceBalance {
  advanced: number;
  amortized: number;
  unamortized: number;
  balanceDueInformed: number | null;
  indemnifiableInformed: number | null;
  guarantee: "SUFICIENTE" | "INSUFICIENTE" | "SEM_DADOS";
  uncoveredExcess: number | null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeAdvanceBalance(a: AdvanceInput): AdvanceBalance {
  const amortized = r2(a.amortizations.reduce((s, x) => s + x, 0));
  const unamortized = r2(a.advancedAmount - amortized);
  const ceilings = [a.guaranteedLimit, a.policyMaxAmount].filter((x): x is number => typeof x === "number");
  let guarantee: AdvanceBalance["guarantee"] = "SEM_DADOS";
  let excess: number | null = null;
  if (unamortized <= 0) {
    guarantee = "SUFICIENTE";
    excess = 0;
  } else if (ceilings.length) {
    const minCeil = Math.min(...ceilings);
    guarantee = unamortized > minCeil ? "INSUFICIENTE" : "SUFICIENTE";
    excess = Math.max(r2(unamortized - minCeil), 0);
  }
  return {
    advanced: a.advancedAmount,
    amortized,
    unamortized,
    balanceDueInformed: a.balanceDueInformed ?? null,
    indemnifiableInformed: a.indemnifiableInformed ?? null,
    guarantee,
    uncoveredExcess: excess,
  };
}
export function canAmortize(a: AdvanceInput, amount: number): boolean {
  return amount > 0 && computeAdvanceBalance(a).unamortized >= amount;
}

// ---------------------------------------------------------------------------------------------------------------------------
// CONSOLIDAÇÃO (Fase 4 / B): soma de adiantamentos, amortizado e saldo SEM DUPLA CONTAGEM. Espelha insurance_advances_consolidated
// (SQL, migration 20261125203000) — paridade testada em Postgres real. Aritmética em centavos (sem erro de ponto flutuante).
//   * adiantamento duplicado = mesma apólice + nº de contrato normalizado + data + valor + fonte; conta UMA vez (o mais antigo) e as
//     amortizações do duplicado passam ao mantido; amortização duplicada = mesmo valor + data + fonte, conta UMA vez;
//   * amortizado efetivo nunca excede o adiantado (excesso é sinalizado, nunca vira saldo negativo);
//   * teto da apólice = importância segurada; limites por adiantamento não são somados; sem teto => SEM_DADOS.
// ---------------------------------------------------------------------------------------------------------------------------

export interface AmortizationRow {
  id: string;
  amount: number;
  amortizedOn?: string | null;
  sourceDocumentId?: string | null;
  sourceRef?: string | null;
  createdAt: string;
}
export interface AdvanceRow {
  id: string;
  policyId?: string | null;
  contractNumber?: string | null;
  advanceDate?: string | null;
  advancedAmount: number;
  guaranteedLimit?: number | null;
  sourceDocumentId?: string | null;
  sourceRef?: string | null;
  createdAt: string;
  amortizations: AmortizationRow[];
}
export type GuaranteeStatus = "SUFICIENTE" | "INSUFICIENTE" | "SEM_DADOS";
export interface ConsolidatedAdvance {
  id: string;
  policyId: string | null;
  advanced: number;
  amortized: number;
  unamortized: number;
  overAmortized: boolean;
  overAmount: number;
  guarantee: GuaranteeStatus;
  uncoveredExcess: number | null;
}
export interface ConsolidatedPolicy {
  policyId: string | null;
  advances: number;
  advanced: number;
  amortized: number;
  unamortized: number;
  ceiling: number | null;
  guarantee: GuaranteeStatus;
  uncoveredExcess: number | null;
}
export interface ConsolidatedAdvances {
  totals: { advanced: number; amortized: number; unamortized: number; advances: number; duplicateAdvances: number; duplicateAmortizations: number; overAmortized: number };
  advances: ConsolidatedAdvance[];
  byPolicy: ConsolidatedPolicy[];
  duplicates: { advances: Array<{ id: string; duplicateOf: string }>; amortizations: Array<{ id: string; duplicateOf: string }> };
}

const cents = (n: number): number => Math.round(n * 100);
const fromCents = (c: number): number => c / 100;
const fmt2 = (n: number): string => n.toFixed(2);
const byCreated = <T extends { id: string; createdAt: string }>(a: T, b: T): number => {
  const d = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
const sourceKey = (doc: string | null | undefined, ref: string | null | undefined): string => doc ?? normalizeText(ref);

function guaranteeOf(unam: number, ceiling: number | null): { guarantee: GuaranteeStatus; excess: number | null } {
  if (unam <= 0) return { guarantee: "SUFICIENTE", excess: 0 };
  if (ceiling === null) return { guarantee: "SEM_DADOS", excess: null };
  return { guarantee: unam > ceiling ? "INSUFICIENTE" : "SUFICIENTE", excess: Math.max(cents(unam) - cents(ceiling), 0) / 100 };
}

/** `policyMax`: importância segurada (max_amount) por apólice; ausente/null = SEM DADOS. */
export function consolidateAdvances(rows: readonly AdvanceRow[], policyMax: Readonly<Record<string, number | null>> = {}): ConsolidatedAdvances {
  const ranked = [...rows].sort(byCreated);
  const keep = new Map<string, AdvanceRow>();
  const duplicateAdvances: Array<{ id: string; duplicateOf: string }> = [];
  const keepOf = new Map<string, string>();
  for (const a of ranked) {
    const key = [a.policyId ?? "", normalizeText(a.contractNumber), a.advanceDate ?? "", fmt2(a.advancedAmount), sourceKey(a.sourceDocumentId, a.sourceRef)].join("|");
    const first = keep.get(key);
    if (!first) {
      keep.set(key, a);
      keepOf.set(a.id, a.id);
    } else {
      duplicateAdvances.push({ id: a.id, duplicateOf: first.id });
      keepOf.set(a.id, first.id);
    }
  }
  const kept = [...keep.values()];
  // amortizações: re-atribuídas ao adiantamento mantido e deduplicadas (mais antiga vence)
  const allAm: Array<AmortizationRow & { advanceId: string }> = [];
  for (const a of rows) for (const m of a.amortizations) allAm.push({ ...m, advanceId: keepOf.get(a.id) as string });
  allAm.sort(byCreated);
  const amKeep = new Map<string, string>();
  const duplicateAmortizations: Array<{ id: string; duplicateOf: string }> = [];
  const rawByAdvance = new Map<string, number>();
  for (const m of allAm) {
    const key = [m.advanceId, fmt2(m.amount), m.amortizedOn ?? "", sourceKey(m.sourceDocumentId, m.sourceRef)].join("|");
    const first = amKeep.get(key);
    if (!first) {
      amKeep.set(key, m.id);
      rawByAdvance.set(m.advanceId, (rawByAdvance.get(m.advanceId) ?? 0) + cents(m.amount));
    } else duplicateAmortizations.push({ id: m.id, duplicateOf: first });
  }
  const advances: ConsolidatedAdvance[] = kept
    .map((a) => {
      const advC = cents(a.advancedAmount);
      const raw = rawByAdvance.get(a.id) ?? 0;
      const amC = Math.min(raw, advC);
      const over = Math.max(raw - advC, 0);
      const unamC = advC - amC;
      const pm = a.policyId ? (policyMax[a.policyId] ?? null) : null;
      const ceilings = [a.guaranteedLimit ?? null, pm].filter((x): x is number => typeof x === "number");
      const ceiling = ceilings.length ? Math.min(...ceilings) : null;
      const g = guaranteeOf(fromCents(unamC), ceiling);
      return { id: a.id, policyId: a.policyId ?? null, advanced: fromCents(advC), amortized: fromCents(amC), unamortized: fromCents(unamC), overAmortized: over > 0, overAmount: fromCents(over), guarantee: g.guarantee, uncoveredExcess: g.excess };
    })
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const groups = new Map<string, ConsolidatedAdvance[]>();
  for (const a of advances) groups.set(a.policyId ?? "", [...(groups.get(a.policyId ?? "") ?? []), a]);
  const byPolicy: ConsolidatedPolicy[] = [...groups.entries()]
    .map(([pid, list]) => {
      const sum = (f: (x: ConsolidatedAdvance) => number) => fromCents(list.reduce((s, x) => s + cents(f(x)), 0));
      const unam = sum((x) => x.unamortized);
      const ceiling = pid ? (policyMax[pid] ?? null) : null;
      const g = guaranteeOf(unam, ceiling);
      return { policyId: pid || null, advances: list.length, advanced: sum((x) => x.advanced), amortized: sum((x) => x.amortized), unamortized: unam, ceiling, guarantee: g.guarantee, uncoveredExcess: g.excess };
    })
    .sort((x, y) => (x.policyId === y.policyId ? 0 : x.policyId === null ? -1 : y.policyId === null ? 1 : x.policyId < y.policyId ? -1 : 1));
  const tot = (f: (x: ConsolidatedAdvance) => number) => fromCents(advances.reduce((s, x) => s + cents(f(x)), 0));
  return {
    totals: {
      advanced: tot((x) => x.advanced),
      amortized: tot((x) => x.amortized),
      unamortized: tot((x) => x.unamortized),
      advances: advances.length,
      duplicateAdvances: duplicateAdvances.length,
      duplicateAmortizations: duplicateAmortizations.length,
      overAmortized: advances.filter((x) => x.overAmortized).length,
    },
    advances,
    byPolicy,
    duplicates: { advances: duplicateAdvances.sort((x, y) => (x.id < y.id ? -1 : 1)), amortizations: duplicateAmortizations.sort((x, y) => (x.id < y.id ? -1 : 1)) },
  };
}
