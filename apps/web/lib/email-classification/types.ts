// Fase 5 / B — tipos do motor DETERMINÍSTICO de classificação de e-mail e sinais de risco. Puro (sem I/O, sem IA, sem rede).
// Conteúdo de e-mail de terceiros é DADO NÃO CONFIÁVEL: nunca é instrução (lib/ai/security/external-content.ts).

export const RULE_VERSION = "f5b-1.0.0";

export type ProjectLinkStatus = "LINKED" | "CANDIDATE" | "UNLINKED" | "AMBIGUOUS";
export type Officiality =
  | "OFICIAL_CLIENTE"
  | "OFICIAL_GERENCIADORA"
  | "REPRESENTANTE_DELEGADO"
  | "FORNECEDOR_SUBCONTRATADA"
  | "INTERNA"
  | "EXTERNA_NAO_CLASSIFICADA";
export type AuthorityCheck =
  | "WITHIN_DELEGATION"
  | "NEEDS_CLIENT_APPROVAL"
  | "FORMAL_CHANGE"
  | "POSSIBLY_OUT_OF_SCOPE"
  | "NOT_APPLICABLE";
/** Pilares: SOMENTE estes quatro (decisão do responsável, Fase 6). Jurídico e Comercial são ÁREAS funcionais (FunctionalArea). */
export type Pillar = "PRAZO" | "CUSTO" | "SEGURANCA" | "QUALIDADE";
export type FunctionalArea = "JURIDICO" | "COMERCIAL";
export type ClassificationStatus = "ANALYZED" | "NO_INDICATION" | "CANNOT_ANALYZE";

/** Espelha o JSON de `public.acc_resolve_external_party` (contrato da Frente C). Fail-closed: ausente => known=false. */
export interface PartyMatch {
  organization_id: string;
  org_kind: string;
  link_status: string; // ACTIVE | CANDIDATE | ENDED
  role_in_project: string;
  delegation_scope: string[] | null;
  valid_now: boolean;
  /** Opcional (não faz parte do contrato mínimo): cláusula de delegação registrada no vínculo. */
  delegation_clause_ref?: string | null;
}
export interface PartyResolution {
  matches: PartyMatch[];
  ambiguous: boolean;
  domain_shared: boolean;
  known: boolean;
}
export const UNKNOWN_PARTY: PartyResolution = { matches: [], ambiguous: false, domain_shared: false, known: false };

export interface AttachmentInput {
  filename: string;
  /** Texto extraído do anexo (quando houve extração). */
  text?: string | null;
  /** false => anexo indisponível/ilegível (registrado, nunca inventado). */
  available?: boolean;
}

export interface EmailInput {
  id: string;
  /** Projeto candidato (emails.project_id: projeto da caixa/ingestão). NÃO prova vínculo por si só. */
  candidateProjectId: string;
  subject: string;
  bodyText: string;
  from: string;
  to?: string[];
  cc?: string[];
  direction?: "INBOUND" | "OUTBOUND";
  sentAt?: string;
  attachments?: AttachmentInput[];
}

export interface ContractClauseFact {
  ref: string; // ex.: "Cláusula 12.3"
  topics: string[]; // ex.: ["PRAZO","REAJUSTE"]
}
export interface OrderFact {
  ref: string; // OC / pedido / contrato do fornecedor
  supplier?: string | null;
  item?: string | null;
  dueDate?: string | null;
  scheduleRef?: string | null;
  costBRL?: number | null;
}
/** Fatos reais do projeto, quando existirem. Ausentes => "SEM DADOS" (nunca inventar). */
export interface ProjectFacts {
  projectId: string;
  /** Referências contratuais deste projeto (nº de contrato, OS, projeto) usadas para provar o vínculo pelo texto. */
  contractRefs?: string[];
  clauses?: ContractClauseFact[];
  orders?: OrderFact[];
}

export interface ClassifyContext {
  facts: ProjectFacts;
  /** Domínios INTERNOS da Axion (ex.: axion.com.br). */
  internalDomains: string[];
  /** Resolução de parte por e-mail minúsculo, vinda de acc_resolve_external_party(projeto, email). Ausente => UNKNOWN_PARTY. */
  partyByEmail: Record<string, PartyResolution>;
  /** Referências contratuais de OUTROS projetos (detecção de projeto incorreto). */
  otherProjectRefs?: Array<{ projectId: string; ref: string }>;
}

export interface RiskSignalDraft {
  /** Pilar de impacto; nulo quando o sinal é puramente jurídico/comercial. */
  pillar: Pillar | null;
  /** Área funcional (JURIDICO | COMERCIAL); nula quando só há pilar. */
  functional_area: FunctionalArea | null;
  signal_kind: string;
  summary: string;
  evidence_excerpt: string;
  /** Referência rastreável: email:<id>#subject | #body | #attachment:<nome>. */
  evidence_ref: string;
  is_indication: true;
  confirmed: false;
  /** null quando o pilar não é quantificável; senão objeto com status SEM_DADOS | DECLARADO_NA_MENSAGEM | CORRELACIONADO. */
  quantified_impact: Record<string, unknown> | null;
}

export interface ClassificationResult {
  email_id: string;
  project_id: string | null;
  project_link_status: ProjectLinkStatus;
  project_link_basis: string;
  officiality: Officiality;
  party_kind: string;
  organization_id: string | null;
  authority_check: AuthorityCheck;
  clause_ref: string | null;
  pillars: Pillar[];
  rule_version: string;
  status: ClassificationStatus;
  cannot_reason: string | null;
  injection_flag: boolean;
  signals: RiskSignalDraft[];
  /** Observações não persistidas (anexo indisponível, sentenças excluídas por injeção, encaminhamento...). */
  notes: string[];
}
