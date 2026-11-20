// Guarda dos componentes SEM ROTA (B3): calcula, pelo grafo de imports, quais arquivos de apps/web/components/**/*.tsx NÃO são alcançados
// por nenhuma página/layout/route/proxy do Next e compara com a decisão registrada em docs/design-system/componentes-sem-rota.json.
//  - componente novo sem rota  => falha (alguém precisa registrar a decisão: manter isento ou ativar);
//  - componente registrado que agora TEM rota => falha (precisa sair da lista e entrar na cobertura de Hover Text/contraste);
//  - decisão sem justificativa  => falha.
// Nenhuma rota é criada por este teste; ele só impede que componentes fiquem fora da cobertura "em silêncio".
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");
const norm = (p) => p.split(path.sep).join("/");
const EXT = [".ts", ".tsx", ".mjs", ".js"];

const all = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(n)) all.push(p);
  }
})(web);

function resolve(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = path.join(web, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, "index" + e))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const deps = new Map();
for (const f of all) {
  const set = new Set();
  for (const m of readFileSync(f, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
    const r = resolve(m[1], f);
    if (r) set.add(r);
  }
  deps.set(f, set);
}
const roots = all.filter((f) => (/\/app\//.test(norm(f)) && /(page|layout|route|loading|error|not-found|template|default)\.tsx?$/.test(f)) || /(proxy|middleware|instrumentation)\.ts$/.test(f));
const seen = new Set(roots);
const stack = [...roots];
while (stack.length) {
  const f = stack.pop();
  for (const d of deps.get(f) ?? []) if (!seen.has(d)) { seen.add(d); stack.push(d); }
}
const unrouted = all.filter((f) => /\/components\//.test(norm(f)) && f.endsWith(".tsx") && !seen.has(f)).map((f) => norm(path.relative(web, f))).sort();

const registry = JSON.parse(readFileSync(path.join(root, "docs", "design-system", "componentes-sem-rota.json"), "utf8"));
const registered = new Map();
for (const g of registry.grupos) for (const f of g.arquivos) registered.set(f, g);

let fail = 0;
const bad = (m) => { fail += 1; console.log(`FAIL ${m}`); };
for (const f of unrouted) if (!registered.has(f)) bad(`componente SEM ROTA e sem decisão registrada: ${f} (registre em docs/design-system/componentes-sem-rota.json: manter isento ou ativar)`);
for (const [f] of registered) if (!unrouted.includes(f)) bad(`registrado como sem rota, mas agora é alcançado por uma rota (ou deixou de existir): ${f} — remova da lista e confirme Hover Text/contraste`);
for (const g of registry.grupos) {
  if (!["MANTER_ISENTO", "ATIVAR", "REMOVER_COM_AUTORIZACAO"].includes(g.decisao)) bad(`grupo "${g.id}" com decisão inválida: ${g.decisao}`);
  if (!g.justificativa || g.justificativa.length < 40) bad(`grupo "${g.id}" sem justificativa suficiente`);
  if (!g.evidencia || g.evidencia.length < 10) bad(`grupo "${g.id}" sem evidência`);
}
console.log(`${fail ? "FALHOU" : "OK"}: ${unrouted.length} componentes sem rota, ${registered.size} registrados em ${registry.grupos.length} grupos com decisão.`);
process.exit(fail ? 1 : 0);
