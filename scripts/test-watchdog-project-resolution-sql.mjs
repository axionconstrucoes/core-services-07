// Watchdog do agendador: resolucao do projeto dos incidentes (migration 20261212100000_watchdog_project_resolution) em PostgreSQL 17
// DESCARTAVEL (PGlite) com TODAS as migrations reexecutadas. Prova: sem o projeto fixo e com projetos -> usa o mais antigo (start_date, id);
// com o projeto fixo da WEG -> usa o fixo (producao inalterada); sem nenhum projeto -> retorna sem erro e sem incidente;
// a resolucao de incidentes continua funcionando; seguranca da funcao (security definer, search_path vazio, sem execute para os papeis).
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-watchdog-project-resolution-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (!files.includes("20261212100000_watchdog_project_resolution.sql")) throw new Error("migration do watchdog ausente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 260)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const WEG = "00000000-0000-4000-8000-000000000001";
const A = "00000000-0000-4000-8000-0000000000a1"; // mais novo
const B = "00000000-0000-4000-8000-0000000000b2"; // mais antigo (menor id no empate)
const C = "00000000-0000-4000-8000-0000000000c3"; // mesma data de B, id maior (desempate)
const addProject = (id, code, start) => db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,$2,$2,'Cliente','Cidade',$3,'2028-01-01')", [id, code, start]);
const incidents = () => q("select project_id, fingerprint, status from public.acc_system_health_incidents where source_type = 'SCHEDULER' order by fingerprint");
const wipe = () => db.exec("delete from public.acc_system_health_incidents where source_type = 'SCHEDULER'");
const fnDef = async () => (await q("select pg_get_functiondef(oid) as def from pg_proc where pronamespace = 'public'::regnamespace and proname = 'acc_scheduler_watchdog'"))[0].def;

await check("estado inicial: nenhum projeto e heartbeats sem sucesso (NO_RECENT_SUCCESS esperado)", async () => {
  eq((await q("select count(*)::int n from public.projects"))[0].n, 0, "projetos");
  ok((await q("select count(*)::int n from public.acc_scheduler_heartbeats where last_success_at is null"))[0].n > 0, "heartbeats");
});

await check("sem nenhum projeto: retorna sem erro e sem incidente", async () => {
  await q("select public.acc_scheduler_watchdog()");
  await q("select public.acc_scheduler_watchdog()");
  eq((await incidents()).length, 0, "incidentes");
});

await check("sem o projeto fixo e com projetos: usa o mais antigo (start_date, depois id)", async () => {
  await addProject(A, "PRJ-A", "2026-06-01");
  await addProject(C, "PRJ-C", "2026-01-01");
  await addProject(B, "PRJ-B", "2026-01-01");
  await q("select public.acc_scheduler_watchdog()");
  const inc = await incidents();
  ok(inc.length > 0, "deveria abrir incidentes NO_RECENT_SUCCESS");
  ok(inc.every((r) => r.project_id === B && r.status === "OPEN"), `esperado todos em ${B}: ${JSON.stringify([...new Set(inc.map((r) => r.project_id))])}`);
  ok(inc.every((r) => /:(NO_RECENT_SUCCESS|IMPORT_STALE)$/.test(r.fingerprint)), "motivo (IMPORT_STALE do gmail-sync desde 20261213100000)");
});

await check("segunda execucao e idempotente (sem duplicar incidentes)", async () => {
  const n1 = (await incidents()).length;
  await q("select public.acc_scheduler_watchdog()");
  eq((await incidents()).length, n1, "contagem");
});

await check("com o projeto fixo da WEG presente (mesmo sendo o mais novo): usa o fixo, como em producao", async () => {
  await addProject(WEG, "WEG", "2027-01-01");
  await wipe();
  await q("select public.acc_scheduler_watchdog()");
  const inc = await incidents();
  ok(inc.length > 0 && inc.every((r) => r.project_id === WEG && r.status === "OPEN"), `esperado todos no fixo: ${JSON.stringify([...new Set(inc.map((r) => r.project_id))])}`);
});

await check("resolucao de incidentes continua funcionando (sucesso recente => RESOLVED; motivo volta => reabre)", async () => {
  await db.exec("update public.acc_scheduler_heartbeats set last_success_at = now()");
  await q("select public.acc_scheduler_watchdog()");
  let inc = await incidents();
  ok(inc.length > 0 && inc.every((r) => r.status === "RESOLVED" && r.project_id === WEG), JSON.stringify(inc.slice(0, 2)));
  await db.exec("update public.acc_scheduler_heartbeats set last_success_at = null");
  await q("select public.acc_scheduler_watchdog()");
  inc = await incidents();
  ok(inc.every((r) => r.status === "OPEN" && r.project_id === WEG), "reabre quando o motivo volta a valer");
});

await check("sem o projeto fixo, abre e resolve incidentes no projeto mais antigo", async () => {
  await wipe();
  await db.exec(`delete from public.projects where id = '${WEG}'`);
  await q("select public.acc_scheduler_watchdog()");
  ok((await incidents()).every((r) => r.project_id === B && r.status === "OPEN"), "abertos no mais antigo");
  await db.exec("update public.acc_scheduler_heartbeats set last_success_at = now()");
  await q("select public.acc_scheduler_watchdog()");
  ok((await incidents()).every((r) => r.status === "RESOLVED"), "resolvidos");
});

await check("seguranca preservada: security definer, search_path vazio, sem execute para public/anon/authenticated/service_role", async () => {
  const [f] = await q("select prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and proname = 'acc_scheduler_watchdog'");
  ok(f.prosecdef === true, "security definer");
  ok(JSON.stringify(f.proconfig).includes("search_path="), `search_path: ${JSON.stringify(f.proconfig)}`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    eq((await q("select has_function_privilege($1, 'public.acc_scheduler_watchdog()', 'execute') as x", [role]))[0].x, false, `execute ${role}`);
  }
  ok(!(await fnDef()).includes(`v_project uuid := '${WEG}'`), "id fixo nao deve mais ser a atribuicao inicial");
});

await check("o rollback restaura o corpo anterior (projeto fixo) e e idempotente; reaplicar a migration volta ao novo", async () => {
  const rb = readFileSync(path.join(here, "..", "supabase", "rollbacks", "20261212100000_watchdog_project_resolution.rollback.sql"), "utf8").replace(/^﻿/, "");
  await db.exec(rb); await db.exec(rb);
  ok((await fnDef()).includes(`v_project uuid := '${WEG}'`), "corpo original");
  await db.exec(clean("20261212100000_watchdog_project_resolution.sql"));
  const d = await fnDef();
  ok(!d.includes(`v_project uuid := '${WEG}'`) && d.includes("order by p.start_date"), "corpo novo");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
await db.close();
process.exit(failed ? 1 : 0);
