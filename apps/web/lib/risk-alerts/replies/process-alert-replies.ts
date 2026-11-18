// Processamento das respostas recebidas (alert_email_messages INBOUND,
// status RECEIVED) — orquestração sobre o pipeline puro + store. Usado
// pela fase `replies` do worker GitHub (service role); sem "server-only".
//   filtro -> correlação -> autorização -> limpeza -> classificação ->
//   ação formal (só quando inequívoca) via máquina de estados/RPC,
//   senão registro (REPLY_RECEIVED) ou revisão humana.
// O corpo nunca vai para logs/auditoria; só ids e classificação.

import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaRiskLevel } from "@/lib/sla/types";

import { applyAlertAction } from "../alert-state-machine";
import { applyPilotLevelOverride } from "../pilot-level-overrides";
import { applyForecastPrecision, describeForecastProblem, extractForecastFromText, forecastTracking, isAfter } from "../forecast";
import { routeExpert } from "../experts/route-alert-expert";
import { DEFAULT_CORPORATE_EMAIL_DOMAIN } from "../plan-risk-alerts";
import type { RiskAlertStore } from "../store";
import { applyMessageIdAliases } from "./build-correlation-index";
import { assessReplyTiming } from "./reply-timing";
import { assessOperationalEmailIntent } from "./operational-email-intent";
import { authorizeReply, classifyReply, correlateReply, filterInboundMessage, parseReplyBody, replyToFormalAction } from "./reply-pipeline";

export interface ProcessRepliesResult {
  projectId: string;
  received: number;
  ignored: number;
  unauthorized: number;
  pendingHumanReview: number;
  reviewRequired: number;
  applied: number;
  recorded: number;
  /** Escalonamentos aplicados DEPOIS do recebimento de uma resposta (leitura atrasada): correção auditada. */
  timingCorrections?: number;
  /** Respostas sem previsão: pendência registrada separadamente. */
  forecastPending?: number;
}

// Modelo de entrega direta do piloto: cada colaborador responde com a PRÓPRIA identidade (From real) — a autorização é sempre por
// remetente (authorizeReply: perfil, vínculo ativo, destinatário lógico do alerta e allowlist). Não existe mais atribuição de resposta
// por "caixa do piloto": uma resposta vinda do ACC (crm@) ou de endereço desconhecido NUNCA é atribuída a participante algum.
export interface ProcessRepliesOptions {
  /** Message-ID REAL (lido na caixa) -> Message-ID gravado pelo ACC. Só em memória; ver applyMessageIdAliases. */
  messageIdAliases?: ReadonlyMap<string, string>;
}

