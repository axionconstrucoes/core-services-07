// Simetria do fallback do locatário Google Workspace (ACC_EMAIL_WORKSPACE_TENANT_DOMAINS) entre os caminhos de resposta
// por e-mail: token por item (decideTokenReply), SSMA (decideSsmaReply) e RISCO (authorizeReply / processAlertReplies).
// Antes: o caminho de risco não repassava `workspaceTenantDomains` (recusava, fail-closed, respostas internas legítimas de
// domínio sem DMARC/DKIM próprio). Depois: repassa; ausente/vazio continua fail-closed. Sem rede, banco ou e-mail.
// Uso: node scripts/test-email-workspace-tenant-symmetry.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const auth = await import("../apps/web/lib/email-replies/sender-authentication");
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const SENDER = "carlos.evandro@axion.com.br";
const DMARC_PASS = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=carlos.evandro@axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
// Domínio SEM DMARC/DKIM próprio: o Google assina com a chave padrão do locatário e o servidor registra dmarc=none.
const TENANT_ONLY = "mx.google.com; dkim=pass header.i=@axion-com-br.20230601.gappssmtp.com header.s=20230601; spf=pass smtp.mailfrom=carlos.evandro@axion.com.br; dmarc=none header.from=axion.com.br";
const TENANT_OTHER = "mx.google.com; dkim=pass header.i=@evil-com.20230601.gappssmtp.com header.s=20230601; spf=pass smtp.mailfrom=carlos.evandro@axion.com.br";
const base = {
  senderEmail: SENDER,
  profile: { userId: "u-carlos", email: SENDER, active: true },
  membershipStatus: "ACTIVE",
  alertRecipientUserIds: ["u-carlos"],
  allowlistUserIds: ["u-carlos"],
  activeForwardToUserId: null,
  corporateDomain: "axion.com.br",
  authenticationResults: TENANT_ONLY,
};
const authorize = (over = {}) => pipeline.authorizeReply({ ...base, ...over });

