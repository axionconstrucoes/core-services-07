// Tipos do contexto comercial × orçamentário (somente leitura) usado
// pelo Diretor Comercial IA. Cada item carregado carrega sua fonte
// (tabela/registro/campo) — nenhum número entra no contexto sem
// rastreabilidade até o registro original. O que o ACC não tem é marcado
// explicitamente como "Dado não disponível no ACC", nunca estimado.

/**
 * Categorias de dado comercial/orçamentário que o Expert pode usar.
 * Espelham a lista de integração Comercial × Orçamentos (P4). A ordem é
 * a de exibição no prompt.
 */
export type CommercialDataKey =
  | "CONTRATO_BASE"
  | "ORCAMENTO_BASE_E_REVISOES"
  | "CUSTOS_DIRETOS"
  | "CUSTOS_INDIRETOS"
  | "BDI"
  | "PRECO_DE_VENDA"
  | "MARGEM_PREVISTA"
  | "CONTINGENCIAS"
  | "PREMISSAS_DO_ORCAMENTO"
  | "PRODUTIVIDADE"
  | "ALTERNATIVAS_DE_ENGENHARIA"
  | "RISCOS_DE_EXECUCAO"
  | "CRONOGRAMA_E_IMPACTOS_FINANCEIROS"
  | "CONDICOES_DE_CONTRATACAO"
  | "PROPOSTAS_ADICIONAIS"
  | "RESPOSTAS_DE_ORCAMENTOS"
  | "ALTERACOES_CONTRATUAIS";

/**
 * Situação de cada item:
 * - DISPONIVEL: valor lido de um registro autorizado da obra (com fonte).
 * - SEM_REGISTRO_NA_OBRA: o ACC tem onde guardar, mas esta obra não tem registro.
 * - NAO_DISPONIVEL_NO_ACC: o ACC não possui este dado de forma estruturada.
 * - SEM_AUTORIZACAO: existe, mas o usuário da sessão não pode ver.
 * - ERRO_DE_CONSULTA: a leitura falhou — nunca tratada como "zero" ou "não existe".
 */
export type CommercialDataAvailability =
  | "DISPONIVEL"
  | "SEM_REGISTRO_NA_OBRA"
  | "NAO_DISPONIVEL_NO_ACC"
  | "SEM_AUTORIZACAO"
  | "ERRO_DE_CONSULTA";

export const COMMERCIAL_DATA_NOT_AVAILABLE_TEXT = "Dado não disponível no ACC";

/** Rastreabilidade até o registro original — obrigatória para todo item DISPONIVEL. */
export interface CommercialSourceRef {
  table: string;
  recordId: string;
  field: string;
  /** Localizador adicional (ex.: linha da planilha de origem, arquivo). */
  locator: string | null;
}

export type CommercialValueUnit = "BRL" | "PERCENT" | "DAYS" | "DATE" | "TEXT";

export interface CommercialContextItem {
  /** Identificador estável dentro do contexto — é o que o Expert cita como fonte (ex.: "COM-3"). */
  id: string;
  key: CommercialDataKey;
  label: string;
  availability: CommercialDataAvailability;
  /** Valor exatamente como lido da fonte — nunca derivado, somado ou arredondado. */
  value: string | number | null;
  unit: CommercialValueUnit | null;
  source: CommercialSourceRef | null;
  note: string | null;
}

export type CommercialContextAccess =
  | { status: "AUTORIZADO"; userId: string; financialAccess: boolean; reason: string }
  | { status: "NAO_AUTORIZADO"; userId: string | null; financialAccess: false; reason: string };

export interface CommercialContext {
  projectId: string;
  /** Proposta adicional em foco (opcional). */
  proposalId: string | null;
  loadedAt: string;
  access: CommercialContextAccess;
  items: CommercialContextItem[];
  /**
   * Categorias econômicas essenciais (custos, BDI, margem, contingências)
   * sem dado disponível — quando não vazia, qualquer avaliação de
   * aceitabilidade econômica exige análise de Orçamentos.
   */
  missingEconomicKeys: CommercialDataKey[];
}
