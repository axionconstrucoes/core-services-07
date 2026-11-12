// Execução MANUAL, ÚNICA e restrita de um alerta imediato do piloto WEG. Server-only.
//
// Existe porque o caminho normal (runRiskAlertCycle) só roda para projetos com risk_alerts_enabled=true, ou seja, ligaria a
// geração recorrente. Aqui NADA disso muda: risk_alerts_enabled continua false (nunca é gravado), nenhum plano de ciclo é
// calculado, nenhum caso é criado/alterado, não há consolidado, escalonamento, encaminhamento, Expert nem fila pendente.
//
// Reaproveita sem desvio: a mesma outbox (idempotência), o mesmo sendPlanned/deliver (composição, links de ação, Reply-To,
// assinatura), o mesmo getEmailProvider() e as MESMAS guardas do piloto do provider (guarda global → perfil do projeto →
// destino único → MIME → conferência do MIME final). O roteamento para as quatro caixas é decidido pelo perfil do projeto.
//
// Salvaguardas (todas fail-closed):
//   - exige o grupo WEG_INTERNAL_FOUR ativo e válido para ESTE projeto (resolveProjectPilotReplyGroup);
//   - o caso precisa existir no projeto, estar ABERTO e ser HIGH/CRITICAL; o id do caso é informado explicitamente;
//   - destinatários lógicos = membros da allowlist do piloto com vínculo ativo (evaluateRecipient) — nunca outros;
//   - teto: 1 caso e no máximo MAX_PILOT_SINGLE_RECIPIENTS e-mails;
//   - idempotência por chave fixa `${caseId}:PILOT_SINGLE:${userId}`: se a chave já existe (qualquer status) NÃO reenvia;
//   - dryRun: nenhuma escrita e nenhum envio.

import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { loadAccLogoInlineImage } from "@/lib/email/branding/load-acc-logo-inline-image";
import type { EmailProvider } from "@/lib/email/email-provider";
import { getEmailProvider } from "@/lib/email/get-email-provider";
import { resolveEmailProviderName } from "@/lib/email/gmail-auth";
import { resolveProjectPilotReplyGroup, resolveProjectPilotProfile } from "@/lib/email/project-pilot-profile";
import { isWeeklyReportsEnabled } from "@/lib/feature-flags/weekly-reports";
import { slaEscalationLevelLabels } from "@/lib/labels";
import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaArea, SlaRiskLevel } from "@/lib/sla/types";

import { blockerToSuppressionReason, evaluatePilotReadiness, isSeverityMapComplete } from "./pilot-readiness";
import { evaluateRecipient } from "./plan-risk-alerts";
import { sendPlanned, type SendContext } from "./run-risk-alert-cycle";
import type { RiskAlertStore } from "./store";
import { createSupabaseRiskAlertStore } from "./supabase-store";
import type { ImmediateAlertContent, PlannedOutboxEntry } from "./types";
import { DEFAULT_PROJECT_TIMEZONE } from "./types";

export const MAX_PILOT_SINGLE_RECIPIENTS = 3;
export const PILOT_SINGLE_CASE_ENV = "ACC_PILOT_SINGLE_ALERT_CASE_ID";

export type PilotSingleAlertStatus = "BLOCKED" | "DRY_RUN" | "EXECUTED" | "ALREADY_SENT";

export interface PilotSingleAlertRecipientResult {
  userId: string;
  name: string | null;
  eligibility: "PENDING" | "SUPPRESSED";
  suppressionReason: string | null;
  idempotencyKey: string;
  outcome: "WOULD_SEND" | "SENT" | "FAILED" | "SKIPPED" | "JA_EXISTE" | "NAO_ELEGIVEL";
}

export interface PilotSingleAlertResult {
  status: PilotSingleAlertStatus;
  blockedReason: string | null;
  readinessBlockers: string[];
  projectId: string | null;
  caseId: string;
  riskAlertsEnabledInDatabase: boolean | null;
  deliveryGroup: string[] | null;
  recipients: PilotSingleAlertRecipientResult[];
  sent: number;
  failed: number;
  skipped: number;
}

