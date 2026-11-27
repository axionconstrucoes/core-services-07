// Estado EFETIVO das integrações (apps/web/lib/integrations/effective-status.ts
// + cron-next.ts). Puro: sem banco, sem rede. Cobre os 7 estados
// (OPERACIONAL, PARCIAL, DESLIGADO, BLOQUEADO, FALHA, DESATUALIZADO,
// NÃO CONFIGURADO), a degradação sem RPC ("estado do agendador
// indisponível"), o helper de cron e a fiação estrutural (migration,
// página de Integrações, Dashboard, ajuda).
//
// Uso: node scripts/test-integracoes-estado-efetivo.mjs

import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const es = await import("../apps/web/lib/integrations/effective-status.ts");
const cron = await import("../apps/web/lib/integrations/cron-next.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${e.message}`);
    failed++;
  }
};
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m ?? "esperado"}: ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
};
const ok = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};

const NOW = new Date("2026-11-27T21:00:00Z");
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000).toISOString();

function job(over = {}) {
  return {
    jobname: "acc-gmail-sync",
    schedule: "1-59/15 * * * *",
    active: true,
    heartbeat_job: "gmail-sync",
    kind: "GITHUB_WORKFLOW",
    expected_interval_seconds: 900,
    last_dispatch_at: minutesAgo(14),
    last_started_at: minutesAgo(13),
    last_finished_at: minutesAgo(10),
    last_success_at: minutesAgo(10),
    last_failure_at: minutesAgo(3000),
    last_failure_code: null,
    last_conclusion: "success",
    last_run_started_at: minutesAgo(14),
    last_run_ended_at: minutesAgo(14),
    last_run_status: "succeeded",
    last_run_succeeded_at: minutesAgo(14),
    last_run_failed_at: null,
    frozen_saved_active: true,
    frozen_saved_at: "2026-11-25T00:44:29Z",
    open_incidents: 0,
    open_incident_summary: null,
    ...over,
  };
}
const snap = (...jobs) => ({ available: true, jobs });
const UNAVAILABLE = { available: false, reason: es.SCHEDULER_UNAVAILABLE_REASON };
const base = (over = {}) => ({ configured: true, declaredStatus: "CONECTADO", jobname: "acc-gmail-sync", scheduler: snap(job()), now: NOW, ...over });
const status = (over) => es.resolveEffectiveStatus(base(over)).status;

