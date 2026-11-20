// Orquestra uma consulta conversacional ao Analista IA de Qualidade.
// Reutiliza o context builder genérico sem duplicação — nunca cria um
// segundo sistema de contexto paralelo. Mesmo padrão de
// experts/engineering-director/query.ts.
//
// Escopos suportados nesta fase: PROJECT e EVENT. DOCUMENT, EMAIL e
// MULTI_EXPERT falham explicitamente (fail closed) — nunca simulados.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEventAnalysisContext } from "../../context/build-event-context";
import { buildProjectAnalysisContext } from "../../context/build-project-context";
import { buildQualityAnalystSourcesContext, renderAdditionalSources } from "../../context/build-quality-sources-context";
import {
  adjustConfidenceForGrounding,
  applySafeGroundingCorrection,
  buildGroundingSource,
  buildResponseGroundingSummary,
  NOT_PERFORMED_GROUNDING_SUMMARY,
  validateDraftGrounding,
} from "../../grounding/index";
import { resolveAiProviderForExpert } from "../../providers/resolve-provider-for-expert";
import type { AiProvider } from "../../providers/types";
import { EXPERT_QUERY_RESPONSE_JSON_SCHEMA } from "../../query/json-schema";
import { validateExpertQueryResponse } from "../../query/validate-expert-query-response";
import type { ExpertQueryRequest, ExpertQueryResponse, ExpertQueryScope } from "../../query/types";
import {
  QUALITY_ANALYST_EXPERT_ID,
  QUALITY_ANALYST_INSTRUCTIONS,
  QUALITY_ANALYST_NAME,
  QUALITY_ANALYST_VERSION,
} from "./identity";

const IMPLEMENTED_SCOPES: ExpertQueryScope[] = ["PROJECT", "EVENT"];

export interface QualityAnalystQueryResult {
  response: ExpertQueryResponse;
  audit: {
    expertId: typeof QUALITY_ANALYST_EXPERT_ID;
    expertVersion: typeof QUALITY_ANALYST_VERSION;
    providerId: string;
    model: string | null;
    scope: ExpertQueryScope;
    projectId: string;
    eventId: string | null;
    question: string;
    generatedAt: string;
    stopReason: string | null;
    usage: { inputTokens: number | null; outputTokens: number | null } | null;
    /** Metadata do guardrail de grounding — somente contagens, nunca o texto completo das afirmações. */
    grounding: {
      performed: boolean;
      valid: boolean;
      supportedClaimCount: number;
      inferredClaimCount: number;
      unsupportedClaimCount: number;
      humanInputRequiredClaimCount: number;
    };
    /** Fontes adicionais lidas (somente metadados; o texto vai ao prompt já embrulhado como DADO externo). */
    additionalSources: Array<{ sourceId: string; status: "AVAILABLE" | "UNAVAILABLE"; rowCount: number; injectionSignals: string[] }>;
  };
}

export interface QualityAnalystQueryOptions {
  includeContractualDocuments?: boolean;
}

/**
 * Responde uma pergunta do usuário ao Analista IA de Qualidade.
 * Somente leitura: monta contexto (buildEventAnalysisContext ou
 * buildProjectAnalysisContext, ambos genéricos e reutilizados) e chama o
 * provider — nunca escreve, nunca envia nada, nunca altera projeto,
 * cronograma, alerta, SLA ou escalonamento.
 */
