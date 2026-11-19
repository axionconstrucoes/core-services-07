// Agendador do ACC (migration 20261118093000, PROPOSTA — NÃO aplicada em nenhum remoto) em PostgreSQL 17 DESCARTÁVEL
// (PGlite) com TODAS as migrations reexecutadas. pg_cron/pg_net/Vault não existem no PGlite: este teste cria STUBS mínimos de
// vault.decrypted_secrets, net.http_post/http_get e net._http_response para provar a lógica SQL do agendador:
// sem segredo => nada é chamado; disparo aceito (204) ≠ início ≠ conclusão; reconciliação de respostas; trava de sobreposição
// das rotas; rota SSMA com o CRON_SECRET; watchdog por motivo (falha de disparo, disparo sem início, início sem conclusão,
// job com falha, rota com falha, sem sucesso recente); contador de condição repetida; papéis sem acesso.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-scheduler-sql.mjs

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
const asService = async (fn) => { await db.exec("set role service_role;"); try { return await fn(); } finally { await db.exec("reset role;"); } };

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
const WEG = "00000000-0000-4000-8000-000000000001";
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'WEG','WEG','Cliente','Cidade','2026-01-01','2027-01-01') on conflict do nothing", [WEG]);

const hb = async (job) => (await q("select * from public.acc_scheduler_heartbeats where job = $1", [job]))[0];
const respond = (id, status, extra = {}) => db.query("insert into net._http_response (id,status_code,timed_out,error_msg) values ($1,$2,$3,$4)", [id, status, extra.timedOut ?? false, extra.error ?? null]);
const dispatch = async (job, inputs = "{}") => (await q(`select public.acc_scheduler_dispatch_workflow($1, $2::jsonb) as id`, [job, inputs]))[0].id;
const route = async (job) => (await q("select public.acc_scheduler_call_route($1) as id", [job]))[0].id;
const beat = (job, event, runId, conclusion = null) => asService(() => q("select public.acc_scheduler_record_heartbeat($1,$2,$3,1,$4)", [job, event, runId, conclusion]));
const openReasons = async (job) => (await q("select fingerprint from public.acc_system_health_incidents where status = 'OPEN' and fingerprint like $1 order by 1", [`scheduler:${job}:%`])).map((r) => r.fingerprint.split(":")[2]);
const back = (job, col, minutes) => db.query(`update public.acc_scheduler_heartbeats set ${col} = ${col} - ($2 || ' minutes')::interval where job = $1`, [job, String(minutes)]);

await check("sem segredos no Vault: nenhum disparo e nenhuma chamada de rota", async () => {
  eq(await dispatch("weekly-all", '{"phase":"all"}'), null, "dispatch");
  eq(await route("risk-alerts"), null, "rota riscos");
  eq(await route("ssma-notifications"), null, "rota SSMA");
  eq((await q("select count(*)::int n from net.requests"))[0].n, 0, "requests");
});

await db.exec(`insert into vault.decrypted_secrets values
  ('acc_github_actions_dispatch_token','tok-teste'), ('acc_risk_alerts_cron_secret','seg-riscos'), ('acc_cron_secret','seg-cron'), ('acc_app_base_url','https://acc.exemplo.invalid')`);

let ghId;
await check("disparo GitHub: endpoint workflow_dispatch, ref main, inputs e cabeçalhos", async () => {
  ghId = await dispatch("weekly-all", '{"phase":"all"}');
  const [r] = await q("select * from net.requests where id = $1", [ghId]);
  eq(r.url, "https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/weekly-schedule-email-ingestion.yml/dispatches", "url");
  eq(r.body, { ref: "main", inputs: { phase: "all" } }, "body");
  eq(r.headers.Authorization, "Bearer tok-teste", "auth");
});

await check("204 = disparo ACEITO apenas: sem início, sem conclusão, sem sucesso", async () => {
  await respond(ghId, 204);
  await q("select public.acc_scheduler_reconcile('weekly-all')");
  const h = await hb("weekly-all");
  eq([h.last_dispatch_http_status, h.last_started_at, h.last_finished_at, h.last_success_at, h.last_failure_code], [204, null, null, null, null], "estado");
});

await check("watchdog: disparo aceito sem início após a tolerância => DISPATCH_WITHOUT_START", async () => {
  await back("weekly-all", "last_dispatch_at", 20);
  await q("select public.acc_scheduler_watchdog()");
  ok((await openReasons("weekly-all")).includes("DISPATCH_WITHOUT_START"), "deveria abrir DISPATCH_WITHOUT_START");
});

await check("início real (run_id) resolve 'disparo sem início'; sem conclusão após max_run => STARTED_WITHOUT_FINISH", async () => {
  await beat("weekly-all", "started", 4242);
  eq(String((await hb("weekly-all")).last_started_run_id), "4242", "run_id");
  await q("select public.acc_scheduler_watchdog()");
  ok(!(await openReasons("weekly-all")).includes("DISPATCH_WITHOUT_START"), "deveria resolver");
  await back("weekly-all", "last_started_at", 40); await back("weekly-all", "last_dispatch_at", 40); // mantém a ordem disparo < início
  await q("select public.acc_scheduler_watchdog()");
  ok((await openReasons("weekly-all")).includes("STARTED_WITHOUT_FINISH"), "deveria abrir STARTED_WITHOUT_FINISH");
});

await check("conclusão success com o mesmo run_id: sucesso comprovado e incidentes resolvidos", async () => {
  await beat("weekly-all", "finished", 4242, "success");
  const h = await hb("weekly-all");
  eq([h.last_conclusion, String(h.last_finished_run_id)], ["success", "4242"], "conclusão");
  ok(h.last_success_at, "last_success_at");
  await q("select public.acc_scheduler_watchdog()");
  eq(await openReasons("weekly-all"), [], "sem incidentes");
});

