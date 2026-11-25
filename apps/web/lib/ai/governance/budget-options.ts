// Opções de ORÇAMENTO MONETÁRIO (US$) das consultas aos Experts IA — DESATIVADAS (frente N6).
//
// O que existe hoje (aprovado/vigente): limite de QUANTIDADE (ai_consult_limits — 20 por usuário/dia somando todas as
// obras e 100 por obra/dia). Os valores são operacionais e NÃO são política aprovada pela Diretoria; esta frente não
// os altera.
//
// O que esta frente PREPARA (sem ativar): tetos em US$ por usuário, por obra e global, por dia e por mês, aplicados no
// MESMO núcleo atômico da reserva (ai_consult_reserve_core, migration 20261121150000) a partir da linha única
// ai_consult_budget_settings (scope DEFAULT). A chave de ativação é a coluna `enabled` (padrão false) — vive no banco,
// server-side, alterável só por service_role; nunca no frontend nem em variável pública.
//
// Estimativa por chamada (mesmo princípio da AXIA em axia_chat_budget / lib/assistant/chat-budget.ts): pior caso =
// tokens máximos de entrada + saída × preço por milhão de tokens do modelo configurado, arredondado PARA CIMA em
// micro-dólares. O ACC não fixa preços no código: a Diretoria informa o preço do modelo contratado e o valor
// resultante é gravado em ai_consult_budget_settings.estimated_cost_per_call_usd (ver docs/ai/orcamento-monetario-ia.md).
//
// Este módulo é puro (sem I/O): só descreve o estado padrão e calcula a estimativa — ele nunca ativa nada.

export interface ExpertBudgetSettings {
  /** Chave de ativação. false = nenhum teto monetário aplicado (estado padrão e atual). */
  enabled: boolean;
  /** Estimativa por chamada (US$). null = não configurada (nenhuma estimativa gravada no consumo). */
  estimatedCostPerCallUsd: number | null;
  perUserDayUsd: number | null;
  perUserMonthUsd: number | null;
  perProjectDayUsd: number | null;
  perProjectMonthUsd: number | null;
  globalDayUsd: number | null;
  globalMonthUsd: number | null;
  /** Referência da decisão da Diretoria (obrigatória para ativar — constraint no banco). */
  decisionReference: string | null;
}

/** Estado gravado pela migration 20261121150000: tudo desligado. */
export const DEFAULT_EXPERT_BUDGET_SETTINGS: Readonly<ExpertBudgetSettings> = Object.freeze({
  enabled: false,
  estimatedCostPerCallUsd: null,
  perUserDayUsd: null,
  perUserMonthUsd: null,
  perProjectDayUsd: null,
  perProjectMonthUsd: null,
  globalDayUsd: null,
  globalMonthUsd: null,
  decisionReference: null,
});

/** Erros que o núcleo levanta quando o orçamento ATIVO seria ultrapassado (mapeados em consult-quota.ts). */
export const EXPERT_BUDGET_ERROR_CODES = [
  "AI_CONSULT_BUDGET_USER_DAY",
  "AI_CONSULT_BUDGET_USER_MONTH",
  "AI_CONSULT_BUDGET_PROJECT_DAY",
  "AI_CONSULT_BUDGET_PROJECT_MONTH",
  "AI_CONSULT_BUDGET_GLOBAL_DAY",
  "AI_CONSULT_BUDGET_GLOBAL_MONTH",
] as const;

export interface ExpertCallEstimateInput {
  /** Entrada máxima assumida (instruções + contexto da obra + pergunta), em tokens. */
  maxInputTokens: number;
  /** Saída máxima (ANTHROPIC_MAX_TOKENS do provedor), em tokens. */
  maxOutputTokens: number;
  /** Preço de entrada do modelo contratado, US$ por milhão de tokens (informado pela Diretoria/financeiro). */
  priceInPerMTok: number;
  /** Preço de saída do modelo contratado, US$ por milhão de tokens. */
  priceOutPerMTok: number;
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Estimativa de custo: ${name} deve ser um número positivo.`);
  return value;
}

/** Pior caso de UMA chamada a um Expert, em micro-dólares inteiros (arredondado para cima: nunca subestima). */
export function estimateExpertCallCostMicros(input: ExpertCallEstimateInput): number {
  const usd =
    (positiveFinite(input.maxInputTokens, "maxInputTokens") * positiveFinite(input.priceInPerMTok, "priceInPerMTok") +
      positiveFinite(input.maxOutputTokens, "maxOutputTokens") * positiveFinite(input.priceOutPerMTok, "priceOutPerMTok")) /
    1_000_000;
  return Math.ceil(usd * 1_000_000 - 1e-9);
}

/** Mesma estimativa em US$ (6 casas), no formato da coluna estimated_cost_per_call_usd. */
export function estimateExpertCallCostUsd(input: ExpertCallEstimateInput): number {
  return estimateExpertCallCostMicros(input) / 1_000_000;
}

/**
 * Projeção para a decisão da Diretoria: custo máximo diário/mensal SE os limites de quantidade vigentes forem
 * totalmente usados (cada unidade = uma chamada no pior caso). Não é gasto real.
 */
export function projectWorstCaseSpendUsd(input: {
  estimatedCostPerCallUsd: number;
  perUserDayCalls: number;
  perProjectDayCalls: number;
  activeProjects: number;
  workingDaysPerMonth: number;
}): { perUserDay: number; perProjectDay: number; globalDay: number; globalMonth: number } {
  const cost = positiveFinite(input.estimatedCostPerCallUsd, "estimatedCostPerCallUsd");
  const round = (n: number) => Math.ceil(n * 100) / 100;
  const globalDay = cost * input.perProjectDayCalls * input.activeProjects;
  return {
    perUserDay: round(cost * input.perUserDayCalls),
    perProjectDay: round(cost * input.perProjectDayCalls),
    globalDay: round(globalDay),
    globalMonth: round(globalDay * input.workingDaysPerMonth),
  };
}
