// Testes OFFLINE (fakes) da compatibilidade do app antigo com o schema novo e da analise de locks das ondas.
// Sem banco, sem rede, sem dados reais. Docs: docs/implantacao/28.
// Uso: node scripts/test-compat-app-antigo.mjs
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chavesDoObjeto, comparar, ehArquivoDeProducao, extrairUso, mencoesLiterais, parseSelect } from "./implantacao/compat-app-antigo-lib.mjs";
import { analisarMigration, classificarComando, classificarRisco, dividirComandos, estimarSegundos } from "./implantacao/locks-ondas-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const assert = (c, m = "assercao falhou") => { if (!c) throw new Error(m); };
const eq = (a, b, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} esperado ${JSON.stringify(b)} obtido ${JSON.stringify(a)}`);

// ---------- extracao ----------
check("parseSelect: colunas, alias, cast, json e embeds aninhados", () => {
  const r = parseSelect("id, nome:name, total::text, meta->>k, filhos(id, x), alias:outra!fk(a, neta(b)), *");
  eq(r.colunas, ["id", "name", "total", "meta", "*"]);
  eq(r.embeds.map((e) => e.relacao), ["filhos", "outra"]);
  eq(r.embeds[1].embeds.map((e) => e.relacao), ["neta"]);
});

check("chavesDoObjeto: chaves, atalho, string, spread e computada", () => {
  const r = chavesDoObjeto('{ a: 1, b, "c-d": f(1, 2), ...resto, [k]: 3, e: { x: 1 } }');
  eq(r.chaves, ["a", "b", "c-d", "e"]);
  assert(r.dinamico, "spread/computada deve marcar dinamico");
});

const FONTE = {
  "apps/web/lib/a.ts": `
