import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";

import { issueItemReplyMailto } from "@/lib/email-replies/issue-item-reply-mailto";
import { createSupabaseEmailReplyTokenStore } from "@/lib/email-replies/reply-tokens";

import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { ALERT_REPLY_MAILBOX_ENV } from "./alert-reply-address";
import { EmailSendError } from "./email-provider";
import { getEmailProvider } from "./get-email-provider";
import { resolveEffectiveRecipient } from "./pilot-outbound-guard";
import { buildWeeklyDigestFailureReason } from "./weekly-digest-failure-reason";
import {
  buildWeeklyAlertDigestEmail,
  type WeeklyAlertDigestEmailInput,
} from "./templates/weekly-alert-digest-template";

/**
 * Atalhos "Responder por e-mail" POR ITEM do resumo (WEEKLY_DIGEST_ITEM = weekly_alert_digest_items.id). O token é do
 * destinatário do resumo; o hash é gravado ANTES do envio. Qualquer falha => o item sai sem atalhos (formulário do ACC).
 */
async function withItemReplyMailto(digestId: string, projectId: string, email: WeeklyAlertDigestEmailInput): Promise<WeeklyAlertDigestEmailInput> {
  try {
    const admin = createSupabaseAdminClient();
    const mailbox = process.env[ALERT_REPLY_MAILBOX_ENV] ?? null;
    if (!mailbox) return email;
    const { data: digest } = await admin.from("weekly_alert_digests").select("id,project_id,recipient_user_id").eq("id", digestId).maybeSingle();
    if (!digest || digest.project_id !== projectId) return email;
    const { data: rows } = await admin.from("weekly_alert_digest_items").select("id,action_id,risk_level").eq("digest_id", digestId);
    const byAction = new Map(((rows ?? []) as Array<{ id: string; action_id: string; risk_level: string }>).map((r) => [r.action_id, r]));
    const store = createSupabaseEmailReplyTokenStore(admin);
    const nowIso = new Date().toISOString();
    const items = [];
    for (const item of email.items) {
      const row = byAction.get(item.actionId);
      const replyByEmail = row
        ? await issueItemReplyMailto({ store, mailbox, projectId, kind: "WEEKLY_DIGEST_ITEM", subjectId: row.id, recipientUserId: digest.recipient_user_id as string, severity: row.risk_level === "MEDIUM" ? "MEDIUM" : "LOW", nowIso })
        : null;
      items.push({ ...item, replyByEmail });
    }
    return { ...email, items };
  } catch {
    return email;
  }
}

export async function sendWeeklyAlertDigestEmail(input: {
  digestId: string;
  projectId: string;
  recipientEmail: string;
  email: WeeklyAlertDigestEmailInput;
}) {
  const { images, availability } = loadAccAlertLogos({ maroon: input.email.items.length > 0, inverted: false });
  const emailInput = input.email.items.some((item) => item.replyByEmail) ? input.email : await withItemReplyMailto(input.digestId, input.projectId, input.email);
  const built = buildWeeklyAlertDigestEmail({ ...emailInput, logos: availability });
  const signed = appendAccEmailSignature(built, images.length > 0, false);
  const resolvedRecipient = resolveEffectiveRecipient(input.recipientEmail);
  const correlationId = crypto.randomUUID();
  const provider = getEmailProvider();
  const admin = createSupabaseAdminClient();

  let sent;
  try {
    sent = await provider.send({
      to: input.recipientEmail,
      subject: built.subject,
      text: signed.text,
      html: signed.html,
      inlineImages: images.length > 0 ? images : undefined,
      correlationId,
      vera: { projectId: input.projectId, context: "alerta" },
    });
  } catch (error) {
    await admin
      .from("weekly_alert_digests")
      .update({ status: "FAILED", failure_reason: buildWeeklyDigestFailureReason(error) })
      .eq("id", input.digestId)
      .neq("status", "RESPONDED");

    if (error instanceof EmailSendError) throw error;
    throw new EmailSendError("Falha ao enviar o resumo semanal de alertas.");
  }

  // Marca como enviado antes dos registros auxiliares. Assim, uma falha
  // de auditoria depois que o Gmail aceitou a mensagem nunca provoca um
  // segundo e-mail na repetição do agendador.
  const { error: digestError } = await admin
    .from("weekly_alert_digests")
    .update({
      status: "SENT",
      effective_recipient_email: resolvedRecipient.effectiveRecipientEmail,
      provider_message_id: sent.providerMessageId,
      sent_at: sent.sentAt,
      failure_reason: null,
    })
    .eq("id", input.digestId)
    .in("status", ["PENDING", "FAILED"]);

  if (digestError) {
    throw new EmailSendError("O e-mail foi aceito pelo provedor, mas o registro do envio falhou.");
  }

  await admin.from("emails").insert({
    project_id: input.projectId,
    from_address: sent.from,
    to_address: input.recipientEmail,
    subject: built.subject,
    sent_at: sent.sentAt,
    snippet: built.text.slice(0, 280),
  });

  await admin.from("audit_log_entries").insert({
    project_id: input.projectId,
    actor_type: "SYSTEM",
    actor_user_id: null,
    actor_label: null,
    action: "WEEKLY_ALERT_DIGEST_SENT",
    entity_type: "WEEKLY_ALERT_DIGEST",
    entity_id: input.digestId,
    detail: `Resumo semanal enviado com ${built.mediumCount} risco(s) médio(s) e ${built.lowCount} risco(s) baixo(s).`,
  });

  return sent;
}
