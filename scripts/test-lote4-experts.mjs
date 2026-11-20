// LOTE 4 — Especialistas de IA e governança: homologação LOCAL (sem banco, sem provedor real).
//   1. seis Experts independentes (identidade, escopo, fontes, framework fato/inferência/recomendação, revisão humana);
//   2. roteamento por ÁREA e por ASSUNTO (Administrativo/Diretoria sem pré-seleção; sem tema → revisão humana; nunca
//      "default Planejamento"; nunca a AXIA);
//   3. limite/N6: reserva ANTES do provedor em todo caminho, sem estorno; orçamento monetário DESLIGADO;
//   4. auditoria de cada consulta (fontes, resultado, tokens) sem bloquear a resposta;
//   5. Gestão Executiva (CEO): síntese sem escrita; evidências originais intocadas;
//   6. Comercial/Orçamentos: pendências registradas (valor fixo do contrato só no dashboard; nenhum número fixo nos Experts).
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-lote4-experts.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(path.join(root, rel), "utf8");
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(root, f).split(path.sep).join("/");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const defs = await import("../apps/web/lib/ai/expert-definitions/index.ts");
const topics = await import("../apps/web/lib/ai/routing/expert-topics.ts");
const alertRouting = await import("../apps/web/lib/risk-alerts/experts/route-alert-expert.ts");
const resolver = await import("../apps/web/lib/ai/providers/resolve-provider-for-expert.ts");
const framework = await import("../apps/web/lib/ai/specialist-framework.ts");
const gate = await import("../apps/web/lib/ai/governance/quota-gated-provider.ts");
const audit = await import("../apps/web/lib/ai/governance/consult-audit.ts");
const budget = await import("../apps/web/lib/ai/governance/budget-options.ts");
const ids = {
  ceo: (await import("../apps/web/lib/ai/experts/ceo/identity.ts")).CEO_INSTRUCTIONS,
  "commercial-director": (await import("../apps/web/lib/ai/experts/commercial-director/identity.ts")).COMMERCIAL_DIRECTOR_INSTRUCTIONS,
  "engineering-director": (await import("../apps/web/lib/ai/experts/engineering-director/identity.ts")).ENGINEERING_DIRECTOR_INSTRUCTIONS,
  "esg-director": (await import("../apps/web/lib/ai/experts/esg-director/identity.ts")).ESG_DIRECTOR_INSTRUCTIONS,
  "legal-consultant": (await import("../apps/web/lib/ai/experts/legal-consultant/identity.ts")).LEGAL_CONSULTANT_INSTRUCTIONS,
  "planning-director": (await import("../apps/web/lib/ai/experts/planning-director/identity.ts")).PLANNING_DIRECTOR_INSTRUCTIONS,
};
const SIX = ["ceo", "commercial-director", "engineering-director", "esg-director", "legal-consultant", "planning-director"];

// ---------------------------------------------------------------- 1. seis Experts independentes
await check("1.1 seis Experts oficiais, IMPLEMENTED, cada um com identidade, missão, fontes, limites e escalonamento próprios", () => {
  const all = defs.ALL_OFFICIAL_EXPERT_DEFINITIONS;
  assert.deepEqual(all.map((d) => d.expertId).sort(), [...SIX].sort());
  for (const d of all) {
    assert.equal(d.status, "IMPLEMENTED", d.expertId);
    assert.equal(d.requiresHumanReview, true, d.expertId);
    assert.ok(d.expertName.trim() && d.mission.trim().length > 30, d.expertId);
    assert.ok(d.authorizedSources.length > 0, `${d.expertId}: sem fontes autorizadas`);
    assert.ok(d.authorizedSources.some((s) => s.status === "AVAILABLE"), `${d.expertId}: nenhuma fonte AVAILABLE`);
    assert.ok(d.limitations.length > 0 && d.escalationRules.length > 0 && d.confidenceRules.length > 0, d.expertId);
    assert.ok(d.capabilities.length > 0 && d.typicalQuestions.length > 0, d.expertId);
  }
  assert.equal(new Set(all.map((d) => d.expertName)).size, 6, "nomes distintos");
  assert.equal(new Set(all.map((d) => d.mission)).size, 6, "missões distintas");
});

