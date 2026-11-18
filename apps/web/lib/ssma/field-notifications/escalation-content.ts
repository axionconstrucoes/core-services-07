// Conteúdo (puro) das mensagens de continuidade da AÇÃO CORRETIVA SSMA: escalonamento por nível (Gestor / Diretoria) e
// previsão de conclusão vencida. Sem I/O. Mesmo padrão visual do aviso operacional (sem faixa de teste, caixa de ação lateral,
// cor por nível, contraste AA). Prazos sempre os ORIGINAIS; previsão vigente, pendência ou ausência de resposta sempre visíveis.

import type { MailContent } from "./core";
import type { SsmaSeverity } from "./content";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v: string, n = 400) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

const THEME: Record<SsmaSeverity, { label: string; background: string; border: string }> = {
  CRITICA: { label: "CRÍTICO", background: "#fde2e1", border: "#b91c1c" },
  ALTA: { label: "ALTO", background: "#fef3c7", border: "#b45309" },
  MEDIA: { label: "MÉDIO", background: "#fef9c3", border: "#a16207" },
  BAIXA: { label: "BAIXO", background: "#ffffff", border: "#6b7280" },
};

export interface SsmaFollowUpContext {
  projectName: string;
  recipientName: string | null;
  severity: SsmaSeverity;
  category: string;
  location: string;
  description: string;
  occurredAt: string;
  accUrl: string;
  visibleCode: string;
  responsibleName: string | null;
  /** Prazos ORIGINAIS da ação (formatados, horário de Brasília). */
  assumeDue: string;
  completeDue: string | null;
  /** Linha da previsão: vigente, PENDENTE (com motivo) ou ausência de resposta. */
  forecastLine: string;
}

export interface SsmaEscalationEmailContext extends SsmaFollowUpContext {
  levelLabel: string; // "Nível 2 · Gestor" | "Nível 3 · Diretoria"
  thresholdAt: string; // limite do nível (formatado)
  gestorSkipped: boolean;
  /** Reemissão de nível vencido no passado, liberada por decisão humana auditada. */
  reissue: boolean;
  /** Aviso anterior ao responsável (data) — ou null. */
  priorNotice: string | null;
}

function frame(theme: (typeof THEME)[SsmaSeverity], title: string, paragraphs: string[], rows: Array<[string, string]>, accUrl: string, sideText: string, footer: string): string {
  const body = rows
    .map(([k, v]) => `<tr><td style="vertical-align:top;padding:3px 12px 3px 0;color:#111827"><strong>${esc(k)}</strong></td><td style="padding:3px 0;color:#111827">${esc(v)}</td></tr>`)
    .join("");
  const side =
    `<td class="acc-side" width="210" style="vertical-align:top;padding:16px;background:#ffffff;border-left:1px solid #e5e7eb">` +
    `<p style="margin:0 0 8px;font-weight:700;color:#111827">Ações</p>` +
    `<p style="margin:0 0 10px"><a href="${esc(accUrl)}" style="display:block;text-align:center;background:#111827;color:#ffffff;text-decoration:none;padding:10px 12px;border-radius:6px;font-weight:700">ABRIR NO ACC</a></p>` +
    `<p style="margin:0;color:#111827;font-size:13px">${esc(sideText)}</p></td>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;color:#111827;font-family:Arial,sans-serif">` +
    `<tr><td style="padding:16px 0"><p style="margin:0 0 8px;font-weight:700;color:#111827">ACC · AXION CONTROLE DE CONTRATOS</p></td></tr>` +
    `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${theme.border}"><tr>` +
    `<td style="vertical-align:top;padding:16px;background:${theme.background};color:#111827">` +
    `<p style="margin:0 0 10px;font-weight:700;color:#111827">${esc(title)}</p>` +
    paragraphs.map((p) => `<p style="margin:0 0 8px;color:#111827">${esc(p)}</p>`).join("") +
    `<table role="presentation" cellpadding="0" cellspacing="0">${body}</table></td>${side}</tr></table></td></tr>` +
    `<tr><td style="padding:10px 0"><p style="margin:0;color:#374151;font-size:12px">${esc(footer)}</p></td></tr></table>`
  );
}

const FOOTER =
  "Comunicação automática determinística do ACC, pelos prazos aprovados da Matriz (área SSMA/ESG). Os prazos exibidos são os originais: nenhum prazo foi reiniciado, nenhum atraso foi apagado.";

