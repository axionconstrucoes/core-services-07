// Frente N6 — governança, custos e verificação dos Experts IA. Provedor SIMULADO (fake); nenhuma rede, nenhum
// banco real. Cobre:
//   1. reserva na FRONTEIRA DO PROVEDOR (withQuotaGate): recusa = provedor não chamado; falha fechada;
//   2. recusas determinísticas ANTES do provedor (MPP ausente, contrato ilegível, validação) NÃO consomem unidade,
//      em todos os caminhos (painel, CONSULTAR IA, ciclo de risco, curadorias) — inclusive tentativas de abuso;
//   3. curadoria de adicional e curadoria automática passam a reservar (lacuna fechada); sem solicitante, nada é
//      chamado e a recusa é registrada;
//   4. cobertura: todo chamador de produção de um Expert está na tabela caminho × reserva (teste estático);
//   5. orçamento monetário: opções preparadas e DESLIGADAS;
//   6. verificação dos Experts: Planejamento × Engenharia isolados; Comercial v5 estratégico e condicionado a
//      Orçamentos (sem fonte conectada); consolidação CEO com autoria, divergências, incertezas, fontes e revisão
//      humana; ESPECIALISTA não grava estado.
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-ai-governance-n6.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeCommercialSupabase } from "./lib/fake-commercial-supabase.mjs";

