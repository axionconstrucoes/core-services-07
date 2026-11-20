// Conteúdo (puro) dos e-mails de registro crítico e de ação corretiva em atraso. Sem I/O.
// Diferencia FATO (o que foi registrado), PRAZO/ESTADO (dados do sistema) e a necessidade de revisão humana.

import { alertRiskLevelLabels, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
import { buildUniversalAlertEmail, replyByEmailTextLines } from "@/lib/email/templates/universal-alert-template";
import { buildReplyMailtoLinks, type ReplyMailtoLinks } from "@/lib/email-replies/reply-mailto";
import { buildSsmaRecordUrl, type SsmaRecordLinkTarget } from "@/lib/ssma/field-records/deep-link";
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
  /** Registro de SSMA desta mensagem: os botões abrem ESTE registro (sem ele, ficam desativados com o motivo). */
  recordLink?: SsmaRecordLinkTarget | null;
  visibleCode?: string;
  /** Somente ACTION_OVERDUE */
  dueDate?: string; // já formatado dd/mm/aaaa
  daysOverdue?: number;
  responsibleName?: string | null;
  /**
   * Atalhos "Responder por e-mail" (mailto com o token desta mensagem, gravado antes do envio). SÓ em avisos ao responsável
   * de ação corretiva com resposta habilitada (processamento real); ausente => sem atalhos.
   */
  replyByEmail?: ReplyMailtoLinks | null;
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
    `ABRIR NO ACC: ${ssmaOpenUrl(ctx)}`,
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

/**
 * ENVIAR PARA e ESPECIALISTA: os fluxos existem no registro do app SSMA (encaminhar — ssma_corrective_action_forward — e
 * consulta ao especialista com limite diário). O ATALHO por e-mail fica desativado até a validação funcional; liga-se
 * com ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=true (servidor). Desativado, o botão continua no layout com o motivo.
 */
export function ssmaEmailExtraActionsEnabled(): boolean {
  return process.env.ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED === "true";
}
export const SSMA_FORWARD_UNAVAILABLE = "Atalho em validação: encaminhe pelo registro (ABRIR NO ACC → Encaminhar) ou responda a este e-mail indicando o novo responsável.";
export const SSMA_SPECIALIST_UNAVAILABLE = "Atalho em validação: consulte o especialista pelo registro (ABRIR NO ACC → Consultar IA).";
export const SSMA_RECORD_UNKNOWN = "Registro de SSMA não identificado nesta mensagem. Use ABRIR NO ACC.";

/** Endereço do registro desta mensagem no aplicativo SSMA; sem registro identificado, a lista de registros da obra. */
export function ssmaOpenUrl(ctx: { accUrl: string; recordLink?: SsmaRecordLinkTarget | null }): string {
  return ctx.recordLink ? buildSsmaRecordUrl(ctx.recordLink) : ctx.accUrl;
}

/**
 * Linhas de fatos que a ocorrência já exibe em campo próprio (cabeçalho com a obra, Ocorrência, Responsável atual,
 * Prazo original, Estado). Continuam no texto simples, mas não se repetem no HTML.
 */
function withoutDedicatedFields(facts: Array<[string, string]>, ctx: { responsibleName?: string | null; dueDate?: string | null }): Array<[string, string]> {
  const dedicated = new Set(["Obra", "Ação corretiva", "Status registrado"]);
  if (ctx.responsibleName) for (const label of ["Responsável", "Responsável atual"]) dedicated.add(label);
  if (ctx.dueDate) for (const label of ["Prazo da ação", "Prazo original da ação"]) dedicated.add(label);
  return facts.filter(([label]) => !dedicated.has(label));
}

export function renderSsmaAlert(
  content: Pick<MailContent, "subject" | "text" | "operational">,
  ctx: {
    projectName: string;
    recipientName: string | null;
    accUrl: string;
    recordLink?: SsmaRecordLinkTarget | null;
    severity: SsmaSeverity | null;
    visibleCode: string;
    responsibleName?: string | null;
    dueDate?: string | null;
    replyByEmail?: ReplyMailtoLinks | null;
  },
  details: SsmaAlertDetails
): MailContent {
  const { severity, recordLink } = ctx;
  const openUrl = ssmaOpenUrl(ctx);
  const extraActions = ssmaEmailExtraActionsEnabled();
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
      openUrl,
      // Cada botão abre ESTE registro no aplicativo SSMA com o formulário correspondente (concluir / registrar andamento /
      // encaminhar) ou a consulta ao especialista. Exige login; abrir o link NÃO altera estado: a ação é registrada lá, com
      // confirmação, evidência e auditoria. ENVIAR PARA e ESPECIALISTA só ficam ativos com a chave de validação.
      actions: recordLink
        ? {
            RESOLVIDO: buildSsmaRecordUrl(recordLink, "CONCLUIDA"),
            EM_ANDAMENTO: buildSsmaRecordUrl(recordLink, "ANDAMENTO"),
            ...(extraActions ? { ENVIAR_PARA: buildSsmaRecordUrl(recordLink, "ENCAMINHAR"), ESPECIALISTA: buildSsmaRecordUrl(recordLink, "ESPECIALISTA") } : {}),
          }
        : {},
      unavailableReasons: recordLink
        ? extraActions
          ? {}
          : { ENVIAR_PARA: SSMA_FORWARD_UNAVAILABLE, ESPECIALISTA: SSMA_SPECIALIST_UNAVAILABLE }
        : { RESOLVIDO: SSMA_RECORD_UNKNOWN, EM_ANDAMENTO: SSMA_RECORD_UNKNOWN, ENVIAR_PARA: SSMA_RECORD_UNKNOWN, ESPECIALISTA: SSMA_RECORD_UNKNOWN },
      details: withoutDedicatedFields(details.facts, ctx).map(([label, value]) => ({ label, value })),
      notices: details.notices,
      replyInstruction: details.replyInstruction,
      extraLinks: [{ label: "ABRIR NO ACC", url: openUrl }],
      replyByEmail: ctx.replyByEmail ?? null,
    },
  });
  const mailtoLines = replyByEmailTextLines(ctx.replyByEmail);
  return { ...content, text: mailtoLines.length > 0 ? `${content.text}\n\n${mailtoLines.join("\n")}` : content.text, html, logoNeeds };
}

