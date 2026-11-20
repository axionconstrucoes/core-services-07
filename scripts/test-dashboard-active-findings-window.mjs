// Regressão (achado D1 do Hover Text): "Achados de IA ativos" do Dashboard Executivo é posição ATUAL e não pode herdar a janela
// padrão de 30 dias (o executivo chamava getDashboardVisualData com range "PROJECT", opção inexistente → cai em 30D).
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { resolveTimeRange } = await import("../apps/web/lib/dashboard-visual/resolve-time-range.ts");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const data = readFileSync("apps/web/lib/dashboard-visual/get-dashboard-visual-data.ts", "utf8");
const page = readFileSync("apps/web/app/[projectId]/dashboard/page.tsx", "utf8");

check("opção inexistente (\"PROJECT\") cai em 30D — por isso o executivo não pode depender dela para posição atual", () => {
  ok(resolveTimeRange({ range: "PROJECT" }, new Date("2026-11-20T12:00:00Z"), "2026-01-01").option === "30D");
});
check("get-dashboard-visual-data expõe activeFindingsSummaryCurrent calculado sobre TODOS os achados (sem filtro de período)", () => {
  ok(/activeFindingsSummaryCurrent\s*=\s*resolveActiveFindingsSummary\(findings\)/.test(data), "cálculo sem filtro ausente");
  ok(/activeFindingsSummary\s*=\s*resolveActiveFindingsSummary\(findingsInRange\)/.test(data), "versão filtrada (Dashboard Visual) preservada");
});
check("Dashboard Executivo usa só a posição atual dos achados (nenhuma leitura da versão filtrada pelo período)", () => {
  ok(!/data\.activeFindingsSummary\./.test(page), "ainda lê data.activeFindingsSummary (filtrada)");
  ok(/data\.activeFindingsSummaryCurrent\.totalActive/.test(page));
});
console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
