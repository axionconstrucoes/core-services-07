"use server";

// Server Action da consulta "Perguntar ao Diretor de Planejamento IA" (planning-director) — página
// experts-ia/diretor-planejamento. Limite de IA reservado ANTES do provedor (EXPERT_PANEL).
// As mensagens do guard de prazo (MPP ausente/não extraído) são redigidas para a tela e exibidas.

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { precheckAiConsult, reserveAiConsult } from "./alert-consult/consult-quota";
import { gatedProviderForExpert } from "./governance/quota-gated-provider";
import { sessionAuditSink } from "./governance/consult-audit";
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

  // Limite de IA (EXPERT_PANEL): pré-verificação somente leitura; a unidade é reservada na FRONTEIRA DO PROVEDOR,
  // depois dos guards determinísticos (recusa antes do provedor não consome). Sem reserva, o provedor não é chamado.
  const precheck = await precheckAiConsult(supabase, request.projectId);
  if (!precheck.ok) {
    return { response: null, error: precheck.error, meta: null };
  }

  try {
    const provider = gatedProviderForExpert(PLANNING_DIRECTOR_EXPERT_ID, (expertId) =>
      reserveAiConsult(supabase, request.projectId, "EXPERT_PANEL", request.eventId ?? request.projectId, expertId),
    undefined,
    sessionAuditSink(supabase, request.projectId, "EXPERT_PANEL", request.eventId ?? request.projectId)
    );
    const result = await answerPlanningDirectorQuery(supabase, request, provider);
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
