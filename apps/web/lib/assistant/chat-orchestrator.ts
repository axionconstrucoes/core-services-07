// Orquestrador da conversa natural da AXIA (servidor). Decide entre o caminho com IA e o caminho determinístico e SEMPRE
// devolve uma resposta: se a IA estiver desligada, bloqueada pelo limite de frequência, lenta ou falhar, as respostas do
// Q&A aprovado e as saudações básicas continuam disponíveis.
//
// O que a IA faz: interpreta a mensagem (erros de digitação, perguntas compostas, conversa social, pedido de esclarecimento).
// O que a IA NÃO faz: escrever regra, prazo, permissão, funcionalidade ou estado de rotina. O corpo da resposta operacional é
// sempre o texto aprovado das entradas escolhidas; a seção do manual vem da entrada, nunca da IA.

import {
  ASSISTANT_QUESTION_MAX_LENGTH,
  asksToChangeData,
  buildEntryAnswer,
  buildFallbackAnswer,
  answerQuestion,
  dependsOnSpecificProject,
  normalizeText,
  type AssistantAnswer,
} from "./answer";
import { ASSISTANT_ENTRIES, ASSISTANT_READ_ONLY_NOTICE, getAssistantEntry } from "./knowledge";
import { PENDING_REVIEW_PATTERNS } from "./approved-batch-1";
import { resolveAdminHandoff } from "./qa-handoff";
import { loadAxiaChatConfig } from "./chat-config";
import { createChatProvider, type ChatProvider } from "./chat-provider";
import {
  CLARIFY_ENTRY_ID,
  SOCIAL_ENTRY_ID,
  allowedEntryIds,
  buildSystemPrompt,
  buildUserMessage,
  detectGreeting,
  detectSocialKind,
  isNotWhatIAsked,
  isUnresolvedEntry,
  sanitizeHistory,
  socialReplyFor,
  validatePlan,
  type ChatPlan,
  type HistoryTurn,
} from "./chat-conversation";

type Env = Record<string, string | undefined>;

export interface ConverseInput {
  question: string;
  /** Contexto recente enviado pelo navegador (será saneado). */
  history?: unknown;
  /** null = tela "Selecione um projeto". */
  projectId: string | null;
  env?: Env;
  /** false quando o limite de frequência da IA do usuário foi atingido: segue sem IA. */
  aiAllowed?: boolean;
  /** Injeção para testes. */
  provider?: ChatProvider | null;
  now?: number;
}

/** Disjuntor simples por instância: depois de uma falha do provedor, 60 s sem tentar de novo (evita fila de timeouts). */
const FAILURE_COOLDOWN_MS = 60_000;
let providerFailedAt = 0;
export function resetChatCircuit() {
  providerFailedAt = 0;
}

let cachedProvider: { key: string; provider: ChatProvider | null } | null = null;
function resolveProvider(env: Env): ChatProvider | null {
  const config = loadAxiaChatConfig(env);
  if (config.mode === "off") {
    if (config.reason) console.warn(`[axia-conversa] IA desligada: ${config.reason}`);
    return null;
  }
  const key = `${config.mode}:${config.mode === "anthropic" ? config.model : ""}`;
  if (cachedProvider?.key !== key) cachedProvider = { key, provider: createChatProvider(config) };
  return cachedProvider.provider;
}

function withMeta(answer: AssistantAnswer, intro: string | null, via: "ia" | "base"): AssistantAnswer {
  return { ...answer, intro, via, kind: answer.kind ?? "acc" };
}

function socialAnswer(text: string, adminHandoff: AssistantAnswer["adminHandoff"], via: "ia" | "base"): AssistantAnswer {
  return {
    mode: "BASE_CONHECIMENTO",
    entryId: SOCIAL_ENTRY_ID,
    title: "",
    summary: text,
    steps: [],
    links: [],
    tutorialSlide: null,
    readOnlyNotice: null,
    coverage: "completa",
    manualSection: null,
    adminHandoff,
    kind: "social",
    intro: null,
    via,
  };
}

function clarifyAnswer(
  text: string,
  repeated: boolean,
  projectId: string | null,
  adminHandoff: AssistantAnswer["adminHandoff"],
  via: "ia" | "base"
): AssistantAnswer {
  // Segunda tentativa sem resolver: oferece o encaminhamento (Ajuda + orientação ao ADMIN).
  if (repeated) {
    const fallback = buildFallbackAnswer(projectId, null, adminHandoff);
    return { ...fallback, entryId: CLARIFY_ENTRY_ID, title: "Ainda não consegui ajudar", summary: "Não encontrei uma resposta aprovada para isso. Se quiser, consulte a Ajuda ou fale com o administrador.", steps: [], kind: "clarify", intro: null, via };
  }
  return {
    mode: "BASE_CONHECIMENTO",
    entryId: CLARIFY_ENTRY_ID,
    title: "Preciso entender melhor",
    summary: text,
    steps: [],
    links: projectId ? [{ label: "Ajuda e tutorial", href: `/${projectId}/ajuda` }] : [],
    tutorialSlide: null,
    readOnlyNotice: null,
    coverage: "completa",
    manualSection: null,
    adminHandoff,
    kind: "clarify",
    intro: null,
    via,
  };
}

