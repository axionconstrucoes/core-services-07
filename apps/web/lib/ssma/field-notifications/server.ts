import "server-only";

// Ligação server-side das notificações de campo SSMA: armazenamento (service_role, só aqui), envio pelo provedor de
// e-mail do ACC (com TODAS as travas do piloto) e os dois gatilhos: registro CRÍTICO e varredura de ações em atraso.

import { createSupabaseAdminClient } from "@axion/db/admin";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { appendAccEmailSignature } from "@/lib/email/branding/acc-email-signature";
import { loadAccLogoInlineImage } from "@/lib/email/branding/load-acc-logo-inline-image";
import { EmailSendError, type EmailProvider } from "@/lib/email/email-provider";
import { getEmailProvider } from "@/lib/email/get-email-provider";
import {
  NO_RECIPIENT_PLACEHOLDER,
  notifyEvent,
  resolveRecipients,
  saoPauloDate,
  type DeliveryKey,
  type DeliveryStore,
  type Mailer,
  type MemberCandidate,
  type NotifyDeps,
  type NotifySummary,
} from "./core";
import { buildCriticalRecordEmail, buildOverdueActionEmail } from "./content";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const LEASE_MS = 10 * 60 * 1000;

export function createSupabaseDeliveryStore(admin: Admin): DeliveryStore {
  const keyFilter = (key: DeliveryKey, email: string) =>
    admin.from("ssma_field_notification_deliveries").select("id,status,attempt_count")
      .eq("record_id", key.recordId).eq("event", key.event).eq("event_date", key.eventDate).eq("recipient_email", email);
  return {
    async ensureDelivery(key, recipient) {
      const email = recipient.email.trim().toLowerCase();
      await admin.from("ssma_field_notification_deliveries").upsert(
        { project_id: key.projectId, record_id: key.recordId, action_id: key.actionId, event: key.event, event_date: key.eventDate, recipient_email: email, recipient_name: recipient.name, status: "PENDING" },
        { onConflict: "record_id,event,event_date,recipient_email", ignoreDuplicates: true }
      );
      const { data, error } = await keyFilter(key, email).single();
      if (error || !data) throw new Error("Não foi possível registrar a entrega da notificação.");
      return { id: data.id as string, status: data.status as "PENDING" | "SENT" | "FAILED" | "SUPPRESSED", attemptCount: Number(data.attempt_count) };
    },
    async ensureSuppressed(key, reason) {
      await admin.from("ssma_field_notification_deliveries").upsert(
        { project_id: key.projectId, record_id: key.recordId, action_id: key.actionId, event: key.event, event_date: key.eventDate, recipient_email: NO_RECIPIENT_PLACEHOLDER, status: "SUPPRESSED", suppression_reason: reason },
        { onConflict: "record_id,event,event_date,recipient_email", ignoreDuplicates: true }
      );
    },
    async claim(id) {
      const { data: row } = await admin.from("ssma_field_notification_deliveries").select("attempt_count,status,claimed_at").eq("id", id).single();
      if (!row || (row.status !== "PENDING" && row.status !== "FAILED")) return false;
      const stale = new Date(Date.now() - LEASE_MS).toISOString();
      const { data } = await admin.from("ssma_field_notification_deliveries")
        .update({ claimed_at: new Date().toISOString(), attempt_count: Number(row.attempt_count) + 1 })
        .eq("id", id).eq("attempt_count", row.attempt_count).in("status", ["PENDING", "FAILED"])
        .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
        .select("id");
      return (data?.length ?? 0) === 1;
    },
    async markSent(id, result) {
      await admin.from("ssma_field_notification_deliveries")
        .update({ status: "SENT", sent_at: result.sentAt, provider_message_id: result.providerMessageId, last_error: null, claimed_at: null }).eq("id", id);
    },
    async markFailed(id, error) {
      await admin.from("ssma_field_notification_deliveries").update({ status: "FAILED", last_error: error.slice(0, 2000), claimed_at: null }).eq("id", id);
    },
  };
}

