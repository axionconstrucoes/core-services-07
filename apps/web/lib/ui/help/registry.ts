// Registro ÚNICO do catálogo de ajuda contextual. Agrega o legado (91 entradas curtas) e os arquivos por módulo.
// Cada módulo/agente edita SOMENTE o seu arquivo em ./modules/ — nunca este registro (evita conflitos de merge).
// Ids duplicados são erro de build de teste (scripts/test-help-catalog.mjs) e, em runtime, a primeira ocorrência prevalece.

import { LEGACY_DEFINITIONS } from "./legacy";
import { ADMIN_HELP } from "./modules/admin";
import { COMERCIAL_HELP } from "./modules/comercial";
import { DASHBOARD_HELP } from "./modules/dashboard";
import { ENGENHARIA_HELP } from "./modules/engenharia";
import { EXPERTS_HELP } from "./modules/experts";
import { INTEGRACOES_HELP } from "./modules/integracoes";
import { JURIDICO_HELP } from "./modules/juridico";
import { PLANEJAMENTO_HELP } from "./modules/planejamento";
import { GARANTIAS_HELP } from "./modules/garantias";
import { PILARES_HELP } from "./modules/pilares";
import { QUALIDADE_HELP } from "./modules/qualidade";
import { SEGUROS_HELP } from "./modules/seguros";
import { SHARED_HELP } from "./modules/shared";
import { SSMA_HELP } from "./modules/ssma";
import type { FeatureHelpDefinition } from "./types";

export type { FeatureHelpDefinition, HelpEntry } from "./types";

/** Todas as entradas, na ordem de precedência (legado primeiro: ids antigos nunca são sobrescritos). */
export const ALL_HELP_ENTRIES: FeatureHelpDefinition[] = [
  ...LEGACY_DEFINITIONS,
  ...SHARED_HELP,
  ...DASHBOARD_HELP,
  ...COMERCIAL_HELP,
  ...PLANEJAMENTO_HELP,
  ...JURIDICO_HELP,
  ...SSMA_HELP,
  ...ENGENHARIA_HELP,
  ...INTEGRACOES_HELP,
  ...EXPERTS_HELP,
  ...ADMIN_HELP,
  ...QUALIDADE_HELP,
  ...GARANTIAS_HELP,
  ...SEGUROS_HELP,
  ...PILARES_HELP,
];

export const ACC_FEATURE_HELP: Record<string, FeatureHelpDefinition> = (() => {
  const map: Record<string, FeatureHelpDefinition> = {};
  for (const entry of ALL_HELP_ENTRIES) if (!(entry.id in map)) map[entry.id] = entry;
  return map;
})();

export function getFeatureHelp(helpId: string): FeatureHelpDefinition | null {
  return ACC_FEATURE_HELP[helpId] ?? null;
}
