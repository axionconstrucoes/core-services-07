// Estado EFETIVO de um serviço/integração (módulo puro, testável em
// scripts/test-integracoes-estado-efetivo.mjs).
//
// project_integrations.status é o estado DECLARADO (alguém configurou a
// fonte). Ele não diz se o job do agendador (pg_cron) está ligado, se a
// última execução deu certo nem se os dados estão frescos. Este módulo
// cruza o estado declarado com o estado do agendador (RPC
// acc_scheduler_status_for_project) e devolve um dos 7 estados abaixo,
// com motivo e ação recomendada. Regras (em ordem):
//   1. fonte não configurada / caixa não autorizada  => NAO_CONFIGURADO
//   2. bloqueio explícito (autorização expirada etc.) => BLOQUEADO
//   3. fonte com erro declarado                      => FALHA
//   4. caixa autorizada mas nunca sincronizada       => PARCIAL
//   5. estado do agendador indisponível (RPC ausente) => PARCIAL (nunca OPERACIONAL)
//   6. job não instalado ou inativo                  => DESLIGADO (nunca OPERACIONAL)
//   7. última falha posterior ao último sucesso       => FALHA
//   8. sem sucesso, ou último sucesso > 3× intervalo  => DESATUALIZADO
//   9. fonte em atenção/pendente                      => PARCIAL
//  10. caso contrário                                 => OPERACIONAL
// Fato (dados do agendador) e inferência (o estado) ficam separados: a UI
// mostra os carimbos de data crus ao lado do estado.

import { cronIntervalSeconds, humanizeCron, nextCronRun } from "./cron-next";

export type EffectiveStatus = "OPERACIONAL" | "PARCIAL" | "DESLIGADO" | "BLOQUEADO" | "FALHA" | "DESATUALIZADO" | "NAO_CONFIGURADO";

export const EFFECTIVE_STATUS_ORDER: EffectiveStatus[] = ["OPERACIONAL", "PARCIAL", "DESATUALIZADO", "DESLIGADO", "BLOQUEADO", "FALHA", "NAO_CONFIGURADO"];

export const EFFECTIVE_STATUS_LABEL: Record<EffectiveStatus, string> = {
  OPERACIONAL: "OPERACIONAL",
  PARCIAL: "PARCIAL",
  DESLIGADO: "DESLIGADO",
  BLOQUEADO: "BLOQUEADO",
  FALHA: "FALHA",
  DESATUALIZADO: "DESATUALIZADO",
  NAO_CONFIGURADO: "NÃO CONFIGURADO",
};

export type EffectiveStatusTone = "ok" | "warning" | "error" | "neutral";

export const EFFECTIVE_STATUS_TONE: Record<EffectiveStatus, EffectiveStatusTone> = {
  OPERACIONAL: "ok",
  PARCIAL: "warning",
  DESATUALIZADO: "warning",
  DESLIGADO: "error",
  BLOQUEADO: "error",
  FALHA: "error",
  NAO_CONFIGURADO: "neutral",
};

/** Múltiplo do intervalo esperado a partir do qual o último sucesso é considerado velho. */
export const STALE_INTERVAL_MULTIPLIER = 3;

export const SCHEDULER_UNAVAILABLE_REASON = "estado do agendador indisponível";

/** Linha da RPC acc_scheduler_status_for_project (snake_case como vem do PostgREST). */
export interface SchedulerJobRow {
  jobname: string;
  schedule: string | null;
  active: boolean | null;
  heartbeat_job: string | null;
  kind: string | null;
  expected_interval_seconds: number | null;
  last_dispatch_at: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_code: string | null;
  last_conclusion: string | null;
  last_run_started_at: string | null;
  last_run_ended_at: string | null;
  last_run_status: string | null;
  last_run_succeeded_at: string | null;
  last_run_failed_at: string | null;
  frozen_saved_active: boolean | null;
  frozen_saved_at: string | null;
  open_incidents: number | null;
  open_incident_summary: string | null;
}

