// Frente N1 — centralização da regra de permissão (migration 20261121100000): has_project_permission e
// is_project_member (auth.uid()) passam a DELEGAR a project_permission_for / project_member_active_for (usuário
// explícito). Teste de EQUIVALÊNCIA EXAUSTIVA antes × depois, em PGlite (descartável, sem rede):
//   - replay de todas as migrations ANTERIORES a 20261121100000 => matriz "antes";
//   - aplica 20261121100000 e as seguintes => matriz "depois";
//   - matriz = todos os papéis (inclusive legados ADMIN/EDITOR/VIEWER e um valor desconhecido) × todos os status ×
//     todos os mínimos (inclusive desconhecido, vazio e NULL) × {membro, outra obra, sem vínculo, sessão sem usuário};
//   - cada célula também é comparada com a tabela de referência de 20260829200000 (em JS) e com
//     project_permission_for / project_member_active_for chamadas diretamente;
//   - propriedades preservadas: security definer, stable, search_path = '', linguagem, tipo de retorno, dono e ACL.
// As CHECK constraints de papel/status são removidas SÓ nesta base descartável, para exercitar valores legados.
//
// Uso: node scripts/test-n1-permission-centralization-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
const CUT = "20261121100000";
const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
const before = files.filter((f) => f < CUT);
const after = files.filter((f) => f >= CUT);
const apply = async (db, f) => db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));

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
await db.exec(platform);
for (const f of before) await apply(db, f);

const ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "COLABORADOR", "LEITURA", "ADMIN", "EDITOR", "VIEWER", "DESCONHECIDO"];
const STATUSES = (await db.query("select distinct unnest(regexp_matches(pg_get_constraintdef(c.oid), '''([A-Z_]+)''', 'g')) s from pg_constraint c where c.conrelid = 'public.project_memberships'::regclass and pg_get_constraintdef(c.oid) ilike '%status%' and c.contype = 'c'")).rows.map((r) => r.s);
if (!STATUSES.includes("ACTIVE")) STATUSES.push("ACTIVE");
STATUSES.push("OUTRO_STATUS");
const MINS = ["ADMINISTRADOR", "ADMIN", "GESTOR", "GERENTE", "COLABORADOR", "EDITOR", "LEITURA", "VIEWER", "DESCONHECIDO", "", null];

// Tabela de referência (20260829200000).
const roleLevel = (r) => ({ ADMINISTRADOR: 3, ADMIN: 3, GESTOR: 1, GERENTE: 1, COLABORADOR: 1, LEITURA: 1, EDITOR: 1, VIEWER: 1 })[r] ?? 0;
const minLevel = (m) => ({ ADMINISTRADOR: 3, ADMIN: 3, GESTOR: 2, GERENTE: 2, COLABORADOR: 2, EDITOR: 2, LEITURA: 1, VIEWER: 1 })[m] ?? 999;

