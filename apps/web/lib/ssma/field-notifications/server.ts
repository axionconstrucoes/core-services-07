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
import { buildCriticalRecordEmail, buildOperationalOverdueActionEmail, buildOverdueActionEmail, buildSsmaReplyConfirmationEmail } from "./content";
import { resolveSsmaNotificationScope, scopeAllowsProject, type SsmaNotificationScope } from "./enabled";
import {
  SSMA_REPLY_CONFIRMATION_CLAIMED,
  SSMA_REPLY_CONFIRMATION_PENDING,
  SSMA_REPLY_CONFIRMATION_SENT,
  SSMA_REPLY_ENTITY_TYPE,
  SSMA_REPLY_TOKEN_ISSUED,
  ssmaSeverityOf,
} from "./replies";
import { ALERT_REPLY_MAILBOX_ENV, buildAlertReplyAddress } from "@/lib/email/alert-reply-address";
import { generateReplyToken, hashReplyToken } from "@/lib/risk-alerts/replies/reply-pipeline";

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
    async deliver({ to, content, projectId, correlationId }) {
      const inlineLogo = loadAccLogoInlineImage();
      const signed = appendAccEmailSignature({ text: content.text, html: content.html }, inlineLogo !== null);
      // Resposta no corpo: o hash do token é registrado na auditoria da ação ANTES do envio (sem registro, nada sai).
      let replyTo: string | undefined;
      if (content.reply) {
        const mailbox = process.env[ALERT_REPLY_MAILBOX_ENV] ?? "";
        replyTo = buildAlertReplyAddress(mailbox, content.reply.token);
        const { error: tokenError } = await admin.from("audit_log_entries").insert({
          project_id: projectId, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
          action: SSMA_REPLY_TOKEN_ISSUED, entity_type: SSMA_REPLY_ENTITY_TYPE, entity_id: content.reply.actionId,
          detail: JSON.stringify({ tokenSha256: hashReplyToken(content.reply.token), recordId: content.reply.recordId, correlationId }),
        });
        if (tokenError) throw new EmailSendError("Não foi possível registrar o token de resposta — aviso não enviado.");
      }
      let result;
      try {
        result = await provider.send({
          to, subject: content.subject, text: signed.text, html: signed.html,
          inlineImages: inlineLogo ? [inlineLogo] : undefined, correlationId,
          // Mensagem operacional: sem o atalho da AXIA (serviço não habilitado) e sem faixa de teste; travas do piloto mantidas.
          ...(content.operational
            ? { pilot: { projectId, participantLabel: content.participantLabel ?? null, escalationLevel: "Responsável" } }
            : { vera: { projectId, context: "ssma" as const } }),
          ...(replyTo && content.reply ? { replyTo, replyToContext: { kind: "SSMA_CORRECTIVE_ACTION" as const, actionId: content.reply.actionId, recordId: content.reply.recordId } } : {}),
          ...(content.thread?.inReplyTo ? { inReplyTo: content.thread.inReplyTo, references: content.thread.references } : {}),
        });
      } catch (error) {
        if (error instanceof EmailSendError) throw error;
        throw new EmailSendError("Falha inesperada ao enviar o aviso de SSMA.");
      }
      const { error: logError } = await admin.from("emails").insert({
        project_id: projectId, from_address: result.from, to_address: to, subject: content.subject, sent_at: result.sentAt, snippet: content.text.slice(0, 280),
      });
      if (logError) console.error("[ssma-notificacoes] registro em emails falhou (o envio já ocorreu).");
      // Rastreabilidade do envio com resposta habilitada: ids do provedor (Gmail id, Message-ID, thread) para conferência na crm@.
      if (content.reply) {
        await admin.from("audit_log_entries").insert({
          project_id: projectId, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
          action: "SSMA_REPLY_NOTICE_SENT", entity_type: SSMA_REPLY_ENTITY_TYPE, entity_id: content.reply.actionId,
          detail: JSON.stringify({ providerMessageId: result.providerMessageId ?? null, messageIdHeader: result.messageIdHeader ?? null, providerThreadId: result.providerThreadId ?? null, correlationId, sentAt: result.sentAt, confirmation: Boolean(content.thread?.inReplyTo) }),
        });
      }
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
  scope: SsmaNotificationScope["mode"];
  criticalRecords: { checked: number; sent: number; failed: number; noRecipient: number };
  overdueActions: { checked: number; sent: number; failed: number; noRecipient: number };
  replyConfirmations: { pending: number; sent: number; failed: number; uncertain: number };
}

