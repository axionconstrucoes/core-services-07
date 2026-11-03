// Orquestração do WhatsApp (simulado) para alerta CRÍTICO que chega à DIRETORIA. Sem I/O próprio: tudo entra por `deps`,
// então o comportamento é testável sem rede e sem banco. Com o canal desligado (padrão) retorna antes de qualquer consulta.

import { getWhatsappConfig } from "./config";
import { decideDirectorateWhatsapp, type WhatsappContact, type WhatsappSkipReason } from "./decide";
import { maskPhone } from "./phone";
import type { WhatsappProvider } from "./simulated-provider";

export interface DirectorateWhatsappInput {
  projectId: string;
  projectName: string;
  recipientUserId: string;
  /** Mesma origem da outbox de e-mail do escalonamento (ex.: SLA_ACTION + id da ação). */
  sourceType: string;
  sourceId: string;
  riskLevel: string;
  newLevel: string;
  alertTitle: string;
  alertUrl: string;
}

export interface WhatsappLogRow {
  projectId: string;
  recipientUserId: string;
  sourceType: string;
  sourceId: string;
  status: "SIMULATED" | "SKIPPED";
  skipReason: WhatsappSkipReason | null;
  phoneMasked: string | null;
  messagePreview: string | null;
  idempotencyKey: string;
}

export interface DirectorateWhatsappDeps {
  env?: Record<string, string | undefined>;
  loadContact: (projectId: string, userId: string) => Promise<WhatsappContact | null>;
  /** Grava o registro de forma idempotente; devolve inserted=false se a chave já existia (nada é reenviado). */
  record: (row: WhatsappLogRow) => Promise<{ inserted: boolean }>;
  audit: (projectId: string, action: string, entityId: string, detail: string) => Promise<void>;
  provider: WhatsappProvider;
}

export type DirectorateWhatsappOutcome =
  | { outcome: "IGNORED"; reason: WhatsappSkipReason }
  | { outcome: "SKIPPED"; reason: WhatsappSkipReason }
  | { outcome: "ALREADY_PROCESSED" }
  | { outcome: "SIMULATED"; providerMessageId: string };

export function buildDirectorateWhatsappText(input: Pick<DirectorateWhatsappInput, "projectName" | "alertTitle" | "alertUrl">): string {
  return `ACC — Alerta CRÍTICO escalado à Diretoria em ${input.projectName}: ${input.alertTitle}. Acesse: ${input.alertUrl}`;
}

export async function notifyDirectorateWhatsapp(input: DirectorateWhatsappInput, deps: DirectorateWhatsappDeps): Promise<DirectorateWhatsappOutcome> {
  const config = getWhatsappConfig(deps.env);
  if (!config.enabled) return { outcome: "IGNORED", reason: config.reason };

  // Fora do escopo (não crítico / não Diretoria): decide sem consultar o banco e sem registrar nada.
  if (input.riskLevel !== "CRITICAL") return { outcome: "IGNORED", reason: "NOT_CRITICAL" };
  if (input.newLevel !== "DIRETORIA") return { outcome: "IGNORED", reason: "NOT_DIRECTORATE" };

  const idempotencyKey = `wa:${input.sourceType}:${input.sourceId}:ESCALATION:DIRETORIA:${input.recipientUserId}`;
  const contact = await deps.loadContact(input.projectId, input.recipientUserId);
  const decision = decideDirectorateWhatsapp({ enabled: true, riskLevel: input.riskLevel, newLevel: input.newLevel, contact });
  const base = { projectId: input.projectId, recipientUserId: input.recipientUserId, sourceType: input.sourceType, sourceId: input.sourceId, idempotencyKey };

  if (!decision.send) {
    const { inserted } = await deps.record({ ...base, status: "SKIPPED", skipReason: decision.reason, phoneMasked: contact?.phoneE164 ? maskPhone(contact.phoneE164) : null, messagePreview: null });
    if (!inserted) return { outcome: "ALREADY_PROCESSED" };
    await deps.audit(input.projectId, "WHATSAPP_ESCALATION_SKIPPED", input.sourceId, `WhatsApp (simulado) não enviado ao usuário ${input.recipientUserId}: ${decision.reason}.`);
    return { outcome: "SKIPPED", reason: decision.reason };
  }

  const text = buildDirectorateWhatsappText(input);
  const { inserted } = await deps.record({ ...base, status: "SIMULATED", skipReason: null, phoneMasked: maskPhone(decision.phoneE164), messagePreview: text });
  if (!inserted) return { outcome: "ALREADY_PROCESSED" };
  const sent = await deps.provider.dispatch({ to: decision.phoneE164, text, idempotencyKey });
  await deps.audit(input.projectId, "WHATSAPP_ESCALATION_SIMULATED", input.sourceId, `WhatsApp SIMULADO (nenhuma mensagem real) para ${maskPhone(decision.phoneE164)}, alerta CRÍTICO na Diretoria. Chave ${idempotencyKey}.`);
  return { outcome: "SIMULATED", providerMessageId: sent.providerMessageId };
}
