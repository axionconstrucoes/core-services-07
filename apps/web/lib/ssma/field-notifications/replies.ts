// Respostas por e-mail aos avisos de AÇÃO CORRETIVA SSMA (escopo WEG_CORRECTIVE_ACTIONS) — PURO, sem I/O.
//
// Correlação: o aviso sai com Reply-To opaco <caixa-acc>+alerta-<token>@domínio e com atalhos mailto para o MESMO endereço.
// Só o sha256 do token é persistido ANTES do envio (email_reply_tokens, tipo SSMA_ACTION; e, por compatibilidade, na auditoria
// da ação: SSMA_REPLY_TOKEN_ISSUED). A fase `replies` do worker lê a caixa institucional, resolve o hash e decide aqui o que fazer.
//
// Regras (P2):
//  - autoresposta / bounce / mensagem do próprio ACC / loop => ignorada (auditada), sem confirmação;
//  - remetente: domínio corporativo, perfil com o e-mail EXATO do From, membro ATIVO da obra, DMARC/DKIM alinhado registrado por
//    servidor confiável (sem cabeçalho = recusa explicada) e responsável atual da ação (ou Administrador da obra);
//  - só o texto NOVO conta (citação, encaminhamento e assinatura removidos);
//  - comandos: RESOLVIDO (conclui SÓ com foto de evidência anexada — sem foto, pede a foto e nada conclui), EM ANDAMENTO
//    (+ "Previsão: dd/mm/aaaa [hh:mm]"; explícito com previsão faltando/ inválida => pede a previsão, nada grava) e ENVIAR PARA
//    (e-mail exato ou nome único; justificativa >= 5 caracteres para quem não é Administrador);
//  - resposta livre "em andamento / tomando providências" continua valendo como andamento (previsão extraída do corpo:
//    ALTA/CRÍTICA exigem data E horário; MÉDIA/BAIXA aceitam só a data; sem previsão válida => PENDENTE + pedido);
//  - toda gravação passa pelas RPCs *_by_email (mesma regra das RPCs do app); prazos e escalonamentos não mudam;
//  - mensagem mais antiga que a última já processada (fora de ordem) => histórico, sem alterar status/previsão vigente;
//  - mesma mensagem (id do provedor) nunca é processada duas vezes.

import { forwardTargetMessage, resolveForwardTarget, type TargetCandidate, type TargetResolution } from "@/lib/email-replies/member-target";
import { senderAuthenticationMessage, verifySenderAuthentication, type SenderAuthenticationFailure } from "@/lib/email-replies/sender-authentication";
import { parseSpecialistCommand, routeSpecialistByEmail, specialistRequiresHumanReview, SPECIALIST_TEXT, type SpecialistRecord, type SpecialistSeverity } from "@/lib/email-replies/specialist-email";
import { applyForecastPrecision, describeForecastProblem, extractForecastFromText, type ForecastParse } from "@/lib/risk-alerts/forecast";
import { parseOperationalEmailCommand } from "@/lib/risk-alerts/replies/operational-email-command";
import { filterInboundMessage, parseReplyBody, type InboundFilterVerdict, type InboundHeaders } from "@/lib/risk-alerts/replies/reply-pipeline";

export const SSMA_REPLY_ENTITY_TYPE = "SSMA_CORRECTIVE_ACTION";
export const SSMA_REPLY_TOKEN_ISSUED = "SSMA_REPLY_TOKEN_ISSUED";
export const SSMA_REPLY_PROCESSED = "SSMA_REPLY_PROCESSED";
export const SSMA_REPLY_IGNORED = "SSMA_REPLY_IGNORED";
export const SSMA_REPLY_REJECTED = "SSMA_REPLY_REJECTED";
export const SSMA_REPLY_CONFIRMATION_PENDING = "SSMA_REPLY_CONFIRMATION_PENDING";
export const SSMA_REPLY_CONFIRMATION_CLAIMED = "SSMA_REPLY_CONFIRMATION_CLAIMED";
export const SSMA_REPLY_CONFIRMATION_SENT = "SSMA_REPLY_CONFIRMATION_SENT";

export const SSMA_DEFAULT_CORPORATE_DOMAIN = "axion.com.br";

