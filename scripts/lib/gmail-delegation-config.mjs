// Identificadores NÃO SECRETOS da integração Gmail por delegação em todo o domínio (confirmados nas telas do Google Cloud).
// Nenhum segredo aqui: e-mail de conta de serviço, ID de projeto e o ID exclusivo numérico são identificadores públicos.
// NÃO confundir: o ID numérico abaixo é o da CONTA DE SERVIÇO (usado no Google Admin → Delegação em todo o domínio);
// NÃO é o ID do projeto, NÃO é o e-mail e NÃO é o cliente OAuth do login web do ACC (…apps.googleusercontent.com).

export const GOOGLE_CLOUD_PROJECT_NAME = "Axion-Contract-Intelligence";
export const GOOGLE_CLOUD_PROJECT_ID = "axion-contract-intelligence";
export const GMAIL_READER_SERVICE_ACCOUNT_NAME = "ACC Gmail Reader";
export const GMAIL_READER_SERVICE_ACCOUNT_EMAIL = "acc-gmail-reader@axion-contract-intelligence.iam.gserviceaccount.com";
/** "OAuth 2 Client ID" da conta de serviço (Advanced settings → Domain-wide Delegation). Vai no Google Admin. */
export const GMAIL_READER_DWD_CLIENT_ID = "101242849785015243815";
/** Escopo ÚNICO a autorizar no Google Admin. */
export const GMAIL_READER_DWD_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Estado conhecido da configuração Google. A delegação NÃO está autorizada até um Superadministrador do Workspace
 * adicionar o Client ID + escopo no Google Admin. Isso é informado aqui só como documentação; o código nunca presume
 * a delegação: o teste técnico real (technical_check) é que a confirma.
 */
export const GOOGLE_DELEGATION_STATUS = "PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN";
