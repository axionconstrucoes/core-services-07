// Estrutura mascarada das amostras semanais: planilhas SINTÉTICAS (nenhum dado real). Garante que o log nunca carrega
// nome de aba/célula, que o reconhecimento coincide com o parser atual e que o workflow é manual, só main e somente leitura.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const { identifyWeeklyReportSheets } = await import("../apps/web/lib/schedule/weekly-report/identify-sheets.ts");
const { classifySheetName, inspectPackage, summarizeStructure, proposeFinanceiroAlias } = await import("./lib/weekly-sample-structure.mjs");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}

const SEGREDO = "Fulano de Tal Cliente Confidencial";
async function build(names) {
  const wb = new ExcelJS.Workbook();
  names.forEach((n, i) => { const ws = wb.addWorksheet(n); ws.addRow([SEGREDO, i]); ws.addRow([1, 2, 3]); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

await check("classes de vocabulário fechado; nomes fora do vocabulário viram OUTRA", () => {
  assert.equal(classifySheetName("RESUMO FINANCEIROS"), "FINANCEIRO");
  assert.equal(classifySheetName("LINHA DE BASE"), "LINHA_BASE");
  assert.equal(classifySheetName("EFETIVO"), "HISTOGRAMA");
  assert.equal(classifySheetName("GRÁFICO"), "GRAFICO");
  assert.equal(classifySheetName("Tanque do Cliente X"), "OUTRA");
});

await check("saída nunca contém nome de aba nem conteúdo de célula", async () => {
  const names = ["LINHA DE BASE", "RESUMO FINANCEIROS", "Tanque do Cliente X", "SSMA"];
  const livres = ["RESUMO FINANCEIROS", "Tanque do Cliente X"]; // nomes que não são palavra do vocabulário fechado
  const { sheets, pkg } = await inspectPackage(JSZip, await build(names));
  const out = JSON.stringify(summarizeStructure(sheets, identifyWeeklyReportSheets, pkg));
  for (const n of livres) assert.ok(!out.includes(n), `vazou: ${n}`);
  assert.ok(!out.includes(SEGREDO));
  assert.ok(!/Tanque|Cliente/.test(out));
});

await check("reconhecimento coincide com o parser atual; apelido não reconhecido vira pista", async () => {
  const { sheets, pkg } = await inspectPackage(JSZip, await build(["LINHA DE BASE", "RESUMO FINANCEIROS", "EFETIVO", "SSMA"]));
  const r = summarizeStructure(sheets, identifyWeeklyReportSheets, pkg);
  assert.equal(r.reconhecimento.LINHA_BASE, "MATCHED");
  assert.equal(r.reconhecimento.HISTOGRAMA, "MATCHED");
  assert.equal(r.reconhecimento.SSMA, "MATCHED");
  assert.equal(r.reconhecimento.FINANCEIRO, "MISSING_SHEET");
  assert.equal(r.reconhecimento.CURVA_S, "MISSING_SHEET");
  assert.deepEqual(r.pistas_nao_reconhecidas, [{ i: 1, classe: "FINANCEIRO" }]);
  assert.equal(r.abas, 4);
});

await check("dimensão declarada, aba oculta e contagem de gráficos/links", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("A").addRow([1, 2, 3]);
  const hidden = wb.addWorksheet("B"); hidden.addRow([1]); hidden.state = "hidden";
  const { sheets, pkg } = await inspectPackage(JSZip, Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(sheets[0].dimension, "A1:C1");
  assert.equal(sheets[1].hidden, true);
  assert.deepEqual(pkg, { charts: 0, drawings: 0, externalLinks: 0 });
});


const idx = (names) => names.map((name, index) => ({ name, index }));
const rec = (names) => Object.fromEntries(identifyWeeklyReportSheets(idx(names)).map((m) => [m.category, m.status]));

await check("saída separa IDENTIFICAÇÃO (nome, parser atual) de VALIDAÇÃO de conteúdo (não realizada)", async () => {
  const { sheets, pkg } = await inspectPackage(JSZip, await build(["LINHA DE BASE", "Tanque X"]));
  const r = summarizeStructure(sheets, identifyWeeklyReportSheets, pkg);
  assert.equal(r.identificacao_aba, "POR_NOME_PARSER_ATUAL");
  assert.ok(/^NAO_REALIZADA/.test(r.validacao_conteudo));
  assert.ok(r.abas_detalhe.every((a) => a.validacao_conteudo === "NAO_REALIZADA"));
  assert.equal(r.abas_detalhe[0].identificacao, "IDENTIFICADA_POR_NOME");
  assert.equal(r.abas_detalhe[1].identificacao, "NAO_IDENTIFICADA_POR_NOME");
});

await check("nomes reais do caso 3 (W12): hoje só LINHA_BASE casa; RESUMO FINANCEIROS não casa Financeiro", () => {
  const names = ["LINHA DE BASE", "RESUMO FINANCEIROS", "BOLETIM DE MEDIÇÃO", "FATURAMENTO DIRETO"];
  assert.deepEqual(rec(names), { CURVA_S: "MISSING_SHEET", LINHA_BASE: "MATCHED", FINANCEIRO: "MISSING_SHEET", HISTOGRAMA: "MISSING_SHEET", SSMA: "MISSING_SHEET" });
});

await check("nomes reais do caso 4 (W14–W16): LINHA_BASE e HISTOGRAMA casam; SSMA segue ausente", () => {
  const names = ["RESUMO FINANCEIROS", "LINHA DE BASE", "GRÁFICO", "MAPA DE CONTRATAÇÃO", "EFETIVO"];
  const r = rec(names);
  assert.equal(r.LINHA_BASE, "MATCHED"); assert.equal(r.HISTOGRAMA, "MATCHED");
  assert.equal(r.SSMA, "MISSING_SHEET"); assert.equal(r.FINANCEIRO, "MISSING_SHEET"); assert.equal(r.CURVA_S, "MISSING_SHEET");
});

await check("proposta ESTREITA de alias: só resumo financeiro(s) exato, uma candidata, e só se Financeiro faltar", () => {
  const prop = (names) => proposeFinanceiroAlias(idx(names), identifyWeeklyReportSheets(idx(names)));
  assert.deepEqual(prop(["LINHA DE BASE", "RESUMO FINANCEIROS"]), { aplicada_em_producao: false, casaria: true, aba_indice: 1, validacao_conteudo: "NAO_REALIZADA" });
  assert.equal(prop(["Resumo Financeiro"]).casaria, true);
  for (const nao of ["Resumo", "Resumo Financeiro Geral", "Resumo de Contratação", "Boletim de Medição", "Faturamento Direto", "Custos", "Resumo Financeiros 2"]) {
    assert.equal(prop([nao]).casaria, false, nao);
  }
  assert.equal(prop(["Resumo Financeiro", "RESUMO FINANCEIROS"]).motivo, "ambigua");
  assert.equal(prop(["Financeiro", "RESUMO FINANCEIROS"]).casaria, false); // parser atual já achou Financeiro
  assert.equal(prop(["Financeiro Detalhado"]).casaria, false); // idem (começa com financ)
});

await check("a proposta não altera o identificador de produção", () => {
  const src = readFileSync(new URL("../apps/web/lib/schedule/weekly-report/identify-sheets.ts", import.meta.url), "utf8");
  assert.ok(!/resumofinanceiro/.test(src));
});

await check("script: simulação do parser atual é em memória (sem escrita) e só imprime status/códigos", () => {
  const s = readFileSync(new URL("./diagnose-weekly-samples.mjs", import.meta.url), "utf8");
  assert.ok(/processWorkbookGrids/.test(s) && /SIMULACAO_PARSER_ATUAL_EM_MEMORIA_NADA_GRAVADO/.test(s));
  assert.ok(!/console[.]log[(][^)]*(grid|rows|cell)/i.test(s));
});
await check("workflow: manual, só main, sem cron, sem artefato, somente leitura", () => {
  const y = readFileSync(new URL("../.github/workflows/weekly-samples-diagnostic.yml", import.meta.url), "utf8").split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("#")).join(" ");
  assert.ok(/workflow_dispatch:/.test(y) && !/schedule:|push:|pull_request:/.test(y));
  assert.ok(/github\.ref == 'refs\/heads\/main'/.test(y));
  assert.ok(!/upload-artifact|actions\/cache@/.test(y));
  assert.ok(/contents: read/.test(y));
});

await check("script: lista fechada de 8 amostras e nenhuma escrita", () => {
  const s = readFileSync(new URL("./diagnose-weekly-samples.mjs", import.meta.url), "utf8");
  assert.equal((s.match(/sha6: "/g) ?? []).length, 8);
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(|\.upload\(|\.remove\(/.test(s));
  assert.ok(!/console\.log\([^)]*\.name\b/.test(s));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
