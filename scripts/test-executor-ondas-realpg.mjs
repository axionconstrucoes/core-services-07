// Teste do EXECUTOR DE ONDAS em PostgreSQL 17 REAL LOCAL DESCARTAVEL (127.0.0.1:55434), banco acc_homolog_exec_* (apagado no fim).
// Nunca conecta em outro host. Exercita o MESMO codigo de producao do executor sobre o protocolo de consulta simples do driver "pg"
// (varios comandos numa chamada = transacao implicita), com migrations SINTETICAS: atomicidade (arquivo + registro), falha no meio,
// lock_timeout, timeout, versao duplicada, portao P0 do hotfix, retomada, guardas (marcador) e CLI em processo real.
// Sem ACC_REALPG_URL e PULADO (exit 0). Nao roda no CI.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOTFIX_STEM, avaliarGuardasPg, criarTransporteLocalPg, executarEnsaioAtomicidade, executarPlano, exigirMarcador, montarPlano, lerP0Sql,
} from "./implantacao/executor-ondas-lib.mjs";

const url = process.env.ACC_REALPG_URL;
if (!url) { console.log("PULADO: defina ACC_REALPG_URL e ACC_REALPG_PKG_DIR (PostgreSQL real local). Este teste nao roda no CI."); process.exit(0); }
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") { console.error("RECUSADO: so aceito 127.0.0.1:55434."); process.exit(2); }

const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dbName = `acc_homolog_exec_${Date.now().toString(36)}`;
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
const tmp = mkdtempSync(path.join(os.tmpdir(), "acc-exec-pg-"));
const dir = path.join(tmp, "m");
mkdirSync(dir);