/** Envio pelo provedor do ACC. As travas do piloto (modo piloto, destinatário único, perfil do projeto) rodam no provedor. */
export function createProviderMailer(admin: Admin, provider: EmailProvider = getEmailProvider()): Mailer {
  return {
    async send({ to, content, projectId, correlationId }) {
      const inlineLogo = loadAccLogoInlineImage();
      const signed = appendAccEmailSignature({ text: content.text, html: content.html }, inlineLogo !== null);
      let result;
      try {
        result = await provider.send({
          to, subject: content.subject, text: signed.text, html: signed.html,
          inlineImages: inlineLogo ? [inlineLogo] : undefined, correlationId, vera: { projectId, context: "ssma" },
        });
      } catch (error) {
        if (error instanceof EmailSendError) throw error;
        throw new EmailSendError("Falha inesperada ao enviar o aviso de SSMA.");
      }
      const { error: logError } = await admin.from("emails").insert({
        project_id: projectId, from_address: result.from, to_address: to, subject: content.subject, sent_at: result.sentAt, snippet: content.text.slice(0, 280),
      });
      if (logError) console.error("[ssma-notificacoes] registro em emails falhou (o envio já ocorreu).");
      return { providerMessageId: result.providerMessageId ?? null, sentAt: result.sentAt };
    },
  };
}

export function createNotifyDeps(admin: Admin, mailer: Mailer = createProviderMailer(admin)): NotifyDeps {
  return {
    store: createSupabaseDeliveryStore(admin),
    mailer,
    // actor_label DEVE ser nulo para SYSTEM (constraint de audit_log_entries).
    async audit({ projectId, action, entityId, detail }) {
      await admin.from("audit_log_entries").insert({
        project_id: projectId, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
        action, entity_type: "SSMA_FIELD_RECORD", entity_id: entityId, detail,
      });
    },
  };
}

async function loadMembers(admin: Admin, projectId: string): Promise<MemberCandidate[]> {
  const { data: memberships } = await admin.from("project_memberships").select("user_id,area,permission,status").eq("project_id", projectId).eq("status", "ACTIVE");
  const ids = [...new Set((memberships ?? []).map((m) => m.user_id as string))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,name,email").in("id", ids) : { data: [] as Array<{ id: string; name: string; email: string }> };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return (memberships ?? []).map((m) => ({
    userId: m.user_id as string, name: byId.get(m.user_id as string)?.name ?? null, email: byId.get(m.user_id as string)?.email ?? null,
    area: (m.area as string | null) ?? null, permission: m.permission as string, status: m.status as string,
  }));
}

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const fmtDate = (ymd: string) => ymd.split("-").reverse().join("/");

async function loadRecord(admin: Admin, recordId: string) {
  const { data: record } = await admin.from("ssma_field_records")
    .select("id,project_id,kind,category,description,location,occurred_at,risk_level,responsible_user_id,due_date,reported_by_user_id").eq("id", recordId).maybeSingle();
  if (!record) return null;
  const [{ data: project }, members] = await Promise.all([
    admin.from("projects").select("name,code").eq("id", record.project_id).single(),
    loadMembers(admin, record.project_id as string),
  ]);
  const projectName = `${project?.code ?? ""} — ${project?.name ?? "Obra"}`.replace(/^ — /, "");
  const nameOf = (id: string | null) => members.find((m) => m.userId === id)?.name ?? null;
  return { record, projectName, members, nameOf };
}

