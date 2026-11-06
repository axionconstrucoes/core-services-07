// Autorização INDIVIDUAL de acesso ao e-mail corporativo por colaborador — tipos (puro, sem React/rede).
// Distingue ACEITE (consentimento registrado por e-mail) de AUTORIZAÇÃO TÉCNICA (OAuth/Google Workspace).
// Nada aqui envia e-mail nem coleta mensagens.

export const EMAIL_ACCESS_TEXT_VERSION = "v1";

export type ConsentStatus = "SOLICITADA" | "ACEITE_REGISTRADO" | "RECUSADA" | "REVOGADA" | "EXPIRADA";
export type TechnicalAuthorization = "NENHUMA" | "OAUTH_CONFIRMADA";
export type ReplyClassification = "AUTORIZO" | "NAO_AUTORIZO" | "PENDENTE_REVISAO";

/** Dados originais da mensagem de resposta, preservados como chegaram (nunca reescritos). */
export interface OriginalReply {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string; // remetente como recebido
  receivedAt: string; // ISO
  bodyHash: string; // SHA-256 hex do corpo original
  classification: ReplyClassification;
  linkedToRequest: boolean;
  linkReason: string;
}

export interface EmailAccessAuthorization {
  id: string;
  collaboratorEmail: string;
  mailbox: string; // caixa autorizada (normalmente a do próprio colaborador)
  folders: string[]; // abrangência declarada na solicitação
  purpose: string;
  textVersion: string;
  requestMessageId: string; // Message-ID da solicitação enviada
  requestedAt: string;
  requestExpiresAt: string; // prazo para responder
  accessDurationDays: number;
  consentStatus: ConsentStatus;
  technicalAuthorization: TechnicalAuthorization;
  acceptedAt: string | null;
  accessExpiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  acceptedReply: OriginalReply | null;
  /** Respostas que não valem (outro remetente, sem vínculo, ambíguas): preservadas para revisão humana. */
  pendingReviewReplies: OriginalReply[];
}
