// Consulta da tela de Auditoria: filtragem, classificação, contagem e paginação no servidor.
//
// Causa raiz corrigida (27/11/2026): a tela lia audit_log_entries numa única consulta sem
// paginação. O PostgREST devolve no máximo 1.000 linhas por requisição, então só os 1.000
// registros mais recentes chegavam (a WEG tem 4.519) e os filtros por categoria eram aplicados
// sobre esse recorte — o histórico anterior a 18/11 ficava inacessível em todos os filtros.
//
// Agora:
// 1. Os filtros de data, responsável e palavra-chave vão para o banco.
// 2. Uma varredura leve (id, ação, entidade), paginada em blocos de 1.000, classifica todos os
//    registros autorizados e produz as contagens reais por categoria.
// 3. Só a página exibida é lida por completo (detalhe), pelos ids.
// Tudo usa o cliente da sessão do usuário: RLS (is_project_member) e isolamento por projeto valem.

import {
  AUDIT_CATEGORIES,
  FAILURE_RECOVERY_ACTIONS,
  actionCodesMatchingLabel,
  assessFailures,
  brasiliaDayStartUtc,
  brasiliaNextDayStartUtc,
  classifyAuditEntry,
  sanitizeAuditKeyword,
  type AuditCategory,
  type AuditFilter,
  type FailureAssessment,
} from "./audit-catalog";

// Interface mínima do cliente Supabase usada aqui (o servidor passa o cliente da sessão).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuditSupabaseClient = { from: (table: string) => any };
type ServerClient = AuditSupabaseClient;

export const AUDIT_PAGE_SIZE = 50;
const SCAN_CHUNK = 1000;
const SCAN_MAX_ROWS = 200_000;

export type AuditQueryInput = {
  projectId: string;
  category: AuditFilter;
  from?: string;
  to?: string;
  actor?: string;
  keyword?: string;
  page?: number;
};

export type AuditRow = {
  id: string;
  occurredAt: string;
  actorType: string;
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  category: AuditCategory;
  ruleId: string;
};

export type AuditQueryResult = {
  rows: AuditRow[];
  counts: Record<AuditFilter, number>;
  totalMatching: number;
  page: number;
  pageCount: number;
  actorIds: string[];
  failures: FailureAssessment[];
  scanTruncated: boolean;
};

type ScanRow = { id: string; action: string; entity_type: string; actor_user_id: string | null };
type FullRow = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtro de responsável: "SYSTEM", "LEGACY" ou o id do usuário. */
export function parseAuditActor(raw: string | undefined | null): string | undefined {
  const value = (raw ?? "").trim();
  if (value === "SYSTEM" || value === "LEGACY") return value;
  return UUID.test(value) ? value.toLowerCase() : undefined;
}

export function parseAuditDay(raw: string | undefined | null): string | undefined {
  const value = (raw ?? "").trim();
  return brasiliaDayStartUtc(value) ? value : undefined;
}

export function buildKeywordOrFilter(keyword: string): string | null {
  const term = sanitizeAuditKeyword(keyword);
  if (!term) return null;
  const like = `*${term}*`;
  const parts = [`detail.ilike.${like}`, `action.ilike.${like}`, `entity_type.ilike.${like}`, `entity_id.ilike.${like}`, `actor_label.ilike.${like}`];
  const codes = actionCodesMatchingLabel(term);
  if (codes.length > 0) parts.push(`action.in.(${codes.join(",")})`);
  return parts.join(",");
}

