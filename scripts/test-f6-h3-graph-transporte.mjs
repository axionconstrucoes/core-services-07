// Fase 6/H3 — transporte do Graph testado contra SERVIDOR HTTP FALSO em 127.0.0.1 (nenhuma rede externa, nenhuma credencial real).
// Uso: node scripts/test-f6-h3-graph-transporte.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { createGraphTransportFromEnv, graphFolders, graphMailboxes, missingGraphConfig } from "./lib/mail-universal/graph-config.mjs";
import { createGraphReader } from "./lib/mail-universal/graph-reader.mjs";
import { createGraphTransport, GraphError, parseRetryAfter } from "./lib/mail-universal/graph-transport.mjs";
import { domainMatchesOrSubdomain, hasParticipantInDomain, hasParticipantInExactDomain } from "./lib/mail-universal/participants.mjs";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack ?? e).split("\n").slice(0, 3).join("\n     ")}`); }
}

const MB = "crm@axion.com.br";
const SECRET = "segredo-ficticio-NAO-REAL";
const requests = [];
let behavior = {};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    requests.push({ method: req.method, path: url.pathname, search: url.search, auth: req.headers.authorization ?? null, body });
    const send = (status, json, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(json)); };
    if (url.pathname.endsWith("/oauth2/v2.0/token")) {
      if (behavior.tokenFail) return send(401, { error: "invalid_client", error_description: `detalhe com ${SECRET}` });
      behavior.tokens = (behavior.tokens ?? 0) + 1;
      return send(200, { access_token: `tok-${behavior.tokens}`, expires_in: 3600, token_type: "Bearer" });
    }
    if (behavior.throttle && behavior.throttle > 0) { behavior.throttle -= 1; return send(429, { error: { code: "TooManyRequests" } }, { "retry-after": behavior.retryAfter ?? "2" }); }
    if (behavior.unauthorizedOnce && req.headers.authorization === "Bearer tok-1") { behavior.unauthorizedOnce = false; return send(401, { error: { code: "InvalidAuthenticationToken" } }); }
    const base = `http://127.0.0.1:${server.address().port}`;
    if (url.pathname.includes("/mailFolders/inbox/messages/delta")) {
      if (!url.searchParams.get("page")) return send(200, { value: [{ id: "m1" }, { id: "m2" }], "@odata.nextLink": `${behavior.evilNext ?? base}/v1.0/users/${MB}/mailFolders/inbox/messages/delta?page=2` });
      return send(200, { value: [{ id: "m3" }, { id: "m4", "@removed": { reason: "deleted" } }], "@odata.deltaLink": `${base}/v1.0/users/${MB}/mailFolders/inbox/messages/delta?token=D-INBOX` });
    }
    if (url.pathname.includes("/mailFolders/sentitems/messages/delta")) return send(200, { value: [{ id: "s1" }], "@odata.deltaLink": `${base}/v1.0/users/${MB}/mailFolders/sentitems/messages/delta?token=D-SENT` });
    if (/\/messages\/[^/]+\/attachments$/.test(url.pathname)) {
      if (!url.searchParams.get("p")) return send(200, { value: [{ id: "a1", name: "cronograma.mpp", contentType: "application/octet-stream", size: 2048 }], "@odata.nextLink": `${base}${url.pathname}?p=2` });
      return send(200, { value: [{ id: "a2", name: "foto.png", contentType: "image/png", size: 10, isInline: true }] });
    }
    const m = url.pathname.match(/\/messages\/([^/]+)$/);
    if (m) {
      return send(200, {
        id: m[1], subject: "Assunto sintetico", from: { emailAddress: { address: "Contato@obras.sub.weg.net" } },
        toRecipients: [{ emailAddress: { address: MB } }], ccRecipients: [{ emailAddress: { address: "cc@weg.net" } }], bccRecipients: [],
        sentDateTime: "2026-11-10T12:00:00Z", receivedDateTime: "2026-11-10T12:00:05Z", hasAttachments: m[1] === "m1",
        internetMessageId: `<${m[1]}@sintetico>`, conversationId: "c1", bodyPreview: "previa", body: { contentType: "text", content: "corpo sintetico" },
      });
    }
    return send(404, { error: { code: "ErrorItemNotFound" } });
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleeps = [];
const mk = (extra = {}) => createGraphTransport({ tenantId: "tenant-ficticio", clientId: "cid", clientSecret: SECRET, graphBase: `${BASE}/v1.0`, authority: BASE, sleep: async (ms) => { sleeps.push(ms); }, ...extra });
const reset = () => { requests.length = 0; sleeps.length = 0; behavior = {}; };

