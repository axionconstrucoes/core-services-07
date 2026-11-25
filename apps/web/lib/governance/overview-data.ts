// FASE 6 / H2a — leitura (SOMENTE LEITURA, pelo cliente de sessão: a RLS decide o que cada pessoa vê) dos dados das telas de competências e
// de aprovação de comunicação externa. Sem "server-only" para ser testável com um cliente falso. Falha de leitura/tabela inexistente
// (migration ainda não aplicada) vira `unavailable` — a tela diz "SEM DADOS" e nunca inventa valores.
import type { CompetenceRowLike } from "./competence-ui";

import type { createSupabaseServerClient } from "@axion/db/server";

type Row = Record<string, unknown>;
export type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface CompetenceRow extends CompetenceRowLike {
  id: string;
  project_id: string;
  user_id: string;
  competence: string;
  granted_by: string;
  granted_at: string;
  row_version: number;
  evidence_document_id: string | null;
  registration_kind: string | null;
  revalidated_at: string | null;
  revoked_at: string | null;
}
export interface RequestRow {
  id: string; project_id: string; target_user_id: string; competence: string; requested_by: string; requested_at: string; expires_at: string;
  valid_until: string | null; registration_kind: string | null; evidence_document_id: string; basis_note: string | null; status: string;
  validator_user_id: string | null; validator_kind: string | null; validated_at: string | null; validation_note: string | null; row_version: number;
}
export interface ValidatorRow {
  id: string; project_id: string; user_id: string; designated_by: string; designated_at: string; designation_document_id: string; reason: string;
  valid_from: string; valid_until: string; status: string; accepted_at: string | null; revoked_at: string | null; revoke_reason: string | null;
}
export interface GovEventRow { id: string; action: string; actor_user_id: string; actor_role: string; created_at: string; detail: Row }
export interface MemberRow { user_id: string; permission: string; status: string }
export interface DocRow { id: string; title: string | null; kind: string | null }

export interface CompetencesOverview {
  unavailable: boolean;
  reason: string | null;
  competences: CompetenceRow[];
  requests: RequestRow[];
  validators: ValidatorRow[];
  events: GovEventRow[];
  members: MemberRow[];
  documents: DocRow[];
  names: Record<string, string>;
  isDesignatedValidator: boolean;
}

async function sel(client: SupabaseLike, table: string, cols: string, projectId: string, order?: string, limit = 200): Promise<{ rows: Row[]; error: string | null }> {
  try {
    const base = client.from(table).select(cols).eq("project_id", projectId);
    const res = await (order ? base.order(order, { ascending: false }) : base).limit(limit);
    if (res.error) return { rows: [], error: res.error.message ?? "erro" };
    return { rows: Array.isArray(res.data) ? (res.data as unknown as Row[]) : [], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "exceção" };
  }
}

export async function loadNames(client: SupabaseLike, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return out;
  try {
    const { data } = await client.from("profiles").select("id,name").in("id", uniq);
    for (const p of (Array.isArray(data) ? data : []) as Array<{ id: string; name: string | null }>) if (p.name) out[p.id] = p.name;
  } catch {
    /* sem nomes: a tela mostra o id abreviado */
  }
  return out;
}

