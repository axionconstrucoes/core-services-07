// Tipos do domínio de seguros/garantias (fase 1, módulo puro: sem banco, sem rede, sem IA).
// Espelha os CHECKs de supabase/migrations/20261122200000_seguros_garantias_model.sql.

export const POLICY_MODALITIES = [
  "SEGURO_GARANTIA_EXECUTANTE",
  "ADIANTAMENTO_PAGAMENTO",
  "RETENCAO_PAGAMENTOS",
  "POS_ENTREGA",
  "RISCOS_ENGENHARIA",
  "RC_GERAL",
  "RC_CRUZADA",
  "RC_PROFISSIONAL",
  "MAQUINAS_EQUIPAMENTOS",
] as const;
export type PolicyModality = (typeof POLICY_MODALITIES)[number];

export const PARTY_ROLES = [
  "TOMADOR",
  "SEGURADO",
  "BENEFICIARIO",
  "CONTRATANTE",
  "SUBCONTRATANTE",
  "PROPRIETARIO_FINAL",
  "TITULAR_INTERESSE_SEGURAVEL",
  "SEGURADORA",
  "CORRETOR",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

/** Instrumentos SEPARADOS: nunca tratar como equivalentes. */
export type InstrumentKind = "SEGURO" | "FIANCA_BANCARIA" | "CAUCAO" | "CARTA_FIANCA_NAO_BANCARIA" | "OUTRA_GARANTIA";

/** EM_REVISAO (Fase 3/C): uma conferência foi RECUSADA; sem efeito de cobertura até nova emissão e nova rodada de conferências. */
export type EndorsementState = "SOLICITADO" | "EM_ANALISE" | "EMITIDO" | "CONFERIDO" | "RECUSADO" | "EM_REVISAO";

export const CLAIM_STAGES = [
  "EXPECTATIVA",
  "AVISO",
  "RECLAMACAO",
  "DOC_COMPLEMENTAR",
  "REGULACAO",
  "DECISAO",
  "INDENIZACAO_CUMPRIMENTO",
  "NEGATIVA",
  "CONTESTACAO",
  "ENCERRADO",
] as const;
export type ClaimStage = (typeof CLAIM_STAGES)[number];

export type ClaimKind =
  | "INADIMPLEMENTO"
  | "ATRASO"
  | "ADIANTAMENTO_NAO_AMORTIZADO"
  | "RC_CRUZADA"
  | "DANO_PROPRIA_OBRA"
  | "DEFEITO_POS_ENTREGA"
  | "FIANCA_BANCARIA"
  | "OUTRO";

export type DraftKind = "AVISO_SINISTRO" | "EXPECTATIVA_SINISTRO" | "RECLAMACAO" | "ENDOSSO" | "COBRANCA_FIANCA";
export type DraftState = "DRAFT" | "APROVADA_PARA_ENVIO" | "CANCELADA";

/** Natureza epistêmica de qualquer conclusão derivada (CLAUDE.md 12). */
export type Epistemic = "FATO" | "INFERENCIA" | "RECOMENDACAO";

export type CoverageConclusion =
  | "POTENCIALMENTE_COBERTO"
  | "NAO_COBERTO"
  | "CONDICIONADO"
  | "INFORMACOES_INSUFICIENTES";

export interface SourceRef {
  documentId?: string | null;
  ref?: string | null;
  page?: string | null;
}

export interface ClauseEvidence {
  id: string;
  kind: "COBERTURA" | "CLAUSULA" | "CONDICAO" | "EXCLUSAO" | "SUBLIMITE" | "FRANQUIA" | "PRAZO_AVISO" | "OUTRO";
  title: string;
  /** Identificação ESPECÍFICA da cláusula no texto da apólice (ex.: "Cláusula 4.2"). Sem ela, a cláusula não prova cobertura (Fase 4/B). */
  identifier?: string | null;
  /** Tipos de evento a que a cláusula declara se aplicar (ex.: "DANO_PROPRIA_OBRA"). Vazio = não declarado. */
  appliesTo: string[];
  amount?: number | null;
  deadlineDays?: number | null;
  source: SourceRef;
  verified?: boolean;
}

export interface EndorsementSummary {
  id: string;
  state: EndorsementState;
  coverageEffective: boolean;
  issuedDocumentId?: string | null;
}
