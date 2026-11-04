// Privacidade das consultas ao Especialista Jurídico (migration 20261104120000) contra PostgreSQL LOCAL descartável (PGlite).
// Duas contas do MESMO projeto (autor e administrador) + outras: só o autor lista, abre por ID e exclui a própria consulta.
// Nenhum banco real é tocado; dados fictícios.
//
// Uso: node scripts/test-legal-consultations-privacy-sql.mjs

import assert from "node:assert/strict";
import { as, createLocalDb, expectError } from "./lib/pglite-supabase-stub.mjs";

const U = {
  autor: "00000000-0000-4000-8000-0000000000a1", // colaborador (autor da consulta)
  adm: "00000000-0000-4000-8000-0000000000d4", // administrador ATIVO do mesmo projeto
  gerente: "00000000-0000-4000-8000-0000000000b2",
  semVinculo: "00000000-0000-4000-8000-0000000000e6",
  admInativo: "00000000-0000-4000-8000-0000000000d9",
};
const P = "00000000-0000-4000-8000-000000000001";
const P_OUTRO = "00000000-0000-4000-8000-000000000002";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}

// is_project_member idêntica à de 20260824090000 (membro ATIVO, qualquer papel) — a migration sob teste depende dela.
const pre = `
create or replace function public.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'ACTIVE');
$$;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;
`;
const db = await createLocalDb(["20261104120000_legal_consultations_private.sql"], pre);
for (const [k, id] of Object.entries(U)) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3)", [id, k, `${k}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code) values ($1,'Obra Fictícia','FIC-001'), ($2,'Outra Obra','FIC-002')", [P, P_OUTRO]);
const member = (u, perm, status = "ACTIVE", proj = P) => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [proj, u, perm, status]);
await member(U.autor, "COLABORADOR");
await member(U.adm, "ADMINISTRADOR");
await member(U.gerente, "GERENTE");
await member(U.admInativo, "ADMINISTRADOR", "INACTIVE");

const auth = (uid, fn) => as(db, { role: "authenticated", uid }, fn);
const insert = (uid, o = {}) =>
  auth(uid, async () =>
    (await db.query(
      `insert into public.legal_consultations (project_id, ${o.author ? "author_user_id, " : ""}question, response)
       values ($1, ${o.author ? "$4, " : ""}$2, $3::jsonb) returning id, author_user_id`,
      o.author ? [o.project ?? P, o.question ?? "Pergunta fictícia", JSON.stringify({ resposta: "Resposta fictícia" }), o.author] : [o.project ?? P, o.question ?? "Pergunta fictícia", JSON.stringify({ resposta: "Resposta fictícia" })]
    )).rows[0]
  );
const list = (uid) => auth(uid, async () => (await db.query("select id from public.legal_consultations order by created_at")).rows.map((r) => r.id));
const byId = (uid, id) => auth(uid, async () => (await db.query("select id, question, response from public.legal_consultations where id = $1", [id])).rows);
const del = (uid, id) => auth(uid, async () => (await db.query("delete from public.legal_consultations where id = $1 returning id", [id])).rows.length);

console.log("\n======================================");
console.log("CONSULTAS JURÍDICAS — PRIVACIDADE POR AUTOR (PGlite local)");
console.log("======================================\n");

let consultaId;
await check("autor grava a consulta; a autoria vem da sessão (auth.uid()), sem o cliente informar", async () => {
  const r = await insert(U.autor);
  consultaId = r.id;
  assert.equal(r.author_user_id, U.autor);
});

await check("autor lista e abre a própria consulta por ID", async () => {
  assert.deepEqual(await list(U.autor), [consultaId]);
  const rows = await byId(U.autor, consultaId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].question, "Pergunta fictícia");
});

await check("administrador do MESMO projeto NÃO lista a consulta alheia", async () => {
  assert.deepEqual(await list(U.adm), []);
});

await check("administrador NÃO abre a consulta alheia pelo ID (acesso direto)", async () => {
  assert.deepEqual(await byId(U.adm, consultaId), []);
});

await check("administrador NÃO exclui a consulta alheia pelo ID — e ela continua existindo para o autor", async () => {
  assert.equal(await del(U.adm, consultaId), 0);
  assert.deepEqual(await list(U.autor), [consultaId]);
});

await check("outro membro (gerente) do mesmo projeto: não lista, não abre e não exclui", async () => {
  assert.deepEqual(await list(U.gerente), []);
  assert.deepEqual(await byId(U.gerente, consultaId), []);
  assert.equal(await del(U.gerente, consultaId), 0);
});

await check("administrador INATIVO, sem vínculo e anônimo: nada vê nem exclui", async () => {
  for (const u of [U.admInativo, U.semVinculo]) {
    assert.deepEqual(await list(u), [], u);
    assert.deepEqual(await byId(u, consultaId), [], u);
    assert.equal(await del(u, consultaId), 0, u);
  }
  await expectError(as(db, { role: "anon" }, () => db.query("select id from public.legal_consultations")), /permission denied/i);
});

await check("não dá para gravar consulta em nome de outro (autoria forjada é rejeitada)", async () => {
  await expectError(insert(U.adm, { author: U.autor }), /row-level security/i);
  await expectError(insert(U.autor, { author: U.adm }), /row-level security/i);
});

await check("sem vínculo ativo com o projeto não grava consulta nele", async () => {
  await expectError(insert(U.semVinculo), /row-level security/i);
  await expectError(insert(U.autor, { project: P_OUTRO }), /row-level security/i);
});

await check("administrador grava a PRÓPRIA consulta e ela é privada a ele (o autor original não a vê)", async () => {
  const mine = await insert(U.adm, { question: "Pergunta fictícia do administrador" });
  assert.deepEqual(await list(U.adm), [mine.id]);
  assert.deepEqual(await list(U.autor), [consultaId]);
  assert.deepEqual(await byId(U.autor, mine.id), []);
  assert.equal(await del(U.adm, mine.id), 1);
});

await check("a consulta é imutável: ninguém altera pergunta, resposta ou autoria (UPDATE sem política)", async () => {
  const r = await auth(U.autor, () => db.query("update public.legal_consultations set question = 'alterada', author_user_id = $2 where id = $1 returning id", [consultaId, U.adm]));
  assert.equal(r.rows.length, 0);
  const rows = await byId(U.autor, consultaId);
  assert.equal(rows[0].question, "Pergunta fictícia");
});

await check("autor exclui a própria consulta; depois ela deixa de aparecer na lista e por ID", async () => {
  assert.equal(await del(U.autor, consultaId), 1);
  assert.deepEqual(await list(U.autor), []);
  assert.deepEqual(await byId(U.autor, consultaId), []);
  assert.equal((await db.query("select count(*)::int c from public.legal_consultations where id=$1", [consultaId])).rows[0].c, 0);
});

await check("service_role (ignora RLS por definição) não consegue criar consulta SEM autor identificável: author_user_id é obrigatório", async () => {
  await expectError(
    as(db, { role: "service_role" }, () => db.query("insert into public.legal_consultations (project_id, question, response) values ($1,'sem autor','{}'::jsonb)", [P])),
    /null value|not-null|author_user_id/i
  );
  assert.equal((await db.query("select count(*)::int c from public.legal_consultations where question='sem autor'")).rows[0].c, 0);
});

await check("pergunta vazia ou gigante é recusada pelo banco", async () => {
  await expectError(insert(U.autor, { question: "" }), /check/i);
  await expectError(insert(U.autor, { question: "x".repeat(8001) }), /check/i);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
