// ESPECIALISTA por e-mail — gravação, resposta do Expert e entrega ao remetente. Sem "server-only": o worker (Node) grava e a
// aplicação (ou o worker) responde/entrega, sempre com service_role.
//
// Fluxo: (1) o worker decide (specialist-email.ts / decideTokenReply) e chama recordSpecialistConsultation -> RPC
// email_specialist_consult_record (membro ATIVO, não LEITURA, idempotente por mensagem; NÃO altera o item de origem);
// (2) answerPendingSpecialistConsultations chama o Expert da área (reserva de limite de IA na fronteira do provedor, tipo
// RISK_CYCLE; sem reserva a IA não é chamada) e conclui via email_specialist_consult_complete; (3) deliverSpecialistMails envia
// o recibo ("pergunta registrada") e a resposta (recomendação, revisão humana) na MESMA conversa do remetente, uma vez cada.
// A AXIA nunca participa: o Expert vem de TopicExpertId/ExpertId oficiais.

import type { EmailProvider } from "@/lib/email/email-provider";
import { buildSpecialistAnswerText, SPECIALIST_EXPERT_LABEL, SPECIALIST_TEXT, type SpecialistExpertId, type SpecialistRecord } from "@/lib/email-replies/specialist-email";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLike = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data?: any; error?: { message?: string } | null }> };
/* eslint-enable @typescript-eslint/no-explicit-any */

export const MAX_SPECIALIST_ANSWER_ATTEMPTS = 3;
export const MAX_SPECIALIST_MAIL_ATTEMPTS = 5;

export interface RecordSpecialistInput {
  actorUserId: string;
  projectId: string;
  flow: "RISK" | "SSMA" | "TOKEN";
  subjectKind: "RISK_CASE" | "SSMA_ACTION" | "SLA_ACTION" | "WEEKLY_DIGEST_ITEM" | "CONTRACT_ALERT_ITEM";
  subjectId: string;
  providerMessageId: string;
  record: SpecialistRecord;
  recipientEmail: string;
  inReplyTo: string | null;
  references: string[];
  originalSubject: string | null;
}

export type RecordSpecialistResult = { ok: true; id: string } | { ok: false; code: string; text: string };

const RECORD_ERRORS: Array<[string, string, string]> = [
  ["MESSAGE_ALREADY_APPLIED", "MESSAGE_ALREADY_APPLIED", "Esta mensagem já foi registrada anteriormente."],
  ["PROJECT_ACCESS_DENIED", "PROJECT_ACCESS_DENIED", "Você não é membro ativo desta obra: nada foi alterado."],
  ["READ_ONLY_PROFILE", "READ_ONLY_PROFILE", "Seu perfil nesta obra é somente leitura: consultas por e-mail não são aceitas. Nada foi alterado."],
  ["QUESTION_REQUIRED", "QUESTION_REQUIRED", SPECIALIST_TEXT.QUESTION_TOO_SHORT],
];

export async function recordSpecialistConsultation(client: SupabaseLike, input: RecordSpecialistInput): Promise<RecordSpecialistResult> {
  const { data, error } = await client.rpc("email_specialist_consult_record", {
    p_actor_user_id: input.actorUserId,
    p_project_id: input.projectId,
    p_flow: input.flow,
    p_subject_kind: input.subjectKind,
    p_subject_id: input.subjectId,
    p_provider_message_id: input.providerMessageId,
    p_area: input.record.area,
    p_severity: input.record.severity,
    p_expert_id: input.record.expertId,
    p_routing_source: input.record.routingSource,
    p_question: input.record.question,
    p_requires_human_review: input.record.requiresHumanReview,
    p_recipient_email: input.recipientEmail,
    p_in_reply_to: input.inReplyTo,
    p_references: input.references.slice(-20).join(" ") || null,
    p_original_subject: input.originalSubject,
  });
  // supabase-js devolve o uuid escalar; adaptadores de teste devolvem [{ coluna: uuid }].
  const id = typeof data === "string" ? data : Array.isArray(data) && data[0] && typeof data[0] === "object" ? String(Object.values(data[0])[0] ?? "") : "";
  if (!error && id) return { ok: true, id };
  const message = String(error?.message ?? "");
  const hit = RECORD_ERRORS.find(([needle]) => message.includes(needle));
  return { ok: false, code: hit?.[1] ?? "SPECIALIST_RECORD_FAILED", text: hit?.[2] ?? "Não foi possível registrar a consulta agora. Nada foi alterado." };
}

