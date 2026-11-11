// Prazo para ASSUMIR da ação SLA nascida no SSMA (migration 20261106100000): deve seguir a regra OFICIAL do SLA (ALTO 4 horas úteis,
// MÉDIO 1 dia útil, BAIXO 3 dias úteis, CRÍTICO 1 hora corrida; matriz e expediente da OBRA), e não intervalos corridos.
// PostgreSQL 17 descartável (PGlite), dados sintéticos. (1) PARIDADE: sla_add_time_units (SQL) == addTimeUnits (TypeScript oficial,
// apps/web/lib/sla/time-units.ts) numa grade de instantes que cruza noites e fins de semana; (2) cenários explícitos; (3) matriz/expediente da obra.
// Uso: node scripts/test-ssma-sla-deadline-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.some((f) => /^(20261106120000|20261106130000)_/.test(f))) throw new Error("migration proibida presente");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");
register("./ts-module-resolver.mjs", import.meta.url);
const ts = await import("../apps/web/lib/sla/time-units.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 300)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const iso = (v) => new Date(v).toISOString();
const sqlAdd = async (start, value, unit, tz = "America/Sao_Paulo", sh = 8, eh = 18) =>
  iso((await q("select public.sla_add_time_units($1::timestamptz,$2::numeric,$3,$4,$5,$6) as d", [start, value, unit, tz, sh, eh]))[0].d);

console.log("\n======================================\nPRAZO PARA ASSUMIR (SSMA) x REGRA OFICIAL DO SLA (PGlite + motor TypeScript)\n======================================");

await check("PARIDADE: SQL == motor TypeScript oficial em 8 regras x ~290 instantes (dias úteis, noites, sábado e domingo)", async () => {
  const cfg = { timeZone: "America/Sao_Paulo", businessDayStartHour: 8, businessDayEndHour: 18 };
  const rules = [["BUSINESS_HOURS", 4], ["BUSINESS_DAYS", 1], ["BUSINESS_DAYS", 3], ["CLOCK_HOURS", 1], ["CALENDAR_DAYS", 2], ["BUSINESS_HOURS", 12], ["BUSINESS_DAYS", 0.5], ["BUSINESS_HOURS", 0.5]];
  const t0 = Date.parse("2026-11-02T00:07:00-03:00"); // segunda
  let n = 0, bad = [];
  for (let i = 0; i < 290; i += 1) {
    const start = new Date(t0 + i * 97 * 60_000 + (i % 7) * 13_000).toISOString(); // passo de 97 min e segundos quebrados: cruza todas as horas do dia
    for (const [unit, value] of rules) {
      const want = ts.addTimeUnits(new Date(start), value, unit, cfg).toISOString();
      const got = await sqlAdd(start, value, unit);
      n += 1;
      if (want !== got && bad.length < 4) bad.push(`${start} ${unit} ${value}: TS ${want} x SQL ${got}`);
    }
  }
  eq(bad, [], `divergências em ${n} comparações`);
});
await check("PARIDADE com expediente e timezone DIFERENTES (America/Manaus 09–17 e 07–19)", async () => {
  let bad = [];
  for (const [tz, sh, eh] of [["America/Manaus", 9, 17], ["America/Sao_Paulo", 7, 19]]) {
    const cfg = { timeZone: tz, businessDayStartHour: sh, businessDayEndHour: eh };
    const t0 = Date.parse("2026-11-05T00:11:00Z");
    for (let i = 0; i < 90; i += 1) {
      const start = new Date(t0 + i * 211 * 60_000).toISOString();
      for (const [unit, value] of [["BUSINESS_HOURS", 4], ["BUSINESS_DAYS", 3], ["BUSINESS_DAYS", 1], ["BUSINESS_HOURS", 25]]) {
        const want = ts.addTimeUnits(new Date(start), value, unit, cfg).toISOString();
        const got = await sqlAdd(start, value, unit, tz, sh, eh);
        if (want !== got && bad.length < 4) bad.push(`${tz} ${sh}-${eh} ${start} ${unit} ${value}: TS ${want} x SQL ${got}`);
      }
    }
  }
  eq(bad, [], "divergências");
});

// ---- cenários explícitos pela função de produção (backfill/RPC), com created_at CONTROLADO ----
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001", P2 = "10000000-0000-4000-8000-000000000002";
const REC = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ACT = (n) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
for (const [k, n] of Object.entries({ adm: 1, resp: 2 })) {
  await db.query("insert into auth.users (id,email) values ($1,$2) on conflict do nothing", [id(n), `${k}@exemplo.invalid`]);
  await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), k, `${k}@exemplo.invalid`]);
}
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','C','L','2026-01-01','2027-01-01'),($2,'Obra 2','O2','C','L','2026-01-01','2027-01-01')", [P1, P2]);
for (const p of [P1, P2]) { await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE'),($1,$3,'COLABORADOR','ACTIVE')", [p, id(1), id(2)]); }
let seq = 0;
/** cria registro + ação corretiva com created_at controlado e devolve o assume_due_at da ação SLA vinculada. */
async function assumeFor(project, risk, createdAt, dueDate = "2026-12-31") {
  seq += 1;
  await db.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,responsible_user_id,due_date,reported_by_user_id) values ($1,$2,'OCORRENCIA','EPI','Descrição','Bloco A',$3,$3,$4,$5,$6,$5)", [REC(seq), project, createdAt, risk, id(2), dueDate]);
  await db.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date,created_at) values ($1,$2,$3,$4,$5,$6)", [ACT(seq), REC(seq), project, id(2), dueDate, createdAt]);
  const sla = (await q("select public.ssma_link_sla_action($1) as s", [ACT(seq)]))[0].s;
  return iso((await q("select assume_due_at a from public.sla_actions where id=$1", [sla]))[0].a);
}
const SP = (s) => new Date(s).toISOString(); // helper de leitura: instantes escritos com offset -03:00

