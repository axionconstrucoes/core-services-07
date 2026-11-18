// Áreas INFORMATIVAS do motor de alertas, por projeto. Puro, sem I/O.
//
// Área informativa: a coleta, o processamento e a apresentação dos dados continuam (os casos seguem
// registrados e visíveis), mas o motor NÃO gera alerta imediato, repetição, consolidado, ação SLA,
// cobrança nem escalonamento para ela, e a Matriz dessa área NÃO entra na prontidão do envio
// (CONFIGURATION_REVIEW_REQUIRED não é disparado por ela). As demais áreas mantêm todas as validações.
// Nada é marcado como aprovado: só deixa de haver automação de alerta para a área.
//
// Fonte explícita e auditável, sem migration — registros append-only em audit_log_entries:
//   action      = RISK_ALERT_AREA_INFORMATIVE_SET | RISK_ALERT_AREA_INFORMATIVE_UNSET
//   entity_type = PROJECT_RISK_ALERT_AREA
//   entity_id   = "<projectId>:<AREA>"
//   actor_type  = USER (registro humano; SYSTEM/LEGACY são ignorados)
//   detail      = JSON { "area": "FINANCEIRO", "reason": "..." }
// O registro humano MAIS RECENTE por área decide (SET => informativa; UNSET => volta ao normal).

import type { SlaArea } from "@/lib/sla/types";

export const INFORMATIVE_SET_ACTION = "RISK_ALERT_AREA_INFORMATIVE_SET";
export const INFORMATIVE_UNSET_ACTION = "RISK_ALERT_AREA_INFORMATIVE_UNSET";
export const INFORMATIVE_ENTITY_TYPE = "PROJECT_RISK_ALERT_AREA";

export interface InformativeAuditRow {
  project_id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string | null;
}

function detailArea(detail: string | null): string | null {
  if (!detail) return null;
  try {
    const value = JSON.parse(detail);
    return value && typeof value === "object" && typeof value.area === "string" ? value.area : null;
  } catch {
    return null;
  }
}

export function resolveInformativeAreas(projectId: string, rows: InformativeAuditRow[]): Set<SlaArea> {
  const latest = new Map<string, InformativeAuditRow>();
  for (const row of rows) {
    if (row.project_id !== projectId || row.entity_type !== INFORMATIVE_ENTITY_TYPE) continue;
    if (row.action !== INFORMATIVE_SET_ACTION && row.action !== INFORMATIVE_UNSET_ACTION) continue;
    if (row.actor_type !== "USER" || !row.actor_user_id) continue;
    const [entityProject, area] = row.entity_id.split(":");
    if (entityProject !== projectId || !area || detailArea(row.detail) !== area) continue;
    const current = latest.get(area);
    if (!current || row.occurred_at > current.occurred_at) latest.set(area, row);
  }
  const result = new Set<SlaArea>();
  for (const [area, row] of latest) if (row.action === INFORMATIVE_SET_ACTION) result.add(area as SlaArea);
  return result;
}
