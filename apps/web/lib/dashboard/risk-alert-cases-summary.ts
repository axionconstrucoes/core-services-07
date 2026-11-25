// Alertas de risco do Dashboard executivo — fonte: public.risk_alert_cases
// (os mesmos casos abertos em /{projectId}/alertas/{caseId} e comunicados
// por e-mail pela outbox risk_alert_outbox). Puro, sem I/O.
//
// Por que existe: o card "Alertas ativos" lia SOMENTE ai_findings (achados
// de IA ainda não resolvidos) e mostrava 0 enquanto a obra tinha casos de
// risco abertos e ações SLA vencidas. Achado de IA e alerta de risco são
// fontes diferentes; o Dashboard passa a mostrar as duas, separadas, sem
// somar uma na outra e sem criar alerta novo.
//
// Critério de caso ABERTO (o mesmo já usado no restante do ACC):
//   - status = 'OPEN'  (a condição de risco ainda está presente na última
//     avaliação; 'CLOSED' = a origem deixou de indicar o risco);
//   - state <> 'RESOLVED' (resolução registrada por humano — mesmo critério
//     de alert-detail-data.ts: caseClosed = status CLOSED || state RESOLVED);
//   - não é caso de TESTE do piloto (isPilotTestCase) — fica fora dos
//     indicadores, como em pilot-risk-alerts-view-data.ts.
// `state` (OPEN, ACKNOWLEDGED, …) é a máquina de tratamento do alerta, NÃO a
// existência do risco: um caso com status CLOSED e state OPEN é um risco
// encerrado pela origem que ninguém chegou a tratar — não é contado como aberto.

import type { AlertSeverity } from "@axion/types";

import { isPilotTestCase } from "@/lib/risk-alerts/pilot-test-case";

export type RiskCaseLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "REVIEW_REQUIRED";

export interface RiskAlertCaseRow {
  id: string;
  status: string;
  state: string | null;
  risk_level: string;
  title: string | null;
  reference: string | null;
  sla_action_id: string | null;
}

export interface RiskAlertCasesSummary {
  /** Casos de risco abertos (critério acima). */
  open: number;
  /** Abertos por nível de severidade do ACC (BAIXA..CRITICA); REVIEW_REQUIRED fica em `reviewRequired`. */
  openBySeverity: Record<AlertSeverity, number>;
  /** Abertos com nível "revisão necessária" (sem severidade definida). */
  reviewRequired: number;
  /** Casos encerrados (status CLOSED ou state RESOLVED), fora os de teste. */
  closed: number;
  /** Casos de TESTE do piloto ainda abertos (fora de todos os indicadores). */
  testOpen: number;
  /** Abertos com ação SLA vinculada. */
  openWithSlaAction: number;
  /**
   * Abertos ALTO/CRÍTICO SEM ação SLA vinculada. A regra do ciclo de risco cria ação SLA para ALTO/CRÍTICO
   * (risk_alert_cases.sla_action_id); > 0 indica obrigação não atendida a investigar — o painel só mostra, não cria nada.
   */
  openHighCriticalWithoutSlaAction: number;
  /** Total de linhas lidas (inclui teste), para rastreabilidade. */
  totalRows: number;
}

const LEVEL_TO_SEVERITY: Record<Exclude<RiskCaseLevel, "REVIEW_REQUIRED">, AlertSeverity> = {
  LOW: "BAIXA",
  MEDIUM: "MEDIA",
  HIGH: "ALTA",
  CRITICAL: "CRITICA",
};

export function isRiskAlertCaseOpen(row: Pick<RiskAlertCaseRow, "status" | "state">): boolean {
  return row.status === "OPEN" && row.state !== "RESOLVED";
}

export function summarizeRiskAlertCases(rows: readonly RiskAlertCaseRow[]): RiskAlertCasesSummary {
  const openBySeverity: Record<AlertSeverity, number> = { BAIXA: 0, MEDIA: 0, ALTA: 0, CRITICA: 0 };
  let open = 0;
  let reviewRequired = 0;
  let closed = 0;
  let testOpen = 0;
  let openWithSlaAction = 0;
  let openHighCriticalWithoutSlaAction = 0;

  for (const row of rows) {
    const isTest = isPilotTestCase({ title: row.title, reference: row.reference });
    const isOpen = isRiskAlertCaseOpen(row);
    if (isTest) {
      if (isOpen) testOpen += 1;
      continue;
    }
    if (!isOpen) {
      closed += 1;
      continue;
    }
    open += 1;
    if (row.sla_action_id) openWithSlaAction += 1;
    const level = row.risk_level as RiskCaseLevel;
    if (level === "LOW" || level === "MEDIUM" || level === "HIGH" || level === "CRITICAL") {
      openBySeverity[LEVEL_TO_SEVERITY[level]] += 1;
      if ((level === "HIGH" || level === "CRITICAL") && !row.sla_action_id) openHighCriticalWithoutSlaAction += 1;
    } else {
      // REVIEW_REQUIRED ou valor desconhecido: nunca promovido a uma severidade.
      reviewRequired += 1;
    }
  }

  return { open, openBySeverity, reviewRequired, closed, testOpen, openWithSlaAction, openHighCriticalWithoutSlaAction, totalRows: rows.length };
}

export type DashboardRiskLevel = "SEM_RISCO_ATIVO" | "EM_REVISAO" | AlertSeverity;

const SEVERITY_RANK: Record<AlertSeverity, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2, CRITICA: 3 };

/**
 * "Risco atual" do Dashboard: maior severidade entre (a) achados de IA ativos (resolveGeneralSituation) e
 * (b) casos de risco abertos. Antes considerava só (a) e mostrava "SEM RISCO" com casos ALTO/CRÍTICO abertos.
 * `cases` null = leitura dos casos indisponível => mantém só (a) e o chamador informa a indisponibilidade.
 * Só casos REVIEW_REQUIRED (sem severidade) => EM_REVISAO (nunca vira "sem risco" nem uma severidade inventada).
 */
export function resolveDashboardRiskLevel(
  findingsSituation: "SEM_RISCO_ATIVO" | AlertSeverity,
  cases: RiskAlertCasesSummary | null
): DashboardRiskLevel {
  let highest: AlertSeverity | null = findingsSituation === "SEM_RISCO_ATIVO" ? null : findingsSituation;
  if (cases) {
    for (const severity of ["BAIXA", "MEDIA", "ALTA", "CRITICA"] as AlertSeverity[]) {
      if (cases.openBySeverity[severity] > 0 && (highest === null || SEVERITY_RANK[severity] > SEVERITY_RANK[highest])) highest = severity;
    }
    if (highest === null && cases.reviewRequired > 0) return "EM_REVISAO";
  }
  return highest ?? "SEM_RISCO_ATIVO";
}
