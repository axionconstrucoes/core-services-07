import type { ExternalContact, ExternalOrgDomain, ExternalOrgProjectLink, ExternalOrganization } from "./types";

// Cálculos PUROS da tela "Contatos externos monitorados" (sem I/O): atividade por organização a partir das mensagens já
// ingeridas (tabela emails) e dos sinais de risco de e-mail (tabela de B), e cobertura da sincronização (tabela de A).
// Regra: dado ausente => "SEM DADOS" (nunca zero inventado); domínio compartilhado/ambíguo NÃO atribui mensagem a ninguém.

export const SEM_DADOS = "SEM DADOS" as const;

/** Erro de relação inexistente (migration de outra frente ainda não aplicada neste ambiente). */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || msg.includes("does not exist") || msg.includes("could not find the table");
}

const ADDRESS_RE = /[a-z0-9._%+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}/gi;
export function extractAddresses(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set((text.match(ADDRESS_RE) ?? []).map((a) => a.toLowerCase()))];
}

export interface EmailRow { id: string; from_address: string | null; to_address: string | null; sent_at: string | null }
export interface RiskSignalRow { email_id: string; pillar: string; alert_case_id: string | null; is_indication?: boolean | null }

export interface OrgActivity {
  organization_id: string;
  messages: number;
  last_message_at: string | null;
  risk_signals: number | null; // null = SEM DADOS (tabela de sinais indisponível)
  alerts_originated: number | null;
  by_pillar: Record<string, number>;
}
export interface ActivityResult {
  byOrg: Map<string, OrgActivity>;
  ambiguousMessages: number;
  unattributedMessages: number;
}

export function buildOrgActivity(input: {
  orgs: readonly Pick<ExternalOrganization, "id">[];
  links: readonly Pick<ExternalOrgProjectLink, "organization_id" | "status">[];
  domains: readonly Pick<ExternalOrgDomain, "organization_id" | "domain" | "active">[];
  contacts: readonly Pick<ExternalContact, "organization_id" | "email" | "status">[];
  emails: readonly EmailRow[];
  signals: readonly RiskSignalRow[] | null; // null = tabela indisponível
}): ActivityResult {
  const linked = new Set(input.links.filter((l) => l.status !== "ENDED").map((l) => l.organization_id));
  const byOrg = new Map<string, OrgActivity>();
  for (const o of input.orgs) {
    byOrg.set(o.id, { organization_id: o.id, messages: 0, last_message_at: null, risk_signals: input.signals === null ? null : 0, alerts_originated: input.signals === null ? null : 0, by_pillar: {} });
  }
  const orgsOfDomain = new Map<string, Set<string>>();
  for (const d of input.domains) {
    if (!d.active || !linked.has(d.organization_id)) continue;
    (orgsOfDomain.get(d.domain) ?? orgsOfDomain.set(d.domain, new Set()).get(d.domain)!).add(d.organization_id);
  }
  const confirmed = new Map<string, Set<string>>();
  const rejected = new Set<string>();
  for (const c of input.contacts) {
    if (!linked.has(c.organization_id)) continue;
    if (c.status === "REJECTED") rejected.add(`${c.organization_id}|${c.email}`);
    if (c.status === "CONFIRMED") (confirmed.get(c.email) ?? confirmed.set(c.email, new Set()).get(c.email)!).add(c.organization_id);
  }
  const orgOfEmail = new Map<string, string>(); // email_id -> organização atribuída
  let ambiguous = 0;
  let unattributed = 0;
  for (const m of input.emails) {
    const hit = new Set<string>();
    for (const addr of [...extractAddresses(m.from_address), ...extractAddresses(m.to_address)]) {
      const exact = confirmed.get(addr);
      const cand = exact && exact.size > 0 ? exact : orgsOfDomain.get(addr.split("@")[1]);
      for (const org of cand ?? []) if (!rejected.has(`${org}|${addr}`)) hit.add(org);
    }
    if (hit.size === 0) { unattributed += 1; continue; }
    if (hit.size > 1) { ambiguous += 1; continue; }
    const org = [...hit][0];
    orgOfEmail.set(m.id, org);
    const a = byOrg.get(org);
    if (!a) continue;
    a.messages += 1;
    if (m.sent_at && (!a.last_message_at || m.sent_at > a.last_message_at)) a.last_message_at = m.sent_at;
  }
  for (const s of input.signals ?? []) {
    const org = orgOfEmail.get(s.email_id);
    const a = org ? byOrg.get(org) : undefined;
    if (!a || a.risk_signals === null) continue;
    a.risk_signals += 1;
    if (s.alert_case_id) a.alerts_originated = (a.alerts_originated ?? 0) + 1;
    a.by_pillar[s.pillar] = (a.by_pillar[s.pillar] ?? 0) + 1;
  }
  return { byOrg, ambiguousMessages: ambiguous, unattributedMessages: unattributed };
}