export function buildSsmaEscalationEmail(ctx: SsmaEscalationEmailContext): MailContent {
  const theme = THEME[ctx.severity];
  const levelUpper = ctx.levelLabel.toUpperCase();
  const subject = `[RISCO ${theme.label}] ACC - ${ctx.projectName} - ESCALONAMENTO ${levelUpper}${ctx.reissue ? " - REEMISSÃO (comunicação do nível não enviada antes)" : ""} - Ação corretiva SSMA em atraso - ${ctx.category} - ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`;
  const greeting = ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.";
  const paragraphs = [
    greeting,
    `Você recebe esta mensagem como ${ctx.levelLabel} da área SSMA/ESG: a ação corretiva abaixo, na obra ${ctx.projectName}, ultrapassou o prazo da etapa anterior sem conclusão.`,
    ...(ctx.gestorSkipped ? ["A etapa Nível 2 · Gestor não gerou mensagem anterior (vencida antes desta comunicação ou na mesma execução); esta é a comunicação da Diretoria."] : []),
    ...(ctx.reissue ? ["Reemissão autorizada: o limite deste nível venceu antes da ativação desta cobrança e a comunicação do nível NÃO havia sido enviada."] : []),
  ];
  const rows: Array<[string, string]> = [
    ["Nível desta comunicação", ctx.levelLabel],
    ["Limite deste nível (Matriz)", ctx.thresholdAt],
    ["Responsável atual", ctx.responsibleName ?? "não definido"],
    ["Prazo original para assumir", ctx.assumeDue],
    ["Prazo original para concluir", ctx.completeDue ?? "—"],
    ["Previsão de conclusão", ctx.forecastLine],
    ["Aviso anterior ao responsável", ctx.priorNotice ?? "—"],
    ["Categoria", ctx.category],
    ["Local", ctx.location],
    ["Fato registrado em", ctx.occurredAt],
    ["Descrição (como informada)", clip(ctx.description)],
  ];
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    `RISCO ${theme.label} · ESCALONAMENTO ${levelUpper} · AÇÃO CORRETIVA SSMA EM ATRASO`,
    "",
    ...paragraphs,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Para registrar providência ou previsão, responda a este e-mail no próprio corpo ou abra no ACC.",
    `ABRIR NO ACC: ${ctx.accUrl}`,
    "",
    FOOTER,
  ].join("\n");
  const html = frame(theme, `RISCO ${theme.label} · ESCALONAMENTO ${levelUpper}`, paragraphs, rows, ctx.accUrl, "Responder por e-mail: informe providência e previsão de término.", FOOTER);
  return { subject, text, html, operational: true };
}

export interface SsmaForecastExpiredContext extends SsmaFollowUpContext {
  forecastAt: string; // previsão vencida (formatada)
  escalationState: string; // ex.: "Nível 3 · Diretoria (comunicações históricas aguardando decisão)"
}

export function buildSsmaForecastExpiredEmail(ctx: SsmaForecastExpiredContext): MailContent {
  const theme = THEME[ctx.severity];
  const subject = `[RISCO ${theme.label}] ACC - ${ctx.projectName} - PREVISÃO DE CONCLUSÃO VENCIDA - Ação corretiva SSMA - ${ctx.category} - ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`;
  const paragraphs = [
    ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.",
    `A previsão de conclusão informada para a ação corretiva abaixo (${ctx.forecastAt}, horário de Brasília) venceu e a ação não foi concluída.`,
    "Responda a este e-mail com a nova previsão (data e horário) e a justificativa, ou conclua a ação no ACC com a evidência.",
  ];
  const rows: Array<[string, string]> = [
    ["Previsão informada (VENCIDA)", ctx.forecastAt],
    ["Situação do escalonamento", ctx.escalationState],
    ["Prazo original para assumir", ctx.assumeDue],
    ["Prazo original para concluir", ctx.completeDue ?? "—"],
    ["Categoria", ctx.category],
    ["Local", ctx.location],
    ["Fato registrado em", ctx.occurredAt],
    ["Descrição (como informada)", clip(ctx.description)],
  ];
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    `RISCO ${theme.label} · PREVISÃO DE CONCLUSÃO VENCIDA · AÇÃO CORRETIVA SSMA`,
    "",
    ...paragraphs,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `ABRIR NO ACC: ${ctx.accUrl}`,
    "",
    FOOTER,
  ].join("\n");
  const html = frame(theme, `RISCO ${theme.label} · PREVISÃO DE CONCLUSÃO VENCIDA`, paragraphs, rows, ctx.accUrl, "Responder por e-mail: nova previsão (data e horário) e justificativa.", FOOTER);
  return { subject, text, html, operational: true };
}
