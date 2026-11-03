// Trava OPCIONAL de destino único, aplicada DEPOIS da guarda do modo piloto e ANTES de qualquer MIME ou rede.
//
// Uso: testes controlados em que só um endereço pode receber (ex.: ACC_EMAIL_ONLY_RECIPIENT=crm@axion.com.br).
// Se a variável estiver definida e o destinatário efetivo (já resolvido pela guarda do piloto) for qualquer outro,
// o envio é recusado — fail closed — sem tocar na rede. Sem a variável, não faz nada (produção não muda).
// Nunca registra corpo, assunto nem outros endereços: só confirma o destino liberado.
//
// Sem "server-only": testável por script Node.

import { EmailSendError, type SendEmailInput } from "./email-provider";

export const ONLY_RECIPIENT_ENV = "ACC_EMAIL_ONLY_RECIPIENT";

type Env = Record<string, string | undefined>;

// `projectPilotDestination`: destino único do perfil de e-mail do PROJETO PILOTO (project-pilot-profile.ts), informado SOMENTE para mensagens
// que passaram por esse perfil (To já fixado na lista do código, Cc/Bcc removidos e conferidos no MIME). Para elas, a variável global é
// satisfeita quando o destino efetivo é exatamente esse destino do piloto; mensagens dos demais projetos continuam presas ao valor global.
export function assertOnlyRecipient(
  input: SendEmailInput,
  env: Env = process.env,
  log: (message: string) => void = (m) => console.info(m),
  projectPilotDestination: string | null = null
): SendEmailInput {
  const raw = env[ONLY_RECIPIENT_ENV];
  if (raw === undefined || raw.trim() === "") return input;

  const only = raw.trim().toLowerCase();
  if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(only)) {
    throw new EmailSendError(`${ONLY_RECIPIENT_ENV} inválido — envio bloqueado antes de qualquer chamada de rede.`);
  }

  const to = input.to.trim().toLowerCase();
  if (projectPilotDestination && to === projectPilotDestination.trim().toLowerCase()) {
    log(`[email-only-recipient] destino do piloto do projeto conferido: ${to} (envio liberado)`);
    return input;
  }
  if (to !== only) {
    throw new EmailSendError("Destino efetivo diferente do único destino autorizado para este envio — bloqueado antes de qualquer chamada de rede.");
  }

  log(`[email-only-recipient] destino efetivo conferido: ${only} (envio liberado)`);
  return input;
}
