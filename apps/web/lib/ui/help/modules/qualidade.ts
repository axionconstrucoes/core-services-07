// Catálogo de ajuda do módulo "qualidade" — Qualidade (RNC, evidências, inspeções, reclamações, ensaios, requisitos, CAPA, eficácia, recorrências, custos de não qualidade, auditoria). Arquivo EXCLUSIVO do agente deste módulo.
// Regras de conteúdo: ver lib/ui/help/types.ts e docs/design-system/hover-text-e-contraste.md. Ids novos: "qualidade.tela.elemento".
// Conteúdo lido do código: migrations 20261122100000/101000, lib/quality/ui-model.ts, ui-commands.ts, ui-queries.ts e os componentes de components/quality.
import type { FeatureHelpDefinition, HelpElementKind } from "../types";

const VERSION = "2026-11-20";
const REFRESH = "A cada carregamento da página (consulta direta ao banco, sem cache); após cada gravação a página é revalidada.";
const PERM_READ = "Consulta: qualquer membro ativo do projeto (RLS quality_can_read). Registro: ADMINISTRADOR, GERENTE, GESTOR e COLABORADOR. LEITURA só consulta.";
const PERM_MANAGE = "ADMINISTRADOR, GERENTE ou GESTOR (quality_can_manage). COLABORADOR e LEITURA não executam esta ação.";
const PERM_REGISTER = "ADMINISTRADOR, GERENTE, GESTOR ou COLABORADOR (quality_can_register).";

const firstSentence = (t: string): string => {
  const s = t.split(/(?<=\.)\s/)[0];
  return s.length <= 160 ? s : `${s.slice(0, 157)}…`;
};

function def(id: string, kind: HelpElementKind, title: string, description: string, extra: Partial<FeatureHelpDefinition> = {}): FeatureHelpDefinition {
  if (description.length < 60) description = `${description} Informação lida do banco, sempre do projeto atual.`;
  return { id, kind, module: "qualidade", title, shortDescription: firstSentence(description), description, version: VERSION, ...extra };
}
const tab = (id: string, title: string, description: string) => def(id, "tab", title, description, { permissions: PERM_READ });
const col = (id: string, title: string, description: string, source: string) => def(id, "table", title, description, { source, refresh: REFRESH, missingData: "Valor ausente aparece como SEM DADOS (nunca como zero)." });
const field = (id: string, title: string, description: string, extra: Partial<FeatureHelpDefinition> = {}) => def(id, "field", title, description, { permissions: PERM_REGISTER, ...extra });
const filt = (id: string, title: string, description: string) => def(id, "filter", title, description, { howItWorks: "Filtro por parâmetro de URL (GET) aplicado na consulta ao banco, sempre dentro do projeto atual; não altera dados." });
const kpi = (id: string, title: string, description: string, formula: string, source: string, unit: string, missingData: string) =>
  def(id, "kpi", title, description, { formula, source, unit, refresh: REFRESH, missingData });
const form = (id: string, title: string, description: string, extra: Partial<FeatureHelpDefinition> = {}) => def(id, "button", title, description, { permissions: PERM_REGISTER, ...extra });

