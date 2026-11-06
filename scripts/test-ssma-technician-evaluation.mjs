// Prévia da avaliação do técnico SSMA + formulário 12 (Acidentes e Near Misses) + lista de Near Misses.
// Uso: node scripts/test-ssma-technician-evaluation.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const ev = await import("../apps/web/lib/ssma/technician-evaluation.ts");
const dm = await import("../apps/web/lib/ssma/dashboard-metrics.ts");
const defs = await import("../apps/web/lib/ssma/checklist-definitions.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const T = "tech-1", OTHER = "tech-2";
const period = { from: "2026-10-05", to: "2026-10-11" }; // segunda a domingo: 5 dias úteis, 1 semana
const base = { technicianUserId: T, period, forms: [], records: [], actions: [] };
const form = (id, slug, at, extra = {}) => ({ id, checklist_slug: slug, occurred_at: at, created_at: at, technician_user_id: T, field_values: {}, photoCount: 1, ...extra });
const rec = (id, o = {}) => ({ id, kind: "OCORRENCIA", category: "Quase-acidente", location: "Bloco A", description: "Descrição suficientemente longa do fato", occurred_at: "2026-10-06T15:00:00Z", received_at: "2026-10-06T16:00:00Z", reported_by_user_id: T, photoCount: 1, action: null, ...o });

console.log("\n======================================\nSSMA — AVALIAÇÃO DO TÉCNICO (PRÉVIA), FORM. 12 E NEAR MISSES\n======================================");

await check("pesos propostos somam 100% e são exatamente os aprovados para a prévia", () => {
  assert.deepEqual(ev.EVALUATION_WEIGHTS, { prevencao: 0.2, acoes: 0.25, capacitacao: 0.15, ambiental: 0.2, qualidade: 0.1, resultados: 0.1 });
  assert.equal(Math.round(Object.values(ev.EVALUATION_WEIGHTS).reduce((a, b) => a + b, 0) * 1000) / 1000, 1);
});
await check("sem nenhum dado: nota NULA (não zero), todas as dimensões 'sem dados'", () => {
  const s = ev.computeTechnicianEvaluation(base);
  assert.equal(s.total, null); assert.equal(s.coverage, 0); assert.ok(s.indicative);
  assert.ok(s.dimensions.every((d) => d.score === null && d.effectiveWeight === 0));
  assert.ok(s.preview === true && s.rulesVersion === "previa-1");
});
await check("DDS diário em todos os dias úteis + DSS na semana = capacitação 100; ausência não vira zero nas demais", () => {
  const days = ["05", "06", "07", "08", "09"].map((d, i) => form(`d${i}`, "dda", `2026-10-${d}T11:00:00Z`));
  const s = ev.computeTechnicianEvaluation({ ...base, forms: [...days, form("w", "dds", "2026-10-07T11:00:00Z")] });
  const c = s.dimensions.find((d) => d.key === "capacitacao");
  assert.equal(c.score, 100);
  assert.equal(s.dimensions.find((d) => d.key === "ambiental").score, null);
  assert.equal(s.dimensions.find((d) => d.key === "prevencao").score, 0, "técnico ativo sem verificação preventiva: zero REAL (há dados do período)");
  assert.equal(s.total, 55.6, "(0×20% + 100×15% + 100×10%) / 45%: pesos redistribuídos entre as dimensões com dados");
});
await check("DDS parcial (2 de 5 dias) dá nota proporcional e mostra a memória de cálculo", () => {
  const s = ev.computeTechnicianEvaluation({ ...base, forms: [form("a", "dda", "2026-10-05T11:00:00Z"), form("b", "dda", "2026-10-06T11:00:00Z")] });
  const c = s.dimensions.find((d) => d.key === "capacitacao");
  assert.equal(c.score, 20); // ddsRatio 0.4, dssRatio 0 -> média 0.2
  assert.ok(c.memory.join(" ").includes("2 dia(s) com diálogo de 5"));
  assert.equal(c.evidence.length, 2);
});
await check("ações: só as do técnico entram; de outro responsável ficam como dependência da gerência", () => {
  const a = (id, who, status, due, done) => ({ id, record_id: `r-${id}`, responsible_user_id: who, status, due_date: due, concluded_at: done });
  const s = ev.computeTechnicianEvaluation({
    ...base,
    actions: [a("1", T, "CONCLUIDA", "2026-10-08", "2026-10-07T12:00:00Z"), a("2", T, "CONCLUIDA", "2026-10-08", "2026-10-10T12:00:00Z"), a("3", OTHER, "ABERTA", "2026-10-06", null)],
  });
  const d = s.dimensions.find((x) => x.key === "acoes");
  assert.equal(d.score, 75); // (1 + 0.5) / 2
  assert.equal(d.managementDependencies.length, 1);
  assert.ok(d.evidence.every((e) => e.id !== "3"), "ação de outro responsável fora da nota");
});
await check("ação vencida em aberto do técnico = 0 naquela ação; ação ainda no prazo não conta", () => {
  const future = "2999-01-01";
  const s = ev.computeTechnicianEvaluation({ ...base, period: { from: "2026-10-05", to: "2999-12-31" }, actions: [
    { id: "1", record_id: "r1", responsible_user_id: T, status: "ABERTA", due_date: "2026-10-06", concluded_at: null },
    { id: "2", record_id: "r2", responsible_user_id: T, status: "ABERTA", due_date: future, concluded_at: null },
  ] });
  const d = s.dimensions.find((x) => x.key === "acoes");
  assert.equal(d.score, 0); assert.ok(d.memory.join(" ").includes("ainda no prazo (1)"));
});
await check("QUANTIDADE de Near Misses/acidentes NÃO reduz a nota: 1 ou 6 relatos tratados dão a mesma nota", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => rec(`n${i}`, { location: `Local ${i}`, action: { id: `a${i}`, status: "ABERTA", due_date: "2999-01-01", concluded_at: null, responsible_user_id: T } }));
  const one = ev.computeTechnicianEvaluation({ ...base, records: mk(1) }).dimensions.find((d) => d.key === "resultados");
  const six = ev.computeTechnicianEvaluation({ ...base, records: mk(6) }).dimensions.find((d) => d.key === "resultados");
  assert.equal(one.score, 100); assert.equal(six.score, 100);
  assert.ok(six.memory.join(" ").includes("QUANTIDADE de relatos não entra"));
});
await check("relato sem tratamento reduz pelo TRATAMENTO (não pela quantidade); reincidência desconta até 30%", () => {
  const untreated = ev.computeTechnicianEvaluation({ ...base, records: [rec("a"), rec("b", { location: "Bloco B", action: { id: "x", status: "ABERTA", due_date: "2999-01-01", concluded_at: null, responsible_user_id: T } })] }).dimensions.find((d) => d.key === "resultados");
  assert.equal(untreated.score, 50);
  const prior = rec("p", { occurred_at: "2026-09-25T12:00:00Z", received_at: "2026-09-25T13:00:00Z", action: { id: "y", status: "CONCLUIDA", due_date: "2026-09-30", concluded_at: "2026-09-29T12:00:00Z", responsible_user_id: T } });
  const recur = ev.computeTechnicianEvaluation({ ...base, records: [prior, rec("r", { action: { id: "z", status: "ABERTA", due_date: "2999-01-01", concluded_at: null, responsible_user_id: T } })] }).dimensions.find((d) => d.key === "resultados");
  assert.equal(recur.score, 70, "tratado 100% - 30% de reincidência");
});
await check("ausência de relatos: 'sem dados' em Resultados (não premia nem pune) e peso redistribuído", () => {
  const s = ev.computeTechnicianEvaluation({ ...base, forms: [form("a", "dda", "2026-10-05T11:00:00Z")] });
  assert.equal(s.dimensions.find((d) => d.key === "resultados").score, null);
  const eff = s.dimensions.reduce((n, d) => n + d.effectiveWeight, 0);
  assert.ok(Math.abs(eff - 1) < 1e-9, "pesos efetivos somam 1");
});
await check("cobertura baixa marca a nota como INDICATIVA; cobertura alta não", () => {
  const few = ev.computeTechnicianEvaluation({ ...base, forms: [form("a", "dda", "2026-10-05T11:00:00Z")] });
  assert.ok(few.indicative && few.coverage === 0.45);
  const many = ev.computeTechnicianEvaluation({ ...base,
    forms: [form("a", "dda", "2026-10-05T11:00:00Z"), form("l", "limpeza", "2026-10-06T11:00:00Z"), ...[1, 2, 3].map((i) => form(`p${i}`, "apr", `2026-10-0${6 + i}T11:00:00Z`))],
    records: [rec("q", { action: { id: "z", status: "ABERTA", due_date: "2999-01-01", concluded_at: null, responsible_user_id: T } })] });
  assert.ok(!many.indicative, `cobertura ${many.coverage}`);
});
await check("registros de OUTRO técnico nunca entram na ficha", () => {
  const s = ev.computeTechnicianEvaluation({ ...base, forms: [form("x", "dda", "2026-10-05T11:00:00Z", { technician_user_id: OTHER })], records: [rec("y", { reported_by_user_id: OTHER })] });
  assert.equal(s.total, null);
});
await check("fluxo: gerente envia, técnico manifesta, gerente (que não é o técnico) valida; saltos e auto-validação recusados", () => {
  assert.equal(ev.nextEvaluationStatus("RASCUNHO", "ENVIAR", false, true), "AGUARDANDO_MANIFESTACAO");
  assert.equal(ev.nextEvaluationStatus("AGUARDANDO_MANIFESTACAO", "MANIFESTAR", true, false), "MANIFESTADA");
  assert.equal(ev.nextEvaluationStatus("MANIFESTADA", "VALIDAR", false, true), "VALIDADA_PELO_GERENTE");
  assert.throws(() => ev.nextEvaluationStatus("RASCUNHO", "VALIDAR", false, true));
  assert.throws(() => ev.nextEvaluationStatus("MANIFESTADA", "VALIDAR", true, true), /TRANSICAO_INVALIDA/);
  assert.throws(() => ev.nextEvaluationStatus("AGUARDANDO_MANIFESTACAO", "MANIFESTAR", false, true));
});
await check("a página é prévia: não grava nada e restringe a ficha de quem não é gerente", () => {
  const page = read("../apps/web/app/[projectId]/ssma-avaliacao/page.tsx");
  assert.ok(page.includes("PRÉVIA") && !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(page), "somente leitura");
  assert.ok(page.includes("viewerIsManager ? requested : viewerId"), "não-gerente só vê a própria ficha");
});
await check("formulário 12: nome 'Ocorrências: Acidentes e Near Misses'; identidade gravada do acidente intacta", () => {
  const d = defs.SSMA_CHECKLISTS.find((x) => x.slug === "ocorrencia-acidente");
  assert.equal(defs.checklistTitle(d), "Ocorrências: Acidentes e Near Misses");
  assert.deepEqual([d.number, d.title, d.driveFolder], [12, "Ocorrência / acidente", "12 - OCORRÊNCIAS E ACIDENTES"]);
  assert.deepEqual(defs.OCCURRENCE_TYPES, ["Acidente", "Near Miss (quase-acidente)"]);
});
await check("Near Miss do formulário 12 é gravado como 'Riscos apontados' + classificação estruturada (entra no indicador, não no acidente)", () => {
  const v = defs.SSMA_CHECKLISTS.find((x) => x.slug === "ocorrencia-acidente").nearMissVariant;
  assert.deepEqual(v.submitAs, { slug: "riscos-apontados", number: 8, title: "Riscos apontados", driveFolder: "09 - RISCOS APONTADOS" });
  const riscos = defs.SSMA_CHECKLISTS.find((x) => x.slug === "riscos-apontados");
  assert.deepEqual([...v.checks], [...riscos.checks], "checklist igual ao validado pelo banco");
  assert.equal(v.fixedValues.classificacao, "Quase-acidente");
  const forms = [{ id: "f1", checklist_slug: "riscos-apontados", occurred_at: "2026-10-06T15:00:00Z", field_values: { ...v.fixedValues, local: "Bloco A", descricao: "quase caiu" } }];
  const m = dm.computeSsmaDashboardMetrics({ forms, fieldRecords: [], links: [], today: "2026-10-07" });
  assert.equal(m.nearMisses, 1); assert.equal(m.accidentsWithLeave, 0); assert.equal(m.accidentsWithoutLeave, 0);
});
await check("o formulário usa o tipo escolhido: Near Miss não dispara aviso de acidente e Acidente segue pelo RPC de acidente", () => {
  const app = read("../apps/web/components/ssma/ssma-field-app.tsx");
  assert.ok(app.includes('definition.slug === "ocorrencia-acidente" && !isNearMiss'), "aviso de acidente só para Acidente");
  assert.ok(app.includes("create_ssma_accident_submission") && app.includes("variant.submitAs.slug"));
  assert.ok(app.includes("Escolha o tipo de ocorrência"), "tipo obrigatório antes de preencher");
});
await check("lista de Near Misses: mesmo critério do indicador, período inclusivo, mais recentes primeiro", () => {
  const forms = [
    { id: "a", checklist_slug: "riscos-apontados", occurred_at: "2026-10-06T15:00:00Z", field_values: { classificacao: "Quase-acidente", local: "A" } },
    { id: "b", checklist_slug: "riscos-apontados", occurred_at: "2026-10-07T15:00:00Z", field_values: { classificacao: "Condição insegura" } },
  ];
  const recs = [{ id: "c", category: "Quase-acidente", location: "B", description: "x", occurred_at: "2026-11-01T15:00:00Z" }, { id: "d", category: "EPI", location: "B", description: "x", occurred_at: "2026-10-08T15:00:00Z" }];
  const all = dm.listNearMisses(forms, recs);
  assert.deepEqual(all.map((i) => i.id), ["c", "a"]);
  assert.deepEqual(dm.listNearMisses(forms, recs, { from: "2026-10-06", to: "2026-10-31" }).map((i) => i.id), ["a"]);
  assert.equal(all.length, dm.computeSsmaDashboardMetrics({ forms, fieldRecords: recs.map((r) => ({ ...r, kind: "OCORRENCIA", client_created_at: r.occurred_at, received_at: r.occurred_at, risk_level: "BAIXA", responsible_user_id: null, due_date: null, reported_by_user_id: "u" })), links: [], today: "2026-11-02" }).nearMisses);
});
await check("Dashboard: 'Near Misses (quase-acidentes)' com período e acesso aos registros; página de registros tem o filtro", () => {
  const dash = read("../apps/web/app/[projectId]/dashboard/page.tsx");
  assert.ok(dash.includes('label="Near Misses (quase-acidentes)"') && dash.includes("ssma-registros#near-misses") && dash.includes("near-miss-period"));
  const reg = read("../apps/web/app/[projectId]/ssma-registros/page.tsx");
  assert.ok(reg.includes('id="near-misses"') && reg.includes('name="de"') && reg.includes('name="ate"'));
});

console.log(`\nResumo: ${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
