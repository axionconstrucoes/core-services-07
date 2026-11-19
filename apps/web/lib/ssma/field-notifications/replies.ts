// Respostas por e-mail aos avisos de AÇÃO CORRETIVA SSMA (escopo WEG_CORRECTIVE_ACTIONS) — PURO, sem I/O.
//
// Correlação: o aviso sai com Reply-To opaco <caixa-acc>+alerta-<token>@domínio (mesmo formato dos alertas de risco). Só o
// sha256 do token é persistido, na auditoria da ação (SSMA_REPLY_TOKEN_ISSUED) ANTES do envio. A fase `replies` do worker
// semanal lê a caixa institucional, resolve o hash e decide aqui o que registrar.
//
// Regras:
//  - autoresposta / bounce / mensagem do próprio ACC / loop => ignorada (auditada), sem confirmação;
//  - remetente precisa ser membro ATIVO da obra e o responsável atual da ação (ou Administrador da obra);
//  - só o texto NOVO conta (citação e assinatura removidas);
//  - "Em andamento" / "Tomando providências" / "Providenciando" => status em andamento; a previsão é extraída do corpo:
//      ALTA/CRÍTICA exigem data E horário; MÉDIA/BAIXA aceitam só a data; sem previsão válida => PENDENTE + pedido de complementação;
//  - nada aqui conclui a ação, reinicia prazos ou suspende cobranças;
//  - mensagem mais antiga que a última já processada (fora de ordem) => guardada no histórico, sem alterar status/previsão;
//  - mesma mensagem (id do provedor) nunca é processada duas vezes.

import { applyForecastPrecision, describeForecastProblem, extractForecastFromText, type ForecastParse } from "@/lib/risk-alerts/forecast";
import { filterInboundMessage, parseReplyBody, type InboundFilterVerdict, type InboundHeaders } from "@/lib/risk-alerts/replies/reply-pipeline";

export const SSMA_REPLY_ENTITY_TYPE = "SSMA_CORRECTIVE_ACTION";
export const SSMA_REPLY_TOKEN_ISSUED = "SSMA_REPLY_TOKEN_ISSUED";
export const SSMA_REPLY_PROCESSED = "SSMA_REPLY_PROCESSED";
export const SSMA_REPLY_IGNORED = "SSMA_REPLY_IGNORED";
export const SSMA_REPLY_CONFIRMATION_PENDING = "SSMA_REPLY_CONFIRMATION_PENDING";
export const SSMA_REPLY_CONFIRMATION_CLAIMED = "SSMA_REPLY_CONFIRMATION_CLAIMED";
export const SSMA_REPLY_CONFIRMATION_SENT = "SSMA_REPLY_CONFIRMATION_SENT";

export type SsmaReplyStatus = "IN_PROGRESS" | "CONCLUSION_REPORTED" | "OTHER";
export type SsmaSeverityLevel = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

const IN_PROGRESS = /\b(em\s+andamento|tomando\s+(as\s+)?provid[êe]ncias?|providenciando|em\s+execu[çc][ãa]o|em\s+tratamento|j[áa]\s+estamos|estamos\s+(tratando|resolvendo|executando|providenciando)|iniciad[oa]s?|iniciamos)\b/i;
const CONCLUSION = /\b(conclu[íi]d[oa]s?|finalizad[oa]s?|resolvid[oa]s?|encerrad[oa]s?)\b/i;
const FORECAST_CUE = /\b(previs[ãa]o|prevista?|at[ée]\s+(o\s+)?dia|concluir(emos)?\s+(em|at[ée])|conclus[ãa]o\s+(em|at[ée]|prevista))\b/i;

export function detectSsmaReplyStatus(cleanText: string): SsmaReplyStatus {
  const text = cleanText.trim();
  if (!text) return "OTHER";
  if (IN_PROGRESS.test(text)) return "IN_PROGRESS";
  // "concluído" sem expressão de previsão: o responsável informa conclusão (registro; a conclusão formal exige o ACC).
  if (CONCLUSION.test(text) && !FORECAST_CUE.test(text)) return "CONCLUSION_REPORTED";
  // Só a previsão (sem a palavra "andamento") também indica tratamento em curso.
  if (FORECAST_CUE.test(text)) return "IN_PROGRESS";
  return "OTHER";
}

export function ssmaStatusLabel(status: SsmaReplyStatus): string {
  if (status === "IN_PROGRESS") return "Em andamento (tomando providências)";
  if (status === "CONCLUSION_REPORTED") return "Conclusão informada por e-mail — a conclusão formal exige registro no ACC com evidência";
  return "Resposta registrada — o ACC não identificou o andamento. Informe \"em andamento\" e a previsão de conclusão, ou registre a ação no ACC";
}

export function ssmaForecastTracked(severity: SsmaSeverityLevel): boolean {
  return severity === "CRITICA" || severity === "ALTA";
}

export interface SsmaReplyMessage {
  providerMessageId: string;
  headers: InboundHeaders;
  bodyOriginal: string;
  receivedAt: string;
}

export interface SsmaReplyTarget {
  actionId: string;
  recordId: string;
  projectId: string;
  actionStatus: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | string;
  responsibleUserId: string | null;
  severity: SsmaSeverityLevel;
  /** recebimento da resposta mais recente já processada desta ação (null se nenhuma). */
  lastProcessedReceivedAt: string | null;
}

export interface SsmaReplyMember {
  userId: string;
  email: string | null;
  status: string;
  permission: string;
}

