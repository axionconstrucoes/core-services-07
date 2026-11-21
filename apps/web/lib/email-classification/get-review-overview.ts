import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

import type { ReviewDelegation } from "./review";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface ReviewSignalRow {
  id: string;
  email_id: string;
  classification_id: string;
  pillar: string | null;
  functional_area: string | null;
  signal_kind: string;
  summary: string;
  evidence_excerpt: string;
  evidence_ref: string;
  is_indication: boolean;
  confirmed: boolean;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  quantified_impact: unknown;
  created_at: string;
}
export interface ReviewClassificationRow {
  id: string;
  project_link_status: string;
  status: string;
  officiality: string;
  party_kind: string;
  organization_id: string | null;
  authority_check: string;
  clause_ref: string | null;
  injection_flag: boolean;
}
export interface ReviewEmailRow { id: string; subject: string | null; from_address: string | null; sent_at: string | null }
export interface ReviewAuditRow { id: string; at: string; action: string; via: string | null; signal_id: string | null; note: string | null }
export interface MemberRow { user_id: string; permission: string; name: string | null }
export interface DelegationRow extends ReviewDelegation { granted_at: string; reason: string }

export interface ReviewOverview {
  signals: ReviewSignalRow[];
  classifications: Map<string, ReviewClassificationRow>;
  emails: Map<string, ReviewEmailRow>;
  /** organization_id -> vínculo ATIVO e vigente neste projeto. */
  orgLinkValid: Map<string, boolean>;
  orgNames: Map<string, string>;
  myDelegations: ReviewDelegation[];
  allDelegations: DelegationRow[];
  members: MemberRow[];
  audit: ReviewAuditRow[];
  /** true quando a migration 20261209100000 ainda não está aplicada (colunas/tabelas ausentes): a tela explica, nunca inventa dado. */
  unavailable: boolean;
}

const LIMIT = 300;

// Somente leitura, pelo cliente de SESSÃO (RLS por membership). Qualquer falha => `unavailable` (fail-closed, SEM DADOS).
export async function getReviewOverview(supabase: Supabase, projectId: string, userId: string, canManage: boolean): Promise<ReviewOverview> {
  const empty: ReviewOverview = {
    signals: [], classifications: new Map(), emails: new Map(), orgLinkValid: new Map(), orgNames: new Map(),
    myDelegations: [], allDelegations: [], members: [], audit: [], unavailable: true,
  };
  const sig = await supabase
    .from("email_risk_signals")
    .select("id,email_id,classification_id,pillar,functional_area,signal_kind,summary,evidence_excerpt,evidence_ref,is_indication,confirmed,review_status,reviewed_by,reviewed_at,review_note,quantified_impact,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (sig.error) return empty;
  const signals = (sig.data ?? []) as ReviewSignalRow[];
  const clsIds = [...new Set(signals.map((s) => s.classification_id))];
  const emailIds = [...new Set(signals.map((s) => s.email_id))];

  const [cls, emails, links, dele, audit, members] = await Promise.all([
    clsIds.length ? supabase.from("email_message_classifications").select("id,project_link_status,status,officiality,party_kind,organization_id,authority_check,clause_ref,injection_flag").in("id", clsIds) : Promise.resolve({ data: [], error: null }),
    emailIds.length ? supabase.from("emails").select("id,subject,from_address,sent_at").in("id", emailIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("external_org_project_links").select("organization_id,status,valid_from,valid_until").eq("project_id", projectId),
    supabase.from("email_signal_review_delegations").select("id,user_id,scope,valid_from,valid_until,revoked_at,granted_at,reason").eq("project_id", projectId).order("granted_at", { ascending: false }).limit(100),
    canManage ? supabase.from("email_signal_review_audit").select("id,at,action,via,signal_id,note").eq("project_id", projectId).order("at", { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
    canManage ? supabase.from("project_memberships").select("user_id,permission").eq("project_id", projectId).eq("status", "ACTIVE") : Promise.resolve({ data: [], error: null }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const orgLinkValid = new Map<string, boolean>();
  for (const l of ((links.data ?? []) as Array<{ organization_id: string; status: string; valid_from: string; valid_until: string | null }>)) {
    const valid = l.status === "ACTIVE" && l.valid_from <= today && (!l.valid_until || l.valid_until >= today);
    orgLinkValid.set(l.organization_id, (orgLinkValid.get(l.organization_id) ?? false) || valid);
  }
  const orgIds = [...new Set(((cls.data ?? []) as ReviewClassificationRow[]).map((c) => c.organization_id).filter((x): x is string => Boolean(x)))];
  const orgs = orgIds.length ? await supabase.from("external_organizations").select("id,legal_name").in("id", orgIds) : { data: [] as Array<{ id: string; legal_name: string }> };
  const memberRows = ((members.data ?? []) as Array<{ user_id: string; permission: string }>);
  const profiles = memberRows.length ? await supabase.from("profiles").select("id,name").in("id", memberRows.map((m) => m.user_id)) : { data: [] as Array<{ id: string; name: string | null }> };
  const nameById = new Map(((profiles.data ?? []) as Array<{ id: string; name: string | null }>).map((x) => [x.id, x.name]));
  const allDelegations = ((dele.error ? [] : dele.data ?? []) as DelegationRow[]);

  return {
    signals,
    classifications: new Map(((cls.data ?? []) as ReviewClassificationRow[]).map((c) => [c.id, c])),
    emails: new Map(((emails.data ?? []) as ReviewEmailRow[]).map((e) => [e.id, e])),
    orgLinkValid,
    orgNames: new Map(((orgs.data ?? []) as Array<{ id: string; legal_name: string }>).map((o) => [o.id, o.legal_name])),
    myDelegations: allDelegations.filter((d) => d.user_id === userId),
    allDelegations: canManage ? allDelegations : [],
    members: memberRows.map((m) => ({ user_id: m.user_id, permission: m.permission, name: nameById.get(m.user_id) ?? null })),
    audit: ((audit.data ?? []) as ReviewAuditRow[]),
    unavailable: false,
  };
}
