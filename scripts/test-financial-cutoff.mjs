// Indicador FINANCIAL_DEVIATION_PERCENT na MESMA data de corte (método
// CUTOFF_CLOSED_MONTHS_V2) e linhagem de planilhas (duplicata × revisão).
// Dados SINTÉTICOS (nenhum valor real de projeto).
//
// Uso: node scripts/test-financial-cutoff.mjs

import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { analyzeFinancialSheet, detectFinancialValueNature, toBrasiliaDate } = await import("../apps/web/lib/schedule/weekly-report/analyze-sheets.ts");
const { applyWorkbookLineage, resolveWorkbookLineage } = await import("../apps/web/lib/schedule/weekly-report/process-weekly-report-workbooks.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

const HEADERS = ["MÊS", "PREVISTO MENSAL", "FATURAMENTO AXION", "FATURAMENTO DIRETO", "REALIZADO MENSAL", "SALDO"];
const COLUMNS = { previsto: "PREVISTO MENSAL", faturado: "FATURAMENTO AXION", realizado: "REALIZADO MENSAL" };
const LETTERS = { previsto: "C", faturado: "D", realizado: "F" };

function sheet(rows, extra = {}) {
  return {
    unit: "CURRENCY",
    columns: COLUMNS,
    headers: HEADERS,
    rows: rows.map(([month, previsto, realizado, more = {}], index) => ({
      period: `2026-${month}-01`,
      date: `2026-${month}-01`,
      values: { previsto, realizado, faturado: realizado },
      sourceRow: index + 2,
      ...more,
    })),
    ...extra,
  };
}

// Abr..Dez; referência 22/10 => Abr..Set encerrados, Out parcial, Nov/Dez futuros.
const BASE = [
  ["04", 100, 100],
  ["05", 200, 180],
  ["06", 300, 300],
  ["07", 400, 350],
  ["08", 500, 520],
  ["09", 600, 550],
  ["10", 700, 250],
  ["11", 800, 0],
  ["12", 900, null],
];
const T = [{ dimension: "FINANCIAL_DEVIATION_PERCENT", medium: 5, high: 10, critical: 20 }];
const ctx = { referenceDate: "2026-10-22", reportWeekLabel: "W43", fileName: "(W43) Indicadores.xlsx", columnLetters: LETTERS };

await check("corte = fim do último mês encerrado; parcial e futuros fora", () => {
  const r = analyzeFinancialSheet(sheet(BASE), T, ctx);
  assert.equal(r.metrics.cutoffDate, "2026-09-30");
  assert.equal(r.metrics.plannedTotal, 2100); // 100..600
  assert.equal(r.metrics.actualTotal, 2000);
  assert.equal(r.metrics.deviationPercent, -4.76);
  assert.equal(r.metrics.comparable, true);
  assert.deepEqual(
    r.metrics.periods.map((p) => p.status),
    ["CLOSED", "CLOSED", "CLOSED", "CLOSED", "CLOSED", "CLOSED", "CURRENT_PARTIAL", "FUTURE", "FUTURE"]
  );
  assert.ok(r.alerts.some((a) => a.code === "PARTIAL_PERIOD_EXCLUDED"));
  assert.equal(r.risk.classification, "LOW"); // 4,76 < 5
});

await check("indicador original preservado (horizonte total) e não usado para classificar", () => {
  const r = analyzeFinancialSheet(sheet(BASE), T, ctx);
  assert.equal(r.metrics.legacyFullHorizon.method, "LEGACY_FULL_HORIZON");
  assert.equal(r.metrics.legacyFullHorizon.plannedTotal, 4500);
  assert.equal(r.metrics.legacyFullHorizon.actualTotal, 2250);
  assert.equal(r.metrics.legacyFullHorizon.deviationPercent, -50);
});

await check("rastreabilidade até a célula de cada mês encerrado", () => {
  const r = analyzeFinancialSheet(sheet(BASE), T, ctx);
  assert.deepEqual(r.metrics.sources[0], { period: "2026-04-01", previsto: 100, previstoCell: "C2", realizado: 100, realizadoCell: "F2" });
  assert.equal(r.metrics.sources.at(-1).realizadoCell, "F7");
});

await check("zero em mês encerrado é dado válido (não vira corte nem é descartado)", () => {
  const rows = BASE.map((row) => (row[0] === "09" ? ["09", 600, 0] : row));
  const r = analyzeFinancialSheet(sheet(rows), T, ctx);
  assert.equal(r.metrics.cutoffDate, "2026-09-30");
  assert.equal(r.metrics.actualTotal, 1450);
  assert.ok(r.alerts.some((a) => a.code === "ZERO_VALUE_IN_CLOSED_PERIOD"));
});

await check("valor ausente em mês encerrado => não mensurável", () => {
  const rows = BASE.map((row) => (row[0] === "08" ? ["08", 500, null] : row));
  const r = analyzeFinancialSheet(sheet(rows), T, ctx);
  assert.equal(r.metrics.comparable, false);
  assert.equal(r.metrics.deviationPercent, null);
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
  assert.match(r.risk.reasons[0], /valor ausente em mês encerrado: 2026-08-01 \(realizado\)/);
});

await check("fórmula sem valor armazenado distingue-se de ausente", () => {
  const rows = BASE.map((row) => (row[0] === "07" ? ["07", 400, null, { unavailable: ["realizado"] }] : row));
  const r = analyzeFinancialSheet(sheet(rows), T, ctx);
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
  assert.match(r.risk.reasons[0], /fórmula sem valor armazenado em mês encerrado: 2026-07-01/);
});

await check("previsto zero até o corte => não mensurável", () => {
  const rows = [["08", 0, 0], ["09", 0, 10], ["10", 50, 5]];
  const r = analyzeFinancialSheet(sheet(rows), T, ctx);
  assert.equal(r.metrics.comparable, false);
  assert.match(r.risk.reasons[0], /previsto acumulado zero/);
});

await check("sem data de referência => não mensurável (não presume corte)", () => {
  const r = analyzeFinancialSheet(sheet(BASE), T, { ...ctx, referenceDate: null });
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
  assert.match(r.risk.reasons[0], /data de referência do relatório ausente/);
});

await check("série não mensal => não mensurável (sem rateio linear)", () => {
  const s = sheet(BASE);
  s.rows[2] = { ...s.rows[2], date: "2026-06-15", period: "2026-06-15" };
  const r = analyzeFinancialSheet(s, T, ctx);
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
  assert.match(r.risk.reasons[0], /não é mensal/);
});

await check("realizado em mês futuro é ignorado e alertado", () => {
  const rows = BASE.map((row) => (row[0] === "11" ? ["11", 800, 90] : row));
  const r = analyzeFinancialSheet(sheet(rows), T, ctx);
  assert.equal(r.metrics.actualTotal, 2000);
  assert.ok(r.alerts.some((a) => a.code === "FUTURE_PERIOD_HAS_ACTUAL"));
});

await check("faturamento abaixo do previsto não é estouro de custo; custo acima é adverso", () => {
  assert.equal(detectFinancialValueNature({ headers: HEADERS, columns: COLUMNS }), "BILLING_PRODUCTION");
  const billing = analyzeFinancialSheet(sheet(BASE.map((r) => (r[0] === "09" ? ["09", 600, 300] : r))), T, ctx);
  assert.match(billing.risk.reasons.at(-1), /NÃO estouro de custo/);
  const costSheet = { ...sheet(BASE.map((r) => (r[0] === "09" ? ["09", 600, 900] : r))), headers: ["MÊS", "CUSTO PREVISTO", "CUSTO REALIZADO"], columns: { previsto: "CUSTO PREVISTO", realizado: "CUSTO REALIZADO" } };
  const cost = analyzeFinancialSheet(costSheet, T, ctx);
  assert.equal(cost.metrics.valueNature, "COST");
  assert.ok(cost.metrics.deviationPercent > 0);
  assert.notEqual(cost.risk.classification, "LOW");
});

await check("natureza indefinida => não mensurável", () => {
  const s = { ...sheet(BASE), headers: ["MÊS", "PREVISTO", "REALIZADO"], columns: { previsto: "PREVISTO", realizado: "REALIZADO" } };
  const r = analyzeFinancialSheet(s, T, ctx);
  assert.equal(r.metrics.valueNature, "UNKNOWN");
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
});

await check("sem limite aprovado => REVIEW_REQUIRED mesmo quando mensurável", () => {
  const r = analyzeFinancialSheet(sheet(BASE), [], ctx);
  assert.equal(r.metrics.comparable, true);
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
  assert.deepEqual(r.risk.missing, ["FINANCIAL_DEVIATION_PERCENT"]);
});

await check("previsto igual ao realizado em meses encerrados => alerta de reprevisão", () => {
  const r = analyzeFinancialSheet(sheet(BASE), T, ctx);
  const alert = r.alerts.find((a) => a.code === "PLAN_EQUALS_ACTUAL_IN_CLOSED_PERIODS");
  assert.ok(alert);
  assert.match(alert.detail, /2 de 6/);
});

await check("rótulo de semana do arquivo diferente do pacote é sinalizado", () => {
  const r = analyzeFinancialSheet(sheet(BASE), T, { ...ctx, fileName: "(W42) Indicadores.xlsx" });
  assert.ok(r.alerts.some((a) => a.code === "FILE_WEEK_LABEL_DIFFERS"));
});

await check("data de referência em Brasília (envio 01:30Z = dia anterior)", () => {
  assert.equal(toBrasiliaDate("2026-11-01T01:30:00Z"), "2026-10-31");
  assert.equal(toBrasiliaDate("2026-10-22T16:29:17Z"), "2026-10-22");
  assert.equal(toBrasiliaDate("inválido"), null);
});

const REL = (id, sha, week, at) => ({ id, emailAttachmentId: `att-${id}`, sha256: sha, workWeekLabel: week, createdAt: at });
const RESULT = {
  status: "EXTRACTED",
  detectedFormat: "XLSX",
  safety: {},
  sheetIndex: [],
  sheets: [{ category: "FINANCEIRO", riskClassification: "REVIEW_REQUIRED", riskReasons: ["motivo"], alerts: [] }],
  summary: {},
  errorMessage: null,
};

await check("duplicata (mesmo SHA-256): registro preservado, sem classificação de risco própria", () => {
  const lineage = resolveWorkbookLineage("aaa", "W34", [REL("w2", "aaa", "W34", "2026-09-29T15:00:00Z"), REL("w1", "aaa", "W34", "2026-09-25T10:00:00Z")]);
  assert.equal(lineage.duplicateOf.id, "w1"); // a PRIMEIRA leitura é a canônica
  const out = applyWorkbookLineage(RESULT, lineage);
  assert.equal(out.sheets[0].riskClassification, null);
  assert.ok(out.sheets[0].alerts.some((a) => a.code === "DUPLICATE_FILE"));
  assert.match(out.sheets[0].riskReasons[0], /Duplicata da planilha w1/);
  assert.equal(out.summary.lineage.duplicateOfWorkbookId, "w1");
  assert.equal(RESULT.sheets[0].riskClassification, "REVIEW_REQUIRED"); // entrada não mutada
});

await check("revisão legítima (mesma semana, SHA diferente) segue classificada e marcada", () => {
  const lineage = resolveWorkbookLineage("bbb", "W37", [REL("w5", "aaa", "W37", "2026-09-29T10:00:00Z")]);
  assert.equal(lineage.duplicateOf, null);
  const out = applyWorkbookLineage(RESULT, lineage);
  assert.equal(out.sheets[0].riskClassification, "REVIEW_REQUIRED");
  assert.ok(out.sheets[0].alerts.some((a) => a.code === "REVISION_OF_WEEK"));
});

await check("sem relação => resultado inalterado", () => {
  const lineage = resolveWorkbookLineage("ccc", "W40", [REL("w9", "zzz", "W39", "2026-09-29T10:00:00Z")]);
  assert.equal(applyWorkbookLineage(RESULT, lineage), RESULT);
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
