// Voz da VERA via ElevenLabs (text-to-speech REST) — somente no servidor.
//
// Regras de segurança e de custo do piloto:
//  - a chave (ELEVENLABS_API_KEY) só é lida aqui, no servidor; nunca vai ao navegador, a respostas, a erros ou a logs;
//  - FAIL CLOSED: sem ELEVENLABS_ENABLED="true", ELEVENLABS_API_KEY e ao menos uma voz autorizada
//    (ELEVENLABS_VOICE_IDS) não há chamada de rede — a resposta em texto continua;
//  - só vozes da lista autorizada (ELEVENLABS_VOICE_IDS) podem ser usadas; o navegador só escolhe entre elas;
//  - RESERVA DE CRÉDITOS: antes de cada leitura consulta a assinatura (somente leitura, não consome créditos) e
//    recusa se os créditos restantes não cobrirem a leitura + a reserva (ELEVENLABS_CREDIT_RESERVE, padrão 2000).
//    Assim a leitura nunca empurra a conta para cobrança excedente; se a consulta falhar, a leitura é recusada;
//  - texto sempre vindo da base de conhecimento (ver answer.ts: speechTextForEntry), no máximo 900 caracteres;
//  - 401/402/429 nunca são repetidos; sem retentativas automáticas.
//
// Sem "server-only" para ser testável por script Node; só é importado por rotas do servidor.

export interface AssistantVoice {
  id: string;
  label: string;
  note: string;
}

export type SpeechErrorCode =
  | "NOT_CONFIGURED"
  | "VOICES_NOT_CONFIGURED"
  | "BAD_REQUEST"
  | "AUTH"
  | "QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNAVAILABLE";

