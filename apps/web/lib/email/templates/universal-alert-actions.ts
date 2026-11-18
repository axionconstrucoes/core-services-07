// Puro, sem I/O. Os QUATRO botões do template universal (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA): cores,
// ordem, desativação com motivo e painel lateral. Módulo próprio para ser usado por TODOS os templates de alerta (risco,
// contrato individual e em lote) sem ciclo de importação. Cada botão é só um LINK para página autenticada do ACC.

import { ACC_FONT_FAMILY } from "@/lib/email/brand-style";
import {
  BUTTON_FONT_SIZE_PX,
  BUTTON_HEIGHT_PX,
  BUTTON_WIDTH_PX,
  buildActionsPanelHtml,
  buildCompactButtonHtml,
  escapeAttr,
} from "@/lib/email/templates/alert-box-style";


export type UniversalAction = "RESOLVIDO" | "EM_ANDAMENTO" | "ENVIAR_PARA" | "ESPECIALISTA";

export const UNIVERSAL_ACTION_ORDER: readonly UniversalAction[] = ["RESOLVIDO", "EM_ANDAMENTO", "ENVIAR_PARA", "ESPECIALISTA"];

// Cores (decisão de produto): os três botões de TRATAMENTO são cinza médio com texto branco; ESPECIALISTA (consulta, não
// altera o alerta) é laranja com texto branco. Laranja escurecido (#C2410C) para manter contraste WCAG AA (>= 4,5:1) com o
// branco; o cinza #6B7280 também passa (~4,8:1).
export const UNIVERSAL_ACTION_STYLES: Record<UniversalAction, { background: string; color: string; label: string }> = {
  RESOLVIDO: { background: "#6B7280", color: "#ffffff", label: "RESOLVIDO" },
  EM_ANDAMENTO: { background: "#6B7280", color: "#ffffff", label: "EM ANDAMENTO" },
  ENVIAR_PARA: { background: "#6B7280", color: "#ffffff", label: "ENVIAR PARA" },
  ESPECIALISTA: { background: "#C2410C", color: "#ffffff", label: "ESPECIALISTA" },
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
  return `<table class="acc-compact-btn acc-btn-disabled" role="presentation" align="center" width="${w}" cellpadding="0" cellspacing="0" style="width:${w}px;margin:${isFirst ? "0" : "8px"} auto 0 auto;border-collapse:separate;"><tr><td width="${w}" height="${h}" align="center" bgcolor="${DISABLED_BACKGROUND}" style="width:${w}px;height:${h}px;background-color:${DISABLED_BACKGROUND};border-radius:6px;text-align:center;"><span title="${escapeAttr(reason)}" aria-disabled="true" style="display:block;width:${w}px;height:${h}px;line-height:${h}px;color:${DISABLED_COLOR};font-family:${ACC_FONT_FAMILY};font-size:${BUTTON_FONT_SIZE_PX}px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;">${escapeAttr(label)}</span></td></tr></table><p class="acc-btn-reason" style="margin:4px 0 0 0;text-align:center;font-family:${ACC_FONT_FAMILY};font-size:14px;line-height:20px;color:${DISABLED_COLOR};">${escapeAttr(reason)}</p>`;
}

export interface UniversalActionsInput {
  links: UniversalActionLinks;
  /** Motivo exibido quando uma ação não está disponível (ex.: especialista indisponível). */
  unavailableReasons?: Partial<Record<UniversalAction, string>>;
  /** Ocorrência concluída: os três botões de tratamento continuam no layout, desativados (ESPECIALISTA é só consulta). */
  completed?: boolean;
}

function actionState(action: UniversalAction, input: UniversalActionsInput): { url: string | null; reason: string } {
  // Concluída: os três botões de TRATAMENTO ficam desativados; ESPECIALISTA é só consulta e segue disponível.
  if (input.completed && action !== "ESPECIALISTA") return { url: null, reason: "Ocorrência concluída." };
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


/** Painel lateral branco com os quatro botões (usado pelos templates de risco e de contrato). */
export function buildUniversalActionsPanelHtml(input: UniversalActionsInput): string {
  return buildActionsPanelHtml(buildUniversalActionButtonsHtml(input), null);
}

