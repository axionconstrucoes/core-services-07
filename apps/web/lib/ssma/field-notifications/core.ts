// Notificações por e-mail dos registros de campo SSMA (trilha B): registro CRÍTICO e ação corretiva em ATRASO.
// Módulo PURO e testável: armazenamento (DeliveryStore), envio (Mailer) e auditoria (audit) são injetados.
//
// Garantias:
//  - sem duplicidade: uma linha por (registro, evento, data-do-evento, destinatário) — o banco impõe a unicidade;
//    reenvio da mesma solicitação (fila offline, cron, duas abas) nunca envia dois e-mails ao mesmo destinatário;
//  - falha visível: a entrega vira FAILED com o motivo (sem texto bruto de provedor/segredo) e é tentada de novo
//    nas próximas execuções até MAX_ATTEMPTS; ausência de destinatário vira uma linha SUPPRESSED (NO_RECIPIENT)
//    + auditoria — nunca silêncio;
//  - concorrência: a entrega é "reivindicada" (lease) antes do envio; duas execuções simultâneas não enviam duas vezes;
//  - as travas do piloto (modo piloto, destinatário único, perfil de projeto) são aplicadas DENTRO do provedor de e-mail.

export type FieldNotificationEvent = "CRITICAL_RECORD" | "ACTION_OVERDUE";

export const MAX_ATTEMPTS = 5;
export const NO_RECIPIENT_PLACEHOLDER = "(sem destinatário)";
/** Áreas de membros que recebem avisos de SSMA (as mesmas áreas já usadas pelo aviso de acidente: Engenharia e SSMA/ESG). */
export const RECIPIENT_AREAS = ["ENGENHARIA", "ESG_SSMA"] as const;

export interface MemberCandidate {
  userId: string;
  name: string | null;
  email: string | null;
  area: string | null;
  permission: string;
  status: string;
}

export interface Recipient {
  userId: string;
  name: string | null;
  email: string;
}

export interface RecipientResolution {
  recipients: Recipient[];
  /** Membros elegíveis sem e-mail cadastrado (aparece no aviso visível). */
  withoutEmail: number;
}

/**
 * Quem recebe:
 *  - registro CRÍTICO: membros ATIVOS (exceto LEITURA) das áreas Engenharia/SSMA-ESG + o responsável pela ação corretiva;
 *  - ação em ATRASO: o responsável + membros ATIVOS (exceto LEITURA) da área SSMA/ESG.
 */
export function resolveRecipients(input: { event: FieldNotificationEvent; responsibleUserId: string | null; members: readonly MemberCandidate[] }): RecipientResolution {
  const eligible = input.members.filter((m) => m.status === "ACTIVE" && m.permission !== "LEITURA");
  const chosen = eligible.filter((m) => {
    if (input.responsibleUserId && m.userId === input.responsibleUserId) return true;
    if (input.event === "CRITICAL_RECORD") return m.area !== null && (RECIPIENT_AREAS as readonly string[]).includes(m.area);
    return m.area === "ESG_SSMA";
  });
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let withoutEmail = 0;
  for (const m of chosen) {
    const email = (m.email ?? "").trim().toLowerCase();
    if (!email) { withoutEmail += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ userId: m.userId, name: m.name, email });
  }
  return { recipients, withoutEmail };
}

export interface DeliveryRow {
  id: string;
  status: "PENDING" | "SENT" | "FAILED" | "SUPPRESSED";
  attemptCount: number;
}

export interface DeliveryKey {
  projectId: string;
  recordId: string;
  actionId: string | null;
  event: FieldNotificationEvent;
  /** AAAA-MM-DD: dia do fato (CRITICAL_RECORD) ou prazo da ação (ACTION_OVERDUE). */
  eventDate: string;
}

export interface DeliveryStore {
  /** Cria a entrega PENDING se não existir (por chave única) e devolve a linha vigente. */
  ensureDelivery(key: DeliveryKey, recipient: { email: string; name: string | null }): Promise<DeliveryRow>;
  /** Linha SUPPRESSED sem destinatário (idempotente). */
  ensureSuppressed(key: DeliveryKey, reason: "NO_RECIPIENT" | "EMAIL_MISSING"): Promise<void>;
  /** Reivindica a entrega para envio (PENDING/FAILED sem lease vigente). Só uma execução ganha. */
  claim(id: string): Promise<boolean>;
  markSent(id: string, result: { providerMessageId: string | null; sentAt: string }): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  deliver(input: { to: string; name: string | null; content: MailContent; projectId: string; correlationId: string }): Promise<{ providerMessageId: string | null; sentAt: string }>;
}

