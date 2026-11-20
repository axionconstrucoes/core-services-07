// Domínio da Qualidade (fase 1) — tipos puros. Espelham as tabelas quality_* (supabase/migrations/20261122*).
// Nada aqui acessa banco, rede ou IA.

export const NCR_STATES = [
  "DETECTADA",
  "TRIAGEM",
  "INVESTIGACAO",
  "CONFIRMADA",
  "PLANO_ACAO",
  "CORRECAO",
  "VERIFICACAO",
  "ENCERRADA",
  "NAO_CONFIRMADA",
  "DUPLICADA",
  "CANCELADA",
  "REABERTA",
] as const;
export type NcrState = (typeof NCR_STATES)[number];

export const WARRANTY_STATES = [
  "ABERTA",
  "EM_VISTORIA",
  "EM_ANALISE",
  "COBERTA",
  "NAO_COBERTA",
  "EM_REPARO",
  "REPARADA",
  "VERIFICADA",
  "ENCERRADA",
  "REABERTA",
  "CANCELADA",
] as const;
export type WarrantyState = (typeof WARRANTY_STATES)[number];

export type QualityEntityType = "NCR" | "WARRANTY";
export type QualityRole = "ADMINISTRADOR" | "GERENTE" | "GESTOR" | "COLABORADOR" | "LEITURA";
/** REGISTER = registra/avança; MANAGE = decide, encerra, reabre, cancela. */
export type QualityMinRole = "REGISTER" | "MANAGE";

export const ORIGIN_TYPES = [
  "SSMA_FOTO",
  "EMAIL",
  "DIARIO_OBRA",
  "FISCALIZACAO",
  "INSPECAO",
  "ENSAIO_LAUDO",
  "DOCUMENTO",
  "RECLAMACAO_CLIENTE",
  "GARANTIA",
  "MANUAL",
] as const;
export type OriginType = (typeof ORIGIN_TYPES)[number];

export const EVIDENCE_SOURCE_TYPES = [
  "SSMA_FOTO",
  "EMAIL",
  "DIARIO_OBRA",
  "FISCALIZACAO",
  "INSPECAO",
  "ENSAIO_LAUDO",
  "DOCUMENTO",
  "OUTRO",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

/** Força probatória: SUSPEITA < INDICIO < NC_COMPROVADA. RISCO_POTENCIAL é eixo próprio (não comprova NC). */
export type EvidenceClassification = "SUSPEITA" | "INDICIO" | "NC_COMPROVADA" | "RISCO_POTENCIAL";
export type Epistemic = "FATO" | "INFERENCIA" | "RECOMENDACAO";

export type Pillar = "PRAZO" | "CUSTO" | "SEGURANCA" | "QUALIDADE";
export const PILLARS: readonly Pillar[] = ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"];
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Criticality = Severity | "SEM_DADOS";
export type Probability = "RARA" | "IMPROVAVEL" | "POSSIVEL" | "PROVAVEL" | "QUASE_CERTA";

export type VerificationResult = "EFICAZ" | "INEFICAZ" | "PARCIAL";
export type ActionStatus = "PLANEJADA" | "EM_ANDAMENTO" | "EXECUTADA" | "CANCELADA";

export interface EvidenceRef {
  id: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  sourceUrl?: string | null;
  classification: EvidenceClassification;
  epistemic?: Epistemic;
}

export interface ConsequenceInput {
  pillar: Pillar;
  severity: Severity;
  probability?: Probability | null;
  probabilityBasis?: string | null;
  sourceRef?: string | null;
}

export interface VerificationRecord {
  result: VerificationResult;
  hasEvidence: boolean;
  /** seq do último evento de estado conhecido quando a verificação foi registrada. */
  eventSeqAt: number;
}

export interface StateEventRef {
  seq: number;
  toState: string;
}
