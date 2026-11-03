// Testes da voz da AXIA com ElevenLabs — TUDO com serviço simulado: nenhuma chamada de rede, nenhuma chave real.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-vera-voice-elevenlabs.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const speech = await import("../apps/web/lib/assistant/elevenlabs-speech");
const knowledge = await import("../apps/web/lib/assistant/knowledge");
const { speechTextForEntry, SPEECH_TEXT_MAX_LENGTH } = await import("../apps/web/lib/assistant/answer");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => readFileSync(path.join(root, rel), "utf8");
let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
const ok = (c, m) => {
  if (!c) throw new Error(m);
};
const eq = (a, b, w) => {
  if (a !== b) throw new Error(`${w}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
};
async function codeOf(promiseFactory) {
  try {
    await promiseFactory();
  } catch (e) {
    return e instanceof speech.SpeechError ? e.code : `OUTRO:${e.message}`;
  }
  return "SEM_ERRO";
}

const FAKE_KEY = "FAKE-ELEVEN-KEY-0123456789abcdef";
const V1 = "VoiceAAAAAAAA1";
const V2 = "VoiceBBBBBBBB2";
const goodEnv = { ELEVENLABS_ENABLED: "true", ELEVENLABS_API_KEY: FAKE_KEY, ELEVENLABS_VOICE_IDS: `${V1}, ${V2}` };

const subscription = (used, limit) => new Response(JSON.stringify({ character_count: used, character_limit: limit }), { status: 200 });
const audio = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  };
  fn.calls = calls;
  return fn;
}
const okFetch = (used = 1000, limit = 121000) => mockFetch((url) => (url.includes("/v1/user/subscription") ? subscription(used, limit) : audio()));
const ttsCalls = (f) => f.calls.filter((c) => c.url.includes("/v1/text-to-speech/"));

// ---------- Configuração fail closed ----------
await check("sem configuração (ou sem o 'true' exato) nada é chamado: NOT_CONFIGURED", async () => {
  const f = okFetch();
  for (const env of [{}, { ELEVENLABS_API_KEY: FAKE_KEY, ELEVENLABS_VOICE_IDS: V1 }, { ...goodEnv, ELEVENLABS_ENABLED: "TRUE" }, { ...goodEnv, ELEVENLABS_ENABLED: "1" }, { ...goodEnv, ELEVENLABS_API_KEY: "  " }]) {
    eq(await codeOf(() => speech.synthesizeSpeech("Oi.", V1, { env, fetchImpl: f })), "NOT_CONFIGURED", JSON.stringify(Object.keys(env)));
  }
  eq(f.calls.length, 0, "chamadas de rede");
});

await check("habilitado mas sem vozes autorizadas: VOICES_NOT_CONFIGURED e nenhuma rede", async () => {
  const f = okFetch();
  for (const ids of [undefined, "", "curto,id com espaço,@@@"]) {
    eq(await codeOf(() => speech.synthesizeSpeech("Oi.", V1, { env: { ...goodEnv, ELEVENLABS_VOICE_IDS: ids }, fetchImpl: f })), "VOICES_NOT_CONFIGURED", String(ids));
  }
  eq(f.calls.length, 0, "chamadas de rede");
});

await check("lista de vozes: só ids válidos, sem repetição, no máximo 10; padrão = primeira (ou a indicada, se autorizada)", () => {
  const many = Array.from({ length: 14 }, (_, i) => `VoiceNumber${String(i).padStart(2, "0")}`).join(",");
  eq(speech.parseVoiceIds(`${V1},${V1}, ${V2} ,inválido!`).join("|"), `${V1}|${V2}`, "dedupe/validação");
  eq(speech.parseVoiceIds(many).length, 10, "limite");
  eq(speech.loadElevenLabsConfig(goodEnv).defaultVoiceId, V1, "padrão");
  eq(speech.loadElevenLabsConfig({ ...goodEnv, ELEVENLABS_DEFAULT_VOICE_ID: V2 }).defaultVoiceId, V2, "padrão indicado");
  eq(speech.loadElevenLabsConfig({ ...goodEnv, ELEVENLABS_DEFAULT_VOICE_ID: "OutraVozNaoAutorizada" }).defaultVoiceId, V1, "padrão não autorizado é ignorado");
});

await check("modelo: só os permitidos (Flash/Turbo/Multilingual v2); padrão Flash v2.5; reserva padrão 2000", () => {
  eq(speech.loadElevenLabsConfig(goodEnv).model, "eleven_flash_v2_5", "padrão");
  eq(speech.loadElevenLabsConfig({ ...goodEnv, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" }).model, "eleven_multilingual_v2", "multilingual");
  eq(speech.loadElevenLabsConfig({ ...goodEnv, ELEVENLABS_MODEL_ID: "modelo_caro_qualquer" }).model, "eleven_flash_v2_5", "não permitido volta ao padrão");
  eq(speech.loadElevenLabsConfig(goodEnv).creditReserve, 2000, "reserva padrão");
  eq(speech.loadElevenLabsConfig({ ...goodEnv, ELEVENLABS_CREDIT_RESERVE: "5000" }).creditReserve, 5000, "reserva configurada");
  eq(speech.loadElevenLabsConfig({ ...goodEnv, ELEVENLABS_CREDIT_RESERVE: "-1" }).creditReserve, 2000, "reserva inválida");
});

await check("voz fora da lista autorizada é recusada sem rede; voz vazia usa a padrão", async () => {
  const f = okFetch();
  eq(await codeOf(() => speech.synthesizeSpeech("Oi.", "VozDeOutraContaXYZ", { env: goodEnv, fetchImpl: f })), "BAD_REQUEST", "voz não autorizada");
  eq(speech.resolveRequestedVoice("VozDeOutraContaXYZ", goodEnv), null, "resolve: não autorizada");
  eq(speech.resolveRequestedVoice(undefined, goodEnv), V1, "resolve: padrão");
  eq(speech.resolveRequestedVoice(V2, goodEnv), V2, "resolve: autorizada");
  eq(speech.resolveRequestedVoice(V1, {}), null, "resolve: sem lista");
  eq(f.calls.length, 0, "chamadas de rede");
});

// ---------- Síntese: ordem, cabeçalhos, corpo ----------
await check("leitura: primeiro consulta créditos (GET), depois sintetiza (POST); chave só no cabeçalho; corpo correto", async () => {
  const f = okFetch();
  const r = await speech.synthesizeSpeech("Texto curto de teste.", V2, { env: goodEnv, fetchImpl: f });
  eq(f.calls.length, 2, "chamadas");
  ok(f.calls[0].url === "https://api.elevenlabs.io/v1/user/subscription" && (f.calls[0].init.method ?? "GET") === "GET", "1ª deve ser a assinatura (GET)");
  ok(f.calls[1].url === `https://api.elevenlabs.io/v1/text-to-speech/${V2}?output_format=mp3_44100_64` && f.calls[1].init.method === "POST", `2ª: ${f.calls[1].url}`);
  for (const c of f.calls) {
    eq(c.init.headers["xi-api-key"], FAKE_KEY, "cabeçalho da chave");
    ok(!c.url.includes(FAKE_KEY) && !String(c.init.body ?? "").includes(FAKE_KEY), "chave na URL ou no corpo");
  }
  const body = JSON.parse(f.calls[1].init.body);
  eq(body.text, "Texto curto de teste.", "texto");
  eq(body.model_id, "eleven_flash_v2_5", "modelo");
  eq(body.language_code, "pt", "idioma (Flash)");
  eq(r.contentType, "audio/mpeg", "tipo");
  eq(r.audio.byteLength, 3, "áudio");
  eq(r.estimatedCredits, 21, "créditos estimados (1 por caractere, limite superior)");
});

