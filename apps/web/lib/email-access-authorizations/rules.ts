// Regras PURAS da autorização individual de acesso ao e-mail corporativo. Sem React, sem rede, sem banco.

import { createHash } from "node:crypto";
import {
  EMAIL_ACCESS_TEXT_VERSION,
  type ConsentStatus,
  type EmailAccessAuthorization,
  type OriginalReply,
  type ReplyClassification,
} from "./types";

export const DEFAULT_REQUEST_VALIDITY_DAYS = 15;
export const DEFAULT_ACCESS_DURATION_DAYS = 90;
const DAY_MS = 86_400_000;

export function normalizeEmail(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase();
}

export function normalizeMessageId(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^<|>$/g, "").trim().toLowerCase();
}

export function hashReplyBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Mantém só o texto NOVO da resposta: remove citações (">") e tudo após o cabeçalho da mensagem original. */
export function extractNewReplyText(body: string): string {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^-{2,}\s*(original message|mensagem original|forwarded)/i.test(t)) break;
    if (/^(em|on)\s.+(escreveu|wrote):?$/i.test(t)) break;
    if (/^(de|from|enviado em|sent):\s/i.test(t) && out.some((l) => l.trim())) break;
    if (t.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

const NEGATIVE = /(^|[^a-z])(nao\s+(autorizo|concordo|aceito|permito|quero)|recuso|nego)(?![a-z])/;
const POSITIVE = /(^|[^a-z])autorizo(?![a-z])/;
const HEDGE = /\?|\b(mas|porem|contudo|desde que|talvez|duvida|depende|antes de|caso|somente se|apenas se|se)\b/;

export interface ReplyClassificationResult {
  result: ReplyClassification;
  reason: string;
}

/**
 * Interpreta a resposta. Só vale resposta EXPLÍCITA e curta: "Autorizo" ou "Não autorizo".
 * Qualquer ambiguidade (ambos os termos, condição, pergunta, texto longo, silêncio) => PENDENTE_REVISAO,
 * que NUNCA é aceite. Recusa explícita prevalece sobre ressalvas.
 */
export function classifyReply(body: string): ReplyClassificationResult {
  const text = fold(extractNewReplyText(body ?? ""));
  if (!text) return { result: "PENDENTE_REVISAO", reason: "resposta vazia" };
  const neg = NEGATIVE.test(text);
  const withoutNeg = text.replace(new RegExp(NEGATIVE.source, "g"), " ");
  const pos = POSITIVE.test(withoutNeg);
  if (neg && pos) return { result: "PENDENTE_REVISAO", reason: "resposta contém autorização e recusa" };
  if (neg) return { result: "NAO_AUTORIZO", reason: "recusa explícita" };
  if (!pos) return { result: "PENDENTE_REVISAO", reason: "sem resposta explícita" };
  if (text.length > 400) return { result: "PENDENTE_REVISAO", reason: "texto longo demais para aceite explícito" };
  if (HEDGE.test(text)) return { result: "PENDENTE_REVISAO", reason: "autorização condicionada ou com dúvida" };
  return { result: "AUTORIZO", reason: "autorização explícita" };
}

export interface IncomingReply {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
}

export interface LinkResult {
  linked: boolean;
  reason: string;
}

/** A resposta só vale se (a) referencia a solicitação por In-Reply-To/References E (b) vem do próprio colaborador. */
export function linkReplyToRequest(
  auth: Pick<EmailAccessAuthorization, "requestMessageId" | "collaboratorEmail">,
  reply: IncomingReply
): LinkResult {
  const req = normalizeMessageId(auth.requestMessageId);
  if (!req) return { linked: false, reason: "solicitação sem Message-ID" };
  const refs = [reply.inReplyTo, ...reply.references].map(normalizeMessageId).filter(Boolean);
  if (!refs.includes(req)) return { linked: false, reason: "resposta não referencia a solicitação original" };
  if (normalizeEmail(reply.fromEmail) !== normalizeEmail(auth.collaboratorEmail)) {
    return { linked: false, reason: "remetente diferente do colaborador" };
  }
  return { linked: true, reason: "vinculada por Message-ID e remetente" };
}

export function computeRequestExpiry(requestedAt: string, days = DEFAULT_REQUEST_VALIDITY_DAYS): string {
  return new Date(Date.parse(requestedAt) + days * DAY_MS).toISOString();
}

export function computeAccessExpiry(acceptedAt: string, days = DEFAULT_ACCESS_DURATION_DAYS): string {
  return new Date(Date.parse(acceptedAt) + days * DAY_MS).toISOString();
}

export function createRequest(input: {
  id: string;
  collaboratorEmail: string;
  mailbox: string;
  purpose: string;
  folders?: string[];
  requestMessageId: string;
  requestedAt: string;
  accessDurationDays?: number;
  requestValidityDays?: number;
  textVersion?: string;
}): EmailAccessAuthorization {
  return {
    id: input.id,
    collaboratorEmail: normalizeEmail(input.collaboratorEmail),
    mailbox: normalizeEmail(input.mailbox),
    folders: input.folders ?? [],
    purpose: input.purpose,
    textVersion: input.textVersion ?? EMAIL_ACCESS_TEXT_VERSION,
    requestMessageId: input.requestMessageId,
    requestedAt: input.requestedAt,
    requestExpiresAt: computeRequestExpiry(input.requestedAt, input.requestValidityDays),
    accessDurationDays: input.accessDurationDays ?? DEFAULT_ACCESS_DURATION_DAYS,
    consentStatus: "SOLICITADA",
    technicalAuthorization: "NENHUMA",
    acceptedAt: null,
    accessExpiresAt: null,
    revokedAt: null,
    revokedReason: null,
    acceptedReply: null,
    pendingReviewReplies: [],
  };
}

/** Status efetivo em `now` (expiração é derivada, não depende de job). Revogada prevalece. */
export function effectiveStatus(a: EmailAccessAuthorization, now: Date): ConsentStatus {
  if (a.revokedAt) return "REVOGADA";
  if (a.consentStatus === "SOLICITADA" && now.getTime() > Date.parse(a.requestExpiresAt)) return "EXPIRADA";
  if (a.consentStatus === "ACEITE_REGISTRADO" && a.accessExpiresAt && now.getTime() > Date.parse(a.accessExpiresAt)) {
    return "EXPIRADA";
  }
  return a.consentStatus;
}

/**
 * Aplica uma resposta recebida. Retorna NOVO objeto (não muta). Só altera o estado quando a resposta está vinculada,
 * é explícita e a solicitação ainda está SOLICITADA e dentro do prazo. Em qualquer outro caso a resposta é preservada
 * para revisão humana e o estado não muda.
 */
export function applyReply(
  a: EmailAccessAuthorization,
  reply: IncomingReply & { receivedAt: string; body: string }
): EmailAccessAuthorization {
  const now = new Date(reply.receivedAt);
  const link = linkReplyToRequest(a, reply);
  const cls = classifyReply(reply.body);
  const original: OriginalReply = {
    messageId: reply.messageId,
    inReplyTo: reply.inReplyTo,
    references: [...reply.references],
    fromEmail: reply.fromEmail,
    receivedAt: reply.receivedAt,
    bodyHash: hashReplyBody(reply.body),
    classification: cls.result,
    linkedToRequest: link.linked,
    linkReason: link.linked ? cls.reason : link.reason,
  };
  const keepForReview = { ...a, pendingReviewReplies: [...a.pendingReviewReplies, original] };
  if (!link.linked || cls.result === "PENDENTE_REVISAO") return keepForReview;
  if (effectiveStatus(a, now) !== "SOLICITADA") return keepForReview;
  if (cls.result === "NAO_AUTORIZO") {
    return { ...a, consentStatus: "RECUSADA", acceptedReply: original };
  }
  const acceptedAt = now.toISOString();
  return {
    ...a,
    consentStatus: "ACEITE_REGISTRADO",
    acceptedAt,
    accessExpiresAt: computeAccessExpiry(acceptedAt, a.accessDurationDays),
    acceptedReply: original,
  };
}

/** Confirmação técnica (OAuth) feita por Administrador/colaborador. Não cria aceite. */
export function confirmTechnicalAuthorization(a: EmailAccessAuthorization): EmailAccessAuthorization {
  return { ...a, technicalAuthorization: "OAUTH_CONFIRMADA" };
}

export function revoke(a: EmailAccessAuthorization, at: string, reason: string): EmailAccessAuthorization {
  if (a.revokedAt) return a;
  return { ...a, consentStatus: "REVOGADA", revokedAt: at, revokedReason: reason };
}

/** Coleta só com aceite registrado E autorização técnica confirmada E não revogada/expirada. */
export function canCollect(a: EmailAccessAuthorization, now: Date): boolean {
  if (a.revokedAt) return false;
  if (a.consentStatus !== "ACEITE_REGISTRADO") return false;
  if (a.technicalAuthorization !== "OAUTH_CONFIRMADA") return false;
  if (!a.acceptedAt || now.getTime() < Date.parse(a.acceptedAt)) return false;
  return effectiveStatus(a, now) === "ACEITE_REGISTRADO";
}
