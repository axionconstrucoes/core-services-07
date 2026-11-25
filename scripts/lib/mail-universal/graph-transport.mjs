// Fase 6/H3 — TRANSPORTE REAL do Microsoft Graph para o MailReader do Outlook (graph-reader.mjs). SOMENTE LEITURA.
//   - credencial de APLICATIVO (client credentials, escopo .default => Mail.Read concedido pelo administrador);
//   - delta por pasta com paginação (@odata.nextLink) e deltaLink; 429/503/504 respeitam Retry-After; 401 renova o token 1 vez;
//   - anexos: SÓ metadados (nunca contentBytes); nenhum método de escrita existe neste módulo (só GET + POST do token);
//   - nextLink/deltaLink só são seguidos se apontarem para o MESMO host do Graph configurado (impede enviar o token a terceiros);
//   - erros carregam apenas status e código do Graph, nunca corpo de mensagem nem segredo.
// ESTADO: nenhuma chamada real ao Graph foi feita (testado só contra servidor HTTP FALSO local; ver test-f6-h3-graph-transporte.mjs).
import { GRAPH_READ_METHODS } from "./read-only.mjs";

export const GRAPH_DEFAULT_BASE = "https://graph.microsoft.com/v1.0";
export const GRAPH_DEFAULT_AUTHORITY = "https://login.microsoftonline.com";
export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
export const GRAPH_MESSAGE_SELECT = "id,subject,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,hasAttachments,internetMessageId,conversationId,bodyPreview,body";
export const GRAPH_DELTA_SELECT = "id,receivedDateTime";
const FOLDER = /^[A-Za-z0-9_=-]{1,200}$/; // nomes bem conhecidos (inbox, sentitems) ou id opaco
const MAILBOX = /^[^\s@/\\?#]+@[^\s@/\\?#]+\.[^\s@/\\?#]+$/;

export class GraphError extends Error {
  constructor(message, { status = null, code = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After: segundos inteiros ou data HTTP. Devolve ms (limitado) ou null. */
export function parseRetryAfter(value, now = Date.now(), capMs = 120_000) {
  if (value == null || value === "") return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, capMs);
  const when = Date.parse(String(value));
  return Number.isFinite(when) ? Math.min(Math.max(when - now, 0), capMs) : null;
}

const isLoopback = (u) => ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);

function assertSafeBase(url, label) {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback(u))) throw new Error(`GRAPH_CONFIG: ${label} precisa ser https (http só em loopback para testes)`);
  return u;
}

/**
 * @param {{ tenantId:string, clientId:string, clientSecret:string, fetchImpl?:typeof fetch, sleep?:(ms:number)=>Promise<void>,
 *   now?:()=>number, graphBase?:string, authority?:string, maxRetries?:number, pageSize?:number }} cfg
 * @returns objeto com EXATAMENTE os métodos de GRAPH_READ_METHODS (delta, getMessage, listAttachments).
 */