interface OverdueActionRow {
  id: string;
  record_id: string;
  project_id: string;
  responsible_user_id: string | null;
  due_date: string;
  status: string;
  sla_action_id: string | null;
}

/** Assunção do tratamento (transferência/reatribuição auditada) posterior ao prazo original — para o aviso operacional. */
async function loadTakeover(admin: Admin, action: OverdueActionRow, responsibleName: string | null): Promise<{ name: string; date: string } | null> {
  const ids = [action.id, action.sla_action_id].filter((v): v is string => Boolean(v));
  const { data } = await admin
    .from("audit_log_entries")
    .select("occurred_at,action")
    .in("entity_id", ids)
    .in("action", ["SLA_ACTION_RESPONSIBLE_TRANSFERRED", "ACTION_REASSIGNED"])
    .order("occurred_at", { ascending: false })
    .limit(1);
  const last = data?.[0];
  if (!last || !responsibleName) return null;
  const takeoverDay = saoPauloDate(last.occurred_at as string);
  if (takeoverDay <= action.due_date) return null; // assumiu antes do vencimento: não há atraso anterior a separar
  return { name: responsibleName, date: fmtDate(takeoverDay) };
}

async function loadOverdueActions(admin: Admin, scope: SsmaNotificationScope, today: string): Promise<OverdueActionRow[]> {
  let query = admin
    .from("ssma_corrective_actions")
    .select("id,record_id,project_id,responsible_user_id,due_date,status,sla_action_id")
    .neq("status", "CONCLUIDA")
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(200);
  if (scope.projectIds !== null) query = query.in("project_id", scope.projectIds);
  const { data } = await query;
  return ((data ?? []) as OverdueActionRow[]).filter((row) => scopeAllowsProject(scope, row.project_id));
}

/** Prévia SEM efeito (dry-run real): nada é gravado e nenhum provedor é chamado. Sem endereços na saída (log público). */
export async function previewOverdueActionNotifications(admin: Admin, options: { today?: string; scope?: SsmaNotificationScope } = {}) {
  const today = options.today ?? saoPauloDate(new Date());
  const scope = options.scope ?? resolveSsmaNotificationScope();
  if (!scope.overdueActions) return { scope: scope.mode, items: [] as Array<Record<string, unknown>> };
  const items: Array<Record<string, unknown>> = [];
  for (const action of await loadOverdueActions(admin, scope, today)) {
    const loaded = await loadRecord(admin, action.record_id);
    if (!loaded) continue;
    const { recipients } = resolveRecipients({ event: "ACTION_OVERDUE", responsibleUserId: action.responsible_user_id, members: loaded.members, responsibleOnly: scope.responsibleOnly });
    const { data: deliveries } = await admin.from("ssma_field_notification_deliveries").select("status").eq("record_id", action.record_id).eq("event", "ACTION_OVERDUE").eq("event_date", action.due_date);
    items.push({
      action: action.id.slice(0, 8),
      dueDate: action.due_date,
      recipients: recipients.length,
      recipientDomains: recipients.map((r) => r.email.split("@")[1]),
      cc: scope.operational ? ["institucional"] : [],
      alreadySent: (deliveries ?? []).filter((d) => d.status === "SENT").length,
      replyEnabled: scope.replyEnabled,
      operational: scope.operational,
    });
  }
  return { scope: scope.mode, items };
}

