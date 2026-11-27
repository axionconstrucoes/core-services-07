// Supervisão do agendador (pg_cron) — regras PURAS, sem banco e sem rede (testadas em scripts/test-scheduler-supervision.mjs).
//
// Origem: em 24/11/2026, 8 de 11 jobs do pg_cron ficaram com active=false após a janela de congelamento porque o script de
// retomada (7-pg-cron-retomar.sql) não foi executado, e nada avisou. Agora:
//   - o watchdog SQL (public.acc_scheduler_watchdog, migration 20261213100000) distingue parada AUTORIZADA (registro explícito em
//     public.acc_scheduler_authorized_pauses) de parada INESPERADA, pausa vencida e falhas consecutivas;
//   - a rota Vercel /api/cron/system-health (independente do pg_cron) verifica se o próprio watchdog está vivo
//     (public.acc_scheduler_watchdog_liveness) e envia os incidentes do agendador à Diretoria, uma única vez por incidente.
// As regras abaixo espelham o SQL; a rota usa estas funções para decidir o que vira e-mail.

/** Motivos abertos pelo watchdog SQL a partir dos heartbeats (comportamento anterior, preservado). */
export const HEARTBEAT_REASONS = ["DISPATCH_FAILED", "DISPATCH_WITHOUT_START", "STARTED_WITHOUT_FINISH", "JOB_FAILED", "ROUTE_FAILURE", "NO_RECENT_SUCCESS"] as const;

/** Motivos novos (pg_cron e importação). */
export const CRON_REASONS = ["JOB_INACTIVE_UNAUTHORIZED", "JOB_INACTIVE_AUTHORIZED_EXPIRED", "JOB_PAUSED_AUTHORIZED", "CONSECUTIVE_FAILURES", "IMPORT_STALE"] as const;

/** Aberto pela rota system-health quando o próprio watchdog não roda com sucesso há mais de 30 minutos. */
export const WATCHDOG_STALE_REASON = "WATCHDOG_STALE";
export const WATCHDOG_STALE_FINGERPRINT = `scheduler:watchdog:${WATCHDOG_STALE_REASON}`;
export const WATCHDOG_MAX_SILENCE_MINUTES = 30;
export const WATCHDOG_JOBNAME = "acc-watchdog";

/** Parada autorizada: registrada para rastreabilidade, NUNCA vira e-mail. */
export const INFORMATIONAL_REASONS: readonly string[] = ["JOB_PAUSED_AUTHORIZED"];

/** Limite de e-mails de incidentes do agendador por execução da rota (o excedente segue na próxima, sem perda). */
export const MAX_SCHEDULER_EMAILS_PER_RUN = 10;

/** Endereços que nunca recebem alerta técnico (cadastro oficial do piloto WEG, 27/11/2026). */
export const SCHEDULER_ALERT_FORBIDDEN_RECIPIENTS: readonly string[] = ["carla@axion.com.br", "axion@axion.com.br", "acc@axion.com.br"];

export type CronJobState = "ACTIVE" | "PAUSED_AUTHORIZED" | "INACTIVE_UNAUTHORIZED" | "INACTIVE_AUTHORIZED_EXPIRED";

export type LivenessJob = {
  jobname: string;
  active: boolean;
  pause_open: boolean;
  pause_expires_at: string | null;
  pause_paused_by?: string | null;
};

export type SchedulerLiveness = {
  checked_at: string;
  cron_available: boolean;
  project_id: string | null;
  watchdog: { jobname: string; active: boolean; last_success_at: string | null; last_start_at: string | null; last_status: string | null } | null;
  jobs: LivenessJob[];
};

/** Nome do job sem o prefixo do pg_cron: acc-gmail-sync => gmail-sync (mesmo nome usado nos heartbeats e nos fingerprints). */
export function normalizeSchedulerJob(jobname: string): string {
  return jobname.replace(/^acc-/, "");
}

/** Espelha o SQL: inativo sem pausa aberta = inesperado; pausa com expires_at no passado = vencida; senão autorizada. */
export function classifyCronJob(job: LivenessJob, now: Date): CronJobState {
  if (job.active) return "ACTIVE";
  if (!job.pause_open) return "INACTIVE_UNAUTHORIZED";
  if (job.pause_expires_at && Date.parse(job.pause_expires_at) < now.getTime()) return "INACTIVE_AUTHORIZED_EXPIRED";
  return "PAUSED_AUTHORIZED";
}

/** Espelha o SQL: CONSECUTIVE_FAILURES quando as 3 últimas execuções CONCLUÍDAS (mais recente primeiro) falharam. */
export function hasConsecutiveFailures(statusesNewestFirst: readonly string[], threshold = 3): boolean {
  const finished = statusesNewestFirst.filter((s) => s === "succeeded" || s === "failed").slice(0, threshold);
  return finished.length === threshold && finished.every((s) => s === "failed");
}

