"use server";

// Server Action da consulta "Perguntar ao Diretor de Planejamento IA" (planning-director) — página
// experts-ia/diretor-planejamento. Limite de IA reservado ANTES do provedor (EXPERT_PANEL).
// As mensagens do guard de prazo (MPP ausente/não extraído) são redigidas para a tela e exibidas.

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { reserveAiConsult } from "./alert-consult/consult-quota";
import { answerPlanningDirectorQuery } from "./experts/planning-director/query";
import { PLANNING_DIRECTOR_EXPERT_ID } from "./experts/planning-director/identity";
import { scheduleSourceBlockingMessage } from "./experts/planning-director/schedule-source-guard";
import { parseExpertQueryForm, resolveExpertQueryErrorMessage } from "./expert-query-request";
import type { AskCommercialDirectorState } from "./expert-query-state";
import { buildAiProviderUiMetadata } from "./provider-ui-metadata";

const PLANNING_BLOCKING_MESSAGES: readonly string[] = [
  scheduleSourceBlockingMessage("MISSING_MPP"),
  scheduleSourceBlockingMessage("MPP_PRESENT_NOT_EXTRACTED"),
];

export async function askPlanningDirectorAction(
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
    PLANNING_DIRECTOR_EXPERT_ID
  );
  if (!reservation.ok) {
    return { response: null, error: reservation.error, meta: null };
  }

  try {
    const result = await answerPlanningDirectorQuery(supabase, request);
    return {
      response: result.response,
      error: null,
      meta: buildAiProviderUiMetadata(result.audit.providerId, result.audit.model),
    };
  } catch (error) {
    const message =
      error instanceof Error && PLANNING_BLOCKING_MESSAGES.includes(error.message)
        ? error.message
        : resolveExpertQueryErrorMessage(error, "Falha ao consultar o Diretor de Planejamento IA.");
    return { response: null, error: message, meta: null };
  }
}