export type SsmaReplyStatus = "IN_PROGRESS" | "CONCLUSION_REPORTED" | "OTHER";
export type SsmaSeverityLevel = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
const SSMA_TO_SPECIALIST_SEVERITY: Record<SsmaSeverityLevel, SpecialistSeverity> = { CRITICA: "CRITICAL", ALTA: "HIGH", MEDIA: "MEDIUM", BAIXA: "LOW" };
export type SsmaReplyCommand = "RESOLVE" | "IN_PROGRESS" | "FORWARD" | "NONE";

const IN_PROGRESS = /\b(em\s+andamento|tomando\s+(as\s+)?provid[êe]ncias?|providenciando|em\s+execu[çc][ãa]o|em\s+tratamento|j[áa]\s+estamos|estamos\s+(tratando|resolvendo|executando|providenciando)|iniciad[oa]s?|iniciamos)\b/i;
const CONCLUSION = /\b(conclu[íi]d[oa]s?|finalizad[oa]s?|resolvid[oa]s?|encerrad[oa]s?)\b/i;
const FORECAST_CUE = /\b(previs[ãa]o|prevista?|at[ée]\s+(o\s+)?dia|concluir(emos)?\s+(em|at[ée])|conclus[ãa]o\s+(em|at[ée]|prevista))\b/i;

export function detectSsmaReplyStatus(cleanText: string): SsmaReplyStatus {
  const text = cleanText.trim();
  if (!text) return "OTHER";
  if (IN_PROGRESS.test(text)) return "IN_PROGRESS";
  // "concluído" sem expressão de previsão: o responsável informa conclusão (tratada como RESOLVIDO: exige a foto de evidência).
  if (CONCLUSION.test(text) && !FORECAST_CUE.test(text)) return "CONCLUSION_REPORTED";
  // Só a previsão (sem a palavra "andamento") também indica tratamento em curso.
  if (FORECAST_CUE.test(text)) return "IN_PROGRESS";
  return "OTHER";
}

export function ssmaStatusLabel(status: SsmaReplyStatus): string {
  if (status === "IN_PROGRESS") return "Em andamento (tomando providências)";
  if (status === "CONCLUSION_REPORTED") return "Conclusão informada por e-mail — a conclusão exige a foto de evidência anexada";
  return "Resposta registrada — andamento não identificado";
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
  name?: string | null;
}

export type SsmaUnauthorizedReason = "SENDER_NOT_CORPORATE" | "SENDER_NOT_MEMBER" | "SENDER_NOT_RESPONSIBLE" | SenderAuthenticationFailure;

export type SsmaReplyDecision =
  // ESPECIALISTA por e-mail: consulta escrita ao Expert ESG/SSMA. NÃO altera a ação corretiva e NÃO consome o token.
  | { kind: "SPECIALIST"; actorUserId: string; isAdmin: boolean; record: SpecialistRecord; statusLabel: string }
  | { kind: "IGNORE"; reason: InboundFilterVerdict | "ALREADY_PROCESSED" | "ACTION_CLOSED" }
  | {
      kind: "UNAUTHORIZED";
      reason: SsmaUnauthorizedReason;
      /** Membro ATIVO conhecido (e-mail exato) que deve receber a explicação; null => recusa silenciosa (auditada). */
      explainTo: string | null;
      explanation: string | null;
    }
  | {
      /** Comando reconhecido mas incompleto/inválido: resposta pedindo o que falta, NADA é gravado na ação. */
      kind: "REJECT";
      actorUserId: string;
      code: string;
      message: string;
      command: SsmaReplyCommand;
    }
  | {
      kind: "PROCESS";
      actorUserId: string;
      isAdmin: boolean;
      command: SsmaReplyCommand;
      status: SsmaReplyStatus;
      statusLabel: string;
      forecast: ForecastParse;
      forecastProblem: string | null;
      tracked: boolean;
      outOfOrder: boolean;
      /** Nova situação da ação corretiva (ABERTA -> EM_ANDAMENTO), quando aplicável (a RPC é quem grava). */
      newActionStatus: "EM_ANDAMENTO" | null;
      /** Resposta válida do responsável (a RPC de andamento registra o "assumir" da ação SLA). */
      acknowledge: boolean;
      cleanText: string;
      note: string;
      /** RESOLVE: nota do remetente (vai com a foto). */
      resolveNote: string | null;
      /** FORWARD: destino resolvido e justificativa. */
      forward: { targetUserId: string; reason: string | null } | null;
    };

