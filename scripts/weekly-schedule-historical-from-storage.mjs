// Recuperação HISTÓRICA de cronogramas (.mpp) a partir de mensagens JÁ COLETADAS e anexos JÁ ARMAZENADOS
// no ACC — sem depender do Gmail (a mensagem de origem pode ter sido apagada da caixa: 404).
//
// Cada mensagem informada vira um intake da recuperação histórica (applyHistoricalBackfillPolicy):
// PENDING_HUMAN_REVIEW / HISTORICAL_BACKFILL_REVIEW. Nada vira versão automaticamente, nada é comparado,
// nenhum caso/alerta/e-mail é gerado e a versão vigente do cronograma NÃO muda. Os bytes já armazenados
// são reaproveitados (nenhum download do Gmail). Idempotente: mensagem já avaliada não é reprocessada.
//
// --include-pre-monitoring: mensagem anterior ao início do monitoramento é registrada como EVIDÊNCIA
// histórica (mesma política de revisão humana), com auditoria explícita do motivo. Sem a flag, ela
// continua IGNORED_OUTSIDE_WINDOW.
//
// Uso:
//   node scripts/weekly-schedule-historical-from-storage.mjs <projectId> --email-ids=<id,id> [--include-pre-monitoring] [--apply]
// Sem --apply: simulação (nada gravado). Log público: só ids opacos, semanas, status e contagens.
import { createClient } from "@supabase/supabase-js";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { processWeeklyScheduleEmailCandidate } = await import("../apps/web/lib/schedule/weekly-ingestion/ingest-weekly-schedule-email");
const { loadWeeklyScheduleIngestionConfigs, createSupabaseWeeklyScheduleIngestionStore } = await import("../apps/web/lib/schedule/weekly-ingestion/supabase-store");
const { evaluateWeeklyScheduleEmail, applyHistoricalBackfillPolicy } = await import("../apps/web/lib/schedule/weekly-ingestion/evaluate-weekly-schedule-email");
const { resolveWeekStart } = await import("../apps/web/lib/schedule/weekly-ingestion/week-window");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includePreMonitoring = args.includes("--include-pre-monitoring");
const projectId = args.find((a) => !a.startsWith("--")) ?? null;
const emailIds = (args.find((a) => a.startsWith("--email-ids="))?.slice("--email-ids=".length) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!projectId || emailIds.length === 0) {
  console.error("Uso: <projectId> --email-ids=<id,id> [--include-pre-monitoring] [--apply]");
  process.exit(1);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
const opaque = (id) => `ref-${String(id).slice(0, 8)}`;

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const [config] = await loadWeeklyScheduleIngestionConfigs(supabase, { onlyEnabled: true, projectId });
if (!config) {
  console.log("Projeto sem ingestão semanal habilitada. Nada a fazer.");
  process.exit(0);
}

// Bytes vêm do armazenamento do ACC (nunca do Gmail).
async function downloadFromStorage({ gmailMessageId, gmailAttachmentId }) {
  const { data: row, error } = await supabase
    .from("email_attachments")
    .select("storage_bucket,storage_path")
    .eq("project_id", projectId)
    .eq("gmail_message_id", gmailMessageId)
    .eq("gmail_attachment_id", gmailAttachmentId)
    .not("storage_path", "is", null)
    .limit(1)
    .maybeSingle();
  if (error || !row) throw new Error("Anexo sem cópia armazenada no ACC.");
  const { data, error: dlError } = await supabase.storage.from(row.storage_bucket).download(row.storage_path);
  if (dlError || !data) throw new Error("Falha ao ler o anexo armazenado.");
  return Buffer.from(await data.arrayBuffer());
}
const store = createSupabaseWeeklyScheduleIngestionStore(supabase, downloadFromStorage);

const summary = { avaliadas: 0, ja_avaliadas: 0, registradas: {}, pre_monitoramento: 0, sem_mpp: 0 };
console.log(`Modo: ${apply ? "APLICAR (grava)" : "SIMULAÇÃO"}; mensagens: ${emailIds.length}; pré-monitoramento: ${includePreMonitoring ? "incluir como evidência" : "não"}`);

for (const emailId of emailIds) {
  const { data: email, error } = await supabase
    .from("emails")
    .select("id,provider_message_id,provider_thread_id,message_id_header,mailbox_address,direction,provider_labels,from_address,to_address,subject,sent_at")
    .eq("project_id", projectId)
    .eq("id", emailId)
    .maybeSingle();
  if (error || !email) {
    console.log(`${opaque(emailId)}: mensagem não encontrada no ACC.`);
    continue;
  }
  const { data: atts, error: attError } = await supabase
    .from("email_attachments")
    .select("gmail_attachment_id,original_file_name,mime_type,file_size_bytes,sha256_hash,storage_path")
    .eq("email_id", emailId);
  if (attError) throw new Error("Falha ao listar anexos.");
  // Linhas duplicadas do mesmo arquivo (mesmo hash e nome) contam uma vez.
  const seen = new Set();
  const attachments = [];
  for (const a of atts ?? []) {
    const key = `${a.sha256_hash ?? a.gmail_attachment_id}|${a.original_file_name}`;
    if (seen.has(key) || !a.gmail_attachment_id) continue;
    seen.add(key);
    attachments.push({ gmailAttachmentId: a.gmail_attachment_id, fileName: a.original_file_name, mimeType: a.mime_type ?? "application/octet-stream", sizeBytes: Number(a.file_size_bytes ?? 0), sha256Hash: a.sha256_hash ?? null });
  }
  const candidate = {
    emailId: email.id,
    gmailMessageId: email.provider_message_id,
    gmailThreadId: email.provider_thread_id ?? null,
    messageIdHeader: email.message_id_header ?? null,
    mailboxAddress: email.mailbox_address ?? null,
    direction: email.direction ?? null,
    providerLabels: email.provider_labels ?? [],
    fromAddress: String(email.from_address ?? "").toLowerCase().match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? "",
    toAddresses: String(email.to_address ?? "").toLowerCase().match(/[^\s<>",;]+@[^\s<>",;]+/g) ?? [],
    ccAddresses: [],
    subject: email.subject ?? "(sem assunto)",
    sentAt: new Date(email.sent_at).toISOString(),
    attachments,
    historicalBackfill: true,
  };

  // Simulação da decisão (mesma política que o processamento aplicará).
  const sender = await store.resolveSender(projectId, candidate.fromAddress, config.authorizedArea);
  let effectiveConfig = config;
  let decision = applyHistoricalBackfillPolicy(evaluateWeeklyScheduleEmail(candidate, config, sender));
  let preMonitoring = false;
  if (decision.status === "IGNORED_OUTSIDE_WINDOW" && includePreMonitoring) {
    effectiveConfig = { ...config, monitoringStartAt: null, monitoringEndAt: null };
    decision = applyHistoricalBackfillPolicy(evaluateWeeklyScheduleEmail(candidate, effectiveConfig, sender));
    preMonitoring = true;
    summary.pre_monitoramento += 1;
  }
  if (decision.mppCandidates.length === 0) summary.sem_mpp += 1;
  const week = resolveWeekStart(candidate.sentAt, config.timezone);
  console.log(`${opaque(email.id)}: semana ${week}, anexos .mpp distintos ${decision.mppCandidates.length}, decisão ${decision.status} (${decision.rule})${preMonitoring ? " [anterior ao monitoramento: evidência histórica]" : ""}`);
  summary.avaliadas += 1;
  if (!apply) continue;

  const outcome = await processWeeklyScheduleEmailCandidate(store, effectiveConfig, candidate);
  if (outcome.kind === "ALREADY_EVALUATED") {
    summary.ja_avaliadas += 1;
    console.log(`  => já avaliada (${outcome.status}); nada alterado.`);
    continue;
  }
  summary.registradas[outcome.status] = (summary.registradas[outcome.status] ?? 0) + 1;
  console.log(`  => intake ${opaque(outcome.intakeId)} ${outcome.status}`);
  await store.writeAudit({
    projectId,
    action: "WEEKLY_SCHEDULE_HISTORICAL_FROM_STORAGE",
    entityType: "WEEKLY_SCHEDULE_EMAIL_INTAKE",
    entityId: outcome.intakeId,
    detail: `Recuperação histórica a partir de mensagem já coletada e anexos já armazenados (sem Gmail): semana ${week}, ${decision.mppCandidates.length} .mpp distinto(s), status ${outcome.status}.${preMonitoring ? " Mensagem ANTERIOR ao início do monitoramento: registrada só como evidência histórica (revisão humana), sem obrigação semanal nem versão automática." : ""} Nenhuma versão vigente alterada; sem comparação, caso, alerta ou e-mail.`,
  });
}

console.log("RESULTADO", JSON.stringify(summary));
