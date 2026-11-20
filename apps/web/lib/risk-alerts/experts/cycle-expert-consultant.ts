// ESPECIALISTA do caso de risco respondido pelo ciclo do worker (sem sessão de usuário; cliente
// admin/service_role). Extraído de run-risk-alert-cycle.ts para concentrar aqui o mapa de Experts,
// a curadoria multidisciplinar e o limite de IA — o ciclo só chama `answer`.
//
// Garantias:
//   - Expert único → o answerXQuery do próprio Expert (planejamento ≠ engenharia; nunca o inverso);
//   - "ceo" (dois ou mais temas) → curadoria multi-Expert existente: um parecer por Expert, com
//     autoria, e consolidação do CEO IA com divergências e incertezas — nunca o CEO sozinho
//     simulando as várias áreas;
//   - limite de IA: ai_consult_reserve_for_actor (service_role) com o USUÁRIO que fez a pergunta,
//     1 unidade por Expert chamado, reservada na FRONTEIRA DO PROVEDOR (frente N6): depois dos guards
//     determinísticos do Expert (ex.: MPP ausente) e imediatamente antes da chamada — um guard que
//     recusa não consome unidade, mesmo com o ciclo tentando de novo a cada execução; sem usuário ou
//     sem reserva, nenhuma chamada (falha fechada — o ciclo audita a falha e tenta de novo depois);
//   - somente recomenda: não altera estado do caso, responsável, SLA nem escalonamento (quem grava a
//     resposta é o ciclo, via store.recordExpertAnswer, com requiresHumanReview = true).
// A AXIA nunca participa.

import type { SupabaseClient } from "@supabase/supabase-js";

import { reserveAiConsultForActor, type AiConsultReservation } from "@/lib/ai/alert-consult/consult-quota";
import { runMultiExpertCuration } from "@/lib/ai/curation/run-multi-expert-curation";
import type { MultiExpertCuration } from "@/lib/ai/curation/types";
import type { OfficialExpertId } from "@/lib/ai/expert-definitions/types";
import { answerCommercialDirectorQuery } from "@/lib/ai/experts/commercial-director/query";
import { answerEngineeringDirectorQuery } from "@/lib/ai/experts/engineering-director/query";
import { answerEsgDirectorQuery } from "@/lib/ai/experts/esg-director/query";
import { answerLegalConsultantQuery } from "@/lib/ai/experts/legal-consultant/query";
import { answerPlanningDirectorQuery } from "@/lib/ai/experts/planning-director/query";
import { gatedProviderForExpert } from "@/lib/ai/governance/quota-gated-provider";
import type { AiProvider } from "@/lib/ai/providers/types";
import type { ExpertQueryRequest, ExpertQueryResponse } from "@/lib/ai/query/types";
import { detectTopicExperts } from "@/lib/ai/routing/expert-topics";

import type { ExpertId } from "../types";

export interface CycleExpertQuestion {
  expertId: ExpertId;
  projectId: string;
  question: string;
  /** Usuário que fez a pergunta (evento do caso). Sem ele não há reserva — nem chamada. */
  askedByUserId: string | null;
  /** Assunto auditado no registro de consumo (ex.: caso de risco). */
  subjectId: string;
}

export interface CycleExpertAnswer {
  answerText: string;
  confidence: number;
  requiresHumanReview: true;
}

type SingleExpertId = Exclude<ExpertId, "ceo">;
type SingleExpertFn = (supabase: SupabaseClient, request: ExpertQueryRequest, provider?: AiProvider) => Promise<{ response: ExpertQueryResponse }>;

/** Mapa ESPECIALISTA → Expert único do ciclo (o "ceo" vai à curadoria). */
export const CYCLE_SINGLE_EXPERT_QUERIES: Record<SingleExpertId, SingleExpertFn> = {
  "planning-director": answerPlanningDirectorQuery,
  "engineering-director": answerEngineeringDirectorQuery,
  // O ciclo roda sem sessão de usuário: o contexto comercial (RLS da sessão) não seria lido — não carregar.
  "commercial-director": (supabase, request, provider) => answerCommercialDirectorQuery(supabase, request, provider, { includeCommercialContext: false }),
  "esg-director": answerEsgDirectorQuery,
  "legal-consultant": answerLegalConsultantQuery,
};

export interface CycleExpertConsultantDeps {
  /** Reserva (service_role) de 1 unidade para o usuário solicitante/obra/Expert. */
  reserve(input: { actorUserId: string | null; projectId: string; subjectId: string; expertId: OfficialExpertId }): Promise<AiConsultReservation>;
  /** Somente testes: provider simulado. Em produção cada Expert resolve o seu. */
  provider?: AiProvider;
  /** Somente testes: substitui a curadoria. */
  runCuration?: typeof runMultiExpertCuration;
}

