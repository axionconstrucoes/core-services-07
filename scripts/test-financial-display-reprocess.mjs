// Reprocessamento de EXIBIÇÃO do Financeiro: preserva o anterior, é
// idempotente, nunca toca classificação/alertas e o log não vaza valores.
// Dados SINTÉTICOS.
//
// Uso: node scripts/test-financial-display-reprocess.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { planFinancialDisplayReprocess, maskedPlanLine } = await import("../apps/web/lib/schedule/weekly-report/financial-display-reprocess.ts");

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

const DATA = {
  unit: "CURRENCY",
  columns: { previsto: "PREVISTO MENSAL", faturado: "FATURAMENTO AXION", realizado: "REALIZADO MENSAL" },
  headers: ["MÊS", "PREVISTO MENSAL", "FATURAMENTO AXION", "REALIZADO MENSAL"],
  rows: [
    ["08", 520, 520],
    ["09", 600, 550],
    ["10", 700, 100],
    ["11", 800, 0],
  ].map(([m, p, r], i) => ({ period: `2026-${m}-01`, date: `2026-${m}-01`, values: { previsto: p, realizado: r, faturado: r }, sourceRow: i + 2 })),
};
const OLD = { plannedTotal: 2620, actualTotal: 1170, deviationPercent: -55.34, trend: "WORSENING" };
const base = {
  sheetId: "11111111-1111-4111-8111-111111111111",
  sheetStatus: "EXTRACTED",
  data: DATA,
  currentMetrics: OLD,
  currentCutoffDate: null,
  columnLetters: { previsto: "C", realizado: "F" },
  fileName: "(W41) x.xlsx",
  emailSentDate: "2026-10-19",
  emailSubject: "(W41) Relatório Semanal",
  subjectWeekLabel: "W41",
  contentWeekLabel: "W41",
  documentModifiedDate: "2026-10-18",
  previousVersions: [{ label: "W38", rows: [{ period: "2026-09-01", previsto: 650 }] }],
};

await check("calcula o indicador novo e preserva o anterior dentro das métricas", () => {
  const plan = planFinancialDisplayReprocess(base);
  assert.equal(plan.action, "UPDATE");
  assert.equal(plan.newCutoffDate, "2026-09-30");
  assert.deepEqual(plan.newMetrics.previousMetrics, OLD);
  assert.equal(plan.newMetrics.previousCutoffDate, null);
  assert.equal(plan.summary.previousDeviationPercent, -55.34);
  assert.equal(plan.summary.previousMethod, "LEGACY_FULL_HORIZON");
  assert.equal(plan.summary.deviationPercent, -4.46); // (1070-1120)/1120
  assert.equal(plan.summary.baseKind, "REFORECAST");
  assert.equal(plan.newMetrics.informativeOnly, true);
});

await check("idempotente: segunda execução com as mesmas entradas => SKIP_UNCHANGED, original nunca sobrescrito", () => {
  const first = planFinancialDisplayReprocess(base);
  const second = planFinancialDisplayReprocess({ ...base, currentMetrics: first.newMetrics, currentCutoffDate: first.newCutoffDate });
  assert.equal(second.action, "SKIP_UNCHANGED");
  assert.deepEqual(second.newMetrics.previousMetrics, OLD);
  // entrada diferente (ex.: metadado novo) => nova atualização mantendo o ORIGINAL
  const third = planFinancialDisplayReprocess({ ...base, documentModifiedDate: "2026-10-17", currentMetrics: first.newMetrics, currentCutoffDate: first.newCutoffDate });
  assert.equal(third.action, "UPDATE");
  assert.deepEqual(third.newMetrics.previousMetrics, OLD);
  assert.equal(third.newMetrics.previousCutoffDate, null);
});

await check("corte definido por humano nunca é alterado", () => {
  const plan = planFinancialDisplayReprocess({ ...base, sheetStatus: "HUMAN_VALIDATED", currentCutoffDate: "2026-08-31" });
  assert.equal(plan.action, "SKIP_HUMAN_CUTOFF");
  assert.equal(plan.newCutoffDate, "2026-08-31");
});

await check("referência bloqueada (W42 no pacote W43 sem data própria) => não mensurável, corte nulo", () => {
  const plan = planFinancialDisplayReprocess({ ...base, fileName: "(W42) x.xlsx", contentWeekLabel: "W42", subjectWeekLabel: "W43", documentModifiedDate: null });
  assert.equal(plan.summary.comparable, false);
  assert.equal(plan.newCutoffDate, null);
  assert.match(plan.summary.reasons[0], /referência do relatório/);
});

await check("plano nunca carrega classificação, motivos de risco nem alertas da aba", () => {
  const plan = planFinancialDisplayReprocess(base);
  for (const key of ["riskClassification", "riskReasons", "alerts", "risk_classification", "risk_reasons"]) assert.equal(key in plan, false, key);
  assert.ok(Array.isArray(plan.newMetrics.displayOnlyAlerts));
});

await check("linha de log mascarada: sem valores monetários, ids ou nomes", () => {
  const line = maskedPlanLine(planFinancialDisplayReprocess(base));
  assert.doesNotMatch(line, /1111|x\.xlsx|W41|550|600|1070|1120|-4\.55/);
  assert.match(line, /^[0-9a-f]{8} UPDATE ref=2026-10-18 fonte=DOCUMENT_LAST_SAVED corte=2026-09-30 base=REFORECAST mensuravel=sim motivo=-$/);
});

await check("script: grava só metrics/cutoff_date, exige --apply + confirmação, --report proibido no CI", () => {
  const source = readFileSync(new URL("./financial-display-reprocess.mjs", import.meta.url), "utf8");
  const updates = [...source.matchAll(/\.update\(\{([^}]*)\}\)/g)].map((match) => match[1].trim());
  assert.deepEqual(updates, ["metrics: plan.newMetrics, cutoff_date: plan.newCutoffDate"]);
  assert.match(source, /ACC_FINANCIAL_DISPLAY_REPROCESS_CONFIRM !== CONFIRM/);
  assert.match(source, /if \(!apply\) process\.exit\(0\);/);
  assert.match(source, /--report não é permitido no CI/);
  assert.doesNotMatch(source, /risk_alert_cases|risk_classification:|sendMail|gmail/i);
  const workflow = readFileSync(new URL("../.github/workflows/financial-display-reprocess.yml", import.meta.url), "utf8");
  assert.match(workflow, /default: dry-run/);
  assert.match(workflow, /confirm=REPROCESSAR-EXIBICAO/);
  assert.doesNotMatch(workflow, /schedule:/);
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
