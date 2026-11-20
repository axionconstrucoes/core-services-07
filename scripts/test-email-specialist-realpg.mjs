// ESPECIALISTA por e-mail (migration 20261121170000) em PostgreSQL REAL (conexões independentes), banco acc_* próprio, APAGADO ao final.
//   1. replay de TODAS as migrations numa base nova (inclui a nova) e reaplicação da nova (idempotência);
//   2. permissões: anon/authenticated sem EXECUTE e sem acesso à tabela; funções SECURITY DEFINER com search_path vazio;
//   3. a MESMA mensagem enviada por 20 conexões ao mesmo tempo => 1 consulta, 19 MESSAGE_ALREADY_APPLIED, 1 auditoria;
//   4. 20 mensagens distintas em paralelo => 20 consultas; ALTO/CRÍTICO sempre com revisão humana;
//   5. conclusão concorrente (10 conexões) => exatamente 1 vence; as demais CONSULTATION_ALREADY_CLOSED;
//   6. LEITURA / não membro / outra obra recusados (revalidação no banco); a ação SLA de origem fica IDÊNTICA;
//   7. o hotfix P0 (record_risk_alert_action, md5 930f6d75…/c2f015a9…) continua exatamente o mesmo.
// NÃO roda no CI (exige PostgreSQL). Uso (mesma sessão em que o setup exportou as variáveis):
//   ACC_REALPG_URL=postgres://… ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-email-specialist-realpg.mjs
// Sem ACC_REALPG_URL o teste é PULADO (exit 0). Só aceita 127.0.0.1:55434. Nada toca Supabase, e-mail ou rede externa.

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO: defina ACC_REALPG_URL (PostgreSQL real local) e ACC_REALPG_PKG_DIR. Este teste não roda no CI.");
  process.exit(0);
}
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") {
  console.log("RECUSADO: só aceita o PostgreSQL local isolado em 127.0.0.1:55434.");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const requireFrom = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"));
