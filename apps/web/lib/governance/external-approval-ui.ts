// FASE 6 / H2a — regras PURAS da tela de aprovação de comunicações externas. Sobre as RPCs acc_external_send_* (migrations 20261205102000 e
// 20261208100000). NADA aqui envia e-mail: a tela só PREPARA (colaborador ou acima), DECIDE (gestão; minuta de Seguros só ADMINISTRADOR) e
// CANCELA. O consumo da autorização (uso único) é do fluxo de envio, que continua bloqueado pelas travas do ACC. A análise de e-mails
// externos recebidos/enviados é automática e NÃO passa por esta aprovação.
import { SEND_ACTIONS, SEND_CONTEXTS, hashExternalSendContent, normalizeRecipientList, requiredApprovalTier, canApproveSend, canPrepareSend, type SendAction, type SendContext, type Tier } from "./external-send-binding";
import { validateRecipientEmail } from "../email/recipient-validation";

export const CONTEXT_LABEL: Record<SendContext, string> = {
  SEGUROS_CANAL: "Seguros — cadastro de canal da seguradora",
  SEGUROS_MINUTA: "Seguros — minuta (aprovação só do ADMINISTRADOR)",
  GARANTIAS: "Garantias",
  QUALIDADE: "Qualidade",
  SOLICITACAO_ACAO: "Solicitação de ação",
  OUTRO: "Outro",
};

export const ACTION_LABEL: Record<SendAction, string> = {
  ENVIO_NOVO: "Envio novo",
  RESPOSTA: "Resposta",
  ENCAMINHAMENTO: "Encaminhamento",
  CADASTRO_CANAL: "Cadastro de canal",
  SOLICITACAO_ACAO: "Solicitação de ação",
};

export const STATUS_LABEL: Record<string, string> = {
  PREPARED: "Aguardando aprovação",
  APPROVED: "Aprovada (uso único, 24 h)",
  REJECTED: "Recusada",
  CANCELLED: "Cancelada",
  CONSUMED: "Autorização já usada",
};

export interface PrepareInput {
  projectId?: string;
  context?: string;
  action?: string;
  recipientsText?: string;
  subject?: string;
  body?: string;
  attachmentsText?: string;
  version?: string;
}

export class ApprovalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalInputError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isSendContext = (v: unknown): v is SendContext => (SEND_CONTEXTS as readonly string[]).includes(v as string);
export const isSendAction = (v: unknown): v is SendAction => (SEND_ACTIONS as readonly string[]).includes(v as string);

/** Lista de destinatários a partir de texto (um por linha, vírgula ou ponto e vírgula). Valida cada um; recusa lista vazia, inválida ou > 20. */
export function parseRecipients(text: string | undefined): string[] {
  const parts = String(text ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new ApprovalInputError("Informe ao menos um destinatário.");
  if (parts.length > 20) throw new ApprovalInputError("No máximo 20 destinatários.");
  for (const p of parts) {
    const v = validateRecipientEmail(p);
    if (!v.ok) throw new ApprovalInputError(`Destinatário "${p.slice(0, 80)}": ${v.message}`);
  }
  const list = normalizeRecipientList(parts);
  if (!list) throw new ApprovalInputError("Lista de destinatários inválida.");
  return list;
}

/** Conteúdo canônico (LF, aparado, anexos aparados e ordenados) e seu SHA-256 — o MESMO que o banco recalcula e confere. */
export function canonicalContent(input: { subject?: string; body?: string; attachmentsText?: string }): { subject: string; body: string; attachments: string[]; hash: string } {
  const subject = String(input.subject ?? "").replace(/\r\n/g, "\n").trim();
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length === 0) throw new ApprovalInputError("Informe o texto do envio.");
  if (body.length > 20000) throw new ApprovalInputError("O texto passa de 20000 caracteres.");
  if (subject.length > 300) throw new ApprovalInputError("O assunto passa de 300 caracteres.");
  const attachments = String(input.attachmentsText ?? "").split(/\n+/).map((a) => a.trim()).filter(Boolean).sort();
  if (attachments.length > 20) throw new ApprovalInputError("No máximo 20 anexos.");
  if (attachments.some((a) => a.length > 200)) throw new ApprovalInputError("Nome de anexo longo demais (máx. 200).");
  return { subject, body, attachments, hash: hashExternalSendContent({ subject, body, attachments }) };
}

