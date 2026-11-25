// Cobertura do Hover Text por módulo (REGRA PERMANENTE de aceite do ACC — docs/design-system/hover-text-e-contraste.md):
// nenhuma tela, aba ou elemento funcional relevante é considerado concluído sem descrição contextual. Este teste:
//   1. exige que TODA rota (page.tsx) esteja inventariada em algum manifesto (ou isenta, com motivo) — nova tela sem manifesto FALHA;
//   2. exige que toda tela inventariada tenha pelo menos um elemento do tipo "page" documentado (helpId), salvo gap declarado;
//   3. exige que as abas (kind "tab") do manifesto estejam documentadas ou tenham gap declarado;
//   4. imprime a MATRIZ DE COBERTURA por módulo (abas, elementos, com hover, % sobre o inventariado) e o RELATÓRIO DE LACUNAS por tela/elemento;
//   5. NÃO declara 100% sem inventário: o percentual é sempre sobre os elementos do manifesto (a lista autoritativa), e as lacunas ficam visíveis.
// Uso: node scripts/test-help-coverage.mjs [--matrix]
import { readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { ALL_HELP_MANIFESTS } = await import("../apps/web/lib/ui/help/manifests/index.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { EXEMPT_ROUTES } = await import("../apps/web/lib/ui/help/coverage-policy.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const appDir = path.join(root, "apps/web/app");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
}
const routeOf = (file) => "/" + path.relative(appDir, path.dirname(file)).split(path.sep).filter((s) => !/^\(.+\)$/.test(s)).join("/").replace(/^\.$/, "");
const REAL_ROUTES = walk(appDir).filter((f) => path.basename(f) === "page.tsx").map(routeOf).sort();

const declared = new Map(); // rota -> módulo
for (const m of ALL_HELP_MANIFESTS) for (const r of m.routes) declared.set(r, m.module);

check("toda rota real (page.tsx) está inventariada em algum manifesto ou isenta com motivo", () => {
  const missing = REAL_ROUTES.filter((r) => !declared.has(r) && !(r in EXEMPT_ROUTES));
  ok(missing.length === 0, `${missing.length} rota(s) sem manifesto: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", …" : ""}`);
  for (const [r, why] of Object.entries(EXEMPT_ROUTES)) ok(why.trim().length >= 20, `isenção de ${r} sem motivo`);
});
check("manifestos só listam rotas que existem de verdade (nenhuma rota fantasma)", () => {
  const ghost = [...declared.keys()].filter((r) => !REAL_ROUTES.includes(r));
  ok(ghost.length === 0, `rotas inexistentes: ${ghost.join(", ")}`);
});
check("cada rota inventariada tem um elemento 'page' documentado (helpId) ou gap declarado", () => {
  const bad = [];
  for (const m of ALL_HELP_MANIFESTS) for (const route of m.routes) {
    const pageEl = m.elements.find((e) => e.route === route && e.kind === "page");
    if (!pageEl) bad.push(`${m.module} ${route}: sem elemento "page"`);
    else if (!pageEl.helpId && !pageEl.gap && !pageEl.exempt) bad.push(`${m.module} ${route}: página sem helpId/gap`);
  }
  ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 8).join(" | ")}`);
});
check("abas: toda aba inventariada tem helpId existente ou gap declarado", () => {
  const bad = [];
  for (const m of ALL_HELP_MANIFESTS) for (const e of m.elements.filter((x) => x.kind === "tab")) {
    if (e.helpId ? !ACC_FEATURE_HELP[e.helpId] : !(e.gap || e.exempt)) bad.push(`${m.module} ${e.route} aba "${e.label}"`);
  }
  ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 8).join(" | ")}`);
});

// ---- matriz de cobertura (informativa; os percentuais são sobre o inventário dos manifestos) ----
const rows = ALL_HELP_MANIFESTS.map((m) => {
  const els = m.elements;
  const withHelp = els.filter((e) => e.helpId && ACC_FEATURE_HELP[e.helpId]);
  const tabs = els.filter((e) => e.kind === "tab");
  const tabsHelp = tabs.filter((e) => e.helpId && ACC_FEATURE_HELP[e.helpId]);
  const gaps = els.filter((e) => !e.helpId && e.gap);
  const exempts = els.filter((e) => !e.helpId && e.exempt);
  const pct = (a, b) => (b === 0 ? "n/d" : `${((100 * a) / b).toFixed(1)}%`);
  return { module: m.module, rotas: m.routes.length, abas: tabs.length, abasHelp: tabsHelp.length, elementos: els.length, comHover: withHelp.length, gaps: gaps.length, isentos: exempts.length, cobAbas: pct(tabsHelp.length, tabs.length), cobElementos: pct(withHelp.length, els.length - exempts.length), gapList: gaps };
});
console.log("\n=== MATRIZ DE COBERTURA DO HOVER TEXT (sobre o inventário dos manifestos) ===");
console.table(rows.map(({ gapList, ...r }) => r));
const total = rows.reduce((a, r) => ({ rotas: a.rotas + r.rotas, elementos: a.elementos + r.elementos, comHover: a.comHover + r.comHover, gaps: a.gaps + r.gaps, isentos: a.isentos + r.isentos }), { rotas: 0, elementos: 0, comHover: 0, gaps: 0, isentos: 0 });
console.log(`TOTAL: ${REAL_ROUTES.length} rotas reais (${declared.size} inventariadas, ${Object.keys(EXEMPT_ROUTES).length} isentas) | ${total.elementos} elementos inventariados | ${total.comHover} com Hover Text | ${total.gaps} lacunas declaradas | ${total.isentos} isentos justificados`);
if (process.argv.includes("--matrix")) {
  console.log("\n=== LACUNAS DECLARADAS (tela › elemento: motivo/providência) ===");
  for (const r of rows) for (const g of r.gapList) console.log(`${r.module} | ${g.route}${g.tab ? " › " + g.tab : ""} › ${g.label}: ${g.gap}`);
}

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
