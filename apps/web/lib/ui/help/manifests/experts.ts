// Manifesto (inventário AUTORITATIVO) do módulo "experts": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
//
// Inventário feito a partir de: app/[projectId]/experts-ia/**/page.tsx e components/ai/expert-query-panel.tsx (painel usado
// pelas páginas dos diretores e por outras telas — ESG/SSMA, Jurídico, Event Ledger e análise pré-contratual, que pertencem
// a outros manifestos e podem reutilizar os ids experts.painel.*). O Diretor de Engenharia e Construção IA mora nesta rota
// (experts-ia/diretor-engenharia); o perfil dele fica em modules/engenharia.ts e é referenciado também no manifesto "engenharia".
import type { HelpManifest, HelpManifestElement } from "../types";

const HUB = "/[projectId]/experts-ia";
const DESC = "/[projectId]/experts-ia/descricao";
const PLAN = "/[projectId]/experts-ia/diretor-planejamento";
const ENG = "/[projectId]/experts-ia/diretor-engenharia";

/** Elementos do painel de consulta (components/ai/expert-query-panel.tsx) presentes nas páginas dos diretores. */
function panelElements(route: string): HelpManifestElement[] {
  return [
    { route, kind: "message", label: "Consultas recomendadas (cartão)", helpId: "experts.painel.consultas-recomendadas" },
    { route, kind: "field", label: "Faça uma pergunta sobre este projeto", helpId: "experts.painel.pergunta" },
    { route, kind: "button", label: "Consultar", helpId: "experts.painel.consultar" },
    { route, kind: "status", label: "Provider / modelo da resposta", helpId: "experts.painel.provider" },
    { route, kind: "status", label: "Severidade e Confiança", helpId: "experts.painel.severidade-confianca" },
    { route, kind: "message", label: "Interpretação (sugestão, não fato)", helpId: "experts.painel.interpretacao" },
    { route, kind: "message", label: "Fatos documentados", helpId: "experts.painel.fatos" },
    { route, kind: "message", label: "Contexto interno declarado", helpId: "experts.painel.contexto-declarado" },
    { route, kind: "message", label: "Base contratual", helpId: "experts.painel.base-contratual" },
    { route, kind: "message", label: "Base legal", helpId: "experts.painel.base-legal" },
    { route, kind: "message", label: "Práticas negociais / classificações", helpId: "experts.painel.praticas" },
    { route, kind: "message", label: "Riscos", helpId: "experts.painel.riscos" },
    { route, kind: "message", label: "Recomendações / Ações sugeridas", helpId: "experts.painel.recomendacoes" },
    { route, kind: "message", label: "Informações faltantes", helpId: "experts.painel.informacoes-faltantes" },
    { route, kind: "message", label: "Rascunho sugerido", helpId: "experts.painel.rascunho" },
    { route, kind: "message", label: "Checagem de fidelidade (grounding) do rascunho", helpId: "experts.painel.grounding" },
    { route, kind: "message", label: "Grupos da checagem de fidelidade (Fato documentado, Interpretação, Não comprovada, Depende de definição humana)", helpId: "experts.painel.grounding-grupos" },
    { route, kind: "message", label: "Aviso de análise com conteúdo parcial", helpId: "experts.painel.aviso-conteudo-parcial" },
    {
      route,
      kind: "message",
      label: "Indicador de consulta em andamento (Consultando…)",
      exempt: "Indicador transitório de progresso; o comportamento do botão Consultar (consumo do limite e auditoria) está em experts.painel.consultar.",
    },
  ];
}

