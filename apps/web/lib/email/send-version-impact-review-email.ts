import "server-only";

import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { getEmailProvider } from "./get-email-provider";

import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { buildUniversalAlertEmail } from "./templates/universal-alert-template";

export async function sendVersionImpactReviewEmail(input: {
  recipientEmail: string;
  recipientName: string | null;
  projectName: string;
  documentName: string;
  previousRevision: string | null;
  newRevision: string;
  scheduleImpact: string;
  priceImpact: string;
  response: string;
  sentToBudget: boolean;
  accUrl: string;
  // Projeto da mensagem: o transporte do piloto por projeto (project-pilot-profile.ts) precisa dele para restringir o destino.
  projectId: string;
}) {
  const isHigh = input.scheduleImpact !== "NAO" || input.priceImpact !== "NAO";
  const label = isHigh ? "ALTO" : "MÉDIO";
  const subject = `${isHigh ? "🟡" : "🔵"} [RISCO ${label}] ACC - NOVA VERSÃO - OBRA ${input.projectName.toUpperCase()}`;
  const details = [
    { label: "Arquivo", value: input.documentName },
    { label: "Versão", value: `${input.previousRevision ?? "—"} → ${input.newRevision}` },
    { label: "Impacto no prazo", value: input.scheduleImpact },
    { label: "Impacto no preço", value: input.priceImpact },
    { label: "Resposta do Planejamento", value: input.response },
    { label: "Encaminhado ao Orçamento", value: input.sentToBudget ? "Sim" : "Não" },
  ];
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const { images, availability } = loadAccAlertLogos({ maroon: true, inverted: false });
  const { html } = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    logos: availability,
    footer: "Aviso obrigatório à gestão, mesmo quando a análise não identifica impacto. Decisão sujeita à revisão humana.",
    occurrence: {
      code: "",
      projectName: input.projectName,
      areaLabel: "Planejamento",
      severity: isHigh ? "ALTA" : "MEDIA",
      title: "Nova versão de documento",
      description: input.documentName,
      stateLabel: "Análise de impacto registrada",
      responsibleName: "",
      specialistLabel: "Especialista Planejamento",
      openUrl: input.accUrl,
      // Revisão de impacto de nova versão: o tratamento é feito na tela de Integrações; os botões ficam desativados com o motivo.
      actions: {},
      unavailableReasons: {
        RESOLVIDO: "Sem atalho por e-mail: revise em RESPONDER AO ACC.",
        EM_ANDAMENTO: "Sem atalho por e-mail: revise em RESPONDER AO ACC.",
        ENVIAR_PARA: "Sem atalho por e-mail: revise em RESPONDER AO ACC.",
        ESPECIALISTA: "Consulta ao especialista indisponível para revisão de versão.",
      },
      details,
      extraLinks: [{ label: "RESPONDER AO ACC", url: input.accUrl }],
    },
  });
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS", `RISCO ${label} · NOVA VERSÃO`, "", greeting,
    ...details.map(({ label, value }) => `${label}: ${value}`), "", `RESPONDER AO ACC: ${input.accUrl}`,
  ].join("\n");
  const body = appendAccEmailSignature({ text, html }, images.length > 0, false);
  return getEmailProvider().send({
    to: input.recipientEmail,
    subject,
    text: body.text,
    html: body.html,
    inlineImages: images.length > 0 ? images : undefined,
    correlationId: crypto.randomUUID(),
    pilot: { projectId: input.projectId, participantLabel: "destinatário da revisão de versão", escalationLevel: null },
  });
}
