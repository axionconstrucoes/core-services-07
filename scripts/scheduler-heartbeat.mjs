// Heartbeat de término dos workflows agendados (proposta do agendador SLA,
// docs/operacao-agendador-sla.md). Registra em
// public.acc_scheduler_heartbeats, via RPC acc_scheduler_record_heartbeat,
// que o job TERMINOU (success/failure/cancelled). Disparar não comprova
// execução; este registro sim.
//
// Uso: node scripts/scheduler-heartbeat.mjs <job> <success|failure|cancelled>
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, opcional RUN_STARTED_AT.
// Nunca falha o workflow: sem credencial, sem a RPC (migration não aplicada)
// ou com erro de rede, apenas avisa e sai com 0. Nunca imprime URL/chave.

const JOBS = new Set(["weekly-all", "mpp-worker", "document-worker", "gmail-sync", "ssma-drive", "construmanager", "diario"]);
const STATUSES = new Set(["success", "failure", "cancelled"]);

export function buildHeartbeatPayload(job, status, startedAt) {
  if (!JOBS.has(job)) throw new Error("job inválido");
  if (!STATUSES.has(status)) throw new Error("status inválido");
  const started = startedAt && !Number.isNaN(Date.parse(startedAt)) ? new Date(startedAt).toISOString() : null;
  return { p_job: job, p_status: status, p_started_at: started, p_failure_code: status === "success" ? null : `JOB_${status.toUpperCase()}` };
}

async function main() {
  const [job, rawStatus] = process.argv.slice(2);
  const status = String(rawStatus ?? "").toLowerCase();
  let payload;
  try {
    payload = buildHeartbeatPayload(job, status, process.env.RUN_STARTED_AT);
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
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/acc_scheduler_record_heartbeat`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) {
      console.log("Heartbeat: agendador ainda não instalado no banco (sem efeito).");
      return;
    }
    console.log(response.ok ? `Heartbeat registrado: ${job} ${status}.` : `::warning::Heartbeat não registrado (HTTP ${response.status}).`);
  } catch {
    console.log("::warning::Heartbeat não registrado (falha de rede).");
  }
}

import { fileURLToPath } from "node:url";
import path from "node:path";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
