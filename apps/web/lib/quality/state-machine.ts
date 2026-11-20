// Máquinas de estados da RNC e da garantia. Espelho EXATO de quality_state_transitions (seed da migration
// 20261122100000) — o teste de paridade em PostgreSQL real compara as duas listas.
// Regra: "correção executada" NÃO equivale a conformidade. Encerrar exige verificação de eficácia EFICAZ,
// com evidência, posterior ao último ciclo de correção/reabertura (e, na garantia, aceite do cliente).

import type {
  ActionStatus,
  EvidenceRef,
  NcrState,
  QualityEntityType,
  QualityMinRole,
  QualityRole,
  StateEventRef,
  VerificationRecord,
  WarrantyState,
} from "./types";

export interface TransitionRule {
  entity: QualityEntityType;
  from: string;
  to: string;
  minRole: QualityMinRole;
  requiresJustification: boolean;
  requiresEvidence: boolean;
}

const t = (
  entity: QualityEntityType,
  from: string,
  to: string,
  minRole: QualityMinRole,
  requiresJustification: boolean,
  requiresEvidence: boolean,
): TransitionRule => ({ entity, from, to, minRole, requiresJustification, requiresEvidence });

export const TRANSITIONS: readonly TransitionRule[] = [
  t("NCR", "DETECTADA", "TRIAGEM", "REGISTER", false, false),
  t("NCR", "DETECTADA", "CANCELADA", "MANAGE", true, false),
  t("NCR", "DETECTADA", "DUPLICADA", "MANAGE", true, false),
  t("NCR", "TRIAGEM", "INVESTIGACAO", "REGISTER", false, false),
  t("NCR", "TRIAGEM", "NAO_CONFIRMADA", "MANAGE", true, true),
  t("NCR", "TRIAGEM", "DUPLICADA", "MANAGE", true, false),
  t("NCR", "TRIAGEM", "CANCELADA", "MANAGE", true, false),
  t("NCR", "INVESTIGACAO", "CONFIRMADA", "MANAGE", true, true),
  t("NCR", "INVESTIGACAO", "NAO_CONFIRMADA", "MANAGE", true, true),
  t("NCR", "INVESTIGACAO", "CANCELADA", "MANAGE", true, false),
  t("NCR", "CONFIRMADA", "PLANO_ACAO", "REGISTER", false, false),
  t("NCR", "CONFIRMADA", "CANCELADA", "MANAGE", true, false),
  t("NCR", "PLANO_ACAO", "CORRECAO", "REGISTER", false, false),
  t("NCR", "PLANO_ACAO", "CANCELADA", "MANAGE", true, false),
  t("NCR", "CORRECAO", "VERIFICACAO", "REGISTER", false, false),
  t("NCR", "CORRECAO", "CANCELADA", "MANAGE", true, false),
  t("NCR", "VERIFICACAO", "ENCERRADA", "MANAGE", true, false),
  t("NCR", "VERIFICACAO", "CORRECAO", "MANAGE", true, false),
  t("NCR", "NAO_CONFIRMADA", "REABERTA", "MANAGE", true, true),
  t("NCR", "ENCERRADA", "REABERTA", "MANAGE", true, true),
  t("NCR", "REABERTA", "INVESTIGACAO", "REGISTER", false, false),
  t("NCR", "REABERTA", "CANCELADA", "MANAGE", true, false),
  t("WARRANTY", "ABERTA", "EM_VISTORIA", "REGISTER", false, false),
  t("WARRANTY", "ABERTA", "CANCELADA", "MANAGE", true, false),
  t("WARRANTY", "EM_VISTORIA", "EM_ANALISE", "REGISTER", false, false),
  t("WARRANTY", "EM_VISTORIA", "CANCELADA", "MANAGE", true, false),
  t("WARRANTY", "EM_ANALISE", "COBERTA", "MANAGE", true, true),
  t("WARRANTY", "EM_ANALISE", "NAO_COBERTA", "MANAGE", true, true),
  t("WARRANTY", "EM_ANALISE", "CANCELADA", "MANAGE", true, false),
  t("WARRANTY", "COBERTA", "EM_REPARO", "REGISTER", false, false),
  t("WARRANTY", "EM_REPARO", "REPARADA", "REGISTER", false, false),
  t("WARRANTY", "REPARADA", "VERIFICADA", "MANAGE", true, false),
  t("WARRANTY", "REPARADA", "EM_REPARO", "MANAGE", true, false),
  t("WARRANTY", "VERIFICADA", "ENCERRADA", "MANAGE", true, false),
  t("WARRANTY", "VERIFICADA", "EM_REPARO", "MANAGE", true, false),
  t("WARRANTY", "ENCERRADA", "REABERTA", "MANAGE", true, true),
  t("WARRANTY", "NAO_COBERTA", "REABERTA", "MANAGE", true, true),
  t("WARRANTY", "REABERTA", "EM_VISTORIA", "REGISTER", false, false),
  t("WARRANTY", "REABERTA", "CANCELADA", "MANAGE", true, false),
];