await check("conclusão failure => JOB_FAILED; evento inválido é recusado", async () => {
  await beat("mpp-worker", "started", 7);
  await beat("mpp-worker", "finished", 7, "failure");
  await q("select public.acc_scheduler_watchdog()");
  ok((await openReasons("mpp-worker")).includes("JOB_FAILED"), "JOB_FAILED");
  eq((await hb("mpp-worker")).last_failure_code, "JOB_FAILURE", "código");
  ok(await err(beat("mpp-worker", "finished", 7, "ok")), "conclusão inválida");
  ok(await err(beat("mpp-worker", "dispatched", 7)), "evento inválido");
});

await check("GitHub 422 => DISPATCH_FAILED", async () => {
  const id = await dispatch("document-worker");
  await respond(id, 422);
  await q("select public.acc_scheduler_watchdog()");
  eq((await hb("document-worker")).last_failure_code, "DISPATCH_HTTP_422", "código");
  ok((await openReasons("document-worker")).includes("DISPATCH_FAILED"), "DISPATCH_FAILED");
});

let rId;
await check("rota de riscos: GET /api/cron/risk-alerts com o segredo DEDICADO e timeout de 290 s", async () => {
  rId = await route("risk-alerts");
  const [r] = await q("select * from net.requests where id = $1", [rId]);
  eq([r.method, r.url, r.headers.Authorization, r.timeout_milliseconds], ["GET", "https://acc.exemplo.invalid/api/cron/risk-alerts", "Bearer seg-riscos", 290000], "requisição");
});

await check("rota SSMA: GET /api/cron/ssma-notifications com o CRON_SECRET (não o de riscos)", async () => {
  const id = await route("ssma-notifications");
  const [r] = await q("select * from net.requests where id = $1", [id]);
  eq([r.url, r.headers.Authorization], ["https://acc.exemplo.invalid/api/cron/ssma-notifications", "Bearer seg-cron"], "requisição");
  await respond(id, 200);
});

await check("trava de sobreposição: sem resposta da chamada anterior, a rodada seguinte NÃO chama", async () => {
  eq(await route("risk-alerts"), null, "segunda chamada");
});

await check("rota 200: sucesso; próxima rodada volta a chamar", async () => {
  await respond(rId, 200);
  rId = await route("risk-alerts");
  ok(rId, "deveria chamar");
  ok((await hb("risk-alerts")).last_success_at, "last_success_at");
});

for (const [status, extra, code] of [[207, {}, "ROUTE_HTTP_207"], [401, {}, "ROUTE_HTTP_401"], [409, {}, "ROUTE_IN_FLIGHT"], [204, {}, "ROUTE_DISABLED"], [500, {}, "ROUTE_HTTP_500"], [null, { timedOut: true }, "TIMEOUT"], [null, { error: "conn refused" }, "NET_ERROR"]]) {
  await check(`rota ${status ?? JSON.stringify(extra)}: falha ${code} e incidente ROUTE_FAILURE`, async () => {
    await respond(rId, status, extra);
    rId = await route("risk-alerts");
    eq((await hb("risk-alerts")).last_failure_code, code, "código");
    await q("select public.acc_scheduler_watchdog()");
    ok((await openReasons("risk-alerts")).includes("ROUTE_FAILURE"), "ROUTE_FAILURE");
  });
}

await check("base URL não https: rota não é chamada", async () => {
  await respond(rId, 200);
  await db.exec("update vault.decrypted_secrets set decrypted_secret = 'http://inseguro.invalid' where name = 'acc_app_base_url'");
  eq(await route("risk-alerts"), null, "chamada");
  await db.exec("update vault.decrypted_secrets set decrypted_secret = 'https://acc.exemplo.invalid' where name = 'acc_app_base_url'");
});

await check("contador de condição repetida: incrementa no mesmo detalhe e reinicia na mudança", async () => {
  const bump = (d) => asService(() => q("select public.acc_bump_repeated_condition($1,'risk-alerts:real-send-readiness',$2, now())", [WEG, d]));
  await bump("A"); await bump("A"); await bump("A");
  eq((await q("select occurrences::int n from public.acc_repeated_conditions"))[0].n, 3, "3 ocorrências");
  await bump("B");
  eq((await q("select occurrences::int n, detail from public.acc_repeated_conditions"))[0], { n: 1, detail: "B" }, "reiniciado");
});

for (const role of ["anon", "authenticated", "service_role"]) {
  await check(`${role} não dispara workflow, não chama rota, não lê segredo nem roda o watchdog`, async () => {
    await db.exec(`set role ${role};`);
    try {
      for (const sql of ["select public.acc_scheduler_dispatch_workflow('weekly-all')", "select public.acc_scheduler_call_route('risk-alerts')", "select public.acc_scheduler_secret('acc_github_actions_dispatch_token')", "select public.acc_scheduler_watchdog()"]) {
        ok(/permission denied/i.test((await err(q(sql))) ?? ""), `${sql} deveria ser negado`);
      }
    } finally { await db.exec("reset role;"); }
  });
}

await check("anon/authenticated não leem heartbeats nem contadores, nem gravam heartbeat", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role};`);
    try {
      ok(/permission denied/i.test((await err(q("select * from public.acc_scheduler_heartbeats"))) ?? ""), `${role} heartbeats`);
      ok(/permission denied/i.test((await err(q("select * from public.acc_repeated_conditions"))) ?? ""), `${role} contadores`);
      ok(/permission denied/i.test((await err(q("select public.acc_scheduler_record_heartbeat('weekly-all','started',1,1,null)"))) ?? ""), `${role} heartbeat`);
    } finally { await db.exec("reset role;"); }
  }
});

console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