export interface RunPilotSingleAlertOptions {
  caseId: string;
  dryRun?: boolean;
  now?: Date;
  store?: RiskAlertStore;
  provider?: EmailProvider;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function blocked(caseId: string, reason: string, extra: Partial<PilotSingleAlertResult> = {}): PilotSingleAlertResult {
  return { status: "BLOCKED", blockedReason: reason, readinessBlockers: [], projectId: null, caseId, riskAlertsEnabledInDatabase: null, deliveryGroup: null, recipients: [], sent: 0, failed: 0, skipped: 0, ...extra };
}

export async function runPilotSingleAlert(options: RunPilotSingleAlertOptions): Promise<PilotSingleAlertResult> {
  const caseId = options.caseId.trim().toLowerCase();
  const dryRun = options.dryRun ?? false;
  if (!UUID.test(caseId)) return blocked(caseId, "CASE_ID_INVALID");
  if (!isWeeklyReportsEnabled()) return blocked(caseId, "FEATURE_DISABLED");

  // O projeto vem EXCLUSIVAMENTE do perfil do piloto (nunca de parâmetro): só a WEG, só com o grupo ativo e válido.
  const profile = resolveProjectPilotProfile();
  if (!profile.configured || !profile.valid) return blocked(caseId, "PILOT_PROFILE_INVALID");
  const projectId = profile.projectId;
  const group = resolveProjectPilotReplyGroup(projectId);
  if (!group) return blocked(caseId, "PILOT_GROUP_NOT_ACTIVE", { projectId });

  const store = options.store ?? createSupabaseRiskAlertStore(createSupabaseAdminClient());
  const snapshot = await store.loadProjectSnapshot(projectId);
  const config = snapshot.config;
  if (!config || !config.enabled) return blocked(caseId, "PROJECT_CONFIG_MISSING_OR_DISABLED", { projectId, deliveryGroup: group });
  const base = { projectId, deliveryGroup: group, riskAlertsEnabledInDatabase: Boolean(config.riskAlertsEnabled) };

  const record = snapshot.existingCases.find((c) => c.id === caseId) ?? null;
  if (!record) return blocked(caseId, "CASE_NOT_IN_PROJECT", base);
  if (record.status !== "OPEN") return blocked(caseId, "CASE_NOT_OPEN", base);
  if (record.riskLevel !== "HIGH" && record.riskLevel !== "CRITICAL") return blocked(caseId, "CASE_NOT_HIGH_OR_CRITICAL", base);

  const timeZone = snapshot.settings?.timezone ?? DEFAULT_PROJECT_TIMEZONE;
  const policyFor = (area: SlaArea, riskLevel: SlaRiskLevel) =>
    resolveMatrixPolicy({ rules: snapshot.matrixRules, responsibles: snapshot.areaResponsibles, settings: snapshot.settings, area, riskLevel });
  const policy = policyFor(record.area, record.riskLevel);

  // Prontidão REAL (mesmo critério do ciclo), avaliada só para este caso; a única diferença é que a flag risk_alerts_enabled
  // do BANCO não é exigida (ela permanece como está e não é gravada).
  const providerName = resolveEmailProviderName();
  const providerConfigured = providerName === "gmail" || Boolean(options.provider);
  const readiness = evaluatePilotReadiness({
    featureEnabled: true,
    config: { ...config, riskAlertsEnabled: true },
    providerConfigured,
    explicitRuleLevels: Array.from(new Set(snapshot.matrixRules.filter((r) => r.active).map((r) => r.riskLevel))),
    matrixStatuses: [{ area: record.area, status: policy.status, missing: policy.missing }],
    allowlistValid: Boolean(config.pilotRecipientAllowlistUserIds?.length),
    projectConfirmed: Boolean(config.pilotProjectConfirmedAt),
    workspaceConfigured: Boolean(snapshot.senderMailbox) || Boolean(options.provider),
    severityMapConfigured: isSeverityMapComplete(config.severityMap ?? null),
    replyMailboxConfigured: Boolean(snapshot.replyMailbox),
    replyMailbox: snapshot.replyMailbox,
    deliveryOverrideEmail: null,
    projectPilotProfileInvalid: false,
  });
  if (!readiness.ready) {
    return blocked(caseId, `READINESS:${blockerToSuppressionReason(readiness.blockers[0])}`, { ...base, readinessBlockers: readiness.blockers });
  }

  const allowlist = (config.pilotRecipientAllowlistUserIds ?? []).slice(0, MAX_PILOT_SINGLE_RECIPIENTS);
  const nowIso = (options.now ?? new Date()).toISOString();
  const linked = record.slaActionId ? snapshot.linkedActions.get(record.slaActionId) : undefined;
  const content: ImmediateAlertContent = {
    kind: "IMMEDIATE",
    caseTitle: record.title,
    reference: record.reference,
    riskLevel: record.riskLevel,
    area: record.area,
    summary: record.summary,
    impact: record.impact,
    recommendation: record.recommendation,
    originPath: record.originPath || "documentos?tab=registro-email",
    // Sem ação SLA vinculada ao e-mail de teste: os botões/links são os do CASO (máquina de estados com allowlist).
    slaActionId: null,
    levelLabel: slaEscalationLevelLabels.RESPONSAVEL,
    previousLevelLabel: null,
    responsibleName: snapshot.recipients.get(record.currentResponsibleUserId ?? "")?.name ?? null,
    deadlineLabel: "Prazo para assumir",
    deadlineAt: linked?.assumeDueAt ?? null,
    requiresAcknowledgment: policy.requiresAcknowledgmentConfirmation,
    requiresJustification: policy.requiresDelayJustification,
    escalationReason: "Teste controlado do piloto WEG: destinatário lógico = participante autorizado do piloto (não o responsável da Matriz).",
    changed: false,
  };

  const recipients: PilotSingleAlertRecipientResult[] = [];
  const entries: PlannedOutboxEntry[] = [];
  for (const userId of allowlist) {
    const recipient = evaluateRecipient(userId, config, snapshot.recipients);
    const idempotencyKey = `${caseId}:PILOT_SINGLE:${userId}`;
    const row: PilotSingleAlertRecipientResult = { userId, name: recipient.name, eligibility: recipient.status, suppressionReason: recipient.suppressionReason, idempotencyKey, outcome: "NAO_ELEGIVEL" };
    recipients.push(row);
    if (recipient.status !== "PENDING") continue;
    if (snapshot.existingIdempotencyKeys.has(idempotencyKey)) {
      row.outcome = "JA_EXISTE";
      continue;
    }
    row.outcome = "WOULD_SEND";
    entries.push({
      idempotencyKey,
      notificationType: "IMMEDIATE",
      escalationLevel: "RESPONSAVEL",
      riskLevel: record.riskLevel,
      caseKey: caseId,
      slaActionId: null,
      recipient,
      scheduledFor: nowIso,
      digestWindow: null,
      matrixRuleSnapshot: {},
      payloadSummary: { title: record.title, reference: record.reference, area: record.area, pilotControlledTest: true },
      content,
    });
  }

  const result: PilotSingleAlertResult = { status: "DRY_RUN", blockedReason: null, readinessBlockers: [], ...base, caseId, recipients, sent: 0, failed: 0, skipped: 0 };
  if (dryRun) return result;
  if (entries.length === 0) return { ...result, status: "ALREADY_SENT" };

  // ---- execução real: só aqui há escrita (outbox + auditoria + envio). risk_alerts_enabled NÃO é tocado. ----
  const provider = options.provider ?? getEmailProvider();
  const persisted = await store.enqueue(projectId, entries, new Map([[caseId, caseId]]), new Map());
  await store.audit(projectId, [
    {
      action: "RISK_ALERT_PILOT_SINGLE_RUN",
      entityType: "RISK_ALERT_CASE",
      entityId: caseId,
      detail: `Execução manual única do piloto: ${entries.length} destinatário(s) lógico(s) da allowlist, entrega restrita ao grupo WEG_INTERNAL_FOUR. risk_alerts_enabled não alterado.`,
    },
  ]);
  const ctx: SendContext = {
    store,
    provider,
    projectId,
    projectName: snapshot.projectName,
    baseUrl: getAppBaseUrl(),
    timeZone,
    nowIso,
    inlineLogo: loadAccLogoInlineImage(),
    caseIds: new Map([[caseId, caseId]]),
    snapshot,
    policyFor,
    deliveredKeys: new Set(),
    readinessBlockers: [],
  };
  for (const item of persisted) {
    const outcome = await sendPlanned(item.id, item.caseId, item.entry, ctx);
    const row = recipients.find((r) => r.idempotencyKey === item.entry.idempotencyKey);
    if (row) row.outcome = outcome;
    if (outcome === "SENT") result.sent += 1;
    else if (outcome === "FAILED") result.failed += 1;
    else result.skipped += 1;
  }
  return { ...result, status: "EXECUTED" };
}

