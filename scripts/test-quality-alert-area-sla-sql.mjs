// Fase 6 / H2c — QUALIDADE como área própria de alertas/SLA (migration 20261210100000).
// PostgreSQL 17 descartável (PGlite), dados sintéticos. Replay de todas as migrations EXCETO a nova; fixtures; migration 2x.
// Prova: CHECKs de área ampliados (4 tabelas), regras QUALIDADE semeadas só onde há regra geral, valores aprovados
// (CRÍTICO 1h corrida, ALTO 4h úteis, MÉDIO 2 d.u., BAIXO 5 d.u.), riscos graves nunca enfraquecidos, ações existentes (as 9 abertas
// e demais) intactas, idempotência, P0 intocado, sem destrutivo/GRANT.
// Uso: node scripts/test-quality-alert-area-sla-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const NEW = "20261210100000_quality_alert_area_sla.sql";
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (!all.includes(NEW)) throw new Error("migration nova ausente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");
register("./ts-module-resolver.mjs", import.meta.url);
const { resolveMatrixRule } = await import("../apps/web/lib/sla/resolve-matrix-rule.ts");
const { DEFAULT_SLA_MATRIX } = await import("../apps/web/lib/sla/default-matrix.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 400)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of all.filter((x) => x !== NEW)) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const U = "00000000-0000-4000-8000-000000000001";
const P = (n) => `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [U, "adm@exemplo.invalid"]);
await db.query("insert into public.profiles (id,name,email) values ($1,'adm','adm@exemplo.invalid') on conflict do nothing", [U]);
for (const n of [1, 2, 3]) {
  await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,$2,$3,'C','L','2026-01-01','2027-01-01')", [P(n), `Obra ${n}`, `O${n}`]);
  await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE')", [P(n), U]);
}
const rule = (p, risk, area, unit, a, e2, bd, extra = {}) =>
  db.query(`insert into public.sla_matrix_rules (project_id,risk_level,area,time_unit,assume_deadline_value,respond_deadline_value,complete_deadline_value,escalation_2_after_value,board_after_value,notify_by_email,requires_acknowledgment_confirmation,active,updated_by_user_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [p, risk, area, unit, a, extra.respond ?? null, extra.complete ?? null, e2, bd, extra.notify ?? true, extra.ack ?? false, extra.active ?? true, U]);
// Obra 1: espelho do operacional (regras gerais aprovadas).
await rule(P(1), "CRITICAL", null, "CLOCK_HOURS", 1, 1, 2, { ack: true });
await rule(P(1), "HIGH", null, "BUSINESS_HOURS", 4, 4, 4, { ack: true });
await rule(P(1), "MEDIUM", null, "BUSINESS_DAYS", 2, 1, 1, { complete: 9 });
await rule(P(1), "LOW", null, "BUSINESS_DAYS", 5, 3, 2, { notify: false });
await rule(P(1), "LOW", null, "BUSINESS_DAYS", 3, 3, 2, { active: false }); // histórico inativo: não gera semente
// Obra 2: ALTO mais rígido que o aprovado (2h úteis) e BAIXO com regra QUALIDADE já personalizada (7 d.u.).
await rule(P(2), "HIGH", null, "BUSINESS_HOURS", 2, 2, 2, { ack: true });
await rule(P(2), "LOW", null, "BUSINESS_DAYS", 5, 3, 2);
// (QUALIDADE só pode ser inserida depois da migration; a personalização é criada abaixo, na 1ª passagem, via CHECK ampliado)
// Obra 3: sem regras.

const now = Date.now();
const risks = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
for (let i = 0; i < 20; i += 1) {
  const created = new Date(now - (20 - i) * 86_400_000).toISOString();
  await db.query(`insert into public.sla_actions (id,project_id,origin,title,risk_level,area,status,assume_due_at,created_by_type,created_at)
    values (gen_random_uuid(),$1,'MANUAL',$2,$3,'ENGENHARIA','PENDING',$4,'SYSTEM',$5)`,
    [P(1), `Ação sintética ${i}`, risks[i % 4], new Date(now + (1 + (i % 4)) * 86_400_000).toISOString(), created]);
}
const actionsFp = async () => (await q(`select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.sla_actions t`))[0];
const escFp = async () => (await q("select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.sla_action_escalations t"))[0];
const qRules = () => q("select project_id, risk_level, area, time_unit, assume_deadline_value::float a, escalation_2_after_value::float e2, board_after_value::float bd, requires_acknowledgment_confirmation k, notify_by_email n, respond_deadline_value::float r, complete_deadline_value::float c, active, is_default from public.sla_matrix_rules where area = 'QUALIDADE' order by project_id, risk_level");
const generalRows = () => q("select id, project_id, risk_level, assume_deadline_value::float a, active from public.sla_matrix_rules where area is null order by id");
const mig = () => db.exec(clean(NEW));
const insertAction = (area) => db.query(`insert into public.sla_actions (id,project_id,origin,title,risk_level,area,status,assume_due_at,created_by_type)
  values (gen_random_uuid(),$1,'MANUAL','Ação QUALIDADE','MEDIUM',$2,'PENDING',now(),'SYSTEM')`, [P(1), area]);
const procHash = (await q("select md5(prosrc) h from pg_proc where proname='record_risk_alert_action' and pronamespace='public'::regnamespace"))[0]?.h ?? null;
const before = { a: await actionsFp(), e: await escFp(), gen: await generalRows() };

console.log("\n======================================\nQUALIDADE — ÁREA DE ALERTAS/SLA (migration 20261210100000) — PGlite\n======================================");

await check("A) antes: a área QUALIDADE é rejeitada pelos CHECKs (sla_actions) — pré-condição", async () => {
  let failedInsert = false;
  try { await insertAction("QUALIDADE"); } catch { failedInsert = true; }
  ok(failedInsert, "QUALIDADE já aceita antes da migration");
});

await mig();
const after1 = { a: await actionsFp(), e: await escFp(), q: await qRules(), gen: await generalRows() };

await check("B) CHECKs de área ampliados nas 4 tabelas (sla_area_responsibles, sla_matrix_rules, sla_actions, risk_alert_cases) e valores antigos continuam aceitos", async () => {
  for (const t of ["sla_area_responsibles", "sla_matrix_rules", "sla_actions", "risk_alert_cases"]) {
    const defs = await q(`select pg_get_constraintdef(c.oid) d from pg_constraint c where c.conrelid='public.${t}'::regclass and c.contype='c' and pg_get_constraintdef(c.oid) like '%ESG_SSMA%' and pg_get_constraintdef(c.oid) not like '%secondary%'`);
    eq(defs.length, 1, `${t}: uma constraint de área`);
    ok(defs[0].d.includes("QUALIDADE") && defs[0].d.includes("ENGENHARIA") && defs[0].d.includes("ESG_SSMA"), `${t}: ${defs[0].d}`);
  }
  await insertAction("QUALIDADE");
  await insertAction("ENGENHARIA");
  let rejected = false;
  try { await insertAction("INEXISTENTE"); } catch { rejected = true; }
  ok(rejected, "área inválida passou");
  await db.query("delete from public.sla_actions where title='Ação QUALIDADE'"); // limpeza das linhas de teste (sintéticas)
});

await check("C) regras QUALIDADE semeadas só onde há regra geral ativa: obra 1 (4 riscos), obra 2 (2 riscos), obra 3 nenhuma; histórico inativo não gera semente", async () => {
  const by = (p) => after1.q.filter((r) => r.project_id === P(p));
  eq(by(1).map((r) => r.risk_level).sort(), ["CRITICAL", "HIGH", "LOW", "MEDIUM"], "obra 1");
  eq(by(2).map((r) => r.risk_level).sort(), ["HIGH", "LOW"], "obra 2");
  eq(by(3).length, 0, "obra 3");
  ok(by(1).every((r) => r.active && r.is_default === false), "ativas e não-default");
});

await check("D) valores aprovados: CRÍTICO 1h corrida | ALTO 4h úteis | MÉDIO 2 d.u. | BAIXO 5 d.u.; escalonamento/respond/complete/notificação copiados da regra geral", async () => {
  const r = (risk) => after1.q.find((x) => x.project_id === P(1) && x.risk_level === risk);
  eq([r("CRITICAL").time_unit, r("CRITICAL").a], ["CLOCK_HOURS", 1], "CRÍTICO");
  eq([r("HIGH").time_unit, r("HIGH").a], ["BUSINESS_HOURS", 4], "ALTO");
  eq([r("MEDIUM").time_unit, r("MEDIUM").a], ["BUSINESS_DAYS", 2], "MÉDIO");
  eq([r("LOW").time_unit, r("LOW").a], ["BUSINESS_DAYS", 5], "BAIXO");
  eq([r("MEDIUM").e2, r("MEDIUM").bd, r("MEDIUM").c], [1, 1, 9], "MÉDIO copia escalonamento/complete");
  eq([r("LOW").e2, r("LOW").bd, r("LOW").n], [3, 2, false], "BAIXO copia escalonamento/notificação");
  eq([r("CRITICAL").k, r("HIGH").k], [true, true], "riscos graves exigem confirmação de ciência");
  for (const k of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) eq([r(k).time_unit, r(k).a], [DEFAULT_SLA_MATRIX[k].timeUnit, DEFAULT_SLA_MATRIX[k].assumeDeadlineValue], `${k} = padrão do código`);
});

await check("E) nunca enfraquece riscos graves: ALTO da obra 2 (2h úteis, mais rígido que o aprovado) mantém 2h", async () => {
  const h = after1.q.find((x) => x.project_id === P(2) && x.risk_level === "HIGH");
  eq([h.time_unit, h.a], ["BUSINESS_HOURS", 2], "ALTO obra 2");
});

await check("F) PROSPECTIVO: sla_actions e escalonamentos idênticos (contagem+hash); regras gerais intactas (as 20 ações e as abertas mantêm prazos)", async () => {
  eq(after1.a, before.a, "sla_actions"); eq(after1.e, before.e, "escalations"); eq(after1.gen, before.gen, "regras gerais");
});

await check("G) resolução TS: com a regra QUALIDADE (obra 1) a área usa a regra própria; outras áreas continuam na regra geral; sem regra cai no padrão", async () => {
  const rows = await q("select * from public.sla_matrix_rules where project_id=$1 and active", [P(1)]);
  const asRule = (x) => ({ id: x.id, projectId: x.project_id, riskLevel: x.risk_level, area: x.area, timeUnit: x.time_unit, assumeDeadlineValue: Number(x.assume_deadline_value), respondDeadlineValue: x.respond_deadline_value === null ? null : Number(x.respond_deadline_value), completeDeadlineValue: x.complete_deadline_value === null ? null : Number(x.complete_deadline_value), escalation2AfterValue: Number(x.escalation_2_after_value), boardAfterValue: Number(x.board_after_value), notifyByEmail: x.notify_by_email, requiresAcknowledgmentConfirmation: x.requires_acknowledgment_confirmation, requiresDelayJustification: x.requires_delay_justification, isDefault: x.is_default, active: x.active, createdAt: new Date(x.created_at).toISOString() });
  const rs = rows.map(asRule);
  const qm = resolveMatrixRule(rs, "MEDIUM", "QUALIDADE");
  eq([qm.timeUnit, qm.assumeDeadlineValue, qm.isDefault], ["BUSINESS_DAYS", 2, false], "QUALIDADE MÉDIO");
  const qc = resolveMatrixRule(rs, "CRITICAL", "QUALIDADE");
  eq([qc.timeUnit, qc.assumeDeadlineValue], ["CLOCK_HOURS", 1], "QUALIDADE CRÍTICO");
  eq(resolveMatrixRule(rs, "LOW", "ENGENHARIA").assumeDeadlineValue, 5, "ENGENHARIA BAIXO (geral)");
  const dflt = resolveMatrixRule([], "HIGH", "QUALIDADE");
  eq([dflt.timeUnit, dflt.assumeDeadlineValue, dflt.isDefault], ["BUSINESS_HOURS", 4, true], "sem regra: padrão");
});

await check("H) nova ação QUALIDADE criada depois da migration é aceita; as pré-existentes não mudam", async () => {
  await insertAction("QUALIDADE");
  const r = (await q("select count(*)::int n from public.sla_actions where area='QUALIDADE'"))[0];
  eq(r.n, 1, "ação QUALIDADE");
  const pre = (await q("select count(*)::int n from public.sla_actions where origin='MANUAL' and title like 'Ação sintética%'"))[0];
  eq(pre.n, 20, "pré-existentes");
});

const mid = { q: await qRules(), gen: await generalRows() };
await mig();
await check("I) idempotente: 2ª execução não cria/altera regras nem constraints", async () => {
  eq(await qRules(), mid.q, "regras QUALIDADE"); eq(await generalRows(), mid.gen, "gerais");
  const n = (await q("select count(*)::int n from pg_constraint where conrelid='public.sla_actions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%QUALIDADE%'"))[0].n;
  eq(n, 1, "uma constraint com QUALIDADE");
});

await check("J) regra QUALIDADE já personalizada é preservada (não sobrescrita) e nova semente só entra uma vez", async () => {
  await db.query("update public.sla_matrix_rules set assume_deadline_value = 7 where project_id=$1 and risk_level='LOW' and area='QUALIDADE'", [P(2)]);
  await mig();
  const l = (await qRules()).find((x) => x.project_id === P(2) && x.risk_level === "LOW");
  eq(l.a, 7, "personalização preservada");
  eq((await q("select count(*)::int n from public.sla_matrix_rules where project_id=$1 and risk_level='LOW' and area='QUALIDADE'", [P(2)]))[0].n, 1, "sem duplicata");
});

await check("K) segurança: sem GRANT/DELETE/TRUNCATE/DROP TABLE, hotfix P0 intocado (md5), migration não toca sla_actions nem record_risk_alert_action", async () => {
  const sql = readFileSync(path.join(dir, NEW), "utf8").replace(/--.*$/gm, "");
  ok(!/\bgrant\b/i.test(sql), "grant"); ok(!/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column)\b/i.test(sql), "destrutivo");
  ok(!/record_risk_alert_action/.test(sql), "hotfix");
  ok(!/(update|insert\s+into|delete\s+from)\s+public\.sla_action/i.test(sql), "toca sla_actions");
  const h = (await q("select md5(prosrc) h from pg_proc where proname='record_risk_alert_action' and pronamespace='public'::regnamespace"))[0]?.h ?? null;
  eq(h, procHash, "md5 do hotfix");
});

await check("L) rollback recusa quando há dados QUALIDADE e reverte quando não há (arquivo de rollback)", async () => {
  const rb = readFileSync(path.join(here, "..", "supabase", "rollbacks", NEW.replace(".sql", ".rollback.sql")), "utf8");
  ok(/ROLLBACK_BLOCKED/.test(rb), "rollback sem trava");
  let blocked = false;
  await db.exec("begin");
  try { await db.exec(rb); } catch (e) { blocked = /ROLLBACK_BLOCKED/.test(String(e.message)); }
  await db.exec("rollback").catch(() => {});
  ok(blocked, "rollback não bloqueou com dados QUALIDADE");
  await db.exec("begin");
  await db.exec("delete from public.sla_actions where area='QUALIDADE'");
  await db.exec("delete from public.sla_matrix_rules where area='QUALIDADE'");
  await db.exec("set constraints all immediate");
  await db.exec(rb);
  const n = (await q("select count(*)::int n from pg_constraint where conrelid='public.sla_actions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%QUALIDADE%'"))[0].n;
  await db.exec("rollback").catch(() => {});
  eq(n, 0, "constraint revertida");
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
