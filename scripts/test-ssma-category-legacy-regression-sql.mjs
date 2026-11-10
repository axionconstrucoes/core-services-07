// Regressão: categoria estruturada do registro de campo x registros HISTÓRICOS (PostgreSQL 17 descartável em PGlite, dados sintéticos).
// Problema: "check ... not valid" é reavaliada em QUALQUER UPDATE da linha; registros antigos com categoria livre deixam de poder ser
// atualizados (inclusive pela propagação de responsável/prazo do módulo Ações). Esperado após a correção: registros antigos seguem
// atualizáveis, e NOVOS valores inválidos continuam recusados (INSERT, ou UPDATE que troque a categoria para fora da lista).
//
// Uso: node scripts/test-ssma-category-legacy-regression-sql.mjs   (ACC_MIGRATIONS_DIR opcional: outra pasta de migrations)
// Sem banco real, sem rede.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.ACC_MIGRATIONS_DIR ?? path.join(here, "..", "supabase", "migrations");
const PREREQ = "20261106100000_ssma_esg_acoes_perfis_notificacoes.sql";
const TARGET = "20261106110000_ssma_esg_evidence_reference.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.some((f) => /^(20261106120000|20261106130000)_/.test(f))) throw new Error("migration proibida presente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^\uFEFF/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 220)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files.filter((f) => f < PREREQ)) await db.exec(clean(f));
const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (uid, fn) => {
  await db.exec(`select set_config('app.uid','${uid}',false); select set_config('app.role','authenticated',false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001";
const REC = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ACT = (n) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const U = { adm: 1, col: 2, col2: 3 };
for (const [k, n] of Object.entries(U)) {
  await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
  await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
}
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01')", [P1]);
for (const [n, perm] of [[U.adm, "ADMINISTRADOR"], [U.col, "COLABORADOR"], [U.col2, "COLABORADOR"]]) await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [P1, id(n), perm]);

// ---- dados HISTÓRICOS (antes da migration): categorias livres, com e sem ação corretiva ----
const LEGACY = "Categoria antiga em texto livre";
const mk = (n, category, withAction) => db.query(
  "insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id,responsible_user_id,due_date) values ($1,$2,'OCORRENCIA',$3,'Descricao','Bloco A','2026-10-01T10:00:00Z','2026-10-01T10:00:00Z','ALTA',$4,$5,$6)",
  [REC(n), P1, category, id(U.col), withAction ? id(U.col) : null, withAction ? "2026-12-31" : null]);
await mk(1, LEGACY, true); await mk(2, LEGACY, false); await mk(3, "EPI", true);
await db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date) values ($1,$2,$3,$4,'2026-12-31')", [ACT(1), REC(1), P1, id(U.col)]);
await db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date) values ($1,$2,$3,$4,'2026-12-31')", [ACT(3), REC(3), P1, id(U.col)]);

for (const f of [PREREQ, TARGET]) await db.exec(clean(f));
const slaOf = async (a) => (await q("select sla_action_id s from public.ssma_corrective_actions where id=$1", [a]))[0].s;

console.log("\n======================================\nCATEGORIA ESTRUTURADA x REGISTROS HISTÓRICOS — REGRESSÃO (PGlite)\n======================================");

await check("backfill continua vinculando as ações dos registros históricos (inclusive os de categoria antiga)", async () => {
  ok(await slaOf(ACT(1)), "ação do registro de categoria antiga não vinculada");
  ok(await slaOf(ACT(3)), "ação do registro de categoria válida não vinculada");
});
await check("registro HISTÓRICO com categoria antiga continua intacto após a migration (não reescrito)", async () => {
  eq((await q("select category c from public.ssma_field_records where id=$1", [REC(1)]))[0].c, LEGACY, "categoria preservada");
});
await check("UPDATE comum (outra coluna) em registro histórico com categoria antiga é PERMITIDO", async () => {
  const e = await err(db.query("update public.ssma_field_records set location='Bloco B' where id=$1", [REC(2)]));
  ok(!e, `UPDATE recusado: ${e}`);
});
await check("operação do trigger SLA: reatribuir responsável da ação SLA propaga ao registro histórico de categoria antiga", async () => {
  const sla = await slaOf(ACT(1));
  const e2 = await err(as(id(U.adm), () => q("update public.sla_actions set responsible_user_id=$1 where id=$2", [id(U.col2), sla])));
  ok(!e2, `reatribuição recusada: ${e2}`);
  eq((await q("select responsible_user_id r from public.ssma_field_records where id=$1", [REC(1)]))[0].r, id(U.col2), "responsável propagado ao registro");
  eq((await q("select responsible_user_id r from public.ssma_corrective_actions where id=$1", [ACT(1)]))[0].r, id(U.col2), "responsável propagado à ação SSMA");
});
await check("operação do trigger SLA: alterar prazo da ação SLA propaga ao registro histórico de categoria antiga", async () => {
  const sla = await slaOf(ACT(1));
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set complete_due_at = '2027-01-15T12:00:00Z' where id=$1", [sla])));
  ok(!e, `alteração de prazo recusada: ${e}`);
  eq((await q("select due_date::text d from public.ssma_field_records where id=$1", [REC(1)]))[0].d, "2027-01-15", "prazo propagado ao registro");
});
await check("operação do trigger SLA: início pelo módulo Ações (IN_PROGRESS) em ação de registro histórico", async () => {
  const sla = await slaOf(ACT(1));
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set status='IN_PROGRESS', acknowledged_at=now(), acknowledged_by_user_id=$2 where id=$1", [sla, id(U.adm)])));
  ok(!e, `início recusado: ${e}`);
});
await check("registro histórico com categoria antiga: trocar a categoria para um valor FORA da lista é recusado", async () => {
  const e = await err(db.query("update public.ssma_field_records set category='Inventada' where id=$1", [REC(2)]));
  ok(/category_structured/.test(e ?? ""), `esperado recusa com o nome da constraint, obtido: ${e}`);
  eq((await q("select category c from public.ssma_field_records where id=$1", [REC(2)]))[0].c, LEGACY, "categoria inalterada");
});
await check("registro histórico: trocar a categoria para um valor DA lista é permitido", async () => {
  const e = await err(db.query("update public.ssma_field_records set category='Ato inseguro' where id=$1", [REC(2)]));
  ok(!e, `recusado: ${e}`);
});
await check("NOVO registro com categoria fora da lista é recusado (INSERT direto e RPC), com o nome da constraint preservado", async () => {
  const e1 = await err(db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA','Inventada','d','L',now(),now(),'ALTA',$3)", [REC(9), P1, id(U.col)]));
  ok(/category_structured/.test(e1 ?? ""), `INSERT direto: ${e1}`);
  const e2 = await err(as(id(U.col), () => q("select public.ssma_field_record_submit($1,$2,$3,'OCORRENCIA','Inventada','descricao','L',now(),now(),'ALTA') i", [id(U.col), crypto.randomUUID(), P1])));
  ok(/category_structured/.test(e2 ?? ""), `RPC: ${e2}`);
});
await check("NOVO registro com categoria da lista é aceito pelo RPC (fluxo normal preservado)", async () => {
  const e = await err(as(id(U.col), () => q("select public.ssma_field_record_submit($1,$2,$3,'OCORRENCIA','Quase-acidente','descricao','L',now(),now(),'ALTA') i", [id(U.col), crypto.randomUUID(), P1])));
  ok(!e, `recusado: ${e}`);
});
await check("sem lacuna: o guard também vale com session_replication_role = replica (trigger ENABLE ALWAYS), como uma CHECK valeria", async () => {
  await db.exec("set session_replication_role = replica");
  try {
    const e = await err(db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA','Inventada','descricao','L',now(),now(),'ALTA',$3)", [REC(8), P1, id(U.col)]));
    ok(/category_structured/.test(e ?? ""), `inserção inválida deveria ser recusada mesmo em modo replica: ${e}`);
    const e2 = await err(db.query("update public.ssma_field_records set location='Bloco D' where id=$1", [REC(1)]));
    ok(!e2, `UPDATE de registro histórico segue permitido em modo replica: ${e2}`);
  } finally { await db.exec("set session_replication_role = origin"); }
});
await check("variações inválidas continuam recusadas (espaço sobrando, minúscula, UPDATE em lote, ON CONFLICT DO UPDATE)", async () => {
  const base = "insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA',$3,'descricao','L',now(),now(),'ALTA',$4)";
  for (const [n, cat] of [[11, "EPI "], [12, "epi"]]) ok(/category_structured/.test((await err(db.query(base, [REC(n), P1, cat, id(U.col)]))) ?? ""), `categoria "${cat}" deveria ser recusada`);
  const ok1 = await err(db.query(base, [REC(13), P1, "EPI", id(U.col)])); ok(!ok1, `categoria válida: ${ok1}`);
  const up = await err(db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA','Inventada','descricao','L',now(),now(),'ALTA',$3) on conflict (id) do update set category = excluded.category", [REC(13), P1, id(U.col)]));
  ok(/category_structured/.test(up ?? ""), `ON CONFLICT DO UPDATE: ${up}`);
  const batch = await err(db.query("update public.ssma_field_records set category = case when id=$1 then 'Inventada' else category end", [REC(13)]));
  ok(/category_structured/.test(batch ?? ""), `UPDATE em lote: ${batch}`);
  eq((await q("select category c from public.ssma_field_records where id=$1", [REC(13)]))[0].c, "EPI", "nada mudou");
});
await check("idempotência: reaplicar as duas migrations não dá erro e mantém a regra (sem duplicar trigger)", async () => {
  for (const f of [PREREQ, TARGET]) { const e = await err(db.exec(clean(f))); ok(!e, `reaplicar ${f}: ${e}`); }
  const e = await err(db.query("update public.ssma_field_records set category='Inventada' where id=$1", [REC(2)]));
  ok(/category_structured/.test(e ?? ""), "regra segue ativa");
  const e2 = await err(db.query("update public.ssma_field_records set location='Bloco C' where id=$1", [REC(1)]));
  ok(!e2, `histórico segue atualizável: ${e2}`);
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