// ---------------------------------------------------------------- estados
check("OPERACIONAL: job ativo, último sucesso dentro de 3× o intervalo, fonte conectada", () => {
  const r = es.resolveEffectiveStatus(base());
  eq(r.status, "OPERACIONAL");
  eq(r.label, "OPERACIONAL");
  eq(r.frequency, "a cada 15 min");
  eq(r.nextRunAt, "2026-11-27T21:01:00.000Z", "próxima execução");
});
check("DESLIGADO: fonte conectada com job inativo NUNCA é OPERACIONAL; próxima execução vazia", () => {
  const r = es.resolveEffectiveStatus(base({ scheduler: snap(job({ active: false })) }));
  eq(r.status, "DESLIGADO");
  eq(r.nextRunAt, null);
  ok(/janela de congelamento/.test(r.reason), r.reason);
});
check("DESLIGADO: job não instalado no agendador", () => {
  eq(status({ scheduler: snap() }), "DESLIGADO");
});
check("DESATUALIZADO: job ativo mas último sucesso > 3× intervalo", () => {
  const r = es.resolveEffectiveStatus(base({ scheduler: snap(job({ last_success_at: minutesAgo(46), last_failure_at: minutesAgo(3000) })) }));
  eq(r.status, "DESATUALIZADO");
  ok(/limite 3×/.test(r.reason), r.reason);
});
check("não DESATUALIZADO no limite (exatamente 3× intervalo)", () => {
  eq(status({ scheduler: snap(job({ last_success_at: minutesAgo(45) })) }), "OPERACIONAL");
});
check("DESATUALIZADO: job ativo sem nenhum sucesso registrado", () => {
  eq(status({ scheduler: snap(job({ last_success_at: null, last_failure_at: null })) }), "DESATUALIZADO");
});
check("DESATUALIZADO usa o intervalo do cron quando o heartbeat não informa expected_interval", () => {
  const w = job({ jobname: "acc-watchdog", schedule: "*/5 * * * *", heartbeat_job: null, expected_interval_seconds: null, last_run_succeeded_at: minutesAgo(16), last_run_failed_at: null });
  eq(es.resolveEffectiveStatus(base({ jobname: "acc-watchdog", scheduler: snap(w) })).status, "DESATUALIZADO");
  eq(es.resolveEffectiveStatus(base({ jobname: "acc-watchdog", scheduler: snap({ ...w, last_run_succeeded_at: minutesAgo(4) }) })).status, "OPERACIONAL");
});
check("FALHA: última falha posterior ao último sucesso (com código e incidente no motivo)", () => {
  const r = es.resolveEffectiveStatus(base({ scheduler: snap(job({ last_failure_at: minutesAgo(2), last_failure_code: "RESPONSE_EXPIRED", open_incidents: 1, open_incident_summary: "Agendador gmail-sync: DISPATCH_FAILED" })) }));
  eq(r.status, "FALHA");
  ok(/RESPONSE_EXPIRED/.test(r.reason) && /incidente aberto/.test(r.reason), r.reason);
  eq(r.openIncidents, 1);
});
check("FALHA: erro declarado pela fonte", () => {
  eq(status({ declaredStatus: "ERRO", declaredDetail: "token inválido" }), "FALHA");
});
check("BLOQUEADO: autorização expirada", () => {
  eq(status({ blockedReason: "autorização da caixa de e-mail expirada", mailbox: { authorized: true, everSynced: true } }), "BLOQUEADO");
});
check("NÃO CONFIGURADO: fonte sem configuração", () => {
  const r = es.resolveEffectiveStatus(base({ configured: false }));
  eq(r.status, "NAO_CONFIGURADO");
  eq(r.label, "NÃO CONFIGURADO");
});
check("NÃO CONFIGURADO: e-mail sem caixa autorizada", () => {
  eq(status({ mailbox: { authorized: false, everSynced: false } }), "NAO_CONFIGURADO");
});
check("PARCIAL: caixa Gmail autorizada mas nunca sincronizada (nunca OPERACIONAL)", () => {
  const r = es.resolveEffectiveStatus(base({ mailbox: { authorized: true, everSynced: false } }));
  eq(r.status, "PARCIAL");
  ok(/nenhuma sincronização/.test(r.reason), r.reason);
});
check("PARCIAL: agendador em dia mas configuração da fonte incompleta", () => {
  eq(status({ declaredStatus: "PENDENTE" }), "PARCIAL");
});
check("PARCIAL (indisponível): RPC ausente => 'estado do agendador indisponível', nunca OPERACIONAL", () => {
  const r = es.resolveEffectiveStatus(base({ scheduler: UNAVAILABLE }));
  eq(r.status, "PARCIAL");
  eq(r.reason, "estado do agendador indisponível");
  eq(r.nextRunAt, null);
});
check("PARCIAL (indisponível): pg_cron ausente (active = null)", () => {
  eq(status({ scheduler: snap(job({ active: null, schedule: null })) }), "PARCIAL");
});
check("fonte manual (sem job): CONECTADO => OPERACIONAL, demais => PARCIAL, independe do agendador", () => {
  eq(status({ jobname: null, scheduler: UNAVAILABLE }), "OPERACIONAL");
  eq(status({ jobname: null, declaredStatus: "ATENCAO" }), "PARCIAL");
});
check("volume processado/pendente repassado", () => {
  const r = es.resolveEffectiveStatus(base({ volume: { processed: 12, pending: 3 } }));
  eq(r.processed, 12);
  eq(r.pending, 3);
});
check("todos os 7 estados têm rótulo e tom", () => {
  eq(es.EFFECTIVE_STATUS_ORDER.length, 7);
  for (const s of es.EFFECTIVE_STATUS_ORDER) ok(es.EFFECTIVE_STATUS_LABEL[s] && es.EFFECTIVE_STATUS_TONE[s], s);
});

// ---------------------------------------------------------------- serviços e dashboard
check("resolveSchedulerServices: um item por job; vazio quando indisponível", () => {
  const rows = es.resolveSchedulerServices(snap(job(), job({ jobname: "acc-weekly-all", heartbeat_job: "weekly-all", active: false })), NOW);
  eq(rows.length, 2);
  eq(rows[0].serviceLabel, "Sincronização Gmail");
  eq(rows[1].status, "DESLIGADO");
  eq(es.resolveSchedulerServices(UNAVAILABLE, NOW).length, 0);
});
check("dashboardEffectiveStatus: rebaixa CONECTADO com job desligado; mantém OPERACIONAL e fontes manuais", () => {
  eq(es.dashboardEffectiveStatus("EMAIL", "CONECTADO", snap(job({ active: false })), NOW)?.status, "DESLIGADO");
  eq(es.dashboardEffectiveStatus("EMAIL", "CONECTADO", snap(job()), NOW), null);
  eq(es.dashboardEffectiveStatus("ERP", "CONECTADO", UNAVAILABLE, NOW), null);
  eq(es.dashboardEffectiveStatus("EMAIL", "PENDENTE", snap(job({ active: false })), NOW), null);
  eq(es.dashboardEffectiveStatus("EMAIL", "CONECTADO", UNAVAILABLE, NOW)?.reason, "estado do agendador indisponível");
});
check("mapa fonte -> job cobre as 4 fontes exibidas", () => {
  eq(es.SOURCE_SCHEDULER_JOB.EMAIL, "acc-gmail-sync");
  eq(es.SOURCE_SCHEDULER_JOB.DIARIO_OBRA, "acc-diario");
  eq(es.SOURCE_SCHEDULER_JOB.CONSTRUMANAGER, "acc-construmanager");
  eq(es.SOURCE_SCHEDULER_JOB.ESG_SSMA, "acc-ssma-drive");
});

