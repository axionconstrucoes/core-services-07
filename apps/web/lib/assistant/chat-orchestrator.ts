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
  buildBoundaryAnswer,
  buildEntriesAnswer,
  buildFallbackAnswer,
  withCaseNotice,
  answerQuestion,
  dependsOnSpecificProject,
  normalizeText,
  type AssistantAnswer,
} from "./answer";
import { ASSISTANT_ENTRIES, ASSISTANT_READ_ONLY_NOTICE, getAssistantEntry } from "./knowledge";
import { PENDING_REVIEW_PATTERNS } from "./approved-batch-1";
import { resolveAdminHandoff } from "./qa-handoff";
import { gradeDeadlineEntryIds, isCaseAdvice, isPermissionBypass } from "./guards";
import { BudgetUnavailableError, loadBudgetConfig, resolveBudgetStore, type BudgetStore, type Reservation } from "./chat-budget";
import { credentialFingerprint, loadAxiaChatConfig } from "./chat-config";
import { ChatProviderError, classifyProviderFailure, createChatProvider, type ChatProvider } from "./chat-provider";
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
  /** Identifica o usuário só para o limite diário de chamadas (em memória; nunca vai ao provedor). */
  userKey?: string | null;
  /** Injeção para testes. */
  provider?: ChatProvider | null;
  /** Injeção para testes: armazenamento do orçamento (padrão: SQL global em produção, memória no simulador). */
  budgetStore?: BudgetStore | null;
  now?: number;
}

/** Disjuntor simples por instância: depois de uma falha do provedor, 60 s sem tentar de novo (evita fila de timeouts). */
const FAILURE_COOLDOWN_MS = 60_000;
let providerFailedAt = 0;
export function resetChatCircuit() {
  providerFailedAt = 0;
}

/**
 * Cache do provedor: a chave inclui modo, modelo e a IMPRESSÃO DIGITAL (sha-256 truncado) da credencial. Assim, uma troca/rotação
 * da ANTHROPIC_API_KEY no mesmo processo recria o cliente na hora, e a credencial antiga não continua em uso. A impressão
 * digital fica só na memória e nunca é registrada em log nem devolvida em erro.
 */
let cachedProvider: { key: string; provider: ChatProvider | null } | null = null;
export function resetProviderCache() {
  cachedProvider = null;
}
export function providerCacheKey(config: ReturnType<typeof loadAxiaChatConfig>): string {
  return config.mode === "anthropic" ? `anthropic:${config.model}:${credentialFingerprint(config.apiKey)}` : config.mode;
}
export function resolveChatProvider(env: Env, create: typeof createChatProvider = createChatProvider): ChatProvider | null {
  const config = loadAxiaChatConfig(env);
  if (config.mode === "off") {
    if (config.reason) console.warn(`[axia-conversa] IA desligada: ${config.reason}`);
    cachedProvider = null; // desligar descarta o cliente (e a credencial) em memória
    return null;
  }
  const key = providerCacheKey(config);
  if (cachedProvider?.key !== key) cachedProvider = { key, provider: create(config) };
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

  // 1b) Guardas determinísticas (nunca chamam a IA): tentativa de contornar permissões ou obter dados; prazos por grau.
  if (isPermissionBypass(normalized)) {
    return withMeta(buildBoundaryAnswer(projectId, readOnlyNotice, adminHandoff), greeting, "base");
  }
  if (projectId && isCaseAdvice(normalized)) {
    return withMeta(withCaseNotice(buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff), rest), greeting, "base");
  }
  const gradeIds = isNotWhatIAsked(normalized) ? null : gradeDeadlineEntryIds(rest);
  if (gradeIds && !needsProject) {
    const composed = buildEntriesAnswer(gradeIds, projectId, readOnlyNotice, adminHandoff);
    if (composed) return withMeta(withCaseNotice(composed, rest), greeting, "base");
  }

  // 2) Plano da IA (se disponível).
  let plan: ChatPlan | null = null;
  const provider = input.provider !== undefined ? input.provider : resolveChatProvider(env);
  const aiUsable = !!provider && input.aiAllowed !== false && now - providerFailedAt > FAILURE_COOLDOWN_MS && !heldForReview && !needsProject && question !== "";
  const budget = loadBudgetConfig(env);
  let store: BudgetStore | null = null;
  let reservation: Reservation | null = null;
  if (aiUsable && provider) {
    try {
      store = input.budgetStore !== undefined ? input.budgetStore : await resolveBudgetStore(provider.id === "simulated" ? "simulated" : "anthropic", env);
      // Reserva atômica do pior caso ANTES de falar com o provedor. Sem armazenamento ou negada: a IA não é chamada.
      reservation = store ? await store.reserve(input.userKey ?? null, now, budget) : null;
    } catch (error) {
      reservation = null;
      if (error instanceof BudgetUnavailableError) console.warn(`[axia-conversa] ${error.message}; IA não será chamada.`);
      else console.warn("[axia-conversa] falha ao reservar orçamento; IA não será chamada.");
    }
  }
  if (aiUsable && provider && store && reservation) {
    try {
      const result = await provider.plan({
        system: buildSystemPrompt(),
        user: buildUserMessage(question, history, (id) => getAssistantEntry(id)?.title ?? null),
        question,
        history,
      });
      plan = validatePlan(result.raw, allowed);
      const real = await store.settle(reservation, result.usage, budget).catch(() => null);
      if (result.usage) {
        // Só contagem de tokens e custo estimado, nunca conteúdo.
        console.info(`[axia-conversa] provedor=${provider.id} entrada=${result.usage.inputTokens ?? "?"} saida=${result.usage.outputTokens ?? "?"} custo_micros=${real ?? "?"}`);
      }
    } catch (error) {
      providerFailedAt = now;
      const outcome = classifyProviderFailure(error);
      const held = reservation;
      // Contabilidade CONSERVADORA: só devolve a reserva se a chamada certamente não foi cobrada.
      try {
        if (outcome === "not_charged") await store.release(held);
        else if (outcome === "charged") await store.settle(held, error instanceof ChatProviderError ? error.usage : null, budget);
        else {
          await store.markUncertain(held); // timeout/queda/5xx: a reserva do pior caso PERMANECE no total
          if (error instanceof ChatProviderError && error.late) {
            const active = store;
            void error.late.then((usage) => (usage ? active.lateSettle(held, usage, budget) : undefined)).catch(() => undefined);
          }
        }
      } catch {
        console.warn("[axia-conversa] falha ao registrar o resultado financeiro; a reserva do pior caso permanece.");
      }
      console.warn(`[axia-conversa] provedor indisponível (${outcome}); usando a base aprovada`);
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
      const composed = buildEntriesAnswer(plan.entry_ids, projectId, readOnlyNotice, adminHandoff);
      if (composed) return withMeta(withCaseNotice(composed, rest), plan.greeting ?? greeting, via);
    }
    // pending / unclear / acc sem entrada utilizável: encaminhamento (Ajuda + ADMIN), nunca resposta inventada.
    const fallback = buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff);
    if (plan.intent === "unclear" && plan.clarifying_question) fallback.steps = [plan.clarifying_question, ...fallback.steps];
    return withMeta(withCaseNotice(fallback, rest), plan.greeting ?? greeting, via);
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
