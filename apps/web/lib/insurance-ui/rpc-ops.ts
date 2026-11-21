// ALLOWLIST das operações de escrita da interface de seguros. A UI escreve SOMENTE por estas RPCs (SECURITY DEFINER, com auditoria e
// controle otimista de concorrência); nenhuma tabela é gravada diretamente. Não existe operação de envio real nem de ligar a trava
// de envio: o único caminho "de envio" é `draft_attempt_send`, que apenas REGISTRA uma tentativa e devolve o bloqueio.
// Módulo puro (sem "use server", sem rede): a Server Action (app/[projectId]/seguros/actions.ts) o consome; os testes o exercitam em Node.
import { claimStageLevel, hasInsuranceLevel, type InsuranceLevel } from "./permissions";

export type InsuranceOp =
  | "policy_create"
  | "policy_new_version"
  | "party_add"
  | "party_set_active"
  | "clause_add"
  | "terms_save"
  | "coherence_justify"
  | "channel_register"
  | "channel_verify"
  | "bank_register"
  | "bank_update"
  | "other_register"
  | "other_update"
  | "endorsement_request"
  | "endorsement_advance"
  | "endorsement_review"
  | "advance_register"
  | "advance_amortize"
  | "claim_open"
  | "claim_advance"
  | "dossier_sync"
  | "dossier_item_set"
  | "draft_create"
  | "draft_update"
  | "draft_approve"
  | "draft_cancel"
  | "draft_attempt_send";

export interface InsuranceActionInput {
  projectId: string;
  op: InsuranceOp;
  /** id do registro-alvo (apólice, parte, fiança, endosso, adiantamento, sinistro, item, minuta, canal). */
  id?: string;
  /** row_version lido na tela (controle otimista). */
  expectedRowVersion?: number;
  data?: Record<string, unknown>;
  /** argumentos próprios da RPC (motivo, nota, confirmação, estado/estágio de destino...). */
  args?: Record<string, unknown>;
}

export interface RpcCall {
  rpc: string;
  params: Record<string, unknown>;
  level: InsuranceLevel;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InsuranceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsuranceInputError";
  }
}

const POLICY_KEYS = ["modality", "policy_number", "insurer_name", "broker_name", "contract_document_id", "contract_number", "source_document_id", "source_ref", "status", "coverage_start", "coverage_end", "max_amount", "notes"];
const PARTY_KEYS = ["party_role", "party_name", "tax_id", "identification_status", "source_document_id", "source_ref"];
const CLAUSE_KEYS = ["kind", "title", "clause_identifier", "clause_text", "amount", "deadline_days", "applies_to", "source_document_id", "source_ref", "source_page", "verified"];
const CHANNEL_KEYS = ["entity_name", "channel_type", "channel_value", "policy_id", "bank_guarantee_id", "source_document_id", "source_ref"];
const BANK_KEYS = ["bank_name", "guarantee_number", "beneficiary_name", "principal_name", "amount", "start_date", "end_date", "calls_on_first_demand", "claim_procedure_note", "contract_document_id", "contract_number", "source_document_id", "source_ref", "status", "notes"];
const BANK_UPDATE_KEYS = ["amount", "end_date", "calls_on_first_demand", "claim_procedure_note", "status", "notes"];
/** Fonte e motivo da atualização de fiança/caução (Fase 4/B): vão no p_data da RPC. */
const UPDATE_META_KEYS = ["update_source_document_id", "update_source_ref", "update_reason"];
const OTHER_KEYS = ["guarantee_type", "caucao_form", "issuer_name", "beneficiary_name", "principal_name", "amount", "start_date", "end_date", "release_conditions", "contract_document_id", "contract_number", "source_document_id", "source_ref", "status", "notes"];
const OTHER_UPDATE_KEYS = ["amount", "end_date", "release_conditions", "status", "notes"];
const ENDORSEMENT_REQUEST_KEYS = ["requested_text", "request_document_id", "request_ref", "change_kinds"];
const ENDORSEMENT_ADVANCE_KEYS = ["issued_text", "issued_number", "issued_document_id", "issued_at", "divergence_note", "refusal_note", "change_kinds"];
const ENDORSEMENT_REVIEW_KEYS = ["note", "divergence_note"];
const ENDORSEMENT_REVIEW_OUTCOMES = ["APROVADO", "RECUSADO"];
const ADVANCE_KEYS = ["policy_id", "contract_document_id", "contract_number", "advanced_amount", "advance_date", "purpose", "application_document_id", "guaranteed_limit", "balance_due_informed", "indemnifiable_informed", "source_document_id", "source_ref", "notes"];
const AMORTIZE_KEYS = ["amount", "amortized_on", "source_document_id", "source_ref", "note"];
const CLAIM_OPEN_KEYS = ["stage", "claim_kind", "title", "policy_id", "bank_guarantee_id", "other_guarantee_id", "advance_id", "protocol", "occurrence_date", "claimed_amount", "notice_deadline_at", "notice_deadline_basis", "contractual_basis_clause_id", "contractual_basis_note", "no_instrument_reason", "source_document_id", "source_ref"];
const CLAIM_ADVANCE_KEYS = ["note", "protocol", "document_id", "decision_outcome", "source_refs"];
const TERMS_KEYS = ["insured_name", "insured_tax_id", "beneficiary_name", "beneficiary_tax_id", "object_text", "coverage_start", "coverage_end", "insured_amount", "guaranteed_obligation", "source_document_id", "source_ref", "source_page", "note"];
const TERMS_KINDS = ["CONTRATO", "APOLICE", "MINUTA"];
const DRAFT_KEYS = ["draft_kind", "policy_id", "bank_guarantee_id", "claim_id", "endorsement_id", "official_channel_id", "subject", "body", "basis"];

