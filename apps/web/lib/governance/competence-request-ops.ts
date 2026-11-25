// FASE 5 / E — operações de escrita da governança de competências: allowlist ÚNICA, só pelas RPCs SECURITY DEFINER da migration
// 20261205100000 (solicitar, cancelar, decidir, designar/aceitar/revogar validador). Módulo puro (sem rede): a Server Action o consome e
// os testes o exercitam em Node. O banco é a autoridade; a RPC antiga project_competence_grant NÃO é mais alcançável por aqui.
import { isCompetence } from "./competence-habilitation";

export type CompetenceRequestOp =
  | "request_create"
  | "request_cancel"
  | "request_approve"
  | "request_reject"
  | "validator_designate"
  | "validator_accept"
  | "validator_revoke"
  | "competence_revalidate";

export interface CompetenceRequestInput {
  projectId?: string;
  op: CompetenceRequestOp;
  userId?: string;
  competence?: string;
  evidenceDocumentId?: string;
  registrationKind?: string;
  registrationNumber?: string;
  basisNote?: string;
  validFrom?: string;
  validUntil?: string;
  id?: string;
  expectedRowVersion?: number;
  note?: string;
  evidenceChecked?: boolean;
  designationDocumentId?: string;
  reason?: string;
}

export class CompetenceRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetenceRequestInputError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["CREA", "CAU", "OAB", "SUSEP", "OUTRO"];
const uuid = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new CompetenceRequestInputError(`Identificador inválido (${what}).`);
  return v;
};
const text = (v: unknown, min: number, max: number, what: string): string => {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < min) throw new CompetenceRequestInputError(`${what}: mínimo de ${min} caracteres.`);
  if (t.length > max) throw new CompetenceRequestInputError(`${what}: máximo de ${max} caracteres.`);
  return t;
};
const version = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new CompetenceRequestInputError("Versão do registro ausente: recarregue a tela.");
  return v;
};

export function isCompetenceRequestOp(v: unknown): v is CompetenceRequestOp {
  return ["request_create", "request_cancel", "request_approve", "request_reject", "validator_designate", "validator_accept", "validator_revoke", "competence_revalidate"].includes(v as string);
}

export function buildCompetenceRequestCall(input: CompetenceRequestInput): { rpc: string; params: Record<string, unknown> } {
  switch (input.op) {
    case "request_create": {
      if (!isCompetence(input.competence)) throw new CompetenceRequestInputError("Competência inválida.");
      const data: Record<string, unknown> = { evidence_document_id: uuid(input.evidenceDocumentId, "documento de habilitação (obrigatório)") };
      for (const [k, v] of [["valid_from", input.validFrom], ["valid_until", input.validUntil]] as const) {
        if (v === undefined || v === "") continue;
        if (typeof v !== "string" || !DATE_RE.test(v)) throw new CompetenceRequestInputError("Data inválida (use aaaa-mm-dd).");
        data[k] = v;
      }
      if (input.registrationKind) {
        if (!KINDS.includes(input.registrationKind)) throw new CompetenceRequestInputError("Tipo de registro profissional inválido.");
        data.registration_kind = input.registrationKind;
      }
      if (input.registrationNumber) {
        if (!input.registrationKind) throw new CompetenceRequestInputError("Informe o tipo do registro profissional.");
        data.registration_number = text(input.registrationNumber, 1, 60, "Número do registro");
      }
      if (input.basisNote) data.basis_note = text(input.basisNote, 1, 1000, "Observação");
      return { rpc: "project_competence_request_create", params: { p_project_id: uuid(input.projectId, "projeto"), p_user_id: uuid(input.userId, "pessoa"), p_competence: input.competence, p_data: data } };
    }
    case "request_cancel":
      return { rpc: "project_competence_request_cancel", params: { p_id: uuid(input.id, "solicitação"), p_expected_row_version: version(input.expectedRowVersion), p_reason: text(input.reason, 10, 1000, "Motivo") } };
    case "request_approve":
      if (input.evidenceChecked !== true) throw new CompetenceRequestInputError("Confirme que a evidência documental foi conferida.");
      return { rpc: "project_competence_request_decide", params: { p_id: uuid(input.id, "solicitação"), p_expected_row_version: version(input.expectedRowVersion), p_decision: "APPROVE", p_note: text(input.note, 20, 2000, "O que foi conferido"), p_evidence_checked: true } };
    case "request_reject":
      return { rpc: "project_competence_request_decide", params: { p_id: uuid(input.id, "solicitação"), p_expected_row_version: version(input.expectedRowVersion), p_decision: "REJECT", p_note: text(input.note, 10, 2000, "Motivo da recusa"), p_evidence_checked: false } };
    case "validator_designate": {
      const until = input.validUntil;
      if (typeof until !== "string" || !DATE_RE.test(until)) throw new CompetenceRequestInputError("Informe o prazo da designação (aaaa-mm-dd, até 180 dias).");
      return { rpc: "project_competence_validator_designate", params: { p_project_id: uuid(input.projectId, "projeto"), p_user_id: uuid(input.userId, "pessoa"), p_designation_document_id: uuid(input.designationDocumentId, "documento da designação"), p_reason: text(input.reason, 20, 1000, "Justificativa"), p_valid_until: until } };
    }
    case "validator_accept":
      return { rpc: "project_competence_validator_accept", params: { p_id: uuid(input.id, "designação") } };
    case "validator_revoke":
      return { rpc: "project_competence_validator_revoke", params: { p_id: uuid(input.id, "designação"), p_reason: text(input.reason, 10, 1000, "Motivo") } };
    case "competence_revalidate":
      // Fase 6/H2a (migration 20261208100000): revalidação independente de competência anterior.
      if (input.evidenceChecked !== true) throw new CompetenceRequestInputError("Confirme que a evidência documental foi conferida.");
      return { rpc: "project_competence_revalidate", params: { p_id: uuid(input.id, "competência"), p_expected_row_version: version(input.expectedRowVersion), p_note: text(input.note, 20, 2000, "O que foi conferido"), p_evidence_checked: true } };
    default:
      throw new CompetenceRequestInputError("Operação desconhecida.");
  }
}
