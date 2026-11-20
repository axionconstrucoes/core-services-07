// Lógica PURA das ações do módulo GARANTIAS (validação de entrada e tradução de erros). Testável sem Next/Supabase.
// A UI nunca é a autoridade: as mesmas regras existem no banco (RPCs quality_warranty_* e RLS por projeto); aqui só
// se evita ida-e-volta inútil e se traduz o erro para o usuário. Escrita: RPC (criação e transição) e INSERT/UPDATE sob RLS
// (registros filhos: não há RPC dedicada na fase 1).

import { parseQualityError } from "@/lib/quality/mappers";
import { MIN_JUSTIFICATION_LENGTH, findTransition } from "@/lib/quality/state-machine";
import { ERROR_MESSAGES } from "./labels";

export type ActionFailure = { ok: false; code: string; message: string };
export type ActionSuccess<T extends object = Record<string, never>> = { ok: true } & T;
export type ActionResult<T extends object = Record<string, never>> = ActionSuccess<T> | ActionFailure;

export const fail = (code: string, message: string): ActionFailure => ({ ok: false, code, message });

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type Raw = Record<string, string | undefined | null>;
const text = (raw: Raw, key: string): string => (raw[key] ?? "").toString().trim();
const opt = (raw: Raw, key: string): string | null => text(raw, key) || null;