export type WatchdogLivenessVerdict =
  | { stale: false; state: "OK" | "PAUSED_AUTHORIZED" }
  | { stale: true; cause: "CRON_UNAVAILABLE" | "WATCHDOG_JOB_MISSING" | "WATCHDOG_INACTIVE" | "WATCHDOG_PAUSE_EXPIRED" | "NO_RECENT_SUCCESS"; detail: string };

/** O supervisor está vivo? Pausa AUTORIZADA e válida do próprio acc-watchdog não é alarme (janela de congelamento). */
export function evaluateWatchdogLiveness(liveness: SchedulerLiveness, now: Date, maxSilenceMinutes = WATCHDOG_MAX_SILENCE_MINUTES): WatchdogLivenessVerdict {
  if (!liveness.cron_available) return { stale: true, cause: "CRON_UNAVAILABLE", detail: "pg_cron indisponível no banco" };
  const wd = liveness.watchdog;
  if (!wd) return { stale: true, cause: "WATCHDOG_JOB_MISSING", detail: `job ${WATCHDOG_JOBNAME} não existe no pg_cron` };
  if (!wd.active) {
    const job = liveness.jobs.find((j) => j.jobname === WATCHDOG_JOBNAME) ?? { jobname: WATCHDOG_JOBNAME, active: false, pause_open: false, pause_expires_at: null };
    const state = classifyCronJob({ ...job, active: false }, now);
    if (state === "PAUSED_AUTHORIZED") return { stale: false, state: "PAUSED_AUTHORIZED" };
    if (state === "INACTIVE_AUTHORIZED_EXPIRED") return { stale: true, cause: "WATCHDOG_PAUSE_EXPIRED", detail: `pausa autorizada do ${WATCHDOG_JOBNAME} vencida e o job continua desativado` };
    return { stale: true, cause: "WATCHDOG_INACTIVE", detail: `job ${WATCHDOG_JOBNAME} desativado no pg_cron sem pausa autorizada` };
  }
  const last = wd.last_success_at ? Date.parse(wd.last_success_at) : Number.NaN;
  if (!Number.isFinite(last) || now.getTime() - last > maxSilenceMinutes * 60_000) {
    return {
      stale: true,
      cause: "NO_RECENT_SUCCESS",
      detail: `${WATCHDOG_JOBNAME} sem execução bem-sucedida há mais de ${maxSilenceMinutes} minutos (última: ${wd.last_success_at ?? "nunca"}; último status: ${wd.last_status ?? "—"})`,
    };
  }
  return { stale: false, state: "OK" };
}

/** Resumo do incidente WATCHDOG_STALE; inclui as paradas inesperadas vistas DIRETAMENTE (o watchdog parado não as registra). */
export function buildWatchdogStaleSummary(verdict: Extract<WatchdogLivenessVerdict, { stale: true }>, liveness: SchedulerLiveness, now: Date): string {
  const unexpected = liveness.jobs
    .filter((j) => j.jobname !== WATCHDOG_JOBNAME)
    .filter((j) => {
      const s = classifyCronJob(j, now);
      return s === "INACTIVE_UNAUTHORIZED" || s === "INACTIVE_AUTHORIZED_EXPIRED";
    })
    .map((j) => j.jobname);
  const tail = unexpected.length ? ` Jobs desativados sem pausa autorizada válida: ${unexpected.join(", ")}.` : "";
  return `Supervisor do agendador parado: ${WATCHDOG_STALE_REASON} (${verdict.detail}). Paradas do pg_cron deixam de ser detectadas até a correção.${tail}`;
}

/** Jobs (nome normalizado) sob pausa AUTORIZADA e válida: falhas derivadas da própria pausa não viram e-mail. */
export function authorizedPausedJobs(liveness: SchedulerLiveness | null, now: Date): Set<string> {
  const out = new Set<string>();
  for (const job of liveness?.jobs ?? []) if (classifyCronJob(job, now) === "PAUSED_AUTHORIZED") out.add(normalizeSchedulerJob(job.jobname));
  return out;
}

export function parseSchedulerFingerprint(fingerprint: string): { job: string; reason: string } | null {
  const m = /^scheduler:([^:]+):([A-Z_]+)$/.exec(fingerprint);
  return m ? { job: m[1], reason: m[2] } : null;
}

export type SchedulerIncidentCategory =
  | "SUPERVISOR_PARADO"
  | "PARADA_INESPERADA"
  | "PAUSA_AUTORIZADA_VENCIDA"
  | "FALHAS_CONSECUTIVAS"
  | "IMPORTACAO_PARADA"
  | "FALHA_DO_AGENDADOR"
  | "PAUSA_AUTORIZADA";

