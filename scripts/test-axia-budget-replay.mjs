// Etapa 2 da implantação da AXIA conversacional: a migration 20261105150000_axia_chat_budget.sql aplicada sobre o SCHEMA COMPLETO
// do ACC (as 127 migrations anteriores reaplicadas, em ordem) em um PostgreSQL 17 descartável (PGlite, em memória) — o mais
// próximo da produção que cabe sem o Docker (indisponível neste computador: sem WSL). NUNCA toca banco real.
//
// Prova: (1) a migration NÃO altera nenhuma tabela, política, privilégio ou função existente nem os dados (impressão digital
// do schema antes × depois); (2) as seis funções são SECURITY DEFINER com search_path vazio e sem EXECUTE para
// public/anon/authenticated; (3) só o service_role acessa; (4) o comportamento financeiro (concorrência, liquidação, incerteza,
// idempotência) funciona com o schema completo e com um dono SEM BYPASSRLS (pior caso do Supabase).
//
// Limites do substituto: usa stubs mínimos de auth/storage (não é o Supabase real) e `pgcrypto` removido (gen_random_uuid é nativo).
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");
const NEW = "20261105150000_axia_chat_budget.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role supabase_admin nologin;
create schema auth; create schema storage; create schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
-- privilégios padrão do Supabase: objetos novos em public nascem acessíveis a anon/authenticated/service_role
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;
const read = (f) => readFileSync(path.join(dir, f), "utf8").split("﻿").join("").replace(/create extension if not exists pgcrypto;?/gi, "");

const db = new PGlite();
await db.exec(STUB);
for (const f of files.filter((x) => x !== NEW)) await db.exec(read(f));
t(`schema completo reaplicado: ${files.length - 1} migrations anteriores em ordem, sem erro`, true);

// impressão digital do que JÁ EXISTE (tudo menos objetos axia_chat_*)
async function fingerprint() {
  const q = async (sql) => (await db.query(sql)).rows;
  const parts = {
    columns: await q("select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema in ('public','auth','storage') and table_name not like 'axia_chat_%' order by 1,2"),
    tables: await q("select c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relname not like 'axia_chat_%' and c.relkind in ('r','v','m','S','i') order by 1"),
    policies: await q("select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies where tablename not like 'axia_chat_%' order by 1,2,3"),
    grants: await q("select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema in ('public','auth','storage') and table_name not like 'axia_chat_%' order by 1,2,3,4"),
    functions: await q("select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, md5(pg_get_functiondef(p.oid)) def, p.prosecdef, p.proconfig::text cfg, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage') and p.proname not like 'axia_chat_%' order by 1,2,3"),
    triggers: await q("select tgname, tgrelid::regclass::text rel from pg_trigger where not tgisinternal and tgrelid::regclass::text not like '%axia_chat_%' order by 1,2"),
    indexes: await q("select tablename, indexname, indexdef from pg_indexes where schemaname in ('public','auth','storage') and tablename not like 'axia_chat_%' order by 1,2"),
  };
  const tableNames = parts.tables.filter((r) => r.relkind === "r").map((r) => `${r.relname}`);
  const counts = {};
  for (const tn of tableNames) { try { counts[tn] = Number((await db.query(`select count(*)::int c from public."${tn}"`)).rows[0].c); } catch { counts[tn] = "n/a"; } }
  parts.counts = counts;
  return { hash: createHash("sha256").update(JSON.stringify(parts)).digest("hex"), sizes: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])) };
}
const before = await fingerprint();

// aplica a migration como DONO SEM BYPASSRLS
await db.exec("create role mig_owner nologin; grant create, usage on schema public to mig_owner;");
await db.exec("set role mig_owner");
await db.exec(read(NEW));
await db.exec("reset role");
t("migration aplicada sobre o schema completo, sem erro", true);

const after = await fingerprint();
t(`NENHUMA tabela, coluna, política, privilégio, índice, gatilho, função ou dado existente foi alterado (impressão digital idêntica: ${Object.entries(before.sizes).map(([k, v]) => `${k}=${v}`).join(", ")})`, before.hash === after.hash);

