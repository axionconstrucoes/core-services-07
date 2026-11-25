// Fase 5/A — transportes FALSOS (fixtures) para Gmail e Graph. Nenhuma rede, nenhuma credencial. Registram as chamadas
// e permitem injetar falhas (mensagem, anexo, listagem). Qualquer método de ESCRITA chamado explicitamente é registrado em `writes`.
import { Buffer } from "node:buffer";

const b64 = (text) => Buffer.from(text, "utf8").toString("base64url");

/** Mensagem Gmail "format=full" mínima. */
export function gmailMessage({ id, threadId = `t-${id}`, from, to = [], cc = [], bcc = [], subject = "Assunto", date, messageId, text = "corpo", attachments = [], labelIds = ["INBOX"] }) {
  const headers = [
    { name: "From", value: from }, { name: "To", value: to.join(", ") }, { name: "Subject", value: subject },
    ...(cc.length ? [{ name: "Cc", value: cc.join(", ") }] : []),
    ...(bcc.length ? [{ name: "Bcc", value: bcc.join(", ") }] : []),
    ...(messageId ? [{ name: "Message-ID", value: messageId }] : []),
  ];
  const parts = [{ mimeType: "text/plain", body: { data: b64(text) } }];
  for (const a of attachments) parts.push({ mimeType: a.mime ?? "application/pdf", filename: a.filename, body: { attachmentId: a.attachmentId, size: a.size ?? 100 } });
  return { id, threadId, internalDate: String(Date.parse(date)), snippet: text.slice(0, 80), labelIds, payload: { mimeType: "multipart/mixed", headers, parts } };
}

/** @param {Record<string, object[]>} boxes caixa -> mensagens Gmail  @param {{ failGet?: Record<string, number>, failAttachments?: string[], failList?: number, pageSize?: number }} [opts] */
export function createFakeGmailTransport(boxes, mailbox, opts = {}) {
  const calls = [];
  const failGet = { ...(opts.failGet ?? {}) };
  let failList = opts.failList ?? 0;
  const pageSize = opts.pageSize ?? 2;
  const writes = [];
  const transport = {
    calls, writes,
    async listMessages({ query, pageToken }) {
      calls.push(["listMessages", query]);
      if (failList > 0) { failList -= 1; throw new Error("503 backendError (simulado)"); }
      const all = boxes[mailbox] ?? [];
      const start = Number(pageToken ?? 0);
      const slice = all.slice(start, start + pageSize);
      return { messages: slice.map((m) => ({ id: m.id, threadId: m.threadId })), nextPageToken: start + pageSize < all.length ? String(start + pageSize) : undefined };
    },
    async getMessage(id) {
      calls.push(["getMessage", id]);
      if ((failGet[id] ?? 0) > 0) { failGet[id] -= 1; throw new Error("500 internalError (simulado)"); }
      const found = (boxes[mailbox] ?? []).find((m) => m.id === id);
      if (!found) throw Object.assign(new Error("404 notFound"), { retryable: false });
      return found;
    },
    async getAttachment(messageId, attachmentId) {
      calls.push(["getAttachment", messageId, attachmentId]);
      if (opts.failAttachments?.includes(attachmentId)) throw new Error("404 attachment not found (simulado)");
      return { size: 100 };
    },
    // Métodos de escrita que o leitor jamais deve alcançar: se alguém os chamar, ficam registrados.
    async send() { writes.push("send"); }, async modify() { writes.push("modify"); }, async trash() { writes.push("trash"); },
  };
  return transport;
}

/** Mensagem Graph mínima. */
export function graphMessage({ id, conversationId = `c-${id}`, from, to = [], cc = [], bcc = [], subject = "Assunto", sentDateTime, internetMessageId, text = "corpo", hasAttachments = false }) {
  const rec = (list) => list.map((address) => ({ emailAddress: { address } }));
  return { id, conversationId, internetMessageId, subject, sentDateTime, receivedDateTime: sentDateTime, from: { emailAddress: { address: from } }, toRecipients: rec(to), ccRecipients: rec(cc), bccRecipients: rec(bcc), body: { contentType: "text", content: text }, bodyPreview: text.slice(0, 80), hasAttachments };
}

/** @param {Record<string, Record<string, object[]>>} boxes caixa -> pasta -> mensagens Graph  @param {{ failGet?: Record<string, number>, attachments?: Record<string, object[]>, failAttachmentList?: string[], pageSize?: number, removed?: Record<string,string[]> }} [opts] */
export function createFakeGraphTransport(boxes, opts = {}) {
  const calls = [];
  const failGet = { ...(opts.failGet ?? {}) };
  const pageSize = opts.pageSize ?? 2;
  const writes = [];
  return {
    calls, writes,
    async delta({ mailbox, folder, link }) {
      calls.push(["delta", mailbox, folder, link ?? "(inicio)"]);
      const items = [...(boxes[mailbox]?.[folder] ?? []), ...(opts.removed?.[folder] ?? []).map((id) => ({ id, "@removed": { reason: "deleted" } }))];
      const start = link && link.startsWith("page:") ? Number(link.slice(5)) : 0;
      const slice = items.slice(start, start + pageSize);
      if (start + pageSize < items.length) return { value: slice, nextLink: `page:${start + pageSize}` };
      return { value: slice, deltaLink: `delta:${folder}:${items.length}` };
    },
    async getMessage({ mailbox, id }) {
      calls.push(["getMessage", mailbox, id]);
      if ((failGet[id] ?? 0) > 0) { failGet[id] -= 1; throw new Error("429 TooManyRequests (simulado)"); }
      for (const items of Object.values(boxes[mailbox] ?? {})) { const m = items.find((x) => x.id === id); if (m) return m; }
      throw Object.assign(new Error("404 ErrorItemNotFound"), { retryable: false });
    },
    async listAttachments({ id }) {
      calls.push(["listAttachments", id]);
      if (opts.failAttachmentList?.includes(id)) throw new Error("503 (simulado)");
      return opts.attachments?.[id] ?? [];
    },
    async sendMail() { writes.push("sendMail"); }, async patch() { writes.push("patch"); }, async delete() { writes.push("delete"); },
  };
}