const RPC_X = "rpc_com_const";
export async function f(supabase) {
  await supabase.rpc("minha_rpc", { p_a: 1, p_b: x });
  await supabase.rpc(RPC_X, { p_id: 1 });
  await supabase.rpc("sem_args");
  const { data } = await supabase.from("tabela_a").select("id, nome, filho(id, z)").eq("projeto", p).order("criado_em");
  await supabase.from("tabela_a").insert({ id: 1, nome: "x" });
  await supabase.from("tabela_b").update({ status: "OK" }).eq("id", 1);
  await supabase.storage.from("bucket-x").upload("p", b);
  const arr = Array.from(new Set([1]));
  const buf = Buffer.from("abc");
}
`,
  "apps/web/lib/a.test.ts": `supabase.rpc("so_no_teste")`,
  "scripts/test-x.mjs": `supabase.rpc("so_no_teste2")`,
};

check("extrairUso: RPCs (literal, constante), tabelas, colunas lidas/escritas/filtradas, ignora bucket/Array.from/Buffer.from", () => {
  const arquivos = Object.fromEntries(Object.entries(FONTE).filter(([p]) => ehArquivoDeProducao(p)));
  eq(Object.keys(arquivos), ["apps/web/lib/a.ts"]);
  const u = extrairUso(arquivos);
  eq(Object.keys(u.rpcs).sort(), ["minha_rpc", "rpc_com_const", "sem_args"]);
  eq(u.rpcs.minha_rpc.chavesArgs, ["p_a", "p_b"]);
  eq(u.rpcs.rpc_com_const.chavesArgs, ["p_id"]);
  eq(Object.keys(u.tabelas).sort(), ["filho", "tabela_a", "tabela_b"]);
  eq(u.tabelas.tabela_a.leitura, ["id", "nome"]);
  eq(u.tabelas.tabela_a.insert, ["id", "nome"]);
  eq(u.tabelas.tabela_a.filtro, ["criado_em", "projeto"]);
  eq(u.tabelas.tabela_b.update, ["status"]);
  eq(u.tabelas.filho.leitura, ["id", "z"]);
  assert(!("bucket-x" in u.tabelas), "bucket de storage nao e tabela");
  eq(u.dinamicos.from.length, 0);
});

check("ehArquivoDeProducao: exclui testes, scripts de teste/ensaio e homolog/implantacao", () => {
  assert(ehArquivoDeProducao("apps/web/lib/x.ts"));
  assert(ehArquivoDeProducao("scripts/gmail-inbound-sync.mjs"));
  assert(!ehArquivoDeProducao("scripts/test-x.mjs"));
  assert(!ehArquivoDeProducao("scripts/ensaio-implantacao-ondas-realpg.mjs"));
  assert(!ehArquivoDeProducao("scripts/homolog/guard.mjs"));
  assert(!ehArquivoDeProducao("scripts/implantacao/executor-ondas.mjs"));
  assert(!ehArquivoDeProducao("apps/web/lib/x.test.ts"));
});

check("mencoesLiterais: acha nomes do catalogo citados como string (wrappers)", () => {
  const m = mencoesLiterais({ "apps/web/lib/w.ts": 'callRpc("minha_rpc"); const t = `tabela_a`;' }, ["minha_rpc", "tabela_a", "outra"]);
  eq(Object.keys(m).sort(), ["minha_rpc", "tabela_a"]);
});

// ---------- comparacao ----------
const f = (nome, args, extra = {}) => ({ nome, args, argsComDefault: args, retorno: "jsonb", securityDefiner: true, corpoMd5: "a", executaAnon: false, executaAuthenticated: true, executaServiceRole: true, ...extra });
const col = (tabela, coluna, extra = {}) => ({ tabela, coluna, tipo: "text", naoNulo: false, temDefault: false, gerada: false, identidade: false, tipoRel: "r", ...extra });
const cat = (over = {}) => ({ funcoes: [], colunas: [], rls: [], politicas: [], grantsTabela: [], gatilhos: [], restricoes: [], ...over });
const uso = (over = {}) => ({ rpcs: {}, tabelas: {}, dinamicos: { rpc: [], from: [] }, ...over });
const tab = (over = {}) => ({ arquivos: ["a.ts"], leitura: [], filtro: [], insert: [], update: [], upsert: [], escritaDinamica: false, embeds: [], ...over });
const tipos = (r) => r.achados.map((a) => `${a.nivel}:${a.tipo}`).sort();

check("comparar: tudo igual -> sem achados", () => {
  const c = cat({ funcoes: [f("r", "p_a uuid")], colunas: [col("t", "id")] });
  const r = comparar({ antes: c, depois: c, uso: uso({ rpcs: { r: { arquivos: ["a.ts"], chavesArgs: ["p_a"], argsDinamicos: false } }, tabelas: { t: tab({ leitura: ["id"] }) } }) });
  eq(r.achados, []);
  eq([r.resumo.rpcsUsadas, r.resumo.tabelasUsadas], [1, 1]);
});

check("comparar: RPC removida e assinatura alterada sao BLOQUEANTE", () => {
  const antes = cat({ funcoes: [f("r1", "p_a uuid"), f("r2", "p_a uuid")] });
  const depois = cat({ funcoes: [f("r2", "p_a uuid, p_b text")] });
  const u = uso({ rpcs: { r1: { arquivos: ["a.ts"], chavesArgs: ["p_a"], argsDinamicos: false }, r2: { arquivos: ["a.ts"], chavesArgs: ["p_a"], argsDinamicos: false } } });
  const t = tipos(comparar({ antes, depois, uso: u }));
  assert(t.includes("BLOQUEANTE:rpc-removida"), t.join());
  assert(t.includes("BLOQUEANTE:rpc-assinatura-alterada"), t.join());
  assert(t.includes("BLOQUEANTE:rpc-argumentos-incompativeis"), "argumento novo obrigatorio sem default");
});

check("comparar: argumento novo COM default e compativel; sobrecarga ambigua vira ATENCAO", () => {
  const antes = cat({ funcoes: [f("r", "p_a uuid")] });
  const depois = cat({ funcoes: [f("r", "p_a uuid, p_b text", { argsComDefault: "p_a uuid, p_b text DEFAULT NULL::text" })] });
  const u = uso({ rpcs: { r: { arquivos: ["a.ts"], chavesArgs: ["p_a"], argsDinamicos: false } } });
  const ra = comparar({ antes, depois, uso: u });
  assert(!tipos(ra).some((t) => t.startsWith("BLOQUEANTE:rpc-argumentos")), tipos(ra).join());
  const depois2 = cat({ funcoes: [f("r", "p_a uuid", { }), f("r", "p_a uuid, p_b text", { argsComDefault: "p_a uuid, p_b text DEFAULT NULL::text" })] });
  assert(tipos(comparar({ antes, depois: depois2, uso: u })).includes("ATENCAO:rpc-sobrecarga-ambigua"));
});

check("comparar: EXECUTE revogado de authenticated/service_role e BLOQUEANTE; de anon e ATENCAO; corpo alterado e INFO", () => {
  const antes = cat({ funcoes: [f("r", "p_a uuid"), f("s", "p_a uuid", { executaAnon: true })] });
  const depois = cat({ funcoes: [f("r", "p_a uuid", { executaAuthenticated: false, corpoMd5: "b" }), f("s", "p_a uuid", { executaAnon: false })] });
  const u = uso({ rpcs: { r: { arquivos: ["a"], chavesArgs: ["p_a"], argsDinamicos: false }, s: { arquivos: ["a"], chavesArgs: ["p_a"], argsDinamicos: false } } });
  const t = tipos(comparar({ antes, depois, uso: u }));
  assert(t.includes("BLOQUEANTE:rpc-execute-revogado") && t.includes("ATENCAO:rpc-execute-revogado") && t.includes("INFO:rpc-corpo-alterado"), t.join());
});

check("comparar: coluna removida lida/escrita, tabela removida e coluna NOT NULL nova sem default no insert", () => {
  const antes = cat({ colunas: [col("t", "id"), col("t", "velha"), col("gone", "id")] });
  const depois = cat({ colunas: [col("t", "id"), col("t", "nova", { naoNulo: true }), col("t", "ok", { naoNulo: true, temDefault: true })] });
  const u = uso({ tabelas: { t: tab({ leitura: ["id", "velha"], insert: ["id"] }), gone: tab({ leitura: ["id"] }) } });
  const t = tipos(comparar({ antes, depois, uso: u }));
  assert(t.includes("BLOQUEANTE:coluna-removida"), t.join());
  assert(t.includes("BLOQUEANTE:tabela-removida"), t.join());
  assert(t.includes("BLOQUEANTE:coluna-nova-not-null-sem-default"), t.join());
  assert(!t.some((x) => x.includes("t.ok")), "coluna com default nao e achado");
});

check("comparar: NOT NULL nova com escrita dinamica e ATENCAO (nao BLOQUEANTE); coluna gerada/identidade ignorada", () => {
  const antes = cat({ colunas: [col("t", "id")] });
  const depois = cat({ colunas: [col("t", "id"), col("t", "n", { naoNulo: true }), col("t", "g", { naoNulo: true, gerada: true })] });
  const r = comparar({ antes, depois, uso: uso({ tabelas: { t: tab({ escritaDinamica: true }) } }) });
  eq(tipos(r), ["ATENCAO:coluna-nova-not-null-sem-default"]);
});

check("comparar: grant revogado, politica removida/alterada, RLS habilitada, gatilho/restricao novos viram achados", () => {
  const antes = cat({
    colunas: [col("t", "id")],
    rls: [{ tabela: "t", rls: false, forcada: false }],
    politicas: [{ tabela: "t", politica: "p1", cmd: "SELECT", permissiva: true, papeis: ["authenticated"], usingMd5: "1", checkMd5: "" }, { tabela: "t", politica: "p2", cmd: "ALL", permissiva: true, papeis: ["authenticated"], usingMd5: "1", checkMd5: "" }],
    grantsTabela: [{ tabela: "t", papel: "authenticated", privilegios: ["SELECT", "UPDATE"] }],
    restricoes: [{ tabela: "t", restricao: "c1", tipo: "c", defMd5: "a" }],
  });
  const depois = cat({
    colunas: [col("t", "id")],
    rls: [{ tabela: "t", rls: true, forcada: false }],
    politicas: [{ tabela: "t", politica: "p2", cmd: "ALL", permissiva: true, papeis: ["authenticated"], usingMd5: "2", checkMd5: "" }, { tabela: "t", politica: "p3", cmd: "ALL", permissiva: false, papeis: ["public"], usingMd5: "3", checkMd5: "" }],
    grantsTabela: [{ tabela: "t", papel: "authenticated", privilegios: ["SELECT"] }],
    gatilhos: [{ tabela: "t", gatilho: "g1", habilitado: true, funcao: "fn", defMd5: "x" }],
    restricoes: [{ tabela: "t", restricao: "c1", tipo: "c", defMd5: "b" }, { tabela: "t", restricao: "c2", tipo: "u", defMd5: "z" }],
  });
  const t = tipos(comparar({ antes, depois, uso: uso({ tabelas: { t: tab({ leitura: ["id"], update: ["id"] }) } }) }));
  for (const esperado of ["BLOQUEANTE:grant-revogado", "ATENCAO:politica-removida", "ATENCAO:politica-alterada", "ATENCAO:politica-restritiva-nova", "ATENCAO:rls-habilitada-depois", "ATENCAO:gatilho-novo-em-tabela-escrita", "ATENCAO:restricao-nova-em-tabela-escrita", "ATENCAO:restricao-alterada-em-tabela-escrita"]) assert(t.includes(esperado), `${esperado} ausente em ${t.join()}`);
});

check("comparar: RPC citada so por literal e inexistente em ambos nao e BLOQUEANTE", () => {
  const r = comparar({ antes: cat(), depois: cat(), uso: uso({ rpcs: { fantasma: { arquivos: ["a"], chavesArgs: [], argsDinamicos: false } } }) });
  eq(tipos(r), ["ATENCAO:rpc-inexistente-em-ambos"]);
});

// ---------- catalogo SQL somente leitura ----------
check("catalogo-compat.sql e tamanhos-tabelas.sql sao SOMENTE SELECT (nenhum DDL/DML/COPY/SET)", () => {
  for (const p of ["scripts/implantacao/sql/catalogo-compat.sql", "scripts/implantacao/sql/tamanhos-tabelas.sql"]) {
    const sql = read(p).replace(/--[^\n]*/g, "").replace(/'[^']*'/g, "''");
    assert(/^\s*select\b/i.test(sql), `${p} deve comecar por select`);
    const proibido = sql.match(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|set\s+role|set\s+session)\b/i);
    assert(!proibido, `${p} contem ${proibido?.[0]}`);
  }
});

check("a CLI recusa catalogo em host nao local e nao embute segredo", () => {
  const src = read("scripts/implantacao/compat-app-antigo.mjs");
  assert(src.includes('"127.0.0.1", "localhost"'), "falta a recusa de host nao local");
  assert(src.includes("default_transaction_read_only=on"), "falta a transacao somente leitura");
  assert(!/postgres(ql)?:\/\/[^"'\s]*:[^"'\s@]+@/.test(src), "URL com senha no codigo");
});

// ---------- locks ----------
check("dividirComandos: ignora ; em comentario, string e bloco $$", () => {
  const c = dividirComandos("select 1; -- a; b\nselect ';x' ; do $$ begin perform 1; end $$; /* ; */ select 2");
  eq(c.length, 4);
  assert(c[2].startsWith("do $$"));
});

check("classificarComando: ADD COLUMN default estavel nao reescreve; default volatil reescreve; NOT NULL sem default exige tabela vazia", () => {
  const a = classificarComando("alter table public.t add column a int not null default 0")[0];
  assert(!a.rewrite && !a.exigeVazia, JSON.stringify(a));
  assert(classificarComando("alter table public.t add column a uuid default gen_random_uuid()")[0].rewrite);
  assert(classificarComando("alter table public.t add column a int not null")[0].exigeVazia);
});

check("classificarComando: CHECK validado varre; NOT VALID nao; indice bloqueia escrita; DROP COLUMN irreversivel", () => {
  assert(classificarComando("alter table t add constraint c check (a > 0)")[0].varre);
  assert(!classificarComando("alter table t add constraint c check (a > 0) not valid")[0].varre);
  const i = classificarComando("create unique index if not exists ix on public.t (a)")[0];
  assert(i.indice && i.lock === "SHARE" && i.tabela === "t");
  assert(classificarComando("alter table t drop column a")[0].irreversivel);
  assert(classificarComando("drop table if exists public.t")[0].irreversivel);
  assert(classificarComando("delete from public.t where a = 1")[0].irreversivel);
});

check("classificarComando: DO so de verificacao x DO com DML/DDL", () => {
  assert(classificarComando("do $$ begin if x then raise exception 'a'; end if; end $$")[0].tipo === "DO (so verificacao)");
  assert(classificarComando("do $$ begin execute format('alter table %I add constraint c check (a)', 't'); end $$")[0].tipo.startsWith("DO (bloco"));
});

check("analisarMigration/classificarRisco: tabela nova e BAIXO; indice em tabela grande e MEDIO/ALTO; pequena e BAIXO", () => {
  const tamanhos = [
    { esquema: "public", tabela: "pequena", linhas: 50, bytesTotal: 100000 },
    { esquema: "public", tabela: "media", linhas: 50000, bytesTotal: 60 * 1048576 },
    { esquema: "public", tabela: "enorme", linhas: 9e6, bytesTotal: 900 * 1048576 },
  ];
  const existentes = new Set(["pequena", "media", "enorme"]);
  const sql = "create table public.nova (id int); create index i1 on public.nova (id); create index i2 on public.pequena (a); create index i3 on public.media (a); create index i4 on public.enorme (a); update public.enorme set a = 1;";
  const itens = analisarMigration("x", sql, { tamanhos, existentes });
  const r = Object.fromEntries(itens.map((i) => [i.tipo + i.tabela, classificarRisco(i)]));
  eq(r["CREATE INDEXnova"], "BAIXO");
  eq(r["CREATE INDEXpequena"], "BAIXO");
  eq(r["CREATE INDEXmedia"], "MEDIO");
  eq(r["CREATE INDEXenorme"], "ALTO");
  eq(r["UPDATEenorme"], "ALTO");
  assert(estimarSegundos(itens.find((i) => i.tabela === "enorme")) > 10, "indice de 900 MB deve estimar > 10 s");
  assert(estimarSegundos(itens.find((i) => i.tabela === "nova")) <= 0.01);
});

check("analisarMigration: bloco DO usa as tabelas existentes citadas como limite superior", () => {
  const tamanhos = [{ esquema: "public", tabela: "grande", linhas: 2e6, bytesTotal: 300 * 1048576 }, { esquema: "public", tabela: "peq", linhas: 5, bytesTotal: 8192 }];
  const itens = analisarMigration("x", "do $$ begin execute format('alter table public.grande add constraint c check (a)'); end $$", { tamanhos, existentes: new Set(["grande", "peq"]) });
  eq(itens[0].alvosPorNome, ["grande"]);
  eq(classificarRisco(itens[0]), "ALTO");
});

// ---------- sequencia de implantacao (fatos verificados contra o catalogo real em 22/11) ----------
const seq = JSON.parse(read("scripts/data/implantacao-sequencia.json"));
const local = new Set(readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")));
check("sequencia: 14 ondas, 69 migrations executaveis + hotfix so-registro = 70 itens; 2 adiadas; todas existem em supabase/migrations", () => {
  eq(seq.ondas.map((o) => o.id), ["A", "B", "C", "D", "F", "G", "H1", "I", "P0", "J", "K", "L", "M", "N"]);
  const n = seq.ondas.reduce((a, o) => a + o.migrations.length, 0);
  eq(n, 69);
  eq(n + seq.jaEfetivaNaoReaplicar.length, 70);
  eq(seq.adiadas.map((a) => a.onda), ["E", "H2"]);
  for (const m of [...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration), ...seq.jaEfetivaNaoReaplicar]) assert(local.has(m), `${m} nao existe`);
});

check("sequencia: o watchdog (onda N, 20261212100000) e o ultimo item executavel e nao ha item irreversivel nas ondas executaveis", () => {
  const ult = seq.ondas.at(-1);
  eq(ult.id, "N");
  eq(ult.migrations, ["20261212100000_watchdog_project_resolution"]);
  const exec = seq.ondas.flatMap((o) => o.migrations);
  for (const m of exec) {
    const sql = read(`supabase/migrations/${m}.sql`).replace(/--[^\n]*/g, "");
    for (const cmd of dividirComandos(sql)) {
      for (const op of classificarComando(cmd)) assert(!op.irreversivel, `${m}: ${op.tipo} ${op.tabela ?? ""} irreversivel`);
    }
    assert(!/\b(drop\s+table|drop\s+column|truncate\s+table|drop\s+schema)\b/i.test(dividirComandos(sql).filter((c) => !/^(create|do)\b/i.test(c)).join(";")), `${m}: DDL destrutivo`);
  }
});

check("sequencia: as migrations de SLA (20261121177000) e H2 (20261123302000) estao so em `adiadas`, nunca em ondas", () => {
  const exec = new Set(seq.ondas.flatMap((o) => o.migrations));
  for (const a of seq.adiadas) assert(!exec.has(a.migration), `${a.migration} esta numa onda`);
  assert(seq.adiadas.some((a) => a.migration.startsWith("20261121177000")) && seq.adiadas.some((a) => a.migration.startsWith("20261123302000")));
});

check("sequencia: o hash cumulativo do historico por onda e deterministico (md5 de version_name ordenado)", () => {
  const h = (l) => createHash("md5").update(l.map((x) => `${x[0]}_${x[1]}`).sort((a, b) => (a < b ? -1 : 1)).join(",")).digest("hex");
  const base = [["20261119034721", "x"]];
  const a = h([...base, ["20261120100000", "y"]]);
  const b = h([["20261120100000", "y"], ...base]);
  eq(a, b);
  assert(a !== h(base));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
