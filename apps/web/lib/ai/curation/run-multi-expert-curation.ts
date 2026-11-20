// Orquestrador da fundação de curadoria IA multiagente (seção 5 do
// requisito): SOURCE → ROUTER → SPECIALIST(S) → NORMALIZAÇÃO → CEO IA →
// HUMANO. Máximo uma rodada de especialistas + uma consolidação CEO
// nesta fase (seção 9) — nunca uma conversa infinita agente↔agente.
// Nenhum scheduler é criado aqui — chamado sempre sob demanda (script,
// Server Action, ciclo de alertas ou teste).
//
// Limite de IA (ai_consult_reserve, tipo CURATION): a curadoria reserva
// 1 unidade por Expert chamado — cada especialista E a consolidação do
// CEO IA — na FRONTEIRA DO PROVEDOR daquele Expert (frente N6): depois
// dos guards determinísticos dele e imediatamente antes da chamada. Um
// Expert recusado por guard (ex.: Planejamento sem MPP) não consome
// unidade. Reserva recusada interrompe a rodada (falha fechada): nenhum
// Expert seguinte é chamado e nenhuma consolidação parcial é apresentada
// como completa.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiConsultReservation } from "../alert-consult/consult-quota";
import { gatedProviderForExpert } from "../governance/quota-gated-provider";
import { answerCommercialDirectorQuery } from "../experts/commercial-director/query";
import { runExecutiveCuration } from "../experts/ceo/consolidate";
import { answerEngineeringDirectorQuery } from "../experts/engineering-director/query";
import { answerEsgDirectorQuery } from "../experts/esg-director/query";
import { answerLegalConsultantQuery } from "../experts/legal-consultant/query";
import { answerPlanningDirectorQuery } from "../experts/planning-director/query";
import { scheduleSourceBlockingMessage } from "../experts/planning-director/schedule-source-guard";
import type { OfficialExpertId } from "../expert-definitions/types";
import type { AiProvider, AiProviderExpertPosition } from "../providers/types";
import type { ExpertQueryRequest, ExpertQueryResponse, ExpertQueryScope } from "../query/types";
import { decideExpertRouting } from "./route-experts";
import type { CurationInput, ExpertCurationResult, MultiExpertCuration } from "./types";

type SpecialistExpertId = Exclude<OfficialExpertId, "ceo">;

// Bloqueios determinísticos do Diretor de Planejamento IA (análise formal de prazo sem MPP estruturado): o
// especialista fica sem parecer nesta rodada (registrado em unavailableExperts) e os demais seguem.
const PLANNING_BLOCKING_MESSAGES: readonly string[] = [
  scheduleSourceBlockingMessage("MISSING_MPP"),
  scheduleSourceBlockingMessage("MPP_PRESENT_NOT_EXTRACTED"),
];

/** Especialistas desta rodada, na ordem da matriz. "ceo" nunca aparece aqui — é sempre a consolidação final. */
export const CURATION_SPECIALIST_IDS: readonly SpecialistExpertId[] = [
  "commercial-director",
  "esg-director",
  "legal-consultant",
  "planning-director",
  "engineering-director",
];

export interface MultiExpertCurationOptions {
  /**
   * OBRIGATÓRIO: reserva uma unidade do limite de IA para o Expert indicado, antes da chamada dele. Quem chama
   * decide a variante (sessão do usuário ou service_role com o usuário solicitante).
   */
  reserve(expertId: OfficialExpertId): Promise<AiConsultReservation>;
  /** Somente testes: provider simulado para todos os Experts da rodada. Em produção cada Expert resolve o seu. */
  provider?: AiProvider;
}

interface SpecialistRunOptions {
  includeContractualDocuments: boolean;
}

/**
 * Executa UM especialista reutilizando o answerXQuery dele (a lógica de "monta contexto e chama o provider"
 * vive inteira lá — nunca duplicada aqui).
 */
async function runSpecialist(
  supabase: SupabaseClient,
  expertId: SpecialistExpertId,
  request: ExpertQueryRequest,
  provider: AiProvider | undefined,
  { includeContractualDocuments }: SpecialistRunOptions
): Promise<{ response: ExpertQueryResponse }> {
  switch (expertId) {
    case "legal-consultant":
      return answerLegalConsultantQuery(supabase, request, provider, {
        includeContractualDocuments,
        requireContractualDocuments: includeContractualDocuments,
      });
    case "commercial-director":
      return answerCommercialDirectorQuery(supabase, request, provider, { includeContractualDocuments });
    case "esg-director":
      return answerEsgDirectorQuery(supabase, request, provider, { includeContractualDocuments });
    case "planning-director":
      return answerPlanningDirectorQuery(supabase, request, provider, { includeContractualDocuments });
    case "engineering-director":
      return answerEngineeringDirectorQuery(supabase, request, provider, { includeContractualDocuments });
  }
}

