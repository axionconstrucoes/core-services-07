// Manifesto (inventário AUTORITATIVO) do módulo "pilares". Arquivo EXCLUSIVO do agente deste módulo. Ver lib/ui/help/types.ts (HelpManifest).
import type { HelpElementKind, HelpManifest, HelpManifestElement } from "../types";

const ROUTE = "/[projectId]/pilares";
const ALERTA = "/[projectId]/alertas/[caseId]";
const P = "pilares.";

const doc = (kind: HelpElementKind, label: string, id: string, route = ROUTE): HelpManifestElement => ({ route, kind, label, helpId: `${P}${id}` });
const exempt = (kind: HelpElementKind, label: string, why: string): HelpManifestElement => ({ route: ROUTE, kind, label, exempt: why });

export const PILARES_MANIFEST: HelpManifest = {
  module: "pilares",
  routes: [ROUTE],
  elements: [
    doc("module", "Menu lateral › Quatro Pilares", "menu.item"),
    doc("page", "Quatro Pilares", "pagina.pagina"),
    doc("kpi", "Criticidade (pior pilar domina)", "pagina.criticidade-geral"),
    doc("status", "Severidade por pilar (Prazo, Custo, Segurança, Qualidade)", "pagina.severidade-pilar"),
    doc("status", "Painel PRAZO", "pagina.painel-prazo"),
    doc("status", "Painel CUSTO", "pagina.painel-custo"),
    doc("status", "Painel SEGURANÇA", "pagina.painel-seguranca"),
    doc("status", "Painel QUALIDADE", "pagina.painel-qualidade"),
    doc("status", "Painel JURÍDICO / SEGUROS", "pagina.painel-juridico-seguros"),

    // PRAZO
    doc("kpi", "Término contratual (baseline)", "prazo.kpi-termino-baseline"),
    doc("kpi", "Prorrogação solicitada", "prazo.kpi-extensao-solicitada"),
    doc("kpi", "Avanço físico", "prazo.kpi-avanco-fisico"),
    doc("kpi", "Atividades atrasadas (MPP)", "prazo.kpi-atividades-atrasadas"),
    doc("kpi", "Maior desvio de término vs baseline", "prazo.kpi-desvio-maximo"),
    doc("kpi", "Ações SLA vencidas", "prazo.kpi-acoes-sla-vencidas"),
    doc("kpi", "Consequências de PRAZO abertas (RNC/garantia)", "prazo.kpi-impacto-retrabalho"),
    // CUSTO
    doc("kpi", "Retrabalho — realizado", "custo.kpi-retrabalho"),
    doc("kpi", "Custos de não qualidade — realizado", "custo.kpi-nao-qualidade-realizado"),
    doc("kpi", "Custos de não qualidade — estimado", "custo.kpi-nao-qualidade-estimado"),
    doc("kpi", "Garantias — custo realizado", "custo.kpi-garantia-realizado"),
    doc("kpi", "Garantias — custo estimado", "custo.kpi-garantia-estimado"),
    doc("kpi", "Exposição — valor reclamado em sinistros em andamento", "custo.kpi-exposicao"),
    doc("kpi", "Consequências de CUSTO abertas", "custo.kpi-consequencias-custo"),
    // SEGURANÇA
    doc("kpi", "Ocorrências de segurança", "seguranca.kpi-ocorrencias"),
    doc("kpi", "Acidentes com afastamento", "seguranca.kpi-acidentes-afastamento"),
    doc("kpi", "Registros críticos de SSMA em aberto", "seguranca.kpi-riscos-criticos"),
    doc("kpi", "Alertas de risco abertos CRÍTICOS (todas as áreas)", "seguranca.kpi-alertas-criticos"),
    doc("kpi", "Ações corretivas SSMA pendentes", "seguranca.kpi-acoes-pendentes"),
    doc("kpi", "Consequências de SEGURANÇA abertas (RNC/garantia)", "seguranca.kpi-consequencias-seguranca"),
    // QUALIDADE
    doc("kpi", "RNC abertas", "qualidade.kpi-rnc-abertas"),
    doc("kpi", "RNC críticas abertas", "qualidade.kpi-rnc-criticas"),
    doc("kpi", "Reaberturas de RNC (total)", "qualidade.kpi-reaberturas"),
    doc("kpi", "Reclamações de clientes em aberto", "qualidade.kpi-reclamacoes"),
    doc("kpi", "Recorrências registradas", "qualidade.kpi-recorrencias"),
    doc("kpi", "Inspeções não conformes ou parciais", "qualidade.kpi-inspecoes"),
    doc("kpi", "Reparos reincidentes", "qualidade.kpi-reparos"),
    doc("kpi", "Garantias pendentes (casos abertos)", "qualidade.kpi-garantias-pendentes"),
    doc("kpi", "Ações corretivas/preventivas vencidas", "qualidade.kpi-acoes-vencidas"),
    // JURÍDICO / SEGUROS
    doc("kpi", "Apólices/garantias vencidas", "juridico.kpi-vencidos"),
    doc("kpi", "Vencem em até 30 dias", "juridico.kpi-a-vencer"),
    doc("kpi", "Endossos pendentes (sem efeito de cobertura)", "juridico.kpi-endossos"),
    doc("kpi", "Garantias insuficientes (adiantamento)", "juridico.kpi-garantia-insuficiente"),
    doc("kpi", "Sinistros em andamento", "juridico.kpi-sinistros"),
    doc("kpi", "Expectativas de sinistro (sem aviso)", "juridico.kpi-expectativas"),
    doc("kpi", "Reclamações à seguradora/banco", "juridico.kpi-reclamacoes"),
    doc("kpi", "Sinistros em estágio de indenização/cumprimento", "juridico.kpi-indenizacoes"),

    // Tabela de consequências
    doc("table", "Consequências abertas ALTO/CRÍTICO, com a fonte", "consequencias.tabela"),
    doc("status", "Coluna Severidade", "consequencias.col-severidade"),
    doc("table", "Coluna Fonte", "consequencias.col-fonte"),
    exempt("table", "Colunas Pilar, Origem e Descrição", "Colunas descritas na entrada da tabela (pilares.consequencias.tabela); Origem é link de navegação para a RNC/garantia."),
    exempt("button", "Link 'Ver origem' dos cartões", "Link de navegação para a tela do módulo que registra o dado; a origem de cada indicador está na fonte do próprio cartão e na sua entrada de ajuda."),

    // Tela do alerta (rota do módulo planejamento; elementos novos deste módulo)
    doc("message", "Aviso: RESOLVIDO não encerra a RNC/garantia/sinistro vinculada", "alerta.aviso-vinculo", ALERTA),
    doc("message", "Prazo de assunção × prazo de conclusão de reparos", "alerta.prazos-distintos", ALERTA),
    doc("status", "Origem do vínculo (registrado × texto da origem)", "alerta.origem-vinculo", ALERTA),
    { route: ALERTA, kind: "button", label: "Link 'Abrir RNC/garantia/sinistro' do aviso", exempt: "Link de navegação do aviso (pilares.alerta.aviso-vinculo) para a tela do módulo que trata o item vinculado." },
  ],
};
