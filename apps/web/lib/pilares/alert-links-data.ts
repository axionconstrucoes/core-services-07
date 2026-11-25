// Leitura (SELECT sob RLS + RPC de leitura quality_alert_resolved_guard) das entidades ABERTAS vinculadas a um caso de alerta.
// Não escreve nada e não altera o fluxo RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA (record_risk_alert_action intacto).
// Fase 3/D: o vínculo vem da tabela estruturada acc_alert_links (fonte primária) COM fallback à convenção textual para dados antigos
// (ver lib/pilares/alert-links.ts › combineLinkedEntities).

import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

import {
  ENTITY_ROUTE,
  combineLinkedEntities,
  isSearchableVisibleCode,
  isStructuredEntityType,
  parseGuardPayload,
  type AlertRef,
  type ClosureGuard,
  type LinkOrigin,
  type LinkedEntityRow,
  type LinkedEntityType,
  type StructuredLink,
} from "./alert-links";

export interface LinkedEntityView {
  type: LinkedEntityType;
  id: string;
  code: string | null;
  title: string;
  state: string;
  /** Prazo de CONCLUSÃO do tratamento/reparo (due_date); null = SEM DADOS. */
  dueDate: string | null;
  /** Rota relativa ao projeto da tela da entidade. */
  route: string;
  /** ESTRUTURADO = vínculo registrado em acc_alert_links; CONVENCAO = ligação inferida do texto (dado antigo, fallback). */
  origin: LinkOrigin;
  /** Guarda de encerramento (RNC/garantia); null para sinistro ou quando a RPC está indisponível. */
  guard: ClosureGuard | null;
}

export interface AlertLinkedQualityView {
  /** false = a leitura falhou: a UI informa "vínculo indisponível" em vez de omitir o aviso. */
  available: boolean;
  entities: LinkedEntityView[];
}

/** 42P01 = relação inexistente (Postgres); PGRST205/PGRST202 = tabela/função fora do cache de esquema (PostgREST). */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Filtro PostgREST seguro: só UUID e código visível restrito (sem vírgula/parêntese) entram no .or(). */
function needles(alert: AlertRef): string[] {
  const out = [alert.caseId];
  if (isSearchableVisibleCode(alert.visibleCode)) out.push(alert.visibleCode.trim());
  return out.filter((n) => /^[A-Za-z0-9._-]+$/.test(n));
}

async function query(client: Client, table: string, columns: string, projectId: string, column: string, alert: AlertRef) {
  const orFilter = needles(alert).map((n) => `${column}.ilike.%${n}%`).join(",");
  const { data, error } = await client.from(table).select(columns).eq("project_id", projectId).or(orFilter).limit(200);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}

/** Vínculos estruturados do alerta (ativos e desfeitos). Tabela ausente (migration pendente) => sem vínculos estruturados, só convenção. */
async function loadStructuredLinks(client: Client, projectId: string, alert: AlertRef): Promise<StructuredLink[]> {
  const { data, error } = await client.from("acc_alert_links").select("entity_type,entity_id,link_source,unlinked_at").eq("project_id", projectId).eq("alert_case_id", alert.caseId).limit(200);
  if (error) {
    if (error.code && MISSING_RELATION_CODES.has(error.code)) return [];
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => isStructuredEntityType(r.entity_type))
    .map((r): StructuredLink => ({
      entityType: r.entity_type as StructuredLink["entityType"],
      entityId: String(r.entity_id),
      active: r.unlinked_at == null,
      linkSource: String(r.link_source ?? "MANUAL"),
    }));
}

/** Linhas de entidade (RNC/garantia/sinistro) dos vínculos estruturados ATIVOS, lidas pelo id e sempre dentro do projeto. */
async function loadStructuredRows(client: Client, projectId: string, links: readonly StructuredLink[]): Promise<LinkedEntityRow[]> {
  const ids = (type: StructuredLink["entityType"]) => Array.from(new Set(links.filter((l) => l.active && l.entityType === type).map((l) => l.entityId)));
  const [ncrIds, warrantyIds, claimIds] = [ids("RNC"), ids("GARANTIA"), ids("SINISTRO")];
  const rows: LinkedEntityRow[] = [];
  if (ncrIds.length) {
    const { data } = await client.from("quality_ncrs").select("id,code,title,state,due_date").eq("project_id", projectId).in("id", ncrIds);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) rows.push({ type: "NCR", id: String(r.id), code: String(r.code), title: String(r.title), state: String(r.state), refs: [], dueDate: (r.due_date as string | null) ?? null });
  }
  if (warrantyIds.length) {
    const { data } = await client.from("quality_warranty_cases").select("id,code,service_system,state,due_date").eq("project_id", projectId).in("id", warrantyIds);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) rows.push({ type: "WARRANTY", id: String(r.id), code: String(r.code), title: String(r.service_system), state: String(r.state), refs: [], dueDate: (r.due_date as string | null) ?? null });
  }
  if (claimIds.length) {
    const { data } = await client.from("insurance_claims").select("id,title,stage").eq("project_id", projectId).in("id", claimIds);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) rows.push({ type: "CLAIM", id: String(r.id), code: null, title: String(r.title), state: String(r.stage), refs: [], dueDate: null });
  }
  return rows;
}

