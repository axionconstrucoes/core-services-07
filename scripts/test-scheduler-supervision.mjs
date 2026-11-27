// Supervisao do agendador (pg_cron) — regras PURAS (apps/web/lib/cron/scheduler-supervision.ts) e invariantes da rota
// /api/cron/system-health. Sem banco, sem rede, sem e-mail. O comportamento SQL do watchdog esta em test-scheduler-supervision-sql.mjs.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-scheduler-supervision.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const S = await import("../apps/web/lib/cron/scheduler-supervision.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const ok = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const NOW = new Date("2026-11-27T12:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const ahead = (min) => new Date(NOW.getTime() + min * 60_000).toISOString();
const job = (jobname, active, pause = null) => ({ jobname, active, pause_open: Boolean(pause), pause_expires_at: pause?.expires ?? null });
const liveness = (over = {}) => ({
  checked_at: NOW.toISOString(),
  cron_available: true,
  project_id: "00000000-0000-4000-8000-000000000001",
  watchdog: { jobname: "acc-watchdog", active: true, last_success_at: ago(4), last_start_at: ago(4), last_status: "succeeded" },
  jobs: [job("acc-watchdog", true), job("acc-gmail-sync", true)],
  ...over,
});

// ---------------------------------------------------------------- parada autorizada x inesperada x vencida
check("job ativo => ACTIVE", () => eq(S.classifyCronJob(job("acc-gmail-sync", true), NOW), "ACTIVE", "estado"));
check("job inativo SEM pausa registrada => INACTIVE_UNAUTHORIZED (caso 24/11/2026)", () => eq(S.classifyCronJob(job("acc-gmail-sync", false), NOW), "INACTIVE_UNAUTHORIZED", "estado"));
check("job inativo com pausa aberta e válida => PAUSED_AUTHORIZED", () => eq(S.classifyCronJob(job("acc-gmail-sync", false, { expires: ahead(60) }), NOW), "PAUSED_AUTHORIZED", "estado"));
check("job inativo com pausa aberta SEM vencimento => PAUSED_AUTHORIZED", () => eq(S.classifyCronJob(job("acc-gmail-sync", false, { expires: null }), NOW), "PAUSED_AUTHORIZED", "estado"));
check("job inativo com pausa VENCIDA => INACTIVE_AUTHORIZED_EXPIRED", () => eq(S.classifyCronJob(job("acc-gmail-sync", false, { expires: ago(1) }), NOW), "INACTIVE_AUTHORIZED_EXPIRED", "estado"));

check("e-mail: JOB_INACTIVE_UNAUTHORIZED => SIM (PARADA INESPERADA)", () => {
  const d = S.decideSchedulerIncident("scheduler:gmail-sync:JOB_INACTIVE_UNAUTHORIZED", new Set());
  eq([d.email, d.category], [true, "PARADA_INESPERADA"], "decisão");
});
check("e-mail: JOB_INACTIVE_AUTHORIZED_EXPIRED => SIM (PAUSA AUTORIZADA VENCIDA)", () => {
  const d = S.decideSchedulerIncident("scheduler:gmail-sync:JOB_INACTIVE_AUTHORIZED_EXPIRED", new Set());
  eq([d.email, d.category], [true, "PAUSA_AUTORIZADA_VENCIDA"], "decisão");
});
check("e-mail: JOB_PAUSED_AUTHORIZED => NÃO (informativo)", () => {
  const d = S.decideSchedulerIncident("scheduler:gmail-sync:JOB_PAUSED_AUTHORIZED", new Set());
  eq([d.email, d.category], [false, "PAUSA_AUTORIZADA"], "decisão");
});
check("e-mail: falha de heartbeat de job sob pausa autorizada válida => NÃO; sem pausa => SIM", () => {
  const paused = S.authorizedPausedJobs(liveness({ jobs: [job("acc-gmail-sync", false, { expires: ahead(30) }), job("acc-diario", false)] }), NOW);
  eq([...paused], ["gmail-sync"], "jobs pausados (nome normalizado, sem o prefixo acc-)");
  eq(S.decideSchedulerIncident("scheduler:gmail-sync:NO_RECENT_SUCCESS", paused).email, false, "gmail-sync pausado");
  eq(S.decideSchedulerIncident("scheduler:diario:NO_RECENT_SUCCESS", paused).email, true, "diario sem pausa");
  // pausa autorizada nunca silencia a PARADA vencida/inesperada nem falhas consecutivas
  eq(S.decideSchedulerIncident("scheduler:gmail-sync:CONSECUTIVE_FAILURES", paused).email, true, "falhas consecutivas");
});
check("pausa VENCIDA não entra no conjunto de pausas válidas (as falhas voltam a avisar)", () => {
  eq([...S.authorizedPausedJobs(liveness({ jobs: [job("acc-gmail-sync", false, { expires: ago(5) })] }), NOW)], [], "pausas válidas");
});
check("motivo desconhecido/fingerprint inválido => e-mail (falha segura, nunca silencia)", () => {
  eq(S.decideSchedulerIncident("scheduler:x:ALGO_NOVO", new Set()).email, true, "motivo novo");
  eq(S.decideSchedulerIncident("lixo", new Set()).email, true, "fingerprint inválido");
});

