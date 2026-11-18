// Marca de "detectado com atraso" dos alertas de ausência semanal — puro, sem I/O.
//
// Um alerta de ausência normalmente nasce na própria semana (após o prazo e antes da virada).
// Quando o agendador não executa nessa janela, a semana fica sem alerta. A recuperação de
// semanas perdidas (createMissedWeekAbsenceAlerts) cria esses alertas DEPOIS, com esta marca
// no início do `detail` (sem migration): data de detecção + prazo original.
//
// Consequência no ciclo de alertas de risco: caso originado de alerta detectado com atraso NÃO
// gera e-mail por padrão — fica registrado/visível e entra na mesma trava de decisão de
// reemissão (RISK_ALERT_REISSUE_APPROVED, por caso). Ligar risk_alerts_enabled não dispara nada
// histórico.

export const LATE_DETECTION_MARKER = "[DETECTADO COM ATRASO";

export function formatLateDetectionDetail(detectedAt: Date, originalDeadlineAt: Date, detail: string): string {
  return `${LATE_DETECTION_MARKER} em ${detectedAt.toISOString()}; prazo original ${originalDeadlineAt.toISOString()}] ${detail}`;
}

export function isLateDetectedDetail(detail: string | null | undefined): boolean {
  return typeof detail === "string" && detail.startsWith(LATE_DETECTION_MARKER);
}
