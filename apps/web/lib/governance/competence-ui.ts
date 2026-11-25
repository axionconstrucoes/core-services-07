// FASE 6 / H2a — regras PURAS da tela de competências (sem rede, sem banco, testável em Node). A UI NUNCA é a autoridade: o banco
// (RPCs project_competence_request_* / _validator_* / _revalidate, migrations 20261205100000 e 20261208100000) decide e recusa.
// Aqui só se decide o que mostrar/habilitar e como nomear cada estado. Ver docs/permissoes-matriz-central.md.
import type { Tier } from "./external-send-binding";

export const VALIDATOR_MAX_DAYS = 180;

export type CompetenceRowState = "VALIDA" | "AGUARDA_REVALIDACAO" | "SEM_VALIDACAO" | "VENCIDA" | "FUTURA" | "REVOGADA";

export interface CompetenceRowLike {
  status: "ACTIVE" | "REVOKED" | string;
  habilitation_status: "UNVALIDATED" | "VALIDATED" | "MAINTENANCE" | string | null;
  revalidation_status: "CURRENT" | "REQUIRED" | string | null;
  valid_from: string | null;
  valid_until: string | null;
}

export const COMPETENCE_STATE_LABEL: Record<CompetenceRowState, string> = {
  VALIDA: "Vale",
  AGUARDA_REVALIDACAO: "Aguarda revalidação (não vale para atos críticos)",
  SEM_VALIDACAO: "Sem validação de habilitação (não vale)",
  VENCIDA: "Vencida (não vale)",
  FUTURA: "Ainda não iniciou (não vale)",
  REVOGADA: "Revogada",
};

/** Espelho de acc_user_has_competence (fail-closed): só VALIDA concede poder. `today` = aaaa-mm-dd. Valor ausente/desconhecido NUNCA vale. */
export function deriveCompetenceState(row: CompetenceRowLike, today: string): CompetenceRowState {
  if (row.status === "REVOKED") return "REVOGADA";
  if (row.status !== "ACTIVE") return "SEM_VALIDACAO";
  if (row.habilitation_status !== "VALIDATED" && row.habilitation_status !== "MAINTENANCE") return "SEM_VALIDACAO";
  if (row.valid_until && row.valid_until < today) return "VENCIDA";
  if (row.valid_from && row.valid_from > today) return "FUTURA";
  if (row.revalidation_status !== "CURRENT") return "AGUARDA_REVALIDACAO";
  return "VALIDA";
}

export function todayIso(now: Date = new Date()): string {
  // data civil de Brasília (a competência é por dia); evita virar o dia às 21h UTC-3
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(now);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Prazo máximo de um validador designado: hoje + 180 dias (espelho do CHECK/RPC). */
export function maxValidatorUntil(today: string): string {
  return addDaysIso(today, VALIDATOR_MAX_DAYS);
}

export type ValidatorState = "PROPOSTA" | "ATIVO" | "VENCIDO" | "REVOGADO";

export function deriveValidatorState(v: { status: string; valid_from: string; valid_until: string }, today: string): ValidatorState {
  if (v.status === "REVOKED") return "REVOGADO";
  if (v.status === "PROPOSED") return v.valid_until < today ? "VENCIDO" : "PROPOSTA";
  if (v.status === "ACTIVE") return v.valid_until < today || v.valid_from > today ? "VENCIDO" : "ATIVO";
  return "REVOGADO";
}

export const VALIDATOR_STATE_LABEL: Record<ValidatorState, string> = {
  PROPOSTA: "Proposta (aguarda o aceite do designado)",
  ATIVO: "Ativo",
  VENCIDO: "Vencido (não valida)",
  REVOGADO: "Revogado",
};

/** Só o ADMINISTRADOR do projeto solicita competência e gerencia validadores. */
export function canManageCompetences(tier: Tier): boolean {
  return tier === "ADMIN";
}

/**
 * Pode validar (aprovar/recusar) a solicitação? Espelho de project_competence_request_decide: ADMIN ou validador designado ATIVO, nunca
 * quem solicitou nem quem receberá a competência. O banco repete a regra.
 */
export function canDecideRequest(a: { userId: string; tier: Tier; isActiveDesignatedValidator: boolean }, req: { requested_by: string; target_user_id: string }): boolean {
  if (a.userId === req.requested_by || a.userId === req.target_user_id) return false;
  return a.tier === "ADMIN" || a.isActiveDesignatedValidator;
}

/** Pode revalidar? Espelho de project_competence_revalidate: ADMIN ou validador designado ATIVO, nunca a pessoa nem quem concedeu. */
export function canRevalidate(a: { userId: string; tier: Tier; isActiveDesignatedValidator: boolean }, c: { user_id: string; granted_by: string }): boolean {
  if (a.userId === c.user_id || a.userId === c.granted_by) return false;
  return a.tier === "ADMIN" || a.isActiveDesignatedValidator;
}

export function canCancelRequest(a: { userId: string; tier: Tier }, req: { requested_by: string; status: string }): boolean {
  return req.status === "PENDING" && a.tier === "ADMIN" && a.userId === req.requested_by;
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente de validação",
  APPROVED: "Aprovada (habilitação validada)",
  REJECTED: "Recusada",
  CANCELLED: "Cancelada",
  EXPIRED: "Vencida sem validação",
};

export const GOV_ACTION_LABEL: Record<string, string> = {
  REQUESTED: "Competência solicitada",
  APPROVED: "Habilitação validada",
  REJECTED: "Solicitação recusada",
  CANCELLED: "Solicitação cancelada",
  EXPIRED: "Solicitação vencida",
  VALIDATOR_DESIGNATED: "Validador designado",
  VALIDATOR_ACCEPTED: "Designação aceita",
  VALIDATOR_REVOKED: "Validador revogado",
  REVALIDATED: "Competência revalidada",
};
