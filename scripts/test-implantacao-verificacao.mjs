// Fase 6/H4: verificacoes por onda (scripts/sql/verificacao-onda-*.sql), perfil de volume e gerador. So le arquivos; sem rede, sem banco.
// Uso: node scripts/test-implantacao-verificacao.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { extrairObjetos } from "./gen-verificacao-onda.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };

const seq = JSON.parse(read("scripts/data/implantacao-sequencia.json"));
const sqlDir = path.join(root, "scripts", "sql");
const files = readdirSync(sqlDir).filter((f) => /^verificacao-onda-.*\.sql$/.test(f));

check("existe um verificacao-onda-<id>.sql por onda e por migration adiada da sequência", () => {
  for (const o of seq.ondas) assert(files.includes(`verificacao-onda-${o.id.toLowerCase()}.sql`), `falta onda ${o.id}`);
  for (const a of seq.adiadas) assert(files.includes(`verificacao-onda-adiada-${a.onda.toLowerCase()}-${a.migration.slice(0, 14)}.sql`), `falta adiada ${a.migration}`);
});

check("todos os SQL de verificação são SOMENTE LEITURA (READ ONLY + ROLLBACK, sem DDL/DML)", () => {
  assert(files.length >= 13, `poucos arquivos: ${files.length}`);
  for (const f of files) {
    const t = read(`scripts/sql/${f}`);
    const code = t.split("\n").filter((l) => !l.startsWith("--") && !l.startsWith("\\")).join("\n");
    assert(/begin read only;/i.test(code) && /rollback;\s*$/i.test(code.trim() + "\n"), `${f}: sem begin read only/rollback`);
    assert(!/\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from|drop\s|alter\s|create\s|truncate|grant\s|revoke\s)/i.test(code.replace(/'[^']*'/g, "''")), `${f}: contém comando que escreve`);
    assert(/\\if :\{\?fase\}/.test(t) && /:'fase'/.test(t), `${f}: não usa a variável fase`);
  }
});

check("todo migration pendente da sequência aparece em algum verificacao-onda (cobertura)", () => {
  const todos = [...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration)];
  const texto = files.map((f) => read(`scripts/sql/${f}`)).join("\n");
  const falt = todos.filter((m) => !texto.includes(`'${m}'`));
  assert(falt.length === 0, `sem verificação: ${falt.join(", ")}`);
});

check("o gerador está em dia (--check): arquivos versionados = saída do gerador", () => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "gen-verificacao-onda.mjs"), "--check"], { encoding: "utf8" });
  assert(r.status === 0, `rode: node scripts/gen-verificacao-onda.mjs  (${(r.stdout || "").trim()})`);
});

check("extrator reconhece tabela, coluna, índice e função (sem comentários)", () => {
  const o = extrairObjetos(`-- create table public.fake (x int);
    create table if not exists public.t1 (id int);
    alter table public.t2 add column if not exists c1 int, add column c2 text;
    create unique index if not exists ix_a on public.t1(id);
    create or replace function public.f1() returns int language sql as $$ select 1 $$;`);
  const k = (t, n, r = "") => o.some((x) => x.tipo === t && x.nome === n && x.rel === r);
  assert(k("tabela", "t1") && !k("tabela", "fake") && k("coluna", "c1", "t2") && k("coluna", "c2", "t2") && k("indice", "ix_a") && k("funcao", "f1"), JSON.stringify(o));
});

check("o perfil de volume contém só contagens/tamanhos (sem conteúdo nem pessoa) e cita a fonte somente leitura", () => {
  const p = JSON.parse(read("scripts/data/implantacao-perfil-volume.json"));
  assert(Array.isArray(p.tabelas) && p.tabelas.length >= 10, "tabelas");
  for (const t of p.tabelas) {
    assert(Object.keys(t).every((k) => ["nome", "linhas", "heapBytes", "totalBytes", "indices"].includes(k)), `${t.nome}: chave inesperada`);
    assert(Number.isInteger(t.linhas) && t.linhas > 0 && /^[a-z_]+$/.test(t.nome), `${t.nome}: valores`);
  }
  assert(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(JSON.stringify(p)), "o perfil não pode conter e-mails");
  assert(/CONTAGENS|contagens/.test(p.descricao) && /SINTETICOS/.test(p.descricao), "descrição");
});

check("o ensaio aceita ACC_ENSAIO_VOLUME_SCALE, é local-only e roda as verificações antes/depois por onda", () => {
  const e = read("scripts/ensaio-implantacao-ondas-realpg.mjs");
  assert(/ACC_ENSAIO_VOLUME_SCALE/.test(e) && /semearVolume/.test(e), "volume");
  assert(/verificarOnda\(su, vArq, "antes"/.test(e) && /verificarOnda\(su, vArq, "depois"/.test(e), "antes/depois");
  assert(/127\.0\.0\.1/.test(e) && /55434/.test(e), "local-only");
  const lib = read("scripts/ensaio-implantacao-volume-lib.mjs");
  assert(/session_replication_role/.test(lib) && !/plbcvwostmdmdmrziwmd/.test(lib + e), "lib local");
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
