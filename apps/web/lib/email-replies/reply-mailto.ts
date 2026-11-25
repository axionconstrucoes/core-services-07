// Atalhos "RESPONDER POR E-MAIL" (mailto) dos alertas com processamento real — PURO, sem I/O.
//
// Cada link abre um e-mail NOVO já endereçado a <caixa-acc>+alerta-<token do item>@domínio, com o código visível no
// assunto e um corpo curto pré-preenchido (só o comando e os campos a completar — NUNCA dados do alerta, nomes ou
// valores). Codificação RFC 6068 (encodeURIComponent: espaço = %20, quebra de linha = %0D%0A); cada link < 2000
// caracteres (limite seguro de clientes de e-mail e navegadores). Sem caixa/token válidos não há link (nunca parcial).
// Só tipos com processamento efetivo por e-mail recebem estes links (ver EMAIL_REPLY_PROCESSABLE_KINDS).

import { buildAlertReplyAddress } from "@/lib/email/alert-reply-address";
import { isSpecialistEmailEnabled } from "@/lib/email-replies/specialist-flag";

// ESPECIALISTA (Lote 3): consulta ESCRITA ao Expert da área — NÃO altera o item, não consome o token e não muda prazos.
export type ReplyMailtoAction = "RESOLVIDO" | "EM_ANDAMENTO" | "ENVIAR_PARA" | "ESPECIALISTA";
export const REPLY_MAILTO_ORDER: readonly ReplyMailtoAction[] = ["RESOLVIDO", "EM_ANDAMENTO", "ENVIAR_PARA", "ESPECIALISTA"];
export const MAILTO_MAX_LENGTH = 2000;

export type ReplyMailtoLinks = Record<Exclude<ReplyMailtoAction, "ESPECIALISTA">, string> & { ESPECIALISTA?: string };

export const REPLY_MAILTO_LABELS: Record<ReplyMailtoAction, string> = {
  RESOLVIDO: "RESOLVIDO",
  EM_ANDAMENTO: "EM ANDAMENTO",
  ENVIAR_PARA: "ENVIAR PARA",
  ESPECIALISTA: "ESPECIALISTA",
};

export interface ReplyMailtoInput {
  mailbox: string;
  token: string;
  /** Código visível do item (vai no assunto; ex.: "ACC-ALERTA:ABCD1234" ou "ACC-SSMA:ABCD1234"). */
  visibleCode: string;
  /** Exige anexo de evidência no RESOLVIDO (ALTO/CRÍTICO; foto na ação SSMA). Só muda o texto-guia do corpo. */
  evidenceAttachment?: "REQUIRED_FILE" | "REQUIRED_PHOTO" | "OPTIONAL";
  /** ALTO/CRÍTICO exigem horário na previsão. */
  forecastNeedsTime?: boolean;
}

const CRLF = "\r\n";

/** Textos-guia do corpo pré-preenchido. Na resposta, são REMOVIDOS antes da interpretação (nunca contam como nota). */
export const REPLY_MAILTO_PLACEHOLDERS: readonly string[] = [
  "(anexe a FOTO de evidência — JPG ou PNG até 15 MB)",
  "(descreva a solução e anexe a evidência)",
  "(descreva a solução)",
  "(providência em curso)",
  "(nome completo ou e-mail corporativo)",
  "(escreva aqui a sua pergunta ao especialista da área)",
];

/** Remove os textos-guia do mailto (o comando continua; o que o remetente escreveu fica). */
export function stripReplyPlaceholders(text: string): string {
  let out = text;
  for (const placeholder of REPLY_MAILTO_PLACEHOLDERS) out = out.split(placeholder).join("");
  return out
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function bodyFor(action: ReplyMailtoAction, input: ReplyMailtoInput): string {
  if (action === "RESOLVIDO") {
    const evidence =
      input.evidenceAttachment === "REQUIRED_PHOTO"
        ? REPLY_MAILTO_PLACEHOLDERS[0]
        : input.evidenceAttachment === "REQUIRED_FILE"
          ? REPLY_MAILTO_PLACEHOLDERS[1]
          : REPLY_MAILTO_PLACEHOLDERS[2];
    return ["RESOLVIDO: ", "", evidence].join(CRLF);
  }
  if (action === "EM_ANDAMENTO") {
    return [`EM ANDAMENTO: ${REPLY_MAILTO_PLACEHOLDERS[3]}`, input.forecastNeedsTime === false ? "Previsão: dd/mm/aaaa" : "Previsão: dd/mm/aaaa hh:mm"].join(CRLF);
  }
  if (action === "ESPECIALISTA") return [`ESPECIALISTA: ${REPLY_MAILTO_PLACEHOLDERS[5]}`, ""].join(CRLF);
  return [`ENVIAR PARA: ${REPLY_MAILTO_PLACEHOLDERS[4]}`, "Justificativa: "].join(CRLF);
}

/** Código visível seguro para o assunto (letras, dígitos, ":" e "-"); outra coisa => vazio. */
function safeCode(code: string): string {
  return /^[A-Za-z0-9:_-]{1,40}$/.test(code) ? code : "";
}

export function buildReplyMailto(action: ReplyMailtoAction, input: ReplyMailtoInput): string | null {
  let address: string;
  try {
    address = buildAlertReplyAddress(input.mailbox, input.token);
  } catch {
    return null;
  }
  const code = safeCode(input.visibleCode);
  const subject = `${REPLY_MAILTO_LABELS[action]}${code ? ` [${code}]` : ""}`;
  // O endereço é ASCII restrito (validado em buildAlertReplyAddress): "+" e "@" são permitidos no "to" do mailto.
  const url = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyFor(action, input))}`;
  return url.length < MAILTO_MAX_LENGTH ? url : null;
}

/** Os três atalhos de tratamento (+ ESPECIALISTA quando habilitado) ou null (nunca um conjunto parcial). */
export function buildReplyMailtoLinks(input: ReplyMailtoInput & { specialist?: boolean }): ReplyMailtoLinks | null {
  const links = {} as ReplyMailtoLinks;
  // ESPECIALISTA só entra com ACC_EMAIL_SPECIALIST_ENABLED (ou specialist explícito): nunca um atalho que o worker recusaria.
  const withSpecialist = input.specialist ?? isSpecialistEmailEnabled();
  for (const action of REPLY_MAILTO_ORDER) {
    if (action === "ESPECIALISTA" && !withSpecialist) continue;
    const url = buildReplyMailto(action, input);
    if (!url) return null;
    links[action] = url;
  }
  return links;
}

/** Validação usada pelo template: só mailto para a caixa +alerta-, sem espaços/quebras, < 2000 caracteres. */
export function isSafeReplyMailto(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length < MAILTO_MAX_LENGTH && /^mailto:[a-z0-9._-]+\+alerta-[A-Za-z0-9_-]{16,64}@[a-z0-9.-]+\?subject=[^\s"'<>]*&body=[^\s"'<>]*$/i.test(value);
}