await check("1.2 cada Expert tem instruções próprias com o Framework Comum (fato/inferência/ausente/recomendação) e anti-alucinação", () => {
  assert.equal(new Set(Object.values(ids)).size, 6, "instruções distintas");
  for (const id of SIX) {
    // Framework no próprio prompt OU injetado de forma única pelo provedor (anthropic-provider: marcador).
    const injected = /instructions\.includes\(SPECIALIST_FRAMEWORK_MARKER\)/.test(src("apps/web/lib/ai/providers/anthropic-provider.ts"));
    assert.ok(ids[id].includes(framework.SPECIALIST_FRAMEWORK_MARKER) || injected, `${id}: sem o Framework Comum`);
    const text = ids[id].includes(framework.SPECIALIST_FRAMEWORK_MARKER) ? ids[id] : `${ids[id]}\n${framework.SPECIALIST_FRAMEWORK_INSTRUCTIONS}`;
    assert.match(text, /FATO CONFIRMADO/, id);
    assert.match(text, /INFER[ÊE]NCIA/, id);
    assert.match(text, /INFORMA[ÇC][ÃA]O AUSENTE/, id);
    assert.match(text, /RECOMENDA[ÇC][ÃA]O/, id);
    assert.match(text, /[Pp]roibido inventar/, `${id}: sem a proibição de inventar fonte/fato`);
    assert.match(text, /decis[ãa]o final [ée] humana/i, id);
  }
});

await check("1.3 Experts nunca chamam a AXIA e a AXIA não recebe o framework de Experts", () => {
  for (const id of SIX) assert.ok(!/encaminh\w+\s+(para|à|a)\s+(a\s+)?AXIA|pergunte\s+(à|a)\s+AXIA/i.test(ids[id]), id);
  const axiaFiles = walk(path.join(root, "apps/web/lib/assistant")).map(rel);
  for (const f of axiaFiles) assert.ok(!/SPECIALIST_FRAMEWORK_INSTRUCTIONS/.test(src(f)), `${f} usa o framework dos Experts`);
});

await check("1.4 provedor e variável de ambiente independentes por Expert (nenhum compartilha o 'default Planejamento')", () => {
  const vars = Object.values(resolver.EXPERT_PROVIDER_ENV_VAR);
  assert.equal(new Set(vars).size, 6);
  assert.deepEqual(Object.keys(resolver.EXPERT_PROVIDER_ENV_VAR).sort(), [...SIX].sort());
  assert.equal(resolver.EXPERT_PROVIDER_ENV_VAR["engineering-director"], "AXION_AI_PROVIDER_ENGINEERING_DIRECTOR");
});

await check("1.5 resposta estruturada separa fato, contexto declarado, base, interpretação (inferência) e recomendação; revisão humana literal true", () => {
  const types = src("apps/web/lib/ai/query/types.ts");
  for (const field of ["fatosDocumentados", "contextoInternoDeclarado", "baseContratual", "baseLegal", "interpretacao", "recomendacoes", "informacoesFaltantes"]) {
    assert.match(types, new RegExp(`\\b${field}\\b`), field);
  }
  assert.match(types, /requiresHumanReview: true;/);
  const validator = src("apps/web/lib/ai/query/validate-expert-query-response.ts");
  assert.match(validator, /requireHumanReviewTrue/);
});

