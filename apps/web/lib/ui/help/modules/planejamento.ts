// Catálogo de ajuda do módulo "planejamento" — arquivo EXCLUSIVO do agente/módulo (não editar em outros módulos).
// Regras de conteúdo: ver lib/ui/help/types.ts. Ids novos: "modulo.tela.elemento".
// Escopo: Ações e Escalonamentos (SLA), configuração da Matriz, alertas de risco (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA),
// páginas de resposta por e-mail, reemissão de alertas, providências, solicitações, Ledger de eventos, lotes de alertas e Timeline.
// Tudo descreve o que o CÓDIGO faz hoje (lib/sla, lib/risk-alerts, lib/delivery, app/**). O que não foi localizado vira `gap` no manifesto.
import type { FeatureHelpDefinition } from "../types";

const VERSION = "2026-11-20";
const MODULE = "planejamento";

function def(d: Omit<FeatureHelpDefinition, "version" | "module">): FeatureHelpDefinition {
  return { ...d, module: MODULE, version: VERSION };
}

// Vigência dos prazos de SLA: aprovados x configuração operacional publicada (nunca apresentar a regra não publicada como ativa).
const SLA_VALIDITY =
  "Prazos APROVADOS (prazo para assumir): CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis. " +
  "A configuração operacional publicada hoje ainda mantém MÉDIO 1 dia útil e BAIXO 3 dias úteis nas regras gravadas por obra e na função de banco que calcula o padrão; " +
  "a migration 20261121177000 (que corrige MÉDIO e BAIXO) NÃO foi aplicada em produção. Até ser aplicada, o que vale para uma obra é o valor gravado na Matriz dela. " +
  "A correção vale só para ações NOVAS: ações já criadas nunca são recalculadas.";

const IMMEDIATE_NOTE =
  "ALTO e CRÍTICO são tratados como alertas imediatos com escalonamento por prazo; MÉDIO e BAIXO entram no resumo semanal consolidado.";

