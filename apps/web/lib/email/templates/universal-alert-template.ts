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
  BUTTON_FONT_SIZE_PX,
  BUTTON_HEIGHT_PX,
  BUTTON_WIDTH_PX,
  HEADER_GAP_PX,
  buildActionsPanelHtml,
  buildAlertBoxHtml,
  buildAlertHeaderHtml,
  buildCompactButtonHtml,
  escapeAttr,
  textStyle,
  type AlertLogoAvailability,
} from "@/lib/email/templates/alert-box-style";
import { alertRiskLevelLabels, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";

// ---------------------------------------------------------------- ações

export type UniversalAction = "RESOLVIDO" | "EM_ANDAMENTO" | "ENVIAR_PARA" | "ESPECIALISTA";

export const UNIVERSAL_ACTION_ORDER: readonly UniversalAction[] = ["RESOLVIDO", "EM_ANDAMENTO", "ENVIAR_PARA", "ESPECIALISTA"];

export const UNIVERSAL_ACTION_STYLES: Record<UniversalAction, { background: string; color: string; label: string }> = {
  RESOLVIDO: { background: "#1B2A4A", color: "#ffffff", label: "RESOLVIDO" },
  EM_ANDAMENTO: { background: "#15803D", color: "#ffffff", label: "EM ANDAMENTO" },
  ENVIAR_PARA: { background: "#F97316", color: "#ffffff", label: "ENVIAR PARA" },
  ESPECIALISTA: { background: "#7F1D1D", color: "#ffffff", label: "ESPECIALISTA" },
};

const UNIVERSAL_ACTION_TITLES: Record<UniversalAction, string> = {
  RESOLVIDO: "Abre o registro da solução no ACC (justificativa e evidências quando exigidas) — nada é concluído por este clique.",
  EM_ANDAMENTO: "Abre o formulário de providência e previsão de conclusão no ACC — não reinicia prazos nem suspende escalonamentos.",
  ENVIAR_PARA: "Abre a lista de membros ativos desta obra no ACC — nada é transferido até você confirmar.",
  ESPECIALISTA: "Abre a consulta ao especialista da área no ACC — a consulta não altera o estado da ação.",
};

export type UniversalActionLinks = Partial<Record<UniversalAction, string | null | undefined>>;

const DISABLED_BACKGROUND = "#E5E7EB";
const DISABLED_COLOR = "#4B5563";

/** Só http(s): qualquer outro esquema (javascript:, data:…) é tratado como "sem link". */
export function isSafeActionUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^https?:\/\/[^\s]+$/i.test(value.trim());
}

function disabledButtonHtml(label: string, reason: string, isFirst: boolean): string {
  const w = BUTTON_WIDTH_PX;
  const h = BUTTON_HEIGHT_PX;
  return `<table class="acc-compact-btn acc-btn-disabled" role="presentation" align="center" width="${w}" cellpadding="0" cellspacing="0" style="width:${w}px;margin:${isFirst ? "0" : "8px"} auto 0 auto;border-collapse:separate;"><tr><td width="${w}" height="${h}" align="center" bgcolor="${DISABLED_BACKGROUND}" style="width:${w}px;height:${h}px;background-color:${DISABLED_BACKGROUND};border-radius:6px;text-align:center;"><span title="${escapeAttr(reason)}" aria-disabled="true" style="display:block;width:${w}px;height:${h}px;line-height:${h}px;color:${DISABLED_COLOR};font-family:${ACC_FONT_FAMILY};font-size:${BUTTON_FONT_SIZE_PX}px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;">${escapeAttr(label)}</span></td></tr></table><p class="acc-btn-reason" style="margin:4px 0 0 0;text-align:center;font-family:${ACC_FONT_FAMILY};font-size:11px;line-height:14px;color:${DISABLED_COLOR};">${escapeAttr(reason)}</p>`;
}

