// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node).
//
// Conteúdo dos três alertas das rotinas especiais na variante informativa (informative-alert.ts):
//   acidente SSMA (INFORMATIVO), falha técnica (INFORMATIVO) e revisão de impacto de versão
//   (EXIGE AÇÃO só para o orçamentista designado com a resposta pendente; INFORMATIVO para a gestão).

import type { AlertSeverity } from "@axion/types";

import { buildInformativeAlertEmail, classifyInformativeAlert, type BuiltInformativeEmail } from "./informative-alert";
import type { AlertLogoAvailability } from "./templates/alert-box-style";
import { buildContractAlertSubject } from "./templates/contract-alert-template";

export function buildSsmaAccidentAlertContent(input: {
  submissionId: string;
  projectName: string;
  recipientName: string | null;
  severity: Extract<AlertSeverity, "ALTA" | "CRITICA">;
  employeeName: string;
  leaveClassification: string;
  occurredAt: string;
  informedCause: string;
  consultUrl: string;
  footer: string;
  logos: AlertLogoAvailability;
}): BuiltInformativeEmail {
  return buildInformativeAlertEmail({
    nature: classifyInformativeAlert("SSMA_ACCIDENT"),
    recipientName: input.recipientName,
    projectName: input.projectName,
    severity: input.severity,
    areaLabel: "SSMA",
    title: "OCORRÊNCIA/ACIDENTE",
    description: `Foi registrada uma ocorrência de SSMA na obra ${input.projectName}.`,
    occurrenceCode: input.submissionId.slice(0, 8).toUpperCase(),
    details: [
      { label: "Funcionário", value: input.employeeName },
      { label: "Classificação", value: input.leaveClassification },
      { label: "Data e hora", value: input.occurredAt },
      { label: "Causa informada", value: input.informedCause },
    ],
    consultLink: { label: "CONSULTAR REGISTROS SSMA", url: input.consultUrl },
    footer: input.footer,
    logos: input.logos,
    subject: `${buildContractAlertSubject(input.projectName, input.severity)} - SSMA - OCORRÊNCIA/ACIDENTE (INFORMATIVO)`,
  });
}

export function buildSystemHealthAlertContent(input: {
  projectName: string;
  sourceType: string;
  summary: string;
  auditUrl: string;
  footer: string;
  logos: AlertLogoAvailability;
}): BuiltInformativeEmail {
  return buildInformativeAlertEmail({
    nature: classifyInformativeAlert("SYSTEM_HEALTH"),
    recipientName: null,
    projectName: input.projectName,
    severity: "ALTA",
    areaLabel: "Supervisão operacional",
    title: "Falha operacional",
    description: input.summary,
    details: [{ label: "Fonte", value: input.sourceType }],
    consultLink: { label: "CONSULTAR AUDITORIA", url: input.auditUrl },
    footer: input.footer,
    logos: input.logos,
    subject: `🟡 [RISCO ALTO] ACC - FALHA OPERACIONAL - ${input.projectName} (INFORMATIVO)`,
  });
}

export function buildVersionImpactReviewContent(input: {
  recipientName: string | null;
  projectName: string;
  documentName: string;
  previousRevision: string | null;
  newRevision: string;
  scheduleImpact: string;
  priceImpact: string;
  response: string;
  sentToBudget: boolean;
  /** Este destinatário é o orçamentista designado E a resposta do Orçamento ainda está pendente. */
  isDesignatedBudgetReviewer: boolean;
  accUrl: string;
  footer: string;
  logos: AlertLogoAvailability;
}): BuiltInformativeEmail {
  const isHigh = input.scheduleImpact !== "NAO" || input.priceImpact !== "NAO";
  const label = isHigh ? "ALTO" : "MÉDIO";
  const nature = classifyInformativeAlert("VERSION_IMPACT_REVIEW", { isDesignatedBudgetReviewer: input.isDesignatedBudgetReviewer });
  return buildInformativeAlertEmail({
    nature,
    recipientName: input.recipientName,
    projectName: input.projectName,
    severity: isHigh ? "ALTA" : "MEDIA",
    areaLabel: "Planejamento",
    title: "Nova versão de documento",
    description: input.documentName,
    details: [
      { label: "Arquivo", value: input.documentName },
      { label: "Versão", value: `${input.previousRevision ?? "—"} → ${input.newRevision}` },
      { label: "Impacto no prazo", value: input.scheduleImpact },
      { label: "Impacto no preço", value: input.priceImpact },
      { label: "Resposta do Planejamento", value: input.response },
      { label: "Encaminhado ao Orçamento", value: input.sentToBudget ? "Sim" : "Não" },
    ],
    consultLink: { label: "CONSULTAR A ANÁLISE NO ACC", url: input.accUrl },
    action:
      nature === "ACTION_REQUIRED"
        ? { link: { label: "REGISTRAR RESPOSTA DO ORÇAMENTO", url: input.accUrl }, instruction: "registrar, na tela Integrações do ACC, a resposta do Orçamento sobre o impacto desta nova versão." }
        : null,
    footer: input.footer,
    logos: input.logos,
    subject: `${isHigh ? "🟡" : "🔵"} [RISCO ${label}] ACC - NOVA VERSÃO - OBRA ${input.projectName.toUpperCase()}${nature === "INFORMATIVE" ? " (INFORMATIVO)" : " (AÇÃO DO ORÇAMENTO)"}`,
  });
}
