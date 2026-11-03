// Ciclo REAL de alertas de risco (runRiskAlertCycle + store Supabase) numa stack local completa e DESCARTÁVEL, com e-mail FALSO
// e WhatsApp SIMULADO: um caso CRÍTICO sobe RESPONSÁVEL -> 1º ESCALÃO -> DIRETORIA e o gancho do WhatsApp dispara (ou não)
// conforme a elegibilidade resolvida no banco NO MOMENTO DO ENVIO. Relógio controlado por `now` (nenhuma espera real).
//
// Cobre: desligado por padrão (nenhuma linha), só CRÍTICO (um caso ALTO que também chega à Diretoria não gera nada), contato
// autorizado => 1 mensagem simulada, ciclos repetidos e CONCORRENTES não duplicam, revogação antes do disparo => SKIPPED, vínculo
// desativado => SKIPPED, e que o e-mail do escalonamento segue o seu curso (provedor falso) em todos os cenários.
//
// Segurança: container "supabase_db_acc-disposable-*" e API local fora da faixa 54300-54399; provedor de e-mail FALSO injetado
// (nenhum Gmail), provedor de WhatsApp só simulado; dados fictícios; a auditoria gerada é imutável, então projetos/usuários do teste ficam retidos na stack descartável.
//
// Uso:
//   ACC_WA_CYCLE_TEST_WORKDIR=<dir da stack> ACC_WA_CYCLE_TEST_API_URL=http://127.0.0.1:57321 \
//   ACC_WA_CYCLE_TEST_DB_CONTAINER=supabase_db_acc-disposable-full ACC_WA_CYCLE_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true \
//   node scripts/sql/run-whatsapp-escalation-cycle-test.mjs
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDisposableContainer, requireLocalApiUrl } from "./lib/disposable-target.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const container = requireDisposableContainer("ACC_WA_CYCLE_TEST_DB_CONTAINER");
const API = requireLocalApiUrl("ACC_WA_CYCLE_TEST_API_URL");
const workdir = process.env.ACC_WA_CYCLE_TEST_WORKDIR;
if (!workdir || process.env.ACC_WA_CYCLE_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error("Defina ACC_WA_CYCLE_TEST_WORKDIR e ACC_WA_CYCLE_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true.");
  process.exit(2);
}

// Chaves LOCAIS da stack (nunca impressas).
const cli = path.join(repo, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
const status = spawnSync(`"${cli}"`, ["status", "--workdir", `"${workdir}"`, "-o", "env"], { shell: true, encoding: "utf8" });
const stackEnv = Object.fromEntries(
  status.stdout.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const [k, ...rest] = l.split("=");
    return [k, rest.join("=").replace(/^"|"$/g, "")];
  })
);
if (stackEnv.API_URL !== API) {
  console.error(`Recusado: API_URL da stack (${stackEnv.API_URL ?? "ausente"}) difere de ACC_WA_CYCLE_TEST_API_URL.`);
  process.exit(2);
}
const SERVICE = stackEnv.SERVICE_ROLE_KEY;

// Ambiente do ciclo: tudo aponta para a stack descartável; e-mail FALSO; nenhuma credencial do Google.
for (const key of Object.keys(process.env)) if (/^GOOGLE_|^ANTHROPIC_|^OPENAI_|^ELEVENLABS_|^ACC_PILOT|^ACC_EMAIL|^ACC_OUTBOUND/.test(key)) delete process.env[key];
process.env.NEXT_PUBLIC_SUPABASE_URL = API;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = stackEnv.ANON_KEY;
process.env.SUPABASE_SECRET_KEY = SERVICE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
process.env.ACC_WEEKLY_REPORTS_ENABLED = "true";
process.env.AXION_EMAIL_PROVIDER = "fake";
// Guardas do piloto (as mesmas do envio real): tudo é redirecionado ao CRM e, aqui, só chega a um provedor FALSO.
process.env.ACC_OUTBOUND_MODE = "pilot";
process.env.ACC_PILOT_RECIPIENT = "crm@axion.com.br";
process.env.ACC_EMAIL_ONLY_RECIPIENT = "crm@axion.com.br";
process.env.GOOGLE_GMAIL_INBOUND_MAILBOX = "acc-teste@axion.com.br";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3999";
delete process.env.ACC_WHATSAPP_ENABLED; // desligado por padrão: cada cenário liga/desliga explicitamente

