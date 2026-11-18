// Consulta PONTUAL (somente leitura) à caixa monitorada antes de efetivar escalonamentos: existe resposta do caso recebida até o
// prazo e ainda não processada pelo leitor periódico? Dois caminhos, iguais aos da fase replies:
//   (a) Reply-To opaco: mensagens para <caixa>+alerta-<token> recebidas entre o envio do alerta e o prazo; o token é comparado
//       pelo hash com o da conversa do caso (o token em si nunca é persistido);
//   (b) thread do alerta (In-Reply-To/References agrupados pelo Gmail).
// Data de recebimento = internalDate do Gmail. Mensagens enviadas pela própria caixa nunca contam. Nada é gravado aqui.
// Sem credencial dedicada (ACC_RISK_ALERTS_INBOUND_*) no ambiente, ou com erro do Gmail => UNAVAILABLE (o escalonamento segue e a
// limitação é registrada, sem afirmar ausência de resposta).
import type { ReplyCheck } from "../escalation-reply-gate";
import { inboundProfileMatchesMailbox, resolveRiskAlertInboundCredentials } from "./inbound-credentials";
import { extractReplyTokens, hashReplyToken } from "./reply-pipeline";

export interface GmailReadonlyLike {
  getProfileEmail(): Promise<string | null>;
  listMessageIds(query: string): Promise<string[]>;
  getMessageMeta(id: string): Promise<{ id: string; internalDate: string | null; headers: Record<string, string> } | null>;
  getThreadMessages(threadId: string): Promise<Array<{ id: string; internalDate: string | null; headers: Record<string, string> }>>;
}

export interface ReplyLookup {
  /** Conversas do caso (thread do Gmail e hash do token do Reply-To) e o primeiro envio do alerta. */
  conversationsForCase(caseId: string): Promise<Array<{ providerThreadId: string | null; replyTokenHash: string | null; firstSentAt: string | null }>>;
  /** Ids de mensagens do Gmail já registradas (processadas ou aguardando) para o projeto. */
  knownMessageIds(projectId: string): Promise<Set<string>>;
}

export interface ReplyCheckRequest {
  caseKey: string;
  caseId: string;
  projectId: string;
  deadlineAt: string | null;
}

const epochSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const fromMailbox = (headers: Record<string, string>, mailbox: string) => (headers.from ?? "").toLowerCase().includes(mailbox.toLowerCase());

