import "server-only";

// Continuidade de cobrança das AÇÕES CORRETIVAS SSMA (escopo WEG_CORRECTIVE_ACTIONS): escalonamento pela Matriz ESG_SSMA e
// aviso de previsão vencida. Chamado pela varredura /api/cron/ssma-notifications. Toda decisão vem do módulo puro escalation.ts;
// aqui só I/O (Supabase service_role, RPC escalate_sla_action_system, envio pelo provedor do ACC com as travas do piloto).
//
// Garantias: nunca reinicia SLA (prazos originais); 1 mensagem por ação × nível; níveis vencidos ANTES da ativação ficam
// TRAVADOS até decisão humana auditada (SSMA_ESCALATION_REISSUE_APPROVED, actor USER); reivindicação auditada antes do envio
// (reivindicado sem SENT => incerto, nunca repetido automaticamente); ação SLA vinculada a caso de risco é do ciclo de riscos.

import { getAppBaseUrl } from "@/lib/app-base-url";
import { generateReplyToken } from "@/lib/risk-alerts/replies/reply-pipeline";
import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaArea, SlaAreaResponsibles, SlaMatrixRule, SlaProjectSettings, SlaRiskLevel } from "@/lib/sla/types";
import type { createSupabaseAdminClient } from "@axion/db/admin";

import type { Mailer } from "./core";
import type { SsmaNotificationScope } from "./enabled";
import { buildSsmaEscalationEmail, buildSsmaForecastExpiredEmail } from "./escalation-content";
import {
  buildSsmaEscalationLedger,
  forecastExpiryNoticeDue,
  planSsmaEscalation,
  SSMA_ESCALATION_ACTIVATED,
  SSMA_ESCALATION_CLAIMED,
  SSMA_ESCALATION_DECISION_REQUIRED,
  SSMA_ESCALATION_LEVEL_APPLIED,
  SSMA_ESCALATION_REISSUE_APPROVED,
  SSMA_ESCALATION_SENT,
  SSMA_ESCALATION_SUPERSEDED,
  SSMA_ESCALATION_TOP_LEVEL,
  SSMA_FORECAST_EXPIRED_CLAIMED,
  SSMA_FORECAST_EXPIRED_SENT,
  ssmaForecastLine,
  ssmaForecastState,
  ssmaLevelLabel,
  type SsmaSlaActionState,
} from "./escalation";
import { SSMA_REPLY_ENTITY_TYPE, SSMA_REPLY_PROCESSED, ssmaSeverityOf } from "./replies";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Row = Record<string, unknown>;

const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export interface SsmaFollowUpResult {
  checked: number;
  levelsApplied: number;
  escalationsSent: number;
  decisionRequired: number;
  superseded: number;
  topLevelRecorded: number;
  forecastExpiredSent: number;
  failed: number;
  uncertain: number;
  skippedLinkedToRiskCase: number;
}

const mapRule = (row: Row): SlaMatrixRule => ({
  id: row.id as string,
  projectId: row.project_id as string,
  riskLevel: row.risk_level as SlaMatrixRule["riskLevel"],
  area: (row.area as SlaArea | null) ?? null,
  timeUnit: row.time_unit as SlaMatrixRule["timeUnit"],
  assumeDeadlineValue: Number(row.assume_deadline_value),
  respondDeadlineValue: row.respond_deadline_value === null ? null : Number(row.respond_deadline_value),
  completeDeadlineValue: row.complete_deadline_value === null ? null : Number(row.complete_deadline_value),
  escalation2AfterValue: Number(row.escalation_2_after_value),
  boardAfterValue: Number(row.board_after_value),
  notifyByEmail: Boolean(row.notify_by_email),
  requiresAcknowledgmentConfirmation: Boolean(row.requires_acknowledgment_confirmation),
  requiresDelayJustification: Boolean(row.requires_delay_justification),
  isDefault: Boolean(row.is_default),
  active: Boolean(row.active),
  createdAt: (row.created_at as string | null) ?? null,
});
const mapResponsibles = (row: Row): SlaAreaResponsibles => ({
  id: row.id as string,
  projectId: row.project_id as string,
  area: row.area as SlaArea,
  responsibleDirectUserId: s(row.responsible_direct_user_id),
  responsibleDirectInvitationId: s(row.responsible_direct_invitation_id),
  responsibleDirectName: null,
  secondaryResponsibleUserId: s(row.secondary_responsible_user_id),
  secondaryResponsibleInvitationId: s(row.secondary_responsible_invitation_id),
  secondaryResponsibleName: null,
  escalation1UserId: s(row.escalation_1_user_id),
  escalation1InvitationId: s(row.escalation_1_invitation_id),
  escalation1Name: null,
  escalation2UserId: s(row.escalation_2_user_id),
  escalation2Name: null,
  boardUserId: s(row.board_user_id),
  boardInvitationId: s(row.board_invitation_id),
  boardName: null,
  updatedAt: (row.updated_at as string) ?? "",
});
const mapSettings = (row: Row | null): SlaProjectSettings | null =>
  row
    ? {
        projectId: row.project_id as string,
        timezone: row.timezone as string,
        businessDayStartHour: Number(row.business_day_start_hour),
        businessDayEndHour: Number(row.business_day_end_hour),
        updatedAt: (row.updated_at as string) ?? "",
      }
    : null;