export const MIN_JUSTIFICATION_LENGTH = 10;

export function findTransition(entity: QualityEntityType, from: string, to: string): TransitionRule | undefined {
  return TRANSITIONS.find((r) => r.entity === entity && r.from === from && r.to === to);
}

export function allowedTransitions(entity: QualityEntityType, from: string): TransitionRule[] {
  return TRANSITIONS.filter((r) => r.entity === entity && r.from === from);
}

export function isTerminal(entity: QualityEntityType, state: string): boolean {
  return allowedTransitions(entity, state).length === 0;
}

/** Papéis do projeto (padrão ESG existente). LEITURA nunca muda estado. */
export function roleSatisfies(role: QualityRole | null | undefined, min: QualityMinRole): boolean {
  if (!role) return false;
  if (min === "MANAGE") return role === "ADMINISTRADOR" || role === "GERENTE" || role === "GESTOR";
  return role === "ADMINISTRADOR" || role === "GERENTE" || role === "GESTOR" || role === "COLABORADOR";
}

/** Contexto lido do banco para avaliar uma transição (puro). */
export interface TransitionContext {
  entity: QualityEntityType;
  from: string;
  to: string;
  role: QualityRole | null;
  justification?: string | null;
  /** evidências informadas na própria transição. */
  evidenceIds?: readonly string[];
  /** evidências já vinculadas ao caso. */
  caseEvidence?: readonly EvidenceRef[];
  actions?: readonly { status: ActionStatus }[];
  /** verificações do caso, da mais antiga para a mais recente. */
  verifications?: readonly VerificationRecord[];
  events?: readonly StateEventRef[];
  duplicateOfId?: string | null;
  /** garantia */
  hasRepairRecord?: boolean;
  customerAccepted?: boolean;
}

export interface TransitionVerdict {
  allowed: boolean;
  blockers: string[];
}

/** Resets que invalidam verificações anteriores (nova correção/reparo ou reabertura). */
const RESET_STATES: Record<QualityEntityType, readonly string[]> = {
  NCR: ["CORRECAO", "REABERTA"],
  WARRANTY: ["EM_REPARO", "REABERTA"],
};

/** Verificação vigente? EFICAZ, com evidência, e sem reset de ciclo posterior. */
export function verificationBlockers(
  entity: QualityEntityType,
  verifications: readonly VerificationRecord[] | undefined,
  events: readonly StateEventRef[] | undefined,
): string[] {
  const v = verifications && verifications.length > 0 ? verifications[verifications.length - 1] : undefined;
  if (!v) return ["EFFECTIVENESS_VERIFICATION_REQUIRED"];
  const blockers: string[] = [];
  if (!v.hasEvidence) blockers.push("VERIFICATION_EVIDENCE_REQUIRED");
  if (v.result !== "EFICAZ") blockers.push("LATEST_VERIFICATION_NOT_EFFECTIVE");
  const lastReset = Math.max(
    -1,
    ...(events ?? []).filter((e) => RESET_STATES[entity].includes(e.toState)).map((e) => e.seq),
  );
  if (lastReset > v.eventSeqAt) {
    blockers.push(entity === "NCR" ? "VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN" : "VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN");
  }
  return blockers;
}

