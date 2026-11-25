// Piloto WEG — SIMULAÇÃO do backfill (SOMENTE LEITURA). Não escreve em lugar nenhum: nem banco, nem Gmail, nem cursor.
// Lê do Gmail só METADADOS (From/To/Cc/Bcc/Message-ID; format=metadata) pela mesma proteção da sonda (guardedFetch: só GET, só 3 caminhos)
// e compara a regra ANTIGA (remetente único @weg.net) com a regra NOVA (qualquer participante weg.net ou subdomínio) para todo o histórico.
// Saída (arquivo local, fora do repositório): ids opacos, data, direção, elegibilidade antiga/nova, campos onde o domínio aparece e HASH do Message-ID.
// NUNCA grava endereços, assunto, corpo ou credenciais. Quem cruza com o banco é uma consulta SELECT feita à parte.
// Uso: node scripts/diagnostico-gmail/simular-backfill.mjs --env <arquivo .env> --prefix GOOGLE_GMAIL_REYNALDO --since 2025-09-01 --out <arquivo.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { guardedFetch, parseEnvText, missingNames, credentialNames } from "../lib/mail-universal/gmail-coverage-probe.mjs";
import { extractAddresses, domainOf, domainMatchesOrSubdomain } from "../lib/mail-universal/participants.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const TARGET = "weg.net";
const hdr = (json, name) => (json.payload?.headers ?? []).filter((h) => String(h.name).toLowerCase() === name.toLowerCase()).map((h) => h.value);

/** Regra ANTIGA (main): mensagem só entra se o ÚNICO remetente for @weg.net exato. */
export function oldRuleEligible(fromAddresses) { return fromAddresses.length === 1 && /^[^\s@]+@weg\.net$/i.test(fromAddresses[0]); }
/** Regra NOVA: qualquer participante (From/To/Cc/Bcc) em weg.net ou subdomínio legítimo. */
export function newRuleEligible(participants) { return participants.some((a) => domainMatchesOrSubdomain(domainOf(a), TARGET)); }

export function summarize(json, mailbox) {
  const from = hdr(json, "From").flatMap(extractAddresses);
  const to = hdr(json, "To").flatMap(extractAddresses);
  const cc = hdr(json, "Cc").flatMap(extractAddresses);
  const bcc = hdr(json, "Bcc").flatMap(extractAddresses);
  const all = [...from, ...to, ...cc, ...bcc];
  const where = (list) => (list.some((a) => domainOf(a) === TARGET) ? "exato" : list.some((a) => domainMatchesOrSubdomain(domainOf(a), TARGET)) ? "subdominio" : "-");
  const mid = hdr(json, "Message-ID")[0] ?? hdr(json, "Message-Id")[0] ?? "";
  return {
    id: json.id,
    thread: json.threadId,
    date: json.internalDate ? new Date(Number(json.internalDate)).toISOString() : null,
    direction: from.includes(mailbox) ? "OUTBOUND" : "INBOUND",
    old: oldRuleEligible(from),
    now: newRuleEligible(all),
    em: { from: where(from), to: where(to), cc: where(cc), bcc: where(bcc) },
    midHash: mid ? createHash("sha256").update(mid.trim().toLowerCase()).digest("hex").slice(0, 16) : null,
  };
}

async function listIds(f, token, query) {
  const ids = []; let pageToken;
  for (let page = 0; page < 60; page += 1) {
    const u = new URL(`${GMAIL}/messages`); u.searchParams.set("q", query); u.searchParams.set("maxResults", "500");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await f(u.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`LIST_FAILED: HTTP ${res.status}`);
    const json = await res.json();
    for (const m of json.messages ?? []) ids.push(m.id);
    pageToken = json.nextPageToken; if (!pageToken) break;
  }
  return ids;
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  const env = parseEnvText(readFileSync(arg("env"), "utf8"));
  const prefix = arg("prefix", "GOOGLE_GMAIL_REYNALDO");
  const miss = missingNames(env, prefix);
  if (miss.length) { console.log(JSON.stringify({ status: "BLOQUEADO", faltam: miss })); process.exit(0); }
  const log = []; const f = guardedFetch(fetch, log); const n = credentialNames(prefix);
  const tk = await (await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env[n.clientId], client_secret: env[n.clientSecret], refresh_token: env[n.refreshToken], grant_type: "refresh_token" }) })).json();
  if (!tk.access_token) { console.log(JSON.stringify({ status: "TOKEN_FALHOU" })); process.exit(1); }
  const auth = { headers: { authorization: `Bearer ${tk.access_token}` } };
  const mailbox = String((await (await f(`${GMAIL}/profile`, auth)).json()).emailAddress ?? "").toLowerCase();
  const since = arg("since", "2025-09-01");
  const q = `after:${since.replaceAll("-", "/")} {from:${TARGET} to:${TARGET} cc:${TARGET} bcc:${TARGET}}`;
  const ids = await listIds(f, tk.access_token, q);
  const rows = [];
  for (const id of ids) {
    const u = new URL(`${GMAIL}/messages/${id}`); u.searchParams.set("format", "metadata");
    for (const h of ["From", "To", "Cc", "Bcc", "Message-ID"]) u.searchParams.append("metadataHeaders", h);
    const res = await f(u.toString(), auth); if (!res.ok) { rows.push({ id, erro: res.status }); continue; }
    rows.push(summarize(await res.json(), mailbox));
  }
  const ok = rows.filter((r) => !r.erro);
  const cnt = (fn) => ok.filter(fn).length;
  const mids = ok.map((r) => r.midHash).filter(Boolean);
  const report = {
    status: "EXECUTADO", somenteLeitura: true, consulta: q.replace(/\{.*\}/, "{from|to|cc|bcc:weg.net}"), caixa: "titular (nome oculto)", idsListados: ids.length, metadadosLidos: ok.length, falhasLeitura: rows.length - ok.length,
    regraAntigaAceita: cnt((r) => r.old), regraNovaAceita: cnt((r) => r.now), ganhoComRegraNova: cnt((r) => r.now && !r.old), perdidasHoje: cnt((r) => r.now && !r.old),
    porDirecao: { INBOUND: cnt((r) => r.direction === "INBOUND"), OUTBOUND: cnt((r) => r.direction === "OUTBOUND") },
    novasPorDirecao: { INBOUND: cnt((r) => r.now && !r.old && r.direction === "INBOUND"), OUTBOUND: cnt((r) => r.now && !r.old && r.direction === "OUTBOUND") },
    soEmCcOuBcc: cnt((r) => r.now && r.em.from === "-" && r.em.to === "-"), soSubdominio: cnt((r) => r.now && Object.values(r.em).every((v) => v !== "exato")),
    messageIdRepetidoNoGmail: mids.length - new Set(mids).size, threadsDistintas: new Set(ok.map((r) => r.thread)).size,
    intervalo: [ok.map((r) => r.date).sort()[0], ok.map((r) => r.date).sort().at(-1)], chamadasHttp: log.length, tiposDeChamada: [...new Set(log)],
  };
  writeFileSync(arg("out"), JSON.stringify({ report, rows: ok.map(({ id, date, direction, old, now, midHash }) => ({ id, date, direction, old, now, midHash })) }, null, 1));
  console.log(JSON.stringify(report, null, 2));
}
