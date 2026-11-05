// Limite de GASTO da conversa com IA (por instância do servidor, melhor esforço em ambiente serverless: cada instância tem o
// seu contador — o teto real de custo continua sendo o limite do provedor/conta; este é uma segunda trava).
//
//   AXIA_CHAT_DAILY_BUDGET_USD   teto diário estimado por instância (padrão 1,00)
//   AXIA_CHAT_USER_DAILY_CALLS   chamadas de IA por usuário por dia (padrão 100)
//   AXIA_CHAT_PRICE_IN_PER_MTOK / AXIA_CHAT_PRICE_OUT_PER_MTOK   preços usados na estimativa (padrão Haiku 5.5: 0,10 / 0,50)
//
// Ao atingir o teto a IA fica desligada até o próximo dia (UTC) e a AXIA segue com a base aprovada.

import { CHAT_MAX_OUTPUT_TOKENS } from "./chat-conversation";

type Env = Record<string, string | undefined>;

export interface BudgetConfig {
  dailyBudgetUsd: number;
  perUserDailyCalls: number;
  priceInPerMTok: number;
  priceOutPerMTok: number;
}

function positive(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadBudgetConfig(env: Env = process.env): BudgetConfig {
  return {
    dailyBudgetUsd: positive(env.AXIA_CHAT_DAILY_BUDGET_USD, 1),
    perUserDailyCalls: Math.floor(positive(env.AXIA_CHAT_USER_DAILY_CALLS, 100)),
    priceInPerMTok: positive(env.AXIA_CHAT_PRICE_IN_PER_MTOK, 0.1),
    priceOutPerMTok: positive(env.AXIA_CHAT_PRICE_OUT_PER_MTOK, 0.5),
  };
}

/** Entrada máxima assumida para reservar gasto antes da chamada (prompt fixo + mensagem + contexto, com folga). */
const WORST_CASE_INPUT_TOKENS = 5000;

export function costUsd(inputTokens: number, outputTokens: number, config: BudgetConfig): number {
  return (inputTokens * config.priceInPerMTok + outputTokens * config.priceOutPerMTok) / 1_000_000;
}

const state = { day: "", spentUsd: 0, calls: 0, users: new Map<string, number>() };

function rollDay(now: number) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) {
    state.day = day;
    state.spentUsd = 0;
    state.calls = 0;
    state.users = new Map();
  }
}

export function resetBudget() {
  state.day = "";
  state.spentUsd = 0;
  state.calls = 0;
  state.users = new Map();
}

export function budgetSnapshot() {
  return { day: state.day, spentUsd: state.spentUsd, calls: state.calls };
}

/** Reserva uma chamada. Devolve false se o teto diário ou o limite do usuário seria ultrapassado. */
export function reserveCall(userKey: string | null, now: number, config: BudgetConfig): boolean {
  rollDay(now);
  const reserve = costUsd(WORST_CASE_INPUT_TOKENS, CHAT_MAX_OUTPUT_TOKENS, config);
  if (state.spentUsd + reserve > config.dailyBudgetUsd) return false;
  if (userKey) {
    const used = state.users.get(userKey) ?? 0;
    if (used >= config.perUserDailyCalls) return false;
    state.users.set(userKey, used + 1);
    if (state.users.size > 5000) state.users = new Map([[userKey, used + 1]]);
  }
  state.calls += 1;
  // Estimativa conservadora até o uso real chegar.
  state.spentUsd += reserve;
  return true;
}

/** Troca a reserva pelo custo real (tokens informados pelo provedor). */
export function settleCall(usage: { inputTokens: number | null; outputTokens: number | null } | null, config: BudgetConfig): number | null {
  const reserve = costUsd(WORST_CASE_INPUT_TOKENS, CHAT_MAX_OUTPUT_TOKENS, config);
  if (!usage || usage.inputTokens === null || usage.outputTokens === null) return null; // mantém a reserva (conservador)
  const real = costUsd(usage.inputTokens, usage.outputTokens, config);
  state.spentUsd = Math.max(0, state.spentUsd - reserve + real);
  return real;
}

/** Chamada que falhou antes de gastar: devolve a reserva. */
export function releaseCall(config: BudgetConfig) {
  const reserve = costUsd(WORST_CASE_INPUT_TOKENS, CHAT_MAX_OUTPUT_TOKENS, config);
  state.spentUsd = Math.max(0, state.spentUsd - reserve);
}
