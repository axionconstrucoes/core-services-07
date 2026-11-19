// Diagnóstico inboundCheck do dry-run (inbound-check.ts + rota /api/cron/risk-alerts): fetch injetado, nenhuma rede, nenhum e-mail.
// Prova: renovação do token, escopo efetivamente concedido, perfil da caixa configurada; só indicadores; não consulta mensagens,
// não grava dados, não envia; roda independente de haver escalonamentos; exige dryRun=1.
// Uso: node scripts/test-inbound-check-dryrun.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.fetch = async () => {
  throw new Error("NETWORK_BLOCKED");
};
register("./ts-module-resolver.mjs", import.meta.url);
const { runInboundMailboxCheck, INBOUND_CHECK_TOKEN_URL, INBOUND_CHECK_PROFILE_URL } = await import("../apps/web/lib/risk-alerts/replies/inbound-check");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

const SECRET = "GOCSPX-SEGREDO-INBOUND";
const REFRESH = "1//0gREFRESH-INBOUND";
const ACCESS = "ya29.ACCESS-INBOUND";
const CLIENT = "cliente-inbound.apps.googleusercontent.com";
const CRM = "crm@axion.com.br";
const ENV = (over = {}) => ({
  ACC_RISK_ALERTS_INBOUND_CLIENT_ID: CLIENT,
  ACC_RISK_ALERTS_INBOUND_CLIENT_SECRET: SECRET,
  ACC_RISK_ALERTS_INBOUND_REFRESH_TOKEN: REFRESH,
  ACC_RISK_ALERTS_INBOUND_MAILBOX: CRM,
  ...over,
});
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fetcher({ scope = "https://www.googleapis.com/auth/gmail.readonly", profile = CRM, tokenStatus = 200, tokenThrows = false, profileThrows = false, profileStatus = 200 } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    if (String(url) === INBOUND_CHECK_TOKEN_URL) {
      if (tokenThrows) throw new Error("ECONNRESET");
      return tokenStatus === 200 ? json(200, { access_token: ACCESS, scope, token_type: "Bearer", refresh_token: REFRESH }) : json(tokenStatus, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    }
    if (String(url) === INBOUND_CHECK_PROFILE_URL) {
      if (profileThrows) throw new Error("ECONNRESET");
      return json(profileStatus, { emailAddress: profile, messagesTotal: 12345, threadsTotal: 999 });
    }
    throw new Error(`chamada inesperada: ${url}`);
  };
  return { impl, calls };
}
const noLeak = (r) => {
  const out = JSON.stringify(r);
  for (const bad of [SECRET, REFRESH, ACCESS, CLIENT, "GOCSPX", "ya29", "1//0g", "@axion.com.br", "Bearer", "12345", "messagesTotal", "invalid_grant"]) {
    if (out.includes(bad)) throw new Error(`vazou "${bad}"`);
  }
};
const run = (env, f) => runInboundMailboxCheck({ env, fetchImpl: f.impl, timeoutMs: 1000 });

await check("tudo certo: token renovado, gmail.readonly, perfil = caixa configurada (crm@) => ok; só token + profile; nenhum vazamento", async () => {
  const f = fetcher();
  const r = await run(ENV(), f);
  assert(r.ok === true && r.stage === "IDENTITY" && r.configured === true && r.tokenRefreshed === true, JSON.stringify(r));
  assert(r.readonlyScopeGranted === true && r.excessScopes === false && JSON.stringify(r.scopes) === JSON.stringify(["gmail.readonly"]));
  assert(r.profileMatchesConfiguredMailbox === true && r.configuredMailboxIsInstitutional === true);
  assert(r.mode === "READ_ONLY_DIAGNOSTIC" && r.gmailMessagesApiCalled === false && r.wroteData === false && r.sentEmail === false);
  assert(JSON.stringify(f.calls.map((c) => `${c.method} ${c.url}`)) === JSON.stringify([`POST ${INBOUND_CHECK_TOKEN_URL}`, `GET ${INBOUND_CHECK_PROFILE_URL}`]), "só 2 chamadas: renovação + perfil");
  noLeak(r);
});