/** Momento de ativação da continuidade (primeira execução, auditada uma única vez por projeto). */
async function activationAt(admin: Admin, projectId: string, nowIso: string): Promise<string> {
  const { data } = await admin
    .from("audit_log_entries")
    .select("occurred_at")
    .eq("project_id", projectId)
    .eq("action", SSMA_ESCALATION_ACTIVATED)
    .order("occurred_at", { ascending: true })
    .limit(1);
  if (data?.[0]?.occurred_at) return data[0].occurred_at as string;
  await admin.from("audit_log_entries").insert({
    project_id: projectId, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
    action: SSMA_ESCALATION_ACTIVATED, entity_type: "PROJECT", entity_id: projectId,
    detail: JSON.stringify({ activatedAt: nowIso, note: "Continuidade de cobrança das ações corretivas SSMA (Matriz ESG_SSMA). Limites vencidos antes deste instante ficam travados até decisão." }),
  });
  return nowIso;
}

export async function followUpSsmaCorrectiveActions(admin: Admin, mailer: Mailer, scope: SsmaNotificationScope, nowIso = new Date().toISOString()): Promise<SsmaFollowUpResult> {
  const result: SsmaFollowUpResult = { checked: 0, levelsApplied: 0, escalationsSent: 0, decisionRequired: 0, superseded: 0, topLevelRecorded: 0, forecastExpiredSent: 0, failed: 0, uncertain: 0, skippedLinkedToRiskCase: 0 };
  if (!scope.overdueActions || !scope.operational || scope.projectIds === null) return result;

  for (const projectId of scope.projectIds) {
    const { data: actions } = await admin
      .from("ssma_corrective_actions")
      .select("id,record_id,project_id,status,responsible_user_id,due_date,sla_action_id")
      .eq("project_id", projectId)
      .neq("status", "CONCLUIDA")
      .not("sla_action_id", "is", null)
      .limit(200);
    if (!actions?.length) continue;

    const activation = await activationAt(admin, projectId, nowIso);
    const [{ data: rules }, { data: responsibles }, { data: settings }, { data: project }] = await Promise.all([
      admin.from("sla_matrix_rules").select("*").eq("project_id", projectId),
      admin.from("sla_area_responsibles").select("*").eq("project_id", projectId),
      admin.from("sla_project_settings").select("*").eq("project_id", projectId).maybeSingle(),
      admin.from("projects").select("name,code").eq("id", projectId).single(),
    ]);
    const projectName = `${project?.code ?? ""} — ${project?.name ?? "Obra"}`.replace(/^ — /, "");
    const rulesMapped = (rules ?? []).map(mapRule);
    const responsiblesMapped = (responsibles ?? []).map(mapResponsibles);
    const settingsMapped = mapSettings((settings as Row | null) ?? null);

    for (const corrective of actions) {
      result.checked += 1;
      const slaActionId = corrective.sla_action_id as string;
      const [{ data: sla }, { data: linkedCases }, { data: record }, { data: auditRows }] = await Promise.all([
        admin.from("sla_actions").select("id,status,area,risk_level,current_escalation_level,assume_due_at,respond_due_at,complete_due_at,acknowledged_at,completed_at,contractual_deadline").eq("id", slaActionId).maybeSingle(),
        admin.from("risk_alert_cases").select("id").eq("sla_action_id", slaActionId).limit(1),
        admin.from("ssma_field_records").select("id,category,location,description,occurred_at,risk_level").eq("id", corrective.record_id as string).maybeSingle(),
        admin.from("audit_log_entries").select("action,detail,actor_type,occurred_at").eq("project_id", projectId).eq("entity_type", SSMA_REPLY_ENTITY_TYPE).eq("entity_id", corrective.id as string).order("occurred_at", { ascending: true }).limit(500),
      ]);
      if (!sla || !record) continue;
      const rows = (auditRows ?? []) as Array<{ action: string; detail: string | null; actor_type: string | null; occurred_at: string }>;
      const ledger = buildSsmaEscalationLedger(rows);
      const policy = resolveMatrixPolicy({ rules: rulesMapped, responsibles: responsiblesMapped, settings: settingsMapped, area: sla.area as SlaArea, riskLevel: sla.risk_level as SlaRiskLevel, projectId });
      const state: SsmaSlaActionState = {
        id: sla.id as string,
        status: sla.status as SsmaSlaActionState["status"],
        currentEscalationLevel: sla.current_escalation_level as SsmaSlaActionState["currentEscalationLevel"],
        assumeDueAt: sla.assume_due_at as string,
        respondDueAt: s(sla.respond_due_at),
        completeDueAt: s(sla.complete_due_at),
        acknowledgedAt: s(sla.acknowledged_at),
        completedAt: s(sla.completed_at),
        contractualDeadline: s(sla.contractual_deadline),
      };
      const plan = planSsmaEscalation({
        action: state,
        correctiveActionClosed: corrective.status === "CONCLUIDA",
        linkedToRiskCase: (linkedCases ?? []).length > 0,
        policy: policy.status === "OK" ? policy : null,
        nowIso,
        activationAt: activation,
        ledger,
      });
      if (plan.skippedReason === "LINKED_TO_RISK_CASE") { result.skippedLinkedToRiskCase += 1; continue; }
      if (plan.skippedReason) continue;

      const audit = (action: string, detail: Record<string, unknown>, actor: "SYSTEM" = "SYSTEM") =>
        admin.from("audit_log_entries").insert({
          project_id: projectId, actor_type: actor, actor_user_id: null, actor_label: null,
          action, entity_type: SSMA_REPLY_ENTITY_TYPE, entity_id: corrective.id as string, detail: JSON.stringify({ slaActionId, ...detail }),
        });

      // 1) Nível do SLA (sempre registrado, inclusive o histórico) — prazos originais, sem reinício.
      for (const step of plan.levelSteps) {
        const { error } = await admin.rpc("escalate_sla_action_system", { p_action_id: slaActionId, p_expected_current_level: step.from, p_new_level: step.to, p_reason: step.reason });
        if (error) break; // concorrência/estado mudou: próxima execução recalcula
        result.levelsApplied += 1;
        const thresholdAt = step.to === "ESCALAO_1" ? plan.thresholds.gestorAt : plan.thresholds.diretoriaAt;
        await audit(SSMA_ESCALATION_LEVEL_APPLIED, { level: step.to, from: step.from, reason: step.reason, thresholdAt, historical: thresholdAt ? new Date(thresholdAt).getTime() < new Date(activation).getTime() : null });
      }
      if (plan.recordTopLevel) {
        await audit(SSMA_ESCALATION_TOP_LEVEL, { topAt: plan.thresholds.topAt, note: "Prazo da Diretoria também vencido — limite da cadeia (sem novo destinatário, sem e-mail)." });
        result.topLevelRecorded += 1;
      }

      // Previsão vigente / pendência (a partir das respostas processadas).
      const processed = rows.filter((r) => r.action === SSMA_REPLY_PROCESSED).map((r) => { try { return JSON.parse(r.detail ?? "{}") as Record<string, unknown>; } catch { return {}; } });
      const forecast = ssmaForecastState(processed);
      const forecastLine = ssmaForecastLine(forecast, nowIso, fmt);
      const severity = ssmaSeverityOf(record.risk_level as string);
      const { data: people } = await admin.from("profiles").select("id,name,email").in("id", [corrective.responsible_user_id, policy.level2UserId, policy.level3UserId].filter(Boolean) as string[]);
      const person = (id: string | null) => (people ?? []).find((p) => p.id === id) ?? null;
      const priorNotice = rows.find((r) => r.action === "SSMA_REPLY_NOTICE_SENT");
      const base = {
        projectName, severity, category: String(record.category), location: String(record.location), description: String(record.description),
        occurredAt: fmt(record.occurred_at as string), accUrl: `${getAppBaseUrl()}/${projectId}/ssma-registros`, visibleCode: String(corrective.id).slice(0, 8).toUpperCase(),
        recordLink: { baseUrl: getAppBaseUrl(), projectId, recordId: String(corrective.record_id) },
        responsibleName: (person(corrective.responsible_user_id as string | null)?.name as string | undefined) ?? null,
        assumeDue: fmt(state.assumeDueAt), completeDue: state.completeDueAt ? fmt(state.completeDueAt) : null, forecastLine,
      };

      // 2) Comunicação por nível.
      for (const comm of plan.communications) {
        if (comm.mode === "DECISION_REQUIRED") {
          await audit(SSMA_ESCALATION_DECISION_REQUIRED, { level: comm.level, thresholdAt: comm.thresholdAt, note: `Limite do ${ssmaLevelLabel(comm.level)} vencido antes da ativação: comunicação travada até decisão (registro ${SSMA_ESCALATION_REISSUE_APPROVED} por usuário).` });
          result.decisionRequired += 1;
          continue;
        }
        if (comm.mode === "SUPERSEDED") {
          await audit(SSMA_ESCALATION_SUPERSEDED, { level: comm.level, thresholdAt: comm.thresholdAt, note: "Sem mensagem própria: nível 2 ausente ou vencido na mesma execução da Diretoria." });
          result.superseded += 1;
          continue;
        }
        const recipient = person(comm.recipientUserId);
        const email = (recipient?.email as string | undefined)?.trim().toLowerCase();
        if (!email) { result.failed += 1; continue; }
        const { error: claimError } = await audit(SSMA_ESCALATION_CLAIMED, { level: comm.level });
        if (claimError) { result.failed += 1; continue; }
        try {
          const mail = buildSsmaEscalationEmail({
            ...base, recipientName: (recipient?.name as string | undefined) ?? null, levelLabel: ssmaLevelLabel(comm.level), thresholdAt: fmt(comm.thresholdAt),
            gestorSkipped: comm.gestorSkipped, reissue: comm.mode === "SEND_APPROVED_REISSUE", priorNotice: priorNotice ? fmt(priorNotice.occurred_at) : null,
          });
          const sent = await mailer.deliver({
            to: email, name: (recipient?.name as string | undefined) ?? null, projectId, correlationId: crypto.randomUUID(),
            content: { ...mail, participantLabel: (recipient?.name as string | undefined) ?? null, reply: { token: generateReplyToken(), actionId: corrective.id as string, recordId: corrective.record_id as string } },
          });
          await audit(SSMA_ESCALATION_SENT, { level: comm.level, providerMessageId: sent.providerMessageId, sentAt: sent.sentAt, reissue: comm.mode === "SEND_APPROVED_REISSUE", gestorSkipped: comm.gestorSkipped });
          result.escalationsSent += 1;
        } catch {
          result.uncertain += 1; // reivindicado sem SENT: incerto, sem repetição automática
        }
      }

      // 3) Previsão vencida sem conclusão (ALTO/CRÍTICO): uma vez por previsão informada, ao responsável.
      const notified = new Set(
        rows.filter((r) => r.action === SSMA_FORECAST_EXPIRED_SENT || r.action === SSMA_FORECAST_EXPIRED_CLAIMED)
          .map((r) => { try { return String((JSON.parse(r.detail ?? "{}") as { forecastAt?: string }).forecastAt ?? ""); } catch { return ""; } })
          .filter(Boolean)
      );
      const expiry = forecastExpiryNoticeDue({ severity, state: forecast, nowIso, correctiveActionClosed: corrective.status === "CONCLUIDA", notifiedForecasts: notified });
      const responsible = person(corrective.responsible_user_id as string | null);
      const responsibleEmail = (responsible?.email as string | undefined)?.trim().toLowerCase();
      if (expiry.due && expiry.forecastAt && responsibleEmail) {
        const { error: claimError } = await audit(SSMA_FORECAST_EXPIRED_CLAIMED, { forecastAt: expiry.forecastAt });
        if (!claimError) {
          try {
            const mail = buildSsmaForecastExpiredEmail({
              ...base, recipientName: (responsible?.name as string | undefined) ?? null, forecastAt: fmt(expiry.forecastAt),
              escalationState: `${ssmaLevelLabel(sla.current_escalation_level === "DIRETORIA" || plan.levelSteps.some((p) => p.to === "DIRETORIA") ? "DIRETORIA" : "ESCALAO_1")} pela Matriz (prazos originais)`,
            });
            const sent = await mailer.deliver({
              to: responsibleEmail, name: (responsible?.name as string | undefined) ?? null, projectId, correlationId: crypto.randomUUID(),
              content: { ...mail, participantLabel: (responsible?.name as string | undefined) ?? null, reply: { token: generateReplyToken(), actionId: corrective.id as string, recordId: corrective.record_id as string } },
            });
            await audit(SSMA_FORECAST_EXPIRED_SENT, { forecastAt: expiry.forecastAt, providerMessageId: sent.providerMessageId, sentAt: sent.sentAt });
            result.forecastExpiredSent += 1;
          } catch {
            result.uncertain += 1;
          }
        }
      }
    }
  }
  return result;
}
