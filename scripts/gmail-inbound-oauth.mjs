import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { google } from "googleapis";

// --prefix=ACC_RISK_ALERTS_INBOUND gera o refresh token da caixa DEDICADA
// das respostas aos alertas de risco (axion@…) lendo/gravando
// <PREFIXO>_CLIENT_ID/_CLIENT_SECRET/_MAILBOX/_REFRESH_TOKEN — sem tocar nas
// variáveis GOOGLE_GMAIL_INBOUND_* do Gmail Inbound Sync. Default: prefixo
// legado GOOGLE_GMAIL_INBOUND. Escopo continua gmail.readonly.
const PREFIX = (process.argv.find((arg) => arg.startsWith("--prefix=")) ?? "--prefix=GOOGLE_GMAIL_INBOUND").split("=")[1].replace(/[^A-Z0-9_]/g, "");
// --client-prefix=GOOGLE_GMAIL_INBOUND usa o cliente OAuth de outro prefixo quando o slot não tem cliente próprio
// (caixa de titular: o refresh token fica sob <PREFIX>_REFRESH_TOKEN; o cliente é o compartilhado).
const CLIENT_PREFIX = (process.argv.find((arg) => arg.startsWith("--client-prefix=")) ?? "--client-prefix=").split("=")[1].replace(/[^A-Z0-9_]/g, "");
const CLIENT_ID = process.env[`${PREFIX}_CLIENT_ID`] || (CLIENT_PREFIX ? process.env[`${CLIENT_PREFIX}_CLIENT_ID`] : undefined);
const CLIENT_SECRET = process.env[`${PREFIX}_CLIENT_SECRET`] || (CLIENT_PREFIX ? process.env[`${CLIENT_PREFIX}_CLIENT_SECRET`] : undefined);
const MAILBOX = process.env[`${PREFIX}_MAILBOX`];

// Modo MANUAL (o titular autoriza em OUTRA máquina): o navegador dele cai em http://localhost:53682/... e mostra
// erro de conexão — isso é esperado. Ele copia a URL inteira da barra de endereço e a envia por canal interno.
//   1) --print-url            gera a URL e guarda o "state" num arquivo local temporário (não é segredo);
//   2) --callback-url="<URL>" valida o state, troca o código (vale ~10 min, uso único) e grava o refresh token.
// Nenhum modo imprime tokens.
const PRINT_URL = process.argv.includes("--print-url");
const CALLBACK_URL = (process.argv.find((arg) => arg.startsWith("--callback-url=")) ?? "").slice("--callback-url=".length);
const STATE_PATH = path.join(os.tmpdir(), `acc-gmail-oauth-state-${PREFIX}.json`);

const REDIRECT_URI = "http://localhost:53682/oauth2callback";
const ENV_PATH = path.resolve("apps/web/.env.local");

if (!CLIENT_ID || !CLIENT_SECRET || !MAILBOX) {
  console.error(
    `ERRO: configure ${PREFIX}_CLIENT_ID, ` +
    `${PREFIX}_CLIENT_SECRET e ${PREFIX}_MAILBOX.`
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const state = CALLBACK_URL ? readSavedState() : crypto.randomUUID();

function readSavedState() {
  if (!fs.existsSync(STATE_PATH)) {
    console.error("ERRO: state não encontrado. Rode primeiro com --print-url nesta máquina.");
    process.exit(1);
  }
  const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  if (saved.prefix !== PREFIX || Date.now() - saved.createdAt > 60 * 60 * 1000) {
    console.error("ERRO: state expirado ou de outro prefixo. Gere nova URL com --print-url.");
    process.exit(1);
  }
  return saved.state;
}

const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: false,
  login_hint: MAILBOX,
  scope: [
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
  state,
});

function setEnvValue(key, value) {
  let content = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8")
    : "";

  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    if (content.length > 0 && !content.endsWith("\n")) {
      content += "\n";
    }

    content += `${line}\n`;
  }

  fs.writeFileSync(ENV_PATH, content, "utf8");
}

async function exchangeCallback(requestUrl) {
    const returnedState = requestUrl.searchParams.get("state");
    const code = requestUrl.searchParams.get("code");
    const oauthError = requestUrl.searchParams.get("error");

    if (oauthError) {
      throw new Error(`Google OAuth error: ${oauthError}`);
    }

    if (!code || returnedState !== state) {
      throw new Error("Invalid OAuth callback.");
    }

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token."
      );
    }

    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const profile = await gmail.users.getProfile({
      userId: "me",
    });

    const authenticatedMailbox =
      profile.data.emailAddress?.toLowerCase();

    if (authenticatedMailbox !== MAILBOX.toLowerCase()) {
      throw new Error(
        `Mailbox mismatch. Expected ${MAILBOX}, got ${authenticatedMailbox}.`
      );
    }

    setEnvValue(
      `${PREFIX}_REFRESH_TOKEN`,
      tokens.refresh_token
    );

    return authenticatedMailbox;
}

if (PRINT_URL) {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ prefix: PREFIX, state, createdAt: Date.now() }), "utf8");
  console.log("");
  console.log("URL de autorização (envie ao titular; ele aprova logado na PRÓPRIA conta):");
  console.log("");
  console.log(authorizationUrl);
  console.log("");
  console.log("Depois da aprovação o navegador dele mostra erro em localhost — é esperado.");
  console.log("Ele copia a URL inteira da barra de endereço e a devolve; rode então:");
  console.log(`  node --env-file=apps/web/.env.local scripts/gmail-inbound-oauth.mjs --prefix=${PREFIX}${CLIENT_PREFIX ? ` --client-prefix=${CLIENT_PREFIX}` : ""} --callback-url="<URL>"`);
  console.log("O código vale poucos minutos e é de uso único.");
  process.exit(0);
}

if (CALLBACK_URL) {
  try {
    const mailbox = await exchangeCallback(new URL(CALLBACK_URL));
    fs.rmSync(STATE_PATH, { force: true });
    console.log("");
    console.log("OK - Gmail (somente leitura) autorizado para:", mailbox);
    console.log(`Refresh token salvo em apps/web/.env.local como ${PREFIX}_REFRESH_TOKEN (não exibido).`);
    process.exit(0);
  } catch (error) {
    console.error("ERRO OAuth:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(
      req.url ?? "/",
      REDIRECT_URI
    );

    if (requestUrl.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const authenticatedMailbox = await exchangeCallback(requestUrl);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
    });

    res.end(`
      <h2>AXION Gmail Inbound autorizado</h2>
      <p>Mailbox: ${authenticatedMailbox}</p>
      <p>Refresh token salvo localmente em apps/web/.env.local.</p>
      <p>Você pode fechar esta janela.</p>
    `);

    console.log("");
    console.log("OK - Gmail inbound autorizado.");
    console.log("Mailbox:", authenticatedMailbox);
    console.log(
      "Refresh token salvo em apps/web/.env.local."
    );
    console.log(
      "O token completo NÃO foi exibido no terminal."
    );

    setTimeout(() => {
      server.close();
    }, 1000);
  } catch (error) {
    console.error(
      "ERRO OAuth:",
      error instanceof Error ? error.message : "unknown error"
    );

    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    res.end("Falha na autorização Gmail inbound.");

    setTimeout(() => {
      server.close();
    }, 1000);
  }
});

server.listen(53682, "127.0.0.1", () => {
  console.log("");
  console.log("Abrindo autorização Google...");
  console.log("");
  console.log(authorizationUrl);
  console.log("");

  exec(`start "" "${authorizationUrl}"`);
});
