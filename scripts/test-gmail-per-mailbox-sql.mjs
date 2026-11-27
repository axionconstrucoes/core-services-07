// Migration 20261214100000 (coleta Gmail por caixa): replay de TODAS as migrations em PGlite (sem rede) + cenários:
// inclusão de caixa na lista da obra (Administrador/Dono; nunca service_role nem não-administrador), fluxo completo de
// Carlos (pendente => pulada; autorizado + teste técnico + coleta ligada => coletada; revogado => pulada), estado OAuth
// auditado (só nomes de escopo), última importada que nunca recua, cursores independentes, opção de e-mail interno
// DESLIGADA por padrão e rollback com guarda.
// Uso: node scripts/test-gmail-per-mailbox-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planMailboxCollection } from "./lib/gmail-per-mailbox.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const MIG = "20261214100000_gmail_per_mailbox_collection";
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 300)}`); failed += 1; }
}
const db = new PGlite();
await db.exec(platform);
const clean = (sql) => sql.replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(clean(readFileSync(path.join(dir, f), "utf8")));

const P1 = "00000000-0000-4000-8000-000000000001", P2 = "00000000-0000-4000-8000-000000000002";
const ADM = "00000000-0000-4000-8000-0000000000c1", REY = "00000000-0000-4000-8000-0000000000c3", CARLOS = "00000000-0000-4000-8000-0000000000c4", JAIME = "00000000-0000-4000-8000-0000000000c5";
const CARLOS_MB = "carlos.evandro@axion.com.br", JAIME_MB = "jaime.ramos@axion.com.br", REY_MB = "reynaldo@axion.com.br";
const asUid = (u) => db.exec(`select set_config('app.uid','${u ?? ""}',false)`);
await asUid(null);
for (const [id, e] of [[ADM, "adm@axion.com.br"], [REY, REY_MB], [CARLOS, CARLOS_MB], [JAIME, JAIME_MB]]) await db.query("insert into auth.users (id, email) values ($1,$2)", [id, e]);
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P1}','DEVWEG','DEV WEG (SIM)','x','x',date '2026-01-01',date '2027-01-01'), ('${P2}','OUTRA','Outra (SIM)','x','x',date '2026-01-01',date '2027-01-01');
  insert into public.project_memberships (project_id,user_id,permission,status) values
    ('${P1}','${ADM}','ADMINISTRADOR','ACTIVE'),('${P1}','${REY}','ADMINISTRADOR','ACTIVE'),('${P1}','${CARLOS}','GERENTE','ACTIVE'),('${P1}','${JAIME}','GERENTE','ACTIVE'),
    ('${P2}','${ADM}','COLABORADOR','ACTIVE');
`);
for (const p of [P1, P2]) {
  const c = (await db.query("insert into public.project_email_ingestion_configs (project_id, enabled, window_mode) values ($1, true, 'FROM_NOW') returning id", [p])).rows[0].id;
  await db.query("insert into public.project_email_ingestion_mailboxes (config_id, mailbox_address, enabled) values ($1,$2,true)", [c, REY_MB]);
}

const q = (sql, params) => db.query(sql, params);
const asRole = async (role, uid, fn) => { await db.exec(`set role ${role}`); await asUid(uid); try { return await fn(); } finally { await db.exec("reset role"); await asUid(null); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert(re.test(e.message), `erro inesperado: ${e.message}`); return; } throw new Error("deveria falhar"); };
const ADD = "select public.add_project_ingestion_mailbox($1,$2,$3)";
const REG = "select public.register_mailbox_corporate_authorization($1,$2,$3)";
const SET = "select public.set_mailbox_collection($1,$2,$3,$4,$5)";
const TECH = "select public.record_mailbox_technical_check($1,$2,$3,$4)";
const SYNC = "select public.record_mailbox_sync_result($1,$2,$3,$4,$5,$6)";
const PROG = "select public.record_mailbox_collection_progress($1,$2,$3,$4)";
const OAUTH = "select public.record_mailbox_oauth_state($1,$2,$3,$4)";
const ctl = async (p, mb) => (await q("select * from public.email_mailbox_collection_controls where project_id=$1 and mailbox_address=$2", [p, mb])).rows[0];
const plan = async (p) => {
  const cfg = (await q("select id from public.project_email_ingestion_configs where project_id=$1", [p])).rows[0].id;
  return planMailboxCollection({
    allowlist: (await q("select mailbox_address, enabled from public.project_email_ingestion_mailboxes where config_id=$1", [cfg])).rows,
    controls: (await q("select * from public.email_mailbox_collection_controls where project_id=$1", [p])).rows.map((r) => ({ ...r, period_start: r.period_start?.toISOString?.() ?? r.period_start, period_end: r.period_end?.toISOString?.() ?? r.period_end })),
    consents: (await q("select id, account_email, status, requested_at::text, decided_at::text from public.email_access_authorizations where project_id=$1", [p])).rows,
    legacyMailbox: REY_MB,
    env: { GOOGLE_GMAIL_INBOUND_CLIENT_ID: "c", GOOGLE_GMAIL_INBOUND_CLIENT_SECRET: "s", GOOGLE_GMAIL_TITULAR_1_MAILBOX: CARLOS_MB, GOOGLE_GMAIL_TITULAR_1_REFRESH_TOKEN: "t" },
    now: new Date("2026-11-27T12:00:00Z"),
  });
};

