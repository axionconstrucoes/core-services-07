// Provedor de IA da conversa da AXIA (servidor). Reaproveita a integração Anthropic já usada pelos especialistas:
// o mesmo SDK (@anthropic-ai/sdk), a mesma ANTHROPIC_API_KEY (só no servidor) e o mesmo padrão de saída estruturada por
// ferramenta obrigatória. O modelo da AXIA é configurado à parte (AXIA_CHAT_MODEL), porque a conversa usa um modelo
// pequeno e barato, não o dos especialistas.
//
// Limites duros: entrada (mensagem ≤ 500 caracteres + contexto ≤ 2 turnos), saída (CHAT_MAX_OUTPUT_TOKENS), tempo
// (CHAT_TIMEOUT_MS, com Promise.race — não depende de o SDK honrar o timeout) e SEM nova tentativa (maxRetries 0).

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
}

export interface ChatProviderResult {
  raw: unknown;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
}

export interface ChatProvider {
  readonly id: "anthropic" | "simulated";
  readonly model: string | null;
  plan(request: ChatProviderRequest): Promise<ChatProviderResult>;
}

const TOOL_NAME = "plano_conversa";

interface MessagesClient {
  messages: {
    create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<{
      stop_reason?: string | null;
      content: Array<{ type: string; name?: string; input?: unknown }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
}

export function createAnthropicChatProvider(config: { apiKey: string; model: string }, client?: MessagesClient): ChatProvider {
  const sdk: MessagesClient =
    client ?? (new Anthropic({ apiKey: config.apiKey, timeout: CHAT_TIMEOUT_MS, maxRetries: 0 }) as unknown as MessagesClient);
  return {
    id: "anthropic",
    model: config.model,
    async plan(request) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Timeout da conversa da AXIA."));
        }, CHAT_TIMEOUT_MS);
      });
      try {
        const message = await Promise.race([
          sdk.messages.create(
            {
              model: config.model,
              max_tokens: CHAT_MAX_OUTPUT_TOKENS,
              system: request.system,
              messages: [{ role: "user", content: request.user }],
              tools: [{ name: TOOL_NAME, description: "Devolve o plano de conversa da AXIA (saída estruturada obrigatória).", input_schema: CHAT_PLAN_SCHEMA }],
              tool_choice: { type: "tool", name: TOOL_NAME },
            },
            { signal: controller.signal }
          ),
          timeout,
        ]);
        if (message.stop_reason === "max_tokens" || message.stop_reason === "refusal") {
          throw new Error(`Conversa da AXIA interrompida (stop_reason=${message.stop_reason}).`);
        }
        const block = message.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
        if (!block) throw new Error("A IA não devolveu o plano estruturado.");
        return {
          raw: block.input,
          usage: message.usage ? { inputTokens: message.usage.input_tokens ?? null, outputTokens: message.usage.output_tokens ?? null } : null,
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

export function createChatProvider(config: AxiaChatConfig): ChatProvider | null {
  if (config.mode === "anthropic") return createAnthropicChatProvider({ apiKey: config.apiKey, model: config.model });
  if (config.mode === "simulated") return createSimulatedChatProvider();
  return null;
}
