// Fase 5/A — contrato do leitor de caixa (MailReader) e tipos normalizados. O leitor só LÊ.
/**
 * @typedef {{ id: string, filename: string, mime: string, size: number, available: boolean|null }} NormalizedAttachment
 * @typedef {{
 *   provider: "GMAIL"|"OUTLOOK", mailbox: string, providerMessageId: string, threadId: string|null, internetMessageId: string|null,
 *   from: string[], to: string[], cc: string[], bcc: string[], subject: string, sentAt: string, direction: "INBOUND"|"OUTBOUND",
 *   snippet: string, bodyText: string|null, bodyHtml: string|null, labels: string[], attachments: NormalizedAttachment[],
 * }} NormalizedMessage
 * @typedef {{ id: string, threadId?: string|null, folder?: string, removed?: boolean }} MessageRef
 * @typedef {{
 *   provider: "GMAIL"|"OUTLOOK",
 *   list(args: { mailbox: string, cursor: object|null, window: { start: string, end: string } }): Promise<{ refs: MessageRef[], nextCursor: object }>,
 *   getMessage(mailbox: string, ref: MessageRef): Promise<NormalizedMessage>,
 *   probeAttachment?(mailbox: string, message: NormalizedMessage, attachment: NormalizedAttachment): Promise<boolean>,
 * }} MailReader
 */
export const PROVIDERS = Object.freeze(["GMAIL", "OUTLOOK"]);
export const normalizeMailbox = (value) => String(value ?? "").trim().toLowerCase();
