// Instala o fetch resiliente (scripts/lib/resilient-fetch.mjs) como globalThis.fetch ANTES do script principal.
// Uso (mesmo padrão de block-live-ai.mjs):
//   node --import ./scripts/lib/install-resilient-fetch.mjs scripts/<worker>.mjs
// ou, no workflow, por step: env NODE_OPTIONS: --import=./scripts/lib/install-resilient-fetch.mjs
// (assim também cobre processos filhos, ex.: o document worker que chama process-document-version.mjs).
//
// Escopo: SOMENTE o host do Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL). Chamadas ao Gmail, ao Construmanager,
// ao Diário de Obra ou a qualquer outro host passam pelo fetch original, sem nenhuma alteração.
// O supabase-js captura `fetch` no createClient; como este módulo roda antes do script, o cliente recebe a versão resiliente.
// Ajustes opcionais (sem segredo): ACC_RETRY_MAX_ATTEMPTS, ACC_RETRY_BASE_DELAY_MS, ACC_RETRY_MAX_DELAY_MS.
// ACC_RESILIENT_FETCH_DISABLED=1 desliga (válvula de escape operacional, sem deploy).
import { createResilientFetch, supabaseHostsFromEnv } from "./resilient-fetch.mjs";

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const disabled = process.env.ACC_RESILIENT_FETCH_DISABLED === "1";
const hosts = supabaseHostsFromEnv(process.env);

if (!disabled && hosts.length > 0 && typeof globalThis.fetch === "function" && !globalThis.fetch.isAccResilientFetch) {
  globalThis.fetch = createResilientFetch({
    fetchImpl: globalThis.fetch.bind(globalThis),
    hosts,
    service: "supabase",
    maxAttempts: positiveInt(process.env.ACC_RETRY_MAX_ATTEMPTS, 5),
    baseDelayMs: positiveInt(process.env.ACC_RETRY_BASE_DELAY_MS, 1000),
    maxDelayMs: positiveInt(process.env.ACC_RETRY_MAX_DELAY_MS, 30000),
  });
}
