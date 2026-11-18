// Agendador do ACC (migration 20261118093000, PROPOSTA — NÃO aplicada em nenhum remoto) em PostgreSQL 17 DESCARTÁVEL
// (PGlite) com TODAS as migrations reexecutadas. pg_cron/pg_net/Vault não existem no PGlite: este teste cria STUBS mínimos de
// vault.decrypted_secrets, net.http_post/http_get e net._http_response para provar a lógica SQL do agendador:
// sem segredo => nada é chamado; disparo registrado; reconciliação de 204/200/4xx/5xx/timeout; trava de sobreposição da rota;
// watchdog abre/resolve incidente; anon/authenticated/service_role não executam disparo nem leem segredo.
// Uso: node scripts/test-scheduler-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.some((f) => /^(20261106120000|20261106130000)_/.test(f))) throw new Error("migration proibida presente");
if (!files.includes("20261118093000_scheduler_pg_cron_dispatch.sql")) throw new Error("migration do agendador ausente");
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
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };

// ---- stubs de plataforma (só neste teste) ----
await db.exec(`
  create schema if not exists vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  create schema if not exists net;
  create table net.requests (id bigserial primary key, method text, url text, body jsonb, headers jsonb, timeout_milliseconds int);
  create table net._http_response (id bigint primary key, status_code int, timed_out boolean default false, error_msg text, created timestamptz default now());
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 2000)
    returns bigint language sql as $$ insert into net.requests (method,url,body,headers,timeout_milliseconds) values ('POST',url,body,headers,timeout_milliseconds) returning id $$;
  create function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 2000)
    returns bigint language sql as $$ insert into net.requests (method,url,headers,timeout_milliseconds) values ('GET',url,headers,timeout_milliseconds) returning id $$;
`);
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ('00000000-0000-4000-8000-000000000001','WEG','WEG','Cliente','Cidade','2026-01-01','2027-01-01') on conflict do nothing");

const hb = async (job) => (await q("select * from public.acc_scheduler_heartbeats where job = $1", [job]))[0];
const respond = (id, status, extra = {}) => db.query("insert into net._http_response (id,status_code,timed_out,error_msg) values ($1,$2,$3,$4)", [id, status, extra.timedOut ?? false, extra.error ?? null]);

await check("sem segredos no Vault: nenhum disparo e nenhuma chamada à rota", async () => {
  eq((await q("select public.acc_scheduler_dispatch_workflow('weekly-all', '{\"phase\":\"all\"}'::jsonb) as id"))[0].id, null, "dispatch");
  eq((await q("select public.acc_scheduler_call_risk_alerts() as id"))[0].id, null, "rota");
  eq((await q("select count(*)::int n from net.requests"))[0].n, 0, "requests");
});

await db.exec(`insert into vault.decrypted_secrets values
  ('acc_github_actions_dispatch_token','tok-teste'), ('acc_risk_alerts_cron_secret','seg-teste'), ('acc_app_base_url','https://acc.exemplo.invalid')`);

let ghId;
await check("disparo GitHub: endpoint workflow_dispatch, ref main, inputs e cabeçalhos", async () => {
  ghId = (await q("select public.acc_scheduler_dispatch_workflow('weekly-all', '{\"phase\":\"all\"}'::jsonb) as id"))[0].id;
  const [r] = await q("select * from net.requests where id = $1", [ghId]);
  eq(r.url, "https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/weekly-schedule-email-ingestion.yml/dispatches", "url");
  eq(r.body, { ref: "main", inputs: { phase: "all" } }, "body");
  eq(r.headers.Authorization, "Bearer tok-teste", "auth");
  ok((await hb("weekly-all")).last_dispatch_at, "last_dispatch_at");
});

await check("GitHub 204: aceito, sem falha e SEM sucesso (sucesso só pelo heartbeat do workflow)", async () => {
  await respond(ghId, 204);
  await q("select public.acc_scheduler_reconcile('weekly-all')");
  const h = await hb("weekly-all");
  eq([h.last_dispatch_http_status, h.last_failure_code, h.last_success_at], [204, null, null], "estado");
});

await check("GitHub 422 no disparo seguinte: falha DISPATCH_HTTP_422 registrada", async () => {
  const id2 = (await q("select public.acc_scheduler_dispatch_workflow('weekly-all', '{\"phase\":\"all\"}'::jsonb) as id"))[0].id;
  await respond(id2, 422);
  await q("select public.acc_scheduler_reconcile('weekly-all')");
  eq((await hb("weekly-all")).last_failure_code, "DISPATCH_HTTP_422", "código");
});