const pg = requireFrom("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 300)}`);
    failed += 1;
  }
}
const ok = (c, m) => {
  if (!c) throw new Error(m);
};
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_lote3_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const base = new URL(url);
base.pathname = `/${dbName}`;
const dbUrl = base.toString();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
const setup = new pg.Client({ connectionString: dbUrl });
await setup.connect();
let exitCode = 0;
try {
  await setup.query(PLATFORM.replace(/^create role .*$/gm, ""));
  const t0 = Date.now();
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
    try {
      await setup.query(sql);
    } catch (e) {
      console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`);
      throw e;
    }
  }
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas em ${((Date.now() - t0) / 1000).toFixed(1)} s — base ${dbName}`);
  await setup.query("insert into storage.buckets (id, name) values ('project-documents', 'project-documents') on conflict do nothing");

  const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  const P1 = "10000000-0000-4000-8000-000000000001";
  const P2 = "10000000-0000-4000-8000-000000000002";
  const U = { RESP: id(2), LEITURA: id(3), OUTRA: id(4), ADMIN: id(1) };
  for (const [uid, email] of [[U.ADMIN, "adm@axion.com.br"], [U.RESP, "resp@axion.com.br"], [U.LEITURA, "leitura@axion.com.br"], [U.OUTRA, "outra@axion.com.br"]]) {
    await setup.query("insert into auth.users (id,email) values ($1,$2)", [uid, email]);
    await setup.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid, email.split("@")[0], email]);
  }
  for (const [pid, code] of [[P1, "O1"], [P2, "O2"]]) await setup.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,$2,$2,'C','L','2026-01-01','2027-01-01')", [pid, code]);
  await setup.query("insert into public.project_memberships (project_id,user_id,permission,status,area) values ($1,$2,'ADMINISTRADOR','ACTIVE','PLANEJAMENTO'),($1,$3,'COLABORADOR','ACTIVE','PLANEJAMENTO'),($1,$4,'LEITURA','ACTIVE','PLANEJAMENTO'),($5,$6,'COLABORADOR','ACTIVE','PLANEJAMENTO')", [P1, U.ADMIN, U.RESP, U.LEITURA, P2, U.OUTRA]);
  const slaId = "20000000-0000-4000-8000-000000000001";
  await setup.query("insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, status, assume_due_at, complete_due_at, created_by_type) values ($1,$2,'OTHER','Ação','HIGH','PLANEJAMENTO',$3,'PENDING', now() + interval '1 hour', now() + interval '3 days','SYSTEM')", [slaId, P1, U.RESP]);
  const fingerprint = async () => JSON.stringify((await setup.query("select status, responsible_user_id, assume_due_at, complete_due_at, current_escalation_level, acknowledged_by_user_id, completed_at from public.sla_actions where id = $1", [slaId])).rows[0]);
  const hotfixMd5 = async () => (await setup.query("select md5(prosrc) as m from pg_proc where oid = 'public.record_risk_alert_action'::regproc")).rows.map((r) => r.m);
  const HARDENED = new Set(["c2f015a91b8f4e94c52a68c3536cb89d", "930f6d75898793479b418950b0053bd9"]);
  const before = await fingerprint();
  const md5Before = await hotfixMd5();

  const RECORD = "select public.email_specialist_consult_record($1,$2,'TOKEN','SLA_ACTION',$3,$4,'PLANEJAMENTO',$5,'planning-director','AREA','Qual a melhor alternativa para recuperar o atraso?',$6,'resp@axion.com.br','<m@x>','<m@x>','RE: ESPECIALISTA') as id";
  async function conn() {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    return c;
  }
  const settle = async (n, fn) => {
    const cs = await Promise.all(Array.from({ length: n }, conn));
    const res = await Promise.allSettled(cs.map((c, i) => fn(c, i)));
    await Promise.all(cs.map((c) => c.end()));
    return res;
  };

  console.log("\n======================================\nESPECIALISTA POR E-MAIL — PostgreSQL REAL\n======================================");

  await check("1. permissões: tabela com RLS sem acesso de anon/authenticated; RPCs só service_role; SECURITY DEFINER com search_path vazio", async () => {
    const t = (await setup.query("select relrowsecurity rls, has_table_privilege('authenticated','public.email_specialist_consultations','select') a, has_table_privilege('anon','public.email_specialist_consultations','insert') n from pg_class where oid='public.email_specialist_consultations'::regclass")).rows[0];
    ok(t.rls && !t.a && !t.n, JSON.stringify(t));
    for (const fn of ["public.email_specialist_consult_record(uuid,uuid,text,text,text,text,text,text,text,text,text,boolean,text,text,text,text)", "public.email_specialist_consult_complete(uuid,text,text,numeric)"]) {
      const r = (await setup.query(`select has_function_privilege('anon','${fn}','execute') n, has_function_privilege('authenticated','${fn}','execute') a, has_function_privilege('service_role','${fn}','execute') s, prosecdef, proconfig from pg_proc where oid='${fn}'::regprocedure`)).rows[0];
      ok(!r.n && !r.a && r.s && r.prosecdef && (r.proconfig ?? []).some((c) => /^search_path=("")?$/.test(c) || c === 'search_path=""'), `${fn}: ${JSON.stringify(r)}`);
    }
    const c = await conn();
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      let denied = false;
      try {
        await c.query(RECORD, [U.RESP, P1, slaId, `m-denied-${role}`, "HIGH", true]);
      } catch (e) {
        denied = /permission denied/i.test(e.message);
      }
      await c.query("reset role");
      ok(denied, `${role} não pode executar`);
    }
    await c.end();
  });

  await check("2. a MESMA mensagem por 20 conexões ao mesmo tempo: 1 consulta, 19 MESSAGE_ALREADY_APPLIED, 1 auditoria; ação SLA idêntica", async () => {
    const res = await settle(20, (c) => c.query(RECORD, [U.RESP, P1, slaId, "dup-msg-1", "HIGH", true]));
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    const dup = res.filter((r) => r.status === "rejected" && /MESSAGE_ALREADY_APPLIED/.test(r.reason.message)).length;
    eq([okCount, dup], [1, 19], "1 vence, 19 duplicadas");
    eq(Number((await setup.query("select count(*)::int n from public.email_specialist_consultations where provider_message_id='dup-msg-1'")).rows[0].n), 1, "linhas");
    eq(Number((await setup.query("select count(*)::int n from public.audit_log_entries where action='EMAIL_SPECIALIST_CONSULT_REQUESTED' and detail like '%dup-msg-1%'")).rows[0].n), 1, "auditorias");
    eq(await fingerprint(), before, "ação SLA de origem");
  });

  await check("3. 20 mensagens distintas em paralelo => 20 consultas; ALTO/CRÍTICO com revisão humana forçada mesmo se o chamador pedir false", async () => {
    const res = await settle(20, (c, i) => c.query(RECORD, [U.RESP, P1, slaId, `par-msg-${i}`, i % 2 ? "CRITICAL" : "HIGH", false]));
    eq(res.filter((r) => r.status === "rejected").map((r) => r.reason.message), [], "sem falhas");
    const rows = (await setup.query("select requires_human_review r, count(*)::int n from public.email_specialist_consultations where provider_message_id like 'par-msg-%' group by 1")).rows;
    eq(rows.map((r) => [r.r, r.n]), [[true, 20]], "todas com revisão humana");
  });

  await check("4. conclusão concorrente (10 conexões): exatamente 1 vence; as demais CONSULTATION_ALREADY_CLOSED; auditoria única e sem o texto da resposta", async () => {
    const cid = (await setup.query("select id from public.email_specialist_consultations where provider_message_id='dup-msg-1'")).rows[0].id;
    const res = await settle(10, (c) => c.query("select public.email_specialist_consult_complete($1,'ANSWERED','RESPOSTASIGILOSA recomendada',0.6)", [cid]));
    eq([res.filter((r) => r.status === "fulfilled").length, res.filter((r) => r.status === "rejected" && /CONSULTATION_ALREADY_CLOSED/.test(r.reason.message)).length], [1, 9], "1 vence");
    eq(Number((await setup.query("select count(*)::int n from public.audit_log_entries where action='EMAIL_SPECIALIST_CONSULT_ANSWERED' and entity_id=$1 and detail not like '%SIGILOSA%'", [cid])).rows[0].n), 1, "auditoria");
  });

  await check("5. LEITURA, não membro, outra obra e usuário nulo recusados NO BANCO; pergunta curta e Expert inválido (AXIA) recusados", async () => {
    const tries = [[U.LEITURA, P1, "READ_ONLY_PROFILE"], [U.OUTRA, P1, "PROJECT_ACCESS_DENIED"], [U.RESP, P2, "PROJECT_ACCESS_DENIED"], [null, P1, "AUTH_REQUIRED"]];
    for (const [uid, pid, code] of tries) {
      let msg = "";
      try {
        await setup.query(RECORD, [uid, pid, slaId, `forged-${code}-${uid}`, "LOW", false]);
      } catch (e) {
        msg = e.message;
      }
      ok(msg.includes(code), `${code}: ${msg}`);
    }
    for (const [sql, args, code] of [
      ["select public.email_specialist_consult_record($1,$2,'TOKEN','SLA_ACTION',$3,'short-q','PLANEJAMENTO','LOW','planning-director','AREA','curta',false,'a@axion.com.br',null,null,null)", [U.RESP, P1, slaId], "QUESTION_REQUIRED"],
      ["select public.email_specialist_consult_record($1,$2,'TOKEN','SLA_ACTION',$3,'axia-q','PLANEJAMENTO','LOW','axia','AREA','Pergunta válida aqui',false,'a@axion.com.br',null,null,null)", [U.RESP, P1, slaId], "expert_id_check"],
    ]) {
      let msg = "";
      try {
        await setup.query(sql, args);
      } catch (e) {
        msg = e.message;
      }
      ok(msg.includes(code), `${code}: ${msg}`);
    }
    eq(await fingerprint(), before, "ação SLA de origem");
  });

  await check("6. idempotência: a migration nova reaplicada 2x não falha nem duplica objetos/dados; hotfix P0 inalterado (md5 de record_risk_alert_action)", async () => {
    const sql = readFileSync(path.join(dir, "20261121170000_email_specialist_consultations.sql"), "utf8").replace(/^﻿/, "");
    const rowsBefore = Number((await setup.query("select count(*)::int n from public.email_specialist_consultations")).rows[0].n);
    await setup.query(sql);
    await setup.query(sql);
    eq(Number((await setup.query("select count(*)::int n from public.email_specialist_consultations")).rows[0].n), rowsBefore, "dados preservados");
    const md5After = await hotfixMd5();
    eq(md5After, md5Before, "md5 do corpo antes/depois");
    ok(md5After.length === 1 && HARDENED.has(md5After[0]), `corpo reforçado: ${md5After}`);
  });
} catch (e) {
  console.log(`ERRO: ${String(e.message).split("\n")[0]}`);
  exitCode = 1;
} finally {
  await setup.end().catch(() => undefined);
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${dbName}'`).catch(() => undefined);
  await admin.query(`drop database if exists ${dbName}`).catch((e) => console.log(`AVISO: não apagou ${dbName}: ${e.message}`));
  const left = (await admin.query("select count(*)::int n from pg_database where datname = $1", [dbName])).rows[0].n;
  console.log(`base ${dbName} ${left === 0 ? "APAGADA" : "AINDA EXISTE"}`);
  await admin.end();
}
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 && exitCode === 0 ? 0 : 1);
