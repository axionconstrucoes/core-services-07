// LOTE 2 — acompanhamento por EVENTOS, previsão de término, guardas de consistência e revoke de anon em funções de
// gatilho (migrations 20261121170000 e 20261121171000). Replay de TODAS as migrations em PGlite (descartável, sem rede,
// sem e-mail, sem IA). Datas relativas a Date.now()/now(): nenhuma data fixa.
//
// Uso: node scripts/test-l2-followup-forecast-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { applyAlertAction } = await import("../apps/web/lib/risk-alerts/alert-state-machine.ts");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy.ts");
const { rpcFor } = await import("./lib/token-replies-phase.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
const read = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const db = new PGlite();
await db.exec(platform);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(read(f).replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));

const P = "00000000-0000-4000-8000-00000000e000";
const AREA = "PLANEJAMENTO";
const U = {
  ADMIN: "00000000-0000-4000-8000-00000000e001",
  RESP: "00000000-0000-4000-8000-00000000e002",
  GESTOR: "00000000-0000-4000-8000-00000000e003",
  DIR: "00000000-0000-4000-8000-00000000e004",
  LEITURA: "00000000-0000-4000-8000-00000000e005",
  COLAB: "00000000-0000-4000-8000-00000000e006",
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `l2${n}@axion.com.br`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `L${n}`, `l2${n}@axion.com.br`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-L2', 'L2 (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.DIR}', 'GESTOR', 'ACTIVE', 'DIRETORIA'),
    ('${P}', '${U.LEITURA}', 'LEITURA', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.COLAB}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO');
  insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id)
    values ('${P}', '${AREA}', '${U.RESP}', '${U.GESTOR}', '${U.DIR}', '${U.ADMIN}');
