#!/usr/bin/env node
// Aplicação das migrations do repositório SOMENTE em um projeto-alvo de HOMOLOGAÇÃO ISOLADA (Fase 6 / H1).
//
// SEGURANÇA (guarda dura em guard.mjs): recusa o Supabase operacional (plbcvwostmdmdmrziwmd e demais projetos da org), qualquer host
// desconhecido e qualquer alvo que não tenha sido confirmado por HOMOLOG_TARGET_REF + HOMOLOG_I_UNDERSTAND_ISOLATED=true.
// Além da guarda de URL, exige o MARCADOR de banco `acc_homolog_marker` (criado por --init-marker em banco VAZIO): um projeto que já tem
// dados do ACC e não foi marcado como homologação é recusado.
//
// A string de conexão vem SEMPRE de HOMOLOG_DATABASE_URL (nunca por argumento, nunca impressa). Padrão = DRY-RUN (não conecta).
//
// Uso:
//   node scripts/homolog/apply-migrations.mjs                       # dry-run: valida alvo (se definido), lista o que seria aplicado
//   node scripts/homolog/apply-migrations.mjs --init-marker         # cria o marcador (só banco vazio)
//   node scripts/homolog/apply-migrations.mjs --apply [--through=20261210999999]
//   node scripts/homolog/apply-migrations.mjs --verify              # somente leitura: pendentes, RLS, P0
//   LOCAL (descartável 127.0.0.1:55434, banco acc_homolog_*): acrescente --create-local-db --local-platform-stub
//     (o Postgres local não tem GoTrue/roles do Supabase: o stub cria roles anon/authenticated/service_role e o schema auth mínimo).
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTarget, forbiddenEnvNames, redactedTarget } from "./guard.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const die = (m, code = 2) => { console.error(`RECUSADO/ERRO: ${m}`); process.exit(code); };

export const P0_FUNCTION = "record_risk_alert_action";
export const P0_MD5 = "930f6d75898793479b418950b0053bd9"; // md5 do corpo no operacional (referência de integridade; em homologação é a versão das migrations)

export function listMigrations(dir = path.join(root, "supabase", "migrations")) {
  return readdirSync(dir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ file: f, version: f.slice(0, 14), name: f.slice(15, -4), path: path.join(dir, f) }));
}

function platformStub() {
  const src = readFileSync(path.join(root, "scripts", "test-migrations-full-replay.mjs"), "utf8");
  const base = src.match(/const PLATFORM = `([\s\S]*?)`;/)[1];
  const gotrue = `
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;`;
  return base.replace(/^create role .*$/gm, "").replace(/^create function auth\.(uid|role|jwt)\(\).*$/gm, "-- stub removido") + "\n" + gotrue;
}

