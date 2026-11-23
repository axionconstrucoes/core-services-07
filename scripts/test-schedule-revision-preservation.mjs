// Preservacao de revisoes/linhas de base do cronograma e comparador de datas.
// Executa a funcao REAL compareScheduleDates (apps/web/lib/schedule/weekly-ingestion)
// com fixtures SINTETICAS (nenhum dado real, sem rede, sem banco) e valida por
// leitura estatica das migrations/codigo que uma revisao nova nunca substitui a anterior.
//
// Uso: node scripts/test-schedule-revision-preservation.mjs
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { compareScheduleDates } = await import("../apps/web/lib/schedule/weekly-ingestion/compare-schedule-dates");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");
const migrations = readdirSync(path.join(repoRoot, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
const allSql = migrations.map((f) => read(`supabase/migrations/${f}`)).join("\n");

let passed = 0;
let failed = 0;
function assert(c, m) {
  if (!c) throw new Error(m ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}
let seq = 0;
function act(uid, name, start, end, extra = {}) {
  seq += 1;
  return {
    id: `a${seq}`, externalTaskId: null, uniqueId: uid, wbs: null, outlineLevel: 1, parentTaskId: null, name,
    baselineStart: start, baselineEnd: end, plannedStart: start, plannedEnd: end, durationValue: 5, durationUnit: "d",
    totalFloatValue: 10, totalFloatUnit: "d", percentComplete: 0, isMilestone: false, isSummaryTask: false,
    isCritical: false, calendarName: null, status: "NO_PRAZO", ...extra,
  };
}
const snap = (id, activities, statusDate = null) => ({ scheduleVersionId: id, statusDate, activities, relations: [] });

// Revisoes sinteticas R1 (anterior) e R2 (nova).
const r1 = deepFreeze(snap("R1", [
  act("1", "Fundacao", "2026-01-05", "2026-01-30"),
  act("2", "Estrutura", "2026-02-02", "2026-03-13", { isCritical: true }),
  act("3", "Marco Entrega Estrutura", "2026-03-13", "2026-03-13", { isMilestone: true, totalFloatValue: 3 }),
  act("4", "Marco Mecanica", "2026-04-10", "2026-04-10", { isMilestone: true, totalFloatValue: 20 }),
  act("5", "Atividade Removida", "2026-02-01", "2026-02-05"),
  act("9", "Resumo", "2026-01-05", "2026-04-10", { isSummaryTask: true }),
]));
const r2 = deepFreeze(snap("R2", [
  act("1", "Fundacao", "2026-01-05", "2026-01-30"),
  act("2", "Estrutura", "2026-02-02", "2026-03-27", { isCritical: true }),
  act("3", "Marco Entrega Estrutura", "2026-03-27", "2026-03-27", { isMilestone: true, totalFloatValue: 0 }),
  act("4", "Marco Mecanica", "2026-04-03", "2026-04-03", { isMilestone: true, totalFloatValue: 20 }),
  act("6", "Atividade Nova", "2026-03-01", "2026-03-05"),
  act("9", "Resumo", "2026-01-05", "2026-04-10", { isSummaryTask: true }),
]));

console.log("compareScheduleDates (fixtures sinteticas)");
await check("lista alteracoes de data por atividade, ignorando resumo e inalteradas", () => {
  const c = compareScheduleDates(r2, r1, { asOf: "2026-03-20T00:00:00Z" });
  assert(c.matched === 4, `matched=${c.matched}`);
  assert(c.changed.length === 3, `changed=${c.changed.length}`);
  assert(!c.changed.some((x) => x.name === "Fundacao" || x.name === "Resumo"));
  const estrutura = c.changed.find((x) => x.name === "Estrutura");
  assert(estrutura.endDeltaDays === 14 && estrutura.startDeltaDays === 0 && estrutura.isCritical === true);
  assert(c.postponedCount === 2 && c.advancedCount === 1, `${c.postponedCount}/${c.advancedCount}`);
  assert(c.maxPostponementDays === 14);
});
await check("atividades adicionadas e removidas sao listadas (nunca sumidas em silencio)", () => {
  const c = compareScheduleDates(r2, r1, { asOf: "2026-03-20T00:00:00Z" });
  assert(c.addedKeys.join() === "uid:6" && c.removedKeys.join() === "uid:5", `${c.addedKeys}|${c.removedKeys}`);
});
await check("marcos ameacados: adiado, folga baixa e vencido sem conclusao", () => {
  const c = compareScheduleDates(r2, r1, { asOf: "2026-03-20T00:00:00Z" });
  const m = c.threatenedMilestones.find((x) => x.name === "Marco Entrega Estrutura");
  assert(m && m.reasons.includes("SLIPPED") && m.reasons.includes("LOW_FLOAT") && m.slipDays === 14, JSON.stringify(m));
  assert(!c.threatenedMilestones.some((x) => x.name === "Marco Mecanica"), "marco adiantado e com folga nao e ameacado");
  const late = compareScheduleDates(r2, r1, { asOf: "2026-04-20T00:00:00Z" });
  assert(late.threatenedMilestones.find((x) => x.name === "Marco Mecanica").reasons.join() === "OVERDUE_NOT_COMPLETE");
});
await check("marco concluido vencido nao e ameacado; status_date da revisao tem prioridade sobre asOf", () => {
  const done = snap("R3", [act("4", "Marco Mecanica", "2026-04-03", "2026-04-03", { isMilestone: true, percentComplete: 100 })]);
  const ref = snap("R2", [act("4", "Marco Mecanica", "2026-04-03", "2026-04-03", { isMilestone: true })]);
  assert(compareScheduleDates(done, ref, { asOf: "2026-06-01T00:00:00Z" }).threatenedMilestones.length === 0);
  const early = snap("R3", [act("4", "Marco Mecanica", "2026-04-03", "2026-04-03", { isMilestone: true })], "2026-03-01");
  assert(compareScheduleDates(early, ref, { asOf: "2026-06-01T00:00:00Z" }).threatenedMilestones.length === 0);
});
await check("nova revisao nao sobrescreve a anterior: entradas congeladas, comparacao nao as altera", () => {
  const before = JSON.stringify([r1, r2]);
  compareScheduleDates(r2, r1, { asOf: "2026-03-20T00:00:00Z" });
  assert(JSON.stringify([r1, r2]) === before);
  assert(r1.scheduleVersionId === "R1" && r1.activities.find((a) => a.uniqueId === "2").plannedEnd === "2026-03-13");
});
await check("revisao identica nao gera diferencas", () => {
  const c = compareScheduleDates(r1, r1, { asOf: "2026-03-20T00:00:00Z" });
  assert(c.changed.length === 0 && c.postponedCount === 0 && c.maxPostponementDays === null);
});

console.log("preservacao (migrations e codigo)");
await check("document_versions: unique (document_id, version_index) - cada revisao e uma linha propria", () => {
  assert(/unique \(document_id, version_index\)/.test(read("supabase/migrations/20260818195206_project_documents_foundation.sql")));
});
await check("schedule_versions e filha de document_versions (1 revisao = 1 versao de documento)", () => {
  const sql = read("supabase/migrations/20260818212923_schedule_foundation.sql");
  assert(/document_version_id uuid not null\s+references public\.document_versions/.test(sql));
  assert(/snapshot historico completo/.test(sql));
});
await check("nenhuma policy de INSERT/UPDATE/DELETE para clientes em schedule_versions/activities/task_relations", () => {
  const re = /create policy "[^"]+"\s+on public\.(schedule_versions|schedule_activities|schedule_task_relations)\s+for\s+(insert|update|delete|all)/i;
  assert(!re.test(allSql), "ha policy de escrita em tabela de cronograma");
});
await check("baseline oficial: historico preservado (superseded_at), FK restrict, 1 ativa, sem DELETE", () => {
  const sql = read("supabase/migrations/20260920120000_weekly_schedule_email_ingestion_foundation.sql");
  assert(/schedule_version_id uuid not null\s+references public\.schedule_versions \(id\) on delete restrict/.test(sql));
  assert(/project_schedule_baselines_one_active_idx\s+on public\.project_schedule_baselines \(project_id\)\s+where superseded_at is null/.test(sql));
  const fn = sql.slice(sql.indexOf("function public.set_project_schedule_baseline"), sql.indexOf("11.2"));
  assert(/update public\.project_schedule_baselines\s+set superseded_at/.test(fn) && !/delete from public\.project_schedule_baselines/.test(fn));
});
await check("pipeline MPP so apaga a schedule_version da MESMA document_version (reprocesso)", () => {
  const src = read("scripts/process-document-version.mjs");
  const deletes = [...src.matchAll(/\.from\(\s*"schedule_versions"\s*\)\s*\.delete\(\)\s*\.eq\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert(deletes.length >= 2 && deletes.every((c) => c === "document_version_id" || c === "id"), deletes.join());
  assert(!/schedule_versions"\s*\)\s*\.delete\(\)\s*\.(neq|in|lt|gt)/.test(src));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
