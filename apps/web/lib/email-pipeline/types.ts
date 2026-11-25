// Fase 5 / G — pipeline ponta a ponta de classificação de e-mail (chamador que liga A -> C -> B -> D).
// Puro e injetável: nenhum cliente de rede/banco é criado aqui; store, resolvedor de parte e relógio chegam por parâmetro.
// Conteúdo de e-mail de terceiros é DADO NÃO CONFIÁVEL: o pipeline nunca o interpreta como instrução e nunca altera a mensagem original.
import type { ClassificationStore } from "../email-classification/persist";
import type { PartyResolution, ProjectFacts, Pillar } from "../email-classification/types";

/** Linha de public.emails (A) com o que o pipeline precisa. Somente leitura. */
export interface PipelineEmailRow {
  id: string;
  /** emails.project_id (projeto da caixa/ingestão). Nulo/vazio => UNLINKED (nunca classificado como oficial). */
  project_id: string | null;
  from_address: string;
  /** Pode conter vários endereços (separados por vírgula/ponto e vírgula) ou formato "Nome <x@y>". */
  to_address: string | null;
  cc_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  snippet: string | null;
  direction: "INBOUND" | "OUTBOUND" | null;
  sent_at: string | null;
  /** [{filename, status: AVAILABLE|UNAVAILABLE}] (A). */
  attachments_meta: Array<{ filename?: string; status?: string }> | null;
  /** Classificação já existente para a rule_version corrente (null => ainda sem classificação). */
  existing: { status: string; cannot_reason: string | null; project_link_status: string } | null;
}

export interface ProjectContext {
  facts: ProjectFacts;
  otherProjectRefs: Array<{ projectId: string; ref: string }>;
}

export interface ExclusionCount {
  reason: string;
  count: number;
}

/** Store do pipeline (server-side, service_role). Estende o ClassificationStore de B (idempotente por email_id + rule_version). */
export interface PipelineStore extends ClassificationStore {
  listEmails(filter: { projectId?: string | null; ruleVersion: string; limit: number }): Promise<PipelineEmailRow[]>;
  loadProjectContext(projectId: string): Promise<ProjectContext>;
  /** Mensagens que A NÃO ingeriu (email_ingestion_exclusions), por motivo — só leitura, para a reconciliação. */
  listExclusionCounts(filter: { projectId?: string | null }): Promise<ExclusionCount[]>;
  /** acc_external_candidate_register: deixa PENDING para decisão humana; nunca confirma nada. */
  registerCandidate(projectId: string, email: string, emailId: string): Promise<string | null>;
}

/** Resolvedor de parte (envolve acc_resolve_external_party). Qualquer falha => UNKNOWN (fail-closed) — responsabilidade do resolvedor. */
export type PartyResolver = (projectId: string, email: string) => Promise<PartyResolution>;

export interface PipelineOptions {
  store: PipelineStore;
  resolveParty: PartyResolver;
  /** false (padrão) => DRY_RUN: nada é gravado e nenhum candidato é registrado. */
  apply?: boolean;
  projectId?: string | null;
  limit?: number;
  internalDomains?: string[];
  /** Sobrescreve a versão de regra (testes). */
  ruleVersion?: string;
}

export type UnclassifiedReason = "PENDENTE_DRY_RUN" | "SEM_PROJETO" | "ERRO_NA_CLASSIFICACAO";

export interface PipelineMessageOutcome {
  email_id: string;
  project_id: string | null;
  action: "ALREADY_CLASSIFIED" | "CLASSIFIED" | "WOULD_CLASSIFY" | "UNLINKED_NO_PROJECT" | "FAILED";
  status?: string;
  project_link_status?: string;
  officiality?: string;
  pillars?: Pillar[];
  signals_new?: number;
  candidates_registered?: string[];
  candidates_would_register?: string[];
  error?: string;
}

export interface PipelineReconciliation {
  /** Mensagens em public.emails dentro do escopo. */
  ingested: number;
  classified: number;
  unclassified: number;
  /** ingested = classified + unclassified (identidade conferida pelo pipeline). */
  identity_ok: boolean;
  classified_by_status: Record<string, number>;
  /** Classificadas como CANNOT_ANALYZE: motivo => quantidade. */
  cannot_analyze_by_reason: Record<string, number>;
  unclassified_by_reason: Record<string, number>;
  /** Mensagens que A não ingeriu (com motivo): contexto, NÃO entram na identidade acima. */
  not_ingested_by_reason: Record<string, number>;
}

export interface PipelineReport {
  mode: "DRY_RUN" | "APPLY";
  rule_version: string;
  projects: string[];
  outcomes: PipelineMessageOutcome[];
  reconciliation: PipelineReconciliation;
  totals: {
    newly_classified: number;
    would_classify: number;
    signals_new: number;
    candidates_registered: number;
    candidates_would_register: number;
    resolutions_requested: number;
    resolutions_cached: number;
    failed: number;
  };
}
