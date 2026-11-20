// Motivo de falha do resumo semanal gravado em weekly_alert_digests.failure_reason (puro, sem I/O).
// Antes: sempre o texto genérico, sem como saber se foi credencial, quota ou indisponibilidade do Gmail
// (diagnóstico do envio perdido). Agora anexa SOMENTE o trecho de diagnóstico normalizado/allowlist
// ([etapa=… http=… api=… motivo=… classe=…]) — nunca mensagem livre, token ou e-mail.

import { extractGmailSendDiagnosticText } from "./gmail-send-error";

export const WEEKLY_DIGEST_FAILURE_BASE = "Falha no envio do resumo semanal.";

export function buildWeeklyDigestFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const diagnostic = extractGmailSendDiagnosticText(message);
  return diagnostic ? `${WEEKLY_DIGEST_FAILURE_BASE} ${diagnostic}` : WEEKLY_DIGEST_FAILURE_BASE;
}
