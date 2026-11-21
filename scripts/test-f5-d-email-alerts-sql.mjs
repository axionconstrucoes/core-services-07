// Fase 5 / Frente D (migration 20261204100000): fonte de caso EMAIL em risk_alert_cases.
// Replay de TODAS as migrations em PGlite (descartável, sem rede, sem banco operacional). Prova:
//   E1 a constraint aceita source_type EMAIL e continua recusando tipos inventados; migration idempotente (reaplicável)
//   E2 o P0 continua protegido: corpo de record_risk_alert_action inalterado pela migration (MD5 antes = depois)
//   E3 RESOLVIDO de caso EMAIL (RPC real) encerra SÓ o caso e a ação SLA: RNC, garantia e sinistro ficam intactos
//   E4 TOMANDO PROVIDÊNCIAS em caso EMAIL não encerra nada (ESPECIALISTA é consulta de leitura: não passa pela RPC de transição)
//   E5 rollback recusa-se com casos EMAIL existentes; sem eles, volta e a migration reaplica
// Uso: node scripts/test-f5-d-email-alerts-sql.mjs

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

const P = "00000000-0000-4000-8000-0000000000f0";
const AREA = "PLANEJAMENTO";
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
async function newCase(riskLevel = "HIGH", srcType = "INGESTION_ALERT") {
  seq += 1;
  const sla = `00000000-0000-4000-8000-0000000005${String(seq).padStart(2, "0")}`;
  const id = `00000000-0000-4000-8000-0000000006${String(seq).padStart(2, "0")}`;
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, assume_due_at, created_by_type) values ($1,$2,'OTHER','Ação do caso',$3,$4,$5, now() + interval '2 hours','SYSTEM')",
    [sla, P, riskLevel, AREA, U.RESP]
  );
  await db.query(
    "insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, sla_action_id, current_responsible_user_id) values ($1,$2,$8,gen_random_uuid(),$3,$4,'Atraso no cronograma',$5,$6,$7)",
    [id, P, AREA, riskLevel, `fp-g-${seq}`, sla, U.RESP, srcType]
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

const md5Body = async () => (await db.query("select md5(replace(pg_get_functiondef('public.record_risk_alert_action(uuid,text,jsonb)'::regprocedure), E'\\r', '')) as m")).rows[0].m;
const migSql = readFileSync(path.join(dir, "20261204100000_risk_alert_cases_email_source.sql"), "utf8").replace(/^﻿/, "");
const rollbackSql = readFileSync(path.join(here, "..", "supabase", "rollbacks", "20261204100000_risk_alert_cases_email_source.rollback.sql"), "utf8").replace(/^﻿/, "");

await check("E1 constraint aceita EMAIL, recusa tipo inventado; migration é idempotente", async () => {
  const c = await newCase("HIGH", "EMAIL");
  assert((await db.query("select source_type from public.risk_alert_cases where id=$1", [c.id])).rows[0].source_type === "EMAIL");
  await db.exec(migSql);
  await db.exec(migSql);
  let refused = false;
  try {
    await db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint) values ($1,'WHATSAPP',gen_random_uuid(),$2,'HIGH','x','fp-x')", [P, AREA]);
  } catch (error) {
    refused = /source_type_check|check constraint/i.test(String(error.message));
  }
  assert(refused, "tipo inventado deveria ser recusado");
  assert((await db.query("select count(*)::int n from pg_constraint where conrelid='public.risk_alert_cases'::regclass and contype='c' and pg_get_constraintdef(oid) like '%INGESTION_ALERT%'")).rows[0].n === 1, "uma única constraint de source_type");
});

await check("E2 P0: o corpo de record_risk_alert_action NÃO muda com a migration (MD5 antes = depois) e o ACL segue sem anon/PUBLIC", async () => {
  const before = await md5Body();
  await db.exec(migSql);
  assert((await md5Body()) === before, "corpo alterado pela migration");
  const acl = (await db.query("select has_function_privilege('anon','public.record_risk_alert_action(uuid,text,jsonb)','execute') a, has_function_privilege('public','public.record_risk_alert_action(uuid,text,jsonb)','execute') p")).rows[0];
  assert(acl.a === false && acl.p === false, JSON.stringify(acl));
});

