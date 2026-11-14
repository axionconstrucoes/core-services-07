// Verificação TÉCNICA e SOMENTE-LEITURA da autenticação Gmail do piloto (nenhum envio, nenhuma leitura de mensagens, nenhuma escrita).
//
// Faz exatamente o que o envio faz antes de chamar o Gmail: seleciona as MESMAS credenciais que o GmailEmailProvider usaria para o
// remetente do piloto e tenta renovar o access token a partir do refresh token. NUNCA chama gmail.users.messages.* nem lê caixas.
// A resposta é uma ALLOWLIST de campos normalizados: nunca contém access token, refresh token, client secret, Authorization,
// corpo bruto do Google, e-mails nem o client id (só um fingerprint curto de SHA-256 para comparar com a configuração local).
// Puro (env e fetch injetados, sem "server-only") para ser testável sem rede.
import { createHash } from "node:crypto";
import { classifyGmailSendError, type GmailSendFailureClass, type GmailSendFailureReason } from "./gmail-send-error";
import { resolveGmailPilotSenderConfig } from "./gmail-pilot-credentials";
import { resolveProjectPilotProfile } from "./project-pilot-profile";

export const GMAIL_AUTH_CHECK_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_AUTH_CHECK_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; headers?: { get?: (name: string) => string | null } }>;

export type GmailAuthCheckStage = "CONFIG" | "AUTH_REFRESH" | "IDENTITY";

export interface GmailAuthCheckResult {
  ok: boolean;
  stage: GmailAuthCheckStage;
  httpStatus: number | null;
  apiCode: string | null;
  reason: GmailSendFailureReason | "CONFIG_MISSING" | "CONFIG_INVALID" | "NONE";
  classification: GmailSendFailureClass | "NONE";
  /** Resultado da renovação do access token (true só se o Google devolveu um access token). */
  refreshed: boolean;
  /** Qual conjunto de credenciais o envio usaria. */
  configSource: "PILOT_ISOLATED_CLIENT" | "PILOT_SHARED_CLIENT" | "DEFAULT_SENDER" | null;
  /** 8 primeiros hex do SHA-256 do client id (nunca o valor) — comparável com o mesmo cálculo sobre a configuração local. */
  clientIdFingerprint: string | null;
  /** Escopos concedidos, só nomes curtos conhecidos (ex.: gmail.send). */
  scopes: string[];
  /** A conta autenticada é o remetente do piloto? null = não verificável com os escopos existentes. */
  accountMatchesSender: boolean | null;
  /** Garantia explícita para auditoria: esta verificação nunca chama o Gmail API de mensagens. */
  gmailMessagesApiCalled: false;
}

const KNOWN_SCOPES = new Set(["gmail.send", "gmail.readonly", "gmail.modify", "gmail.compose", "gmail.metadata", "gmail.labels", "mail.google.com", "userinfo.email", "userinfo.profile", "openid", "drive", "drive.file", "drive.readonly"]);

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 8);

function base(): GmailAuthCheckResult {
  return { ok: false, stage: "CONFIG", httpStatus: null, apiCode: null, reason: "NONE", classification: "NONE", refreshed: false, configSource: null, clientIdFingerprint: null, scopes: [], accountMatchesSender: null, gmailMessagesApiCalled: false };
}

function normalizeScopes(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const out = new Set<string>();
  for (const scope of raw.split(/\s+/).filter(Boolean)) {
    const short = scope.startsWith("https://www.googleapis.com/auth/") ? scope.slice("https://www.googleapis.com/auth/".length) : scope.startsWith("https://mail.google.com") ? "mail.google.com" : scope;
    out.add(KNOWN_SCOPES.has(short) ? short : "outro");
  }
  return [...out].sort();
}

