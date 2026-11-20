// Despachante servidor: especialidade → Expert JÁ existente (provider, grounding e validação
// continuam os do Expert). Somente leitura; a chave do provider vive só no servidor.
// Assunto multidisciplinar não vai a um Expert único: vai à curadoria multi-Expert existente
// (runAlertConsultCuration — um parecer por Expert + consolidação do CEO IA).

import type { SupabaseClient } from "@supabase/supabase-js";

import { runMultiExpertCuration } from "../curation/run-multi-expert-curation";
import type { MultiExpertCuration } from "../curation/types";
import type { OfficialExpertId } from "../expert-definitions/types";
import { ExpertQuerySafeError } from "../expert-query-request";
import { answerCommercialDirectorQuery } from "../experts/commercial-director/query";
import { answerEngineeringDirectorQuery } from "../experts/engineering-director/query";
import { answerEsgDirectorQuery } from "../experts/esg-director/query";
import { answerLegalConsultantQuery } from "../experts/legal-consultant/query";
import { answerPlanningDirectorQuery } from "../experts/planning-director/query";
import { scheduleSourceBlockingMessage } from "../experts/planning-director/schedule-source-guard";
import type { AiProvider } from "../providers/types";
import type { ExpertQueryRequest, ExpertQueryResponse } from "../query/types";
import type { ExpertId } from "../types";
import type { AiConsultReservation } from "./consult-quota";

export interface AlertConsultExpertRun {
  response: ExpertQueryResponse;
  audit: { providerId: string; model: string | null };
}

// Mensagens de bloqueio do guard de prazo são redigidas para a tela — podem ser exibidas.
const PLANNING_BLOCKING_MESSAGES: readonly string[] = [
  scheduleSourceBlockingMessage("MISSING_MPP"),
  scheduleSourceBlockingMessage("MPP_PRESENT_NOT_EXTRACTED"),
];

/**
 * `provider` só é informado por testes (provedor simulado); em produção cada Expert resolve o seu
 * (resolveAiProviderForExpert) — nunca um fallback silencioso para "fake" por erro de configuração.
 */
export async function runAlertConsultExpert(
  supabase: SupabaseClient,
  expertId: ExpertId,
  request: ExpertQueryRequest,
  userQuestion: string,
  provider?: AiProvider
): Promise<AlertConsultExpertRun> {
  switch (expertId) {
    case "legal-consultant":
      return answerLegalConsultantQuery(supabase, request, provider);
    case "esg-director":
      return answerEsgDirectorQuery(supabase, request, provider);
    case "commercial-director":
      return answerCommercialDirectorQuery(supabase, request, provider);
    case "engineering-director":
      return answerEngineeringDirectorQuery(supabase, request, provider);
    case "planning-director":
      try {
        return await answerPlanningDirectorQuery(supabase, request, provider, { guardQuestion: userQuestion });
      } catch (error) {
        if (error instanceof Error && PLANNING_BLOCKING_MESSAGES.includes(error.message)) {
          throw new ExpertQuerySafeError(error.message);
        }
        throw error;
      }
    default:
      // "ceo" não é um especialista único desta caixa: o multidisciplinar vai à curadoria
      // (runAlertConsultCuration) — nunca um único Expert simulando várias áreas.
      throw new Error(`Especialista "${expertId}" não disponível para consulta de alertas.`);
  }
}

/**
 * Assunto multidisciplinar: curadoria multi-Expert existente (um parecer por Expert + consolidação
 * do CEO IA, com autoria, divergências e incertezas). `reserve` é obrigatório: 1 unidade do limite
 * de IA por Expert chamado, reservada antes de cada chamada (falha fechada).
 */
export async function runAlertConsultCuration(
  supabase: SupabaseClient,
  input: {
    request: ExpertQueryRequest;
    expertIds: OfficialExpertId[];
    reserve(expertId: OfficialExpertId): Promise<AiConsultReservation>;
    provider?: AiProvider;
  }
): Promise<MultiExpertCuration> {
  return runMultiExpertCuration(
    supabase,
    {
      projectId: input.request.projectId,
      sourceType: input.request.scope === "EVENT" ? "EVENT" : "PROJECT",
      eventId: input.request.eventId,
      description: input.request.question,
      requestedExpertIds: input.expertIds.length > 0 ? input.expertIds : undefined,
    },
    { reserve: input.reserve, provider: input.provider }
  );
}
