// Manifesto (inventário AUTORITATIVO) do módulo "qualidade". Arquivo EXCLUSIVO do agente deste módulo. Ver lib/ui/help/types.ts (HelpManifest).
// Cada elemento funcional do catálogo (modules/qualidade.ts) é inventariado com a rota, a aba e o rótulo; a lista é montada aqui a partir dos ids
// (tela = 2º segmento do id) e do conjunto abaixo, que diz quais ids são renderizados só no detalhe da RNC. Elementos sem helpId próprio entram como `exempt` com motivo.
import type { HelpManifest, HelpManifestElement } from "../types";
import { QUALIDADE_HELP } from "../modules/qualidade";

const MAIN = "/[projectId]/qualidade";
const DETAIL = "/[projectId]/qualidade/rnc/[ncrId]";

const TAB_BY_SEGMENT: Record<string, string> = {
  dashboard: "Dashboard",
  rnc: "RNC",
  evidencias: "Evidências",
  inspecoes: "Inspeções",
  reclamacoes: "Reclamações",
  ensaios: "Ensaios e laudos",
  requisitos: "Requisitos",
  capa: "Ações (CAPA)",
  eficacia: "Eficácia",
  recorrencias: "Recorrências",
  custos: "Custos de não qualidade",
  auditoria: "Auditoria",
};

// Renderizados somente no detalhe da RNC (/qualidade/rnc/[ncrId]).
const DETAIL_ONLY = new Set<string>([
  "qualidade.rnc.pagina-detalhe", "qualidade.rnc.resumo", "qualidade.rnc.estado-atual", "qualidade.rnc.criticidade", "qualidade.rnc.transicoes",
  "qualidade.rnc.botao-transicao", "qualidade.rnc.campo-justificativa", "qualidade.rnc.campo-duplicada-de", "qualidade.rnc.campo-evidencias-transicao",
  "qualidade.rnc.conflito-versao", "qualidade.rnc.form-dados", "qualidade.rnc.campo-justificativa-dados", "qualidade.rnc.campo-causa-raiz", "qualidade.rnc.campo-prazo", "qualidade.rnc.consequencias",
  "qualidade.rnc.form-consequencia", "qualidade.rnc.campo-pilar", "qualidade.rnc.campo-severidade", "qualidade.rnc.campo-probabilidade",
  "qualidade.rnc.campo-fundamento", "qualidade.rnc.campo-medidas", "qualidade.rnc.col-pilar", "qualidade.rnc.col-severidade", "qualidade.rnc.col-probabilidade",
  "qualidade.rnc.col-fonte-consequencia", "qualidade.rnc.col-status-consequencia", "qualidade.rnc.linha-do-tempo",
  "qualidade.evidencias.secao-rnc", "qualidade.evidencias.form-criar", "qualidade.evidencias.campo-tipo-fonte", "qualidade.evidencias.campo-capturada",
  "qualidade.evidencias.campo-classificacao", "qualidade.evidencias.campo-epistemico", "qualidade.evidencias.col-reclassificar",
  "qualidade.capa.secao-rnc", "qualidade.capa.form-criar", "qualidade.capa.campo-tipo", "qualidade.capa.campo-prazo", "qualidade.capa.campo-descricao", "qualidade.capa.col-atualizar",
  "qualidade.eficacia.secao-rnc", "qualidade.eficacia.form-criar", "qualidade.eficacia.campo-resultado", "qualidade.eficacia.campo-evidencia", "qualidade.eficacia.campo-criterio",
  "qualidade.custos.secao-rnc", "qualidade.custos.form-criar", "qualidade.custos.campo-categoria", "qualidade.custos.campo-fonte", "qualidade.custos.campo-estimado", "qualidade.custos.campo-real",
  "qualidade.recorrencias.secao-rnc", "qualidade.recorrencias.form-criar", "qualidade.recorrencias.campo-relacionada", "qualidade.recorrencias.campo-fundamento",
]);

const fromCatalog: HelpManifestElement[] = QUALIDADE_HELP.map((e): HelpManifestElement => {
  const segment = e.id.split(".")[1];
  const kind = e.kind ?? "message";
  if (e.id === "qualidade.menu.item") return { route: "*", kind: "module", label: "Menu lateral › Qualidade", helpId: e.id };
  if (e.id.startsWith("qualidade.abas.")) return { route: MAIN, kind: "tab", label: e.title.replace(/^Aba /, ""), helpId: e.id };
  const detail = DETAIL_ONLY.has(e.id);
  const kindPage = kind === "page";
  return {
    route: detail ? DETAIL : MAIN,
    ...(detail || kindPage || segment === "pagina" || segment === "campo" ? {} : { tab: TAB_BY_SEGMENT[segment] }),
    kind,
    label: e.title,
    helpId: e.id,
  };
});

const exempt = (route: string, kind: HelpManifestElement["kind"], label: string, why: string): HelpManifestElement => ({ route, kind, label, exempt: why });

export const QUALIDADE_MANIFEST: HelpManifest = {
  module: "qualidade",
  routes: [MAIN, DETAIL],
  elements: [
    ...fromCatalog,
    exempt(MAIN, "button", "Link de código da RNC / link de estado do dashboard", "Navegação para o detalhe ou para a lista filtrada; o destino é descrito na própria tela (qualidade.rnc.pagina-detalhe, qualidade.dashboard.por-estado)."),
    exempt(MAIN, "button", "Link abrir fonte", "Abre o original (documento, e-mail, foto, diário ou relatório); o significado está em qualidade.campo.fonte-ref e na coluna de fonte."),
    exempt(MAIN, "button", "Limpar filtros", "Navegação que remove os filtros da URL; sem efeito sobre dados e descrita em qualidade.rnc.filtro-aplicar."),
    exempt(MAIN, "button", "Botões de envio dos formulários (Registrar …)", "Cada formulário tem o ícone (i) do próprio título descrevendo a ação de envio (qualidade.*.form-criar)."),
    exempt(DETAIL, "button", "Voltar para a lista de RNC", "Navegação de retorno autoexplicativa, sem efeito sobre dados."),
    exempt(DETAIL, "button", "Salvar / Atualizar (reclassificar evidência, status da ação)", "Botões inline descritos pelos cabeçalhos das colunas Reclassificar e Atualizar status (qualidade.evidencias.col-reclassificar, qualidade.capa.col-atualizar)."),
  ],
};
