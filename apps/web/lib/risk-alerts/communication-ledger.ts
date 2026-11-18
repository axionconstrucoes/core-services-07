// Livro-razão de comunicação dos casos de risco — puro, sem I/O.
//
// Separa explicitamente quatro fatos que NÃO são equivalentes:
//   1. ETAPA ALCANÇADA: nível da ação SLA (RESPONSAVEL → ESCALAO_1 → DIRETORIA). Avança pelo
//      tempo (prazos da Matriz) mesmo quando nenhum e-mail sai — o SLA não depende do envio.
//   2. TENTATIVA DE COMUNICAÇÃO: linha da outbox com envio tentado (attempt_count > 0 ou FAILED).
//   3. ENVIO SUPRIMIDO: linha SUPPRESSED (bloqueio de prontidão, allowlist, etc.). Nunca é entrega.
//   4. ACEITO PELO GMAIL: linha SENT com id do provedor. Só conta como "entregue ao destinatário"
//      quando o endereço efetivo é o e-mail do próprio usuário (override do piloto = aceito, mas
//      entregue em outra caixa → o destinatário NÃO foi informado).
//
// Por que existia o problema: a chave de idempotência de uma entrada SUPPRESSED fica gravada e o
// planejador nunca recria a mesma chave; além disso o alerta imediato só nasce em NEW/RAISED/CHANGED
// e o escalonamento só quando o nível sobe. Resultado: etapa alcançada sem nenhuma comunicação, e
// nenhuma comunicação posterior. Este módulo detecta essa LACUNA sem reabrir prazos ou cadeia.
//
// Trava: uma lacuna NUNCA gera e-mail por si só. Fica "REISSUE_DECISION_REQUIRED" até existir uma
// decisão humana auditada (RISK_ALERT_REISSUE_APPROVED, actor USER, por caso). Só então o
// planejador cria entradas novas (chave REISSUE:<id da decisão>) — uma reemissão por decisão.

import type { MatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaEscalationLevel } from "@/lib/sla/types";

import type { LinkedSlaActionState, RecipientProfile, RiskSuppressionReason } from "./types";

export const REISSUE_APPROVED_ACTION = "RISK_ALERT_REISSUE_APPROVED";
export const REISSUE_DECISION_REQUIRED_ACTION = "RISK_ALERT_REISSUE_DECISION_REQUIRED";
export const REISSUE_ENTITY_TYPE = "RISK_ALERT_CASE";

export type CommunicationRole = "RESPONSAVEL" | "ESCALAO_1" | "DIRETORIA";

export interface OutboxHistoryRow {
  caseId: string;
  notificationType: string;
  escalationLevel: string | null;
  recipientUserId: string;
  recipientEmail: string | null;
  status: string;
  suppressionReason: string | null;
  attemptCount: number;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  /** Linha criada por uma reemissão (não entra no histórico "anterior"). */
  idempotencyKeyIsReissue?: boolean;
}

export interface ReissueApproval {
  auditId: string;
  caseId: string;
  approvedAt: string;
  approvedByUserId: string;
}

export interface ReissueAuditRow {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
}

export type RecipientCommunicationStatus =
  /** SENT ao e-mail do próprio usuário. */
  | "DELIVERED"
  /** SENT, mas o endereço efetivo não é o do usuário (override/caixa institucional). */
  | "ACCEPTED_ELSEWHERE"
  /** Só houve supressão (nenhum envio aceito). */
  | "SUPPRESSED_ONLY"
  /** Tentado e falhou, sem aceite. */
  | "ATTEMPTED_FAILED"
  /** Nenhuma linha na outbox para esse destinatário. */
  | "NEVER_PLANNED";

export interface RecipientLedger {
  role: CommunicationRole;
  userId: string;
  status: RecipientCommunicationStatus;
  suppressions: Array<{ at: string; reason: string | null; notificationType: string; escalationLevel: string | null }>;
  acceptedByGmail: Array<{ at: string | null; deliveredToRecipient: boolean; notificationType: string }>;
  attempts: number;
  /** Elegível HOJE pelas regras de destinatário (allowlist, membro ativo, e-mail corporativo). */
  eligibleNow: boolean;
  ineligibleReason: RiskSuppressionReason | null;
}

