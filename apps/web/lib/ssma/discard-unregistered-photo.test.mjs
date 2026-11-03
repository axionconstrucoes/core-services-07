import assert from "node:assert/strict";
import test from "node:test";
import { discardUnregisteredSsmaPhoto } from "./discard-unregistered-photo.ts";

const SUB = "e0000000-0000-4000-8000-000000000001";
const PATH = `p/ssma/${SUB}/f-foto.jpg`;
const deps = (over = {}) => {
  const calls = { removed: [] };
  return {
    calls,
    authorize: async () => ({ data: true, error: null }),
    removeObject: async (p) => { calls.removed.push(p); return { error: null }; },
    ...over,
  };
};

test("autorizado: remove pelo Storage e responde 200", async () => {
  const d = deps();
  const r = await discardUnregisteredSsmaPhoto({ submissionId: SUB, storagePath: PATH }, d);
  assert.deepEqual([r.status, r.body.discarded, d.calls.removed], [200, true, [PATH]]);
});

test("não autorizado (false, null ou erro): nada é removido e a resposta é igual", async () => {
  for (const authorize of [async () => ({ data: false, error: null }), async () => ({ data: null, error: null }), async () => ({ data: true, error: new Error("x") })]) {
    const d = deps({ authorize });
    const r = await discardUnregisteredSsmaPhoto({ submissionId: SUB, storagePath: PATH }, d);
    assert.equal(r.status, 403);
    assert.equal(d.calls.removed.length, 0);
  }
});

test("entrada inválida: 400 sem consultar banco nem Storage", async () => {
  let asked = false;
  const d = deps({ authorize: async () => { asked = true; return { data: true, error: null }; } });
  for (const input of [{ submissionId: "x", storagePath: PATH }, { submissionId: SUB, storagePath: "" }, { submissionId: SUB, storagePath: "a/../b" }, { submissionId: SUB, storagePath: "a".repeat(513) }, { submissionId: 1, storagePath: PATH }]) {
    assert.equal((await discardUnregisteredSsmaPhoto(input, d)).status, 400);
  }
  assert.equal(asked, false);
  assert.equal(d.calls.removed.length, 0);
});

test("falha da API do Storage: 502 e não afirma que descartou", async () => {
  const r = await discardUnregisteredSsmaPhoto({ submissionId: SUB, storagePath: PATH }, deps({ removeObject: async () => ({ error: new Error("storage") }) }));
  assert.deepEqual([r.status, r.body.discarded], [502, false]);
});