// ---------------------------------------------------------------- falhas consecutivas
check("CONSECUTIVE_FAILURES: 3 últimas concluídas falharam => sim", () => ok(S.hasConsecutiveFailures(["failed", "failed", "failed", "succeeded"])));
check("CONSECUTIVE_FAILURES: execução em andamento é ignorada; 2 falhas + sucesso => não", () => {
  ok(S.hasConsecutiveFailures(["running", "failed", "failed", "failed"]), "running ignorado");
  ok(!S.hasConsecutiveFailures(["failed", "failed", "succeeded", "failed"]), "sucesso no meio");
  ok(!S.hasConsecutiveFailures(["failed", "failed"]), "só 2 execuções");
});
check("e-mail: CONSECUTIVE_FAILURES e IMPORT_STALE => SIM", () => {
  eq(S.decideSchedulerIncident("scheduler:diario:CONSECUTIVE_FAILURES", new Set()).category, "FALHAS_CONSECUTIVAS", "falhas");
  eq(S.decideSchedulerIncident("scheduler:gmail-sync:IMPORT_STALE", new Set()).category, "IMPORTACAO_PARADA", "importação");
});

// ---------------------------------------------------------------- supervisor parado (WATCHDOG_STALE)
check("watchdog com sucesso há 4 min => vivo", () => eq(S.evaluateWatchdogLiveness(liveness(), NOW), { stale: false, state: "OK" }, "veredito"));
check("watchdog sem sucesso há 31 min => WATCHDOG_STALE (NO_RECENT_SUCCESS)", () => {
  const v = S.evaluateWatchdogLiveness(liveness({ watchdog: { jobname: "acc-watchdog", active: true, last_success_at: ago(31), last_start_at: ago(1), last_status: "failed" } }), NOW);
  eq([v.stale, v.cause], [true, "NO_RECENT_SUCCESS"], "veredito");
});
check("watchdog que nunca teve sucesso => WATCHDOG_STALE", () => {
  const v = S.evaluateWatchdogLiveness(liveness({ watchdog: { jobname: "acc-watchdog", active: true, last_success_at: null, last_start_at: null, last_status: null } }), NOW);
  eq(v.stale, true, "stale");
});
check("watchdog desativado sem pausa => WATCHDOG_STALE (WATCHDOG_INACTIVE); com pausa válida => não; pausa vencida => STALE", () => {
  const wd = { jobname: "acc-watchdog", active: false, last_success_at: ago(120), last_start_at: ago(120), last_status: "succeeded" };
  eq(S.evaluateWatchdogLiveness(liveness({ watchdog: wd, jobs: [job("acc-watchdog", false)] }), NOW).cause, "WATCHDOG_INACTIVE", "sem pausa");
  eq(S.evaluateWatchdogLiveness(liveness({ watchdog: wd, jobs: [job("acc-watchdog", false, { expires: ahead(30) })] }), NOW), { stale: false, state: "PAUSED_AUTHORIZED" }, "pausa válida");
  eq(S.evaluateWatchdogLiveness(liveness({ watchdog: wd, jobs: [job("acc-watchdog", false, { expires: ago(30) })] }), NOW).cause, "WATCHDOG_PAUSE_EXPIRED", "pausa vencida");
});
check("job acc-watchdog ausente ou pg_cron indisponível => WATCHDOG_STALE", () => {
  eq(S.evaluateWatchdogLiveness(liveness({ watchdog: null }), NOW).cause, "WATCHDOG_JOB_MISSING", "ausente");
  eq(S.evaluateWatchdogLiveness(liveness({ cron_available: false, watchdog: null }), NOW).cause, "CRON_UNAVAILABLE", "sem pg_cron");
});
check("resumo do WATCHDOG_STALE lista as paradas inesperadas vistas diretamente (o watchdog parado não as registra)", () => {
  const l = liveness({
    watchdog: { jobname: "acc-watchdog", active: true, last_success_at: ago(90), last_start_at: ago(90), last_status: "failed" },
    jobs: [job("acc-watchdog", true), job("acc-risk-alerts", false), job("acc-diario", false, { expires: ahead(30) }), job("acc-mpp-worker", false, { expires: ago(1) })],
  });
  const v = S.evaluateWatchdogLiveness(l, NOW);
  const s = S.buildWatchdogStaleSummary(v, l, NOW);
  ok(s.includes("WATCHDOG_STALE") && s.includes("acc-risk-alerts") && s.includes("acc-mpp-worker") && !s.includes("acc-diario"), s);
  eq(S.decideSchedulerIncident(S.WATCHDOG_STALE_FINGERPRINT, new Set()).category, "SUPERVISOR_PARADO", "categoria");
});

