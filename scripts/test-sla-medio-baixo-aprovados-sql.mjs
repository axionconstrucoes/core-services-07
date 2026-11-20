// FRENTE A — prazos aprovados do SLA para MÉDIO (2 dias úteis) e BAIXO (5 dias úteis).
// PostgreSQL 17 descartável (PGlite), dados sintéticos, SEM data fixa (datas relativas a Date.now()).
// Replay de todas as migrations EXCETO 20261121177000, fixtures (regras antigas 1/3, ações pré-existentes), depois a migration é
// aplicada 2x. Prova: só as regras ativas de MÉDIO/BAIXO mudam (histórico mantido), sla_actions intactas (hash), idempotência,
// auditoria SYSTEM, falha clara com duplicata ativa, novas ações com prazo novo, função interna sem EXECUTE para anon.
// Uso: node scripts/test-sla-medio-baixo-aprovados-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const NEW = "20261121177000_sla_medio_baixo_prazos_aprovados.sql";
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (!all.includes(NEW)) throw new Error("migration nova ausente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");
register("./ts-module-resolver.mjs", import.meta.url);
const ts = await import("../apps/web/lib/sla/time-units.ts");
const cal = await import("../apps/web/lib/sla/holidays/calendars.ts");
const { DEFAULT_SLA_MATRIX } = await import("../apps/web/lib/sla/default-matrix.ts");
const { resolveGenericMatrixRule } = await import("../apps/web/lib/sla/resolve-matrix-rule.ts");

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
const U2 = "00000000-0000-4000-8000-000000000002";
const P = (n) => `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
for (const [id, k] of [[U, "adm"], [U2, "resp"]]) {
  await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id, `${k}@exemplo.invalid`]);
  await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id, k, `${k}@exemplo.invalid`]);
}
for (const n of [1, 2, 3]) {
  await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,$2,$3,'C','L','2026-01-01','2027-01-01')", [P(n), `Obra ${n}`, `O${n}`]);
  await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE')", [P(n), U]);
}
await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'COLABORADOR','ACTIVE')", [P(1), U2]);
const rule = (p, risk, area, unit, a, e2, bd, active = true, extra = {}) =>
  db.query(`insert into public.sla_matrix_rules (project_id,risk_level,area,time_unit,assume_deadline_value,respond_deadline_value,complete_deadline_value,escalation_2_after_value,board_after_value,notify_by_email,requires_acknowledgment_confirmation,active,updated_by_user_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [p, risk, area, unit, a, extra.respond ?? null, extra.complete ?? null, e2, bd, extra.notify ?? true, extra.ack ?? false, active, U]);
// Obra 1: espelho do banco operacional (regras gerais; CRÍTICO/ALTO com histórico inativo).
await rule(P(1), "CRITICAL", null, "CLOCK_HOURS", 1, 1, 2);
await rule(P(1), "CRITICAL", null, "CLOCK_HOURS", 1, 2, 3, false);
await rule(P(1), "HIGH", null, "BUSINESS_HOURS", 4, 4, 4, true, { ack: true });
await rule(P(1), "HIGH", null, "BUSINESS_HOURS", 4, 6, 8, false);
await rule(P(1), "LOW", null, "BUSINESS_DAYS", 3, 3, 2, true, { respond: 7, notify: false });
await rule(P(1), "MEDIUM", null, "BUSINESS_DAYS", 1, 1, 1, true, { complete: 9 });
// Obra 2: regra por área (atualiza no lugar) e uma personalização (7 dias) que NÃO deve ser tocada.
await rule(P(2), "MEDIUM", "ESG_SSMA", "BUSINESS_DAYS", 1, 1, 1);
await rule(P(2), "LOW", null, "BUSINESS_DAYS", 7, 3, 2);
// Obra 3: sem regras (usa o padrão do código / da função SSMA).

// 25 ações pré-existentes sintéticas (prazos gravados na criação)
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const risks = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "MEDIUM"];
for (let i = 0; i < 25; i += 1) {
  const created = now - (30 - i) * 86_400_000;
  await db.query(`insert into public.sla_actions (id,project_id,origin,title,risk_level,area,status,assume_due_at,created_by_type,created_at)
    values (gen_random_uuid(),$1,'MANUAL',$2,$3,'PLANEJAMENTO','PENDING',$4,'SYSTEM',$5)`,
    [P(1), `Ação sintética ${i}`, risks[i % 5], iso(created + (1 + (i % 4)) * 86_400_000), iso(created)]);
}
const actionsFp = async () => (await q(`select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by id), '')) h,
  md5(coalesce(string_agg(id::text||assume_due_at::text||coalesce(respond_due_at::text,'')||coalesce(complete_due_at::text,'')||risk_level||status||current_escalation_level, '|' order by id), '')) hd from public.sla_actions t`))[0];