export const PLANEJAMENTO_HELP: FeatureHelpDefinition[] = [
  // =====================================================================================================================
  // /[projectId]/acoes — Ações e Escalonamentos
  // =====================================================================================================================
  def({
    id: "planejamento.acoes.pagina",
    kind: "page",
    title: "Ações e Escalonamentos",
    shortDescription: "Ações com prazo de SLA, responsável e escalonamento Nível 1, 2 e 3 deste projeto.",
    description:
      "Tela de acompanhamento das ações com prazo de SLA do projeto: quem é o responsável, até quando precisa assumir ou concluir e em que nível de escalonamento a ação está (Nível 1 Responsável, Nível 2 Gerência, Nível 3 Diretoria).",
    purpose: "Dar visibilidade e permitir a operação das ações: assumir, registrar que está estudando a solução, concluir com observação, encaminhar a outra pessoa e verificar escalonamentos.",
    howToUse: [
      "Use a aba Ações abertas para tratar cada ação; Visão gerencial para filtrar e contar; Histórico para consultar o que foi concluído ou cancelado.",
      "A aba Nova ação só aparece para o ADMINISTRADOR do projeto.",
      "Ações originadas de alertas de risco são tratadas na página do próprio alerta, não aqui.",
    ],
    howItWorks:
      "A página lê as ações (sla_actions) e os escalonamentos já registrados do projeto. A divisão entre abertas e histórico é pelo status: Concluída e Cancelada vão ao Histórico; as demais ficam em Ações abertas. Os prazos de cada ação são gravados na criação a partir da Matriz de SLA do projeto.",
    source: "Tabelas sla_actions e sla_action_escalations do projeto; vínculo com alertas de risco em risk_alert_cases.sla_action_id.",
    refresh: "Lida a cada abertura da página; não há atualização automática em tela.",
    missingData: "Sem ações a lista mostra a mensagem de vazio; responsável ausente aparece como não atribuído e prazo ausente como traço.",
    permissions:
      "Qualquer membro do projeto vê a página. Operar uma ação (assumir, estudar, concluir, encaminhar) exige ser o responsável da ação ou ADMINISTRADOR, e nunca o perfil LEITURA; o banco revalida. Criar ação e abrir a Matriz exigem ADMINISTRADOR.",
    limitations: ["A tela não recalcula SLA nem altera prazos gravados.", "Decisão de encerrar uma ação é sempre humana."],
    humanReview: "Assumir, concluir e encaminhar são decisões humanas registradas com autor e data; nenhuma IA decide por esta tela.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes.verificar-escalonamentos",
    kind: "button",
    title: "Verificar escalonamentos",
    shortDescription: "Roda o motor de prazos e escala as ações abertas cujo prazo venceu.",
    description:
      "Dispara manualmente a varredura do motor determinístico de escalonamento sobre as ações abertas do projeto: para cada ação cujo prazo venceu, registra a subida de nível e notifica conforme a Matriz.",
    purpose: "Antecipar a verificação de prazos sem esperar o ciclo automático, útil logo após ajustar a Matriz ou os responsáveis.",
    howToUse: ["Clique em Verificar escalonamentos.", "O resultado mostra quantas ações foram escaladas ou a mensagem de erro."],
    howItWorks:
      "Para cada ação aberta o motor (lib/sla/compute-escalation.ts) compara a data atual com os prazos gravados: prazo de assumir vencido sobe para o Nível 2 (Gerência); depois do prazo do Nível 2 sobe para o Nível 3 (Diretoria); depois do prazo da Diretoria registra o limite de escalonamento atingido, sem novo destinatário. Prazo contratual perdido leva à Diretoria e prazo contratual a 24 horas ou menos leva ao Nível 2. Nenhuma IA decide: é aritmética sobre datas. Ações encerradas nunca são escaladas.",
    criteria: ["Considera só ações abertas (não concluídas nem canceladas).", "E-mail só sai quando a regra da Matriz marca notificar por e-mail e há destinatário definido."],
    consequences: ["Cada subida de nível é gravada com motivo e destinatário (aparece no histórico da ação).", "Pode enviar e-mail ao destinatário do novo nível."],
    permissions: "Botão exibido a qualquer membro do projeto; o banco valida a permissão da chamada de escalonamento.",
    limitations: ["Para ações de alerta de risco a entrega do e-mail passa pela fila comum de alertas, sem duplicar o envio.", "Não existe agendador próprio desta tela: o botão é um gatilho manual."],
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes.matriz-link",
    kind: "admin-action",
    title: "Matriz de responsabilidades e prazos",
    shortDescription: "Abre a configuração dos prazos de SLA e dos responsáveis por área (ADMINISTRADOR).",
    description:
      "Atalho para a seção Matriz de responsabilidades e prazos da tela de Usuários, onde o administrador define quem responde em cada área e os prazos por nível de risco.",
    purpose: "Chegar rapidamente ao ponto onde se altera o SLA do projeto.",
    howToUse: ["Clique no botão (só aparece para o ADMINISTRADOR)."],
    permissions: "Exibido apenas ao ADMINISTRADOR do projeto.",
    limitations: ["O botão só navega; nada é alterado ao clicar."],
  }),
  def({
    id: "planejamento.acoes.risco-badge",
    kind: "status",
    title: "Criticidade da ação",
    shortDescription: "Nível de risco da ação (Baixo, Médio, Alto, Crítico) que define os prazos do SLA.",
    description:
      "Selo com o nível de risco da ação. É ele que escolhe a regra de prazos da Matriz de SLA do projeto: quanto mais crítico, mais curto o prazo para assumir.",
    purpose: "Mostrar a prioridade de tratamento e qual regra de prazo se aplica.",
    criteria: [
      "Prazo para assumir aprovado: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis.",
      IMMEDIATE_NOTE,
      "Os valores efetivos de cada obra são os gravados na Matriz do projeto (tela de configuração).",
    ],
    howItWorks: "O nível é gravado na criação da ação (campo risk_level) e a regra de prazos é resolvida por risco e área; sem regra do projeto vale o padrão do código.",
    source: "sla_actions.risk_level e regra resolvida de sla_matrix_rules (lib/sla/resolve-matrix-rule.ts).",
    missingData: "Não há nível padrão silencioso: toda ação nasce com um nível informado.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes.status-badge",
    kind: "status",
    title: "Situação da ação",
    shortDescription: "Pendente, Assumida, Estudando solução, Vencida, Escalada, Concluída ou Cancelada.",
    description:
      "Selo com a situação atual da ação no fluxo: Pendente (ainda não assumida), Assumida, Estudando solução, Vencida, Escalada, Concluída ou Cancelada.",
    purpose: "Indicar em que etapa do tratamento a ação está e se exige atenção imediata.",
    criteria: [
      "Assumir Ação registra a ciência e passa a Assumida.",
      "Estudando solução passa de Assumida para Estudando solução.",
      "Concluir Ação exige observação e passa a Concluída.",
      "Escalada é gravada quando o motor de prazos sobe o nível da ação.",
      "Concluída e Cancelada saem de Ações abertas e vão ao Histórico.",
    ],
    source: "sla_actions.status.",
    limitations: ["O status Vencida é lido do registro; esta tela não o recalcula (o tempo restante é calculado à parte na Visão gerencial)."],
  }),
  def({
    id: "planejamento.acoes.nivel-badge",
    kind: "status",
    title: "Nível de escalonamento atual",
    shortDescription: "Em qual nível a ação está: Responsável, Gerência ou Diretoria.",
    description:
      "Mostra o nível hierárquico que responde pela ação agora: Nível 1 Responsável, Nível 2 Gerência ou Nível 3 Diretoria. O rótulo Nível legado Escalão 2 só aparece em registros históricos.",
    purpose: "Saber quem está cobrado pela ação neste momento.",
    howItWorks:
      "A cadeia é única: Responsável, depois Gerência (Nível 2) quando o prazo para assumir ou concluir vence, depois Diretoria (Nível 3) quando vence também o prazo do Nível 2. Se o Nível 2 não estiver definido na Matriz, o escalonamento vai direto ao Nível 3.",
    source: "sla_actions.current_escalation_level.",
    limitations: ["Nunca é criado novo registro no nível legado; ele só existe em dados históricos."],
  }),
  def({
    id: "planejamento.acoes.prazos",
    kind: "status",
    title: "Prazos da ação",
    shortDescription: "Prazo para assumir, para concluir e prazo contratual quando houver.",
    description:
      "Datas-limite gravadas na ação: prazo para assumir, prazo para concluir (quando a regra da Matriz define) e prazo contratual (informado na criação). Quando a ação é assumida, passa a valer o prazo para concluir.",
    purpose: "Mostrar até quando cada etapa precisa acontecer antes de a ação ser escalada.",
    howItWorks:
      "Os prazos são calculados na criação da ação por lib/sla/compute-deadlines.ts usando a unidade de tempo da Matriz (horas úteis, dias úteis ou horas corridas), o fuso e o expediente do projeto, e os feriados do calendário configurado. Depois de gravados não mudam por alteração posterior da Matriz.",
    source: "sla_actions.assume_due_at, complete_due_at e contractual_deadline; regra de sla_matrix_rules; configuração de fuso em sla_project_settings.",
    missingData: "Prazo para concluir e prazo contratual só aparecem quando existem; não são estimados.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes.escalonamentos-historico",
    kind: "message",
    title: "Histórico de escalonamentos",
    shortDescription: "Linhas que registram cada subida de nível da ação, com motivo e destinatário.",
    description:
      "Lista cada vez que a ação subiu de nível: quando, de que nível para qual, quem foi notificado e o motivo (por exemplo, não assumida no prazo, não concluída no prazo, prazo contratual próximo ou perdido).",
    purpose: "Dar rastreabilidade ao porquê e a quem a ação foi escalada.",
    source: "sla_action_escalations.",
    missingData: "Sem escalonamento, nada é exibido.",
  }),
  def({
    id: "planejamento.acoes.aviso-alerta-risco",
    kind: "message",
    title: "Ação de alerta de risco",
    shortDescription: "Esta ação pertence a um alerta de risco e deve ser tratada pela página do alerta.",
    description:
      "Quando a ação nasceu de um alerta de risco, os botões de assumir, concluir e encaminhar não são oferecidos aqui: o caso e a ação SLA só mudam juntos, pela página do alerta, que exige evidências quando aplicável.",
    purpose: "Evitar tratamento duplicado e manter o caso e a ação sincronizados.",
    howToUse: ["Clique em Registre o tratamento pela página do alerta."],
    consequences: ["O banco recusaria o tratamento direto por esta tela."],
  }),
  def({
    id: "planejamento.acoes.assumir",
    kind: "button",
    title: "Assumir Ação",
    shortDescription: "Registra que você assumiu a ação e para a cobrança do prazo de assumir.",
    description:
      "Registra a ciência e a responsabilidade pela ação. Depois de assumida, o prazo que passa a valer é o de concluir (quando a Matriz o define).",
    purpose: "Marcar formalmente que alguém está tratando a ação.",
    howToUse: ["Clique em Assumir Ação (visível só ao responsável enquanto a ação não foi assumida)."],
    consequences: ["Grava a data e o autor da ciência.", "Remove o gatilho de não assumida no prazo para esta ação."],
    permissions: "Responsável da ação ou ADMINISTRADOR; nunca LEITURA. O banco revalida.",
    humanReview: "Ato humano registrado com autor e data.",
  }),
  def({
    id: "planejamento.acoes.estudando-solucao",
    kind: "button",
    title: "Estudando solução",
    shortDescription: "Marca a ação assumida como em estudo da solução.",
    description:
      "Registra que a ação já foi assumida e que o responsável está estudando a solução. Não conclui a ação e não altera prazos.",
    purpose: "Dar visibilidade de que a ação está em andamento.",
    howToUse: ["Disponível apenas para o responsável com a ação já Assumida."],
    consequences: ["O status passa a Estudando solução."],
    permissions: "Responsável da ação ou ADMINISTRADOR; nunca LEITURA.",
  }),
  def({
    id: "planejamento.acoes.concluir",
    kind: "button",
    title: "Concluir Ação",
    shortDescription: "Conclui a ação registrando o que foi feito.",
    description:
      "Encerra a ação como Concluída gravando a observação de conclusão, a data e o autor. Para risco Alto ou Crítico recomenda-se detalhar a evidência na observação.",
    purpose: "Fechar a ação com registro auditável do tratamento.",
    howToUse: ["Preencha a Observação de conclusão (obrigatória).", "Clique em Concluir Ação."],
    consequences: ["A ação vai para o Histórico e deixa de ser escalada."],
    permissions: "Responsável da ação ou ADMINISTRADOR; nunca LEITURA.",
    humanReview: "A conclusão é decisão humana; nenhuma IA conclui ações.",
  }),
  def({
    id: "planejamento.acoes.observacao-conclusao",
    kind: "field",
    title: "Observação de conclusão",
    shortDescription: "Texto obrigatório com o que foi feito para concluir a ação.",
    description:
      "Campo de texto obrigatório que fica gravado como nota de conclusão da ação. Descreva a providência executada e, em risco Alto ou Crítico, a evidência que a sustenta.",
    purpose: "Permitir auditar depois por que a ação foi encerrada.",
    howToUse: ["Descreva objetivamente o que foi feito."],
    missingData: "Sem observação o envio é bloqueado.",
  }),
  def({
    id: "planejamento.acoes.encaminhar",
    kind: "button",
    title: "Encaminhar",
    shortDescription: "Transfere a responsabilidade da ação a outro membro ativo do projeto.",
    description:
      "Troca o responsável da ação por outro membro ativo (que não seja somente leitura). O direcionamento mantém os prazos e o escalonamento originais: nada é reiniciado.",
    purpose: "Repassar a ação a quem deve tratá-la sem perder o histórico de prazos.",
    howToUse: ["Escolha o novo responsável em Encaminhar para.", "Informe o Motivo (obrigatório, mínimo de 5 caracteres, para quem não é ADMINISTRADOR).", "Clique em Encaminhar."],
    consequences: ["O novo responsável passa a ser cobrado pelo mesmo prazo original."],
    permissions: "Responsável da ação ou ADMINISTRADOR; o banco revalida e recusa destinos inválidos.",
  }),
  def({
    id: "planejamento.acoes.encaminhar-para",
    kind: "field",
    title: "Encaminhar para",
    shortDescription: "Lista de membros ativos que podem receber a ação.",
    description:
      "Seletor com os membros ativos do projeto que não são somente leitura, exceto o responsável atual. A escolha define o novo responsável da ação.",
    howToUse: ["Selecione a pessoa; é obrigatório."],
    criteria: ["Só membros ACTIVE e sem perfil LEITURA são oferecidos; o banco confere de novo."],
  }),
  def({
    id: "planejamento.acoes.encaminhar-motivo",
    kind: "field",
    title: "Motivo do encaminhamento",
    shortDescription: "Por que esta pessoa deve tratar a ação (obrigatório, mínimo 5 caracteres, exceto ADMINISTRADOR).",
    description:
      "Justificativa registrada com o encaminhamento. É obrigatória e precisa ter ao menos 5 caracteres para quem não é ADMINISTRADOR; para o administrador é opcional.",
    howToUse: ["Explique em poucas palavras por que o novo responsável é o indicado."],
    missingData: "Sem motivo, o encaminhamento de quem não é administrador é bloqueado.",
  }),
  def({
    id: "planejamento.acoes.acoes-via-email",
    kind: "table",
    title: "Ações via e-mail",
    shortDescription: "Histórico das respostas dadas por e-mail ao alerta (ciência, assumir, prazo, resposta).",
    description:
      "Painel que lista o que foi feito a partir dos botões do e-mail acionável vinculados a esta ação ou evento: DAR CIÊNCIA, ASSUMIR RESPONSABILIDADE, DEFINIR PRAZO e RESPONDER AO ACC, com autor, data e comentário.",
    purpose: "Dar rastreabilidade às respostas por e-mail, já que a ação SLA não tem tabela de comentários própria.",
    source: "Registros das ações de e-mail confirmadas (lib/email-actions).",
    missingData: "Sem registros, o painel não lista nada.",
  }),

  // ---- Nova ação (somente ADMINISTRADOR)
  def({
    id: "planejamento.acoes.nova-titulo",
    kind: "field",
    title: "Título da ação",
    shortDescription: "Nome curto e objetivo da ação a ser criada.",
    description: "Texto obrigatório que identifica a ação nas listas, no resumo semanal e nos e-mails.",
    howToUse: ["Descreva o que precisa ser feito, por exemplo responder uma notificação do cliente."],
    missingData: "Obrigatório; sem título a criação é bloqueada.",
  }),
  def({
    id: "planejamento.acoes.nova-area",
    kind: "field",
    title: "Área responsável",
    shortDescription: "Área que responde pela ação: define o responsável e a cadeia de escalonamento.",
    description:
      "Seleciona a área da ação (Diretoria, Administrativo, Comercial, Financeiro, Engenharia, Orçamento, Jurídico, Planejamento ou ESG/SSMA). A área determina quem é o responsável direto e quem recebe o escalonamento, conforme a Matriz de responsáveis.",
    howToUse: ["Escolha a área; o padrão é Engenharia."],
    consequences: ["Sem responsável definido para a área na Matriz, a ação fica sem responsável atribuído."],
  }),
  def({
    id: "planejamento.acoes.nova-risco",
    kind: "field",
    title: "Nível de risco da nova ação",
    shortDescription: "Baixo, Médio, Alto ou Crítico: define os prazos de SLA da ação.",
    description:
      "Escolhe o nível de risco, que seleciona a regra de prazos da Matriz de SLA do projeto. O padrão é Médio.",
    criteria: ["Prazos aprovados para assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis."],
    consequences: ["Define o prazo para assumir e os intervalos de escalonamento da ação criada."],
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes.nova-prazo-contratual",
    kind: "field",
    title: "Prazo contratual (opcional)",
    shortDescription: "Data limite do contrato; prazo perdido ou próximo (24 horas) escala a ação.",
    description:
      "Data e hora contratual opcional. É um gatilho independente dos prazos internos: faltando 24 horas ou menos a ação sobe ao Nível 2; depois de perdido sobe à Diretoria.",
    howToUse: ["Preencha apenas quando houver um prazo contratual real."],
    missingData: "Em branco, nenhum gatilho contratual é aplicado.",
  }),
  def({
    id: "planejamento.acoes.nova-descricao",
    kind: "field",
    title: "Descrição da ação",
    shortDescription: "Detalhe da ação, exibido no cartão e no tooltip da Visão gerencial.",
    description: "Texto livre opcional com o contexto da ação. Aparece no cartão da ação e ao passar o mouse sobre o título na Visão gerencial.",
    howToUse: ["Inclua o que precisa ser entregue e referências úteis."],
  }),
  def({
    id: "planejamento.acoes.criar-acao",
    kind: "button",
    title: "Criar ação",
    shortDescription: "Cria a ação manual já sujeita à Matriz de SLA do projeto.",
    description:
      "Cria a ação com origem Manual. Os prazos de assumir e concluir são calculados na criação pela Matriz do projeto e a ação passa a ser escalada se vencer.",
    consequences: ["A ação aparece em Ações abertas e passa a ser cobrada pelo SLA.", "Prazos gravados na criação não são recalculados depois."],
    permissions: "Somente ADMINISTRADOR do projeto.",
    humanReview: "Criação manual é decisão humana.",
    validity: SLA_VALIDITY,
  }),

  // ---- Visão gerencial: KPIs
  def({
    id: "planejamento.acoes.kpi-total",
    kind: "kpi",
    title: "Total de ações",
    shortDescription: "Quantidade de ações que atendem aos filtros da Visão gerencial.",
    description: "Conta todas as ações do projeto (abertas e encerradas) depois de aplicados os filtros da tela.",
    formula: "Quantidade de ações do projeto que passam por todos os filtros marcados (risco, status, área, responsável, escalão); sem filtro, todas as ações.",
    source: "sla_actions do projeto, carregadas na abertura da página.",
    unit: "Número de ações, posição atual (sem período).",
    refresh: "A cada abertura da página; recalculado na hora ao mudar os filtros.",
    missingData: "Sem ações o valor é 0 porque nada existe a contar; não indica falha de dado.",
  }),
  def({
    id: "planejamento.acoes.kpi-vencidas",
    kind: "kpi",
    title: "Vencidas",
    shortDescription: "Ações filtradas cujo status gravado é Vencida.",
    description: "Conta as ações filtradas que estão com o status Vencida no registro.",
    formula: "Quantidade de ações filtradas com status = OVERDUE.",
    source: "sla_actions.status do projeto.",
    unit: "Número de ações, posição atual.",
    refresh: "A cada abertura da página; reage aos filtros em tela.",
    missingData: "Sem ações vencidas o valor é 0.",
    limitations: ["Usa o status gravado; a tela não recalcula vencimento por data para este contador."],
  }),
  def({
    id: "planejamento.acoes.kpi-escaladas",
    kind: "kpi",
    title: "Escaladas",
    shortDescription: "Ações filtradas cujo status gravado é Escalada.",
    description: "Conta as ações filtradas já escaladas pelo motor de prazos a um nível superior.",
    formula: "Quantidade de ações filtradas com status = ESCALATED.",
    source: "sla_actions.status do projeto (gravado pela função de escalonamento).",
    unit: "Número de ações, posição atual.",
    refresh: "A cada abertura da página; reage aos filtros em tela.",
    missingData: "Sem ações escaladas o valor é 0.",
  }),
  def({
    id: "planejamento.acoes.kpi-risco-alto-critico",
    kind: "kpi",
    title: "Risco alto/crítico",
    shortDescription: "Ações filtradas classificadas como risco Alto ou Crítico.",
    description: "Conta as ações filtradas cuja criticidade é Alta ou Crítica, independentemente do status.",
    formula: "Quantidade de ações filtradas com risk_level igual a HIGH ou CRITICAL.",
    source: "sla_actions.risk_level do projeto.",
    unit: "Número de ações, posição atual.",
    refresh: "A cada abertura da página; reage aos filtros em tela.",
    missingData: "Sem ações nesses níveis o valor é 0.",
  }),
  def({
    id: "planejamento.acoes.kpi-concluidas",
    kind: "kpi",
    title: "Concluídas",
    shortDescription: "Ações filtradas já concluídas.",
    description: "Conta as ações filtradas que já estão com o status Concluída no registro, inclusive as do histórico.",
    formula: "Quantidade de ações filtradas com status = COMPLETED.",
    source: "sla_actions.status do projeto.",
    unit: "Número de ações, acumulado histórico (sem janela de período).",
    refresh: "A cada abertura da página; reage aos filtros em tela.",
    missingData: "Sem ações concluídas o valor é 0.",
  }),

  // ---- Visão gerencial: filtros
  def({
    id: "planejamento.acoes.filtro-risco",
    kind: "filter",
    title: "Filtro de risco",
    shortDescription: "Marque Baixo, Médio, Alto ou Crítico para ver só esses níveis.",
    description: "Caixas de seleção por nível de risco. Sem nenhuma marcada, todos os níveis entram; marcando várias, entram as ações de qualquer um dos níveis marcados.",
    howToUse: ["Marque um ou mais níveis."],
    criteria: ["Filtros distintos se combinam com E: a ação precisa atender ao risco, ao status, à área, ao responsável e ao escalão escolhidos."],
    consequences: ["Atualiza os contadores e a tabela na hora; nada é gravado."],
  }),
  def({
    id: "planejamento.acoes.filtro-status",
    kind: "filter",
    title: "Filtro de status",
    shortDescription: "Marque Pendente, Estudando solução, Vencida, Escalada ou Concluída.",
    description: "Caixas de seleção por situação da ação. Sem nenhuma marcada, todos os status entram. As opções oferecidas são Pendente, Estudando solução, Vencida, Escalada e Concluída.",
    howToUse: ["Marque um ou mais status."],
    consequences: ["Atualiza os contadores e a tabela; nada é gravado."],
    limitations: ["Os status Assumida e Cancelada não têm caixa própria neste filtro."],
  }),
  def({
    id: "planejamento.acoes.filtro-area",
    kind: "filter",
    title: "Filtro de área",
    shortDescription: "Mostra só as ações de uma área.",
    description: "Seletor com as áreas que de fato têm ações neste projeto. Todas é o padrão.",
    howToUse: ["Escolha a área ou volte para Todas."],
  }),
  def({
    id: "planejamento.acoes.filtro-responsavel",
    kind: "filter",
    title: "Filtro de responsável",
    shortDescription: "Mostra só as ações de um responsável.",
    description: "Seletor com os nomes de responsáveis que aparecem nas ações do projeto. Todos é o padrão; ações sem responsável não têm nome para selecionar.",
    howToUse: ["Escolha o responsável ou volte para Todos."],
  }),
  def({
    id: "planejamento.acoes.filtro-escalao",
    kind: "filter",
    title: "Filtro de escalão",
    shortDescription: "Mostra só as ações em um nível de escalonamento.",
    description: "Seletor por nível atual: Responsável, Gerência, Diretoria (e o nível legado quando existir em dados antigos).",
    howToUse: ["Escolha o nível ou volte para Todos."],
  }),

  // ---- Visão gerencial: colunas
  def({
    id: "planejamento.acoes.col-acao",
    kind: "table",
    title: "Coluna Ação",
    shortDescription: "Título da ação; passe o mouse para ler a descrição.",
    description: "Título da ação. Quando há descrição, ela aparece num painel ao passar o mouse ou focar o título.",
  }),
  def({
    id: "planejamento.acoes.col-area",
    kind: "table",
    title: "Coluna Área",
    shortDescription: "Área responsável pela ação.",
    description: "Área à qual a ação pertence, que define o responsável e a cadeia de escalonamento da Matriz.",
  }),
  def({
    id: "planejamento.acoes.col-responsavel",
    kind: "table",
    title: "Coluna Responsável",
    shortDescription: "Pessoa que responde pela ação agora; traço quando não atribuído.",
    description: "Nome do responsável atual. Quando a ação ainda não tem responsável aparece um traço, não um nome presumido.",
    missingData: "Traço significa responsável não definido.",
  }),
  def({
    id: "planejamento.acoes.col-prazo",
    kind: "table",
    title: "Coluna Prazo",
    shortDescription: "Próximo prazo relevante: assumir, ou concluir depois de assumida.",
    description:
      "Mostra o prazo que está valendo para a ação: o prazo de assumir enquanto ela não foi assumida e o prazo de concluir depois de assumida (se existir). Ações concluídas ou sem prazo seguinte mostram traço.",
    source: "sla_actions.assume_due_at, acknowledged_at, complete_due_at e completed_at.",
    missingData: "Traço quando não há prazo aplicável.",
  }),
  def({
    id: "planejamento.acoes.col-tempo-restante",
    kind: "table",
    title: "Coluna Tempo restante / vencido há",
    shortDescription: "Diferença entre agora e o prazo da coluna Prazo.",
    description:
      "Mostra quanto falta (restam) ou há quanto tempo o prazo da coluna Prazo venceu (vencido há). É a diferença entre o instante em que a página foi carregada e o prazo, em tempo corrido.",
    formula: "Prazo menos o instante de carregamento da tela, exibido como restam X; se o prazo já passou, o instante menos o prazo, exibido como vencido há X.",
    source: "Prazo da coluna Prazo e relógio do navegador no carregamento.",
    limitations: ["É tempo corrido, não tempo útil: a contagem não descarta noites, fins de semana nem feriados."],
    missingData: "Traço quando não há prazo.",
  }),
  def({
    id: "planejamento.acoes.col-origem",
    kind: "table",
    title: "Coluna Origem",
    shortDescription: "De onde a ação nasceu: manual, Expert, ESG/SSMA, evento, solicitação, finding de IA ou outra.",
    description:
      "Origem da ação: Manual, Recomendação de um Expert, Obrigação ESG/SSMA, Evento do Ledger, Solicitação, Rejeição de recomendação ou finding de IA, Ação corretiva SSMA ou Outra.",
    purpose: "Permitir rastrear de qual registro a ação foi derivada.",
    humanReview: "Ações originadas de IA continuam sujeitas à matriz de SLA e à decisão humana.",
  }),

  // =====================================================================================================================
  // /[projectId]/acoes/configuracao — Matriz de SLA e Escalonamento
  // =====================================================================================================================
  def({
    id: "planejamento.acoes-config.pagina",
    kind: "page",
    title: "Matriz de SLA e Escalonamento",
    shortDescription: "Configuração do SLA do projeto: prazos por risco, fuso e expediente, e responsáveis por área.",
    description:
      "Tela do ADMINISTRADOR para ajustar, neste projeto, o fuso e expediente usados no cálculo dos prazos, os prazos por nível de risco e quem responde em cada área e nível. Sobrescreve os padrões do código.",
    purpose: "Definir e auditar como o SLA do projeto é calculado e a quem cada nível de escalonamento é endereçado.",
    howToUse: [
      "Ajuste o fuso e o expediente em Timezone e horário útil.",
      "Edite uma linha da tabela de prazos e use Salvar; cada risco é salvo de forma independente.",
      "Defina os responsáveis de cada área e salve por área.",
    ],
    howItWorks:
      "Cada linha de risco grava uma regra em sla_matrix_rules (a anterior é preservada como histórico) e gera registro de auditoria. A regra do projeto prevalece sobre o padrão do código; o padrão do código é o aprovado. Mudanças valem para ações NOVAS: prazos já gravados nas ações existentes não são recalculados.",
    source: "sla_matrix_rules, sla_area_responsibles e sla_project_settings do projeto; padrão em lib/sla/default-matrix.ts.",
    permissions: "Somente ADMINISTRADOR; quem não é administrador recebe página não encontrada e o banco também recusa.",
    limitations: ["O painel de alertas por e-mail do piloto, quando exibido, é somente leitura."],
    humanReview: "Alterações de SLA são decisões administrativas auditadas; nenhuma IA altera a Matriz.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes-config.fuso-expediente",
    kind: "setting",
    title: "Fuso e expediente do projeto",
    shortDescription: "Fuso, início e fim do expediente e feriados usados no cálculo de horas e dias úteis.",
    description:
      "Define o fuso horário do projeto e o expediente (hora de início e de fim, de segunda a sexta). Horas úteis e dias úteis do SLA só contam dentro desse expediente e descontando os feriados do calendário configurado. O padrão institucional é America/Sao_Paulo, 08:00 às 18:00.",
    purpose: "Garantir que o relógio do SLA nunca use UTC como horário comercial.",
    howToUse: ["Informe o fuso (nome IANA, como America/Sao_Paulo), a hora de início e a hora de fim e salve."],
    criteria: [
      "Feriados nacionais, Sexta-Feira da Paixão e feriado estadual do calendário do projeto são descontados; pontos facultativos não.",
      "Sem calendário configurado para o projeto, o próprio formulário avisa que feriados não são considerados.",
    ],
    consequences: ["Afeta o cálculo dos prazos das ações novas; ações existentes mantêm os prazos já gravados."],
    permissions: "Somente ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.acoes-config.regras-prazo",
    kind: "setting",
    title: "Como os prazos e o escalonamento funcionam",
    shortDescription: "Prazos aprovados por risco e a cadeia Nível 1, 2 e 3 do escalonamento.",
    description:
      "Resumo da regra: o prazo para assumir depende do risco (CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis). Se não for assumida, a ação sobe ao Nível 2 (Gerência); depois do prazo do Nível 2 sobe ao Nível 3 (Diretoria); depois do prazo da Diretoria é registrado o limite de escalonamento atingido.",
    purpose: "Explicar em um lugar o efeito de cada coluna da tabela de prazos.",
    howItWorks:
      "As colunas Nível 2 e Nível 3 são intervalos contados na mesma unidade de tempo da linha: o prazo do Nível 2 conta a partir do vencimento do prazo vigente e o prazo do Nível 3 conta a partir da subida à Diretoria. Valores fracionados de 0,5 são aceitos.",
    limitations: ["Os valores de cada obra são os gravados na tabela abaixo; o texto desta ajuda descreve a regra aprovada."],
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes-config.col-risco",
    kind: "table",
    title: "Coluna Risco",
    shortDescription: "Nível de risco da linha; default indica que ainda vale o padrão do código.",
    description:
      "Cada linha é um nível de risco (Baixo, Médio, Alto, Crítico). O marcador default significa que o projeto ainda não gravou regra própria e vale o padrão do código para esse nível.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes-config.col-unidade",
    kind: "table",
    title: "Coluna Unidade",
    shortDescription: "Unidade de tempo dos prazos da linha: horas úteis, dias úteis ou horas corridas.",
    description:
      "Define como os números da linha são contados. Horas úteis e dias úteis respeitam o expediente, o fim de semana e os feriados do projeto; horas corridas contam o relógio continuamente (usado para CRÍTICO).",
    criteria: ["A mesma unidade vale para assumir, responder, concluir e para os intervalos dos Níveis 2 e 3 da linha."],
  }),
  def({
    id: "planejamento.acoes-config.col-assumir",
    kind: "table",
    title: "Coluna Nível 1: assumir",
    shortDescription: "Prazo, na unidade da linha, para o responsável assumir a ação.",
    description:
      "Quantidade de tempo, a partir da criação da ação, que o responsável do Nível 1 tem para assumi-la. Vencido sem assumir, a ação sobe para o Nível 2.",
    criteria: ["Mínimo 0,5. Aprovados: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis."],
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.acoes-config.col-responder",
    kind: "table",
    title: "Coluna Responder",
    shortDescription: "Prazo opcional para responder à ação, na unidade da linha.",
    description:
      "Prazo opcional de resposta depois que a ação é assumida. Em branco significa que a regra não define esse checkpoint; o padrão do código não preenche este campo.",
    missingData: "Vazio quando não definido; não é tratado como zero.",
  }),
  def({
    id: "planejamento.acoes-config.col-concluir",
    kind: "table",
    title: "Coluna Concluir",
    shortDescription: "Prazo opcional para concluir a ação depois de assumida.",
    description:
      "Prazo opcional para concluir a ação depois de assumida. Quando preenchido, é o checkpoint usado pelo escalonamento após a assunção; em branco, a regra não impõe prazo de conclusão.",
    missingData: "Vazio quando não definido; não é tratado como zero.",
  }),
  def({
    id: "planejamento.acoes-config.col-nivel2",
    kind: "table",
    title: "Coluna Nível 2",
    shortDescription: "Tempo extra, depois do vencimento, até a ação subir à Diretoria.",
    description:
      "Quanto tempo, na unidade da linha, a Gerência (Nível 2) tem depois do vencimento do prazo vigente antes de a ação subir ao Nível 3 (Diretoria).",
    criteria: ["Mínimo 0,5."],
  }),
  def({
    id: "planejamento.acoes-config.col-nivel3",
    kind: "table",
    title: "Coluna Nível 3",
    shortDescription: "Tempo que a Diretoria tem antes de o limite de escalonamento ser atingido.",
    description:
      "Quanto tempo, na unidade da linha, a Diretoria (Nível 3) tem depois de receber a ação. Esgotado esse prazo, apenas se registra o limite de escalonamento atingido: não há Nível 4 nem novo e-mail.",
    criteria: ["Mínimo 0,5."],
  }),
  def({
    id: "planejamento.acoes-config.col-opcoes",
    kind: "table",
    title: "Coluna Opções",
    shortDescription: "E-mail, Confirmação e Justificativa: exigências da regra de cada risco.",
    description:
      "Três opções por risco: E-mail (notifica o destinatário do nível por e-mail), Confirmação (exige confirmação de recebimento) e Justificativa (exige justificativa de atraso, usada, por exemplo, para resolver um alerta de risco).",
    consequences: ["A opção Justificativa torna obrigatório o campo de justificativa ao resolver o alerta.", "Sem a opção E-mail, a subida de nível é registrada mas não notificada por e-mail."],
  }),
  def({
    id: "planejamento.acoes-config.col-acoes",
    kind: "table",
    title: "Coluna Ações (Salvar e Cancelar)",
    shortDescription: "Salvar grava a linha de risco; Cancelar descarta as edições ainda não salvas.",
    description:
      "Salvar grava a regra do risco como regra ativa do projeto, preservando a anterior como histórico e registrando auditoria. Cancelar restaura os valores salvos sem consultar o servidor.",
    consequences: ["Vale para ações novas; ações já criadas não são recalculadas."],
    permissions: "Somente ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.acoes-config.cadeia-responsaveis",
    kind: "setting",
    title: "Cadeia de responsáveis por área",
    shortDescription: "Para cada área: responsável (Nível 1), corresponsável, Gerência (Nível 2) e Diretoria (Nível 3).",
    description:
      "Define quem recebe a ação e os escalonamentos em cada área. Engenharia e Planejamento aceitam também um corresponsável no Nível 1. Cada área é salva separadamente.",
    howToUse: ["Escolha as pessoas entre os participantes ativos e convites pendentes do projeto.", "Clique em Salvar na linha da área."],
    criteria: ["Se o Nível 2 não estiver definido, o escalonamento vai direto ao Nível 3."],
    consequences: ["Área sem responsável definido deixa a ação sem responsável atribuído e o painel de alertas marca revisão de configuração."],
    permissions: "Somente ADMINISTRADOR.",
  }),

  // ---- Painel do piloto (somente leitura)
  def({
    id: "planejamento.acoes-config.piloto-painel",
    kind: "setting",
    title: "Alertas de risco por e-mail (piloto)",
    shortDescription: "Painel somente leitura do estado do piloto de alertas de risco por e-mail deste projeto.",
    description:
      "Mostra se os alertas de risco por e-mail estão habilitados, o fuso, a agenda do resumo semanal, os casos abertos, os níveis da Matriz, os destinatários permitidos do piloto e os últimos envios. Aparece apenas quando o recurso de relatórios semanais está ligado no servidor.",
    purpose: "Conferir a prontidão do piloto sem permitir alteração: prazos e níveis só se editam na Matriz.",
    howItWorks:
      "Lê a configuração de ingestão semanal do projeto, a Matriz, o outbox de alertas (últimos 20) e os casos de risco. Casos de TESTE do piloto são listados à parte e excluídos dos totais.",
    source: "project_weekly_schedule_ingestion_configs, risk_alert_cases, risk_alert_outbox e a Matriz de SLA do projeto.",
    refresh: "A cada abertura da página.",
    permissions: "Visível ao ADMINISTRADOR na tela de configuração.",
    limitations: ["Allowlist e liga/desliga do piloto são configurados por script do administrador, não por esta tela."],
  }),
  def({
    id: "planejamento.acoes-config.piloto-status",
    kind: "status",
    title: "Habilitados / Desabilitados",
    shortDescription: "Indica se os alertas de risco por e-mail estão ativos para o projeto.",
    description:
      "Mostra Habilitados somente quando o projeto tem configuração de ingestão semanal, a ingestão está ligada e os alertas de risco estão ligados; em qualquer outra situação mostra Desabilitados.",
    criteria: ["Habilitados exige: configuração existente E ingestão ligada E alertas de risco ligados."],
    source: "project_weekly_schedule_ingestion_configs (enabled e risk_alerts_enabled).",
  }),
  def({
    id: "planejamento.acoes-config.piloto-agenda",
    kind: "message",
    title: "Agenda dos alertas do piloto",
    shortDescription: "Consolidado semanal de Baixo e Médio e alertas imediatos de Alto e Crítico.",
    description:
      "Baixo e Médio saem em um consolidado único às quartas-feiras, 07:00 no fuso do projeto. Alto e Crítico são imediatos, com escalonamento Nível 1, 2 e 3 pelos prazos da Matriz. Também mostra o próximo e o último consolidado.",
    howItWorks: "O próximo consolidado é calculado a partir da data atual e do fuso do projeto; o último é a linha de resumo mais recente do outbox.",
    source: "risk_alert_outbox (tipo DIGEST) e cálculo de agenda do fuso do projeto.",
    missingData: "Sem consolidado anterior o painel mostra nenhum.",
  }),
  def({
    id: "planejamento.acoes-config.piloto-casos-abertos",
    kind: "kpi",
    title: "Casos em aberto (piloto)",
    shortDescription: "Casos de risco abertos por nível, mais os em revisão; testes ficam à parte.",
    description:
      "Contagem de casos de risco com status aberto, separados em crítico, alto, médio, baixo e em revisão (nível não reconhecido). Casos de TESTE do piloto são contados à parte e não entram nestes totais.",
    formula: "Para cada caso do projeto com status OPEN e que não seja de teste: soma 1 no nível do caso (CRITICAL, HIGH, MEDIUM, LOW); qualquer outro valor conta como em revisão.",
    source: "risk_alert_cases do projeto.",
    unit: "Número de casos, posição atual.",
    refresh: "A cada abertura da página.",
    missingData: "Sem casos o valor é 0; projeto sem configuração mostra o aviso de configuração.",
  }),
  def({
    id: "planejamento.acoes-config.piloto-niveis",
    kind: "table",
    title: "Níveis pela Matriz de responsabilidades",
    shortDescription: "Por área: pessoas dos Níveis 1, 2 e 3, prazo de assumir do risco ALTO e situação da configuração.",
    description:
      "Tabela de conferência por área: quem é o Nível 1 (inclusive corresponsável), o Nível 2 e o Nível 3, o prazo para assumir da regra ALTO da área (marcado default quando é o padrão do código) e o status OK ou Revisão de configuração, com os itens que faltam.",
    howItWorks: "Resolve a política da Matriz por área para o risco ALTO (lib/sla/resolve-matrix-policy.ts).",
    missingData: "Nível sem pessoa aparece como não definido; configuração incompleta vira Revisão de configuração.",
    limitations: ["Somente leitura: edite na Matriz."],
  }),
  def({
    id: "planejamento.acoes-config.piloto-allowlist",
    kind: "setting",
    title: "Destinatários do piloto (allowlist)",
    shortDescription: "Lista de pessoas autorizadas a receber e-mails do piloto; os demais são suprimidos.",
    description:
      "Mostra os usuários permitidos a receber alertas durante o piloto e se cada um é válido. Qualquer outro destinatário indicado pela Matriz é registrado como suprimido e nunca recebe e-mail. Sem allowlist configurada nenhum e-mail é enviado.",
    criteria: ["Fail-closed: lista ausente significa que nada é enviado."],
    consequences: ["O contador Suprimidos até agora conta os envios bloqueados por esta regra."],
    source: "project_weekly_schedule_ingestion_configs.pilot_recipient_allowlist_user_ids e risk_alert_outbox.",
  }),
  def({
    id: "planejamento.acoes-config.piloto-outbox",
    kind: "table",
    title: "Últimos alertas (outbox)",
    shortDescription: "Últimos 20 registros de envio: quando, tipo, risco, destinatário e status.",
    description:
      "Lista dos 20 alertas mais recentes do outbox do projeto. Status possíveis: Pendente, Aceito pelo provedor, Falhou, Suprimido e Ignorado. Aceito pelo provedor significa que o provedor de e-mail aceitou a mensagem, não que o destinatário a leu.",
    source: "risk_alert_outbox.",
    missingData: "Sem registros mostra Nenhum alerta registrado.",
    limitations: ["Mostra no máximo 20 linhas."],
  }),

  // =====================================================================================================================
  // /[projectId]/acoes/resumo-semanal/[digestId]
  // =====================================================================================================================
  def({
    id: "planejamento.resumo-semanal.pagina",
    kind: "page",
    title: "Resumo semanal de alertas",
    shortDescription: "Responda a cada alerta de risco Médio e Baixo da semana em um único envio.",
    description:
      "Página aberta pelo e-mail do resumo semanal. Lista os alertas de risco Médio e Baixo da semana para o destinatário e exige uma resposta para cada um antes de liberar o envio.",
    purpose: "Tratar em lote os alertas de menor criticidade, atualizando as ações do ACC.",
    howToUse: [
      "Escolha o tratamento de cada alerta: Ciente, Estudando solução, Resolvido ou Direcionar para.",
      "Preencha o texto exigido pelo tratamento escolhido.",
      "Clique em Enviar todas as respostas, liberado só quando todos estiverem respondidos.",
    ],
    howItWorks:
      "Abrir o link ou um botão do e-mail apenas pré-seleciona a resposta; nada é gravado até o envio do formulário. Ao enviar, as ações do ACC são atualizadas conforme as respostas.",
    source: "Resumo semanal (weekly alert digest) e suas ações vinculadas.",
    permissions: "Exige sessão e acesso ao resumo; o destino de direcionamento é membro ativo que não seja somente leitura e o banco revalida.",
    limitations: ["Resumo ainda não enviado ou aguardando reprocessamento não aceita resposta.", "Resumo já respondido fica somente leitura."],
    humanReview: "Cada tratamento é decisão humana registrada.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.resumo-semanal.tratamento",
    kind: "field",
    title: "Tratamento obrigatório",
    shortDescription: "Ciente, Estudando solução, Resolvido ou Direcionar para: uma resposta por alerta.",
    description:
      "Seletor obrigatório por alerta. Ciente registra a ciência; Estudando solução registra que a solução está sendo estudada (providências em curso opcionais); Resolvido exige descrever o que foi feito, com pelo menos 10 caracteres, e aceita evidência opcional; Direcionar para exige escolher a pessoa e informar o motivo, com pelo menos 5 caracteres.",
    howToUse: ["Escolha uma opção para cada alerta."],
    consequences: ["O envio só é liberado quando todos os alertas têm resposta (e pessoa, quando Direcionar).", "Direcionar não reinicia prazos nem escalonamento."],
  }),
  def({
    id: "planejamento.resumo-semanal.enviar",
    kind: "button",
    title: "Enviar todas as respostas",
    shortDescription: "Grava as respostas de todos os alertas do resumo de uma vez.",
    description:
      "Envia as respostas de todos os alertas do resumo semanal e atualiza as ações do ACC. Fica desabilitado enquanto algum alerta estiver sem resposta.",
    consequences: ["As respostas são registradas e o resumo passa a respondido integralmente."],
    humanReview: "Ato humano registrado.",
  }),

  // =====================================================================================================================
  // /[projectId]/action-requests e /[actionRequestId]
  // =====================================================================================================================
  def({
    id: "planejamento.solicitacoes.pagina",
    kind: "page",
    title: "Solicitações",
    shortDescription: "Solicitações rastreáveis para alguém analisar, responder ou executar algo.",
    description:
      "Lista as solicitações (action requests) do projeto: pedidos registrados para que alguém analise, responda ou execute algo, com título, descrição, status e data da solicitação. Cada linha abre o detalhe.",
    purpose: "Acompanhar solicitações formais e suas respostas.",
    source: "Tabela de solicitações (action_requests) do projeto.",
    missingData: "Sem solicitações mostra a mensagem de vazio.",
    humanReview: "Solicitações e respostas são registros humanos; a lista não decide nada.",
  }),
  def({
    id: "planejamento.solicitacoes.status",
    kind: "status",
    title: "Status da solicitação",
    shortDescription: "Situação atual da solicitação, exibida no selo da lista e do detalhe.",
    description: "Selo com a situação da solicitação conforme gravada no registro. O significado de cada status é o do enum de status de solicitações do sistema.",
    source: "action_requests.status.",
  }),
  def({
    id: "planejamento.solicitacao-detalhe.pagina",
    kind: "page",
    title: "Detalhe da solicitação",
    shortDescription: "Envio por e-mail, respostas recebidas e responsáveis de uma solicitação.",
    description:
      "Mostra a solicitação com seu status e três blocos: Envio por e-mail (estado do envio e formulário de envio), Respostas (por e-mail ou pelo app) e Responsáveis (pessoas atribuídas).",
    purpose: "Enviar a solicitação por e-mail e acompanhar quem respondeu.",
    howItWorks: "O estado do envio vem da notificação inicial: não enviada mostra o formulário, enviada mostra data, em andamento mostra aviso e falha mostra a falha sem nova tentativa automática.",
    source: "action_requests, responsáveis, respostas, notificações e entregas de e-mail.",
    humanReview: "O envio é ação explícita e irreversível, revisada pela pessoa antes de confirmar.",
  }),
  def({
    id: "planejamento.solicitacao-detalhe.envio-email",
    kind: "button",
    title: "Enviar solicitação por e-mail",
    shortDescription: "Envia a solicitação ao destinatário informado; não pode ser desfeito.",
    description:
      "Envia a solicitação por e-mail para o destinatário, com o assunto e a mensagem preenchidos. Revise o destinatário e o conteúdo antes de confirmar: o envio é uma ação explícita e não pode ser desfeito.",
    howToUse: ["Preencha Destinatário, Assunto e Mensagem (todos obrigatórios).", "Clique em Enviar solicitação por e-mail."],
    consequences: ["Após o envio o bloco passa a mostrar Enviada com a data; em caso de falha mostra Falha no envio sem nova tentativa automática."],
    missingData: "Assunto e mensagem vêm preenchidos com o título e a descrição da solicitação, e podem ser editados.",
  }),
  def({
    id: "planejamento.solicitacao-detalhe.respostas",
    kind: "table",
    title: "Respostas",
    shortDescription: "Respostas registradas por e-mail ou pelo app, com data.",
    description:
      "Lista as respostas já recebidas. Resposta por e-mail mostra o assunto da mensagem; resposta no app mostra o conteúdo informado.",
    source: "Respostas da solicitação (canal EMAIL ou APP).",
    missingData: "Sem respostas mostra Nenhuma resposta registrada ainda.",
  }),
  def({
    id: "planejamento.solicitacao-detalhe.responsaveis",
    kind: "table",
    title: "Responsáveis da solicitação",
    shortDescription: "Pessoas atribuídas para analisar, responder ou executar a solicitação.",
    description: "Lista os usuários atribuídos como responsáveis pela solicitação.",
    source: "Responsáveis (assignees) da solicitação.",
    missingData: "Sem atribuição mostra Nenhum responsável atribuído.",
  }),

  // =====================================================================================================================
  // /[projectId]/alertas/[caseId] — página do alerta de risco (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA)
  // =====================================================================================================================
  def({
    id: "planejamento.alerta.pagina",
    kind: "page",
    title: "Alerta de risco",
    shortDescription: "Situação, prazos, ações e histórico de um alerta de risco do piloto.",
    description:
      "Página autenticada de um alerta de risco: mostra a situação, o responsável, os prazos da Matriz, a previsão de conclusão, os quatro botões de tratamento (RESOLVIDO, EM ANDAMENTO, ENVIAR PARA e ESPECIALISTA), a timeline do caso, as mensagens e respostas e os encaminhamentos e entregas.",
    purpose: "Tratar o alerta com registro completo: quem fez o quê e quando, com evidência quando exigida.",
    howToUse: [
      "Leia a Situação e escolha um dos quatro botões na seção Ações.",
      "Preencha o formulário que abrir e confirme: nada muda só por abrir a página ou o link do e-mail.",
    ],
    howItWorks:
      "O link do e-mail só pré-seleciona a ação e valida o token; o estado só muda quando o formulário é enviado. A transição é calculada por uma máquina de estados pura e gravada pela função de banco record_risk_alert_action, com checagem de autorização, estado esperado e idempotência. Nenhum e-mail é enviado pela tela: o worker envia a partir da fila (outbox).",
    source: "risk_alert_cases e tabelas de eventos, mensagens, encaminhamentos e outbox do caso; ação SLA vinculada.",
    refresh: "A cada abertura ou após cada ação registrada.",
    permissions: "Membro do projeto com acesso ao caso; o recurso depende do relatório semanal estar ligado no servidor (senão a página não existe).",
    limitations: ["Casos de TESTE do piloto são rotulados e não representam risco real."],
    humanReview: "Todo tratamento é decisão humana registrada; a recomendação do Expert é sugestão sujeita a revisão.",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.alerta.situacao",
    kind: "status",
    title: "Situação do alerta",
    shortDescription: "Selos de nível de risco, estado do caso e limite de escalonamento atingido.",
    description:
      "Cabeçalho com o nível de risco, o estado do caso (Aberto, Ciência registrada, Tomando providências, Encaminhado, Aguardando ação do encaminhado, Devolvido ao responsável anterior, Consulta ao Expert pendente, Expert respondeu, Resolução proposta, Resolvido, Revisão humana necessária, Limite de escalonamento atingido) e, se houver, o selo de limite de escalonamento.",
    purpose: "Resumir onde o alerta está no fluxo.",
    source: "risk_alert_cases (risk_level, state e top_level_reached_at).",
    criteria: ["Resolvido mostra um visto; o selo TESTE identifica caso isolado do piloto."],
  }),
  def({
    id: "planejamento.alerta.resumo-impacto",
    kind: "message",
    title: "Resumo, impacto e recomendação do Expert",
    shortDescription: "Texto do alerta, impacto estimado e recomendação do Expert de IA.",
    description:
      "Resumo do risco, o impacto registrado e a recomendação gerada por um Expert de IA do ACC. A recomendação é uma sugestão (inferência) para apoiar a decisão e não é uma ordem.",
    humanReview: "A recomendação do Expert exige avaliação humana antes de qualquer decisão.",
    limitations: ["Campos ausentes aparecem com traço, nunca preenchidos por estimativa."],
    missingData: "Traço quando não há dado.",
  }),
  def({
    id: "planejamento.alerta.responsaveis",
    kind: "status",
    title: "Responsável atual e anterior",
    shortDescription: "Quem responde pelo alerta agora e quem respondia antes de um encaminhamento.",
    description:
      "Mostra o responsável atual do caso e, quando houve encaminhamento, o responsável anterior. Muda quando alguém usa ENVIAR PARA ou quando quem recebeu age sobre o caso.",
    source: "risk_alert_cases.current_responsible_user_id e previous_responsible_user_id.",
    missingData: "Não definido quando o caso não tem responsável; traço quando não há anterior.",
  }),
  def({
    id: "planejamento.alerta.nivel-atual",
    kind: "status",
    title: "Nível atual e próximo",
    shortDescription: "Nível de escalonamento do caso e o próximo nível da cadeia.",
    description:
      "Indica o nível hierárquico atual (Nível 1 Responsável, Nível 2 Gerência, Nível 3 Diretoria) e o próximo. Quando já está na Diretoria o próximo é Limite de escalonamento atingido: não há Nível 4.",
    source: "risk_alert_cases.current_level e cadeia lib/sla/compute-escalation.ts.",
  }),
  def({
    id: "planejamento.alerta.prazos-matriz",
    kind: "status",
    title: "Prazos da Matriz para este alerta",
    shortDescription: "Prazos de assumir, responder e concluir da regra aplicável, na unidade da Matriz.",
    description:
      "Mostra os prazos da regra da Matriz aplicada ao risco e à área do alerta (assumir, e responder e concluir quando existirem), na unidade da regra. A indicação default ou simulação sinaliza que não há regra gravada para o projeto e vale o padrão do código.",
    criteria: ["Aprovados para assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis."],
    source: "Regra resolvida de sla_matrix_rules (lib/sla/resolve-matrix-policy.ts).",
    validity: SLA_VALIDITY,
  }),
  def({
    id: "planejamento.alerta.acao-sla",
    kind: "status",
    title: "Ação SLA vinculada",
    shortDescription: "Status e datas da ação SLA que acompanha este alerta.",
    description:
      "Mostra o status da ação SLA vinculada ao caso, até quando é preciso assumir e quando foi assumida ou concluída. O caso e a ação só mudam juntos, pela página do alerta.",
    source: "sla_actions vinculada por risk_alert_cases.sla_action_id.",
    missingData: "Linha omitida quando o caso não tem ação SLA vinculada.",
  }),
  def({
    id: "planejamento.alerta.previsao-conclusao",
    kind: "status",
    title: "Previsão de conclusão",
    shortDescription: "Data prevista de término informada pelo responsável, com histórico de alterações.",
    description:
      "Data de conclusão informada pelo responsável ao registrar EM ANDAMENTO, com situação, data anterior se foi alterada e quem informou. Em ALTO e CRÍTICO a previsão acompanha os escalonamentos; em MÉDIO e BAIXO apenas registra e exibe a data.",
    howItWorks:
      "Cada informação de data é um evento novo e o histórico é preservado. Vale a mais recente pela data de origem (e-mail ou tela). A previsão não reinicia o prazo original nem suspende escalonamentos. Datas sem fuso são lidas no horário de Brasília (UTC-03:00); data sem hora vale até 23:59; ALTO e CRÍTICO exigem data e hora; data no passado ou a mais de 3 anos é inválida.",
    source: "Eventos TAKING_ACTION do caso (lib/risk-alerts/forecast.ts).",
    missingData: "Sem data válida mostra traço e a situação previsão pendente; a pendência fica registrada e as cobranças continuam.",
    limitations: ["Não substitui o prazo de SLA."],
  }),
  def({
    id: "planejamento.alerta.proximo-escalonamento",
    kind: "status",
    title: "Próximo escalonamento por prazo",
    shortDescription: "Nível e motivos do próximo escalonamento automático pelo vencimento de prazos.",
    description:
      "Mostra, quando houver, para qual nível o caso subirá pelo vencimento dos prazos e as razões calculadas pelo motor determinístico.",
    source: "Motor lib/sla/compute-escalation.ts aplicado aos prazos da ação SLA.",
    missingData: "Linha omitida quando nenhum escalonamento por prazo está previsto.",
  }),
  def({
    id: "planejamento.alerta.exigencias-matriz",
    kind: "status",
    title: "Exigências da Matriz",
    shortDescription: "Se a regra exige confirmação de recebimento e justificativa.",
    description:
      "Indica se a regra da Matriz do risco exige confirmação obrigatória e justificativa obrigatória. A exigência de justificativa torna obrigatório o campo Justificativa ao marcar RESOLVIDO.",
    source: "Opções da regra em sla_matrix_rules.",
  }),
  def({
    id: "planejamento.alerta.suprimidos",
    kind: "status",
    title: "Destinatários suprimidos (piloto)",
    shortDescription: "Quantidade de envios bloqueados porque o destinatário não está na allowlist do piloto.",
    description:
      "Número de entregas deste alerta registradas como suprimidas por o destinatário não estar permitido no piloto. Suprimido significa que o e-mail não foi enviado.",
    source: "risk_alert_outbox com status SUPPRESSED do caso.",
  }),
  def({
    id: "planejamento.alerta.acoes",
    kind: "setting",
    title: "Ações do alerta",
    shortDescription: "Os quatro botões: RESOLVIDO, EM ANDAMENTO, ENVIAR PARA e ESPECIALISTA.",
    description:
      "Seção de tratamento do alerta. RESOLVIDO encerra com solução e justificativa. EM ANDAMENTO registra as providências e a previsão de conclusão. ENVIAR PARA passa a responsabilidade a outro colaborador. ESPECIALISTA é uma consulta somente leitura a um Expert de IA da área. Os botões do e-mail levam a esta mesma seção com a ação pré-selecionada.",
    howToUse: ["Clique em um botão, preencha o formulário e use o botão de confirmação do formulário."],
    howItWorks:
      "Cada botão abre um formulário; só o envio registra a ação (POST autenticado com confirmação). Pela tela ou pelo e-mail, o resultado é o mesmo registro. O botão ESPECIALISTA nunca registra evento, não muda estado e não provoca escalonamento.",
    consequences: ["Registro com autor, data e origem na timeline do caso."],
    limitations: ["Com o alerta já Resolvido, só a consulta ao especialista continua disponível.", "Para ALTO e CRÍTICO o botão OUTRO provoca escalonamento imediato ao próximo nível; RESOLVIDO, EM ANDAMENTO e ENVIAR PARA não escalonam por si."],
    humanReview: "Todas as ações são humanas.",
  }),
  def({
    id: "planejamento.alerta.btn-resolvido",
    kind: "button",
    title: "RESOLVIDO",
    shortDescription: "Marca o alerta como resolvido, com solução, justificativa e confirmação.",
    description:
      "Abre o formulário de resolução. Exige descrever a solução adotada e marcar a confirmação. A justificativa é obrigatória quando a Matriz do risco a exige. Em ALTO e CRÍTICO a evidência também é obrigatória e, se a regra exige confirmação, a resolução fica como proposta aguardando revisão humana antes de virar Resolvido.",
    purpose: "Encerrar o alerta com responsável e data registrados.",
    howToUse: ["Clique em RESOLVIDO.", "Preencha Solução adotada, Evidência (ALTO/CRÍTICO), Justificativa e a confirmação.", "Confirme com CONFIRMAR RESOLUÇÃO."],
    howItWorks:
      "Quando resolvido de fato, a ação SLA vinculada é concluída. Em ALTO ou CRÍTICO com confirmação exigida o estado vai para Resolução proposta (revisão humana) e a ação SLA fica como assumida até a confirmação.",
    consequences: ["O alerta fica Resolvido e deixa de ser cobrado; estado terminal."],
    permissions: "Membro do projeto com acesso ao alerta; autorização revalidada no banco.",
    humanReview: "Em ALTO e CRÍTICO, a resolução proposta exige revisão humana antes de ser confirmada.",
  }),
  def({
    id: "planejamento.alerta.btn-em-andamento",
    kind: "button",
    title: "EM ANDAMENTO (TOMANDO PROVIDÊNCIAS)",
    shortDescription: "Registra as providências em andamento e a previsão de conclusão.",
    description:
      "Abre o formulário de providências em andamento. O texto das providências é obrigatório e a previsão de conclusão é solicitada (data e horário obrigatórios para ALTO e CRÍTICO; data para MÉDIO e BAIXO). Internamente a ação chama-se TOMANDO PROVIDÊNCIAS e o estado resultante é Tomando providências.",
    howToUse: ["Clique em EM ANDAMENTO.", "Descreva as Providências em andamento e informe a Previsão de conclusão.", "Confirme com CONFIRMAR."],
    consequences: [
      "O estado passa a Tomando providências e a ação SLA fica em andamento, com quem registrou como responsável atual.",
      "A previsão não reinicia o prazo original nem suspende os escalonamentos.",
      "Por e-mail, a resposta de providência também é lida como informação da data prevista.",
    ],
    missingData: "Sem previsão válida a pendência fica registrada como previsão de conclusão pendente.",
  }),
  def({
    id: "planejamento.alerta.btn-enviar-para",
    kind: "button",
    title: "ENVIAR PARA",
    shortDescription: "Encaminha o alerta a outro colaborador ativo do projeto.",
    description:
      "Abre o formulário de encaminhamento: escolha o novo responsável e, opcionalmente, registre a justificativa. O prazo original não é alterado; ficam registrados quem encaminhou, quem recebeu e a data e hora. O destinatário recebe um prazo para assumir pela regra da Matriz.",
    howToUse: ["Clique em ENVIAR PARA.", "Pesquise e escolha o colaborador.", "Confirme com CONFIRMAR ENVIO."],
    criteria: [
      "O destinatário precisa ser membro ativo do projeto com e-mail corporativo do domínio configurado, e não pode ser você mesmo.",
      "Só pode existir um encaminhamento ativo por vez; enquanto houver um, ninguém reencaminha.",
    ],
    consequences: ["O estado passa a Aguardando ação do encaminhado; a entrega ao destinatário entra na fila de e-mails e pode ser suprimida se ele não estiver na allowlist do piloto, caso em que o formulário o sinaliza."],
    limitations: ["O botão não aparece enquanto já existe encaminhamento ativo ou o caso já foi encaminhado."],
  }),
  def({
    id: "planejamento.alerta.btn-especialista",
    kind: "button",
    title: "ESPECIALISTA",
    shortDescription: "Consulta somente leitura a um Expert de IA da área; não altera o alerta.",
    description:
      "Abre a consulta a um Expert de IA do ACC escolhido pela área do alerta (você pode trocar a especialidade). É somente leitura: não registra evento, não muda o estado do alerta, não provoca escalonamento e não registra providência. O ESPECIALISTA não é a AXIA, assistente de dúvidas sobre o uso do ACC.",
    purpose: "Obter um parecer de apoio à decisão, com fontes consultáveis no ACC.",
    howToUse: ["Clique em ESPECIALISTA.", "Confirme a especialidade e a pergunta.", "Clique em Consultar."],
    howItWorks:
      "A consulta chama o Expert oficial da especialidade escolhida, ou a curadoria multi-Expert no modo Geral, e devolve parecer, fontes e consolidação. Há limite diário de consultas por usuário e por obra.",
    consequences: ["Cada consulta consome uma unidade do limite diário e fica registrada para auditoria de consumo."],
    limitations: ["Resposta de IA é inferência e pode errar.", "Em ambiente de teste a resposta vem sinalizada como TESTE e não é análise real."],
    humanReview: "O parecer é recomendação; qualquer providência precisa ser decidida e registrada por uma pessoa.",
  }),
  def({
    id: "planejamento.alerta.btn-outro",
    kind: "button",
    title: "OUTRO",
    shortDescription: "Registro livre de uma ação que não se enquadra nos quatro botões.",
    description:
      "Registro livre com descrição obrigatória. Em ALTO e CRÍTICO provoca escalonamento imediato ao próximo nível hierárquico (a ação e o escalonamento são eventos distintos, ambos auditados, e o alerta permanece aberto).",
    consequences: ["Em ALTO e CRÍTICO escala ao próximo nível; em MÉDIO e BAIXO apenas registra."],
  }),
  def({
    id: "planejamento.alerta.btn-confirmar-resolucao",
    kind: "button",
    title: "CONFIRMAR RESOLUÇÃO",
    shortDescription: "Confirma a resolução proposta de um alerta ALTO ou CRÍTICO.",
    description:
      "Confirma a resolução proposta (revisão humana) e leva o alerta a Resolvido, concluindo a ação SLA. Só se aplica a quem tem a resolução proposta aguardando confirmação.",
    humanReview: "É a revisão humana exigida pela regra para ALTO e CRÍTICO.",
  }),
  def({
    id: "planejamento.alerta.campo-solucao",
    kind: "field",
    title: "Solução adotada",
    shortDescription: "O que foi feito para resolver o alerta (obrigatório).",
    description: "Texto obrigatório que descreve a solução. Fica gravado no evento de resolução do caso e, quando resolve de fato, como nota de conclusão da ação SLA.",
    missingData: "Sem texto a resolução é bloqueada.",
  }),
  def({
    id: "planejamento.alerta.campo-evidencia",
    kind: "field",
    title: "Evidência (ALTO e CRÍTICO)",
    shortDescription: "Referência da prova da resolução; obrigatória em alertas Alto e Crítico.",
    description: "Referência (documento, protocolo, link) que comprova a resolução. Obrigatória apenas para ALTO e CRÍTICO; para os demais riscos o campo não aparece.",
    humanReview: "A evidência é conferida na revisão humana da resolução proposta.",
  }),
  def({
    id: "planejamento.alerta.campo-justificativa",
    kind: "field",
    title: "Justificativa",
    shortDescription: "Justificativa da resolução; obrigatória quando a Matriz do risco a exige.",
    description: "Texto de justificativa. É obrigatório quando a regra da Matriz do risco exige justificativa de atraso (o rótulo indica obrigatória pela Matriz).",
    missingData: "Se a Matriz exige e o campo está vazio, a resolução é bloqueada.",
  }),
  def({
    id: "planejamento.alerta.campo-confirmo",
    kind: "field",
    title: "Confirmo a resolução",
    shortDescription: "Confirmação explícita; responsável e data ficam registrados.",
    description: "Caixa obrigatória pela qual quem resolve confirma o ato. Sem marcá-la o RESOLVIDO não é registrado.",
  }),
  def({
    id: "planejamento.alerta.campo-providencias",
    kind: "field",
    title: "Providências em andamento",
    shortDescription: "Descrição obrigatória do que está sendo feito.",
    description: "Texto obrigatório com as providências em curso. Fica na timeline do caso.",
    missingData: "Sem texto o registro é bloqueado.",
  }),
  def({
    id: "planejamento.alerta.campo-previsao",
    kind: "field",
    title: "Previsão de conclusão (campo)",
    shortDescription: "Data (e horário em ALTO e CRÍTICO) prevista para concluir o tratamento.",
    description:
      "Data prevista de conclusão. Em ALTO e CRÍTICO o campo exige data e horário (horário de Brasília); em MÉDIO e BAIXO basta a data, que vale até o fim do dia. A previsão não reinicia o prazo original nem suspende os escalonamentos.",
    howToUse: ["Selecione a data no calendário que se abre."],
    limitations: ["Data no passado ou a mais de 3 anos é rejeitada."],
  }),
  def({
    id: "planejamento.alerta.campo-pesquisar-colaborador",
    kind: "filter",
    title: "Pesquisar colaborador",
    shortDescription: "Filtra a lista de destinatários por nome, e-mail, área ou posição na Matriz.",
    description: "Campo de busca que reduz as opções do seletor Novo responsável. Não grava nada.",
  }),
  def({
    id: "planejamento.alerta.campo-novo-responsavel",
    kind: "field",
    title: "Novo responsável",
    shortDescription: "Colaborador ativo da obra que receberá o alerta.",
    description:
      "Seletor obrigatório com colaboradores ativos desta obra, mostrando e-mail, área, permissão e posição na Matriz. A indicação fora da allowlist do piloto avisa que a pessoa recebe só este alerta.",
    criteria: ["Elegíveis: membros ACTIVE com e-mail do domínio corporativo, exceto você."],
  }),
  def({
    id: "planejamento.alerta.campo-justificativa-encaminhamento",
    kind: "field",
    title: "Justificativa do encaminhamento",
    shortDescription: "Instrução opcional ao destinatário; fica registrada com o encaminhamento.",
    description: "Texto opcional enviado como instrução ao destinatário e gravado no encaminhamento.",
  }),
  def({
    id: "planejamento.alerta.campo-descricao-outro",
    kind: "field",
    title: "Descrição (OUTRO)",
    shortDescription: "Texto obrigatório do registro livre.",
    description: "Descrição obrigatória do registro livre da ação OUTRO; fica gravada no evento do caso.",
    missingData: "Sem texto o registro é bloqueado.",
  }),
  def({
    id: "planejamento.alerta.timeline",
    kind: "table",
    title: "Timeline do alerta",
    shortDescription: "Eventos do caso em ordem, com origem, autor, estado, nível, justificativa e previsão.",
    description:
      "Cada linha é um evento do caso: data, origem (tela, e-mail ou sistema), autor ou SISTEMA, mudança de estado e de nível, texto, justificativa e previsão de conclusão informada. EM ANDAMENTO sem data mostra previsão pendente.",
    purpose: "Rastreabilidade completa do tratamento.",
    source: "Eventos do caso de risco.",
    missingData: "Sem eventos mostra Nenhum evento.",
  }),
  def({
    id: "planejamento.alerta.mensagens",
    kind: "table",
    title: "Mensagens e respostas (thread do alerta)",
    shortDescription: "Mensagens enviadas e respostas por e-mail ligadas ao alerta, com classificação.",
    description:
      "Mostra a conversa do alerta: mensagens do ACC, respostas recebidas e respostas de Expert. Respostas por e-mail trazem a classificação automática com confiança e podem exigir revisão humana, sinalizada pelo selo.",
    humanReview: "A classificação automática de respostas é inferência; o selo revisão humana indica que uma pessoa deve conferir.",
    source: "Mensagens do caso (direção, status, classificação e confiança).",
    missingData: "Sem mensagens mostra Nenhuma mensagem.",
  }),
  def({
    id: "planejamento.alerta.encaminhamentos-entregas",
    kind: "table",
    title: "Encaminhamentos, devoluções e entregas",
    shortDescription: "Quem encaminhou a quem, prazos e estado, e as entregas de e-mail da fila.",
    description:
      "Lista os encaminhamentos (de, para, prazo para assumir, estado, devolução e exceção manual do piloto) e as entregas (outbox) com data, tipo, nível, destinatário, status e motivo de supressão.",
    source: "Encaminhamentos e risk_alert_outbox do caso.",
    missingData: "Sem registros mostra Nenhum encaminhamento e Nenhuma.",
  }),

  // =====================================================================================================================
  // Páginas de resposta por e-mail dos alertas de contrato e de providência
  // =====================================================================================================================
  def({
    id: "planejamento.alerta-email-acao.pagina",
    kind: "page",
    title: "Responder alerta do ACC (um alerta)",
    shortDescription: "Confirme RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ para um alerta de contrato vindo do e-mail.",
    description:
      "Página aberta pelos botões do e-mail de alerta de contrato. Mostra a obra, o alerta e a ação escolhida e só registra a ação quando você clica em CONFIRMAR. Se o e-mail trouxer vários alertas, a página leva ao lote para responder todos juntos.",
    howToUse: ["Confira o alerta e a ação.", "Se for ENVIADO P/, escolha o colaborador.", "Clique em CONFIRMAR."],
    howItWorks: "Abrir o link (GET) nunca registra nada; só o envio do formulário efetiva a ação. Antes de confirmar aparece o aviso sobre repetição dos lembretes.",
    permissions: "Exige login e acesso ao alerta; sem acesso mostra link inexistente ou sem acesso.",
    limitations: ["Lote já respondido não aceita nova resposta."],
  }),
  def({
    id: "planejamento.alerta-email-acao.aviso-repeticao",
    kind: "message",
    title: "Aviso de repetição do alerta",
    shortDescription: "Informa o que acontece ao confirmar: encerra, repete ou envia ao destinatário.",
    description:
      "Antes de confirmar, explica o efeito: RESOLVIDO encerra o alerta e interrompe lembretes futuros; EM ANDAMENTO repete o alerta até a conclusão; ENVIADO P/ faz o destinatário receber o alerta com a mesma repetição. O intervalo depende do grau de risco: crítico a cada 1 dia, alto a cada 2 dias, médio a cada 4 dias e baixo a cada 7 dias (dias corridos).",
    source: "lib/alerts/repeat-policy.ts, fonte única dos intervalos.",
    limitations: ["Os intervalos de repetição dos lembretes dos alertas de contrato são independentes dos prazos de SLA."],
  }),
  def({
    id: "planejamento.alerta-email-acao.enviado-para",
    kind: "field",
    title: "Enviado para",
    shortDescription: "Colaborador ativo que passa a receber o alerta (obrigatório em ENVIADO P/).",
    description: "Seletor de membros ativos do projeto, obrigatório quando a ação é ENVIADO P/.",
    missingData: "Sem escolha o envio é bloqueado.",
  }),
  def({
    id: "planejamento.alerta-email-acao.confirmar",
    kind: "button",
    title: "CONFIRMAR",
    shortDescription: "Efetiva a ação escolhida; abrir o link do e-mail nunca registra nada.",
    description: "Efetiva a ação (RESOLVIDO, EM ANDAMENTO ou ENVIADO P/) escolhida no e-mail e registra autor e data no ACC.",
    consequences: ["Resolve, mantém em andamento com repetição ou envia ao destinatário, conforme a ação."],
    humanReview: "Ato humano explícito.",
  }),
  def({
    id: "planejamento.alerta-lote.pagina",
    kind: "page",
    title: "Responder alertas do ACC (lote)",
    shortDescription: "Defina RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ para cada alerta do lote.",
    description:
      "Página do e-mail com vários alertas de contrato. Cada alerta precisa de uma ação definida; o envio final só é liberado quando todos estiverem respondidos. VER EVENTO é apenas consulta e não conta como resposta.",
    howToUse: ["Defina a ação de cada alerta e use Salvar esta ação.", "Clique no botão final quando todos estiverem definidos."],
    permissions: "Exige login; sem acesso mostra link inexistente.",
    limitations: ["Lote ainda não enviado ou aguardando reprocessamento não aceita resposta; lote respondido fica somente leitura."],
  }),
  def({
    id: "planejamento.alerta-lote.acao",
    kind: "field",
    title: "Ação do alerta no lote",
    shortDescription: "RESOLVIDO, EM ANDAMENTO ou ENVIADO P/, obrigatória por alerta.",
    description:
      "Seletor da ação de cada alerta do lote. ENVIADO P/ exige também a escolha do colaborador. O aviso sobre repetição dos lembretes aparece conforme a ação e o risco.",
    consequences: ["O botão final só é liberado quando todos os alertas têm ação (e colaborador no ENVIADO P/)."],
  }),
  def({
    id: "planejamento.alerta-lote.salvar-acao",
    kind: "button",
    title: "Salvar esta ação",
    shortDescription: "Grava a ação escolhida para este alerta do lote.",
    description: "Salva a ação do alerta individual sem esperar o envio final. Fica desabilitado quando a ação ainda não está completa ou já foi salva igual.",
    consequences: ["Mostra Ação salva; o contador de alertas respondidos avança."],
  }),
  def({
    id: "planejamento.alerta-lote.responder",
    kind: "button",
    title: "RESPONDER AO ACC / CONFIRMAR TUDO",
    shortDescription: "Envia a resposta do lote quando todos os alertas têm ação definida.",
    description:
      "Finaliza o lote e envia a resposta ao ACC. Fica desabilitado enquanto houver alerta pendente e lista os pendentes. O contador mostra quantos alertas já foram respondidos.",
    consequences: ["O lote passa a respondido integralmente."],
    humanReview: "Ato humano registrado.",
  }),
  def({
    id: "planejamento.alerta-providencia.pagina",
    kind: "page",
    title: "Responder alerta de providência",
    shortDescription: "Confirme RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ para uma providência de entrega da obra.",
    description:
      "Página aberta pelos botões do e-mail do alerta de providência. É somente leitura ao abrir: a ação só é efetivada ao clicar em CONFIRMAR. Mostra a obra, a fase, o título e a ação escolhida.",
    howItWorks: "O acesso segue a participação na obra. Providência já encerrada (concluída ou não aplicável) mostra aviso de encerrada.",
    permissions: "Exige participação na obra; para concluir é exigido gestor, gerente ou administrador da obra e uma evidência ou justificativa.",
  }),
  def({
    id: "planejamento.alerta-providencia.evidencia",
    kind: "field",
    title: "Evidência e justificativa (RESOLVIDO)",
    shortDescription: "Evidência, documento ou protocolo, ou justificativa se não houver evidência.",
    description:
      "Ao resolver uma providência, informe a evidência, o documento ou o protocolo; se não houver evidência, informe a justificativa. Concluir exige gestor, gerente ou administrador da obra.",
    missingData: "Sem evidência e sem justificativa a conclusão não é aceita.",
  }),
  def({
    id: "planejamento.consulta-ia.pagina",
    kind: "page",
    title: "Consultar IA sobre o alerta",
    shortDescription: "Consulta somente leitura a um Expert de IA sobre um alerta de evento ou providência.",
    description:
      "Página aberta pelo botão ESPECIALISTA do e-mail. Abrir o link nunca consulta o modelo nem grava: a consulta só ocorre ao clicar em Consultar. Exige login e vínculo ativo com a obra.",
    purpose: "Apoiar a decisão com parecer de IA e fontes, sem alterar o alerta.",
    howItWorks: "A especialidade vem pré-selecionada pela sua área cadastrada na obra (ou Geral). O alerta é carregado por obra, então um id de outra obra aparece como inexistente.",
    limitations: ["Resposta de IA é inferência.", "ESPECIALISTA não é a AXIA, assistente de dúvidas sobre o uso do ACC."],
    humanReview: "O parecer é recomendação sujeita a revisão humana.",
  }),
  def({
    id: "planejamento.consulta-ia.especialidade",
    kind: "field",
    title: "Especialista (especialidade)",
    shortDescription: "Escolhe a especialidade consultada: jurídica, engenharia, planejamento, comercial, SSMA, documentação ou geral.",
    description:
      "Seletor da especialidade. Cada uma usa um Expert oficial do ACC com um foco próprio. Geral decide pelo assunto: um tema vai ao Expert do tema; dois ou mais temas, ou nenhum, geram curadoria multi-Expert com consolidação do CEO IA.",
    howToUse: ["Mantenha a sugestão pela sua área ou troque conforme a dúvida."],
    limitations: ["Cada Expert opera sob os próprios limites de dados e a curadoria é inferência."],
  }),
  def({
    id: "planejamento.consulta-ia.pergunta",
    kind: "field",
    title: "Pergunta ao especialista",
    shortDescription: "Pergunta enviada ao Expert; já vem com uma sugestão padrão e tem limite de tamanho.",
    description: "Texto da pergunta enviada ao especialista de IA. O padrão sugerido pode ser editado; há limite máximo de caracteres.",
    howToUse: ["Seja específico sobre o que precisa decidir."],
  }),
  def({
    id: "planejamento.consulta-ia.consultar",
    kind: "button",
    title: "Consultar",
    shortDescription: "Envia a pergunta ao Expert; a consulta não altera o alerta.",
    description:
      "Executa a consulta ao especialista escolhido. Reserva uma unidade do limite diário (por usuário e por obra) antes de chamar o provedor; atingido o limite, a consulta é recusada sem chamar a IA. A resposta traz parecer, roteamento e fontes consultáveis.",
    consequences: ["Nenhuma providência é registrada e o alerta não muda."],
    limitations: ["Resposta TESTE indica que nenhuma análise real foi feita.", "Pode falhar por limite de consultas ou indisponibilidade do provedor."],
    humanReview: "O resultado é apoio à decisão; a decisão é humana.",
  }),
  def({
    id: "planejamento.consulta-ia.fontes",
    kind: "table",
    title: "Fontes utilizadas",
    shortDescription: "Evento, cláusula, evidência, providência ou alerta usados na resposta, com link.",
    description:
      "Lista as fontes do ACC que sustentaram a resposta, cada uma com o tipo (Evento, Cláusula, Evidência, Providência ou Alerta), o link quando existe e uma nota. Permite conferir se a análise tem base real.",
    humanReview: "Confira as fontes antes de aceitar o parecer.",
  }),

  // =====================================================================================================================
  // /email-actions/[token]
  // =====================================================================================================================
  def({
    id: "planejamento.email-action.pagina",
    kind: "page",
    title: "Ação de e-mail",
    shortDescription: "Confirma a ação de um botão de e-mail: dar ciência, assumir, definir prazo ou responder.",
    description:
      "Página aberta por um link de ação de e-mail (alerta de contrato, ação de SLA ou solicitação). Mostra o projeto, o alerta e a ação solicitada e só a registra quando você confirma. Exige login.",
    howItWorks:
      "A leitura do contexto nunca muda estado; a confirmação é um POST. O token vem da URL, é de uso único, tem validade e depende da sua permissão no projeto. Estados possíveis: link inválido ou sem acesso, já confirmado, expirado e permissão insuficiente.",
    permissions: "Exige login e permissão suficiente no projeto para a ação.",
    limitations: ["Token expirado exige um novo alerta."],
  }),
  def({
    id: "planejamento.email-action.acao",
    kind: "message",
    title: "Ação solicitada",
    shortDescription: "DAR CIÊNCIA, ASSUMIR RESPONSABILIDADE, DEFINIR PRAZO ou RESPONDER AO ACC.",
    description:
      "Mostra qual das quatro ações o e-mail pediu: DAR CIÊNCIA confirma que você tomou conhecimento; ASSUMIR RESPONSABILIDADE assume o tratamento; DEFINIR PRAZO ajusta o prazo; RESPONDER AO ACC registra sua resposta.",
    source: "lib/email-actions/types.ts.",
  }),
  def({
    id: "planejamento.email-action.resposta",
    kind: "field",
    title: "Resposta / Comentário",
    shortDescription: "Texto da resposta (obrigatório em RESPONDER AO ACC) ou comentário do novo prazo.",
    description:
      "Em RESPONDER AO ACC a resposta é obrigatória (3 a 4000 caracteres). Em DEFINIR PRAZO o comentário é opcional, mas obrigatório quando a data reduz um prazo já existente.",
    missingData: "Sem resposta a confirmação do RESPONDER é bloqueada.",
  }),
  def({
    id: "planejamento.email-action.novo-prazo",
    kind: "field",
    title: "Novo prazo",
    shortDescription: "Data e hora do novo prazo (obrigatório em DEFINIR PRAZO).",
    description: "Data e hora do novo prazo. Reduzir um prazo já existente exige comentário explicando.",
    consequences: ["O prazo da ação fica ajustado e o ajuste é registrado."],
  }),
  def({
    id: "planejamento.email-action.confirmar",
    kind: "button",
    title: "Confirmar",
    shortDescription: "Efetiva a ação do e-mail; o link só abre a confirmação.",
    description: "Efetiva a ação do e-mail em nome do usuário logado e consome o token (uso único).",
    consequences: ["Mostra Confirmado com sucesso; o link não pode ser reutilizado."],
    humanReview: "Ato humano explícito.",
  }),

  // =====================================================================================================================
  // /[projectId]/reemissao-alertas (reaproveita o legado "reemissao-alertas" para a página)
  // =====================================================================================================================
  def({
    id: "planejamento.reemissao.como-funciona",
    kind: "message",
    title: "Como funciona a reemissão",
    shortDescription: "Aprovar só registra a decisão; nenhum e-mail sai desta página.",
    description:
      "Aprovar apenas registra a decisão (quem, quando, justificativa e caso) na trilha de auditoria. Nenhum e-mail é enviado por esta página. A reemissão só acontece no ciclo de alertas, quando o interruptor de envio das reemissões estiver ligado (hoje desligado por padrão) e todas as travas do piloto forem satisfeitas; casos com bloqueio manual continuam sem envio.",
    howItWorks: "A lista é uma leitura aproximada da lacuna de comunicação; o ciclo reavalia cada destinatário no momento do envio e só reemite quem realmente não foi informado.",
    consequences: ["Sem o interruptor ligado, uma decisão aprovada fica aguardando o ciclo."],
    permissions: "Somente administrador do projeto.",
  }),
  def({
    id: "planejamento.reemissao.contagem",
    kind: "kpi",
    title: "Casos Crítico/Alto abertos e elegíveis",
    shortDescription: "Quantidade de casos Crítico/Alto abertos da obra e quantos estão elegíveis à aprovação.",
    description:
      "O título mostra quantos casos Crítico ou Alto abertos a função de banco devolveu e, entre eles, quantos estão elegíveis à aprovação de reemissão.",
    formula: "Total = linhas retornadas por risk_alert_reissue_pending para a obra; Elegíveis = linhas com eligible verdadeiro.",
    source: "Função de banco risk_alert_reissue_pending (somente ADMINISTRADOR).",
    unit: "Número de casos, posição atual.",
    refresh: "A cada abertura da página.",
    missingData: "Se a lista não carregar, a página avisa que nada foi alterado e mostra zero linhas; isso não significa ausência de casos.",
  }),
  def({
    id: "planejamento.reemissao.col-aprovar",
    kind: "table",
    title: "Coluna Aprovar",
    shortDescription: "Marque os casos cuja reemissão você aprova; só os elegíveis podem ser marcados.",
    description: "Caixa de seleção por caso. Fica desabilitada quando o caso não é elegível, e o motivo aparece na coluna Situação. Cada chamada aceita até 50 casos.",
    howToUse: ["Marque os casos desejados.", "Informe a justificativa e a confirmação.", "Clique em Aprovar reemissão."],
  }),
  def({
    id: "planejamento.reemissao.col-codigo",
    kind: "table",
    title: "Coluna Código",
    shortDescription: "Código visível do caso de risco e seu título.",
    description: "Código visível do caso de risco com o título abaixo, para identificar o que está sendo aprovado.",
    missingData: "Traço quando o caso não tem código visível.",
  }),
  def({
    id: "planejamento.reemissao.col-area-risco",
    kind: "table",
    title: "Colunas Área e Risco",
    shortDescription: "Área SLA do caso e seu nível de risco (Crítico ou Alto).",
    description: "Área à qual o caso pertence e o nível de risco. Só casos Crítico ou Alto podem ter reemissão aprovada.",
  }),
  def({
    id: "planejamento.reemissao.col-idade",
    kind: "table",
    title: "Coluna Idade",
    shortDescription: "Dias desde a abertura do caso, calculados pela função de banco.",
    description: "Idade do caso em dias, devolvida pela função de banco risk_alert_reissue_pending.",
    limitations: ["O cálculo exato é feito no banco; a tela só exibe o número."],
  }),
  def({
    id: "planejamento.reemissao.col-lacuna",
    kind: "table",
    title: "Coluna Lacuna (quem não foi informado)",
    shortDescription: "Destinatários exigidos pela etapa do caso que ainda não receberam o alerta.",
    description:
      "Papéis exigidos pela etapa alcançada pelo caso e ainda sem aceite do provedor no próprio endereço: Responsável, Nível 2 Gestor e Diretoria. É uma aproximação em SQL; o ciclo reavalia no envio.",
    howItWorks: "Destinatários exigidos: responsável da ação SLA ou responsável direto da área, Nível 2 se a etapa alcançou o Nível 2, e Diretoria se alcançou o Nível 3. Considera informado quem tem entrega aceita (SENT) no outbox para o e-mail do perfil.",
    missingData: "Traço quando não há lacuna.",
    limitations: ["Aproximação: a decisão final de reemitir é do ciclo."],
  }),
  def({
    id: "planejamento.reemissao.col-bloqueio",
    kind: "table",
    title: "Coluna Bloqueio manual",
    shortDescription: "Indica se a comunicação do caso está suspensa manualmente (Sim ou Não).",
    description: "Sim (suspenso) significa que há suspensão manual de comunicação vigente: o caso nunca é aprovado enquanto suspenso, mesmo a pedido.",
    consequences: ["Retome o caso antes de pedir a reemissão."],
  }),
  def({
    id: "planejamento.reemissao.col-situacao",
    kind: "table",
    title: "Coluna Situação",
    shortDescription: "Estado da decisão (sem decisão, aprovado aguardando o ciclo, reemitido) e a elegibilidade.",
    description:
      "Mostra o estado da decisão: Sem decisão, Aprovado aguardando o ciclo, Reemitido, Reemitido (caso subiu de etapa) ou Reemissão sem entrega (suprimida), e abaixo o motivo da elegibilidade, por exemplo Elegível, Caso não está aberto, Comunicação suspensa manualmente, Sem lacuna de comunicação ou Já aprovado e aguardando o ciclo.",
    source: "Retorno da função risk_alert_reissue_pending.",
  }),
  def({
    id: "planejamento.reemissao.justificativa",
    kind: "field",
    title: "Justificativa da decisão",
    shortDescription: "Texto obrigatório de 20 a 500 caracteres que fica na trilha de auditoria.",
    description:
      "Justificativa obrigatória da decisão, de 20 a 500 caracteres. Fica na trilha de auditoria: não inclua e-mails, documentos, telefones, números longos nem senhas, pois o banco recusa conteúdo sensível.",
    missingData: "Sem justificativa válida nada é registrado.",
  }),
  def({
    id: "planejamento.reemissao.confirmacao",
    kind: "field",
    title: "Confirmação da decisão",
    shortDescription: "Confirma que a ação só registra a decisão e não envia e-mail agora.",
    description: "Caixa obrigatória pela qual o administrador confirma que entende que aprovar apenas registra a decisão e que o envio depende do ciclo, do interruptor e das travas do piloto.",
  }),
  def({
    id: "planejamento.reemissao.aprovar",
    kind: "admin-action",
    title: "Aprovar reemissão",
    shortDescription: "Registra a decisão de reemitir os casos marcados; não envia e-mail.",
    description:
      "Grava, para cada caso marcado e elegível, a decisão do administrador na trilha de auditoria (RISK_ALERT_REISSUE_APPROVED). Casos não elegíveis são ignorados com o motivo. O resultado informa quantas decisões foram registradas e quantos casos foram ignorados e reforça que nenhum e-mail foi enviado.",
    consequences: ["A decisão fica vigente até ser consumida pelo ciclo; o envio real depende do interruptor de reemissão (desligado por padrão) e das travas do piloto."],
    permissions: "Somente ADMINISTRADOR da obra; a RPC revalida.",
    humanReview: "Decisão administrativa humana, auditável.",
  }),

  // =====================================================================================================================
  // /[projectId]/providencias
  // =====================================================================================================================
  def({
    id: "planejamento.providencias.pagina",
    kind: "page",
    title: "Providências e pendências para entrega",
    shortDescription: "Tabela única de providências de início e de entrega da obra; os alertas usam estes registros.",
    description:
      "Tabela única de providências da obra, nas fases Início da obra e Entrega, com data limite, responsável, situação, grau de risco, evidência e acompanhamento. Os alertas de providência são gerados a partir destes mesmos registros.",
    purpose: "Controlar o que precisa ser providenciado para iniciar e entregar a obra.",
    howToUse: ["Gestor, gerente ou administrador pode cadastrar o checklist inicial, adicionar providências e editar cada linha.", "Preencha a data final da obra para habilitar a janela de alertas de 60 dias."],
    howItWorks:
      "Os destaques são calculados por providência. Alertas de ENTREGA começam 60 dias corridos antes do término previsto da obra ou no prazo individual, o que vier antes; a providência permanece vencida até conclusão ou dispensa justificada.",
    source: "project_delivery_items do projeto e data final da obra.",
    permissions: "Membros veem; editar exige GESTOR, GERENTE ou ADMINISTRADOR.",
    limitations: ["Sem a migration do módulo a tela informa que o módulo não foi habilitado no ambiente."],
    humanReview: "A aplicabilidade, o risco e a conclusão de cada item são decididos por pessoas.",
  }),
  def({
    id: "planejamento.providencias.checklist-inicial",
    kind: "admin-action",
    title: "Cadastrar checklist inicial",
    shortDescription: "Cria as 14 providências padrão, sem datas, responsáveis nem comprovações.",
    description:
      "Disponível quando a tabela está vazia. Cria 14 providências sem datas, responsáveis nem comprovações. O checklist não comprova que cada item seja obrigação da construtora: confirme a aplicabilidade item a item.",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "A aplicabilidade de cada item precisa ser confirmada por uma pessoa.",
  }),
  def({
    id: "planejamento.providencias.nova-providencia",
    kind: "admin-action",
    title: "Nova providência da obra",
    shortDescription: "Adiciona uma providência específica, em fase Início ou Entrega, com risco Médio provisório.",
    description:
      "Cria uma providência específica da obra com título e fase. Ela começa com grau MÉDIO provisório, nunca crítico por padrão. Depois use Classificação de risco na linha: a sugestão pelos critérios pede cláusula, prazo, iminência e tempo para mitigação, e só a revisão com justificativa muda o grau.",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.aviso-data-final",
    kind: "message",
    title: "Término previsto e janela de alertas",
    shortDescription: "Data final da obra e início dos alertas de entrega 60 dias antes dela.",
    description:
      "Mostra o término previsto da obra e informa que os alertas de entrega começam 60 dias corridos antes (ou no prazo individual, se vencer antes). Sem a data final, só os prazos individuais geram alerta. Mostra também o prazo de referência do CNO.",
    formula: "Início dos alertas de entrega = data final da obra menos 60 dias corridos, ou o prazo individual quando for anterior.",
    source: "Data final da obra e prazos das providências; prazo do CNO calculado por lib/delivery/delivery-items.ts.",
    missingData: "Sem data final aparece aviso pedindo o preenchimento; não se presume data.",
  }),
  def({
    id: "planejamento.providencias.col-providencia",
    kind: "table",
    title: "Coluna Providência",
    shortDescription: "Título da providência e selos de atenção (sem responsável, sem prazo, vencido, bloqueia a entrega…).",
    description:
      "Título e selos calculados: Sem responsável e Sem prazo (itens abertos sem o dado), Próximo do vencimento (faltam 7 dias ou menos), Vencido (data limite anterior a hoje), Bloqueia a entrega, Aplicabilidade a confirmar e Risco a definir. Itens concluídos ou não aplicáveis não recebem os selos de atenção.",
    criteria: ["Só itens abertos (Pendente ou Em andamento) recebem selos de atenção.", "A data de referência é o dia corrido no fuso de Brasília."],
    source: "Regras em lib/delivery/delivery-items.ts (deliveryFlags).",
  }),
  def({
    id: "planejamento.providencias.col-fase",
    kind: "table",
    title: "Coluna Fase",
    shortDescription: "Início da obra ou Entrega.",
    description: "Fase da providência. Apenas as de Entrega entram na janela de alertas de 60 dias; as de Início são acompanhadas por prazo próprio.",
  }),
  def({
    id: "planejamento.providencias.col-data-limite",
    kind: "table",
    title: "Coluna Data limite",
    shortDescription: "Prazo da providência e, quando houver, o prazo interno.",
    description: "Data limite da providência e abaixo o prazo interno quando existir. Sem data aparece A definir.",
    missingData: "Mostra o texto A definir quando não há data; nunca se presume uma data.",
  }),
  def({
    id: "planejamento.providencias.col-responsavel",
    kind: "table",
    title: "Coluna Responsável",
    shortDescription: "Quem responde pela providência e eventual dependência externa.",
    description: "Responsável pela providência e, quando houver, a dependência externa (Cliente, Concessionária ou Terceiro) com o nome. A dependência não substitui o responsável interno.",
    missingData: "Mostra o texto A definir quando ninguém foi atribuído.",
  }),
  def({
    id: "planejamento.providencias.col-situacao",
    kind: "table",
    title: "Coluna Situação",
    shortDescription: "Status da providência: pendente, em andamento, concluída ou não aplicável.",
    description:
      "Status gravado da providência. Para Não aplicável a justificativa é exibida abaixo. Mudar o status pelo editor da linha registra o histórico; Concluído exige evidência ou justificativa de usuário autorizado e Não aplicável exige justificativa.",
    humanReview: "Dispensar uma providência exige justificativa humana.",
  }),
  def({
    id: "planejamento.providencias.col-risco",
    kind: "table",
    title: "Coluna Grau de risco",
    shortDescription: "Grau de risco da providência e o intervalo de repetição dos lembretes.",
    description:
      "Grau de risco da providência e o intervalo de repetição dos lembretes: crítico a cada 1 dia, alto a cada 2 dias, médio a cada 4 dias e baixo a cada 7 dias (dias corridos). A classificação inicial é provisória e só muda por revisão com justificativa.",
    source: "lib/alerts/repeat-policy.ts e revisões de classificação de risco.",
    missingData: "Mostra o texto A definir quando a providência ainda não foi classificada.",
    limitations: ["Os intervalos dos lembretes não são os prazos do SLA de ações."],
  }),
  def({
    id: "planejamento.providencias.col-evidencia",
    kind: "table",
    title: "Coluna Evidência / protocolo",
    shortDescription: "Comprovação da providência e número do CNO, quando existir.",
    description: "Evidência, documento ou protocolo que comprova a providência e, para o CNO, o número registrado.",
    missingData: "Mostra o texto A definir quando não há comprovação registrada.",
  }),
  def({
    id: "planejamento.providencias.col-acompanhamento",
    kind: "table",
    title: "Coluna Acompanhamento",
    shortDescription: "Quando os alertas desta providência começam e se está vencida.",
    description:
      "Mensagem do calendário de alertas: item encerrado, providência de início sem janela de 60 dias, falta de data final, alertas começam em tal data, dentro da janela, alerta pelo prazo individual ou prazo vencido (permanece vencida até conclusão ou dispensa).",
    source: "lib/delivery/delivery-items.ts (deliveryAlertSchedule).",
  }),
  def({
    id: "planejamento.providencias.col-acoes",
    kind: "table",
    title: "Coluna Ações (editor da linha)",
    shortDescription: "Edição de prazos, responsável, dependência, evidência, status e classificação de risco.",
    description:
      "Para quem pode editar: salvar campos da linha (data limite, prazo interno, responsável, dependência externa, número do CNO, evidência, bloqueia a entrega e aplicabilidade confirmada), alterar status com justificativa e abrir a Classificação de risco com histórico.",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),

  // =====================================================================================================================
  // /[projectId]/ledger, /ledger/[eventId], /ledger/lote-alertas/[batchId]
  // =====================================================================================================================
  def({
    id: "planejamento.ledger.pagina",
    kind: "page",
    title: "Eventos (Event Ledger)",
    shortDescription: "Registro cronológico de eventos com possível implicação contratual (administradores).",
    description:
      "Lista os eventos do projeto em ordem cronológica: data, título, fonte, categorias de impacto, status e a severidade do achado de IA, com link para o detalhe. É a base de evidências do ACC.",
    purpose: "Acompanhar eventos de contrato e abrir o detalhe com evidências, confronto e alertas.",
    source: "Eventos (contract_events) do projeto.",
    permissions: "Somente administradores do projeto; o menu também oculta a aba.",
    missingData: "Sem eventos mostra Nenhum evento registrado.",
    humanReview: "O achado de IA é sugestão; a decisão é humana.",
  }),
  def({
    id: "planejamento.ledger.col-data",
    kind: "table",
    title: "Coluna Data",
    shortDescription: "Data do evento; clique abre o detalhe.",
    description: "Data do evento registrado. A linha inteira leva ao detalhe do evento.",
  }),
  def({
    id: "planejamento.ledger.col-evento",
    kind: "table",
    title: "Coluna Evento",
    shortDescription: "Título do evento.",
    description: "Título do evento. Clique para abrir o detalhe com evidência original, confronto e anotações.",
  }),
  def({
    id: "planejamento.ledger.col-fonte",
    kind: "table",
    title: "Coluna Fonte",
    shortDescription: "Tipo da fonte de onde o evento veio (e-mail, documento, etc.).",
    description: "Tipo de fonte original do evento, usado para rastrear a origem da informação.",
  }),
  def({
    id: "planejamento.ledger.col-categorias",
    kind: "table",
    title: "Coluna Categorias",
    shortDescription: "Categorias de impacto atribuídas ao evento.",
    description: "Selos com as categorias de implicação contratual atribuídas ao evento.",
  }),
  def({
    id: "planejamento.ledger.col-status",
    kind: "table",
    title: "Coluna Status do evento",
    shortDescription: "Novo, Em Análise, Confrontado ou Resolvido.",
    description: "Situação do evento no fluxo de análise: Novo, Em Análise, Confrontado ou Resolvido.",
    source: "contract_events.status.",
  }),
  def({
    id: "planejamento.ledger.col-achado-ia",
    kind: "table",
    title: "Coluna Achado IA",
    shortDescription: "Severidade do achado de IA do evento; traço quando não há achado.",
    description: "Severidade do achado produzido pela análise de IA. É inferência sujeita a revisão humana. Traço significa que o evento não tem achado de IA.",
    humanReview: "Achado de IA exige revisão humana.",
    missingData: "Traço quando não há achado; não é severidade zero.",
  }),
  def({
    id: "planejamento.ledger-evento.pagina",
    kind: "page",
    title: "Detalhe do evento",
    shortDescription: "Evento com achado de IA, evidência original, confronto, anotações e revisão humana.",
    description:
      "Mostra o evento com data, fonte, autoria, status e categorias, o achado de IA, a evidência original, o confronto com outras fontes, as anotações, as ações via e-mail, a confrontação contratual com revisão humana e a curadoria multiagente.",
    purpose: "Revisar a evidência e decidir sobre o confronto entre evento e cláusula, separando fato, inferência e recomendação.",
    permissions: "Somente administradores veem a página; a revisão do confronto exige ADMINISTRADOR; a curadoria multiagente e a avaliação de atraso exigem GESTOR, GERENTE ou ADMINISTRADOR (o aviso em tela cita só GERENTE ou ADMINISTRADOR).",
    humanReview: "Toda confrontação definitiva exige revisão humana com justificativa.",
    limitations: ["Vindo de um alerta por e-mail, um aviso lembra que a resposta em Anotações do Evento fica vinculada ao evento."],
  }),
  def({
    id: "planejamento.ledger-evento.achado-ia",
    kind: "message",
    title: "Achado da IA",
    shortDescription: "Resumo, tipo, severidade e confiança do achado de IA; é inferência.",
    description:
      "Cartão com o tipo de achado, a severidade, o resumo e a confiança estimada em porcentagem. A confiança é estimativa do modelo, não garantia. Para administradores, oferece avaliar risco de atraso de cronograma e enviar o achado como alerta por e-mail.",
    humanReview: "Sugestão sujeita a revisão humana; não substitui a decisão da equipe.",
    limitations: ["É inferência de IA, distinta do fato registrado pela evidência."],
  }),
  def({
    id: "planejamento.ledger-evento.avaliar-atraso",
    kind: "button",
    title: "Avaliar risco de atraso de cronograma",
    shortDescription: "Dispara a avaliação de IA do risco de atraso para este evento.",
    description:
      "Aciona a avaliação de risco de atraso de cronograma do evento, que usa Experts de IA. Mostra a severidade anterior e a nova e indica se há decisão humana necessária.",
    consequences: ["Pode alterar a severidade do achado; o resultado fica gravado e rastreável."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR (revalidado no servidor).",
    humanReview: "IA prepara, humano dispara, resultado gravado; a decisão é humana.",
  }),
  def({
    id: "planejamento.ledger-evento.enviar-alerta",
    kind: "admin-action",
    title: "Enviar Alerta (e-mail de alerta de contrato)",
    shortDescription: "Envia o achado por e-mail ao colaborador escolhido, no padrão institucional do ACC.",
    description:
      "Envia o achado como alerta de e-mail a um usuário ativo e elegível do projeto. O e-mail traz os botões RESOLVIDO, EM ANDAMENTO, ENVIAR PARA e ESPECIALISTA. Em modo piloto o e-mail é redirecionado para a caixa de teste e o colaborador selecionado não o recebe; o aviso aparece acima do formulário.",
    howToUse: ["Escolha o destinatário.", "Clique em Enviar Alerta."],
    consequences: ["Cria o alerta e inicia seu ciclo de lembretes pelo grau de risco."],
    permissions: "ADMINISTRADOR.",
    limitations: ["Sem usuário ativo elegível a ação não é oferecida."],
  }),
  def({
    id: "planejamento.ledger-evento.evidencia",
    kind: "table",
    title: "Evidência original",
    shortDescription: "Origem preservada do evento: e-mail, documento ou versão, com localizador.",
    description:
      "Lista as evidências originais do evento com rótulo e localizador. Mostra o trecho do e-mail ou a versão do documento de onde o evento veio. É a fonte primária e nunca é alterada pela análise de IA.",
    humanReview: "Confira a evidência original antes de aceitar qualquer conclusão derivada.",
    missingData: "E-mail ou versão de documento não disponíveis são indicados como tal.",
  }),
  def({
    id: "planejamento.ledger-evento.confronto-fontes",
    kind: "table",
    title: "Confronto com outras fontes",
    shortDescription: "Referências cruzadas do evento com outros registros do projeto.",
    description: "Lista as referências cruzadas do evento: outras fontes do projeto relacionadas, com o tipo e a nota explicando a relação.",
    missingData: "Sem referências mostra Nenhuma referência cruzada registrada.",
  }),
  def({
    id: "planejamento.ledger-evento.anotacoes",
    kind: "table",
    title: "Anotações do Evento",
    shortDescription: "Informação declarada internamente; não é evidência confirmada documentalmente.",
    description:
      "Anotações registradas por pessoas sobre o evento, com categoria, autor e data. São informação declarada internamente: não são evidência, documento, e-mail ou cláusula e não foram confirmadas documentalmente. A resposta por e-mail via RESPONDER AO ACC também aparece aqui.",
    permissions: "Adicionar anotação: a ação confere no servidor que a pessoa é ADMINISTRADOR do projeto (o banco aplica a mesma exigência); a aba Eventos é restrita a administradores.",
    humanReview: "Tratar como declaração, não como prova.",
  }),
  def({
    id: "planejamento.ledger-evento.confrontacao",
    kind: "table",
    title: "Confrontação contratual — Revisão humana",
    shortDescription: "Candidatos de confronto Evento x Cláusula para aprovar ou rejeitar com justificativa.",
    description:
      "Cada cartão é um candidato de confronto entre o evento e uma cláusula, produzido por análise automatizada: cláusula, confiança, status, tipo de achado, severidade, fundamento do evento e da cláusula. Exige revisão humana antes de gerar confronto definitivo: o revisor aprova ou rejeita com justificativa específica, e a justificativa pode ser complementada depois por outra pessoa.",
    howToUse: ["Leia os fundamentos.", "Preencha a justificativa e use Aprovar relação ou Rejeitar."],
    consequences: ["Aprovação sem justificativa específica não pode ser usada como conclusão do confronto em alertas por e-mail até ser complementada."],
    permissions: "ADMINISTRADOR; demais perfis veem somente leitura.",
    humanReview: "O candidato é inferência de IA; só a decisão do revisor vale.",
  }),
  def({
    id: "planejamento.ledger-evento.curadoria",
    kind: "admin-action",
    title: "Executar análise multiagente (Curadoria multiagente)",
    shortDescription: "Roteia o evento aos Experts de IA competentes e consolida via CEO IA.",
    description:
      "Roteia o evento aos Experts IA competentes e consolida as posições via CEO IA, mostrando experts consultados, situação, divergências, recomendação e decisões humanas necessárias. Análise de IA sujeita a revisão humana; nenhuma ação é executada automaticamente.",
    consequences: ["Consome o limite de consultas de IA e grava o resultado de forma rastreável."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR; sem permissão aparece o aviso correspondente.",
    humanReview: "Resultado é recomendação; a decisão é humana.",
    limitations: ["Pode levar algum tempo; aguarde nesta tela."],
  }),
  def({
    id: "planejamento.ledger-lote.pagina",
    kind: "page",
    title: "Responder alertas de contrato (lote)",
    shortDescription: "Lote de alertas de contrato de um e-mail: defina uma ação para cada um e responda ao ACC.",
    description:
      "Mostra os alertas de um mesmo e-mail enviado ao responsável. Defina RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ para cada alerta; VER EVENTO é só consulta e não conta como resposta. A resposta ao ACC só é liberada quando todos tiverem ação.",
    howItWorks: "Abrir o link com os parâmetros acao e evento apenas pré-seleciona a ação do alerta; nada é gravado até o envio. Mesmo formulário do lote compacto aberto direto do e-mail.",
    source: "Lote de alertas de contrato (contract alert batch).",
    permissions: "Somente administradores veem a página dentro do ACC.",
    limitations: ["Lote não enviado ainda ou aguardando reprocessamento não aceita resposta; lote respondido fica somente leitura."],
  }),

  // =====================================================================================================================
  // /[projectId]/timeline
  // =====================================================================================================================
  def({
    id: "planejamento.timeline.pagina",
    kind: "page",
    title: "Timeline",
    shortDescription: "Linha do tempo cronológica dos eventos consolidados, com busca no acervo e exportação.",
    description:
      "Mostra todos os eventos do projeto em ordem cronológica, com filtros, busca no acervo e exportação. Cada evento leva ao detalhe do Ledger.",
    purpose: "Reconstituir a sequência de fatos e exportar um dossiê com rastreabilidade.",
    source: "Eventos, e-mails, documentos e anotações do projeto.",
    howItWorks: "Os filtros por fonte, categoria, período e participante aplicam-se à lista; a busca de texto pesquisa o acervo completo no servidor.",
    humanReview: "Exportar é ato humano e fica registrado em auditoria.",
  }),
  def({
    id: "planejamento.timeline.busca",
    kind: "filter",
    title: "Buscar palavra / assunto",
    shortDescription: "Pesquisa todo o acervo: e-mails, anexos, documentos, conteúdo extraído, Diário, Construmanager, relatórios, eventos e anotações.",
    description:
      "Campo de busca de texto que dispara uma pesquisa no acervo do projeto (com atraso curto após a digitação), mostrando progresso, itens examinados e o número de resultados. Respeita os demais filtros.",
    howToUse: ["Digite o termo.", "Acompanhe a barra de progresso e a contagem de resultados."],
    missingData: "Em caso de falha mostra Erro na busca com a mensagem.",
    limitations: ["O progresso na barra é indicativo; o total vem do servidor ao concluir."],
  }),
  def({
    id: "planejamento.timeline.filtro-fontes",
    kind: "filter",
    title: "Filtro Fontes",
    shortDescription: "Seleciona os tipos de fonte exibidos na timeline.",
    description: "Caixas por tipo de fonte, com opção de marcar ou limpar tudo. A seleção restringe a lista aos tipos marcados.",
  }),
  def({
    id: "planejamento.timeline.filtro-categorias",
    kind: "filter",
    title: "Filtro Categorias/Impactos",
    shortDescription: "Seleciona as categorias de impacto exibidas.",
    description: "Caixas por categoria de implicação contratual, com marcar ou limpar tudo.",
  }),
  def({
    id: "planejamento.timeline.filtro-periodo",
    kind: "filter",
    title: "Filtro de período",
    shortDescription: "Período da obra inteira ou intervalo definido por De e Até.",
    description:
      "Por padrão usa o período da obra (início e fim cadastrados). Desmarque Todo período da obra para informar as datas De e Até.",
    missingData: "Sem datas cadastradas na obra, o intervalo começa em branco.",
  }),
  def({
    id: "planejamento.timeline.filtro-participantes",
    kind: "filter",
    title: "Filtro Participantes (e-mail)",
    shortDescription: "Endereços de e-mail que aparecem nos e-mails do projeto, com a quantidade de eventos.",
    description: "Lista os endereços identificados nos e-mails do projeto, cada um com o número de eventos. Selecione para filtrar os eventos ligados a eles.",
    missingData: "Sem participantes identificados mostra a mensagem correspondente.",
  }),
  def({
    id: "planejamento.timeline.lista",
    kind: "table",
    title: "Lista da timeline",
    shortDescription: "Eventos em ordem cronológica, com seleção manual para exportação.",
    description:
      "Cada item é um evento com data, fonte, título, descrição, status e categorias, e leva ao detalhe. A caixa ao lado do evento seleciona manualmente o que exportar; sem seleção, todos os eventos filtrados são exportados.",
    howToUse: ["Marque eventos específicos para exportar, ou deixe sem marcar para exportar todos os filtrados."],
  }),
  def({
    id: "planejamento.timeline.exportar",
    kind: "button",
    title: "Exportar Timeline Filtrado",
    shortDescription: "Gera dossiê PDF, índice XLSX/CSV, arquivos originais ou ZIP dos eventos filtrados.",
    description:
      "Abre o painel de exportação, que informa quantos eventos serão exportados e resume os filtros. Formatos: Dossiê PDF, Índice XLSX/CSV, Arquivos originais e Tudo em ZIP. Ao confirmar, a exportação é gerada e um registro de auditoria é gravado com o ID da exportação.",
    howToUse: ["Clique em Exportar Timeline Filtrado.", "Marque os formatos.", "Clique em Confirmar exportação."],
    consequences: ["Grava auditoria da exportação; se a auditoria falhar, o arquivo foi gerado mas o erro é mostrado."],
    humanReview: "A exportação preserva as evidências originais, sem alterá-las.",
  }),

  // =====================================================================================================================
  // FECHAMENTO (A1) — campos dos formulários compartilhados de SLA (/acoes/configuracao e /usuarios)
  // =====================================================================================================================
  def({
    id: "planejamento.acoes-config.campo-timezone",
    kind: "field",
    title: "Timezone do projeto",
    shortDescription: "Fuso horário (nome IANA) em que o expediente e os prazos em horas ou dias úteis deste projeto são contados.",
    description:
      "Campo de texto com o identificador IANA do fuso do projeto, como America/Sao_Paulo (padrão institucional). Todo cálculo de horas úteis e dias úteis do SLA e a janela do resumo semanal dos alertas de risco usam esse fuso, nunca UTC.",
    purpose: "Garantir que o relógio do SLA e as janelas de alerta sigam o horário local da obra.",
    howToUse: ["Digite o identificador IANA do fuso (por exemplo America/Sao_Paulo).", "Clique em Salvar no fim do formulário."],
    criteria: ["Campo obrigatório.", "O servidor valida o nome com Intl.DateTimeFormat; nome desconhecido devolve a mensagem Timezone inválida e nada é gravado."],
    source: "Tabela sla_project_settings (uma linha por projeto); sem linha, vale o padrão America/Sao_Paulo, 08:00 às 18:00.",
    consequences: ["Vale para os prazos de ações NOVAS; ações já criadas mantêm os prazos já calculados."],
    permissions: "Somente ADMINISTRADOR do projeto (a política do banco recusa os demais e a alteração é auditada).",
    limitations: ["A tela não oferece lista de fusos: o texto precisa ser um identificador IANA válido."],
  }),
  def({
    id: "planejamento.acoes-config.campo-inicio-expediente",
    kind: "field",
    title: "Início do expediente",
    shortDescription: "Hora cheia (0 a 23) em que começa o dia útil usado para contar horas e dias úteis do SLA.",
    description:
      "Hora do dia, de 0 a 23, em que o expediente do projeto começa (padrão 8). O SLA em horas úteis ou dias úteis só avança entre o início e o fim do expediente, de segunda a sexta, descontando os feriados do calendário do projeto.",
    purpose: "Definir a janela diária em que o relógio do SLA corre.",
    howToUse: ["Informe um número inteiro de 0 a 23.", "Confira a linha Horário útil logo abaixo do formulário e clique em Salvar."],
    criteria: ["Campo obrigatório, numérico, de 0 a 23.", "O banco exige que o fim do expediente seja maior que o início."],
    source: "Coluna business_day_start_hour de sla_project_settings; padrão 8 sem configuração do projeto.",
    consequences: ["Vale para ações novas; ações já criadas não são recalculadas."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.campo-fim-expediente",
    kind: "field",
    title: "Fim do expediente",
    shortDescription: "Hora cheia (0 a 23) em que termina o dia útil; precisa ser maior que o início do expediente.",
    description:
      "Hora do dia, de 0 a 23, em que o expediente do projeto termina (padrão 18). Fora da janela entre início e fim, e em fins de semana e feriados do calendário configurado, o relógio do SLA em horas e dias úteis não avança.",
    purpose: "Definir o limite diário do expediente usado nos prazos úteis.",
    howToUse: ["Informe um número inteiro de 0 a 23, maior que o início.", "Clique em Salvar."],
    criteria: ["Campo obrigatório, numérico, de 0 a 23.", "Regra do banco: fim do expediente maior que o início; caso contrário o Salvar falha com a mensagem do banco."],
    source: "Coluna business_day_end_hour de sla_project_settings; padrão 18 sem configuração do projeto.",
    consequences: ["Vale para ações novas; ações já criadas não são recalculadas."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.salvar-fuso-expediente",
    kind: "button",
    title: "Salvar fuso e expediente",
    shortDescription: "Grava o fuso e o expediente do projeto; mostra Salvo ou o motivo da recusa.",
    description:
      "Envia fuso, início e fim do expediente ao servidor, que valida o fuso IANA e grava uma linha por projeto em sla_project_settings (inclui quem alterou). Em caso de sucesso aparece Salvo; em caso de erro, a mensagem em vermelho.",
    howToUse: ["Ajuste os três campos.", "Clique em Salvar e confira a mensagem."],
    consequences: ["Passa a valer para os prazos das ações criadas depois do salvamento.", "A alteração é registrada na auditoria de configuração do SLA."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.campo-nivel1-responsavel",
    kind: "field",
    title: "Nível 1 · Responsável",
    shortDescription: "Quem recebe e trata primeiro as ações e os alertas desta área.",
    description:
      "Seletor com a pessoa responsável direta (Nível 1) da área. É quem recebe a ação e o alerta de risco da área antes de qualquer escalonamento. Aceita participantes ativos do projeto e pré-cadastros aguardando o primeiro login; Não definido deixa a área sem responsável.",
    howToUse: ["Escolha a pessoa na lista ou Não definido.", "Clique em Salvar na linha da área."],
    criteria: ["Participante precisa estar ATIVO no projeto; pré-cadastro precisa estar aguardando o primeiro login. Do contrário o servidor recusa o salvamento."],
    consequences: ["Área sem Nível 1 deixa a ação sem responsável atribuído e o painel de alertas de risco marca revisão de configuração."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.campo-nivel1-corresponsavel",
    kind: "field",
    title: "Nível 1 · Corresponsável",
    shortDescription: "Segunda pessoa do Nível 1, disponível só para Engenharia e Planejamento; precisa ser diferente do responsável.",
    description:
      "Seletor de um corresponsável adicional no Nível 1. Só aparece nas áreas Engenharia e Planejamento. O servidor recusa o corresponsável em outras áreas e recusa escolher a mesma pessoa do responsável.",
    howToUse: ["Escolha uma pessoa diferente do Nível 1 · Responsável, ou Não definido.", "Clique em Salvar na linha da área."],
    criteria: ["Somente áreas Engenharia e Planejamento.", "Precisa ser pessoa diferente do responsável direto."],
    consequences: ["Em Planejamento, responsável e corresponsável formam o primeiro escalão que a Matriz reconhece para o envio do cronograma semanal por e-mail, quando esse recurso está ligado."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.campo-nivel2-gerencia",
    kind: "field",
    title: "Nível 2 · Gerência",
    shortDescription: "Quem recebe o primeiro escalonamento da área; se vazio, o escalonamento vai direto ao Nível 3.",
    description:
      "Seletor da pessoa da Gerência (Nível 2). Recebe o escalonamento quando o prazo do Nível 1 se esgota sem a ação ser assumida. Se ficar Não definido, o escalonamento segue direto para o Nível 3 (Diretoria).",
    howToUse: ["Escolha a pessoa ou Não definido.", "Clique em Salvar na linha da área."],
    criteria: ["Mesma validação do Nível 1: participante ativo ou pré-cadastro pendente."],
    consequences: ["O prazo para o Nível 2 agir é o da coluna Nível 2 da tabela de prazos do risco."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.campo-nivel3-diretoria",
    kind: "field",
    title: "Nível 3 · Diretoria",
    shortDescription: "Último nível do escalonamento da área; esgotado o prazo dele só se registra o limite atingido.",
    description:
      "Seletor da pessoa da Diretoria (Nível 3), último nível da cadeia. Recebe o escalonamento depois do Nível 2 (ou direto após o Nível 1 quando não há Nível 2). Não existe Nível 4: esgotado o prazo da Diretoria, apenas o limite de escalonamento atingido é registrado.",
    howToUse: ["Escolha a pessoa ou Não definido.", "Clique em Salvar na linha da área."],
    criteria: ["Mesma validação do Nível 1: participante ativo ou pré-cadastro pendente."],
    permissions: "Somente ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.acoes-config.salvar-area",
    kind: "button",
    title: "Salvar responsáveis da área",
    shortDescription: "Grava a cadeia de responsáveis somente da área da linha; cada área é salva separadamente.",
    description:
      "Grava, na tabela sla_area_responsibles, o responsável, o corresponsável (quando a área admite), a Gerência e a Diretoria da área da linha. As demais áreas não são alteradas. Aparece Salvo em caso de sucesso ou a mensagem do motivo da recusa.",
    howToUse: ["Ajuste os seletores da linha.", "Clique em Salvar da mesma linha."],
    consequences: ["Passa a valer para ações e alertas criados depois; ações abertas mantêm o responsável que já receberam."],
    permissions: "Somente ADMINISTRADOR do projeto (conferido no servidor).",
    limitations: ["Salvar numa linha não grava os seletores das outras áreas."],
  }),
  def({
    id: "planejamento.acoes-config.opcao-email",
    kind: "setting",
    title: "Opção E-mail da regra de risco",
    shortDescription: "Liga o envio de e-mail ao destinatário de cada nível quando a regra deste risco é aplicada.",
    description:
      "Caixa da regra de risco. Marcada, o ACC envia e-mail de alerta ao destinatário do nível (respeitando a lista permitida do piloto). Desmarcada, o escalonamento é registrado mas o destinatário aparece como suprimido, com o motivo NOTIFY_BY_EMAIL_DISABLED.",
    consequences: ["Sem a opção, nenhum e-mail sai para os destinatários dessa regra, embora o escalonamento continue sendo registrado."],
    permissions: "Somente ADMINISTRADOR do projeto; vale ao clicar em Salvar na linha.",
  }),
  def({
    id: "planejamento.acoes-config.opcao-confirmacao",
    kind: "setting",
    title: "Opção Confirmação da regra de risco",
    shortDescription: "Em ALTO e CRÍTICO, a resolução do alerta fica proposta e aguarda confirmação humana antes de encerrar.",
    description:
      "Caixa da regra de risco (campo requires_acknowledgment_confirmation). Marcada, quando alguém indica RESOLVIDO num alerta ALTO ou CRÍTICO, o caso vai para Resolução proposta, aguardando revisão humana, e só encerra quando a resolução for confirmada. Desmarcada, o caso encerra direto.",
    criteria: ["Só altera o comportamento de riscos ALTO e CRÍTICO (alertas imediatos)."],
    consequences: ["Com a opção, o alerta continua aberto até a confirmação; sem ela, a resolução informada já o encerra."],
    permissions: "Somente ADMINISTRADOR do projeto; vale ao clicar em Salvar na linha.",
    humanReview: "A confirmação da resolução é feita por pessoa, nunca pela IA.",
  }),
  def({
    id: "planejamento.acoes-config.opcao-justificativa",
    kind: "setting",
    title: "Opção Justificativa da regra de risco",
    shortDescription: "Exige texto de justificativa para resolver um alerta deste risco; sem ele a resolução é recusada.",
    description:
      "Caixa da regra de risco (campo requires_delay_justification). Marcada, ao resolver um alerta de risco desse grau o campo de justificativa passa a ser obrigatório: sem texto o ACC recusa a resolução com a mensagem A Matriz exige justificativa para este risco.",
    consequences: ["Quem resolve o alerta precisa explicar o atraso ou o tratamento em texto livre."],
    permissions: "Somente ADMINISTRADOR do projeto; vale ao clicar em Salvar na linha.",
  }),

  // =====================================================================================================================
  // FECHAMENTO (A1) — painel do piloto de alertas de risco por e-mail (linhas derivadas)
  // =====================================================================================================================
  def({
    id: "planejamento.acoes-config.piloto-timezone",
    kind: "message",
    title: "Timezone do projeto (painel do piloto)",
    shortDescription: "Fuso usado para a agenda do resumo semanal e para exibir as datas do painel do piloto.",
    description:
      "Mostra o fuso do projeto lido de sla_project_settings (padrão America/Sao_Paulo quando não configurado). É nele que o resumo semanal de riscos médios e baixos é agendado (quarta-feira às 07:00) e em que os horários do painel são exibidos.",
    source: "sla_project_settings.timezone; padrão America/Sao_Paulo.",
    howToUse: ["Para alterar o fuso use o formulário Fuso e expediente do projeto, nesta mesma tela."],
    limitations: ["Somente leitura: o painel do piloto não altera configuração."],
  }),
  def({
    id: "planejamento.acoes-config.piloto-proximo-consolidado",
    kind: "message",
    title: "Próximo consolidado",
    shortDescription: "Data e hora previstas do próximo resumo semanal de riscos médios e baixos.",
    description:
      "Data local da próxima janela do resumo semanal e hora de abertura (07:00), no fuso do projeto. A janela é sempre uma quarta-feira: depois da quarta às 07:00 a próxima é a quarta seguinte.",
    howItWorks: "Calculado na abertura da página por describeNextDigest a partir do relógio do servidor e do fuso; não consulta o envio real.",
    source: "Cálculo em lib/risk-alerts/digest-window.ts (quarta-feira, 07:00 locais).",
    limitations: ["É uma agenda calculada, não garantia de envio: o envio depende do piloto habilitado, de casos abertos e da lista de destinatários permitidos."],
  }),
  def({
    id: "planejamento.acoes-config.piloto-ultimo-consolidado",
    kind: "message",
    title: "Último consolidado",
    shortDescription: "Janela, situação e horário do último resumo semanal registrado na fila de envios do projeto.",
    description:
      "Mostra a janela (data da quarta-feira), a situação e, quando existir, o horário de envio do resumo semanal mais recente registrado na fila de envios (outbox). Situações: Pendente, Aceito pelo provedor, Falhou, Suprimido e Ignorado. Sem registro aparece nenhum.",
    source: "risk_alert_outbox, último registro do tipo DIGEST do projeto, por data de agendamento.",
    missingData: "Sem nenhum resumo registrado o painel mostra nenhum; isso não significa que a janela passou sem envio, apenas que não há registro.",
    limitations: ["Aceito pelo provedor significa que o provedor de e-mail recebeu a mensagem, não que o destinatário a leu."],
  }),
  def({
    id: "planejamento.acoes-config.piloto-suprimidos",
    kind: "kpi",
    title: "Suprimidos até agora",
    shortDescription: "Quantidade de envios do projeto registrados como suprimidos (não enviados), sem contar casos de teste.",
    description:
      "Contagem de registros da fila de envios do projeto com situação Suprimido, isto é, e-mails que o ACC decidiu não enviar. Um dos motivos é o destinatário não constar da lista permitida do piloto (PILOT_RECIPIENT_SUPPRESSED); outro é a opção E-mail desligada na Matriz.",
    formula: "Contagem de registros de risk_alert_outbox do projeto com status SUPPRESSED, excluídos os casos de TESTE do piloto.",
    source: "risk_alert_outbox (status SUPPRESSED) do projeto; casos de teste identificados por isPilotTestCase.",
    unit: "Quantidade de registros, desde o início do piloto neste projeto (sem janela de tempo).",
    refresh: "A cada abertura da página de configuração.",
    missingData: "Sem registros suprimidos o valor é 0 (contagem real); se a consulta não retornar contagem o painel assume 0.",
    limitations: ["Conta registros da fila, não pessoas: o mesmo destinatário pode somar várias vezes."],
  }),

  // =====================================================================================================================
  // FECHAMENTO (A1) — editor da linha de Providências
  // =====================================================================================================================
  def({
    id: "planejamento.providencias.campo-data-limite",
    kind: "field",
    title: "Data limite de finalização",
    shortDescription: "Prazo final da providência; base dos selos de vencimento e do calendário de alertas.",
    description:
      "Data (dia) até a qual a providência precisa estar concluída. Alimenta os selos Próximo do vencimento e Vencido, o calendário de alertas da coluna Acompanhamento e o prazo usado na classificação de risco.",
    howToUse: ["Escolha a data no calendário do campo.", "Clique em Salvar dados."],
    criteria: ["Campo opcional: vazio grava sem prazo (aparece A definir e o selo Sem prazo)."],
    missingData: "Sem data a providência é tratada como sem prazo, nunca como prazo zero.",
    consequences: ["Prazo anterior a hoje deixa a providência Vencida até concluir ou dispensar."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR (a função do banco recusa os demais).",
  }),
  def({
    id: "planejamento.providencias.campo-prazo-interno",
    kind: "field",
    title: "Prazo interno antecipado (opcional)",
    shortDescription: "Data interna anterior ao prazo legal; no CNO vale se for mais cedo que o prazo legal calculado.",
    description:
      "Data opcional que a equipe usa para antecipar a entrega. É gravada e exibida abaixo da data limite. Na providência de CNO, o prazo calculado é o início das atividades mais 30 dias, ou o prazo interno quando ele for anterior.",
    howToUse: ["Preencha somente se quiser um prazo mais cedo que a data limite.", "Clique em Salvar dados."],
    criteria: ["Opcional; vazio mantém apenas a data limite.", "Só a providência de CNO usa o prazo interno no cálculo do prazo legal."],
    source: "Coluna internal_deadline de project_delivery_items; cálculo do CNO em lib/delivery/delivery-items.ts (computeCnoDeadline).",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.campo-responsavel",
    kind: "field",
    title: "Responsável interno",
    shortDescription: "Colaborador ativo da obra que responde pela providência; A definir deixa o item sem responsável.",
    description:
      "Seletor com os colaboradores ATIVOS da obra. O servidor recusa quem não seja colaborador ativo. Trocar o responsável encaminha automaticamente o acompanhamento recorrente aberto da providência para a nova pessoa, sem reiniciar o calendário.",
    howToUse: ["Escolha a pessoa (ou A definir).", "Clique em Salvar dados."],
    criteria: ["Somente participantes com situação ATIVA na obra."],
    consequences: ["Item aberto sem responsável recebe o selo Sem responsável.", "O histórico da providência registra a alteração de campos e o acompanhamento ganha evento de encaminhamento."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.campo-dependencia",
    kind: "field",
    title: "Depende de",
    shortDescription: "Tipo da parte externa que condiciona a providência: Cliente, Concessionária ou Terceiro.",
    description:
      "Seletor do tipo de dependência externa: Cliente, Concessionária ou Terceiro (ou Ninguém externo). A dependência não substitui o responsável interno; ela só registra de quem a providência depende. Ao escolher um tipo, o nome da parte é obrigatório.",
    howToUse: ["Escolha o tipo e preencha Quem na caixa ao lado.", "Escolha Ninguém externo para remover a dependência."],
    criteria: ["Tipo escolhido sem o nome da parte externa: o servidor recusa com a mensagem pedindo quem é a parte externa."],
    consequences: ["Ninguém externo apaga também o nome da parte externa gravado."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.campo-dependencia-nome",
    kind: "field",
    title: "Quem (nome da parte externa)",
    shortDescription: "Nome do cliente, concessionária ou terceiro de quem a providência depende; obrigatório com um tipo escolhido.",
    description:
      "Texto livre com o nome da parte externa indicada em Depende de. É exibido na coluna Responsável da tabela, abaixo do responsável interno. É obrigatório quando há tipo de dependência e é apagado quando o tipo volta para Ninguém externo.",
    criteria: ["Obrigatório se Depende de estiver preenchido; espaços nas pontas são removidos."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.campo-cno",
    kind: "field",
    title: "Número do CNO",
    shortDescription: "Número do Cadastro Nacional de Obras; aparece só na providência de inscrição no CNO.",
    description:
      "Campo de texto exibido somente na providência de CNO do checklist inicial, para registrar o número obtido. Quando há número informado, o ACC não propõe nova inscrição no CNO. Nas demais providências o campo fica oculto e o valor gravado é preservado.",
    criteria: ["Opcional; vazio é gravado como sem número."],
    missingData: "Sem número, a providência de CNO pode gerar a proposta de nova inscrição e os alertas de CNO por falta de responsável, prazo próximo ou atraso.",
    source: "Coluna cno_number de project_delivery_items; regras de CNO em lib/delivery/delivery-items.ts.",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "O número informado deve ser conferido com o comprovante oficial; o ACC não consulta a Receita Federal.",
  }),
  def({
    id: "planejamento.providencias.campo-evidencia",
    kind: "field",
    title: "Evidência / documento / protocolo (dados)",
    shortDescription: "Comprovação da providência; registrá-la nesta caixa não altera a situação.",
    description:
      "Texto com a referência da evidência, do documento ou do protocolo que comprova a providência. Gravar a evidência pelo botão Salvar dados NÃO conclui a providência: registra um evento próprio no histórico e deixa a situação como está.",
    howToUse: ["Informe o documento ou protocolo.", "Clique em Salvar dados. Para concluir, use o bloco Situação."],
    consequences: ["Quando a situação for alterada para Concluído sem nova evidência, a evidência gravada aqui é a usada."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "O ACC guarda a referência informada; conferir o documento em si é decisão humana.",
  }),
  def({
    id: "planejamento.providencias.campo-bloqueia-entrega",
    kind: "field",
    title: "Bloqueia a entrega",
    shortDescription: "Marca que a providência impede a entrega da obra enquanto estiver aberta.",
    description:
      "Caixa de marcação que indica que a pendência bloqueia a entrega. Marcada, a linha recebe o selo Bloqueia a entrega e o lembrete por e-mail da providência informa que ela bloqueia a entrega.",
    consequences: ["Não conclui nem dispensa a providência; é apenas um sinal de prioridade e de impacto."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.campo-aplicabilidade",
    kind: "field",
    title: "Aplicabilidade e responsabilidade contratual confirmadas",
    shortDescription: "Confirma que o item realmente é obrigação da construtora; sem isso a linha mostra Aplicabilidade a confirmar.",
    description:
      "O checklist inicial não comprova que cada item seja obrigação contratual da construtora. Esta caixa registra que uma pessoa confirmou a aplicabilidade e a responsabilidade. Desmarcada, a linha mostra o selo Aplicabilidade a confirmar.",
    consequences: ["A informação também é enviada como contexto à consulta de IA do alerta (confirmada por pessoa: sim ou não)."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "A confirmação é um ato humano; nenhuma IA marca esta caixa.",
  }),
  def({
    id: "planejamento.providencias.salvar-dados",
    kind: "button",
    title: "Salvar dados da providência",
    shortDescription: "Grava data limite, prazo interno, responsável, dependência, CNO, evidência e as duas caixas, com histórico.",
    description:
      "Envia ao servidor todos os campos do bloco Dados da providência por uma função do banco que confere a permissão, valida o responsável ativo e a dependência, grava e registra no histórico quais campos mudaram. O grau de risco não é enviado por este botão.",
    consequences: ["Cria evento Campos atualizados no histórico da providência; mudança de evidência cria também o evento Evidência registrada.", "Não altera a situação (Pendente, Em andamento, Concluído ou Não aplicável)."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR (o banco recusa os demais com mensagem).",
  }),
  def({
    id: "planejamento.providencias.campo-nova-situacao",
    kind: "field",
    title: "Nova situação",
    shortDescription: "Escolhe a nova situação: Pendente, Em andamento, Concluído ou Não aplicável (a atual não aparece).",
    description:
      "Seletor com as demais situações possíveis da providência. Concluído exige evidência ou justificativa; Não aplicável exige justificativa. Escolher a situação em que a providência já está é recusado.",
    howToUse: ["Escolha a nova situação.", "Preencha justificativa e/ou evidência quando exigidas e clique em Confirmar situação."],
    criteria: ["Concluído: precisa de evidência (informada agora ou já gravada) ou de justificativa.", "Não aplicável: precisa de justificativa."],
    consequences: ["Concluído ou Não aplicável encerram o acompanhamento recorrente aberto da providência."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "Concluir ou dispensar uma providência é decisão humana, sempre com histórico.",
  }),
  def({
    id: "planejamento.providencias.campo-justificativa",
    kind: "field",
    title: "Justificativa da situação",
    shortDescription: "Obrigatória para Não aplicável; ao concluir, vale como comprovação quando não há evidência.",
    description:
      "Texto que explica a mudança de situação. É obrigatório para Não aplicável e serve como comprovação para Concluído quando não houver evidência. Fica registrado no histórico junto com a mudança de situação.",
    criteria: ["Vazia com Não aplicável: o servidor recusa.", "Vazia com Concluído e sem evidência: o servidor recusa."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "Dispensar uma providência exige justificativa humana revisável no histórico.",
  }),
  def({
    id: "planejamento.providencias.campo-evidencia-conclusao",
    kind: "field",
    title: "Evidência / documento / protocolo (para concluir)",
    shortDescription: "Comprovação usada ao concluir; se vier vazia, vale a evidência já gravada na providência.",
    description:
      "Campo de evidência do bloco Situação, já preenchido com a evidência gravada. Se informado, substitui a evidência da providência ao confirmar; se vazio, vale a que já estava gravada. Concluir exige evidência ou justificativa.",
    criteria: ["Sem evidência (nova ou gravada) e sem justificativa, a conclusão é recusada."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.providencias.confirmar-situacao",
    kind: "button",
    title: "Confirmar situação",
    shortDescription: "Aplica a nova situação com justificativa e evidência, registra o histórico e atualiza os acompanhamentos.",
    description:
      "Envia a nova situação ao servidor, que confere a permissão, exige evidência ou justificativa quando a regra pede, grava quem concluiu e quando, e registra no histórico o texto situação anterior para nova situação. Concluído e Não aplicável resolvem o acompanhamento recorrente aberto.",
    consequences: ["Encerra os lembretes recorrentes da providência quando a situação passa a Concluído ou Não aplicável.", "Se a providência já estiver na situação escolhida, o servidor recusa."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR; o ACC pede confirmação de usuário autorizado para concluir ou alterar a situação.",
  }),

  // =====================================================================================================================
  // FECHAMENTO (A1) — classificação de risco (RiskReviewPanel, seção do evento e aviso pré-envio)
  // =====================================================================================================================
  def({
    id: "planejamento.risco.painel",
    kind: "setting",
    title: "Classificação de risco",
    shortDescription: "Mostra o grau de risco, os critérios, a sugestão do sistema e o histórico de revisões do evento ou da providência.",
    description:
      "Painel que reúne o grau de risco atual, os critérios de classificação, o formulário de revisão (para gestor, gerente e administrador), a sugestão calculada por regras e o histórico das revisões. A sugestão apoia a decisão e nunca altera o alerta: só a revisão registrada com justificativa muda o grau.",
    purpose: "Permitir que uma pessoa autorizada confirme ou corrija o grau de risco com justificativa rastreável.",
    howItWorks: "A sugestão é recalculada na tela a cada declaração e novamente no servidor ao registrar, com cláusula, evidência e prazo lidos do banco (lib/risk-classification/suggest-risk.ts).",
    source: "Evento: classificação inicial da IA em event_ai_assessments e revisões em risk_classification_reviews. Providência: coluna risk de project_delivery_items e as mesmas revisões.",
    permissions: "Ver: quem acessa a tela. Revisar: GESTOR, GERENTE ou ADMINISTRADOR da obra.",
    humanReview: "Toda sugestão exige revisão humana; a classificação original da IA ou inicial é preservada.",
  }),
  def({
    id: "planejamento.risco.grau-atual",
    kind: "status",
    title: "Grau de risco atual",
    shortDescription: "Grau vigente (Crítico, Alto, Médio, Baixo ou A definir) e o intervalo de repetição dos lembretes.",
    description:
      "Grau vigente do registro e a frequência com que o alerta se repete: Crítico a cada 1 dia, Alto a cada 2 dias, Médio a cada 4 dias e Baixo a cada 7 dias (dias corridos). Quando uma revisão mudou o grau, aparece também a classificação original, preservada.",
    source: "Última revisão em risk_classification_reviews; sem revisão, a classificação da IA (evento) ou a inicial (providência). Intervalos em lib/alerts/repeat-policy.ts.",
    missingData: "Sem classificação aparece A definir.",
    limitations: ["Os intervalos de repetição dos lembretes não são os prazos do SLA de ações."],
  }),
  def({
    id: "planejamento.risco.criterios",
    kind: "message",
    title: "Critérios de classificação",
    shortDescription: "Definição dos quatro graus: Crítico, Alto, Médio e Baixo, sem número de dias que os separe.",
    description:
      "Lista expansível com o critério de cada grau. Crítico: risco iminente de descumprimento e penalização contratual, com necessidade de ação imediata. Alto: iminente, mas ainda existe tempo para mitigação. Médio: possível consequência a médio prazo. Baixo: risco processual, de acompanhamento e organização.",
    limitations: ["Não existe número de dias que separe os níveis: iminência e tempo de mitigação são informados por quem revisa."],
    source: "RISK_CRITERIA em lib/risk-classification/suggest-risk.ts.",
  }),
  def({
    id: "planejamento.risco.revisar",
    kind: "admin-action",
    title: "Revisar classificação",
    shortDescription: "Formulário para declarar natureza, prazo, iminência e mitigação e registrar um novo grau com justificativa.",
    description:
      "Formulário exibido só a gestor, gerente ou administrador. Ao registrar, o servidor recalcula a sugestão com os dados do banco, grava a revisão no histórico (grau anterior, novo, sugestão, justificativa, referência e autor) e passa o acompanhamento recorrente aberto ao intervalo do novo grau.",
    consequences: ["O novo grau passa a valer no registro; o próximo lembrete já agendado não é antecipado nem adiado.", "Em providência, o histórico da providência ganha o evento Risco revisado."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR da obra dona do registro; os demais veem apenas o aviso de restrição.",
    humanReview: "A decisão do grau é humana; a sugestão é apoio.",
  }),
  def({
    id: "planejamento.risco.campo-natureza",
    kind: "field",
    title: "Natureza do risco",
    shortDescription: "Declara se o risco é possível descumprimento contratual, processual ou ainda a confirmar.",
    description:
      "Seletor com A confirmar, Possível descumprimento contratual e Processual (acompanhamento e organização). Processual sugere Baixo. Possível descumprimento abre a análise de iminência, penalidade e tempo de mitigação. A confirmar deixa a sugestão indeterminada.",
    criteria: ["Processual: sugestão Baixo.", "Descumprimento contratual: depende de iminência, penalidade com cláusula e tempo de mitigação.", "A confirmar: nenhuma sugestão."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "É uma declaração da pessoa revisora, não um fato do documento.",
  }),
  def({
    id: "planejamento.risco.campo-prazo-contratual",
    kind: "field",
    title: "Prazo contratual aplicável",
    shortDescription: "Declara se o prazo contratual já venceu, ainda não venceu ou não existe (somente em eventos).",
    description:
      "Seletor A confirmar, Já vencido, Ainda não venceu e Sem prazo contratual, exibido apenas na revisão de eventos. Prazo vencido é o único dado que o ACC trata como fato derivado: conta como descumprimento em curso e torna a iminência afirmativa.",
    criteria: ["Já vencido: iminência considerada SIM na sugestão.", "A confirmar: entra na lista de informações faltantes."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.risco.prazo-providencia",
    kind: "message",
    title: "Prazo da providência (na revisão de risco)",
    shortDescription: "Na revisão de providências o prazo vem do próprio registro e não pode ser digitado.",
    description:
      "Em vez do seletor de prazo, a revisão de uma providência mostra a data limite cadastrada (ou sem prazo cadastrado) e se está vencida. O servidor ignora qualquer prazo vindo do navegador e usa o do registro.",
    source: "Data limite da providência (project_delivery_items.deadline).",
    missingData: "Sem data limite aparece sem prazo cadastrado e o prazo é tratado como desconhecido.",
  }),
  def({
    id: "planejamento.risco.campo-iminencia",
    kind: "field",
    title: "O descumprimento é iminente?",
    shortDescription: "Declara se o descumprimento é iminente (Sim, Não ou A confirmar); nunca é calculado por número de dias.",
    description:
      "Seletor A confirmar, Sim ou Não. Quando a natureza é descumprimento contratual: sem penalidade confirmada em cláusula, iminência Sim sugere Médio; com penalidade confirmada, Sim sugere Alto ou Crítico conforme o tempo de mitigação. Não sugere Médio. Prazo vencido torna a resposta Sim automaticamente.",
    criteria: ["O ACC não deduz iminência por número de dias."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "É julgamento da pessoa revisora.",
  }),
  def({
    id: "planejamento.risco.campo-mitigacao",
    kind: "field",
    title: "Ainda há tempo para mitigação?",
    shortDescription: "Declara se ainda dá tempo de mitigar: Sim, Não ou A confirmar; distingue Alto de Crítico.",
    description:
      "Seletor A confirmar, Sim (há tempo) ou Não (não há tempo). Só pesa quando há descumprimento iminente com penalidade confirmada em cláusula: Não sugere Crítico e Sim sugere Alto.",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "É julgamento da pessoa revisora.",
  }),
  def({
    id: "planejamento.risco.campo-consequencia",
    kind: "field",
    title: "Consequência/penalidade contratual prevista (opcional)",
    shortDescription: "Descreve a penalidade; só conta como prevista se confirmada em cláusula verificada.",
    description:
      "Texto livre (até 600 caracteres) com a consequência ou penalidade contratual esperada. A penalidade só entra na sugestão como fato quando há descrição E a confirmação de que está prevista na cláusula verificada vinculada; sem isso, é tratada como pendência.",
    criteria: ["Sem cláusula verificada vinculada não é possível confirmar penalidade."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.risco.confirmar-consequencia",
    kind: "field",
    title: "Confirmo que esta consequência está prevista na cláusula",
    shortDescription: "Confirma que a penalidade informada consta da cláusula verificada; sem cláusula vinculada a opção não existe.",
    description:
      "Caixa exibida quando há cláusula verificada vinculada ao registro. Marcada junto com a descrição da consequência, a penalidade passa a contar como prevista em contrato na sugestão. Sem cláusula vinculada, o painel avisa que a penalidade não pode ser tratada como prevista.",
    humanReview: "A pessoa revisora deve conferir a cláusula antes de marcar.",
  }),
  def({
    id: "planejamento.risco.sugestao",
    kind: "message",
    title: "Sugestão do sistema",
    shortDescription: "Grau sugerido pelos critérios, com a incerteza e os passos separados em Fato, Inferência e Recomendação.",
    description:
      "Resultado do cálculo por regras: um grau (com incerteza baixa, média ou alta) ou indeterminada quando os dados não distinguem os níveis. Cada passo é marcado como Fato (dado com referência), Inferência (consequência lógica dos critérios) ou Recomendação (o que confirmar). Atualiza ao vivo conforme as declarações.",
    howItWorks: "Função pura suggestRisk: sem número de dias, usa natureza, prazo vencido, iminência, tempo de mitigação e penalidade com cláusula.",
    limitations: ["Não escolhe um grau quando faltam dados; não altera o alerta."],
    humanReview: "Sempre exige revisão humana antes de qualquer registro.",
  }),
  def({
    id: "planejamento.risco.base-fato-inferencia",
    kind: "message",
    title: "Fato, Inferência e Recomendação",
    shortDescription: "Código de cores dos passos da sugestão: verde para fato, azul para inferência, âmbar para recomendação.",
    description:
      "Cada linha da sugestão traz o rótulo do tipo de afirmação. Fato vem de dado com referência consultável (cláusula, evidência, prazo). Inferência é conclusão lógica dos critérios sobre os fatos. Recomendação indica o que confirmar antes de decidir.",
    humanReview: "O ACC mantém a distinção para a pessoa revisora não tratar inferência como fato.",
  }),
  def({
    id: "planejamento.risco.campo-novo-grau",
    kind: "field",
    title: "Grau de risco a registrar",
    shortDescription: "Grau que será gravado na revisão; vem pré-selecionado com a sugestão quando ela é definida.",
    description:
      "Seletor com Crítico, Alto, Médio e Baixo, cada um com o intervalo de repetição. Se a sugestão estiver definida, ele vem preenchido com ela, mas a pessoa pode escolher outro. O servidor recusa registrar o mesmo grau que já vale.",
    consequences: ["O acompanhamento recorrente aberto passa ao intervalo do novo grau: crítico 24 horas, alto 48, médio 96 e baixo 168."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.risco.campo-referencia",
    kind: "field",
    title: "Referência verificável (opcional)",
    shortDescription: "Cláusula, documento ou protocolo que sustenta a decisão; guardada no histórico (até 300 caracteres).",
    description:
      "Texto curto, até 300 caracteres, com a referência que apoia o novo grau. É gravado no histórico da classificação e exibido como Referência.",
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
  }),
  def({
    id: "planejamento.risco.campo-justificativa",
    kind: "field",
    title: "Justificativa da revisão (obrigatória)",
    shortDescription: "Explicação obrigatória do novo grau; sem ela o servidor recusa o registro.",
    description:
      "Texto que justifica a classificação escolhida. É obrigatório tanto na tela quanto no servidor e fica no histórico de classificação, com autor e data, para auditoria.",
    criteria: ["Vazia: a revisão é recusada."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR.",
    humanReview: "É o registro da decisão humana.",
  }),
  def({
    id: "planejamento.risco.registrar",
    kind: "button",
    title: "Registrar classificação",
    shortDescription: "Grava a revisão no histórico e passa a valer o novo grau; exige grau diferente do atual e justificativa.",
    description:
      "Envia a revisão a uma função do banco que confere a permissão na obra dona do registro, exige justificativa e grau diferente do atual, grava a revisão e atualiza o grau (em providências, a coluna de risco). Mostra a confirmação ou a mensagem de recusa.",
    consequences: ["Cria uma nova linha no histórico de classificação, sem apagar as anteriores.", "Atualiza o intervalo de repetição do acompanhamento aberto."],
    permissions: "GESTOR, GERENTE ou ADMINISTRADOR da obra.",
  }),
  def({
    id: "planejamento.risco.historico",
    kind: "table",
    title: "Histórico de classificação",
    shortDescription: "Lista as revisões do grau, da mais recente à mais antiga, com autor, data, sugestão e justificativa.",
    description:
      "Cada item mostra o grau anterior e o novo, quem revisou, quando (horário de Brasília), a sugestão do sistema na ocasião, a justificativa e a referência. Sem revisões vale a classificação original.",
    source: "risk_classification_reviews do registro.",
    missingData: "Sem revisão aparece a mensagem de que vale a classificação original.",
  }),
  def({
    id: "planejamento.risco.aviso-pre-envio",
    kind: "message",
    title: "Aviso de classificação antes do envio do alerta",
    shortDescription: "Informa o grau atual, se já foi revisado por pessoa e o que falta confirmar antes de enviar o alerta.",
    description:
      "Nota exibida antes do botão Enviar Alerta. Diz o grau vigente e se é classificação automática ainda não revisada ou revisada por pessoa autorizada. Se não foi revisada, lista as informações que os critérios ainda não distinguem. Não bloqueia o envio nem altera nada.",
    howItWorks: "Usa a mesma sugestão da revisão com os fatos que o ACC já tem (cláusula, evidências, prazo); natureza, iminência e mitigação ficam desconhecidas.",
    consequences: ["Verde: já revisada por pessoa. Âmbar: recomenda confirmar a classificação na seção Classificação de risco antes de enviar."],
    humanReview: "A confirmação do grau antes do envio é decisão humana.",
  }),

  // =====================================================================================================================
  // FECHAMENTO (A1) — anotações do evento e busca no acervo da Timeline
  // =====================================================================================================================
  def({
    id: "planejamento.ledger-evento.anotacao-categoria",
    kind: "field",
    title: "Categoria da anotação",
    shortDescription: "Classifica a anotação: Contexto Operacional, Informação Comercial, Observação Jurídica, Planejamento, Financeiro ou Outros.",
    description:
      "Seletor com seis categorias, obrigatório. A categoria é gravada com a anotação e exibida na lista e nas consultas de IA como Contexto interno declarado, nunca como evidência documental.",
    howToUse: ["Escolha a categoria mais próxima do assunto.", "Escreva a anotação e clique em Adicionar anotação."],
    criteria: ["Valor fora das seis categorias é recusado."],
    permissions: "Ação restrita a ADMINISTRADOR do projeto, conferida no servidor.",
  }),
  def({
    id: "planejamento.ledger-evento.anotacao-texto",
    kind: "field",
    title: "Nova anotação",
    shortDescription: "Texto livre de contexto interno sobre o evento; declaração da equipe, não evidência.",
    description:
      "Campo de texto obrigatório para registrar contexto interno, como informação verbal ou prática do projeto. A anotação fica vinculada ao evento, com autor e data, e é entregue às consultas de IA marcada como declarada e não confirmada documentalmente.",
    criteria: ["Obrigatório; texto vazio é recusado."],
    limitations: ["Não substitui documento, e-mail ou cláusula e não prova o fato."],
    humanReview: "Tratar como declaração, não como prova.",
  }),
  def({
    id: "planejamento.ledger-evento.anotacao-adicionar",
    kind: "button",
    title: "Adicionar anotação",
    shortDescription: "Grava a anotação no evento, com seu nome e a data, e registra na auditoria do projeto.",
    description:
      "Insere a anotação em event_notes com o autor logado. A ação confere no servidor que a pessoa é administradora do projeto e o banco aplica a mesma exigência. Em caso de sucesso a lista se atualiza; em erro, a mensagem aparece em vermelho.",
    consequences: ["A página do evento e a auditoria do projeto são revalidadas.", "A anotação passa a ser lida pelos especialistas de IA como contexto declarado."],
    permissions: "ADMINISTRADOR do projeto.",
  }),
  def({
    id: "planejamento.timeline.resultados-acervo",
    kind: "table",
    title: "Resultados da busca no acervo",
    shortDescription: "Ocorrências do termo pesquisado em e-mails, anexos, documentos, Diário, Construmanager, relatórios, eventos e anotações.",
    description:
      "Lista cronológica (da mais antiga à mais recente) dos itens do acervo do projeto que contêm todas as palavras pesquisadas, sem diferenciar maiúsculas e acentos. Cada resultado mostra a data, o tipo (E-mail, Anexo de e-mail, Documento, Conteúdo de documento, Construmanager, Diário de Obra, Relatório Semanal, Evento ou Anotação), a fonte, onde houve a ocorrência, o título e um trecho de cerca de 340 caracteres em torno do termo. Clicar abre o item original.",
    howToUse: ["Digite o termo no campo Buscar palavra / assunto.", "Clique no resultado para abrir o e-mail, documento, evento ou relatório de origem."],
    criteria: ["Todas as palavras do termo precisam aparecer no item.", "Respeita os filtros de fontes, categorias, período e participantes quando aplicáveis."],
    source: "Consulta ao banco por projeto: emails (somente dentro do escopo do projeto), email_attachments, documents e suas versões e textos extraídos, construmanager_documents, diario_de_obra_reports, weekly_report_sheets, contract_events e event_notes.",
    missingData: "Sem ocorrência aparece Nenhum item do acervo contém a palavra ou expressão pesquisada; conteúdo de anexo ainda não extraído não é pesquisado.",
    limitations: ["Busca textual simples, não semântica.", "Um trecho exibido é recorte do texto original; abra o item de origem para conferir o contexto."],
    humanReview: "O resultado localiza evidências; não as interpreta nem altera os originais.",
  }),
  def({
    id: "planejamento.consulta-ia.roteamento",
    kind: "message",
    title: "Roteamento da consulta",
    shortDescription: "Explica qual especialista respondeu e por quê, ou que a consulta foi multidisciplinar.",
    description:
      "Texto do motivo do roteamento. Se uma especialidade foi escolhida, ela é respeitada. Em Geral (pelo assunto), o ACC classifica o assunto: um tema vai a um especialista; assuntos multidisciplinares geram um parecer por especialista mais a consolidação do CEO IA. A AXIA, assistente de dúvidas de uso do ACC, nunca participa.",
    source: "Roteamento por assunto em lib/ai/routing/expert-topics.ts e orquestração em lib/ai/alert-consult/run-alert-consult.ts.",
    limitations: ["Classificação por regras de assunto; pode não acertar quando o texto do alerta é ambíguo, caso em que convém escolher a especialidade manualmente."],
    humanReview: "A resposta é apoio; a decisão sobre o alerta é humana.",
  }),
];
