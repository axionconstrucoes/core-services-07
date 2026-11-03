// Texto e escopo da "Autorização de acesso aos e-mails da obra" — fonte única, versionada.
//
// Tudo que está aqui é VERIFICÁVEL no código/scripts do ACC (o teste scripts/test-email-authorization.mjs confere):
//   - escopo OAuth: gmail.readonly (scripts/gmail-inbound-oauth.mjs);
//   - esse escopo é amplo: o Google concede leitura de TODA a caixa. A restrição à obra é aplicada pelo próprio ACC
//     (filtros abaixo, scripts/gmail-inbound-sync.mjs) — NUNCA pelo Google. O texto não afirma o contrário;
//   - o ACC só LÊ: não envia, não apaga e não altera mensagens com esse escopo;
//   - o aceite registrado aqui NÃO é a conexão da conta (token OAuth fica nos segredos do servidor; a situação
//     da conexão vem de email_accounts.status).
//
// Puro, sem I/O, sem "server-only": testável por script Node.

export const EMAIL_AUTH_NOTICE_VERSION = "2026-10-v1";

export const GMAIL_OAUTH_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

/** Filtros que o ACC aplica à sincronização de uma obra (ver gmail-inbound-sync.mjs e a tela Integrações). */
export const EMAIL_AUTH_FILTERS: readonly string[] = [
  "O ACC consulta o Gmail apenas por mensagens recebidas de remetentes dos domínios autorizados da obra (domínios do cliente e demais domínios autorizados), dentro do período configurado (desde o início do projeto, desde agora ou intervalo personalizado).",
  "Depois, cada mensagem só é mantida se pertencer ao escopo da obra: palavras-chave e assuntos exatos configurados, domínios do cliente e participantes cadastrados.",
  "Mensagens que não passam nesses filtros não são gravadas pelo ACC; são lidas apenas em memória para aplicar o filtro.",
];

export interface EmailAuthScopeSnapshot {
  noticeVersion: string;
  oauthScope: string;
  oauthScopeLabel: string;
  /** O Google concede leitura da caixa inteira; a restrição por obra é do ACC. */
  googleRestrictsToProject: false;
  readOnly: true;
  sendsEmail: false;
  altersMailbox: false;
  filters: readonly string[];
}

export function buildEmailAuthScopeSnapshot(): EmailAuthScopeSnapshot {
  return {
    noticeVersion: EMAIL_AUTH_NOTICE_VERSION,
    oauthScope: GMAIL_OAUTH_SCOPE,
    oauthScopeLabel: "Ver e baixar seus e-mails (somente leitura)",
    googleRestrictsToProject: false,
    readOnly: true,
    sendsEmail: false,
    altersMailbox: false,
    filters: EMAIL_AUTH_FILTERS,
  };
}

export interface NoticeSection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** Seções do texto apresentado ao colaborador. Cada versão publicada fica registrada aqui, sem edição retroativa. */
export function getNoticeSections(version: string): NoticeSection[] | null {
  if (version !== EMAIL_AUTH_NOTICE_VERSION) return null;
  return [
    {
      id: "finalidade",
      title: "Para que serve",
      paragraphs: [
        "Permitir que o ACC use a sua conta de e-mail corporativa para registrar, nesta obra, as comunicações e anexos relacionados ao contrato (e-mails com o cliente e demais partes), formar a linha do tempo e gerar alertas.",
        "Cada obra tem a sua própria autorização: o que você decidir aqui vale somente para esta obra.",
      ],
    },
    {
      id: "permissoes",
      title: "Que permissão o ACC usa",
      paragraphs: [
        `Permissão do Google solicitada: “${buildEmailAuthScopeSnapshot().oauthScopeLabel}” (${GMAIL_OAUTH_SCOPE}).`,
        "Com ela o ACC apenas lê mensagens e anexos. O ACC não envia e-mails pela sua conta, não apaga e não altera mensagens.",
        "Atenção: essa permissão do Google não é limitada a uma obra. Tecnicamente, ela permite ler a caixa inteira. Quem limita a leitura à obra são os filtros do próprio ACC, descritos abaixo — não o Google.",
      ],
    },
    {
      id: "filtros",
      title: "Quais filtros o ACC aplica",
      paragraphs: [...EMAIL_AUTH_FILTERS],
    },
    {
      id: "recusa",
      title: "Se você não autorizar",
      paragraphs: [
        "Sua recusa fica registrada (data, obra e conta) e visível aos administradores da obra. Ela não altera nada na sua conta Google.",
        "A conexão da conta é feita separadamente, pelo administrador, com credenciais guardadas no servidor. Esta resposta registra a sua decisão no ACC; ela não conecta nem desconecta a conta sozinha.",
      ],
    },
    {
      id: "revogacao-acc",
      title: "Como revogar no ACC",
      paragraphs: [
        "Depois de autorizar, você pode revogar a qualquer momento nesta mesma página (botão “Revogar autorização desta obra”). Um administrador da obra também pode registrar a revogação.",
        "A revogação fica no histórico, com data e autor. E-mails que já foram registrados antes dela continuam preservados como evidência do contrato.",
      ],
    },
    {
      id: "revogacao-google",
      title: "Como revogar a permissão concedida ao Google",
      paragraphs: [
        `Revogar no ACC não remove a permissão dada ao Google. Para isso: acesse ${GOOGLE_PERMISSIONS_URL} com a sua conta, abra “Acesso de terceiros” (aplicativos com acesso à sua conta), escolha o aplicativo do ACC e use “Remover acesso”.`,
        "O administrador do Google Workspace da AXION também pode remover o acesso pelo Console de administração (Segurança › Controles de API).",
        "O nome exato do aplicativo é o que aparece na tela de consentimento do Google; se não o encontrar, consulte o administrador do ACC.",
      ],
    },
  ];
}

export type ConnectionStatus = "NOT_CONNECTED" | "CONNECTED" | "SYNCING" | "AUTH_EXPIRED" | "ERROR";

/** Rótulo da situação da conexão da conta (email_accounts.status) — separada do aceite. */
export function connectionStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "CONNECTED":
      return "Conta conectada";
    case "SYNCING":
      return "Sincronizando";
    case "AUTH_EXPIRED":
      return "Reautorização no Google necessária";
    case "ERROR":
      return "Erro na conexão";
    case "NOT_CONNECTED":
      return "Conta não conectada";
    default:
      return "Conta não registrada no ACC";
  }
}

export type AuthorizationStatus = "PENDENTE" | "AUTORIZADO" | "RECUSADO" | "REVOGADO";

export function authorizationStatusLabel(status: AuthorizationStatus): string {
  switch (status) {
    case "PENDENTE":
      return "Aguardando resposta";
    case "AUTORIZADO":
      return "Autorizado";
    case "RECUSADO":
      return "Não autorizado";
    case "REVOGADO":
      return "Revogado";
  }
}

export type AuthorizationAction = "autorizar" | "recusar" | "revogar";

/** Ação pedida por query string. Só ABRE o painel de confirmação — nunca registra nada. */
export function parseAuthorizationAction(raw: unknown, status: AuthorizationStatus): AuthorizationAction | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if ((value === "autorizar" || value === "recusar") && status === "PENDENTE") return value;
  if (value === "revogar" && status === "AUTORIZADO") return value;
  return null;
}
