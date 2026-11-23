// Confirmações das respostas por e-mail (SLA_ACTION / WEEKLY_DIGEST_ITEM / CONTRACT_ALERT_ITEM). Sem "server-only": o
// worker (Node) enfileira e a aplicação entrega; ambos com service_role.
//
// - Enfileirar: uma linha por MENSAGEM recebida (email_reply_confirmations, único por id do provedor) — gravada SÓ depois
//   da gravação na RPC (confirmação de sucesso) ou da decisão de recusa/complementação (nada gravado no item).
// - Entregar: deliverEmailReplyConfirmations reivindica (attempt_count otimista), envia pelo provedor do ACC (as travas do
//   piloto continuam no provedor) na MESMA conversa (In-Reply-To/References) e marca SENT; falha => FAILED com nova
//   tentativa (até 5). Texto curto: sem dados do alerta além do código, sem anexos.

import type { EmailProvider } from "@/lib/email/email-provider";
import { checkAlertCapacity } from "@/lib/email/governed-email-provider";

import type { TokenReplyKind } from "./token-reply-decision";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLike = { from(table: string): any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export const MAX_CONFIRMATION_ATTEMPTS = 5;

export interface TokenReplyConfirmationInput {
  projectId: string;
  inboundProviderMessageId: string;
  subjectKind: TokenReplyKind;
  subjectId: string;
  recipientUserId: string | null;
  recipientEmail: string;
  inReplyTo: string | null;
  references: string[];
  originalSubject: string | null;
  outcome: "APPLIED" | "REJECTED" | "INCOMPLETE";
  statusLabel: string;
  detailLine: string | null;
}

/** Grava a confirmação (idempotente pelo id da mensagem recebida). true = gravada agora ou já existia. */
export async function enqueueTokenReplyConfirmation(client: SupabaseLike, input: TokenReplyConfirmationInput): Promise<boolean> {
  const { error } = await client.from("email_reply_confirmations").insert({
    project_id: input.projectId,
    inbound_provider_message_id: input.inboundProviderMessageId,
    subject_kind: input.subjectKind,
    subject_id: input.subjectId,
    recipient_user_id: input.recipientUserId,
    recipient_email: input.recipientEmail.toLowerCase().slice(0, 320),
    in_reply_to: input.inReplyTo,
    references_header: input.references.slice(-20).join(" ") || null,
    original_subject: (input.originalSubject ?? "").slice(0, 300) || null,
    outcome: input.outcome,
    status_label: input.statusLabel.slice(0, 500),
    detail_line: input.detailLine ? input.detailLine.slice(0, 2000) : null,
  });
  if (!error) return true;
  return error.code === "23505" || /duplicate|unique/i.test(String(error.message ?? ""));
}

export interface ConfirmationRow {
  id: string;
  project_id: string;
  subject_kind: TokenReplyKind;
  recipient_email: string;
  in_reply_to: string | null;
  references_header: string | null;
  original_subject: string | null;
  outcome: "APPLIED" | "REJECTED" | "INCOMPLETE";
  status_label: string;
  detail_line: string | null;
  attempt_count: number;
}

const KIND_TITLE: Record<TokenReplyKind, string> = {
  SLA_ACTION: "Ação de SLA",
  WEEKLY_DIGEST_ITEM: "Resumo semanal",
  CONTRACT_ALERT_ITEM: "Alerta de contrato",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Conteúdo da confirmação — PURO. */
export function buildTokenReplyConfirmationEmail(row: Pick<ConfirmationRow, "subject_kind" | "original_subject" | "outcome" | "status_label" | "detail_line">): { subject: string; text: string; html: string } {
  const base = (row.original_subject ?? "").replace(/^\s*(re|res|enc|fw|fwd)\s*:\s*/i, "").trim() || `${KIND_TITLE[row.subject_kind]} — ACC`;
  const subject = `Re: ${base}`.slice(0, 200);
  const head = row.outcome === "APPLIED" ? "Sua resposta foi REGISTRADA no ACC." : "Sua resposta NÃO foi aplicada — nada foi alterado.";
  const lines = [
    "ACC - AXION Controle de Contratos",
    "",
    head,
    `${KIND_TITLE[row.subject_kind]}: ${row.status_label}`,
    ...(row.detail_line ? [row.detail_line] : []),
    "",
    "Esta confirmação foi enviada somente depois da gravação (ou da recusa) no ACC. Prazos e escalonamentos não mudam por esta resposta.",
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111827;">${lines.map((l) => (l ? `<p style="margin:0 0 8px 0;">${escapeHtml(l)}</p>` : "")).join("")}</div>`;
  return { subject, text: lines.join("\n"), html };
}

export interface DeliverResult {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** Entrega as confirmações pendentes (PENDING ou FAILED com tentativas restantes). */
export async function deliverEmailReplyConfirmations(input: { client: SupabaseLike; provider: EmailProvider; limit?: number; now?: () => Date }): Promise<DeliverResult> {
  const now = input.now ?? (() => new Date());
  const { data, error } = await input.client
    .from("email_reply_confirmations")
    .select("id,project_id,subject_kind,recipient_email,in_reply_to,references_header,original_subject,outcome,status_label,detail_line,attempt_count")
    .in("status", ["PENDING", "FAILED"])
    .lt("attempt_count", MAX_CONFIRMATION_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(input.limit ?? 50);
  if (error) throw new Error("Falha ao ler as confirmações de resposta por e-mail.");
  const rows = (data ?? []) as ConfirmationRow[];
  const result: DeliverResult = { pending: rows.length, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    // Portão do governador (doc 35) ANTES da reivindicação: adiada por limite => continua PENDING, sem tentativa gasta.
    if (!(await checkAlertCapacity(input.provider, { type: "EMAIL_REPLY_CONFIRMATION", projectId: row.project_id })).allowed) {
      result.skipped += 1;
      continue;
    }
    // Reivindicação otimista: só quem incrementa a tentativa a partir do valor lido envia.
    const { data: claimed } = await input.client
      .from("email_reply_confirmations")
      .update({ attempt_count: row.attempt_count + 1, claimed_at: now().toISOString() })
      .eq("id", row.id)
      .eq("attempt_count", row.attempt_count)
      .in("status", ["PENDING", "FAILED"])
      .select("id");
    if ((claimed ?? []).length !== 1) {
      result.skipped += 1;
      continue;
    }
    const content = buildTokenReplyConfirmationEmail(row);
    try {
      const sent = await input.provider.send({
        to: row.recipient_email,
        subject: content.subject,
        text: content.text,
        html: content.html,
        correlationId: row.id,
        ...(row.in_reply_to ? { inReplyTo: row.in_reply_to, references: (row.references_header ?? "").split(/\s+/).filter(Boolean) } : {}),
        // Contexto da obra (AXIA + travas do piloto pelo projeto, aplicadas no provedor).
        vera: { projectId: row.project_id, context: "alerta" },
        governance: { type: "EMAIL_REPLY_CONFIRMATION", projectId: row.project_id, dedupKey: row.id },
      });
      await input.client.from("email_reply_confirmations").update({ status: "SENT", sent_at: sent.sentAt, sent_provider_message_id: sent.providerMessageId ?? null, last_error: null, claimed_at: null }).eq("id", row.id);
      result.sent += 1;
    } catch {
      await input.client.from("email_reply_confirmations").update({ status: "FAILED", last_error: "Falha no envio da confirmação.", claimed_at: null }).eq("id", row.id);
      result.failed += 1;
    }
  }
  return result;
}
