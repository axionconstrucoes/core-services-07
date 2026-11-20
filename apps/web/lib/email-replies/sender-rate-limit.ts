// Limite de taxa por remetente das respostas por e-mail — PURO, sem I/O.
//
// No máximo N mensagens processadas por remetente em 1 hora (pela data de RECEBIMENTO). O excedente NÃO é executado:
// vai para revisão humana (sem resposta automática, para não alimentar laço de e-mails). N padrão = 10, ajustável em
// ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR (1..200).

export const SENDER_RATE_LIMIT_ENV = "ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR";
export const DEFAULT_SENDER_RATE_LIMIT = 10;
export const SENDER_RATE_WINDOW_MS = 60 * 60 * 1000;

export function resolveSenderRateLimit(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env[SENDER_RATE_LIMIT_ENV]);
  return Number.isInteger(value) && value >= 1 && value <= 200 ? value : DEFAULT_SENDER_RATE_LIMIT;
}

export interface SenderActivity {
  senderEmail: string;
  receivedAt: string;
}

/** Contador em memória semeado com o histórico recente (log de mensagens processadas). */
export class SenderRateLimiter {
  private readonly bySender = new Map<string, number[]>();
  private readonly limit: number;

  constructor(limit: number, history: readonly SenderActivity[] = []) {
    this.limit = limit;
    for (const item of history) this.push(item.senderEmail, item.receivedAt);
  }

  private push(sender: string, receivedAt: string): void {
    const key = sender.trim().toLowerCase();
    const list = this.bySender.get(key) ?? [];
    list.push(new Date(receivedAt).getTime());
    this.bySender.set(key, list);
  }

  /** true = pode processar (e conta a mensagem); false = excedeu o limite na janela de 1 h anterior ao recebimento. */
  allow(senderEmail: string, receivedAt: string): boolean {
    const key = senderEmail.trim().toLowerCase();
    const at = new Date(receivedAt).getTime();
    const inWindow = (this.bySender.get(key) ?? []).filter((t) => t <= at && t > at - SENDER_RATE_WINDOW_MS).length;
    if (inWindow >= this.limit) return false;
    this.push(key, receivedAt);
    return true;
  }
}