await check("Multilingual v2 não envia language_code", async () => {
  const f = okFetch();
  await speech.synthesizeSpeech("Oi.", V1, { env: { ...goodEnv, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" }, fetchImpl: f });
  const body = JSON.parse(ttsCalls(f)[0].init.body);
  ok(!("language_code" in body) && body.model_id === "eleven_multilingual_v2", JSON.stringify(body));
});

// ---------- Reserva de créditos ----------
await check("reserva: com créditos insuficientes NÃO há POST (nada é gasto) e o erro é QUOTA", async () => {
  const text = "x".repeat(900);
  // restante 2899 < 900 + 2000 -> recusa; restante 2900 == 900 + 2000 -> libera
  const low = okFetch(118101, 121000);
  eq(await codeOf(() => speech.synthesizeSpeech(text, V1, { env: goodEnv, fetchImpl: low })), "QUOTA", "abaixo da reserva");
  eq(ttsCalls(low).length, 0, "POST não deveria ocorrer");
  const edge = okFetch(118100, 121000);
  eq(await codeOf(() => speech.synthesizeSpeech(text, V1, { env: goodEnv, fetchImpl: edge })), "SEM_ERRO", "no limite exato");
  eq(ttsCalls(edge).length, 1, "POST no limite");
  ok(speech.hasCreditsFor({ used: 0, limit: 10000 }, 900, 2000) && !speech.hasCreditsFor({ used: 9000, limit: 10000 }, 900, 2000), "hasCreditsFor");
});

await check("se a consulta de créditos falhar ou vier inválida, a leitura é recusada (nunca gasta no escuro)", async () => {
  const cases = {
    "500": mockFetch(() => new Response("erro", { status: 500 })),
    "401": mockFetch(() => new Response("{}", { status: 401 })),
    "sem números": mockFetch(() => new Response(JSON.stringify({ tier: "creator" }), { status: 200 })),
    "limite zero": mockFetch(() => subscription(0, 0)),
    rede: mockFetch(() => {
      throw new TypeError("fetch failed");
    }),
  };
  for (const [name, f] of Object.entries(cases)) {
    const code = await codeOf(() => speech.synthesizeSpeech("Oi.", V1, { env: goodEnv, fetchImpl: f }));
    ok(["UNAVAILABLE", "AUTH"].includes(code), `${name}: ${code}`);
    eq(ttsCalls(f).length, 0, `${name}: não deve sintetizar`);
  }
});

// ---------- Erros da síntese ----------
for (const [status, body, expected] of [
  [401, '{"detail":{"status":"invalid_api_key"}}', "AUTH"],
  [401, '{"detail":{"status":"quota_exceeded"}}', "QUOTA"],
  [403, "{}", "AUTH"],
  [402, "{}", "QUOTA"],
  [429, "{}", "RATE_LIMIT"],
  [422, '{"detail":[]}', "BAD_REQUEST"],
  [500, "x", "UNAVAILABLE"],
  [503, "x", "UNAVAILABLE"],
]) {
  await check(`falha HTTP ${status}${body.includes("quota") ? " (quota_exceeded)" : ""} → ${expected}, aviso claro, sem vazar a chave, sem repetir`, async () => {
    const f = mockFetch((url) => (url.includes("/v1/user/subscription") ? subscription(0, 100000) : new Response(`${body} ${FAKE_KEY}`, { status })));
    let err = null;
    try {
      await speech.synthesizeSpeech("Oi.", V1, { env: goodEnv, fetchImpl: f });
    } catch (e) {
      err = e;
    }
    ok(err instanceof speech.SpeechError, "não lançou SpeechError");
    eq(err.code, expected, "código");
    ok(err.userMessage.includes("texto continua disponível"), "aviso não menciona que o texto continua");
    ok(![err.message, err.userMessage, String(err.stack)].some((s) => s.includes(FAKE_KEY)), "chave vazou no erro");
    eq(ttsCalls(f).length, 1, "não deve repetir a síntese");
  });
}

await check("erro de rede e tempo esgotado na síntese → UNAVAILABLE / TIMEOUT, sem vazar a chave", async () => {
  const net = mockFetch((url) => {
    if (url.includes("/v1/user/subscription")) return subscription(0, 100000);
    throw new TypeError(`fetch failed https://api.elevenlabs.io/?xi-api-key=${FAKE_KEY}`);
  });
  let err = null;
  try {
    await speech.synthesizeSpeech("Oi.", V1, { env: goodEnv, fetchImpl: net });
  } catch (e) {
    err = e;
  }
  eq(err.code, "UNAVAILABLE", "rede");
  ok(![err.message, err.userMessage].some((s) => s.includes(FAKE_KEY)), "chave vazou (rede)");

  const slow = mockFetch((url, init) => (url.includes("/v1/user/subscription") ? subscription(0, 100000) : new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))));
  eq(await codeOf(() => speech.synthesizeSpeech("Oi.", V1, { env: goodEnv, fetchImpl: slow, timeoutMs: 30 })), "TIMEOUT", "timeout");
});

await check("áudio vazio ou texto vazio nunca tocam: UNAVAILABLE / BAD_REQUEST", async () => {
  const empty = mockFetch((url) => (url.includes("/v1/user/subscription") ? subscription(0, 100000) : new Response(new Uint8Array([]), { status: 200 })));
  eq(await codeOf(() => speech.synthesizeSpeech("Oi.", V1, { env: goodEnv, fetchImpl: empty })), "UNAVAILABLE", "áudio vazio");
  const f = okFetch();
  eq(await codeOf(() => speech.synthesizeSpeech("   ", V1, { env: goodEnv, fetchImpl: f })), "BAD_REQUEST", "texto vazio");
  eq(f.calls.length, 0, "rede");
});

// ---------- Modo simulado e disponibilidade ----------
await check("modo simulado: WAV válido, sem rede e sem chave; vozes simuladas na lista", async () => {
  const f = okFetch();
  const env = { ELEVENLABS_MODE: "simulado" };
  const r = await speech.synthesizeSpeech("Oi.", "SimulatedVoice01", { env, fetchImpl: f });
  eq(r.mode, "simulado", "modo");
  eq(r.contentType, "audio/wav", "tipo");
  eq(String.fromCharCode(...r.audio.slice(0, 4)), "RIFF", "WAV");
  eq(f.calls.length, 0, "rede");
  eq(await codeOf(() => speech.synthesizeSpeech("Oi.", "VozQualquerXYZ", { env, fetchImpl: f })), "BAD_REQUEST", "voz fora da lista simulada");
  const list = await speech.listAuthorizedVoices({ env, fetchImpl: f });
  ok(list.voices.length >= 2 && list.voices[0].note.includes("feminina") && list.defaultVoice === list.voices[0].id, "lista simulada");
});

await check("disponibilidade não expõe chave, ids nem configuração", () => {
  const a = speech.getSpeechAvailability(goodEnv);
  eq(a.available, true, "disponível");
  const text = JSON.stringify(a);
  ok(!text.includes(FAKE_KEY) && !text.includes(V1), "vazou configuração");
  eq(speech.getSpeechAvailability({}).reason, "NOT_CONFIGURED", "sem config");
  eq(speech.getSpeechAvailability({ ...goodEnv, ELEVENLABS_VOICE_IDS: "" }).reason, "VOICES_NOT_CONFIGURED", "sem vozes");
});

// ---------- Lista de vozes da conta ----------
await check("lista: nomes e rótulos (feminina/português) vêm da conta; falha de nome não derruba a voz; só ids autorizados são consultados", async () => {
  speech.clearVoiceCache();
  const f = mockFetch((url) => {
    if (url.endsWith(`/v1/voices/${V1}`)) return new Response(JSON.stringify({ name: "Voz Teste", labels: { gender: "female", language: "pt", accent: "brasileiro" } }), { status: 200 });
    return new Response("{}", { status: 500 });
  });
  const list = await speech.listAuthorizedVoices({ env: goodEnv, fetchImpl: f, now: 1_000 });
  eq(list.voices[0].label, "Voz Teste", "nome");
  eq(list.voices[0].note, "feminina · português · brasileiro", "rótulos");
  eq(list.voices[1].label, "Voz 2", "sem nome");
  ok(list.voices[1].note.includes("sem rótulo"), "nota genérica");
  eq(list.defaultVoice, V1, "padrão");
  ok(f.calls.every((c) => c.url.endsWith(`/v1/voices/${V1}`) || c.url.endsWith(`/v1/voices/${V2}`)), "consultou id fora da lista");
  ok(f.calls.every((c) => !c.url.includes("text-to-speech")), "lista não pode sintetizar (consome créditos)");
  const before = f.calls.length;
  await speech.listAuthorizedVoices({ env: goodEnv, fetchImpl: f, now: 2_000 });
  eq(f.calls.length, before + 1, "cache: só a voz sem nome é consultada de novo");
});

// ---------- Texto lido e consumo estimado ----------
await check("texto de leitura sai só da base (por id), cabe em 900 caracteres e o consumo estimado é conhecido", () => {
  let max = 0;
  for (const e of knowledge.ASSISTANT_ENTRIES) {
    const t = speechTextForEntry(e.id);
    ok(t && t.length > 20 && t.length <= SPEECH_TEXT_MAX_LENGTH, `${e.id}: ${t?.length}`);
    max = Math.max(max, t.length);
  }
  ok(max <= 900, `maior texto: ${max}`);
  eq(speechTextForEntry("qualquer coisa vinda do navegador"), null, "id inválido");
  console.log(`     (maior leitura da base: ${max} caracteres ≈ ${max} créditos no máximo; média ≈ ${Math.round(knowledge.ASSISTANT_ENTRIES.map((e) => speechTextForEntry(e.id).length).reduce((a, b) => a + b, 0) / knowledge.ASSISTANT_ENTRIES.length)})`);
});

// ---------- Estrutura ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next"].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js|json|css)$/.test(name)) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(root, f).replaceAll("\\", "/");

await check("a chave existe só no módulo de servidor e no utilitário manual; nunca em componente, rota ou NEXT_PUBLIC", () => {
  const holders = walk(path.join(root, "apps/web"))
    .filter((f) => /ELEVENLABS_API_KEY|xi-api-key/.test(readFileSync(f, "utf8")))
    .map(rel);
  eq(JSON.stringify(holders), JSON.stringify(["apps/web/lib/assistant/elevenlabs-speech.ts"]), "arquivos com a chave");
  const everything = walk(path.join(root, "apps/web")).map((f) => readFileSync(f, "utf8")).join("\n");
  ok(!/NEXT_PUBLIC_ELEVEN/.test(everything), "NEXT_PUBLIC_ELEVEN");
});

await check("nenhum segredo literal no repositório (chaves ElevenLabs têm o formato sk_…)", () => {
  const files = [...walk(path.join(root, "apps/web")), ...walk(path.join(root, "scripts")), ...walk(path.join(root, "docs")).concat([])];
  for (const f of files) ok(!/\bsk_[a-f0-9]{30,}\b/i.test(readFileSync(f, "utf8")), `possível chave em ${rel(f)}`);
});

await check("rota da voz: texto só da base, voz só autorizada, logs só com o código, resposta sem chave", () => {
  const route = rd("apps/web/app/[projectId]/ajuda/assistente/voz/route.ts");
  ok(route.includes("speechTextForEntry(entryId)") && route.includes("resolveRequestedVoice(voice)"), "texto/voz");
  ok(!/body\.text|text\s*=\s*body/.test(route), "aceita texto do navegador");
  const logs = [...route.matchAll(/console\.(warn|log|error)\(([^)]*)\)/g)].map((m) => m[2]);
  ok(logs.length > 0 && logs.every((l) => !/key|chave|text|body|response|process\.env/i.test(l.replace("voz indisponível", ""))), `logs: ${logs}`);
  ok(!/console\./.test(rd("apps/web/lib/assistant/elevenlabs-speech.ts")), "o módulo de voz não deve logar");
  ok(route.includes("auth.getUser()") && route.includes("getProject(projectId)"), "login/obra");
});

await check("o utilitário manual não roda sem confirmação e nunca imprime a chave", () => {
  const util = rd("scripts/elevenlabs-list-voices.mjs");
  ok(util.includes("--confirmo-chamada-real") && util.indexOf("--confirmo-chamada-real") < util.indexOf("fetch("), "sem trava de confirmação antes da rede");
  ok(!/console\.(log|error)\([^)]*\bkey\b/.test(util), "imprime a chave");
  ok(!/process\.argv[^\n]*key/i.test(util), "chave por argumento");
});

await check("não restou nada do Azure no código nem nas variáveis", () => {
  const files = [...walk(path.join(root, "apps/web")), ...walk(path.join(root, "scripts"))].filter((f) => !f.endsWith("test-vera-voice-elevenlabs.mjs"));
  for (const f of files) ok(!/AZURE_SPEECH|azure-speech|AzureSpeech/.test(readFileSync(f, "utf8")), `Azure em ${rel(f)}`);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
