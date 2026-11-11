// Referência registro de campo SSMA -> comprovação ESG (evidência de apoio). Puro. A referência NUNCA marca a
// obrigação como cumprida: a UI e as mensagens deixam isso explícito. A autorização real é do banco (RPCs).

export const ESG_REFERENCE_NOTICE =
  "Vincular é só anexar este registro como evidência de apoio. A obrigação NÃO é marcada como cumprida; a revisão continua com o Administrador.";

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Entre novamente para continuar.",
  OBLIGATION_NOT_FOUND: "Comprovação ESG não encontrada.",
  RECORD_NOT_FOUND: "Registro de campo não encontrado.",
  PROJECT_MISMATCH: "O registro e a comprovação são de obras diferentes.",
  FORBIDDEN: "Você não tem permissão para vincular a esta comprovação (só a sua própria, ou Administrador).",
  REFERENCE_NOT_FOUND: "Vínculo não encontrado.",
  REASON_REQUIRED: "Informe o motivo (3 a 500 caracteres).",
  ALREADY_REVOKED: "Este vínculo já foi desfeito.",
};

export function esgReferenceErrorMessage(raw: string | null | undefined): string {
  const text = raw ?? "";
  const code = Object.keys(MESSAGES).find((key) => text.includes(key));
  if (code) return MESSAGES[code];
  if (/does not exist|schema cache|esg_ssma_record_references|esg_link_ssma_record/i.test(text)) {
    return "O vínculo com evidência ESG ainda não está disponível neste ambiente.";
  }
  return "Não foi possível concluir. Tente novamente.";
}

/** Comprovações em que o usuário pode vincular: Administrador em qualquer uma; demais perfis só nas próprias. */
export function eligibleSubmissions<T extends { filled_by_user_id: string }>(submissions: readonly T[], userId: string, isAdmin: boolean): T[] {
  return submissions.filter((item) => isAdmin || item.filled_by_user_id === userId);
}
