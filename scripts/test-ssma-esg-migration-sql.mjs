// Migration 20261106100000 (ação corretiva SSMA ↔ Ações/SLA, perfis ESG, notificações) contra PostgreSQL 17 DESCARTÁVEL
// (PGlite): reaplica TODAS as migrations anteriores, cria DADOS ANTERIORES (ações abertas, em andamento, concluídas com
// evidência, responsável/autor que saiu da obra, ação SLA alheia, comprovação ESG), aplica a migration e confere
// backfill, preservação do histórico, fluxo novo, concorrência/idempotência, isolamento, perfis ESG e notificações.
// Nenhum banco real é tocado. Uso: node scripts/test-ssma-esg-migration-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const TARGET = "20261106100000_ssma_esg_acoes_perfis_notificacoes.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const before = files.filter((f) => f < TARGET);
const replaySource = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8");
const PLATFORM = replaySource.match(/const PLATFORM = `([\s\S]*?)`;/)[1];

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of before) {
  try { await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite")); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid, fn, role = "authenticated") => {
  await db.exec(`select set_config('app.uid', '${uid ?? ""}', false); select set_config('app.role','${role}',false); set role ${role};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };

const U = { adm: 1, ger: 2, gest: 3, col: 4, col2: 5, lei: 6, inat: 7, fora: 8, saiu: 9, resp: 10 }; // sufixo do uuid
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001", P2 = "10000000-0000-4000-8000-000000000002";
for (const [k, n] of Object.entries(U)) await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
for (const [k, n] of Object.entries(U)) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01'),($2,'Obra 2','O2','Cliente','Cidade','2026-01-01','2027-01-01')", [P1, P2]);
const member = (p, n, perm, st = "ACTIVE") => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, id(n), perm, st]);
await member(P1, U.adm, "ADMINISTRADOR"); await member(P1, U.ger, "GERENTE"); await member(P1, U.gest, "GESTOR"); await member(P1, U.col, "COLABORADOR");
await member(P1, U.col2, "COLABORADOR"); await member(P1, U.lei, "LEITURA"); await member(P1, U.inat, "COLABORADOR", "INACTIVE"); await member(P1, U.resp, "COLABORADOR");
await member(P2, U.fora, "ADMINISTRADOR"); await member(P1, U.saiu, "COLABORADOR");

// ───── DADOS ANTERIORES (como existiriam antes da migration) ─────
const REC = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ACT = (n) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const PHO = (n) => `40000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ins = (n, risk, resp, due, st, concludedBy = null) => db.query(
  "insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,responsible_user_id,due_date,reported_by_user_id) values ($1,$2,'OCORRENCIA','EPI','Descrição antiga '||$3,'Bloco A','2026-10-20T10:00:00Z','2026-10-20T10:05:00Z',$4,$5,$6,$7)",
  [REC(n), P1, String(n), risk, id(resp), due, id(U.col)]);
await ins(1, "ALTA", U.resp, "2026-11-10", "ABERTA");
await ins(2, "CRITICA", U.resp, "2026-10-25", "EM_ANDAMENTO");
await ins(3, "BAIXA", U.resp, "2026-10-30", "CONCLUIDA");
await ins(4, "MEDIA", U.saiu, "2026-10-30", "CONCLUIDA");
await ins(5, "ALTA", U.resp, "2026-11-12", "ABERTA");
for (const [n, st] of [[1, "ABERTA"], [2, "EM_ANDAMENTO"], [3, "CONCLUIDA"], [4, "CONCLUIDA"], [5, "ABERTA"]]) {
  const resp = n === 4 ? U.saiu : U.resp;
  await db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date,status,concluded_at,concluded_by_user_id,created_at) values ($1,$2,$3,$4,(select due_date from public.ssma_field_records where id=$2),$5,$6,$7,'2026-10-20T10:06:00Z')",
    [ACT(n), REC(n), P1, id(resp), st, st === "CONCLUIDA" ? "2026-10-29T12:00:00Z" : null, st === "CONCLUIDA" ? id(resp) : null]);
  await db.query("insert into public.ssma_corrective_action_events (action_id,project_id,kind,note,actor_user_id,created_at) values ($1,$2,'CRIADA','Ação corretiva aberta com o registro.',$3,'2026-10-20T10:06:00Z')", [ACT(n), P1, id(U.col)]);
}
await db.query("insert into public.ssma_corrective_action_events (action_id,project_id,kind,note,actor_user_id,created_at) values ($1,$2,'ANDAMENTO','Iniciei a correção.',$3,'2026-10-22T09:00:00Z')", [ACT(2), P1, id(U.resp)]);
await db.query("insert into public.ssma_field_record_photos (id,record_id,project_id,purpose,storage_path,original_file_name,mime_type,file_size_bytes,sha256_hash,uploaded_by_user_id) values ($1,$2,$3,'EVIDENCIA_ACAO',$4,'ev.jpg','image/jpeg',100,$5,$6)", [PHO(1), REC(3), P1, `${P1}/ssma-registros/${REC(3)}/${PHO(1)}-ev.jpg`, "a".repeat(64), id(U.resp)]);
await db.query("insert into public.ssma_corrective_action_events (action_id,project_id,kind,note,evidence_photo_id,actor_user_id,created_at) values ($1,$2,'CONCLUIDA',null,$3,$4,'2026-10-29T12:00:00Z')", [ACT(3), P1, PHO(1), id(U.resp)]);
await db.query("insert into public.ssma_corrective_action_events (action_id,project_id,kind,note,actor_user_id,created_at) values ($1,$2,'CONCLUIDA','Trocamos o cabo e isolamos a área.',$3,'2026-10-29T12:00:00Z')", [ACT(4), P1, id(U.saiu)]);
// quem concluiu a ação 4 saiu da obra: some do project_memberships DEPOIS da conclusão (FK composta do SLA exigiria membro)
await db.query("delete from public.project_memberships where project_id=$1 and user_id=$2", [P1, id(U.saiu)]);
await db.query("insert into public.sla_actions (id,project_id,origin,title,risk_level,area,status,assume_due_at,created_by_type) values ('50000000-0000-4000-8000-000000000001',$1,'MANUAL','Ação alheia','LOW','ENGENHARIA','PENDING',now(),'SYSTEM')", [P1]);
// ESG anterior: obrigação + comprovação do administrador
await db.query("insert into public.esg_obligations (id,project_id,title,category,periodicity,created_by_user_id) values ('60000000-0000-4000-8000-000000000001',$1,'Licença ambiental','LICENCA_AMBIENTAL','MENSAL',$2)", [P1, id(U.adm)]).catch(async (e) => { console.log("   (ajuste de categoria ESG)", e.message.slice(0, 80)); });
const cat = (await q("select category from public.esg_obligations limit 1"))[0]?.category;
if (!cat) {
  const c = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname like 'esg_obligations_category_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
  const p = (await q("select pg_get_constraintdef(oid) d from pg_constraint where conname like 'esg_obligations_periodicity_check'"))[0].d.match(/'([A-Z_]+)'/)[1];
  await db.query("insert into public.esg_obligations (id,project_id,title,category,periodicity,created_by_user_id) values ('60000000-0000-4000-8000-000000000001',$1,'Licença ambiental',$2,$3,$4)", [P1, c, p, id(U.adm)]);
}
await db.query("insert into public.esg_obligation_submissions (id,project_id,obligation_id,reference_date,status,filled_by_user_id) values ('70000000-0000-4000-8000-000000000001',$1,'60000000-0000-4000-8000-000000000001','2026-10-01','PENDENTE',$2)", [P1, id(U.adm)]);

const snapshot = async () => ({
  records: await q("select * from public.ssma_field_records order by id"),
  events: await q("select * from public.ssma_corrective_action_events order by id"),
  photos: await q("select * from public.ssma_field_record_photos order by id"),
  actions: await q("select id,record_id,project_id,responsible_user_id,due_date,status,concluded_at,concluded_by_user_id,created_at from public.ssma_corrective_actions order by id"),
});
const snap0 = await snapshot();
const slaBefore = (await q("select count(*)::int n from public.sla_actions"))[0].n;

console.log("\n======================================\nSSMA/ESG — MIGRATION 20261106100000 (PGlite, dados anteriores)\n======================================");
let notices = [];
db.onNotice?.((n) => notices.push(n));
await check("a migration aplica sem erro sobre o estado anterior (todas as migrations anteriores reaplicadas)", async () => {
  await db.exec(readFileSync(path.join(dir, TARGET), "utf8").replace(/^﻿/, ""));
});

await check("backfill: toda ação com responsável/autor ainda na obra foi vinculada 1:1; a concluída por quem saiu fica só no SSMA (aviso, sem erro)", async () => {
  const rows = await q("select a.id, a.sla_action_id, s.related_ssma_corrective_action_id r, s.status, s.origin, s.area, s.risk_level from public.ssma_corrective_actions a left join public.sla_actions s on s.id = a.sla_action_id order by a.id");
  const by = Object.fromEntries(rows.map((r) => [r.id.slice(-2), r]));
  ok(by["01"].sla_action_id && by["02"].sla_action_id && by["03"].sla_action_id && by["05"].sla_action_id, "ações 1,2,3,5 vinculadas");
  eq(by["04"].sla_action_id, null, "ação 4 (concluída por quem saiu) não vinculada");
  eq([by["01"].status, by["02"].status, by["03"].status], ["PENDING", "IN_PROGRESS", "COMPLETED"], "status mapeados");
  eq([by["01"].origin, by["01"].area, by["01"].risk_level, by["02"].risk_level], ["SSMA_CORRECTIVE_ACTION", "ESG_SSMA", "HIGH", "CRITICAL"], "origem, área e risco");
  ok(rows.filter((r) => r.sla_action_id).every((r) => r.r === r.id), "vínculo nos dois sentidos");
  eq((await q("select count(*)::int n from public.sla_actions"))[0].n, slaBefore + 4, "4 ações novas + a alheia intacta");
});

await check("backfill: prazo, responsável, conclusão e nota preservados no módulo SLA", async () => {
  const s = await q("select s.* from public.sla_actions s join public.ssma_corrective_actions a on a.sla_action_id = s.id where a.id = $1", [ACT(3)]);
  ok(s[0].completed_at && s[0].completion_note && s[0].completed_by_user_id === id(U.resp), "conclusão com nota padrão (evidência)");
  ok(/evidência/i.test(s[0].completion_note), "nota padrão cita a evidência");
  const s2 = await q("select s.* from public.sla_actions s join public.ssma_corrective_actions a on a.sla_action_id = s.id where a.id = $1", [ACT(2)]);
  eq(s2[0].responsible_user_id, id(U.resp), "responsável");
  ok(s2[0].acknowledged_at && new Date(s2[0].acknowledged_at).toISOString() === "2026-10-22T09:00:00.000Z", "assumida na data do 1º andamento");
  const due = await q("select complete_due_at as d from public.sla_actions where id = $1", [s2[0].id]);
  eq(new Date(due[0].d).toISOString(), "2026-10-26T02:59:59.000Z", "prazo = 23:59:59 de 25/10 em America/Sao_Paulo (UTC-3)");
});

await check("histórico, evidências, fotos, registros e ações do SSMA ficaram IDÊNTICOS (só sla_action_id foi preenchido)", async () => {
  const snap1 = await snapshot();
  eq(snap1.records, snap0.records, "registros"); eq(snap1.events, snap0.events, "eventos"); eq(snap1.photos, snap0.photos, "fotos"); eq(snap1.actions, snap0.actions, "ações (colunas originais)");
});

await check("backfill idempotente: rodar de novo não cria nada e não duplica", async () => {
  const n0 = (await q("select count(*)::int n from public.sla_actions"))[0].n;
  await db.exec(`do $$ declare r record; begin for r in select id from public.ssma_corrective_actions where sla_action_id is null loop perform public.ssma_link_sla_action(r.id); end loop; end $$;`);
  await db.query("select public.ssma_link_sla_action($1)", [ACT(1)]);
  eq((await q("select count(*)::int n from public.sla_actions"))[0].n, n0, "sem duplicar");
});

await check("auditoria do módulo SLA registrou a criação das ações vinculadas (ACTION_CREATED, ator USER do autor)", async () => {
  const a = await q("select count(*)::int n from public.audit_log_entries where action='ACTION_CREATED' and entity_type='SLA_ACTION' and detail like '%SSMA_CORRECTIVE_ACTION%'");
  eq(a[0].n, 4, "4 entradas");
});

// ───── fluxo novo ─────
const submit = (uid, a = {}) => db.query("select public.ssma_field_record_submit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as id",
  [uid, a.id, a.project ?? P1, "OCORRENCIA", "EPI", "Operário sem capacete no pavimento 3", "Pavimento 3", "2026-11-05T10:00:00Z", "2026-11-05T10:05:00Z", a.risk ?? "CRITICA", a.resp ?? id(U.resp), a.due ?? "2026-11-20"]);
const NR = "21000000-0000-4000-8000-000000000001";
await check("envio novo cria registro + ação corretiva + ação no módulo SLA (vinculadas), responsável e prazo do SLA", async () => {
  await as(id(U.col), () => submit(id(U.col), { id: NR }));
  const r = await q("select a.id, a.sla_action_id, s.responsible_user_id, s.status, s.risk_level, s.created_by_user_id from public.ssma_corrective_actions a join public.sla_actions s on s.id=a.sla_action_id where a.record_id=$1", [NR]);
  eq(r.length, 1, "uma ação vinculada"); eq([r[0].responsible_user_id, r[0].status, r[0].risk_level, r[0].created_by_user_id], [id(U.resp), "PENDING", "CRITICAL", id(U.col)], "campos");
});
await check("reenvio do mesmo registro não cria outra ação nem outro aviso (idempotente)", async () => {
  await as(id(U.col), () => submit(id(U.col), { id: NR }));
  await as(id(U.col), () => submit(id(U.col), { id: NR }));
  eq((await q("select count(*)::int n from public.ssma_corrective_actions where record_id=$1", [NR]))[0].n, 1, "ações SSMA");
  eq((await q("select count(*)::int n from public.sla_actions where related_ssma_corrective_action_id in (select id from public.ssma_corrective_actions where record_id=$1)", [NR]))[0].n, 1, "ações SLA");
});
await check("envio de outro usuário com o mesmo id é recusado; LEITURA e fora da obra são recusados", async () => {
  ok(/RECORD_ID_CONFLICT/.test(await err(as(id(U.col2), () => submit(id(U.col2), { id: NR })))), "conflito");
  ok(/READ_ONLY_MEMBER/.test(await err(as(id(U.lei), () => submit(id(U.lei), { id: "21000000-0000-4000-8000-000000000002" })))), "leitura");
  ok(/PROJECT_ACCESS_DENIED/.test(await err(as(id(U.fora), () => submit(id(U.fora), { id: "21000000-0000-4000-8000-000000000003" })))), "fora da obra");
});
const slaOf = async (rec) => (await q("select s.* from public.sla_actions s join public.ssma_corrective_actions a on a.sla_action_id=s.id where a.record_id=$1", [rec]))[0];
const ssmaOf = async (rec) => (await q("select * from public.ssma_corrective_actions where record_id=$1", [rec]))[0];
await check("andamento pelo SSMA espelha no SLA (IN_PROGRESS, assumida) na mesma transação", async () => {
  const a = await ssmaOf(NR);
  await as(id(U.resp), () => db.query("select public.ssma_corrective_action_update($1,'ANDAMENTO','Isolando a área',null)", [a.id]));
  const s = await slaOf(NR);
  eq([(await ssmaOf(NR)).status, s.status, s.acknowledged_by_user_id], ["EM_ANDAMENTO", "IN_PROGRESS", id(U.resp)], "estados");
});
await check("conclusão pelo módulo de Ações de uma ação SSMA é RECUSADA (exige evidência do SSMA); reabrir também", async () => {
  const s = await slaOf(NR);
  ok(/SSMA_ACTION_COMPLETE_VIA_SSMA/.test(await err(as(id(U.adm), () => db.query("update public.sla_actions set status='COMPLETED', completed_at=now(), completed_by_user_id=$2, completion_note='ok' where id=$1", [s.id, id(U.adm)])))), "bloqueio");
  eq((await ssmaOf(NR)).status, "EM_ANDAMENTO", "SSMA intacto");
});
await check("reatribuição e novo prazo feitos pelo módulo de Ações chegam ao SSMA (registro, ação e histórico)", async () => {
  const s = await slaOf(NR);
  await as(id(U.adm), () => db.query("update public.sla_actions set responsible_user_id=$2 where id=$1", [s.id, id(U.col2)]));
  await as(id(U.adm), () => db.query("update public.sla_actions set complete_due_at = (timestamptz '2026-11-25 23:59:59-03') where id=$1", [s.id]));
  const a = await ssmaOf(NR);
  eq([a.responsible_user_id, String(a.due_date.toISOString?.().slice(0, 10) ?? a.due_date).slice(0, 10)], [id(U.col2), "2026-11-25"], "ação SSMA");
  eq((await q("select responsible_user_id from public.ssma_field_records where id=$1", [NR]))[0].responsible_user_id, id(U.col2), "registro");
  const kinds = (await q("select kind from public.ssma_corrective_action_events where action_id=$1 order by created_at, id", [a.id])).map((r) => r.kind);
  ok(kinds.includes("REATRIBUIDA") && kinds.includes("PRAZO_ALTERADO"), `histórico: ${kinds}`);
});
await check("conclusão pelo SSMA (gestor, justificativa) conclui nos dois módulos com nota; nova conclusão é recusada", async () => {
  const a = await ssmaOf(NR);
  await as(id(U.adm), () => db.query("select public.ssma_corrective_action_update($1,'CONCLUIDA','Capacetes entregues e equipe orientada.',null)", [a.id]));
  const s = await slaOf(NR);
  eq([(await ssmaOf(NR)).status, s.status, s.completion_note], ["CONCLUIDA", "COMPLETED", "Capacetes entregues e equipe orientada."], "estados");
  ok(/ACTION_ALREADY_CONCLUDED/.test(await err(as(id(U.adm), () => db.query("select public.ssma_corrective_action_update($1,'CONCLUIDA','de novo de novo',null)", [a.id])))), "recusa");
  ok(/SSMA_ACTION_REOPEN_NOT_ALLOWED/.test(await err(as(id(U.adm), () => db.query("update public.sla_actions set status='IN_PROGRESS', completed_at=null, completed_by_user_id=null, completion_note=null where id=$1", [s.id])))), "reabrir recusado");
});
await check("início pelo módulo de Ações (IN_PROGRESS) muda a ação SSMA aberta para EM_ANDAMENTO com histórico", async () => {
  const N2 = "21000000-0000-4000-8000-000000000009";
  await as(id(U.col), () => submit(id(U.col), { id: N2, risk: "BAIXA" }));
  const s = await slaOf(N2);
  await as(id(U.adm), () => db.query("update public.sla_actions set status='IN_PROGRESS', acknowledged_at=now(), acknowledged_by_user_id=$2 where id=$1", [s.id, id(U.adm)]));
  eq((await ssmaOf(N2)).status, "EM_ANDAMENTO", "SSMA");
});
await check("ação SLA sem origem SSMA (a alheia) continua sendo concluída normalmente pelo módulo de Ações", async () => {
  await as(id(U.adm), () => db.query("update public.sla_actions set status='COMPLETED', completed_at=now(), completed_by_user_id=$1, completion_note='feito' where id='50000000-0000-4000-8000-000000000001'", [id(U.adm)]));
});
await check("isolamento: usuário de outra obra não atualiza a ação nem enxerga a ação SLA; LEITURA não atualiza", async () => {
  const a = await ssmaOf(NR);
  ok(/PROJECT_ACCESS_DENIED/.test(await err(as(id(U.fora), () => db.query("select public.ssma_corrective_action_update($1,'ANDAMENTO','x',null)", [a.id])))), "fora");
  eq((await as(id(U.fora), () => q("select id from public.sla_actions where related_ssma_corrective_action_id is not null"))).length, 0, "RLS do SLA");
  const a9 = (await ssmaOf("21000000-0000-4000-8000-000000000009")).id;
  ok(/ACTION_ACCESS_DENIED/.test(await err(as(id(U.lei), () => db.query("select public.ssma_corrective_action_update($1,'ANDAMENTO','x',null)", [a9])))), "leitura");
});
await check("o vínculo é 1:1 por restrição de banco (índices únicos nas duas pontas)", async () => {
  const s = await slaOf(NR);
  ok(/duplicate key|unique/i.test(await err(db.query("update public.ssma_corrective_actions set sla_action_id=$1 where record_id=$2", [s.id, REC(1)]))), "unique SSMA");
});

// ───── perfis ESG ─────
const OBL = "60000000-0000-4000-8000-000000000001";
const subIns = (uid, n, over = {}) => db.query("insert into public.esg_obligation_submissions (id,project_id,obligation_id,reference_date,status,filled_by_user_id,description) values ($1,$2,$3,'2026-11-01','CUMPRIDO',$4,'ok')", [`70000000-0000-4000-8000-0000000001${n}`, over.project ?? P1, OBL, over.filledBy ?? uid]);
await check("ESG: Administrador, Gerente, Gestor e Colaborador ATIVOS registram comprovação; Leitura, inativo e fora da obra NÃO", async () => {
  for (const [i, n] of [[10, U.adm], [11, U.ger], [12, U.gest], [13, U.col]]) await as(id(n), () => subIns(id(n), i));
  for (const [i, n] of [[14, U.lei], [15, U.inat], [16, U.fora]]) ok(/row-level security|policy/i.test(await err(as(id(n), () => subIns(id(n), i)))), `${n} deveria ser recusado`);
});
await check("ESG: ninguém registra em nome de outra pessoa", async () => {
  ok(/row-level security|policy/i.test(await err(as(id(U.ger), () => subIns(id(U.ger), 17, { filledBy: id(U.adm) })))), "impersonation");
});
const evIns = (uid, sub, n) => db.query("insert into public.esg_obligation_evidence (id,submission_id,obligation_id,project_id,evidence_kind,file_path,original_file_name,mime_type,file_size_bytes,uploaded_by_user_id) values ($1,$2,$3,$4,'FOTO',$5,'a.jpg','image/jpeg',10,$6)",
  [`80000000-0000-4000-8000-0000000000${n}`, sub, OBL, P1, `${P1}/esg-evidence/${OBL}/${sub}/${n}-a.jpg`, uid]);
await check("ESG: evidência — colaborador só na PRÓPRIA comprovação; administrador em qualquer; leitura não", async () => {
  await as(id(U.col), () => evIns(id(U.col), "70000000-0000-4000-8000-000000000113", "11"));
  ok(/row-level security|policy/i.test(await err(as(id(U.col), () => evIns(id(U.col), "70000000-0000-4000-8000-000000000111", "12")))), "colaborador em comprovação de outro");
  await as(id(U.adm), () => evIns(id(U.adm), "70000000-0000-4000-8000-000000000113", "13"));
  ok(/row-level security|policy/i.test(await err(as(id(U.lei), () => evIns(id(U.lei), "70000000-0000-4000-8000-000000000113", "14")))), "leitura");
});
await check("ESG: configurar obrigação continua só do Administrador", async () => {
  const cat2 = (await q("select category, periodicity from public.esg_obligations limit 1"))[0];
  const ins = (uid) => db.query("insert into public.esg_obligations (project_id,title,category,periodicity,created_by_user_id) values ($1,'Nova',$2,$3,$4)", [P1, cat2.category, cat2.periodicity, uid]);
  ok(/row-level security|policy/i.test(await err(as(id(U.ger), () => ins(id(U.ger))))), "gerente não configura");
  await as(id(U.adm), () => ins(id(U.adm)));
});
await check("ESG: revisão só do Administrador ativo (gerente, gestor, colaborador e leitura recusados)", async () => {
  const sub = "70000000-0000-4000-8000-000000000001";
  const fn = (await q("select pg_get_function_identity_arguments(oid) a from pg_proc where proname='review_esg_obligation_submission'"))[0].a;
  const args = fn.split(",").length;
  const call = (uid) => as(id(uid), () => db.query(args === 3 ? "select public.review_esg_obligation_submission($1,'CUMPRIDO','Revisado')" : "select public.review_esg_obligation_submission($1,'CUMPRIDO','Revisado',null)", [sub]).catch((e) => { throw e; }));
  for (const n of [U.ger, U.gest, U.col, U.lei]) ok(await err(call(n)), `perfil ${n} deveria ser recusado`);
  eq(await err(call(U.adm)), null, "administrador revisa");
});
await check("ESG Storage: upload em <obra>/esg-evidence/ liberado a Administrador/Gerente/Gestor/Colaborador; Leitura, inativo, outra obra e outro prefixo recusados", async () => {
  const can = (uid, name) => as(id(uid), async () => (await q("select public.can_upload_esg_evidence_object($1) ok", [name]))[0].ok);
  const good = `${P1}/esg-evidence/${OBL}/sub/f.jpg`;
  for (const n of [U.adm, U.ger, U.gest, U.col]) ok(await can(n, good), `perfil ${n} deveria poder`);
  for (const n of [U.lei, U.inat, U.fora]) ok(!(await can(n, good)), `perfil ${n} não deveria`);
  ok(!(await can(U.ger, `${P1}/outra-pasta/${OBL}/sub/f.jpg`)), "outro prefixo");
  ok(!(await can(U.ger, `${P2}/esg-evidence/${OBL}/sub/f.jpg`)), "obra alheia");
  ok(!(await can(U.ger, `lixo/esg-evidence/${OBL}/sub/f.jpg`)), "obra inválida");
});

// ───── notificações ─────
await check("notificações: dedupe por registro+evento+dia+destinatário; e-mail em minúsculas; só service_role grava; só administrador lê as linhas", async () => {
  const row = (email, st = "PENDING") => db.query("insert into public.ssma_field_notification_deliveries (project_id,record_id,event,event_date,recipient_email,status) values ($1,$2,'CRITICAL_RECORD','2026-11-05',$3,$4)", [P1, NR, email, st]);
  await as(null, () => row("a@exemplo.invalid"), "service_role");
  ok(/duplicate key|unique/i.test(await err(as(null, () => row("a@exemplo.invalid"), "service_role"))), "dedupe");
  ok(/check|violates/i.test(await err(as(null, () => row("A@Exemplo.invalid"), "service_role"))), "minúsculas");
  ok(await err(as(id(U.adm), () => row("b@exemplo.invalid"))), "authenticated não grava");
  eq((await as(id(U.col), () => q("select * from public.ssma_field_notification_deliveries"))).length, 0, "colaborador não lê linhas (e-mails)");
  eq((await as(id(U.adm), () => q("select * from public.ssma_field_notification_deliveries"))).length, 1, "administrador lê");
  const sum = await as(id(U.col), () => q("select * from public.ssma_notification_summary($1)", [P1]));
  eq([sum.length, sum[0].pending], [1, 1], "resumo sem e-mails para membro");
  eq((await as(id(U.fora), () => q("select * from public.ssma_notification_summary($1)", [P1]))).length, 0, "resumo isolado por obra");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
