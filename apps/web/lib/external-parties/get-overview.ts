import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";
import {
  buildOrgActivity, multiLinkOrgs, sharedDomains, summarizeCoverage,
  type ActivityResult, type Coverage, type EmailRow, type RiskSignalRow, type SyncRunRow,
} from "./overview";
import type { ExternalOrgChangeRequest } from "./change-requests";
import type {
  ExternalContact, ExternalContactCandidate, ExternalOrgDomain, ExternalOrgProjectLink, ExternalOrganization,
} from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface AuditRow { id: string; at: string; actor_id: string | null; action: string; entity_type: string; reason: string | null }

export interface ExternalPartiesOverview {
  organizations: ExternalOrganization[];
  domains: ExternalOrgDomain[];
  contacts: ExternalContact[];
  links: ExternalOrgProjectLink[];
  candidates: ExternalContactCandidate[];
  audit: AuditRow[];
  /** Solicitações de alteração de dados globais (Fase 6/H2b); vazio quando a migration 20261209101000 ainda não foi aplicada. */
  changeRequests: ExternalOrgChangeRequest[];
  activity: ActivityResult;
  coverage: Coverage;
  multiLink: Set<string>;
  shared: Set<string>;
  /** Estado de leitura das tabelas de outras frentes (SEM DADOS quando ausentes). */
  riskSignalsAvailable: boolean;
  emailsSampled: number;
  /** Erro de leitura das tabelas desta frente (migration não aplicada): a tela mostra aviso, nunca dados inventados. */
  contractMissing: boolean;
}

const EMAIL_SAMPLE = 3000;

// Somente leitura, pelo cliente de SESSÃO (RLS por membership). Falha de uma tabela de outra frente => SEM DADOS naquele bloco.
export async function getExternalPartiesOverview(supabase: Supabase, projectId: string): Promise<ExternalPartiesOverview> {
  const links = await supabase.from("external_org_project_links").select("*").eq("project_id", projectId).order("valid_from", { ascending: false });
  const empty = {
    organizations: [], domains: [], contacts: [], links: [], candidates: [], audit: [], changeRequests: [],
    activity: { byOrg: new Map(), ambiguousMessages: 0, unattributedMessages: 0 },
    coverage: summarizeCoverage(null), multiLink: new Set<string>(), shared: new Set<string>(),
    riskSignalsAvailable: false, emailsSampled: 0, contractMissing: true,
  } satisfies ExternalPartiesOverview;
  if (links.error) return empty; // tabela ausente ou sem acesso: fail-closed, a tela explica
  const linkRows = (links.data ?? []) as ExternalOrgProjectLink[];

  const [orgs, domains, contacts, candidates, audit, emails, signals, runs, changes] = await Promise.all([
    // (changes é a última consulta da lista)
    supabase.from("external_organizations").select("*").order("legal_name"),
    supabase.from("external_org_domains").select("*"),
    supabase.from("external_contacts").select("*").order("email"),
    supabase.from("external_contact_candidates").select("*").eq("project_id", projectId).order("last_seen_at", { ascending: false }).limit(200),
    supabase.from("external_contacts_audit").select("id,at,actor_id,action,entity_type,reason").eq("project_id", projectId).order("at", { ascending: false }).limit(30),
    supabase.from("emails").select("id,from_address,to_address,sent_at").eq("project_id", projectId).order("sent_at", { ascending: false }).limit(EMAIL_SAMPLE),
    supabase.from("email_risk_signals").select("email_id,pillar,alert_case_id,is_indication").eq("project_id", projectId).limit(5000),
    supabase.from("email_sync_reconciliation_runs").select("id,provider,mailbox,period_start,period_end,universe_count,eligible_count,processed_count,excluded_count,failed_count,status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
    supabase.from("external_org_change_requests").select("*").eq("project_id", projectId).order("requested_at", { ascending: false }).limit(50),
  ]);

  const orgRows = ((orgs.data ?? []) as ExternalOrganization[]);
  const linkedIds = new Set(linkRows.map((l) => l.organization_id));
  const projectOrgs = orgRows.filter((o) => linkedIds.has(o.id));
  const domainRows = (domains.data ?? []) as ExternalOrgDomain[];
  const contactRows = (contacts.data ?? []) as ExternalContact[];
  const signalsRows: RiskSignalRow[] | null = signals.error ? null : ((signals.data ?? []) as RiskSignalRow[]);
  const emailRows = (emails.data ?? []) as EmailRow[];

  return {
    organizations: projectOrgs,
    domains: domainRows,
    contacts: contactRows,
    links: linkRows,
    candidates: (candidates.data ?? []) as ExternalContactCandidate[],
    audit: (audit.data ?? []) as AuditRow[],
    changeRequests: changes.error ? [] : ((changes.data ?? []) as ExternalOrgChangeRequest[]),
    activity: buildOrgActivity({ orgs: projectOrgs, links: linkRows, domains: domainRows, contacts: contactRows, emails: emailRows, signals: signalsRows }),
    coverage: summarizeCoverage(runs.error ? null : ((runs.data ?? []) as SyncRunRow[])),
    multiLink: multiLinkOrgs(linkRows),
    shared: sharedDomains(domainRows),
    riskSignalsAvailable: signalsRows !== null,
    emailsSampled: emailRows.length,
    contractMissing: false,
  };
}