await check("1.6 guardas contra fonte inexistente: validação de grounding e de cláusula existem e são usadas pelos 5 Experts de consulta", () => {
  for (const id of ["commercial-director", "engineering-director", "esg-director", "legal-consultant", "planning-director"]) {
    const code = src(`apps/web/lib/ai/experts/${id}/query.ts`);
    assert.match(code, /validateExpertQueryResponse/, `${id}: sem validação`);
    assert.match(code, /validateDraftGrounding|applySafeGroundingCorrection/, `${id}: sem grounding`);
  }
});

// ---------------------------------------------------------------- 2. roteamento
await check("2.1 expertForArea: cada área → seu Expert; Administrativo/Diretoria/Compras/vazio → null (sem pré-seleção)", () => {
  const map = {
    PLANEJAMENTO: "planning-director",
    ENGENHARIA: "engineering-director",
    JURIDICO: "legal-consultant",
    COMERCIAL: "commercial-director",
    FINANCEIRO: "commercial-director",
    ORCAMENTO: "commercial-director",
    ESG_SSMA: "esg-director",
  };
  for (const [area, expert] of Object.entries(map)) assert.equal(topics.expertForArea(area), expert, area);
  for (const area of ["ADMINISTRATIVO", "DIRETORIA", "COMPRAS", "", null, undefined, "qualquer"]) assert.equal(topics.expertForArea(area), null, String(area));
  assert.equal(alertRouting.suggestExpertForArea("ADMINISTRATIVO"), null);
  assert.equal(alertRouting.suggestExpertForArea("DIRETORIA"), null);
});

await check("2.2 assunto: um tema → um Expert; dois ou mais → multidisciplinar; Planejamento ≠ Engenharia", () => {
  assert.equal(topics.routeBySubject({ question: "Qual a folga do caminho crítico?" }).expertId, "planning-director");
  assert.equal(topics.routeBySubject({ question: "A solução técnica de fundação com estacas é construtível?" }).expertId, "engineering-director");
  assert.equal(topics.routeBySubject({ question: "A multa da cláusula 12 se aplica?" }).expertId, "legal-consultant");
  assert.equal(topics.routeBySubject({ question: "Qual o impacto no orçamento e no preço?" }).expertId, "commercial-director");
  assert.equal(topics.routeBySubject({ question: "Houve acidente sem EPI?" }).expertId, "esg-director");
  const multi = topics.routeBySubject({ question: "O atraso do cronograma gera multa contratual?" });
  assert.equal(multi.kind, "MULTI");
  assert.ok(multi.expertIds.includes("planning-director") && multi.expertIds.includes("legal-consultant"));
});

await check("2.3 sem tema e sem área → revisão humana (nunca Planejamento por omissão); com área, a área vale", () => {
  const none = topics.routeBySubject({ question: "preciso de ajuda com isso" });
  assert.equal(none.kind, "MULTI");
  assert.deepEqual(none.expertIds, []);
  const r = alertRouting.routeExpert({ question: "preciso de ajuda com isso" });
  assert.equal(r.expertId, null);
  assert.equal(r.reviewRequired, true);
  assert.equal(r.source, "REVIEW_REQUIRED");
  for (const q of ["", "  ", "oi", "analise isto", "ajuda"]) {
    const x = alertRouting.routeExpert({ question: q });
    assert.notEqual(x.expertId, "planning-director", q);
    assert.equal(x.reviewRequired, true, q);
  }
  assert.equal(topics.routeBySubject({ question: "ajuda", area: "ENGENHARIA" }).expertId, "engineering-director");
  assert.deepEqual(topics.routeBySubject({ question: "ajuda", area: "ADMINISTRATIVO" }).expertIds, []);
});

