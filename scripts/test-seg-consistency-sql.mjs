// Frente P0/P1 (migrations 20261120150000, 20261120151000, 20261120152000): resumo semanal com evidência e travas,
// e-mail de alerta (outbox) deixa de autorizar ação no caso de risco, travas dos links de e-mail para ação encerrada
// e perfil LEITURA, e relatório de divergências caso de risco × ação SLA.
// Replay de TODAS as migrations em PGlite (descartável, sem rede). Transições de risco geradas pela máquina de estados real.
//
// Uso: node scripts/test-seg-consistency-sql.mjs

import { PGlite } from "@electric-sql/pglite";
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
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
}

const P = "00000000-0000-4000-8000-000000000a10";
const AREA = "PLANEJAMENTO";
const U = {
  ADMIN: "00000000-0000-4000-8000-000000000a11",
  RESP: "00000000-0000-4000-8000-000000000a12",
  GESTOR: "00000000-0000-4000-8000-000000000a13",
  DIR: "00000000-0000-4000-8000-000000000a14",
  COLAB: "00000000-0000-4000-8000-000000000a15", // membro sem papel no alerta
  LEITURA: "00000000-0000-4000-8000-000000000a16",
  PILOT2: "00000000-0000-4000-8000-000000000a17", // substituto de Nível 2 do piloto
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `s${n}@axion.com.br`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `S${n}`, `s${n}@axion.com.br`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ('${P}', 'SIM-SEG', 'Segurança (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.DIR}', 'GESTOR', 'ACTIVE', 'DIRETORIA'),
    ('${P}', '${U.COLAB}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.LEITURA}', 'LEITURA', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.PILOT2}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO');
  insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id)
    values ('${P}', '${AREA}', '${U.RESP}', '${U.GESTOR}', '${U.DIR}', '${U.ADMIN}');
`);
const asUser = (uid) => db.exec(`select set_config('app.uid','${uid}',false), set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
const asSuper = () => db.exec(`select set_config('app.uid','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false)`);
async function expectRefused(promise, fragment) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(fragment), `esperado "${fragment}", veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado recusa "${fragment}", mas passou`);
}
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

let seq = 0;
async function newAction({ responsible = U.RESP, risk = "MEDIUM", ssma = false } = {}) {
  seq += 1;
  const id = `00000000-0000-4000-8000-0000000008${String(seq).padStart(2, "0")}`;
  await asSuper();
  let ssmaAction = null;
  if (ssma) {
    const rec = `00000000-0000-4000-8000-0000000009${String(seq).padStart(2, "0")}`;
    ssmaAction = `00000000-0000-4000-8000-000000000b${String(seq).padStart(2, "0")}`;
    await db.query("insert into public.ssma_field_records (id, project_id, kind, category, description, location, occurred_at, client_created_at, risk_level, reported_by_user_id, responsible_user_id, due_date) values ($1,$2,'OCORRENCIA','EPI','Sem capacete.','Pátio', now(), now(), 'MEDIA', $3, $3, current_date + 3)", [rec, P, responsible]);
    await db.query("insert into public.ssma_corrective_actions (id, record_id, project_id, responsible_user_id, due_date) values ($1,$2,$3,$4,current_date + 3)", [ssmaAction, rec, P, responsible]);
  }
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type, related_ssma_corrective_action_id) values ($1,$2,$3,$4,$5,$6,$7, now() + interval '2 hours','SYSTEM',$8)",
    [id, P, ssma ? "SSMA_CORRECTIVE_ACTION" : "OTHER", `Ação ${seq}`, risk, AREA, responsible, ssmaAction]
  );
  return id;
}
let digestSeq = 0;
async function newDigest(actionIds, recipient = U.RESP) {
  await asSuper();
  digestSeq += 1;
  const d = (await db.query("insert into public.weekly_alert_digests (project_id, recipient_user_id, week_date, status, intended_recipient_email) values ($1,$2,current_date - $3::int,'SENT','x@axion.com.br') returning id", [P, recipient, digestSeq])).rows[0].id;
  let pos = 0;
  for (const a of actionIds) {
    pos += 1;
    await db.query("insert into public.weekly_alert_digest_items (digest_id, action_id, position, risk_level, title_snapshot) values ($1,$2,$3,'MEDIUM','Item')", [d, a, pos]);
  }
  return d;
}
const submit = (d, responses) => db.query("select public.submit_weekly_alert_digest($1, $2::jsonb) as r", [d, JSON.stringify(responses)]);

