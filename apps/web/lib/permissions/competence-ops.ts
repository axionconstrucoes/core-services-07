// FASE 4 / A — operações de escrita da tela de competências. Allowlist ÚNICA: conceder e revogar, SOMENTE pelas RPCs
// project_competence_grant / project_competence_revoke (SECURITY DEFINER; só ADMINISTRADOR; auditoria na mesma transação).
// Módulo puro (sem rede): a Server Action o consome e os testes o exercitam em Node. O banco é a autoridade.
import { COMPETENCES, REGISTRATION_KINDS } from "./competences";
import { projectTierFor, tierAtLeast } from "./project-tier";

export type CompetenceOp = "competence_grant" | "competence_revoke";

export interface CompetenceActionInput {
  projectId: string;
  op: CompetenceOp;
  /** concessão: pessoa e competência */
  userId?: string;
  competence?: string;
  /** concessão: validade, identificação profissional (texto declarado, nunca validado/inventado), evidência e observação */
  data?: { valid_from?: string; valid_until?: string; registration_kind?: string; registration_number?: string; evidence_document_id?: string; basis_note?: string };
  /** revogação */
  id?: string;
  expectedRowVersion?: number;
  reason?: string;
}

export class CompetenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetenceInputError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new CompetenceInputError(`Identificador inválido (${what}).`);
  return v;
};

export function isCompetenceOp(v: unknown): v is CompetenceOp {
  return v === "competence_grant" || v === "competence_revoke";
}

export function buildCompetenceCall(input: CompetenceActionInput): { rpc: string; params: Record<string, unknown> } {
  const projectId = uuid(input.projectId, "projeto");
  if (input.op === "competence_grant") {
    const userId = uuid(input.userId, "pessoa");
    if (typeof input.competence !== "string" || !(COMPETENCES as readonly string[]).includes(input.competence)) throw new CompetenceInputError("Competência inválida.");
    const d = input.data ?? {};
    const out: Record<string, unknown> = {};
    for (const k of ["valid_from", "valid_until"] as const) {
      const v = d[k];
      if (v === undefined || v === "") continue;
      if (typeof v !== "string" || !DATE_RE.test(v)) throw new CompetenceInputError("Data inválida (use aaaa-mm-dd).");
      out[k] = v;
    }
    if (d.registration_kind) {
      if (!(REGISTRATION_KINDS as readonly string[]).includes(d.registration_kind)) throw new CompetenceInputError("Tipo de registro profissional inválido.");
      out.registration_kind = d.registration_kind;
    }
    if (d.registration_number) {
      const n = String(d.registration_number).trim();
      if (!n || n.length > 60) throw new CompetenceInputError("Número do registro: até 60 caracteres.");
      if (!d.registration_kind) throw new CompetenceInputError("Informe o tipo do registro profissional.");
      out.registration_number = n;
    }
    if (d.evidence_document_id) out.evidence_document_id = uuid(d.evidence_document_id, "documento de evidência");
    if (d.basis_note) {
      const n = String(d.basis_note).trim();
      if (n.length > 1000) throw new CompetenceInputError("Observação: até 1000 caracteres.");
      if (n) out.basis_note = n;
    }
    return { rpc: "project_competence_grant", params: { p_project_id: projectId, p_user_id: userId, p_competence: input.competence, p_data: out } };
  }
  if (input.op === "competence_revoke") {
    if (typeof input.expectedRowVersion !== "number" || !Number.isInteger(input.expectedRowVersion) || input.expectedRowVersion < 1) {
      throw new CompetenceInputError("Versão do registro ausente: recarregue a tela.");
    }
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (reason.length < 10) throw new CompetenceInputError("Informe o motivo da revogação (mínimo de 10 caracteres).");
    return { rpc: "project_competence_revoke", params: { p_id: uuid(input.id, "competência"), p_expected_row_version: input.expectedRowVersion, p_reason: reason } };
  }
  throw new CompetenceInputError("Operação desconhecida.");
}

/** Espelho do que o banco exige: SÓ ADMINISTRADOR ATIVO do projeto concede/revoga. Fail-closed (sem papel = false). */
export function isCompetenceOpAllowed(permission: string | null | undefined): boolean {
  return tierAtLeast(projectTierFor(permission), "ADMIN");
}
