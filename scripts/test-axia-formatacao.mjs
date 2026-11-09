// Teste de APRESENTAÇÃO das respostas da AXIA: estrutura por assunto, Markdown seguro e preservação do conteúdo.
// Renderiza os componentes React reais (AxiaAnswerBody / AxiaRichText) para HTML e confere o resultado.
// Nenhuma rede, nenhuma IA: usa a base de conhecimento local (modo BASE_CONHECIMENTO).
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-axia-formatacao.mjs

import { readFileSync } from "node:fs";
import { register, createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRequire = createRequire(path.join(root, "apps", "web", "package.json"));
const ts = webRequire("typescript");
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");

const richText = await import("../apps/web/lib/assistant/rich-text");
const qaHandoff = await import("../apps/web/lib/assistant/qa-handoff");
const { answerQuestion } = await import("../apps/web/lib/assistant/answer");
const { ASSISTANT_ENTRIES } = await import("../apps/web/lib/assistant/knowledge");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
const ok = (c, m) => {
  if (!c) throw new Error(m);
};
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
};

// Transpila os componentes reais (TSX → CJS) e os executa com o React da própria aplicação.
function loadTsx(rel, extra = {}) {
  const source = readFileSync(path.join(root, rel), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const req = (id) => {
    if (id in extra) return extra[id];
    if (id === "@/lib/assistant/rich-text") return richText;
    if (id === "@/lib/assistant/qa-handoff") return qaHandoff;
    return webRequire(id);
  };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: req, console });
  return mod.exports;
}
const { AxiaRichText } = loadTsx("apps/web/components/assistant/axia-rich-text.tsx");
const { AxiaAnswerBody } = loadTsx("apps/web/components/assistant/axia-answer-body.tsx", { "./axia-rich-text": { AxiaRichText } });

const renderText = (text) => renderToStaticMarkup(React.createElement(AxiaRichText, { text }));
const renderAnswer = (answer, notAnswered = false) =>
  renderToStaticMarkup(React.createElement(AxiaAnswerBody, { answer, notAnswered, onNotAnswered: () => {} }));
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const count = (html, re) => (html.match(re) ?? []).length;

// ---------------------------------------------------------------- estrutura das classificações
await check("exemplo do pedido: 4 graus viram 4 linhas numeradas, na ordem, com o grau em negrito", () => {
  const out = richText.structureClassifications("Crítico: a. Alto: b. Médio: c. Baixo: d.");
  eq(out, "1. **CRÍTICO** — a.\n2. **ALTO** — b.\n3. **MÉDIO** — c.\n4. **BAIXO** — d.", "estrutura");
  const html = renderText("Crítico: a. Alto: b. Médio: c. Baixo: d.");
  eq(count(html, /<ol/g), 1, "uma lista numerada");
  eq(count(html, /<li/g), 4, "quatro itens");
  ok(/<strong class="font-bold">CRÍTICO<\/strong>/.test(html) && /<strong class="font-bold">BAIXO<\/strong>/.test(html), "graus em negrito");
});

await check("texto introdutório e frase final ficam fora da lista (parágrafos próprios)", () => {
  const out = richText.structureClassifications("Os graus são estes. Crítico: a. Alto: b. Médio: c. Baixo: d. Não existe número fixo.");
  ok(out.startsWith("Os graus são estes.\n\n1. **CRÍTICO**") && out.endsWith("— d.\n\nNão existe número fixo."), out);
});

await check("sem falso positivo: menções a graus no meio da frase, ou menos de 3 graus, não são reorganizadas", () => {
  for (const text of [
    "O prazo existe para os quatro graus, mas só Alto e Crítico passam pelo escalonamento. Para Médio e Baixo, o prazo vale em ações manuais.",
    "No padrão, o total é de 12 h úteis em Alto, 3 dias úteis em Médio e 8 dias úteis em Baixo.",
    "Crítico: urgente. Alto: importante.",
    "Abra Documentos e envie o arquivo.",
  ]) eq(richText.structureClassifications(text), text, "texto deveria permanecer igual");
});

const structuredIds = [];
const allTexts = [];
for (const entry of ASSISTANT_ENTRIES) {
  allTexts.push({ id: entry.id, kind: "summary", text: entry.summary });
  entry.steps.forEach((step, i) => allTexts.push({ id: entry.id, kind: `step${i}`, text: step }));
  if (richText.structureClassifications(entry.summary) !== entry.summary) structuredIds.push(entry.id);
}

