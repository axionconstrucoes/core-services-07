// Ingestão HUMANA de indícios de Qualidade a partir de fontes de outros módulos (SSMA, e-mails, diários, fiscalização).
// Puro (sem rede/banco). A server action chama estas funções e depois as RPCs quality_find_by_origin / quality_ncr_create.
// Regras (CLAUDE.md 11/12): origem sempre rastreável; a automação NUNCA classifica NC COMPROVADA; nunca duplicar.

import { buildOriginKey } from "./dedupe";
import type { EvidenceClassification, EvidenceSourceType, OriginType } from "./types";

/** Origens que as telas de outros módulos podem oferecer ao botão "Registrar indício de Qualidade". */
export const INGESTION_ORIGIN_TYPES = ["SSMA_FOTO", "EMAIL", "DIARIO_OBRA", "FISCALIZACAO", "DOCUMENTO"] as const;
export type IngestionOriginType = (typeof INGESTION_ORIGIN_TYPES)[number];

/** Classificações que uma pessoa pode escolher no registro de indício. NC_COMPROVADA exige investigação (RNC) — nunca aqui. */
export const INGESTION_CLASSIFICATIONS = ["SUSPEITA", "INDICIO", "RISCO_POTENCIAL"] as const;
export type IngestionClassification = (typeof INGESTION_CLASSIFICATIONS)[number];

export const INGESTION_ORIGIN_LABELS: Record<IngestionOriginType, string> = {
  SSMA_FOTO: "Foto / registro SSMA",
  EMAIL: "E-mail ou anexo",
  DIARIO_OBRA: "Diário de obra",
  FISCALIZACAO: "Relatório de fiscalização",
  DOCUMENTO: "Documento",
};

export const INGESTION_CLASSIFICATION_LABELS: Record<IngestionClassification, string> = {
  SUSPEITA: "Suspeita",
  INDICIO: "Indício",
  RISCO_POTENCIAL: "Risco potencial",
};

export interface IngestionInput {
  projectId: string;
  originType: string;
  /** Referência estável da fonte (id do registro/e-mail/documento). Nunca texto livre do usuário. */
  originRef: string;
  /** Tabela da fonte (ex.: ssma_field_records, emails). */
  sourceTable: string | null;
  /** Caminho interno do ACC que abre a fonte original (começa com /). */
  originUrl: string | null;
  title: string;
  description: string;
  classification: string;
}

export interface IngestionValidated {
  projectId: string;
  originType: IngestionOriginType;
  originRef: string;
  originKey: string;
  sourceTable: string | null;
  originUrl: string | null;
  title: string;
  description: string;
  classification: IngestionClassification;
  evidenceSourceType: EvidenceSourceType;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE = /^[a-z][a-z0-9_]{1,62}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isIngestionOriginType(value: unknown): value is IngestionOriginType {
  return typeof value === "string" && (INGESTION_ORIGIN_TYPES as readonly string[]).includes(value);
}

export function isIngestionClassification(value: unknown): value is IngestionClassification {
  return typeof value === "string" && (INGESTION_CLASSIFICATIONS as readonly string[]).includes(value);
}

/** Só caminho interno do ACC (/..., sem // nem esquema): evita link externo/open-redirect na evidência. */
export function sanitizeOriginUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /[\s\\]/.test(trimmed) || trimmed.length > 500) return null;
  return trimmed;
}

/** A origem da RNC e o tipo da fonte da evidência coincidem (todas as origens de ingestão existem nos dois conjuntos). */
export function evidenceSourceTypeFor(origin: IngestionOriginType): EvidenceSourceType {
  return origin;
}

export type IngestionValidation = { ok: true; value: IngestionValidated } | { ok: false; error: string };

