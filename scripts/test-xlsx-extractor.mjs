import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readXlsxLines } from "./lib/xlsx-extract.mjs";
import { extractDocument } from "./document-extractors.mjs";

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`OK   ${name}`); };
const rawBuffer = async (wb) => Buffer.from(await wb.xlsx.writeBuffer());
// Excel/LibreOffice gravam xl/workbook.xml ANTES das planilhas; o ExcelJS grava depois. Reordena para imitar arquivos reais.
async function excelOrder(buf) {
  const zip = await JSZip.loadAsync(buf);
  const out = new JSZip();
  const names = Object.keys(zip.files).sort((x, y) => Number(/worksheets\/sheet/.test(x)) - Number(/worksheets\/sheet/.test(y)));
  for (const name of names) out.file(name, await zip.files[name].async("nodebuffer"));
  return Buffer.from(await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
const toBuffer = async (wb) => excelOrder(await rawBuffer(wb));

const basic = new ExcelJS.Workbook();
const a = basic.addWorksheet("Resumo");
a.addRow(["Item", "Valor", new Date(Date.UTC(2026, 0, 5))]);
a.addRow(["Total", { formula: "SUM(B2:B3)", result: 15 }]);
a.addRow([{ richText: [{ text: "Rico " }, { text: "texto" }] }, null, "fim"]);
basic.addWorksheet("Vazia");
const b = basic.addWorksheet("Segunda");
b.addRow(["x", "y"]);
const basicBuf = await toBuffer(basic);

await check("rota em fluxo e rota em memória produzem a mesma saída", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("A").addRow(["um", "dois"]);
  const viaMem = await readXlsxLines(await rawBuffer(wb)); // pode ir por qualquer rota
  const viaFlow = await readXlsxLines(await excelOrder(await rawBuffer(wb)));
  assert.equal(viaFlow.stats.rota, "fluxo");
  assert.deepEqual(viaMem.lines, viaFlow.lines);
});

await check("lê abas na ordem, formula/rich text/linhas vazias ignoradas", async () => {
  const { lines, stats } = await readXlsxLines(basicBuf);
  assert.equal(stats.rota, "fluxo");
  assert.deepEqual(lines.map((l) => `${l.sheet}:${l.row}`), ["Resumo:1", "Resumo:2", "Resumo:3", "Segunda:1"]);
  assert.match(lines[1].text, /^Total \| 15/);
  assert.match(lines[2].text, /^Rico texto/);
});

await check("célula com resultado nulo não derruba a planilha", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("F");
  ws.addRow(["a", { formula: "1/0", result: null }, "c"]);
  const { lines } = await readXlsxLines(await toBuffer(wb));
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /^a \|/);
  assert.match(lines[0].text, /c$/);
});

await check("célula ilegível (text lança) vira vazio e é contada", async () => {
  const { stats, lines } = await readXlsxLines(basicBuf, (v) => v);
  assert.equal(stats.celulasIlegiveis, 0);
  assert.ok(lines.length);
});

await check("planilha com milhares de linhas vazias estilizadas não explode memória", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Grande");
  ws.addRow(["cabecalho"]);
  for (let i = 2; i <= 3000; i += 1) ws.getRow(i * 100).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
  const before = process.memoryUsage().heapUsed;
  const { lines } = await readXlsxLines(await toBuffer(wb));
  assert.equal(lines.length, 1);
  assert.ok(process.memoryUsage().heapUsed - before < 400 * 1024 * 1024);
});

await check("arquivo não-xlsx falha com erro (não trava)", async () => {
  await assert.rejects(readXlsxLines(Buffer.from("isto nao e um zip")));
});

await check("extractDocument mantém o formato de saída", async () => {
  const r = await extractDocument({ buffer: basicBuf, fileName: "t.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal(r.extractor, "exceljs");
  assert.equal(r.extractorVersion, "2");
  assert.match(r.text, /^\[Resumo - linha 1\] Item \| Valor \|/);
  assert.ok(r.segments.length >= 4 && r.segments[0].locator.startsWith('Planilha "Resumo", linha 1'));
});

console.log(`\n${passed} OK`);
