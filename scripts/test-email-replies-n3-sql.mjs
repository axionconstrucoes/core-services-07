// N3 — respostas por e-mail de AÇÃO SLA, ITEM DO RESUMO SEMANAL e ALERTA DE CONTRATO (individual/lote), de ponta a ponta em
// PGlite (replay de TODAS as migrations; sem rede, sem Gmail/Supabase reais, sem e-mails reais).
//  A) SQL (migration 20261121120000): grants (by_email só service_role, núcleos sem execução por usuários), EQUIVALÊNCIA das
//     funções originais refatoradas (app pela sessão), auditoria com o ator real, cada tipo × ação pelas *_by_email,
//     incompleto, mensagem duplicada (recibo transacional), remetente não autorizado / LEITURA / outra obra, evidência ALTO/CRÍTICO,
//     resumo item a item sem quebrar o envio integral, lote nunca conclui ação SLA.
//  B) Fase real (scripts/lib/token-replies-phase.mjs) com adaptador estilo supabase-js + Gmail FAKE: cada tipo × comando,
//     pedidos de complementação, duplicada, LEITURA, outra obra, anexos como evidência, token consumido, confirmação SÓ depois
//     da gravação (falha da RPC => nenhuma confirmação) e entrega das confirmações por provedor FAKE.
// Uso: node scripts/test-email-replies-n3-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

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
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const db = new PGlite();
await db.exec(platform);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
}
await db.exec("insert into storage.buckets (id, name) values ('project-documents', 'project-documents') on conflict do nothing");

const P = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000000b1",
  RESP: "00000000-0000-4000-8000-0000000000b2",
  COLAB2: "00000000-0000-4000-8000-0000000000b3",
  LEITURA: "00000000-0000-4000-8000-0000000000b4",
  OUTRA: "00000000-0000-4000-8000-0000000000b5",
};
const PEOPLE = [
  [U.ADMIN, "Admin Obra", "admin.obra@axion.com.br", "ADMINISTRADOR", P],
  [U.RESP, "Carlos Evandro", "carlos.evandro@axion.com.br", "COLABORADOR", P],
  [U.COLAB2, "Maria Souza", "maria.souza@axion.com.br", "COLABORADOR", P],
  [U.LEITURA, "Leo Leitura", "leo.leitura@axion.com.br", "LEITURA", P],
  [U.OUTRA, "Otto Outra", "otto.outra@axion.com.br", "COLABORADOR", P2],
];
for (const [id, name, email] of PEOPLE) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do update set name = excluded.name, email = excluded.email", [id, name, email]);
}
for (const [id, code] of [[P, "WEG-SIM"], [P2, "OUTRA-SIM"]]) {
  await db.query("insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ($1, $2, $2, 'x', 'x', date '2026-01-01', date '2027-01-01')", [id, code]);
}
for (const [id, , , permission, project] of PEOPLE) {
  await db.query("insert into public.project_memberships (project_id, user_id, permission, status, area) values ($1, $2, $3, 'ACTIVE', 'PLANEJAMENTO')", [project, id, permission]);
}

