// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node).
//
// VARIANTE "INFORMATIVA" do alerta universal do ACC (frente N4). O template universal (templates/**) pertence à frente
// N3 e NÃO é alterado: este módulo reaproveita só as peças visuais exportadas (cabeçalho com logotipo, caixa por
// gravidade, tipografia) e substitui o painel dos quatro botões.
//
// Classificação pela NATUREZA do alerta:
//   INFORMATIVE      — o ACC não tem operação a registrar a partir deste aviso. Sem os quatro botões
//                      (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA), sem "Responder ao ACC":
//                      só um link de CONSULTA. Nada é prometido que o sistema não faça.
//   ACTION_REQUIRED  — existe tratamento operacional REAL no ACC para este destinatário; o e-mail traz UM botão para a
//                      tela autenticada onde a ação é registrada (o clique não registra nada sozinho) e diz qual é a ação.
// Os quatro botões do caso de risco NÃO se aplicam a nenhuma das duas variantes (não há caso de risco por trás).

import type { AlertSeverity } from "@axion/types";

import { ACC_FONT_FAMILY } from "./brand-style";
import { ALERT_TONES, HEADER_GAP_PX, buildAlertBoxHtml, buildAlertHeaderHtml, escapeAttr, textStyle, type AlertLogoAvailability } from "./templates/alert-box-style";
import { alertRiskLevelLabels } from "./templates/contract-alert-template";

export type AlertNature = "INFORMATIVE" | "ACTION_REQUIRED";

/** Tipos de alerta que saem pela variante informativa (as rotinas especiais sem caso de risco). */
export type InformativeAlertKind = "SSMA_ACCIDENT" | "SYSTEM_HEALTH" | "VERSION_IMPACT_REVIEW";

export interface InformativeLink {
  label: string;
  url: string;
}

export interface InformativeAlertInput {
  nature: AlertNature;
  recipientName: string | null;
  projectName: string;
  severity: AlertSeverity;
  areaLabel: string;
  title: string;
  description: string;
  /** Identificação estável (código curto do registro), quando houver. */
  occurrenceCode?: string | null;
  details: Array<{ label: string; value: string }>;
  /** Link de CONSULTA (sempre presente). */
  consultLink: InformativeLink;
  /** Só em ACTION_REQUIRED: a tela onde a ação existe e o que deve ser feito nela. */
  action?: { link: InformativeLink; instruction: string } | null;
  footer: string;
  logos: AlertLogoAvailability;
  /** Assunto completo (cada emissor mantém seu padrão de assunto). */
  subject: string;
}

export interface BuiltInformativeEmail {
  subject: string;
  html: string;
  text: string;
  nature: AlertNature;
  logoNeeds: { maroon: boolean; inverted: boolean };
}

export const INFORMATIVE_NOTICE = "Alerta informativo: não há ação a registrar no ACC a partir deste e-mail. Use o link abaixo apenas para consulta.";

/** URL segura para link de e-mail: só https (ou http em ambiente local), sem javascript:/mailto:. */
export function isSafeInformativeUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname));
  } catch {
    return false;
  }
}

function button(link: InformativeLink, severity: AlertSeverity): string {
  const tone = ALERT_TONES[severity];
  return `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;background-color:#7F1D1D;color:#FFFFFF;border:1px solid ${tone.border};border-radius:6px;text-decoration:none;font-weight:700;font-family:${ACC_FONT_FAMILY};font-size:16px;line-height:24px;">${escapeAttr(link.label)}</a>`;
}

