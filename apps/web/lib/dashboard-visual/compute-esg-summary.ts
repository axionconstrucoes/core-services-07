// Card ESG/SSMA — POSIÇÃO ATUAL das obrigações ativas (nunca filtrada pelo
// período do dashboard). Puro, sem I/O; `today` (YYYY-MM-DD) é injetado.
//
// Comprovação "vigente" de uma obrigação = a de maior reference_date;
// desempate por created_at, depois updated_at, depois id (determinístico).
//
// Baldes que PARTICIONAM as obrigações ativas (soma == occurrences):
//  - cumprida:   vigente CUMPRIDO.
//  - dispensada: vigente NAO_APLICAVEL ou DISPENSADO (contada à parte, nunca
//                como pendente).
//  - vencida:    vigente PENDENTE/CUMPRIDO_PARCIALMENTE/NAO_CUMPRIDO com
//                due_date < today (vencer hoje ainda NÃO é vencida).
//  - pendente:   sem nenhuma comprovação, ou vigente em aberto (mesmos três
//                status) com due_date nulo ou >= today.
// Sobreposições (podem incluir obrigações de qualquer balde acima):
//  - aguardandoRevisao: existe comprovação vigente e reviewed_at é nulo.
//                Vale também para NAO_APLICAVEL/DISPENSADO: uma dispensa
//                também precisa de validação humana. Sem comprovação = não
//                há o que revisar (fica só em "pendente").
//  - evidenciaPendente: a obrigação exige evidência (required_evidence_
//                description) e a vigente é CUMPRIDO/CUMPRIDO_PARCIALMENTE
//                com zero evidências anexadas.
// `open` (compatibilidade) = pendente + vencida.

import type {
  EsgObligation,
  EsgObligationCategory,
  EsgObligationEvidence,
  EsgObligationStatus,
  EsgObligationSubmission,
  EsgRiskLevel,
} from "@/lib/esg/types";

const OPEN_STATUSES = new Set<EsgObligationStatus>(["PENDENTE", "CUMPRIDO_PARCIALMENTE", "NAO_CUMPRIDO"]);
const EXEMPT_STATUSES = new Set<EsgObligationStatus>(["NAO_APLICAVEL", "DISPENSADO"]);

export type EsgBucket = "cumprida" | "pendente" | "vencida" | "dispensada" | "aguardandoRevisao" | "evidenciaPendente";

export interface EsgSummaryItem {
  obligationId: string;
  title: string;
  category: EsgObligationCategory;
  responsibleLabel: string | null;
  /** Status da comprovação vigente; null = nenhuma comprovação registrada. */
  status: EsgObligationStatus | null;
  dueDate: string | null;
  riskLevel: EsgRiskLevel | null;
  evidenceCount: number;
  reviewedAt: string | null;
}

export interface EsgSummary {
  occurrences: number;
  /** pendente + vencida (compatibilidade). */
  open: number;
  countsByRisk: Record<EsgRiskLevel, number>;
  /** Alias de evidenciaPendente (compatibilidade). */
  evidencePending: number;
  lastUpdatedAt: string | null;
  cumprida: number;
  pendente: number;
  vencida: number;
  dispensada: number;
  aguardandoRevisao: number;
  evidenciaPendente: number;
  items: Record<EsgBucket, EsgSummaryItem[]>;
}

function day(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function isNewer(a: EsgObligationSubmission, b: EsgObligationSubmission): boolean {
  const keys: Array<(s: EsgObligationSubmission) => string> = [
    (s) => day(s.referenceDate) ?? "",
    (s) => s.createdAt ?? "",
    (s) => s.updatedAt ?? "",
    (s) => s.id,
  ];
  for (const key of keys) {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka > kb;
  }
  return false;
}

function latestSubmissionByObligation(submissions: EsgObligationSubmission[]): Map<string, EsgObligationSubmission> {
  const latest = new Map<string, EsgObligationSubmission>();
  for (const submission of submissions) {
    const current = latest.get(submission.obligationId);
    if (!current || isNewer(submission, current)) latest.set(submission.obligationId, submission);
  }
  return latest;
}

export function computeEsgSummary(
  obligations: EsgObligation[],
  submissions: EsgObligationSubmission[],
  evidence: EsgObligationEvidence[],
  today: string
): EsgSummary {
  const activeObligations = obligations.filter((o) => o.active);
  const latestByObligation = latestSubmissionByObligation(submissions);
  const evidenceCountBySubmission = new Map<string, number>();
  for (const item of evidence) {
    evidenceCountBySubmission.set(item.submissionId, (evidenceCountBySubmission.get(item.submissionId) ?? 0) + 1);
  }

  const items: Record<EsgBucket, EsgSummaryItem[]> = {
    cumprida: [],
    pendente: [],
    vencida: [],
    dispensada: [],
    aguardandoRevisao: [],
    evidenciaPendente: [],
  };
  const countsByRisk: Record<EsgRiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let lastUpdatedAt: string | null = null;

  for (const obligation of activeObligations) {
    const submission = latestByObligation.get(obligation.id) ?? null;
    const evidenceCount = submission ? (evidenceCountBySubmission.get(submission.id) ?? 0) : 0;
    const item: EsgSummaryItem = {
      obligationId: obligation.id,
      title: obligation.title,
      category: obligation.category,
      responsibleLabel: obligation.responsibleLabel ?? obligation.responsibleName,
      status: submission?.status ?? null,
      dueDate: day(submission?.dueDate ?? null),
      riskLevel: submission?.riskLevel ?? null,
      evidenceCount,
      reviewedAt: submission?.reviewedAt ?? null,
    };

    if (submission?.status === "CUMPRIDO") {
      items.cumprida.push(item);
    } else if (submission && EXEMPT_STATUSES.has(submission.status)) {
      items.dispensada.push(item);
    } else if (submission && OPEN_STATUSES.has(submission.status) && item.dueDate !== null && item.dueDate < today) {
      items.vencida.push(item);
    } else {
      items.pendente.push(item);
    }

    if (submission && !submission.reviewedAt) items.aguardandoRevisao.push(item);

    if (
      submission &&
      obligation.requiredEvidenceDescription &&
      (submission.status === "CUMPRIDO" || submission.status === "CUMPRIDO_PARCIALMENTE") &&
      evidenceCount === 0
    ) {
      items.evidenciaPendente.push(item);
    }

    if (submission?.riskLevel) {
      countsByRisk[submission.riskLevel] += 1;
      if (!lastUpdatedAt || new Date(submission.updatedAt).getTime() > new Date(lastUpdatedAt).getTime()) {
        lastUpdatedAt = submission.updatedAt;
      }
    }
  }

  return {
    occurrences: activeObligations.length,
    open: items.pendente.length + items.vencida.length,
    countsByRisk,
    evidencePending: items.evidenciaPendente.length,
    lastUpdatedAt,
    cumprida: items.cumprida.length,
    pendente: items.pendente.length,
    vencida: items.vencida.length,
    dispensada: items.dispensada.length,
    aguardandoRevisao: items.aguardandoRevisao.length,
    evidenciaPendente: items.evidenciaPendente.length,
    items,
  };
}
