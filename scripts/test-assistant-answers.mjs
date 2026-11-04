// Respostas da AXIA (texto) para perguntas COBERTAS pela base atual; "Como navego pelo ACC?" é teste separado
// (hoje cai no encaminhamento para a Ajuda). O Q&A novo (docs/qa-axia-por-aba-rascunho.md) é rascunho, não consultado.
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { answerQuestion } = await import("../apps/web/lib/assistant/answer");
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const a1 = answerQuestion("Como entro no ACC e escolho a obra?", "obra-teste");
t("pergunta coberta (acesso) ⇒ entrada 'acesso' com passos", a1.entryId === "acesso" && a1.steps.length > 0);
const a2 = answerQuestion("O que significam os graus de risco?", "obra-teste");
t("pergunta coberta (graus de risco) ⇒ entrada 'criterios-risco'", a2.entryId === "criterios-risco");
const a3 = answerQuestion("Como navego pelo ACC?", "obra-teste");
t("'Como navego pelo ACC?' ⇒ encaminhamento para a Ajuda (fallback) — lacuna conhecida da base", a3.entryId === "fallback");
console.log(`\nRESULTADO: ${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
