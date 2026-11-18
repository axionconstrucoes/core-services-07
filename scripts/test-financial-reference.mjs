// Referência do PRÓPRIO relatório (não do envio) e natureza do previsto
// (reprevisão × linha de base). Dados SINTÉTICOS.
//
// Uso: node scripts/test-financial-reference.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const { resolveReportReference, isForwardedSubject, weekLabelOf } = await import("../apps/web/lib/schedule/weekly-report/report-reference.ts");
const { analyzeFinancialSheet, classifyFinancialBase, FINANCIAL_BASE_DISCLAIMER } = await import("../apps/web/lib/schedule/weekly-report/analyze-sheets.ts");
const { readWorkbookSafely, parseCorePropertiesDates } = await import("../apps/web/lib/schedule/weekly-report/read-workbook.ts");

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

// ---------------- referência ----------------
await check("data própria do arquivo prevalece sobre o envio (nunca a mais recente)", () => {
  const r = resolveReportReference({ emailSentDate: "2026-10-22", subjectWeekLabel: "W42", fileName: "(W42) x.xlsx", contentWeekLabel: "W42", documentModifiedDate: "2026-10-20" });
  assert.equal(r.referenceDate, "2026-10-20");
  assert.equal(r.source, "DOCUMENT_LAST_SAVED");
  assert.deepEqual(r.blockers, []);
});

await check("relatório antigo encaminhado depois mantém o corte antigo (data do arquivo)", () => {
  const r = resolveReportReference({ emailSentDate: "2026-11-10", emailSubject: "ENC: (W40) WEG - Relatório Semanal", subjectWeekLabel: "W40", fileName: "(W40) x.xlsx", contentWeekLabel: "W40", documentModifiedDate: "2026-09-29" });
  assert.equal(r.referenceDate, "2026-09-29");
  assert.equal(r.forwarded, true);
  assert.ok(r.warnings.some((w) => w.code === "LATE_DELIVERY_OR_FORWARD"));
});

await check("encaminhado SEM data própria => sem referência (não usa a data do encaminhamento)", () => {
  const r = resolveReportReference({ emailSentDate: "2026-11-10", emailSubject: "Fwd: (W40) Relatório Semanal", subjectWeekLabel: "W40", fileName: "(W40) x.xlsx" });
  assert.equal(r.referenceDate, null);
  assert.match(r.blockers[0], /encaminhado sem data própria/);
});

await check("arquivo W42 no pacote W43 sem data própria => sem referência", () => {
  const r = resolveReportReference({ emailSentDate: "2026-10-22", subjectWeekLabel: "W43", fileName: "(W42) x.xlsx", contentWeekLabel: "W42" });
  assert.equal(r.reportWeekLabel, "W42");
  assert.equal(r.referenceDate, null);
  assert.ok(r.warnings.some((w) => w.code === "REPORT_OLDER_THAN_SUBJECT"));
  assert.match(r.blockers[0], /W42 em pacote W43/);
});

await check("arquivo W42 no pacote W43 COM data própria => data do arquivo", () => {
  const r = resolveReportReference({ emailSentDate: "2026-10-22", subjectWeekLabel: "W43", fileName: "(W42) x.xlsx", contentWeekLabel: "W42", documentModifiedDate: "2026-10-19" });
  assert.equal(r.referenceDate, "2026-10-19");
  assert.equal(r.source, "DOCUMENT_LAST_SAVED");
});

await check("sem data própria e rótulos coerentes => envio como fallback com aviso", () => {
  const r = resolveReportReference({ emailSentDate: "2026-10-19", subjectWeekLabel: "W41", fileName: "(W41) x.xlsx", contentWeekLabel: "W41" });
  assert.equal(r.referenceDate, "2026-10-19");
  assert.equal(r.source, "EMAIL_SENT_FALLBACK");
  assert.ok(r.warnings.some((w) => w.code === "REFERENCE_FROM_EMAIL_DATE"));
});

await check("salvamento posterior ao envio é ignorado (incoerente)", () => {
  const r = resolveReportReference({ emailSentDate: "2026-10-19", subjectWeekLabel: "W41", fileName: "(W41) x.xlsx", documentModifiedDate: "2026-10-25" });
  assert.equal(r.source, "EMAIL_SENT_FALLBACK");
  assert.ok(r.warnings.some((w) => w.code === "DOCUMENT_DATE_AFTER_EMAIL"));
});

await check("rótulos internos muito divergentes => sem referência; diferença de 1 semana => mais antiga com aviso", () => {
  const far = resolveReportReference({ emailSentDate: "2026-10-22", fileName: "(W38) x.xlsx", contentWeekLabel: "W42", documentModifiedDate: "2026-10-20" });
  assert.equal(far.referenceDate, null);
  assert.match(far.blockers[0], /incoerentes/);
  const near = resolveReportReference({ emailSentDate: "2026-10-22", fileName: "(W41) x.xlsx", contentWeekLabel: "W42", documentModifiedDate: "2026-10-20" });
  assert.equal(near.reportWeekLabel, "W41");
  assert.equal(near.referenceDate, "2026-10-20");
  assert.ok(near.warnings.some((w) => w.code === "REPORT_WEEK_LABELS_DIFFER"));
});

await check("encaminhamento e rótulos", () => {
  for (const subject of ["Fwd: x", "FW: x", "ENC: x", "Enc: RES: x", "Encaminhado: x", "TR: x"]) assert.ok(isForwardedSubject(subject.replace("FW:", "Fw:")), subject);
  assert.equal(isForwardedSubject("(W40) Relatório Semanal"), false);
  assert.equal(weekLabelOf("(W42) WEG - Indicadores.xlsx"), "W42");
  assert.equal(weekLabelOf("Ajustado (W37) WEG"), "W37");
  assert.equal(weekLabelOf("WEG Indicadores.xlsx"), null);
});

