// Verificação de respostas ANTES de efetivar um escalonamento (puro).
// Para cada escalonamento planejado, o verificador consultou a caixa monitorada (somente leitura):
//   - REPLY_FOUND: há resposta do caso recebida até o prazo e ainda NÃO processada => o escalonamento é retido nesta rodada
//     (sem e-mail), com auditoria; o leitor processa a resposta e a próxima rodada reavalia. Retenção limitada (maxHoldMs após o
//     prazo): depois disso o escalonamento segue, com a pendência registrada.
//   - UNAVAILABLE: não foi possível verificar (sem credencial na rota, erro do Gmail) => o escalonamento segue e a limitação é
//     registrada SEM afirmar que o responsável não respondeu.
//   - NO_REPLY: segue normalmente.
import type { PlannedAuditEvent, PlannedEscalation, PlannedOutboxEntry } from "./types";

export type ReplyCheck =
  | { status: "NO_REPLY" }
  | { status: "REPLY_FOUND"; receivedAt: string }
  | { status: "UNAVAILABLE"; reason: string };

export interface GateablePlan {
  escalations: PlannedEscalation[];
  outbox: PlannedOutboxEntry[];
  audit: PlannedAuditEvent[];
}

export interface GateDecision {
  caseKey: string;
  outcome: "HELD_PENDING_REPLY" | "PROCEEDED_HOLD_EXPIRED" | "PROCEEDED_NOT_VERIFIED" | "PROCEEDED_NO_REPLY";
}

export const DEFAULT_MAX_HOLD_MS = 30 * 60 * 1000;

export function applyEscalationReplyGate<P extends GateablePlan>(
  plan: P,
  checks: ReadonlyMap<string, ReplyCheck>,
  nowIso: string,
  options: { maxHoldMs?: number } = {}
): { plan: P; decisions: GateDecision[] } {
  const maxHoldMs = options.maxHoldMs ?? DEFAULT_MAX_HOLD_MS;
  const decisions: GateDecision[] = [];
  const held = new Set<string>();
  const extraAudit: PlannedAuditEvent[] = [];
  for (const escalation of plan.escalations) {
    const check: ReplyCheck = checks.get(escalation.caseKey) ?? { status: "UNAVAILABLE", reason: "verificação não executada" };
    const step = `${escalation.expectedCurrentLevel} → ${escalation.newLevel}`;
    if (check.status === "REPLY_FOUND") {
      const deadlineMs = escalation.deadlineAt ? Date.parse(escalation.deadlineAt) : Number.NaN;
      const expired = Number.isFinite(deadlineMs) && Date.parse(nowIso) - deadlineMs > maxHoldMs;
      if (!expired) {
        held.add(escalation.caseKey);
        decisions.push({ caseKey: escalation.caseKey, outcome: "HELD_PENDING_REPLY" });
        extraAudit.push({
          action: "RISK_ALERT_ESCALATION_HELD_PENDING_REPLY",
          entityType: "SLA_ACTION",
          entityId: escalation.slaActionId,
          detail: `Escalonamento ${step} retido: resposta do caso recebida em ${check.receivedAt} (Gmail), até o prazo${escalation.deadlineAt ? ` ${escalation.deadlineAt}` : ""}, ainda não processada pelo leitor. Reavaliação na próxima rodada.`,
        });
        continue;
      }
      decisions.push({ caseKey: escalation.caseKey, outcome: "PROCEEDED_HOLD_EXPIRED" });
      extraAudit.push({
        action: "RISK_ALERT_ESCALATION_REPLY_PENDING_PROCESSING",
        entityType: "SLA_ACTION",
        entityId: escalation.slaActionId,
        detail: `Escalonamento ${step} efetivado após o limite de retenção: há resposta recebida em ${check.receivedAt} ainda não processada. Não indica ausência de resposta.`,
      });
      continue;
    }
    if (check.status === "UNAVAILABLE") {
      decisions.push({ caseKey: escalation.caseKey, outcome: "PROCEEDED_NOT_VERIFIED" });
      extraAudit.push({
        action: "RISK_ALERT_REPLIES_NOT_VERIFIED",
        entityType: "SLA_ACTION",
        entityId: escalation.slaActionId,
        detail: `Não foi possível verificar respostas na caixa monitorada antes do escalonamento ${step} (${check.reason}). Isso NÃO significa que o responsável não respondeu.`,
      });
      continue;
    }
    decisions.push({ caseKey: escalation.caseKey, outcome: "PROCEEDED_NO_REPLY" });
  }
  if (held.size === 0) return { plan: { ...plan, audit: [...plan.audit, ...extraAudit] }, decisions };
  const heldSlaActions = new Set(plan.escalations.filter((e) => held.has(e.caseKey)).map((e) => e.slaActionId));
  return {
    plan: {
      ...plan,
      escalations: plan.escalations.filter((e) => !held.has(e.caseKey)),
      outbox: plan.outbox.filter((entry) => !(entry.notificationType === "ESCALATION" && entry.caseKey !== null && held.has(entry.caseKey))),
      audit: [...plan.audit.filter((event) => !(event.action === "RISK_ALERT_DEADLINE_EXPIRED" && heldSlaActions.has(event.entityId))), ...extraAudit],
    },
    decisions,
  };
}
