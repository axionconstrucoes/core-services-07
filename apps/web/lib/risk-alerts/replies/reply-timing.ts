// Momento CONFIÁVEL de recebimento de uma resposta por e-mail × momento de processamento.
// O leitor da caixa (fase replies) roda periodicamente; uma resposta recebida antes do prazo e lida depois NÃO é ausência de
// resposta. Este módulo (puro) decide os registros auditados:
//   - RISK_ALERT_REPLY_RECEIVED: sempre que uma resposta autorizada e correlacionada é processada (recebida em R, processada em P);
//   - RISK_ALERT_ESCALATION_REPLY_CORRECTION: escalonamento aplicado DEPOIS do recebimento (a leitura atrasou) — correção
//     auditada, sem apagar histórico;
//   - RISK_ALERT_REPLY_FORECAST_PENDING: recebimento registrado, mas sem previsão — pendência separada (resposta incompleta).
// R = internalDate do Gmail (horário em que o Gmail recebeu a mensagem), nunca o horário de processamento.
import type { PlannedAuditEvent } from "../types";

export interface ReplyTimingContext {
  assumeDueAt: string | null;
  respondDueAt: string | null;
  completeDueAt: string | null;
  acknowledgedAt: string | null;
  escalations: Array<{ toLevel: string; escalatedAt: string }>;
}

export interface ReplyTimingInput {
  caseId: string;
  messageId: string;
  receivedAt: string | null;
  processedAt: string;
  classification: string | null;
  text: string;
  context: ReplyTimingContext | null;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN);

/** Previsão explícita: data (dd/mm[/aa]), dia da semana, "amanhã/hoje", hora (14h, 14:30) ou prazo em dias/horas. */
const FORECAST_PATTERNS = [
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
  /\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?\b/i,
  /(^|\s)(amanh[ãa]|hoje)(\s|[.,;!?]|$)/i,
  /\b\d{1,2}\s?h(\d{2})?\b|\b\d{1,2}:\d{2}\b/i,
  /\b(em|dentro de|at[ée])\s+\d+\s+(dias?|horas?|semanas?)\b/i,
];

export function hasForecast(text: string): boolean {
  return FORECAST_PATTERNS.some((pattern) => pattern.test(text));
}

/** Prazo que a resposta atendia: assunção enquanto não assumido; senão resposta/conclusão. */
export function relevantDeadline(context: ReplyTimingContext): string | null {
  if (!context.acknowledgedAt) return context.assumeDueAt;
  return context.respondDueAt ?? context.completeDueAt;
}

export function assessReplyTiming(input: ReplyTimingInput): { events: PlannedAuditEvent[]; receivedBeforeDeadline: boolean | null; correctedEscalations: number; forecastPending: boolean } {
  const events: PlannedAuditEvent[] = [];
  const receivedOk = Number.isFinite(ms(input.receivedAt));
  const receivedLabel = receivedOk ? (input.receivedAt as string) : "indisponível (sem data de recebimento confiável)";
  const deadline = input.context ? relevantDeadline(input.context) : null;
  const receivedBeforeDeadline = receivedOk && deadline ? ms(input.receivedAt) <= ms(deadline) : null;
  const deadlineNote = deadline
    ? `; prazo ${deadline}: ${receivedBeforeDeadline === null ? "não comparável" : receivedBeforeDeadline ? "recebida dentro do prazo" : "recebida após o prazo"}`
    : "";
  events.push({
    action: "RISK_ALERT_REPLY_RECEIVED",
    entityType: "RISK_ALERT_CASE",
    entityId: input.caseId,
    detail: `Resposta ${input.messageId} recebida em ${receivedLabel} (Gmail) e processada em ${input.processedAt}${deadlineNote}.`,
  });

  let correctedEscalations = 0;
  if (receivedOk && input.context) {
    for (const escalation of input.context.escalations) {
      if (ms(escalation.escalatedAt) > ms(input.receivedAt)) {
        correctedEscalations += 1;
        events.push({
          action: "RISK_ALERT_ESCALATION_REPLY_CORRECTION",
          entityType: "RISK_ALERT_CASE",
          entityId: input.caseId,
          detail: `Correção: a resposta ${input.messageId} foi recebida em ${input.receivedAt}, ANTES do escalonamento para ${escalation.toLevel} em ${escalation.escalatedAt}${receivedBeforeDeadline ? ` e dentro do prazo (${deadline})` : ""}. O escalonamento ocorreu porque a leitura da caixa só processou a mensagem em ${input.processedAt}; não houve ausência de resposta. Histórico preservado (nenhum registro apagado).`,
        });
      }
    }
  }

  const answersAction = input.classification === "ACKNOWLEDGEMENT" || input.classification === "STATUS_UPDATE";
  const forecastPending = answersAction && !hasForecast(input.text);
  if (forecastPending) {
    events.push({
      action: "RISK_ALERT_REPLY_FORECAST_PENDING",
      entityType: "RISK_ALERT_CASE",
      entityId: input.caseId,
      detail: `Recebimento da resposta ${input.messageId} registrado; previsão de conclusão não informada — pendência de previsão registrada separadamente.`,
    });
  }
  return { events, receivedBeforeDeadline, correctedEscalations, forecastPending };
}
