// Migration 20261106110000 (referência registro de campo SSMA -> comprovação ESG como evidência) contra PostgreSQL 17
// DESCARTÁVEL (PGlite): reaplica TODAS as migrations anteriores, cria DADOS ANTERIORES (obrigação, comprovações, registros
// de campo incluindo quase-acidente), aplica as duas migrations (20261106100000 e 20261106110000) e confere permissões,
// obra, idempotência, não-cumprimento automático, revogação com histórico, auditoria e isolamento.
// Nenhum banco real é tocado. Uso: node scripts/test-esg-ssma-reference-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const PREREQ = "20261106100000_ssma_esg_acoes_perfis_notificacoes.sql";
const TARGET = "20261106110000_ssma_esg_evidence_reference.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const before = files.filter((f) => f < PREREQ);
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
const code = async (p) => { const e = await err(p); return e ? (e.match(/[A-Z][A-Z_]{4,}/) || [e])[0] : null; };

const U = { adm: 1, ger: 2, gest: 3, col: 4, col2: 5, lei: 6, inat: 7, fora: 8 };
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001", P2 = "10000000-0000-4000-8000-000000000002";
for (const [k, n] of Object.entries(U)) await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
for (const [k, n] of Object.entries(U)) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01'),($2,'Obra 2','O2','Cliente','Cidade','2026-01-01','2027-01-01')", [P1, P2]);
const member = (p, n, perm, st = "ACTIVE") => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, id(n), perm, st]);
await member(P1, U.adm, "ADMINISTRADOR"); await member(P1, U.ger, "GERENTE"); await member(P1, U.gest, "GESTOR"); await member(P1, U.col, "COLABORADOR");
await member(P1, U.col2, "COLABORADOR"); await member(P1, U.lei, "LEITURA"); await member(P1, U.inat, "COLABORADOR", "INACTIVE");
await member(P2, U.fora, "ADMINISTRADOR");

// dados anteriores
const REC = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const OBL = (n) => `60000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const SUB = (n) => `70000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const rec = (n, project, category) => db.query(
  "insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA',$3,'Descrição '||$4,'Bloco A','2026-10-20T10:00:00Z','2026-10-20T10:05:00Z','ALTA',$5)",
  [REC(n), project, category, String(n), id(project === P1 ? U.col : U.fora)]);
await rec(1, P1, "EPI"); await rec(2, P1, "Quase-acidente"); await rec(3, P2, "EPI"); await rec(4, P1, "Condição insegura");
const catC = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'esg_obligations_category_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
const perC = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'esg_obligations_periodicity_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
const obl = (n, p, by) => db.query("insert into public.esg_obligations (id,project_id,title,category,periodicity,created_by_user_id) values ($1,$2,'Obrigação '||$3,$4,$5,$6)", [OBL(n), p, String(n), catC, perC, id(by)]);
await obl(1, P1, U.adm); await obl(2, P2, U.fora);
const sub = (n, o, p, by) => db.query("insert into public.esg_obligation_submissions (id,project_id,obligation_id,reference_date,status,filled_by_user_id) values ($1,$2,$3,'2026-10-01','PENDENTE',$4)", [SUB(n), p, OBL(o), id(by)]);
await sub(1, 1, P1, U.adm);   // do administrador
await sub(2, 1, P1, U.col);   // do colaborador 1
await sub(3, 2, P2, U.fora);  // outra obra

for (const f of [PREREQ, TARGET]) await db.exec(clean(f));

const state = async () => ({
  obl: await q("select * from public.esg_obligations order by id"),
  sub: await q("select * from public.esg_obligation_submissions order by id"),
  rec: await q("select * from public.ssma_field_records order by id"),
});
const link = (uid, s, r, note = null) => as(uid, () => q("select public.esg_link_ssma_record($1,$2,$3) as id", [SUB(s), REC(r), note]));

