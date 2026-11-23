// Ciclo do worker de alertas de risco (horário). Server-only: usa o
// admin client, o provider de e-mail real/fake, os Experts e a assinatura ACC.
// Sequência por projeto habilitado:
//   snapshot -> prontidão (pilot-readiness) -> planRiskAlerts (puro) ->
//   persistir (casos, ações SLA, escalonamentos, outbox, auditoria) ->
//   timeouts de encaminhamento -> consultas a Expert -> enviar PENDING
//   (planejadas neste ciclo + manuais/ações/retries) -> marcar.
// Toda entrega passa pela outbox (única fonte de idempotência).
// Condições para envio REAL: ver pilot-readiness.ts — qualquer bloqueio
// mantém as entradas SUPPRESSED com o motivo. dryRun: nenhuma escrita.

import { applyPilotLevelOverride, levelLabelFor, levelNoteFor } from "./pilot-level-overrides";
import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";

import { createDefaultCycleExpertConsultant } from "./experts/cycle-expert-consultant";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { appendAccEmailSignature } from "@/lib/email/branding/acc-email-signature";
import { loadAccLogoInlineImage, loadAccLogoInvertedInlineImage } from "@/lib/email/branding/load-acc-logo-inline-image";
import { EmailSendError, type EmailProvider } from "@/lib/email/email-provider";
import { FAILURE_CLASS_NOTES, classifySendFailure } from "@/lib/email/outbound-delivery";
import { FakeEmailProvider } from "@/lib/email/fake-email-provider";
import { parseGovernorConfig, riskAlertGovernanceType, type AlertGovernanceContext } from "@/lib/email/alert-send-governor";
import { checkAlertCapacity } from "@/lib/email/governed-email-provider";
import { getEmailProvider } from "@/lib/email/get-email-provider";
import { resolveEmailProviderName } from "@/lib/email/gmail-auth";
import { issueEmailAlertActionButtons } from "@/lib/email-actions/issue-tokens";
import { isWeeklyReportsEnabled } from "@/lib/feature-flags/weekly-reports";
import { resolveMatrixPolicy, type MatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaArea, SlaEscalationLevel, SlaRiskLevel } from "@/lib/sla/types";

import { actionLinkExpiry, buildActionLink, EMAIL_ACTION_TYPES, generateActionToken, hashActionToken } from "./action-links";
import { applyForwardTimeout, applyScheduledTopLevel } from "./alert-state-machine";
import { buildAlertFollowUpEmail, buildImmediateRiskAlertEmail, buildRiskDigestEmail, formatDateTimeBR, type BuiltEmail } from "./build-risk-alert-emails";
import { forecastTracking, formatForecastLine, resolveForecast } from "./forecast";
import { buildReplyConfirmationParts, REPLY_CONFIRMATION_TITLE } from "./replies/reply-confirmation";
import { evaluatePilotReadiness, blockerToSuppressionReason, isSeverityMapComplete } from "./pilot-readiness";
import { applyEscalationReplyGate, type GateDecision, type ReplyCheck } from "./escalation-reply-gate";
import { checkRepliesBeforeEscalation, createGmailReadonlyFromEnv, type ReplyCheckRequest, type ReplyLookup } from "./replies/reply-verifier";
import { decideReadinessAudit, READINESS_CONDITION_KEY, readinessDetail, type LatestReadinessAudit, type ReadinessAuditOutcome } from "./readiness-audit";
import { caseKeyOf } from "./collect-risk-cases";
import { rebuildDigestContent } from "./rebuild-digest-content";
import { evaluateRecipient, planRiskAlerts } from "./plan-risk-alerts";
import { resolveDeliveryAddress } from "@/lib/email/pilot-delivery-override";
import { isProjectPilotActive, resolveProjectPilotProfile } from "@/lib/email/project-pilot-profile";

/** Projeto piloto por projeto: a entrega é decidida pelo perfil de e-mail (entrega direta ao colaborador + Cc institucional); o override de entrega legado não se aplica. */
function projectPilotActive(projectId: string): boolean {
  return isProjectPilotActive(projectId);
}
import { runCycleEscalationHook } from "@/lib/whatsapp/hooks";
import { notifyDirectorateWhatsappSafely } from "@/lib/whatsapp/notify-directorate-server";

import { buildOpaqueReplyTo, generateReplyToken, hashReplyToken } from "./replies/reply-pipeline";
import { buildReplyMailtoLinks, type ReplyMailtoLinks } from "@/lib/email-replies/reply-mailto";
import { createMemoryEmailReplyTokenStore, createSupabaseEmailReplyTokenStore, issueEmailReplyToken, type EmailReplyTokenStore } from "@/lib/email-replies/reply-tokens";
import { isPilotTestCase } from "./pilot-test-case";
import { buildCycleDryRunPreviewItem, dryRunEffectiveConfig, shouldAssumeRiskAlertsEnabledForDryRun } from "./cycle-dry-run";
import type { PendingOutboxRow, RiskAlertProjectSnapshot, RiskAlertStore } from "./store";
import { createSupabaseRiskAlertStore, sanitizeError } from "./supabase-store";
import { applyReissueSendGate } from "./reissue-send-gate";
import type { AlertActionType, ExpertId, ImmediateAlertContent, PlannedOutboxEntry, RiskAlertPlan } from "./types";
import { DEFAULT_PROJECT_TIMEZONE } from "./types";

export interface RiskAlertCycleProjectResult {
  projectId: string;
  blockedReason: string | null;
  readinessBlockers: string[];
  cases: number;
  slaActionsCreated: number;
  escalationsApplied: number;
  planned: number;
  suppressed: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Linhas de caso de TESTE do piloto NÃO enviadas pelo ciclo (permanecem PENDING; só o envio único armado as envia). */
  pilotTestCaseBlocked: number;
  forwardsReturned: number;
  topLevelReached: number;
  expertAnswers: number;
  digestWindow: { key: string; isOpen: boolean } | null;
  dryRunPreview?: Array<Record<string, unknown>>;
  /** true quando o dry-run planejou o projeto piloto como se risk_alerts_enabled=true (nada é gravado). */
  dryRunAssumedEnabled?: boolean;
  /** Auditoria de prontidão desta rodada: gravada só na mudança de estado (UNCHANGED_NOT_READY = bloqueio igual, sem nova linha). */
  readinessAudit?: ReadinessAuditOutcome;
  /** Verificação de respostas antes dos escalonamentos desta rodada (retido / seguiu sem verificação / sem resposta). */
  replyGate?: GateDecision[];
  /** Áreas informativas do projeto (sem alertas, SLA, cobrança ou escalonamento; fora da prontidão). */
  informativeAreas?: string[];
  /** Alertas "detectados com atraso" retidos sem comunicação (aguardam decisão de reemissão). */
  lateDetectionHeld?: Array<{ visibleCode: string | null; reference: string }>;
  /** Aprovações de reemissão retidas pelo interruptor ACC_RISK_ALERT_REISSUE_SEND_ENABLED (desligado = nenhuma reemissão planejada). */
  reissueApprovalsHeldByFlag?: number;
  /** Estado do interruptor de envio das reemissões aprovadas neste ciclo. */
  reissueSendFlagEnabled?: boolean;
  /** Casos com comunicação suspensa (verificação pendente): sem alerta, escalonamento nem reemissão. */
  communicationSuspended?: Array<{ visibleCode: string | null; reference: string }>;
  /**
   * Livro-razão de comunicação (mascarado: código visível do caso, papéis e status — sem usuário/e-mail).
   * Distingue etapa alcançada, supressão e aceite pelo Gmail; lacunas sem decisão não geram e-mail.
   */
  communicationLedger?: Array<{
    visibleCode: string | null;
    stageReached: string;
    decision: string;
    recipients: Array<{ role: string; status: string; suppressions: number; acceptedByGmail: number; addressedToRecipient: number; eligibleNow: boolean; ineligibleReason: string | null }>;
  }>;
}

export interface RiskAlertCycleResult {
  ranAt: string;
  featureEnabled: boolean;
  dryRun: boolean;
  provider: string;
  projects: RiskAlertCycleProjectResult[];
}

/** Porta do Expert (injeção nos testes; real = Experts existentes). Só recomenda. */
export interface ExpertConsultant {
  answer(input: { expertId: ExpertId; projectId: string; question: string; askedByUserId?: string | null; subjectId?: string }): Promise<{ answerText: string; confidence: number; requiresHumanReview: boolean }>;
}

