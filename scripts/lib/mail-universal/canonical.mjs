// Fase 5/A — chave canônica da mensagem ENTRE caixas. A mesma mensagem lida em duas caixas tem o mesmo Message-ID (RFC 5322):
// uma única linha de emails, N origens (email_message_sources). Sem Message-ID, a chave é por caixa (nunca une mensagens diferentes).
export function canonicalMessageKey({ internetMessageId, provider, mailbox, providerMessageId }) {
  const raw = String(internetMessageId ?? "").trim().replace(/^<|>$/g, "").toLowerCase();
  if (raw.length >= 4 && raw.includes("@")) return `rfc:${raw}`;
  return `${String(provider).toLowerCase()}:${String(mailbox).toLowerCase()}:${providerMessageId}`;
}
