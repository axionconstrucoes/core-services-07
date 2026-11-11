// Chave única das notificações SSMA por e-mail. FAIL CLOSED: só o valor EXATO "true" liga; ausente, vazio, "false", "TRUE", "1",
// "true " (com espaço) ou qualquer outro valor mantém DESLIGADO. Módulo puro (sem server-only) para ser testável isoladamente.
// Vale para o aviso imediato de registro CRÍTICO (/api/ssma/field-records/notifications) e para a varredura agendada
// (/api/cron/ssma-notifications, que mantém a sua própria checagem equivalente).

export const NOTIFICATIONS_DISABLED = "NOTIFICATIONS_DISABLED" as const;

export function ssmaNotificationsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ACC_SSMA_NOTIFICATIONS_ENABLED === "true";
}
