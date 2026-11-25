// HOTFIX (migration 20261121090000) sobre a main de produção: record_risk_alert_action com permissão falha fechada,
// sem outbox como credencial e com a transição revalidada no servidor (mesmos casos da P0 + permissão).
// Replay de TODAS as migrations em PGlite (descartável, sem rede). As transições LEGÍTIMAS vêm da máquina de estados
// REAL (applyAlertAction) — o mesmo JSON que o app envia — e precisam continuar passando; as FORJADAS (chamada direta
// pela API com o JSON alterado) precisam ser recusadas sem gravar nada.
//
// Uso: node scripts/test-risk-alert-action-guard-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { aplicarTravaSeSolicitado } from "./lib/com-trava.mjs";
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
await aplicarTravaSeSolicitado(db);

const P = "00000000-0000-4000-8000-0000000000f0";
const AREA = "PLANEJAMENTO";
// Previsão SEMPRE futura em relação ao relógio real usado por este teste (now = Date.now()).
// Antes era fixa em "2026-11-25T15:00": a regra correta do ACC (previsão já passada => FORECAST_INVALID)
// passou a recusá-la a partir de 25/11/2026 15:00 BRT e o teste quebrou sem defeito no produto.
// Formato da tela: data e hora locais de São Paulo (YYYY-MM-DDTHH:mm), 3 dias à frente.
function futureForecastAt(days = 3) {
  return new Date(Date.now() + days * 86_400_000)
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 16)
    .replace(" ", "T");
}
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000000f1",
  RESP: "00000000-0000-4000-8000-0000000000f2",
  GESTOR: "00000000-0000-4000-8000-0000000000f3",
  DIR: "00000000-0000-4000-8000-0000000000f4",
  OTHER: "00000000-0000-4000-8000-0000000000f5", // membro ativo sem relação com o alerta
  OUTSIDER: "00000000-0000-4000-8000-0000000000f6", // perfil sem vínculo com a obra
};
let n = 0;
for (const id of Object.values(U)) {
  n += 1;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `r${n}@axion.com.br`]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `R${n}`, `r${n}@axion.com.br`]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ('${P}', 'SIM-RISK', 'Risco (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.DIR}', 'GESTOR', 'ACTIVE', 'DIRETORIA'),
    ('${P}', '${U.OTHER}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO');
  insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id)
    values ('${P}', '${AREA}', '${U.RESP}', '${U.GESTOR}', '${U.DIR}', '${U.ADMIN}');
`);

const rule = (riskLevel, ack) => ({
  id: `rule-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 2, respondDeadlineValue: null,
  completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 2, notifyByEmail: true, requiresAcknowledgmentConfirmation: ack,
  requiresDelayJustification: false, isDefault: false, active: true,
});
const rules = [rule("LOW", false), rule("MEDIUM", false), rule("HIGH", false), rule("CRITICAL", true)];
const responsibles = [{ id: "r", projectId: P, area: AREA, responsibleDirectUserId: U.RESP, secondaryResponsibleUserId: null, escalation1UserId: U.GESTOR, escalation2UserId: null, boardUserId: U.DIR, updatedAt: "2026-11-20T00:00:00Z" }];
const policyFor = (riskLevel) => resolveMatrixPolicy({ rules, responsibles, settings: null, area: AREA, riskLevel });
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: [U.RESP, U.GESTOR, U.DIR, U.OTHER, U.ADMIN], senderDomain: "axion.com.br" };
const recipients = new Map(Object.entries(U).map(([, id], i) => [id, { userId: id, name: `R${i + 1}`, email: `r${i + 1}@axion.com.br`, membershipStatus: "ACTIVE" }]));

