// Contexto ADICIONAL (somente leitura, sob RLS) das fontes de Qualidade, Garantias e Seguros para DOIS especialistas:
// Analista IA de Qualidade (quality_*) e Consultor Jurídico IA (quality_warranty_* + insurance_* + fianças).
// O conteúdo dessas tabelas inclui texto de e-mail, relato de campo e minutas: é DADO EXTERNO. Por isso cada grupo é
// embrulhado com wrapExternalContent AQUI — e só aqui: o construtor compartilhado (build-project-context) não muda.
// Tabela indisponível/vazia -> "SEM DADOS" explícito (nunca zero, nunca inventado). Nunca escreve.

import type { SupabaseClient } from "@supabase/supabase-js";
import { wrapExternalContent, type InjectionSignal } from "../security/external-content";

export interface AdditionalContextSource {
  sourceId: string;
  label: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  rowCount: number;
  /** Texto pronto para o prompt (já embrulhado como DADO externo). */
  text: string;
  signals: InjectionSignal[];
}

const LIMIT = 40;

interface GroupSpec {
  sourceId: string;
  label: string;
  table: string;
  columns: string;
  orderBy: string;
}

const QUALITY_GROUPS: GroupSpec[] = [
  { sourceId: "quality_ncrs", label: "RNC (quality_ncrs)", table: "quality_ncrs", orderBy: "created_at", columns: "id,code,title,description,state,origin_type,origin_ref,origin_url,criticality,reopen_count,due_date" },
  { sourceId: "quality_evidence", label: "Evidências de Qualidade (quality_evidence)", table: "quality_evidence", orderBy: "created_at", columns: "id,ncr_id,warranty_case_id,source_type,source_ref,source_url,description,classification,epistemic" },
  { sourceId: "quality_warranty_cases", label: "Casos de garantia/assistência (quality_warranty_cases)", table: "quality_warranty_cases", orderBy: "created_at", columns: "id,code,service_system,state,defect_description,delivered_at,discovered_at,communicated_at,cause_category,hidden_defect,solidity_safety,warranty_terms_ref,origin_type,origin_ref" },
  { sourceId: "quality_warranty_maintenance", label: "Comprovantes de manutenção (quality_warranty_maintenance; proof_ref nulo = SEM COMPROVANTE)", table: "quality_warranty_maintenance", orderBy: "created_at", columns: "id,warranty_case_id,performed_at,description,performed_by,proof_ref,proof_url" },
  { sourceId: "quality_customer_complaints", label: "Reclamações de clientes (quality_customer_complaints)", table: "quality_customer_complaints", orderBy: "created_at", columns: "id,code,channel,received_at,subject,description,source_ref,source_url,status" },
];

const LEGAL_GROUPS: GroupSpec[] = [
  { sourceId: "quality_warranty_cases", label: "Casos de garantia/assistência (quality_warranty_cases)", table: "quality_warranty_cases", orderBy: "created_at", columns: "id,code,service_system,state,defect_description,delivered_at,discovered_at,communicated_at,cause_category,hidden_defect,solidity_safety,warranty_terms,warranty_terms_ref,builder_warranty_until,supplier_warranty_until" },
  { sourceId: "quality_warranty_maintenance", label: "Comprovantes de manutenção (quality_warranty_maintenance; proof_ref nulo = SEM COMPROVANTE)", table: "quality_warranty_maintenance", orderBy: "created_at", columns: "id,warranty_case_id,performed_at,description,performed_by,proof_ref,proof_url" },
  { sourceId: "insurance_policies", label: "Apólices (insurance_policies)", table: "insurance_policies", orderBy: "created_at", columns: "id,modality,policy_number,insurer_name,status,coverage_start,coverage_end,max_amount,currency,source_ref" },
  { sourceId: "insurance_endorsements", label: "Endossos (insurance_endorsements)", table: "insurance_endorsements", orderBy: "requested_at", columns: "id,policy_id,endorsement_seq,state,requested_text,issued_text,issued_number,coverage_effective" },
  { sourceId: "insurance_claims", label: "Sinistros e eventos (insurance_claims)", table: "insurance_claims", orderBy: "created_at", columns: "id,policy_id,claim_kind,title,stage,protocol,occurrence_date,claimed_amount,decision_outcome,source_ref" },
  { sourceId: "bank_guarantees", label: "Fianças bancárias (bank_guarantees)", table: "bank_guarantees", orderBy: "created_at", columns: "id,bank_name,guarantee_number,beneficiary_name,principal_name,amount,currency,start_date,end_date" },
];

async function loadGroup(supabase: SupabaseClient, projectId: string, spec: GroupSpec): Promise<AdditionalContextSource> {
  const { data, error } = await supabase
    .from(spec.table)
    .select(spec.columns)
    .eq("project_id", projectId)
    .order(spec.orderBy, { ascending: false })
    .limit(LIMIT);
  if (error) {
    return {
      sourceId: spec.sourceId,
      label: spec.label,
      status: "UNAVAILABLE",
      rowCount: 0,
      text: `SEM DADOS: a fonte ${spec.table} não pôde ser lida neste ambiente (indisponível ou sem permissão). Não conclua sobre o que ela conteria.`,
      signals: [],
    };
  }
  const rows = (data ?? []) as unknown[];
  if (rows.length === 0) {
    return { sourceId: spec.sourceId, label: spec.label, status: "AVAILABLE", rowCount: 0, text: `SEM DADOS: nenhum registro em ${spec.table} para este projeto.`, signals: [] };
  }
  const wrapped = wrapExternalContent(spec.label, JSON.stringify(rows));
  return { sourceId: spec.sourceId, label: spec.label, status: "AVAILABLE", rowCount: rows.length, text: wrapped.text, signals: wrapped.signals };
}

export async function buildQualityAnalystSourcesContext(supabase: SupabaseClient, projectId: string): Promise<AdditionalContextSource[]> {
  return Promise.all(QUALITY_GROUPS.map((spec) => loadGroup(supabase, projectId, spec)));
}

export async function buildLegalConsultantSourcesContext(supabase: SupabaseClient, projectId: string): Promise<AdditionalContextSource[]> {
  return Promise.all(LEGAL_GROUPS.map((spec) => loadGroup(supabase, projectId, spec)));
}

/** Bloco textual único para o prompt (cada grupo continua dentro do seu envelope DADO_EXTERNO). */
export function renderAdditionalSources(sources: readonly AdditionalContextSource[]): string {
  if (sources.length === 0) return "";
  return sources.map((s) => `### ${s.label} — ${s.rowCount} registro(s)\n${s.text}`).join("\n\n");
}
