import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";
import type { AlertSeverity } from "@axion/types";
import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { EmailSendError } from "./email-provider";
import { getEmailProvider } from "./get-email-provider";
import { buildSsmaAccidentAlertEmail } from "./templates/ssma-accident-alert-template";

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
  accUrl: string;
}

export async function sendSsmaAccidentAlertEmail(input: SsmaAccidentAlertInput) {
  // Layout universal: só o logo usado pela caixa desta gravidade (invertido no CRÍTICO, vinho no ALTO), carregado ANTES de montar o HTML.
  const darkTone = input.severity === "CRITICA";
  const logos = loadAccAlertLogos({ maroon: !darkTone, inverted: darkTone });
  const hasInlineLogo = logos.availability.maroon || logos.availability.inverted;
  const { subject, html, text } = buildSsmaAccidentAlertEmail({ ...input, logos: logos.availability });
  const signed = appendAccEmailSignature({ text, html }, hasInlineLogo, false);
  const provider = getEmailProvider();

  let result;
  try {
    result = await provider.send({
      to: input.recipientEmail,
      subject,
      text: signed.text,
      html: signed.html,
      inlineImages: logos.images.length > 0 ? logos.images : undefined,
      correlationId: crypto.randomUUID(),
      vera: { projectId: input.projectId, context: "ssma" },
    });
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    throw new EmailSendError("Falha inesperada ao comunicar a ocorrência de SSMA.");
  }

  const admin = createSupabaseAdminClient();
  await admin.from("emails").insert({
    project_id: input.projectId,
    from_address: result.from,
    to_address: input.recipientEmail,
    subject,
    sent_at: result.sentAt,
    snippet: text.slice(0, 280),
  });
  return result;
}
