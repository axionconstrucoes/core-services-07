// Migration 20261120120000: ENCAMINHAR ação corretiva SSMA (ssma_corrective_action_forward) e limite diário de consultas de
// IA (ai_consult_reserve). Replay de TODAS as migrations em PGlite (descartável, sem rede).
//
// Uso: node scripts/test-ssma-forward-and-consult-limits-sql.mjs

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
  }
}

const db = new PGlite();
await db.exec(platform);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));

const P = "00000000-0000-4000-8000-0000000000d0";
const P2 = "00000000-0000-4000-8000-0000000000e0";
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000000d1",
  RESP: "00000000-0000-4000-8000-0000000000d2",
  GESTOR: "00000000-0000-4000-8000-0000000000d3",
  LEITURA: "00000000-0000-4000-8000-0000000000d4",
  COLAB2: "00000000-0000-4000-8000-0000000000d5",
  OUTSIDER: "00000000-0000-4000-8000-0000000000d6",
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `s${n}@x.test`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `S${n}`, `s${n}@x.test`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-SSMA', 'SSMA (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01'),
    ('${P2}', 'SIM-SSMA2', 'SSMA 2 (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'SSMA/ESG'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'SSMA/ESG'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'SSMA/ESG'),
    ('${P}', '${U.LEITURA}', 'LEITURA', 'ACTIVE', 'SSMA/ESG'),
    ('${P}', '${U.COLAB2}', 'COLABORADOR', 'ACTIVE', 'SSMA/ESG'),
    ('${P2}', '${U.OUTSIDER}', 'ADMINISTRADOR', 'ACTIVE', 'SSMA/ESG'),
    ('${P2}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'SSMA/ESG');
`);

let seq = 0;
async function newSsmaAction({ linkSla = false } = {}) {
  seq += 1;
  const rec = `00000000-0000-4000-8000-0000000003${String(seq).padStart(2, "0")}`;
  const act = `00000000-0000-4000-8000-0000000004${String(seq).padStart(2, "0")}`;
  await db.query(
    "insert into public.ssma_field_records (id, project_id, kind, category, description, location, occurred_at, client_created_at, risk_level, reported_by_user_id, responsible_user_id, due_date) values ($1,$2,'OCORRENCIA','EPI','Sem capacete na frente B.','Pátio', now(), now(), 'ALTA', $3, $3, current_date + 3)",
    [rec, P, U.RESP]
  );
  await db.query("insert into public.ssma_corrective_actions (id, record_id, project_id, responsible_user_id, due_date) values ($1,$2,$3,$4,current_date + 3)", [act, rec, P, U.RESP]);
  if (linkSla) await db.query("select public.ssma_link_sla_action($1)", [act]);
  return { rec, act };
}
const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false)`);
const forward = (act, to, reason = null) => db.query("select * from public.ssma_corrective_action_forward($1,$2,$3)", [act, to, reason]);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(code), `esperado ${code}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado erro ${code}, mas a operação passou`);
}

