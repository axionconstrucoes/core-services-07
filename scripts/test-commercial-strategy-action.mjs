// Integração P4 × P3: a consulta estratégica do Diretor Comercial IA tem Server Action própria, com sessão do usuário
// (RLS) e limite de IA reservado ANTES do provedor; o ciclo de risco (sem sessão) não carrega o contexto comercial; a
// fundamentação (grounding) aceita como fonte só itens comerciais DISPONÍVEIS. Verificação estática, sem rede.
// Uso: node scripts/test-commercial-strategy-action.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log("OK  ", name);
  } catch (e) {
    failed += 1;
    console.log("FAIL", name, "->", String(e.message).split("\n")[0]);
  }
};

const action = read("apps/web/lib/ai/commercial-strategy-action.ts");
check("Server Action estratégica: permissão ativa, sessão do usuário e reserva EXPERT_PANEL do commercial-director ANTES do provedor", () => {
  assert.ok(action.startsWith('"use server";'));
  const perm = action.indexOf("getCurrentProjectPermission(projectId)");
  const reserve = action.indexOf('reserveAiConsult(supabase, projectId, "EXPERT_PANEL"');
  const call = action.indexOf("answerCommercialStrategyQuery(supabase");
  assert.ok(perm > 0 && reserve > perm && call > reserve, "ordem permissão → reserva → provedor");
  // Frente N6: pré-verificação somente leitura + reserva na fronteira do provedor (gatedProviderForExpert).
  assert.ok(action.includes("COMMERCIAL_DIRECTOR_EXPERT_ID") && action.includes("if (!precheck.ok) return"));
  assert.ok(action.includes("gatedProviderForExpert(COMMERCIAL_DIRECTOR_EXPERT_ID") && action.includes("}, provider);"));
  assert.ok(action.includes("createSupabaseServerClient()") && !action.includes("createSupabaseAdminClient"), "só a sessão do usuário");
});
check("ciclo de risco (sem sessão) consulta o Comercial sem carregar o contexto comercial", () => {
  assert.match(read("apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts"), /answerCommercialDirectorQuery\(supabase, request, provider, \{ includeCommercialContext: false \}\)/);
});
check("grounding: itens comerciais só contam como fonte quando DISPONÍVEIS e com valor", () => {
  const src = read("apps/web/lib/ai/grounding/build-grounding-source.ts");
  assert.ok(src.includes('item.availability === "DISPONIVEL" && item.value !== null'));
});

console.log(failed ? `\n${failed} FALHA(S)` : "\nTUDO OK");
process.exit(failed ? 1 : 0);