export function buildInformativeAlertEmail(input: InformativeAlertInput): BuiltInformativeEmail {
  if (input.nature === "ACTION_REQUIRED" && (!input.action || !isSafeInformativeUrl(input.action.link.url))) {
    throw new Error("Alerta que exige ação precisa apontar para o tratamento operacional real (link seguro).");
  }
  if (!isSafeInformativeUrl(input.consultLink.url)) throw new Error("Link de consulta inválido.");
  const severity = input.severity;
  const tone = ALERT_TONES[severity];
  const riskWord = alertRiskLevelLabels[severity];
  const field = (label: string, value: string | null | undefined) =>
    value ? `<p style="margin:0 0 10px 0;${textStyle("regular", tone.text)}"><span style="${textStyle("bold", tone.text)}">${escapeAttr(label)}:</span> ${escapeAttr(value)}</p>` : "";
  const banner =
    input.nature === "INFORMATIVE"
      ? `<p data-acc-nature="INFORMATIVE" style="margin:0 0 14px 0;${textStyle("bold", tone.text)}">ALERTA INFORMATIVO</p>`
      : `<p data-acc-nature="ACTION_REQUIRED" style="margin:0 0 14px 0;${textStyle("bold", tone.text)}">AÇÃO NECESSÁRIA: ${escapeAttr(input.action?.instruction ?? "")}</p>`;
  const cta =
    input.nature === "ACTION_REQUIRED" && input.action
      ? `<p style="margin:18px 0 0 0;">${button(input.action.link, severity)}</p><p style="margin:12px 0 0 0;${textStyle("regular", tone.text)}">Consulta: <a href="${escapeAttr(input.consultLink.url)}" target="_blank" rel="noopener noreferrer" style="${textStyle("regular", tone.link, "text-decoration:underline;")}">${escapeAttr(input.consultLink.label)}</a></p>`
      : `<p style="margin:18px 0 0 0;${textStyle("regular", tone.text)}">${escapeAttr(INFORMATIVE_NOTICE)}</p><p style="margin:12px 0 0 0;">${button(input.consultLink, severity)}</p>`;
  const content = [
    banner,
    `<p style="margin:0 0 12px 0;${textStyle("bold", tone.text, "", true)}">${escapeAttr(input.title)}</p>`,
    `<p style="margin:0 0 16px 0;${textStyle("regular", tone.text)}">${escapeAttr(input.description)}</p>`,
    field("Ocorrência", input.occurrenceCode ?? null),
    field("Área", input.areaLabel),
    ...input.details.map((d) => field(d.label, d.value)),
    cta,
  ].join("");
  const inner = `${buildAlertHeaderHtml(severity, riskWord, input.projectName, input.logos)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${HEADER_GAP_PX}px;"><tr><td valign="top" style="padding:0;word-break:break-word;color:${tone.text};">${content}</td></tr></table>`;
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="820" cellpadding="0" cellspacing="0" style="width:100%;max-width:820px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:20px 24px 12px 24px;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:16px;line-height:24px;">${escapeAttr(greeting)}</p></td></tr>
        <tr><td style="padding:0 24px 24px 24px;">${buildAlertBoxHtml(severity, inner)}</td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:14px;line-height:20px;">${escapeAttr(input.footer)}</p></td></tr>
      </table>
    </td>
  </tr>
</table>`.trim();
  const text = [
    "ACC - AXION Controle de Contratos",
    `RISCO ${riskWord} | ${input.projectName}`,
    input.nature === "INFORMATIVE" ? "ALERTA INFORMATIVO" : `AÇÃO NECESSÁRIA: ${input.action?.instruction ?? ""}`,
    "",
    greeting,
    "",
    input.title,
    input.description,
    ...(input.occurrenceCode ? [`Ocorrência: ${input.occurrenceCode}`] : []),
    `Área: ${input.areaLabel}`,
    ...input.details.filter((d) => d.value).map((d) => `${d.label}: ${d.value}`),
    "",
    ...(input.nature === "ACTION_REQUIRED" && input.action ? [`${input.action.link.label}: ${input.action.link.url}`] : [INFORMATIVE_NOTICE]),
    `${input.consultLink.label}: ${input.consultLink.url}`,
    "",
    input.footer,
  ].join("\n");
  const logo = tone.logo === "inverted" ? { maroon: false, inverted: true } : { maroon: true, inverted: false };
  return { subject: input.subject.slice(0, 200), html, text, nature: input.nature, logoNeeds: logo };
}

/**
 * Natureza de cada rotina especial (decisão documentada em docs/arquitetura/acc-envio-n4-20261121.md):
 *  - SSMA_ACCIDENT: o ACC NÃO tem fluxo de tratamento/investigação do acidente (o formulário é final; só existe a revisão
 *    de duplicidade pelo Administrador) => INFORMATIVE, consulta em Registros SSMA.
 *  - SYSTEM_HEALTH: a Auditoria é somente leitura; a correção é técnica, fora do ACC => INFORMATIVE.
 *  - VERSION_IMPACT_REVIEW: para o ORÇAMENTISTA DESIGNADO (encaminhado ao Orçamento) há tratamento real —
 *    submit_construmanager_budget_response em Integrações => ACTION_REQUIRED; para a gestão (aviso obrigatório) => INFORMATIVE.
 */
export function classifyInformativeAlert(kind: InformativeAlertKind, context: { isDesignatedBudgetReviewer?: boolean } = {}): AlertNature {
  if (kind === "VERSION_IMPACT_REVIEW" && context.isDesignatedBudgetReviewer === true) return "ACTION_REQUIRED";
  return "INFORMATIVE";
}
