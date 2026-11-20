// LOTE 5 / Dashboard — dado ausente != zero; nenhum valor contratual fixo no código.
//   node --import ./scripts/lib/block-live-ai.mjs scripts/test-dashboard-no-fixed-values.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { resolveAdditivesDisplay, formatAdditivesMil } = await import("../apps/web/lib/dashboard/additives-display");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const PAGE = "apps/web/app/[projectId]/dashboard/page.tsx";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
}

check("Aditivos: sem fonte estruturada (null/indefinido/quantidade 0) = null, nunca zero", () => {
  for (const input of [null, undefined, { quantity: 0, netValue: 0 }, { quantity: 0, netValue: 5 }, { quantity: Number.NaN, netValue: 1 }, { quantity: 1, netValue: Number.NaN }]) {
    const d = resolveAdditivesDisplay(input);
    assert.equal(d.value, null);
    assert.equal(d.status, "NO_SOURCE");
    assert.equal(formatAdditivesMil(d), "Sem fonte");
  }
});

check("Aditivos: com aditivo formalizado, usa exatamente o valor da fonte (inclusive redução/negativo)", () => {
  const up = resolveAdditivesDisplay({ quantity: 2, netValue: 1_234_567 });
  assert.equal(up.value, 1_234_567);
  assert.equal(up.status, "FORMALIZED");
  assert.equal(formatAdditivesMil(up), `R$ ${Math.round(1_234_567 / 1000).toLocaleString("pt-BR")}`);
  assert.equal(resolveAdditivesDisplay({ quantity: 1, netValue: -500_000 }).value, -500_000);
  assert.ok(up.source.length > 10, "fonte rastreável descrita");
});

check("Dashboard: nenhum valor de contrato-base nem subtração 'total - base' no código", () => {
  const page = read(PAGE);
  assert.ok(!/33[_.]?450[_.]?000/.test(page), "valor fixo R$ 33.450.000 voltou à página");
  assert.ok(!/dashboardBaseContractValue/.test(page), "constante de contrato-base voltou");
  assert.ok(!/Math\.max\(0,\s*dashboardContractTotal/.test(page), "derivação total - base voltou");
  assert.ok(/resolveAdditivesDisplay\(data\.aditivosSummary\)/.test(page), "Aditivos deve vir da fonte estruturada");
});

check("Dashboard: nenhum literal monetário grande (>= 1 milhão) em lib/dashboard*, lib/dashboard-visual e na página", () => {
  const files = [PAGE];
  for (const d of ["apps/web/lib/dashboard", "apps/web/lib/dashboard-visual"]) {
    for (const f of readdirSync(path.join(root, d))) if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(`${d}/${f}`);
  }
  const offenders = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // 86_400_000 (ms/dia) é conversão de tempo, não valor monetário.
      const stripped = line.replace(/86_400_000/g, "");
      if (/\b\d{1,3}(_\d{3}){2,}\b/.test(stripped) || /\b\d{1,3}(\.\d{3}){2,}\b/.test(stripped)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

check("Dashboard: '?? 0' / '|| 0' só em contagem real (incremento, Map.get, count de consulta com erro tratado)", () => {
  const files = [];
  for (const d of ["apps/web/lib/dashboard", "apps/web/lib/dashboard-visual"]) {
    for (const f of readdirSync(path.join(root, d))) if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(`${d}/${f}`);
  }
  files.push(PAGE);
  const allowed = [/\(\s*[\w.\[\]]+\s*\?\?\s*0\)\s*\+\s*1/, /\.get\([^)]*\)\s*\?\?\s*0/, /\(count \?\? 0\)/, /technicalAdditionalDays \?\? 0/];
  const offenders = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      if (!/\?\?\s*0\b|\|\|\s*0\b/.test(line)) return;
      if (allowed.some((re) => re.test(line))) return;
      offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

check("Dashboard: caixas habilitadas sem configuração = null (desconhecido), não 0", () => {
  const src = read("apps/web/lib/dashboard-visual/get-dashboard-visual-data.ts");
  const line = src.split("\n").find((l) => l.includes("enabledMailboxes:"));
  assert.ok(line && /:\s*null,\s*$/.test(line), line);
});

console.log(`\n${passed} OK, ${failed} FALHA(S).`);
process.exit(failed ? 1 : 0);
