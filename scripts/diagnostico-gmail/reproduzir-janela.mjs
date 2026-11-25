// F7/H6b - SOMENTE LEITURA. Reproduz a CONSULTA EXATA do sincronizador legado (after/before em epoch + prefiltro WEG) para uma janela
// e informa apenas QUANTOS ids o Gmail devolve e se um id opaco conhecido esta entre eles. Nao le corpo, assunto nem enderecos.
// Uso: node scripts/diagnostico-gmail/reproduzir-janela.mjs --env <.env> --prefix GOOGLE_GMAIL_REYNALDO --from 2026-11-18T17:54:00Z --to 2026-11-19T00:20:00Z --id <id opaco> [--spam-trash]
import { readFileSync } from "node:fs";
import { guardedFetch, parseEnvText, missingNames, credentialNames } from "../lib/mail-universal/gmail-coverage-probe.mjs";
import { pilotSenderTerms, pilotSenderQuery, WEG_PILOT_PROJECT } from "../lib/gmail-weg-pilot-sender.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Mesma montagem de scripts/gmail-inbound-sync.mjs (legado). */
export function legacyQuery(fromIso, toIso, domains = ["axion.com.br", "weg.net"]) {
  const afterEpoch = Math.floor(Date.parse(fromIso) / 1000);
  const beforeEpoch = Math.ceil(Date.parse(toIso) / 1000);
  const senderFilter = pilotSenderTerms(WEG_PILOT_PROJECT, domains.map((d) => `from:${d}`).join(" "));
  return `after:${afterEpoch} before:${beforeEpoch} {${senderFilter}} ${pilotSenderQuery(WEG_PILOT_PROJECT)}`.trim();
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  const env = parseEnvText(readFileSync(arg("env"), "utf8"));
  const prefix = arg("prefix", "GOOGLE_GMAIL_REYNALDO");
  const miss = missingNames(env, prefix);
  if (miss.length) { console.log(JSON.stringify({ status: "BLOQUEADO", faltam: miss })); process.exit(0); }
  const f = guardedFetch(fetch, []);
  const n = credentialNames(prefix);
  const tk = await (await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env[n.clientId], client_secret: env[n.clientSecret], refresh_token: env[n.refreshToken], grant_type: "refresh_token" }) })).json();
  const auth = { headers: { authorization: `Bearer ${tk.access_token}` } };
  const q = legacyQuery(arg("from"), arg("to"));
  const u = new URL(`${GMAIL}/messages`);
  u.searchParams.set("q", q); u.searchParams.set("maxResults", "500");
  u.searchParams.set("includeSpamTrash", process.argv.includes("--spam-trash") ? "true" : "false");
  const j = await (await f(u.toString(), auth)).json();
  const ids = (j.messages ?? []).map((m) => m.id);
  console.log(JSON.stringify({ status: "EXECUTADO", janela: [arg("from"), arg("to")], includeSpamTrash: process.argv.includes("--spam-trash"), candidatas: ids.length, contemId: arg("id") ? ids.includes(arg("id")) : null }));
}
