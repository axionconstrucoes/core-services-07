import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";
import type { AlertSeverity } from "@axion/types";
import { appendAccEmailSignature } from "./branding/acc-email-signature";
import { loadAccAlertLogos } from "./branding/load-acc-logo-inline-image";
import { EmailSendError } from "./email-provider";
import { getEmailProvider } from "./get-email-provider";
import { alertRiskLevelLabels, buildContractAlertSubject } from "./templates/contract-alert-template";

import { buildUniversalAlertEmail } from "./templates/universal-alert-template";

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
  const riskLabel = alertRiskLevelLabels[input.severity];
  const subject = buildContractAlertSubject(input.projectName, input.severity);
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    `RISCO ${riskLabel} · OCORRÊNCIA/ACIDENTE`,
    "",
    greeting,
    `Foi registrada uma ocorrência de SSMA na obra ${input.projectName}.`,
    `Funcionário: ${input.employeeName}`,
    `Classificação: ${input.leaveClassification}`,
    `Data e hora: ${input.occurredAt}`,
    `Causa informada: ${input.informedCause}`,
    "",
    `RESPONDER AO ACC: ${input.accUrl}`,
    "",
    "Comunicação automática determinística. A classificação e a investigação exigem revisão humana.",
  ].join("\n");
  const critical = input.severity === "CRITICA";
  const { images, availability } = loadAccAlertLogos({ maroon: !critical, inverted: critical });
  const { html } = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    logos: availability,
    footer: "Comunicação automática determinística. A classificação e a investigação exigem revisão humana.",
    occurrence: {
      code: input.submissionId.slice(0, 8).toUpperCase(),
      projectName: input.projectName,
      areaLabel: "SSMA",
      severity: input.severity,
      title: "OCORRÊNCIA/ACIDENTE",
      description: `Foi registrada uma ocorrência de SSMA na obra ${input.projectName}.`,
      stateLabel: "Ocorrência registrada",
      responsibleName: "",
      specialistLabel: "Especialista SSMA",
      openUrl: input.accUrl,
      // Acidente: não há rota de e-mail para tratar o registro; os botões ficam desativados com o motivo (nada é simulado).
      actions: {},
      unavailableReasons: {
        RESOLVIDO: "Sem atalho por e-mail: trate em RESPONDER AO ACC.",
        EM_ANDAMENTO: "Sem atalho por e-mail: trate em RESPONDER AO ACC.",
        ENVIAR_PARA: "Sem atalho por e-mail: trate em RESPONDER AO ACC.",
        ESPECIALISTA: "Consulta ao especialista indisponível para acidente.",
      },
      details: [
        { label: "Funcionário", value: input.employeeName },
        { label: "Classificação", value: input.leaveClassification },
        { label: "Data e hora", value: input.occurredAt },
        { label: "Causa informada", value: input.informedCause },
      ],
      extraLinks: [{ label: "RESPONDER AO ACC", url: input.accUrl }],
    },
  });
  const signed = appendAccEmailSignature({ text, html }, images.length > 0, false);
  const provider = getEmailProvider();

  let result;
  try {
    result = await provider.send({
      to: input.recipientEmail,
      subject,
      text: signed.text,
      html: signed.html,
      inlineImages: images.length > 0 ? images : undefined,
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