const fmtBrt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const UNAUTHORIZED_TEXT: Partial<Record<SsmaUnauthorizedReason, string>> = {
  SENDER_NOT_RESPONSIBLE: "Somente o responsável atual pela ação corretiva ou o Administrador da obra pode registrar andamento, conclusão ou encaminhamento por e-mail. Nada foi alterado.",
};

export function decideSsmaReply(input: {
  message: SsmaReplyMessage;
  target: SsmaReplyTarget;
  members: readonly SsmaReplyMember[];
  accMailboxes: string[];
  processedMessageIds: ReadonlySet<string>;
  corporateDomain?: string;
  trustedAuthservIds?: readonly string[];
  workspaceTenantDomains?: readonly string[];
  /** ACC_EMAIL_SPECIALIST_ENABLED. Ausente/false => "ESPECIALISTA:" é recusado com explicação (nada gravado). */
  specialistEnabled?: boolean;
}): SsmaReplyDecision {
  const { message, target } = input;
  if (input.processedMessageIds.has(message.providerMessageId)) return { kind: "IGNORE", reason: "ALREADY_PROCESSED" };
  const verdict = filterInboundMessage(message.headers, { accMailboxes: input.accMailboxes, seenMessageIds: new Set() });
  if (verdict !== "OK") return { kind: "IGNORE", reason: verdict };
  if (target.actionStatus === "CONCLUIDA") return { kind: "IGNORE", reason: "ACTION_CLOSED" };

  const from = message.headers.from.trim().toLowerCase();
  const domain = (input.corporateDomain ?? SSMA_DEFAULT_CORPORATE_DOMAIN).toLowerCase();
  if (from.split("@")[1] !== domain) return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_CORPORATE", explainTo: null, explanation: null };
  const member = input.members.find((m) => (m.email ?? "").trim().toLowerCase() === from && m.status === "ACTIVE");
  if (!member) return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_MEMBER", explainTo: null, explanation: null };
  const auth = verifySenderAuthentication({ fromEmail: from, authenticationResults: message.headers.authenticationResults ?? null, trustedAuthservIds: input.trustedAuthservIds, workspaceTenantDomains: input.workspaceTenantDomains });
  if (!auth.ok) return { kind: "UNAUTHORIZED", reason: auth.reason, explainTo: member.userId, explanation: senderAuthenticationMessage(auth.reason) };
  const isAdmin = member.permission === "ADMINISTRADOR" || member.permission === "ADMIN";
  if (member.userId !== target.responsibleUserId && !isAdmin) {
    return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_RESPONSIBLE", explainTo: member.userId, explanation: UNAUTHORIZED_TEXT.SENDER_NOT_RESPONSIBLE ?? null };
  }

  const cleanText = parseReplyBody(message.bodyOriginal).clean.slice(0, 4000);
  const parsedCommand = parseOperationalEmailCommand(cleanText);
  const reject = (code: string, text: string, command: SsmaReplyCommand): SsmaReplyDecision => ({ kind: "REJECT", actorUserId: member.userId, code, message: text, command });
  const specialist = parseSpecialistCommand(cleanText);
  if (specialist.reason === "MIXED") return reject("COMMAND_AMBIGUOUS", SPECIALIST_TEXT.MIXED, "NONE");
  if (specialist.reason === "QUESTION_TOO_SHORT") return reject("SPECIALIST_QUESTION_REQUIRED", SPECIALIST_TEXT.QUESTION_TOO_SHORT, "NONE");
  if (specialist.question) {
    if (!input.specialistEnabled) return reject("SPECIALIST_DISABLED", SPECIALIST_TEXT.DISABLED, "NONE");
    const routing = routeSpecialistByEmail({ area: "ESG_SSMA", question: specialist.question });
    if (!routing.ok) return reject(routing.code, SPECIALIST_TEXT.SPECIALIST_AREA_UNKNOWN, "NONE");
    const severity = SSMA_TO_SPECIALIST_SEVERITY[target.severity];
    return {
      kind: "SPECIALIST", actorUserId: member.userId, isAdmin,
      record: { expertId: routing.expertId, routingSource: routing.source, question: specialist.question, area: "ESG_SSMA", severity, requiresHumanReview: specialistRequiresHumanReview(severity) },
      statusLabel: "Pergunta ao especialista registrada (a ação corretiva não foi alterada)",
    };
  }
  if (!parsedCommand.command && parsedCommand.reason) {
    return reject("COMMAND_AMBIGUOUS", `Não foi possível identificar um único comando (${parsedCommand.reason}). Responda com apenas um: RESOLVIDO, EM ANDAMENTO (com "Previsão:") ou ENVIAR PARA.`, "NONE");
  }
  const tracked = ssmaForecastTracked(target.severity);
  const outOfOrder = target.lastProcessedReceivedAt !== null && new Date(message.receivedAt).getTime() < new Date(target.lastProcessedReceivedAt).getTime();
  const base = {
    actorUserId: member.userId,
    isAdmin,
    tracked,
    outOfOrder,
    cleanText,
  };
  const missingForecast: ForecastParse = { status: "MISSING" };

  // ENVIAR PARA
  if (parsedCommand.command?.kind === "FORWARD") {
    const command = parsedCommand.command;
    const candidates: TargetCandidate[] = input.members.map((m) => ({ userId: m.userId, name: m.name ?? null, email: m.email, membershipStatus: m.status, permission: m.permission }));
    const resolution: TargetResolution = resolveForwardTarget({ targetEmail: command.targetEmail, targetName: command.targetName, candidates, senderUserId: member.userId, corporateDomain: domain });
    if (!resolution.ok) return reject(resolution.reason, forwardTargetMessage(resolution.reason), "FORWARD");
    if (resolution.userId === target.responsibleUserId) return reject("SAME_RESPONSIBLE", "O destino informado já é o responsável atual pela ação. Informe outro membro da obra.", "FORWARD");
    const reason = command.instruction.trim() || null;
    if (!isAdmin && (!reason || reason.length < 5)) {
      return reject("FORWARD_REASON_REQUIRED", "Informe a justificativa do encaminhamento (mínimo de 5 caracteres), por exemplo: \"ENVIAR PARA: Nome Completo\" e, na linha seguinte, \"Justificativa: motivo\".", "FORWARD");
    }
    return {
      kind: "PROCESS", ...base, command: "FORWARD", status: "OTHER", statusLabel: "Encaminhada por e-mail ao novo responsável", forecast: missingForecast, forecastProblem: null,
      newActionStatus: null, acknowledge: false, note: `Encaminhada por e-mail. Justificativa: ${reason ?? "não informada (administrador)"}`.slice(0, 2000), resolveNote: null,
      forward: { targetUserId: resolution.userId, reason },
    };
  }

  // RESOLVIDO (comando explícito ou "concluído" na resposta livre): a conclusão depende da FOTO anexada (verificada no worker).
  const freeStatus = parsedCommand.command ? null : detectSsmaReplyStatus(cleanText);
  if (parsedCommand.command?.kind === "RESOLVE" || freeStatus === "CONCLUSION_REPORTED") {
    const resolveNote = parsedCommand.command?.kind === "RESOLVE" ? parsedCommand.command.note.trim() || null : cleanText.trim() || null;
    return {
      kind: "PROCESS", ...base, command: "RESOLVE", status: "CONCLUSION_REPORTED", statusLabel: "Concluída por e-mail com foto de evidência", forecast: missingForecast, forecastProblem: null,
      newActionStatus: null, acknowledge: true, note: (resolveNote ?? "Concluída por e-mail com foto de evidência.").slice(0, 2000), resolveNote, forward: null,
    };
  }

  // EM ANDAMENTO explícito: previsão obrigatória e válida, senão pede (nada grava).
  let status: SsmaReplyStatus;
  let forecast: ForecastParse;
  let command: SsmaReplyCommand = "NONE";
  if (parsedCommand.command?.kind === "IN_PROGRESS") {
    forecast = applyForecastPrecision(extractForecastFromText(`Previsão: ${parsedCommand.command.forecastText}`, message.receivedAt), tracked ? "TRACKED" : "RECORD_ONLY");
    const problems: string[] = [];
    if (forecast.status !== "VALID") problems.push(describeForecastProblem(forecast) ?? "Previsão de conclusão não informada.");
    if (!parsedCommand.command.note) problems.push("Descreva a providência em curso na linha do EM ANDAMENTO.");
    if (problems.length > 0) {
      return reject("IN_PROGRESS_INCOMPLETE", `${problems.join(" ")} Formato: "EM ANDAMENTO: providência" e, na linha seguinte, "Previsão: dd/mm/aaaa${tracked ? " hh:mm" : ""}".`, "IN_PROGRESS");
    }
    status = "IN_PROGRESS";
    command = "IN_PROGRESS";
  } else {
    status = freeStatus ?? "OTHER";
    forecast = status === "IN_PROGRESS" ? applyForecastPrecision(extractForecastFromText(cleanText, message.receivedAt), tracked ? "TRACKED" : "RECORD_ONLY") : missingForecast;
    if (status === "IN_PROGRESS") command = "IN_PROGRESS";
  }
  const forecastProblem = status === "IN_PROGRESS" ? describeForecastProblem(forecast) : null;
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
    ...base,
    command,
    status,
    statusLabel: ssmaStatusLabel(status),
    forecast,
    forecastProblem,
    newActionStatus,
    acknowledge: status !== "OTHER",
    note: note.slice(0, 2000),
    resolveNote: null,
    forward: null,
  };
}

