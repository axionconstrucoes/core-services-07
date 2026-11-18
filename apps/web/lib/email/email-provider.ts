// Puro (só tipos + uma classe de erro), sem I/O — deliberadamente sem
// "server-only" para ser importável tanto pelo bundler do Next.js quanto
// por um script Node standalone (mesmo padrão de
// apps/web/lib/ai/providers/types.ts).
//
// Imagem embutida por Content-ID (ex.: logo da assinatura institucional
// ACC) — só tem efeito quando `html` também está presente (vira
// multipart/related envolvendo o multipart/alternative existente).
// `contentBase64` já vem codificado (nunca lido de disco aqui — isso é
// responsabilidade de quem monta o SendEmailInput).
export interface InlineImageAttachment {
  cid: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
}

// Contrato mínimo de envio de email. "from" NÃO é escolhido pelo caller —
// cada provider resolve internamente sua própria mailbox de envio e a
// devolve em SendEmailResult, nunca a recebe como input arbitrário.
export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  // Corpo HTML opcional — quando presente, o provider envia
  // multipart/alternative (text/plain + text/html); quando ausente,
  // continua exatamente como antes (text/plain puro). Nenhum caller
  // existente precisa mudar.
  html?: string;
  // Imagens inline referenciadas por "cid:" dentro de `html` — ignorado
  // quando `html` está ausente. Nenhum caller existente precisa mudar.
  inlineImages?: InlineImageAttachment[];
  // Cópia (Cc). Só o perfil do PILOTO por projeto a preenche (cópia institucional obrigatória, ver project-pilot-profile.ts); nenhum fluxo
  // de aplicação define Cc por conta própria. Fora do piloto o campo é removido pelos guards.
  cc?: string[];
  replyTo?: string;
  // Contexto que AUTORIZA um Reply-To: só mensagens de uma conversa de
  // alerta de risco (outbox + conversa válidas) podem pedir Reply-To, e
  // mesmo assim o guard do piloto valida formato/caixa/domínio/token
  // (lib/email/pilot-outbound-guard.ts: resolveGuardedReplyTo). Sem este
  // contexto, qualquer Reply-To é removido em modo piloto.
  replyToContext?: AlertReplyToContext;
  // Continuidade de thread (respostas do ACC dentro da mesma conversa de
  // alerta): In-Reply-To / References. Nunca destinatários — o guard do
  // piloto não precisa tocá-los.
  inReplyTo?: string;
  references?: string[];
  // Contexto da assistente AXIA para o cabeçalho do e-mail (opcional; sem ele abre a ajuda geral).
  vera?: VeraEmailHint;
  // Contexto do PILOTO por projeto (ver project-pilot-profile.ts): projeto, participante simulado e nível de escalonamento para a
  // identificação da mensagem. Só rótulos curtos e ids — nunca o endereço do destinatário lógico. Sem ele, o projeto vem de `vera.projectId`.
  pilot?: PilotMessageContext;
  correlationId: string;
}

export interface PilotMessageContext {
  projectId?: string | null;
  participantLabel?: string | null;
  escalationLevel?: string | null;
  /** Remetente SOLICITADO (identidade autenticada). Ausente => identidade institucional do ACC. Validado e resolvido pelo perfil do piloto; nunca livre. */
  senderEmail?: string | null;
  /** Mensagem OPERACIONAL do piloto: mantém To/Cc/From/Reply-To travados, mas sem a faixa e a etiqueta de teste. */
  operational?: boolean;
}

// Dica de contexto do botão "Fale com a AXIA" que o provider acrescenta ao cabeçalho do e-mail (ver
// branding/vera-email-header.ts). Só ids (UUID) e um tipo fixo — nunca dado pessoal ou contratual.
export interface VeraEmailHint {
  projectId?: string | null;
  context?: "geral" | "alerta" | "providencia" | "ssma" | "autorizacao";
  authorizationId?: string | null;
}

export type AlertReplyToContext =
  | {
      kind: "RISK_ALERT_CONVERSATION";
      outboxId: string;
      conversationId: string;
    }
  | {
      // Aviso de ação corretiva SSMA (escopo restrito): o token do Reply-To é registrado (hash) na auditoria da ação antes do envio.
      kind: "SSMA_CORRECTIVE_ACTION";
      actionId: string;
      recordId: string;
    };

// Resultado normalizado — nunca expõe a resposta raw do provider ao domínio.
export interface SendEmailResult {
  provider: string;
  from: string;
  providerMessageId: string;
  providerThreadId: string;
  messageIdHeader: string;
  sentAt: string; // ISO datetime
  /** Destinatário principal e cópias EFETIVAMENTE usados no transporte (rastreabilidade; só preenchidos em mensagens do piloto). */
  to?: string;
  cc?: string[];
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

// Erro sanitizado de envio — nunca deve carregar secrets/tokens/headers brutos.
export class EmailSendError extends Error {
  /** Diagnóstico normalizado e seguro (allowlist) da falha do provedor — nunca o erro bruto. */
  readonly diagnostic?: Readonly<Record<string, string | number | null>>;
  constructor(message: string, diagnostic?: Readonly<Record<string, string | number | null>>) {
    super(message);
    this.name = "EmailSendError";
    this.diagnostic = diagnostic;
  }
}
