// Testes da Assistente ACC (piloto) e da voz (ElevenLabs, ver test-vera-voice-elevenlabs.mjs) — TUDO com serviço simulado: nenhuma chamada de rede,
// nenhuma chave real. Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-assistant.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const answerMod = await import("../apps/web/lib/assistant/answer");
const knowledge = await import("../apps/web/lib/assistant/knowledge");
const speech = await import("../apps/web/lib/assistant/elevenlabs-speech");
const { allowRequest } = await import("../apps/web/lib/assistant/rate-limit");
const { answerQuestion, speechTextForEntry, resolveAssistantMode, AssistantConfigError, SPEECH_TEXT_MAX_LENGTH } = answerMod;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = "11111111-1111-4111-8111-111111111111";
const FAKE_KEY = "FAKE-KEY-DO-TESTE-0123456789abcdef";
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
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
};
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ---------- Respostas ----------
const CASES = [
  ["Como envio documentos?", "documentos"],
  ["onde faço upload de um anexo do contrato", "documentos"],
  ["Como aprovar uma cláusula detectada?", "clausulas"],
  ["O que significa risco crítico?", "criterios-risco"],
  ["quais são os graus de risco", "qa-R1"],
  ["de quantos em quantos dias o alerta crítico repete?", "cores-repeticao"],
  ["Como respondo ao lote de alertas? O que é resposta parcial", "alertas-resposta"],
  ["como funciona o CONSULTAR IA", "consultar-ia"],
  ["como cadastrar uma nova providência e o prazo do CNO", "providencias"],
  ["Como instalo o SSMA no celular iPhone?", "ssma-instalar"],
  ["como registrar uma ocorrência com foto", "ssma-registrar"],
  ["o app funciona sem internet?", "sem-internet"],
  ["não consigo ver o módulo financeiro, qual a minha permissão", "permissoes"],
  ["onde baixo o tutorial em PDF", "ajuda-tutorial"],
  ["como entrar no acc com a conta google", "acesso"],
  ["por que o sistema aparece como operação parcial no dashboard", "dashboard"],
  ["para que serve esta autorização de acesso aos e-mails?", "autorizacao-finalidade"],
  ["o que o ACC poderá ler na minha conta?", "autorizacao-permissoes"],
  ["quais filtros são aplicados aos e-mails?", "autorizacao-filtros"],
  ["o que acontece se eu não autorizar?", "autorizacao-recusa"],
  ["como revogo a autorização desta obra?", "autorizacao-revogacao"],
  ["como revogo a permissão no Google?", "autorizacao-google"],
  ["qual a diferença entre o aceite e a conexão da conta?", "autorizacao-conexao"],
  ["quem é você, AXIA?", "vera"],
];
for (const [question, expected] of CASES) {
  await check(`pergunta → assunto: "${question.slice(0, 48)}"`, () => eq(answerQuestion(question, P).entryId, expected, "assunto"));
}

await check("pergunta fora do escopo: resposta honesta (fallback) + link do tutorial, sem inventar", () => {
  const a = answerQuestion("qual a previsão do tempo amanhã em Vitória", P);
  eq(a.entryId, "fallback", "assunto");
  ok(a.links.some((l) => l.href === `/${P}/ajuda`), "sem link para o tutorial");
});

await check("pedido para alterar dados: aviso de somente orientação", () => {
  ok(answerQuestion("apague o documento do contrato para mim", P).readOnlyNotice, "sem aviso (apagar para mim)");
  ok(answerQuestion("aprove todas as cláusulas agora", P).readOnlyNotice, "sem aviso (aprovar)");
  eq(answerQuestion("como aprovar uma cláusula?", P).readOnlyNotice, null, "pergunta de 'como' não deve avisar");
});

await check("isolamento entre obras: os links levam sempre à obra da sessão", () => {
  const other = "22222222-2222-4222-8222-222222222222";
  for (const [q] of CASES) {
    for (const link of answerQuestion(q, other).links) ok(link.href.startsWith(`/${other}/`), `link fora da obra: ${link.href}`);
  }
});

await check("a base de conhecimento não contém dado de obra, e-mail, UUID nem segredo", () => {
  const blob = JSON.stringify(knowledge.ASSISTANT_ENTRIES);
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(blob), "contém UUID");
  ok(!/@[a-z0-9-]+\./i.test(blob), "contém e-mail");
  ok(!/(newport|weg|sb_secret|eyJhbGci)/i.test(blob), "contém nome de obra ou segredo");
});