// ---------------- Resumo semanal ----------------
await check("W1 RESOLVIDO sem descrição (ou com menos de 10 caracteres) é recusado; nada é gravado", async () => {
  const a = await newAction();
  const d = await newDigest([a]);
  await asUser(U.RESP);
  await expectRefused(submit(d, [{ actionId: a, resolution: "RESOLVED" }]), "Descreva o que foi feito");
  await expectRefused(submit(d, [{ actionId: a, resolution: "RESOLVED", note: "feito" }]), "mínimo de 10");
  assert((await one("select status from public.sla_actions where id = $1", [a])).status === "PENDING");
});
await check("W2 RESOLVIDO com descrição grava a nota de quem respondeu (não mais texto fixo) e audita nota/evidência", async () => {
  const a = await newAction();
  const d = await newDigest([a]);
  await asUser(U.RESP);
  await submit(d, [{ actionId: a, resolution: "RESOLVED", note: "Ajuste do sequenciamento concluído.", evidence: "RDO 77" }]);
  const r = await one("select status, completion_note from public.sla_actions where id = $1", [a]);
  assert(r.status === "COMPLETED" && r.completion_note.includes("Ajuste do sequenciamento") && r.completion_note.includes("RDO 77"), JSON.stringify(r));
  const au = await one("select detail from public.audit_log_entries where entity_id = $1 and action = 'WEEKLY_ALERT_ITEM_RESPONDED'", [a]);
  assert(/Nota: Ajuste/.test(au.detail) && /Evidência: RDO 77/.test(au.detail), au.detail);
});
await check("W3 DIRECIONAR: sem motivo (não admin) recusado; destino LEITURA recusado; com motivo e destino válido grava", async () => {
  const a = await newAction();
  const d = await newDigest([a]);
  await asUser(U.RESP);
  await expectRefused(submit(d, [{ actionId: a, resolution: "FORWARDED", directedToUserId: U.COLAB }]), "motivo do direcionamento");
  await expectRefused(submit(d, [{ actionId: a, resolution: "FORWARDED", directedToUserId: U.LEITURA, note: "Frente B" }]), "somente leitura");
  await submit(d, [{ actionId: a, resolution: "FORWARDED", directedToUserId: U.COLAB, note: "Frente B assume." }]);
  assert((await one("select responsible_user_id from public.sla_actions where id = $1", [a])).responsible_user_id === U.COLAB);
});
await check("W4 item de ação corretiva SSMA ou de alerta de risco: recusa explícita, nenhum item do resumo é gravado", async () => {
  const ok = await newAction();
  const s = await newAction({ ssma: true });
  const d = await newDigest([ok, s]);
  await asUser(U.RESP);
  await expectRefused(submit(d, [{ actionId: ok, resolution: "AWARE" }, { actionId: s, resolution: "AWARE" }]), "ação corretiva SSMA");
  assert((await one("select acknowledged_at from public.sla_actions where id = $1", [ok])).acknowledged_at === null, "item válido gravado apesar da recusa");
  const r = await newAction();
  await asSuper();
  await db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id) values ($1,'INGESTION_ALERT',gen_random_uuid(),$2,'MEDIUM','Caso',$3,$4)", [P, AREA, `fp-w4-${r}`, r]);
  const d2 = await newDigest([r]);
  await asUser(U.RESP);
  await expectRefused(submit(d2, [{ actionId: r, resolution: "AWARE" }]), "alerta de risco");
});
await check("W5 ação encaminhada depois do envio: quem recebeu o resumo não altera mais (ADMINISTRADOR pode)", async () => {
  const a = await newAction();
  const d = await newDigest([a]);
  await asSuper();
  await db.query("update public.sla_actions set responsible_user_id = $2 where id = $1", [a, U.COLAB]);
  await asUser(U.RESP);
  await expectRefused(submit(d, [{ actionId: a, resolution: "AWARE" }]), "outra pessoa");
  await asUser(U.ADMIN);
  await submit(d, [{ actionId: a, resolution: "AWARE" }]);
});

