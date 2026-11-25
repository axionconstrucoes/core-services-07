import { register } from "node:module";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { computeExitCode, formatSummary, processMessageRows } from "./lib/gmail-ata-processing.mjs";
import { createDelegatedGmailAuth } from "./lib/gmail-delegated-auth.mjs";
import { prepareDelegatedRun } from "./lib/gmail-mailbox-run.mjs";

// Modo de autenticação: PADRÃO = OAUTH_USUARIO (histórico). DOMAIN_DELEGATION é opt-in e passa pela MESMA porta por
// caixa do coletor (controle + lista da obra + aceite individual + período), falhando fechado sem a tabela de controles.
const DELEGATION = (process.env.ACC_GMAIL_AUTH_MODE ?? "OAUTH_USUARIO").trim().toUpperCase() === "DOMAIN_DELEGATION";

register("./ts-module-resolver.mjs", import.meta.url);

const { ingestEmailAttachmentsForMessage } = await import(
  "../apps/web/lib/email/attachments/ingest-email-attachments.ts"
);
const { linkEmailAttachmentToDocument } = await import(
  "../apps/web/lib/email/attachments/link-email-attachment-to-document.ts"
);

const PROJECT_ID = process.argv[2] ?? "00000000-0000-4000-8000-000000000001";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isMeetingMinutes(fileName) {
  const text = normalize(fileName);
  const documentExtension = /\.(pdf|doc|docx|odt|rtf)$/i.test(fileName);
  if (!documentExtension) return false;
  return (
    /(^|[^a-z0-9])ata([^a-z0-9]|$)/.test(text) ||
    text.includes("ata de reuniao") ||
    text.includes("reuniao semanal") ||
    text.includes("meeting minutes") ||
    text.includes("minutes of meeting")
  );
}

function collectParts(part, out = []) {
  if (!part) return out;
  const fileName = String(part.filename ?? "").trim();
  const attachmentId = part.body?.attachmentId;
  if (fileName && attachmentId) {
    out.push({
      gmailAttachmentId: attachmentId,
      originalFileName: fileName,
      mimeType: part.mimeType || "application/octet-stream",
      declaredSizeBytes: Number(part.body?.size ?? 0),
    });
  }
  for (const child of part.parts ?? []) collectParts(child, out);
  return out;
}

