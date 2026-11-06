// Porta de coleta por caixa + autenticação por delegação (puro, sem rede). Uso: node scripts/test-gmail-mailbox-gate.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GMAIL_READONLY_SCOPE, evaluateMailboxCollection, isCorporateMailbox, resolveMailboxWindowEnd, resolveMailboxWindowStart } from "./lib/gmail-mailbox-gate.mjs";
import { buildDelegationClaims, createDelegatedGmailAuth } from "./lib/gmail-delegated-auth.mjs";
import * as cfg from "./lib/gmail-delegation-config.mjs";

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); failed += 1; }
}
const NOW = new Date("2026-11-07T12:00:00Z");
const ready = (over = {}) => ({
  mailbox_address: "reynaldo@axion.com.br", corporate_authorization_status: "AUTORIZADA", individual_consent_status: "NAO_REGISTRADO",
  technical_permission_status: "CONFIRMADA", collection_enabled: true, period_start: "2026-08-20T00:00:00Z", period_end: "2026-12-31T00:00:00Z", revoked_at: null, ...over,
});

await check("G1 todas as condições atendidas => pode coletar; aceite individual NAO_REGISTRADO não bloqueia e não é fabricado", () => {
  const r = evaluateMailboxCollection(ready(), { now: NOW, allowlisted: true });
  assert.equal(r.canCollect, true); assert.deepEqual(r.blockers, []);
  assert.equal(r.states.individualConsent, "NAO_REGISTRADO");
});
await check("G2 sem registro de controle => bloqueia (nada é presumido)", () => {
  const r = evaluateMailboxCollection(null, { now: NOW, allowlisted: true });
  assert.equal(r.canCollect, false); assert.deepEqual(r.blockers, ["SEM_REGISTRO_DE_CONTROLE"]);
  assert.equal(r.states.corporateAuthorization, "NAO_REGISTRADA"); assert.equal(r.states.technicalPermission, "NAO_VERIFICADA");
});
await check("G3 cada condição ausente bloqueia isoladamente, com o motivo certo", () => {
  const cases = [
    [{ corporate_authorization_status: "NAO_REGISTRADA" }, "SEM_AUTORIZACAO_CORPORATIVA"],
    [{ technical_permission_status: "NAO_VERIFICADA" }, "PERMISSAO_TECNICA_NAO_CONFIRMADA"],
    [{ technical_permission_status: "FALHA" }, "PERMISSAO_TECNICA_NAO_CONFIRMADA"],
    [{ collection_enabled: false }, "COLETA_NAO_HABILITADA"],
    [{ revoked_at: "2026-11-01T00:00:00Z" }, "REVOGADA"],
    [{ individual_consent_status: "RECUSADO" }, "ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO"],
    [{ individual_consent_status: "REVOGADO" }, "ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO"],
    [{ period_start: "2026-12-01T00:00:00Z" }, "FORA_DO_PERIODO_AUTORIZADO"],
    [{ period_end: "2026-11-01T00:00:00Z" }, "FORA_DO_PERIODO_AUTORIZADO"],
    [{ period_end: null }, "PERIODO_NAO_DEFINIDO"],
    [{ period_start: null }, "PERIODO_NAO_DEFINIDO"],
    [{ mailbox_address: "alguem@gmail.com" }, "CAIXA_FORA_DO_DOMINIO_CORPORATIVO"],
  ];
  for (const [over, blocker] of cases) {
    const r = evaluateMailboxCollection(ready(over), { now: NOW, allowlisted: true });
    assert.equal(r.canCollect, false, blocker); assert.ok(r.blockers.includes(blocker), `${blocker}: ${r.blockers}`);
  }
});
await check("G4 caixa fora da lista explícita da obra => bloqueia mesmo com todo o resto pronto", () => {
  const r = evaluateMailboxCollection(ready(), { now: NOW, allowlisted: false });
  assert.equal(r.canCollect, false); assert.deepEqual(r.blockers, ["FORA_DA_LISTA_DA_OBRA"]);
});
await check("G5 aceite individual ACEITE_REGISTRADO/NAO_APLICAVEL não bloqueia; os 4 estados são reportados separadamente", () => {
  for (const st of ["ACEITE_REGISTRADO", "NAO_APLICAVEL"]) assert.equal(evaluateMailboxCollection(ready({ individual_consent_status: st }), { now: NOW, allowlisted: true }).canCollect, true);
  const s = evaluateMailboxCollection(ready(), { now: NOW, allowlisted: true }).states;
  assert.deepEqual(Object.keys(s).sort(), ["collectionActive", "corporateAuthorization", "individualConsent", "technicalPermission"]);
});
await check("G6 a janela de leitura nunca começa antes do período autorizado", () => {
  assert.equal(resolveMailboxWindowStart({ last_sync_at: "2026-01-01T00:00:00Z", period_start: "2026-08-20T00:00:00Z" }, null).toISOString(), "2026-08-20T00:00:00.000Z");
  assert.equal(resolveMailboxWindowStart({ last_sync_at: "2026-11-06T00:00:00Z", period_start: "2026-08-20T00:00:00Z" }, null).toISOString(), "2026-11-06T00:00:00.000Z");
  assert.equal(resolveMailboxWindowStart({}, null), null);
});
await check("G6b a janela de leitura nunca passa do fim do período autorizado", () => {
  assert.equal(resolveMailboxWindowEnd({ period_end: "2026-11-01T00:00:00Z" }, NOW).toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(resolveMailboxWindowEnd({ period_end: "2026-12-31T00:00:00Z" }, NOW).toISOString(), NOW.toISOString());
});
await check("G6c pré-cadastro, papel ADMINISTRADOR e lista da obra NÃO autorizam: sem registro de controle da caixa nada é coletado", () => {
  for (const ctx of [{ allowlisted: true }, { allowlisted: true, preRegistered: true, projectRole: "ADMINISTRADOR" }]) {
    const r = evaluateMailboxCollection(null, { now: NOW, ...ctx });
    assert.equal(r.canCollect, false); assert.deepEqual(r.blockers, ["SEM_REGISTRO_DE_CONTROLE"]);
  }
  const bare = { mailbox_address: "reynaldo@axion.com.br", corporate_authorization_status: "NAO_REGISTRADA", technical_permission_status: "NAO_VERIFICADA", collection_enabled: false };
  const r = evaluateMailboxCollection(bare, { now: NOW, allowlisted: true });
  for (const b of ["SEM_AUTORIZACAO_CORPORATIVA", "PERMISSAO_TECNICA_NAO_CONFIRMADA", "COLETA_NAO_HABILITADA", "PERIODO_NAO_DEFINIDO"]) assert.ok(r.blockers.includes(b), b);
});
await check("G7 só caixas corporativas explícitas", () => {
  assert.ok(isCorporateMailbox("Reynaldo@Axion.com.br")); assert.ok(!isCorporateMailbox("x@gmail.com")); assert.ok(!isCorporateMailbox("*@axion.com.br")); assert.ok(!isCorporateMailbox("axion.com.br"));
});
await check("D1 claims da delegação: escopo ÚNICO gmail.readonly, sub explícito, TTL limitado", () => {
  const c = buildDelegationClaims({ serviceAccountEmail: "acc-gmail-reader@meu-projeto.iam.gserviceaccount.com", mailbox: "reynaldo@axion.com.br", now: NOW });
  assert.equal(c.scope, GMAIL_READONLY_SCOPE); assert.equal(c.scope, "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(c.sub, "reynaldo@axion.com.br"); assert.equal(c.aud, "https://oauth2.googleapis.com/token"); assert.ok(c.exp - c.iat <= 3300);
  assert.throws(() => buildDelegationClaims({ serviceAccountEmail: "x@gmail.com", mailbox: "reynaldo@axion.com.br" }), /inválida/);
  assert.throws(() => buildDelegationClaims({ serviceAccountEmail: "a@p.iam.gserviceaccount.com", mailbox: "x@gmail.com" }), /corporativa/);
});
await check("D2 modo SEM CHAVE: assina via IAM, troca por token e NÃO vaza a assertion em caso de erro", async () => {
  let payload;
  const env = { GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT: "acc-gmail-reader@meu-projeto.iam.gserviceaccount.com" };
  const okFetch = async () => ({ ok: true, json: async () => ({ access_token: "tok-teste", expires_in: 3599 }) });
  const r = await createDelegatedGmailAuth({ mailbox: "reynaldo@axion.com.br", env, fetchImpl: okFetch, signJwt: async (p) => { payload = JSON.parse(p); return "JWT-ASSINADO-SECRETO"; } });
  assert.equal(r.mode, "KEYLESS_IAM_SIGNJWT"); assert.equal(payload.sub, "reynaldo@axion.com.br"); assert.equal(payload.scope, GMAIL_READONLY_SCOPE);
  assert.equal(r.auth.credentials.access_token, "tok-teste");
  const badFetch = async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthorized_client", error_description: "JWT-ASSINADO-SECRETO" }) });
  await assert.rejects(() => createDelegatedGmailAuth({ mailbox: "reynaldo@axion.com.br", env, fetchImpl: badFetch, signJwt: async () => "JWT-ASSINADO-SECRETO" }),
    (e) => e.message === "DWD_TOKEN_EXCHANGE_FAILED:unauthorized_client" && !e.message.includes("JWT-ASSINADO-SECRETO"));
});
await check("D3 modo COM CHAVE: valida o JSON sem ecoá-lo; recusa caixa fora do domínio e chave que não é de conta de serviço", async () => {
  await assert.rejects(() => createDelegatedGmailAuth({ mailbox: "x@gmail.com", env: {} }), /corporativa/);
  await assert.rejects(() => createDelegatedGmailAuth({ mailbox: "reynaldo@axion.com.br", env: { GOOGLE_GMAIL_DWD_KEY_JSON: "{segredo" } }), (e) => e.message === "GOOGLE_GMAIL_DWD_KEY_JSON inválido (não é JSON)." && !e.message.includes("segredo"));
  await assert.rejects(() => createDelegatedGmailAuth({ mailbox: "reynaldo@axion.com.br", env: { GOOGLE_GMAIL_DWD_KEY_JSON: JSON.stringify({ type: "authorized_user" }) } }), /não é uma chave de conta de serviço/);
});
await check("C1 identificadores confirmados do Google Cloud: coerentes entre si, no workflow e na documentação; escopo único readonly", () => {
  assert.equal(cfg.GOOGLE_CLOUD_PROJECT_ID, "axion-contract-intelligence");
  assert.equal(cfg.GMAIL_READER_SERVICE_ACCOUNT_EMAIL, `acc-gmail-reader@${cfg.GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com`);
  assert.match(cfg.GMAIL_READER_DWD_CLIENT_ID, /^\d{21}$/); assert.equal(cfg.GMAIL_READER_DWD_CLIENT_ID, "101242849785015243815");
  assert.ok(!cfg.GMAIL_READER_DWD_CLIENT_ID.includes("googleusercontent") && cfg.GMAIL_READER_DWD_CLIENT_ID !== cfg.GOOGLE_CLOUD_PROJECT_ID, "não confundir com cliente OAuth do login web / projeto");
  assert.equal(cfg.GMAIL_READER_DWD_SCOPE, GMAIL_READONLY_SCOPE);
  assert.equal(cfg.GOOGLE_DELEGATION_STATUS, "PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN");
  const wf = readFileSync(new URL("../.github/workflows/gmail-delegated-sync.yml", import.meta.url), "utf8");
  assert.ok(wf.includes(cfg.GMAIL_READER_SERVICE_ACCOUNT_EMAIL) && !/schedule:/.test(wf.replace(/#[^\n]*/g, "")), "workflow: conta confirmada e SEM schedule");
  const doc = readFileSync(new URL("../docs/gmail-delegacao-dominio-passo-a-passo.md", import.meta.url), "utf8");
  for (const v of [cfg.GOOGLE_CLOUD_PROJECT_ID, cfg.GMAIL_READER_SERVICE_ACCOUNT_EMAIL, cfg.GMAIL_READER_DWD_CLIENT_ID, cfg.GMAIL_READER_DWD_SCOPE]) assert.ok(doc.includes(v), `doc sem ${v}`);
});
await check("C2 sem credenciais versionadas: nenhum material de chave privada nos arquivos desta integração", () => {
  const files = ["./lib/gmail-delegated-auth.mjs", "./lib/gmail-delegation-config.mjs", "./lib/gmail-mailbox-gate.mjs", "../.github/workflows/gmail-delegated-sync.yml", "../docs/gmail-delegacao-dominio-passo-a-passo.md"];
  for (const f of files) assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY|"private_key"\s*:\s*"-----/.test(readFileSync(new URL(f, import.meta.url), "utf8")), f);
});
await check("S1 coletor: delegação é opt-in (padrão OAUTH_USUARIO), só leitura, sem alterar o caminho histórico", () => {
  const src = readFileSync(new URL("./gmail-inbound-sync.mjs", import.meta.url), "utf8");
  assert.ok(/ACC_GMAIL_AUTH_MODE \?\? "OAUTH_USUARIO"/.test(src), "padrão precisa ser OAUTH_USUARIO");
  assert.ok(src.includes("gmailCredentialNames(mailbox)") && src.includes("setCredentials"), "caminho OAuth histórico preservado");
  assert.ok(!/gmail\.(modify|send|compose|settings)|mail\.google\.com\/"/.test(src + readFileSync(new URL("./lib/gmail-delegated-auth.mjs", import.meta.url), "utf8")), "nenhum escopo além de readonly");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