export const EXPERTS_MANIFEST: HelpManifest = {
  module: "experts",
  routes: [HUB, DESC, PLAN, ENG],
  elements: [
    // ---- Hub /[projectId]/experts-ia ----
    { route: HUB, kind: "page", label: "Experts IA", helpId: "experts.hub.pagina" },
    { route: HUB, kind: "button", label: "Descrição dos Especialistas", helpId: "experts.hub.descricao-botao" },
    { route: HUB, kind: "expert", label: "Diretor de Planejamento IA (ícone ao lado do nome)", helpId: "experts.planejamento.perfil" },
    { route: HUB, kind: "expert", label: "Consultor Jurídico IA (ícone ao lado do nome)", helpId: "experts.juridico.perfil" },
    { route: HUB, kind: "expert", label: "Diretor de ESG IA (ícone ao lado do nome)", helpId: "experts.ssma-esg.perfil" },
    { route: HUB, kind: "expert", label: "Diretor de Engenharia e Construção IA (ícone ao lado do nome)", helpId: "experts.engenharia.perfil" },
    { route: HUB, kind: "expert", label: "Diretor Comercial IA (ícone ao lado do nome)", helpId: "experts.comercial.perfil" },
    { route: HUB, kind: "expert", label: "Analista IA de Qualidade (ícone ao lado do nome)", helpId: "experts.qualidade.perfil" },
    { route: HUB, kind: "expert", label: "CEO IA (ícone ao lado do nome)", helpId: "experts.gestao-executiva.perfil" },
    { route: HUB, kind: "status", label: "Ativo / Em implantação", helpId: "experts.hub.status-expert" },
    { route: HUB, kind: "status", label: "Provider: …", helpId: "experts.hub.provider" },
    { route: HUB, kind: "table", label: "Skills selecionadas para este especialista", helpId: "experts.hub.skills" },
    { route: HUB, kind: "button", label: "Abrir Expert", helpId: "experts.hub.abrir-expert" },
    { route: HUB, kind: "message", label: "Ferramenta administrativa selecionada (nota de rodapé)", helpId: "experts.hub.nota-skills" },
    { route: HUB, kind: "message", label: "Diferença entre os especialistas e a AXIA", helpId: "experts.hub.axia-diferenca" },
    {
      route: HUB,
      kind: "message",
      label: "Operacional — consulta disponível via API / Em implantação (texto de estado no cartão)",
      exempt: "Texto informativo de estado do cartão, coberto por experts.hub.status-expert e pelo perfil do especialista (CEO IA sem painel dedicado).",
    },

    // ---- Descrição /[projectId]/experts-ia/descricao ----
    { route: DESC, kind: "page", label: "Descrição dos Especialistas", helpId: "experts.descricao.pagina" },
    { route: DESC, kind: "expert", label: "Nome de cada especialista (ícone ao lado do título do cartão)", helpId: "experts.descricao.perfil-simulado" },
    { route: DESC, kind: "status", label: "Expert implementado / Em implantação", helpId: "experts.hub.status-expert" },
    { route: DESC, kind: "table", label: "Principais competências", helpId: "experts.descricao.competencias" },
    { route: DESC, kind: "table", label: "Skills selecionadas", helpId: "experts.hub.skills" },
    { route: DESC, kind: "table", label: "Fontes autorizadas", helpId: "experts.descricao.fontes" },
    { route: DESC, kind: "table", label: "Limitações e revisão humana", helpId: "experts.descricao.limitacoes" },
    { route: DESC, kind: "expert", label: "Perfil de apoio simulado (bloco expansível com o perfil completo)", helpId: "experts.descricao.perfil-simulado" },
    { route: DESC, kind: "button", label: "Botão ESPECIALISTA dos alertas (como funciona o roteamento)", helpId: "experts.alertas.botao-especialista" },
    { route: DESC, kind: "message", label: "AXIA × especialistas", helpId: "experts.hub.axia-diferenca" },
    {
      route: DESC,
      kind: "button",
      label: "Voltar aos especialistas",
      exempt: "Link de navegação simples para o hub; sem ação, dado ou consequência a explicar além do rótulo.",
    },

    // ---- Diretor de Planejamento IA ----
    { route: PLAN, kind: "page", label: "Diretor de Planejamento IA", helpId: "experts.planejamento.pagina" },
    { route: PLAN, kind: "expert", label: "Perfil do Diretor de Planejamento IA (ícone ao lado do título)", helpId: "experts.planejamento.perfil" },
    ...panelElements(PLAN),

    // ---- Diretor de Engenharia e Construção IA ----
    { route: ENG, kind: "page", label: "Diretor de Engenharia e Construção IA", helpId: "experts.engenharia.pagina" },
    { route: ENG, kind: "expert", label: "Perfil do Diretor de Engenharia e Construção IA (ícone ao lado do título)", helpId: "experts.engenharia.perfil" },
    ...panelElements(ENG),
  ],
};
