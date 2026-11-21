// Fase 6/H3 — SONDA DE COBERTURA do Gmail: SOMENTE LEITURA, SÓ METADADOS, limite pequeno.
// Garantias (testadas em scripts/test-f6-h3-gmail-sonda.mjs com fetch FALSO):
//   - só HTTP GET; só 3 caminhos: users/me/profile, users/me/messages (list), users/me/messages/{id}?format=metadata;
//   - nunca pede corpo (format=full/raw é recusado) nem escreve/modifica/envia;
//   - nunca imprime valores de credencial nem conteúdo de mensagem: a saída contém só CONTAGENS, IDs opacos e domínios.
// Uso (manual, a pedido do responsável):  node scripts/lib/mail-universal/gmail-coverage-probe.mjs --env <arquivo .env> --prefix GOOGLE_GMAIL_REYNALDO --after 2026-08-20 --max-metadata 150
import { readFileSync, writeFileSync } from "node:fs";
import { domainMatchesOrSubdomain, domainOf, extractAddresses } from "./participants.mjs";

export const PROBE_SCOPE = "gmail.readonly (somente leitura)";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Parser mínimo de .env (nunca registra valores). */
export function parseEnvText(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

export function credentialNames(prefix) {
  return { clientId: `${prefix}_CLIENT_ID`, clientSecret: `${prefix}_CLIENT_SECRET`, refreshToken: `${prefix}_REFRESH_TOKEN` };
}

export function missingNames(env, prefix) {
  return Object.values(credentialNames(prefix)).filter((n) => !env[n]);
}

/** fetch embrulhado: recusa tudo que não seja a lista fechada de leituras de metadados. */
export function guardedFetch(fetchImpl, log = []) {
  return async (url, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    const u = new URL(url);
    const isToken = url === TOKEN_URL && method === "POST";
    const isGmail = url.startsWith(GMAIL) && method === "GET";
    const path = u.pathname.replace(/^\/gmail\/v1\/users\/me/, "");
    const okPath = path === "/profile" || path === "/messages" || /^\/messages\/[A-Za-z0-9_-]+$/.test(path);
    const fmt = u.searchParams.get("format");
    if (!(isToken || (isGmail && okPath))) throw new Error(`PROBE_READ_ONLY_VIOLATION: ${method} ${u.pathname} não permitido`);
    if (/^\/messages\/[A-Za-z0-9_-]+$/.test(path) && fmt !== "metadata") throw new Error("PROBE_READ_ONLY_VIOLATION: só format=metadata");
    log.push(`${method} ${isToken ? "(token)" : u.pathname.replace(/\/messages\/[^/]+$/, "/messages/{id}")}`);
    return fetchImpl(url, init);
  };
}

async function accessToken(f, env, prefix) {
  const n = credentialNames(prefix);
  const body = new URLSearchParams({ client_id: env[n.clientId], client_secret: env[n.clientSecret], refresh_token: env[n.refreshToken], grant_type: "refresh_token" });
  const res = await f(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`TOKEN_EXCHANGE_FAILED: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("TOKEN_EXCHANGE_FAILED: sem access_token");
  return { token: json.access_token, scope: String(json.scope ?? "") };
}

const epoch = (iso) => Math.floor(Date.parse(iso) / 1000);

async function listIds(f, token, query, cap) {
  const ids = [];
  let pageToken;
  for (let page = 0; page < 40 && ids.length < cap; page += 1) {
    const u = new URL(`${GMAIL}/messages`);
    u.searchParams.set("q", query);
    u.searchParams.set("maxResults", "500");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await f(u.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`LIST_FAILED: HTTP ${res.status}`);
    const json = await res.json();
    for (const m of json.messages ?? []) ids.push(m.id);
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return ids.slice(0, cap);
}

/**
 * @returns relatório só com contagens, ids opacos e domínios. `months`: [{label,start,end}] janelas ISO.
 */
export async function runProbe({ env, prefix, fetchImpl = fetch, after, before, months, maxMetadata = 150, targetDomain = "weg.net" }) {
  const log = [];
  const f = guardedFetch(fetchImpl, log);
  const miss = missingNames(env, prefix);
  if (miss.length) return { status: "BLOQUEADO", missingNames: miss };
  const { token, scope } = await accessToken(f, env, prefix);
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const prof = await (await f(`${GMAIL}/profile`, auth)).json();
  const weg = `{from:${targetDomain} to:${targetDomain} cc:${targetDomain} bcc:${targetDomain}}`;
  const perMonth = [];
  const wegIds = [];
  for (const mth of months) {
    const win = `after:${epoch(mth.start)} before:${epoch(mth.end)}`;
    const all = await listIds(f, token, win, 5000);
    const w = await listIds(f, token, `${win} ${weg}`, 5000);
    perMonth.push({ month: mth.label, universe: all.length, wegPrefilter: w.length });
    wegIds.push(...w);
  }
  // Metadados (From/To/Cc/Bcc apenas) dos mais recentes, só para contar domínios weg.net/subdomínios e participantes por campo.
  const sample = wegIds.slice(0, maxMetadata);
  const domains = {};
  let confirmed = 0;
  let subdomainOnly = 0;
  for (const id of sample) {
    const u = new URL(`${GMAIL}/messages/${id}`);
    u.searchParams.set("format", "metadata");
    for (const h of ["From", "To", "Cc", "Bcc"]) u.searchParams.append("metadataHeaders", h);
    const res = await f(u.toString(), auth);
    if (!res.ok) continue;
    const json = await res.json();
    const addrs = (json.payload?.headers ?? []).flatMap((h) => extractAddresses(h.value));
    const hits = [...new Set(addrs.map(domainOf).filter((d) => domainMatchesOrSubdomain(d, targetDomain)))];
    if (hits.length) confirmed += 1;
    if (hits.length && hits.every((d) => d !== targetDomain)) subdomainOnly += 1;
    for (const d of hits) domains[d] = (domains[d] ?? 0) + 1;
  }
  return {
    status: "EXECUTADO",
    scopeGranted: scope.includes("gmail.readonly") ? "gmail.readonly" : scope ? "(outro escopo: ver token)" : "(não informado)",
    mailbox: prof.emailAddress ?? null,
    messagesTotalInMailbox: prof.messagesTotal ?? null,
    perMonth,
    metadataSampled: sample.length,
    metadataWithDomainMatch: confirmed,
    metadataOnlySubdomain: subdomainOnly,
    domains,
    wegIdsPrefilter: wegIds,
    httpCalls: log.length,
    callKinds: [...new Set(log)],
  };
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const envFile = arg("env");
  const prefix = arg("prefix", "GOOGLE_GMAIL_REYNALDO");
  const out = arg("out");
  const env = parseEnvText(readFileSync(envFile, "utf8"));
  const months = ["2026-08", "2026-09", "2026-10", "2026-11"].map((m) => {
    const [y, mo] = m.split("-").map(Number);
    return { label: m, start: new Date(Date.UTC(y, mo - 1, 1)).toISOString(), end: new Date(Date.UTC(y, mo, 1)).toISOString() };
  });
  const report = await runProbe({ env, prefix, months, maxMetadata: Number(arg("max-metadata", "150")) });
  if (out && report.wegIdsPrefilter) writeFileSync(out, JSON.stringify(report.wegIdsPrefilter));
  const { wegIdsPrefilter, ...safe } = report;
  console.log(JSON.stringify({ ...safe, wegIdsSalvos: wegIdsPrefilter?.length ?? 0 }, null, 2));
}
