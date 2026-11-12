// Classificação SEGURA dos erros da validação somente leitura da pasta SSMA/ESG no Google Drive.
// Devolve apenas um CÓDIGO FECHADO e um texto fixo: nunca a mensagem bruta do provedor, token,
// client id, URL ou nome de arquivo. Puro (sem I/O) para ser testável sem rede.

export type SsmaDriveValidationErrorCode =
  | "URL_INVALIDA"
  | "ORIGEM_NAO_E_PASTA"
  | "SUBPASTAS_AUSENTES"
  | "SUBPASTAS_DUPLICADAS"
  | "OAUTH_INVALID_CLIENT"
  | "OAUTH_INVALID_GRANT"
  | "OAUTH_UNAUTHORIZED_CLIENT"
  | "OAUTH_INVALID_SCOPE"
  | "OAUTH_DELETED_CLIENT"
  | "DRIVE_SEM_PERMISSAO"
  | "DRIVE_SEM_ACESSO_AO_DRIVE_COMPARTILHADO"
  | "DRIVE_NAO_ENCONTRADO"
  | "DRIVE_COTA"
  | "DRIVE_API_DESATIVADA"
  | "HTTP_401"
  | "HTTP_403"
  | "HTTP_404"
  | "HTTP_429"
  | "HTTP_5XX"
  | "CONSULTA_INTERNA"
  | "REDE"
  | "NAO_CLASSIFICADO";

const OAUTH_ERRORS: Record<string, SsmaDriveValidationErrorCode> = {
  invalid_client: "OAUTH_INVALID_CLIENT",
  invalid_grant: "OAUTH_INVALID_GRANT",
  unauthorized_client: "OAUTH_UNAUTHORIZED_CLIENT",
  invalid_scope: "OAUTH_INVALID_SCOPE",
  deleted_client: "OAUTH_DELETED_CLIENT",
};

const DRIVE_REASONS: Record<string, SsmaDriveValidationErrorCode> = {
  insufficientpermissions: "DRIVE_SEM_PERMISSAO",
  insufficientfilepermissions: "DRIVE_SEM_PERMISSAO",
  forbidden: "DRIVE_SEM_PERMISSAO",
  apppermissiondenied: "DRIVE_SEM_PERMISSAO",
  domainpolicy: "DRIVE_SEM_PERMISSAO",
  teamdrivemembershiprequired: "DRIVE_SEM_ACESSO_AO_DRIVE_COMPARTILHADO",
  shareddrivemembershiprequired: "DRIVE_SEM_ACESSO_AO_DRIVE_COMPARTILHADO",
  teamdrivenotfound: "DRIVE_SEM_ACESSO_AO_DRIVE_COMPARTILHADO",
  notfound: "DRIVE_NAO_ENCONTRADO",
  ratelimitexceeded: "DRIVE_COTA",
  userratelimitexceeded: "DRIVE_COTA",
  dailylimitexceeded: "DRIVE_COTA",
  accessnotconfigured: "DRIVE_API_DESATIVADA",
};