await check("F1 RESPONSÁVEL encaminha (sem vínculo SLA): ação e registro mudam de responsável, evento REATRIBUIDA e auditoria SSMA_ACTION_FORWARDED", async () => {
  const { rec, act } = await newSsmaAction();
  await as(U.RESP);
  const { rows } = await forward(act, U.COLAB2, "Técnico da frente B assume.");
  assert(rows[0].responsible_user_id === U.COLAB2);
  assert((await one("select responsible_user_id from public.ssma_field_records where id = $1", [rec])).responsible_user_id === U.COLAB2);
  const ev = await one("select count(*)::int as n from public.ssma_corrective_action_events where action_id = $1 and kind = 'REATRIBUIDA'", [act]);
  assert(ev.n === 1, "evento REATRIBUIDA");
  const au = await one("select actor_user_id, detail from public.audit_log_entries where entity_id = $1 and action = 'SSMA_ACTION_FORWARDED'", [act]);
  assert(au && au.actor_user_id === U.RESP && /Técnico da frente B/.test(au.detail), JSON.stringify(au));
});
await check("F2 com vínculo SLA: troca feita na ação SLA e propagada à ação SSMA/registro; prazos e status preservados", async () => {
  const { rec, act } = await newSsmaAction({ linkSla: true });
  const sla = await one("select id, complete_due_at, assume_due_at, status, current_escalation_level from public.sla_actions where related_ssma_corrective_action_id = $1", [act]);
  assert(sla, "ação SLA não vinculada pelo ssma_link_sla_action");
  await as(U.RESP);
  await forward(act, U.COLAB2, "Técnico da frente B assume.");
  const after = await one("select responsible_user_id, complete_due_at, assume_due_at, status, current_escalation_level from public.sla_actions where id = $1", [sla.id]);
  assert(after.responsible_user_id === U.COLAB2, "SLA não mudou");
  for (const k of ["complete_due_at", "assume_due_at", "status", "current_escalation_level"]) assert(String(after[k]) === String(sla[k]), `${k} mudou`);
  assert((await one("select responsible_user_id from public.ssma_corrective_actions where id = $1", [act])).responsible_user_id === U.COLAB2);
  assert((await one("select responsible_user_id from public.ssma_field_records where id = $1", [rec])).responsible_user_id === U.COLAB2);
});
await check("F3 permissões: GESTOR/LEITURA não responsáveis e usuário de outra obra são recusados; ADMINISTRADOR encaminha sem motivo", async () => {
  const { act } = await newSsmaAction();
  await as(U.GESTOR);
  await expectError(forward(act, U.COLAB2, "Motivo válido."), "ACTION_ACCESS_DENIED");
  await as(U.LEITURA);
  await expectError(forward(act, U.COLAB2, "Motivo válido."), "ACTION_ACCESS_DENIED");
  await as(U.OUTSIDER);
  await expectError(forward(act, U.COLAB2, "Motivo válido."), "PROJECT_ACCESS_DENIED");
  await as(U.ADMIN);
  const { rows } = await forward(act, U.COLAB2);
  assert(rows[0].responsible_user_id === U.COLAB2);
});
await check("F4 validações: sem motivo, destino LEITURA/de outra obra/o próprio, ação concluída — nada gravado", async () => {
  const { act } = await newSsmaAction();
  await as(U.RESP);
  await expectError(forward(act, U.COLAB2, ""), "FORWARD_REASON_REQUIRED");
  await expectError(forward(act, U.LEITURA, "Motivo válido."), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await expectError(forward(act, U.OUTSIDER, "Motivo válido."), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await expectError(forward(act, U.RESP, "Motivo válido."), "SAME_RESPONSIBLE");
  await db.query("update public.ssma_corrective_actions set status = 'CONCLUIDA', concluded_at = now() where id = $1", [act]);
  await expectError(forward(act, U.COLAB2, "Motivo válido."), "ACTION_ALREADY_CONCLUDED");
  assert((await one("select responsible_user_id from public.ssma_corrective_actions where id = $1", [act])).responsible_user_id === U.RESP);
});

// ---------- Limite de consultas de IA ----------
const reserve = (pid, kind = "SSMA", subject = "r1") => db.query("select public.ai_consult_reserve($1,$2,$3) as r", [pid, kind, subject]);
await check("L1 cada consulta reserva uma unidade; ao atingir o limite por usuário/dia a consulta é recusada (AI_CONSULT_USER_LIMIT)", async () => {
  await db.query("update public.ai_consult_limits set per_user_day = 3, per_project_day = 100 where scope = 'DEFAULT'");
  await as(U.COLAB2);
  for (let i = 0; i < 3; i += 1) await reserve(P);
  await expectError(reserve(P), "AI_CONSULT_USER_LIMIT");
  const c = await one("select count(*)::int as n from public.ai_consult_usage where user_id = $1", [U.COLAB2]);
  assert(c.n === 3, `uso registrado: ${c.n}`);
});
await check("L2 limite por obra/dia vale para todos os usuários da obra (AI_CONSULT_PROJECT_LIMIT)", async () => {
  await db.query("delete from public.ai_consult_usage");
  await db.query("update public.ai_consult_limits set per_user_day = 50, per_project_day = 2 where scope = 'DEFAULT'");
  await as(U.RESP);
  await reserve(P);
  await as(U.ADMIN);
  await reserve(P);
  await as(U.GESTOR);
  await expectError(reserve(P), "AI_CONSULT_PROJECT_LIMIT");
});
await check("L3 sem sessão, não membro, tipo inválido: recusado; usuário não insere uso direto (só pela função)", async () => {
  await db.query("update public.ai_consult_limits set per_user_day = 20, per_project_day = 100 where scope = 'DEFAULT'");
  await as(null);
  await expectError(reserve(P), "AUTH_REQUIRED");
  await as(U.OUTSIDER);
  await expectError(reserve(P), "PROJECT_ACCESS_DENIED");
  await as(U.RESP);
  await expectError(reserve(P, "OUTRO"), "INVALID_KIND");
  const { rows } = await db.query("select has_table_privilege('authenticated', 'public.ai_consult_usage', 'insert') as ins, has_function_privilege('anon', 'public.ai_consult_reserve(uuid,text,text)', 'execute') as anon_exec");
  assert(rows[0].ins === false && rows[0].anon_exec === false, JSON.stringify(rows[0]));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
