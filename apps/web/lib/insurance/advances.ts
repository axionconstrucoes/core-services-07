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
