// Continuidade de cobrança das AÇÕES CORRETIVAS SSMA (escopo WEG_CORRECTIVE_ACTIONS) — PURO, sem I/O.
//
// Mesmas regras aprovadas da Matriz (área ESG_SSMA, regra do nível de risco, calendário com feriados do projeto), pelo motor
// existente computeEscalation:
//   RESPONSAVEL --(prazo de assumir/concluir vencido)--> Nível 2 · Gestor --(+ escalation2AfterValue)--> Nível 3 · Diretoria
//   --(+ boardAfterValue)--> limite atingido (só auditoria, sem e-mail).
// Nada aqui reinicia SLA: os limites são calculados sobre os prazos ORIGINAIS da ação SLA.
//
// Comunicação (1 por ação × nível, nunca repetida):
//   - limite vencido ANTES da ativação desta continuidade => HISTÓRICO: nível registrado, envio TRAVADO até decisão humana
//     auditada por ação × nível (SSMA_ESCALATION_REISSUE_APPROVED) — mesmo padrão da trava de reemissão dos alertas de risco;
//   - limite vencido DEPOIS da ativação => e-mail ao destinatário do nível (Gestor ou Diretoria), identificado pelo nível;
//   - os dois níveis vencidos na MESMA execução (ex.: atraso do agendador) => só a mensagem de Diretoria, informando que a etapa
//     do Gestor foi pulada (sem duas mensagens ao mesmo endereço);
//   - ação SLA vinculada a um caso de alerta de risco => ignorada aqui (o ciclo de riscos é o dono; nunca os dois caminhos).