/** Linha da previsão para a confirmação (null => PENDENTE). */
export function confirmationForecastLine(decision: Extract<SsmaReplyDecision, { kind: "PROCESS" }>): string | null {
  if (decision.status !== "IN_PROGRESS") return "não se aplica";
  return decision.forecast.status === "VALID" ? `${fmtBrt(decision.forecast.iso)} (horário de Brasília — America/Sao_Paulo)` : null;
}

export function confirmationPendingLine(decision: Extract<SsmaReplyDecision, { kind: "PROCESS" }>): string | null {
  if (decision.status === "OTHER" && decision.command === "NONE") return "Status não reconhecido: informe se a ação está em andamento e a previsão de conclusão.";
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

/** Erros das RPCs *_by_email => texto da resposta ao remetente (nada gravado). Desconhecido => null (nova tentativa). */
export function ssmaRpcErrorMessage(message: string): { code: string; text: string } | null {
  const known: Array<[string, string]> = [
    ["ACTION_ALREADY_CONCLUDED", "A ação corretiva já está concluída: nada foi alterado."],
    ["ACTION_ACCESS_DENIED", UNAUTHORIZED_TEXT.SENDER_NOT_RESPONSIBLE ?? "Sem permissão para esta ação."],
    ["PROJECT_ACCESS_DENIED", "Você não é membro ativo desta obra: nada foi alterado."],
    ["EVIDENCE_REQUIRED", "A conclusão exige a FOTO de evidência anexada (JPG ou PNG até 15 MB). Responda com RESOLVIDO e a foto anexada."],
    ["EVIDENCE_NOT_FOUND", "A foto de evidência não pôde ser registrada neste registro. Responda novamente com a foto anexada ou conclua pelo ACC."],
    ["PHOTO_LIMIT_EXCEEDED", "O registro já atingiu o limite de 30 fotos. Conclua pelo ACC."],
    ["NOTE_REQUIRED", "Descreva a providência em curso."],
    ["NEW_RESPONSIBLE_NOT_ELIGIBLE", "O destino informado não pode receber a ação (membro ativo da obra, perfil diferente de LEITURA)."],
    ["SAME_RESPONSIBLE", "O destino informado já é o responsável atual pela ação."],
    ["FORWARD_REASON_REQUIRED", "Informe a justificativa do encaminhamento (mínimo de 5 caracteres)."],
  ];
  const hit = known.find(([code]) => message.includes(code));
  return hit ? { code: hit[0], text: hit[1] } : null;
}
