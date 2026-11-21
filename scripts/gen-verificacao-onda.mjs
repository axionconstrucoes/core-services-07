// Gera scripts/sql/verificacao-onda-<id>.sql (SOMENTE LEITURA) a partir de scripts/data/implantacao-sequencia.json e dos arquivos
// de supabase/migrations. Nada conecta em banco. Uso: node scripts/gen-verificacao-onda.mjs [--check]
//   --check: nao grava; falha (exit 1) se algum arquivo gerado difere do versionado (usado por test-implantacao-verificacao).
// Migrations posteriores a ultimaVersaoRemota que NAO estao no JSON (ex.: H2a/H2b/H2c) vao para verificacao-onda-novas.sql.
// Para cada onda o SQL resultante recebe `psql -v fase=antes|depois` e mostra, por objeto NOVO (tabela, coluna, indice), se existe;
// ok = (existe = (fase='depois')). Funcoes sao informativas (create or replace pode redefinir funcao preexistente).
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const seq = JSON.parse(readFileSync(path.join(here, "data", "implantacao-sequencia.json"), "utf8"));
const migDir = path.join(root, "supabase", "migrations");
const outDir = path.join(here, "sql");
const checkOnly = process.argv.includes("--check");

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

export function extrairObjetos(sql) {
  const s = stripComments(sql.replace(/\r\n/g, "\n"));
  const obj = [];
  const add = (tipo, nome, rel = "") => { if (!obj.some((o) => o.tipo === tipo && o.nome === nome && o.rel === rel)) obj.push({ tipo, nome, rel }); };
  for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) add("tabela", m[1].toLowerCase());
  for (const m of s.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-z0-9_]+)([\s\S]*?);/gi)) {
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)) add("coluna", c[1].toLowerCase(), m[1].toLowerCase());
  }
  for (const m of s.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on/gi)) add("indice", m[1].toLowerCase());
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)) add("funcao", m[1].toLowerCase());
  return obj;
}

const lit = (x) => `'${String(x).replace(/'/g, "''")}'`;
const existe = (o) => {
  if (o.tipo === "tabela") return `to_regclass('public.${o.nome}') is not null`;
  if (o.tipo === "coluna") return `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = ${lit(o.rel)} and column_name = ${lit(o.nome)})`;
  if (o.tipo === "indice") return `exists (select 1 from pg_indexes where schemaname = 'public' and indexname = ${lit(o.nome)})`;
  return `exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = ${lit(o.nome)})`;
};

export function sqlDaOnda(id, nome, migrations, migDirX = migDir) {
  const linhas = [];
  for (const mig of migrations) {
    const f = path.join(migDirX, `${mig}.sql`);
    const objs = existsSync(f) ? extrairObjetos(readFileSync(f, "utf8")) : [];
    if (!objs.length) linhas.push(`    (${lit(mig)}, 'sem-objeto-novo', '(redefine funcoes/politicas/dados: conferir P0 e docs/implantacao/03)', null::boolean)`);
    for (const o of objs) linhas.push(`    (${lit(mig)}, ${lit(o.tipo)}, ${lit(o.rel ? `${o.rel}.${o.nome}` : o.nome)}, ${existe(o)})`);
  }
  return `-- VERIFICACAO DE ONDA ${id} (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- ${nome}
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-${id.toLowerCase()}.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-${id.toLowerCase()}.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\\if :{?fase}
\\else
\\set fase depois
\\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
${linhas.join(",\n")}
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
${linhas.join(",\n")}
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
function main() {
const stems = readdirSync(migDir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
const known = new Set([...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration), ...seq.jaEfetivaNaoReaplicar]);
const novas = stems.filter((s) => s.slice(0, 14) > seq.ultimaVersaoRemota && !known.has(s));
const jobs = [
  ...seq.ondas.map((o) => ({ id: o.id, nome: o.nome, migrations: o.migrations })),
  ...seq.adiadas.map((a) => ({ id: `adiada-${a.onda}-${a.migration.slice(0, 14)}`, nome: `Adiada: ${a.migration}. ${a.motivo}`, migrations: [a.migration] })),
];
if (novas.length) jobs.push({ id: "novas", nome: "Migrations novas ainda fora do JSON (ex.: H2a/H2b/H2c); ver procedimento em docs/implantacao/12", migrations: novas });

let difere = 0;
for (const j of jobs) {
  const file = path.join(outDir, `verificacao-onda-${j.id.toLowerCase()}.sql`);
  const txt = sqlDaOnda(j.id, j.nome, j.migrations);
  if (checkOnly) {
    const cur = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
    if (cur !== txt) { difere += 1; console.log(`DIFERE ${path.basename(file)}`); }
  } else writeFileSync(file, txt, "utf8");
}
if (checkOnly) process.exit(difere ? 1 : 0);
console.log(`${jobs.length} arquivos gerados em scripts/sql/ (verificacao-onda-*.sql)`);
}
