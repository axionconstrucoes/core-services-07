// FRENTE D — aprovação de reemissão em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base nova
// (acc_fd_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role — caminho de produção do PostgREST,
// NÃO o stub app.uid) e concorrência real (conexões independentes). Dados 100% SINTÉTICOS.
// Cobre: papéis (ADMINISTRADOR x GESTOR/COLABORADOR/LEITURA/anon/outro projeto/inativo), privilégios (EXECUTE), validação
// por caso, justificativa, idempotência, "RPC só escreve auditoria", append-only e CONCORRÊNCIA (N chamadas = 1 aprovação),
// inclusive lotes sobrepostos em ordem inversa (sem deadlock).
// NÃO roda no CI. Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-reissue-approval-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
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
  console.error("RECUSADO: só aceito 127.0.0.1:55434 (PostgreSQL local de homologação).");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const TARGET = "20261121178000_reissue_approval_flow.sql";
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

let passed = 0;
let failed = 0;
const open = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  } finally {
    while (open.length) await open.pop().end().catch(() => {});
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
async function rejects(promise, pattern, label) {
  try { await promise; } catch (e) { ok(pattern.test(e.message), `${label}: erro inesperado: ${e.message}`); return; }
  throw new Error(`${label}: esperava erro ${pattern}, mas a operação passou`);
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_fd_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}

const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
try {
  await su.query(platform);
  for (const f of files) {
    try { await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  // 2ª e 3ª aplicações da migration alvo (idempotência no PostgreSQL real)
  const again = readFileSync(path.join(dir, TARGET), "utf8");
  await su.query(again);
  await su.query(again);
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${TARGET} reaplicada 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(1700 + n).padStart(12, "0")}`;
  const P = "10000000-0000-4000-8000-0000000017a0";
  const P2 = "10000000-0000-4000-8000-0000000017b0";
  const USERS = { ADMIN: 1, GESTOR: 2, COLAB: 3, LEITURA: 4, ADMIN2: 5, RESP: 6, ESC1: 7, DIR: 8, INATIVO: 9, ADMINB: 10 };
  for (const n of Object.values(USERS)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `fd-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `FD ${n}`, `fd-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','FDA','C','L','2026-01-01','2027-01-01'),($2,'Obra B','FDB','C','L','2026-01-01','2027-01-01')", [P, P2]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(P, USERS.ADMIN, "ADMINISTRADOR");
  await mem(P, USERS.ADMINB, "ADMINISTRADOR"); // segundo administrador (concorrência entre administradores)
  await mem(P, USERS.GESTOR, "GESTOR");
  await mem(P, USERS.COLAB, "COLABORADOR");
  await mem(P, USERS.LEITURA, "LEITURA");
  await mem(P, USERS.RESP, "COLABORADOR");
  await mem(P, USERS.ESC1, "GESTOR");
  await mem(P, USERS.DIR, "GESTOR");
  await mem(P, USERS.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(P2, USERS.ADMIN2, "ADMINISTRADOR");
  await su.query("insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id) values ($1,'PLANEJAMENTO',$2,$3,$4,$5)", [P, uid(USERS.RESP), uid(USERS.ESC1), uid(USERS.DIR), uid(USERS.ADMIN)]);

  let seq = 0;
  async function newCase(label, { project = P, risk = "CRITICAL", stage = "DIRETORIA", status = "OPEN", responsible = uid(USERS.RESP), gap = true } = {}) {
    seq += 1;
    const sla = `00000000-0000-4000-8000-0000000e2${String(seq).padStart(3, "0")}`;
    const id = `00000000-0000-4000-8000-0000000e3${String(seq).padStart(3, "0")}`;
    await su.query("insert into public.sla_actions (id,project_id,origin,title,risk_level,area,responsible_user_id,status,current_escalation_level,assume_due_at,created_by_type) values ($1,$2,'OTHER','Ação',$3,'PLANEJAMENTO',$4,'ESCALATED',$5, now() - interval '20 days','SYSTEM')", [sla, project, risk, responsible, stage]);
    await su.query("insert into public.risk_alert_cases (id,project_id,source_type,source_id,area,risk_level,title,fingerprint,sla_action_id,current_responsible_user_id,status,closed_at,reference,first_seen_at) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),'PLANEJAMENTO',$3,$4,$5,$6,$7,$8,$9,$10, now() - interval '25 days')", [id, project, risk, `Caso ${label}`, `fp-${label}`, sla, responsible, status, status === "CLOSED" ? new Date().toISOString() : null, `R-${label}`]);
    if (gap) await su.query("insert into public.risk_alert_outbox (project_id,case_id,risk_level,notification_type,escalation_level,recipient_user_id,scheduled_for,status,suppression_reason,idempotency_key) values ($1,$2,$3,'IMMEDIATE','RESPONSAVEL',$4,now(),'SUPPRESSED','CONFIGURATION_REVIEW_REQUIRED',$5)", [project, id, risk === "MEDIUM" ? "MEDIUM" : risk, responsible, `fd-sup-${label}`]);
    return id;
  }
  const JUST = "Diretoria confirmou o risco vigente e autorizou a reemissão aos destinatários.";
  /** Conexão independente já como `role` com claims JWT (sub = uid). */
  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const approve = (c, project, ids, just = JUST) => c.query("select public.risk_alert_reissue_approve($1,$2::uuid[],$3) as r", [project, ids, just]).then((x) => x.rows[0].r);
  const pending = (c, project) => c.query("select * from public.risk_alert_reissue_pending($1)", [project]).then((x) => x.rows);
  const n = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const approvedCount = (caseId) => n("select count(*)::int n from public.audit_log_entries where action='RISK_ALERT_REISSUE_APPROVED' and entity_id=$1", [caseId]);
  const totalApproved = () => n("select count(*)::int n from public.audit_log_entries where action='RISK_ALERT_REISSUE_APPROVED'");

  await check("1) papéis: só o ADMINISTRADOR ativo do projeto consulta/aprova; GESTOR, COLABORADOR, LEITURA, ex-administrador, administrador de outro projeto, authenticated sem sub e anon são recusados — nada gravado", async () => {
    const c1 = await newCase("c1");
    for (const [who, who_n] of [["GESTOR", USERS.GESTOR], ["COLAB", USERS.COLAB], ["LEITURA", USERS.LEITURA], ["INATIVO", USERS.INATIVO], ["ADMIN2", USERS.ADMIN2], ["RESP", USERS.RESP]]) {
      const c = await as(who_n);
      await rejects(pending(c, P), /FORBIDDEN/, `${who} consulta`);
      await rejects(approve(c, P, [c1]), /FORBIDDEN/, `${who} aprova`);
    }
    await rejects(approve(await as(null, "authenticated"), P, [c1]), /AUTH_REQUIRED/, "authenticated sem sub");
    await rejects(approve(await as(null, "anon"), P, [c1]), /permission denied/i, "anon aprova");
    await rejects(pending(await as(null, "anon"), P), /permission denied/i, "anon consulta");
    await rejects(approve(await as(USERS.ADMIN), null, [c1]), /FORBIDDEN/, "projeto nulo");
    eq(await totalApproved(), 0, "nada gravado");
    const a = await as(USERS.ADMIN);
    eq((await pending(a, P)).length, 1, "ADMINISTRADOR lista");
  });

  await check("2) privilégios: authenticated não alcança o núcleo de avaliação nem escreve na trilha/outbox; service_role não aprova (sem sessão humana)", async () => {
    const a = await as(USERS.ADMIN);
    await rejects(a.query("select * from public.risk_alert_reissue_evaluate($1, null)", [P]), /permission denied/i, "evaluate");
    await rejects(a.query("insert into public.audit_log_entries (project_id,actor_type,actor_user_id,action,entity_type,entity_id,detail) values ($1,'USER',$2,'RISK_ALERT_REISSUE_APPROVED','RISK_ALERT_CASE','x','y')", [P, uid(USERS.ADMIN)]), /permission denied|row-level security/i, "insert direto na trilha");
    await rejects(a.query("insert into public.risk_alert_outbox (project_id,case_id,risk_level,notification_type,recipient_user_id,scheduled_for,idempotency_key) values ($1,null,'DIGEST','DIGEST',$2,now(),'x')", [P, uid(USERS.ADMIN)]), /permission denied|row-level security|violates/i, "insert direto na outbox");
    const s = await as(null, "service_role");
    await rejects(approve(s, P, ["00000000-0000-4000-8000-0000000e3001"]), /AUTH_REQUIRED/, "service_role sem usuário");
  });

  await check("3) validação por caso no PostgreSQL real: outro projeto, não CRÍTICO/ALTO, fechado, sem lacuna, suspenso manual — recusados individualmente; os elegíveis são aprovados", async () => {
    const ok1 = await newCase("ok1");
    const ok2 = await newCase("ok2", { risk: "HIGH", stage: "ESCALAO_1" });
    const med = await newCase("med", { risk: "MEDIUM", stage: "RESPONSAVEL" });
    const closed = await newCase("closed", { status: "CLOSED" });
    const susp = await newCase("susp");
    const other = await newCase("other", { project: P2, responsible: uid(USERS.ADMIN2), gap: false });
    const informed = await newCase("informed", { stage: "RESPONSAVEL", gap: false });
    await su.query("insert into public.risk_alert_outbox (project_id,case_id,risk_level,notification_type,escalation_level,recipient_user_id,recipient_email,scheduled_for,sent_at,status,attempt_count,idempotency_key) values ($1,$2,'CRITICAL','IMMEDIATE','RESPONSAVEL',$3,$4,now(),now(),'SENT',1,'fd-sent-1')", [P, informed, uid(USERS.RESP), `FD-${USERS.RESP}@EXEMPLO.INVALID`]);
    await su.query("insert into public.audit_log_entries (project_id,actor_type,actor_user_id,action,entity_type,entity_id,detail) values ($1,'USER',$2,'RISK_ALERT_CASE_COMMUNICATION_SUSPENDED','RISK_ALERT_CASE',$3,'{}')", [P, uid(USERS.ADMIN), susp]);
    const outboxBefore = await n("select count(*)::int n from public.risk_alert_outbox");
    const a = await as(USERS.ADMIN);
    const r = await approve(a, P, [ok1, ok2, med, closed, susp, other, informed]);
    eq(r.approved.map((x) => x.caseId).sort(), [ok1, ok2].sort(), "aprovados");
    eq(Object.fromEntries(r.ignored.map((x) => [x.caseId, x.reason])), { [med]: "RISK_LEVEL_NOT_ELIGIBLE", [closed]: "CASE_NOT_OPEN", [susp]: "MANUALLY_SUSPENDED", [other]: "CASE_NOT_FOUND", [informed]: "NO_COMMUNICATION_GAP" }, "ignorados");
    eq(await n("select count(*)::int n from public.risk_alert_outbox"), outboxBefore, "outbox intacta");
    const row = (await su.query("select actor_type, actor_user_id, actor_label, project_id, entity_type, action from public.audit_log_entries where entity_id=$1 and action='RISK_ALERT_REISSUE_APPROVED'", [ok1])).rows[0];
    eq([row.actor_type, row.actor_user_id, row.actor_label, row.project_id, row.entity_type], ["USER", uid(USERS.ADMIN), null, P, "RISK_ALERT_CASE"], "formato consumido pelo ciclo");
  });

  await check("4) justificativa: obrigatória, tamanho e sem dado sensível — recusada sem gravar", async () => {
    const c = await newCase("just");
    const a = await as(USERS.ADMIN);
    const before = await totalApproved();
    for (const [bad, code] of [[null, "JUSTIFICATION_INVALID"], ["curta", "JUSTIFICATION_INVALID"], ["x".repeat(501), "JUSTIFICATION_INVALID"], ["Aprovado, contato fulano@empresa.com.br da obra", "JUSTIFICATION_SENSITIVE"], ["Aprovado com o documento 12345678901 informado", "JUSTIFICATION_SENSITIVE"], ["Aprovado conforme token: abcdef do painel interno x", "JUSTIFICATION_SENSITIVE"]]) {
      await rejects(approve(a, P, [c], bad), new RegExp(code), `justificativa ${String(bad).slice(0, 20)}`);
    }
    eq(await totalApproved(), before, "nada gravado");
  });

  await check("5) idempotência: repetir a aprovação não cria nova linha (ALREADY_APPROVED_AWAITING_SEND)", async () => {
    const c = await newCase("idem");
    const a = await as(USERS.ADMIN);
    eq((await approve(a, P, [c])).approved.length, 1, "1ª");
    for (let i = 0; i < 3; i++) eq((await approve(a, P, [c])).ignored.map((x) => x.reason), ["ALREADY_APPROVED_AWAITING_SEND"], `repetição ${i}`);
    eq(await approvedCount(c), 1, "uma linha");
  });

  await check("6) CONCORRÊNCIA: 25 conexões (2 administradores) aprovando o MESMO caso ao mesmo tempo = exatamente 1 aprovação", async () => {
    const c = await newCase("conc1");
    const conns = await Promise.all(Array.from({ length: 25 }, (_, i) => as(i % 2 ? USERS.ADMIN : USERS.ADMINB)));
    const res = await Promise.allSettled(conns.map((cn) => approve(cn, P, [c])));
    ok(res.every((r) => r.status === "fulfilled"), `todas respondem sem erro: ${res.find((r) => r.status === "rejected")?.reason?.message}`);
    eq(res.filter((r) => r.value.approved.length === 1).length, 1, "exatamente uma aprovou");
    eq(res.filter((r) => r.value.ignored.some((x) => x.reason === "ALREADY_APPROVED_AWAITING_SEND")).length, 24, "as demais viram ALREADY_APPROVED");
    eq(await approvedCount(c), 1, "uma linha de auditoria");
  });

  await check("7) CONCORRÊNCIA com lotes sobrepostos em ordem inversa (sem deadlock): cada caso aprovado exatamente 1 vez", async () => {
    const cs = [];
    for (let i = 0; i < 6; i++) cs.push(await newCase(`ov${i}`));
    const conns = await Promise.all(Array.from({ length: 12 }, (_, i) => as(i % 2 ? USERS.ADMIN : USERS.ADMINB)));
    const res = await Promise.allSettled(conns.map((cn, i) => approve(cn, P, i % 2 ? cs : [...cs].reverse())));
    ok(res.every((r) => r.status === "fulfilled"), `sem deadlock/erro: ${res.find((r) => r.status === "rejected")?.reason?.message}`);
    eq(res.reduce((s, r) => s + r.value.approved.length, 0), 6, "6 aprovações no total");
    for (const c of cs) eq(await approvedCount(c), 1, `caso ${c.slice(-3)}`);
  });

  await check("8) reemissão já criada pelo ciclo (outbox PENDING com a chave da decisão): a decisão consumida não é re-aprovada", async () => {
    const c = await newCase("race");
    const a = await as(USERS.ADMIN);
    await approve(a, P, [c]);
    const auditId = (await su.query("select id from public.audit_log_entries where entity_id=$1 and action='RISK_ALERT_REISSUE_APPROVED'", [c])).rows[0].id;
    await su.query("insert into public.risk_alert_outbox (project_id,case_id,risk_level,notification_type,escalation_level,recipient_user_id,scheduled_for,status,idempotency_key) values ($1,$2,'CRITICAL','IMMEDIATE','RESPONSAVEL',$3,now(),'PENDING',$4)", [P, c, uid(USERS.RESP), `INGESTION_ALERT:z:REISSUE:${auditId}:${uid(USERS.RESP)}`]);
    eq((await approve(a, P, [c])).ignored.map((x) => x.reason), ["ALREADY_REISSUED"], "reemitido");
    eq(await approvedCount(c), 1, "uma linha");
  });

  await check("9) trilha append-only e funções SECURITY DEFINER com search_path vazio, sem EXECUTE para anon/public", async () => {
    const a = await as(USERS.ADMIN);
    const upd = await a.query("update public.audit_log_entries set detail='x' where action='RISK_ALERT_REISSUE_APPROVED'").catch((e) => ({ error: e }));
    ok(upd.error ? /permission denied|append-only|row-level/i.test(upd.error.message) : upd.rowCount === 0, "update pelo authenticated deve falhar ou afetar 0 linhas");
    await rejects(su.query("update public.audit_log_entries set detail='x' where action='RISK_ALERT_REISSUE_APPROVED'"), /append-only/, "update (superusuário)");
    await rejects(su.query("delete from public.audit_log_entries where action='RISK_ALERT_REISSUE_APPROVED'"), /append-only/, "delete");
    const f = (await su.query(`select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid,'execute') anon_x, has_function_privilege('public', p.oid,'execute') pub_x from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname like 'risk\\_alert\\_reissue\\_%' order by 1`)).rows;
    eq(f.length, 3, "três funções");
    for (const r of f) ok(r.prosecdef && JSON.stringify(r.proconfig).includes("search_path=") && !r.anon_x && !r.pub_x, `${r.proname} fora do padrão`);
  });

  await check("10) hotfix P0 intocável: o corpo de record_risk_alert_action (md5 do prosrc) é o do hotfix (930f6d75... / c2f015a9...)", async () => {
    const m = (await su.query("select md5(p.prosrc) m from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='record_risk_alert_action'")).rows.map((r) => r.m);
    eq(m.length, 1, "uma função");
    console.log(`     md5(prosrc record_risk_alert_action) = ${m[0]}`);
    ok(/^(930f6d75|c2f015a9)/.test(m[0]), `md5 diferente do hotfix esperado: ${m[0]}`);
  });
} finally {
  for (const c of open) await c.end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam (base ${dbName} apagada)`);
process.exit(failed > 0 ? 1 : 0);