import { computeEscalation } from "@/lib/sla/compute-escalation";
import type { MatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import { addTimeUnits } from "@/lib/sla/time-units";
import type { SlaActionStatus, SlaEscalationLevel, SlaEscalationReason } from "@/lib/sla/types";

export const SSMA_ESCALATION_ACTIVATED = "SSMA_ESCALATION_CHANNEL_ACTIVATED";
export const SSMA_ESCALATION_LEVEL_APPLIED = "SSMA_ESCALATION_LEVEL_APPLIED";
export const SSMA_ESCALATION_DECISION_REQUIRED = "SSMA_ESCALATION_DECISION_REQUIRED";
export const SSMA_ESCALATION_REISSUE_APPROVED = "SSMA_ESCALATION_REISSUE_APPROVED";
export const SSMA_ESCALATION_CLAIMED = "SSMA_ESCALATION_CLAIMED";
export const SSMA_ESCALATION_SENT = "SSMA_ESCALATION_SENT";
export const SSMA_ESCALATION_SUPERSEDED = "SSMA_ESCALATION_SUPERSEDED";
export const SSMA_ESCALATION_TOP_LEVEL = "SSMA_ESCALATION_TOP_LEVEL_REACHED";

export type SsmaCommLevel = "ESCALAO_1" | "DIRETORIA";

export interface SsmaSlaActionState {
  id: string;
  status: SlaActionStatus;
  currentEscalationLevel: SlaEscalationLevel;
  assumeDueAt: string;
  respondDueAt: string | null;
  completeDueAt: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  contractualDeadline: string | null;
}

export interface SsmaEscalationLedger {
  sent: ReadonlySet<SsmaCommLevel>;
  claimed: ReadonlySet<SsmaCommLevel>;
  decisionRequired: ReadonlySet<SsmaCommLevel>;
  approved: ReadonlySet<SsmaCommLevel>;
  superseded: ReadonlySet<SsmaCommLevel>;
  topLevelRecorded: boolean;
}

export interface SsmaEscalationThresholds {
  checkpointAt: string | null;
  checkpointReason: SlaEscalationReason | null;
  gestorAt: string | null;
  diretoriaAt: string | null;
  topAt: string | null;
}

export type SsmaCommunicationMode = "SEND" | "SEND_APPROVED_REISSUE" | "DECISION_REQUIRED" | "SUPERSEDED";

export interface PlannedSsmaCommunication {
  level: SsmaCommLevel;
  mode: SsmaCommunicationMode;
  thresholdAt: string;
  recipientUserId: string | null;
  /** Diretoria enviada sem a mensagem do Gestor (pulada nesta execução, histórica travada ou nível 2 ausente na Matriz). */
  gestorSkipped: boolean;
}

export interface SsmaEscalationPlan {
  skippedReason: "LINKED_TO_RISK_CASE" | "CLOSED" | "NO_POLICY" | null;
  thresholds: SsmaEscalationThresholds;
  /** Passos de nível a aplicar no SLA (em ordem). */
  levelSteps: Array<{ from: SlaEscalationLevel; to: SsmaCommLevel; reason: SlaEscalationReason }>;
  communications: PlannedSsmaCommunication[];
  recordTopLevel: boolean;
}

const RANK: Record<SlaEscalationLevel, number> = { RESPONSAVEL: 0, ESCALAO_1: 1, ESCALAO_2: 1, DIRETORIA: 2 };

/** Limites (instantes) da cadeia, a partir dos prazos ORIGINAIS da ação — mesma aritmética de computeEscalation. */
export function ssmaEscalationThresholds(action: SsmaSlaActionState, policy: Pick<MatrixPolicy, "rule" | "businessHours">): SsmaEscalationThresholds {
  let checkpoint: string | null = null;
  let reason: SlaEscalationReason | null = null;
  if (!action.acknowledgedAt) {
    checkpoint = action.assumeDueAt;
    reason = "NO_ACKNOWLEDGMENT";
  } else if (!action.completedAt && action.completeDueAt) {
    checkpoint = action.completeDueAt;
    reason = "NOT_COMPLETED";
  } else if (!action.completedAt && action.respondDueAt) {
    checkpoint = action.respondDueAt;
    reason = "NOT_RESPONDED";
  }
  if (!checkpoint) return { checkpointAt: null, checkpointReason: null, gestorAt: null, diretoriaAt: null, topAt: null };
  const diretoria = addTimeUnits(new Date(checkpoint), policy.rule.escalation2AfterValue, policy.rule.timeUnit, policy.businessHours);
  const top = addTimeUnits(diretoria, policy.rule.boardAfterValue, policy.rule.timeUnit, policy.businessHours);
  return { checkpointAt: checkpoint, checkpointReason: reason, gestorAt: checkpoint, diretoriaAt: diretoria.toISOString(), topAt: top.toISOString() };
}

export function planSsmaEscalation(input: {
  action: SsmaSlaActionState;
  correctiveActionClosed: boolean;
  linkedToRiskCase: boolean;
  policy: MatrixPolicy | null;
  nowIso: string;
  activationAt: string;
  ledger: SsmaEscalationLedger;
}): SsmaEscalationPlan {
  const empty = (skippedReason: SsmaEscalationPlan["skippedReason"]): SsmaEscalationPlan => ({
    skippedReason,
    thresholds: { checkpointAt: null, checkpointReason: null, gestorAt: null, diretoriaAt: null, topAt: null },
    levelSteps: [],
    communications: [],
    recordTopLevel: false,
  });
  if (input.linkedToRiskCase) return empty("LINKED_TO_RISK_CASE");
  if (input.correctiveActionClosed || input.action.status === "COMPLETED" || input.action.status === "CANCELLED") return empty("CLOSED");
  if (!input.policy) return empty("NO_POLICY");
  const policy = input.policy;

  const result = computeEscalation({
    status: input.action.status,
    currentEscalationLevel: input.action.currentEscalationLevel,
    assumeDueAt: input.action.assumeDueAt,
    respondDueAt: input.action.respondDueAt,
    completeDueAt: input.action.completeDueAt,
    acknowledgedAt: input.action.acknowledgedAt,
    completedAt: input.action.completedAt,
    contractualDeadline: input.action.contractualDeadline,
    now: input.nowIso,
    rule: policy.rule,
    businessHoursConfig: policy.businessHours,
  });
  const thresholds = ssmaEscalationThresholds(input.action, policy);
  const reason: SlaEscalationReason = result.reason ?? thresholds.checkpointReason ?? "NO_ACKNOWLEDGMENT";
  const recommendedRank = RANK[result.recommendedLevel];
  const currentRank = RANK[input.action.currentEscalationLevel];

  // Passos de nível (estado do SLA) — um por vez, a partir do nível atual.
  const levelSteps: SsmaEscalationPlan["levelSteps"] = [];
  let from: SlaEscalationLevel = input.action.currentEscalationLevel;
  if (currentRank < 1 && recommendedRank >= 1) {
    levelSteps.push({ from, to: "ESCALAO_1", reason });
    from = "ESCALAO_1";
  }
  if (currentRank < 2 && recommendedRank >= 2) levelSteps.push({ from, to: "DIRETORIA", reason });

  // Comunicação por nível alcançado (independe de quando o nível foi aplicado no SLA).
  const activation = new Date(input.activationAt).getTime();
  const reached: Array<{ level: SsmaCommLevel; thresholdAt: string; recipientUserId: string | null }> = [];
  if (recommendedRank >= 1 && thresholds.gestorAt) reached.push({ level: "ESCALAO_1", thresholdAt: thresholds.gestorAt, recipientUserId: policy.level2UserId });
  if (recommendedRank >= 2 && thresholds.diretoriaAt) reached.push({ level: "DIRETORIA", thresholdAt: thresholds.diretoriaAt, recipientUserId: policy.level3UserId });

  const communications: PlannedSsmaCommunication[] = [];
  const newDiretoria = reached.find((r) => r.level === "DIRETORIA" && new Date(r.thresholdAt).getTime() >= activation);
  for (const item of reached) {
    const done = input.ledger.sent.has(item.level) || input.ledger.claimed.has(item.level) || input.ledger.superseded.has(item.level);
    if (done) continue;
    const historical = new Date(item.thresholdAt).getTime() < activation;
    if (item.level === "ESCALAO_1" && !item.recipientUserId) {
      // Nível 2 ausente na Matriz: a regra existente escala direto à Diretoria (sem mensagem de Gestor).
      communications.push({ ...item, mode: "SUPERSEDED", gestorSkipped: false });
      continue;
    }
    if (historical) {
      if (input.ledger.approved.has(item.level)) communications.push({ ...item, mode: "SEND_APPROVED_REISSUE", gestorSkipped: false });
      else if (!input.ledger.decisionRequired.has(item.level)) communications.push({ ...item, mode: "DECISION_REQUIRED", gestorSkipped: false });
      continue;
    }
    if (item.level === "ESCALAO_1" && newDiretoria && !input.ledger.sent.has("DIRETORIA")) {
      // Gestor e Diretoria vencidos na mesma execução: uma só mensagem (Diretoria), sem duplicar o mesmo endereço.
      communications.push({ ...item, mode: "SUPERSEDED", gestorSkipped: false });
      continue;
    }
    communications.push({ ...item, mode: "SEND", gestorSkipped: false });
  }
  // Diretoria sem mensagem de Gestor enviada antes => informar que a etapa do Gestor foi pulada.
  for (const c of communications) {
    if (c.level !== "DIRETORIA" || (c.mode !== "SEND" && c.mode !== "SEND_APPROVED_REISSUE")) continue;
    const gestorPlannedSend = communications.some((o) => o.level === "ESCALAO_1" && (o.mode === "SEND" || o.mode === "SEND_APPROVED_REISSUE"));
    c.gestorSkipped = !input.ledger.sent.has("ESCALAO_1") && !gestorPlannedSend;
  }

  return {
    skippedReason: null,
    thresholds,
    levelSteps,
    communications,
    recordTopLevel: result.topLevelReached && !input.ledger.topLevelRecorded,
  };
}

/** Ledger a partir das linhas de auditoria da ação corretiva (detail JSON com `level`). */
export function buildSsmaEscalationLedger(rows: ReadonlyArray<{ action: string; detail: string | null; actor_type?: string | null }>): SsmaEscalationLedger {
  const sets = { sent: new Set<SsmaCommLevel>(), claimed: new Set<SsmaCommLevel>(), decisionRequired: new Set<SsmaCommLevel>(), approved: new Set<SsmaCommLevel>(), superseded: new Set<SsmaCommLevel>() };
  let topLevelRecorded = false;
  for (const row of rows) {
    if (row.action === SSMA_ESCALATION_TOP_LEVEL) {
      topLevelRecorded = true;
      continue;
    }
    let level: SsmaCommLevel | null = null;
    try {
      const parsed = JSON.parse(row.detail ?? "") as { level?: unknown };
      level = parsed.level === "ESCALAO_1" || parsed.level === "DIRETORIA" ? parsed.level : null;
    } catch {
      level = null;
    }
    if (!level) continue;
    if (row.action === SSMA_ESCALATION_SENT) sets.sent.add(level);
    else if (row.action === SSMA_ESCALATION_CLAIMED) sets.claimed.add(level);
    else if (row.action === SSMA_ESCALATION_DECISION_REQUIRED) sets.decisionRequired.add(level);
    // A liberação vale só quando registrada por uma PESSOA (USER), nunca pelo sistema.
    else if (row.action === SSMA_ESCALATION_REISSUE_APPROVED && row.actor_type === "USER") sets.approved.add(level);
    else if (row.action === SSMA_ESCALATION_SUPERSEDED) sets.superseded.add(level);
  }
  return { ...sets, topLevelRecorded };
}

export function ssmaLevelLabel(level: SsmaCommLevel): string {
  return level === "ESCALAO_1" ? "Nível 2 · Gestor" : "Nível 3 · Diretoria";
}

// ------------------------------------------------------------------
// Previsão de conclusão (a partir das respostas já processadas) e vencimento
// ------------------------------------------------------------------
export const SSMA_FORECAST_EXPIRED_CLAIMED = "SSMA_FORECAST_EXPIRED_NOTICE_CLAIMED";
export const SSMA_FORECAST_EXPIRED_SENT = "SSMA_FORECAST_EXPIRED_NOTICE_SENT";

export type SsmaForecastState =
  | { kind: "NO_REPLY" }
  | { kind: "PENDING"; problem: string | null; receivedAt: string }
  | { kind: "VALID"; forecastAt: string; receivedAt: string };

/** Previsão vigente = a da resposta processada mais recente (não fora de ordem). Sem data válida => PENDENTE. */
export function ssmaForecastState(processedDetails: ReadonlyArray<Record<string, unknown>>): SsmaForecastState {
  const valid = processedDetails
    .filter((d) => !d.outOfOrder && typeof d.receivedAt === "string" && d.status === "IN_PROGRESS")
    .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)));
  const last = valid.at(-1);
  if (!last) return processedDetails.length > 0 ? { kind: "PENDING", problem: "Resposta sem status de andamento reconhecido.", receivedAt: String(processedDetails.at(-1)?.receivedAt ?? "") } : { kind: "NO_REPLY" };
  if (last.forecastStatus === "VALID" && typeof last.forecastAt === "string") return { kind: "VALID", forecastAt: last.forecastAt, receivedAt: String(last.receivedAt) };
  return { kind: "PENDING", problem: typeof last.forecastProblem === "string" ? last.forecastProblem : null, receivedAt: String(last.receivedAt) };
}