const escFp = async () => (await q("select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.sla_action_escalations t"))[0];
const rulesRows = () => q("select id, project_id, risk_level, area, time_unit, assume_deadline_value::float a, respond_deadline_value::float r, complete_deadline_value::float c, escalation_2_after_value::float e2, board_after_value::float bd, notify_by_email n, requires_acknowledgment_confirmation k, active from public.sla_matrix_rules order by project_id, risk_level, area nulls first, active desc, created_at, id");
const auditCount = async () => (await q("select count(*)::int n from public.audit_log_entries where action='SLA_CONFIGURATION_UPDATED'"))[0].n;
const mig = () => db.exec(clean(NEW));

const before = { a: await actionsFp(), e: await escFp(), rules: await rulesRows(), audit: await auditCount() };
const procHash = (await q("select md5(prosrc) h from pg_proc where proname='record_risk_alert_action' and pronamespace='public'::regnamespace"))[0]?.h ?? null;

console.log("\n======================================\nSLA MÉDIO/BAIXO APROVADOS (2 / 5 dias úteis) — PGlite\n======================================");

await check("A) padrão do código: MÉDIO 2 e BAIXO 5 dias úteis; CRÍTICO 1h corrida e ALTO 4h úteis; escalonamento e demais parâmetros preservados", async () => {
  const m = DEFAULT_SLA_MATRIX;
  eq([m.MEDIUM.timeUnit, m.MEDIUM.assumeDeadlineValue, m.MEDIUM.escalation2AfterValue, m.MEDIUM.boardAfterValue], ["BUSINESS_DAYS", 2, 1, 1], "MÉDIO");
  eq([m.LOW.timeUnit, m.LOW.assumeDeadlineValue, m.LOW.escalation2AfterValue, m.LOW.boardAfterValue], ["BUSINESS_DAYS", 5, 3, 2], "BAIXO");
  eq([m.HIGH.timeUnit, m.HIGH.assumeDeadlineValue, m.HIGH.escalation2AfterValue, m.HIGH.boardAfterValue], ["BUSINESS_HOURS", 4, 4, 4], "ALTO");
  eq([m.CRITICAL.timeUnit, m.CRITICAL.assumeDeadlineValue, m.CRITICAL.escalation2AfterValue, m.CRITICAL.boardAfterValue], ["CLOCK_HOURS", 1, 1, 2], "CRÍTICO");
  for (const l of ["LOW", "MEDIUM"]) { eq(m[l].respondDeadlineValue, null, "respond"); eq(m[l].completeDeadlineValue, null, "complete"); }
  eq(resolveGenericMatrixRule([], "MEDIUM").assumeDeadlineValue, 2, "resolução sem regra do projeto");
  eq(resolveGenericMatrixRule([], "LOW").assumeDeadlineValue, 5, "resolução sem regra do projeto");
});

