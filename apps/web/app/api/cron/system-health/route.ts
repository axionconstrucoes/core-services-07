import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@axion/db/admin";
import { isCronRequestAuthorized } from "@/lib/cron/cron-request-auth";
import {
  buildSchedulerIncidentEmailSummary,
  buildWatchdogStaleSummary,
  authorizedPausedJobs,
  evaluateWatchdogLiveness,
  sanitizeSchedulerAlertRecipients,
  selectSchedulerIncidentsToEmail,
  WATCHDOG_STALE_FINGERPRINT,
  type SchedulerLiveness,
} from "@/lib/cron/scheduler-supervision";
import { informativeDeliveryOk } from "@/lib/email/informative-delivery";
import { deliverSystemHealthIncident, sweepSpecialRoutineRetries } from "@/lib/email/special-routine-deliveries";

export const runtime = "nodejs";
export const maxDuration = 300;

// Cadastro oficial do piloto WEG (27/11/2026): alerta técnico vai à Diretoria (Reynaldo, administrador e supervisão de todos os
// pilares). crm@axion.com.br recebe a cópia institucional obrigatória pelo perfil do projeto piloto — não é destinatário lógico.
// Carla (FINANCEIRO) não recebe falhas técnicas de integração.
const ADMIN_RECIPIENTS = ["reynaldo@axion.com.br"];

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function sanitize(value: unknown, max = 500): string {
  return String(value ?? "Falha de integração sem detalhe")
    .replace(/(token|secret|password|authorization)\s*[:=]\s*\S+/gi, "$1=[REMOVIDO]")
    .slice(0, max);
}

