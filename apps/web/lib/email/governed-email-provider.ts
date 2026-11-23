// PONTO ÚNICO de estrangulamento do envio automático de e-mail (sem "server-only": testável por script Node).
//
// Envolve QUALQUER EmailProvider (Gmail ou Fake): antes de delegar, consulta o governador (alert-send-governor.ts). Bloqueado =>
// lança AlertSendBlockedError (EmailSendError sanitizado) e NADA chega ao provedor interno. Permitido => delega sem alterar a mensagem;
// a trava de saída do piloto e o perfil do projeto continuam aplicados DENTRO do provedor interno (o governador só restringe).
// Falha CERTA de envio (RETRYABLE/PERMANENT) devolve a cota; falha INCERTA mantém a cota (nunca reenviar quando incerto).

import { EmailSendError, type EmailProvider, type SendEmailInput, type SendEmailResult } from "./email-provider";
import { classifySendFailure } from "./outbound-delivery";
import { admitAlertSend, parseGovernorConfig, releaseAdmission, type GovernorEnv, type GovernorLedger, type GovernorSuppressionReason } from "./alert-send-governor";

export class AlertSendBlockedError extends EmailSendError {
  readonly reason: GovernorSuppressionReason;
  constructor(reason: GovernorSuppressionReason, detail: string) {
    super(`Envio bloqueado pelo governador de alertas (${reason}): ${detail}`, { classification: "BLOCKED_BY_GOVERNOR", reason });
    this.name = "AlertSendBlockedError";
    this.reason = reason;
  }
}

export interface GovernedEmailProviderOptions {
  inner: EmailProvider;
  /** Lê o ambiente a cada envio (padrão: process.env). */
  env?: () => GovernorEnv;
  /** Fábrica preguiçosa do ledger: só é chamada quando há limite ativo ou auditoria de supressão. Pode lançar/retornar null. */
  ledger?: () => GovernorLedger | null;
  now?: () => Date;
  newId?: () => string;
}

export class GovernedEmailProvider implements EmailProvider {
  private readonly options: GovernedEmailProviderOptions;

  constructor(options: GovernedEmailProviderOptions) {
    this.options = options;
  }

  /** Provedor interno (que aplica a trava do piloto). Exposto só para verificação em testes. */
  get inner(): EmailProvider {
    return this.options.inner;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const { inner } = this.options;
    const now = (this.options.now ?? (() => new Date()))();
    const config = parseGovernorConfig((this.options.env ?? (() => process.env))());
    const lazy = this.options.ledger;
    let ledgerInstance: GovernorLedger | null | undefined;
    const ledger = (): GovernorLedger => {
      if (ledgerInstance === undefined) ledgerInstance = lazy ? lazy() : null;
      if (!ledgerInstance) throw new Error("ledger indisponível");
      return ledgerInstance;
    };
    const decision = await admitAlertSend({
      config,
      ctx: input.governance,
      ledger: lazy ? ledger : null,
      now,
      newId: this.options.newId ?? (() => globalThis.crypto.randomUUID()),
    });
    if (!decision.allow) throw new AlertSendBlockedError(decision.reason, decision.detail);
    try {
      return await inner.send(input);
    } catch (error) {
      if (classifySendFailure(error) !== "UNCERTAIN") {
        await releaseAdmission(decision.admissionId && lazy ? safeLedger(ledger) : null, decision, now, "SEND_FAILED_NOT_ACCEPTED");
      }
      throw error;
    }
  }
}

function safeLedger(get: () => GovernorLedger): GovernorLedger | null {
  try {
    return get();
  } catch {
    return null;
  }
}
