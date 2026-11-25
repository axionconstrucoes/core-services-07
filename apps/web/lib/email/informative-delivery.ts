// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node com armazenamento falso/PGlite).
//
// Entrega com OUTBOX PERSISTENTE dos alertas informativos (acidente SSMA, falha técnica, revisão de impacto de versão):
// uma linha por (evento, destinatário) — chave única no banco —, reivindicação atômica antes do envio, tentativas
// limitadas e classificadas, e a regra central de honestidade:
//   * SENT (= ACEITO PELO PROVEDOR) só é gravado DEPOIS que o provedor devolve o id da mensagem;
//   * uma falha ao GRAVAR depois do aceite NUNCA devolve a linha à fila (não reenviar o que já saiu);
//   * falha PERMANENTE/INCERTA não é retentada automaticamente; transitória retenta até INFORMATIVE_MAX_ATTEMPTS.
// A entrega efetiva ao destinatário NÃO é afirmada aqui (ver outbound-delivery.ts).

import { FAILURE_CLASS_NOTES, classifySendFailure, failureOutcome, type PersistedFailureClass } from "./outbound-delivery";

export const INFORMATIVE_MAX_ATTEMPTS = 5;
/** Reivindicação vigente: outra execução não envia a mesma linha nesse intervalo (execução que morreu libera depois). */
export const INFORMATIVE_LEASE_MS = 10 * 60 * 1000;

export interface InformativeDeliveryRow {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  attemptCount: number;
  /** null/RETRYABLE => ainda pode ser tentada; PERMANENT/UNCERTAIN/EXHAUSTED => terminal. */
  failureClass: PersistedFailureClass | null;
}

export interface AcceptedSend {
  provider: string;
  providerMessageId: string;
  sentAt: string;
}

export interface InformativeDeliveryStore {
  /** Cria (idempotente pela chave única evento × destinatário) e devolve a linha atual. */
  ensure(recipient: { email: string; name: string | null }): Promise<InformativeDeliveryRow>;
  /** UPDATE condicional atômico: só uma execução vence; conta a tentativa. */
  claim(id: string, nowIso: string): Promise<boolean>;
  /** SENT + delivery_state ACCEPTED_BY_PROVIDER (nunca DELIVERED). Lança se não conseguir gravar. */
  markAccepted(id: string, accepted: AcceptedSend): Promise<void>;
  markFailed(id: string, input: { error: string; failureClass: PersistedFailureClass }): Promise<void>;
}

export interface InformativeDeliverySummary {
  /** Aceitas pelo provedor nesta execução (não é entrega comprovada). */
  accepted: number;
  alreadyAccepted: number;
  /** Falhas transitórias com nova tentativa automática. */
  retryableFailures: number;
  /** Falhas terminais (permanente, incerta ou limite atingido) — exigem ação humana. */
  terminalFailures: number;
  /** Linhas já terminais em execução anterior (não retentadas). */
  terminalSkipped: number;
  /** Reivindicadas por outra execução (não enviadas aqui — sem duplicidade). */
  claimedElsewhere: number;
  /** Aceitas pelo provedor mas sem gravação do aceite (a linha NÃO volta à fila). */
  acceptedUnrecorded: number;
}

export interface InformativeAuditEvent {
  action: "INFORMATIVE_EMAIL_ACCEPTED" | "INFORMATIVE_EMAIL_FAILED" | "INFORMATIVE_EMAIL_ACCEPTED_UNRECORDED";
  detail: string;
}

/** Erro sanitizado: só a mensagem do EmailSendError (já sem segredos) e no máximo 500 caracteres. */
export function sanitizeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha desconhecida";
  return message.replace(/(token|secret|password|authorization|bearer)\s*[:=]?\s*\S+/gi, "$1=[REMOVIDO]").slice(0, 500);
}

