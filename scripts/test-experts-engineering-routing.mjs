// Frente P3 — Experts IA: Diretor de Engenharia e Construção IA (engineering-director) independente do Diretor de
// Planejamento IA, roteamento por área/assunto em todos os caminhos, framework comum no prompt de todos os Experts
// técnicos, conhecimento técnico (resumo próprio) no runtime e limite de IA reservado ANTES de cada chamada de
// provedor. Provedor SIMULADO (fake); nenhuma rede, nenhum banco real.
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-experts-engineering-routing.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const { OFFICIAL_EXPERT_DEFINITIONS, EXPERT_COLLABORATION_MATRIX } = await import("../apps/web/lib/ai/expert-definitions/index.ts");
const { requestedSkillsForExpert, SKILL_STATE_LABEL } = await import("../apps/web/lib/ai/expert-definitions/requested-skills.ts");
const { EXPERT_PROVIDER_ENV_VAR, resolveAiProviderForExpert, resolveAiProviderNameForExpert } = await import("../apps/web/lib/ai/providers/resolve-provider-for-expert.ts");
const { createFakeAiProvider } = await import("../apps/web/lib/ai/providers/fake-provider.ts");
const { buildSystemPrompt } = await import("../apps/web/lib/ai/providers/anthropic-provider.ts");
const framework = await import("../apps/web/lib/ai/specialist-framework.ts");
const planningKnowledge = await import("../apps/web/lib/ai/expert-knowledge/planning.ts");
const engineeringKnowledge = await import("../apps/web/lib/ai/expert-knowledge/engineering.ts");
const { PLANNING_DIRECTOR_INSTRUCTIONS, PLANNING_DIRECTOR_NAME, PLANNING_DIRECTOR_VERSION } = await import("../apps/web/lib/ai/experts/planning-director/identity.ts");
const { ENGINEERING_DIRECTOR_INSTRUCTIONS, ENGINEERING_DIRECTOR_NAME } = await import("../apps/web/lib/ai/experts/engineering-director/identity.ts");
const { ESG_DIRECTOR_INSTRUCTIONS } = await import("../apps/web/lib/ai/experts/esg-director/identity.ts");
const { LEGAL_CONSULTANT_INSTRUCTIONS } = await import("../apps/web/lib/ai/experts/legal-consultant/identity.ts");
const { CEO_INSTRUCTIONS } = await import("../apps/web/lib/ai/experts/ceo/identity.ts");
const { COMMERCIAL_DIRECTOR_INSTRUCTIONS } = await import("../apps/web/lib/ai/experts/commercial-director/identity.ts");
const topics = await import("../apps/web/lib/ai/routing/expert-topics.ts");
const { routeExpert, suggestExpertForArea, ALERT_EXPERT_OPTIONS, isKnownExpert } = await import("../apps/web/lib/risk-alerts/experts/route-alert-expert.ts");
const { classifyCurationTopic, decideExpertRouting } = await import("../apps/web/lib/ai/curation/route-experts.ts");
const { runMultiExpertCuration, CURATION_SPECIALIST_IDS } = await import("../apps/web/lib/ai/curation/run-multi-expert-curation.ts");
const spec = await import("../apps/web/lib/ai/alert-consult/specialties.ts");
const { runAlertConsult } = await import("../apps/web/lib/ai/alert-consult/run-alert-consult.ts");
const { runAlertConsultExpert, runAlertConsultCuration } = await import("../apps/web/lib/ai/alert-consult/alert-consult-experts.ts");
const quota = await import("../apps/web/lib/ai/alert-consult/consult-quota.ts");
const cycle = await import("../apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${String(error?.message ?? error).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const P1 = "11111111-1111-4111-8111-111111111111";
const U1 = "22222222-2222-4222-8222-222222222222";

/** Supabase simulado (mesmo padrão de test-alert-ai-consult.mjs) — leitura vazia, sem rede. */
function stubSupabase(tables = { projects: [{ id: P1, name: "Obra A", code: "A", client: "C", status: "ACTIVE" }] }) {
  const from = (table) => {
    const rows = tables[table] ?? [];
    const q = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "maybeSingle" || prop === "single") return async () => ({ data: rows[0] ?? null, error: null });
          if (prop === "then") return (resolve) => resolve({ data: rows, error: null, count: rows.length });
          return () => q;
        },
      }
    );
    return q;
  };
  return { from };
}

