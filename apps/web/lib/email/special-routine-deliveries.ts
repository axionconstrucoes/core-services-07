import "server-only";

import type { createSupabaseAdminClient } from "@axion/db/admin";
import { getAppBaseUrl } from "@/lib/app-base-url";

import { deliverInformative, INFORMATIVE_MAX_ATTEMPTS, type InformativeAuditEvent, type InformativeDeliverySummary } from "./informative-delivery";
import { createInformativeDeliveryStore } from "./informative-delivery-store";
import { sendSsmaAccidentAlertEmail } from "./send-ssma-accident-alert-email";
import { sendSystemHealthAlertEmail } from "./send-system-health-alert-email";
import { sendVersionImpactReviewEmail } from "./send-version-impact-review-email";

// Entrega com outbox persistente das ROTINAS ESPECIAIS (acidente SSMA, falha técnica, revisão de impacto de versão).
// Cada evento é recarregado do banco (nada vem do navegador além do id): a mesma função atende o envio imediato e a
// retentativa automática (sweepSpecialRoutineRetries, chamada pelo cron remoto /api/cron/system-health).

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Retentativa automática só de eventos recentes: comunicação antiga reenviada confundiria mais do que informaria. */
export const SPECIAL_ROUTINE_RETRY_WINDOW_HOURS = 48;

const projectLabel = (project: { code?: string | null; name?: string | null } | null | undefined, fallback: string) =>
  `${project?.code ?? ""} — ${project?.name ?? fallback}`.replace(/^ — /, "");

function auditWriter(admin: Admin, projectId: string, entityType: string, entityId: string) {
  // actor_type SYSTEM exige actor_user_id e actor_label nulos (constraint de audit_log_entries).
  return async (event: InformativeAuditEvent) => {
    await admin.from("audit_log_entries").insert({
      project_id: projectId,
      actor_type: "SYSTEM",
      actor_user_id: null,
      actor_label: null,
      action: event.action,
      entity_type: entityType,
      entity_id: entityId,
      detail: event.detail,
    });
  };
}

// ---------------------------------------------------------------- acidente SSMA

export type AccidentDeliveryResult =
  | { kind: "NOT_FOUND" }
  | { kind: "NO_RECIPIENTS" }
  | { kind: "DONE"; summary: InformativeDeliverySummary; recipients: number };

export async function deliverAccidentNotifications(admin: Admin, submissionId: string, nowIso = new Date().toISOString()): Promise<AccidentDeliveryResult> {
  const { data: submission } = await admin
    .from("ssma_form_submissions")
    .select("id,project_id,checklist_slug,status,occurred_at,field_values,risk_level")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission || submission.checklist_slug !== "ocorrencia-acidente" || submission.status !== "SUBMITTED") return { kind: "NOT_FOUND" };
  const projectId = String(submission.project_id);
  const [{ data: project }, { data: memberships }] = await Promise.all([
    admin.from("projects").select("name,code").eq("id", projectId).single(),
    admin.from("project_memberships").select("user_id,area").eq("project_id", projectId).eq("status", "ACTIVE"),
  ]);
  const fieldValues = (submission.field_values ?? {}) as Record<string, unknown>;
  const withLeave = fieldValues.afastamento === "Com afastamento";
  // Destinatários: regra existente (Engenharia; Comercial quando há afastamento) — inalterada.
  const targetIds = ((memberships ?? []) as Array<{ user_id: string; area: string | null }>)
    .filter((m) => m.area === "ENGENHARIA" || (withLeave && m.area === "COMERCIAL"))
    .map((m) => m.user_id);
  const { data: profiles } = targetIds.length ? await admin.from("profiles").select("id,name,email").in("id", [...new Set(targetIds)]) : { data: [] };
  const recipients = ((profiles ?? []) as Array<{ name: string; email: string | null }>).filter((p) => p.email).map((p) => ({ email: String(p.email), name: p.name }));
  if (recipients.length === 0) return { kind: "NO_RECIPIENTS" };

  const occurredAt = new Date(String(submission.occurred_at)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const summary = await deliverInformative({
    store: createInformativeDeliveryStore(admin, { table: "ssma_accident_notification_deliveries", eventColumn: "submission_id", extra: { project_id: projectId } }, submissionId),
    recipients,
    nowIso,
    label: `Ocorrência/acidente ${submissionId.slice(0, 8).toUpperCase()}`,
    audit: auditWriter(admin, projectId, "SSMA_FORM_SUBMISSION", submissionId),
    deliverMessage: async (recipient) => {
      const result = await sendSsmaAccidentAlertEmail({
        projectId,
        submissionId,
        projectName: projectLabel(project, "Obra"),
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        severity: submission.risk_level === "CRITICA" ? "CRITICA" : "ALTA",
        employeeName: String(fieldValues.funcionario ?? ""),
        leaveClassification: String(fieldValues.afastamento ?? ""),
        occurredAt,
        informedCause: String(fieldValues.causa ?? ""),
        consultUrl: `${getAppBaseUrl()}/${projectId}/ssma-registros`,
      });
      return { provider: result.provider, providerMessageId: result.providerMessageId, sentAt: result.sentAt };
    },
  });
  return { kind: "DONE", summary, recipients: recipients.length };
}