export function ssmaForecastLine(state: SsmaForecastState, nowIso: string, fmt: (iso: string) => string): string {
  if (state.kind === "NO_REPLY") return "Responsável ainda não respondeu — previsão não informada.";
  if (state.kind === "PENDING") return `PENDENTE — ${state.problem ?? "previsão não informada"} (resposta de ${fmt(state.receivedAt)}).`;
  const expired = new Date(state.forecastAt).getTime() < new Date(nowIso).getTime();
  return `${fmt(state.forecastAt)} (horário de Brasília)${expired ? " — VENCIDA sem conclusão" : ""}.`;
}

/**
 * Previsão VENCIDA sem conclusão (ALTO/CRÍTICO): aviso ao responsável UMA vez por previsão informada (evento definido pela
 * regra aprovada: "a previsão fica explícita para o responsável, inclusive o vencimento"). Nenhum intervalo de repetição é
 * criado aqui — repetição periódica depende de decisão.
 */
export function forecastExpiryNoticeDue(input: {
  severity: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
  state: SsmaForecastState;
  nowIso: string;
  correctiveActionClosed: boolean;
  notifiedForecasts: ReadonlySet<string>;
}): { due: boolean; forecastAt: string | null } {
  if (input.correctiveActionClosed || (input.severity !== "CRITICA" && input.severity !== "ALTA")) return { due: false, forecastAt: null };
  if (input.state.kind !== "VALID") return { due: false, forecastAt: null };
  const expired = new Date(input.state.forecastAt).getTime() < new Date(input.nowIso).getTime();
  if (!expired || input.notifiedForecasts.has(input.state.forecastAt)) return { due: false, forecastAt: input.state.forecastAt };
  return { due: true, forecastAt: input.state.forecastAt };
}