await check("toda resposta tem passos ou resumo e os slides citados existem (1 a 27)", () => {
  for (const e of knowledge.ASSISTANT_ENTRIES) {
    ok(e.summary.length > 20, `${e.id} sem resumo`);
    ok(e.tutorialSlide === null || (e.tutorialSlide >= 1 && e.tutorialSlide <= 27), `${e.id}: slide ${e.tutorialSlide}`);
  }
});

await check("modo da assistente é fail closed: 'anthropic' não é aceito em silêncio", () => {
  eq(resolveAssistantMode({}), "BASE_CONHECIMENTO", "padrão");
  eq(resolveAssistantMode({ AXION_AI_PROVIDER_ASSISTENTE: "fake" }), "BASE_CONHECIMENTO", "fake");
  let threw = false;
  try {
    resolveAssistantMode({ AXION_AI_PROVIDER_ASSISTENTE: "anthropic" });
  } catch (e) {
    threw = e instanceof AssistantConfigError;
  }
  ok(threw, "deveria falhar");
});

// ---------- Vozes ----------
await check("texto de leitura sai só da base (por id), cabe no limite e id desconhecido não gera texto", () => {
  for (const e of knowledge.ASSISTANT_ENTRIES) {
    const t = speechTextForEntry(e.id);
    ok(t && t.length > 20 && t.length <= SPEECH_TEXT_MAX_LENGTH, `${e.id}: ${t?.length}`);
  }
  ok(speechTextForEntry("fallback"), "fallback sem texto");
  eq(speechTextForEntry("qualquer coisa vinda do navegador"), null, "id inválido");
});

await check("limite por usuário: bloqueia acima do teto e libera depois da janela", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i += 1) ok(allowRequest("u1", 3, t0 + i), `pedido ${i}`);
  ok(!allowRequest("u1", 3, t0 + 10), "deveria bloquear");
  ok(allowRequest("u2", 3, t0 + 10), "outro usuário não é afetado");
  ok(allowRequest("u1", 3, t0 + 61_000), "deveria liberar após 60 s");
});

// ---------- Estrutura (rotas, chave, interface) ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next"].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js|css|json)$/.test(name)) out.push(full);
  }
  return out;
}
const rd = (rel) => readFileSync(path.join(root, rel), "utf8");
const askRoute = rd("apps/web/app/[projectId]/ajuda/assistente/route.ts");
const vozRoute = rd("apps/web/app/[projectId]/ajuda/assistente/voz/route.ts");
const widget = rd("apps/web/components/assistant/assistant-widget.tsx");

await check("rotas exigem login e participação na obra e nunca gravam dados", () => {
  for (const [name, src] of [["perguntar", askRoute], ["voz", vozRoute]]) {
    ok(src.includes("auth.getUser()") && src.includes("getProject(projectId)"), `${name}: sem checagem de sessão/obra`);
    ok(/status: 401/.test(src) && /status: 404/.test(src), `${name}: sem 401/404`);
    ok(!/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(src), `${name}: escreve no banco`);
  }
});

await check("a voz lê só texto da base: a rota usa o id, não texto do navegador", () => {
  ok(vozRoute.includes("speechTextForEntry(entryId)"), "não usa speechTextForEntry");
  ok(!/body\.text|text\s*=\s*body/.test(vozRoute), "aceita texto do navegador");
});

await check("a chave ElevenLabs só existe no módulo de servidor: nunca em componente, rota, script de navegador ou NEXT_PUBLIC", () => {
  const holders = walk(path.join(root, "apps/web"))
    .filter((f) => !f.includes(`${path.sep}.next${path.sep}`))
    .filter((f) => /ELEVENLABS_API_KEY|xi-api-key/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(root, f).replaceAll("\\", "/"));
  eq(JSON.stringify(holders), JSON.stringify(["apps/web/lib/assistant/elevenlabs-speech.ts"]), "arquivos com a chave");
  ok(!/NEXT_PUBLIC_ELEVEN/.test(widget + vozRoute + askRoute), "NEXT_PUBLIC_ELEVEN");
  ok(!/ELEVENLABS|xi-api-key/.test(widget), "widget conhece a chave");
});

