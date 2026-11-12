// Credenciais isoladas da identidade de envio do piloto (sem rede).
// Uso: node scripts/test-gmail-pilot-credentials.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveGmailPilotSenderConfig } = await import("../apps/web/lib/email/gmail-pilot-credentials");
const { choosePilotOAuthClient, pilotScopes } = await import("./gmail-pilot-sender-oauth.mjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg ?? "falhou");
};
const throws = (fn, re) => {
  try {
    fn();
  } catch (error) {
    if (re && !re.test(error instanceof Error ? error.message : "")) throw new Error(`mensagem inesperada: ${error.message}`);
    return error;
  }
  throw new Error("não lançou");
};

const SENDER = "remetente-piloto@exemplo.test";
const SECRET_VALUES = ["segredo-compartilhado-XYZ", "segredo-piloto-ABC", "token-piloto-123", "segredo-unico-QWE"];
const base = {
  GOOGLE_GMAIL_CLIENT_ID: "cliente-compartilhado",
  GOOGLE_GMAIL_CLIENT_SECRET: "segredo-compartilhado-XYZ",
  GOOGLE_GMAIL_REFRESH_TOKEN: "token-padrao",
  GOOGLE_GMAIL_SENDER_EMAIL: "padrao@exemplo.test",
  GOOGLE_GMAIL_PILOT_REFRESH_TOKEN: "token-piloto-123",
  GOOGLE_GMAIL_PILOT_SENDER_EMAIL: SENDER,
};

check("par completo do piloto => usa o cliente isolado", () => {
  const cfg = resolveGmailPilotSenderConfig(SENDER, { ...base, GOOGLE_GMAIL_PILOT_CLIENT_ID: "cliente-piloto", GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "segredo-piloto-ABC" });
  assert(cfg.clientSource === "PILOT" && cfg.clientId === "cliente-piloto" && cfg.clientSecret === "segredo-piloto-ABC");
  assert(cfg.refreshToken === "token-piloto-123" && cfg.senderEmail === SENDER);
});

check("só o ID do piloto => falha fechada sem expor valores", () => {
  const err = throws(() => resolveGmailPilotSenderConfig(SENDER, { ...base, GOOGLE_GMAIL_PILOT_CLIENT_ID: "cliente-piloto" }), /ambos definidos ou ambos ausentes/);
  assert(!SECRET_VALUES.some((v) => err.message.includes(v)) && !err.message.includes("cliente-piloto"));
});

check("só o segredo do piloto => falha fechada sem expor valores", () => {
  const err = throws(() => resolveGmailPilotSenderConfig(SENDER, { ...base, GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "segredo-unico-QWE" }), /ambos definidos ou ambos ausentes/);
  assert(!SECRET_VALUES.some((v) => err.message.includes(v)));
});

check("ID do piloto vazio/espaços conta como ausente (sem par parcial)", () => {
  const cfg = resolveGmailPilotSenderConfig(SENDER, { ...base, GOOGLE_GMAIL_PILOT_CLIENT_ID: "  ", GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "" });
  assert(cfg.clientSource === "SHARED");
});

check("ausência do par do piloto => mantém o cliente compartilhado (comportamento anterior)", () => {
  const cfg = resolveGmailPilotSenderConfig(SENDER, base);
  assert(cfg.clientSource === "SHARED" && cfg.clientId === "cliente-compartilhado" && cfg.clientSecret === "segredo-compartilhado-XYZ");
  assert(cfg.refreshToken === "token-piloto-123", "token continua o do piloto, nunca o padrão");
});

check("sem token do piloto => falha fechada (nunca usa o token padrão)", () => {
  const env = { ...base };
  delete env.GOOGLE_GMAIL_PILOT_REFRESH_TOKEN;
  throws(() => resolveGmailPilotSenderConfig(SENDER, env), /GOOGLE_GMAIL_PILOT_REFRESH_TOKEN/);
});

check("remetente do piloto diferente do esperado => falha fechada", () => {
  throws(() => resolveGmailPilotSenderConfig("outro@exemplo.test", base), /diferente do remetente autorizado/);
});

check("remetente padrão inalterado: loadGmailConfig não lê variáveis do piloto", () => {
  const src = read("apps/web/lib/email/gmail-auth.ts");
  const start = src.indexOf("export function loadGmailConfig");
  const end = src.indexOf("// Identidade de envio do PROJETO PILOTO");
  assert(start >= 0 && end > start);
  const body = src.slice(start, end);
  assert(!/GOOGLE_GMAIL_PILOT_/.test(body), "loadGmailConfig não pode ler variáveis do piloto");
  assert(body.includes("GOOGLE_GMAIL_CLIENT_ID") && body.includes("GOOGLE_GMAIL_REFRESH_TOKEN") && body.includes("GOOGLE_GMAIL_SENDER_EMAIL"));
  assert(src.includes("resolveGmailPilotSenderConfig(expectedSender, process.env)"));
});

check("script: escolhe cliente isolado, compartilhado ou falha com par parcial", () => {
  assert(choosePilotOAuthClient({ ...base, GOOGLE_GMAIL_PILOT_CLIENT_ID: "p", GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "s" }).source === "PILOT");
  assert(choosePilotOAuthClient(base).source === "SHARED");
  throws(() => choosePilotOAuthClient({ ...base, GOOGLE_GMAIL_PILOT_CLIENT_ID: "p" }), /ambos/);
});

check("script: escopos padrão = gmail.send + userinfo.email; send-only = só gmail.send", () => {
  const def = pilotScopes("send-and-identity");
  assert(def.length === 2 && def.some((s) => s.endsWith("gmail.send")) && def.some((s) => s.endsWith("userinfo.email")));
  const only = pilotScopes("send-only");
  assert(only.length === 1 && only[0].endsWith("gmail.send"));
  throws(() => pilotScopes("gmail.readonly"), /inválido/);
});

check("script: nunca loga token/segredo, não envia e-mail e exige SALVAR no modo send-only", () => {
  const src = read("scripts/gmail-pilot-sender-oauth.mjs");
  const logs = src.match(/console\.(log|error|warn)\([^;]*\);/g) ?? [];
  for (const line of logs) {
    assert(!/refresh_token|tokens\b|clientSecret|CLIENT_SECRET\)|access_token/.test(line), `log suspeito: ${line.slice(0, 80)}`);
  }
  assert(!/users\.messages\.send|messages\.send\(/.test(src), "o script não pode enviar e-mail");
  assert(src.includes('answer.trim() === "SALVAR"'), "confirmação interativa SALVAR");
  assert(/send-only[\s\S]{0,400}confirmSave/.test(src), "send-only passa pela confirmação");
  assert(!src.includes("GOOGLE_GMAIL_PILOT_CLIENT_SECRET\", "), "segredo do cliente não é gravado no .env.local");
  assert(!/setEnvValue\("GOOGLE_GMAIL_(CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN|SENDER_EMAIL)"/.test(src), "não toca variáveis do remetente padrão");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
