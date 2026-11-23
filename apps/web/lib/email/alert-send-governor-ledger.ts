// Ledger PERSISTENTE do governador sobre a tabela JÁ existente audit_log_entries (append-only; nenhuma migration nova).
// Estrutural (sem "server-only"): recebe qualquer cliente com a forma mínima do supabase-js, o que permite testar com um adaptador
// de PGlite. Escreve só com o cliente service_role criado no servidor (get-email-provider.ts); nunca no frontend.

import { GOVERNOR_ACTIONS, type GovernorLedger, type GovernorLedgerEntry } from "./alert-send-governor";

export const GOVERNOR_ENTITY_TYPE = "ALERT_SEND";
export const GOVERNOR_SUPPRESSED_ENTITY_TYPE = "ALERT_SEND_SUPPRESSED";
/** Acima deste número de linhas na janela, a contagem é tratada como "limite estourado" (fail-closed). */
export const GOVERNOR_COUNT_ROW_CAP = 10000;

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}
// Forma mínima encadeável usada daqui (compatível com PostgrestFilterBuilder).
interface SelectBuilder extends PromiseLike<QueryResult<LedgerRow>> {
  eq(column: string, value: string): SelectBuilder;
  in(column: string, values: string[]): SelectBuilder;
  gte(column: string, value: string): SelectBuilder;
  like(column: string, pattern: string): SelectBuilder;
  limit(n: number): SelectBuilder;
}
export interface GovernorDbClient {
  from(table: string): {
    select(columns: string): SelectBuilder;
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

interface LedgerRow {
  action: string;
  entity_id: string;
  occurred_at?: string | Date;
}

function netAdmissionRows(rows: LedgerRow[]): LedgerRow[] {
  const released = new Set<string>();
  for (const r of rows) if (r.action === GOVERNOR_ACTIONS.RELEASED) released.add(r.entity_id);
  return rows.filter((r) => r.action === GOVERNOR_ACTIONS.ADMITTED && !released.has(r.entity_id));
}

const ts = (v: string | Date | undefined): number => (v === undefined ? 0 : new Date(v).getTime());

export function createSupabaseGovernorLedger(client: GovernorDbClient): GovernorLedger {
  const fetchRows = async (sinceIso: string, keyHash?: string) => {
    let q = client
      .from("audit_log_entries")
      .select("action, entity_id, occurred_at")
      .eq("entity_type", GOVERNOR_ENTITY_TYPE)
      .in("action", [GOVERNOR_ACTIONS.ADMITTED, GOVERNOR_ACTIONS.RELEASED])
      .gte("occurred_at", sinceIso)
      .limit(GOVERNOR_COUNT_ROW_CAP + 1);
    if (keyHash) q = q.like("entity_id", `${keyHash}.%`);
    const { data, error } = await q;
    if (error || !data) throw new Error("governor ledger read failed");
    return data;
  };
  return {
    async rankOfNetAdmission(sinceIso, entityId) {
      const rows = await fetchRows(sinceIso);
      if (rows.length > GOVERNOR_COUNT_ROW_CAP) return Number.MAX_SAFE_INTEGER;
      const net = netAdmissionRows(rows).sort((a, b) => ts(a.occurred_at) - ts(b.occurred_at) || (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));
      const i = net.findIndex((r) => r.entity_id === entityId);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i + 1;
    },
    async hasNetAdmissionForKey(keyHash, sinceIso) {
      return netAdmissionRows(await fetchRows(sinceIso, keyHash)).length > 0;
    },
    async record(entry: GovernorLedgerEntry) {
      const { error } = await client.from("audit_log_entries").insert({
        project_id: entry.projectId,
        actor_type: "SYSTEM",
        actor_user_id: null,
        actor_label: null,
        action: entry.action,
        entity_type: entry.action === GOVERNOR_ACTIONS.SUPPRESSED ? GOVERNOR_SUPPRESSED_ENTITY_TYPE : GOVERNOR_ENTITY_TYPE,
        entity_id: entry.entityId,
        detail: JSON.stringify(entry.detail),
      });
      if (error) throw new Error("governor ledger write failed");
    },
  };
}
