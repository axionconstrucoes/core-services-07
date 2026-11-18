// Conteúdo (puro) dos e-mails de registro crítico e de ação corretiva em atraso. Sem I/O.
// Diferencia FATO (o que foi registrado), PRAZO/ESTADO (dados do sistema) e a necessidade de revisão humana.

import { alertRiskLevelLabels, BADGE_STYLES, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
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
  /** Somente ACTION_OVERDUE */
  dueDate?: string; // já formatado dd/mm/aaaa
  daysOverdue?: number;
  responsibleName?: string | null;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v: string, n = 400) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

function build(kind: "CRITICAL_RECORD" | "ACTION_OVERDUE", ctx: FieldNotificationContext): MailContent {
  const severity = kind === "CRITICAL_RECORD" ? "CRITICA" : "ALTA";
  const badge = BADGE_STYLES[severity];
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
  const rows = facts.map(([k, v]) => `<tr><td style="vertical-align:top"><strong>${esc(k)}</strong></td><td style="padding-left:12px">${esc(v)}</td></tr>`).join("");
  const html = `<table role="presentation" width="100%" style="background:#fff;color:#000;padding:24px"><tr><td><p style="color:#000;font-weight:700">ACC · AXION CONTROLE DE CONTRATOS</p><p><span style="display:inline-block;background:${badge.background};color:${badge.color};font-weight:700;padding:6px 12px;border-radius:999px">RISCO ${esc(riskLabel)} · ${esc(title)}</span></p><p style="color:#000">${esc(greeting)}</p><p style="color:#000">${esc(lead)}</p><table role="presentation" style="color:#000">${rows}</table><p><a href="${esc(ctx.accUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700">ABRIR NO ACC</a></p><p style="color:#6b7280;font-size:11px">${esc(footer)}</p></td></tr></table>`;
  return { subject, text, html };
}

export const buildCriticalRecordEmail = (ctx: FieldNotificationContext) => build("CRITICAL_RECORD", ctx);
export const buildOverdueActionEmail = (ctx: FieldNotificationContext) => build("ACTION_OVERDUE", ctx);

// ------------------------------------------------------------------
// Aviso OPERACIONAL de ação corretiva em atraso (escopo WEG_CORRECTIVE_ACTIONS)
// ------------------------------------------------------------------
// Diferenças do aviso legado: sem faixa de teste; destinatário = responsável atual; prazo ORIGINAL preservado (nenhum SLA
// reiniciado); quando o tratamento foi assumido depois do vencimento, informa quem assumiu e quando, sem atribuir a ele o atraso
// anterior; caixa de ação lateral; instruções para responder no corpo do e-mail (status, providência e previsão de término).
// Cores: CRÍTICO vermelho, ALTO/MÉDIO amarelo, BAIXO branco (texto escuro, contraste AA).

export type SsmaSeverity = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface OperationalOverdueContext extends FieldNotificationContext {
  severity: SsmaSeverity;
  /** Assunção do tratamento pelo responsável atual (quando posterior ao vencimento). */
  takeover?: { name: string; date: string } | null;
  /** Código curto visível (rastreabilidade na resposta). */
  visibleCode: string;
}

const SEVERITY_THEME: Record<SsmaSeverity, { label: string; background: string; border: string; text: string }> = {
  CRITICA: { label: "CRÍTICO", background: "#fde2e1", border: "#b91c1c", text: "#111827" },
  ALTA: { label: "ALTO", background: "#fef3c7", border: "#b45309", text: "#111827" },
  MEDIA: { label: "MÉDIO", background: "#fef9c3", border: "#a16207", text: "#111827" },
  BAIXA: { label: "BAIXO", background: "#ffffff", border: "#6b7280", text: "#111827" },
};

export function replyInstructionFor(severity: SsmaSeverity): string {
  return severity === "CRITICA" || severity === "ALTA"
    ? "Responda a este e-mail, no próprio corpo, informando o status, a providência e a previsão de conclusão com DATA E HORÁRIO (horário de Brasília). Ex.: \"Tomando providências: isolamento da área e orientação da equipe. Conclusão prevista para 20/11/2026 às 15h\"."
    : "Responda a este e-mail, no próprio corpo, informando o status, a providência e a data prevista de conclusão. Ex.: \"Em andamento: ajuste do procedimento. Previsão: 25/11/2026\".";
}

