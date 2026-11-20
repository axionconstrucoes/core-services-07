// Despachante das respostas por e-mail aos ALERTAS DE RISCO (fase `replies` do worker, service_role). Sem "server-only":
// roda no Node do worker. Sem e-mail, nome ou corpo em logs.
//
// Ordem de resolução (P2): 1º token POR ITEM (email_reply_tokens, tipo RISK_CASE do projeto); 2º mecanismos legados
// (Reply-To da conversa em alert_email_messages, In-Reply-To/References, código visível) — esses continuam no processador.
// Também entrega ao processador: membros com perfil (ENVIAR PARA por nome), anexos guardados como evidência (sha256 no
// Storage + email_inbound_attachments), limite de taxa por remetente, authserv-id confiáveis e o registro de cada mensagem
// em email_reply_inbound_log.

import type { InboundMessageRow } from "@/lib/risk-alerts/store";
import { extractReplyTokens, hashReplyToken } from "@/lib/risk-alerts/replies/reply-pipeline";

import { decodeGmailData, listGmailAttachments, MAX_EVIDENCE_ATTACHMENT_BYTES, MAX_EVIDENCE_ATTACHMENTS, riskEvidenceStoragePath, sha256Hex, type StoredEvidenceAttachment } from "./inbound-attachments";
import type { TargetCandidate } from "./member-target";
import { createSupabaseEmailReplyTokenStore, type EmailReplyTokenRow, type EmailReplyTokenStore } from "./reply-tokens";
import { resolveTrustedAuthservIds, resolveWorkspaceTenantDomains } from "./sender-authentication";
import { SenderRateLimiter, resolveSenderRateLimit } from "./sender-rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLike = { from(table: string): any; storage?: { from(bucket: string): any } };
type GmailLike = { users: { messages: { get(input: any): Promise<any>; attachments?: { get(input: any): Promise<any> } } } };
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RiskReplyDispatchInput {
  supabase: SupabaseLike;
  gmail: GmailLike | null;
  projectId: string;
  dryRun?: boolean;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  tokenStore?: EmailReplyTokenStore;
}

export interface RiskReplyDispatch {
  tokenStore: EmailReplyTokenStore;
  /** Token por item (RISK_CASE deste projeto) dos endereços da mensagem: exatamente um caso => a linha; senão null. */
  resolveItemToken(addresses: readonly string[]): Promise<EmailReplyTokenRow | null>;
  /** Tokens por item das respostas ainda não processadas (RECEIVED) — para a correlação do processador. */
  loadPendingItemTokens(): Promise<Map<string, EmailReplyTokenRow>>;
  targetCandidates(): Promise<TargetCandidate[]>;
  senderRateLimiter(): Promise<SenderRateLimiter>;
  trustedAuthservIds: string[];
  workspaceTenantDomains: string[];
  attachmentsFor(message: InboundMessageRow, caseId: string): Promise<StoredEvidenceAttachment[]>;
  onMessageProcessed(entry: { message: InboundMessageRow; caseId: string | null; status: string; statusReason: string | null }): Promise<void>;
}

const OUTCOME_BY_STATUS: Record<string, string> = {
  PROCESSED: "APPLIED",
  UNAUTHORIZED_REPLY: "UNAUTHORIZED",
  REVIEW_REQUIRED: "REVIEW",
  PENDING_HUMAN_REVIEW: "REVIEW",
  EXPERT_SELECTION_REVIEW_REQUIRED: "REVIEW",
};