export interface UniversalActionsInput {
  links: UniversalActionLinks;
  /** Motivo exibido quando uma ação não está disponível (ex.: especialista indisponível). */
  unavailableReasons?: Partial<Record<UniversalAction, string>>;
  /** Ocorrência concluída: os quatro botões continuam no layout, desativados. */
  completed?: boolean;
}

function actionState(action: UniversalAction, input: UniversalActionsInput): { url: string | null; reason: string } {
  if (input.completed) return { url: null, reason: "Ocorrência concluída." };
  const url = input.links[action];
  if (isSafeActionUrl(url)) return { url: url.trim(), reason: "" };
  return { url: null, reason: input.unavailableReasons?.[action] ?? "Indisponível no momento." };
}

/** Os quatro botões na ordem obrigatória. */
export function buildUniversalActionButtonsHtml(input: UniversalActionsInput): string {
  return UNIVERSAL_ACTION_ORDER.map((action, index) => {
    const style = UNIVERSAL_ACTION_STYLES[action];
    const state = actionState(action, input);
    return state.url ? buildCompactButtonHtml(state.url, style, UNIVERSAL_ACTION_TITLES[action], index === 0) : disabledButtonHtml(style.label, state.reason, index === 0);
  }).join("");
}

export function buildUniversalActionButtonsText(input: UniversalActionsInput): string[] {
  return UNIVERSAL_ACTION_ORDER.map((action) => {
    const label = UNIVERSAL_ACTION_STYLES[action].label;
    const state = actionState(action, input);
    return state.url ? `${label}: ${state.url}` : `${label}: indisponível (${state.reason})`;
  });
}

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
}

function actionsOf(o: UniversalOccurrence): UniversalActionsInput {
  return { links: o.actions, unavailableReasons: o.unavailableReasons, completed: o.completed };
}

function field(label: string, value: string | null | undefined, severity: AlertSeverity): string {
  if (!value) return "";
  const tone = ALERT_TONES[severity];
  return `<p style="margin:0 0 6px 0;${textStyle("regular", tone.text)}"><span style="${textStyle("bold", tone.text)}">${escapeAttr(label)}:</span> ${escapeAttr(value)}</p>`;
}

function completionBadgeHtml(o: UniversalOccurrence): string {
  if (!o.completed) return "";
  const when = o.completedAtLabel ? ` em ${escapeAttr(o.completedAtLabel)}` : "";
  return `<p style="margin:0 0 10px 0;"><span style="display:inline-block;background-color:#15803D;color:#ffffff;border:1px solid #14532D;border-radius:4px;padding:3px 10px;font-family:${ACC_FONT_FAMILY};font-size:13px;font-weight:700;">&#10003; CONCLUÍDO${when}</span></p>`;
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
    `<p style="margin:0 0 8px 0;">${title}</p>`,
    `<p style="margin:0 0 10px 0;${textStyle("regular", tone.text)}">${escapeAttr(o.description)}</p>`,
    field("Ocorrência", o.code, o.severity),
    field("Área", o.areaLabel, o.severity),
    field("Responsável atual", o.responsibleName ?? "não definido", o.severity),
    field("Prazo original", o.originalDeadline ?? null, o.severity),
    field("Estado", o.stateLabel, o.severity),
    evidences ? `<p style="margin:6px 0 0 0;${textStyle("bold", tone.text)}">Evidências: ${evidences}</p>` : "",
  ].join("");
}

/** Caixa de UMA ocorrência: cabeçalho com o logotipo oficial, conteúdo à esquerda e os quatro botões à direita. */
export function buildUniversalOccurrenceHtml(o: UniversalOccurrence, logos: AlertLogoAvailability): string {
  const riskWord = alertRiskLevelLabels[o.severity];
  const panel = buildActionsPanelHtml(buildUniversalActionButtonsHtml(actionsOf(o)), null);
  const inner = `
    ${buildAlertHeaderHtml(o.severity, riskWord, o.projectName, logos)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${HEADER_GAP_PX}px;">
      <tr>
        <td class="acc-content-col" valign="top" style="padding:0;word-break:break-word;color:${ALERT_TONES[o.severity].text};">${contentHtml(o)}</td>
        <td class="acc-actions-col" valign="top" width="${BUTTON_COLUMN_WIDTH_PX}" style="width:${BUTTON_COLUMN_WIDTH_PX}px;padding:0 0 0 16px;">${panel}</td>
      </tr>
    </table>`;
  return buildAlertBoxHtml(o.severity, inner);
}

