// Campo "Obra" dos formulários SSMA/ESG: seleção inicial, autorização local, limpeza de campos dependentes
// e conservação da obra em registros pendentes (fila), com recusa do servidor na sincronização.
// Uso: node scripts/test-ssma-project-selection.mjs
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const sel = await import("../apps/web/lib/ssma/project-selection.ts");
const { filterRecords } = await import("../apps/web/lib/ssma/field-records/filters.ts");
const ref = await import("../apps/web/lib/ssma/esg-reference.ts");
const { createFieldQueue, TransportError } = await import("../apps/web/lib/ssma/field-records/queue-core.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}

const A = { id: "p-a", label: "OBRA A", members: [{ userId: "u-1", name: "Ana" }, { userId: "u-2", name: "Bruno" }] };
const B = { id: "p-b", label: "OBRA B", members: [{ userId: "u-1", name: "Ana" }, { userId: "u-3", name: "Caio" }] };

console.log("\n======================================\nSSMA/ESG — CAMPO OBRA\n======================================");

await check("dentro de uma obra: preenche com a obra atual", () => {
  assert.deepEqual(sel.resolveInitialProject([A, B], "p-b"), { projectId: "p-b", reason: "context" });
});
await check("fora de obra, um único projeto ativo: seleciona automaticamente", () => {
  assert.deepEqual(sel.resolveInitialProject([A], null), { projectId: "p-a", reason: "single" });
  assert.deepEqual(sel.resolveInitialProject([A]), { projectId: "p-a", reason: "single" });
});
await check("vários projetos e nenhum contexto: exige seleção; sem projetos: none", () => {
  assert.deepEqual(sel.resolveInitialProject([A, B], null), { projectId: null, reason: "needs-selection" });
  assert.deepEqual(sel.resolveInitialProject([], "p-a"), { projectId: null, reason: "none" });
});
await check("contexto fora da lista autorizada NÃO é aceito (obra arbitrária)", () => {
  assert.deepEqual(sel.resolveInitialProject([A, B], "p-x"), { projectId: null, reason: "needs-selection" });
  assert.deepEqual(sel.resolveInitialProject([A], "p-x"), { projectId: "p-a", reason: "single" });
  assert.equal(sel.isAuthorizedProject([A, B], "p-x"), false);
  assert.equal(sel.isAuthorizedProject([A, B], ""), false);
  assert.equal(sel.isAuthorizedProject([A, B], "p-b"), true);
  assert.equal(sel.findProject([A, B], "p-x"), null);
});
await check("trocar de obra: responsável que não é membro da nova obra é limpo (com o prazo); membro é mantido", () => {
  const kept = sel.reconcileDependentFields({ responsibleUserId: "u-1", dueDate: "2026-12-01" }, B);
  assert.deepEqual(kept, { fields: { responsibleUserId: "u-1", dueDate: "2026-12-01" }, cleared: [] });
  const cleared = sel.reconcileDependentFields({ responsibleUserId: "u-2", dueDate: "2026-12-01" }, B);
  assert.deepEqual(cleared.fields, { responsibleUserId: "", dueDate: "" });
  assert.deepEqual(cleared.cleared, ["responsavel", "prazo"]);
  assert.deepEqual(sel.reconcileDependentFields({ responsibleUserId: "u-2", dueDate: "" }, B).cleared, ["responsavel"]);
  assert.deepEqual(sel.reconcileDependentFields({ responsibleUserId: "", dueDate: "" }, B).cleared, []);
  assert.deepEqual(sel.reconcileDependentFields({ responsibleUserId: "u-2", dueDate: "x" }, null).fields.responsibleUserId, "");
});

// --- fila: a obra do registro pendente é a gravada, não a da navegação ---
function memoryStore() {
  const records = new Map(), blobs = new Map();
  return {
    put: async (i) => void records.set(i.clientId, structuredClone(i)),
    get: async (id) => (records.has(id) ? structuredClone(records.get(id)) : null),
    list: async () => [...records.values()].map((i) => structuredClone(i)),
    delete: async (id) => void records.delete(id),
    putBlob: async (k, b) => void blobs.set(k, b), getBlob: async (k) => blobs.get(k) ?? null, deleteBlob: async (k) => void blobs.delete(k),
  };
}
const draft = (over = {}) => ({ kind: "OCORRENCIA", category: "Quase-acidente", description: "Quase queda de material", location: "Bloco B", occurredAt: "2026-11-05T10:00:00Z", risk: "ALTA", responsibleUserId: null, dueDate: null, ...over });
function setup(deny = []) {
  const sent = [];
  let n = 0;
  const queue = createFieldQueue({
    store: memoryStore(),
    transport: {
      currentUserId: async () => "u-1",
      submitRecord: async (item) => { sent.push(item.projectId); if (deny.includes(item.projectId)) throw new TransportError("SERVER", "x", "PROJECT_ACCESS_DENIED"); },
      uploadPhoto: async () => {}, registerPhoto: async () => {}, confirmPhoto: async () => {},
    },
    hashBlob: async () => "h", now: () => new Date("2026-11-05T12:00:00Z"), newId: () => `id-${++n}`,
  });
  return { queue, sent };
}

await check("registro pendente conserva a obra ESCOLHIDA ao salvar e ao sincronizar, mesmo navegando em outra obra", async () => {
  const { queue, sent } = setup();
  const item = await queue.save({ userId: "u-1", projectId: "p-b", draft: draft(), photos: [] }); // navegando em p-a, escolheu p-b
  assert.equal(sel.pendingRecordProjectId(item, "p-a"), "p-b");
  await queue.save({ userId: "u-1", projectId: "p-a", draft: draft({ description: "Outro fato" }), photos: [] });
  const stored = await queue.listForUser("u-1");
  assert.deepEqual(stored.map((i) => i.projectId).sort(), ["p-a", "p-b"]);
  await queue.sync("u-1");
  assert.deepEqual([...sent].sort(), ["p-a", "p-b"], "cada registro foi enviado para a sua própria obra");
});
await check("servidor recusa obra sem autorização na sincronização: FAILED permanente, nada é redirecionado para outra obra", async () => {
  const { queue, sent } = setup(["p-b"]);
  await queue.save({ userId: "u-1", projectId: "p-b", draft: draft(), photos: [] });
  await queue.sync("u-1");
  const [item] = await queue.listForUser("u-1");
  assert.equal(item.status, "FAILED");
  assert.equal(item.permanentError, true);
  assert.equal(item.projectId, "p-b");
  assert.deepEqual(sent, ["p-b"]);
});

await check("filtros da consulta: categoria (quase-acidente), tipo, risco e periodo combinados", () => {
  const R = (id, category, kind, risk, occurredAt) => ({ id, category, kind, risk, occurredAt });
  const all = [R(1, "Quase-acidente", "OCORRENCIA", "ALTA", "2026-10-10T10:00:00Z"), R(2, "Quase-acidente", "INSPECAO", "BAIXA", "2026-10-20T10:00:00Z"), R(3, "EPI", "OCORRENCIA", "ALTA", "2026-10-12T10:00:00Z")];
  assert.deepEqual(filterRecords(all, { category: "Quase-acidente" }).map((r) => r.id), [1, 2]);
  assert.deepEqual(filterRecords(all, { category: "Quase-acidente", risk: "ALTA" }).map((r) => r.id), [1]);
  assert.deepEqual(filterRecords(all, { from: "2026-10-11", to: "2026-10-20" }).map((r) => r.id), [2, 3]);
  assert.deepEqual(filterRecords(all, { kind: "INSPECAO" }).map((r) => r.id), [2]);
  assert.equal(filterRecords(all, {}).length, 3);
});
await check("vinculo ESG: so Administrador em qualquer comprovacao; demais so na propria; mensagens de erro do banco", () => {
  const subs = [{ id: "s1", filled_by_user_id: "u-1" }, { id: "s2", filled_by_user_id: "u-2" }];
  assert.deepEqual(ref.eligibleSubmissions(subs, "u-1", false).map((s) => s.id), ["s1"]);
  assert.equal(ref.eligibleSubmissions(subs, "u-1", true).length, 2);
  assert.match(ref.esgReferenceErrorMessage("FORBIDDEN"), /permiss/);
  assert.match(ref.esgReferenceErrorMessage('relation "esg_ssma_record_references" does not exist'), /ainda n/);
  assert.match(ref.ESG_REFERENCE_NOTICE, /não é marcada como cumprida/i);
});

console.log(`\nResumo:${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
