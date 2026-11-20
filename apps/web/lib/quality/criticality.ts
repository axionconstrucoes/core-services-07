// Criticidade da Qualidade nos 4 pilares (PRAZO, CUSTO, SEGURANCA, QUALIDADE).
// REGRA: o PIOR pilar domina — nunca média. Consequência catastrófica (ex.: estrutura/pessoas) prevalece mesmo
// com prazo/custo baixos. Sem consequência registrada = SEM_DADOS (nunca "baixo" por omissão).
// Probabilidade é opcional e só vale com fundamento; NUNCA reduz a severidade (não há "risco = sev x prob").

import { PILLARS, type ConsequenceInput, type Criticality, type Pillar, type Severity } from "./types";

const RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const FROM_RANK: Record<number, Severity> = { 1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL" };

export interface CriticalityResult {
  criticality: Criticality;
  /** pilares que sustentam a criticidade (todos os que empatam no pior nível). */
  dominantPillars: Pillar[];
  /** pior severidade por pilar; null = SEM DADOS no pilar. */
  byPillar: Record<Pillar, Severity | null>;
  /** pilares sem consequência registrada (explicita a lacuna). */
  pillarsWithoutData: Pillar[];
  /** alertas de qualidade dos dados (probabilidade sem fundamento, consequência sem fonte). */
  warnings: string[];
}

export function severityRank(s: Severity): number {
  return RANK[s];
}

export function computeCriticality(consequences: readonly ConsequenceInput[]): CriticalityResult {
  const byPillar = Object.fromEntries(PILLARS.map((p) => [p, null])) as Record<Pillar, Severity | null>;
  const warnings: string[] = [];
  for (const c of consequences) {
    const cur = byPillar[c.pillar];
    if (cur === null || RANK[c.severity] > RANK[cur]) byPillar[c.pillar] = c.severity;
    if (c.probability && !(c.probabilityBasis && c.probabilityBasis.trim().length >= 5)) {
      warnings.push(`PROBABILITY_WITHOUT_BASIS:${c.pillar}`);
    }
    if (!c.sourceRef || !c.sourceRef.trim()) warnings.push(`CONSEQUENCE_WITHOUT_SOURCE:${c.pillar}`);
  }
  const ranks = PILLARS.map((p) => (byPillar[p] ? RANK[byPillar[p] as Severity] : 0));
  const worst = Math.max(0, ...ranks);
  const pillarsWithoutData = PILLARS.filter((p) => byPillar[p] === null);
  if (worst === 0) {
    return { criticality: "SEM_DADOS", dominantPillars: [], byPillar, pillarsWithoutData, warnings };
  }
  return {
    criticality: FROM_RANK[worst],
    dominantPillars: PILLARS.filter((p) => byPillar[p] && RANK[byPillar[p] as Severity] === worst),
    byPillar,
    pillarsWithoutData,
    warnings,
  };
}

/** Mapeia a criticidade da Qualidade para o nível de risco/SLA já aprovado (CRITICO/ALTO/MEDIO/BAIXO). */
export function criticalityToRiskLevel(c: Criticality): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null {
  return c === "SEM_DADOS" ? null : c;
}
