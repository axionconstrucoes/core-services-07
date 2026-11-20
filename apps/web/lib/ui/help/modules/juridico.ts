// Catálogo de ajuda do módulo "juridico" — arquivo EXCLUSIVO do agente/módulo (não editar em outros módulos).
// Regras de conteúdo: ver lib/ui/help/types.ts. Ids novos: "modulo.tela.elemento".
// Cobre: Jurídico (obra e análise pré-contratual), Documentos (abas, upload, versões, hierarquia, anexos, e-mail), Revisão de Cláusulas,
// Revisão Contratual e Start-up ACC. Texto escrito a partir do código das telas/ações (citado em `source`/`howItWorks`); nada inventado.
import type { FeatureHelpDefinition } from "../types";

const V = "2026-11-20";
const M = "juridico";

const HUMAN =
  "Toda saída automática (extração, detecção, resposta de IA) é apoio à decisão: só vale como fato contratual depois da conferência de uma pessoa com o documento original.";

export const JURIDICO_HELP: FeatureHelpDefinition[] = [
  // =====================================================================================================================
  // /[projectId]/juridico
  // =====================================================================================================================
  {
    id: "juridico.projeto.pagina",
    title: "Jurídico",
    shortDescription: "Base documental contratual, consulta ao especialista jurídico e suas consultas privadas.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Tela do espaço jurídico do projeto. Em obra contratada mostra o card Base documental (contrato, aditivos e anexos vinculados), o painel de pergunta ao especialista jurídico e o histórico Minhas consultas jurídicas. Em análise pré-contratual (minuta ainda em negociação) mostra o card do documento da negociação, o painel de pergunta, a análise integrada com todos os especialistas e o histórico privado.",
    purpose: "Reunir num só lugar o que o contrato diz e permitir perguntas ao especialista jurídico sobre os documentos carregados.",
    howToUse: [
      "Use Gerenciar documentos para enviar ou conferir contrato, aditivos e anexos (tela Documentos).",
      "Escreva a pergunta no painel do especialista e clique em Consultar; a resposta é salva no seu histórico privado.",
      "Abra ou exclua consultas antigas em Minhas consultas jurídicas.",
    ],
    howItWorks:
      "A página lê o projeto e os documentos gerenciados (getManagedDocuments). Em análise pré-contratual (workspaceType PRE_CONTRATUAL) a rota só abre para ADMINISTRADOR ativo do espaço; os demais recebem página não encontrada.",
    permissions:
      "Análise pré-contratual: somente ADMINISTRADOR ativo do espaço. Envio de documentos: ADMINISTRADOR, GESTOR ou GERENTE. A pergunta ao especialista exige ADMINISTRADOR ativo (validado no servidor).",
    limitations: [
      "No código atual a ação do servidor que responde à pergunta só aceita espaço pré-contratual; numa obra contratada o painel aparece, mas a consulta responde que o espaço não é uma análise jurídica pré-contratual.",
    ],
    humanReview: HUMAN,
  },
  {
    id: "juridico.projeto.base-documental",
    title: "Base documental",
    shortDescription: "Contratos, minutas, aditivos e anexos vinculados do projeto.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Lista os documentos que formam a base contratual do projeto: todo documento do tipo Contrato base ou Aditivo e qualquer documento que tenha um documento-pai (anexo contratual vinculado). Cada linha mostra o título e o tipo (selo); o resumo da versão mais recente aparece ao pairar sobre a linha.",
    purpose: "Conferir rapidamente quais documentos o especialista jurídico e a equipe consideram a base do contrato.",
    howToUse: ["Clique em Gerenciar documentos para enviar, versionar ou vincular documentos."],
    data: ["Título do documento", "Tipo documental", "Resumo da versão mais recente"],
    criteria: ["Entram documentos com tipo CONTRATO_BASE ou ADITIVO, ou com vínculo a um documento-pai (parentDocumentId)."],
    source: "Documentos do projeto (getManagedDocuments, lib/document-management.ts).",
    refresh: "A cada abertura da página (renderização no servidor).",
    missingData: "Sem documentos: exibe a mensagem Nenhum contrato, minuta, aditivo ou anexo cadastrado.",
    humanReview: "A lista mostra o que foi cadastrado; confirmar se está completa e atualizada é responsabilidade humana.",
  },
  {
    id: "juridico.projeto.consulta-especialista",
    title: "Consulta ao especialista jurídico",
    shortDescription: "Pergunta livre ao Consultor Jurídico de IA, com privacidade, limite diário e revisão humana.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Campo de pergunta e botão Consultar do especialista jurídico de IA. O servidor monta o contexto com os documentos contratuais legíveis do espaço, chama o provedor de IA e devolve uma resposta estruturada (inclusive comparação de cláusulas). A pergunta e a resposta são gravadas no histórico privado de quem perguntou.",
    purpose: "Tirar dúvidas e comparar cláusulas com base apenas nos documentos carregados, sem sair do ACC.",
    howToUse: [
      "Descreva o contexto e a pergunta de forma objetiva.",
      "Clique em Consultar e aguarde (a análise pode levar algum tempo).",
      "Leia o aviso de provedor: se aparecer provedor determinístico (fake), a resposta NÃO é IA real.",
    ],
    howItWorks:
      "A ação askLegalConsultantAction verifica acesso ao projeto, exige ADMINISTRADOR ativo, confirma que o espaço é pré-contratual, pré-verifica o limite de consultas, reserva uma unidade de consumo na fronteira do provedor (consulta recusada por documento ilegível não consome unidade) e só então consulta a IA. Falha ao gravar o histórico nunca derruba a resposta.",
    criteria: [
      "Limite diário de consultas de IA (tabela ai_consult_limits): 20 por usuário por dia, somando todas as obras, e 100 por obra por dia; o dia civil é o de America/Sao_Paulo. Atingido o limite, a consulta é recusada sem chamar a IA.",
      "O teto monetário em US$ existe no código, mas está desativado por padrão (chave enabled=false).",
    ],
    data: ["Texto da pergunta (até 8000 caracteres gravados)", "Texto extraído dos documentos contratuais do espaço"],
    source: "Documentos do espaço + especialista Consultor Jurídico (lib/ai/experts/legal-consultant).",
    consequences: ["Cada consulta aceita consome uma unidade do limite diário do usuário e da obra e fica registrada na trilha de uso."],
    permissions: "ADMINISTRADOR ativo do espaço. A consulta é privada: só o autor a vê.",
    limitations: [
      "Os limites 20/100 são valores operacionais gravados no banco, não política aprovada pela Diretoria, e podem ser ajustados pelo administrador da plataforma.",
      "A resposta se limita ao texto dos documentos carregados; base legal oficial não está disponível (nenhum corpus normativo versionado).",
    ],
    humanReview: "Resposta de IA com revisão humana obrigatória; nada é enviado ou aceito automaticamente.",
    validity: "Limites 20 por usuário/dia e 100 por obra/dia conforme migration 20261120120000 e lib/ai/governance/budget-options.ts.",
  },
  {
    id: "juridico.projeto.minhas-consultas",
    title: "Minhas consultas jurídicas",
    shortDescription: "Histórico privado: só o autor vê, abre e exclui as próprias consultas.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Lista as perguntas que você fez ao especialista jurídico neste projeto, da mais recente para a mais antiga, com data e hora. Abrir mostra a pergunta e a resposta completas; Excluir remove a consulta do seu histórico.",
    purpose: "Reler respostas anteriores sem repetir a pergunta (e sem gastar o limite diário de IA).",
    howToUse: ["Clique em Abrir para ver a consulta.", "Clique em Excluir para removê-la do seu histórico."],
    howItWorks:
      "A autoria vem sempre da sessão autenticada; toda leitura e exclusão filtra por author_user_id e é reforçada por RLS no banco. Nenhum outro membro do projeto, nem administrador pela interface do ACC, lista, abre ou exclui a sua consulta.",
    source: "Histórico privado de consultas jurídicas (módulo lib/legal/consultations.ts).",
    refresh: "A cada abertura da página.",
    missingData: "Sem consultas: mostra que você ainda não tem consultas salvas; se a tabela não existir no ambiente, informa que o histórico ainda não está disponível.",
    permissions: "Somente o autor da consulta.",
    limitations: [
      "Excluir remove a pergunta e a resposta do histórico no ACC; cópias técnicas (backups do banco, ainda sem prazo de rotação definido) e o que o provedor de IA tenha retido pela política dele não são apagadas.",
    ],
  },
  {
    id: "juridico.projeto.excluir-consulta",
    title: "Excluir consulta jurídica",
    shortDescription: "Remove a consulta do seu histórico; backups e retenção do provedor de IA não são apagados.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Botão que apaga uma consulta jurídica do seu histórico privado no ACC. O aviso ao lado informa o alcance real da exclusão.",
    purpose: "Dar a quem perguntou o controle sobre o próprio histórico.",
    consequences: [
      "A pergunta e a resposta somem do seu histórico no ACC.",
      "Não apaga cópias técnicas do banco nem o que o provedor de IA tenha retido pela política dele.",
    ],
    permissions: "Somente o autor da consulta.",
    source: "Ação de exclusão em app/[projectId]/juridico/consultas-actions.ts e lib/legal/consultations.ts.",
  },
  // =====================================================================================================================
  // /[projectId]/juridico/consulta/[consultationId]
  // =====================================================================================================================
  {
    id: "juridico.consulta.pagina",
    title: "Consulta jurídica",
    shortDescription: "Pergunta e resposta de uma consulta privada ao especialista jurídico.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Mostra uma consulta jurídica salva: a pergunta e a resposta estruturada do especialista (inclusive a comparação de cláusulas). A consulta é privada: se não for sua, ou não existir, a página não é encontrada.",
    purpose: "Reler uma resposta anterior e, se quiser, excluí-la do seu histórico.",
    howToUse: ["Use Voltar às minhas consultas para retornar ao Jurídico.", "Use o botão de exclusão para remover a consulta."],
    source: "Histórico privado de consultas jurídicas, via getOwnLegalConsultation (somente do autor).",
    permissions: "Somente o autor da consulta.",
    humanReview: HUMAN,
  },
  // =====================================================================================================================
  // /juridico (análises pré-contratuais)
  // =====================================================================================================================
  {
    id: "juridico.analises.pagina",
    title: "Jurídico — análise prévia",
    shortDescription: "Lista e criação de análises pré-contratuais (negociação de minutas antes da contratação).",
    kind: "page",
    module: M,
    version: V,
    description:
      "Tela fora de qualquer obra, para negociar minutas antes da contratação: cria uma análise pré-contratual (um espaço próprio, separado das obras assinadas) e lista as já criadas. Cada card abre o espaço jurídico daquela análise.",
    purpose: "Separar a negociação de minutas das obras já contratadas.",
    howToUse: ["Preencha Nova análise pré-contratual.", "Clique em um card existente para abrir documentos e análise integrada.", "Use Voltar para retornar a Projetos."],
    permissions: "Somente administrador ativo em algum projeto; os demais recebem página não encontrada.",
    source: "Projetos com workspaceType PRE_CONTRATUAL (getProjects).",
  },
  {
    id: "juridico.analises.nova-analise",
    title: "Nova análise pré-contratual",
    shortDescription: "Cria o espaço da negociação: nome da oportunidade, cliente e documentos.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Formulário com Nome da oportunidade ou concorrência e Cliente, ambos obrigatórios. Criar e anexar documentos cria o espaço pré-contratual (RPC create_precontract_workspace) e abre o envio de documentos da análise.",
    purpose: "Identificar a negociação antes de ela virar uma obra contratada.",
    howToUse: ["Informe o nome e o cliente.", "Clique em Criar e anexar documentos.", "Envie a minuta, anexos e demais documentos e abra a análise jurídica."],
    consequences: ["Cria um espaço novo e separado das obras assinadas; nada é alterado em obras existentes."],
    permissions: "Administrador ativo (validado também no servidor).",
    source: "Ação createPrecontractWorkspaceAction (app/juridico/actions.ts).",
  },
  {
    id: "juridico.precontratual.documento",
    title: "Documento da negociação",
    shortDescription: "Envio da minuta (PDF, DOCX ou TXT) e estado de cada arquivo até ficar pronto para consulta.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Card de envio da análise pré-contratual. Escolha o Tipo documental (Contrato base, Aditivo, Memorial/Edital, Proposta Comercial ou Proposta Técnica), arraste ou selecione arquivos PDF, DOCX ou TXT com texto selecionável e acompanhe o estado de cada um.",
    purpose: "Dar ao especialista jurídico o texto da minuta e dos anexos que serão analisados.",
    howToUse: [
      "Escolha o tipo documental antes de enviar.",
      "Se aparecer Aguardando sua confirmação, decida entre Registrar como nova versão ou Registrar como documento separado.",
      "Use Cancelar envio durante o envio, ou Tentar novamente se o estado for Erro.",
    ],
    howItWorks:
      "Estados do arquivo: Aguardando documento, Aguardando sua confirmação, Enviando (com %), Processando documento, Pronto, Documento duplicado e Erro. A consulta ao especialista só é liberada quando há ao menos um documento Pronto; enquanto isso o painel mostra o motivo do bloqueio. Nova versão x documento separado é sempre decisão humana.",
    permissions: "Envio: GERENTE, GESTOR ou ADMINISTRADOR; demais perfis veem apenas leitura.",
    limitations: ["Aceita apenas PDF, DOCX e TXT; PDF sem texto selecionável não pode ser lido."],
  },
  {
    id: "juridico.precontratual.analise-integrada",
    title: "Análise integrada para negociação",
    shortDescription: "Consulta Jurídico, Comercial, Engenharia/Planejamento e ESG/SSMA e consolida com o CEO IA.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Campo Cláusula, dúvida ou ponto de negociação e botão Consultar todos os especialistas. Os especialistas de Jurídico, Comercial, Engenharia/Planejamento e ESG/SSMA respondem e o CEO IA consolida: síntese, riscos, alternativas de negociação, recomendação e decisões humanas necessárias.",
    purpose: "Preparar a negociação de uma cláusula olhando o contrato por todos os ângulos de uma vez.",
    howToUse: ["Descreva a cláusula e o objetivo da negociação.", "Clique em Consultar todos os especialistas e aguarde nesta tela."],
    howItWorks:
      "A ação runPrecontractCurationAction exige ADMINISTRADOR ativo, pré-verifica o limite de consultas e passa a reserva de consumo por especialista consultado (tipo CURATION).",
    consequences: ["Consome unidades do limite diário de IA do usuário e da obra (ver Consulta ao especialista jurídico)."],
    permissions: "ADMINISTRADOR ativo do espaço.",
    humanReview: "Nenhuma recomendação é enviada ou aceita automaticamente; as decisões humanas necessárias ficam listadas na resposta.",
  },
  // =====================================================================================================================
  // /[projectId]/revisao-clausulas
  // =====================================================================================================================
  {
    id: "juridico.revisao-clausulas.pagina",
    title: "Revisão de Cláusulas",
    shortDescription: "Fila de candidatos a cláusula detectados automaticamente, para aprovação ou rejeição humana.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Mostra os candidatos a cláusula que o detector automático encontrou nos documentos extraídos. Nenhum candidato vira cláusula contratual definitiva sem aprovação humana registrada na auditoria, e a lista não equivale à análise integral do contrato.",
    purpose: "Validar número, título e texto de cada cláusula contra a página original antes de entrarem na base contratual.",
    howToUse: [
      "Filtre ou busque na lista à esquerda e selecione um candidato.",
      "Confira a evidência de origem e abra a página original.",
      "Aprove (com o texto conferido) ou rejeite (com justificativa).",
    ],
    howItWorks:
      "O detector grava candidatos (clause_extraction_candidates) com confiança, parte, páginas e alertas REVISAR. A decisão chama a RPC review_clause_extraction_candidate: aprovar cria a cláusula e registra auditoria; rejeitar exige justificativa e também é auditada. A tela não altera decisões já tomadas.",
    permissions: "A decisão é validada no banco, que exige permissão de edição no projeto.",
    limitations: ["Ausência de candidatos não significa ausência de cláusulas ou de riscos: o detector pode não reconhecer o formato ou a leitura pode estar incompleta."],
    humanReview: "Aprovação humana obrigatória para criar a cláusula definitiva; nenhum candidato é aprovado automaticamente.",
  },
  {
    id: "juridico.revisao-clausulas.totais",
    title: "Totais da revisão de cláusulas",
    shortDescription: "Pendentes, Aprovados, Rejeitados e Total detectado; clique para filtrar a lista.",
    kind: "kpi",
    module: M,
    version: V,
    description:
      "Quatro contadores de candidatos: Pendentes (aguardam decisão), Aprovados, Rejeitados e Total detectado. Cada cartão é um atalho que aplica o filtro de status correspondente.",
    purpose: "Mostrar o tamanho da fila e quanto já foi decidido por revisão humana.",
    formula: "Contagem de candidatos por status (PENDING_REVIEW, APPROVED, REJECTED) nas versões de documento do projeto; Total detectado = Pendentes + Aprovados + Rejeitados.",
    source: "Tabela clause_extraction_candidates, via getClauseReviewList (lib/clause-review-list.ts).",
    unit: "Quantidade de candidatos (unidades), estado atual, sem recorte de período.",
    refresh: "A cada abertura ou atualização da página e após cada decisão.",
    missingData: "Sem candidatos detectados os contadores são 0 e a lista explica que isso não significa ausência de cláusulas.",
  },
  {
    id: "juridico.revisao-clausulas.filtros",
    title: "Busca e filtros de cláusulas",
    shortDescription: "Busca por número, título ou texto; filtros Parte, Status e Só os que exigem conferência.",
    kind: "filter",
    module: M,
    version: V,
    description:
      "Formulário GET com Buscar (número, título ou texto, ignorando acentos e maiúsculas), Parte, Status (Pendentes, Aprovados, Rejeitados, Todos) e a caixa Só os que exigem conferência. Filtrar aplica; Limpar volta ao padrão (Pendentes).",
    purpose: "Chegar rápido aos candidatos que importam.",
    howToUse: ["Digite termos (todos precisam aparecer).", "Escolha Parte e Status.", "Marque Só os que exigem conferência para ver apenas candidatos com alerta."],
    criteria: ["Status padrão: Pendentes.", "Exigem conferência: candidatos com alerta REVISAR ou em página pendente de leitura ou com revisão visual."],
    source: "Parâmetros da URL (q, parte, status, conferir) sobre getClauseReviewList.",
  },
  {
    id: "juridico.revisao-clausulas.lista",
    title: "Lista de candidatos",
    shortDescription: "Número, título, parte e páginas; selos rascunho, conferir e status; 20 por página.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Lista compacta na ordem do documento (6.2 vem antes de 6.10). Cada linha mostra número, título, Parte e páginas, e selos: rascunho (você tem edição não enviada neste navegador), conferir (exige conferência com o original; o motivo aparece ao pairar) e o status Pendente, Aprovado ou Rejeitado. Clique para abrir o detalhe.",
    purpose: "Percorrer a fila e escolher o próximo candidato.",
    criteria: ["20 candidatos por página, com paginação Anterior/Próxima."],
    source: "getClauseReviewList; selo rascunho vem do sessionStorage do navegador.",
  },
  {
    id: "juridico.revisao-clausulas.confianca",
    title: "Confiança da detecção",
    shortDescription: "Quão seguro o detector está de que o trecho começa uma cláusula com aquela numeração.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Percentual de confiança do detector (e o nome e a versão do detector). Mede apenas a segurança de que o trecho é o início de uma cláusula com aquela numeração; não é avaliação de risco jurídico, relevância ou conformidade.",
    purpose: "Ajudar a priorizar a conferência, sem substituí-la.",
    source: "Campos confidence, detector e detectorVersion do candidato.",
    limitations: ["Confiança alta não dispensa a conferência com a página original."],
    humanReview: "A decisão de aprovar continua humana, qualquer que seja a confiança.",
  },
  {
    id: "juridico.revisao-clausulas.conferir",
    title: "Exige conferência com o original",
    shortDescription: "Alertas do detector e páginas pendentes de leitura ou com revisão visual no intervalo do candidato.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Lista os motivos pelos quais o candidato precisa de olhar atento: alertas REVISAR registrados pelo detector (por exemplo numeração inconsistente) e páginas do intervalo do candidato que a leitura deixou pendentes ou marcou para revisão visual (desenhos, tabelas, figuras).",
    purpose: "Evitar aprovar texto que a leitura automática pode ter perdido ou distorcido.",
    criteria: ["Alertas REVISAR do detector.", "Páginas pendentes de leitura dentro do intervalo de páginas do candidato.", "Páginas com revisão visual dentro do intervalo."],
    source: "Metadados do candidato e cobertura de leitura da versão (getVersionCoverageSummaries).",
    humanReview: "Conferir com a página original antes de aprovar.",
  },
  {
    id: "juridico.revisao-clausulas.evidencia",
    title: "Evidência de origem",
    shortDescription: "Localizador, trecho extraído e atalho para abrir a página original do documento.",
    kind: "message",
    module: M,
    version: V,
    description:
      "Mostra de onde veio o candidato: localizador (arquivo, página e método de leitura), o segmento extraído da página completa (em Ver segmento extraído) e o link Abrir página original, que leva à tela de visualização da versão na página do candidato.",
    purpose: "Manter a rastreabilidade do candidato até o documento original, permitindo conferência humana.",
    source: "Segmento de texto da extração (document_text_segments) e arquivo original da versão.",
    missingData: "Sem segmento: informa Segmento original não disponível; sem localizador: Localizador não informado.",
    humanReview: "O texto extraído é derivado do original e pode conter erros de leitura; o original é a prova.",
  },
  {
    id: "juridico.revisao-clausulas.aprovar",
    title: "Aprovar cláusula",
    shortDescription: "Cria a cláusula definitiva com número, título e texto conferidos; registra auditoria.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Formulário com Número da cláusula, Título, Texto contratual (editáveis, vindos do candidato), Observação da revisão (opcional) e a confirmação Conferi número, título e texto com a página original do contrato. Aprovar cláusula cria a cláusula contratual e registra a decisão na auditoria.",
    purpose: "Transformar um candidato conferido em cláusula da base contratual.",
    howToUse: ["Corrija número, título ou texto se necessário.", "Marque a confirmação de conferência com o original.", "Clique em Aprovar cláusula."],
    consequences: [
      "Cria a cláusula (aparece na aba Cláusulas de Documentos) e grava auditoria.",
      "O candidato passa a Aprovado; a tela não permite alterar a decisão depois.",
    ],
    howItWorks: "Rascunho não enviado fica no sessionStorage da aba e há aviso ao sair da página com alterações.",
    humanReview: "Decisão humana obrigatória e auditada.",
  },
  {
    id: "juridico.revisao-clausulas.rejeitar",
    title: "Rejeitar candidato",
    shortDescription: "Descarta o candidato; exige justificativa, registrada na auditoria.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Campo de justificativa obrigatório e botão Rejeitar candidato. Use quando o trecho não deve ser tratado como cláusula (por exemplo, numeração de lista ou item de tabela).",
    purpose: "Tirar da fila o que não é cláusula, deixando a razão registrada.",
    consequences: ["O candidato passa a Rejeitado e a justificativa fica na auditoria; nenhuma cláusula é criada."],
    humanReview: "Decisão humana obrigatória e auditada.",
  },
  {
    id: "juridico.revisao-clausulas.regra-governanca",
    title: "Regra de governança",
    shortDescription: "A detecção só sugere; a cláusula definitiva exige aprovação humana auditada.",
    kind: "message",
    module: M,
    version: V,
    description:
      "Aviso fixo da tela: a detecção automática apenas sugere cláusulas, a criação da cláusula definitiva exige aprovação humana registrada na auditoria, nenhum candidato é aprovado automaticamente e a lista não equivale à análise integral do contrato.",
    purpose: "Lembrar o limite da automação e a necessidade de revisão humana.",
    humanReview: "Princípio central: IA sugere, pessoa decide.",
  },
  // =====================================================================================================================
  // /[projectId]/revisao-contratual
  // =====================================================================================================================
  {
    id: "juridico.revisao-contratual.pagina",
    title: "Revisão Contratual",
    shortDescription: "Candidatos a evento contratual detectados em threads de e-mail, aguardando revisão humana.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Lista, do maior score para o menor, as conversas de e-mail do projeto que o triador contratual marcou como possível fato contratual. Nenhum candidato entra no Event Ledger sem revisão humana: aprovar cria o evento com evidências; rejeitar exige justificativa.",
    purpose: "Decidir quais conversas viram evento contratual rastreável.",
    howToUse: ["Abra Ver evidências e leia os e-mails da conversa.", "Aprove como evento (título e conclusão do revisor) ou rejeite com justificativa."],
    howItWorks:
      "O triador (scripts/email-thread-contract-triage.mjs) soma pesos de termos contratuais fortes e de apoio no texto da conversa e grava candidatos PENDING_REVIEW (email_thread_event_candidates). A decisão chama a RPC review_email_thread_event_candidate, que autoriza no banco e, ao aprovar, cria o evento no Event Ledger.",
    permissions: "A interface oferece os formulários somente ao ADMINISTRADOR; as demais permissões veem a lista em modo leitura. A RPC no banco valida a permissão de novo.",
    limitations: ["O texto de apoio da tela cita EDITOR ou ADMIN, mas o código da página libera os botões apenas para ADMINISTRADOR."],
    humanReview: "Aprovação ou rejeição humana obrigatória; sem ela nada entra no Event Ledger.",
  },
  {
    id: "juridico.revisao-contratual.resumo",
    title: "Resumo da revisão contratual",
    shortDescription: "Pendentes, sua permissão no projeto e se você pode revisar.",
    kind: "kpi",
    module: M,
    version: V,
    description:
      "Três cartões: Pendentes (quantidade de candidatos aguardando revisão), Sua permissão (seu papel no projeto, ou SEM ACESSO) e Pode revisar (Sim somente para ADMINISTRADOR).",
    purpose: "Dizer rapidamente o tamanho da fila e se você pode decidir.",
    formula: "Pendentes = número de candidatos com status PENDING_REVIEW no projeto. Pode revisar = (permissão == ADMINISTRADOR).",
    source: "email_thread_event_candidates (getContractReviewCandidates) e permissão do usuário (getCurrentProjectPermission).",
    unit: "Quantidade de candidatos (unidades), estado atual.",
    refresh: "A cada abertura da página e após cada decisão.",
    missingData: "Sem candidatos mostra 0 e a mensagem Nenhum candidato aguardando revisão.",
  },
  {
    id: "juridico.revisao-contratual.candidato",
    title: "Candidato a evento contratual",
    shortDescription: "Assunto, thread, categorias, prioridade, score, mensagens, datas e evidências da conversa.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Cada card é uma conversa de e-mail. Mostra assunto, início do identificador da thread, categorias detectadas, a prioridade (selo Baixo, Médio, Alto ou Crítico), o Score, o número de Mensagens, Início e Última mensagem, e Ver evidências com data, direção, remetente, destinatário e trecho de cada e-mail.",
    purpose: "Dar ao revisor o contexto necessário para decidir se há fato contratual.",
    criteria: [
      "Score = soma dos pesos dos grupos de termos contratuais encontrados (termos fortes ganham um bônus de até 2 pontos por termos extras do mesmo grupo).",
      "Exige revisão quando há algum termo forte, ou score a partir de 10 com ao menos 2 categorias.",
      "Prioridade: Crítico com score a partir de 22; Alto a partir de 14; Médio nos demais casos que exigem revisão.",
    ],
    source: "Triador scripts/email-thread-contract-triage.mjs; e-mails em emails e email_thread_event_candidate_emails.",
    limitations: ["O score mede presença de termos, não gravidade jurídica; a prioridade é um filtro de atenção, não um parecer."],
    humanReview: "O revisor deve ler as evidências antes de aprovar ou rejeitar.",
  },
  {
    id: "juridico.revisao-contratual.aprovar",
    title: "Aprovar como evento",
    shortDescription: "Cria o evento contratual no Event Ledger com a conclusão do revisor.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Formulário com Título do evento (preenchido com o assunto) e Conclusão do revisor (obrigatória: o fato contratual confirmado, sua relevância e o entendimento do revisor). Aprovar como evento registra o evento com as evidências da conversa.",
    purpose: "Formalizar um fato contratual identificado nas comunicações.",
    consequences: ["Cria o evento no Event Ledger com evidências; o candidato deixa de estar pendente."],
    permissions: "ADMINISTRADOR na interface; validação final na RPC do banco.",
    humanReview: "Decisão humana obrigatória.",
  },
  {
    id: "juridico.revisao-contratual.rejeitar",
    title: "Rejeitar candidato",
    shortDescription: "Descarta a conversa como evento contratual; justificativa obrigatória.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Campo Justificativa da rejeição (obrigatório) e botão Rejeitar candidato. Registra por que a conversa não deve ser tratada como evento contratual.",
    purpose: "Tirar da fila conversas sem relevância contratual, com o motivo guardado.",
    consequences: ["O candidato deixa de estar pendente e nenhum evento é criado."],
    permissions: "ADMINISTRADOR na interface; validação final na RPC do banco.",
    humanReview: "Decisão humana obrigatória.",
  },
  // =====================================================================================================================
  // /[projectId]/documentos
  // =====================================================================================================================
  {
    id: "juridico.documentos.pagina",
    title: "Documentos",
    shortDescription: "Upload, versões, hierarquia contratual, cláusulas, cronograma e anexos de e-mail do projeto.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Repositório documental do projeto, com abas Documentos, Cláusulas, Cronograma, Anexos de E-mail e (quando a funcionalidade de relatórios semanais está ativa) Registro por e-mail. Upload é manual; o Google Drive é reservado exclusivamente ao SSMA/ESG. A aba pode ser aberta diretamente por ?tab=clausulas, cronograma, anexos-email ou registro-email.",
    purpose: "Guardar os originais, versioná-los e prepará-los para leitura e análise.",
    howToUse: ["Na aba Documentos envie arquivos, escolha o tipo documental e acompanhe o processamento.", "Use as demais abas para cláusulas, cronograma e anexos de e-mail."],
    howItWorks:
      "Cada arquivo vira um documento com versões. O original fica no armazenamento do projeto (bucket project-documents), o registro é feito pela RPC register_project_document_upload e o worker de leitura extrai texto (nativo ou OCR) por página, registrando a cobertura. Documentos nunca são alterados: nova versão é um novo registro.",
    permissions: "Enviar: ADMINISTRADOR, GESTOR ou GERENTE. Vincular anexo contratual e usar a lixeira: somente ADMINISTRADOR. Anexos do contrato: ADMINISTRADOR, GESTOR, GERENTE e COLABORADOR incluem; excluir é ADMINISTRADOR, GESTOR ou GERENTE. Leitura vê apenas os documentos.",
    humanReview: "A leitura automática pode ser parcial; documentos só devem ser tratados como integralmente lidos quando a cobertura disser isso.",
  },
  {
    id: "juridico.documentos.upload-multiplo",
    title: "Adicionar documentos",
    shortDescription: "Envio de vários arquivos de uma vez (arrastar e soltar), com tipo documental por arquivo.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Área de arrastar e soltar (ou Selecionar arquivos) para enviar vários arquivos de uma só vez, inclusive em seleções sucessivas sem perder o que já foi adicionado. Aceita PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, XML, MPP, JPG, JPEG e PNG, até 50 MB por arquivo.",
    purpose: "Cadastrar muitos documentos rapidamente, sem classificação automática escondida.",
    howToUse: [
      "Arraste os arquivos ou use Selecionar arquivos.",
      "Defina o tipo documental de cada arquivo (ou um tipo para o lote, e Aplicar aos arquivos aguardando).",
      "Clique em Iniciar envio.",
    ],
    howItWorks:
      "Cada arquivo passa por validação, cálculo de hash, envio, registro e processamento. Nenhum tipo é atribuído automaticamente, exceto arquivos .mpp, definidos como cronograma baseline. Arquivos repetidos no lote (nome e tamanho) são recusados na seleção; a duplicidade definitiva é pelo hash do conteúdo.",
    permissions: "ADMINISTRADOR, GESTOR ou GERENTE; os demais veem a mensagem de que o envio requer permissão.",
    limitations: ["Máximo de 50 MB por arquivo."],
  },
  {
    id: "juridico.documentos.tipo-lote",
    title: "Tipo documental e envio do lote",
    shortDescription: "Tipo para aplicar ao lote, Aplicar aos arquivos aguardando e Iniciar envio.",
    kind: "filter",
    module: M,
    version: V,
    description:
      "Seletor Tipo para aplicar ao lote (Contrato, Aditivo Contratual, Memorial/Edital, Ata de Reunião, Cronograma, Proposta Comercial, Proposta Técnica, Resposta/Aprovação do cliente, E-mail, Planilha Contratual, Relatório, Notificação, ESG/SSMA, Diário de Obra e Outro). Aplicar aos arquivos aguardando copia o tipo para todos os pendentes; Iniciar envio só habilita quando todo pendente tem tipo.",
    purpose: "Garantir que cada arquivo entre classificado por uma decisão consciente.",
    howToUse: ["Escolha o tipo e clique em Aplicar aos arquivos aguardando, ou ajuste arquivo a arquivo.", "Clique em Iniciar envio."],
    consequences: ["O tipo define como o documento é agrupado (Contrato-base, Aditivo) e qual regra de unicidade se aplica."],
    limitations: ["Só pode existir um Contrato-base ativo por projeto: para outro arquivo do mesmo contrato use Adicionar nova versão."],
  },
  {
    id: "juridico.documentos.fila-status",
    title: "Estado de cada arquivo do lote",
    shortDescription: "Aguardando, validando, enviando, processando, concluído, duplicado, rejeitado ou erro.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Cada arquivo mostra seu estado e a fase: Aguardando envio, Validando, Calculando hash, Confirmar nova versão?, Conflito de tipo, Duplicado, Enviando, Registrando, Processando, Concluído, Upload concluído com análise/OCR pendente, Erro e Rejeitado. Remover tira o arquivo da fila local (pendente, erro, rejeitado ou duplicado) e Tentar novamente reenvia um arquivo em Erro; no estado Erro o tipo documental volta a ser editável.",
    purpose: "Saber o que foi enviado, o que falhou e o que precisa de decisão.",
    howToUse: ["Em Erro, corrija o tipo se for o caso e use Tentar novamente.", "Use Remover ou Limpar todos os erros para tirar itens da fila."],
    howItWorks:
      "Remover e Limpar todos os erros atuam só no estado local da fila; não apagam documento, versão ou arquivo já gravado. Erro típico: duplicado por hash, ou Contrato-base ativo já existente (use Adicionar nova versão no card existente).",
    consequences: ["Duplicado: o arquivo não é reenviado; se o igual está na lixeira, restaure-o em vez de reenviar."],
  },
  {
    id: "juridico.documentos.progresso-lote",
    title: "Progresso geral do lote",
    shortDescription: "Percentual médio do lote e contagens por situação; Limpar todos os erros.",
    kind: "kpi",
    module: M,
    version: V,
    description:
      "Barra com o percentual de progresso do lote e as contagens Total, Concluídos, Processando, Duplicados, Rejeitados e Com erro (e Aguardando análise de Ata de Reunião, quando houver).",
    purpose: "Acompanhar o envio de muitos arquivos de uma vez.",
    formula:
      "Percentual = média do progresso de todos os arquivos do lote; arquivos em estado final (concluído, duplicado, rejeitado, erro e análise pendente) contam 100%, os demais contam o progresso da fase (validação 5, hash 15, upload 50, registro 20, processamento 5).",
    source: "Estado local da fila de upload (lib/documents/multi-upload/queue-core.ts).",
    unit: "Percentual (0 a 100) e quantidade de arquivos do lote atual.",
    refresh: "Em tempo real durante o envio; reinicia ao recarregar a página.",
    missingData: "Sem arquivos na fila a barra não aparece.",
  },
  {
    id: "juridico.documentos.decisao-versao",
    title: "Decisão: nova versão ou documento separado",
    shortDescription: "Quando o título coincide com um documento existente, a decisão é sua.",
    kind: "message",
    module: M,
    version: V,
    description:
      "Aparece quando o título do arquivo corresponde a um documento já cadastrado. Se o tipo é o mesmo, pergunta se é uma nova versão (Sim, é nova versão ou Não, é um documento separado). Se o tipo é diferente, exige decisão: Enviar como documento novo e separado ou Cancelar este arquivo.",
    purpose: "Impedir que o sistema decida sozinho se um arquivo é versão de outro.",
    howItWorks: "A comparação usa o hash (duplicado), depois o título normalizado e o tipo. O sistema nunca escolhe: a decisão humana é obrigatória.",
    consequences: ["Nova versão: o arquivo entra como versão seguinte do documento existente.", "Documento separado: cria um documento novo."],
    humanReview: "Decisão humana obrigatória antes de qualquer registro.",
  },
  {
    id: "juridico.documentos.upload-individual",
    title: "Upload individual (avançado)",
    shortDescription: "Formulário completo de um documento: tipo, título, versão, data, origem, autor, resumo e arquivo.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Formulário para cadastrar um único documento (ou nova versão) com todos os metadados: Tipo documental *, Título *, Versão *, Data do documento *, Origem *, Autor / emissor *, Resumo *, Observações e Arquivo *. Campos com asterisco são obrigatórios.",
    purpose: "Cadastrar documentos que exigem metadados completos (versão, data, origem e autor).",
    howToUse: ["Preencha os campos obrigatórios.", "Anexe o arquivo (até 50 MB).", "Clique em Adicionar documento (ou Enviar nova versão)."],
    howItWorks: "Mesmo caminho do upload múltiplo: hash, armazenamento e RPC register_project_document_upload. Arquivo .mpp define o tipo como Cronograma baseline.",
    limitations: ["Rejeita arquivo duplicado (mesmo conteúdo) e segundo Contrato-base ativo."],
  },
  {
    id: "juridico.documentos.hierarquia",
    title: "Hierarquia contratual",
    shortDescription: "Contrato-base, aditivos numerados e os anexos vinculados a cada um.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Cada instrumento contratual forma um bloco com o documento principal à esquerda e seus anexos à direita: Contrato-base e Aditivo 01, 02... (na ordem de criação, nunca por número no título). Documentos sem vínculo ficam em Demais documentos (sem vínculo contratual).",
    purpose: "Mostrar a estrutura do contrato e o que está formalmente ligado a cada instrumento.",
    howToUse: [
      "Em um bloco sem anexos, o ADMINISTRADOR pode vincular um documento existente.",
      "Em um documento solto, o ADMINISTRADOR usa Vincular como anexo contratual.",
    ],
    howItWorks:
      "O agrupamento usa só o vínculo persistido (documento-pai); nunca infere vínculo pelo nome. Nenhum documento aparece duas vezes. Sem vínculos gravados, cada instrumento mostra Nenhum anexo contratual vinculado.",
    permissions: "Vincular, trocar e desvincular: ADMINISTRADOR (a RPC revalida no servidor).",
    humanReview: "O vínculo de anexo é uma decisão humana com justificativa; troca de vínculo pede confirmação.",
  },
  {
    id: "juridico.documentos.versao",
    title: "Versões do documento",
    shortDescription: "Cada versão com situação de processamento, idioma, revisão humana, autor, arquivo e download.",
    kind: "table",
    module: M,
    version: V,
    description:
      "No card de cada documento, cada versão mostra: rótulo da versão, situação de processamento (Sem arquivo, Aguardando processamento, Processando, Processado ou Falha no processamento), idioma de origem quando conhecido, selo Revisão humana necessária, data e autor, resumo, nome e tamanho do arquivo, erro de processamento e botão de download. Adicionar nova versão envia um novo arquivo para o mesmo documento.",
    purpose: "Acompanhar a evolução do documento e saber se ele já pode ser usado nas análises.",
    howToUse: ["Abra Adicionar nova versão para enviar a próxima versão.", "Baixe o original pelo botão de download.", "Abra a visualização da versão pelo link de cobertura, quando houver."],
    howItWorks: "Processado significa que a extração de texto terminou; a cobertura de leitura (páginas lidas, pendentes e com revisão visual) é mostrada à parte e nunca é omitida.",
    criteria: ["Processado com páginas não lidas aparece como Processado · leitura parcial."],
    source: "document_versions e document_extractions (lib/document-management.ts).",
    humanReview: "Selo Revisão humana necessária: o conteúdo extraído deve ser conferido por uma pessoa antes de ser usado.",
  },
  {
    id: "juridico.documentos.cobertura-leitura",
    title: "Cobertura de leitura",
    shortDescription: "Leitura parcial e páginas que exigem revisão visual: o documento não foi integralmente lido.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Aviso que aparece quando a extração mais recente não leu todas as páginas (Leitura parcial: X/Y páginas lidas, N pendente(s)) ou quando há páginas com desenhos, tabelas ou figuras que exigem revisão visual. Lista as páginas e leva à visualização do original.",
    purpose: "Nunca apresentar como integralmente lido um documento que não foi.",
    howItWorks:
      "O worker de leitura registra no localizador de cada segmento o método (texto nativo, OCR com confiança, ou pendente) e as páginas com revisão visual; a cobertura é reconstruída a partir disso. Extrações antigas sem esse registro mostram cobertura não registrada, nunca integral. OCR abaixo de 70% de confiança fica pendente.",
    source: "lib/documents/extraction/extraction-coverage.ts e version-coverage-summary.ts.",
    limitations: ["Cláusulas e análises podem não considerar as páginas pendentes."],
    humanReview: "Abra as páginas pendentes no original e confira visualmente.",
  },
  {
    id: "juridico.documentos.anexos-contrato",
    title: "Partes e anexos do contrato",
    shortDescription: "Continuação do mesmo contrato (Parte 2 de 2) e anexos contratuais da versão, na ordem de envio.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Painel dobrável dos arquivos que complementam a versão do Contrato-base: partes adicionais e anexos contratuais. Mostra nome, extensão, tamanho, data, quem enviou e a identificação opcional; permite Visualizar, Baixar e (para quem pode) Remover anexo do contrato.",
    purpose: "Manter num só contrato todas as partes e anexos, com numeração de páginas contínua para a análise.",
    howToUse: ["Preencha Identificação (opcional), por exemplo Parte 2 de 2 e páginas.", "Selecione os arquivos em Adicionar parte(s) ou anexo(s) do contrato.", "Aditivos devem ser cadastrados como documento próprio."],
    howItWorks:
      "Na análise do contrato os arquivos entram depois do arquivo principal, na ordem de envio, com a numeração de páginas continuada. Remover desfaz só o vínculo da visualização; o arquivo histórico permanece preservado para auditoria.",
    permissions: "Incluir: ADMINISTRADOR, GESTOR, GERENTE e COLABORADOR. Remover: ADMINISTRADOR, GESTOR e GERENTE. Leitura só visualiza e baixa.",
    source: "document_version_files com papel ANEXO_CONTRATUAL.",
  },
  {
    id: "juridico.documentos.vincular-anexo",
    title: "Vínculo de anexo contratual",
    shortDescription: "Liga um documento a um contrato-base ou aditivo, com justificativa; permite trocar ou desvincular.",
    kind: "admin-action",
    module: M,
    version: V,
    description:
      "Controles do ADMINISTRADOR: Vincular como anexo contratual de (escolha do contrato-base ou aditivo e justificativa, por exemplo cláusula que incorpora o documento por referência), troca de vínculo com confirmação, e Desvincular com motivo.",
    purpose: "Registrar formalmente que um documento é anexo de um instrumento contratual.",
    consequences: ["O documento passa a aparecer dentro do bloco do instrumento e deixa de aparecer em Demais documentos.", "Nada é apagado: só o vínculo muda."],
    permissions: "ADMINISTRADOR na interface; a RPC revalida a permissão no servidor.",
    humanReview: "Decisão humana justificada; a troca de um vínculo existente exige confirmação explícita.",
  },
  {
    id: "juridico.documentos.respostas-cliente",
    title: "Respostas do cliente",
    shortDescription: "Vínculo de e-mails do cliente a uma versão (responde, discorda, corrige, ressalva, complementa).",
    kind: "field",
    module: M,
    version: V,
    description:
      "Seção do card de versão que lista os e-mails do cliente vinculados (remetente, data, tipo de relação e trecho). O formulário Vincular resposta do cliente liga um e-mail do projeto a uma versão com a relação Responde, Discorda, Corrige, Ressalva ou Complementa. Discorda, Corrige ou Ressalva mostram o selo CONTESTADO PELO CLIENTE.",
    purpose: "Registrar o que o cliente disse sobre um documento sem reescrever o original.",
    howToUse: ["Abra Vincular resposta do cliente, escolha o e-mail e a relação, e clique em Vincular."],
    howItWorks: "Grava um vínculo lateral (document_version_client_responses); nunca altera a versão original.",
    limitations: ["O selo CONTESTADO PELO CLIENTE é só um sinalizador de atenção: não invalida o documento nem constitui alteração contratual."],
    permissions: "ADMINISTRADOR, GESTOR ou GERENTE para vincular.",
    humanReview: "A relação escolhida é um julgamento humano.",
  },
  {
    id: "juridico.documentos.lixeira",
    title: "Lixeira de documentos",
    shortDescription: "Enviar para a lixeira, restaurar ou excluir definitivamente; somente ADMINISTRADOR.",
    kind: "admin-action",
    module: M,
    version: V,
    description:
      "O botão de lixeira no card envia o documento para a lixeira com um motivo obrigatório (nada é apagado: só marcado). Na Lixeira é possível Restaurar ou Excluir definitivamente (com confirmação), que remove o documento e suas versões operacionais; o registro de auditoria permanece.",
    purpose: "Retirar documentos obsoletos de forma reversível e auditada.",
    howToUse: ["Informe o motivo e confirme o envio para a lixeira.", "Em Lixeira, Restaurar devolve o documento; Excluir definitivamente pede confirmação."],
    consequences: ["Enviar para a lixeira é reversível.", "Excluir definitivamente remove o documento e as versões operacionais; pode deixar arquivos físicos a reconciliar, o que é avisado."],
    permissions: "ADMINISTRADOR.",
    humanReview: "Exclusão definitiva é irreversível e deve ser decidida por uma pessoa.",
  },
  {
    id: "juridico.documentos.clausulas-lista",
    title: "Cláusulas do contrato",
    shortDescription: "Lista de cláusulas aprovadas, com leitura do texto completo da cláusula selecionada.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Aba mestre-detalhe: à esquerda a lista de cláusulas (Cláusula número — título); à direita o texto da cláusula selecionada. Textos longos começam recolhidos em seis linhas, com Mostrar cláusula completa.",
    purpose: "Consultar rapidamente as cláusulas já aprovadas do contrato.",
    source: "Cláusulas do projeto (getClauses); as cláusulas nascem da aprovação humana na Revisão de Cláusulas.",
    missingData: "Sem cláusulas: Nenhuma cláusula cadastrada.",
    limitations: ["A tela mostra só número, título e texto; não há classificação de risco, escopo ou prazo nas cláusulas."],
  },
  {
    id: "juridico.documentos.cronograma-lista",
    title: "Atividades do cronograma",
    shortDescription: "Atividades do cronograma MPP processado: baseline, datas atuais, crítica e status.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Lista as atividades do cronograma MPP vigente (a mesma fonte usada pelo Diretor de Planejamento IA): nome, selo Crítica quando está no caminho crítico, status, e o período de baseline e o atual. O botão Analisar cronograma abre o especialista de Planejamento.",
    purpose: "Conferir o cronograma importado antes de usá-lo em análises.",
    source: "Versões MPP extraídas (loadExtractedScheduleContext).",
    missingData: "Datas ausentes aparecem como traço; sem atividades: Nenhuma atividade de cronograma cadastrada.",
    humanReview: "A importação do MPP deve ser conferida contra o arquivo oficial.",
  },
  {
    id: "juridico.documentos.anexos-email-filtros",
    title: "Filtros dos anexos de e-mail",
    shortDescription: "Atalhos de situação, busca, tipo de arquivo, Expert, risco, ordenação e período.",
    kind: "filter",
    module: M,
    version: V,
    description:
      "Botões de situação (Todos, Considerados pelo ACC, Processados, Aguardando processamento, Com findings, Incorporados a Documentos), caixa de busca por arquivo, assunto ou remetente, e seletores de Tipo de arquivo, Expert, Risco e Ordenar por (Data, Nome, Status, Risco), além de Período de e até.",
    purpose: "Encontrar um anexo recebido por e-mail entre muitos.",
    criteria: ["Os filtros se combinam; a ordenação é decrescente.", "O período usa a data do e-mail (ou a de recebimento do anexo)."],
    source: "Registro de anexos de e-mail do projeto (getEmailAttachmentRegistryForProject).",
  },
  {
    id: "juridico.documentos.anexos-email-linha",
    title: "Anexo de e-mail",
    shortDescription: "Arquivo, e-mail de origem, situação, Experts, findings, proveniência e Incorporar aos Documentos.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Cada cartão mostra data, nome, extensão e situação do anexo; remetente e assunto; se foi considerado pelo ACC e se foi incorporado; Experts relacionados; e a quantidade de findings com o maior risco. Ver e-mail de origem e Proveniência (hash SHA-256, IDs do Gmail, caminho no armazenamento) preservam a rastreabilidade. Incorporar aos Documentos transforma o anexo em documento formal.",
    purpose: "Rastrear cada anexo até o e-mail e decidir se ele vira documento do projeto.",
    howToUse: ["Abra Proveniência para conferir hash e origem.", "Use Incorporar aos Documentos, confira título, data e autor e confirme."],
    consequences: ["Incorporar cria documento formal; o anexo original continua preservado no e-mail."],
    permissions: "ADMINISTRADOR, GESTOR ou GERENTE para incorporar; a RPC promote_email_attachment_to_document revalida.",
    humanReview: "Incorporar é decisão humana; processado não significa considerado em análise.",
  },
  // =====================================================================================================================
  // /[projectId]/documentos/versoes/[documentVersionId]
  // =====================================================================================================================
  {
    id: "juridico.versoes.pagina",
    title: "Visualizar documento",
    shortDescription: "Original da versão, cobertura de leitura e texto extraído, com links para as páginas.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Tela de uma versão de documento: resumo, painel Leitura do documento (extração mais recente), visualizador do arquivo original (PDF ou imagem, com seleção do arquivo e da página) e o Conteúdo extraído do documento. Aberta pelos avisos de cobertura e pela Revisão de Cláusulas.",
    purpose: "Conferir o texto extraído contra o original e chegar às páginas pendentes.",
    howToUse: ["Use os links de página da cobertura para abrir o original na página certa.", "Troque entre Texto original e Normalizado quando a opção existir.", "Baixe o original pelo botão de download."],
    howItWorks:
      "Mostra a extração mais recente (as anteriores ficam como histórico). O arquivo é aberto por link assinado de curta duração (5 minutos); formatos sem visualização incorporada oferecem apenas o download.",
    permissions: "Membros do projeto com acesso à versão; versão de outro projeto ou documento na lixeira não é encontrada.",
    humanReview: "O texto extraído é derivado; o arquivo original é a prova.",
  },
  {
    id: "juridico.versoes.cobertura",
    title: "Leitura do documento (extração mais recente)",
    shortDescription: "Páginas lidas, lidas por OCR, pendentes e com revisão visual, com links para o original.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Painel de cobertura da extração mais recente: Páginas lidas, Lidas por OCR (confiança de 70% ou mais), Pendentes (OCR de baixa confiança, conteúdo gráfico sem texto, falha de OCR) e Revisão visual (páginas únicas com desenhos, tabelas digitalizadas ou figuras). Cada página listada é um link para o original.",
    purpose: "Dizer exatamente o que foi lido e o que ainda precisa de olhar humano.",
    howItWorks:
      "Calculada por computeExtractionCoverage a partir do localizador de cada segmento. Extração sem registro de cobertura mostra Cobertura de leitura não registrada, nunca integral. Quando há pendência o painel avisa que o documento não foi integralmente lido nem analisado.",
    source: "document_extractions e document_text_segments.",
    humanReview: "Páginas pendentes e com revisão visual exigem conferência humana no original.",
  },
  {
    id: "juridico.versoes.texto-extraido",
    title: "Conteúdo extraído",
    shortDescription: "Texto extraído da versão: original ou camada normalizada (correção de codificação de fonte).",
    kind: "field",
    module: M,
    version: V,
    description:
      "Texto completo extraído do documento, com número de páginas e de caracteres. Quando há correções de codificação de fonte, os botões Texto original e Normalizado (busca/análise) alternam a visualização; a camada normalizada corrige símbolos mal codificados, sem alterar o texto original.",
    purpose: "Ler o que o ACC extraiu e usará em buscas e análises.",
    howItWorks: "A normalização é uma camada derivada (versão do reparo informada na tela) com amostra das correções; o texto original não é modificado.",
    limitations: ["Em leitura parcial, o texto extraído não representa o documento inteiro."],
    humanReview: "Conferir trechos críticos contra o original.",
  },
  // =====================================================================================================================
  // /[projectId]/documentos/emails/[emailId] e anexos
  // =====================================================================================================================
  {
    id: "juridico.emails.pagina",
    title: "E-mail do registro documental",
    shortDescription: "E-mail com corpo, anexos e, nos envios semanais, ingestão, cronograma e revisão humana.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Detalhe de um e-mail do registro documental: corpo recuperado do Gmail, cartão Anexos com abertura controlada de cada arquivo, e o bloco recolhido Detalhes técnicos / processamento / auditoria (metadados, classificação, envio semanal, comparações de cronograma, revisão humana, baseline oficial e histórico de decisões). Só existe quando a funcionalidade de relatórios semanais está ativa no ambiente.",
    purpose: "Ver a evidência original de um envio e o que o ACC fez com ela.",
    howToUse: ["Abra cada anexo pelo botão do cartão Anexos.", "Expanda Detalhes técnicos para auditar o processamento."],
    howItWorks: "Com a flag ACC_WEEKLY_REPORTS_ENABLED desligada a rota responde página não encontrada. O ACC nunca executa o conteúdo do anexo.",
    permissions: "Membros do projeto; revisão humana e baseline oficial somente ADMINISTRADOR; correção de classificação para quem pode editar.",
    humanReview: "Classificações e decisões de ingestão podem ser corrigidas e ficam no histórico de revisão e auditoria.",
  },
  {
    id: "juridico.emails.anexos",
    title: "Anexos do e-mail",
    shortDescription: "Arquivos do e-mail com abertura controlada, hash e armazenamento; o original permanece íntegro.",
    kind: "table",
    module: M,
    version: V,
    description:
      "Cartões (e, nos detalhes técnicos, tabela) com nome, tipo, tamanho, hash SHA-256 e local de armazenamento de cada anexo. O botão de cada anexo abre a visualização controlada (PDF e imagem) ou o download, conforme o formato; planilhas e cronogramas levam ao conteúdo estruturado.",
    purpose: "Dar acesso seguro à evidência original sem executar o conteúdo.",
    source: "email_attachments (hash e caminho gravados na ingestão).",
    missingData: "Sem anexo armazenado: o cartão informa que o e-mail não possui anexo no ACC.",
  },
  {
    id: "juridico.emails.anexo-pagina",
    title: "Visualizar anexo de e-mail",
    shortDescription: "Visualização controlada do anexo (PDF ou imagem) ou download, com hash SHA-256.",
    kind: "page",
    module: M,
    version: V,
    description:
      "Mostra o anexo por link assinado de 5 minutos quando o formato é PDF ou imagem (PDF em quadro isolado). Outros formatos exibem o motivo e oferecem o download controlado. O cabeçalho traz tipo, tamanho e o início do hash SHA-256.",
    purpose: "Conferir o arquivo original recebido por e-mail.",
    howItWorks: "O ACC nunca executa o conteúdo do anexo; o arquivo original permanece íntegro no armazenamento com o SHA-256 registrado. Rota disponível apenas com relatórios semanais ativos.",
    humanReview: "Abrir o anexo é conferência humana da evidência.",
  },
  // =====================================================================================================================
  // /[projectId]/startup
  // =====================================================================================================================
  {
    id: "juridico.startup.pagina",
    title: "Start-up ACC",
    shortDescription: "Checklist de implantação de novos projetos (somente ADMINISTRADOR).",
    kind: "page",
    module: M,
    version: V,
    description:
      "Roteiro de implantação de uma obra no ACC, organizado em 5 grupos e 18 etapas: identificação e responsabilidades, base contratual, fontes e integração, planejamento/financeiro/SSMA e validação para entrada em operação. Cada título leva à tela onde a etapa se executa. A antiga revisão histórica de riscos Alto e Crítico não é mais exibida nesta tela.",
    purpose: "Guiar o administrador para que nada seja esquecido antes de a obra operar no ACC.",
    howToUse: ["Clique no título da etapa para abrir a tela correspondente.", "Faça o ajuste necessário e volte para marcar a caixa de seleção.", "Acompanhe o percentual no topo."],
    howItWorks:
      "As marcações do checklist são manuais e ficam salvas apenas no navegador e dispositivo atuais, por projeto; não são sincronizadas com outros usuários nem substituem a validação dos dados pelo ACC.",
    permissions: "Somente ADMINISTRADOR ativo do projeto; os demais recebem página não encontrada.",
    limitations: [
      "Os componentes da revisão histórica (Desconsiderar, Já tratado / pacificado, Cuidar deste assunto, Concluir Start-up e datas da obra) permanecem no repositório, mas a página não os monta hoje; os dados e decisões já gravados não foram removidos.",
    ],
    humanReview: "A conclusão de cada etapa é declarada por uma pessoa; a aprovação formal do Start-up continua independente do checklist.",
  },
  {
    id: "juridico.startup.checklist",
    title: "Progresso do checklist",
    shortDescription: "Quantas das 18 etapas foram marcadas neste navegador e o percentual correspondente.",
    kind: "kpi",
    module: M,
    version: V,
    description:
      "Texto e barra com N de 18 etapas marcadas e o percentual. Mostra Carregando marcações enquanto lê o armazenamento do navegador.",
    purpose: "Saber quanto do roteiro de implantação já foi percorrido por você.",
    formula: "Percentual = arredondar(100 x etapas marcadas / total de etapas); o total vem da lista fixa de etapas da tela.",
    source: "Marcações no localStorage do navegador (chave acc:startup-checklist:v1:<projeto>).",
    unit: "Etapas marcadas (de 18) e percentual (0 a 100).",
    refresh: "Imediato a cada marcação; lido ao abrir a página.",
    missingData: "Sem marcações (ou armazenamento bloqueado) o contador fica em 0 e o checklist continua utilizável na sessão.",
    limitations: ["Não é compartilhado entre usuários nem entre dispositivos; limpar os dados do navegador apaga as marcações."],
  },
  {
    id: "juridico.startup.etapa",
    title: "Etapa do checklist",
    shortDescription: "Caixa de marcação manual e link para a tela onde a etapa é executada.",
    kind: "field",
    module: M,
    version: V,
    description:
      "Cada etapa tem um título que abre a tela de destino (Dashboard, Usuários, Documentos, Jurídico, Integrações, Autorizações, ESG/SSMA, Financeiro, Experts IA, Ações e Escalonamentos, Auditoria), a explicação do que conferir e uma caixa de marcação. Marcada, a etapa exibe o selo DONE.",
    purpose: "Executar e registrar, passo a passo, a implantação da obra.",
    howToUse: ["Abra o título da etapa, faça a conferência na tela de destino e volte.", "Marque a caixa ao concluir."],
    consequences: ["Marcar apenas atualiza o seu checklist local; nenhum dado do projeto é alterado."],
    limitations: ["Marcar uma etapa não valida os dados: por exemplo, não marque uma fonte como operacional só porque está cadastrada."],
    humanReview: "A marcação é uma declaração humana de que a conferência foi feita.",
  },
];