export function buildUniversalOccurrenceText(o: UniversalOccurrence): string[] {
  return [
    `RISCO ${alertRiskLevelLabels[o.severity]} | ${o.projectName}`,
    ...(o.completed ? [`CONCLUÍDO${o.completedAtLabel ? ` em ${o.completedAtLabel}` : ""}`] : []),
    o.title,
    o.description,
    `Ocorrência: ${o.code}`,
    `Área: ${o.areaLabel}`,
    `Responsável atual: ${o.responsibleName ?? "não definido"}`,
    ...(o.originalDeadline ? [`Prazo original: ${o.originalDeadline}`] : []),
    `Estado: ${o.stateLabel}`,
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
    .acc-compact-btn td { height:44px !important; }
    .acc-compact-btn a, .acc-compact-btn span { height:44px !important; line-height:44px !important; }
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
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:12px;">${escapeAttr(footer)}</p></td></tr>
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
  const greetingRow = `<tr><td style="padding:20px 24px 12px 24px;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:14px;">${escapeAttr(greeting)}</p></td></tr>`;
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
}

/**
 * Consolidado: CADA ocorrência é uma caixa com os mesmos quatro botões (conteúdo à esquerda e botões
 * empilhados à direita no desktop; texto primeiro e botões abaixo no celular). O tratamento é
 * individual: nenhum botão depende de tratar todos os itens ao mesmo tempo.
 */
export function buildUniversalDigestEmail(input: UniversalDigestEmailInput): BuiltUniversalEmail {
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const head = `<tr><td style="padding:20px 24px 8px 24px;"><p style="margin:0 0 8px 0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:14px;">${escapeAttr(greeting)}</p><h1 style="margin:0 0 6px 0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:18px;">Consolidado de riscos — ${escapeAttr(input.projectName)}</h1><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#111827;font-size:14px;"><strong>Resumo executivo:</strong> ${escapeAttr(input.summaryLine)}</p><p style="margin:4px 0 0 0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:12px;">${escapeAttr(input.windowLabel)}</p></td></tr>`;
  const boxes = input.occurrences.map((o) => `<tr><td style="padding:0 24px 16px 24px;">${buildUniversalOccurrenceHtml(o, input.logos)}</td></tr>`).join("");
  const empty = input.occurrences.length === 0 ? `<tr><td style="padding:0 24px 16px 24px;"><p style="margin:0;font-family:${ACC_FONT_FAMILY};color:#4B5563;font-size:13px;">Nenhuma ocorrência no período.</p></td></tr>` : "";
  const html = shell(head + boxes + empty, input.footer ?? DEFAULT_FOOTER);
  const text = [
    "ACC - AXION Controle de Contratos",
    `CONSOLIDADO DE RISCOS — ${input.projectName}`,
    "",
    greeting,
    `Resumo executivo: ${input.summaryLine}`,
    input.windowLabel,
    "",
    ...input.occurrences.flatMap((o) => [...buildUniversalOccurrenceText(o), "", "----", ""]),
    input.footer ?? DEFAULT_FOOTER,
  ].join("\n");
  return {
    subject: `OBRA ${input.projectName.toUpperCase()} - CONSOLIDADO DE RISCOS (${input.windowLabel})`.slice(0, 200),
    html,
    text,
    logoNeeds: logoNeedsFor(input.occurrences.map((o) => o.severity)),
  };
}
