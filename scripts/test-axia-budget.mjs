// Controle financeiro da conversa com IA da AXIA (PR #135 — pendências 1, 2 e 3):
//   1. orçamento GLOBAL e CONCORRENTE: migration 20261105150000 executada em PostgreSQL de verdade (PGlite) com dezenas de
//      reservas simultâneas, mais a mesma interface em memória;
//   2. contabilidade CONSERVADORA em timeout / resultado incerto / conclusão tardia;
//   3. cache do provedor com invalidação por rotação de credencial, sem vazar a chave.
// Sem rede e sem custo; nenhum banco real é tocado.
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { createLocalDb } from "./lib/pglite-supabase-stub.mjs";
register("./ts-module-resolver.mjs", import.meta.url);
const budget = await import("../apps/web/lib/assistant/chat-budget");
const orch = await import("../apps/web/lib/assistant/chat-orchestrator");
const provMod = await import("../apps/web/lib/assistant/chat-provider");
const cfgMod = await import("../apps/web/lib/assistant/chat-config");

let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P1 = "11111111-1111-4111-8111-111111111111";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.parse("2026-11-05T12:00:00Z");
const CFG = budget.loadBudgetConfig({});
const WORST = budget.worstCaseMicros(CFG); // US$ 0,000975 = 975 micro-dólares no padrão Haiku 5.5

// ───────────────────────── 0. números básicos ─────────────────────────
t("pior caso por chamada = 975 micro-dólares (8.000 entrada + 350 saída a US$ 0,10/0,50 por MTok)", WORST === 975);
t("arredondamento sempre para cima (nunca subestima)", budget.toMicros(0.0000001) === 1 && budget.toMicros(0.000675) === 675 && budget.toMicros(0.0000004) === 1);

// ───────────────────────── 1. memória: semântica ─────────────────────────
{
  const m = budget.createMemoryBudgetStore();
  const cfg = budget.loadBudgetConfig({ AXIA_CHAT_DAILY_BUDGET_USD: "0.002", AXIA_CHAT_USER_DAILY_CALLS: "2" });
  const r1 = await m.reserve("ana", NOW, cfg);
  const r2 = await m.reserve("ana", NOW, cfg);
  const r3 = await m.reserve("ana", NOW, cfg);
  t("memória: limite por usuário (3ª chamada de 'ana' negada)", !!r1 && !!r2 && r3 === null);
  await m.settle(r1, { inputTokens: 3400, outputTokens: 120 }, cfg);
  t("memória: settle troca a reserva pelo custo real (3.400/120 = 400 micros)", m.snapshot().spentMicros === budget.worstCaseMicros(cfg) + 400);
  await m.release(r2);
  t("memória: release devolve reserva e a chamada do usuário", m.snapshot().spentMicros === 400 && !!(await m.reserve("ana", NOW, cfg)));
}

// ───────────────────────── 2. SQL: migration em PostgreSQL de verdade ─────────────────────────
const MIGRATION = "20261105150000_axia_chat_budget.sql";
// A migration roda DEPOIS dos privilégios padrão do Supabase (que dão acesso a anon/authenticated a tabelas novas): é a ordem real
// em produção, e a migration precisa revogar esse acesso.
const db = await createLocalDb([]);
// A migration roda como um DONO SEM BYPASSRLS (pior caso do Supabase): as funções SECURITY DEFINER precisam funcionar mesmo assim.
await db.exec("create role mig_owner nologin; grant create, usage on schema public to mig_owner; grant usage on schema auth to mig_owner;");
await db.exec("set role mig_owner");
await db.exec(readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), "utf8"));
await db.exec("reset role");
await db.exec("set role service_role");
const rpc = async (fn, args) => {
  const names = Object.keys(args);
  const params = names.map((_, i) => `$${i + 1}`);
  const cast = { p_user: "uuid", p_id: "uuid", p_reserve_micros: "bigint", p_daily_budget_micros: "bigint", p_actual_micros: "bigint", p_user_daily_calls: "integer" };
  try {
    const res = await db.query(`select public.${fn}(${names.map((n, i) => `${params[i]}::${cast[n]}`).join(", ")}) as v`, names.map((n) => args[n]));
    return { data: res.rows[0].v, error: null };
  } catch (e) {
    return { data: null, error: { message: String(e.message) } };
  }
};
const sql = budget.createSqlBudgetStore(rpc);
const q = async (text, params = []) => (await db.query(text, params)).rows;
const wipe = async () => { await db.exec("reset role"); await db.exec("truncate public.axia_chat_reservations, public.axia_chat_budget_day, public.axia_chat_budget_user_day"); await db.exec("set role service_role"); };
const day = async () => (await q("select spent_micros::int as spent, calls from public.axia_chat_budget_day order by day desc limit 1"))[0];

