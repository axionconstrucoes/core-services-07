// Processamento das respostas recebidas (alert_email_messages INBOUND,
// status RECEIVED) — orquestração sobre o pipeline puro + store. Usado
// pela fase `replies` do worker GitHub (service role); sem "server-only".
//   filtro -> correlação -> autorização -> limpeza -> classificação ->
//   ação formal (só quando inequívoca) via máquina de estados/RPC,
//   senão registro (REPLY_RECEIVED) ou revisão humana.
// O corpo nunca vai para logs/auditoria; só ids e classificação.

import type { StoredEvidenceAttachment } from "@/lib/email-replies/inbound-attachments";
import type { TargetCandidate } from "@/lib/email-replies/member-target";
import { tokenUsability, type EmailReplyTokenRow, type EmailReplyTokenStore } from "@/lib/email-replies/reply-tokens";
import { senderAuthenticationMessage } from "@/lib/email-replies/sender-authentication";
import type { SenderRateLimiter } from "@/lib/email-replies/sender-rate-limit";
import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaRiskLevel } from "@/lib/sla/types";

import { applyAlertAction } from "../alert-state-machine";
import { applyPilotLevelOverride } from "../pilot-level-overrides";
import { applyForecastPrecision, describeForecastProblem, extractForecastFromText, forecastTracking, isAfter } from "../forecast";
import { routeExpert } from "../experts/route-alert-expert";
import { DEFAULT_CORPORATE_EMAIL_DOMAIN } from "../plan-risk-alerts";
import type { InboundMessageRow, RiskAlertStore } from "../store";
import { applyMessageIdAliases } from "./build-correlation-index";
import { assessReplyTiming } from "./reply-timing";
import { applyEmailCommand, rejectEmailReply } from "./apply-email-command";
import { parseOperationalEmailCommand } from "./operational-email-command";
import { assessOperationalEmailIntent } from "./operational-email-intent";
import { isSpecialistEmailEnabled } from "@/lib/email-replies/specialist-flag";
import { parseSpecialistCommand, routeSpecialistByEmail, specialistRequiresHumanReview, SPECIALIST_TEXT, type SpecialistRecord } from "@/lib/email-replies/specialist-email";
import type { RecordSpecialistResult } from "@/lib/email-replies/specialist-consultations";
import { authorizeReply, classifyReply, correlateReply, extractReplyTokens, filterInboundMessage, hashReplyToken, isReplyAuthFailure, parseReplyBody, replyToFormalAction, senderAuthFailureOf, type CorrelationResult } from "./reply-pipeline";

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
  /** Excedentes do limite de taxa por remetente (enviados à revisão humana, sem execução). */
  rateLimited?: number;
  /** Consultas "ESPECIALISTA: ..." registradas (o alerta NÃO é alterado). */
  specialist?: number;
}

// Modelo de entrega direta do piloto: cada colaborador responde com a PRÓPRIA identidade (From real) — a autorização é sempre por
// remetente (authorizeReply: perfil, vínculo ativo, destinatário lógico do alerta e allowlist). Não existe mais atribuição de resposta
// por "caixa do piloto": uma resposta vinda do ACC (crm@) ou de endereço desconhecido NUNCA é atribuída a participante algum.
export interface ProcessRepliesOptions {
  /** Message-ID REAL (lido na caixa) -> Message-ID gravado pelo ACC. Só em memória; ver applyMessageIdAliases. */
  messageIdAliases?: ReadonlyMap<string, string>;
  /**
   * Tokens POR ITEM (email_reply_tokens, tipo RISK_CASE) já resolvidos pelo despachante: hash -> linha. Resolvidos ANTES dos
   * mecanismos legados (In-Reply-To / References / Reply-To da conversa / código visível).
   */
  itemReplyTokens?: ReadonlyMap<string, EmailReplyTokenRow>;
  /** Consumo dos tokens por item (ações terminais). */
  tokenStore?: EmailReplyTokenStore;
  /** Membros do projeto com o perfil de acesso (ENVIAR PARA por nome; perfil LEITURA não recebe). */
  targetCandidates?: readonly TargetCandidate[];
  /** Anexos já guardados da mensagem (evidência do RESOLVIDO). */
  attachmentsFor?: (message: InboundMessageRow, caseId: string) => Promise<StoredEvidenceAttachment[]>;
  /** Limite de mensagens por remetente/hora (excedente => revisão humana). */
  senderRateLimiter?: SenderRateLimiter;
  /** authserv-id confiáveis para a autenticação do remetente (padrão mx.google.com). */
  trustedAuthservIds?: readonly string[];
  /** Domínios com o fallback do locatário Workspace (mesma regra do caminho de token por item). Ausente => fail-closed. */
  workspaceTenantDomains?: readonly string[];
  /** ACC_EMAIL_SPECIALIST_ENABLED (ausente => lê o ambiente; false => "ESPECIALISTA:" é recusado com explicação). */
  specialistEnabled?: boolean;
  /** Grava a consulta ESPECIALISTA (email_specialist_consultations). Ausente => revisão humana (nada é perdido nem executado). */
  specialistRecorder?: (input: { actorUserId: string; caseId: string; providerMessageId: string; record: SpecialistRecord; recipientEmail: string; inReplyTo: string | null; references: string[]; originalSubject: string | null }) => Promise<RecordSpecialistResult>;
  /** ACC_EMAIL_TOKEN_OWNER_STRICT: o token por item só vale para o dono, o encaminhado ativo ou um Administrador. Padrão desligado. */
  ownerStrict?: boolean;
  /** Registro (log/auditoria) do resultado de CADA mensagem; falha aqui nunca bloqueia o processamento. */
  onMessageProcessed?: (entry: { message: InboundMessageRow; caseId: string | null; status: string; statusReason: string | null }) => Promise<void>;
}

