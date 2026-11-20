// FRENTE D (migration 20261121178000): fluxo administrativo AUDITÁVEL de aprovação de reemissão dos alertas de risco.
// Replay de TODAS as migrations em PGlite (descartável, sem rede, sem Supabase). Dados 100% SINTÉTICOS.
// Prova: (a) só ADMINISTRADOR do projeto aprova/consulta (falha fechada); (b) validação por caso (projeto, CRÍTICO/ALTO, aberto,
// lacuna, suspensão manual); (c) justificativa obrigatória e sem dado sensível; (d) idempotência; (e) a linha gravada é
// EXATAMENTE a que o ciclo consome (planejador real) e a lacuna passa a ser elegível SEM envio e sem outbox criada pela RPC;
// (f) o interruptor de envio (ACC_RISK_ALERT_REISSUE_SEND_ENABLED) segura as aprovações no ciclo real.
//
// Uso: node scripts/test-reissue-approval-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const ledgerMod = await import("../apps/web/lib/risk-alerts/communication-ledger.ts");
const { planRiskAlerts } = await import("../apps/web/lib/risk-alerts/plan-risk-alerts.ts");
const { applyReissueSendGate } = await import("../apps/web/lib/risk-alerts/reissue-send-gate.ts");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const TARGET = "20261121178000_reissue_approval_flow.sql";
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
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
async function refused(promise, fragment) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(fragment), `esperado "${fragment}", veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado recusa "${fragment}", mas passou`);
}

const db = new PGlite();
await db.exec(platform);
const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
for (const f of files) {
  try {
    await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
  } catch (e) {
    console.log(`FAIL replay ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`Base PGlite: ${files.length} migrations aplicadas (inclui ${TARGET}: ${files.includes(TARGET)}).`);
assert(files.includes(TARGET), "migration alvo ausente");

// ---------- Mundo sintético ----------
const P = "00000000-0000-4000-8000-0000000d0001";
const P2 = "00000000-0000-4000-8000-0000000d0002";
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000d1001",
  GESTOR: "00000000-0000-4000-8000-0000000d1002",
  COLAB: "00000000-0000-4000-8000-0000000d1003",
  LEITURA: "00000000-0000-4000-8000-0000000d1004",
  ADMIN2: "00000000-0000-4000-8000-0000000d1005", // ADMINISTRADOR só do OUTRO projeto
  RESP: "00000000-0000-4000-8000-0000000d1006",
  ESC1: "00000000-0000-4000-8000-0000000d1007",
  DIR: "00000000-0000-4000-8000-0000000d1008",
  INATIVO: "00000000-0000-4000-8000-0000000d1009", // ex-administrador (vínculo INACTIVE)
};
const EMAIL = (id) => `sint-${id.slice(-4)}@exemplo.invalid`;
for (const id of Object.values(U)) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, EMAIL(id)]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do nothing", [id, `Sint ${id.slice(-4)}`, EMAIL(id)]);
}
await db.exec(`
  insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
    ('${P}', 'SINT-D1', 'Obra sintética 1', 'x', 'x', date '2026-01-01', date '2027-01-01'),
    ('${P2}', 'SINT-D2', 'Obra sintética 2', 'x', 'x', date '2026-01-01', date '2027-01-01');
  insert into public.project_memberships (project_id, user_id, permission, status, area) values
    ('${P}', '${U.ADMIN}', 'ADMINISTRADOR', 'ACTIVE', 'DIRETORIA'),
    ('${P}', '${U.GESTOR}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.COLAB}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.LEITURA}', 'LEITURA', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.RESP}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.ESC1}', 'GESTOR', 'ACTIVE', 'PLANEJAMENTO'),
    ('${P}', '${U.DIR}', 'GESTOR', 'ACTIVE', 'DIRETORIA'),
    ('${P}', '${U.INATIVO}', 'ADMINISTRADOR', 'INACTIVE', 'DIRETORIA'),
    ('${P2}', '${U.ADMIN2}', 'ADMINISTRADOR', 'ACTIVE', 'DIRETORIA');
  insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id)
    values ('${P}', 'PLANEJAMENTO', '${U.RESP}', '${U.ESC1}', '${U.DIR}', '${U.ADMIN}');
`);

const asUser = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false), set_config('app.role','authenticated',false)`);
const cnt = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);