{
  // 40 reservas cabem no teto; 300 pedidos simultâneos de 30 usuários, 3 chamadas por usuário
  const per = 3;
  const cfg = budget.loadBudgetConfig({ AXIA_CHAT_DAILY_BUDGET_USD: String((WORST * 40) / 1e6), AXIA_CHAT_USER_DAILY_CALLS: String(per) });
  const jobs = Array.from({ length: 300 }, (_, i) => sql.reserve(U(1 + (i % 30)), NOW, cfg));
  const results = await Promise.all(jobs);
  const granted = results.filter(Boolean).length;
  const d = await day();
  const users = await q("select user_id, calls from public.axia_chat_budget_user_day");
  t("SQL concorrente: 300 pedidos simultâneos → exatamente 40 reservas concedidas (teto global)", granted === 40);
  t("SQL concorrente: gasto reservado ≤ teto e igual a 40 × pior caso", d.spent === 40 * WORST && d.spent <= budget.toMicros(cfg.dailyBudgetUsd) && d.calls === 40);
  t("SQL concorrente: nenhum usuário passa de 3 chamadas e a soma por usuário = total global", users.every((u) => u.calls <= per) && users.reduce((a, u) => a + u.calls, 0) === 40);
  t("SQL concorrente: sem reserva duplicada (ids únicos) e 40 linhas de reserva", new Set(results.filter(Boolean).map((r) => r.id)).size === 40 && (await q("select count(*)::int c from public.axia_chat_reservations"))[0].c === 40);
}
await wipe();

{
  // negado por usuário não consome o teto global (compensação) e negado por teto não consome a chamada do usuário
  const cfgU = budget.loadBudgetConfig({ AXIA_CHAT_USER_DAILY_CALLS: "1" });
  const a = await sql.reserve(U(1), NOW, cfgU);
  const b = await sql.reserve(U(1), NOW, cfgU);
  t("SQL: segunda chamada do mesmo usuário negada sem consumir o teto global", !!a && b === null && (await day()).spent === WORST);
  const cfgG = budget.loadBudgetConfig({ AXIA_CHAT_DAILY_BUDGET_USD: String((WORST * 1) / 1e6), AXIA_CHAT_USER_DAILY_CALLS: "5" });
  const c = await sql.reserve(U(2), NOW, cfgG); // teto já ocupado por 'a'
  const uc = (await q("select calls from public.axia_chat_budget_user_day where user_id = $1", [U(2)]))[0];
  t("SQL: negada por teto global desfaz a chamada do usuário (compensação)", c === null && (!uc || uc.calls === 0));
}
await wipe();

