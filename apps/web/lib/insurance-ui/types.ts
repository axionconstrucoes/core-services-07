// Tipos da interface de SEGUROS (fase 2). Espelham as linhas devolvidas por SELECT sob RLS nas tabelas da migration
// 20261122200000_seguros_garantias_model.sql (nomes de coluna em snake_case, exatamente como o banco entrega).
// A UI nunca escreve nessas tabelas: toda escrita passa pelas RPCs allowlistadas em rpc-ops.ts.
import type { ClaimKind, ClaimStage, DraftKind, DraftState, EndorsementState, PartyRole, PolicyModality } from "@/lib/insurance";

export type InsuranceUuid = string;

export interface PolicyRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  modality: PolicyModality;
  policy_number: string | null;
  insurer_name: string;
  broker_name: string | null;
  contract_document_id: InsuranceUuid | null;
  contract_number: string | null;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  status: "RASCUNHO" | "VIGENTE" | "VENCIDA" | "CANCELADA" | "SUBSTITUIDA";
  coverage_start: string | null;
  coverage_end: string | null;
  max_amount: number | string | null;
  currency: string;
  notes: string | null;
  version_no: number;
  row_version: number;
  created_at: string;
  updated_at: string;
}

export interface PolicyVersionRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid;
  version_no: number;
  snapshot: Record<string, unknown> | null;
  change_reason: string | null;
  created_at: string;
  created_by: InsuranceUuid | null;
}

export interface PartyRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid;
  party_role: PartyRole;
  party_name: string | null;
  tax_id: string | null;
  identification_status: "IDENTIFICADO" | "NAO_IDENTIFICADO";
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  active: boolean;
  added_in_version: number;
}

export type ClauseKindValue = "COBERTURA" | "CLAUSULA" | "CONDICAO" | "EXCLUSAO" | "SUBLIMITE" | "FRANQUIA" | "PRAZO_AVISO" | "OUTRO";

export interface ClauseRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid;
  kind: ClauseKindValue;
  title: string;
  clause_text: string | null;
  amount: number | string | null;
  deadline_days: number | null;
  applies_to: string[];
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  source_page: string | null;
  verified: boolean;
  added_in_version: number;
}

export type GuaranteeStatus = "RASCUNHO" | "VIGENTE" | "VENCIDA" | "CANCELADA" | "EXECUTADA" | "DEVOLVIDA";

export interface BankGuaranteeRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  bank_name: string;
  guarantee_number: string | null;
  beneficiary_name: string | null;
  principal_name: string | null;
  amount: number | string | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  calls_on_first_demand: boolean | null;
  claim_procedure_note: string | null;
  contract_document_id: InsuranceUuid | null;
  contract_number: string | null;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  status: GuaranteeStatus;
  notes: string | null;
  row_version: number;
}

export interface OtherGuaranteeRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  guarantee_type: "CAUCAO" | "CARTA_FIANCA_NAO_BANCARIA" | "OUTRA";
  caucao_form: "DINHEIRO" | "TITULOS" | "BEM" | "OUTRA" | null;
  issuer_name: string | null;
  beneficiary_name: string | null;
  principal_name: string | null;
  amount: number | string | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  release_conditions: string | null;
  contract_document_id: InsuranceUuid | null;
  contract_number: string | null;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  status: GuaranteeStatus;
  notes: string | null;
  row_version: number;
}

export interface ChannelRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid | null;
  bank_guarantee_id: InsuranceUuid | null;
  entity_name: string;
  channel_type: "EMAIL" | "PORTAL" | "ENDERECO_POSTAL" | "TELEFONE" | "OUTRO";
  channel_value: string;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  active: boolean;
  verified_at: string | null;
  verified_by: InsuranceUuid | null;
}

export interface EndorsementRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid;
  endorsement_seq: number;
  state: EndorsementState;
  requested_text: string;
  requested_at: string;
  request_document_id: InsuranceUuid | null;
  request_ref: string | null;
  issued_text: string | null;
  issued_at: string | null;
  issued_document_id: InsuranceUuid | null;
  issued_number: string | null;
  texts_match: boolean | null;
  comparison: Record<string, unknown> | null;
  divergence_note: string | null;
  verified_at: string | null;
  coverage_effective: boolean;
  refusal_note: string | null;
  row_version: number;
  /** Fase 3/C: quem solicitou / registrou a emissão / conferiu por último (independência da dupla conferência). */
  requested_by: InsuranceUuid | null;
  issued_by: InsuranceUuid | null;
  verified_by: InsuranceUuid | null;
  /** Classificação declarada (itens críticos exigem dupla conferência); null = sem classificação = crítico (fail-closed). */
  change_kinds: string[] | null;
  requires_dual_review: boolean;
  dual_review_reason: "SEM_CLASSIFICACAO" | "CLASSIFICACAO_CRITICA" | "TEXTO_DIVERGENTE" | null;
  /** Endosso CONFERIDO antes da dupla conferência (conferência única histórica, permanece válido). */
  legacy_single_review: boolean;
  review_round: number;
}

/** Uma conferência humana (append-only): autor, instante, resultado e nota. */
export interface EndorsementReviewRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  endorsement_id: InsuranceUuid;
  review_round: number;
  review_no: number;
  reviewer_id: InsuranceUuid;
  outcome: "APROVADO" | "RECUSADO";
  note: string | null;
  texts_match: boolean | null;
  dual_required: boolean;
  reviewed_at: string;
}