console.log("\n======================================\nESG <-> SSMA — REFERÊNCIA COMO EVIDÊNCIA (PGlite)\n======================================");

let refAdm, refCol;
await check("Administrador vincula registro de campo à comprovação; obrigação derivada; nada é cumprido", async () => {
  const s0 = await state();
  refAdm = (await link(id(U.adm), 1, 1, "  foto do EPI  "))[0].id;
  ok(refAdm, "id");
  const r = (await q("select * from public.esg_ssma_record_references where id=$1", [refAdm]))[0];
  eq([r.project_id, r.obligation_id, r.submission_id, r.field_record_id, r.note, r.created_by_user_id, r.revoked_at], [P1, OBL(1), SUB(1), REC(1), "foto do EPI", id(U.adm), null], "linha");
  eq(await state(), s0, "obrigação, comprovações e registros idênticos antes/depois");
  eq((await q("select status from public.esg_obligation_submissions where id=$1", [SUB(1)]))[0].status, "PENDENTE", "comprovação segue PENDENTE");
});

await check("Colaborador autorizado vincula na PRÓPRIA comprovação; na comprovação alheia é FORBIDDEN", async () => {
  refCol = (await link(id(U.col), 2, 1))[0].id;
  ok(refCol, "colaborador vinculou");
  eq(await code(link(id(U.col), 1, 4)), "FORBIDDEN", "comprovação do administrador");
  eq(await code(link(id(U.col2), 2, 4)), "FORBIDDEN", "outro colaborador na comprovação alheia");
});

await check("Gerente/Gestor só na própria comprovação (FORBIDDEN na alheia); Administrador vincula em qualquer uma", async () => {
  eq(await code(link(id(U.ger), 2, 4)), "FORBIDDEN", "gerente em comprovação alheia");
  eq(await code(link(id(U.gest), 1, 4)), "FORBIDDEN", "gestor em comprovação alheia");
  ok((await link(id(U.adm), 2, 4))[0].id, "administrador em comprovação de colaborador");
});

await check("Leitura, membro inativo, não-membro e anônimo são recusados", async () => {
  eq(await code(link(id(U.lei), 1, 4)), "FORBIDDEN", "leitura");
  // Anti-oráculo: quem não é membro ATIVO da obra recebe o mesmo erro de comprovação inexistente.
  eq(await code(link(id(U.inat), 2, 4)), "OBLIGATION_NOT_FOUND", "inativo (não é membro ativo)");
  eq(await code(link(id(U.fora), 1, 4)), "OBLIGATION_NOT_FOUND", "não-membro (indistinguível de inexistente)");
  eq(await code(link(null, 1, 4)), "AUTH_REQUIRED", "anônimo");
});

await check("Códigos de erro: RECORD_NOT_FOUND, OBLIGATION_NOT_FOUND e PROJECT_MISMATCH (obra diferente)", async () => {
  eq(await code(as(id(U.adm), () => q("select public.esg_link_ssma_record($1,$2)", [SUB(1), "20000000-0000-4000-8000-0000000000ff"]))), "RECORD_NOT_FOUND", "registro");
  eq(await code(as(id(U.adm), () => q("select public.esg_link_ssma_record($1,$2)", ["70000000-0000-4000-8000-0000000000ff", REC(1)]))), "OBLIGATION_NOT_FOUND", "comprovação");
  eq(await code(link(id(U.adm), 1, 3)), "RECORD_NOT_FOUND", "registro de outra obra que o chamador não integra (não revela que existe)");
  eq(await code(link(id(U.fora), 3, 1)), "RECORD_NOT_FOUND", "admin da obra 2 com registro da obra 1 (não é membro da obra 1)");
  eq((await q("select count(*)::int n from public.esg_ssma_record_references where field_record_id=$1", [REC(3)]))[0].n, 0, "nada gravado");
});