export function createRiskReplyDispatch(input: RiskReplyDispatchInput): RiskReplyDispatch {
  const { supabase, projectId } = input;
  const now = input.now ?? (() => new Date());
  const tokenStore = input.tokenStore ?? createSupabaseEmailReplyTokenStore(supabase);
  const env = input.env ?? process.env;

  async function resolveRows(addresses: readonly string[]): Promise<EmailReplyTokenRow[]> {
    const hashes = [...new Set(extractReplyTokens([...addresses]).map((t) => hashReplyToken(t)))];
    if (hashes.length === 0) return [];
    const rows = await tokenStore.findByHashes(hashes);
    return rows.filter((r) => r.subjectKind === "RISK_CASE" && r.projectId === projectId);
  }

  return {
    tokenStore,
    trustedAuthservIds: resolveTrustedAuthservIds(env),
    workspaceTenantDomains: resolveWorkspaceTenantDomains(env),

    async resolveItemToken(addresses) {
      const rows = await resolveRows(addresses);
      const cases = new Set(rows.map((r) => r.subjectId));
      return cases.size === 1 ? rows[0] : null;
    },

    async loadPendingItemTokens() {
      const { data } = await supabase.from("alert_email_messages").select("recipients").eq("project_id", projectId).eq("direction", "INBOUND").eq("status", "RECEIVED");
      const addresses = ((data ?? []) as Array<{ recipients: string[] | null }>).flatMap((row) => row.recipients ?? []);
      const map = new Map<string, EmailReplyTokenRow>();
      for (const row of await resolveRows(addresses)) map.set(row.tokenHash, row);
      return map;
    },

    async targetCandidates() {
      const { data: memberships } = await supabase.from("project_memberships").select("user_id,permission,status").eq("project_id", projectId);
      const ids = [...new Set(((memberships ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id,name,email").in("id", ids) : { data: [] };
      const byId = new Map(((profiles ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((p) => [p.id, p]));
      return ((memberships ?? []) as Array<{ user_id: string; permission: string | null; status: string | null }>).map((m) => ({
        userId: m.user_id,
        name: byId.get(m.user_id)?.name ?? null,
        email: byId.get(m.user_id)?.email ?? null,
        membershipStatus: m.status,
        permission: m.permission,
      }));
    },

    async senderRateLimiter() {
      const since = new Date(now().getTime() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from("email_reply_inbound_log").select("sender_email,received_at").gte("received_at", since);
      return new SenderRateLimiter(resolveSenderRateLimit(env), ((data ?? []) as Array<{ sender_email: string; received_at: string }>).map((r) => ({ senderEmail: r.sender_email, receivedAt: r.received_at })));
    },

    async attachmentsFor(message, caseId) {
      // Já guardados (reprocessamento): reaproveita.
      const { data: stored } = await supabase.from("email_inbound_attachments").select("sha256,file_name,mime_type,size_bytes,storage_path").eq("provider_message_id", message.providerMessageId);
      if ((stored ?? []).length > 0) {
        return ((stored ?? []) as Array<{ sha256: string; file_name: string; mime_type: string; size_bytes: number; storage_path: string }>).map((r) => ({ sha256: r.sha256, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: Number(r.size_bytes), storagePath: r.storage_path }));
      }
      if (!input.gmail) return [];
      const full = await input.gmail.users.messages.get({ userId: "me", id: message.providerMessageId, format: "full" });
      const refs = listGmailAttachments(full?.data?.payload).slice(0, MAX_EVIDENCE_ATTACHMENTS);
      const out: StoredEvidenceAttachment[] = [];
      for (const ref of refs) {
        let bytes: Buffer | null = null;
        if (ref.inlineData) bytes = decodeGmailData(ref.inlineData);
        else if (ref.attachmentId && input.gmail.users.messages.attachments) {
          const res = await input.gmail.users.messages.attachments.get({ userId: "me", messageId: message.providerMessageId, id: ref.attachmentId });
          bytes = res?.data?.data ? decodeGmailData(res.data.data) : null;
        }
        if (!bytes || bytes.length === 0 || bytes.length > MAX_EVIDENCE_ATTACHMENT_BYTES) continue;
        const sha256 = sha256Hex(bytes);
        const storagePath = riskEvidenceStoragePath(projectId, caseId, sha256, ref.fileName);
        if (!input.dryRun) {
          const upload = await supabase.storage?.from("project-documents").upload(storagePath, bytes, { contentType: ref.mimeType, upsert: true });
          if (upload?.error) continue; // sem arquivo guardado não há evidência referenciável
          const { error } = await supabase.from("email_inbound_attachments").insert({ project_id: projectId, provider_message_id: message.providerMessageId, sha256, file_name: ref.fileName, mime_type: ref.mimeType, size_bytes: bytes.length, storage_path: storagePath });
          if (error && error.code !== "23505") continue;
        }
        out.push({ sha256, fileName: ref.fileName, mimeType: ref.mimeType, sizeBytes: bytes.length, storagePath });
      }
      return out;
    },

    async onMessageProcessed(entry) {
      if (input.dryRun) return;
      const outcome = entry.status === "PROCESSED" && /rejeitad/i.test(entry.statusReason ?? "") ? "REJECTED" : (OUTCOME_BY_STATUS[entry.status] ?? "IGNORED");
      await supabase.from("email_reply_inbound_log").insert({
        flow: "RISK",
        provider_message_id: entry.message.providerMessageId,
        project_id: projectId,
        sender_email: (entry.message.headers.from || "desconhecido").toLowerCase().slice(0, 320),
        subject_kind: "RISK_CASE",
        subject_id: entry.caseId,
        outcome,
        reason: (entry.statusReason ?? entry.status).slice(0, 300),
        received_at: entry.message.receivedAt,
      });
    },
  };
}