export interface RunRiskAlertCycleOptions {
  now?: Date;
  dryRun?: boolean;
  projectId?: string | null;
  store?: RiskAlertStore;
  provider?: EmailProvider;
  expert?: ExpertConsultant;
  /** Verificação de respostas antes de escalonar (testes injetam; padrão: Gmail somente leitura da caixa monitorada). */
  replyVerifier?: (requests: ReplyCheckRequest[]) => Promise<Map<string, ReplyCheck>>;
  /** Tokens POR ITEM dos atalhos "Responder por e-mail" (padrão: tabela email_reply_tokens; com store injetado, só se informado). */
  replyTokenStore?: EmailReplyTokenStore | null;
}

function createSupabaseReplyLookup(client: ReturnType<typeof createSupabaseAdminClient>): ReplyLookup {
  return {
    async conversationsForCase(caseId) {
      const { data: conversations } = await client.from("alert_email_conversations").select("provider_thread_id,reply_token_hash").eq("case_id", caseId);
      const { data: outbound } = await client.from("alert_email_messages").select("provider_thread_id,reply_token_hash,sent_at").eq("case_id", caseId).eq("direction", "OUTBOUND");
      const firstSentAt = (outbound ?? []).map((row) => row.sent_at as string | null).filter((s): s is string => Boolean(s)).sort()[0] ?? null;
      const rows = [...(conversations ?? []), ...(outbound ?? [])];
      return rows.map((row) => ({ providerThreadId: (row.provider_thread_id as string | null) ?? null, replyTokenHash: (row.reply_token_hash as string | null) ?? null, firstSentAt }));
    },
    async knownMessageIds(projectId) {
      const { data } = await client.from("alert_email_messages").select("provider_message_id").eq("project_id", projectId).not("provider_message_id", "is", null);
      return new Set((data ?? []).map((row) => row.provider_message_id as string));
    },
  };
}

function createDefaultReplyVerifier(): (requests: ReplyCheckRequest[]) => Promise<Map<string, ReplyCheck>> {
  let client: Awaited<ReturnType<typeof createGmailReadonlyFromEnv>> | undefined;
  return async (requests) => {
    if (client === undefined) client = await createGmailReadonlyFromEnv(process.env).catch(() => null);
    return checkRepliesBeforeEscalation(requests, { gmail: client?.gmail ?? null, mailbox: client?.mailbox ?? null, lookup: client ? createSupabaseReplyLookup(createSupabaseAdminClient()) : { conversationsForCase: async () => [], knownMessageIds: async () => new Set<string>() }, unavailableReason: client ? undefined : "credencial de leitura da caixa monitorada (ACC_RISK_ALERTS_INBOUND_*) ausente na rota" });
  };
}

function createDefaultExpertConsultant(): ExpertConsultant {
  // Mapa de Experts, curadoria multidisciplinar e limite de IA (reserva service_role com o usuário que
  // perguntou, antes de cada chamada) vivem em experts/cycle-expert-consultant.ts.
  const consultant = createDefaultCycleExpertConsultant(createSupabaseAdminClient());
  return {
    answer: ({ expertId, projectId, question, askedByUserId, subjectId }) =>
      consultant.answer({ expertId, projectId, question, askedByUserId: askedByUserId ?? null, subjectId: subjectId ?? projectId }),
  };
}

