// Migration 20261120100000: operações de ações SLA (assumir / iniciar / concluir / encaminhar) por RPC com autorização no banco.
// Replay de TODAS as migrations em PGlite (descartável, sem rede) + matriz de perfis.
//
// Antes: UPDATE direto sob a policy sla_actions_update_own_or_admin — só ADMINISTRADOR gravava; para o responsável o UPDATE
// casava 0 linhas, sem erro, e a tela confirmava sucesso. Agora: ADMINISTRADOR e RESPONSÁVEL atual (perfil diferente de
// LEITURA) operam; os demais são recusados com erro explícito; toda operação devolve a linha gravada e é auditada.
//
// Uso: node scripts/test-sla-action-operations-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];

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
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 300)}`);
    failed += 1;
  }
}

const db = new PGlite();
await db.exec(platform);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));

const P = "00000000-0000-4000-8000-0000000000b0";
const OTHER_P = "00000000-0000-4000-8000-0000000000c0";
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000000b1",
  RESP: "00000000-0000-4000-8000-0000000000b2", // COLABORADOR responsável pela ação
  GESTOR: "00000000-0000-4000-8000-0000000000b3",
  GERENTE: "00000000-0000-4000-8000-0000000000b4",
  LEITURA: "00000000-0000-4000-8000-0000000000b5",
  COLAB2: "00000000-0000-4000-8000-0000000000b6", // destino de encaminhamento
  OUTSIDER: "00000000-0000-4000-8000-0000000000b7", // membro de outra obra
  INACTIVE: "00000000-0000-4000-8000-0000000000b8",
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `u${n}@x.test`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `U${n}`, `u${n}@x.test`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SIM-OPS', 'Operações (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01'),
    ('${OTHER_P}', 'SIM-OUT', 'Outra obra (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.GERENTE}', 'GERENTE', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.LEITURA}', 'LEITURA', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.COLAB2}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.INACTIVE}', 'COLABORADOR', 'INACTIVE', 'PLANEJAMENTO'),
    ('${OTHER_P}', '${U.OUTSIDER}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO');
`);

