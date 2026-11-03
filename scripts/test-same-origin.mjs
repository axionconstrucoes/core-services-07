// Checagem de origem das rotas de escrita por cookie (apps/web/lib/http/same-origin.ts) e seu uso na rota de descarte SSMA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { isCrossOriginRequest } = await import("../apps/web/lib/http/same-origin");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const h = (o) => new Headers(o);

test("origem declarada diferente do host do app é cross-origin; mesma origem não", () => {
  assert.equal(isCrossOriginRequest(h({ host: "acc.axion.com.br", origin: "https://evil.example" })), true);
  assert.equal(isCrossOriginRequest(h({ host: "acc.axion.com.br", origin: "https://acc.axion.com.br" })), false);
  assert.equal(isCrossOriginRequest(h({ host: "localhost:3999", origin: "http://localhost:3999" })), false);
  assert.equal(isCrossOriginRequest(h({ host: "localhost:3999", origin: "http://localhost:3000" })), true, "porta diferente é outra origem");
  assert.equal(isCrossOriginRequest(h({ host: "a.com", origin: "null" })), true, "Origin inválido/null é recusado");
});

test("Sec-Fetch-Site cross-site/same-site é recusado; same-origin/none e ausência passam", () => {
  for (const v of ["cross-site", "same-site"]) assert.equal(isCrossOriginRequest(h({ host: "a.com", "sec-fetch-site": v })), true);
  for (const v of ["same-origin", "none"]) assert.equal(isCrossOriginRequest(h({ host: "a.com", "sec-fetch-site": v })), false);
  assert.equal(isCrossOriginRequest(h({ host: "a.com" })), false, "cliente sem Origin segue para a autenticação por sessão");
});

test("atrás de proxy vale x-forwarded-host", () => {
  assert.equal(isCrossOriginRequest(h({ host: "interno:3000", "x-forwarded-host": "acc.axion.com.br", origin: "https://acc.axion.com.br" })), false);
  assert.equal(isCrossOriginRequest(h({ host: "interno:3000", "x-forwarded-host": "acc.axion.com.br", origin: "https://interno:3000" })), true);
});

test("a rota de descarte checa a origem ANTES de consultar a sessão", () => {
  const route = readFileSync(path.join(root, "app", "api", "ssma", "photos", "discard", "route.ts"), "utf8");
  assert.ok(route.includes("isCrossOriginRequest(request.headers)"));
  assert.ok(route.indexOf("isCrossOriginRequest(") < route.indexOf("createSupabaseServerClient()"));
});
