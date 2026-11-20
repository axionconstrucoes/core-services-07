// Respostas por e-mail com token POR ITEM dos tipos SLA_ACTION, WEEKLY_DIGEST_ITEM e CONTRACT_ALERT_ITEM — PURO, sem I/O.
//
// Decide o que fazer com UMA mensagem já correlacionada ao item pelo token (email_reply_tokens). A gravação é SEMPRE feita
// depois, pelo worker, nas RPCs *_by_email (mesma regra do app no banco); esta camada só antecipa recusas com mensagens
// claras de complementação e nunca grava nada.
//
// Regras:
//  - autoresposta / bounce / mensagem do próprio ACC / loop => ignorada (auditada), sem resposta;
//  - remetente: domínio corporativo, perfil com o e-mail EXATO do From, membro ATIVO da obra, DMARC/DKIM alinhado registrado
//    por servidor confiável (sem cabeçalho = recusa explicada), perfil diferente de LEITURA e quem pode agir no item
//    (responsável da ação SLA / destinatário do resumo ou do lote) ou ADMINISTRADOR da obra;
//  - só o texto NOVO conta (citação, encaminhamento e assinatura removidos; textos-guia do mailto removidos);
//  - SÓ comandos explícitos (sem classificação livre): RESOLVIDO <descrição>, EM ANDAMENTO <providência> + "Previsão:",
//    ENVIAR PARA <e-mail | nome completo> + justificativa;
//  - incompleto => REJECT com o que falta (descrição, providência, previsão, destino, justificativa); nada é gravado;
//  - evidência (anexo) obrigatória no RESOLVIDO de ação SLA ALTO/CRÍTICO — conferida pelo worker após guardar os anexos.

import { forwardTargetMessage, resolveForwardTarget, type TargetCandidate } from "@/lib/email-replies/member-target";
import { senderAuthenticationMessage, verifySenderAuthentication, type SenderAuthenticationFailure } from "@/lib/email-replies/sender-authentication";
import type { EmailReplySubjectKind } from "@/lib/email-replies/reply-tokens";
import { applyForecastPrecision, describeForecastProblem, extractForecastFromText, type ForecastParse } from "@/lib/risk-alerts/forecast";
import { parseOperationalEmailCommand } from "@/lib/risk-alerts/replies/operational-email-command";
import { filterInboundMessage, parseReplyBody, type InboundFilterVerdict, type InboundHeaders } from "@/lib/risk-alerts/replies/reply-pipeline";

export type TokenReplyKind = Extract<EmailReplySubjectKind, "SLA_ACTION" | "WEEKLY_DIGEST_ITEM" | "CONTRACT_ALERT_ITEM">;
export const TOKEN_REPLY_KINDS: readonly TokenReplyKind[] = ["SLA_ACTION", "WEEKLY_DIGEST_ITEM", "CONTRACT_ALERT_ITEM"];

export type TokenReplyCommand = "RESOLVE" | "IN_PROGRESS" | "FORWARD";
export type TokenReplySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const TOKEN_REPLY_DEFAULT_CORPORATE_DOMAIN = "axion.com.br";
export const MIN_RESOLVE_NOTE = 10;
export const MIN_FORWARD_REASON = 5;

export interface TokenReplyMessage {
  providerMessageId: string;
  headers: InboundHeaders;
  bodyOriginal: string;
  receivedAt: string;
}

export interface TokenReplyTarget {
  kind: TokenReplyKind;
  subjectId: string;
  projectId: string;
  /** Quem pode agir pelo item (responsável da ação SLA; destinatário do resumo/lote). Administrador sempre pode. */
  actorUserIds: readonly string[];
  /** Item já encerrado (ação concluída/cancelada, item do resumo já respondido, lote respondido): nada a fazer. */
  closed: boolean;
  closedReason?: string | null;
  severity: TokenReplySeverity;
  /** Responsável atual (destino igual a ele é recusado no ENVIAR PARA). */
  currentResponsibleUserId: string | null;
  /** RESOLVIDO exige anexo de evidência (ação SLA ALTO/CRÍTICO). */
  evidenceRequired: boolean;
}

