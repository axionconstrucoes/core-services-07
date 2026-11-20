// Frente N6 — migration 20261121150000_ai_consult_governance: curadoria automática (AUTOMATIC_CURATION) só pela
// variante service_role com solicitante explícito; pré-verificação somente leitura; orçamento monetário DESATIVADO
// por padrão (e funcional quando a Diretoria ativar); limites vigentes intactos; nenhuma função de estorno.
// Replay de TODAS as migrations em PGlite (descartável, sem rede).
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-ai-governance-n6-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 300)}`);
    failed += 1;
  } finally {
    await db.exec("reset role");
  }
}

const db = new PGlite();
await db.exec(platform);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));

const P = "00000000-0000-4000-8000-0000000016a0";
const P2 = "00000000-0000-4000-8000-0000000016b0";
const U = {
  A: "00000000-0000-4000-8000-0000000016a1", // membro ativo de P e P2
  B: "00000000-0000-4000-8000-0000000016a2", // membro ativo só de P
  OUT: "00000000-0000-4000-8000-0000000016a3", // sem vínculo
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `n6-${n}@x.test`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `N6 ${n}`, `n6-${n}@x.test`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-N6A', 'N6 A (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01'),
    ('${P2}', 'SIM-N6B', 'N6 B (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.A}', 'COLABORADOR', 'ACTIVE', 'ENGENHARIA'),
    ('${P2}', '${U.A}', 'COLABORADOR', 'ACTIVE', 'ENGENHARIA'),
    ('${P}', '${U.B}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO');
`);