await check(`respostas predefinidas com graus (${structuredIds.length} assuntos) viram lista numerada Crítico→Baixo, sem perder texto`, () => {
  ok(structuredIds.length >= 2, `esperava ao menos 2 assuntos com graus, achei ${structuredIds.length}`);
  const order = ["CRÍTICO", "ALTO", "MÉDIO", "BAIXO"];
  for (const id of structuredIds) {
    const entry = ASSISTANT_ENTRIES.find((e) => e.id === id);
    const blocks = richText.toRichBlocks(entry.summary);
    const list = blocks.find((b) => b.kind === "ordered");
    ok(list && list.items.length >= 3, `${id}: lista numerada ausente`);
    const labels = list.items.map((item) => item[0]?.kind === "strong" ? item[0].text : "?");
    ok(labels.every((l) => order.includes(l)) && labels.join() === order.filter((l) => labels.includes(l)).join(), `${id}: rótulos fora de ordem: ${labels}`);
    eq(blocks.filter((b) => b.kind === "paragraph").length <= 2, true, `${id}: parágrafos corridos sobrando`);
  }
});

await check(`conteúdo PRESERVADO: ${allTexts.length} textos da base (resumos e passos) mantêm exatamente as mesmas palavras e números`, () => {
  const bad = allTexts.filter(({ text }) => norm(richText.richBlocksToPlainText(richText.toRichBlocks(text))) !== norm(text));
  ok(bad.length === 0, `conteúdo alterado em: ${bad.map((b) => `${b.id}/${b.kind}`).join(", ")}`);
});

// ---------------------------------------------------------------- respostas reais renderizadas
const riskAnswer = answerQuestion("O que significa risco crítico?", null, {});
await check("resposta real 'risco crítico': título em negrito, lista numerada dos 4 graus, links/citação/botão preservados", () => {
  const html = renderAnswer(riskAnswer);
  ok(html.includes(`<p class="font-bold text-[#000000]">${riskAnswer.title}</p>`), "título em negrito");
  eq(count(html, /<strong class="font-bold">(CRÍTICO|ALTO|MÉDIO|BAIXO)<\/strong>/g), 4, "4 graus em negrito");
  for (const link of riskAnswer.links) ok(html.includes(`href="${link.href}"`) && html.includes(link.label), `link ${link.label} preservado`);
  if (riskAnswer.manualSection) ok(html.includes("data-axia-citacao") && html.includes(`seção ${riskAnswer.manualSection}`), "citação do manual");
  if (riskAnswer.tutorialSlide) ok(html.includes(`Tutorial: slide ${riskAnswer.tutorialSlide}`), "slide do tutorial");
  if (riskAnswer.coverage === "completa") ok(html.includes("data-axia-nao-respondeu") && html.includes(qaHandoff.NOT_ANSWERED_LABEL), "botão 'Isso não respondeu'");
});

await check("botão 'Isso não respondeu' some depois do clique e a cobertura parcial/ausente continua avisando", () => {
  ok(!renderAnswer(riskAnswer, true).includes("data-axia-nao-respondeu"), "botão deveria sumir");
  const partial = renderAnswer({ ...riskAnswer, coverage: "parcial" });
  ok(partial.includes('data-axia-cobertura="parcial"') && !partial.includes("data-axia-nao-respondeu"), "parcial");
  ok(renderAnswer({ ...riskAnswer, coverage: "ausente" }).includes('data-axia-cobertura="ausente"'), "ausente");
});

await check("todas as respostas da base renderizam sem erro, sem tabela/imagem/script e cada passo vira item de lista", () => {
  for (const entry of ASSISTANT_ENTRIES) {
    const a = answerQuestion(entry.title, null, {});
    const html = renderAnswer(a);
    ok(!/<(script|table|img|iframe|pre|style)\b/i.test(html), `${entry.id}: elemento proibido`);
    ok(count(html, /<li/g) >= a.steps.length, `${entry.id}: passos perdidos`);
  }
});

// ---------------------------------------------------------------- segurança
await check("HTML digitado na resposta NÃO é interpretado: aparece como texto escapado", () => {
  const html = renderText('<script>alert(1)</script> <img src=x onerror=alert(1)> <a href="javascript:alert(1)">x</a>');
  ok(!/<script/i.test(html) && !/<img/i.test(html) && !/<a /i.test(html), `tag viva no HTML: ${html}`);
  ok(html.includes("&lt;script&gt;") && html.includes("&lt;img"), "tags devem aparecer escapadas");
});

