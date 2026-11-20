// Empacotador mínimo (sem esbuild/vite instalados): transpila TS/TSX com o compilador `typescript` do repositório, resolve o alias "@/"
// de apps/web, empacota em CommonJS (react, react-dom, lucide-react, clsx, tailwind-merge vêm de node_modules) e compila o CSS REAL
// (apps/web/app/globals.css) com PostCSS + @tailwindcss/postcss. Nada é instalado; a saída vai para um diretório temporário.
import { builtinModules, createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const webDir = path.join(root, "apps", "web");
const requireRoot = createRequire(path.join(webDir, "noop.js"));
const ts = requireRoot("typescript");
const EXTS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"];

function tryFile(p) {
  if (existsSync(p) && statSync(p).isFile()) return p;
  for (const e of EXTS) if (existsSync(p + e)) return p + e;
  if (existsSync(p) && statSync(p).isDirectory()) for (const e of EXTS) if (existsSync(path.join(p, "index" + e))) return path.join(p, "index" + e);
  return null;
}

let STUBS = {};
function resolveSpec(spec, from) {
  if (spec in STUBS) return STUBS[spec];
  if (spec.startsWith("@/")) return tryFile(path.join(webDir, spec.slice(2)));
  if (spec.startsWith(".")) return tryFile(path.resolve(path.dirname(from), spec));
  try { return createRequire(from).resolve(spec); } catch { return null; }
}

export function bundleJs(entry, stubs = {}) {
  STUBS = stubs; // módulos substituídos na fixture (ex.: next/link, next/navigation) para montar componentes REAIS sem o runtime do Next
  const modules = new Map(); // abs -> {id, code, deps}
  const missing = new Set();
  const externalNode = new Set();
  function add(abs) {
    if (modules.has(abs)) return modules.get(abs).id;
    const id = modules.size;
    const rec = { id, code: "", deps: {} };
    modules.set(abs, rec);
    let src = readFileSync(abs, "utf8");
    if (abs.endsWith(".json")) src = `module.exports=${src};`;
    else if (/\.(tsx?|mjs)$/.test(abs)) {
      src = ts.transpileModule(src, {
        fileName: abs,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, allowJs: true },
      }).outputText;
    }
    rec.code = src;
    const re = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[2];
      if (spec in rec.deps) continue;
      // Embutidos do Node (node:stream, fs, path...) pertencem ao código de SERVIDOR que a varredura estática alcança por um import que
      // a tela nunca executa: ficam externos (require devolve {}), nunca lidos como arquivo. O build real do Next separa servidor e cliente.
      if (spec.startsWith("node:") || builtinModules.includes(spec)) { externalNode.add(`${spec} (de ${path.relative(root, abs)})`); continue; }
      const target = resolveSpec(spec, abs);
      if (!target) { missing.add(`${spec} (de ${path.relative(root, abs)})`); continue; }
      rec.deps[spec] = add(target);
    }
    return id;
  }
  const entryId = add(entry);
  const parts = [...modules.values()].map((r) => `${r.id}:[function(module,exports,require){${r.code}\n},${JSON.stringify(r.deps)}]`);
  const out =
    `(function(){var process={env:{NODE_ENV:"production"}};var M={${parts.join(",")}};var C={};` +
    `function load(i){if(C[i])return C[i].exports;var mod=C[i]={exports:{}};var d=M[i];` +
    `d[0].call(mod.exports,mod,mod.exports,function(s){if(!(s in d[1])){return {};}return load(d[1][s]);});return mod.exports;}load(${entryId});})();`;
  return { code: out, modules: modules.size, missing: [...missing], externalNode: [...externalNode] };
}

export async function compileCss(extraCss = "") {
  const postcss = requireRoot("postcss");
  const tailwind = requireRoot("@tailwindcss/postcss");
  const file = path.join(webDir, "app", "globals.css");
  const result = await postcss([tailwind({ base: webDir })]).process(readFileSync(file, "utf8"), { from: file });
  return result.css + "\n" + extraCss;
}

export async function buildFixture({ entry, html, fixtureCss, outDir, stubs = {} }) {
  mkdirSync(outDir, { recursive: true });
  const js = bundleJs(entry, stubs);
  const css = await compileCss(fixtureCss);
  writeFileSync(path.join(outDir, "bundle.js"), js.code);
  writeFileSync(path.join(outDir, "fixture.css"), css);
  writeFileSync(path.join(outDir, "index.html"), html);
  return { index: path.join(outDir, "index.html"), jsBytes: js.code.length, cssBytes: css.length, modules: js.modules, missing: js.missing };
}