export async function runRiskAlertCycle(options: RunRiskAlertCycleOptions = {}): Promise<RiskAlertCycleResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const dryRun = options.dryRun ?? false;
  const featureEnabled = isWeeklyReportsEnabled();
  const providerName = resolveEmailProviderName();

  const result: RiskAlertCycleResult = { ranAt: nowIso, featureEnabled, dryRun, provider: dryRun ? "FAKE(dry-run)" : providerName, projects: [] };
  if (!featureEnabled) return result; // nenhuma consulta ao banco

  const store = options.store ?? createSupabaseRiskAlertStore(createSupabaseAdminClient());
  // Atalhos mailto por item: tokens gravados ANTES do envio. Dry-run: só memória (nada gravado).
  const replyTokens: EmailReplyTokenStore | null = dryRun
    ? createMemoryEmailReplyTokenStore()
    : options.replyTokenStore !== undefined
      ? options.replyTokenStore
      : options.store
        ? null
        : createSupabaseEmailReplyTokenStore(createSupabaseAdminClient());
  let replyVerifier: ((requests: ReplyCheckRequest[]) => Promise<Map<string, ReplyCheck>>) | undefined;
  const provider = dryRun ? new FakeEmailProvider() : (options.provider ?? getEmailProvider());
  // Um único orçamento de envios para a execução inteira (todos os projetos), conforme ACC_ALERT_BATCH_SIZE.
  const sendBudget = dryRun ? undefined : governorSendBudget();
  const providerConfigured = providerName === "gmail" || Boolean(options.provider);
  const baseUrl = getAppBaseUrl();
  const inlineLogo = loadAccLogoInlineImage();
  const inlineLogoInverted = loadAccLogoInvertedInlineImage();
  const expert = options.expert ?? (dryRun ? null : createDefaultExpertConsultant());

  const projectIds = options.projectId ? [options.projectId] : await store.listEnabledProjectIds();

  for (const projectId of projectIds) {
    const snapshot = await store.loadProjectSnapshot(projectId);
    // Dry-run do projeto piloto pedido explicitamente: planeja como se a flag estivesse ligada (somente leitura, provedor simulado).
    const pilotProfile = resolveProjectPilotProfile();
    const assumeEnabled = shouldAssumeRiskAlertsEnabledForDryRun({
      dryRun,
      requestedProjectId: options.projectId ?? null,
      projectId,
      pilotProjectId: pilotProfile.configured && pilotProfile.valid ? pilotProfile.projectId : null,
    });
    const planConfig = dryRunEffectiveConfig(snapshot.config, assumeEnabled);
    const timeZone = snapshot.settings?.timezone ?? DEFAULT_PROJECT_TIMEZONE;
    // Exceção temporária do piloto por nível (ex.: Nível 2 do Planejamento) aplicada em memória — a Matriz não muda.
    const policyFor = (area: SlaArea, riskLevel: SlaRiskLevel) =>
      applyPilotLevelOverride(
        resolveMatrixPolicy({ rules: snapshot.matrixRules, responsibles: snapshot.areaResponsibles, settings: snapshot.settings, area, riskLevel }),
        snapshot.pilotLevelOverrides,
        snapshot.config?.pilotRecipientAllowlistUserIds ?? null
      );

    // Áreas informativas não entram na prontidão (a Matriz delas não bloqueia as demais); as outras mantêm todas as validações.
    const informativeAreas = new Set<SlaArea>(snapshot.informativeAreas ?? []);
    const areasInUse = Array.from(new Set(snapshot.cases.map((c) => c.area))).filter((area) => !informativeAreas.has(area));
    const readiness = evaluatePilotReadiness({
      featureEnabled,
      config: planConfig,
      providerConfigured,
      explicitRuleLevels: Array.from(new Set(snapshot.matrixRules.filter((r) => r.active).map((r) => r.riskLevel))),
      matrixStatuses: areasInUse.map((area) => {
        const policy = policyFor(area, "HIGH");
        return { area, status: policy.status, missing: policy.missing };
      }),
      allowlistValid: Boolean(snapshot.config?.pilotRecipientAllowlistUserIds?.length),
      projectConfirmed: Boolean(snapshot.config?.pilotProjectConfirmedAt),
      workspaceConfigured: Boolean(snapshot.senderMailbox) || Boolean(options.provider),
      severityMapConfigured: isSeverityMapComplete(snapshot.config?.severityMap ?? null),
      replyMailboxConfigured: Boolean(snapshot.replyMailbox),
      replyMailbox: snapshot.replyMailbox,
      deliveryOverrideEmail: projectPilotActive(projectId) ? null : (snapshot.config?.pilotDeliveryOverrideEmail ?? null),
      projectPilotProfileInvalid: (() => {
        const profile = resolveProjectPilotProfile();
        return profile.configured && !profile.valid && (process.env.ACC_PROJECT_PILOT_PROJECT_ID ?? "").trim().toLowerCase() === projectId.toLowerCase();
      })(),
    });

    // Aprovar só registra a decisão: no ciclo REAL as aprovações só valem com o interruptor de envio ligado (dry-run sempre vê).
    const reissueGate = applyReissueSendGate(snapshot.reissueApprovals, { dryRun });

    const plannedRaw: RiskAlertPlan = planRiskAlerts({
      now: nowIso,
      projectId,
      projectName: snapshot.projectName,
      featureEnabled,
      providerConfigured,
      dryRun,
      config: planConfig,
      timeZone,
      cases: snapshot.cases,
      existingCases: snapshot.existingCases,
      linkedActions: snapshot.linkedActions,
      policyFor,
      recipients: snapshot.recipients,
      existingIdempotencyKeys: snapshot.existingIdempotencyKeys,
      previousDigestSentAt: snapshot.previousDigestSentAt,
      readinessBlockers: readiness.blockers.map(blockerToSuppressionReason),
      informativeAreas,
      suspendedCaseIds: new Set(snapshot.suspendedCaseIds ?? []),
      outboxHistory: snapshot.outboxHistory,
      reissueApprovals: reissueGate.approvals,
      reissueDecisionRecordedCaseIds: snapshot.reissueDecisionRecordedCaseIds,
    });

    // Antes de efetivar escalonamentos: há resposta do caso recebida até o prazo e ainda não processada pelo leitor?
    // (consulta pontual somente leitura; indisponível => segue e registra a limitação, sem afirmar ausência de resposta)
    let plan: RiskAlertPlan = plannedRaw;
    let replyGate: GateDecision[] = [];
    if (plannedRaw.escalations.length > 0) {
      const caseIdByKey = new Map(plannedRaw.caseUpserts.map((u) => [u.caseKey, u.existingId] as const));
      const requests: ReplyCheckRequest[] = plannedRaw.escalations
        .map((e) => ({ caseKey: e.caseKey, caseId: caseIdByKey.get(e.caseKey) ?? "", projectId, deadlineAt: e.deadlineAt ?? null }))
        .filter((r) => r.caseId);
      let checks: Map<string, ReplyCheck>;
      try {
        checks = await (options.replyVerifier ?? (replyVerifier ??= createDefaultReplyVerifier()))(requests);
      } catch {
        checks = new Map(requests.map((r) => [r.caseKey, { status: "UNAVAILABLE" as const, reason: "falha na verificação de respostas" }]));
      }
      const gated = applyEscalationReplyGate(plannedRaw, checks, nowIso);
      plan = gated.plan;
      replyGate = gated.decisions;
    }

    const projectResult: RiskAlertCycleProjectResult = {
      projectId,
      blockedReason: plan.blockedReason,
      readinessBlockers: readiness.blockers,
      cases: plan.caseUpserts.length,
      slaActionsCreated: 0,
      escalationsApplied: 0,
      planned: plan.outbox.length,
      suppressed: plan.outbox.filter((e) => e.recipient.status === "SUPPRESSED").length,
      sent: 0,
      failed: 0,
      skipped: 0,
      pilotTestCaseBlocked: 0,
      forwardsReturned: 0,
      topLevelReached: 0,
      expertAnswers: 0,
      digestWindow: plan.digestWindow,
      ...(replyGate.length ? { replyGate } : {}),
      informativeAreas: Array.from(informativeAreas),
      reissueSendFlagEnabled: reissueGate.sendFlagEnabled,
      ...(reissueGate.held > 0 ? { reissueApprovalsHeldByFlag: reissueGate.held } : {}),
      communicationSuspended: (plan.communicationSuspended ?? []).map((caseKey) => ({
        visibleCode: snapshot.existingCases.find((c) => caseKeyOf(c) === caseKey)?.visibleCode ?? null,
        reference: snapshot.cases.find((c) => caseKeyOf(c) === caseKey)?.reference ?? caseKey,
      })),
      lateDetectionHeld: (plan.lateDetectionHeld ?? []).map((caseKey) => ({
        visibleCode: snapshot.existingCases.find((c) => caseKeyOf(c) === caseKey)?.visibleCode ?? null,
        reference: snapshot.cases.find((c) => caseKeyOf(c) === caseKey)?.reference ?? caseKey,
      })),
    };

    if (plan.blockedReason) {
      result.projects.push(projectResult);
      continue;
    }

    if (dryRun) {
      const visibleCodeByCaseId = new Map(snapshot.existingCases.map((c) => [c.id, c.visibleCode] as const));
      const pilotParticipants = pilotProfile.configured && pilotProfile.valid && pilotProfile.projectId === projectId.toLowerCase() ? pilotProfile.participants : null;
      projectResult.dryRunPreview = plan.outbox.map((entry) => ({ ...buildCycleDryRunPreviewItem(entry, { visibleCodeByCaseId, pilotParticipants }) }));
      projectResult.dryRunAssumedEnabled = assumeEnabled;
      projectResult.communicationLedger = (plan.communicationLedgers ?? []).map((ledger) => ({
        visibleCode: visibleCodeByCaseId.get(ledger.caseId) ?? null,
        stageReached: ledger.stageReached,
        decision: ledger.decision,
        recipients: ledger.recipients.map((r) => ({
          role: r.role,
          status: r.status,
          suppressions: r.suppressions.length,
          acceptedByGmail: r.acceptedByGmail.length,
          addressedToRecipient: r.acceptedByGmail.filter((a) => a.addressedToRecipient).length,
          eligibleNow: r.eligibleNow,
          ineligibleReason: r.ineligibleReason,
        })),
      }));
      projectResult.slaActionsCreated = plan.slaActionCreates.length;
      projectResult.escalationsApplied = plan.escalations.length;
      result.projects.push(projectResult);
      continue;
    }

    // ---- persistência do plano ----
    const caseIds = await store.upsertCases(
      projectId,
      plan.caseUpserts.map((u) => ({
        caseKey: u.caseKey,
        existingId: u.existingId,
        input: u.input,
        change: u.change,
        policyStatus: u.policy?.status ?? "OK",
        policyMissing: u.policy?.missing ?? [],
        previousRiskLevel: snapshot.existingCases.find((c) => c.id === u.existingId)?.riskLevel ?? null,
        now: nowIso,
      }))
    );
    const slaActionIds = await store.createSlaActions(projectId, plan.slaActionCreates, caseIds);
    projectResult.slaActionsCreated = slaActionIds.size;
    const escalation = await store.applyEscalations(projectId, plan.escalations);
    projectResult.escalationsApplied = escalation.applied;
    const persisted = await store.enqueue(projectId, plan.outbox, caseIds, slaActionIds);
    // Prontidão: auditoria só na mudança de estado (sem a leitura da última linha => grava, como antes: rastreabilidade primeiro).
    let latestReadiness: LatestReadinessAudit | null | undefined;
    try {
      latestReadiness = store.latestReadinessAudit ? await store.latestReadinessAudit(projectId) : undefined;
    } catch {
      latestReadiness = undefined;
    }
    const readinessDecision =
      latestReadiness === undefined
        ? readiness.blockers.length
          ? { event: { action: "RISK_ALERT_NOT_READY_FOR_REAL_SEND", entityType: "PROJECT", entityId: projectId, detail: readinessDetail(readiness.blockers) ?? "" }, outcome: "RECORDED_NOT_READY" as ReadinessAuditOutcome }
          : { event: null, outcome: "NONE" as ReadinessAuditOutcome }
        : decideReadinessAudit(projectId, readiness.blockers, latestReadiness);
    projectResult.readinessAudit = readinessDecision.outcome;
    if (store.recordRepeatedCondition && readinessDecision.outcome !== "NONE") {
      await store.recordRepeatedCondition(projectId, READINESS_CONDITION_KEY, readinessDetail(readiness.blockers), nowIso);
    }
    await store.audit(projectId, [
      ...plan.audit,
      ...(readinessDecision.event ? [readinessDecision.event] : []),
      ...plan.outbox.map((entry) => ({
        action: "RISK_ALERT_PLANNED",
        entityType: entry.notificationType === "DIGEST" ? "RISK_ALERT_DIGEST" : "RISK_ALERT_CASE",
        entityId: entry.caseKey ? (caseIds.get(entry.caseKey) ?? entry.caseKey) : (entry.digestWindow ?? entry.idempotencyKey),
        detail: `Alerta ${entry.notificationType}${entry.escalationLevel ? ` (${entry.escalationLevel})` : ""} para ${entry.recipient.userId}: ${entry.recipient.status}${entry.recipient.suppressionReason ? ` (${entry.recipient.suppressionReason})` : ""}. Chave ${entry.idempotencyKey}.`,
      })),
    ]);

    // ---- prazo da Diretoria vencido: limite de escalonamento (uma vez, sem e-mail) ----
    for (const item of plan.topLevelReached) {
      const caseId = caseIds.get(item.caseKey);
      if (!caseId) continue;
      const loaded = await store.loadCaseSnapshotForAction(caseId);
      if (!loaded) continue;
      const transition = applyScheduledTopLevel({ now: nowIso, snapshot: loaded.snapshot, reasons: item.reasons, deadlineEscalatedToTop: true });
      if (!transition) continue;
      try {
        await store.applyTransition(caseId, transition, null);
        projectResult.topLevelReached += 1;
      } catch {
        // Já registrado pelo caminho imediato (chave única) ou ação humana concorrente — nada a repetir.
      }
    }

    // ---- encaminhamentos sem ação: devolver ao remetente ----
    for (const forward of await store.listActiveForwards(projectId)) {
      const loaded = await store.loadCaseSnapshotForAction(forward.caseId);
      if (!loaded || !snapshot.config) continue;
      const policy = policyFor(loaded.record.area, loaded.snapshot.riskLevel);
      const transition = applyForwardTimeout({ now: nowIso, snapshot: loaded.snapshot, policy, config: snapshot.config, recipients: snapshot.recipients });
      if (!transition) continue;
      try {
        await store.applyTransition(forward.caseId, transition, null);
        projectResult.forwardsReturned += 1;
      } catch {
        // Concorrência (ação humana no meio) — próximo ciclo reavalia.
      }
    }

    // ---- consultas a Expert pendentes (só recomenda; nunca resolve) ----
    if (expert) {
      for (const consultation of await store.listPendingExpertConsultations(projectId)) {
        try {
          const answer = await expert.answer({ expertId: consultation.expertId, projectId, question: consultation.question, askedByUserId: consultation.askedByUserId, subjectId: consultation.caseId });
          await store.recordExpertAnswer({ ...consultation, ...answer, requiresHumanReview: true });
          projectResult.expertAnswers += 1;
          // Resposta na mesma thread ao solicitante (allowlist do piloto aplicada).
          if (consultation.askedByUserId && snapshot.config) {
            const recipient = evaluateRecipient(consultation.askedByUserId, snapshot.config, snapshot.recipients);
            await store.enqueue(
              projectId,
              [
                {
                  idempotencyKey: `${consultation.caseId}:EXPERT_ANSWER:${consultation.eventId}:${consultation.askedByUserId}`,
                  notificationType: "EXPERT_ANSWER",
                  escalationLevel: null,
                  riskLevel: "HIGH",
                  caseKey: null,
                  slaActionId: null,
                  recipient: readiness.blockers.length && recipient.status === "PENDING" ? { ...recipient, status: "SUPPRESSED", suppressionReason: blockerToSuppressionReason(readiness.blockers[0]) } : recipient,
                  scheduledFor: nowIso,
                  digestWindow: null,
                  matrixRuleSnapshot: {},
                  payloadSummary: { expertId: consultation.expertId, eventId: consultation.eventId, caseId: consultation.caseId, answerPreview: answer.answerText.slice(0, 300), confidence: answer.confidence },
                  content: { kind: "DIGEST", window: "", mediumItems: [], lowItems: [], closedItems: [] },
                },
              ],
              new Map(),
              new Map()
            );
          }
        } catch (error) {
          await store.audit(projectId, [{ action: "RISK_ALERT_EXPERT_FAILED", entityType: "RISK_ALERT_CASE", entityId: consultation.caseId, detail: `Consulta ao Expert ${consultation.expertId} falhou: ${sanitizeError(error)}` }]);
        }
      }
    }

    // ---- envio: entradas planejadas neste ciclo ----
    const ctx: SendContext = { store, provider, projectId, projectName: snapshot.projectName, baseUrl, timeZone, nowIso, inlineLogo, inlineLogoInverted, caseIds, snapshot, policyFor, deliveredKeys: new Set(), readinessBlockers: readiness.blockers, replyTokens, sendBudget };
    const sentKeys = new Set<string>();
    // Prioridade: alertas CRÍTICOS primeiro (ordem estável entre os demais), para que a cota do período os alcance antes.
    const byPriority = <T,>(level: (x: T) => string | undefined) => (a: T, b: T) => Number(level(b) === "CRITICAL") - Number(level(a) === "CRITICAL");
    for (const item of [...persisted].sort(byPriority((x) => x.entry.riskLevel))) {
      if (item.entry.recipient.status !== "PENDING") continue;
      sentKeys.add(item.entry.idempotencyKey);
      const outcome = await sendPlanned(item.id, item.caseId, item.entry, ctx);
      if (outcome === "SENT") projectResult.sent += 1;
      else if (outcome === "FAILED") projectResult.failed += 1;
      else projectResult.skipped += 1;
    }

    // ---- envio: pendentes de outras origens (manual, ação humana, Expert, retry) ----
    for (const row of [...(await store.listPendingRows(projectId))].sort(byPriority((x) => x.riskLevel))) {
      if (sentKeys.has(row.idempotencyKey)) continue;
      const outcome = await sendPendingRow(row, ctx);
      if (outcome === "SENT") projectResult.sent += 1;
      else if (outcome === "FAILED") projectResult.failed += 1;
      else projectResult.skipped += 1;
    }
    projectResult.pilotTestCaseBlocked = ctx.testCaseBlocked ?? 0;

    result.projects.push(projectResult);
  }

  return result;
}