export async function deliverInformative(input: {
  store: InformativeDeliveryStore;
  recipients: ReadonlyArray<{ email: string; name: string | null }>;
  /** Monta e envia UMA mensagem pelo provedor do ACC (guardas do piloto aplicadas no provedor). */
  deliverMessage: (recipient: { email: string; name: string | null }) => Promise<AcceptedSend>;
  audit: (event: InformativeAuditEvent) => Promise<void>;
  nowIso: string;
  label: string;
}): Promise<InformativeDeliverySummary> {
  const summary: InformativeDeliverySummary = { accepted: 0, alreadyAccepted: 0, retryableFailures: 0, terminalFailures: 0, terminalSkipped: 0, claimedElsewhere: 0, acceptedUnrecorded: 0 };
  const auditSafe = async (event: InformativeAuditEvent) => {
    try { await input.audit(event); } catch { /* auditoria nunca altera o resultado do envio */ }
  };
  const seen = new Set<string>();
  for (const raw of input.recipients) {
    const recipient = { email: raw.email.trim().toLowerCase(), name: raw.name };
    if (!recipient.email || seen.has(recipient.email)) continue;
    seen.add(recipient.email);
    const row = await input.store.ensure(recipient);
    if (row.status === "SENT") { summary.alreadyAccepted += 1; continue; }
    if ((row.failureClass && row.failureClass !== "RETRYABLE") || row.attemptCount >= INFORMATIVE_MAX_ATTEMPTS) { summary.terminalSkipped += 1; continue; }
    if (!(await input.store.claim(row.id, input.nowIso))) { summary.claimedElsewhere += 1; continue; }
    const attempt = row.attemptCount + 1;

    let accepted: AcceptedSend;
    try {
      accepted = await input.deliverMessage(recipient);
    } catch (error) {
      const outcome = failureOutcome(classifySendFailure(error), attempt, INFORMATIVE_MAX_ATTEMPTS);
      const message = sanitizeDeliveryError(error);
      await input.store.markFailed(row.id, { error: message, failureClass: outcome.failureClass });
      if (outcome.terminal) summary.terminalFailures += 1;
      else summary.retryableFailures += 1;
      await auditSafe({ action: "INFORMATIVE_EMAIL_FAILED", detail: `${input.label}: tentativa ${attempt}/${INFORMATIVE_MAX_ATTEMPTS} falhou (${outcome.failureClass}: ${FAILURE_CLASS_NOTES[outcome.failureClass]}). ${message}` });
      continue;
    }

    // O provedor JÁ aceitou: daqui em diante nada pode devolver a linha à fila.
    let recorded = false;
    for (let i = 0; i < 2 && !recorded; i += 1) {
      try { await input.store.markAccepted(row.id, accepted); recorded = true; } catch { /* tenta gravar mais uma vez */ }
    }
    if (recorded) {
      summary.accepted += 1;
      await auditSafe({ action: "INFORMATIVE_EMAIL_ACCEPTED", detail: `${input.label}: aceito pelo provedor ${accepted.provider} (${accepted.providerMessageId}) em ${accepted.sentAt}. Aceite do provedor não é confirmação de entrega.` });
    } else {
      summary.acceptedUnrecorded += 1;
      // Melhor esforço: tira a linha da fila como INCERTA (terminal) para que a expiração da reivindicação não reenvie.
      let fenced = false;
      try {
        await input.store.markFailed(row.id, { error: `Aceito pelo provedor (${accepted.providerMessageId}), mas a gravação do aceite falhou.`, failureClass: "UNCERTAIN" });
        fenced = true;
      } catch { /* banco indisponível: a reivindicação vigente segura a linha até expirar */ }
      await auditSafe({ action: "INFORMATIVE_EMAIL_ACCEPTED_UNRECORDED", detail: `${input.label}: aceito pelo provedor ${accepted.provider} (${accepted.providerMessageId}), mas o aceite não pôde ser gravado. ${fenced ? "Linha marcada como resultado INCERTO (sem reenvio automático)" : "Linha segue reivindicada (sem reenvio até a expiração)"}; conferir Enviados.` });
    }
  }
  return summary;
}

/** true quando nenhuma comunicação terminou em falha (aceites e linhas já aceitas contam como sucesso). */
export function informativeDeliveryOk(summary: InformativeDeliverySummary): boolean {
  return summary.retryableFailures === 0 && summary.terminalFailures === 0 && summary.terminalSkipped === 0 && summary.acceptedUnrecorded === 0;
}
