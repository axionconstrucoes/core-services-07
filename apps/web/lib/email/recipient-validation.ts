// Validação PURA de destinatário de e-mail e classificação de domínio (sem rede, sem banco, sem "server-only": testável em Node).
// Espelho de public.acc_email_normalize / public.acc_recipient_domain_status (migration 20261127100000); a paridade é provada em
// scripts/test-destinatarios-externos-realpg.mjs. A validação que vale é a do SERVIDOR (server action) e a do banco; o atributo
// type="email" do formulário é só conforto de digitação.

export const RECIPIENT_LIMITS = { maxTotal: 254, maxLocal: 64, maxLabel: 63, minTotal: 6 } as const;

const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const RESERVED_DOMAIN_RE = /(^|\.)(example\.(com|net|org)|example|invalid|test|localhost|local)$/;

export type RecipientErrorCode = "EMPTY" | "TOO_LONG" | "TOO_SHORT" | "CONTROL_CHARS" | "MULTIPLE" | "FORMAT" | "LOCAL_DOTS" | "RESERVED_DOMAIN";

export type RecipientValidation = { ok: true; email: string; domain: string } | { ok: false; code: RecipientErrorCode; message: string };

const MESSAGES: Record<RecipientErrorCode, string> = {
  EMPTY: "Informe o e-mail do destinatário.",
  TOO_LONG: "O e-mail do destinatário excede 254 caracteres.",
  TOO_SHORT: "O e-mail do destinatário é curto demais para ser válido.",
  CONTROL_CHARS: "O e-mail do destinatário contém quebra de linha ou caractere de controle.",
  MULTIPLE: "Informe UM único destinatário (sem vírgula, ponto e vírgula ou espaço).",
  FORMAT: "O e-mail do destinatário não tem um formato válido.",
  LOCAL_DOTS: "A parte antes do @ não pode começar ou terminar com ponto nem ter pontos seguidos.",
  RESERVED_DOMAIN: "O domínio do destinatário é reservado/não roteável (ex.: example.com, .test, .invalid, .local).",
};

const fail = (code: RecipientErrorCode): RecipientValidation => ({ ok: false, code, message: MESSAGES[code] });