export const QUALIDADE_HELP: FeatureHelpDefinition[] = [
  // ---- navegação / página
  def("qualidade.menu.item", "module", "Menu Qualidade", "Abre o módulo Qualidade do projeto: dashboard, RNC, evidências, inspeções, reclamações, ensaios e laudos, requisitos, ações corretivas (CAPA), eficácia, recorrências, custos de não qualidade e auditoria.", {
    purpose: "Atalho para a rota /[projeto]/qualidade. Assistência técnica e garantias pós-entrega pertencem a outro módulo.", permissions: PERM_READ,
  }),
  def("qualidade.pagina.visao-geral", "page", "Qualidade — visão geral", "Tela do módulo Qualidade. As áreas ficam em abas (parâmetro ?aba= na URL): Dashboard, RNC, Evidências, Inspeções, Reclamações, Ensaios e laudos, Requisitos, Ações (CAPA), Eficácia, Recorrências, Custos e Auditoria.", {
    purpose: "Registrar e acompanhar não conformidades com rastreabilidade até a fonte original e revisão humana.",
    howItWorks: "A tela só lê tabelas quality_* sob RLS por projeto; toda escrita passa por Server Actions que chamam RPCs (RNC) ou gravam sob RLS com o usuário logado. A interface nunca é a autoridade: o banco recusa o que não é permitido.",
    humanReview: "Classificar evidência, confirmar NC, verificar eficácia e encerrar são decisões humanas; nenhuma IA altera evidência original nem encerra RNC.",
    limitations: ["Sem IA nesta tela: nada é inferido automaticamente.", "Listas mostram até 200 registros mais recentes."], permissions: PERM_READ,
  }),

  // ---- abas
  tab("qualidade.abas.dashboard", "Aba Dashboard", "Indicadores reais da Qualidade do projeto: RNC abertas e críticas, reaberturas, tempo até o encerramento, ações vencidas, eficácia e RNC por estado. Sem dado, mostra SEM DADOS."),
  tab("qualidade.abas.rnc", "Aba RNC", "Lista de relatórios de não conformidade com filtros (busca, estado, criticidade, origem) e formulário de nova RNC. O detalhe de cada RNC abre ao clicar no código."),
  tab("qualidade.abas.evidencias", "Aba Evidências", "Todas as evidências do projeto com a fonte original, a classificação (SUSPEITA, INDÍCIO, NC COMPROVADA, RISCO POTENCIAL) e o tipo epistêmico (fato, inferência, recomendação)."),
  tab("qualidade.abas.inspecoes", "Aba Inspeções", "Registro de inspeções de qualidade com resultado (pendente, conforme, não conforme, parcial), local, datas, requisito verificado e RNC vinculada."),
  tab("qualidade.abas.reclamacoes", "Aba Reclamações", "Reclamações de clientes com canal (e-mail do cliente, e-mail AXION, telefone, portal, presencial), data de recebimento, assunto e a fonte original obrigatória."),
  tab("qualidade.abas.ensaios", "Aba Ensaios e laudos", "Ensaios e laudos técnicos. Resultado aprovado ou reprovado só é aceito com o laudo ou relatório de origem informado."),
  tab("qualidade.abas.requisitos", "Aba Requisitos", "Requisitos técnicos do projeto (norma, projeto, especificação, cláusula) usados para apontar qual requisito uma RNC, inspeção ou ensaio verifica. Cada requisito tem fonte."),
  tab("qualidade.abas.capa", "Aba Ações (CAPA)", "Visão de todas as ações corretivas, preventivas e de contenção do projeto, com prazo e status. As ações são criadas e atualizadas dentro de cada RNC."),
  tab("qualidade.abas.eficacia", "Aba Eficácia", "Verificações de eficácia registradas (eficaz, ineficaz, parcial). O encerramento de uma RNC exige a última verificação EFICAZ, com evidência, posterior ao último ciclo de correção ou reabertura."),
  tab("qualidade.abas.recorrencias", "Aba Recorrências", "Relações de recorrência entre RNC do projeto, cada uma com fundamento escrito. O registro é feito dentro da RNC."),
  tab("qualidade.abas.custos", "Aba Custos de não qualidade", "Custos ligados às RNC (retrabalho, material, mão de obra, multa, garantia, perda de prazo, outro). Valor só é aceito com fonte; sem valor o custo fica SEM DADOS."),
  tab("qualidade.abas.auditoria", "Aba Auditoria", "Linha do tempo cronológica dos eventos de estado das RNC e dos registros de auditoria do módulo. Somente leitura (append-only)."),

  // ---- dashboard
  def("qualidade.dashboard.indicadores", "message", "Indicadores da Qualidade", "Conjunto de KPIs calculados no servidor a partir das RNC, ações e verificações do projeto atual. Sem nenhuma RNC registrada, os indicadores de RNC mostram SEM DADOS em vez de zero.", {
    source: "quality_ncrs, quality_corrective_actions e quality_effectiveness_verifications (filtradas por project_id).", refresh: REFRESH,
  }),
  kpi("qualidade.dashboard.kpi-abertas", "KPI RNC abertas", "Quantidade de RNC ainda em tratamento no projeto: todas as que não estão ENCERRADA, NÃO CONFIRMADA, DUPLICADA nem CANCELADA.",
    "contagem de quality_ncrs do projeto com state fora de {ENCERRADA, NAO_CONFIRMADA, DUPLICADA, CANCELADA}", "quality_ncrs.state", "RNC (quantidade atual, sem recorte de período)", "Se não há nenhuma RNC registrada no projeto, exibe SEM DADOS (nunca 0)."),
  kpi("qualidade.dashboard.kpi-criticas", "KPI RNC críticas abertas", "Quantidade de RNC abertas cuja criticidade é Crítica. A criticidade é a do pior pilar (prazo, custo, segurança, qualidade), nunca uma média.",
    "contagem de RNC abertas com criticality = CRITICAL (calculada pelo banco a partir das consequências por pilar)", "quality_ncrs.criticality (derivada de quality_consequences)", "RNC (quantidade atual)", "Sem RNC registrada: SEM DADOS. RNC sem consequência registrada tem criticidade SEM DADOS e não entra aqui."),
  kpi("qualidade.dashboard.kpi-sem-criticidade", "KPI RNC abertas sem criticidade", "Quantidade de RNC abertas sem nenhuma consequência registrada, portanto com criticidade SEM DADOS. Evidencia o que falta avaliar, em vez de tratá-las como baixas.",
    "contagem de RNC abertas com criticality = SEM_DADOS", "quality_ncrs.criticality", "RNC (quantidade atual)", "Sem RNC registrada: SEM DADOS."),
  kpi("qualidade.dashboard.kpi-reaberturas", "KPI Reaberturas", "Total de reaberturas acumuladas nas RNC do projeto (cada transição para REABERTA soma 1 ao contador da RNC).",
    "soma de quality_ncrs.reopen_count de todas as RNC do projeto", "quality_ncrs.reopen_count", "reaberturas (acumulado)", "Sem RNC registrada: SEM DADOS."),
  kpi("qualidade.dashboard.kpi-tempo-encerramento", "KPI Tempo médio até o encerramento", "Média, em dias, entre a criação e o encerramento das RNC atualmente encerradas. RNC reabertas saem da média até serem encerradas de novo.",
    "média de (closed_at − created_at) em dias, sobre RNC com state = ENCERRADA e closed_at preenchido", "quality_ncrs.created_at e closed_at", "dias (média, uma casa decimal)", "Sem nenhuma RNC encerrada com data de encerramento: SEM DADOS."),
  kpi("qualidade.dashboard.kpi-acoes-vencidas", "KPI Ações vencidas", "Quantidade de ações (CAPA) PLANEJADAS ou EM ANDAMENTO cujo prazo é anterior a hoje. Ações sem prazo informado não são avaliadas e são contadas à parte no texto do indicador.",
    "contagem de ações com due_date < data de hoje (do servidor) e status em {PLANEJADA, EM_ANDAMENTO}", "quality_corrective_actions.due_date e status", "ações (quantidade atual)", "Sem ações, ou sem nenhuma ação com prazo: SEM DADOS."),
  kpi("qualidade.dashboard.kpi-eficacia", "KPI Eficácia das correções", "Percentual de RNC cuja verificação de eficácia mais recente deu EFICAZ. Cada RNC conta uma vez, pela última verificação registrada.",
    "100 × (RNC com última verificação EFICAZ) ÷ (RNC com ao menos uma verificação)", "quality_effectiveness_verifications (result, ncr_id, created_at)", "% das RNC verificadas", "Sem nenhuma verificação registrada: SEM DADOS."),
  def("qualidade.dashboard.por-estado", "table", "RNC por estado", "Tabela com a quantidade de RNC em cada estado da máquina de estados (detectada, triagem, investigação, confirmada, plano de ação, correção, verificação, encerrada, não confirmada, duplicada, cancelada, reaberta). Clique no estado para abrir a lista filtrada.", { source: "quality_ncrs.state", refresh: REFRESH, missingData: "Sem RNC registrada, exibe SEM DADOS." }),
  col("qualidade.dashboard.col-estado", "Coluna Estado", "Estado atual da RNC na máquina de estados da Qualidade. Estados com contagem zero não aparecem.", "quality_ncrs.state"),
  col("qualidade.dashboard.col-quantidade", "Coluna Quantidade", "Quantidade de RNC do projeto no estado indicado, em ordem decrescente.", "quality_ncrs"),

  // ---- campos comuns
  field("qualidade.campo.titulo", "Campo Título", "Título curto e objetivo do registro (mínimo de 3 e máximo de 300 caracteres). É o texto exibido nas listas.", { data: ["Obrigatório."] }),
  field("qualidade.campo.descricao", "Campo Descrição", "Texto livre com os fatos observados (até 4000 caracteres). Descreva o que foi visto, não a conclusão: conclusões ficam em evidência classificada, causa raiz ou consequência.", { limitations: ["Não substitui a referência à fonte original."] }),
  field("qualidade.campo.observacoes", "Campo Observações", "Anotações complementares do registro (até 4000 caracteres). Opcional."),
  field("qualidade.campo.origem-tipo", "Campo Origem da RNC", "Tipo da fonte que originou a RNC: foto SSMA, e-mail, diário de obra, relatório de fiscalização, inspeção, ensaio/laudo, documento, reclamação de cliente ou registro manual.", {
    criteria: ["Junto com a referência da origem forma a chave de deduplicação: a mesma origem não gera duas RNC ativas no projeto (Qualidade x SSMA)."], consequences: ["A origem não pode ser alterada depois da criação."],
  }),
  field("qualidade.campo.origem-ref", "Campo Referência da origem", "Identificação exata do original que originou a RNC (ID ou assunto do e-mail, nome do arquivo da foto, data e página do diário, número do relatório). Obrigatório: toda RNC aponta para a fonte.", {
    howItWorks: "A referência é normalizada (sem espaços nas pontas, minúsculas) e combinada com o tipo para detectar RNC já existente. Se existir, nenhuma RNC nova é criada e a existente é indicada.",
  }),
  field("qualidade.campo.url-fonte", "Campo Link da fonte", "Endereço (http/https) do documento, e-mail, foto, diário ou relatório original, quando houver. Opcional; serve para abrir a fonte a partir da lista.", { limitations: ["Só links http/https são exibidos como clicáveis."] }),
  field("qualidade.campo.fonte-ref", "Campo Fonte original", "Referência textual obrigatória do original que sustenta o registro (até 1000 caracteres). Sem fonte o registro não é aceito: rastreabilidade até a origem é regra do módulo.", { consequences: ["A fonte da evidência é imutável depois de gravada; só a classificação e o tipo epistêmico podem ser revistos."] }),
  field("qualidade.campo.requisito", "Campo Requisito", "Requisito técnico (aba Requisitos) que a RNC, inspeção ou ensaio verifica. Opcional; sem requisito fica SEM DADOS.", { data: ["Lista os requisitos do projeto atual."] }),
  field("qualidade.campo.rnc-vinculada", "Campo RNC vinculada", "RNC do projeto à qual o registro se liga. Opcional. Só RNC do mesmo projeto são aceitas (o banco recusa vínculo entre projetos).", { consequences: ["O vínculo aparece na lista e na linha do tempo da RNC."] }),

  // ---- RNC lista
  def("qualidade.rnc.lista", "table", "Lista de RNC", "Tabela das RNC do projeto, da mais recente para a mais antiga, respeitando os filtros. Mostra código, título, estado, criticidade, origem com link para a fonte, reaberturas, prazo e criação.", { source: "quality_ncrs", refresh: REFRESH, missingData: "Sem RNC, exibe SEM DADOS. Campos vazios exibem SEM DADOS." }),
  form("qualidade.rnc.form-criar", "Formulário Nova RNC", "Cria uma RNC pela RPC quality_ncr_create. A RNC nasce em DETECTADA, com código sequencial do projeto (RNC-0001…), evento de estado e auditoria. Se a origem já tiver RNC ativa, nada é criado e o código existente é informado.", {
    howToUse: ["Informe título, origem e a referência exata da fonte.", "Opcionalmente informe link da fonte, requisito e descrição.", "Clique em Registrar RNC e abra a RNC criada."],
    consequences: ["Registrar uma RNC não a confirma: a confirmação exige evidência NC COMPROVADA e decisão de gestão."],
  }),
  filt("qualidade.rnc.filtro-busca", "Filtro Busca", "Procura o texto no título, no código e na referência da origem das RNC (até 80 caracteres)."),
  filt("qualidade.rnc.filtro-estado", "Filtro Estado", "Mostra só as RNC no estado escolhido da máquina de estados."),
  filt("qualidade.rnc.filtro-criticidade", "Filtro Criticidade", "Mostra só as RNC com a criticidade escolhida (Crítica, Alta, Média, Baixa ou SEM DADOS)."),
  filt("qualidade.rnc.filtro-origem", "Filtro Origem", "Mostra só as RNC originadas no tipo de fonte escolhido."),
  def("qualidade.rnc.filtro-aplicar", "button", "Botão Filtrar", "Aplica os filtros recarregando a lista pela URL. Não altera nenhum dado.", { howItWorks: "Envia um formulário GET com aba, q, estado, criticidade e origem." }),
  col("qualidade.rnc.col-codigo", "Coluna Código", "Código sequencial da RNC no projeto (RNC-0001…), gerado pelo banco. Clique para abrir o detalhe.", "quality_ncrs.code"),
  col("qualidade.rnc.col-titulo", "Coluna Título", "Título informado na criação da RNC.", "quality_ncrs.title"),
  col("qualidade.rnc.col-estado", "Coluna Estado", "Estado atual na máquina de estados da RNC. Só muda pela RPC de transição, com justificativa, evidência e bloqueios aplicáveis.", "quality_ncrs.state"),
  col("qualidade.rnc.col-criticidade", "Coluna Criticidade", "Criticidade da RNC: a do pior pilar entre as consequências registradas (prazo, custo, segurança, qualidade). SEM DADOS quando não há consequência registrada.", "quality_ncrs.criticality (calculada pelo banco a partir de quality_consequences)"),
  col("qualidade.rnc.col-origem", "Coluna Origem", "Tipo da fonte original e a referência, com link para abrir o original quando informado.", "quality_ncrs.origin_type, origin_ref, origin_url"),
  col("qualidade.rnc.col-reaberturas", "Coluna Reaberturas", "Quantas vezes a RNC foi reaberta (transição para REABERTA).", "quality_ncrs.reopen_count"),
  col("qualidade.rnc.col-prazo", "Coluna Prazo", "Prazo informado para tratar a RNC. SEM DADOS quando não informado.", "quality_ncrs.due_date"),
  col("qualidade.rnc.col-criada", "Coluna Criada em", "Data e hora de criação da RNC.", "quality_ncrs.created_at"),

  // ---- RNC detalhe
  def("qualidade.rnc.pagina-detalhe", "page", "Detalhe da RNC", "Tela de uma RNC: resumo, transição de estado, evidências, consequências por pilar, ações (CAPA), verificação de eficácia, custos, recorrências e linha do tempo. RNC de outro projeto ou inexistente retorna 404.", {
    howItWorks: "Carrega a RNC escopada por project_id e consulta quality_transition_blockers e quality_closure_readiness para os bloqueios. Cada gravação envia a row_version lida; se outra pessoa alterou antes, o banco responde VERSION_CONFLICT.",
    permissions: PERM_READ, humanReview: "Todas as decisões desta tela (confirmar, classificar, encerrar, reabrir) são humanas e ficam auditadas.",
  }),
  def("qualidade.rnc.resumo", "message", "Resumo da RNC", "Bloco com estado, criticidade, origem rastreável, reaberturas, versão do registro, responsável e prazo. Campos sem dado mostram SEM DADOS.", { source: "quality_ncrs", refresh: REFRESH }),
  def("qualidade.rnc.estado-atual", "status", "Estado atual da RNC", "Estado da RNC na máquina de estados: DETECTADA, TRIAGEM, INVESTIGACAO, CONFIRMADA, PLANO_ACAO, CORRECAO, VERIFICACAO, ENCERRADA, NAO_CONFIRMADA, DUPLICADA, CANCELADA ou REABERTA.", { criteria: ["Correção executada não equivale a conformidade: encerrar exige verificação de eficácia EFICAZ."], source: "quality_ncrs.state" }),
  def("qualidade.rnc.criticidade", "status", "Criticidade (pior pilar domina)", "Criticidade da RNC definida pelo pior pilar entre as consequências (prazo, custo, segurança, qualidade). Nunca é média: uma consequência catastrófica de segurança prevalece mesmo com prazo e custo baixos. Sem consequência, SEM DADOS.", {
    formula: "máximo das severidades registradas em quality_consequences (LOW < MEDIUM < HIGH < CRITICAL); sem consequência = SEM_DADOS", source: "quality_consequences e quality_ncrs.criticality", missingData: "Pilares sem consequência são listados como SEM DADOS; probabilidade só vale com fundamento e nunca reduz a severidade.",
    validity: "A criticidade é do módulo Qualidade; os SLAs de alerta aprovados (CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis) pertencem ao fluxo de alertas e não são alterados aqui.",
  }),
  def("qualidade.rnc.transicoes", "message", "Transição de estado", "Mostra as transições permitidas a partir do estado atual (catálogo quality_state_transitions), com o que cada uma exige e o que a bloqueia. A decisão final é sempre da RPC quality_ncr_transition.", {
    howItWorks: "Os bloqueios vêm de quality_transition_blockers (ex.: confirmar exige evidência NC COMPROVADA; plano de ação exige ação registrada; verificação e encerramento exigem ações executadas e verificação EFICAZ com evidência, posterior ao último ciclo de correção ou reabertura).",
    consequences: ["Duas transições simultâneas: uma vence; a outra recebe VERSION_CONFLICT."], permissions: PERM_READ,
  }),
  def("qualidade.rnc.botao-transicao", "button", "Botão de transição", "Seleciona a transição de estado. Fica indisponível (aria-disabled) quando há bloqueio ou o perfil não permite; os motivos aparecem logo abaixo do botão. Depois de selecionar, preencha justificativa e evidências e confirme.", {
    criteria: ["Justificativa: mínimo de 10 caracteres quando exigida.", "Evidência: obrigatória em NÃO CONFIRMADA, CONFIRMADA e REABERTA.", "Cancelar, duplicar, confirmar, encerrar e reabrir exigem perfil de gestão."],
    consequences: ["A transição grava evento de estado e auditoria; não pode ser desfeita, apenas seguida de outra transição permitida."], permissions: "Registro avança fases operacionais; decisões (confirmar, encerrar, reabrir, cancelar, duplicar) exigem GERENTE, GESTOR ou ADMINISTRADOR.",
  }),
  field("qualidade.rnc.campo-justificativa", "Campo Justificativa da transição", "Motivo da mudança de estado (mínimo de 10 caracteres quando obrigatória). Fica gravada no evento de estado e na auditoria e aparece na linha do tempo.", { criteria: ["Obrigatória em cancelar, duplicar, não confirmar, confirmar, encerrar, devolver à correção e reabrir."] }),
  field("qualidade.rnc.campo-duplicada-de", "Campo RNC original (duplicada)", "RNC original da qual esta é duplicata. Obrigatória ao marcar como DUPLICADA; precisa ser do mesmo projeto e estar ativa.", { consequences: ["Uma RNC duplicada deixa de contar como ativa para a deduplicação por origem."] }),
  field("qualidade.rnc.campo-evidencias-transicao", "Campo Evidências da transição", "Evidências já cadastradas na RNC que sustentam a transição. Obrigatória em NÃO CONFIRMADA, CONFIRMADA e REABERTA; só evidências desta RNC são aceitas.", { howItWorks: "Os ids são enviados à RPC, validados contra a RNC e o projeto, e gravados no evento de estado." }),
  def("qualidade.rnc.conflito-versao", "message", "Conflito de versão", "Aviso exibido quando outra pessoa alterou a RNC (ou o registro) depois que você abriu a tela. A gravação é recusada com VERSION_CONFLICT para não sobrescrever a decisão alheia; recarregue para ver o estado atual e decida de novo.", { howItWorks: "Cada gravação envia a row_version lida; o banco compara com a atual dentro da transação." }),
  form("qualidade.rnc.form-dados", "Formulário Causa raiz e prazo", "Atualiza a causa raiz e o prazo da RNC. Envia a versão lida; se a RNC mudou, retorna conflito de versão. Não altera estado nem criticidade."),
  field("qualidade.rnc.campo-causa-raiz", "Campo Causa raiz", "Causa raiz apurada na investigação (até 4000 caracteres). Registre a análise, não a hipótese sem apoio; sem investigação fica vazio (SEM DADOS)."),
  field("qualidade.rnc.campo-prazo", "Campo Prazo da RNC", "Data-limite para tratar a RNC. Alimenta a coluna Prazo da lista. Opcional."),
  def("qualidade.rnc.consequencias", "message", "Consequências por pilar", "Registra o impacto da RNC em cada um dos quatro pilares (prazo, custo, segurança, qualidade). Cada consequência exige fonte; a criticidade da RNC é recalculada pelo banco (pior pilar domina).", { source: "quality_consequences", humanReview: "Severidade e fonte são julgamentos humanos; o sistema não estima números." }),
  form("qualidade.rnc.form-consequencia", "Formulário Consequência por pilar", "Registra uma consequência com pilar, severidade, fonte e, opcionalmente, probabilidade com fundamento. Dispara o recálculo da criticidade da RNC no banco."),
  field("qualidade.rnc.campo-pilar", "Campo Pilar", "Pilar afetado: Prazo, Custo, Segurança ou Qualidade. Várias consequências podem coexistir; o pior pilar define a criticidade."),
  field("qualidade.rnc.campo-severidade", "Campo Severidade", "Gravidade da consequência no pilar: Baixa, Média, Alta ou Crítica. Consequência estrutural ou com risco a pessoas deve ser avaliada em Segurança, mesmo que prazo e custo sejam baixos."),
  field("qualidade.rnc.campo-probabilidade", "Campo Probabilidade", "Probabilidade da consequência (rara a quase certa). Só pode ser informada com fundamento escrito; sem fundamento fica SEM DADOS. Nunca reduz a severidade."),
  field("qualidade.rnc.campo-fundamento", "Campo Fundamento da probabilidade", "Justificativa que sustenta a probabilidade escolhida (mínimo de 5 caracteres). Obrigatória quando há probabilidade."),
  field("qualidade.rnc.campo-medidas", "Campo Medidas", "Medidas de controle ou mitigação já adotadas para esta consequência. Opcional."),
  col("qualidade.rnc.col-pilar", "Coluna Pilar", "Pilar da consequência (Prazo, Custo, Segurança, Qualidade).", "quality_consequences.pillar"),
  col("qualidade.rnc.col-severidade", "Coluna Severidade", "Severidade registrada da consequência no pilar.", "quality_consequences.severity"),
  col("qualidade.rnc.col-probabilidade", "Coluna Probabilidade", "Probabilidade com o fundamento entre parênteses. SEM DADOS quando não há fundamento.", "quality_consequences.probability e probability_basis"),
  col("qualidade.rnc.col-fonte-consequencia", "Coluna Fonte da consequência", "Fonte que sustenta a consequência (documento, foto, laudo ou decisão).", "quality_consequences.source_ref"),
  col("qualidade.rnc.col-status-consequencia", "Coluna Status da consequência", "Situação do tratamento: aberta, em tratamento, mitigada, aceita ou encerrada.", "quality_consequences.status"),
  def("qualidade.rnc.linha-do-tempo", "message", "Linha do tempo da RNC", "Eventos de estado da RNC (de, para, quem, quando, justificativa) e registros de auditoria de suas evidências, ações, verificações, consequências e custos, do mais recente para o mais antigo. Somente leitura.", { source: "quality_state_events (append-only) e audit_log_entries", refresh: REFRESH }),

  // ---- evidências
  def("qualidade.evidencias.lista", "table", "Lista de evidências", "Evidências do projeto com vínculo, fonte original, classificação, tipo epistêmico, descrição e data de captura. A fonte original nunca é alterada pelo sistema.", { source: "quality_evidence", refresh: REFRESH, missingData: "Sem evidência, exibe SEM DADOS." }),
  def("qualidade.evidencias.secao-rnc", "message", "Evidências da RNC", "Evidências ligadas a esta RNC. Dentro da RNC é possível cadastrar novas e reclassificar as existentes (classificação e tipo epistêmico); a referência da fonte é imutável.", { source: "quality_evidence", humanReview: "A classificação é decisão humana; NC COMPROVADA exige tipo epistêmico FATO." }),
  form("qualidade.evidencias.form-criar", "Formulário Registrar evidência", "Grava uma evidência ligada à RNC e à fonte original. Defina a classificação (força probatória) e o tipo epistêmico (fato, inferência, recomendação). NC COMPROVADA só com tipo FATO.", {
    howToUse: ["Escolha o tipo de fonte e informe a referência exata.", "Classifique: SUSPEITA, INDÍCIO, NC COMPROVADA ou RISCO POTENCIAL.", "Defina o tipo epistêmico e descreva o que a evidência mostra."],
    consequences: ["Duplicata (mesma RNC, tipo de fonte e referência) é recusada pelo banco."],
  }),
  field("qualidade.evidencias.campo-tipo-fonte", "Campo Tipo de fonte", "Natureza do original: foto SSMA, e-mail, diário de obra, relatório de fiscalização, inspeção, ensaio/laudo, documento ou outro."),
  field("qualidade.evidencias.campo-capturada", "Campo Capturada em", "Data e hora em que o original foi produzido ou capturado (foto, e-mail, registro do diário). Opcional; imutável depois de gravada."),
  field("qualidade.evidencias.campo-classificacao", "Campo Classificação da evidência", "Força probatória: SUSPEITA e INDÍCIO são hipóteses que pedem investigação; NC COMPROVADA sustenta confirmar a RNC; RISCO POTENCIAL é eixo próprio e não comprova não conformidade.", { criteria: ["Confirmar a RNC exige ao menos uma evidência NC COMPROVADA."], humanReview: "Somente pessoas classificam; automação nunca classifica como NC COMPROVADA." }),
  field("qualidade.evidencias.campo-epistemico", "Campo Tipo epistêmico", "Diferencia FATO (observado e verificável), INFERÊNCIA (dedução a partir de fatos) e RECOMENDAÇÃO (o que se sugere fazer). NC COMPROVADA exige FATO.", { limitations: ["Inferência e recomendação não comprovam não conformidade."] }),
  filt("qualidade.evidencias.filtro-classificacao", "Filtro Classificação", "Mostra só as evidências com a classificação escolhida."),
  filt("qualidade.evidencias.filtro-fonte", "Filtro Tipo de fonte", "Mostra só as evidências do tipo de fonte escolhido."),
  def("qualidade.evidencias.filtro-aplicar", "button", "Botão Filtrar evidências", "Aplica os filtros de classificação e de fonte recarregando a lista. Não altera dados.", { howItWorks: "Formulário GET com aba, classificacao e fonte." }),
  col("qualidade.evidencias.col-vinculo", "Coluna Vinculada a", "Registro ao qual a evidência pertence: RNC (com link), reclamação, inspeção, ensaio ou garantia.", "quality_evidence.ncr_id, complaint_id, inspection_id, test_id, warranty_case_id"),
  col("qualidade.evidencias.col-fonte", "Coluna Fonte original", "Tipo de fonte e referência exata do original, com link para abri-lo quando informado.", "quality_evidence.source_type, source_ref, source_url"),
  col("qualidade.evidencias.col-classificacao", "Coluna Classificação", "Classificação probatória da evidência (suspeita, indício, NC comprovada, risco potencial).", "quality_evidence.classification"),
  col("qualidade.evidencias.col-epistemico", "Coluna Tipo epistêmico", "Natureza do conteúdo: fato, inferência ou recomendação.", "quality_evidence.epistemic"),
  col("qualidade.evidencias.col-descricao", "Coluna Descrição", "O que a evidência mostra, conforme registrado por quem a cadastrou.", "quality_evidence.description"),
  col("qualidade.evidencias.col-capturada", "Coluna Capturada em", "Data e hora de captura do original, quando informada.", "quality_evidence.captured_at"),
  col("qualidade.evidencias.col-reclassificar", "Coluna Reclassificar", "Altera a classificação e o tipo epistêmico da evidência, enviando a versão lida (conflito de versão se alguém alterou antes). A fonte original permanece imutável.", "quality_evidence (UPDATE restrito às colunas classification, epistemic, description)"),

  // ---- inspeções
  def("qualidade.inspecoes.lista", "table", "Lista de inspeções", "Inspeções do projeto com código, título, resultado, datas planejada e realizada, RNC vinculada e fonte.", { source: "quality_inspections", refresh: REFRESH, missingData: "Sem inspeção, exibe SEM DADOS." }),
  form("qualidade.inspecoes.form-criar", "Formulário Nova inspeção", "Registra uma inspeção (código INS-0001… gerado pelo banco) com resultado, datas, local, requisito verificado e RNC vinculada opcionais."),
  field("qualidade.inspecoes.campo-tipo", "Campo Tipo de inspeção", "Natureza da inspeção (por exemplo, recebimento de material ou serviço executado). Texto livre, opcional."),
  field("qualidade.inspecoes.campo-local", "Campo Local", "Local da obra inspecionado. Opcional; sem local fica SEM DADOS."),
  field("qualidade.inspecoes.campo-resultado", "Campo Resultado da inspeção", "Pendente, conforme, não conforme ou parcial. Não conforme não cria RNC automaticamente: a RNC é registrada por uma pessoa."),
  field("qualidade.inspecoes.campo-planejada", "Campo Planejada para", "Data e hora planejadas para a inspeção. Opcional."),
  field("qualidade.inspecoes.campo-realizada", "Campo Realizada em", "Data e hora em que a inspeção ocorreu. Opcional; sem data fica SEM DADOS."),
  col("qualidade.inspecoes.col-codigo", "Coluna Código da inspeção", "Código sequencial da inspeção no projeto (INS-0001…).", "quality_inspections.code"),
  col("qualidade.inspecoes.col-titulo", "Coluna Título e local", "Título da inspeção e, abaixo, o local quando informado.", "quality_inspections.title e location"),
  col("qualidade.inspecoes.col-resultado", "Coluna Resultado da inspeção", "Resultado registrado: pendente, conforme, não conforme ou parcial.", "quality_inspections.result"),
  col("qualidade.inspecoes.col-datas", "Coluna Planejada / realizada", "Data planejada e data de realização da inspeção; SEM DADOS quando não informadas.", "quality_inspections.planned_at e performed_at"),
  col("qualidade.inspecoes.col-rnc", "Coluna RNC da inspeção", "RNC vinculada à inspeção, com link.", "quality_inspections.ncr_id"),
  col("qualidade.inspecoes.col-fonte", "Coluna Fonte da inspeção", "Fonte (relatório, checklist) informada na inspeção.", "quality_inspections.source_ref"),

  // ---- reclamações
  def("qualidade.reclamacoes.lista", "table", "Lista de reclamações", "Reclamações de clientes do projeto, da mais recente para a mais antiga, com canal, assunto, data de recebimento, status, fonte original e RNC vinculada.", { source: "quality_customer_complaints", refresh: REFRESH, missingData: "Sem reclamação, exibe SEM DADOS." }),
  form("qualidade.reclamacoes.form-criar", "Formulário Nova reclamação", "Registra uma reclamação de cliente (código REC-0001…) com canal, data de recebimento, assunto e a fonte original obrigatória. A mesma fonte no mesmo canal não é duplicada.", { consequences: ["Registrar a reclamação não abre RNC nem garantia automaticamente."] }),
  field("qualidade.reclamacoes.campo-canal", "Campo Canal", "Por onde a reclamação chegou: e-mail do cliente, e-mail AXION, telefone, portal, presencial ou outro."),
  field("qualidade.reclamacoes.campo-recebida-em", "Campo Recebida em", "Data e hora em que a AXION recebeu a reclamação. Obrigatória."),
  field("qualidade.reclamacoes.campo-reclamante", "Campo Reclamante", "Nome de quem reclamou. Opcional; sem nome fica SEM DADOS."),
  field("qualidade.reclamacoes.campo-assunto", "Campo Assunto", "Resumo da reclamação (3 a 300 caracteres)."),
  col("qualidade.reclamacoes.col-codigo", "Coluna Código da reclamação", "Código sequencial da reclamação no projeto (REC-0001…).", "quality_customer_complaints.code"),
  col("qualidade.reclamacoes.col-canal", "Coluna Canal", "Canal pelo qual a reclamação foi recebida.", "quality_customer_complaints.channel"),
  col("qualidade.reclamacoes.col-assunto", "Coluna Assunto e reclamante", "Assunto da reclamação e, abaixo, o reclamante quando informado.", "quality_customer_complaints.subject e complainant"),
  col("qualidade.reclamacoes.col-recebida", "Coluna Recebida em", "Data e hora de recebimento.", "quality_customer_complaints.received_at"),
  col("qualidade.reclamacoes.col-status", "Coluna Status da reclamação", "Situação: recebida, em análise, procedente, improcedente ou encerrada.", "quality_customer_complaints.status"),
  col("qualidade.reclamacoes.col-fonte", "Coluna Fonte original da reclamação", "Referência e link do original (e-mail, protocolo).", "quality_customer_complaints.source_ref e source_url"),
  col("qualidade.reclamacoes.col-rnc", "Coluna RNC da reclamação", "RNC vinculada à reclamação, com link.", "quality_customer_complaints.ncr_id"),

  // ---- ensaios
  def("qualidade.ensaios.lista", "table", "Lista de ensaios e laudos", "Ensaios do projeto com código, tipo, resultado, laudo de origem, laboratório e amostra, e RNC vinculada.", { source: "quality_tests", refresh: REFRESH, missingData: "Sem ensaio, exibe SEM DADOS." }),
  form("qualidade.ensaios.form-criar", "Formulário Novo ensaio", "Registra um ensaio (código ENS-0001…). Resultado aprovado ou reprovado exige o laudo ou relatório de origem; sem laudo só são aceitos pendente ou inconclusivo."),
  field("qualidade.ensaios.campo-tipo", "Campo Tipo de ensaio", "Nome do ensaio realizado (por exemplo, resistência à compressão). Mínimo de 2 caracteres."),
  field("qualidade.ensaios.campo-laboratorio", "Campo Laboratório", "Laboratório responsável pelo ensaio. Opcional; sem informação fica SEM DADOS."),
  field("qualidade.ensaios.campo-amostra", "Campo Amostra", "Identificação da amostra ensaiada. Opcional; sem informação fica SEM DADOS."),
  field("qualidade.ensaios.campo-realizado", "Campo Ensaio realizado em", "Data e hora do ensaio. Opcional; sem data fica SEM DADOS."),
  field("qualidade.ensaios.campo-resultado", "Campo Resultado do ensaio", "Pendente, aprovado, reprovado ou inconclusivo. Aprovado e reprovado exigem o laudo de origem (regra do banco)."),
  field("qualidade.ensaios.campo-laudo", "Campo Laudo / relatório", "Referência do laudo que sustenta o resultado. Obrigatória em resultado conclusivo (aprovado ou reprovado)."),
  field("qualidade.ensaios.campo-laudo-url", "Campo Link do laudo", "Endereço http/https do laudo, quando houver. Opcional."),
  col("qualidade.ensaios.col-codigo", "Coluna Código do ensaio", "Código sequencial do ensaio no projeto (ENS-0001…).", "quality_tests.code"),
  col("qualidade.ensaios.col-tipo", "Coluna Ensaio", "Tipo de ensaio e data de realização.", "quality_tests.test_type e performed_at"),
  col("qualidade.ensaios.col-resultado", "Coluna Resultado do ensaio", "Resultado registrado do ensaio.", "quality_tests.result"),
  col("qualidade.ensaios.col-laudo", "Coluna Laudo (fonte)", "Referência e link do laudo de origem.", "quality_tests.report_ref e report_url"),
  col("qualidade.ensaios.col-laboratorio", "Coluna Laboratório / amostra", "Laboratório e amostra do ensaio; SEM DADOS quando não informados.", "quality_tests.laboratory e sample_ref"),
  col("qualidade.ensaios.col-rnc", "Coluna RNC do ensaio", "RNC vinculada ao ensaio, com link.", "quality_tests.ncr_id"),

  // ---- requisitos
  def("qualidade.requisitos.lista", "table", "Lista de requisitos técnicos", "Requisitos técnicos do projeto com código, título e fonte (norma, projeto, especificação, contrato).", { source: "quality_requirements", refresh: REFRESH, missingData: "Sem requisito, exibe SEM DADOS." }),
  form("qualidade.requisitos.form-criar", "Formulário Novo requisito", "Registra um requisito técnico (código REQ-0001…). A fonte é obrigatória: o sistema não aceita requisito sem origem identificável.", { limitations: ["O sistema não valida o conteúdo normativo: confira a edição e a vigência da norma na fonte."] }),
  field("qualidade.requisitos.campo-fonte", "Campo Fonte do requisito", "Norma, projeto, especificação ou cláusula contratual de onde o requisito vem. Obrigatório; indique edição e item quando existirem."),
  col("qualidade.requisitos.col-codigo", "Coluna Código do requisito", "Código sequencial do requisito no projeto (REQ-0001…).", "quality_requirements.code"),
  col("qualidade.requisitos.col-titulo", "Coluna Requisito", "Título e, abaixo, a descrição do requisito.", "quality_requirements.title e description"),
  col("qualidade.requisitos.col-fonte", "Coluna Fonte do requisito", "Referência e link da fonte do requisito.", "quality_requirements.source_ref e source_url"),

  // ---- CAPA
  def("qualidade.capa.lista", "table", "Lista de ações (CAPA)", "Ações de contenção, corretivas e preventivas do projeto com RNC, tipo, descrição, prazo (com marca VENCIDA quando o prazo passou e a ação não foi executada) e status.", { source: "quality_corrective_actions", refresh: REFRESH, missingData: "Sem ação, exibe SEM DADOS; ação sem prazo exibe SEM DADOS e não é marcada como vencida." }),
  def("qualidade.capa.secao-rnc", "message", "Ações da RNC", "Ações (CAPA) desta RNC. Plano de ação exige ao menos uma ação não cancelada; verificação e encerramento exigem todas executadas ou canceladas. Ação executada não equivale a RNC conforme.", { source: "quality_corrective_actions" }),
  form("qualidade.capa.form-criar", "Formulário Registrar ação (CAPA)", "Registra uma ação de contenção, corretiva ou preventiva na RNC, com descrição e prazo opcional. Nasce PLANEJADA."),
  field("qualidade.capa.campo-tipo", "Campo Tipo da ação", "Contenção (limita o dano agora), corretiva (elimina a causa da não conformidade) ou preventiva (evita ocorrência futura)."),
  field("qualidade.capa.campo-prazo", "Campo Prazo da ação", "Data-limite da ação. Sem prazo, a ação não entra no indicador de ações vencidas."),
  field("qualidade.capa.campo-descricao", "Campo Descrição da ação", "O que será feito (3 a 4000 caracteres). Seja específico: o que, onde e como se verificará."),
  col("qualidade.capa.col-rnc", "Coluna RNC da ação", "RNC à qual a ação pertence, com link.", "quality_corrective_actions.ncr_id"),
  col("qualidade.capa.col-tipo", "Coluna Tipo da ação", "Contenção, corretiva ou preventiva.", "quality_corrective_actions.kind"),
  col("qualidade.capa.col-descricao", "Coluna Ação", "Descrição da ação registrada.", "quality_corrective_actions.description"),
  col("qualidade.capa.col-prazo", "Coluna Prazo da ação", "Prazo da ação e marca VENCIDA quando passou sem execução.", "quality_corrective_actions.due_date"),
  col("qualidade.capa.col-status", "Coluna Status da ação", "Planejada, em andamento, executada ou cancelada.", "quality_corrective_actions.status"),
  col("qualidade.capa.col-atualizar", "Coluna Atualizar status", "Muda o status da ação enviando a versão lida (conflito de versão se alguém alterou antes). Executada grava a data de execução.", "quality_corrective_actions (UPDATE sob RLS)"),

  // ---- eficácia
  def("qualidade.eficacia.lista", "table", "Lista de verificações de eficácia", "Verificações registradas, da mais recente para a mais antiga, com RNC, resultado, critério e data. São append-only: nenhuma é editada ou apagada.", { source: "quality_effectiveness_verifications", refresh: REFRESH, missingData: "Sem verificação, exibe SEM DADOS." }),
  def("qualidade.eficacia.secao-rnc", "message", "Verificação de eficácia da RNC", "Verificações desta RNC. Para encerrar, a última precisa ser EFICAZ, com evidência, e posterior ao último ciclo de correção ou reabertura; do contrário o banco bloqueia o encerramento.", { source: "quality_effectiveness_verifications", humanReview: "Julgar a eficácia é decisão humana de gestão." }),
  form("qualidade.eficacia.form-criar", "Formulário Registrar verificação de eficácia", "Registra uma verificação (eficaz, ineficaz ou parcial) com critério e evidência obrigatória. Guarda a marca do último evento de estado para detectar verificação desatualizada após nova correção ou reabertura.", { permissions: PERM_MANAGE }),
  field("qualidade.eficacia.campo-resultado", "Campo Resultado da verificação", "Eficaz (a causa foi eliminada), ineficaz (o problema persiste) ou parcial. Só EFICAZ libera o encerramento.", { permissions: PERM_MANAGE }),
  field("qualidade.eficacia.campo-evidencia", "Campo Evidência da verificação", "Evidência da RNC que comprova o resultado verificado. Obrigatória: verificação sem evidência não é aceita.", { permissions: PERM_MANAGE }),
  field("qualidade.eficacia.campo-criterio", "Campo Critério de verificação", "Critério objetivo usado para julgar a eficácia (mínimo de 5 caracteres), por exemplo ensaio repetido, inspeção após prazo ou ausência de recorrência.", { permissions: PERM_MANAGE }),
  col("qualidade.eficacia.col-rnc", "Coluna RNC da verificação", "RNC verificada, com link.", "quality_effectiveness_verifications.ncr_id"),
  col("qualidade.eficacia.col-resultado", "Coluna Resultado da verificação", "Resultado da verificação (eficaz, ineficaz, parcial).", "quality_effectiveness_verifications.result"),
  col("qualidade.eficacia.col-criterio", "Coluna Critério", "Critério usado na verificação.", "quality_effectiveness_verifications.criteria"),
  col("qualidade.eficacia.col-data", "Coluna Verificada em", "Data e hora da verificação.", "quality_effectiveness_verifications.verified_at"),

  // ---- recorrências
  def("qualidade.recorrencias.lista", "table", "Lista de recorrências", "Relações de recorrência entre RNC do projeto, com fundamento e data de detecção.", { source: "quality_recurrences", refresh: REFRESH, missingData: "Sem recorrência, exibe SEM DADOS." }),
  def("qualidade.recorrencias.secao-rnc", "message", "Recorrências da RNC", "Outras RNC relacionadas a esta como recorrência, com o fundamento escrito por quem registrou.", { source: "quality_recurrences" }),
  form("qualidade.recorrencias.form-criar", "Formulário Registrar recorrência", "Liga esta RNC a outra do mesmo projeto como recorrência, com fundamento. Uma RNC não pode ser recorrência dela mesma."),
  field("qualidade.recorrencias.campo-relacionada", "Campo RNC relacionada", "RNC anterior ou semelhante da qual esta é recorrência. Só RNC do mesmo projeto."),
  field("qualidade.recorrencias.campo-fundamento", "Campo Fundamento da recorrência", "Por que se trata de recorrência (mínimo de 5 caracteres): mesmo serviço, mesma causa, mesmo local. Escreva o critério, não a conclusão."),
  col("qualidade.recorrencias.col-rnc", "Coluna RNC da recorrência", "RNC em que a recorrência foi registrada.", "quality_recurrences.ncr_id"),
  col("qualidade.recorrencias.col-relacionada", "Coluna Relacionada a", "RNC relacionada (anterior ou semelhante).", "quality_recurrences.related_ncr_id"),
  col("qualidade.recorrencias.col-fundamento", "Coluna Fundamento da recorrência", "Fundamento registrado para a recorrência.", "quality_recurrences.basis"),
  col("qualidade.recorrencias.col-detectada", "Coluna Detectada em", "Data e hora do registro da recorrência.", "quality_recurrences.detected_at"),

  // ---- custos
  def("qualidade.custos.lista", "table", "Lista de custos de não qualidade", "Custos ligados às RNC por categoria, com valores estimado e realizado separados e a fonte do valor. Valor sem fonte não é aceito.", { source: "quality_nonquality_costs", refresh: REFRESH, missingData: "Sem custo, ou custo sem valor, exibe SEM DADOS." }),
  kpi("qualidade.custos.kpi-realizado", "KPI Total realizado (com fonte)", "Soma dos valores realizados dos custos que têm fonte. Não soma valores de moedas diferentes e nunca soma estimado com realizado.", "soma de actual_amount dos custos com source_ref preenchido", "quality_nonquality_costs.actual_amount e source_ref", "reais (R$), acumulado do projeto", "Sem nenhum valor realizado com fonte, ou com moedas mistas: SEM DADOS."),
  kpi("qualidade.custos.kpi-estimado", "KPI Total estimado (com fonte)", "Soma dos valores estimados dos custos que têm fonte. É uma estimativa registrada por pessoas, não um cálculo do sistema.", "soma de estimated_amount dos custos com source_ref preenchido", "quality_nonquality_costs.estimated_amount e source_ref", "reais (R$), acumulado do projeto", "Sem nenhum valor estimado com fonte, ou com moedas mistas: SEM DADOS."),
  def("qualidade.custos.secao-rnc", "message", "Custos da RNC", "Custos de não qualidade ligados a esta RNC, com estimado, realizado e fonte.", { source: "quality_nonquality_costs" }),
  form("qualidade.custos.form-criar", "Formulário Registrar custo", "Registra um custo de não qualidade na RNC. Se houver valor (estimado ou realizado), a fonte é obrigatória; sem valor o custo fica SEM DADOS."),
  field("qualidade.custos.campo-categoria", "Campo Categoria do custo", "Retrabalho, material, mão de obra, multa, garantia, perda de prazo ou outro."),
  field("qualidade.custos.campo-fonte", "Campo Fonte do valor", "Documento que sustenta o valor (nota fiscal, orçamento, medição, ordem de serviço). Obrigatória quando há valor."),
  field("qualidade.custos.campo-estimado", "Campo Valor estimado", "Valor estimado em reais (por exemplo 1500,00). Opcional; deixe vazio quando não houver estimativa fundamentada."),
  field("qualidade.custos.campo-real", "Campo Valor realizado", "Valor efetivamente gasto em reais. Opcional; deixe vazio quando ainda não houver."),
  col("qualidade.custos.col-rnc", "Coluna RNC do custo", "RNC à qual o custo pertence, com link.", "quality_nonquality_costs.ncr_id"),
  col("qualidade.custos.col-categoria", "Coluna Categoria", "Categoria do custo de não qualidade.", "quality_nonquality_costs.category"),
  col("qualidade.custos.col-estimado", "Coluna Estimado", "Valor estimado em reais; SEM DADOS quando não informado.", "quality_nonquality_costs.estimated_amount"),
  col("qualidade.custos.col-real", "Coluna Realizado", "Valor realizado em reais; SEM DADOS quando não informado.", "quality_nonquality_costs.actual_amount"),
  col("qualidade.custos.col-fonte", "Coluna Fonte do valor", "Fonte que sustenta o valor.", "quality_nonquality_costs.source_ref"),

  // ---- auditoria
  def("qualidade.auditoria.linha-do-tempo", "table", "Linha do tempo de auditoria", "Eventos de estado das RNC e registros de auditoria do módulo, do mais recente para o mais antigo (até 300 linhas). Somente leitura: eventos de estado e auditoria são append-only no banco.", { source: "quality_state_events e audit_log_entries (ação QUALITY_*)", refresh: REFRESH, missingData: "Sem evento, exibe SEM DADOS. Garantias e assistência técnica ficam fora desta lista.", permissions: PERM_READ }),
  col("qualidade.auditoria.col-quando", "Coluna Quando", "Data e hora do evento.", "quality_state_events.occurred_at e audit_log_entries.occurred_at"),
  col("qualidade.auditoria.col-tipo", "Coluna Tipo do evento", "Estado (mudança na máquina de estados) ou Auditoria (criação ou alteração de registro).", "quality_state_events e audit_log_entries"),
  col("qualidade.auditoria.col-evento", "Coluna Evento", "Descrição do evento, com a RNC quando aplicável.", "quality_state_events.from_state e to_state; audit_log_entries.action"),
  col("qualidade.auditoria.col-ator", "Coluna Quem", "Pessoa que executou o evento (nome do cadastro) ou Sistema.", "quality_state_events.actor_user_id e audit_log_entries.actor_user_id"),
  col("qualidade.auditoria.col-justificativa", "Coluna Justificativa", "Justificativa informada na transição de estado, quando houve.", "quality_state_events.justification"),
];