await check("M1 migration aditiva: colunas novas, opção de e-mail interno DESLIGADA por padrão, nenhuma caixa criada/habilitada", async () => {
  const cols = (await q("select column_name from information_schema.columns where table_schema='public' and table_name='email_mailbox_collection_controls'")).rows.map((r) => r.column_name);
  for (const c of ["last_imported_message_id", "last_imported_message_at", "credential_source", "granted_scopes", "oauth_checked_at"]) assert(cols.includes(c), c);
  const cfg = (await q("select bool_or(include_internal_only_messages) v from public.project_email_ingestion_configs")).rows[0];
  assert(cfg.v === false, "include_internal_only_messages deve nascer false");
  assert(Number((await q("select count(*)::int n from public.email_mailbox_collection_controls")).rows[0].n) === 0, "nenhum controle");
});

await check("M2 lista da obra: só Administrador (sessão) ou Dono no SQL Editor; não-admin, service_role e caixa externa recusados; auditado", async () => {
  await asRole("authenticated", CARLOS, () => fails(() => q(ADD, [P1, CARLOS_MB, "auto-inclusão"]), /FORBIDDEN/));
  await asRole("authenticated", ADM, () => fails(() => q(ADD, [P2, CARLOS_MB, "outra obra"]), /FORBIDDEN/));
  await asRole("service_role", null, () => fails(() => q(ADD, [P1, CARLOS_MB, "coletor"]), /permission denied|AUTH_REQUIRED/));
  await asRole("authenticated", ADM, () => fails(() => q(ADD, [P1, "fulano@weg.net", "externo"]), /MAILBOX_NOT_CORPORATE/));
  await asRole("authenticated", ADM, () => fails(() => q(ADD, [P1, CARLOS_MB, ""]), /REFERENCE_REQUIRED/));
  await asRole("authenticated", ADM, () => q(ADD, [P1, CARLOS_MB, "Decisão do Dono 27/11 (SIM)"]));
  await q(ADD, [P1, JAIME_MB, "Dono via SQL Editor (SIM)"]); // sem sessão, papel postgres = SQL Editor
  const audit = (await q("select actor_type, detail from public.audit_log_entries where action='PROJECT_INGESTION_MAILBOX_ADDED' order by occurred_at")).rows;
  assert(audit.length === 2 && audit[0].actor_type === "USER" && audit[1].actor_type === "SYSTEM" && /Dono \(SQL Editor\)/.test(audit[1].detail), JSON.stringify(audit));
  assert((await ctl(P1, CARLOS_MB)) === undefined, "incluir na lista NÃO cria controle nem autoriza");
});

await check("M3 Carlos com aceite PENDENTE: mesmo com autorização corporativa, nada é coletado (pulada e relatada)", async () => {
  const id = await asRole("authenticated", ADM, async () => (await q("select public.request_email_access_authorization($1,$2,$3,'v1','{}'::jsonb) id", [P1, CARLOS, CARLOS_MB])).rows[0].id);
  await asRole("authenticated", ADM, () => q(REG, [P1, CARLOS_MB, "Decisão de diretoria (SIM)"]));
  await asRole("service_role", null, () => q(TECH, [P1, CARLOS_MB, true, "getProfile ok"]));
  await asRole("authenticated", ADM, () => q(SET, [P1, CARLOS_MB, true, "2026-11-23T00:00:00Z", "2027-06-30T00:00:00Z"]));
  const p = await plan(P1);
  assert(p.collect.length === 0, JSON.stringify(p.collect.map((c) => c.mailbox)));
  assert(p.skipped.find((s) => s.mailbox === CARLOS_MB)?.reasons.includes("ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE"), JSON.stringify(p.skipped));
  globalThis.carlosAuth = id;
});

await check("M4 Carlos AUTORIZA => coletado; Jaime (sem controle, sem aceite) pulado; Reynaldo segue no caminho histórico", async () => {
  await asRole("authenticated", CARLOS, () => q("select public.decide_email_access_authorization($1,'AUTORIZADO','v1')", [globalThis.carlosAuth]));
  assert((await ctl(P1, CARLOS_MB)).individual_consent_status === "ACEITE_REGISTRADO");
  const p = await plan(P1);
  assert(p.collect.map((c) => c.mailbox).join() === CARLOS_MB, JSON.stringify(p.collect));
  assert(p.skipped.find((s) => s.mailbox === JAIME_MB)?.reasons.includes("SEM_REGISTRO_DE_CONTROLE"));
  assert(p.legacy?.mailbox === REY_MB && p.legacy.run === true);
});

