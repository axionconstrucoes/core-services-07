#!/usr/bin/env node
// Inventário AUTOMÁTICO de telas e elementos funcionais do ACC (varredura estática) + cobertura do Hover Text.
// Fonte do roteamento: os arquivos page.tsx reais de apps/web/app (nunca uma lista presumida). Para cada página, segue os imports locais
// (@/components, @/lib/**/*.tsx, ./relativos) e conta candidatos a elemento funcional (abas, botões, campos, filtros, cabeçalhos de tabela,
// formulários) e os helpIds efetivamente renderizados. É HEURÍSTICO: serve para achar lacunas, não substitui o manifesto por módulo
// (lib/ui/help/manifests/*.ts), que é a lista autoritativa usada na cobertura declarada.
//
// Uso:
//   node scripts/help-inventory.mjs            # escreve docs/design-system/inventario-ui-ajuda.json e .md
//   node scripts/help-inventory.mjs --stdout   # só imprime o resumo
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const web = path.join(root, "apps/web");
const appDir = path.join(web, "app");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const routeOf = (file) => "/" + path.relative(appDir, path.dirname(file)).split(path.sep).filter((s) => !/^\(.+\)$/.test(s)).join("/").replace(/^\.$/, "");

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(web, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const cand of [base + ".tsx", base + ".ts", path.join(base, "index.tsx"), path.join(base, "index.ts")]) if (existsSync(cand)) return cand;
  return null;
}
function closure(entry) {
  const seen = new Set(); const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue; seen.add(f);
    if (!/\.(tsx|ts)$/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const r = resolveImport(f, m[1]);
      if (r && r.endsWith(".tsx")) stack.push(r); // só arquivos de interface (.tsx): ignora a lib de negócio em .ts
    }
  }
  return [...seen].filter((f) => f.endsWith(".tsx"));
}

const COUNTERS = {
  tabs: /<TabsTrigger\b|role="tab"/g,
  buttons: /<Button\b|<button\b/g,
  fields: /<Input\b|<Textarea\b|<Select\b|<SelectTrigger\b|<input\b|<textarea\b|<select\b/g,
  tableHeads: /<TableHead\b|<th\b/g,
  forms: /<form\b/g,
  labels: /<Label\b|<label\b/g,
  charts: /<(?:BarChart|LineChart|AreaChart|PieChart|ResponsiveContainer|svg)\b/g,
};
const HELP_RE = /helpId=(?:"([^"]+)"|\{["'`]([^"'`]+)["'`]\})/g;

const pages = walk(appDir).filter((f) => path.basename(f) === "page.tsx").sort();
const report = pages.map((page) => {
  const files = closure(page);
  const counts = Object.fromEntries(Object.keys(COUNTERS).map((k) => [k, 0]));
  const helpIds = new Set();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const [k, re] of Object.entries(COUNTERS)) counts[k] += (src.match(re) ?? []).length;
    for (const m of src.matchAll(HELP_RE)) helpIds.add(m[1] ?? m[2]);
  }
  const candidates = counts.tabs + counts.buttons + counts.fields + counts.tableHeads + counts.forms;
  return { route: routeOf(page), page: rel(page), files: files.length, counts, candidates, helpIds: [...helpIds].sort(), helpCount: helpIds.size };
});

const totals = report.reduce((a, r) => ({ pages: a.pages + 1, candidates: a.candidates + r.candidates, help: a.help + r.helpCount, withHelp: a.withHelp + (r.helpCount > 0 ? 1 : 0) }), { pages: 0, candidates: 0, help: 0, withHelp: 0 });
const out = { generatedFrom: "varredura estática de apps/web/app/**/page.tsx e imports locais", totals, pages: report };

if (process.argv.includes("--stdout")) {
  console.log(JSON.stringify(totals));
  for (const r of report) console.log(`${String(r.helpCount).padStart(3)} help | ${String(r.candidates).padStart(4)} cand. | ${r.route}`);
} else {
  const dir = path.join(root, "docs/design-system");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "inventario-ui-ajuda.json"), JSON.stringify(out, null, 2));
  const md = [
    "# Inventário de telas e elementos funcionais × Hover Text",
    "",
    "Gerado por `node scripts/help-inventory.mjs` (varredura estática; heurística). A cobertura DECLARADA vem dos manifestos em `apps/web/lib/ui/help/manifests/`.",
    "",
    `Páginas: **${totals.pages}** · com algum helpId: **${totals.withHelp}** · candidatos a elemento funcional: **${totals.candidates}** · helpIds distintos renderizados (soma por página): **${totals.help}**`,
    "",
    "| Rota | Abas | Botões | Campos | Cab. tabela | Forms | helpIds | Candidatos |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.map((r) => `| \`${r.route}\` | ${r.counts.tabs} | ${r.counts.buttons} | ${r.counts.fields} | ${r.counts.tableHeads} | ${r.counts.forms} | ${r.helpCount} | ${r.candidates} |`),
    "",
  ].join("\n");
  writeFileSync(path.join(dir, "inventario-ui-ajuda.md"), md);
  console.log(`Inventário gravado: ${totals.pages} páginas, ${totals.candidates} candidatos, ${totals.help} helpIds (docs/design-system/inventario-ui-ajuda.{json,md})`);
}