/** Chamada à RPC de preparação com conteúdo. Nada é enviado. */
export function buildPrepareCall(input: PrepareInput): { rpc: string; params: Record<string, unknown> } {
  const projectId = String(input.projectId ?? "");
  if (!UUID_RE.test(projectId)) throw new ApprovalInputError("Projeto inválido.");
  if (!isSendContext(input.context)) throw new ApprovalInputError("Contexto de envio inválido.");
  if (!isSendAction(input.action)) throw new ApprovalInputError("Ação de envio inválida.");
  const version = String(input.version ?? "").trim();
  if (version.length < 1 || version.length > 60) throw new ApprovalInputError("Informe a versão do conteúdo (1 a 60 caracteres).");
  const recipients = parseRecipients(input.recipientsText);
  const c = canonicalContent(input);
  return {
    rpc: "acc_external_send_prepare_with_content",
    params: {
      p_project_id: projectId,
      p_context: input.context,
      p_action: input.action,
      p_recipients: recipients,
      p_content_hash: c.hash,
      p_content_version: version,
      p_subject: c.subject,
      p_body: c.body,
      p_attachments: c.attachments,
    },
  };
}

export type ApprovalOp = "approve" | "reject" | "cancel";

export function buildDecisionCall(input: { op: ApprovalOp; id?: string; reason?: string; externalCount?: number }): { rpc: string; params: Record<string, unknown> } {
  const id = String(input.id ?? "");
  if (!UUID_RE.test(id)) throw new ApprovalInputError("Preparação inválida.");
  const reason = String(input.reason ?? "").trim();
  if (reason.length > 1000) throw new ApprovalInputError("Motivo longo demais (máx. 1000).");
  if (input.op === "cancel") {
    if (reason.length < 10) throw new ApprovalInputError("Informe o motivo do cancelamento (mínimo de 10 caracteres).");
    return { rpc: "acc_external_send_cancel", params: { p_preparation_id: id, p_reason: reason } };
  }
  if (input.op === "reject") {
    if (reason.length < 10) throw new ApprovalInputError("Informe o motivo da recusa (mínimo de 10 caracteres).");
    return { rpc: "acc_external_send_decide", params: { p_preparation_id: id, p_decision: "REJECT", p_reason: reason } };
  }
  if (input.op === "approve") {
    if ((input.externalCount ?? 1) > 0 && reason.length < 10) throw new ApprovalInputError("Envio a destinatário externo exige motivo (mínimo de 10 caracteres).");
    return { rpc: "acc_external_send_decide", params: { p_preparation_id: id, p_decision: "APPROVE", p_reason: reason || null } };
  }
  throw new ApprovalInputError("Operação desconhecida.");
}

/** O hash guardado confere com o conteúdo guardado? Alerta visível ao aprovador (nunca presume). */
export function verifyStoredHash(content: { subject: string; body: string; attachments: readonly string[] }, storedHash: string): boolean {
  return hashExternalSendContent({ subject: content.subject, body: content.body, attachments: [...content.attachments] }) === storedHash;
}

export function canPrepare(tier: Tier): boolean {
  return canPrepareSend(tier);
}

/** Pode decidir esta preparação? (a RPC repete: gestão; minuta de Seguros só ADMINISTRADOR). */
export function canDecide(tier: Tier, context: SendContext): boolean {
  return canApproveSend(tier, context);
}

export function requiredTierLabel(context: SendContext): string {
  return requiredApprovalTier(context) === "ADMIN" ? "ADMINISTRADOR" : "GESTOR, GERENTE ou ADMINISTRADOR";
}

export function canCancel(a: { userId: string; tier: Tier }, p: { prepared_by: string; status: string }): boolean {
  return (p.status === "PREPARED" || p.status === "APPROVED") && (a.userId === p.prepared_by || a.tier === "MANAGE" || a.tier === "ADMIN");
}