register("./ts-module-resolver.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const gate = await import("../apps/web/lib/ai/governance/quota-gated-provider.ts");
const budget = await import("../apps/web/lib/ai/governance/budget-options.ts");
const quota = await import("../apps/web/lib/ai/alert-consult/consult-quota.ts");
const { ExpertQuerySafeError, resolveExpertQueryErrorMessage } = await import("../apps/web/lib/ai/expert-query-request.ts");
const { createFakeAiProvider } = await import("../apps/web/lib/ai/providers/fake-provider.ts");
const { answerPlanningDirectorQuery } = await import("../apps/web/lib/ai/experts/planning-director/query.ts");
const { answerEngineeringDirectorQuery } = await import("../apps/web/lib/ai/experts/engineering-director/query.ts");
const { answerLegalConsultantQuery } = await import("../apps/web/lib/ai/experts/legal-consultant/query.ts");
const { scheduleSourceBlockingMessage } = await import("../apps/web/lib/ai/experts/planning-director/schedule-source-guard.ts");
const { runMultiExpertCuration } = await import("../apps/web/lib/ai/curation/run-multi-expert-curation.ts");
const { runAlertConsult } = await import("../apps/web/lib/ai/alert-consult/run-alert-consult.ts");
const { runAlertConsultExpert } = await import("../apps/web/lib/ai/alert-consult/alert-consult-experts.ts");
const cycle = await import("../apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts");
const { runAdditionalProposalCuration } = await import("../apps/web/lib/additionals/curation.ts");
const auto = await import("../apps/web/lib/additionals/findings/run-automatic-curation.ts");
const topics = await import("../apps/web/lib/ai/routing/expert-topics.ts");
const planningIdentity = await import("../apps/web/lib/ai/experts/planning-director/identity.ts");
const engineeringIdentity = await import("../apps/web/lib/ai/experts/engineering-director/identity.ts");
const commercialIdentity = await import("../apps/web/lib/ai/experts/commercial-director/identity.ts");
const planningKnowledge = await import("../apps/web/lib/ai/expert-knowledge/planning.ts");
const engineeringKnowledge = await import("../apps/web/lib/ai/expert-knowledge/engineering.ts");
const { COMMERCIAL_DATA_INVENTORY, ECONOMIC_CORE_KEYS } = await import("../apps/web/lib/commercial/inventory.ts");
const { loadCommercialContext } = await import("../apps/web/lib/commercial/load-commercial-context.ts");
const { answerCommercialStrategyQuery } = await import("../apps/web/lib/ai/experts/commercial-director/strategy-query.ts");
const { findCommitmentViolations } = await import("../apps/web/lib/ai/experts/commercial-director/strategy-schema.ts");

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
const FORMAL_SCHEDULE_QUESTION = "Qual o impacto do atraso no caminho crítico e na folga do cronograma?";
const MISSING_MPP = scheduleSourceBlockingMessage("MISSING_MPP");

/** Supabase simulado só-leitura (sem documentos: MPP ausente, contrato ilegível). Registra escritas. */
function stubSupabase(tables = { projects: [{ id: P1, name: "Obra A", code: "A", client: "C", status: "ACTIVE" }] }, writes = []) {
  const from = (table) => {
    const rows = tables[table] ?? [];
    const q = new Proxy(
      {},
      {
        get(_t, prop) {
          if (["insert", "update", "upsert", "delete"].includes(prop)) {
            return () => (writes.push(`${String(prop)}:${table}`), q);
          }
          if (prop === "maybeSingle" || prop === "single") return async () => ({ data: rows[0] ?? null, error: null });
          if (prop === "then") return (resolve) => resolve({ data: rows, error: null, count: rows.length });
          return () => q;
        },
      }
    );
    return q;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

/** Provider fake que registra cada chamada (ordem reserva → provedor). */
function recordingProvider(log, { fail = false } = {}) {
  const fake = createFakeAiProvider();
  const wrap = (name, fn) => async (request) => {
    log.push(`provider:${request.expertId ?? name}`);
    if (fail) throw new Error("Falha simulada do provedor depois da chamada.");
    return fn(request);
  };
  return {
    id: "fake",
    answerQuery: wrap("query", (r) => fake.answerQuery(r)),
    generateAssessment: wrap("assessment", (r) => fake.generateAssessment(r)),
    consolidateExecutiveCuration: wrap("ceo", (r) => fake.consolidateExecutiveCuration(r)),
  };
}

function counter(log, { refuseAt = 0, message = "Você atingiu o limite diário de consultas ao especialista de IA." } = {}) {
  let n = 0;
  return async (expertId) => {
    n += 1;
    log.push(`reserve:${expertId ?? "?"}`);
    return refuseAt && n >= refuseAt ? { ok: false, error: message } : { ok: true };
  };
}
const count = (log, prefix) => log.filter((e) => e.startsWith(prefix)).length;

console.log("\n======================================");
console.log("N6 — GOVERNANÇA, CUSTOS E VERIFICAÇÃO DOS EXPERTS IA");
console.log("======================================\n");

// ---------------------------------------------------------------- 1. provedor com reserva
await check("gate: cada chamada ao provedor reserva UMA unidade imediatamente antes; id e resposta preservados", async () => {
  const log = [];
  const provider = gate.withQuotaGate(recordingProvider(log), () => counter(log)("engineering-director"));
  assert.equal(provider.id, "fake");
  assert.ok(gate.isQuotaGated(provider) && !gate.isQuotaGated(createFakeAiProvider()));
  const res = await answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, provider);
  assert.equal(res.audit.providerId, "fake");
  assert.deepEqual(log, ["reserve:engineering-director", "provider:engineering-director"]);
});

await check("gate: reserva recusada → provedor NÃO chamado e a mensagem redigida chega à tela (ExpertQuerySafeError)", async () => {
  const log = [];
  const provider = gate.withQuotaGate(recordingProvider(log), async () => ({ ok: false, error: "Esta obra atingiu o limite diário." }));
  const err = await answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, provider).catch((e) => e);
  assert.ok(err instanceof ExpertQuerySafeError);
  assert.equal(resolveExpertQueryErrorMessage(err, "fallback"), "Esta obra atingiu o limite diário.");
  assert.equal(count(log, "provider:"), 0);
});

await check("gate: reserva que lança exceção = falha fechada (provedor não chamado); sem função de reserva = recusa imediata", async () => {
  const log = [];
  const provider = gate.withQuotaGate(recordingProvider(log), async () => {
    throw new Error("rede caiu");
  });
  await assert.rejects(provider.answerQuery({ expertId: "ceo" }), /Não foi possível verificar o limite/);
  await assert.rejects(provider.consolidateExecutiveCuration({}), ExpertQuerySafeError);
  await assert.rejects(provider.generateAssessment({}), ExpertQuerySafeError);
  assert.equal(count(log, "provider:"), 0);
  assert.throws(() => gate.withQuotaGate(recordingProvider(log), undefined), /sem reserva/);
});

// ---------------------------------------------------------------- 2. recusas determinísticas não consomem
await check("Planejamento: MPP ausente recusa ANTES do provedor → 0 unidades (painel/consulta direta)", async () => {
  const log = [];
  const provider = gate.gatedProviderForExpert("planning-director", counter(log), recordingProvider(log));
  await assert.rejects(answerPlanningDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: FORMAL_SCHEDULE_QUESTION }, provider), (e) => e.message === MISSING_MPP);
  assert.deepEqual(log, [], "nenhuma reserva, nenhum provedor");
});

await check("Jurídico: contrato ilegível (requireContractualDocuments) recusa ANTES do provedor → 0 unidades", async () => {
  const log = [];
  const provider = gate.gatedProviderForExpert("legal-consultant", counter(log), recordingProvider(log));
  const err = await answerLegalConsultantQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "A cláusula 7 é abusiva?" }, provider, { requireContractualDocuments: true }).catch((e) => e);
  assert.ok(err instanceof ExpertQuerySafeError, String(err));
  assert.match(err.message, /Nenhum documento desta analise pode ser lido/);
  assert.deepEqual(log, []);
});

