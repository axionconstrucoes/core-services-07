// Autenticação do Gmail por DELEGAÇÃO EM TODO O DOMÍNIO (conta de serviço), somente leitura.
// NÃO altera o OAuth de login do ACC nem o coletor por refresh token. Segredos só em ambiente remoto (nunca no chat/Git/frontend).
//
// Dois modos, nesta ordem de preferência:
//   1. SEM CHAVE (recomendado): identidade federada do executor (GitHub Actions OIDC -> Workload Identity Federation) via ADC;
//      a conta de serviço assina o JWT de delegação pela API IAM Credentials (signJwt) — nenhuma chave privada existe.
//   2. COM CHAVE (somente se o modo 1 não for possível): JSON da chave em GOOGLE_GMAIL_DWD_KEY_JSON (segredo do ambiente remoto).
// Escopo único e fixo: gmail.readonly. A caixa personificada (`sub`) é sempre explícita; nunca "todas as caixas".

import { google } from "googleapis";
import { GMAIL_READONLY_SCOPE, isCorporateMailbox, normalizeMailbox } from "./gmail-mailbox-gate.mjs";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SA_EMAIL_PATTERN = /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;

/** Claims do JWT de delegação. Puro e testável. */
export function buildDelegationClaims({ serviceAccountEmail, mailbox, now = new Date(), ttlSeconds = 3000 }) {
  const sa = String(serviceAccountEmail ?? "").trim().toLowerCase();
  if (!SA_EMAIL_PATTERN.test(sa)) throw new Error("GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT inválida (esperado ...@PROJETO.iam.gserviceaccount.com).");
  const sub = normalizeMailbox(mailbox);
  if (!isCorporateMailbox(sub)) throw new Error("Caixa a personificar precisa ser uma caixa corporativa explícita.");
  const iat = Math.floor(now.getTime() / 1000);
  return { iss: sa, sub, scope: GMAIL_READONLY_SCOPE, aud: TOKEN_URI, iat, exp: iat + Math.min(Math.max(ttlSeconds, 60), 3300) };
}

async function exchangeAssertion(signedJwt, fetchImpl) {
  const response = await fetchImpl(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    // Só o código do erro do Google (ex.: unauthorized_client) — nunca a assertion nem o corpo completo.
    throw new Error(`DWD_TOKEN_EXCHANGE_FAILED:${body.error ?? response.status}`);
  }
  return { accessToken: body.access_token, expiresInSeconds: Number(body.expires_in ?? 3000) };
}

/**
 * Cliente OAuth2 já autenticado como `mailbox` (somente leitura). `signJwt`/`fetchImpl` são injetáveis para teste.
 * @returns {Promise<{ auth: import("google-auth-library").OAuth2Client, mode: "KEYLESS_IAM_SIGNJWT"|"SERVICE_ACCOUNT_KEY" }>}
 */
export async function createDelegatedGmailAuth({ mailbox, env = process.env, fetchImpl = fetch, signJwt } = {}) {
  const sub = normalizeMailbox(mailbox);
  if (!isCorporateMailbox(sub)) throw new Error("Caixa a personificar precisa ser uma caixa corporativa explícita.");

  const keyJson = env.GOOGLE_GMAIL_DWD_KEY_JSON?.trim();
  const serviceAccountEmail = env.GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT?.trim();

  if (!keyJson) {
    // Modo sem chave: ADC do executor (Workload Identity Federation) + signJwt na conta de serviço.
    const claims = buildDelegationClaims({ serviceAccountEmail, mailbox: sub });
    const sign =
      signJwt ??
      (async (payload) => {
        const adc = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
        const client = await adc.getClient();
        const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(claims.iss)}:signJwt`;
        const res = await client.request({ url, method: "POST", data: { payload } });
        return res.data.signedJwt;
      });
    const signedJwt = await sign(JSON.stringify(claims));
    const { accessToken, expiresInSeconds } = await exchangeAssertion(signedJwt, fetchImpl);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken, expiry_date: Date.now() + expiresInSeconds * 1000 });
    return { auth, mode: "KEYLESS_IAM_SIGNJWT" };
  }

  let key;
  try {
    key = JSON.parse(keyJson);
  } catch {
    throw new Error("GOOGLE_GMAIL_DWD_KEY_JSON inválido (não é JSON).");
  }
  if (key.type !== "service_account" || !key.client_email || !key.private_key) throw new Error("GOOGLE_GMAIL_DWD_KEY_JSON não é uma chave de conta de serviço.");
  const jwt = new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: [GMAIL_READONLY_SCOPE], subject: sub });
  return { auth: jwt, mode: "SERVICE_ACCOUNT_KEY" };
}
