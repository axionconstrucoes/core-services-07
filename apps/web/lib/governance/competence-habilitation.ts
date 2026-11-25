// FASE 5 / E — COMPETÊNCIA ESPECIALIZADA SÓ COM VALIDAÇÃO INDEPENDENTE DE HABILITAÇÃO (espelho puro, na interface, das regras de
// public.project_competence_requests / project_competence_validators / project_competence_request_decide — migration 20261205100000).
// O banco é a autoridade; este módulo só decide o que mostrar, define mensagens e é provado contra o SQL em
// scripts/test-f5-e-governanca.mjs (puro) e scripts/test-f5-e-governanca-realpg.mjs (Postgres real).
//
// REGRAS: (1) conceder competência é SOLICITAÇÃO e NÃO produz poderes; (2) só vale após validação por pessoa INDEPENDENTE (diferente de quem
// solicitou e de quem receberá): segundo administrador do projeto ou validador designado (documento + prazo máx. 180 dias + aceite),
// com evidência documental conferida; (3) CREA/OAB/SUSEP informado é TEXTO declarado e NUNCA comprova habilitação.

import { COMPETENCES, type Competence } from "../permissions/competences";

export const VALIDATOR_KINDS = ["SECOND_ADMIN", "DESIGNATED"] as const;
export type ValidatorKind = (typeof VALIDATOR_KINDS)[number];

export type HabilitationStatus = "UNVALIDATED" | "VALIDATED" | "MAINTENANCE";
export type CompetenceRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export const REQUEST_VALIDITY_DAYS = 30;
export const VALIDATOR_MAX_DAYS = 180;
export const VALIDATION_NOTE_MIN = 20;
export const REJECTION_NOTE_MIN = 10;

/** Um registro de competência só dá poder quando a habilitação foi validada (ou é carga de manutenção identificada). */
export function habilitationGrantsAuthority(status: HabilitationStatus | string | null | undefined): boolean {
  return status === "VALIDATED" || status === "MAINTENANCE";
}

export interface ValidationAttempt {
  requestedBy: string;
  targetUserId: string;
  validatorUserId: string;
  /** o validador é ADMINISTRADOR ativo do projeto */
  validatorIsProjectAdmin: boolean;
  /** o validador tem designação ATIVA (aceita e dentro do prazo) neste projeto */
  validatorIsActiveDesignated: boolean;
  evidenceChecked: boolean;
  evidenceDocumentInProject: boolean;
  note: string;
  requestStatus: CompetenceRequestStatus;
  expired: boolean;
}

export type ValidationVerdict =
  | { ok: true; validatorKind: ValidatorKind }
  | { ok: false; code: "INDEPENDENT_VALIDATOR_REQUIRED" | "FORBIDDEN" | "NOT_PENDING" | "EVIDENCE_CHECK_REQUIRED" | "EVIDENCE_REQUIRED" | "NOTE_REQUIRED" | "EXPIRED" };

/** Espelho de project_competence_request_decide (APPROVE). */
export function canApproveCompetenceRequest(a: ValidationAttempt): ValidationVerdict {
  if (a.validatorUserId === a.requestedBy || a.validatorUserId === a.targetUserId) return { ok: false, code: "INDEPENDENT_VALIDATOR_REQUIRED" };
  let kind: ValidatorKind | null = null;
  if (a.validatorIsProjectAdmin) kind = "SECOND_ADMIN";
  else if (a.validatorIsActiveDesignated) kind = "DESIGNATED";
  if (!kind) return { ok: false, code: "FORBIDDEN" };
  if (a.requestStatus !== "PENDING") return { ok: false, code: "NOT_PENDING" };
  if (a.expired) return { ok: false, code: "EXPIRED" };
  if (!a.evidenceChecked) return { ok: false, code: "EVIDENCE_CHECK_REQUIRED" };
  if (a.note.trim().length < VALIDATION_NOTE_MIN) return { ok: false, code: "NOTE_REQUIRED" };
  if (!a.evidenceDocumentInProject) return { ok: false, code: "EVIDENCE_REQUIRED" };
  return { ok: true, validatorKind: kind };
}

export const COMPETENCE_REQUEST_ERRORS: Record<string, string> = {
  HABILITATION_VALIDATION_REQUIRED: "Competência especializada só passa a valer depois da validação independente de habilitação. Faça a solicitação e peça a validação.",
  INDEPENDENT_VALIDATOR_REQUIRED: "Quem solicitou ou receberá a competência não pode validá-la. Peça a um segundo administrador ou a um validador designado.",
  EVIDENCE_REQUIRED: "Anexe ao projeto o documento de habilitação (diploma, registro, certidão) e informe-o. Registro CREA/OAB declarado não comprova habilitação.",
  EVIDENCE_CHECK_REQUIRED: "Confirme que a evidência documental foi conferida.",
  NOTE_REQUIRED: "Descreva o que foi conferido (mínimo de 20 caracteres) ou o motivo da recusa (mínimo de 10).",
  ALREADY_PENDING: "Já existe solicitação pendente desta competência para a pessoa.",
  ALREADY_ACTIVE: "A pessoa já tem esta competência ativa e validada.",
  FORBIDDEN: "Somente segundo administrador ou validador designado ativo valida habilitação; somente o administrador solicita.",
  SELF_DESIGNATION_FORBIDDEN: "O validador não pode ser quem o designa.",
  NOT_PENDING: "A solicitação já foi decidida.",
  VERSION_CONFLICT: "A solicitação mudou. Recarregue a tela.",
  INVALID_VALIDITY: "Prazo inválido (a designação vai até 180 dias).",
};

/** Texto da primeira chave conhecida na mensagem do banco; senão genérico (sem expor detalhe interno). */
export function describeCompetenceRequestError(message: string | null | undefined): string {
  const m = message ?? "";
  const key = Object.keys(COMPETENCE_REQUEST_ERRORS).find((k) => m.includes(k));
  return key ? COMPETENCE_REQUEST_ERRORS[key] : "Não foi possível concluir a operação. Nada foi alterado.";
}

export function isCompetence(v: unknown): v is Competence {
  return typeof v === "string" && (COMPETENCES as readonly string[]).includes(v);
}
