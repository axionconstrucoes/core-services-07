// Regra de seleção dos checkboxes de filtro da Timeline (lib/timeline-export/multi-select.ts).
// Garante: desmarcar a última opção NÃO remarca nada sozinho; "Todos" responde ao clique; as outras escolhas são preservadas.
import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { computeNextSelection: next } = await import("../apps/web/lib/timeline-export/multi-select");

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const ALL = ["a", "b", "c"];
const t = (sel, cleared, v) => next(sel, cleared, ALL, { type: "toggle", value: v });

check("de 'todas marcadas', desmarcar uma preserva as outras", () => assert.deepEqual(t([], false, "b"), { selected: ["a", "c"], cleared: false }));
check("desmarcar mais uma preserva a restante", () => assert.deepEqual(t(["a", "c"], false, "a"), { selected: ["c"], cleared: false }));
check("desmarcar a ÚLTIMA marcada vira 'nenhuma marcada' (cleared) — não remarca nada", () => assert.deepEqual(t(["c"], false, "c"), { selected: [], cleared: true }));
check("de 'nenhuma marcada', marcar uma seleciona SÓ ela", () => assert.deepEqual(t([], true, "b"), { selected: ["b"], cleared: false }));
check("marcar até completar todas volta a 'todas marcadas' (sem restrição)", () => assert.deepEqual(t(["a", "b"], false, "c"), { selected: [], cleared: false }));
check("'Todos' marcado: clicar desmarca todas (nenhuma marcada)", () => assert.deepEqual(next([], false, ALL, { type: "all" }), { selected: [], cleared: true }));
check("'Todos' com seleção parcial marca todas", () => assert.deepEqual(next(["a"], false, ALL, { type: "all" }), { selected: [], cleared: false }));
check("'Todos' em 'nenhuma marcada' marca todas", () => assert.deepEqual(next([], true, ALL, { type: "all" }), { selected: [], cleared: false }));
check("grupo com uma única opção: desmarcar leva a 'nenhuma marcada'", () => assert.deepEqual(next([], false, ["x"], { type: "toggle", value: "x" }), { selected: [], cleared: true }));
check("sequência completa: desmarca 1, desmarca todas, marca de novo, sem remarcar sozinho", () => {
  let s = { selected: [], cleared: false };
  for (const v of ["a", "b", "c"]) s = next(s.selected, s.cleared, ALL, { type: "toggle", value: v });
  assert.deepEqual(s, { selected: [], cleared: true });
  s = next(s.selected, s.cleared, ALL, { type: "toggle", value: "b" });
  assert.deepEqual(s, { selected: ["b"], cleared: false });
  s = next(s.selected, s.cleared, ALL, { type: "toggle", value: "b" });
  assert.deepEqual(s, { selected: [], cleared: true });
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
