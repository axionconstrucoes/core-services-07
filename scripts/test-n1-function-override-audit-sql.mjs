// Frente N1 — auditoria de SOBRESCRITA de funções SQL (create or replace em mais de uma migration).
//
// Replay de TODAS as migrations em PGlite (descartável, sem rede) e verificação pela definição VIGENTE
// (pg_get_functiondef / prosrc), não pelo texto dos arquivos:
//   S1  toda função redefinida em mais de uma migration tem como corpo vigente o da ÚLTIMA migration (por nome de
//       arquivo) que a define — nenhuma versão antiga "volta" por ordem de aplicação;
//   S2  as correções de segurança estão presentes na definição vigente (marcadores obrigatórios/proibidos) de:
//       record_risk_alert_action (20261120151000 + 20261121101000), sla_action_authorize_operation (20261120153000),
//       ssma_corrective_action_forward_core / ssma_field_record_register_photo_core (20261120190000),
//       ssma_corrective_action_update_core (20261120160000), email_alert_action_risk_case_guard (20261120152000 +
//       20261121101000), submit_weekly_alert_digest (20261120150000), ai_consult_reserve* (20261120140000/170000),
//       has_project_permission / is_project_member (fonte única — 20261121100000), finalize_ssma_form_submission;
//   S3  propriedades de segurança vigentes: security definer, search_path = '' e privilégios (anon sem EXECUTE;
//       núcleos com ator explícito sem EXECUTE para authenticated);
//   S4  colunas NOT NULL das quais dependem comparações "a <> b" de autorização (sem elas, NULL não recusaria);
//   S5  prova de que o teste PEGA a regressão: dentro de uma transação desfeita, cada versão antiga (vulnerável) é
//       reaplicada e os marcadores de S2 precisam reprovar.
// Funciona com ou sem o hotfix 20261121090000 no repositório (o marcador é a correção, não o arquivo).
//
// Uso: node scripts/test-n1-function-override-audit-sql.mjs [--list]

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];
const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
const read = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
const norm = (s) => s.replace(/\r\n/g, "\n");

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

// ---------- definições por arquivo (texto) ----------
// Captura "create [or replace] function public.nome(" ... "as $tag$ corpo $tag$" (corpo = prosrc).
function definitionsIn(file) {
  const sql = norm(read(file));
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const body = /\bas\s+(\$[a-z_]*\$)([\s\S]*?)\1/i.exec(rest);
    if (!body) continue;
    const end = body.index + body[0].length;
    const semi = rest.indexOf(";", end);
    out.push({ name: m[1].toLowerCase(), file, body: body[2], text: rest.slice(0, semi + 1) });
  }
  return out;
}
const allDefs = files.flatMap(definitionsIn);
const byName = new Map();
for (const d of allDefs) byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
const redefined = [...byName.entries()].filter(([, defs]) => new Set(defs.map((d) => d.file)).size > 1);

if (process.argv.includes("--list")) {
  for (const [name, defs] of redefined) console.log(`${name}: ${defs.map((d) => d.file.split("_")[0]).join(" → ")}`);
  process.exit(0);
}

// ---------- replay ----------
const db = new PGlite();
await db.exec(platform);
for (const f of files) await db.exec(read(f).replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));

const procs = async (name) =>
  (await db.query("select p.oid, p.prosrc, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) def, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1", [name])).rows;

// ---------- S1 ----------
await check(`S1 ${redefined.length} funções redefinidas em mais de uma migration: corpo vigente = ÚLTIMA definição por nome de arquivo`, async () => {
  const problems = [];
  for (const [name, defs] of redefined) {
    const rows = await procs(name);
    if (rows.length === 0) continue; // removida por drop function em migration posterior
    if (rows.length > 1) {
      // sobrecarga: cada corpo vigente precisa vir de alguma definição e nenhuma definição POSTERIOR do mesmo nome
      // pode ter o mesmo número de parâmetros com corpo diferente (não dá para casar assinatura só pelo texto).
      for (const r of rows) if (!defs.some((d) => norm(d.body) === norm(r.prosrc))) problems.push(`${name}(${r.args}) sem origem`);
      continue;
    }
    const last = defs[defs.length - 1];
    if (norm(rows[0].prosrc) !== norm(last.body)) {
      const origin = [...defs].reverse().find((d) => norm(d.body) === norm(rows[0].prosrc));
      problems.push(`${name}: vigente vem de ${origin?.file ?? "?"}, esperado ${last.file}`);
    }
  }
  assert(problems.length === 0, problems.join("; "));
});