export interface SendContext {
  store: RiskAlertStore;
  provider: EmailProvider;
  projectId: string;
  projectName: string;
  baseUrl: string;
  timeZone: string;
  nowIso: string;
  inlineLogo: ReturnType<typeof loadAccLogoInlineImage>;
  /** Logotipo oficial INVERTIDO (alerta CRÍTICO, fundo vermelho). Opcional: ausente => o e-mail não referencia a imagem. */
  inlineLogoInverted?: ReturnType<typeof loadAccLogoInvertedInlineImage>;
  caseIds: Map<string, string>;
  snapshot: RiskAlertProjectSnapshot;
  policyFor: (area: SlaArea, riskLevel: SlaRiskLevel) => MatrixPolicy;
  /** Deduplicação por evento × endereço efetivo (override do piloto): nunca dois e-mails iguais no mesmo ciclo. */
  deliveredKeys: Set<string>;
  /** Bloqueios de prontidão do ciclo — retentativas de consolidado respeitam o mesmo critério do planejador. */
  readinessBlockers: string[];
  /**
   * Chaves de idempotência liberadas pelo ENVIO ÚNICO armado (pilotSingleCase). Caso de TESTE do piloto só envia por aqui:
   * ausente => fail-closed (a linha NÃO é enviada nem marcada; permanece PENDING e fica contada em testCaseBlocked).
   */
  pilotSingleArmedKeys?: ReadonlySet<string>;
  testCaseBlocked?: number;
  /** Tokens por item dos atalhos "Responder por e-mail" (null/ausente => e-mail sem atalhos mailto). */
  replyTokens?: EmailReplyTokenStore | null;
  /**
   * Lote por execução (ACC_ALERT_BATCH_SIZE, governador de alertas): máximo de envios NESTA execução. Esgotado => a linha NÃO é reivindicada
   * nem alterada (continua PENDING para a próxima execução, sem gastar tentativa). Ausente => sem limite (comportamento anterior).
   */
  sendBudget?: { remaining: number };
}

/** Orçamento de envios da execução a partir de ACC_ALERT_BATCH_SIZE (configuração inválida => sem orçamento aqui; o governador do provedor já bloqueia tudo). */
function governorSendBudget(): { remaining: number } | undefined {
  const batchSize = parseGovernorConfig(process.env).batchSize;
  return batchSize === null ? undefined : { remaining: batchSize };
}

/**
 * Atalhos "Responder por e-mail" de UM caso para UM destinatário: token próprio (hash gravado ANTES do envio em
 * email_reply_tokens) e os três mailto (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA). Sem caixa de resposta, sem store, área
 * informativa (sem processamento) ou falha ao gravar => null (o e-mail sai só com os botões do ACC).
 */
