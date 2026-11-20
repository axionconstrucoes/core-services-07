// Manifesto (inventário AUTORITATIVO) do módulo "dashboard": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
import type { HelpElementKind, HelpManifest, HelpManifestElement } from "../types";

const EXEC = "/[projectId]/dashboard";
const VISUAL = "/[projectId]/dashboard/visual";
const P = "dashboard.executivo.";

const doc = (kind: HelpElementKind, label: string, id: string, tab?: string): HelpManifestElement => ({
  route: EXEC,
  ...(tab ? { tab } : {}),
  kind,
  label,
  helpId: `${P}${id}`,
});
const exempt = (kind: HelpElementKind, label: string, why: string): HelpManifestElement => ({ route: EXEC, kind, label, exempt: why });

export const DASHBOARD_MANIFEST: HelpManifest = {
  module: "dashboard",
  routes: [EXEC, VISUAL],
  elements: [
    // ---- Dashboard Executivo: cabeçalho ----
    doc("page", "Dashboard Executivo", "pagina"),
    doc("status", "Selo de integrações (INTEGRAÇÕES ATIVAS / PARCIAIS / FALHA)", "status-integracoes"),
    exempt("message", "Atualização operacional — Dados persistidos no ACC", "Texto fixo sem cálculo; o significado está documentado em 'Atualização automática' (dashboard.executivo.atualizacao-automatica) e na página."),
    exempt("message", "Nome e código da obra ativa", "Identificação da obra (texto do cadastro do projeto); sem cálculo nem ação."),

    // ---- KPIs do topo ----
    doc("kpi", "Alertas de risco", "kpi-alertas-risco"),
    doc("kpi", "Eventos Ledger", "kpi-eventos-ledger"),
    doc("kpi", "Risco atual", "kpi-risco-atual"),
    doc("kpi", "Integrações", "kpi-integracoes"),
    doc("kpi", "Aditivos", "kpi-aditivos"),
    doc("kpi", "Avanço físico", "kpi-avanco-fisico"),

    // ---- Coluna 1: Situação contratual ----
    doc("kpi", "Alertas de risco abertos", "kpi-alertas-risco"),
    doc("kpi", "Alto/crítico sem ação SLA", "linha-alto-critico-sem-sla"),
    doc("kpi", "Achados de IA ativos", "linha-achados-ia"),
    doc("kpi", "Ações abertas (SLA)", "linha-acoes-abertas-sla"),
    doc("kpi", "Ações vencidas", "linha-acoes-vencidas"),
    doc("kpi", "Ações escalonadas (abertas)", "linha-acoes-escalonadas"),
    doc("kpi", "Registros de escalonamento", "linha-registros-escalonamento"),
    doc("kpi", "Divergências caso × ação", "linha-divergencias-caso-acao"),
    doc("kpi", "Início da obra", "data-inicio-obra"),
    doc("kpi", "Término da baseline", "data-termino-baseline"),
    doc("kpi", "Início operacional ACC", "data-inicio-operacional-acc"),
    exempt("message", "Notas explicativas (SubNote) sob as linhas de SLA/escalonamento", "Texto de evidência da própria contagem (status, níveis, códigos); documentado na entrada de cada indicador."),
    doc("chart", "Distribuição dos alertas de risco abertos (Baixo/Médio/Alto/Crítico)", "distribuicao-alertas"),

    // ---- Coluna 2: Financeiro resumido e SSMA/ESG ----
    doc("kpi", "Contrato + aditivos (R$ mil)", "fin-contrato-aditivos"),
    doc("kpi", "Aditivos (R$ mil)", "fin-aditivos"),
    doc("kpi", "Realizado total", "fin-realizado-total"),
    doc("kpi", "Saldo", "fin-saldo"),
    doc("kpi", "Acidentes com afastamento", "ssma-acidentes-com-afastamento"),
    doc("kpi", "Acidentes sem afastamento", "ssma-acidentes-sem-afastamento"),
    doc("kpi", "Ocorrências de segurança", "ssma-ocorrencias"),
    doc("kpi", "Near Misses (quase-acidentes)", "ssma-near-misses"),
    exempt("button", "Link 'Ver registros' (near misses)", "Link de navegação para a lista de quase-acidentes em SSMA; o critério da lista é o mesmo do indicador, documentado em dashboard.executivo.ssma-near-misses."),
    doc("kpi", "Dias sem acidente", "ssma-dias-sem-acidente"),
    doc("kpi", "Ações corretivas em aberto", "ssma-acoes-corretivas-abertas"),
    doc("kpi", "Ações corretivas em atraso", "ssma-acoes-corretivas-atraso"),
    doc("kpi", "Obrigações ESG (Cumpridas, Pendentes, Vencidas, Ag. revisão, Evid. pend.)", "esg-obrigacoes"),

    // ---- Coluna 3: Avanços ----
    doc("kpi", "Avanço físico atual", "kpi-avanco-fisico"),
    exempt("chart", "Anel de progresso 'Realizado' (físico e financeiro)", "Representação gráfica do mesmo percentual das linhas 'Avanço físico atual' e 'Avanço financeiro' (documentadas); o anel vazio significa sem dado."),
    doc("kpi", "Avanço financeiro", "avanco-financeiro"),
    doc("kpi", "Faturamento AXION", "faturamento-axion"),
    doc("kpi", "Faturamento Direto WEG", "faturamento-direto"),
    doc("kpi", "Base contratual", "fin-contrato-aditivos"),

    // ---- Coluna 4: Integrações e relatório semanal ----
    doc("table", "Status das integrações", "integracoes-status"),
    doc("status", "E-mail — etapas comprovadas", "integracoes-email-etapas"),
    doc("table", "Relatório semanal — abas extraídas (Curva S, Linha de base, Financeiro, SSMA)", "relatorio-semanal-abas"),
    doc("message", "Atualização automática", "atualizacao-automatica"),

    // ---- Coluna 5: Planejamento — recebimento por e-mail ----
    doc("status", "Cronograma atualizado (semana)", "plan-cronograma-atualizado"),
    doc("status", "Arquivo de cronograma (MPP)", "plan-mpp"),
    doc("status", "Baseline oficial do cronograma", "plan-baseline"),
    doc("status", "Relatório semanal (Excel)", "plan-relatorio-semanal"),
    exempt("button", "Detalhes do cronograma / Detalhes do relatório semanal (expansores)", "Expansores nativos que exibem arquivo, remetente e data do e-mail; descritos em plan-mpp e plan-relatorio-semanal."),
    doc("kpi", "Dias decorridos", "dias-decorridos"),
    doc("kpi", "Dias não trabalhados (clima)", "dias-nao-trabalhados"),
    doc("kpi", "Impacto climático", "impacto-climatico"),
    doc("kpi", "Efetivo atual", "efetivo-atual"),
    exempt("message", "Rodapé 'Nenhum indicador financeiro ou SSMA é estimado…'", "Texto fixo de rodapé, sem cálculo; a regra de dado ausente está em cada indicador e na página."),
    {
      route: EXEC,
      kind: "chart",
      label: "Curva S e Histograma como gráficos",
      gap: "Não existem gráficos de Curva S nem de histograma no Dashboard Executivo: a tela mostra só o último valor (avanço físico e efetivo atual), documentado. Se o gráfico for criado, deve ser inventariado e documentado.",
    },

    // ---- Dashboard Visual (rota que redireciona) ----
    {
      route: VISUAL,
      kind: "page",
      label: "Dashboard Visual (redireciona para o Dashboard Executivo)",
      exempt: "A rota /dashboard/visual apenas redireciona (redirect) para /dashboard: não tem interface própria. O conteúdo está documentado no Dashboard Executivo.",
    },
    {
      route: VISUAL,
      kind: "filter",
      label: "Filtro de período e cartões do Dashboard Visual (components/dashboard-visual/*)",
      gap: "Os componentes do Dashboard Visual (filtro de período, cartões de e-mails, alertas, valor contratual, prazo, volume por fonte, experts) existem no código mas nenhuma rota os renderiza hoje; as entradas legadas dashboard-visual-* ficaram sem tela. Providência: decidir se o Dashboard Visual será reativado (então inventariar e documentar) ou se os componentes serão removidos pelo time de desenvolvimento.",
    },
  ],
};