`);

const asUser = (uid) => db.exec(`select set_config('app.uid','${uid}',false), set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
const asWorker = () => db.exec(`select set_config('app.uid','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','{"role":"service_role"}',false)`);
const asSuper = () => db.exec(`select set_config('app.uid','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false)`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
async function expectRefused(promise, fragments) {
  const list = [].concat(fragments);
  try {
    await promise;
  } catch (error) {
    assert(list.some((f) => String(error.message).includes(f)), `esperado ${list.join(" | ")}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado recusa (${list.join(" | ")}), mas passou`);
}

let seq = 0;
async function newSlaAction({ responsible = U.RESP, risk = "HIGH", assumed = true, level = "RESPONSAVEL", status = null } = {}) {
  await asSuper();
  seq += 1;
  const id = `00000000-0000-4000-8000-0000000e1${String(seq).padStart(3, "0")}`;
  await db.query("insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação L2',$3,$4,$5, now() + interval '2 hours','SYSTEM')", [id, P, risk, AREA, responsible]);
  if (assumed) await db.query("update public.sla_actions set acknowledged_at = now(), acknowledged_by_user_id = $2, status = 'IN_PROGRESS' where id = $1", [id, responsible ?? U.ADMIN]);
  if (level !== "RESPONSAVEL" || status) {
    await db.exec("select set_config('acc.allow_escalation_update','true',false)");
    if (status === "COMPLETED") await db.query("update public.sla_actions set current_escalation_level = $2, status = 'COMPLETED', completed_at = now(), completed_by_user_id = $3, completion_note = 'concluída no teste' where id = $1", [id, level, responsible ?? U.ADMIN]);
    else await db.query("update public.sla_actions set current_escalation_level = $2, status = coalesce($3, status) where id = $1", [id, level, status]);
    await db.exec("select set_config('acc.allow_escalation_update','',false)");
  }
  return id;
}
const hour = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const countAudit = async (action, id) => (await one("select count(*)::int c from public.audit_log_entries where action = $1 and entity_id = $2", [action, id])).c;

console.log("\n=== LOTE 2: previsão, acompanhamento por eventos, guardas, revoke anon (PGlite, replay completo) ===");

// ---------------- grants ----------------
const TRIGGER_FNS = ["handle_new_user", "prevent_last_administrator_removal", "project_delivery_items_log_risk_change", "set_document_version_project_id"];
const PREDICATE_FNS = ["has_project_permission", "is_project_member", "is_any_project_admin", "is_shared_project_admin"];
await check("G1 as 4 funções de gatilho herdadas perdem EXECUTE de anon (e continuam com authenticated/service_role)", async () => {
  for (const f of TRIGGER_FNS) {
    const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('service_role', p.oid, 'execute') s, p.prosecdef d
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [f]);
    assert(r.d && r.a === false && r.u === true && r.s === true, `${f}: ${JSON.stringify(r)}`);
  }
});
await check("G2 os 4 predicados de RLS (has_project_permission, is_project_member, is_any_project_admin, is_shared_project_admin) CONTINUAM executáveis por anon (pendência de decisão: RLS TO public os avalia)", async () => {
  for (const f of PREDICATE_FNS) {
    const r = await one("select has_function_privilege('anon', p.oid, 'execute') a from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1", [f]);
    assert(r.a === true, `${f} perdeu anon: o app/RLS poderia mudar de comportamento`);
  }
  const policies = await one(`select count(*)::int c from pg_policies where schemaname = 'public' and roles::text like '%public%' and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(has_project_permission|is_project_member|is_any_project_admin|is_shared_project_admin)[(]'`);
  assert(policies.c > 0, "esperava políticas TO public dependentes dos predicados (evidência da pendência)");
});
await check("G3 prova: gatilho dispara para papel SEM EXECUTE na função (anon/authenticated) — revoke das funções de gatilho não quebra DML", async () => {
  await asSuper();
  await db.exec("begin");
  try {
    await db.exec(`create table public.l2_trg_probe (x int);
      grant insert on public.l2_trg_probe to anon, authenticated;
      create function public.l2_trg_probe_fn() returns trigger language plpgsql security definer set search_path = '' as $f$ begin new.x := new.x + 1; return new; end $f$;
      revoke all on function public.l2_trg_probe_fn() from public, anon, authenticated;
      create trigger l2_trg_probe_t before insert on public.l2_trg_probe for each row execute function public.l2_trg_probe_fn();`);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set local role ${role}`);
      await db.exec("insert into public.l2_trg_probe values (1)");
      await db.exec("reset role");
    }
    const r = await one("select count(*)::int c, min(x)::int mn from public.l2_trg_probe");
    assert(r.c === 2 && r.mn === 2, JSON.stringify(r));
  } finally {
    await db.exec("rollback");
  }
});
await check("G4 gatilhos reais continuam disparando após o revoke (último administrador protegido; project_id da versão preenchido)", async () => {
  await asSuper();
  await db.exec("begin");
  try {
    await expectRefused(db.exec(`delete from public.project_memberships where project_id = '${P}' and user_id = '${U.ADMIN}'`), ["administrador", "Administrador", "ADMINISTRADOR", "último", "ultimo"]);
  } finally {
    await db.exec("rollback");
  }
});
await check("G5 todas as funções SECURITY DEFINER do schema public: search_path vazio; só as 4 de predicado ainda expõem anon", async () => {
  const r = (await db.query(`select p.proname, p.proconfig::text cfg, has_function_privilege('anon', p.oid, 'execute') a from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind in ('f','p')`)).rows;
  const semPath = r.filter((x) => !/search_path=""|search_path=''|search_path=\"\"/.test(x.cfg ?? "") && !(x.cfg ?? "").includes("search_path"));
  assert(semPath.length === 0, `sem search_path: ${semPath.map((x) => x.proname).join(",")}`);
  const anon = r.filter((x) => x.a).map((x) => x.proname).sort();
  assert(JSON.stringify(anon) === JSON.stringify([...PREDICATE_FNS].sort()), `anon: ${anon.join(",")}`);
});

// ---------------- autorização NULL-safe: funções booleanas/uuid de autorização ----------------
await check("A1 nenhuma função SECURITY DEFINER de autorização (retorno boolean) devolve NULL: sessão sem usuário, usuário inexistente e argumentos NULL → false", async () => {
  const fns = (await db.query(`select p.proname, p.oid, pg_get_function_identity_arguments(p.oid) args, p.pronargs from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f' and p.prorettype = 'boolean'::regtype and p.proname !~ '^(audit_|tg_|trigger_)'`)).rows;
  assert(fns.length >= 10, `inventário curto: ${fns.length}`);
  const unknown = "00000000-0000-4000-8000-00000000ffff";
  const ofType = (t, i) => (/uuid/.test(t) ? (i === 0 ? unknown : unknown) : /text/.test(t) ? "x" : /bigint|integer/.test(t) ? "0" : null);
  const nulls = [];
  for (const mode of ["SEM_SESSAO", "USUARIO_INEXISTENTE", "AUTENTICADO_ARGS_NULL"]) {
    if (mode === "SEM_SESSAO") await asSuper();
    else if (mode === "USUARIO_INEXISTENTE") await asUser(unknown);
    else await asUser(U.COLAB);
    for (const f of fns) {
      const types = f.args === "" ? [] : f.args.split(",").map((s) => s.trim().replace(/^\w+ /, ""));
      const args = types.map((t, i) => (mode === "AUTENTICADO_ARGS_NULL" ? "null" : ofType(t, i) === null ? "null" : `'${ofType(t, i)}'`) + `::${t}`);
      let v;
      try {
        v = (await db.query(`select (public.${f.proname}(${args.join(",")})) as v`)).rows[0].v;
      } catch (error) {
        continue; // recusa explícita (exceção) é falha-fechada; só NULL silencioso é defeito
      }
      if (v === null) nulls.push(`${mode}:${f.proname}(${f.args})`);
    }
  }
  await asSuper();
  assert(nulls.length === 0, `devolveram NULL: ${nulls.join("; ")}`);
});

// ---------------- previsão de término (ação SLA) ----------------
await check("F1 tela: responsável registra a previsão (futura) e o evento + auditoria SLA_ACTION_FORECAST_RECORDED aparecem; prazos intocados", async () => {
  const a = await newSlaAction();
  const before = await one("select assume_due_at, respond_due_at, complete_due_at, current_escalation_level, status from public.sla_actions where id = $1", [a]);
  await asUser(U.RESP);
  const f = hour(48);
  const id = (await one("select public.sla_action_record_forecast($1, $2::timestamptz, 'Replanejar frente B') id", [a, f])).id;
  await asSuper();
  const ev = await one("select * from public.sla_action_followup_events where id = $1", [id]);
  assert(ev.event_type === "FORECAST_RECORDED" && ev.origin === "WEB" && ev.actor_user_id === U.RESP && new Date(ev.forecast_at).toISOString() === new Date(f).toISOString(), JSON.stringify(ev));
  assert((await countAudit("SLA_ACTION_FORECAST_RECORDED", a)) === 1, "auditoria ausente");
  const after = await one("select assume_due_at, respond_due_at, complete_due_at, current_escalation_level, status from public.sla_actions where id = $1", [a]);
  assert(JSON.stringify(before) === JSON.stringify(after), "a previsão alterou prazo/nível/status");
});
await check("F2 tela: LEITURA, colaborador sem responsabilidade, previsão no passado, sem previsão, ação não assumida, ação concluída e sessão sem usuário são recusados — nada gravado", async () => {
  const a = await newSlaAction();
  const idle = await newSlaAction({ assumed: false });
  const done = await newSlaAction({ status: "COMPLETED" });
  const countAll = async () => (await one("select count(*)::int c from public.sla_action_followup_events")).c;
  const c0 = await countAll();
  for (const [who, act, when, frag] of [
    ["LEITURA", a, hour(24), "ACTION_ACCESS_DENIED"],
    ["COLAB", a, hour(24), "ACTION_ACCESS_DENIED"],
    ["RESP", a, hour(-1), "FORECAST_IN_PAST"],
    ["RESP", a, null, "FORECAST_REQUIRED"],
    ["RESP", idle, hour(24), "ACTION_NOT_ASSUMED"],
    ["RESP", done, hour(24), "ACTION_CLOSED"],
  ]) {
    await asUser(U[who]);
    await expectRefused(db.query("select public.sla_action_record_forecast($1, $2::timestamptz, null)", [act, when]), frag);
  }
  await asSuper();
  await expectRefused(db.query("select public.sla_action_record_forecast($1, $2::timestamptz, null)", [a, hour(24)]), "AUTH_REQUIRED");
  assert((await countAll()) === c0, "algo foi gravado");
});
await check("F3 e-mail: EM ANDAMENTO + previsão grava status, evento estruturado (origem EMAIL) e auditoria; mesma mensagem não duplica; sem previsão válida o fluxo antigo é preservado", async () => {
  const a = await newSlaAction({ assumed: false });
  await asWorker();
  const f = hour(72);
  const mid = `l2-msg-${Date.now()}-a`;
  await db.query("select public.sla_action_progress_with_forecast_by_email($1,$2,'Frente B replanejada', $3::timestamptz, $4)", [U.RESP, a, f, mid]);
  await asSuper();
  assert((await one("select status from public.sla_actions where id = $1", [a])).status === "IN_PROGRESS");
  const ev = await one("select origin, provider_message_id, forecast_at from public.sla_action_followup_events where sla_action_id = $1 and event_type = 'FORECAST_RECORDED'", [a]);
  assert(ev.origin === "EMAIL" && ev.provider_message_id === mid, JSON.stringify(ev));
  assert((await countAudit("SLA_ACTION_FORECAST_RECORDED", a)) === 1 && (await countAudit("SLA_ACTION_PROGRESS_BY_EMAIL", a)) === 1, "auditorias");
  await asWorker();
  await expectRefused(db.query("select public.sla_action_progress_with_forecast_by_email($1,$2,'Frente B replanejada', $3::timestamptz, $4)", [U.RESP, a, f, mid]), "MESSAGE_ALREADY_APPLIED");
  await asSuper();
  assert((await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1", [a])).c === 1, "duplicou");
  // fluxo antigo (sem previsão) continua funcionando e não registra evento de previsão
  const b = await newSlaAction({ assumed: false });
  await asWorker();
  await db.query("select public.sla_action_progress_with_forecast_by_email($1,$2,'Sem previsão por enquanto', null, $3)", [U.RESP, b, `l2-msg-${Date.now()}-b`]);
  await asSuper();
  assert((await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1", [b])).c === 0);
});
await check("F4 e-mail: remetente LEITURA/sem responsabilidade é recusado e NADA é gravado (nem previsão)", async () => {
  const a = await newSlaAction({ assumed: false });
  await asWorker();
  for (const who of ["LEITURA", "COLAB"]) {
    await expectRefused(db.query("select public.sla_action_progress_with_forecast_by_email($1,$2,'tentativa', $3::timestamptz, $4)", [U[who], a, hour(24), `l2-msg-${Date.now()}-${who}`]), ["READ_ONLY_PROFILE", "ACTION_ACCESS_DENIED"]);
  }
  await asSuper();
  const r = await one("select (select count(*)::int from public.sla_action_followup_events where sla_action_id = $1) ev, (select status from public.sla_actions where id = $1) st", [a]);
  assert(r.ev === 0 && r.st === "PENDING", JSON.stringify(r));
});
await check("F5 o decisor do runner de e-mail escolhe a RPC com previsão só quando a previsão é VÁLIDA", async () => {
  const mk = (forecast) => ({ actorUserId: U.RESP, command: "IN_PROGRESS", note: "n", forecast });
  assert(rpcFor("SLA_ACTION", mk({ status: "VALID", iso: hour(5) }), "id", "m", null)[0] === "sla_action_progress_with_forecast_by_email");
  assert(rpcFor("SLA_ACTION", mk({ status: "MISSING" }), "id", "m", null)[0] === "sla_action_progress_by_email");
});

// ---------------- alerta de risco: previsão pela tela é auditada; e-mail não duplica ----------------
const rule = (riskLevel) => ({
  id: `rule-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 2, respondDeadlineValue: null,
  completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 2, notifyByEmail: true, requiresAcknowledgmentConfirmation: false,
  requiresDelayJustification: false, isDefault: false, active: true,
});
const rules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule);
const responsibles = [{ id: "r", projectId: P, area: AREA, responsibleDirectUserId: U.RESP, secondaryResponsibleUserId: null, escalation1UserId: U.GESTOR, escalation2UserId: null, boardUserId: U.DIR, updatedAt: new Date().toISOString() }];
const policyFor = (riskLevel) => resolveMatrixPolicy({ rules, responsibles, settings: null, area: AREA, riskLevel });
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: Object.values(U), senderDomain: "axion.com.br" };
const recipients = new Map(Object.values(U).map((id, i) => [id, { userId: id, name: `L${i + 1}`, email: `l2${i + 1}@axion.com.br`, membershipStatus: "ACTIVE" }]));
async function newCase({ riskLevel = "HIGH", caseStatus = "OPEN", caseState = "OPEN" } = {}) {
  await asSuper();
  seq += 1;
  const sla = await newSlaAction({ risk: riskLevel });
  const id = `00000000-0000-4000-8000-0000000e2${String(seq).padStart(3, "0")}`;
  await db.query("insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id, status, state, closed_at, resolved_at, resolved_by_user_id) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),$3,$4,'Atraso L2',$5,$6,$7,$8,$9, case when $8 = 'CLOSED' then now() end, case when $9 = 'RESOLVED' then now() end, case when $9 = 'RESOLVED' then $7::uuid end)", [id, P, AREA, riskLevel, `fp-l2-${seq}-${Date.now()}`, sla, U.RESP, caseStatus, caseState]);
  return { id, sla, riskLevel };
}
let minute = 0;
async function snapshotOf(c) {
  const r = await one("select * from public.risk_alert_cases where id = $1", [c.id]);
  return {
    id: r.id, projectId: r.project_id, sourceType: r.source_type, sourceId: r.source_id, riskLevel: r.risk_level, state: r.state, currentLevel: r.current_level,
    topLevelReachedAt: r.top_level_reached_at, currentResponsibleUserId: r.current_responsible_user_id, previousResponsibleUserId: r.previous_responsible_user_id,
    slaActionId: r.sla_action_id, title: r.title, reference: r.reference, activeForward: null, escalatedLevels: [],
  };
}
await check("R1 alerta de risco: EM ANDAMENTO + previsão pela TELA grava forecast_at no evento e auditoria RISK_ALERT_FORECAST_RECORDED (um por evento)", async () => {
  const c = await newCase();
  minute += 1;
  const t = applyAlertAction({
    now: new Date(Date.now() + minute * 1000).toISOString(), snapshot: await snapshotOf(c), action: "TAKING_ACTION", actorUserId: U.RESP, origin: "WEB",
    payload: { text: "Replanejamento em andamento.", forecastAt: new Date(Date.now() + 5 * 86400000).toISOString() },
    policy: policyFor("HIGH"), config, recipients, eligibleForwardUserIds: [U.GESTOR, U.DIR, U.COLAB, U.RESP, U.ADMIN],
  });
  assert(t.ok, `máquina recusou: ${t.code} ${t.message}`);
  const body = {
    actionType: t.action, actorUserId: U.RESP, actionLinkTokenHash: null, summary: t.summary, events: t.events.map((e) => ({ ...e, actorUserId: e.actorUserId ?? U.RESP })),
    caseUpdate: t.caseUpdate, forward: t.forward, closeActiveForwardAs: t.closeActiveForwardAs, escalation: t.escalation, outbox: t.outbox,
  };
  await asUser(U.RESP);
  await db.query("select public.record_risk_alert_action($1, 'OPEN', $2::jsonb)", [c.id, JSON.stringify(body)]);
  await asSuper();
  const evs = (await db.query("select id, forecast_at, origin from public.risk_alert_action_events where case_id = $1 and forecast_at is not null", [c.id])).rows;
  assert(evs.length === 1 && evs[0].origin === "WEB", JSON.stringify(evs));
  assert((await countAudit("RISK_ALERT_FORECAST_RECORDED", c.id)) === 1, "auditoria da previsão pela tela ausente");
});
await check("R2 previsão de e-mail (origem EMAIL, inserida pelo worker) NÃO duplica a auditoria que o app já grava", async () => {
  const c = await newCase();
  await asWorker();
  await db.query("insert into public.risk_alert_action_events (project_id, case_id, action_type, actor_type, actor_user_id, origin, from_state, to_state, forecast_at, idempotency_key) values ($1,$2,'REPLY_RECEIVED','USER',$3,'EMAIL','OPEN','OPEN', now() + interval '2 days', $4)", [P, c.id, U.RESP, `${c.id}:FORECAST_REPLY:msg-l2`]);
  await asSuper();
  assert((await countAudit("RISK_ALERT_FORECAST_RECORDED", c.id)) === 0);
});

// ---------------- acompanhamento por eventos ----------------
async function snapshotSide() {
  return one(`select
    (select count(*)::int from public.sla_action_escalations) esc,
    (select count(*)::int from public.risk_alert_outbox) outbox,
    (select md5(string_agg(a::text, '|' order by a.id)) from public.sla_actions a) acts`);
}
await check("E1 previsão vencida de ação ABERTA no nível DIRETORIA gera 1 evento FORECAST_OVERDUE + auditoria; sem escalonamento novo, sem outbox, ação intacta; reexecução é idempotente", async () => {
  const a = await newSlaAction({ level: "DIRETORIA", status: "ESCALATED" });
  await asUser(U.ADMIN);
  await db.query("select public.sla_action_record_forecast($1, $2::timestamptz, 'Diretoria acompanha')", [a, hour(2)]);
  await asSuper();
  const before = await snapshotSide();
  const early = (await one("select public.sla_followup_run($1::timestamptz) c", [hour(1)])).c; // ainda não venceu
  assert(early === 0, `venceu antes da hora: ${early}`);
  const c1 = (await one("select public.sla_followup_run($1::timestamptz) c", [hour(3)])).c;
  assert(c1 >= 1, `esperava >=1, veio ${c1}`);
  const c2 = (await one("select public.sla_followup_run($1::timestamptz) c", [hour(4)])).c;
  assert(c2 === 0, `reexecução duplicou: ${c2}`);
  assert((await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1 and event_type = 'FORECAST_OVERDUE'", [a])).c === 1);
  assert((await countAudit("SLA_ACTION_FORECAST_OVERDUE", a)) === 1);
  const after = await snapshotSide();
  assert(JSON.stringify(before) === JSON.stringify(after), `efeito colateral: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
});
await check("E2 ação concluída/cancelada não gera evento; nova previsão após o vencimento reabre o ciclo (novo evento só quando essa vencer)", async () => {
  const a = await newSlaAction();
  await asUser(U.RESP);
  await db.query("select public.sla_action_record_forecast($1, $2::timestamptz, 'x')", [a, hour(1)]);
  await asSuper();
  await db.query("update public.sla_actions set status = 'COMPLETED', completed_at = now(), completed_by_user_id = $2, completion_note = 'ok concluído' where id = $1", [a, U.RESP]).catch(async () => {
    await db.query("update public.sla_actions set status = 'CANCELLED' where id = $1", [a]);
  });
  const st = (await one("select status from public.sla_actions where id = $1", [a])).status;
  assert(["COMPLETED", "CANCELLED"].includes(st), `status ${st}`);
  await db.query("select public.sla_followup_run($1::timestamptz)", [hour(5)]);
  assert((await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1 and event_type = 'FORECAST_OVERDUE'", [a])).c === 0, "evento para ação encerrada");

  const b = await newSlaAction();
  await asUser(U.RESP);
  await db.query("select public.sla_action_record_forecast($1, $2::timestamptz, 'p1')", [b, hour(1)]);
  await asSuper();
  await db.query("select public.sla_followup_run($1::timestamptz)", [hour(2)]);
  await asUser(U.RESP);
  await db.query("select public.sla_action_record_forecast($1, $2::timestamptz, 'p2')", [b, hour(48)]);
  await asSuper();
  await db.query("select public.sla_followup_run($1::timestamptz)", [hour(3)]); // p2 ainda não venceu: nada novo
  assert((await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1 and event_type = 'FORECAST_OVERDUE'", [b])).c === 1);
  await db.query("select public.sla_followup_run($1::timestamptz)", [hour(50)]);
  assert((await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1 and event_type = 'FORECAST_OVERDUE'", [b])).c === 2);
});
await check("E3 notificação do acompanhamento DESLIGADA por padrão (política) e as funções de acompanhamento não são chamáveis por anon/authenticated", async () => {
  assert((await one("select public.sla_followup_notification_allowed($1) v", [P])).v === false);
  for (const sig of ["public.sla_followup_run(timestamptz)", "public.sla_followup_overdue_forecasts(timestamptz)", "public.sla_followup_notification_allowed(uuid)", "public.sla_action_progress_with_forecast_by_email(uuid,uuid,text,timestamptz,text)", "public.sla_action_record_forecast_core(uuid,uuid,timestamptz,text,text,text,boolean)"]) {
    const r = await one("select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u", [sig]);
    assert(r.a === false && r.u === false, `${sig}: ${JSON.stringify(r)}`);
  }
  const r = await one("select has_function_privilege('anon','public.sla_action_record_forecast(uuid,timestamptz,text)','execute') a, has_function_privilege('authenticated','public.sla_action_record_forecast(uuid,timestamptz,text)','execute') u");
  assert(r.a === false && r.u === true, JSON.stringify(r));
});
await check("E4 RLS: membro lê os eventos do acompanhamento do seu projeto; escrita direta pelo cliente é recusada", async () => {
  const a = await newSlaAction();
  await asUser(U.RESP);
  await db.query("select public.sla_action_record_forecast($1, $2::timestamptz, 'rls')", [a, hour(10)]);
  await db.exec("set role authenticated");
  const seen = (await one("select count(*)::int c from public.sla_action_followup_events where sla_action_id = $1", [a])).c;
  assert(seen === 1, `membro viu ${seen}`);
  await expectRefused(db.exec(`insert into public.sla_action_followup_events (project_id, sla_action_id, event_type, forecast_at, origin) values ('${P}','${a}','FORECAST_RECORDED', now(), 'WEB')`), "permission denied");
  await db.exec("reset role");
  await asSuper();
});

// ---------------- guardas de consistência ----------------
await check("C1 guarda: ação SLA de alerta de risco JÁ RESOLVIDO/FECHADO não escala (status ESCALATED ou nível mais alto); caso aberto escala normalmente; nenhum dado é alterado pela recusa", async () => {
  const closed = await newCase({ caseStatus: "CLOSED", caseState: "RESOLVED" });
  const open = await newCase();
  await asSuper();
  await db.exec("select set_config('acc.allow_escalation_update','true',false)");
  const before = await one("select status, current_escalation_level l from public.sla_actions where id = $1", [closed.sla]);
  await expectRefused(db.query("update public.sla_actions set status = 'ESCALATED', current_escalation_level = 'ESCALAO_1' where id = $1", [closed.sla]), "ESCALATION_RISK_CASE_CLOSED");
  await expectRefused(db.query("update public.sla_actions set current_escalation_level = 'DIRETORIA' where id = $1", [closed.sla]), "ESCALATION_RISK_CASE_CLOSED");
  const after = await one("select status, current_escalation_level l from public.sla_actions where id = $1", [closed.sla]);
  assert(JSON.stringify(before) === JSON.stringify(after));
  await db.query("update public.sla_actions set status = 'ESCALATED', current_escalation_level = 'ESCALAO_1' where id = $1", [open.sla]);
  // concluir a ação de um caso fechado continua permitido
  await db.query("update public.sla_actions set status = 'CANCELLED' where id = $1", [closed.sla]);
  await db.exec("select set_config('acc.allow_escalation_update','',false)");
});
await check("C2 relatório sla_followup_consistency_issues: detecta ESCALATED de risco fechado (dado legado), nível não elevado, DIRETORIA sem previsão, previsão vencida aberta e nível de risco divergente", async () => {
  await asSuper();
  const legacy = await newCase({ caseStatus: "CLOSED", caseState: "RESOLVED" });
  await db.exec("alter table public.sla_actions disable trigger sla_actions_closed_risk_case_escalation_guard"); // simula dado legado (anterior à guarda)
  await db.exec("select set_config('acc.allow_escalation_update','true',false)");
  await db.query("update public.sla_actions set status = 'ESCALATED', current_escalation_level = 'DIRETORIA' where id = $1", [legacy.sla]);
  const noLevel = await newSlaAction({ status: "ESCALATED" });
  const top = await newSlaAction({ level: "DIRETORIA", status: "ESCALATED" });
  const diverg = await newCase({ riskLevel: "HIGH" });
  await db.query("update public.risk_alert_cases set risk_level = 'MEDIUM' where id = $1", [diverg.id]);
  await db.exec("select set_config('acc.allow_escalation_update','',false)");
  await db.exec("alter table public.sla_actions enable trigger sla_actions_closed_risk_case_escalation_guard");
  const codes = async (id) => (await db.query("select issue_code from public.sla_followup_consistency_issues where sla_action_id = $1", [id])).rows.map((r) => r.issue_code);
  assert((await codes(legacy.sla)).includes("ESCALATED_RISK_CASE_CLOSED"), "ESCALATED_RISK_CASE_CLOSED");
  assert((await codes(noLevel)).includes("ESCALATED_LEVEL_NOT_RAISED"), "ESCALATED_LEVEL_NOT_RAISED");
  assert((await codes(top)).includes("TOP_LEVEL_NO_FORECAST"), "TOP_LEVEL_NO_FORECAST");
  assert((await codes(diverg.sla)).includes("RISK_LEVEL_DIVERGENT"), "RISK_LEVEL_DIVERGENT");
  await asUser(U.ADMIN);
  await db.query("select public.sla_action_record_forecast($1, $2::timestamptz, 'x')", [top, hour(1)]);
  await asSuper();
  assert(!(await codes(top)).includes("TOP_LEVEL_NO_FORECAST"), "previsão registrada deveria sair do relatório");
  await db.query("select public.sla_followup_run($1::timestamptz)", [hour(3)]);
  assert((await codes(top)).includes("FORECAST_OVERDUE_OPEN"), "FORECAST_OVERDUE_OPEN");
  const g = await one("select has_table_privilege('anon','public.sla_followup_consistency_issues','select') a, has_table_privilege('authenticated','public.sla_followup_consistency_issues','select') u");
  assert(g.a === false && g.u === true, JSON.stringify(g));
});

await check("D1 auditoria por e-mail: ENVIAR PARA grava SLA_ACTION_FORWARDED_BY_EMAIL com a mensagem de origem (RESOLVIDO/EM ANDAMENTO já gravavam); reprocessar a mensagem não duplica", async () => {
  const a = await newSlaAction({ assumed: false });
  await asWorker();
  const mid = `l2-fwd-${Date.now()}`;
  await db.query("select public.sla_action_forward_by_email($1,$2,$3,'Reatribuição pedida por e-mail', $4)", [U.ADMIN, a, U.GESTOR, mid]);
  await expectRefused(db.query("select public.sla_action_forward_by_email($1,$2,$3,'Reatribuição pedida por e-mail', $4)", [U.ADMIN, a, U.GESTOR, mid]), "MESSAGE_ALREADY_APPLIED");
  await asSuper();
  const rows = (await db.query("select detail from public.audit_log_entries where action = 'SLA_ACTION_FORWARDED_BY_EMAIL' and entity_id = $1", [a])).rows;
  assert(rows.length === 1 && rows[0].detail.includes(mid), JSON.stringify(rows));
  assert((await one("select responsible_user_id r from public.sla_actions where id = $1", [a])).r === U.GESTOR);
});
await check("D2 matriz de cobertura da auditoria por e-mail: toda função *_by_email de decisão SLA/resumo/contrato grava audit_log_entries e recibo por mensagem", async () => {
  const r = (await db.query(`select proname, prosrc ~ 'audit_log_entries' aud, prosrc ~ 'email_reply_claim_receipt' rec from pg_proc
    where pronamespace = 'public'::regnamespace and proname in ('sla_action_complete_by_email','sla_action_progress_by_email','sla_action_forward_by_email','submit_weekly_alert_digest_item_by_email','save_contract_alert_batch_item_response_by_email')`)).rows;
  assert(r.length === 5, `inventário: ${r.length}`);
  const gaps = r.filter((x) => !x.aud || !x.rec).map((x) => x.proname);
  assert(gaps.length === 0, `sem auditoria/recibo: ${gaps.join(",")}`);
});

// ---------------- SLAs aprovados × código/Matriz (evidência, NÃO altera) ----------------
await check("M1 matriz padrão do código: CRÍTICO 1h corrida e ALTO 4h úteis conferem; MÉDIO (1 dia útil) e BAIXO (3 dias úteis) DIVERGEM da tabela aprovada (2 e 5) — decisão pendente do usuário, comportamento preservado", async () => {
  const { DEFAULT_SLA_MATRIX } = await import("../apps/web/lib/sla/default-matrix.ts");
  const m = DEFAULT_SLA_MATRIX;
  assert(m.CRITICAL.timeUnit === "CLOCK_HOURS" && m.CRITICAL.assumeDeadlineValue === 1, "CRÍTICO");
  assert(m.HIGH.timeUnit === "BUSINESS_HOURS" && m.HIGH.assumeDeadlineValue === 4, "ALTO");
  // Estado ATUAL (não aprovado): travado aqui para que qualquer mudança seja deliberada e acompanhada da decisão do usuário.
  assert(m.MEDIUM.timeUnit === "BUSINESS_DAYS" && m.MEDIUM.assumeDeadlineValue === 1, "MÉDIO atual = 1 dia útil (aprovado: 2)");
  assert(m.LOW.timeUnit === "BUSINESS_DAYS" && m.LOW.assumeDeadlineValue === 3, "BAIXO atual = 3 dias úteis (aprovado: 5)");
});

console.log("");
console.log(`Resultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