await check("logs só registram o código do erro (nunca chave, texto ou resposta do serviço)", () => {
  const logs = [...(vozRoute + askRoute).matchAll(/console\.(warn|log|error)\(([^)]*)\)/g)].map((m) => m[2]);
  ok(logs.length > 0, "sem logs");
  for (const l of logs) ok(!/key|chave|text|body|response|process\.env/i.test(l.replace("voz indisponível", "")), `log suspeito: ${l}`);
  const lib = rd("apps/web/lib/assistant/elevenlabs-speech.ts");
  ok(!/console\./.test(lib), "o módulo de voz não deve logar");
});

await check("interface: caixa da AXIA com a imagem, Ouvir/Parar, seleção de voz, tutorial e aviso de falha", () => {
  const voiceControls = rd("apps/web/components/assistant/assistant-voice-controls.tsx");
  for (const marker of ["/assistente/axia-avatar.png", "AXIA — Assistente ACC", "/ajuda`", "A resposta em texto continua disponível", 'role="alert"']) {
    ok(widget.includes(marker), `falta: ${marker}`);
  }
  // Os controles de voz moraram no widget; agora ficam em componente próprio (renderização testada em test-assistant-render.mjs).
  for (const marker of ["Ouvir resposta", "Parar", 'id="assistente-voz"']) {
    ok(voiceControls.includes(marker), `falta nos controles de voz: ${marker}`);
  }
  ok(/listen\(last\.answer\.entryId\)/.test(widget) && !/useEffect\([^)]*listen/.test(widget), "a leitura deve começar só no clique");
  ok(!/autoPlay|\.play\(\)\s*;?\s*\}\s*,\s*\[/.test(widget), "reprodução automática");
  ok(!/font-(black|extrabold)/.test(widget), "peso Black/Extrabold");
});

await check("nome definitivo: AXIA — Assistente ACC; nenhum nome anterior na interface da assistente", () => {
  const files = [
    "apps/web/components/assistant/assistant-widget.tsx",
    "apps/web/components/assistant/vera-trigger.tsx",
    "apps/web/lib/assistant/knowledge.ts",
    "apps/web/lib/assistant/answer.ts",
    "apps/web/app/[projectId]/ajuda/assistente/route.ts",
  ];
  for (const f of files) {
    const src = rd(f);
    ok(!/Sofia|\bVERA\b|Ajuda ACC|Assistente ACC \(piloto\)/.test(src.replace(/AXIA — Assistente ACC/g, "")), `${f}: nome anterior`);
  }
  ok(rd("apps/web/components/assistant/assistant-widget.tsx").includes("AXIA — Assistente ACC"), "título da caixa");
});

await check("gatilho 'Fale com a AXIA' no topo das telas e no cabeçalho do PWA SSMA; foto, texto e teclado", () => {
  const top = rd("apps/web/components/layout/top-bar.tsx");
  ok(top.includes("<VeraTrigger />"), "top bar sem gatilho");
  const trig = rd("apps/web/components/assistant/vera-trigger.tsx");
  for (const m of ["Fale com a AXIA", "/assistente/axia-avatar.png", "min-h-11", 'type="button"', "aria-label"]) ok(trig.includes(m), `gatilho sem ${m}`);
  ok(rd("apps/web/components/ssma/ssma-chrome.tsx").includes("VeraTrigger"), "PWA sem gatilho");
  const chrome = rd("apps/web/components/ssma/ssma-chrome.tsx");
  ok(chrome.indexOf("</header>") < chrome.indexOf("<AssistantWidget"), "a caixa da AXIA não pode ficar dentro do cabeçalho (herdaria texto branco)");
  const widget = rd("apps/web/components/assistant/assistant-widget.tsx");
  ok(widget.includes('event.key === "Escape"') && widget.includes("openerRef.current?.focus()"), "teclado/foco");
});

await check("layout da obra monta a assistente e a imagem existe (PNG válido)", () => {
  ok(rd("apps/web/app/[projectId]/layout.tsx").includes("<AssistantWidget projectId={projectId} />"), "widget não montado");
  const png = readFileSync(path.join(root, "apps/web/public/assistente/axia-avatar.png"));
  eq(png.subarray(1, 4).toString(), "PNG", "assinatura");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
