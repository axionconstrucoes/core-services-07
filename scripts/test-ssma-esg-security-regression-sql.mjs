// Regressão das correções de segurança da auditoria do PR #149 (PostgreSQL 17 DESCARTÁVEL em PGlite; nenhum banco real é tocado):
//   1) isolamento entre obras: o vínculo SSMA↔SLA não pode ser trocado por UPDATE nem apontar para outra obra;
//   2) idempotência: as migrations 20261106100000 e 20261106110000 podem ser reaplicadas sem erro e sem duplicar dados;
//   3) anti-oráculo de existência: quem não é membro da obra recebe o MESMO erro para um ID real e para um ID inexistente,
//      sem mudar o comportamento de quem é membro (PROJECT_MISMATCH, FORBIDDEN, ADMIN_REQUIRED continuam para o próprio projeto).
// Uso: node scripts/test-ssma-esg-security-regression-sql.mjs

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
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");

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
const code = async (p) => { const e = await err(p); return e ? (e.match(/[A-Z][A-Z_]{4,}/) || [e])[0] : "OK"; };

const U = { adm: 1, gest: 2, col: 3, lei: 4, adm2: 5, both: 6, outsider: 7, gone: 8 };
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001", P2 = "10000000-0000-4000-8000-000000000002";
const REC = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ACT = (n) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const FORM = (n) => `50000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const GHOST = "99999999-9999-4999-8999-999999999999";
for (const [k, n] of Object.entries(U)) {
  await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
  await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
}
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01'),($2,'Obra 2','O2','Cliente','Cidade','2026-01-01','2027-01-01')", [P1, P2]);
const member = (p, n, perm, st = "ACTIVE") => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, id(n), perm, st]);
await member(P1, U.adm, "ADMINISTRADOR"); await member(P1, U.gest, "GESTOR"); await member(P1, U.col, "COLABORADOR"); await member(P1, U.lei, "LEITURA");
await member(P2, U.adm2, "ADMINISTRADOR"); await member(P1, U.both, "ADMINISTRADOR"); await member(P2, U.both, "ADMINISTRADOR");

// dados HISTÓRICOS (antes das migrations): 4 ações corretivas
const mkRec = (n, p, by) => db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,reported_by_user_id) values ($1,$2,'OCORRENCIA','EPI','Descricao '||$3,'Bloco A','2026-10-01T10:00:00Z','2026-10-01T10:00:00Z','ALTA',$4)", [REC(n), p, String(n), id(by)]);
await mkRec(1, P1, U.col); await mkRec(2, P1, U.col); await mkRec(3, P2, U.adm2); await mkRec(4, P1, U.col); await mkRec(5, P1, U.col);
const mkAct = (n, r, p, resp, status = "ABERTA", concl = null) => db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date,status,concluded_at,concluded_by_user_id) values ($1,$2,$3,$4,'2026-12-31',$5,$6,$7)", [ACT(n), REC(r), p, id(resp), status, concl ? "2026-10-20T10:00:00Z" : null, concl ? id(concl) : null]);
await mkAct(1, 1, P1, U.col); await mkAct(2, 2, P1, U.col, "CONCLUIDA", U.col); await mkAct(3, 3, P2, U.adm2); await mkAct(4, 4, P1, U.gone);
// o RPC grava responsável e prazo também no registro de campo (check: responsável exige prazo)
for (const [r, resp] of [[1, U.col], [2, U.col], [3, U.adm2], [4, U.gone]]) await db.query("update public.ssma_field_records set responsible_user_id=$2, due_date='2026-12-31' where id=$1", [REC(r), id(resp)]);
const snapshot = async () => JSON.stringify(await q("select id,status,due_date::text,concluded_at,responsible_user_id from public.ssma_corrective_actions order by id"));
const hist = await snapshot();

for (const f of [PREREQ, TARGET]) await db.exec(clean(f));

console.log("\n======================================\nCORREÇÕES DE SEGURANÇA — REGRESSÃO (PGlite)\n======================================");

// ---------- 0) Backfill das 4 ações históricas ----------
await check("backfill: 4 ações históricas vinculadas 1:1, na mesma obra, histórico SSMA intacto", async () => {
  const rows = await q("select a.id, a.project_id ap, s.project_id sp, s.related_ssma_corrective_action_id r from public.ssma_corrective_actions a join public.sla_actions s on s.id = a.sla_action_id order by a.id");
  eq(rows.length, 4, "vinculadas");
  ok(rows.every((x) => x.r === x.id && x.ap === x.sp), "1:1 e mesma obra");
  eq(await snapshot(), hist, "histórico SSMA inalterado");
  eq((await q("select count(*)::int n from public.sla_actions"))[0].n, 4, "4 ações SLA");
  eq((await q("select responsible_user_id r from public.sla_actions where related_ssma_corrective_action_id=$1", [ACT(4)]))[0].r, null, "responsável fora da obra => ação SLA sem responsável");
});

// ---------- 1) Isolamento: vínculo imutável e mesma obra ----------
// ação SSMA de P2 ainda SEM vínculo (histórico anterior sem responsável válido) e uma ação SLA própria de P1
await mkRec(6, P2, U.adm2);
await db.query("update public.ssma_field_records set responsible_user_id=$2, due_date='2026-12-31' where id=$1", [REC(6), id(U.adm2)]);
await db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date) values ($1,$2,$3,$4,'2026-12-31')", [ACT(9), REC(6), P2, id(U.adm2)]);
const ownSla = (await q("insert into public.sla_actions (project_id,origin,title,risk_level,area,responsible_user_id,assume_due_at,complete_due_at,created_by_type,created_by_user_id) values ($1,'MANUAL','Ação própria de P1','LOW','ADMINISTRATIVO',$2,now()+interval '1 day',now()+interval '5 days','USER',$2) returning id", [P1, id(U.adm)]))[0].id;
const victim = async () => JSON.stringify({ a: (await q("select due_date::text d, status, responsible_user_id r from public.ssma_corrective_actions where id=$1", [ACT(9)]))[0], r: (await q("select due_date::text d, responsible_user_id r from public.ssma_field_records where id=$1", [REC(6)]))[0] });

await check("ADMINISTRADOR da obra 1 NÃO consegue apontar a ação SLA dele para a ação SSMA da obra 2 (SSMA_LINK_IMMUTABLE); obra 2 intacta", async () => {
  const v0 = await victim();
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set related_ssma_corrective_action_id=$1, complete_due_at=now()+interval '40 days' where id=$2", [ACT(9), ownSla])));
  ok(/SSMA_LINK_IMMUTABLE/.test(e ?? ""), `esperado SSMA_LINK_IMMUTABLE, obtido ${e}`);
  eq(await victim(), v0, "ação e registro de campo da obra 2 intactos");
  eq((await q("select related_ssma_corrective_action_id r from public.sla_actions where id=$1", [ownSla]))[0].r, null, "vínculo não gravado");
});
await check("o vínculo de uma ação SLA JÁ vinculada também não pode ser trocado (nem por outra ação da mesma obra)", async () => {
  const linked = (await q("select sla_action_id s from public.ssma_corrective_actions where id=$1", [ACT(1)]))[0].s;
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set related_ssma_corrective_action_id=$1 where id=$2", [ACT(2), linked])));
  ok(/SSMA_LINK_IMMUTABLE|duplicate key|unique/i.test(e ?? ""), `trocar vínculo deveria falhar: ${e}`);
  eq((await q("select related_ssma_corrective_action_id r from public.sla_actions where id=$1", [linked]))[0].r, ACT(1), "vínculo original mantido");
});
await check("defesa em profundidade: vínculo criado por service_role apontando para outra obra NÃO propaga alteração (SSMA_LINK_PROJECT_MISMATCH)", async () => {
  const bad = (await q("insert into public.sla_actions (project_id,origin,title,risk_level,area,responsible_user_id,assume_due_at,complete_due_at,related_ssma_corrective_action_id,created_by_type,created_by_user_id) values ($1,'SSMA_CORRECTIVE_ACTION','Vínculo cruzado','LOW','ESG_SSMA',$2,now()+interval '1 day',now()+interval '5 days',$3,'USER',$2) returning id", [P1, id(U.adm), ACT(9)]))[0].id;
  const v0 = await victim();
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set complete_due_at=now()+interval '99 days' where id=$1", [bad])));
  ok(/SSMA_LINK_PROJECT_MISMATCH/.test(e ?? ""), `esperado SSMA_LINK_PROJECT_MISMATCH, obtido ${e}`);
  eq(await victim(), v0, "obra 2 intacta");
  await db.query("delete from public.sla_actions where id=$1", [bad]);
});
await check("comportamento autorizado preservado: ADMINISTRADOR da MESMA obra reatribui responsável e prazo e isso propaga ao SSMA", async () => {
  const linked = (await q("select sla_action_id s from public.ssma_corrective_actions where id=$1", [ACT(1)]))[0].s;
  await as(id(U.adm), () => q("update public.sla_actions set responsible_user_id=$1, complete_due_at=($3::timestamptz + interval '20 days') where id=$2", [id(U.gest), linked, "2026-12-31T12:00:00Z"]));
  const a = (await q("select responsible_user_id r, due_date::text d from public.ssma_corrective_actions where id=$1", [ACT(1)]))[0];
  eq(a.r, id(U.gest), "responsável propagado");
  ok(a.d !== "2026-12-31", `prazo propagado (${a.d})`);
});
await check("conclusão direta no módulo Ações segue recusada para ação de origem SSMA (Administrador) e o RPC do SSMA continua exigindo evidência", async () => {
  const linked = (await q("select sla_action_id s from public.ssma_corrective_actions where id=$1", [ACT(1)]))[0].s;
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set status='COMPLETED', completed_at=now(), completed_by_user_id=$2, completion_note='x', acknowledged_at=coalesce(acknowledged_at,now()), acknowledged_by_user_id=coalesce(acknowledged_by_user_id,$2) where id=$1", [linked, id(U.adm)])));
  ok(/SSMA_ACTION_COMPLETE_VIA_SSMA/.test(e ?? ""), `esperado SSMA_ACTION_COMPLETE_VIA_SSMA, obtido ${e}`);
  eq(await code(as(id(U.adm), () => q("select public.ssma_corrective_action_update($1,'CONCLUIDA',null,null)", [ACT(1)]))), "JUSTIFICATION_REQUIRED", "administrador sem evidência nem justificativa");
  eq(await code(as(id(U.lei), () => q("select public.ssma_corrective_action_update($1,'CONCLUIDA','justificativa longa o bastante',null)", [ACT(1)]))), "ACTION_ACCESS_DENIED", "leitura não conclui");
});
await check("ON DELETE SET NULL do vínculo continua funcionando (apagar o registro SSMA não é barrado pelo trigger)", async () => {
  await db.query("delete from public.ssma_field_records where id=$1", [REC(4)]);
  eq((await q("select count(*)::int n from public.sla_actions where related_ssma_corrective_action_id=$1", [ACT(4)]))[0].n, 0, "vínculo removido sem erro");
});

// ---------- 2) Idempotência ----------
await check("idempotência: reaplicar 20261106100000 e 20261106110000 DUAS vezes não dá erro, não duplica ações e preserva o isolamento", async () => {
  const slaBefore = (await q("select count(*)::int n from public.sla_actions"))[0].n;
  const hBefore = await snapshot();
  const counts = [];
  for (let i = 0; i < 2; i += 1) { for (const f of [PREREQ, TARGET]) { const e = await err(db.exec(clean(f))); ok(!e, `reaplicar ${f}: ${e}`); } counts.push((await q("select count(*)::int n from public.sla_actions"))[0].n); }
  // 1ª reaplicação: o backfill vincula a ação SSMA que ainda não tinha vínculo (ACT 9) => no máximo +1; 2ª: estável
  ok(counts[0] - slaBefore <= 1, `1ª reaplicação criou ${counts[0] - slaBefore} ações`);
  eq(counts[1], counts[0], "2ª reaplicação não cria nada (sem duplicar ações SLA)");
  eq(await snapshot(), hBefore, "histórico SSMA inalterado");
  const e = await err(as(id(U.adm), () => q("update public.sla_actions set related_ssma_corrective_action_id=$1 where id=$2", [ACT(9), ownSla])));
  ok(/SSMA_LINK_IMMUTABLE/.test(e ?? ""), "trigger segue ativo após reaplicar");
});
await check("idempotência: cada policy nova existe exatamente uma vez após reaplicar", async () => {
  for (const [t, p] of [["esg_obligation_submissions", "esg_obligation_submissions_insert_registrars_self_authored"], ["esg_obligation_evidence", "esg_obligation_evidence_insert_registrars_self_authored"], ["ssma_field_notification_deliveries", "ssma_field_notification_deliveries_select_admin"], ["ssma_incident_links", "ssma_incident_links_select_members"], ["esg_ssma_record_references", "esg_ssma_record_references_select_members"]]) {
    eq((await q("select count(*)::int n from pg_policies where tablename=$1 and policyname=$2", [t, p]))[0].n, 1, `${t}.${p}`);
  }
});

// ---------- 3) Anti-oráculo de existência ----------
const cat = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname='esg_obligations_category_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
const per = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname='esg_obligations_periodicity_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
const mkSub = async (p, by) => {
  const o = (await q("insert into public.esg_obligations (project_id,title,category,periodicity,created_by_user_id) values ($1,'Obrig',$2,$3,$4) returning id", [p, cat, per, id(by)]))[0].id;
  return (await q("insert into public.esg_obligation_submissions (project_id,obligation_id,reference_date,status,filled_by_user_id) values ($1,$2,'2026-10-01','PENDENTE',$3) returning id", [p, o, id(by)]))[0].id;
};
const S1 = await mkSub(P1, U.adm), S2 = await mkSub(P2, U.adm2);
const link = (u, s, r) => as(id(u), () => q("select public.esg_link_ssma_record($1,$2,null) i", [s, r]));

await check("esg_link_ssma_record: usuário de OUTRA obra recebe o mesmo erro para comprovação real e inexistente", async () => {
  const real = await code(link(U.adm2, S1, REC(1))), fake = await code(link(U.adm2, GHOST, REC(1)));
  eq(real, "OBLIGATION_NOT_FOUND", "comprovação real de outra obra"); eq(fake, real, "inexistente igual a real");
});
await check("esg_link_ssma_record: registro de outra obra só é revelado a quem é membro dessa obra", async () => {
  const outsiderReal = await code(link(U.adm, S1, REC(3)));      // registro REAL de P2, chamador só de P1
  const outsiderFake = await code(link(U.adm, S1, GHOST));        // registro inexistente
  eq(outsiderReal, "RECORD_NOT_FOUND", "registro real de P2"); eq(outsiderFake, outsiderReal, "indistinguível de inexistente");
  eq(await code(link(U.both, S1, REC(3))), "PROJECT_MISMATCH", "membro das duas obras continua vendo PROJECT_MISMATCH");
});
await check("esg_link_ssma_record: comportamento do próprio projeto preservado (LEITURA=FORBIDDEN; Administrador=OK; idempotente)", async () => {
  eq(await code(link(U.lei, S1, REC(1))), "FORBIDDEN", "leitura");
  eq(await code(link(U.col, S1, REC(1))), "FORBIDDEN", "colaborador em comprovação alheia");
  eq(await code(link(U.adm, S1, REC(1))), "OK", "administrador vincula");
  eq(await code(link(U.adm, S1, REC(1))), "OK", "idempotente");
  eq(await code(as(null, () => q("select public.esg_link_ssma_record($1,$2,null)", [S1, REC(1)]))), "AUTH_REQUIRED", "anônimo");
});
await check("esg_unlink_ssma_record: não-membro recebe o mesmo erro para referência real e inexistente; membro segue com as regras de papel", async () => {
  const ref = (await q("select id from public.esg_ssma_record_references where submission_id=$1 and revoked_at is null", [S1]))[0].id;
  const unlink = (u, r, why = "motivo valido") => as(id(u), () => q("select public.esg_unlink_ssma_record($1,$2)", [r, why]));
  const real = await code(unlink(U.adm2, ref)), fake = await code(unlink(U.adm2, GHOST));
  eq(real, "REFERENCE_NOT_FOUND", "referência real"); eq(fake, real, "inexistente igual a real");
  eq(await code(unlink(U.col, ref)), "FORBIDDEN", "membro sem papel de registrar na comprovação alheia");
  eq(await code(unlink(U.adm, ref, "x")), "REASON_REQUIRED", "motivo obrigatório");
  eq(await code(unlink(U.adm, ref)), "OK", "administrador desvincula");
});
const accidentForm = (n, p, by) => db.query("insert into public.ssma_form_submissions (id,project_id,checklist_slug,checklist_number,checklist_title,drive_folder_name,occurred_at,technician_user_id,field_values,checklist_values,status,submitted_at) values ($1,$2,'ocorrencia-acidente',12,'Ocorrência / acidente','12 - OCORRÊNCIAS E ACIDENTES','2026-10-01T10:00:00Z',$3,'{\"afastamento\":\"Sem afastamento\"}'::jsonb,'{}'::jsonb,'SUBMITTED',now())", [FORM(n), p, id(by)]);
await accidentForm(1, P1, U.col); await accidentForm(2, P2, U.adm2);
await check("ssma_incident_link_set: não-membro recebe o mesmo erro para formulário real e inexistente; membros seguem com ADMIN_REQUIRED", async () => {
  const set = (u, f, r) => as(id(u), () => q("select public.ssma_incident_link_set($1,$2,'SAME_FACT',null)", [f, r]));
  const real = await code(set(U.adm2, FORM(1), REC(1))), fake = await code(set(U.adm2, GHOST, REC(1)));
  eq(real, "FORM_NOT_FOUND", "formulário real de outra obra"); eq(fake, real, "inexistente igual a real");
  eq(await code(set(U.adm, FORM(1), REC(3))), "RECORD_NOT_FOUND", "registro real de outra obra não é revelado");
  eq(await code(set(U.adm, FORM(1), GHOST)), "RECORD_NOT_FOUND", "registro inexistente (igual)");
  eq(await code(set(U.both, FORM(1), REC(3))), "PROJECT_MISMATCH", "membro das duas obras vê PROJECT_MISMATCH");
  for (const u of [U.gest, U.col, U.lei]) eq(await code(set(u, FORM(1), REC(1))), "ADMIN_REQUIRED", `perfil ${u} do próprio projeto`);
  eq(await code(set(U.adm, FORM(1), REC(1))), "OK", "administrador decide");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
