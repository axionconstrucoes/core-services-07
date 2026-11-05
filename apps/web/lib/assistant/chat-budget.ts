// Controle financeiro da conversa com IA da AXIA.
//
// Duas implementações da MESMA interface (BudgetStore):
//   - SQL (produção): contadores GLOBAIS e CONCORRENTES no Postgres do ACC (migration 20261105150000_axia_chat_budget.sql),
//     com reserva atômica — vale entre instâncias e execuções simultâneas. Se o banco ou a migration não estiverem
//     disponíveis, a IA NÃO é chamada (fail closed): a AXIA segue com a base aprovada.
//   - Memória (só simulador/testes): mesmo contrato, por processo.
//
// CONTABILIDADE CONSERVADORA (nunca subestima o gasto):
//   reserve  → reserva o PIOR CASO antes de falar com o provedor;
//   settle   → resposta recebida: troca a reserva pelo custo real (tokens informados pela API);
//   release  → SÓ se a chamada certamente não foi cobrada (pedido rejeitado antes de executar: 400/401/403/404/413/422/429);
//   uncertain→ timeout, queda de rede, 5xx, erro desconhecido: a chamada PODE ter sido cobrada, a reserva do pior caso
//              PERMANECE no total (e não devolve a chamada ao usuário);
//   lateSettle→ se a conclusão tardia de uma chamada incerta chegar com tokens reais, ajusta o total.
//
//   AXIA_CHAT_DAILY_BUDGET_USD   teto diário GLOBAL (padrão 1,00)
//   AXIA_CHAT_USER_DAILY_CALLS   chamadas de IA por usuário por dia (padrão 100)
//   AXIA_CHAT_PRICE_IN_PER_MTOK / AXIA_CHAT_PRICE_OUT_PER_MTOK   preços da estimativa (padrão Haiku 5.5: 0,10 / 0,50)

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
export const WORST_CASE_INPUT_TOKENS = 8000;

export function costUsd(inputTokens: number, outputTokens: number, config: BudgetConfig): number {
  return (inputTokens * config.priceInPerMTok + outputTokens * config.priceOutPerMTok) / 1_000_000;
}

/** US$ → micro-dólares inteiros (arredondado PARA CIMA: nunca subestima). */
export function toMicros(usd: number): number {
  return Math.ceil(usd * 1_000_000 - 1e-9);
}

export function worstCaseMicros(config: BudgetConfig): number {
  return toMicros(costUsd(WORST_CASE_INPUT_TOKENS, CHAT_MAX_OUTPUT_TOKENS, config));
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface Reservation {
  id: string;
  reservedMicros: number;
}

/** A infraestrutura do orçamento (banco/migration) não respondeu: a IA não deve ser chamada. */
export class BudgetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetUnavailableError";
  }
}

export interface BudgetStore {
  readonly kind: "memory" | "sql";
  /** Reserva o pior caso. null = negado (teto diário ou limite do usuário). Lança BudgetUnavailableError se a infra falhar. */
  reserve(userKey: string | null, now: number, config: BudgetConfig): Promise<Reservation | null>;
  /** Resposta recebida: troca a reserva pelo custo real (usage nulo = mantém o pior caso). Devolve micro-dólares aplicados. */
  settle(reservation: Reservation, usage: Usage | null, config: BudgetConfig): Promise<number | null>;
  /** SÓ para chamada que certamente não foi cobrada. */
  release(reservation: Reservation): Promise<void>;
  /** Chamada incerta: a reserva do pior caso permanece. */
  markUncertain(reservation: Reservation): Promise<void>;
  /** Conclusão tardia de uma chamada incerta, com tokens reais. */
  lateSettle(reservation: Reservation, usage: Usage, config: BudgetConfig): Promise<void>;
}

function usageMicros(usage: Usage | null, config: BudgetConfig, fallback: number): number {
  if (!usage || usage.inputTokens === null || usage.outputTokens === null) return fallback;
  return toMicros(costUsd(usage.inputTokens, usage.outputTokens, config));
}

// ───────────────────────── memória (simulador e testes) ─────────────────────────

type MemoryState = "reserved" | "settled" | "uncertain" | "released";
interface MemoryReservation {
  day: string;
  userKey: string | null;
  micros: number;
  state: MemoryState;
}

export interface MemoryBudgetStore extends BudgetStore {
  readonly kind: "memory";
  snapshot(): { day: string; spentMicros: number; calls: number; states: Record<MemoryState, number> };
  reset(): void;
}

