// Classificação de semanas sem cronograma e responsável à época — puro, sem I/O.
//
// Uma semana sem cronograma aceito só é atribuída ao responsável (CRONOGRAMA_NAO_RECEBIDO) quando
// a evidência de coleta é íntegra. Caso contrário vira pendência de INTEGRAÇÃO, sem cobrar ninguém:
//   - EVIDENCIA_INCOMPLETA_INTEGRACAO: coleta sem execução bem-sucedida depois do prazo (+margem),
//     caixa do responsável à época não integrada/sem mensagens coletadas, ou responsável não
//     identificado;
//   - RECEBIDO_NAO_PROCESSADO: .mpp coletado na semana (ou intake não aceito) sem cronograma aceito.
// Responsável à época: o "de" da primeira transferência registrada DEPOIS do prazo da semana; sem
// transferência posterior, o responsável atual da Matriz.

export type MissedWeekClassification = "RECEBIDO" | "CRONOGRAMA_NAO_RECEBIDO" | "EVIDENCIA_INCOMPLETA_INTEGRACAO" | "RECEBIDO_NAO_PROCESSADO";

export type MissedWeekReason =
  | "COLETA_SEM_EXECUCAO_APOS_PRAZO"
  | "CAIXA_DO_RESPONSAVEL_NAO_INTEGRADA"
  | "RESPONSAVEL_NAO_IDENTIFICADO"
  | "MPP_COLETADO_SEM_CRONOGRAMA_ACEITO";

/** Margem entre o prazo semanal e a última coleta bem-sucedida para considerar a janela coberta. */
export const COLLECTION_COVERAGE_MARGIN_MS = 6 * 3600 * 1000;

export interface ResponsibleRef {
  userId: string | null;
  email: string | null;
}

export interface ResponsibleTransfer {
  at: string;
  from: ResponsibleRef;
  to: ResponsibleRef;
}

export interface ResponsibleAtTime extends ResponsibleRef {
  source: "TRANSFER_HISTORY" | "CURRENT_MATRIX" | "UNKNOWN";
  /** true quando é o responsável atual (false = responsável anterior: registro histórico, sem cobrança). */
  isCurrent: boolean;
}

export interface MissedWeekEvidence {
  scheduleReceived: boolean;
  /** .mpp anexado a e-mail coletado na semana, ou intake da semana em status não aceito. */
  mppCollectedWithoutAcceptedSchedule: boolean;
  /** Última coleta bem-sucedida (ISO) da caixa monitorada do projeto; null = sem registro. */
  lastSuccessfulCollectionAt: string | null;
  responsibleAtTime: ResponsibleAtTime;
  /** Caixa do responsável à época habilitada E com mensagens efetivamente coletadas. */
  responsibleMailboxIntegrated: boolean;
}

const lower = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Transferências únicas (várias linhas de auditoria por transição são consolidadas), em ordem. */
export function normalizeTransfers(rows: ResponsibleTransfer[]): ResponsibleTransfer[] {
  const seen = new Set<string>();
  const out: ResponsibleTransfer[] = [];
  for (const row of [...rows].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${row.at.slice(0, 16)}|${lower(row.from.email) || row.from.userId}|${lower(row.to.email) || row.to.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Extrai "de <e-mail> para <e-mail>" do detalhe da auditoria RISK_ALERT_RESPONSIBLE_TRANSFERRED. */
export function parseTransferDetail(detail: string | null | undefined): { fromEmail: string; toEmail: string } | null {
  const match = /de\s+([^\s,;]+@[^\s,;]+)\s+para\s+([^\s,;]+@[^\s,;]+)/i.exec(detail ?? "");
  if (!match) return null;
  return { fromEmail: lower(match[1]), toEmail: lower(match[2].replace(/[.)]+$/, "")) };
}

export function resolveResponsibleAt(instantIso: string, current: ResponsibleRef, transfers: ResponsibleTransfer[]): ResponsibleAtTime {
  const later = normalizeTransfers(transfers).find((t) => t.at > instantIso);
  if (later) {
    const isCurrent = Boolean((later.from.userId && later.from.userId === current.userId) || (later.from.email && lower(later.from.email) === lower(current.email)));
    return { ...later.from, source: "TRANSFER_HISTORY", isCurrent };
  }
  if (!current.userId && !current.email) return { userId: null, email: null, source: "UNKNOWN", isCurrent: false };
  return { ...current, source: "CURRENT_MATRIX", isCurrent: true };
}

export function classifyMissedWeek(evidence: MissedWeekEvidence, deadlineAt: Date): { classification: MissedWeekClassification; reasons: MissedWeekReason[] } {
  if (evidence.scheduleReceived) return { classification: "RECEBIDO", reasons: [] };
  if (evidence.mppCollectedWithoutAcceptedSchedule) return { classification: "RECEBIDO_NAO_PROCESSADO", reasons: ["MPP_COLETADO_SEM_CRONOGRAMA_ACEITO"] };
  const reasons: MissedWeekReason[] = [];
  const last = evidence.lastSuccessfulCollectionAt ? new Date(evidence.lastSuccessfulCollectionAt).getTime() : NaN;
  if (Number.isNaN(last) || last < deadlineAt.getTime() + COLLECTION_COVERAGE_MARGIN_MS) reasons.push("COLETA_SEM_EXECUCAO_APOS_PRAZO");
  if (evidence.responsibleAtTime.source === "UNKNOWN") reasons.push("RESPONSAVEL_NAO_IDENTIFICADO");
  else if (!evidence.responsibleMailboxIntegrated) reasons.push("CAIXA_DO_RESPONSAVEL_NAO_INTEGRADA");
  if (reasons.length > 0) return { classification: "EVIDENCIA_INCOMPLETA_INTEGRACAO", reasons };
  return { classification: "CRONOGRAMA_NAO_RECEBIDO", reasons: [] };
}