await check("validação: pergunta vazia / escopo não implementado recusam ANTES do provedor → 0 unidades", async () => {
  const log = [];
  const provider = gate.gatedProviderForExpert("engineering-director", counter(log), recordingProvider(log));
  await assert.rejects(answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "   " }, provider));
  await assert.rejects(answerEngineeringDirectorQuery(stubSupabase(), { scope: "DOCUMENT", projectId: P1, question: "x" }, provider));
  await assert.rejects(answerEngineeringDirectorQuery(stubSupabase(), { scope: "EVENT", projectId: P1, question: "x" }, provider));
  assert.deepEqual(log, []);
});

await check("CONSULTAR IA (alerta/risco): Planejamento sem MPP recusa sem reserva; pré-verificação recusada não carrega nada", async () => {
  const log = [];
  const subject = { projectId: P1, subject: "risco", id: P1, title: "Risco", projectName: "Obra A", scope: "PROJECT", contextText: "ctx", sources: [] };
  const base = {
    getPermission: async () => "COLABORADOR",
    loadSubject: async () => subject,
    reserve: async (_p, _s, _i, expertId) => counter(log)(expertId),
    runExpert: (expertId, request, q, reserve) => runAlertConsultExpert(stubSupabase(), expertId, request, q, recordingProvider(log), reserve),
  };
  const input = { projectId: P1, subject: "risco", id: P1, specialtyId: "planejamento", question: FORMAL_SCHEDULE_QUESTION };
  const out = await runAlertConsult(base, input);
  assert.equal(out.ok, false);
  assert.equal(out.error, MISSING_MPP);
  assert.deepEqual(log, []);
  // pré-verificação (somente leitura) recusada: nem reserva nem provedor
  const out2 = await runAlertConsult({ ...base, precheck: async () => ({ ok: false, error: "Limite atingido." }) }, { ...input, question: "Quem coordena?" });
  assert.deepEqual(out2, { ok: false, error: "Limite atingido." });
  assert.deepEqual(log, []);
});

await check("ABUSO (ciclo de risco): 30 repetições de pergunta formal sem MPP → 0 unidades e 0 chamadas (antes: 1 unidade por ciclo)", async () => {
  const log = [];
  const consultant = cycle.createCycleExpertConsultant(stubSupabase(), { reserve: async ({ expertId }) => counter(log)(expertId), provider: recordingProvider(log) });
  for (let i = 0; i < 30; i += 1) {
    await assert.rejects(consultant.answer({ expertId: "planning-director", projectId: P1, question: FORMAL_SCHEDULE_QUESTION, askedByUserId: U1, subjectId: "caso" }));
  }
  assert.deepEqual(log, []);
});

await check("ABUSO: provedor chamado e falhou DEPOIS → a unidade permanece consumida (sem estorno); nenhum API de estorno existe", async () => {
  const log = [];
  const provider = gate.gatedProviderForExpert("engineering-director", counter(log), recordingProvider(log, { fail: true }));
  await assert.rejects(answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, provider), /Falha simulada/);
  assert.deepEqual(log, ["reserve:engineering-director", "provider:engineering-director"]);
  const exported = Object.keys(quota).concat(Object.keys(gate));
  assert.ok(!exported.some((name) => /refund|estorno|release|devol|undo/i.test(name)), exported.join(","));
});

await check("ABUSO: após a recusa do limite, novas tentativas nunca chegam ao provedor (falha fechada repetida)", async () => {
  const log = [];
  const reserve = counter(log, { refuseAt: 2 });
  const provider = gate.gatedProviderForExpert("engineering-director", reserve, recordingProvider(log));
  await answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, provider);
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, provider), ExpertQuerySafeError);
  }
  assert.equal(count(log, "provider:"), 1);
  assert.equal(count(log, "reserve:"), 6);
});

await check("curadoria multi-Expert: Planejamento bloqueado por guard não consome; CEO recebe e registra a indisponibilidade (incerteza)", async () => {
  const log = [];
  const curation = await runMultiExpertCuration(
    stubSupabase(),
    { projectId: P1, sourceType: "PROJECT", description: `${FORMAL_SCHEDULE_QUESTION} E a fundação aguenta?`, consultAllExperts: true },
    { reserve: counter(log), provider: recordingProvider(log) }
  );
  assert.ok(!log.includes("reserve:planning-director"), log.join(","));
  assert.equal(count(log, "reserve:"), count(log, "provider:"), "cada unidade corresponde a uma chamada real");
  assert.ok(curation.unavailableExperts.some((u) => u.expertId === "planning-director"));
  assert.ok(curation.executiveCuration.decisoesHumanasNecessarias.some((d) => d.includes("planning-director") && d.includes("indisponível")));
  assert.ok(!curation.executiveCuration.posicoes.some((p) => p.expertId === "planning-director"), "CEO nunca presume posição de quem não opinou");
});