/** Normaliza (aparar + minúsculas) e valida UM endereço. Recusa listas, quebras de linha e domínios reservados. */
export function validateRecipientEmail(raw: unknown): RecipientValidation {
  if (typeof raw !== "string") return fail("EMPTY");
  // Controle ANTES de aparar: "a@b.com\r\nBcc: x@y.com" nunca pode virar válido por truncamento.
  if (/[\u0000-\u001f\u007f\u0085\u2028\u2029]/.test(raw.replace(/^[ \t]+|[ \t]+$/g, ""))) return fail("CONTROL_CHARS");
  const v = raw.replace(/^[ \t]+|[ \t]+$/g, "").toLowerCase();
  if (v.length === 0) return fail("EMPTY");
  if (v.length > RECIPIENT_LIMITS.maxTotal) return fail("TOO_LONG");
  if (v.length < RECIPIENT_LIMITS.minTotal) return fail("TOO_SHORT");
  if (/[,;\s<>"'()[\]\\]/.test(v)) return fail("MULTIPLE");
  if (!EMAIL_RE.test(v)) return fail("FORMAT");
  const at = v.indexOf("@");
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return fail("LOCAL_DOTS");
  if (RESERVED_DOMAIN_RE.test(domain)) return fail("RESERVED_DOMAIN");
  return { ok: true, email: v, domain };
}

export type RecipientDomainStatus = "INVALID" | "INTERNO" | "PERMITIDO" | "EXTERNO";

export interface RecipientDomainEntry {
  domain: string;
  kind: "TENANT" | "PERMITIDO";
  active: boolean;
}

/** INTERNO (TENANT) | PERMITIDO | EXTERNO. Casamento EXATO do domínio — subdomínio de domínio listado NÃO herda (fail-closed). */
export function classifyRecipientDomain(raw: unknown, domains: readonly RecipientDomainEntry[]): RecipientDomainStatus {
  const v = validateRecipientEmail(raw);
  if (!v.ok) return "INVALID";
  const hit = domains.find((d) => d.active && d.domain === v.domain);
  if (!hit) return "EXTERNO";
  return hit.kind === "TENANT" ? "INTERNO" : "PERMITIDO";
}

export const EXTERNAL_REASON_MIN = 10;
export const EXTERNAL_REASON_MAX = 1000;

export type ExternalConfirmationInput = { confirmed: boolean; reason: string };

export type RecipientDecision =
  | { ok: true; email: string; domain: string; status: "INTERNO" | "PERMITIDO"; needsConfirmation: false }
  | { ok: true; email: string; domain: string; status: "EXTERNO"; needsConfirmation: true; reason: string }
  | { ok: false; code: RecipientErrorCode | "EXTERNAL_CONFIRMATION_REQUIRED" | "REASON_REQUIRED"; message: string };

/**
 * Decisão única para qualquer ponto de destinatário: válido? interno/permitido (segue) ou externo (exige confirmação explícita
 * + motivo ANTES de qualquer solicitação). Não grava nada: quem chama grava a confirmação (RPC) e só então prossegue.
 */
export function decideRecipient(raw: unknown, domains: readonly RecipientDomainEntry[], confirmation?: ExternalConfirmationInput | null): RecipientDecision {
  const v = validateRecipientEmail(raw);
  if (!v.ok) return v;
  const status = classifyRecipientDomain(v.email, domains);
  if (status === "INTERNO" || status === "PERMITIDO") return { ok: true, email: v.email, domain: v.domain, status, needsConfirmation: false };
  if (!confirmation || confirmation.confirmed !== true) {
    return { ok: false, code: "EXTERNAL_CONFIRMATION_REQUIRED", message: `O domínio ${v.domain} é externo (fora da lista da Axion). Confirme explicitamente o destinatário e informe o motivo para continuar.` };
  }
  const reason = (confirmation.reason ?? "").trim();
  if (reason.length < EXTERNAL_REASON_MIN || reason.length > EXTERNAL_REASON_MAX) {
    return { ok: false, code: "REASON_REQUIRED", message: `Informe o motivo do envio a destinatário externo (${EXTERNAL_REASON_MIN} a ${EXTERNAL_REASON_MAX} caracteres).` };
  }
  return { ok: true, email: v.email, domain: v.domain, status: "EXTERNO", needsConfirmation: true, reason };
}

/** Mensagens fixas exibidas a partir do código na URL (lista fechada: nunca se exibe texto arbitrário vindo da URL). */
export const RECIPIENT_CODE_MESSAGES: Readonly<Record<string, string>> = {
  ...MESSAGES,
  EXTERNAL_CONFIRMATION_REQUIRED: "O destinatário é externo (domínio fora da lista da Axion). Marque a confirmação e informe o motivo para continuar. Nada foi solicitado.",
  REASON_REQUIRED: `Informe o motivo do envio a destinatário externo (${EXTERNAL_REASON_MIN} a ${EXTERNAL_REASON_MAX} caracteres). Nada foi solicitado.`,
  DOMAINS_UNAVAILABLE: "Não foi possível conferir a lista de domínios permitidos. Nada foi solicitado.",
  FORBIDDEN: "Somente gestão (GESTOR, GERENTE ou ADMINISTRADOR) do projeto pode confirmar destinatário externo. Nada foi solicitado.",
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  INVALID_RECIPIENT_EMAIL: "O e-mail do destinatário não é válido.",
  CONFIRM_FAILED: "Não foi possível registrar a confirmação do destinatário externo. Nada foi solicitado.",
};

export function recipientMessageForCode(code: string | null | undefined): string | null {
  return code && Object.prototype.hasOwnProperty.call(RECIPIENT_CODE_MESSAGES, code) ? RECIPIENT_CODE_MESSAGES[code] : null;
}
