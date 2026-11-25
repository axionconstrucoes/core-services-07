#!/usr/bin/env node
// Reconciliação dos candidatos do inventário automático × Hover Text (Frente B do fechamento).
// O inventário por página (help-inventory.mjs) soma o fecho de imports de CADA rota, então um componente compartilhado entra várias vezes.
// Aqui cada candidato é ITEMIZADO uma única vez (arquivo:linha:tipo) e classificado por regra determinística e documentada:
//   COBERTO            helpId renderizado na janela do elemento (cabeçalho de tabela: mesma linha ±1; demais: ±8 linhas)
//   COBERTO_NA_SECAO   o rótulo do campo/coluna aparece, literalmente, no texto de um helpId renderizado NO MESMO arquivo (a ajuda da seção/tabela descreve o campo)
//   ISENTO (marcador)  comentário `help-exempt: <motivo objetivo, >= 15 caracteres>` até 3 linhas acima/abaixo do elemento no código-fonte
//   COMPARTILHADO      definição de primitivo de UI (components/ui/**): não há contexto de domínio; a ajuda vem de cada uso
//   DECORATIVO         elemento técnico sem decisão do usuário (input hidden, svg decorativo/ícone)
//   ISENTO             controle de navegação/fechamento de rótulo autoexplicativo (Voltar, Cancelar, Fechar, Anterior, Próxima, Sair)
//   DUPLICADO          mesmo tipo+rótulo repetido no mesmo arquivo (a primeira ocorrência é a que conta)
//   SEM_ROTA           arquivo que nenhuma rota real importa (código sem tela alcançável)
//   LACUNA_EFETIVA     nenhuma das anteriores: precisa de helpId ou de isenção justificada no manifesto
// Métricas: COBERTURA BRUTA = com hover / total inventariado nos manifestos; COBERTURA ELEGÍVEL = com hover / não isentos (manifestos).
// Uso: node scripts/help-reconcile.mjs [--json] [--list]   (grava docs/design-system/reconciliacao-cobertura-ajuda.{json,md} sem --stdout)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { ALL_HELP_MANIFESTS } = await import("../apps/web/lib/ui/help/manifests/index.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const web = path.join(root, "apps/web");
const appDir = path.join(web, "app");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
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
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) { const r = resolveImport(f, m[1]); if (r && r.endsWith(".tsx")) stack.push(r); }
  }
  return [...seen].filter((f) => f.endsWith(".tsx"));
}

const pages = walk(appDir).filter((f) => path.basename(f) === "page.tsx").sort();
const fileRoutes = new Map(); // arquivo -> rotas que o alcançam
for (const p of pages) for (const f of closure(p)) { if (!fileRoutes.has(f)) fileRoutes.set(f, []); fileRoutes.get(f).push(routeOf(p)); }
const routeModule = new Map();
for (const m of ALL_HELP_MANIFESTS) for (const r of m.routes) routeModule.set(r, m.module);

// Candidatos: cada ocorrência é um item (arquivo:linha).
const KINDS = [
  ["aba", /<TabsTrigger\b|role="tab"/],
  ["botao", /<Button\b|<button\b/],
  ["campo", /<Input\b|<Textarea\b|<Select\b|<SelectTrigger\b|<input\b|<textarea\b|<select\b/],
  ["cabecalho-tabela", /<TableHead\b|<th\b/],
  ["formulario", /<form\b/],
];
const HELP_LINE = /helpId=(?:"[^"]+"|\{["'`][^"'`]+["'`]\})/;
const GENERIC_NAV = /^(voltar|cancelar|fechar|anterior|pr[oó]xim[ao]s?|sair|ok|limpar|fechar ajuda|menu)$/i;

function labelAround(lines, i) {
  const text = lines.slice(i, i + 4).join(" ").replace(/\s+/g, " ");
  const m = text.match(/>([^<>{}]{2,60})</) ?? text.match(/(?:aria-label|placeholder|name)=["']([^"']{2,60})["']/);
  return (m?.[1] ?? "").trim();
}

