// Carregador de dados de SEGUROS: SOMENTE SELECT (e a RPC de listagem security invoker) sob RLS, sempre filtrado por project_id.
// Recebe o cliente por parâmetro (sem importar "server-only"), o que permite testá-lo em Node com um cliente de mentira.
// Falha de uma seção NUNCA vira lista vazia silenciosa: o erro é devolvido e a tela o exibe. Linhas de outro projeto são descartadas
// (defesa em profundidade; a RLS já isola — CASO 39).
import { isModuleUnavailable } from "./errors";
import type { DocumentRef, InsuranceWorkspaceData, InsuranceWorkspaceLoad, SectionKey } from "./types";

type QueryError = { message?: string | null; code?: string | null } | null;
type QueryResult = { data: unknown; error: QueryError };
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface InsuranceClientLike {
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const TABLES: Array<{ key: SectionKey; table: string; order?: { column: string; ascending: boolean }; limit?: number }> = [
  { key: "policies", table: "insurance_policies", order: { column: "created_at", ascending: false } },
  { key: "versions", table: "insurance_policy_versions", order: { column: "created_at", ascending: false }, limit: 500 },
  { key: "parties", table: "insurance_policy_parties", order: { column: "created_at", ascending: true } },
  { key: "clauses", table: "insurance_policy_clauses", order: { column: "created_at", ascending: true } },
  { key: "bankGuarantees", table: "bank_guarantees", order: { column: "created_at", ascending: false } },
  { key: "otherGuarantees", table: "other_guarantees", order: { column: "created_at", ascending: false } },
  { key: "channels", table: "insurance_official_channels", order: { column: "created_at", ascending: false } },
  { key: "endorsements", table: "insurance_endorsements", order: { column: "requested_at", ascending: false } },
  { key: "endorsementReviews", table: "insurance_endorsement_reviews", order: { column: "reviewed_at", ascending: true }, limit: 1000 },
  { key: "advances", table: "insurance_advances", order: { column: "created_at", ascending: false } },
  { key: "amortizations", table: "insurance_advance_amortizations", order: { column: "created_at", ascending: true } },
  { key: "claims", table: "insurance_claims", order: { column: "created_at", ascending: false } },
  { key: "claimSteps", table: "insurance_claim_steps", order: { column: "occurred_at", ascending: true }, limit: 1000 },
  { key: "dossierItems", table: "insurance_dossier_items", order: { column: "updated_at", ascending: true } },
  { key: "drafts", table: "insurance_drafts", order: { column: "created_at", ascending: false } },
  { key: "instrumentTerms", table: "insurance_instrument_terms", order: { column: "created_at", ascending: true }, limit: 1000 },
  { key: "coherenceJustifications", table: "insurance_coherence_justifications", order: { column: "created_at", ascending: true }, limit: 1000 },
  { key: "guaranteeUpdates", table: "insurance_guarantee_updates", order: { column: "created_at", ascending: false }, limit: 500 },
  { key: "audit", table: "insurance_audit_events", order: { column: "occurred_at", ascending: false }, limit: 300 },
];

export function emptyWorkspace(projectId: string): InsuranceWorkspaceData {
  return {
    projectId, policies: [], versions: [], parties: [], clauses: [], bankGuarantees: [], otherGuarantees: [], channels: [], endorsements: [], endorsementReviews: [],
    advances: [], amortizations: [], claims: [], claimSteps: [], dossierItems: [], drafts: [], audit: [], settings: null, dashboardItems: [],
    instrumentTerms: [], coherenceJustifications: [], guaranteeUpdates: [], coherence: {}, rccReady: {}, advancesConsolidated: null,
    documents: [], actors: {},
  };
}

export async function loadInsuranceWorkspace(client: InsuranceClientLike, projectId: string, today: string): Promise<InsuranceWorkspaceLoad> {
  const data = emptyWorkspace(projectId);
  const errors: InsuranceWorkspaceLoad["errors"] = {};
  let unavailable = false;
  let dropped = 0;
  const bag = data as unknown as Record<string, unknown>;

  const fail = (key: SectionKey, e: QueryError) => {
    if (isModuleUnavailable(e)) unavailable = true;
    errors[key] = e?.message ? "Falha ao carregar esta seção." : "Falha ao carregar esta seção.";
  };
  const own = <T extends { project_id?: string }>(rows: T[]): T[] => {
    const kept = rows.filter((r) => r.project_id === projectId);
    dropped += rows.length - kept.length;
    return kept;
  };

  await Promise.all([
    ...TABLES.map(async (t) => {
      try {
        let q = client.from(t.table).select("*").eq("project_id", projectId);
        if (t.order) q = q.order(t.order.column, { ascending: t.order.ascending });
        if (t.limit) q = q.limit(t.limit);
        const { data: rows, error } = (await q) as QueryResult;
        if (error) return fail(t.key, error);
        bag[t.key] = own((rows ?? []) as Array<{ project_id?: string }>);
      } catch {
        fail(t.key, { message: "exceção" });
      }
    }),
    (async () => {
      try {
        const { data: row, error } = (await client.from("insurance_settings").select("*").eq("project_id", projectId).maybeSingle()) as QueryResult;
        if (error) return fail("settings", error);
        data.settings = row && (row as { project_id?: string }).project_id === projectId ? (row as InsuranceWorkspaceData["settings"]) : null;
      } catch {
        fail("settings", { message: "exceção" });
      }
    })(),
    (async () => {
      try {
        const { data: rows, error } = await client.rpc("insurance_dashboard_items", { p_project_id: projectId, p_today: today, p_horizon_days: 30 });
        if (error) return fail("dashboardItems", error);
        data.dashboardItems = own((rows ?? []) as Array<{ project_id?: string }>) as InsuranceWorkspaceData["dashboardItems"];
      } catch {
        fail("dashboardItems", { message: "exceção" });
      }
    })(),
    (async () => {
      try {
        const { data: docs, error } = await client.from("documents").select("id,title,kind,project_id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(500);
        if (error) return fail("documents", error);
        const list = own((docs ?? []) as Array<{ id: string; title: string; kind: string; project_id: string }>);
        const latest = new Map<string, string>();
        if (list.length) {
          const { data: vers } = await client.from("document_versions").select("id,document_id,version_index").in("document_id", list.map((d) => d.id)).order("version_index", { ascending: false });
          for (const v of (vers ?? []) as Array<{ id: string; document_id: string }>) if (!latest.has(v.document_id)) latest.set(v.document_id, v.id);
        }
        data.documents = list.map((d): DocumentRef => ({ id: d.id, title: d.title, kind: d.kind, latestVersionId: latest.get(d.id) ?? null }));
      } catch {
        fail("documents", { message: "exceção" });
      }
    })(),
  ]);

  // Fase 4/B — leituras derivadas (RPCs de leitura; falha NUNCA vira "coerente"/"pronto": a seção fica sem valor e a tela o diz)
  try {
    const { data: cons, error } = await client.rpc("insurance_advances_consolidated", { p_project_id: projectId, p_policy_id: null });
    if (error) fail("advancesConsolidated", error);
    else data.advancesConsolidated = cons as InsuranceWorkspaceData["advancesConsolidated"];
  } catch {
    fail("advancesConsolidated", { message: "exceção" });
  }
  const draftPolicy = (d: InsuranceWorkspaceData["drafts"][number]): string | null =>
    d.policy_id ?? data.claims.find((c) => c.id === d.claim_id)?.policy_id ?? data.endorsements.find((e) => e.id === d.endorsement_id)?.policy_id ?? null;
  await Promise.all([
    ...data.drafts
      .filter((d) => d.state === "DRAFT")
      .slice(0, 30)
      .map(async (d) => {
        const pid = draftPolicy(d);
        if (!pid) return;
        try {
          const { data: chk, error } = await client.rpc("insurance_coherence_check", { p_policy_id: pid, p_draft_id: d.id });
          if (error) return fail("coherence", error);
          data.coherence[d.id] = chk as InsuranceWorkspaceData["coherence"][string];
        } catch {
          fail("coherence", { message: "exceção" });
        }
      }),
    ...data.claims
      .filter((c) => c.policy_id && (c.claim_kind === "RC_CRUZADA" || data.policies.find((p) => p.id === c.policy_id)?.modality === "RC_CRUZADA"))
      .slice(0, 30)
      .map(async (c) => {
        try {
          const { data: r, error } = await client.rpc("insurance_rcc_readiness", { p_policy_id: c.policy_id, p_claim_id: c.id });
          if (error) return fail("rccReady", error);
          data.rccReady[c.id] = (r as { ready?: boolean } | null)?.ready === true;
        } catch {
          fail("rccReady", { message: "exceção" });
        }
      }),
  ]);

  // nomes de quem atuou (best effort: a RLS de profiles pode limitar; sem nome, a tela mostra o id abreviado)
  try {
    const ids = [...new Set([
      ...data.audit.map((a) => a.actor_user_id),
      ...data.endorsementReviews.map((r) => r.reviewer_id),
      ...data.endorsements.flatMap((e) => [e.requested_by, e.issued_by]),
    ].filter((x): x is string => Boolean(x)))];
    if (ids.length) {
      const { data: profs } = await client.from("profiles").select("id,name").in("id", ids);
      for (const p of (profs ?? []) as Array<{ id: string; name: string | null }>) if (p.name) data.actors[p.id] = p.name;
    }
  } catch {
    /* sem nomes: segue com ids */
  }
  return { data, errors, moduleUnavailable: unavailable, foreignRowsDropped: dropped };
}
