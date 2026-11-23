import "server-only";

import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { getEmailProvider } from "./get-email-provider";

import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { buildVersionImpactReviewContent } from "./informative-alert-content";

// Revisão de impacto de nova versão:
//  - orçamentista designado com resposta pendente => EXIGE AÇÃO, com o tratamento real (resposta do Orçamento em
//    Integrações, RPC submit_construmanager_budget_response);
//  - gestão (aviso obrigatório) => INFORMATIVO, só consulta.
// Em nenhum caso os quatro botões do caso de risco (não há caso de risco por trás).
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
  isDesignatedBudgetReviewer: boolean;
  accUrl: string;
  // Projeto da mensagem: o transporte do piloto por projeto (project-pilot-profile.ts) precisa dele para restringir o destino.
  projectId: string;
}) {
  const { images, availability } = loadAccAlertLogos({ maroon: true, inverted: false });
  const built = buildVersionImpactReviewContent({
    ...input,
    footer: "Aviso obrigatório à gestão, mesmo quando a análise não identifica impacto. Decisão sujeita à revisão humana.",
    logos: availability,
  });
  const body = appendAccEmailSignature({ text: built.text, html: built.html }, images.length > 0, false);
  return getEmailProvider().send({
    to: input.recipientEmail,
    subject: built.subject,
    text: body.text,
    html: body.html,
    inlineImages: images.length > 0 ? images : undefined,
    correlationId: crypto.randomUUID(),
    governance: { type: "VERSION_IMPACT_REVIEW", projectId: input.projectId },
    pilot: { projectId: input.projectId, participantLabel: input.isDesignatedBudgetReviewer ? "orçamentista designado (revisão de versão)" : "destinatário da revisão de versão", escalationLevel: null },
  });
}