{
  // settle / release / uncertain / late_settle / idempotência / concorrência de settle
  const r = await sql.reserve(U(1), NOW, CFG);
  const applied = await Promise.all(Array.from({ length: 10 }, () => sql.settle(r, { inputTokens: 3400, outputTokens: 120 }, CFG)));
  t("SQL: settle idempotente — 10 settles simultâneos aplicam UMA vez (400 micros)", applied.filter((x) => x !== null).length === 1 && (await day()).spent === 400);
  const r2 = await sql.reserve(U(1), NOW, CFG);
  await sql.release(r2);
  await sql.release(r2);
  const dd = await day();
  t("SQL: release só uma vez e devolve reserva + chamada", dd.spent === 400 && dd.calls === 1 && (await q("select calls from public.axia_chat_budget_user_day where user_id=$1", [U(1)]))[0].calls === 1);
  const r3 = await sql.reserve(U(1), NOW, CFG);
  await sql.markUncertain(r3);
  await sql.release(r3);
  t("SQL: incerta NÃO pode ser devolvida (release ignora) — pior caso permanece no total", (await day()).spent === 400 + WORST && (await q("select state from public.axia_chat_reservations where id=$1", [r3.id]))[0].state === "uncertain");
  await sql.lateSettle(r3, { inputTokens: 3000, outputTokens: 80 }, CFG);
  await sql.lateSettle(r3, { inputTokens: 1, outputTokens: 1 }, CFG);
  t("SQL: conclusão tardia ajusta o total UMA vez (do pior caso para o real 340)", (await day()).spent === 400 + 340 && (await q("select state from public.axia_chat_reservations where id=$1", [r3.id]))[0].state === "settled");
  const rBig = await sql.reserve(U(3), NOW, CFG);
  await sql.markUncertain(rBig);
  await sql.lateSettle(rBig, { inputTokens: 9000, outputTokens: 400 }, CFG);
  t("SQL: se o custo tardio exceder o pior caso, o total sobe (nunca subestima)", (await day()).spent === 400 + 340 + budget.toMicros(budget.costUsd(9000, 400, CFG)));
  // reconcile: reservas paradas viram incertas (o pior caso já está no total)
  const rStale = await sql.reserve(U(4), NOW, CFG);
  await q("update public.axia_chat_reservations set created_at = now() - interval '20 minutes' where id=$1", [rStale.id]);
  const before = (await day()).spent;
  const rec = (await rpc("axia_chat_reconcile", {})).data;
  t("SQL: reconcile converte reserva parada em incerta sem mudar o total", rec === 1 && (await day()).spent === before && (await q("select state from public.axia_chat_reservations where id=$1", [rStale.id]))[0].state === "uncertain");
}
await wipe();

{
  // expiração: o dia seguinte começa zerado
  const cfg = budget.loadBudgetConfig({ AXIA_CHAT_DAILY_BUDGET_USD: String((WORST * 2) / 1e6) });
  await sql.reserve(U(1), NOW, cfg);
  await sql.reserve(U(2), NOW, cfg);
  const full = await sql.reserve(U(3), NOW, cfg);
  await q("update public.axia_chat_budget_day set day = day - 1");
  const next = await sql.reserve(U(3), NOW, cfg);
  t("SQL: teto cheio nega; no dia seguinte (UTC) o contador recomeça", full === null && !!next);
}

