// Orquestrador da curadoria automática (seção 10 do requisito):
// SOURCE_INGESTED_OR_UPDATED → classify → fingerprint → detectar mudança
// → routeExperts → specialist curation → grounding (já embutido nas
// funções de query reutilizadas) → persist finding → alerta interno →
// human review. Sempre chamado sob demanda pela aplicação (nenhum
// scheduler/cron) — o "automático" está em nunca depender de pergunta
// manual do usuário, não em rodar sozinho em background.
//
// Segurança da ingestão (seção 11): a fonte (aqui, um
// additional_proposal_drive_sources) já foi persistida ANTES desta
// função ser chamada — se a IA falhar aqui, a fonte permanece
// disponível normalmente, só o ai_curation_runs fica FAILED_PENDING_RETRY.
//
// Limite de IA (frente N6 — antes esta curadoria chamava os Experts SEM
// reserva): por ser automática (sem sessão), usa a variante service_role
// ai_consult_reserve_for_actor, tipo AUTOMATIC_CURATION, em nome do usuário
// que originou a fonte (createdByUserId) — ver actorExpertReserve em
// lib/ai/alert-consult/consult-quota.ts. 1 unidade por Expert chamado
// (Jurídico do confronto, Comercial/Planejamento roteados e CEO IA),
// reservada na FRONTEIRA DO PROVEDOR de cada um. Sem solicitante
// identificável (ou sem mecanismo de reserva) a IA NÃO é chamada e a
// recusa fica registrada em ai_curation_runs (status BLOCKED_NO_REQUESTER).

import type { SupabaseClient } from "@supabase/supabase-js";
import { runExecutiveCuration } from "../../ai/experts/ceo/consolidate";
import { answerCommercialDirectorQuery } from "../../ai/experts/commercial-director/query";
import { answerPlanningDirectorQuery } from "../../ai/experts/planning-director/query";
import type { AiConsultReservation } from "../../ai/alert-consult/consult-quota";
import type { OfficialExpertId } from "../../ai/expert-definitions/types";
import { gatedProviderForExpert } from "../../ai/governance/quota-gated-provider";
import type { AiProvider, AiProviderExpertPosition } from "../../ai/providers/types";
import type { ExpertId, ExpertSeverity } from "../../ai/types";
import { runClientSourceConfrontation } from "../confrontation/run-client-source-confrontation";
import { classifyInitialLifecycleStatus } from "./classify-finding-lifecycle";
import { computeFindingFingerprint, computeSourceFingerprint } from "./compute-fingerprint";
import { completeCurationRun, failCurationRun, findCompletedCurationRun, startCurationRun } from "./curation-run";
import { persistFinding } from "./persist-finding";
import { routeExpertsForConfrontation } from "./route-confrontation-experts";
import type { AiCurationRunStatus, AiFinding, AiFindingSourceRef } from "./types";

export interface RunAutomaticCurationInput {
  projectId: string;
  proposalId: string;
  driveSourceId: string;
  sourceLabel: string;
  sourceSummary: string;
  /** Hash real do conteúdo quando já disponível (ex.: sha256 do arquivo processado); cai para hash do resumo quando ausente. */
  contentHash?: string;
  hasCostOrScheduleImpact?: boolean;
  /** Usuário que originou a fonte — é o SOLICITANTE em nome de quem o limite de IA é reservado. Sem ele, nada é chamado. */
  createdByUserId?: string;
  /**
   * OBRIGATÓRIO para chamar a IA: reserva 1 unidade para o Expert (produção: actorExpertReserve(admin,
   * createdByUserId, projectId, "AUTOMATIC_CURATION", ...), grant só service_role). Ausente = nada é chamado.
   */
  reserve?: (expertId: OfficialExpertId) => Promise<AiConsultReservation>;
  /** Só para testes — injeta o provider do confronto Jurídico sem depender de resolução por env var. */
  confrontationProvider?: AiProvider;
  /** Só para testes — provider simulado dos Experts roteados e do CEO IA. */
  expertProvider?: AiProvider;
  /**
   * Data documental/de evento da fonte (Start-up ACC — seção 5/6 do
   * requisito de revisão histórica). Quando informada e anterior a
   * projects.acc_operational_start_date, o finding nasce
   * HISTORICAL_PENDING_STARTUP_REVIEW em vez de NEW — nunca apresentado
   * como ocorrência nova.
   */
  effectiveDate?: string | null;
}

