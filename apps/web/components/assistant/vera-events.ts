// Eventos entre os gatilhos da VERA (topo das telas, cabeçalho da autorização, links de e-mail) e a caixa de conversa.
// O gatilho só pede para abrir; a caixa (AssistantWidget) é montada uma vez por layout.

export const VERA_OPEN_EVENT = "vera:open";

export type VeraContext = "geral" | "alerta" | "providencia" | "ssma" | "autorizacao";

export interface VeraOpenDetail {
  context?: VeraContext;
  /** Pergunta enviada logo ao abrir (consulta opcional de ajuda; nunca registra decisão nenhuma). */
  ask?: string;
}

export const VERA_CONTEXTS: readonly VeraContext[] = ["geral", "alerta", "providencia", "ssma", "autorizacao"];

export function openVera(detail: VeraOpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<VeraOpenDetail>(VERA_OPEN_EVENT, { detail }));
}

export const VERA_AUTHORIZATION_QUESTION = "Como funciona esta autorização de acesso aos e-mails?";
