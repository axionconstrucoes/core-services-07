// Frente N4 (migration 20261121130000_outbound_delivery_states) contra PostgreSQL LOCAL descartável (PGlite): replay de
// TODAS as migrations até a anterior, dados LEGADOS, depois a migration da N4 — backfill, travas e evidência de entrega.
// Nada toca banco real, nenhuma rede, nenhum e-mail.
//
// Uso: node scripts/test-n4-envio-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
const N4 = "20261121130000_outbound_delivery_states.sql";

let passed = 0;
let failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 300)}`); failed += 1; }
}
async function expectError(promise, pattern) {
  try { await promise; } catch (e) { if (!pattern.test(String(e.message))) throw new Error(`erro inesperado: ${e.message}`); return; }
  throw new Error(`esperava erro ${pattern}, mas a operação foi aceita`);
}
const load = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");

const db = new PGlite();
await db.exec(platform);
const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
for (const f of files.filter((x) => x < N4)) await db.exec(load(f));

const P = "00000000-0000-4000-8000-0000000000a0";
const U = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const SUB = "00000000-0000-4000-8000-0000000000b1";
await db.query("insert into auth.users (id, email) values ($1,'a@axion.com.br'),($2,'b@axion.com.br')", [U, OTHER]);
await db.query("insert into public.profiles (id, name, email, origin) values ($1,'A','a@axion.com.br','AXION_INTERNO'),($2,'B','b@axion.com.br','AXION_INTERNO') on conflict (id) do nothing", [U, OTHER]);
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ('${P}', 'N4', 'Obra N4 (SIMULADA)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values ('${P}', '${U}', 'ADMINISTRADOR', 'ACTIVE', 'ENGENHARIA'), ('${P}', '${OTHER}', 'COLABORADOR', 'ACTIVE', 'ENGENHARIA');
`);
// Dados LEGADOS antes da N4 (replica: sem FK da submissão — só a tabela de entrega importa aqui): entregas SENT, FAILED e
// PENDING de acidente e linhas da outbox de risco (uma aceita).
await db.exec("set session_replication_role = replica");
await db.query(`insert into public.ssma_accident_notification_deliveries (project_id, submission_id, recipient_email, status, sent_at, provider_message_id)
  values ($1,$2,'sent@axion.com.br','SENT',now(),'g-legacy'), ($1,$2,'failed@axion.com.br','FAILED',null,null), ($1,$2,'pending@axion.com.br','PENDING',null,null)`, [P, SUB]);
await db.exec("set session_replication_role = origin");
await db.query(`insert into public.risk_alert_outbox (project_id, risk_level, notification_type, recipient_user_id, scheduled_for, status, digest_window, idempotency_key, sent_at, provider, provider_message_id)
  values ($1,'DIGEST','DIGEST',$2,now(),'SENT','2026-11-18','legacy-sent',now(),'GMAIL','g-old'), ($1,'DIGEST','DIGEST',$2,now(),'PENDING','2026-11-19','legacy-pending',null,null,null)`, [P, U]);

await db.exec(load(N4));
for (const f of files.filter((x) => x > N4)) await db.exec(load(f));
await db.exec("grant select, insert, update, delete on all tables in schema public to service_role");

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const evidence = (kind, hours, ref = "ref-1") => JSON.stringify({ kind, observedAt: new Date(Date.now() + hours * 3600e3).toISOString(), reference: ref });

console.log("\n=== N4 — estados de entrega (PGlite, replay completo) ===");

await check("1. backfill: SENT legado vira ACEITO PELO PROVEDOR (não 'entregue'); FAILED legado não é retentado (EXHAUSTED); PENDING fica PENDING", async () => {
  const sent = await one("select status, delivery_state, attempt_count from public.ssma_accident_notification_deliveries where recipient_email='sent@axion.com.br'");
  assert(sent.delivery_state === "ACCEPTED_BY_PROVIDER", JSON.stringify(sent));
  const fail = await one("select failure_class from public.ssma_accident_notification_deliveries where recipient_email='failed@axion.com.br'");
  assert(fail.failure_class === "EXHAUSTED", JSON.stringify(fail));
  const pend = await one("select status, delivery_state, failure_class from public.ssma_accident_notification_deliveries where recipient_email='pending@axion.com.br'");
  assert(pend.status === "PENDING" && pend.delivery_state === null && pend.failure_class === null);
  const risk = await one("select delivery_state from public.risk_alert_outbox where idempotency_key='legacy-sent'");
  assert(risk.delivery_state === "ACCEPTED_BY_PROVIDER");
});