export type SchedulerSnapshot = { available: true; jobs: SchedulerJobRow[] } | { available: false; reason: string };

export interface EffectiveStatusInput {
  /** Fonte cadastrada/configurada para o projeto (serviços globais do agendador: sempre true). */
  configured: boolean;
  /** Estado declarado (project_integrations.status ou equivalente). */
  declaredStatus?: "CONECTADO" | "PENDENTE" | "ATENCAO" | "ERRO" | "PARCIAL" | null;
  declaredDetail?: string | null;
  /** Bloqueio explícito (ex.: autorização da caixa expirada, credencial ausente). */
  blockedReason?: string | null;
  /** Nome do job pg_cron que alimenta a fonte; null = fonte manual (sem agendamento). */
  jobname: string | null;
  scheduler: SchedulerSnapshot;
  /** Só para e-mail: caixa autorizada e se já houve alguma sincronização concluída. */
  mailbox?: { authorized: boolean; everSynced: boolean } | null;
  volume?: { processed?: number | null; pending?: number | null } | null;
  now: Date;
}

export interface EffectiveStatusResult {
  status: EffectiveStatus;
  label: string;
  tone: EffectiveStatusTone;
  frequency: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextRunAt: string | null;
  processed: number | null;
  pending: number | null;
  reason: string;
  action: string;
  jobname: string | null;
  jobActive: boolean | null;
  openIncidents: number;
}

function ts(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function latest(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const v of values) {
    const t = ts(v);
    if (t !== null && t > bestT) {
      bestT = t;
      best = v ?? null;
    }
  }
  return best;
}