/**
 * Atalhos mailto do aviso SSMA ao RESPONSÁVEL (resposta habilitada): o token é o MESMO do Reply-To da mensagem (o envio grava o
 * hash em email_reply_tokens ANTES de sair). Sem caixa válida => null (o aviso sai só com os botões do ACC).
 */
export function ssmaReplyMailto(token: string, visibleCode: string, mailbox: string | null | undefined, severity: SsmaSeverity): ReplyMailtoLinks | null {
  if (!mailbox) return null;
  return buildReplyMailtoLinks({ mailbox, token, visibleCode: `ACC-SSMA:${visibleCode}`, evidenceAttachment: "REQUIRED_PHOTO", forecastNeedsTime: severity === "CRITICA" || severity === "ALTA" });
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
    `ABRIR NO ACC: ${ssmaOpenUrl(ctx)}`,
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
  recordLink?: SsmaRecordLinkTarget | null;
  /** Recusa/pendência: nada foi gravado na ação (título e textos próprios, sem afirmar registro). */
  rejected?: boolean;
  replyByEmail?: ReplyMailtoLinks | null;
}

export function buildSsmaReplyConfirmationEmail(ctx: SsmaReplyConfirmationContext): MailContent {
  const base = ctx.originalSubject.trim() || `Ação corretiva SSMA [ACC-SSMA:${ctx.visibleCode}]`;
  const subject = /^re:/i.test(base) ? base : `Re: ${base}`;
  const greeting = ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.";
  if (ctx.rejected) return buildSsmaReplyRejectionEmail(ctx, subject, greeting);
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
    `ABRIR NO ACC: ${ssmaOpenUrl(ctx)}`,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text, operational: true },
    { ...ctx, severity: ctx.severity ?? null },
    { title: "RESPOSTA REGISTRADA · AÇÃO CORRETIVA SSMA", description: `${ctx.category} — ${ctx.location}`,
      // "Obra", "Ação corretiva" e "Status registrado" já aparecem no cabeçalho, na Ocorrência e no Estado (filtrados no HTML).
      stateLabel: ctx.statusLabel, facts: rows, notices: paragraphs, footer }
  );
}

/** Resposta NÃO aplicada (comando incompleto, sem foto, remetente não autenticado…): nunca afirma registro. */
function buildSsmaReplyRejectionEmail(ctx: SsmaReplyConfirmationContext, subject: string, greeting: string): MailContent {
  const rows: Array<[string, string]> = [
    ["Obra", ctx.projectName],
    ["Ação corretiva", `${ctx.category} — ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`],
    ["Resultado", "NÃO aplicado — a ação corretiva continua como estava"],
    ...(ctx.pendingLine ? ([["O que falta / motivo", ctx.pendingLine]] as Array<[string, string]>) : []),
  ];
  const paragraphs = ["Nada foi alterado na ação corretiva, nos prazos ou nos escalonamentos. Responda a este e-mail com o comando corrigido ou complementado, ou registre a ação no ACC."];
  const footer = "Confirmação automática do ACC. Comandos por e-mail só são registrados quando o remetente é validado e as informações exigidas estão completas.";
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    "RESPOSTA NÃO APLICADA · AÇÃO CORRETIVA SSMA",
    "",
    greeting,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...paragraphs,
    footer,
    "",
    `ABRIR NO ACC: ${ssmaOpenUrl(ctx)}`,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text, operational: true },
    { ...ctx, severity: ctx.severity ?? null },
    { title: "RESPOSTA NÃO APLICADA · AÇÃO CORRETIVA SSMA", description: `${ctx.category} — ${ctx.location}`, stateLabel: "Não aplicado", facts: rows, notices: paragraphs, footer }
  );
}
