// Manifesto (inventário AUTORITATIVO) do módulo "engenharia": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
//
// O ACC não possui tela própria de engenharia (routes: []). A análise de engenharia é feita pelo Diretor de Engenharia e
// Construção IA, na rota /[projectId]/experts-ia/diretor-engenharia, que é inventariada no manifesto "experts".
import type { HelpManifest } from "../types";

export const ENGENHARIA_MANIFEST: HelpManifest = {
  module: "engenharia",
  routes: [],
  elements: [
    {
      route: "/[projectId]/experts-ia/diretor-engenharia",
      kind: "expert",
      label: "Diretor de Engenharia e Construção IA (perfil simulado, ícone ao lado do título)",
      helpId: "experts.engenharia.perfil",
    },
    {
      route: "/[projectId]/experts-ia/diretor-engenharia",
      kind: "page",
      label: "Telas de engenharia do ACC",
      exempt:
        "O ACC não tem tela de engenharia própria: a rota do Diretor de Engenharia e Construção IA pertence ao manifesto experts (experts.engenharia.pagina) e as análises de engenharia por evento ou alerta usam o painel documentado em experts.painel.*.",
    },
  ],
};