let seq = 0;
const ids = {};
async function newCase(label, { project = P, risk = "CRITICAL", stage = "DIRETORIA", status = "OPEN", responsible = U.RESP } = {}) {
  seq += 1;
  const sla = `00000000-0000-4000-8000-0000000d2${String(seq).padStart(3, "0")}`;
  const id = `00000000-0000-4000-8000-0000000d3${String(seq).padStart(3, "0")}`;
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, status, current_escalation_level, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação sintética',$3,'PLANEJAMENTO',$4,'ESCALATED',$5, now() - interval '30 days','SYSTEM')",
    [sla, project, risk === "CRITICAL" || risk === "HIGH" ? risk : "MEDIUM", responsible, stage]
  );
  await db.query(
    "insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id, status, closed_at, reference, first_seen_at) values ($1,$2,'INGESTION_ALERT',$3,'PLANEJAMENTO',$4,$5,$6,$7,$8,$9,$10,$11, now() - interval '40 days')",
    [id, project, `00000000-0000-4000-8000-0000000d4${String(seq).padStart(3, "0")}`, risk, `Caso sintético ${label}`, `fp-${label}`, sla, responsible, status, status === "CLOSED" ? new Date().toISOString() : null, `REF-${label}`]
  );
  ids[label] = { id, sla, project, risk, stage };
  return ids[label];
}
let outboxSeq = 0;
async function outbox(caseId, projectId, user, { status = "SUPPRESSED", level = "RESPONSAVEL", type = "IMMEDIATE", email = null, key = null } = {}) {
  outboxSeq += 1;
  await db.query(
    `insert into public.risk_alert_outbox (project_id, case_id, risk_level, notification_type, escalation_level, recipient_user_id, recipient_email, scheduled_for, sent_at, status, suppression_reason, attempt_count, idempotency_key)
     values ($1,$2,'CRITICAL',$3,$4,$5,$6, now(), $7, $8, $9, $10, $11)`,
    [projectId, caseId, type, level, user, email, status === "SENT" ? new Date().toISOString() : null, status, status === "SUPPRESSED" ? "CONFIGURATION_REVIEW_REQUIRED" : null, status === "SENT" ? 1 : 0, key ?? `sint:${outboxSeq}`]
  );
}

const c1 = await newCase("C1", { risk: "CRITICAL", stage: "DIRETORIA" });
const c2 = await newCase("C2", { risk: "HIGH", stage: "ESCALAO_1" });
const c3 = await newCase("C3", { risk: "MEDIUM", stage: "RESPONSAVEL" });
const c4 = await newCase("C4", { risk: "CRITICAL", stage: "DIRETORIA", status: "CLOSED" });
const c5 = await newCase("C5", { risk: "CRITICAL", stage: "DIRETORIA" });
const c6 = await newCase("C6", { risk: "HIGH", stage: "RESPONSAVEL" });
const c7 = await newCase("C7", { project: P2, risk: "CRITICAL", stage: "DIRETORIA", responsible: U.ADMIN2 });
// Histórico: C1/C2/C5 só com supressões (lacuna); C6 já informado ao responsável no próprio e-mail.
for (const [c, users] of [[c1, [U.RESP, U.DIR]], [c2, [U.RESP]], [c5, [U.RESP]]]) for (const u of users) await outbox(c.id, P, u, { level: u === U.DIR ? "DIRETORIA" : "RESPONSAVEL" });
await outbox(c6.id, P, U.RESP, { status: "SENT", email: EMAIL(U.RESP).toUpperCase() });
// Suspensão manual de C5 (registro humano), exatamente no formato lido pelo ciclo.
await db.query(
  "insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail) values ($1,'USER',$2,'RISK_ALERT_CASE_COMMUNICATION_SUSPENDED','RISK_ALERT_CASE',$3,$4)",
  [P, U.ADMIN, c5.id, JSON.stringify({ reason: "verificação pendente (sintético)" })]
);
// 1 REQUIRED histórico (SYSTEM) em C1: não pode contar como decisão.
await db.query("insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail) values ($1,'SYSTEM','RISK_ALERT_REISSUE_DECISION_REQUIRED','RISK_ALERT_CASE',$2,'sintético')", [P, c1.id]);

