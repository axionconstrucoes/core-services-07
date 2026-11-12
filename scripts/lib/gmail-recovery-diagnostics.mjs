// Diagnóstico sanitizado de falhas da recuperação manual. Nunca inclui assunto, corpo, endereços, nomes de anexo,
// resposta bruta do provedor nem credenciais: apenas a etapa, o id técnico (uuid interno do e-mail) e um código fechado.
export class RecoveryStageError extends Error {
  constructor(code) { super(code); this.name = "RecoveryStageError"; this.recoveryCode = code; }
}

const OWN_MESSAGES = new Map([
  ["Mensagem fora da obra, caixa ou período congelado.", "FORA_DO_ESCOPO_CONGELADO"],
  ["Remetente diferente do piloto.", "REMETENTE_FORA_DO_PILOTO"],
  ["Corpo vazio no provedor.", "CORPO_VAZIO_NO_PROVEDOR"],
  ["Coleta da obra desabilitada.", "COLETA_DESABILITADA"],
  ["Caixa fora da lista habilitada.", "CAIXA_NAO_HABILITADA"],
  ["Aceite vigente do titular não confirmado.", "ACEITE_NAO_CONFIRMADO"],
]);

/** Código fechado e seguro. Só repassa valores de formato conhecido; o restante vira ERRO_NAO_CLASSIFICADO. */
export function safeFailureCode(error) {
  if (error instanceof RecoveryStageError) return error.recoveryCode;
  const own = OWN_MESSAGES.get(String(error?.message ?? ""));
  if (own) return own;
  if (error?.recoveryDb === true && /^DB_[A-Za-z0-9_.-]{1,16}$/.test(String(error.code))) return error.code;
  const status = Number(error?.response?.status ?? error?.status);
  if (Number.isInteger(status) && status >= 100 && status < 600) return `HTTP_${status}`;
  const code = typeof error?.code === "string" ? error.code : typeof error?.code === "number" ? String(error.code) : "";
  if (/^[A-Za-z0-9_.-]{1,40}$/.test(code)) return `CODIGO_${code}`.toUpperCase();
  const name = String(error?.name ?? "");
  return /^[A-Za-z0-9_]{1,40}$/.test(name) ? `ERRO_${name}`.toUpperCase() : "ERRO_NAO_CLASSIFICADO";
}

export function failureRecord(stage, emailId, error) {
  return { etapa: stage, email_id: String(emailId), codigo: safeFailureCode(error) };
}

/**
 * HTTP 404 exclusivamente na leitura da mensagem (etapa gmail_get) significa "mensagem indisponível no provedor".
 * Não indica a causa (exclusão, movimentação ou identificador inválido não são distinguíveis aqui).
 * Qualquer outra etapa ou status (401, 403, 5xx, banco, autorização) continua sendo falha.
 */
export function isProviderMessageUnavailable(stage, error) {
  if (stage !== "gmail_get" || error instanceof RecoveryStageError || error?.recoveryDb === true) return false;
  const status = Number(error?.response?.status ?? error?.status ?? error?.code);
  return status === 404;
}