await check("B) cálculo em dias úteis (sem data fixa): +2 (MÉDIO) e +5 (BAIXO) a partir de 30 dias consecutivos a contar de hoje, pulando fins de semana e feriados", async () => {
  const BRT = (y, m, d, h = 10) => new Date(Date.UTC(y, m - 1, d, h + 3, 0, 0));
  const calId = "BR-ES-LINHARES";
  const isOff = (y, m, d, withHol) => {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow === 0 || dow === 6 || (withHol && cal.isHoliday(calId, y, m, d));
  };
  const oracle = (y, m, d, n, withHol) => { // caminhada independente, dia a dia
    let c = new Date(Date.UTC(y, m - 1, d)), left = n;
    while (left > 0) { c = new Date(c.getTime() + 86_400_000); if (!isOff(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate(), withHol)) left -= 1; }
    return BRT(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate()).toISOString();
  };
  const t0 = new Date(now - 3 * 3_600_000); // "hoje" em Brasília
  let checked = 0;
  for (let i = 0; i < 30; i += 1) {
    const day = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate() + i));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    if (!cal.VALIDATED_YEARS.includes(y)) continue;
    for (const [n, lvl] of [[2, "MEDIUM"], [5, "LOW"]]) {
      eq(DEFAULT_SLA_MATRIX[lvl].assumeDeadlineValue, n, "default");
      for (const withHol of [false, true]) {
        const cfg = withHol ? { ...ts.AXION_DEFAULT_BUSINESS_HOURS_CONFIG, holidayCalendarId: calId } : ts.AXION_DEFAULT_BUSINESS_HOURS_CONFIG;
        eq(ts.addTimeUnits(BRT(y, m, d), n, "BUSINESS_DAYS", cfg).toISOString(), oracle(y, m, d, n, withHol), `${y}-${m}-${d} +${n} ${withHol ? "c/ feriados" : "s/ feriados"}`);
        checked += 1;
      }
    }
  }
  ok(checked >= 40, `poucas comparações: ${checked}`);
  // feriado nacional futuro mais próximo: a janela de +2 / +5 dias úteis que o atravessa nunca termina nele nem no fim de semana
  const hols = [...cal.holidaysFor("BR", t0.getUTCFullYear()), ...cal.holidaysFor("BR", t0.getUTCFullYear() + 1)].map((h) => h.date).filter((s) => s > t0.toISOString().slice(0, 10)).sort();
  ok(hols.length > 0, "sem feriado futuro nos anos validados");
  const [hy, hm, hd] = hols[0].split("-").map(Number);
  for (const n of [2, 5]) {
    const start = new Date(Date.UTC(hy, hm - 1, hd) - 8 * 86_400_000);
    const [y, m, d] = [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()];
    const cfg = { ...ts.AXION_DEFAULT_BUSINESS_HOURS_CONFIG, holidayCalendarId: calId };
    const r = ts.addTimeUnits(BRT(y, m, d), n, "BUSINESS_DAYS", cfg);
    const rb = new Date(r.getTime() - 3 * 3_600_000);
    ok(!isOff(rb.getUTCFullYear(), rb.getUTCMonth() + 1, rb.getUTCDate(), true), `+${n} caiu em dia não útil`);
    eq(r.toISOString(), oracle(y, m, d, n, true), `janela com feriado ${hols[0]} +${n}`);
  }
});

await check("C) pré-condição: banco com regras antigas (MÉDIO 1 / BAIXO 3) e 25 ações sintéticas", async () => {
  eq(before.a.n, 25, "ações");
  const act = before.rules.filter((r) => r.active && r.project_id === P(1));
  eq(act.filter((r) => r.risk_level === "MEDIUM").map((r) => r.a), [1], "MÉDIO antigo");
  eq(act.filter((r) => r.risk_level === "LOW").map((r) => r.a), [3], "BAIXO antigo");
});

// ---- 1ª execução ----
await mig();
const after1 = { a: await actionsFp(), e: await escFp(), rules: await rulesRows(), audit: await auditCount() };