// ---------------------------------------------------------------- cron-next
check("cron: próxima execução para as 11 expressões do agendador", () => {
  const after = new Date("2026-11-27T21:00:30Z");
  const cases = {
    "*/2 * * * *": "2026-11-27T21:02:00.000Z",
    "3-59/5 * * * *": "2026-11-27T21:03:00.000Z",
    "*/10 * * * *": "2026-11-27T21:10:00.000Z",
    "2-59/10 * * * *": "2026-11-27T21:02:00.000Z",
    "5-59/10 * * * *": "2026-11-27T21:05:00.000Z",
    "1-59/15 * * * *": "2026-11-27T21:01:00.000Z",
    "0 */2 * * *": "2026-11-27T22:00:00.000Z",
    "17 */6 * * *": "2026-11-28T00:17:00.000Z",
    "43 0 * * *": "2026-11-28T00:43:00.000Z",
    "*/5 * * * *": "2026-11-27T21:05:00.000Z",
    "30 3 * * *": "2026-11-28T03:30:00.000Z",
  };
  for (const [expr, expected] of Object.entries(cases)) eq(cron.nextCronRun(expr, after)?.toISOString(), expected, expr);
});
check("cron: virada de mês/ano, dia da semana e expressão inválida", () => {
  eq(cron.nextCronRun("0 0 1 1 *", new Date("2026-12-31T23:59:00Z"))?.toISOString(), "2027-01-01T00:00:00.000Z");
  eq(cron.nextCronRun("0 12 * * 1", new Date("2026-11-27T21:00:00Z"))?.toISOString(), "2026-11-30T12:00:00.000Z");
  eq(cron.nextCronRun("@hourly", NOW), null);
  eq(cron.nextCronRun("61 * * * *", NOW), null);
});
check("cron: intervalo e frequência legível", () => {
  eq(cron.cronIntervalSeconds("1-59/15 * * * *"), 900);
  eq(cron.cronIntervalSeconds("17 */6 * * *"), 21600);
  eq(cron.cronIntervalSeconds("43 0 * * *"), 86400);
  eq(cron.humanizeCron("*/2 * * * *"), "a cada 2 min");
  eq(cron.humanizeCron("3-59/5 * * * *"), "a cada 5 min");
  eq(cron.humanizeCron("0 */2 * * *"), "a cada 2 h (minuto 00)");
  eq(cron.humanizeCron("43 0 * * *"), "diariamente às 21:43 (Brasília)");
  eq(cron.humanizeCron("0 12 * * 1"), "cron 0 12 * * 1 (UTC)");
  eq(cron.humanizeCron(null), "sem agendamento");
});

// ---------------------------------------------------------------- estrutura
check("migration: SECURITY DEFINER, search_path vazio, membro do projeto, sem command, grants corretos", () => {
  const sql = read("supabase/migrations/20261213110000_scheduler_status_for_project.sql");
  ok(/security definer/i.test(sql) && /set search_path = ''/.test(sql), "definer/search_path");
  ok(/public\.is_project_member\(p_project\)/.test(sql), "guarda de membro");
  ok(!/\bj\.command\b|\bcommand\s*,/.test(sql), "não pode retornar cron.job.command");
  ok(!/secret_name\s*,|h\.target/.test(sql), "não pode retornar secret_name/target");
  ok(/revoke all on function public\.acc_scheduler_status_for_project\(uuid\) from public, anon;/.test(sql), "revoke");
  ok(/grant execute on function public\.acc_scheduler_status_for_project\(uuid\) to authenticated;/.test(sql), "grant");
  ok(!/\b(insert|update|delete)\s+(into\s+)?(public|cron)\./i.test(sql), "somente leitura");
});
check("Integrações e Dashboard leem a RPC pelo client de sessão e exibem o estado efetivo", () => {
  const getter = read("apps/web/lib/integrations/get-scheduler-status.ts");
  ok(/rpc\("acc_scheduler_status_for_project"/.test(getter) && /available: false/.test(getter), "getter");
  ok(!/service[_-]?role|createSupabaseAdminClient/i.test(getter), "não usar service role");
  const page = read("apps/web/app/[projectId]/integracoes/page.tsx");
  ok(/getSchedulerSnapshot\(supabase, projectId\)/.test(page) && /<EffectiveStatusPanel/.test(page), "integracoes");
  const dash = read("apps/web/app/[projectId]/dashboard/page.tsx");
  ok(/getSchedulerSnapshot\(supabase, projectId\)/.test(dash) && /dashboardEffectiveStatus\(/.test(dash), "dashboard");
  const panel = read("apps/web/components/integrations/effective-status-panel.tsx");
  ok(/helpId="integracoes\.integracoes\.estado-efetivo"/.test(panel), "helpId");
  ok(/Estado do agendador indisponível/.test(panel), "aviso de indisponibilidade");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