// ---------------------------------------------------------------- revisão de impacto de versão

export async function deliverVersionReviewNotifications(admin: Admin, reviewId: string, nowIso = new Date().toISOString()): Promise<InformativeDeliverySummary | null> {
  const { data: review } = await admin
    .from("construmanager_version_impact_reviews")
    .select("id,project_id,transition_id,schedule_impact,price_impact,planning_response,send_to_budget,budget_user_id,status")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return null;
  const projectId = String(review.project_id);
  const [{ data: project }, { data: transition }, { data: memberships }] = await Promise.all([
    admin.from("projects").select("name").eq("id", projectId).single(),
    admin.from("construmanager_version_transitions").select("document_name,previous_revision,new_revision").eq("id", review.transition_id).single(),
    admin.from("project_memberships").select("user_id,permission,area,profiles(name,email,title)").eq("project_id", projectId).eq("status", "ACTIVE"),
  ]);
  const sendToBudget = Boolean(review.send_to_budget);
  const budgetUserId = (review.budget_user_id as string | null) ?? null;
  // Destinatários: regra existente (gerente, diretoria, diretor comercial e orçamentista designado) — inalterada.
  const recipients = (memberships ?? []).flatMap((membership) => {
    const rawProfile = membership.profiles as unknown as { name: string; email: string; title: string | null } | Array<{ name: string; email: string; title: string | null }> | null;
    const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
    const title = profile?.title ?? "";
    const isBudget = sendToBudget && membership.user_id === budgetUserId;
    const mustReceive = membership.permission === "GERENTE" || membership.area === "DIRETORIA" || (membership.area === "COMERCIAL" && /diretor/i.test(title)) || isBudget;
    return mustReceive && profile?.email ? [{ email: profile.email.toLowerCase(), name: profile.name, isBudget }] : [];
  });
  const budgetEmails = new Set(recipients.filter((r) => r.isBudget).map((r) => r.email));
  const accUrl = `${getAppBaseUrl()}/${projectId}/integracoes`;
  return deliverInformative({
    store: createInformativeDeliveryStore(admin, { table: "construmanager_version_review_deliveries", eventColumn: "review_id", extra: { project_id: projectId } }, reviewId),
    recipients,
    nowIso,
    label: `Revisão de impacto de versão ${reviewId.slice(0, 8).toUpperCase()}`,
    audit: auditWriter(admin, projectId, "CONSTRUMANAGER_VERSION_REVIEW", reviewId),
    deliverMessage: async (recipient) => {
      const result = await sendVersionImpactReviewEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        projectName: project?.name ?? "Projeto",
        documentName: transition?.document_name ?? "Documento sem nome",
        previousRevision: transition?.previous_revision ?? null,
        newRevision: transition?.new_revision ?? "—",
        scheduleImpact: String(review.schedule_impact),
        priceImpact: String(review.price_impact),
        response: String(review.planning_response),
        sentToBudget: sendToBudget,
        // Ação real só enquanto a resposta do Orçamento estiver pendente.
        isDesignatedBudgetReviewer: budgetEmails.has(recipient.email) && review.status === "PENDENTE_ORCAMENTO",
        accUrl,
        projectId,
      });
      return { provider: result.provider, providerMessageId: result.providerMessageId, sentAt: result.sentAt };
    },
  });
}

