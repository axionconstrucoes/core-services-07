// Puro, sem I/O. Painel "Responder por e-mail" (três atalhos mailto com token POR ITEM) — HTML e texto. Módulo próprio
// para ser usado pelo template universal e pelos templates de contrato/resumo sem dependência circular.

import { ACC_FONT_FAMILY } from "@/lib/email/brand-style";
import { escapeAttr } from "@/lib/email/templates/alert-box-style";
import { REPLY_MAILTO_LABELS, REPLY_MAILTO_ORDER, isSafeReplyMailto, type ReplyMailtoLinks } from "@/lib/email-replies/reply-mailto";

export const REPLY_BY_EMAIL_HEADING = "Responder por e-mail";
export const REPLY_BY_EMAIL_NOTE =
  "Cada atalho abre uma NOVA mensagem já endereçada ao ACC. Complete o texto e envie: o comando é registrado só depois de validar o remetente (e-mail corporativo autenticado) e você recebe a confirmação ou o que faltar.";

/** Os três atalhos mailto (todos válidos) ou null. */
export function safeReplyByEmail(links: ReplyMailtoLinks | null | undefined): ReplyMailtoLinks | null {
  if (!links) return null;
  return REPLY_MAILTO_ORDER.every((action) => isSafeReplyMailto(links[action])) ? links : null;
}

/** Painel "Responder por e-mail" (três atalhos mailto válidos) — reutilizado pelos templates de contrato e resumo. */
export function buildReplyByEmailPanelHtml(replyByEmail: ReplyMailtoLinks | null | undefined): string {
  const links = safeReplyByEmail(replyByEmail);
  if (!links) return "";
  const anchors = REPLY_MAILTO_ORDER.map(
    (action) =>
      `<a href="${escapeAttr(links[action])}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 12px;border:1px solid #6B7280;border-radius:6px;background-color:#FFFFFF;color:#111827;font-family:${ACC_FONT_FAMILY};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">${escapeAttr(`${REPLY_MAILTO_LABELS[action]} por e-mail`)}</a>`
  ).join("");
  return `<div class="acc-reply-by-email" style="margin:16px 0 0 0;background-color:#FFFFFF;border:1px solid #D1D5DB;border-radius:6px;padding:14px 16px;"><p style="margin:0 0 8px 0;font-family:${ACC_FONT_FAMILY};font-size:16px;line-height:24px;font-weight:700;color:#111827;">${escapeAttr(REPLY_BY_EMAIL_HEADING)}</p><p style="margin:0 0 10px 0;">${anchors}</p><p style="margin:0;font-family:${ACC_FONT_FAMILY};font-size:14px;line-height:20px;color:#374151;">${escapeAttr(REPLY_BY_EMAIL_NOTE)}</p></div>`;
}

/** Linhas de texto simples dos atalhos (mesmos links do HTML). */
export function replyByEmailTextLines(links: ReplyMailtoLinks | null | undefined): string[] {
  const safe = safeReplyByEmail(links);
  if (!safe) return [];
  return [`${REPLY_BY_EMAIL_HEADING.toUpperCase()} (nova mensagem já endereçada ao ACC):`, ...REPLY_MAILTO_ORDER.map((action) => `${REPLY_MAILTO_LABELS[action]}: ${safe[action]}`), REPLY_BY_EMAIL_NOTE];
}
