// Manifesto (inventário AUTORITATIVO) do módulo "shared": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
// Sem rotas exclusivas: apenas elementos globais presentes em todas as telas (route "*").
import type { HelpManifest, HelpManifestElement } from "../types";

const ALL = "*";

// Itens do menu lateral (NAV_ITEMS em lib/ui/nav-items.ts): cada item tem o ícone (i) (FeatureInfo) AO LADO do link, também com o menu recolhido. Reaproveitam os helpIds legados.
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
  { route: ALL, kind: "button", label: "Menu lateral › Recolher / Expandir menu", helpId: "shared.global.menu-recolher" },
  { route: ALL, kind: "module", label: "Menu lateral (visão geral, itens restritos)", helpId: "shared.global.menu-lateral" },
  { route: ALL, kind: "filter", label: "Seletor de projeto (cabeçalho)", helpId: "shared.global.seletor-projeto" },
  { route: ALL, kind: "module", label: "Cabeçalho: título, número do contrato, Editar projeto, Fale com a AXIA, avatar e Sair", helpId: "shared.global.cabecalho" },
  { route: ALL, kind: "status", label: "Selo de criticidade Baixo", helpId: "shared.global.criticidade-baixo" },
  { route: ALL, kind: "status", label: "Selo de criticidade Médio", helpId: "shared.global.criticidade-medio" },
  { route: ALL, kind: "status", label: "Selo de criticidade Alto", helpId: "shared.global.criticidade-alto" },
  { route: ALL, kind: "status", label: "Selo de criticidade Crítico", helpId: "shared.global.criticidade-critico" },
  { route: ALL, kind: "status", label: "Selos de status (evento, integração, solicitação, candidato, adicional, anexo, conta de e-mail)", helpId: "shared.global.status-global" },
  { route: ALL, kind: "message", label: "Ícone de ajuda (i): como usar", helpId: "shared.global.icone-ajuda" },
];

export const SHARED_MANIFEST: HelpManifest = {
  module: "shared",
  routes: [],
  elements,
};
