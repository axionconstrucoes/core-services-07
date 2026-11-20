// Rótulos em português dos enums do domínio de seguros. Dado puro (sem JSX). Valores = CHECKs do banco.

export const MODALITY_LABEL: Record<string, string> = {
  SEGURO_GARANTIA_EXECUTANTE: "Seguro garantia — executante construtor (Performance Bond)",
  ADIANTAMENTO_PAGAMENTO: "Seguro garantia — adiantamento de pagamento",
  RETENCAO_PAGAMENTOS: "Seguro garantia — retenção de pagamentos",
  POS_ENTREGA: "Garantia pós-entrega",
  RISCOS_ENGENHARIA: "Riscos de engenharia",
  RC_GERAL: "Responsabilidade civil geral",
  RC_CRUZADA: "Responsabilidade civil cruzada (RCC)",
  RC_PROFISSIONAL: "Responsabilidade civil profissional",
  MAQUINAS_EQUIPAMENTOS: "Máquinas e equipamentos",
};

export const PARTY_ROLE_LABEL: Record<string, string> = {
  TOMADOR: "Tomador",
  SEGURADO: "Segurado",
  BENEFICIARIO: "Beneficiário",
  CONTRATANTE: "Contratante",
  SUBCONTRATANTE: "Subcontratante",
  PROPRIETARIO_FINAL: "Proprietário final",
  TITULAR_INTERESSE_SEGURAVEL: "Titular do interesse segurável",
  SEGURADORA: "Seguradora",
  CORRETOR: "Corretor",
};

export const POLICY_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  VIGENTE: "Vigente",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  SUBSTITUIDA: "Substituída",
};

export const GUARANTEE_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  VIGENTE: "Vigente",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  EXECUTADA: "Executada",
  DEVOLVIDA: "Devolvida",
};

export const OTHER_GUARANTEE_TYPE_LABEL: Record<string, string> = {
  CAUCAO: "Caução",
  CARTA_FIANCA_NAO_BANCARIA: "Carta de fiança NÃO bancária",
  OUTRA: "Outra garantia",
};

export const CAUCAO_FORM_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  TITULOS: "Títulos",
  BEM: "Bem",
  OUTRA: "Outra forma",
};

export const CLAUSE_KIND_LABEL: Record<string, string> = {
  COBERTURA: "Cobertura",
  CLAUSULA: "Cláusula",
  CONDICAO: "Condição",
  EXCLUSAO: "Exclusão",
  SUBLIMITE: "Sublimite",
  FRANQUIA: "Franquia / participação obrigatória",
  PRAZO_AVISO: "Prazo de aviso",
  OUTRO: "Outro",
};

export const ENDORSEMENT_STATE_LABEL: Record<string, string> = {
  SOLICITADO: "Solicitado",
  EM_ANALISE: "Em análise",
  EMITIDO: "Emitido",
  CONFERIDO: "Conferido",
  RECUSADO: "Recusado",
  EM_REVISAO: "Em revisão (conferência recusada)",
};

export const CHANGE_KIND_LABEL: Record<string, string> = {
  SEGURADO: "Segurado (crítico)",
  BENEFICIARIO_PARTES: "Beneficiário ou partes (crítico)",
  OBRIGACAO_GARANTIDA: "Obrigação garantida (crítico)",
  VALOR_IMPORTANCIA_SEGURADA: "Valor: importância segurada (crítico)",
  VALOR_LIMITE: "Valor: limite (crítico)",
  VALOR_PREMIO: "Valor: prêmio (crítico)",
  VALOR_GARANTIDO: "Valor: valor garantido (crítico)",
  COBERTURA_CLAUSULA: "Cobertura: cláusula de cobertura (crítico)",
  COBERTURA_EXCLUSAO: "Cobertura: exclusão (crítico)",
  COBERTURA_SUBLIMITE: "Cobertura: sublimite (crítico)",
  COBERTURA_FRANQUIA: "Cobertura: franquia ou participação obrigatória (crítico)",
  PRORROGACAO_VIGENCIA: "Prorrogação de vigência (não crítico)",
  DADOS_CADASTRAIS: "Dados cadastrais (não crítico)",
  OUTRO_NAO_CRITICO: "Outro, comprovadamente sem item crítico (não crítico)",
};

export const DUAL_REVIEW_REASON_LABEL: Record<string, string> = {
  SEM_CLASSIFICACAO: "Sem classificação declarada (tratado como crítico)",
  CLASSIFICACAO_CRITICA: "Altera item crítico",
  TEXTO_DIVERGENTE: "Texto emitido diverge do solicitado",
};

