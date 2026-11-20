import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";

import { issueItemReplyMailto, slaReplyEligible, type ItemReplySeverity } from "@/lib/email-replies/issue-item-reply-mailto";
import { createSupabaseEmailReplyTokenStore } from "@/lib/email-replies/reply-tokens";
import type { ReplyMailtoLinks } from "@/lib/email-replies/reply-mailto";

import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { ALERT_REPLY_MAILBOX_ENV } from "./alert-reply-address";
import { EmailSendError } from "./email-provider";
import { getEmailProvider } from "./get-email-provider";
import { buildSlaEscalationEmail, type SlaEscalationEmailInput } from "./templates/sla-escalation-template";

export interface SendSlaEscalationEmailInput {
  projectId: string;
  actionId: string;
  recipientEmail: string;
  email: SlaEscalationEmailInput;
}

export interface SendSlaEscalationEmailResult {
  emailId: string;
  provider: string;
  providerMessageId: string;
  providerThreadId: string;
  messageIdHeader: string;
  sentAt: string;
}

/**
 * Envio do e-mail de escalonamento (seção 12) — chamado SOMENTE pelo
 * motor determinístico de SLA (ver
 * apps/web/app/[projectId]/acoes/actions.ts, processSlaEscalationsAction),
 * nunca por decisão de um Expert (seção 13: "O MOTOR DE SLA pode enviar
 * alertas automáticos determinísticos autorizados pelo sistema" — isso é
 * deliberadamente diferente de sendContractAlertEmail, que exige
 * confirmação humana explícita, porque aqui a autorização já é a regra
 * de SLA configurada, não uma decisão de conteúdo).
 *
 * Escreve em public.emails + audit_log_entries via admin client — mesmo
 * padrão de send-contract-alert-email.ts (nenhuma policy de INSERT
 * existe para essas tabelas sob RLS normal).
 */
/**
 * Atalhos "Responder por e-mail" (token POR ITEM, SLA_ACTION) para o destinatário do escalonamento — só quando ele pode
 * agir pela regra do banco (ver slaReplyEligible). Qualquer falha => null (o e-mail sai como antes, sem atalhos).
 */
async function slaReplyMailtoFor(input: SendSlaEscalationEmailInput): Promise<ReplyMailtoLinks | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: action } = await admin
      .from("sla_actions")
      .select("id,project_id,status,risk_level,responsible_user_id,related_ssma_corrective_action_id")
      .eq("id", input.actionId)
      .maybeSingle();
    if (!action || action.project_id !== input.projectId) return null;
    const { data: linked } = await admin.from("risk_alert_cases").select("id").eq("sla_action_id", input.actionId);
    const { data: profiles } = await admin.from("profiles").select("id,email").eq("email", input.recipientEmail.trim().toLowerCase());
    const recipient = (profiles ?? []).length === 1 ? (profiles as Array<{ id: string }>)[0] : null;
    const { data: membership } = recipient
      ? await admin.from("project_memberships").select("permission").eq("project_id", input.projectId).eq("user_id", recipient.id).eq("status", "ACTIVE").maybeSingle()
      : { data: null };
    if (!slaReplyEligible({ action, riskCaseLinked: (linked ?? []).length > 0, recipientUserId: recipient?.id ?? null, recipientPermission: (membership?.permission as string | undefined) ?? null })) return null;
    const severity = action.risk_level as ItemReplySeverity;
    return await issueItemReplyMailto({
      store: createSupabaseEmailReplyTokenStore(admin),
      mailbox: process.env[ALERT_REPLY_MAILBOX_ENV] ?? null,
      projectId: input.projectId,
      kind: "SLA_ACTION",
      subjectId: input.actionId,
      recipientUserId: recipient?.id ?? null,
      severity,
      nowIso: new Date().toISOString(),
      evidenceRequired: severity === "HIGH" || severity === "CRITICAL",
    });
  } catch {
    return null;
  }
}

export async function sendSlaEscalationEmail(
  input: SendSlaEscalationEmailInput
): Promise<SendSlaEscalationEmailResult> {
  const critical = input.email.severity === "CRITICA";
  const replyByEmail = input.email.replyByEmail ?? (await slaReplyMailtoFor(input));
  const { images, availability } = loadAccAlertLogos({ maroon: !critical, inverted: critical });
  const { subject, html, text } = buildSlaEscalationEmail({
    ...input.email,
    replyByEmail,
    code: input.actionId.slice(0, 8).toUpperCase(),
    logos: availability,
  });
  const signed = appendAccEmailSignature({ text, html }, images.length > 0, false);

  const provider = getEmailProvider();
  const correlationId = crypto.randomUUID();

  let sendResult;
  try {
    sendResult = await provider.send({
      to: input.recipientEmail,
      subject,
      text: signed.text,
      html: signed.html,
      inlineImages: images.length > 0 ? images : undefined,
      correlationId,
      vera: { projectId: input.projectId, context: "alerta" },
      pilot: { projectId: input.projectId, participantLabel: `Responsável do ${input.email.escalationLevelLabel}`, escalationLevel: input.email.escalationLevelLabel },
    });
  } catch (error) {
    if (error instanceof EmailSendError) {
      throw error;
    }
    throw new EmailSendError("Falha inesperada ao enviar e-mail de escalonamento.");
  }

  const admin = createSupabaseAdminClient();

  const { data: emailRow, error: emailInsertError } = await admin
    .from("emails")
    .insert({
      project_id: input.projectId,
      from_address: sendResult.from,
      to_address: input.recipientEmail,
      subject,
      sent_at: sendResult.sentAt,
      snippet: text.slice(0, 280),
    })
    .select("id")
    .single();

  if (emailInsertError) {
    throw emailInsertError;
  }

  const emailId = emailRow.id as string;

  const { error: auditError } = await admin.from("audit_log_entries").insert({
    project_id: input.projectId,
    // audit_log_entries exige actor_label IS NULL para SYSTEM (constraint de
    // 20260819195713; mesma correção aplicada às triggers em 20260822060313).
    // Um label não nulo faria o INSERT falhar DEPOIS do e-mail já enviado.
    actor_type: "SYSTEM",
    actor_user_id: null,
    actor_label: null,
    action: "ACTION_ESCALATED",
    entity_type: "SLA_ACTION",
    entity_id: input.actionId,
    detail: `E-mail de escalonamento enviado para ${input.recipientEmail}.`,
  });

  if (auditError) {
    throw auditError;
  }

  return {
    emailId,
    provider: sendResult.provider,
    providerMessageId: sendResult.providerMessageId,
    providerThreadId: sendResult.providerThreadId,
    messageIdHeader: sendResult.messageIdHeader,
    sentAt: sendResult.sentAt,
  };
}
