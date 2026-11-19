// Conteúdo (puro) dos e-mails de registro crítico e de ação corretiva em atraso. Sem I/O.
// Diferencia FATO (o que foi registrado), PRAZO/ESTADO (dados do sistema) e a necessidade de revisão humana.

import { alertRiskLevelLabels, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
import { buildUniversalAlertEmail } from "@/lib/email/templates/universal-alert-template";
import type { MailContent } from "./core";

export interface FieldNotificationContext {
  projectName: string;
  recipientName: string | null;
  category: string;
  location: string;
  description: string;
  occurredAt: string; // já formatado (pt-BR, America/Sao_Paulo)
  reportedByName: string;
  accUrl: string;
  visibleCode?: string;
  /** Somente ACTION_OVERDUE */
  dueDate?: string; // já formatado dd/mm/aaaa
  daysOverdue?: number;
  responsibleName?: string | null;
}

const clip = (v: string, n = 400) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

function build(kind: "CRITICAL_RECORD" | "ACTION_OVERDUE", ctx: FieldNotificationContext): MailContent {
  const severity = kind === "CRITICAL_RECORD" ? "CRITICA" : "ALTA";
  const riskLabel = alertRiskLevelLabels[severity];
  const title = kind === "CRITICAL_RECORD" ? "REGISTRO CRÍTICO DE CAMPO · SSMA" : "AÇÃO CORRETIVA EM ATRASO · SSMA";
  const subject = `${kind === "CRITICAL_RECORD" ? "Registro crítico de campo" : "Ação corretiva em atraso"} — ${buildContractAlertSubject(ctx.projectName, severity)}`;
  const greeting = ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.";
  const lead = kind === "CRITICAL_RECORD"
    ? `Foi registrado, em campo, um registro de risco CRÍTICO na obra ${ctx.projectName}.`
    : `A ação corretiva do registro abaixo, na obra ${ctx.projectName}, está com o prazo vencido e não foi concluída.`;
  const facts: Array<[string, string]> = [
    ["Categoria", ctx.category],
    ["Local", ctx.location],
    ["Fato registrado em", ctx.occurredAt],
    ["Registrado por", ctx.reportedByName],
    ["Descrição (como informada)", clip(ctx.description)],
  ];
  if (kind === "ACTION_OVERDUE") {
    facts.push(["Prazo da ação", ctx.dueDate ?? "—"], ["Dias de atraso", String(ctx.daysOverdue ?? "—")], ["Responsável", ctx.responsibleName ?? "não definido"]);
  }
  const footer = "Comunicação automática determinística do ACC. Os dados acima são o registro original; a avaliação do risco e as providências exigem revisão humana.";
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    `RISCO ${riskLabel} · ${title}`,
    "",
    greeting,
    lead,
    ...facts.map(([k, v]) => `${k}: ${v}`),
    "",
    `ABRIR NO ACC: ${ctx.accUrl}`,
    "",
    footer,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text },
    { ...ctx, severity, visibleCode: ctx.visibleCode ?? ctx.category },
    { title, description: lead, stateLabel: kind === "CRITICAL_RECORD" ? "Registro crítico" : "Prazo vencido", facts, footer }
  );
}

export const buildCriticalRecordEmail = (ctx: FieldNotificationContext) => build("CRITICAL_RECORD", ctx);
export const buildOverdueActionEmail = (ctx: FieldNotificationContext) => build("ACTION_OVERDUE", ctx);

// ------------------------------------------------------------------
// Aviso OPERACIONAL de ação corretiva em atraso (escopo WEG_CORRECTIVE_ACTIONS)
// ------------------------------------------------------------------
// Diferenças do aviso legado: sem faixa de teste; destinatário = responsável atual; prazo ORIGINAL preservado (nenhum SLA
// reiniciado); quando o tratamento foi assumido depois do vencimento, informa quem assumiu e quando, sem atribuir a ele o atraso
// anterior; caixa de ação lateral; instruções para responder no corpo do e-mail (status, providência e previsão de término).

