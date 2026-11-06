// Migration 20261106090000: primeiro login com convite ligado à Matriz de SLA (SQL 23514 em
// audit_log_entries_check). Replay das migrations em PGlite (PostgreSQL 17 em memória, descartável,
// sem rede) com o stub mínimo da plataforma Supabase (auth.users/auth.uid()).
//
// Fase 0: aplica TODAS as migrations EXCETO a correção e REPRODUZ o erro (primeiro login falha).
// Fase 1: aplica a correção e valida os cenários 1–5 e as garantias de segurança.
//
// Limites: PGlite não é um servidor PostgreSQL nativo e não roda o GoTrue real (o INSERT em
// auth.users do stub dispara o mesmo gatilho handle_new_user). Veja o doc da migration.
//
// Uso: node scripts/test-sla-first-login-audit-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
const FIX = "20261106090000_sla_configuration_audit_system_actor.sql";

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
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const db = new PGlite();
console.log(`PostgreSQL ${(await db.query("show server_version")).rows[0].server_version} (PGlite)`);
await db.exec(platform);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
assert(files.includes(FIX), "migration da correção ausente");
const apply = async (f) => db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
for (const f of files.filter((x) => x !== FIX)) await apply(f);

// ---- Fixtures: obra DEV WEG, administrador da obra, Carlos (só e-mail; o usuário só nasce no 1º login) ----
const DEV_WEG = "00000000-0000-4000-8000-000000000001";
const CARLOS_EMAIL = "carlos.evandro@axion.com.br";
const CARLOS_ID = "00000000-0000-4000-8000-0000000000c1";
const ADM = "00000000-0000-4000-8000-0000000000a1";
const ADM2 = "00000000-0000-4000-8000-0000000000a2";
const asSystem = () => db.exec("select set_config('app.uid','',false)"); // como o GoTrue na criação do usuário
const asUser = (uid) => db.exec(`select set_config('app.uid','${uid}',false)`);
const firstLogin = (id, email) => db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);

