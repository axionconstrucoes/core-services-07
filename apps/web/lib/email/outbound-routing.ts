// Ponto ÚNICO de roteamento de saída (usado por GmailEmailProvider e FakeEmailProvider) — puro, sem I/O, sem "server-only".
//
// Ordem fixa, obrigatória e anterior a qualquer MIME/rede:
//   1. mensagem do PROJETO PILOTO (WEG) com perfil válido → entrega direta ao colaborador + Cc institucional (project-pilot-profile.ts);
//      o perfil inválido ou o destinatário/remetente não autorizado BLOQUEIA (nunca cai para outro comportamento);
//   2. qualquer outra mensagem → guarda global do piloto (pilot-outbound-guard.ts), exatamente como antes.
// A guarda global NÃO é aplicada antes do perfil: ela reescreveria o destinatário para a caixa de contingência e destruiria a entrega direta.

import type { SendEmailInput } from "./email-provider";
import { applyPilotOutboundGuard } from "./pilot-outbound-guard";
import { applyProjectPilotProfile, type ProjectPilotRouting } from "./project-pilot-profile";

type Env = Record<string, string | undefined>;

export function prepareOutboundMessage(input: SendEmailInput, env: Env = process.env): ProjectPilotRouting {
  const routing = applyProjectPilotProfile(input, env);
  if (routing.routed) return routing;
  // Fora do projeto piloto: nenhum Cc é permitido (somente o perfil do piloto preenche Cc).
  const withoutCc = { ...input } as SendEmailInput & Record<string, unknown>;
  delete withoutCc.cc;
  delete withoutCc.bcc;
  return { input: applyPilotOutboundGuard(withoutCc as SendEmailInput), routed: false, sender: null, to: null, cc: [] };
}