export class SpeechError extends Error {
  readonly code: SpeechErrorCode;
  /** Mensagem segura para o usuário — nunca contém chave, endpoint nem detalhes internos. */
  readonly userMessage: string;
  constructor(code: SpeechErrorCode, userMessage: string) {
    super(`speech:${code}`);
    this.name = "SpeechError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

const USER_MESSAGES: Record<SpeechErrorCode, string> = {
  NOT_CONFIGURED: "A leitura em voz ainda não está habilitada neste ambiente. A resposta em texto continua disponível.",
  VOICES_NOT_CONFIGURED: "A leitura em voz está desligada até as vozes autorizadas serem configuradas. A resposta em texto continua disponível.",
  BAD_REQUEST: "Não foi possível preparar a leitura desta resposta. A resposta em texto continua disponível.",
  AUTH: "O serviço de voz recusou o acesso. Avise o administrador do ACC. A resposta em texto continua disponível.",
  QUOTA: "Os créditos do serviço de voz acabaram ou ficaram abaixo da reserva de segurança. A resposta em texto continua disponível.",
  RATE_LIMIT: "O serviço de voz está ocupado. Tente novamente em instantes; a resposta em texto continua disponível.",
  TIMEOUT: "O serviço de voz demorou demais para responder. Tente novamente; a resposta em texto continua disponível.",
  UNAVAILABLE: "O serviço de voz está indisponível no momento. A resposta em texto continua disponível.",
};

function fail(code: SpeechErrorCode): never {
  throw new SpeechError(code, USER_MESSAGES[code]);
}

type Env = Record<string, string | undefined>;

export const SPEECH_ENV = {
  enabled: "ELEVENLABS_ENABLED",
  key: "ELEVENLABS_API_KEY",
  voices: "ELEVENLABS_VOICE_IDS",
  defaultVoice: "ELEVENLABS_DEFAULT_VOICE_ID",
  model: "ELEVENLABS_MODEL_ID",
  reserve: "ELEVENLABS_CREDIT_RESERVE",
  mode: "ELEVENLABS_MODE",
} as const;

/** Modelos aceitos (todos com português). Flash/Turbo custam 0,5 a 1 crédito por caractere; Multilingual v2, 1. */
export const ALLOWED_MODELS = ["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2"] as const;
export const DEFAULT_MODEL = "eleven_flash_v2_5";
export const DEFAULT_CREDIT_RESERVE = 2000;
/** Estimativa conservadora: 1 crédito por caractere (o máximo entre os modelos aceitos). */
export const CREDITS_PER_CHARACTER_ESTIMATE = 1;

const API_BASE = "https://api.elevenlabs.io";
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;
const OUTPUT_FORMAT = "mp3_44100_64";
const MAX_VOICES = 10;

export function parseVoiceIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((item) => item.trim()).filter((item) => VOICE_ID_PATTERN.test(item));
  return [...new Set(ids)].slice(0, MAX_VOICES);
}

export interface ElevenLabsConfig {
  key: string;
  voiceIds: string[];
  defaultVoiceId: string;
  model: (typeof ALLOWED_MODELS)[number];
  creditReserve: number;
}

export function loadElevenLabsConfig(env: Env = process.env): ElevenLabsConfig {
  const key = env[SPEECH_ENV.key]?.trim();
  if (env[SPEECH_ENV.enabled] !== "true" || !key) fail("NOT_CONFIGURED");

  const voiceIds = parseVoiceIds(env[SPEECH_ENV.voices]);
  if (voiceIds.length === 0) fail("VOICES_NOT_CONFIGURED");

  const requestedDefault = env[SPEECH_ENV.defaultVoice]?.trim();
  const defaultVoiceId = requestedDefault && voiceIds.includes(requestedDefault) ? requestedDefault : voiceIds[0];

  const requestedModel = env[SPEECH_ENV.model]?.trim();
  const model = (ALLOWED_MODELS as readonly string[]).includes(requestedModel ?? "") ? (requestedModel as ElevenLabsConfig["model"]) : DEFAULT_MODEL;

  const reserveRaw = Number(env[SPEECH_ENV.reserve]);
  const creditReserve = Number.isFinite(reserveRaw) && reserveRaw >= 0 ? Math.floor(reserveRaw) : DEFAULT_CREDIT_RESERVE;

  return { key, voiceIds, defaultVoiceId, model, creditReserve };
}

/** Disponibilidade sem expor nenhum valor de configuração. */
export function getSpeechAvailability(env: Env = process.env): { available: boolean; mode: "elevenlabs" | "simulado" | "desligado"; reason: SpeechErrorCode | null } {
  if (env[SPEECH_ENV.mode] === "simulado") return { available: true, mode: "simulado", reason: null };
  try {
    loadElevenLabsConfig(env);
    return { available: true, mode: "elevenlabs", reason: null };
  } catch (error) {
    return { available: false, mode: "desligado", reason: error instanceof SpeechError ? error.code : "UNAVAILABLE" };
  }
}

export function isAuthorizedVoice(id: unknown, env: Env = process.env): id is string {
  return typeof id === "string" && parseVoiceIds(env[SPEECH_ENV.voices]).includes(id);
}

// ---------- Lista de vozes (nome e rótulos vêm da própria conta; consulta somente leitura, sem custo de créditos) ----------

interface VoiceMeta {
  name?: string;
  labels?: { language?: string; accent?: string; gender?: string; descriptive?: string };
}

const voiceCache = new Map<string, { at: number; voice: AssistantVoice }>();
const VOICE_CACHE_MS = 10 * 60 * 1000;

function describe(meta: VoiceMeta | null, index: number, id: string): AssistantVoice {
  const gender = meta?.labels?.gender;
  const language = meta?.labels?.language;
  const genderLabel = gender === "female" ? "feminina" : gender === "male" ? "masculina" : null;
  const languageLabel = language ? (language === "pt" ? "português" : language) : null;
  const parts = [genderLabel, languageLabel, meta?.labels?.accent].filter(Boolean);
  return { id, label: meta?.name?.trim() || `Voz ${index + 1}`, note: parts.length ? parts.join(" · ") : "sem rótulo de idioma/gênero" };
}

export async function listAuthorizedVoices(options: { env?: Env; fetchImpl?: typeof fetch; now?: number } = {}): Promise<{ voices: AssistantVoice[]; defaultVoice: string }> {
  const env = options.env ?? process.env;

  if (env[SPEECH_ENV.mode] === "simulado") {
    const ids = parseVoiceIds(env[SPEECH_ENV.voices]);
    const list = (ids.length ? ids : ["SimulatedVoice01", "SimulatedVoice02"]).map((id, i) => describe({ name: `Voz simulada ${i + 1}`, labels: { gender: i === 0 ? "female" : "male", language: "pt" } }, i, id));
    return { voices: list, defaultVoice: list[0].id };
  }

  const config = loadElevenLabsConfig(env);
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now();

  const voices = await Promise.all(
    config.voiceIds.map(async (id, index) => {
      const cached = voiceCache.get(id);
      if (cached && now - cached.at < VOICE_CACHE_MS) return cached.voice;
      let meta: VoiceMeta | null = null;
      try {
        const response = await doFetch(`${API_BASE}/v1/voices/${id}`, { headers: { "xi-api-key": config.key }, signal: AbortSignal.timeout(8000) });
        if (response.ok) meta = (await response.json()) as VoiceMeta;
      } catch {
        /* nome é só conveniência; a voz continua utilizável */
      }
      const voice = describe(meta, index, id);
      if (meta) voiceCache.set(id, { at: now, voice });
      return voice;
    })
  );
  return { voices, defaultVoice: config.defaultVoiceId };
}

export function clearVoiceCache() {
  voiceCache.clear();
}

/** Voz efetivamente usada: a pedida (se autorizada) ou a padrão; null se a pedida não for autorizada. Sem rede. */
export function resolveRequestedVoice(requested: string | undefined, env: Env = process.env): string | null {
  const simulated = env[SPEECH_ENV.mode] === "simulado";
  const ids = parseVoiceIds(env[SPEECH_ENV.voices]);
  const allowed = simulated && ids.length === 0 ? ["SimulatedVoice01", "SimulatedVoice02"] : ids;
  if (allowed.length === 0) return null;
  if (requested === undefined || requested === "") {
    const wanted = env[SPEECH_ENV.defaultVoice]?.trim();
    return wanted && allowed.includes(wanted) ? wanted : allowed[0];
  }
  return allowed.includes(requested) ? requested : null;
}

// ---------- Reserva de créditos ----------

export interface CreditSnapshot {
  used: number;
  limit: number;
}

export async function readCredits(config: ElevenLabsConfig, doFetch: typeof fetch): Promise<CreditSnapshot> {
  let response: Response;
  try {
    response = await doFetch(`${API_BASE}/v1/user/subscription`, { headers: { "xi-api-key": config.key }, signal: AbortSignal.timeout(8000) });
  } catch {
    fail("UNAVAILABLE");
  }
  if (response.status === 401 || response.status === 403) fail("AUTH");
  if (!response.ok) fail("UNAVAILABLE");
  const data = (await response.json().catch(() => null)) as { character_count?: unknown; character_limit?: unknown } | null;
  const used = Number(data?.character_count);
  const limit = Number(data?.character_limit);
  // Sem números confiáveis, recusa: nunca gasta no escuro.
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) fail("UNAVAILABLE");
  return { used, limit };
}