const items = [];
for (const [file, routes] of fileRoutes) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const isPrimitive = rel(file).startsWith("apps/web/components/ui/");
  lines.forEach((line, i) => {
    for (const [kind, re] of KINDS) {
      if (!re.test(line)) continue;
      const win = kind === "cabecalho-tabela" ? [i - 1, i + 1] : [i - 8, i + 8];
      const covered = lines.slice(Math.max(0, win[0]), win[1] + 1).some((l) => HELP_LINE.test(l));
      const label = labelAround(lines, i);
      const ctx = lines.slice(i, i + 3).join(" ");
      let cls = "LACUNA_EFETIVA", why = "";
      if (/type=["']hidden["']/.test(ctx)) { cls = "DECORATIVO"; why = "input hidden"; }
      else if (isPrimitive) { cls = "COMPARTILHADO"; why = "primitivo de UI (definição)"; }
      else if (covered) { cls = "COBERTO"; why = "helpId na janela do elemento"; }
      else if (lines.slice(Math.max(0, i - 3), i + 4).some((l) => /help-exempt:\s*\S.{14,}/.test(l))) { cls = "ISENTO"; why = "marcador help-exempt no código"; }
      else if (kind === "botao" && GENERIC_NAV.test(label)) { cls = "ISENTO"; why = `navegação/fechamento autoexplicativo ("${label}")`; }
      items.push({ file: rel(file), line: i + 1, kind, label, cls, why, routes: routes.length, module: routeModule.get(routes[0]) ?? "?" });
    }
  });
}
// Duplicados: mesmo arquivo+tipo+rótulo (não vazio) repetido; só a primeira ocorrência conta.
const firstSeen = new Set();
for (const it of items) {
  if (!it.label || it.cls === "COBERTO" || it.cls === "COMPARTILHADO" || it.cls === "DECORATIVO") continue;
  const k = `${it.file}|${it.kind}|${it.label.toLowerCase()}`;
  if (firstSeen.has(k)) { it.cls = "DUPLICADO"; it.why = "mesmo tipo+rótulo repetido no arquivo"; } else firstSeen.add(k);
}

// Cobertura na seção: o rótulo (>= 4 caracteres) consta no texto do catálogo de um helpId renderizado no mesmo arquivo.
const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fileHelpText = new Map();
for (const file of fileRoutes.keys()) {
  const src = readFileSync(file, "utf8");
  const ids = [...src.matchAll(/helpId=(?:"([^"]+)"|{["'`]([^"'`]+)["'`]})/g)].map((m) => m[1] ?? m[2]);
  fileHelpText.set(rel(file), ids.map((id) => ACC_FEATURE_HELP[id]).filter(Boolean).map((e) => ({ id: e.id, text: norm(JSON.stringify(e)) })));
}
for (const it of items) {
  if (it.cls !== "LACUNA_EFETIVA" || it.label.length < 4) continue;
  const hit = (fileHelpText.get(it.file) ?? []).find((h) => h.text.includes(norm(it.label)));
  if (hit) { it.cls = "COBERTO_NA_SECAO"; it.why = `rótulo descrito em ${hit.id}`; }
}
const classes = ["COBERTO", "COBERTO_NA_SECAO", "COMPARTILHADO", "DECORATIVO", "ISENTO", "DUPLICADO", "LACUNA_EFETIVA"];
const tally = (arr) => Object.fromEntries(classes.map((c) => [c, arr.filter((x) => x.cls === c).length]));
const byModule = {};
for (const it of items) (byModule[it.module] ??= []).push(it);

