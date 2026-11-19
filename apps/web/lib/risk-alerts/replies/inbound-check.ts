// Diagnóstico SOMENTE-LEITURA da credencial que a Vercel usa para ler as respostas aos alertas (ACC_RISK_ALERTS_INBOUND_*).
// Roda DENTRO da rota /api/cron/risk-alerts (dry-run autenticado) — portanto com as variáveis do ambiente da Vercel, não as do GitHub —
// e roda mesmo quando o ciclo não tem nenhum escalonamento (o verificador de respostas só é chamado nesse caso).
//
// Faz exatamente duas chamadas HTTP: (1) renova o access token no endpoint OAuth (valida a renovação e o escopo CONCEDIDO);
// (2) users.getProfile (só o endereço da conta autenticada, comparado com a caixa configurada).
// NUNCA lista, lê, altera ou envia mensagens/threads/labels, NUNCA toca no banco e NUNCA grava nada.
// A resposta é uma ALLOWLIST de indicadores (booleanos e nomes curtos de escopo): nenhum e-mail, token, client id, client secret,
// Authorization ou corpo bruto do Google (o repositório e o log do Actions são públicos).
// Puro (env e fetch injetados, sem "server-only") para ser testável sem rede.
import { inboundProfileMatchesMailbox, resolveRiskAlertInboundCredentials } from "./inbound-credentials";

export const INBOUND_CHECK_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const INBOUND_CHECK_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
export const INBOUND_CHECK_INSTITUTIONAL_MAILBOX = "crm@axion.com.br";

type Env = Record<string, string | undefined>;
type FetchLike = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type InboundCheckStage = "CONFIG" | "NOT_CONFIGURED" | "AUTH_REFRESH" | "IDENTITY";

export interface InboundCheckResult {
  /** Verdadeiro só quando TODOS os indicadores abaixo estão corretos. */
  ok: boolean;
  stage: InboundCheckStage;
  /** As 4 variáveis existem e a caixa tem formato válido. */
  configured: boolean;
  /** O Google devolveu um access token novo a partir do refresh token. */
  tokenRefreshed: boolean;
  /** Escopos efetivamente concedidos (só nomes curtos conhecidos; qualquer outro vira "outro"). */
  scopes: string[];
  readonlyScopeGranted: boolean;
  /** Algum escopo além de gmail.readonly/openid/userinfo foi concedido (privilégio a mais). */
  excessScopes: boolean;
  /** A conta autenticada é exatamente a caixa configurada? null = não verificado. */
  profileMatchesConfiguredMailbox: boolean | null;
  configuredMailboxIsInstitutional: boolean | null;
  /** Garantias explícitas para auditoria. */
  mode: "READ_ONLY_DIAGNOSTIC";
  gmailMessagesApiCalled: false;
  wroteData: false;
  sentEmail: false;
}

const KNOWN_SCOPES = new Set(["gmail.readonly", "gmail.send", "gmail.modify", "gmail.compose", "gmail.metadata", "gmail.labels", "mail.google.com", "userinfo.email", "userinfo.profile", "openid"]);
const ALLOWED_SCOPES = new Set(["gmail.readonly", "userinfo.email", "userinfo.profile", "openid"]);
const SCOPE_PREFIX = "https://www.googleapis.com/auth/";

function normalizeScopes(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const out = new Set<string>();
  for (const scope of raw.split(/\s+/).filter(Boolean)) {
    const short = scope.startsWith(SCOPE_PREFIX) ? scope.slice(SCOPE_PREFIX.length) : scope.startsWith("https://mail.google.com") ? "mail.google.com" : scope;
    out.add(KNOWN_SCOPES.has(short) ? short : "outro");
  }
  return [...out].sort();
}

function base(): InboundCheckResult {
  return {
    ok: false,
    stage: "CONFIG",
    configured: false,
    tokenRefreshed: false,
    scopes: [],
    readonlyScopeGranted: false,
    excessScopes: false,
    profileMatchesConfiguredMailbox: null,
    configuredMailboxIsInstitutional: null,
    mode: "READ_ONLY_DIAGNOSTIC",
    gmailMessagesApiCalled: false,
    wroteData: false,
    sentEmail: false,
  };
}

/** Nunca lança: qualquer falha vira ok=false com o estágio em que parou. */
export async function runInboundMailboxCheck(options: { env?: Env; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<InboundCheckResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const out = base();

  const resolved = resolveRiskAlertInboundCredentials(env);
  if (!resolved.ok) return { ...out, stage: "NOT_CONFIGURED" };
  const creds = resolved.credentials;
  out.configured = true;
  out.configuredMailboxIsInstitutional = creds.mailbox === INBOUND_CHECK_INSTITUTIONAL_MAILBOX;

  let accessToken: string | null = null;
  const refreshAbort = new AbortController();
  const refreshTimer = setTimeout(() => refreshAbort.abort(), timeoutMs);
  try {
    out.stage = "AUTH_REFRESH";
    const response = await fetchImpl(INBOUND_CHECK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: "refresh_token" }).toString(),
      signal: refreshAbort.signal,
    });
    if (!response.ok) return out;
    const body = (await response.json()) as { access_token?: unknown; scope?: unknown } | null;
    accessToken = typeof body?.access_token === "string" && body.access_token.length > 0 ? body.access_token : null;
    if (!accessToken) return out;
    out.tokenRefreshed = true;
    out.scopes = normalizeScopes(body?.scope);
    out.readonlyScopeGranted = out.scopes.includes("gmail.readonly");
    out.excessScopes = out.scopes.some((scope) => !ALLOWED_SCOPES.has(scope));
  } catch {
    return out;
  } finally {
    clearTimeout(refreshTimer);
  }

  const profileAbort = new AbortController();
  const profileTimer = setTimeout(() => profileAbort.abort(), timeoutMs);
  try {
    out.stage = "IDENTITY";
    const response = await fetchImpl(INBOUND_CHECK_PROFILE_URL, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, signal: profileAbort.signal });
    if (!response.ok) return out;
    const profile = (await response.json()) as { emailAddress?: unknown } | null;
    out.profileMatchesConfiguredMailbox = inboundProfileMatchesMailbox(typeof profile?.emailAddress === "string" ? profile.emailAddress : null, creds.mailbox);
  } catch {
    return out;
  } finally {
    clearTimeout(profileTimer);
  }

  out.ok = out.tokenRefreshed && out.readonlyScopeGranted && !out.excessScopes && out.profileMatchesConfiguredMailbox === true && out.configuredMailboxIsInstitutional === true;
  return out;
}