// ---------------------------------------------------------------- resposta do Expert

export interface SpecialistConsultant {
  answer(input: { expertId: SpecialistExpertId; projectId: string; question: string; askedByUserId: string | null; subjectId: string }): Promise<{ answerText: string; confidence: number; requiresHumanReview: true }>;
}

export interface AnswerSummary {
  pending: number;
  answered: number;
  quotaBlocked: number;
  failed: number;
  retry: number;
  skipped: number;
}

const QUOTA_PATTERN = /limite|AI_CONSULT_/i;

export async function answerPendingSpecialistConsultations(input: { client: SupabaseLike; consultant: SpecialistConsultant; limit?: number }): Promise<AnswerSummary> {
  const { data, error } = await input.client
    .from("email_specialist_consultations")
    .select("id,project_id,subject_id,requested_by_user_id,expert_id,question,answer_attempts")
    .eq("status", "RECEIVED")
    .lt("answer_attempts", MAX_SPECIALIST_ANSWER_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(input.limit ?? 10);
  if (error) throw new Error("Falha ao ler as consultas ao especialista.");
  const rows = (data ?? []) as Array<{ id: string; project_id: string; subject_id: string; requested_by_user_id: string; expert_id: SpecialistExpertId; question: string; answer_attempts: number }>;
  const summary: AnswerSummary = { pending: rows.length, answered: 0, quotaBlocked: 0, failed: 0, retry: 0, skipped: 0 };
  for (const row of rows) {
    // Reivindicação otimista (duas execuções simultâneas não chamam a IA duas vezes).
    const { data: claimed } = await input.client
      .from("email_specialist_consultations")
      .update({ answer_attempts: row.answer_attempts + 1, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("answer_attempts", row.answer_attempts)
      .eq("status", "RECEIVED")
      .select("id");
    if ((claimed ?? []).length !== 1) {
      summary.skipped += 1;
      continue;
    }
    try {
      const answer = await input.consultant.answer({ expertId: row.expert_id, projectId: row.project_id, question: row.question, askedByUserId: row.requested_by_user_id, subjectId: row.subject_id });
      const done = await input.client.rpc("email_specialist_consult_complete", { p_consultation_id: row.id, p_status: "ANSWERED", p_answer_text: answer.answerText, p_answer_confidence: Math.min(1, Math.max(0, answer.confidence)) });
      if (done.error) throw new Error("complete");
      summary.answered += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const finalAttempt = row.answer_attempts + 1 >= MAX_SPECIALIST_ANSWER_ATTEMPTS;
      if (QUOTA_PATTERN.test(message)) {
        await input.client.rpc("email_specialist_consult_complete", { p_consultation_id: row.id, p_status: "QUOTA_BLOCKED", p_answer_text: null, p_answer_confidence: null });
        summary.quotaBlocked += 1;
      } else if (finalAttempt) {
        await input.client.rpc("email_specialist_consult_complete", { p_consultation_id: row.id, p_status: "FAILED", p_answer_text: null, p_answer_confidence: null });
        summary.failed += 1;
      } else {
        summary.retry += 1; // nova tentativa na próxima rodada; nada enviado ao remetente ainda
      }
    }
  }
  return summary;
}

// ---------------------------------------------------------------- entrega

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface SpecialistMailRow {
  id: string;
  project_id: string;
  expert_id: SpecialistExpertId;
  status: "RECEIVED" | "ANSWERED" | "QUOTA_BLOCKED" | "FAILED";
  requires_human_review: boolean;
  answer_text: string | null;
  answer_confidence: number | null;
  recipient_email: string;
  in_reply_to: string | null;
  references_header: string | null;
  original_subject: string | null;
}

function baseSubject(row: Pick<SpecialistMailRow, "original_subject">): string {
  const base = (row.original_subject ?? "").replace(/^\s*(re|res|enc|fw|fwd)\s*:\s*/i, "").trim() || "Consulta ao especialista — ACC";
  return `Re: ${base}`.slice(0, 200);
}

function wrap(lines: string[]): { text: string; html: string } {
  return { text: lines.join("\n"), html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111827;">${lines.map((l) => (l ? `<p style="margin:0 0 8px 0;">${escapeHtml(l)}</p>` : "")).join("")}</div>` };
}

/** Recibo: a pergunta foi registrada e enviada ao especialista da ÁREA; o item não foi alterado. PURO. */
export function buildSpecialistReceiptEmail(row: Pick<SpecialistMailRow, "expert_id" | "original_subject">): { subject: string; text: string; html: string } {
  const lines = ["ACC - AXION Controle de Contratos", "", `Consulta ao especialista registrada: ${SPECIALIST_EXPERT_LABEL[row.expert_id]}.`, SPECIALIST_TEXT.RECEIVED];
  return { subject: baseSubject(row), ...wrap(lines) };
}

/** Resposta do Expert (recomendação) ou aviso de limite/falha. PURO. */
export function buildSpecialistAnswerEmail(row: Pick<SpecialistMailRow, "expert_id" | "status" | "requires_human_review" | "answer_text" | "answer_confidence" | "original_subject">): { subject: string; text: string; html: string } {
  const label = SPECIALIST_EXPERT_LABEL[row.expert_id];
  const body =
    row.status === "ANSWERED" && row.answer_text
      ? buildSpecialistAnswerText({ expertLabel: label, answerText: row.answer_text, requiresHumanReview: row.requires_human_review, confidence: row.answer_confidence }).split("\n")
      : [row.status === "QUOTA_BLOCKED" ? SPECIALIST_TEXT.QUOTA : SPECIALIST_TEXT.FAILED];
  return { subject: baseSubject(row), ...wrap(["ACC - AXION Controle de Contratos", "", ...body]) };
}

export interface SpecialistDeliverResult {
  receiptsSent: number;
  answersSent: number;
  failed: number;
  skipped: number;
}

export async function deliverSpecialistMails(input: { client: SupabaseLike; provider: EmailProvider; limit?: number }): Promise<SpecialistDeliverResult> {
  const result: SpecialistDeliverResult = { receiptsSent: 0, answersSent: 0, failed: 0, skipped: 0 };
  const columns = "id,project_id,expert_id,status,requires_human_review,answer_text,answer_confidence,recipient_email,in_reply_to,references_header,original_subject,receipt_status,receipt_attempts,answer_mail_status,answer_mail_attempts";
  for (const kind of ["receipt", "answer"] as const) {
    const statusCol = kind === "receipt" ? "receipt_status" : "answer_mail_status";
    const attemptsCol = kind === "receipt" ? "receipt_attempts" : "answer_mail_attempts";
    const { data, error } = await input.client
      .from("email_specialist_consultations")
      .select(columns)
      .in(statusCol, ["PENDING", "FAILED"])
      .lt(attemptsCol, MAX_SPECIALIST_MAIL_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(input.limit ?? 50);
    if (error) throw new Error("Falha ao ler as consultas ao especialista.");
    for (const row of (data ?? []) as Array<SpecialistMailRow & Record<string, unknown>>) {
      const attempts = Number(row[attemptsCol] ?? 0);
      const { data: claimed } = await input.client
        .from("email_specialist_consultations")
        .update({ [attemptsCol]: attempts + 1 })
        .eq("id", row.id)
        .eq(attemptsCol, attempts)
        .in(statusCol, ["PENDING", "FAILED"])
        .select("id");
      if ((claimed ?? []).length !== 1) {
        result.skipped += 1;
        continue;
      }
      const content = kind === "receipt" ? buildSpecialistReceiptEmail(row) : buildSpecialistAnswerEmail(row);
      try {
        await input.provider.send({
          to: row.recipient_email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          correlationId: `${row.id}:${kind}`,
          ...(row.in_reply_to ? { inReplyTo: row.in_reply_to, references: (row.references_header ?? "").split(/\s+/).filter(Boolean) } : {}),
          vera: { projectId: row.project_id, context: "alerta" },
        });
        const patch = kind === "receipt" ? { receipt_status: "SENT", receipt_sent_at: new Date().toISOString() } : { answer_mail_status: "SENT", answer_mail_sent_at: new Date().toISOString() };
        await input.client.from("email_specialist_consultations").update(patch).eq("id", row.id);
        if (kind === "receipt") result.receiptsSent += 1;
        else result.answersSent += 1;
      } catch {
        await input.client.from("email_specialist_consultations").update({ [statusCol]: "FAILED" }).eq("id", row.id);
        result.failed += 1;
      }
    }
  }
  return result;
}