export const CLAIM_STAGE_LABEL: Record<string, string> = {
  EXPECTATIVA: "Expectativa de sinistro",
  AVISO: "Aviso de sinistro",
  RECLAMACAO: "Reclamação",
  DOC_COMPLEMENTAR: "Documentação complementar",
  REGULACAO: "Regulação",
  DECISAO: "Decisão",
  INDENIZACAO_CUMPRIMENTO: "Indenização / cumprimento",
  NEGATIVA: "Negativa",
  CONTESTACAO: "Contestação",
  ENCERRADO: "Encerrado",
};

export const CLAIM_KIND_LABEL: Record<string, string> = {
  INADIMPLEMENTO: "Inadimplemento",
  ATRASO: "Atraso",
  ADIANTAMENTO_NAO_AMORTIZADO: "Adiantamento não amortizado",
  RC_CRUZADA: "RC cruzada",
  DANO_PROPRIA_OBRA: "Dano à própria obra",
  DEFEITO_POS_ENTREGA: "Defeito pós-entrega",
  FIANCA_BANCARIA: "Fiança bancária",
  OUTRO: "Outro",
};

export const DRAFT_KIND_LABEL: Record<string, string> = {
  AVISO_SINISTRO: "Aviso de sinistro",
  EXPECTATIVA_SINISTRO: "Comunicação de expectativa de sinistro",
  RECLAMACAO: "Reclamação formal",
  ENDOSSO: "Solicitação de endosso",
  COBRANCA_FIANCA: "Cobrança de fiança",
};

export const DRAFT_STATE_LABEL: Record<string, string> = {
  DRAFT: "Minuta (DRAFT) — não enviada",
  APROVADA_PARA_ENVIO: "Aprovada por humano — NÃO enviada",
  CANCELADA: "Cancelada",
};

export const DOSSIER_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  ANEXADO: "Anexado",
  DISPENSADO: "Dispensado",
  NAO_APLICAVEL: "Não aplicável",
};

export const CHANNEL_TYPE_LABEL: Record<string, string> = {
  EMAIL: "E-mail",
  PORTAL: "Portal",
  ENDERECO_POSTAL: "Endereço postal",
  TELEFONE: "Telefone",
  OUTRO: "Outro",
};

export const COVERAGE_CONCLUSION_LABEL: Record<string, string> = {
  POTENCIALMENTE_COBERTO: "Potencialmente coberto",
  NAO_COBERTO: "Não coberto (exclusão aplicável)",
  CONDICIONADO: "Cobertura condicionada",
  INFORMACOES_INSUFICIENTES: "Informações insuficientes",
};

export const EPISTEMIC_LABEL: Record<string, string> = {
  FATO: "Fato",
  INFERENCIA: "Inferência",
  RECOMENDACAO: "Recomendação",
};

export const DASHBOARD_KIND_LABEL: Record<string, string> = {
  VENCIMENTO: "Vencimento de vigência",
  ENDOSSO_PENDENTE: "Endosso pendente",
  GARANTIA_INSUFICIENTE: "Garantia insuficiente",
  GARANTIA_SEM_DADOS: "Garantia sem dados para comparar",
  SINISTRO_EM_ANDAMENTO: "Sinistro em andamento",
  PRAZO_AVISO: "Prazo de aviso",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  INSURANCE_POLICY: "Apólice",
  INSURANCE_POLICY_PARTY: "Parte da apólice",
  INSURANCE_POLICY_CLAUSE: "Cláusula",
  INSURANCE_CHANNEL: "Canal oficial",
  BANK_GUARANTEE: "Fiança bancária",
  OTHER_GUARANTEE: "Outra garantia",
  INSURANCE_ENDORSEMENT: "Endosso",
  INSURANCE_ADVANCE: "Adiantamento",
  INSURANCE_CLAIM: "Sinistro / evento",
  INSURANCE_DOSSIER_ITEM: "Item do dossiê",
  INSURANCE_DRAFT: "Minuta",
};

export const SEND_BLOCK_REASON_LABEL: Record<string, string> = {
  FLAG_OFF: "A trava de envio real do projeto está desligada (padrão).",
  NOT_APPROVED: "A minuta ainda não foi aprovada por um ADMINISTRADOR.",
  APPROVAL_STALE: "O texto mudou depois da aprovação: a aprovação perdeu a validade.",
  NO_OFFICIAL_CHANNEL: "Não há canal oficial ativo vinculado à minuta.",
  CHANNEL_NOT_VERIFIED: "O canal oficial vinculado ainda não foi verificado por um gestor.",
  PHASE1_NO_SEND_TRANSPORT: "Nesta fase o sistema não possui transporte de envio: nenhuma comunicação sai do ACC.",
};

/** Rótulo seguro: valor desconhecido nunca vira texto vazio. */
export function labelOf(map: Record<string, string>, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "SEM DADOS";
  return map[value] ?? value;
}
