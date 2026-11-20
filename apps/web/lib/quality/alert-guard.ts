// GUARDA para a fase 2 (alertas): alerta RESOLVIDO NÃO encerra RNC nem garantia sozinho.
// O estado da RNC/garantia só muda pela transição própria (RPC quality_*_transition), que exige
// verificação de eficácia registrada. Esta função é pura e nunca autoriza fechamento por alerta.
// No banco: public.quality_alert_resolved_guard(entity_type, entity_id) devolve o mesmo contrato.

import { closureReadiness, type TransitionContext } from "./state-machine";

export interface AlertResolvedGuard {
  alertResolutionClosesEntity: false;
  closureReady: boolean;
  blockers: string[];
  rule: string;
}

export const ALERT_RESOLVED_RULE =
  "RESOLVIDO do alerta é decisão de comunicação/SLA; o encerramento da RNC/garantia exige verificação de eficácia registrada e transição própria.";

export function alertResolvedGuard(ctx: Omit<TransitionContext, "to" | "role" | "from"> & { from?: string }): AlertResolvedGuard {
  const v = closureReadiness(ctx);
  return { alertResolutionClosesEntity: false, closureReady: v.allowed, blockers: v.blockers, rule: ALERT_RESOLVED_RULE };
}

/** Conveniência explícita para consumidores: resolver um alerta nunca fecha a entidade. */
export function mayAlertResolutionCloseEntity(): false {
  return false;
}
