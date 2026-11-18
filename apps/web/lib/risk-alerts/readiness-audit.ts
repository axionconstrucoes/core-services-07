// Auditoria de prontidão do envio real SÓ NA MUDANÇA DE ESTADO.
// Antes, todo ciclo gravava RISK_ALERT_NOT_READY_FOR_REAL_SEND com os mesmos bloqueios (a cada 2 min seriam ~720 linhas/dia).
// Agora: grava quando o conjunto de bloqueios muda (inclusive na primeira vez) e grava RISK_ALERT_READY_FOR_REAL_SEND quando os
// bloqueios deixam de existir. Rodadas sem mudança não gravam auditoria; a contagem/última ocorrência fica em
// acc_repeated_conditions (contador best-effort, quando a tabela existir). Rastreabilidade preservada: toda transição tem linha.
import type { PlannedAuditEvent } from "./types";

export const NOT_READY_ACTION = "RISK_ALERT_NOT_READY_FOR_REAL_SEND";
export const READY_ACTION = "RISK_ALERT_READY_FOR_REAL_SEND";
export const READINESS_CONDITION_KEY = "risk-alerts:real-send-readiness";

export interface LatestReadinessAudit {
  action: string;
  detail: string | null;
}

export type ReadinessAuditOutcome = "RECORDED_NOT_READY" | "RECORDED_READY" | "UNCHANGED_NOT_READY" | "NONE";

export function readinessDetail(blockers: readonly string[]): string | null {
  if (blockers.length === 0) return null;
  return `Envio real bloqueado: ${[...new Set(blockers)].sort().join(", ")}.`;
}

/** Decide (função pura) se a prontidão gera linha de auditoria nesta rodada. latest = última linha READY/NOT_READY do projeto. */
export function decideReadinessAudit(
  projectId: string,
  blockers: readonly string[],
  latest: LatestReadinessAudit | null
): { event: PlannedAuditEvent | null; outcome: ReadinessAuditOutcome } {
  const detail = readinessDetail(blockers);
  if (detail) {
    if (latest?.action === NOT_READY_ACTION && latest.detail === detail) return { event: null, outcome: "UNCHANGED_NOT_READY" };
    return { event: { action: NOT_READY_ACTION, entityType: "PROJECT", entityId: projectId, detail }, outcome: "RECORDED_NOT_READY" };
  }
  if (latest?.action === NOT_READY_ACTION) {
    return {
      event: { action: READY_ACTION, entityType: "PROJECT", entityId: projectId, detail: `Bloqueios do envio real resolvidos (antes: ${latest.detail ?? "sem detalhe"}).` },
      outcome: "RECORDED_READY",
    };
  }
  return { event: null, outcome: "NONE" };
}