/** dd/mm/aaaa hh:mm em Brasília (texto do motivo). */
export function fmtDateTimeBrt(value: string | null | undefined): string {
  const t = ts(value);
  if (t === null) return "—";
  return new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtInterval(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} dia(s)`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  return `${Math.round(seconds / 60)} min`;
}

function fmtAge(ms: number): string {
  const h = ms / 3_600_000;
  if (h >= 48) return `${Math.floor(h / 24)} dias`;
  if (h >= 1) return `${Math.floor(h)} h`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}

/**
 * Último sucesso/falha "de verdade": o heartbeat (início/conclusão do
 * workflow ou HTTP da rota) prevalece; sem heartbeat (ex.: watchdog),
 * usa o estado da execução registrada em cron.job_run_details.
 */
export function jobTimeline(job: SchedulerJobRow): { lastRunAt: string | null; lastSuccessAt: string | null; lastFailureAt: string | null } {
  const hasHeartbeat = Boolean(job.heartbeat_job);
  return {
    lastRunAt: latest(job.last_run_started_at, job.last_started_at, job.last_dispatch_at),
    lastSuccessAt: hasHeartbeat ? job.last_success_at : job.last_run_succeeded_at,
    lastFailureAt: hasHeartbeat ? job.last_failure_at : job.last_run_failed_at,
  };
}

export function resolveEffectiveStatus(input: EffectiveStatusInput): EffectiveStatusResult {
  const job = input.jobname && input.scheduler.available ? input.scheduler.jobs.find((j) => j.jobname === input.jobname) ?? null : null;
  const timeline = job ? jobTimeline(job) : { lastRunAt: null, lastSuccessAt: null, lastFailureAt: null };
  const frequency = input.jobname === null ? "manual (sem agendamento)" : job ? humanizeCron(job.schedule) : "—";
  const nextRunAt = job && job.active ? nextCronRun(job.schedule, input.now)?.toISOString() ?? null : null;

  const make = (status: EffectiveStatus, reason: string, action: string): EffectiveStatusResult => ({
    status,
    label: EFFECTIVE_STATUS_LABEL[status],
    tone: EFFECTIVE_STATUS_TONE[status],
    frequency,
    ...timeline,
    nextRunAt,
    processed: input.volume?.processed ?? null,
    pending: input.volume?.pending ?? null,
    reason,
    action,
    jobname: input.jobname,
    jobActive: job ? job.active : null,
    openIncidents: job?.open_incidents ?? 0,
  });

  // 1. Não configurado.
  if (!input.configured) {
    return make("NAO_CONFIGURADO", "fonte não configurada para este projeto", "Configurar a fonte nesta tela (Administrador).");
  }
  if (input.mailbox && !input.mailbox.authorized) {
    return make("NAO_CONFIGURADO", "nenhuma caixa de e-mail autorizada/conectada", "Autorizar a caixa em Integrações › Caixas de e-mail.");
  }
  // 2. Bloqueio explícito.
  if (input.blockedReason) {
    return make("BLOQUEADO", input.blockedReason, "Renovar a autorização/credencial da fonte e verificar novamente.");
  }
  // 3. Erro declarado pela própria fonte.
  if (input.declaredStatus === "ERRO") {
    return make("FALHA", input.declaredDetail?.trim() || "a fonte registrou erro na última verificação", "Abrir o cartão da fonte, corrigir a configuração e validar a conexão.");
  }
  // 4. Caixa autorizada mas nunca sincronizada.
  if (input.mailbox && !input.mailbox.everSynced) {
    return make("PARCIAL", "caixa autorizada, mas nenhuma sincronização concluída até agora", "Confirmar a sincronização e acompanhar a próxima execução do agendador.");
  }

  // Fonte manual (sem job): só o estado declarado.
  if (input.jobname === null) {
    if (input.declaredStatus === "CONECTADO") return make("OPERACIONAL", "fonte manual configurada (sem agendamento automático)", "Nenhuma ação necessária.");
    return make("PARCIAL", input.declaredDetail?.trim() || "configuração incompleta ou em atenção", "Completar a configuração da fonte.");
  }

  // 5. Agendador indisponível: nunca OPERACIONAL.
  if (!input.scheduler.available) {
    return make("PARCIAL", SCHEDULER_UNAVAILABLE_REASON, "Solicitar ao responsável técnico a habilitação da leitura do agendador (função acc_scheduler_status_for_project) ou verificar o acesso.");
  }
  // 6. Job ausente ou desligado.
  if (!job) {
    return make("DESLIGADO", `job ${input.jobname} não instalado no agendador`, "Instalar/reativar o job no pg_cron (decisão do responsável técnico).");
  }
  if (job.active === null) {
    return make("PARCIAL", SCHEDULER_UNAVAILABLE_REASON, "Verificar a extensão pg_cron neste ambiente.");
  }
  if (!job.active) {
    const frozen = job.frozen_saved_active === true && job.frozen_saved_at
      ? ` — pausado na janela de congelamento (estado salvo como ativo em ${fmtDateTimeBrt(job.frozen_saved_at)})`
      : "";
    return make("DESLIGADO", `job ${job.jobname} inativo no agendador${frozen}; a fonte não é atualizada automaticamente`, "Reativar o job (cron.alter_job active=true) somente com autorização do responsável.");
  }

  const success = ts(timeline.lastSuccessAt);
  const failure = ts(timeline.lastFailureAt);
  // 7. Falha mais recente que o último sucesso.
  if (failure !== null && (success === null || failure > success)) {
    const code = job.last_failure_code ? ` (código ${job.last_failure_code})` : "";
    const incident = job.open_incident_summary ? ` — incidente aberto: ${job.open_incident_summary}` : "";
    return make("FALHA", `última execução falhou${code}${incident}`, "Ver o log da última execução (GitHub Actions/Vercel) e o incidente do agendador; corrigir e aguardar o próximo ciclo.");
  }

  // 8. Sem sucesso ou sucesso velho.
  const intervalSeconds = job.expected_interval_seconds ?? cronIntervalSeconds(job.schedule);
  if (success === null) {
    return make("DESATUALIZADO", "job ativo, mas sem nenhuma execução bem-sucedida registrada", "Verificar se o job está disparando e se o workflow/rota registra o heartbeat.");
  }
  if (intervalSeconds && input.now.getTime() - success > STALE_INTERVAL_MULTIPLIER * intervalSeconds * 1000) {
    return make(
      "DESATUALIZADO",
      `último sucesso há ${fmtAge(input.now.getTime() - success)} (esperado a cada ${fmtInterval(intervalSeconds)}; limite ${STALE_INTERVAL_MULTIPLIER}×)`,
      "Verificar por que o job não conclui com sucesso (disparo, workflow, credenciais)."
    );
  }

  // 9. Estado declarado ainda incompleto.
  if (input.declaredStatus && input.declaredStatus !== "CONECTADO") {
    return make("PARCIAL", input.declaredDetail?.trim() || "agendador em dia, mas a configuração da fonte está incompleta ou em atenção", "Completar/validar a configuração da fonte.");
  }

  // 10. Tudo comprovado.
  return make("OPERACIONAL", "job ativo e último sucesso dentro do intervalo esperado", "Nenhuma ação necessária.");
}

/** Fonte do projeto -> job do agendador que a alimenta (null = sem agendamento automático). */
export const SOURCE_SCHEDULER_JOB: Readonly<Record<string, string | null>> = {
  EMAIL: "acc-gmail-sync",
  DIARIO_OBRA: "acc-diario",
  CONSTRUMANAGER: "acc-construmanager",
  ESG_SSMA: "acc-ssma-drive",
  CRONOGRAMA: "acc-mpp-worker",
  RELATORIO_SEMANAL: "acc-document-worker",
};

/** Descrição dos jobs globais (serviços do ACC, não de uma fonte específica). */
export const SCHEDULER_JOB_LABEL: Readonly<Record<string, string>> = {
  "acc-risk-alerts": "Alertas de risco (envio/leitura)",
  "acc-ssma-notifications": "Notificações SSMA",
  "acc-weekly-all": "Rotina semanal (e-mail, respostas, planejamento)",
  "acc-document-worker": "Processamento de documentos",
  "acc-mpp-worker": "Processamento de cronogramas (MPP)",
  "acc-gmail-sync": "Sincronização Gmail",
  "acc-ssma-drive": "Fotos SSMA no Google Drive",
  "acc-construmanager": "Coleta Construmanager",
  "acc-diario": "Coleta Diário de Obra",
  "acc-watchdog": "Vigia do agendador (watchdog)",
  "acc-cron-history-cleanup": "Limpeza do histórico do agendador",
};

/** Estado efetivo de cada job do agendador como serviço do ACC (sem estado declarado de fonte). */
export function resolveSchedulerServices(scheduler: SchedulerSnapshot, now: Date): Array<EffectiveStatusResult & { serviceLabel: string }> {
  if (!scheduler.available) return [];
  return scheduler.jobs.map((job) => {
    const result = resolveEffectiveStatus({ configured: true, jobname: job.jobname, scheduler, now });
    return { ...result, serviceLabel: SCHEDULER_JOB_LABEL[job.jobname] ?? job.jobname };
  });
}

/**
 * Dashboard executivo: devolve o estado efetivo SOMENTE quando ele
 * rebaixa uma fonte automática exibida como conectada/parcial/atenção
 * (job desligado, em falha, atrasado ou agendador ilegível). null =
 * manter o selo atual (fonte manual, pendente/erro já sinalizados, ou
 * estado efetivo OPERACIONAL).
 */
export function dashboardEffectiveStatus(
  sourceType: string,
  displayStatus: string,
  scheduler: SchedulerSnapshot,
  now: Date
): EffectiveStatusResult | null {
  const jobname = SOURCE_SCHEDULER_JOB[sourceType];
  if (!jobname) return null;
  if (displayStatus !== "CONECTADO" && displayStatus !== "PARCIAL" && displayStatus !== "ATENCAO") return null;
  const result = resolveEffectiveStatus({ configured: true, declaredStatus: displayStatus, jobname, scheduler, now });
  if (result.status === "OPERACIONAL") return null;
  if (result.status === "PARCIAL" && displayStatus !== "CONECTADO" && scheduler.available) return null;
  return result;
}
