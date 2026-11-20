"use server";

// Server Action da consulta "Perguntar ao Diretor de Engenharia e Construção IA" (engineering-director).
// Até a separação dos Experts esta action chamava o planning-director; agora a página
// experts-ia/diretor-engenharia fala com o Expert de engenharia e o planejamento tem sua própria
// página/action (planning-query-action.ts). Limite de IA reservado ANTES do provedor (EXPERT_PANEL).

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { precheckAiConsult, reserveAiConsult } from "./alert-consult/consult-quota";
import { gatedProviderForExpert } from "./governance/quota-gated-provider";
import { sessionAuditSink } from "./governance/consult-audit";
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

  // Limite de IA (EXPERT_PANEL): pré-verificação somente leitura; a unidade é reservada na FRONTEIRA DO PROVEDOR,
  // depois dos guards determinísticos (recusa antes do provedor não consome). Sem reserva, o provedor não é chamado.
  const precheck = await precheckAiConsult(supabase, request.projectId);
  if (!precheck.ok) {
    return { response: null, error: precheck.error, meta: null };
  }

  try {
    const provider = gatedProviderForExpert(ENGINEERING_DIRECTOR_EXPERT_ID, (expertId) =>
      reserveAiConsult(supabase, request.projectId, "EXPERT_PANEL", request.eventId ?? request.projectId, expertId),
    undefined,
    sessionAuditSink(supabase, request.projectId, "EXPERT_PANEL", request.eventId ?? request.projectId)
    );
    const result = await answerEngineeringDirectorQuery(supabase, request, provider);
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
