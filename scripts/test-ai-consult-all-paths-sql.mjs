// Migration 20261120170000: limite de consultas de IA em TODOS os caminhos de Expert (EXPERT_PANEL, CURATION,
// RISK_CYCLE), Expert registrado no consumo, variante service_role do ciclo (p_actor_user_id explícito) e
// engineering-director aceito nos registros do caso de risco. Replay de TODAS as migrations em PGlite
// (descartável, sem rede).
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-ai-consult-all-paths-sql.mjs

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

const P = "00000000-0000-4000-8000-0000000007a0";
const P2 = "00000000-0000-4000-8000-0000000007b0";
const U = {
  A: "00000000-0000-4000-8000-0000000007a1", // membro ativo de P e P2
  B: "00000000-0000-4000-8000-0000000007a2", // membro ativo só de P
  OUT: "00000000-0000-4000-8000-0000000007a3", // sem vínculo com P
  INACTIVE: "00000000-0000-4000-8000-0000000007a4", // vínculo inativo em P
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `p3-${n}@x.test`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `P3 ${n}`, `p3-${n}@x.test`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-P3A', 'P3 A (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01'),
    ('${P2}', 'SIM-P3B', 'P3 B (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.A}', 'COLABORADOR', 'ACTIVE', 'ENGENHARIA'),
    ('${P2}', '${U.A}', 'COLABORADOR', 'ACTIVE', 'ENGENHARIA'),
    ('${P}', '${U.B}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.INACTIVE}', 'COLABORADOR', 'INACTIVE', 'PLANEJAMENTO');
`);

const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false)`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const limits = (perUser, perProject) => db.query("update public.ai_consult_limits set per_user_day = $1, per_project_day = $2 where scope = 'DEFAULT'", [perUser, perProject]);
const reset = () => db.query("delete from public.ai_consult_usage");
const reserveExpert = (pid, kind, expert, subject = "s") => db.query("select public.ai_consult_reserve_expert($1,$2,$3,$4) as r", [pid, kind, subject, expert]);
const reserveLegacy = (pid, kind, subject = "s") => db.query("select public.ai_consult_reserve($1,$2,$3) as r", [pid, kind, subject]);
const reserveActor = (actor, pid, kind, expert, subject = "caso") => db.query("select public.ai_consult_reserve_for_actor($1,$2,$3,$4,$5) as r", [actor, pid, kind, subject, expert]);
async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(code), `esperado ${code}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado erro ${code}, mas a operação passou`);
}

await check("Q1 novos tipos (EXPERT_PANEL, CURATION) aceitos com sessão; Expert registrado no consumo; tipos antigos continuam", async () => {
  await reset();
  await limits(20, 100);
  await as(U.A);
  await reserveExpert(P, "EXPERT_PANEL", "engineering-director", "painel");
  await reserveExpert(P, "CURATION", "planning-director", "evento-1");
  await reserveExpert(P, "CURATION", "ceo", "evento-1");
  await reserveLegacy(P, "ALERTA", "alerta-1");
  const rows = (await db.query("select kind, expert_id from public.ai_consult_usage where user_id = $1 order by created_at, kind", [U.A])).rows;
  assert(rows.length === 4, JSON.stringify(rows));
  assert(rows.some((r) => r.kind === "EXPERT_PANEL" && r.expert_id === "engineering-director"));
  assert(rows.filter((r) => r.kind === "CURATION").length === 2, "curadoria: 1 unidade por Expert chamado");
  assert(rows.some((r) => r.kind === "ALERTA" && r.expert_id === null));
});

await check("Q2 limite por usuário soma TODAS as obras e TODOS os caminhos (painel + curadoria + ciclo)", async () => {
  await reset();
  await limits(3, 100);
  await as(U.A);
  await reserveExpert(P, "EXPERT_PANEL", "legal-consultant");
  await reserveExpert(P2, "CURATION", "engineering-director");
  await reserveActor(U.A, P2, "RISK_CYCLE", "planning-director");
  await expectError(reserveExpert(P, "EXPERT_PANEL", "esg-director"), "AI_CONSULT_USER_LIMIT");
  await expectError(reserveActor(U.A, P, "RISK_CYCLE", "legal-consultant"), "AI_CONSULT_USER_LIMIT");
  await expectError(reserveLegacy(P2, "SSMA"), "AI_CONSULT_USER_LIMIT");
  const c = await one("select count(*)::int as n from public.ai_consult_usage where user_id = $1", [U.A]);
  assert(c.n === 3, `consumo gravado só até o limite (${c.n})`);
});

await check("Q3 limite por obra conta todos os usuários e caminhos (sessão e service_role)", async () => {
  await reset();
  await limits(50, 2);
  await as(U.A);
  await reserveExpert(P, "EXPERT_PANEL", "commercial-director");
  await reserveActor(U.B, P, "RISK_CYCLE", "engineering-director");
  await as(U.B);
  await expectError(reserveExpert(P, "CURATION", "ceo"), "AI_CONSULT_PROJECT_LIMIT");
  await expectError(reserveActor(U.A, P, "RISK_CYCLE", "ceo"), "AI_CONSULT_PROJECT_LIMIT");
  await as(U.A);
  await reserveExpert(P2, "EXPERT_PANEL", "commercial-director"); // outra obra segue livre
});