export type SsmaReplyDecision =
  | { kind: "IGNORE"; reason: InboundFilterVerdict | "ALREADY_PROCESSED" | "ACTION_CLOSED" }
  | { kind: "UNAUTHORIZED"; reason: "SENDER_NOT_MEMBER" | "SENDER_NOT_RESPONSIBLE" }
  | {
      kind: "PROCESS";
      actorUserId: string;
      status: SsmaReplyStatus;
      statusLabel: string;
      forecast: ForecastParse;
      forecastProblem: string | null;
      tracked: boolean;
      outOfOrder: boolean;
      /** Nova situação da ação corretiva (ABERTA -> EM_ANDAMENTO), quando aplicável. */
      newActionStatus: "EM_ANDAMENTO" | null;
      /** Registrar o "assumir" da ação SLA (resposta válida do responsável), se ainda não houver. */
      acknowledge: boolean;
      cleanText: string;
      note: string;
    };

const fmtBrt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function decideSsmaReply(input: {
  message: SsmaReplyMessage;
  target: SsmaReplyTarget;
  members: readonly SsmaReplyMember[];
  accMailboxes: string[];
  processedMessageIds: ReadonlySet<string>;
}): SsmaReplyDecision {
  const { message, target } = input;
  if (input.processedMessageIds.has(message.providerMessageId)) return { kind: "IGNORE", reason: "ALREADY_PROCESSED" };
  const verdict = filterInboundMessage(message.headers, { accMailboxes: input.accMailboxes, seenMessageIds: new Set() });
  if (verdict !== "OK") return { kind: "IGNORE", reason: verdict };
  if (target.actionStatus === "CONCLUIDA") return { kind: "IGNORE", reason: "ACTION_CLOSED" };

  const from = message.headers.from.trim().toLowerCase();
  const member = input.members.find((m) => (m.email ?? "").trim().toLowerCase() === from && m.status === "ACTIVE");
  if (!member) return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_MEMBER" };
  if (member.userId !== target.responsibleUserId && member.permission !== "ADMINISTRADOR") return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_RESPONSIBLE" };

  const cleanText = parseReplyBody(message.bodyOriginal).clean.slice(0, 4000);
  const status = detectSsmaReplyStatus(cleanText);
  const tracked = ssmaForecastTracked(target.severity);
  const forecast = status === "IN_PROGRESS" ? applyForecastPrecision(extractForecastFromText(cleanText, message.receivedAt), tracked ? "TRACKED" : "RECORD_ONLY") : ({ status: "MISSING" } as ForecastParse);
  const forecastProblem = status === "IN_PROGRESS" ? describeForecastProblem(forecast) : null;
  const outOfOrder = target.lastProcessedReceivedAt !== null && new Date(message.receivedAt).getTime() < new Date(target.lastProcessedReceivedAt).getTime();
  const newActionStatus = !outOfOrder && status === "IN_PROGRESS" && target.actionStatus === "ABERTA" ? "EM_ANDAMENTO" : null;
  const forecastText =
    status !== "IN_PROGRESS"
      ? "não se aplica"
      : forecast.status === "VALID"
        ? `${fmtBrt(forecast.iso)} (horário de Brasília)`
        : `PENDENTE — ${forecastProblem ?? "previsão não informada"}`;
  const note = [
    `Resposta por e-mail recebida em ${fmtBrt(message.receivedAt)}${outOfOrder ? " (FORA DE ORDEM: anterior a uma atualização já registrada; não altera status nem previsão vigentes)" : ""}.`,
    `Status: ${ssmaStatusLabel(status)}.`,
    `Previsão de conclusão: ${forecastText}.`,
    `Texto (sem citação/assinatura): ${cleanText.slice(0, 600) || "(vazio)"}`,
  ].join(" ");

  return {
    kind: "PROCESS",
    actorUserId: member.userId,
    status,
    statusLabel: ssmaStatusLabel(status),
    forecast,
    forecastProblem,
    tracked,
    outOfOrder,
    newActionStatus,
    acknowledge: status !== "OTHER",
    cleanText,
    note: note.slice(0, 2000),
  };
}

/** Linha da previsão para a confirmação (null => PENDENTE). */
export function confirmationForecastLine(decision: Extract<SsmaReplyDecision, { kind: "PROCESS" }>): string | null {
  if (decision.status !== "IN_PROGRESS") return "não se aplica";
  return decision.forecast.status === "VALID" ? `${fmtBrt(decision.forecast.iso)} (horário de Brasília — America/Sao_Paulo)` : null;
}

export function confirmationPendingLine(decision: Extract<SsmaReplyDecision, { kind: "PROCESS" }>): string | null {
  if (decision.status === "OTHER") return "Status não reconhecido: informe se a ação está em andamento e a previsão de conclusão.";
  if (decision.status !== "IN_PROGRESS") return null;
  if (decision.forecast.status === "VALID") return null;
  return decision.forecastProblem ?? (decision.tracked ? "Informe a data E o horário previstos de conclusão." : "Informe a data prevista de conclusão.");
}

/** Mapeia o nível do registro de campo para a severidade do aviso. */
export function ssmaSeverityOf(riskLevel: string | null | undefined): SsmaSeverityLevel {
  const value = (riskLevel ?? "").toUpperCase();
  if (value === "CRITICA") return "CRITICA";
  if (value === "ALTA") return "ALTA";
  if (value === "BAIXA") return "BAIXA";
  return "MEDIA";
}
