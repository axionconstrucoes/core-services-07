// Limite de consultas de IA ao especialista: a reserva (ai_consult_reserve) acontece DEPOIS de validar permissão e o
// assunto e ANTES de chamar o provedor; recusada a reserva, a IA nunca é chamada. Puro, sem rede.
// Uso: node scripts/test-ai-consult-quota.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
register("./ts-module-resolver.mjs", import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runAlertConsult } = await import("../apps/web/lib/ai/alert-consult/run-alert-consult.ts");
const { runSsmaRecordConsult } = await import("../apps/web/lib/ssma/field-records/run-record-consult.ts");
const { withQuotaGate } = await import("../apps/web/lib/ai/governance/quota-gated-provider.ts");

let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log("OK  ", name);
  } catch (e) {
    failed += 1;
    console.log("FAIL", name, "->", String(e.message).split("\n")[0]);
  }
};

const P = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const subject = { projectId: P, subject: "risco", id: R, title: "t", projectName: "WEG", scope: "PROJECT", contextText: "ctx", sources: [] };
const expertResult = { response: { question: "q", answer: "a" }, audit: { providerId: "fake", model: null } };

function alertDeps(overrides = {}) {
  const calls = { reserve: 0, expert: 0 };
  return {
    calls,
    deps: {
      getPermission: async () => "COLABORADOR",
      loadSubject: async () => subject,
      reserve: async () => {
        calls.reserve += 1;
        return { ok: true };
      },
      // Frente N6: a reserva é feita na FRONTEIRA DO PROVEDOR — o Expert recebe a reserva e o provedor
      // (aqui simulado) só é chamado depois dela.
      runExpert: async (_expertId, _request, _q, reserve) => {
        const provider = withQuotaGate(
          { id: "fake", answerQuery: async () => ((calls.expert += 1), {}), generateAssessment: async () => ({}), consolidateExecutiveCuration: async () => ({}) },
          reserve ?? (async () => ({ ok: true }))
        );
        await provider.answerQuery({});
        return expertResult;
      },
      ...overrides(calls),
    },
  };
}
const input = { projectId: P, subject: "risco", id: R, specialtyId: "ssma", question: "O que fazer?" };

await check("alerta/risco: reserva recusada (limite) → a IA NÃO é chamada e o motivo é mostrado", async () => {
  const { deps, calls } = alertDeps((c) => ({ reserve: async () => (c.reserve++, { ok: false, error: "Limite diário atingido." }) }));
  const out = await runAlertConsult(deps, input);
  assert.equal(out.ok, false);
  assert.equal(out.error, "Limite diário atingido.");
  assert.equal(calls.expert, 0);
});
await check("alerta/risco: assunto inexistente ou sem permissão → nenhuma reserva é consumida", async () => {
  const a = alertDeps(() => ({ loadSubject: async () => null }));
  await runAlertConsult(a.deps, input);
  assert.equal(a.calls.reserve, 0);
  const b = alertDeps(() => ({ getPermission: async () => null }));
  await runAlertConsult(b.deps, input);
  assert.equal(b.calls.reserve, 0);
});
await check("alerta/risco: reserva aceita → uma reserva e uma chamada ao especialista", async () => {
  const { deps, calls } = alertDeps(() => ({}));
  const out = await runAlertConsult(deps, input);
  assert.equal(out.ok, true);
  assert.deepEqual(calls, { reserve: 1, expert: 1 });
});

const record = { id: R, category: "EPI", location: "Pátio", description: "d", kind: "OCORRENCIA", risk: "ALTA", occurredAt: "2026-11-06T10:00:00Z", action: null };
await check("SSMA: reserva recusada → consulta não chamada; registro inexistente → nenhuma reserva", async () => {
  let consulted = 0;
  let reserved = 0;
  const deps = {
    getPermission: async () => "COLABORADOR",
    loadRecord: async () => record,
    reserve: async () => (reserved++, { ok: false, error: "Limite." }),
    consult: async () => (consulted++, { ok: true, response: {}, meta: {}, question: "q" }),
  };
  const out = await runSsmaRecordConsult(deps, { projectId: P, recordId: R, question: "q" });
  assert.equal(out.ok, false);
  assert.equal(consulted, 0);
  await runSsmaRecordConsult({ ...deps, loadRecord: async () => null }, { projectId: P, recordId: R, question: "q" });
  assert.equal(reserved, 1, "registro inexistente não consome reserva");
});
await check("as duas server actions de consulta ligam o limite (reserveAiConsult) antes do especialista", () => {
  const alertAction = readFileSync(path.join(root, "apps/web/app/alertas/consulta-ia/[projectId]/[subject]/[id]/actions.ts"), "utf8");
  const ssmaAction = readFileSync(path.join(root, "apps/web/app/ssma/consult-actions.ts"), "utf8");
  assert.match(alertAction, /reserve: \(projectId, subject, id, expertId\) =>\s*reserveAiConsult\(supabase, projectId, subject === "risco" \? "RISCO" : "ALERTA", `\$\{subject\}:\$\{id\}`, expertId\)/);
  assert.match(ssmaAction, /reserve: \(pid, rid\) => reserveAiConsult\(supabase, pid, "SSMA", rid\)/);
});

console.log(failed ? `\n${failed} FALHA(S)` : "\nTUDO OK");
process.exit(failed ? 1 : 0);
