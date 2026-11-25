// Migration 20261121110000 (endurecimento dos controles por caixa): replay de TODAS as migrations em PGlite (sem rede)
// + cenários: Carlos/Jaime cadastrados sem autorização (nada coletado), aceite individual refletido no controle,
// revogação efetiva, retentativa limitada, cursor independente e limitado ao período, isolamento entre obras e dedupe.
// Uso: node scripts/test-email-mailbox-hardening-sql.mjs
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
await db.exec(platform);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
}

const P1 = "00000000-0000-4000-8000-000000000001", P2 = "00000000-0000-4000-8000-000000000002";
const ADM1 = "00000000-0000-4000-8000-0000000000b1", ADM2 = "00000000-0000-4000-8000-0000000000b2";
const REY = "00000000-0000-4000-8000-0000000000b3", CARLOS = "00000000-0000-4000-8000-0000000000b4", JAIME = "00000000-0000-4000-8000-0000000000b5";
const asUid = (u) => db.exec(`select set_config('app.uid','${u ?? ""}',false)`);
await asUid(null);
for (const [id, e] of [[ADM1, "adm1@axion.com.br"], [ADM2, "adm2@axion.com.br"], [REY, "reynaldo@axion.com.br"], [CARLOS, "carlos.evandro@axion.com.br"], [JAIME, "jaime.ramos@axion.com.br"]]) {
  await db.query("insert into auth.users (id, email) values ($1,$2)", [id, e]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P1}','DEVWEG','DEV WEG (SIM)','x','x',date '2026-01-01',date '2027-01-01'), ('${P2}','OUTRA','Outra obra (SIM)','x','x',date '2026-01-01',date '2027-01-01');
  insert into public.project_memberships (project_id,user_id,permission,status) values
    ('${P1}','${ADM1}','ADMINISTRADOR','ACTIVE'),('${P2}','${ADM2}','ADMINISTRADOR','ACTIVE'),('${P1}','${REY}','ADMINISTRADOR','ACTIVE'),
    ('${P1}','${CARLOS}','ADMINISTRADOR','ACTIVE'),('${P2}','${CARLOS}','GERENTE','ACTIVE'),('${P1}','${JAIME}','GERENTE','ACTIVE'),('${P2}','${JAIME}','GERENTE','ACTIVE'),
    ('${P2}','${REY}','COLABORADOR','ACTIVE');
`);
const cfg = async (proj, mailboxes) => {
  const c = (await db.query("insert into public.project_email_ingestion_configs (project_id, enabled, window_mode) values ($1, true, 'FROM_NOW') returning id", [proj])).rows[0].id;
  for (const m of mailboxes) await db.query("insert into public.project_email_ingestion_mailboxes (config_id, mailbox_address, enabled) values ($1,$2,true)", [c, m]);
};
await cfg(P1, ["reynaldo@axion.com.br", "corazza@axion.com.br"]);
await cfg(P2, ["reynaldo@axion.com.br"]);

const asRole = async (role, uid, fn) => { await db.exec(`set role ${role}`); await asUid(uid); try { return await fn(); } finally { await db.exec("reset role"); await asUid(null); } };
const q = (sql, params) => db.query(sql, params);
const ctl = async (proj, mb) => (await q("select * from public.email_mailbox_collection_controls where project_id=$1 and mailbox_address=$2", [proj, mb])).rows[0];
const REG = "select public.register_mailbox_corporate_authorization($1,$2,$3)";
const SET = "select public.set_mailbox_collection($1,$2,$3,$4,$5)";
const TECH = "select public.record_mailbox_technical_check($1,$2,$3,$4)";
const SYNC = "select public.record_mailbox_sync_result($1,$2,$3,$4,$5,$6)";
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert(re.test(e.message), `erro inesperado: ${e.message}`); return; } throw new Error("deveria falhar"); };
const PERIOD = ["2026-08-01T00:00:00Z", "2026-12-31T00:00:00Z"];
const ready = async (proj, adm, mb) => {
  await asRole("authenticated", adm, () => q(REG, [proj, mb, "Decisão de diretoria (SIM)"]));
  await asRole("service_role", null, () => q(TECH, [proj, mb, true, "getProfile ok"]));
  await asRole("authenticated", adm, () => q(SET, [proj, mb, true, ...PERIOD]));
};
const request = (proj, adm, user, email) => asRole("authenticated", adm, async () =>
  (await q("select public.request_email_access_authorization($1,$2,$3,'v1','{}'::jsonb) id", [proj, user, email])).rows[0].id);
const decide = (user, id, decision) => asRole("authenticated", user, () => q("select public.decide_email_access_authorization($1,$2,'v1')", [id, decision]));

await check("H1 Carlos e Jaime: cadastrados com obras ativas, SEM autorização => nenhum controle, nenhuma caixa na lista, nada coletável", async () => {
  for (const mb of ["carlos.evandro@axion.com.br", "jaime.ramos@axion.com.br"]) {
    for (const p of [P1, P2]) assert((await ctl(p, mb)) === undefined, `${mb} não pode ter controle`);
    assert(Number((await q("select count(*)::int n from public.email_access_authorizations where account_email=$1", [mb])).rows[0].n) === 0, "sem aceite");
    // Carlos é ADMINISTRADOR na P1: o papel NÃO autoriza a caixa dele (fora da lista explícita da obra)
    await asRole("authenticated", ADM1, () => fails(() => q(REG, [P1, mb, "tentativa"]), /MAILBOX_NOT_IN_PROJECT_ALLOWLIST/));
  }
});
await check("H2 aceite individual registrado ANTES do controle é herdado; PENDENTE não vira aceite", async () => {
  const id = await request(P1, ADM1, REY, "reynaldo@axion.com.br");
  await asRole("authenticated", ADM1, () => q(REG, [P1, "corazza@axion.com.br", "Decisão (SIM)"]));
  assert((await ctl(P1, "corazza@axion.com.br")).individual_consent_status === "NAO_REGISTRADO", "corazza sem aceite");
  await decide(REY, id, "AUTORIZADO");
  await ready(P1, ADM1, "reynaldo@axion.com.br");
  const c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.individual_consent_status === "ACEITE_REGISTRADO" && c.individual_consent_authorization_id === id && c.collection_enabled === true, JSON.stringify(c));
});
await check("H3 revogação do aceite individual DESLIGA a coleta na hora, auditada; reabilitar é recusado com erro claro", async () => {
  const id = (await q("select id from public.email_access_authorizations where account_email='reynaldo@axion.com.br' and project_id=$1", [P1])).rows[0].id;
  await asRole("authenticated", REY, () => q("select public.revoke_email_access_authorization($1,'não quero mais')", [id]));
  const c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.individual_consent_status === "REVOGADO" && c.collection_enabled === false, JSON.stringify(c));
  const a = (await q("select detail from public.audit_log_entries where action='MAILBOX_INDIVIDUAL_CONSENT_SYNCED' order by occurred_at desc limit 1")).rows[0];
  assert(/DESLIGADA/.test(a.detail), a.detail);
  await asRole("authenticated", ADM1, () => fails(() => q(SET, [P1, "reynaldo@axion.com.br", true, ...PERIOD]), /INDIVIDUAL_CONSENT_DENIED/));
  await asRole("service_role", null, () => fails(() => q(TECH, [P1, "reynaldo@axion.com.br", true, "x"]), /INDIVIDUAL_CONSENT_DENIED/));
  await fails(() => q("update public.email_mailbox_collection_controls set collection_enabled=true where project_id=$1 and mailbox_address='reynaldo@axion.com.br'", [P1]), /check constraint/i);
});
await check("H4 sucesso registrado depois de desligada/revogada NÃO avança o cursor (vira BLOQUEADA)", async () => {
  const before = (await ctl(P1, "reynaldo@axion.com.br")).last_sync_at;
  await asRole("service_role", null, () => q(SYNC, [P1, "reynaldo@axion.com.br", "SUCESSO", "10 novas", 10, "2026-11-10T00:00:00Z"]));
  const c = await ctl(P1, "reynaldo@axion.com.br");
  assert(c.last_sync_status === "BLOQUEADA" && String(c.last_sync_at) === String(before), JSON.stringify(c));
});
await check("H5 cursor independente por caixa e por obra; nunca passa do fim do período nem recua", async () => {
  await ready(P2, ADM2, "reynaldo@axion.com.br");
  await asRole("service_role", null, () => q(SYNC, [P2, "reynaldo@axion.com.br", "SUCESSO", "ok", 3, "2027-03-01T00:00:00Z"]));
  let c = await ctl(P2, "reynaldo@axion.com.br");
  assert(new Date(c.last_sync_at).toISOString() === "2026-12-31T00:00:00.000Z", `cursor além do período: ${c.last_sync_at}`);
  await asRole("service_role", null, () => q(SYNC, [P2, "reynaldo@axion.com.br", "SUCESSO", "ok", 0, "2026-09-01T00:00:00Z"]));
  c = await ctl(P2, "reynaldo@axion.com.br");
  assert(new Date(c.last_sync_at).toISOString() === "2026-12-31T00:00:00.000Z", "cursor não pode recuar");
  const p1 = await ctl(P1, "reynaldo@axion.com.br"), cz = await ctl(P1, "corazza@axion.com.br");
  assert(String(p1.last_sync_at) !== String(c.last_sync_at) && cz.last_sync_at === null, "sync de uma obra/caixa não pode mover o cursor de outra");
});
await check("H6 retentativa LIMITADA: 5 erros seguidos suspendem a coleta (auditado); reabilitar zera o contador", async () => {
  // a P2 continua habilitada; sucesso zera, erros acumulam
  for (let i = 1; i <= 4; i += 1) await asRole("service_role", null, () => q(SYNC, [P2, "reynaldo@axion.com.br", "ERRO", `HTTP 503 (${i})`, 0, null]));
  let c = await ctl(P2, "reynaldo@axion.com.br");
  assert(c.consecutive_errors === 4 && c.collection_enabled === true, JSON.stringify(c));
  await asRole("service_role", null, () => q(SYNC, [P2, "reynaldo@axion.com.br", "ERRO", "HTTP 503 (5)", 0, null]));
  c = await ctl(P2, "reynaldo@axion.com.br");
  assert(c.consecutive_errors === 5 && c.collection_enabled === false && c.last_error_at, JSON.stringify(c));
  assert((await q("select 1 from public.audit_log_entries where action='MAILBOX_COLLECTION_SUSPENDED_AFTER_ERRORS'")).rows.length === 1, "auditoria da suspensão");
  await asRole("authenticated", ADM2, () => q(SET, [P2, "reynaldo@axion.com.br", true, ...PERIOD]));
  c = await ctl(P2, "reynaldo@axion.com.br");
  assert(c.consecutive_errors === 0 && c.collection_enabled === true, JSON.stringify(c));
});
await check("H7 isolamento e dedupe: mesma mensagem Gmail duplicada na MESMA obra+caixa é recusada (23505); em outra obra é registro separado", async () => {
  const ins = (proj, mb, id) => q(`insert into public.emails (project_id, from_address, to_address, subject, sent_at, snippet, provider, provider_message_id, mailbox_address, direction)
    values ($1,'a@weg.net',$2,'s',now(),'x','GMAIL',$3,$2,'INBOUND')`, [proj, mb, id]);
  await ins(P1, "reynaldo@axion.com.br", "gm-1");
  let code = null; try { await ins(P1, "reynaldo@axion.com.br", "gm-1"); } catch (e) { code = e.code; }
  assert(code === "23505", `esperado 23505, veio ${code}`);
  await ins(P2, "reynaldo@axion.com.br", "gm-1");
  await asRole("authenticated", ADM2, async () => {
    const r = (await q("select project_id from public.emails where provider_message_id='gm-1'")).rows;
    assert(r.every((row) => row.project_id === P2), "administrador da P2 não pode ver e-mails da P1");
  });
});
await check("H8 revogar a autorização corporativa também bloqueia o registro de sucesso (cursor parado)", async () => {
  await asRole("authenticated", ADM2, () => q("select public.revoke_mailbox_collection($1,$2,$3)", [P2, "reynaldo@axion.com.br", "Fim do piloto (SIM)"]));
  const before = (await ctl(P2, "reynaldo@axion.com.br")).last_sync_at;
  await asRole("service_role", null, () => q(SYNC, [P2, "reynaldo@axion.com.br", "SUCESSO", "ok", 1, "2026-12-30T00:00:00Z"]));
  const c = await ctl(P2, "reynaldo@axion.com.br");
  assert(c.last_sync_status === "BLOQUEADA" && String(c.last_sync_at) === String(before) && c.collection_enabled === false, JSON.stringify(c));
});
await check("H9 a migration é aditiva: sem drop de tabela/coluna, funções com search_path vazio, sem seed", () => {
  const raw = readFileSync(path.join(dir, "20261121110000_email_mailbox_controls_hardening.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert(!/drop\s+(table|column)|delete\s+from|insert\s+into\s+public\.email_mailbox_collection_controls/i.test(raw), "faz mais do que deveria");
  const definers = (raw.match(/security definer/gi) ?? []).length;
  assert(definers === 5 && (raw.match(/set search_path = ''/g) ?? []).length === 6, `funções: ${definers}`);
});

await db.close();
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
