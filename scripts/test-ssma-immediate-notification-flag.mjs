// Aviso IMEDIATO de registro CRÍTICO (POST /api/ssma/field-records/notifications) respeita ACC_SSMA_NOTIFICATIONS_ENABLED.
// Importa a ROTA REAL e substitui só o que é externo (cliente de sessão, cliente admin, permissão e o módulo que envia e-mail)
// por stubs que CONTAM chamadas: assim se prova que, com a flag desligada, nenhum cliente de banco administrativo é criado e
// nenhum envio/provedor é acionado. Com a flag "true" as permissões, destinatários, deduplicação e travas do piloto seguem
// onde estavam (no módulo de envio, não alterado). Sem rede, sem banco, sem e-mail. Uso: node scripts/test-ssma-immediate-notification-flag.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

// Stubs (registrados DEPOIS do resolvedor de .ts, portanto interceptam primeiro).
const STUBS = {
  "@axion/db/server": "export async function createSupabaseServerClient(){ const n=globalThis.__notifTest; n.calls.server++; return { auth:{ getUser: async()=>({ data:{ user:n.user } }) } }; }",
  "@axion/db/admin": "export function createSupabaseAdminClient(){ const n=globalThis.__notifTest; n.calls.admin++; return { from:()=>({ select:()=>({ eq:()=>({ maybeSingle: async()=>({ data:n.record }) }) }) }) }; }",
  "@/lib/contract-review": "export async function getCurrentProjectPermission(){ return globalThis.__notifTest.permission; }",
  "@/lib/ssma/field-notifications/server": "export async function notifyCriticalRecord(){ const n=globalThis.__notifTest; n.calls.notify++; return n.summary; }",
};
const hooks = `const STUBS=${JSON.stringify(STUBS)};
export async function resolve(specifier, context, nextResolve){ if (STUBS[specifier]) return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true }; return nextResolve(specifier, context); }`;
register("data:text/javascript," + encodeURIComponent(hooks), import.meta.url);

const route = await import("../apps/web/app/api/ssma/field-records/notifications/route.ts");
const { ssmaNotificationsEnabled, NOTIFICATIONS_DISABLED } = await import("../apps/web/lib/ssma/field-notifications/enabled.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 300)}`); failed += 1; }
}

const RID = "11111111-1111-4111-8111-111111111111";
const ENV = "ACC_SSMA_NOTIFICATIONS_ENABLED";
const saved = process.env[ENV];
function fresh(over = {}) {
  globalThis.__notifTest = {
    calls: { server: 0, admin: 0, notify: 0 },
    user: { id: "user-autor" },
    record: { id: RID, project_id: "proj-1", reported_by_user_id: "user-autor", risk_level: "CRITICA" },
    permission: "COLABORADOR",
    summary: { sent: 1, failed: 0, noRecipient: false },
    ...over,
  };
  return globalThis.__notifTest;
}
function setFlag(value) { if (value === undefined) delete process.env[ENV]; else process.env[ENV] = value; }
const post = (body = JSON.stringify({ recordId: RID })) =>
  route.POST(new Request("http://acc.local/api/ssma/field-records/notifications", { method: "POST", headers: { "content-type": "application/json" }, body }));
const read = async (res) => ({ status: res.status, body: await res.json() });

console.log("\n======================================\nAVISO IMEDIATO DE REGISTRO CRÍTICO x ACC_SSMA_NOTIFICATIONS_ENABLED\n======================================");

await check("helper: só o valor EXATO \"true\" liga (ausente, vazio, false, TRUE, True, 1, yes, com espaço = desligado)", () => {
  assert.equal(ssmaNotificationsEnabled({}), false);
  for (const v of [undefined, "", "false", "FALSE", "TRUE", "True", "1", "0", "yes", "on", " true", "true ", "true\n"]) assert.equal(ssmaNotificationsEnabled({ [ENV]: v }), false, `valor ${JSON.stringify(v)} deve ficar desligado`);
  assert.equal(ssmaNotificationsEnabled({ [ENV]: "true" }), true);
  assert.equal(NOTIFICATIONS_DISABLED, "NOTIFICATIONS_DISABLED");
});

for (const [rotulo, valor] of [["AUSENTE", undefined], ["\"false\"", "false"]]) {
  await check(`flag ${rotulo}: 200 com estado explícito de desativadas; NENHUM cliente admin criado e NENHUM envio acionado; sem contagem SENT`, async () => {
    const n = fresh(); setFlag(valor);
    const r = await read(await post());
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { skipped: "NOTIFICATIONS_DISABLED", notificationsEnabled: false });
    assert.ok(!("sent" in r.body) && !("failed" in r.body), "não pode haver contagem de envio");
    assert.deepEqual(n.calls, { server: 1, admin: 0, notify: 0 }, "só o cliente de sessão (autenticação); admin e envio intocados");
  });
}
await check("flag com valores PARECIDOS (\"TRUE\", \"1\", \"true \", vazio): continua desligada, sem admin e sem envio", async () => {
  for (const v of ["TRUE", "True", "1", "true ", ""]) {
    const n = fresh(); setFlag(v);
    const r = await read(await post());
    assert.equal(r.status, 200); assert.equal(r.body.skipped, "NOTIFICATIONS_DISABLED");
    assert.deepEqual(n.calls, { server: 1, admin: 0, notify: 0 }, `valor ${JSON.stringify(v)}`);
  }
});
await check("flag desligada: a rota NÃO exige corpo válido nem registro (nada é lido), e a resposta é 200 (não é erro para a fila do app)", async () => {
  const n = fresh({ record: null }); setFlag(undefined);
  const r = await read(await post("isto não é json"));
  assert.equal(r.status, 200); assert.equal(r.body.notificationsEnabled, false);
  assert.deepEqual(n.calls, { server: 1, admin: 0, notify: 0 });
});
await check("flag desligada: SEM sessão continua 401 (autenticação vem primeiro) e nada é acionado", async () => {
  const n = fresh({ user: null }); setFlag(undefined);
  const r = await read(await post());
  assert.equal(r.status, 401);
  assert.deepEqual(n.calls, { server: 1, admin: 0, notify: 0 });
});

