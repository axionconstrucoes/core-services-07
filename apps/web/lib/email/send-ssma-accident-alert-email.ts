import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";
import type { AlertSeverity } from "@axion/types";
import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { EmailSendError } from "./email-provider";
import { getEmailProvider } from "./get-email-provider";
import { buildSsmaAccidentAlertContent } from "./informative-alert-content";

export interface SsmaAccidentAlertInput {
  projectId: string;
  submissionId: string;
  projectName: string;
  recipientEmail: string;
  recipientName: string | null;
  severity: Extract<AlertSeverity, "ALTA" | "CRITICA">;
  employeeName: string;
  leaveClassification: string;
  occurredAt: string;
  informedCause: string;
  /** Link de CONSULTA (Registros SSMA). O ACC não tem fluxo de tratamento de acidente: o e-mail é INFORMATIVO. */
  consultUrl: string;
}

// Alerta INFORMATIVO (informative-alert.ts): sem os quatro botões e sem "Responder ao ACC" — o ACC não registra
// tratamento/investigação de acidente; nada é prometido além da consulta.
export async function sendSsmaAccidentAlertEmail(input: SsmaAccidentAlertInput) {
  const critical = input.severity === "CRITICA";
  const { images, availability } = loadAccAlertLogos({ maroon: !critical, inverted: critical });
  const built = buildSsmaAccidentAlertContent({
    submissionId: input.submissionId,
    projectName: input.projectName,
    recipientName: input.recipientName,
    severity: input.severity,
    employeeName: input.employeeName,
    leaveClassification: input.leaveClassification,
    occurredAt: input.occurredAt,
    informedCause: input.informedCause,
    consultUrl: input.consultUrl,
    footer: "Comunicação automática determinística e informativa. O ACC não registra o tratamento do acidente: a classificação e a investigação exigem revisão humana.",
    logos: availability,
  });
  const signed = appendAccEmailSignature({ text: built.text, html: built.html }, images.length > 0, false);
  const provider = getEmailProvider();

  let result;
  try {
    result = await provider.send({
      to: input.recipientEmail,
      subject: built.subject,
      text: signed.text,
      html: signed.html,
      inlineImages: images.length > 0 ? images : undefined,
      correlationId: crypto.randomUUID(),
      vera: { projectId: input.projectId, context: "ssma" },
      governance: { type: "SSMA_ACCIDENT", projectId: input.projectId },
    });
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    throw new EmailSendError("Falha inesperada ao comunicar a ocorrência de SSMA.");
  }

  // Registro auxiliar: o provedor JÁ aceitou — falha aqui não pode transformar o envio em falha (reenvio duplicaria).
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("emails").insert({
      project_id: input.projectId,
      from_address: result.from,
      to_address: input.recipientEmail,
      subject: built.subject,
      sent_at: result.sentAt,
      snippet: built.text.slice(0, 280),
    });
  } catch {
    /* registro em emails é auxiliar */
  }
  return result;
}