export async function answerQualityAnalystQuery(
  supabase: SupabaseClient,
  request: ExpertQueryRequest,
  provider: AiProvider = resolveAiProviderForExpert(QUALITY_ANALYST_EXPERT_ID),
  options: QualityAnalystQueryOptions = {}
): Promise<QualityAnalystQueryResult> {
  if (!IMPLEMENTED_SCOPES.includes(request.scope)) {
    throw new Error(
      `Escopo de consulta "${request.scope}" ainda não implementado nesta fase (somente PROJECT e EVENT). ` +
        "Nunca simular suporte a um escopo inexistente."
    );
  }

  const question = request.question.trim();
  if (!question) {
    throw new Error("Pergunta vazia.");
  }

  const eventContext =
    request.scope === "EVENT"
      ? await (async () => {
          if (!request.eventId) {
            throw new Error("eventId é obrigatório para consulta de escopo EVENT.");
          }
          return buildEventAnalysisContext(supabase, { projectId: request.projectId, eventId: request.eventId });
        })()
      : null;

  const projectContext =
    request.scope === "PROJECT"
      ? await buildProjectAnalysisContext(supabase, {
          projectId: request.projectId,
          includeContractualDocuments: options.includeContractualDocuments === true,
        })
      : null;

  // Fontes quality_*: conteúdo externo embrulhado como DADO (apenas no contexto deste especialista).
  const additionalSources = await buildQualityAnalystSourcesContext(supabase, request.projectId);

  const response = await provider.answerQuery({
    expertId: QUALITY_ANALYST_EXPERT_ID,
    expertName: QUALITY_ANALYST_NAME,
    expertVersion: QUALITY_ANALYST_VERSION,
    instructions: QUALITY_ANALYST_INSTRUCTIONS,
    scope: request.scope,
    question,
    eventContext,
    projectContext,
    additionalContext: renderAdditionalSources(additionalSources),
    outputSchema: EXPERT_QUERY_RESPONSE_JSON_SCHEMA,
  });

  const validated = validateExpertQueryResponse(response.output, {
    expertId: QUALITY_ANALYST_EXPERT_ID,
    expertName: QUALITY_ANALYST_NAME,
    expertVersion: QUALITY_ANALYST_VERSION,
    // Escopo confiável desta consulta (nunca lido da saída do provider).
    scope: request.scope,
  });

  // Guardrail de grounding: só roda para o provider real (Anthropic) —
  // mesmo critério de experts/planning-director/query.ts.
  let finalResponse = validated;
  let groundingAudit = { performed: false, valid: true, supportedClaimCount: 0, inferredClaimCount: 0, unsupportedClaimCount: 0, humanInputRequiredClaimCount: 0 };

  if (response.providerId === "anthropic" && validated.rascunhoSugerido) {
    const draft = validated.rascunhoSugerido;
    const source = buildGroundingSource({
      eventContext,
      projectContext,
      documentedFacts: validated.fatosDocumentados,
      contractualBasis: validated.baseContratual,
      legalCitations: validated.baseLegal,
    });
    const result = validateDraftGrounding(draft.body, source);

    let correctedDraft = draft;
    let draftSuppressed = false;
    let correctionApplied = false;

    if (!result.valid) {
      const correction = applySafeGroundingCorrection(draft.body, result);
      if (correction.stillRequiresRejection) {
        draftSuppressed = true;
      } else {
        correctedDraft = { ...draft, body: correction.correctedBody };
        correctionApplied = true;
      }
    }

    finalResponse = {
      ...validated,
      confidence: adjustConfidenceForGrounding(validated.confidence, result, { draftSuppressed, correctionApplied }),
      rascunhoSugerido: draftSuppressed ? null : correctedDraft,
      informacoesFaltantes: draftSuppressed
        ? [
            ...validated.informacoesFaltantes,
            "Rascunho de comunicação removido pelo guardrail de grounding: continha afirmação sem suporte no contexto fornecido.",
          ]
        : validated.informacoesFaltantes,
      grounding: buildResponseGroundingSummary(result, { correctionApplied, draftSuppressed }),
    };

    groundingAudit = {
      performed: true,
      valid: result.valid,
      supportedClaimCount: result.supportedClaims.length,
      inferredClaimCount: result.inferredClaims.length,
      unsupportedClaimCount: result.unsupportedClaims.length,
      humanInputRequiredClaimCount: result.humanInputRequiredClaims.length,
    };
  } else {
    finalResponse = { ...validated, grounding: NOT_PERFORMED_GROUNDING_SUMMARY };
  }

  return {
    response: finalResponse,
    audit: {
      expertId: QUALITY_ANALYST_EXPERT_ID,
      expertVersion: QUALITY_ANALYST_VERSION,
      providerId: response.providerId,
      model: response.model,
      scope: request.scope,
      projectId: request.projectId,
      eventId: request.eventId ?? null,
      question,
      generatedAt: new Date().toISOString(),
      stopReason: response.stopReason ?? null,
      usage: response.usage ?? null,
      grounding: groundingAudit,
      additionalSources: additionalSources.map((s) => ({ sourceId: s.sourceId, status: s.status, rowCount: s.rowCount, injectionSignals: s.signals.map((x) => x.id) })),
    },
  };
}