export async function loadCompetencesOverview(client: SupabaseLike, projectId: string): Promise<CompetencesOverview> {
  const [comp, req, val, ev, mem, docs] = await Promise.all([
    sel(client, "project_competences", "id,project_id,user_id,competence,status,habilitation_status,revalidation_status,valid_from,valid_until,granted_by,granted_at,row_version,evidence_document_id,registration_kind,revalidated_at,revoked_at", projectId, "granted_at"),
    sel(client, "project_competence_requests", "id,project_id,target_user_id,competence,requested_by,requested_at,expires_at,valid_until,registration_kind,evidence_document_id,basis_note,status,validator_user_id,validator_kind,validated_at,validation_note,row_version", projectId, "requested_at"),
    sel(client, "project_competence_validators", "id,project_id,user_id,designated_by,designated_at,designation_document_id,reason,valid_from,valid_until,status,accepted_at,revoked_at,revoke_reason", projectId, "designated_at"),
    sel(client, "project_competence_governance_events", "id,action,actor_user_id,actor_role,created_at,detail", projectId, "created_at", 40),
    sel(client, "project_memberships", "user_id,permission,status", projectId),
    sel(client, "documents", "id,title,kind", projectId, "created_at", 300),
  ]);
  // contrato ausente: as tabelas de H2a/E não existem (migrations não aplicadas) ou o acesso foi negado => "SEM DADOS"
  const missing = [comp, req, val].find((r) => r.error && /does not exist|schema cache|relation|column|permission denied/i.test(r.error));
  let isDesignated = false;
  try {
    const r = await client.rpc("acc_am_designated_competence_validator", { p_project_id: projectId });
    isDesignated = !r.error && r.data === true;
  } catch {
    isDesignated = false;
  }
  const competences = comp.rows as unknown as CompetenceRow[];
  const requests = req.rows as unknown as RequestRow[];
  const validators = val.rows as unknown as ValidatorRow[];
  const events = ev.rows as unknown as GovEventRow[];
  const members = mem.rows as unknown as MemberRow[];
  const names = await loadNames(client, [
    ...competences.flatMap((c) => [c.user_id, c.granted_by]),
    ...requests.flatMap((r) => [r.target_user_id, r.requested_by, r.validator_user_id ?? ""]),
    ...validators.flatMap((v) => [v.user_id, v.designated_by]),
    ...events.map((e) => e.actor_user_id),
    ...members.map((m) => m.user_id),
  ]);
  return {
    unavailable: Boolean(missing),
    reason: missing?.error ?? null,
    competences, requests, validators, events, members,
    documents: docs.rows as unknown as DocRow[],
    names,
    isDesignatedValidator: isDesignated,
  };
}

export interface PreparationRow {
  id: string; project_id: string; context: string; action_kind: string; recipients: string[]; external_recipients: string[]; content_hash: string;
  content_version: string; prepared_by: string; prepared_at: string; status: string; required_tier: string; decided_by: string | null;
  decided_at: string | null; decision_note: string | null; consumed_at: string | null; entity_type: string | null;
}
export interface ContentRow { preparation_id: string; subject: string; body: string; attachments: string[] }

export interface ApprovalsOverview {
  unavailable: boolean;
  reason: string | null;
  preparations: PreparationRow[];
  contents: Record<string, ContentRow>;
  names: Record<string, string>;
}

export async function loadApprovalsOverview(client: SupabaseLike, projectId: string): Promise<ApprovalsOverview> {
  const [prep, cont] = await Promise.all([
    sel(client, "external_send_preparations", "id,project_id,context,action_kind,recipients,external_recipients,content_hash,content_version,prepared_by,prepared_at,status,required_tier,decided_by,decided_at,decision_note,consumed_at,entity_type", projectId, "prepared_at", 100),
    sel(client, "external_send_preparation_contents", "preparation_id,subject,body,attachments", projectId, "created_at", 100),
  ]);
  const preparations = prep.rows as unknown as PreparationRow[];
  const contents: Record<string, ContentRow> = {};
  for (const c of cont.rows as unknown as ContentRow[]) contents[c.preparation_id] = c;
  const names = await loadNames(client, preparations.flatMap((p) => [p.prepared_by, p.decided_by ?? ""]));
  const bad = prep.error ?? null;
  return { unavailable: Boolean(bad && /does not exist|schema cache|relation|permission denied/i.test(bad)), reason: bad, preparations, contents, names };
}

export function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}…` : "—";
}
export function displayName(names: Record<string, string>, id: string | null | undefined): string {
  if (!id) return "—";
  return names[id] ?? `usuário ${shortId(id)}`;
}
