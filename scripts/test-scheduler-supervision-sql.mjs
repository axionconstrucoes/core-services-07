// Supervisao do agendador (migration 20261213100000_scheduler_supervision_authorized_pauses) em PostgreSQL 17 DESCARTAVEL (PGlite)
// com TODAS as migrations reexecutadas e um STUB minimo do pg_cron (cron.job, cron.job_run_details, cron.alter_job). Prova:
// parada inesperada x autorizada x vencida; falhas consecutivas; importacao parada; comportamento anterior dos heartbeats preservado;
// o watchdog NUNCA reativa job; prova de vida (liveness) so para service_role; registro de pausas sem acesso pela API;
// scripts da janela (6-pausar registra, 7-retomar fecha) e rollback (preserva o registro). Nenhuma rede, nenhum banco real.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-scheduler-supervision-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const MIG = "20261213100000_scheduler_supervision_authorized_pauses.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (!files.includes(MIG)) throw new Error("migration da supervisao ausente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");
const doc = (f) => readFileSync(path.join(here, "..", "docs", "implantacao", "congelamento", f), "utf8").replace(/^﻿/, "");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 300)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };
const asRole = async (role, fn) => { await db.exec(`set role ${role};`); try { return await fn(); } finally { await db.exec("reset role;"); } };
const WEG = "00000000-0000-4000-8000-000000000001";
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'WEG','WEG','Cliente','Cidade','2026-01-01','2027-01-01') on conflict do nothing", [WEG]);
const watchdog = () => q("select public.acc_scheduler_watchdog()");
const open = async () => (await q("select fingerprint from public.acc_system_health_incidents where source_type = 'SCHEDULER' and status = 'OPEN' order by 1")).map((r) => r.fingerprint);
const has = async (fp) => (await open()).includes(fp);

await check("sem pg_cron no banco: watchdog roda sem erro (motivos dos heartbeats preservados) e liveness informa cron_available=false", async () => {
  await watchdog();
  ok(await has("scheduler:gmail-sync:NO_RECENT_SUCCESS"), "NO_RECENT_SUCCESS dos heartbeats deveria continuar abrindo");
  ok(await has("scheduler:gmail-sync:IMPORT_STALE"), "gmail-sync sem sucesso => IMPORT_STALE");
  const [l] = await q("select public.acc_scheduler_watchdog_liveness() as l");
  eq([l.l.cron_available, l.l.project_id, l.l.watchdog], [false, WEG, null], "liveness sem pg_cron");
});

// Stub do pg_cron (o real so existe no Supabase).
await db.exec(`
  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text, active boolean not null default true);
  create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz);
  create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null)
    returns void language plpgsql as $$ begin update cron.job set active = coalesce(alter_job.active, job.active) where jobid = job_id; end $$;
  insert into cron.job (jobname, active) select unnest(array['acc-risk-alerts','acc-ssma-notifications','acc-weekly-all','acc-document-worker','acc-mpp-worker','acc-gmail-sync','acc-ssma-drive','acc-construmanager','acc-diario','acc-watchdog','acc-cron-history-cleanup']), true;
`);
const jobs = async () => (await q("select jobname, active from cron.job order by jobid")).map((r) => `${r.jobname}=${r.active}`);
const setActive = (name, active) => db.query("update cron.job set active = $2 where jobname = $1", [name, active]);
const run = (name, status, minutesAgo) => db.query("insert into cron.job_run_details (jobid,status,start_time,end_time) select jobid,$2,now() - ($3 || ' minutes')::interval, now() - ($3 || ' minutes')::interval + interval '1 second' from cron.job where jobname = $1", [name, status, String(minutesAgo)]);
const cronReasons = async () => (await open()).filter((f) => /JOB_INACTIVE|JOB_PAUSED|CONSECUTIVE/.test(f));

await check("11 jobs ativos e sem falhas: nenhum incidente de pg_cron", async () => {
  await watchdog();
  eq(await cronReasons(), [], "incidentes de pg_cron");
});

await check("job desativado SEM pausa registrada (caso 24/11) => JOB_INACTIVE_UNAUTHORIZED; o watchdog NAO o reativa", async () => {
  await setActive("acc-risk-alerts", false);
  const before = await jobs();
  await watchdog();
  ok(await has("scheduler:risk-alerts:JOB_INACTIVE_UNAUTHORIZED"), "deveria abrir JOB_INACTIVE_UNAUTHORIZED");
  eq(await jobs(), before, "estado dos jobs alterado pelo watchdog");
  const [s] = await q("select summary from public.acc_system_health_incidents where fingerprint = 'scheduler:risk-alerts:JOB_INACTIVE_UNAUTHORIZED'");
  ok(/SEM pausa autorizada/.test(s.summary), s.summary);
});