await check("1. Domínio principal com DMARC pass: aceito com ou sem a lista de locatário (resposta legítima continua aceita)", () => {
  assert(authorize({ authenticationResults: DMARC_PASS }).authorized === true);
  assert(authorize({ authenticationResults: DMARC_PASS, workspaceTenantDomains: ["axion.com.br"] }).authorized === true);
  assert(authorize({ authenticationResults: DMARC_PASS, workspaceTenantDomains: [] }).authorized === true);
});
await check("2. Locatário sem DMARC/DKIM próprio: RECUSADO por padrão (fail-closed) quando a lista está ausente/vazia", () => {
  assert(authorize().reason === "AUTH_NOT_ALIGNED", "ausente");
  assert(authorize({ workspaceTenantDomains: [] }).reason === "AUTH_NOT_ALIGNED", "vazia");
  assert(authorize({ workspaceTenantDomains: undefined }).reason === "AUTH_NOT_ALIGNED", "undefined");
});
await check("3. Domínio de Workspace PERMITIDO: o caminho de risco aceita a resposta interna legítima (simetria com o token por item)", () => {
  const r = authorize({ workspaceTenantDomains: ["axion.com.br"] });
  assert(r.authorized === true && r.userId === "u-carlos", JSON.stringify(r));
});
await check("4. Lista com OUTRO domínio não habilita o domínio do remetente (fail-closed)", () => {
  assert(authorize({ workspaceTenantDomains: ["outro.com.br"] }).reason === "AUTH_NOT_ALIGNED");
});
await check("5. Domínio ESTRANHO: remetente externo e chave de OUTRO locatário nunca são aceitos, mesmo com a lista habilitada", () => {
  const ext = authorize({ senderEmail: "carlos.evandro@evil.com", profile: { userId: "u-carlos", email: "carlos.evandro@evil.com", active: true }, workspaceTenantDomains: ["axion.com.br", "evil.com"] });
  assert(ext.reason === "NOT_CORPORATE", ext.reason);
  assert(authorize({ authenticationResults: TENANT_OTHER, workspaceTenantDomains: ["axion.com.br"] }).reason === "AUTH_NOT_ALIGNED", "gappssmtp de outro locatário");
  assert(authorize({ authenticationResults: "mx.google.com; dkim=pass header.i=@axion-com-br.20230601.gappssmtp.com.evil.com; spf=pass smtp.mailfrom=carlos.evandro@axion.com.br", workspaceTenantDomains: ["axion.com.br"] }).reason === "AUTH_NOT_ALIGNED", "sufixo forjado");
});
await check("6. ALIAS: e-mail diferente do cadastrado (alias +tag ou domínio secundário) não é aceito (remetente exato)", () => {
  const plus = authorize({ senderEmail: "carlos.evandro+acc@axion.com.br", workspaceTenantDomains: ["axion.com.br"] });
  assert(plus.reason === "UNKNOWN_SENDER", plus.reason);
  const secondary = authorize({ senderEmail: "carlos.evandro@axion.eng.br", workspaceTenantDomains: ["axion.com.br", "axion.eng.br"] });
  assert(secondary.reason === "NOT_CORPORATE", secondary.reason);
});
await check("7. Caixa vazia / sem Authentication-Results: recusado (AUTH_MISSING) e remetente vazio (NOT_CORPORATE)", () => {
  assert(authorize({ authenticationResults: null, workspaceTenantDomains: ["axion.com.br"] }).reason === "AUTH_MISSING");
  assert(authorize({ authenticationResults: "", workspaceTenantDomains: ["axion.com.br"] }).reason === "AUTH_MISSING");
  assert(authorize({ senderEmail: "", workspaceTenantDomains: ["axion.com.br"] }).reason === "NOT_CORPORATE");
});
await check("8. MAIÚSCULAS: remetente, lista e Authentication-Results em caixa mista são normalizados", () => {
  const r = authorize({
    senderEmail: "Carlos.Evandro@AXION.COM.BR",
    authenticationResults: TENANT_ONLY.replace("mx.google.com", "MX.Google.com").replace("carlos.evandro@axion.com.br", "Carlos.Evandro@AXION.COM.BR"),
    workspaceTenantDomains: auth.resolveWorkspaceTenantDomains({ ACC_EMAIL_WORKSPACE_TENANT_DOMAINS: " AXION.COM.BR ; " }),
  });
  assert(r.authorized === true, JSON.stringify(r));
});
await check("9. Conflito continua recusado: dmarc=fail / servidor não confiável vencem o fallback do locatário", () => {
  assert(authorize({ authenticationResults: `${TENANT_ONLY}; dmarc=fail header.from=axion.com.br`, workspaceTenantDomains: ["axion.com.br"] }).reason === "AUTH_FAILED");
  assert(authorize({ authenticationResults: TENANT_ONLY.replace("mx.google.com", "attacker.example"), workspaceTenantDomains: ["axion.com.br"] }).reason === "AUTH_UNTRUSTED");
});
await check("10. Demais barreiras do caminho de risco seguem valendo com o fallback (perfil, vínculo, destinatário, allowlist)", () => {
  const t = { workspaceTenantDomains: ["axion.com.br"] };
  assert(authorize({ ...t, membershipStatus: "REVOKED" }).reason === "MEMBERSHIP_INACTIVE");
  assert(authorize({ ...t, alertRecipientUserIds: [] }).reason === "NOT_RECIPIENT");
  assert(authorize({ ...t, allowlistUserIds: [] }).reason === "NOT_ALLOWLISTED");
  assert(authorize({ ...t, profile: null }).reason === "UNKNOWN_SENDER");
});
await check("11. Repasse (código-fonte): risco, SSMA e token por item leem a MESMA variável e repassam workspaceTenantDomains", () => {
  assert(/workspaceTenantDomains: ctx\.workspaceTenantDomains/.test(read("apps/web/lib/risk-alerts/replies/reply-pipeline.ts")), "authorizeReply");
  assert(/workspaceTenantDomains: options\.workspaceTenantDomains/.test(read("apps/web/lib/risk-alerts/replies/process-alert-replies.ts")), "processAlertReplies");
  assert(/workspaceTenantDomains: resolveWorkspaceTenantDomains\(env\)/.test(read("apps/web/lib/email-replies/risk-reply-dispatch.ts")), "dispatch");
  const ingest = read("scripts/weekly-schedule-email-ingest.mjs");
  assert((ingest.match(/workspaceTenantDomains: dispatch\.workspaceTenantDomains/g) ?? []).length >= 2, "ingest (2 caminhos)");
  assert(/workspaceTenantDomains: input\.workspaceTenantDomains/.test(read("apps/web/lib/ssma/field-notifications/replies.ts")), "SSMA decide");
  const ssma = read("scripts/lib/ssma-replies-phase.mjs");
  assert(/workspaceTenantDomains,/.test(ssma) && /resolveWorkspaceTenantDomains\(env\)/.test(ssma), "SSMA phase");
  assert(/resolveWorkspaceTenantDomains\(env\)/.test(read("scripts/lib/token-replies-phase.mjs")), "token phase");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