export async function issueReplyMailtoForCase(ctx: SendContext, input: { caseId: string; recipientUserId: string; visibleCode: string | null; riskLevel: string; area: string }): Promise<ReplyMailtoLinks | null> {
  if (!ctx.replyTokens || !ctx.snapshot.replyMailbox) return null;
  if ((ctx.snapshot.informativeAreas ?? []).includes(input.area as SlaArea)) return null;
  try {
    const issued = await issueEmailReplyToken(ctx.replyTokens, { projectId: ctx.projectId, subjectKind: "RISK_CASE", subjectId: input.caseId, recipientUserId: input.recipientUserId, nowIso: ctx.nowIso });
    const tracked = input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL";
    return buildReplyMailtoLinks({
      mailbox: ctx.snapshot.replyMailbox,
      token: issued.token,
      visibleCode: input.visibleCode ? `ACC-ALERTA:${input.visibleCode}` : "",
      evidenceAttachment: tracked ? "REQUIRED_FILE" : "OPTIONAL",
      forecastNeedsTime: tracked,
    });
  } catch {
    return null;
  }
}

/**
 * Linha "Previsão de conclusão" dos e-mails de ALTO/CRÍTICO (imediato e escalonamento): a previsão
 * acompanha os escalonamentos — data vigente, alteração, vencimento ou pendência. MÉDIO/BAIXO: null
 * (só registro e exibição na tela). Falha na leitura nunca bloqueia o envio (linha omitida).
 */
export async function forecastLinesForEmail(ctx: SendContext, caseId: string | null, riskLevel: string, caseClosed: boolean): Promise<{ forecastLine: string | null; responderLine: string | null }> {
  const none = { forecastLine: null, responderLine: null };
  if (!caseId || forecastTracking(riskLevel) !== "TRACKED" || !ctx.store.loadCaseForecastEvents) return none;
  try {
    const events = await ctx.store.loadCaseForecastEvents(caseId);
    const summary = resolveForecast({ events, riskLevel, caseClosed, nowIso: ctx.nowIso });
    const fmt = (iso: string) => formatDateTimeBR(iso, ctx.timeZone);
    const who = summary.lastStatusByUserId ? (ctx.snapshot.recipients.get(summary.lastStatusByUserId)?.name ?? "responsável") : null;
    return {
      forecastLine: formatForecastLine(summary, fmt),
      responderLine: summary.lastStatusAt ? `Em andamento (Tomando providências) — informado por ${who ?? "responsável"} em ${fmt(summary.lastStatusAt)}. A resposta não suspende prazos nem escalonamentos.` : null,
    };
  } catch {
    return none;
  }
}

/** Bloqueio fail-closed contra ENVIO TARDIO de mensagens de caso de TESTE (ex.: FORWARD/ESCALATION geradas pelos botões). Não altera a linha. */
export function isPilotTestCaseSendBlocked(record: { title?: string | null; reference?: string | null } | null, idempotencyKey: string, ctx: SendContext): boolean {
  if (!record || !isPilotTestCase(record)) return false;
  if (ctx.pilotSingleArmedKeys?.has(idempotencyKey)) return false;
  ctx.testCaseBlocked = (ctx.testCaseBlocked ?? 0) + 1;
  return true;
}

/** Links das 5 ações (token curto/expirável, só hash persistido). */
async function issueActionLinks(ctx: SendContext, caseId: string, recipientUserId: string): Promise<Partial<Record<AlertActionType, string>>> {
  const links: Partial<Record<AlertActionType, string>> = {};
  const rows: Array<{ action: AlertActionType; tokenHash: string; expiresAt: string }> = [];
  for (const action of EMAIL_ACTION_TYPES) {
    const token = generateActionToken();
    links[action] = buildActionLink(ctx.baseUrl, ctx.projectId, caseId, action, token);
    rows.push({ action, tokenHash: hashActionToken(token), expiresAt: actionLinkExpiry(ctx.nowIso) });
  }
  await ctx.store.createActionLinks(ctx.projectId, caseId, recipientUserId, rows);
  return links;
}

/** Logotipos oficiais disponíveis nesta execução (o HTML só referencia por Content-ID o que realmente será anexado). */
function logosOf(ctx: SendContext): { maroon: boolean; inverted: boolean } {
  return { maroon: ctx.inlineLogo !== null, inverted: (ctx.inlineLogoInverted ?? null) !== null };
}

