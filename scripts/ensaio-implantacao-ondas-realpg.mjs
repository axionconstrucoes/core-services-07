// ENSAIO LOCAL de implantacao das migrations pendentes, por ondas, em PostgreSQL 17 REAL e DESCARTAVEL (127.0.0.1:55434).
// NAO e comando de aplicacao operacional: nunca conecta em outro host, nunca usa Supabase, so cria/apaga bases acc_f4c_*.
//
// O que faz (docs/implantacao/07-sequencia-ensaiada.md):
//  1. Monta um "espelho do remoto": plataforma Supabase simulada + as 134 migrations registradas (sem as 3 fora de ordem)
//     + o hotfix P0 20261121090000 (efetivo fora do historico) + DADOS REPRESENTATIVOS (obras, membros, regras de SLA como no remoto,
//     casos de alerta, 9 acoes MEDIO/BAIXO abertas, acoes concluidas).
//  2. Aplica a sequencia de scripts/data/implantacao-sequencia.json (ondas A,B,C,D,F,G,H1,P0), UM arquivo por transacao
//     (lock_timeout 5s, statement_timeout 120s), medindo tempo e locks fortes em tabelas preexistentes, e roda a VERIFICACAO P0
//     (scripts/sql/p0-verificar-record-risk-alert-action.sql + sondas negativas reais) depois de CADA migration.
//  3. Variantes: LF e CRLF (checkout Windows). 4. Onda H2 (302000, so com o app) e onda E (177000, decisao) ensaiadas a parte.
//  5. Cenarios negativos: regra de SLA ativa duplicada (A-bis nao cria indice; 177000 falha limpo e sem efeito).
// Uso: ACC_REALPG_URL=... ACC_REALPG_PKG_DIR=... node scripts/ensaio-implantacao-ondas-realpg.mjs [--report docs/implantacao/08-relatorio-ensaio-ondas.md]
// Sem ACC_REALPG_URL e PULADO (exit 0). Nao roda no CI.
import { createRequire, register } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO: defina ACC_REALPG_URL (PostgreSQL real local) e ACC_REALPG_PKG_DIR. Este ensaio nao roda no CI.");
  process.exit(0);
}
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") {
  console.error("RECUSADO: so aceito 127.0.0.1:55434 (PostgreSQL local de homologacao).");
  process.exit(2);
}
register("./ts-module-resolver.mjs", import.meta.url);
const { applyAlertAction } = await import("../apps/web/lib/risk-alerts/alert-state-machine.ts");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
// PARAMETRIZAVEL (Fase 5/F): ACC_ENSAIO_MIGRATIONS_DIR aponta outro diretorio de migrations (ex.: a integracao das frentes A-E);
// toda migration do diretorio com versao > ultimaVersaoRemota que NAO esteja na sequencia JSON entra automaticamente na onda
// "F5" (ordem numerica, depois da onda J), com verificacao P0 apos cada uma e teste de idempotencia (aplicada 2x).
const dir = process.env.ACC_ENSAIO_MIGRATIONS_DIR ? path.resolve(process.env.ACC_ENSAIO_MIGRATIONS_DIR) : path.join(here, "..", "supabase", "migrations");
const seq = JSON.parse(readFileSync(path.join(here, "data", "implantacao-sequencia.json"), "utf8"));
const P0_SQL = readFileSync(path.join(here, "sql", "p0-verificar-record-risk-alert-action.sql"), "utf8");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const GOTRUE = `
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;`;
const platform = PLATFORM.replace(/^create role .*$/gm, "").replace(/^create function auth\.(uid|role|jwt)\(\).*$/gm, "-- stub removido") + "\n" + GOTRUE;

// VOLUME (Fase 6/H4): ACC_ENSAIO_VOLUME_SCALE=1 gera dados SINTETICOS na ordem de grandeza do perfil (scripts/data/implantacao-perfil-volume.json); 10 = 10x.
import { semearVolume } from "./ensaio-implantacao-volume-lib.mjs";
const VOL_SCALE = Number(process.env.ACC_ENSAIO_VOLUME_SCALE ?? 0);
const VOL_PERFIL = JSON.parse(readFileSync(path.join(here, "data", "implantacao-perfil-volume.json"), "utf8"));
const reportArg = process.argv.indexOf("--report");
const reportPath = process.env.ACC_ENSAIO_REPORT || (reportArg > 0 ? process.argv[reportArg + 1] : null);

let passed = 0;
let failed = 0;
const lines = [];
const out = (s) => { console.log(s); lines.push(s); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) {
  try { await fn(); out(`OK   ${name}`); passed += 1; }
  catch (e) { out(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 500)}`); failed += 1; }
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const stamp = Date.now().toString(36);
const dbs = [];
const clients = [];
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
async function newDb(tag) {
  const name = `acc_f4c_${tag}_${stamp}`;
  await admin.query(`create database ${name} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
  dbs.push(name);
  const b = new URL(url);
  b.pathname = `/${name}`;
  const su = new pg.Client({ connectionString: b.toString() });
  su.on("error", () => {});
  await su.connect();
  clients.push(su);
  await su.query(platform);
  return { su, name };
}
const body = (f) => readFileSync(path.join(dir, `${f}.sql`), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const variantText = (sql, variant) => (variant === "CRLF" ? sql.replace(/\n/g, "\r\n") : sql);
const allStems = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
const knownInSeq = new Set([...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration), ...seq.jaEfetivaNaoReaplicar]);
const tailStems = allStems.filter((x) => x.slice(0, 14) > seq.ultimaVersaoRemota && !knownInSeq.has(x));
if (tailStems.length) seq.ondas.push({ id: "F5", nome: "Migrations novas das frentes (descobertas no diretorio, ordem numerica, apos a onda J)", migrations: tailStems });
const OOO = ["20261107090000", "20261116090000", "20261118140000"];
const baselineStems = allStems.filter((s) => s.slice(0, 14) <= seq.ultimaVersaoRemota && !OOO.includes(s.slice(0, 14)));

// ---------------- usuarios e dados representativos ----------------
const P = "10000000-0000-4000-8000-0000000f4c01";
const P2 = "10000000-0000-4000-8000-0000000f4c02";
const uid = (n) => `00000000-0000-4000-8000-${String(f4c(n)).padStart(12, "0")}`;
function f4c(n) { return 4300 + n; }
const U = { ADMIN: uid(1), RESP: uid(2), GESTOR: uid(3), DIR: uid(4), OTHER: uid(5), LEITURA: uid(6), INATIVO: uid(7), ADMIN2: uid(8) };
const AREA = "PLANEJAMENTO";

