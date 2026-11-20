// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node).
//
// ESTADOS DE SAÍDA DE UM E-MAIL DO ACC (vale para todos os fluxos com registro persistente de entrega).
//
//   NOT_ACCEPTED          — gerado/planejado, mas o provedor ainda NÃO aceitou (PENDING/FAILED/SUPPRESSED/SKIPPED).
//   ACCEPTED_BY_PROVIDER  — o provedor (Gmail API) devolveu id de mensagem. Isso NÃO prova que chegou à caixa do
//                           destinatário: é o único estado que um envio bem-sucedido grava (status SENT nas tabelas).
//   DELIVERED             — entrega COMPROVADA por evidência registrada (nunca presumida; ver evaluateDeliveryEvidence).
//   BOUNCED               — o provedor/servidor de destino devolveu a mensagem (NDR) — evidência registrada.
//
// Regra de honestidade: nada é "entregue" porque foi gerado, porque foi aceito ou porque o endereço coincide com o do
// usuário. DELIVERED só com evidência; a gravação no banco recusa DELIVERED sem evidência suficiente (migration
// 20261121130000_outbound_delivery_states).

export type OutboundDeliveryState = "NOT_ACCEPTED" | "ACCEPTED_BY_PROVIDER" | "DELIVERED" | "BOUNCED";

/** Estados gravados em delivery_state (NULL = ainda não aceito). */
export const PERSISTED_DELIVERY_STATES = ["ACCEPTED_BY_PROVIDER", "DELIVERED", "BOUNCED"] as const;
export type PersistedDeliveryState = (typeof PERSISTED_DELIVERY_STATES)[number];

/**
 * Tipos de evidência de entrega.
 *  - RECIPIENT_REPLY             resposta do próprio destinatário correlacionada à mensagem (prova de recebimento).
 *  - RECIPIENT_MAILBOX_VERIFIED  mensagem localizada na caixa de entrada do destinatário (Workspace, leitura autorizada).
 *  - SENT_COPY_VERIFIED          cópia localizada em Enviados da conta remetente (prova só de que SAIU — insuficiente sozinha).
 *  - NO_BOUNCE_AFTER_WINDOW      nenhuma devolução (NDR) recebida após a janela de observação (insuficiente sozinha).
 *  - BOUNCE_RECEIVED             devolução (NDR) recebida — leva a BOUNCED.
 */
export const DELIVERY_EVIDENCE_KINDS = ["RECIPIENT_REPLY", "RECIPIENT_MAILBOX_VERIFIED", "SENT_COPY_VERIFIED", "NO_BOUNCE_AFTER_WINDOW", "BOUNCE_RECEIVED"] as const;
export type DeliveryEvidenceKind = (typeof DELIVERY_EVIDENCE_KINDS)[number];

export interface DeliveryEvidence {
  kind: DeliveryEvidenceKind;
  /** Quando a evidência foi observada (ISO). */
  observedAt: string;
  /** Referência rastreável da evidência (id Gmail da resposta/NDR, Message-ID verificado, execução da verificação). */
  reference: string;
}

/** Janela mínima sem devolução para que NO_BOUNCE_AFTER_WINDOW conte como evidência (devoluções chegam em minutos/horas). */
export const NO_BOUNCE_MIN_WINDOW_HOURS = 24;

/**
 * Estado resultante de um conjunto de evidências sobre uma mensagem JÁ aceita pelo provedor.
 * DELIVERED exige evidência direta (resposta do destinatário ou mensagem na caixa dele) OU a combinação
 * "cópia verificada em Enviados" + "nenhuma devolução após a janela". Evidência inválida é ignorada.
 */
export function evaluateDeliveryEvidence(evidences: readonly DeliveryEvidence[], acceptedAt: string | null): PersistedDeliveryState {
  const valid = evidences.filter(isValidEvidence);
  if (valid.some((e) => e.kind === "BOUNCE_RECEIVED")) return "BOUNCED";
  if (valid.some((e) => e.kind === "RECIPIENT_REPLY" || e.kind === "RECIPIENT_MAILBOX_VERIFIED")) return "DELIVERED";
  const sentCopy = valid.some((e) => e.kind === "SENT_COPY_VERIFIED");
  const noBounce = valid.some((e) => e.kind === "NO_BOUNCE_AFTER_WINDOW" && windowElapsed(acceptedAt, e.observedAt));
  return sentCopy && noBounce ? "DELIVERED" : "ACCEPTED_BY_PROVIDER";
}