// Métricas dos manifestos (lista autoritativa).
let inv = 0, withHelp = 0, exempt = 0, gaps = 0;
for (const m of ALL_HELP_MANIFESTS) for (const e of m.elements) {
  inv++;
  if (e.helpId && ACC_FEATURE_HELP[e.helpId]) withHelp++; else if (e.exempt) exempt++; else if (e.gap) gaps++;
}
const pct = (a, b) => (b === 0 ? "n/d" : `${((100 * a) / b).toFixed(1)}%`);
const metrics = { inventariados: inv, comHover: withHelp, isentos: exempt, lacunasDeclaradas: gaps, coberturaBruta: pct(withHelp, inv), coberturaElegivel: pct(withHelp, inv - exempt) };

const total = tally(items);
const out = {
  geradoPor: "scripts/help-reconcile.mjs (heurístico; regras no cabeçalho do script)",
  candidatosUnicos: items.length,
  arquivosAlcancados: fileRoutes.size,
  classificacao: total,
  porModulo: Object.fromEntries(Object.entries(byModule).map(([k, v]) => [k, { total: v.length, ...tally(v) }])),
  manifestos: metrics,
  lacunasEfetivas: items.filter((x) => x.cls === "LACUNA_EFETIVA").map(({ file, line, kind, label, module }) => ({ file, line, kind, label, module })),
};

if (process.argv.includes("--json")) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`Candidatos únicos (arquivo:linha): ${items.length} em ${fileRoutes.size} arquivos de interface (o inventário por página somava ${"1453"} por repetir componentes compartilhados em cada rota)`);
console.table({ total, ...Object.fromEntries(Object.entries(out.porModulo).map(([k, v]) => [k, v])) });
console.log("Manifestos:", JSON.stringify(metrics));
if (process.argv.includes("--list")) for (const g of out.lacunasEfetivas) console.log(`${g.module} | ${g.file}:${g.line} | ${g.kind} | ${g.label}`);
if (!process.argv.includes("--stdout")) {
  const dir = path.join(root, "docs/design-system");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "reconciliacao-cobertura-ajuda.json"), JSON.stringify(out, null, 2));
  const md = [
    "# Reconciliação de cobertura do Hover Text",
    "",
    "Gerado por `node scripts/help-reconcile.mjs` (heurístico). Cada candidato do inventário automático é itemizado UMA vez (arquivo:linha:tipo) e classificado. **Não se presume que todo candidato exige Hover Text individual.**",
    "",
    `- Candidatos únicos: **${items.length}** em ${fileRoutes.size} arquivos de interface alcançados por alguma rota real.`,
    `- Classificação: ${classes.map((c) => `${c} **${total[c]}**`).join(" · ")}`,
    "",
    "## Métricas dos manifestos (lista autoritativa)",
    "",
    `- Inventariados: **${inv}** · com Hover Text: **${withHelp}** · isentos justificados: **${exempt}** · lacunas declaradas: **${gaps}**`,
    `- **Cobertura bruta** (com hover / inventariados): **${metrics.coberturaBruta}**`,
    `- **Cobertura elegível** (com hover / não isentos): **${metrics.coberturaElegivel}**`,
    "",
    "## Candidatos por módulo",
    "",
    "| Módulo | Total | " + classes.join(" | ") + " |",
    "|---|---:|" + classes.map(() => "---:").join("|") + "|",
    ...Object.entries(out.porModulo).map(([k, v]) => `| ${k} | ${v.total} | ${classes.map((c) => v[c]).join(" | ")} |`),
    "",
    "## Lacunas efetivas (precisam de helpId ou isenção justificada)",
    "",
    "| Módulo | Arquivo:linha | Tipo | Rótulo |",
    "|---|---|---|---|",
    ...out.lacunasEfetivas.map((g) => `| ${g.module} | \`${g.file}:${g.line}\` | ${g.kind} | ${g.label.replace(/\|/g, "/")} |`),
    "",
  ].join("\n");
  writeFileSync(path.join(dir, "reconciliacao-cobertura-ajuda.md"), md);
  console.log("Gravado: docs/design-system/reconciliacao-cobertura-ajuda.{json,md}");
}