function gated(options: MultiExpertCurationOptions, expertId: OfficialExpertId): AiProvider {
  // Mensagem de recusa redigida para a tela (consult-quota.ts) — chega como ExpertQuerySafeError.
  return gatedProviderForExpert(expertId, options.reserve, options.provider);
}

function toPosition(expertId: OfficialExpertId, response: ExpertQueryResponse): AiProviderExpertPosition {
  return {
    expertId,
    expertName: response.expertName,
    severity: response.severity,
    interpretacao: response.interpretacao,
    riscos: response.riscos,
    recomendacoes: response.recomendacoes,
    informacoesFaltantes: response.informacoesFaltantes,
  };
}

/**
 * Executa uma rodada completa de curadoria multiagente para `input`:
 * roteia, executa cada Expert especializado roteado (uma única vez cada
 * — nunca em loop, nunca reexecutado), normaliza as posições e consolida
 * via CEO IA. `expertResults` reflete exatamente quem foi consultado —
 * nunca inclui um Expert que a rota não selecionou.
 */
export async function runMultiExpertCuration(
  supabase: SupabaseClient,
  input: CurationInput,
  options: MultiExpertCurationOptions
): Promise<MultiExpertCuration> {
  if (typeof options?.reserve !== "function") {
    // Falha fechada: sem mecanismo de reserva, nenhuma chamada de IA.
    throw new Error("Curadoria multi-Expert sem reserva do limite de IA — nenhuma chamada foi feita.");
  }

  const routing = await decideExpertRouting(supabase, input);

  const requestedExpertIds: OfficialExpertId[] = input.consultAllExperts
    ? [...CURATION_SPECIALIST_IDS]
    : [...routing.primaryExpertIds, ...routing.supportingExpertIds];
  const routedExpertIds = Array.from(new Set(requestedExpertIds)).filter(
    (expertId): expertId is SpecialistExpertId => expertId !== "ceo"
  );

  const scope: ExpertQueryScope = input.eventId ? "EVENT" : "PROJECT";
  const question = input.description;
  const includeContractualDocuments = input.includeContractualDocuments === true && scope === "PROJECT";

  const expertResults: ExpertCurationResult[] = [];
  const unavailableExperts: { expertId: OfficialExpertId; reason: string }[] = [];
  for (const expertId of routedExpertIds) {
    if (!CURATION_SPECIALIST_IDS.includes(expertId)) continue;

    const request: ExpertQueryRequest = {
      scope,
      projectId: input.projectId,
      eventId: input.eventId,
      question,
    };

    try {
      const result = await runSpecialist(supabase, expertId, request, gated(options, expertId), { includeContractualDocuments });
      expertResults.push({ expertId, response: result.response });
    } catch (error) {
      if (expertId === "planning-director" && error instanceof Error && PLANNING_BLOCKING_MESSAGES.includes(error.message)) {
        unavailableExperts.push({ expertId, reason: error.message });
        continue;
      }
      throw error;
    }
  }

  const positions = expertResults.map((result) => toPosition(result.expertId, result.response));
  // Incerteza preservada (frente N6): Expert roteado sem parecer (bloqueio determinístico) é informado ao CEO IA e
  // vira, de forma determinística, uma decisão humana — a consolidação nunca se apresenta como completa sem ele.
  const unavailableNotes = unavailableExperts.map(
    (item) => `Parecer de ${item.expertId} indisponível nesta rodada: ${item.reason}`
  );
  const situation = unavailableNotes.length
    ? `${input.description}\n\nEspecialistas roteados SEM parecer nesta rodada (não presumir posição deles):\n- ${unavailableNotes.join("\n- ")}`
    : input.description;
  const { curation: consolidated } = await runExecutiveCuration(situation, positions, gated(options, "ceo"));
  const curation = unavailableNotes.length
    ? {
        ...consolidated,
        decisoesHumanasNecessarias: [
          ...consolidated.decisoesHumanasNecessarias,
          ...unavailableNotes.filter((note) => !consolidated.decisoesHumanasNecessarias.includes(note)),
        ],
      }
    : consolidated;

  return {
    input,
    routing,
    expertResults,
    unavailableExperts,
    executiveCuration: curation,
    audit: {
      projectId: input.projectId,
      eventId: input.eventId ?? null,
      topic: routing.topic,
      consultedExpertIds: expertResults.map((r) => r.expertId),
      generatedAt: new Date().toISOString(),
    },
  };
}