export type SsmaSeverity = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface OperationalOverdueContext extends FieldNotificationContext {
  severity: SsmaSeverity;
  /** Assunção do tratamento pelo responsável atual (quando posterior ao vencimento). */
  takeover?: { name: string; date: string } | null;
  /** Código curto visível (rastreabilidade na resposta). */
  visibleCode: string;
}

interface SsmaAlertDetails {
  title: string;
  description: string;
  stateLabel: string;
  facts: Array<[string, string]>;
  footer: string;
  notices?: string[];
  replyInstruction?: string;
}

export function renderSsmaAlert(
  content: Pick<MailContent, "subject" | "text" | "operational">,
  ctx: {
    projectName: string;
    recipientName: string | null;
    accUrl: string;
    severity: SsmaSeverity | null;
    visibleCode: string;
    responsibleName?: string | null;
    dueDate?: string | null;
  },
  details: SsmaAlertDetails
): MailContent {
  const { severity } = ctx;
  const { html, logoNeeds } = buildUniversalAlertEmail({
    recipientName: ctx.recipientName,
    logos: { maroon: true, inverted: true },
    footer: details.footer,
    occurrence: {
      code: ctx.visibleCode,
      projectName: ctx.projectName,
      areaLabel: "SSMA",
      severity: severity ?? "BAIXA",
      headerLabel: severity === null ? "SSMA" : undefined,
      title: details.title,
      description: details.description,
      stateLabel: details.stateLabel,
      responsibleName: ctx.responsibleName ?? "",
      originalDeadline: ctx.dueDate,
      specialistLabel: "Especialista SSMA",
      openUrl: ctx.accUrl,
      // Os quatro botões levam ao registro de SSMA no ACC (exige login; abrir o link NÃO altera estado nenhum):
      // a ação em si é registrada lá, com confirmação, evidência e auditoria.
      actions: { RESOLVIDO: ctx.accUrl, EM_ANDAMENTO: ctx.accUrl, ENVIAR_PARA: ctx.accUrl, ESPECIALISTA: ctx.accUrl },
      unavailableReasons: {},
      details: details.facts.map(([label, value]) => ({ label, value })),
      notices: details.notices,
      replyInstruction: details.replyInstruction,
      extraLinks: [{ label: "ABRIR NO ACC", url: ctx.accUrl }],
    },
  });
  return { ...content, html, logoNeeds };
}

export function replyInstructionFor(severity: SsmaSeverity): string {
  return severity === "CRITICA" || severity === "ALTA"
    ? "Responda a este e-mail, no próprio corpo, informando o status, a providência e a previsão de conclusão com DATA E HORÁRIO (horário de Brasília). Ex.: \"Tomando providências: isolamento da área e orientação da equipe. Conclusão prevista para 20/11/2026 às 15h\"."
    : "Responda a este e-mail, no próprio corpo, informando o status, a providência e a data prevista de conclusão. Ex.: \"Em andamento: ajuste do procedimento. Previsão: 25/11/2026\".";
}

