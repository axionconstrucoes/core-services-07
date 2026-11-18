// Seleção DETERMINÍSTICA da regra da Matriz de SLA quando há linhas ativas
// duplicadas para a mesma chave (risco + área; área null = regra geral).
// Puro, sem banco. Reproduz o caso real da WEG: duas regras gerais ativas
// para CRITICAL (1/1/2 criada em 20/09 e 1/2/3 criada em 22/09) e duas para
// HIGH (4/4/4 em 20/09 e 4/6/8 em 22/09).
//
// Uso: node scripts/test-sla-matrix-rule-selection.mjs

import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveMatrixRule, resolveGenericMatrixRule, pickDeterministicMatrixRule, findDuplicateMatrixRules } =
  await import("../apps/web/lib/sla/resolve-matrix-rule");
const { computeEscalation } = await import("../apps/web/lib/sla/compute-escalation");
const { resolveMatrixPolicy, matrixPolicySnapshot } = await import("../apps/web/lib/sla/resolve-matrix-policy");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const PROJECT = "00000000-0000-4000-8000-000000000001";
function rule(id, riskLevel, timeUnit, a, e2, b, createdAt, extra = {}) {
  return {
    id,
    projectId: PROJECT,
    riskLevel,
    area: null,
    timeUnit,
    assumeDeadlineValue: a,
    respondDeadlineValue: null,
    completeDeadlineValue: null,
    escalation2AfterValue: e2,
    boardAfterValue: b,
    notifyByEmail: true,
    requiresAcknowledgmentConfirmation: true,
    requiresDelayJustification: true,
    isDefault: false,
    active: true,
    createdAt,
    ...extra,
  };
}

const CRIT_OLD = rule("de804a0d-cdec-4ed4-be78-0cdd4d0e2859", "CRITICAL", "CLOCK_HOURS", 1, 1, 2, "2026-09-20T23:14:45.329Z");
const CRIT_NEW = rule("ab8fed99-0990-4611-9f0d-abbd196718e7", "CRITICAL", "CLOCK_HOURS", 1, 2, 3, "2026-09-22T18:58:40.107Z");
const HIGH_OLD = rule("0ddc9440-b0ef-4f0d-8681-ad886e4a8a97", "HIGH", "BUSINESS_HOURS", 4, 4, 4, "2026-09-20T23:14:45.329Z");
const HIGH_NEW = rule("b92ed86f-c29c-4a2b-bea9-8cf92888b223", "HIGH", "BUSINESS_HOURS", 4, 6, 8, "2026-09-22T18:58:35.525Z");
const WEG = [CRIT_OLD, CRIT_NEW, HIGH_OLD, HIGH_NEW];

check("a ordem devolvida pelo banco não muda a regra escolhida (CRITICAL)", () => {
  const a = resolveMatrixRule([CRIT_OLD, CRIT_NEW], "CRITICAL", "PLANEJAMENTO");
  const b = resolveMatrixRule([CRIT_NEW, CRIT_OLD], "CRITICAL", "PLANEJAMENTO");
  assert(a.ruleId === b.ruleId, `escolhas diferentes: ${a.ruleId} vs ${b.ruleId}`);
  assert(a.ruleId === CRIT_OLD.id, `esperava a regra mais antiga (efetiva em produção), veio ${a.ruleId}`);
  assert(a.escalation2AfterValue === 1 && a.boardAfterValue === 2, "valores da regra efetiva");
  assert(a.ignoredDuplicateRuleIds.length === 1 && a.ignoredDuplicateRuleIds[0] === CRIT_NEW.id, "duplicata listada");
});

check("a ordem devolvida pelo banco não muda a regra escolhida (HIGH, geral)", () => {
  const a = resolveGenericMatrixRule([HIGH_NEW, HIGH_OLD], "HIGH");
  const b = resolveGenericMatrixRule([HIGH_OLD, HIGH_NEW], "HIGH");
  assert(a.ruleId === HIGH_OLD.id && b.ruleId === HIGH_OLD.id, "HIGH deve escolher 4/4/4 (efetiva)");
});

check("todas as permutações escolhem a mesma linha", () => {
  const perms = [
    [CRIT_OLD, CRIT_NEW, HIGH_OLD, HIGH_NEW],
    [HIGH_NEW, CRIT_NEW, HIGH_OLD, CRIT_OLD],
    [CRIT_NEW, HIGH_NEW, CRIT_OLD, HIGH_OLD],
  ];
  for (const p of perms) {
    assert(resolveMatrixRule(p, "CRITICAL", "ENGENHARIA").ruleId === CRIT_OLD.id, "CRITICAL instável");
    assert(resolveMatrixRule(p, "HIGH", "ENGENHARIA").ruleId === HIGH_OLD.id, "HIGH instável");
  }
});

