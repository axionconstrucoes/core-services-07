// Verificação SOMENTE-LEITURA, na caixa crm@ (credencial ACC_RISK_ALERTS_INBOUND_*, escopo gmail.readonly), de UMA mensagem já enviada
// pelo piloto: confere se ela está na conta (Enviados) e se há cópias recebidas (Cc), comparando cabeçalhos com o esperado.
// Chamadas: renovação do token, users.getProfile, users.messages.get (format=metadata) e users.messages.list (q=rfc822msgid:...).
// NUNCA lê corpo, não altera, não envia, não toca no banco. Repositório público: a saída tem SÓ booleanos, contagens e rótulos do Gmail —
// nenhum e-mail, assunto, token, client id ou segredo. O destinatário esperado chega como SHA-256 (hex) do endereço em minúsculas.
//
// Uso: MSG_ID=<id Gmail> RFC822_ID=<Message-ID com <>> EXPECTED_TO_SHA256=<hex> node scripts/verify-crm-sent-copy.mjs
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveRiskAlertInboundCredentials, inboundProfileMatchesMailbox } = await import("../apps/web/lib/risk-alerts/replies/inbound-credentials");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CRM = "crm@axion.com.br";
const FORBIDDEN = ["axion@axion.com.br", "acc@axion.com.br"];
const HEADERS = ["From", "To", "Cc", "Bcc", "Subject", "Message-ID", "Date", "X-ACC-Outbound"];

export function addressesOf(value) {
  return Array.from(String(value ?? "").matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)).map((m) => m[0].toLowerCase());
}
export const sha256 = (s) => createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");

export function inspectHeaders(headers, expected) {
  const h = new Map((headers ?? []).map((x) => [String(x.name).toLowerCase(), String(x.value ?? "")]));
  const from = addressesOf(h.get("from"));
  const to = addressesOf(h.get("to"));
  const cc = addressesOf(h.get("cc"));
  const bcc = addressesOf(h.get("bcc"));
  const all = [...from, ...to, ...cc, ...bcc];
  return {
    fromIsCrm: from.length === 1 && from[0] === CRM,
    toCount: to.length,
    toMatchesExpected: to.length === 1 && Boolean(expected.toSha256) && sha256(to[0]) === expected.toSha256.toLowerCase(),
    ccCount: cc.length,
    ccContainsCrm: cc.includes(CRM),
    bccPresent: bcc.length > 0,
    forbiddenAddressPresent: all.some((a) => FORBIDDEN.includes(a)),
    messageIdMatches: Boolean(expected.rfc822Id) && String(h.get("message-id") ?? "").trim() === expected.rfc822Id.trim(),
    hasXAccOutbound: h.has("x-acc-outbound"),
    subjectPresent: Boolean(h.get("subject")),
  };
}

const safeLabels = (labels) => (labels ?? []).filter((l) => /^[A-Z_]+$/.test(l)).sort();

export async function runVerify(env = process.env, fetchImpl = fetch) {
  const out = { ok: false, stage: "CONFIG", configured: false, profileIsCrm: null, byId: null, copies: null, gmailWriteCalled: false };
  const msgId = String(env.MSG_ID ?? "").trim();
  const rfc822Id = String(env.RFC822_ID ?? "").trim();
  const toSha256 = String(env.EXPECTED_TO_SHA256 ?? "").trim();
  if (!/^[0-9a-f]{10,32}$/i.test(msgId) || !/^<[^<>\s]+@[^<>\s]+>$/.test(rfc822Id) || !/^[0-9a-f]{64}$/i.test(toSha256)) return { ...out, stage: "BAD_INPUT" };
  const resolved = resolveRiskAlertInboundCredentials(env);
  if (!resolved.ok) return { ...out, stage: "NOT_CONFIGURED" };
  const creds = resolved.credentials;
  out.configured = true;
  const expected = { toSha256, rfc822Id };

  let token;
  try {
    out.stage = "AUTH_REFRESH";
    const r = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: "refresh_token" }).toString(),
    });
    if (!r.ok) return out;
    token = (await r.json()).access_token;
    if (typeof token !== "string") return out;
  } catch {
    return out;
  }
  const get = async (url) => {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: r.ok ? await r.json() : null };
  };
  const meta = (id) => `${API}/messages/${encodeURIComponent(id)}?format=metadata&${HEADERS.map((x) => `metadataHeaders=${encodeURIComponent(x)}`).join("&")}`;

  try {
    out.stage = "IDENTITY";
    const p = await get(`${API}/profile`);
    out.profileIsCrm = p.body ? inboundProfileMatchesMailbox(p.body.emailAddress ?? null, CRM) : false;
    if (!out.profileIsCrm) return out;

    out.stage = "GET_BY_ID";
    const m = await get(meta(msgId));
    out.byId = m.body ? { found: true, labels: safeLabels(m.body.labelIds), ...inspectHeaders(m.body.payload?.headers, expected) } : { found: false, httpStatus: m.status };

    out.stage = "LIST_COPIES";
    const l = await get(`${API}/messages?includeSpamTrash=true&maxResults=20&q=${encodeURIComponent(`rfc822msgid:${rfc822Id}`)}`);
    const ids = (l.body?.messages ?? []).map((x) => x.id);
    const copies = [];
    for (const id of ids) {
      const c = await get(meta(id));
      if (c.body) copies.push({ isSameIdAsInput: id === msgId, labels: safeLabels(c.body.labelIds), ...inspectHeaders(c.body.payload?.headers, expected) });
    }
    out.copies = { count: copies.length, withSentLabel: copies.filter((c) => c.labels.includes("SENT")).length, withInboxLabel: copies.filter((c) => c.labels.includes("INBOX")).length, items: copies };
  } catch {
    return out;
  }
  out.stage = "DONE";
  out.ok = Boolean(out.byId?.found);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runVerify();
  console.log(JSON.stringify(result, null, 1));
  process.exitCode = result.stage === "DONE" ? 0 : 1;
}
