// RPC copy_project_team (migration 20261111120000, PROPOSTA — não aplicada em nenhum remoto) em PostgreSQL 17 DESCARTÁVEL (PGlite),
// com TODAS as migrations reexecutadas e dados sintéticos. Cenário: equipe da obra A (origem) copiada para a obra B (destino).
// Prova: Administrador nos DOIS projetos exigido no banco; sem sobrescrever; Administrador só com confirmação; idempotência;
// falha de uma pessoa não desfaz as outras; auditoria (origem, destino, executor); nenhuma escrita fora de project_memberships
// (convites, e-mail, documentos, alertas); anon sem acesso.
// Uso: node scripts/test-copy-project-team-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.some((f) => /^(20261106120000|20261106130000)_/.test(f))) throw new Error("migration proibida presente"); // 20261107090000 existe no repositório (não aplicada em produção) e só é reexecutada localmente
if (!files.includes("20261111120000_copy_project_team.sql")) throw new Error("migration da RPC ausente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 260)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (uid, fn) => {
  await db.exec(`select set_config('app.uid','${uid}',false); select set_config('app.role','authenticated',false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const A = "10000000-0000-4000-8000-00000000000a", B = "10000000-0000-4000-8000-00000000000b", C = "10000000-0000-4000-8000-00000000000c";
const U = { adm: 1, ger: 2, col: 3, inativo: 4, admOutro: 5, fora: 6, soOrigem: 7, soDestino: 8 };
// Um gatilho pode criar o perfil ao inserir o usuário: o perfil é sempre gravado por upsert.
const mkUser = async (n, key) => {
  await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${key}@exemplo.invalid`]);
  await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do update set name = excluded.name, email = excluded.email", [id(n), `Pessoa ${key}`, `${key}@exemplo.invalid`]);
};
for (const [k, n] of Object.entries(U)) await mkUser(n, k);
for (const [pid, code] of [[A, "OA"], [B, "OB"], [C, "OC"]]) {
  await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,$2,$3,'Cliente','Cidade','2026-01-01','2027-01-01')", [pid, `Obra ${code}`, code]);
}
const mem = (p, n, perm, area, status = "ACTIVE") => db.query("insert into public.project_memberships (project_id,user_id,permission,area,status) values ($1,$2,$3,$4,$5)", [p, id(n), perm, area, status]);
// ORIGEM A: adm (Administrador, executor), ger, col, inativo (INACTIVE), admOutro (Administrador)
await mem(A, U.adm, "ADMINISTRADOR", "DIRETORIA"); await mem(A, U.ger, "GERENTE", "ENGENHARIA"); await mem(A, U.col, "COLABORADOR", "COMERCIAL");
await mem(A, U.inativo, "COLABORADOR", "COMPRAS", "INACTIVE"); await mem(A, U.admOutro, "ADMINISTRADOR", "ADMINISTRATIVO"); await mem(A, U.soOrigem, "COLABORADOR", "PLANEJAMENTO");
// DESTINO B: adm (Administrador) + soDestino. C: adm só como Colaborador (não é admin).
await mem(B, U.adm, "ADMINISTRADOR", "DIRETORIA"); await mem(B, U.soDestino, "LEITURA", "FINANCEIRO");
await mem(C, U.adm, "COLABORADOR", "DIRETORIA"); await mem(C, U.ger, "ADMINISTRADOR", "DIRETORIA");

const item = (n, permission, area, extra = {}) => ({ user_id: id(n), permission, area, ...extra });
const copy = (uid, src, dst, items) => as(id(uid), async () => (await q("select public.copy_project_team($1,$2,$3::jsonb) r", [src, dst, JSON.stringify(items)]))[0].r);
const status = (r, n) => r.items.find((i) => i.user_id === id(n))?.status;
const memberships = (p) => q("select user_id,permission,area,status from public.project_memberships where project_id=$1 order by user_id", [p]);
const snapshot = async () => JSON.stringify([await q("select count(*)::int n from public.project_member_invitations"), await q("select count(*)::int n from public.notifications"), await q("select count(*)::int n from public.documents"), await q("select count(*)::int n from public.project_email_ingestion_configs"), await q("select count(*)::int n from public.sla_actions")]);

console.log("\n======================================\nRPC copy_project_team — PGlite\n======================================");

await check("a RPC existe, é SECURITY DEFINER com search_path fixo; anon sem EXECUTE, authenticated com EXECUTE", async () => {
  const r = (await q("select prosecdef, proconfig, has_function_privilege('anon', oid, 'EXECUTE') anon, has_function_privilege('authenticated', oid, 'EXECUTE') auth from pg_proc where proname='copy_project_team'"))[0];
  ok(r.prosecdef === true, "não é definer");
  ok(JSON.stringify(r.proconfig).includes("search_path="), "search_path não fixo");
  eq([r.anon, r.auth], [false, true], "ACL");
});

