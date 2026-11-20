"use server";

// Server Action da consulta "Perguntar ao Diretor de Engenharia e Construção IA" (engineering-director).
// Até a separação dos Experts esta action chamava o planning-director; agora a página
// experts-ia/diretor-engenharia fala com o Expert de engenharia e o planejamento tem sua própria
// página/action (planning-query-action.ts). Limite de IA reservado ANTES do provedor (EXPERT_PANEL).

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { reserveAiConsult } from "./alert-consult/consult-quota";
import { answerEngineeringDirectorQuery } from "./experts/engineering-director/query";
import { ENGINEERING_DIRECTOR_EXPERT_ID } from "./experts/engineering-director/identity";
import { parseExpertQueryForm, resolveExpertQueryErrorMessage } from "./expert-query-request";
import type { AskCommercialDirectorState } from "./expert-query-state";
import { buildAiProviderUiMetadata } from "./provider-ui-metadata";

export async function askEngineeringDirectorAction(
  _prevState: AskCommercialDirectorState,
  formData: FormData
): Promise<AskCommercialDirectorState> {
  const parsed = parseExpertQueryForm(formData);
  if (!parsed.ok) {
    return { response: null, error: parsed.error, meta: null };
  }
  const { request } = parsed;

  const permission = await getCurrentProjectPermission(request.projectId);
  if (permission === null) {
    return { response: null, error: "Você não possui acesso ativo a este projeto.", meta: null };
  }

  const supabase = await createSupabaseServerClient();

  // Falha fechada: sem reserva confirmada, o provedor não é chamado.
  const reservation = await reserveAiConsult(
    supabase,
    request.projectId,
    "EXPERT_PANEL",
    request.eventId ?? request.projectId,
    ENGINEERING_DIRECTOR_EXPERT_ID
  );
  if (!reservation.ok) {
    return { response: null, error: reservation.error, meta: null };
  }

  try {
    const result = await answerEngineeringDirectorQuery(supabase, request);
    return {
      response: result.response,
      error: null,
      meta: buildAiProviderUiMetadata(result.audit.providerId, result.audit.model),
    };
  } catch (error) {
    return {
      response: null,
      error: resolveExpertQueryErrorMessage(error, "Falha ao consultar o Diretor de Engenharia e Construção IA."),
      meta: null,
    };
  }
}
