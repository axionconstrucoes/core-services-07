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
const { classifySheetName, inspectPackage, summarizeStructure } = await import("./lib/weekly-sample-structure.mjs");

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
