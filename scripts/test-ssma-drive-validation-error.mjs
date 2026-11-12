// Classificação segura dos erros da validação da pasta SSMA/ESG (código fechado, sem texto bruto).
// Uso: node scripts/test-ssma-drive-validation-error.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { classifySsmaDriveValidationError: classify, describeSsmaDriveValidationError: describe } = await import(
  "../apps/web/lib/integrations/esg-ssma/drive-validation-error.ts"
);

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`OK   ${name}`); passed += 1; }
  catch (error) { console.log(`FAIL ${name}\n     ${error.message}`); failed += 1; }
}

const SECRET = "1//0gSEGREDO-DE-TESTE-abc123";
const CLIENT = "123456-teste.apps.googleusercontent.com";
const gaxios = (status, data, message = "Request failed") => Object.assign(new Error(message), { response: { status, data }, status });

check("erros próprios da inspeção", () => {
  assert.equal(classify(new Error("INVALID_FOLDER_URL")), "URL_INVALIDA");
  assert.equal(classify(new Error("ROOT_IS_NOT_A_FOLDER")), "ORIGEM_NAO_E_PASTA");
  assert.equal(classify(new Error("MISSING_FOLDERS:01 - X|02 - Y")), "SUBPASTAS_AUSENTES");
  assert.equal(classify(new Error("DUPLICATED_FOLDERS:01 - X")), "SUBPASTAS_DUPLICADAS");
  assert.equal(classify(new Error("CONFIG_LOOKUP_FAILED")), "CONSULTA_INTERNA");
});

check("erros OAuth do endpoint de token", () => {
  assert.equal(classify(gaxios(401, { error: "invalid_client", error_description: `client ${CLIENT}` })), "OAUTH_INVALID_CLIENT");
  assert.equal(classify(gaxios(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })), "OAUTH_INVALID_GRANT");
  assert.equal(classify(gaxios(401, { error: "unauthorized_client" })), "OAUTH_UNAUTHORIZED_CLIENT");
  assert.equal(classify(gaxios(400, { error: "invalid_scope" })), "OAUTH_INVALID_SCOPE");
  assert.equal(classify(gaxios(401, { error: "deleted_client" })), "OAUTH_DELETED_CLIENT");
  assert.equal(classify(new Error("invalid_grant")), "OAUTH_INVALID_GRANT");
});

check("motivos da API do Drive", () => {
  const api = (status, reason) => gaxios(status, { error: { code: status, message: "x", errors: [{ reason, message: "x" }] } });
  assert.equal(classify(api(403, "insufficientPermissions")), "DRIVE_SEM_PERMISSAO");
  assert.equal(classify(api(403, "teamDriveMembershipRequired")), "DRIVE_SEM_ACESSO_AO_DRIVE_COMPARTILHADO");
  assert.equal(classify(api(404, "notFound")), "DRIVE_NAO_ENCONTRADO");
  assert.equal(classify(api(403, "accessNotConfigured")), "DRIVE_API_DESATIVADA");
  assert.equal(classify(api(429, "userRateLimitExceeded")), "DRIVE_COTA");
  assert.equal(classify(Object.assign(new Error("x"), { code: 403, errors: [{ reason: "forbidden" }] })), "DRIVE_SEM_PERMISSAO");
});

check("status HTTP sem motivo conhecido, rede e não classificado", () => {
  assert.equal(classify(gaxios(401, {})), "HTTP_401");
  assert.equal(classify(gaxios(403, { error: { errors: [{ reason: "algoNovo" }] } })), "HTTP_403");
  assert.equal(classify(gaxios(503, {})), "HTTP_5XX");
  assert.equal(classify(Object.assign(new Error("x"), { code: "ECONNRESET" })), "REDE");
  assert.equal(classify(new Error("qualquer coisa")), "NAO_CLASSIFICADO");
  assert.equal(classify(null), "NAO_CLASSIFICADO");
  assert.equal(classify("texto"), "NAO_CLASSIFICADO");
});

check("texto exibido nunca contém dado bruto (segredo, client id, URL, mensagem do provedor)", () => {
  const errors = [
    gaxios(401, { error: "invalid_client", error_description: `client ${CLIENT} secret ${SECRET}` }, `invalid_client ${SECRET}`),
    gaxios(404, { error: { errors: [{ reason: "notFound", message: "File not found: 1JOOqUI0ciQkTSkrdmbg0R9swcS9YdsF4" }] } }, "https://www.googleapis.com/drive/v3/files/1JOOq"),
    new Error(`falha inesperada ${SECRET} https://drive.google.com/x`),
  ];
  for (const err of errors) {
    const { code, message } = describe(err);
    assert.match(message, new RegExp(`\\(código: ${code}\\)$`));
    for (const forbidden of [SECRET, CLIENT, "googleapis", "drive.google.com", "1JOOq", "File not found"]) {
      assert.ok(!message.includes(forbidden), `vazou "${forbidden}"`);
    }
    assert.match(code, /^[A-Z0-9_]+$/);
  }
});

check("ação: sanitizador usa só o código fechado e registra só o código", () => {
  const src = readFileSync(new URL("../apps/web/app/[projectId]/integracoes/actions.ts", import.meta.url), "utf8");
  const start = src.indexOf("function sanitizeSsmaDriveValidationError");
  const fn = src.slice(start, src.indexOf("\n}", start) + 2);
  assert.ok(fn.includes("describeSsmaDriveValidationError(error)"));
  assert.match(fn, /console\.warn\(`\[ssma-drive-validation\] falha codigo=\$\{code\}`\)/);
  assert.ok(!/error\.message|String\(error\)|JSON\.stringify\(error/.test(fn), "não pode repassar o erro bruto");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
