import "server-only";

import { google } from "googleapis";
import {
  EmailSendError,
  type EmailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from "./email-provider";
import { classifyGmailSendError, formatGmailSendDiagnostic, responseWithoutIdDiagnostic, type GmailSendDiagnostic } from "./gmail-send-error";
import { loadGmailConfig, loadGmailPilotSenderConfig, type GmailConfig } from "./gmail-auth";
import { base64UrlEncode, buildMimeMessage } from "./mime-message";
import { applyVeraEmailHeader } from "./branding/vera-email-header";
import { assertOnlyRecipient } from "./only-recipient-guard";
import { assertPilotMimeRecipients } from "./project-pilot-profile";
import { prepareOutboundMessage } from "./outbound-routing";

export { base64UrlEncode, buildMimeMessage };

const GMAIL_SEND_TIMEOUT_MS = 20_000;

/** Registra (sanitizado) e devolve o erro de envio com o diagnóstico seguro anexado. Falha FECHADA: nunca vira sucesso. */
function sendFailure(diagnostic: GmailSendDiagnostic): EmailSendError {
  const text = formatGmailSendDiagnostic(diagnostic);
  console.error(`[GmailEmailProvider] falha ao enviar via Gmail API. ${text}`);
  return new EmailSendError(`GmailEmailProvider: falha ao enviar via Gmail API. ${text}`, { ...diagnostic });
}

// Usa OAuth2 da mailbox técnica dedicada (scope gmail.send).
// Não executa consent flow, não armazena refresh token em DB,
// não descobre credenciais e falha fechado (loadGmailConfig)
// se a configuração estiver incompleta.
export class GmailEmailProvider implements EmailProvider {
  private readonly config: GmailConfig;

  constructor() {
    this.config = loadGmailConfig();
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    // Obrigatório e incondicional — antes de qualquer credencial, MIME
    // ou chamada de rede. Nenhuma instanciação direta desta classe
    // escapa da trava do piloto.
    // Perfil do PROJETO PILOTO (project-pilot-profile.ts): destino e remetente fixos, sem CC/BCC; outros projetos passam intocados.
    const routing = prepareOutboundMessage(input);
    const guardedInput = assertOnlyRecipient(applyVeraEmailHeader(routing.input), undefined, undefined, routing.to);

    // Mensagem do piloto só sai pela identidade do remetente do piloto — nunca pelo remetente padrão, nunca só trocando o From.
    let config = this.config;
    // Se o remetente padrão JÁ é o remetente resolvido (mesma conta autenticada), usa a configuração padrão; senão exige a identidade própria
    // DAQUELE remetente (ACC institucional ou participante autorizado). Sem credencial: bloqueia — nunca envia por outra identidade.
    if (routing.routed && this.config.senderEmail.trim().toLowerCase() !== routing.sender) {
      try {
        config = loadGmailPilotSenderConfig(routing.sender as string);
      } catch {
        throw new EmailSendError("GmailEmailProvider: identidade do remetente do piloto não configurada — envio bloqueado antes de qualquer chamada de rede.");
      }
    }
    if (routing.routed && config.senderEmail.trim().toLowerCase() !== routing.sender) {
      throw new EmailSendError("GmailEmailProvider: identidade autenticada diferente do remetente resolvido — envio bloqueado antes de qualquer chamada de rede.");
    }

    const senderDomain =
      config.senderEmail.split("@")[1] ?? "axion.local";

    const messageIdHeader = `<${guardedInput.correlationId}@${senderDomain}>`;

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret
    );

    oauth2Client.setCredentials({
      refresh_token: config.refreshToken,
    });

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const mime = buildMimeMessage(guardedInput, config.senderEmail, messageIdHeader, { displayName: routing.routed ? routing.senderDisplayName : undefined });
    // Transporte final: From = remetente resolvido, To = o colaborador, Cc = cópia institucional, nenhum Bcc, nenhum endereço proibido.
    if (routing.routed) assertPilotMimeRecipients(mime, routing.sender as string, routing.to as string, routing.cc);
    const raw = base64UrlEncode(mime);

    let providerMessageId: string | null | undefined;
    let providerThreadId: string | null | undefined;

    try {
      const response = await gmail.users.messages.send(
        {
          userId: "me",
          requestBody: {
            raw,
          },
        },
        // Sem timeout o SDK pode ficar pendurado até o limite da função; timeout => resultado INCERTO (classificado abaixo).
        { timeout: GMAIL_SEND_TIMEOUT_MS }
      );

      providerMessageId = response.data.id;
      providerThreadId = response.data.threadId;
    } catch (error) {
      // Log e last_error propositalmente sanitizados: só a allowlist de gmail-send-error.ts (status HTTP, código da API,
      // motivo normalizado, classe e id de correlação). Nunca o erro bruto do SDK (pode conter Authorization/requisição/MIME).
      throw sendFailure(classifyGmailSendError(error));
    }

    if (!providerMessageId || !providerThreadId) {
      throw sendFailure(responseWithoutIdDiagnostic());
    }

    return {
      provider: "GMAIL",
      from: config.senderEmail,
      providerMessageId,
      providerThreadId,
      messageIdHeader,
      sentAt: new Date().toISOString(),
      ...(routing.routed ? { to: routing.to as string, cc: routing.cc } : {}),
    };
  }
}