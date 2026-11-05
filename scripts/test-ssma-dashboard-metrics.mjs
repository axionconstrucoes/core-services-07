// Indicadores estruturados de SSMA do Dashboard (lib/ssma/dashboard-metrics.ts): zero × sem dado,
// classificação por campo (não por regex), ações corretivas abertas/atrasadas. Uso: node scripts/test-ssma-dashboard-metrics.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { computeSsmaDashboardMetrics, findPossibleDuplicates } = await import("../apps/web/lib/ssma/dashboard-metrics.ts");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (error) { console.log(`FAIL ${name}\n     ${error.message}`); failed += 1; }
}
const TODAY = "2026-11-05";
const form = (slug, afastamento, occurred = "2026-10-20T12:00:00Z", extra = {}) => ({ checklist_slug: slug, occurred_at: occurred, field_values: afastamento === undefined ? {} : { afastamento, ...extra } });
const rec = (over = {}) => ({
  id: "r", kind: "INSPECAO", category: "c", description: "d", location: "l", occurred_at: "2026-10-30T10:00:00Z", client_created_at: "2026-10-30T10:00:00Z",
  received_at: "2026-10-30T10:01:00Z", risk_level: "BAIXA", responsible_user_id: null, due_date: null, reported_by_user_id: "u", ssma_corrective_actions: null, ...over,
});
const action = (status, due_date) => ({ id: "a", status, due_date, concluded_at: status === "CONCLUIDA" ? "2026-11-01T00:00:00Z" : null, responsible_user_id: "u2" });

