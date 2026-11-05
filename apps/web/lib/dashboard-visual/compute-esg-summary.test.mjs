import assert from "node:assert/strict";
import test from "node:test";
import { computeEsgSummary } from "./compute-esg-summary.ts";

const TODAY = "2026-11-05";
let seq = 0;
const ob = (id, over = {}) => ({
  id, title: `Obrig ${id}`, category: "DDS", responsibleLabel: "Resp", responsibleName: null,
  requiredEvidenceDescription: null, active: true, ...over,
});
const sub = (obligationId, over = {}) => ({
  id: `s${++seq}`, obligationId, referenceDate: "2026-11-01", dueDate: null, status: "PENDENTE",
  riskLevel: null, reviewedAt: "2026-11-02T00:00:00Z", createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z", ...over,
});
const ev = (submissionId) => ({ id: `e${++seq}`, submissionId });
const ids = (list) => list.map((i) => i.obligationId).sort();

test("sem obrigações: tudo zero", () => {
  const s = computeEsgSummary([], [], [], TODAY);
  assert.equal(s.occurrences, 0);
  assert.deepEqual([s.cumprida, s.pendente, s.vencida, s.dispensada, s.aguardandoRevisao, s.evidenciaPendente, s.open], [0, 0, 0, 0, 0, 0, 0]);
});

test("partição: cumprida+pendente+vencida+dispensada == occurrences; items batem com contagens", () => {
  const obs = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ob(id));
  const subs = [
    sub("a", { status: "CUMPRIDO" }),
    sub("b", { status: "PENDENTE", dueDate: "2026-11-10" }),
    sub("c", { status: "NAO_CUMPRIDO", dueDate: "2026-10-01" }),
    sub("d", { status: "DISPENSADO" }),
    sub("e", { status: "NAO_APLICAVEL" }),
    sub("f", { status: "CUMPRIDO_PARCIALMENTE", dueDate: "2026-11-04" }),
  ]; // g sem comprovação
  const s = computeEsgSummary(obs, subs, [], TODAY);
  assert.equal(s.cumprida + s.pendente + s.vencida + s.dispensada, s.occurrences);
  assert.deepEqual([s.cumprida, s.pendente, s.vencida, s.dispensada], [1, 2, 2, 2]);
  assert.equal(s.open, s.pendente + s.vencida);
  for (const k of ["cumprida", "pendente", "vencida", "dispensada", "aguardandoRevisao", "evidenciaPendente"]) {
    assert.equal(s.items[k].length, s[k], k);
  }
  assert.deepEqual(ids(s.items.pendente), ["b", "g"]);
  assert.equal(s.items.pendente.find((i) => i.obligationId === "g").status, null);
});

test("fronteira de prazo: vence hoje = pendente; ontem = vencida; sem prazo = pendente", () => {
  const obs = [ob("hoje"), ob("ontem"), ob("sem")];
  const subs = [
    sub("hoje", { dueDate: TODAY }),
    sub("ontem", { dueDate: "2026-11-04" }),
    sub("sem", { dueDate: null }),
  ];
  const s = computeEsgSummary(obs, subs, [], TODAY);
  assert.deepEqual(ids(s.items.pendente), ["hoje", "sem"]);
  assert.deepEqual(ids(s.items.vencida), ["ontem"]);
});

test("dispensada/não aplicável nunca é pendente nem vencida, mesmo com prazo passado", () => {
  const s = computeEsgSummary([ob("a"), ob("b")], [
    sub("a", { status: "DISPENSADO", dueDate: "2020-01-01" }),
    sub("b", { status: "NAO_APLICAVEL", dueDate: "2020-01-01" }),
  ], [], TODAY);
  assert.deepEqual([s.dispensada, s.pendente, s.vencida, s.open], [2, 0, 0, 0]);
});

test("comprovação vigente: maior reference_date; empate por created_at e updated_at", () => {
  const o = [ob("a"), ob("b"), ob("c")];
  const subs = [
    sub("a", { referenceDate: "2026-10-01", status: "CUMPRIDO" }),
    sub("a", { referenceDate: "2026-11-01", status: "PENDENTE" }),
    sub("b", { status: "CUMPRIDO", createdAt: "2026-11-01T10:00:00Z" }),
    sub("b", { status: "PENDENTE", createdAt: "2026-11-01T11:00:00Z" }),
    sub("c", { status: "CUMPRIDO", updatedAt: "2026-11-01T12:00:00Z" }),
    sub("c", { status: "PENDENTE", updatedAt: "2026-11-01T09:00:00Z" }),
  ];
  const s = computeEsgSummary(o, subs, [], TODAY);
  assert.deepEqual(ids(s.items.pendente), ["a", "b"]);
  assert.deepEqual(ids(s.items.cumprida), ["c"]);
});

test("evidência pendente: exige evidência + CUMPRIDO/PARCIAL + zero anexos", () => {
  const o = [ob("a", { requiredEvidenceDescription: "foto" }), ob("b", { requiredEvidenceDescription: "foto" }),
    ob("c"), ob("d", { requiredEvidenceDescription: "foto" }), ob("e", { requiredEvidenceDescription: "foto" })];
  const sa = sub("a", { status: "CUMPRIDO" });
  const sb = sub("b", { status: "CUMPRIDO" });
  const sc = sub("c", { status: "CUMPRIDO" });
  const sd = sub("d", { status: "PENDENTE" });
  const se = sub("e", { status: "CUMPRIDO_PARCIALMENTE" });
  const s = computeEsgSummary(o, [sa, sb, sc, sd, se], [ev(sb.id)], TODAY);
  assert.deepEqual(ids(s.items.evidenciaPendente), ["a", "e"]);
  assert.equal(s.evidencePending, 2);
  assert.equal(s.items.cumprida.find((i) => i.obligationId === "b").evidenceCount, 1);
});

test("aguardando revisão: vigente sem reviewed_at (inclui dispensas); sem comprovação não conta", () => {
  const o = [ob("a"), ob("b"), ob("c"), ob("d")];
  const s = computeEsgSummary(o, [
    sub("a", { reviewedAt: null }),
    sub("b", { reviewedAt: null, status: "DISPENSADO" }),
    sub("c", { reviewedAt: "2026-11-03T00:00:00Z", status: "CUMPRIDO" }),
  ], [], TODAY);
  assert.deepEqual(ids(s.items.aguardandoRevisao), ["a", "b"]);
  assert.equal(s.aguardandoRevisao, 2);
});

test("obrigações inativas são ignoradas", () => {
  const s = computeEsgSummary([ob("a", { active: false }), ob("b")], [sub("a", { status: "CUMPRIDO" })], [], TODAY);
  assert.equal(s.occurrences, 1);
  assert.equal(s.cumprida, 0);
  assert.equal(s.pendente, 1);
});

test("risco e última atualização preservados", () => {
  const s = computeEsgSummary([ob("a")], [sub("a", { riskLevel: "HIGH", updatedAt: "2026-11-04T00:00:00Z" })], [], TODAY);
  assert.equal(s.countsByRisk.HIGH, 1);
  assert.equal(s.lastUpdatedAt, "2026-11-04T00:00:00Z");
});
