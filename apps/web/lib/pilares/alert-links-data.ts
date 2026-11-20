// Leitura (SELECT sob RLS + RPC de leitura quality_alert_resolved_guard) das entidades ABERTAS vinculadas a um caso de alerta.
// Não escreve nada e não altera o fluxo RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA (record_risk_alert_action intacto).
// Convenção de vínculo: ver lib/pilares/alert-links.ts.

import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

import {
  ENTITY_ROUTE,
  isSearchableVisibleCode,
  parseGuardPayload,
  selectOpenLinkedEntities,
  type AlertRef,
  type ClosureGuard,
  type LinkedEntityRow,
  type LinkedEntityType,
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

export async function getAlertLinkedQuality(projectId: string, alert: AlertRef): Promise<AlertLinkedQualityView> {
  try {
    const client = await createSupabaseServerClient();
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

    const open = selectOpenLinkedEntities(rows, alert).slice(0, 10);
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
        return { type: e.type, id: e.id, code: e.code, title: e.title, state: e.state, dueDate: e.dueDate, route: ENTITY_ROUTE[e.type], guard };
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
