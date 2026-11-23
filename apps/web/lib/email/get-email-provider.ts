import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";
import { FakeEmailProvider } from "./fake-email-provider";
import { GmailEmailProvider } from "./gmail-email-provider";
import { resolveEmailProviderName } from "./gmail-auth";
import type { EmailProvider } from "./email-provider";
import { GovernedEmailProvider, checkAlertCapacity } from "./governed-email-provider";
import type { AlertGovernanceContext } from "./alert-send-governor";
import { createSupabaseGovernorLedger, type GovernorDbClient } from "./alert-send-governor-ledger";

// FAIL CLOSED: se AXION_EMAIL_PROVIDER=gmail e a config estiver incompleta,
// GmailEmailProvider lanca no construtor (loadGmailConfig) — nunca cai
// silenciosamente para FakeEmailProvider.
//
// Todo envio automatico passa pelo GovernedEmailProvider (governador de alertas, doc 35): kill switch, habilitacao progressiva por
// projeto/fonte/tipo, limite por hora/dia e deduplicacao. Sem variaveis ACC_ALERT_* o governador nao restringe o que o piloto ja envia
// e nao toca no banco; a trava de saida do piloto continua dentro do provedor interno (o governador nunca a afrouxa).
export function getEmailProvider(): EmailProvider {
  const providerName = resolveEmailProviderName();
  const inner: EmailProvider = providerName === "gmail" ? new GmailEmailProvider() : new FakeEmailProvider();
  return new GovernedEmailProvider({
    inner,
    // Cliente service_role criado so no servidor e so quando ha limite ativo ou auditoria de supressao a gravar.
    ledger: () => createSupabaseGovernorLedger(createSupabaseAdminClient() as unknown as GovernorDbClient),
  });
}

/**
 * Portão de capacidade para runners com outbox/claim (doc 35): chame ANTES de reivindicar a linha/grupo. Uma instância do provedor por
 * execução (a auditoria de adiamento é por instância). Falha de configuração do provedor => permitido (o envio continua fail-closed).
 */
export function createCapacityGate(): (governance: AlertGovernanceContext) => Promise<boolean> {
  let provider: EmailProvider | null | undefined;
  return async (governance) => {
    try {
      if (provider === undefined) provider = getEmailProvider();
      return (await checkAlertCapacity(provider, governance)).allowed;
    } catch {
      return true;
    }
  };
}