{
  // segurança: só service_role; sem acesso de anon/authenticated às tabelas e funções
  await db.exec("reset role");
  let denied = 0;
  for (const role of ["anon", "authenticated"]) {
    for (const stmt of ["select * from public.axia_chat_budget_day", "select * from public.axia_chat_reservations", "select public.axia_chat_reserve(null, 1, 1, 1)", "select public.axia_chat_release(gen_random_uuid())", "select public.axia_chat_settle(gen_random_uuid(), 0)"]) {
      await db.exec(`set role ${role}`);
      try { await db.query(stmt); } catch (e) { if (/permission denied/i.test(String(e.message))) denied += 1; }
      await db.exec("reset role");
    }
  }
  t("segurança: anon e authenticated NÃO leem as tabelas nem executam as funções (10/10 negados)", denied === 10);
  await db.exec("set role service_role");
  const mig = readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), "utf8");
  t("migration: RLS ligada (sem FORCE, que quebraria o dono sem BYPASSRLS), SECURITY DEFINER com search_path vazio, sem alterar tabelas existentes", (mig.match(/enable row level security/g) ?? []).length === 3 && !/force row level security;/.test(mig.replace(/--.*$/gm, "")) && (mig.match(/security definer/g) ?? []).length === 6 && (mig.match(/set search_path = ''/g) ?? []).length === 6 && !/alter table public\.(projects|profiles|project_memberships|contract)/.test(mig));
  t("migration: não guarda pergunta, resposta nem e-mail (só uuid do usuário e valores)", !/question|response|email|texto|message/i.test(mig.replace(/--.*$/gm, "").replace(/raise exception '[^']*'/g, "")));
}

// ───────────────────────── 3. fail closed ─────────────────────────
{
  const calls = { n: 0 };
  const prov = { id: "anthropic", model: "m", plan: async () => { calls.n++; return { raw: { intent: "unclear", entry_ids: [] }, usage: { inputTokens: 1, outputTokens: 1 } }; } };
  orch.resetChatCircuit();
  const down = budget.createSqlBudgetStore(async () => ({ data: null, error: { message: 'relation "public.axia_chat_budget_day" does not exist' } }));
  const a1 = await orch.converse({ question: "como envio documentos", projectId: P1, env: {}, provider: prov, budgetStore: down, userKey: U(1) });
  t("migration ausente / banco fora: a IA NÃO é chamada (fail closed) e a AXIA responde pela base", calls.n === 0 && a1.entryId === "documentos" && a1.via === "base");
  const thrown = budget.createSqlBudgetStore(async () => { throw new Error("ECONNRESET"); });
  const a2 = await orch.converse({ question: "como envio documentos", projectId: P1, env: {}, provider: prov, budgetStore: thrown, userKey: U(1) });
  t("queda de conexão com o banco: a IA NÃO é chamada", calls.n === 0 && a2.via === "base");
  const a3 = await orch.converse({ question: "como envio documentos", projectId: P1, env: {}, provider: prov, budgetStore: null, userKey: U(1) });
  t("sem armazenamento de orçamento: a IA NÃO é chamada", calls.n === 0 && a3.via === "base");
  t("modo anthropic sem banco de serviço configurado: resolveBudgetStore devolve null (nunca memória)", (await budget.resolveBudgetStore("anthropic", {})) === null);
  t("simulador usa memória (sem custo real)", (await budget.resolveBudgetStore("simulated", {})).kind === "memory");
}

// ───────────────────────── 4. contabilidade em timeout / incerteza (orquestrador) ─────────────────────────
const asked = (store, provider, extra = {}) => orch.converse({ question: "algo estranho aqui", projectId: P1, env: {}, provider, budgetStore: store, userKey: U(7), now: NOW, ...extra });
const usageOK = { inputTokens: 3400, outputTokens: 120 };
const ok400 = { id: "anthropic", model: "m", plan: async () => ({ raw: { intent: "unclear", entry_ids: [] }, usage: usageOK }) };

for (const kind of ["memória", "SQL"]) {
  const mkStore = async () => {
    if (kind === "memória") { const m = budget.createMemoryBudgetStore(); return { store: m, spent: async () => m.snapshot().spentMicros, calls: async () => m.snapshot().calls }; }
    await wipe();
    return { store: sql, spent: async () => ((await day())?.spent ?? 0), calls: async () => ((await day())?.calls ?? 0) };
  };
  const T = (n, c) => t(`[${kind}] ${n}`, c);

  let s = await mkStore();
  orch.resetChatCircuit();
  await asked(s.store, ok400);
  T("sucesso: reserva trocada pelo custo real (400 micros)", (await s.spent()) === 400);

  s = await mkStore(); orch.resetChatCircuit();
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => ({ raw: { intent: "unclear", entry_ids: [] }, usage: null }) });
  T("sucesso sem 'usage': mantém o pior caso (nunca subestima)", (await s.spent()) === WORST);

  s = await mkStore(); orch.resetChatCircuit();
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => { throw new provMod.ChatProviderError("rejeitado", "not_charged"); } });
  T("pedido rejeitado antes de executar (not_charged): reserva e chamada devolvidas", (await s.spent()) === 0 && (await s.calls()) === 0);

  s = await mkStore(); orch.resetChatCircuit();
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => { throw new provMod.ChatProviderError("truncada", "charged", { inputTokens: 3400, outputTokens: 350 }); } });
  T("resposta truncada/recusada (charged): cobra os tokens reais, não devolve", (await s.spent()) === budget.toMicros(budget.costUsd(3400, 350, CFG)) && (await s.calls()) === 1);

  s = await mkStore(); orch.resetChatCircuit();
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => { throw new provMod.ChatProviderError("timeout", "uncertain"); } });
  T("TIMEOUT sem conclusão: o pior caso PERMANECE (não libera orçamento de chamada incerta)", (await s.spent()) === WORST && (await s.calls()) === 1);

  s = await mkStore(); orch.resetChatCircuit();
  let resolveLate;
  const late = new Promise((r) => { resolveLate = r; });
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => { throw new provMod.ChatProviderError("timeout", "uncertain", null, late); } });
  const during = await s.spent();
  resolveLate({ inputTokens: 3000, outputTokens: 80 });
  await sleep(60);
  T("timeout + conclusão tardia: mantém o pior caso até os tokens reais chegarem e então ajusta (340 micros)", during === WORST && (await s.spent()) === 340);

  s = await mkStore(); orch.resetChatCircuit();
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => { throw new Error("erro desconhecido"); } });
  T("erro desconhecido é tratado como incerto (pior caso permanece)", (await s.spent()) === WORST);

  // incerteza consome orçamento de verdade: com teto de 2 pior-casos, duas incertas bloqueiam a terceira
  s = await mkStore(); orch.resetChatCircuit();
  const env2 = { AXIA_CHAT_DAILY_BUDGET_USD: String((WORST * 2) / 1e6) };
  const flaky = { id: "anthropic", model: "m", plan: async () => { throw new provMod.ChatProviderError("timeout", "uncertain"); } };
  await asked(s.store, flaky, { env: env2 });
  orch.resetChatCircuit();
  await asked(s.store, flaky, { env: env2, userKey: U(8) });
  orch.resetChatCircuit();
  let called = 0;
  await asked(s.store, { id: "anthropic", model: "m", plan: async () => { called++; return { raw: { intent: "unclear", entry_ids: [] }, usage: usageOK }; } }, { env: env2, userKey: U(9) });
  T("duas chamadas incertas esgotam o teto: a terceira não chama a IA (gasto potencial já reservado)", called === 0);
}