await check("delta por pasta com paginação (nextLink) e deltaLink; remoções marcadas; cursor GRAPH_DELTA", async () => {
  reset();
  const reader = createGraphReader({ transport: mk() });
  const r = await reader.list({ mailbox: MB, cursor: null, window: { start: "2026-11-01T00:00:00Z", end: "2026-11-30T00:00:00Z" } });
  assert.deepEqual(r.refs.map((x) => [x.id, x.folder, x.removed]), [["m1", "inbox", false], ["m2", "inbox", false], ["m3", "inbox", false], ["m4", "inbox", true], ["s1", "sentitems", false]]);
  assert.equal(r.nextCursor.kind, "GRAPH_DELTA");
  assert.ok(r.nextCursor.deltaLinks.inbox.includes("D-INBOX") && r.nextCursor.deltaLinks.sentitems.includes("D-SENT"));
  assert.ok(requests.find((q) => q.path.includes("/delta") && q.search.includes("receivedDateTime+ge") || q.search.includes("receivedDateTime%20ge")), "primeira carga filtra pelo início da janela");
});

await check("execução incremental usa o deltaLink do cursor (sem refiltrar por data)", async () => {
  reset();
  const reader = createGraphReader({ transport: mk() });
  const r2 = await reader.list({ mailbox: MB, cursor: { kind: "GRAPH_DELTA", deltaLinks: { inbox: `${BASE}/v1.0/users/${MB}/mailFolders/inbox/messages/delta?page=2`, sentitems: `${BASE}/v1.0/users/${MB}/mailFolders/sentitems/messages/delta?token=D-SENT` } }, window: { start: "2026-11-01T00:00:00Z", end: "2026-11-30T00:00:00Z" } });
  assert.equal(r2.refs.length, 3);
  assert.ok(requests.every((q) => !q.search.includes("receivedDateTime")));
});

await check("getMessage + anexos: só metadados (sem contentBytes), paginação de anexos, normalização e participantes weg.net/subdomínio", async () => {
  reset();
  const reader = createGraphReader({ transport: mk() });
  const msg = await reader.getMessage(MB, { id: "m1", folder: "inbox" });
  assert.equal(msg.provider, "OUTLOOK");
  assert.deepEqual(msg.from, ["contato@obras.sub.weg.net"]);
  assert.deepEqual(msg.cc, ["cc@weg.net"]);
  assert.equal(msg.attachments.length, 2);
  assert.deepEqual(msg.attachments.map((a) => [a.filename, a.size, a.available]), [["cronograma.mpp", 2048, true], ["foto.png", 10, true]]);
  const att = requests.filter((q) => q.path.includes("/attachments"));
  assert.ok(att.length === 2 && att.every((q) => !/contentBytes|\$value/i.test(q.search + q.path)));
  assert.ok(hasParticipantInDomain({ from: msg.from, to: msg.to, cc: msg.cc }, "weg.net"));
});

await check("SOMENTE LEITURA: o servidor só viu GET (e o POST do token); método de escrita não existe no transporte", async () => {
  reset();
  const t = mk();
  const reader = createGraphReader({ transport: t });
  await reader.list({ mailbox: MB, cursor: null, window: { start: "2026-11-01T00:00:00Z", end: "2026-11-30T00:00:00Z" } });
  await reader.getMessage(MB, { id: "m2", folder: "inbox" });
  assert.ok(requests.every((q) => q.method === "GET" || (q.method === "POST" && q.path.endsWith("/oauth2/v2.0/token"))));
  assert.deepEqual(Object.keys(t).sort(), ["delta", "getMessage", "listAttachments"]);
  assert.ok(!requests.some((q) => /sendMail|move|copy|forward|reply/i.test(q.path)));
  assert.equal(Object.isFrozen(t), true);
});

await check("429 respeita Retry-After (segundos) e repete; Retry-After como data HTTP também", async () => {
  reset();
  behavior.throttle = 2;
  behavior.retryAfter = "3";
  const msg = await mk().getMessage({ mailbox: MB, id: "m2" });
  assert.equal(msg.id, "m2");
  assert.deepEqual(sleeps, [3000, 3000]);
  assert.equal(parseRetryAfter("5"), 5000);
  assert.equal(parseRetryAfter(new Date(1_000_000 + 7000).toUTCString(), 1_000_000), 7000);
  assert.equal(parseRetryAfter("lixo"), null);
  assert.equal(parseRetryAfter("9999"), 120000, "teto de 120 s");
});

