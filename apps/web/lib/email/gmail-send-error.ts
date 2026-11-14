// Diagnóstico SEGURO de falhas da chamada gmail.users.messages.send (puro, sem I/O, sem "server-only" para ser testável).
//
// Regra: do erro bruto do SDK/Google só sai uma ALLOWLIST de campos normalizados (status HTTP, código/razão da API, etapa,
// classe e um id de correlação opaco). Nunca sai mensagem livre do Google, headers (Authorization), corpo da requisição,
// tokens, client id/secret, URL com query ou MIME.
//
// Classes (efeito sobre a IDEMPOTÊNCIA — fail-closed):
//  - DEFINITIVE: o Google RECUSOU a requisição (ou a autenticação falhou antes do envio) — a mensagem NÃO foi enviada, mas
//    repetir sem corrigir a causa falhará de novo.
//  - TEMPORARY:  recusa transitória (429/limite de taxa) ou conexão que nem chegou a ser estabelecida — a mensagem NÃO foi
//    enviada e pode ser retentada com autorização.
//  - UNCERTAIN:  o pedido pode ter sido processado (5xx, timeout, conexão perdida após o envio, 2xx sem id) — NÃO retentar
//    automaticamente; exige verificação de ausência de entrega.
// Esta classificação é só informativa/auditável: o gate de retentativa continua exigindo o marcador "antes de qualquer
// chamada de rede", que estas falhas (pós-rede) NUNCA contêm.

export type GmailSendFailureClass = "DEFINITIVE" | "TEMPORARY" | "UNCERTAIN";
export type GmailSendStage = "AUTH_REFRESH" | "SEND" | "RESPONSE";

export type GmailSendFailureReason =
  | "GMAIL_API_DISABLED"
  | "INSUFFICIENT_SCOPE"
  | "AUTH_INVALID_GRANT"
  | "AUTH_INVALID_CLIENT"
  | "AUTH_UNAUTHORIZED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "CONNECTION_NOT_ESTABLISHED"
  | "CONNECTION_LOST"
  | "RESPONSE_WITHOUT_ID"
  | "UNKNOWN";

export interface GmailSendDiagnostic {
  stage: GmailSendStage;
  httpStatus: number | null;
  /** Código/razão da API (ex.: "accessNotConfigured", "invalid_grant"), limitado a [A-Za-z0-9_.-]. */
  apiCode: string | null;
  reason: GmailSendFailureReason;
  classification: GmailSendFailureClass;
  /** Id de correlação opaco do Google (se houver), saneado. */
  correlationId: string | null;
}

const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
const safeToken = (v: unknown): string | null => (typeof v === "string" && SAFE_TOKEN.test(v.trim()) ? v.trim() : null);
const asRecord = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null);