/** Varredura (cron): ações corretivas em atraso + rede de segurança para registros críticos ainda não avisados + confirmações de resposta. */
export async function sweepFieldNotifications(
  admin: Admin,
  options: { today?: string; deps?: NotifyDeps; criticalWindowDays?: number; scope?: SsmaNotificationScope } = {}
): Promise<SweepResult> {
  const today = options.today ?? saoPauloDate(new Date());
  const deps = options.deps ?? createNotifyDeps(admin);
  const scope = options.scope ?? resolveSsmaNotificationScope();
  const result: SweepResult = {
    scope: scope.mode,
    criticalRecords: { checked: 0, sent: 0, failed: 0, noRecipient: 0 },
    overdueActions: { checked: 0, sent: 0, failed: 0, noRecipient: 0 },
    replyConfirmations: { pending: 0, sent: 0, failed: 0, uncertain: 0 },
  };
  const add = (bucket: SweepResult["criticalRecords"], summary: NotifySummary | { skipped: string }) => {
    bucket.checked += 1;
    if (!("sent" in summary)) return;
    bucket.sent += summary.sent; bucket.failed += summary.failed; if (summary.noRecipient) bucket.noRecipient += 1;
  };

  if (scope.criticalRecords) {
    const since = new Date(Date.now() - (options.criticalWindowDays ?? 14) * 86_400_000).toISOString();
    const { data: criticals } = await admin.from("ssma_field_records").select("id,project_id").eq("risk_level", "CRITICA").gte("received_at", since).order("received_at", { ascending: true }).limit(200);
    for (const row of criticals ?? []) {
      if (!scopeAllowsProject(scope, row.project_id as string)) continue;
      add(result.criticalRecords, await notifyCriticalRecord(admin, row.id as string, deps));
    }
  }

  if (scope.overdueActions) {
    for (const action of await loadOverdueActions(admin, scope, today)) {
      const loaded = await loadRecord(admin, action.record_id);
      if (!loaded) continue;
      const { record, projectName, members, nameOf } = loaded;
      const dueDate = String(action.due_date);
      const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000));
      const responsibleName = nameOf(action.responsible_user_id);
      const { recipients, withoutEmail } = resolveRecipients({ event: "ACTION_OVERDUE", responsibleUserId: action.responsible_user_id, members, responsibleOnly: scope.responsibleOnly });
      const takeover = scope.operational ? await loadTakeover(admin, action, responsibleName) : null;
      const baseCtx = {
        projectName, category: String(record.category), location: String(record.location), description: String(record.description),
        occurredAt: fmtDateTime(record.occurred_at as string), reportedByName: nameOf(record.reported_by_user_id as string) ?? "Usuário",
        accUrl: `${getAppBaseUrl()}/${action.project_id}/ssma-registros`, dueDate: fmtDate(dueDate), daysOverdue: days, responsibleName,
      };
      add(result.overdueActions, await notifyEvent(deps, {
        key: { projectId: action.project_id, recordId: record.id as string, actionId: action.id, event: "ACTION_OVERDUE", eventDate: dueDate },
        recipients, withoutEmail, entityLabel: `ação corretiva do registro ${record.id}`,
        content: (recipient) => {
          if (!scope.operational) return buildOverdueActionEmail({ ...baseCtx, recipientName: recipient.name });
          const mail = buildOperationalOverdueActionEmail({
            ...baseCtx, recipientName: recipient.name, severity: ssmaSeverityOf(record.risk_level as string), takeover, visibleCode: action.id.slice(0, 8).toUpperCase(),
          });
          return {
            ...mail,
            participantLabel: recipient.name,
            ...(scope.replyEnabled ? { reply: { token: generateReplyToken(), actionId: action.id, recordId: record.id as string } } : {}),
          };
        },
      }));
    }
  }

  if (scope.replyEnabled) result.replyConfirmations = await sendPendingSsmaReplyConfirmations(admin, deps.mailer, scope);
  return result;
}

interface PendingConfirmation {
  providerMessageId: string;
  actionId: string;
  recordId: string;
  projectId: string;
  to: string;
  recipientName: string | null;
  inReplyTo: string | null;
  references: string[];
  originalSubject: string;
  statusLabel: string;
  forecastLine: string | null;
  pendingLine: string | null;
  outOfOrder: boolean;
}

