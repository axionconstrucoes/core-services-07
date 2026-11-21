// Fase 5 / G — configuração do pipeline. DESLIGADO por padrão; DRY_RUN por padrão; gravação só com flag explícita DUPLA.
export interface PipelineConfig {
  enabled: boolean;
  apply: boolean;
  /** Motivo legível do estado (nunca contém segredos). */
  reason: string;
}

const TRUE = new Set(["1", "true", "TRUE", "yes"]);

/**
 * - ACC_EMAIL_CLASSIFY_ENABLED=1 liga o pipeline (sem isso o runner nem consulta o banco).
 * - Gravação exige --apply (argumento) E ACC_EMAIL_CLASSIFY_APPLY=1. Só um deles => DRY_RUN.
 */
export function resolvePipelineConfig(env: Record<string, string | undefined>, argv: readonly string[]): PipelineConfig {
  const enabled = TRUE.has(env.ACC_EMAIL_CLASSIFY_ENABLED ?? "");
  if (!enabled) return { enabled: false, apply: false, reason: "DESLIGADO: defina ACC_EMAIL_CLASSIFY_ENABLED=1 para ligar o pipeline (padrão: desligado)" };
  const wantsApply = argv.includes("--apply");
  const allowApply = TRUE.has(env.ACC_EMAIL_CLASSIFY_APPLY ?? "");
  if (argv.includes("--dry-run") && wantsApply) return { enabled: true, apply: false, reason: "DRY_RUN: --dry-run e --apply juntos => prevalece o modo seguro" };
  if (wantsApply && allowApply) return { enabled: true, apply: true, reason: "APPLY: --apply e ACC_EMAIL_CLASSIFY_APPLY=1" };
  if (wantsApply) return { enabled: true, apply: false, reason: "DRY_RUN: --apply sem ACC_EMAIL_CLASSIFY_APPLY=1 não grava" };
  return { enabled: true, apply: false, reason: "DRY_RUN (padrão)" };
}
