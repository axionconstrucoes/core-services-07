// Aplicação AUTORIZADA de comandos operacionais por e-mail (RESOLVIDO e ENVIAR PARA).
// Reaproveita a máquina de estados única (applyAlertAction) — a mesma da tela — com origem EMAIL: nenhuma regra nova de negócio.
// O remetente já passou por authorizeReply (perfil, vínculo ACTIVE, destinatário lógico/allowlist, autenticação) antes de chegar aqui.
// Resultado SEMPRE confirmado por e-mail ao autor: sucesso (confirmação da transição) ou rejeição/complementação (sem falso sucesso).
// O corpo nunca vai para logs/auditoria; só ids, ação e código.
import { resolveMatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaRiskLevel } from "@/lib/sla/types";

import { applyAlertAction, buildEmailRejectionConfirmation, type AlertCaseSnapshot } from "../alert-state-machine";
import { applyPilotLevelOverride } from "../pilot-level-overrides";
import type { RiskAlertStore, InboundMessageRow } from "../store";
import type { EmailCommand } from "./operational-email-command";

type InboundPatch = Parameters<RiskAlertStore["updateInboundMessage"]>[1];

export type EmailCommandOutcome = "APPLIED" | "REJECTED" | "REVIEW" | "RECORDED";

export interface ApplyEmailCommandContext {
  store: RiskAlertStore;
  projectId: string;
  nowIso: string;
  message: InboundMessageRow;
  caseId: string;
  loaded: NonNullable<Awaited<ReturnType<RiskAlertStore["loadCaseSnapshotForAction"]>>>;
  senderUserId: string;
  command: EmailCommand;
  snapshot: Awaited<ReturnType<RiskAlertStore["loadProjectSnapshot"]>>;
  profileByEmail: Map<string, { userId: string; email: string; membershipStatus: string | null }>;
  corporateDomain: string;
  basePatch: Omit<InboundPatch, "status">;
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
  const riskLevel = loaded.snapshot.riskLevel as SlaRiskLevel;
  const policy = applyPilotLevelOverride(
    resolveMatrixPolicy({ rules: snapshot.matrixRules, responsibles: snapshot.areaResponsibles, settings: snapshot.settings, area: loaded.record.area, riskLevel }),
    snapshot.pilotLevelOverrides,
    config.pilotRecipientAllowlistUserIds ?? null
  );

  // Membros ACTIVE do projeto, e-mail corporativo, exceto o próprio remetente (mesmo critério da tela).
  const eligibleForwardUserIds = [...snapshot.recipients.values()]
    .filter((p) => p.membershipStatus === "ACTIVE" && p.userId !== senderUserId && (p.email ?? "").toLowerCase().split("@")[1] === ctx.corporateDomain)
    .map((p) => p.userId);

  const reject = async (code: string, text: string): Promise<EmailCommandOutcome> => {
    const entry = buildEmailRejectionConfirmation({
      snapshot: loaded.snapshot as AlertCaseSnapshot,
      policy,
      config,
      recipients: snapshot.recipients,
      actorUserId: senderUserId,
      messageId: message.id,
      action: command.kind === "RESOLVE" ? "RESOLVED" : "FORWARD",
      code,
      message: text,
    });
    if (store.enqueueReplyConfirmation) await store.enqueueReplyConfirmation(projectId, caseId, entry);
    await store.audit(projectId, [
      { action: "RISK_ALERT_EMAIL_COMMAND_REJECTED", entityType: "RISK_ALERT_CASE", entityId: caseId, detail: `Comando ${command.kind} por e-mail (mensagem ${message.id}) não aplicado: ${code}.` },
    ]);
    // A rejeição é concluída (confirmada ao autor); a mensagem não reentra na fila automática.
    await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: `Comando ${command.kind} rejeitado (${code}); confirmação de rejeição enviada ao autor` });
    return "REJECTED";
  };

  let action: "RESOLVED" | "FORWARD";
  let payload: Parameters<typeof applyAlertAction>[0]["payload"];
  if (command.kind === "RESOLVE") {
    action = "RESOLVED";
    // O comando explícito de um remetente autorizado e autenticado é a confirmação exigida; a evidência vem do texto do próprio e-mail.
    // Anexos ainda NÃO são aceitos como evidência (pipeline de anexos pendente): ALTO/CRÍTICO sem texto de evidência é rejeitado.
    payload = { text: command.note || "Resolvido por e-mail.", justification: command.note || null, evidence: command.note || null, confirmed: true, messageId: message.id };
  } else {
    action = "FORWARD";
    const target = ctx.profileByEmail.get(command.targetEmail);
    if (!target) return reject("FORWARD_TARGET_INVALID", "O destinatário informado não é um membro ACTIVE do projeto com e-mail corporativo.");
    payload = { targetUserId: target.userId, text: command.instruction || null, messageId: message.id };
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

  try {
    // Confirmação na MESMA transação da ação (outbox da transição): só sai depois de persistida.
    await store.applyTransition(caseId, transition, senderUserId);
    await store.updateInboundMessage(message.id, { ...basePatch, status: "PROCESSED", statusReason: `Comando ${command.kind} aplicado por e-mail: ${transition.summary}` });
    return "APPLIED";
  } catch (error) {
    await store.updateInboundMessage(message.id, { ...basePatch, status: "REVIEW_REQUIRED", statusReason: error instanceof Error ? error.message.slice(0, 200) : "Falha ao aplicar", requiresHumanReview: true });
    return "REVIEW";
  }
}
