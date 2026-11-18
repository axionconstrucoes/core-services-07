// Templates dos e-mails de alerta de risco — puros, sem I/O, mesmo
// padrão institucional ACC (cartão com fundo pela gravidade do risco,
// vermelho/amarelo/branco; dados em painel branco com texto preto, remetente "ACC AXION CONTROLE DE CONTRATOS"
// resolvido pelo provider, assinatura anexada por quem envia).
//
// Conteúdo mínimo (imediato/escalonamento): projeto, grau de risco,
// origem, resumo, impacto, prazo aplicável, nível atual, responsável,
// data/hora, recomendação, link seguro para o ACC (rota do projeto — sem
// token, sem URL assinada), necessidade de confirmação e de justificativa.
// Consolidado: resumo executivo, quantidade por risco, itens Médios,
// itens Baixos, prazos, responsáveis e links individuais.
// Nunca: tokens, anexos, conteúdo contratual extenso, dados de outro projeto.

import type { AlertSeverity } from "@axion/types";

import type { EmailActionButton } from "@/lib/email-actions/render-buttons";
import { renderEmailActionButtonsHtml, renderEmailActionButtonsText } from "@/lib/email-actions/render-buttons";
import { alertRiskLevelLabels, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
import { slaAreaLabels } from "@/lib/labels";
import type { SlaRiskLevel } from "@/lib/sla/types";

import { ALERT_ACTION_LABELS, type AlertActionType, type DigestContent, type DigestItem, type ImmediateAlertContent } from "./types";

export const RISK_LEVEL_TO_SEVERITY: Record<SlaRiskLevel, AlertSeverity> = {
  LOW: "BAIXA",
  MEDIUM: "MEDIA",
  HIGH: "ALTA",
  CRITICAL: "CRITICA",
};

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatDateTimeBR(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

// ------------------------------------------------------------------
// Tema OPERACIONAL por grau de risco (alertas reais). Fundo do cartão:
// vermelho para CRÍTICO, amarelo para ALTO e MÉDIO, branco para BAIXO.
// Os dados ficam num painel BRANCO interno (texto preto) e as ações numa
// coluna lateral de caixas brancas — legibilidade (WCAG AA) independe da
// cor de fundo. Contrastes conferidos em scripts/test-risk-alert-email-theme.mjs.
// ------------------------------------------------------------------
export interface RiskEmailTheme {
  /** Fundo do cartão (faixa de severidade). */
  background: string;
  /** Texto sobre o fundo do cartão (título, saudação, rótulo de risco). */
  foreground: string;
  /** Borda do cartão. */
  border: string;
}

export const RISK_EMAIL_THEMES: Record<SlaRiskLevel, RiskEmailTheme> = {
  CRITICAL: { background: "#B91C1C", foreground: "#FFFFFF", border: "#7F1D1D" },
  HIGH: { background: "#FDE047", foreground: "#111827", border: "#A16207" },
  MEDIUM: { background: "#FEF08A", foreground: "#111827", border: "#A16207" },
  LOW: { background: "#FFFFFF", foreground: "#111827", border: "#D1D5DB" },
};

/** Instrução de resposta direta no corpo do e-mail (status + previsão), conforme o grau de risco. */
export function replyInstructionFor(riskLevel: SlaRiskLevel): string {
  const needsTime = riskLevel === "HIGH" || riskLevel === "CRITICAL";
  return needsTime
    ? 'Responda a este e-mail com o status e a previsão de conclusão com DATA e HORÁRIO (Brasília). Ex.: "Em andamento. Conclusão prevista para 20/11/2026 às 15h." A resposta não suspende prazos nem escalonamentos.'
    : 'Responda a este e-mail com o status e a DATA prevista de conclusão. Ex.: "Tomando providências. Conclusão prevista para 20/11/2026." A resposta não suspende prazos.';
}

const PANEL_STYLE = "background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:6px;";
const SIDE_BOX_STYLE = "display:block;box-sizing:border-box;width:100%;margin:0 0 8px 0;padding:10px 12px;background-color:#FFFFFF;color:#111827;border:1px solid #111827;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;text-align:center;";
const SIDE_PRIMARY_STYLE = "display:block;box-sizing:border-box;width:100%;margin:0 0 8px 0;padding:10px 12px;background-color:#111827;color:#FFFFFF;border:1px solid #111827;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;text-align:center;";

function sideBox(href: string, label: string, primary = false): string {
  return `<a href="${escapeHtml(href)}" style="${primary ? SIDE_PRIMARY_STYLE : SIDE_BOX_STYLE}">${escapeHtml(label)}</a>`;
}

/**
 * Cartão com duas colunas: conteúdo (esquerda) e caixas de ação (direita). Técnica híbrida:
 * as colunas são blocos inline-block que EMPILHAM em telas estreitas (Gmail/Apple Mail no celular);
 * no Outlook (MSO) uma tabela condicional mantém as duas colunas lado a lado.
 */
function renderAlertCard(theme: RiskEmailTheme, header: string, main: string, side: string, footer: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background-color:${theme.background};border:2px solid ${theme.border};border-radius:8px;" data-acc-risk-theme="1">
      <tr><td style="padding:18px 20px 8px 20px;color:${theme.foreground};font-family:Arial,Helvetica,sans-serif;">${header}</td></tr>
      <tr><td style="padding:8px 12px 12px 12px;font-size:0;" valign="top">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td width="400" valign="top"><![endif]-->
        <div style="display:inline-block;vertical-align:top;width:100%;max-width:400px;font-size:14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px;">${main}</td></tr></table>
        </div>
        <!--[if mso]></td><td width="200" valign="top"><![endif]-->
        <div style="display:inline-block;vertical-align:top;width:100%;max-width:200px;font-size:14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px;">${side}</td></tr></table>
        </div>
        <!--[if mso]></td></tr></table><![endif]-->
      </td></tr>
      <tr><td style="padding:0 20px 16px 20px;"><div style="${PANEL_STYLE}padding:10px 12px;"><p style="margin:0;color:#4B5563;font-family:Arial,Helvetica,sans-serif;font-size:11px;">${footer}</p></div></td></tr>
    </table>
  </td></tr>
</table>`.trim();
}

function renderCardHeader(theme: RiskEmailTheme, riskText: string, greeting: string, headline: string): string {
  return (
    `<p style="margin:0 0 8px 0;font-size:12px;font-weight:bold;letter-spacing:0.04em;color:${theme.foreground};">ACC · AXION CONTROLE DE CONTRATOS</p>` +
    `<p style="margin:0 0 10px 0;font-size:15px;font-weight:bold;color:${theme.foreground};">${escapeHtml(riskText)}</p>` +
    `<p style="margin:0 0 6px 0;font-size:14px;color:${theme.foreground};">${escapeHtml(greeting)}</p>` +
    `<h1 style="margin:0;font-size:18px;line-height:1.3;color:${theme.foreground};">${escapeHtml(headline)}</h1>`
  );
}

function renderReplyBox(riskLevel: SlaRiskLevel, visibleCode: string | null | undefined): string {
  const code = visibleCode ? ` Código do alerta: ${escapeHtml(visibleCode)}.` : "";
  return `<div style="${PANEL_STYLE}margin:4px 0 0 0;padding:10px 12px;"><p style="margin:0 0 4px 0;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;">Responder pelo e-mail</p><p style="margin:0;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;">${escapeHtml(replyInstructionFor(riskLevel))}${code}</p></div>`;
}

function row(label: string, value: string | null): string {
  if (!value) return "";
  return `<tr><td style="padding:6px 0;color:#000000;font-size:13px;font-weight:bold;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0 6px 12px;color:#000000;font-size:13px;">${escapeHtml(value)}</td></tr>`;
}

function textRow(label: string, value: string | null): string {
  return value ? `${label}: ${value}` : "";
}

/** Link seguro: rota interna do projeto (exige login no ACC) — nunca token/URL assinada. */
export function buildProjectLink(baseUrl: string, projectId: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanBase}/${projectId}/${cleanPath}`;
}

export interface ImmediateEmailInput {
  content: ImmediateAlertContent;
  projectId: string;
  projectName: string;
  recipientName: string | null;
  baseUrl: string;
  timeZone: string;
  generatedAt: string;
  actionButtons: EmailActionButton[];
  /** Links das 5 ações formais (página autenticada; token curto/expirável). */
  actionLinks?: Partial<Record<AlertActionType, string>>;
  /** Código visível do alerta (fallback de correlação da resposta por e-mail). */
  visibleCode?: string | null;
}

const EMAIL_ACTION_ORDER: AlertActionType[] = ["RESOLVED", "TAKING_ACTION", "FORWARD", "EXPERT_CONSULTATION", "OTHER"];
const EMAIL_ACTION_BUTTON_LABELS: Record<AlertActionType, string> = { ...ALERT_ACTION_LABELS, FORWARD: "ENVIAR PARA", EXPERT_CONSULTATION: "CONSULTAR ESPECIALISTA" };

function renderActionLinksHtml(links: Partial<Record<AlertActionType, string>> | undefined): string {
  if (!links) return "";
  return EMAIL_ACTION_ORDER.filter((a) => links[a])
    .map((a) => sideBox(links[a]!, EMAIL_ACTION_BUTTON_LABELS[a]))
    .join("");
}

function renderActionLinksText(links: Partial<Record<AlertActionType, string>> | undefined): string[] {
  if (!links) return [];
  return EMAIL_ACTION_ORDER.filter((a) => links[a]).map((a) => `${EMAIL_ACTION_BUTTON_LABELS[a]}: ${links[a]}`);
}

export function buildImmediateRiskAlertEmail(input: ImmediateEmailInput): BuiltEmail {
  const { content } = input;
  const severity = RISK_LEVEL_TO_SEVERITY[content.riskLevel];
  const riskLabel = alertRiskLevelLabels[severity];
  const isEscalation = content.kind === "ESCALATION";
  const subjectBase = buildContractAlertSubject(input.projectName, severity);
  const codeTag = input.visibleCode ? ` [ACC-ALERTA:${input.visibleCode}]` : "";
  const reissue = content.reissue ?? null;
  const subject =
    (reissue
      ? `${subjectBase} - REEMISSÃO (comunicação anterior não entregue)${isEscalation ? ` - ${content.levelLabel.toUpperCase()}` : ""}`
      : isEscalation
        ? `${subjectBase} - ESCALONADO ${content.levelLabel.toUpperCase()}`
        : content.changed
          ? `${subjectBase} - ATUALIZADO`
          : subjectBase) + codeTag;
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const headline = reissue
    ? `REEMISSÃO — risco ${riskLabel} já existente, cuja comunicação anterior NÃO foi entregue: ${content.caseTitle}`
    : isEscalation
    ? `Risco sem tratamento escalado para ${content.levelLabel}`
    : content.changed
      ? `Risco ${riskLabel} atualizado: ${content.caseTitle}`
      : `Novo risco ${riskLabel}: ${content.caseTitle}`;
  const originUrl = buildProjectLink(input.baseUrl, input.projectId, content.originPath);
  const actionUrl = content.slaActionId ? buildProjectLink(input.baseUrl, input.projectId, `acoes/${content.slaActionId}`) : buildProjectLink(input.baseUrl, input.projectId, "acoes");
  const requirements = [
    content.requiresAcknowledgment ? "confirmação de ciência obrigatória" : "confirmação de ciência não exigida",
    content.requiresJustification ? "justificativa obrigatória em caso de atraso" : "justificativa de atraso não exigida",
  ].join("; ");
  const rows: Array<[string, string | null]> = [
    ["Projeto", input.projectName],
    ["Grau de risco", riskLabel],
    ["Origem", `${content.reference} · área ${slaAreaLabels[content.area]}`],
    ["Resumo", content.summary],
    ["Impacto", content.impact || null],
    [content.deadlineLabel, formatDateTimeBR(content.deadlineAt, input.timeZone)],
    ["Nível atual", content.levelLabel],
    ["Observação do nível", content.levelNote ?? null],
    ["Nível anterior", content.previousLevelLabel],
    ["Responsável (Nível 1)", content.responsibleName],
    ["Motivo do escalonamento", content.escalationReason],
    ...(reissue
      ? ([
          ["Reemissão", `Não é um risco novo. ${reissue.note}`],
          ["Etapa atual do SLA", `${reissue.stageReachedLabel} (alcançada pelos prazos originais; nada foi reiniciado)`],
          [
            "Comunicação anterior (NÃO entregue)",
            reissue.priorCommunications.length === 0
              ? "Nenhuma comunicação anterior registrada para este caso."
              : reissue.priorCommunications
                  .map((p) => `${formatDateTimeBR(p.at, input.timeZone)} — ${p.levelLabel}${p.recipientName ? ` (${p.recipientName})` : ""}: ${p.outcome === "SUPPRESSED" ? `suprimida${p.reason ? ` (${p.reason})` : ""}` : "aceita pelo Gmail, mas entregue em outra caixa"}`)
                  .join("; "),
          ],
        ] as Array<[string, string | null]>)
      : []),
    ["Recomendação do Expert", content.recommendation],
    ["Exigências da Matriz", requirements],
    ["Gerado em", formatDateTimeBR(input.generatedAt, input.timeZone)],
  ];

  const theme = RISK_EMAIL_THEMES[content.riskLevel];
  const riskText = `RISCO ${riskLabel}${isEscalation ? ` · ${content.levelLabel.toUpperCase()}` : ""}`;
  const mainHtml = `<div style="${PANEL_STYLE}padding:10px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([l, v]) => row(l, v)).join("")}</table></div>${renderEmailActionButtonsHtml(input.actionButtons, content.caseTitle)}`;
  const sideHtml =
    sideBox(actionUrl, "Abrir no ACC", true) +
    sideBox(originUrl, "Ver evidência de origem") +
    (input.actionLinks ? `<p style="margin:6px 0 6px 0;color:${theme.foreground};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;">Ações (abrem o ACC autenticado):</p>${renderActionLinksHtml(input.actionLinks)}` : "") +
    renderReplyBox(content.riskLevel, input.visibleCode);
  const html = renderAlertCard(
    theme,
    renderCardHeader(theme, riskText, greeting, headline),
    mainHtml,
    sideHtml,
    "Alerta gerado automaticamente pelo ACC a partir da Matriz de responsabilidades e prazos do projeto — não é uma decisão de IA. Fato, inferência e recomendação estão separados na tela do ACC."
  );

  const text = [
    "ACC - AXION Controle de Contratos",
    `RISCO ${riskLabel}${isEscalation ? ` · ${content.levelLabel.toUpperCase()}` : ""}`,
    "",
    greeting,
    headline,
    "",
    ...rows.map(([l, v]) => textRow(l, v)).filter(Boolean),
    "",
    `Abrir no ACC: ${actionUrl}`,
    `Evidência de origem: ${originUrl}`,
    renderEmailActionButtonsText(input.actionButtons),
    ...(input.actionLinks ? ["", "Ações sobre este alerta (abrem o ACC autenticado para confirmação):", ...renderActionLinksText(input.actionLinks), input.visibleCode ? `Ou responda a este e-mail (código ${input.visibleCode}).` : "Ou responda a este e-mail."] : []),
    "",
    `RESPONDER PELO E-MAIL: ${replyInstructionFor(content.riskLevel)}`,
    "",
    "Alerta gerado automaticamente pelo ACC a partir da Matriz de responsabilidades e prazos do projeto.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html, text };
}

export interface DigestEmailInput {
  content: DigestContent;
  projectId: string;
  projectName: string;
  recipientName: string | null;
  baseUrl: string;
  timeZone: string;
  generatedAt: string;
}

function digestItemHtml(item: DigestItem, input: DigestEmailInput): string {
  const url = buildProjectLink(input.baseUrl, input.projectId, item.slaActionId ? `acoes/${item.slaActionId}` : item.originPath);
  const state = item.state === "NEW" ? "NOVO" : item.state === "CHANGED" ? "ALTERADO" : item.state === "CLOSED" ? "ENCERRADO" : "EM ABERTO";
  return `<li style="margin:0 0 10px 0;color:#000000;font-size:13px;"><strong>[${escapeHtml(state)}] ${escapeHtml(item.title)}</strong><br/>${escapeHtml(item.summary)}<br/><span style="color:#4B5563;">Área ${escapeHtml(slaAreaLabels[item.area])} · Prazo para assumir: ${escapeHtml(formatDateTimeBR(item.deadlineAt, input.timeZone))} · Responsável: ${escapeHtml(item.responsibleName ?? "não definido")}</span><br/><a href="${escapeHtml(url)}" style="color:#111827;">Abrir no ACC</a></li>`;
}

function digestItemText(item: DigestItem, input: DigestEmailInput): string {
  const url = buildProjectLink(input.baseUrl, input.projectId, item.slaActionId ? `acoes/${item.slaActionId}` : item.originPath);
  const state = item.state === "NEW" ? "NOVO" : item.state === "CHANGED" ? "ALTERADO" : item.state === "CLOSED" ? "ENCERRADO" : "EM ABERTO";
  return `- [${state}] ${item.title}\n  ${item.summary}\n  Área ${slaAreaLabels[item.area]} · Prazo para assumir: ${formatDateTimeBR(item.deadlineAt, input.timeZone)} · Responsável: ${item.responsibleName ?? "não definido"}\n  ${url}`;
}

export function buildRiskDigestEmail(input: DigestEmailInput): BuiltEmail {
  const { content } = input;
  const [year, month, day] = content.window.split("-");
  const subject = `OBRA ${input.projectName.toUpperCase()} - CONSOLIDADO SEMANAL DE RISCOS BAIXO/MÉDIO (${day}/${month}/${year})`;
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const summary = `${content.mediumItems.length} risco(s) MÉDIO(S), ${content.lowItems.length} risco(s) BAIXO(S) em aberto; ${content.closedItems.length} encerrado(s) desde o último consolidado.`;
  const section = (title: string, items: DigestItem[]) =>
    items.length === 0
      ? `<h2 style="margin:16px 0 4px 0;color:#000000;font-size:15px;">${escapeHtml(title)}</h2><p style="margin:0;color:#4B5563;font-size:13px;">Nenhum item.</p>`
      : `<h2 style="margin:16px 0 4px 0;color:#000000;font-size:15px;">${escapeHtml(title)}</h2><ul style="margin:0;padding-left:18px;">${items.map((i) => digestItemHtml(i, input)).join("")}</ul>`;

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
      <tr><td style="padding:20px 24px 8px 24px;"><span style="font-size:12px;font-weight:bold;letter-spacing:0.04em;color:#000000;">ACC · AXION CONTROLE DE CONTRATOS</span></td></tr>
      <tr><td style="padding:0 24px 16px 24px;">
        <p style="margin:0 0 12px 0;color:#000000;font-size:14px;">${escapeHtml(greeting)}</p>
        <h1 style="margin:0 0 8px 0;color:#000000;font-size:18px;">Consolidado semanal de riscos — ${escapeHtml(input.projectName)}</h1>
        <p style="margin:0 0 4px 0;color:#000000;font-size:14px;"><strong>Resumo executivo:</strong> ${escapeHtml(summary)}</p>
        <p style="margin:0;color:#4B5563;font-size:12px;">Janela: quarta-feira ${escapeHtml(`${day}/${month}/${year}`)} 07:00 (${escapeHtml(input.timeZone)}) · gerado em ${escapeHtml(formatDateTimeBR(input.generatedAt, input.timeZone))}</p>
        ${section(`Riscos MÉDIOS (${content.mediumItems.length})`, content.mediumItems)}
        ${section(`Riscos BAIXOS (${content.lowItems.length})`, content.lowItems)}
        ${content.closedItems.length > 0 ? section(`Encerrados desde o último consolidado (${content.closedItems.length})`, content.closedItems) : ""}
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;"><p style="margin:0;color:#6b7280;font-size:11px;">Riscos BAIXO e MÉDIO não geram e-mail individual: são reunidos neste consolidado às quartas-feiras, 07:00 (${escapeHtml(input.timeZone)}). Alertas ALTO e CRÍTICO são enviados imediatamente.</p></td></tr>
    </table>
  </td></tr>
</table>`.trim();

  const text = [
    "ACC - AXION Controle de Contratos",
    `CONSOLIDADO SEMANAL DE RISCOS — ${input.projectName}`,
    "",
    greeting,
    `Resumo executivo: ${summary}`,
    `Janela: quarta-feira ${day}/${month}/${year} 07:00 (${input.timeZone}) · gerado em ${formatDateTimeBR(input.generatedAt, input.timeZone)}`,
    "",
    `RISCOS MÉDIOS (${content.mediumItems.length})`,
    ...(content.mediumItems.length ? content.mediumItems.map((i) => digestItemText(i, input)) : ["Nenhum item."]),
    "",
    `RISCOS BAIXOS (${content.lowItems.length})`,
    ...(content.lowItems.length ? content.lowItems.map((i) => digestItemText(i, input)) : ["Nenhum item."]),
    ...(content.closedItems.length ? ["", `ENCERRADOS DESDE O ÚLTIMO CONSOLIDADO (${content.closedItems.length})`, ...content.closedItems.map((i) => digestItemText(i, input))] : []),
  ].join("\n");

  return { subject, html, text };
}

// ------------------------------------------------------------------
// E-mails de acompanhamento na MESMA thread do alerta: encaminhamento
// (ENVIAR P/), devolução por falta de ação, resposta do Expert e
// confirmação de ação. Mesmo padrão institucional; sem anexos/tokens.
// ------------------------------------------------------------------
export interface FollowUpEmailInput {
  kind: "FORWARD" | "RETURNED" | "EXPERT_ANSWER" | "ACTION_CONFIRMATION";
  projectId: string;
  projectName: string;
  recipientName: string | null;
  baseUrl: string;
  timeZone: string;
  generatedAt: string;
  caseId: string;
  caseTitle: string;
  riskLevel: SlaRiskLevel;
  visibleCode: string | null;
  /** Pares rótulo/valor específicos do tipo (responsável anterior/novo, prazo, instrução, recomendação...). */
  rows: Array<[string, string | null]>;
  /** Parágrafos livres (ex.: resposta do Expert — recomenda, não executa). */
  paragraphs?: string[];
  requiresHumanReview?: boolean;
  actionLinks?: Partial<Record<AlertActionType, string>>;
}

const FOLLOW_UP_TITLES: Record<FollowUpEmailInput["kind"], string> = {
  FORWARD: "Alerta encaminhado para você",
  RETURNED: "Alerta devolvido ao responsável anterior (sem ação do encaminhado)",
  EXPERT_ANSWER: "Resposta do Expert (recomendação — revisão humana)",
  ACTION_CONFIRMATION: "Ação registrada no alerta",
};

export function buildAlertFollowUpEmail(input: FollowUpEmailInput): BuiltEmail {
  const severity = RISK_LEVEL_TO_SEVERITY[input.riskLevel];
  const riskLabel = alertRiskLevelLabels[severity];
  const codeTag = input.visibleCode ? ` [ACC-ALERTA:${input.visibleCode}]` : "";
  const subject = `${buildContractAlertSubject(input.projectName, severity)} - ${FOLLOW_UP_TITLES[input.kind].toUpperCase()}${codeTag}`;
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const alertUrl = buildProjectLink(input.baseUrl, input.projectId, `alertas/${input.caseId}`);
  const rows: Array<[string, string | null]> = [["Projeto", input.projectName], ["Grau de risco", riskLabel], ["Alerta", input.caseTitle], ...input.rows, ["Gerado em", formatDateTimeBR(input.generatedAt, input.timeZone)]];
  const review = input.requiresHumanReview ? `<p style="margin:0;color:#7F1D1D;font-size:13px;font-weight:bold;">O Expert apenas recomenda: nenhuma ação foi executada e o alerta continua aberto até decisão humana.</p>` : "";
  const theme = RISK_EMAIL_THEMES[input.riskLevel];
  const mainHtml =
    (input.paragraphs ?? []).map((p) => `<div style="${PANEL_STYLE}padding:10px 12px;margin:0 0 8px 0;"><p style="margin:0;color:#000000;font-size:14px;white-space:pre-wrap;">${escapeHtml(p)}</p></div>`).join("") +
    (review ? `<div style="${PANEL_STYLE}padding:10px 12px;margin:0 0 8px 0;">${review}</div>` : "") +
    `<div style="${PANEL_STYLE}padding:10px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([l, v]) => row(l, v)).join("")}</table></div>`;
  const sideHtml = sideBox(alertUrl, "Abrir alerta no ACC", true) + renderActionLinksHtml(input.actionLinks) + renderReplyBox(input.riskLevel, input.visibleCode);
  const html = renderAlertCard(
    theme,
    renderCardHeader(theme, `RISCO ${riskLabel}`, greeting, FOLLOW_UP_TITLES[input.kind]),
    mainHtml,
    sideHtml,
    "Mensagem gerada pelo ACC na conversa deste alerta. Você pode responder diretamente a este e-mail."
  );
  const text = [
    "ACC - AXION Controle de Contratos",
    `RISCO ${riskLabel} · ${FOLLOW_UP_TITLES[input.kind]}`,
    "",
    greeting,
    ...(input.paragraphs ?? []),
    ...(input.requiresHumanReview ? ["O Expert apenas recomenda: nenhuma ação foi executada e o alerta continua aberto até decisão humana."] : []),
    "",
    ...rows.map(([l, v]) => textRow(l, v)).filter(Boolean),
    "",
    `Abrir alerta no ACC: ${alertUrl}`,
    ...renderActionLinksText(input.actionLinks),
    "",
    `RESPONDER PELO E-MAIL: ${replyInstructionFor(input.riskLevel)}`,
  ].join("\n");
  return { subject, html, text };
}
