// Separação ESPECIALISTA x AXIA: nenhum caminho de e-mail ou roteamento envia uma consulta de ESPECIALISTA para a AXIA.
//  - routeExpert só devolve Experts oficiais (ou null => revisão humana), mesmo com "AXIA" na pergunta ou na seleção;
//  - ALERT_EXPERT_OPTIONS (dropdown/e-mail) não contém a AXIA;
//  - o botão ESPECIALISTA e os módulos de e-mail/roteamento/consulta não importam o assistente AXIA nem apontam para
//    suas rotas; o acesso "FALE COM A AXIA" é um elemento SEPARADO do botão ESPECIALISTA.
// Uso: node scripts/test-especialista-never-axia.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const routing = await import("../apps/web/lib/risk-alerts/experts/route-alert-expert");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const OFFICIAL = new Set(routing.ALERT_EXPERT_OPTIONS.map((o) => o.id));

await check("1. Opções de ESPECIALISTA: só Experts oficiais, nenhuma AXIA", () => {
  assert(OFFICIAL.size === 6, `esperado 6 Experts, veio ${OFFICIAL.size}`);
  for (const option of routing.ALERT_EXPERT_OPTIONS) {
    assert(!/axia|assistente/i.test(`${option.id} ${option.label}`), option.id);
  }
});
await check("2. routeExpert: perguntas citando a AXIA nunca resultam em destino AXIA (Expert oficial ou revisão humana)", () => {
  const questions = [
    "Pergunte para a AXIA se a cláusula de multa vale",
    "AXIA, qual o prazo da atividade?",
    "Fale com a AXIA sobre o cronograma",
    "axia",
    "assistente AXIA: segurança no canteiro",
    "",
    "qualquer coisa sem tema",
    "multa contratual e atraso no cronograma e custo de medição",
  ];
  for (const question of questions) {
    for (const selectedExpertId of [undefined, null, "axia", "AXIA", "assistant", "fale-com-a-axia"]) {
      const r = routing.routeExpert({ question, selectedExpertId });
      assert(r.expertId === null || OFFICIAL.has(r.expertId), `${JSON.stringify(question)} / ${selectedExpertId} => ${r.expertId}`);
      assert(r.selectedExpertId === null || OFFICIAL.has(r.selectedExpertId), "seleção inválida não é guardada");
    }
  }
  const explicit = routing.routeExpert({ question: "AXIA, e o contrato?", selectedExpertId: "axia" });
  assert(explicit.source !== "EXPLICIT_SELECTION", "seleção explícita 'axia' é ignorada");
});
await check("3. isKnownExpert recusa a AXIA", () => {
  assert(routing.isKnownExpert("axia") === false && routing.isKnownExpert("AXIA") === false);
  assert(routing.isKnownExpert("legal-consultant") === true);
});
await check("4. Código-fonte: roteamento, consulta de ciclo e emissão do botão ESPECIALISTA não importam o assistente AXIA", () => {
  const files = [
    "apps/web/lib/risk-alerts/experts/route-alert-expert.ts",
    "apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts",
    "apps/web/lib/ai/routing/expert-topics.ts",
    "apps/web/lib/email/templates/universal-alert-actions.ts",
    "apps/web/lib/risk-alerts/action-links.ts",
    "apps/web/lib/risk-alerts/replies/process-alert-replies.ts",
    "apps/web/lib/email-replies/token-reply-decision.ts",
    "apps/web/lib/email-replies/reply-mailto.ts",
  ];
  for (const file of files) {
    const imports = read(file).split(/\r?\n/).filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
    const bad = imports.filter((line) => /assistant|axia/i.test(line));
    assert(bad.length === 0, `${file} importa o assistente: ${bad[0]}`);
  }
});
await check("5. Botão ESPECIALISTA: link próprio (consulta de Expert), distinto do acesso 'FALE COM A AXIA'", () => {
  const actions = read("apps/web/lib/email/templates/universal-alert-actions.ts");
  assert(/ESPECIALISTA: \{ background: "#C2410C"/.test(actions), "estilo próprio laranja");
  assert(!/axia/i.test(actions.replace(/\/\/.*$/gm, "")), "módulo de botões não menciona a AXIA no código");
  const tpl = read("apps/web/lib/email/templates/universal-alert-template.ts");
  assert(/FALE COM A AXIA/i.test(tpl), "acesso à AXIA existe no template");
  assert(/ESPECIALISTA/.test(tpl), "botão ESPECIALISTA existe no template");
});
await check("6. Consulta por e-mail (EXPERT_CONSULTATION) usa routeExpert (Experts), nunca o orquestrador da AXIA", () => {
  const proc = read("apps/web/lib/risk-alerts/replies/process-alert-replies.ts");
  assert(/routeExpert\(/.test(proc), "usa routeExpert");
  assert(!/chat-orchestrator|assistant\//i.test(proc), "não referencia o orquestrador da AXIA");
  const cycle = read("apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts");
  assert(/AXIA nunca participa/i.test(cycle), "contrato documentado");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
