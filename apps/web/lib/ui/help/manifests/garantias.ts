// Manifesto (inventário AUTORITATIVO) do módulo "garantias". Arquivo EXCLUSIVO do agente deste módulo. Ver lib/ui/help/types.ts (HelpManifest).
// Cada elemento funcional das duas rotas aponta para o helpId do catálogo (modules/garantias.ts), que é renderizado por <FeatureInfo>
// em components/garantias/*. O rótulo e a aba vêm do título/prefixo da entrada; nada é isentado.
import type { HelpManifest, HelpManifestElement } from "../types";
import { GARANTIAS_HELP } from "../modules/garantias";

const LIST = "/[projectId]/garantias";
const DETAIL = "/[projectId]/garantias/[caseId]";

// aba da tela de detalhe por prefixo do id
const DETAIL_TABS: Array<[RegExp, string]> = [
  [/^garantias\.detalhe\.(estado-atual|versao|prontidao|transic|bloqueios|linha-do-tempo|conflito)/, "Ciclo de estados"],
  [/^garantias\.detalhe\.manutencao/, "Manutenção"],
  [/^garantias\.detalhe\.vistoria/, "Vistorias"],
  [/^garantias\.detalhe\.reparo/, "Reparos e reincidências"],
  [/^garantias\.detalhe\.(evidencia|reclamacoes)/, "Evidências e fotos"],
  [/^garantias\.detalhe\.(verificacao|aceite)/, "Verificação e aceite"],
  [/^garantias\.detalhe\.(kpi|consequencias|custos)/, "Custos e consequências"],
  [/^garantias\.detalhe\.(criticidade|reaberturas|origem|salvar)/, "Resumo"],
];

const LIST_TABS: Array<[RegExp, string]> = [
  [/^garantias\.cobertura\./, "Consulta de cobertura"],
  [/^garantias\.referencias\./, "Referências"],
  [/^garantias\.(casos|caso)\./, "Casos"],
];

const elements: HelpManifestElement[] = GARANTIAS_HELP.map((entry): HelpManifestElement => {
  const isDetail = entry.id.startsWith("garantias.detalhe.");
  const route = isDetail ? DETAIL : LIST;
  const rules = isDetail ? DETAIL_TABS : LIST_TABS;
  const tab = entry.kind === "page" || entry.kind === "module" || entry.kind === "tab" ? undefined : rules.find(([re]) => re.test(entry.id))?.[1];
  const label = entry.id === "garantias.menu.garantias" ? "Menu lateral › Garantias" : entry.title;
  return { route, kind: entry.kind ?? "field", label, helpId: entry.id, ...(tab ? { tab } : {}) };
});

export const GARANTIAS_MANIFEST: HelpManifest = {
  module: "garantias",
  routes: [LIST, DETAIL],
  elements,
};
