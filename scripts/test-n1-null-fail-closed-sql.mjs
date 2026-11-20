// Frente N1 — autorização "NULL falha-fechada" (migrations 20261120151000/153000/190000 + 20261121101000) e
// atomicidade/idempotência. Replay de TODAS as migrations em PGlite (descartável, sem rede, sem e-mail, sem IA).
// Transições de alerta de risco LEGÍTIMAS vêm da máquina de estados real (applyAlertAction) — o mesmo JSON do app.
//
// Perfis: ADMIN, RESP (responsável da área na Matriz), LEITURA, COLAB (membro ativo sem responsabilidade), INATIVO
// (membership INACTIVE), ALHEIO (membro ativo de OUTRA obra), HIST (só aparece em escalonamento histórico e e-mail
// antigo/suprimido), PILOTO (exceção de Nível 2 do piloto registrada e depois REVOGADA), REPORTER (autor do registro SSMA).
//
// Uso: node scripts/test-n1-null-fail-closed-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { applyAlertAction } = await import("../apps/web/lib/risk-alerts/alert-state-machine.ts");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy.ts");

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

const P = "00000000-0000-4000-8000-00000000d000";
const P2 = "00000000-0000-4000-8000-00000000d0ff";
const AREA = "PLANEJAMENTO";
const U = {
  ADMIN: "00000000-0000-4000-8000-00000000d001",
  RESP: "00000000-0000-4000-8000-00000000d002",
  GESTOR: "00000000-0000-4000-8000-00000000d003",
  DIR: "00000000-0000-4000-8000-00000000d004",
  LEITURA: "00000000-0000-4000-8000-00000000d005",
  COLAB: "00000000-0000-4000-8000-00000000d006",
  INATIVO: "00000000-0000-4000-8000-00000000d007",
  ALHEIO: "00000000-0000-4000-8000-00000000d008",
  HIST: "00000000-0000-4000-8000-00000000d009",
  PILOTO: "00000000-0000-4000-8000-00000000d00a",
  REPORTER: "00000000-0000-4000-8000-00000000d00b",
  ADMIN2: "00000000-0000-4000-8000-00000000d00c",
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `n${n}@axion.com.br`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `N${n}`, `n${n}@axion.com.br`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-N1', 'N1 (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01'),
    ('${P2}', 'SIM-N1B', 'N1 outra obra (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.DIR}', 'GESTOR', 'ACTIVE', 'DIRETORIA'),
    ('${P}', '${U.LEITURA}', 'LEITURA', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.COLAB}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.INATIVO}', 'ADMINISTRADOR', 'INACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.HIST}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.PILOTO}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.REPORTER}', 'COLABORADOR', 'ACTIVE', 'SSMA/ESG'),
    ('${P2}', '${U.ALHEIO}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P2}', '${U.ADMIN2}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO');
  insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id)
    values ('${P}', '${AREA}', '${U.RESP}', '${U.GESTOR}', '${U.DIR}', '${U.ADMIN}');
  -- exceção do piloto (Nível 2) registrada por humano e depois REVOGADA: não vale mais como credencial
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail, occurred_at) values
    ('${P}', 'USER', '${U.ADMIN}', 'RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET', 'PROJECT_RISK_ALERT_AREA_LEVEL', '${P}:${AREA}:LEVEL_2', 'substituto ${U.PILOTO}', now() - interval '2 days'),
    ('${P}', 'USER', '${U.ADMIN}', 'RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_UNSET', 'PROJECT_RISK_ALERT_AREA_LEVEL', '${P}:${AREA}:LEVEL_2', 'revogado ${U.PILOTO}', now() - interval '1 day');
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
// Executa a chamada dentro de uma transação desfeita (para provar o defeito antigo sem sujar a base).
async function inRolledBack(fn) {
  await db.exec("begin");
  try {
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

// ======================= Alerta de risco =======================
const rule = (riskLevel) => ({
  id: `rule-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 2, respondDeadlineValue: null,
  completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 2, notifyByEmail: true, requiresAcknowledgmentConfirmation: false,
  requiresDelayJustification: false, isDefault: false, active: true,
});
const rules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule);
const responsibles = [{ id: "r", projectId: P, area: AREA, responsibleDirectUserId: U.RESP, secondaryResponsibleUserId: null, escalation1UserId: U.GESTOR, escalation2UserId: null, boardUserId: U.DIR, updatedAt: "2026-11-20T00:00:00Z" }];
const policyFor = (riskLevel) => resolveMatrixPolicy({ rules, responsibles, settings: null, area: AREA, riskLevel });
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: Object.values(U), senderDomain: "axion.com.br" };
const recipients = new Map(Object.values(U).map((id, i) => [id, { userId: id, name: `N${i + 1}`, email: `n${i + 1}@axion.com.br`, membershipStatus: "ACTIVE" }]));

let seq = 0;
async function newCase({ responsible = null, riskLevel = "MEDIUM" } = {}) {
  await asSuper();
  seq += 1;
  const sla = `00000000-0000-4000-8000-0000000d1${String(seq).padStart(3, "0")}`;
  const id = `00000000-0000-4000-8000-0000000d2${String(seq).padStart(3, "0")}`;
  await db.query("insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação do caso',$3,$4,$5, now() + interval '2 hours','SYSTEM')", [sla, P, riskLevel, AREA, responsible]);
  await db.query("insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),$3,$4,'Atraso',$5,$6,$7)", [id, P, AREA, riskLevel, `fp-n1-${seq}`, sla, responsible]);
  // e-mails antigos ao HIST: um enviado e um suprimido do piloto — nenhum é credencial
  await db.query("insert into public.risk_alert_outbox (project_id, case_id, risk_level, notification_type, recipient_user_id, scheduled_for, status, sent_at, idempotency_key) values ($1,$2,$3,'IMMEDIATE',$4, now() - interval '3 days','SENT', now() - interval '3 days', $5)", [P, id, riskLevel, U.HIST, `${id}:old-sent`]);
  await db.query("insert into public.risk_alert_outbox (project_id, case_id, risk_level, notification_type, recipient_user_id, scheduled_for, status, suppression_reason, idempotency_key) values ($1,$2,$3,'ESCALATION',$4, now() - interval '2 days','SUPPRESSED','PILOT_RECIPIENT_SUPPRESSED', $5)", [P, id, riskLevel, U.HIST, `${id}:old-supp`]);
  // escalonamento histórico notificado ao HIST
  await db.query("insert into public.sla_action_escalations (action_id, project_id, from_level, to_level, reason, notified_user_id, escalated_at) values ($1,$2,'RESPONSAVEL','ESCALAO_1','NO_ACKNOWLEDGMENT',$3, now() - interval '2 days')", [sla, P, U.HIST]);
  return { id, sla, riskLevel };
}
async function snapshotOf(c) {
  const r = await one("select * from public.risk_alert_cases where id = $1", [c.id]);
  return {
    id: r.id, projectId: r.project_id, sourceType: r.source_type, sourceId: r.source_id, riskLevel: r.risk_level, state: r.state, currentLevel: r.current_level,
    topLevelReachedAt: r.top_level_reached_at, currentResponsibleUserId: r.current_responsible_user_id, previousResponsibleUserId: r.previous_responsible_user_id,
    slaActionId: r.sla_action_id, title: r.title, reference: r.reference, activeForward: null, escalatedLevels: [],
  };
}
let minute = 0;
async function transitionFor(c, action, payload, actor) {
  minute += 1;
  const t = applyAlertAction({
    now: new Date(Date.UTC(2026, 10, 21, 12, minute)).toISOString(), snapshot: await snapshotOf(c), action, actorUserId: actor, origin: "WEB", payload,
    policy: policyFor(c.riskLevel), config, recipients, eligibleForwardUserIds: [U.GESTOR, U.DIR, U.COLAB, U.RESP, U.ADMIN],
  });
  assert(t.ok, `máquina de estados recusou: ${t.code} ${t.message}`);
  return t;
}
const body = (t, actor) => ({
  actionType: t.action, actorUserId: actor, actionLinkTokenHash: null, summary: t.summary,
  events: t.events.map((e) => ({ ...e, actorUserId: e.actorUserId ?? actor })),
  caseUpdate: t.caseUpdate, forward: t.forward, closeActiveForwardAs: t.closeActiveForwardAs, escalation: t.escalation, outbox: t.outbox,
});
const rpc = (c, expected, payload) => db.query("select public.record_risk_alert_action($1, $2, $3::jsonb) as r", [c.id, expected, JSON.stringify(payload)]);
const caseState = async (c) => one("select state, current_responsible_user_id cur, previous_responsible_user_id prev, (select count(*)::int from public.risk_alert_action_events e where e.case_id = c.id) events, (select count(*)::int from public.risk_alert_outbox o where o.case_id = c.id) outbox from public.risk_alert_cases c where id = $1", [c.id]);
const TAKING = { text: "Replanejamento da frente B em andamento.", forecastAt: "2026-11-25" };

await check("R1 caso SEM responsável (atual e anterior nulos): LEITURA, COLABORADOR sem papel, INATIVO, usuário de OUTRA obra, destinatário antigo/suprimido + escalonamento histórico e exceção do piloto REVOGADA — todos recusados, nada gravado", async () => {
  const c = await newCase({ responsible: null });
  const t = body(await transitionFor(c, "TAKING_ACTION", TAKING, U.RESP), U.RESP);
  const before = await caseState(c);
  for (const [who, refusal] of [
    ["LEITURA", "sem permissão"], ["COLAB", "sem permissão"], ["HIST", "sem permissão"], ["PILOTO", "sem permissão"],
    ["INATIVO", "Sem acesso a este projeto"], ["ALHEIO", "Sem acesso a este projeto"],
  ]) {
    await asUser(U[who]);
    const forged = { ...t, actorUserId: U[who], events: t.events.map((e) => ({ ...e, actorUserId: U[who] })) };
    await expectRefused(rpc(c, before.state, forged), [refusal, "Usuário sem membership ACTIVE"]);
  }
  const after = await caseState(c);
  assert(JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
});
await check("R2 mesmo caso sem responsável: responsável da área na Matriz e ADMINISTRADOR AGEM (a correção não bloqueia quem tem direito)", async () => {
  const c = await newCase({ responsible: null });
  await asUser(U.RESP);
  await rpc(c, "OPEN", body(await transitionFor(c, "TAKING_ACTION", TAKING, U.RESP), U.RESP));
  assert((await caseState(c)).state === "IN_PROGRESS");
  const c2 = await newCase({ responsible: null });
  await asUser(U.ADMIN);
  await rpc(c2, "OPEN", body(await transitionFor(c2, "TAKING_ACTION", TAKING, U.ADMIN), U.ADMIN));
  assert((await caseState(c2)).state === "IN_PROGRESS");
});
await check("R3 worker (service_role) com autor do e-mail sem papel no alerta (LEITURA / destinatário antigo) é recusado", async () => {
  const c = await newCase({ responsible: null });
  for (const who of ["LEITURA", "HIST"]) {
    const t = body(await transitionFor(c, "TAKING_ACTION", TAKING, U[who]), U[who]);
    await asWorker();
    await expectRefused(rpc(c, "OPEN", { ...t, events: t.events.map((e) => ({ ...e, origin: "EMAIL" })) }), "sem permissão");
  }
  assert((await caseState(c)).events === 0);
});

// ---- 20261121101000: checagens da revalidação P0 que resultavam NULL ----
const DEF_151000 = (() => {
  const s = read("20261120151000_risk_alert_action_no_outbox_authorization.sql").replace(/\r\n/g, "\n");
  return s.slice(s.indexOf("create or replace function public.record_risk_alert_action("), s.indexOf("alter function public.record_risk_alert_action"));
})();
await check("R4 TOMANDO PROVIDÊNCIAS com currentResponsibleUserId = null (apagaria o responsável): RECUSADO; na versão 20261120151000 passava", async () => {
  const c = await newCase({ responsible: U.RESP });
  await asUser(U.RESP);
  const t = body(await transitionFor(c, "TAKING_ACTION", TAKING, U.RESP), U.RESP);
  const forged = { ...t, caseUpdate: { ...t.caseUpdate, currentResponsibleUserId: null } };
  const old = await inRolledBack(async () => {
    await asSuper();
    await db.exec(DEF_151000);
    await asUser(U.RESP);
    await rpc(c, "OPEN", forged);
    return (await caseState(c)).cur;
  });
  assert(old === null, "esperava demonstrar o defeito antigo (responsável apagado)");
  await asUser(U.RESP);
  await expectRefused(rpc(c, "OPEN", forged), "responsável do alerta incoerente");
  const after = await caseState(c);
  assert(after.cur === U.RESP && after.state === "OPEN" && after.events === 0, JSON.stringify(after));
});
await check("R5 ENVIAR P/ com previousResponsibleUserId = null ou responsibleUserId = null: RECUSADO; na versão 20261120151000 passava", async () => {
  const c = await newCase({ responsible: U.RESP });
  await asUser(U.RESP);
  const t = body(await transitionFor(c, "FORWARD", { targetUserId: U.COLAB, text: "Frente B assume." }, U.RESP), U.RESP);
  for (const field of ["previousResponsibleUserId", "responsibleUserId"]) {
    const forged = { ...t, caseUpdate: { ...t.caseUpdate, [field]: null } };
    const oldOk = await inRolledBack(async () => {
      await asSuper();
      await db.exec(DEF_151000);
      await asUser(U.RESP);
      await rpc(c, "OPEN", forged);
      return true;
    });
    assert(oldOk, `defeito antigo (${field})`);
    await asUser(U.RESP);
    await expectRefused(rpc(c, "OPEN", forged), field === "previousResponsibleUserId" ? "responsável anterior incoerente" : "só ENVIAR P/ troca");
  }
  const after = await caseState(c);
  assert(after.state === "OPEN" && after.cur === U.RESP && after.events === 0, JSON.stringify(after));
  // a transição legítima continua passando
  await rpc(c, "OPEN", t);
  const ok = await caseState(c);
  assert(ok.cur === U.COLAB && ok.prev === U.RESP, JSON.stringify(ok));
});
await check("R6 outbox com destinatário nulo ou tipo ausente: recusado na trava de destinatário (antes só a NOT NULL da tabela segurava)", async () => {
  const c = await newCase({ responsible: U.RESP });
  await asUser(U.RESP);
  const t = body(await transitionFor(c, "TAKING_ACTION", TAKING, U.RESP), U.RESP);
  const base = { riskLevel: "MEDIUM", idempotencyKey: `${c.id}:forjado`, matrixRuleSnapshot: {}, payloadSummary: {} };
  await expectRefused(rpc(c, "OPEN", { ...t, outbox: [{ ...base, notificationType: "ACTION_CONFIRMATION", recipientUserId: null }] }), "destinatário de e-mail não autorizado");
  await expectRefused(rpc(c, "OPEN", { ...t, outbox: [{ ...base, recipientUserId: U.RESP }] }), "destinatário de e-mail não autorizado");
  await expectRefused(rpc(c, "OPEN", { ...t, outbox: [{ ...base, notificationType: "ESCALATION", recipientUserId: U.PILOTO }] }), "destinatário de e-mail não autorizado");
  const after = await caseState(c);
  assert(after.events === 0 && after.outbox === 2, JSON.stringify(after));
});
await check("R7 atomicidade: falha DEPOIS de gravar eventos (chave de outbox inválida) desfaz tudo — nenhum evento, outbox ou mudança de estado", async () => {
  const c = await newCase({ responsible: U.RESP });
  await asUser(U.RESP);
  const t = body(await transitionFor(c, "TAKING_ACTION", TAKING, U.RESP), U.RESP);
  const before = await caseState(c);
  await expectRefused(rpc(c, "OPEN", { ...t, outbox: [{ riskLevel: "MEDIUM", notificationType: "ACTION_CONFIRMATION", recipientUserId: U.RESP, idempotencyKey: "outro-caso:1" }] }), "Chave de outbox inválida");
  assert(JSON.stringify(await caseState(c)) === JSON.stringify(before));
});
await check("R8 idempotência: a mesma transição enviada duas vezes grava UMA vez (a repetição é recusada sem efeito)", async () => {
  const c = await newCase({ responsible: U.RESP });
  await asUser(U.RESP);
  const t = body(await transitionFor(c, "TAKING_ACTION", TAKING, U.RESP), U.RESP);
  await rpc(c, "OPEN", t);
  const first = await caseState(c);
  await expectRefused(rpc(c, "OPEN", t), ["Estado do alerta mudou", "Ação já registrada"]);
  await expectRefused(rpc(c, "IN_PROGRESS", t), ["Evento fora do estado atual", "Ação já registrada", "Transição inválida"]);
  assert(JSON.stringify(await caseState(c)) === JSON.stringify(first), "repetição alterou o caso");
});

// ======================= Ações SLA =======================
async function newAction(responsible) {
  await asSuper();
  seq += 1;
  const id = `00000000-0000-4000-8000-0000000d3${String(seq).padStart(3, "0")}`;
  await db.query("insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação',$3,$4,$5, now() + interval '2 hours','SYSTEM')", [id, P, "MEDIUM", AREA, responsible]);
  await db.query("insert into public.sla_action_escalations (action_id, project_id, from_level, to_level, reason, notified_user_id, escalated_at) values ($1,$2,'RESPONSAVEL','ESCALAO_1','NO_ACKNOWLEDGMENT',$3, now() - interval '1 day')", [id, P, U.HIST]);
  return id;
}
const slaRow = (id) => one("select status, responsible_user_id, acknowledged_at from public.sla_actions where id = $1", [id]);
await check("A1 ação SLA SEM responsável: LEITURA, COLABORADOR, escalonado histórico, INATIVO e usuário de outra obra não assumem/iniciam/concluem/encaminham; nada muda", async () => {
  const id = await newAction(null);
  for (const [who, code] of [["LEITURA", "ACTION_ACCESS_DENIED"], ["COLAB", "ACTION_ACCESS_DENIED"], ["HIST", "ACTION_ACCESS_DENIED"], ["INATIVO", "PROJECT_ACCESS_DENIED"], ["ALHEIO", "PROJECT_ACCESS_DENIED"]]) {
    await asUser(U[who]);
    await expectRefused(db.query("select public.sla_action_assume($1)", [id]), code);
    await expectRefused(db.query("select public.sla_action_start($1)", [id]), code);
    await expectRefused(db.query("select public.sla_action_complete($1, 'Concluída pela frente B.')", [id]), code);
    await expectRefused(db.query("select public.sla_action_forward($1, $2, 'Frente B assume.')", [id, U.COLAB]), code);
  }
  const r = await slaRow(id);
  assert(r.status === "PENDING" && r.responsible_user_id === null && r.acknowledged_at === null, JSON.stringify(r));
});
await check("A2 ação SLA sem responsável: ADMINISTRADOR assume; responsável LEITURA não age; responsável COLABORADOR age", async () => {
  const id = await newAction(null);
  await asUser(U.ADMIN);
  await db.query("select public.sla_action_assume($1)", [id]);
  assert((await slaRow(id)).acknowledged_at !== null);
  const l = await newAction(U.LEITURA);
  await asUser(U.LEITURA);
  await expectRefused(db.query("select public.sla_action_assume($1)", [l]), "ACTION_ACCESS_DENIED");
  const c = await newAction(U.COLAB);
  await asUser(U.COLAB);
  await db.query("select public.sla_action_assume($1)", [c]);
  assert((await slaRow(c)).acknowledged_at !== null);
});
await check("A3 sessão sem usuário nas RPCs de ação SLA: AUTH_REQUIRED", async () => {
  const id = await newAction(null);
  await asSuper();
  await expectRefused(db.query("select public.sla_action_assume($1)", [id]), "AUTH_REQUIRED");
});

// ======================= Link de e-mail (ledger) =======================
await check("M1 ledger de ação por link de e-mail: autor INATIVO, de OUTRA obra ou nulo é recusado pela trava (NOT_ACTIVE_MEMBER); LEITURA continua READ_ONLY_PROFILE", async () => {
  const id = await newAction(U.RESP);
  await asSuper();
  let k = 0;
  const insert = async (actor, action = "ACKNOWLEDGE") => {
    k += 1;
    const tok = (await one("insert into public.email_alert_action_tokens (project_id, alert_kind, alert_id, action, token_hash, intended_recipient_email, effective_recipient_email, expires_at) values ($1,'SLA_ACTION',$2,$3,$4,'a@x.test','a@x.test', now() + interval '7 days') returning id", [P, id, action, `n1-hash-${k}`])).id;
    return db.query("insert into public.email_alert_actions (project_id, alert_kind, alert_id, action, actor_user_id, intended_recipient_email, effective_recipient_email, token_id, idempotency_key) values ($1,'SLA_ACTION',$2,$3,$4,'a@x.test','a@x.test',$5,$6)", [P, id, action, actor, tok, String(tok)]);
  };
  for (const who of ["INATIVO", "ALHEIO"]) await expectRefused(insert(U[who]), ["NOT_ACTIVE_MEMBER"]);
  await expectRefused(insert(null), ["NOT_ACTIVE_MEMBER", "null value"]);
  await expectRefused(insert(U.LEITURA, "ASSUME_RESPONSIBILITY"), "READ_ONLY_PROFILE");
  await insert(U.RESP);
  assert((await one("select count(*)::int n from public.email_alert_actions where alert_id = $1", [id])).n === 1);
});

// ======================= SSMA =======================
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function newRecord({ responsible = null } = {}) {
  await asSuper();
  seq += 1;
  const rec = `00000000-0000-4000-8000-0000000d4${String(seq).padStart(3, "0")}`;
  await db.query("insert into public.ssma_field_records (id, project_id, kind, category, description, location, occurred_at, client_created_at, risk_level, reported_by_user_id, responsible_user_id, due_date) values ($1,$2,'OCORRENCIA','EPI','Sem capacete na frente B.','Pátio', now(), now(), 'MEDIA', $3, $4, current_date + 3)", [rec, P, U.REPORTER, responsible]);
  return rec;
}
let photoSeq = 0;
async function photoArgs(rec) {
  photoSeq += 1;
  const photo = `00000000-0000-4000-8000-0000000d5${String(photoSeq).padStart(3, "0")}`;
  const name = `${P}/ssma-registros/${rec}/${photo}-foto.jpg`;
  await asSuper();
  await db.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [name]);
  return { photo, name, hash: sha(`foto-${photoSeq}`) };
}
await check("S1 registro SSMA SEM responsável: LEITURA, COLABORADOR, escalonado histórico e GESTOR (mínimo 'GESTOR' só é satisfeito por ADMINISTRADOR) não anexam evidência; INATIVO/outra obra sem acesso (web e e-mail); autor e ADMINISTRADOR anexam", async () => {
  const rec = await newRecord({ responsible: null });
  for (const [who, code] of [["LEITURA", "RECORD_ACCESS_DENIED"], ["COLAB", "RECORD_ACCESS_DENIED"], ["HIST", "RECORD_ACCESS_DENIED"], ["GESTOR", "RECORD_ACCESS_DENIED"], ["INATIVO", "PROJECT_ACCESS_DENIED"], ["ALHEIO", "PROJECT_ACCESS_DENIED"]]) {
    const a = await photoArgs(rec);
    await asUser(U[who]);
    await expectRefused(db.query("select public.ssma_field_record_register_photo($1,$2,$3,'EVIDENCIA_ACAO',$4,'foto.jpg','image/jpeg',100,$5)", [U[who], a.photo, rec, a.name, a.hash]), code);
    // mesmo ator pelo caminho do e-mail (worker, sem sessão)
    await asWorker();
    await expectRefused(db.query("select public.ssma_field_record_register_photo_by_email($1,$2,$3,$4,'foto.jpg','image/jpeg',100,$5)", [U[who], a.photo, rec, a.name, a.hash]), code);
  }
  for (const who of ["REPORTER", "ADMIN"]) {
    const a = await photoArgs(rec);
    await asUser(U[who]);
    await db.query("select public.ssma_field_record_register_photo($1,$2,$3,'EVIDENCIA_ACAO',$4,'foto.jpg','image/jpeg',100,$5)", [U[who], a.photo, rec, a.name, a.hash]);
  }
  assert((await one("select count(*)::int n from public.ssma_field_record_photos where record_id = $1", [rec])).n === 2);
});
await check("S2 ação corretiva SSMA: COLABORADOR sem responsabilidade, LEITURA, INATIVO e outra obra não atualizam nem encaminham; responsável LEITURA não encaminha", async () => {
  const rec = await newRecord({ responsible: U.RESP });
  await asSuper();
  const act = (await one("insert into public.ssma_corrective_actions (record_id, project_id, responsible_user_id, due_date) values ($1,$2,$3,current_date + 3) returning id", [rec, P, U.RESP])).id;
  for (const [who, code] of [["COLAB", "ACTION_ACCESS_DENIED"], ["LEITURA", "ACTION_ACCESS_DENIED"], ["HIST", "ACTION_ACCESS_DENIED"], ["INATIVO", "PROJECT_ACCESS_DENIED"], ["ALHEIO", "PROJECT_ACCESS_DENIED"]]) {
    await asUser(U[who]);
    await expectRefused(db.query("select public.ssma_corrective_action_update($1,'ANDAMENTO','Em andamento na frente B.')", [act]), code);
    await expectRefused(db.query("select public.ssma_corrective_action_forward($1,$2,'Frente B assume.')", [act, U.COLAB]), code);
    await asWorker();
    await expectRefused(db.query("select public.ssma_corrective_action_update_by_email($1,$2,'ANDAMENTO','Em andamento na frente B.')", [U[who], act]), code);
  }
  const rec2 = await newRecord({ responsible: U.LEITURA });
  await asSuper();
  const act2 = (await one("insert into public.ssma_corrective_actions (record_id, project_id, responsible_user_id, due_date) values ($1,$2,$3,current_date + 3) returning id", [rec2, P, U.LEITURA])).id;
  await asUser(U.LEITURA);
  await expectRefused(db.query("select public.ssma_corrective_action_forward($1,$2,'Frente B assume.')", [act2, U.COLAB]), "ACTION_ACCESS_DENIED");
  const r = await one("select status, responsible_user_id from public.ssma_corrective_actions where id = $1", [act]);
  assert(r.status === "ABERTA" && r.responsible_user_id === U.RESP, JSON.stringify(r));
});
await check("S3 formulário SSMA: finalizar sem usuário na sessão ou por outro técnico é recusado na AUTORIZAÇÃO (antes só a CHECK da auditoria barrava); o técnico finaliza", async () => {
  await asSuper();
  const sub = (await one("insert into public.ssma_form_submissions (project_id, checklist_slug, checklist_number, checklist_title, drive_folder_name, occurred_at, technician_user_id, checklist_values) values ($1,'dds',2,'DDS','dds', now(), $2, '{}'::jsonb) returning id", [P, U.REPORTER])).id;
  // Versão antiga: a checagem de autorização NÃO recusava sessão sem usuário; só a CHECK da auditoria (actor USER
  // sem actor_user_id) derrubava a transação depois — proteção acidental, não autorização.
  const oldError = await inRolledBack(async () => {
    await db.exec(definitionOf("20260909143000_ssma_submission_persistence.sql", "finalize_ssma_form_submission"));
    await asSuper();
    try {
      await db.query("select public.finalize_ssma_form_submission($1)", [sub]);
      return "passou";
    } catch (error) {
      return String(error.message);
    }
  });
  assert(!oldError.includes("SUBMISSION_ACCESS_DENIED"), `versão antiga já recusava? ${oldError}`);
  await asSuper();
  await expectRefused(db.query("select public.finalize_ssma_form_submission($1)", [sub]), "SUBMISSION_ACCESS_DENIED");
  await asUser(U.COLAB);
  await expectRefused(db.query("select public.finalize_ssma_form_submission($1)", [sub]), "SUBMISSION_ACCESS_DENIED");
  await asUser(U.REPORTER);
  await db.query("select public.finalize_ssma_form_submission($1)", [sub]);
  assert((await one("select status from public.ssma_form_submissions where id = $1", [sub])).status === "SUBMITTED");
});
function definitionOf(file, name) {
  const s = read(file).replace(/\r\n/g, "\n");
  const start = s.indexOf(`create or replace function public.${name}(`);
  const end = s.indexOf("$$;", s.indexOf("as $$", start)) + 3;
  return s.slice(start, end);
}

// ======================= Funções auxiliares =======================
await check("H1 helpers de permissão nunca devolvem NULL (sessão sem usuário, obra inexistente, mínimo NULL): sempre false", async () => {
  await asSuper();
  const r = await one("select public.has_project_permission($1, null) a, public.has_project_permission(null, 'LEITURA') b, public.is_project_member(null) c, public.project_permission_for($1, null, 'LEITURA') d, public.project_member_active_for($1, null) e", [P]);
  for (const [k, v] of Object.entries(r)) assert(v === false, `${k} = ${v}`);
});

console.log("");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
await db.close();
process.exit(failed ? 1 : 0);
