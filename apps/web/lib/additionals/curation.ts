// Curadoria multiagente para propostas/adicionais (seção "CURADORIA" do
// requisito): Diretor Comercial IA + Diretor de Planejamento IA +
// Consultor Jurídico IA — sempre estes três (nunca ESG, fora do escopo
// de adicionais) — consolidados pelo CEO IA. Reutiliza inteiramente a
// mesma fundação de apps/web/lib/ai/ (query framework + provider +
// grounding) — nunca uma segunda arquitetura de IA. Distinto do roteador
// por palavra-chave de apps/web/lib/ai/curation/ (que serve o Event
// Ledger em geral): aqui os três especialistas SEMPRE são consultados,
// porque o requisito já define explicitamente o remit de cada um para
// este tema, sem precisar de classificação.
//
// Limite de IA (frente N6): 1 unidade por Expert chamado (os três
// especialistas e a consolidação do CEO IA), reservada na FRONTEIRA DO
// PROVEDOR de cada um (lib/ai/governance/quota-gated-provider.ts). Antes
// desta frente esta curadoria chamava os Experts SEM reserva. Os
// especialistas rodam em sequência (Planejamento primeiro, porque é o único
// com guard determinístico — MPP — que pode recusar sem consumir), e uma
// recusa interrompe a rodada: nenhum Expert seguinte e nenhuma
// consolidação parcial.

import type { SupabaseClient } from "@supabase/supabase-js";
import { answerCommercialDirectorQuery } from "../ai/experts/commercial-director/query";
import { runExecutiveCuration } from "../ai/experts/ceo/consolidate";
import type { ExecutiveCuration } from "../ai/experts/ceo/types";
import { answerLegalConsultantQuery } from "../ai/experts/legal-consultant/query";
import { answerPlanningDirectorQuery } from "../ai/experts/planning-director/query";
import type { AiConsultReservation } from "../ai/alert-consult/consult-quota";
import type { OfficialExpertId } from "../ai/expert-definitions/types";
import { gatedProviderForExpert } from "../ai/governance/quota-gated-provider";
import type { AiProvider, AiProviderExpertPosition } from "../ai/providers/types";
import type { ExpertQueryResponse } from "../ai/query/types";
import type { AdditionalProposal } from "./types";

export interface AdditionalProposalCurationResult {
  proposal: Pick<AdditionalProposal, "id" | "proposalNumber" | "title">;
  expertResults: { expertId: OfficialExpertId; response: ExpertQueryResponse }[];
  executiveCuration: ExecutiveCuration;
}

export interface AdditionalProposalCurationOptions {
  /** OBRIGATÓRIO: reserva 1 unidade do limite de IA para o Expert (sessão do usuário: tipo CURATION). */
  reserve(expertId: OfficialExpertId): Promise<AiConsultReservation>;
  /** Somente testes: provider simulado para todos os Experts. Em produção cada Expert resolve o seu. */
  provider?: AiProvider;
}

function buildSituationSummary(proposal: AdditionalProposal): string {
  return (
    `Proposta de adicional ${proposal.proposalNumber} — "${proposal.title}" (status: ${proposal.status}). ` +
    `${proposal.description || "Sem descrição adicional."}`
  );
}

function toPosition(expertId: OfficialExpertId, response: ExpertQueryResponse): AiProviderExpertPosition {
  return {
    expertId,
    expertName: response.expertName,
    severity: response.severity,
    interpretacao: response.interpretacao,
    riscos: response.riscos,
    recomendacoes: response.recomendacoes,
    informacoesFaltantes: response.informacoesFaltantes,
  };
}

/**
 * Executa a curadoria de uma proposta de adicional: Comercial (valor,
 * condição comercial, exposição financeira) + Planejamento (impacto de
 * cronograma, folga, extensão) + Jurídico (escopo base x adicional,
 * formalização, ressalvas) — sempre os três, uma vez cada — e consolida
 * via CEO IA. Somente leitura: nenhuma escrita em
 * project_additional_proposals nem em nenhuma outra tabela.
 */
export async function runAdditionalProposalCuration(
  supabase: SupabaseClient,
  proposal: AdditionalProposal,
  options: AdditionalProposalCurationOptions
): Promise<AdditionalProposalCurationResult> {
  if (typeof options?.reserve !== "function") {
    // Falha fechada: sem mecanismo de reserva, nenhuma chamada de IA.
    throw new Error("Curadoria de adicional sem reserva do limite de IA — nenhuma chamada foi feita.");
  }
  const gated = (expertId: OfficialExpertId) => gatedProviderForExpert(expertId, options.reserve, options.provider);
  const question = buildSituationSummary(proposal);
  const request = { scope: "PROJECT" as const, projectId: proposal.projectId, question };

  // Sequencial (antes era Promise.all): uma recusa do limite no meio nunca deixa outro Expert já em voo.
  const planning = await answerPlanningDirectorQuery(supabase, request, gated("planning-director"));
  const commercial = await answerCommercialDirectorQuery(supabase, request, gated("commercial-director"));
  const legal = await answerLegalConsultantQuery(supabase, request, gated("legal-consultant"));

  const expertResults: { expertId: OfficialExpertId; response: ExpertQueryResponse }[] = [
    { expertId: "commercial-director", response: commercial.response },
    { expertId: "planning-director", response: planning.response },
    { expertId: "legal-consultant", response: legal.response },
  ];

  const positions = expertResults.map((r) => toPosition(r.expertId, r.response));
  const { curation } = await runExecutiveCuration(question, positions, gated("ceo"));

  return {
    proposal: { id: proposal.id, proposalNumber: proposal.proposalNumber, title: proposal.title },
    expertResults,
    executiveCuration: curation,
  };
}