await check("a resposta é uma allowlist fechada de chaves (nenhum campo livre)", async () => {
  const r = await run(ENV(), fetcher());
  const keys = Object.keys(r).sort();
  const expected = ["configured", "configuredMailboxIsInstitutional", "excessScopes", "gmailMessagesApiCalled", "mode", "ok", "profileMatchesConfiguredMailbox", "readonlyScopeGranted", "scopes", "sentEmail", "stage", "tokenRefreshed", "wroteData"];
  assert(JSON.stringify(keys) === JSON.stringify(expected), keys.join(","));
});

await check("sem as variáveis: NOT_CONFIGURED, ok=false e NENHUMA chamada de rede", async () => {
  const f = fetcher();
  const r = await run({}, f);
  assert(r.ok === false && r.stage === "NOT_CONFIGURED" && r.configured === false && f.calls.length === 0);
  noLeak(r);
});

await check("cada variável ausente/vazia => NOT_CONFIGURED sem rede", async () => {
  for (const k of ["ACC_RISK_ALERTS_INBOUND_CLIENT_ID", "ACC_RISK_ALERTS_INBOUND_CLIENT_SECRET", "ACC_RISK_ALERTS_INBOUND_REFRESH_TOKEN", "ACC_RISK_ALERTS_INBOUND_MAILBOX"]) {
    const f = fetcher();
    const r = await run(ENV({ [k]: "" }), f);
    assert(r.stage === "NOT_CONFIGURED" && r.ok === false && f.calls.length === 0, k);
  }
});

await check("não usa o GOOGLE_GMAIL_* nem outras credenciais (sem fallback)", async () => {
  const f = fetcher();
  const r = await run({ GOOGLE_GMAIL_CLIENT_ID: "x", GOOGLE_GMAIL_CLIENT_SECRET: "y", GOOGLE_GMAIL_REFRESH_TOKEN: "z", GOOGLE_GMAIL_INBOUND_MAILBOX: CRM }, f);
  assert(r.stage === "NOT_CONFIGURED" && f.calls.length === 0);
});

await check("renovação do token falha (revogado/expirado): ok=false, parou em AUTH_REFRESH, perfil NÃO consultado, sem vazamento do erro do Google", async () => {
  const f = fetcher({ tokenStatus: 400 });
  const r = await run(ENV(), f);
  assert(r.ok === false && r.stage === "AUTH_REFRESH" && r.tokenRefreshed === false && r.profileMatchesConfiguredMailbox === null);
  assert(f.calls.length === 1);
  noLeak(r);
});

await check("rede falha na renovação e no perfil: nunca lança; ok=false", async () => {
  const a = await run(ENV(), fetcher({ tokenThrows: true }));
  assert(a.ok === false && a.stage === "AUTH_REFRESH" && a.tokenRefreshed === false);
  const b = await run(ENV(), fetcher({ profileThrows: true }));
  assert(b.ok === false && b.stage === "IDENTITY" && b.tokenRefreshed === true && b.profileMatchesConfiguredMailbox === null);
  const c = await run(ENV(), fetcher({ profileStatus: 403 }));
  assert(c.ok === false && c.stage === "IDENTITY" && c.profileMatchesConfiguredMailbox === null);
  noLeak(a);
  noLeak(b);
  noLeak(c);
});

await check("escopo efetivamente concedido: sem gmail.readonly (só gmail.send) => readonlyScopeGranted=false, excessScopes=true, ok=false", async () => {
  const r = await run(ENV(), fetcher({ scope: "https://www.googleapis.com/auth/gmail.send" }));
  assert(r.readonlyScopeGranted === false && r.excessScopes === true && r.ok === false && JSON.stringify(r.scopes) === JSON.stringify(["gmail.send"]));
});

