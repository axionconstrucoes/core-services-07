// Contrato de organizações e contatos externos (Fase 5 / Frente C). Espelha as tabelas external_* e a RPC acc_resolve_external_party.
// Sem dependências de servidor: pode ser usado por A (ingestão), B (classificação), D (alertas) e pela UI.

export const ORG_KINDS = [
  "CLIENTE", "GERENCIADORA", "FORNECEDOR", "SUBCONTRATADA", "PRESTADOR", "PROJETISTA",
  "CONSULTOR", "FISCALIZACAO", "SEGURADORA", "CORRETOR", "BANCO", "OUTRO",
] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export type ContactStatus = "CONFIRMED" | "CANDIDATE" | "REJECTED";
export type LinkStatus = "ACTIVE" | "CANDIDATE" | "ENDED";
export type CandidateStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export interface ExternalOrganization {
  id: string;
  legal_name: string;
  tax_id: string | null;
  org_kind: OrgKind;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ExternalOrgDomain {
  id: string;
  organization_id: string;
  domain: string;
  active: boolean;
}

export interface ExternalContact {
  id: string;
  organization_id: string;
  email: string;
  display_name: string | null;
  status: ContactStatus;
  discovered: boolean;
  created_at: string;
}

export interface ExternalOrgProjectLink {
  id: string;
  organization_id: string;
  project_id: string;
  role_in_project: OrgKind;
  contract_ref: string | null;
  delegation_document_id: string | null;
  delegation_clause_ref: string | null;
  delegation_scope: string[];
  valid_from: string; // YYYY-MM-DD
  valid_until: string | null;
  status: LinkStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface ExternalContactCandidate {
  id: string;
  project_id: string;
  email: string;
  domain: string;
  first_seen_email_id: string | null;
  last_seen_at: string;
  message_count: number;
  suggested_org_id: string | null;
  status: CandidateStatus;
}

/** Resultado de acc_resolve_external_party (jsonb). */
export interface ExternalPartyMatch {
  organization_id: string;
  org_kind: OrgKind;
  link_status: LinkStatus;
  role_in_project: OrgKind;
  delegation_scope: string[];
  valid_now: boolean;
}

export interface ExternalPartyResolution {
  matches: ExternalPartyMatch[];
  /** Mais de uma organização casa, ou domínio compartilhado sem contato confirmado exato. NUNCA vincular projeto/autoridade. */
  ambiguous: boolean;
  /** O domínio do e-mail está ativo em mais de uma organização. */
  domain_shared: boolean;
  /** Existe vínculo ACTIVE casando. false = nunca presumir autoridade. */
  known: boolean;
}

export const UNKNOWN_PARTY: ExternalPartyResolution = Object.freeze({
  matches: [], ambiguous: false, domain_shared: false, known: false,
}) as ExternalPartyResolution;
