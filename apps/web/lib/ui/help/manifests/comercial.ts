// Manifesto (inventário AUTORITATIVO) do módulo "comercial": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
import type { HelpElementKind, HelpManifest, HelpManifestElement } from "../types";

const FIN = "/[projectId]/financeiro";
const ADI = "/[projectId]/adicionais";
const ADI_DET = "/[projectId]/adicionais/[proposalId]";
const P = "comercial.financeiro.";

const fin = (kind: HelpElementKind, label: string, id: string): HelpManifestElement => ({ route: FIN, kind, label, helpId: id === "financeiro" ? id : `${P}${id}` });
const finExempt = (kind: HelpElementKind, label: string, why: string): HelpManifestElement => ({ route: FIN, kind, label, exempt: why });

export const COMERCIAL_MANIFEST: HelpManifest = {
  module: "comercial",
  routes: [FIN, ADI, ADI_DET],
  elements: [
    // ---- Financeiro: página, estados e cabeçalho ----
    fin("page", "Financeiro", "financeiro"),
    fin("message", "Funcionalidade indisponível neste ambiente", "mensagem-indisponivel"),
    fin("message", "Acesso negado (dados financeiros restritos)", "mensagem-acesso-negado"),
    fin("button", "ABRIR RELATÓRIO DE ORIGEM", "botao-relatorio-origem"),
    fin("status", "Cabeçalho: Projeto, Semana WNN, Data de corte, E-mail, Arquivo de origem, Status, Confiança, Última atualização, Versão, Unidade/moeda", "cabecalho"),
    fin("message", "Expert Comercial/Financeiro (Diretor Comercial IA)", "expert"),

    // ---- Financeiro: filtros ----
    fin("filter", "Semana da obra", "filtro-semana"),
    fin("filter", "Versão do envio", "filtro-versao"),
    fin("filter", "De / Até (período)", "filtro-periodo"),
    fin("filter", "Série", "filtro-serie"),
    fin("button", "Aplicar / Limpar", "botao-aplicar-limpar"),

    // ---- Financeiro: mensagens ----
    fin("message", "Alerta de status da aba (ausente, ambígua, pendente, falha)", "alerta-status-aba"),
    fin("message", "Aviso informativo: previsto pode ser reprevisto", "aviso-base"),
    finExempt("message", "Estados vazios (EmptyState): sem relatório, sem versão válida, sem valores, sem série, sem período", "Mensagens de ausência de dado cuja regra (dado ausente = sem fonte, nunca zero) está descrita em cada indicador e no cabeçalho; sem cálculo próprio."),

    // ---- Financeiro: cartões (KPIs) ----
    fin("kpi", "Previsto do período", "card-previsto-periodo"),
    fin("kpi", "Realizado do período", "card-realizado-periodo"),
    fin("kpi", "Desvio do período", "card-desvio-periodo"),
    fin("kpi", "Previsto acumulado", "card-previsto-acumulado"),
    fin("kpi", "Realizado acumulado", "card-realizado-acumulado"),
    fin("kpi", "Desvio acumulado", "card-desvio-acumulado"),
    fin("kpi", "Cumprimento do previsto", "card-cumprimento"),
    fin("kpi", "Medido", "card-medido"),
    fin("kpi", "Faturado", "card-faturado"),
    fin("kpi", "Recebido", "card-recebido"),
    fin("kpi", "Saldo a receber", "card-saldo-receber"),
    fin("kpi", "Custo", "card-custo"),
    fin("kpi", "Receita", "card-receita"),
    fin("kpi", "Resultado", "card-resultado"),
    fin("kpi", "Margem", "card-margem"),

    // ---- Financeiro: gráficos e legendas ----
    fin("chart", "Previsto × realizado por período", "grafico-previsto-realizado"),
    fin("chart", "Previsto acumulado × realizado acumulado", "grafico-acumulados"),
    fin("chart", "Medido × faturado × recebido", "grafico-medido-faturado-recebido"),
    fin("chart", "Receita × custo", "grafico-receita-custo"),
    fin("chart", "Desvio financeiro por período", "grafico-desvio"),
    fin("chart", "Evolução semanal do desvio (relatório anterior × atual)", "grafico-evolucao-desvio"),
    finExempt("chart", "Legenda das séries (cores) e fonte do gráfico", "A legenda associa cada cor à série e a fonte cita arquivo/aba/intervalo; descrita em cada entrada de gráfico (description e source). Não há legenda interativa."),

    // ---- Financeiro: alterações, cruzamento ----
    fin("table", "Alterações desde o relatório anterior (Métrica, Período, Anterior, Atual, Diferença, Fonte)", "alteracoes"),
    fin("status", "Classificação (Baixo, Médio, Alto, Revisão necessária)", "alteracoes-classificacao"),
    fin("table", "Cruzamento Financeiro × Curva S × MPP", "cruzamento"),
    fin("status", "Selos de domínio, severidade e revisão humana do cruzamento", "cruzamento-severidade"),

    // ---- Financeiro: tabela detalhada ----
    fin("table", "Tabela detalhada (Período, Data e colunas financeiras)", "tabela-detalhada"),
    fin("filter", "Pesquisar período / Ordenar / Filtrar", "tabela-busca-ordenacao"),
    fin("table", "Colunas Desvio abs. e Desvio %", "coluna-desvio"),
    fin("table", "Colunas Confiança e Origem", "coluna-confianca-origem"),
    finExempt("table", "Colunas Unidade, Período e Data", "Colunas de identificação da linha: Unidade (moeda da aba ou %), Período (rótulo WNN/mês) e Data; descritas na entrada Tabela detalhada."),
    finExempt("button", "Paginação (← Anterior / Próxima →) e links de versões anteriores da mesma semana", "Navegação por parâmetros de URL (pagina/versao) que preserva os filtros; descrita na entrada Tabela detalhada e nas entradas de filtro. Versões da mesma semana nunca são somadas."),

    // ---- Financeiro: correção humana ----
    fin("admin-action", "Correção humana de valores", "correcao-humana"),
    finExempt("field", "Campos Período, Coluna, Valor correto e Justificativa; botão Registrar correção", "Formulário do cartão Correção humana de valores (FinancialCorrectionForm): passos, formato do valor (1.234,56), justificativa mínima de 10 caracteres e efeitos estão no passo a passo da entrada comercial.financeiro.correcao-humana."),

    // ---- Financeiro: integração com Orçamentos (pendência declarada) ----
    {
      route: FIN,
      kind: "message",
      label: "Relação com Orçamentos (custos orçados, BDI, margem do orçamento)",
      exempt: "Elemento inexistente (a tela não renderiza nada de Orçamentos; o texto de ajuda do Financeiro já declara a lacuna como sem fonte). A tela Financeiro não tem fonte de Orçamentos: o ACC não possui composição de custos nem integração com o Sistema de Orçamentos (apenas metadados de arquivos de orçamento; Drive de Orçamentos não está integrado). A coluna custo é custo realizado da obra. Providência: definir a fonte de Orçamentos (integração segura server-side) e então documentar e exibir; até lá o Diretor Comercial IA deve marcar o dado como não disponível no ACC.",
    },

    // ---- Adicionais (rotas redirecionam) ----
    {
      route: ADI,
      kind: "page",
      label: "Propostas Adicionais (lista) — redireciona para Documentos",
      exempt: "A rota /adicionais apenas redireciona (redirect) para /documentos do mesmo projeto desde a remoção da aba Serviços Adicionais; não tem interface própria. Serviço adicional aprovado entra por upload manual do ADM em Documentos.",
    },
    {
      route: ADI_DET,
      kind: "page",
      label: "Detalhe da proposta adicional — redireciona para Documentos",
      exempt: "A rota /adicionais/[proposalId] apenas redireciona (redirect) para /documentos do mesmo projeto; o detalhe da proposta não tem mais tela própria.",
    },
    { route: ADI, kind: "button", label: "Marcar como Contratado", helpId: "adicionais-marcar-contratado" },
    { route: ADI, kind: "field", label: "Formalização", helpId: "adicionais-formalizacao" },
    { route: ADI, kind: "status", label: "Status de prazo (aprovações)", helpId: "adicionais-status-prazo" },
    { route: ADI, kind: "table", label: "Checklist documental", helpId: "adicionais-documentacao" },
    {
      route: ADI,
      kind: "admin-action",
      label: "Formulários e painéis de proposta adicional sem rota (nova proposta, status, vínculo de fonte, curadoria por IA)",
      exempt: "Código sem rota (confirmado: nenhum arquivo importa components/additionals/*; /[projectId]/adicionais redireciona para Documentos e não cria rota nova). Os componentes em components/additionals (criar proposta, status, vínculo de fonte e painel de curadoria) existem, mas nenhuma rota os monta hoje: os ícones dos elementos Marcar como Contratado, Formalização, Status de prazo e Checklist (ids legados adicionais-*) estão no código dos componentes, porém inalcançáveis na interface. Providência: se a tela for reativada, inventariar e documentar os demais campos (nova proposta, status, vínculo, curadoria); se não, o time de desenvolvimento deve decidir sobre remover os componentes.",
    },
  ],
};