function formatSingleAnswer(r: ExpertQueryResponse): string {
  return [
    r.interpretacao,
    r.riscos.length ? `Riscos: ${r.riscos.join("; ")}` : null,
    r.recomendacoes.length ? `Recomendações: ${r.recomendacoes.join("; ")}` : null,
    r.fatosDocumentados.length ? `Evidências: ${r.fatosDocumentados.slice(0, 5).join("; ")}` : null,
    r.informacoesFaltantes.length ? `Informações faltantes: ${r.informacoesFaltantes.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Texto da curadoria: autoria de cada parecer, consolidação, divergências e incertezas. */
export function formatCurationAnswer(curation: MultiExpertCuration): string {
  const pareceres = curation.expertResults.map(({ response }) =>
    [`PARECER — ${response.expertName}`, formatSingleAnswer(response)].join("\n")
  );
  const c = curation.executiveCuration;
  const divergencias = c.divergencias.length
    ? c.divergencias
        .map((d) => `${d.topic}: ${d.positions.map((p) => `${p.expertName} — ${p.position}`).join(" × ")} (${d.probableReason})`)
        .join("; ")
    : "nenhuma registrada";
  const consolidacao = [
    "CONSOLIDAÇÃO — CEO IA",
    c.situacao,
    `Divergências: ${divergencias}`,
    c.riscos.length ? `Riscos: ${c.riscos.join("; ")}` : null,
    `Recomendação (sujeita a revisão humana): ${c.recomendacao}`,
    c.decisoesHumanasNecessarias.length ? `Incertezas e decisões humanas necessárias: ${c.decisoesHumanasNecessarias.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const indisponiveis = (curation.unavailableExperts ?? []).map((item) => `SEM PARECER — ${item.expertId}: ${item.reason}`);
  return [...pareceres, ...indisponiveis, consolidacao].join("\n\n");
}

export function createCycleExpertConsultant(supabase: SupabaseClient, deps: CycleExpertConsultantDeps) {
  const reserveFor = (q: CycleExpertQuestion) => async (expertId: OfficialExpertId): Promise<AiConsultReservation> => {
    const reservation = await deps.reserve({ actorUserId: q.askedByUserId, projectId: q.projectId, subjectId: q.subjectId, expertId });
    return reservation.ok ? reservation : { ok: false, error: `Limite de IA não reservado (${expertId}): ${reservation.error}` };
  };

  return {
    async answer(q: CycleExpertQuestion): Promise<CycleExpertAnswer> {
      const request: ExpertQueryRequest = { scope: "PROJECT", projectId: q.projectId, question: q.question };

      if (q.expertId === "ceo") {
        const topics = detectTopicExperts(q.question);
        const curation = await (deps.runCuration ?? runMultiExpertCuration)(
          supabase,
          {
            projectId: q.projectId,
            sourceType: "PROJECT",
            description: q.question,
            requestedExpertIds: topics.length > 1 ? topics : undefined,
          },
          { reserve: reserveFor(q), provider: deps.provider }
        );
        const confidences = curation.expertResults.map((item) => item.response.confidence);
        return {
          answerText: formatCurationAnswer(curation),
          // Conservador: a confiança consolidada nunca supera a do parecer menos confiante.
          confidence: confidences.length ? Math.min(...confidences) : 0,
          requiresHumanReview: true,
        };
      }

      const fn = CYCLE_SINGLE_EXPERT_QUERIES[q.expertId];
      if (!fn) throw new Error(`Expert "${q.expertId}" não disponível no ciclo.`);
      // Reserva na fronteira do provedor do Expert (depois dos guards dele).
      const result = await fn(supabase, request, gatedProviderForExpert(q.expertId, reserveFor(q), deps.provider));
      return { answerText: formatSingleAnswer(result.response), confidence: result.response.confidence, requiresHumanReview: true };
    },
  };
}

/** Variante de produção: reserva service_role (ai_consult_reserve_for_actor) com o cliente admin do ciclo. */
export function createDefaultCycleExpertConsultant(adminClient: SupabaseClient) {
  return createCycleExpertConsultant(adminClient, {
    reserve: ({ actorUserId, projectId, subjectId, expertId }) =>
      reserveAiConsultForActor(adminClient, actorUserId, projectId, "RISK_CYCLE", subjectId, expertId),
  });
}
