// Obrigatoriedade de abas por evidência de vizinhança. Fixtures SINTÉTICAS que reproduzem apenas a forma
// (semana x categorias localizadas) observada no banco; nenhum conteúdo de planilha.
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { assessMissingSheets } = await import("../apps/web/lib/schedule/weekly-report/expected-sheets.ts");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const ALL = ["CURVA_S", "LINHA_BASE", "FINANCEIRO", "HISTOGRAMA", "SSMA"];
const f = (week, cats) => ({ id: `w${week}`, workWeek: week, found: new Set(cats) });
const OLD = ["LINHA_BASE", "HISTOGRAMA", "SSMA"];
const files = [
  ...[20, 21, 22, 23, 25, 26, 27].map((w) => f(w, OLD)),
  ...[36, 37, 38, 39, 40, 41, 43].map((w) => f(w, ALL)),
  f(34, []), // arquivo sem nenhuma aba reconhecida, em meio à transição de modelo
];
const verdict = (id, cat) => assessMissingSheets(files, ALL).find((a) => a.id === id && a.category === cat)?.verdict;

check("modelo antigo: CURVA S e FINANCEIRO ausentes em semanas cujo entorno nunca as teve => esperada pelo modelo", () => {
  ok(verdict("w22", "CURVA_S") === "ESPERADA_PELO_MODELO", "CURVA_S w22");
  ok(verdict("w22", "FINANCEIRO") === "ESPERADA_PELO_MODELO", "FINANCEIRO w22");
});
check("modelo novo: aba ausente quando todos os vizinhos a possuem => obrigatória ausente", () => {
  const sample = files.filter((x) => x.id !== "w34").map((x) => (x.id === "w40" ? f(40, ["LINHA_BASE"]) : x));
  const a = assessMissingSheets(sample, ALL).find((x) => x.id === "w40" && x.category === "CURVA_S");
  ok(a.verdict === "OBRIGATORIA_AUSENTE", "w40 CURVA_S " + a.verdict);
});
check("transição de modelo (vizinhança mista) e pouca vizinhança => indeterminada, nunca falha automática", () => {
  ok(verdict("w34", "CURVA_S") === "INDETERMINADA", "w34 mista");
  const only = [f(12, ["LINHA_BASE"])];
  ok(assessMissingSheets(only, ALL).every((a) => a.verdict === "INDETERMINADA"), "isolado");
});
check("aba localizada nunca gera avaliação (a extração/revisão de conteúdo segue o fluxo existente)", () => {
  ok(!assessMissingSheets(files, ALL).some((a) => a.id === "w22" && a.category === "LINHA_BASE"), "presente");
});
check("não depende de nomes nem de conteúdo: somente semana e categorias", () => {
  const a = assessMissingSheets(files, ALL)[0];
  ok(Object.keys(a).sort().join() === "category,id,neighbors,neighborsWithSheet,verdict", "chaves");
});
console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
