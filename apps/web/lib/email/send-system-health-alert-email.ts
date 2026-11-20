import "server-only";

import { getEmailProvider } from "./get-email-provider";
import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { buildSystemHealthAlertContent } from "./informative-alert-content";

// Alerta técnico INFORMATIVO (informative-alert.ts): a Auditoria é somente leitura e a correção é técnica, fora do ACC —
// sem os quatro botões; só o link de consulta.
export async function sendSystemHealthAlertEmail(input: {
  recipientEmail: string;
  projectName: string;
  sourceType: string;
  summary: string;
  auditUrl: string;
  // Projeto da falha: permite ao transporte do piloto por projeto (project-pilot-profile.ts) restringir o destino.
  projectId: string;
}) {
  const { images, availability } = loadAccAlertLogos({ maroon: true, inverted: false });
  const built = buildSystemHealthAlertContent({
    projectName: input.projectName,
    sourceType: input.sourceType,
    summary: input.summary,
    auditUrl: input.auditUrl,
    footer: "O ACC suprimiu repetições desta mesma falha para evitar excesso de e-mails.",
    logos: availability,
  });
  const signed = appendAccEmailSignature({ text: built.text, html: built.html }, images.length > 0, false);
  return getEmailProvider().send({
    to: input.recipientEmail,
    subject: built.subject,
    text: signed.text,
    html: signed.html,
    inlineImages: images.length > 0 ? images : undefined,
    correlationId: crypto.randomUUID(),
    pilot: { projectId: input.projectId, participantLabel: "administrador (supervisão operacional)", escalationLevel: null },
  });
}
