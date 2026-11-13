// Execução MANUAL, ÚNICA e restrita de um alerta imediato do piloto WEG. Server-only.
//
// Existe porque o caminho normal (runRiskAlertCycle) só roda para projetos com risk_alerts_enabled=true, ou seja, ligaria a
// geração recorrente. Aqui NADA disso muda: risk_alerts_enabled continua false (nunca é gravado), nenhum plano de ciclo é
// calculado, nenhum caso é criado/alterado, não há consolidado, escalonamento, encaminhamento, Expert nem fila pendente.
//
// Reaproveita sem desvio: a mesma outbox (idempotência), o mesmo sendPlanned/deliver (composição, links de ação, Reply-To,
// assinatura), o mesmo getEmailProvider() e as MESMAS guardas do piloto do provider (guarda global → perfil do projeto →
// destino único → MIME → conferência do MIME final). O roteamento (destino exclusivo ou grupo) é decidido pelo perfil do projeto.
//
// Salvaguardas (todas fail-closed):
//   - exige perfil de entrega do piloto ATIVO e VÁLIDO para ESTE projeto (resolveProjectPilotDeliveryTargets): o destino exclusivo
//     da lista fixa (axion@axion.com.br) ou, se configurado, o grupo WEG_INTERNAL_FOUR;
//   - o caso precisa existir no projeto, estar ABERTO e ser HIGH/CRITICAL; o id do caso é informado explicitamente;
//   - destinatários lógicos = membros da allowlist do piloto com vínculo ativo (evaluateRecipient) — nunca outros;
//   - teto: 1 caso e no máximo MAX_PILOT_SINGLE_RECIPIENTS e-mails;
//   - idempotência por chave fixa `${caseId}:PILOT_SINGLE:${userId}`: se a chave já existe NÃO reenvia — única exceção,
//     estreita: a MESMA linha bloqueada antes de qualquer chamada de rede (isPreNetworkRetryable) pode ser retentada;
//   - dryRun: nenhuma escrita e nenhum envio.

import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { loadAccLogoInlineImage } from "@/lib/email/branding/load-acc-logo-inline-image";
import type { EmailProvider } from "@/lib/email/email-provider";
import { getEmailProvider } from "@/lib/email/get-email-provider";
import { resolveEmailProviderName } from "@/lib/email/gmail-auth";
import { resolveProjectPilotDeliveryTargets, resolveProjectPilotProfile } from "@/lib/email/project-pilot-profile";
import { isWeeklyReportsEnabled } from "@/lib/feature-flags/weekly-reports";
import { slaEscalationLevelLabels } from "@/lib/labels";
import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaArea, SlaRiskLevel } from "@/lib/sla/types";

import { blockerToSuppressionReason, evaluatePilotReadiness, isSeverityMapComplete } from "./pilot-readiness";
import { evaluateRecipient } from "./plan-risk-alerts";
import { sendPlanned, type SendContext } from "./run-risk-alert-cycle";
import type { OutboxRetryInfo, RiskAlertStore } from "./store";
import { createSupabaseRiskAlertStore } from "./supabase-store";
import type { ImmediateAlertContent, PlannedOutboxEntry } from "./types";
import { DEFAULT_PROJECT_TIMEZONE, MAX_SEND_ATTEMPTS } from "./types";

export const MAX_PILOT_SINGLE_RECIPIENTS = 3;
export const PILOT_SINGLE_CASE_ENV = "ACC_PILOT_SINGLE_ALERT_CASE_ID";

export type PilotSingleAlertStatus = "BLOCKED" | "DRY_RUN" | "EXECUTED" | "ALREADY_SENT";

export interface PilotSingleAlertRecipientResult {
  userId: string;
  name: string | null;
  eligibility: "PENDING" | "SUPPRESSED";
  suppressionReason: string | null;
  idempotencyKey: string;
  outcome: "WOULD_SEND" | "WOULD_RETRY" | "SENT" | "FAILED" | "SKIPPED" | "JA_EXISTE" | "NAO_ELEGIVEL";
  /** true quando a MESMA linha da outbox (bloqueada antes de qualquer chamada de rede) foi retentada. */
  retry: boolean;
}

/**
 * Marcador gravado em last_error quando o envio foi bloqueado ANTES de qualquer chamada de rede (guardas do provider). Só uma
 * linha com este marcador — e sem nenhum indício de entrega — pode ser retentada pelo envio único.
 */
export const PILOT_SINGLE_PRE_NETWORK_MARKER = "antes de qualquer chamada de rede";

/**
 * Reentrada ESTREITA e fail-closed: a chave já existe, mas a linha comprovadamente nunca chegou à rede.
 * Exige mesmo projeto/caso/destinatário, status PENDING com tentativas restantes, nenhum indício de entrega
 * (provider_message_id, sent_at, email_id nulos) e o marcador de bloqueio pré-rede em last_error.
 * FAILED (tentativas esgotadas), SENT, SUPPRESSED/SKIPPED ou qualquer dúvida => não retenta (JA_EXISTE).
 */
