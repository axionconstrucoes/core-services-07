// Orquestra uma consulta conversacional ao Diretor Comercial IA
// ("Perguntar ao Diretor Comercial IA"). Reutiliza o context builder
// genérico (build-event-context.ts / build-project-context.ts) sem
// duplicação — nunca cria um segundo sistema de contexto paralelo.
//
// Escopos suportados nesta fase: PROJECT e EVENT. DOCUMENT, EMAIL e
// MULTI_EXPERT falham explicitamente (fail closed) — nunca simulados.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommercialContext } from "../../../commercial/load-commercial-context";
import type { CommercialContext } from "../../../commercial/types";
import { buildEventAnalysisContext } from "../../context/build-event-context";
import { buildProjectAnalysisContext } from "../../context/build-project-context";
import type { EventAnalysisContext, ProjectAnalysisContext } from "../../context/types";
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
import { deriveFakeQueryEnrichment } from "./fake-query-enrichment";
import {
  COMMERCIAL_DIRECTOR_EXPERT_ID,
  COMMERCIAL_DIRECTOR_INSTRUCTIONS,
  COMMERCIAL_DIRECTOR_NAME,
  COMMERCIAL_DIRECTOR_VERSION,
} from "./identity";

/**
 * Cópia do contexto com o bloco comercial anexado. O tipo compartilhado
 * (context/types.ts) não declara `commercialContext` — o campo extra é
 * serializado pelo provider junto do contexto autorizado.
 */
function withCommercialContext<T extends object>(context: T, commercialContext: CommercialContext): T {
  return { ...context, commercialContext } as T;
}

const IMPLEMENTED_SCOPES: ExpertQueryScope[] = ["PROJECT", "EVENT"];

export interface CommercialDirectorQueryResult {
  response: ExpertQueryResponse;
  audit: {
    expertId: typeof COMMERCIAL_DIRECTOR_EXPERT_ID;
    expertVersion: typeof COMMERCIAL_DIRECTOR_VERSION;
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
  };
}

/**
 * Responde uma pergunta do usuário ao Diretor Comercial IA. Somente
 * leitura: monta contexto (buildEventAnalysisContext ou
 * buildProjectAnalysisContext, ambos genéricos e reutilizados) e chama o
 * provider — nunca escreve, nunca envia nada.
 */
export interface CommercialDirectorQueryOptions {
  includeContractualDocuments?: boolean;
  /**
   * Anexa o contexto comercial × Orçamentos (apps/web/lib/commercial,
   * somente leitura, sessão/RLS do usuário) ao contexto enviado ao
   * provider. Padrão: true. Sem sessão de usuário (ex.: rotina com
   * service role) o carregador não lê nada e marca SEM_AUTORIZACAO.
   */
  includeCommercialContext?: boolean;
  /** Injeção para testes. */
  loadCommercialContext?: (supabase: SupabaseClient, input: { projectId: string }) => Promise<CommercialContext>;
}

export async function answerCommercialDirectorQuery(
  supabase: SupabaseClient,
  request: ExpertQueryRequest,
  provider: AiProvider = resolveAiProviderForExpert(COMMERCIAL_DIRECTOR_EXPERT_ID),
  options: CommercialDirectorQueryOptions = {}
): Promise<CommercialDirectorQueryResult> {
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

  // Contexto comercial × Orçamentos: anexado somente à cópia enviada ao
  // provider (os contextos originais continuam intactos para o
  // enriquecimento fake e o grounding). Nunca derruba a consulta.
  const commercialContext =
    options.includeCommercialContext === false
      ? null
      : await (options.loadCommercialContext ?? loadCommercialContext)(supabase, { projectId: request.projectId }).catch(
          () => null
        );

  const providerEventContext: EventAnalysisContext | null =
    eventContext && commercialContext ? withCommercialContext(eventContext, commercialContext) : eventContext;
  const providerProjectContext: ProjectAnalysisContext | null =
    projectContext && commercialContext ? withCommercialContext(projectContext, commercialContext) : projectContext;

  const response = await provider.answerQuery({
    expertId: COMMERCIAL_DIRECTOR_EXPERT_ID,
    expertName: COMMERCIAL_DIRECTOR_NAME,
    expertVersion: COMMERCIAL_DIRECTOR_VERSION,
    instructions: COMMERCIAL_DIRECTOR_INSTRUCTIONS,
    scope: request.scope,
    question,
    eventContext: providerEventContext,
    projectContext: providerProjectContext,
    outputSchema: EXPERT_QUERY_RESPONSE_JSON_SCHEMA,
  });

  const rawOutput =
    response.providerId === "fake" && typeof response.output === "object" && response.output !== null
      ? { ...(response.output as Record<string, unknown>), ...deriveFakeQueryEnrichment(question, eventContext) }
      : response.output;

  const validated = validateExpertQueryResponse(rawOutput, {
    expertId: COMMERCIAL_DIRECTOR_EXPERT_ID,
    expertName: COMMERCIAL_DIRECTOR_NAME,
    expertVersion: COMMERCIAL_DIRECTOR_VERSION,
    // Escopo confiável desta consulta (nunca lido da saída do provider).
    scope: request.scope,
  });

  // Guardrail de grounding: só roda para o provider real (Anthropic) —
  // ver commentário equivalente em ./index.ts e
  // docs/ai/grounding-and-citation-guardrails.md.
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
      expertId: COMMERCIAL_DIRECTOR_EXPERT_ID,
      expertVersion: COMMERCIAL_DIRECTOR_VERSION,
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
    },
  };
}
