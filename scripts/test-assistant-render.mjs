// Teste de RENDERIZAÇÃO dos controles de voz da AXIA (Fase 1: só texto). Diferente de test-assistant.mjs, que
// procura marcadores no código-fonte, este renderiza o componente React real para HTML e confere o resultado:
// com a voz desligada (ou ainda não consultada), "Ouvir resposta", "Parar" e o seletor de voz NÃO existem no HTML.
// Nenhuma chamada de rede, nenhuma chave; o .env.local local (se existir) só é lido para ELEVENLABS_ENABLED/VOICE_IDS.
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-assistant-render.mjs

import { existsSync, readFileSync } from "node:fs";
import { register, createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRequire = createRequire(path.join(root, "apps", "web", "package.json"));
const ts = webRequire("typescript");
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");
const speech = await import("../apps/web/lib/assistant/elevenlabs-speech");

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

// Transpila o componente real (TSX → CJS) e o executa com o React da própria aplicação.
const rel = "apps/web/components/assistant/assistant-voice-controls.tsx";
const source = readFileSync(path.join(root, rel), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (id) => webRequire(id), console });
const { AssistantVoiceControls } = mod.exports;

const voices = [{ id: "S4M4JhZIzYGUlDsYIOow", label: "Elena Vinter", note: "feminina, português" }];
const render = (over) =>
  renderToStaticMarkup(
    React.createElement(AssistantVoiceControls, {
      available: true,
      hasAnswer: true,
      voices,
      voiceId: voices[0].id,
      loading: false,
      speaking: false,
      notice: null,
      onVoiceChange: () => {},
      onListen: () => {},
      onStop: () => {},
      ...over,
    }),
  );

await check("voz DESLIGADA (available=false) com resposta: nenhum controle de voz é renderizado", () => {
  const html = render({ available: false });
  ok(html === "", `HTML esperado vazio, obtido: ${html.slice(0, 120)}`);
  for (const text of ["Ouvir resposta", "Parar", "assistente-voz", "Voz"]) ok(!html.includes(text), `"${text}" não deveria aparecer`);
});

await check("voz ainda não consultada (available=null): controles ocultos", () => {
  ok(render({ available: null }) === "", "deveria ser vazio enquanto não se sabe se a voz existe");
});

await check("voz ligada mas sem resposta ainda: controles ocultos", () => {
  ok(render({ hasAnswer: false }) === "", "sem resposta não há o que ouvir");
});

await check("voz LIGADA (Fase 3): botão, seletor e voz Elena Vinter aparecem — a integração está preservada", () => {
  const html = render({});
  for (const text of ["Ouvir resposta", "Parar", 'id="assistente-voz"', "Elena Vinter", "S4M4JhZIzYGUlDsYIOow"]) ok(html.includes(text), `faltou "${text}"`);
});

await check("falha de leitura com a voz ligada: aviso mantém a resposta em texto", () => {
  const html = render({ notice: "Não foi possível ler em voz alta agora. A resposta em texto continua disponível." });
  ok(html.includes('role="alert"') && html.includes("A resposta em texto continua disponível"), "aviso ausente");
});

await check("configuração local: ELEVENLABS_ENABLED=false ⇒ a rota de voz informa indisponível (sem rede) ⇒ controles ocultos", () => {
  const envPath = path.join(root, "apps", "web", ".env.local");
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = /^(ELEVENLABS_ENABLED|ELEVENLABS_VOICE_IDS|ELEVENLABS_DEFAULT_VOICE_ID)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    ok(env.ELEVENLABS_ENABLED === "false", `ELEVENLABS_ENABLED deveria ser "false" no .env.local (obtido ${JSON.stringify(env.ELEVENLABS_ENABLED)})`);
    ok(env.ELEVENLABS_VOICE_IDS === "S4M4JhZIzYGUlDsYIOow", "o Voice ID da Elena Vinter deve permanecer para a Fase 3");
  } else {
    console.log("     (sem apps/web/.env.local: usando ambiente vazio — voz desligada por padrão)");
  }
  // Mesmo com chave presente, enabled != "true" mantém desligado (fail-closed).
  const availability = speech.getSpeechAvailability({ ...env, ELEVENLABS_API_KEY: "FAKE-NAO-USADA-0123456789" });
  ok(availability.available === false, "com ELEVENLABS_ENABLED=false a voz deve estar indisponível");
  ok(render({ available: availability.available }) === "", "indisponível ⇒ HTML vazio");
});

await check("fiação: o widget usa o componente e repassa o estado da rota de voz (sem controles de voz próprios)", () => {
  const widget = readFileSync(path.join(root, "apps", "web", "components", "assistant", "assistant-widget.tsx"), "utf8");
  ok(widget.includes("<AssistantVoiceControls"), "o widget deve renderizar AssistantVoiceControls");
  ok(/available=\{voiceAvailable\}/.test(widget), "o widget deve repassar voiceAvailable");
  ok(!widget.includes("Ouvir resposta"), "o texto do botão não deve estar mais no widget");
  ok(!widget.includes("A leitura em voz ainda não está habilitada"), "o aviso de voz desabilitada foi removido (só texto)");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