await check("429 persistente esgota as tentativas e falha com status (sem repetir infinitamente)", async () => {
  reset();
  behavior.throttle = 99;
  await assert.rejects(() => mk({ maxRetries: 2 }).getMessage({ mailbox: MB, id: "m2" }), (e) => e instanceof GraphError && e.status === 429);
  assert.equal(sleeps.length, 2);
});

await check("401 renova o token uma vez e conclui; token é reutilizado entre chamadas", async () => {
  reset();
  behavior.unauthorizedOnce = true;
  const t = mk();
  await t.getMessage({ mailbox: MB, id: "m2" });
  assert.equal(behavior.tokens, 2);
  await t.getMessage({ mailbox: MB, id: "m3" });
  assert.equal(behavior.tokens, 2, "sem novo token enquanto válido");
});

await check("nextLink fora do host do Graph é REJEITADO e o token não é enviado a terceiros", async () => {
  reset();
  behavior.evilNext = "http://localhost:1";
  const reader = createGraphReader({ transport: mk() });
  await assert.rejects(() => reader.list({ mailbox: MB, cursor: null, window: { start: "2026-11-01T00:00:00Z", end: "2026-11-30T00:00:00Z" } }), /GRAPH_LINK_REJECTED/);
});

await check("falha de token: erro só com status/código, SEM segredo nem descrição do servidor", async () => {
  reset();
  behavior.tokenFail = true;
  await assert.rejects(() => mk().getMessage({ mailbox: MB, id: "m1" }), (e) => {
    assert.ok(e instanceof GraphError && e.status === 401);
    assert.ok(!e.message.includes(SECRET) && !e.message.includes("detalhe"));
    return true;
  });
});

await check("entradas inválidas (caixa, pasta, id) são recusadas antes de qualquer requisição", async () => {
  reset();
  const t = mk();
  await assert.rejects(() => t.delta({ mailbox: "x/../y@a.com", folder: "inbox" }), /caixa inválido/);
  await assert.rejects(() => t.delta({ mailbox: MB, folder: "inbox/../../me" }), /pasta inválida/);
  await assert.rejects(() => t.getMessage({ mailbox: MB, id: "a/../b" }), /id de mensagem inválido/);
  assert.equal(requests.length, 0);
});

await check("https obrigatório fora de loopback; configuração incompleta falha fechado sem chamar a rede", async () => {
  reset();
  assert.throws(() => createGraphTransport({ tenantId: "t", clientId: "c", clientSecret: "s", graphBase: "http://graph.exemplo.net/v1.0" }), /https/);
  assert.throws(() => createGraphTransportFromEnv({}), /GRAPH_CONFIG_INCOMPLETA: faltam variáveis ACC_GRAPH_TENANT_ID, ACC_GRAPH_CLIENT_ID, ACC_GRAPH_CLIENT_SECRET, ACC_GRAPH_MAILBOXES/);
  const env = { ACC_GRAPH_TENANT_ID: "t", ACC_GRAPH_CLIENT_ID: "c", ACC_GRAPH_CLIENT_SECRET: "s", ACC_GRAPH_MAILBOXES: "CRM@axion.com.br, crm@axion.com.br" };
  assert.deepEqual(missingGraphConfig(env), []);
  assert.deepEqual(graphMailboxes(env), ["crm@axion.com.br"]);
  assert.deepEqual(graphFolders(env), ["inbox", "sentitems"]);
  assert.equal(requests.length, 0);
});

await check("regra WEG: weg.net e subdomínios legítimos casam; evilweg.net, weg.net.evil.com e variações NÃO", () => {
  for (const d of ["weg.net", "WEG.NET", "obras.weg.net", "a.b.weg.net"]) assert.equal(domainMatchesOrSubdomain(d, "weg.net"), true, d);
  for (const d of ["evilweg.net", "weg.net.evil.com", "weg.net.", ".weg.net", "weg.network", "xweg.net", "weg..net", "", null, "net"]) assert.equal(domainMatchesOrSubdomain(d, "weg.net"), false, String(d));
  assert.equal(hasParticipantInExactDomain({ from: ["a@obras.weg.net"] }, "weg.net"), false, "variante estrita continua exata");
  assert.equal(hasParticipantInDomain({ from: ["a@obras.weg.net"] }, "weg.net"), true);
});

server.close();
console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
