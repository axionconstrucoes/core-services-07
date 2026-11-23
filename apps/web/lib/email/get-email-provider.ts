import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";
import { FakeEmailProvider } from "./fake-email-provider";
import { GmailEmailProvider } from "./gmail-email-provider";
import { resolveEmailProviderName } from "./gmail-auth";
import type { EmailProvider } from "./email-provider";
import { GovernedEmailProvider } from "./governed-email-provider";
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