// ---------- S2: marcadores das correções ----------
const MARKERS = {
  record_risk_alert_action: {
    must: [
      [/v_actor_allowed := coalesce\(/, "permissão com coalesce(..., false) (20261120151000)"],
      [/coalesce\(v_case\.previous_responsible_user_id = v_actor, false\)/, "responsável anterior nulo falha fechado"],
      [/RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET[\s\S]*?RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_UNSET[\s\S]*?u\.occurred_at > a\.occurred_at/, "exceção do piloto só vigente (SET sem UNSET posterior)"],
      [/if not v_actor_allowed then/, "recusa explícita"],
      [/Transição sem ação humana não é aceita pela interface/, "revalidação P0 (20261120130000)"],
      [/if not coalesce\(\s*\(v_primary_action = 'TAKING_ACTION'/, "currentResponsibleUserId nulo falha fechado (20261121101000)"],
      [/and not coalesce\(v_primary_action = 'FORWARD' and \(v_case_update ->> 'previousResponsibleUserId'\)::uuid = v_actor, false\)/, "previousResponsibleUserId nulo (20261121101000)"],
      [/and not coalesce\(v_primary_action = 'FORWARD' and \(v_case_update ->> 'responsibleUserId'\)::uuid = v_guard_forward_target, false\)/, "responsibleUserId nulo (20261121101000)"],
      [/v_guard_recipient := \(v_guard_entry ->> 'recipientUserId'\)::uuid;[\s\S]{0,200}if not coalesce\(/, "destinatário de outbox nulo (20261121101000)"],
    ],
    mustNot: [[/risk_alert_outbox o where o\.case_id = p_case_id and o\.recipient_user_id = v_actor/, "e-mail recebido (outbox) como credencial (20261120130000)"]],
  },
  sla_action_authorize_operation: {
    must: [
      [/if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'/, "sem membership ativo recusa"],
      [/v_is_responsible := coalesce\(v_action\.responsible_user_id = v_user, false\)/, "responsável nulo (20261120153000)"],
      [/if not coalesce\(v_is_admin or v_is_responsible, false\) then raise exception 'ACTION_ACCESS_DENIED'/, "falha fechada (20261120153000)"],
    ],
  },
  ssma_corrective_action_forward_core: {
    must: [
      [/if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'/, "sem membership ativo recusa"],
      [/if not coalesce\(v_is_admin or \(coalesce\(v_action\.responsible_user_id = v_user, false\)/, "falha fechada (20261120190000)"],
    ],
  },
  ssma_field_record_register_photo_core: {
    must: [
      [/if not public\.project_member_active_for\(v_record\.project_id, v_user\)/, "membro ativo"],
      [/if not coalesce\(\s*coalesce\(v_record\.reported_by_user_id = v_user, false\)\s*or coalesce\(v_record\.responsible_user_id = v_user, false\)\s*or coalesce\(public\.project_permission_for\(v_record\.project_id, v_user, 'GESTOR'\), false\)/, "falha fechada (20261120190000)"],
    ],
  },
  ssma_corrective_action_update_core: {
    must: [
      [/if not public\.project_member_active_for\(v_action\.project_id, v_user\)/, "membro ativo"],
      [/v_is_manager := coalesce\(public\.project_permission_for\(v_action\.project_id, v_user, 'GESTOR'\), false\)/, "gestor com coalesce"],
      [/if not \(v_is_manager or coalesce\(v_action\.responsible_user_id = v_user, false\)\)/, "responsável nulo falha fechado"],
    ],
  },
  email_alert_action_risk_case_guard: {
    must: [
      [/ACTION_CLOSED/, "ação encerrada (20261120152000)"],
      [/READ_ONLY_PROFILE/, "LEITURA (20261120152000)"],
      [/RISK_CASE_LINKED/, "caso de risco (20261120110000)"],
      [/if v_permission is null then\s*raise exception 'NOT_ACTIVE_MEMBER/, "autor sem membership ativo (20261121101000)"],
    ],
  },
  submit_weekly_alert_digest: {
    must: [
      [/mínimo de 10 caracteres/, "RESOLVIDO exige descrição (20261120150000)"],
      [/exige evidência da resolução/, "ALTO/CRÍTICO exige evidência"],
      [/é uma ação corretiva SSMA/, "SSMA recusado"],
      [/pertence a um alerta de risco/, "alerta de risco recusado"],
      [/responsible_user_id is distinct from v_actor_id and not v_is_admin/, "quem responde continua responsável"],
      [/pm\.permission not in \('LEITURA'/, "destino não pode ser somente leitura"],
    ],
  },
  ai_consult_reserve_core: {
    must: [
      [/if p_user is null then raise exception 'AUTH_REQUIRED'/, "usuário obrigatório"],
      [/PROJECT_ACCESS_DENIED/, "vínculo ativo com a obra"],
      [/pg_advisory_xact_lock\(hashtextextended\('ai_consult:user:'[\s\S]*pg_advisory_xact_lock\(hashtextextended\('ai_consult:project:'/, "trava usuário → obra (20261120140000)"],
      [/AI_CONSULT_USER_LIMIT[\s\S]*AI_CONSULT_PROJECT_LIMIT/, "limites"],
    ],
  },
  ai_consult_reserve: { must: [[/if auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'/, "sessão"], [/RISK_CYCLE/, "RISK_CYCLE só pelo worker"], [/ai_consult_reserve_core\(/, "delega ao núcleo (20261120170000)"]] },
  ai_consult_reserve_expert: { must: [[/if auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'/, "sessão"], [/ai_consult_reserve_core\(/, "delega ao núcleo"]] },
  ai_consult_reserve_for_actor: { must: [[/if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'/, "ator"], [/p_kind is distinct from 'RISK_CYCLE'/, "só RISK_CYCLE"], [/ai_consult_reserve_core\(/, "delega ao núcleo"]] },
  has_project_permission: { must: [[/select coalesce\(public\.project_permission_for\(p_project_id, auth\.uid\(\), p_min\), false\)/, "delegação à fonte única (20261121100000)"]] },
  is_project_member: { must: [[/select coalesce\(public\.project_member_active_for\(p_project_id, auth\.uid\(\)\), false\)/, "delegação à fonte única (20261121100000)"]] },
  project_permission_for: {
    must: [
      [/pm\.status = 'ACTIVE'/, "somente ACTIVE"],
      [/when 'ADMINISTRADOR' then 3\s*when 'GESTOR' then 1\s*when 'GERENTE' then 1\s*when 'COLABORADOR' then 1\s*when 'LEITURA' then 1\s*when 'ADMIN' then 3\s*when 'EDITOR' then 1\s*when 'VIEWER' then 1\s*else 0/, "níveis do papel (20260829200000)"],
      [/when 'ADMINISTRADOR' then 3\s*when 'ADMIN' then 3\s*when 'GESTOR' then 2\s*when 'GERENTE' then 2\s*when 'COLABORADOR' then 2\s*when 'EDITOR' then 2\s*when 'LEITURA' then 1\s*when 'VIEWER' then 1\s*else 999/, "níveis do mínimo (20260829200000)"],
    ],
  },
  project_member_active_for: { must: [[/pm\.user_id = p_user_id and pm\.status = 'ACTIVE'/, "somente ACTIVE"]] },
  finalize_ssma_form_submission: { must: [[/if auth\.uid\(\) is null or v_submission\.technician_user_id is distinct from auth\.uid\(\) then/, "sessão sem usuário falha fechado (20261121101000)"]] },
};
async function markerProblems(name) {
  const rows = await procs(name);
  if (rows.length !== 1) return [`${name}: ${rows.length} definições vigentes`];
  const def = norm(rows[0].def);
  const out = [];
  for (const [re, why] of MARKERS[name].must ?? []) if (!re.test(def)) out.push(`${name}: falta ${why}`);
  for (const [re, why] of MARKERS[name].mustNot ?? []) if (re.test(def)) out.push(`${name}: reintroduzido ${why}`);
  return out;
}
for (const name of Object.keys(MARKERS)) {
  await check(`S2 ${name}: correções de segurança presentes na definição vigente`, async () => {
    const p = await markerProblems(name);
    assert(p.length === 0, p.join("; "));
  });
}

// ---------- S3: propriedades ----------
const ANON_RLS_HELPERS = ["has_project_permission", "is_project_member"];
const execBy = async (name, role) =>
  (await db.query("select bool_and(has_function_privilege($2, p.oid, 'EXECUTE')) ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1", [name, role])).rows[0].ok;
await check("S3 funções auditadas: security definer, search_path = '' e anon sem EXECUTE (exceto helpers de RLS de 20261101100000); núcleos/triggers sem EXECUTE para authenticated", async () => {
  const problems = [];
  for (const name of Object.keys(MARKERS)) {
    for (const r of await procs(name)) {
      if (!r.prosecdef) problems.push(`${name}: não é security definer`);
      if (!(r.proconfig ?? []).some((c) => c === 'search_path=""' || c === "search_path=")) problems.push(`${name}: search_path ${JSON.stringify(r.proconfig)}`);
    }
    // Exceção documentada em 20261101100000: helpers de RLS em políticas "TO public" continuam executáveis por anon
    // (auth.uid() nulo => false).
    if (!ANON_RLS_HELPERS.includes(name) && (await execBy(name, "anon"))) problems.push(`${name}: anon com EXECUTE`);
  }
  for (const name of ["ssma_corrective_action_forward_core", "ssma_field_record_register_photo_core", "ssma_corrective_action_update_core", "ai_consult_reserve_core", "ai_consult_reserve_for_actor", "project_permission_for", "project_member_active_for", "email_alert_action_risk_case_guard", "sla_action_authorize_operation"]) {
    if (await execBy(name, "authenticated")) problems.push(`${name}: authenticated com EXECUTE`);
  }
  for (const name of ["record_risk_alert_action", "sla_action_assume", "sla_action_forward", "submit_weekly_alert_digest", "ai_consult_reserve", "has_project_permission", "is_project_member", "finalize_ssma_form_submission"]) {
    if (!(await execBy(name, "authenticated"))) problems.push(`${name}: authenticated perdeu EXECUTE`);
  }
  assert(problems.length === 0, problems.join("; "));
});

// ---------- S4: NOT NULL que sustenta comparações "<>" de autorização ----------
const NOT_NULL = [
  ["alert_followups", "responsible_user_id", "alert_followup_apply_action: responsible_user_id <> v_actor"],
  ["weekly_alert_digests", "recipient_user_id", "submit_weekly_alert_digest: recipient_user_id <> v_actor_id"],
  ["contract_alert_batches", "recipient_user_id", "submit/save_contract_alert_batch_*: recipient_user_id <> v_actor_id"],
  ["ssma_form_submissions", "technician_user_id", "register_ssma_submission_photo"],
  ["ssma_field_records", "reported_by_user_id", "ssma_field_record_register_photo_core: reported_by_user_id <> v_user (REGISTRO)"],
  ["ssma_corrective_actions", "responsible_user_id", "ação corretiva SSMA"],
  ["esg_obligation_submissions", "filled_by_user_id", "esg_link_ssma_record: filled_by_user_id <> v_user"],
  ["esg_ssma_record_references", "created_by_user_id", "esg_unlink_ssma_record: created_by_user_id <> v_user"],
  ["email_access_authorizations", "user_id", "decide_email_access_authorization: user_id <> v_actor"],
];
await check(`S4 ${NOT_NULL.length} colunas NOT NULL que tornam seguras as comparações "<>" de autorização`, async () => {
  const problems = [];
  for (const [t, c, why] of NOT_NULL) {
    const r = (await db.query("select attnotnull from pg_attribute where attrelid = ('public.' || $1)::regclass and attname = $2 and not attisdropped", [t, c])).rows[0];
    if (!r?.attnotnull) problems.push(`${t}.${c} (${why})`);
  }
  assert(problems.length === 0, `colunas sem NOT NULL: ${problems.join("; ")}`);
});

// ---------- S5: o teste detecta a reintrodução de uma versão antiga ----------
const OLD = [
  ["record_risk_alert_action", "20261120130000_risk_alert_action_server_side_guard.sql"],
  ["sla_action_authorize_operation", "20261120100000_sla_action_operations_by_responsible.sql"],
  ["ssma_corrective_action_forward_core", "20261120160000_email_reply_tokens_and_ssma_by_email.sql"],
  ["ssma_field_record_register_photo_core", "20261120160000_email_reply_tokens_and_ssma_by_email.sql"],
  ["email_alert_action_risk_case_guard", "20261120110000_risk_case_sla_consistency_guards.sql"],
  ["submit_weekly_alert_digest", "20260910230000_weekly_risk_alert_digest.sql"],
  ["ai_consult_reserve", "20261120120000_ssma_forward_and_ai_consult_limits.sql"],
  ["has_project_permission", "20260829200000_project_permission_gerente_compat.sql"],
  ["is_project_member", "20260824090000_project_membership_roles_status_area.sql"],
  ["finalize_ssma_form_submission", "20260909143000_ssma_submission_persistence.sql"],
];
for (const [name, file] of OLD) {
  await check(`S5 reaplicar a versão antiga de ${name} (${file.split("_")[0]}) é DETECTADO pela auditoria`, async () => {
    const def = definitionsIn(file).filter((d) => d.name === name).pop();
    assert(def, `definição não encontrada em ${file}`);
    await db.exec("begin");
    try {
      await db.exec(def.text);
      const p = await markerProblems(name);
      assert(p.length > 0, "a versão antiga passou na auditoria (marcadores fracos)");
    } finally {
      await db.exec("rollback");
    }
    assert((await markerProblems(name)).length === 0, "rollback não restaurou a definição vigente");
  });
}

console.log("");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
await db.close();
process.exit(failed ? 1 : 0);
