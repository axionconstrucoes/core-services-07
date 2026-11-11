// Recuperação somente de mensagens já importadas da WEG/caixa autorizada.
import { pilotSenderMatches } from "./gmail-weg-pilot-sender.mjs";
export const RECOVERY = Object.freeze({
  projectId: "00000000-0000-4000-8000-000000000001",
  mailbox: "reynaldo@axion.com.br",
  start: "2025-05-11T03:00:00.000Z",
  end: "2026-11-11T13:57:24.000Z",
});

export function recoveryOptions(args) {
  const allowed = /^(--apply|--kind=(bodies|attachments)|--limit=\d+)$/;
  if (args.some((arg) => !allowed.test(arg))) throw new Error("Argumento de recuperação inválido.");
  if (new Set(args.map((arg) => arg.split("=")[0])).size !== args.length) throw new Error("Argumento repetido.");
  const kind = args.find((arg) => arg.startsWith("--kind="))?.split("=")[1];
  const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 10);
  if (!kind || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Informe --kind e limite de 1 a 1000.");
  return { kind, limit, apply: args.includes("--apply") };
}

export function assertRecoveryAuthorization(config, mailboxes, authorizations) {
  if (!config?.enabled || config.project_id !== RECOVERY.projectId) throw new Error("Coleta da obra desabilitada.");
  if (!mailboxes.some((row) => row.enabled === true && row.mailbox_address === RECOVERY.mailbox)) throw new Error("Caixa fora da lista habilitada.");
  const latest = [...authorizations].sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
  if (!latest || latest.project_id !== RECOVERY.projectId || latest.account_email !== RECOVERY.mailbox || latest.status !== "AUTORIZADO" || !latest.decided_at || latest.decided_by_user_id !== latest.user_id) {
    throw new Error("Aceite vigente do titular não confirmado.");
  }
}

export function isRecoveryRow(row) {
  const time = Date.parse(row.sent_at);
  return row.project_id === RECOVERY.projectId && row.mailbox_address === RECOVERY.mailbox && row.provider === "GMAIL" &&
    pilotSenderMatches(RECOVERY.projectId, [row.from_address ?? ""]) &&
    Boolean(row.provider_message_id) && time >= Date.parse(RECOVERY.start) && time <= Date.parse(RECOVERY.end);
}

export function assertRecoveryMessage(row, message) {
  const time = Number(message?.internalDate);
  if (!isRecoveryRow(row) || message?.id !== row.provider_message_id || !Number.isFinite(time) || time < Date.parse(RECOVERY.start) || time > Date.parse(RECOVERY.end)) {
    throw new Error("Mensagem fora da obra, caixa ou período congelado.");
  }
}

export function collectRecoveryAttachments(part, result = []) {
  if (!part) return result;
  if (part.filename && part.body?.attachmentId) result.push({
    gmailAttachmentId: part.body.attachmentId, originalFileName: part.filename,
    mimeType: part.mimeType ?? "application/octet-stream", declaredSizeBytes: part.body.size ?? 0,
  });
  for (const child of part.parts ?? []) collectRecoveryAttachments(child, result);
  return result;
}