function isValidEvidence(e: DeliveryEvidence | null | undefined): e is DeliveryEvidence {
  return Boolean(e && (DELIVERY_EVIDENCE_KINDS as readonly string[]).includes(e.kind) && typeof e.reference === "string" && e.reference.trim().length > 0 && !Number.isNaN(Date.parse(e.observedAt)));
}

function windowElapsed(acceptedAt: string | null, observedAt: string): boolean {
  if (!acceptedAt || Number.isNaN(Date.parse(acceptedAt))) return false;
  return Date.parse(observedAt) - Date.parse(acceptedAt) >= NO_BOUNCE_MIN_WINDOW_HOURS * 3600e3;
}

/** Estado exibível de uma linha de entrega (status da tabela + delivery_state). */
export function outboundStateOf(row: { status: string; deliveryState?: string | null }): OutboundDeliveryState {
  if (row.status !== "SENT") return "NOT_ACCEPTED";
  const state = row.deliveryState ?? "ACCEPTED_BY_PROVIDER";
  return (PERSISTED_DELIVERY_STATES as readonly string[]).includes(state) ? (state as PersistedDeliveryState) : "ACCEPTED_BY_PROVIDER";
}

export const OUTBOUND_STATE_LABELS: Record<OutboundDeliveryState, string> = {
  NOT_ACCEPTED: "Não aceito pelo provedor",
  ACCEPTED_BY_PROVIDER: "Aceito pelo provedor (entrega não comprovada)",
  DELIVERED: "Entrega comprovada por evidência",
  BOUNCED: "Devolvido (não entregue)",
};

// ---------------------------------------------------------------- falhas de envio

/**
 * Classe de uma falha de envio, para decidir a RETENTATIVA (fail-closed contra duplicidade):
 *  - RETRYABLE  a mensagem com certeza NÃO saiu e a causa pode ser transitória (429, conexão não estabelecida,
 *               bloqueio antes de qualquer chamada de rede, erro sem diagnóstico do provedor) — retenta até o limite.
 *  - PERMANENT  o provedor RECUSOU (credencial, escopo, 4xx): repetir falha de novo — falha final imediata, visível.
 *  - UNCERTAIN  o pedido PODE ter sido processado (5xx, timeout, conexão perdida, 2xx sem id) — NUNCA retentar
 *               automaticamente (duplicaria); exige verificação humana em Enviados.
 * Usa só o diagnóstico normalizado do EmailSendError (allowlist de gmail-send-error.ts).
 */
export type SendFailureClass = "RETRYABLE" | "PERMANENT" | "UNCERTAIN";

export function classifySendFailure(error: unknown): SendFailureClass {
  const diagnostic = error && typeof error === "object" ? (error as { diagnostic?: unknown }).diagnostic : undefined;
  const classification = diagnostic && typeof diagnostic === "object" ? (diagnostic as { classification?: unknown }).classification : undefined;
  if (classification === "DEFINITIVE") return "PERMANENT";
  if (classification === "UNCERTAIN") return "UNCERTAIN";
  return "RETRYABLE";
}

/** Valor gravado em failure_class: RETRYABLE (ainda há tentativas), PERMANENT, UNCERTAIN ou EXHAUSTED (limite atingido). */
export type PersistedFailureClass = SendFailureClass | "EXHAUSTED";

/** Decide o registro de uma falha: classe final e se a linha sai da fila (terminal). */
export function failureOutcome(failure: SendFailureClass, attemptsAfterThis: number, maxAttempts: number): { failureClass: PersistedFailureClass; terminal: boolean } {
  if (failure === "PERMANENT" || failure === "UNCERTAIN") return { failureClass: failure, terminal: true };
  return attemptsAfterThis >= maxAttempts ? { failureClass: "EXHAUSTED", terminal: true } : { failureClass: "RETRYABLE", terminal: false };
}

export const FAILURE_CLASS_NOTES: Record<PersistedFailureClass, string> = {
  RETRYABLE: "falha transitória; nova tentativa automática",
  PERMANENT: "recusa definitiva do provedor; sem nova tentativa automática — corrigir a causa",
  UNCERTAIN: "resultado incerto (o provedor pode ter aceitado); sem nova tentativa automática — verificar Enviados antes de reenviar",
  EXHAUSTED: "limite de tentativas atingido; sem nova tentativa automática",
};
