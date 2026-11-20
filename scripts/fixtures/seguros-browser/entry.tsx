// Fixture de navegador do módulo SEGUROS: monta o SegurosWorkspace REAL com dados sintéticos, sem Next, login, Supabase ou rede.
// Query: role=ADMINISTRADOR|COLABORADOR|LEITURA (padrão ADMINISTRADOR). window.__mode controla a Server Action simulada (stubs/seguros-actions.ts).
import { createRoot } from "react-dom/client";
import { SegurosWorkspace } from "@/components/insurance/seguros-workspace";
import { emptyWorkspace } from "@/lib/insurance-ui/data";
import { insuranceCapabilities } from "@/lib/insurance-ui/permissions";

const P = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const data = emptyWorkspace(P);
data.documents = [
  { id: id(900), title: "Apólice sintética.pdf", kind: "APOLICE", latestVersionId: id(901) },
  { id: id(902), title: "Endosso emitido sintético.pdf", kind: "OUTRO", latestVersionId: null },
];
data.policies = [{ id: id(1), project_id: P, modality: "SEGURO_GARANTIA_EXECUTANTE", policy_number: "AP-1", insurer_name: "Seguradora Sintética", broker_name: null, contract_document_id: null, contract_number: "CT-9", source_document_id: id(900), source_ref: null, status: "VIGENTE", coverage_start: "2026-01-01", coverage_end: "2026-12-01", max_amount: 1000000, currency: "BRL", notes: null, version_no: 2, row_version: 2, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z" }];
data.versions = [{ id: id(2), project_id: P, policy_id: id(1), version_no: 1, snapshot: { policy: { status: "RASCUNHO", coverage_start: "2026-01-01", coverage_end: "2026-12-01" }, parties: [], clauses: [] }, change_reason: "Criação da apólice", created_at: "2026-01-01T00:00:00Z", created_by: null }];
data.parties = [
  { id: id(3), project_id: P, policy_id: id(1), party_role: "SEGURADO", party_name: "Contratante Sintética SA", tax_id: "11.111.111/0001-11", identification_status: "IDENTIFICADO", source_document_id: id(900), source_ref: null, active: true, added_in_version: 1 },
  { id: id(4), project_id: P, policy_id: id(1), party_role: "PROPRIETARIO_FINAL", party_name: null, tax_id: null, identification_status: "NAO_IDENTIFICADO", source_document_id: null, source_ref: "contrato cl. 2", active: true, added_in_version: 1 },
];
data.clauses = [{ id: id(5), project_id: P, policy_id: id(1), kind: "COBERTURA", title: "Cobertura de inadimplemento", clause_text: null, amount: null, deadline_days: null, applies_to: ["INADIMPLEMENTO"], source_document_id: id(900), source_ref: null, source_page: "3", verified: true, added_in_version: 1 }];
data.bankGuarantees = [{ id: id(6), project_id: P, bank_name: "Banco Sintético", guarantee_number: "FB-1", beneficiary_name: "Contratante", principal_name: "Executante", amount: 500000, currency: "BRL", start_date: "2026-01-01", end_date: "2026-11-30", calls_on_first_demand: null, claim_procedure_note: null, contract_document_id: null, contract_number: null, source_document_id: id(900), source_ref: null, status: "VIGENTE", notes: null, row_version: 1 }];
data.channels = [{ id: id(7), project_id: P, policy_id: id(1), bank_guarantee_id: null, entity_name: "Seguradora Sintética", channel_type: "EMAIL", channel_value: "sinistros@exemplo.invalid", source_document_id: id(900), source_ref: null, active: true, verified_at: null, verified_by: null }];
data.endorsements = [{ id: id(8), project_id: P, policy_id: id(1), endorsement_seq: 1, state: "EMITIDO", requested_text: "Incluir o proprietário final como segurado", requested_at: "2026-03-01T00:00:00Z", request_document_id: null, request_ref: "e-mail", issued_text: "Incluir o proprietário final como segurado, exceto danos estéticos", issued_at: "2026-03-10T00:00:00Z", issued_document_id: id(902), issued_number: "E-7", texts_match: false, comparison: null, divergence_note: null, verified_at: null, coverage_effective: false, refusal_note: null, row_version: 2 }];
data.advances = [{ id: id(9), project_id: P, policy_id: id(1), contract_document_id: null, contract_number: null, advanced_amount: 100000, advance_date: "2026-02-01", purpose: "Mobilização", application_documented: false, application_document_id: null, guaranteed_limit: 50000, balance_due_informed: null, indemnifiable_informed: null, source_document_id: id(900), source_ref: null, notes: null, row_version: 2 }];
data.amortizations = [{ id: id(10), project_id: P, advance_id: id(9), amount: 30000, amortized_on: "2026-03-01", source_document_id: id(900), source_ref: null, note: null }];
data.claims = [
  { id: id(11), project_id: P, policy_id: id(1), bank_guarantee_id: null, other_guarantee_id: null, advance_id: null, claim_kind: "INADIMPLEMENTO", title: "Inadimplemento do executante", stage: "AVISO", protocol: null, occurrence_date: "2026-06-01", claimed_amount: null, notice_deadline_at: null, notice_deadline_basis: null, contractual_basis_clause_id: null, contractual_basis_note: null, no_instrument_reason: null, decision_outcome: null, source_document_id: id(900), source_ref: null, row_version: 1, created_at: "2026-06-02T00:00:00Z" },
  { id: id(12), project_id: P, policy_id: null, bank_guarantee_id: null, other_guarantee_id: null, advance_id: null, claim_kind: "OUTRO", title: "Evento sem apólice", stage: "EXPECTATIVA", protocol: null, occurrence_date: null, claimed_amount: null, notice_deadline_at: null, notice_deadline_basis: null, contractual_basis_clause_id: null, contractual_basis_note: "Cláusula contratual prevê comunicação prévia", no_instrument_reason: "Apólice não localizada", decision_outcome: null, source_document_id: null, source_ref: "e-mail 10/06", row_version: 1, created_at: "2026-06-10T00:00:00Z" },
];
data.claimSteps = [{ id: id(13), project_id: P, claim_id: id(11), from_stage: null, stage: "AVISO", occurred_at: "2026-06-02T00:00:00Z", protocol: null, note: "Abertura do evento", document_id: null, created_by: null }];
data.dossierItems = [{ id: id(14), project_id: P, policy_id: id(1), item_key: "apolice_condicoes", label: "Apólice com condições gerais", required: true, status: "PENDENTE", document_id: null, note: null, row_version: 1 }];
data.drafts = [{ id: id(15), project_id: P, draft_kind: "AVISO_SINISTRO", policy_id: id(1), bank_guarantee_id: null, claim_id: id(11), endorsement_id: null, official_channel_id: id(7), subject: "Aviso de sinistro — AP-1", body: "Vimos, por meio desta, comunicar a ocorrência do evento descrito abaixo.", basis: { facts: ["Fonte: Apólice sintética.pdf"], inferences: [], recommendations: ["Revisar o texto"] }, generated_by_ai: false, state: "DRAFT", approved_by: null, approved_at: null, approved_body_hash: null, row_version: 1, created_at: "2026-06-03T00:00:00Z" }];
data.audit = [{ id: id(16), project_id: P, occurred_at: "2026-06-03T00:00:00Z", entity_type: "INSURANCE_DRAFT", entity_id: id(15), action: "DRAFT_CREATED", actor_user_id: null, detail: { draftKind: "AVISO_SINISTRO", state: "DRAFT" } }];
data.dashboardItems = [
  { kind: "VENCIMENTO", project_id: P, entity_type: "INSURANCE_POLICY", entity_id: id(1), title: "SEGURO_GARANTIA_EXECUTANTE AP-1", due_date: "2026-12-01", days_to_due: 11, severity: "A_VENCER", detail: {} },
  { kind: "ENDOSSO_PENDENTE", project_id: P, entity_type: "INSURANCE_ENDORSEMENT", entity_id: id(8), title: "Endosso 1 (EMITIDO)", due_date: null, days_to_due: null, severity: "CONFERENCIA_PENDENTE", detail: {} },
];

declare global {
  interface Window {
    __ready?: boolean;
  }
}
const role = new URLSearchParams(location.search).get("role") ?? "ADMINISTRADOR";
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16 }} className="mx-auto max-w-[1200px]">
    <SegurosWorkspace projectId={P} load={{ data, errors: {}, moduleUnavailable: false, foreignRowsDropped: 0 }} caps={insuranceCapabilities(role)} today="2026-11-20" nowIso="2026-11-20T12:00:00.000Z" />
  </div>,
);
window.__ready = true;
