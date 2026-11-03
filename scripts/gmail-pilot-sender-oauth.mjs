// Consentimento OAuth INTERATIVO da identidade de envio do piloto por projeto (só necessário se a conta de envio padrão não for o
// remetente do piloto). Grava SOMENTE GOOGLE_GMAIL_PILOT_SENDER_EMAIL e GOOGLE_GMAIL_PILOT_REFRESH_TOKEN em apps/web/.env.local —
// nunca toca nas variáveis de envio padrão. O refresh token nunca é exibido.
//
// Pede gmail.send (envio) + userinfo.email (somente para PROVAR no consentimento que a conta autenticada é exatamente a caixa informada;
// se for outra conta, nada é salvo).
//
// Uso (ação do responsável, no navegador, logado como a caixa do piloto):
//   node --env-file=apps/web/.env.local scripts/gmail-pilot-sender-oauth.mjs --mailbox=crm@axion.com.br
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { google } from "googleapis";

const ALLOWED_SENDERS = ["crm@axion.com.br"]; // espelha PROJECT_PILOT_ALLOWED_SENDERS (apps/web/lib/email/project-pilot-profile.ts)
const mailbox = ((process.argv.find((a) => a.startsWith("--mailbox=")) ?? "").split("=")[1] ?? "").trim().toLowerCase();
const CLIENT_ID = process.env.GOOGLE_GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:53684/oauth2callback";
const ENV_PATH = path.resolve("apps/web/.env.local");

if (!ALLOWED_SENDERS.includes(mailbox)) {
  console.error(`ERRO: --mailbox precisa ser um remetente autorizado do piloto (${ALLOWED_SENDERS.join(", ")}).`);
  process.exit(1);
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERRO: GOOGLE_GMAIL_CLIENT_ID e GOOGLE_GMAIL_CLIENT_SECRET precisam estar no ambiente.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const state = crypto.randomUUID();
const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: false,
  login_hint: mailbox,
  scope: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"],
  state,
});

function setEnvValue(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  content = content.replace(/^﻿/, "");
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) content = content.replace(regex, line);
  else content += `${content.length > 0 && !content.endsWith("\n") ? "\n" : ""}${line}\n`;
  fs.writeFileSync(ENV_PATH, content, { encoding: "utf8" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", REDIRECT_URI);
    if (url.searchParams.get("error")) throw new Error(`Google OAuth error: ${url.searchParams.get("error")}`);
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("state") !== state) throw new Error("Callback OAuth inválido.");
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google não retornou refresh token.");
    oauth2Client.setCredentials(tokens);
    const info = await google.oauth2({ version: "v2", auth: oauth2Client }).userinfo.get();
    const account = (info.data.email ?? "").toLowerCase();
    if (account !== mailbox) throw new Error(`A conta autenticada (${account || "desconhecida"}) não é ${mailbox}. Nada foi salvo.`);
    setEnvValue("GOOGLE_GMAIL_PILOT_SENDER_EMAIL", mailbox);
    setEnvValue("GOOGLE_GMAIL_PILOT_REFRESH_TOKEN", tokens.refresh_token);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>Remetente do piloto autorizado</h2><p>Conta: ${mailbox}</p><p>Escopo de envio: gmail.send. Você pode fechar esta janela.</p>`);
    console.log(`\nOK - identidade de envio do piloto confirmada como ${mailbox}. Refresh token salvo em apps/web/.env.local sem ser exibido.`);
    console.log("Próximo passo: cadastrar GOOGLE_GMAIL_PILOT_SENDER_EMAIL e GOOGLE_GMAIL_PILOT_REFRESH_TOKEN como variáveis SENSÍVEIS do app (Vercel).");
  } catch (error) {
    console.error("ERRO OAuth:", error instanceof Error ? error.message : "erro desconhecido");
    res.writeHead(500);
    res.end("Falha na autorização do remetente do piloto.");
  }
  setTimeout(() => server.close(), 1000);
});

server.listen(53684, "127.0.0.1", () => {
  console.log("Abra a URL abaixo no navegador, logado como a caixa do piloto, e aprove:");
  console.log(authorizationUrl);
});