function pick(data: Record<string, unknown> | undefined, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = data?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && !Number.isFinite(v)) throw new InsuranceInputError(`Valor numérico inválido em "${k}".`);
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || Array.isArray(v) || (typeof v === "object" && k === "basis")) out[k] = v;
  }
  return out;
}

function uuid(v: unknown, what: string): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new InsuranceInputError(`Identificador inválido (${what}).`);
  return v;
}
function optUuid(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}
function rowVersion(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new InsuranceInputError("Versão do registro ausente: recarregue a tela.");
  return v;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

const ENDORSEMENT_TARGETS = ["EM_ANALISE", "EMITIDO", "CONFERIDO", "RECUSADO"];
const CLAIM_TARGETS = ["EXPECTATIVA", "AVISO", "RECLAMACAO", "DOC_COMPLEMENTAR", "REGULACAO", "DECISAO", "INDENIZACAO_CUMPRIMENTO", "NEGATIVA", "CONTESTACAO", "ENCERRADO"];
const DOSSIER_STATUSES = ["PENDENTE", "ANEXADO", "DISPENSADO", "NAO_APLICAVEL"];

/** Nível exigido por operação (espelha insurance_int_require de cada RPC). */
export function levelForOp(op: InsuranceOp, input?: Pick<InsuranceActionInput, "args">): InsuranceLevel {
  switch (op) {
    case "policy_create":
    case "policy_new_version":
    case "party_add":
    case "party_set_active":
    case "clause_add":
    case "channel_register":
    case "channel_verify":
    case "bank_register":
    case "bank_update":
    case "other_register":
    case "other_update":
    case "dossier_sync":
    case "endorsement_review":
      return "MANAGE";
    case "terms_save":
      return input?.args?.sourceKind === "MINUTA" ? "REGISTER" : "MANAGE";
    case "coherence_justify":
      return "MANAGE";
    case "endorsement_advance":
      return input?.args?.toState === "EM_ANALISE" ? "REGISTER" : "MANAGE";
    case "claim_advance":
      return claimStageLevel(typeof input?.args?.toStage === "string" ? input.args.toStage : null);
    case "draft_approve":
      return "ADMIN";
    default:
      return "REGISTER";
  }
}

/** Valida a entrada e monta a chamada da RPC. Lança InsuranceInputError em entrada inválida (nada é enviado ao banco). */
export function buildRpcCall(input: InsuranceActionInput): RpcCall {
  const { op, projectId } = input;
  uuid(projectId, "projeto");
  const level = levelForOp(op, input);
  const data = input.data;
  const args = input.args ?? {};
  const call = (rpc: string, params: Record<string, unknown>): RpcCall => ({ rpc, params, level });

  switch (op) {
    case "policy_create":
      return call("insurance_policy_create", { p_project_id: projectId, p_data: pick(data, POLICY_KEYS) });
    case "policy_new_version":
      return call("insurance_policy_new_version", { p_policy_id: uuid(input.id, "apólice"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_data: pick(data, POLICY_KEYS.filter((k) => k !== "modality")), p_reason: str(args.reason) ?? "" });
    case "party_add":
      return call("insurance_policy_party_add", { p_policy_id: uuid(input.id, "apólice"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_data: pick(data, PARTY_KEYS) });
    case "party_set_active":
      return call("insurance_policy_party_set_active", { p_party_id: uuid(input.id, "parte"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_active: args.active === true, p_reason: str(args.reason) ?? "" });
    case "clause_add":
      return call("insurance_policy_clause_add", { p_policy_id: uuid(input.id, "apólice"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_data: pick(data, CLAUSE_KEYS) });
    case "terms_save": {
      const kind = str(args.sourceKind);
      if (!kind || !TERMS_KINDS.includes(kind)) throw new InsuranceInputError("Tipo de instrumento inválido (contrato, apólice ou minuta).");
      return call("insurance_instrument_terms_save", { p_policy_id: uuid(input.id, "apólice"), p_source_kind: kind, p_draft_id: kind === "MINUTA" ? uuid(args.draftId, "minuta") : null, p_data: pick(data, TERMS_KEYS) });
    }
    case "coherence_justify": {
      const field = str(args.field);
      if (!field) throw new InsuranceInputError("Informe o campo divergente.");
      return call("insurance_coherence_justify", { p_draft_id: uuid(input.id, "minuta"), p_field: field, p_justification: str(args.justification) ?? "", p_source_ref: str(args.source_ref), p_source_document_id: optUuid(args.source_document_id) });
    }
    case "channel_register":
      return call("insurance_channel_register", { p_project_id: projectId, p_data: pick(data, CHANNEL_KEYS) });
    case "channel_verify":
      return call("insurance_channel_verify", { p_channel_id: uuid(input.id, "canal") });
    case "bank_register":
      return call("bank_guarantee_register", { p_project_id: projectId, p_data: pick(data, BANK_KEYS) });
    case "bank_update":
      return call("bank_guarantee_update", { p_id: uuid(input.id, "fiança"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_data: { ...pick(data, BANK_UPDATE_KEYS), ...pick(args, UPDATE_META_KEYS) } });
    case "other_register":
      return call("other_guarantee_register", { p_project_id: projectId, p_data: pick(data, OTHER_KEYS) });
    case "other_update":
      return call("other_guarantee_update", { p_id: uuid(input.id, "garantia"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_data: { ...pick(data, OTHER_UPDATE_KEYS), ...pick(args, UPDATE_META_KEYS) } });
    case "endorsement_request":
      return call("insurance_endorsement_request", { p_policy_id: uuid(input.id, "apólice"), p_data: pick(data, ENDORSEMENT_REQUEST_KEYS) });
    case "endorsement_advance": {
      const to = str(args.toState);
      if (!to || !ENDORSEMENT_TARGETS.includes(to)) throw new InsuranceInputError("Estado de destino do endosso inválido.");
      return call("insurance_endorsement_advance", { p_id: uuid(input.id, "endosso"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_to_state: to, p_data: pick(data, ENDORSEMENT_ADVANCE_KEYS) });
    }
    case "endorsement_review": {
      // Conferência humana (simples ou dupla): sempre pela RPC de conferência; a independência é imposta pelo banco.
      const outcome = str(args.outcome);
      if (!outcome || !ENDORSEMENT_REVIEW_OUTCOMES.includes(outcome)) throw new InsuranceInputError("Resultado da conferência inválido.");
      return call("insurance_endorsement_review", { p_id: uuid(input.id, "endosso"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_outcome: outcome, p_data: pick(data, ENDORSEMENT_REVIEW_KEYS) });
    }
    case "advance_register":
      return call("insurance_advance_register", { p_project_id: projectId, p_data: pick(data, ADVANCE_KEYS) });
    case "advance_amortize":
      return call("insurance_advance_amortize", { p_advance_id: uuid(input.id, "adiantamento"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_data: pick(data, AMORTIZE_KEYS) });
    case "claim_open":
      return call("insurance_claim_open", { p_project_id: projectId, p_data: pick(data, CLAIM_OPEN_KEYS) });
    case "claim_advance": {
      const to = str(args.toStage);
      if (!to || !CLAIM_TARGETS.includes(to)) throw new InsuranceInputError("Estágio de destino inválido.");
      return call("insurance_claim_advance", { p_claim_id: uuid(input.id, "sinistro"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_to_stage: to, p_data: pick(data, CLAIM_ADVANCE_KEYS) });
    }
    case "dossier_sync": {
      const raw = args.items;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) throw new InsuranceInputError("Lista de itens do dossiê inválida.");
      const items = raw.map((it) => {
        const o = it as Record<string, unknown>;
        const key = str(o.key);
        if (!key) throw new InsuranceInputError("Item do dossiê sem chave.");
        return { key, label: str(o.label) ?? key, required: o.required !== false };
      });
      return call("insurance_dossier_sync", { p_policy_id: uuid(input.id, "apólice"), p_items: items });
    }
    case "dossier_item_set": {
      const status = str(args.status);
      if (!status || !DOSSIER_STATUSES.includes(status)) throw new InsuranceInputError("Situação do item inválida.");
      return call("insurance_dossier_item_set", { p_item_id: uuid(input.id, "item"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_status: status, p_document_id: optUuid(args.documentId), p_note: str(args.note) });
    }
    case "draft_create": {
      // Nenhuma minuta nasce "gerada por IA" nesta UI (não há IA real); o estado é sempre DRAFT (a RPC fixa).
      const picked = pick(data, DRAFT_KEYS);
      return call("insurance_draft_create", { p_project_id: projectId, p_data: { ...picked, generated_by_ai: false } });
    }
    case "draft_update":
      return call("insurance_draft_update", { p_id: uuid(input.id, "minuta"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_subject: str(args.subject) ?? "", p_body: str(args.body) ?? "" });
    case "draft_approve":
      return call("insurance_draft_approve", { p_id: uuid(input.id, "minuta"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_confirmation: str(args.confirmation) ?? "" });
    case "draft_cancel":
      return call("insurance_draft_cancel", { p_id: uuid(input.id, "minuta"), p_expected_row_version: rowVersion(input.expectedRowVersion), p_reason: str(args.reason) ?? "" });
    case "draft_attempt_send":
      return call("insurance_draft_attempt_send", { p_id: uuid(input.id, "minuta") });
    default:
      throw new InsuranceInputError("Operação desconhecida.");
  }
}

export const ALL_INSURANCE_OPS: InsuranceOp[] = [
  "policy_create", "policy_new_version", "party_add", "party_set_active", "clause_add", "terms_save", "coherence_justify", "channel_register", "channel_verify",
  "bank_register", "bank_update", "other_register", "other_update", "endorsement_request", "endorsement_advance", "endorsement_review",
  "advance_register", "advance_amortize", "claim_open", "claim_advance", "dossier_sync", "dossier_item_set",
  "draft_create", "draft_update", "draft_approve", "draft_cancel", "draft_attempt_send",
];

export function isInsuranceOp(v: unknown): v is InsuranceOp {
  return typeof v === "string" && (ALL_INSURANCE_OPS as string[]).includes(v);
}

/** Autorização local (espelho): a RPC repete a checagem — este é só o primeiro filtro (fail-closed). */
export function isOpAllowedForPermission(permission: string | null | undefined, input: InsuranceActionInput): boolean {
  return hasInsuranceLevel(permission, levelForOp(input.op, input));
}
