// Utilitário MANUAL (nunca roda em testes nem em produção): lista as vozes da SUA conta ElevenLabs e a situação dos
// créditos, para você escolher as vozes autorizadas da AXIA (ELEVENLABS_VOICE_IDS) e conferir o saldo antes da
// primeira leitura. As duas consultas são somente leitura e NÃO consomem créditos.
//
// Segurança:
//  - a chave é lida de ELEVENLABS_API_KEY (variável de ambiente do seu terminal) ou de apps/web/.env.local — nunca de
//    argumento de linha de comando e nunca colada em chat; ela NÃO é impressa;
//  - só chama a rede com a confirmação explícita --confirmo-chamada-real (evita execução acidental);
//  - não gera áudio e não altera nada na conta.
//
// Uso (no seu terminal, na raiz do repositório):
//   node scripts/elevenlabs-list-voices.mjs --confirmo-chamada-real            # vozes femininas em português
//   node scripts/elevenlabs-list-voices.mjs --confirmo-chamada-real --todas    # todas as vozes da conta
//   node scripts/elevenlabs-list-voices.mjs --confirmo-chamada-real --creditos

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
if (!args.has("--confirmo-chamada-real")) {
  console.log("Nada foi chamado. Para consultar a sua conta (somente leitura, sem consumir créditos), rode de novo com --confirmo-chamada-real.");
  process.exit(0);
}

function readKey() {
  if (process.env.ELEVENLABS_API_KEY?.trim()) return process.env.ELEVENLABS_API_KEY.trim();
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", ".env.local");
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => l.startsWith("ELEVENLABS_API_KEY="));
  return line ? line.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : null;
}

const key = readKey();
if (!key) {
  console.error("ELEVENLABS_API_KEY não encontrada (defina no seu terminal ou em apps/web/.env.local). Não cole a chave no chat.");
  process.exit(1);
}

async function get(pathname) {
  const response = await fetch(`https://api.elevenlabs.io${pathname}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15000) });
  if (response.status === 401 || response.status === 403) throw new Error(`A chave foi recusada (${response.status}). Verifique as permissões da chave (precisa ler vozes e a assinatura).`);
  if (!response.ok) throw new Error(`Falha ${response.status} em ${pathname}.`);
  return response.json();
}

try {
  if (args.has("--creditos")) {
    const s = await get("/v1/user/subscription");
    const restantes = Number(s.character_limit) - Number(s.character_count);
    console.log(`Plano: ${s.tier ?? "?"} | status: ${s.status ?? "?"}`);
    console.log(`Créditos usados: ${s.character_count} de ${s.character_limit} | restantes: ${restantes}`);
    console.log(`Cobrança por uso (excedente) habilitada na conta: ${s.allowed_to_extend_character_limit === true ? "SIM — confira na sua assinatura" : s.allowed_to_extend_character_limit === false ? "não" : "não informado"}`);
    if (s.next_character_count_reset_unix) console.log(`Renovação dos créditos: ${new Date(Number(s.next_character_count_reset_unix) * 1000).toLocaleString("pt-BR")}`);
  } else {
    const data = await get("/v1/voices?page_size=100");
    const voices = (data.voices ?? []).map((v) => ({ id: v.voice_id, nome: v.name, genero: v.labels?.gender ?? "-", idioma: v.labels?.language ?? "-", sotaque: v.labels?.accent ?? "-", origem: v.category ?? "-" }));
    const filtradas = args.has("--todas") ? voices : voices.filter((v) => v.genero === "female" && (v.idioma === "pt" || /portugu|brazil/i.test(v.sotaque)));
    if (filtradas.length === 0) console.log("Nenhuma voz feminina em português encontrada na conta. Adicione uma voz à sua conta (Voice Library → filtre Português/feminina → Add) ou use --todas.");
    for (const v of filtradas) console.log(`${v.nome.padEnd(24)} id=${v.id}  ${v.genero}/${v.idioma}/${v.sotaque}  (${v.origem})`);
    console.log("\nCopie os ids escolhidos (a primeira deve ser feminina pt-BR) para ELEVENLABS_VOICE_IDS, separados por vírgula.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha na consulta.");
  process.exit(1);
}