await check("flag \"true\" + autor do registro (Colaborador): o envio é acionado UMA vez e a resposta traz o resumo (permissões mantidas)", async () => {
  const n = fresh(); setFlag("true");
  const r = await read(await post());
  assert.equal(r.status, 200); assert.equal(r.body.sent, 1);
  assert.deepEqual(n.calls, { server: 1, admin: 1, notify: 1 });
});
await check("flag \"true\" + Administrador que NÃO é o autor: permitido; + outro membro que não é autor nem Administrador: 403 sem envio", async () => {
  let n = fresh({ record: { id: RID, project_id: "proj-1", reported_by_user_id: "outra-pessoa", risk_level: "CRITICA" }, permission: "ADMINISTRADOR" }); setFlag("true");
  let r = await read(await post());
  assert.equal(r.status, 200); assert.equal(n.calls.notify, 1);
  n = fresh({ record: { id: RID, project_id: "proj-1", reported_by_user_id: "outra-pessoa", risk_level: "CRITICA" }, permission: "COLABORADOR" });
  r = await read(await post());
  assert.equal(r.status, 403); assert.equal(n.calls.notify, 0);
  n = fresh({ permission: null });
  r = await read(await post());
  assert.equal(r.status, 403); assert.equal(n.calls.notify, 0);
});
await check("flag \"true\": sem sessão 401; recordId inválido 400; registro inexistente 404; nenhum envio nesses casos", async () => {
  let n = fresh({ user: null }); setFlag("true");
  assert.equal((await read(await post())).status, 401); assert.equal(n.calls.notify, 0);
  n = fresh();
  assert.equal((await read(await post(JSON.stringify({ recordId: "x" })))).status, 400); assert.equal(n.calls.notify, 0);
  assert.equal((await read(await post("não é json"))).status, 400);
  n = fresh({ record: null });
  assert.equal((await read(await post())).status, 404); assert.equal(n.calls.notify, 0);
});
await check("flag \"true\": o resultado do módulo de envio é repassado como antes (falha parcial 502; não crítico/ausente 200 com skipped)", async () => {
  setFlag("true");
  fresh({ summary: { sent: 0, failed: 1, noRecipient: false } });
  assert.equal((await read(await post())).status, 502);
  fresh({ summary: { skipped: "NOT_CRITICAL" } });
  const r = await read(await post());
  assert.equal(r.status, 200); assert.deepEqual(r.body, { skipped: "NOT_CRITICAL" });
});

await check("estrutura: a checagem da flag vem DEPOIS da autenticação e ANTES de criar o cliente admin e de acionar o envio", () => {
  const src = readFileSync(new URL("../apps/web/app/api/ssma/field-records/notifications/route.ts", import.meta.url), "utf8");
  const iAuth = src.indexOf("auth.getUser()"), iFlag = src.indexOf("ssmaNotificationsEnabled()"), iAdmin = src.indexOf("createSupabaseAdminClient()"), iNotify = src.indexOf("notifyCriticalRecord(admin");
  assert.ok(iAuth > 0 && iAuth < iFlag && iFlag < iAdmin && iFlag < iNotify, `ordem: auth=${iAuth} flag=${iFlag} admin=${iAdmin} notify=${iNotify}`);
  assert.ok(src.includes('permission !== "ADMINISTRADOR"') && src.includes("reported_by_user_id"), "permissões preservadas");
});
await check("não impede salvar/sincronizar: o transporte chama a rota em try/catch, sem converter a resposta em erro de transporte", () => {
  const src = readFileSync(new URL("../apps/web/lib/ssma/field-records/supabase-transport.ts", import.meta.url), "utf8");
  const start = src.indexOf('if (item.draft.risk === "CRITICA")');
  const end = src.indexOf("async uploadPhoto", start);
  const block = src.slice(start, end);
  assert.ok(start > 0 && /try\s*\{[\s\S]*fetch\("\/api\/ssma\/field-records\/notifications"[\s\S]*\}\s*catch/.test(block), "fetch dentro de try/catch");
  assert.ok(!block.includes("toTransportError") && !block.includes("throw"), "a resposta não vira erro");
});
await check("a varredura agendada continua fail-closed e o provedor/modo de envio não foram tocados por este ajuste", () => {
  const cron = readFileSync(new URL("../apps/web/app/api/cron/ssma-notifications/route.ts", import.meta.url), "utf8");
  assert.ok(cron.includes('process.env.ACC_SSMA_NOTIFICATIONS_ENABLED !== "true"') && cron.includes("isCronRequestAuthorized"));
  const server = readFileSync(new URL("../apps/web/lib/ssma/field-notifications/server.ts", import.meta.url), "utf8");
  assert.ok(server.includes("getEmailProvider()") && !server.includes("ACC_SSMA_NOTIFICATIONS_ENABLED"), "módulo de envio intacto");
});

setFlag(saved);
console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
