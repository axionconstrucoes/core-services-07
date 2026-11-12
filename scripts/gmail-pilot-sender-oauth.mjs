// Consentimento OAuth INTERATIVO da identidade de envio do piloto por projeto (só necessário se a conta de envio padrão não for o
// remetente do piloto). Grava SOMENTE GOOGLE_GMAIL_PILOT_SENDER_EMAIL, GOOGLE_GMAIL_PILOT_REFRESH_TOKEN e (quando o cliente isolado
// do piloto é usado) GOOGLE_GMAIL_PILOT_CLIENT_ID em apps/web/.env.local — nunca toca nas variáveis de envio padrão. Nenhum token
// ou segredo é exibido no console. O script NÃO envia e-mail.
//
// Cliente OAuth: prefere o par isolado GOOGLE_GMAIL_PILOT_CLIENT_ID + GOOGLE_GMAIL_PILOT_CLIENT_SECRET (ambos); se nenhum dos dois
// estiver definido, usa o compartilhado GOOGLE_GMAIL_CLIENT_ID/SECRET. Só um dos dois => erro (fail closed).
//
// Escopos (padrão): gmail.send + userinfo.email. O userinfo.email é necessário SOMENTE para PROVAR que a conta que aprovou o
// consentimento é exatamente a caixa informada: com apenas gmail.send o Google não permite ler o perfil (users.getProfile exige
// gmail.readonly/metadata), então não haveria como confirmar a identidade. Se for outra conta, nada é salvo.
//
// --scopes=send-only: pede SOMENTE gmail.send e PULA a verificação de identidade. A conta NÃO é verificada; nada é salvo sem a
// confirmação interativa digitando SALVAR no terminal.
//
// Uso (ação do responsável, no navegador, logado como a caixa do piloto):
//   node --env-file=apps/web/.env.local scripts/gmail-pilot-sender-oauth.mjs --mailbox=crm@axion.com.br [--scopes=send-only]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { google } from "googleapis";

const ALLOWED_SENDERS = ["crm@axion.com.br"]; // espelha PROJECT_PILOT_ALLOWED_SENDERS (apps/web/lib/email/project-pilot-profile.ts)
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const IDENTITY_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const REDIRECT_URI = "http://localhost:53684/oauth2callback";
const ENV_PATH = path.resolve("apps/web/.env.local");

/** Escolhe o cliente OAuth do piloto sem expor valores. */
export function choosePilotOAuthClient(env) {
  const hasId = Boolean(env.GOOGLE_GMAIL_PILOT_CLIENT_ID?.trim());
  const hasSecret = Boolean(env.GOOGLE_GMAIL_PILOT_CLIENT_SECRET?.trim());
  if (hasId !== hasSecret) {
    throw new Error("GOOGLE_GMAIL_PILOT_CLIENT_ID e GOOGLE_GMAIL_PILOT_CLIENT_SECRET precisam estar ambos definidos ou ambos ausentes.");
  }
  if (hasId) return { source: "PILOT", clientId: env.GOOGLE_GMAIL_PILOT_CLIENT_ID.trim(), clientSecret: env.GOOGLE_GMAIL_PILOT_CLIENT_SECRET.trim() };
  if (!env.GOOGLE_GMAIL_CLIENT_ID?.trim() || !env.GOOGLE_GMAIL_CLIENT_SECRET?.trim()) {
    throw new Error("Cliente OAuth ausente: defina GOOGLE_GMAIL_PILOT_CLIENT_ID/SECRET (isolado) ou GOOGLE_GMAIL_CLIENT_ID/SECRET (compartilhado).");
  }
  return { source: "SHARED", clientId: env.GOOGLE_GMAIL_CLIENT_ID.trim(), clientSecret: env.GOOGLE_GMAIL_CLIENT_SECRET.trim() };
}

/** Escopos pedidos conforme o modo. */
export function pilotScopes(mode) {
  if (mode === "send-only") return [SEND_SCOPE];
  if (mode === "send-and-identity") return [SEND_SCOPE, IDENTITY_SCOPE];
  throw new Error("--scopes inválido: use send-only ou omita a opção.");
}

function setEnvValue(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  content = content.replace(/^﻿/, "");
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) content = content.replace(regex, () => line);
  else content += `${content.length > 0 && !content.endsWith("\n") ? "\n" : ""}${line}\n`;
  fs.writeFileSync(ENV_PATH, content, { encoding: "utf8" });
}

