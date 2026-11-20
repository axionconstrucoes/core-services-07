// Tokens de resposta POR ITEM (tabela email_reply_tokens) — emissão, resolução e consumo. Sem "server-only": usado
// pelo ciclo de alertas, pelo envio SSMA (server) e pelo worker da fase `replies` (Node), sempre com service_role.
//
// - Token: 24 bytes aleatórios (base64url) — o mesmo gerador do Reply-To dos alertas. Só o sha256 é gravado, SEMPRE
//   antes do envio (sem gravação => sem link e sem Reply-To com este token).
// - Validade: 30 dias (a mesma janela da busca da caixa: newer_than:30d).
// - Consumo: RESOLVIDO / ENVIAR PARA aplicados marcam o token com o id do provedor da mensagem (uso único para ações
//   terminais). EM ANDAMENTO não consome (a previsão pode ser atualizada). Reprocessar a MESMA mensagem é idempotente.
// - N3: SLA_ACTION, WEEKLY_DIGEST_ITEM e CONTRACT_ALERT_ITEM passaram a ter processamento efetivo (fase
//   scripts/lib/token-replies-phase.mjs + RPCs *_by_email da migration 20261121120000). VERSION_REVIEW continua SEM
//   processamento por e-mail: não recebe atalho mailto.

import { createHash, randomBytes } from "node:crypto";

export type EmailReplySubjectKind = "RISK_CASE" | "SSMA_ACTION" | "SLA_ACTION" | "WEEKLY_DIGEST_ITEM" | "CONTRACT_ALERT_ITEM" | "VERSION_REVIEW";

export const EMAIL_REPLY_SUBJECT_KINDS: readonly EmailReplySubjectKind[] = ["RISK_CASE", "SSMA_ACTION", "SLA_ACTION", "WEEKLY_DIGEST_ITEM", "CONTRACT_ALERT_ITEM", "VERSION_REVIEW"];

/** Tipos com processamento EFETIVO por e-mail (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA). Só eles recebem mailto. */
export const EMAIL_REPLY_PROCESSABLE_KINDS: ReadonlySet<EmailReplySubjectKind> = new Set<EmailReplySubjectKind>(["RISK_CASE", "SSMA_ACTION", "SLA_ACTION", "WEEKLY_DIGEST_ITEM", "CONTRACT_ALERT_ITEM"]);

export function isProcessableReplyKind(kind: string | null | undefined): kind is EmailReplySubjectKind {
  return EMAIL_REPLY_PROCESSABLE_KINDS.has(kind as EmailReplySubjectKind);
}

export const EMAIL_REPLY_TOKEN_TTL_DAYS = 30;

export function generateEmailReplyToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashEmailReplyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface EmailReplyTokenRow {
  tokenHash: string;
  projectId: string;
  subjectKind: EmailReplySubjectKind;
  subjectId: string;
  recipientUserId: string | null;
  issuedAt: string;
  expiresAt: string;
  consumedByMessageId: string | null;
}

export interface EmailReplyTokenStore {
  insert(row: EmailReplyTokenRow): Promise<void>;
  findByHashes(hashes: readonly string[]): Promise<EmailReplyTokenRow[]>;
  /** Marca o consumo SE ainda livre (ou já consumido pela MESMA mensagem). true = esta mensagem é a dona do consumo. */
  consume(tokenHash: string, providerMessageId: string, nowIso: string): Promise<boolean>;
  /** Desfaz o consumo desta mensagem (a ação não foi gravada). */
  release(tokenHash: string, providerMessageId: string): Promise<void>;
}

export interface IssuedEmailReplyToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/** Gera e GRAVA o token (hash) antes do envio. Falha de gravação => lança (o chamador não monta o link). */
export async function issueEmailReplyToken(
  store: EmailReplyTokenStore,
  input: { projectId: string; subjectKind: EmailReplySubjectKind; subjectId: string; recipientUserId: string | null; nowIso: string; token?: string }
): Promise<IssuedEmailReplyToken> {
  const token = input.token ?? generateEmailReplyToken();
  const tokenHash = hashEmailReplyToken(token);
  const expiresAt = new Date(new Date(input.nowIso).getTime() + EMAIL_REPLY_TOKEN_TTL_DAYS * 86_400_000).toISOString();
  await store.insert({ tokenHash, projectId: input.projectId, subjectKind: input.subjectKind, subjectId: input.subjectId, recipientUserId: input.recipientUserId, issuedAt: input.nowIso, expiresAt, consumedByMessageId: null });
  return { token, tokenHash, expiresAt };
}