await check("Q4 variante service_role: usuário solicitante explícito, vínculo ATIVO exigido, só RISK_CYCLE, Expert obrigatório", async () => {
  await reset();
  await limits(20, 100);
  await as(null); // sem sessão (worker)
  await reserveActor(U.B, P, "RISK_CYCLE", "engineering-director", "caso-1");
  const row = await one("select user_id, kind, expert_id, subject_id from public.ai_consult_usage where subject_id = 'caso-1'");
  assert(row.user_id === U.B && row.kind === "RISK_CYCLE" && row.expert_id === "engineering-director", JSON.stringify(row));
  await expectError(reserveActor(null, P, "RISK_CYCLE", "ceo"), "AUTH_REQUIRED");
  await expectError(reserveActor(U.OUT, P, "RISK_CYCLE", "ceo"), "PROJECT_ACCESS_DENIED");
  await expectError(reserveActor(U.INACTIVE, P, "RISK_CYCLE", "ceo"), "PROJECT_ACCESS_DENIED");
  await expectError(reserveActor(U.B, P, "EXPERT_PANEL", "ceo"), "INVALID_KIND");
  await expectError(reserveActor(U.B, P, "RISK_CYCLE", null), "INVALID_EXPERT");
  await expectError(reserveActor(U.B, P, "RISK_CYCLE", "axia"), "INVALID_EXPERT");
});

await check("Q5 sessão não usa RISK_CYCLE nem Expert inválido; sem sessão = AUTH_REQUIRED; sem vínculo = PROJECT_ACCESS_DENIED", async () => {
  await reset();
  await as(U.A);
  await expectError(reserveExpert(P, "RISK_CYCLE", "ceo"), "INVALID_KIND");
  await expectError(reserveLegacy(P, "RISK_CYCLE"), "INVALID_KIND");
  await expectError(reserveExpert(P, "EXPERT_PANEL", "assistente-axia"), "INVALID_EXPERT");
  await expectError(reserveExpert(P, "OUTRO", "ceo"), "INVALID_KIND");
  await as(null);
  await expectError(reserveExpert(P, "EXPERT_PANEL", "ceo"), "AUTH_REQUIRED");
  await as(U.OUT);
  await expectError(reserveExpert(P, "EXPERT_PANEL", "ceo"), "PROJECT_ACCESS_DENIED");
  const c = await one("select count(*)::int as n from public.ai_consult_usage");
  assert(c.n === 0, "nenhuma recusa grava consumo");
});

await check("Q6 privilégios: for_actor só service_role; núcleo sem execução por nenhum papel da API; sessão só authenticated", async () => {
  const priv = async (role, fn) => (await one(`select has_function_privilege('${role}', '${fn}', 'execute') as ok`)).ok;
  const actor = "public.ai_consult_reserve_for_actor(uuid,uuid,text,text,text)";
  const core = "public.ai_consult_reserve_core(uuid,uuid,text,text,text)";
  const expert = "public.ai_consult_reserve_expert(uuid,text,text,text)";
  assert((await priv("service_role", actor)) === true, "service_role executa for_actor");
  assert((await priv("authenticated", actor)) === false && (await priv("anon", actor)) === false, "for_actor restrito");
  for (const role of ["anon", "authenticated", "service_role"]) assert((await priv(role, core)) === false, `núcleo exposto a ${role}`);
  assert((await priv("authenticated", expert)) === true && (await priv("anon", expert)) === false);
  assert((await priv("anon", "public.ai_consult_reserve(uuid,text,text)")) === false);
  // execução efetiva como authenticated é negada
  await as(U.A);
  await db.exec("set role authenticated");
  await expectError(reserveActor(U.A, P, "RISK_CYCLE", "ceo"), "permission denied");
});

await check("Q7 trava usuário → obra preservada no núcleo (mesma serialização da migration 20261120140000)", async () => {
  const { rows } = await db.query("select pg_get_functiondef('public.ai_consult_reserve_core(uuid,uuid,text,text,text)'::regprocedure) as def");
  const def = rows[0].def;
  const userLock = def.indexOf("'ai_consult:user:'");
  const projectLock = def.indexOf("'ai_consult:project:'");
  assert(userLock > 0 && projectLock > userLock, "ordem usuário → obra");
  assert(def.indexOf("pg_advisory_xact_lock") < def.indexOf("select count(*) into v_user_count"));
  for (const fn of ["ai_consult_reserve(uuid,text,text)", "ai_consult_reserve_expert(uuid,text,text,text)", "ai_consult_reserve_for_actor(uuid,uuid,text,text,text)"]) {
    const d = (await one(`select pg_get_functiondef('public.${fn}'::regprocedure) as def`)).def;
    assert(d.includes("ai_consult_reserve_core("), `${fn} delega ao núcleo único`);
  }
});

await check("Q8 caso de risco aceita engineering-director (eventos e mensagens); Expert desconhecido continua recusado", async () => {
  for (const [table, name] of [["risk_alert_action_events", "risk_alert_action_events_expert_id_check"], ["alert_email_messages", "alert_email_messages_expert_id_check"]]) {
    const defs = (await db.query("select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and pg_get_constraintdef(oid) ilike '%expert_id = ANY%'", [`public.${table}`])).rows;
    assert(defs.length === 1, `${table}: uma única lista de Experts aceitos (${defs.map((d) => d.conname).join(",")})`);
    assert(defs[0].conname === name && defs[0].def.includes("engineering-director") && defs[0].def.includes("planning-director"), JSON.stringify(defs[0]));
    assert(!defs[0].def.includes("axia"));
  }
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
