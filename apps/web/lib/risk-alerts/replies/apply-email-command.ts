// Aplicação AUTORIZADA de comandos operacionais por e-mail (RESOLVIDO e ENVIAR PARA).
// Reaproveita a máquina de estados única (applyAlertAction) — a mesma da tela — com origem EMAIL: nenhuma regra nova de negócio.
// O remetente já passou por authorizeReply (perfil, vínculo ACTIVE, destinatário lógico/allowlist, DMARC/DKIM alinhado) antes de
// chegar aqui. Resultado SEMPRE confirmado por e-mail ao autor: sucesso (confirmação da transição, na MESMA transação da gravação)
// ou rejeição/complementação (sem falso sucesso, sem gravar nada no alerta).
// ENVIAR PARA: destino por e-mail exato ou NOME completo único entre os membros elegíveis (ACTIVE, não LEITURA, corporativo,
// diferente do remetente). RESOLVIDO: anexos guardados (sha256) entram como evidência "anexo:<sha256>:<nome>" + texto.
// Token por item (email_reply_tokens): consumido ANTES da gravação e liberado se a gravação falhar (uso único das ações terminais).
// O corpo nunca vai para logs/auditoria; só ids, ação e código.
import { buildEvidenceText, type StoredEvidenceAttachment } from "@/lib/email-replies/inbound-attachments";
import { forwardTargetMessage, isEligibleTarget, resolveForwardTarget, type TargetCandidate } from "@/lib/email-replies/member-target";
import type { EmailReplyTokenStore } from "@/lib/email-replies/reply-tokens";
import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaRiskLevel } from "@/lib/sla/types";

import { applyAlertAction, buildEmailRejectionConfirmation, type AlertCaseSnapshot } from "../alert-state-machine";
import { applyPilotLevelOverride } from "../pilot-level-overrides";
import type { RiskAlertStore, InboundMessageRow } from "../store";
import type { EmailCommand } from "./operational-email-command";

type InboundPatch = Parameters<RiskAlertStore["updateInboundMessage"]>[1];

export type EmailCommandOutcome = "APPLIED" | "REJECTED" | "REVIEW" | "RECORDED";

type LoadedCase = NonNullable<Awaited<ReturnType<RiskAlertStore["loadCaseSnapshotForAction"]>>>;
type ProjectSnapshot = Awaited<ReturnType<RiskAlertStore["loadProjectSnapshot"]>>;

export interface ApplyEmailCommandContext {
  store: RiskAlertStore;
  projectId: string;
  nowIso: string;
  message: InboundMessageRow;
  caseId: string;
  loaded: LoadedCase;
  senderUserId: string;
  command: Exclude<EmailCommand, { kind: "IN_PROGRESS" }>;
  snapshot: ProjectSnapshot;
  profileByEmail: Map<string, { userId: string; email: string; membershipStatus: string | null }>;
  corporateDomain: string;
  basePatch: Omit<InboundPatch, "status">;
  /** Candidatos ao ENVIAR PARA (membros com o perfil de acesso). Sem eles, usa os perfis do snapshot (perfil desconhecido). */
  targetCandidates?: readonly TargetCandidate[];
  /** Anexos já guardados (sha256) desta mensagem — evidência do RESOLVIDO. */
  evidenceAttachments?: readonly StoredEvidenceAttachment[];
  /** Token por item que correlacionou a mensagem (consumido nas ações terminais). */
  itemToken?: { tokenHash: string; store: EmailReplyTokenStore } | null;
}

export interface RejectEmailReplyInput {
  store: RiskAlertStore;
  projectId: string;
  message: InboundMessageRow;
  caseId: string;
  loaded: LoadedCase;
  snapshot: ProjectSnapshot;
  senderUserId: string;
  /** Ação pedida (RESOLVED, FORWARD, TAKING_ACTION, AUTHENTICATION…) — vai no payload da confirmação. */
  action: string;
  code: string;
  text: string;
  basePatch: Omit<InboundPatch, "status">;
}

function policyOf(snapshot: ProjectSnapshot, loaded: LoadedCase) {
  const config = snapshot.config!;
  const riskLevel = loaded.snapshot.riskLevel as SlaRiskLevel;
  return applyPilotLevelOverride(
    resolveMatrixPolicy({ rules: snapshot.matrixRules, responsibles: snapshot.areaResponsibles, settings: snapshot.settings, area: loaded.record.area, riskLevel }),
    snapshot.pilotLevelOverrides,
    config.pilotRecipientAllowlistUserIds ?? null
  );
}

/**
 * Rejeição EXPLICADA ao autor (nada é gravado no alerta): confirmação "NÃO aplicado" com o motivo/o que falta, auditoria
 * RISK_ALERT_EMAIL_COMMAND_REJECTED e a mensagem fechada (PROCESSED) — não reentra na fila automática.
 */
