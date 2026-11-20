// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node).
//
// TEMPLATE UNIVERSAL de alertas do ACC. Uma única estrutura para TODAS as áreas (Engenharia,
// Planejamento, SSMA, Contratos, Jurídico, Financeiro, Suprimentos…): os módulos de origem só
// fornecem DADOS (UniversalOccurrence); o desenho dos quatro botões, o cabeçalho com o logotipo
// oficial e as cores por gravidade vivem AQUI e em alert-box-style.ts (reaproveitado, não copiado).
//
// Os quatro botões, sempre nesta ordem: RESOLVIDO, EM ANDAMENTO, ENVIAR PARA, ESPECIALISTA.
// Cada botão é um LINK para uma página/formulário AUTENTICADO do ACC (o e-mail nunca altera dados:
// nada de GET que muda estado). Sem URL válida o botão continua no layout, mas desativado e com o
// motivo visível — nunca simula uma ação ou consulta que não está disponível.
//
// "Fale com a AXIA" NÃO é um destes botões: é o cabeçalho aplicado pelo provider (vera-email-header.ts).

import type { AlertSeverity } from "@axion/types";

import { ACC_FONT_FAMILY } from "@/lib/email/brand-style";
import {
  ALERT_TONES,
  BUTTON_COLUMN_WIDTH_PX,
  HEADER_GAP_PX,
  buildActionsPanelHtml,
  buildAlertBoxHtml,
  buildAlertHeaderHtml,
  escapeAttr,
  textStyle,
  type AlertLogoAvailability,
} from "@/lib/email/templates/alert-box-style";
import { alertRiskLevelLabels, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
import {
  buildUniversalActionButtonsHtml,
  buildUniversalActionButtonsText,
  isSafeActionUrl,
  type UniversalAction,
  type UniversalActionLinks,
  type UniversalActionsInput,
} from "@/lib/email/templates/universal-alert-actions";

// ---------------------------------------------------------------- ações (módulo universal-alert-actions.ts)
export * from "@/lib/email/templates/universal-alert-actions";

// ---------------------------------------------------------------- ocorrência

export interface UniversalEvidence {
  label: string;
  url?: string | null;
}

export interface UniversalOccurrence {
  /** Identificação estável da ocorrência (código visível ou id curto). */
  code: string;
  projectName: string;
  /** Área responsável (ex.: "SSMA", "Planejamento", "Contratos"). */
  areaLabel: string;
  severity: AlertSeverity;
  /** Cabeçalho neutro para uma confirmação cuja criticidade não está disponível. */
  headerLabel?: string;
  title: string;
  description: string;
  evidences?: UniversalEvidence[];
  responsibleName?: string | null;
  /** Prazo original, já formatado para exibição. */
  originalDeadline?: string | null;
  /** Estado vigente (ex.: "Aberto", "Em andamento"). */
  stateLabel: string;
  /** Especialista da área (ex.: "Especialista SSMA"). */
  specialistLabel: string;
  openUrl?: string | null;
  actions: UniversalActionLinks;
  unavailableReasons?: Partial<Record<UniversalAction, string>>;
  completed?: boolean;
  completedAtLabel?: string | null;
  /** Linhas adicionais "rótulo: valor" (nível de escalonamento, impacto, recomendação, exigências…), na ordem informada. */
  details?: Array<{ label: string; value: string | null | undefined }>;
  /** Parágrafos livres (ex.: resposta registrada, instrução, aviso de revisão humana). */
  notices?: string[];
  /** Instrução de resposta direta por e-mail (painel branco legível em qualquer gravidade). */
  replyInstruction?: string | null;
  /** Links secundários textuais (ex.: ações legadas por token), SEM virar botões — o layout tem só os quatro. */
  extraLinks?: Array<{ label: string; url: string }>;
}

/**
 * REGRA: os quatro botões estão presentes em TODO alerta, de qualquer área (engenharia, comercial, SSMA, financeiro…).
 * Cada botão ativo leva à ocorrência específica e à ação correspondente (link próprio do emissor; abrir o link nunca
 * altera estado). Sem link próprio — ou com link inválido — o botão fica no layout, desativado e com o motivo visível:
 * nunca é trocado por um link genérico que simule a ação.
 */
function actionsOf(o: UniversalOccurrence): UniversalActionsInput {
  return { links: o.actions, unavailableReasons: o.unavailableReasons, completed: o.completed };
}

function field(label: string, value: string | null | undefined, severity: AlertSeverity): string {
  if (!value) return "";
  const tone = ALERT_TONES[severity];
  return `<p style="margin:0 0 10px 0;${textStyle("regular", tone.text)}"><span style="${textStyle("bold", tone.text)}">${escapeAttr(label)}:</span> ${escapeAttr(value)}</p>`;
}

function completionBadgeHtml(o: UniversalOccurrence): string {
  if (!o.completed) return "";
  const when = o.completedAtLabel ? ` em ${escapeAttr(o.completedAtLabel)}` : "";
  return `<p style="margin:0 0 10px 0;"><span style="display:inline-block;background-color:#15803D;color:#ffffff;border:1px solid #14532D;border-radius:4px;padding:3px 10px;font-family:${ACC_FONT_FAMILY};font-size:16px;font-weight:700;">&#10003; CONCLUÍDO${when}</span></p>`;
}

function contentHtml(o: UniversalOccurrence): string {
  const tone = ALERT_TONES[o.severity];
  const title = o.openUrl && isSafeActionUrl(o.openUrl)
    ? `<a href="${escapeAttr(o.openUrl)}" target="_blank" rel="noopener noreferrer" style="${textStyle("bold", tone.link, "text-decoration:underline;", true)}">${escapeAttr(o.title)}</a>`
    : `<span style="${textStyle("bold", tone.text, "", true)}">${escapeAttr(o.title)}</span>`;
  const evidences = (o.evidences ?? [])
    .map((e) =>
      isSafeActionUrl(e.url)
        ? `<a href="${escapeAttr(e.url)}" target="_blank" rel="noopener noreferrer" style="${textStyle("regular", tone.link, "text-decoration:underline;")}">${escapeAttr(e.label)}</a>`
        : `<span style="${textStyle("regular", tone.text)}">${escapeAttr(e.label)}</span>`
    )
    .join(" · ");
  return [
    completionBadgeHtml(o),
    `<p style="margin:0 0 12px 0;">${title}</p>`,
    `<p style="margin:0 0 16px 0;${textStyle("regular", tone.text)}">${escapeAttr(o.description)}</p>`,
    field("Ocorrência", o.code, o.severity),
    field("Área", o.areaLabel, o.severity),
    field("Responsável atual", o.responsibleName ?? "não definido", o.severity),
    field("Prazo original", o.originalDeadline ?? null, o.severity),
    field("Estado", o.stateLabel, o.severity),
    ...(o.details ?? []).map((d) => field(d.label, d.value, o.severity)),
    ...(o.notices ?? []).map((n) => `<p style="margin:12px 0 0 0;${textStyle("regular", tone.text)}">${escapeAttr(n)}</p>`),
    o.replyInstruction
      ? `<div style="margin:20px 0 0 0;background-color:#FFFFFF;border:1px solid #D1D5DB;border-left:4px solid #7F1D1D;border-radius:6px;padding:16px 18px;"><p style="margin:0 0 8px 0;font-family:${ACC_FONT_FAMILY};font-size:16px;line-height:24px;font-weight:700;color:#111827;">Responder pelo e-mail</p><p style="margin:0;font-family:${ACC_FONT_FAMILY};font-size:16px;line-height:26px;color:#111827;">${escapeAttr(o.replyInstruction)}</p></div>`
      : "",
    (o.extraLinks ?? []).filter((l) => isSafeActionUrl(l.url)).length > 0
      ? `<p style="margin:16px 0 0 0;${textStyle("regular", tone.text)}">Outras ações: ${(o.extraLinks ?? []).filter((l) => isSafeActionUrl(l.url)).map((l) => `<a href="${escapeAttr(l.url)}" style="${textStyle("regular", tone.link, "text-decoration:underline;")}">${escapeAttr(l.label)}</a>`).join(" · ")}</p>`
      : "",
    evidences ? `<p style="margin:6px 0 0 0;${textStyle("bold", tone.text)}">Evidências: ${evidences}</p>` : "",
  ].join("");
}

/** Caixa de UMA ocorrência: cabeçalho com o logotipo oficial, conteúdo à esquerda e os quatro botões à direita. */
export function buildUniversalOccurrenceHtml(o: UniversalOccurrence, logos: AlertLogoAvailability): string {
  const riskWord = alertRiskLevelLabels[o.severity];
  const panel = buildActionsPanelHtml(buildUniversalActionButtonsHtml(actionsOf(o)), null);
  const inner = `
    ${buildAlertHeaderHtml(o.severity, riskWord, o.projectName, logos, o.headerLabel)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${HEADER_GAP_PX}px;">
      <tr>
        <td class="acc-content-col" valign="top" style="padding:0;word-break:break-word;color:${ALERT_TONES[o.severity].text};">${contentHtml(o)}</td>
        <td class="acc-actions-col" valign="top" width="${BUTTON_COLUMN_WIDTH_PX}" style="width:${BUTTON_COLUMN_WIDTH_PX}px;padding:0 0 0 22px;">${panel}</td>
      </tr>
    </table>`;
  return buildAlertBoxHtml(o.severity, inner);
}

export function buildUniversalOccurrenceText(o: UniversalOccurrence): string[] {
  return [
    `${o.headerLabel ?? `RISCO ${alertRiskLevelLabels[o.severity]}`} | ${o.projectName}`,
    ...(o.completed ? [`CONCLUÍDO${o.completedAtLabel ? ` em ${o.completedAtLabel}` : ""}`] : []),
    o.title,
    o.description,
    `Ocorrência: ${o.code}`,
    `Área: ${o.areaLabel}`,
    `Responsável atual: ${o.responsibleName ?? "não definido"}`,
    ...(o.originalDeadline ? [`Prazo original: ${o.originalDeadline}`] : []),
    `Estado: ${o.stateLabel}`,
    ...(o.details ?? []).filter((d) => d.value).map((d) => `${d.label}: ${d.value}`),
    ...(o.notices ?? []),
    ...(o.replyInstruction ? [`RESPONDER PELO E-MAIL: ${o.replyInstruction}`] : []),
    ...(o.extraLinks ?? []).filter((l) => isSafeActionUrl(l.url)).map((l) => `${l.label}: ${l.url}`),
    ...(o.evidences && o.evidences.length > 0 ? [`Evidências: ${o.evidences.map((e) => (isSafeActionUrl(e.url) ? `${e.label} (${e.url})` : e.label)).join("; ")}`] : []),
    ...(isSafeActionUrl(o.openUrl) ? [`Abrir no ACC: ${o.openUrl}`] : []),
    "Ações (abrem o ACC autenticado; nada é alterado só pelo clique):",
    ...buildUniversalActionButtonsText(actionsOf(o)),
    `Especialista da área: ${o.specialistLabel}`,
  ];
}

// ---------------------------------------------------------------- CSS responsivo

const UNIVERSAL_MOBILE_CSS = `
    .acc-content-col, .acc-actions-col { display:block !important; width:100% !important; }
    .acc-actions-col { padding:16px 0 0 0 !important; }
    .acc-actions-panel { width:100% !important; }
    .acc-buttons-wrap { width:100% !important; }
    .acc-compact-btn td { height:52px !important; }
    .acc-compact-btn a, .acc-compact-btn span { height:52px !important; line-height:52px !important; }
    table { max-width:100% !important; }`;

const STYLE_BLOCK = `<style>
  @media only screen and (max-width:640px) {${UNIVERSAL_MOBILE_CSS}
  }
</style>`;

// ---------------------------------------------------------------- e-mails

export interface BuiltUniversalEmail {
  subject: string;
  html: string;
  text: string;
  /** Imagens do logotipo que o HTML referencia por Content-ID (o chamador carrega e anexa). */
  logoNeeds: { maroon: boolean; inverted: boolean };
}

export function logoNeedsFor(severities: readonly AlertSeverity[]): { maroon: boolean; inverted: boolean } {
  const inverted = severities.some((s) => ALERT_TONES[s].logo === "inverted");
  const maroon = severities.some((s) => ALERT_TONES[s].logo === "maroon");
  return { maroon, inverted };
}

function shell(bodyHtml: string, footer: string): string {
  return `
${STYLE_BLOCK}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="820" cellpadding="0" cellspacing="0" style="width:100%;max-width:820px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        ${bodyHtml}
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:14px;line-height:20px;">${escapeAttr(footer)}</p></td></tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

const DEFAULT_FOOTER =
  "Alerta gerado pelo ACC a partir das regras do projeto. Os botões abrem o ACC autenticado: nada é registrado, transferido ou concluído apenas pelo clique no e-mail.";

export interface UniversalAlertEmailInput {
  recipientName: string | null;
  occurrence: UniversalOccurrence;
  logos: AlertLogoAvailability;
  footer?: string;
}

export function buildUniversalAlertEmail(input: UniversalAlertEmailInput): BuiltUniversalEmail {
  const o = input.occurrence;
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const greetingRow = `<tr><td style="padding:20px 24px 12px 24px;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:16px;line-height:24px;">${escapeAttr(greeting)}</p></td></tr>`;
  const boxRow = `<tr><td style="padding:0 24px 24px 24px;">${buildUniversalOccurrenceHtml(o, input.logos)}</td></tr>`;
  const html = shell(greetingRow + boxRow, input.footer ?? DEFAULT_FOOTER);
  const text = ["ACC - AXION Controle de Contratos", "", greeting, "", ...buildUniversalOccurrenceText(o), "", input.footer ?? DEFAULT_FOOTER].join("\n");
  return {
    subject: `${buildContractAlertSubject(o.projectName, o.severity)} - ${o.areaLabel.toUpperCase()} - ${o.title}`.slice(0, 200),
    html,
    text,
    logoNeeds: logoNeedsFor([o.severity]),
  };
}

export interface UniversalDigestEmailInput {
  recipientName: string | null;
  projectName: string;
  /** Linha de resumo executivo (quantidades por gravidade). */
  summaryLine: string;
  windowLabel: string;
  occurrences: UniversalOccurrence[];
  logos: AlertLogoAvailability;
  footer?: string;
  heading?: string;
  responseLink?: { label: string; url: string };
}

/**
 * Consolidado: CADA ocorrência é uma caixa com os mesmos quatro botões (conteúdo à esquerda e botões
 * empilhados à direita no desktop; texto primeiro e botões abaixo no celular). O tratamento é
 * individual: nenhum botão depende de tratar todos os itens ao mesmo tempo.
 */
export function buildUniversalDigestEmail(input: UniversalDigestEmailInput): BuiltUniversalEmail {
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const heading = input.heading ?? `Consolidado de riscos — ${input.projectName}`;
  const head = `<tr><td style="padding:20px 24px 8px 24px;"><p style="margin:0 0 8px 0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:16px;line-height:24px;">${escapeAttr(greeting)}</p><h1 style="margin:0 0 6px 0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:22px;line-height:30px;">${escapeAttr(heading)}</h1><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:16px;line-height:24px;"><strong>Resumo executivo:</strong> ${escapeAttr(input.summaryLine)}</p><p style="margin:4px 0 0 0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:14px;line-height:20px;">${escapeAttr(input.windowLabel)}</p></td></tr>`;
  const boxes = input.occurrences.map((o) => `<tr><td style="padding:0 24px 16px 24px;">${buildUniversalOccurrenceHtml(o, input.logos)}</td></tr>`).join("");
  const empty = input.occurrences.length === 0 ? `<tr><td style="padding:0 24px 16px 24px;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:14px;">Nenhuma ocorrência no período.</p></td></tr>` : "";
  const link = input.responseLink;
  const response = link && isSafeActionUrl(link.url)
    ? `<tr><td style="padding:0 24px 16px 24px;"><a href="${escapeAttr(link.url)}" style="display:inline-block;padding:10px 16px;background-color:#7F1D1D;color:#FFFFFF;border-radius:6px;text-decoration:none;font-weight:700;font-family:${ACC_FONT_FAMILY};">${escapeAttr(link.label)}</a></td></tr>`
    : "";
  const html = shell(head + boxes + empty + response, input.footer ?? DEFAULT_FOOTER);
  const text = [
    "ACC - AXION Controle de Contratos",
    `CONSOLIDADO DE RISCOS — ${input.projectName}`,
    "",
    greeting,
    `Resumo executivo: ${input.summaryLine}`,
    input.windowLabel,
    "",
    ...input.occurrences.flatMap((o) => [...buildUniversalOccurrenceText(o), "", "----", ""]),
    ...(response && link ? [`${link.label}: ${link.url}`, ""] : []),
    input.footer ?? DEFAULT_FOOTER,
  ].join("\n");
  return {
    subject: `OBRA ${input.projectName.toUpperCase()} - CONSOLIDADO DE RISCOS (${input.windowLabel})`.slice(0, 200),
    html,
    text,
    logoNeeds: logoNeedsFor(input.occurrences.map((o) => o.severity)),
  };
}
