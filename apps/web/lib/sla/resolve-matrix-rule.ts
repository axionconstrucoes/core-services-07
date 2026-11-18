// Resolve qual regra de matriz aplicar a uma combinação risco/área — puro,
// sem I/O. Prioridade: regra do projeto específica da área > regra do
// projeto geral (area = null) > default hardcoded (DEFAULT_SLA_MATRIX).
// Nunca inventa uma regra — os DEFAULTs são os únicos valores usados
// quando o projeto não configurou nada (seção 2: "Esses valores são
// DEFAULTS. Cada projeto deve poder alterá-los").

import { DEFAULT_SLA_MATRIX } from "./default-matrix";
import { AXION_DEFAULT_BUSINESS_HOURS_CONFIG, type SlaBusinessHoursConfig } from "./time-units";
import type { SlaArea, SlaMatrixRule, SlaProjectSettings, SlaRiskLevel } from "./types";

export interface ResolvedSlaMatrixRule {
  timeUnit: SlaMatrixRule["timeUnit"];
  assumeDeadlineValue: number;
  respondDeadlineValue: number | null;
  completeDeadlineValue: number | null;
  escalation2AfterValue: number;
  boardAfterValue: number;
  notifyByEmail: boolean;
  requiresAcknowledgmentConfirmation: boolean;
  requiresDelayJustification: boolean;
  isDefault: boolean;
  /** Id da linha escolhida (null quando veio do DEFAULT institucional). */
  ruleId?: string | null;
  /** Outras linhas ATIVAS para a mesma chave (risco+área) ignoradas pelo desempate — exigem revisão humana. */
  ignoredDuplicateRuleIds?: string[];
}

function fromRow(row: SlaMatrixRule, ignoredDuplicateRuleIds: string[] = []): ResolvedSlaMatrixRule {
  return {
    timeUnit: row.timeUnit,
    assumeDeadlineValue: row.assumeDeadlineValue,
    respondDeadlineValue: row.respondDeadlineValue,
    completeDeadlineValue: row.completeDeadlineValue,
    escalation2AfterValue: row.escalation2AfterValue,
    boardAfterValue: row.boardAfterValue,
    notifyByEmail: row.notifyByEmail,
    requiresAcknowledgmentConfirmation: row.requiresAcknowledgmentConfirmation,
    requiresDelayJustification: row.requiresDelayJustification,
    isDefault: false,
    ruleId: row.id ?? null,
    ignoredDuplicateRuleIds,
  };
}

function fromDefault(riskLevel: SlaRiskLevel): ResolvedSlaMatrixRule {
  const fallback = DEFAULT_SLA_MATRIX[riskLevel];
  return {
    timeUnit: fallback.timeUnit,
    assumeDeadlineValue: fallback.assumeDeadlineValue,
    respondDeadlineValue: fallback.respondDeadlineValue,
    completeDeadlineValue: fallback.completeDeadlineValue,
    escalation2AfterValue: fallback.escalation2AfterValue,
    boardAfterValue: fallback.boardAfterValue,
    notifyByEmail: fallback.notifyByEmail,
    requiresAcknowledgmentConfirmation: fallback.requiresAcknowledgmentConfirmation,
    requiresDelayJustification: fallback.requiresDelayJustification,
    isDefault: true,
    ruleId: null,
    ignoredDuplicateRuleIds: [],
  };
}