const objs = (await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'axia_chat_%' and c.relkind='r' order by 1")).rows.map((r) => r.relname);
t("cria SOMENTE 3 tabelas novas (axia_chat_*)", objs.join(",") === "axia_chat_budget_day,axia_chat_budget_user_day,axia_chat_reservations");
const fns = (await db.query("select p.proname, p.prosecdef, p.proconfig::text cfg, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('public', p.oid, 'execute') pub, has_function_privilege('service_role', p.oid, 'execute') s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'axia_chat_%' order by 1")).rows;
t("6 funções: SECURITY DEFINER e search_path vazio", fns.length === 6 && fns.every((f) => f.prosecdef && /search_path=(\\"\\"|"")/.test(f.cfg ?? "")));
t("EXECUTE: negado a PUBLIC, anon e authenticated; concedido ao service_role", fns.every((f) => !f.a && !f.u && !f.pub && f.s));
const tabs = (await db.query("select c.relname, c.relrowsecurity, has_table_privilege('anon', c.oid, 'select') a, has_table_privilege('authenticated', c.oid, 'select') u, has_table_privilege('authenticated', c.oid, 'insert') ui, has_table_privilege('service_role', c.oid, 'select') s from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'axia_chat_%' and c.relkind='r'")).rows;
t("tabelas: RLS ligada; sem privilégio para anon/authenticated; service_role acessa", tabs.length === 3 && tabs.every((x) => x.relrowsecurity && !x.a && !x.u && !x.ui && x.s));
const idx = (await db.query("select indexname from pg_indexes where schemaname='public' and tablename like 'axia_chat_%'")).rows.map((r) => r.indexname);
t("índices: chaves primárias das 3 tabelas e axia_chat_reservations_state_idx", idx.includes("axia_chat_reservations_state_idx") && idx.filter((i) => i.endsWith("_pkey")).length === 3);

// papéis: anon/authenticated negados; service_role funciona
const attempt = async (role, sql) => { await db.exec(`set role ${role}`); try { await db.query(sql); return "ok"; } catch (e) { return /permission denied/i.test(String(e.message)) ? "negado" : `erro:${String(e.message).slice(0, 60)}`; } finally { await db.exec("reset role"); } };
const matrix = [];
for (const role of ["anon", "authenticated"]) for (const sql of ["select * from public.axia_chat_budget_day", "insert into public.axia_chat_budget_day (day) values (current_date)", "select public.axia_chat_reserve(null, 1, 1, 1)", "select public.axia_chat_settle(gen_random_uuid(), 0)", "select public.axia_chat_release(gen_random_uuid())", "select public.axia_chat_mark_uncertain(gen_random_uuid())", "select public.axia_chat_late_settle(gen_random_uuid(), 0)", "select public.axia_chat_reconcile()"]) matrix.push(await attempt(role, sql));
t(`anon e authenticated: ${matrix.length}/${matrix.length} tentativas (tabela e 6 funções) NEGADAS`, matrix.every((r) => r === "negado"));

// comportamento financeiro com o schema completo, como service_role
await db.exec("set role service_role");
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reserve = (u, res = 1000, budget = 10_000_000, calls = 1000) => one("select public.axia_chat_reserve($1::uuid,$2::bigint,$3::bigint,$4::int) v", [u, res, budget, calls]).then((r) => r.v);
const day = () => one("select spent_micros::int s, calls c from public.axia_chat_budget_day order by day desc limit 1");

// concorrência: 400 pedidos simultâneos, 40 usuários (10 cada, limite 4), teto de 100 reservas
const results = await Promise.all(Array.from({ length: 400 }, (_, i) => reserve(U(1 + (i % 40)), 1000, 100_000, 4)));
const granted = results.filter(Boolean);
let d = await day();
const per = (await db.query("select max(calls)::int m, sum(calls)::int s from public.axia_chat_budget_user_day")).rows[0];
t(`concorrência (400 pedidos, 40 usuários, limite 4/usuário, teto 100 mil micros): concedidas=${granted.length} (esperado 100 = teto 100 mil ÷ 1000, limitado a 40×4=160)`, granted.length === 100 && d.s === 100_000 && d.c === 100 && per.m <= 4 && per.s === 100);
t("ids de reserva únicos", new Set(granted).size === granted.length);
const sFirst = await Promise.all(granted.slice(0, 20).flatMap((id) => [one("select public.axia_chat_settle($1::uuid, 400) v", [id]), one("select public.axia_chat_settle($1::uuid, 999) v", [id])]));
d = await day();
t("liquidação idempotente sob concorrência: 20 reservas × 2 settles simultâneos → cada uma liquidada UMA vez (20 × (400 − 1000))", sFirst.filter((r) => r.v !== null).length === 20 && d.s === 100_000 - 20 * 600);
const inc = granted[30];
await one("select public.axia_chat_mark_uncertain($1::uuid)", [inc]);
const rel = await one("select public.axia_chat_release($1::uuid) v", [inc]);
const st = (await one("select state from public.axia_chat_reservations where id=$1::uuid", [inc])).state;
t("incerta não é devolvida (release ignora; pior caso permanece)", rel.v === false && st === "uncertain" && (await day()).s === d.s);
const late = await one("select public.axia_chat_late_settle($1::uuid, 300) v", [inc]);
t("conclusão tardia ajusta uma vez", late.v === 300 && (await day()).s === d.s - 700 && (await one("select public.axia_chat_late_settle($1::uuid, 1) v", [inc])).v === null);
const plain = granted[50];
await one("select public.axia_chat_release($1::uuid)", [plain]);
t("release de chamada não cobrada devolve reserva e chamada", (await day()).s === d.s - 700 - 1000 && (await day()).c === d.c - 1);
await one("update public.axia_chat_reservations set created_at = now() - interval '20 minutes' where id = $1::uuid", [granted[60]]);
t("reconcile: reserva parada vira incerta sem mudar o total", (await one("select public.axia_chat_reconcile() v")).v === 1 && (await one("select state from public.axia_chat_reservations where id=$1::uuid", [granted[60]])).state === "uncertain");
let bad2 = null;
try { await reserve(U(1), 0, 1000, 1); } catch (e) { bad2 = String(e.message); }
t("parâmetros inválidos são rejeitados", /inválidos/.test(bad2 ?? ""));
t("sem pergunta, resposta ou e-mail nas tabelas novas", (await db.query("select column_name from information_schema.columns where table_name like 'axia_chat_%'")).rows.every((r) => !/question|response|email|message|text|content/i.test(r.column_name)));

console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