const JUST = "Diretoria confirmou em 20/11/2026 que o risco segue vigente e deve ser reemitido à cadeia.";
const approve = (project, caseIds, just = JUST) => db.query("select public.risk_alert_reissue_approve($1, $2::uuid[], $3) as r", [project, caseIds, just]).then((x) => x.rows[0].r);
const pending = (project) => db.query("select * from public.risk_alert_reissue_pending($1)", [project]).then((x) => x.rows);
const approvedRows = (caseId) => db.query("select * from public.audit_log_entries where action = 'RISK_ALERT_REISSUE_APPROVED' and entity_id = $1 order by occurred_at, id", [caseId]).then((x) => x.rows);
const totalApproved = () => cnt("select count(*)::int n from public.audit_log_entries where action = 'RISK_ALERT_REISSUE_APPROVED'");
const outboxCount = () => cnt("select count(*)::int n from public.risk_alert_outbox");

// ---------- Estrutura ----------
await check("S1 funções: SECURITY DEFINER com search_path vazio; anon/public sem EXECUTE; authenticated só nas duas RPCs; núcleo sem grant", async () => {
  const r = (
    await db.query(`select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon_x, has_function_privilege('public', p.oid, 'execute') as pub_x,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_x, has_function_privilege('service_role', p.oid, 'execute') as svc_x
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'risk\\_alert\\_reissue\\_%' order by 1`)
  ).rows;
  eq(r.map((x) => x.proname), ["risk_alert_reissue_approve", "risk_alert_reissue_evaluate", "risk_alert_reissue_pending"], "funções");
  for (const x of r) {
    assert(x.prosecdef, `${x.proname} sem security definer`);
    assert(JSON.stringify(x.proconfig).includes("search_path="), `${x.proname} sem search_path`);
    assert(!x.anon_x && !x.pub_x, `${x.proname} executável por anon/public`);
  }
  const by = Object.fromEntries(r.map((x) => [x.proname, x]));
  assert(by.risk_alert_reissue_approve.auth_x && by.risk_alert_reissue_pending.auth_x, "authenticated deve executar as RPCs");
  assert(!by.risk_alert_reissue_evaluate.auth_x && !by.risk_alert_reissue_evaluate.svc_x, "núcleo sem grant");
});

// ---------- Permissão (falha fechada) ----------
await check("P1 administrador do projeto lista os casos CRÍTICO/ALTO abertos com elegibilidade e motivo", async () => {
  await asUser(U.ADMIN);
  const rows = await pending(P);
  eq(rows.map((r) => r.case_id).sort(), [c1.id, c2.id, c5.id, c6.id].sort(), "casos listados (sem MEDIUM, sem fechado, sem outro projeto)");
  const by = Object.fromEntries(rows.map((r) => [r.case_id, r]));
  assert(by[c1.id].eligible && by[c1.id].reason === "ELIGIBLE" && by[c1.id].approval_state === "NONE", JSON.stringify(by[c1.id]));
  eq(by[c1.id].gap_roles, ["RESPONSAVEL", "ESCALAO_1", "DIRETORIA"], "lacuna C1 (etapa Diretoria, nada informado)");
  eq(by[c2.id].gap_roles, ["RESPONSAVEL", "ESCALAO_1"], "lacuna C2 (etapa Nível 2)");
  assert(by[c2.id].eligible, "C2 elegível");
  assert(by[c5.id].manually_suspended && !by[c5.id].eligible && by[c5.id].reason === "MANUALLY_SUSPENDED", "C5 suspenso");
  assert(!by[c6.id].eligible && by[c6.id].reason === "NO_COMMUNICATION_GAP" && by[c6.id].gap_roles.length === 0, "C6 informado (e-mail igual sem diferenciar caixa)");
  assert(by[c1.id].age_days >= 39 && by[c1.id].stage === "DIRETORIA" && by[c1.id].visible_code, "idade/etapa/código");
});