/** Seleciona as credenciais exatamente como o GmailEmailProvider para uma mensagem do projeto piloto. Lança (mensagem sem valores) se faltar/estiver inválido. */
function selectCredentials(env: Env): { clientId: string; clientSecret: string; refreshToken: string; senderEmail: string; source: NonNullable<GmailAuthCheckResult["configSource"]> } {
  const profile = resolveProjectPilotProfile(env);
  if (!profile.configured || !profile.valid) throw new Error("PERFIL_PILOTO_INVALIDO");
  const defaultSender = (env.GOOGLE_GMAIL_SENDER_EMAIL ?? "").trim().toLowerCase();
  if (defaultSender === profile.sender) {
    const clientId = env.GOOGLE_GMAIL_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_GMAIL_CLIENT_SECRET?.trim();
    const refreshToken = env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim();
    if (!clientId || !clientSecret || !refreshToken) throw new Error("CREDENCIAIS_AUSENTES");
    return { clientId, clientSecret, refreshToken, senderEmail: defaultSender, source: "DEFAULT_SENDER" };
  }
  const r = resolveGmailPilotSenderConfig(profile.sender, env);
  return { clientId: r.clientId, clientSecret: r.clientSecret, refreshToken: r.refreshToken, senderEmail: r.senderEmail, source: r.clientSource === "PILOT" ? "PILOT_ISOLATED_CLIENT" : "PILOT_SHARED_CLIENT" };
}

export async function runGmailPilotAuthCheck(options: { env?: Env; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<GmailAuthCheckResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const result = base();

  let creds: ReturnType<typeof selectCredentials>;
  try {
    creds = selectCredentials(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ...result, stage: "CONFIG", reason: message === "CREDENCIAIS_AUSENTES" || /não configurado|ausente/i.test(message) ? "CONFIG_MISSING" : "CONFIG_INVALID", classification: "DEFINITIVE" };
  }
  result.configSource = creds.source;
  result.clientIdFingerprint = fingerprint(creds.clientId);
  result.stage = "AUTH_REFRESH";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let accessToken: string | null = null;
  try {
    const response = await fetchImpl(GMAIL_AUTH_CHECK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: "refresh_token" }).toString(),
      signal: controller.signal,
    });
    let data: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      /* corpo ilegível: segue só com o status */
    }
    if (!response.ok || typeof data.access_token !== "string" || data.access_token.length === 0) {
      const diag = classifyGmailSendError({ config: { url: GMAIL_AUTH_CHECK_TOKEN_URL }, response: { status: response.status, data: { error: typeof data.error === "string" ? data.error : undefined }, headers: {} } });
      return { ...result, httpStatus: diag.httpStatus ?? response.status, apiCode: diag.apiCode, reason: response.ok ? "AUTH_UNAUTHORIZED" : diag.reason, classification: diag.classification };
    }
    accessToken = data.access_token;
    result.refreshed = true;
    result.httpStatus = response.status;
    result.scopes = normalizeScopes(data.scope);
  } catch (error) {
    const err = (error ?? {}) as { name?: unknown; code?: unknown };
    const diag = classifyGmailSendError({ name: err.name, code: typeof err.code === "string" ? err.code : undefined, config: { url: GMAIL_AUTH_CHECK_TOKEN_URL } });
    return { ...result, reason: diag.reason, classification: diag.classification };
  } finally {
    clearTimeout(timer);
  }

  // Identidade: só se o escopo userinfo.email foi concedido (senão "não verificável"). Devolve apenas boolean — nunca o e-mail.
  result.stage = "IDENTITY";
  result.ok = true;
  result.reason = "NONE";
  result.classification = "NONE";
  if (result.scopes.includes("userinfo.email")) {
    try {
      const info = await fetchImpl(GMAIL_AUTH_CHECK_USERINFO_URL, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
      if (info.ok) {
        const body = (await info.json()) as { email?: unknown };
        result.accountMatchesSender = typeof body.email === "string" ? body.email.trim().toLowerCase() === creds.senderEmail : null;
      }
    } catch {
      result.accountMatchesSender = null;
    }
  }
  return result;
}
