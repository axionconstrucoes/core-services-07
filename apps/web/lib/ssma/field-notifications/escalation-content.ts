// Conteúdo (puro) das mensagens de continuidade da AÇÃO CORRETIVA SSMA: escalonamento por nível (Gestor / Diretoria) e
// previsão de conclusão vencida. Sem I/O. Mesmo padrão visual do aviso operacional (sem faixa de teste, caixa de ação lateral,
// cor por nível, contraste AA). Prazos sempre os ORIGINAIS; previsão vigente, pendência ou ausência de resposta sempre visíveis.

import type { MailContent } from "./core";
import { alertRiskLevelLabels } from "@/lib/email/templates/contract-alert-template";
import { renderSsmaAlert, ssmaOpenUrl, type SsmaSeverity } from "./content";
import type { SsmaRecordLinkTarget } from "@/lib/ssma/field-records/deep-link";

const clip = (v: string, n = 400) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

export interface SsmaFollowUpContext {
  projectName: string;
  recipientName: string | null;
  severity: SsmaSeverity;
  category: string;
  location: string;
  description: string;
  occurredAt: string;
  accUrl: string;
  /** Registro de SSMA: os botões abrem ESTE registro (sem ele, ficam desativados com o motivo). */
  recordLink?: SsmaRecordLinkTarget | null;
  visibleCode: string;
  responsibleName: string | null;
  /** Prazos ORIGINAIS da ação (formatados, horário de Brasília). */
  assumeDue: string;
  completeDue: string | null;
  /** Linha da previsão: vigente, PENDENTE (com motivo) ou ausência de resposta. */
  forecastLine: string;
  /** Atalhos "Responder por e-mail" — só em mensagens ao RESPONSÁVEL (previsão vencida); escalonamento à Matriz não leva. */
  replyByEmail?: import("@/lib/email-replies/reply-mailto").ReplyMailtoLinks | null;
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

const FOOTER =
  "Comunicação automática determinística do ACC, pelos prazos aprovados da Matriz (área SSMA/ESG). Os prazos exibidos são os originais: nenhum prazo foi reiniciado, nenhum atraso foi apagado.";

export function buildSsmaEscalationEmail(ctx: SsmaEscalationEmailContext): MailContent {
  const riskLabel = alertRiskLevelLabels[ctx.severity];
  const levelUpper = ctx.levelLabel.toUpperCase();
  const subject = `[RISCO ${riskLabel}] ACC - ${ctx.projectName} - ESCALONAMENTO ${levelUpper}${ctx.reissue ? " - REEMISSÃO (comunicação do nível não enviada antes)" : ""} - Ação corretiva SSMA em atraso - ${ctx.category} - ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`;
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
    `RISCO ${riskLabel} · ESCALONAMENTO ${levelUpper} · AÇÃO CORRETIVA SSMA EM ATRASO`,
    "",
    ...paragraphs,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Para registrar providência ou previsão, responda a este e-mail no próprio corpo ou abra no ACC.",
    `ABRIR NO ACC: ${ssmaOpenUrl(ctx)}`,
    "",
    FOOTER,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text, operational: true },
    ctx,
    { title: `ESCALONAMENTO ${levelUpper}`, description: paragraphs[1], stateLabel: "Prazo vencido",
      facts: rows, notices: paragraphs.slice(2), footer: FOOTER,
      replyInstruction: "Informe providência e previsão de término." }
  );
}

export interface SsmaForecastExpiredContext extends SsmaFollowUpContext {
  forecastAt: string; // previsão vencida (formatada)
  escalationState: string; // ex.: "Nível 3 · Diretoria (comunicações históricas aguardando decisão)"
}

export function buildSsmaForecastExpiredEmail(ctx: SsmaForecastExpiredContext): MailContent {
  const riskLabel = alertRiskLevelLabels[ctx.severity];
  const subject = `[RISCO ${riskLabel}] ACC - ${ctx.projectName} - PREVISÃO DE CONCLUSÃO VENCIDA - Ação corretiva SSMA - ${ctx.category} - ${ctx.location} [ACC-SSMA:${ctx.visibleCode}]`;
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
    `RISCO ${riskLabel} · PREVISÃO DE CONCLUSÃO VENCIDA · AÇÃO CORRETIVA SSMA`,
    "",
    ...paragraphs,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `ABRIR NO ACC: ${ssmaOpenUrl(ctx)}`,
    "",
    FOOTER,
  ].join("\n");
  return renderSsmaAlert(
    { subject, text, operational: true },
    ctx,
    { title: "PREVISÃO DE CONCLUSÃO VENCIDA", description: paragraphs[1], stateLabel: "Previsão vencida",
      facts: rows, footer: FOOTER, replyInstruction: paragraphs[2] }
  );
}