let passed = 0; let failed = 0;
const check = async (name, fn) => { try { await fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 400)}`); } };
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };

const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`create database ${dbName}`);
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const outro = new pg.Client({ connectionString: dbUrl });
await outro.connect();

try {
  // plataforma mínima: histórico igual ao do Supabase; tabelas sintéticas de apoio
  await db.query(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    insert into supabase_migrations.schema_migrations (version, name) values ('20000101000000', 'base_um'), ('20000101000001', 'base_dois');
    create table public.alvo_lock (i int);`);
  const transporte = criarTransporteLocalPg(db, "pg local de teste");
  const P0_STUB = "select true as ok, 'stub' as corpo_md5_sem_cr";
  const estado = async () => (await db.query("select count(*)::int n, md5(string_agg(version || '_' || name, ',' order by version)) h from supabase_migrations.schema_migrations")).rows[0];
  const existe = async (t) => (await db.query("select to_regclass($1) is not null as e", [t])).rows[0].e;
  const S = (n, nome) => `2099010100000${n}_${nome}`;
  const escrever = (stem, sql) => writeFileSync(path.join(dir, `${stem}.sql`), sql);
  const seq = (ondas, extra = {}) => ({ jaEfetivaNaoReaplicar: [HOTFIX_STEM], adiadas: [], ondas, ...extra });
  const run = async (plano, extra = {}) => { const logs = []; const r = await executarPlano({ plano, transporte, p0Sql: P0_STUB, log: (l) => logs.push(l), ...extra }); return { ...r, logs }; };
  const base = await estado();

  await check("guardas com o banco real: HOMOLOG_DATABASE_URL local acc_homolog_* aprovado; marcador ausente recusa; presente aprova", async () => {
    const g = avaliarGuardasPg({ env: { HOMOLOG_DATABASE_URL: dbUrl }, exigirLocal: true });
    assert(g.info.kind === "local" && g.info.database === dbName);
    let recusou = false;
    try { await exigirMarcador(db); } catch (e) { recusou = e.codigo === "GUARDA"; }
    assert(recusou, "sem marcador deveria recusar");
    await db.query("create schema acc_homolog_marker");
    assert(await exigirMarcador(db));
  });

  await check("sucesso: 2 arquivos numa onda, cada um com o insert na MESMA chamada; histórico +2 e hash confere", async () => {
    escrever(S(1, "a_um"), "create table public.t_a1 (i int);\n-- comentário final sem ponto-e-vírgula");
    escrever(S(2, "a_dois"), "create table public.t_a2 (i int);\r\ninsert into public.t_a2 values (1)\r\n");
    const r = await run(montarPlano({ seq: seq([{ id: "A", nome: "a", migrations: [S(1, "a_um"), S(2, "a_dois")] }]), dir, ondas: ["A"] }));
    assert(r.ok && r.aplicados.length === 2, JSON.stringify(r.falha));
    assert(await existe("public.t_a1") && await existe("public.t_a2"));
    assert((await estado()).n === base.n + 2);
    assert(r.logs.some((l) => l.includes("onda A concluída") && l.includes("(confere)")));
  });

  await check("falha no meio do arquivo (DO com exceção depois de criar tabela): tabela desfeita, sem linha no histórico, para e não roda o seguinte", async () => {
    const antes = await estado();
    escrever(S(3, "b_ok"), "create table public.t_b1 (i int);");
    escrever(S(4, "b_falha"), "create table public.t_b2 (i int);\ninsert into public.t_b2 values (1);\ndo $$ begin raise exception 'FALHA_PROPOSITAL'; end $$;");
    escrever(S(5, "b_depois"), "create table public.t_b3 (i int);");
    const plano = montarPlano({ seq: seq([{ id: "W", nome: "w", migrations: [S(3, "b_ok"), S(4, "b_falha"), S(5, "b_depois")] }]), dir, ondas: ["W"] });
    const r = await run(plano);
    assert(!r.ok && r.falha.codigo === "FALHA_SQL" && r.falha.stem === S(4, "b_falha"), JSON.stringify(r.falha));
    assert(r.aplicados.join() === S(3, "b_ok"));
    assert(await existe("public.t_b1") && !(await existe("public.t_b2")) && !(await existe("public.t_b3")), "t_b1 aplicada; t_b2 desfeita; t_b3 nunca rodou");
    const dep = await estado();
    assert(dep.n === antes.n + 1, "só a b_ok foi registrada");
    assert(/não registrado/.test(r.falha.estado), r.falha.estado);
  });

  await check("retomada de prefixo depois de corrigir o arquivo: pula o já registrado, aplica o restante; sem --retomar recusa", async () => {
    escrever(S(4, "b_falha"), "create table public.t_b2 (i int);");
    const plano = montarPlano({ seq: seq([{ id: "W", nome: "w", migrations: [S(3, "b_ok"), S(4, "b_falha"), S(5, "b_depois")] }]), dir, ondas: ["W"] });
    assert((await run(plano)).falha.codigo === "JA_REGISTRADA");
    const r = await run(plano, { retomar: true });
    assert(r.ok && r.pulados.length === 1 && r.aplicados.length === 2, JSON.stringify(r.falha));
    assert(await existe("public.t_b2") && await existe("public.t_b3"));
  });

  await check("falha de sintaxe (SQLSTATE 42601) em arquivo único: tipo sql, nada registrado", async () => {
    const antes = await estado();
    escrever(S(6, "c_sintaxe"), "create tabela errada;");
    const r = await run(montarPlano({ seq: seq([{ id: "C", nome: "c", migrations: [S(6, "c_sintaxe")] }]), dir, ondas: ["C"] }), { retomar: false });
    assert(!r.ok && r.falha.codigo === "FALHA_SQL" && (await estado()).n === antes.n);
  });

  await check("lock_timeout 5s: ALTER TABLE espera o lock de outra sessão, falha com 55P03 e desfaz tudo", async () => {
    const antes = await estado();
    escrever(S(7, "d_lock"), "create table public.t_d1 (i int);\nalter table public.alvo_lock add column x int;");
    await outro.query("begin; lock table public.alvo_lock in access exclusive mode;");
    const t0 = Date.now();
    let r;
    try { r = await run(montarPlano({ seq: seq([{ id: "D", nome: "d", migrations: [S(7, "d_lock")] }]), dir, ondas: ["D"] })); }
    finally { await outro.query("rollback"); }
    const ms = Date.now() - t0;
    assert(!r.ok && r.falha.codigo === "FALHA_SQL" && /55P03|lock timeout|lock_timeout/i.test(r.falha.mensagem), JSON.stringify(r.falha));
    assert(ms >= 4500 && ms < 20000, `esperou ${ms} ms`);
    assert(!(await existe("public.t_d1")) && (await estado()).n === antes.n);
  });

  await check("versão duplicada no histórico (registrada por outra sessão): PK viola no último comando e o arquivo é desfeito", async () => {
    const antes = await estado();
    escrever(S(8, "e_dup"), "create table public.t_e1 (i int);");
    const plano = montarPlano({ seq: seq([{ id: "E", nome: "e", migrations: [S(8, "e_dup")] }]), dir, ondas: ["E"] });
    // simula corrida: a linha aparece entre o pré-voo e a execução
    const original = transporte.executar.bind(transporte);
    let injetou = false;
    const t2 = { descricao: "corrida", async executar(sql) { if (!injetou && sql.includes("create table public.t_e1")) { injetou = true; await db.query(`insert into supabase_migrations.schema_migrations (version, name) values ('${S(8, "e_dup").slice(0, 14)}', 'outro')`); } return original(sql); } };
    const r = await executarPlano({ plano, transporte: t2, p0Sql: P0_STUB, log: () => {} });
    assert(!r.ok && r.falha.codigo === "FALHA_SQL" && !(await existe("public.t_e1")), JSON.stringify(r.falha));
    await db.query(`delete from supabase_migrations.schema_migrations where name = 'outro'`);
    assert((await estado()).n === antes.n);
  });

  await check("hotfix só-registro: portão P0 recusa quando o corpo de record_risk_alert_action diverge (nada registrado)", async () => {
    await db.query("create function public.record_risk_alert_action(uuid, text, jsonb) returns void language sql as $$ select 1 $$");
    const antes = await estado();
    escrever(S(9, "f_onda_b"), "create table public.t_f1 (i int);");
    const plano = montarPlano({ seq: seq([{ id: "B", nome: "b", migrations: [S(9, "f_onda_b")] }]), dir, ondas: ["B"] });
    const r = await run(plano);
    assert(!r.ok && r.falha.stem === HOTFIX_STEM && /P0_GATE/.test(r.falha.mensagem), JSON.stringify(r.falha));
    assert((await estado()).n === antes.n + 1, "só o arquivo da onda B foi registrado; o hotfix não");
    assert(!(await db.query("select 1 from supabase_migrations.schema_migrations where name like 'hotfix%'")).rowCount);
  });

  await check("ensaio de atomicidade (4 casos descartáveis): tudo OK e histórico final igual ao inicial", async () => {
    const antes = await estado();
    const r = await executarEnsaioAtomicidade({ transporte, p0Sql: P0_STUB, log: () => {} });
    assert(r.ok, JSON.stringify(r.resultados.filter((x) => !x.ok)));
    assert(r.resultados.length === 4);
    const dep = await estado();
    assert(dep.h === antes.h && dep.n === antes.n && !(await db.query("select 1 from pg_namespace where nspname='acc_exec_ensaio'")).rowCount);
  });

  await check("P0 real: o arquivo scripts/sql/p0-verificar... roda no pg e devolve ok=false (corpo diferente) sem alterar nada", async () => {
    const r = await transporte.executar(`set transaction read only;\n${lerP0Sql(here).replace(/;\s*$/, "")};`);
    assert(r.linhas.length === 1 && r.linhas[0].ok === false && r.linhas[0].existe === true);
  });

  // ---- CLI em processo real contra o banco local
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ACC_REALPG_PKG_DIR: process.env.ACC_REALPG_PKG_DIR, HOMOLOG_DATABASE_URL: dbUrl };
  const cli = (args, e = {}) => spawnSync(process.execPath, [path.join(here, "implantacao", "executor-ondas.mjs"), ...args], { env: { ...env, ...e }, encoding: "utf8", timeout: 120000 });
  await check("CLI --alvo local --verificar: conecta com as guardas, lê o histórico e sai 1 (P0 não confere neste banco sintético); senha não aparece", async () => {
    const r = cli(["--alvo", "local", "--verificar"]);
    assert(r.status === 1 && /VERIFICAR/.test(r.stdout) && /histórico \d+ linhas/.test(r.stdout), r.stdout + r.stderr);
    const senha = decodeURIComponent(new URL(dbUrl).password);
    assert(!(r.stdout + r.stderr).includes(senha));
  });
  await check("CLI recusa o banco SEM marcador (exit 2) e com variável operacional (exit 2)", async () => {
    await admin.query(`create database ${dbName}_sm`);
    const u = new URL(dbUrl); u.pathname = `/${dbName}_sm`;
    try {
      const r = cli(["--alvo", "local", "--verificar"], { HOMOLOG_DATABASE_URL: u.toString() });
      assert(r.status === 2 && /marcador acc_homolog_marker ausente/.test(r.stderr), r.stderr + r.stdout);
    } finally { await admin.query(`drop database if exists ${dbName}_sm`); }
    const r2 = cli(["--alvo", "local", "--verificar"], { SUPABASE_SERVICE_ROLE_KEY: "x" });
    assert(r2.status === 2 && /variáveis do ambiente operacional/.test(r2.stderr), r2.stderr);
  });
} finally {
  await outro.end().catch(() => {});
  await db.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch((e) => console.log(`aviso: não apagou ${dbName}: ${e.message}`));
  await admin.end().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${passed} aprovados, ${failed} falhas`);
process.exit(failed ? 1 : 0);