export interface TokenReplyMember {
  userId: string;
  email: string | null;
  name?: string | null;
  status: string;
  permission: string;
}

export type TokenReplyUnauthorizedReason = "SENDER_NOT_CORPORATE" | "SENDER_NOT_MEMBER" | "SENDER_READ_ONLY" | "SENDER_NOT_ALLOWED" | SenderAuthenticationFailure;

export type TokenReplyDecision =
  | { kind: "IGNORE"; reason: InboundFilterVerdict | "ALREADY_PROCESSED" }
  | { kind: "UNAUTHORIZED"; reason: TokenReplyUnauthorizedReason; explainTo: string | null; explanation: string | null }
  | { kind: "REJECT"; actorUserId: string; code: string; message: string; command: TokenReplyCommand | "NONE" }
  | {
      kind: "PROCESS";
      actorUserId: string;
      isAdmin: boolean;
      command: TokenReplyCommand;
      /** Texto gravado (descrição do RESOLVIDO, providência + previsão do EM ANDAMENTO, justificativa do ENVIAR PARA). */
      note: string | null;
      forecast: ForecastParse;
      forward: { targetUserId: string; reason: string | null } | null;
      evidenceRequired: boolean;
      statusLabel: string;
    };

export const TOKEN_REPLY_KIND_LABEL: Record<TokenReplyKind, string> = {
  SLA_ACTION: "ação de SLA",
  WEEKLY_DIGEST_ITEM: "item do resumo semanal",
  CONTRACT_ALERT_ITEM: "alerta de contrato",
};

const NOT_ALLOWED_TEXT: Record<TokenReplyKind, string> = {
  SLA_ACTION: "Somente o responsável atual pela ação ou o Administrador da obra pode registrar andamento, conclusão ou encaminhamento por e-mail. Nada foi alterado.",
  WEEKLY_DIGEST_ITEM: "Somente o destinatário do resumo semanal (responsável pelas ações) ou o Administrador da obra pode responder por e-mail. Nada foi alterado.",
  CONTRACT_ALERT_ITEM: "Somente o destinatário do alerta de contrato ou o Administrador da obra pode responder por e-mail. Nada foi alterado.",
};

const fmtBrt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function tokenReplyForecastTracked(severity: TokenReplySeverity): boolean {
  return severity === "CRITICAL" || severity === "HIGH";
}

const IN_PROGRESS_START = /^\s*em\s+andamento\b/i;

