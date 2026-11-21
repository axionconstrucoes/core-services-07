// Tradução dos erros das RPCs de seguros (supabase/migrations/20261122201000_seguros_garantias_rpcs.sql) para mensagens ao usuário.
// Os códigos são exatamente os `raise exception` das RPCs. Nunca devolve texto de SQL, stack nem dado de outro projeto.

export interface InsuranceActionError {
  code: string;
  message: string;
  /** VERSION_CONFLICT: outra pessoa alterou o registro depois que esta tela o carregou (CASO 38). */
  conflict: boolean;
}

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Sua sessão expirou. Entre novamente para continuar.",
  FORBIDDEN: "Você não tem permissão para esta ação neste projeto. O banco de dados é a autoridade e recusou o pedido.",
  NOT_FOUND: "Registro não encontrado neste projeto (ele pode ter sido substituído; recarregue os dados).",
  EXPECTED_VERSION_REQUIRED: "A versão do registro não foi enviada. Recarregue a tela e tente de novo.",
  VERSION_CONFLICT:
    "Este registro foi alterado por outra pessoa depois que você abriu a tela. Nada foi gravado. Recarregue os dados, confira o que mudou e refaça a ação.",
  REASON_REQUIRED: "Informe o motivo (mínimo de 10 caracteres).",
  COMPETENCE_REQUIRED:
    "Esta decisão exige uma competência profissional registrada para você neste projeto (Jurídico para decisão, negativa, contestação e indenização de sinistro; Seguros ou Jurídico para aprovar minuta e conferir endosso crítico). O nível de gestão não substitui a competência: peça a um Administrador do projeto.",
  REVIEWER_IS_ISSUER: "Quem registrou a emissão do endosso não pode conferi-la; a conferência precisa ser de outra pessoa.",
  ALREADY_REVIEWED: "Você já conferiu este endosso nesta rodada; a conferência seguinte precisa ser de outro usuário.",
  REVIEW_NOTE_REQUIRED: "Informe o motivo da recusa da conferência (mínimo de 20 caracteres).",
  SELF_GRANT_FORBIDDEN: "O Administrador não concede competência a si mesmo: outro Administrador do projeto precisa conceder.",
  TARGET_NOT_ACTIVE_MEMBER: "A pessoa escolhida precisa ser membro ATIVO deste projeto.",
  INVALID_COMPETENCE: "Competência inválida ou pessoa não informada.",
  ALREADY_ACTIVE: "Esta pessoa já tem esta competência ativa; revogue-a antes de conceder de novo.",
  ALREADY_REVOKED: "Esta competência já foi revogada.",
  INVALID_VALIDITY: "Validade inválida: a data final não pode ser anterior à inicial nem já ter passado.",
  INVALID_REGISTRATION_KIND: "Tipo de registro profissional inválido.",
  INVALID_REGISTRATION: "Informe o tipo do registro profissional e um número de até 60 caracteres.",
  INVALID_TRANSITION: "Esta mudança de estado não é permitida a partir do estado atual (ou outra pessoa já a realizou).",
  REFERENCE_OUT_OF_PROJECT: "O documento ou registro escolhido não pertence a este projeto.",
  INVALID_REFERENCE_TABLE: "Referência inválida.",
  ISSUED_DOCUMENT_REQUIRED: "Para registrar a emissão do endosso, selecione o documento emitido (a fonte do texto emitido).",
  ISSUED_TEXT_REQUIRED: "Cole o texto do endosso EMITIDO pela seguradora.",
  ISSUED_NUMBER_REQUIRED: "Informe o número do endosso emitido.",
  DIVERGENCE_NOTE_REQUIRED: "O texto emitido difere do solicitado: descreva a divergência (mínimo de 20 caracteres) para conferir.",
  REFUSAL_NOTE_REQUIRED: "Informe o motivo da recusa (mínimo de 10 caracteres).",
  AMOUNT_INVALID: "Informe um valor maior que zero.",
  AMORTIZATION_EXCEEDS_BALANCE: "A amortização excede o saldo não amortizado do adiantamento.",
  INVALID_INITIAL_STAGE: "Um evento só pode ser aberto como expectativa, aviso ou reclamação.",
  EXPECTATIVA_BASIS_MISMATCH: "A cláusula escolhida não pertence à apólice vinculada: expectativa de sinistro exige base na própria apólice.",
  EXPECTATIVA_BASIS_REQUIRED:
    "Expectativa de sinistro só pode ser aberta quando contratualmente prevista: selecione a cláusula da apólice ou descreva a base (mínimo de 10 caracteres).",
  NOTE_REQUIRED: "Esta etapa exige uma nota fundamentada (mínimo de 10 caracteres).",
  DECISION_OUTCOME_REQUIRED: "Informe o resultado da decisão: deferido, indeferido ou parcial.",
  DECISION_DOES_NOT_ALLOW_PAYMENT: "Indenização/cumprimento só é possível após decisão DEFERIDA ou PARCIAL.",
  ITEMS_MUST_BE_ARRAY: "Lista de itens inválida.",
  DRAFT_CANCELLED: "A minuta foi cancelada e não admite mais alterações.",
  EXPRESS_CONFIRMATION_REQUIRED: "A aprovação exige a confirmação literal: APROVO O CONTEUDO PARA ENVIO.",
  DRAFT_BODY_TOO_SHORT: "O texto da minuta é curto demais para ser aprovado.",
  DRAFT_HAS_PLACEHOLDERS: "A minuta ainda tem campos [PREENCHER ...] ou [SEM DADOS ...]: complete o texto antes de aprovar.",
  GROUNDS_REQUIRED: "Decisão, indenização/cumprimento, negativa e contestação exigem fundamentação: nota com no mínimo 20 caracteres.",
  GROUNDS_SOURCES_REQUIRED: "A fundamentação exige ao menos uma fonte: documento do projeto e/ou referência.",
  RCC_NOT_READY: "O checklist RCC (10 perguntas com fonte e natureza do bem definida) não está pronto: complete-o antes de decidir ou indenizar.",
  UPDATE_SOURCE_REQUIRED: "A atualização exige a fonte da mudança (documento do projeto ou referência).",
  UPDATE_REASON_REQUIRED: "Informe o motivo da atualização (mínimo de 10 caracteres).",
  UPDATE_EMPTY: "Nenhum campo a atualizar.",
  COHERENCE_BLOCKED: "Aprovação bloqueada: os termos do contrato, da apólice e da minuta não estão completos ou há divergência sem justificativa. Veja o painel de coerência da minuta.",
  SOURCE_REQUIRED: "Informe a fonte (documento do projeto ou referência).",
  NOT_DIVERGENT: "Este campo não tem divergência a justificar (os valores podem ter mudado: recarregue).",
  ALREADY_JUSTIFIED: "Esta divergência já tem justificativa para os valores atuais.",
  JUSTIFICATION_REQUIRED: "A justificativa exige texto de 20 a 4000 caracteres.",
  INVALID_TAX_ID: "Documento fiscal inválido (CPF/CNPJ pelos dígitos verificadores).",
  TAX_ID_REQUIRED: "Segurado, beneficiário, proprietário final e titular identificados exigem documento fiscal válido; sem documento, registre como NÃO identificado.",
  DUPLICATE_PARTY: "Já existe parte ativa do mesmo papel com o mesmo documento fiscal/nome nesta apólice (sem dupla contagem).",
  CLAUSE_IDENTIFIER_REQUIRED: "A cláusula de cobertura exige a identificação específica no texto da apólice (ex.: Cláusula 4.2). Cláusula genérica não prova cobertura.",
  INVALID_STATE: "Esta ação não é permitida no estado atual do registro.",
  INVALID_INPUT: "Algum campo está inválido. Nada foi gravado.",
  INSURANCE_NO_DELETE: "Registros de seguros não podem ser apagados (preservação de evidências).",
  INSURANCE_APPEND_ONLY: "Este registro é uma trilha de auditoria e não pode ser alterado.",
};

