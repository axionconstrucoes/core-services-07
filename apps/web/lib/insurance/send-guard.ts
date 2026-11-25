// TRAVA FAIL-CLOSED contra envio real de comunicações de seguros/garantias (fase 1).
// Nenhum caminho deste módulo envia nada. Mesmo com flag ligada, aprovação e canal verificado, o resultado é BLOQUEADO
// porque a fase 1 não possui transporte de envio. Espelha insurance_draft_attempt_send (SQL).
import type { DraftState } from "./types";

/** Constante de fase: só muda por decisão explícita do dono, junto com um transporte homologado (fase futura). */
export const INSURANCE_REAL_SEND_TRANSPORT_AVAILABLE = false as const;
export const INSURANCE_REAL_SEND_ENV_FLAG = "ACC_INSURANCE_REAL_SEND_ENABLED";

/** Flag: desligada por padrão; só o literal "true" liga (qualquer outro valor, ausência ou erro = desligada). */
export function isRealSendFlagOn(env: Record<string, string | undefined>): boolean {
  return env[INSURANCE_REAL_SEND_ENV_FLAG] === "true";
}

export interface SendAttemptInput {
  flagEnabled: boolean;
  draftState: DraftState;
  approvedBodyHash: string | null;
  bodyHash: string;
  channel: { registered: boolean; active: boolean; verified: boolean } | null;
}
export type SendBlockReason =
  | "FLAG_OFF"
  | "NOT_APPROVED"
  | "APPROVAL_STALE"
  | "NO_OFFICIAL_CHANNEL"
  | "CHANNEL_NOT_VERIFIED"
  | "PHASE1_NO_SEND_TRANSPORT";

export interface SendAttemptResult {
  sent: false;
  blocked: true;
  reasons: SendBlockReason[];
}

export function evaluateSendAttempt(i: SendAttemptInput): SendAttemptResult {
  const reasons: SendBlockReason[] = [];
  if (!i.flagEnabled) reasons.push("FLAG_OFF");
  if (i.draftState !== "APROVADA_PARA_ENVIO") reasons.push("NOT_APPROVED");
  else if (i.approvedBodyHash !== i.bodyHash) reasons.push("APPROVAL_STALE");
  if (!i.channel || !i.channel.registered || !i.channel.active) reasons.push("NO_OFFICIAL_CHANNEL");
  else if (!i.channel.verified) reasons.push("CHANNEL_NOT_VERIFIED");
  if (!INSURANCE_REAL_SEND_TRANSPORT_AVAILABLE) reasons.push("PHASE1_NO_SEND_TRANSPORT");
  return { sent: false, blocked: true, reasons };
}

export class RealSendBlockedError extends Error {
  constructor(message = "Envio real de comunicação de seguros/garantias está bloqueado nesta fase.") {
    super(message);
    this.name = "RealSendBlockedError";
  }
}
/** Qualquer futuro adaptador de envio deve começar por aqui. Hoje sempre lança. */
export function assertRealSendAllowed(): never {
  throw new RealSendBlockedError();
}
/** Envolve um emissor: o emissor NUNCA é chamado nesta fase. */
export async function guardedSend<T>(sender: () => Promise<T>): Promise<never> {
  void sender;
  throw new RealSendBlockedError();
}
