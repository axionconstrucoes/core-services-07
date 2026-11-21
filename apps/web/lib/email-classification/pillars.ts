// Fase 6 / H2b — PILARES e ÁREAS FUNCIONAIS. Puro. Espelha as funções SQL email_signal_functional_area_for / email_signal_impact_pillar_for
// (migration 20261209100000); o teste test-f6-h2b-sinais-pilares.mjs prova que os dois lados concordam.
// Decisão do responsável: pilares são SOMENTE PRAZO, CUSTO, SEGURANCA e QUALIDADE. Jurídico e Comercial são ÁREAS funcionais.
import type { FunctionalArea, Pillar } from "./types";

export const PILLARS: readonly Pillar[] = ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"];
export const FUNCTIONAL_AREAS: readonly FunctionalArea[] = ["JURIDICO", "COMERCIAL"];

/** Tipos de sinal cuja natureza é jurídica (área JURIDICO), qualquer que seja o pilar de impacto. */
export const LEGAL_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  "DESCUMPRIMENTO_INDICIO",
  "PLEITO",
  "CONFLITO_RESPONSABILIDADE",
  "RECLAMACAO_FORMAL",
  "NOTIFICACAO_OFICIAL",
  "ORDEM_FORA_DE_DELEGACAO",
  "ALTERACAO_CONTRATUAL_SEM_FORMALIZACAO",
  "DEPENDE_APROVACAO_CLIENTE",
]);

/** Pilar de IMPACTO de um sinal jurídico, quando o tipo tem impacto óbvio (PLEITO => CUSTO); senão nulo. */
export function impactPillarFor(kind: string): Pillar | null {
  return kind === "PLEITO" ? "CUSTO" : null;
}

/** Área funcional: tipos jurídicos => JURIDICO; pilar CUSTO => COMERCIAL; demais => nulo. */
export function functionalAreaFor(kind: string, pillar: string | null): FunctionalArea | null {
  if (LEGAL_SIGNAL_KINDS.has(kind) || pillar === "JURIDICO") return "JURIDICO";
  if (pillar === "CUSTO") return "COMERCIAL";
  return null;
}

/** Eixos finais de um sinal (pilar + área funcional) a partir do pilar "de origem" da regra (que pode ainda ser o legado JURIDICO). */
export function signalAxes(kind: string, rulePillar: string | null): { pillar: Pillar | null; functional_area: FunctionalArea | null } {
  const legacyLegal = rulePillar === "JURIDICO";
  const pillar = legacyLegal ? impactPillarFor(kind) : ((rulePillar as Pillar | null) ?? impactPillarFor(kind));
  return { pillar, functional_area: functionalAreaFor(kind, legacyLegal ? "JURIDICO" : pillar) };
}

/** Contrato LEGADO lido pelo coletor de alertas (Frente D): área jurídica volta como 'JURIDICO'. */
export function legacyPillarOf(row: { pillar: string | null; functional_area: string | null }): string | null {
  return row.functional_area === "JURIDICO" ? "JURIDICO" : (row.pillar ?? row.functional_area);
}