check("desempate por id quando created_at é igual; sem data vai para o fim", () => {
  const x = rule("bbbb", "LOW", "BUSINESS_DAYS", 3, 3, 2, "2026-09-20T00:00:00Z");
  const y = rule("aaaa", "LOW", "BUSINESS_DAYS", 5, 5, 5, "2026-09-20T00:00:00Z");
  const z = rule("0000", "LOW", "BUSINESS_DAYS", 9, 9, 9, null);
  const { selected, ignored } = pickDeterministicMatrixRule([x, z, y]);
  assert(selected.id === "aaaa", `esperava aaaa, veio ${selected.id}`);
  assert(ignored.map((r) => r.id).join(",") === "bbbb,0000", "ordem dos ignorados");
});

check("regra específica da área continua tendo prioridade sobre a geral", () => {
  const areaRule = { ...rule("area-1", "CRITICAL", "CLOCK_HOURS", 2, 2, 2, "2026-10-01T00:00:00Z"), area: "PLANEJAMENTO" };
  const r = resolveMatrixRule([...WEG, areaRule], "CRITICAL", "PLANEJAMENTO");
  assert(r.ruleId === "area-1", "área específica deve vencer");
  assert(resolveMatrixRule([...WEG, areaRule], "CRITICAL", "ENGENHARIA").ruleId === CRIT_OLD.id, "outra área usa a geral");
});

check("regras inativas não participam do desempate", () => {
  const r = resolveMatrixRule([{ ...CRIT_OLD, active: false }, CRIT_NEW], "CRITICAL", "PLANEJAMENTO");
  assert(r.ruleId === CRIT_NEW.id && r.ignoredDuplicateRuleIds.length === 0, "inativa ignorada");
});

check("sem regra do projeto cai no default (ruleId null)", () => {
  const r = resolveMatrixRule([], "MEDIUM", "PLANEJAMENTO");
  assert(r.isDefault === true && r.ruleId === null, "default");
});

check("findDuplicateMatrixRules lista exatamente os grupos duplicados da WEG", () => {
  const groups = findDuplicateMatrixRules([...WEG, rule("m1", "MEDIUM", "BUSINESS_DAYS", 1, 1, 1, "2026-09-20T23:14:45Z")]);
  assert(groups.length === 2, `esperava 2 grupos, veio ${groups.length}`);
  const crit = groups.find((g) => g.riskLevel === "CRITICAL");
  const high = groups.find((g) => g.riskLevel === "HIGH");
  assert(crit.selectedRuleId === CRIT_OLD.id && crit.ignoredRuleIds[0] === CRIT_NEW.id, "grupo CRITICAL");
  assert(high.selectedRuleId === HIGH_OLD.id && high.ignoredRuleIds[0] === HIGH_NEW.id, "grupo HIGH");
});

check("CRITICAL efetivo: Gestor após T+60 min (T+61) e Diretoria após T+120 min (T+121)", () => {
  const r = resolveMatrixRule(WEG, "CRITICAL", "PLANEJAMENTO");
  const t0 = new Date("2026-11-18T12:00:00Z");
  const assumeDueAt = new Date(t0.getTime() + 60 * 60_000).toISOString();
  const at = (min) =>
    computeEscalation({
      status: "OPEN",
      currentEscalationLevel: "RESPONSAVEL",
      acknowledgedAt: null,
      completedAt: null,
      assumeDueAt,
      respondDueAt: null,
      completeDueAt: null,
      contractualDeadline: null,
      now: new Date(t0.getTime() + min * 60_000).toISOString(),
      rule: r,
    }).recommendedLevel;
  assert(at(60) === "RESPONSAVEL", `T+60 deveria seguir no responsável, veio ${at(60)}`);
  assert(at(61) === "ESCALAO_1", `T+61 deveria ir ao Gestor, veio ${at(61)}`);
  assert(at(120) === "ESCALAO_1", `T+120 ainda no Gestor, veio ${at(120)}`);
  assert(at(121) === "DIRETORIA", `T+121 deveria ir à Diretoria, veio ${at(121)}`);
});

check("snapshot da política grava a regra escolhida e as duplicatas ignoradas", () => {
  const policy = resolveMatrixPolicy({ rules: WEG, responsibles: [], settings: null, area: "PLANEJAMENTO", riskLevel: "HIGH" });
  const snap = matrixPolicySnapshot(policy);
  assert(snap.ruleId === HIGH_OLD.id, "ruleId no snapshot");
  assert(Array.isArray(snap.ignoredDuplicateRuleIds) && snap.ignoredDuplicateRuleIds[0] === HIGH_NEW.id, "duplicatas no snapshot");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
