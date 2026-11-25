// Plano de reconciliação do histórico de migrations (scripts/reconciliacao-rename-plan.mjs): valida, SEM rede e SEM renomear,
// que os 7 renomeios são consistentes com o repositório (arquivo antigo XOR novo, versões únicas, sem colisão) e que o
// relatório lista referências. A prova em PostgreSQL real fica em `--replay-realpg` (ver docs/lote2-permissoes-sla-acompanhamento.md).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migDir = path.join(root, "supabase", "migrations");
const script = path.join(here, "reconciliacao-rename-plan.mjs");
let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); failed += 1; }
};
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const run = (...args) => execFileSync("node", [script, ...args], { encoding: "utf8", cwd: root, maxBuffer: 32 * 1024 * 1024 });

const plan = JSON.parse(run("--json"));
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql"));

check("7 renomeios, versões de 14 dígitos, nomes preservados", () => {
  assert(plan.renames.length === 7);
  for (const r of plan.renames) assert(/^\d{14}$/.test(r.from) && /^\d{14}$/.test(r.to) && r.to > r.from, JSON.stringify(r));
});
check("cada migration está no nome antigo XOR no novo (nunca ambos, nunca nenhum) — idempotente após o renomeio", () => {
  for (const r of plan.renames) {
    const a = existsSync(path.join(migDir, r.oldFile));
    const b = existsSync(path.join(migDir, r.newFile));
    assert(a !== b, `${r.name}: antigo=${a} novo=${b}`);
  }
});
check("versão de destino não colide com outra migration do repositório", () => {
  const versions = files.map((f) => f.slice(0, 14));
  for (const r of plan.renames) {
    const holders = versions.filter((v) => v === r.to).length;
    assert(holders <= 1, `${r.to} usada ${holders}x`);
    if (existsSync(path.join(migDir, r.oldFile))) assert(holders === 0, `${r.to} já ocupada`);
  }
});
check("relatório lista as referências a atualizar (enquanto houver renomeio pendente) e --commands imprime 7 linhas", () => {
  const pending = plan.renames.filter((r) => r.state === "PENDING").length;
  if (pending > 0) assert(plan.references.length > 0 && plan.filesToUpdate.length > 0, "sem referências");
  assert(run("--commands").trim().split("\n").length === 7);
});
check("--check sai com 0 só quando não resta nada a fazer", () => {
  const pending = plan.renames.filter((r) => r.state === "PENDING").length + plan.references.length;
  let code = 0;
  try { run("--check"); } catch (e) { code = e.status; }
  assert((pending === 0) === (code === 0), `pendências=${pending} saída=${code}`);
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