// ───────────────────────── 5. provedor Anthropic real (cliente falso) ─────────────────────────
{
  const mk = (impl, timeoutMs = 40) => provMod.createAnthropicChatProvider({ apiKey: "k", model: "claude-haiku-5-5" }, { messages: { create: impl } }, { timeoutMs });
  const okMsg = (u = { input_tokens: 3000, output_tokens: 80 }) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "plano_conversa", input: { intent: "unclear", entry_ids: [], greeting: null, social_reply: null, clarifying_question: null } }], usage: u });

  let err = null;
  const slow = mk(() => new Promise((resolve) => setTimeout(() => resolve(okMsg()), 120)));
  try { await slow.plan({ system: "s", user: "u", question: "q", history: [] }); } catch (e) { err = e; }
  const lateUsage = err?.late ? await err.late : null;
  t("timeout real: erro 'uncertain' e a conclusão tardia entrega os tokens reais", err?.name === "ChatProviderError" && err.outcome === "uncertain" && lateUsage?.inputTokens === 3000);

  const classify = async (e) => { try { await mk(() => Promise.reject(e)).plan({ system: "s", user: "u", question: "q", history: [] }); } catch (x) { return x.outcome; } return "ok"; };
  t("HTTP 429/400/401 → not_charged (devolve)", (await classify({ status: 429 })) === "not_charged" && (await classify({ status: 400 })) === "not_charged" && (await classify({ status: 401 })) === "not_charged");
  t("HTTP 500/529, queda de rede e erro sem status → uncertain (mantém)", (await classify({ status: 500 })) === "uncertain" && (await classify({ status: 529 })) === "uncertain" && (await classify(new Error("ECONNRESET"))) === "uncertain");
  const trunc = mk(async () => ({ stop_reason: "max_tokens", content: [], usage: { input_tokens: 3400, output_tokens: 350 } }));
  let te = null;
  try { await trunc.plan({ system: "s", user: "u", question: "q", history: [] }); } catch (e) { te = e; }
  t("resposta truncada → charged com os tokens", te?.outcome === "charged" && te.usage.outputTokens === 350);
  const noTool = mk(async () => ({ stop_reason: "end_turn", content: [{ type: "text" }], usage: { input_tokens: 3400, output_tokens: 10 } }));
  let ne = null;
  try { await noTool.plan({ system: "s", user: "u", question: "q", history: [] }); } catch (e) { ne = e; }
  t("sem plano estruturado → charged (houve resposta)", ne?.outcome === "charged");
}