await check("D) regra geral ativa: MÉDIO vira 2 e BAIXO vira 5 dias úteis; escalonamento, respond/complete, notificações e unidade preservados", async () => {
  const act = (risk) => after1.rules.filter((r) => r.active && r.project_id === P(1) && r.risk_level === risk);
  eq(act("MEDIUM").length, 1, "uma ativa MEDIUM"); eq(act("LOW").length, 1, "uma ativa LOW");
  const m = act("MEDIUM")[0], l = act("LOW")[0];
  eq([m.time_unit, m.a, m.r, m.c, m.e2, m.bd, m.n, m.k], ["BUSINESS_DAYS", 2, null, 9, 1, 1, true, false], "MÉDIO");
  eq([l.time_unit, l.a, l.r, l.c, l.e2, l.bd, l.n, l.k], ["BUSINESS_DAYS", 5, 7, null, 3, 2, false, false], "BAIXO");
});
await check("E) histórico preservado: regras antigas ficam INATIVAS com os valores antigos (nada apagado)", async () => {
  const old = (risk) => after1.rules.filter((r) => !r.active && r.project_id === P(1) && r.risk_level === risk);
  eq(old("MEDIUM").map((r) => r.a), [1], "MÉDIO antigo inativo"); eq(old("LOW").map((r) => r.a), [3], "BAIXO antigo inativo");
  eq(after1.rules.length, before.rules.length + 2, "só 2 linhas novas (geral MÉDIO e BAIXO da obra 1)");
  for (const r of before.rules) ok(after1.rules.some((x) => x.id === r.id), `linha ${r.id} sumiu`);
});
await check("F) CRÍTICO e ALTO (ativas e históricas) idênticos; personalização BAIXO 7 dias preservada; regra por ÁREA atualizada no lugar (sem nova linha)", async () => {
  const pick = (rows) => rows.filter((r) => r.risk_level === "CRITICAL" || r.risk_level === "HIGH");
  eq(pick(after1.rules), pick(before.rules), "CRÍTICO/ALTO");
  eq(after1.rules.filter((r) => r.project_id === P(2) && r.risk_level === "LOW").map((r) => [r.a, r.active]), [[7, true]], "personalizada");
  const area = after1.rules.filter((r) => r.project_id === P(2) && r.area === "ESG_SSMA");
  eq(area.map((r) => [r.a, r.active]), [[2, true]], "área");
});
await check("G) NENHUMA sla_actions/escalonamento alterada: contagem, hash da linha inteira e hash dos prazos idênticos antes/depois", async () => {
  eq(after1.a, before.a, "sla_actions"); eq(after1.e, before.e, "sla_action_escalations");
});
await check("H) nenhum gatilho de sla_matrix_rules lê/escreve sla_actions (nenhuma rotina recalcula prazos existentes quando a regra muda)", async () => {
  const t = await q(`select t.tgname, p.prosrc from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.sla_matrix_rules'::regclass and not t.tgisinternal`);
  ok(t.length >= 2, "gatilhos esperados");
  for (const x of t) ok(!/sla_actions|assume_due_at|respond_due_at|complete_due_at/i.test(x.prosrc), `gatilho ${x.tgname} toca prazos`);
  const fk = await q(`select count(*)::int n from pg_constraint where conrelid='public.sla_actions'::regclass and confrelid='public.sla_matrix_rules'::regclass`);
  eq(fk[0].n, 0, "sla_actions não referencia regra");
});
await check("I) auditoria: cada linha tocada/criada gerou SLA_CONFIGURATION_UPDATED com ator SYSTEM, sem autor e sem texto livre sensível", async () => {
  const delta = after1.audit - before.audit;
  ok(delta >= 4, `auditoria insuficiente: ${delta}`);
  const rows = await q("select actor_type, actor_user_id, actor_label, entity_type, detail from public.audit_log_entries where action='SLA_CONFIGURATION_UPDATED' order by created_at desc, id limit $1", [delta]);
  for (const r of rows) {
    eq([r.actor_type, r.actor_user_id, r.actor_label, r.entity_type], ["SYSTEM", null, null, "sla_matrix_rules"], "ator");
    ok(/^Regra de matriz SLA \(risco (LOW|MEDIUM)\) atualizada\./.test(r.detail) && !/@|senha|token/i.test(r.detail), `detalhe inesperado: ${r.detail}`);
  }
});
await check("J) a função interna do SSMA usa os novos prazos: regra da obra 1 (migrada) e padrão da obra 3 (sem regra); sem EXECUTE para anon/authenticated", async () => {
  const start = iso(now);
  const sql = async (p, risk) => new Date((await q("select public.sla_ssma_assume_due_at($1,$2,$3::timestamptz) d", [p, risk, start]))[0].d).toISOString();
  const S = new Date(start);
  eq(await sql(P(1), "MEDIUM"), ts.addTimeUnits(S, 2, "BUSINESS_DAYS").toISOString(), "MÉDIO obra 1");
  eq(await sql(P(1), "LOW"), ts.addTimeUnits(S, 5, "BUSINESS_DAYS").toISOString(), "BAIXO obra 1");
  eq(await sql(P(3), "MEDIUM"), ts.addTimeUnits(S, 2, "BUSINESS_DAYS").toISOString(), "MÉDIO padrão");
  eq(await sql(P(3), "LOW"), ts.addTimeUnits(S, 5, "BUSINESS_DAYS").toISOString(), "BAIXO padrão");
  eq(await sql(P(3), "HIGH"), ts.addTimeUnits(S, 4, "BUSINESS_HOURS").toISOString(), "ALTO inalterado");
  eq(await sql(P(3), "CRITICAL"), new Date(S.getTime() + 3_600_000).toISOString(), "CRÍTICO inalterado");
  const f = (await q("select p.prosecdef, array_to_string(p.proconfig,',') c, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u from pg_proc p where proname='sla_ssma_assume_due_at'"))[0];
  eq([f.prosecdef, f.c, f.a, f.u], [true, "search_path=\"\"", false, false], "função");
});
await check("K) nova ação SSMA MÉDIO/BAIXO criada APÓS a migration recebe o prazo novo; as 25 pré-existentes não mudam", async () => {
  const created = iso(now);
  const due = iso(now + 60 * 86_400_000).slice(0, 10);
  const mk = async (n, risk) => {
    const rec = `20000000-0000-4000-8000-0000000000${n}`, act = `30000000-0000-4000-8000-0000000000${n}`;
    await db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,responsible_user_id,due_date,reported_by_user_id) values ($1,$2,'OCORRENCIA','EPI','Descrição','Bloco A',$3,$3,$4,$5,$6,$5)", [rec, P(1), created, risk, U2, due]);
    await db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date,created_at) values ($1,$2,$3,$4,$5,$6)", [act, rec, P(1), U2, due, created]);
    const sla = (await q("select public.ssma_link_sla_action($1) s", [act]))[0].s;
    return new Date((await q("select assume_due_at a from public.sla_actions where id=$1", [sla]))[0].a).toISOString();
  };
  eq(await mk("11", "MEDIA"), ts.addTimeUnits(new Date(created), 2, "BUSINESS_DAYS").toISOString(), "MÉDIO novo = +2 dias úteis");
  eq(await mk("12", "BAIXA"), ts.addTimeUnits(new Date(created), 5, "BUSINESS_DAYS").toISOString(), "BAIXO novo = +5 dias úteis");
  const pre = (await q("select count(*)::int n, md5(string_agg(t::text, '|' order by id)) h from public.sla_actions t where origin='MANUAL'"))[0];
  const ref = (await q("select count(*)::int n from public.sla_actions where origin='MANUAL'"))[0];
  eq(pre.n, 25, "pré-existentes"); eq(ref.n, 25, "contagem");
});