await asSystem();
await firstLogin(ADM, "adm.devweg@axion.com.br");
await firstLogin(ADM2, "adm2.devweg@axion.com.br");
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date)
  values ('${DEV_WEG}', 'DEVWEG', 'DEV WEG (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area)
  values ('${DEV_WEG}', '${ADM}', 'ADMINISTRADOR', 'ACTIVE', null), ('${DEV_WEG}', '${ADM2}', 'ADMINISTRADOR', 'ACTIVE', null);
`);
// Convite do Carlos (ADMINISTRADOR na DEV WEG) ligado à Matriz de SLA em DUAS áreas/posições.
const invId = (await db.query("insert into public.project_member_invitations (project_id, email, name, permission, created_by) values ($1,$2,'Carlos Evandro','ADMINISTRADOR',$3) returning id", [DEV_WEG, CARLOS_EMAIL, ADM])).rows[0].id;
await asUser(ADM); // quem configura a matriz é um usuário autenticado
const rowA = (await db.query("insert into public.sla_area_responsibles (project_id, area, responsible_direct_invitation_id, updated_by_user_id) values ($1,'PLANEJAMENTO',$2,$3) returning id", [DEV_WEG, invId, ADM])).rows[0].id;
const rowB = (await db.query("insert into public.sla_area_responsibles (project_id, area, board_invitation_id, updated_by_user_id) values ($1,'ENGENHARIA',$2,$3) returning id", [DEV_WEG, invId, ADM])).rows[0].id;
const sla = async (id) => (await db.query("select responsible_direct_user_id d, responsible_direct_invitation_id di, board_user_id b, board_invitation_id bi from public.sla_area_responsibles where id = $1", [id])).rows[0];
const slaAudit = async (id) => (await db.query("select actor_type, actor_user_id, actor_label, detail from public.audit_log_entries where entity_id = $1 and action = 'SLA_CONFIGURATION_UPDATED' order by occurred_at, id", [id])).rows;

console.log("\n======================================\nPrimeiro login — Matriz de SLA × auditoria\n======================================");

await check("F0 ANTES da correção: o primeiro login falha com 23514 em audit_log_entries_check (causa reproduzida) e nada é gravado", async () => {
  await asSystem();
  let err = null;
  try { await firstLogin(CARLOS_ID, CARLOS_EMAIL); } catch (e) { err = e; }
  assert(err && /audit_log_entries_check/.test(err.message), `esperava 23514/audit_log_entries_check, obtido: ${err?.message}`);
  assert(Number((await db.query("select count(*)::int n from auth.users where id = $1", [CARLOS_ID])).rows[0].n) === 0, "usuário não deveria existir");
  assert(Number((await db.query("select count(*)::int n from public.profiles where id = $1", [CARLOS_ID])).rows[0].n) === 0, "profile não deveria existir");
});

await apply(FIX);

await check("F1 migration de correção: só CREATE OR REPLACE da função de auditoria (não remove constraint, não desativa gatilho, não toca dados)", () => {
  const sql = readFileSync(path.join(dir, FIX), "utf8").replace(/--[^\n]*/g, "");
  assert(/create or replace function public\.audit_sla_configuration_updated/i.test(sql), "função ausente");
  // Fora do corpo da função ($$ ... $$) só pode existir o cabeçalho do CREATE OR REPLACE.
  const outside = sql.replace(/\$\$[\s\S]*?\$\$/g, "BODY").replace(/\s+/g, " ").trim();
  assert(/^create or replace function public\.audit_sla_configuration_updated\(\) returns trigger language plpgsql security definer set search_path = '' as BODY;$/i.test(outside), `há comandos além do CREATE OR REPLACE: ${outside.slice(0, 200)}`);
  assert(!/drop\s+(constraint|trigger|table)|disable\s+trigger|alter\s+table|\bgrant\b|\brevoke\b/i.test(sql), "a migration mexe em constraint/gatilho/permissão");
  assert(/set search_path = ''/.test(sql), "search_path precisa ser vazio");
});

await check("T1 primeiro login do Carlos com convite ligado à Matriz de SLA: o login conclui; profile, ADMINISTRADOR na DEV WEG e convite ACTIVATED", async () => {
  await asSystem();
  await firstLogin(CARLOS_ID, CARLOS_EMAIL);
  assert((await db.query("select email from public.profiles where id = $1", [CARLOS_ID])).rows[0]?.email === CARLOS_EMAIL, "profile não criado");
  const m = (await db.query("select project_id, permission, status from public.project_memberships where user_id = $1", [CARLOS_ID])).rows;
  assert(m.length === 1 && m[0].project_id === DEV_WEG && m[0].permission === "ADMINISTRADOR" && m[0].status === "ACTIVE", `vínculos do Carlos: ${JSON.stringify(m)}`);
  const inv = (await db.query("select status, profile_id from public.project_member_invitations where id = $1", [invId])).rows[0];
  assert(inv.status === "ACTIVATED" && inv.profile_id === CARLOS_ID, JSON.stringify(inv));
});

await check("T2 ativação do vínculo: as DUAS posições da Matriz passam do convite para o usuário real e a referência ao convite é limpa", async () => {
  const a = await sla(rowA), b = await sla(rowB);
  assert(a.d === CARLOS_ID && a.di === null, JSON.stringify(a));
  assert(b.b === CARLOS_ID && b.bi === null, JSON.stringify(b));
});

await check("T3 auditoria válida da operação automática: SLA_CONFIGURATION_UPDATED como SYSTEM (sem autor, sem rótulo, detalhe 'automática') e a ativação do convite também auditada", async () => {
  for (const id of [rowA, rowB]) {
    const rows = await slaAudit(id);
    const last = rows[rows.length - 1];
    assert(rows.length === 2, `esperava 2 auditorias (criação + automática) em ${id}: ${rows.length}`);
    assert(rows[0].actor_type === "USER" && rows[0].actor_user_id === ADM, `a criação pelo administrador continua USER: ${JSON.stringify(rows[0])}`);
    assert(last.actor_type === "SYSTEM" && last.actor_user_id === null && last.actor_label === null && /autom[aá]tica/i.test(last.detail), JSON.stringify(last));
  }
  const act = (await db.query("select actor_type, actor_user_id from public.audit_log_entries where action = 'MEMBER_INVITATION_ACTIVATED' and project_id = $1", [DEV_WEG])).rows;
  assert(act.length === 1 && act[0].actor_type === "SYSTEM" && act[0].actor_user_id === null, JSON.stringify(act));
});

await check("T4 alterações normais por usuário mantêm a autoria (USER + auth.uid()): matriz, responsáveis e configurações; também com o papel authenticated", async () => {
  await asUser(ADM);
  await db.query("update public.sla_area_responsibles set escalation_1_user_id = $2 where id = $1", [rowA, ADM2]);
  let rows = await slaAudit(rowA);
  assert(rows[rows.length - 1].actor_type === "USER" && rows[rows.length - 1].actor_user_id === ADM && !/autom/i.test(rows[rows.length - 1].detail), JSON.stringify(rows[rows.length - 1]));

  await db.exec("set role authenticated");
  try {
    await asUser(ADM2);
    await db.query("update public.sla_area_responsibles set escalation_1_user_id = null, updated_by_user_id = $2 where id = $1", [rowA, ADM2]);
  } finally { await db.exec("reset role"); }
  rows = await slaAudit(rowA);
  assert(rows[rows.length - 1].actor_type === "USER" && rows[rows.length - 1].actor_user_id === ADM2, JSON.stringify(rows[rows.length - 1]));

  await asUser(ADM);
  const rule = (await db.query("select id from public.sla_matrix_rules where project_id = $1 limit 1", [DEV_WEG])).rows[0]?.id
    ?? (await db.query("insert into public.sla_matrix_rules (project_id, risk_level, area, updated_by_user_id) values ($1,'HIGH','PLANEJAMENTO',$2) returning id", [DEV_WEG, ADM]).catch(() => ({ rows: [] }))).rows[0]?.id;
  if (rule) {
    await db.query("update public.sla_matrix_rules set updated_at = now() where id = $1", [rule]);
    const r = await slaAudit(rule);
    assert(r.length >= 1 && r.every((x) => x.actor_type === "USER" && x.actor_user_id === ADM), JSON.stringify(r));
  }
  await db.query("insert into public.sla_project_settings (project_id, timezone, business_day_start_hour, business_day_end_hour, updated_by_user_id) values ($1,'America/Sao_Paulo',8,18,$2)", [DEV_WEG, ADM]);
  const s = await slaAudit(DEV_WEG);
  assert(s.length === 1 && s[0].actor_type === "USER" && s[0].actor_user_id === ADM, JSON.stringify(s));
});

await check("T5 falha no processamento do convite NÃO aborta o login: convite cancelado (fail-closed), posição da Matriz liberada, tudo auditado como SYSTEM, sem acesso concedido", async () => {
  const email = "falha.teste@axion.com.br";
  const uid = "00000000-0000-4000-8000-0000000000f1";
  const inv2 = (await db.query("insert into public.project_member_invitations (project_id, email, name, permission, created_by) values ($1,$2,'Falha Teste','COLABORADOR',$3) returning id", [DEV_WEG, email, ADM])).rows[0].id;
  await asUser(ADM);
  const row = (await db.query("insert into public.sla_area_responsibles (project_id, area, responsible_direct_invitation_id, updated_by_user_id) values ($1,'FINANCEIRO',$2,$3) returning id", [DEV_WEG, inv2, ADM])).rows[0].id;
  // Falha INDUZIDA só neste teste: gatilho temporário que rejeita o vínculo desse usuário.
  await db.exec(`
    create function public.tmp_fail_membership() returns trigger language plpgsql as $$ begin raise exception 'falha induzida pelo teste'; end $$;
    create trigger tmp_fail_membership_trg before insert on public.project_memberships for each row when (new.user_id = '${uid}') execute function public.tmp_fail_membership();
  `);
  try {
    await asSystem();
    await firstLogin(uid, email); // não pode lançar erro
  } finally {
    await db.exec("drop trigger tmp_fail_membership_trg on public.project_memberships; drop function public.tmp_fail_membership();");
  }
  assert((await db.query("select 1 from public.profiles where id = $1", [uid])).rows.length === 1, "login/profile não concluído");
  assert((await db.query("select 1 from public.project_memberships where user_id = $1", [uid])).rows.length === 0, "não pode ter acesso após falha");
  assert((await db.query("select status from public.project_member_invitations where id = $1", [inv2])).rows[0].status === "CANCELLED", "convite deveria estar CANCELLED");
  const r = await sla(row);
  assert((await db.query("select responsible_direct_invitation_id i, responsible_direct_user_id u from public.sla_area_responsibles where id = $1", [row])).rows[0].i === null, "posição deveria ter sido liberada");
  const rows = await slaAudit(row);
  assert(rows[rows.length - 1].actor_type === "SYSTEM" && rows[rows.length - 1].actor_user_id === null, JSON.stringify(rows[rows.length - 1]));
  const c = (await db.query("select actor_type, detail from public.audit_log_entries where action = 'MEMBER_INVITATION_CANCELLED' and entity_id = $1", [inv2])).rows;
  assert(c.length === 1 && c[0].actor_type === "SYSTEM" && /falha induzida/.test(c[0].detail), JSON.stringify(c));
  void r;
});

await check("S1 Carlos segue ADMINISTRADOR exclusivamente na DEV WEG: 1 único vínculo, nenhum outro projeto", async () => {
  const m = (await db.query("select project_id, permission, status from public.project_memberships where user_id = $1", [CARLOS_ID])).rows;
  assert(m.length === 1 && m[0].project_id === DEV_WEG && m[0].permission === "ADMINISTRADOR", JSON.stringify(m));
  assert(Number((await db.query("select count(*)::int n from public.projects")).rows[0].n) === 1, "fixture com projeto extra");
});

await check("S2 consultas jurídicas privadas por autor continuam: Carlos (administrador da obra) não lê, não acessa por ID e não apaga a consulta de outro administrador", async () => {
  await db.exec("set role authenticated");
  let id;
  try {
    await asUser(ADM);
    id = (await db.query("insert into public.legal_consultations (project_id, question, response) values ($1,'FICTICIA consulta do admin 1','{}'::jsonb) returning id", [DEV_WEG])).rows[0].id;
    await asUser(CARLOS_ID);
    assert((await db.query("select id from public.legal_consultations")).rows.length === 0, "Carlos não pode listar");
    assert((await db.query("select id from public.legal_consultations where id = $1", [id])).rows.length === 0, "Carlos não pode abrir por ID");
    assert((await db.query("delete from public.legal_consultations where id = $1 returning id", [id])).rows.length === 0, "Carlos não pode apagar");
    await asUser(ADM);
    assert((await db.query("select id from public.legal_consultations where id = $1", [id])).rows.length === 1, "o autor continua vendo a sua");
  } finally { await db.exec("reset role"); }
});

await check("S3 constraint e gatilhos intactos: audit_log_entries_check validada; gatilhos de auditoria SLA e de resolução de convite habilitados; EXECUTE da função continua fechado a anon/authenticated", async () => {
  const c = (await db.query("select convalidated from pg_constraint where conname = 'audit_log_entries_check'")).rows;
  assert(c.length === 1 && c[0].convalidated === true, JSON.stringify(c));
  const t = (await db.query("select tgname, tgenabled from pg_trigger where tgname in ('sla_area_responsibles_audit_change','sla_matrix_rules_audit_change','sla_project_settings_audit_change','project_member_invitation_resolve_sla_matrix') and not tgisinternal")).rows;
  assert(t.length === 4 && t.every((x) => x.tgenabled === "O"), JSON.stringify(t));
  const p = (await db.query("select has_function_privilege('anon','public.audit_sla_configuration_updated()','execute') a, has_function_privilege('authenticated','public.audit_sla_configuration_updated()','execute') u")).rows[0];
  assert(p.a === false && p.u === false, JSON.stringify(p));
  const f = (await db.query("select prosecdef, proconfig from pg_proc where oid = 'public.audit_sla_configuration_updated()'::regprocedure")).rows[0];
  assert(f.prosecdef === true && JSON.stringify(f.proconfig).includes("search_path="), JSON.stringify(f));
});

await db.close();
console.log("");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
