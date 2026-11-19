// Alerta de ocorrência/acidente de SSMA — LAYOUT UNIVERSAL de alertas do ACC (universal-alert-template.ts).
// Só o desenho mudou: assunto, conteúdo, destinatário e o link "RESPONDER AO ACC" continuam os mesmos.
// A ocorrência é um registro de campo (não um caso de risco com formulário de tratamento): os quatro botões ficam no layout,
// desativados com o motivo visível; o título e "RESPONDER AO ACC" abrem o registro no ACC autenticado.
//
// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node).

import type { AlertSeverity } from "@axion/types";

import type { AlertLogoAvailability } from "@/lib/email/templates/alert-box-style";
import { buildContractAlertSubject, alertRiskLevelLabels } from "@/lib/email/templates/contract-alert-template";
import { buildUniversalAlertEmail, type UniversalAction } from "@/lib/email/templates/universal-alert-template";

export interface SsmaAccidentAlertEmailInput {
  submissionId: string;
  projectName: string;
  recipientName: string | null;
  severity: Extract<AlertSeverity, "ALTA" | "CRITICA">;
  employeeName: string;
  leaveClassification: string;
  occurredAt: string;
  informedCause: string;
  accUrl: string;
  logos?: AlertLogoAvailability;
}

const FOOTER =
  "Comunicação automática determinística. A classificação e a investigação exigem revisão humana. Os botões abrem o ACC autenticado: nada é registrado, transferido ou concluído apenas pelo clique no e-mail.";

const REASON = "Registre o tratamento da ocorrência pelo ACC (RESPONDER AO ACC).";

export function buildSsmaAccidentAlertEmail(input: SsmaAccidentAlertEmailInput): { subject: string; html: string; text: string; logoNeeds: { maroon: boolean; inverted: boolean } } {
  const riskLabel = alertRiskLevelLabels[input.severity];
  const unavailableReasons: Partial<Record<UniversalAction, string>> = {
    RESOLVIDO: REASON,
    EM_ANDAMENTO: REASON,
    ENVIAR_PARA: REASON,
    ESPECIALISTA: "Consulta ao especialista não disponível neste aviso; abra o registro no ACC.",
  };
  const built = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    logos: input.logos ?? { maroon: false, inverted: false },
    footer: FOOTER,
    occurrence: {
      code: input.submissionId.slice(0, 8).toUpperCase(),
      projectName: input.projectName,
      areaLabel: "SSMA",
      severity: input.severity,
      headerLabel: `RISCO ${riskLabel} · OCORRÊNCIA/ACIDENTE`,
      title: "Ocorrência de SSMA registrada",
      description: `Foi registrada uma ocorrência de SSMA na obra ${input.projectName}.`,
      stateLabel: "Registrada — aguardando revisão humana",
      specialistLabel: "Especialista SSMA",
      openUrl: input.accUrl,
      actions: {},
      unavailableReasons,
      details: [
        { label: "Funcionário", value: input.employeeName },
        { label: "Classificação", value: input.leaveClassification },
        { label: "Data e hora", value: input.occurredAt },
        { label: "Causa informada", value: input.informedCause },
      ],
      extraLinks: [{ label: "RESPONDER AO ACC", url: input.accUrl }],
    },
  });
  return { subject: buildContractAlertSubject(input.projectName, input.severity), html: built.html, text: built.text, logoNeeds: built.logoNeeds };
}