// ---- 2ª execução: idempotência ----
const mid = { rules: await rulesRows(), audit: await auditCount(), a: await actionsFp() };
await mig();
await check("L) idempotente: 2ª execução não altera regras, não gera auditoria nem toca sla_actions", async () => {
  eq(await rulesRows(), mid.rules, "regras"); eq(await auditCount(), mid.audit, "auditoria"); eq(await actionsFp(), mid.a, "sla_actions");
});

await check("M) falha CLARAMENTE com mais de uma regra ativa por chave (SLA_MATRIX_DUPLICATE_ACTIVE) e não altera nada", async () => {
  await db.exec("begin");
  let msg = "";
  try {
    await db.exec("drop index if exists public.sla_matrix_rules_active_key_unique");
    await rule(P(3), "MEDIUM", null, "BUSINESS_DAYS", 1, 1, 1);
    await rule(P(3), "MEDIUM", null, "BUSINESS_DAYS", 1, 1, 1);
    try { await mig(); } catch (e) { msg = String(e.message); }
  } finally { await db.exec("rollback").catch(() => {}); }
  ok(/SLA_MATRIX_DUPLICATE_ACTIVE/.test(msg), `mensagem: ${msg}`);
  eq((await q("select count(*)::int n from public.sla_matrix_rules where project_id=$1", [P(3)]))[0].n, 0, "rollback limpo");
});

await check("N) segurança: sem GRANT/anon na migration, sem DELETE/TRUNCATE, hotfix record_risk_alert_action intocado, sem recálculo de sla_actions", async () => {
  const sql = readFileSync(path.join(dir, NEW), "utf8").replace(/--.*$/gm, "");
  ok(!/\bgrant\b/i.test(sql), "grant"); ok(!/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column)\b/i.test(sql), "destrutivo");
  ok(!/record_risk_alert_action/.test(sql), "hotfix");
  ok(!/(update|insert\s+into|delete\s+from)\s+public\.sla_action/i.test(sql), "toca sla_actions");
  const h = (await q("select md5(prosrc) h from pg_proc where proname='record_risk_alert_action' and pronamespace='public'::regnamespace"))[0]?.h ?? null;
  eq(h, procHash, "md5 do hotfix");
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