await check("M5 estado OAuth: origem + nomes curtos de escopo, auditado só quando muda; nome inválido (token) recusado; só service_role", async () => {
  await asRole("service_role", null, () => q(OAUTH, [P1, CARLOS_MB, "OAUTH_SLOT_TITULAR", ["gmail.readonly"]]));
  await asRole("service_role", null, () => q(OAUTH, [P1, CARLOS_MB, "OAUTH_SLOT_TITULAR", ["gmail.readonly"]]));
  await asRole("service_role", null, () => fails(() => q(OAUTH, [P1, CARLOS_MB, "OAUTH_SLOT_TITULAR", ["ya29.a0AfH6SMB-token"]]), /INVALID_SCOPE_NAME/));
  await asRole("service_role", null, () => fails(() => q(OAUTH, [P1, CARLOS_MB, "QUALQUER", []]), /INVALID_CREDENTIAL_SOURCE/));
  await asRole("authenticated", ADM, () => fails(() => q(OAUTH, [P1, CARLOS_MB, "OAUTH_CAIXA", []]), /permission denied/));
  const c = await ctl(P1, CARLOS_MB);
  assert(c.credential_source === "OAUTH_SLOT_TITULAR" && c.granted_scopes.join() === "gmail.readonly" && c.oauth_checked_at, JSON.stringify(c));
  assert(Number((await q("select count(*)::int n from public.audit_log_entries where action='MAILBOX_OAUTH_STATE_RECORDED'")).rows[0].n) === 1);
});

await check("M6 cursor e última importada POR CAIXA: avançam só em sucesso e nunca recuam; erro conta para o teto; outra caixa intacta", async () => {
  await asRole("service_role", null, () => q(SYNC, [P1, CARLOS_MB, "SUCESSO", "3 novas", 3, "2026-11-27T12:00:00Z"]));
  await asRole("service_role", null, () => q(PROG, [P1, CARLOS_MB, "g-200", "2026-11-27T11:30:00Z"]));
  await asRole("service_role", null, () => q(PROG, [P1, CARLOS_MB, "g-100", "2026-11-27T10:00:00Z"])); // mais antiga: ignorada
  await asRole("service_role", null, () => q(SYNC, [P1, CARLOS_MB, "ERRO", "HTTP 503", 0, null]));
  const c = await ctl(P1, CARLOS_MB);
  assert(c.last_imported_message_id === "g-200" && new Date(c.last_sync_at).toISOString() === "2026-11-27T12:00:00.000Z" && c.consecutive_errors === 1 && c.last_sync_status === "ERRO", JSON.stringify(c));
  await asRole("service_role", null, () => fails(() => q(PROG, [P1, JAIME_MB, "g-1", "2026-11-27T10:00:00Z"]), /CONTROL_NOT_FOUND/));
  await asRole("authenticated", ADM, () => fails(() => q(PROG, [P1, CARLOS_MB, "g-9", "2026-11-28T10:00:00Z"]), /permission denied/));
});

await check("M7 revogação individual pelo próprio Carlos: coleta DESLIGADA na hora e a caixa sai do plano", async () => {
  await asRole("authenticated", CARLOS, () => q("select public.revoke_email_access_authorization($1,'não quero mais')", [globalThis.carlosAuth]));
  const c = await ctl(P1, CARLOS_MB);
  assert(c.collection_enabled === false && c.individual_consent_status === "REVOGADO", JSON.stringify(c));
  const p = await plan(P1);
  assert(p.collect.length === 0 && p.skipped.find((s) => s.mailbox === CARLOS_MB)?.reasons.includes("ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO"), JSON.stringify(p.skipped));
});

await check("R1 rollback RECUSA com estado gravado (ROLLBACK_BLOCKED) e, sem estado, remove tudo e é idempotente", async () => {
  const rb = readFileSync(path.join(here, "..", "supabase", "rollbacks", `${MIG}.rollback.sql`), "utf8");
  await fails(() => db.exec(rb), /ROLLBACK_BLOCKED/);
  await db.exec("rollback");
  await db.exec("alter table public.email_mailbox_collection_controls disable trigger user");
  await db.exec("update public.email_mailbox_collection_controls set last_imported_message_id=null, last_imported_message_at=null, credential_source=null, oauth_checked_at=null");
  await db.exec("alter table public.email_mailbox_collection_controls enable trigger user");
  await db.exec(rb);
  await db.exec(rb);
  const n = (await q("select count(*)::int n from information_schema.columns where table_schema='public' and column_name in ('last_imported_message_id','include_internal_only_messages')")).rows[0].n;
  const f = (await q("select count(*)::int n from pg_proc where proname in ('add_project_ingestion_mailbox','record_mailbox_oauth_state','record_mailbox_collection_progress')")).rows[0].n;
  assert(n === 0 && f === 0, `${n} colunas, ${f} funções`);
  assert((await ctl(P1, CARLOS_MB)).revoked_at === null && (await ctl(P1, CARLOS_MB)).individual_consent_status === "REVOGADO", "controle e histórico preservados");
  await db.exec(clean(readFileSync(path.join(dir, `${MIG}.sql`), "utf8"))); // reaplicar
  assert(Number((await q("select count(*)::int n from pg_proc where proname='add_project_ingestion_mailbox'")).rows[0].n) === 1);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
