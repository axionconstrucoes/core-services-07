// Compatibilidade da sequencia de implantacao com a CLI oficial do Supabase (docs/implantacao/14). So le arquivos; sem rede, sem banco.
// Prova: (1) `db push` direto aplicaria 73 arquivos (inclui hotfix e as 2 adiadas) -> inadequado; (2) o diretorio CUMULATIVO por onda faz a CLI
// aplicar exatamente a onda; (3) so a onda A (e as adiadas, apos as demais) exigem --include-all; (4) o repair do hotfix depois da onda B evita
// que B vire "fora de ordem"; (5) o script de montagem recusa --out dentro do repositorio.
// Uso: node scripts/test-implantacao-cli.mjs
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composicoes, plano, HOTFIX } from "./implantacao-cli-workdir.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0; let failed = 0;
function check(name, fn) { try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); } }
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };
const { seq, local, historicoBase, passos } = plano();
const comps = composicoes();

check("historico base = 134 registradas e todas as pendentes somam 73 (72 da sequencia + hotfix) = 207 arquivos locais", () => {
  assert(historicoBase.length === 134, `base ${historicoBase.length}`);
  assert(local.length === 207, `locais ${local.length}`);
  const seqN = seq.ondas.flatMap((o) => o.migrations).length + seq.adiadas.length;
  assert(seqN === 72 && 134 + seqN + 1 === local.length, `sequencia ${seqN}`);
});
check("`db push --include-all` direto aplicaria 73 arquivos, inclusive o hotfix (reaplicacao) e as 2 adiadas: INADEQUADO", () => {
  const reg = new Set(historicoBase);
  const pend = local.filter((s) => !reg.has(s));
  assert(pend.length === 73 && pend.includes(HOTFIX) && seq.adiadas.every((a) => pend.includes(a.migration)));
});
check("diretorio cumulativo: a CLI aplicaria exatamente a onda (pendentes = migrations da onda), sem hotfix nem adiadas fora do seu passo", () => {
  for (const [i, c] of comps.entries()) {
    const esperado = passos[i].tipo === "repair" ? [HOTFIX] : [...passos[i].migrations].sort();
    assert(JSON.stringify(c.pendentes) === JSON.stringify(esperado), `${c.id}: ${c.pendentes.join(",")}`);
    if (c.tipo === "onda") assert(!c.pendentes.includes(HOTFIX) && !seq.adiadas.some((a) => c.pendentes.includes(a.migration)), `${c.id}: contem hotfix/adiada`);
  }
});
check("so a onda A exige --include-all entre as ondas; as duas adiadas tambem (ja ha versoes maiores registradas); nenhuma outra", () => {
  const exige = comps.filter((c) => c.foraDeOrdem.length).map((c) => `${c.id}:${c.foraDeOrdem.length}`);
  assert(exige.join(",") === "A:3,E:1,H2:1", exige.join(","));
});
check("repair do hotfix ANTES da onda B tornaria B fora de ordem (12); depois de B, nenhuma", () => {
  const maxHotfix = HOTFIX.slice(0, 14);
  const b = seq.ondas.find((o) => o.id === "B").migrations;
  assert(b.every((m) => m.slice(0, 14) < maxHotfix), "B nao e anterior ao hotfix");
  assert(comps.find((c) => c.id === "B").foraDeOrdem.length === 0);
});
check("a CLI nao tem --target/--exclude: o historico remoto final esperado tem os 207 arquivos e o ultimo passo deixa 0 pendentes", () => {
  const ultimo = comps[comps.length - 1];
  assert(ultimo.arquivos.length === 207 && ultimo.historicoAntes + 1 === 207, `${ultimo.arquivos.length}`);
});
check("o script de montagem recusa --out dentro do repositorio e nao usa rede/CLI/banco", () => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "implantacao-cli-workdir.mjs"), "--onda", "A", "--out", path.join(root, "tmp-nao")], { encoding: "utf8" });
  assert(r.status === 2 && /fora do repositorio/.test(r.stderr), `${r.status} ${r.stderr}`);
  const src = readFileSync(path.join(root, "scripts", "implantacao-cli-workdir.mjs"), "utf8");
  assert(!/node:(http|https|net|child_process)|fetch\(|supabase db push\s+--|spawn|exec/i.test(src.replace(/\/\/.*$/gm, "")), "script nao deve executar nada externo");
});
console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