// ───────────────────────── 6. cache do provedor e rotação de credencial ─────────────────────────
{
  orch.resetProviderCache();
  const logs = [];
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
  const made = [];
  const create = (config) => { const p = { id: "anthropic", model: config.model, plan: async () => ({ raw: null, usage: null }) }; made.push({ config, p }); return p; };
  const KEY1 = "chave-de-teste-ROTACAO-UM-aaaaaaaaaaaa";
  const KEY2 = "chave-de-teste-ROTACAO-DOIS-bbbbbbbbbbb";
  const E = (k, m = "claude-haiku-5-5") => ({ AXIA_CHAT_PROVIDER: "anthropic", ANTHROPIC_API_KEY: k, AXIA_CHAT_MODEL: m });
  const p1 = orch.resolveChatProvider(E(KEY1), create);
  const p1b = orch.resolveChatProvider(E(KEY1), create);
  const p2 = orch.resolveChatProvider(E(KEY2), create);
  const p2b = orch.resolveChatProvider(E(KEY2), create);
  const p3 = orch.resolveChatProvider(E(KEY2, "claude-haiku-5-5-x"), create);
  const back = orch.resolveChatProvider(E(KEY1), create);
  const off = orch.resolveChatProvider({ AXIA_CHAT_PROVIDER: "off" }, create);
  const again = orch.resolveChatProvider(E(KEY2), create);
  Object.assign(console, orig);
  t("cache: mesma credencial e modelo reaproveitam o provedor", p1 === p1b && p2 === p2b);
  t("ROTAÇÃO: nova ANTHROPIC_API_KEY no mesmo processo recria o provedor com a chave nova", p2 !== p1 && made[1].config.apiKey === KEY2 && made.length >= 3);
  t("troca de modelo também invalida o cache", p3 !== p2 && made.some((m) => m.config.model === "claude-haiku-5-5-x"));
  t("voltar à chave antiga cria de novo (não reaproveita provedor da chave descartada)", back !== p1 && back.model === "claude-haiku-5-5");
  t("desligar (off) descarta o provedor e a credencial em memória; religar recria", off === null && again !== p2);
  t("a chave e a impressão digital NUNCA aparecem em log", !logs.some((l) => l.includes(KEY1) || l.includes(KEY2) || l.includes("ROTACAO") || l.includes(cfgMod.credentialFingerprint(KEY1)) || l.includes(cfgMod.credentialFingerprint(KEY2))));
  t("impressão digital: estável, diferente por chave, não contém a chave", cfgMod.credentialFingerprint(KEY1) === cfgMod.credentialFingerprint(KEY1) && cfgMod.credentialFingerprint(KEY1) !== cfgMod.credentialFingerprint(KEY2) && !cfgMod.credentialFingerprint(KEY1).includes("ROTACAO") && cfgMod.credentialFingerprint(KEY1).length === 16);
  const key = orch.providerCacheKey(cfgMod.loadAxiaChatConfig(E(KEY1)));
  t("a chave do cache não contém a credencial", !key.includes(KEY1) && !key.includes("sk-ant"));
  orch.resetProviderCache();
}

// ───────────────────────── 7. concorrência ponta a ponta (orquestrador + SQL) ─────────────────────────
{
  await wipe();
  let inFlight = 0, maxInFlight = 0, calls = 0;
  const prov = { id: "anthropic", model: "m", plan: async () => { calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await sleep(5); inFlight--; return { raw: { intent: "unclear", entry_ids: [] }, usage: null }; } };
  const env = { AXIA_CHAT_DAILY_BUDGET_USD: String((WORST * 25) / 1e6), AXIA_CHAT_USER_DAILY_CALLS: "100" };
  orch.resetChatCircuit();
  const answers = await Promise.all(Array.from({ length: 200 }, (_, i) => orch.converse({ question: `algo estranho aqui ${i}`, projectId: P1, env, provider: prov, budgetStore: sql, userKey: U(1 + (i % 20)), now: NOW })));
  const d = await day();
  t("200 conversas simultâneas contra um teto de 25 reservas: só 25 chamadas à IA, as outras 175 pela base", calls === 25 && answers.filter((a) => a.via === "ia").length === 25 && answers.filter((a) => a.via === "base").length === 175);
  t("gasto final = 25 × pior caso (sem usage a reserva permanece) e nunca passou do teto; há execuções realmente simultâneas", d.spent === 25 * WORST && d.spent <= budget.toMicros((WORST * 25) / 1e6) && maxInFlight > 1);
}

console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
