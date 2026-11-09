// Mensagens dos formulários SSMA (trilha A). Puro. O envio dos formulários 1 a 12 é ONLINE (não há fila no aparelho):
// "Salvo no aparelho" só existe nos registros de campo (trilha B). Aqui só há "Enviado e confirmado no ACC".

export const OFFLINE_FORM_MESSAGE =
  "Sem conexão. Os formulários 1 a 12 só são enviados com internet; o que você preencheu continua nesta tela. Para registrar sem sinal use “Registrar ocorrência / inspeção”, que salva no aparelho e envia depois.";

const CODE_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Sua sessão expirou. Entre novamente e envie de novo (os dados desta tela foram mantidos).",
  PROJECT_ACCESS_DENIED: "Você não tem acesso a esta obra. Escolha outra obra no campo Obra ou peça a um administrador para vincular a sua conta.",
  READ_ONLY_MEMBER: "Seu perfil nesta obra é somente leitura e não pode registrar formulários.",
  ACCIDENT_REQUIRED_FIELDS_MISSING: "Preencha classificação, nome do funcionário, causa informada e data/hora da remoção.",
  ACCIDENT_REQUIRED_PHOTOS_MISSING: "O acidente exige a foto do local e a foto da remoção.",
  INVALID_FORM_PAYLOAD: "O formulário está incompleto ou inválido. Revise os campos e tente de novo.",
  INVALID_CHECKLIST_VALUE: "Marque Feito ou NA em todos os itens do checklist.",
};

/** Mensagem útil para o usuário a partir do erro bruto (código do servidor, rede ou texto técnico). */
export function friendlySubmitError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const code = Object.keys(CODE_MESSAGES).find((key) => text.includes(key));
  if (code) return CODE_MESSAGES[code];
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) {
    return "Não foi possível falar com o servidor (conexão instável). Nada foi confirmado; seus dados continuam nesta tela. Tente de novo.";
  }
  if (text.startsWith("Falha ao") || text.startsWith("Os arquivos") || text.startsWith("Informe") || text.startsWith("Selecione")) return text;
  return "Não foi possível enviar. Nada foi confirmado como enviado; seus dados continuam nesta tela. Tente de novo.";
}

/**
 * Resultado da comunicação imediata de acidente. O acidente JÁ está registrado quando isto roda: uma falha aqui
 * NUNCA pode parecer falha do envio (reenviar duplicaria o acidente). Devolve null quando tudo foi enviado.
 */
export function accidentNotificationWarning(response: { ok: boolean; status: number } | null, serverError?: string | null): string | null {
  if (response?.ok) return null;
  const registered = "O acidente FOI registrado e confirmado no ACC. ";
  if (!response) return `${registered}Mas não foi possível acionar a comunicação por e-mail agora (conexão). Avise a Engenharia diretamente e não registre o acidente de novo.`;
  if (response.status === 409) {
    return `${registered}Mas nenhum destinatário de Engenharia/Comercial está configurado nesta obra, então NINGUÉM foi avisado por e-mail. Avise a Engenharia diretamente e peça a um administrador para configurar os destinatários.`;
  }
  if (response.status === 502) return `${registered}Mas o e-mail de comunicação falhou para ao menos um destinatário. A Auditoria foi sinalizada; avise a Engenharia diretamente.`;
  if (response.status === 401) return `${registered}Mas sua sessão expirou antes da comunicação por e-mail. Entre de novo e avise a Engenharia.`;
  return `${registered}Mas a comunicação por e-mail não foi concluída${serverError ? ` (${serverError})` : ""}. Avise a Engenharia diretamente.`;
}
