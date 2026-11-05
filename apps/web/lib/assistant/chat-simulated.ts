// Simulador local da IA da conversa — DETERMINÍSTICO, sem rede e sem custo. Existe só para a prévia e para os testes
// (nunca é aceito na Vercel; ver chat-config.ts). Imita o CONTRATO do modelo real (um ChatPlan sobre os CANDIDATOS enviados):
// escolhe entre os candidatos pela pontuação local e devolve "unclear" quando nenhum cobre a pergunta.

import { normalizeText } from "./answer";
import { ASSISTANT_ENTRIES } from "./knowledge";
import { rank } from "./local-match";
import type { ChatPlan } from "./chat-conversation";
import type { ChatProvider } from "./chat-provider";

export function simulatePlan(question: string, candidateIds: readonly string[]): ChatPlan {
  const pool = ASSISTANT_ENTRIES.filter((entry) => candidateIds.includes(entry.id));
  const ranked = rank(normalizeText(question), pool).filter((r) => r.score >= 2);
  if (ranked.length === 0) return { intent: "unclear", entry_ids: [], clarifying_question: null };
  return { intent: "acc", entry_ids: ranked.slice(0, 2).map((r) => r.entry.id), clarifying_question: null };
}

export function createSimulatedChatProvider(): ChatProvider {
  return {
    id: "simulated",
    model: null,
    async plan(request) {
      return { raw: simulatePlan(request.question, request.candidateIds), usage: null };
    },
  };
}
