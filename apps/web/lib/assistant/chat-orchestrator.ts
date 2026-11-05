// Orquestrador da conversa natural da AXIA (servidor). Decide entre o caminho com IA e o caminho determinístico e SEMPRE
// devolve uma resposta: se a IA estiver desligada, bloqueada pelo limite de frequência, lenta ou falhar, as respostas do
// Q&A aprovado e as saudações básicas continuam disponíveis.
//
// O que a IA faz: interpreta a mensagem (erros de digitação, perguntas compostas, conversa social, pedido de esclarecimento).
// O que a IA NÃO faz: escrever regra, prazo, permissão, funcionalidade ou estado de rotina. O corpo da resposta operacional é
// sempre o texto aprovado das entradas escolhidas; a seção do manual vem da entrada, nunca da IA.

import { SCOPE_REPLY, SCOPE_REPLY_TITLE, SPECIALIST_ENTRY_ID, SPECIALIST_SECTION, SPECIALIST_SUMMARY, SPECIALIST_TITLE, isContractInterpretation, isOutOfScope } from "./scope";
import { localRetrieve } from "./local-match";
import { recordAxiaRoute, type AxiaRoute } from "./metrics";
import {
  ASSISTANT_QUESTION_MAX_LENGTH,
  tokens,
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

/** Resposta local de conversa/limite (sem fonte do manual, sem ADMIN): social e recusa por escopo. */
function plainAnswer(
  kind: "social" | "scope",
  entryId: string,
  title: string,
  text: string,
  adminHandoff: AssistantAnswer["adminHandoff"]
): AssistantAnswer {
  return {
    mode: "BASE_CONHECIMENTO",
    entryId,
    title,
    summary: text,
    steps: [],
    links: [],
    tutorialSlide: null,
    readOnlyNotice: null,
    coverage: "completa",
    manualSection: null,
    adminHandoff,
    kind,
    intro: null,
    via: "base",
  };
}

function clarifyAnswer(
  text: string,
  repeated: boolean,
  projectId: string | null,
  adminHandoff: AssistantAnswer["adminHandoff"]
): AssistantAnswer {
  // Segunda tentativa sem resolver: oferece o encaminhamento (Ajuda + orientação ao ADMIN).
  if (repeated) {
    const fallback = buildFallbackAnswer(projectId, null, adminHandoff);
    return { ...fallback, entryId: CLARIFY_ENTRY_ID, title: "Ainda não consegui ajudar", summary: "Não encontrei uma resposta aprovada para isso. Se quiser, consulte a Ajuda ou fale com o administrador.", steps: [], kind: "clarify", intro: null, via: "base" };
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
    via: "base",
  };
}

/** Encaminhamento para os especialistas (Experts IA): a AXIA não interpreta contratos, documentos nem cláusulas. */
function specialistAnswer(projectId: string | null, adminHandoff: AssistantAnswer["adminHandoff"]): AssistantAnswer {
  const x2 = ASSISTANT_ENTRIES.find((entry) => entry.id === "qa-X2");
  return {
    mode: "BASE_CONHECIMENTO",
    entryId: SPECIALIST_ENTRY_ID,
    title: SPECIALIST_TITLE,
    summary: SPECIALIST_SUMMARY,
    steps: [],
    links: projectId ? [{ label: "Experts IA", href: `/${projectId}/experts-ia` }] : [],
    tutorialSlide: null,
    readOnlyNotice: null,
    coverage: "completa",
    manualSection: SPECIALIST_SECTION,
    adminHandoff,
    kind: "acc",
    intro: null,
    via: "base",
    sections: x2 ? [{ title: x2.title, summary: x2.summary, steps: x2.steps, manualSection: x2.manualSection ?? null }] : undefined,
  };
}

/** Registra a rota (contador agregado, sem conteúdo) e devolve a resposta. */
function done(route: AxiaRoute, answer: AssistantAnswer): AssistantAnswer {
  recordAxiaRoute(route);
  return answer;
}

/**
 * Ordem de decisão (a IA é o ÚLTIMO recurso; nenhuma etapa antes dela gasta token nem reserva orçamento):
 *   1 tentativa de contornar permissões ─ 2 conversa social ─ 3 "não foi isso" ─ 4 depende de obra (seleção) ─
 *   5 interpretação de contrato/documento → especialistas ─ 6 decisão sobre caso concreto ─ 7 entradas em revisão ─
 *   8 prazos por grau (E2/R7) ─ 9 assunto geral fora do ACC → limite de escopo ─
 *   10 Q&A aprovado local (com correção de digitação e perguntas compostas) ─
 *   11 só se a confiança local for baixa E houver candidatos aprovados, acesso e orçamento: IA escolhe entre os candidatos ─
 *   12 ambígua/sem candidato → esclarecimento ou encaminhamento local.
 * Nunca lança: qualquer falha cai no caminho local.
 */
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
  const needsProject = projectId === null && dependsOnSpecificProject(rest);

  // 1) Tentativa de contornar permissões ou obter dados: limite fixo (a instrução do usuário não altera as regras).
  if (isPermissionBypass(normalized)) return done("bypass_local", withMeta(buildBoundaryAnswer(projectId, readOnlyNotice, adminHandoff), greeting, "base"));

  // 2) Conversa social (saudação, despedida, agradecimento, identidade, idade, apresentação): resposta local predefinida.
  const socialKind = detectSocialKind(rest);
  if (socialKind) return done("social_local", plainAnswer("social", SOCIAL_ENTRY_ID, "", socialReplyFor(socialKind, greeting), adminHandoff));

  // 3) "Não foi isso que perguntei": esclarecimento local (e, se já não resolveu, Ajuda + ADMIN).
  if (isNotWhatIAsked(normalized)) {
    const text = lastTurn ? "Entendi. Sobre o que você queria saber exatamente?" : "Pode me contar com outras palavras o que você quer saber?";
    return done("clarify_local", clarifyAnswer(text, repeatedUnresolved, projectId, adminHandoff));
  }

  // 4) Pergunta que depende de uma obra, na tela de seleção: pede a escolha da obra.
  if (needsProject) return done("projeto_local", withMeta(answerQuestion(rest, null, env), greeting, "base"));

  // 5) Interpretação de contrato, documento ou cláusula concretos: encaminha aos especialistas (permissões preservadas).
  if (isContractInterpretation(normalized)) return done("especialista_local", withMeta(specialistAnswer(projectId, adminHandoff), greeting, "base"));

  // 6) Decisão sobre caso concreto sem regra aprovada: encaminhamento (o aviso de caso é acrescentado).
  if (projectId && isCaseAdvice(normalized)) {
    return done("caso_local", withMeta(withCaseNotice(buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff), rest), greeting, "base"));
  }

  // 7) Tópicos das entradas ainda em revisão: encaminhamento (nunca respondidos por outra entrada).
  const gradeIds = gradeDeadlineEntryIds(rest);
  if (!gradeIds && PENDING_REVIEW_PATTERNS.some((pattern) => pattern.test(rest))) {
    return done("pendente_local", withMeta(withCaseNotice(buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff), rest), greeting, "base"));
  }

  // 8) Prazos por grau de alerta: regras aprovadas (E2 e R7).
  if (gradeIds) {
    const composed = buildEntriesAnswer(gradeIds, projectId, readOnlyNotice, adminHandoff);
    if (composed) return done("prazo_local", withMeta(withCaseNotice(composed, rest), greeting, "base"));
  }

  // 9) Assunto geral fora do ACC: limite de escopo cordial. Decisão 100% local — nunca a IA decide se está dentro ou fora.
  if (isOutOfScope(normalized)) return done("escopo_local", plainAnswer("scope", "fora-do-escopo", SCOPE_REPLY_TITLE, SCOPE_REPLY, adminHandoff));

  // 10) Q&A aprovado local: erros de digitação corrigidos, perguntas compostas e resposta confiante SEM IA.
  const local = localRetrieve(rest);
  if (local.compoundIds) {
    const composed = buildEntriesAnswer(local.compoundIds, projectId, readOnlyNotice, adminHandoff);
    if (composed) return done("qa_local", withMeta(withCaseNotice(composed, rest), greeting, "base"));
  }
  // Resposta confiante E inequívoca: local. (Pergunta longa com 2+ assuntos empatados é "complexa": pode usar a IA, se disponível.)
  if (local.confident && !local.ambiguous) return done("qa_local", withMeta(answerQuestion(local.corrected, projectId, env), greeting, "base"));

  // 11) Confiança local baixa: a IA só entra se houver CANDIDATOS aprovados (contexto suficiente), acesso e orçamento.
  const provider = input.provider !== undefined ? input.provider : resolveChatProvider(env);
  const candidateEntries = local.candidates.map((c) => c.entry);
  // IA só com: candidatos aprovados (contexto suficiente), melhor candidato com pontuação mínima e pergunta com 2+ palavras significativas.
  const solidContext = candidateEntries.length > 0 && (local.best?.score ?? 0) >= 2 && local.meaningful >= 2;
  const aiUsable = !!provider && input.aiAllowed !== false && now - providerFailedAt > FAILURE_COOLDOWN_MS && solidContext && question !== "";
  let plan: ChatPlan | null = null;
  let aiFailed = false;
  if (aiUsable && provider) {
    const budget = loadBudgetConfig(env);
    let store: BudgetStore | null = null;
    let reservation: Reservation | null = null;
    try {
      store = input.budgetStore !== undefined ? input.budgetStore : await resolveBudgetStore(provider.id === "simulated" ? "simulated" : "anthropic", env);
      // Reserva atômica do pior caso ANTES de falar com o provedor. Sem armazenamento ou negada: a IA não é chamada.
      reservation = store ? await store.reserve(input.userKey ?? null, now, budget) : null;
    } catch (error) {
      reservation = null;
      if (error instanceof BudgetUnavailableError) console.warn(`[axia-conversa] ${error.message}; IA não será chamada.`);
      else console.warn("[axia-conversa] falha ao reservar orçamento; IA não será chamada.");
    }
    if (store && reservation) {
      try {
        const result = await provider.plan({
          system: buildSystemPrompt(candidateEntries),
          user: buildUserMessage(local.corrected, history, (id) => getAssistantEntry(id)?.title ?? null),
          question: local.corrected,
          history,
          candidateIds: candidateEntries.map((e) => e.id),
        });
        plan = validatePlan(result.raw, new Set(candidateEntries.map((e) => e.id)));
        const real = await store.settle(reservation, result.usage, budget).catch(() => null);
        if (result.usage) {
          // Só contagem de tokens e custo estimado, nunca conteúdo.
          console.info(`[axia-conversa] provedor=${provider.id} entrada=${result.usage.inputTokens ?? "?"} saida=${result.usage.outputTokens ?? "?"} custo_micros=${real ?? "?"}`);
        }
      } catch (error) {
        aiFailed = true;
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
  }

  if (plan) {
    if (plan.intent === "acc") {
      const composed = buildEntriesAnswer(plan.entry_ids, projectId, readOnlyNotice, adminHandoff);
      if (composed) return done("ia_consulta", withMeta(withCaseNotice(composed, rest), greeting, "ia"));
    }
    // pending / unclear / acc sem entrada utilizável: encaminhamento (Ajuda + ADMIN), nunca resposta inventada.
    const fallback = buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff);
    if (plan.intent === "unclear" && plan.clarifying_question) fallback.steps = [plan.clarifying_question, ...fallback.steps];
    return done("ia_consulta", withMeta(withCaseNotice(fallback, rest), greeting, "ia"));
  }

  // 12) Sem IA (desligada, sem acesso, sem orçamento, sem candidato, falha): resposta local como antes.
  if ((local.best?.score ?? 0) < 2 && local.meaningful <= 2) {
    return done("clarify_local", clarifyAnswer("Pode detalhar um pouco mais a sua dúvida? Por exemplo: alertas, prazos, documentos, permissões ou especialistas.", repeatedUnresolved, projectId, adminHandoff));
  }
  const base = answerQuestion(local.corrected, projectId, env);
  return done(aiFailed ? "ia_falha_base" : base.entryId === "fallback" ? "fallback_local" : "qa_local", withMeta(withCaseNotice(base, rest), greeting, "base"));
}
