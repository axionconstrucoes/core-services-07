// Fase 5/A — regra de elegibilidade da amostra. SEM filtro por palavra-chave: só participantes e período.
import { hasParticipantInDomain } from "./participants.mjs";

/** Regra do piloto WEG: qualquer participante (from/to/cc/bcc) no domínio exato weg.net. */
export const WEG_RULE = Object.freeze({ id: "WEG_ANY_PARTICIPANT_V1", kind: "ANY_PARTICIPANT_DOMAIN", domain: "weg.net" });

/** @returns {{eligible:boolean, reason:string|null}} reason ∈ NO_PARTICIPANTS | RULE_NOT_MATCHED | OUT_OF_PERIOD */
export function evaluateEligibility(message, rule, period = null) {
  const p = { from: message.from ?? [], to: message.to ?? [], cc: message.cc ?? [], bcc: message.bcc ?? [] };
  if (p.from.length + p.to.length + p.cc.length + p.bcc.length === 0) return { eligible: false, reason: "NO_PARTICIPANTS" };
  if (period) {
    const t = Date.parse(message.sentAt);
    if (!Number.isFinite(t) || t < Date.parse(period.start) || t > Date.parse(period.end)) return { eligible: false, reason: "OUT_OF_PERIOD" };
  }
  if (rule.kind === "ANY_PARTICIPANT_DOMAIN" && !hasParticipantInDomain(p, rule.domain)) return { eligible: false, reason: "RULE_NOT_MATCHED" };
  return { eligible: true, reason: null };
}