/** Separada para teste com cliente simulado; em produção recebe sempre o cliente da sessão (RLS). */
export async function queryAuditLogWithClient(supabase: ServerClient, input: AuditQueryInput, now = new Date()): Promise<AuditQueryResult> {
  const fromUtc = input.from ? brasiliaDayStartUtc(input.from) : null;
  const toUtc = input.to ? brasiliaNextDayStartUtc(input.to) : null;
  const keywordFilter = input.keyword ? buildKeywordOrFilter(input.keyword) : null;

  const base = (columns: string) => {
    let query = supabase.from("audit_log_entries").select(columns).eq("project_id", input.projectId);
    if (fromUtc) query = query.gte("occurred_at", fromUtc);
    if (toUtc) query = query.lt("occurred_at", toUtc);
    if (input.actor === "SYSTEM" || input.actor === "LEGACY") query = query.eq("actor_type", input.actor);
    else if (input.actor) query = query.eq("actor_user_id", input.actor);
    if (keywordFilter) query = query.or(keywordFilter);
    return query;
  };

  // 1. Varredura leve e paginada de todos os registros autorizados que atendem aos filtros.
  const scanned: Array<{ id: string; category: AuditCategory }> = [];
  const actorIds = new Set<string>();
  let scanTruncated = false;
  for (let offset = 0; ; offset += SCAN_CHUNK) {
    const { data, error } = await base("id, action, entity_type, actor_user_id")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + SCAN_CHUNK - 1);
    if (error) {
      if (error.code === "22P02") break;
      throw new Error(`Falha ao consultar a auditoria: ${error.message}`);
    }
    const rows = (data ?? []) as unknown as ScanRow[];
    for (const row of rows) {
      scanned.push({ id: row.id, category: classifyAuditEntry(row.action, row.entity_type).category });
      if (row.actor_user_id) actorIds.add(row.actor_user_id);
    }
    if (rows.length < SCAN_CHUNK) break;
    if (scanned.length >= SCAN_MAX_ROWS) {
      scanTruncated = true;
      break;
    }
  }

  const counts = Object.fromEntries([["TODOS", scanned.length], ...AUDIT_CATEGORIES.map((c) => [c.value, 0])]) as Record<AuditFilter, number>;
  for (const row of scanned) counts[row.category] += 1;

  const matching = input.category === "TODOS" ? scanned : scanned.filter((row) => row.category === input.category);
  const pageCount = Math.max(1, Math.ceil(matching.length / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), pageCount);
  const pageIds = matching.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE).map((row) => row.id);

  // 2. Leitura completa apenas da página exibida.
  let rows: AuditRow[] = [];
  if (pageIds.length > 0) {
    const { data, error } = await supabase
      .from("audit_log_entries")
      .select("id, occurred_at, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail")
      .eq("project_id", input.projectId)
      .in("id", pageIds);
    if (error) throw new Error(`Falha ao carregar registros da auditoria: ${error.message}`);
    const byId = new Map(((data ?? []) as unknown as FullRow[]).map((row) => [row.id, row]));
    rows = pageIds
      .map((id) => byId.get(id))
      .filter((row): row is FullRow => Boolean(row))
      .map((row) => {
        const classification = classifyAuditEntry(row.action, row.entity_type);
        return {
          id: row.id,
          occurredAt: row.occurred_at,
          actorType: row.actor_type,
          actorUserId: row.actor_user_id,
          actorLabel: row.actor_label,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          detail: row.detail,
          category: classification.category,
          ruleId: classification.ruleId,
        };
      });
  }

  const failures = await loadFailureAssessment(supabase, input.projectId, now);

  return {
    rows,
    counts,
    totalMatching: matching.length,
    page,
    pageCount,
    actorIds: [...actorIds],
    failures,
    scanTruncated,
  };
}


/** Falhas do projeto inteiro (independe dos filtros), com a situação de cada uma e a evidência. */
async function loadFailureAssessment(supabase: ServerClient, projectId: string, now: Date): Promise<FailureAssessment[]> {
  const { data, error } = await supabase
    .from("audit_log_entries")
    .select("id, action, entity_id, occurred_at")
    .eq("project_id", projectId)
    .or("action.like.*_FAILED,action.like.*_UNAVAILABLE,action.like.*_DISCREPANCY,action.like.*_ERROR")
    .order("occurred_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Falha ao consultar falhas da auditoria: ${error.message}`);
  const failures = ((data ?? []) as Array<{ id: string; action: string; entity_id: string; occurred_at: string }>).map((row) => ({
    id: row.id,
    action: row.action,
    entityId: row.entity_id,
    occurredAt: row.occurred_at,
  }));
  if (failures.length === 0) return [];

  const recoveryCodes = [...new Set(failures.flatMap((f) => FAILURE_RECOVERY_ACTIONS[f.action] ?? []))];
  const entityIds = [...new Set(failures.map((f) => f.entityId))];
  let recoveries: Array<{ action: string; entityId: string; occurredAt: string }> = [];
  if (recoveryCodes.length > 0) {
    const { data: recoveryData, error: recoveryError } = await supabase
      .from("audit_log_entries")
      .select("action, entity_id, occurred_at")
      .eq("project_id", projectId)
      .in("action", recoveryCodes)
      .in("entity_id", entityIds)
      .limit(1000);
    if (recoveryError) throw new Error(`Falha ao consultar recuperações: ${recoveryError.message}`);
    recoveries = ((recoveryData ?? []) as Array<{ action: string; entity_id: string; occurred_at: string }>).map((row) => ({
      action: row.action,
      entityId: row.entity_id,
      occurredAt: row.occurred_at,
    }));
  }
  return assessFailures(failures, recoveries, now);
}