// ---------------------------------------------------------------- seleção, prioridade e limite
check("seleção: informativos fora, mais grave primeiro, limite por execução e excedente adiado", () => {
  const inc = (fp, t) => ({ id: fp, fingerprint: fp, first_detected_at: t });
  const list = [
    inc("scheduler:diario:NO_RECENT_SUCCESS", "2026-11-25T00:00:00Z"),
    inc("scheduler:gmail-sync:JOB_PAUSED_AUTHORIZED", "2026-11-25T00:00:00Z"),
    inc("scheduler:risk-alerts:JOB_INACTIVE_UNAUTHORIZED", "2026-11-26T00:00:00Z"),
    inc(S.WATCHDOG_STALE_FINGERPRINT, "2026-11-27T00:00:00Z"),
  ];
  const sel = S.selectSchedulerIncidentsToEmail(list, new Set(), 2);
  eq(sel.toEmail.map((i) => i.fingerprint), [S.WATCHDOG_STALE_FINGERPRINT, "scheduler:risk-alerts:JOB_INACTIVE_UNAUTHORIZED"], "ordem");
  eq([sel.informational, sel.deferred], [1, 1], "informativos/adiados");
});

// ---------------------------------------------------------------- destinatários
check("destinatários: nunca carla@, axion@, acc@ (mesmo se colocados por engano); minúsculas e sem duplicados", () => {
  const r = S.sanitizeSchedulerAlertRecipients(["Reynaldo@axion.com.br", "carla@axion.com.br", "AXION@axion.com.br", "acc@axion.com.br", "reynaldo@axion.com.br"]);
  eq(r, ["reynaldo@axion.com.br"], "destinatários");
});
const route = read("apps/web/app/api/cron/system-health/route.ts");
check("rota: ADMIN_RECIPIENTS = só reynaldo@ (crm@ entra como Cc pelo perfil do piloto); sem carla@/axion@/acc@ no código", () => {
  ok(/const ADMIN_RECIPIENTS = \["reynaldo@axion\.com\.br"\];/.test(route), "ADMIN_RECIPIENTS");
  ok(!/carla@axion\.com\.br|"axion@axion\.com\.br"|"acc@axion\.com\.br"/.test(route), "endereço proibido na rota");
  const recipients = S.sanitizeSchedulerAlertRecipients(["reynaldo@axion.com.br"]);
  for (const bad of S.SCHEDULER_ALERT_FORBIDDEN_RECIPIENTS) ok(!recipients.includes(bad), bad);
});
check("rota: lê a prova de vida via RPC, abre/resolve WATCHDOG_STALE, entrega pela outbox idempotente e marca notified_at", () => {
  ok(route.includes('admin.rpc("acc_scheduler_watchdog_liveness"'), "rpc");
  ok(route.includes("WATCHDOG_STALE_FINGERPRINT") && /status: "RESOLVED"/.test(route), "abre/resolve");
  ok(/\.eq\("source_type", "SCHEDULER"\)[\s\S]*\.is\("notified_at", null\)/.test(route), "só não notificados");
  ok(/deliverSystemHealthIncident\([\s\S]*sanitizeSchedulerAlertRecipients\(ADMIN_RECIPIENTS\)|sanitizeSchedulerAlertRecipients\(ADMIN_RECIPIENTS\)[\s\S]*deliverSystemHealthIncident\(/.test(route), "destinatários saneados na entrega");
  ok(!/cron\.alter_job|cron\.schedule|active:\s*true/.test(route), "a rota nunca reativa job");
});
check("o envio do alerta técnico passa pelo provedor governado (governor/kill switch) e pelo perfil do piloto", () => {
  const send = read("apps/web/lib/email/send-system-health-alert-email.ts");
  ok(/governance: \{ type: "SYSTEM_HEALTH"/.test(send) && /pilot: \{ projectId/.test(send), "governance/pilot");
});

// ---------------------------------------------------------------- migration e scripts da janela
const mig = read("supabase/migrations/20261213100000_scheduler_supervision_authorized_pauses.sql");
check("migration: registro de pausas com RLS, sem acesso anon/authenticated, uma pausa aberta por job; liveness só service_role", () => {
  ok(/create table if not exists public\.acc_scheduler_authorized_pauses/.test(mig), "tabela");
  ok(/alter table public\.acc_scheduler_authorized_pauses enable row level security/.test(mig), "RLS");
  ok(/revoke all on table public\.acc_scheduler_authorized_pauses from public, anon, authenticated/.test(mig), "revoke");
  ok(/where resumed_at is null/.test(mig), "índice parcial");
  ok(/grant execute on function public\.acc_scheduler_watchdog_liveness\(\) to service_role/.test(mig), "liveness");
  ok(/revoke all on function public\.acc_scheduler_watchdog\(\) from public, anon, authenticated, service_role/.test(mig), "watchdog sem execute");
});
check("migration: novos motivos presentes e NUNCA reativa/agenda job", () => {
  for (const r of ["JOB_INACTIVE_UNAUTHORIZED", "JOB_INACTIVE_AUTHORIZED_EXPIRED", "JOB_PAUSED_AUTHORIZED", "CONSECUTIVE_FAILURES", "IMPORT_STALE"]) ok(mig.includes(r), r);
  const code = mig.replace(/--[^\n]*/g, "");
  ok(!/cron\s*\.\s*(alter_job|schedule|unschedule)/.test(code), "pg_cron alterado pela migration");
});
check("scripts da janela: pausar registra pausa autorizada (com vencimento) e retomar a fecha; nenhum apaga o registro", () => {
  const p = read("docs/implantacao/congelamento/6-pg-cron-pausar.sql");
  const r = read("docs/implantacao/congelamento/7-pg-cron-retomar.sql");
  ok(/insert into public\.acc_scheduler_authorized_pauses[\s\S]*expires_at/.test(p), "pausar registra");
  ok(p.indexOf("acc_scheduler_authorized_pauses (jobname") < p.indexOf("cron.alter_job"), "registro antes de desativar");
  ok(/update public\.acc_scheduler_authorized_pauses[\s\S]*resumed_at = now\(\)/.test(r), "retomar fecha");
  ok(!/delete from public\.acc_scheduler_authorized_pauses|drop table public\.acc_scheduler_authorized_pauses/i.test(p + r), "registro preservado");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
