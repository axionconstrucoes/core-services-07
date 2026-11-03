import "server-only";

import { google } from "googleapis";
import {
  EmailSendError,
  type EmailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from "./email-provider";
import { loadGmailConfig, loadGmailPilotSenderConfig, type GmailConfig } from "./gmail-auth";
import { base64UrlEncode, buildMimeMessage } from "./mime-message";
import { applyPilotOutboundGuard } from "./pilot-outbound-guard";
import { applyVeraEmailHeader } from "./branding/vera-email-header";
import { assertOnlyRecipient } from "./only-recipient-guard";
import { applyProjectPilotProfile, assertPilotMimeRecipients } from "./project-pilot-profile";

export { base64UrlEncode, buildMimeMessage };

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
    const routing = applyProjectPilotProfile(applyPilotOutboundGuard(input));
    const guardedInput = assertOnlyRecipient(applyVeraEmailHeader(routing.input), undefined, undefined, routing.destination);

    // Mensagem do piloto só sai pela identidade do remetente do piloto — nunca pelo remetente padrão, nunca só trocando o From.
    let config = this.config;
    // Se o remetente padrão JÁ é o remetente do piloto (mesma conta autenticada), usa a configuração padrão; senão exige a identidade própria.
    if (routing.routed && this.config.senderEmail.trim().toLowerCase() !== routing.sender) {
      try {
        config = loadGmailPilotSenderConfig(routing.sender as string);
      } catch {
        throw new EmailSendError("GmailEmailProvider: remetente do piloto não configurado — envio bloqueado antes de qualquer chamada de rede.");
      }
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

    const mime = buildMimeMessage(guardedInput, config.senderEmail, messageIdHeader);
    // Transporte final: Para = destino único, From = remetente do piloto, nenhum Cc/Bcc — conferido sobre o MIME já montado.
    if (routing.routed) assertPilotMimeRecipients(mime, routing.sender as string, routing.destination as string);
    const raw = base64UrlEncode(mime);

    let providerMessageId: string | null | undefined;
    let providerThreadId: string | null | undefined;

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
        },
      });

      providerMessageId = response.data.id;
      providerThreadId = response.data.threadId;
    } catch {
      // Log propositalmente sanitizado.
      // Nunca registra erro bruto retornado pelo SDK do Google,
      // pois ele pode conter detalhes da requisição.
      console.error(
        "[GmailEmailProvider] falha ao enviar via Gmail API."
      );

      throw new EmailSendError(
        "GmailEmailProvider: falha ao enviar via Gmail API."
      );
    }

    if (!providerMessageId || !providerThreadId) {
      throw new EmailSendError(
        "GmailEmailProvider: resposta do Gmail sem id/threadId."
      );
    }

    return {
      provider: "GMAIL",
      from: config.senderEmail,
      providerMessageId,
      providerThreadId,
      messageIdHeader,
      sentAt: new Date().toISOString(),
    };
  }
}