// ---------------------------------------------------------------- 3. lacunas fechadas
const proposal = { id: "prop-1", projectId: P1, proposalNumber: "AD-01", title: "Reforço de fundação", status: "IN_NEGOTIATION", description: "Escopo adicional de fundação." };

await check("curadoria de adicional: sem reserva → recusa SEM chamar provedor", async () => {
  const log = [];
  await assert.rejects(runAdditionalProposalCuration(stubSupabase(), proposal, { provider: recordingProvider(log) }), /sem reserva do limite de IA/);
  await assert.rejects(runAdditionalProposalCuration(stubSupabase(), proposal), /sem reserva do limite de IA/);
  assert.deepEqual(log, []);
});

await check("curadoria de adicional: 1 unidade por Expert (Planejamento, Comercial, Jurídico, CEO), sempre reserva → provedor, em sequência", async () => {
  const log = [];
  const result = await runAdditionalProposalCuration(stubSupabase(), proposal, { reserve: counter(log), provider: recordingProvider(log) });
  assert.deepEqual(log, [
    "reserve:planning-director", "provider:planning-director",
    "reserve:commercial-director", "provider:commercial-director",
    "reserve:legal-consultant", "provider:legal-consultant",
    "reserve:ceo", "provider:ceo",
  ]);
  assert.deepEqual(result.expertResults.map((r) => r.expertId).sort(), ["commercial-director", "legal-consultant", "planning-director"]);
  assert.equal(result.executiveCuration.requiresHumanReview, true);
});

await check("curadoria de adicional: recusa no meio interrompe (nenhum Expert seguinte, nenhuma consolidação parcial)", async () => {
  const log = [];
  await assert.rejects(runAdditionalProposalCuration(stubSupabase(), proposal, { reserve: counter(log, { refuseAt: 2 }), provider: recordingProvider(log) }), ExpertQuerySafeError);
  assert.deepEqual(log, ["reserve:planning-director", "provider:planning-director", "reserve:commercial-director"]);
});

/** Supabase simulado para ai_curation_runs: registra insert/update; nenhuma execução COMPLETED prévia. */
function curationRunsStub() {
  const writes = [];
  const from = (table) => {
    let op = "select";
    let payload = null;
    const q = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "insert" || prop === "update") {
            return (p) => ((op = prop), (payload = p), writes.push({ table, op: prop, payload: p }), q);
          }
          if (prop === "maybeSingle") return async () => ({ data: null, error: null });
          if (prop === "single") {
            return async () => ({
              data: op === "insert" ? { id: "run-1", ...payload, routed_expert_ids: [], started_at: "2026-11-20T00:00:00Z", created_at: "2026-11-20T00:00:00Z" } : null,
              error: null,
            });
          }
          if (prop === "then") return (resolve) => resolve({ data: [], error: null });
          return () => q;
        },
      }
    );
    return q;
  };
  return { client: { from, rpc: async () => ({ data: null, error: null }) }, writes };
}
const autoInput = { projectId: P1, proposalId: "prop-1", driveSourceId: "src-1", sourceLabel: "exigencia.pdf", sourceSummary: "O cliente exigiu certificação adicional." };

await check("curadoria automática SEM solicitante: nenhuma reserva, nenhum provedor; recusa REGISTRADA em ai_curation_runs", async () => {
  const log = [];
  const { client, writes } = curationRunsStub();
  const result = await auto.runAutomaticCurationForClientSource(client, { ...autoInput, reserve: counter(log), confrontationProvider: recordingProvider(log), expertProvider: recordingProvider(log) });
  assert.equal(result.status, "BLOCKED_NO_REQUESTER");
  assert.deepEqual(log, []);
  const failed = writes.find((w) => w.table === "ai_curation_runs" && w.op === "update");
  assert.ok(failed && failed.payload.status === "FAILED_PENDING_RETRY" && failed.payload.error_message === auto.AUTOMATIC_CURATION_NO_REQUESTER_MESSAGE, JSON.stringify(writes));
});

await check("curadoria automática COM solicitante mas SEM mecanismo de reserva: idem (falha fechada registrada)", async () => {
  const log = [];
  const { client, writes } = curationRunsStub();
  const result = await auto.runAutomaticCurationForClientSource(client, { ...autoInput, createdByUserId: U1, confrontationProvider: recordingProvider(log) });
  assert.equal(result.status, "BLOCKED_NO_REQUESTER");
  assert.deepEqual(log, []);
  assert.ok(writes.some((w) => w.op === "update" && w.payload.error_message === auto.AUTOMATIC_CURATION_NO_REQUESTER_MESSAGE));
});