export function decideTokenReply(input: {
  message: TokenReplyMessage;
  target: TokenReplyTarget;
  members: readonly TokenReplyMember[];
  accMailboxes: string[];
  processedMessageIds: ReadonlySet<string>;
  corporateDomain?: string;
  trustedAuthservIds?: readonly string[];
  workspaceTenantDomains?: readonly string[];
}): TokenReplyDecision {
  const { message, target } = input;
  if (input.processedMessageIds.has(message.providerMessageId)) return { kind: "IGNORE", reason: "ALREADY_PROCESSED" };
  const verdict = filterInboundMessage(message.headers, { accMailboxes: input.accMailboxes, seenMessageIds: new Set() });
  if (verdict !== "OK") return { kind: "IGNORE", reason: verdict };

  const from = message.headers.from.trim().toLowerCase();
  const domain = (input.corporateDomain ?? TOKEN_REPLY_DEFAULT_CORPORATE_DOMAIN).toLowerCase();
  if (from.split("@")[1] !== domain) return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_CORPORATE", explainTo: null, explanation: null };
  const member = input.members.find((m) => (m.email ?? "").trim().toLowerCase() === from && m.status === "ACTIVE");
  if (!member) return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_MEMBER", explainTo: null, explanation: null };
  const auth = verifySenderAuthentication({ fromEmail: from, authenticationResults: message.headers.authenticationResults ?? null, trustedAuthservIds: input.trustedAuthservIds, workspaceTenantDomains: input.workspaceTenantDomains });
  if (!auth.ok) return { kind: "UNAUTHORIZED", reason: auth.reason, explainTo: member.userId, explanation: senderAuthenticationMessage(auth.reason) };
  const permission = (member.permission ?? "").toUpperCase();
  if (permission === "LEITURA" || permission === "VIEWER") {
    return { kind: "UNAUTHORIZED", reason: "SENDER_READ_ONLY", explainTo: member.userId, explanation: "Seu perfil nesta obra é somente leitura: comandos por e-mail não são aceitos. Nada foi alterado." };
  }
  const isAdmin = permission === "ADMINISTRADOR" || permission === "ADMIN";
  if (!isAdmin && !target.actorUserIds.includes(member.userId)) {
    return { kind: "UNAUTHORIZED", reason: "SENDER_NOT_ALLOWED", explainTo: member.userId, explanation: NOT_ALLOWED_TEXT[target.kind] };
  }

  const reject = (code: string, text: string, command: TokenReplyCommand | "NONE"): TokenReplyDecision => ({ kind: "REJECT", actorUserId: member.userId, code, message: text, command });
  if (target.closed) {
    return reject("ITEM_CLOSED", target.closedReason ?? `Este ${TOKEN_REPLY_KIND_LABEL[target.kind]} já foi encerrado ou respondido: nada foi alterado.`, "NONE");
  }

  const cleanText = parseReplyBody(message.bodyOriginal).clean.slice(0, 4000);
  const parsed = parseOperationalEmailCommand(cleanText);
  const tracked = tokenReplyForecastTracked(target.severity);
  const forecastFormat = `"Previsão: dd/mm/aaaa${tracked ? " hh:mm" : ""}"`;
  const missing: ForecastParse = { status: "MISSING" };

  if (!parsed.command) {
    if (parsed.reason) {
      return reject("COMMAND_AMBIGUOUS", `Não foi possível identificar um único comando (${parsed.reason}). Responda com apenas um: RESOLVIDO (com a descrição), EM ANDAMENTO (com a providência e ${forecastFormat}) ou ENVIAR PARA (destino e justificativa).`, "NONE");
    }
    // "EM ANDAMENTO" sem a linha "Previsão:" não é o comando completo: pede a previsão.
    const firstLine = cleanText.split(/\r?\n/).find((l) => l.trim()) ?? "";
    if (IN_PROGRESS_START.test(firstLine)) {
      return reject("FORECAST_REQUIRED", `Informe a previsão de conclusão na linha seguinte ao EM ANDAMENTO: ${forecastFormat}. Nada foi alterado.`, "IN_PROGRESS");
    }
    return reject("COMMAND_NOT_RECOGNIZED", `Nenhum comando reconhecido. Use os atalhos "Responder por e-mail" do alerta ou escreva, na primeira linha: RESOLVIDO: <o que foi feito> | EM ANDAMENTO: <providência> (e ${forecastFormat}) | ENVIAR PARA: <nome completo ou e-mail> (e "Justificativa: ..."). Nada foi alterado.`, "NONE");
  }

  const command = parsed.command;
  if (command.kind === "FORWARD") {
    const candidates: TargetCandidate[] = input.members.map((m) => ({ userId: m.userId, name: m.name ?? null, email: m.email, membershipStatus: m.status, permission: m.permission }));
    const resolution = resolveForwardTarget({ targetEmail: command.targetEmail, targetName: command.targetName, candidates, senderUserId: member.userId, corporateDomain: domain });
    if (!resolution.ok) return reject(resolution.reason, forwardTargetMessage(resolution.reason), "FORWARD");
    if (resolution.userId === target.currentResponsibleUserId) return reject("SAME_RESPONSIBLE", "O destino informado já é o responsável atual. Informe outro membro da obra.", "FORWARD");
    const reason = command.instruction.trim() || null;
    if (!isAdmin && (!reason || reason.length < MIN_FORWARD_REASON)) {
      return reject("FORWARD_REASON_REQUIRED", `Informe a justificativa do encaminhamento (mínimo de ${MIN_FORWARD_REASON} caracteres): "ENVIAR PARA: Nome Completo" e, na linha seguinte, "Justificativa: motivo".`, "FORWARD");
    }
    return { kind: "PROCESS", actorUserId: member.userId, isAdmin, command: "FORWARD", note: reason, forecast: missing, forward: { targetUserId: resolution.userId, reason }, evidenceRequired: false, statusLabel: "Encaminhado por e-mail ao novo responsável" };
  }

  if (command.kind === "RESOLVE") {
    const note = command.note.trim();
    if (note.length < MIN_RESOLVE_NOTE) {
      return reject("RESOLVE_DESCRIPTION_REQUIRED", `Descreva o que foi feito (mínimo de ${MIN_RESOLVE_NOTE} caracteres) na linha do RESOLVIDO, por exemplo: "RESOLVIDO: pagamento conferido e liberado".${target.evidenceRequired ? " Este item é de risco ALTO/CRÍTICO: anexe também a evidência." : ""} Nada foi alterado.`, "RESOLVE");
    }
    return { kind: "PROCESS", actorUserId: member.userId, isAdmin, command: "RESOLVE", note: note.slice(0, 2000), forecast: missing, forward: null, evidenceRequired: target.evidenceRequired, statusLabel: "Resolvido por e-mail" };
  }

  // EM ANDAMENTO explícito: providência + previsão válida (ALTO/CRÍTICO com horário).
  const forecast = applyForecastPrecision(extractForecastFromText(`Previsão: ${command.forecastText}`, message.receivedAt), tracked ? "TRACKED" : "RECORD_ONLY");
  const problems: string[] = [];
  if (!command.note.trim()) problems.push("Descreva a providência em curso na linha do EM ANDAMENTO.");
  if (forecast.status !== "VALID") problems.push(describeForecastProblem(forecast) ?? "Previsão de conclusão não informada.");
  if (problems.length > 0) {
    return reject("IN_PROGRESS_INCOMPLETE", `${problems.join(" ")} Formato: "EM ANDAMENTO: providência" e, na linha seguinte, ${forecastFormat}. Nada foi alterado.`, "IN_PROGRESS");
  }
  const forecastIso = (forecast as Extract<ForecastParse, { status: "VALID" }>).iso;
  const note = `${command.note.trim()} — Previsão de conclusão informada: ${fmtBrt(forecastIso)} (horário de Brasília; não altera prazos nem escalonamento)`.slice(0, 2000);
  return { kind: "PROCESS", actorUserId: member.userId, isAdmin, command: "IN_PROGRESS", note, forecast, forward: null, evidenceRequired: false, statusLabel: "Em andamento (providência registrada por e-mail)" };
}

