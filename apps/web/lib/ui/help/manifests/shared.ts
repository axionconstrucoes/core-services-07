// Manifesto (inventário AUTORITATIVO) do módulo "shared": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
// Sem rotas exclusivas: apenas elementos globais presentes em todas as telas (route "*").
import type { HelpManifest, HelpManifestElement } from "../types";

const ALL = "*";

// Itens do menu lateral (NAV_ITEMS em lib/ui/nav-items.ts): o resumo aparece como dica nativa (title) no próprio item, porque a sidebar não
// renderiza o ícone (i) (test-feature-info trava isso). Reaproveitam os helpIds legados.
const NAV_HELP: Array<[string, string]> = [
  ["Dashboard", "dashboard"],
  ["Timeline", "timeline"],
  ["Eventos (somente administrador)", "event-ledger"],
  ["Solicitações", "solicitacoes"],
  ["Ações e Escalonamentos", "acoes-escalonamentos"],
  ["Jurídico", "juridico"],
  ["Documentos", "documentos"],
  ["Providências", "providencias"],
  ["Financeiro (somente com acesso financeiro)", "financeiro"],
  ["ESG/SSMA", "esg-ssma"],
  ["Experts IA", "experts-ia"],
  ["Integrações (somente administrador)", "integracoes"],
  ["Usuários (somente administrador)", "usuarios"],
  ["Autorizações (somente administrador)", "autorizacoes-email"],
  ["Reemissão de alertas (somente administrador)", "reemissao-alertas"],
  ["Auditoria", "auditoria"],
  ["Ajuda e tutorial", "ajuda-tutorial"],
  ["Start-up ACC (somente administrador)", "startup-acc"],
];

const elements: HelpManifestElement[] = [
  ...NAV_HELP.map(([label, helpId]): HelpManifestElement => ({ route: ALL, kind: "module", label: `Menu lateral › ${label}`, helpId })),
  {
    route: ALL,
    kind: "button",
    label: "Menu lateral › Recolher / Expandir menu",
    gap: "Botão da sidebar sem texto próprio: a sidebar não pode renderizar o ícone (i) (travado por test-feature-info) e o botão já tem rótulo e title. Texto de uso pronto em shared.global.menu-lateral; providência: o orquestrador decidir como exibi-lo (por exemplo no tutorial Ajuda).",
  },
  {
    route: ALL,
    kind: "module",
    label: "Menu lateral (visão geral, itens restritos)",
    gap: "Entrada shared.global.menu-lateral pronta no catálogo, sem ponto de renderização: a sidebar não renderiza o ícone (i). Providência: expor o texto na tela Ajuda e tutorial.",
  },
  { route: ALL, kind: "filter", label: "Seletor de projeto (cabeçalho)", helpId: "shared.global.seletor-projeto" },
  {
    route: ALL,
    kind: "module",
    label: "Cabeçalho: título, número do contrato, Editar projeto, Fale com a AXIA, avatar e Sair",
    gap: "Entrada shared.global.cabecalho pronta no catálogo; falta inserir <FeatureInfo helpId=\"shared.global.cabecalho\" /> em components/layout/top-bar.tsx, arquivo compartilhado fora do escopo de edição deste agente. Providência: orquestrador aplicar ao integrar.",
  },
  { route: ALL, kind: "status", label: "Selo de criticidade Baixo", helpId: "shared.global.criticidade-baixo" },
  { route: ALL, kind: "status", label: "Selo de criticidade Médio", helpId: "shared.global.criticidade-medio" },
  { route: ALL, kind: "status", label: "Selo de criticidade Alto", helpId: "shared.global.criticidade-alto" },
  { route: ALL, kind: "status", label: "Selo de criticidade Crítico", helpId: "shared.global.criticidade-critico" },
  {
    route: ALL,
    kind: "status",
    label: "Selos de status (evento, integração, solicitação, candidato, adicional, anexo, conta de e-mail)",
    gap: "Entrada shared.global.status-global pronta; o selo aparece em tabelas densas de vários módulos e não há ponto único de renderização. Providência: cada módulo usar <FeatureInfo helpId=\"shared.global.status-global\" /> ao lado do cabeçalho da coluna Status.",
  },
  {
    route: ALL,
    kind: "message",
    label: "Ícone de ajuda (i): como usar",
    gap: "Entrada shared.global.icone-ajuda pronta; o ícone é o próprio componente HelpHint (components/shared/help-hint.tsx, fundação) e não há tela dedicada. Providência: exibir o texto no tutorial (Ajuda e tutorial) ou no rodapé do painel do HelpHint.",
  },
];

export const SHARED_MANIFEST: HelpManifest = {
  module: "shared",
  routes: [],
  elements,
};