function numericStatus(err: Record<string, unknown>, response: Record<string, unknown> | null): number | null {
  for (const c of [response?.status, err.status, err.code]) {
    const n = typeof c === "string" && /^\d{3}$/.test(c) ? Number(c) : c;
    if (typeof n === "number" && Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return null;
}

function stageOf(err: Record<string, unknown>): GmailSendStage {
  const config = asRecord(err.config);
  const url = typeof config?.url === "string" ? config.url : "";
  // Só o host/caminho é inspecionado (nunca registrado); o refresh do token ocorre dentro da chamada de envio.
  return /oauth2\.googleapis\.com\/token|accounts\.google\.com\/o\/oauth2/i.test(url) ? "AUTH_REFRESH" : "SEND";
}

/** Extrai, do corpo do erro do Google, o primeiro código de razão utilizável (errors[].reason, details[].reason, status, error). */
function apiCodeOf(response: Record<string, unknown> | null): string | null {
  const data = asRecord(response?.data);
  if (!data) return null;
  if (typeof data.error === "string") return safeToken(data.error); // formato OAuth: {"error":"invalid_grant"}
  const e = asRecord(data.error);
  if (!e) return null;
  const errors = Array.isArray(e.errors) ? e.errors : [];
  for (const item of errors) {
    const reason = safeToken(asRecord(item)?.reason);
    if (reason) return reason;
  }
  const details = Array.isArray(e.details) ? e.details : [];
  for (const item of details) {
    const reason = safeToken(asRecord(item)?.reason);
    if (reason) return reason;
  }
  return safeToken(e.status);
}

function correlationOf(response: Record<string, unknown> | null): string | null {
  const headers = asRecord(response?.headers);
  if (!headers) return null;
  const get = (name: string): unknown => {
    const h = headers as { get?: (n: string) => unknown };
    if (typeof h.get === "function") return h.get(name);
    return headers[name] ?? headers[name.toLowerCase()];
  };
  for (const name of ["x-goog-request-id", "x-request-id", "x-guploader-uploadid"]) {
    const v = safeToken(get(name));
    if (v) return v;
  }
  return null;
}

const NOT_ESTABLISHED = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"]);
const TIMEOUTS = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNABORTED", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
const LOST = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ERR_STREAM_PREMATURE_CLOSE"]);

/** Normaliza qualquer erro lançado pela chamada de envio em um diagnóstico seguro. Nunca lança. */
export function classifyGmailSendError(error: unknown): GmailSendDiagnostic {
  const err = asRecord(error) ?? {};
  const response = asRecord(err.response);
  const stage = stageOf(err);
  const httpStatus = numericStatus(err, response);
  const apiCode = apiCodeOf(response);
  const correlationId = correlationOf(response);
  const base = { stage, httpStatus, apiCode, correlationId };
  const code = typeof err.code === "string" ? err.code.toUpperCase() : "";
  const apiLower = (apiCode ?? "").toLowerCase();
  const done = (reason: GmailSendFailureReason, classification: GmailSendFailureClass): GmailSendDiagnostic => ({ ...base, reason, classification });

  if (httpStatus === null) {
    if (NOT_ESTABLISHED.has(code)) return done("CONNECTION_NOT_ESTABLISHED", "TEMPORARY");
    if (TIMEOUTS.has(code) || err.name === "AbortError" || /timeout|timed out/i.test(typeof err.message === "string" ? err.message : "")) {
      return stage === "AUTH_REFRESH" ? done("TIMEOUT", "TEMPORARY") : done("TIMEOUT", "UNCERTAIN");
    }
    if (LOST.has(code)) return stage === "AUTH_REFRESH" ? done("CONNECTION_LOST", "TEMPORARY") : done("CONNECTION_LOST", "UNCERTAIN");
    return done("UNKNOWN", "UNCERTAIN");
  }

  // Falhas no endpoint de token: o envio nem começou — nunca há mensagem enviada.
  if (stage === "AUTH_REFRESH") {
    if (apiLower === "invalid_grant") return done("AUTH_INVALID_GRANT", "DEFINITIVE");
    if (apiLower === "invalid_client" || apiLower === "unauthorized_client") return done("AUTH_INVALID_CLIENT", "DEFINITIVE");
    if (httpStatus >= 500 || httpStatus === 429) return done(httpStatus === 429 ? "RATE_LIMITED" : "SERVER_ERROR", "TEMPORARY");
    return done("AUTH_UNAUTHORIZED", "DEFINITIVE");
  }

  if (httpStatus === 401) return done("AUTH_UNAUTHORIZED", "DEFINITIVE");
  if (httpStatus === 403) {
    if (/accessnotconfigured|service_disabled|api_disabled/.test(apiLower)) return done("GMAIL_API_DISABLED", "DEFINITIVE");
    if (/insufficientpermissions|access_token_scope_insufficient|insufficient_scope/.test(apiLower)) return done("INSUFFICIENT_SCOPE", "DEFINITIVE");
    if (/ratelimitexceeded|userratelimitexceeded|dailylimitexceeded|quotaexceeded|rate_limit_exceeded/.test(apiLower)) return done("QUOTA_EXCEEDED", "TEMPORARY");
    return done("PERMISSION_DENIED", "DEFINITIVE");
  }
  if (httpStatus === 429) return done("RATE_LIMITED", "TEMPORARY");
  if (httpStatus === 413) return done("PAYLOAD_TOO_LARGE", "DEFINITIVE");
  if (httpStatus === 404) return done("NOT_FOUND", "DEFINITIVE");
  if (httpStatus >= 400 && httpStatus < 500) return done("INVALID_REQUEST", "DEFINITIVE");
  // 5xx (e qualquer 2xx/3xx que chegou como erro): o servidor pode ter processado o pedido => resultado incerto.
  if (httpStatus >= 500) return done("SERVER_ERROR", "UNCERTAIN");
  return done("UNKNOWN", "UNCERTAIN");
}

/** Diagnóstico para "resposta do Gmail sem id/threadId" (2xx incompleto): a mensagem pode ter sido aceita => incerto. */
export function responseWithoutIdDiagnostic(): GmailSendDiagnostic {
  return { stage: "RESPONSE", httpStatus: 200, apiCode: null, reason: "RESPONSE_WITHOUT_ID", classification: "UNCERTAIN", correlationId: null };
}

/** Texto curto e seguro (vai para last_error e para a auditoria). NÃO contém o marcador de bloqueio pré-rede. */
export function formatGmailSendDiagnostic(d: GmailSendDiagnostic): string {
  const parts = [`etapa=${d.stage}`, `http=${d.httpStatus ?? "n/a"}`, `api=${d.apiCode ?? "n/a"}`, `motivo=${d.reason}`, `classe=${d.classification}`];
  if (d.correlationId) parts.push(`corr=${d.correlationId}`);
  return `[${parts.join(" ")}]`;
}

const DIAGNOSTIC_TEXT = /\[etapa=[A-Z_]+ http=(?:\d{3}|n\/a) api=[A-Za-z0-9_.:-]+ motivo=[A-Z_]+ classe=[A-Z]+(?: corr=[A-Za-z0-9_.:-]+)?\]/;

/** Extrai de um last_error o trecho de diagnóstico seguro gerado por formatGmailSendDiagnostic (ou null). Nunca devolve texto livre. */
export function extractGmailSendDiagnosticText(lastError: string | null | undefined): string | null {
  if (typeof lastError !== "string") return null;
  return DIAGNOSTIC_TEXT.exec(lastError)?.[0] ?? null;
}
