// Modelos de leitura do módulo GARANTIAS (linha do banco snake_case -> camelCase). Puro: sem I/O.
// Tabelas: quality_warranty_cases, quality_warranty_maintenance, quality_warranty_surveys, quality_warranty_repairs,
// quality_evidence, quality_effectiveness_verifications, quality_state_events (migration 20261122100000).

import type { Criticality } from "@/lib/quality/types";

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const req = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new Error(`garantias mapper: campo obrigatório ausente: ${name}`);
  return v;
};

export interface WarrantyCaseView {
  id: string;
  projectId: string;
  code: string;
  contractRef: string | null;
  serviceSystem: string;
  state: string;
  deliveredAt: string | null;
  discoveredAt: string | null;
  communicatedAt: string | null;
  warrantyTerms: string | null;
  warrantyTermsRef: string | null;
  customerComplaint: string | null;
  defectDescription: string;
  causeCategory: string;
  causeNotes: string | null;
  hiddenDefect: boolean;
  solidityAndSafety: boolean;
  responsibleUserId: string | null;
  dueDate: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  supplierName: string | null;
  supplierWarrantyUntil: string | null;
  builderWarrantyUntil: string | null;
  originType: string;
  originRef: string | null;
  ncrId: string | null;
  criticality: Criticality;
  acceptedAt: string | null;
  acceptedByName: string | null;
  stateJustification: string | null;
  closedAt: string | null;
  reopenCount: number;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export function mapWarrantyCaseRow(r: Row): WarrantyCaseView {
  return {
    id: req(r.id, "id"),
    projectId: req(r.project_id, "project_id"),
    code: req(r.code, "code"),
    contractRef: str(r.contract_ref),
    serviceSystem: req(r.service_system, "service_system"),
    state: req(r.state, "state"),
    deliveredAt: str(r.delivered_at),
    discoveredAt: str(r.discovered_at),
    communicatedAt: str(r.communicated_at),
    warrantyTerms: str(r.warranty_terms),
    warrantyTermsRef: str(r.warranty_terms_ref),
    customerComplaint: str(r.customer_complaint),
    defectDescription: req(r.defect_description, "defect_description"),
    causeCategory: str(r.cause_category) ?? "A_DEFINIR",
    causeNotes: str(r.cause_notes),
    hiddenDefect: r.hidden_defect === true,
    solidityAndSafety: r.solidity_safety === true,
    responsibleUserId: str(r.responsible_user_id),
    dueDate: str(r.due_date),
    estimatedCost: num(r.estimated_cost),
    actualCost: num(r.actual_cost),
    supplierName: str(r.supplier_name),
    supplierWarrantyUntil: str(r.supplier_warranty_until),
    builderWarrantyUntil: str(r.builder_warranty_until),
    originType: str(r.origin_type) ?? "MANUAL",
    originRef: str(r.origin_ref),
    ncrId: str(r.ncr_id),
    criticality: (str(r.criticality) ?? "SEM_DADOS") as Criticality,
    acceptedAt: str(r.accepted_at),
    acceptedByName: str(r.accepted_by_name),
    stateJustification: str(r.state_justification),
    closedAt: str(r.closed_at),
    reopenCount: Number(r.reopen_count ?? 0),
    createdAt: req(r.created_at, "created_at"),
    updatedAt: req(r.updated_at, "updated_at"),
    rowVersion: Number(r.row_version ?? 1),
  };
}

export interface MaintenanceView {
  id: string;
  performedAt: string | null;
  description: string;
  performedBy: string | null;
  proofRef: string | null;
  proofUrl: string | null;
}
export const mapMaintenanceRow = (r: Row): MaintenanceView => ({
  id: req(r.id, "id"),
  performedAt: str(r.performed_at),
  description: req(r.description, "description"),
  performedBy: str(r.performed_by),
  proofRef: str(r.proof_ref),
  proofUrl: str(r.proof_url),
});

export interface SurveyView {
  id: string;
  surveyedAt: string;
  findings: string;
  reportRef: string | null;
  surveyorUserId: string | null;
}
export const mapSurveyRow = (r: Row): SurveyView => ({
  id: req(r.id, "id"),
  surveyedAt: req(r.surveyed_at, "surveyed_at"),
  findings: req(r.findings, "findings"),
  reportRef: str(r.report_ref),
  surveyorUserId: str(r.surveyor_user_id),
});

export interface RepairView {
  id: string;
  executedAt: string | null;
  description: string;
  performedBy: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  isRecurrence: boolean;
  previousRepairId: string | null;
}
export const mapRepairRow = (r: Row): RepairView => ({
  id: req(r.id, "id"),
  executedAt: str(r.executed_at),
  description: req(r.description, "description"),
  performedBy: str(r.performed_by),
  estimatedCost: num(r.estimated_cost),
  actualCost: num(r.actual_cost),
  isRecurrence: r.is_recurrence === true,
  previousRepairId: str(r.previous_repair_id),
});

export interface EvidenceView {
  id: string;
  sourceType: string;
  sourceRef: string;
  sourceUrl: string | null;
  description: string | null;
  classification: string;
  epistemic: string;
  capturedAt: string | null;
  createdAt: string;
}
export const mapEvidenceViewRow = (r: Row): EvidenceView => ({
  id: req(r.id, "id"),
  sourceType: req(r.source_type, "source_type"),
  sourceRef: req(r.source_ref, "source_ref"),
  sourceUrl: str(r.source_url),
  description: str(r.description),
  classification: req(r.classification, "classification"),
  epistemic: str(r.epistemic) ?? "FATO",
  capturedAt: str(r.captured_at),
  createdAt: req(r.created_at, "created_at"),
});

export interface VerificationView {
  id: string;
  result: string;
  criteria: string;
  notes: string | null;
  evidenceId: string;
  verifiedBy: string;
  verifiedAt: string;
}
export const mapVerificationViewRow = (r: Row): VerificationView => ({
  id: req(r.id, "id"),
  result: req(r.result, "result"),
  criteria: req(r.criteria, "criteria"),
  notes: str(r.notes),
  evidenceId: req(r.evidence_id, "evidence_id"),
  verifiedBy: req(r.verified_by, "verified_by"),
  verifiedAt: req(r.verified_at, "verified_at"),
});

export interface StateEventView {
  seq: number;
  fromState: string | null;
  toState: string;
  actorUserId: string | null;
  justification: string | null;
  evidenceIds: string[];
  occurredAt: string;
}
export const mapStateEventRow = (r: Row): StateEventView => ({
  seq: Number(r.seq),
  fromState: str(r.from_state),
  toState: req(r.to_state, "to_state"),
  actorUserId: str(r.actor_user_id),
  justification: str(r.justification),
  evidenceIds: Array.isArray(r.evidence_ids) ? (r.evidence_ids as unknown[]).filter((x): x is string => typeof x === "string") : [],
  occurredAt: req(r.occurred_at, "occurred_at"),
});

export interface ComplaintView {
  id: string;
  code: string;
  channel: string;
  receivedAt: string;
  subject: string;
  sourceRef: string;
  sourceUrl: string | null;
}
export const mapComplaintRow = (r: Row): ComplaintView => ({
  id: req(r.id, "id"),
  code: req(r.code, "code"),
  channel: req(r.channel, "channel"),
  receivedAt: req(r.received_at, "received_at"),
  subject: req(r.subject, "subject"),
  sourceRef: req(r.source_ref, "source_ref"),
  sourceUrl: str(r.source_url),
});

export interface ConsequenceView {
  id: string;
  pillar: string;
  severity: string;
  probability: string | null;
  probabilityBasis: string | null;
  description: string | null;
  sourceRef: string;
  status: string;
}
export const mapConsequenceRow = (r: Row): ConsequenceView => ({
  id: req(r.id, "id"),
  pillar: req(r.pillar, "pillar"),
  severity: req(r.severity, "severity"),
  probability: str(r.probability),
  probabilityBasis: str(r.probability_basis),
  description: str(r.description),
  sourceRef: req(r.source_ref, "source_ref"),
  status: str(r.status) ?? "ABERTA",
});

export interface NonQualityCostView {
  id: string;
  category: string;
  description: string | null;
  estimatedAmount: number | null;
  actualAmount: number | null;
  currency: string;
  sourceRef: string | null;
}
export const mapNonQualityCostRow = (r: Row): NonQualityCostView => ({
  id: req(r.id, "id"),
  category: req(r.category, "category"),
  description: str(r.description),
  estimatedAmount: num(r.estimated_amount),
  actualAmount: num(r.actual_amount),
  currency: str(r.currency) ?? "BRL",
  sourceRef: str(r.source_ref),
});

export interface TransitionRuleView {
  toState: string;
  minRole: "REGISTER" | "MANAGE";
  requiresJustification: boolean;
  requiresEvidence: boolean;
}

export interface MaintenanceStatusView {
  records: number;
  withoutProof: number;
  status: "SEM_REGISTRO" | "SEM_COMPROVANTE" | "COMPROVADO";
}

export interface ClosureReadinessView {
  ready: boolean;
  blockers: string[];
}
