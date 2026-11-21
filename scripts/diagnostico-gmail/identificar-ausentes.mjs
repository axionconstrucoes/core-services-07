// F7/H6b - SOMENTE LEITURA. Lista metadados minimos (id opaco, internalDate, rotulos, campos onde o dominio aparece)
// das mensagens do prefiltro WEG a partir de uma data, para comparar com o banco. Nunca imprime assunto/corpo/enderecos/credenciais.
// Uso: node scripts/diagnostico-gmail/identificar-ausentes.mjs --env <arquivo .env> --prefix GOOGLE_GMAIL_REYNALDO --since 2026-11-01 [--max 60]
// Reusa guardedFetch da sonda: so GET de profile/messages(list)/messages/{id}?format=metadata.
import { readFileSync } from "node:fs";
import { guardedFetch, parseEnvText, missingNames, credentialNames } from "../lib/mail-universal/gmail-coverage-probe.mjs";
import { extractAddresses, domainOf, domainMatchesOrSubdomain } from "../lib/mail-universal/participants.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export function summarizeMetadata(json, mailbox, target = "weg.net") {
  const fields = {};
  for (const h of json.payload?.headers ?? []) {
    const name = String(h.name).toLowerCase();
    if (!["from", "to", "cc", "bcc"].includes(name)) continue;
    const doms = extractAddresses(h.value).map(domainOf);
    fields[name] = doms.some((d) => domainMatchesOrSubdomain(d, target)) ? (doms.some((d) => d === target) ? "weg.net" : "subdominio") : "-";
  }
  const from = extractAddresses((json.payload?.headers ?? []).find((h) => String(h.name).toLowerCase() === "from")?.value);
  return {
    id: json.id,
    internalDate: json.internalDate ? new Date(Number(json.internalDate)).toISOString() : null,
    labels: json.labelIds ?? [],
    direction: from.includes(mailbox) ? "OUTBOUND" : "INBOUND",
    wegEm: fields,
  };
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
  const prof = await (await f(`${GMAIL}/profile`, auth)).json();
  const mailbox = String(prof.emailAddress).toLowerCase();
  const after = Math.floor(Date.parse(arg("since")) / 1000);
  const q = `after:${after} {from:weg.net to:weg.net cc:weg.net bcc:weg.net}`;
  const ids = [];
  let pageToken;
  do {
    const u = new URL(`${GMAIL}/messages`);
    u.searchParams.set("q", q); u.searchParams.set("maxResults", "100");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const j = await (await f(u.toString(), auth)).json();
    for (const m of j.messages ?? []) ids.push(m.id);
    pageToken = j.nextPageToken;
  } while (pageToken && ids.length < Number(arg("max", "60")));
  const out = [];
  for (const id of ids.slice(0, Number(arg("max", "60")))) {
    const u = new URL(`${GMAIL}/messages/${id}`);
    u.searchParams.set("format", "metadata");
    for (const h of ["From", "To", "Cc", "Bcc"]) u.searchParams.append("metadataHeaders", h);
    out.push(summarizeMetadata(await (await f(u.toString(), auth)).json(), mailbox));
  }
  console.log(JSON.stringify({ status: "EXECUTADO", mailbox, since: arg("since"), total: out.length, mensagens: out }, null, 1));
}
