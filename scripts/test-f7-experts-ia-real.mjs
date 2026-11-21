// Fase 7 / H6c — IA real dos 7 Experts: o rotulo SIMULADA so some com provedor real COMPLETO; matriz de aceite aponta testes existentes.
// PURO: sem rede, sem banco, sem chamada de IA (guarda block-live-ai). Usa apenas NOMES de variaveis, valores sinteticos.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-f7-experts-ia-real.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const ps = await import("../apps/web/lib/ai/routing/provider-status.ts");
const res = await import("../apps/web/lib/ai/providers/resolve-provider-for-expert.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 500)}`); failed += 1; }
}
const EXPERTS = ps.ALL_EXPERT_IDS;
const SYN = { ANTHROPIC_API_KEY: "sintetico-nao-real", ANTHROPIC_MODEL: "modelo-sintetico" };

await check("1 sete Experts, cada um com variavel propria AXION_AI_PROVIDER_*", () => {
  assert.equal(EXPERTS.length, 7);
  const vars = EXPERTS.map((id) => res.EXPERT_PROVIDER_ENV_VAR[id]);
  assert.equal(new Set(vars).size, 7);
  for (const v of vars) assert.match(v, /^AXION_AI_PROVIDER_[A-Z_]+$/);
});
await check("2 ambiente vazio => todos SIMULADO_FAKE, nunca real", () => {
  for (const s of ps.listExpertProviderStatus({})) { assert.equal(s.state, "SIMULADO_FAKE"); assert.equal(s.isReal, false); }
});
await check("3 provider fake explicito (global ou especifico), mesmo com chaves Anthropic presentes => SIMULADO", () => {
  for (const env of [{ AXION_AI_PROVIDER: "fake", ...SYN }, { AXION_AI_PROVIDER: "anthropic", AXION_AI_PROVIDER_CEO: "fake", ...SYN }]) {
    assert.equal(ps.describeExpertProvider("ceo", env).isReal, false);
  }
});
await check("4 so anthropic COMPLETO e real; sem chave ou sem modelo => REAL_INCOMPLETO (falha fechada, nao real)", () => {
  assert.equal(ps.describeExpertProvider("ceo", { AXION_AI_PROVIDER: "anthropic", ...SYN }).state, "REAL_CONFIGURADO");
  const noKey = ps.describeExpertProvider("ceo", { AXION_AI_PROVIDER: "anthropic", ANTHROPIC_MODEL: "x" });
  assert.equal(noKey.state, "REAL_INCOMPLETO"); assert.deepEqual(noKey.missing, ["ANTHROPIC_API_KEY"]); assert.equal(noKey.isReal, false);
  const noModel = ps.describeExpertProvider("ceo", { AXION_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x" });
  assert.deepEqual(noModel.missing, ["ANTHROPIC_MODEL"]);
  assert.equal(ps.describeExpertProvider("ceo", { AXION_AI_PROVIDER: "openai", ...SYN }).isReal, false);
});
await check("5 ativar um Expert nao ativa os outros (isolamento por variavel especifica)", () => {
  const env = { AXION_AI_PROVIDER_LEGAL_CONSULTANT: "anthropic", ...SYN };
  const real = ps.listExpertProviderStatus(env).filter((s) => s.isReal).map((s) => s.expertId);
  assert.deepEqual(real, ["legal-consultant"]);
});
await check("6 rotulo: fake/ausente => SIMULADA; so provedor real remove; idempotente; misto rotulado", () => {
  const t = "parecer";
  assert.ok(ps.isSimulatedAnswerText(ps.labelAnswerForProvider(t, ["fake"])));
  assert.ok(ps.isSimulatedAnswerText(ps.labelAnswerForProvider(t, [])));
  assert.ok(ps.isSimulatedAnswerText(ps.labelAnswerForProvider(t, [null, undefined])));
  assert.equal(ps.labelAnswerForProvider(t, ["anthropic"]), t);
  assert.equal(ps.labelAnswerForProvider(ps.labelAnswerForProvider(t, ["fake"]), ["fake"]), ps.labelAnswerForProvider(t, ["fake"]));
  assert.ok(ps.labelAnswerForProvider(t, ["anthropic", "fake"]).includes("parte desta resposta"));
});
await check("7 nenhum valor de variavel vaza no status (so NOMES)", () => {
  const json = JSON.stringify(ps.listExpertProviderStatus({ AXION_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "SEGREDO-XYZ-123", ANTHROPIC_MODEL: "MODELO-ABC-999" }));
  assert.ok(!json.includes("SEGREDO-XYZ-123")); assert.ok(!json.includes("MODELO-ABC-999"));
});
await check("8 resolucao em runtime concorda com o status (nome do provedor)", () => {
  const saved = { ...process.env };
  try {
    for (const k of Object.keys(process.env)) if (k.startsWith("AXION_AI_PROVIDER") || k.startsWith("ANTHROPIC_")) delete process.env[k];
    process.env.AXION_AI_PROVIDER = "anthropic"; process.env.AXION_AI_PROVIDER_ESG_DIRECTOR = "fake";
    assert.equal(res.resolveAiProviderNameForExpert("esg-director"), "fake");
    assert.equal(res.resolveAiProviderNameForExpert("ceo"), "anthropic");
    assert.throws(() => res.resolveAiProviderForExpert("ceo"), /incompleta|ausentes/i); // sem chave: falha fechada, nao cai em fake
  } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
});
await check("9 matriz de aceite: todo teste citado existe e esta em test-scripts.list", () => {
  const doc = readFileSync(path.join(root, "docs/criterios-aceitacao-integracoes.md"), "utf8");
  const list = readFileSync(path.join(root, "scripts/test-scripts.list"), "utf8");
  const cited = [...new Set(doc.match(/test-[a-z0-9-]+\.mjs/g) ?? [])];
  assert.ok(cited.length >= 8);
  for (const t of cited) { assert.ok(existsSync(path.join(here, t)), `ausente: ${t}`); assert.ok(list.includes(`scripts/${t}`), `fora da lista: ${t}`); }
  for (const c of ["clientes finais", "gerenciadoras", "fornecedores", "weg.net", "mensagens oficiais", "descoberta", "quatro pilares", "especialistas", "auditáveis", "encerramento indevido"]) assert.ok(doc.toLowerCase().includes(c.toLowerCase()), c);
});
await check("10 doc de verificacao nao contem valores secretos nem prefixos de chave", () => {
  const doc = readFileSync(path.join(root, "docs/experts-ia-real-verificacao.md"), "utf8");
  assert.ok(!/sk-ant-|eyJ[A-Za-z0-9]{20,}/.test(doc));
});
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