export function buildOperationalOverdueActionEmail(ctx: OperationalOverdueContext): MailContent {
  const theme = SEVERITY_THEME[ctx.severity];
  const subject = `[RISCO ${theme.label}] ACC - ${ctx.projectName} - Ação corretiva SSMA em atraso - ${ctx.category} - ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`;
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
    `RISCO ${theme.label} · AÇÃO CORRETIVA SSMA EM ATRASO`,
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
  const rows = facts
    .map(
      ([k, v]) =>
        `<tr><td style="vertical-align:top;padding:3px 12px 3px 0;color:${theme.text}"><strong>${esc(k)}</strong></td><td style="padding:3px 0;color:${theme.text}">${esc(v)}</td></tr>`
    )
    .join("");
  const side =
    `<td class="acc-side" width="210" style="vertical-align:top;padding:16px;background:#ffffff;border-left:1px solid #e5e7eb">` +
    `<p style="margin:0 0 8px;font-weight:700;color:#111827">Ações</p>` +
    `<p style="margin:0 0 10px"><a href="${esc(ctx.accUrl)}" style="display:block;text-align:center;background:#111827;color:#ffffff;text-decoration:none;padding:10px 12px;border-radius:6px;font-weight:700">ABRIR NO ACC</a></p>` +
    `<p style="margin:0;color:#111827;font-size:13px"><strong>Responder por e-mail:</strong> use "Responder" e informe status, providência e previsão de término.</p>` +
    `</td>`;
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;color:#111827;font-family:Arial,sans-serif">` +
    `<tr><td style="padding:16px 0"><p style="margin:0 0 8px;font-weight:700;color:#111827">ACC · AXION CONTROLE DE CONTRATOS</p></td></tr>` +
    `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${theme.border}"><tr>` +
    `<td style="vertical-align:top;padding:16px;background:${theme.background};color:${theme.text}">` +
    `<p style="margin:0 0 10px;font-weight:700;color:${theme.text}">RISCO ${esc(theme.label)} · AÇÃO CORRETIVA SSMA EM ATRASO</p>` +
    `<p style="margin:0 0 8px;color:${theme.text}">${esc(greeting)}</p>` +
    `<p style="margin:0 0 8px;color:${theme.text}">${esc(lead)}</p>` +
    (takeoverLine ? `<p style="margin:0 0 8px;color:${theme.text}"><strong>${esc(takeoverLine)}</strong></p>` : "") +
    `<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>` +
    `<p style="margin:12px 0 0;color:${theme.text}"><strong>Como responder:</strong> ${esc(instruction)}</p>` +
    `</td>${side}</tr></table></td></tr>` +
    `<tr><td style="padding:10px 0"><p style="margin:0;color:#374151;font-size:12px">${esc(footer)}</p></td></tr></table>`;
  return { subject, text, html, operational: true };
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
    ...(ctx.outOfOrder ? ["Esta mensagem é anterior a uma atualização já registrada: foi guardada no histórico, sem alterar o status nem a previsão vigente."] : []),
    ...(ctx.pendingLine
      ? ["Responda a este e-mail com a informação pendente."]
      : ["Confira a data e o horário interpretados. Se estiverem incorretos, responda a este e-mail com a previsão correta."]),
    "A resposta e a previsão não reiniciam prazos, não apagam atrasos e não suspendem as cobranças até a conclusão da ação.",
  ];
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    "RESPOSTA REGISTRADA · AÇÃO CORRETIVA SSMA",
    "",
    greeting,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...paragraphs,
    "",
    `ABRIR NO ACC: ${ctx.accUrl}`,
  ].join("\n");
  const html =
    `<table role="presentation" width="100%" style="background:#ffffff;color:#111827;font-family:Arial,sans-serif;padding:16px"><tr><td>` +
    `<p style="font-weight:700;color:#111827">ACC · AXION CONTROLE DE CONTRATOS</p><p style="font-weight:700;color:#111827">RESPOSTA REGISTRADA · AÇÃO CORRETIVA SSMA</p>` +
    `<p style="color:#111827">${esc(greeting)}</p><table role="presentation">${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0"><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join("")}</table>` +
    paragraphs.map((p) => `<p style="color:#111827">${esc(p)}</p>`).join("") +
    `<p><a href="${esc(ctx.accUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700">ABRIR NO ACC</a></p></td></tr></table>`;
  return { subject, text, html, operational: true };
}