async function deliver(ctx: SendContext, outboxId: string, caseId: string | null, recipientUserId: string, recipientEmail: string, built: BuiltEmail, notificationType: string, escalationLevel: string | null, idempotencyKey: string, riskLevel?: string): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  // Ciclos simultâneos (instâncias/execuções sobrepostas): só quem reivindicar a linha envia.
  // Quem perde NÃO envia nem altera a linha (o vencedor é o dono dela).
  // PORTÃO de capacidade (governador, doc 35) ANTES da reivindicação: limite por hora/dia atingido => a linha fica ADIADA (PENDING, sem
  // tentativa gasta, sem FAILED) e é retomada na janela seguinte. Alerta crítico nunca é descartado: só adiado, e usa a reserva de cota.
  const governance: AlertGovernanceContext = {
    type: riskAlertGovernanceType(notificationType, idempotencyKey.includes(":PILOT_SINGLE:")),
    projectId: ctx.projectId,
    dedupKey: idempotencyKey,
    priority: riskLevel === "CRITICAL" ? "CRITICAL" : null,
  };
  if (!(await checkAlertCapacity(ctx.provider, governance)).allowed) return "SKIPPED";
  if (ctx.sendBudget) {
    if (ctx.sendBudget.remaining <= 0) return "SKIPPED"; // lote da execução esgotado: a linha fica PENDING (não reivindicada, sem tentativa gasta)
    ctx.sendBudget.remaining -= 1;
  }
  if (!(await ctx.store.claimOutbox(outboxId, ctx.nowIso))) return "SKIPPED";
  // Override de ENTREGA do piloto: só o To muda (nunca CC/BCC); o destinatário
  // lógico (recipientUserId/recipientEmail) permanece na outbox e na auditoria.
  const delivery = resolveDeliveryAddress({
    logicalEmail: recipientEmail,
    overrideEmail: projectPilotActive(ctx.projectId) ? null : (ctx.snapshot.config?.pilotDeliveryOverrideEmail ?? null),
    eventKey: `${caseId ?? idempotencyKey}:${notificationType}:${escalationLevel ?? "-"}`,
  });
  if (delivery.overridden && ctx.deliveredKeys.has(delivery.dedupKey)) {
    await ctx.store.markSkipped(outboxId, `Deduplicado pelo override de entrega do piloto (mesmo evento já entregue em ${delivery.deliveryEmail} neste ciclo).`);
    return "SKIPPED";
  }
  // Aceite do provedor nesta tentativa: depois dele NADA pode devolver a linha à fila (reenvio duplicaria a mensagem).
  let accepted: { provider: string; providerMessageId: string; sentAt: string } | null = null;
  let acceptedRecorded = false;
  try {
    const conversation = caseId ? await ctx.store.ensureConversation(ctx.projectId, caseId) : null;
    // Reply-To = caixa inbound OFICIAL (+alerta-<token>), só em mensagens
    // de conversa de alerta e com o contexto que o guard global exige;
    // fora disso (ex.: consolidado sem caso) não há Reply-To — a
    // correlação segue por In-Reply-To/References/código visível.
    const replyToken = generateReplyToken();
    const replyTo = conversation && ctx.snapshot.replyMailbox ? buildOpaqueReplyTo(ctx.snapshot.replyMailbox, replyToken) : undefined;
    // E-mails do template universal já levam o logotipo no cabeçalho: a assinatura NÃO repete a imagem (e só se anexa o que o HTML usa).
    const universal = built.logoNeeds !== undefined;
    const signed = appendAccEmailSignature({ text: built.text, html: built.html }, ctx.inlineLogo !== null, !universal);
    const inlineImages = universal
      ? [built.logoNeeds?.maroon ? ctx.inlineLogo : null, built.logoNeeds?.inverted ? (ctx.inlineLogoInverted ?? null) : null].filter((image): image is NonNullable<typeof image> => image !== null)
      : ctx.inlineLogo
        ? [ctx.inlineLogo]
        : [];
    const sent = await ctx.provider.send({
      to: delivery.deliveryEmail,
      subject: built.subject,
      text: signed.text,
      html: signed.html,
      inlineImages: inlineImages.length > 0 ? inlineImages : undefined,
      replyTo,
      replyToContext: conversation && replyTo ? { kind: "RISK_ALERT_CONVERSATION", outboxId, conversationId: conversation.id } : undefined,
      inReplyTo: conversation?.rootMessageIdHeader ?? undefined,
      references: conversation?.rootMessageIdHeader ? [conversation.rootMessageIdHeader] : undefined,
      correlationId: crypto.randomUUID(),
      governance,
      vera: { projectId: ctx.projectId, context: "alerta" },
      // Faixa/prefixo de TESTE só no envio único armado (chave PILOT_SINGLE); alertas operacionais saem sem faixa de teste.
      pilot: { projectId: ctx.projectId, participantLabel: `usuário ${recipientUserId.slice(0, 8)}`, escalationLevel: escalationLevel ?? notificationType, testMessage: idempotencyKey.includes(":PILOT_SINGLE:") },
    });
    accepted = { provider: sent.provider, providerMessageId: sent.providerMessageId, sentAt: sent.sentAt };
    const emailId = await ctx.store.recordEmail(ctx.projectId, { from: sent.from, to: delivery.deliveryEmail, subject: built.subject, sentAt: sent.sentAt, snippet: built.text }).catch(() => null);
    await ctx.store.markSent(outboxId, { recipientEmail: delivery.deliveryEmail, provider: sent.provider, providerMessageId: sent.providerMessageId, emailId, sentAt: sent.sentAt, messageIdHeader: sent.messageIdHeader, conversationId: conversation?.id ?? null });
    acceptedRecorded = true;
    ctx.deliveredKeys.add(delivery.dedupKey);
    if (conversation) {
      if (!conversation.rootMessageIdHeader) await ctx.store.setConversationRoot(conversation.id, sent.messageIdHeader, sent.providerThreadId);
      await ctx.store.recordOutboundMessage({
        projectId: ctx.projectId,
        caseId,
        conversationId: conversation.id,
        outboxId,
        provider: sent.provider,
        providerMessageId: sent.providerMessageId,
        providerThreadId: sent.providerThreadId,
        messageIdHeader: sent.messageIdHeader,
        inReplyTo: conversation.rootMessageIdHeader,
        references: conversation.rootMessageIdHeader ? [conversation.rootMessageIdHeader] : [],
        replyTokenHash: replyTo ? hashReplyToken(replyToken) : null,
        recipients: [delivery.deliveryEmail],
        subject: built.subject,
        sentAt: sent.sentAt,
      });
    }
    await ctx.store.audit(ctx.projectId, [
      {
        action: "RISK_ALERT_EMAIL_SENT",
        entityType: caseId ? "RISK_ALERT_CASE" : "RISK_ALERT_DIGEST",
        entityId: caseId ?? idempotencyKey,
        detail: `E-mail ${notificationType}${escalationLevel ? ` (${escalationLevel})` : ""} enviado ao usuário ${recipientUserId} via ${sent.provider} (${sent.providerMessageId}) — aceito pelo provedor; aceite não é confirmação de entrega. Chave ${idempotencyKey}.${sent.cc && sent.cc.length > 0 ? ` Remetente autenticado: ${sent.from}; destinatário principal (usuário lógico): ${sent.to}; cópia institucional: ${sent.cc.join(", ")}.` : ""}${delivery.overridden ? " Override de entrega do piloto: entregue na caixa institucional configurada (destinatário lógico preservado)." : ""}`,
      },
    ]);
    // WhatsApp SIMULADO (desligado por padrão): só alerta CRÍTICO que acabou de chegar à Diretoria. Nunca lança nem altera o resultado do e-mail.
    await runCycleEscalationHook(
      { notificationType, escalationLevel, riskLevel, idempotencyKey, projectId: ctx.projectId, projectName: ctx.projectName, recipientUserId, caseId, baseUrl: ctx.baseUrl, subject: built.subject },
      notifyDirectorateWhatsappSafely
    ).catch(() => false); // o canal nunca pode marcar o e-mail como falho
    return "SENT";
  } catch (error) {
    if (accepted) return recordAcceptedAfterError(ctx, outboxId, idempotencyKey, accepted, acceptedRecorded, delivery.deliveryEmail, delivery.dedupKey);
    const message = error instanceof EmailSendError ? error.message : sanitizeError(error);
    // Classe da falha (diagnóstico normalizado do provedor): PERMANENTE e INCERTA saem da fila — a incerta pode ter sido
    // aceita e reenviar duplicaria; só a transitória volta a ser tentada (limitada por MAX_SEND_ATTEMPTS).
    const failureClass = classifySendFailure(error);
    await ctx.store.markFailed(outboxId, sanitizeError(message), { attemptAlreadyClaimed: true, failureClass });
    await ctx.store.audit(ctx.projectId, [{ action: "RISK_ALERT_EMAIL_FAILED", entityType: "RISK_ALERT_OUTBOX", entityId: outboxId, detail: `Falha de envio (${idempotencyKey}) [${failureClass}: ${FAILURE_CLASS_NOTES[failureClass]}]: ${sanitizeError(message)}` }]);
    return "FAILED";
  }
}

/**
 * O provedor JÁ aceitou a mensagem, mas um passo posterior (gravação, conversa, auditoria) falhou. A linha NUNCA volta à
 * fila: se o aceite ainda não foi gravado, tenta gravar de novo; se não der, marca como resultado INCERTO (terminal) para
 * que a expiração da reivindicação não reenvie. Em todos os casos registra a ocorrência na auditoria.
 */
async function recordAcceptedAfterError(ctx: SendContext, outboxId: string, idempotencyKey: string, accepted: { provider: string; providerMessageId: string; sentAt: string }, alreadyRecorded: boolean, recipientEmail: string, dedupKey: string): Promise<"SENT" | "FAILED"> {
  let recorded = alreadyRecorded;
  if (!recorded) {
    try {
      await ctx.store.markSent(outboxId, { recipientEmail, provider: accepted.provider, providerMessageId: accepted.providerMessageId, emailId: null, sentAt: accepted.sentAt, messageIdHeader: "", conversationId: null });
      recorded = true;
    } catch {
      await ctx.store
        .markFailed(outboxId, `Aceito pelo provedor (${accepted.providerMessageId}), mas a gravação do aceite falhou — verificar Enviados antes de qualquer reenvio.`, { attemptAlreadyClaimed: true, failureClass: "UNCERTAIN" })
        .catch(() => undefined);
    }
  }
  if (recorded) ctx.deliveredKeys.add(dedupKey);
  await ctx.store
    .audit(ctx.projectId, [{ action: recorded ? "RISK_ALERT_EMAIL_SENT" : "RISK_ALERT_EMAIL_ACCEPTED_UNRECORDED", entityType: "RISK_ALERT_OUTBOX", entityId: outboxId, detail: `E-mail aceito pelo provedor ${accepted.provider} (${accepted.providerMessageId}) com falha em registro posterior; ${recorded ? "aceite gravado" : "aceite NÃO gravado — linha marcada como resultado incerto, sem reenvio automático"}. Chave ${idempotencyKey}.` }])
    .catch(() => undefined);
  return recorded ? "SENT" : "FAILED";
}

/** Um token (e três atalhos) POR ITEM aberto do consolidado — cada ocorrência é tratada individualmente. */
async function digestReplyMailto(ctx: SendContext, items: ReadonlyArray<{ caseKey: string; riskLevel: string }>, caseIdByKey: ReadonlyMap<string, string>, recipientUserId: string): Promise<Map<string, ReplyMailtoLinks>> {
  const out = new Map<string, ReplyMailtoLinks>();
  if (!ctx.replyTokens || !ctx.snapshot.replyMailbox) return out;
  for (const item of items) {
    const caseId = caseIdByKey.get(item.caseKey);
    if (!caseId || out.has(caseId)) continue;
    const record = await ctx.store.loadCaseRecord(caseId).catch(() => null);
    if (!record || record.status === "CLOSED") continue;
    const links = await issueReplyMailtoForCase(ctx, { caseId, recipientUserId, visibleCode: record.visibleCode ?? null, riskLevel: item.riskLevel, area: record.area });
    if (links) out.set(caseId, links);
  }
  return out;
}

