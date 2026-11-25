// Retry centralizado para falhas TRANSITÓRIAS de rede/HTTP entre os workers do ACC e o Supabase.
//
// Incidente de origem (25/11/2026, Gmail Inbound Sync #1333, run 45660161019): um único HTTP 522 do Cloudflare
// ("Connection timed out" — o Cloudflare não conseguiu abrir a conexão TCP com a origem do Supabase) derrubava o job
// inteiro. O retry embutido do @supabase/postgrest-js 2.111 cobre só 520/503 em GET; 522 nunca era repetido, e o
// corpo HTML da página de erro do Cloudflare virava `error.message` e poluía os logs.
//
// Regras (todas cobertas por scripts/test-resilient-fetch.mjs):
//   - Status transitórios: 408, 429, 502, 503, 504 e a família Cloudflare 520–524.
//   - Métodos HTTP idempotentes e chamadas com opção explícita de idempotência repetem falhas transitórias.
//   - POST/PATCH genéricos não repetem. Um status transitório ou um cabeçalho Prefer não comprova
//     que a origem deixou de aplicar a escrita ou que os efeitos da operação podem ser repetidos.
//   - Backoff exponencial com jitter completo, limite de tentativas e respeito a Retry-After (segundos ou data HTTP),
//     sempre limitado por maxDelayMs.
//   - Corpo só é reenviado quando é reaproveitável (string, ArrayBuffer, Uint8Array, Blob, URLSearchParams, FormData).
//     Stream não é repetido.
//   - Sem duplicar o retry do postgrest-js: GET/HEAD/OPTIONS em /rest/v1/ com 503/520 é devolvido na 1ª resposta,
//     porque o próprio postgrest-js já repete esses casos (até 3x, com Retry-After).
//   - Resposta final de erro transitório com corpo NÃO-JSON (HTML do Cloudflare) ou JSON sem `message` é substituída por
//     JSON curto { message, code, details, hint } — o status HTTP original é mantido.
//   - Logs: uma linha por tentativa, com serviço, operação (método + caminho, SEM query string), tentativa, resultado e
//     ação. Nunca imprime chave, cabeçalho, query string ou corpo.
//   - Só atua nos hosts informados (por padrão, o host do Supabase); qualquer outro host passa direto, sem alteração.

export const TRANSIENT_STATUSES = new Set([408, 429, 502, 503, 504, 520, 521, 522, 523, 524]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);
const POSTGREST_OWN_RETRY = new Set([503, 520]);
const CONNECT_PHASE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const CLOUDFLARE_LABELS = {
  520: "Cloudflare: resposta desconhecida da origem",
  521: "Cloudflare: origem recusou a conexão",
  522: "Cloudflare: Connection timed out",
  523: "Cloudflare: origem inalcançável",
  524: "Cloudflare: origem não respondeu a tempo",
};

export const DEFAULTS = Object.freeze({
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  attemptTimeoutMs: 0, // 0 = sem timeout por tentativa (operações longas legítimas não são cortadas)
});

function errorCode(error) {
  return error?.cause?.code ?? error?.code ?? null;
}

function isAbort(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

export function classifyNetworkError(error) {
  const code = errorCode(error);
  if (error?.name === "TimeoutError") return { retryable: true, label: "timeout" };
  if (isAbort(error)) return { retryable: false, label: "abortada" };
  if (code && CONNECT_PHASE_CODES.has(code)) return { retryable: true, label: code };
  return { retryable: true, label: code ?? error?.name ?? "erro de rede" };
}

export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const date = Date.parse(text);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

export function computeDelay(attemptIndex, { baseDelayMs, maxDelayMs, random = Math.random, retryAfterMs = null }) {
  if (retryAfterMs != null) return Math.min(Math.max(0, retryAfterMs), maxDelayMs);
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attemptIndex);
  // Jitter completo com piso de metade: espalha execuções simultâneas sem zerar a espera.
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

function isReplayableBody(body) {
  if (body == null) return true;
  return (
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    body instanceof URLSearchParams ||
    (typeof FormData !== "undefined" && body instanceof FormData)
  );
}

function describeRequest(input, init) {
  const isRequest = typeof Request !== "undefined" && input instanceof Request;
  const rawUrl = isRequest ? input.url : String(input instanceof URL ? input.href : input);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    url = null;
  }
  const method = String(init?.method ?? (isRequest ? input.method : "GET")).toUpperCase();
  return { url, method, isRequest };
}

export function decideRetry({
  method,
  path,
  status = null,
  networkError = null,
  postgrestOwnRetry = true,
  forceIdempotent = false,
}) {
  const idempotent = forceIdempotent || IDEMPOTENT_METHODS.has(method);
  if (networkError) {
    const info = classifyNetworkError(networkError);
    if (!info.retryable) return { retry: false, reason: info.label };
    if (idempotent) return { retry: true, reason: info.label };
    return { retry: false, reason: `${info.label} (escrita ambígua: não repetida)` };
  }
  if (!TRANSIENT_STATUSES.has(status)) return { retry: false, reason: `HTTP ${status}` };
  if (
    postgrestOwnRetry &&
    ["GET", "HEAD", "OPTIONS"].includes(method) &&
    POSTGREST_OWN_RETRY.has(status) &&
    typeof path === "string" &&
    path.startsWith("/rest/v1/")
  ) {
    return { retry: false, reason: `HTTP ${status} (repetido pelo postgrest-js)` };
  }
  if (idempotent) return { retry: true, reason: `HTTP ${status}` };
  return { retry: false, reason: `HTTP ${status} (escrita ambígua: não repetida)` };
}

function looksLikeJsonWithMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && typeof parsed.message === "string" && parsed.message.length > 0;
  } catch {
    return false;
  }
}

// Substitui o corpo HTML/vazio de um erro transitório por JSON curto. Mantém status e cabeçalhos úteis.
export async function normalizeTransientErrorResponse(response, { attempts, service }) {
  if (!TRANSIENT_STATUSES.has(response.status)) return response;
  let text = "";
  try {
    text = await response.clone().text();
  } catch {
    text = "";
  }
  if (looksLikeJsonWithMessage(text)) return response;
  const ray = /Cloudflare Ray ID:\s*(?:<[^>]*>)*\s*([0-9a-f]{8,})/i.exec(text)?.[1] ?? response.headers.get("cf-ray");
  const label = CLOUDFLARE_LABELS[response.status] ?? response.statusText ?? "falha transitória";
  const body = JSON.stringify({
    message: `HTTP ${response.status} (${label}) em ${service} após ${attempts} tentativa(s); corpo ${text ? "HTML" : "vazio"} omitido.`,
    code: `HTTP_${response.status}`,
    details: ray ? `cf-ray=${ray}` : null,
    hint: "Falha transitória de rede entre o runner e o serviço; a execução seguinte retoma do último checkpoint.",
  });
  const headers = new Headers();
  for (const name of ["retry-after", "cf-ray", "date"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-acc-normalized-error", "1");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function sleepDefault(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

function defaultLog(line) {
  console.log(line);
}

/**
 * Cria um fetch resiliente.
 * @param {object} options
 * @param {typeof fetch} [options.fetchImpl] fetch subjacente (padrão: globalThis.fetch no momento da criação)
 * @param {string[]|null} [options.hosts] hosts atendidos (null = todos). Outros hosts passam direto.
 * @param {string} [options.service] nome do serviço nos logs
 * @param {boolean} [options.treatAllAsIdempotent] true só para chamadas comprovadamente idempotentes (ex.: heartbeat)
 */
export function createResilientFetch(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("resilient-fetch: fetch indisponível");
  const hosts = options.hosts ? new Set(options.hosts.map((h) => String(h).toLowerCase())) : null;
  const service = options.service ?? "supabase";
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULTS.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs;
  const sleep = options.sleep ?? sleepDefault;
  const random = options.random ?? Math.random;
  const log = options.log ?? defaultLog;
  const now = options.now ?? Date.now;
  const treatAllAsIdempotent = Boolean(options.treatAllAsIdempotent);
  const postgrestOwnRetry = options.postgrestOwnRetry ?? true;

  async function resilientFetch(input, init) {
    const { url, method, isRequest } = describeRequest(input, init);
    const inScope = url && (!hosts || hosts.has(url.host.toLowerCase()));
    const body = init?.body;
    if (!inScope || isRequest || !isReplayableBody(body)) return fetchImpl(input, init);

    const op = `${method} ${url.pathname}`;
    const callerSignal = init?.signal ?? null;
    const emit = (fields) =>
      log(
        `[acc-retry] service=${service} op="${op}" ` +
          Object.entries(fields)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")
      );

    for (let attempt = 1; ; attempt += 1) {
      const attemptInit = { ...init };
      if (attemptTimeoutMs > 0) {
        const timeout = AbortSignal.timeout(attemptTimeoutMs);
        attemptInit.signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
      }

      let response = null;
      let networkError = null;
      try {
        response = await fetchImpl(input, attemptInit);
      } catch (error) {
        if (callerSignal?.aborted) throw error;
        networkError = error;
      }

      if (response && !TRANSIENT_STATUSES.has(response.status)) {
        if (attempt > 1) emit({ attempt: `${attempt}/${maxAttempts}`, result: `HTTP_${response.status}`, action: "recuperado" });
        return response;
      }

      const decision = decideRetry({
        method,
        path: url.pathname,
        status: response?.status ?? null,
        networkError,
        postgrestOwnRetry,
        forceIdempotent: treatAllAsIdempotent,
      });
      const resultLabel = response ? `HTTP_${response.status}` : `REDE_${classifyNetworkError(networkError).label}`;

      if (!decision.retry || attempt >= maxAttempts) {
        emit({
          attempt: `${attempt}/${maxAttempts}`,
          result: resultLabel,
          action: decision.retry ? "desistiu(limite)" : `sem-retry(${decision.reason})`,
        });
        if (networkError) throw networkError;
        return normalizeTransientErrorResponse(response, { attempts: attempt, service });
      }

      const retryAfterMs = response ? parseRetryAfter(response.headers.get("retry-after"), now()) : null;
      const delay = computeDelay(attempt - 1, { baseDelayMs, maxDelayMs, random, retryAfterMs });
      emit({
        attempt: `${attempt}/${maxAttempts}`,
        result: resultLabel,
        action: `retry_em_${delay}ms${retryAfterMs != null ? "(Retry-After)" : ""}`,
      });
      if (response) {
        try {
          await response.body?.cancel();
        } catch {
          /* corpo já consumido */
        }
      }
      await sleep(delay, callerSignal ?? undefined);
    }
  }

  resilientFetch.isAccResilientFetch = true;
  resilientFetch.originalFetch = fetchImpl.originalFetch ?? fetchImpl;
  return resilientFetch;
}

export function supabaseHostsFromEnv(env = process.env) {
  const hosts = [];
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) {
    const value = env[name];
    if (!value) continue;
    try {
      hosts.push(new URL(value).host);
    } catch {
      /* valor inválido: ignorado (o script principal já valida) */
    }
  }
  return [...new Set(hosts)];
}
