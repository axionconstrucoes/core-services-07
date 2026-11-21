// FASE 5 / E — CONFIRMAÇÃO DE ENVIO EXTERNO DE USO ÚNICO (espelho puro de public.acc_external_send_* — migration 20261205102000).
// Vincula: usuário + projeto + destinatários + ação + conteúdo (SHA-256) + versão. Nada aqui envia e-mail; o envio real continua bloqueado
// pelas travas do ACC. Qualquer domínio externo VÁLIDO pode ser analisado e, quando autorizado, usado: NÃO existe allowlist universal;
// a lista de domínios só dispensa a confirmação (INTERNO/PERMITIDO). LEITURA/consulta de mensagens já recebidas ou enviadas não passa
// por este fluxo e NÃO exige a aprovação excepcional de novo envio.
import { createHash } from "node:crypto";
import { classifyRecipientDomain, validateRecipientEmail, type RecipientDomainEntry } from "../email/recipient-validation";

export const SEND_ACTIONS = ["ENVIO_NOVO", "RESPOSTA", "ENCAMINHAMENTO", "CADASTRO_CANAL", "SOLICITACAO_ACAO"] as const;
export type SendAction = (typeof SEND_ACTIONS)[number];

/** Ações sobre mensagens que NÃO são envio novo: nunca exigem a aprovação excepcional. */
export const MESSAGE_READ_ACTIONS = ["LER_RECEBIDA", "LER_ENVIADA", "ANALISAR_THREAD", "ANALISAR_ANEXO", "PESQUISAR"] as const;
export type MessageReadAction = (typeof MESSAGE_READ_ACTIONS)[number];

export const SEND_CONTEXTS = ["SEGUROS_CANAL", "SEGUROS_MINUTA", "GARANTIAS", "QUALIDADE", "SOLICITACAO_ACAO", "OUTRO"] as const;
export type SendContext = (typeof SEND_CONTEXTS)[number];

export const MAX_RECIPIENTS = 20;
export const AUTHORIZATION_TTL_HOURS = 24;

export type Tier = "ADMIN" | "MANAGE" | "REGISTER" | "READ" | "NONE";

/** Hash canônico do conteúdo: JSON com chaves ordenadas, texto normalizado (CRLF -> LF), SHA-256 hex minúsculo. */
export function hashExternalSendContent(content: { subject?: string; body: string; attachments?: readonly string[] }): string {
  const canonical = JSON.stringify({
    subject: (content.subject ?? "").replace(/\r\n/g, "\n").trim(),
    body: content.body.replace(/\r\n/g, "\n").trim(),
    attachments: [...(content.attachments ?? [])].map((a) => a.trim()).sort(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Espelho de acc_external_send_normalize_list: valida cada endereço, minúsculas, sem repetição, ordenado. null = inválido/vazio. */
export function normalizeRecipientList(list: readonly unknown[]): string[] | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const out = new Set<string>();
  for (const r of list) {
    const v = validateRecipientEmail(r);
    if (!v.ok) return null;
    out.add(v.email);
  }
  return [...out].sort();
}

/** O que exige a aprovação excepcional: SOMENTE envio com ao menos um destinatário EXTERNO. Leitura/análise nunca. */
export function requiresExternalSendApproval(
  action: SendAction | MessageReadAction,
  recipients: readonly string[],
  domains: readonly RecipientDomainEntry[],
): boolean {
  if ((MESSAGE_READ_ACTIONS as readonly string[]).includes(action)) return false;
  return recipients.some((r) => classifyRecipientDomain(r, domains) === "EXTERNO");
}

/** Matriz: minuta de Seguros = ADMINISTRADOR; demais = gestão. */
export function requiredApprovalTier(context: SendContext): "ADMIN" | "MANAGE" {
  return context === "SEGUROS_MINUTA" ? "ADMIN" : "MANAGE";
}

export function canPrepareSend(tier: Tier): boolean {
  return tier === "REGISTER" || tier === "MANAGE" || tier === "ADMIN";
}

export function canApproveSend(tier: Tier, context: SendContext): boolean {
  if (tier !== "MANAGE" && tier !== "ADMIN") return false;
  return requiredApprovalTier(context) === "ADMIN" ? tier === "ADMIN" : true;
}

export interface Preparation {
  projectId: string;
  context: SendContext;
  action: SendAction;
  recipients: readonly string[];
  externalRecipients: readonly string[];
  contentHash: string;
  preparedBy: string;
  status: "PREPARED" | "APPROVED" | "REJECTED" | "CANCELLED" | "CONSUMED";
  decidedBy: string | null;
  decidedAtMs: number | null;
}

export type ConsumeVerdict =
  | { ok: true }
  | { ok: false; code: "ALREADY_USED" | "NOT_APPROVED" | "ACTION_MISMATCH" | "CONTENT_CHANGED" | "RECIPIENTS_CHANGED" | "CONFIRMER_ONLY" | "FORBIDDEN" | "EXPIRED" };

/** Espelho de acc_external_send_consume (a decisão final é do banco). */
export function canConsumeSend(p: Preparation, a: { userId: string; tier: Tier; action: SendAction; recipients: readonly unknown[]; contentHash: string; nowMs: number }): ConsumeVerdict {
  if (a.tier === "NONE" || a.tier === "READ") return { ok: false, code: "FORBIDDEN" };
  if (p.status === "CONSUMED") return { ok: false, code: "ALREADY_USED" };
  if (p.status !== "PREPARED" && p.status !== "APPROVED") return { ok: false, code: "NOT_APPROVED" };
  if (a.action !== p.action) return { ok: false, code: "ACTION_MISMATCH" };
  if (a.contentHash !== p.contentHash) return { ok: false, code: "CONTENT_CHANGED" };
  const list = normalizeRecipientList(a.recipients);
  if (!list || list.join("\n") !== [...p.recipients].join("\n")) return { ok: false, code: "RECIPIENTS_CHANGED" };
  if (p.externalRecipients.length === 0) {
    if (a.userId !== p.preparedBy && a.tier !== "MANAGE" && a.tier !== "ADMIN") return { ok: false, code: "FORBIDDEN" };
    return { ok: true };
  }
  if (p.status !== "APPROVED") return { ok: false, code: "NOT_APPROVED" };
  if (p.decidedBy !== a.userId) return { ok: false, code: "CONFIRMER_ONLY" };
  if (!canApproveSend(a.tier, p.context)) return { ok: false, code: "FORBIDDEN" };
  if (p.decidedAtMs === null || a.nowMs - p.decidedAtMs > AUTHORIZATION_TTL_HOURS * 3600_000) return { ok: false, code: "EXPIRED" };
  return { ok: true };
}
