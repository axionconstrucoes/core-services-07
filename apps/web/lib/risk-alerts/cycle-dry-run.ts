// Dry-run do ciclo recorrente ANTES de ligar risk_alerts_enabled (somente o projeto piloto, somente leitura).
// Puro (sem I/O, sem "server-only") para ser testável sem rede.
//
// Regra: o planejamento só é feito "como se" risk_alerts_enabled=true quando, ao mesmo tempo,
//   - a execução é dryRun (nenhuma escrita, provedor simulado), e
//   - o projectId foi pedido EXPLICITAMENTE e é o projeto piloto com perfil válido.
// Execução real nunca é afetada: a flag no banco continua obrigatória.

import { ACC_PILOT_INSTITUTIONAL_ADDRESS, PILOT_FORBIDDEN_ADDRESSES } from "@/lib/email/project-pilot-profile";
import type { PlannedOutboxEntry, RiskAlertProjectConfig } from "./types";

export function shouldAssumeRiskAlertsEnabledForDryRun(input: {
  dryRun: boolean;
  requestedProjectId: string | null | undefined;
  projectId: string;
  pilotProjectId: string | null;
}): boolean {
  if (!input.dryRun) return false;
  const requested = (input.requestedProjectId ?? "").trim().toLowerCase();
  if (!requested || !input.pilotProjectId) return false;
  const pilot = input.pilotProjectId.trim().toLowerCase();
  return requested === pilot && input.projectId.trim().toLowerCase() === pilot;
}

/** Config usada só para planejar no dry-run; nunca é gravada. */
export function dryRunEffectiveConfig(config: RiskAlertProjectConfig | null, assumeEnabled: boolean): RiskAlertProjectConfig | null {
  if (!config || !assumeEnabled) return config;
  return { ...config, riskAlertsEnabled: true };
}

export interface CycleDryRunPreviewItem {
  idempotencyKey: string;
  type: string;
  level: string | null;
  riskLevel: string;
  recipientUserId: string;
  recipientStatus: string;
  suppressionReason: string;
  summary: Record<string, unknown>;
  /** Código visível do caso (quando já persistido). */
  visibleCode: string | null;
  /** P1..Pn = participante do piloto na ordem fixa do código; FORA_DO_PILOTO caso contrário. */
  recipientLabel: string;
  /** Política de entrega do piloto verificada sem rede: To = o próprio participante, Cc = caixa institucional. */
  delivery: { toIsOwnParticipant: boolean; cc: string; forbiddenAddress: boolean; ok: boolean };
}

export function buildCycleDryRunPreviewItem(
  entry: PlannedOutboxEntry,
  context: { visibleCodeByCaseId: Map<string, string>; pilotParticipants: readonly string[] | null }
): CycleDryRunPreviewItem {
  const email = (entry.recipient.email ?? "").trim().toLowerCase();
  const participants = (context.pilotParticipants ?? []).map((p) => p.trim().toLowerCase());
  const index = email ? participants.indexOf(email) : -1;
  const forbiddenAddress = (PILOT_FORBIDDEN_ADDRESSES as readonly string[]).includes(email);
  const toIsOwnParticipant = index >= 0 && !forbiddenAddress;
  return {
    idempotencyKey: entry.idempotencyKey,
    type: entry.notificationType,
    level: entry.escalationLevel,
    riskLevel: entry.riskLevel,
    recipientUserId: entry.recipient.userId,
    recipientStatus: entry.recipient.status,
    suppressionReason: entry.recipient.suppressionReason ?? "DRY_RUN",
    summary: entry.payloadSummary,
    visibleCode: entry.caseKey ? context.visibleCodeByCaseId.get(entry.caseKey) ?? null : null,
    recipientLabel: index >= 0 ? `P${index + 1}` : "FORA_DO_PILOTO",
    delivery: { toIsOwnParticipant, cc: ACC_PILOT_INSTITUTIONAL_ADDRESS, forbiddenAddress, ok: toIsOwnParticipant },
  };
}
