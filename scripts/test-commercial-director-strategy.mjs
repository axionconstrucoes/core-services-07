// Testes do Diretor Comercial IA estratégico (P4) — somente providers
// fake/simulados, sem rede. Cobre: prompt com as seções e regras de
// governança; momento de abordagem; integração com Orçamentos (números só
// de fontes carregadas, dado ausente pedido a Orçamentos); recusa de
// autorizar desconto/assumir obrigação; separação fato/hipótese/
// recomendação; validação da resposta estruturada (CommercialStrategyBrief).
//
// Uso:
//   node --import ./scripts/lib/block-live-ai.mjs scripts/test-commercial-director-strategy.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { createFakeCommercialSupabase } from "./lib/fake-commercial-supabase.mjs";

register("./ts-module-resolver.mjs", import.meta.url);

const identity = await import("../apps/web/lib/ai/experts/commercial-director/identity.ts");
const { answerCommercialStrategyQuery } = await import("../apps/web/lib/ai/experts/commercial-director/strategy-query.ts");
const { validateCommercialStrategyBrief, findCommitmentViolations, TIMING_MOVES, COMMERCIAL_STRATEGY_MODES } = await import(
  "../apps/web/lib/ai/experts/commercial-director/strategy-schema.ts"
);
const { COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA } = await import(
  "../apps/web/lib/ai/experts/commercial-director/strategy-json-schema.ts"
);
const { deriveFakeCommercialStrategyBrief } = await import("../apps/web/lib/ai/experts/commercial-director/fake-strategy-brief.ts");
const { loadCommercialContext } = await import("../apps/web/lib/commercial/load-commercial-context.ts");
const { createFakeAiProvider } = await import("../apps/web/lib/ai/providers/fake-provider.ts");
const { ExpertAssessmentValidationError } = await import("../apps/web/lib/ai/schemas/validate-expert-assessment.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

function rejects(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ExpertAssessmentValidationError, `tipo inesperado: ${error.constructor.name}: ${error.message}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

const PROJECT = "proj-1";
const tables = {
  project_memberships: [{ project_id: PROJECT, user_id: "user-1", permission: "GERENTE", status: "ACTIVE", area: null }],
  projects: [{ id: PROJECT, code: "WEG-01", name: "Obra WEG", client: "Cliente X", contract_number: "CT-123", start_date: "2026-01-10", baseline_end_date: "2026-12-20" }],
  project_additional_proposals: [
    {
      id: "prop-1", project_id: PROJECT, proposal_number: "AD-01", title: "Reforço de fundação", status: "IN_NEGOTIATION",
      proposed_value: 152340.55, contracted_value: null, scope_approval_status: "APPROVED", commercial_approval_status: "PENDING",
      schedule_extension_status: "TO_BE_REQUESTED", formalization_type: null,
    },
  ],
  contract_changes: [
    { id: "cc-1", project_id: PROJECT, code: "ALT-03", title: "Mudança de traçado", status: "OPEN", client_formalization_status: "PENDING", schedule_impact_status: "EXTENSION_REQUIRED", technical_additional_days: 12 },
  ],
};

const supabase = createFakeCommercialSupabase({ tables });
const context = await loadCommercialContext(supabase, { projectId: PROJECT, now: () => new Date("2026-11-20T12:00:00Z") });
const proposedItem = context.items.find((i) => i.source?.field === "proposed_value");
const marginMarker = context.items.find((i) => i.key === "MARGEM_PREVISTA");

/** Contexto sintético COM base econômica (como seria após integração com Orçamentos). */
function contextWithEconomicBasis() {
  const items = context.items.map((item) =>
    item.key === "MARGEM_PREVISTA"
      ? { ...item, availability: "DISPONIVEL", value: 8.5, unit: "PERCENT", source: { table: "orcamentos_externo", recordId: "orc-1", field: "margem", locator: null } }
      : item
  );
  return { ...context, items, missingEconomicKeys: [] };
}

function minimalProjectContext() {
  return {
    projectId: PROJECT,
    project: { id: PROJECT, name: "Obra WEG", client: "Cliente X", status: "ATIVO", contractNumber: "CT-123" },
    events: [], eventsTotalCount: 0, esgObligations: [], esgObligationsTotalCount: 0, workspaceType: "OBRA",
    contractualDocuments: [], unreadableDocuments: [], omittedForBudget: [],
    documentCoverage: {},
  };
}

function spyProvider(output, providerId = "custom") {
  const requests = [];
  return {
    requests,
    provider: {
      id: providerId,
      async generateAssessment() { throw new Error("não usado"); },
      async consolidateExecutiveCuration() { throw new Error("não usado"); },
      async answerQuery(request) {
        requests.push(request);
        return { providerId, model: "modelo-simulado", output: typeof output === "function" ? output(request) : output };
      },
    },
  };
}

const runOptions = { loadProjectContext: async () => minimalProjectContext() };

function validBrief(overrides = {}) {
  return { ...deriveFakeCommercialStrategyBrief("Qual a estratégia?", "COMPLETO", context), ...overrides };
}

// --- 1. Prompt: seções obrigatórias e governança --------------------------

await check("prompt v5: missão estratégica, negociações em curso, momento, abordagem, integração com Orçamentos e modos", () => {
  assert.equal(identity.COMMERCIAL_DIRECTOR_VERSION, "v5");
  const text = identity.COMMERCIAL_DIRECTOR_INSTRUCTIONS;
  assert.ok(text.includes("(commercial-director v5)"));
  for (const heading of [
    "## Negociações em curso", "## Momento adequado", "## Abordagem", "## Integração Comercial × Orçamentos",
    "## Saídas estruturadas (modos)", "## Governança comercial",
  ]) assert.ok(text.includes(heading), `falta seção ${heading}`);
  for (const topic of [
    "Estágio da oportunidade", "Interesses e restrições do cliente", "Posição competitiva", "Decisores e interlocutores",
    "concessão e contrapartidas", "sequência negocial", "Riscos e alternativas", "Estratégia de fechamento",
    "NÃO substitui", "orçamento-base e revisões", "BDI", "margem prevista", "contingências", "produtividade",
    "alternativas de engenharia", "condições de contratação",
  ]) assert.ok(text.includes(topic), `falta tópico: ${topic}`);
  for (const mode of COMMERCIAL_STRATEGY_MODES.filter((m) => m !== "COMPLETO")) assert.ok(text.includes(mode), `modo ${mode} ausente do prompt`);
});

await check("prompt: regras de governança comercial explícitas", () => {
  const text = identity.COMMERCIAL_DIRECTOR_INSTRUCTIONS.replace(/\s+/g, " ");
  for (const rule of [
    "Nunca inventar margens, preços, custos, condições ou informações do cliente",
    "Nunca recomendar concessão como economicamente aceitável",
    "solicite a análise de Orçamentos explicitamente",
    "Nunca autorizar descontos, assumir obrigações ou concluir contratos",
    "Distinguir fatos, hipóteses, cenários, riscos e recomendações",
    "Citar a fonte de cada número",
    "Necessária definição humana.",
  ]) assert.ok(text.includes(rule), `regra ausente: ${rule}`);
  const strategy = identity.buildCommercialStrategyInstructions("MOMENTO_E_ABORDAGEM");
  assert.ok(strategy.startsWith(identity.COMMERCIAL_DIRECTOR_INSTRUCTIONS));
  assert.match(strategy, /modo MOMENTO_E_ABORDAGEM/);
});

// --- 2. Momento de abordagem ----------------------------------------------

await check("momento: cobre todos os movimentos pedidos e, sem base econômica, recomenda AGUARDAR_DADOS", () => {
  for (const move of [
    "APRESENTAR_DEMANDA", "PEDIR_REVISAO_PRECO", "PROPOR_ALTERNATIVA_TECNICA", "FORMALIZAR_PLEITO", "NEGOCIAR_ADITIVO",
    "PEDIR_CONTRAPARTIDAS", "APRESENTAR_PROPOSTA_FINAL", "ACELERAR_FECHAMENTO", "POSTERGAR_FECHAMENTO",
  ]) assert.ok(TIMING_MOVES.includes(move), move);
  const brief = validateCommercialStrategyBrief(deriveFakeCommercialStrategyBrief("Quando pedir revisão de preço?", "MOMENTO_E_ABORDAGEM", context), { commercialContext: context });
  assert.equal(brief.mode, "MOMENTO_E_ABORDAGEM");
  assert.equal(brief.momentoEAbordagem.movimentoRecomendado, "AGUARDAR_DADOS");
  assert.equal(brief.momentoEAbordagem.agoraOuAguardar, "AGUARDAR");
  assert.ok(brief.momentoEAbordagem.justificativa.length > 0);
  assert.equal(brief.diagnostico.estagioOportunidade, "EM_NEGOCIACAO", "estágio vem do status real da proposta");
  assert.ok(["BAIXA", "MEDIA", "ALTA", "INDEFINIDA"].includes(brief.diagnostico.maturidade.contratual));
});

await check("momento: com base econômica carregada, o mesmo derivador avança (não fica preso em aguardar)", () => {
  const rich = contextWithEconomicBasis();
  const brief = validateCommercialStrategyBrief(deriveFakeCommercialStrategyBrief("E agora?", "MOMENTO_E_ABORDAGEM", rich), { commercialContext: rich });
  assert.equal(brief.momentoEAbordagem.agoraOuAguardar, "AGORA");
});

// --- 3. Integração com Orçamentos -----------------------------------------

await check("integração: consulta estratégica (fake) envia contexto comercial + schema próprio ao provider e cita só números carregados", async () => {
  const fake = createFakeAiProvider();
  const requests = [];
  const spied = { ...fake, id: fake.id, generateAssessment: fake.generateAssessment, consolidateExecutiveCuration: fake.consolidateExecutiveCuration,
    async answerQuery(request) { requests.push(request); return fake.answerQuery(request); } };
  const result = await answerCommercialStrategyQuery(supabase, { projectId: PROJECT, question: "Como conduzir a negociação do AD-01?" }, spied, runOptions);
  assert.equal(result.audit.providerId, "fake");
  assert.equal(result.audit.expertVersion, "v5");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].outputSchema, COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA);
  assert.ok(requests[0].projectContext.commercialContext, "contexto comercial anexado ao contexto autorizado");
  assert.match(requests[0].instructions, /modo COMPLETO/);
  const loadedNumbers = new Map(result.commercialContext.items.filter((i) => typeof i.value === "number").map((i) => [i.id, i.value]));
  assert.ok(result.brief.numerosCitados.length > 0);
  for (const cited of result.brief.numerosCitados) assert.equal(loadedNumbers.get(cited.fonte), cited.valor, `número sem fonte: ${cited.fonte}`);
  assert.ok(result.brief.solicitacoesOrcamentos.some((s) => /Orçamentos/.test(s) && /Margem prevista/.test(s)));
  assert.ok(result.brief.cenariosConcessao.every((c) => c.aceitabilidadeEconomica !== "SUSTENTADA_PELOS_DADOS"));
  assert.ok(result.brief.informacoesFaltantes.some((s) => /BDI/.test(s)));
  assert.ok(supabase.calls.every((t) => !/insert|update|delete/.test(t)));
});

await check("integração: número que não veio do carregador (fonte inexistente ou valor diferente) é rejeitado", () => {
  rejects(() => validateCommercialStrategyBrief(validBrief({ numerosCitados: [{ valor: 500000, descricao: "Preço inventado", fonte: "COM-999" }] }), { commercialContext: context }), /não é um dado numérico DISPONIVEL/);
  rejects(() => validateCommercialStrategyBrief(validBrief({ numerosCitados: [{ valor: 160000, descricao: "Preço", fonte: proposedItem.id }] }), { commercialContext: context }), /diverge do valor carregado/);
  rejects(() => validateCommercialStrategyBrief(validBrief({ numerosCitados: [{ valor: 0, descricao: "Margem", fonte: marginMarker.id }] }), { commercialContext: context }), /não é um dado numérico DISPONIVEL/);
});

await check("integração: R$ ou % no texto sem número citado com fonte é rejeitado (margem/preço inventado)", () => {
  const base = validBrief();
  rejects(() => validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "RECOMENDACAO", texto: "Oferecer preço de R$ 140.000,00 ao cliente.", fonte: null }] }, { commercialContext: context }), /sem estar em numerosCitados/);
  rejects(() => validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "HIPOTESE", texto: "A margem deve ficar em 9,5%.", fonte: null }] }, { commercialContext: context }), /sem estar em numerosCitados/);
  // "12%" não é justificado pelos 12 dias carregados (unidade diferente)
  rejects(() => validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "HIPOTESE", texto: "Pedir reajuste de 12%.", fonte: null }] }, { commercialContext: context }), /mesma unidade/);
  // o mesmo valor, quando carregado e citado, é aceito
  const ok = validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "FATO", texto: "Preço proposto registrado: R$ 152.340,55.", fonte: proposedItem.id }] }, { commercialContext: context });
  assert.equal(ok.estrategiaRecomendada[0].fonte, proposedItem.id);
});

await check("integração: concessão 'economicamente aceitável' sem base econômica é rejeitada; faltando dados, pedido a Orçamentos é obrigatório", () => {
  const base = validBrief();
  const sustained = [{ descricao: "Reduzir preço", contrapartidaExigida: "Antecipar pagamento", aceitabilidadeEconomica: "SUSTENTADA_PELOS_DADOS", fontesEconomicas: [proposedItem.id], riscos: [] }];
  rejects(() => validateCommercialStrategyBrief({ ...base, cenariosConcessao: sustained }, { commercialContext: context }), /sem base econômica no ACC/);
  rejects(() => validateCommercialStrategyBrief({ ...base, solicitacoesOrcamentos: [] }, { commercialContext: context }), /solicitacoesOrcamentos deve pedir explicitamente/);
  // com base econômica carregada e fontes citadas, a avaliação é aceita
  const rich = contextWithEconomicBasis();
  const marginId = rich.items.find((i) => i.key === "MARGEM_PREVISTA").id;
  const accepted = validateCommercialStrategyBrief(
    { ...deriveFakeCommercialStrategyBrief("x", "CENARIOS_CONCESSAO", rich), cenariosConcessao: [{ ...sustained[0], fontesEconomicas: [marginId] }] },
    { commercialContext: rich }
  );
  assert.equal(accepted.cenariosConcessao[0].aceitabilidadeEconomica, "SUSTENTADA_PELOS_DADOS");
  rejects(() => validateCommercialStrategyBrief({ ...deriveFakeCommercialStrategyBrief("x", "COMPLETO", rich), cenariosConcessao: [{ ...sustained[0], fontesEconomicas: [] }] }, { commercialContext: rich }), /exige fontesEconomicas/);
});

// --- 4. Recusa de autorizar desconto / assumir obrigação --------------------

await check("recusa: textos que autorizam desconto, assumem obrigação ou concluem contrato são rejeitados (inclusive na minuta)", () => {
  const base = validBrief();
  for (const texto of [
    "Autorizamos o desconto solicitado pelo cliente.",
    "O desconto pedido pelo cliente fica autorizado.",
    "Fica aprovado o desconto sobre a medição.",
    "Desconto concedido conforme reunião.",
    "Assumimos o compromisso de concluir a obra antes do prazo.",
    "Com isso, o contrato está fechado.",
  ]) {
    assert.ok(findCommitmentViolations(texto).length > 0, `não detectou: ${texto}`);
    rejects(() => validateCommercialStrategyBrief({ ...base, condicoesRecomendadasFechamento: [{ tipo: "RECOMENDACAO", texto, fonte: null }] }, { commercialContext: context }), /governança comercial/);
  }
  rejects(
    () => validateCommercialStrategyBrief({ ...base, minuta: { type: "EMAIL", subject: null, body: "Prezados, concedemos o abatimento pedido.", status: "DRAFT_PENDING_REVIEW" } }, { commercialContext: context }),
    /governança comercial/
  );
});

await check("recusa: negativas e encaminhamento à aprovação humana são aceitos (sem falso positivo)", () => {
  for (const texto of [
    "Nenhum desconto está autorizado sem aprovação da Diretoria Comercial.",
    "Não assumimos o compromisso de prazo sem análise de Planejamento.",
    "Qualquer desconto depende de aprovação humana.",
  ]) assert.deepEqual(findCommitmentViolations(texto), [], texto);
});

await check("recusa: provider (simulado) que devolve desconto autorizado tem a resposta inteira rejeitada; minuta nunca 'enviada'", async () => {
  const bad = validBrief({ estrategiaRecomendada: [{ tipo: "RECOMENDACAO", texto: "O desconto foi aprovado pela AXION.", fonte: null }] });
  const { provider } = spyProvider(bad);
  await assert.rejects(answerCommercialStrategyQuery(supabase, { projectId: PROJECT, question: "Posso dar desconto?" }, provider, runOptions), /governança comercial/);
  const sent = validBrief({ minuta: { type: "EMAIL", subject: null, body: "Texto.", status: "SENT" } });
  rejects(() => validateCommercialStrategyBrief(sent, { commercialContext: context }), /DRAFT_PENDING_REVIEW/);
  rejects(() => validateCommercialStrategyBrief(validBrief({ decisoesAprovacaoHumana: [] }), { commercialContext: context }), /decisoesAprovacaoHumana/);
  rejects(() => validateCommercialStrategyBrief(validBrief({ requiresHumanReview: false }), { commercialContext: context }), /requiresHumanReview/);
});

// --- 5. Separação fato / hipótese / recomendação ----------------------------

await check("separação: FATO sem fonte ou apoiado em dado indisponível é rejeitado; HIPOTESE/RECOMENDACAO sem fonte são aceitas", () => {
  const base = validBrief();
  rejects(() => validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "FATO", texto: "O cliente tem pressa.", fonte: null }] }, { commercialContext: context }), /FATO sem fonte/);
  rejects(() => validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "FATO", texto: "Margem conhecida.", fonte: marginMarker.id }] }, { commercialContext: context }), /não está DISPONIVEL/);
  rejects(() => validateCommercialStrategyBrief({ ...base, estrategiaRecomendada: [{ tipo: "OPINIAO", texto: "x", fonte: null }] }, { commercialContext: context }), /tipo inválido/);
  const ok = validateCommercialStrategyBrief(
    { ...base, estrategiaRecomendada: [
      { tipo: "HIPOTESE", texto: "O cliente pode priorizar prazo.", fonte: null },
      { tipo: "CENARIO", texto: "Se o cliente recusar, propor alternativa técnica.", fonte: null },
      { tipo: "RISCO", texto: "Sem margem conhecida.", fonte: marginMarker.id },
      { tipo: "RECOMENDACAO", texto: "Pedir análise a Orçamentos.", fonte: null },
    ] },
    { commercialContext: context }
  );
  assert.deepEqual(ok.estrategiaRecomendada.map((s) => s.tipo), ["HIPOTESE", "CENARIO", "RISCO", "RECOMENDACAO"]);
});

await check("separação: no brief derivado, todo FATO tem fonte COM-n DISPONIVEL", () => {
  const brief = validateCommercialStrategyBrief(validBrief(), { commercialContext: context });
  const all = [...brief.estrategiaRecomendada, ...brief.impactos.economicos, ...brief.impactos.contratuais, ...brief.impactos.prazo];
  const facts = all.filter((s) => s.tipo === "FATO");
  assert.ok(facts.length > 0);
  for (const fact of facts) assert.equal(context.items.find((i) => i.id === fact.fonte)?.availability, "DISPONIVEL");
});

// --- 6. Resposta estruturada ------------------------------------------------

await check("estrutura: todas as saídas pedidas existem no brief e no JSON Schema (sem oneOf/anyOf — compatível com strict)", () => {
  const required = COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA.required;
  for (const key of [
    "diagnostico", "estrategiaRecomendada", "momentoEAbordagem", "cenariosConcessao", "impactos", "objecoesERespostas",
    "roteiroReunioes", "minuta", "condicoesRecomendadasFechamento", "decisoesAprovacaoHumana", "solicitacoesOrcamentos", "numerosCitados",
  ]) assert.ok(required.includes(key), key);
  assert.deepEqual(Object.keys(validBrief()).sort(), [...required].sort());
  const serialized = JSON.stringify(COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA);
  for (const construct of ["oneOf", "anyOf", "allOf", "$ref", "patternProperties"]) assert.ok(!serialized.includes(`"${construct}"`), construct);
});

await check("estrutura: modo MINUTA gera rascunho DRAFT_PENDING_REVIEW sem número nem compromisso; campos obrigatórios ausentes são rejeitados", async () => {
  const result = await answerCommercialStrategyQuery(supabase, { projectId: PROJECT, question: "Redija uma contraproposta ao cliente", mode: "MINUTA" }, createFakeAiProvider(), runOptions);
  assert.equal(result.brief.minuta.status, "DRAFT_PENDING_REVIEW");
  assert.equal(result.brief.minuta.type, "COUNTER_PROPOSAL");
  const broken = validBrief();
  delete broken.momentoEAbordagem;
  rejects(() => validateCommercialStrategyBrief(broken, { commercialContext: context }), /momentoEAbordagem/);
  await assert.rejects(answerCommercialStrategyQuery(supabase, { projectId: PROJECT, question: "  " }, createFakeAiProvider(), runOptions), /Pergunta vazia/);
  await assert.rejects(answerCommercialStrategyQuery(supabase, { projectId: PROJECT, question: "x", mode: "INVENTADO" }, createFakeAiProvider(), runOptions), /Modo/);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