/**
 * Confirmações de respostas já PERSISTIDAS pela fase `replies` (auditoria SSMA_REPLY_CONFIRMATION_PENDING).
 * Uma por mensagem processada. Reivindicação auditada antes do envio: reivindicada e não concluída => resultado INCERTO,
 * nunca reenviada automaticamente.
 */
export async function sendPendingSsmaReplyConfirmations(admin: Admin, mailer: Mailer, scope: SsmaNotificationScope) {
  const summary = { pending: 0, sent: 0, failed: 0, uncertain: 0 };
  if (!scope.replyEnabled || scope.projectIds === null) return summary;
  const { data: rows } = await admin
    .from("audit_log_entries")
    .select("project_id,action,detail,occurred_at")
    .in("project_id", scope.projectIds)
    .eq("entity_type", SSMA_REPLY_ENTITY_TYPE)
    .in("action", [SSMA_REPLY_CONFIRMATION_PENDING, SSMA_REPLY_CONFIRMATION_CLAIMED, SSMA_REPLY_CONFIRMATION_SENT])
    .order("occurred_at", { ascending: true })
    .limit(500);
  const parse = (detail: unknown): Record<string, unknown> | null => {
    try { return JSON.parse(String(detail ?? "")) as Record<string, unknown>; } catch { return null; }
  };
  const claimed = new Set<string>();
  const sent = new Set<string>();
  const pending: PendingConfirmation[] = [];
  for (const row of rows ?? []) {
    const detail = parse(row.detail);
    const id = typeof detail?.providerMessageId === "string" ? detail.providerMessageId : null;
    if (!id) continue;
    if (row.action === SSMA_REPLY_CONFIRMATION_SENT) sent.add(id);
    else if (row.action === SSMA_REPLY_CONFIRMATION_CLAIMED) claimed.add(id);
    else pending.push({ ...(detail as unknown as PendingConfirmation), projectId: row.project_id as string });
  }
  for (const item of pending) {
    if (sent.has(item.providerMessageId)) continue;
    summary.pending += 1;
    if (claimed.has(item.providerMessageId)) { summary.uncertain += 1; continue; } // tentativa anterior sem conclusão: não repetir
    const audit = (action: string, extra: Record<string, unknown>) =>
      admin.from("audit_log_entries").insert({
        project_id: item.projectId, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
        action, entity_type: SSMA_REPLY_ENTITY_TYPE, entity_id: item.actionId,
        detail: JSON.stringify({ providerMessageId: item.providerMessageId, ...extra }),
      });
    const { error: claimError } = await audit(SSMA_REPLY_CONFIRMATION_CLAIMED, {});
    if (claimError) { summary.failed += 1; continue; }
    const loaded = await loadRecord(admin, item.recordId);
    const content = buildSsmaReplyConfirmationEmail({
      projectName: loaded?.projectName ?? "Obra", recipientName: item.recipientName, category: String(loaded?.record.category ?? "SSMA"),
      location: String(loaded?.record.location ?? "—"), visibleCode: item.actionId.slice(0, 8).toUpperCase(), originalSubject: item.originalSubject,
      statusLabel: item.statusLabel, forecastLine: item.forecastLine, pendingLine: item.pendingLine, outOfOrder: item.outOfOrder,
      accUrl: `${getAppBaseUrl()}/${item.projectId}/ssma-registros`,
    });
    try {
      const result = await mailer.deliver({
        to: item.to, name: item.recipientName, projectId: item.projectId, correlationId: crypto.randomUUID(),
        content: {
          ...content, participantLabel: item.recipientName,
          reply: { token: generateReplyToken(), actionId: item.actionId, recordId: item.recordId },
          thread: { inReplyTo: item.inReplyTo, references: item.references },
        },
      });
      await audit(SSMA_REPLY_CONFIRMATION_SENT, { confirmationMessageId: result.providerMessageId, sentAt: result.sentAt });
      summary.sent += 1;
    } catch {
      // Falha antes/durante o envio: fica como incerta (reivindicada sem SENT) — conferência humana, sem repetição automática.
      summary.failed += 1;
    }
  }
  return summary;
}