// Supervisão operacional (Vercel Cron, Bearer CRON_SECRET). Alerta técnico INFORMATIVO por incidente (uma impressão
// digital por projeto) com entrega por destinatário em acc_system_health_alert_deliveries: falha transitória é
// retentada na execução seguinte (limite de tentativas), falha permanente/incerta fica registrada sem repetição.
// Também retenta as entregas recentes de acidente SSMA e revisão de versão (rede de segurança da outbox).
export async function GET(request: Request) {
  // Bearer CRON_SECRET só no header (tempo constante; sem segredo => 401).
  if (!isCronRequestAuthorized(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data: integrations, error } = await admin
    .from("project_integrations")
    .select("project_id,source_type,status,last_connection_error,projects!inner(name,code)")
    .or("status.in.(ATENCAO,ERRO),last_connection_error.not.is.null");
  if (error) return Response.json({ error: "Falha ao verificar integrações." }, { status: 500 });

  let created = 0;
  let sent = 0;
  let failed = 0;
  for (const row of integrations ?? []) {
    const summary = sanitize(row.last_connection_error ?? `Integração em estado ${row.status}.`);
    const fingerprint = createHash("sha256")
      .update(`${row.source_type}|${row.status}|${summary.toLocaleLowerCase("pt-BR")}`)
      .digest("hex");
    const { data: inserted } = await admin
      .from("acc_system_health_incidents")
      .upsert({
        project_id: row.project_id,
        source_type: row.source_type,
        fingerprint,
        summary,
        last_detected_at: nowIso,
      }, { onConflict: "project_id,fingerprint", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (inserted) created += 1;
    // Incidente existente: só segue se ainda houver entrega a concluir (notified_at nulo). As entregas já aceitas são
    // puladas pela outbox — nunca há segundo e-mail para a mesma falha e o mesmo destinatário.
    const { data: incident } = await admin
      .from("acc_system_health_incidents")
      .select("id,notified_at")
      .eq("project_id", row.project_id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (!incident || incident.notified_at) continue;
    const projectRef = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const projectName = `${projectRef?.code ?? ""} — ${projectRef?.name ?? "Projeto"}`.replace(/^ — /, "");
    const delivery = await deliverSystemHealthIncident(
      admin,
      { id: incident.id, projectId: row.project_id, projectName, sourceType: row.source_type, summary },
      ADMIN_RECIPIENTS,
      nowIso
    );
    // Falhas DESTA execução (linhas já terminais de execuções anteriores não são recontadas nem reauditadas).
    const incidentFailures = delivery.retryableFailures + delivery.terminalFailures + delivery.acceptedUnrecorded;
    sent += delivery.accepted;
    failed += incidentFailures;
    // notified_at = todos os destinatários com aceite do provedor (não é confirmação de entrega).
    if (informativeDeliveryOk(delivery) && delivery.claimedElsewhere === 0) {
      await admin.from("acc_system_health_incidents").update({ notified_at: nowIso }).eq("id", incident.id);
    }
    if (delivery.accepted === 0 && incidentFailures === 0) continue;
    // audit_log_entries exige actor_user_id IS NULL e actor_label IS NULL
    // para actor_type = 'SYSTEM' (constraint de 20260819195713); um label
    // não nulo fazia este INSERT falhar silenciosamente após o envio.
    await admin.from("audit_log_entries").insert({
      project_id: row.project_id,
      actor_type: "SYSTEM",
      actor_user_id: null,
      actor_label: null,
      action: incidentFailures === 0 ? "SYSTEM_HEALTH_ALERT_SENT" : "SYSTEM_HEALTH_ALERT_FAILED",
      entity_type: "PROJECT_INTEGRATION",
      entity_id: `${row.project_id}:${row.source_type}`,
      detail: `Falha operacional detectada em ${row.source_type}. ${delivery.accepted} aceite(s) do provedor (não é confirmação de entrega); ${incidentFailures} falha(s), ${delivery.retryableFailures} com nova tentativa automática.`,
    });
  }

  let scheduler: Awaited<ReturnType<typeof superviseScheduler>>;
  try {
    scheduler = await superviseScheduler(admin, new Date(nowIso), nowIso);
  } catch {
    scheduler = { watchdog: "ERRO", sent: 0, failed: 1, informational: 0, deferred: 0 };
  }
  sent += scheduler.sent;
  failed += scheduler.failed;

  let retries = { accidents: 0, versionReviews: 0, accepted: 0, failures: 0 };
  try {
    retries = await sweepSpecialRoutineRetries(admin, nowIso);
  } catch {
    failed += 1;
  }
  failed += retries.failures;
  return Response.json({ checked: integrations?.length ?? 0, created, sent, failed, retries, scheduler }, { status: failed > 0 ? 207 : 200 });
}

// Supervisão do agendador (pg_cron), independente do próprio pg_cron (esta rota roda pela Vercel Cron):
//   1. o supervisor (job acc-watchdog) está vivo? Sem execução bem-sucedida há mais de 30 min, desativado sem pausa autorizada ou com
//      pausa vencida => incidente WATCHDOG_STALE (resolvido automaticamente quando volta);
//   2. incidentes ABERTOS do agendador (watchdog SQL + WATCHDOG_STALE) ainda não notificados vão à Diretoria pela mesma outbox
//      idempotente das falhas técnicas (acc_system_health_alert_deliveries): um e-mail por incidente, nunca reenviado. Parada
//      AUTORIZADA (registro em acc_scheduler_authorized_pauses) é informativa: fica registrada, sem e-mail. O envio passa pelo
//      provedor governado (governor/kill switch, tipo SYSTEM_HEALTH) e pelo perfil do piloto (Cc crm@).
// Nunca reativa job: só lê o estado e registra/avisa.
async function superviseScheduler(admin: Admin, now: Date, nowIso: string) {
  const out = { watchdog: "OK" as string, sent: 0, failed: 0, informational: 0, deferred: 0 };
  const { data, error } = await admin.rpc("acc_scheduler_watchdog_liveness" as never);
  if (error || !data) {
    // Função ausente (migration 20261213100000 não aplicada) ou erro de leitura: registrado como falha desta execução (207).
    out.watchdog = "INDISPONIVEL";
    out.failed += 1;
    return out;
  }
  const liveness = data as unknown as SchedulerLiveness;
  const verdict = evaluateWatchdogLiveness(liveness, now);
  out.watchdog = verdict.stale ? `WATCHDOG_STALE:${verdict.cause}` : verdict.state;
  if (liveness.project_id) {
    if (verdict.stale) {
      await admin.from("acc_system_health_incidents").upsert(
        {
          project_id: liveness.project_id,
          source_type: "SCHEDULER",
          fingerprint: WATCHDOG_STALE_FINGERPRINT,
          status: "OPEN",
          summary: sanitize(buildWatchdogStaleSummary(verdict, liveness, now), 1000),
          last_detected_at: nowIso,
          resolved_at: null,
        },
        { onConflict: "project_id,fingerprint" }
      );
    } else {
      await admin
        .from("acc_system_health_incidents")
        .update({ status: "RESOLVED", resolved_at: nowIso })
        .eq("project_id", liveness.project_id)
        .eq("fingerprint", WATCHDOG_STALE_FINGERPRINT)
        .eq("status", "OPEN");
    }
  }

  const { data: open, error: openError } = await admin
    .from("acc_system_health_incidents")
    .select("id,project_id,fingerprint,summary,first_detected_at,projects!inner(name,code)")
    .eq("source_type", "SCHEDULER")
    .eq("status", "OPEN")
    .is("notified_at", null)
    .limit(500);
  if (openError) {
    out.failed += 1;
    return out;
  }
  const recipients = sanitizeSchedulerAlertRecipients(ADMIN_RECIPIENTS);
  const selection = selectSchedulerIncidentsToEmail(
    (open ?? []).map((row) => ({ ...row, fingerprint: String(row.fingerprint), first_detected_at: String(row.first_detected_at) })),
    authorizedPausedJobs(liveness, now)
  );
  out.informational = selection.informational;
  out.deferred = selection.deferred;
  for (const incident of selection.toEmail) {
    const projectRef = Array.isArray(incident.projects) ? incident.projects[0] : incident.projects;
    const projectName = `${projectRef?.code ?? ""} — ${projectRef?.name ?? "Projeto"}`.replace(/^ — /, "");
    const delivery = await deliverSystemHealthIncident(
      admin,
      {
        id: String(incident.id),
        projectId: String(incident.project_id),
        projectName,
        sourceType: "SCHEDULER",
        summary: sanitize(buildSchedulerIncidentEmailSummary(incident.decision, String(incident.summary)), 1000),
      },
      recipients,
      nowIso
    );
    out.sent += delivery.accepted;
    out.failed += delivery.retryableFailures + delivery.terminalFailures + delivery.acceptedUnrecorded;
    if (informativeDeliveryOk(delivery) && delivery.claimedElsewhere === 0) {
      await admin.from("acc_system_health_incidents").update({ notified_at: nowIso }).eq("id", incident.id);
    }
  }
  return out;
}