await check("Quase-acidente (category 'Quase-acidente') é vinculável", async () => {
  const r = (await link(id(U.adm), 1, 2))[0].id;
  ok(r, "vinculado");
  eq((await q("select r.category from public.esg_ssma_record_references x join public.ssma_field_records r on r.id=x.field_record_id where x.id=$1", [r]))[0].category, "Quase-acidente", "categoria");
});

await check("Idempotência: repetir e chamar em paralelo devolve a MESMA referência, uma só linha e uma só auditoria", async () => {
  const again = (await link(id(U.adm), 1, 1))[0].id;
  eq(again, refAdm, "mesmo id");
  const par = await Promise.all([link(id(U.col), 2, 4).catch((e) => e), link(id(U.col), 2, 4).catch((e) => e)]);
  ok(par.every((x) => Array.isArray(x)), "chamadas paralelas sem erro");
  eq((await q("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1 and field_record_id=$2 and revoked_at is null", [SUB(1), REC(1)]))[0].n, 1, "uma linha ativa");
  eq((await q("select count(*)::int n from public.audit_log_entries where action='ESG_SSMA_RECORD_LINKED' and entity_id=$1", [refAdm]))[0].n, 1, "uma auditoria");
  ok(/duplicate|unique/i.test(await err(db.query("insert into public.esg_ssma_record_references (project_id,obligation_id,submission_id,field_record_id,created_by_user_id) values ($1,$2,$3,$4,$5)", [P1, OBL(1), SUB(1), REC(1), id(U.adm)]))), "unique parcial no banco");
});

await check("Obrigação NÃO é marcada cumprida: nenhuma comprovação criada/alterada e sem triggers na referência", async () => {
  const s = await state();
  eq(s.sub.map((x) => x.status), ["PENDENTE", "PENDENTE", "PENDENTE"], "status das comprovações");
  eq(s.sub.length, 3, "nenhuma comprovação criada");
  eq((await q("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='esg_ssma_record_references' and not t.tgisinternal"))[0].n, 0, "sem triggers na referência");
});

await check("Sem escrita direta: authenticated não faz INSERT/UPDATE/DELETE na tabela (nem como administrador); anon não lê", async () => {
  ok(/permission denied/i.test(await err(as(id(U.adm), () => db.query("insert into public.esg_ssma_record_references (project_id,obligation_id,submission_id,field_record_id,created_by_user_id) values ($1,$2,$3,$4,$5)", [P1, OBL(1), SUB(1), REC(4), id(U.adm)])))), "insert negado");
  ok(/permission denied/i.test(await err(as(id(U.adm), () => db.query("update public.esg_ssma_record_references set note='x'")))), "update negado");
  ok(/permission denied/i.test(await err(as(id(U.adm), () => db.query("delete from public.esg_ssma_record_references")))), "delete negado");
  ok(/permission denied/i.test(await err(as(null, () => db.query("select * from public.esg_ssma_record_references"), "anon"))), "anon não lê");
  ok((await q("select count(*)::int n from public.esg_ssma_record_references"))[0].n >= 3, "linhas intactas");
});

await check("Leitura: membros (inclusive Leitura) enxergam as referências da obra; outra obra não vê nada e vice-versa", async () => {
  const n = (await q("select count(*)::int n from public.esg_ssma_record_references"))[0].n;
  eq((await as(id(U.lei), () => q("select * from public.esg_ssma_record_references"))).length, n, "leitura vê todas da obra 1");
  eq((await as(id(U.col2), () => q("select * from public.esg_ssma_record_references"))).length, n, "colaborador vê");
  eq((await as(id(U.fora), () => q("select * from public.esg_ssma_record_references"))).length, 0, "obra 2 não vê a obra 1");
  await as(id(U.fora), () => q("select public.esg_link_ssma_record($1,$2)", [SUB(3), REC(3)]));
  eq((await as(id(U.fora), () => q("select * from public.esg_ssma_record_references"))).length, 1, "obra 2 vê só a sua");
  eq((await as(id(U.adm), () => q("select * from public.esg_ssma_record_references where project_id=$1", [P2]))).length, 0, "obra 1 não vê a obra 2");
});

