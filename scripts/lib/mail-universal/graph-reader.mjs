// Fase 5/A — MailReader do Outlook / Microsoft Graph (DELTA por pasta). Transporte injetável e SOMENTE-LEITURA.
// ESTADO REAL: não existe transporte real do Graph no repositório nem credencial/consentimento — este leitor só roda com
// transporte FALSO nos testes. BLOQUEIO exato para uso real: docs/monitoramento-email-universal.md (app registration,
// Mail.Read de aplicativo + consentimento de administrador + política de acesso por caixa, segredo/WIF).
import { GRAPH_READ_METHODS, readOnlyTransport } from "./read-only.mjs";
import { normalizeMailbox } from "./reader.mjs";

export const GRAPH_REQUIRED_PERMISSION = "Mail.Read"; // permissão de APLICATIVO; NÃO Mail.ReadWrite, NÃO Mail.Send.
export const GRAPH_DEFAULT_FOLDERS = Object.freeze(["inbox", "sentitems"]);

const addr = (r) => String(r?.emailAddress?.address ?? "").trim().toLowerCase();
const addrs = (list) => [...new Set((list ?? []).map(addr).filter((a) => a.includes("@")))];

export function createGraphReader({ transport, folders = GRAPH_DEFAULT_FOLDERS, maxPages = 500 }) {
  const t = readOnlyTransport(transport, GRAPH_READ_METHODS);
  return {
    provider: "OUTLOOK",
    permission: GRAPH_REQUIRED_PERMISSION,
    async list({ mailbox, cursor, window }) {
      const refs = [];
      const deltaLinks = { ...(cursor?.kind === "GRAPH_DELTA" ? cursor.deltaLinks : {}) };
      for (const folder of folders) {
        let link = deltaLinks[folder] ?? null;
        let pages = 0;
        for (;;) {
          const res = await t.delta({ mailbox, folder, link, since: link ? null : window.start });
          for (const m of res.value ?? []) refs.push({ id: m.id, folder, removed: Boolean(m["@removed"]) });
          if (res.nextLink) {
            link = res.nextLink;
            pages += 1;
            if (pages > maxPages) throw new Error("LIST_TRUNCATED: limite de páginas atingido; o cursor não avança");
            continue;
          }
          if (!res.deltaLink) throw new Error("DELTA_LINK_MISSING: resposta sem deltaLink; o cursor não avança");
          deltaLinks[folder] = res.deltaLink;
          break;
        }
      }
      return { refs, nextCursor: { kind: "GRAPH_DELTA", deltaLinks } };
    },
    async getMessage(mailboxRaw, ref) {
      const mailbox = normalizeMailbox(mailboxRaw);
      const raw = await t.getMessage({ mailbox, id: ref.id });
      let attachments = [];
      if (raw.hasAttachments) {
        try {
          const list = await t.listAttachments({ mailbox, id: ref.id });
          attachments = list.map((a) => ({
            id: a.id,
            filename: a.name,
            mime: a.contentType ?? "application/octet-stream",
            size: a.size ?? 0,
            available: a.isAvailable !== false,
          }));
        } catch {
          attachments = [{ id: "", filename: "(lista de anexos indisponível)", mime: "application/octet-stream", size: 0, available: false }];
        }
      }
      const from = addr(raw.from) ? [addr(raw.from)] : [];
      const isHtml = String(raw.body?.contentType ?? "").toLowerCase() === "html";
      return {
        provider: "OUTLOOK",
        mailbox,
        providerMessageId: raw.id,
        threadId: raw.conversationId ?? null,
        internetMessageId: raw.internetMessageId ?? null,
        from,
        to: addrs(raw.toRecipients),
        cc: addrs(raw.ccRecipients),
        bcc: addrs(raw.bccRecipients),
        subject: raw.subject || "(sem assunto)",
        sentAt: new Date(raw.sentDateTime ?? raw.receivedDateTime).toISOString(),
        direction: from.includes(mailbox) || ref.folder === "sentitems" ? "OUTBOUND" : "INBOUND",
        snippet: raw.bodyPreview ?? "",
        bodyText: isHtml ? null : raw.body?.content ?? null,
        bodyHtml: isHtml ? raw.body?.content ?? null : null,
        labels: ref.folder ? [ref.folder] : [],
        attachments,
      };
    },
    async probeAttachment(_mailbox, _message, attachment) {
      return attachment.available === true;
    },
  };
}
