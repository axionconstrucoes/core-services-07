// SUSPENSÃO de comunicação por CASO (ex.: ausência de cronograma ainda não comprovada porque a caixa do
// responsável à época não está integrada). Puro, sem I/O.
//
// Caso suspenso: continua registrado, visível e com histórico/prazos intactos (a ação SLA NÃO é alterada,
// o SLA NÃO é reiniciado, nada é resolvido), mas o motor NÃO planeja alerta imediato, repetição,
// escalonamento, "limite atingido", nem reemissão (mesmo com decisão de reemissão) e nenhuma mensagem
// pendente desse caso sai pela outbox. Não é falta confirmada nem resolução da obrigação.
//
// Fonte explícita e auditável, sem migration — registros append-only em audit_log_entries:
//   action      = RISK_ALERT_CASE_COMMUNICATION_SUSPENDED | RISK_ALERT_CASE_COMMUNICATION_RESUMED
//   entity_type = RISK_ALERT_CASE
//   entity_id   = "<caseId>"
//   actor_type  = USER (registro humano; SYSTEM/LEGACY são ignorados)
//   detail      = JSON { "reason": "...", ... }
// O registro humano MAIS RECENTE por caso decide (SUSPENDED => suspenso; RESUMED => volta ao normal).

export const CASE_SUSPENDED_ACTION = "RISK_ALERT_CASE_COMMUNICATION_SUSPENDED";
export const CASE_RESUMED_ACTION = "RISK_ALERT_CASE_COMMUNICATION_RESUMED";
export const CASE_SUSPENSION_ENTITY_TYPE = "RISK_ALERT_CASE";

export interface CaseSuspensionAuditRow {
  project_id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string | null;
}

export function resolveSuspendedCaseIds(projectId: string, rows: CaseSuspensionAuditRow[]): Set<string> {
  const latest = new Map<string, CaseSuspensionAuditRow>();
  for (const row of rows) {
    if (row.project_id !== projectId || row.entity_type !== CASE_SUSPENSION_ENTITY_TYPE) continue;
    if (row.action !== CASE_SUSPENDED_ACTION && row.action !== CASE_RESUMED_ACTION) continue;
    if (row.actor_type !== "USER" || !row.actor_user_id || !row.entity_id) continue;
    const current = latest.get(row.entity_id);
    if (!current || row.occurred_at > current.occurred_at) latest.set(row.entity_id, row);
  }
  const result = new Set<string>();
  for (const [caseId, row] of latest) if (row.action === CASE_SUSPENDED_ACTION) result.add(caseId);
  return result;
}