await check("Auditoria do vínculo: ator USER, projeto, entidade e detalhe citando registro e comprovação", async () => {
  const a = (await q("select * from public.audit_log_entries where action='ESG_SSMA_RECORD_LINKED' and entity_id=$1", [refAdm]))[0];
  eq([a.project_id, a.actor_type, a.actor_user_id, a.entity_type], [P1, "USER", id(U.adm), "ESG_SSMA_RECORD_REFERENCE"], "auditoria");
  ok(a.detail.includes(REC(1)) && a.detail.includes(SUB(1)), "detalhe cita registro e comprovação");
});

await check("Desvinculação: motivo obrigatório, só administrador ou autor, marca revogada (não apaga), auditada, estado ESG intacto", async () => {
  const s0 = await state();
  const unlink = (uid, ref, reason) => as(uid, () => q("select public.esg_unlink_ssma_record($1,$2) as id", [ref, reason]));
  eq(await code(unlink(id(U.adm), refAdm, "  ")), "REASON_REQUIRED", "motivo");
  eq(await code(unlink(id(U.col2), refCol, "engano")), "FORBIDDEN", "colaborador que não criou");
  eq(await code(unlink(id(U.lei), refCol, "engano")), "FORBIDDEN", "leitura");
  eq(await code(unlink(id(U.fora), refCol, "engano")), "REFERENCE_NOT_FOUND", "não-membro (indistinguível de inexistente)");
  eq(await code(unlink(null, refCol, "engano")), "AUTH_REQUIRED", "anônimo");
  eq(await code(unlink(id(U.adm), "80000000-0000-4000-8000-0000000000ff", "engano")), "REFERENCE_NOT_FOUND", "inexistente");
  await unlink(id(U.col), refCol, "Registro anexado por engano");   // autor
  await unlink(id(U.adm), refAdm, "Registro substituído");          // administrador
  const rows = await q("select * from public.esg_ssma_record_references where id in ($1,$2) order by id", [refAdm, refCol]);
  eq(rows.length, 2, "linhas preservadas");
  ok(rows.every((r) => r.revoked_at && r.revoked_by_user_id && r.revoked_reason), "quem/quando/motivo");
  eq(rows.find((r) => r.id === refAdm).created_by_user_id, id(U.adm), "autoria original preservada");
  eq(await code(unlink(id(U.adm), refAdm, "de novo")), "ALREADY_REVOKED", "revogar duas vezes");
  eq((await q("select count(*)::int n from public.audit_log_entries where action='ESG_SSMA_RECORD_UNLINKED'"))[0].n, 2, "2 auditorias de revogação");
  eq(await state(), s0, "obrigação, comprovações e registros SSMA intactos");
});

await check("Revincular após revogar cria NOVA referência e mantém o histórico revogado", async () => {
  const novo = (await link(id(U.adm), 1, 1))[0].id;
  ok(novo !== refAdm, "novo id");
  eq((await q("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1 and field_record_id=$2", [SUB(1), REC(1)]))[0].n, 2, "histórico + ativa");
  eq((await q("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1 and field_record_id=$2 and revoked_at is null", [SUB(1), REC(1)]))[0].n, 1, "uma ativa");
});

await check("Funções: SECURITY DEFINER com search_path fixo; anon sem execute", async () => {
  const f = await q("select proname, prosecdef, proconfig::text cfg from pg_proc where proname in ('esg_link_ssma_record','esg_unlink_ssma_record') order by 1");
  eq(f.length, 2, "duas RPCs"); ok(f.every((x) => x.prosecdef && /search_path/.test(x.cfg)), "definer + search_path");
  ok(/permission denied/i.test(await err(as(null, () => q("select public.esg_link_ssma_record($1,$2)", [SUB(1), REC(1)]), "anon"))), "anon sem execute");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
