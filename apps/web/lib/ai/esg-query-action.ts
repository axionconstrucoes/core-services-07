"use server";

// Server Action da consulta conversacional "Perguntar ao Diretor de ESG
// IA" — mesmo padrão de expert-query-action.ts (Diretor Comercial IA).
// Nenhuma lógica de negócio é duplicada aqui: answerEsgDirectorQuery já
// reutiliza os context builders genéricos e o provider abstrato.

import { createSupabaseServerClient } from "@axion/db/server";
import { precheckAiConsult, reserveAiConsult } from "./alert-consult/consult-quota";
import { gatedProviderForExpert } from "./governance/quota-gated-provider";
import { ESG_DIRECTOR_EXPERT_ID } from "./experts/esg-director/identity";
import { answerEsgDirectorQuery } from "./experts/esg-director/query";
import { parseExpertQueryForm, resolveExpertQueryErrorMessage } from "./expert-query-request";
import { buildAiProviderUiMetadata, type AiProviderUiMetadata } from "./provider-ui-metadata";
import type { ExpertQueryResponse } from "./query/types";

export type AskEsgDirectorState = {
  response: ExpertQueryResponse | null;
  error: string | null;
  /** Ver AskCommercialDirectorState.meta (expert-query-state.ts) — mesmo motivo para tolerar `undefined` no tipo. */
  meta: AiProviderUiMetadata | null | undefined;
};

export async function askEsgDirectorAction(
  _prevState: AskEsgDirectorState,
  formData: FormData
): Promise<AskEsgDirectorState> {
  const parsed = parseExpertQueryForm(formData);

  if (!parsed.ok) {
    return { response: null, error: parsed.error, meta: null };
  }

  const supabase = await createSupabaseServerClient();

  // Limite de IA (EXPERT_PANEL): pré-verificação somente leitura e reserva na FRONTEIRA DO PROVEDOR.
  const precheck = await precheckAiConsult(supabase, parsed.request.projectId);
  if (!precheck.ok) {
    return { response: null, error: precheck.error, meta: null };
  }

  try {
    const provider = gatedProviderForExpert(ESG_DIRECTOR_EXPERT_ID, (expertId) =>
      reserveAiConsult(supabase, parsed.request.projectId, "EXPERT_PANEL", parsed.request.eventId ?? parsed.request.projectId, expertId)
    );
    const result = await answerEsgDirectorQuery(supabase, parsed.request, provider);

    return {
      response: result.response,
      error: null,
      meta: buildAiProviderUiMetadata(result.audit.providerId, result.audit.model),
    };
  } catch (error) {
    return {
      response: null,
      error: resolveExpertQueryErrorMessage(error, "Falha ao consultar o Diretor de ESG IA."),
      meta: null,
    };
  }
}