/** Correlação pelos tokens por item: exatamente um caso => correlacionado; mais de um => ambíguo; nenhum => legado. */
function correlateByItemToken(message: InboundMessageRow, tokens: ReadonlyMap<string, EmailReplyTokenRow> | undefined): { row: EmailReplyTokenRow | null; ambiguous: boolean } {
  if (!tokens || tokens.size === 0) return { row: null, ambiguous: false };
  const rows: EmailReplyTokenRow[] = [];
  for (const token of extractReplyTokens([...message.headers.to, ...(message.headers.cc ?? [])])) {
    const row = tokens.get(hashReplyToken(token));
    if (row && row.subjectKind === "RISK_CASE") rows.push(row);
  }
  const cases = new Set(rows.map((row) => row.subjectId));
  if (cases.size === 1) return { row: rows[0], ambiguous: false };
  return { row: null, ambiguous: cases.size > 1 };
}

export async function processAlertReplies(baseStore: RiskAlertStore, projectId: string, nowIso: string, accMailboxes: string[], options: ProcessRepliesOptions = {}): Promise<ProcessRepliesResult> {
  const selfMailboxes = accMailboxes;
  // Último status gravado de cada mensagem (registro de resultado por mensagem); o store real é usado por herança.
  const lastStatus = new Map<string, { status: string; statusReason: string | null; caseId: string | null }>();
  const store: RiskAlertStore = Object.assign(Object.create(baseStore) as RiskAlertStore, {
    updateInboundMessage: async (id: string, patch: Parameters<RiskAlertStore["updateInboundMessage"]>[1]) => {
      lastStatus.set(id, { status: patch.status, statusReason: patch.statusReason ?? null, caseId: patch.caseId ?? lastStatus.get(id)?.caseId ?? null });
      return baseStore.updateInboundMessage(id, patch);
    },
  });
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
    await processOne(message);
    const final = lastStatus.get(message.id);
    if (final && options.onMessageProcessed) {
      try {
        await options.onMessageProcessed({ message, caseId: final.caseId, status: final.status, statusReason: final.statusReason });
      } catch {
        // registro indisponível nesta rodada — o resultado já está na própria mensagem
      }
    }
  }
  return result;

  async function processOne(message: InboundMessageRow): Promise<void> {
    const verdict = filterInboundMessage(message.headers, { accMailboxes: selfMailboxes, seenMessageIds: index.seenMessageIds });
    if (verdict !== "OK") {
      await store.updateInboundMessage(message.id, { status: verdict, statusReason: verdict });
      result.ignored += 1;
      return;
    }
    // Aceita UMA vez: a duplicata (mesmo Message-ID) pendente neste lote vira IGNORED_LOOP.
    if (message.headers.messageId) index.seenMessageIds.add(message.headers.messageId);
    // Limite de taxa por remetente: o excedente não é executado nem respondido — revisão humana.
    if (options.senderRateLimiter && !options.senderRateLimiter.allow(message.headers.from, message.receivedAt)) {
      await store.updateInboundMessage(message.id, { status: "REVIEW_REQUIRED", statusReason: "Limite de mensagens por remetente/hora excedido — revisão humana (nada executado)", requiresHumanReview: true });
      await store.audit(projectId, [{ action: "RISK_ALERT_EMAIL_RATE_LIMITED", entityType: "RISK_ALERT_INBOUND", entityId: message.id, detail: `Mensagem ${message.id} acima do limite por remetente/hora: enviada à revisão humana sem execução.` }]);
      result.reviewRequired += 1;
      result.rateLimited = (result.rateLimited ?? 0) + 1;
      return;
    }
    const parsed = parseReplyBody(message.bodyOriginal);
    // 1º token POR ITEM (email_reply_tokens); depois os mecanismos legados.
    const byItem = correlateByItemToken(message, options.itemReplyTokens);
    const itemToken = byItem.row;
    const correlation: CorrelationResult = itemToken
      ? { caseId: itemToken.subjectId, method: "REPLY_TO_TOKEN", ambiguous: false, participantUserId: itemToken.recipientUserId }
      : byItem.ambiguous
        ? { caseId: null, method: "REPLY_TO_TOKEN", ambiguous: true, participantUserId: null }
        : correlateReply(message.headers, `${message.headers.subject ?? ""}\n${parsed.clean}`, index);
    if (!correlation.caseId) {
      await store.updateInboundMessage(message.id, { bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature, correlationMethod: correlation.method, status: "PENDING_HUMAN_REVIEW", statusReason: correlation.ambiguous ? "Correlação ambígua (mais de um alerta)" : "Sem identificação inequívoca do alerta", requiresHumanReview: true });
      result.pendingHumanReview += 1;
      return;
    }
    const loaded = await store.loadCaseSnapshotForAction(correlation.caseId);
    if (!loaded) {
      await store.updateInboundMessage(message.id, { correlationMethod: correlation.method, status: "PENDING_HUMAN_REVIEW", statusReason: "Alerta não encontrado", requiresHumanReview: true });
      result.pendingHumanReview += 1;
      return;
    }
    const senderProfile = profileByEmail.get(message.headers.from.trim().toLowerCase()) ?? null;
    // Token por item: válido (não expirado, não usado por outra mensagem) e o destinatário dele conta como destinatário do alerta
    // (ex.: item do consolidado) — o remetente continua precisando ser ESSA pessoa, um destinatário do caso ou o encaminhado ativo.
    const tokenRecipient = itemToken?.recipientUserId ?? null;
    const baseAuthorization = authorizeReply({
      senderEmail: message.headers.from,
      profile: senderProfile ? { userId: senderProfile.userId, email: senderProfile.email, active: true } : null,
      membershipStatus: senderProfile?.membershipStatus ?? null,
      alertRecipientUserIds: tokenRecipient ? [...loaded.alertRecipientUserIds, tokenRecipient] : loaded.alertRecipientUserIds,
      allowlistUserIds: config?.pilotRecipientAllowlistUserIds ?? [],
      activeForwardToUserId: loaded.snapshot.activeForward?.state === "ACTIVE" ? loaded.snapshot.activeForward.toUserId : null,
      corporateDomain,
      authenticationResults: message.headers.authenticationResults ?? null,
      trustedAuthservIds: options.trustedAuthservIds,
      workspaceTenantDomains: options.workspaceTenantDomains,
    });
    const authorization: { authorized: true; userId: string; note: string | null } | { authorized: false; reason: string } = baseAuthorization;
    const unauthorizedPatch = { caseId: correlation.caseId, correlationMethod: correlation.method, bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature };
    if (!authorization.authorized) {
      // Não altera o alerta; não devolve dados do projeto; registra o motivo.
      await store.updateInboundMessage(message.id, { ...unauthorizedPatch, status: "UNAUTHORIZED_REPLY", statusReason: authorization.reason });
      await store.audit(projectId, [{ action: "RISK_ALERT_UNAUTHORIZED_REPLY", entityType: "RISK_ALERT_CASE", entityId: correlation.caseId, detail: `Resposta não autorizada (${authorization.reason}); mensagem ${message.id}.` }]);
      // Falha de AUTENTICAÇÃO (DMARC/DKIM ausente, não confiável, falho ou desalinhado) de um membro ATIVO conhecido: resposta
      // explicativa à caixa corporativa REAL dele (nunca a um endereço desconhecido; nada é alterado no alerta).
      if (isReplyAuthFailure(authorization.reason) && senderProfile && senderProfile.membershipStatus === "ACTIVE" && snapshot.config && store.enqueueReplyConfirmation) {
        try {
          await rejectEmailReply({
            store, projectId, message, caseId: correlation.caseId, loaded, snapshot, senderUserId: senderProfile.userId, action: "AUTHENTICATION",
            code: authorization.reason, text: senderAuthenticationMessage(senderAuthFailureOf(authorization.reason)),
            basePatch: { ...unauthorizedPatch },
          });
          // A mensagem continua registrada como NÃO AUTORIZADA (o rejectEmailReply a fecha; o status final é este).
          await store.updateInboundMessage(message.id, { ...unauthorizedPatch, status: "UNAUTHORIZED_REPLY", statusReason: `${authorization.reason} — resposta explicativa enviada ao remetente` });
        } catch {
          // sem resposta nesta rodada; a recusa já está registrada
        }
      }
      result.unauthorized += 1;
      return;
    }
    // Token por item vinculado ao destinatário original (opcional; padrão desligado): dono, encaminhado ativo ou Administrador.
    if (itemToken && options.ownerStrict && itemToken.recipientUserId && itemToken.recipientUserId !== authorization.userId) {
      const activeForwardTo = loaded.snapshot.activeForward?.state === "ACTIVE" ? loaded.snapshot.activeForward.toUserId : null;
      const senderIsAdmin = (options.targetCandidates ?? []).some((c) => c.userId === authorization.userId && /^(ADMINISTRADOR|ADMIN)$/i.test(c.permission ?? ""));
      if (activeForwardTo !== authorization.userId && !senderIsAdmin) {
        const outcome = await rejectEmailReply({
          store, projectId, message, caseId: correlation.caseId, loaded, snapshot, senderUserId: authorization.userId, action: "TOKEN", code: "TOKEN_NOT_OWNER",
          text: "Este atalho foi emitido para outra pessoa. Use o e-mail que você recebeu do ACC (ou peça ao Administrador da obra). Nada foi alterado.",
          basePatch: { ...unauthorizedPatch, senderUserId: authorization.userId },
        });
        if (outcome === "REJECTED") result.recorded += 1;
        else result.reviewRequired += 1;
        return;
      }
    }
    if (itemToken) {
      const usable = tokenUsability(itemToken, message.providerMessageId, nowIso);
      if (!usable.ok) {
        const outcome = await rejectEmailReply({
          store, projectId, message, caseId: correlation.caseId, loaded, snapshot, senderUserId: authorization.userId, action: "TOKEN", code: usable.reason,
          text: usable.reason === "TOKEN_EXPIRED" ? "Este atalho de resposta expirou (validade de 30 dias). Use o e-mail mais recente do alerta ou o ACC." : "Este atalho de resposta já foi usado para concluir ou encaminhar este alerta. Use o e-mail mais recente do alerta ou o ACC.",
          basePatch: { ...unauthorizedPatch, senderUserId: authorization.userId },
        });
        if (outcome === "REJECTED") result.recorded += 1;
        else result.reviewRequired += 1;
        return;
      }
    }
    // Comandos EXPLÍCITOS e inequívocos de remetente já autorizado e autenticado:
    //  - RESOLVIDO / ENVIAR PARA: máquina de estados única, confirmação (sucesso ou rejeição explicada) ao autor;
    //  - EM ANDAMENTO + "Previsão: dd/mm/aaaa [hh:mm]": previsão validada ANTES (faltando/ inválida => resposta pedindo, nada gravado);
    //    válida => mesmo fluxo de TOMANDO PROVIDÊNCIAS da resposta livre.
    // Qualquer outra intenção sensível continua indo para revisão humana.
    // ESPECIALISTA: consulta ESCRITA ao Expert da área. NÃO passa pela máquina de estados (não escala, não muda estado/responsável/
    // previsão/prazo) e NÃO consome o token. Só recomendação com revisão humana; a AXIA nunca é destino.
    const specialist = parseSpecialistCommand(parsed.clean);
    if (specialist.reason !== "NO_COMMAND") {
      const specialistPatch = { caseId: correlation.caseId, senderUserId: authorization.userId, bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature, correlationMethod: correlation.method };
      const rejectSpecialist = async (code: string, text: string) => {
        const outcome = await rejectEmailReply({ store, projectId, message, caseId: correlation.caseId!, loaded, snapshot, senderUserId: authorization.userId, action: "SPECIALIST", code, text, basePatch: specialistPatch });
        if (outcome === "REJECTED") result.recorded += 1;
        else result.reviewRequired += 1;
      };
      if ((snapshot.informativeAreas ?? []).includes(loaded.record.area)) {
        await store.updateInboundMessage(message.id, { ...specialistPatch, status: "PROCESSED", statusReason: "Área informativa: consulta ao especialista registrada sem ação automática" });
        result.recorded += 1;
        return;
      }
      if (specialist.reason === "MIXED") return rejectSpecialist("COMMAND_AMBIGUOUS", SPECIALIST_TEXT.MIXED);
      if (specialist.reason === "QUESTION_TOO_SHORT") return rejectSpecialist("SPECIALIST_QUESTION_REQUIRED", SPECIALIST_TEXT.QUESTION_TOO_SHORT);
      if (!(options.specialistEnabled ?? isSpecialistEmailEnabled())) return rejectSpecialist("SPECIALIST_DISABLED", SPECIALIST_TEXT.DISABLED);
      if (loaded.snapshot.state === "RESOLVED") return rejectSpecialist("ALREADY_RESOLVED", "O alerta já está resolvido: nada foi alterado.");
      const routing = routeSpecialistByEmail({ area: loaded.record.area, question: specialist.question! });
      if (!routing.ok) return rejectSpecialist(routing.code, SPECIALIST_TEXT.SPECIALIST_AREA_UNKNOWN);
      if (!options.specialistRecorder) {
        await store.updateInboundMessage(message.id, { ...specialistPatch, status: "REVIEW_REQUIRED", statusReason: "ESPECIALISTA por e-mail: gravação indisponível — revisão humana (nada executado)", requiresHumanReview: true });
        result.reviewRequired += 1;
        return;
      }
      const severity = loaded.snapshot.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      const record: SpecialistRecord = { expertId: routing.expertId, routingSource: routing.source, question: specialist.question!, area: loaded.record.area, severity, requiresHumanReview: specialistRequiresHumanReview(severity) };
      const sender = profileByEmail.get(message.headers.from.trim().toLowerCase());
      const recorded = await options.specialistRecorder({ actorUserId: authorization.userId, caseId: correlation.caseId, providerMessageId: message.providerMessageId, record, recipientEmail: sender?.email ?? message.headers.from, inReplyTo: message.headers.messageId ?? null, references: [...(message.headers.references ?? []), ...(message.headers.messageId ? [message.headers.messageId] : [])], originalSubject: message.headers.subject ?? null });
      if (recorded.ok || recorded.code === "MESSAGE_ALREADY_APPLIED") {
        await store.audit(projectId, [{ action: "RISK_ALERT_EXPERT_EMAIL_CONSULT", entityType: "RISK_ALERT_CASE", entityId: correlation.caseId, detail: `Consulta ao especialista ${routing.expertId} por e-mail (mensagem ${message.id}). O alerta não foi alterado; resposta é só recomendação com revisão humana.` }]);
        await store.updateInboundMessage(message.id, { ...specialistPatch, expertId: routing.expertId, status: "PROCESSED", statusReason: "ESPECIALISTA registrado por e-mail (o alerta não foi alterado)" });
        result.recorded += 1;
        result.specialist = (result.specialist ?? 0) + (recorded.ok ? 1 : 0);
        return;
      }
      return rejectSpecialist(recorded.code, recorded.text);
    }
    const emailCommand = parseOperationalEmailCommand(parsed.clean);
    const commandPatch = { caseId: correlation.caseId, senderUserId: authorization.userId, bodyClean: parsed.clean, quotedText: parsed.quoted, signatureText: parsed.signature, correlationMethod: correlation.method };
    let explicitInProgress: { forecast: ReturnType<typeof extractForecastFromText> } | null = null;
    if (emailCommand.command && emailCommand.command.kind !== "IN_PROGRESS") {
      let evidenceAttachments: Awaited<ReturnType<NonNullable<ProcessRepliesOptions["attachmentsFor"]>>> = [];
      if (emailCommand.command.kind === "RESOLVE" && options.attachmentsFor) {
        try {
          evidenceAttachments = await options.attachmentsFor(message, correlation.caseId);
        } catch {
          evidenceAttachments = []; // anexos indisponíveis: a evidência fica só no texto (ALTO/CRÍTICO sem texto => rejeição pedindo)
        }
      }
      const outcome = await applyEmailCommand({
        store,
        projectId,
        nowIso,
        message,
        caseId: correlation.caseId,
        loaded,
        senderUserId: authorization.userId,
        command: emailCommand.command,
        snapshot,
        profileByEmail,
        corporateDomain,
        basePatch: commandPatch,
        targetCandidates: options.targetCandidates,
        evidenceAttachments,
        itemToken: itemToken && options.tokenStore ? { tokenHash: itemToken.tokenHash, store: options.tokenStore } : null,
      });
      if (outcome === "APPLIED") result.applied += 1;
      else if (outcome === "REJECTED" || outcome === "RECORDED") result.recorded += 1;
      else result.reviewRequired += 1;
      return;
    }
    if (emailCommand.command?.kind === "IN_PROGRESS") {
      const tracking = forecastTracking(loaded.snapshot.riskLevel);
      const parsedForecast = applyForecastPrecision(extractForecastFromText(`Previsão: ${emailCommand.command.forecastText}`, message.receivedAt), tracking);
      const missing: string[] = [];
      if (parsedForecast.status !== "VALID") missing.push(describeForecastProblem(parsedForecast) ?? "Previsão de conclusão não informada.");
      if (!emailCommand.command.note) missing.push("Descreva a providência em curso na linha do EM ANDAMENTO.");
      if (missing.length > 0 || loaded.snapshot.state === "RESOLVED") {
        const outcome = await rejectEmailReply({
          store, projectId, message, caseId: correlation.caseId, loaded, snapshot, senderUserId: authorization.userId, action: "TAKING_ACTION",
          code: loaded.snapshot.state === "RESOLVED" ? "ALREADY_RESOLVED" : "IN_PROGRESS_INCOMPLETE",
          text: loaded.snapshot.state === "RESOLVED"
            ? "O alerta já está resolvido: nada foi alterado."
            : `${missing.join(" ")} Formato: "EM ANDAMENTO: providência" e, na linha seguinte, "Previsão: dd/mm/aaaa${tracking === "TRACKED" ? " hh:mm" : ""}".`,
          basePatch: commandPatch,
        });
        if (outcome === "REJECTED") result.recorded += 1;
        else result.reviewRequired += 1;
        return;
      }
      explicitInProgress = { forecast: parsedForecast };
    }
    if (!explicitInProgress) {
      const operational = assessOperationalEmailIntent(parsed.clean);
      if (operational.requiresReview) {
        await store.updateInboundMessage(message.id, {
          ...commandPatch,
          status: "REVIEW_REQUIRED",
          statusReason: `Operação por e-mail: ${operational.intent} — ${operational.reason}`,
          requiresHumanReview: true,
        });
        result.reviewRequired += 1;
        return;
      }
    }
    // EM ANDAMENTO explícito e válido: classificação determinística equivalente a STATUS_UPDATE inequívoco.
    const classification = explicitInProgress
      ? { classification: "STATUS_UPDATE" as const, confidence: 0.95, ambiguous: false, matched: ["STATUS_UPDATE"] }
      : classifyReply(parsed.clean);
    // Previsão de término: "em andamento" (STATUS_UPDATE => TOMANDO PROVIDÊNCIAS) pede a data de conclusão.
    // Referência = recebimento do e-mail (processamento atrasado não invalida a data). ALTO/CRÍTICO exigem horário.
    const formalEarly = explicitInProgress ? ("TAKING_ACTION" as const) : replyToFormalAction(classification);
    const forecast = explicitInProgress ? explicitInProgress.forecast : formalEarly === "TAKING_ACTION" ? extractForecastFromText(parsed.clean, message.receivedAt) : null;
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
      return;
    }
    if (!config) {
      await store.updateInboundMessage(message.id, { ...basePatch, status: "REVIEW_REQUIRED", statusReason: "Projeto sem configuração", requiresHumanReview: true });
      result.reviewRequired += 1;
      return;
    }
    if ((snapshot.informativeAreas ?? []).includes(loaded.record.area)) {
      // Área informativa no projeto (ex.: FINANCEIRO no piloto): a resposta fica registrada, sem ação,
      // escalonamento, cobrança ou confirmação automática.
      await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: "Área informativa: registrada sem ação automática" });
      result.recorded += 1;
      return;
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
      return;
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
        return;
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
      return;
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
}