await check("curadoria automática: reserva recusada no Jurídico (1º Expert) → provedor não chamado; execução FAILED_PENDING_RETRY", async () => {
  const log = [];
  const { client } = curationRunsStub();
  const result = await auto.runAutomaticCurationForClientSource(client, { ...autoInput, createdByUserId: U1, reserve: counter(log, { refuseAt: 1 }), confrontationProvider: recordingProvider(log) });
  assert.equal(result.status, "FAILED_PENDING_RETRY");
  assert.deepEqual(log, ["reserve:legal-consultant"]);
});

await check("produção (curadoria automática): actorExpertReserve usa ai_consult_reserve_for_actor, tipo AUTOMATIC_CURATION; sem usuário nem tenta", async () => {
  const calls = [];
  const admin = { rpc: async (name, args) => (calls.push([name, args]), { error: null }) };
  assert.deepEqual(await quota.actorExpertReserve(admin, U1, P1, "AUTOMATIC_CURATION", "FONTE_CLIENTE:src-1")("legal-consultant"), { ok: true });
  assert.deepEqual(calls[0], ["ai_consult_reserve_for_actor", { p_actor_user_id: U1, p_project_id: P1, p_kind: "AUTOMATIC_CURATION", p_subject_id: "FONTE_CLIENTE:src-1", p_expert_id: "legal-consultant" }]);
  const r = await quota.actorExpertReserve(admin, null, P1, "AUTOMATIC_CURATION", "x")("ceo");
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1);
});

await check("precheck/erros: ai_consult_precheck chamado com a obra; erros de orçamento mapeados para mensagem de tela", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => (calls.push([name, args]), { error: { message: "AI_CONSULT_BUDGET_GLOBAL_DAY" } }) };
  const r = await quota.precheckAiConsult(client, P1);
  assert.deepEqual(calls[0], ["ai_consult_precheck", { p_project_id: P1 }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /orçamento de consultas/);
});