export interface AdvanceRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid | null;
  contract_document_id: InsuranceUuid | null;
  contract_number: string | null;
  advanced_amount: number | string;
  advance_date: string | null;
  purpose: string;
  application_documented: boolean;
  application_document_id: InsuranceUuid | null;
  guaranteed_limit: number | string | null;
  balance_due_informed: number | string | null;
  indemnifiable_informed: number | string | null;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  notes: string | null;
  row_version: number;
}

export interface AmortizationRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  advance_id: InsuranceUuid;
  amount: number | string;
  amortized_on: string | null;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  note: string | null;
}

export interface ClaimRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid | null;
  bank_guarantee_id: InsuranceUuid | null;
  other_guarantee_id: InsuranceUuid | null;
  advance_id: InsuranceUuid | null;
  claim_kind: ClaimKind;
  title: string;
  stage: ClaimStage;
  protocol: string | null;
  occurrence_date: string | null;
  claimed_amount: number | string | null;
  notice_deadline_at: string | null;
  notice_deadline_basis: string | null;
  contractual_basis_clause_id: InsuranceUuid | null;
  contractual_basis_note: string | null;
  no_instrument_reason: string | null;
  decision_outcome: "DEFERIDO" | "INDEFERIDO" | "PARCIAL" | null;
  source_document_id: InsuranceUuid | null;
  source_ref: string | null;
  row_version: number;
  created_at: string;
}

export interface ClaimStepRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  claim_id: InsuranceUuid;
  from_stage: string | null;
  stage: string;
  occurred_at: string;
  protocol: string | null;
  note: string | null;
  document_id: InsuranceUuid | null;
  created_by: InsuranceUuid | null;
}

export type DossierStatus = "PENDENTE" | "ANEXADO" | "DISPENSADO" | "NAO_APLICAVEL";

export interface DossierItemRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  policy_id: InsuranceUuid;
  item_key: string;
  label: string;
  required: boolean;
  status: DossierStatus;
  document_id: InsuranceUuid | null;
  note: string | null;
  row_version: number;
}

export interface DraftRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  draft_kind: DraftKind;
  policy_id: InsuranceUuid | null;
  bank_guarantee_id: InsuranceUuid | null;
  claim_id: InsuranceUuid | null;
  endorsement_id: InsuranceUuid | null;
  official_channel_id: InsuranceUuid | null;
  subject: string;
  body: string;
  basis: { facts?: string[]; inferences?: string[]; recommendations?: string[] } | null;
  generated_by_ai: boolean;
  state: DraftState;
  approved_by: InsuranceUuid | null;
  approved_at: string | null;
  approved_body_hash: string | null;
  row_version: number;
  created_at: string;
}

export interface AuditEventRow {
  id: InsuranceUuid;
  project_id: InsuranceUuid;
  occurred_at: string;
  entity_type: string;
  entity_id: InsuranceUuid | null;
  action: string;
  actor_user_id: InsuranceUuid | null;
  detail: Record<string, unknown> | null;
}

export interface SettingsRow {
  project_id: InsuranceUuid;
  real_send_enabled: boolean;
}

export interface DashboardItemRow {
  kind: string;
  project_id: InsuranceUuid;
  entity_type: string;
  entity_id: InsuranceUuid;
  title: string;
  due_date: string | null;
  days_to_due: number | null;
  severity: string;
  detail: Record<string, unknown> | null;
}

export interface DocumentRef {
  id: InsuranceUuid;
  title: string;
  kind: string;
  /** Versão mais recente (para o link direto à fonte); ausente quando o documento não tem versão legível. */
  latestVersionId: InsuranceUuid | null;
}

export interface InsuranceWorkspaceData {
  projectId: string;
  policies: PolicyRow[];
  versions: PolicyVersionRow[];
  parties: PartyRow[];
  clauses: ClauseRow[];
  bankGuarantees: BankGuaranteeRow[];
  otherGuarantees: OtherGuaranteeRow[];
  channels: ChannelRow[];
  endorsements: EndorsementRow[];
  endorsementReviews: EndorsementReviewRow[];
  advances: AdvanceRow[];
  amortizations: AmortizationRow[];
  claims: ClaimRow[];
  claimSteps: ClaimStepRow[];
  dossierItems: DossierItemRow[];
  drafts: DraftRow[];
  audit: AuditEventRow[];
  settings: SettingsRow | null;
  dashboardItems: DashboardItemRow[];
  documents: DocumentRef[];
  /** Nome legível de quem atuou (profiles); ausente => o id abreviado é exibido. */
  actors: Record<string, string>;
}

export type SectionKey = Exclude<keyof InsuranceWorkspaceData, "projectId" | "actors">;

export interface InsuranceWorkspaceLoad {
  data: InsuranceWorkspaceData;
  /** Seções que FALHARAM ao carregar (nunca tratadas como vazias: a tela mostra o erro). */
  errors: Partial<Record<SectionKey, string>>;
  /** true quando as tabelas do módulo não existem no banco consultado (migrações pendentes). */
  moduleUnavailable: boolean;
  /** Linhas descartadas por pertencerem a outro projeto (defesa em profundidade; a RLS já isola). */
  foreignRowsDropped: number;
}