export interface SyncRunRow {
  id: string;
  provider: string;
  mailbox: string;
  period_start: string | null;
  period_end: string | null;
  universe_count: number | null;
  eligible_count: number | null;
  processed_count: number | null;
  excluded_count: number | null;
  failed_count: number | null;
  status: string | null;
  created_at: string;
}
export type Coverage =
  | { state: "SEM_DADOS"; reason: string }
  | { state: "OK"; runs: number; universe: number; eligible: number; processed: number; excluded: number; failed: number; processedPct: number | null; last: SyncRunRow };

/** Cobertura = última reconciliação por caixa (provider+mailbox), somada. Sem execução => SEM DADOS (não alega monitoramento). */
export function summarizeCoverage(runs: readonly SyncRunRow[] | null): Coverage {
  if (runs === null) return { state: "SEM_DADOS", reason: "A tabela de reconciliação de sincronização ainda não existe neste ambiente (migration da frente A não aplicada)." };
  if (runs.length === 0) return { state: "SEM_DADOS", reason: "Nenhuma reconciliação de sincronização registrada para este projeto. Não há comprovação de cobertura." };
  const latest = new Map<string, SyncRunRow>();
  for (const r of [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at))) latest.set(`${r.provider}|${r.mailbox}`, r);
  const list = [...latest.values()];
  const sum = (f: (r: SyncRunRow) => number | null) => list.reduce((s, r) => s + (f(r) ?? 0), 0);
  const eligible = sum((r) => r.eligible_count);
  const processed = sum((r) => r.processed_count);
  return {
    state: "OK",
    runs: list.length,
    universe: sum((r) => r.universe_count),
    eligible,
    processed,
    excluded: sum((r) => r.excluded_count),
    failed: sum((r) => r.failed_count),
    processedPct: eligible > 0 ? Math.round((processed / eligible) * 1000) / 10 : null,
    last: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
  };
}

/** Organização com mais de um vínculo no mesmo projeto (papéis/contratos distintos) — exibida como "múltiplos vínculos". */
export function multiLinkOrgs(links: readonly Pick<ExternalOrgProjectLink, "organization_id" | "status">[]): Set<string> {
  const n = new Map<string, number>();
  for (const l of links) if (l.status !== "ENDED") n.set(l.organization_id, (n.get(l.organization_id) ?? 0) + 1);
  return new Set([...n].filter(([, c]) => c > 1).map(([o]) => o));
}

/** Domínios ativos em mais de uma organização (compartilhados). */
export function sharedDomains(domains: readonly Pick<ExternalOrgDomain, "organization_id" | "domain" | "active">[]): Set<string> {
  const m = new Map<string, Set<string>>();
  for (const d of domains) if (d.active) (m.get(d.domain) ?? m.set(d.domain, new Set()).get(d.domain)!).add(d.organization_id);
  return new Set([...m].filter(([, s]) => s.size > 1).map(([d]) => d));
}