await check("job desativado com pausa AUTORIZADA valida => JOB_PAUSED_AUTHORIZED (informativo), sem UNAUTHORIZED", async () => {
  await setActive("acc-mpp-worker", false);
  await db.query("insert into public.acc_scheduler_authorized_pauses (jobname, paused_by, reason, expires_at) values ('acc-mpp-worker','reynaldo@axion.com.br','manutencao do worker', now() + interval '2 hours')");
  await watchdog();
  ok(await has("scheduler:mpp-worker:JOB_PAUSED_AUTHORIZED"), "deveria registrar JOB_PAUSED_AUTHORIZED");
  ok(!(await has("scheduler:mpp-worker:JOB_INACTIVE_UNAUTHORIZED")), "nao pode ser inesperada");
});

await check("pausa autorizada VENCIDA => JOB_INACTIVE_AUTHORIZED_EXPIRED (e a informativa e resolvida)", async () => {
  await db.query("update public.acc_scheduler_authorized_pauses set authorized_at = now() - interval '5 hours', expires_at = now() - interval '1 minute' where jobname = 'acc-mpp-worker'");
  await watchdog();
  ok(await has("scheduler:mpp-worker:JOB_INACTIVE_AUTHORIZED_EXPIRED"), "deveria abrir EXPIRED");
  ok(!(await has("scheduler:mpp-worker:JOB_PAUSED_AUTHORIZED")), "informativa deveria ser resolvida");
});

await check("job reativado (por humano) => incidentes de inatividade resolvidos automaticamente", async () => {
  await setActive("acc-risk-alerts", true);
  await setActive("acc-mpp-worker", true);
  await db.query("update public.acc_scheduler_authorized_pauses set resumed_at = now(), resumed_by = 'teste' where resumed_at is null");
  await watchdog();
  eq(await cronReasons(), [], "incidentes de pg_cron abertos");
});

await check("CONSECUTIVE_FAILURES: 3 ultimas execucoes concluidas falharam (running ignorado); sucesso mais recente resolve", async () => {
  await run("acc-diario", "succeeded", 40);
  await run("acc-diario", "failed", 30);
  await run("acc-diario", "failed", 20);
  await watchdog();
  ok(!(await has("scheduler:diario:CONSECUTIVE_FAILURES")), "2 falhas nao bastam");
  await run("acc-diario", "failed", 10);
  await run("acc-diario", "running", 1);
  await watchdog();
  ok(await has("scheduler:diario:CONSECUTIVE_FAILURES"), "3 falhas seguidas deveriam abrir");
  await run("acc-diario", "succeeded", 0);
  await watchdog();
  ok(!(await has("scheduler:diario:CONSECUTIVE_FAILURES")), "sucesso deveria resolver");
});

await check("IMPORT_STALE: gmail-sync com sucesso ha 3 h abre; sucesso recente resolve", async () => {
  await db.query("update public.acc_scheduler_heartbeats set last_success_at = now() - interval '3 hours' where job = 'gmail-sync'");
  await watchdog();
  ok(await has("scheduler:gmail-sync:IMPORT_STALE"), "deveria abrir");
  await db.query("update public.acc_scheduler_heartbeats set last_success_at = now() - interval '5 minutes' where job = 'gmail-sync'");
  await watchdog();
  ok(!(await has("scheduler:gmail-sync:IMPORT_STALE")), "deveria resolver");
  ok(!(await has("scheduler:gmail-sync:NO_RECENT_SUCCESS")), "NO_RECENT_SUCCESS original tambem resolvido (comportamento preservado)");
});

await check("liveness: ultimo sucesso do acc-watchdog, estado dos jobs e pausas; so service_role executa", async () => {
  await run("acc-watchdog", "succeeded", 4);
  await run("acc-watchdog", "failed", 1);
  await db.query("insert into public.acc_scheduler_authorized_pauses (jobname, paused_by, reason, expires_at) values ('acc-diario','reynaldo@axion.com.br','teste', now() + interval '1 hour')");
  const l = await asRole("service_role", async () => (await q("select public.acc_scheduler_watchdog_liveness() as l"))[0].l);
  eq([l.cron_available, l.project_id, l.watchdog.jobname, l.watchdog.active, l.watchdog.last_status], [true, WEG, "acc-watchdog", true, "failed"], "liveness");
  ok(Date.now() - Date.parse(l.watchdog.last_success_at) < 6 * 60_000, `last_success_at ${l.watchdog.last_success_at}`);
  eq(l.jobs.length, 11, "jobs");
  const d = l.jobs.find((j) => j.jobname === "acc-diario");
  eq([d.pause_open, Boolean(d.pause_expires_at)], [true, true], "pausa do diario");
  for (const role of ["anon", "authenticated"]) {
    eq((await q("select has_function_privilege($1, 'public.acc_scheduler_watchdog_liveness()', 'execute') as x", [role]))[0].x, false, `execute ${role}`);
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    eq((await q("select has_function_privilege($1, 'public.acc_scheduler_watchdog()', 'execute') as x", [role]))[0].x, false, `watchdog execute ${role}`);
  }
  await db.query("update public.acc_scheduler_authorized_pauses set resumed_at = now() where jobname = 'acc-diario' and resumed_at is null");
});

