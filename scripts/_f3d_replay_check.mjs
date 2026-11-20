import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const url = process.env.ACC_REALPG_URL;
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const GOTRUE = `
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'x'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;`;
const platform = PLATFORM.replace(/^create role .*$/gm, "").replace(/^create function auth\.(uid|role|jwt)\(\).*$/gm, "-- stub removido") + "\n" + GOTRUE;
const admin = new pg.Client({ connectionString: url }); await admin.connect();
const dbName = `acc_f3d_chk_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
const b = new URL(url); b.pathname = `/${dbName}`;
const su = new pg.Client({ connectionString: b.toString() }); await su.connect();
let rc = 0;
try {
  await su.query(platform);
  for (const f of files) { try { await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); } catch (e) { console.log("FAIL", f, e.message, e.position ?? "", e.where ?? ""); rc = 1; break; } }
  if (!rc) { for (const f of files.filter((x) => /^2026112330/.test(x))) await su.query(readFileSync(path.join(dir, f), "utf8")); console.log("replay + reaplicação OK", files.length); }
} finally { await su.end(); await admin.query(`drop database if exists ${dbName} with (force)`); await admin.end(); }
process.exit(rc);