const SQLSTATE: Record<string, string> = {
  "23514": "Os dados violam uma regra de integridade (por exemplo: fonte documental ou referência de fonte obrigatória, datas incoerentes, valores negativos).",
  "23505": "Já existe um registro igual (chave duplicada).",
  "23503": "A referência escolhida não existe.",
  "22P02": "Algum campo está em formato inválido (número, data ou identificador).",
  "22007": "Alguma data está em formato inválido.",
  "22008": "Alguma data está fora do intervalo aceito.",
  "22003": "Algum valor numérico está fora do intervalo aceito.",
  "42P01": "O módulo de seguros ainda não está disponível neste ambiente (migrações pendentes).",
  "42883": "O módulo de seguros ainda não está disponível neste ambiente (função inexistente).",
  PGRST202: "O módulo de seguros ainda não está disponível neste ambiente (função inexistente).",
  PGRST205: "O módulo de seguros ainda não está disponível neste ambiente (tabela inexistente).",
};

/** Código canônico extraído da mensagem da RPC ("CODIGO" ou "CODIGO: detalhe"). */
export function extractRpcCode(message: string | null | undefined): string | null {
  const m = /^\s*([A-Z][A-Z0-9_]{2,60})(?::|\b)/.exec(message ?? "");
  if (!m) return null;
  const code = m[1];
  if (code.startsWith("INVALID_UUID_")) return "INVALID_UUID";
  return code;
}

export function mapInsuranceError(error: { message?: string | null; code?: string | null } | null | undefined): InsuranceActionError {
  const raw = error?.message ?? "";
  const code = extractRpcCode(raw);
  if (code === "INVALID_UUID") return { code, message: "Um identificador informado é inválido.", conflict: false };
  if (code && MESSAGES[code]) {
    // detalhe numérico do conflito ("esperado X, atual Y") é útil e seguro; os demais códigos usam só o texto fixo
    return { code, message: MESSAGES[code], conflict: code === "VERSION_CONFLICT" };
  }
  const sqlstate = error?.code ?? "";
  if (sqlstate && SQLSTATE[sqlstate]) return { code: sqlstate, message: SQLSTATE[sqlstate], conflict: false };
  return { code: "UNKNOWN", message: "Não foi possível concluir a ação. Nada foi gravado. Tente de novo; se persistir, acione o administrador.", conflict: false };
}

/** true quando o erro indica que as tabelas/funções do módulo não existem no banco consultado. */
export function isModuleUnavailable(error: { message?: string | null; code?: string | null } | null | undefined): boolean {
  const c = error?.code ?? "";
  return c === "42P01" || c === "PGRST205" || c === "PGRST202" || c === "42883";
}
