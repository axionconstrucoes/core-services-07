// Detalhamento do bloco "Ações e escalonamentos" do Dashboard executivo.
// Puro, sem I/O — explica, com os dados persistidos, por que os números do
// painel diferem entre si:
//   - "ações escalonadas" = ações ABERTAS acima do nível RESPONSAVEL (posição
//     atual, mesma regra de computeSlaActionsSummary);
//   - "registros de escalonamento" = linhas de sla_action_escalations
//     (histórico: uma ação pode subir mais de um nível => mais de um registro;
//     ações já concluídas mantêm seus registros).
// Nada aqui escala, notifica ou altera prazos.

import type { SlaAction, SlaActionEscalation, SlaEscalationLevel } from "@/lib/sla/types";

const LEVELS: SlaEscalationLevel[] = ["RESPONSAVEL", "ESCALAO_1", "ESCALAO_2", "DIRETORIA"];

export interface SlaEscalationBreakdown {
  /** Ações abertas (não COMPLETED/CANCELLED). */
  openActions: number;
  /** Abertas por nível atual de escalonamento. */
  openByLevel: Record<SlaEscalationLevel, number>;
  /** Abertas por status gravado (PENDING, ESCALATED, …). */
  openByStatus: Record<string, number>;
  /** Abertas por origem (EVENT, MANUAL, SSMA_CORRECTIVE_ACTION, OTHER, …). */
  openByOrigin: Record<string, number>;
  /** Abertas vinculadas a um caso de risco (risk_alert_cases.sla_action_id). */
  openLinkedToRiskCase: number;
  /** Abertas acima do nível RESPONSAVEL ou com status ESCALATED (= card "Escalonamentos"). */
  openEscalated: number;
  /** Total de registros de escalonamento da obra (histórico). */
  escalationRecords: number;
  /** Registros por nível de destino. */
  recordsByToLevel: Record<SlaEscalationLevel, number>;
  /** Registros de ações ainda abertas / de ações já encerradas (ou não encontradas na leitura). */
  recordsOnOpenActions: number;
  recordsOnClosedOrUnknownActions: number;
  /** Ações abertas escalonadas com MAIS de um registro (subiram mais de um nível ou foram reescalonadas). */
  openEscalatedWithMultipleRecords: number;
  /** Ações abertas escalonadas sem nenhum registro de escalonamento (inconsistência a investigar). */
  openEscalatedWithoutRecord: number;
  /** Registros sem destinatário gravado (notified_user_id nulo). */
  recordsWithoutRecipient: number;
}

function isOpen(action: Pick<SlaAction, "status">): boolean {
  return action.status !== "COMPLETED" && action.status !== "CANCELLED";
}

function zeroLevels(): Record<SlaEscalationLevel, number> {
  return { RESPONSAVEL: 0, ESCALAO_1: 0, ESCALAO_2: 0, DIRETORIA: 0 };
}

export function computeSlaEscalationBreakdown(input: {
  actions: readonly Pick<SlaAction, "id" | "status" | "currentEscalationLevel" | "origin">[];
  escalations: readonly Pick<SlaActionEscalation, "actionId" | "toLevel" | "notifiedUserId">[];
  /** ids de ações SLA referenciadas por risk_alert_cases.sla_action_id (null = leitura indisponível). */
  riskCaseActionIds: ReadonlySet<string> | null;
}): SlaEscalationBreakdown {
  const openByLevel = zeroLevels();
  const recordsByToLevel = zeroLevels();
  const openByStatus: Record<string, number> = {};
  const openByOrigin: Record<string, number> = {};
  const openIds = new Set<string>();
  const escalatedOpenIds = new Set<string>();
  let openLinkedToRiskCase = 0;

  for (const action of input.actions) {
    if (!isOpen(action)) continue;
    openIds.add(action.id);
    if (LEVELS.includes(action.currentEscalationLevel)) openByLevel[action.currentEscalationLevel] += 1;
    openByStatus[action.status] = (openByStatus[action.status] ?? 0) + 1;
    openByOrigin[action.origin] = (openByOrigin[action.origin] ?? 0) + 1;
    if (input.riskCaseActionIds?.has(action.id)) openLinkedToRiskCase += 1;
    if (action.status === "ESCALATED" || action.currentEscalationLevel !== "RESPONSAVEL") escalatedOpenIds.add(action.id);
  }

  const recordsPerAction = new Map<string, number>();
  let recordsOnOpenActions = 0;
  let recordsWithoutRecipient = 0;
  for (const record of input.escalations) {
    if (LEVELS.includes(record.toLevel)) recordsByToLevel[record.toLevel] += 1;
    if (openIds.has(record.actionId)) recordsOnOpenActions += 1;
    if (!record.notifiedUserId) recordsWithoutRecipient += 1;
    recordsPerAction.set(record.actionId, (recordsPerAction.get(record.actionId) ?? 0) + 1);
  }

  let openEscalatedWithMultipleRecords = 0;
  let openEscalatedWithoutRecord = 0;
  for (const id of escalatedOpenIds) {
    const count = recordsPerAction.get(id) ?? 0;
    if (count === 0) openEscalatedWithoutRecord += 1;
    else if (count > 1) openEscalatedWithMultipleRecords += 1;
  }

  return {
    openActions: openIds.size,
    openByLevel,
    openByStatus,
    openByOrigin,
    openLinkedToRiskCase,
    openEscalated: escalatedOpenIds.size,
    escalationRecords: input.escalations.length,
    recordsByToLevel,
    recordsOnOpenActions,
    recordsOnClosedOrUnknownActions: input.escalations.length - recordsOnOpenActions,
    openEscalatedWithMultipleRecords,
    openEscalatedWithoutRecord,
    recordsWithoutRecipient,
  };
}
