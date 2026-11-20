import "server-only";

import { getEmailProvider } from "./get-email-provider";
import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";

import { buildUniversalAlertEmail } from "./templates/universal-alert-template";

export async function sendSystemHealthAlertEmail(input: {
  recipientEmail: string;
  projectName: string;
  sourceType: string;
  summary: string;
  auditUrl: string;
  // Projeto da falha: permite ao transporte do piloto por projeto (project-pilot-profile.ts) restringir o destino.
  projectId: string;
}) {
  const subject = `🟡 [RISCO ALTO] ACC - FALHA OPERACIONAL - ${input.projectName}`;
  const text = `ACC · SUPERVISÃO OPERACIONAL\nRISCO ALTO\n\nFonte: ${input.sourceType}\nProblema: ${input.summary}\n\nAbrir Auditoria: ${input.auditUrl}\n\nO ACC suprimiu repetições desta mesma falha para evitar excesso de e-mails.`;
  const { images, availability } = loadAccAlertLogos({ maroon: true, inverted: false });
  const { html } = buildUniversalAlertEmail({
    recipientName: null,
    logos: availability,
    footer: "O ACC suprimiu repetições desta mesma falha para evitar excesso de e-mails.",
    occurrence: {
      code: "",
      projectName: input.projectName,
      areaLabel: "Supervisão operacional",
      severity: "ALTA",
      title: "Falha operacional",
      description: input.summary,
      stateLabel: "Falha detectada",
      responsibleName: "",
      specialistLabel: "Supervisão operacional",
      openUrl: input.auditUrl,
      // Falha técnica de integração: o tratamento é feito na Auditoria; os botões ficam desativados com o motivo.
      actions: {},
      unavailableReasons: {
        RESOLVIDO: "Alerta técnico: trate em ABRIR AUDITORIA.",
        EM_ANDAMENTO: "Alerta técnico: trate em ABRIR AUDITORIA.",
        ENVIAR_PARA: "Alerta técnico: trate em ABRIR AUDITORIA.",
        ESPECIALISTA: "Consulta ao especialista indisponível para alerta técnico.",
      },
      details: [{ label: "Fonte", value: input.sourceType }],
      extraLinks: [{ label: "ABRIR AUDITORIA", url: input.auditUrl }],
    },
  });
  const signed = appendAccEmailSignature({ text, html }, images.length > 0, false);
  return getEmailProvider().send({
    to: input.recipientEmail,
    subject,
    text: signed.text,
    html: signed.html,
    inlineImages: images.length > 0 ? images : undefined,
    correlationId: crypto.randomUUID(),
    pilot: { projectId: input.projectId, participantLabel: "administrador (supervisão operacional)", escalationLevel: null },
  });
}