const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false)`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const reset = () => db.query("delete from public.ai_consult_usage");
const usage = async () => (await one("select count(*)::int as n from public.ai_consult_usage")).n;
const reserveExpert = (pid, kind, expert, subject = "s") => db.query("select public.ai_consult_reserve_expert($1,$2,$3,$4) as r", [pid, kind, subject, expert]);
const reserveLegacy = (pid, kind, subject = "s") => db.query("select public.ai_consult_reserve($1,$2,$3) as r", [pid, kind, subject]);
const reserveActor = (actor, pid, kind, expert, subject = "fonte") => db.query("select public.ai_consult_reserve_for_actor($1,$2,$3,$4,$5) as r", [actor, pid, kind, subject, expert]);
const precheck = (pid) => db.query("select public.ai_consult_precheck($1) as r", [pid]);
async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(code), `esperado ${code}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado erro ${code}, mas a operação passou`);
}
const setBudget = (sql, params = []) => db.query(`update public.ai_consult_budget_settings set ${sql} where scope = 'DEFAULT'`, params);
const disableBudget = () =>
  setBudget(
    "enabled = false, estimated_cost_per_call_usd = null, per_user_day_usd = null, per_user_month_usd = null, per_project_day_usd = null, per_project_month_usd = null, global_day_usd = null, global_month_usd = null, decision_reference = null"
  );

await check("N1 limites vigentes intactos (20 por usuário/dia, 100 por obra/dia) — N6 não altera política", async () => {
  const row = await one("select per_user_day, per_project_day from public.ai_consult_limits where scope = 'DEFAULT'");
  assert(row.per_user_day === 20 && row.per_project_day === 100, JSON.stringify(row));
});

await check("N2 AUTOMATIC_CURATION: só via service_role com solicitante explícito e vínculo ATIVO; Expert registrado", async () => {
  await reset();
  await as(null);
  await reserveActor(U.B, P, "AUTOMATIC_CURATION", "legal-consultant", "FONTE_CLIENTE:x");
  const row = await one("select user_id, kind, expert_id from public.ai_consult_usage where subject_id = 'FONTE_CLIENTE:x'");
  assert(row.user_id === U.B && row.kind === "AUTOMATIC_CURATION" && row.expert_id === "legal-consultant", JSON.stringify(row));
  await expectError(reserveActor(null, P, "AUTOMATIC_CURATION", "ceo"), "AUTH_REQUIRED");
  await expectError(reserveActor(U.OUT, P, "AUTOMATIC_CURATION", "ceo"), "PROJECT_ACCESS_DENIED");
  await expectError(reserveActor(U.B, P, "CURATION", "ceo"), "INVALID_KIND");
  await reserveActor(U.B, P, "RISK_CYCLE", "ceo"); // ciclo de risco preservado
});

await check("N3 sessão NÃO usa AUTOMATIC_CURATION (nem RISK_CYCLE); recusas não gravam consumo", async () => {
  await reset();
  await as(U.A);
  await expectError(reserveExpert(P, "AUTOMATIC_CURATION", "ceo"), "INVALID_KIND");
  await expectError(reserveLegacy(P, "AUTOMATIC_CURATION"), "INVALID_KIND");
  await expectError(reserveExpert(P, "RISK_CYCLE", "ceo"), "INVALID_KIND");
  assert((await usage()) === 0);
});

await check("N4 curadoria automática conta no MESMO limite por usuário (todas as obras) e por obra", async () => {
  await reset();
  await db.query("update public.ai_consult_limits set per_user_day = 2, per_project_day = 100 where scope = 'DEFAULT'");
  try {
    await as(U.A);
    await reserveExpert(P2, "EXPERT_PANEL", "commercial-director");
    await as(null);
    await reserveActor(U.A, P, "AUTOMATIC_CURATION", "legal-consultant");
    await expectError(reserveActor(U.A, P, "AUTOMATIC_CURATION", "ceo"), "AI_CONSULT_USER_LIMIT");
  } finally {
    await db.query("update public.ai_consult_limits set per_user_day = 20, per_project_day = 100 where scope = 'DEFAULT'");
  }
});

await check("N5 pré-verificação: somente leitura (não grava), recusa quem esgotou o limite, exige sessão e vínculo", async () => {
  await reset();
  await db.query("update public.ai_consult_limits set per_user_day = 1, per_project_day = 100 where scope = 'DEFAULT'");
  try {
    await as(U.A);
    const ok = await precheck(P);
    assert(ok.rows[0].r.remaining_user === 1, JSON.stringify(ok.rows[0].r));
    await precheck(P);
    assert((await usage()) === 0, "pré-verificação nunca grava consumo");
    await reserveExpert(P, "EXPERT_PANEL", "esg-director");
    await expectError(precheck(P2), "AI_CONSULT_USER_LIMIT");
    await as(U.OUT);
    await expectError(precheck(P), "PROJECT_ACCESS_DENIED");
    await as(null);
    await expectError(precheck(P), "AUTH_REQUIRED");
  } finally {
    await db.query("update public.ai_consult_limits set per_user_day = 20, per_project_day = 100 where scope = 'DEFAULT'");
  }
});

await check("N6 orçamento monetário DESATIVADO por padrão: chave enabled=false, tetos nulos, nenhuma estimativa gravada", async () => {
  await reset();
  const row = await one("select * from public.ai_consult_budget_settings where scope = 'DEFAULT'");
  assert(row.enabled === false, "enabled deve nascer false");
  for (const col of ["estimated_cost_per_call_usd", "per_user_day_usd", "per_user_month_usd", "per_project_day_usd", "per_project_month_usd", "global_day_usd", "global_month_usd", "decision_reference"]) {
    assert(row[col] === null, `${col} deve nascer nulo`);
  }
  await as(U.A);
  await reserveExpert(P, "EXPERT_PANEL", "commercial-director");
  const u = await one("select estimated_cost_micros from public.ai_consult_usage limit 1");
  assert(u.estimated_cost_micros === null);
});

await check("N7 ativar exige decisão registrada e estimativa por chamada (constraints)", async () => {
  await expectError(setBudget("enabled = true, estimated_cost_per_call_usd = 0.05"), "ai_consult_budget_settings_enable_requires_decision");
  await expectError(setBudget("enabled = true, decision_reference = 'Ata X'"), "ai_consult_budget_settings_enable_requires_estimate");
  await expectError(setBudget("per_user_day_usd = -1"), "check");
  const row = await one("select enabled from public.ai_consult_budget_settings where scope = 'DEFAULT'");
  assert(row.enabled === false);
});

await check("N8 opção funcional (simulação local): teto por usuário/dia em US$ recusa com AI_CONSULT_BUDGET_USER_DAY", async () => {
  await reset();
  try {
    await setBudget("enabled = true, estimated_cost_per_call_usd = 0.40, per_user_day_usd = 1.00, decision_reference = 'SIMULACAO DE TESTE'");
    await as(U.A);
    await reserveExpert(P, "EXPERT_PANEL", "legal-consultant");
    await reserveExpert(P2, "EXPERT_PANEL", "legal-consultant");
    await expectError(reserveExpert(P, "EXPERT_PANEL", "ceo"), "AI_CONSULT_BUDGET_USER_DAY");
    const rows = (await db.query("select estimated_cost_micros from public.ai_consult_usage")).rows;
    assert(rows.length === 2 && rows.every((r) => Number(r.estimated_cost_micros) === 400000), JSON.stringify(rows));
  } finally {
    await disableBudget();
  }
});

await check("N9 opção funcional (simulação local): tetos por obra/dia e global/mês; service_role também é contado", async () => {
  await reset();
  try {
    await setBudget("enabled = true, estimated_cost_per_call_usd = 0.50, per_project_day_usd = 1.00, global_month_usd = 1.50, decision_reference = 'SIMULACAO DE TESTE'");
    await as(U.A);
    await reserveExpert(P, "EXPERT_PANEL", "legal-consultant");
    await as(null);
    await reserveActor(U.B, P, "AUTOMATIC_CURATION", "ceo");
    await expectError(reserveActor(U.B, P, "RISK_CYCLE", "ceo"), "AI_CONSULT_BUDGET_PROJECT_DAY");
    await as(U.A);
    await reserveExpert(P2, "EXPERT_PANEL", "legal-consultant");
    await expectError(reserveExpert(P2, "EXPERT_PANEL", "esg-director"), "AI_CONSULT_BUDGET_GLOBAL_MONTH");
  } finally {
    await disableBudget();
  }
  const row = await one("select enabled from public.ai_consult_budget_settings where scope = 'DEFAULT'");
  assert(row.enabled === false, "estado padrão restaurado (desligado)");
});

await check("N10 sem estorno: nenhuma função de devolução de unidade; authenticated não apaga/edita consumo nem lê/edita o orçamento", async () => {
  const fns = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname ilike 'ai_consult%'")).rows.map((r) => r.proname);
  assert(!fns.some((f) => /refund|estorno|release|devol|undo|cancel/i.test(f)), fns.join(","));
  const priv = async (role, table, p) => (await one(`select has_table_privilege('${role}', '${table}', '${p}') as ok`)).ok;
  for (const p of ["DELETE", "UPDATE", "INSERT"]) assert((await priv("authenticated", "public.ai_consult_usage", p)) === false, `authenticated ${p} em ai_consult_usage`);
  for (const p of ["SELECT", "UPDATE"]) assert((await priv("authenticated", "public.ai_consult_budget_settings", p)) === false, `authenticated ${p} no orçamento`);
  assert((await priv("anon", "public.ai_consult_budget_settings", "SELECT")) === false);
  const fpriv = async (role, fn) => (await one(`select has_function_privilege('${role}', '${fn}', 'execute') as ok`)).ok;
  assert((await fpriv("authenticated", "public.ai_consult_precheck(uuid)")) === true);
  assert((await fpriv("anon", "public.ai_consult_precheck(uuid)")) === false);
  assert((await fpriv("authenticated", "public.ai_consult_reserve_for_actor(uuid,uuid,text,text,text)")) === false);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert((await fpriv(role, "public.ai_consult_reserve_core(uuid,uuid,text,text,text)")) === false, `núcleo exposto a ${role}`);
  }
});

await check("N11 trava usuário → obra preservada no núcleo reescrito", async () => {
  const def = (await one("select pg_get_functiondef('public.ai_consult_reserve_core(uuid,uuid,text,text,text)'::regprocedure) as def")).def;
  const userLock = def.indexOf("'ai_consult:user:'");
  const projectLock = def.indexOf("'ai_consult:project:'");
  assert(userLock > 0 && projectLock > userLock, "ordem usuário → obra");
  assert(def.indexOf("pg_advisory_xact_lock") < def.indexOf("select count(*) into v_user_count"));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
