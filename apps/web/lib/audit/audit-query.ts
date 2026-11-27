import "server-only";
import { createSupabaseServerClient } from "@axion/db/server";
import { queryAuditLogWithClient, type AuditQueryInput, type AuditQueryResult } from "./audit-query-core";

export { parseAuditActor, parseAuditDay, AUDIT_PAGE_SIZE } from "./audit-query-core";
export type { AuditQueryInput, AuditQueryResult, AuditRow } from "./audit-query-core";

/** Consulta da Auditoria com o cliente da sessão do usuário: RLS (is_project_member) sempre aplicada. */
export async function queryAuditLog(input: AuditQueryInput): Promise<AuditQueryResult> {
  return queryAuditLogWithClient(await createSupabaseServerClient(), input);
}
