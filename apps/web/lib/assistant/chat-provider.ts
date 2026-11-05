// Provedor de IA da conversa da AXIA (servidor). Reaproveita a integração Anthropic já usada pelos especialistas:
// o mesmo SDK (@anthropic-ai/sdk), a mesma ANTHROPIC_API_KEY (só no servidor) e o mesmo padrão de saída estruturada por
// ferramenta obrigatória. O modelo da AXIA é configurado à parte (AXIA_CHAT_MODEL), porque a conversa usa um modelo
// pequeno e barato, não o dos especialistas.
//
// Limites duros: entrada (mensagem ≤ 500 caracteres + contexto ≤ 2 turnos), saída (CHAT_MAX_OUTPUT_TOKENS), tempo
// (CHAT_TIMEOUT_MS, com Promise.race — não depende de o SDK honrar o timeout) e SEM nova tentativa (maxRetries 0).
//
// RESULTADO FINANCEIRO de cada falha (usado pela contabilidade conservadora de chat-budget.ts):
//   not_charged: o provedor rejeitou o pedido antes de executar (HTTP 400/401/403/404/413/422/429) — pode devolver a reserva;
//   charged    : houve resposta (truncada, recusa, sem ferramenta) — os tokens vêm em `usage` e a chamada É cobrada;
//   uncertain  : timeout, queda de rede, 5xx, erro desconhecido — PODE ter sido cobrada: a reserva do pior caso permanece.
//                Em timeout, `late` entrega os tokens reais se a chamada ainda terminar depois (conclusão tardia).

import Anthropic from "@anthropic-ai/sdk";

import { CHAT_MAX_OUTPUT_TOKENS, CHAT_PLAN_SCHEMA, CHAT_TIMEOUT_MS, type HistoryTurn } from "./chat-conversation";
import type { AxiaChatConfig } from "./chat-config";
import { createSimulatedChatProvider } from "./chat-simulated";

export interface ChatProviderRequest {
  /** Mensagens que realmente vão à IA (ver buildSystemPrompt/buildUserMessage). */
  system: string;
  user: string;
  /** Só para o simulador local (não é enviado a nenhum serviço). */
  question: string;
  history: HistoryTurn[];
  /** Ids dos CANDIDATOS aprovados enviados à IA (o simulador local escolhe só entre eles). */
  candidateIds: string[];
}

export interface ChatUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ChatProviderResult {
  raw: unknown;
  usage: ChatUsage | null;
}

export interface ChatProvider {
  readonly id: "anthropic" | "simulated";
  readonly model: string | null;
  plan(request: ChatProviderRequest): Promise<ChatProviderResult>;
}

export type ChatOutcome = "not_charged" | "charged" | "uncertain";

export class ChatProviderError extends Error {
  readonly outcome: ChatOutcome;
  readonly usage: ChatUsage | null;
  /** Só em timeout: resolve com os tokens reais se a chamada ainda concluir depois do prazo (ou null). */
  readonly late: Promise<ChatUsage | null> | null;
  constructor(message: string, outcome: ChatOutcome, usage: ChatUsage | null = null, late: Promise<ChatUsage | null> | null = null) {
    super(message);
    this.name = "ChatProviderError";
    this.outcome = outcome;
    this.usage = usage;
    this.late = late;
  }
}

/** Status HTTP em que o provedor rejeita o pedido sem executá-lo (não há cobrança). */
const NOT_CHARGED_STATUS = new Set([400, 401, 403, 404, 413, 422, 429]);

export function classifyProviderFailure(error: unknown): ChatOutcome {
  if (error instanceof ChatProviderError) return error.outcome;
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" && NOT_CHARGED_STATUS.has(status) ? "not_charged" : "uncertain";
}

const TOOL_NAME = "plano_conversa";

interface MessageResult {
  stop_reason?: string | null;
  content: Array<{ type: string; name?: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface MessagesClient {
  messages: {
    create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<MessageResult>;
  };
}

function usageOf(message: MessageResult): ChatUsage | null {
  return message.usage ? { inputTokens: message.usage.input_tokens ?? null, outputTokens: message.usage.output_tokens ?? null } : null;
}

export function createAnthropicChatProvider(
  config: { apiKey: string; model: string },
  client?: MessagesClient,
  options: { timeoutMs?: number } = {}
): ChatProvider {
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  const sdk: MessagesClient =
    client ?? (new Anthropic({ apiKey: config.apiKey, timeout: CHAT_TIMEOUT_MS, maxRetries: 0 }) as unknown as MessagesClient);
  return {
    id: "anthropic",
    model: config.model,
    async plan(request) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const call = sdk.messages.create(
        {
          model: config.model,
          max_tokens: CHAT_MAX_OUTPUT_TOKENS,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          tools: [{ name: TOOL_NAME, description: "Devolve o plano de conversa da AXIA (saída estruturada obrigatória).", input_schema: CHAT_PLAN_SCHEMA }],
          tool_choice: { type: "tool", name: TOOL_NAME },
        },
        { signal: controller.signal }
      );
      // Conclusão tardia: se o prazo estourar, a chamada pode terminar depois; os tokens reais corrigem a contabilidade.
      const late: Promise<ChatUsage | null> = call.then(usageOf, () => null);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ChatProviderError("Timeout da conversa da AXIA.", "uncertain", null, late));
        }, timeoutMs);
      });
      let message: MessageResult;
      try {
        message = await Promise.race([call, timeout]);
      } catch (error) {
        if (error instanceof ChatProviderError) throw error;
        throw new ChatProviderError("Falha na chamada da IA.", classifyProviderFailure(error));
      } finally {
        if (timer) clearTimeout(timer);
      }
      const usage = usageOf(message);
      if (message.stop_reason === "max_tokens" || message.stop_reason === "refusal") {
        throw new ChatProviderError(`Conversa da AXIA interrompida (stop_reason=${message.stop_reason}).`, "charged", usage);
      }
      const block = message.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
      if (!block) throw new ChatProviderError("A IA não devolveu o plano estruturado.", "charged", usage);
      return { raw: block.input, usage };
    },
  };
}

export function createChatProvider(config: AxiaChatConfig): ChatProvider | null {
  if (config.mode === "anthropic") return createAnthropicChatProvider({ apiKey: config.apiKey, model: config.model });
  if (config.mode === "simulated") return createSimulatedChatProvider();
  return null;
}