async function sideRecords() {
  const ncr = (await db.query("insert into public.quality_ncrs (project_id, code, title, state, origin_type, origin_ref, origin_key) values ($1, 'RNC-F5D-'||gen_random_uuid()::text, 'RNC aberta (fixture)', 'DETECTADA', 'EMAIL', 'e-mail X', 'k-'||gen_random_uuid()::text) returning id", [P])).rows[0].id;
  const war = (await db.query("insert into public.quality_warranty_cases (project_id, code, service_system, state, defect_description) values ($1, 'GAR-F5D-'||gen_random_uuid()::text, 'Cobertura', 'ABERTA', 'defeito (fixture)') returning id", [P])).rows[0].id;
  const clm = (await db.query("insert into public.insurance_claims (project_id, claim_kind, title, stage, no_instrument_reason, source_ref) values ($1, 'ATRASO', 'Sinistro (fixture)', 'REGULACAO', 'sem instrumento (fixture)', 'e-mail X') returning id", [P])).rows[0].id;
  return { ncr, war, clm };
}
const readSide = async (s) =>
  JSON.stringify([
    (await db.query("select state, closed_at, row_version, updated_at from public.quality_ncrs where id=$1", [s.ncr])).rows,
    (await db.query("select state, row_version, updated_at from public.quality_warranty_cases where id=$1", [s.war])).rows,
    (await db.query("select stage, row_version, updated_at from public.insurance_claims where id=$1", [s.clm])).rows,
  ]);

await check("E3 RESOLVIDO de caso EMAIL (RPC real) encerra caso e ação SLA, e deixa RNC / garantia / sinistro EXATAMENTE como estavam", async () => {
  const s = await sideRecords();
  const before = await readSide(s);
  const c = await newCase("HIGH", "EMAIL");
  const t = await transitionFor(c, "RESOLVED", { confirmed: true, evidence: "Relatório conferido", text: "Indício descartado após conferência." });
  await asUser(U.RESP);
  await rpc(c, t.expectedState, body(t, U.RESP));
  const r = await caseRow(c);
  assert(r.state === "RESOLVED" && (await slaRow(c)).status === "COMPLETED", JSON.stringify(r));
  assert((await readSide(s)) === before, "RESOLVIDO alterou RNC/garantia/sinistro");
});

await check("E4 TOMANDO PROVIDÊNCIAS em caso EMAIL não encerra o caso nem tocam RNC/garantia/sinistro", async () => {
  const s = await sideRecords();
  const before = await readSide(s);
  const c = await newCase("MEDIUM", "EMAIL");
  const t1 = await transitionFor(c, "TAKING_ACTION", { text: "Equipe verificando.", forecastAt: "2026-11-25" });
  await asUser(U.RESP);
  await rpc(c, t1.expectedState, body(t1, U.RESP));
  assert((await caseRow(c)).state === "IN_PROGRESS");
  assert((await caseRow(c)).state !== "RESOLVED");
  assert((await slaRow(c)).status !== "COMPLETED");
  assert((await readSide(s)) === before, "alterou registros alheios");
});

await check("E5 rollback recusa-se com casos EMAIL (nada apagado); sem eles volta ao CHECK antigo e a migration reaplica", async () => {
  let blocked = false;
  try {
    await db.exec(rollbackSql);
  } catch (error) {
    blocked = /ROLLBACK_BLOCKED/.test(String(error.message));
  }
  assert(blocked, "rollback deveria ser recusado");
  assert((await db.query("select count(*)::int n from public.risk_alert_cases where source_type='EMAIL'")).rows[0].n > 0, "casos EMAIL preservados");
  await db.query("update public.risk_alert_cases set source_type='INGESTION_ALERT' where source_type='EMAIL'");
  await db.exec(rollbackSql);
  let refused = false;
  try {
    await db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint) values ($1,'EMAIL',gen_random_uuid(),$2,'HIGH','x','fp-y')", [P, AREA]);
  } catch {
    refused = true;
  }
  assert(refused, "após o rollback EMAIL volta a ser recusado");
  await db.exec(migSql);
  await db.query("insert into public.risk_alert_cases (project_id, source_type, source_id, area, risk_level, title, fingerprint) values ($1,'EMAIL',gen_random_uuid(),$2,'HIGH','x','fp-z')", [P, AREA]);
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
