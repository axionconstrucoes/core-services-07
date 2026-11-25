"use server";

// Server Action da consulta ESTRATÉGICA do Diretor Comercial IA (CommercialStrategyBrief): diagnóstico da negociação,
// momento e forma de abordagem, cenários de concessão, roteiro e minuta — sempre com as decisões de aprovação humana.
// Sessão do usuário (RLS) para o contexto comercial × Orçamentos; limite de IA reservado ANTES do provedor
// (EXPERT_PANEL). Somente leitura: nada é gravado, nenhum desconto ou compromisso é autorizado.

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { precheckAiConsult, reserveAiConsult } from "./alert-consult/consult-quota";
import { gatedProviderForExpert } from "./governance/quota-gated-provider";
import { sessionAuditSink } from "./governance/consult-audit";
import { resolveExpertQueryErrorMessage } from "./expert-query-request";
import { COMMERCIAL_DIRECTOR_EXPERT_ID } from "./experts/commercial-director/identity";
import { answerCommercialStrategyQuery, type CommercialStrategyQueryResult } from "./experts/commercial-director/strategy-query";
import { COMMERCIAL_STRATEGY_MODES } from "./experts/commercial-director/strategy-schema";
import type { CommercialStrategyMode } from "./experts/commercial-director/strategy-types";
import { buildAiProviderUiMetadata, type AiProviderUiMetadata } from "./provider-ui-metadata";

export interface AskCommercialStrategyState {
  result: CommercialStrategyQueryResult | null;
  meta: AiProviderUiMetadata | null;
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTION_LENGTH = 4000;

export async function askCommercialStrategyAction(
  _prevState: AskCommercialStrategyState,
  formData: FormData
): Promise<AskCommercialStrategyState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "COMPLETO").trim();
  const proposalRaw = String(formData.get("proposalId") ?? "").trim();

  if (!UUID.test(projectId)) return { result: null, meta: null, error: "Obra não identificada." };
  if (!question) return { result: null, meta: null, error: "Descreva a negociação ou a pergunta." };
  if (question.length > MAX_QUESTION_LENGTH) return { result: null, meta: null, error: `A pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.` };
  if (!(COMMERCIAL_STRATEGY_MODES as readonly string[]).includes(modeRaw)) return { result: null, meta: null, error: "Modo de consulta inválido." };
  if (proposalRaw && !UUID.test(proposalRaw)) return { result: null, meta: null, error: "Proposta não identificada." };

  const permission = await getCurrentProjectPermission(projectId);
  if (permission === null) return { result: null, meta: null, error: "Você não possui acesso ativo a este projeto." };

  const supabase = await createSupabaseServerClient();
  // Limite de IA (EXPERT_PANEL): pré-verificação somente leitura; a unidade é reservada na FRONTEIRA DO PROVEDOR
  // (recusa determinística antes do provedor não consome). Falha fechada: sem reserva, o provedor não é chamado.
  const precheck = await precheckAiConsult(supabase, projectId);
  if (!precheck.ok) return { result: null, meta: null, error: precheck.error };
  const provider = gatedProviderForExpert(COMMERCIAL_DIRECTOR_EXPERT_ID, () =>
    reserveAiConsult(supabase, projectId, "EXPERT_PANEL", proposalRaw || projectId, COMMERCIAL_DIRECTOR_EXPERT_ID),
    undefined,
    sessionAuditSink(supabase, projectId, "EXPERT_PANEL", proposalRaw || projectId)
  );

  try {
    const result = await answerCommercialStrategyQuery(supabase, {
      projectId,
      question,
      mode: modeRaw as CommercialStrategyMode,
      proposalId: proposalRaw || null,
    }, provider);
    return { result, meta: buildAiProviderUiMetadata(result.audit.providerId, result.audit.model), error: null };
  } catch (error) {
    return { result: null, meta: null, error: resolveExpertQueryErrorMessage(error, "Falha ao consultar o Diretor Comercial IA.") };
  }
}