await check("2. SENT grava automaticamente ACEITO PELO PROVEDOR; linha aceita nunca volta a PENDING/FAILED", async () => {
  await db.exec("update public.risk_alert_outbox set status='SENT', sent_at=now(), provider='GMAIL', provider_message_id='g1' where idempotency_key='legacy-pending'");
  const r = await one("select status, delivery_state, delivery_state_at from public.risk_alert_outbox where idempotency_key='legacy-pending'");
  assert(r.delivery_state === "ACCEPTED_BY_PROVIDER" && r.delivery_state_at, JSON.stringify(r));
  await expectError(db.exec("update public.risk_alert_outbox set status='PENDING', sent_at=null where idempotency_key='legacy-pending'"), /não pode voltar|check/i);
  await expectError(db.exec("update public.ssma_accident_notification_deliveries set status='FAILED', sent_at=null where recipient_email='sent@axion.com.br'"), /não pode voltar|check/i);
});

await check("3. ENTREGUE/DEVOLVIDO sem evidência suficiente é recusado (entrega nunca presumida)", async () => {
  await expectError(db.exec("update public.risk_alert_outbox set delivery_state='DELIVERED' where idempotency_key='legacy-sent'"), /exige evidência/);
  await expectError(db.exec(`update public.risk_alert_outbox set delivery_state='DELIVERED', delivery_evidence='[${evidence("SENT_COPY_VERIFIED", 1)}]'::jsonb where idempotency_key='legacy-sent'`), /exige evidência/);
  await expectError(db.exec("update public.risk_alert_outbox set delivery_state='BOUNCED' where idempotency_key='legacy-sent'"), /exige evidência/);
  await expectError(db.query("insert into public.risk_alert_outbox (project_id, risk_level, notification_type, recipient_user_id, scheduled_for, status, digest_window, idempotency_key, delivery_state) values ($1,'DIGEST','DIGEST',$2,now(),'PENDING','2026-11-20','novo-pendente','ACCEPTED_BY_PROVIDER')", [P, U]), /delivery_state só existe/);
});

await check("4. record_outbound_delivery_evidence: Enviados sozinho mantém ACEITO; + sem devolução após 24 h => ENTREGUE; evidência não pode ser descartada", async () => {
  const id = (await one("select id from public.risk_alert_outbox where idempotency_key='legacy-sent'")).id;
  await db.exec("set role service_role");
  try {
    const a = await one("select public.record_outbound_delivery_evidence('risk_alert_outbox', $1, $2::jsonb) as s", [id, evidence("SENT_COPY_VERIFIED", 1, "msgid-1")]);
    assert(a.s === "ACCEPTED_BY_PROVIDER", a.s);
    const b = await one("select public.record_outbound_delivery_evidence('risk_alert_outbox', $1, $2::jsonb) as s", [id, evidence("NO_BOUNCE_AFTER_WINDOW", 30, "verif-1")]);
    assert(b.s === "DELIVERED", b.s);
  } finally { await db.exec("reset role"); }
  const r = await one("select delivery_state, jsonb_array_length(delivery_evidence) n from public.risk_alert_outbox where id=$1", [id]);
  assert(r.delivery_state === "DELIVERED" && r.n === 2, JSON.stringify(r));
  await expectError(db.query("update public.risk_alert_outbox set delivery_state='ACCEPTED_BY_PROVIDER' where id=$1", [id]), /não pode ser descartada/);
});

await check("5. evidência só para mensagem aceita; tabela fora da lista e evidência sem referência são recusadas; authenticated não executa", async () => {
  const pending = (await one("select id from public.ssma_accident_notification_deliveries where recipient_email='pending@axion.com.br'")).id;
  await expectError(db.query("select public.record_outbound_delivery_evidence('ssma_accident_notification_deliveries', $1, $2::jsonb)", [pending, evidence("RECIPIENT_REPLY", 1)]), /aceita pelo provedor/);
  await expectError(db.query("select public.record_outbound_delivery_evidence('profiles', $1, $2::jsonb)", [pending, evidence("RECIPIENT_REPLY", 1)]), /não suportada/);
  const sent = (await one("select id from public.ssma_accident_notification_deliveries where recipient_email='sent@axion.com.br'")).id;
  await expectError(db.query(`select public.record_outbound_delivery_evidence('ssma_accident_notification_deliveries', $1, '{"kind":"RECIPIENT_REPLY","observedAt":"2026-11-21T00:00:00Z","reference":" "}'::jsonb)`, [sent]), /Evidência inválida/);
  const reply = await one("select public.record_outbound_delivery_evidence('ssma_accident_notification_deliveries', $1, $2::jsonb) as s", [sent, evidence("RECIPIENT_REPLY", 2, "gmail-reply-9")]);
  assert(reply.s === "DELIVERED", reply.s);
  await db.exec("set role authenticated");
  try { await expectError(db.query("select public.record_outbound_delivery_evidence('risk_alert_outbox', gen_random_uuid(), '{}'::jsonb)"), /permission denied/); } finally { await db.exec("reset role"); }
});

