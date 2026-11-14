// Verificação somente-leitura da autenticação Gmail do piloto (gmail-auth-check.ts): fetch injetado, nenhuma rede, nenhum e-mail.
// Uso: node scripts/test-gmail-auth-check.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.fetch = async () => {
  throw new Error("NETWORK_BLOCKED");
};
register("./ts-module-resolver.mjs", import.meta.url);
const { runGmailPilotAuthCheck, GMAIL_AUTH_CHECK_TOKEN_URL, GMAIL_AUTH_CHECK_USERINFO_URL } = await import("../apps/web/lib/email/gmail-auth-check");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? ""} esperado=${JSON.stringify(b)} obtido=${JSON.stringify(a)}`);
};

const CLIENT_ID = "1033164664091-abcdefghijklmnop.apps.googleusercontent.com";
const SECRET = "GOCSPX-SEGREDO-DO-CLIENTE";
const REFRESH = "1//0gREFRESH-SEGREDO";
const ACCESS = "ya29.ACCESS-SEGREDO";
const ENV = {
  ACC_PROJECT_PILOT_PROJECT_ID: "00000000-0000-4000-8000-000000000001",
  ACC_PROJECT_PILOT_DESTINATION: "axion@axion.com.br",
  ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br",
  GOOGLE_GMAIL_CLIENT_ID: CLIENT_ID,
  GOOGLE_GMAIL_CLIENT_SECRET: SECRET,
  GOOGLE_GMAIL_SENDER_EMAIL: "outro@axion.com.br",
  GOOGLE_GMAIL_REFRESH_TOKEN: "1//0gDEFAULT",
  GOOGLE_GMAIL_PILOT_REFRESH_TOKEN: REFRESH,
  GOOGLE_GMAIL_PILOT_SENDER_EMAIL: "crm@axion.com.br",
};
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function recorder(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { fetchImpl, calls };
}
const okFetch = (scope = "https://www.googleapis.com/auth/gmail.send openid https://www.googleapis.com/auth/userinfo.email", email = "crm@axion.com.br") =>
  recorder((url) => (url === GMAIL_AUTH_CHECK_TOKEN_URL ? resp(200, { access_token: ACCESS, expires_in: 3599, scope, token_type: "Bearer" }) : resp(200, { email })));
const LEAKS = [SECRET, REFRESH, ACCESS, CLIENT_ID, "GOCSPX", "ya29", "1//0g", "Bearer", "crm@axion.com.br", "axion@axion.com.br"];
const noLeak = (r) => {
  const out = JSON.stringify(r);
  for (const bad of LEAKS) if (out.includes(bad)) throw new Error(`vazou "${bad}"`);
};

await check("refresh token válido: renova, escopos conhecidos, conta confere, fingerprint (não o client id)", async () => {
  const f = okFetch();
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
  eq([r.ok, r.refreshed, r.stage, r.reason, r.classification, r.httpStatus], [true, true, "IDENTITY", "NONE", "NONE", 200]);
  eq(r.scopes, ["gmail.send", "openid", "userinfo.email"]);
  eq(r.accountMatchesSender, true);
  eq(r.configSource, "PILOT_SHARED_CLIENT");
  eq(r.clientIdFingerprint, createHash("sha256").update(CLIENT_ID).digest("hex").slice(0, 8));
  eq(r.gmailMessagesApiCalled, false);
  noLeak(r);
});
await check("NUNCA chama o Gmail de mensagens: só token endpoint e userinfo, com método fixo", async () => {
  const f = okFetch();
  await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
  eq(f.calls.map((c) => c.url), [GMAIL_AUTH_CHECK_TOKEN_URL, GMAIL_AUTH_CHECK_USERINFO_URL]);
  if (f.calls.some((c) => /gmail\.googleapis\.com|\/messages/.test(c.url))) throw new Error("chamou Gmail de mensagens");
});
await check("conta diferente do remetente => accountMatchesSender=false (sem expor e-mails)", async () => {
  const f = okFetch(undefined, "outra.pessoa@axion.com.br");
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
  eq(r.accountMatchesSender, false);
  noLeak(r);
  if (JSON.stringify(r).includes("outra.pessoa")) throw new Error("vazou e-mail");
});
await check("sem escopo userinfo.email => identidade não verificável (null) e userinfo não é chamado", async () => {
  const f = okFetch("https://www.googleapis.com/auth/gmail.send");
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
  eq([r.ok, r.accountMatchesSender], [true, null]);
  eq(f.calls.length, 1);
});
await check("escopos desconhecidos viram 'outro' (sem ecoar texto livre)", async () => {
  const f = okFetch("https://www.googleapis.com/auth/segredo.interno.xyz gmail.send");
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
  eq(r.scopes, ["gmail.send", "outro"]);
});

const failCases = [
  ["invalid_grant", 400, { error: "invalid_grant", error_description: `Token has been expired or revoked ${REFRESH}` }, "AUTH_INVALID_GRANT", "DEFINITIVE"],
  ["token revogado (invalid_grant)", 400, { error: "invalid_grant", error_description: "Token has been revoked." }, "AUTH_INVALID_GRANT", "DEFINITIVE"],
  ["invalid_client", 401, { error: "invalid_client", error_description: `The OAuth client was not found. ${CLIENT_ID}` }, "AUTH_INVALID_CLIENT", "DEFINITIVE"],
  ["unauthorized_client", 400, { error: "unauthorized_client" }, "AUTH_INVALID_CLIENT", "DEFINITIVE"],
  ["HTTP 400 genérico", 400, { error: "invalid_request" }, "AUTH_UNAUTHORIZED", "DEFINITIVE"],
  ["HTTP 429", 429, { error: "rate_limit_exceeded" }, "RATE_LIMITED", "TEMPORARY"],
  ["HTTP 500", 500, { error: "internal_failure" }, "SERVER_ERROR", "TEMPORARY"],
  ["HTTP 503", 503, {}, "SERVER_ERROR", "TEMPORARY"],
];
for (const [name, status, body, reason, cls] of failCases) {
  await check(`falha do refresh: ${name} => etapa AUTH_REFRESH, ${reason}/${cls}, sem vazamento, sem chamar userinfo`, async () => {
    const f = recorder(() => resp(status, body));
    const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
    eq([r.ok, r.refreshed, r.stage, r.httpStatus, r.reason, r.classification], [false, false, "AUTH_REFRESH", status, reason, cls]);
    eq(f.calls.length, 1);
    eq(r.clientIdFingerprint, createHash("sha256").update(CLIENT_ID).digest("hex").slice(0, 8));
    noLeak(r);
  });
}
await check("2xx sem access_token => falha (nunca ok)", async () => {
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: recorder(() => resp(200, { scope: "gmail.send" })).fetchImpl });
  eq([r.ok, r.refreshed], [false, false]);
});
await check("timeout (abort do controlador) => TIMEOUT/TEMPORARY, sem vazamento", async () => {
  const r = await runGmailPilotAuthCheck({
    env: ENV,
    timeoutMs: 20,
    fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error(`aborted ${REFRESH}`), { name: "AbortError" })))),
  });
  eq([r.ok, r.stage, r.reason], [false, "AUTH_REFRESH", "TIMEOUT"]);
  noLeak(r);
});
await check("falha de conexão (ENOTFOUND) => CONNECTION_NOT_ESTABLISHED/TEMPORARY", async () => {
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: async () => { throw Object.assign(new Error(`getaddrinfo ${SECRET}`), { code: "ENOTFOUND" }); } });
  eq([r.ok, r.reason, r.classification], [false, "CONNECTION_NOT_ESTABLISHED", "TEMPORARY"]);
  noLeak(r);
});
await check("erro sem estrutura reconhecida => UNKNOWN/UNCERTAIN, sem vazamento", async () => {
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: async () => { throw `boom ${SECRET}`; } });
  eq([r.ok, r.reason, r.classification], [false, "UNKNOWN", "UNCERTAIN"]);
  noLeak(r);
});
await check("corpo ilegível (json lança) => segue com o status, sem vazar", async () => {
  const r = await runGmailPilotAuthCheck({ env: ENV, fetchImpl: async () => ({ ok: false, status: 400, json: async () => { throw new Error(SECRET); } }) });
  eq([r.ok, r.httpStatus], [false, 400]);
  noLeak(r);
});

await check("configuração ausente: credenciais/refresh/remetente => CONFIG_MISSING sem chamar a rede", async () => {
  for (const drop of ["GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET", "GOOGLE_GMAIL_PILOT_REFRESH_TOKEN", "GOOGLE_GMAIL_PILOT_SENDER_EMAIL"]) {
    const env = { ...ENV };
    delete env[drop];
    const f = okFetch();
    const r = await runGmailPilotAuthCheck({ env, fetchImpl: f.fetchImpl });
    eq([r.ok, r.stage, r.reason, r.classification], [false, "CONFIG", "CONFIG_MISSING", "DEFINITIVE"], drop);
    eq(f.calls.length, 0, `${drop}: chamou a rede`);
    noLeak(r);
  }
});
await check("perfil do piloto ausente/inválido => CONFIG_INVALID/CONFIG_MISSING sem rede", async () => {
  for (const env of [{ ...ENV, ACC_PROJECT_PILOT_PROJECT_ID: "" }, { ...ENV, ACC_PROJECT_PILOT_SENDER: "x@evil.com" }, { ...ENV, ACC_PROJECT_PILOT_DESTINATION: "x@evil.com" }]) {
    const f = okFetch();
    const r = await runGmailPilotAuthCheck({ env, fetchImpl: f.fetchImpl });
    eq([r.ok, r.stage], [false, "CONFIG"]);
    eq(f.calls.length, 0);
  }
});
await check("cliente OAuth isolado do piloto: fingerprint e configSource refletem o par isolado; par incompleto => falha fechada", async () => {
  const f = okFetch();
  const iso = { ...ENV, GOOGLE_GMAIL_PILOT_CLIENT_ID: "999-isolado.apps.googleusercontent.com", GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "GOCSPX-ISOLADO" };
  const r = await runGmailPilotAuthCheck({ env: iso, fetchImpl: f.fetchImpl });
  eq(r.configSource, "PILOT_ISOLATED_CLIENT");
  eq(r.clientIdFingerprint, createHash("sha256").update("999-isolado.apps.googleusercontent.com").digest("hex").slice(0, 8));
  const half = { ...ENV, GOOGLE_GMAIL_PILOT_CLIENT_ID: "999-isolado" };
  const f2 = okFetch();
  const r2 = await runGmailPilotAuthCheck({ env: half, fetchImpl: f2.fetchImpl });
  eq([r2.ok, r2.stage, f2.calls.length], [false, "CONFIG", 0]);
});
await check("a requisição de refresh usa exatamente as credenciais do piloto (corpo form, sem logar)", async () => {
  const f = okFetch();
  await runGmailPilotAuthCheck({ env: ENV, fetchImpl: f.fetchImpl });
  const body = new URLSearchParams(f.calls[0].init.body);
  eq([body.get("client_id"), body.get("client_secret"), body.get("refresh_token"), body.get("grant_type")], [CLIENT_ID, SECRET, REFRESH, "refresh_token"]);
  eq(f.calls[0].init.method, "POST");
});

// Garantias estruturais por texto-fonte: sem envio, sem outbox, sem gmail.users, rota protegida e workflow restrito.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const mod = stripComments(read("apps/web/lib/email/gmail-auth-check.ts"));
const route = stripComments(read("apps/web/app/api/cron/risk-alerts/route.ts"));
const wf = read(".github/workflows/pilot-gmail-auth-check.yml");
await check("módulo: sem googleapis/messages.send/outbox/supabase/console", () => {
  for (const bad of [/googleapis["']\s*;|from "googleapis"/, /messages\.send|users\.messages/, /outbox|supabase|enqueue/i, /console\./]) if (bad.test(mod)) throw new Error(`proibido: ${bad}`);
});
await check("rota: o diagnóstico só roda DEPOIS da autenticação do cron e não passa pelo ciclo/outbox", () => {
  const iAuth = route.indexOf("isCronRequestAuthorized(request");
  const iCheck = route.indexOf("pilotAuthCheck");
  const iCycle = route.indexOf("runRiskAlertCycle({");
  if (!(iAuth >= 0 && iCheck > iAuth && iCheck < iCycle)) throw new Error("ordem incorreta");
  const block = route.slice(route.indexOf('get("pilotAuthCheck")'), route.indexOf("const dryRun"));
  if (/runPilotSingleAlert|runRiskAlertCycle|createSupabase|enqueue|markFailed|getEmailProvider/.test(block)) throw new Error("diagnóstico toca em envio/ciclo");
});
await check("workflow: só workflow_dispatch, só main, segredo só no header, sem send/confirm", () => {
  if (/schedule:|push:|pull_request/.test(wf)) throw new Error("gatilho indevido");
  if (!/workflow_dispatch:/.test(wf) || !/github\.ref == 'refs\/heads\/main'/.test(wf)) throw new Error("gatilho/branch");
  if (!/-H "Authorization: Bearer \$\{ACC_RISK_ALERTS_CRON_SECRET\}"/.test(wf) || /pilotSingleCase|mode=send|ENVIAR-UMA-VEZ/.test(wf)) throw new Error("conteúdo indevido");
});

console.log(`\n${passed} OK, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
