// Máquina de estados do sinistro/evento. Espelha insurance_claim_transition_allowed (SQL).
import type { ClaimStage } from "./types";

const NEXT: Record<ClaimStage, ClaimStage[]> = {
  EXPECTATIVA: ["AVISO", "ENCERRADO"],
  AVISO: ["RECLAMACAO", "DOC_COMPLEMENTAR", "REGULACAO", "ENCERRADO"],
  RECLAMACAO: ["DOC_COMPLEMENTAR", "REGULACAO", "DECISAO", "NEGATIVA", "ENCERRADO"],
  DOC_COMPLEMENTAR: ["REGULACAO", "DECISAO", "NEGATIVA", "ENCERRADO"],
  REGULACAO: ["DOC_COMPLEMENTAR", "DECISAO", "NEGATIVA", "ENCERRADO"],
  DECISAO: ["INDENIZACAO_CUMPRIMENTO", "NEGATIVA", "CONTESTACAO", "ENCERRADO"],
  NEGATIVA: ["CONTESTACAO", "ENCERRADO"],
  CONTESTACAO: ["REGULACAO", "DECISAO", "NEGATIVA", "ENCERRADO"],
  INDENIZACAO_CUMPRIMENTO: ["CONTESTACAO", "ENCERRADO"],
  ENCERRADO: [],
};
export const INITIAL_CLAIM_STAGES: ClaimStage[] = ["EXPECTATIVA", "AVISO", "RECLAMACAO"];

export function canTransitionClaim(from: ClaimStage, to: ClaimStage): boolean {
  return NEXT[from].includes(to);
}
export function nextClaimStages(from: ClaimStage): ClaimStage[] {
  return [...NEXT[from]];
}

/** Expectativa de sinistro só pode ser aberta quando contratualmente prevista (cláusula da própria apólice ou nota). */
export function canOpenExpectation(input: {
  clauseId?: string | null;
  clausePolicyId?: string | null;
  policyId?: string | null;
  note?: string | null;
}): { ok: boolean; reason?: string } {
  if (input.clauseId) {
    return input.policyId && input.clausePolicyId === input.policyId
      ? { ok: true }
      : { ok: false, reason: "EXPECTATIVA_BASIS_MISMATCH" };
  }
  return (input.note ?? "").trim().length >= 10 ? { ok: true } : { ok: false, reason: "EXPECTATIVA_BASIS_REQUIRED" };
}

export interface NoticeDeadline {
  status: "SEM_DADOS" | "NO_PRAZO" | "VENCIDO";
  daysRemaining: number | null;
  basis: string | null;
}
/** Prazo de aviso: só existe se cadastrado com base. Sem dado => SEM_DADOS (nunca presumir prazo legal/contratual). */
export function evaluateNoticeDeadline(
  deadlineAt: Date | string | null | undefined,
  basis: string | null | undefined,
  now: Date,
): NoticeDeadline {
  if (!deadlineAt) return { status: "SEM_DADOS", daysRemaining: null, basis: null };
  const d = typeof deadlineAt === "string" ? new Date(deadlineAt) : deadlineAt;
  if (Number.isNaN(d.getTime())) return { status: "SEM_DADOS", daysRemaining: null, basis: null };
  const days = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  return { status: d.getTime() < now.getTime() ? "VENCIDO" : "NO_PRAZO", daysRemaining: days, basis: basis?.trim() || null };
}