export interface NotifyDeps {
  store: DeliveryStore;
  mailer: Mailer;
  /** Auditoria do sistema (actor_type SYSTEM, actor_label NULL). Falha de auditoria nunca derruba o envio. */
  audit: (entry: { projectId: string; action: string; entityId: string; detail: string }) => Promise<void>;
  newCorrelationId?: () => string;
}

export interface NotifySummary {
  sent: number;
  failed: number;
  /** Já enviados antes (reenvio da mesma solicitação): nada foi enviado de novo. */
  alreadySent: number;
  /** Outra execução está enviando agora ou o limite de tentativas foi atingido. */
  skipped: number;
  noRecipient: boolean;
  withoutEmail: number;
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  // Sem endereços, tokens ou texto bruto do provedor: só uma mensagem curta e limpa.
  const cleaned = raw.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]").replace(/\b(?:ya29|1\/\/)[\w./-]+/g, "[token]").replace(/\s+/g, " ").trim();
  return (cleaned || "Falha ao enviar o e-mail.").slice(0, 300);
}

export async function notifyEvent(
  deps: NotifyDeps,
  input: { key: DeliveryKey; recipients: readonly Recipient[]; withoutEmail?: number; content: (recipient: Recipient) => MailContent; entityLabel: string }
): Promise<NotifySummary> {
  const summary: NotifySummary = { sent: 0, failed: 0, alreadySent: 0, skipped: 0, noRecipient: false, withoutEmail: input.withoutEmail ?? 0 };
  const newId = deps.newCorrelationId ?? (() => crypto.randomUUID());
  const auditSafe = async (action: string, detail: string) => {
    try { await deps.audit({ projectId: input.key.projectId, action, entityId: input.key.recordId, detail }); } catch { /* auditoria não derruba o envio */ }
  };

  if (input.recipients.length === 0) {
    summary.noRecipient = true;
    await deps.store.ensureSuppressed(input.key, input.withoutEmail ? "EMAIL_MISSING" : "NO_RECIPIENT");
    await auditSafe(
      "SSMA_FIELD_NOTIFICATION_TARGET_NOT_CONFIGURED",
      `Sem destinatário para ${input.entityLabel} (${input.key.event}): nenhum membro ativo elegível com e-mail${input.withoutEmail ? ` (${input.withoutEmail} sem e-mail cadastrado)` : ""}.`
    );
    return summary;
  }

  for (const recipient of input.recipients) {
    const row = await deps.store.ensureDelivery(input.key, { email: recipient.email, name: recipient.name });
    if (row.status === "SENT") { summary.alreadySent += 1; continue; }
    if (row.status === "SUPPRESSED" || row.attemptCount >= MAX_ATTEMPTS) { summary.skipped += 1; continue; }
    if (!(await deps.store.claim(row.id))) { summary.skipped += 1; continue; }
    try {
      const result = await deps.mailer.deliver({ to: recipient.email, name: recipient.name, content: input.content(recipient), projectId: input.key.projectId, correlationId: newId() });
      await deps.store.markSent(row.id, result);
      summary.sent += 1;
    } catch (error) {
      await deps.store.markFailed(row.id, safeErrorMessage(error));
      summary.failed += 1;
    }
  }

  if (summary.failed > 0) {
    await auditSafe("SSMA_FIELD_NOTIFICATION_FAILED", `${summary.failed} falha(s) ao notificar ${input.entityLabel} (${input.key.event}); ${summary.sent} enviada(s). Nova tentativa automática.`);
  } else if (summary.sent > 0) {
    await auditSafe("SSMA_FIELD_NOTIFICATION_SENT", `${summary.sent} aviso(s) enviado(s) para ${input.entityLabel} (${input.key.event}).`);
  }
  return summary;
}

/** Dia (AAAA-MM-DD) no fuso da obra. */
export function saoPauloDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Ação em atraso: prazo anterior a hoje e ainda não concluída (mesma regra de isActionOverdue). */
export function isOverdue(action: { status: string; dueDate: string }, today: string): boolean {
  return action.status !== "CONCLUIDA" && action.dueDate < today;
}