export interface CaseCommunicationLedger {
  caseId: string;
  stageReached: SlaEscalationLevel;
  responsibleUserId: string | null;
  recipients: RecipientLedger[];
  /** Destinatários exigidos pela etapa alcançada que nunca receberam comunicação entregue. */
  gaps: RecipientLedger[];
  decision: "INFORMED" | "REISSUE_DECISION_REQUIRED" | "REISSUE_APPROVED";
  approval: ReissueApproval | null;
}

const STAGE_RANK: Record<SlaEscalationLevel, number> = { RESPONSAVEL: 0, ESCALAO_1: 1, ESCALAO_2: 2, DIRETORIA: 2 };

/** Destinatários que a etapa alcançada exige que tenham sido informados (cadeia única de 3 níveis). */
export function requiredStageRecipients(
  stage: SlaEscalationLevel,
  responsibleUserId: string | null,
  policy: Pick<MatrixPolicy, "level1UserId" | "level2UserId" | "level3UserId">
): Array<{ role: CommunicationRole; userId: string }> {
  const out: Array<{ role: CommunicationRole; userId: string }> = [];
  const add = (role: CommunicationRole, userId: string | null) => {
    if (userId && !out.some((r) => r.userId === userId)) out.push({ role, userId });
  };
  add("RESPONSAVEL", responsibleUserId ?? policy.level1UserId);
  if (STAGE_RANK[stage] >= 1) add("ESCALAO_1", policy.level2UserId);
  if (STAGE_RANK[stage] >= 2) add("DIRETORIA", policy.level3UserId);
  return out;
}

function sameEmail(a: string | null, b: string | null): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

export function classifyRecipientHistory(
  rows: OutboxHistoryRow[],
  userId: string,
  profile: RecipientProfile | undefined
): Pick<RecipientLedger, "status" | "suppressions" | "acceptedByGmail" | "attempts"> {
  const mine = rows.filter((r) => r.recipientUserId === userId);
  const suppressions = mine
    .filter((r) => r.status === "SUPPRESSED")
    .map((r) => ({ at: r.createdAt, reason: r.suppressionReason, notificationType: r.notificationType, escalationLevel: r.escalationLevel }));
  const acceptedByGmail = mine
    .filter((r) => r.status === "SENT")
    .map((r) => ({ at: r.sentAt, deliveredToRecipient: sameEmail(r.recipientEmail, profile?.email ?? null), notificationType: r.notificationType }));
  const attempts = mine.filter((r) => r.attemptCount > 0 || r.status === "FAILED").length;
  let status: RecipientCommunicationStatus;
  if (acceptedByGmail.some((a) => a.deliveredToRecipient)) status = "DELIVERED";
  else if (acceptedByGmail.length > 0) status = "ACCEPTED_ELSEWHERE";
  else if (mine.some((r) => r.status === "FAILED")) status = "ATTEMPTED_FAILED";
  else if (suppressions.length > 0) status = "SUPPRESSED_ONLY";
  else status = "NEVER_PLANNED";
  return { status, suppressions, acceptedByGmail, attempts };
}

/** Decisão humana mais recente por caso (somente actor USER com usuário; SYSTEM/LEGACY ignorados). */
export function resolveReissueApprovals(rows: ReissueAuditRow[]): Map<string, ReissueApproval> {
  const out = new Map<string, ReissueApproval>();
  for (const row of rows) {
    if (row.action !== REISSUE_APPROVED_ACTION || row.entity_type !== REISSUE_ENTITY_TYPE) continue;
    if (row.actor_type !== "USER" || !row.actor_user_id) continue;
    const current = out.get(row.entity_id);
    if (!current || row.occurred_at > current.approvedAt) {
      out.set(row.entity_id, { auditId: row.id, caseId: row.entity_id, approvedAt: row.occurred_at, approvedByUserId: row.actor_user_id });
    }
  }
  return out;
}

