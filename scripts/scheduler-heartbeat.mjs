// Heartbeat do agendador (proposta, docs/operacao-agendador-sla.md). Distingue:
//   disparo aceito (204, gravado pelo próprio agendador no banco) ->
//   INÍCIO real do job (este script, evento "started", com o run_id do GitHub) ->
//   CONCLUSÃO efetiva (evento "finished", com a conclusão success|failure|cancelled e o mesmo run_id).
// O watchdog do banco alerta "disparo sem início", "início sem conclusão", falha e ausência de sucesso.
//
// Uso: node scripts/scheduler-heartbeat.mjs <job> started
//      node scripts/scheduler-heartbeat.mjs <job> finished <success|failure|cancelled>
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT (definidos pelo runner).
// Nunca falha o workflow: sem credencial, sem a RPC (migration não aplicada) ou com erro de rede, só avisa e sai com 0.
// Nunca imprime URL nem chave.
//
// Confiabilidade (incidente 25/11/2026, run 45660161019): o heartbeat de início falhava com "falha de rede" num único
// 522 do Cloudflare e abortava em 15 s — antes de o Cloudflare devolver o 522 (~19 s). Agora usa o retry centralizado
// (scripts/lib/resilient-fetch.mjs) com timeout por tentativa de 25 s. A RPC é IDEMPOTENTE (UPDATE da linha de estado
// do job em acc_scheduler_heartbeats, mesmo run_id), então repetir é seguro em qualquer falha transitória.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResilientFetch } from "./lib/resilient-fetch.mjs";

export const HEARTBEAT_RETRY = Object.freeze({ maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 10000, attemptTimeoutMs: 25000 });

export function createHeartbeatFetch(options = {}) {
  // Se o processo já tiver o fetch resiliente global (via NODE_OPTIONS), usa o fetch ORIGINAL por baixo para não
  // empilhar duas camadas de retry.
  const base = globalThis.fetch?.originalFetch ?? globalThis.fetch;
  return createResilientFetch({
    fetchImpl: base,
    service: "heartbeat",
    treatAllAsIdempotent: true,
    hosts: null,
    ...HEARTBEAT_RETRY,
    ...options,
  });
}

const JOBS = new Set(["weekly-all", "mpp-worker", "document-worker", "gmail-sync", "ssma-drive", "construmanager", "diario"]);
const CONCLUSIONS = new Set(["success", "failure", "cancelled"]);

export function buildHeartbeatPayload(job, event, conclusion, env = {}) {
  if (!JOBS.has(job)) throw new Error("job inválido");
  if (event !== "started" && event !== "finished") throw new Error("evento inválido");
  const normalized = event === "finished" ? String(conclusion ?? "").toLowerCase() : null;
  if (event === "finished" && !CONCLUSIONS.has(normalized)) throw new Error("conclusão inválida");
  const runId = /^\d{1,20}$/.test(String(env.GITHUB_RUN_ID ?? "")) ? Number(env.GITHUB_RUN_ID) : null;
  const attempt = /^\d{1,4}$/.test(String(env.GITHUB_RUN_ATTEMPT ?? "")) ? Number(env.GITHUB_RUN_ATTEMPT) : null;
  return { p_job: job, p_event: event, p_run_id: runId, p_run_attempt: attempt, p_conclusion: normalized };
}

async function main() {
  const [job, event, conclusion] = process.argv.slice(2);
  let payload;
  try {
    payload = buildHeartbeatPayload(job, event, conclusion, process.env);
  } catch (error) {
    console.log(`::warning::Heartbeat não registrado: ${error.message}.`);
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log("::warning::Heartbeat não registrado: credenciais ausentes.");
    return;
  }
  try {
    const response = await createHeartbeatFetch()(`${url.replace(/\/$/, "")}/rest/v1/rpc/acc_scheduler_record_heartbeat`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 404) {
      console.log("Heartbeat: agendador ainda não instalado no banco (sem efeito).");
      return;
    }
    console.log(response.ok ? `Heartbeat registrado: ${job} ${event}${payload.p_conclusion ? ` ${payload.p_conclusion}` : ""}.` : `::warning::Heartbeat não registrado (HTTP ${response.status}).`);
  } catch (error) {
    const code = error?.cause?.code ?? error?.code ?? error?.name ?? "erro";
    console.log(`::warning::Heartbeat não registrado (falha de rede: ${code}; até ${HEARTBEAT_RETRY.maxAttempts} tentativas).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