await check("links: só https:// e caminho interno; javascript:, data:, vbscript:, http:, //host, credenciais e espaços viram texto simples", () => {
  const bad = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,AAAA", "vbscript:x", "http://exemplo.com", "//evil.com/x", "https://user:pass@evil.com", "https://exemplo.com/a b", "/\\evil.com", "file:///c:/x", "mailto:a@b.c", "  "];
  for (const href of bad) {
    const html = renderText(`veja [clique aqui](${href}) agora`);
    ok(!/<a /i.test(html) && !/href=/i.test(html), `href aceito indevidamente: ${href} -> ${html}`);
    ok(html.includes("clique aqui"), `rótulo deveria permanecer como texto: ${href}`);
  }
  const external = renderText("[site](https://acc.axion.com.br/ajuda)");
  ok(/<a href="https:\/\/acc\.axion\.com\.br\/ajuda" target="_blank" rel="noopener noreferrer"/.test(external), `link externo: ${external}`);
  ok(/<a[^>]+href="\/documentos"/.test(renderText("[docs](/documentos)")), "link interno");
});

await check("Markdown hostil: imagem, HTML aninhado, caracteres de controle, entradas gigantes e listas enormes são contidos", () => {
  ok(!/<img/i.test(renderText("![x](https://evil.com/a.png)")), "imagem markdown não vira <img>");
  ok(!/\u0000|\u001b/.test(renderText("a\u0000b\u001b[31mc")), "controles removidos");
  const huge = renderText("x".repeat(100000));
  ok(huge.length < richText.RICH_TEXT_MAX_CHARS + 600, `entrada gigante não foi limitada (${huge.length})`);
  const many = richText.parseRichText(Array.from({ length: 500 }, (_, i) => `${(i % 9) + 1}. item ${i}`).join("\n"));
  ok(many.every((b) => b.kind !== "ordered" || b.items.length <= richText.RICH_TEXT_MAX_ITEMS) && many.length <= richText.RICH_TEXT_MAX_BLOCKS, "limites de itens/blocos");
  eq(renderText(""), "", "texto vazio não renderiza nada");
});

await check("resposta de IA futura (via: 'ia') usa o mesmo padrão: títulos, listas e negrito; HTML segue escapado", () => {
  const html = renderAnswer({ ...riskAnswer, via: "ia", summary: "## Passos\n1. Abra **Alertas**\n2. Escolha o grau\n- item A\n- item B <b>x</b>", steps: [], links: [] });
  ok(count(html, /<ol/g) === 1 && count(html, /<ul/g) === 1, "uma lista numerada e uma de marcadores");
  ok(html.includes('<strong class="font-bold">Alertas</strong>') && !/<b>/.test(html) && html.includes("&lt;b&gt;"), "negrito do Markdown sim; <b> digitado não");
});

// ---------------------------------------------------------------- leitura confortável (painel e celular)
await check("quebra de palavras longas e espaçamento vertical: nada de tabelas/pré-formatado e blocos separados por espaço", () => {
  const html = renderText(`Cabeçalho\n\n${"a".repeat(400)}\n\n1. um\n2. dois`);
  ok(html.includes("break-words") && html.includes("[overflow-wrap:anywhere]") && html.includes("min-w-0"), "container quebra palavras longas");
  ok(html.includes("space-y-2"), "espaço vertical entre blocos");
  ok(!/<(table|pre|code)\b/.test(html), "sem elementos que forçam rolagem horizontal");
  const widget = readFileSync(path.join(root, "apps/web/components/assistant/assistant-widget.tsx"), "utf8");
  ok(widget.includes("AxiaAnswerBody") && widget.includes("[overflow-wrap:anywhere]"), "o painel da AXIA usa o corpo estruturado e o balão também quebra palavras longas");
});

// ---------------------------------------------------------------- exemplos (antes x depois) para o relatório
console.log("\n--- EXEMPLOS (antes → depois) ---");
for (const id of structuredIds.slice(0, 3)) {
  const entry = ASSISTANT_ENTRIES.find((e) => e.id === id);
  console.log(`[${id}]\nANTES : ${entry.summary}\nDEPOIS:\n${richText.structureClassifications(entry.summary)}\n`);
}

console.log(`\nResumo: ${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