function decodeBase64Url(value) {
  const normalized = String(value ?? "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const mailbox = required("GOOGLE_GMAIL_INBOUND_MAILBOX").toLowerCase();

const { data: planningMembers, error: planningMembersError } = await supabase
  .from("project_memberships")
  .select("user_id")
  .eq("project_id", PROJECT_ID)
  .eq("status", "ACTIVE")
  .eq("area", "PLANEJAMENTO");
if (planningMembersError) throw new Error(planningMembersError.message);

const planningUserIds = (planningMembers ?? []).map((row) => row.user_id);
const { data: planningProfiles, error: planningProfilesError } = planningUserIds.length
  ? await supabase.from("profiles").select("email").in("id", planningUserIds)
  : { data: [], error: null };
if (planningProfilesError) throw new Error(planningProfilesError.message);

const planningEmails = new Set(
  (planningProfiles ?? []).map((row) => String(row.email ?? "").trim().toLowerCase()).filter(Boolean)
);
// Teto de retentativas para mensagens indisponíveis no Gmail (HTTP 404 em messages.get): cada 404 é registrado
// em audit_log_entries (sem migration); ao atingir o teto, a mensagem vira pendência permanente e não é mais
// consultada. O registro do e-mail e o histórico são preservados.
const UNAVAILABLE_ACTION = "GMAIL_MESSAGE_UNAVAILABLE";
const UNAVAILABLE_MAX_ATTEMPTS = 3;
const { data: unavailableRows, error: unavailableError } = await supabase
  .from("audit_log_entries")
  .select("entity_id")
  .eq("project_id", PROJECT_ID)
  .eq("action", UNAVAILABLE_ACTION)
  .eq("entity_type", "EMAIL");
if (unavailableError) throw new Error(unavailableError.message);
const unavailableCounts = new Map();
for (const row of unavailableRows ?? []) unavailableCounts.set(row.entity_id, (unavailableCounts.get(row.entity_id) ?? 0) + 1);
const knownUnavailableIds = new Set(
  [...unavailableCounts].filter(([, count]) => count >= UNAVAILABLE_MAX_ATTEMPTS).map(([id]) => id)
);
async function recordUnavailable(row) {
  const attempt = (unavailableCounts.get(row.id) ?? 0) + 1;
  const { error } = await supabase.from("audit_log_entries").insert({
    project_id: PROJECT_ID,
    actor_type: "SYSTEM",
    actor_user_id: null,
    actor_label: null,
    action: UNAVAILABLE_ACTION,
    entity_type: "EMAIL",
    entity_id: row.id,
    detail: `Gmail messages.get HTTP 404 (tentativa ${attempt} de ${UNAVAILABLE_MAX_ATTEMPTS}); ao atingir o teto vira pendencia permanente, sem novas consultas.`,
  });
  if (error) throw new Error(error.message);
  unavailableCounts.set(row.id, attempt);
}

let auth;
if (DELEGATION) {
  const decision = await prepareDelegatedRun({ supabase, projectId: PROJECT_ID, mailbox, mode: "collect" });
  if (decision.failClosed) {
    console.error(decision.reason);
    process.exit(1);
  }
  if (!decision.proceed) {
    console.log(`Anexos da caixa ${mailbox} BLOQUEADOS: ${decision.blockers.join(", ")}. Nenhuma mensagem foi lida.`);
    process.exit(0);
  }
  auth = (await createDelegatedGmailAuth({ mailbox })).auth;
} else {
  auth = new google.auth.OAuth2(
    required("GOOGLE_GMAIL_INBOUND_CLIENT_ID"),
    required("GOOGLE_GMAIL_INBOUND_CLIENT_SECRET")
  );
  auth.setCredentials({ refresh_token: required("GOOGLE_GMAIL_INBOUND_REFRESH_TOKEN") });
}
const gmail = google.gmail({ version: "v1", auth });

const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const [
  { data: recent, error: recentError },
  { data: ataBySubject, error: ataError },
  { data: weeklyReports, error: weeklyReportsError },
] = await Promise.all([
  supabase
    .from("emails")
    .select("id,provider_message_id,provider_thread_id,sent_at,subject,from_address")
    .eq("project_id", PROJECT_ID)
    .eq("provider", "GMAIL")
    .eq("mailbox_address", mailbox)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(50),
  supabase
    .from("emails")
    .select("id,provider_message_id,provider_thread_id,sent_at,subject,from_address")
    .eq("project_id", PROJECT_ID)
    .eq("provider", "GMAIL")
    .eq("mailbox_address", mailbox)
    .or("subject.ilike.%ata%,subject.ilike.%reuni%")
    .order("sent_at", { ascending: false })
    .limit(150),
  // Relatórios semanais são um pacote documental: MPP + Excel + PDF/ata.
  // Não limitar a 24h: isso permite recuperar anexos de pacotes já
  // sincronizados antes desta regra (ex.: Excel ausente em email_attachments).
  supabase
    .from("emails")
    .select("id,provider_message_id,provider_thread_id,sent_at,subject,from_address")
    .eq("project_id", PROJECT_ID)
    .eq("provider", "GMAIL")
    .eq("mailbox_address", mailbox)
    .eq("document_classification", "RELATORIO_SEMANAL")
    .order("sent_at", { ascending: false })
    .limit(150),
]);

if (recentError) throw new Error(recentError.message);
if (ataError) throw new Error(ataError.message);
if (weeklyReportsError) throw new Error(weeklyReportsError.message);

// Isolamento por CAIXA: o ID de mensagem do Gmail só existe na caixa que o importou. Sem o filtro acima, a
// credencial de uma caixa consultaria IDs de outra (404 => pendência permanente indevida).
const byId = new Map();
for (const row of [...(recent ?? []), ...(ataBySubject ?? []), ...(weeklyReports ?? [])]) {
  if (row.provider_message_id) byId.set(row.id, row);
}

const summary = await processMessageRows({
  rows: byId.values(),
  planningEmails,
  gmail,
  ingest: (input) => ingestEmailAttachmentsForMessage(supabase, { projectId: PROJECT_ID, ...input }),
  link: (input) => linkEmailAttachmentToDocument(supabase, input),
  collectParts,
  decodeBase64Url,
  isMeetingMinutes,
  projectId: PROJECT_ID,
  mailbox,
  knownUnavailableIds,
  recordUnavailable,
});

console.log(JSON.stringify({ projectId: PROJECT_ID, ...summary }));
console.log(formatSummary(summary));

process.exitCode = computeExitCode(summary);