// ---------------- metadados do xlsx ----------------
await check("datas do core.xml (criação/último salvamento)", () => {
  const xml = '<cp:coreProperties><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-01T10:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-20T18:30:00Z</dcterms:modified></cp:coreProperties>';
  assert.deepEqual(parseCorePropertiesDates(xml), { documentCreatedAt: "2026-10-01T10:00:00.000Z", documentModifiedAt: "2026-10-20T18:30:00.000Z" });
  assert.deepEqual(parseCorePropertiesDates("<x/>"), { documentCreatedAt: null, documentModifiedAt: null });
});

await check("readWorkbookSafely expõe o último salvamento do arquivo", async () => {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date("2026-10-01T10:00:00Z");
  wb.modified = new Date("2026-10-20T18:30:00Z");
  wb.addWorksheet("FINANCEIRO").addRow(["MÊS", "PREVISTO"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const r = await readWorkbookSafely({ buffer, fileName: "x.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal(r.safety.documentModifiedAt, "2026-10-20T18:30:00.000Z");
});

// ---------------- base do previsto ----------------
const COLUMNS = { previsto: "PREVISTO MENSAL", faturado: "FATURAMENTO AXION", realizado: "REALIZADO MENSAL" };
const HEADERS = ["MÊS", "PREVISTO MENSAL", "FATURAMENTO AXION", "REALIZADO MENSAL"];
const sheet = (rows) => ({ unit: "CURRENCY", columns: COLUMNS, headers: HEADERS, rows: rows.map(([m, p, r]) => ({ period: `2026-${m}-01`, date: `2026-${m}-01`, values: { previsto: p, realizado: r, faturado: r } })) });

await check("previsto alterado entre versões => REFORECAST com evidência", () => {
  const current = sheet([["08", 500, 520], ["09", 610, 550], ["10", 700, 100]]);
  const out = classifyFinancialBase(current, ["2026-08-01", "2026-09-01"], [{ label: "W38", rows: [{ period: "2026-09-01", previsto: 600 }, { period: "2026-10-01", previsto: 700 }] }]);
  assert.equal(out.baseKind, "REFORECAST");
  assert.match(out.evidence[0], /2026-09 difere entre versões: 600 \(W38\) × 610/);
});

await check("previsto = realizado em mês encerrado => REFORECAST", () => {
  const out = classifyFinancialBase(sheet([["08", 520, 520], ["09", 600, 550]]), ["2026-08-01", "2026-09-01"], []);
  assert.equal(out.baseKind, "REFORECAST");
});

await check("sem evidência => UNKNOWN; cabeçalho de linha de base => DECLARED_BASELINE_UNVERIFIED (nunca 'aprovada')", () => {
  assert.equal(classifyFinancialBase(sheet([["08", 500, 520]]), ["2026-08-01"], []).baseKind, "UNKNOWN");
  const declared = { ...sheet([["08", 500, 520]]), columns: { ...COLUMNS, previsto: "PREVISTO (LINHA DE BASE 02)" } };
  assert.equal(classifyFinancialBase(declared, ["2026-08-01"], []).baseKind, "DECLARED_BASELINE_UNVERIFIED");
});

await check("indicador marca baseKind, aviso explícito e informativo", () => {
  const r = analyzeFinancialSheet(sheet([["08", 520, 520], ["09", 600, 550], ["10", 700, 100]]), [], { reference: resolveReportReference({ emailSentDate: "2026-10-19", subjectWeekLabel: "W41", fileName: "(W41) x.xlsx", documentModifiedDate: "2026-10-18" }) });
  assert.equal(r.metrics.baseKind, "REFORECAST");
  assert.equal(r.metrics.informativeOnly, true);
  assert.equal(r.metrics.baseDisclaimer, FINANCIAL_BASE_DISCLAIMER);
  assert.match(FINANCIAL_BASE_DISCLAIMER, /não comprova cumprimento da meta original/i);
  assert.ok(r.alerts.some((a) => a.code === "BASE_IS_REFORECAST" && a.severity === "WARNING"));
  assert.equal(r.metrics.referenceSource, "DOCUMENT_LAST_SAVED");
  assert.equal(r.metrics.cutoffDate, "2026-09-30");
  assert.equal(r.risk.classification, "REVIEW_REQUIRED");
});

await check("referência bloqueada => indicador não mensurável com o motivo", () => {
  const ref = resolveReportReference({ emailSentDate: "2026-11-10", emailSubject: "ENC: (W40) Relatório Semanal", subjectWeekLabel: "W40", fileName: "(W40) x.xlsx" });
  const r = analyzeFinancialSheet(sheet([["08", 500, 520], ["09", 600, 550]]), [{ dimension: "FINANCIAL_DEVIATION_PERCENT", medium: 5, high: 10, critical: 20 }], { reference: ref });
  assert.equal(r.metrics.comparable, false);
  assert.equal(r.metrics.cutoffDate, null);
  assert.match(r.risk.reasons[0], /referência do relatório: e-mail encaminhado/);
});

await check("encaminhado tardio com data própria: corte não avança para o mês do envio", () => {
  const rows = sheet([["08", 500, 520], ["09", 600, 550], ["10", 700, 650], ["11", 800, 0]]);
  const ref = resolveReportReference({ emailSentDate: "2026-11-20", emailSubject: "ENC: (W38)", subjectWeekLabel: "W38", fileName: "(W38) x.xlsx", documentModifiedDate: "2026-09-24" });
  const r = analyzeFinancialSheet(rows, [], { reference: ref });
  assert.equal(r.metrics.cutoffDate, "2026-08-31");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
