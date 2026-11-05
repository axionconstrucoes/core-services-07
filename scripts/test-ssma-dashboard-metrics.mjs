// Indicadores estruturados de SSMA do Dashboard (lib/ssma/dashboard-metrics.ts): zero × sem dado,
// classificação por campo (não por regex), ações corretivas abertas/atrasadas. Uso: node scripts/test-ssma-dashboard-metrics.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { computeSsmaDashboardMetrics } = await import("../apps/web/lib/ssma/dashboard-metrics.ts");

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
check("o Dashboard usa o módulo estruturado e não a heurística por regex de texto livre", () => {
  const page = readFileSync(new URL("../apps/web/app/[projectId]/dashboard/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("computeSsmaDashboardMetrics"));
  assert.ok(!/ssmaFormText|accidentWithLeaveRows|\/acidente\/\.test/.test(page), "heurística por regex ainda presente");
  assert.ok(page.includes('.from("ssma_field_records")') && page.includes("ssma_corrective_actions"));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