function isRealDate(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function optDate(raw: Raw, key: string, label: string, errors: string[]): string | null {
  const v = opt(raw, key);
  if (v === null) return null;
  if (!isRealDate(v)) {
    errors.push(`${label}: data inválida (use AAAA-MM-DD).`);
    return null;
  }
  return v;
}

/** Aceita "1234,56" ou "1234.56"; vazio => null (SEM DADOS); negativo/ilegível => erro. */
export function parseMoney(raw: Raw, key: string, label: string, errors: string[]): number | null {
  const v = opt(raw, key);
  if (v === null) return null;
  let s = v.replace(/R\$|\s/g, "");
  // "1.234,56" (pt-BR) -> 1234.56 ; "1234,56" -> 1234.56 ; "1234.56" permanece
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  // "1.500" sem vírgula é mil e quinhentos em pt-BR (separador de milhar), nunca 1,5: mesma regra de parseDecimalPtBr (Seguros). Correção Fase 3/E.
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const value = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${label}: valor inválido (use número não negativo).`);
    return null;
  }
  return Math.round(value * 100) / 100;
}

function lengthBetween(value: string, min: number, max: number, label: string, errors: string[]): void {
  if (value.length < min || value.length > max) errors.push(`${label}: de ${min} a ${max} caracteres.`);
}

// ---------------------------------------------------------------- criação do caso
export interface CreateCasePayload {
  serviceSystem: string;
  defectDescription: string;
  data: Record<string, string | boolean | number>;
}

export function buildCreateCasePayload(raw: Raw): { ok: true; payload: CreateCasePayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const serviceSystem = text(raw, "serviceSystem");
  const defectDescription = text(raw, "defectDescription");
  lengthBetween(serviceSystem, 2, 200, "Serviço/sistema", errors);
  lengthBetween(defectDescription, 3, 4000, "Defeito", errors);
  const data: Record<string, string | boolean | number> = {};
  const put = (k: string, v: string | number | null) => {
    if (v !== null && v !== "") data[k] = v;
  };
  put("contract_ref", opt(raw, "contractRef"));
  put("delivered_at", optDate(raw, "deliveredAt", "Data de entrega", errors));
  put("discovered_at", optDate(raw, "discoveredAt", "Data de descoberta", errors));
  put("communicated_at", optDate(raw, "communicatedAt", "Data da comunicação", errors));
  put("warranty_terms", opt(raw, "warrantyTerms"));
  put("warranty_terms_ref", opt(raw, "warrantyTermsRef"));
  put("customer_complaint", opt(raw, "customerComplaint"));
  put("supplier_name", opt(raw, "supplierName"));
  put("supplier_warranty_until", optDate(raw, "supplierWarrantyUntil", "Garantia do fornecedor até", errors));
  put("builder_warranty_until", optDate(raw, "builderWarrantyUntil", "Garantia da construtora até", errors));
  put("due_date", optDate(raw, "dueDate", "Prazo", errors));
  put("estimated_cost", parseMoney(raw, "estimatedCost", "Custo estimado", errors));
  const origin = opt(raw, "originType") ?? "MANUAL";
  if (!["EMAIL", "RECLAMACAO_CLIENTE", "DOCUMENTO", "DIARIO_OBRA", "INSPECAO", "MANUAL"].includes(origin)) errors.push("Origem inválida.");
  put("origin_type", origin);
  const originRef = opt(raw, "originRef");
  if (origin !== "MANUAL" && !originRef) errors.push("Informe a referência da origem (e-mail, documento, diário...): sem fonte rastreável não há caso.");
  put("origin_ref", originRef);
  if (raw.hiddenDefect === "on" || raw.hiddenDefect === "true") data.hidden_defect = true;
  if (raw.solidityAndSafety === "on" || raw.solidityAndSafety === "true") data.solidity_safety = true;
  const cause = opt(raw, "causeCategory");
  if (cause) put("cause_category", cause);
  const responsible = opt(raw, "responsibleUserId");
  if (responsible) {
    if (isUuid(responsible)) put("responsible_user_id", responsible);
    else errors.push("Responsável inválido.");
  }
  return errors.length ? { ok: false, errors } : { ok: true, payload: { serviceSystem, defectDescription, data } };
}

// ---------------------------------------------------------------- transição
export interface TransitionInput {
  caseId: string;
  toState: string;
  expectedVersion: number;
  justification: string | null;
  evidenceIds: string[];
  fromState: string;
}

export function validateTransitionInput(input: TransitionInput): string[] {
  const errors: string[] = [];
  if (!isUuid(input.caseId)) errors.push("Caso inválido.");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) errors.push("Versão do caso ausente: recarregue a página.");
  const rule = findTransition("WARRANTY", input.fromState, input.toState);
  if (!rule) {
    errors.push("Transição não prevista no ciclo de estados.");
    return errors;
  }
  if (rule.requiresJustification && (input.justification ?? "").trim().length < MIN_JUSTIFICATION_LENGTH) {
    errors.push(`Justificativa obrigatória (mínimo de ${MIN_JUSTIFICATION_LENGTH} caracteres).`);
  }
  if (rule.requiresEvidence && input.evidenceIds.length === 0) errors.push("Evidência obrigatória: selecione ao menos uma evidência do caso.");
  if (input.evidenceIds.some((id) => !isUuid(id))) errors.push("Evidência inválida.");
  return errors;
}

// ---------------------------------------------------------------- registros filhos
export function buildMaintenancePayload(raw: Raw) {
  const errors: string[] = [];
  const description = text(raw, "description");
  lengthBetween(description, 3, 2000, "Descrição", errors);
  const performedAt = optDate(raw, "performedAt", "Data da manutenção", errors);
  const proofRef = opt(raw, "proofRef");
  const proofUrl = opt(raw, "proofUrl");
  if (proofUrl && !/^https?:\/\//i.test(proofUrl)) errors.push("Link do comprovante: use um endereço http(s).");
  // sem comprovante é um FATO aceito (fica marcado SEM COMPROVANTE); nunca se inventa comprovante
  return errors.length
    ? ({ ok: false, errors } as const)
    : ({ ok: true, row: { description, performed_at: performedAt, performed_by: opt(raw, "performedBy"), proof_ref: proofRef, proof_url: proofUrl } } as const);
}

export function buildSurveyPayload(raw: Raw) {
  const errors: string[] = [];
  const findings = text(raw, "findings");
  lengthBetween(findings, 3, 4000, "Constatações", errors);
  const surveyedAt = opt(raw, "surveyedAt");
  if (!surveyedAt || !isRealDate(surveyedAt.slice(0, 10))) errors.push("Data da vistoria obrigatória (AAAA-MM-DD).");
  return errors.length
    ? ({ ok: false, errors } as const)
    : ({ ok: true, row: { findings, surveyed_at: `${(surveyedAt as string).slice(0, 10)}T12:00:00Z`, report_ref: opt(raw, "reportRef") } } as const);
}

export function buildRepairPayload(raw: Raw) {
  const errors: string[] = [];
  const description = text(raw, "description");
  lengthBetween(description, 3, 4000, "Descrição do reparo", errors);
  const executedAt = optDate(raw, "executedAt", "Data de execução", errors);
  const estimated = parseMoney(raw, "estimatedCost", "Custo estimado", errors);
  const actual = parseMoney(raw, "actualCost", "Custo realizado", errors);
  const isRecurrence = raw.isRecurrence === "on" || raw.isRecurrence === "true";
  const previous = opt(raw, "previousRepairId");
  if (isRecurrence && !previous) errors.push("Reincidência exige indicar o reparo anterior.");
  if (previous && !isUuid(previous)) errors.push("Reparo anterior inválido.");
  return errors.length
    ? ({ ok: false, errors } as const)
    : ({
        ok: true,
        row: {
          description,
          executed_at: executedAt ? `${executedAt}T12:00:00Z` : null,
          performed_by: opt(raw, "performedBy"),
          estimated_cost: estimated,
          actual_cost: actual,
          is_recurrence: isRecurrence,
          previous_repair_id: isRecurrence ? previous : null,
        },
      } as const);
}

export const EVIDENCE_SOURCES = ["SSMA_FOTO", "EMAIL", "DIARIO_OBRA", "FISCALIZACAO", "INSPECAO", "ENSAIO_LAUDO", "DOCUMENTO", "OUTRO"] as const;
export const EVIDENCE_CLASSIFICATIONS = ["SUSPEITA", "INDICIO", "NC_COMPROVADA", "RISCO_POTENCIAL"] as const;
export const EPISTEMICS = ["FATO", "INFERENCIA", "RECOMENDACAO"] as const;

export function buildEvidencePayload(raw: Raw) {
  const errors: string[] = [];
  const sourceType = text(raw, "sourceType");
  const sourceRef = text(raw, "sourceRef");
  const classification = text(raw, "classification");
  const epistemic = text(raw, "epistemic") || "FATO";
  if (!(EVIDENCE_SOURCES as readonly string[]).includes(sourceType)) errors.push("Tipo de fonte inválido.");
  lengthBetween(sourceRef, 1, 1000, "Referência da fonte (e-mail, foto, diário, relatório)", errors);
  if (!(EVIDENCE_CLASSIFICATIONS as readonly string[]).includes(classification)) errors.push("Classificação inválida.");
  if (!(EPISTEMICS as readonly string[]).includes(epistemic)) errors.push("Tipo epistêmico inválido.");
  const sourceUrl = opt(raw, "sourceUrl");
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) errors.push("Link da fonte: use um endereço http(s).");
  return errors.length
    ? ({ ok: false, errors } as const)
    : ({ ok: true, row: { source_type: sourceType, source_ref: sourceRef, source_url: sourceUrl, description: opt(raw, "description"), classification, epistemic } } as const);
}

export function buildVerificationPayload(raw: Raw) {
  const errors: string[] = [];
  const result = text(raw, "result");
  if (!["EFICAZ", "INEFICAZ", "PARCIAL"].includes(result)) errors.push("Resultado da verificação inválido.");
  const criteria = text(raw, "criteria");
  lengthBetween(criteria, 5, 2000, "Critério da verificação", errors);
  const evidenceId = text(raw, "evidenceId");
  if (!isUuid(evidenceId)) errors.push("A verificação exige uma evidência do caso.");
  return errors.length
    ? ({ ok: false, errors } as const)
    : ({ ok: true, row: { result, criteria, notes: opt(raw, "notes"), evidence_id: evidenceId } } as const);
}

export function buildAcceptancePayload(raw: Raw) {
  const errors: string[] = [];
  const acceptedBy = text(raw, "acceptedByName");
  lengthBetween(acceptedBy, 2, 200, "Nome de quem aceitou", errors);
  const day = opt(raw, "acceptedAt");
  if (!day || !isRealDate(day)) errors.push("Data do aceite obrigatória (AAAA-MM-DD).");
  return errors.length
    ? ({ ok: false, errors } as const)
    : ({ ok: true, row: { accepted_at: `${day}T12:00:00Z`, accepted_by_name: acceptedBy } } as const);
}

/** Campos do caso editáveis (UPDATE sob RLS com versão otimista). Estado, versão e criticidade NUNCA entram aqui. */
export function buildCaseUpdatePayload(raw: Raw) {
  const errors: string[] = [];
  const row: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    row[k] = v;
  };
  const defect = text(raw, "defectDescription");
  if (defect) {
    lengthBetween(defect, 3, 4000, "Defeito", errors);
    set("defect_description", defect);
  }
  const cause = opt(raw, "causeCategory");
  if (cause) set("cause_category", cause);
  set("cause_notes", opt(raw, "causeNotes"));
  set("hidden_defect", raw.hiddenDefect === "on" || raw.hiddenDefect === "true");
  set("solidity_safety", raw.solidityAndSafety === "on" || raw.solidityAndSafety === "true");
  const responsible = opt(raw, "responsibleUserId");
  if (responsible && !isUuid(responsible)) errors.push("Responsável inválido.");
  set("responsible_user_id", responsible);
  set("due_date", optDate(raw, "dueDate", "Prazo", errors));
  set("estimated_cost", parseMoney(raw, "estimatedCost", "Custo estimado", errors));
  set("actual_cost", parseMoney(raw, "actualCost", "Custo realizado", errors));
  set("supplier_name", opt(raw, "supplierName"));
  set("supplier_warranty_until", optDate(raw, "supplierWarrantyUntil", "Garantia do fornecedor até", errors));
  set("builder_warranty_until", optDate(raw, "builderWarrantyUntil", "Garantia da construtora até", errors));
  set("warranty_terms", opt(raw, "warrantyTerms"));
  set("warranty_terms_ref", opt(raw, "warrantyTermsRef"));
  set("contract_ref", opt(raw, "contractRef"));
  set("customer_complaint", opt(raw, "customerComplaint"));
  set("delivered_at", optDate(raw, "deliveredAt", "Data de entrega", errors));
  set("discovered_at", optDate(raw, "discoveredAt", "Data de descoberta", errors));
  set("communicated_at", optDate(raw, "communicatedAt", "Data da comunicação", errors));
  return errors.length ? ({ ok: false, errors } as const) : ({ ok: true, row } as const);
}

// ---------------------------------------------------------------- erros
/** Traduz erro do Postgres/PostgREST para código estável + mensagem em português (nunca expõe SQL). */
export function translateDbError(error: { message?: string; code?: string } | null | undefined): ActionFailure {
  const message = (error?.message ?? "").trim();
  const parsed = parseQualityError(message);
  if (parsed) {
    const base = ERROR_MESSAGES[parsed.code] ?? parsed.code;
    const detail = parsed.code === "TRANSITION_BLOCKED" && parsed.detail ? ` (${parsed.detail})` : "";
    return fail(parsed.code, `${base}${detail}`);
  }
  if (error?.code === "42501" || /row-level security|permission denied/i.test(message)) return fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN);
  const trigger = /^(VERIFICATION_STATE_INVALID|VERIFICATION_EVIDENCE_REQUIRED|VERIFICATION_EVIDENCE_INVALID|EVIDENCE_SOURCE_IMMUTABLE|IMMUTABLE_KEY)/.exec(message);
  if (trigger) {
    const map: Record<string, string> = {
      VERIFICATION_STATE_INVALID: "A verificação de eficácia só pode ser registrada com o caso no estado Reparada.",
      VERIFICATION_EVIDENCE_REQUIRED: "A verificação de eficácia exige evidência.",
      VERIFICATION_EVIDENCE_INVALID: "A evidência da verificação deve pertencer a este caso.",
      EVIDENCE_SOURCE_IMMUTABLE: "A fonte original de uma evidência não pode ser alterada.",
      IMMUTABLE_KEY: "Chave do registro não pode ser alterada.",
    };
    return fail(trigger[1], map[trigger[1]]);
  }
  if (error?.code === "23505") return fail("DUPLICATE", "Registro já existe para esta origem/fonte (duplicidade evitada).");
  if (error?.code === "42P01" || error?.code === "PGRST205") return fail("UNAVAILABLE", "Módulo indisponível neste ambiente (migrations de Qualidade/Garantias pendentes).");
  return fail("UNKNOWN", "Não foi possível concluir a ação. Nada foi alterado indevidamente; tente novamente ou acione o administrador.");
}

export const versionConflict = (): ActionFailure => fail("VERSION_CONFLICT", ERROR_MESSAGES.VERSION_CONFLICT);

/** FormData -> objeto simples (somente valores string). */
export function formToRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
