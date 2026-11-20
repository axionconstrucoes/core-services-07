// Guarda permanente da cobertura REAL do Hover Text (Frente B do fechamento): todo candidato a elemento funcional alcançado por uma rota
// real deve estar COBERTO (helpId na janela), COBERTO_NA_SECAO (rótulo citado no texto de um helpId do arquivo), ISENTO (marcador
// `help-exempt: motivo`), DUPLICADO, DECORATIVO ou COMPARTILHADO. LACUNA_EFETIVA > 0 falha. Isenções que citam um helpId têm de citar um id existente.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
register("./ts-module-resolver.mjs", import.meta.url);
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

const rec = JSON.parse(execFileSync(process.execPath, ["--no-warnings", path.join(here, "help-reconcile.mjs"), "--json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
check("nenhum candidato a elemento funcional sem helpId, rótulo documentado ou isenção justificada (LACUNA_EFETIVA = 0)", () => {
  const g = rec.lacunasEfetivas;
  ok(g.length === 0, `${g.length} lacuna(s): ${g.slice(0, 6).map((x) => `${x.file.replace("apps/web/", "")}:${x.line} ${x.kind} "${x.label}"`).join(" | ")}`);
});
check("manifestos: nenhuma lacuna declarada e cobertura elegível 100%", () => {
  ok(rec.manifestos.lacunasDeclaradas === 0, `${rec.manifestos.lacunasDeclaradas} lacunas declaradas`);
  ok(rec.manifestos.coberturaElegivel === "100.0%", rec.manifestos.coberturaElegivel);
});

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const ID_RE = /\b(?:shared|dashboard|comercial|planejamento|juridico|ssma|integracoes|experts|admin|engenharia)\.[a-z0-9-]+(?:\.[a-z0-9-]+){1,3}\b/g;
const MARKER_RE = /help-exempt:\s*(\S.*)/;
const markers = [];
for (const f of walk(path.join(root, "apps/web"))) {
  readFileSync(f, "utf8").split(/\r?\n/).forEach((l, i) => {
    const m = l.match(MARKER_RE);
    if (m) markers.push({ file: path.relative(root, f).split(path.sep).join("/"), line: i + 1, text: m[1] });
  });
}
check(`isenções no código (${markers.length}): motivo objetivo (>= 15 caracteres)`, () => {
  const bad = markers.filter((m) => m.text.replace(/\*\/\s*\}?\s*$/, "").trim().length < 15);
  ok(bad.length === 0, bad.slice(0, 5).map((m) => `${m.file}:${m.line}`).join(" | "));
});
let citing = 0;
check("isenções que citam um helpId citam um id que existe no catálogo", () => {
  const bad = [];
  for (const m of markers) {
    const ids = m.text.match(ID_RE) ?? [];
    if (ids.length) citing++;
    for (const id of ids) {
      if (ACC_FEATURE_HELP[id]) continue;
      // curinga citado como "<prefixo>-*" (ex.: ssma.esg.obrigacao-*): vale se existir ao menos um id com esse prefixo
      const wildcard = m.text.includes(id + "-*") && Object.keys(ACC_FEATURE_HELP).some((k) => k.startsWith(id + "-"));
      if (!wildcard) bad.push(`${m.file}:${m.line} -> ${id}`);
    }
  }
  ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 6).join(" | ")}`);
});
console.log(`\nResultado: ${passed} OK, ${failed} falha(s). (isenções: ${markers.length}; citando helpId: ${citing})`);
process.exit(failed ? 1 : 0);
