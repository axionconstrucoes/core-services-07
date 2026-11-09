// Validação do Q&A da AXIA com DADOS FICTÍCIOS (lote real ainda não aprovado por ID): resposta em texto, citação da
// seção do manual, resposta parcial, ausência de resposta, "Isso não respondeu à minha pergunta" e "Falar com o ADMIN"
// (amarelo e negrito, link da Ajuda preservado, clique sem pergunta nem histórico). Sem rede.
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { answerQuestion } = await import("../apps/web/lib/assistant/answer");
const { ADMIN_TEST_HREF, OFFICIAL_ADMIN_CHANNEL, resolveAdminHandoff, qaFixturesEnabled } = await import("../apps/web/lib/assistant/qa-handoff");
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const TEST = { ACC_AXIA_QA_FIXTURES: "1" };
const P = "obra-teste";

// 1. sem a variável (padrão) e na Vercel: fixtures e destino de teste não existem
t("padrão: fixtures desligadas", qaFixturesEnabled({}) === false);
t("na Vercel: fixtures desligadas mesmo com a variável", qaFixturesEnabled({ ...TEST, VERCEL: "1" }) === false);
const off = answerQuestion("Como funciona o carimbo azul?", P, {});
t("fixtures desligadas: pergunta fictícia cai em 'ausente'", off.coverage === "ausente" && off.entryId === "fallback");
t("sem canal oficial e fora do teste: ADMIN só em texto, sem link", off.adminHandoff.mode === "text" && off.adminHandoff.href === null && off.adminHandoff.test === false);
t("canal oficial: nenhum registrado (G1 pendente)", OFFICIAL_ADMIN_CHANNEL === null);

// 2. resposta completa em texto, com citação
const full = answerQuestion("Como funciona o carimbo azul?", P, TEST);
t("completa: entrada fictícia, resposta em texto e passos", full.entryId === "qa-teste-completa" && full.summary.length > 0 && full.steps.length === 2);
t("completa: cita a seção do manual", full.manualSection === "99.1 (fictícia)" && full.coverage === "completa");

// 3. resposta parcial
const part = answerQuestion("Qual o prazo fictício de conferência?", P, TEST);
t("parcial: cobertura parcial com citação", part.entryId === "qa-teste-parcial" && part.coverage === "parcial" && part.manualSection === "99.2 (fictícia)");

// 4. ausência de resposta
const none = answerQuestion("Qual a previsão do tempo em Marte?", P, TEST);
t("ausência: fallback, cobertura 'ausente', sem citação", none.entryId === "fallback" && none.coverage === "ausente" && none.manualSection === null);

// 5. destino fictício, só em teste; privacidade
const h = part.adminHandoff;
t("teste: link fictício fixo (.invalid), marcado como teste", h.mode === "link" && h.href === ADMIN_TEST_HREF && h.test === true && /@example\.invalid/.test(h.href));
for (const [name, a, q] of [["completa", full, "Como funciona o carimbo azul?"], ["parcial", part, "Qual o prazo fictício de conferência?"], ["ausente", none, "Qual a previsão do tempo em Marte?"]]) {
  const href = decodeURIComponent(a.adminHandoff.href ?? "").toLowerCase();
  t(`privacidade (${name}): o destino não contém a pergunta nem o histórico`, !href.includes("carimbo") && !href.includes("marte") && !href.includes("prazo fict") && !href.includes("body=") && href === decodeURIComponent(ADMIN_TEST_HREF).toLowerCase());
}
t("o destino é o mesmo para qualquer pergunta (URL fixa)", full.adminHandoff.href === part.adminHandoff.href && part.adminHandoff.href === none.adminHandoff.href);
t("resolveAdminHandoff() fora do teste não devolve href", resolveAdminHandoff({}).href === null);

// 6. interface (código-fonte do componente)
const wShell = readFileSync(new URL("../apps/web/components/assistant/assistant-widget.tsx", import.meta.url), "utf8");
// O corpo da resposta (botão "Isso não respondeu", citação do manual) foi extraído para axia-answer-body.tsx.
const wBody = readFileSync(new URL("../apps/web/components/assistant/axia-answer-body.tsx", import.meta.url), "utf8");
const w = wShell + String.fromCharCode(10) + wBody;
t("botão 'Isso não respondeu à minha pergunta' existe", /NOT_ANSWERED_LABEL/.test(w) && /data-axia-nao-respondeu/.test(w));
const adminBlock = w.slice(w.indexOf("data-axia-admin"), w.indexOf("data-axia-admin") + 400);
t("ADMIN em amarelo #ffd54f e negrito", /text-\[#ffd54f\]/.test(adminBlock) && /font-bold/.test(adminBlock));
t("ADMIN aparece só em parcial, ausente ou após o clique", /coverage !== "completa" \|\| last\.notAnswered/.test(w));
t("link da Ajuda preservado", /href=\{`\/\$\{projectId\}\/ajuda`\}/.test(w) && /Abrir o tutorial completo/.test(w));
t("clique do ADMIN é só um link (sem handler, sem fetch)", !/data-axia-admin[\s\S]{0,120}onClick/.test(w));
t("citação do manual exibida", /Fonte no manual: seção/.test(w));
console.log(`\nRESULTADO: ${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