/** Registro CRÍTICO de campo: avisa Engenharia/SSMA-ESG e o responsável. Idempotente (1 aviso por registro e destinatário). */
export async function notifyCriticalRecord(admin: Admin, recordId: string, deps: NotifyDeps = createNotifyDeps(admin)): Promise<NotifySummary | { skipped: "NOT_FOUND" | "NOT_CRITICAL" }> {
  const loaded = await loadRecord(admin, recordId);
  if (!loaded) return { skipped: "NOT_FOUND" };
  const { record, projectName, members, nameOf } = loaded;
  if (record.risk_level !== "CRITICA") return { skipped: "NOT_CRITICAL" };
  const projectId = record.project_id as string;
  const { recipients, withoutEmail } = resolveRecipients({ event: "CRITICAL_RECORD", responsibleUserId: (record.responsible_user_id as string | null) ?? null, members });
  return notifyEvent(deps, {
    key: { projectId, recordId, actionId: null, event: "CRITICAL_RECORD", eventDate: saoPauloDate(record.occurred_at as string) },
    recipients, withoutEmail, entityLabel: `registro ${recordId}`,
    content: (recipient) => buildCriticalRecordEmail({
      projectName, recipientName: recipient.name, category: String(record.category), location: String(record.location), description: String(record.description),
      occurredAt: fmtDateTime(record.occurred_at as string), reportedByName: nameOf(record.reported_by_user_id as string) ?? "Usuário", accUrl: `${getAppBaseUrl()}/${projectId}/ssma-registros`,
    }),
  });
}

export interface SweepResult {
  criticalRecords: { checked: number; sent: number; failed: number; noRecipient: number };
  overdueActions: { checked: number; sent: number; failed: number; noRecipient: number };
}

/** Varredura (cron): ações corretivas em atraso + rede de segurança para registros críticos ainda não avisados. */
export async function sweepFieldNotifications(admin: Admin, options: { today?: string; deps?: NotifyDeps; criticalWindowDays?: number } = {}): Promise<SweepResult> {
  const today = options.today ?? saoPauloDate(new Date());
  const deps = options.deps ?? createNotifyDeps(admin);
  const result: SweepResult = { criticalRecords: { checked: 0, sent: 0, failed: 0, noRecipient: 0 }, overdueActions: { checked: 0, sent: 0, failed: 0, noRecipient: 0 } };
  const add = (bucket: SweepResult["criticalRecords"], summary: NotifySummary | { skipped: string }) => {
    bucket.checked += 1;
    if (!("sent" in summary)) return;
    bucket.sent += summary.sent; bucket.failed += summary.failed; if (summary.noRecipient) bucket.noRecipient += 1;
  };

  const since = new Date(Date.now() - (options.criticalWindowDays ?? 14) * 86_400_000).toISOString();
  const { data: criticals } = await admin.from("ssma_field_records").select("id").eq("risk_level", "CRITICA").gte("received_at", since).order("received_at", { ascending: true }).limit(200);
  for (const row of criticals ?? []) add(result.criticalRecords, await notifyCriticalRecord(admin, row.id as string, deps));

  const { data: overdue } = await admin.from("ssma_corrective_actions").select("id,record_id,project_id,responsible_user_id,due_date,status")
    .neq("status", "CONCLUIDA").lt("due_date", today).order("due_date", { ascending: true }).limit(200);
  for (const action of overdue ?? []) {
    const loaded = await loadRecord(admin, action.record_id as string);
    if (!loaded) continue;
    const { record, projectName, members, nameOf } = loaded;
    const dueDate = String(action.due_date);
    const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000));
    const { recipients, withoutEmail } = resolveRecipients({ event: "ACTION_OVERDUE", responsibleUserId: (action.responsible_user_id as string | null) ?? null, members });
    add(result.overdueActions, await notifyEvent(deps, {
      key: { projectId: action.project_id as string, recordId: record.id as string, actionId: action.id as string, event: "ACTION_OVERDUE", eventDate: dueDate },
      recipients, withoutEmail, entityLabel: `ação corretiva do registro ${record.id}`,
      content: (recipient) => buildOverdueActionEmail({
        projectName, recipientName: recipient.name, category: String(record.category), location: String(record.location), description: String(record.description),
        occurredAt: fmtDateTime(record.occurred_at as string), reportedByName: nameOf(record.reported_by_user_id as string) ?? "Usuário",
        accUrl: `${getAppBaseUrl()}/${action.project_id}/ssma-registros`, dueDate: fmtDate(dueDate), daysOverdue: days, responsibleName: nameOf(action.responsible_user_id as string | null),
      }),
    }));
  }
  return result;
}