register("./lib/server-only-shim.mjs", import.meta.url);
register("../ts-module-resolver.mjs", import.meta.url);
const { runRiskAlertCycle } = await import("../../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { FakeEmailProvider } = await import("../../apps/web/lib/email/fake-email-provider");

function psql(sql) {
  const r = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql falhou: ${r.stderr.trim().slice(0, 400)}`);
  return r.stdout.trim();
}
const asUser = (uid, sql) => psql(`begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '${uid}', true); set local role authenticated; ${sql} commit;`);

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const sfx = randomUUID().slice(0, 8);
const projects = [];
const authUsers = [];

async function createAuthUser(email) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: `Senha-${sfx}-Teste!1`, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`criar usuário HTTP ${res.status}`);
  const user = await res.json();
  authUsers.push(user.id);
  return user.id;
}

/** Cria um projeto de teste completo: responsável, 1º escalão, Diretoria (todos vinculados), matriz explícita, config do piloto e 2 casos. */
async function buildProject(label, { directorAuthorized }) {
  const project = randomUUID();
  projects.push(project);
  const [r, g, d, adm] = await Promise.all(["resp", "gerente", "diretor", "admin"].map((n) => createAuthUser(`${n}-${label}-${sfx}@axion.com.br`)));
  const doc = randomUUID();
  const docVersion = randomUUID();
  const scheduleVersion = randomUUID();
  psql(`
    insert into public.projects (id, code, name, client, location, start_date, baseline_end_date)
      values ('${project}', 'TST-${sfx}-${label}', 'Obra Fictícia ${label}', 'Cliente F', 'Local', '2027-01-01', '2027-12-31');
    insert into public.project_memberships (project_id, user_id, permission, status, area) values
      ('${project}', '${r}', 'COLABORADOR', 'ACTIVE', 'PLANEJAMENTO'),
      ('${project}', '${g}', 'GERENTE', 'ACTIVE', 'PLANEJAMENTO'),
      ('${project}', '${d}', 'COLABORADOR', 'ACTIVE', 'DIRETORIA'),
      ('${project}', '${adm}', 'ADMINISTRADOR', 'ACTIVE', null);
    insert into public.project_weekly_schedule_ingestion_configs
      (project_id, enabled, risk_alerts_enabled, pilot_recipient_allowlist_user_ids, pilot_project_confirmed_at, risk_alert_severity_map, sender_domain)
      values ('${project}', true, true, array['${r}','${g}','${d}']::uuid[], now(),
        '{"MISSING_WEEKLY_SCHEDULE":"HIGH","MISSING_WEEKLY_REPORT_WORKBOOK":"HIGH","MISSING_S_CURVE":"MEDIUM"}'::jsonb, 'axion.com.br');
    insert into public.documents (id, project_id, kind, title) values ('${doc}', '${project}', 'CRONOGRAMA_REVISAO', 'Cronograma fictício');
    insert into public.document_versions (id, document_id, project_id, version_label, version_index, document_date, source_type, author, summary)
      values ('${docVersion}', '${doc}', '${project}', 'v1', 1, current_date, 'EMAIL', 'Teste', 'Fictício');
    insert into public.schedule_versions (id, document_version_id, version_type) values ('${scheduleVersion}', '${docVersion}', 'UPDATE');
    insert into public.schedule_version_comparisons (project_id, current_schedule_version_id, comparison_type, status, risk_classification, computed_at, risk_reasons)
      values ('${project}', '${scheduleVersion}', 'PREVIOUS_WEEKLY', 'COMPUTED', 'CRITICAL', now(), '["Atraso crítico fictício"]'::jsonb),
             ('${project}', '${scheduleVersion}', 'OFFICIAL_BASELINE', 'COMPUTED', 'HIGH', now(), '["Atraso alto fictício"]'::jsonb);
  `);
  asUser(adm, `
    insert into public.sla_area_responsibles (project_id, area, responsible_direct_user_id, escalation_1_user_id, board_user_id, updated_by_user_id)
      values ('${project}', 'PLANEJAMENTO', '${r}', '${g}', '${d}', '${adm}');
    insert into public.sla_matrix_rules (project_id, risk_level, time_unit, assume_deadline_value, escalation_2_after_value, board_after_value, updated_by_user_id) values
      ('${project}', 'LOW', 'CLOCK_HOURS', 24, 24, 24, '${adm}'),
      ('${project}', 'MEDIUM', 'CLOCK_HOURS', 12, 12, 12, '${adm}'),
      ('${project}', 'HIGH', 'CLOCK_HOURS', 1, 1, 2, '${adm}'),
      ('${project}', 'CRITICAL', 'CLOCK_HOURS', 1, 1, 2, '${adm}');
  `);
  if (directorAuthorized) asUser(adm, `select public.set_person_whatsapp_contact('${project}', '${d}', '+55 27 99999-0001', true);`);
  return { project, r, g, d, adm, dEmail: `diretor-${label}-${sfx}@axion.com.br` };
}

const waRows = (project) => psql(`select status || ':' || coalesce(skip_reason, '') || ':' || risk_level from public.whatsapp_simulated_messages where project_id='${project}' order by created_at`).split("\n").filter(Boolean);
/** Provedor de e-mail FALSO com captura do que seria enviado (nada sai da máquina). */
function fakeMail() {
  const sent = [];
  const provider = new FakeEmailProvider({ onGuardedInput: (input) => sent.push(input) });
  provider.sent = sent;
  return provider;
}
// Em modo piloto o destino efetivo é sempre o CRM; o destinatário LÓGICO fica na outbox.
const directorMails = (project, userId) => Number(psql(`select count(*) from public.risk_alert_outbox where project_id='${project}' and recipient_user_id='${userId}' and notification_type='ESCALATION' and escalation_level='DIRETORIA' and status='SENT'`));
const allToCrm = (provider) => provider.sent.length > 0 && provider.sent.every((m) => [].concat(m.to).join(",") === "crm@axion.com.br");
const T0 = new Date();
const at = (minutes) => new Date(T0.getTime() + minutes * 60_000);
const cycle = (project, provider, minutes) => runRiskAlertCycle({ projectId: project, provider, now: at(minutes) });

console.log("\n======================================");
console.log(`CICLO REAL + WHATSAPP SIMULADO — stack descartável (${container})`);
console.log("======================================\n");

try {
  const A = await buildProject("a", { directorAuthorized: true });
  const providerA = fakeMail();

  await check("T0: o ciclo real cria os casos CRÍTICO e ALTO, abre as ações de SLA e envia ao responsável (e-mail falso)", async () => {
    const result = await cycle(A.project, providerA, 0);
    const pr = result.projects[0];
    assert(!pr.blockedReason, `bloqueado: ${pr.blockedReason} ${JSON.stringify(pr.readinessBlockers)}`);
    assert(pr.cases === 2 && pr.slaActionsCreated === 2, `casos=${pr.cases} ações=${pr.slaActionsCreated}`);
    assert(providerA.sent.length >= 2, `e-mails enviados: ${providerA.sent.length} (${JSON.stringify(pr).slice(0, 300)})`);
    assert(waRows(A.project).length === 0, "nenhuma linha de WhatsApp antes da Diretoria");
  });

  await check("PADRÃO DESLIGADO: CRÍTICO e ALTO chegam à Diretoria, o e-mail sai e NENHUMA linha de WhatsApp é criada", async () => {
    delete process.env.ACC_WHATSAPP_ENABLED;
    await cycle(A.project, providerA, 61); // 1º escalão
    const result = await cycle(A.project, providerA, 125); // Diretoria
    const pr = result.projects[0];
    assert(pr.escalationsApplied >= 0 && !pr.blockedReason, JSON.stringify(pr).slice(0, 300));
    const level = psql(`select string_agg(distinct current_escalation_level, ',') from public.sla_actions where project_id='${A.project}'`);
    assert(level === "DIRETORIA", `nível das ações: ${level}`);
    assert(directorMails(A.project, A.d) >= 1, "o diretor deveria ter recebido o e-mail (falso) do escalonamento");
    assert(waRows(A.project).length === 0, `linhas de WhatsApp com o canal desligado: ${waRows(A.project)}`);
  });

  await check("LIGADO: ciclo repetido e dois ciclos CONCORRENTES não criam WhatsApp retroativo — o escalonamento já passou (evento único)", async () => {
    process.env.ACC_WHATSAPP_ENABLED = "true";
    await Promise.all([cycle(A.project, providerA, 126), cycle(A.project, providerA, 126)]);
    assert(waRows(A.project).length === 0, `ligar o canal depois do evento não pode reenviar: ${waRows(A.project)}`);
    delete process.env.ACC_WHATSAPP_ENABLED;
  });

  // Projeto novo, canal LIGADO desde o início: o disparo acontece NO MOMENTO em que o e-mail da Diretoria é enviado.
  const B = await buildProject("b", { directorAuthorized: true });
  const providerB = fakeMail();
  process.env.ACC_WHATSAPP_ENABLED = "true";
  await check("LIGADO + pessoa elegível: só o caso CRÍTICO gera 1 mensagem SIMULADA ao chegar à Diretoria (o ALTO não)", async () => {
    await cycle(B.project, providerB, 0);
    await cycle(B.project, providerB, 61);
    assert(waRows(B.project).length === 0, "nada antes da Diretoria (1º escalão não dispara)");
    await Promise.all([cycle(B.project, providerB, 125), cycle(B.project, providerB, 125)]); // dois ciclos concorrentes
    const rows = waRows(B.project);
    assert(rows.length === 1 && rows[0] === "SIMULATED::CRITICAL", `linhas: ${JSON.stringify(rows)}`);
    assert(directorMails(B.project, B.d) >= 1, "e-mail ao diretor também saiu");
    const audit = psql(`select count(*) from public.audit_log_entries where project_id='${B.project}' and action='WHATSAPP_ESCALATION_SIMULATED'`);
    assert(audit === "1", `auditoria WHATSAPP_ESCALATION_SIMULATED: ${audit}`);
    const preview = psql(`select message_preview from public.whatsapp_simulated_messages where project_id='${B.project}'`);
    assert(/CRÍTICO.*Diretoria/.test(preview) && !preview.includes("5527999990001"), `prévia: ${preview}`);
  });

  await check("ciclos repetidos depois do disparo (inclusive o que registra TOP_LEVEL_REACHED) não duplicam", async () => {
    await cycle(B.project, providerB, 126);
    await cycle(B.project, providerB, 300); // além do limite da cadeia
    await Promise.all([cycle(B.project, providerB, 301), cycle(B.project, providerB, 301)]);
    assert(waRows(B.project).length === 1, `linhas: ${JSON.stringify(waRows(B.project))}`);
  });

  // Revogação ANTES do disparo
  const Cc = await buildProject("c", { directorAuthorized: true });
  const providerC = fakeMail();
  await check("autorização REVOGADA antes do disparo: o e-mail sai, o WhatsApp é SKIPPED (CHANNEL_NOT_AUTHORIZED) e nada é enviado", async () => {
    await cycle(Cc.project, providerC, 0);
    await cycle(Cc.project, providerC, 61);
    asUser(Cc.adm, `select public.set_person_whatsapp_contact('${Cc.project}', '${Cc.d}', '+55 27 99999-0001', false);`);
    await cycle(Cc.project, providerC, 125);
    assert(JSON.stringify(waRows(Cc.project)) === JSON.stringify(["SKIPPED:CHANNEL_NOT_AUTHORIZED:CRITICAL"]), JSON.stringify(waRows(Cc.project)));
    const skipAudit = psql(`select count(*) from public.audit_log_entries where project_id='${Cc.project}' and action='WHATSAPP_ESCALATION_SKIPPED'`);
    assert(skipAudit === "1", `auditoria WHATSAPP_ESCALATION_SKIPPED: ${skipAudit}`);
    assert(directorMails(Cc.project, Cc.d) >= 1, "e-mail ao diretor deveria ter saído");
  });

  // Vínculo desativado antes do disparo
  const Dd = await buildProject("d", { directorAuthorized: true });
  const providerD = fakeMail();
  await check("vínculo DESATIVADO antes do escalonamento: nem e-mail à Diretoria nem WhatsApp (o canal nunca precede o e-mail); o contato da pessoa permanece", async () => {
    await cycle(Dd.project, providerD, 0);
    await cycle(Dd.project, providerD, 61);
    psql(`update public.project_memberships set status='INACTIVE' where project_id='${Dd.project}' and user_id='${Dd.d}'`);
    await cycle(Dd.project, providerD, 125);
    assert(directorMails(Dd.project, Dd.d) === 0, "membro desativado não deveria receber o e-mail do escalonamento");
    assert(waRows(Dd.project).length === 0, `WhatsApp sem e-mail de Diretoria: ${JSON.stringify(waRows(Dd.project))}`);
    assert(psql(`select count(*) from public.person_whatsapp_contacts where user_id='${Dd.d}'`) === "1", "o cadastro da pessoa deveria permanecer");
  });

  // Sem contato cadastrado
  const Ee = await buildProject("e", { directorAuthorized: false });
  const providerE = fakeMail();
  await check("sem contato cadastrado: SKIPPED (NO_CONTACT), e-mail normal", async () => {
    await cycle(Ee.project, providerE, 0);
    await cycle(Ee.project, providerE, 61);
    await cycle(Ee.project, providerE, 125);
    assert(JSON.stringify(waRows(Ee.project)) === JSON.stringify(["SKIPPED:NO_CONTACT:CRITICAL"]), JSON.stringify(waRows(Ee.project)));
  });
} finally {
  delete process.env.ACC_WHATSAPP_ENABLED;
  try {
    // audit_log_entries é IMUTÁVEL (gatilho) e referencia o projeto (FK RESTRICT): a evidência de auditoria gerada pelo ciclo NÃO é
    // apagada nem contornada. Removem-se só os registros simulados; projetos/usuários fictícios com auditoria permanecem na stack
    // descartável (código TST-<sufixo>-*) até que a stack seja derrubada (`start-clean-local-stack.mjs down`).
    const ids = projects.map((p) => `'${p}'`).join(",") || "''";
    psql(`delete from public.whatsapp_simulated_messages where project_id in (${ids});`);
    const retained = psql(`select count(*) from public.projects where code like 'TST-${sfx}-%'`);
    console.log(`INFO ${retained} projeto(s) fictício(s) TST-${sfx}-* retido(s) pela auditoria imutável (descartáveis com a stack)`);
    const messages = psql(`select count(*) from public.whatsapp_simulated_messages where project_id in (${ids})`);
    await check("limpeza: registros simulados de WhatsApp removidos", async () => assert(messages === "0", `restantes: ${messages}`));
  } catch (error) {
    failed += 1;
    console.log(`FAIL limpeza: ${error.message}`);
  }
}

console.log("\n======================================");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
console.log("======================================");
process.exit(failed > 0 ? 1 : 0);
