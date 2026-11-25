// PONTO ÚNICO de estrangulamento do envio automático de e-mail (sem "server-only": testável por script Node).
//
// Envolve QUALQUER EmailProvider (Gmail ou Fake): antes de delegar, consulta o governador (alert-send-governor.ts). Bloqueado =>
// lança AlertSendBlockedError (EmailSendError sanitizado) e NADA chega ao provedor interno. Permitido => delega sem alterar a mensagem;
// a trava de saída do piloto e o perfil do projeto continuam aplicados DENTRO do provedor interno (o governador só restringe).
// Falha CERTA de envio (RETRYABLE/PERMANENT) devolve a cota; falha INCERTA mantém a cota (nunca reenviar quando incerto).

import { EmailSendError, type EmailProvider, type SendEmailInput, type SendEmailResult } from "./email-provider";
import { classifySendFailure } from "./outbound-delivery";
import { GOVERNOR_ACTIONS, ALERT_TYPE_CATALOG, admitAlertSend, parseGovernorConfig, peekAlertCapacity, releaseAdmission, type AlertGovernanceContext, type CapacityResult, type GovernorEnv, type GovernorLedger, type GovernorSuppressionReason } from "./alert-send-governor";

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

  private readonly deferredAudited = new Set<string>();

  /**
   * Portão ANTES da reivindicação (claim) da linha: há capacidade agora? Negado => o chamador NÃO reivindica nem conta tentativa; a
   * mensagem fica ADIADA na fila e é retomada na janela seguinte. Audita ALERT_GOVERNOR_DEFERRED (uma vez por motivo/tipo por instância).
   * Nunca lança: falha inesperada => permitido (o envio em si continua fail-closed em admitAlertSend).
   */
  async checkCapacity(governance: AlertGovernanceContext): Promise<CapacityResult> {
    try {
      const now = (this.options.now ?? (() => new Date()))();
      const config = parseGovernorConfig((this.options.env ?? (() => process.env))());
      const lazy = this.options.ledger;
      let instance: GovernorLedger | null | undefined;
      const ledger = (): GovernorLedger => {
        if (instance === undefined) instance = lazy ? lazy() : null;
        if (!instance) throw new Error("ledger indisponível");
        return instance;
      };
      const newId = this.options.newId ?? (() => globalThis.crypto.randomUUID());
      const result = await peekAlertCapacity({ config, ctx: governance, ledger: lazy ? ledger : null, now, newId });
      if (!result.allowed && governance.projectId) {
        const key = `${result.reason}:${governance.type}:${governance.projectId}:${governance.priority ?? ""}`;
        if (!this.deferredAudited.has(key)) {
          this.deferredAudited.add(key);
          try {
            await ledger().record({
              action: GOVERNOR_ACTIONS.DEFERRED,
              projectId: governance.projectId,
              entityId: newId(),
              detail: { outcome: "ADIADO", reason: result.reason, type: governance.type, source: governance.type ? ALERT_TYPE_CATALOG[governance.type] : null, priority: governance.priority ?? null, at: now.toISOString() },
            });
          } catch {
            // auditoria best-effort: o adiamento continua valendo
          }
        }
      }
      return result;
    } catch {
      return { allowed: true };
    }
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

/** Portão por duck-typing: provedores sem checkCapacity (FAKE/Gmail diretos, testes) sempre permitem — comportamento anterior. */
export async function checkAlertCapacity(provider: unknown, governance: AlertGovernanceContext): Promise<CapacityResult> {
  const p = provider as { checkCapacity?: (g: AlertGovernanceContext) => Promise<CapacityResult> } | null;
  if (!p || typeof p.checkCapacity !== "function") return { allowed: true };
  return p.checkCapacity(governance);
}
