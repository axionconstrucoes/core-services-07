// Piloto restrito da IA da AXIA: só administradores usam a conversa com IA (AXIA_CHAT_ACCESS=admins, padrão); os demais
// seguem exatamente no Q&A determinístico. Sem rede.
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const acc = await import("../apps/web/lib/assistant/chat-access");
const { converse, resetChatCircuit } = await import("../apps/web/lib/assistant/chat-orchestrator");
const budget = await import("../apps/web/lib/assistant/chat-budget");
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const ROWS = [
  { user_id: "adm", project_id: A, permission: "ADMINISTRADOR", status: "ACTIVE" },
  { user_id: "adm", project_id: B, permission: "COLABORADOR", status: "ACTIVE" },
  { user_id: "ger", project_id: A, permission: "GERENTE", status: "ACTIVE" },
  { user_id: "col", project_id: A, permission: "COLABORADOR", status: "ACTIVE" },
  { user_id: "lei", project_id: A, permission: "LEITURA", status: "ACTIVE" },
  { user_id: "ex", project_id: A, permission: "ADMINISTRADOR", status: "INACTIVE" },
];
// leitor simulado da SESSÃO (cada .eq filtra; a RLS real é do banco)
function reader(rows = ROWS, fail = false) {
  return {
    from() {
      return {
        select() {
          let filtered = rows;
          const chain = {
            eq(c, v) { filtered = filtered.filter((r) => r[c] === v); return chain; },
            then(res, rej) { return (fail ? Promise.resolve({ data: null, error: { message: "x" } }) : Promise.resolve({ data: filtered, error: null })).then(res, rej); },
          };
          return chain;
        },
      };
    },
  };
}
const el = (u, p, env = {}) => acc.isAxiaChatEligible(reader(), u, p, env);

t("padrão = admins; valor desconhecido = admins (fail closed); 'all' libera", acc.loadAxiaChatAccess({}) === "admins" && acc.loadAxiaChatAccess({ AXIA_CHAT_ACCESS: "qualquer" }) === "admins" && acc.loadAxiaChatAccess({ AXIA_CHAT_ACCESS: " ALL " }) === "all");
t("administrador ativo da obra é elegível", (await el("adm", A)) === true);
t("administrador de OUTRA obra não é elegível nesta (perfil COLABORADOR aqui)", (await el("adm", B)) === false);
t("gerente, colaborador e leitura NÃO são elegíveis", (await el("ger", A)) === false && (await el("col", A)) === false && (await el("lei", A)) === false);
t("administrador inativo não é elegível", (await el("ex", A)) === false);
t("quem não participa da obra não é elegível", (await el("estranho", A)) === false);
t("seleção de projetos: administrador de alguma obra é elegível; os demais não", (await el("adm", null)) === true && (await el("col", null)) === false && (await el("estranho", null)) === false);
t("erro de leitura = não elegível (fail closed)", (await acc.isAxiaChatEligible(reader(ROWS, true), "adm", A, {})) === false);
t("exceção na leitura = não elegível", (await acc.isAxiaChatEligible({ from() { throw new Error("boom"); } }, "adm", A, {})) === false);
t("modo 'all': todos elegíveis, sem consultar permissões", (await acc.isAxiaChatEligible({ from() { throw new Error("não deveria consultar"); } }, "col", A, { AXIA_CHAT_ACCESS: "all" })) === true);

// efeito no orquestrador: não elegível (aiAllowed=false) → mesma resposta determinística, sem chamar a IA nem o orçamento
resetChatCircuit();
const store = budget.createMemoryBudgetStore();
let calls = 0;
const prov = { id: "anthropic", model: "m", plan: async () => { calls++; return { raw: { intent: "unclear", entry_ids: [] }, usage: { inputTokens: 3400, outputTokens: 120 } }; } };
const nonAdmin = await converse({ question: "como envio documetnos pro sistema", projectId: A, env: {}, provider: prov, budgetStore: store, aiAllowed: false, userKey: "col" });
t("não elegível: sem chamada à IA, sem reserva de orçamento, resposta determinística do Q&A", calls === 0 && store.snapshot().calls === 0 && nonAdmin.via === "base");
const social = await converse({ question: "Bom dia!", projectId: A, env: {}, provider: prov, budgetStore: store, aiAllowed: false, userKey: "col" });
t("não elegível: saudações básicas e Q&A aprovado seguem normais", calls === 0 && social.kind === "social" && (await converse({ question: "Como entro no ACC e escolho a obra?", projectId: A, env: {}, provider: prov, budgetStore: store, aiAllowed: false })).entryId === "qa-N2");
const admin = await converse({ question: "o botao verificar", projectId: A, env: {}, provider: prov, budgetStore: store, aiAllowed: true, userKey: "adm" });
t("elegível: a IA é chamada (uma vez) e o gasto é registrado", calls === 1 && store.snapshot().calls === 1 && admin.via === "ia");

// fiação das rotas
for (const f of ["apps/web/app/[projectId]/ajuda/assistente/route.ts", "apps/web/app/projetos/assistente/route.ts"]) {
  const r = rd(f);
  t(`${f.split("/").slice(-3, -1).join("/")}: elegibilidade lida com a SESSÃO (nunca o cliente de serviço) e aplicada antes do limite de IA`, r.includes("isAxiaChatEligible(supabase as unknown as MembershipReader") && r.includes("eligible && allowRequest(`ai:") && !r.includes("createSupabaseAdminClient"));
}
const mod = rd("apps/web/lib/assistant/chat-access.ts");
t("módulo de acesso não usa cliente de serviço nem escreve dados", !/createSupabaseAdminClient|SUPABASE_SECRET_KEY|\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(mod));
console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
