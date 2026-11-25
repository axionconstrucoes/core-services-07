// Fase 6/H3 — a sonda de cobertura do Gmail é SOMENTE LEITURA, só metadados, e não vaza segredo/conteúdo. fetch FALSO (sem rede).
import assert from "node:assert/strict";
import { credentialNames, guardedFetch, missingNames, parseEnvText, runProbe } from "./lib/mail-universal/gmail-coverage-probe.mjs";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); }
}
const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const SECRET = "valor-ficticio-secreto";
const env = { P_CLIENT_ID: "id", P_CLIENT_SECRET: SECRET, P_REFRESH_TOKEN: "rt" };
const months = [{ label: "2026-11", start: "2026-11-01T00:00:00Z", end: "2026-12-01T00:00:00Z" }];

function fakeFetch(calls) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    const u = new URL(url);
    if (u.hostname === "oauth2.googleapis.com") return json({ access_token: "at", scope: "https://www.googleapis.com/auth/gmail.readonly" });
    if (u.pathname.endsWith("/profile")) return json({ emailAddress: "caixa@axion.com.br", messagesTotal: 10 });
    if (u.pathname.endsWith("/messages") && !u.searchParams.get("format")) return json({ messages: u.searchParams.get("q").includes("from:weg.net") ? [{ id: "w1" }, { id: "w2" }] : [{ id: "w1" }, { id: "w2" }, { id: "o1" }] });
    return json({ payload: { headers: [{ name: "From", value: "X <a@obras.weg.net>" }, { name: "To", value: "b@axion.com.br" }], snippet: "CONTEUDO-NAO-DEVE-SAIR" } });
  };
}

await check("faltando credencial: BLOQUEADO listando só NOMES, nenhuma chamada", async () => {
  const calls = [];
  const r = await runProbe({ env: { P_CLIENT_ID: "x" }, prefix: "P", fetchImpl: fakeFetch(calls), months });
  assert.equal(r.status, "BLOQUEADO");
  assert.deepEqual(r.missingNames, ["P_CLIENT_SECRET", "P_REFRESH_TOKEN"]);
  assert.equal(calls.length, 0);
  assert.deepEqual(missingNames(env, "P"), []);
  assert.deepEqual(credentialNames("P"), { clientId: "P_CLIENT_ID", clientSecret: "P_CLIENT_SECRET", refreshToken: "P_REFRESH_TOKEN" });
});

await check("sonda: só GET (+ POST do token), só metadata, contagens e domínios (subdomínio detectado); sem segredo/conteúdo na saída", async () => {
  const calls = [];
  const r = await runProbe({ env, prefix: "P", fetchImpl: fakeFetch(calls), months, maxMetadata: 5 });
  assert.equal(r.status, "EXECUTADO");
  assert.deepEqual(r.perMonth, [{ month: "2026-11", universe: 3, wegPrefilter: 2 }]);
  assert.deepEqual(r.domains, { "obras.weg.net": 2 });
  assert.equal(r.metadataOnlySubdomain, 2);
  assert.ok(calls.every((c) => c.method === "GET" || c.url === "https://oauth2.googleapis.com/token"));
  assert.ok(calls.filter((c) => /\/messages\/w/.test(c.url)).every((c) => c.url.includes("format=metadata")));
  const out = JSON.stringify(r);
  assert.ok(!out.includes(SECRET) && !out.includes("CONTEUDO-NAO-DEVE-SAIR"));
});

await check("guarda recusa escrita, corpo completo e hosts/caminhos fora da lista", async () => {
  const f = guardedFetch(async () => json({}));
  await assert.rejects(() => f("https://gmail.googleapis.com/gmail/v1/users/me/messages/abc/modify", { method: "POST" }), /PROBE_READ_ONLY_VIOLATION/);
  await assert.rejects(() => f("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST" }), /PROBE_READ_ONLY_VIOLATION/);
  await assert.rejects(() => f("https://gmail.googleapis.com/gmail/v1/users/me/messages/abc?format=full"), /só format=metadata/);
  await assert.rejects(() => f("https://gmail.googleapis.com/gmail/v1/users/me/messages/abc?format=raw"), /só format=metadata/);
  await assert.rejects(() => f("https://gmail.googleapis.com/gmail/v1/users/me/messages/abc", { method: "DELETE" }), /PROBE_READ_ONLY_VIOLATION/);
  await assert.rejects(() => f("https://evil.example/x"), /PROBE_READ_ONLY_VIOLATION/);
  await assert.rejects(() => f("https://gmail.googleapis.com/gmail/v1/users/me/drafts"), /PROBE_READ_ONLY_VIOLATION/);
});

await check("parseEnvText lê pares sem registrar valores", () => {
  assert.deepEqual(parseEnvText('A=1\n# c\nB="x y"\n'), { A: "1", B: "x y" });
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