export async function checkRepliesBeforeEscalation(
  requests: ReplyCheckRequest[],
  deps: { gmail: GmailReadonlyLike | null; mailbox: string | null; lookup: ReplyLookup; unavailableReason?: string }
): Promise<Map<string, ReplyCheck>> {
  const results = new Map<string, ReplyCheck>();
  if (requests.length === 0) return results;
  const unavailable = (reason: string) => {
    for (const request of requests) results.set(request.caseKey, { status: "UNAVAILABLE", reason });
    return results;
  };
  if (!deps.gmail || !deps.mailbox) return unavailable(deps.unavailableReason ?? "credencial de leitura da caixa monitorada ausente neste ambiente");
  try {
    const profile = await deps.gmail.getProfileEmail();
    if (!inboundProfileMatchesMailbox(profile, deps.mailbox)) return unavailable("a conta autenticada não é a caixa monitorada");
  } catch {
    return unavailable("falha ao autenticar na caixa monitorada");
  }
  const knownByProject = new Map<string, Set<string>>();
  const [local] = deps.mailbox.split("@");
  for (const request of requests) {
    try {
      if (!knownByProject.has(request.projectId)) knownByProject.set(request.projectId, await deps.lookup.knownMessageIds(request.projectId));
      const known = knownByProject.get(request.projectId)!;
      const deadlineMs = request.deadlineAt ? Date.parse(request.deadlineAt) : Date.now();
      const conversations = await deps.lookup.conversationsForCase(request.caseId);
      const tokenHashes = new Set(conversations.map((c) => c.replyTokenHash).filter((h): h is string => Boolean(h)));
      const sentAt = conversations.map((c) => c.firstSentAt).filter((s): s is string => Boolean(s)).sort()[0] ?? null;
      const found: { earliest: number | null } = { earliest: null };
      const consider = (message: { id: string; internalDate: string | null; headers: Record<string, string> }) => {
        if (known.has(message.id) || fromMailbox(message.headers, deps.mailbox!)) return;
        const received = message.internalDate ? Number(message.internalDate) : Number.NaN;
        if (!Number.isFinite(received) || received > deadlineMs) return;
        if (sentAt && received < Date.parse(sentAt)) return;
        found.earliest = found.earliest === null ? received : Math.min(found.earliest, received);
      };
      // (a) Reply-To opaco
      if (tokenHashes.size > 0) {
        const after = sentAt ? epochSeconds(sentAt) - 60 : Math.floor(deadlineMs / 1000) - 7 * 86400;
        const ids = await deps.gmail.listMessageIds(`to:${local}+alerta- after:${after} before:${Math.floor(deadlineMs / 1000) + 60} -from:me`);
        for (const id of ids) {
          if (known.has(id)) continue;
          const meta = await deps.gmail.getMessageMeta(id);
          if (!meta) continue;
          const addressed = ["to", "cc", "delivered-to"].map((h) => meta.headers[h] ?? "").join(",");
          const tokens = extractReplyTokens(addressed.split(","));
          if (tokens.some((token) => tokenHashes.has(hashReplyToken(token)))) consider(meta);
        }
      }
      // (b) thread do alerta
      for (const conversation of conversations) {
        if (!conversation.providerThreadId) continue;
        for (const message of await deps.gmail.getThreadMessages(conversation.providerThreadId)) consider(message);
      }
      results.set(request.caseKey, found.earliest === null ? { status: "NO_REPLY" } : { status: "REPLY_FOUND", receivedAt: new Date(found.earliest).toISOString() });
    } catch {
      results.set(request.caseKey, { status: "UNAVAILABLE", reason: "falha de leitura do Gmail nesta rodada" });
    }
  }
  return results;
}

/** Cliente Gmail somente leitura a partir das variáveis DEDICADAS; null quando ausentes (=> UNAVAILABLE). */
export async function createGmailReadonlyFromEnv(env: Record<string, string | undefined>): Promise<{ gmail: GmailReadonlyLike; mailbox: string } | null> {
  const resolved = resolveRiskAlertInboundCredentials(env);
  if (!resolved.ok) return null;
  const { google } = await import("googleapis");
  const auth = new google.auth.OAuth2(resolved.credentials.clientId, resolved.credentials.clientSecret);
  auth.setCredentials({ refresh_token: resolved.credentials.refreshToken });
  const api = google.gmail({ version: "v1", auth });
  const headerMap = (headers: Array<{ name?: string | null; value?: string | null }> | undefined) =>
    Object.fromEntries((headers ?? []).map((h) => [(h.name ?? "").toLowerCase(), h.value ?? ""]));
  const gmail: GmailReadonlyLike = {
    async getProfileEmail() {
      return (await api.users.getProfile({ userId: "me" })).data.emailAddress ?? null;
    },
    async listMessageIds(query) {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await api.users.messages.list({ userId: "me", q: query, maxResults: 100, pageToken });
        for (const m of page.data.messages ?? []) if (m.id) ids.push(m.id);
        pageToken = page.data.nextPageToken ?? undefined;
      } while (pageToken && ids.length < 500);
      return ids;
    },
    async getMessageMeta(id) {
      const m = (await api.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "To", "Cc", "Delivered-To"] })).data;
      return m.id ? { id: m.id, internalDate: m.internalDate ?? null, headers: headerMap(m.payload?.headers) } : null;
    },
    async getThreadMessages(threadId) {
      const t = (await api.users.threads.get({ userId: "me", id: threadId, format: "metadata", metadataHeaders: ["From"] })).data;
      return (t.messages ?? []).filter((m) => m.id).map((m) => ({ id: m.id as string, internalDate: m.internalDate ?? null, headers: headerMap(m.payload?.headers) }));
    },
  };
  return { gmail, mailbox: resolved.credentials.mailbox };
}