// ---------------------------------------------------------------- 4. cobertura estática caminho × reserva
// Tabela caminho × reserva × unidade (espelho de docs/ai/governanca-consumo-ia.md). Todo arquivo de produção que
// chama um ponto de entrada de Expert precisa estar aqui, com a marca do mecanismo de reserva no próprio arquivo.
const COVERAGE = {
  "apps/web/lib/ai/expert-query-action.ts": /gatedProviderForExpert\([\s\S]*?"EXPERT_PANEL"/,
  "apps/web/lib/ai/planning-query-action.ts": /gatedProviderForExpert\([\s\S]*?"EXPERT_PANEL"/,
  "apps/web/lib/ai/engineering-query-action.ts": /gatedProviderForExpert\([\s\S]*?"EXPERT_PANEL"/,
  "apps/web/lib/ai/esg-query-action.ts": /gatedProviderForExpert\([\s\S]*?"EXPERT_PANEL"/,
  "apps/web/lib/ai/legal-query-action.ts": /gatedProviderForExpert\([\s\S]*?"EXPERT_PANEL"/,
  "apps/web/lib/ai/commercial-strategy-action.ts": /gatedProviderForExpert\([\s\S]*?"EXPERT_PANEL"/,
  "apps/web/lib/ai/precontract-curation-action.ts": /reserve: withAuditSink\(\(expertId: string\) => reserveAiConsult\(supabase, projectId, "CURATION"/,
  "apps/web/app/[projectId]/ledger/[eventId]/run-multi-expert-curation-actions.ts": /reserve: withAuditSink\(\(expertId: string\) => reserveAiConsult\(supabase, projectId, "CURATION"/,
  "apps/web/app/[projectId]/adicionais/actions.ts": /reserveAiConsult\(supabase, proposal\.projectId, "CURATION"/,
  "apps/web/app/alertas/consulta-ia/[projectId]/[subject]/[id]/actions.ts": /runAlertConsultExpert\(supabase, expertId, request, userQuestion, undefined, reserve\)/,
  "apps/web/app/ssma/consult-actions.ts": /reserve: \(pid, rid\) => reserveAiConsult\(supabase, pid, "SSMA", rid\)/,
  "apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts": /gatedProviderForExpert\(q\.expertId, reserveFor\(q\)/,
  // módulos de orquestração (recebem a reserva de quem chama; falham fechado sem ela)
  "apps/web/lib/ai/curation/run-multi-expert-curation.ts": /gatedProviderForExpert\(expertId, options\.reserve/,
  "apps/web/lib/ai/alert-consult/alert-consult-experts.ts": /withQuotaGate\(/,
  "apps/web/lib/ai/alert-consult/ssma-consult.ts": /runAlertConsultExpert\(/, // reserva SSMA feita antes pelo chamador (run-record-consult)
  "apps/web/lib/additionals/curation.ts": /gatedProviderForExpert\(expertId, options\.reserve/,
  "apps/web/lib/additionals/findings/run-automatic-curation.ts": /gatedProviderForExpert\(expertId, reserve/,
};
const ENTRY = /\b(answer(?:Commercial|Planning|Engineering|Esg|Legal|Ceo)\w*Query|answerCommercialStrategyQuery|runExecutiveCuration|runClientSourceConfrontation|runCommercialDirectorExpert|runMultiExpertCuration|runAlertConsultExpert|runAlertConsultCuration|runAdditionalProposalCuration|runAutomaticCurationForClientSource|consultSsmaSpecialistForRecord)\s*\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

await check("cobertura: TODO chamador de produção de um Expert está na tabela caminho × reserva, com a marca do mecanismo", () => {
  const callers = [];
  for (const file of [...walk(path.join(root, "apps/web/lib")), ...walk(path.join(root, "apps/web/app"))]) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const code = readFileSync(file, "utf8")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|import |export \{|export async function|export function|async function)/.test(line))
      .join("\n");
    if (ENTRY.test(code)) callers.push(rel);
  }
  // Definições dos próprios Experts (chamam o provedor recebido, não decidem reserva).
  const definitions = new Set([
    "apps/web/lib/ai/index.ts",
  ]);
  assert.ok(callers.length >= 15, `varredura encontrou poucos chamadores (${callers.length}) — regex quebrada?`);
  const unknown = callers.filter((c) => !COVERAGE[c] && !definitions.has(c));
  assert.deepEqual(unknown, [], `chamadores sem linha na tabela de cobertura: ${unknown.join(", ")}`);
  for (const [file, marker] of Object.entries(COVERAGE)) assert.match(src(file), marker, `${file}: mecanismo de reserva ausente`);
});

await check("cobertura: AXIA não usa o limite dos Experts (orçamento próprio axia_chat_budget) e não chama Expert", () => {
  const files = walk(path.join(root, "apps/web/lib/assistant"));
  for (const f of files) assert.ok(!ENTRY.test(readFileSync(f, "utf8")), path.basename(f));
});

// ---------------------------------------------------------------- 5. orçamento monetário (desligado)
await check("orçamento monetário: padrão DESLIGADO; estimativa por chamada (pior caso, arredondada para cima); sem preço embutido", () => {
  assert.equal(budget.DEFAULT_EXPERT_BUDGET_SETTINGS.enabled, false);
  for (const [k, v] of Object.entries(budget.DEFAULT_EXPERT_BUDGET_SETTINGS)) if (k !== "enabled") assert.equal(v, null, k);
  assert.ok(Object.isFrozen(budget.DEFAULT_EXPERT_BUDGET_SETTINGS));
  // 10 000 tokens de entrada a US$ 1/MTok + 1 000 de saída a US$ 5/MTok = US$ 0,015 = 15 000 micro-dólares
  assert.equal(budget.estimateExpertCallCostMicros({ maxInputTokens: 10000, maxOutputTokens: 1000, priceInPerMTok: 1, priceOutPerMTok: 5 }), 15000);
  assert.equal(budget.estimateExpertCallCostUsd({ maxInputTokens: 1, maxOutputTokens: 1, priceInPerMTok: 0.3, priceOutPerMTok: 0.3 }), 0.000001);
  assert.throws(() => budget.estimateExpertCallCostMicros({ maxInputTokens: 0, maxOutputTokens: 1, priceInPerMTok: 1, priceOutPerMTok: 1 }));
  const p = budget.projectWorstCaseSpendUsd({ estimatedCostPerCallUsd: 0.05, perUserDayCalls: 20, perProjectDayCalls: 100, activeProjects: 3, workingDaysPerMonth: 22 });
  assert.deepEqual(p, { perUserDay: 1, perProjectDay: 5, globalDay: 15, globalMonth: 330 });
  const migration = src("supabase/migrations/20261121150000_ai_consult_governance.sql");
  assert.match(migration, /insert into public\.ai_consult_budget_settings \(scope, enabled\) values \('DEFAULT', false\)/);
  assert.ok(!/update public\.ai_consult_limits/i.test(migration), "N6 não altera os limites vigentes");
  for (const code of budget.EXPERT_BUDGET_ERROR_CODES) assert.ok(migration.includes(`'${code}'`), code);
});

// ---------------------------------------------------------------- 6. verificação dos Experts
await check("Planejamento × Engenharia isolados: roteamento, provedor e repertório técnico não se misturam", async () => {
  for (const q of ["Qual a melhor estaca para a fundação?", "Como executar o piso industrial?", "Laje protendida ou treliçada?"]) {
    const t = topics.detectTopicExperts(q);
    assert.ok(t.includes("engineering-director") && !t.includes("planning-director"), `${q} → ${t}`);
  }
  for (const q of ["Qual o caminho crítico?", "A folga da atividade foi consumida?", "Como montar a curva S?"]) {
    const t = topics.detectTopicExperts(q);
    assert.ok(t.includes("planning-director") && !t.includes("engineering-director"), `${q} → ${t}`);
  }
  const seen = [];
  const capture = { ...createFakeAiProvider(), id: "fake", answerQuery: async (r) => (seen.push(r), createFakeAiProvider().answerQuery(r)) };
  await answerEngineeringDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Qual fundação?" }, capture);
  await answerPlanningDirectorQuery(stubSupabase(), { scope: "PROJECT", projectId: P1, question: "Existe cronograma cadastrado?" }, capture);
  assert.deepEqual(seen.map((r) => r.expertId), ["engineering-director", "planning-director"]);
  assert.ok(seen[0].instructions.includes(engineeringKnowledge.ENGINEERING_KNOWLEDGE_INSTRUCTIONS.trim()));
  assert.ok(!seen[0].instructions.includes(planningKnowledge.PLANNING_KNOWLEDGE_INSTRUCTIONS.trim()));
  assert.ok(seen[1].instructions.includes(planningKnowledge.PLANNING_KNOWLEDGE_INSTRUCTIONS.trim()));
  assert.ok(!seen[1].instructions.includes(engineeringKnowledge.ENGINEERING_KNOWLEDGE_INSTRUCTIONS.trim()));
  assert.equal(planningIdentity.PLANNING_DIRECTOR_VERSION, "v6");
  assert.equal(engineeringIdentity.ENGINEERING_DIRECTOR_VERSION, "v1");
});

await check("Comercial v5: instruções exigem estratégia real (momento, interlocutores, decisores, posicionamento, riscos, concessões, contrapartidas, fechamento) e integração com Orçamentos", () => {
  assert.equal(commercialIdentity.COMMERCIAL_DIRECTOR_VERSION, "v5");
  const text = commercialIdentity.COMMERCIAL_DIRECTOR_INSTRUCTIONS.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const term of ["momento", "interlocutor", "decisor", "posicionamento", "risco", "concess", "contrapartida", "fechamento", "custo", "bdi", "margem", "conting", "alternativ", "produtividade", "prazo"]) {
    assert.ok(text.includes(term), term);
  }
});

await check("Orçamentos: NENHUMA fonte conectada — custos, BDI, margem e contingências ausentes do ACC e não lidos pelo carregador", () => {
  for (const key of ["CUSTOS_DIRETOS", "CUSTOS_INDIRETOS", "BDI", "MARGEM_PREVISTA", "CONTINGENCIAS", "PRODUTIVIDADE", "ALTERNATIVAS_DE_ENGENHARIA", "PREMISSAS_DO_ORCAMENTO"]) {
    const entry = COMMERCIAL_DATA_INVENTORY.find((e) => e.key === key);
    assert.ok(entry && entry.presence === "NAO" && entry.usedByLoader === false && entry.where === null, key);
  }
  assert.ok(ECONOMIC_CORE_KEYS.includes("BDI") && ECONOMIC_CORE_KEYS.includes("MARGEM_PREVISTA"));
  const code = src("apps/web/lib/commercial/load-commercial-context.ts");
  assert.ok(!/fetch\(|https?:\/\//.test(code.replace(/^\s*\/\/.*$/gm, "")), "carregador não fala com sistema externo de Orçamentos");
});

await check("Comercial estratégico SEM base de Orçamentos: recomendação condicionada — nenhuma concessão 'sustentada', pedidos a Orçamentos, nenhum número sem fonte, revisão humana", async () => {
  const PROJECT = "proj-1";
  const supabase = createFakeCommercialSupabase({
    tables: {
      project_memberships: [{ project_id: PROJECT, user_id: "user-1", permission: "GERENTE", status: "ACTIVE", area: null }],
      projects: [{ id: PROJECT, code: "WEG-01", name: "Obra WEG", client: "Cliente X", contract_number: "CT-123", start_date: "2026-01-10", baseline_end_date: "2026-12-20" }],
    },
  });
  const context = await loadCommercialContext(supabase, { projectId: PROJECT, now: () => new Date("2026-11-20T12:00:00Z") });
  assert.ok(context.items.filter((i) => ECONOMIC_CORE_KEYS.includes(i.key)).every((i) => i.availability !== "DISPONIVEL"));
  const result = await answerCommercialStrategyQuery(
    supabase,
    { projectId: PROJECT, question: "O cliente pediu 8% de desconto para fechar o aditivo. Qual a estratégia?", mode: "COMPLETO" },
    createFakeAiProvider(),
    { loadCommercialContext: async () => context, loadProjectContext: async () => ({
        projectId: PROJECT,
        project: { id: PROJECT, name: "Obra WEG", client: "Cliente X", status: "ATIVO", contractNumber: "CT-123" },
        events: [], eventsTotalCount: 0, esgObligations: [], esgObligationsTotalCount: 0, workspaceType: "OBRA",
        contractualDocuments: [], unreadableDocuments: [], omittedForBudget: [], documentCoverage: {},
      }) }
  );
  const brief = result.brief;
  assert.ok(brief.cenariosConcessao.every((c) => c.aceitabilidadeEconomica !== "SUSTENTADA_PELOS_DADOS"), "sem Orçamentos nenhuma concessão é declarada sustentada");
  assert.ok(brief.solicitacoesOrcamentos.length > 0, "pede os dados a Orçamentos");
  assert.ok(brief.numerosCitados.every((n) => /^COM-\d+$/.test(n.fonte)), "número só com fonte carregada");
  assert.equal(brief.requiresHumanReview, true);
  assert.ok(brief.decisoesAprovacaoHumana.length > 0);
  assert.ok(brief.momentoEAbordagem && brief.diagnostico.decisoresEInterlocutores !== undefined);
  assert.ok(findCommitmentViolations("Fica autorizado o desconto de 8% ao cliente.").length > 0, "nunca autoriza desconto");
});

await check("consolidação multidisciplinar: cada Expert executado UMA vez; CEO preserva autoria, divergências, incertezas, fontes e revisão humana", async () => {
  const log = [];
  const curation = await runMultiExpertCuration(
    stubSupabase(),
    { projectId: P1, sourceType: "PROJECT", description: "A fundação apresentou recalque e a cláusula de garantia contratual cobre o reparo?", requestedExpertIds: ["engineering-director", "legal-consultant"] },
    { reserve: counter(log), provider: recordingProvider(log) }
  );
  const specialists = log.filter((e) => e.startsWith("provider:") && e !== "provider:ceo");
  assert.equal(new Set(specialists).size, specialists.length, "nenhum Expert executado duas vezes");
  assert.equal(log.filter((e) => e === "provider:ceo").length, 1);
  const ids = curation.expertResults.map((r) => r.expertId);
  assert.ok(ids.includes("engineering-director") && ids.includes("legal-consultant"));
  for (const r of curation.expertResults) {
    assert.ok(r.response.expertName && r.response.expertId === r.expertId, "autoria");
    assert.ok(Array.isArray(r.response.fatosDocumentados) && Array.isArray(r.response.informacoesFaltantes), "fundamentação/fontes e incertezas por parecer");
  }
  const c = curation.executiveCuration;
  assert.ok(c.posicoes.every((p) => ids.includes(p.expertId)), "CEO só cita quem foi consultado");
  assert.ok(Array.isArray(c.divergencias) && Array.isArray(c.decisoesHumanasNecessarias));
  assert.equal(c.requiresHumanReview, true);
  const text = cycle.formatCurationAnswer(curation);
  assert.match(text, /PARECER — /);
  assert.match(text, /CONSOLIDAÇÃO — CEO IA/);
  assert.match(text, /Divergências:/);
  assert.match(text, /sujeita a revisão humana/);
});

await check("ESPECIALISTA (ciclo e CONSULTAR IA) não grava nada: nenhum insert/update/delete durante a consulta; resposta exige revisão humana", async () => {
  const writes = [];
  const supabase = stubSupabase(undefined, writes);
  const consultant = cycle.createCycleExpertConsultant(supabase, { reserve: async () => ({ ok: true }), provider: createFakeAiProvider() });
  const single = await consultant.answer({ expertId: "engineering-director", projectId: P1, question: "Qual fundação?", askedByUserId: U1, subjectId: "c" });
  const multi = await consultant.answer({ expertId: "ceo", projectId: P1, question: "fundação e cláusula de garantia", askedByUserId: U1, subjectId: "c" });
  assert.equal(single.requiresHumanReview, true);
  assert.equal(multi.requiresHumanReview, true);
  const subject = { projectId: P1, subject: "risco", id: P1, title: "Risco", projectName: "Obra A", scope: "PROJECT", contextText: "ctx", sources: [] };
  const out = await runAlertConsult(
    {
      getPermission: async () => "COLABORADOR",
      loadSubject: async () => subject,
      reserve: async () => ({ ok: true }),
      runExpert: (expertId, request, q, reserve) => runAlertConsultExpert(supabase, expertId, request, q, createFakeAiProvider(), reserve),
    },
    { projectId: P1, subject: "risco", id: P1, specialtyId: "geral", question: "Qual a melhor solução para o piso industrial?" }
  );
  assert.equal(out.ok, true, out.error);
  assert.deepEqual(writes, [], "a consulta nunca altera estado, responsável, SLA ou escalonamento");
  const consultCode = src("apps/web/lib/ai/alert-consult/run-alert-consult.ts").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\.(insert|update|upsert|delete)\(|record_risk_alert_action|sla_actions/.test(consultCode));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