/** Provider fake que registra cada chamada no log compartilhado (para verificar a ORDEM reserva → provedor). */
function recordingProvider(log) {
  const fake = createFakeAiProvider();
  return {
    id: "fake",
    answerQuery: async (request) => (log.push(`provider:${request.expertId}`), fake.answerQuery(request)),
    generateAssessment: async (request) => (log.push(`provider:${request.expertId}`), fake.generateAssessment(request)),
    consolidateExecutiveCuration: async (request) => (log.push("provider:ceo"), fake.consolidateExecutiveCuration(request)),
  };
}

console.log("\n======================================");
console.log("P3 — EXPERTS IA: ENGENHARIA, ROTEAMENTO, FRAMEWORK E LIMITE");
console.log("======================================\n");

// ---------------------------------------------------------------- 1. engineering-director existe
await check("engineering-director é Expert oficial IMPLEMENTED, com competências de engenharia e sem cronograma", () => {
  const def = OFFICIAL_EXPERT_DEFINITIONS["engineering-director"];
  assert.ok(def, "definição ausente");
  assert.equal(def.status, "IMPLEMENTED");
  assert.equal(def.expertName, "Diretor de Engenharia e Construção IA");
  for (const term of ["Fundações e geotecnia", "Estruturas de concreto, metálicas e pré-moldadas", "Pisos industriais e coberturas", "Construtibilidade", "Engenharia de valor", "Compatibilização de projetos", "Análise técnico-econômica"]) {
    assert.ok(def.capabilities.some((c) => c.includes(term)), term);
  }
  assert.ok(!def.capabilities.some((c) => /cronograma|caminho crítico|curva s/i.test(c)), "engenharia não declara competências de planejamento");
});

await check("planning-director é Diretor de Planejamento IA (v6), sem nome/escopo de engenharia", () => {
  assert.equal(PLANNING_DIRECTOR_NAME, "Diretor de Planejamento IA");
  assert.equal(PLANNING_DIRECTOR_VERSION, "v6");
  assert.ok(!/Você é o Diretor de Engenharia/.test(PLANNING_DIRECTOR_INSTRUCTIONS));
  const def = OFFICIAL_EXPERT_DEFINITIONS["planning-director"];
  for (const term of ["linhas de base", "CPM, caminho crítico e folgas", "curva S e histogramas", "recuperação ou aceleração", "4D"]) {
    assert.ok(def.capabilities.some((c) => c.includes(term)), term);
  }
  assert.ok(!def.capabilities.some((c) => /não conformidades de compras|fundaç|construtibilidade/i.test(c)));
  assert.match(PLANNING_DIRECTOR_INSTRUCTIONS, /engineering-director/, "planejamento encaminha engenharia ao Expert de engenharia");
});

await check("registros: env var própria, curadoria, matriz, ciclo, opções do ESPECIALISTA, especialidade, skills e hub", () => {
  assert.equal(EXPERT_PROVIDER_ENV_VAR["engineering-director"], "AXION_AI_PROVIDER_ENGINEERING_DIRECTOR");
  assert.ok(CURATION_SPECIALIST_IDS.includes("engineering-director"));
  assert.ok(EXPERT_COLLABORATION_MATRIX.some((r) => r.primaryExpertId === "engineering-director" && r.topic === "ENGENHARIA E CONSTRUÇÃO"));
  assert.equal(EXPERT_COLLABORATION_MATRIX.find((r) => r.topic === "DECISÃO EXECUTIVA").supportingExpertIds.includes("engineering-director"), true);
  assert.equal(typeof cycle.CYCLE_SINGLE_EXPERT_QUERIES["engineering-director"], "function");
  assert.ok(isKnownExpert("engineering-director") && ALERT_EXPERT_OPTIONS.some((o) => o.id === "engineering-director"));
  assert.equal(spec.getAlertConsultSpecialty("engenharia").expertId, "engineering-director");
  assert.ok(requestedSkillsForExpert("engineering-director").length > 0);
  const hub = src("apps/web/app/[projectId]/experts-ia/page.tsx");
  assert.match(hub, /"engineering-director": \(projectId\) => `\/\$\{projectId\}\/experts-ia\/diretor-engenharia`/);
  const page = src("apps/web/app/[projectId]/experts-ia/diretor-engenharia/page.tsx");
  assert.match(page, /askEngineeringDirectorAction/);
  assert.match(src("apps/web/lib/ai/engineering-query-action.ts"), /answerEngineeringDirectorQuery/);
  assert.doesNotMatch(src("apps/web/lib/ai/engineering-query-action.ts"), /answerPlanningDirectorQuery/);
  assert.match(src("apps/web/app/[projectId]/experts-ia/diretor-planejamento/page.tsx"), /askPlanningDirectorAction/);
});