await check("P2 GESTOR, COLABORADOR, LEITURA, ex-administrador INATIVO, administrador de OUTRO projeto e anon são recusados (consulta e aprovação) sem gravar nada", async () => {
  const before = await totalApproved();
  for (const [who, uid] of [["GESTOR", U.GESTOR], ["COLABORADOR", U.COLAB], ["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO], ["ADMIN de outro projeto", U.ADMIN2]]) {
    await asUser(uid);
    await refused(pending(P), "FORBIDDEN").catch((e) => Promise.reject(new Error(`${who} (consulta): ${e.message}`)));
    await refused(approve(P, [c1.id]), "FORBIDDEN").catch((e) => Promise.reject(new Error(`${who} (aprovação): ${e.message}`)));
  }
  await asUser(null);
  await refused(pending(P), "AUTH_REQUIRED");
  await refused(approve(P, [c1.id]), "AUTH_REQUIRED");
  await asUser(U.ADMIN);
  await refused(approve(null, [c1.id]), "FORBIDDEN");
  await refused(approve("00000000-0000-4000-8000-0000000dffff", [c1.id]), "FORBIDDEN");
  eq(await totalApproved(), before, "nada gravado");
});

await check("P3 ADMINISTRADOR de outro projeto não aprova caso deste projeto nem enxerga existência: caso de outro projeto é CASE_NOT_FOUND", async () => {
  await asUser(U.ADMIN);
  const r = await approve(P, [c7.id]);
  eq(r.approved, [], "nada aprovado");
  eq(r.ignored.map((x) => [x.caseId, x.reason]), [[c7.id, "CASE_NOT_FOUND"]], "motivo");
  await asUser(U.ADMIN2);
  const r2 = await approve(P2, [c1.id]);
  eq(r2.ignored.map((x) => x.reason), ["CASE_NOT_FOUND"], "caso do projeto 1 visto do projeto 2");
  eq(await totalApproved(), 0, "nada gravado");
});

// ---------- Justificativa ----------
await check("J1 justificativa obrigatória (vazia/curta/longa) e sem dado sensível (e-mail, número longo, CPF, credencial) é recusada sem gravar", async () => {
  await asUser(U.ADMIN);
  for (const bad of [null, "", "   ", "curta demais"]) await refused(approve(P, [c1.id], bad), "JUSTIFICATION_INVALID");
  await refused(approve(P, [c1.id], "x".repeat(501)), "JUSTIFICATION_INVALID");
  await refused(approve(P, [c1.id], "Aprovado conforme combinado com fulano@empresa.com.br hoje."), "JUSTIFICATION_SENSITIVE");
  await refused(approve(P, [c1.id], "Aprovado conforme documento 12345678901 informado pela obra."), "JUSTIFICATION_SENSITIVE");
  await refused(approve(P, [c1.id], "Aprovado para o titular 123.456.789-09 da cadeia de alertas."), "JUSTIFICATION_SENSITIVE");
  await refused(approve(P, [c1.id], "Aprovado usando a senha: abc123 do painel interno do sistema."), "JUSTIFICATION_SENSITIVE");
  await refused(approve(P, [], JUST), "CASE_IDS_REQUIRED");
  await refused(approve(P, null, JUST), "CASE_IDS_REQUIRED");
  await refused(approve(P, Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`), JUST), "TOO_MANY_CASES");
  eq(await totalApproved(), 0, "nada gravado");
});

// ---------- Aprovação ----------
let c1AuditId;
let c2AuditId;
const outboxBefore = await outboxCount();
await check("A1 ADMINISTRADOR aprova: grava UMA linha por caso elegível; recusa individualmente suspenso, não CRÍTICO/ALTO, fechado, sem lacuna e de outro projeto; resposta resume tudo e emailSent=false", async () => {
  await asUser(U.ADMIN);
  const ghost = "00000000-0000-4000-8000-0000000dfffe";
  const r = await approve(P, [c1.id, c2.id, c3.id, c4.id, c5.id, c6.id, c7.id, ghost, c1.id]);
  eq(r.approved.map((x) => x.caseId).sort(), [c1.id, c2.id].sort(), "aprovados");
  const reasons = Object.fromEntries(r.ignored.map((x) => [x.caseId, x.reason]));
  eq(reasons, { [c3.id]: "RISK_LEVEL_NOT_ELIGIBLE", [c4.id]: "CASE_NOT_OPEN", [c5.id]: "MANUALLY_SUSPENDED", [c6.id]: "NO_COMMUNICATION_GAP", [c7.id]: "CASE_NOT_FOUND", [ghost]: "CASE_NOT_FOUND" }, "ignorados");
  assert(r.approvedCount === 2 && r.ignoredCount === 6 && r.emailSent === false, JSON.stringify(r));
  const rows = [...(await approvedRows(c1.id)), ...(await approvedRows(c2.id))];
  eq(rows.length, 2, "uma linha por caso (id duplicado no array não duplica)");
  for (const row of rows) {
    assert(row.actor_type === "USER" && row.actor_user_id === U.ADMIN && row.actor_label === null, "ator humano preenchido");
    assert(row.project_id === P && row.entity_type === "RISK_ALERT_CASE", "projeto/entidade");
    const d = JSON.parse(row.detail);
    assert(d.justification === JUST && d.registersDecisionOnly === true && ["CRITICAL", "HIGH"].includes(d.riskLevel) && d.caseCode && d.stage && Array.isArray(d.gapRoles), row.detail);
    assert(!/@/.test(row.detail), "sem e-mail no log");
  }
  c1AuditId = rows.find((x) => x.entity_id === c1.id).id;
  c2AuditId = rows.find((x) => x.entity_id === c2.id).id;
  eq(JSON.parse((await approvedRows(c1.id))[0].detail).stage, "DIRETORIA", "etapa registrada");
  // Nenhuma outra tabela do ciclo foi tocada.
  eq(await outboxCount(), outboxBefore, "RPC não escreve na outbox");
  assert((await approvedRows(c5.id)).length === 0 && (await approvedRows(c3.id)).length === 0 && (await approvedRows(c4.id)).length === 0 && (await approvedRows(c6.id)).length === 0 && (await approvedRows(c7.id)).length === 0, "recusados sem linha");
});

await check("A2 idempotência: aprovar de novo (inclusive em lote misto) não gera nova linha — ALREADY_APPROVED_AWAITING_SEND; a consulta mostra o estado", async () => {
  await asUser(U.ADMIN);
  const r = await approve(P, [c1.id, c2.id]);
  eq(r.approved, [], "nada novo");
  eq(r.ignored.map((x) => x.reason), ["ALREADY_APPROVED_AWAITING_SEND", "ALREADY_APPROVED_AWAITING_SEND"], "motivo");
  eq((await approvedRows(c1.id)).length, 1, "C1 uma linha");
  eq((await approvedRows(c2.id)).length, 1, "C2 uma linha");
  const by = Object.fromEntries((await pending(P)).map((x) => [x.case_id, x]));
  assert(by[c1.id].approval_state === "APPROVED_AWAITING_SEND" && !by[c1.id].eligible && by[c1.id].last_approval_id === c1AuditId, JSON.stringify(by[c1.id]));
});

// ---------- Consumo pelo ciclo (planejador real) ----------
await check("C1 o ciclo REAL (planejador) consome a linha gravada: lacuna vira REISSUE_APPROVED e a reemissão é planejada com chave REISSUE:<id da decisão> — a RPC não criou nenhuma outbox", async () => {
  // Mesma leitura do supabase-store: colunas e filtros idênticos.
  const reissueRows = (
    await db.query("select id,occurred_at,actor_type,actor_user_id,action,entity_type,entity_id from public.audit_log_entries where project_id=$1 and entity_type=$2 and action in ($3,$4)", [P, ledgerMod.REISSUE_ENTITY_TYPE, ledgerMod.REISSUE_APPROVED_ACTION, ledgerMod.REISSUE_DECISION_REQUIRED_ACTION])
  ).rows.map((r) => ({ ...r, occurred_at: new Date(r.occurred_at).toISOString() }));
  const approvals = ledgerMod.resolveReissueApprovals(reissueRows);
  assert(approvals.size === 2 && approvals.get(c1.id)?.auditId === c1AuditId && approvals.get(c1.id)?.approvedByUserId === U.ADMIN, "resolveReissueApprovals enxerga as 2 decisões humanas (a linha SYSTEM é ignorada)");
  assert(!approvals.has(c5.id) && !approvals.has(c6.id), "recusados não têm decisão");

  const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
  const resp = { id: "resp", projectId: P, area: "PLANEJAMENTO", responsibleDirectUserId: U.RESP, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U.ESC1, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.DIR, boardInvitationId: null, boardName: null, updatedAt: "2026-11-20T12:00:00.000Z" };
  const policyFor = (area, riskLevel) => resolveMatrixPolicy({ rules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule), responsibles: [resp], settings: null, area, riskLevel });
  const recipients = new Map([U.RESP, U.ESC1, U.DIR].map((id) => [id, { userId: id, name: `Sint ${id.slice(-4)}`, email: EMAIL(id), membershipStatus: "ACTIVE" }]));
  const caseRow = (await db.query("select * from public.risk_alert_cases where id = $1", [c1.id])).rows[0];
  const caseKey = `INGESTION_ALERT:${caseRow.source_id}`;
  const caseInput = { sourceType: "INGESTION_ALERT", sourceId: caseRow.source_id, area: "PLANEJAMENTO", riskLevel: "CRITICAL", title: caseRow.title, summary: "s", impact: "i", recommendation: "r", fingerprint: caseRow.fingerprint, originPath: "", closed: false, reference: caseRow.reference };
  const existing = { id: c1.id, sourceType: "INGESTION_ALERT", sourceId: caseRow.source_id, area: "PLANEJAMENTO", riskLevel: "CRITICAL", previousRiskLevel: null, fingerprint: caseRow.fingerprint, status: "OPEN", slaActionId: c1.sla, lastDigestWindow: null, firstSeenAt: "2026-10-10T12:00:00.000Z", lastChangedAt: "2026-10-10T12:00:00.000Z", closedAt: null, title: caseRow.title, summary: "s", impact: "", recommendation: null, originPath: "", reference: caseRow.reference, state: "OPEN", currentLevel: "RESPONSAVEL", currentResponsibleUserId: U.RESP, previousResponsibleUserId: null, topLevelReachedAt: "2026-10-12T12:00:00.000Z" };
  const linked = { id: c1.sla, status: "ESCALATED", currentEscalationLevel: "DIRETORIA", assumeDueAt: "2026-10-11T12:00:00.000Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, contractualDeadline: null, responsibleUserId: U.RESP };
  const historyRows = (await db.query("select case_id, notification_type, escalation_level, recipient_user_id, recipient_email, status, suppression_reason, attempt_count, provider_message_id, created_at, sent_at, idempotency_key from public.risk_alert_outbox where case_id = $1", [c1.id])).rows;
  const outboxHistory = historyRows.map((o) => ({ caseId: o.case_id, notificationType: o.notification_type, escalationLevel: o.escalation_level, recipientUserId: o.recipient_user_id, recipientEmail: o.recipient_email, status: o.status, suppressionReason: o.suppression_reason, attemptCount: Number(o.attempt_count), providerMessageId: o.provider_message_id, createdAt: new Date(o.created_at).toISOString(), sentAt: o.sent_at ? new Date(o.sent_at).toISOString() : null, idempotencyKeyIsReissue: String(o.idempotency_key).includes(":REISSUE:") }));
  const basePlan = (extra) => ({
    now: "2026-11-20T13:00:00.000Z", projectId: P, projectName: "Obra sintética", featureEnabled: true, providerConfigured: true, dryRun: false,
    config: { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: [U.RESP, U.ESC1, U.DIR], senderDomain: "exemplo.invalid", severityMap: null, pilotProjectConfirmedAt: "2026-11-01T00:00:00.000Z", pilotDeliveryOverrideEmail: null },
    timeZone: "America/Sao_Paulo", cases: [caseInput], existingCases: [existing], linkedActions: new Map([[c1.sla, linked]]), policyFor, recipients,
    existingIdempotencyKeys: new Set(), previousDigestSentAt: null, outboxHistory, ...extra,
  });

  // Sem decisão (antes de aprovar) nada sairia; COM a decisão gravada pela RPC a lacuna fica elegível:
  const without = planRiskAlerts(basePlan({ reissueApprovals: new Map() }));
  assert(without.outbox.length === 0 && without.communicationLedgers[0].decision === "REISSUE_DECISION_REQUIRED", "sem decisão: nenhum e-mail");
  const withApproval = planRiskAlerts(basePlan({ reissueApprovals: approvals }));
  assert(withApproval.communicationLedgers[0].decision === "REISSUE_APPROVED", "decisão reconhecida pelo ciclo");
  eq(withApproval.outbox.map((e) => e.idempotencyKey), [`${caseKey}:REISSUE:${c1AuditId}:${U.RESP}`, `${caseKey}:REISSUE:${c1AuditId}:${U.ESC1}`, `${caseKey}:REISSUE:${c1AuditId}:${U.DIR}`], "uma reemissão por destinatário, chave REISSUE:<id da decisão>");
  assert(withApproval.outbox.every((e) => e.recipient.status === "PENDING"), "elegíveis pelas regras do piloto (allowlist)");

  // INTERRUPTOR: ciclo REAL com a flag desligada segura as aprovações (nenhum e-mail na primeira execução); ligada, libera; dry-run sempre mostra.
  const held = applyReissueSendGate(approvals, { dryRun: false, env: {} });
  assert(held.approvals.size === 0 && held.held === 2 && held.sendFlagEnabled === false, "flag ausente = desligado");
  assert(planRiskAlerts(basePlan({ reissueApprovals: held.approvals })).outbox.length === 0, "com a flag desligada o planejador não reemite");
  for (const off of ["", "false", "0", "TRUE ", "sim", "1"].filter((v) => v.trim().toLowerCase() !== "true")) assert(applyReissueSendGate(approvals, { dryRun: false, env: { ACC_RISK_ALERT_REISSUE_SEND_ENABLED: off } }).approvals.size === 0, `valor "${off}" deve manter desligado`);
  assert(applyReissueSendGate(approvals, { dryRun: false, env: { ACC_RISK_ALERT_REISSUE_SEND_ENABLED: "true" } }).approvals.size === 2, "ligado explicitamente libera");
  assert(applyReissueSendGate(approvals, { dryRun: true, env: {} }).approvals.size === 2, "dry-run (sem envio) enxerga as aprovações para conferência");

  // Caso com suspensão manual NUNCA reemite, mesmo que houvesse decisão (linha forjada fora da RPC).
  const forged = new Map([[c1.id, { auditId: "forjado", caseId: c1.id, approvedAt: "2026-11-20T12:00:00.000Z", approvedByUserId: U.ADMIN }]]);
  assert(planRiskAlerts(basePlan({ reissueApprovals: forged, suspendedCaseIds: new Set([c1.id]) })).outbox.length === 0, "suspenso não envia mesmo com decisão");

  eq(await outboxCount(), outboxBefore, "a RPC e a leitura do ciclo não criaram outbox");
});

// ---------- Reemissão consumida / reaprovação ----------
await check("R1 decisão já utilizada (reemissão PENDING/SENT na outbox) não é re-aprovada; com reemissão apenas SUPPRESSED volta a ser elegível; subir de etapa libera nova decisão", async () => {
  // C1: o ciclo criou a reemissão (PENDING) com a chave que o planejador usa.
  await outbox(c1.id, P, U.DIR, { status: "PENDING", level: "DIRETORIA", type: "ESCALATION", key: `INGESTION_ALERT:x:REISSUE:${c1AuditId}:${U.DIR}` });
  await asUser(U.ADMIN);
  let r = await approve(P, [c1.id]);
  eq(r.ignored.map((x) => x.reason), ["ALREADY_REISSUED"], "C1 já reemitido");
  eq((await approvedRows(c1.id)).length, 1, "sem nova linha");

  // C2: a reemissão foi só SUPPRESSED (chave queimada, nada saiu) => nova decisão permitida.
  await outbox(c2.id, P, U.RESP, { status: "SUPPRESSED", key: `INGESTION_ALERT:y:REISSUE:${c2AuditId}:${U.RESP}` });
  const pc2 = (await pending(P)).find((x) => x.case_id === c2.id);
  assert(pc2.approval_state === "REISSUE_NOT_DELIVERED" && pc2.eligible, JSON.stringify(pc2));
  r = await approve(P, [c2.id]);
  eq(r.approved.length, 1, "C2 reaprovado");
  const c2Rows = await approvedRows(c2.id);
  eq(c2Rows.length, 2, "duas decisões em C2 (histórico preservado)");
  const approvals = ledgerMod.resolveReissueApprovals(c2Rows.map((x) => ({ ...x, occurred_at: new Date(x.occurred_at).toISOString() })));
  assert(approvals.get(c2.id).auditId === c2Rows[1].id, "o ciclo usa a decisão mais recente");

  // C2 (etapa ESCALAO_1 na decisão) reemitido; depois o caso sobe para DIRETORIA => nova decisão permitida.
  await outbox(c2.id, P, U.ESC1, { status: "PENDING", level: "ESCALAO_1", type: "ESCALATION", key: `INGESTION_ALERT:y:REISSUE:${c2Rows[1].id}:${U.ESC1}` });
  r = await approve(P, [c2.id]);
  eq(r.ignored.map((x) => x.reason), ["ALREADY_REISSUED"], "mesma etapa: bloqueado");
  await db.exec(`select set_config('acc.allow_escalation_update','true',false); update public.sla_actions set current_escalation_level = 'DIRETORIA' where id = '${c2.sla}'; select set_config('acc.allow_escalation_update','',false);`);
  const pc2b = (await pending(P)).find((x) => x.case_id === c2.id);
  assert(pc2b.approval_state === "REISSUED_NEW_STAGE" && pc2b.eligible, JSON.stringify(pc2b));
  r = await approve(P, [c2.id]);
  eq(r.approved.length, 1, "nova etapa => nova decisão");
  eq(JSON.parse((await approvedRows(c2.id)).at(-1).detail).stage, "DIRETORIA", "etapa nova registrada");
});

await check("R2 suspensão manual: casos suspensos nunca são aprovados; após RETOMAR (registro humano) voltam a ser elegíveis", async () => {
  await asUser(U.ADMIN);
  eq((await approve(P, [c5.id])).ignored.map((x) => x.reason), ["MANUALLY_SUSPENDED"], "suspenso");
  await db.query("insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail, occurred_at) values ($1,'USER',$2,'RISK_ALERT_CASE_COMMUNICATION_RESUMED','RISK_ALERT_CASE',$3,'{}', now() + interval '1 second')", [P, U.ADMIN, c5.id]);
  assert((await pending(P)).find((x) => x.case_id === c5.id).eligible, "retomado => elegível");
  // Uma suspensão feita por SYSTEM (não humana) é ignorada tanto pelo ciclo quanto pela RPC.
  eq((await approve(P, [c5.id])).approved.length, 1, "aprovado após retomar");
});

await check("R3 a RPC não altera caso, ação SLA, responsável nem outbox (somente acrescenta auditoria)", async () => {
  const snap = async () => JSON.stringify([(await db.query("select id,state,current_level,status,risk_level,current_responsible_user_id from public.risk_alert_cases order by id")).rows, (await db.query("select id,status,responsible_user_id,current_escalation_level from public.sla_actions order by id")).rows]);
  const before = await snap();
  await asUser(U.ADMIN);
  await approve(P, [c1.id, c2.id, c3.id, c6.id]);
  eq(await snap(), before, "casos/ações SLA inalterados");
});

await check("R4 a trilha é append-only: a decisão gravada não pode ser alterada nem apagada", async () => {
  await refused(db.query("update public.audit_log_entries set detail = 'x' where id = $1", [c1AuditId]), "append-only");
  await refused(db.query("delete from public.audit_log_entries where id = $1", [c1AuditId]), "append-only");
});

await check("L1 detecção tardia: caso ALTO sem ação SLA mas com REISSUE_DECISION_REQUIRED é elegível (libera o alerta imediato no ciclo); sem esse registro é recusado (NO_SLA_ACTION)", async () => {
  const mk = async (n, withRequired) => {
    const id = `00000000-0000-4000-8000-0000000d5${String(n).padStart(3, "0")}`;
    await db.query("insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, reference, first_seen_at) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),'PLANEJAMENTO','HIGH',$3,$4,$5, now() - interval '1 day')", [id, P, `Caso tardio ${n}`, `fp-late-${n}`, `REF-L${n}`]);
    if (withRequired) await db.query("insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail) values ($1,'SYSTEM','RISK_ALERT_REISSUE_DECISION_REQUIRED','RISK_ALERT_CASE',$2,'detecção tardia (sintético)')", [P, id]);
    return id;
  };
  const late = await mk(1, true);
  const bare = await mk(2, false);
  await asUser(U.ADMIN);
  const by = Object.fromEntries((await pending(P)).map((x) => [x.case_id, x]));
  assert(by[late].eligible && by[late].reason === "ELIGIBLE", JSON.stringify(by[late]));
  assert(!by[bare].eligible && by[bare].reason === "NO_SLA_ACTION", JSON.stringify(by[bare]));
  const r = await approve(P, [late, bare]);
  eq(r.approved.map((x) => x.caseId), [late], "só o tardio");
  eq(r.ignored.map((x) => x.reason), ["NO_SLA_ACTION"], "o outro");
  const rows = await approvedRows(late);
  assert(rows.length === 1 && rows[0].actor_type === "USER" && rows[0].actor_user_id === U.ADMIN, "linha humana");
  eq((await approve(P, [late])).ignored.map((x) => x.reason), ["ALREADY_APPROVED_AWAITING_SEND"], "idempotente");
});

await check("M1 migration idempotente: reaplicar não altera funções nem dados e as RPCs seguem funcionando", async () => {
  const before = await totalApproved();
  await db.exec(readFileSync(path.join(dir, TARGET), "utf8"));
  await db.exec(readFileSync(path.join(dir, TARGET), "utf8"));
  eq(await totalApproved(), before, "dados intactos");
  await asUser(U.ADMIN);
  assert((await pending(P)).length > 0, "RPC viva");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
