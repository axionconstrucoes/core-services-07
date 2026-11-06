// Migration 20261107090000 (email_mailbox_collection_controls): replay de TODAS as migrations em PGlite (PostgreSQL 17 em
// memória, descartável, sem rede) + cenários de autorização por caixa, revogação, isolamento por obra e privilégios.
// Uso: node scripts/test-email-mailbox-controls-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 300)}`); failed += 1; }
}
const db = new PGlite();
console.log(`PostgreSQL ${(await db.query("show server_version")).rows[0].server_version} (PGlite)`);
await db.exec(platform);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
}

const P1 = "00000000-0000-4000-8000-000000000001", P2 = "00000000-0000-4000-8000-000000000002";
const ADM1 = "00000000-0000-4000-8000-0000000000a1", ADM2 = "00000000-0000-4000-8000-0000000000a2", COLAB = "00000000-0000-4000-8000-0000000000a3";
const asUid = (u) => db.exec(`select set_config('app.uid','${u ?? ""}',false)`);
await asUid(null);
for (const [id, e] of [[ADM1, "adm1@axion.com.br"], [ADM2, "adm2@axion.com.br"], [COLAB, "colab@axion.com.br"]]) await db.query("insert into auth.users (id, email) values ($1,$2)", [id, e]);
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P1}','DEVWEG','DEV WEG (SIM)','x','x',date '2026-01-01',date '2027-01-01'), ('${P2}','OUTRA','Outra obra (SIM)','x','x',date '2026-01-01',date '2027-01-01');
  insert into public.project_memberships (project_id,user_id,permission,status) values ('${P1}','${ADM1}','ADMINISTRADOR','ACTIVE'),('${P2}','${ADM2}','ADMINISTRADOR','ACTIVE'),('${P1}','${COLAB}','COLABORADOR','ACTIVE');