export async function sendPlanned(outboxId: string, caseId: string | null, entry: PlannedOutboxEntry, ctx: SendContext): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  const recipientEmail = entry.recipient.email;
  if (!recipientEmail) {
    await ctx.store.markFailed(outboxId, "Destinatário sem e-mail no momento do envio.");
    return "FAILED";
  }
  const record = caseId ? await ctx.store.loadCaseRecord(caseId) : null;
  if (isPilotTestCaseSendBlocked(record, entry.idempotencyKey, ctx)) return "SKIPPED";
  let built: BuiltEmail;
  if (entry.content.kind === "DIGEST") {
    const digestContent = entry.content;
    const replyByEmailByCaseId = await digestReplyMailto(ctx, [...digestContent.mediumItems, ...digestContent.lowItems], ctx.caseIds, entry.recipient.userId);
    built = buildRiskDigestEmail({ content: digestContent, projectId: ctx.projectId, projectName: ctx.projectName, recipientName: entry.recipient.name, baseUrl: ctx.baseUrl, timeZone: ctx.timeZone, generatedAt: ctx.nowIso, caseIdByKey: ctx.caseIds, logos: logosOf(ctx), replyByEmailByCaseId });
  } else {
    const lines = await forecastLinesForEmail(ctx, caseId, entry.riskLevel, record?.status === "CLOSED");
    built = buildImmediateRiskAlertEmail({
      content: lines.forecastLine || lines.responderLine ? { ...entry.content, ...lines } : entry.content,
      projectId: ctx.projectId,
      projectName: ctx.projectName,
      recipientName: entry.recipient.name,
      baseUrl: ctx.baseUrl,
      timeZone: ctx.timeZone,
      generatedAt: ctx.nowIso,
      // Com caso registrado, os quatro botões do caso (record_risk_alert_action) são o ÚNICO canal de tratamento: os links
      // de SLA (DAR CIÊNCIA / ASSUMIR...) gravariam só na ação SLA e o caso divergiria. Sem caso, ficam como antes.
      actionButtons: entry.slaActionId && !caseId
        ? await issueEmailAlertActionButtons({ projectId: ctx.projectId, alertKind: "SLA_ACTION", alertId: entry.slaActionId, intendedRecipientEmail: recipientEmail }).catch(() => [])
        : [],
      actionLinks: caseId ? await issueActionLinks(ctx, caseId, entry.recipient.userId) : undefined,
      visibleCode: record?.visibleCode ?? null,
      caseId,
      logos: logosOf(ctx),
      replyByEmail: caseId && record ? await issueReplyMailtoForCase(ctx, { caseId, recipientUserId: entry.recipient.userId, visibleCode: record.visibleCode ?? null, riskLevel: entry.riskLevel, area: record.area }) : null,
    });
  }
  const outcome = await deliver(ctx, outboxId, caseId, entry.recipient.userId, recipientEmail, built, entry.notificationType, entry.escalationLevel, entry.idempotencyKey, entry.riskLevel);
  if (outcome === "SENT" && entry.content.kind === "DIGEST") {
    const caseKeys = (entry.payloadSummary.caseKeys as string[] | undefined) ?? [];
    await ctx.store.markDigestWindow(caseKeys.map((key) => ctx.caseIds.get(key)).filter((id): id is string => Boolean(id)), entry.content.window);
  }
  return outcome;
}

/** Entradas de outras origens (MANUAL, WEB_ACTION, EMAIL_REPLY, Expert, retry): conteúdo reconstruído do caso. */
/** Janela do consolidado (YYYY-MM-DD, quarta-feira) além da qual uma retentativa já não faz sentido. */
const DIGEST_RETRY_MAX_AGE_DAYS = 6;

/**
 * Retentativa de um CONSOLIDADO semanal PENDENTE (o 1º envio falhou). Separado dos alertas
 * individuais: o consolidado não tem caso de risco; seu conteúdo é reconstruído dos metadados
 * persistidos (rebuild-digest-content.ts) e o destinatário é sempre o ORIGINAL da linha.
 * A mesma chave de idempotência/linha é usada — nunca cria uma segunda linha.
 */
async function sendPendingDigest(row: PendingOutboxRow, ctx: SendContext): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  const config = ctx.snapshot.config!;
  const window = typeof row.payloadSummary.window === "string" ? row.payloadSummary.window : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(window)) {
    await ctx.store.markSkipped(row.id, "DIGEST_WINDOW_UNKNOWN: consolidado sem janela identificável — não reenviado.");
    return "SKIPPED";
  }
  const ageDays = (new Date(ctx.nowIso).getTime() - new Date(`${window}T00:00:00.000Z`).getTime()) / 86_400_000;
  if (ageDays > DIGEST_RETRY_MAX_AGE_DAYS) {
    await ctx.store.markSkipped(row.id, `DIGEST_WINDOW_EXPIRED: janela ${window} encerrada — consolidado não reenviado.`);
    return "SKIPPED";
  }
  // Prontidão (mesmo critério do planejador): com bloqueio a linha PERMANECE pendente (sem consumir tentativa) e é reavaliada no próximo ciclo.
  if (ctx.readinessBlockers.length > 0) return "SKIPPED";
  const recipient = evaluateRecipient(row.recipientUserId, config, ctx.snapshot.recipients);
  if (recipient.status === "SUPPRESSED") {
    await ctx.store.markSkipped(row.id, `Destinatário não elegível no envio (${recipient.suppressionReason}).`);
    return "SKIPPED";
  }
  if (!recipient.email) {
    await ctx.store.markFailed(row.id, "Destinatário sem e-mail.");
    return "FAILED";
  }
  const rebuilt = rebuildDigestContent({ window, payloadSummary: row.payloadSummary, cases: ctx.snapshot.existingCases, recipients: ctx.snapshot.recipients });
  if (!rebuilt) {
    await ctx.store.markSkipped(row.id, "DIGEST_EMPTY: nenhum item do consolidado permanece disponível — não reenviado.");
    return "SKIPPED";
  }
  const retryCaseIdByKey = new Map(ctx.snapshot.existingCases.map((c) => [`${c.sourceType}:${c.sourceId}`, c.id]));
  const replyByEmailByCaseId = await digestReplyMailto(ctx, [...rebuilt.content.mediumItems, ...rebuilt.content.lowItems], retryCaseIdByKey, row.recipientUserId);
  const built = buildRiskDigestEmail({ content: rebuilt.content, projectId: ctx.projectId, projectName: ctx.projectName, recipientName: recipient.name, baseUrl: ctx.baseUrl, timeZone: ctx.timeZone, generatedAt: ctx.nowIso, caseIdByKey: retryCaseIdByKey, logos: logosOf(ctx), replyByEmailByCaseId });
  const outcome = await deliver(ctx, row.id, null, row.recipientUserId, recipient.email, built, row.notificationType, null, row.idempotencyKey);
  if (outcome === "SENT") {
    const caseKeys = ((row.payloadSummary.caseKeys as string[] | undefined) ?? []);
    const idByKey = new Map(ctx.snapshot.existingCases.map((c) => [`${c.sourceType}:${c.sourceId}`, c.id]));
    await ctx.store.markDigestWindow(caseKeys.map((key) => idByKey.get(key)).filter((id): id is string => Boolean(id)), window);
    await ctx.store.audit(ctx.projectId, [
      {
        action: "RISK_ALERT_DIGEST_RETRY_SENT",
        entityType: "RISK_ALERT_DIGEST",
        entityId: row.idempotencyKey,
        detail: `Consolidado da janela ${window} reenviado ao usuário ${row.recipientUserId} após falha anterior (tentativa ${row.attemptCount + 1}).${rebuilt.reconstructedFromKeys ? " Conteúdo reconstruído a partir das chaves de caso (itens originais não estavam persistidos)." : ""}${rebuilt.droppedKeys.length ? ` ${rebuilt.droppedKeys.length} item(ns) não encontrado(s) omitido(s).` : ""}`,
      },
    ]);
  }
  return outcome;
}

