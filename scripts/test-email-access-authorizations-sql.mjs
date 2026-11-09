// Migration 20261106120000 (autorização individual de acesso ao e-mail corporativo) contra PostgreSQL 17 DESCARTÁVEL (PGlite):
// reaplica TODAS as migrations anteriores, aplica a nova (duas vezes: idempotência) e confere RLS (só Administrador),
// histórico imutável (sem UPDATE/DELETE/TRUNCATE), unicidade e preservação da resposta original.
// Nenhum banco real é tocado. Uso: node scripts/test-email-access-authorizations-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const TARGET = "20261106120000_email_access_authorizations.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const before = files.filter((f) => f < TARGET);
const replaySource = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8");
const PLATFORM = replaySource.match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of before) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid, fn, role = "authenticated") => {
  await db.exec(`select set_config('app.uid', '${uid ?? ""}', false); select set_config('app.role','${role}',false); set role ${role};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };

const U = { adm: 1, ger: 2, col: 3, inat: 4 };
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001";
for (const [k, n] of Object.entries(U)) await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
for (const [k, n] of Object.entries(U)) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01')", [P1]);
const member = (n, perm, st = "ACTIVE") => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [P1, id(n), perm, st]);
await member(U.adm, "ADMINISTRADOR"); await member(U.ger, "GESTOR"); await member(U.col, "COLABORADOR"); await member(U.inat, "ADMINISTRADOR", "INACTIVE");

// dado anterior: autorização por obra (tabela homônima antiga) não pode ser afetada
const oldBefore = (await q("select count(*)::int n from public.email_access_authorizations"))[0].n;

await db.exec(clean(TARGET));
await check("migration é idempotente (segunda aplicação sem erro) e não toca a tabela por obra existente", async () => {
  await db.exec(clean(TARGET));
  eq((await q("select count(*)::int n from public.email_access_authorizations"))[0].n, oldBefore, "tabela por obra intacta");
  eq((await q("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'collaborator_email_access_%'"))[0].n, 4, "4 tabelas");
});

const REQ = "30000000-0000-4000-8000-000000000001";
const insReq = (uid, over = {}, role = "authenticated") => as(uid, () => db.query(
  `insert into public.collaborator_email_access_requests (id,collaborator_email,mailbox,purpose,text_version,request_message_id,requested_by_user_id,requested_at,request_expires_at,access_duration_days)
   values ($1,'maria@axion.example','maria@axion.example','Rastreabilidade contratual','v1',$2,$3,'2026-11-10T12:00:00Z','2026-11-25T12:00:00Z',90)`,
  [over.id ?? REQ, over.mid ?? "<req-1@axion.example>", over.by ?? (uid ? id(uid) : null)]), role);

await check("Administrador insere solicitação e lê; Gestor/Colaborador/inativo/anon não escrevem nem leem", async () => {
  await insReq(id(U.adm), { by: id(U.adm) });
  eq((await as(id(U.adm), () => q("select id from public.collaborator_email_access_requests"))).length, 1, "admin lê");
  for (const u of [U.ger, U.col, U.inat]) {
    eq((await as(id(u), () => q("select id from public.collaborator_email_access_requests"))).length, 0, `u${u} lê 0 linhas`);
    ok(/row-level security/i.test(await err(insReq(id(u), { id: "30000000-0000-4000-8000-0000000000a" + u, mid: "<x" + u + ">", by: id(u) }))), `u${u} não insere`);
  }
  ok(/permission denied/i.test(await err(as(null, () => db.query("select * from public.collaborator_email_access_requests"), "anon"))), "anon não lê");
  ok(/permission denied/i.test(await err(insReq(null, {}, "anon"))), "anon não insere");
});

await check("service_role grava e lê (rotina server-side)", async () => {
  await as(null, () => db.query(
    `insert into public.collaborator_email_access_requests (id,collaborator_email,mailbox,purpose,text_version,request_message_id,requested_at,request_expires_at,access_duration_days)
     values ('30000000-0000-4000-8000-000000000002','joao@axion.example','joao@axion.example','Rastreabilidade contratual','v1','<req-2@axion.example>','2026-11-10T12:00:00Z','2026-11-25T12:00:00Z',90)`), "service_role");
  eq((await as(null, () => q("select id from public.collaborator_email_access_requests"), "service_role")).length, 2, "service_role lê");
});

await check("Message-ID da solicitação é único (case-insensitive); e-mails devem estar normalizados", async () => {
  { const e = await err(insReq(id(U.adm), { id: "30000000-0000-4000-8000-000000000003", mid: "<REQ-1@axion.example>", by: id(U.adm) })); ok(e && /unique|duplicate/i.test(e), "duplicado: " + e); }
  ok(/check/i.test(await err(as(null, () => db.query(
    `insert into public.collaborator_email_access_requests (collaborator_email,mailbox,purpose,text_version,request_message_id,requested_at,request_expires_at,access_duration_days)
     values ('Maria@Axion.example','m@a.example','Rastreabilidade','v1','<z>','2026-11-10T12:00:00Z','2026-11-25T12:00:00Z',90)`), "service_role"))), "e-mail não normalizado");
});

const hash = "09c06a114309d73d048a2282f66e65f906e837f9df7864fcb84f40e166d82aba";
const insReply = (uid, over = {}, role = "authenticated") => as(uid, () => db.query(
  `insert into public.collaborator_email_access_replies (request_id,message_id,in_reply_to,references_header,from_email,headers,body_sha256,received_at,classification,linked_to_request,link_reason)
   values ($1,$2,$3,$4,$5,$6,$7,'2026-11-11T09:00:00Z',$8,$9,'teste')`,
  [over.req ?? REQ, over.mid ?? "<r1@x>", "<req-1@axion.example>", ["<req-1@axion.example>"], over.from ?? "maria@axion.example", { "x-original": "preservado" }, over.hash ?? hash, over.cls ?? "AUTORIZO", over.linked ?? true]), role);

await check("resposta original preservada (message_id, in_reply_to, references, remetente, headers, hash); cabeçalho inválido recusado", async () => {
  await insReply(id(U.adm));
  const r = (await as(id(U.adm), () => q("select * from public.collaborator_email_access_replies")))[0];
  eq([r.message_id, r.in_reply_to, r.references_header, r.from_email, r.headers, r.body_sha256, r.classification, r.linked_to_request],
    ["<r1@x>", "<req-1@axion.example>", ["<req-1@axion.example>"], "maria@axion.example", { "x-original": "preservado" }, hash, "AUTORIZO", true], "linha");
  ok(/check/i.test(await err(insReply(id(U.adm), { mid: "<r2@x>", hash: "abc" }))), "hash inválido");
  ok(/check/i.test(await err(insReply(id(U.adm), { mid: "<r3@x>", cls: "SIM" }))), "classificação inválida");
  ok(/unique|duplicate/i.test(await err(insReply(id(U.adm), { mid: "<R1@x>" }))), "reentrega do mesmo Message-ID");
  ok(/check/i.test(await err(as(null, () => db.query(
    `insert into public.collaborator_email_access_replies (request_id,message_id,from_email,body_sha256,received_at,classification,linked_to_request)
     values (null,'<r4@x>','x@y.z',$1,now(),'PENDENTE_REVISAO',true)`, [hash]), "service_role"))), "vinculada exige solicitação");
});

await check("resposta de outro remetente é guardada como NÃO vinculada (histórico), sem apagar a original", async () => {
  await insReply(id(U.adm), { mid: "<r5@x>", from: "intruso@externo.example", cls: "AUTORIZO", linked: false });
  eq((await as(id(U.adm), () => q("select count(*)::int n from public.collaborator_email_access_replies where linked_to_request=false")))[0].n, 1, "não vinculada");
  eq((await as(id(U.adm), () => q("select count(*)::int n from public.collaborator_email_access_replies")))[0].n, 2, "2 respostas");
});

await check("confirmação técnica e revogação: Administrador insere uma vez; outros perfis não; revogação é nova linha", async () => {
  const tech = (u) => as(id(u), () => db.query("insert into public.collaborator_email_access_technical (request_id,confirmed_by_user_id) values ($1,$2)", [REQ, id(u)]));
  const rev = (u, reason = "pedido do colaborador") => as(id(u), () => db.query("insert into public.collaborator_email_access_revocations (request_id,revoked_by_user_id,reason) values ($1,$2,$3)", [REQ, id(u), reason]));
  ok(/row-level security/i.test(await err(tech(U.col))), "colaborador não confirma");
  await tech(U.adm);
  ok(/unique|duplicate/i.test(await err(tech(U.adm))), "uma confirmação por solicitação");
  ok(/row-level security/i.test(await err(rev(U.ger))), "gestor não revoga");
  ok(/check/i.test(await err(rev(U.adm, "x"))), "motivo mínimo");
  await rev(U.adm);
  ok(/unique|duplicate/i.test(await err(rev(U.adm))), "uma revogação por solicitação");
  eq((await as(id(U.adm), () => q("select count(*)::int n from public.collaborator_email_access_requests")))[0].n, 2, "solicitação intacta");
});

await check("histórico imutável: UPDATE, DELETE e TRUNCATE bloqueados em todas as tabelas, inclusive para service_role e Administrador", async () => {
  for (const t of ["requests", "replies", "technical", "revocations"]) {
    const tb = `public.collaborator_email_access_${t}`;
    for (const [role, uid] of [["service_role", null], ["authenticated", id(U.adm)]]) {
      const upd = await err(as(uid, () => db.query(`update ${tb} set id = id`), role));
      ok(upd && /(IMMUTABLE|permission denied)/i.test(upd), `update ${t}/${role}: ${upd}`);
      const del = await err(as(uid, () => db.query(`delete from ${tb}`), role));
      ok(del && /(IMMUTABLE|permission denied)/i.test(del), `delete ${t}/${role}: ${del}`);
    }
    const tr = await err(as(null, () => db.query(`truncate ${tb}`), "service_role"));
    ok(tr && /(IMMUTABLE|permission denied|cannot truncate)/i.test(tr), `truncate ${t}: ${tr}`);
  }
  eq((await q("select count(*)::int n from public.collaborator_email_access_requests"))[0].n, 2, "linhas preservadas");
});

await check("RLS forçada, grants mínimos (sem update/delete a authenticated) e nenhuma função SECURITY DEFINER nova", async () => {
  const t = await q("select relname, relrowsecurity, relforcerowsecurity from pg_class where relname like 'collaborator_email_access_%' and relkind='r'");
  eq(t.length, 4, "tabelas");
  ok(t.every((x) => x.relrowsecurity && x.relforcerowsecurity), "RLS forçada");
  const g = await q("select distinct privilege_type p from information_schema.role_table_grants where grantee='authenticated' and table_name like 'collaborator_email_access_%' order by 1");
  eq(g.map((x) => x.p), ["INSERT", "SELECT"], "grants authenticated");
  eq((await q("select count(*)::int n from information_schema.role_table_grants where grantee='anon' and table_name like 'collaborator_email_access_%'"))[0].n, 0, "anon sem grants");
  eq((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'collaborator_email_access%' and p.prosecdef"))[0].n, 0, "sem SECURITY DEFINER");
  const fn = (await q("select proconfig from pg_proc where proname='collaborator_email_access_immutable'"))[0].proconfig;
  ok(JSON.stringify(fn).includes("search_path"), "search_path fixo");
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s)`);
await db.close();
process.exit(failed ? 1 : 0);