export function createMemoryBudgetStore(): MemoryBudgetStore {
  let day = "";
  let spent = 0;
  let calls = 0;
  let users = new Map<string, number>();
  let seq = 0;
  const reservations = new Map<string, MemoryReservation>();

  function roll(now: number) {
    const today = new Date(now).toISOString().slice(0, 10);
    if (day !== today) {
      day = today;
      spent = 0;
      calls = 0;
      users = new Map();
      reservations.clear();
    }
  }

  return {
    kind: "memory",
    async reserve(userKey, now, config) {
      roll(now);
      const reserve = worstCaseMicros(config);
      const budget = toMicros(config.dailyBudgetUsd);
      if (userKey && (users.get(userKey) ?? 0) >= config.perUserDailyCalls) return null;
      if (spent + reserve > budget) return null;
      if (userKey) users.set(userKey, (users.get(userKey) ?? 0) + 1);
      spent += reserve;
      calls += 1;
      const id = `m${++seq}`;
      reservations.set(id, { day, userKey, micros: reserve, state: "reserved" });
      return { id, reservedMicros: reserve };
    },
    async settle(reservation, usage, config) {
      const r = reservations.get(reservation.id);
      if (!r || r.state !== "reserved") return null;
      const actual = usageMicros(usage, config, r.micros);
      spent = Math.max(0, spent - r.micros + actual);
      r.state = "settled";
      return actual;
    },
    async release(reservation) {
      const r = reservations.get(reservation.id);
      if (!r || r.state !== "reserved") return;
      spent = Math.max(0, spent - r.micros);
      calls = Math.max(0, calls - 1);
      if (r.userKey) users.set(r.userKey, Math.max(0, (users.get(r.userKey) ?? 1) - 1));
      r.state = "released";
    },
    async markUncertain(reservation) {
      const r = reservations.get(reservation.id);
      if (r && r.state === "reserved") r.state = "uncertain";
    },
    async lateSettle(reservation, usage, config) {
      const r = reservations.get(reservation.id);
      if (!r || r.state !== "uncertain") return;
      const actual = usageMicros(usage, config, r.micros);
      spent = Math.max(0, spent - r.micros + actual);
      r.state = "settled";
    },
    snapshot() {
      const states: Record<MemoryState, number> = { reserved: 0, settled: 0, uncertain: 0, released: 0 };
      for (const r of reservations.values()) states[r.state] += 1;
      return { day, spentMicros: spent, calls, states };
    },
    reset() {
      day = "";
      spent = 0;
      calls = 0;
      users = new Map();
      reservations.clear();
    },
  };
}

// ───────────────────────── SQL (produção) ─────────────────────────

export type RpcResult = { data: unknown; error: { message: string } | null };
export type RpcFn = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contadores no Postgres do ACC. Qualquer erro de infraestrutura vira BudgetUnavailableError (fail closed). */
export function createSqlBudgetStore(rpc: RpcFn): BudgetStore {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    let result: RpcResult;
    try {
      result = await rpc(fn, args);
    } catch {
      throw new BudgetUnavailableError(`orçamento da AXIA indisponível (${fn}: falha de conexão)`);
    }
    if (result.error) throw new BudgetUnavailableError(`orçamento da AXIA indisponível (${fn}: ${result.error.message.slice(0, 80)})`);
    return result.data;
  }
  return {
    kind: "sql",
    async reserve(userKey, _now, config) {
      const reserve = worstCaseMicros(config);
      const data = await call("axia_chat_reserve", {
        p_user: userKey && UUID_RE.test(userKey) ? userKey : null,
        p_reserve_micros: reserve,
        p_daily_budget_micros: toMicros(config.dailyBudgetUsd),
        p_user_daily_calls: config.perUserDailyCalls,
      });
      return typeof data === "string" && UUID_RE.test(data) ? { id: data, reservedMicros: reserve } : null;
    },
    async settle(reservation, usage, config) {
      const actual = usageMicros(usage, config, reservation.reservedMicros);
      const data = await call("axia_chat_settle", { p_id: reservation.id, p_actual_micros: actual });
      return data === null || data === undefined ? null : actual;
    },
    async release(reservation) {
      await call("axia_chat_release", { p_id: reservation.id });
    },
    async markUncertain(reservation) {
      await call("axia_chat_mark_uncertain", { p_id: reservation.id });
    },
    async lateSettle(reservation, usage, config) {
      await call("axia_chat_late_settle", { p_id: reservation.id, p_actual_micros: usageMicros(usage, config, reservation.reservedMicros) });
    },
  };
}

// ───────────────────────── seleção do armazenamento ─────────────────────────

let defaultMemoryStore: MemoryBudgetStore | null = null;
export function getDefaultMemoryStore(): MemoryBudgetStore {
  if (!defaultMemoryStore) defaultMemoryStore = createMemoryBudgetStore();
  return defaultMemoryStore;
}

let sqlStore: BudgetStore | null = null;

/**
 * Armazenamento do orçamento para o modo do provedor:
 *   anthropic -> SQL (global e concorrente) usando o cliente de serviço do servidor; sem configuração do banco devolve null
 *                (a IA não é chamada). NUNCA cai para memória: memória não é teto global.
 *   simulated -> memória (não há custo real).
 * O cliente de serviço é criado A CADA chamada ao banco (barato): uma troca da SUPABASE_SECRET_KEY vale na hora, sem cache
 * de credencial antiga.
 */
export async function resolveBudgetStore(mode: "anthropic" | "simulated", env: Env = process.env): Promise<BudgetStore | null> {
  if (mode === "simulated") return getDefaultMemoryStore();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.warn("[axia-conversa] orçamento global indisponível: banco de serviço não configurado; IA não será chamada.");
    return null;
  }
  if (!sqlStore) {
    sqlStore = createSqlBudgetStore(async (fn, args) => {
      const { createSupabaseAdminClient } = await import("@axion/db/admin");
      return (await createSupabaseAdminClient().rpc(fn, args)) as unknown as RpcResult;
    });
  }
  return sqlStore;
}

export function resetSqlBudgetStoreCache() {
  sqlStore = null;
}