function composeFromEntries(ids: string[], projectId: string | null, readOnlyNotice: string | null, adminHandoff: AssistantAnswer["adminHandoff"]): AssistantAnswer | null {
  const entries = ids.map((id) => ASSISTANT_ENTRIES.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => !!entry);
  if (entries.length === 0) return null;
  if (entries.length === 1) return buildEntryAnswer(entries[0], projectId, readOnlyNotice, adminHandoff);
  const first = buildEntryAnswer(entries[0], projectId, readOnlyNotice, adminHandoff);
  const links = new Map<string, { label: string; href: string }>();
  for (const entry of entries) for (const link of buildEntryAnswer(entry, projectId, null, adminHandoff).links) links.set(link.href, link);
  const citations = entries.map((entry) => entry.manualSection).filter((section): section is string => !!section);
  return {
    ...first,
    entryId: entries[0].id,
    title: entries.map((entry) => entry.title).join(" + "),
    summary: "Respondo por partes, cada uma com a sua fonte:",
    steps: [],
    links: [...links.values()],
    tutorialSlide: null,
    manualSection: citations.length > 0 ? citations.join(" | ") : null,
    coverage: entries.every((entry) => (entry.coverage ?? "completa") === "completa") ? "completa" : "parcial",
    sections: entries.map((entry) => ({ title: entry.title, summary: entry.summary, steps: entry.steps, manualSection: entry.manualSection ?? null })),
  };
}

/** Nunca lança: qualquer falha cai no caminho determinístico. */
export async function converse(input: ConverseInput): Promise<AssistantAnswer> {
  const env = input.env ?? process.env;
  const projectId = input.projectId;
  const question = input.question.slice(0, ASSISTANT_QUESTION_MAX_LENGTH).trim();
  const normalized = normalizeText(question);
  const greeted = detectGreeting(normalized);
  const rest = greeted ? greeted.rest : normalized;
  const greeting = greeted ? greeted.greeting : null;
  const allowed = allowedEntryIds();
  const history: HistoryTurn[] = sanitizeHistory(input.history, allowed);
  const lastTurn = history.length > 0 ? history[history.length - 1] : null;
  const adminHandoff = resolveAdminHandoff(env);
  const readOnlyNotice = asksToChangeData(normalized) ? ASSISTANT_READ_ONLY_NOTICE : null;
  const repeatedUnresolved = !!lastTurn && isUnresolvedEntry(lastTurn.entryId);
  const now = input.now ?? Date.now();

  // 1) Bloqueios que valem com ou sem IA: perguntas das entradas em revisão e dependência de obra na tela de seleção.
  const heldForReview = PENDING_REVIEW_PATTERNS.some((pattern) => pattern.test(rest));
  const needsProject = projectId === null && dependsOnSpecificProject(rest);

  // 2) Plano da IA (se disponível).
  let plan: ChatPlan | null = null;
  const provider = input.provider !== undefined ? input.provider : resolveProvider(env);
  const aiUsable = !!provider && input.aiAllowed !== false && now - providerFailedAt > FAILURE_COOLDOWN_MS && !heldForReview && !needsProject && question !== "";
  if (aiUsable && provider) {
    try {
      const result = await provider.plan({
        system: buildSystemPrompt(),
        user: buildUserMessage(question, history, (id) => getAssistantEntry(id)?.title ?? null),
        question,
        history,
      });
      plan = validatePlan(result.raw, allowed);
      if (result.usage) {
        // Só contagem de tokens, nunca conteúdo.
        console.info(`[axia-conversa] provedor=${provider.id} entrada=${result.usage.inputTokens ?? "?"} saida=${result.usage.outputTokens ?? "?"}`);
      }
    } catch (error) {
      providerFailedAt = now;
      console.warn(`[axia-conversa] provedor indisponível; usando a base aprovada (${error instanceof Error ? error.name : "erro"})`);
    }
  }

  // 3) Resposta com base no plano validado.
  if (plan) {
    const via = "ia" as const;
    if (plan.intent === "social") {
      const kind = detectSocialKind(rest) ?? "greeting";
      const text = plan.social_reply ?? socialReplyFor(kind, null);
      const lead = plan.greeting ?? greeting;
      return socialAnswer(lead && !text.startsWith(lead) ? `${lead} ${text}` : text, adminHandoff, via);
    }
    if (plan.intent === "clarify" || isNotWhatIAsked(normalized)) {
      const text = plan.clarifying_question ?? "Pode me contar com outras palavras o que você quer saber?";
      return clarifyAnswer(text, repeatedUnresolved, projectId, adminHandoff, via);
    }
    if (plan.intent === "acc") {
      const composed = composeFromEntries(plan.entry_ids, projectId, readOnlyNotice, adminHandoff);
      if (composed) return withMeta(composed, plan.greeting ?? greeting, via);
    }
    // pending / unclear / acc sem entrada utilizável: encaminhamento (Ajuda + ADMIN), nunca resposta inventada.
    const fallback = buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff);
    if (plan.intent === "unclear" && plan.clarifying_question) fallback.steps = [plan.clarifying_question, ...fallback.steps];
    return withMeta(fallback, plan.greeting ?? greeting, via);
  }

  // 4) Caminho determinístico (IA desligada, limite atingido, lenta, com falha ou plano inválido).
  const via = "base" as const;
  if (isNotWhatIAsked(normalized)) {
    const text = lastTurn ? "Entendi. Sobre o que você queria saber exatamente?" : "Pode me contar com outras palavras o que você quer saber?";
    return clarifyAnswer(text, repeatedUnresolved, projectId, adminHandoff, via);
  }
  const socialKind = detectSocialKind(rest);
  if (socialKind) return socialAnswer(socialReplyFor(socialKind, greeting), adminHandoff, via);
  const base = answerQuestion(rest || question, projectId, env);
  return withMeta(base, greeting, via);
}
