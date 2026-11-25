"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { EmailSendError } from "@/lib/email/email-provider";
import { prepareRecipient } from "@/lib/email/external-recipient";
import {
  DuplicateNotificationError,
  sendActionRequestNotification,
} from "@/lib/email/send-action-request-notification";
import { issueEmailAlertActionButtons } from "@/lib/email-actions/issue-tokens";
import {
  escapeHtml,
  renderEmailActionButtonsHtml,
  renderEmailActionButtonsText,
} from "@/lib/email-actions/render-buttons";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`Campo obrigatório ausente: ${key}`);
  }

  return value;
}

// sendActionRequestNotification já resolve auth + membership via RLS
// (createSupabaseServerClient) antes de tocar o admin client — nunca
// duplicamos essa checagem aqui. Falhas conhecidas (já enviada / falha de
// envio) não derrubam a página: o estado real já foi persistido pelo core,
// e o redirect abaixo faz a página renderizar de novo a partir do banco.
export async function sendActionRequestEmailAction(formData: FormData) {
  const projectId = getRequiredString(formData, "projectId");
  const actionRequestId = getRequiredString(formData, "actionRequestId");
  const rawRecipientEmail = String(formData.get("recipientEmail") ?? "");
  const subject = getRequiredString(formData, "subject");
  const body = getRequiredString(formData, "body");

  // Destinatário: validação e normalização NO SERVIDOR; domínio externo (fora da lista da Axion) exige confirmação explícita + motivo,
  // gravados na trilha append-only ANTES de qualquer solicitação. Falhou => nada é emitido nem enviado (fail-closed).
  const prepared = await prepareRecipient({
    projectId,
    context: "SOLICITACAO_ACAO",
    entityType: "ACTION_REQUEST",
    entityId: UUID_RE.test(actionRequestId) ? actionRequestId : null,
    email: rawRecipientEmail,
    confirmed: formData.get("externalConfirm") === "on",
    reason: String(formData.get("externalReason") ?? ""),
  });
  if (!prepared.ok) {
    redirect(`/${projectId}/action-requests/${actionRequestId}?destinatario=${encodeURIComponent(prepared.code)}`);
  }
  const recipientEmail = prepared.email;

  // Botões de ação (DAR CIÊNCIA/ASSUMIR RESPONSABILIDADE/DEFINIR PRAZO/
  // RESPONDER AO ACC) são só um acréscimo ao corpo — mesma infraestrutura
  // central usada pelos outros dois fluxos de e-mail (nunca duplicada).
  // Fail-closed só para os links: se a emissão falhar (ex.: base URL de
  // e-mails não configurada), a notificação continua sendo enviada sem
  // eles, nunca com um link quebrado — nunca bloqueia o fluxo existente
  // por causa desta feature nova.
  let bodyWithActions = body;
  // HTML opcional (multipart/alternative, ver action-request-notification-core.ts)
  // com os mesmos botões como <a> reais — nunca reduz o que o texto puro
  // já tinha: bodyWithActions (texto) continua completo nos dois casos,
  // htmlBody é só um acréscimo quando há botões para oferecer.
  let htmlBody: string | null = null;
  try {
    const buttons = await issueEmailAlertActionButtons({
      projectId,
      alertKind: "ACTION_REQUEST",
      alertId: actionRequestId,
      intendedRecipientEmail: recipientEmail,
    });
    const actionsText = renderEmailActionButtonsText(buttons);
    if (actionsText) {
      bodyWithActions = `${body}\n\n---\nAções disponíveis:\n${actionsText}`;
      const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");
      htmlBody = `<div style="font-family:sans-serif;font-size:14px;color:#000000;">${bodyHtml}</div><div style="margin-top:16px;">${renderEmailActionButtonsHtml(buttons)}</div>`;
    }
  } catch {
    // Ver comentário acima — nunca impede o envio da notificação em si.
  }

  try {
    await sendActionRequestNotification({
      actionRequestId,
      recipientEmail,
      subject,
      body: bodyWithActions,
      htmlBody,
    });
  } catch (error) {
    if (!(error instanceof DuplicateNotificationError) && !(error instanceof EmailSendError)) {
      throw error;
    }
  }

  revalidatePath(`/${projectId}/action-requests/${actionRequestId}`);
  redirect(`/${projectId}/action-requests/${actionRequestId}`);
}
