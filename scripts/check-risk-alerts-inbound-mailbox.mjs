// Diagnóstico SOMENTE-LEITURA da credencial de LEITURA das respostas aos alertas (fase `replies`): ACC_RISK_ALERTS_INBOUND_*.
// Faz exatamente duas chamadas: (1) renova o access token no endpoint OAuth; (2) users.getProfile (só o endereço da conta). NUNCA lê, lista,
// altera ou envia mensagens, não toca no banco e não altera credenciais. A saída tem SÓ booleanos e nomes curtos de escopo — nenhum e-mail,
// token, client id ou segredo (o repositório é público e o log do Actions também).
//
// Uso: node scripts/check-risk-alerts-inbound-mailbox.mjs   (variáveis ACC_RISK_ALERTS_INBOUND_* no ambiente; sem elas => NOT_CONFIGURED)
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveRiskAlertInboundCredentials, inboundProfileMatchesMailbox } = await import("../apps/web/lib/risk-alerts/replies/inbound-credentials");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const INSTITUTIONAL = "crm@axion.com.br";

export async function runInboundMailboxCheck(env = process.env, fetchImpl = fetch) {
  const out = {
    ok: false,
    stage: "CONFIG",
    configured: false,
    refreshed: false,
    scopes: [],
    readonlyScopeGranted: false,
    profileMatchesConfiguredMailbox: null,
    configuredMailboxIsInstitutional: null,
    gmailMessagesApiCalled: false,
  };
  const resolved = resolveRiskAlertInboundCredentials(env);
  if (!resolved.ok) return { ...out, stage: "NOT_CONFIGURED" };
  const creds = resolved.credentials;
  out.configured = true;
  out.configuredMailboxIsInstitutional = creds.mailbox.trim().toLowerCase() === INSTITUTIONAL;

  let accessToken = null;
  try {
    out.stage = "AUTH_REFRESH";
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: "refresh_token" }).toString(),
    });
    if (!response.ok) return out;
    const body = await response.json();
    accessToken = typeof body.access_token === "string" ? body.access_token : null;
    if (!accessToken) return out;
    out.refreshed = true;
    out.scopes = String(body.scope ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s.split("/").pop())
      .filter((s) => /^[a-z._]+$/.test(s))
      .sort();
    out.readonlyScopeGranted = out.scopes.includes("gmail.readonly");
  } catch {
    return out;
  }

  try {
    out.stage = "IDENTITY";
    const response = await fetchImpl(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return out;
    const profile = await response.json();
    out.profileMatchesConfiguredMailbox = inboundProfileMatchesMailbox(profile.emailAddress ?? null, creds.mailbox);
  } catch {
    return out;
  }
  out.ok = out.refreshed && out.readonlyScopeGranted && out.profileMatchesConfiguredMailbox === true && out.configuredMailboxIsInstitutional === true;
  return out;
}

if (process.argv[1] && /check-risk-alerts-inbound-mailbox.mjs$/.test(process.argv[1])) {
  const result = await runInboundMailboxCheck();
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