// Base: uma obra por combinação papel × status (o mesmo usuário U tem uma membership em cada obra), mais uma obra
// sem vínculo e um usuário sem nenhuma membership.
await db.exec(`
  do $$ declare c record; begin
    for c in select conname from pg_constraint where conrelid = 'public.project_memberships'::regclass and contype = 'c' loop
      execute format('alter table public.project_memberships drop constraint %I', c.conname);
    end loop;
  end $$;
`);
const U = "00000000-0000-4000-8000-00000000e001";
const STRANGER = "00000000-0000-4000-8000-00000000e002";
for (const id of [U, STRANGER]) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(-4)}@axion.com.br`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, id.slice(-4), `${id.slice(-4)}@axion.com.br`]);
}
const projects = [];
let k = 0;
// Ignora triggers de proteção (ex.: último administrador) para semear combinações arbitrárias; só nesta base.
await db.exec("set session_replication_role = replica");
for (const role of ROLES) {
  for (const status of STATUSES) {
    k += 1;
    const id = `00000000-0000-4000-8000-0000000e${String(k).padStart(4, "0")}`;
    await db.query("insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ($1, $2, $3, 'x', 'x', date '2026-01-01', date '2027-01-01')", [id, `EQ-${k}`, `Equivalência ${k}`]);
    await db.query("insert into public.project_memberships (project_id, user_id, permission, status) values ($1, $2, $3, $4)", [id, U, role, status]);
    projects.push({ id, role, status });
  }
}
const NOBODY = "00000000-0000-4000-8000-0000000effff";
await db.query("insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ($1, 'EQ-X', 'Sem vínculo', 'x', 'x', date '2026-01-01', date '2027-01-01')", [NOBODY]);
await db.exec("set session_replication_role = origin");

const setUid = (uid) => db.exec(`select set_config('app.uid', '${uid ?? ""}', false)`);
async function matrix() {
  const out = new Map();
  for (const uid of [U, STRANGER, null]) {
    await setUid(uid);
    for (const p of [...projects, { id: NOBODY, role: null, status: null }]) {
      const member = (await db.query("select public.is_project_member($1) v", [p.id])).rows[0].v;
      out.set(`member|${uid}|${p.id}`, member);
      for (const m of MINS) out.set(`perm|${uid}|${p.id}|${m}`, (await db.query("select public.has_project_permission($1, $2) v", [p.id, m])).rows[0].v);
    }
  }
  await setUid(null);
  return out;
}
const props = async () =>
  (await db.query(`select p.proname, p.prosecdef, p.provolatile, p.proconfig, l.lanname, p.prorettype::regtype::text rettype, pg_get_userbyid(p.proowner) owner, coalesce(p.proacl::text, '') acl,
     pg_get_function_identity_arguments(p.oid) args
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
     where n.nspname = 'public' and p.proname in ('has_project_permission', 'is_project_member', 'project_permission_for', 'project_member_active_for') order by 1`)).rows;

const beforeMatrix = await matrix();
const beforeProps = await props();
for (const f of after) await apply(db, f);
const afterMatrix = await matrix();
const afterProps = await props();

await check(`E1 matriz exaustiva idêntica antes × depois (${beforeMatrix.size} combinações: ${ROLES.length} papéis × ${STATUSES.length} status × ${MINS.length} mínimos × 3 sessões, + membro/outra obra)`, async () => {
  const diff = [];
  for (const [key, v] of beforeMatrix) if (afterMatrix.get(key) !== v) diff.push(`${key}: ${v} → ${afterMatrix.get(key)}`);
  assert(beforeMatrix.size === afterMatrix.size && diff.length === 0, diff.slice(0, 5).join("; "));
});
await check("E2 cada célula bate com a tabela de referência de 20260829200000 (papel ≥ mínimo, só ACTIVE, sessão sem usuário = false)", async () => {
  const bad = [];
  for (const uid of [U, STRANGER, null]) {
    for (const p of [...projects, { id: NOBODY }]) {
      const isMember = uid === U && p.status === "ACTIVE";
      if (afterMatrix.get(`member|${uid}|${p.id}`) !== isMember) bad.push(`member ${uid} ${p.role}/${p.status}`);
      for (const m of MINS) {
        const exp = isMember && roleLevel(p.role) >= minLevel(m);
        if (afterMatrix.get(`perm|${uid}|${p.id}|${m}`) !== exp) bad.push(`perm ${uid} ${p.role}/${p.status} min=${m}`);
      }
    }
  }
  assert(bad.length === 0, bad.slice(0, 5).join("; "));
});
await check("E3 fonte única: has_project_permission/is_project_member (auth.uid()) = project_permission_for/project_member_active_for (usuário explícito) em todas as células", async () => {
  const bad = [];
  for (const uid of [U, STRANGER, null]) {
    for (const p of [...projects, { id: NOBODY }]) {
      const direct = (await db.query("select public.project_member_active_for($1, $2) v", [p.id, uid])).rows[0].v;
      if (direct !== afterMatrix.get(`member|${uid}|${p.id}`)) bad.push(`member ${uid} ${p.id}`);
      for (const m of MINS) {
        const d = (await db.query("select public.project_permission_for($1, $2, $3) v", [p.id, uid, m])).rows[0].v;
        if (d !== afterMatrix.get(`perm|${uid}|${p.id}|${m}`)) bad.push(`perm ${uid} ${p.id} ${m}`);
      }
    }
  }
  assert(bad.length === 0, bad.slice(0, 5).join("; "));
});
await check("E4 nunca devolve NULL (falha fechada): todas as células são true/false", async () => {
  for (const [key, v] of afterMatrix) assert(v === true || v === false, `${key} = ${v}`);
});
await check("E5 propriedades preservadas: assinatura, linguagem, stable, security definer, search_path = '', retorno, dono e ACL (privilégios)", async () => {
  assert(JSON.stringify(beforeProps) === JSON.stringify(afterProps), `antes ${JSON.stringify(beforeProps)}\ndepois ${JSON.stringify(afterProps)}`);
  for (const r of afterProps) {
    assert(r.prosecdef && r.provolatile === "s" && r.lanname === "sql" && r.rettype === "boolean", r.proname);
    assert((r.proconfig ?? []).some((c) => c === 'search_path=""' || c === "search_path="), `${r.proname}: ${r.proconfig}`);
  }
});
await check("E6 a tabela de níveis existe numa ÚNICA função (project_permission_for); has_project_permission não a duplica mais", async () => {
  const defs = (await db.query("select p.proname, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ $1", ["when 'COLABORADOR' then 1"])).rows.map((r) => r.proname);
  assert(JSON.stringify(defs) === JSON.stringify(["project_permission_for"]), defs.join(", "));
});
await check("E7 papéis da aplicação: authenticated executa has_project_permission/is_project_member; project_permission_for/project_member_active_for continuam sem EXECUTE para anon/authenticated", async () => {
  const ex = async (fn, role) => (await db.query("select has_function_privilege($1, $2::regprocedure, 'EXECUTE') v", [role, fn])).rows[0].v;
  assert(await ex("public.has_project_permission(uuid,text)", "authenticated"));
  assert(await ex("public.is_project_member(uuid)", "authenticated"));
  for (const role of ["anon", "authenticated"]) {
    assert(!(await ex("public.project_permission_for(uuid,uuid,text)", role)), `project_permission_for executável por ${role}`);
    assert(!(await ex("public.project_member_active_for(uuid,uuid)", role)), `project_member_active_for executável por ${role}`);
  }
});
await check("E8 RLS continua funcionando pelo papel authenticated (helper delega com privilégios do dono): membro ACTIVE vê sua obra, inativo/estranho não", async () => {
  const activeCollab = projects.find((p) => p.role === "COLABORADOR" && p.status === "ACTIVE");
  const inactive = projects.find((p) => p.role === "ADMINISTRADOR" && p.status !== "ACTIVE");
  const see = async (uid) => {
    await db.exec("begin");
    try {
      await db.exec(`select set_config('app.uid', '${uid}', true)`);
      await db.exec("set local role authenticated");
      return (await db.query("select id from public.projects where id = any($1)", [[activeCollab.id, inactive.id]])).rows.map((r) => r.id);
    } finally {
      await db.exec("rollback");
    }
  };
  const mine = await see(U);
  assert(mine.includes(activeCollab.id) && !mine.includes(inactive.id), JSON.stringify(mine));
  assert((await see(STRANGER)).length === 0);
});

console.log("");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
await db.close();
process.exit(failed ? 1 : 0);
