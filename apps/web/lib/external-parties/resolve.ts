import { validateRecipientEmail } from "../email/recipient-validation";
import { UNKNOWN_PARTY, type ExternalPartyMatch, type ExternalPartyResolution, type OrgKind } from "./types";

// Resolução de parte externa. Espelho TS da RPC public.acc_resolve_external_party (paridade testada em
// scripts/test-f5-c-contatos.mjs e scripts/test-f5-c-contatos-realpg.mjs). Fail-closed: sem vínculo ativo => known=false.

export interface ResolveLinkRow {
  organization_id: string;
  org_kind: OrgKind;
  role_in_project: OrgKind;
  status: "ACTIVE" | "CANDIDATE" | "ENDED";
  delegation_scope: string[];
  valid_from: string; // YYYY-MM-DD
  valid_until: string | null;
}
export interface ResolveDomainRow { organization_id: string; domain: string; active: boolean }
export interface ResolveContactRow { organization_id: string; email: string; status: "CONFIRMED" | "CANDIDATE" | "REJECTED" }
export interface ResolveRows {
  /** Vínculos DO PROJETO consultado. */
  links: readonly ResolveLinkRow[];
  /** Domínios do tenant (todas as organizações): necessário para detectar domínio compartilhado. */
  domains: readonly ResolveDomainRow[];
  contacts: readonly ResolveContactRow[];
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function resolveFromRows(rows: ResolveRows, rawEmail: unknown, now: Date = new Date()): ExternalPartyResolution {
  const v = validateRecipientEmail(rawEmail);
  if (!v.ok) return UNKNOWN_PARTY;
  const email = v.email;
  const domain = v.domain;
  const today = todayIso(now);

  const domainOrgs = new Set(rows.domains.filter((d) => d.active && d.domain === domain).map((d) => d.organization_id));
  const shared = domainOrgs.size > 1;

  const matches: ExternalPartyMatch[] = [];
  const exactOrgs = new Set<string>();
  for (const l of rows.links) {
    if (l.status === "ENDED") continue;
    const mine = rows.contacts.filter((c) => c.organization_id === l.organization_id && c.email === email);
    if (mine.some((c) => c.status === "REJECTED")) continue;
    const exact = mine.some((c) => c.status === "CONFIRMED");
    if (!exact && !domainOrgs.has(l.organization_id)) continue;
    if (exact) exactOrgs.add(l.organization_id);
    matches.push({
      organization_id: l.organization_id,
      org_kind: l.org_kind,
      link_status: l.status,
      role_in_project: l.role_in_project,
      delegation_scope: [...l.delegation_scope],
      valid_now: l.status === "ACTIVE" && l.valid_from <= today && (l.valid_until === null || l.valid_until >= today),
    });
  }
  matches.sort((a, b) => (a.organization_id + a.role_in_project).localeCompare(b.organization_id + b.role_in_project));
  const distinct = new Set(matches.map((m) => m.organization_id)).size;
  return {
    matches,
    ambiguous: distinct > 1 || (shared && distinct >= 1 && exactOrgs.size === 0),
    domain_shared: shared,
    known: matches.some((m) => m.link_status === "ACTIVE"),
  };
}

/** Cliente mínimo do Supabase para a RPC (evita acoplamento de servidor neste módulo). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Chama a RPC. Qualquer erro/forma inesperada => UNKNOWN_PARTY (fail-closed). */
export async function resolveExternalParty(client: RpcClient, projectId: string, email: string): Promise<ExternalPartyResolution> {
  try {
    const { data, error } = await client.rpc("acc_resolve_external_party", { p_project_id: projectId, p_email: email });
    if (error || !data || typeof data !== "object") return UNKNOWN_PARTY;
    const d = data as Partial<ExternalPartyResolution>;
    if (!Array.isArray(d.matches) || typeof d.ambiguous !== "boolean" || typeof d.known !== "boolean") return UNKNOWN_PARTY;
    return {
      matches: d.matches as ExternalPartyMatch[],
      ambiguous: d.ambiguous,
      domain_shared: d.domain_shared === true,
      known: d.known,
    };
  } catch {
    return UNKNOWN_PARTY;
  }
}

/** Autoridade só existe com vínculo ACTIVE, vigente, não ambíguo e escopo explicitamente delegado. Oficialidade != autoridade. */
export function hasDelegatedScope(r: ExternalPartyResolution, scope: string): boolean {
  if (!r.known || r.ambiguous) return false;
  return r.matches.some((m) => m.valid_now && m.delegation_scope.includes(scope));
}