await check("ALTO (4 horas ÚTEIS): sexta 16:00 → segunda 10:00; sábado 10:00 → segunda 12:00; terça 19:30 (noite) → quarta 12:00; segunda 09:00 → 13:00", async () => {
  eq(await assumeFor(P1, "ALTA", "2026-11-06T16:00:00-03:00"), SP("2026-11-09T10:00:00-03:00"), "sexta 16:00");
  eq(await assumeFor(P1, "ALTA", "2026-11-07T10:00:00-03:00"), SP("2026-11-09T12:00:00-03:00"), "sábado 10:00");
  eq(await assumeFor(P1, "ALTA", "2026-11-03T19:30:00-03:00"), SP("2026-11-04T12:00:00-03:00"), "terça 19:30");
  eq(await assumeFor(P1, "ALTA", "2026-11-09T09:00:00-03:00"), SP("2026-11-09T13:00:00-03:00"), "segunda 09:00");
});
await check("MÉDIO (1 dia ÚTIL): quinta 17:00 → sexta 17:00; sexta 17:00 → segunda 17:00; sábado 10:00 → segunda 10:00", async () => {
  eq(await assumeFor(P1, "MEDIA", "2026-11-05T17:00:00-03:00"), SP("2026-11-06T17:00:00-03:00"), "quinta");
  eq(await assumeFor(P1, "MEDIA", "2026-11-06T17:00:00-03:00"), SP("2026-11-09T17:00:00-03:00"), "sexta");
  eq(await assumeFor(P1, "MEDIA", "2026-11-07T10:00:00-03:00"), SP("2026-11-09T10:00:00-03:00"), "sábado");
});
await check("BAIXO (3 dias ÚTEIS): quinta 10:00 → terça 10:00 (passa o fim de semana); segunda 10:00 → quinta 10:00", async () => {
  eq(await assumeFor(P1, "BAIXA", "2026-11-05T10:00:00-03:00"), SP("2026-11-10T10:00:00-03:00"), "quinta");
  eq(await assumeFor(P1, "BAIXA", "2026-11-09T10:00:00-03:00"), SP("2026-11-12T10:00:00-03:00"), "segunda");
});
await check("CRÍTICO (1 hora CORRIDA, sem expediente): sexta 23:00 → sábado 00:00; a regra antiga em horas corridas só coincide aqui", async () => {
  eq(await assumeFor(P1, "CRITICA", "2026-11-06T23:00:00-03:00"), SP("2026-11-07T00:00:00-03:00"), "crítico");
});
await check("o prazo para CONCLUIR continua sendo o do registro (fim do dia no fuso da obra) e o de assumir nunca o ultrapassa (least)", async () => {
  // ALTA criada sexta 16:00 com prazo na própria sexta: assumir seria segunda 10:00, mas é limitado ao fim do dia do prazo
  const a = await assumeFor(P1, "ALTA", "2026-11-06T16:00:00-03:00", "2026-11-06");
  eq(a, SP("2026-11-06T23:59:59-03:00"), "limitado pelo prazo de conclusão");
});