const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false)`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(code), `esperado ${code}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado erro ${code}, mas a operação passou`);
}
let seq = 0;
const uuid = (prefix) => {
  seq += 1;
  return `00000000-0000-4000-8000-${prefix}${String(seq).padStart(12 - prefix.length, "0")}`;
};
async function newSla({ risk = "MEDIUM", responsible = U.RESP, status = "PENDING", project = P } = {}) {
  const id = uuid("1");
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, status, assume_due_at, complete_due_at, created_by_type) values ($1,$2,'OTHER',$3,$4,'PLANEJAMENTO',$5,$6, now() + interval '1 hour', now() + interval '3 days','SYSTEM')",
    [id, project, `Ação ${id.slice(-4)}`, risk, responsible, status]
  );
  return id;
}
async function newDigest({ recipient = U.RESP, n = 2 } = {}) {
  const actions = [];
  for (let i = 0; i < n; i += 1) actions.push(await newSla({ risk: i === 0 ? "MEDIUM" : "LOW", responsible: recipient }));
  seq += 1;
  const digest = (await one("insert into public.weekly_alert_digests (project_id, recipient_user_id, week_date, status, intended_recipient_email, sent_at) values ($1,$2,date '2026-01-05' + $3::int,'SENT','x@axion.com.br', now()) returning id", [P, recipient, seq])).id;
  const items = [];
  for (const [i, a] of actions.entries()) {
    items.push((await one("insert into public.weekly_alert_digest_items (digest_id, action_id, position, risk_level, title_snapshot) values ($1,$2,$3,$4,'Item') returning id", [digest, a, i + 1, i === 0 ? "MEDIUM" : "LOW"])).id);
  }
  return { digest, actions, items };
}
async function newBatch({ recipient = U.RESP, severities = ["ALTA", "MEDIA"] } = {}) {
  const batch = (await one("insert into public.contract_alert_batches (project_id, recipient_user_id, intended_recipient_email, status, sent_at) values ($1,$2,'carlos.evandro@axion.com.br','SENT', now()) returning id", [P, recipient])).id;
  const items = [];
  for (const [i, sev] of severities.entries()) {
    const ev = uuid("2");
    await db.query("insert into public.contract_events (id, project_id, occurred_at, title, description, source_type, status, created_by_type) values ($1,$2, now(), 'Evento', 'd', 'CONTRATO', 'NOVO', 'SYSTEM')", [ev, P]);
    items.push({ ev, id: (await one("insert into public.contract_alert_batch_items (batch_id,event_id,position,severity,title_snapshot) values ($1,$2,$3,$4,'Alerta') returning id", [batch, ev, i + 1, sev])).id });
  }
  return { batch, items };
}
const audits = async (entityId, action) => (await db.query("select actor_type, actor_user_id, detail from public.audit_log_entries where entity_id = $1 and action = $2 order by occurred_at, id", [entityId, action])).rows;
let msgSeq = 0;
const msg = () => `msg-${(msgSeq += 1)}`;

// ======================================================================= A) SQL
await check("A1 grants: *_by_email só service_role; núcleos sem execução por usuários; originais continuam para authenticated; tabelas novas sem acesso de usuários", async () => {
  const fns = {
    "public.sla_action_progress_by_email(uuid,uuid,text,text)": [false, true],
    "public.sla_action_complete_by_email(uuid,uuid,text,text,text)": [false, true],
    "public.sla_action_forward_by_email(uuid,uuid,uuid,text,text)": [false, true],
    "public.submit_weekly_alert_digest_item_by_email(uuid,uuid,text,uuid,text,text,text)": [false, true],
    "public.save_contract_alert_batch_item_response_by_email(uuid,uuid,text,uuid,text,text,text)": [false, true],
    "public.sla_action_authorize_operation_for(uuid,uuid,text)": [false, null],
    "public.sla_action_assume_core(uuid,uuid)": [false, null],
    "public.sla_action_start_core(uuid,uuid)": [false, null],
    "public.sla_action_complete_core(uuid,uuid,text,uuid,uuid)": [false, null],
    "public.sla_action_forward_core(uuid,uuid,uuid,text)": [false, null],
    "public.weekly_alert_digest_apply_item_core(uuid,boolean,uuid,uuid,uuid,text,uuid,text,text)": [false, null],
    "public.save_contract_alert_batch_item_response_core(uuid,uuid,uuid,text,uuid)": [false, null],
    "public.email_reply_claim_receipt(text,uuid,text,text,uuid,text)": [false, null],
    "public.sla_action_assume(uuid)": [true, null],
    "public.sla_action_start(uuid)": [true, null],
    "public.sla_action_complete(uuid,text,uuid,uuid)": [true, null],
    "public.sla_action_forward(uuid,uuid,text)": [true, null],
    "public.submit_weekly_alert_digest(uuid,jsonb)": [true, null],
    "public.save_contract_alert_batch_item_response(uuid,uuid,text,uuid)": [true, null],
  };
  for (const [fn, [authOk, svcOk]] of Object.entries(fns)) {
    const r = await one(`select has_function_privilege('authenticated', '${fn}', 'execute') as auth, has_function_privilege('anon', '${fn}', 'execute') as anon, has_function_privilege('service_role', '${fn}', 'execute') as svc`);
    assert(r.auth === authOk && r.anon === false && (svcOk === null || r.svc === svcOk), `${fn}: ${JSON.stringify(r)}`);
  }
  for (const t of ["email_reply_command_receipts", "email_reply_confirmations"]) {
    const r = await one(`select relrowsecurity as rls, has_table_privilege('authenticated', 'public.${t}', 'select') as a, has_table_privilege('anon', 'public.${t}', 'select') as n from pg_class where oid = 'public.${t}'::regclass`);
    assert(r.rls && !r.a && !r.n, `${t}: ${JSON.stringify(r)}`);
  }
});
await check("A2 EQUIVALÊNCIA SLA (app pela sessão): sem sessão AUTH_REQUIRED; assumir/iniciar/concluir/encaminhar pelo responsável; LEITURA e outro colaborador recusados; auditoria com auth.uid()", async () => {
  const a = await newSla({ risk: "HIGH" });
  await as(null);
  await expectError(db.query("select public.sla_action_assume($1)", [a]), "AUTH_REQUIRED");
  await as(U.COLAB2);
  await expectError(db.query("select public.sla_action_assume($1)", [a]), "ACTION_ACCESS_DENIED");
  await as(U.LEITURA);
  await expectError(db.query("select public.sla_action_assume($1)", [a]), "ACTION_ACCESS_DENIED");
  await as(U.RESP);
  await db.query("select public.sla_action_assume($1)", [a]);
  await expectError(db.query("select public.sla_action_assume($1)", [a]), "ACTION_ALREADY_ACKNOWLEDGED");
  await db.query("select public.sla_action_start($1)", [a]);
  await expectError(db.query("select public.sla_action_complete($1,'  ')", [a]), "COMPLETION_NOTE_REQUIRED");
  await db.query("select public.sla_action_complete($1,'Feito')", [a]); // app: regra inalterada (nota curta e sem evidência aceitas)
  const r = await one("select status, completed_by_user_id, acknowledged_by_user_id from public.sla_actions where id = $1", [a]);
  assert(r.status === "COMPLETED" && r.completed_by_user_id === U.RESP && r.acknowledged_by_user_id === U.RESP, JSON.stringify(r));
  const started = await audits(a, "ACTION_STARTED");
  assert(started.length === 1 && started[0].actor_user_id === U.RESP, JSON.stringify(started));
  const b = await newSla();
  await as(U.RESP);
  await expectError(db.query("select public.sla_action_forward($1,$2,'abc')", [b, U.COLAB2]), "FORWARD_REASON_REQUIRED");
  await expectError(db.query("select public.sla_action_forward($1,$2,'Motivo válido')", [b, U.LEITURA]), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await db.query("select public.sla_action_forward($1,$2,'Motivo válido')", [b, U.COLAB2]);
  const re = await audits(b, "ACTION_REASSIGNED");
  assert(re.length === 1 && re[0].actor_type === "USER" && re[0].actor_user_id === U.RESP, JSON.stringify(re));
  await as(null);
});
await check("A3 SLA EM ANDAMENTO por e-mail: assume + estudando (IN_PROGRESS), providência auditada com o ATOR real; prazos e nível intactos", async () => {
  const a = await newSla();
  const before = await one("select assume_due_at, complete_due_at, current_escalation_level from public.sla_actions where id = $1", [a]);
  await as(null);
  await expectError(db.query("select public.sla_action_progress_by_email($1,$2,'',$3)", [U.RESP, a, msg()]), "NOTE_REQUIRED");
  await db.query("select public.sla_action_progress_by_email($1,$2,'Levantando orçamento — Previsão 25/11',$3)", [U.RESP, a, msg()]);
  const r = await one("select status, acknowledged_by_user_id, assume_due_at, complete_due_at, current_escalation_level from public.sla_actions where id = $1", [a]);
  assert(r.status === "IN_PROGRESS" && r.acknowledged_by_user_id === U.RESP, JSON.stringify(r));
  assert(String(r.assume_due_at) === String(before.assume_due_at) && String(r.complete_due_at) === String(before.complete_due_at) && r.current_escalation_level === before.current_escalation_level, "prazos/nível intactos");
  const started = await audits(a, "ACTION_STARTED");
  assert(started.length === 1 && started[0].actor_type === "USER" && started[0].actor_user_id === U.RESP, JSON.stringify(started));
  const prog = await audits(a, "SLA_ACTION_PROGRESS_BY_EMAIL");
  assert(prog.length === 1 && prog[0].actor_user_id === U.RESP && /Levantando orçamento/.test(prog[0].detail), JSON.stringify(prog));
  await db.query("select public.sla_action_progress_by_email($1,$2,'Orçamento recebido',$3)", [U.RESP, a, msg()]);
  assert((await audits(a, "SLA_ACTION_PROGRESS_BY_EMAIL")).length === 2 && (await audits(a, "ACTION_STARTED")).length === 1);
  const leak = (await one("select coalesce(current_setting('acc.email_actor', true), '') as v")).v;
  assert(leak === "", `configuração do ator não vaza: ${leak}`);
});
await check("A4 SLA RESOLVIDO por e-mail: descrição >= 10; ALTO/CRÍTICO exige evidência; conclui com o ator; mensagem duplicada => MESSAGE_ALREADY_APPLIED", async () => {
  const hi = await newSla({ risk: "CRITICAL" });
  await as(null);
  await expectError(db.query("select public.sla_action_complete_by_email($1,$2,'curto',null,$3)", [U.RESP, hi, msg()]), "COMPLETION_NOTE_REQUIRED");
  await expectError(db.query("select public.sla_action_complete_by_email($1,$2,'Isolamento executado e conferido',null,$3)", [U.RESP, hi, msg()]), "EVIDENCE_REQUIRED");
  const m = msg();
  await db.query("select public.sla_action_complete_by_email($1,$2,'Isolamento executado e conferido','anexo:abc:foto.jpg',$3)", [U.RESP, hi, m]);
  const r = await one("select status, completed_by_user_id, completion_note from public.sla_actions where id = $1", [hi]);
  assert(r.status === "COMPLETED" && r.completed_by_user_id === U.RESP && /Evidência: anexo:abc/.test(r.completion_note), JSON.stringify(r));
  await expectError(db.query("select public.sla_action_complete_by_email($1,$2,'Isolamento executado e conferido','x',$3)", [U.RESP, hi, m]), "MESSAGE_ALREADY_APPLIED");
  const lo = await newSla({ risk: "LOW" });
  await db.query("select public.sla_action_complete_by_email($1,$2,'Documento revisado e enviado',null,$3)", [U.RESP, lo, msg()]);
  assert((await one("select status from public.sla_actions where id = $1", [lo])).status === "COMPLETED", "BAIXO sem evidência conclui");
  const m2 = msg();
  await expectError(db.query("select public.sla_action_complete_by_email($1,$2,'Documento revisado e enviado',null,$3)", [U.RESP, lo, m2]), "ACTION_CLOSED");
  assert((await one("select count(*)::int as n from public.email_reply_command_receipts where provider_message_id = $1", [m2])).n === 0, "falha desfaz o recibo");
});
await check("A5 SLA por e-mail: LEITURA / outra obra / não responsável / sem ator / sem id recusados; alerta de risco recusado; ENVIAR PARA com motivo e destino elegível (REASSIGNED com o ator)", async () => {
  const a = await newSla();
  await as(null);
  await expectError(db.query("select public.sla_action_progress_by_email($1,$2,'x',$3)", [U.LEITURA, a, msg()]), "READ_ONLY_PROFILE");
  await expectError(db.query("select public.sla_action_progress_by_email($1,$2,'x',$3)", [U.OUTRA, a, msg()]), "PROJECT_ACCESS_DENIED");
  await expectError(db.query("select public.sla_action_progress_by_email($1,$2,'x',$3)", [U.COLAB2, a, msg()]), "ACTION_ACCESS_DENIED");
  await expectError(db.query("select public.sla_action_progress_by_email(null,$1,'x',$2)", [a, msg()]), "AUTH_REQUIRED");
  await expectError(db.query("select public.sla_action_progress_by_email($1,$2,'x',null)", [U.RESP, a]), "MESSAGE_ID_REQUIRED");
  const linked = await newSla({ risk: "HIGH" });
  await db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id) values ($1,'INGESTION_ALERT',gen_random_uuid(),'PLANEJAMENTO','HIGH','Caso',$2,$3)", [P, `fp-n3-${linked}`, linked]);
  await expectError(db.query("select public.sla_action_progress_by_email($1,$2,'x',$3)", [U.RESP, linked, msg()]), "RISK_CASE_LINKED");
  await expectError(db.query("select public.sla_action_forward_by_email($1,$2,$3,'abc',$4)", [U.RESP, a, U.COLAB2, msg()]), "FORWARD_REASON_REQUIRED");
  await expectError(db.query("select public.sla_action_forward_by_email($1,$2,$3,'Motivo válido',$4)", [U.RESP, a, U.LEITURA, msg()]), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await db.query("select public.sla_action_forward_by_email($1,$2,$3,'Maria assume a frente B',$4)", [U.RESP, a, U.COLAB2, msg()]);
  assert((await one("select responsible_user_id from public.sla_actions where id = $1", [a])).responsible_user_id === U.COLAB2);
  const re = await audits(a, "ACTION_REASSIGNED");
  const fw = await audits(a, "ACTION_FORWARDED");
  assert(re.length === 1 && re[0].actor_type === "USER" && re[0].actor_user_id === U.RESP && fw[0].actor_user_id === U.RESP && /Maria assume/.test(fw[0].detail), JSON.stringify({ re, fw }));
  const b = await newSla();
  await db.query("select public.sla_action_forward_by_email($1,$2,$3,null,$4)", [U.ADMIN, b, U.COLAB2, msg()]);
  assert((await one("select responsible_user_id from public.sla_actions where id = $1", [b])).responsible_user_id === U.COLAB2, "Administrador encaminha sem motivo (regra do app)");
});
await check("A6 EQUIVALÊNCIA do resumo integral (web) + resposta POR ITEM por e-mail: integral preserva item já respondido; último item por e-mail fecha o resumo", async () => {
  const d1 = await newDigest();
  await as(U.RESP);
  await expectError(db.query("select public.submit_weekly_alert_digest($1,$2)", [d1.digest, JSON.stringify([{ actionId: d1.actions[0], resolution: "AWARE" }])]), "Responda todos os itens");
  await expectError(db.query("select public.submit_weekly_alert_digest($1,$2)", [d1.digest, JSON.stringify(d1.actions.map((a) => ({ actionId: a, resolution: "RESOLVED", note: "curta" })))]), "mínimo de 10");
  const ok = await one("select public.submit_weekly_alert_digest($1,$2) as r", [d1.digest, JSON.stringify(d1.actions.map((a) => ({ actionId: a, resolution: "STUDYING" })))]);
  assert(ok.r.respondedItems === 2, JSON.stringify(ok));
  assert((await one("select status from public.weekly_alert_digests where id = $1", [d1.digest])).status === "RESPONDED");
  assert((await one("select status from public.sla_actions where id = $1", [d1.actions[0]])).status === "IN_PROGRESS");
  await as(null);

  const d2 = await newDigest({ n: 3 });
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'STUDYING',null,null,null,$3)", [U.RESP, d2.items[0], msg()]), "NOTE_REQUIRED");
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'curta',null,$3)", [U.RESP, d2.items[0], msg()]), "mínimo de 10");
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'Conferido e resolvido',null,$3)", [U.COLAB2, d2.items[0], msg()]), "Você não tem permissão");
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'Conferido e resolvido',null,$3)", [U.LEITURA, d2.items[0], msg()]), "READ_ONLY_PROFILE");
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'Conferido e resolvido',null,$3)", [U.OUTRA, d2.items[0], msg()]), "PROJECT_ACCESS_DENIED");
  const m = msg();
  const r1 = await one("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'Conferido e resolvido',null,$3) as r", [U.RESP, d2.items[0], m]);
  assert(r1.r.answered === 1 && r1.r.total === 3 && r1.r.complete === false, JSON.stringify(r1));
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'Conferido e resolvido',null,$3)", [U.RESP, d2.items[0], m]), "MESSAGE_ALREADY_APPLIED");
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'RESOLVED',null,'Conferido e resolvido',null,$3)", [U.RESP, d2.items[0], msg()]), "ITEM_ALREADY_RESPONDED");
  const s = await one("select status, completed_by_user_id, completion_note from public.sla_actions where id = $1", [d2.actions[0]]);
  assert(s.status === "COMPLETED" && s.completed_by_user_id === U.RESP && /Conferido e resolvido/.test(s.completion_note), JSON.stringify(s));
  await as(U.RESP);
  const full = await one("select public.submit_weekly_alert_digest($1,$2) as r", [d2.digest, JSON.stringify(d2.actions.map((a) => ({ actionId: a, resolution: "AWARE" })))]);
  assert(full.r.respondedItems === 3, JSON.stringify(full));
  assert((await one("select response from public.weekly_alert_digest_items where id = $1", [d2.items[0]])).response === "RESOLVED", "item por e-mail preservado");
  assert(/preservados/.test((await audits(d2.digest, "WEEKLY_ALERT_DIGEST_RESPONDED"))[0].detail));
  await as(null);

  const d3 = await newDigest({ n: 2 });
  await db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'STUDYING',null,'Verificando com o fornecedor',null,$3)", [U.RESP, d3.items[0], msg()]);
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'FORWARDED',$3,'abc',null,$4)", [U.RESP, d3.items[1], U.COLAB2, msg()]), "motivo do direcionamento");
  const last = await one("select public.submit_weekly_alert_digest_item_by_email($1,$2,'FORWARDED',$3,'Maria cuida do contrato',null,$4) as r", [U.RESP, d3.items[1], U.COLAB2, msg()]);
  assert(last.r.complete === true, JSON.stringify(last));
  const dg = await one("select status, responded_by_user_id from public.weekly_alert_digests where id = $1", [d3.digest]);
  assert(dg.status === "RESPONDED" && dg.responded_by_user_id === U.RESP, JSON.stringify(dg));
  assert((await one("select responsible_user_id from public.sla_actions where id = $1", [d3.actions[1]])).responsible_user_id === U.COLAB2);
  assert((await audits(d3.actions[1], "ACTION_REASSIGNED"))[0].actor_user_id === U.RESP, "reatribuição com o ator real");
  await expectError(db.query("select public.submit_weekly_alert_digest_item_by_email($1,$2,'STUDYING',null,'x',null,$3)", [U.RESP, d3.items[0], msg()]), "já foi respondido");
});
await check("A7 EQUIVALÊNCIA do lote (save_* pela sessão) e por e-mail por item: destinatário ou ADMIN; LEITURA/outra obra recusados; nota/motivo; nunca toca ação SLA; duplicada recusada", async () => {
  const b = await newBatch();
  await as(U.COLAB2);
  await expectError(db.query("select public.save_contract_alert_batch_item_response($1,$2,'RESOLVIDO',null)", [b.batch, b.items[0].ev]), "não tem permissão");
  await as(U.ADMIN);
  const web = await one("select public.save_contract_alert_batch_item_response($1,$2,'EM_ANDAMENTO',null) as r", [b.batch, b.items[0].ev]);
  assert(web.r.answered === 1 && web.r.total === 2, JSON.stringify(web));
  await as(null);
  const slaBefore = await one("select count(*)::int as n from public.sla_actions where status = 'COMPLETED'");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'RESOLVIDO',null,'curta',null,$3)", [U.RESP, b.items[1].id, msg()]), "COMPLETION_NOTE_REQUIRED");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'EM_ANDAMENTO',null,null,null,$3)", [U.RESP, b.items[1].id, msg()]), "NOTE_REQUIRED");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'RESOLVIDO',null,'Medição conferida e paga',null,$3)", [U.LEITURA, b.items[1].id, msg()]), "READ_ONLY_PROFILE");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'RESOLVIDO',null,'Medição conferida e paga',null,$3)", [U.OUTRA, b.items[1].id, msg()]), "PROJECT_ACCESS_DENIED");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'RESOLVIDO',null,'Medição conferida e paga',null,$3)", [U.COLAB2, b.items[1].id, msg()]), "não tem permissão");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'ENVIADO_PARA',$3,'Motivo válido',null,$4)", [U.RESP, b.items[1].id, U.LEITURA, msg()]), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'ENVIADO_PARA',$3,'ok',null,$4)", [U.RESP, b.items[1].id, U.COLAB2, msg()]), "FORWARD_REASON_REQUIRED");
  const m = msg();
  const r = await one("select public.save_contract_alert_batch_item_response_by_email($1,$2,'RESOLVIDO',null,'Medição conferida e paga','anexo:abc:nf.pdf',$3) as r", [U.RESP, b.items[1].id, m]);
  assert(r.r.complete === true, JSON.stringify(r));
  const item = await one("select action, answered_by_user_id from public.contract_alert_batch_items where id = $1", [b.items[1].id]);
  assert(item.action === "RESOLVIDO" && item.answered_by_user_id === U.RESP, JSON.stringify(item));
  const au = await audits(b.items[1].ev, "CONTRACT_ALERT_ITEM_RESPONDED_BY_EMAIL");
  assert(au.length === 1 && au[0].actor_user_id === U.RESP && /Medição conferida/.test(au[0].detail) && /anexo:abc/.test(au[0].detail), JSON.stringify(au));
  await expectError(db.query("select public.save_contract_alert_batch_item_response_by_email($1,$2,'RESOLVIDO',null,'Medição conferida e paga',null,$3)", [U.RESP, b.items[1].id, m]), "MESSAGE_ALREADY_APPLIED");
  assert((await one("select status from public.contract_alert_batches where id = $1", [b.batch])).status === "SENT", "resposta final do lote continua pela página");
  assert((await one("select count(*)::int as n from public.sla_actions where status = 'COMPLETED'")).n === slaBefore.n, "lote nunca conclui ação SLA");
});

// ======================================================================= B) fase real (adaptador + Gmail fake)
function createPgSupabase(database, { failRpc = new Set() } = {}) {
  class Builder {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.cols = "*";
      this.filters = [];
      this.params = [];
      this.orders = [];
      this.rangeArgs = null;
      this.limitN = null;
      this.single = null;
      this.returning = null;
    }
    p(v) {
      this.params.push(v);
      return `$${this.params.length}`;
    }
    select(cols = "*") {
      if (this.op === "select") this.cols = cols;
      else this.returning = cols;
      return this;
    }
    eq(c, v) { this.filters.push(`${c} = ${this.p(v)}`); return this; }
    neq(c, v) { this.filters.push(`${c} <> ${this.p(v)}`); return this; }
    gte(c, v) { this.filters.push(`${c} >= ${this.p(v)}`); return this; }
    lt(c, v) { this.filters.push(`${c} < ${this.p(v)}`); return this; }
    is(c, v) { this.filters.push(v === null ? `${c} is null` : `${c} is ${v}`); return this; }
    in(c, vs) { this.filters.push(vs.length ? `${c} in (${vs.map((v) => this.p(v)).join(",")})` : "false"); return this; }
    order(c, { ascending = true } = {}) { this.orders.push(`${c} ${ascending ? "asc" : "desc"}`); return this; }
    range(a, b) { this.rangeArgs = [a, b]; return this; }
    limit(n) { this.limitN = n; return this; }
    maybeSingle() { this.single = "maybe"; return this; }
    single() { this.single = "one"; return this; }
    insert(rows) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    update(obj) { this.op = "update"; this.obj = obj; return this; }
    where() { return this.filters.length ? ` where ${this.filters.join(" and ")}` : ""; }
    async exec() {
      try {
        let sql;
        if (this.op === "select") {
          sql = `select ${this.cols} from public.${this.table}${this.where()}${this.orders.length ? ` order by ${this.orders.join(", ")}` : ""}`;
          if (this.rangeArgs) sql += ` limit ${this.rangeArgs[1] - this.rangeArgs[0] + 1} offset ${this.rangeArgs[0]}`;
          else if (this.limitN) sql += ` limit ${this.limitN}`;
        } else if (this.op === "insert") {
          const cols = Object.keys(this.rows[0]);
          const values = this.rows.map((r) => `(${cols.map((c) => this.p(r[c] === undefined ? null : r[c])).join(",")})`).join(",");
          sql = `insert into public.${this.table} (${cols.join(",")}) values ${values}${this.returning ? ` returning ${this.returning}` : ""}`;
        } else {
          const sets = Object.entries(this.obj).map(([c, v]) => `${c} = ${this.p(v)}`).join(", ");
          // os filtros já usaram parâmetros: renumeração simples (sets primeiro)
          sql = `update public.${this.table} set ${sets}${this.where()}${this.returning ? ` returning ${this.returning}` : ""}`;
        }
        const { rows } = await database.query(sql, this.params);
        if (this.single === "maybe") return { data: rows[0] ?? null, error: null };
        if (this.single === "one") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not single" } };
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }
    }
    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  }
  const calls = { rpc: [] };
  return {
    calls,
    from: (table) => new Builder(table),
    async rpc(name, args) {
      calls.rpc.push(name);
      if (failRpc.has(name)) return { data: null, error: { message: "falha simulada de conexão" } };
      const keys = Object.keys(args);
      try {
        const { rows } = await database.query(`select * from public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`, keys.map((k) => args[k]));
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message } };
      }
    },
    storage: {
      from: () => ({
        async upload(name) {
          try {
            await putObject(name);
            return { data: { path: name }, error: null };
          } catch (error) {
            return { data: null, error: { message: error.message } };
          }
        },
      }),
    },
  };
}


const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const b64 = (b) => Buffer.from(b).toString("base64url");
let gmailSeq = 0;
function createFakeGmail() {
  const messages = new Map();
  const attachments = new Map();
  return {
    messages,
    add({ from = "carlos.evandro@axion.com.br", token, body, at = "2026-11-20T12:00:00Z", auth = AUTH_OK, file = null }) {
      gmailSeq += 1;
      const id = `n3-gmail-${gmailSeq}`;
      const parts = [{ mimeType: "text/plain", body: { data: b64(body) } }];
      if (file) {
        attachments.set(`att-${id}`, file.bytes);
        parts.push({ mimeType: file.mime ?? "application/pdf", filename: file.name ?? "evidencia.pdf", body: { attachmentId: `att-${id}`, size: file.bytes.length } });
      }
      const headers = [
        { name: "From", value: from },
        { name: "To", value: `crm+alerta-${token}@axion.com.br` },
        { name: "Subject", value: "RESOLVIDO [ACC-SLA:X]" },
        { name: "Message-ID", value: `<${id}@mail.axion.com.br>` },
      ];
      if (auth) headers.push({ name: "Authentication-Results", value: auth });
      messages.set(id, { id, threadId: `t-${id}`, internalDate: String(Date.parse(at)), labelIds: ["INBOX"], payload: { mimeType: "multipart/mixed", headers, parts } });
      return id;
    },
    users: {
      messages: {
        list: async () => ({ data: { messages: [...messages.keys()].map((id) => ({ id })) } }),
        get: async ({ id }) => ({ data: messages.get(id) }),
        attachments: { get: async ({ id }) => ({ data: { data: b64(attachments.get(id)) } }) },
      },
    },
  };
}
async function putObject(name) {
  await db.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1) on conflict do nothing", [name]);
}

const { runTokenRepliesPhase } = await import("./lib/token-replies-phase.mjs");
const { deliverEmailReplyConfirmations } = await import("../apps/web/lib/email-replies/token-reply-confirmations");
const { hashReplyToken, generateReplyToken } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const NOW = () => new Date("2026-11-20T13:00:00Z");
async function issue(kind, subjectId, recipient = U.RESP, project = P) {
  const token = generateReplyToken();
  await db.query("insert into public.email_reply_tokens (token_hash, project_id, subject_kind, subject_id, recipient_user_id, expires_at) values ($1,$2,$3,$4,$5, timestamptz '2026-12-20T00:00:00Z')", [hashReplyToken(token), project, kind, subjectId, recipient]);
  return token;
}
const run = (gmail, opts = {}) => runTokenRepliesPhase({ supabase: createPgSupabase(db, opts), gmail, mailbox: "crm@axion.com.br", projectIds: [P, P2], now: NOW, env: opts.env ?? { ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "200" } });
const confirmationOf = (gmailId) => one("select * from public.email_reply_confirmations where inbound_provider_message_id = $1", [gmailId]);
const logOf = (gmailId) => one("select outcome, reason from public.email_reply_inbound_log where flow = 'TOKEN' and provider_message_id = $1", [gmailId]);

await check("B1 SLA × RESOLVIDO / EM ANDAMENTO / ENVIAR PARA pela fase: grava pela RPC *_by_email; confirmação APPLIED depois da gravação; token terminal consumido; segunda rodada idempotente", async () => {
  const r = await newSla();
  const p = await newSla();
  const f = await newSla();
  const gmail = createFakeGmail();
  const gr = gmail.add({ token: await issue("SLA_ACTION", r), body: "RESOLVIDO: cronograma revisado e enviado ao cliente" });
  const gp = gmail.add({ token: await issue("SLA_ACTION", p), body: "EM ANDAMENTO: aguardando o fornecedor\nPrevisão: 25/11/2026" });
  const gf = gmail.add({ token: await issue("SLA_ACTION", f), body: "ENVIAR PARA: Maria Souza\nJustificativa: Maria responde pela frente B" });
  const supa = createPgSupabase(db);
  const s = await runTokenRepliesPhase({ supabase: supa, gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: {} });
  assert(s.processed === 3 && s.errors === 0, JSON.stringify(s));
  assert(["sla_action_complete_by_email", "sla_action_progress_by_email", "sla_action_forward_by_email"].every((fn) => supa.calls.rpc.includes(fn)), JSON.stringify(supa.calls.rpc));
  assert((await one("select status from public.sla_actions where id = $1", [r])).status === "COMPLETED");
  assert((await one("select status from public.sla_actions where id = $1", [p])).status === "IN_PROGRESS");
  assert((await one("select responsible_user_id from public.sla_actions where id = $1", [f])).responsible_user_id === U.COLAB2);
  for (const id of [gr, gp, gf]) {
    const c = await confirmationOf(id);
    assert(c && c.outcome === "APPLIED" && c.recipient_email === "carlos.evandro@axion.com.br" && c.status === "PENDING", JSON.stringify(c));
    assert((await logOf(id)).outcome === "APPLIED");
  }
  assert(/25\/11\/2026/.test((await confirmationOf(gp)).detail_line), "previsão na confirmação");
  assert((await one("select consumed_by_message_id from public.email_reply_tokens where subject_id = $1", [r])).consumed_by_message_id === gr, "RESOLVIDO consome o token");
  assert((await one("select consumed_by_message_id from public.email_reply_tokens where subject_id = $1", [p])).consumed_by_message_id === null, "EM ANDAMENTO não consome");
  const again = await run(gmail);
  assert(again.processed === 0 && again.matched === 0, `segunda rodada idempotente: ${JSON.stringify(again)}`);
});
await check("B2 incompletos => pedido de complementação (nada gravado): sem descrição, sem previsão, sem horário (ALTO), destino ausente, justificativa curta, sem comando", async () => {
  const cases = [
    ["MEDIUM", "RESOLVIDO", "RESOLVE_DESCRIPTION_REQUIRED", /Descreva o que foi feito/],
    ["MEDIUM", "EM ANDAMENTO: tratando", "FORECAST_REQUIRED", /previsão/i],
    ["HIGH", "EM ANDAMENTO: tratando\nPrevisão: 25/11/2026", "IN_PROGRESS_INCOMPLETE", /hor[áa]rio/i],
    ["MEDIUM", "ENVIAR PARA:\nJustificativa: alguém precisa assumir", "TARGET_MISSING", /Informe o destino/],
    ["MEDIUM", "ENVIAR PARA: Maria Souza, ok", "FORWARD_REASON_REQUIRED", /justificativa/i],
    ["MEDIUM", "Oi, vou ver isso amanhã.", "COMMAND_NOT_RECOGNIZED", /Nenhum comando/],
  ];
  const gmail = createFakeGmail();
  const ids = [];
  for (const [risk, body] of cases) {
    const a = await newSla({ risk });
    ids.push([a, gmail.add({ token: await issue("SLA_ACTION", a), body })]);
  }
  const s = await run(gmail);
  assert(s.rejected === cases.length && s.processed === 0, JSON.stringify(s));
  for (const [i, [a, g]] of ids.entries()) {
    const c = await confirmationOf(g);
    assert(c.outcome === "INCOMPLETE" && cases[i][3].test(c.detail_line), `${cases[i][2]}: ${c.detail_line}`);
    assert((await logOf(g)).reason === cases[i][2], `${cases[i][2]} != ${(await logOf(g)).reason}`);
    const st = await one("select status, responsible_user_id from public.sla_actions where id = $1", [a]);
    assert(st.status === "PENDING" && st.responsible_user_id === U.RESP, JSON.stringify(st));
  }
});
await check("B3 SLA ALTO/CRÍTICO: RESOLVIDO sem anexo => pede a evidência (token liberado); com anexo => Storage + email_inbound_attachments + evidência na conclusão", async () => {
  const a = await newSla({ risk: "CRITICAL" });
  const token = await issue("SLA_ACTION", a);
  const gmail = createFakeGmail();
  const g1 = gmail.add({ token, body: "RESOLVIDO: guarda-corpo reinstalado e conferido" });
  const s1 = await run(gmail);
  assert(s1.rejected === 1, JSON.stringify(s1));
  assert((await confirmationOf(g1)).detail_line.includes("evidência ANEXADA"));
  assert((await one("select status from public.sla_actions where id = $1", [a])).status === "PENDING");
  assert((await one("select consumed_by_message_id from public.email_reply_tokens where subject_id = $1", [a])).consumed_by_message_id === null, "token liberado");
  const pdf = Buffer.from("%PDF-1.4 evidencia");
  const g2 = gmail.add({ token, body: "RESOLVIDO: guarda-corpo reinstalado e conferido", file: { bytes: pdf, name: "Relatório final.pdf" }, at: "2026-11-20T12:05:00Z" });
  const s2 = await run(gmail);
  assert(s2.processed === 1, JSON.stringify(s2));
  const sha = createHash("sha256").update(pdf).digest("hex");
  const att = await one("select storage_path from public.email_inbound_attachments where provider_message_id = $1", [g2]);
  assert(att && att.storage_path.startsWith(`${P}/respostas-email-evidencias/sla_action/${a}/${sha}-`), JSON.stringify(att));
  assert((await one("select count(*)::int as n from storage.objects where name = $1", [att.storage_path])).n === 1, "arquivo no Storage");
  const r = await one("select status, completion_note from public.sla_actions where id = $1", [a]);
  assert(r.status === "COMPLETED" && r.completion_note.includes(`anexo:${sha}:`), JSON.stringify(r));
  assert(/1 anexo/.test((await confirmationOf(g2)).detail_line));
});
await check("B4 remetentes: LEITURA, membro de outra obra, colaborador não responsável, domínio externo e sem autenticação => nada grava; explicação só a membro conhecido", async () => {
  const a = await newSla();
  const token = await issue("SLA_ACTION", a);
  const gmail = createFakeGmail();
  const body = "EM ANDAMENTO: tratando\nPrevisão: 25/11/2026";
  const gl = gmail.add({ token, body, from: "leo.leitura@axion.com.br" });
  const go = gmail.add({ token, body, from: "otto.outra@axion.com.br" });
  const gc = gmail.add({ token, body, from: "maria.souza@axion.com.br" });
  const ge = gmail.add({ token, body, from: "carlos.evandro@gmail.com" });
  const gn = gmail.add({ token, body, auth: null });
  const s = await run(gmail);
  assert(s.unauthorized === 5 && s.processed === 0, JSON.stringify(s));
  assert((await one("select status from public.sla_actions where id = $1", [a])).status === "PENDING");
  const reasons = [await logOf(gl), await logOf(go), await logOf(gc), await logOf(ge), await logOf(gn)].map((l) => l.reason).join(",");
  assert(reasons === "SENDER_READ_ONLY,SENDER_NOT_MEMBER,SENDER_NOT_ALLOWED,SENDER_NOT_CORPORATE,AUTH_RESULTS_MISSING", reasons);
  assert((await confirmationOf(gl)) && (await confirmationOf(gc)) && (await confirmationOf(gn)), "membros conhecidos recebem explicação");
  assert(!(await confirmationOf(go)) && !(await confirmationOf(ge)), "desconhecidos: recusa silenciosa auditada");
});
await check("B5 resumo semanal POR ITEM pela fase (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA); item já respondido => recusa explicada", async () => {
  const d = await newDigest({ n: 3 });
  const gmail = createFakeGmail();
  const g1 = gmail.add({ token: await issue("WEEKLY_DIGEST_ITEM", d.items[0]), body: "RESOLVIDO: pedido de compra emitido e aprovado" });
  gmail.add({ token: await issue("WEEKLY_DIGEST_ITEM", d.items[1]), body: "EM ANDAMENTO: cotação em análise\nPrevisão: 27/11/2026" });
  gmail.add({ token: await issue("WEEKLY_DIGEST_ITEM", d.items[2]), body: "ENVIAR PARA: maria.souza@axion.com.br\nJustificativa: compras é com a Maria" });
  const s = await run(gmail);
  assert(s.processed === 3, JSON.stringify(s));
  const items = (await db.query("select response, responded_by_user_id from public.weekly_alert_digest_items where digest_id = $1 order by position", [d.digest])).rows;
  assert(items.map((i) => i.response).join(",") === "RESOLVED,STUDYING,FORWARDED" && items.every((i) => i.responded_by_user_id === U.RESP), JSON.stringify(items));
  assert((await one("select status from public.weekly_alert_digests where id = $1", [d.digest])).status === "RESPONDED");
  assert((await confirmationOf(g1)).outcome === "APPLIED");
  const g4 = gmail.add({ token: await issue("WEEKLY_DIGEST_ITEM", d.items[0]), body: "RESOLVIDO: de novo, tudo certo aqui", at: "2026-11-20T12:30:00Z" });
  const s2 = await run(gmail);
  assert(s2.rejected === 1 && /já foi respondido/.test((await confirmationOf(g4)).detail_line), JSON.stringify(s2));
});
await check("B6 contrato individual (lote de 1) e lote por item pela fase; destinatário de outro lote recusado; lote não vira RESPONDED nem toca SLA", async () => {
  const single = await newBatch({ severities: ["CRITICA"] });
  const multi = await newBatch({ severities: ["ALTA", "MEDIA"] });
  const other = await newBatch({ recipient: U.COLAB2, severities: ["BAIXA"] });
  const gmail = createFakeGmail();
  gmail.add({ token: await issue("CONTRACT_ALERT_ITEM", single.items[0].id), body: "RESOLVIDO: aditivo assinado pelas partes", file: { bytes: Buffer.from("%PDF aditivo"), name: "aditivo.pdf" } });
  gmail.add({ token: await issue("CONTRACT_ALERT_ITEM", multi.items[0].id), body: "EM ANDAMENTO: jurídico revisando a cláusula\nPrevisão: 26/11/2026 10:00" });
  gmail.add({ token: await issue("CONTRACT_ALERT_ITEM", multi.items[1].id), body: "ENVIAR PARA: Maria Souza\nJustificativa: Maria acompanha as medições" });
  const go = gmail.add({ token: await issue("CONTRACT_ALERT_ITEM", other.items[0].id, U.COLAB2), body: "RESOLVIDO: verificado e encerrado" });
  const s = await run(gmail);
  assert(s.processed === 3 && s.unauthorized === 1, JSON.stringify(s));
  const one1 = await one("select action from public.contract_alert_batch_items where id = $1", [single.items[0].id]);
  const m0 = await one("select action from public.contract_alert_batch_items where id = $1", [multi.items[0].id]);
  const m1 = await one("select action, assigned_user_id from public.contract_alert_batch_items where id = $1", [multi.items[1].id]);
  assert(one1.action === "RESOLVIDO" && m0.action === "EM_ANDAMENTO" && m1.action === "ENVIADO_PARA" && m1.assigned_user_id === U.COLAB2, JSON.stringify({ one1, m0, m1 }));
  assert((await logOf(go)).reason === "SENDER_NOT_ALLOWED");
  assert((await one("select count(*)::int as n from public.contract_alert_batches where id in ($1,$2) and status = 'SENT'", [single.batch, multi.batch])).n === 2);
  const au = await audits(single.items[0].ev, "CONTRACT_ALERT_ITEM_RESPONDED_BY_EMAIL");
  assert(au.length === 1 && /anexo:/.test(au[0].detail), JSON.stringify(au));
});
await check("B7 falha desconhecida da RPC => NENHUMA confirmação nem registro (nova tentativa); registro perdido após gravar => confirma sem gravar de novo", async () => {
  const a = await newSla();
  const gmail = createFakeGmail();
  const g = gmail.add({ token: await issue("SLA_ACTION", a), body: "EM ANDAMENTO: revisando projeto\nPrevisão: 25/11/2026" });
  const s1 = await run(gmail, { failRpc: new Set(["sla_action_progress_by_email"]) });
  assert(s1.errors === 1 && s1.processed === 0, JSON.stringify(s1));
  assert(!(await confirmationOf(g)) && !(await logOf(g)), "nada confirmado/registrado");
  const s2 = await run(gmail);
  assert(s2.processed === 1 && (await confirmationOf(g)).outcome === "APPLIED", JSON.stringify(s2));
  await db.query("delete from public.email_reply_inbound_log where provider_message_id = $1", [g]);
  await db.query("delete from public.email_reply_confirmations where inbound_provider_message_id = $1", [g]);
  const s3 = await run(gmail);
  assert(s3.alreadyApplied === 1 && s3.processed === 0, JSON.stringify(s3));
  assert((await audits(a, "SLA_ACTION_PROGRESS_BY_EMAIL")).length === 1, "uma única gravação");
  assert((await confirmationOf(g)).outcome === "APPLIED");
});
await check("B8 entrega das confirmações por provedor FAKE: PENDING => SENT na mesma conversa (In-Reply-To); falha => FAILED com nova tentativa; recusa nunca afirma registro", async () => {
  const sent = [];
  const provider = {
    send: async (input) => {
      if (input.to.startsWith("maria")) throw new Error("falha");
      sent.push(input);
      return { provider: "fake", from: "crm@axion.com.br", providerMessageId: `out-${sent.length}`, providerThreadId: "t", messageIdHeader: "<x>", sentAt: "2026-11-20T13:00:00Z" };
    },
  };
  const pend = (await one("select count(*)::int as n from public.email_reply_confirmations where status = 'PENDING' and recipient_email not like 'maria%'")).n;
  const pendMaria = (await one("select count(*)::int as n from public.email_reply_confirmations where status = 'PENDING' and recipient_email like 'maria%'")).n;
  await db.query("insert into public.email_reply_confirmations (project_id, inbound_provider_message_id, subject_kind, subject_id, recipient_email, outcome, status_label, detail_line) values ($1,'fake-maria','SLA_ACTION','x','maria.souza@axion.com.br','APPLIED','ok',null)", [P]);
  const r = await deliverEmailReplyConfirmations({ client: createPgSupabase(db), provider, limit: 500 });
  assert(r.sent === pend && r.failed === pendMaria + 1, JSON.stringify({ r, pend, pendMaria }));
  assert(sent.every((m) => m.inReplyTo && /^Re: /.test(m.subject)), "mesma conversa");
  const rejected = sent.find((m) => /NÃO foi aplicada/.test(m.text));
  assert(rejected && !/foi REGISTRADA/.test(rejected.text), "recusa nunca afirma registro");
  assert((await one("select status from public.email_reply_confirmations where inbound_provider_message_id = 'fake-maria'")).status === "FAILED");
  const r2 = await deliverEmailReplyConfirmations({ client: createPgSupabase(db), provider, limit: 500 });
  assert(r2.sent === 0 && r2.failed === pendMaria + 1, `retentativa: ${JSON.stringify(r2)}`);
  assert((await one("select count(*)::int as n from public.email_reply_confirmations where status = 'PENDING'")).n === 0);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
