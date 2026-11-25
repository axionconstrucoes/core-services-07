// Leitura do módulo GARANTIAS (servidor). SOMENTE SELECT/RPC de leitura sob RLS, com o cliente do USUÁRIO
// (createSupabaseServerClient) — nunca o cliente administrativo. Toda consulta filtra também por project_id
// (defesa em profundidade; a RLS por projeto é a autoridade). Sem dado -> listas vazias (a UI mostra SEM DADOS).

import { createSupabaseServerClient } from "@axion/db/server";
import {
  mapAcceptanceRow,
  mapComplaintRow,
  mapConsequenceRow,
  mapEvidenceViewRow,
  mapMaintenanceRow,
  mapNonQualityCostRow,
  mapRepairRow,
  mapStateEventRow,
  mapSurveyRow,
  mapVerificationViewRow,
  mapWarrantyCaseRow,
  type AcceptanceRecordView,
  type ClosureReadinessView,
  type ComplaintView,
  type ConsequenceView,
  type EvidenceView,
  type MaintenanceStatusView,
  type MaintenanceView,
  type NonQualityCostView,
  type RepairView,
  type StateEventView,
  type SurveyView,
  type TransitionRuleView,
  type VerificationView,
  type WarrantyCaseView,
} from "./types";

type Row = Record<string, unknown>;

function isUnavailable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""));
}

export interface WarrantyListResult {
  available: boolean;
  error: string | null;
  cases: WarrantyCaseView[];
}

export async function listWarrantyCases(projectId: string): Promise<WarrantyListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quality_warranty_cases")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { available: !isUnavailable(error), error: isUnavailable(error) ? null : "Não foi possível carregar os casos de garantia.", cases: [] };
  return { available: true, error: null, cases: ((data ?? []) as Row[]).map(mapWarrantyCaseRow) };
}

export interface WarrantyDetail {
  warranty: WarrantyCaseView;
  maintenance: MaintenanceView[];
  maintenanceStatus: MaintenanceStatusView | null;
  surveys: SurveyView[];
  repairs: RepairView[];
  evidence: EvidenceView[];
  verifications: VerificationView[];
  /** Histórico append-only do aceite do cliente (informado x comprovado), mais recente primeiro. */
  acceptances: AcceptanceRecordView[];
  events: StateEventView[];
  complaints: ComplaintView[];
  consequences: ConsequenceView[];
  costs: NonQualityCostView[];
  linkedNcr: { id: string; code: string; state: string } | null;
  /** Transições previstas a partir do estado atual (catálogo quality_state_transitions). */
  transitions: TransitionRuleView[];
  /** Bloqueios por estado de destino (quality_transition_blockers). Vazio = sem bloqueio das guardas. */
  blockersByTarget: Record<string, string[]>;
  readiness: ClosureReadinessView | null;
}

export async function getWarrantyDetail(projectId: string, caseId: string): Promise<WarrantyDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: caseRow, error } = await supabase.from("quality_warranty_cases").select("*").eq("id", caseId).eq("project_id", projectId).maybeSingle();
  if (error || !caseRow) return null; // inexistente OU de outro projeto (RLS): nunca vaza existência
  const warranty = mapWarrantyCaseRow(caseRow as Row);

  const byCase = (table: string, order = "created_at") =>
    supabase.from(table).select("*").eq("project_id", projectId).eq("warranty_case_id", caseId).order(order, { ascending: true });

  const [maint, surveys, repairs, evidence, verifs, acceptances, events, complaints, conseq, costs, transitions, maintStatus, readiness, ncr] = await Promise.all([
    byCase("quality_warranty_maintenance"),
    byCase("quality_warranty_surveys", "surveyed_at"),
    byCase("quality_warranty_repairs"),
    byCase("quality_evidence"),
    byCase("quality_effectiveness_verifications"),
    supabase.from("quality_warranty_acceptances").select("*").eq("project_id", projectId).eq("warranty_case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("quality_state_events").select("*").eq("project_id", projectId).eq("entity_type", "WARRANTY").eq("entity_id", caseId).order("seq", { ascending: true }),
    byCase("quality_customer_complaints", "received_at"),
    byCase("quality_consequences"),
    byCase("quality_nonquality_costs"),
    supabase.from("quality_state_transitions").select("to_state,min_role,requires_justification,requires_evidence").eq("entity_type", "WARRANTY").eq("from_state", warranty.state),
    supabase.rpc("quality_warranty_maintenance_status", { p_case_id: caseId }),
    supabase.rpc("quality_closure_readiness", { p_entity_type: "WARRANTY", p_id: caseId }),
    warranty.ncrId ? supabase.from("quality_ncrs").select("id,code,state").eq("id", warranty.ncrId).eq("project_id", projectId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const rows = (r: { data: unknown }) => ((r.data ?? []) as Row[]);
  const transitionRules: TransitionRuleView[] = rows(transitions).map((t) => ({
    toState: String(t.to_state),
    minRole: t.min_role === "MANAGE" ? "MANAGE" : "REGISTER",
    requiresJustification: t.requires_justification === true,
    requiresEvidence: t.requires_evidence === true,
  }));

  const blockersEntries = await Promise.all(
    transitionRules.map(async (t) => {
      const res = await supabase.rpc("quality_transition_blockers", { p_entity_type: "WARRANTY", p_id: caseId, p_to: t.toState });
      return [t.toState, Array.isArray(res.data) ? (res.data as unknown[]).map(String) : []] as const;
    }),
  );

  const ms = maintStatus.data as Row | null;
  const rd = readiness.data as Row | null;
  const ncrRow = ncr.data as Row | null;

  return {
    warranty,
    maintenance: rows(maint).map(mapMaintenanceRow),
    maintenanceStatus: ms
      ? { records: Number(ms.records ?? 0), withoutProof: Number(ms.withoutProof ?? 0), status: (ms.status as MaintenanceStatusView["status"]) ?? "SEM_REGISTRO" }
      : null,
    surveys: rows(surveys).map(mapSurveyRow),
    repairs: rows(repairs).map(mapRepairRow),
    evidence: rows(evidence).map(mapEvidenceViewRow),
    verifications: rows(verifs).map(mapVerificationViewRow),
    acceptances: rows(acceptances).map(mapAcceptanceRow),
    events: rows(events).map(mapStateEventRow),
    complaints: rows(complaints).map(mapComplaintRow),
    consequences: rows(conseq).map(mapConsequenceRow),
    costs: rows(costs).map(mapNonQualityCostRow),
    linkedNcr: ncrRow ? { id: String(ncrRow.id), code: String(ncrRow.code), state: String(ncrRow.state) } : null,
    transitions: transitionRules,
    blockersByTarget: Object.fromEntries(blockersEntries),
    readiness: rd ? { ready: rd.ready === true, blockers: Array.isArray(rd.blockers) ? (rd.blockers as unknown[]).map(String) : [] } : null,
  };
}
