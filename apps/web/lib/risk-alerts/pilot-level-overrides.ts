// Exceção TEMPORÁRIA do piloto: destinatário substituto de um NÍVEL da cadeia de escalonamento, por
// projeto e área. Puro, sem I/O.
//
// Uso atual: WEG/PLANEJAMENTO — o Gestor definitivo (Nível 2) é um convite pendente que está fora do
// piloto; enquanto a exceção vigorar, as comunicações do Nível 2 vão para um usuário da allowlist, nos
// MESMOS prazos da Matriz (nada de SLA é reiniciado nem alterado).
//
// A Matriz NÃO é alterada: o titular definitivo (usuário ou convite) continua gravado em
// sla_area_responsibles. A ativação futura do convite do titular NÃO troca o roteamento: enquanto o
// registro mais recente for SET, a exceção vale; a volta exige um registro UNSET explícito.
//
// Fonte explícita e auditável, sem migration — registros append-only em audit_log_entries:
//   action      = RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET | RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_UNSET
//   entity_type = PROJECT_RISK_ALERT_AREA_LEVEL
//   entity_id   = "<projectId>:<AREA>:LEVEL_2"
//   actor_type  = USER (registro humano; SYSTEM/LEGACY são ignorados)
//   detail      = JSON { "area": "PLANEJAMENTO", "level": "LEVEL_2", "recipientUserId": "<uuid>", "reason": "..." }
// O registro humano MAIS RECENTE por (área, nível) decide.
//
// Só vale no piloto: o substituto precisa estar na allowlist de destinatários do projeto; fora dela a
// exceção é ignorada (a cadeia segue a Matriz: sem Nível 2 => pula para a Diretoria).

import { slaAreaLabels, slaEscalationLevelLabels } from "@/lib/labels";
import type { MatrixPolicy } from "@/lib/sla/resolve-matrix-policy";
import type { SlaArea, SlaEscalationLevel } from "@/lib/sla/types";

export const LEVEL_OVERRIDE_SET_ACTION = "RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET";
export const LEVEL_OVERRIDE_UNSET_ACTION = "RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_UNSET";
export const LEVEL_OVERRIDE_ENTITY_TYPE = "PROJECT_RISK_ALERT_AREA_LEVEL";

/** Níveis suportados pela exceção (hoje só o Nível 2 · Gestor). */
export type OverridableLevel = "LEVEL_2";

export interface LevelOverrideAuditRow {
  id?: string;
  project_id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string | null;
}

export interface PilotLevelOverride {
  area: SlaArea;
  level: OverridableLevel;
  recipientUserId: string;
  reason: string | null;
  setAt: string;
  setByUserId: string;
  auditId: string | null;
}

/** Rótulo do Nível 2 quando a exceção está ativa (diferencia o nível mesmo com o mesmo destinatário da Diretoria). */
export const LEVEL_2_OVERRIDE_LABEL = "Nível 2 · Gestor (substituição temporária do piloto)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDetail(detail: string | null): { area: string; level: string; recipientUserId: string | null; reason: string | null } | null {
  if (!detail) return null;
  try {
    const value = JSON.parse(detail);
    if (!value || typeof value !== "object" || typeof value.area !== "string" || typeof value.level !== "string") return null;
    return {
      area: value.area,
      level: value.level,
      recipientUserId: typeof value.recipientUserId === "string" ? value.recipientUserId : null,
      reason: typeof value.reason === "string" ? value.reason : null,
    };
  } catch {
    return null;
  }
}

/** Exceções vigentes por área (registro humano mais recente por área+nível; SET com destinatário válido). */
export function resolvePilotLevelOverrides(projectId: string, rows: LevelOverrideAuditRow[]): PilotLevelOverride[] {
  const latest = new Map<string, LevelOverrideAuditRow>();
  for (const row of rows) {
    if (row.project_id !== projectId || row.entity_type !== LEVEL_OVERRIDE_ENTITY_TYPE) continue;
    if (row.action !== LEVEL_OVERRIDE_SET_ACTION && row.action !== LEVEL_OVERRIDE_UNSET_ACTION) continue;
    if (row.actor_type !== "USER" || !row.actor_user_id) continue;
    const [entityProject, area, level] = row.entity_id.split(":");
    if (entityProject !== projectId || !area || level !== "LEVEL_2") continue;
    const detail = parseDetail(row.detail);
    if (!detail || detail.area !== area || detail.level !== level) continue;
    const key = `${area}:${level}`;
    const current = latest.get(key);
    if (!current || row.occurred_at > current.occurred_at) latest.set(key, row);
  }
  const out: PilotLevelOverride[] = [];
  for (const row of latest.values()) {
    if (row.action !== LEVEL_OVERRIDE_SET_ACTION) continue;
    const detail = parseDetail(row.detail)!;
    if (!detail.recipientUserId || !UUID.test(detail.recipientUserId)) continue;
    out.push({
      area: detail.area as SlaArea,
      level: "LEVEL_2",
      recipientUserId: detail.recipientUserId,
      reason: detail.reason,
      setAt: row.occurred_at,
      setByUserId: row.actor_user_id!,
      auditId: row.id ?? null,
    });
  }
  return out;
}

export interface PolicyLevel2Override {
  recipientUserId: string;
  /** Titular definitivo gravado na Matriz (usuário), se houver — continua sendo o titular. */
  definitiveUserId: string | null;
  label: string;
  auditId: string | null;
}

export type PolicyWithOverride = MatrixPolicy & { level2Override?: PolicyLevel2Override | null };

/**
 * Aplica a exceção vigente ao Nível 2 da política (em memória; a Matriz não muda). Só vale se o
 * substituto estiver na allowlist do piloto. Prazos, regra e status da Matriz ficam intactos
 * (LEVEL_2_MISSING continua listado e não bloqueante quando o titular é só convite).
 */
export function applyPilotLevelOverride(
  policy: MatrixPolicy,
  overrides: readonly PilotLevelOverride[] | undefined,
  allowlistUserIds: readonly string[] | null | undefined
): PolicyWithOverride {
  const override = overrides?.find((o) => o.area === policy.area && o.level === "LEVEL_2");
  if (!override) return policy;
  if (!allowlistUserIds || !allowlistUserIds.includes(override.recipientUserId)) return policy;
  return {
    ...policy,
    level2UserId: override.recipientUserId,
    level2Override: {
      recipientUserId: override.recipientUserId,
      definitiveUserId: policy.level2UserId,
      label: LEVEL_2_OVERRIDE_LABEL,
      auditId: override.auditId,
    },
  };
}

/** Rótulo do nível; com a exceção ativa, o Nível 2 é identificado como substituição (mesmo destinatário da Diretoria). */
export function levelLabelFor(level: SlaEscalationLevel, policy: MatrixPolicy): string {
  const override = (policy as PolicyWithOverride).level2Override;
  if (level === "ESCALAO_1" && override) return override.label;
  return slaEscalationLevelLabels[level];
}

/** Observação exibida no e-mail do Nível 2 substituto (null fora da exceção). */
export function levelNoteFor(level: SlaEscalationLevel, policy: MatrixPolicy, area: SlaArea): string | null {
  const override = (policy as PolicyWithOverride).level2Override;
  if (level !== "ESCALAO_1" || !override) return null;
  return `Você recebe esta etapa como substituto temporário do Gestor (Nível 2) da área ${slaAreaLabels[area] ?? area} durante o piloto. O titular definitivo continua registrado na Matriz. Prazos da Matriz mantidos.`;
}
