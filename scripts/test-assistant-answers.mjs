// Respostas da AXIA (texto) para perguntas COBERTAS pela base atual; "Como navego pelo ACC?" é teste separado
// (hoje cai no encaminhamento para a Ajuda). O Q&A novo (docs/qa-axia-por-aba-rascunho.md) é rascunho, não consultado.
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { answerQuestion } = await import("../apps/web/lib/assistant/answer");
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const a1 = answerQuestion("Como entro no ACC e escolho a obra?", "obra-teste");
t("pergunta coberta (acesso) ⇒ entrada aprovada 'qa-N2' com resposta e fonte no manual", a1.entryId === "qa-N2" && a1.summary.length > 0 && !!a1.manualSection);
const a2 = answerQuestion("O que significam os graus de risco?", "obra-teste");
t("pergunta coberta (graus de risco) ⇒ entrada aprovada 'qa-R1' (lote 1 substitui criterios-risco)", a2.entryId === "qa-R1");
const a3 = answerQuestion("Como navego pelo ACC?", "obra-teste");
t("'Como navego pelo ACC?' ⇒ encaminhamento para a Ajuda (fallback) — lacuna conhecida da base", a3.entryId === "fallback");
console.log(`\nRESULTADO: ${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
