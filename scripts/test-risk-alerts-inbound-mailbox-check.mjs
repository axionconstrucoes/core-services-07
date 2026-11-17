// Diagnóstico somente-leitura da credencial de LEITURA das respostas (ACC_RISK_ALERTS_INBOUND_*). Sem rede real: fetch injetado.
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { runInboundMailboxCheck } = await import("./check-risk-alerts-inbound-mailbox.mjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

const SECRET = "GOCSPX-SEGREDO-LEITURA";
const REFRESH = "1//0gREFRESH-LEITURA";
const ACCESS = "ya29.ACCESS-LEITURA";
const CLIENT = "cliente-leitura.apps.googleusercontent.com";
const CRM = "crm@axion.com.br";
const ENV = (over = {}) => ({
  ACC_RISK_ALERTS_INBOUND_CLIENT_ID: CLIENT,
  ACC_RISK_ALERTS_INBOUND_CLIENT_SECRET: SECRET,
  ACC_RISK_ALERTS_INBOUND_REFRESH_TOKEN: REFRESH,
  ACC_RISK_ALERTS_INBOUND_MAILBOX: CRM,
  ...over,
});
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fetcher({ scope = "https://www.googleapis.com/auth/gmail.readonly", profile = CRM, tokenStatus = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://oauth2.googleapis.com/token") return tokenStatus === 200 ? json(200, { access_token: ACCESS, scope, token_type: "Bearer" }) : json(tokenStatus, { error: "invalid_grant" });
    if (String(url) === "https://gmail.googleapis.com/gmail/v1/users/me/profile") return json(200, { emailAddress: profile });
    throw new Error(`chamada inesperada: ${url}`);
  };
  return { impl, calls };
}
const noLeak = (r) => {
  const out = JSON.stringify(r);
  for (const bad of [SECRET, REFRESH, ACCESS, CLIENT, "GOCSPX", "ya29", "1//0g", "@axion.com.br", "Bearer"]) if (out.includes(bad)) throw new Error(`vazou "${bad}"`);
};

await check("tudo certo: refresh ok, gmail.readonly, conta = caixa configurada = crm@ => ok=true; só token + profile; nenhum vazamento", async () => {
  const f = fetcher();
  const r = await runInboundMailboxCheck(ENV(), f.impl);
  assert(r.ok === true && r.refreshed && r.readonlyScopeGranted && r.profileMatchesConfiguredMailbox === true && r.configuredMailboxIsInstitutional === true, JSON.stringify(r));
  assert(JSON.stringify(f.calls.map((c) => c.url)) === JSON.stringify(["https://oauth2.googleapis.com/token", "https://gmail.googleapis.com/gmail/v1/users/me/profile"]), "só token e profile");
  assert(!r.gmailMessagesApiCalled && !f.calls.some((c) => /messages|threads|drafts|labels/.test(c.url)), "tocou em mensagens");
  noLeak(r);
});
await check("sem variáveis => NOT_CONFIGURED e nenhuma chamada de rede", async () => {
  const f = fetcher();
  const r = await runInboundMailboxCheck({}, f.impl);
  assert(r.ok === false && r.stage === "NOT_CONFIGURED" && f.calls.length === 0);
});
await check("variável ausente/vazia (qualquer uma) => NOT_CONFIGURED sem rede", async () => {
  for (const k of ["ACC_RISK_ALERTS_INBOUND_CLIENT_ID", "ACC_RISK_ALERTS_INBOUND_CLIENT_SECRET", "ACC_RISK_ALERTS_INBOUND_REFRESH_TOKEN", "ACC_RISK_ALERTS_INBOUND_MAILBOX"]) {
    const f = fetcher();
    const r = await runInboundMailboxCheck(ENV({ [k]: "" }), f.impl);
    assert(r.stage === "NOT_CONFIGURED" && f.calls.length === 0, k);
  }
});
await check("refresh falha (token revogado) => ok=false na etapa AUTH_REFRESH, sem chamar profile, sem vazamento", async () => {
  const f = fetcher({ tokenStatus: 400 });
  const r = await runInboundMailboxCheck(ENV(), f.impl);
  assert(r.ok === false && r.stage === "AUTH_REFRESH" && !r.refreshed && f.calls.length === 1);
  noLeak(r);
});
await check("token SEM gmail.readonly (ex.: só gmail.send) => ok=false (não consegue ler respostas)", async () => {
  const r = await runInboundMailboxCheck(ENV(), fetcher({ scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email" }).impl);
  assert(r.ok === false && r.refreshed === true && r.readonlyScopeGranted === false);
  noLeak(r);
});
await check("conta autenticada ≠ caixa configurada => ok=false, profileMatchesConfiguredMailbox=false", async () => {
  const r = await runInboundMailboxCheck(ENV(), fetcher({ profile: "outra.pessoa@axion.com.br" }).impl);
  assert(r.ok === false && r.profileMatchesConfiguredMailbox === false);
  noLeak(r);
});
await check("caixa configurada ≠ institucional (ex.: axion@/acc@) => ok=false mesmo que a conta confira com ela", async () => {
  for (const box of ["axion@axion.com.br", "acc@axion.com.br"]) {
    const r = await runInboundMailboxCheck(ENV({ ACC_RISK_ALERTS_INBOUND_MAILBOX: box }), fetcher({ profile: box }).impl);
    assert(r.ok === false && r.profileMatchesConfiguredMailbox === true && r.configuredMailboxIsInstitutional === false, box);
    noLeak(r);
  }
});
await check("normalização: caixa configurada com espaços/maiúsculas ainda confere", async () => {
  const r = await runInboundMailboxCheck(ENV({ ACC_RISK_ALERTS_INBOUND_MAILBOX: "  CRM@Axion.com.br " }), fetcher().impl);
  assert(r.ok === true);
});
await check("workflow: manual, sem schedule, só main, só os 4 secrets de leitura, sem segredos no log, sem escrita", () => {
  const wf = readFileSync(path.join(root, ".github/workflows/pilot-replies-mailbox-check.yml"), "utf8");
  assert(/workflow_dispatch:/.test(wf) && !/^\s*schedule:/m.test(wf), "precisa ser só manual");
  assert(wf.includes("github.ref == 'refs/heads/main'") && /permissions:\s*\n\s*contents: read/.test(wf), "só main e contents: read");
  const secrets = [...wf.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]).sort();
  assert(JSON.stringify(secrets) === JSON.stringify(["ACC_RISK_ALERTS_INBOUND_CLIENT_ID", "ACC_RISK_ALERTS_INBOUND_CLIENT_SECRET", "ACC_RISK_ALERTS_INBOUND_MAILBOX", "ACC_RISK_ALERTS_INBOUND_REFRESH_TOKEN"]), secrets.join(","));
  assert(!/echo\s.*\$\{\{/.test(wf) && !/--debug|set -x/.test(wf), "não pode imprimir segredos");
});
await check("script: sem mensagens/threads/labels/send, sem banco, sem console além do JSON final", () => {
  const src = readFileSync(path.join(root, "scripts/check-risk-alerts-inbound-mailbox.mjs"), "utf8").replace(/\/\/.*$/gm, "");
  assert(!/users\/me\/(messages|threads|drafts|labels)|messages\.send|supabase|createClient/.test(src));
  assert((src.match(/console\./g) ?? []).length === 1, "só um console.log (o JSON final)");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