export function isPreNetworkRetryable(
  row: OutboxRetryInfo | undefined,
  expected: { projectId: string; caseId: string; recipientUserId: string; idempotencyKey: string }
): boolean {
  if (!row) return false;
  if (row.idempotencyKey !== expected.idempotencyKey) return false;
  if (row.projectId !== expected.projectId || row.caseId !== expected.caseId || row.recipientUserId !== expected.recipientUserId) return false;
  if (row.status !== "PENDING" || row.attemptCount >= MAX_SEND_ATTEMPTS) return false;
  if (row.providerMessageId || row.sentAt || row.emailId) return false;
  return typeof row.lastError === "string" && row.lastError.includes(PILOT_SINGLE_PRE_NETWORK_MARKER);
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
  /** Linhas pré-rede retentadas (dry-run: que SERIAM retentadas). */
  retried: number;
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
  return { status: "BLOCKED", blockedReason: reason, readinessBlockers: [], projectId: null, caseId, riskAlertsEnabledInDatabase: null, deliveryGroup: null, recipients: [], sent: 0, failed: 0, skipped: 0, retried: 0, ...extra };
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
  const group = resolveProjectPilotDeliveryTargets(projectId);
  if (!group) return blocked(caseId, "PILOT_DELIVERY_NOT_ACTIVE", { projectId });

  const store = options.store ?? createSupabaseRiskAlertStore(createSupabaseAdminClient());
  const snapshot = await store.loadProjectSnapshot(projectId);
  const config = snapshot.config;
  if (!config || !config.enabled) return blocked(caseId, "PROJECT_CONFIG_MISSING_OR_DISABLED", { projectId, deliveryGroup: group });
  const base = { projectId, deliveryGroup: group, riskAlertsEnabledInDatabase: Boolean(config.riskAlertsEnabled) };

  const record = [...snapshot.existingCases, ...(snapshot.testCases ?? [])].find((c) => c.id === caseId) ?? null;
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
  // Estado das chaves que JÁ existem (somente leitura): base da reentrada estreita pré-rede.
  // ATENÇÃO: no Supabase real, existingIdempotencyKeys NÃO contém linhas PENDING (o ciclo normal as retenta por desenho). Se o
  // gate dependesse só dele, uma linha PENDING (inclusive após resposta incerta do Gmail) pareceria "nova" e o enqueue a devolveria
  // para reenvio sem passar por isPreNetworkRetryable. Por isso o estado da outbox é lido para TODAS as chaves candidatas.
  const candidateKeys = allowlist.map((userId) => `${caseId}:PILOT_SINGLE:${userId}`);
  const retryInfo = new Map<string, OutboxRetryInfo>();
  if (store.loadOutboxRetryInfo) {
    for (const info of await store.loadOutboxRetryInfo(projectId, candidateKeys)) retryInfo.set(info.idempotencyKey, info);
  }
  let retried = 0;
  for (const userId of allowlist) {
    const recipient = evaluateRecipient(userId, config, snapshot.recipients);
    const idempotencyKey = `${caseId}:PILOT_SINGLE:${userId}`;
    const row: PilotSingleAlertRecipientResult = { userId, name: recipient.name, eligibility: recipient.status, suppressionReason: recipient.suppressionReason, idempotencyKey, outcome: "NAO_ELEGIVEL", retry: false };
    recipients.push(row);
    if (recipient.status !== "PENDING") continue;
    if (snapshot.existingIdempotencyKeys.has(idempotencyKey) || retryInfo.has(idempotencyKey)) {
      if (!isPreNetworkRetryable(retryInfo.get(idempotencyKey), { projectId, caseId, recipientUserId: userId, idempotencyKey })) {
        row.outcome = "JA_EXISTE";
        continue;
      }
      // Mesma linha, mesma chave: enqueue não cria outra (upsert ignora duplicata) e devolve a linha PENDING existente.
      row.retry = true;
      retried += 1;
    }
    row.outcome = row.retry ? "WOULD_RETRY" : "WOULD_SEND";
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

  const result: PilotSingleAlertResult = { status: "DRY_RUN", blockedReason: null, readinessBlockers: [], ...base, caseId, recipients, sent: 0, failed: 0, skipped: 0, retried };
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
      detail: `Execução manual única do piloto: ${entries.length} destinatário(s) lógico(s) da allowlist (${retried} retentativa(s) de linha bloqueada antes de qualquer chamada de rede), entrega restrita ao grupo WEG_INTERNAL_FOUR. risk_alerts_enabled não alterado.`,
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
    // Execução ÚNICA armada: só estas chaves (PILOT_SINGLE) de caso de teste podem sair por aqui.
    pilotSingleArmedKeys: new Set(persisted.map((item) => item.entry.idempotencyKey)),
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