export interface RunAutomaticCurationResult {
  status: "SKIPPED_UNCHANGED" | "COMPLETED" | "FAILED_PENDING_RETRY" | "BLOCKED_NO_REQUESTER";
  finding: AiFinding | null;
  findingCreated: boolean;
  runStatus: AiCurationRunStatus;
  routedExpertIds: ExpertId[];
}

function toPosition(expertId: OfficialExpertId, expertName: string, severity: ExpertSeverity, interpretacao: string, riscos: string[], recomendacoes: string[], informacoesFaltantes: string[]): AiProviderExpertPosition {
  return { expertId, expertName, severity, interpretacao, riscos, recomendacoes, informacoesFaltantes };
}

/** Mensagem registrada em ai_curation_runs.error_message quando não há solicitante identificável. */
export const AUTOMATIC_CURATION_NO_REQUESTER_MESSAGE =
  "BLOCKED_NO_REQUESTER: curadoria automática sem usuário solicitante identificável (ou sem reserva do limite de IA) — nenhum Expert foi chamado.";

export async function runAutomaticCurationForClientSource(
  supabase: SupabaseClient,
  input: RunAutomaticCurationInput
): Promise<RunAutomaticCurationResult> {
  const contentHash = input.contentHash ?? input.sourceSummary;
  const sourceFingerprint = computeSourceFingerprint({
    sourceType: "ADDITIONAL_PROPOSAL_DRIVE_SOURCE",
    sourceId: input.driveSourceId,
    contentHash,
  });

  // Seção 12 — conteúdo não mudou desde a última execução COMPLETED: nunca reexecuta.
  const existingRun = await findCompletedCurationRun(supabase, {
    sourceType: "ADDITIONAL_PROPOSAL_DRIVE_SOURCE",
    sourceId: input.driveSourceId,
    sourceFingerprint,
  });
  if (existingRun) {
    return { status: "SKIPPED_UNCHANGED", finding: null, findingCreated: false, runStatus: "COMPLETED", routedExpertIds: existingRun.routedExpertIds };
  }

  const run = await startCurationRun(supabase, {
    projectId: input.projectId,
    sourceType: "ADDITIONAL_PROPOSAL_DRIVE_SOURCE",
    sourceId: input.driveSourceId,
    sourceFingerprint,
    triggerType: "AUTOMATIC",
    createdByUserId: input.createdByUserId,
  });

  // Sem solicitante identificável (ou sem reserva): não chama a IA e registra a recusa.
  const reserve = input.reserve;
  if (!input.createdByUserId || typeof reserve !== "function") {
    await failCurationRun(supabase, run.id, AUTOMATIC_CURATION_NO_REQUESTER_MESSAGE);
    return { status: "BLOCKED_NO_REQUESTER", finding: null, findingCreated: false, runStatus: "FAILED_PENDING_RETRY", routedExpertIds: [] };
  }
  const gated = (expertId: OfficialExpertId, base?: AiProvider) => gatedProviderForExpert(expertId, reserve, base);

  try {
    const { confrontation } = await runClientSourceConfrontation(
      supabase,
      { projectId: input.projectId, sourceLabel: input.sourceLabel, sourceSummary: input.sourceSummary },
      gated("legal-consultant", input.confrontationProvider)
    );

    const routing = routeExpertsForConfrontation({
      classification: confrontation.confrontation.classification,
      hasCostOrScheduleImpact: input.hasCostOrScheduleImpact,
    });

    const positions: AiProviderExpertPosition[] = [
      toPosition(
        "legal-consultant",
        confrontation.expertName,
        confrontation.severity,
        confrontation.finding.interpretation,
        confrontation.possibleImpacts,
        confrontation.recommendedActions,
        confrontation.uncertainties
      ),
    ];

    const routedExpertIds: OfficialExpertId[] = ["legal-consultant"];
    const question = `Confronto de fonte do cliente (${input.sourceLabel}): classificação ${confrontation.confrontation.classification}. ${confrontation.executiveSummary}`;

    for (const expertId of routing.additionalExpertIds) {
      if (expertId === "commercial-director") {
        const result = await answerCommercialDirectorQuery(supabase, { scope: "PROJECT", projectId: input.projectId, question }, gated(expertId, input.expertProvider));
        positions.push(toPosition(expertId, result.response.expertName, result.response.severity, result.response.interpretacao, result.response.riscos, result.response.recomendacoes, result.response.informacoesFaltantes));
        routedExpertIds.push(expertId);
      } else if (expertId === "planning-director") {
        const result = await answerPlanningDirectorQuery(supabase, { scope: "PROJECT", projectId: input.projectId, question }, gated(expertId, input.expertProvider));
        positions.push(toPosition(expertId, result.response.expertName, result.response.severity, result.response.interpretacao, result.response.riscos, result.response.recomendacoes, result.response.informacoesFaltantes));
        routedExpertIds.push(expertId);
      }
    }

    const highestSeverity = positions.reduce<ExpertSeverity>((highest, p) => {
      const rank: Record<ExpertSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
      return rank[p.severity] > rank[highest] ? p.severity : highest;
    }, "LOW");

    const isMaterial = routing.ceoMaterial || highestSeverity === "HIGH" || highestSeverity === "CRITICAL";

    let interpretation = confrontation.finding.interpretation;
    let recommendation = confrontation.recommendedActions[0] ?? confrontation.executiveSummary;

    if (isMaterial) {
      const { curation } = await runExecutiveCuration(question, positions, gated("ceo", input.expertProvider));
      routedExpertIds.push("ceo");
      interpretation = curation.situacao;
      recommendation = curation.recomendacao;
    }

    const sourceRefs: AiFindingSourceRef[] = [{ type: "ADDITIONAL_PROPOSAL_DRIVE_SOURCE", id: input.driveSourceId }];
    const conflictingSourceRefs: AiFindingSourceRef[] = confrontation.contractualBasis
      .filter((basis) => basis.clauseId)
      .map((basis) => ({ type: "CLAUSE", id: basis.clauseId as string }));

    const fingerprint = computeFindingFingerprint({
      findingType: "CLIENT_SOURCE_CONFRONTATION",
      sourceFingerprint,
      classification: confrontation.confrontation.classification,
    });

    // Start-up ACC (seção 7): finding com data efetiva anterior ao início
    // operacional nasce HISTORICAL_PENDING_STARTUP_REVIEW — nunca
    // apresentado como ocorrência nova, nunca dispara e-mail/escalonamento
    // normal antes da revisão humana do Start-up.
    const initialLifecycleStatus = await classifyInitialLifecycleStatus(supabase, {
      projectId: input.projectId,
      effectiveDate: input.effectiveDate,
    });

    const { finding, created } = await persistFinding(supabase, {
      projectId: input.projectId,
      curationRunId: run.id,
      findingType: "CLIENT_SOURCE_CONFRONTATION",
      classification: confrontation.confrontation.classification,
      expertIds: routedExpertIds,
      severity: highestSeverity,
      confidence: confrontation.confidence,
      facts: confrontation.finding.facts,
      interpretation,
      recommendation,
      grounding: confrontation.grounding ?? null,
      sourceRefs,
      conflictingSourceRefs,
      fingerprint,
      createdByUserId: input.createdByUserId,
      effectiveDate: input.effectiveDate ?? null,
      initialLifecycleStatus,
    });

    await completeCurationRun(supabase, run.id, routedExpertIds);

    return { status: "COMPLETED", finding, findingCreated: created, runStatus: "COMPLETED", routedExpertIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failCurationRun(supabase, run.id, message);
    return { status: "FAILED_PENDING_RETRY", finding: null, findingCreated: false, runStatus: "FAILED_PENDING_RETRY", routedExpertIds: [] };
  }
}
