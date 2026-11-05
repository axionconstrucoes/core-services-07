// Configuração da conversa natural da AXIA. FAIL CLOSED e DESLIGADA por padrão: sem AXIA_CHAT_PROVIDER a AXIA continua
// 100% determinística (base aprovada). A ativação em produção é uma decisão separada (variáveis na Vercel).
//
//   AXIA_CHAT_PROVIDER = off (padrão) | simulated (só fora da Vercel: prévia/testes) | anthropic
//   anthropic exige ANTHROPIC_API_KEY (a mesma chave dos especialistas, só no servidor) e AXIA_CHAT_MODEL (nenhum modelo é
//   escolhido em silêncio). Configuração incompleta NÃO derruba a AXIA: ela volta ao modo determinístico.

export type AxiaChatConfig =
  | { mode: "off"; reason: string | null }
  | { mode: "simulated"; reason: null }
  | { mode: "anthropic"; reason: null; apiKey: string; model: string };

import { createHash } from "node:crypto";

type Env = Record<string, string | undefined>;

/** Impressão digital NÃO reversível da credencial (só para detectar troca/rotação na memória; nunca é registrada em log). */
export function credentialFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

export function loadAxiaChatConfig(env: Env = process.env): AxiaChatConfig {
  const raw = (env.AXIA_CHAT_PROVIDER ?? "off").trim().toLowerCase();
  if (raw === "" || raw === "off") return { mode: "off", reason: null };
  if (raw === "simulated") {
    if (env.VERCEL) return { mode: "off", reason: "AXIA_CHAT_PROVIDER=simulated não é permitido na Vercel." };
    return { mode: "simulated", reason: null };
  }
  if (raw === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY;
    const model = env.AXIA_CHAT_MODEL?.trim();
    if (!apiKey || !model) {
      return { mode: "off", reason: "AXIA_CHAT_PROVIDER=anthropic sem ANTHROPIC_API_KEY ou AXIA_CHAT_MODEL (fail closed)." };
    }
    return { mode: "anthropic", reason: null, apiKey, model };
  }
  return { mode: "off", reason: `AXIA_CHAT_PROVIDER inválido: "${raw}".` };
}