export const SSMA_DRIVE_VALIDATION_MESSAGES: Record<SsmaDriveValidationErrorCode, string> = {
  URL_INVALIDA: "A origem configurada não é uma URL válida de pasta do Google Drive.",
  ORIGEM_NAO_E_PASTA: "A origem configurada não aponta para uma pasta do Google Drive.",
  SUBPASTAS_AUSENTES: "Estrutura incompleta: há subpastas obrigatórias não encontradas.",
  SUBPASTAS_DUPLICADAS: "Estrutura ambígua: há subpastas obrigatórias duplicadas na raiz configurada.",
  OAUTH_INVALID_CLIENT: "O ID e o segredo do cliente OAuth configurados não correspondem (cliente inválido).",
  OAUTH_INVALID_GRANT: "O refresh token foi recusado: expirou, foi revogado ou foi emitido para outro cliente OAuth.",
  OAUTH_UNAUTHORIZED_CLIENT: "O refresh token foi emitido para outro cliente OAuth (não corresponde ao ID configurado).",
  OAUTH_INVALID_SCOPE: "O escopo autorizado no token não é aceito para esta leitura.",
  OAUTH_DELETED_CLIENT: "O cliente OAuth configurado foi excluído no Google Cloud.",
  DRIVE_SEM_PERMISSAO: "A conta do token não tem permissão de leitura suficiente (escopo ou acesso à pasta).",
  DRIVE_SEM_ACESSO_AO_DRIVE_COMPARTILHADO: "A conta do token não é membro do Drive compartilhado da pasta SSMA/ESG.",
  DRIVE_NAO_ENCONTRADO: "A pasta SSMA/ESG não foi encontrada para a conta do token (não existe ou não está compartilhada).",
  DRIVE_COTA: "Limite de uso da API do Google Drive atingido. Tente novamente mais tarde.",
  DRIVE_API_DESATIVADA: "A API do Google Drive não está ativada no projeto do cliente OAuth.",
  HTTP_401: "O Google recusou a autenticação (401).",
  HTTP_403: "O Google negou o acesso (403).",
  HTTP_404: "O Google não encontrou o recurso (404).",
  HTTP_429: "Limite de requisições do Google atingido (429).",
  HTTP_5XX: "O Google Drive respondeu com erro temporário (5xx).",
  CONSULTA_INTERNA: "Falha ao consultar a configuração da obra no ACC.",
  REDE: "Falha de rede ao contatar o Google Drive.",
  NAO_CLASSIFICADO: "Não foi possível validar a pasta SSMA/ESG.",
};

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Extrai um código fechado do erro. Só compara com listas conhecidas; nada do texto bruto é devolvido. */
export function classifySsmaDriveValidationError(error: unknown): SsmaDriveValidationErrorCode {
  const e = (error ?? {}) as Record<string, unknown>;
  const message = typeof e.message === "string" ? e.message : "";

  if (message === "INVALID_FOLDER_URL") return "URL_INVALIDA";
  if (message === "ROOT_IS_NOT_A_FOLDER") return "ORIGEM_NAO_E_PASTA";
  if (message.startsWith("MISSING_FOLDERS:")) return "SUBPASTAS_AUSENTES";
  if (message.startsWith("DUPLICATED_FOLDERS:")) return "SUBPASTAS_DUPLICADAS";
  if (message === "MEMBERSHIP_LOOKUP_FAILED" || message === "CONFIG_LOOKUP_FAILED") return "CONSULTA_INTERNA";

  const response = (e.response ?? {}) as Record<string, unknown>;
  const data = (response.data ?? {}) as Record<string, unknown>;

  // Erro do endpoint de token OAuth: { error: "invalid_client", error_description }
  const oauthError = lower(data.error);
  if (oauthError && OAUTH_ERRORS[oauthError]) return OAUTH_ERRORS[oauthError];

  // Erro da API do Drive: { error: { code, errors: [{ reason }] } } ou e.errors
  const apiError = (typeof data.error === "object" && data.error !== null ? data.error : {}) as Record<string, unknown>;
  const errorsList = (Array.isArray(apiError.errors) ? apiError.errors : Array.isArray(e.errors) ? e.errors : []) as Array<Record<string, unknown>>;
  for (const item of errorsList) {
    const reason = lower(item?.reason);
    if (reason && DRIVE_REASONS[reason]) return DRIVE_REASONS[reason];
  }

  // Mensagem do gaxios para erros OAuth costuma ser exatamente o código (ex.: "invalid_grant").
  const messageCode = lower(message);
  if (OAUTH_ERRORS[messageCode]) return OAUTH_ERRORS[messageCode];

  const status = Number(response.status ?? e.status ?? (typeof e.code === "number" ? e.code : NaN));
  if (Number.isInteger(status)) {
    if (status === 401) return "HTTP_401";
    if (status === 403) return "HTTP_403";
    if (status === 404) return "HTTP_404";
    if (status === 429) return "HTTP_429";
    if (status >= 500 && status < 600) return "HTTP_5XX";
  }

  const code = lower(e.code);
  if (/^(econnreset|enotfound|etimedout|econnrefused|eai_again)$/.test(code)) return "REDE";

  return "NAO_CLASSIFICADO";
}

/** Texto exibido ao usuário: mensagem fixa + código fechado (seguro para log e tela). */
export function describeSsmaDriveValidationError(error: unknown): { code: SsmaDriveValidationErrorCode; message: string } {
  const code = classifySsmaDriveValidationError(error);
  return { code, message: `${SSMA_DRIVE_VALIDATION_MESSAGES[code]} Nenhum arquivo foi baixado ou alterado. (código: ${code})` };
}