export async function getAlertLinkedQuality(projectId: string, alert: AlertRef): Promise<AlertLinkedQualityView> {
  try {
    const client = await createSupabaseServerClient();
    const structuredLinks = await loadStructuredLinks(client, projectId, alert);
    const structuredRows = await loadStructuredRows(client, projectId, structuredLinks);
    const [ncrs, warranties, claims, evidence] = await Promise.all([
      query(client, "quality_ncrs", "id,code,title,state,origin_ref,origin_url,due_date", projectId, "origin_ref", alert),
      query(client, "quality_warranty_cases", "id,code,service_system,state,origin_ref,due_date", projectId, "origin_ref", alert),
      query(client, "insurance_claims", "id,title,stage,source_ref", projectId, "source_ref", alert),
      query(client, "quality_evidence", "ncr_id,warranty_case_id,source_ref", projectId, "source_ref", alert),
    ]);

    const rows: LinkedEntityRow[] = [
      ...ncrs.map((r): LinkedEntityRow => ({ type: "NCR", id: String(r.id), code: String(r.code), title: String(r.title), state: String(r.state), refs: [r.origin_ref as string, r.origin_url as string], dueDate: (r.due_date as string | null) ?? null })),
      ...warranties.map((r): LinkedEntityRow => ({ type: "WARRANTY", id: String(r.id), code: String(r.code), title: String(r.service_system), state: String(r.state), refs: [r.origin_ref as string], dueDate: (r.due_date as string | null) ?? null })),
      ...claims.map((r): LinkedEntityRow => ({ type: "CLAIM", id: String(r.id), code: null, title: String(r.title), state: String(r.stage), refs: [r.source_ref as string], dueDate: null })),
    ];

    // RNC/garantia citadas por evidência (source_ref do alerta) entram também, lendo a entidade pelo id.
    const knownNcr = new Set(rows.filter((r) => r.type === "NCR").map((r) => r.id));
    const knownWarranty = new Set(rows.filter((r) => r.type === "WARRANTY").map((r) => r.id));
    const extraNcr = Array.from(new Set(evidence.map((e) => e.ncr_id as string | null).filter((id): id is string => !!id && !knownNcr.has(id))));
    const extraWarranty = Array.from(new Set(evidence.map((e) => e.warranty_case_id as string | null).filter((id): id is string => !!id && !knownWarranty.has(id))));
    const evidenceRef = (e: Record<string, unknown>) => e.source_ref as string;
    if (extraNcr.length) {
      const { data } = await client.from("quality_ncrs").select("id,code,title,state,due_date").eq("project_id", projectId).in("id", extraNcr);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        rows.push({ type: "NCR", id: String(r.id), code: String(r.code), title: String(r.title), state: String(r.state), refs: evidence.filter((e) => e.ncr_id === r.id).map(evidenceRef), dueDate: (r.due_date as string | null) ?? null });
      }
    }
    if (extraWarranty.length) {
      const { data } = await client.from("quality_warranty_cases").select("id,code,service_system,state,due_date").eq("project_id", projectId).in("id", extraWarranty);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        rows.push({ type: "WARRANTY", id: String(r.id), code: String(r.code), title: String(r.service_system), state: String(r.state), refs: evidence.filter((e) => e.warranty_case_id === r.id).map(evidenceRef), dueDate: (r.due_date as string | null) ?? null });
      }
    }

    const open = combineLinkedEntities(structuredLinks, structuredRows, rows, alert).slice(0, 10);
    const entities = await Promise.all(
      open.map(async (e): Promise<LinkedEntityView> => {
        let guard: ClosureGuard | null = null;
        if (e.type !== "CLAIM") {
          try {
            const { data, error } = await client.rpc("quality_alert_resolved_guard", { p_entity_type: e.type, p_entity_id: e.id });
            guard = error ? null : parseGuardPayload(data);
          } catch {
            guard = null;
          }
        }
        return { type: e.type, id: e.id, code: e.code, title: e.title, state: e.state, dueDate: e.dueDate, route: ENTITY_ROUTE[e.type], origin: e.origin, guard };
      }),
    );
    return { available: true, entities };
  } catch (error) {
    // Tabelas do módulo ainda não provisionadas neste banco (migrations não aplicadas): não há vínculo possível, e isso não é falha.
    const code = (error as { code?: string } | null)?.code;
    if (code && MISSING_RELATION_CODES.has(code)) return { available: true, entities: [] };
    return { available: false, entities: [] };
  }
}