await check("registro de pausas: RLS ligada; anon/authenticated sem leitura/escrita; service_role le/insere; sem DELETE; 1 pausa aberta por job", async () => {
  const [t] = await q("select relrowsecurity from pg_class where oid = 'public.acc_scheduler_authorized_pauses'::regclass");
  eq(t.relrowsecurity, true, "RLS");
  for (const role of ["anon", "authenticated"]) {
    ok(await asRole(role, () => err(q("select * from public.acc_scheduler_authorized_pauses"))), `${role} leu`);
    ok(await asRole(role, () => err(q("insert into public.acc_scheduler_authorized_pauses (jobname,paused_by,reason) values ('acc-x','a','b')"))), `${role} inseriu`);
  }
  await asRole("service_role", () => q("insert into public.acc_scheduler_authorized_pauses (jobname,paused_by,reason) values ('acc-construmanager','reynaldo@axion.com.br','teste service_role')"));
  ok(await asRole("service_role", () => err(q("delete from public.acc_scheduler_authorized_pauses"))), "service_role apagou registro");
  ok(await err(q("insert into public.acc_scheduler_authorized_pauses (jobname,paused_by,reason) values ('acc-construmanager','x','segunda aberta')")), "duas pausas abertas para o mesmo job");
  ok(await err(q("insert into public.acc_scheduler_authorized_pauses (jobname,paused_by,reason,authorized_at,expires_at) values ('acc-diario','x','y', now(), now() - interval '1 hour')")), "vencimento antes da autorizacao");
  await db.query("update public.acc_scheduler_authorized_pauses set resumed_at = now() where resumed_at is null");
});

await check("janela: 6-pausar registra pausas autorizadas (vencimento 3 h) => so JOB_PAUSED_AUTHORIZED; 7-retomar restaura e fecha as pausas", async () => {
  await db.exec("delete from cron.job_run_details");
  const antes = await jobs();
  await db.exec(doc("6-pg-cron-pausar.sql"));
  eq((await q("select count(*)::int n from cron.job where active"))[0].n, 0, "jobs ativos apos pausar");
  const pauses = await q("select jobname, expires_at - authorized_at as janela from public.acc_scheduler_authorized_pauses where resumed_at is null order by jobname");
  eq(pauses.length, 11, "pausas abertas");
  await db.exec(doc("6-pg-cron-pausar.sql")); // 2a vez: nada duplicado
  eq((await q("select count(*)::int n from public.acc_scheduler_authorized_pauses where resumed_at is null"))[0].n, 11, "pausas abertas apos repetir");
  await watchdog();
  const r = await cronReasons();
  ok(r.length === 11 && r.every((f) => f.endsWith(":JOB_PAUSED_AUTHORIZED")), `esperado so JOB_PAUSED_AUTHORIZED: ${r.join(",")}`);
  await db.exec(doc("7-pg-cron-retomar.sql"));
  eq(await jobs(), antes, "jobs restaurados");
  eq((await q("select count(*)::int n from public.acc_scheduler_authorized_pauses where resumed_at is null"))[0].n, 0, "pausas fechadas");
  await watchdog();
  eq(await cronReasons(), [], "incidentes de pg_cron apos retomar");
});

await check("janela ESQUECIDA (24/11): pausar sem retomar e pausa vencida => JOB_INACTIVE_AUTHORIZED_EXPIRED em todos os jobs", async () => {
  await db.exec(doc("6-pg-cron-pausar.sql"));
  await db.query("update public.acc_scheduler_authorized_pauses set authorized_at = now() - interval '4 hours', expires_at = now() - interval '1 hour' where resumed_at is null");
  await watchdog();
  eq((await cronReasons()).filter((f) => f.endsWith(":JOB_INACTIVE_AUTHORIZED_EXPIRED")).length, 11, "vencidas");
  await db.exec(doc("7-pg-cron-retomar.sql"));
});

await check("rollback restaura o corpo anterior (sem supervisao do pg_cron), remove a liveness, PRESERVA o registro; reaplicar volta", async () => {
  const total = (await q("select count(*)::int n from public.acc_scheduler_authorized_pauses"))[0].n;
  const rb = readFileSync(path.join(here, "..", "supabase", "rollbacks", MIG.replace(/\.sql$/, ".rollback.sql")), "utf8").replace(/^﻿/, "");
  await db.exec(rb); await db.exec(rb);
  const def = (await q("select pg_get_functiondef('public.acc_scheduler_watchdog()'::regprocedure) d"))[0].d;
  ok(!def.includes("JOB_INACTIVE_UNAUTHORIZED") && def.includes("order by p.start_date"), "corpo anterior");
  eq((await q("select to_regprocedure('public.acc_scheduler_watchdog_liveness()') is null x"))[0].x, true, "liveness removida");
  eq((await q("select count(*)::int n from public.acc_scheduler_authorized_pauses"))[0].n, total, "registro preservado");
  await db.exec(clean(MIG));
  ok((await q("select pg_get_functiondef('public.acc_scheduler_watchdog()'::regprocedure) d"))[0].d.includes("JOB_INACTIVE_UNAUTHORIZED"), "corpo novo");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
await db.close();
process.exit(failed ? 1 : 0);
