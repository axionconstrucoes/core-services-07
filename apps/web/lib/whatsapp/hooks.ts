// Ganchos do WhatsApp (simulado) nos dois pontos em que um escalonamento à DIRETORIA é aplicado. Ficam aqui, fora dos módulos
// pesados do ciclo e das Server Actions, para serem testáveis com um notificador falso. O notificador real nunca lança.

import type { DirectorateWhatsappInput } from "./notify-directorate";

export type DirectorateNotifier = (input: DirectorateWhatsappInput) => Promise<unknown>;

/** Ciclo de alertas de risco: chamado após o e-mail do escalonamento ser ENVIADO (outbox ESCALATION). */
export async function runCycleEscalationHook(
  args: {
    notificationType: string;
    escalationLevel: string | null;
    riskLevel?: string;
    /** `<sourceType>:<sourceId>:ESCALATION:<nível>:<usuário>` */
    idempotencyKey: string;
    projectId: string;
    projectName: string;
    recipientUserId: string;
    caseId: string | null;
    baseUrl: string;
    subject: string;
  },
  notify: DirectorateNotifier
): Promise<boolean> {
  if (args.notificationType !== "ESCALATION" || args.escalationLevel !== "DIRETORIA" || args.riskLevel !== "CRITICAL") return false;
  const marker = ":ESCALATION:";
  const at = args.idempotencyKey.indexOf(marker);
  const sourceKey = at >= 0 ? args.idempotencyKey.slice(0, at) : args.idempotencyKey;
  const separator = sourceKey.indexOf(":");
  await notify({
    projectId: args.projectId,
    projectName: args.projectName,
    recipientUserId: args.recipientUserId,
    sourceType: separator > 0 ? sourceKey.slice(0, separator) : "RISK_ALERT",
    sourceId: separator > 0 ? sourceKey.slice(separator + 1) : sourceKey,
    riskLevel: args.riskLevel,
    newLevel: args.escalationLevel,
    alertTitle: args.subject,
    alertUrl: args.caseId ? `${args.baseUrl}/${args.projectId}/alertas/${args.caseId}` : args.baseUrl,
  });
  return true;
}

/** Botão "Verificar escalonamentos": só para ações NÃO vinculadas a alerta de risco (essas seguem pela outbox e pelo ciclo). */
export async function runManualEscalationHook(
  args: {
    projectId: string;
    projectName: string | null;
    recipientUserId: string | null;
    actionId: string;
    actionTitle: string;
    actionUrl: string;
    riskLevel: string;
    newLevel: string;
  },
  notify: DirectorateNotifier
): Promise<boolean> {
  if (!args.projectName || !args.recipientUserId || args.riskLevel !== "CRITICAL" || args.newLevel !== "DIRETORIA") return false;
  await notify({
    projectId: args.projectId,
    projectName: args.projectName,
    recipientUserId: args.recipientUserId,
    sourceType: "SLA_ACTION",
    sourceId: args.actionId,
    riskLevel: args.riskLevel,
    newLevel: args.newLevel,
    alertTitle: args.actionTitle,
    alertUrl: args.actionUrl,
  });
  return true;
}