export type SchedulerIncidentDecision = { email: boolean; category: SchedulerIncidentCategory; priority: number; label: string };

const CATEGORY_BY_REASON: Record<string, { category: SchedulerIncidentCategory; priority: number; label: string }> = {
  WATCHDOG_STALE: { category: "SUPERVISOR_PARADO", priority: 0, label: "SUPERVISOR DO AGENDADOR PARADO" },
  JOB_INACTIVE_UNAUTHORIZED: { category: "PARADA_INESPERADA", priority: 1, label: "PARADA INESPERADA" },
  JOB_INACTIVE_AUTHORIZED_EXPIRED: { category: "PAUSA_AUTORIZADA_VENCIDA", priority: 2, label: "PAUSA AUTORIZADA VENCIDA" },
  CONSECUTIVE_FAILURES: { category: "FALHAS_CONSECUTIVAS", priority: 3, label: "FALHAS CONSECUTIVAS" },
  IMPORT_STALE: { category: "IMPORTACAO_PARADA", priority: 4, label: "IMPORTAÇÃO DE E-MAILS PARADA" },
};

/**
 * Decide se um incidente ABERTO do agendador vira e-mail. Parada autorizada (JOB_PAUSED_AUTHORIZED) e falhas de heartbeat de um job
 * sob pausa autorizada válida são informativas (sem e-mail). Motivo desconhecido => e-mail (falha segura: nunca silenciar).
 */
export function decideSchedulerIncident(fingerprint: string, pausedJobs: ReadonlySet<string>): SchedulerIncidentDecision {
  const parsed = parseSchedulerFingerprint(fingerprint);
  if (!parsed) return { email: true, category: "FALHA_DO_AGENDADOR", priority: 5, label: "FALHA DO AGENDADOR" };
  if (INFORMATIONAL_REASONS.includes(parsed.reason)) return { email: false, category: "PAUSA_AUTORIZADA", priority: 9, label: "PAUSA AUTORIZADA (informativo)" };
  const known = CATEGORY_BY_REASON[parsed.reason];
  if (known) return { email: true, ...known };
  // Falha de heartbeat (sem sucesso recente, disparo sem início...) de um job pausado com autorização: consequência esperada da pausa.
  if (pausedJobs.has(parsed.job)) return { email: false, category: "PAUSA_AUTORIZADA", priority: 9, label: "PAUSA AUTORIZADA (informativo)" };
  return { email: true, category: "FALHA_DO_AGENDADOR", priority: 5, label: "FALHA DO AGENDADOR" };
}

/** Texto do e-mail: classificação explícita + resumo do watchdog + orientação (nunca reativar job sem autorização). */
export function buildSchedulerIncidentEmailSummary(decision: SchedulerIncidentDecision, summary: string): string {
  const action =
    decision.category === "PAUSA_AUTORIZADA_VENCIDA" || decision.category === "PARADA_INESPERADA"
      ? " Ação: confirmar se a parada foi intencional; para retomar, executar o procedimento de retomada autorizado (ex.: 7-pg-cron-retomar.sql) — o ACC nunca reativa jobs sozinho."
      : " Ação: verificar o job no pg_cron (cron.job_run_details) e a execução correspondente.";
  return `${decision.label}: ${summary}${action}`.slice(0, 1000);
}

/** Destinatários do alerta técnico: minúsculas, sem duplicados e NUNCA os endereços proibidos (Carla, axion@, acc@). */
export function sanitizeSchedulerAlertRecipients(recipients: readonly string[]): string[] {
  const forbidden = new Set(SCHEDULER_ALERT_FORBIDDEN_RECIPIENTS);
  return [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter((r) => r && !forbidden.has(r)))];
}

/** Ordem de envio: mais grave primeiro, depois o mais antigo; limitado por execução. */
export function selectSchedulerIncidentsToEmail<T extends { fingerprint: string; first_detected_at: string }>(
  incidents: readonly T[],
  pausedJobs: ReadonlySet<string>,
  limit = MAX_SCHEDULER_EMAILS_PER_RUN
): { toEmail: Array<T & { decision: SchedulerIncidentDecision }>; informational: number; deferred: number } {
  const decided = incidents.map((i) => ({ ...i, decision: decideSchedulerIncident(i.fingerprint, pausedJobs) }));
  const emailable = decided
    .filter((i) => i.decision.email)
    .sort((a, b) => a.decision.priority - b.decision.priority || a.first_detected_at.localeCompare(b.first_detected_at));
  return { toEmail: emailable.slice(0, limit), informational: decided.length - emailable.length, deferred: Math.max(0, emailable.length - limit) };
}