export async function rejectEmailReply(input: RejectEmailReplyInput): Promise<"REJECTED" | "REVIEW"> {
  const { store, projectId, message, caseId, loaded, snapshot } = input;
  const config = snapshot.config;
  if (!config) {
    await store.updateInboundMessage(message.id, { ...input.basePatch, status: "REVIEW_REQUIRED", statusReason: "Projeto sem configuração", requiresHumanReview: true });
    return "REVIEW";
  }
  const entry = buildEmailRejectionConfirmation({
    snapshot: loaded.snapshot as AlertCaseSnapshot,
    policy: policyOf(snapshot, loaded),
    config,
    recipients: snapshot.recipients,
    actorUserId: input.senderUserId,
    messageId: message.id,
    action: input.action,
    code: input.code,
    message: input.text,
  });
  if (store.enqueueReplyConfirmation) await store.enqueueReplyConfirmation(projectId, caseId, entry);
  await store.audit(projectId, [
    { action: "RISK_ALERT_EMAIL_COMMAND_REJECTED", entityType: "RISK_ALERT_CASE", entityId: caseId, detail: `Comando ${input.action} por e-mail (mensagem ${message.id}) não aplicado: ${input.code}.` },
  ]);
  await store.updateInboundMessage(message.id, { ...input.basePatch, status: "PROCESSED", statusReason: `Comando ${input.action} rejeitado (${input.code}); confirmação de rejeição enviada ao autor` });
  return "REJECTED";
}

export async function applyEmailCommand(ctx: ApplyEmailCommandContext): Promise<EmailCommandOutcome> {
  const { store, projectId, nowIso, message, caseId, loaded, senderUserId, command, snapshot, basePatch } = ctx;
  const config = snapshot.config;
  if (!config) {
    await store.updateInboundMessage(message.id, { ...basePatch, status: "REVIEW_REQUIRED", statusReason: "Projeto sem configuração", requiresHumanReview: true });
    return "REVIEW";
  }
  if ((snapshot.informativeAreas ?? []).includes(loaded.record.area)) {
    // Área informativa (ex.: FINANCEIRO no piloto): registrada, sem ação nem confirmação automática.
    await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: "Área informativa: comando registrado sem ação automática" });
    return "RECORDED";
  }
  const policy = policyOf(snapshot, loaded);
  const actionName = command.kind === "RESOLVE" ? "RESOLVED" : "FORWARD";

  // Candidatos ao ENVIAR PARA: membros com perfil (quando o worker informa) ou os perfis do snapshot.
  const candidates: TargetCandidate[] =
    ctx.targetCandidates && ctx.targetCandidates.length > 0
      ? [...ctx.targetCandidates]
      : [...snapshot.recipients.values()].map((p) => ({ userId: p.userId, name: p.name, email: p.email, membershipStatus: p.membershipStatus, permission: null }));
  const eligibleForwardUserIds = candidates.filter((c) => isEligibleTarget(c, { senderUserId, corporateDomain: ctx.corporateDomain })).map((c) => c.userId);

  const reject = (code: string, text: string): Promise<EmailCommandOutcome> =>
    rejectEmailReply({ store, projectId, message, caseId, loaded, snapshot, senderUserId, action: actionName, code, text, basePatch });

  let action: "RESOLVED" | "FORWARD";
  let payload: Parameters<typeof applyAlertAction>[0]["payload"];
  if (command.kind === "RESOLVE") {
    action = "RESOLVED";
    // O comando explícito de um remetente autorizado e autenticado é a confirmação exigida. Evidência = anexos guardados
    // (referência "anexo:<sha256>:<nome>") + texto do próprio e-mail. ALTO/CRÍTICO sem nenhum dos dois => rejeição pedindo a evidência.
    const evidence = buildEvidenceText(ctx.evidenceAttachments ?? [], command.note || null);
    payload = { text: command.note || "Resolvido por e-mail.", justification: command.note || null, evidence, confirmed: true, messageId: message.id };
  } else {
    action = "FORWARD";
    const resolution = resolveForwardTarget({ targetEmail: command.targetEmail, targetName: command.targetName, candidates, senderUserId, corporateDomain: ctx.corporateDomain });
    if (!resolution.ok) {
      const code = resolution.reason === "TARGET_AMBIGUOUS" || resolution.reason === "TARGET_MISSING" ? resolution.reason : "FORWARD_TARGET_INVALID";
      return reject(code, forwardTargetMessage(resolution.reason));
    }
    payload = { targetUserId: resolution.userId, text: command.instruction || null, messageId: message.id };
  }

  const transition = applyAlertAction({
    now: nowIso,
    snapshot: loaded.snapshot as AlertCaseSnapshot,
    action,
    actorUserId: senderUserId,
    origin: "EMAIL",
    payload,
    policy,
    config,
    recipients: snapshot.recipients,
    eligibleForwardUserIds,
  });
  if (!transition.ok) return reject(transition.code, transition.message);

  // Token por item: uso único das ações terminais (RESOLVIDO / ENVIAR PARA). Já usado por OUTRA mensagem => rejeição.
  let consumedToken: { tokenHash: string; store: EmailReplyTokenStore } | null = null;
  if (ctx.itemToken) {
    const owned = await ctx.itemToken.store.consume(ctx.itemToken.tokenHash, message.providerMessageId, nowIso);
    if (!owned) return reject("TOKEN_ALREADY_USED", "Este atalho de resposta já foi usado para concluir ou encaminhar este alerta. Use o ACC ou o e-mail mais recente do alerta.");
    consumedToken = ctx.itemToken;
  }
  try {
    // Confirmação na MESMA transação da ação (outbox da transição): só sai depois de persistida.
    await store.applyTransition(caseId, transition, senderUserId);
    await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: `Comando ${command.kind} aplicado por e-mail: ${transition.summary}` });
    return "APPLIED";
  } catch (error) {
    if (consumedToken) await consumedToken.store.release(consumedToken.tokenHash, message.providerMessageId).catch(() => undefined);
    await store.updateInboundMessage(message.id, { ...basePatch, status: "REVIEW_REQUIRED", statusReason: error instanceof Error ? error.message.slice(0, 200) : "Falha ao aplicar", requiresHumanReview: true });
    return "REVIEW";
  }
}