await check("provider por Expert: AXION_AI_PROVIDER_ENGINEERING_DIRECTOR mal configurada FALHA (nunca cai em fake); ausente = default", () => {
  const saved = { a: process.env.AXION_AI_PROVIDER_ENGINEERING_DIRECTOR, g: process.env.AXION_AI_PROVIDER, k: process.env.ANTHROPIC_API_KEY };
  try {
    delete process.env.AXION_AI_PROVIDER;
    delete process.env.AXION_AI_PROVIDER_ENGINEERING_DIRECTOR;
    assert.equal(resolveAiProviderForExpert("engineering-director").id, "fake");
    process.env.AXION_AI_PROVIDER_ENGINEERING_DIRECTOR = "inexistente";
    assert.throws(() => resolveAiProviderForExpert("engineering-director"), /AXION_AI_PROVIDER_ENGINEERING_DIRECTOR inválido/);
    process.env.AXION_AI_PROVIDER_ENGINEERING_DIRECTOR = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    assert.throws(() => resolveAiProviderForExpert("engineering-director"));
    assert.equal(resolveAiProviderNameForExpert("planning-director"), "fake", "ativar engenharia não ativa planejamento");
  } finally {
    for (const [k, v] of [["AXION_AI_PROVIDER_ENGINEERING_DIRECTOR", saved.a], ["AXION_AI_PROVIDER", saved.g], ["ANTHROPIC_API_KEY", saved.k]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ---------------------------------------------------------------- 2. isolamento planejamento × engenharia
const ENGINEERING_QUESTIONS = [
  "qual tipo de fundação usar com essa sondagem?",
  "a estrutura metálica do galpão suporta a ponte rolante?",
  "o piso industrial tem problema de planicidade",
  "alternativas construtivas para a cobertura metálica",
  "há interferências de projeto que exigem compatibilização?",
  "proposta de engenharia de valor para o pré-moldado",
];
const PLANNING_QUESTIONS = [
  "qual o caminho crítico do cronograma?",
  "quanto de folga resta na atividade 120?",
  "o CPM mostra risco no marco de entrega?",
  "curva s abaixo do previsto",
  "comparar baseline com o cronograma atual",
  "sequenciamento das frentes para recuperação de prazo",
];

await check("ESPECIALISTA (routeExpert): fundação/estrutura/piso/cobertura → engineering; cronograma/CPM/folga → planning; nunca o inverso", () => {
  for (const q of ENGINEERING_QUESTIONS) {
    const r = routeExpert({ question: q });
    assert.equal(r.expertId, "engineering-director", q);
    assert.ok(!r.topics.includes("planning-director"), `${q} não pode tocar planejamento`);
  }
  for (const q of PLANNING_QUESTIONS) {
    const r = routeExpert({ question: q });
    assert.equal(r.expertId, "planning-director", q);
    assert.ok(!r.topics.includes("engineering-director"), `${q} não pode tocar engenharia`);
  }
  assert.equal(routeExpert({ question: "Diretor de Engenharia, isso é viável?" }).expertId, "engineering-director");
  assert.equal(routeExpert({ question: "Diretor de Planejamento, isso é recuperável?" }).expertId, "planning-director");
});

await check("área: PLANEJAMENTO→planning; ENGENHARIA→engineering; JURIDICO→legal; COMERCIAL/FINANCEIRO/ORCAMENTO→commercial; ESG_SSMA→esg", () => {
  assert.equal(suggestExpertForArea("PLANEJAMENTO"), "planning-director");
  assert.equal(suggestExpertForArea("ENGENHARIA"), "engineering-director");
  assert.equal(suggestExpertForArea("JURIDICO"), "legal-consultant");
  for (const a of ["COMERCIAL", "FINANCEIRO", "ORCAMENTO"]) assert.equal(suggestExpertForArea(a), "commercial-director", a);
  assert.equal(suggestExpertForArea("ESG_SSMA"), "esg-director");
  assert.equal(suggestExpertForArea("ADMINISTRATIVO"), null);
  assert.equal(spec.specialtyForSlaArea("ENGENHARIA"), "engenharia");
  assert.equal(spec.specialtyForSlaArea("PLANEJAMENTO"), "planejamento");
  assert.equal(spec.specialtyForSlaArea("ORCAMENTO"), "comercial");
});

await check("curadoria: tema de engenharia tem engineering como principal (planejamento só apoia); cronograma tem planning como principal", () => {
  const eng = classifyCurationTopic("A fundação do bloco B apresentou recalque e precisa de solução técnica.");
  assert.deepEqual(eng.primaryExpertIds, ["engineering-director"]);
  const plan = classifyCurationTopic("Atraso identificado no cronograma, com pedido de extensão de prazo.");
  assert.deepEqual(plan.primaryExpertIds, ["planning-director"]);
  assert.ok(!plan.primaryExpertIds.includes("engineering-director"));
  const supply = classifyCurationTopic("Fornecedor com má qualidade e equipe insuficiente na montagem.");
  assert.deepEqual(supply.primaryExpertIds, ["engineering-director"]);
});

// ---------------------------------------------------------------- 3. comercial roteado
await check("comercial: especialidade Comercial/Financeiro/Orçamento → commercial-director; tema custo/orçamento → commercial; runAlertConsultExpert aceita commercial", async () => {
  assert.equal(spec.getAlertConsultSpecialty("comercial").expertId, "commercial-director");
  assert.equal(spec.preselectSpecialtyForArea("ORÇAMENTO"), "comercial");
  assert.equal(routeExpert({ question: "qual o BDI e o orçamento deste serviço?" }).expertId, "commercial-director");
  const log = [];
  const run = await runAlertConsultExpert(stubSupabase(), "commercial-director", { scope: "PROJECT", projectId: P1, question: "Qual a exposição de custo?" }, "Qual a exposição de custo?", recordingProvider(log));
  assert.equal(run.response.expertId, "commercial-director");
  assert.deepEqual(log, ["provider:commercial-director"]);
  const eng = await runAlertConsultExpert(stubSupabase(), "engineering-director", { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, "Qual fundação?", createFakeAiProvider());
  assert.equal(eng.response.expertId, "engineering-director");
  await assert.rejects(runAlertConsultExpert(stubSupabase(), "ceo", { scope: "PROJECT", projectId: P1, question: "x" }, "x", createFakeAiProvider()));
});

// ---------------------------------------------------------------- 4. multidisciplinar → curadoria
const subject = { projectId: P1, subject: "risco", id: P1, title: "Risco R1", projectName: "Obra A", scope: "PROJECT", contextText: "Risco registrado", sources: [] };

await check("CONSULTAR IA 'Geral (pelo assunto)': assunto multidisciplinar → curadoria com um parecer por Expert + consolidação CEO (nunca um Expert único)", async () => {
  const log = [];
  const provider = recordingProvider(log);
  const supabase = stubSupabase();
  let singleCalls = 0;
  const out = await runAlertConsult(
    {
      getPermission: async () => "COLABORADOR",
      loadSubject: async () => subject,
      reserve: async (_p, _s, _i, expertId) => (log.push(`reserve:${expertId}`), { ok: true }),
      runExpert: async () => {
        singleCalls += 1;
        throw new Error("não deveria consultar um Expert único");
      },
      runCuration: async ({ request, expertIds, reserve }) => ({
        curation: await runAlertConsultCuration(supabase, { request, expertIds, reserve, provider }),
        providerId: "fake",
      }),
    },
    { projectId: P1, subject: "risco", id: P1, specialtyId: "geral", question: "A estrutura metálica tem defeito e qual a cláusula contratual de garantia?" }
  );
  assert.equal(out.ok, true, out.error);
  assert.equal(singleCalls, 0);
  assert.equal(out.response, null);
  assert.equal(out.expertId, "ceo");
  const authors = out.curation.pareceres.map((p) => p.expertId).sort();
  assert.deepEqual(authors, ["engineering-director", "legal-consultant"]);
  assert.ok(out.curation.pareceres.every((p) => p.expertName && p.response.expertId === p.expertId), "autoria preservada");
  assert.ok(Array.isArray(out.curation.consolidacao.divergencias) && Array.isArray(out.curation.consolidacao.decisoesHumanasNecessarias));
  // reserva antes de cada chamada, inclusive a consolidação do CEO
  assert.deepEqual(log, ["reserve:engineering-director", "provider:engineering-director", "reserve:legal-consultant", "provider:legal-consultant", "reserve:ceo", "provider:ceo"]);
});

await check("CONSULTAR IA 'Geral': um único tema → Expert do tema (engenharia), uma reserva e uma chamada", async () => {
  const log = [];
  const out = await runAlertConsult(
    {
      getPermission: async () => "COLABORADOR",
      loadSubject: async () => subject,
      reserve: async (_p, _s, _i, expertId) => (log.push(`reserve:${expertId}`), { ok: true }),
      runExpert: (expertId, request, q, reserve) => runAlertConsultExpert(stubSupabase(), expertId, request, q, recordingProvider(log), reserve),
    },
    { projectId: P1, subject: "risco", id: P1, specialtyId: "geral", question: "Qual a melhor solução para o piso industrial?" }
  );
  assert.equal(out.ok, true, out.error);
  assert.equal(out.expertId, "engineering-director");
  assert.deepEqual(log, ["reserve:engineering-director", "provider:engineering-director"]);
});

await check("ciclo (ESPECIALISTA 'ceo'): curadoria multi-Expert com PARECER por Expert e CONSOLIDAÇÃO CEO; reserva antes de cada provedor", async () => {
  const log = [];
  const consultant = cycle.createCycleExpertConsultant(stubSupabase(), {
    reserve: async ({ actorUserId, expertId }) => (log.push(`reserve:${expertId}:${actorUserId}`), { ok: true }),
    provider: recordingProvider(log),
  });
  const answer = await consultant.answer({ expertId: "ceo", projectId: P1, question: "A fundação atrasou e há multa contratual?", askedByUserId: U1, subjectId: "caso-1" });
  assert.equal(answer.requiresHumanReview, true);
  assert.match(answer.answerText, /PARECER — Diretor de Engenharia e Construção IA/);
  assert.match(answer.answerText, /PARECER — Consultor Jurídico IA/);
  assert.match(answer.answerText, /CONSOLIDAÇÃO — CEO IA/);
  assert.match(answer.answerText, /Divergências:/);
  assert.deepEqual(log, [
    `reserve:engineering-director:${U1}`, "provider:engineering-director",
    `reserve:legal-consultant:${U1}`, "provider:legal-consultant",
    `reserve:ceo:${U1}`, "provider:ceo",
  ]);
});

await check("ciclo: Expert único reserva com o usuário que perguntou ANTES do provedor; recusa = nenhuma chamada", async () => {
  const log = [];
  const ok = cycle.createCycleExpertConsultant(stubSupabase(), {
    reserve: async ({ expertId }) => (log.push(`reserve:${expertId}`), { ok: true }),
    provider: recordingProvider(log),
  });
  await ok.answer({ expertId: "engineering-director", projectId: P1, question: "Qual fundação?", askedByUserId: U1, subjectId: "c" });
  assert.deepEqual(log, ["reserve:engineering-director", "provider:engineering-director"]);

  const denied = [];
  const refused = cycle.createCycleExpertConsultant(stubSupabase(), {
    reserve: async () => ({ ok: false, error: "Limite." }),
    provider: recordingProvider(denied),
  });
  await assert.rejects(refused.answer({ expertId: "planning-director", projectId: P1, question: "Quem coordena a frente de serviço?", askedByUserId: U1, subjectId: "c" }), /Limite de IA não reservado/);
  await assert.rejects(refused.answer({ expertId: "ceo", projectId: P1, question: "fundação e cláusula", askedByUserId: U1, subjectId: "c" }));
  assert.deepEqual(denied, [], "sem reserva nenhum provedor é chamado");
});

await check("ciclo (produção): sem usuário solicitante a reserva service_role nem é tentada e a IA não é chamada", async () => {
  let rpcCalls = 0;
  const admin = { rpc: async () => (rpcCalls++, { error: null }), from: stubSupabase().from };
  const consultant = cycle.createDefaultCycleExpertConsultant(admin);
  await assert.rejects(consultant.answer({ expertId: "legal-consultant", projectId: P1, question: "cláusula", askedByUserId: null, subjectId: "c" }), /sem usuário solicitante/);
  assert.equal(rpcCalls, 0);
  // com usuário: usa ai_consult_reserve_for_actor (service_role) com tipo RISK_CYCLE e o Expert
  const calls = [];
  const admin2 = { rpc: async (name, args) => (calls.push([name, args]), { error: { message: "AI_CONSULT_USER_LIMIT" } }), from: stubSupabase().from };
  await assert.rejects(cycle.createDefaultCycleExpertConsultant(admin2).answer({ expertId: "legal-consultant", projectId: P1, question: "cláusula", askedByUserId: U1, subjectId: "caso-9" }), /limite diário/);
  assert.equal(calls[0][0], "ai_consult_reserve_for_actor");
  assert.deepEqual(calls[0][1], { p_actor_user_id: U1, p_project_id: P1, p_kind: "RISK_CYCLE", p_subject_id: "caso-9", p_expert_id: "legal-consultant" });
});

await check("ESPECIALISTA não altera estado, responsável, SLA nem escalonamento (módulo do ciclo só lê e recomenda)", () => {
  const code = src("apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\.(insert|update|upsert|delete)\(|applyTransition|sla_actions|escalat|recordExpertAnswer\(|enqueue\(/.test(code));
  assert.match(code, /requiresHumanReview: true/);
});

// ---------------------------------------------------------------- 5. AXIA fora
await check("AXIA nunca participa: nenhum caminho de roteamento referencia o assistente; opções e destinos são só Experts oficiais", () => {
  for (const f of [
    "apps/web/lib/ai/routing/expert-topics.ts",
    "apps/web/lib/risk-alerts/experts/route-alert-expert.ts",
    "apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts",
    "apps/web/lib/ai/curation/route-experts.ts",
    "apps/web/lib/ai/curation/run-multi-expert-curation.ts",
    "apps/web/lib/ai/alert-consult/run-alert-consult.ts",
    "apps/web/lib/ai/alert-consult/alert-consult-experts.ts",
  ]) {
    const code = src(f).replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/lib\/assistant|axia/i.test(code), f);
  }
  const official = Object.keys(OFFICIAL_EXPERT_DEFINITIONS);
  assert.ok(ALERT_EXPERT_OPTIONS.every((o) => official.includes(o.id)));
  assert.ok(spec.ALERT_CONSULT_SPECIALTIES.every((s) => s.expertId === "AUTO" || official.includes(s.expertId)));
  for (const q of ["axia, me ajude", "pergunte à assistente"]) assert.ok(topics.detectTopicExperts(q).every((id) => official.includes(id)));
});

// ---------------------------------------------------------------- 6. framework comum
await check("framework comum incluído EXATAMENTE uma vez no prompt de TODOS os Experts técnicos (Comercial via provider)", () => {
  const marker = framework.SPECIALIST_FRAMEWORK_MARKER;
  const count = (text) => text.split(marker).length - 1;
  for (const [id, text] of [
    ["planning-director", PLANNING_DIRECTOR_INSTRUCTIONS],
    ["engineering-director", ENGINEERING_DIRECTOR_INSTRUCTIONS],
    ["esg-director", ESG_DIRECTOR_INSTRUCTIONS],
    ["legal-consultant", LEGAL_CONSULTANT_INSTRUCTIONS],
    ["ceo", CEO_INSTRUCTIONS],
  ]) {
    assert.equal(count(text), 1, `${id}: framework no identity.ts`);
    assert.equal(count(buildSystemPrompt(text)), 1, `${id}: sem duplicar no system prompt`);
  }
  // Prompt do Diretor Comercial é mantido por outra frente: o provider garante o framework no system prompt.
  assert.equal(count(buildSystemPrompt(COMMERCIAL_DIRECTOR_INSTRUCTIONS)), 1, "commercial-director: framework no system prompt");
  // Conteúdo essencial do docs/ai/specialist-framework.md
  for (const essential of ["Decisão final é humana", "FATO CONFIRMADO", "INFERÊNCIA", "INFORMAÇÃO AUSENTE", "RECOMENDAÇÃO", "PENDING_ASSESSMENT", "Boa prática nunca é", "Política interna AXION não localizada"]) {
    assert.ok(framework.SPECIALIST_FRAMEWORK_INSTRUCTIONS.includes(essential), essential);
  }
  // Nenhum prompt técnico manda mais o modelo "ler" um arquivo que ele não acessa.
  for (const text of [PLANNING_DIRECTOR_INSTRUCTIONS, ENGINEERING_DIRECTOR_INSTRUCTIONS, ESG_DIRECTOR_INSTRUCTIONS, LEGAL_CONSULTANT_INSTRUCTIONS, CEO_INSTRUCTIONS]) {
    assert.ok(!/Leia e siga integralmente as regras de docs\/ai\/specialist-framework\.md/.test(text));
  }
});

await check("AXIA não recebe o framework dos especialistas (prompt próprio do assistente)", () => {
  const dir = path.join(root, "apps/web/lib/assistant");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const code = readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/specialist-framework|SPECIALIST_FRAMEWORK/.test(code), f);
  }
});

// ---------------------------------------------------------------- 7. conhecimento técnico (resumo próprio)
await check("conhecimento técnico das skills: resumo próprio versionado, procedência registrada e isolado por Expert", () => {
  assert.equal(planningKnowledge.PLANNING_KNOWLEDGE_PROVENANCE.skillSha256, "34c0ae9b2fa63a67853d15a8ed6229e516fd6c4b59658897feeff5a44674612a");
  assert.equal(engineeringKnowledge.ENGINEERING_KNOWLEDGE_PROVENANCE.skillSha256, "f286350613958ac9568bab2f972400b3e06f7ea4a2441842b78cd88fd0636c24");
  assert.equal(planningKnowledge.PLANNING_KNOWLEDGE_PROVENANCE.originalTextInRepository, false);
  assert.equal(engineeringKnowledge.ENGINEERING_KNOWLEDGE_PROVENANCE.originalTextInRepository, false);
  assert.ok(PLANNING_DIRECTOR_INSTRUCTIONS.includes(planningKnowledge.PLANNING_KNOWLEDGE_INSTRUCTIONS.trim()));
  assert.ok(ENGINEERING_DIRECTOR_INSTRUCTIONS.includes(engineeringKnowledge.ENGINEERING_KNOWLEDGE_INSTRUCTIONS.trim()));
  assert.ok(!PLANNING_DIRECTOR_INSTRUCTIONS.includes(engineeringKnowledge.ENGINEERING_KNOWLEDGE_INSTRUCTIONS.trim()), "planejamento não recebe o repertório de engenharia");
  assert.ok(!ENGINEERING_DIRECTOR_INSTRUCTIONS.includes(planningKnowledge.PLANNING_KNOWLEDGE_INSTRUCTIONS.trim()), "engenharia não recebe o repertório de planejamento");
  // nenhum SKILL.md (texto original) versionado no repositório
  const tracked = src("apps/web/lib/ai/expert-knowledge/planning.ts") + src("apps/web/lib/ai/expert-knowledge/engineering.ts");
  assert.ok(!/^---\s*\nname:/m.test(tracked) && !/description: "Especialista em/.test(tracked));
});

await check("requested-skills reflete o estado real: resumo próprio no runtime, skill original só no Claude Code local, nunca 'instalada no ACC'", () => {
  const planning = requestedSkillsForExpert("planning-director").find((s) => s.id === "planejamento-obras-log-ind-saude");
  const engineering = requestedSkillsForExpert("engineering-director").find((s) => s.id === "engenharia-industrial-logistica");
  for (const [skill, sha] of [[planning, planningKnowledge.PLANNING_KNOWLEDGE_PROVENANCE.skillSha256], [engineering, engineeringKnowledge.ENGINEERING_KNOWLEDGE_PROVENANCE.skillSha256]]) {
    assert.ok(skill);
    assert.equal(skill.state, "RUNTIME_SUMMARY_INTEGRATED");
    assert.equal(skill.runtimeIntegration.sourceSkillSha256, sha);
    assert.equal(skill.runtimeIntegration.originalTextInRepository, false);
  }
  assert.match(SKILL_STATE_LABEL.RUNTIME_SUMMARY_INTEGRATED, /resumo próprio.*skill original disponível só no ambiente Claude Code local/);
  for (const label of Object.values(SKILL_STATE_LABEL)) assert.ok(!/instalada no ACC/i.test(label));
});

// ---------------------------------------------------------------- 8. limite de IA em todos os caminhos
await check("curadoria: reserva obrigatória (sem reserve = nenhuma chamada) e recusa no meio interrompe a rodada", async () => {
  const log = [];
  await assert.rejects(runMultiExpertCuration(stubSupabase(), { projectId: P1, sourceType: "PROJECT", description: "x" }, {}), /sem reserva/);
  let n = 0;
  await assert.rejects(
    runMultiExpertCuration(
      stubSupabase(),
      { projectId: P1, sourceType: "PROJECT", description: "x", requestedExpertIds: ["engineering-director", "legal-consultant"] },
      { reserve: async (expertId) => (log.push(`reserve:${expertId}`), ++n === 2 ? { ok: false, error: "Esta obra atingiu o limite diário." } : { ok: true }), provider: recordingProvider(log) }
    ),
    /limite diário/
  );
  assert.deepEqual(log, ["reserve:engineering-director", "provider:engineering-director", "reserve:legal-consultant"], "nenhum provedor depois da recusa; CEO não consolida parcial");
});

await check("curadoria: bloqueio determinístico de prazo (sem MPP) deixa planejamento SEM parecer, sem derrubar a rodada", async () => {
  const supabase = stubSupabase();
  const result = await runMultiExpertCuration(
    supabase,
    { projectId: P1, sourceType: "PROJECT", description: "Qual o impacto no prazo e qual a cláusula aplicável?", requestedExpertIds: ["planning-director", "legal-consultant"] },
    { reserve: async () => ({ ok: true }), provider: createFakeAiProvider() }
  );
  assert.deepEqual(result.expertResults.map((r) => r.expertId), ["legal-consultant"]);
  assert.equal(result.unavailableExperts[0].expertId, "planning-director");
  assert.ok(result.executiveCuration.posicoes.every((p) => p.expertId !== "planning-director"), "CEO nunca cita Expert sem parecer");
});

await check("reserveAiConsult: Expert informado usa ai_consult_reserve_expert; erros mapeados; exceção = falha fechada", async () => {
  const calls = [];
  const okClient = { rpc: async (name, args) => (calls.push([name, args]), { error: null }) };
  assert.deepEqual(await quota.reserveAiConsult(okClient, P1, "EXPERT_PANEL", "s1", "engineering-director"), { ok: true });
  assert.deepEqual(calls[0], ["ai_consult_reserve_expert", { p_project_id: P1, p_kind: "EXPERT_PANEL", p_subject_id: "s1", p_expert_id: "engineering-director" }]);
  await quota.reserveAiConsult(okClient, P1, "SSMA", "r1");
  assert.equal(calls[1][0], "ai_consult_reserve");
  const limited = await quota.reserveAiConsult({ rpc: async () => ({ error: { message: "AI_CONSULT_PROJECT_LIMIT" } }) }, P1, "CURATION", "x", "ceo");
  assert.equal(limited.ok, false);
  assert.match(limited.error, /obra atingiu o limite/);
  const thrown = await quota.reserveAiConsult({ rpc: async () => { throw new Error("rede"); } }, P1, "CURATION", "x", "ceo");
  assert.equal(thrown.ok, false);
});

await check("painéis (experts-ia, /juridico, /esg, Diretor Comercial) e curadorias (Event Ledger, pré-contratual) reservam na fronteira do provedor", () => {
  // Frente N6: pré-verificação somente leitura → provedor embrulhado (gatedProviderForExpert) com a reserva
  // EXPERT_PANEL → chamada do Expert com esse provedor.
  const panels = [
    ["apps/web/lib/ai/engineering-query-action.ts", "answerEngineeringDirectorQuery(supabase"],
    ["apps/web/lib/ai/planning-query-action.ts", "answerPlanningDirectorQuery(supabase"],
    ["apps/web/lib/ai/esg-query-action.ts", "answerEsgDirectorQuery(supabase"],
    ["apps/web/lib/ai/legal-query-action.ts", "answerLegalConsultantQuery("],
    ["apps/web/lib/ai/expert-query-action.ts", "answerCommercialDirectorQuery(supabase"],
  ];
  for (const [file, call] of panels) {
    const code = src(file);
    const precheckAt = code.indexOf("precheckAiConsult(supabase");
    const gateAt = code.search(/gatedProviderForExpert\([\s\S]*?reserveAiConsult\([\s\S]*?"EXPERT_PANEL"/);
    const callAt = code.lastIndexOf(call);
    assert.ok(precheckAt > 0 && gateAt > precheckAt && callAt > precheckAt, `${file}: pré-verificação → provedor com reserva`);
    assert.match(code, /if \(!precheck\.ok\)/, `${file}: recusa interrompe`);
  }
  for (const file of ["apps/web/lib/ai/precontract-curation-action.ts", "apps/web/app/[projectId]/ledger/[eventId]/run-multi-expert-curation-actions.ts"]) {
    assert.match(src(file), /reserve: withAuditSink\(\(expertId: string\) => reserveAiConsult\(supabase, projectId, "CURATION"/, file);
  }
  const consult = src("apps/web/app/alertas/consulta-ia/[projectId]/[subject]/[id]/actions.ts");
  assert.match(consult, /runCuration: async \(\{ request, expertIds, reserve \}\)/);
  const cycleSrc = src("apps/web/lib/risk-alerts/run-risk-alert-cycle.ts");
  assert.match(cycleSrc, /createDefaultCycleExpertConsultant\(createSupabaseAdminClient\(\)\)/);
  assert.ok(!/answer(Ceo|Commercial|Esg|Legal|Planning|Engineering)\w*Query/.test(cycleSrc), "o ciclo não chama Experts sem passar pela reserva");
});

console.log("");
console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
process.exit(failed > 0 ? 1 : 0);