await check("6. failure_class e delivery_state restritos aos valores válidos; SENT exige sent_at nas tabelas novas", async () => {
  await expectError(db.exec("update public.ssma_accident_notification_deliveries set failure_class='QUALQUER' where recipient_email='failed@axion.com.br'"), /check/);
  await expectError(db.exec("update public.risk_alert_outbox set failure_class='X' where idempotency_key='legacy-sent'"), /check/);
  const INC = "00000000-0000-4000-8000-0000000000c1";
  await db.query("insert into public.acc_system_health_incidents (id, project_id, source_type, fingerprint, summary) values ($1,$2,'GMAIL','fp-1','s')", [INC, P]);
  await expectError(db.query("insert into public.acc_system_health_alert_deliveries (project_id, incident_id, recipient_email, status) values ($1,$2,'x@axion.com.br','SENT')", [P, INC]), /check|violates/);
  await db.query("insert into public.acc_system_health_alert_deliveries (project_id, incident_id, recipient_email) values ($1,$2,'x@axion.com.br')", [P, INC]);
  await expectError(db.query("insert into public.acc_system_health_alert_deliveries (project_id, incident_id, recipient_email) values ($1,$2,'x@axion.com.br')", [P, INC]), /duplicate|unique/);
  await expectError(db.query("insert into public.acc_system_health_alert_deliveries (project_id, incident_id, recipient_email) values ($1,$2,'X@axion.com.br')", [P, INC]), /check/);
});

await check("7. reivindicação condicional (mesma forma do store): só uma execução ganha a linha; tentativa contada", async () => {
  const INC = "00000000-0000-4000-8000-0000000000c1";
  const id = (await one("select id from public.acc_system_health_alert_deliveries where incident_id=$1", [INC])).id;
  const claim = `update public.acc_system_health_alert_deliveries set attempt_count = attempt_count + 1, claimed_at = now()
     where id = $1 and attempt_count = 0 and status in ('PENDING','FAILED') and (claimed_at is null or claimed_at < now() - interval '10 minutes') returning id`;
  const a = await db.query(claim, [id]);
  const b = await db.query(claim, [id]);
  assert(a.rows.length === 1 && b.rows.length === 0, `${a.rows.length}/${b.rows.length}`);
  await db.query("update public.acc_system_health_alert_deliveries set status='SENT', sent_at=now(), provider='FAKE', provider_message_id='f1', claimed_at=null where id=$1", [id]);
  const row = await one("select delivery_state from public.acc_system_health_alert_deliveries where id=$1", [id]);
  assert(row.delivery_state === "ACCEPTED_BY_PROVIDER");
});

await check("8. RLS: entregas da falha técnica visíveis só ao ADMIN da obra; authenticated não grava", async () => {
  await db.exec(`select set_config('app.uid','${OTHER}',false); set role authenticated;`);
  try {
    const seen = (await db.query("select count(*)::int c from public.acc_system_health_alert_deliveries")).rows[0].c;
    assert(seen === 0, `colaborador viu ${seen}`);
    await expectError(db.query("insert into public.acc_system_health_alert_deliveries (project_id, incident_id, recipient_email) values ($1, gen_random_uuid(), 'y@axion.com.br')", [P]), /permission denied|row-level/);
  } finally { await db.exec("reset role"); }
  await db.exec(`select set_config('app.uid','${U}',false); set role authenticated;`);
  try {
    const seen = (await db.query("select count(*)::int c from public.acc_system_health_alert_deliveries")).rows[0].c;
    assert(seen === 1, `administrador viu ${seen}`);
  } finally { await db.exec("reset role"); }
});

await check("9. notification_email_deliveries: DELIVERED só com evidência; aceita não regride", async () => {
  await db.exec(`alter table public.notification_email_deliveries drop constraint if exists notification_email_deliveries_notification_id_project_id_fkey;`);
  for (const c of (await db.query("select conname from pg_constraint where conrelid='public.notification_email_deliveries'::regclass and contype='f'")).rows) {
    await db.exec(`alter table public.notification_email_deliveries drop constraint "${c.conname}"`);
  }
  const id = (await one("insert into public.notification_email_deliveries (notification_id, project_id, recipient_email, direction, status, sent_at) values (gen_random_uuid(), $1, 'a@axion.com.br', 'OUTBOUND', 'SENT', now()) returning id", [P])).id;
  await expectError(db.query("update public.notification_email_deliveries set status='DELIVERED' where id=$1", [id]), /exige evidência/);
  await expectError(db.query("update public.notification_email_deliveries set status='FAILED' where id=$1", [id]), /não pode voltar/);
  await db.query(`update public.notification_email_deliveries set status='DELIVERED', delivery_evidence=jsonb_build_array($2::jsonb) where id=$1`, [id, evidence("RECIPIENT_REPLY", 1)]);
});

console.log("");
console.log(`Resultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