/** Erros das RPCs *_by_email => texto ao remetente (nada gravado). Desconhecido => null (nova tentativa na próxima rodada). */
export function tokenReplyRpcErrorMessage(message: string): { code: string; text: string } | null {
  const known: Array<[string, string, string?]> = [
    ["MESSAGE_ALREADY_APPLIED", "Esta mensagem já foi registrada anteriormente."],
    ["ACTION_CLOSED", "A ação já está concluída ou cancelada: nada foi alterado."],
    ["ACTION_ACCESS_DENIED", NOT_ALLOWED_TEXT.SLA_ACTION],
    ["PROJECT_ACCESS_DENIED", "Você não é membro ativo desta obra: nada foi alterado."],
    ["READ_ONLY_PROFILE", "Seu perfil nesta obra é somente leitura: nada foi alterado."],
    ["RISK_CASE_LINKED", "Esta ação pertence a um alerta de risco: responda pelo e-mail do alerta ou registre pela página do alerta. Nada foi alterado."],
    ["SSMA_ACTION_USE_SSMA_CHANNEL", "Esta é uma ação corretiva SSMA: responda pelo aviso SSMA (com a foto) ou registre no app SSMA. Nada foi alterado."],
    ["EVIDENCE_REQUIRED", "Este item é de risco ALTO/CRÍTICO: a conclusão exige a evidência ANEXADA à resposta (arquivo ou foto). Responda com RESOLVIDO, a descrição e o anexo. Nada foi alterado."],
    ["COMPLETION_NOTE_REQUIRED", `Descreva o que foi feito (mínimo de ${MIN_RESOLVE_NOTE} caracteres). Nada foi alterado.`],
    ["NOTE_REQUIRED", "Descreva a providência em curso. Nada foi alterado."],
    ["NEW_RESPONSIBLE_NOT_ELIGIBLE", "O destino informado não pode receber o item (membro ativo da obra, perfil diferente de LEITURA). Nada foi alterado."],
    ["SAME_RESPONSIBLE", "O destino informado já é o responsável atual. Nada foi alterado."],
    ["FORWARD_REASON_REQUIRED", `Informe a justificativa do encaminhamento (mínimo de ${MIN_FORWARD_REASON} caracteres). Nada foi alterado.`],
    ["ITEM_ALREADY_RESPONDED", "Este item do resumo semanal já foi respondido: nada foi alterado."],
    ["Este resumo semanal já foi respondido", "Este resumo semanal já foi respondido: nada foi alterado."],
    ["Este lote de alertas já foi respondido", "A resposta final deste lote de alertas já foi enviada: nada foi alterado."],
    ["Você não tem permissão para responder", "Somente o destinatário ou o Administrador da obra pode responder. Nada foi alterado."],
    ["agora está sob responsabilidade de outra pessoa", "Este item agora está sob responsabilidade de outra pessoa; a resposta não foi registrada."],
    ["é uma ação corretiva SSMA", "Este item é uma ação corretiva SSMA: registre no app SSMA (com a evidência). Nada foi alterado."],
    ["pertence a um alerta de risco", "Este item pertence a um alerta de risco: registre pela página do alerta. Nada foi alterado."],
    ["Descreva o que foi feito", `Descreva o que foi feito (mínimo de ${MIN_RESOLVE_NOTE} caracteres). Nada foi alterado.`],
    ["exige evidência da resolução", "Este item é de risco ALTO/CRÍTICO e exige evidência anexada. Nada foi alterado."],
    ["Informe o motivo do direcionamento", `Informe a justificativa do encaminhamento (mínimo de ${MIN_FORWARD_REASON} caracteres). Nada foi alterado.`],
    ["já está sob responsabilidade da pessoa selecionada", "O destino informado já é o responsável atual. Nada foi alterado."],
    ["Selecione um usuário ativo", "O destino informado não pode receber o item (membro ativo da obra, perfil diferente de LEITURA). Nada foi alterado."],
    ["Selecione um colaborador ativo", "O destino informado não é colaborador ativo da obra. Nada foi alterado."],
    ["ainda não está disponível para resposta", "Este e-mail ainda não está disponível para resposta. Nada foi alterado."],
  ];
  const hit = known.find(([needle]) => message.includes(needle));
  if (!hit) return null;
  const code = /^[A-Z_]+$/.test(hit[0]) ? hit[0] : "RULE_REJECTED";
  return { code, text: hit[1] };
}

/** Linha "próximo passo"/pendência da confirmação. */
export function tokenReplyConfirmationLine(decision: Extract<TokenReplyDecision, { kind: "PROCESS" }>, target: TokenReplyTarget): string | null {
  if (decision.command === "IN_PROGRESS") return decision.note;
  if (decision.command === "FORWARD") return `Encaminhado. Justificativa: ${decision.forward?.reason ?? "não informada (administrador)"}. Prazos e escalonamento não mudam.`;
  if (target.kind === "CONTRACT_ALERT_ITEM") return "Resposta registrada neste alerta. A resposta final do lote (RESPONDER AO ACC) continua pela página do ACC.";
  return null;
}