await check("2.4 seleção explícita prevalece e registra sobreposição humana; 'AXIA' nunca é destino", () => {
  const r = alertRouting.routeExpert({ question: "folga do cronograma", selectedExpertId: "legal-consultant" });
  assert.equal(r.expertId, "legal-consultant");
  assert.equal(r.humanOverride, true);
  assert.equal(r.suggestedExpertId, "planning-director");
  const official = new Set(SIX);
  for (const q of ["AXIA, qual o prazo?", "pergunte para a AXIA", "axia"]) {
    const x = alertRouting.routeExpert({ question: q, selectedExpertId: "axia" });
    assert.ok(x.expertId === null || official.has(x.expertId), q);
  }
  assert.ok(alertRouting.ALERT_EXPERT_OPTIONS.every((o) => official.has(o.id)));
});

// ---------------------------------------------------------------- 3. limite / N6 / orçamento
const OK = { ok: true };
function scriptedProvider({ failAnswer = false } = {}) {
  const calls = [];
  const response = { providerId: "scripted", model: "m-test", output: { severity: "HIGH", confidence: 0.8, riscos: ["a", "b"], recomendacoes: ["x"] }, usage: { inputTokens: 120, outputTokens: 45 } };
  return {
    calls,
    id: "scripted",
    async generateAssessment() { calls.push("assess"); return response; },
    async answerQuery() { calls.push("answer"); if (failAnswer) throw new Error("falha de rede simulada"); return response; },
    async consolidateExecutiveCuration() { calls.push("consolidate"); return response; },
  };
}
const queryRequest = {
  expertId: "legal-consultant", expertName: "x", expertVersion: "v", instructions: "i", scope: "EVENT", question: "A multa se aplica?",
  eventContext: { event: { id: "ev-1" }, evidence: [{ id: "evd-1" }, { id: "evd-2" }], relatedClauses: [{ id: "cl-9", text: "TEXTO DA CLAUSULA NAO DEVE VAZAR" }], relatedEmails: [], eventNotes: [] },
  projectContext: null, outputSchema: {},
};

await check("3.1 reserva recusada → provedor NÃO é chamado e nada é auditado; reserva ok → 1 unidade por chamada", async () => {
  const p = scriptedProvider();
  const sink = [];
  const refused = gate.withQuotaGate(p, async () => ({ ok: false, error: "limite" }), async (e) => sink.push(e));
  await assert.rejects(() => refused.answerQuery(queryRequest), /limite/);
  assert.deepEqual(p.calls, []);
  assert.deepEqual(sink, []);
  let units = 0;
  const g = gate.withQuotaGate(p, async () => { units += 1; return OK; });
  await g.answerQuery(queryRequest);
  await g.consolidateExecutiveCuration({ expertId: "ceo", expertName: "c", expertVersion: "v", instructions: "i", situationSummary: "s", positions: [], outputSchema: {} });
  assert.equal(units, 2);
  assert.deepEqual(p.calls, ["answer", "consolidate"]);
});

await check("3.2 reserva que lança exceção → falha fechada (nenhuma chamada ao provedor)", async () => {
  const p = scriptedProvider();
  const g = gate.withQuotaGate(p, async () => { throw new Error("db fora"); });
  await assert.rejects(() => g.answerQuery(queryRequest));
  assert.deepEqual(p.calls, []);
});

