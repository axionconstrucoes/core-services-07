// Leitura do módulo Qualidade (fase 2). Só SELECT/RPC de leitura sob RLS, SEMPRE filtrado por project_id (isolamento entre projetos:
// além da RLS do banco, nenhuma consulta é feita sem o escopo do projeto). Recebe o cliente Supabase do usuário (nunca com credencial administrativa).

import { allowedTransitions } from "./state-machine";
import { buildTransitionOptions, type TransitionOption } from "./ui-model";
import type { QualityRole } from "./types";

type Row = Record<string, unknown>;
interface QueryResult { data: unknown; error: { message: string; code?: string } | null }
// Estrutura mínima do cliente Supabase usada aqui (permite testar com um cliente simulado).
export interface QualityDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<QueryResult>;
}

export const LIST_LIMIT = 200;

function rows(res: QueryResult, what: string): Row[] {
  if (res.error) throw new Error(`Falha ao carregar ${what}: ${res.error.message}`);
  return (res.data as Row[] | null) ?? [];
}

export interface NcrFilters {
  state?: string;
  criticality?: string;
  origin?: string;
  q?: string;
}

const NCR_COLS =
  "id, project_id, code, title, state, origin_type, origin_ref, origin_url, criticality, reopen_count, row_version, due_date, created_at, closed_at, duplicate_of_id";

export async function loadOverview(db: QualityDb, projectId: string) {
  const [ncrs, actions, verifs] = await Promise.all([
    db.from("quality_ncrs").select("state, criticality, reopen_count, created_at, closed_at").eq("project_id", projectId),
    db.from("quality_corrective_actions").select("status, due_date, ncr_id").eq("project_id", projectId),
    db.from("quality_effectiveness_verifications").select("result, ncr_id, created_at").eq("project_id", projectId),
  ]);
  return {
    ncrs: rows(ncrs, "RNC"),
    actions: rows(actions, "ações"),
    verifications: rows(verifs, "verificações"),
  };
}

export async function loadNcrList(db: QualityDb, projectId: string, f: NcrFilters) {
  let q = db.from("quality_ncrs").select(NCR_COLS).eq("project_id", projectId);
  if (f.state) q = q.eq("state", f.state);
  if (f.criticality) q = q.eq("criticality", f.criticality);
  if (f.origin) q = q.eq("origin_type", f.origin);
  const term = f.q?.trim().replace(/[%,()]/g, " ").slice(0, 80);
  if (term) q = q.or(`title.ilike.%${term}%,code.ilike.%${term}%,origin_ref.ilike.%${term}%`);
  const res = await q.order("created_at", { ascending: false }).limit(LIST_LIMIT);
  return rows(res, "RNC");
}

export async function loadRequirements(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_requirements").select("id, code, title, description, source_ref, source_url, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "requisitos");
}
export async function loadInspections(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_inspections").select("id, code, title, inspection_type, location, planned_at, performed_at, result, ncr_id, requirement_id, source_ref, notes").eq("project_id", projectId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "inspeções");
}
export async function loadComplaints(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_customer_complaints").select("id, code, channel, received_at, complainant, subject, description, source_ref, source_url, status, ncr_id, warranty_case_id").eq("project_id", projectId).order("received_at", { ascending: false }).limit(LIST_LIMIT), "reclamações");
}
export async function loadTests(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_tests").select("id, code, test_type, laboratory, sample_ref, performed_at, result, ncr_id, requirement_id, report_ref, report_url, notes").eq("project_id", projectId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "ensaios");
}
export async function loadEvidenceList(db: QualityDb, projectId: string, f: { classification?: string; source?: string }) {
  let q = db.from("quality_evidence").select("id, ncr_id, complaint_id, inspection_id, test_id, warranty_case_id, source_type, source_ref, source_url, description, classification, epistemic, captured_at, created_at").eq("project_id", projectId);
  if (f.classification) q = q.eq("classification", f.classification);
  if (f.source) q = q.eq("source_type", f.source);
  return rows(await q.order("created_at", { ascending: false }).limit(LIST_LIMIT), "evidências");
}
export async function loadActions(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_corrective_actions").select("id, ncr_id, warranty_case_id, kind, description, due_date, status, executed_at, row_version, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "ações");
}
export async function loadVerifications(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_effectiveness_verifications").select("id, ncr_id, warranty_case_id, result, criteria, notes, evidence_id, verified_at, event_seq_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "verificações");
}
export async function loadRecurrences(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_recurrences").select("id, ncr_id, warranty_case_id, related_ncr_id, related_warranty_case_id, basis, detected_at").eq("project_id", projectId).order("detected_at", { ascending: false }).limit(LIST_LIMIT), "recorrências");
}
export async function loadCosts(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_nonquality_costs").select("id, ncr_id, warranty_case_id, category, description, estimated_amount, actual_amount, currency, source_ref, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "custos");
}
/** Linhas de auditoria do módulo (entity_type QUALITY_* ou tabelas quality_*). */
export async function loadAuditLog(db: QualityDb, projectId: string) {
  return rows(await db.from("audit_log_entries").select("id, occurred_at, actor_type, actor_user_id, action, entity_type, entity_id, detail").eq("project_id", projectId).like("action", "QUALITY_%").order("occurred_at", { ascending: false }).limit(LIST_LIMIT), "auditoria");
}
export async function loadStateEvents(db: QualityDb, projectId: string) {
  return rows(await db.from("quality_state_events").select("seq, entity_type, entity_id, from_state, to_state, actor_user_id, justification, evidence_ids, occurred_at").eq("project_id", projectId).order("seq", { ascending: false }).limit(LIST_LIMIT), "eventos de estado");
}
/** Códigos curtos das RNC do projeto (para exibir o vínculo "RNC-0001" em listas de outras abas). */
export async function loadNcrCodes(db: QualityDb, projectId: string): Promise<Record<string, string>> {
  const list = rows(await db.from("quality_ncrs").select("id, code").eq("project_id", projectId).limit(1000), "RNC");
  return Object.fromEntries(list.map((r) => [String(r.id), String(r.code)]));
}

