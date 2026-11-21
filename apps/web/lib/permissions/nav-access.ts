// Regra PURA de visibilidade do menu e de acesso às rotas por nível (tier) do usuário no projeto. Dado puro, sem "server-only",
// para ser testado em Node e comparado com o banco (scripts/test-menu-permissoes.mjs / -realpg.mjs).
//
// Fonte de verdade do nível: public.acc_project_tier(projeto) (matriz central, docs/permissoes-matriz-central.md). O menu NUNCA é a
// barreira: a rota (layout do segmento), o loader, as actions e a RLS aplicam a mesma regra; o menu só deixa de mostrar o que o
// usuário não pode abrir. Fail-closed: nível desconhecido/ausente = NONE = nenhum item restrito por nível.
import { PROJECT_TIER_RANK, tierAtLeast, type ProjectTier } from "./project-tier";

export type MinTier = Exclude<ProjectTier, "NONE">;

/**
 * Nível MÍNIMO por segmento de rota (href do NAV_ITEMS). Espelha o nível de LEITURA de cada módulo no banco:
 *   qualidade / garantias -> quality_can_read  = tier >= READ
 *   seguros               -> insurance_access(.., 'READ') = tier >= READ
 *   pilares               -> consolida Qualidade/Garantias/Seguros (leitura) = tier >= READ
 * Todos exigem membership ATIVA (tier NONE = inativo, convite pendente, outro projeto, sem login). Acrescentar um segmento aqui
 * o torna restrito por nível no menu E na rota (layout do segmento chama requireProjectTier).
 */
export const TIER_GATED_SEGMENTS: Readonly<Record<string, MinTier>> = {
  qualidade: "READ",
  garantias: "READ",
  seguros: "READ",
  pilares: "READ",
};

export function normalizeTier(value: unknown): ProjectTier {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROJECT_TIER_RANK, value) ? (value as ProjectTier) : "NONE";
}

/** O usuário (com este nível) pode abrir o segmento? Segmento sem regra de nível => true (outras regras, como `restrictedTo`, seguem valendo). */
export function canAccessSegment(segment: string, tier: unknown): boolean {
  const min = TIER_GATED_SEGMENTS[segment];
  if (!min) return true;
  return tierAtLeast(normalizeTier(tier), min);
}

/** hrefs do menu que devem ficar ocultos para este nível (fail-closed). */
export function hiddenSegmentsForTier(tier: unknown): string[] {
  return Object.keys(TIER_GATED_SEGMENTS).filter((segment) => !canAccessSegment(segment, tier));
}