export function hasCreditsFor(snapshot: CreditSnapshot, characters: number, reserve: number): boolean {
  const needed = Math.ceil(characters * CREDITS_PER_CHARACTER_ESTIMATE);
  return snapshot.limit - snapshot.used >= needed + reserve;
}

// ---------- Síntese ----------

export function buildSimulatedAudio(): Uint8Array {
  const sampleRate = 8000;
  const seconds = 3;
  const samples = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / 400, (samples - i) / 400);
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 6000 * envelope), true);
  }
  return new Uint8Array(buffer);
}

export interface SynthesizedAudio {
  audio: Uint8Array;
  contentType: string;
  mode: "elevenlabs" | "simulado";
  /** Créditos estimados (limite superior) desta leitura — só informativo. */
  estimatedCredits: number;
}

export interface SynthesizeOptions {
  env?: Env;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function buildRequestBody(text: string, model: ElevenLabsConfig["model"]): Record<string, unknown> {
  const body: Record<string, unknown> = { text, model_id: model };
  // language_code vale para Flash/Turbo v2.5; o Multilingual v2 detecta o idioma sozinho.
  if (model !== "eleven_multilingual_v2") body.language_code = "pt";
  return body;
}

export async function synthesizeSpeech(text: string, voiceId: string, options: SynthesizeOptions = {}): Promise<SynthesizedAudio> {
  const env = options.env ?? process.env;
  if (typeof text !== "string" || text.trim() === "") fail("BAD_REQUEST");
  const estimatedCredits = Math.ceil(text.length * CREDITS_PER_CHARACTER_ESTIMATE);

  if (env[SPEECH_ENV.mode] === "simulado") {
    if (resolveRequestedVoice(voiceId, env) === null) fail("BAD_REQUEST");
    return { audio: buildSimulatedAudio(), contentType: "audio/wav", mode: "simulado", estimatedCredits };
  }

  const config = loadElevenLabsConfig(env);
  if (!config.voiceIds.includes(voiceId)) fail("BAD_REQUEST");

  const doFetch = options.fetchImpl ?? fetch;

  // 1) reserva de créditos — antes de gastar qualquer crédito
  const credits = await readCredits(config, doFetch);
  if (!hasCreditsFor(credits, text.length, config.creditReserve)) fail("QUOTA");

  // 2) síntese
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await doFetch(`${API_BASE}/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": config.key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify(buildRequestBody(text, config.model)),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      const detail = await response.text().catch(() => "");
      if (/quota_exceeded/i.test(detail)) fail("QUOTA");
      fail("AUTH");
    }
    if (response.status === 402) fail("QUOTA");
    if (response.status === 429) fail("RATE_LIMIT");
    if (response.status === 400 || response.status === 422) fail("BAD_REQUEST");
    if (!response.ok) fail("UNAVAILABLE");

    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) fail("UNAVAILABLE");
    return { audio, contentType: "audio/mpeg", mode: "elevenlabs", estimatedCredits };
  } catch (error) {
    if (error instanceof SpeechError) throw error;
    if (error instanceof Error && error.name === "AbortError") fail("TIMEOUT");
    // Erro de rede: não repassa a mensagem original (poderia conter o endpoint).
    fail("UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}