await check("autorização no BANCO: precisa ser Administrador da ORIGEM e do DESTINO", async () => {
  const antes = JSON.stringify(await memberships(B));
  ok((await err(copy(U.adm, C, B, [item(U.ger, "COLABORADOR", "ENGENHARIA")]))) !== null, "adm é só Colaborador na origem C: deveria falhar");
  ok((await err(copy(U.adm, A, C, [item(U.ger, "COLABORADOR", "ENGENHARIA")]))) !== null, "adm é só Colaborador no destino C: deveria falhar");
  ok((await err(copy(U.soDestino, A, B, [item(U.ger, "COLABORADOR", "ENGENHARIA")]))) !== null, "soDestino não é admin: deveria falhar");
  ok((await err(copy(U.fora, A, B, [item(U.ger, "COLABORADOR", "ENGENHARIA")]))) !== null, "estranho: deveria falhar");
  ok((await err(copy(U.adm, A, A, [item(U.ger, "COLABORADOR", "ENGENHARIA")]))) !== null, "mesmo projeto: deveria falhar");
  eq(JSON.stringify(await memberships(B)), antes, "nada pode ter mudado");
});

await check("entradas inválidas: lista vazia, não-array e acima de 200 itens são recusadas", async () => {
  for (const bad of [[], {}, "x", Array.from({ length: 201 }, (_, i) => item(2, "COLABORADOR", "ENGENHARIA"))]) {
    ok((await err(copy(U.adm, A, B, bad))) !== null, `deveria recusar ${JSON.stringify(bad).slice(0, 30)}`);
  }
});

const before = await snapshot();
let first;
await check("cópia em lote: vincula gerente/colaborador; ignora inativo, fora da origem e você; Administrador só com confirmação", async () => {
  first = await copy(U.adm, A, B, [
    item(U.ger, "GERENTE", "ENGENHARIA"),
    item(U.col, "COLABORADOR", "COMERCIAL"),
    item(U.inativo, "COLABORADOR", "COMPRAS"),         // inativo na origem
    item(U.fora, "COLABORADOR", "COMPRAS"),            // não é da origem
    item(U.adm, "GERENTE", "DIRETORIA"),               // o executor
    item(U.admOutro, "ADMINISTRADOR", "ADMINISTRATIVO"), // Administrador sem confirmação
  ]);
  eq(status(first, U.ger), "ADDED", "ger"); eq(status(first, U.col), "ADDED", "col");
  eq(status(first, U.inativo), "NOT_ACTIVE_IN_SOURCE", "inativo"); eq(status(first, U.fora), "NOT_ACTIVE_IN_SOURCE", "fora");
  eq(status(first, U.adm), "SKIPPED_SELF", "self"); eq(status(first, U.admOutro), "ADMIN_NOT_CONFIRMED", "admin sem confirmação");
  eq([first.added, first.already_member, first.skipped, first.errors], [2, 0, 4, 0], "contagens");
  const m = await memberships(B);
  eq(m.map((x) => [x.user_id, x.permission, x.area, x.status]).sort(), [[id(U.adm), "ADMINISTRADOR", "DIRETORIA", "ACTIVE"], [id(U.col), "COLABORADOR", "COMERCIAL", "ACTIVE"], [id(U.ger), "GERENTE", "ENGENHARIA", "ACTIVE"], [id(U.soDestino), "LEITURA", "FINANCEIRO", "ACTIVE"]].sort(), "memberships do destino");
});

await check("Administrador entra apenas com explicit_admin = true", async () => {
  const r = await copy(U.adm, A, B, [item(U.admOutro, "ADMINISTRADOR", "ADMINISTRATIVO", { explicit_admin: true })]);
  eq(status(r, U.admOutro), "ADDED", "admin confirmado");
  eq((await q("select permission from public.project_memberships where project_id=$1 and user_id=$2", [B, id(U.admOutro)]))[0].permission, "ADMINISTRADOR", "perfil");
});

await check("idempotente e sem sobrescrever: repetir não duplica; quem já era membro (outro perfil) fica intacto", async () => {
  const snapB = JSON.stringify(await memberships(B));
  const r = await copy(U.adm, A, B, [item(U.ger, "GERENTE", "ENGENHARIA"), item(U.col, "GERENTE", "ENGENHARIA"), item(U.admOutro, "COLABORADOR", "COMERCIAL")]);
  eq([status(r, U.ger), status(r, U.col), status(r, U.admOutro)], ["ALREADY_MEMBER", "ALREADY_MEMBER", "ALREADY_MEMBER"], "já membros");
  eq([r.added, r.already_member], [0, 3], "contagens");
  eq(JSON.stringify(await memberships(B)), snapB, "nenhum acesso pode ter mudado (col continua Colaborador; admOutro continua Administrador)");
  const dup = await q("select count(*)::int n from (select user_id from public.project_memberships where project_id=$1 group by user_id having count(*)>1) t", [B]);
  eq(dup[0].n, 0, "sem duplicidade");
});

