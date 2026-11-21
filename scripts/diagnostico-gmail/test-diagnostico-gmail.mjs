// F7/H6b - testes puros (sem rede/banco) da causa-raiz e das ferramentas somente leitura.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pilotMessageEligible, pilotSenderQuery, WEG_PILOT_PROJECT } from "../lib/gmail-weg-pilot-sender.mjs";
import { legacyQuery } from "./reproduzir-janela.mjs";
import { summarizeMetadata } from "./identificar-ausentes.mjs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok ${n} - ${name}`); };

const CAIXA = "titular@axion.example";
// Regra que estava em main (09fda9b): UNICO remetente @weg.net exato. Copiada aqui so para provar a lacuna.
const regraMain = (policy) => policy.from.length === 1 && /^[^\s@]+@weg\.net$/i.test(policy.from[0]);

const recebidaDeTerceiroComWegEmTo = { from: ["terceiro@exemplo.com"], recipients: [CAIXA, "alguem@weg.net"] };
const enviadaParaWeg = { from: [CAIXA], recipients: ["alguem@weg.net"] };
const recebidaDaWeg = { from: ["alguem@weg.net"], recipients: [CAIXA] };
const semWeg = { from: ["a@exemplo.com"], recipients: [CAIXA] };

t("regra antiga (main) REJEITA recebida de terceiro com weg.net em To e a ENVIADA para a WEG (causa-raiz)", () => {
  assert.equal(regraMain(recebidaDeTerceiroComWegEmTo), false);
  assert.equal(regraMain(enviadaParaWeg), false);
  assert.equal(regraMain(recebidaDaWeg), true);
});
t("regra vigente da base (Fase 5/A) ACEITA as tres e continua recusando mensagem sem WEG", () => {
  assert.equal(pilotMessageEligible(WEG_PILOT_PROJECT, recebidaDeTerceiroComWegEmTo), true);
  assert.equal(pilotMessageEligible(WEG_PILOT_PROJECT, enviadaParaWeg), true);
  assert.equal(pilotMessageEligible(WEG_PILOT_PROJECT, recebidaDaWeg), true);
  assert.equal(pilotMessageEligible(WEG_PILOT_PROJECT, semWeg), false);
});
t("prefiltro do Gmail da base cobre from/to/cc/bcc (a regra antiga so tinha from:weg.net)", () => {
  const q = pilotSenderQuery(WEG_PILOT_PROJECT);
  for (const campo of ["from", "to", "cc", "bcc"]) assert.ok(q.includes(`${campo}:weg.net`), campo);
});
t("legacyQuery monta after/before em epoch como o sincronizador", () => {
  const q = legacyQuery("2026-11-18T17:54:00Z", "2026-11-19T00:20:00Z");
  const after = Math.floor(Date.parse("2026-11-18T17:54:00Z") / 1000);
  const before = Math.ceil(Date.parse("2026-11-19T00:20:00Z") / 1000);
  assert.ok(q.startsWith(`after:${after} before:${before} {`), q);
  assert.ok(q.includes("to:weg.net"));
});
t("summarizeMetadata devolve so id, data, rotulos, direcao e campos WEG (sem enderecos/assunto)", () => {
  const out = summarizeMetadata({
    id: "abc", internalDate: "1763495848000", labelIds: ["INBOX"],
    payload: { headers: [{ name: "From", value: "Fulano <terceiro@exemplo.com>" }, { name: "To", value: `x@sub.weg.net, ${CAIXA}` }, { name: "Subject", value: "SEGREDO" }] },
  }, CAIXA);
  assert.deepEqual(Object.keys(out).sort(), ["direction", "id", "internalDate", "labels", "wegEm"]);
  assert.equal(out.direction, "INBOUND");
  assert.equal(out.wegEm.to, "subdominio");
  assert.ok(!JSON.stringify(out).includes("SEGREDO") && !JSON.stringify(out).includes("terceiro@"));
});
t("scripts de diagnostico so usam o fetch protegido (sem escrita propria nem banco)", () => {
  for (const f of ["identificar-ausentes.mjs", "reproduzir-janela.mjs"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.ok(src.includes("guardedFetch"), f);
    const code = src.replace(/\/\/.*$/gm, "");
    assert.ok(!/method:\s*"(PUT|PATCH|DELETE)"/.test(code), f);
    assert.ok(!/supabase|\.insert\(|\.update\(|\.rpc\(/.test(code), f);
  }
});
console.log(`${n} testes ok`);
