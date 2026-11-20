// (1) A migration N4 (20261121130000_outbound_delivery_states) é IDEMPOTENTE: aplicada 1x, depois reaplicada 2x sobre dados
//     legados + novos, produz o MESMO schema (colunas, constraints incl. validade, índices, funções, triggers, policies,
//     grants) e os mesmos dados; a trava "SENT nunca volta" continua valendo depois das reaplicações.
// (2) Funções SECURITY DEFINER NÃO ficam executáveis por anon (ACL padrão do Supabase concede EXECUTE a anon):
//     list_addable_profiles_for_project em particular; só a lista fechada abaixo (funções de plataforma/gatilho que já
//     existiam e são executáveis por anon na produção) pode permanecer.
// PGlite local, sem rede. Uso: node scripts/test-n4-idempotence-and-anon-revoke-sql.mjs

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
const load = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");

const db = new PGlite();
await db.exec(platform);
const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
for (const f of files.filter((x) => x < N4)) await db.exec(load(f));

const P = "00000000-0000-4000-8000-0000000000c0";
const U = "00000000-0000-4000-8000-0000000000c1";
const SUB = "00000000-0000-4000-8000-0000000000d1";
await db.query("insert into auth.users (id, email) values ($1,'c@axion.com.br')", [U]);
await db.query("insert into public.profiles (id, name, email, origin) values ($1,'C','c@axion.com.br','AXION_INTERNO') on conflict (id) do nothing", [U]);
await db.exec(`insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ('${P}', 'N4I', 'Obra N4 idempotencia (SIMULADA)', 'x', 'x', date '2026-01-01', date '2027-01-01');`);
await db.exec("set session_replication_role = replica");
await db.query(`insert into public.ssma_accident_notification_deliveries (project_id, submission_id, recipient_email, status, sent_at, provider_message_id)
  values ($1,$2,'sent@axion.com.br','SENT',now(),'g-legacy'), ($1,$2,'failed@axion.com.br','FAILED',null,null), ($1,$2,'pending@axion.com.br','PENDING',null,null)`, [P, SUB]);
await db.exec("set session_replication_role = origin");
await db.query(`insert into public.risk_alert_outbox (project_id, risk_level, notification_type, recipient_user_id, scheduled_for, status, digest_window, idempotency_key, sent_at, provider, provider_message_id)
  values ($1,'DIGEST','DIGEST',$2,now(),'SENT','2026-11-18','legacy-sent',now(),'GMAIL','g-old'), ($1,'DIGEST','DIGEST',$2,now(),'PENDING','2026-11-19','legacy-pending',null,null,null)`, [P, U]);

const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];

