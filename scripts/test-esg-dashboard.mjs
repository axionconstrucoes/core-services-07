// Teste estrutural: drill-down ESG Dashboard -> /[projectId]/esg?filtro=...
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const dash = read("apps/web/app/[projectId]/dashboard/page.tsx");
const esg = read("apps/web/app/[projectId]/esg/page.tsx");
const filtro = read("apps/web/lib/esg/esg-filtro.ts");
const data = read("apps/web/lib/dashboard-visual/get-dashboard-visual-data.ts");
const FILTROS = ["cumpridas", "pendentes", "vencidas", "revisao", "evidencias"];
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; console.log(`OK   ${m}`); };

ok(dash.includes("/esg?filtro=${cell.filtro}"), "dashboard linka para /esg?filtro=");
for (const f of FILTROS) {
  ok(dash.includes(`filtro: "${f}"`), `dashboard tem o filtro ${f}`);
  ok(new RegExp(`${f}:\\s*\\{\\s*bucket`).test(filtro), `esg-filtro define ${f}`);
}
ok(!dash.includes("Obrigações ESG em aberto"), "linha antiga 'em aberto' removida");
ok(/searchParams:\s*Promise</.test(esg) && /await searchParams/.test(esg), "esg page lê searchParams como Promise");
ok(esg.includes("parseEsgFiltro") && esg.includes("Obrigações que compõem"), "esg page lista 'Obrigações que compõem'");
ok(filtro.includes("hasOwnProperty") && /\?\s*\(raw as EsgFiltro\)\s*:\s*null/.test(filtro), "filtro inválido é ignorado (null)");
ok(esg.includes("obrigacao-${"), "esg page tem âncora de detalhe por obrigação");
ok(!data.includes("esgSubmissionsInRange"), "ESG não filtrado pelo período do dashboard");
console.log(`\n${n} verificações OK`);