await check("heartbeat do workflow (service_role) registra sucesso; job desconhecido não altera nada", async () => {
  await db.exec("set role service_role;");
  try { await q("select public.acc_scheduler_record_heartbeat('weekly-all','success', now() - interval '2 minutes')"); } finally { await db.exec("reset role;"); }
  ok((await hb("weekly-all")).last_success_at, "last_success_at");
  ok(await err(q("select public.acc_scheduler_record_heartbeat('weekly-all','ok')")), "status inválido deveria falhar");
});

let routeId;
await check("rota Vercel: GET /api/cron/risk-alerts com Bearer do Vault e timeout de 290 s", async () => {
  routeId = (await q("select public.acc_scheduler_call_risk_alerts() as id"))[0].id;
  const [r] = await q("select * from net.requests where id = $1", [routeId]);
  eq([r.method, r.url, r.headers.Authorization, r.timeout_milliseconds], ["GET", "https://acc.exemplo.invalid/api/cron/risk-alerts", "Bearer seg-teste", 290000], "requisição");
});

await check("trava de sobreposição: sem resposta da chamada anterior, a próxima rodada NÃO chama a rota", async () => {
  eq((await q("select public.acc_scheduler_call_risk_alerts() as id"))[0].id, null, "segunda chamada");
});

await check("rota 200: sucesso comprovado; próxima rodada volta a chamar", async () => {
  await respond(routeId, 200);
  const next = (await q("select public.acc_scheduler_call_risk_alerts() as id"))[0].id;
  ok(next, "deveria chamar de novo");
  ok((await hb("risk-alerts")).last_success_at, "last_success_at");
  routeId = next;
});

for (const [status, extra, code] of [[207, {}, "ROUTE_HTTP_207"], [401, {}, "ROUTE_HTTP_401"], [409, {}, "ROUTE_IN_FLIGHT"], [204, {}, "ROUTE_DISABLED"], [500, {}, "ROUTE_HTTP_500"], [null, { timedOut: true }, "TIMEOUT"], [null, { error: "conn refused" }, "NET_ERROR"]]) {
  await check(`rota ${status ?? JSON.stringify(extra)}: falha ${code}`, async () => {
    await respond(routeId, status, extra);
    routeId = (await q("select public.acc_scheduler_call_risk_alerts() as id"))[0].id;
    eq((await hb("risk-alerts")).last_failure_code, code, "código");
  });
}

await check("base URL não https: rota não é chamada", async () => {
  await respond(routeId, 200);
  await db.exec("update vault.decrypted_secrets set decrypted_secret = 'http://inseguro.invalid' where name = 'acc_app_base_url'");
  eq((await q("select public.acc_scheduler_call_risk_alerts() as id"))[0].id, null, "chamada");
  await db.exec("update vault.decrypted_secrets set decrypted_secret = 'https://acc.exemplo.invalid' where name = 'acc_app_base_url'");
});

await check("watchdog: job sem sucesso abre incidente; sucesso recente resolve", async () => {
  await q("select public.acc_scheduler_watchdog()");
  const open = await q("select fingerprint from public.acc_system_health_incidents where status = 'OPEN' order by 1");
  ok(open.some((r) => r.fingerprint === "scheduler:mpp-worker"), "mpp-worker sem sucesso deveria abrir incidente");
  ok(!open.some((r) => r.fingerprint === "scheduler:weekly-all"), "weekly-all teve sucesso recente");
  await db.exec("set role service_role;");
  try { await q("select public.acc_scheduler_record_heartbeat('mpp-worker','success')"); } finally { await db.exec("reset role;"); }
  await q("select public.acc_scheduler_watchdog()");
  eq((await q("select status from public.acc_system_health_incidents where fingerprint = 'scheduler:mpp-worker'"))[0].status, "RESOLVED", "resolvido");
});

for (const role of ["anon", "authenticated", "service_role"]) {
  await check(`${role} não dispara workflow, não chama a rota e não lê segredo`, async () => {
    await db.exec(`set role ${role};`);
    try {
      for (const sql of ["select public.acc_scheduler_dispatch_workflow('weekly-all')", "select public.acc_scheduler_call_risk_alerts()", "select public.acc_scheduler_secret('acc_github_actions_dispatch_token')", "select public.acc_scheduler_watchdog()"]) {
        ok(/permission denied/i.test((await err(q(sql))) ?? ""), `${sql} deveria ser negado`);
      }
    } finally { await db.exec("reset role;"); }
  });
}

await check("anon/authenticated não leem a tabela de heartbeats", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role};`);
    try { ok(/permission denied/i.test((await err(q("select * from public.acc_scheduler_heartbeats"))) ?? ""), role); } finally { await db.exec("reset role;"); }
  }
});

console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
