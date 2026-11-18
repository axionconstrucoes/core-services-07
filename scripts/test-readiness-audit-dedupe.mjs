// Auditoria de prontidão só na mudança de estado (apps/web/lib/risk-alerts/readiness-audit.ts): sem linha repetida a cada ciclo,
// nova linha quando o conjunto de bloqueios muda e linha READY quando os bloqueios são resolvidos.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-readiness-audit-dedupe.mjs
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { decideReadinessAudit, readinessDetail, NOT_READY_ACTION, READY_ACTION } = await import("../apps/web/lib/risk-alerts/readiness-audit");

const P = "00000000-0000-4000-8000-000000000001";
let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log(`OK   ${name}`); };

t("primeiro bloqueio grava NOT_READY", () => {
  const r = decideReadinessAudit(P, ["CONFIGURATION_REVIEW_REQUIRED"], null);
  assert.equal(r.outcome, "RECORDED_NOT_READY");
  assert.equal(r.event.action, NOT_READY_ACTION);
});
t("mesmo bloqueio (em qualquer ordem) não grava de novo", () => {
  const latest = { action: NOT_READY_ACTION, detail: readinessDetail(["B", "A"]) };
  const r = decideReadinessAudit(P, ["A", "B", "A"], latest);
  assert.equal(r.outcome, "UNCHANGED_NOT_READY");
  assert.equal(r.event, null);
});
t("conjunto de bloqueios diferente grava nova linha", () => {
  const latest = { action: NOT_READY_ACTION, detail: readinessDetail(["A"]) };
  assert.equal(decideReadinessAudit(P, ["A", "B"], latest).outcome, "RECORDED_NOT_READY");
});
t("bloqueios resolvidos gravam READY uma vez, citando o estado anterior", () => {
  const latest = { action: NOT_READY_ACTION, detail: readinessDetail(["A"]) };
  const r = decideReadinessAudit(P, [], latest);
  assert.equal(r.outcome, "RECORDED_READY");
  assert.equal(r.event.action, READY_ACTION);
  assert.match(r.event.detail, /Envio real bloqueado: A\./);
  assert.equal(decideReadinessAudit(P, [], { action: READY_ACTION, detail: r.event.detail }).outcome, "NONE");
});
t("sem bloqueio e sem histórico: nada", () => assert.equal(decideReadinessAudit(P, [], null).outcome, "NONE"));
t("linha legada (ordem original, não ordenada) gera no máximo uma linha nova", () => {
  const legacy = { action: NOT_READY_ACTION, detail: "Envio real bloqueado: B, A." };
  const first = decideReadinessAudit(P, ["B", "A"], legacy);
  assert.equal(first.outcome, "RECORDED_NOT_READY");
  assert.equal(decideReadinessAudit(P, ["B", "A"], { action: NOT_READY_ACTION, detail: first.event.detail }).outcome, "UNCHANGED_NOT_READY");
});
console.log(`RESULTADO: ${passed} passaram, 0 falharam`);