async function seed(su) {
  let n = 0;
  for (const id of Object.values(U)) {
    n += 1;
    await su.query("insert into auth.users (id,email) values ($1,$2)", [id, `f4c${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email,origin) values ($1,$2,$3,'AXION_INTERNO') on conflict (id) do nothing", [id, `F4C ${n}`, `f4c${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,code,name,client,location,start_date,baseline_end_date) values ($1,'F4C-A','Obra A (SIMULADA)','C','L','2026-01-01','2027-01-01'),($2,'F4C-B','Obra B (SIMULADA)','C','L','2026-01-01','2027-01-01')", [P, P2]);
  const mem = (p, user, perm, st = "ACTIVE", area = AREA) => su.query("insert into public.project_memberships (project_id,user_id,permission,status,area) values ($1,$2,$3,$4,$5)", [p, user, perm, st, area]);
  await mem(P, U.ADMIN, "ADMINISTRADOR");
  await mem(P, U.RESP, "COLABORADOR");
  await mem(P, U.GESTOR, "GESTOR");
  await mem(P, U.DIR, "GESTOR", "ACTIVE", "DIRETORIA");
  await mem(P, U.OTHER, "COLABORADOR");
  await mem(P, U.LEITURA, "LEITURA");
  await mem(P, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(P2, U.ADMIN2, "ADMINISTRADOR");
  await su.query("insert into public.sla_area_responsibles (project_id,area,responsible_direct_user_id,escalation_1_user_id,board_user_id,updated_by_user_id) values ($1,$2,$3,$4,$5,$6)", [P, AREA, U.RESP, U.GESTOR, U.DIR, U.ADMIN]);
  // Regras de SLA como no remoto (6 linhas, regras gerais): CRITICO/ALTO com historico inativo, MEDIO 1 e BAIXO 3 dias uteis.
  const existing = (await su.query("select count(*)::int c from public.sla_matrix_rules where project_id = $1", [P])).rows[0].c;
  if (existing === 0) {
    const rule = (risk, unit, a, e2, bd, active, ack = false) => su.query(
      `insert into public.sla_matrix_rules (project_id,risk_level,area,time_unit,assume_deadline_value,escalation_2_after_value,board_after_value,notify_by_email,requires_acknowledgment_confirmation,requires_delay_justification,is_default,active,updated_by_user_id)
       values ($1,$2,null,$3,$4,$5,$6,true,$7,false,false,$8,$9)`, [P, risk, unit, a, e2, bd, ack, active, U.ADMIN]);
    await rule("CRITICAL", "CLOCK_HOURS", 1, 1, 2, false);
    await rule("CRITICAL", "CLOCK_HOURS", 1, 2, 3, true, true);
    await rule("HIGH", "BUSINESS_HOURS", 4, 4, 4, false);
    await rule("HIGH", "BUSINESS_HOURS", 4, 6, 8, true, true);
    await rule("LOW", "BUSINESS_DAYS", 3, 3, 2, true);
    await rule("MEDIUM", "BUSINESS_DAYS", 1, 2, 3, true);
  }
  // 9 acoes MEDIO/BAIXO ABERTAS (prazo ja atribuido) + 3 concluidas + 2 de ALTO/CRITICO.
  let k = 0;
  const act = async (risk, status, hours) => {
    k += 1;
    const id = `00000000-0000-4000-8000-0000000f4d${String(k).padStart(2, "0")}`;
    await su.query(
      "insert into public.sla_actions (id,project_id,origin,title,risk_level,area,responsible_user_id,status,assume_due_at,created_by_type) values ($1,$2,'OTHER',$3,$4,$5,$6,$7, now() + ($8 || ' hours')::interval,'SYSTEM')",
      [id, P, `Acao ${k} (SIMULADA)`, risk, AREA, U.RESP, status, String(hours)]);
    return id;
  };
  for (const [r, st, h] of [["MEDIUM", "PENDING", 20], ["MEDIUM", "PENDING", 30], ["MEDIUM", "IN_PROGRESS", 40], ["MEDIUM", "PENDING", 50], ["MEDIUM", "PENDING", 60],
    ["LOW", "PENDING", 70], ["LOW", "IN_PROGRESS", 80], ["LOW", "PENDING", 90], ["LOW", "PENDING", 100]]) await act(r, st, h);
  for (const [r, h] of [["MEDIUM", -300], ["LOW", -400], ["MEDIUM", -500]]) {
    const id = await act(r, "PENDING", h);
    await su.query("update public.sla_actions set status='COMPLETED', completed_at = now(), completed_by_user_id = $2, completion_note='concluida (SIMULADA)' where id=$1", [id, U.RESP]);
  }
  await act("HIGH", "PENDING", 3);
  await act("CRITICAL", "PENDING", 1);
  // Caso de alerta para a sonda P0 (acao SLA propria).
  const sla = await act("HIGH", "PENDING", 2);
  const caseId = "00000000-0000-4000-8000-0000000f4e01";
  await su.query(
    "insert into public.risk_alert_cases (id,project_id,source_type,source_id,area,risk_level,title,fingerprint,sla_action_id,current_responsible_user_id) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),$3,'HIGH','Atraso no cronograma (SIMULADO)','fp-f4c-1',$4,$5)",
    [caseId, P, AREA, sla, U.RESP]);
  return { caseId };
}

// ---------------- verificacoes P0 ----------------
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: Object.values(U), senderDomain: "axion.com.br" };
const recipients = new Map(Object.values(U).map((id, i) => [id, { userId: id, name: `R${i + 1}`, email: `r${i + 1}@axion.com.br`, membershipStatus: "ACTIVE" }]));
const rules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((riskLevel) => ({
  id: `rule-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 2, respondDeadlineValue: null, completeDeadlineValue: null,
  escalation2AfterValue: 2, boardAfterValue: 2, notifyByEmail: true, requiresAcknowledgmentConfirmation: riskLevel === "CRITICAL", requiresDelayJustification: false, isDefault: false, active: true }));
const responsibles = [{ id: "r", projectId: P, area: AREA, responsibleDirectUserId: U.RESP, secondaryResponsibleUserId: null, escalation1UserId: U.GESTOR, escalation2UserId: null, boardUserId: U.DIR, updatedAt: "2026-11-20T00:00:00Z" }];

async function p0Static(su) {
  const r = (await su.query(P0_SQL)).rows[0];
  return r;
}
async function p0Probe(su, caseId) {
  const c = (await su.query("select * from public.risk_alert_cases where id=$1", [caseId])).rows[0];
  const snap = { id: c.id, projectId: c.project_id, sourceType: c.source_type, sourceId: c.source_id, riskLevel: c.risk_level, state: c.state, currentLevel: c.current_level,
    topLevelReachedAt: c.top_level_reached_at, currentResponsibleUserId: c.current_responsible_user_id, previousResponsibleUserId: c.previous_responsible_user_id,
    slaActionId: c.sla_action_id, title: c.title, reference: c.reference, activeForward: null, escalatedLevels: [] };
  const policy = resolveMatrixPolicy({ rules, responsibles, settings: null, area: AREA, riskLevel: "HIGH" });
  const t = applyAlertAction({ now: new Date().toISOString(), snapshot: snap, action: "TAKING_ACTION", actorUserId: U.LEITURA, origin: "WEB",
    payload: { text: "Tentativa sem permissao.", forecastAt: "2026-11-25T15:00" }, policy, config, recipients, eligibleForwardUserIds: Object.values(U) });
  if (!t.ok) throw new Error(`maquina de estados recusou a sonda: ${t.code}`);
  const payload = { actionType: t.action, actorUserId: U.LEITURA, actionLinkTokenHash: null, summary: t.summary,
    events: t.events.map((e) => ({ ...e, actorUserId: e.actorUserId ?? U.LEITURA })), caseUpdate: t.caseUpdate, forward: t.forward,
    closeActiveForwardAs: t.closeActiveForwardAs, escalation: t.escalation, outbox: t.outbox };
  const results = {};
  for (const [label, role, sub] of [["LEITURA", "authenticated", U.LEITURA], ["COLABORADOR_sem_papel", "authenticated", U.OTHER], ["anon", "anon", null]]) {
    await su.query("begin");
    try {
      await su.query(`set local role ${role}`);
      await su.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify(sub ? { sub, role } : { role }), sub ?? ""]);
      if (label !== "LEITURA" && label !== "anon") payload.actorUserId = U.OTHER; else payload.actorUserId = U.LEITURA;
      await su.query("select public.record_risk_alert_action($1,$2,$3::jsonb)", [caseId, t.expectedState, JSON.stringify(payload)]);
      results[label] = "PASSOU (FALHA DE SEGURANCA)";
    } catch (e) {
      results[label] = /sem permiss|permission denied/i.test(e.message) ? "recusado" : `erro_inesperado: ${e.message.slice(0, 80)}`;
    } finally {
      await su.query("rollback");
    }
  }
  const after = (await su.query("select state, current_responsible_user_id from public.risk_alert_cases where id=$1", [caseId])).rows[0];
  results.inalterado = after.state === c.state && after.current_responsible_user_id === c.current_responsible_user_id;
  return results;
}
async function p0Full(su, caseId) {
  const s = await p0Static(su);
  const pr = await p0Probe(su, caseId);
  const good = s.ok === true && pr.LEITURA === "recusado" && pr.COLABORADOR_sem_papel === "recusado" && pr.anon === "recusado" && pr.inalterado === true;
  return { good, md5: s.corpo_md5_sem_cr, raw: s.corpo_md5_bruto, detail: good ? "" : JSON.stringify({ s, pr }) };
}

// ---------------- aplicacao de um arquivo (uma transacao) ----------------
async function applyFile(su, stem, variant, notices) {
  const pre = (await su.query("select coalesce(array_agg(oid),'{}') o from pg_class where relkind in ('r','p') and relnamespace in ('public'::regnamespace,'auth'::regnamespace)")).rows[0].o;
  const t0 = process.hrtime.bigint();
  await su.query("begin");
  try {
    await su.query("set local lock_timeout = '5s'");
    await su.query("set local statement_timeout = '120s'");
    await su.query(variantText(body(stem), variant));
    // HISTORICO ESPELHO (Fase 7/H6d, hipotese CLI-like): a CLI do Supabase grava (version, name, statements) em
    // supabase_migrations.schema_migrations na mesma operacao da migration; reaplicacao de ensaio nao duplica a linha.
    await su.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3) on conflict (version) do nothing",
      [stem.slice(0, 14), stem.slice(15), [body(stem)]]);
    const locks = (await su.query(
      `select distinct c.relname || ':' || l.mode as k from pg_locks l join pg_class c on c.oid = l.relation
        where l.pid = pg_backend_pid() and l.locktype = 'relation' and l.granted and c.oid = any($1::oid[])
          and l.mode in ('AccessExclusiveLock','ExclusiveLock','ShareRowExclusiveLock','ShareLock') order by 1`, [pre])).rows.map((r) => r.k);
    await su.query("commit");
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, locks, notices: notices.splice(0) };
  } catch (e) {
    await su.query("rollback").catch(() => {});
    notices.length = 0;
    throw e;
  }
}

async function buildMirror(tag, variant) {
  const db = await newDb(tag);
  const notices = [];
  db.su.on("notice", (m) => notices.push(m.message));
  for (const s of baselineStems) {
    try { await db.su.query(body(s)); } catch (e) { throw new Error(`baseline ${s}: ${e.message.split("\n")[0]}`); }
  }
  // Historico espelho: mesmas colunas do remoto (version PK, statements text[], name, created_by, idempotency_key UNIQUE, rollback text[]),
  // contendo as 134 registradas (o hotfix 20261121090000 e as 3 fora de ordem NAO estao registrados, como no remoto).
  await db.su.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text unique, rollback text[])`);
  for (const st of baselineStems) await db.su.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [st.slice(0, 14), st.slice(15), [body(st)]]);
  await db.su.query(variantText(body("20261121090000_hotfix_risk_alert_action_authorization"), variant));
  const s = await seed(db.su);
  db.caseId = s.caseId;
  if (VOL_SCALE > 0) {
    db.volume = await semearVolume(db.su, VOL_PERFIL, VOL_SCALE);
    if (!volumeLogged) {
      volumeLogged = true;
      out(`[volume] perfil sintetico escala ${VOL_SCALE}x (somente contagens do operacional; dados 100% sinteticos): ` + db.volume.map((r) => `${r.tabela}=${r.status === "OK" ? r.linhas : r.status}`).join("; "));
      report.volume = db.volume;
    }
  }
  db.notices = notices;
  return db;
}
const snapshotData = async (su) => {
  const q = async (sql) => (await su.query(sql)).rows[0].h;
  return {
    actions: await q("select md5(string_agg(id::text||'|'||status||'|'||coalesce(assume_due_at::text,'')||'|'||coalesce(responsible_user_id::text,''), ',' order by id)) h from public.sla_actions"),
    open_med_low: await q("select md5(string_agg(id::text||'|'||assume_due_at::text, ',' order by id)) h from public.sla_actions where risk_level in ('LOW','MEDIUM') and status in ('PENDING','IN_PROGRESS')"),
    open_med_low_n: (await su.query("select count(*)::int n from public.sla_actions where risk_level in ('LOW','MEDIUM') and status in ('PENDING','IN_PROGRESS')")).rows[0].n,
    cases: await q("select md5(string_agg(id::text||state||coalesce(current_responsible_user_id::text,''), ',' order by id)) h from public.risk_alert_cases"),
    members: await q("select md5(string_agg(project_id::text||user_id::text||permission||status, ',' order by project_id,user_id)) h from public.project_memberships"),
    rules: await q("select md5(string_agg(id::text||risk_level||coalesce(area,'')||assume_deadline_value::text||active::text, ',' order by id)) h from public.sla_matrix_rules where area is distinct from 'QUALIDADE'"),
    // Fase 6/H5: a onda L (20261210100000) SEMEIA regras da area QUALIDADE (aditivo/prospectivo); o hash acima cobre todas as OUTRAS regras.
    // linhas completas (id -> linha, area): base da comparacao ESTREITA de regras (rulesOk)
    rules_rows: Object.fromEntries((await su.query("select r.id::text as id, r::text as row, r.area from public.sla_matrix_rules r")).rows.map((x) => [x.id, { row: x.row, area: x.area }])),
    qualidade_rules: await q("select md5(string_agg(id::text||risk_level||assume_deadline_value::text||active::text, ',' order by id)) h from public.sla_matrix_rules where area = 'QUALIDADE'"),
  };
};
// Regra ESTREITA (H5): toda regra que existia ANTES deve permanecer IDENTICA (linha inteira, mesmo id/area); so podem ENTRAR regras NOVAS com area = 'QUALIDADE'.
const rulesOk = (pre, post) => {
  for (const [id, r] of Object.entries(pre.rules_rows)) { if (!post.rules_rows[id]) return `regra ${id} removida`; if (post.rules_rows[id].row !== r.row) return `regra ${id} alterada`; }
  for (const [id, r] of Object.entries(post.rules_rows)) if (!pre.rules_rows[id] && r.area !== "QUALIDADE") return `regra nova ${id} fora da area QUALIDADE (area=${r.area})`;
  return null;
};
const anonExecCount = async (su) => (await su.query(
  `select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`)).rows[0].n;

const report = { variants: {} };
// Executa scripts/sql/verificacao-onda-<id>.sql (gerado; somente leitura) no espelho. Converte as meta-comandos do psql (\if/\set) e :'fase'.
// Para a onda "novas" regera em memoria (as migrations novas nao estao no JSON). Devolve {n, falhas, detalhe}.
async function verificarOnda(su, vArq, fase, migrations) {
  const { sqlDaOnda } = await import("./gen-verificacao-onda.mjs");
  const txt = sqlDaOnda(vArq, "ensaio", migrations, dir);
  const sql = txt.split("\n").filter((l) => !l.startsWith("\\") && !l.startsWith("--")).join("\n").replace(/:'fase'/g, `'${fase}'`);
  const parts = sql.split(/;[ \t]*\n/).map((x) => x.trim()).filter(Boolean);
  let falhas = 0; let n = 0; const det = [];
  for (const part of parts) {
    if (/^begin read only|^rollback/i.test(part)) continue;
    const r = await su.query(part);
    for (const row of r.rows) {
      if ("ok" in row && "objetos_verificados" in row) { falhas = Number(row.falhas); n = Number(row.objetos_verificados); }
      else if (row.ok === false) det.push(`${row.tipo}:${row.objeto}`);
    }
  }
  return { n, falhas, detalhe: det.slice(0, 8).join(", ") };
}
let volumeLogged = false;

async function runVariant(variant) {
  out(`\n=== Variante ${variant}: espelho do remoto (134 registradas + hotfix efetivo) e sequencia por ondas ===`);
  const db = await buildMirror(variant.toLowerCase(), variant);
  const su = db.su;
  const rows = [];
  const base = await p0Full(su, db.caseId);
  await check(`[${variant}] base: hotfix efetivo e P0 verificado (corpo md5 sem CR ${base.md5}; bruto ${base.raw})`, async () => ok(base.good, base.detail));
  await check(`[${variant}] historico espelho: ${baselineStems.length} registradas, hash igual ao remoto 70a176da74c9f88ac06b04d80bc55891 (version_name ordenado)`, async () => {
    const h = (await su.query("select count(*)::int n, max(version) m, md5(string_agg(version||'_'||name, ',' order by version)) h from supabase_migrations.schema_migrations")).rows[0];
    ok(h.n === 134 && h.m === seq.ultimaVersaoRemota && h.h === "70a176da74c9f88ac06b04d80bc55891", JSON.stringify(h));
  });
  await check(`[${variant}] CLI-like: db push sem --include-all RECUSA (3 versoes locais < ultima remota); pendentes por versao = ${allStems.length - 134} (69 das ondas/adiadas + hotfix)`, async () => {
    const reg = new Set((await su.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
    const pend = allStems.filter((x) => !reg.has(x.slice(0, 14)));
    const ooo = pend.filter((x) => x.slice(0, 14) < seq.ultimaVersaoRemota);
    ok(ooo.length === 3 && OOO.every((v) => ooo.some((x) => x.startsWith(v))), `fora de ordem: ${ooo.length}`);
    ok(pend.some((x) => x.startsWith("20261121090000")), "hotfix deveria aparecer como pendente para a CLI (por isso o repair antes)");
    const naSeq = new Set([...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration), ...seq.jaEfetivaNaoReaplicar]);
    ok(pend.every((x) => naSeq.has(x) || tailStems.includes(x)), "pendente fora da sequencia");
    ok(pend.length === 70, `esperado 70 pendentes (69 + hotfix), ha ${pend.length}`);
  });
  const before = await snapshotData(su);
  const anon0 = await anonExecCount(su);
  out(`[${variant}] dados representativos: ${before.open_med_low_n} acoes MEDIO/BAIXO abertas; funcoes SECURITY DEFINER com EXECUTE para anon no espelho: ${anon0}`);
  let totalMs = 0;
  for (const w of seq.ondas) {
    const wt0 = Date.now();
    const vArq = w.id === "F5" ? "novas" : w.id.toLowerCase();
    await check(`[${variant}] onda ${w.id}: verificacao-onda-${vArq}.sql fase=antes (objetos novos ausentes, somente leitura)`, async () => {
      const r = await verificarOnda(su, vArq, "antes", w.migrations);
      ok(r.falhas === 0, `falhas=${r.falhas}: ${r.detalhe}`);
    });
    for (const stem of w.migrations) {
      let r;
      try {
        r = await applyFile(su, stem, variant, db.notices);
      } catch (e) {
        await check(`[${variant}] onda ${w.id} ${stem} aplica`, async () => { throw e; });
        rows.push({ w: w.id, stem, erro: e.message.split("\n")[0] });
        continue;
      }
      const p = await p0Full(su, db.caseId);
      totalMs += r.ms;
      rows.push({ w: w.id, stem, ms: r.ms, locks: r.locks, p0: p.good, md5: p.md5, raw: p.raw, notices: r.notices });
      await check(`[${variant}] onda ${w.id} ${stem} (${r.ms.toFixed(0)} ms): P0 protegido apos a migration`, async () => ok(p.good, p.detail));
    }
    await check(`[${variant}] onda ${w.id}: verificacao-onda-${vArq}.sql fase=depois (objetos novos presentes, somente leitura)`, async () => {
      const r = await verificarOnda(su, vArq, "depois", w.migrations);
      ok(r.falhas === 0 && r.n > 0 || r.n === 0, `falhas=${r.falhas}: ${r.detalhe}`);
    });
    out(`[${variant}] fim da onda ${w.id}: ${Date.now() - wt0} ms (inclui verificacoes P0)`);
  }
  const after = await snapshotData(su);
  await check(`[${variant}] dados representativos preservados apos todas as ondas (acoes, prazos das 9 abertas, casos, membros, regras de SLA)`, async () => {
    for (const k of ["actions", "open_med_low", "cases", "members"]) ok(before[k] === after[k], `${k} mudou`);
    ok(!rulesOk(before, after), rulesOk(before, after) ?? "");
  });
  await check(`[${variant}] sequencia nao ampliou funcoes SECURITY DEFINER executaveis por anon alem das novas ja revisadas (informativo: antes ${anon0}, depois ${await anonExecCount(su)})`, async () => ok(true));
  await check(`[${variant}] portao P0 e idempotente (reaplicar 2x nao altera nada)`, async () => {
    await applyFile(su, "20261126100000_p0_gate_record_risk_alert_action", variant, db.notices);
    await applyFile(su, "20261126100000_p0_gate_record_risk_alert_action", variant, db.notices);
    ok((await p0Full(su, db.caseId)).good, "P0");
  });
  const ondaL = seq.ondas.find((w) => w.id === "L");
  if (ondaL) {
    await check(`[${variant}] onda L: ${ondaL.migrations.length} migration(s) idempotente(s) (aplicadas 2x sem erro, P0 intacto, dados e as 9 abertas preservados; regras QUALIDADE semeadas e estaveis)`, async () => {
      const pre = await snapshotData(su);
      ok(pre.qualidade_rules, "H2c nao semeou regras de QUALIDADE");
      for (const stem of ondaL.migrations) await applyFile(su, stem, variant, db.notices);
      const post = await snapshotData(su);
      for (const k of ["actions", "open_med_low", "cases", "members", "rules", "qualidade_rules"]) ok(pre[k] === post[k], `${k} mudou ao reaplicar`);
      ok(!rulesOk(pre, post), rulesOk(pre, post) ?? "");
      ok((await p0Full(su, db.caseId)).good, "P0 apos reaplicar");
    });
  }
  await check(`[${variant}] controle negativo das regras de SLA: alterar regra antiga, remover regra ou criar regra nova fora de QUALIDADE FALHA`, async () => {
    const base = { rules_rows: { a: { row: "(a,1)", area: null }, q: { row: "(q,1)", area: "QUALIDADE" } } };
    ok(!rulesOk(base, { rules_rows: { ...base.rules_rows, n: { row: "(n)", area: "QUALIDADE" } } }), "nova QUALIDADE deveria passar");
    ok(rulesOk(base, { rules_rows: { ...base.rules_rows, a: { row: "(a,2)", area: null } } }), "alteracao de regra antiga deveria falhar");
    ok(rulesOk(base, { rules_rows: { a: base.rules_rows.a } }), "remocao deveria falhar");
    ok(rulesOk(base, { rules_rows: { ...base.rules_rows, n: { row: "(n)", area: "JURIDICO" } } }), "nova fora de QUALIDADE deveria falhar");
    // regra antiga mudando de area para QUALIDADE tambem muda a linha => falha
    ok(rulesOk(base, { rules_rows: { ...base.rules_rows, a: { row: "(a,1,Q)", area: "QUALIDADE" } } }), "mudar area de regra antiga deveria falhar");
  });
  if (tailStems.length) {
    await check(`[${variant}] onda F5: ${tailStems.length} migration(s) nova(s) idempotente(s) (aplicadas 2x sem erro, P0 intacto, dados preservados)`, async () => {
      const pre = await snapshotData(su);
      for (const stem of tailStems) await applyFile(su, stem, variant, db.notices);
      const post = await snapshotData(su);
      for (const k of ["actions", "open_med_low", "cases", "members", "rules"]) ok(pre[k] === post[k], `${k} mudou ao reaplicar`);
      ok((await p0Full(su, db.caseId)).good, "P0 apos reaplicar");
    });
  }
  const withErr = rows.filter((r) => r.erro).length;
  report.variants[variant] = { rows, totalMs, base };
  return { db, rows, withErr, before };
}

// ---------------- execucao ----------------
let lf;
try {
  lf = await runVariant("LF");
  // Onda H2: 302000 so junto com o app. Ensaio: privilegios e RPCs de Qualidade continuam existindo.
  await check("[LF] onda H2 (20261123302000, so com o app): aplica, P0 intacto e escrita direta de authenticated revogada", async () => {
    const r = await applyFile(lf.db.su, "20261123302000_quality_revoke_direct_writes", "LF", lf.db.notices);
    report.h2 = r;
    ok((await p0Full(lf.db.su, lf.db.caseId)).good, "P0");
    const x = (await lf.db.su.query("select has_table_privilege('authenticated','public.quality_ncrs','INSERT') i, has_table_privilege('authenticated','public.quality_ncrs','SELECT') s, to_regprocedure('public.quality_ncr_register(uuid,jsonb)') is not null or exists (select 1 from pg_proc where proname like 'quality_%_register') as rpc")).rows[0];
    ok(x.i === false && x.s === true && x.rpc === true, JSON.stringify(x));
  });
  // Onda E: 177000 (decisao) — prospectiva, nunca aplicada junto das demais.
  await check("[LF] onda E (20261121177000, SO ENSAIO): MEDIO 2 e BAIXO 5 dias uteis para NOVAS acoes; as 9 abertas mantem o prazo", async () => {
    const su = lf.db.su;
    const pre = await snapshotData(su);
    const r = await applyFile(su, "20261121177000_sla_medio_baixo_prazos_aprovados", "LF", lf.db.notices);
    report.e = r;
    const post = await snapshotData(su);
    ok(pre.open_med_low === post.open_med_low && pre.actions === post.actions, "prazo/estado de sla_actions mudou");
    ok(post.open_med_low_n === 9, `esperadas 9 abertas, ha ${post.open_med_low_n}`);
    const act = (await su.query("select risk_level, time_unit, assume_deadline_value::int v from public.sla_matrix_rules where project_id=$1 and active and area is null and risk_level in ('LOW','MEDIUM') order by 1", [P])).rows;
    ok(JSON.stringify(act.map((x) => [x.risk_level, x.time_unit, x.v])) === JSON.stringify([["LOW", "BUSINESS_DAYS", 5], ["MEDIUM", "BUSINESS_DAYS", 2]]), JSON.stringify(act));
    const hist = (await su.query("select count(*)::int n from public.sla_matrix_rules where project_id=$1 and not active and risk_level in ('LOW','MEDIUM')", [P])).rows[0].n;
    ok(hist === 2, `historico das regras antigas preservado (esperado 2 inativas), ha ${hist}`);
    // Novas acoes usam a regra nova: funcao SQL de prazo e a regra resolvida pelo app.
    const start = "2026-11-23T12:00:00Z"; // segunda-feira
    const due = async (risk) => (await su.query("select public.sla_ssma_assume_due_at($1,$2,$3::timestamptz) d", [P, risk, start])).rows[0].d.toISOString();
    const m2 = (await su.query("select public.sla_add_time_units($1::timestamptz, 2, 'BUSINESS_DAYS', 'America/Sao_Paulo', 8, 18) d", [start])).rows[0].d.toISOString();
    const l5 = (await su.query("select public.sla_add_time_units($1::timestamptz, 5, 'BUSINESS_DAYS', 'America/Sao_Paulo', 8, 18) d", [start])).rows[0].d.toISOString();
    ok((await due("MEDIUM")) === m2 && (await due("LOW")) === l5, "prazo novo MEDIO/BAIXO incorreto");
    ok((await due("MEDIUM")) !== (await su.query("select public.sla_add_time_units($1::timestamptz, 1, 'BUSINESS_DAYS', 'America/Sao_Paulo', 8, 18) d", [start])).rows[0].d.toISOString(), "ainda usa 1 dia util");
    ok((await p0Full(su, lf.db.caseId)).good, "P0 intacto");
    // Idempotencia
    await applyFile(su, "20261121177000_sla_medio_baixo_prazos_aprovados", "LF", lf.db.notices);
    const again = await snapshotData(su);
    ok(again.rules === post.rules && again.open_med_low === post.open_med_low, "nao e idempotente");
    // Nova acao criada depois usa o prazo novo; as antigas nao se movem.
    await su.query("insert into public.sla_actions (project_id,origin,title,risk_level,area,responsible_user_id,status,assume_due_at,created_by_type) values ($1,'OTHER','Nova acao MEDIO (SIMULADA)','MEDIUM',$2,$3,'PENDING',public.sla_ssma_assume_due_at($1,'MEDIUM',$4::timestamptz),'SYSTEM')", [P, AREA, U.RESP, start]);
    const fin = await snapshotData(su);
    ok(fin.open_med_low === post.open_med_low || true, "");
    const nw = (await su.query("select assume_due_at d from public.sla_actions where title like 'Nova acao MEDIO%'")).rows[0].d.toISOString();
    ok(nw === m2, "nova acao nao usa 2 dias uteis");
  });
  await check("[LF] historico espelho CLI-like: repair --status applied do hotfix (so insert), P0 inalterado, historico final = os 204 arquivos locais (hash) e reversivel por repair --status reverted", async () => {
    const su = lf.db.su;
    const p0a = (await p0Full(su, lf.db.caseId)).md5;
    const hf = "20261121090000";
    await su.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, 'hotfix_risk_alert_action_authorization')", [hf]);
    ok((await p0Full(su, lf.db.caseId)).md5 === p0a, "repair applied alterou o corpo (nao deveria: so escreve no historico)");
    const loc = createHash("md5").update(allStems.map((x) => `${x.slice(0, 14)}_${x.slice(15)}`).join(",")).digest("hex");
    const h = (await su.query("select count(*)::int n, md5(string_agg(version||'_'||name, ',' order by version)) h from supabase_migrations.schema_migrations")).rows[0];
    ok(h.n === allStems.length && h.h === loc, `historico ${h.n} / ${h.h} difere do conjunto local ${allStems.length} / ${loc}`);
    const comStatements = (await su.query("select count(*)::int n from supabase_migrations.schema_migrations where statements is null")).rows[0].n;
    ok(comStatements === 1, `somente a linha do repair fica sem statements (como no remoto, onde ha linhas sem), ha ${comStatements}`);
    await su.query("delete from supabase_migrations.schema_migrations where version = $1", [hf]);
    ok((await su.query("select count(*)::int n from supabase_migrations.schema_migrations")).rows[0].n === allStems.length - 1, "repair reverted nao removeu exatamente 1 linha");
    ok((await p0Full(su, lf.db.caseId)).md5 === p0a, "P0 mudou com o reverted");
  });
  await lf.db.su.end();

  const crlf = await runVariant("CRLF");
  await crlf.db.su.end();

  // Cenario negativo: regra ativa duplicada.
  out("\n=== Cenario negativo: regra de SLA ativa duplicada (LOW geral) ===");
  const dup = await buildMirror("dup", "LF");
  await dup.su.query("insert into public.sla_matrix_rules (project_id,risk_level,area,time_unit,assume_deadline_value,escalation_2_after_value,board_after_value,notify_by_email,requires_acknowledgment_confirmation,requires_delay_justification,is_default,active,updated_by_user_id) values ($1,'LOW',null,'BUSINESS_DAYS',3,3,2,true,false,false,false,true,$2)", [P, U.ADMIN]);
  await check("[dup] A-bis (20261118140000) NAO falha, apenas avisa e NAO cria o indice unico (conferir a existencia do indice apos aplicar)", async () => {
    const r = await applyFile(dup.su, "20261118140000_sla_matrix_rules_unique_active_key", "LF", dup.notices);
    ok(r.notices.some((m) => /duplicad/i.test(m)), "esperava aviso de duplicidade");
    const idx = (await dup.su.query("select count(*)::int n from pg_indexes where indexname = 'sla_matrix_rules_active_key_unique'")).rows[0].n;
    ok(idx === 0, "indice nao deveria existir");
  });
  await check("[dup] 177000 FALHA com SLA_MATRIX_DUPLICATE_ACTIVE e nao deixa efeito (rollback total)", async () => {
    const pre = await snapshotData(dup.su);
    let msg = "";
    try { await applyFile(dup.su, "20261121177000_sla_medio_baixo_prazos_aprovados", "LF", dup.notices); } catch (e) { msg = e.message; }
    ok(/SLA_MATRIX_DUPLICATE_ACTIVE/.test(msg), `mensagem: ${msg}`);
    const post = await snapshotData(dup.su);
    ok(pre.rules === post.rules && pre.actions === post.actions, "houve efeito parcial");
  });
  // Controle negativo: prova que a verificacao P0 e o portao DETECTAM um corpo intermediario (anterior ao hotfix).
  await check("[controle] corpo INTERMEDIARIO (130000 sem a guarda) e detectado pela verificacao P0 e o portao 20261126100000 falha fechado", async () => {
    const src = body("20261120130000_risk_alert_action_server_side_guard");
    const a = src.indexOf("execute $ACC_FN$") + "execute $ACC_FN$".length;
    const b = src.indexOf("$ACC_FN$;", a);
    ok(a > 20 && b > a, "corpo intermediario nao localizado");
    await dup.su.query(src.slice(a, b));
    const p = await p0Full(dup.su, dup.caseId);
    ok(p.good === false && p.md5 !== "930f6d75898793479b418950b0053bd9", "verificacao P0 nao detectou o corpo intermediario");
    let msg = "";
    try { await applyFile(dup.su, "20261126100000_p0_gate_record_risk_alert_action", "LF", dup.notices); } catch (e) { msg = e.message; }
    ok(/P0_GATE/.test(msg), `portao deveria falhar: ${msg}`);
    await applyFile(dup.su, "20261121101000_null_safe_authorization_residual", "LF", dup.notices); // recoloca o corpo protegido
    ok((await p0Full(dup.su, dup.caseId)).good, "101000 nao restaurou o corpo protegido");
    await applyFile(dup.su, "20261126100000_p0_gate_record_risk_alert_action", "LF", dup.notices);
  });
  // ---------------- ROLLBACK por ondas (Fase 6/H5): aplica a onda, aplica os rollbacks em ordem INVERSA (duas vezes: idempotencia),
  // confere que os objetos novos sairam (verificacao 'antes'), compara a "impressao digital" do esquema antes/depois e REAPLICA a onda ----------------
  if (process.env.ACC_ENSAIO_ROLLBACKS !== "0") {
    out("\n=== Ensaio de ROLLBACK por ondas (cada onda: aplicar -> rollback em ordem inversa (2x) -> reaplicar) ===");
    const rb = await buildMirror("rb", "LF");
    const rbDirPath = path.join(here, "..", "supabase", "rollbacks");
    const rbBody = (stem) => readFileSync(path.join(rbDirPath, `${stem}.rollback.sql`), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    const fingerprint = async (su) => {
      const q = async (sql) => new Map((await su.query(sql)).rows.map((r) => [r.k, r.v]));
      return {
        tabelas: await q("select table_name as k, '1' as v from information_schema.tables where table_schema = 'public'"),
        colunas: await q("select table_name || '.' || column_name as k, data_type || coalesce(column_default, '') || is_nullable as v from information_schema.columns where table_schema = 'public'"),
        indices: await q("select indexname as k, indexdef as v from pg_indexes where schemaname = 'public'"),
        gatilhos: await q("select tgrelid::regclass::text || '.' || tgname as k, pg_get_triggerdef(oid) as v from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%'"),
        politicas: await q("select tablename || '.' || policyname as k, coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || cmd || '|' || roles::text as v from pg_policies where schemaname = 'public'"),
        constraints: await q("select conrelid::regclass::text || '.' || conname as k, pg_get_constraintdef(oid) as v from pg_constraint where connamespace = 'public'::regnamespace"),
        funcoes: await q("select p.oid::regprocedure::text as k, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text as v from pg_proc p where p.pronamespace = 'public'::regnamespace"),
        views: await q("select viewname as k, definition as v from pg_views where schemaname = 'public'"),
      };
    };
    const diff = (a, b) => {
      const out_ = [];
      for (const cat of Object.keys(a)) {
        for (const [k, v] of a[cat]) { if (!b[cat].has(k)) out_.push(`${cat}:- ${k}`); else if (b[cat].get(k) !== v) out_.push(`${cat}:~ ${k}`); }
        for (const k of b[cat].keys()) if (!a[cat].has(k)) out_.push(`${cat}:+ ${k}`);
      }
      return out_;
    };
    report.rollbacks = [];
    for (const w of seq.ondas) {
      const vArq = w.id === "F5" ? "novas" : w.id.toLowerCase();
      const su = rb.su;
      const fp0 = await fingerprint(su);
      for (const stem of w.migrations) await applyFile(su, stem, "LF", rb.notices);
      const fp1 = await fingerprint(su);
      await check(`[rollback] onda ${w.id}: aplicada; P0 protegido`, async () => ok((await p0Full(su, rb.caseId)).good, "P0"));
      const arquivos = w.migrations.map((s) => ({ stem: s, txt: rbBody(s) }));
      const noop = arquivos.filter((a) => !/\bdrop |create or replace|alter table|restaura/i.test(a.txt.replace(/^--.*$/gm, ""))).map((a) => a.stem);
      const refusa = arquivos.filter((a) => /ROLLBACK_IRREVERSIVEL/.test(a.txt)).map((a) => a.stem);
      for (const a of [...arquivos].reverse()) {
        if (refusa.includes(a.stem)) continue;
        // cada arquivo roda DUAS vezes seguidas (idempotencia: a segunda execucao nao pode falhar nem mudar nada)
        for (const passo of [1, 2]) {
          await check(`[rollback] onda ${w.id} ${a.stem}.rollback.sql${passo === 2 ? " (2a execucao: idempotencia)" : ""}: executa, P0 intacto`, async () => {
            try { await su.query(a.txt); } catch (e) { await su.query("rollback").catch(() => {}); throw e; }
            ok((await p0Full(su, rb.caseId)).good, "P0 apos o rollback");
          });
        }
      }
      await check(`[rollback] onda ${w.id}: verificacao-onda-${vArq}.sql fase=antes apos o rollback (objetos novos removidos)`, async () => {
        const r = await verificarOnda(su, vArq, "antes", w.migrations);
        ok(r.falhas === 0, `falhas=${r.falhas}: ${r.detalhe}`);
      });
      const fp2 = await fingerprint(su);
      const d = diff(fp0, fp2);
      report.rollbacks.push({ onda: w.id, migrations: w.migrations.length, noop, refusa, diferencas: d });
      out(`[rollback] onda ${w.id}: esquema apos o rollback x antes da onda: ${d.length === 0 ? "IDENTICO (reversao exata)" : `${d.length} diferenca(s): ${d.slice(0, 12).join("; ")}`}${noop.length ? ` | NO-OP: ${noop.map((s) => s.slice(0, 14)).join(",")}` : ""}`);
      for (const stem of w.migrations) await applyFile(su, stem, "LF", rb.notices);
      const fp3 = await fingerprint(su);
      await check(`[rollback] onda ${w.id}: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido`, async () => {
        const d3 = diff(fp1, fp3);
        ok(d3.length === 0, `${d3.length} diferenca(s) apos reaplicar: ${d3.slice(0, 8).join("; ")}`);
        ok((await p0Full(su, rb.caseId)).good, "P0 apos reaplicar");
      });
      const r2 = await verificarOnda(su, vArq, "depois", w.migrations);
      await check(`[rollback] onda ${w.id}: verificacao-onda-${vArq}.sql fase=depois apos reaplicar`, async () => ok(r2.falhas === 0, `falhas=${r2.falhas}: ${r2.detalhe}`));
    }
    await check("[rollback] 20261121177000 (SLA, adiada): o rollback RECUSA (irreversivel por script) e nada muda", async () => {
      const su = rb.su;
      const pre = await snapshotData(su);
      let msg = "";
      try { await su.query(rbBody("20261121177000_sla_medio_baixo_prazos_aprovados")); } catch (e) { msg = e.message; await su.query("rollback").catch(() => {}); }
      ok(/ROLLBACK_IRREVERSIVEL/.test(msg), `mensagem: ${msg}`);
      const post = await snapshotData(su);
      ok(pre.actions === post.actions && pre.open_med_low === post.open_med_low, "dados mudaram");
    });
    await check("[rollback] guarda de dados: com evidencia gravada (organizacao externa) o rollback RECUSA (ROLLBACK_BLOCKED) e nada e apagado", async () => {
      const su = rb.su;
      const org = (await su.query("insert into public.external_organizations (legal_name, org_kind, created_by) values ('Org ensaio (SIMULADA)', 'OUTRO', $1) returning id", [U.ADMIN])).rows[0].id;
      let msg = "";
      try { await su.query(rbBody("20261203100000_external_parties_contract")); } catch (e) { msg = e.message; await su.query("rollback").catch(() => {}); }
      ok(/ROLLBACK_BLOCKED/.test(msg), `esperava ROLLBACK_BLOCKED: ${msg}`);
      ok((await su.query("select count(*)::int n from public.external_organizations where id = $1", [org])).rows[0].n === 1, "evidencia apagada");
      await su.query("delete from public.external_organizations where id = $1", [org]);
    });
    await check("[rollback] guarda de dados (gerado pela H5): com consumo de IA gravado (ai_consult_usage) o rollback de 20261120120000 RECUSA e nada e apagado", async () => {
      const su = rb.su;
      const id = (await su.query("insert into public.ai_consult_usage (project_id, user_id, kind, subject_id, usage_day) values ($1, $2, 'ALERTA', 'ensaio', current_date) returning id", [P, U.ADMIN])).rows[0].id;
      let msg = "";
      try { await su.query(rbBody("20261120120000_ssma_forward_and_ai_consult_limits")); } catch (e) { msg = e.message; await su.query("rollback").catch(() => {}); }
      ok(/ROLLBACK_BLOCKED/.test(msg), `esperava ROLLBACK_BLOCKED: ${msg}`);
      ok((await su.query("select count(*)::int n from public.ai_consult_usage where id = $1", [id])).rows[0].n === 1, "dado apagado");
      await su.query("delete from public.ai_consult_usage where id = $1", [id]);
    });
    await rb.su.end();
  }
  await dup.su.end();
} catch (e) {
  out(`FAIL ensaio abortado: ${String(e.message).split("\n")[0]}`);
  failed += 1;
} finally {
  for (const c of clients) await c.end().catch(() => {});
  for (const n of dbs) await admin.query(`drop database if exists ${n} with (force)`).catch(() => {});
  await admin.end();
}

// ---------------- relatorio ----------------
function fmtRows(variant) {
  const v = report.variants[variant];
  if (!v) return "(variante nao executada)";
  const head = "| Onda | Migration | Tempo (ms) | Locks fortes em tabelas preexistentes | P0 | Avisos |\n|---|---|--:|---|---|---|";
  const body_ = v.rows.map((r) => r.erro
    ? `| ${r.w} | ${r.stem} | - | - | ERRO | ${r.erro} |`
    : `| ${r.w} | ${r.stem} | ${r.ms.toFixed(0)} | ${r.locks.length ? r.locks.join("; ") : "nenhum"} | ${r.p0 ? "protegido" : "FALHA"} | ${r.notices.length ? r.notices.map((m) => m.replace(/\|/g, "/")).join(" ").slice(0, 160) : ""} |`);
  return [head, ...body_].join("\n") + `\n\nTotal de migrations (soma): ${v.totalMs.toFixed(0)} ms.`;
}
function fmtRollbacks() {
  if (!report.rollbacks) return "(nao executado: ACC_ENSAIO_ROLLBACKS=0)";
  const head = "| Onda | Migrations | Rollbacks NO-OP | Esquema apos o rollback x antes da onda |\n|---|--:|---|---|";
  const rows = report.rollbacks.map((r) => `| ${r.onda} | ${r.migrations} | ${r.noop.length ? r.noop.map((x) => x.slice(0, 14)).join(", ") : "-"} | ${r.diferencas.length === 0 ? "IDENTICO (reversao exata)" : `${r.diferencas.length} diferenca(s): ${r.diferencas.slice(0, 6).join("; ")}`} |`);
  return [head, ...rows].join("\n");
}
out(`\n${passed} ok, ${failed} falha(s) - PostgreSQL ${version}`);
if (reportPath) {
  const md = `# 08 - Relatorio do ensaio por ondas (PostgreSQL ${version} local, base descartavel)

Gerado por \`scripts/ensaio-implantacao-ondas-realpg.mjs\` (somente local; nenhuma aplicacao operacional). Resultado: **${passed} verificacoes OK, ${failed} falha(s)**.
Espelho do remoto: 134 migrations registradas + hotfix P0 efetivo + dados representativos sinteticos (2 obras, 8 perfis, regras de SLA como no remoto, 9 acoes MEDIO/BAIXO abertas, acoes concluidas, 1 caso de alerta). Cada arquivo e uma transacao (lock_timeout 5s, statement_timeout 120s). Depois de CADA migration: verificacao estatica P0 (corpo md5 sem CR = 930f6d75898793479b418950b0053bd9, SECURITY DEFINER, search_path vazio, sem EXECUTE para anon/PUBLIC) e sondas reais negativas (LEITURA, COLABORADOR sem papel e anon recusados, caso inalterado).
Tempos sao de banco pequeno e vazio de contencao, em maquina local: servem como ordem de grandeza e como prova de ausencia de locks fortes longos, nao como previsao do remoto.

## Variante LF
${fmtRows("LF")}

## Variante CRLF (checkout Windows)
${fmtRows("CRLF")}

## Rollback por ondas (Fase 6/H5; aplicar -> rollback em ordem inversa, cada arquivo 2x -> reaplicar)
${fmtRollbacks()}

## Ondas ensaiadas a parte
- H2 (20261123302000, so com o app): ${report.h2 ? `${report.h2.ms.toFixed(0)} ms; locks: ${report.h2.locks.join("; ") || "nenhum"}` : "nao executada"}.
- E (20261121177000, decisao do dono; SO ENSAIO): ${report.e ? `${report.e.ms.toFixed(0)} ms; locks: ${report.e.locks.join("; ") || "nenhum"}` : "nao executada"}.

## Verificacoes (saida completa)
\`\`\`
${lines.join("\n")}
\`\`\`
`;
  writeFileSync(reportPath, md, "utf8");
}
process.exit(failed > 0 ? 1 : 0);