// Impressão digital completa do schema public + dados das tabelas tocadas pela N4 (sem timestamps now()).
async function fingerprint() {
  const L = [];
  const add = (k, rs) => rs.forEach((r) => L.push(`${k}|${r}`));
  add("C", (await rows("select table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') r from information_schema.columns where table_schema='public'")).map((r) => r.r));
  add("K", (await rows("select k.relname||'|'||o.conname||'|'||o.convalidated||'|'||pg_get_constraintdef(o.oid) r from pg_constraint o join pg_class k on k.oid=o.conrelid where o.connamespace='public'::regnamespace")).map((r) => r.r));
  add("I", (await rows("select indexdef r from pg_indexes where schemaname='public'")).map((r) => r.r));
  add("F", (await rows(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(pg_get_functiondef(p.oid))||'|anon='||has_function_privilege('anon',p.oid,'execute')||'|auth='||has_function_privilege('authenticated',p.oid,'execute')||'|svc='||has_function_privilege('service_role',p.oid,'execute') r from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')`)).map((r) => r.r));
  add("G", (await rows("select pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text r from pg_trigger t join pg_class k on k.oid=t.tgrelid where not t.tgisinternal and k.relnamespace='public'::regnamespace")).map((r) => r.r));
  add("P", (await rows("select tablename||'|'||policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') r from pg_policies where schemaname='public'")).map((r) => r.r));
  add("R", (await rows("select table_name||'|'||grantee||'|'||privilege_type r from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')")).map((r) => r.r));
  add("M", (await rows("select c.relname||'.'||a.attname||'|'||coalesce(col_description(c.oid,a.attnum),'') r from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 where c.relnamespace='public'::regnamespace and col_description(c.oid,a.attnum) is not null")).map((r) => r.r));
  const dados = [
    ["risk_alert_outbox", "idempotency_key, status, delivery_state, failure_class, delivery_evidence::text"],
    ["ssma_accident_notification_deliveries", "recipient_email, status, delivery_state, failure_class, attempt_count, delivery_evidence::text"],
  ];
  for (const [t, cols] of dados) add(`D:${t}`, (await rows(`select concat_ws('|', ${cols}) r from public.${t} order by 1`)).map((r) => r.r));
  return L.sort();
}
const diff = (a, b) => ({ soNaPrimeira: a.filter((x) => !b.includes(x)), soNaSegunda: b.filter((x) => !a.includes(x)) });

console.log("\n=== N4 idempotente + anon sem EXECUTE (PGlite, replay completo) ===");

await db.exec(load(N4));
const first = await fingerprint();
const firstTime = await rows("select recipient_email, delivery_state_at is not null has_at from public.ssma_accident_notification_deliveries order by 1");

await check("1. reaplicar a N4 uma 2ª vez não dá erro e o schema/dados ficam idênticos aos da 1ª aplicação", async () => {
  await db.exec(load(N4));
  const d = diff(first, await fingerprint());
  assert(!d.soNaPrimeira.length && !d.soNaSegunda.length, JSON.stringify(d).slice(0, 600));
});

await check("2. reaplicar a N4 uma 3ª vez também é idempotente (sem acumular objetos)", async () => {
  await db.exec(load(N4));
  const d = diff(first, await fingerprint());
  assert(!d.soNaPrimeira.length && !d.soNaSegunda.length, JSON.stringify(d).slice(0, 600));
  const n = await one("select count(*)::int n from pg_constraint where conrelid='public.risk_alert_outbox'::regclass and conname like 'risk_alert_outbox_delivery%'");
  assert(n.n === 3, `constraints duplicadas/ausentes: ${n.n}`);
  const t = await one("select count(*)::int n from pg_trigger where tgname='risk_alert_outbox_delivery_guard' and not tgisinternal");
  assert(t.n === 1);
});

await check("3. o backfill legado não é refeito/alterado nas reaplicações (delivery_state_at preservado; FAILED legado segue EXHAUSTED)", async () => {
  const now = await rows("select recipient_email, delivery_state_at is not null has_at from public.ssma_accident_notification_deliveries order by 1");
  assert(JSON.stringify(now) === JSON.stringify(firstTime), JSON.stringify(now));
  const f = await one("select failure_class from public.ssma_accident_notification_deliveries where recipient_email='failed@axion.com.br'");
  assert(f.failure_class === "EXHAUSTED");
});

await check("4. a trava SENT -> nunca volta continua valendo após as reaplicações", async () => {
  let erro = null;
  try { await db.exec("update public.risk_alert_outbox set status='PENDING', sent_at=null where idempotency_key='legacy-sent'"); } catch (e) { erro = String(e.message); }
  assert(erro && /não pode voltar|check_violation|violates/i.test(erro), `aceitou regressão: ${erro}`);
  const r = await one("select status, delivery_state from public.risk_alert_outbox where idempotency_key='legacy-sent'");
  assert(r.status === "SENT" && r.delivery_state === "ACCEPTED_BY_PROVIDER", JSON.stringify(r));
});

await check("5. constraints NOT VALID da N4 permanecem NOT VALID (mesma semântica da 1ª aplicação)", async () => {
  const r = await rows("select conname, convalidated from pg_constraint where conname in ('ssma_accident_deliveries_sent_at_check','version_review_deliveries_sent_at_check')");
  assert(r.length === 2 && r.every((x) => x.convalidated === false), JSON.stringify(r));
});

// ---- resto da pilha e ACL
for (const f of files.filter((x) => x > N4)) await db.exec(load(f));

await check("6. list_addable_profiles_for_project: anon SEM execute; authenticated e service_role COM execute", async () => {
  const r = await one(`select has_function_privilege('anon', 'public.list_addable_profiles_for_project(uuid)', 'execute') a,
    has_function_privilege('authenticated', 'public.list_addable_profiles_for_project(uuid)', 'execute') u,
    has_function_privilege('service_role', 'public.list_addable_profiles_for_project(uuid)', 'execute') s`);
  assert(r.a === false, "anon ainda executa");
  assert(r.u === true, "authenticated perdeu execute (o app usa esta RPC)");
  assert(r.s === true);
});

// Funções SECURITY DEFINER já executáveis por anon antes das migrations desta frente (herdadas; fora do escopo): lista fechada.
const ANON_SECDEF_HERDADAS = new Set([
  "handle_new_user", "has_project_permission", "is_any_project_admin", "is_project_member", "is_shared_project_admin",
  "prevent_last_administrator_removal", "project_delivery_items_log_risk_change", "set_document_version_project_id",
]);
await check("7. nenhuma função SECURITY DEFINER nova (migrations 20261107..20261121) é executável por anon", async () => {
  const r = await rows(`select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p
    where p.pronamespace='public'::regnamespace and p.prosecdef and p.prokind in ('f','p')
      and has_function_privilege('anon', p.oid, 'execute') order by 1`);
  const novas = r.filter((x) => !ANON_SECDEF_HERDADAS.has(x.proname));
  assert(novas.length === 0, `anon executa: ${novas.map((x) => `${x.proname}(${x.args})`).join(", ")}`);
});

await check("8. RPCs de negócio das migrations novas são authenticated-only (sem anon) e service_role-only onde aplicável", async () => {
  const r = await one(`select
    has_function_privilege('anon','public.record_outbound_delivery_evidence(text,uuid,jsonb)','execute') a,
    has_function_privilege('authenticated','public.record_outbound_delivery_evidence(text,uuid,jsonb)','execute') u,
    has_function_privilege('service_role','public.record_outbound_delivery_evidence(text,uuid,jsonb)','execute') s`);
  assert(r.a === false && r.u === false && r.s === true, JSON.stringify(r));
});

console.log("");
console.log(`Resultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