// ---- matriz e expediente da OBRA ----
await check("matriz da OBRA: regra por área ESG_SSMA > regra geral > padrão; regra inativa é ignorada; outra obra não é afetada", async () => {
  const ins = (p, risk, area, unit, val, active = true) => db.query("insert into public.sla_matrix_rules (project_id,risk_level,area,time_unit,assume_deadline_value,escalation_2_after_value,board_after_value,active,updated_by_user_id) values ($1,$2,$3,$4,$5,1,1,$6,$7)", [p, risk, area, unit, val, active, id(1)]);
  await ins(P1, "HIGH", null, "BUSINESS_DAYS", 2);                // geral da obra 1 para ALTO
  eq(await assumeFor(P1, "ALTA", "2026-11-05T10:00:00-03:00"), SP("2026-11-09T10:00:00-03:00"), "geral: 2 dias úteis (quinta→segunda)");
  await ins(P1, "HIGH", "ESG_SSMA", "CLOCK_HOURS", 6);             // específica de SSMA vence a geral
  eq(await assumeFor(P1, "ALTA", "2026-11-05T10:00:00-03:00"), SP("2026-11-05T16:00:00-03:00"), "área ESG_SSMA: 6 horas corridas");
  await ins(P1, "MEDIUM", "ESG_SSMA", "CLOCK_HOURS", 1, false);   // inativa: ignorada, vale o padrão (1 dia útil)
  eq(await assumeFor(P1, "MEDIA", "2026-11-05T10:00:00-03:00"), SP("2026-11-06T10:00:00-03:00"), "inativa ignorada");
  eq(await assumeFor(P2, "ALTA", "2026-11-05T10:00:00-03:00"), SP("2026-11-05T14:00:00-03:00"), "obra 2 segue o padrão (4 h úteis)");
});
await check("expediente/timezone da OBRA (sla_project_settings): 09–17 em America/Manaus muda o prazo de ALTO", async () => {
  await db.query("insert into public.sla_project_settings (project_id,timezone,business_day_start_hour,business_day_end_hour,updated_by_user_id) values ($1,'America/Manaus',9,17,$2)", [P2, id(1)]);
  // 2026-11-05 10:00 em Manaus (UTC-4) = 11:00 em São Paulo; +4 h úteis (09–17) = 14:00 Manaus = 15:00 São Paulo
  eq(await assumeFor(P2, "ALTA", "2026-11-05T11:00:00-03:00"), SP("2026-11-05T15:00:00-03:00"), "Manaus 09–17");
  // sexta 16:00 Manaus (17:00 SP): 1 h na sexta + 3 h na segunda (09:00→12:00 Manaus = 13:00 SP)
  eq(await assumeFor(P2, "ALTA", "2026-11-06T17:00:00-03:00"), SP("2026-11-09T13:00:00-03:00"), "Manaus sexta tarde");
});
await check("as funções auxiliares são internas: sem EXECUTE para anon/authenticated, e a função chamada pelo SSMA é SECURITY DEFINER com search_path fixo", async () => {
  const r = (await q("select p.proname, p.prosecdef, array_to_string(p.proconfig,',') c, has_function_privilege('authenticated', p.oid, 'EXECUTE') a, has_function_privilege('anon', p.oid, 'EXECUTE') n from pg_proc p where p.proname in ('sla_add_time_units','sla_ssma_assume_due_at') order by 1"));
  eq(r.map((x) => [x.proname, x.a, x.n]), [["sla_add_time_units", false, false], ["sla_ssma_assume_due_at", false, false]], "sem execute");
  ok(r.find((x) => x.proname === "sla_ssma_assume_due_at").prosecdef, "definer");
  ok(r.every((x) => /search_path/.test(x.c)), "search_path fixo");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
