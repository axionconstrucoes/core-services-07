// Mappers linha-do-banco (snake_case) -> modelo de domínio (camelCase). Puros.

import type {
  ActionStatus,
  Criticality,
  EvidenceClassification,
  EvidenceRef,
  EvidenceSourceType,
  OriginType,
  VerificationRecord,
  VerificationResult,
} from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const reqStr = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new Error(`quality mapper: campo obrigatório ausente: ${name}`);
  return v;
};

export interface NcrView {
  id: string;
  projectId: string;
  code: string;
  title: string;
  state: string;
  originType: OriginType;
  originRef: string;
  originKey: string;
  originUrl: string | null;
  criticality: Criticality;
  reopenCount: number;
  rowVersion: number;
  duplicateOfId: string | null;
  responsibleUserId: string | null;
  dueDate: string | null;
}

export function mapNcrRow(r: Row): NcrView {
  return {
    id: reqStr(r.id, "id"),
    projectId: reqStr(r.project_id, "project_id"),
    code: reqStr(r.code, "code"),
    title: reqStr(r.title, "title"),
    state: reqStr(r.state, "state"),
    originType: reqStr(r.origin_type, "origin_type") as OriginType,
    originRef: reqStr(r.origin_ref, "origin_ref"),
    originKey: reqStr(r.origin_key, "origin_key"),
    originUrl: str(r.origin_url),
    criticality: (str(r.criticality) ?? "SEM_DADOS") as Criticality,
    reopenCount: Number(r.reopen_count ?? 0),
    rowVersion: Number(r.row_version ?? 1),
    duplicateOfId: str(r.duplicate_of_id),
    responsibleUserId: str(r.responsible_user_id),
    dueDate: str(r.due_date),
  };
}

export function mapEvidenceRow(r: Row): EvidenceRef {
  return {
    id: reqStr(r.id, "id"),
    sourceType: reqStr(r.source_type, "source_type") as EvidenceSourceType,
    sourceRef: reqStr(r.source_ref, "source_ref"),
    sourceUrl: str(r.source_url),
    classification: reqStr(r.classification, "classification") as EvidenceClassification,
    epistemic: (str(r.epistemic) ?? "FATO") as EvidenceRef["epistemic"],
  };
}

export function mapVerificationRow(r: Row): VerificationRecord {
  return {
    result: reqStr(r.result, "result") as VerificationResult,
    hasEvidence: typeof r.evidence_id === "string" && r.evidence_id.length > 0,
    eventSeqAt: Number(r.event_seq_at ?? 0),
  };
}

export function mapActionRow(r: Row): { status: ActionStatus } {
  return { status: reqStr(r.status, "status") as ActionStatus };
}

/** Resposta JSON das RPCs de transição. */
export interface TransitionResult {
  ok: true;
  entityType: "NCR" | "WARRANTY";
  id: string;
  from: string;
  to: string;
  rowVersion: number;
  auditId: string;
}

/** Códigos de erro estáveis das RPCs (mensagem do Postgres inicia com o código). */
export function parseQualityError(message: string): { code: string; detail: string } | null {
  const m = /^(AUTH_REQUIRED|FORBIDDEN|VERSION_REQUIRED|VERSION_CONFLICT|INVALID_TRANSITION|JUSTIFICATION_REQUIRED|EVIDENCE_REQUIRED|EVIDENCE_INVALID|DUPLICATE_TARGET_INVALID|TRANSITION_BLOCKED|ORIGIN_REQUIRED|INVALID_DATA|INVALID_STATE|EVIDENCE_LOCKED|EPISTEMIC_INVALID|CASE_NOT_ACTIVE|COST_SOURCE_REQUIRED|LINK_TARGET_INVALID|DUPLICATE_EVIDENCE|DUPLICATE_RECORD|COMPETENCE_REQUIRED)(?::\s*(.*))?$/s.exec(
    message.trim(),
  );
  return m ? { code: m[1], detail: m[2] ?? "" } : null;
}