export interface NcrDetail {
  ncr: Row;
  evidence: Row[];
  actions: Row[];
  verifications: Row[];
  consequences: Row[];
  costs: Row[];
  events: Row[];
  audits: Row[];
  complaints: Row[];
  inspections: Row[];
  tests: Row[];
  recurrences: Row[];
  otherNcrs: Row[];
  requirements: Row[];
  options: TransitionOption[];
  closureReady: { ready: boolean; blockers: string[] } | null;
}

/** Carrega a RNC completa. Devolve null quando a RNC não existe NESTE projeto (RNC de outro projeto = inexistente). */
export async function loadNcrDetail(db: QualityDb, projectId: string, ncrId: string, role: QualityRole | null): Promise<NcrDetail | null> {
  const head = await db.from("quality_ncrs").select(`${NCR_COLS}, description, root_cause, state_justification, requirement_id, responsible_user_id`).eq("project_id", projectId).eq("id", ncrId).maybeSingle();
  if (head.error) throw new Error(`Falha ao carregar RNC: ${head.error.message}`);
  const ncr = head.data as Row | null;
  if (!ncr) return null;

  const byNcr = (table: string, cols: string, order = "created_at") =>
    db.from(table).select(cols).eq("project_id", projectId).eq("ncr_id", ncrId).order(order, { ascending: false });
  const [evidence, actions, verifications, consequences, costs, events, complaints, inspections, tests, recurrences, otherNcrs, requirements] = await Promise.all([
    byNcr("quality_evidence", "id, source_type, source_table, source_ref, source_url, description, classification, epistemic, captured_at, created_at, row_version"),
    byNcr("quality_corrective_actions", "id, kind, description, due_date, status, executed_at, row_version, created_at"),
    byNcr("quality_effectiveness_verifications", "id, result, criteria, notes, evidence_id, verified_at, event_seq_at, created_at"),
    byNcr("quality_consequences", "id, pillar, severity, probability, probability_basis, description, source_type, source_ref, measures, status, created_at"),
    byNcr("quality_nonquality_costs", "id, category, description, estimated_amount, actual_amount, currency, source_ref, created_at"),
    db.from("quality_state_events").select("seq, from_state, to_state, actor_user_id, justification, evidence_ids, row_version_after, occurred_at").eq("project_id", projectId).eq("entity_type", "NCR").eq("entity_id", ncrId).order("seq", { ascending: false }),
    byNcr("quality_customer_complaints", "id, code, channel, subject, status, received_at, source_ref"),
    byNcr("quality_inspections", "id, code, title, result, performed_at, source_ref"),
    byNcr("quality_tests", "id, code, test_type, result, report_ref, report_url, performed_at"),
    db.from("quality_recurrences").select("id, ncr_id, related_ncr_id, basis, detected_at").eq("project_id", projectId).or(`ncr_id.eq.${ncrId},related_ncr_id.eq.${ncrId}`),
    db.from("quality_ncrs").select("id, code, title, state").eq("project_id", projectId).neq("id", ncrId).order("created_at", { ascending: false }).limit(300),
    db.from("quality_requirements").select("id, code, title").eq("project_id", projectId).order("code"),
  ]);
  // Auditoria da RNC e de seus registros-filhos (evidências, ações, verificações, consequências, custos): entity_id em lista fechada.
  const childIds = [ncrId, ...[evidence, actions, verifications, consequences, costs].flatMap((r) => rows(r, "registros").map((x) => String(x.id)))].slice(0, 400);
  const audits = await db.from("audit_log_entries").select("id, occurred_at, actor_type, actor_user_id, action, entity_type, entity_id, detail").eq("project_id", projectId).in("entity_id", childIds).like("action", "QUALITY_%").order("occurred_at", { ascending: false }).limit(200);

  const state = String(ncr.state);
  // Bloqueios: autoridade do banco (quality_transition_blockers). Falha da RPC => bloqueia por segurança (nunca libera por omissão).
  const blockersByTarget: Record<string, string[]> = {};
  await Promise.all(
    allowedTransitions("NCR", state).map(async (rule) => {
      const res = await db.rpc("quality_transition_blockers", { p_entity_type: "NCR", p_id: ncrId, p_to: rule.to });
      blockersByTarget[rule.to] = res.error ? ["BLOCKERS_UNAVAILABLE"] : (((res.data as string[] | null) ?? []) as string[]);
    }),
  );
  const readiness = await db.rpc("quality_closure_readiness", { p_entity_type: "NCR", p_id: ncrId });
  const rd = readiness.error ? null : (readiness.data as { ready: boolean; blockers: string[] } | null);

  return {
    ncr,
    evidence: rows(evidence, "evidências"),
    actions: rows(actions, "ações"),
    verifications: rows(verifications, "verificações"),
    consequences: rows(consequences, "consequências"),
    costs: rows(costs, "custos"),
    events: rows(events, "eventos"),
    audits: rows(audits, "auditoria"),
    complaints: rows(complaints, "reclamações"),
    inspections: rows(inspections, "inspeções"),
    tests: rows(tests, "ensaios"),
    recurrences: rows(recurrences, "recorrências"),
    otherNcrs: rows(otherNcrs, "RNC"),
    requirements: rows(requirements, "requisitos"),
    options: buildTransitionOptions("NCR", state, role, blockersByTarget),
    closureReady: rd,
  };
}
