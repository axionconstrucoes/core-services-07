// Interruptor de ENVIO das reemissões aprovadas — puro, sem I/O.
//
// Aprovar uma reemissão (RPC risk_alert_reissue_approve) só REGISTRA a decisão em audit_log_entries. Quem envia é o
// ciclo, na próxima execução. Para que a existência de uma aprovação nunca dispare e-mails por si só (por exemplo na
// primeira execução do ciclo depois de várias aprovações), o ciclo REAL só considera as aprovações quando
// ACC_RISK_ALERT_REISSUE_SEND_ENABLED = "true" (server-side; ausente/qualquer outro valor = DESLIGADO).
//
// O interruptor é uma trava ADICIONAL: não substitui nenhuma trava do piloto (prontidão, allowlist, projeto confirmado,
// provedor, suspensão manual do caso, override de entrega). Dry-run (somente leitura, provedor simulado) sempre enxerga as
// aprovações, para a Diretoria conferir exatamente o que sairia antes de ligar o interruptor.

import type { ReissueApproval } from "./communication-ledger";

export const REISSUE_SEND_FLAG_ENV = "ACC_RISK_ALERT_REISSUE_SEND_ENABLED";

export function isReissueSendEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env[REISSUE_SEND_FLAG_ENV] ?? "").trim().toLowerCase() === "true";
}

export interface ReissueGateResult {
  /** Aprovações que o planejador pode usar neste ciclo. */
  approvals: Map<string, ReissueApproval>;
  /** Aprovações retidas pelo interruptor (nenhuma reemissão planejada por elas). */
  held: number;
  sendFlagEnabled: boolean;
}

export function applyReissueSendGate(
  approvals: Map<string, ReissueApproval> | undefined,
  options: { dryRun: boolean; env?: Record<string, string | undefined> }
): ReissueGateResult {
  const source = approvals ?? new Map<string, ReissueApproval>();
  const sendFlagEnabled = isReissueSendEnabled(options.env);
  if (options.dryRun || sendFlagEnabled) return { approvals: source, held: 0, sendFlagEnabled };
  return { approvals: new Map(), held: source.size, sendFlagEnabled };
}
