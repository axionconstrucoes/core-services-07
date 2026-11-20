// LOTE 5 — (1) Governança, migration 20261121170000: auditoria de DELETE em project_additional_proposals e ai_findings.
// (2) Planejamento, migration 20261121171000: view risk_sla_consistency_issues passa a listar caso encerrado pela origem + ação SLA aberta.
// Reaplica TODAS as migrations numa base descartável e confere: trilha criada no DELETE (USER x SYSTEM), metadata
// compacta (sem texto livre), UPDATE sem trilha de delete, atomicidade (rollback desfaz a trilha), idempotência da
// própria migration, funções SECURITY DEFINER com search_path vazio e SEM EXECUTE para anon/authenticated/public.
//   PGlite (padrão):  node scripts/test-audit-delete-sql.mjs
//   PostgreSQL real:  ACC_REALPG_URL=... ACC_REALPG_PKG_DIR=... node scripts/test-audit-delete-sql.mjs   (cria e APAGA a base acc_l5_audit_*)
import { PGlite } from "@electric-sql/pglite";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const TARGET = "20261121170000_audit_delete_proposals_and_findings.sql";
const TARGET2 = "20261121171000_risk_sla_consistency_closed_by_source.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const realUrl = process.env.ACC_REALPG_URL;

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

let q, exec, cleanup = async () => {}, label;
if (realUrl) {
  const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
  const host = new URL(realUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") { console.log("RECUSADO: só roda em PostgreSQL local."); process.exit(1); }
  const admin = new pg.Client({ connectionString: realUrl });
  await admin.connect();
  const dbName = `acc_l5_audit_${Date.now().toString(36)}`;
  await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
  for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
    await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
  }
  const u = new URL(realUrl); u.pathname = `/${dbName}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  await c.query(PLATFORM.replace(/^create role .*$/gm, ""));
  for (const f of files) {
    try { await c.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); } catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); process.exit(1); }
  }
  q = async (sql, p) => (await c.query(sql, p)).rows;
  exec = (sql) => c.query(sql);
  label = `PostgreSQL real ${(await c.query("show server_version")).rows[0].server_version}`;
  cleanup = async () => { await c.end(); await admin.query(`drop database if exists ${dbName} with (force)`); await admin.end(); };
} else {
  const db = new PGlite();
  await db.exec(PLATFORM);
  for (const f of files) {
    try { await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite")); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
  }
  q = async (sql, p) => (await db.query(sql, p)).rows;
  exec = (sql) => db.exec(sql);
  label = "PGlite (PostgreSQL 17 em memória)";
}
console.log(`Base: ${label}; ${files.length} migrations aplicadas (inclui ${TARGET}).`);

const U1 = "00000000-0000-4000-8000-000000000001";
const P1 = "10000000-0000-4000-8000-000000000001";
const PR1 = "20000000-0000-4000-8000-000000000001";
const PR2 = "20000000-0000-4000-8000-000000000002";
const PR9 = "20000000-0000-4000-8000-000000000009";
const F1 = "30000000-0000-4000-8000-000000000001";
const F2 = "30000000-0000-4000-8000-000000000002";
const SECRET = "TEXTO-LIVRE-CONFIDENCIAL-NAO-DEVE-IR-PARA-A-TRILHA";
try {
  await q("insert into auth.users (id,email) values ($1,'a@exemplo.invalid')", [U1]);
  await q("insert into public.profiles (id,name,email) values ($1,'Admin','a@exemplo.invalid') on conflict do nothing", [U1]);
  await q("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','Cliente','Cidade','2026-01-01','2027-01-01')", [P1]);
  for (const [pid, n] of [[PR1, "PA-1"], [PR2, "PA-2"]]) {
    await q("insert into public.project_additional_proposals (id,project_id,proposal_number,title,description,source_type,created_by_type) values ($1,$2,$3,'Titulo',$4,'MANUAL','SYSTEM')", [pid, P1, n, SECRET]);
  }
  for (const fid of [F1, F2]) {
    await q("insert into public.ai_findings (id,project_id,finding_type,severity,confidence,interpretation,recommendation,fingerprint) values ($1::uuid,$2,'TESTE','HIGH',0.5,$3,$3,'fp-'||$1::text)", [fid, P1, SECRET]);
  }

  const audit = (action) => q("select * from public.audit_log_entries where action=$1 order by occurred_at, entity_id", [action]);

  await check("sem DELETE não há trilha de exclusão; UPDATE não gera exclusão", async () => {
    await q("update public.project_additional_proposals set title='Outro' where id=$1", [PR1]);
    eq((await audit("PROJECT_ADDITIONAL_PROPOSAL_DELETED")).length, 0, "propostas");
    eq((await audit("AI_FINDING_DELETED")).length, 0, "findings");
  });

  await check("DELETE de proposta sem sessão grava trilha SYSTEM com id, número, origem e status", async () => {
    await exec("select set_config('app.uid','',false)");
    await q("delete from public.project_additional_proposals where id=$1", [PR1]);
    const rows = await audit("PROJECT_ADDITIONAL_PROPOSAL_DELETED");
    eq(rows.length, 1, "linhas");
    eq([rows[0].actor_type, rows[0].actor_user_id, rows[0].entity_type, rows[0].entity_id, rows[0].project_id], ["SYSTEM", null, "PROJECT_ADDITIONAL_PROPOSAL", PR1, P1], "campos");
    ok(rows[0].detail.includes("PA-1") && rows[0].detail.includes("MANUAL") && rows[0].detail.includes("POSSIBLE_ADDITIONAL"), `detail: ${rows[0].detail}`);
  });

  await check("DELETE de proposta com usuário autenticado grava trilha USER com o autor", async () => {
    await exec(`select set_config('app.uid','${U1}',false)`);
    await q("delete from public.project_additional_proposals where id=$1", [PR2]);
    await exec("select set_config('app.uid','',false)");
    const rows = await audit("PROJECT_ADDITIONAL_PROPOSAL_DELETED");
    eq(rows.length, 2, "linhas");
    const r = rows.find((x) => x.entity_id === PR2);
    eq([r.actor_type, r.actor_user_id, r.actor_label], ["USER", U1, null], "autor");
  });

  await check("DELETE de finding grava AI_FINDING_DELETED (SYSTEM sem sessão; USER com sessão)", async () => {
    await q("delete from public.ai_findings where id=$1", [F1]);
    await exec(`select set_config('app.uid','${U1}',false)`);
    await q("delete from public.ai_findings where id=$1", [F2]);
    await exec("select set_config('app.uid','',false)");
    const rows = await audit("AI_FINDING_DELETED");
    eq(rows.length, 2, "linhas");
    eq(rows.map((r) => r.actor_type).sort(), ["SYSTEM", "USER"], "atores");
    ok(rows.every((r) => r.entity_type === "AI_FINDING" && r.detail.includes("TESTE") && r.detail.includes("HIGH")), "detail");
  });

  await check("a trilha é compacta: nenhum texto livre (description/interpretation) vaza", async () => {
    const rows = await q("select detail from public.audit_log_entries where action in ('PROJECT_ADDITIONAL_PROPOSAL_DELETED','AI_FINDING_DELETED')");
    eq(rows.length, 4, "linhas");
    ok(rows.every((r) => !r.detail.includes(SECRET)), "texto livre vazou");
  });

  await check("atomicidade: rollback do DELETE desfaz a trilha", async () => {
    await q("insert into public.project_additional_proposals (id,project_id,proposal_number,title,source_type,created_by_type) values ($1,$2,'PA-9','T','MANUAL','SYSTEM')", [PR9, P1]);
    const before = (await audit("PROJECT_ADDITIONAL_PROPOSAL_DELETED")).length;
    await exec("begin");
    await q("delete from public.project_additional_proposals where id=$1", [PR9]);
    await exec("rollback");
    eq((await audit("PROJECT_ADDITIONAL_PROPOSAL_DELETED")).length, before, "trilha");
    eq((await q("select count(*)::int n from public.project_additional_proposals where id=$1", [PR9]))[0].n, 1, "linha preservada");
  });

  await check("DELETE de zero linhas não gera trilha", async () => {
    const before = (await audit("AI_FINDING_DELETED")).length;
    await q("delete from public.ai_findings where id='30000000-0000-4000-8000-0000000000ff'");
    eq((await audit("AI_FINDING_DELETED")).length, before, "trilha");
  });

  await check("a trilha continua append-only (UPDATE/DELETE em audit_log_entries recusados)", async () => {
    let e1 = null, e2 = null;
    try { await q("update public.audit_log_entries set detail='x' where action='AI_FINDING_DELETED'"); } catch (e) { e1 = e.message; }
    try { await q("delete from public.audit_log_entries where action='AI_FINDING_DELETED'"); } catch (e) { e2 = e.message; }
    ok(e1 && e2, "mutação da trilha foi aceita");
  });

  await check("funções: SECURITY DEFINER, search_path vazio, sem EXECUTE para anon/authenticated/public", async () => {
    const rows = await q(`select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('audit_additional_proposal_deleted','audit_ai_finding_deleted')`);
    eq(rows.length, 2, "funções");
    for (const r of rows) {
      ok(r.prosecdef, `${r.proname} não é SECURITY DEFINER`);
      ok((r.proconfig ?? []).some((c) => c === 'search_path=""' || c === "search_path=" || c === "search_path=''"), `${r.proname} search_path: ${JSON.stringify(r.proconfig)}`);
      ok(!r.a && !r.u, `${r.proname} executável por anon/authenticated`);
    }
  });

  await check("migration idempotente: reaplicar não falha nem duplica triggers", async () => {
    await exec(readFileSync(path.join(dir, TARGET), "utf8"));
    await exec(readFileSync(path.join(dir, TARGET), "utf8"));
    eq((await q("select count(*)::int n from pg_trigger where tgname in ('project_additional_proposals_audit_deleted','ai_findings_audit_deleted') and not tgisinternal"))[0].n, 2, "triggers");
  });

  await check("a migration é nova (timestamp > 20261121160000) e não usa linguagem destrutiva", async () => {
    ok(TARGET > "20261121160000", "timestamp");
    const sql = readFileSync(path.join(dir, TARGET), "utf8").toLowerCase();
    ok(!/\bdrop (table|column)\b|\btruncate\b/.test(sql), "destrutiva");
  });

  // ---------- (2) caso encerrado pela origem x ação SLA aberta ----------
  const AREA = "PLANEJAMENTO";
  await q("insert into public.project_memberships (project_id, user_id, permission, status, area) values ($1,$2,'ADMINISTRADOR','ACTIVE',$3) on conflict do nothing", [P1, U1, AREA]);
  const mkAction = async (n, status) => {
    const id = `40000000-0000-4000-8000-0000000000${n}`;
    await q("insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação semanal','MEDIUM',$3,$4, now() + interval '2 hours','SYSTEM')", [id, P1, AREA, U1]);
    return id;
  };
  const mkCase = async (n, sla, status) => {
    const id = `50000000-0000-4000-8000-0000000000${n}`;
    await q("insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id, status, closed_at) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),$3,'MEDIUM','Alerta semanal',$4,$5,$6,$7, case when $7 = 'CLOSED' then now() else null end)", [id, P1, AREA, `fp-${n}`, sla, U1, status]);
    return id;
  };
  const issuesOf = async (caseId) => (await q("select issue_code from public.risk_sla_consistency_issues where case_id=$1 order by 1", [caseId])).map((r) => r.issue_code);

  const sOpen = await mkAction("11");
  const cClosed = await mkCase("11", sOpen, "CLOSED");
  const sOpen2 = await mkAction("12");
  const cOpen = await mkCase("12", sOpen2, "OPEN");

  await check("view: caso encerrado pela origem (CLOSED, state OPEN) com ação SLA aberta é listado como CASE_CLOSED_BY_SOURCE_SLA_OPEN", async () => {
    ok((await issuesOf(cClosed)).includes("CASE_CLOSED_BY_SOURCE_SLA_OPEN"), JSON.stringify(await issuesOf(cClosed)));
    const detail = (await q("select detail from public.risk_sla_consistency_issues where case_id=$1 and issue_code='CASE_CLOSED_BY_SOURCE_SLA_OPEN'", [cClosed]))[0].detail;
    ok(detail.includes("PENDING"), detail);
  });
  await check("view: caso ainda aberto não aparece como CASE_CLOSED_BY_SOURCE_SLA_OPEN", async () => {
    ok(!(await issuesOf(cOpen)).includes("CASE_CLOSED_BY_SOURCE_SLA_OPEN"), JSON.stringify(await issuesOf(cOpen)));
  });
  await check("view: ação SLA encerrada (cancelada/concluída) deixa de ser divergência (acúmulo resolvido)", async () => {
    await q("update public.sla_actions set status='CANCELLED' where id=$1", [sOpen]);
    ok(!(await issuesOf(cClosed)).includes("CASE_CLOSED_BY_SOURCE_SLA_OPEN"), JSON.stringify(await issuesOf(cClosed)));
  });
  await check("view: nada é corrigido sozinho (a ação SLA do caso aberto segue intacta) e continua security invoker", async () => {
    eq((await q("select status from public.sla_actions where id=$1", [sOpen2]))[0].status, "PENDING", "status da ação");
    const opts = (await q("select reloptions from pg_class where relname='risk_sla_consistency_issues'"))[0].reloptions;
    ok(String(opts).includes("security_invoker=true"), String(opts));
  });
  await check("view: anon sem acesso; authenticated e service_role com SELECT", async () => {
    const r = (await q("select has_table_privilege('anon','public.risk_sla_consistency_issues','select') a, has_table_privilege('authenticated','public.risk_sla_consistency_issues','select') u, has_table_privilege('service_role','public.risk_sla_consistency_issues','select') s"))[0];
    eq([r.a, r.u, r.s], [false, true, true], "privilégios");
  });
  await check("migration 2 idempotente e nova (> 20261121160000)", async () => {
    await exec(readFileSync(path.join(dir, TARGET2), "utf8"));
    await exec(readFileSync(path.join(dir, TARGET2), "utf8"));
    ok(TARGET2 > "20261121160000", "timestamp");
    ok(!/drop (table|column)|truncate|delete from|update public\./i.test(readFileSync(path.join(dir, TARGET2), "utf8")), "altera dados");
  });
} finally {
  await cleanup();
}
console.log(`\n${passed} OK, ${failed} FALHA(S).`);
process.exit(failed ? 1 : 0);