async function sendPendingRow(row: PendingOutboxRow, ctx: SendContext): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  const config = ctx.snapshot.config;
  if (!config) {
    await ctx.store.markSkipped(row.id, "Projeto sem configuração.");
    return "SKIPPED";
  }
  if (row.notificationType === "DIGEST") return sendPendingDigest(row, ctx);
  const record = row.caseId ? await ctx.store.loadCaseRecord(row.caseId) : null;
  if (isPilotTestCaseSendBlocked(record, row.idempotencyKey, ctx)) return "SKIPPED";
  if (!record) {
    // Delimitação da outbox: sem risk_alert_case nada é enviado por aqui
    // (ações SLA comuns permanecem no fluxo antigo).
    await ctx.store.markSkipped(row.id, "RISK_CASE_REQUIRED: entrada sem alerta de risco vinculado — fora da outbox de alertas (fluxo antigo permanece).");
    return "SKIPPED";
  }
  if ((ctx.snapshot.suspendedCaseIds ?? []).includes(record.id)) {
    // Comunicação suspensa por registro humano auditado (ex.: ausência não comprovada): nada sai deste caso.
    await ctx.store.markSkipped(row.id, "CASE_COMMUNICATION_SUSPENDED: comunicação do caso suspensa até concluir a verificação — sem envio, repetição ou escalonamento.");
    return "SKIPPED";
  }
  if ((ctx.snapshot.informativeAreas ?? []).includes(record.area)) {
    // Área informativa: nenhuma mensagem de alerta/cobrança/escalonamento sai, nem de outra origem.
    await ctx.store.markSkipped(row.id, "INFORMATIVE_AREA: área informativa no projeto — sem envio de alertas, cobranças ou escalonamentos.");
    return "SKIPPED";
  }
  if (record.status === "CLOSED" && row.notificationType !== "ACTION_CONFIRMATION") {
    await ctx.store.markSkipped(row.id, "Caso encerrado antes do envio.");
    return "SKIPPED";
  }
  const recipient = evaluateRecipient(row.recipientUserId, config, ctx.snapshot.recipients);
  const forwardException = row.notificationType === "FORWARD" && Boolean(row.payloadSummary.pilotException);
  if (recipient.status === "SUPPRESSED" && !(forwardException && recipient.suppressionReason === "PILOT_RECIPIENT_SUPPRESSED")) {
    await ctx.store.markSkipped(row.id, `Destinatário não elegível no envio (${recipient.suppressionReason}).`);
    return "SKIPPED";
  }
  if (!recipient.email) {
    await ctx.store.markFailed(row.id, "Destinatário sem e-mail.");
    return "FAILED";
  }
  const riskLevel = (record.riskLevel === "REVIEW_REQUIRED" ? "MEDIUM" : record.riskLevel) as SlaRiskLevel;
  const policy = ctx.policyFor(record.area, riskLevel);
  const nameOf = (id: string | null) => (id ? (ctx.snapshot.recipients.get(id)?.name ?? null) : null);
  let built: BuiltEmail;
  if (row.notificationType === "ESCALATION") {
    const level = (row.escalationLevel ?? record.currentLevel) as SlaEscalationLevel;
    const content: ImmediateAlertContent = {
      kind: "ESCALATION",
      caseTitle: record.title,
      reference: record.reference,
      riskLevel,
      area: record.area,
      summary: record.summary,
      impact: record.impact,
      recommendation: record.recommendation,
      originPath: record.originPath || "documentos?tab=registro-email",
      slaActionId: record.slaActionId,
      levelLabel: levelLabelFor(level, policy),
      levelNote: levelNoteFor(level, policy, record.area),
      previousLevelLabel: row.payloadSummary.fromLevel ? levelLabelFor(row.payloadSummary.fromLevel as SlaEscalationLevel, policy) : null,
      responsibleName: nameOf(record.currentResponsibleUserId),
      deadlineLabel: "Escalonado em",
      deadlineAt: ctx.nowIso,
      requiresAcknowledgment: policy.requiresAcknowledgmentConfirmation,
      requiresJustification: policy.requiresDelayJustification,
      escalationReason: (row.payloadSummary.trigger as string | undefined) ? `Escalonamento imediato por ação ${row.payloadSummary.trigger}` : row.origin === "MANUAL" ? "Escalonamento manual (Processar escalonamentos)" : "Prazo da Matriz vencido",
      changed: false,
      ...(await forecastLinesForEmail(ctx, record.id, riskLevel, false)),
    };
    built = buildImmediateRiskAlertEmail({ content, projectId: ctx.projectId, projectName: ctx.projectName, recipientName: recipient.name, baseUrl: ctx.baseUrl, timeZone: ctx.timeZone, generatedAt: ctx.nowIso, actionButtons: [], actionLinks: await issueActionLinks(ctx, record.id, row.recipientUserId), visibleCode: record.visibleCode, caseId: record.id, logos: logosOf(ctx), replyByEmail: await issueReplyMailtoForCase(ctx, { caseId: record.id, recipientUserId: row.recipientUserId, visibleCode: record.visibleCode ?? null, riskLevel, area: record.area }) });
  } else {
    const kind = (["FORWARD", "RETURNED", "EXPERT_ANSWER", "ACTION_CONFIRMATION"] as const).find((k) => k === row.notificationType) ?? "ACTION_CONFIRMATION";
    const rows: Array<[string, string | null]> = [];
    const paragraphs: string[] = [];
    if (kind === "FORWARD") {
      rows.push(["Encaminhado por", nameOf((row.payloadSummary.forwardedBy as string) ?? null)], ["Instrução", (row.payloadSummary.instruction as string) || null], ["Prazo para assumir", formatDateTimeBR((row.payloadSummary.assumeDueAt as string) ?? null, ctx.timeZone)], ["Responsável anterior", nameOf(record.previousResponsibleUserId)], ["Responsável atual", nameOf(record.currentResponsibleUserId)]);
      if (row.payloadSummary.pilotException) rows.push(["Piloto", "Você recebe apenas este alerta (exceção manual registrada)."]);
    } else if (kind === "RETURNED") {
      rows.push(["Motivo", "Encaminhado sem ação até o prazo para assumir"], ["Encaminhado para", nameOf((row.payloadSummary.forwardedTo as string) ?? null)], ["Prazo expirado em", formatDateTimeBR((row.payloadSummary.timeoutAt as string) ?? null, ctx.timeZone)], ["Responsável atual", nameOf(record.currentResponsibleUserId)]);
    } else if (kind === "ACTION_CONFIRMATION" && row.payloadSummary.replyConfirmation) {
      // Confirmação ao autor da resposta: status, previsão interpretada (fuso) e pendências.
      const parts = buildReplyConfirmationParts(row.payloadSummary, { timeZone: ctx.timeZone, formatDate: (iso) => formatDateTimeBR(iso, ctx.timeZone), responsibleName: nameOf(record.currentResponsibleUserId) });
      rows.push(...parts.rows);
      paragraphs.push(...parts.paragraphs);
    } else if (kind === "EXPERT_ANSWER") {
      rows.push(["Expert", (row.payloadSummary.expertId as string) ?? null], ["Confiança", row.payloadSummary.confidence !== undefined ? String(row.payloadSummary.confidence) : null]);
      paragraphs.push((row.payloadSummary.answerPreview as string) ?? "");
    }
    built = buildAlertFollowUpEmail({ kind, projectId: ctx.projectId, projectName: ctx.projectName, recipientName: recipient.name, baseUrl: ctx.baseUrl, timeZone: ctx.timeZone, generatedAt: ctx.nowIso, caseId: record.id, caseTitle: record.title, riskLevel, visibleCode: record.visibleCode, area: record.area, logos: logosOf(ctx), rows, paragraphs, requiresHumanReview: kind === "EXPERT_ANSWER", actionLinks: kind === "FORWARD" ? await issueActionLinks(ctx, record.id, row.recipientUserId) : undefined, ...(kind === "ACTION_CONFIRMATION" && row.payloadSummary.replyConfirmation ? { titleOverride: REPLY_CONFIRMATION_TITLE } : {}), replyByEmail: record.status === "CLOSED" ? null : await issueReplyMailtoForCase(ctx, { caseId: record.id, recipientUserId: row.recipientUserId, visibleCode: record.visibleCode ?? null, riskLevel, area: record.area }) });
  }
  const outcome = await deliver(ctx, row.id, record.id, row.recipientUserId, recipient.email, built, row.notificationType, row.escalationLevel, row.idempotencyKey, row.riskLevel);
  return outcome;
}