await check("destino já com vínculo INATIVO ou de outro perfil não é reativado nem alterado", async () => {
  await db.query("update public.project_memberships set status='INACTIVE' where project_id=$1 and user_id=$2", [B, id(U.col)]);
  const r = await copy(U.adm, A, B, [item(U.col, "COLABORADOR", "COMERCIAL")]);
  eq(status(r, U.col), "ALREADY_MEMBER", "inativo no destino");
  eq((await q("select status from public.project_memberships where project_id=$1 and user_id=$2", [B, id(U.col)]))[0].status, "INACTIVE", "continua inativo (não reativa em silêncio)");
});

await check("falha de uma pessoa (área inválida) não desfaz as demais, e é reportada", async () => {
  await mkUser(21, "x1"); await mkUser(22, "x2");
  await mem(A, 21, "COLABORADOR", "COMPRAS"); await mem(A, 22, "COLABORADOR", "COMPRAS");
  const r = await copy(U.adm, A, B, [item(21, "COLABORADOR", "COMPRAS"), item(22, "COLABORADOR", "AREA_QUE_NAO_EXISTE")]);
  eq([status(r, 21), status(r, 22)], ["ADDED", "ERROR"], "parcial");
  eq([r.added, r.errors], [1, 1], "contagens");
  eq((await q("select count(*)::int n from public.project_memberships where project_id=$1 and user_id=$2", [B, id(22)]))[0].n, 0, "a pessoa com erro não foi vinculada");
});

await check("itens inválidos: perfil desconhecido, pessoa repetida (a 1ª vale), sem área e user_id inválido", async () => {
  await mkUser(31, "y1"); await mkUser(32, "y2");
  await mem(A, 31, "COLABORADOR", "COMPRAS"); await mem(A, 32, "COLABORADOR", "COMPRAS");
  const r = await copy(U.adm, A, B, [
    item(31, "SUPERUSUARIO", "COMPRAS"),                 // perfil inexistente
    item(32, "COLABORADOR", "COMPRAS"),                  // vale
    item(32, "COLABORADOR", "COMPRAS"),                  // repetida: ignorada, sem duplicar
    { user_id: "nao-e-uuid", permission: "COLABORADOR", area: "COMPRAS" },
    item(U.soOrigem, "COLABORADOR", null),               // sem área
  ]);
  eq(r.items.map((i) => i.status), ["INVALID", "ADDED", "INVALID", "INVALID", "INVALID"], "status por item");
  eq((await q("select count(*)::int n from public.project_memberships where project_id=$1 and user_id=$2", [B, id(32)]))[0].n, 1, "sem duplicidade");
  eq((await q("select count(*)::int n from public.project_memberships where project_id=$1 and user_id=$2", [B, id(31)]))[0].n, 0, "perfil inválido não vincula");
});

await check("auditoria: MEMBER_ADDED por pessoa + PROJECT_TEAM_COPIED no destino + USED_AS_SOURCE na origem (origem, destino, executor)", async () => {
  const added = await q("select count(*)::int n from public.audit_log_entries where action='MEMBER_ADDED' and project_id=$1", [B]);
  ok(added[0].n >= 3, "MEMBER_ADDED por pessoa");
  const dst = await q("select actor_user_id, detail from public.audit_log_entries where action='PROJECT_TEAM_COPIED' and project_id=$1 order by occurred_at, id limit 1", [B]);
  ok(dst.length === 1, "registro no destino");
  eq(dst[0].actor_user_id, id(U.adm), "executor");
  ok(dst[0].detail.includes("Obra OA") && dst[0].detail.includes("Obra OB") && dst[0].detail.includes("Pessoa adm"), "origem, destino e executor no texto");
  ok(dst[0].detail.includes(id(U.ger)) && dst[0].detail.includes(id(U.col)), "usuários adicionados listados");
  const src = await q("select count(*)::int n from public.audit_log_entries where action='PROJECT_TEAM_COPY_USED_AS_SOURCE' and project_id=$1", [A]);
  ok(src[0].n >= 1, "registro na origem");
});

await check("nada fora de project_memberships foi tocado: convites, notificações, documentos, coleta de e-mail e ações SLA", async () => {
  // O backfill de e-mail só registra auditoria quando o destino não tem coleta habilitada; nenhuma tabela de negócio muda.
  eq(await snapshot(), before, "contagens das demais tabelas");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
