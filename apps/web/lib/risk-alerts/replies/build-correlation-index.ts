// Índice de correlação das respostas aos alertas — PURO (sem I/O), compartilhado
// pelo store real (supabase-store.ts) e pelos testes.
//
// `seenMessageIds` alimenta o filtro anti-loop (filterInboundMessage → IGNORED_LOOP).
// Ele deve conter apenas mensagens JÁ CONHECIDAS como tratadas:
//   - todas as mensagens ENVIADAS pelo ACC (OUTBOUND): uma "resposta" cujo Message-ID
//     é o de um e-mail nosso é eco/loop;
//   - mensagens RECEBIDAS que já saíram do estado RECEIVED (processadas/ignoradas):
//     a reentrega do mesmo Message-ID é duplicidade.
// Uma mensagem RECEBIDA ainda pendente (status RECEIVED) NUNCA entra: ela é justamente
// a que está sendo processada — incluí-la fazia toda resposta legítima ser descartada
// como IGNORED_LOOP. A deduplicação de duas pendentes com o mesmo Message-ID é feita
// pelo processador (a primeira aceita registra o id; a segunda vira IGNORED_LOOP).

import type { CorrelationIndex } from "./reply-pipeline";

export interface CorrelationMessageRow {
  case_id: string | null;
  message_id_header: string | null;
  reply_token_hash: string | null;
  direction: string | null;
  status: string | null;
  /** Presente nas mensagens enviadas; liga a mensagem ao destinatário lógico (piloto por projeto). */
  outbox_id?: string | null;
}

export interface CorrelationConversationRow {
  case_id: string | null;
  reply_token_hash: string | null;
}

export interface CorrelationCaseRow {
  id: string;
  visible_code: string | null;
}

export function buildCorrelationIndex(
  messages: CorrelationMessageRow[],
  conversations: CorrelationConversationRow[],
  cases: CorrelationCaseRow[],
  /** outbox id -> user_id do destinatário lógico (opcional). Só alimenta a atribuição de respostas no piloto por projeto. */
  outboxRecipients: ReadonlyMap<string, string> = new Map()
): CorrelationIndex & { seenMessageIds: Set<string> } {
  const byMessageId = new Map<string, string>();
  const byReplyTokenHash = new Map<string, string>();
  const seenMessageIds = new Set<string>();
  const participantByMessageId = new Map<string, string>();
  const participantByReplyTokenHash = new Map<string, string>();
  for (const row of messages) {
    if (row.message_id_header && row.case_id) byMessageId.set(row.message_id_header, row.case_id);
    if (row.message_id_header && (row.direction === "OUTBOUND" || (row.direction === "INBOUND" && row.status !== "RECEIVED"))) {
      seenMessageIds.add(row.message_id_header);
    }
    if (row.reply_token_hash && row.case_id) byReplyTokenHash.set(row.reply_token_hash, row.case_id);
    const participant = row.direction === "OUTBOUND" && row.outbox_id ? outboxRecipients.get(row.outbox_id) : undefined;
    if (participant && row.message_id_header) participantByMessageId.set(row.message_id_header, participant);
    if (participant && row.reply_token_hash) participantByReplyTokenHash.set(row.reply_token_hash, participant);
  }
  for (const row of conversations) if (row.reply_token_hash && row.case_id) byReplyTokenHash.set(row.reply_token_hash, row.case_id);
  const byVisibleCode = new Map(cases.filter((row) => row.visible_code).map((row) => [row.visible_code as string, row.id]));
  return { byMessageId, byReplyTokenHash, byVisibleCode, seenMessageIds, participantByMessageId, participantByReplyTokenHash };
}

/**
 * O Gmail pode SUBSTITUIR o Message-ID que o ACC escreve no MIME ao enviar pela API (medido no piloto: o Message-ID real
 * da mensagem enviada difere do gravado em message_id_header). Respostas trazem o Message-ID REAL em In-Reply-To/References.
 * Este helper acrescenta, SÓ EM MEMÓRIA, o Message-ID real como apelido do gravado (mesmo caso, mesmo participante e
 * anti-loop). Nenhum registro é alterado. `aliases`: Message-ID real -> Message-ID gravado (ambos no formato <...>).
 * Apelido que já aponta para outro caso é ignorado (nunca sobrescreve uma correlação existente).
 */
export function applyMessageIdAliases(
  index: CorrelationIndex & { seenMessageIds: Set<string> },
  aliases: ReadonlyMap<string, string>
): number {
  const normalize = (id: string) => id.trim().replace(/^<?/, "<").replace(/>?$/, ">");
  let applied = 0;
  for (const [rawReal, rawRecorded] of aliases) {
    const real = normalize(rawReal);
    const recorded = normalize(rawRecorded);
    if (real === recorded) continue;
    const caseId = index.byMessageId.get(recorded);
    if (!caseId) continue;
    const existing = index.byMessageId.get(real);
    if (existing && existing !== caseId) continue;
    index.byMessageId.set(real, caseId);
    const participant = index.participantByMessageId?.get(recorded);
    if (participant && index.participantByMessageId && !index.participantByMessageId.has(real)) index.participantByMessageId.set(real, participant);
    index.seenMessageIds.add(real);
    applied += 1;
  }
  return applied;
}