function createdAtMs(rule: SlaMatrixRule): number {
  const ms = rule.createdAt ? Date.parse(rule.createdAt) : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Desempate DETERMINÍSTICO entre linhas ativas da mesma chave (risco + área,
 * área null = regra geral). Não depende da ordem devolvida pelo banco.
 *
 * Critério: a linha criada PRIMEIRO (created_at asc; sem data vai para o fim),
 * depois id asc. Motivo: o índice único (project_id, risk_level, area) não
 * impede duplicatas quando area é NULL (NULLs são distintos no Postgres), e a
 * tela de configuração gravava uma linha NOVA em vez de atualizar a existente.
 * A linha mais antiga é exatamente a que o ciclo de alertas vinha aplicando em
 * produção (snapshots gravados na outbox), então o desempate preserva o
 * comportamento efetivo; as demais ficam em `ignoredDuplicateRuleIds` para
 * revisão humana — nunca são apagadas nem desativadas automaticamente.
 */
export function pickDeterministicMatrixRule(
  candidates: SlaMatrixRule[]
): { selected: SlaMatrixRule | null; ignored: SlaMatrixRule[] } {
  if (candidates.length === 0) return { selected: null, ignored: [] };
  const sorted = [...candidates].sort((a, b) => {
    const diff = createdAtMs(a) - createdAtMs(b);
    if (diff !== 0) return diff;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  return { selected: sorted[0], ignored: sorted.slice(1) };
}

export interface DuplicateMatrixRuleGroup {
  riskLevel: SlaRiskLevel;
  area: SlaArea | null;
  selectedRuleId: string;
  ignoredRuleIds: string[];
}

/** Lista as chaves (risco + área) com MAIS de uma regra ativa — para alerta de configuração e testes. */
export function findDuplicateMatrixRules(projectRules: SlaMatrixRule[]): DuplicateMatrixRuleGroup[] {
  const groups = new Map<string, SlaMatrixRule[]>();
  for (const rule of projectRules) {
    if (!rule.active) continue;
    const key = `${rule.riskLevel}|${rule.area ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  const result: DuplicateMatrixRuleGroup[] = [];
  for (const rules of groups.values()) {
    if (rules.length < 2) continue;
    const { selected, ignored } = pickDeterministicMatrixRule(rules);
    result.push({
      riskLevel: selected!.riskLevel,
      area: selected!.area ?? null,
      selectedRuleId: selected!.id,
      ignoredRuleIds: ignored.map((r) => r.id),
    });
  }
  return result;
}

/** Resolve para uma ação real (tem área definida): área-específica > geral do projeto > default. */
export function resolveMatrixRule(
  projectRules: SlaMatrixRule[],
  riskLevel: SlaRiskLevel,
  area: SlaArea
): ResolvedSlaMatrixRule {
  const activeRules = projectRules.filter((r) => r.active && r.riskLevel === riskLevel);

  const areaSpecific = pickDeterministicMatrixRule(activeRules.filter((r) => r.area === area));
  if (areaSpecific.selected) return fromRow(areaSpecific.selected, areaSpecific.ignored.map((r) => r.id));
  const generic = pickDeterministicMatrixRule(activeRules.filter((r) => r.area === null));
  if (generic.selected) return fromRow(generic.selected, generic.ignored.map((r) => r.id));
  return fromDefault(riskLevel);
}

/**
 * Resolve a regra GERAL do projeto para um risco (ignora overrides por
 * área) — usada pela tela de configuração (seção 17), cuja tabela é só
 * "RISCO → prazos", sem coluna de área.
 */
export function resolveGenericMatrixRule(projectRules: SlaMatrixRule[], riskLevel: SlaRiskLevel): ResolvedSlaMatrixRule {
  const { selected, ignored } = pickDeterministicMatrixRule(
    projectRules.filter((r) => r.active && r.riskLevel === riskLevel && r.area === null)
  );
  return selected ? fromRow(selected, ignored.map((r) => r.id)) : fromDefault(riskLevel);
}

/**
 * Resolve o timezone/expediente do projeto — configuração do projeto
 * quando existir, senão o default institucional AXION
 * (America/Sao_Paulo, 08:00–18:00). Nunca UTC como horário comercial.
 */
export function resolveBusinessHoursConfig(settings: SlaProjectSettings | null): SlaBusinessHoursConfig {
  if (!settings) {
    return AXION_DEFAULT_BUSINESS_HOURS_CONFIG;
  }
  return {
    timeZone: settings.timezone,
    businessDayStartHour: settings.businessDayStartHour,
    businessDayEndHour: settings.businessDayEndHour,
  };
}
