// FASE 6 / H2a — tradução dos erros das RPCs de governança (competências e aprovação de envio externo) para mensagens ao usuário.
// Os códigos são exatamente os `raise exception` das migrations 20261205100000, 20261205102000 e 20261208100000. Nunca devolve texto de
// SQL, stack nem dado de outro projeto: código desconhecido vira mensagem genérica (o banco continua recusando).

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Sua sessão expirou. Entre novamente para continuar.",
  FORBIDDEN: "Você não tem permissão para esta ação neste projeto. O banco de dados é a autoridade e recusou o pedido; nada foi alterado.",
  VERSION_CONFLICT: "O registro foi alterado por outra pessoa depois que você abriu a tela. Nada foi gravado: recarregue, confira e refaça.",
  INDEPENDENT_VALIDATOR_REQUIRED: "A validação precisa ser de uma pessoa independente: quem solicitou, quem receberá ou quem concedeu a competência não a valida.",
  EVIDENCE_REQUIRED: "É obrigatório anexar ao projeto o documento de evidência (diploma, registro, certidão, ata) e selecioná-lo. Registro CREA/OAB declarado não comprova habilitação.",
  EVIDENCE_CHECK_REQUIRED: "Marque a confirmação de que a evidência documental foi conferida.",
  NOTE_REQUIRED: "Informe a nota exigida (o que foi conferido, no mínimo 20 caracteres; motivo da recusa, no mínimo 10).",
  REASON_REQUIRED: "Informe o motivo (mínimo de 10 caracteres; 20 na designação de validador).",
  ALREADY_PENDING: "Já existe solicitação pendente desta competência para a pessoa.",
  ALREADY_ACTIVE: "A pessoa já tem esta competência ativa e validada.",
  TARGET_NOT_ACTIVE_MEMBER: "A pessoa precisa ser membro ATIVO deste projeto.",
  INVALID_COMPETENCE: "Competência inválida.",
  INVALID_VALIDITY: "Validade inválida: datas incoerentes ou já vencidas (o prazo de um validador designado vai até 180 dias a partir de hoje).",
  INVALID_REGISTRATION: "Informe o tipo do registro profissional e um número de até 60 caracteres.",
  INVALID_REGISTRATION_KIND: "Tipo de registro profissional inválido.",
  INVALID_INPUT: "Dados inválidos. Nada foi alterado.",
  REFERENCE_OUT_OF_PROJECT: "O documento escolhido não existe ou pertence a outro projeto.",
  NOT_PENDING: "A solicitação já foi decidida ou encerrada.",
  NOT_ACTIVE: "A competência não está ativa.",
  NOT_REQUIRED: "Esta competência não aguarda revalidação.",
  INVALID_DECISION: "Decisão inválida.",
  SELF_DESIGNATION_FORBIDDEN: "O validador não pode ser quem o designa.",
  INVALID_VALIDATOR: "Pessoa inexistente: o validador precisa ter perfil no ACC (entrar uma vez com a conta Google).",
  ALREADY_DESIGNATED: "Esta pessoa já tem designação aberta (proposta ou ativa) neste projeto.",
  ALREADY_REVOKED: "A designação já foi revogada.",
  NOT_PROPOSED: "A designação não está mais em estado de proposta.",
  COMPETENCE_REVALIDATION_REQUIRED:
    "Sua competência foi concedida antes da regra de revalidação e ainda não foi REVALIDADA por pessoa independente. Peça a um administrador (que não a tenha concedido) ou a um validador designado para revalidá-la em Competências.",
  COMPETENCE_REQUIRED:
    "Este ato exige competência profissional válida registrada para você. Se ela existe mas foi concedida antes da regra de revalidação, peça a revalidação em Competências; caso contrário, solicite a competência a um administrador.",
  HABILITATION_VALIDATION_REQUIRED: "A competência só nasce de solicitação com validação independente de habilitação.",
  // envio externo
  INVALID_CONTEXT: "Contexto de envio inválido.",
  INVALID_ACTION: "Ação de envio inválida.",
  INVALID_CONTENT_HASH: "Hash do conteúdo inválido.",
  INVALID_CONTENT_VERSION: "Informe a versão do conteúdo (1 a 60 caracteres).",
  INVALID_RECIPIENT_EMAIL: "Há destinatário com e-mail inválido (ou a lista está vazia).",
  TOO_MANY_RECIPIENTS: "No máximo 20 destinatários.",
  CONTENT_REQUIRED: "Informe o texto do envio.",
  CONTENT_TOO_LARGE: "Conteúdo grande demais: assunto até 300, texto até 20000 caracteres e até 20 anexos.",
  CONTENT_HASH_MISMATCH: "O hash do conteúdo não confere com o texto enviado. Nada foi gravado; tente de novo.",
  NOT_PREPARED: "Esta preparação já foi decidida ou encerrada.",
  NOT_OPEN: "Esta preparação não está mais aberta (já foi decidida, usada ou cancelada).",
  CONFIRMATION_ALREADY_USED: "A confirmação deste envio é de uso único e já foi usada.",
  CONFIRMATION_EXPIRED: "A aprovação passou de 24 horas: aprove de novo.",
};

/** Extrai o CÓDIGO (texto antes de ":" ou o 1º token em maiúsculas) de uma mensagem de erro de RPC. */
export function extractRpcErrorCode(message: string | null | undefined): string {
  const m = /^\s*([A-Z][A-Z0-9_]{2,60})\b/.exec(String(message ?? ""));
  return m ? m[1] : "";
}

/** Mensagem segura ao usuário. FORBIDDEN com detalhe do banco mantém a mensagem do banco apenas quando ela cita o nível exigido. */
export function explainGovernanceError(message: string | null | undefined): { code: string; message: string } {
  const code = extractRpcErrorCode(message);
  if (code === "FORBIDDEN" && /exige (ADMINISTRADOR|gestão)/.test(String(message))) {
    const need = /exige ADMINISTRADOR/.test(String(message)) ? "ADMINISTRADOR do projeto" : "gestão (GESTOR, GERENTE ou ADMINISTRADOR)";
    return { code, message: `A aprovação deste envio exige ${need}. Nada foi alterado.` };
  }
  if (code && MESSAGES[code]) return { code, message: MESSAGES[code] };
  if (/permission denied|row-level security|violates/i.test(String(message))) return { code: "FORBIDDEN", message: MESSAGES.FORBIDDEN };
  return { code: code || "FALHA", message: "Não foi possível concluir a ação. Nada foi alterado." };
}

/** Códigos aceitos em `?erro=` (a página só exibe mensagem conhecida; qualquer outro valor vira a genérica). */
export function messageForErrorParam(code: string | null | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(MESSAGES, code)) return MESSAGES[code];
  if (code === "ENTRADA") return "Dados inválidos no formulário. Confira: destinatários válidos (domínios reservados como example.com ou .test são recusados), motivo com no mínimo 10 caracteres e campos obrigatórios preenchidos. Nada foi alterado.";
  return "Não foi possível concluir a ação. Nada foi alterado.";
}

export const KNOWN_ERROR_CODES: readonly string[] = Object.keys(MESSAGES);
