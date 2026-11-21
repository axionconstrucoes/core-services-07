// Persistência IDEMPOTENTE do resultado da classificação. Só monta linhas e delega a um "store" injetado (server-side, service_role).
// Mesma mensagem + RULE_VERSION => mesma linha (unique email_id+rule_version); sinais únicos por (classificação, pilar, tipo).
// Sem "server-only": testável por script Node. Esta camada NÃO está ligada a nenhuma rota/cron (ver relatório da Fase 5/B).
import type { ClassificationResult, RiskSignalDraft } from "./types";

export interface ClassificationRow {
  email_id: string;
  project_id: string | null;
  project_link_status: string;
  project_link_basis: string;
  officiality: string;
  party_kind: string;
  organization_id: string | null;
  authority_check: string;
  clause_ref: string | null;
  pillars: string[];
  rule_version: string;
  status: string;
  cannot_reason: string | null;
  injection_flag: boolean;
}
export interface SignalRow extends RiskSignalDraft {
  email_id: string;
  classification_id: string;
  project_id: string;
}

export interface ClassificationStore {
  /** Insere se (email_id, rule_version) ainda não existe; devolve o id e se foi criado agora. */
  upsertClassification(row: ClassificationRow): Promise<{ id: string; created: boolean }>;
  /** Insere ignorando duplicatas por (classification_id, pillar, signal_kind); devolve quantas linhas novas entraram. */
  insertSignals(rows: SignalRow[]): Promise<number>;
}

export function toClassificationRow(r: ClassificationResult): ClassificationRow {
  return {
    email_id: r.email_id,
    project_id: r.project_id,
    project_link_status: r.project_link_status,
    project_link_basis: r.project_link_basis,
    officiality: r.officiality,
    party_kind: r.party_kind,
    organization_id: r.organization_id,
    authority_check: r.authority_check,
    clause_ref: r.clause_ref,
    pillars: r.pillars,
    rule_version: r.rule_version,
    status: r.status,
    cannot_reason: r.cannot_reason,
    injection_flag: r.injection_flag,
  };
}

export async function persistClassification(store: ClassificationStore, r: ClassificationResult) {
  const { id, created } = await store.upsertClassification(toClassificationRow(r));
  let newSignals = 0;
  if (r.project_id && r.signals.length > 0) {
    newSignals = await store.insertSignals(r.signals.map((s) => ({ ...s, email_id: r.email_id, classification_id: id, project_id: r.project_id as string })));
  }
  return { classificationId: id, created, newSignals };
}