export async function processAlertReplies(store: RiskAlertStore, projectId: string, nowIso: string, accMailboxes: string[], options: ProcessRepliesOptions = {}): Promise<ProcessRepliesResult> {
  const selfMailboxes = accMailboxes;
  const result: ProcessRepliesResult = { projectId, received: 0, ignored: 0, unauthorized: 0, pendingHumanReview: 0, reviewRequired: 0, applied: 0, recorded: 0 };
  const inbound = await store.listInboundToProcess(projectId);
  if (inbound.length === 0) return result;
  const snapshot = await store.loadProjectSnapshot(projectId);
  const index = await store.loadCorrelationIndex(projectId);
  if (options.messageIdAliases && options.messageIdAliases.size > 0) applyMessageIdAliases(index, options.messageIdAliases);
  const config = snapshot.config;
  const corporateDomain = (config?.senderDomain ?? DEFAULT_CORPORATE_EMAIL_DOMAIN).toLowerCase();
  const profileByEmail = new Map<string, { userId: string; email: string; membershipStatus: string | null }>();
  const profileById = new Map<string, { userId: string; membershipStatus: string | null }>();
  for (const profile of snapshot.recipients.values()) {
    if (profile.email) profileByEmail.set(profile.email.toLowerCase(), { userId: profile.userId, email: profile.email, membershipStatus: profile.membershipStatus });
    profileById.set(profile.userId, { userId: profile.userId, membershipStatus: profile.membershipStatus });
  }

  for (const message of inbound) {
    result.received += 1;
    const verdict = filterInboundMessage(message.headers, { accMailboxes: selfMailboxes, seenMessageIds: index.seenMessageIds });
    if (verdict !== "OK") {
      await store.updateInboundMessage(message.id, { status: verdict, statusReason: verdict });
      result.ignored += 1;
      continue;
    }
    // Aceita UMA vez: a duplicata (mesmo Message-ID) pendente neste lote vira IGNORED_LOOP.
    if (message.headers.messageId) index.seenMessageIds.add(message.headers.messageId);
    const parsed = parseReplyBody(message.bodyOriginal);
    const correlation = correlateReply(message.headers, `${message.headers.subject ?? ""}\n${parsed.clean}`, index);
    if (!correlation.caseId) {
      await store.updateInboundMessage(message.id, { bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature, correlationMethod: correlation.method, status: "PENDING_HUMAN_REVIEW", statusReason: correlation.ambiguous ? "Correlação ambígua (mais de um alerta)" : "Sem identificação inequívoca do alerta", requiresHumanReview: true });
      result.pendingHumanReview += 1;
      continue;
    }
    const loaded = await store.loadCaseSnapshotForAction(correlation.caseId);
    if (!loaded) {
      await store.updateInboundMessage(message.id, { correlationMethod: correlation.method, status: "PENDING_HUMAN_REVIEW", statusReason: "Alerta não encontrado", requiresHumanReview: true });
      result.pendingHumanReview += 1;
      continue;
    }
    const senderProfile = profileByEmail.get(message.headers.from.trim().toLowerCase()) ?? null;
    const baseAuthorization = authorizeReply({
      senderEmail: message.headers.from,
      profile: senderProfile ? { userId: senderProfile.userId, email: senderProfile.email, active: true } : null,
      membershipStatus: senderProfile?.membershipStatus ?? null,
      alertRecipientUserIds: loaded.alertRecipientUserIds,
      allowlistUserIds: config?.pilotRecipientAllowlistUserIds ?? [],
      activeForwardToUserId: loaded.snapshot.activeForward?.state === "ACTIVE" ? loaded.snapshot.activeForward.toUserId : null,
      corporateDomain,
      authenticationResults: message.headers.authenticationResults ?? null,
    });
    const authorization: { authorized: true; userId: string; note: string | null } | { authorized: false; reason: string } = baseAuthorization;
    if (!authorization.authorized) {
      // Não altera o alerta; não devolve dados do projeto; registra o motivo.
      await store.updateInboundMessage(message.id, { caseId: correlation.caseId, correlationMethod: correlation.method, bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature, status: "UNAUTHORIZED_REPLY", statusReason: authorization.reason });
      await store.audit(projectId, [{ action: "RISK_ALERT_UNAUTHORIZED_REPLY", entityType: "RISK_ALERT_CASE", entityId: correlation.caseId, detail: `Resposta não autorizada (${authorization.reason}); mensagem ${message.id}.` }]);
      result.unauthorized += 1;
      continue;
    }
    // Não transformar "resolvido", encaminhamento ou evidências em um simples
    // TAKING_ACTION. Até existir execução transacional específica com autorização,
    // essas intenções ficam rastreadas para revisão humana, sem mexer no SLA.
    const operational = assessOperationalEmailIntent(parsed.clean);
    if (operational.requiresReview) {
      await store.updateInboundMessage(message.id, {
        caseId: correlation.caseId,
        senderUserId: authorization.userId,
        bodyClean: parsed.clean,
        quotedText: parsed.quoted,
        signatureText: parsed.signature,
        correlationMethod: correlation.method,
        status: "REVIEW_REQUIRED",
        statusReason: `Operação por e-mail: ${operational.intent} — ${operational.reason}`,
        requiresHumanReview: true,
      });
      result.reviewRequired += 1;
      continue;
    }
    const classification = classifyReply(parsed.clean);
    // Previsão de término: "em andamento" (STATUS_UPDATE => TOMANDO PROVIDÊNCIAS) pede a data de conclusão.
    // Referência = recebimento do e-mail (processamento atrasado não invalida a data). ALTO/CRÍTICO exigem horário.
    const formalEarly = replyToFormalAction(classification);
    const forecast = formalEarly === "TAKING_ACTION" ? extractForecastFromText(parsed.clean, message.receivedAt) : null;
    const forecastDecision = forecast ? applyForecastPrecision(forecast, forecastTracking(loaded.snapshot.riskLevel)) : null;
    // Recebimento (internalDate do Gmail) × processamento: registro auditado, correção de escalonamento aplicado depois de uma
    // resposta já recebida (leitura atrasada) e pendência de previsão — sem apagar histórico. Falha aqui nunca bloqueia a resposta.
    try {
      const timingContext = loaded.snapshot.slaActionId && store.loadReplyTimingContext ? await store.loadReplyTimingContext(loaded.snapshot.slaActionId) : null;
      const timing = assessReplyTiming({ caseId: correlation.caseId, messageId: message.id, receivedAt: message.receivedAt ?? null, processedAt: nowIso, classification: classification.classification, text: parsed.clean, context: timingContext, forecast: forecastDecision ? { pending: forecastDecision.status !== "VALID", problem: forecastDecision.status === "VALID" ? null : describeForecastProblem(forecastDecision) } : undefined });
      await store.audit(projectId, timing.events);
      if (timing.correctedEscalations > 0) result.timingCorrections = (result.timingCorrections ?? 0) + timing.correctedEscalations;
      if (timing.forecastPending) result.forecastPending = (result.forecastPending ?? 0) + 1;
    } catch {
      // auditoria de prazo indisponível nesta rodada — a resposta segue o fluxo normal
    }
    const basePatch = { caseId: correlation.caseId, senderUserId: authorization.userId, bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature, classification: classification.classification, confidence: classification.confidence, correlationMethod: correlation.method };
    const riskLevel = loaded.snapshot.riskLevel as SlaRiskLevel;
    const formal = formalEarly;
    const digestLike = riskLevel === "LOW" || riskLevel === "MEDIUM";
    if (classification.ambiguous || !formal || loaded.snapshot.state === "RESOLVED") {
      // Ambígua/inconclusiva: registra sem confirmar, resolver ou reatribuir.
      await store.updateInboundMessage(message.id, { ...basePatch, status: classification.ambiguous ? "REVIEW_REQUIRED" : "PROCESSED", statusReason: classification.ambiguous ? "Classificação ambígua" : "Registrada sem ação formal", requiresHumanReview: classification.ambiguous });
      if (classification.ambiguous) result.reviewRequired += 1;
      else result.recorded += 1;
      continue;
    }
    if (!config) {
      await store.updateInboundMessage(message.id, { ...basePatch, status: "REVIEW_REQUIRED", statusReason: "Projeto sem configuração", requiresHumanReview: true });
      result.reviewRequired += 1;
      continue;
    }
    if ((snapshot.informativeAreas ?? []).includes(loaded.record.area)) {
      // Área informativa no projeto (ex.: FINANCEIRO no piloto): a resposta fica registrada, sem ação,
      // escalonamento, cobrança ou confirmação automática.
      await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: "Área informativa: registrada sem ação automática" });
      result.recorded += 1;
      continue;
    }
    // Mesma política do ciclo, inclusive a exceção temporária do piloto por nível (Nível 2) — a Matriz não muda.
    const policy = applyPilotLevelOverride(
      resolveMatrixPolicy({ rules: snapshot.matrixRules, responsibles: snapshot.areaResponsibles, settings: snapshot.settings, area: loaded.record.area, riskLevel }),
      snapshot.pilotLevelOverrides,
      config.pilotRecipientAllowlistUserIds ?? null
    );
    // Pergunta ao Expert por resposta livre: roteamento por NOME/TEMA
    // (multidisciplinar => multi-Expert); sem confiança => revisão humana.
    // Nunca cai em Planejamento por falta de classificação.
    const expertRouting = formal === "EXPERT_CONSULTATION" ? routeExpert({ question: parsed.clean }) : null;
    if (expertRouting?.reviewRequired) {
      await store.updateInboundMessage(message.id, { ...basePatch, expertRouting: { ...expertRouting }, status: "EXPERT_SELECTION_REVIEW_REQUIRED", statusReason: expertRouting.reason, requiresHumanReview: true });
      result.reviewRequired += 1;
      continue;
    }
    const transition = applyAlertAction({
      now: nowIso,
      snapshot: loaded.snapshot,
      action: formal,
      actorUserId: authorization.userId,
      origin: "EMAIL",
      payload:
        formal === "EXPERT_CONSULTATION"
          ? { expertId: expertRouting!.expertId, expertRouting: { ...expertRouting }, question: parsed.clean, messageId: message.id }
          : {
              text: parsed.clean,
              messageId: message.id,
              forecastAt: forecast?.status === "VALID" ? forecast.iso : null,
              forecastHasTime: forecast?.status === "VALID" ? forecast.hasTime : undefined,
              forecastMatched: forecast && forecast.status !== "MISSING" ? forecast.matched : null,
              forecastReferenceAt: message.receivedAt,
              forecastProblem: forecast && forecast.status !== "VALID" ? describeForecastProblem(forecast) : null,
            },
      policy,
      config,
      recipients: snapshot.recipients,
      eligibleForwardUserIds: [],
    });
    const confirmation = transition.ok ? (transition.outbox.find((entry) => entry.idempotencyKey.includes(":REPLY_CONFIRMATION:")) ?? null) : null;

    // Fora de ordem: já existe informação de status/previsão MAIS RECENTE (pela data de recebimento)
    // neste alerta => a mensagem antiga fica no histórico (com a sua data, que não vira a vigente)
    // e NÃO altera estado, responsável nem previsão.
    if (transition.ok && formal === "TAKING_ACTION" && store.loadCaseForecastEvents && store.recordForecastReply) {
      const history = await store.loadCaseForecastEvents(correlation.caseId);
      const newer = history.find((event) => isAfter(event.effectiveAt, message.receivedAt));
      if (newer) {
        const forecastAt = transition.forecast?.status === "VALID" ? transition.forecast.forecastAt : null;
        await store.recordForecastReply({ projectId, caseId: correlation.caseId, actorUserId: authorization.userId, fromState: loaded.snapshot.state, messageId: message.id, forecastAt, text: parsed.clean });
        await store.audit(projectId, [{ action: "RISK_ALERT_REPLY_OUT_OF_ORDER", entityType: "RISK_ALERT_CASE", entityId: correlation.caseId, detail: `Resposta (mensagem ${message.id}, recebida ${message.receivedAt}) anterior a uma atualização já registrada (${newer.effectiveAt}): mantida no histórico sem alterar estado nem previsão vigente.` }]);
        if (confirmation && store.enqueueReplyConfirmation) {
          await store.enqueueReplyConfirmation(projectId, correlation.caseId, { ...confirmation, payloadSummary: { ...confirmation.payloadSummary, outOfOrder: true, escalatedTo: null, statusLabel: "Registrada no histórico — há atualização mais recente neste alerta; nada foi alterado" } });
        }
        await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: "Fora de ordem: registrada no histórico sem alterar o alerta" });
        result.recorded += 1;
        continue;
      }
    }

    if (!transition.ok || digestLike) {
      // LOW/MEDIUM: resposta registrada; sem escalonamento/ação automática. A previsão (ou a sua
      // pendência) é registrada e exibida — sem escalonamento adicional nem novas exigências.
      let forecastNote = "";
      if (transition.ok && digestLike && formal === "TAKING_ACTION" && forecastTracking(riskLevel) === "RECORD_ONLY" && store.recordForecastReply) {
        const forecastAt = transition.forecast?.status === "VALID" ? transition.forecast.forecastAt : null;
        await store.recordForecastReply({ projectId, caseId: correlation.caseId, actorUserId: authorization.userId, fromState: loaded.snapshot.state, messageId: message.id, forecastAt, text: parsed.clean });
        forecastNote = forecastAt ? " · previsão de conclusão registrada" : " · previsão de conclusão pendente";
        // Pendência de previsão: registro único RISK_ALERT_REPLY_FORECAST_PENDING (auditoria de recebimento acima).
        if (forecastAt) await store.audit(projectId, [{ action: "RISK_ALERT_FORECAST_RECORDED", entityType: "RISK_ALERT_CASE", entityId: correlation.caseId, detail: `Previsão de conclusão ${forecastAt} informada por e-mail (mensagem ${message.id}; ${riskLevel}: só registro, sem escalonamento adicional).` }]);
      }
      // Confirmação só depois da persistência acima (resposta registrada).
      if (transition.ok && confirmation && store.enqueueReplyConfirmation) {
        await store.enqueueReplyConfirmation(projectId, correlation.caseId, { ...confirmation, payloadSummary: { ...confirmation.payloadSummary, escalatedTo: null, statusLabel: `Resposta registrada (risco ${riskLevel === "LOW" ? "BAIXO" : "MÉDIO"}: sem alteração automática do alerta)` } });
      }
      await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: transition.ok ? `Registrada (consolidado LOW/MEDIUM — sem ação automática)${forecastNote}` : transition.message });
      result.recorded += 1;
      continue;
    }
    try {
      // A confirmação ao responsável está na outbox da transição: gravada na mesma transação (RPC).
      await store.applyTransition(correlation.caseId, transition, authorization.userId);
      // Pendência de previsão: registro único RISK_ALERT_REPLY_FORECAST_PENDING (auditoria de recebimento acima).
      if (transition.forecast?.status === "VALID") {
        await store.audit(projectId, [{ action: "RISK_ALERT_FORECAST_RECORDED", entityType: "RISK_ALERT_CASE", entityId: correlation.caseId, detail: `Previsão de conclusão ${transition.forecast.forecastAt} informada por e-mail (mensagem ${message.id}); acompanha os escalonamentos. Prazos SLA inalterados.` }]);
      }
      const forecastNote = transition.forecast ? (transition.forecast.status === "VALID" ? " · previsão de conclusão registrada" : " · previsão de conclusão pendente (complementação solicitada)") : "";
      await store.updateInboundMessage(message.id, { ...basePatch, expertId: expertRouting?.expertId ?? null, expertRouting: expertRouting ? { ...expertRouting } : null, status: "PROCESSED", statusReason: `Ação ${formal} aplicada por e-mail${forecastNote}` });
      result.applied += 1;
    } catch (error) {
      await store.updateInboundMessage(message.id, { ...basePatch, status: "REVIEW_REQUIRED", statusReason: error instanceof Error ? error.message.slice(0, 200) : "Falha ao aplicar", requiresHumanReview: true });
      result.reviewRequired += 1;
    }
  }
  return result;
}
