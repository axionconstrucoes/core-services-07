// Migration 20261122300000: o Expert oficial "quality-analyst" (Analista IA de Qualidade) é aceito em todos os pontos do banco
// que validam o id do Expert por lista fechada, sem enfraquecer a validação (id inventado continua recusado), de forma
// idempotente e sem tocar o hotfix P0. Replay de TODAS as migrations em PGlite (descartável, sem rede).
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-quality-expert-id-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
const MIGRATION = "20261122300000_quality_analyst_expert_id.sql";

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
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");
// Estado ANTES da migration nova (para provar o antes/depois).
for (const f of files.filter((x) => x < MIGRATION)) await db.exec(clean(f));

const P = "00000000-0000-4000-8000-0000000008a0";
const U = "00000000-0000-4000-8000-0000000008a1";
await db.query("insert into auth.users (id, email) values ($1, $2)", [U, "e1@x.test"]);
await db.query("insert into public.profiles (id, name, email, origin) values ($1, 'E1', 'e1@x.test', 'AXION_INTERNO') on conflict (id) do nothing", [U]);
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-E1', 'E1 (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U}', 'COLABORADOR', 'ACTIVE', 'ENGENHARIA');
`);
const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false)`);
const reserve = (expert) => db.query("select public.ai_consult_reserve_expert($1,$2,$3,$4) as r", [P, "ALERTA", "s", expert]);
const hotfixDef = async () => (await db.query("select md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_risk_alert_action'")).rows.map((r) => r.h).sort().join(",");

await db.query("update public.ai_consult_limits set per_user_day = 50, per_project_day = 200 where scope = 'DEFAULT'");
const hotfixBefore = await hotfixDef();

await check("ANTES: quality-analyst é recusado (INVALID_EXPERT) — prova de que a migration é necessária", async () => {
  await as(U);
  let msg = "";
  try { await reserve("quality-analyst"); } catch (e) { msg = String(e.message); }
  assert(msg.includes("INVALID_EXPERT"), `esperado INVALID_EXPERT, veio: ${msg}`);
});

await db.exec(clean(MIGRATION));

await check("DEPOIS: quality-analyst aceito na reserva do limite, com Expert registrado no consumo; demais Experts seguem aceitos", async () => {
  await as(U);
  for (const id of ["quality-analyst", "engineering-director", "legal-consultant", "ceo"]) await reserve(id);
  const rows = (await db.query("select expert_id from public.ai_consult_usage where user_id = $1", [U])).rows.map((r) => r.expert_id).sort();
  assert(rows.includes("quality-analyst") && rows.length === 4, JSON.stringify(rows));
});

await check("DEPOIS: id inventado continua recusado (a lista não foi relaxada)", async () => {
  await as(U);
  let msg = "";
  try { await reserve("axia"); } catch (e) { msg = String(e.message); }
  assert(msg.includes("INVALID_EXPERT"), msg);
  msg = "";
  try { await reserve("expert-inventado"); } catch (e) { msg = String(e.message); }
  assert(msg.includes("INVALID_EXPERT"), msg);
});

await check("DEPOIS: auditoria de consulta e variante service_role (ciclo) aceitam quality-analyst", async () => {
  await as(U);
  await db.query("select public.ai_consult_audit_record($1,'ALERTA','s','quality-analyst','pergunta',null,'[]'::jsonb,'OK',null,null,'{}'::jsonb,'fake',null,null,null)", [P]);
  const audit = (await db.query("select expert_id from public.ai_consult_audit where project_id = $1", [P])).rows;
  assert(audit.length === 1 && audit[0].expert_id === "quality-analyst", JSON.stringify(audit));
  await db.query("select public.ai_consult_reserve_for_actor($1,$2,'RISK_CYCLE','caso','quality-analyst')", [U, P]);
});

await check("DEPOIS: CHECKs das tabelas aceitam quality-analyst e continuam recusando outro id (caso de risco, e-mails, consultas por e-mail)", async () => {
  const defs = (await db.query(`select conrelid::regclass::text as t, pg_get_constraintdef(oid) as d from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace and pg_get_constraintdef(oid) like '%engineering-director%'`)).rows;
  assert(defs.length >= 4, `esperadas >= 4 constraints com a lista, vieram ${defs.length}`);
  for (const d of defs) assert(d.d.includes("quality-analyst"), `${d.t}: ${d.d.slice(0, 120)}`);
  const tables = new Set(defs.map((d) => d.t));
  for (const t of ["ai_consult_usage", "ai_consult_audit", "risk_alert_action_events", "alert_email_messages", "email_specialist_consultations"]) assert(tables.has(t) || tables.has(`public.${t}`), `constraint de ${t} não reescrita`);
  for (const d of defs) assert(!d.d.includes("axia"), "a AXIA nunca entra nas listas");
});

await check("IDEMPOTENTE: reexecutar a migration não duplica nem falha", async () => {
  await db.exec(clean(MIGRATION));
  const defs = (await db.query(`select pg_get_constraintdef(oid) as d from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace and pg_get_constraintdef(oid) like '%quality-analyst%'`)).rows;
  assert(defs.length >= 4);
  for (const d of defs) assert((d.d.match(/quality-analyst/g) ?? []).length === 1, `duplicado: ${d.d.slice(0, 160)}`);
});

await check("hotfix P0 (record_risk_alert_action) INTACTO e funções reescritas continuam SECURITY DEFINER com search_path vazio", async () => {
  assert((await hotfixDef()) === hotfixBefore, "a definição de record_risk_alert_action mudou");
  const fns = (await db.query("select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%quality-analyst%'")).rows;
  assert(fns.length >= 2, `esperadas >= 2 funções reescritas, vieram ${fns.length}`);
  for (const f of fns) {
    assert(f.prosecdef === true, `${f.proname} perdeu SECURITY DEFINER`);
    assert(JSON.stringify(f.proconfig ?? []).includes("search_path"), `${f.proname} perdeu search_path`);
  }
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