// ---------------- Caso de risco: outbox não autoriza ----------------
const rule = (riskLevel) => ({ id: `rule-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 2, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 2, notifyByEmail: true, requiresAcknowledgmentConfirmation: false, requiresDelayJustification: false, isDefault: false, active: true });
const policy = resolveMatrixPolicy({ rules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule), responsibles: [{ id: "r", projectId: P, area: AREA, responsibleDirectUserId: U.RESP, secondaryResponsibleUserId: null, escalation1UserId: U.GESTOR, escalation2UserId: null, boardUserId: U.DIR, updatedAt: "2026-11-20T00:00:00Z" }], settings: null, area: AREA, riskLevel: "MEDIUM" });
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: Object.values(U), senderDomain: "axion.com.br" };
const recipients = new Map(Object.values(U).map((id, i) => [id, { userId: id, name: `S${i + 1}`, email: `s${i + 1}@axion.com.br`, membershipStatus: "ACTIVE" }]));
let minute = 0;
async function riskCase() {
  const sla = await newAction();
  const row = (await db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id) values ($1,'INGESTION_ALERT',gen_random_uuid(),$2,'MEDIUM','Caso',$3,$4,$5) returning *", [P, AREA, `fp-o-${sla}`, sla, U.RESP])).rows[0];
  return { row, sla };
}
async function takingAction(c, actor) {
  minute += 1;
  const r = c.row;
  const snapshot = { id: r.id, projectId: r.project_id, sourceType: r.source_type, sourceId: r.source_id, riskLevel: r.risk_level, state: r.state, currentLevel: r.current_level, topLevelReachedAt: null, currentResponsibleUserId: r.current_responsible_user_id, previousResponsibleUserId: null, slaActionId: r.sla_action_id, title: r.title, reference: r.reference, activeForward: null, escalatedLevels: [] };
  const t = applyAlertAction({ now: new Date(Date.UTC(2026, 10, 20, 13, minute)).toISOString(), snapshot, action: "TAKING_ACTION", actorUserId: actor, origin: "WEB", payload: { text: "Providência registrada." }, policy, config, recipients, eligibleForwardUserIds: [] });
  assert(t.ok, t.message);
  return { actionType: t.action, actorUserId: actor, actionLinkTokenHash: null, summary: t.summary, events: t.events, caseUpdate: t.caseUpdate, forward: t.forward, closeActiveForwardAs: t.closeActiveForwardAs, escalation: t.escalation, outbox: t.outbox };
}
const act = (c, body) => db.query("select public.record_risk_alert_action($1, $2, $3::jsonb)", [c.row.id, "OPEN", JSON.stringify(body)]);

await check("O0 regressão da falha de autorização (expressão NULL): LEITURA e COLABORADOR sem papel no alerta NÃO agem; nada é gravado", async () => {
  for (const uid of [U.LEITURA, U.COLAB]) {
    const c = await riskCase();
    await asUser(uid);
    await expectRefused(act(c, await takingAction(c, uid)), "sem permissão");
    assert((await one("select state, current_responsible_user_id from public.risk_alert_cases where id = $1", [c.row.id])).state === "OPEN");
  }
});
await check("O1 quem só recebeu e-mail do alerta (outbox, inclusive SUPPRESSED) NÃO age no caso", async () => {
  const c = await riskCase();
  await asSuper();
  await db.query("insert into public.risk_alert_outbox (project_id, case_id, risk_level, notification_type, origin, recipient_user_id, scheduled_for, status, suppression_reason, idempotency_key) values ($1,$2,'MEDIUM','IMMEDIATE','AUTOMATIC',$3,now(),'SUPPRESSED','PILOT_RECIPIENT_SUPPRESSED',$4)", [P, c.row.id, U.COLAB, `${c.row.id}:test:1`]);
  await asUser(U.COLAB);
  await expectRefused(act(c, await takingAction(c, U.COLAB)), "sem permissão");
  assert((await one("select state from public.risk_alert_cases where id = $1", [c.row.id])).state === "OPEN");
});
await check("O2 responsáveis da Matriz continuam agindo (Nível 2 / Gestor)", async () => {
  const c = await riskCase();
  await asUser(U.GESTOR);
  await act(c, await takingAction(c, U.GESTOR));
  assert((await one("select state from public.risk_alert_cases where id = $1", [c.row.id])).state === "IN_PROGRESS");
});
await check("O3 substituto de Nível 2 do piloto age com a exceção vigente (SET) e deixa de agir após UNSET", async () => {
  const entity = `${P}:${AREA}:LEVEL_2`;
  await asSuper();
  await db.query("insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail, occurred_at) values ($1,'USER',$2,'RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET','PROJECT_RISK_ALERT_AREA_LEVEL',$3,$4, now() - interval '1 hour')", [P, U.ADMIN, entity, JSON.stringify({ area: AREA, level: "LEVEL_2", recipientUserId: U.PILOT2, reason: "piloto" })]);
  const c1 = await riskCase();
  await asUser(U.PILOT2);
  await act(c1, await takingAction(c1, U.PILOT2));
  await asSuper();
  await db.query("insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail, occurred_at) values ($1,'USER',$2,'RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_UNSET','PROJECT_RISK_ALERT_AREA_LEVEL',$3,'{}', now())", [P, U.ADMIN, entity]);
  const c2 = await riskCase();
  await asUser(U.PILOT2);
  await expectRefused(act(c2, await takingAction(c2, U.PILOT2)), "sem permissão");
});

// ---------------- Links de e-mail: ação encerrada e LEITURA ----------------
let tokenSeq = 0;
async function confirmByEmail(actionId, action, uid, extra = {}) {
  tokenSeq += 1;
  const hash = `seg-hash-${tokenSeq}`;
  await asSuper();
  await db.query("insert into public.email_alert_action_tokens (project_id, alert_kind, alert_id, action, token_hash, intended_recipient_email, effective_recipient_email, expires_at) values ($1,'SLA_ACTION',$2,$3,$4,'a@axion.com.br','a@axion.com.br', now() + interval '7 days')", [P, actionId, action, hash]);
  await asUser(uid);
  return db.query("select * from public.confirm_email_alert_action($1, $2, $3)", [hash, extra.comment ?? null, extra.dueAt ?? null]);
}
await check("E1 ação SLA concluída: DAR CIÊNCIA / ASSUMIR / DEFINIR PRAZO por e-mail recusados (ACTION_CLOSED), nada muda", async () => {
  const a = await newAction();
  await asSuper();
  await db.query("update public.sla_actions set status = 'COMPLETED', completed_at = now(), completed_by_user_id = $2, completion_note = 'x' where id = $1", [a, U.ADMIN]);
  await expectRefused(confirmByEmail(a, "ACKNOWLEDGE", U.RESP), "ACTION_CLOSED");
  await expectRefused(confirmByEmail(a, "ASSUME_RESPONSIBILITY", U.GESTOR), "ACTION_CLOSED");
  await expectRefused(confirmByEmail(a, "SET_DEADLINE", U.ADMIN, { dueAt: new Date(Date.now() + 86400000).toISOString() }), "ACTION_CLOSED");
  assert((await one("select responsible_user_id from public.sla_actions where id = $1", [a])).responsible_user_id === U.RESP);
});
await check("E2 perfil LEITURA: DAR CIÊNCIA recusado (READ_ONLY_PROFILE); RESPONDER (comentário) continua", async () => {
  const a = await newAction();
  await expectRefused(confirmByEmail(a, "ACKNOWLEDGE", U.LEITURA), "READ_ONLY_PROFILE");
  assert((await one("select acknowledged_at from public.sla_actions where id = $1", [a])).acknowledged_at === null);
  await confirmByEmail(a, "RESPOND", U.LEITURA, { comment: "Ciente, acompanhando." });
});
await check("E3 COLABORADOR responsável continua dando ciência por e-mail (nenhum privilégio retirado de quem já podia)", async () => {
  const a = await newAction();
  await confirmByEmail(a, "ACKNOWLEDGE", U.RESP);
  assert((await one("select acknowledged_at from public.sla_actions where id = $1", [a])).acknowledged_at !== null);
});

// ---------------- Autorização falha fechada (20261120153000) ----------------
await check("N1 ação SLA sem responsável: COLABORADOR qualquer NÃO assume/conclui (antes a expressão NULL deixava passar); ADMINISTRADOR opera", async () => {
  const a = await newAction({ responsible: null });
  await asUser(U.COLAB);
  await expectRefused(db.query("select * from public.sla_action_assume($1)", [a]), "ACTION_ACCESS_DENIED");
  await expectRefused(db.query("select * from public.sla_action_complete($1, $2)", [a, "Concluída sem ser responsável."]), "ACTION_ACCESS_DENIED");
  assert((await one("select status from public.sla_actions where id = $1", [a])).status === "PENDING");
  await asUser(U.ADMIN);
  await db.query("select * from public.sla_action_assume($1)", [a]);
});

// ---------------- Relatório de divergências ----------------
await check("V1 divergências caso × ação SLA aparecem na view (responsável, nível, caso resolvido com ação aberta) — nada é corrigido sozinho", async () => {
  const c = await riskCase();
  await asUser(U.GESTOR);
  await act(c, await takingAction(c, U.GESTOR)); // TOMANDO PROVIDÊNCIAS: caso passa ao Gestor; responsável formal (SLA) continua RESP
  await asSuper();
  await db.exec("select set_config('acc.allow_escalation_update','true',false)");
  await db.query("update public.sla_actions set current_escalation_level = 'ESCALAO_1' where id = $1", [c.sla]);
  await db.exec("select set_config('acc.allow_escalation_update','',false)");
  const issues = (await db.query("select issue_code from public.risk_sla_consistency_issues where case_id = $1 order by 1", [c.row.id])).rows.map((r) => r.issue_code);
  assert(issues.includes("RESPONSIBLE_DIVERGENT") && issues.includes("LEVEL_DIVERGENT"), issues.join(","));
  const sla = await one("select responsible_user_id from public.sla_actions where id = $1", [c.sla]);
  assert(sla.responsible_user_id === U.RESP, "a view não corrige nada");
});
await check("V2 a view respeita a RLS (security invoker): usuário de fora da obra não vê nada", async () => {
  const { rows } = await db.query("select (select reloptions from pg_class where relname = 'risk_sla_consistency_issues') as opts");
  assert(String(rows[0].opts).includes("security_invoker=true"), String(rows[0].opts));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