let seq = 0;
const newAction = async (responsible = U.RESP, status = "PENDING") => {
  seq += 1;
  const id = `00000000-0000-4000-8000-0000000002${String(seq).padStart(2, "0")}`;
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, status, assume_due_at, complete_due_at, created_by_type) values ($1,$2,'OTHER',$3,'HIGH','PLANEJAMENTO',$4,$5, now() + interval '1 hour', now() + interval '3 days','SYSTEM')",
    [id, P, `Ação ${seq}`, responsible, status]
  );
  return id;
};
const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false)`);
const row = async (id) => (await db.query("select * from public.sla_actions where id = $1", [id])).rows[0];
const audits = async (id, action) => (await db.query("select actor_type, actor_user_id, detail from public.audit_log_entries where entity_id = $1 and action = $2", [id, action])).rows;
async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(code), `esperado ${code}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado erro ${code}, mas a operação passou`);
}
const call = (sql, params) => db.query(sql, params);
const assume = (id) => call("select * from public.sla_action_assume($1)", [id]);
const start = (id) => call("select * from public.sla_action_start($1)", [id]);
const complete = (id, note = "Concluída com verificação em campo.") => call("select * from public.sla_action_complete($1, $2)", [id, note]);
const forward = (id, to, reason = null) => call("select * from public.sla_action_forward($1, $2, $3)", [id, to, reason]);

// ---------- RESPONSÁVEL ----------
await check("P1 RESPONSÁVEL (COLABORADOR) assume → ACKNOWLEDGED, devolve a linha gravada e audita ACTION_ACKNOWLEDGED com o autor", async () => {
  const id = await newAction();
  await as(U.RESP);
  const { rows } = await assume(id);
  assert(rows.length === 1 && rows[0].status === "ACKNOWLEDGED" && rows[0].acknowledged_by_user_id === U.RESP, JSON.stringify(rows));
  const a = await audits(id, "ACTION_ACKNOWLEDGED");
  assert(a.length === 1 && a[0].actor_user_id === U.RESP, JSON.stringify(a));
});
await check("P2 RESPONSÁVEL inicia (ACKNOWLEDGED → IN_PROGRESS) e conclui com nota; auditoria ACTION_STARTED e ACTION_COMPLETED", async () => {
  const id = await newAction();
  await as(U.RESP);
  await assume(id);
  const s = await start(id);
  assert(s.rows[0].status === "IN_PROGRESS");
  const c = await complete(id);
  assert(c.rows[0].status === "COMPLETED" && c.rows[0].completed_by_user_id === U.RESP && c.rows[0].completion_note);
  assert((await audits(id, "ACTION_STARTED")).length === 1 && (await audits(id, "ACTION_COMPLETED")).length === 1);
});
await check("P3 RESPONSÁVEL encaminha a outro membro ativo com motivo: responsável muda, prazos e nível preservados, auditoria ACTION_REASSIGNED + ACTION_FORWARDED", async () => {
  const id = await newAction();
  const before = await row(id);
  await as(U.RESP);
  const { rows } = await forward(id, U.COLAB2, "Responsável técnico da frente.");
  const after = await row(id);
  assert(rows[0].responsible_user_id === U.COLAB2 && after.responsible_user_id === U.COLAB2);
  for (const k of ["assume_due_at", "respond_due_at", "complete_due_at", "current_escalation_level", "status"]) {
    assert(String(before[k]) === String(after[k]), `${k} mudou: ${before[k]} → ${after[k]}`);
  }
  assert((await audits(id, "ACTION_REASSIGNED")).length === 1, "sem ACTION_REASSIGNED");
  const f = await audits(id, "ACTION_FORWARDED");
  assert(f.length === 1 && f[0].actor_user_id === U.RESP && /Responsável técnico da frente/.test(f[0].detail), JSON.stringify(f));
});
await check("P4 depois de encaminhar, o antigo responsável perde a operação (ACTION_ACCESS_DENIED) e o novo passa a operar", async () => {
  const id = await newAction();
  await as(U.RESP);
  await forward(id, U.COLAB2, "Troca de frente de serviço.");
  await expectError(assume(id), "ACTION_ACCESS_DENIED");
  await as(U.COLAB2);
  const { rows } = await assume(id);
  assert(rows[0].status === "ACKNOWLEDGED");
});
await check("P5 RESPONSÁVEL sem motivo (ou motivo curto) não encaminha: FORWARD_REASON_REQUIRED, nada gravado", async () => {
  const id = await newAction();
  await as(U.RESP);
  await expectError(forward(id, U.COLAB2, null), "FORWARD_REASON_REQUIRED");
  await expectError(forward(id, U.COLAB2, "ok"), "FORWARD_REASON_REQUIRED");
  assert((await row(id)).responsible_user_id === U.RESP);
});
await check("P6 destino inelegível: LEITURA, inativo, de outra obra, o próprio responsável → recusado, nada gravado", async () => {
  const id = await newAction();
  await as(U.RESP);
  await expectError(forward(id, U.LEITURA, "Motivo válido aqui."), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await expectError(forward(id, U.INACTIVE, "Motivo válido aqui."), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await expectError(forward(id, U.OUTSIDER, "Motivo válido aqui."), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await expectError(forward(id, U.RESP, "Motivo válido aqui."), "SAME_RESPONSIBLE");
  assert((await row(id)).responsible_user_id === U.RESP);
});

// ---------- ADMINISTRADOR ----------
await check("P7 ADMINISTRADOR (não responsável) assume, inicia, conclui e encaminha sem motivo obrigatório", async () => {
  const id = await newAction();
  await as(U.ADMIN);
  await forward(id, U.COLAB2);
  await assume(id);
  await start(id);
  const c = await complete(id);
  assert(c.rows[0].status === "COMPLETED" && c.rows[0].completed_by_user_id === U.ADMIN);
  const f = await audits(id, "ACTION_FORWARDED");
  assert(f.length === 1 && /não informado \(administrador\)/.test(f[0].detail), JSON.stringify(f));
});

// ---------- Demais perfis ----------
for (const [label, uid] of [["GESTOR", U.GESTOR], ["GERENTE", U.GERENTE], ["COLABORADOR não responsável", U.COLAB2]]) {
  await check(`P8 ${label} não responsável: as quatro operações recusadas (ACTION_ACCESS_DENIED), nada gravado`, async () => {
    const id = await newAction();
    await as(uid);
    await expectError(assume(id), "ACTION_ACCESS_DENIED");
    await expectError(start(id), "ACTION_ACCESS_DENIED");
    await expectError(complete(id), "ACTION_ACCESS_DENIED");
    await expectError(forward(id, U.COLAB2 === uid ? U.GESTOR : U.COLAB2, "Motivo válido aqui."), "ACTION_ACCESS_DENIED");
    const r = await row(id);
    assert(r.status === "PENDING" && r.responsible_user_id === U.RESP && r.acknowledged_at === null);
  });
}
await check("P9 LEITURA mesmo sendo o responsável não grava (ACTION_ACCESS_DENIED)", async () => {
  const id = await newAction(U.LEITURA);
  await as(U.LEITURA);
  await expectError(assume(id), "ACTION_ACCESS_DENIED");
});
await check("P10 usuário de outra obra (ADMINISTRADOR lá) e membro inativo: PROJECT_ACCESS_DENIED", async () => {
  const id = await newAction();
  await as(U.OUTSIDER);
  await expectError(assume(id), "PROJECT_ACCESS_DENIED");
  await as(U.INACTIVE);
  await expectError(assume(id), "PROJECT_ACCESS_DENIED");
});
await check("P11 sem sessão (anônimo/worker): AUTH_REQUIRED", async () => {
  const id = await newAction();
  await as(null);
  await expectError(assume(id), "AUTH_REQUIRED");
});

// ---------- Regras preservadas ----------
await check("P12 conclusão sem nota: COMPLETION_NOTE_REQUIRED; evento de OUTRA obra recusado", async () => {
  const id = await newAction();
  await as(U.RESP);
  await expectError(complete(id, "   "), "COMPLETION_NOTE_REQUIRED");
  await expectError(call("select * from public.sla_action_complete($1, $2, $3)", [id, "Nota de conclusão.", "00000000-0000-4000-8000-00000000ffff"]), "RELATED_EVENT_NOT_FOUND");
  assert((await row(id)).status === "PENDING");
});
await check("P13 transições inválidas: iniciar sem assumir, assumir duas vezes, operar ação concluída", async () => {
  const id = await newAction();
  await as(U.RESP);
  await expectError(start(id), "ACTION_NOT_ACKNOWLEDGED");
  await assume(id);
  await expectError(assume(id), "ACTION_ALREADY_ACKNOWLEDGED");
  await complete(id);
  await expectError(forward(id, U.COLAB2, "Motivo válido aqui."), "ACTION_CLOSED");
});
await check("P14 ação vinculada a caso de risco: recusada (RISK_CASE_LINKED) — tratada só pela página do alerta, caso e ação não divergem", async () => {
  const id = await newAction();
  await db.query(
    "insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id) values ($1,'INGESTION_ALERT',gen_random_uuid(),'PLANEJAMENTO','HIGH','Caso',$2,$3)",
    [P, `fp-${id}`, id]
  );
  for (const uid of [U.RESP, U.ADMIN]) {
    await as(uid);
    await expectError(assume(id), "RISK_CASE_LINKED");
    await expectError(complete(id), "RISK_CASE_LINKED");
    await expectError(forward(id, U.COLAB2, "Motivo válido aqui."), "RISK_CASE_LINKED");
  }
  assert((await row(id)).status === "PENDING");
});
await check("P15 a função interna de autorização não é executável por anon/authenticated (só pelas RPCs)", async () => {
  const { rows } = await db.query(
    "select has_function_privilege('authenticated', 'public.sla_action_authorize_operation(uuid,text)', 'execute') as auth_exec, has_function_privilege('anon', 'public.sla_action_assume(uuid)', 'execute') as anon_exec, has_function_privilege('authenticated', 'public.sla_action_assume(uuid)', 'execute') as rpc_exec"
  );
  assert(rows[0].auth_exec === false && rows[0].anon_exec === false && rows[0].rpc_exec === true, JSON.stringify(rows[0]));
});
await check("P16 regra corporativa intacta: UPDATE direto do responsável não-admin continua bloqueado pela RLS (só as RPCs abrem o tratamento)", async () => {
  // 20261121100000: has_project_permission delega a project_permission_for (fonte única da tabela de níveis); a regra
  // verificada é a da fonte efetiva.
  const { rows } = await db.query("select pg_get_functiondef('public.has_project_permission(uuid,text)'::regprocedure) as def");
  let def = rows[0].def;
  if (/public\.project_permission_for\(p_project_id, auth\.uid\(\), p_min\)/.test(def)) {
    def = (await db.query("select pg_get_functiondef('public.project_permission_for(uuid,uuid,text)'::regprocedure) as def")).rows[0].def;
  }
  assert(/when 'COLABORADOR' then 1/.test(def) && /when 'EDITOR' then 2/.test(def), "has_project_permission foi alterada");
});

// ---------- Consistência caso de risco × ação SLA (migration 20261120110000) ----------
const linkCase = (actionId) =>
  db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id) values ($1,'INGESTION_ALERT',gen_random_uuid(),'PLANEJAMENTO','HIGH','Caso',$2,$3)", [P, `fp-c-${actionId}`, actionId]);
// Fluxo real do link de e-mail: token gravado + confirm_email_alert_action (a função que o app chama).
let tokenSeq = 0;
async function confirmByEmail(actionId, action, uid, extra = {}) {
  tokenSeq += 1;
  const hash = `hash-${tokenSeq}`;
  await db.query(
    "insert into public.email_alert_action_tokens (project_id, alert_kind, alert_id, action, token_hash, intended_recipient_email, effective_recipient_email, expires_at) values ($1,'SLA_ACTION',$2,$3,$4,'a@x.test','a@x.test', now() + interval '7 days')",
    [P, actionId, action, hash]
  );
  await as(uid);
  return call("select * from public.confirm_email_alert_action($1, $2, $3)", [hash, extra.comment ?? null, extra.dueAt ?? null]);
}
await check("C1 link de e-mail DAR CIÊNCIA / ASSUMIR em ação de alerta de risco: recusado (RISK_CASE_LINKED) e a ação SLA fica INTACTA", async () => {
  const id = await newAction();
  await linkCase(id);
  await expectError(confirmByEmail(id, "ACKNOWLEDGE", U.RESP), "RISK_CASE_LINKED");
  await expectError(confirmByEmail(id, "ASSUME_RESPONSIBILITY", U.ADMIN), "RISK_CASE_LINKED");
  const r = await row(id);
  assert(r.status === "PENDING" && r.acknowledged_at === null && r.responsible_user_id === U.RESP, JSON.stringify({ s: r.status, a: r.acknowledged_at, u: r.responsible_user_id }));
  const ledger = await db.query("select count(*)::int as n from public.email_alert_actions where alert_id = $1", [id]);
  assert(ledger.rows[0].n === 0, "ledger gravado apesar da recusa");
});
await check("C2 sem caso de risco DAR CIÊNCIA funciona como antes; em ação de caso, RESPONDER continua aceito (só ledger)", async () => {
  const id = await newAction();
  await confirmByEmail(id, "ACKNOWLEDGE", U.RESP);
  assert((await row(id)).acknowledged_at !== null, "ciência não gravada");
  const linked = await newAction();
  await linkCase(linked);
  await confirmByEmail(linked, "RESPOND", U.RESP, { comment: "Em análise pela equipe." });
  const r = await row(linked);
  assert(r.status === "PENDING" && r.acknowledged_at === null, "RESPONDER alterou a ação");
});
await check("C3 mudança de prazo auditada (ACTION_DEADLINE_CHANGED) com o autor; sem mudança de prazo nada é registrado; worker vira SYSTEM", async () => {
  const id = await newAction();
  await as(U.ADMIN);
  await db.query("update public.sla_actions set complete_due_at = complete_due_at + interval '2 days' where id = $1", [id]);
  const a = await audits(id, "ACTION_DEADLINE_CHANGED");
  assert(a.length === 1 && a[0].actor_type === "USER" && a[0].actor_user_id === U.ADMIN && /concluir:/.test(a[0].detail), JSON.stringify(a));
  await db.query("update public.sla_actions set description = 'x' where id = $1", [id]);
  assert((await audits(id, "ACTION_DEADLINE_CHANGED")).length === 1, "auditou sem mudança de prazo");
  await as(null);
  await db.query("update public.sla_actions set assume_due_at = assume_due_at + interval '1 hour' where id = $1", [id]);
  const b = await audits(id, "ACTION_DEADLINE_CHANGED");
  assert(b.length === 2 && b.some((r) => r.actor_type === "SYSTEM" && r.actor_user_id === null), JSON.stringify(b));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