await check("privilégio a mais: gmail.readonly + gmail.modify => excessScopes=true e ok=false (mínimo privilégio)", async () => {
  const r = await run(ENV(), fetcher({ scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify" }));
  assert(r.readonlyScopeGranted === true && r.excessScopes === true && r.ok === false);
});

await check("readonly + openid/userinfo.email continua ok; escopo desconhecido vira 'outro' e conta como excesso", async () => {
  const okR = await run(ENV(), fetcher({ scope: "https://www.googleapis.com/auth/gmail.readonly openid https://www.googleapis.com/auth/userinfo.email" }));
  assert(okR.ok === true && okR.excessScopes === false);
  const strange = await run(ENV(), fetcher({ scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/segredo.interno" }));
  assert(strange.scopes.includes("outro") && !JSON.stringify(strange).includes("segredo.interno") && strange.excessScopes === true && strange.ok === false);
});

await check("perfil da conta diferente da caixa configurada => profileMatchesConfiguredMailbox=false, ok=false, sem expor o e-mail", async () => {
  const r = await run(ENV(), fetcher({ profile: "outra.pessoa@axion.com.br" }));
  assert(r.profileMatchesConfiguredMailbox === false && r.ok === false);
  noLeak(r);
});

await check("caixa configurada que não é a institucional => configuredMailboxIsInstitutional=false, ok=false; caixa normalizada (caixa alta/espaços)", async () => {
  const other = "axion@axion.com.br";
  const r = await run(ENV({ ACC_RISK_ALERTS_INBOUND_MAILBOX: other }), fetcher({ profile: other }));
  assert(r.configuredMailboxIsInstitutional === false && r.profileMatchesConfiguredMailbox === true && r.ok === false);
  const norm = await run(ENV({ ACC_RISK_ALERTS_INBOUND_MAILBOX: "  CRM@Axion.com.br " }), fetcher());
  assert(norm.ok === true);
});

await check("fonte da lib: sem mensagens/threads/labels/drafts/send, sem banco, sem googleapis, sem console", () => {
  const src = stripComments(read("apps/web/lib/risk-alerts/replies/inbound-check.ts"));
  assert(!/users\/me\/(messages|threads|drafts|labels)|messages\.(list|get|send|modify)|threads\.|gmail\.users|from\s+["']googleapis|import\(\s*["']googleapis|require\(\s*["']googleapis/.test(src), "sem API de mensagens nem pacote googleapis");
  assert(!/supabase|createClient|insert\(|update\(|upsert\(|\.from\(/.test(src), "sem banco");
  assert(!/console\./.test(src), "sem console");
  assert(!/nodemailer|sendMail|EmailProvider/.test(src), "sem envio");
  const urls = [...src.matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]).sort();
  assert(JSON.stringify(urls) === JSON.stringify(["https://gmail.googleapis.com/gmail/v1/users/me/profile", "https://mail.google.com", "https://oauth2.googleapis.com/token", "https://www.googleapis.com/auth/"].sort()), urls.join(" | "));
});

await check("rota: inboundCheck só com dryRun=1 (senão 400, antes de qualquer ciclo); rodado ANTES do ciclo e independente dele; não vai para o ciclo", () => {
  const src = stripComments(read("apps/web/app/api/cron/risk-alerts/route.ts"));
  const guard = src.indexOf("inboundCheckRequested && !dryRun");
  const cycle = src.indexOf("await runRiskAlertCycle(");
  const check = src.indexOf("await runInboundMailboxCheck()");
  assert(guard > -1 && /status:\s*400/.test(src.slice(guard, guard + 220)), "400 sem dryRun");
  assert(check > -1 && cycle > -1 && check < cycle, "o diagnóstico roda antes do ciclo");
  assert(/inboundCheckRequested\s*\?\s*await runInboundMailboxCheck\(\)\s*:\s*null/.test(src), "só quando pedido");
  const cycleCall = src.slice(cycle, src.indexOf(");", cycle) + 2);
  assert(!/inboundCheck/.test(cycleCall), "o ciclo não recebe o diagnóstico");
  assert(!/escalations|escalation/.test(src.slice(guard, check)), "não condicionado a escalonamentos");
  assert((src.match(/runInboundMailboxCheck/g) ?? []).length === 2, "uma importação e uma chamada");
});

await check("workflow de dry-run: continua manual, só main, sem schedule; pede dryRun=1 + inboundCheck=1 e imprime inboundCheck (só indicadores)", () => {
  const wf = read(".github/workflows/risk-alerts-weg-dry-run.yml");
  assert(/workflow_dispatch/.test(wf) && !/schedule:/.test(wf) && /github\.ref == 'refs\/heads\/main'/.test(wf));
  assert(/dryRun=1&inboundCheck=1&projectId=00000000-0000-4000-8000-000000000001/.test(wf), "URL do dry-run com inboundCheck");
  assert(/inboundCheck:j\.inboundCheck\?\?null/.test(wf), "imprime o bloco");
  assert(!/cat response\.json/.test(wf) && !/upload-artifact/.test(wf));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
