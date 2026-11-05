// AXIA na tela "Selecione um projeto" (antes de escolher a obra) e avatar oficial. Sem rede.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { answerQuestion, dependsOnSpecificProject, PROJECT_SELECTION_ENTRY_ID } = await import("../apps/web/lib/assistant/answer");
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

for (const q of ["Quais são os alertas da minha obra?", "Qual o prazo desta obra?", "Onde estão os meus contratos?", "Como está o projeto desta obra WEG?"]) {
  const a = answerQuestion(q, null, {});
  t(`depende de obra: "${q}" orienta a escolher a obra (${a.entryId})`, a.entryId === PROJECT_SELECTION_ENTRY_ID && a.links.length === 0 && a.steps.length === 3 && a.coverage === "completa");
}
for (const q of ["Como entro no ACC e escolho a obra?", "O que significam os graus de risco?", "A AXIA lê os dados da obra?"]) {
  const a = answerQuestion(q, null, {});
  t(`pergunta geral sem obra: "${q}" é respondida pela base (${a.entryId}), sem link de obra`, a.entryId.startsWith("qa-") && a.links.length === 0 && !!a.manualSection);
}
const none = answerQuestion("Qual a previsão do tempo em Marte?", null, {});
t("sem resposta e sem obra: fallback sem link de obra e orientação ao ADMIN em texto", none.entryId === "fallback" && none.links.length === 0 && none.adminHandoff.href === null);
const withProject = answerQuestion("Como entro no ACC e escolho a obra?", "11111111-1111-4111-8111-111111111111", {});
t("com obra: links continuam apontando para a obra", withProject.links.every((l) => l.href.startsWith("/11111111-1111-4111-8111-111111111111/")) && withProject.links.length > 0);
t("padrão de dependência não pega perguntas gerais", !dependsOnSpecificProject("como funciona o escalonamento"));

const route = rd("apps/web/app/projetos/assistente/route.ts");
t("rota da seleção exige login, limita pedidos e não consulta obra", route.includes("auth.getUser()") && route.includes("allowRequest") && route.includes("projectId: null") && !route.includes("getProject"));
const page = rd("apps/web/app/projetos/page.tsx");
t("seleção: AXIA montada sem obra e atalho 'Fale com a AXIA' no cabeçalho claro", page.includes("<AssistantWidget projectId={null} />") && page.includes('context="selecao" tone="onLight"'));
t("seleção: título e subtítulo pretos; textos em fundo escuro brancos", page.includes("text-2xl font-semibold text-black") && page.includes("mt-1 text-base text-black") && !/text-white\/\d/.test(page.replace(/border-white\/40 bg-white\/10[^"]*/g, "")));
t("logo institucional ACC preservado", page.includes('src="/branding/acc-logo.png"'));
const trig = rd("apps/web/components/assistant/vera-trigger.tsx"), widget = rd("apps/web/components/assistant/assistant-widget.tsx");
t("avatar oficial na barra superior (gatilho) e no cabeçalho da conversa", trig.includes("/assistente/axia-avatar.png") && widget.includes("/assistente/axia-avatar.png") && !trig.includes("ajuda-acc.png") && !widget.includes("ajuda-acc.png"));
t("tom onLight: texto e borda pretos", trig.includes('tone === "onLight"') && trig.includes("text-black") && trig.includes("border-black"));
t("widget sem obra: não chama a rota de voz e não mostra link de obra", widget.includes("!projectId") && widget.includes('"/projetos/assistente"'));
const png = existsSync(new URL("../apps/web/public/assistente/axia-avatar.png", import.meta.url)) ? readFileSync(new URL("../apps/web/public/assistente/axia-avatar.png", import.meta.url)) : null;
t("avatar oficial é o recorte aprovado (SHA-256 registrado)", png && createHash("sha256").update(png).digest("hex") === "ecb8eee53d1f73dfe61c4f8fdb0735b70055278cc24e60189bf3247bab0a6488");
console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