async function main() {
  const migrations = listMigrations();
  const through = opt("through");
  const planned = migrations.filter((m) => !through || m.version <= through);
  const apply = has("apply");
  const verify = has("verify");
  const initMarker = has("init-marker");
  const rawUrl = process.env.HOMOLOG_DATABASE_URL;

  const badEnv = forbiddenEnvNames();
  if (badEnv.length) die(`variáveis do ambiente operacional presentes (${badEnv.join(", ")}); rode o kit em um shell limpo`);

  let linked = "";
  const linkFile = path.join(root, "supabase", ".temp", "project-ref");
  if (existsSync(linkFile)) linked = readFileSync(linkFile, "utf8");

  if (!rawUrl) {
    console.log(`DRY-RUN (HOMOLOG_DATABASE_URL não definida; nada foi conectado). ${planned.length} migrations seriam consideradas (${planned[0]?.version} .. ${planned.at(-1)?.version}).`);
    if (apply || verify || initMarker) die("--apply/--verify/--init-marker exigem HOMOLOG_DATABASE_URL");
    return;
  }
  const verdict = evaluateTarget(rawUrl, { env: process.env, linkedRefText: linked });
  if (!verdict.ok) die(verdict.reason);
  console.log(`Alvo aprovado pela guarda: ${redactedTarget(verdict)}`);

  const pkgDir = process.env.ACC_REALPG_PKG_DIR ?? root;
  const pg = createRequire(path.join(pkgDir, "x.js"))("pg");
  const ssl = verdict.kind === "remote" ? { rejectUnauthorized: false } : undefined; // Supabase exige TLS; CA própria da plataforma

  if (verdict.kind === "local" && has("create-local-db")) {
    const a = new URL(rawUrl); a.pathname = "/postgres";
    const admin = new pg.Client({ connectionString: a.toString() });
    await admin.connect();
    const ex = await admin.query("select 1 from pg_database where datname=$1", [verdict.database]);
    if (!ex.rowCount) await admin.query(`create database ${verdict.database} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
    await admin.end();
    console.log(`Banco local ${verdict.database}: ${ex.rowCount ? "já existia" : "criado"}.`);
  }

  const db = new pg.Client({ connectionString: rawUrl, ssl, statement_timeout: 0 });
  await db.connect();
  try {
    if (verdict.kind === "local" && has("local-platform-stub")) {
      const has_auth = (await db.query("select 1 from pg_namespace where nspname='auth'")).rowCount;
      if (!has_auth) { await db.query(platformStub()); console.log("Stub de plataforma (roles + schema auth mínimo) aplicado (SOMENTE local)."); }
    }
    const marker = (await db.query("select 1 from pg_namespace where nspname='acc_homolog_marker'")).rowCount > 0;

    if (initMarker) {
      if (marker) { console.log("Marcador já existe."); return; }
      const t = (await db.query("select to_regclass('public.projects') as r")).rows[0].r;
      if (t) {
        const n = Number((await db.query("select count(*) c from public.projects")).rows[0].c);
        if (n > 0) die("banco NÃO está vazio (public.projects tem linhas): não vou marcá-lo como homologação");
      }
      await db.query("create schema acc_homolog_marker; comment on schema acc_homolog_marker is 'Projeto de HOMOLOGACAO ISOLADA do ACC (Fase 6/H1). Nunca operacional.'");
      console.log("Marcador acc_homolog_marker criado.");
      return;
    }
    if (!marker) die("marcador acc_homolog_marker ausente: rode --init-marker em banco vazio de homologação (ou o alvo NÃO é de homologação)");

    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
    const done = new Set((await db.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
    const pending = planned.filter((m) => !done.has(m.version));

    if (verify) {
      const noRls = (await db.query("select count(*)::int c from pg_tables where schemaname='public' and not rowsecurity")).rows[0].c;
      const p0 = (await db.query(
        "select md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1", [P0_FUNCTION])).rows;
      console.log(JSON.stringify({ alvo: redactedTarget(verdict), migrations_no_repo: planned.length, registradas: done.size, pendentes: pending.length, tabelas_public_sem_rls: noRls, p0_funcoes: p0.length }));
      return;
    }

    console.log(`Migrations: ${planned.length} no repositório, ${planned.length - pending.length} já registradas, ${pending.length} pendentes.`);
    if (!apply) { console.log("DRY-RUN: nada aplicado (use --apply)."); pending.slice(0, 5).forEach((m) => console.log(`  próxima: ${m.version} ${m.name}`)); return; }

    let n = 0;
    for (const m of pending) {
      const sql = readFileSync(m.path, "utf8").replace(/^﻿/, "");
      try {
        await db.query("begin");
        await db.query("set local lock_timeout='10s'");
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)", [m.version, m.name, [sql]]);
        await db.query("commit");
        n += 1;
      } catch (e) {
        await db.query("rollback").catch(() => {});
        die(`falha em ${m.file} (nada desta migration foi gravado; ${n} anteriores aplicadas): ${String(e.message).split("\n")[0]}`, 1);
      }
    }
    console.log(`Aplicadas ${n} migrations em ${redactedTarget(verdict)}.`);
  } finally {
    await db.end().catch(() => {});
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("apply-migrations.mjs")) {
  await main();
}