export function validateIngestionInput(input: IngestionInput): IngestionValidation {
  if (!isUuid(input.projectId)) return { ok: false, error: "Projeto inválido." };
  if (!isIngestionOriginType(input.originType)) return { ok: false, error: "Tipo de origem não suportado." };
  const originRef = (input.originRef ?? "").trim();
  if (originRef.length < 1 || originRef.length > 500) return { ok: false, error: "Referência da fonte original obrigatória (rastreabilidade)." };
  const title = (input.title ?? "").trim();
  if (title.length < 3 || title.length > 300) return { ok: false, error: "Título deve ter de 3 a 300 caracteres." };
  const description = (input.description ?? "").trim();
  if (description.length > 4000) return { ok: false, error: "Descrição acima de 4000 caracteres." };
  if (input.classification === "NC_COMPROVADA") {
    return { ok: false, error: "NC COMPROVADA não pode ser registrada aqui: exige investigação e confirmação da RNC por pessoa autorizada." };
  }
  if (!isIngestionClassification(input.classification)) return { ok: false, error: "Classificação inválida (SUSPEITA, INDÍCIO ou RISCO POTENCIAL)." };
  const sourceTable = input.sourceTable && TABLE.test(input.sourceTable) ? input.sourceTable : null;
  return {
    ok: true,
    value: {
      projectId: input.projectId,
      originType: input.originType,
      originRef,
      originKey: buildOriginKey(input.originType as OriginType, originRef),
      sourceTable,
      originUrl: sanitizeOriginUrl(input.originUrl),
      title,
      description,
      classification: input.classification,
      evidenceSourceType: evidenceSourceTypeFor(input.originType),
    },
  };
}

/** Linha de quality_evidence criada por uma PESSOA: fato = a fonte existe; a classificação é a avaliação humana. */
export function buildHumanEvidenceRow(v: IngestionValidated, ncrId: string, userId: string) {
  return {
    project_id: v.projectId,
    ncr_id: ncrId,
    source_type: v.evidenceSourceType,
    source_table: v.sourceTable,
    source_ref: v.originRef,
    source_url: v.originUrl,
    description: v.description || v.title,
    classification: v.classification satisfies EvidenceClassification,
    epistemic: "FATO" as const,
    created_by: userId,
  };
}

export interface FindByOriginRow {
  id: string;
  code: string;
  state: string;
  row_version: number;
}

export type IngestionOutcome =
  | { status: "EXISTS"; ncrId: string; code: string; state: string }
  | { status: "CREATED"; ncrId: string; code: string; evidenceRecorded: boolean; evidenceNote: string | null }
  | { status: "DEDUPLICATED"; ncrId: string; code: string };

/** Mapeia o erro de RPC/RLS para mensagem de uso (sem vazar detalhe interno). */
export function mapQualityRpcError(message: string | null | undefined): string {
  const text = message ?? "";
  if (/FORBIDDEN/.test(text)) return "Sem autorização para registrar Qualidade neste projeto.";
  if (/AUTH_REQUIRED/.test(text)) return "Sessão expirada. Entre novamente.";
  if (/ORIGIN_REQUIRED/.test(text)) return "A fonte original é obrigatória.";
  if (/VERSION_CONFLICT/.test(text)) return "O registro foi alterado por outra pessoa. Recarregue e tente de novo.";
  return "Não foi possível registrar o indício. Tente novamente.";
}

// ---------- referências de origem das telas (formato estável: <tabela-lógica>:<uuid>) ----------
export const ORIGIN_REF_KINDS = {
  email: { table: "emails", originType: "EMAIL" },
  email_attachment: { table: "email_attachments", originType: "EMAIL" },
  ssma_field_record: { table: "ssma_field_records", originType: "SSMA_FOTO" },
  ssma_form_submission: { table: "ssma_form_submissions", originType: "SSMA_FOTO" },
  document_version: { table: "document_versions", originType: "DOCUMENTO" },
} as const;
export type OriginRefKind = keyof typeof ORIGIN_REF_KINDS;

export function buildOriginRef(kind: OriginRefKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseOriginRef(ref: string): { kind: OriginRefKind; id: string } | null {
  const idx = ref.indexOf(":");
  if (idx < 1) return null;
  const kind = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (!(kind in ORIGIN_REF_KINDS) || !isUuid(id)) return null;
  return { kind: kind as OriginRefKind, id };
}

/** Documento de diário de obra (source_type DIARIO_OBRA) sugere DIARIO_OBRA; fiscalização e demais são escolha humana. */
export function originTypeForDocumentSource(sourceType: string | null | undefined): IngestionOriginType {
  return (sourceType ?? "").toUpperCase() === "DIARIO_OBRA" ? "DIARIO_OBRA" : "DOCUMENTO";
}

/**
 * Tipos de origem a consultar na deduplicação. Um documento pode ser classificado pela pessoa como diário, fiscalização
 * ou documento: a MESMA versão de documento não pode gerar duas RNC só porque o tipo escolhido mudou.
 */
export function dedupeOriginTypesFor(originType: IngestionOriginType, originRef: string): IngestionOriginType[] {
  const parsed = parseOriginRef(originRef);
  if (parsed?.kind === "document_version") return ["DIARIO_OBRA", "FISCALIZACAO", "DOCUMENTO"];
  return [originType];
}