`);
const cfg = async (proj, mailboxes) => {
  const c = (await db.query("insert into public.project_email_ingestion_configs (project_id, enabled, window_mode) values ($1, true, 'FROM_NOW') returning id", [proj])).rows[0].id;
  for (const m of mailboxes) await db.query("insert into public.project_email_ingestion_mailboxes (config_id, mailbox_address, enabled) values ($1,$2,true)", [c, m]);
};
await cfg(P1, ["reynaldo@axion.com.br", "corazza@axion.com.br"]);
await cfg(P2, ["outra@axion.com.br"]);

const asRole = async (role, uid, fn) => { await db.exec(`set role ${role}`); await asUid(uid); try { return await fn(); } finally { await db.exec("reset role"); await asUid(null); } };
const rpc = (sql, params) => db.query(sql, params);
const ctl = async (proj, mb) => (await db.query("select * from public.email_mailbox_collection_controls where project_id=$1 and mailbox_address=$2", [proj, mb])).rows[0];
const REG = "select public.register_mailbox_corporate_authorization($1,$2,$3)";
const SET = "select public.set_mailbox_collection($1,$2,$3,$4,$5)";
const REV = "select public.revoke_mailbox_collection($1,$2,$3)";
const TECH = "select public.record_mailbox_technical_check($1,$2,$3,$4)";
const SYNC = "select public.record_mailbox_sync_result($1,$2,$3,$4,$5,$6)";
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert(re.test(e.message), `erro inesperado: ${e.message}`); return; } throw new Error("deveria falhar"); };

await check("M1 a migration NÃO habilita nada: tabela vazia (sem seed), nada de aceite individual fictício", async () => {
  assert(Number((await db.query("select count(*)::int n from public.email_mailbox_collection_controls")).rows[0].n) === 0, "tabela deveria nascer vazia");
  assert(Number((await db.query("select count(*)::int n from public.email_access_authorizations")).rows[0].n) === 0, "não pode criar aceites");
});
await check("M0 pré-cadastro PENDENTE e papel ADMINISTRADOR na obra NÃO criam controle nem autorizam: nenhuma caixa da lista tem registro", async () => {
  await db.query("insert into public.project_member_invitations (project_id, email, name, permission, created_by) values ($1,'corazza@axion.com.br','Corazza','ADMINISTRADOR',$2)", [P1, ADM1]);
  assert(Number((await db.query("select count(*)::int n from public.email_mailbox_collection_controls")).rows[0].n) === 0, "convite/papel não podem gerar autorização");
  assert((await ctl(P1, "corazza@axion.com.br")) === undefined && (await ctl(P1, "reynaldo@axion.com.br")) === undefined, "sem registro por caixa");
});
await check("M2 só Administrador da obra registra; colaborador e administrador de OUTRA obra são recusados", async () => {
  await asRole("authenticated", COLAB, () => fails(() => rpc(REG, [P1, "reynaldo@axion.com.br", "Admin Console 07/11"]), /FORBIDDEN/));
  await asRole("authenticated", ADM2, () => fails(() => rpc(REG, [P1, "reynaldo@axion.com.br", "Admin Console 07/11"]), /FORBIDDEN/));
  await asRole("authenticated", null, () => fails(() => rpc(REG, [P1, "reynaldo@axion.com.br", "Admin Console 07/11"]), /AUTH_REQUIRED/));
});
await check("M3 só caixa da lista explícita da obra; referência obrigatória", async () => {
  await asRole("authenticated", ADM1, async () => {
    await fails(() => rpc(REG, [P1, "naolistada@axion.com.br", "Admin Console 07/11"]), /MAILBOX_NOT_IN_PROJECT_ALLOWLIST/);
    await fails(() => rpc(REG, [P1, "outra@axion.com.br", "Admin Console 07/11"]), /MAILBOX_NOT_IN_PROJECT_ALLOWLIST/); // caixa de OUTRA obra
    await fails(() => rpc(REG, [P1, "reynaldo@axion.com.br", " "]), /REFERENCE_REQUIRED/);
  });
});
await check("M4 registrar autoriza a caixa mas NÃO liga a coleta nem confirma a permissão técnica; aceite individual segue NAO_REGISTRADO; auditado com o autor", async () => {
  await asRole("authenticated", ADM1, () => rpc(REG, [P1, "reynaldo@axion.com.br", "Admin Console 07/11, delegação"]));
  const c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.corporate_authorization_status === "AUTORIZADA" && c.corporate_authorized_by_user_id === ADM1, JSON.stringify(c));
  assert(c.collection_enabled === false && c.technical_permission_status === "NAO_VERIFICADA" && c.individual_consent_status === "NAO_REGISTRADO", "estados indevidos");
  const a = (await db.query("select actor_type, actor_user_id from public.audit_log_entries where action='MAILBOX_CORPORATE_AUTHORIZATION_REGISTERED'")).rows;
  assert(a.length === 1 && a[0].actor_type === "USER" && a[0].actor_user_id === ADM1, JSON.stringify(a));
});
await check("M5 não habilita a coleta sem permissão técnica; a outra caixa da lista (sem autorização) segue sem controle", async () => {
  await asRole("authenticated", ADM1, () => fails(() => rpc(SET, [P1, "reynaldo@axion.com.br", true, "2026-08-20T00:00:00Z", "2026-12-31T00:00:00Z"]), /TECHNICAL_PERMISSION_REQUIRED/));
  assert((await ctl(P1, "corazza@axion.com.br")) === undefined, "corazza não pode ter sido habilitada");
  await asRole("authenticated", ADM1, () => fails(() => rpc(SET, [P1, "corazza@axion.com.br", true, "2026-08-20T00:00:00Z", "2026-12-31T00:00:00Z"]), /CONTROL_NOT_FOUND/));
});
await check("M6 privilégios: administrador NÃO executa o registro técnico/sincronização; só service_role", async () => {
  await asRole("authenticated", ADM1, async () => {
    await fails(() => rpc(TECH, [P1, "reynaldo@axion.com.br", true, "x"]), /permission denied/i);
    await fails(() => rpc(SYNC, [P1, "reynaldo@axion.com.br", "SUCESSO", "x", 1, null]), /permission denied/i);
  });
  await asRole("anon", null, () => fails(() => rpc(TECH, [P1, "reynaldo@axion.com.br", true, "x"]), /permission denied/i));
});
await check("M7 sem escrita direta na tabela (authenticated/anon) e o CHECK impede coleta ligada sem pré-requisitos", async () => {
  await asRole("authenticated", ADM1, () => fails(() => db.query("update public.email_mailbox_collection_controls set collection_enabled = true"), /permission denied/i));
  await asRole("authenticated", ADM1, () => fails(() => db.query("delete from public.email_mailbox_collection_controls"), /permission denied/i));
  await asRole("anon", null, () => fails(() => db.query("select * from public.email_mailbox_collection_controls"), /permission denied/i));
  await fails(() => db.query("update public.email_mailbox_collection_controls set collection_enabled = true where mailbox_address = 'reynaldo@axion.com.br'"), /check constraint/i);
});
await check("M8 teste técnico (service_role) confirma a permissão sem ligar a coleta; depois o Administrador habilita COM período", async () => {
  await asRole("service_role", null, () => rpc(TECH, [P1, "reynaldo@axion.com.br", true, "getProfile ok; escopo gmail.readonly"]));
  let c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.technical_permission_status === "CONFIRMADA" && c.collection_enabled === false && c.technical_checked_at, JSON.stringify(c));
  await asRole("authenticated", ADM1, () => fails(() => rpc(SET, [P1, "reynaldo@axion.com.br", true, null, null]), /PERIOD_START_REQUIRED/));
  await asRole("authenticated", ADM1, () => fails(() => rpc(SET, [P1, "reynaldo@axion.com.br", true, "2026-08-20T00:00:00Z", null]), /PERIOD_END_REQUIRED/));
  await asRole("authenticated", ADM1, () => fails(() => rpc(SET, [P1, "reynaldo@axion.com.br", true, "2026-08-20T00:00:00Z", "2026-08-01T00:00:00Z"]), /PERIOD_INVALID/));
  await asRole("authenticated", ADM1, () => rpc(SET, [P1, "reynaldo@axion.com.br", true, "2026-08-20T00:00:00Z", "2026-12-31T00:00:00Z"]));
  c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.collection_enabled === true && new Date(c.period_start).toISOString() === "2026-08-20T00:00:00.000Z", JSON.stringify(c));
});
await check("M9 estado de sincronização por caixa: ponteiro só avança em SUCESSO com synced_through; erro e amostra não avançam; auditoria SYSTEM", async () => {
  await asRole("service_role", null, () => rpc(SYNC, [P1, "reynaldo@axion.com.br", "SUCESSO", "5 novas", 5, "2026-11-07T10:00:00Z"]));
  let c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.last_sync_status === "SUCESSO" && c.last_sync_imported === 5 && new Date(c.last_sync_at).toISOString() === "2026-11-07T10:00:00.000Z", JSON.stringify(c));
  await asRole("service_role", null, () => rpc(SYNC, [P1, "reynaldo@axion.com.br", "ERRO", "falha", 0, "2026-11-07T11:00:00Z"]));
  await asRole("service_role", null, () => rpc(SYNC, [P1, "reynaldo@axion.com.br", "SUCESSO", "amostra", 3, null]));
  c = await ctl(P1, "reynaldo@axion.com.br");
  assert(new Date(c.last_sync_at).toISOString() === "2026-11-07T10:00:00.000Z", "ponteiro não podia avançar");
  const a = (await db.query("select actor_type, actor_user_id from public.audit_log_entries where action='MAILBOX_SYNC_RECORDED'")).rows;
  assert(a.length === 3 && a.every((r) => r.actor_type === "SYSTEM" && r.actor_user_id === null), JSON.stringify(a));
});
await check("M10 isolamento por obra: o administrador de OUTRA obra não vê nem altera o controle; o colaborador também não vê", async () => {
  await asRole("authenticated", ADM2, async () => {
    assert((await db.query("select * from public.email_mailbox_collection_controls")).rows.length === 0, "ADM2 não pode ver a P1");
    await fails(() => rpc(SET, [P1, "reynaldo@axion.com.br", false, null, null]), /FORBIDDEN/);
    await fails(() => rpc(REV, [P1, "reynaldo@axion.com.br", "tentativa indevida"]), /FORBIDDEN/);
  });
  await asRole("authenticated", COLAB, async () => assert((await db.query("select * from public.email_mailbox_collection_controls")).rows.length === 0, "colaborador não vê"));
  await asRole("authenticated", ADM1, async () => assert((await db.query("select * from public.email_mailbox_collection_controls")).rows.length === 1, "ADM1 vê só o da sua obra"));
});
await check("M11 revogação: desliga na hora, exige motivo, preserva a linha e o histórico; reautorizar recomeça com coleta desligada e teste técnico a refazer", async () => {
  await asRole("authenticated", ADM1, () => fails(() => rpc(REV, [P1, "reynaldo@axion.com.br", "  "]), /REASON_REQUIRED/));
  await asRole("authenticated", ADM1, () => rpc(REV, [P1, "reynaldo@axion.com.br", "Fim do período do piloto"]));
  let c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c && c.collection_enabled === false && c.corporate_authorization_status === "REVOGADA" && c.revoked_by_user_id === ADM1 && c.revoked_reason, JSON.stringify(c));
  await asRole("authenticated", ADM1, () => fails(() => rpc(REV, [P1, "reynaldo@axion.com.br", "outra vez"]), /ALREADY_REVOKED/));
  await asRole("authenticated", ADM1, () => fails(() => rpc(SET, [P1, "reynaldo@axion.com.br", true, "2026-08-20T00:00:00Z", "2026-12-31T00:00:00Z"]), /REVOKED/));
  await asRole("service_role", null, () => fails(() => rpc(TECH, [P1, "reynaldo@axion.com.br", true, "x"]), /REVOKED/));
  await asRole("authenticated", ADM1, () => rpc(REG, [P1, "reynaldo@axion.com.br", "Nova decisão 08/11"]));
  c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.corporate_authorization_status === "AUTORIZADA" && c.collection_enabled === false && c.technical_permission_status === "NAO_VERIFICADA" && c.revoked_at === null, JSON.stringify(c));
  const acts = (await db.query("select action from public.audit_log_entries where entity_type='EMAIL_MAILBOX_COLLECTION_CONTROL' order by occurred_at, id")).rows.map((r) => r.action);
  assert(acts.includes("MAILBOX_COLLECTION_REVOKED") && acts.filter((x) => x === "MAILBOX_CORPORATE_AUTHORIZATION_REGISTERED").length === 2, JSON.stringify(acts));
});
await check("M12 a migration só cria a tabela e as 5 funções (não toca em tabelas existentes, não remove nada, search_path vazio)", () => {
  const raw = readFileSync(path.join(dir, "20261107090000_email_mailbox_collection_controls.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert(!/drop\s+(table|constraint|trigger|function)|disable\s+trigger|alter\s+table\s+public\.(?!email_mailbox_collection_controls)/i.test(raw), "faz mais do que deveria");
  assert((raw.match(/security definer/gi) ?? []).length === 5 && (raw.match(/set search_path = ''/g) ?? []).length === 5, "5 funções com search_path vazio");
});

await db.close();
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