let seq = 0;
async function newCase(riskLevel = "HIGH") {
  seq += 1;
  const sla = `00000000-0000-4000-8000-0000000005${String(seq).padStart(2, "0")}`;
  const id = `00000000-0000-4000-8000-0000000006${String(seq).padStart(2, "0")}`;
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação do caso',$3,$4,$5, now() + interval '2 hours','SYSTEM')",
    [sla, P, riskLevel, AREA, U.RESP]
  );
  await db.query(
    "insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),$3,$4,'Atraso no cronograma',$5,$6,$7)",
    [id, P, AREA, riskLevel, `fp-g-${seq}`, sla, U.RESP]
  );
  return { id, sla, riskLevel };
}
async function snapshotOf(c) {
  const r = (await db.query("select * from public.risk_alert_cases where id = $1", [c.id])).rows[0];
  return {
    id: r.id, projectId: r.project_id, sourceType: r.source_type, sourceId: r.source_id, riskLevel: r.risk_level, state: r.state, currentLevel: r.current_level,
    topLevelReachedAt: r.top_level_reached_at, currentResponsibleUserId: r.current_responsible_user_id, previousResponsibleUserId: r.previous_responsible_user_id,
    slaActionId: r.sla_action_id, title: r.title, reference: r.reference, activeForward: null, escalatedLevels: [],
  };
}
let minute = 0;
async function transitionFor(c, action, payload, actor = U.RESP) {
  minute += 1;
  const now = new Date(Date.now() + minute * 60_000).toISOString();
  const t = applyAlertAction({
    now, snapshot: await snapshotOf(c), action, actorUserId: actor, origin: "WEB", payload,
    policy: policyFor(c.riskLevel), config, recipients, eligibleForwardUserIds: [U.GESTOR, U.DIR, U.OTHER, U.RESP, U.ADMIN],
  });
  assert(t.ok, `máquina de estados recusou: ${t.code} ${t.message}`);
  return t;
}
// Mesmo JSON que apps/web/lib/risk-alerts/supabase-store.ts envia.
const body = (t, actor) => ({
  actionType: t.action, actorUserId: actor, actionLinkTokenHash: null, summary: t.summary,
  events: t.events.map((e) => ({ ...e, actorUserId: e.actorUserId ?? actor })),
  caseUpdate: t.caseUpdate, forward: t.forward, closeActiveForwardAs: t.closeActiveForwardAs, escalation: t.escalation, outbox: t.outbox,
});
const asUser = (uid) => db.exec(`select set_config('app.uid','${uid}',false), set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
const asWorker = () => db.exec(`select set_config('app.uid','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','{"role":"service_role"}',false)`);
const rpc = (c, expected, payload) => db.query("select public.record_risk_alert_action($1, $2, $3::jsonb) as r", [c.id, expected, JSON.stringify(payload)]);
const caseRow = async (c) => (await db.query("select state, current_level, current_responsible_user_id, resolved_at from public.risk_alert_cases where id = $1", [c.id])).rows[0];
const slaRow = async (c) => (await db.query("select status, responsible_user_id, completed_at from public.sla_actions where id = $1", [c.sla])).rows[0];
async function expectRefused(promise, fragment) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(fragment), `esperado "${fragment}", veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado recusa "${fragment}", mas a transição passou`);
}

// ---------- Transições legítimas (máquina de estados real) continuam passando ----------
await check("G1 legítimo: TOMANDO PROVIDÊNCIAS (ALTO) pela tela grava IN_PROGRESS no caso e na ação SLA", async () => {
  const c = await newCase("HIGH");
  const t = await transitionFor(c, "TAKING_ACTION", { text: "Equipe mobilizada.", forecastAt: futureForecastAt() });
  await asUser(U.RESP);
  await rpc(c, t.expectedState, body(t, U.RESP));
  assert((await caseRow(c)).state === "IN_PROGRESS" && (await slaRow(c)).status === "IN_PROGRESS");
});
await check("G2 legítimo: RESOLVIDO (ALTO) com evidência encerra caso e ação SLA", async () => {
  const c = await newCase("HIGH");
  const t = await transitionFor(c, "RESOLVED", { confirmed: true, evidence: "Relatório RDO 123", text: "Sequência recuperada." });
  await asUser(U.RESP);
  await rpc(c, t.expectedState, body(t, U.RESP));
  const r = await caseRow(c);
  assert(r.state === "RESOLVED" && r.resolved_at && (await slaRow(c)).status === "COMPLETED", JSON.stringify(r));
});
await check("G3 legítimo: ENVIAR P/ a membro ativo troca o responsável do caso e da ação SLA e avisa só o destinatário", async () => {
  const c = await newCase("MEDIUM");
  const t = await transitionFor(c, "FORWARD", { targetUserId: U.OTHER, text: "Assumir a frente B." });
  await asUser(U.RESP);
  await rpc(c, t.expectedState, body(t, U.RESP));
  assert((await caseRow(c)).current_responsible_user_id === U.OTHER && (await slaRow(c)).responsible_user_id === U.OTHER);
});
await check("G4 legítimo: OUTRO em ALTO escala imediatamente ao Nível 2 da Matriz", async () => {
  const c = await newCase("HIGH");
  const t = await transitionFor(c, "OTHER", { text: "Registro livre que agrava o risco." });
  assert(t.escalation && t.outbox.some((o) => o.notificationType === "ESCALATION"), "a máquina deveria escalar");
  await asUser(U.RESP);
  await rpc(c, t.expectedState, body(t, U.RESP));
  assert((await caseRow(c)).current_level === "ESCALAO_1");
});

await check("G5 legítimo: RESOLVIDO em CRÍTICO com revisão humana vira proposta; o ADMINISTRADOR confirma e encerra", async () => {
  const c = await newCase("CRITICAL");
  const t = await transitionFor(c, "RESOLVED", { confirmed: true, evidence: "Laudo 45", text: "Corrigido." });
  assert(t.caseUpdate.state === "RESOLUTION_PROPOSED", t.caseUpdate.state);
  await asUser(U.RESP);
  await rpc(c, t.expectedState, body(t, U.RESP));
  const t2 = await transitionFor(c, "RESOLUTION_CONFIRMED", { confirmed: true, text: "Conferido." }, U.ADMIN);
  await asUser(U.ADMIN);
  await rpc(c, t2.expectedState, body(t2, U.ADMIN));
  assert((await caseRow(c)).state === "RESOLVED" && (await slaRow(c)).status === "COMPLETED");
});
await check("G6 legítimo: resposta por e-mail (worker, autor identificado) com confirmação ao autor na outbox", async () => {
  const c = await newCase("MEDIUM");
  minute += 1;
  const now = new Date(Date.now() + minute * 60_000).toISOString();
  const msg = "00000000-0000-4000-8000-0000000007aa";
  const t = applyAlertAction({ now, snapshot: await snapshotOf(c), action: "TAKING_ACTION", actorUserId: U.RESP, origin: "EMAIL",
    payload: { text: "Em andamento pela equipe.", messageId: msg }, policy: policyFor("MEDIUM"), config, recipients, eligibleForwardUserIds: [] });
  assert(t.ok, t.message);
  const payload = body(t, U.RESP);
  payload.events = payload.events.map((e) => ({ ...e, messageId: null }));
  await asWorker();
  await rpc(c, t.expectedState, payload);
  assert((await caseRow(c)).state === "IN_PROGRESS");
});

// ---------- Transições forjadas (JSON alterado numa chamada direta) são recusadas ----------
await check("F1 forjado: RESOLVIDO em ALTO sem evidência → recusado, nada gravado", async () => {
  const c = await newCase("HIGH");
  const t = await transitionFor(c, "RESOLVED", { confirmed: true, evidence: "x" });
  const forged = body(t, U.RESP);
  forged.events = forged.events.map((e) => ({ ...e, evidence: null }));
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, forged), "exige evidência");
  assert((await caseRow(c)).state === "OPEN" && (await slaRow(c)).status !== "COMPLETED");
});
await check("F2 forjado: TOMANDO PROVIDÊNCIAS com estado de destino RESOLVED / ação SLA COMPLETED → recusado", async () => {
  const c = await newCase("MEDIUM");
  const t = await transitionFor(c, "TAKING_ACTION", { text: "Andamento." });
  const a = body(t, U.RESP);
  a.caseUpdate = { ...a.caseUpdate, state: "RESOLVED" };
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, a), "Transição inválida");
  const b = body(t, U.RESP);
  b.caseUpdate = { ...b.caseUpdate, slaActionStatus: "COMPLETED" };
  await expectRefused(rpc(c, t.expectedState, b), "status da ação SLA");
  assert((await caseRow(c)).state === "OPEN");
});
await check("F3 forjado: transição sem ação humana pela interface (só caseUpdate) → recusada", async () => {
  const c = await newCase("MEDIUM");
  await asUser(U.RESP);
  await expectRefused(rpc(c, "OPEN", { actionType: null, summary: "x", events: [], caseUpdate: { state: "IN_PROGRESS" }, outbox: [] }), "sem ação humana");
});
await check("F4 forjado: TOMANDO PROVIDÊNCIAS pondo outra pessoa (ou alguém de fora da obra) como responsável → recusado", async () => {
  const c = await newCase("MEDIUM");
  const t = await transitionFor(c, "TAKING_ACTION", { text: "Andamento." });
  const a = body(t, U.RESP);
  a.caseUpdate = { ...a.caseUpdate, currentResponsibleUserId: U.OTHER };
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, a), "responsável do alerta incoerente");
  const b = body(t, U.RESP);
  b.caseUpdate = { ...b.caseUpdate, responsibleUserId: U.OUTSIDER };
  await expectRefused(rpc(c, t.expectedState, b), "só ENVIAR P/");
});
await check("F5 forjado: pular para a Diretoria sem escalonamento / escalonamento fora de OUTRO → recusado", async () => {
  const c = await newCase("HIGH");
  const t = await transitionFor(c, "TAKING_ACTION", { text: "Andamento." });
  const a = body(t, U.RESP);
  a.caseUpdate = { ...a.caseUpdate, currentLevel: "DIRETORIA" };
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, a), "nível só muda por escalonamento");
  const b = body(t, U.RESP);
  b.escalation = { fromLevel: "RESPONSAVEL", toLevel: "DIRETORIA", reason: "x" };
  b.caseUpdate = { ...b.caseUpdate, currentLevel: "DIRETORIA" };
  await expectRefused(rpc(c, t.expectedState, b), "escalonamento imediato incoerente");
  assert((await caseRow(c)).current_level === "RESPONSAVEL");
});
await check("F6 forjado: e-mail (outbox) para perfil arbitrário → recusado", async () => {
  const c = await newCase("MEDIUM");
  const t = await transitionFor(c, "TAKING_ACTION", { text: "Andamento." });
  const a = body(t, U.RESP);
  a.outbox = [{ idempotencyKey: `${c.id}:SPAM:1`, notificationType: "FORWARD", origin: "WEB_ACTION", escalationLevel: null, riskLevel: "MEDIUM", recipientUserId: U.OUTSIDER, status: "PENDING", suppressionReason: null, matrixRuleSnapshot: {}, payloadSummary: {} }];
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, a), "destinatário de e-mail não autorizado");
  const count = (await db.query("select count(*)::int as n from public.risk_alert_outbox where case_id = $1", [c.id])).rows[0].n;
  assert(count === 0, `outbox gravada: ${count}`);
});
await check("F7 forjado: ENVIAR P/ com destinatário do evento diferente do encaminhamento, ou devolução forjada → recusado", async () => {
  const c = await newCase("MEDIUM");
  const t = await transitionFor(c, "FORWARD", { targetUserId: U.OTHER, text: "x" });
  const a = body(t, U.RESP);
  a.events = a.events.map((e) => ({ ...e, targetUserId: U.GESTOR }));
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, a), "destinatário do evento difere");
  const t2 = await transitionFor(c, "TAKING_ACTION", { text: "x" });
  const b = body(t2, U.RESP);
  b.closeActiveForwardAs = "RETURNED";
  await expectRefused(rpc(c, t2.expectedState, b), "só o sistema devolve");
});
await check("F8 ESPECIALISTA pela interface não muda estado (R-04): recusado no banco; pelo worker (pergunta por e-mail) segue aceito", async () => {
  const c = await newCase("MEDIUM");
  const t = await transitionFor(c, "EXPERT_CONSULTATION", { expertId: "planning-director", question: "Qual o impacto?" });
  await asUser(U.RESP);
  await expectRefused(rpc(c, t.expectedState, body(t, U.RESP)), "somente consulta");
  await asWorker();
  await rpc(c, t.expectedState, body(t, U.RESP));
  assert((await caseRow(c)).state === "EXPERT_CONSULTATION_PENDING");
});
await check("F9 transição do sistema (worker, sem autor) continua aceita: topo da hierarquia registrado pelo motor", async () => {
  const c = await newCase("HIGH");
  await db.query("update public.risk_alert_cases set current_level = 'DIRETORIA' where id = $1", [c.id]);
  await asWorker();
  await rpc(c, "OPEN", { actionType: null, summary: "topo", events: [], caseUpdate: { state: "OPEN", currentLevel: "DIRETORIA", topLevelReached: true }, outbox: [] });
  const r = (await db.query("select top_level_reached_at from public.risk_alert_cases where id = $1", [c.id])).rows[0];
  assert(r.top_level_reached_at !== null);
});

// ---------- Permissão falha fechada (falha preexistente em produção) ----------
const LEITURA = "00000000-0000-4000-8000-0000000000f7";
await asWorker();
await db.query("insert into auth.users (id, email) values ($1, 'r7@axion.com.br')", [LEITURA]);
await db.query("insert into public.profiles (id, name, email, origin) values ($1, 'R7', 'r7@axion.com.br', 'AXION_INTERNO') on conflict (id) do nothing", [LEITURA]);
await db.query("insert into public.project_memberships (project_id, user_id, permission, status, area) values ($1, $2, 'LEITURA', 'ACTIVE', 'PLANEJAMENTO')", [P, LEITURA]);
await check("H1 sem responsável anterior: LEITURA e COLABORADOR sem papel no alerta NÃO agem (antes a expressão NULL deixava passar)", async () => {
  for (const uid of [LEITURA, U.OTHER]) {
    const c = await newCase("MEDIUM");
    const t = await transitionFor(c, "TAKING_ACTION", { text: "Tentativa sem papel." }, uid);
    await asUser(uid);
    await expectRefused(rpc(c, t.expectedState, body(t, uid)), "sem permissão");
    assert((await caseRow(c)).state === "OPEN");
  }
});
await check("H2 ter recebido e-mail do alerta (outbox SUPPRESSED) não autoriza", async () => {
  const c = await newCase("MEDIUM");
  await asWorker();
  await db.query("insert into public.risk_alert_outbox (project_id, case_id, risk_level, notification_type, origin, recipient_user_id, scheduled_for, status, suppression_reason, idempotency_key) values ($1,$2,'MEDIUM','IMMEDIATE','AUTOMATIC',$3,now(),'SUPPRESSED','PILOT_RECIPIENT_SUPPRESSED',$4)", [P, c.id, U.OTHER, `${c.id}:h2`]);
  const t = await transitionFor(c, "TAKING_ACTION", { text: "Tentativa." }, U.OTHER);
  await asUser(U.OTHER);
  await expectRefused(rpc(c, t.expectedState, body(t, U.OTHER)), "sem permissão");
});
await check("H3 responsável, Matriz (Nível 2) e ADMINISTRADOR continuam agindo", async () => {
  for (const uid of [U.RESP, U.GESTOR, U.ADMIN]) {
    const c = await newCase("MEDIUM");
    const t = await transitionFor(c, "TAKING_ACTION", { text: "Providência." }, uid);
    await asUser(uid);
    await rpc(c, t.expectedState, body(t, uid));
    assert((await caseRow(c)).state === "IN_PROGRESS");
  }
});

await check("H4 responsável NULL na transição (TOMANDO PROVIDÊNCIAS sem responsável atual; ENVIAR P/ sem anterior/destino) → recusado, responsável preservado", async () => {
  const c = await newCase("MEDIUM");
  const t1 = await transitionFor(c, "TAKING_ACTION", { text: "Providência." }, U.RESP);
  const b1 = body(t1, U.RESP);
  await asUser(U.RESP);
  await expectRefused(rpc(c, t1.expectedState, { ...b1, caseUpdate: { ...b1.caseUpdate, currentResponsibleUserId: null } }), "incoerente");
  const t2 = await transitionFor(c, "FORWARD", { targetUserId: U.GESTOR, text: "Frente B assume." }, U.RESP);
  const b2 = body(t2, U.RESP);
  for (const field of ["previousResponsibleUserId", "responsibleUserId"]) {
    await asUser(U.RESP);
    await expectRefused(rpc(c, t2.expectedState, { ...b2, caseUpdate: { ...b2.caseUpdate, [field]: null } }), "Transição inválida");
  }
  const row = await caseRow(c);
  assert(row.state === "OPEN" && row.current_responsible_user_id === U.RESP, JSON.stringify(row));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