export function buildOperationalOverdueActionEmail(ctx: OperationalOverdueContext): MailContent {
  const riskLabel = alertRiskLevelLabels[ctx.severity];
  const subject = `[RISCO ${riskLabel}] ACC - ${ctx.projectName} - Ação corretiva SSMA em atraso - ${ctx.category} - ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`;
  const greeting = ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.";
  const lead = `A ação corretiva do registro de SSMA abaixo, na obra ${ctx.projectName}, está com o prazo vencido e não foi concluída.`;
  const takeoverLine = ctx.takeover
    ? `O tratamento foi assumido por ${ctx.takeover.name} em ${ctx.takeover.date}. O prazo original foi mantido (nenhum prazo foi reiniciado); o atraso anterior a essa data não é atribuído ao responsável atual.`
    : null;
  const facts: Array<[string, string]> = [
    ["Categoria", ctx.category],
    ["Local", ctx.location],
    ["Fato registrado em", ctx.occurredAt],
    ["Registrado por", ctx.reportedByName],
    ["Descrição (como informada)", clip(ctx.description)],
    ["Prazo original da ação", ctx.dueDate ?? "—"],
    ["Dias de atraso (desde o prazo original)", String(ctx.daysOverdue ?? "—")],
    ["Responsável atual", ctx.responsibleName ?? "não definido"],
  ];
  const instruction = replyInstructionFor(ctx.severity);
  const footer =
    "Comunicação automática determinística do ACC. Os dados acima são o registro original; a avaliação do risco e as providências exigem revisão humana. A resposta e a previsão não reiniciam prazos nem apagam atrasos.";
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    `RISCO ${riskLabel} · AÇÃO CORRETIVA SSMA EM ATRASO`,
    "",
    greeting,
    lead,
    ...(takeoverLine ? ["", takeoverLine] : []),
    "",
    ...facts.map(([k, v]) => `${k}: ${v}`),
    "",
    "COMO RESPONDER",
    instruction,
    "",
    `ABRIR NO ACC: ${ctx.accUrl}`,
    "",
    footer,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text, operational: true },
    ctx,
    { title: "AÇÃO CORRETIVA SSMA EM ATRASO", description: lead, stateLabel: "Prazo vencido",
      facts, footer, notices: takeoverLine ? [takeoverLine] : [], replyInstruction: instruction }
  );
}

// ------------------------------------------------------------------
// Confirmação da resposta por e-mail (ação corretiva SSMA)
// ------------------------------------------------------------------
export interface SsmaReplyConfirmationContext {
  projectName: string;
  recipientName: string | null;
  category: string;
  location: string;
  visibleCode: string;
  originalSubject: string;
  severity?: SsmaSeverity | null;
  statusLabel: string;
  forecastLine: string | null;
  pendingLine: string | null;
  outOfOrder: boolean;
  accUrl: string;
}

export function buildSsmaReplyConfirmationEmail(ctx: SsmaReplyConfirmationContext): MailContent {
  const base = ctx.originalSubject.trim() || `Ação corretiva SSMA [ACC-SSMA:${ctx.visibleCode}]`;
  const subject = /^re:/i.test(base) ? base : `Re: ${base}`;
  const greeting = ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.";
  const rows: Array<[string, string]> = [
    ["Obra", ctx.projectName],
    ["Ação corretiva", `${ctx.category} — ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`],
    ["Status registrado", ctx.statusLabel],
    ["Previsão de conclusão", ctx.forecastLine ?? "PENDENTE"],
  ];
  if (ctx.pendingLine) rows.push(["Pendência", ctx.pendingLine]);
  const paragraphs = [
    ...(ctx.statusLabel.includes("não identificado") ? ["O ACC não identificou o andamento na sua resposta. Responda informando \"em andamento\" e a previsão de conclusão (data e horário), ou registre a ação no ACC."] : []),
    ...(ctx.outOfOrder ? ["Esta mensagem é anterior a uma atualização já registrada: foi guardada no histórico, sem alterar o status nem a previsão vigente."] : []),
    ...(ctx.pendingLine
      ? ["Responda a este e-mail com a informação pendente."]
      : ["Confira a data e o horário interpretados. Se estiverem incorretos, responda a este e-mail com a previsão correta."]),
  ];
  const footer = "A resposta e a previsão não reiniciam prazos, não apagam atrasos e não suspendem as cobranças até a conclusão da ação.";
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    "RESPOSTA REGISTRADA · AÇÃO CORRETIVA SSMA",
    "",
    greeting,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...paragraphs,
    footer,
    "",
    `ABRIR NO ACC: ${ctx.accUrl}`,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text, operational: true },
    { ...ctx, severity: ctx.severity ?? null },
    { title: "RESPOSTA REGISTRADA · AÇÃO CORRETIVA SSMA", description: `${ctx.category} — ${ctx.location}`,
      // "Status registrado" já aparece no campo Estado: não repetir na lista de fatos.
      stateLabel: ctx.statusLabel, facts: rows.filter(([k]) => k !== "Status registrado"), notices: paragraphs, footer }
  );
}
