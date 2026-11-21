// Fase 5/A — MailReader do Gmail. Transporte injetável e SOMENTE-LEITURA (gmail.readonly). Em produção o transporte real é o
// cliente googleapis já usado por scripts/gmail-inbound-sync.mjs (delegação de domínio, escopo gmail.readonly); este módulo
// só é exercitado com transporte FALSO nos testes — nenhuma chamada real é feita aqui.
import { extractGmailBody } from "../gmail-message-body.mjs";
import { participantsFromGmailHeaders } from "./participants.mjs";
import { GMAIL_READ_METHODS, readOnlyTransport } from "./read-only.mjs";
import { normalizeMailbox } from "./reader.mjs";

export const GMAIL_REQUIRED_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const epoch = (iso) => Math.floor(Date.parse(iso) / 1000);

function collectAttachments(part, out = []) {
  if (!part) return out;
  if (part.filename) {
    out.push({
      id: part.body?.attachmentId ?? "",
      filename: part.filename,
      mime: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
      available: part.body?.attachmentId ? null : false,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out);
  return out;
}

/**
 * @param {{ transport: object, maxPages?: number, prefilterTerms?: string }} options
 *   prefilterTerms: termos Gmail opcionais (ex.: "from:weg.net to:weg.net cc:weg.net bcc:weg.net") que só REDUZEM a lista;
 *   vazio = universo completo da caixa na janela (reconciliação mais forte, exclusões com motivo).
 */
export function createGmailReader({ transport, maxPages = 200, prefilterTerms = "" }) {
  const t = readOnlyTransport(transport, GMAIL_READ_METHODS);
  return {
    provider: "GMAIL",
    scope: GMAIL_REQUIRED_SCOPE,
    async list({ window }) {
      const query = [`after:${epoch(window.start)}`, `before:${epoch(window.end) + 1}`, prefilterTerms ? `{${prefilterTerms}}` : ""].filter(Boolean).join(" ");
      const refs = [];
      let pageToken;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await t.listMessages({ query, pageToken });
        for (const m of res.messages ?? []) refs.push({ id: m.id, threadId: m.threadId ?? null });
        pageToken = res.nextPageToken;
        if (!pageToken) return { refs, nextCursor: { kind: "GMAIL_WINDOW", lastWindowEnd: window.end } };
      }
      throw new Error("LIST_TRUNCATED: limite de páginas atingido; o cursor não avança");
    },
    async getMessage(mailboxRaw, ref) {
      const mailbox = normalizeMailbox(mailboxRaw);
      const raw = await t.getMessage(ref.id);
      const headers = raw.payload?.headers ?? [];
      const p = participantsFromGmailHeaders(headers);
      const body = extractGmailBody(raw);
      const headerValue = (name) => headers.find((h) => String(h.name ?? "").toLowerCase() === name)?.value ?? null;
      return {
        provider: "GMAIL",
        mailbox,
        providerMessageId: raw.id,
        threadId: raw.threadId ?? null,
        internetMessageId: headerValue("message-id"),
        ...p,
        subject: headerValue("subject") ?? "(sem assunto)",
        sentAt: new Date(Number(raw.internalDate)).toISOString(),
        direction: p.from.includes(mailbox) ? "OUTBOUND" : "INBOUND",
        snippet: raw.snippet ?? "",
        bodyText: body.bodyText || null,
        bodyHtml: body.bodyHtml || null,
        labels: raw.labelIds ?? [],
        attachments: collectAttachments(raw.payload),
      };
    },
    async probeAttachment(_mailbox, message, attachment) {
      if (!attachment.id) return false;
      try {
        await t.getAttachment(message.providerMessageId, attachment.id);
        return true;
      } catch {
        return false;
      }
    },
  };
}