async function confirmSave(mailbox) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `ATENÇÃO: no modo send-only a conta que aprovou NÃO foi verificada (não há como confirmar que é ${mailbox}).\n` +
        "Digite SALVAR para gravar o token mesmo assim, ou qualquer outra coisa para descartar: "
    );
    return answer.trim() === "SALVAR";
  } finally {
    rl.close();
  }
}

function main() {
  const arg = (name) => ((process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? "").trim();
  const mailbox = arg("mailbox").toLowerCase();
  const scopesMode = arg("scopes") || "send-and-identity";

  if (!ALLOWED_SENDERS.includes(mailbox)) {
    console.error(`ERRO: --mailbox precisa ser um remetente autorizado do piloto (${ALLOWED_SENDERS.join(", ")}).`);
    process.exit(1);
  }
  let client;
  let scopes;
  try {
    client = choosePilotOAuthClient(process.env);
    scopes = pilotScopes(scopesMode);
  } catch (error) {
    console.error(`ERRO: ${error instanceof Error ? error.message : "configuração inválida"}`);
    process.exit(1);
  }
  console.log(`Cliente OAuth: ${client.source === "PILOT" ? "isolado do piloto (GOOGLE_GMAIL_PILOT_CLIENT_ID)" : "compartilhado (GOOGLE_GMAIL_CLIENT_ID)"}.`);
  console.log(`Escopos: ${scopes.map((s) => s.split("/").pop()).join(", ")}.`);

  const oauth2Client = new google.auth.OAuth2(client.clientId, client.clientSecret, REDIRECT_URI);
  const state = crypto.randomUUID();
  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: false,
    login_hint: mailbox,
    scope: scopes,
    state,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      if (url.searchParams.get("error")) throw new Error(`Google OAuth error: ${url.searchParams.get("error")}`);
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.get("state") !== state) throw new Error("Callback OAuth inválido.");
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) throw new Error("Google não retornou refresh token.");

      if (scopesMode === "send-only") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>Consentimento recebido</h2><p>Volte ao terminal para confirmar (a conta não foi verificada).</p>");
        if (!(await confirmSave(mailbox))) {
          console.log("Descartado. Nada foi salvo.");
          server.close();
          return;
        }
      } else {
        oauth2Client.setCredentials(tokens);
        const info = await google.oauth2({ version: "v2", auth: oauth2Client }).userinfo.get();
        const account = (info.data.email ?? "").toLowerCase();
        if (account !== mailbox) throw new Error(`A conta autenticada não é ${mailbox}. Nada foi salvo.`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h2>Remetente do piloto autorizado</h2><p>Conta: ${mailbox}</p><p>Escopo de envio: gmail.send. Você pode fechar esta janela.</p>`);
      }

      setEnvValue("GOOGLE_GMAIL_PILOT_SENDER_EMAIL", mailbox);
      setEnvValue("GOOGLE_GMAIL_PILOT_REFRESH_TOKEN", tokens.refresh_token);
      if (client.source === "PILOT") setEnvValue("GOOGLE_GMAIL_PILOT_CLIENT_ID", client.clientId);
      console.log(
        `\nOK - ${scopesMode === "send-only" ? "token salvo (conta NÃO verificada)" : `identidade de envio do piloto confirmada como ${mailbox}`}. Valores salvos em apps/web/.env.local sem serem exibidos.`
      );
      console.log(
        "Próximo passo: cadastrar como variáveis SENSÍVEIS do app (Vercel) GOOGLE_GMAIL_PILOT_SENDER_EMAIL e GOOGLE_GMAIL_PILOT_REFRESH_TOKEN" +
          (client.source === "PILOT" ? ", GOOGLE_GMAIL_PILOT_CLIENT_ID e GOOGLE_GMAIL_PILOT_CLIENT_SECRET (o mesmo par usado aqui)." : ".")
      );
    } catch (error) {
      console.error("ERRO OAuth:", error instanceof Error ? error.message : "erro desconhecido");
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Falha na autorização do remetente do piloto.");
      }
    }
    setTimeout(() => server.close(), 1000);
  });

  server.listen(53684, "127.0.0.1", () => {
    console.log("Abra a URL abaixo no navegador, logado como a caixa do piloto, e aprove:");
    console.log(authorizationUrl);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
