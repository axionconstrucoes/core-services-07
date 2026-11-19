import type { AlertSeverity } from "@axion/types";

import type { EmailActionButton } from "@/lib/email-actions/render-buttons";
import { renderEmailActionButtonsText } from "@/lib/email-actions/render-buttons";

import { EMAIL_ALERT_ACTION_LABELS } from "@/lib/email-actions/types";
import type { AlertLogoAvailability } from "./alert-box-style";
import { buildUniversalAlertEmail } from "./universal-alert-template";

import { alertRiskLevelLabels, buildContractAlertSubject } from "./contract-alert-template";

export interface SlaEscalationEmailInput {
  recipientName: string | null;
  projectName: string;
  severity: AlertSeverity;
  actionTitle: string;
  currentResponsibleName: string | null;
  originalDeadline: string; // já formatado (ex.: "22/08/2026 14:00")
  overdueBy: string; // já formatado (ex.: "2h15min")
  previousLevelLabel: string;
  escalationLevelLabel: string; // ex.: "2º Escalão", "Diretoria"
  recommendedAction: string | null;
  eventUrl: string;
  // Ver contract-alert-template.ts — mesmo padrão, mesma infraestrutura
  // central, nunca duplicada.
  actionButtons: EmailActionButton[];
  code?: string;
  areaLabel?: string;
  logos?: AlertLogoAvailability;
}

export function buildSlaEscalationEmail(input: SlaEscalationEmailInput) {
  const subject = buildContractAlertSubject(input.projectName, input.severity);
  const riskLabel = alertRiskLevelLabels[input.severity];
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";

  const lead = `A pendência não foi resolvida por ${input.previousLevelLabel} dentro do prazo e agora exige acompanhamento de ${input.escalationLevelLabel}.`;
  const details = [
    { label: "Tempo excedido", value: input.overdueBy },
    { label: "Nível anterior", value: input.previousLevelLabel },
    { label: "Nível de escalonamento", value: input.escalationLevelLabel },
    { label: "Ação recomendada", value: input.recommendedAction },
  ];
  const footer = "Este escalonamento foi gerado automaticamente pelo motor de SLA do ACC.";
  const built = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    logos: input.logos ?? { maroon: false, inverted: false },
    footer,
    occurrence: {
      code: input.code ?? "",
      projectName: input.projectName,
      areaLabel: input.areaLabel ?? "SLA",
      severity: input.severity,
      title: `Ação sem resolução foi escalada: ${input.actionTitle}`,
      description: lead,
      stateLabel: `Escalonado para ${input.escalationLevelLabel}`,
      responsibleName: input.currentResponsibleName,
      originalDeadline: input.originalDeadline,
      specialistLabel: "Especialista da área",
      openUrl: input.eventUrl,
      actions: {},
      details,
      replyInstruction: "Você também pode responder diretamente a este e-mail.",
      extraLinks: [
        { label: "Abrir ação no ACC", url: input.eventUrl },
        ...input.actionButtons.map(({ action, url }) => ({ label: EMAIL_ALERT_ACTION_LABELS[action], url })),
      ],
    },
  });
  const fieldRows = [
    { label: "Responsável atual", value: input.currentResponsibleName },
    { label: "Prazo original", value: input.originalDeadline },
    ...details,
  ].filter(({ value }) => value).map(({ label, value }) => `${label}: ${value}`);

  const text = [
    `ACC - AXION Controle de Contratos`,
    `RISCO ${riskLabel} · ESCALONADO PARA ${input.escalationLevelLabel.toUpperCase()}`,
    "",
    greeting,
    `Ação sem resolução foi escalada: ${input.actionTitle}`,
    lead,
    `Obra: ${input.projectName}`,
    ...(fieldRows.length > 0 ? ["", ...fieldRows] : []),
    "",
    `Abrir ação no ACC: ${input.eventUrl}`,
    ...(input.actionButtons.length > 0 ? ["", "Ações disponíveis:", renderEmailActionButtonsText(input.actionButtons)] : []),
    "",
    "Este escalonamento foi gerado automaticamente pelo motor determinístico de SLA do ACC — não é uma decisão de IA.",
  ].join("\n");

  return { ...built, subject, text };
}