export interface BuildLedgerInput {
  caseId: string;
  linked: LinkedSlaActionState;
  policy: Pick<MatrixPolicy, "level1UserId" | "level2UserId" | "level3UserId">;
  history: OutboxHistoryRow[];
  recipients: Map<string, RecipientProfile>;
  approval: ReissueApproval | null;
  /** Avaliação atual do destinatário (mesma regra do planejador). */
  eligibility: (userId: string) => { eligible: boolean; reason: RiskSuppressionReason | null };
}

export function buildCaseCommunicationLedger(input: BuildLedgerInput): CaseCommunicationLedger {
  const stage = input.linked.currentEscalationLevel;
  const rows = input.history.filter((r) => r.caseId === input.caseId);
  const required = requiredStageRecipients(stage, input.linked.responsibleUserId, input.policy);
  const recipients: RecipientLedger[] = required.map(({ role, userId }) => {
    const history = classifyRecipientHistory(rows, userId, input.recipients.get(userId));
    const eligibility = input.eligibility(userId);
    return { role, userId, ...history, eligibleNow: eligibility.eligible, ineligibleReason: eligibility.reason };
  });
  const gaps = recipients.filter((r) => r.status !== "DELIVERED");
  // Uma decisão só vale para lacunas que existiam quando foi tomada: depois de usada (entrega feita),
  // a lacuna some. Se nova lacuna surgir depois (nova etapa), ela exige nova decisão.
  const approval = input.approval;
  const decision: CaseCommunicationLedger["decision"] = gaps.length === 0 ? "INFORMED" : approval ? "REISSUE_APPROVED" : "REISSUE_DECISION_REQUIRED";
  return { caseId: input.caseId, stageReached: stage, responsibleUserId: input.linked.responsibleUserId, recipients, gaps, decision, approval };
}

/**
 * Histórico do CASO (todos os destinatários, inclusive responsáveis anteriores) de comunicações que
 * não chegaram ao destinatário: supressões e aceites em outra caixa — com datas, para o e-mail de
 * reemissão deixar explícito o que não foi entregue.
 */
export interface PriorCommunication {
  at: string;
  outcome: "SUPPRESSED" | "ACCEPTED_ELSEWHERE";
  reason: string | null;
  levelLabel: string;
  recipientName: string | null;
}

export function priorCommunicationsOf(history: OutboxHistoryRow[], caseId: string, recipients: Map<string, RecipientProfile>): PriorCommunication[] {
  const label = (level: string | null) => (level === "DIRETORIA" || level === "ESCALAO_2" ? "Nível 3 · Diretoria" : level === "ESCALAO_1" ? "Nível 2 · Gestor" : "Nível 1 · Responsável");
  const out: PriorCommunication[] = [];
  for (const r of history) {
    if (r.caseId !== caseId || r.idempotencyKeyIsReissue) continue;
    const profile = recipients.get(r.recipientUserId);
    if (r.status === "SUPPRESSED") {
      out.push({ at: r.createdAt, outcome: "SUPPRESSED", reason: r.suppressionReason, levelLabel: label(r.escalationLevel), recipientName: profile?.name ?? null });
    } else if (r.status === "SENT" && !sameEmail(r.recipientEmail, profile?.email ?? null)) {
      out.push({ at: r.sentAt ?? r.createdAt, outcome: "ACCEPTED_ELSEWHERE", reason: null, levelLabel: label(r.escalationLevel), recipientName: profile?.name ?? null });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function reissueIdempotencyKey(caseKey: string, approvalAuditId: string, userId: string): string {
  return `${caseKey}:REISSUE:${approvalAuditId}:${userId}`;
}

export function describeReissue(ledger: RecipientLedger, approval: ReissueApproval): string {
  const firstSuppression = ledger.suppressions[0];
  const origin =
    ledger.status === "ACCEPTED_ELSEWHERE"
      ? "a comunicação anterior foi aceita pelo Gmail, mas entregue em outra caixa (não ao destinatário)"
      : firstSuppression
        ? `a comunicação anterior foi suprimida em ${firstSuppression.at.slice(0, 10)} (${firstSuppression.reason ?? "sem motivo"}) e nunca entregue`
        : "nenhuma comunicação anterior chegou ao destinatário";
  return `Reemissão autorizada em ${approval.approvedAt.slice(0, 10)}: ${origin}. Prazos e etapa originais mantidos (SLA não reiniciado).`;
}
