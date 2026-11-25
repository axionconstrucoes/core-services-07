// Consulta estratégica ao Diretor Comercial IA (CommercialStrategyBrief):
// diagnóstico da negociação, momento/forma de abordagem, cenários de
// concessão, impactos, objeções, roteiro, minuta, condições de fechamento
// e decisões que exigem aprovação humana — sempre integrada ao contexto
// comercial × Orçamentos carregado (apps/web/lib/commercial).
//
// Somente leitura: monta contexto (projeto + comercial, ambos com a
// sessão do usuário/RLS), chama o provider e valida a resposta com a
// governança comercial. Nunca escreve, nunca envia nada, nunca conecta a
// sistema externo de orçamentos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommercialContext } from "../../../commercial/load-commercial-context";
import type { CommercialContext } from "../../../commercial/types";
import { buildProjectAnalysisContext } from "../../context/build-project-context";
import type { ProjectAnalysisContext } from "../../context/types";
import {
  applySafeGroundingCorrection,
  buildGroundingSource,
  validateDraftGrounding,
} from "../../grounding/index";
import { resolveAiProviderForExpert } from "../../providers/resolve-provider-for-expert";
import type { AiProvider } from "../../providers/types";
import { deriveFakeCommercialStrategyBrief } from "./fake-strategy-brief";
import {
  buildCommercialStrategyInstructions,
  COMMERCIAL_DIRECTOR_EXPERT_ID,
  COMMERCIAL_DIRECTOR_NAME,
  COMMERCIAL_DIRECTOR_VERSION,
} from "./identity";
import { COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA } from "./strategy-json-schema";
import { COMMERCIAL_STRATEGY_MODES, validateCommercialStrategyBrief } from "./strategy-schema";
import type { CommercialStrategyBrief, CommercialStrategyMode } from "./strategy-types";

export interface CommercialStrategyRequest {
  projectId: string;
  question: string;
  mode?: CommercialStrategyMode;
  /** Proposta adicional em foco (opcional). */
  proposalId?: string | null;
}

export interface CommercialStrategyQueryOptions {
  includeContractualDocuments?: boolean;
  /** Injeção para testes — por padrão, loadCommercialContext com a sessão. */
  loadCommercialContext?: (supabase: SupabaseClient, input: { projectId: string; proposalId: string | null }) => Promise<CommercialContext>;
  /** Injeção para testes — por padrão, buildProjectAnalysisContext (genérico, reutilizado). */
  loadProjectContext?: (supabase: SupabaseClient, input: { projectId: string; includeContractualDocuments: boolean }) => Promise<ProjectAnalysisContext>;
}

export interface CommercialStrategyQueryResult {
  brief: CommercialStrategyBrief;
  commercialContext: CommercialContext;
  audit: {
    expertId: typeof COMMERCIAL_DIRECTOR_EXPERT_ID;
    expertVersion: typeof COMMERCIAL_DIRECTOR_VERSION;
    providerId: string;
    model: string | null;
    mode: CommercialStrategyMode;
    projectId: string;
    proposalId: string | null;
    question: string;
    generatedAt: string;
    stopReason: string | null;
    usage: { inputTokens: number | null; outputTokens: number | null } | null;
    /** Contagens por situação dos itens comerciais carregados — nunca os valores. */
    commercialContextSummary: Record<string, number>;
    draftSuppressedByGrounding: boolean;
  };
}

function summarize(context: CommercialContext): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const item of context.items) summary[item.availability] = (summary[item.availability] ?? 0) + 1;
  return summary;
}

export async function answerCommercialStrategyQuery(
  supabase: SupabaseClient,
  request: CommercialStrategyRequest,
  provider: AiProvider = resolveAiProviderForExpert(COMMERCIAL_DIRECTOR_EXPERT_ID),
  options: CommercialStrategyQueryOptions = {}
): Promise<CommercialStrategyQueryResult> {
  const question = request.question.trim();
  if (!question) throw new Error("Pergunta vazia.");
  const mode = request.mode ?? "COMPLETO";
  if (!COMMERCIAL_STRATEGY_MODES.includes(mode)) {
    throw new Error(`Modo de consulta estratégica desconhecido: ${String(mode)}`);
  }
  const proposalId = request.proposalId ?? null;
  const includeContractualDocuments = options.includeContractualDocuments === true;

  const commercialContext = await (options.loadCommercialContext ?? loadCommercialContext)(supabase, {
    projectId: request.projectId,
    proposalId,
  });
  const projectContext = await (options.loadProjectContext ??
    ((client, input) => buildProjectAnalysisContext(client, input)))(supabase, {
    projectId: request.projectId,
    includeContractualDocuments,
  });

  // O bloco comercial segue junto do contexto autorizado do projeto (a
  // única fonte de fatos que o provider serializa ao modelo).
  const projectContextWithCommercial: ProjectAnalysisContext & { commercialContext: CommercialContext } = {
    ...projectContext,
    commercialContext,
  };

  const response = await provider.answerQuery({
    expertId: COMMERCIAL_DIRECTOR_EXPERT_ID,
    expertName: COMMERCIAL_DIRECTOR_NAME,
    expertVersion: COMMERCIAL_DIRECTOR_VERSION,
    instructions: buildCommercialStrategyInstructions(mode),
    scope: "PROJECT",
    question,
    eventContext: null,
    projectContext: projectContextWithCommercial,
    outputSchema: COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA,
  });

  const rawOutput =
    response.providerId === "fake" ? deriveFakeCommercialStrategyBrief(question, mode, commercialContext) : response.output;

  let brief = validateCommercialStrategyBrief(rawOutput, { commercialContext });

  // Guardrail de grounding da minuta — mesmo critério de ./query.ts: só
  // para o provider real; os itens comerciais carregados contam como
  // fonte documentada.
  let draftSuppressedByGrounding = false;
  if (response.providerId === "anthropic" && brief.minuta) {
    const source = buildGroundingSource({
      projectContext,
      documentedFacts: [
        ...commercialContext.items.map((item) => `${item.label}: ${String(item.value ?? "")}`),
        ...brief.estrategiaRecomendada.filter((s) => s.tipo === "FATO").map((s) => s.texto),
      ],
    });
    const result = validateDraftGrounding(brief.minuta.body, source);
    if (!result.valid) {
      const correction = applySafeGroundingCorrection(brief.minuta.body, result);
      if (correction.stillRequiresRejection) {
        draftSuppressedByGrounding = true;
        brief = {
          ...brief,
          minuta: null,
          informacoesFaltantes: [
            ...brief.informacoesFaltantes,
            "Minuta removida pelo guardrail de grounding: continha afirmação sem suporte no contexto fornecido.",
          ],
        };
      } else {
        brief = { ...brief, minuta: { ...brief.minuta, body: correction.correctedBody } };
      }
    }
  }

  return {
    brief,
    commercialContext,
    audit: {
      expertId: COMMERCIAL_DIRECTOR_EXPERT_ID,
      expertVersion: COMMERCIAL_DIRECTOR_VERSION,
      providerId: response.providerId,
      model: response.model,
      mode,
      projectId: request.projectId,
      proposalId,
      question,
      generatedAt: new Date().toISOString(),
      stopReason: response.stopReason ?? null,
      usage: response.usage ?? null,
      commercialContextSummary: summarize(commercialContext),
      draftSuppressedByGrounding,
    },
  };
}