export function createGraphTransport(cfg) {
  const { tenantId, clientId, clientSecret } = cfg;
  if (!tenantId || !clientId || !clientSecret) throw new Error("GRAPH_CONFIG: faltam tenantId/clientId/clientSecret");
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = cfg.now ?? (() => Date.now());
  const graphBase = (cfg.graphBase ?? GRAPH_DEFAULT_BASE).replace(/\/+$/, "");
  const authority = (cfg.authority ?? GRAPH_DEFAULT_AUTHORITY).replace(/\/+$/, "");
  const graphUrl = assertSafeBase(graphBase, "graphBase");
  assertSafeBase(authority, "authority");
  const maxRetries = cfg.maxRetries ?? 5;
  const pageSize = cfg.pageSize ?? 100;
  let token = null;
  let tokenExp = 0;

  async function getToken(force = false) {
    if (!force && token && now() < tokenExp - 60_000) return token;
    const res = await fetchImpl(`${authority}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: GRAPH_SCOPE, grant_type: "client_credentials" }),
    });
    if (!res.ok) {
      let code = null;
      try { code = (await res.json())?.error ?? null; } catch { /* sem corpo */ }
      throw new GraphError(`GRAPH_TOKEN_FAILED: HTTP ${res.status}${code ? ` (${code})` : ""}`, { status: res.status, code });
    }
    const json = await res.json();
    if (!json.access_token) throw new GraphError("GRAPH_TOKEN_FAILED: resposta sem access_token");
    token = json.access_token;
    tokenExp = now() + Number(json.expires_in ?? 3600) * 1000;
    return token;
  }

  /** GET com Retry-After/backoff. `url` absoluta já validada. Devolve JSON. */
  async function getJson(url, extraHeaders = {}) {
    let renewed = false;
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(url, { method: "GET", headers: { authorization: `Bearer ${await getToken()}`, accept: "application/json", ...extraHeaders } });
      if (res.ok) return res.json();
      if (res.status === 401 && !renewed) {
        renewed = true;
        await getToken(true);
        continue;
      }
      if ([429, 503, 504].includes(res.status) && attempt < maxRetries) {
        const wait = parseRetryAfter(res.headers.get("retry-after"), now()) ?? Math.min(1000 * 2 ** attempt, 30_000);
        await sleep(wait);
        continue;
      }
      let code = null;
      try { code = (await res.json())?.error?.code ?? null; } catch { /* sem corpo */ }
      throw new GraphError(`GRAPH_HTTP_${res.status}${code ? `: ${code}` : ""}`, { status: res.status, code, retryAfterMs: parseRetryAfter(res.headers.get("retry-after"), now()) });
    }
  }

  function followable(link) {
    const u = new URL(link);
    if (u.origin !== graphUrl.origin) throw new GraphError("GRAPH_LINK_REJECTED: nextLink/deltaLink fora do host do Graph configurado");
    return u.toString();
  }
  function mailboxPath(mailbox) {
    const m = String(mailbox ?? "").trim().toLowerCase();
    if (!MAILBOX.test(m)) throw new GraphError("GRAPH_CONFIG: endereço de caixa inválido");
    return `${graphBase}/users/${encodeURIComponent(m)}`;
  }

  const transport = {
    async delta({ mailbox, folder, link = null, since = null }) {
      let url;
      if (link) {
        url = followable(link);
      } else {
        if (!FOLDER.test(String(folder))) throw new GraphError("GRAPH_CONFIG: pasta inválida");
        const q = new URLSearchParams();
        q.set("$select", GRAPH_DELTA_SELECT);
        if (since) q.set("$filter", `receivedDateTime ge ${new Date(since).toISOString()}`);
        url = `${mailboxPath(mailbox)}/mailFolders/${folder}/messages/delta?${q.toString()}`;
      }
      const json = await getJson(url, { prefer: `odata.maxpagesize=${pageSize}, IdType="ImmutableId"` });
      return { value: json.value ?? [], nextLink: json["@odata.nextLink"] ?? null, deltaLink: json["@odata.deltaLink"] ?? null };
    },
    async getMessage({ mailbox, id }) {
      if (!/^[A-Za-z0-9_=-]+$/.test(String(id))) throw new GraphError("GRAPH_CONFIG: id de mensagem inválido");
      return getJson(`${mailboxPath(mailbox)}/messages/${encodeURIComponent(id)}?$select=${GRAPH_MESSAGE_SELECT}`, { prefer: 'IdType="ImmutableId"' });
    },
    /** SÓ metadados (id, nome, tipo, tamanho). Nunca solicita contentBytes. */
    async listAttachments({ mailbox, id }) {
      if (!/^[A-Za-z0-9_=-]+$/.test(String(id))) throw new GraphError("GRAPH_CONFIG: id de mensagem inválido");
      const out = [];
      let url = `${mailboxPath(mailbox)}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline`;
      for (let page = 0; url && page < 50; page += 1) {
        const json = await getJson(url);
        for (const a of json.value ?? []) out.push({ id: a.id, name: a.name, contentType: a.contentType, size: a.size, isAvailable: true });
        url = json["@odata.nextLink"] ? followable(json["@odata.nextLink"]) : null;
      }
      return out;
    },
  };
  for (const name of GRAPH_READ_METHODS) if (typeof transport[name] !== "function") throw new Error(`TRANSPORT_INCOMPLETE: ${name}`);
  return Object.freeze(transport);
}