// ---------------------------------------------------------------- falha técnica

export async function deliverSystemHealthIncident(
  admin: Admin,
  incident: { id: string; projectId: string; projectName: string; sourceType: string; summary: string },
  recipients: readonly string[],
  nowIso = new Date().toISOString()
): Promise<InformativeDeliverySummary> {
  return deliverInformative({
    store: createInformativeDeliveryStore(admin, { table: "acc_system_health_alert_deliveries", eventColumn: "incident_id", extra: { project_id: incident.projectId } }, incident.id),
    recipients: recipients.map((email) => ({ email, name: null })),
    nowIso,
    label: `Falha operacional ${incident.sourceType}`,
    audit: auditWriter(admin, incident.projectId, "PROJECT_INTEGRATION", `${incident.projectId}:${incident.sourceType}`),
    deliverMessage: async (recipient) => {
      const result = await sendSystemHealthAlertEmail({
        recipientEmail: recipient.email,
        projectName: incident.projectName,
        sourceType: incident.sourceType,
        summary: incident.summary,
        auditUrl: `${getAppBaseUrl()}/${incident.projectId}/auditoria?tipo=INTEGRACOES`,
        projectId: incident.projectId,
      });
      return { provider: result.provider, providerMessageId: result.providerMessageId, sentAt: result.sentAt };
    },
  });
}

// ---------------------------------------------------------------- retentativa automática (cron remoto)

/** Eventos recentes com entregas ainda retentáveis (PENDING/FAILED transitória, tentativas restantes). */
async function retryableEventIds(admin: Admin, table: "ssma_accident_notification_deliveries" | "construmanager_version_review_deliveries", eventColumn: "submission_id" | "review_id", nowIso: string): Promise<string[]> {
  const since = new Date(Date.parse(nowIso) - SPECIAL_ROUTINE_RETRY_WINDOW_HOURS * 3600e3).toISOString();
  const { data } = await admin
    .from(table)
    .select(eventColumn)
    .in("status", ["PENDING", "FAILED"])
    .lt("attempt_count", INFORMATIVE_MAX_ATTEMPTS)
    .or("failure_class.is.null,failure_class.eq.RETRYABLE")
    .gte("created_at", since)
    .limit(200);
  return [...new Set(((data ?? []) as Array<Record<string, unknown>>).map((row) => String(row[eventColumn])))];
}

export async function sweepSpecialRoutineRetries(admin: Admin, nowIso = new Date().toISOString()) {
  const result = { accidents: 0, versionReviews: 0, accepted: 0, failures: 0 };
  for (const submissionId of await retryableEventIds(admin, "ssma_accident_notification_deliveries", "submission_id", nowIso)) {
    const out = await deliverAccidentNotifications(admin, submissionId, nowIso);
    result.accidents += 1;
    if (out.kind === "DONE") {
      result.accepted += out.summary.accepted;
      result.failures += out.summary.retryableFailures + out.summary.terminalFailures;
    }
  }
  for (const reviewId of await retryableEventIds(admin, "construmanager_version_review_deliveries", "review_id", nowIso)) {
    const summary = await deliverVersionReviewNotifications(admin, reviewId, nowIso);
    result.versionReviews += 1;
    if (summary) {
      result.accepted += summary.accepted;
      result.failures += summary.retryableFailures + summary.terminalFailures;
    }
  }
  return result;
}
