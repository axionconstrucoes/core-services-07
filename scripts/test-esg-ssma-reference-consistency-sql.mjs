// Consistência obra/obrigação/comprovação/registro da referência ESG<->SSMA depois do INSERT (PostgreSQL 17 DESCARTÁVEL em PGlite;
// dados sintéticos; nenhum banco real é tocado). Demonstra a lacuna ANTES da migration 20261106115000 (proposta, aditiva) e a trava
// DEPOIS (chaves estrangeiras compostas), sem regressão para linhas sem referência. A corrida vincular x mover só é provável em um
// servidor real (scripts do relatório de validação); aqui ficam as garantias declarativas.
// Uso: node scripts/test-esg-ssma-reference-consistency-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const GUARD = "20261106115000_esg_ssma_reference_consistency_guard.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.some((f) => /^(20261106120000|20261106130000)_/.test(f))) throw new Error("migration proibida presente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 240)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
const FK = /foreign key/i;

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files.filter((f) => f < GUARD)) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (uid, fn) => {
  await db.exec(`select set_config('app.uid','${uid}',false); select set_config('app.role','authenticated',false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001", P2 = "10000000-0000-4000-8000-000000000002";
const REC = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const OBL = (n) => `60000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const SUB = (n) => `70000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const U = { adm2: 1, col: 2, outro: 3 }; // adm2 = Administrador das DUAS obras
for (const [k, n] of Object.entries(U)) {
  await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
  await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
}
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01'),($2,'Obra 2','O2','Cliente','Cidade','2026-01-01','2027-01-01')", [P1, P2]);
const member = (p, n, perm) => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [p, id(n), perm]);
await member(P1, U.adm2, "ADMINISTRADOR"); await member(P2, U.adm2, "ADMINISTRADOR"); await member(P1, U.col, "COLABORADOR");
const catC = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'esg_obligations_category_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
const perC = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'esg_obligations_periodicity_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
const obl = (n) => db.query("insert into public.esg_obligations (id,project_id,title,category,periodicity,created_by_user_id) values ($1,$2,'Obrigação '||$3,$4,$5,$6)", [OBL(n), P1, String(n), catC, perC, id(U.adm2)]);
const sub = (n, o) => db.query("insert into public.esg_obligation_submissions (id,project_id,obligation_id,reference_date,status,filled_by_user_id) values ($1,$2,$3,'2026-10-01','PENDENTE',$4)", [SUB(n), P1, OBL(o), id(U.adm2)]);
const rec = (n) => db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA','EPI','Descrição '||$3,'Bloco A','2026-10-20T10:00:00Z','2026-10-20T10:05:00Z','ALTA',$4)", [REC(n), P1, String(n), id(U.col)]);
await obl(1); await obl(2); await sub(1, 1); await sub(2, 1);
await rec(1); await rec(2); await rec(3);
// R1<->S1 ativa; R3<->S2 criada e REVOGADA; R2 e O2 sem referência
await as(id(U.adm2), () => db.query("select public.esg_link_ssma_record($1,$2,null)", [SUB(1), REC(1)]));
const r3 = await as(id(U.adm2), () => db.query("select public.esg_link_ssma_record($1,$2,null) as id", [SUB(2), REC(3)]));
await as(id(U.adm2), () => db.query("select public.esg_unlink_ssma_record($1,'revogada para o teste')", [r3.rows[0].id]));
const inconsistent = async () => (await q("select count(*)::int n from public.esg_ssma_record_references x join public.ssma_field_records r on r.id=x.field_record_id join public.esg_obligation_submissions s on s.id=x.submission_id join public.esg_obligations o on o.id=x.obligation_id where x.project_id<>r.project_id or x.project_id<>s.project_id or x.project_id<>o.project_id or x.obligation_id<>s.obligation_id"))[0].n;

console.log("\n======================================\nREFERÊNCIA ESG<->SSMA — CONSISTÊNCIA APÓS O INSERT (PGlite)\n======================================");
await check("ANTES da migration nova: Administrador das duas obras move a obrigação referenciada e a referência fica INCONSISTENTE (lacuna comprovada)", async () => {
  await as(id(U.adm2), () => db.query("update public.esg_obligations set project_id=$1 where id=$2", [P2, OBL(1)]));
  eq(await inconsistent(), 2, "referências inconsistentes (ativa e revogada)");
  await db.query("update public.esg_obligations set project_id=$1 where id=$2", [P1, OBL(1)]); // restaura (superusuário) para o resto do teste
  eq(await inconsistent(), 0, "estado restaurado");
});
await check("ANTES da migration nova: mover o registro de campo referenciado de obra também passa (service/superusuário)", async () => {
  await db.query("update public.ssma_field_records set project_id=$1 where id=$2", [P2, REC(1)]);
  eq(await inconsistent(), 1, "inconsistente");
  await db.query("update public.ssma_field_records set project_id=$1 where id=$2", [P1, REC(1)]);
  eq(await inconsistent(), 0, "restaurado");
});

await db.exec(clean(GUARD));

await check("DEPOIS: obrigação referenciada não muda de obra (Administrador das duas obras e superusuário), nada é alterado", async () => {
  const e1 = await as(id(U.adm2), () => err(db.query("update public.esg_obligations set project_id=$1 where id=$2", [P2, OBL(1)])));
  ok(FK.test(e1 ?? ""), `authenticated recusado: ${e1}`);
  const e2 = await err(db.query("update public.esg_obligations set project_id=$1 where id=$2", [P2, OBL(1)]));
  ok(FK.test(e2 ?? ""), `superusuário recusado: ${e2}`);
  eq((await q("select project_id from public.esg_obligations where id=$1", [OBL(1)]))[0].project_id, P1, "obrigação intacta");
  eq(await inconsistent(), 0, "sem inconsistência");
});
await check("DEPOIS: registro de campo referenciado (ativa) e o de referência REVOGADA não mudam de obra", async () => {
  for (const r of [1, 3]) {
    const e = await err(db.query("update public.ssma_field_records set project_id=$1 where id=$2", [P2, REC(r)]));
    ok(FK.test(e ?? ""), `registro ${r}: ${e}`);
  }
  eq(await inconsistent(), 0, "sem inconsistência");
});
await check("DEPOIS: comprovação referenciada não troca de obrigação (também a de referência revogada)", async () => {
  for (const s of [1, 2]) {
    const e1 = await err(db.query("update public.esg_obligation_submissions set obligation_id=$1 where id=$2", [OBL(2), SUB(s)]));
    ok(e1 && FK.test(e1), `obrigação da comprovação ${s}: ${e1}`);
  }
  eq(await inconsistent(), 0, "sem inconsistência");
});
await check("SEM REGRESSÃO: linhas sem referência continuam podendo mudar de obra; colunas comuns das referenciadas continuam atualizáveis", async () => {
  await db.query("update public.ssma_field_records set project_id=$1 where id=$2", [P2, REC(2)]); // sem referência
  await db.query("update public.ssma_field_records set project_id=$1 where id=$2", [P1, REC(2)]);
  await db.query("update public.esg_obligations set project_id=$1 where id=$2", [P2, OBL(2)]); // sem referência
  await db.query("update public.esg_obligations set project_id=$1 where id=$2", [P1, OBL(2)]);
  await db.query("update public.ssma_field_records set description='Descrição revisada', due_date='2026-12-31' where id=$1", [REC(1)]);
  await db.query("update public.esg_obligations set title='Título revisado' where id=$1", [OBL(1)]);
  await db.query("update public.esg_obligation_submissions set observation='observação' where id=$1", [SUB(1)]);
  eq((await q("select description from public.ssma_field_records where id=$1", [REC(1)]))[0].description, "Descrição revisada", "update comum");
});
await check("SEM REGRESSÃO: vincular e desvincular seguem funcionando (histórico e auditoria preservados)", async () => {
  const n0 = (await q("select count(*)::int n from public.esg_ssma_record_references"))[0].n;
  const x = await as(id(U.adm2), () => db.query("select public.esg_link_ssma_record($1,$2,'novo') as id", [SUB(1), REC(3)]));
  await as(id(U.adm2), () => db.query("select public.esg_unlink_ssma_record($1,'motivo válido')", [x.rows[0].id]));
  eq((await q("select count(*)::int n from public.esg_ssma_record_references"))[0].n, n0 + 1, "linha nova; nada apagado");
});
await check("INSERT: vínculo contra cadeia JÁ inconsistente (obrigação movida antes de existir referência) é recusado, e a cadeia consistente continua aceita", async () => {
  await sub(3, 2); // comprovação da obrigação 2 (obra 1), ainda sem referência
  await db.query("update public.esg_obligations set project_id=$1 where id=$2", [P2, OBL(2)]); // permitido: sem referência
  const e = await as(id(U.adm2), () => err(db.query("select public.esg_link_ssma_record($1,$2,null)", [SUB(3), REC(2)])));
  ok(FK.test(e ?? ""), `vínculo recusado: ${e}`);
  eq((await q("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1", [SUB(3)]))[0].n, 0, "nenhuma referência criada");
  await db.query("update public.esg_obligations set project_id=$1 where id=$2", [P1, OBL(2)]); // restaura a cadeia
  const x = await as(id(U.adm2), () => db.query("select public.esg_link_ssma_record($1,$2,null) as id", [SUB(3), REC(2)]));
  ok(x.rows[0].id, "cadeia consistente aceita");
  eq(await inconsistent(), 0, "sem inconsistência");
});
await check("INSERT direto (service/superusuário) fora da RPC com obra divergente também é recusado", async () => {
  const e = await err(db.query("insert into public.esg_ssma_record_references (project_id,obligation_id,submission_id,field_record_id,created_by_user_id) values ($1,$2,$3,$4,$5)", [P2, OBL(1), SUB(1), REC(2), id(U.adm2)]));
  ok(FK.test(e ?? ""), `INSERT direto recusado: ${e}`);
});
await check("contrato da 20261106110000 preservado: nenhum gatilho de USUÁRIO na tabela de referências; 3 UNIQUE e 3 FK compostas, uma vez cada", async () => {
  eq((await q("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='esg_ssma_record_references' and not t.tgisinternal"))[0].n, 0, "sem gatilho de usuário");
  const names = (await q("select conname from pg_constraint where conname in ('esg_obligations_id_project_uk','esg_obligation_submissions_chain_uk','ssma_field_records_id_project_uk','esg_ssma_record_references_submission_chain_fk','esg_ssma_record_references_obligation_project_fk','esg_ssma_record_references_record_project_fk') order by 1")).map((r) => r.conname);
  eq(names.length, 6, `constraints: ${names.join(",")}`);
});
await check("idempotência: reaplicar a migration duas vezes não dá erro nem duplica constraints", async () => {
  await db.exec(clean(GUARD)); await db.exec(clean(GUARD));
  eq((await q("select count(*)::int n from pg_constraint where conname like 'esg_ssma_record_references\\_%\\_fk' or conname in ('esg_obligations_id_project_uk','esg_obligation_submissions_chain_uk','ssma_field_records_id_project_uk')"))[0].n, 6, "3 UNIQUE + 3 FK compostas (as FKs simples originais terminam em _fkey e não entram na conta)");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