console.log("\n======================================\nSSMA — INDICADORES ESTRUTURADOS DO DASHBOARD\n======================================");
check("sem nenhum registro SSMA: tudo é 'sem dado' (null), nunca zero", () => {
  const m = computeSsmaDashboardMetrics({ forms: [], fieldRecords: [], today: TODAY });
  assert.equal(m.hasData, false);
  for (const key of ["accidentsWithLeave", "accidentsWithoutLeave", "accidentsUnclassified", "occurrences", "daysWithoutAccident", "openCorrectiveActions", "overdueCorrectiveActions", "criticalOpen"]) assert.equal(m[key], null, key);
});
check("com registros e nenhum acidente: ZERO verdadeiro (0), dias sem acidente continua sem base (null)", () => {
  const m = computeSsmaDashboardMetrics({ forms: [form("fotos-diarias")], fieldRecords: [], today: TODAY });
  assert.equal(m.hasData, true);
  assert.deepEqual([m.accidentsWithLeave, m.accidentsWithoutLeave, m.occurrences, m.openCorrectiveActions, m.overdueCorrectiveActions], [0, 0, 0, 0, 0]);
  assert.equal(m.daysWithoutAccident, null);
});
check("acidentes pelo CAMPO estruturado 'afastamento' (não por texto): com, sem e não classificado", () => {
  const forms = [form("ocorrencia-acidente", "Com afastamento"), form("ocorrencia-acidente", "Sem afastamento"), form("ocorrencia-acidente", "Sem afastamento"), form("ocorrencia-acidente", undefined)];
  const m = computeSsmaDashboardMetrics({ forms, fieldRecords: [], today: TODAY });
  assert.deepEqual([m.accidentsWithLeave, m.accidentsWithoutLeave, m.accidentsUnclassified, m.occurrences], [1, 2, 1, 4]);
});
check("texto livre NÃO vira acidente: 'acidente com afastamento' em outro formulário não conta", () => {
  const forms = [{ checklist_slug: "riscos-apontados", occurred_at: "2026-10-01T00:00:00Z", field_values: { descricao: "quase acidente; houve acidente com afastamento ontem" } }];
  const m = computeSsmaDashboardMetrics({ forms, fieldRecords: [], today: TODAY });
  assert.deepEqual([m.accidentsWithLeave, m.accidentsWithoutLeave, m.occurrences, m.daysWithoutAccident], [0, 0, 0, null]);
});
check("dias sem acidente: desde o ÚLTIMO acidente registrado (calendário)", () => {
  const forms = [form("ocorrencia-acidente", "Sem afastamento", "2026-10-01T12:00:00Z"), form("ocorrencia-acidente", "Sem afastamento", "2026-10-26T08:00:00Z")];
  assert.equal(computeSsmaDashboardMetrics({ forms, fieldRecords: [], today: TODAY }).daysWithoutAccident, 10);
  assert.equal(computeSsmaDashboardMetrics({ forms: [form("ocorrencia-acidente", "Sem afastamento", "2026-11-05T01:00:00Z")], fieldRecords: [], today: TODAY }).daysWithoutAccident, 0);
});
check("registros de campo: ocorrências (kind OCORRENCIA) somam; inspeção não", () => {
  const m = computeSsmaDashboardMetrics({ forms: [], fieldRecords: [rec({ kind: "OCORRENCIA" }), rec({ kind: "INSPECAO" }), rec({ kind: "OCORRENCIA" })], today: TODAY });
  assert.equal(m.occurrences, 2);
  assert.deepEqual(m.sources, { forms: 0, fieldRecords: 3 });
});
check("ações corretivas: abertas, em atraso (prazo < hoje) e críticas em aberto; concluída não conta; formato objeto e array", () => {
  const records = [
    rec({ id: "1", risk_level: "CRITICA", ssma_corrective_actions: action("ABERTA", "2026-11-01") }),
    rec({ id: "2", risk_level: "ALTA", ssma_corrective_actions: [action("EM_ANDAMENTO", "2026-11-05")] }),
    rec({ id: "3", risk_level: "CRITICA", ssma_corrective_actions: action("CONCLUIDA", "2026-10-01") }),
    rec({ id: "4", risk_level: "BAIXA", ssma_corrective_actions: null }),
  ];
  const m = computeSsmaDashboardMetrics({ forms: [], fieldRecords: records, today: TODAY });
  assert.deepEqual([m.openCorrectiveActions, m.overdueCorrectiveActions, m.criticalOpen], [2, 1, 1]);
});
const fid = (n, slug = "ocorrencia-acidente", af = "Sem afastamento", at = "2026-10-20T12:00:00Z") => ({ id: `f${n}`, checklist_slug: slug, occurred_at: at, field_values: { afastamento: af } });
const rid = (n, over = {}) => rec({ id: `r${n}`, kind: "OCORRENCIA", ...over });
check("proximidade (até 24 h) é só SUGESTÃO: NADA é descontado, o total conta os dois e a possível duplicidade é informada", () => {
  const m = computeSsmaDashboardMetrics({ forms: [fid(1)], fieldRecords: [rid(1, { occurred_at: "2026-10-20T15:00:00Z" })], today: TODAY });
  assert.equal(m.occurrences, 2, "sem vínculo humano, 2 relatos = 2");
  assert.deepEqual(m.occurrenceSources, { forms: 1, fieldRecords: 1, confirmedSameFact: 0, possibleDuplicates: 1 });
  const sug = findPossibleDuplicates({ forms: [fid(1)], fieldRecords: [rid(1, { occurred_at: "2026-10-20T15:00:00Z" })] });
  assert.deepEqual(sug.map((p) => [p.formSubmissionId, p.fieldRecordId, p.gapMinutes]), [["f1", "r1", 180]]);
});
check("DOIS ACIDENTES DISTINTOS no mesmo intervalo: contam 2 (sem vínculo explícito nada é descontado)", () => {
  const forms = [fid(1, "ocorrencia-acidente", "Com afastamento", "2026-10-20T12:00:00Z"), fid(2, "ocorrencia-acidente", "Sem afastamento", "2026-10-20T18:00:00Z")];
  const m = computeSsmaDashboardMetrics({ forms, fieldRecords: [], today: TODAY });
  assert.deepEqual([m.occurrences, m.accidentsWithLeave, m.accidentsWithoutLeave, m.occurrenceSources.possibleDuplicates], [2, 1, 1, 0]);
  const withField = computeSsmaDashboardMetrics({ forms, fieldRecords: [rid(1, { occurred_at: "2026-10-20T13:00:00Z" })], today: TODAY });
  assert.equal(withField.occurrences, 3, "dois acidentes + uma ocorrência de campo = 3 até alguém confirmar");
});
check("vínculo EXPLÍCITO confirmado (SAME_FACT) desconta exatamente um relato; os registros originais permanecem", () => {
  const forms = [fid(1)], records = [rid(1, { occurred_at: "2026-10-20T15:00:00Z" })];
  const m = computeSsmaDashboardMetrics({ forms, fieldRecords: records, links: [{ form_submission_id: "f1", field_record_id: "r1", decision: "SAME_FACT" }], today: TODAY });
  assert.deepEqual([m.occurrences, m.occurrenceSources.confirmedSameFact, m.occurrenceSources.possibleDuplicates, m.sources], [1, 1, 0, { forms: 1, fieldRecords: 1 }]);
  assert.equal(findPossibleDuplicates({ forms, fieldRecords: records, links: [{ form_submission_id: "f1", field_record_id: "r1", decision: "SAME_FACT" }] }).length, 0);
});
check("decisão DISTINCT_FACTS: continua contando 2 e para de sugerir; vínculo para registro inexistente/de outro tipo não desconta; 1:1", () => {
  const forms = [fid(1)], records = [rid(1, { occurred_at: "2026-10-20T15:00:00Z" })];
  const distinct = computeSsmaDashboardMetrics({ forms, fieldRecords: records, links: [{ form_submission_id: "f1", field_record_id: "r1", decision: "DISTINCT_FACTS" }], today: TODAY });
  assert.deepEqual([distinct.occurrences, distinct.occurrenceSources.possibleDuplicates], [2, 0]);
  const ghost = computeSsmaDashboardMetrics({ forms, fieldRecords: records, links: [{ form_submission_id: "f1", field_record_id: "naoexiste", decision: "SAME_FACT" }, { form_submission_id: "fx", field_record_id: "r1", decision: "SAME_FACT" }], today: TODAY });
  assert.equal(ghost.occurrences, 2, "vínculo órfão não desconta");
  const insp = computeSsmaDashboardMetrics({ forms, fieldRecords: [rec({ id: "i1", kind: "INSPECAO", occurred_at: "2026-10-20T13:00:00Z" })], links: [{ form_submission_id: "f1", field_record_id: "i1", decision: "SAME_FACT" }], today: TODAY });
  assert.equal(insp.occurrences, 1, "inspeção não é ocorrência: vínculo ignorado");
  const dupLink = computeSsmaDashboardMetrics({ forms: [fid(1), fid(2, "ocorrencia-acidente", "Sem afastamento", "2026-10-20T13:00:00Z")], fieldRecords: records, links: [{ form_submission_id: "f1", field_record_id: "r1", decision: "SAME_FACT" }, { form_submission_id: "f2", field_record_id: "r1", decision: "SAME_FACT" }], today: TODAY });
  assert.equal(dupLink.occurrenceSources.confirmedSameFact, 1, "o mesmo registro de campo não é descontado duas vezes");
});
check("sugestões: 1 para 1 (mais próximo primeiro), fora de 24 h não sugere, sem id não sugere; links ausentes (tabela indisponível) não descontam", () => {
  const forms = [fid(1, "ocorrencia-acidente", "Sem afastamento", "2026-10-20T12:00:00Z"), fid(2, "ocorrencia-acidente", "Sem afastamento", "2026-10-20T20:00:00Z")];
  const records = [rid(1, { occurred_at: "2026-10-20T19:00:00Z" }), rid(2, { occurred_at: "2026-10-22T12:00:00Z" })];
  const sug = findPossibleDuplicates({ forms, fieldRecords: records });
  assert.deepEqual(sug.map((p) => `${p.formSubmissionId}-${p.fieldRecordId}`), ["f2-r1"], "só o par mais próximo e dentro de 24 h");
  assert.equal(computeSsmaDashboardMetrics({ forms, fieldRecords: records, today: TODAY }).occurrences, 4);
  assert.equal(findPossibleDuplicates({ forms: [{ checklist_slug: "ocorrencia-acidente", occurred_at: "2026-10-20T12:00:00Z", field_values: {} }], fieldRecords: records }).length, 0);
});
check("quase-acidente: categoria ESTRUTURADA 'Quase-acidente', com origem e período próprios; zero ≠ sem dado; só trilha B", () => {
  const records = [rec({ id: "q1", category: "Quase-acidente", occurred_at: "2026-10-10T10:00:00Z" }), rec({ id: "q2", category: "Quase-acidente", kind: "OCORRENCIA", occurred_at: "2026-10-25T10:00:00Z" }), rec({ id: "x", category: "EPI" }), rec({ id: "y", category: "quase acidente" })];
  const m = computeSsmaDashboardMetrics({ forms: [fid(1, "riscos-apontados")], fieldRecords: records, today: TODAY });
  assert.equal(m.nearMisses, 2, "só a categoria exata da lista fechada");
  assert.deepEqual(m.nearMissSource, { fieldRecords: 2, period: { firstAt: "2026-10-10T10:00:00.000Z", lastAt: "2026-10-25T10:00:00.000Z" } });
  const none = computeSsmaDashboardMetrics({ forms: [], fieldRecords: [rec({ category: "EPI" })], today: TODAY });
  assert.deepEqual([none.nearMisses, none.nearMissSource], [0, { fieldRecords: 0, period: null }], "zero registrado (há dados), sem período");
  const empty = computeSsmaDashboardMetrics({ forms: [], fieldRecords: [], today: TODAY });
  assert.deepEqual([empty.nearMisses, empty.nearMissSource], [null, null], "sem dado");
});
check("período dos dados identificado (primeiro e último fato); inspeção não conta como ocorrência", () => {
  const m = computeSsmaDashboardMetrics({ forms: [fid(1)], fieldRecords: [rec({ kind: "INSPECAO", occurred_at: "2026-10-20T13:00:00Z" })], today: TODAY });
  assert.equal(m.occurrences, 1);
  assert.deepEqual(m.period, { firstAt: "2026-10-20T12:00:00.000Z", lastAt: "2026-10-20T13:00:00.000Z" });
  assert.equal(computeSsmaDashboardMetrics({ forms: [], fieldRecords: [], today: TODAY }).period, null);
});
check("o Dashboard usa o módulo estruturado e não a heurística por regex de texto livre", () => {
  const page = readFileSync(new URL("../apps/web/app/[projectId]/dashboard/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("computeSsmaDashboardMetrics"));
  assert.ok(!/ssmaFormText|accidentWithLeaveRows|\/acidente\/\.test/.test(page), "heurística por regex ainda presente");
  assert.ok(page.includes('.from("ssma_field_records")') && page.includes("ssma_corrective_actions"));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
