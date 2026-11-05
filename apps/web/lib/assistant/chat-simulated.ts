// Simulador local da IA da conversa — DETERMINÍSTICO, sem rede e sem custo. Existe só para a prévia e para os testes
// (nunca é aceito na Vercel; ver chat-config.ts). Imita o CONTRATO do modelo real (um ChatPlan), incluindo tolerância a
// erros de digitação e perguntas compostas, para exercitar o servidor e os validadores sem chamar nenhum provedor.

import { answerQuestion, normalizeText } from "./answer";
import { ASSISTANT_ENTRIES } from "./knowledge";
import { PENDING_REVIEW_PATTERNS } from "./approved-batch-1";
import { detectGreeting, detectSocialKind, isNotWhatIAsked, type ChatPlan } from "./chat-conversation";
import type { ChatProvider } from "./chat-provider";

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

let vocabulary: string[] | null = null;
function vocab(): string[] {
  if (!vocabulary) {
    const words = new Set<string>();
    for (const entry of ASSISTANT_ENTRIES) for (const keyword of entry.keywords) for (const w of keyword.split(" ")) if (w.length >= 5) words.add(w);
    vocabulary = [...words];
  }
  return vocabulary;
}

/** Corrige erros de digitação simples (distância 1 em palavras de 5+ letras, 2 em 9+). */
export function correctTypos(normalized: string): string {
  const known = new Set(vocab());
  return normalized
    .split(" ")
    .map((token) => {
      if (token.length < 5 || known.has(token)) return token;
      const limit = token.length >= 9 ? 2 : 1;
      let best = token;
      let bestDistance = limit + 1;
      for (const word of known) {
        if (Math.abs(word.length - token.length) > limit) continue;
        const distance = editDistance(token, word);
        if (distance < bestDistance) {
          best = word;
          bestDistance = distance;
        }
      }
      return best;
    })
    .join(" ");
}

function plan(partial: Partial<ChatPlan> & Pick<ChatPlan, "intent">): ChatPlan {
  return { greeting: null, social_reply: null, entry_ids: [], clarifying_question: null, ...partial };
}

export function simulatePlan(question: string, lastQuestion: string | null): ChatPlan {
  const normalized = normalizeText(question);
  const greeted = detectGreeting(normalized);
  const rest = greeted ? greeted.rest : normalized;
  const greeting = greeted ? greeted.greeting : null;

  if (isNotWhatIAsked(normalized)) {
    return plan({
      intent: "clarify",
      clarifying_question: lastQuestion ? "Entendi. Sobre o que você queria saber exatamente?" : "Pode me contar com outras palavras o que você quer saber?",
    });
  }
  if (detectSocialKind(rest)) return plan({ intent: "social", greeting });
  if (PENDING_REVIEW_PATTERNS.some((pattern) => pattern.test(rest))) return plan({ intent: "pending", greeting });

  const corrected = correctTypos(rest);
  // pergunta composta: separa em partes ("... e como ...", "?" no meio) e junta os assuntos distintos
  const parts = corrected.split(/\s+e\s+(?=como|onde|quando|o que|qual|quais|por que)/).map((part) => part.trim()).filter(Boolean);
  const ids: string[] = [];
  for (const part of parts.length > 0 ? parts : [corrected]) {
    const answer = answerQuestion(part, "sim");
    if (answer.entryId !== "fallback" && answer.entryId !== "selecao-obra" && !ids.includes(answer.entryId)) ids.push(answer.entryId);
  }
  if (ids.length === 0) return plan({ intent: "unclear", greeting });
  return plan({ intent: "acc", greeting, entry_ids: ids.slice(0, 3) });
}

export function createSimulatedChatProvider(): ChatProvider {
  return {
    id: "simulated",
    model: null,
    async plan(request) {
      const last = request.history.length > 0 ? request.history[request.history.length - 1].question : null;
      return { raw: simulatePlan(request.question, last), usage: null };
    },
  };
}