export type TokenUsability = { ok: true } | { ok: false; reason: "TOKEN_EXPIRED" | "TOKEN_ALREADY_USED" };

export function tokenUsability(row: EmailReplyTokenRow, providerMessageId: string, nowIso: string): TokenUsability {
  if (row.consumedByMessageId && row.consumedByMessageId !== providerMessageId) return { ok: false, reason: "TOKEN_ALREADY_USED" };
  if (new Date(row.expiresAt).getTime() <= new Date(nowIso).getTime()) return { ok: false, reason: "TOKEN_EXPIRED" };
  return { ok: true };
}

// ---------------------------------------------------------------- implementações

interface SupabaseLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function createSupabaseEmailReplyTokenStore(client: SupabaseLike): EmailReplyTokenStore {
  return {
    async insert(row) {
      const { error } = await client.from("email_reply_tokens").insert({
        token_hash: row.tokenHash,
        project_id: row.projectId,
        subject_kind: row.subjectKind,
        subject_id: row.subjectId,
        recipient_user_id: row.recipientUserId,
        issued_at: row.issuedAt,
        expires_at: row.expiresAt,
      });
      if (error) throw new Error("Falha ao registrar o token de resposta por e-mail.");
    },
    async findByHashes(hashes) {
      if (hashes.length === 0) return [];
      const { data, error } = await client
        .from("email_reply_tokens")
        .select("token_hash,project_id,subject_kind,subject_id,recipient_user_id,issued_at,expires_at,consumed_by_message_id")
        .in("token_hash", [...hashes]);
      if (error) throw new Error("Falha ao resolver o token de resposta por e-mail.");
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        tokenHash: String(r.token_hash),
        projectId: String(r.project_id),
        subjectKind: r.subject_kind as EmailReplySubjectKind,
        subjectId: String(r.subject_id),
        recipientUserId: (r.recipient_user_id as string | null) ?? null,
        issuedAt: String(r.issued_at),
        expiresAt: String(r.expires_at),
        consumedByMessageId: (r.consumed_by_message_id as string | null) ?? null,
      }));
    },
    async consume(tokenHash, providerMessageId, nowIso) {
      const { data, error } = await client
        .from("email_reply_tokens")
        .update({ consumed_by_message_id: providerMessageId, consumed_at: nowIso })
        .eq("token_hash", tokenHash)
        .is("consumed_by_message_id", null)
        .select("token_hash");
      if (error) throw new Error("Falha ao consumir o token de resposta por e-mail.");
      if ((data ?? []).length === 1) return true;
      const { data: current } = await client.from("email_reply_tokens").select("consumed_by_message_id").eq("token_hash", tokenHash).maybeSingle();
      return (current?.consumed_by_message_id ?? null) === providerMessageId;
    },
    async release(tokenHash, providerMessageId) {
      await client.from("email_reply_tokens").update({ consumed_by_message_id: null, consumed_at: null }).eq("token_hash", tokenHash).eq("consumed_by_message_id", providerMessageId);
    },
  };
}

/** Store em memória (testes e dry-run). */
export function createMemoryEmailReplyTokenStore(initial: EmailReplyTokenRow[] = []): EmailReplyTokenStore & { rows: EmailReplyTokenRow[] } {
  const rows = [...initial];
  return {
    rows,
    async insert(row) {
      if (rows.some((r) => r.tokenHash === row.tokenHash)) throw new Error("Falha ao registrar o token de resposta por e-mail.");
      rows.push({ ...row });
    },
    async findByHashes(hashes) {
      return rows.filter((r) => hashes.includes(r.tokenHash)).map((r) => ({ ...r }));
    },
    async consume(tokenHash, providerMessageId) {
      const row = rows.find((r) => r.tokenHash === tokenHash);
      if (!row) return false;
      if (row.consumedByMessageId === null) {
        row.consumedByMessageId = providerMessageId;
        return true;
      }
      return row.consumedByMessageId === providerMessageId;
    },
    async release(tokenHash, providerMessageId) {
      const row = rows.find((r) => r.tokenHash === tokenHash);
      if (row && row.consumedByMessageId === providerMessageId) row.consumedByMessageId = null;
    },
  };
}