await check("3.3 sem estorno: falha do provedor depois da reserva mantém a unidade consumida (e é auditada como PROVIDER_ERROR)", async () => {
  const p = scriptedProvider({ failAnswer: true });
  let units = 0;
  const sink = [];
  const g = gate.withQuotaGate(p, async () => { units += 1; return OK; }, async (e) => sink.push(e));
  await assert.rejects(() => g.answerQuery(queryRequest), /falha de rede/);
  assert.equal(units, 1);
  assert.equal(sink.length, 1);
  assert.equal(sink[0].outcome, "PROVIDER_ERROR");
  const code = src("apps/web/lib/ai/alert-consult/consult-quota.ts") + src("apps/web/lib/ai/governance/quota-gated-provider.ts");
  assert.ok(!/refund|estorn(a|o)r?\(|release|rollback|decrement/i.test(code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "não pode existir caminho de devolução");
});

await check("3.4 todo chamador de produção de um Expert passa por withQuotaGate/gatedProviderForExpert (tela, curadoria, e-mail/ciclo, comercial)", () => {
  const ENTRY = /\banswer(Commercial|Legal|Planning|Engineering|Esg)\w*Query\(|\brunExecutiveCuration\(|\brunClientSourceConfrontation\(/;
  const GATE = /gatedProviderForExpert|withQuotaGate|runMultiExpertCuration|runAlertConsultExpert|createCycleExpertConsultant|answerCommercial\w*Query\(supabase, request, provider|runAutomaticCurationForClientSource/;
  const skipDirs = ["apps/web/lib/ai/experts/", "apps/web/lib/ai/providers/", "apps/web/lib/ai/governance/"];
  const offenders = [];
  let scanned = 0;
  for (const file of [...walk(path.join(root, "apps/web/lib")), ...walk(path.join(root, "apps/web/app"))]) {
    const r = rel(file);
    if (skipDirs.some((d) => r.startsWith(d)) || r === "apps/web/lib/ai/index.ts") continue;
    const code = readFileSync(file, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|import |export \{|export (async )?function)/.test(l)).join("\n");
    if (!ENTRY.test(code)) continue;
    scanned += 1;
    if (!GATE.test(code)) offenders.push(r);
  }
  assert.ok(scanned >= 10, `varredura encontrou poucos chamadores (${scanned})`);
  assert.deepEqual(offenders, []);
});

await check("3.5 orçamento monetário DESLIGADO: padrão false na migration, nenhum código de produção o liga ou o consulta", () => {
  const mig = src("supabase/migrations/20261121150000_ai_consult_governance.sql");
  assert.match(mig, /enabled boolean not null default false/);
  assert.match(mig, /insert into public\.ai_consult_budget_settings[\s\S]{0,200}false/i);
  const offenders = [];
  for (const file of [...walk(path.join(root, "apps/web/lib")), ...walk(path.join(root, "apps/web/app"))]) {
    const code = readFileSync(file, "utf8");
    if (rel(file) === "apps/web/lib/ai/governance/budget-options.ts") continue;
    if (/ai_consult_budget_settings/.test(code)) offenders.push(`${rel(file)}: acessa ai_consult_budget_settings`);
    if (rel(file) !== "apps/web/lib/ai/governance/budget-options.ts" && /\b(estimateExpertCallCostUsd|projectWorstCaseSpendUsd)\b/.test(code)) offenders.push(`${rel(file)}: usa estimativa monetária`);
  }
  assert.deepEqual(offenders, []);
  // nenhuma migration posterior liga o orçamento
  for (const f of readdirSync(path.join(root, "supabase/migrations")).filter((n) => n >= "20261121150000")) {
    const text = src(`supabase/migrations/${f}`);
    if (f !== "20261121150000_ai_consult_governance.sql") assert.ok(!/update\s+public\.ai_consult_budget_settings/i.test(text), `${f} altera o orçamento`);
  }
  const doc = src("docs/ai/orcamento-monetario-ia.md");
  assert.match(doc, /DESLIGADO/);
  assert.equal(typeof budget.estimateExpertCallCostUsd, "function");
});

await check("3.6 limites vigentes 20/usuário/dia e 100/obra/dia na migration (valores não alterados pelo Lote 4)", () => {
  const mig = src("supabase/migrations/20261120120000_ssma_forward_and_ai_consult_limits.sql");
  assert.match(mig, /values \('DEFAULT', 20, 100\)/);
  const l4 = src("supabase/migrations/20261121174000_ai_consult_audit.sql");
  assert.ok(!/ai_consult_limits/.test(l4.replace(/--.*$/gm, "")), "Lote 4 não toca nos limites");
});

// ---------------------------------------------------------------- 4. auditoria
await check("4.1 auditoria: pergunta, Expert, fontes (só identificadores), severidade, confiança, tokens; sem texto de documento", async () => {
  const p = scriptedProvider();
  const sink = [];
  const g = gate.withQuotaGate(p, async () => OK, async (e) => sink.push(e), "legal-consultant");
  await g.answerQuery(queryRequest);
  assert.equal(sink.length, 1);
  const e = sink[0];
  assert.equal(e.expertId, "legal-consultant");
  assert.equal(e.question, "A multa se aplica?");
  assert.equal(e.scope, "EVENT");
  assert.deepEqual(e.sources.map((s) => `${s.type}:${s.id}`).sort(), ["event:ev-1", "evidence:evd-1", "evidence:evd-2", "relatedClauses:cl-9"].sort());
  assert.equal(e.outcome, "OK");
  assert.equal(e.severity, "HIGH");
  assert.equal(e.confidence, 0.8);
  assert.equal(e.inputTokens, 120);
  assert.equal(e.outputTokens, 45);
  assert.equal(e.resultSummary.requiresHumanReview, true);
  assert.ok(!JSON.stringify(e).includes("NAO DEVE VAZAR"), "texto de cláusula vazou para a auditoria");
});

await check("4.2 tokens ausentes ficam nulos (nunca inventados); falha da auditoria não derruba a resposta", async () => {
  const p = scriptedProvider();
  p.answerQuery = async () => ({ providerId: "fake", model: null, output: { x: 1 } });
  const g = gate.withQuotaGate(p, async () => OK, async () => { throw new Error("auditoria fora"); });
  const r = await g.answerQuery(queryRequest);
  assert.equal(r.providerId, "fake");
  const entry = audit.buildConsultAuditEntry("legal-consultant", queryRequest, "fake", { providerId: "fake", model: null, output: {} });
  assert.equal(entry.inputTokens, null);
  assert.equal(entry.outputTokens, null);
  assert.equal(entry.severity, null);
  assert.equal(entry.confidence, null);
});

await check("4.3 sink por reserva: withAuditSink/auditSinkOf propagam a trilha pelas camadas (curadoria, alerta, ciclo)", async () => {
  const sink = [];
  const reserve = audit.withAuditSink(async () => OK, async (e) => sink.push(e));
  const g = gate.gatedProviderForExpert("legal-consultant", reserve, scriptedProvider());
  await g.answerQuery(queryRequest);
  assert.equal(sink.length, 1);
  assert.equal(sink[0].expertId, "legal-consultant");
});

await check("4.4 TODOS os caminhos que reservam o limite também montam a trilha de auditoria", () => {
  const withSink = [
    "apps/web/lib/ai/expert-query-action.ts",
    "apps/web/lib/ai/engineering-query-action.ts",
    "apps/web/lib/ai/esg-query-action.ts",
    "apps/web/lib/ai/planning-query-action.ts",
    "apps/web/lib/ai/legal-query-action.ts",
    "apps/web/lib/ai/commercial-strategy-action.ts",
    "apps/web/lib/ai/precontract-curation-action.ts",
    "apps/web/app/[projectId]/ledger/[eventId]/run-multi-expert-curation-actions.ts",
    "apps/web/app/[projectId]/adicionais/actions.ts",
    "apps/web/app/alertas/consulta-ia/[projectId]/[subject]/[id]/actions.ts",
    "apps/web/lib/risk-alerts/experts/cycle-expert-consultant.ts",
  ];
  for (const f of withSink) assert.match(src(f), /sessionAuditSink|actorAuditSink/, f);
  // Curadoria automática: o chamador (futuro) anexa o sink à reserva; sem reserva nada é chamado (fail closed).
  assert.match(src("apps/web/lib/additionals/findings/run-automatic-curation.ts"), /typeof reserve !== "function"/);
});

await check("4.5 migration de auditoria: RLS (autor ou ADMINISTRADOR), sem escrita direta, SECURITY DEFINER com search_path vazio, sem EXECUTE para anon", () => {
  const sql = src("supabase/migrations/20261121174000_ai_consult_audit.sql");
  assert.match(sql, /alter table public\.ai_consult_audit enable row level security/);
  assert.match(sql, /revoke insert, update, delete, truncate on public\.ai_consult_audit from authenticated/);
  assert.equal((sql.match(/security definer\s+set search_path = ''/g) ?? []).length, 3);
  assert.match(sql, /ai_consult_audit_record\([^)]*\)\s+from public, anon;/);
  assert.match(sql, /to service_role;/);
  assert.ok(!/grant execute[^;]*to anon/i.test(sql));
  assert.match(sql, /requires_human_review boolean not null default true check \(requires_human_review = true\)/);
});

// ---------------------------------------------------------------- 5. Gestão Executiva (CEO / curadoria)
await check("5.1 curadoria/CEO: nenhum código de síntese grava dado (evidências originais intocadas) — só auditoria e avaliação derivada", () => {
  const dirs = ["apps/web/lib/ai/experts/ceo", "apps/web/lib/ai/curation", "apps/web/lib/ai/alert-consult", "apps/web/lib/ai/governance", "apps/web/lib/ai/routing"];
  const writers = [];
  for (const d of dirs) {
    for (const f of walk(path.join(root, d))) {
      const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      for (const m of code.matchAll(/\.from\("([a-z_]+)"\)\s*\.(insert|update|delete|upsert)\(/g)) writers.push(`${rel(f)} -> ${m[1]}.${m[2]}`);
    }
  }
  // única escrita permitida: a linha de auditoria da curadoria (audit_log_entries), via cliente admin explícito
  assert.deepEqual(writers.filter((w) => !/audit_log_entries\.insert/.test(w)), []);
  const none = ["event_evidence", "documents", "document_versions", "clauses", "emails"];
  for (const t of none) for (const w of writers) assert.ok(!w.includes(`-> ${t}.`), w);
});

await check("5.2 a síntese preserva autoria: um parecer por Expert + consolidação; sem Expert executando ação", () => {
  const code = src("apps/web/lib/ai/curation/run-multi-expert-curation.ts");
  assert.match(code, /expertResults/);
  assert.match(code, /runExecutiveCuration|consolidat/i);
  const ceoIdentity = ids.ceo;
  assert.match(ceoIdentity, /N[ÃA]O (pode|deve|execut)/i);
});

// ---------------------------------------------------------------- 6. Comercial / Orçamentos — pendências
await check("6.1 valor fixo R$ 33.450.000 não existe em lugar nenhum (P-COM-02 resolvida pelo Lote 5: Aditivos só de fonte estruturada); nenhum Expert/contexto comercial o recebe", () => {
  const holders = [];
  for (const file of [...walk(path.join(root, "apps/web/lib")), ...walk(path.join(root, "apps/web/app")), ...walk(path.join(root, "packages"))].filter((f) => !f.includes("node_modules"))) {
    if (/33[_.]?450[_.]?000/.test(readFileSync(file, "utf8"))) holders.push(rel(file));
  }
  assert.deepEqual(holders, []);
});

await check("6.2 Comercial: inventário declara a ausência da fonte de Orçamentos (custos diretos/indiretos/BDI) e o Expert não substitui por zero", () => {
  const inv = src("apps/web/lib/commercial/inventory.ts");
  assert.match(inv, /key: "CUSTOS_DIRETOS"[\s\S]{0,200}presence: "NAO"/);
  assert.match(inv, /economicCore: true/);
  assert.match(inv, /Não há valor global do contrato em campo estruturado/);
  const loader = src("apps/web/lib/commercial/load-commercial-context.ts");
  assert.ok(!/\b(value|amount|valor)\s*[:=]\s*0\b/.test(loader.replace(/\/\/.*$/gm, "")), "loader não preenche valor zero");
});

console.log("");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
