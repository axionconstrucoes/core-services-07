// Testes sem rede de scripts/verify-crm-sent-copy.mjs (somente leitura da caixa crm@).
import assert from "node:assert/strict";
import fs from "node:fs";
import { inspectHeaders, sha256, runVerify } from "./verify-crm-sent-copy.mjs";

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`OK   ${name}`); };
const H = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
const exp = { toSha256: sha256("carlos.evandro@axion.com.br"), rfc822Id: "<abc@axion.com.br>" };

await check("cabeçalhos corretos: From crm@, To esperado, Cc crm@, sem Bcc, sem proibidos", () => {
  const r = inspectHeaders(H({ From: "ACC <crm@axion.com.br>", To: "carlos.evandro@axion.com.br", Cc: "crm@axion.com.br", "Message-ID": "<abc@axion.com.br>", Subject: "x", "X-ACC-Outbound": "1" }), exp);
  assert.equal(r.fromIsCrm, true); assert.equal(r.toMatchesExpected, true); assert.equal(r.ccContainsCrm, true);
  assert.equal(r.bccPresent, false); assert.equal(r.forbiddenAddressPresent, false); assert.equal(r.messageIdMatches, true); assert.equal(r.hasXAccOutbound, true);
});
await check("destinatário diferente não confere; axion@ é detectado; Bcc detectado", () => {
  const r = inspectHeaders(H({ From: "crm@axion.com.br", To: "axion@axion.com.br", Bcc: "x@y.com" }), exp);
  assert.equal(r.toMatchesExpected, false); assert.equal(r.forbiddenAddressPresent, true); assert.equal(r.bccPresent, true); assert.equal(r.ccContainsCrm, false);
});
await check("entrada inválida não chama a rede", async () => {
  const r = await runVerify({ MSG_ID: "x", RFC822_ID: "y", EXPECTED_TO_SHA256: "z" }, () => { throw new Error("rede"); });
  assert.equal(r.stage, "BAD_INPUT");
});
await check("script não usa métodos de escrita do Gmail nem imprime e-mails/assunto", () => {
  const src = fs.readFileSync(new URL("./verify-crm-sent-copy.mjs", import.meta.url), "utf8");
  assert.ok(!/method:\s*"(PUT|DELETE|PATCH)"/.test(src));
  assert.ok(!/\/(send|modify|trash|delete|insert|import|batchModify)\b/.test(src));
  assert.ok(!/console\.log\([^)]*(emailAddress|subject|value)/i.test(src));
});
console.log(`\n${passed} OK, 0 falha(s)`);
