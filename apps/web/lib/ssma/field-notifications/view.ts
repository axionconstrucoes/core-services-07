// Aviso visível (puro) sobre o estado das notificações por e-mail de um registro de campo.
// Vem de ssma_notification_summary (sem e-mails de terceiros). Falha e ausência de destinatário NUNCA ficam em silêncio.

export interface NotificationSummaryRow {
  record_id: string;
  event: "CRITICAL_RECORD" | "ACTION_OVERDUE" | string;
  sent: number;
  failed: number;
  suppressed: number;
  pending: number;
}

export interface NotificationLine {
  tone: "ok" | "warn" | "error";
  text: string;
}

const EVENT_LABEL: Record<string, string> = { CRITICAL_RECORD: "Aviso de registro crítico", ACTION_OVERDUE: "Aviso de ação em atraso" };

export function describeNotification(rows: readonly NotificationSummaryRow[]): NotificationLine[] {
  const lines: NotificationLine[] = [];
  for (const row of rows) {
    const label = EVENT_LABEL[row.event] ?? "Aviso por e-mail";
    if (row.suppressed > 0 && row.sent === 0) {
      lines.push({ tone: "error", text: `${label}: NÃO enviado — nenhum destinatário elegível com e-mail nesta obra. Peça ao administrador para configurar a área (Engenharia ou SSMA/ESG) e o e-mail dos responsáveis.` });
    } else if (row.failed > 0) {
      lines.push({ tone: "warn", text: `${label}: falhou para ${row.failed} destinatário(s)${row.sent > 0 ? ` (enviado a ${row.sent})` : ""}. O ACC tenta de novo automaticamente.` });
    } else if (row.pending > 0) {
      lines.push({ tone: "warn", text: `${label}: envio em andamento.` });
    } else if (row.sent > 0) {
      lines.push({ tone: "ok", text: `${label}: enviado a ${row.sent} destinatário(s).` });
    }
  }
  return lines;
}

export function groupNotificationRows(rows: readonly NotificationSummaryRow[]): Map<string, NotificationSummaryRow[]> {
  const map = new Map<string, NotificationSummaryRow[]>();
  for (const row of rows) map.set(row.record_id, [...(map.get(row.record_id) ?? []), row]);
  return map;
}
