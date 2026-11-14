// Diagnóstico seguro de falhas do gmail.users.messages.send (puro, sem rede, sem banco, sem e-mail).
// Uso: node scripts/test-gmail-send-error.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.fetch = async () => {
  throw new Error("NETWORK_BLOCKED");
};
register("./ts-module-resolver.mjs", import.meta.url);
register("./lib/weg-alert-sim/hooks.mjs", import.meta.url);
const { classifyGmailSendError, formatGmailSendDiagnostic, responseWithoutIdDiagnostic, extractGmailSendDiagnosticText } = await import("../apps/web/lib/email/gmail-send-error");
const { isPreNetworkRetryable } = await import("../apps/web/lib/risk-alerts/run-pilot-single-alert");
const { sanitizeError } = await import("../apps/web/lib/risk-alerts/supabase-store");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m ?? ""} esperado=${b} obtido=${a}`);
};

const SECRET = "ya29.SEGREDO-ACCESS-TOKEN";
const REFRESH = "1//SEGREDO-REFRESH";
const gaxios = (status, body, extra = {}) => ({
  message: `Request failed with status code ${status} Authorization: Bearer ${SECRET} refresh_token=${REFRESH}`,
  code: String(status),
  config: { url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send?key=SEGREDO", headers: { Authorization: `Bearer ${SECRET}` }, data: "raw=MIME-SECRETO" },
  response: { status, data: body, headers: { "x-goog-request-id": "req-abc123" } },
  ...extra,
});
const apiErr = (code, reason, status = "X") => ({ error: { code, message: `texto livre com ${SECRET}`, status, errors: [{ reason, domain: "global", message: "livre" }] } });
const tokenErr = (status, error) => ({
  message: "invalid_grant",
  code: String(status),
  config: { url: "https://oauth2.googleapis.com/token", data: `refresh_token=${REFRESH}` },
  response: { status, data: { error, error_description: "livre" }, headers: {} },
});

const cases = [
  ["400 requisição inválida", gaxios(400, apiErr(400, "invalidArgument", "INVALID_ARGUMENT")), 400, "INVALID_REQUEST", "DEFINITIVE", "SEND"],
  ["401 não autenticado", gaxios(401, apiErr(401, "authError", "UNAUTHENTICATED")), 401, "AUTH_UNAUTHORIZED", "DEFINITIVE", "SEND"],
  ["403 API do Gmail desativada", gaxios(403, apiErr(403, "accessNotConfigured", "PERMISSION_DENIED")), 403, "GMAIL_API_DISABLED", "DEFINITIVE", "SEND"],
  ["403 escopo insuficiente", gaxios(403, apiErr(403, "insufficientPermissions", "PERMISSION_DENIED")), 403, "INSUFFICIENT_SCOPE", "DEFINITIVE", "SEND"],
  ["403 cota/limite de usuário", gaxios(403, apiErr(403, "userRateLimitExceeded", "RESOURCE_EXHAUSTED")), 403, "QUOTA_EXCEEDED", "TEMPORARY", "SEND"],
  ["403 permissão negada genérica", gaxios(403, apiErr(403, "forbidden", "PERMISSION_DENIED")), 403, "PERMISSION_DENIED", "DEFINITIVE", "SEND"],
  ["404", gaxios(404, apiErr(404, "notFound")), 404, "NOT_FOUND", "DEFINITIVE", "SEND"],
  ["413 mensagem grande", gaxios(413, apiErr(413, "limitExceeded")), 413, "PAYLOAD_TOO_LARGE", "DEFINITIVE", "SEND"],
  ["429 limite de taxa", gaxios(429, apiErr(429, "rateLimitExceeded", "RESOURCE_EXHAUSTED")), 429, "RATE_LIMITED", "TEMPORARY", "SEND"],
  ["500", gaxios(500, apiErr(500, "backendError", "INTERNAL")), 500, "SERVER_ERROR", "UNCERTAIN", "SEND"],
  ["503", gaxios(503, apiErr(503, "backendError", "UNAVAILABLE")), 503, "SERVER_ERROR", "UNCERTAIN", "SEND"],
  ["token: invalid_grant", tokenErr(400, "invalid_grant"), 400, "AUTH_INVALID_GRANT", "DEFINITIVE", "AUTH_REFRESH"],
  ["token: invalid_client", tokenErr(401, "invalid_client"), 401, "AUTH_INVALID_CLIENT", "DEFINITIVE", "AUTH_REFRESH"],
  ["token: 503 (nada enviado)", tokenErr(503, "temporarily_unavailable"), 503, "SERVER_ERROR", "TEMPORARY", "AUTH_REFRESH"],
];
for (const [name, err, http, reason, cls, stage] of cases) {
  check(`classifica ${name}`, () => {
    const d = classifyGmailSendError(err);
    eq(d.httpStatus, http, "http");
    eq(d.reason, reason, "motivo");
    eq(d.classification, cls, "classe");
    eq(d.stage, stage, "etapa");
  });
}

check("timeout do SDK (ECONNABORTED/ETIMEDOUT) => INCERTO", () => {
  for (const code of ["ECONNABORTED", "ETIMEDOUT"]) {
    const d = classifyGmailSendError({ code, message: "timeout of 20000ms exceeded", config: { url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" } });
    eq(d.reason, "TIMEOUT");
    eq(d.classification, "UNCERTAIN");
    eq(d.httpStatus, null);
  }
});
check("AbortError/mensagem timeout sem código => INCERTO", () => {
  eq(classifyGmailSendError({ name: "AbortError", message: "aborted" }).classification, "UNCERTAIN");
  eq(classifyGmailSendError(new Error("request timed out")).reason, "TIMEOUT");
});
check("conexão perdida (ECONNRESET) no envio => INCERTO", () => {
  const d = classifyGmailSendError({ code: "ECONNRESET", config: { url: "https://gmail.googleapis.com/x" } });
  eq(d.reason, "CONNECTION_LOST");
  eq(d.classification, "UNCERTAIN");
});
check("conexão nunca estabelecida (ENOTFOUND/ECONNREFUSED) => TEMPORÁRIA", () => {
  for (const code of ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN"]) eq(classifyGmailSendError({ code }).classification, "TEMPORARY", code);
});
check("timeout/queda no endpoint de token (nada enviado) => TEMPORÁRIA", () => {
  const d = classifyGmailSendError({ code: "ETIMEDOUT", config: { url: "https://oauth2.googleapis.com/token" } });
  eq(d.stage, "AUTH_REFRESH");
  eq(d.classification, "TEMPORARY");
});
check("resposta incerta: 2xx sem id/threadId => INCERTO", () => {
  const d = responseWithoutIdDiagnostic();
  eq(d.classification, "UNCERTAIN");
  eq(d.reason, "RESPONSE_WITHOUT_ID");
});
check("erro desconhecido/não-objeto => INCERTO e nunca lança", () => {
  for (const v of [undefined, null, "boom", 42, new Error("x"), {}]) eq(classifyGmailSendError(v).classification, "UNCERTAIN");
});
check("correlação: id seguro é mantido; valor suspeito é descartado", () => {
  eq(classifyGmailSendError(gaxios(400, apiErr(400, "invalidArgument"))).correlationId, "req-abc123");
  const bad = gaxios(400, apiErr(400, "invalidArgument"));
  bad.response.headers = { "x-goog-request-id": "Bearer ya29.xxx com espaço" };
  eq(classifyGmailSendError(bad).correlationId, null);
});
check("headers como Headers (get) são suportados", () => {
  const e = gaxios(429, apiErr(429, "rateLimitExceeded"));
  e.response.headers = new Headers({ "x-goog-request-id": "req-xyz" });
  eq(classifyGmailSendError(e).correlationId, "req-xyz");
});
check("NUNCA vaza token, refresh, Authorization, MIME, URL com query nem texto livre", () => {
  const all = [...cases.map((c) => c[1]), gaxios(403, apiErr(403, "accessNotConfigured"), { stack: SECRET })];
  for (const err of all) {
    const d = classifyGmailSendError(err);
    const out = JSON.stringify(d) + formatGmailSendDiagnostic(d);
    for (const bad of [SECRET, REFRESH, "Bearer", "Authorization", "MIME-SECRETO", "SEGREDO", "key=", "texto livre", "livre"]) {
      if (out.includes(bad)) throw new Error(`vazou "${bad}" em ${out}`);
    }
  }
});
check("api code com conteúdo suspeito é descartado (allowlist de caracteres)", () => {
  const e = gaxios(400, { error: { errors: [{ reason: "tem espaço e ya29.token com / barras" }] } });
  eq(classifyGmailSendError(e).apiCode, null);
});
check("texto formatado NÃO contém o marcador pré-rede (falha pós-rede nunca é retentável pelo gate)", () => {
  for (const [, err] of cases) {
    const t = formatGmailSendDiagnostic(classifyGmailSendError(err));
    if (t.includes("antes de qualquer chamada de rede")) throw new Error("marcador presente");
  }
});


// ---- Integração com a persistência (sanitizeError do store) e com o gate de idempotência ----
const PREFIX = "GmailEmailProvider: falha ao enviar via Gmail API. ";
const allErrs = [...cases.map((c) => c[1]), { code: "ETIMEDOUT" }, { code: "ECONNRESET" }, {}, null];
check("sanitizeError do store PRESERVA o diagnóstico completo (sem '<redacted>' nem '<email>')", () => {
  for (const err of allErrs) {
    const text = PREFIX + formatGmailSendDiagnostic(classifyGmailSendError(err));
    const stored = sanitizeError(new Error(text));
    if (stored !== text) throw new Error(`alterado pelo sanitizeError: ${stored}`);
    if (/<redacted>|<email>/.test(stored)) throw new Error("redigido");
  }
});
check("extractGmailSendDiagnosticText recupera só o trecho seguro e ignora texto livre", () => {
  const d = formatGmailSendDiagnostic(classifyGmailSendError(cases[2][1]));
  eq(extractGmailSendDiagnosticText(PREFIX + d), d);
  eq(extractGmailSendDiagnosticText("erro livre com Bearer ya29.x [etapa=SEND http=403 api=a b]"), null);
  eq(extractGmailSendDiagnosticText(null), null);
  eq(extractGmailSendDiagnosticText(undefined), null);
});
const KEY = "0dc108da-409d-4792-907c-b21015d4e5ac:PILOT_SINGLE:c7bfe367-bac6-4263-8dd1-2b8b561e8cec";
const expected = { projectId: "p1", caseId: "0dc108da-409d-4792-907c-b21015d4e5ac", recipientUserId: "c7bfe367-bac6-4263-8dd1-2b8b561e8cec", idempotencyKey: KEY };
const rowWith = (lastError, extra = {}) => ({ idempotencyKey: KEY, projectId: "p1", caseId: expected.caseId, recipientUserId: expected.recipientUserId, status: "PENDING", attemptCount: 2, providerMessageId: null, sentAt: null, emailId: null, lastError, ...extra });
check("falha APÓS contato com o Gmail (qualquer classe) NUNCA é retentável pelo gate pré-rede", () => {
  for (const err of allErrs) {
    const lastError = sanitizeError(new Error(PREFIX + formatGmailSendDiagnostic(classifyGmailSendError(err))));
    if (isPreNetworkRetryable(rowWith(lastError), expected)) throw new Error(`retentável: ${lastError}`);
  }
  if (isPreNetworkRetryable(rowWith("GmailEmailProvider: falha ao enviar via Gmail API."), expected)) throw new Error("erro genérico antigo retentável");
});
check("controle: bloqueio genuíno pré-rede continua retentável (comportamento existente preservado)", () => {
  const pre = "GmailEmailProvider: remetente do piloto não configurado — envio bloqueado antes de qualquer chamada de rede.";
  eq(isPreNetworkRetryable(rowWith(pre, { attemptCount: 1 }), expected), true);
  eq(isPreNetworkRetryable(rowWith(pre, { attemptCount: 1, providerMessageId: "x" }), expected), false);
});

// Integração por texto-fonte (o provider importa "server-only"): o erro bruto nunca é logado e a falha continua fechada.
const src = read("apps/web/lib/email/gmail-email-provider.ts");
check("provider: catch usa o classificador e não registra o erro bruto", () => {
  if (!/catch \(error\) \{[\s\S]*?classifyGmailSendError\(error\)/.test(src)) throw new Error("catch sem classificador");
  if (/console\.(error|log|warn)\([^)]*\berror\b[^)]*\)/.test(src)) throw new Error("log do erro bruto");
});
check("provider: timeout configurado e resposta sem id continua lançando (fail-closed)", () => {
  if (!/timeout: GMAIL_SEND_TIMEOUT_MS/.test(src)) throw new Error("sem timeout");
  if (!/!providerMessageId \|\| !providerThreadId[\s\S]*?throw sendFailure\(responseWithoutIdDiagnostic\(\)\)/.test(src)) throw new Error("resposta sem id não falha fechado");
});
check("provider: mensagem de falha mantém o prefixo e o catch não retorna sucesso", () => {
  if (!/falha ao enviar via Gmail API\. \$\{text\}/.test(src)) throw new Error("prefixo");
  const block = src.slice(src.indexOf("messages.send("), src.indexOf("if (!providerMessageId"));
  if (/return \{/.test(block)) throw new Error("catch retorna sucesso");
});
check("auditoria do piloto não menciona WEG_INTERNAL_FOUR no detalhe gravado", () => {
  const s = read("apps/web/lib/risk-alerts/run-pilot-single-alert.ts");
  const line = s.split("\n").find((l) => l.includes("Execução manual única do piloto:"));
  if (!line || line.includes("WEG_INTERNAL_FOUR")) throw new Error("texto de auditoria incorreto");
});

console.log(`\n${passed} OK, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
