// Decisão pura: o WhatsApp só é considerado para alertas CRÍTICOS que acabam de chegar à DIRETORIA, com contato
// cadastrado, telefone internacional válido e canal autorizado. Tudo o mais é pulado com um motivo explícito.

import { normalizeInternationalPhone } from "./phone";

export type WhatsappSkipReason =
  | "DISABLED"
  | "PROVIDER_UNSUPPORTED"
  | "NOT_CRITICAL"
  | "NOT_DIRECTORATE"
  | "NO_CONTACT"
  | "NOT_ACTIVE_MEMBER"
  | "NOT_DIRECTORATE_MEMBER"
  | "CHANNEL_NOT_AUTHORIZED"
  | "INVALID_PHONE";

/** Contato da PESSOA + elegibilidade resolvida no momento do envio (vínculo ativo com o projeto e papel de Diretoria). */
export interface WhatsappContact {
  phoneE164: string | null;
  channelAuthorized: boolean;
  activeMember: boolean;
  diretoriaMember: boolean;
}

export type WhatsappDecision = { send: true; phoneE164: string } | { send: false; reason: WhatsappSkipReason };

export function decideDirectorateWhatsapp(input: {
  enabled: boolean;
  riskLevel: string;
  newLevel: string;
  contact: WhatsappContact | null;
}): WhatsappDecision {
  if (!input.enabled) return { send: false, reason: "DISABLED" };
  if (input.riskLevel !== "CRITICAL") return { send: false, reason: "NOT_CRITICAL" };
  if (input.newLevel !== "DIRETORIA") return { send: false, reason: "NOT_DIRECTORATE" };
  if (!input.contact || !input.contact.phoneE164) return { send: false, reason: "NO_CONTACT" };
  if (!input.contact.activeMember) return { send: false, reason: "NOT_ACTIVE_MEMBER" };
  if (!input.contact.diretoriaMember) return { send: false, reason: "NOT_DIRECTORATE_MEMBER" };
  if (!input.contact.channelAuthorized) return { send: false, reason: "CHANNEL_NOT_AUTHORIZED" };
  const phone = normalizeInternationalPhone(input.contact.phoneE164);
  if (!phone) return { send: false, reason: "INVALID_PHONE" };
  return { send: true, phoneE164: phone };
}