/** Avalia uma transição (puro). Espelha quality_transition_core + quality_transition_blockers. */
export function evaluateTransition(ctx: TransitionContext): TransitionVerdict {
  const rule = findTransition(ctx.entity, ctx.from, ctx.to);
  if (!rule) return { allowed: false, blockers: ["INVALID_TRANSITION"] };
  const blockers: string[] = [];
  if (!roleSatisfies(ctx.role, rule.minRole)) blockers.push("FORBIDDEN");
  const just = (ctx.justification ?? "").trim();
  if (rule.requiresJustification && just.length < MIN_JUSTIFICATION_LENGTH) blockers.push("JUSTIFICATION_REQUIRED");
  if (rule.requiresEvidence && (ctx.evidenceIds?.length ?? 0) === 0) blockers.push("EVIDENCE_REQUIRED");
  if (ctx.entity === "NCR") ncrGuards(ctx, blockers);
  else warrantyGuards(ctx, blockers);
  return { allowed: blockers.length === 0, blockers };
}

function ncrGuards(ctx: TransitionContext, blockers: string[]): void {
  const activeActions = (ctx.actions ?? []).filter((a) => a.status !== "CANCELADA");
  if (ctx.to === "DUPLICADA" && !ctx.duplicateOfId) blockers.push("DUPLICATE_TARGET_INVALID");
  if (ctx.to === "CONFIRMADA" && !(ctx.caseEvidence ?? []).some((e) => e.classification === "NC_COMPROVADA")) {
    blockers.push("CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE");
  }
  if (ctx.to === "PLANO_ACAO" && activeActions.length === 0) blockers.push("ACTION_PLAN_REQUIRED");
  if (ctx.to === "VERIFICACAO" || ctx.to === "ENCERRADA") {
    if (activeActions.length === 0) blockers.push("NO_CORRECTIVE_ACTION");
    else if (activeActions.some((a) => a.status !== "EXECUTADA")) blockers.push("ACTIONS_NOT_EXECUTED");
  }
  if (ctx.to === "ENCERRADA") blockers.push(...verificationBlockers("NCR", ctx.verifications, ctx.events));
}

function warrantyGuards(ctx: TransitionContext, blockers: string[]): void {
  if (ctx.to === "REPARADA" && !ctx.hasRepairRecord) blockers.push("REPAIR_RECORD_REQUIRED");
  if (ctx.to === "VERIFICADA" || ctx.to === "ENCERRADA") {
    blockers.push(...verificationBlockers("WARRANTY", ctx.verifications, ctx.events));
  }
  if (ctx.to === "ENCERRADA" && !ctx.customerAccepted) blockers.push("CUSTOMER_ACCEPTANCE_REQUIRED");
}

/** "Pronto para encerrar?" — sem checar papel/justificativa (isso é da transição). */
export function closureReadiness(ctx: Omit<TransitionContext, "to" | "role" | "from"> & { from?: string }): TransitionVerdict {
  const verdict = evaluateTransition({
    ...ctx,
    from: ctx.from ?? (ctx.entity === "NCR" ? "VERIFICACAO" : "VERIFICADA"),
    to: "ENCERRADA",
    role: "ADMINISTRADOR",
    justification: "x".repeat(MIN_JUSTIFICATION_LENGTH),
    evidenceIds: ["-"],
  });
  return verdict;
}

export type { NcrState, WarrantyState };
