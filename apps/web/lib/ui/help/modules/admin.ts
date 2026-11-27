// Catálogo de ajuda do módulo "admin" — arquivo EXCLUSIVO do agente/módulo (não editar em outros módulos).
// Regras de conteúdo: ver lib/ui/help/types.ts. Ids novos: "modulo.tela.elemento".
//
// Telas: /login, /, /vera, /projetos, /projetos/novo, /projetos/[projectId]/editar, /projetos/[projectId]/copiar-estrutura,
// /[projectId]/usuarios, /[projectId]/auditoria, /[projectId]/autorizacoes e /[projectId]/ajuda. Todo texto descreve o que o
// CÓDIGO faz (server actions, RPCs, guardas e rótulos em lib/labels.ts); a autoridade final de permissão é sempre o banco (RLS e RPCs).
import type { FeatureHelpDefinition } from "../types";

const V = "2026-11-20";
const M = "admin";

const ADMIN_ONLY =
  "Somente ADMINISTRADOR ativo do projeto. A tela é protegida no servidor (outros perfis recebem página não encontrada ou são redirecionados) e a gravação é revalidada pelo banco.";

export const ADMIN_HELP: FeatureHelpDefinition[] = [
  // ====================================================================================================
  // LOGIN
  // ====================================================================================================
  {
    id: "admin.login.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Login do ACC",
    shortDescription: "Entrada do ACC: acesso restrito à conta Google corporativa e a usuários autorizados por projeto.",
    description:
      "Tela de entrada do ACC. A autenticação é exclusivamente pela conta Google corporativa; entrar não dá acesso a nenhuma obra por si só, pois o acesso é concedido por projeto na tela Usuários.",
    purpose: "Autenticar a pessoa e devolvê-la ao destino que ela pretendia abrir.",
    howToUse: [
      "Clique em Entrar com Google e escolha a conta @axion.com.br.",
      "Depois do login você é levado à seleção de projetos ou ao endereço interno que tentou abrir.",
    ],
    howItWorks:
      "O botão inicia o login Google do Supabase e retorna por /auth/callback. O endereço de destino (next) é validado como caminho interno no servidor e de novo no retorno; só então é usado. Contas fora do domínio permitido são recusadas.",
    permissions: "Público até autenticar; depois, cada tela aplica o perfil do usuário no projeto.",
    limitations: ["Participar de um e-mail ou comunicação não concede acesso ao ACC.", "Sem vínculo ativo com nenhum projeto, a seleção de projetos fica vazia."],
  },
  {
    id: "admin.login.entrar-google",
    kind: "button",
    module: M,
    version: V,
    title: "Entrar com Google",
    shortDescription: "Inicia o login pela conta Google corporativa; é o único método de entrada do ACC.",
    description:
      "Redireciona para o login do Google. O botão fica desabilitado e mostra Redirecionando para o Google… enquanto o redirecionamento acontece. Não pede nem guarda senha no ACC.",
    howToUse: ["Clique uma vez e conclua o consentimento na janela do Google."],
    consequences: [
      "Se houver destino interno válido, ele é guardado por até 10 minutos em um cookie para devolver você à tela original após o login.",
      "O login não cria acesso a obras: isso depende do cadastro do usuário no projeto.",
    ],
    limitations: ["Apenas contas do domínio corporativo autorizado são aceitas."],
  },
  {
    id: "admin.login.erro-acesso",
    kind: "message",
    module: M,
    version: V,
    title: "Mensagem de erro de login",
    shortDescription: "Explica por que o login com Google não foi concluído (falha de retorno ou domínio não permitido).",
    description:
      "Mensagem exibida abaixo do botão quando o retorno do Google falha: não foi possível concluir o login (tente novamente) ou acesso restrito a contas do domínio @axion.com.br.",
    howItWorks: "O código de erro chega pela URL e só os códigos conhecidos (oauth_missing_code, oauth_exchange_failed, domain_not_allowed) são traduzidos; qualquer outro valor não gera texto.",
    howToUse: ["Se for domínio não permitido, entre com a conta corporativa; se for falha de retorno, tente novamente."],
  },

  // ====================================================================================================
  // /vera (entrada da AXIA) e AJUDA
  // ====================================================================================================
  {
    id: "admin.vera.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "AXIA — Assistente ACC (entrada)",
    shortDescription: "Destino do 'Fale com a AXIA' dos e-mails sem contexto; leva à ajuda de uma obra. A AXIA só tira dúvidas de uso do ACC.",
    description:
      "Página de entrada da AXIA, o assistente de dúvidas sobre o uso do ACC. Ela é exclusivamente o assistente de uso e não é um dos especialistas de IA (Planejamento, Jurídico, SSMA/ESG, Engenharia, Comercial e Gestão Executiva); não analisa contratos nem dados da obra.",
    purpose: "Levar quem clicou em 'Fale com a AXIA' (por exemplo, num e-mail) à ajuda de uma obra a que tem acesso.",
    howToUse: [
      "Com uma única obra, você é redirecionado direto para a ajuda dela com a AXIA aberta.",
      "Com várias obras, escolha a obra na lista.",
    ],
    howItWorks:
      "Exige login. Lista as obras visíveis ao usuário e abre /{obra}/ajuda?vera=abrir&contexto=geral. Não recebe nenhum dado do e-mail de origem.",
    missingData: "Sem nenhuma obra, a página informa que você ainda não participa de obra e orienta pedir liberação a um administrador.",
    limitations: ["Não é o botão ESPECIALISTA dos alertas: perguntas de análise técnica ou contratual devem ir ao especialista da área."],
  },
  {
    id: "admin.vera.escolher-obra",
    kind: "button",
    module: M,
    version: V,
    title: "Escolher a obra para conversar com a AXIA",
    shortDescription: "Abre a ajuda da obra escolhida com a AXIA pronta para dúvidas de uso do ACC.",
    description:
      "Cada item da lista abre a página de ajuda da obra com a AXIA aberta em contexto geral. Só aparecem obras às quais o usuário tem acesso.",
    consequences: ["Apenas navega; nenhum dado da obra é enviado à AXIA por este clique."],
  },
  {
    id: "admin.ajuda.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Ajuda e tutorial",
    shortDescription: "Apresentação da suíte e guia de uso do ACC em PDF e PowerPoint, com imagens fictícias das telas e e-mails.",
    description:
      "Reúne o tutorial permanente do ACC: acesso e seleção de obra, documentos e cláusulas, alertas e respostas parciais, CONSULTAR IA, providências e CNO, SSMA no celular e permissões. As imagens usam dados fictícios e informam o que foi verificado e o que ainda depende de teste real.",
    purpose: "Aprender a usar o ACC e baixar o material de treinamento.",
    howToUse: ["Abra o PDF para consulta ou baixe o PowerPoint editável.", "Para tirar dúvidas pontuais use a AXIA (assistente de uso)."],
    howItWorks:
      "Os arquivos ficam fora da pasta pública e são entregues só pela rota autenticada /{obra}/ajuda/tutorial/{formato}, para usuários com acesso à obra.",
    limitations: ["Conteúdo ilustrativo com dados fictícios; não substitui o treinamento da equipe."],
  },
  {
    id: "admin.ajuda.pdf",
    kind: "button",
    module: M,
    version: V,
    title: "Abrir o PDF do tutorial",
    shortDescription: "Abre o PDF da apresentação e do tutorial em nova aba, para consulta.",
    description: "Abre o arquivo ACC-apresentacao-e-tutorial.pdf em uma nova aba (exibição no navegador). É a versão de consulta do tutorial.",
    consequences: ["Não altera dados; apenas entrega o arquivo ao usuário autenticado com acesso à obra."],
  },
  {
    id: "admin.ajuda.pptx",
    kind: "button",
    module: M,
    version: V,
    title: "Baixar o PowerPoint do tutorial",
    shortDescription: "Baixa a apresentação e o tutorial em PowerPoint editável.",
    description: "Baixa o arquivo ACC-apresentacao-e-tutorial.pptx, a versão editável do tutorial, para adaptar a treinamentos internos.",
    consequences: ["Não altera dados; apenas entrega o arquivo ao usuário autenticado com acesso à obra."],
  },

  // ====================================================================================================
  // /projetos
  // ====================================================================================================
  {
    id: "admin.projetos.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Selecione um projeto",
    shortDescription: "Lista as obras às quais você tem acesso; de aqui você abre um projeto, cria, edita ou copia a estrutura.",
    description:
      "Tela inicial depois do login (a rota / redireciona para cá). Mostra as obras contratadas (workspace OBRA) a que o usuário tem acesso. Administradores veem, em cada obra que administram, os atalhos Copiar estrutura e Editar projeto, e o botão NOVO PROJETO.",
    purpose: "Escolher em qual obra trabalhar e acessar as ações administrativas de cadastro de projetos.",
    howToUse: [
      "Clique no cartão da obra para abrir o Dashboard dela.",
      "Administradores usam NOVO PROJETO, Editar projeto e Copiar estrutura.",
    ],
    howItWorks:
      "A lista vem de getProjects (visibilidade por RLS). O perfil ADMINISTRADOR ativo de cada obra é lido de project_memberships. Para quem não é administrador, o prefixo [DEV] é retirado do nome exibido.",
    permissions: "Qualquer usuário com acesso a ao menos uma obra; as ações administrativas dependem de ADMINISTRADOR ativo.",
    missingData: "Sem obras disponíveis, mostra 'Nenhum projeto disponível para sua conta'.",
  },
  {
    id: "admin.projetos.card-projeto",
    kind: "button",
    module: M,
    version: V,
    title: "Cartão do projeto",
    shortDescription: "Abre o Dashboard da obra e resume cliente, localização, número UNO, contrato, início e prazo baseline.",
    description:
      "Cartão clicável da obra: nome, cliente · localização, No. sistema UNO (código do ERP interno), número do contrato (quando houver), data de início e prazo baseline (data de término da linha de base), mais o selo de status.",
    howItWorks:
      "O selo verde mostra o valor do campo status do projeto exatamente como cadastrado (projects.status); é informação cadastral, o ACC não o recalcula e ele não altera permissões nem alertas. Prazo baseline é a data de término da linha de base do cadastro.",
    consequences: ["Apenas navega para o Dashboard da obra."],
    missingData: "Número de contrato ausente simplesmente não é exibido.",
  },
  {
    id: "admin.projetos.novo-projeto",
    kind: "admin-action",
    module: M,
    version: V,
    title: "NOVO PROJETO",
    shortDescription: "Abre o cadastro de um novo projeto; só aparece para quem é administrador ativo de alguma obra.",
    description: "Leva ao formulário de criação de projeto (Novo projeto). O botão só é exibido a quem é ADMINISTRADOR ativo em ao menos uma obra contratada.",
    permissions: ADMIN_ONLY,
    consequences: ["Apenas navega; nada é criado até o envio do formulário."],
  },
  {
    id: "admin.projetos.copiar-estrutura",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Copiar estrutura (atalho do cartão)",
    shortDescription: "Abre o assistente que vincula ao projeto as pessoas e perfis de outro projeto que você também administra.",
    description:
      "Atalho no cartão da obra para o assistente Copiar estrutura de outro projeto, tendo esta obra como destino. Só aparece nas obras em que você é ADMINISTRADOR ativo.",
    permissions: ADMIN_ONLY,
    consequences: ["Apenas navega; nenhuma pessoa é vinculada até a confirmação final do assistente."],
  },
  {
    id: "admin.projetos.editar-projeto",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Editar projeto (atalho do cartão)",
    shortDescription: "Abre o formulário para alterar os dados cadastrais da obra; só para administradores.",
    description:
      "Atalho no cartão da obra para o formulário Editar projeto (origem: seleção de projetos). Só aparece nas obras em que você é ADMINISTRADOR ativo.",
    permissions: ADMIN_ONLY,
    consequences: ["Apenas navega; nada é alterado até salvar o formulário."],
  },
  {
    id: "admin.projetos.card-juridico",
    kind: "button",
    module: M,
    version: V,
    title: "Jurídico IA (cartão)",
    shortDescription: "Atalho para a análise prévia de minutas antes da contratação; visível só a administradores ativos.",
    description:
      "Cartão que abre a área Jurídico IA para criar ou abrir uma análise de minuta antes da contratação da obra, com consulta aos especialistas de IA e consolidação do CEO IA. É exibido somente a quem é administrador ativo em algum espaço.",
    permissions: "Administrador ativo em algum espaço; a rota /juridico, as ações e as APIs repetem a checagem no servidor.",
    humanReview: "Toda análise de IA do Jurídico IA exige revisão humana; veja o perfil do Consultor Jurídico IA em Experts IA.",
  },
  {
    id: "admin.projetos.sair",
    kind: "button",
    module: M,
    version: V,
    title: "Sair",
    shortDescription: "Encerra a sessão do ACC neste navegador.",
    description: "Botão de ícone que encerra a sessão do usuário e o devolve à tela de login. Não altera dados nem permissões.",
    consequences: ["A sessão é encerrada; será preciso entrar novamente com a conta Google."],
  },

  // ====================================================================================================
  // /projetos/novo e /projetos/[projectId]/editar
  // ====================================================================================================
  {
    id: "admin.novo.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Novo projeto",
    shortDescription: "Cadastra a identificação e as datas de referência de uma nova obra; ao concluir abre o Start-up.",
    description:
      "Formulário de criação de projeto. Cadastra o nome no ACC, o No. sistema UNO, cliente, localização e as datas de início e de término da baseline. Ao concluir, o ACC abre a tela Start-up da nova obra (ou o assistente de cópia de equipe, se marcado).",
    howItWorks:
      "A ação de servidor valida campos obrigatórios, tamanhos (nome 160, código 40, cliente 120, localização 160) e datas ISO, exige término igual ou posterior ao início e chama a função de banco create_project_workspace, que concede o papel de administrador a quem cria. O código UNO é gravado em maiúsculas e é único.",
    permissions: `${ADMIN_ONLY} Aqui, administrador ativo em qualquer projeto.`,
    consequences: ["Cria o projeto (espaço OBRA) e o vínculo de quem criou como administrador; redireciona ao Start-up."],
    limitations: ["Número do contrato não faz parte da criação: é preenchido depois em Editar projeto."],
  },
  {
    id: "admin.novo.nome",
    kind: "field",
    module: M,
    version: V,
    title: "Nome do projeto no ACC",
    shortDescription: "Nome com o qual a obra aparece em todo o ACC (até 160 caracteres, obrigatório).",
    description: "Nome de exibição da obra em menus, cartões e alertas. Obrigatório, com no máximo 160 caracteres.",
    howToUse: ["Use um nome reconhecível, por exemplo cliente — empreendimento — local."],
    consequences: ["Alterar depois não apaga documentos, eventos, integrações nem usuários; só muda o rótulo."],
  },
  {
    id: "admin.novo.codigo-uno",
    kind: "field",
    module: M,
    version: V,
    title: "No. sistema UNO",
    shortDescription: "Código da obra no ERP interno da AXION (até 40 caracteres, único no ACC, gravado em maiúsculas).",
    description:
      "Identificador da obra no sistema UNO (o ERP interno). É obrigatório, limitado a 40 caracteres, convertido para maiúsculas e não pode repetir o de outra obra.",
    missingData: "Se o código já existir, a criação é recusada com a mensagem 'Este No. sistema UNO já está cadastrado no ACC'.",
  },
  {
    id: "admin.novo.cliente",
    kind: "field",
    module: M,
    version: V,
    title: "Cliente",
    shortDescription: "Nome do cliente da obra (obrigatório, até 120 caracteres).",
    description: "Cliente contratante da obra, exibido no cartão do projeto junto da localização. Obrigatório, até 120 caracteres.",
  },
  {
    id: "admin.novo.localizacao",
    kind: "field",
    module: M,
    version: V,
    title: "Localização",
    shortDescription: "Cidade e UF da obra (obrigatório, até 160 caracteres).",
    description: "Local da obra, no formato sugerido Cidade / UF. Obrigatório, até 160 caracteres; aparece no cartão do projeto.",
  },
  {
    id: "admin.novo.data-inicio",
    kind: "field",
    module: M,
    version: V,
    title: "Data de início da obra",
    shortDescription: "Data de referência de início da obra (obrigatória); o término da baseline não pode ser anterior a ela.",
    description:
      "Data de início da obra, usada como referência cadastral do projeto e exibida no cartão. Obrigatória e em formato de data válido; a data de término da baseline precisa ser igual ou posterior.",
  },
  {
    id: "admin.novo.data-termino",
    kind: "field",
    module: M,
    version: V,
    title: "Data de término da baseline",
    shortDescription: "Prazo da linha de base da obra (obrigatório); exibido como 'Prazo baseline' no cartão.",
    description:
      "Data de término da linha de base (baseline) da obra. Obrigatória, igual ou posterior ao início. É o prazo contratual de referência exibido no cartão; não substitui o cronograma estruturado analisado pelo Diretor de Planejamento IA.",
  },
  {
    id: "admin.novo.copiar-equipe",
    kind: "field",
    module: M,
    version: V,
    title: "Copiar equipe e perfis de acesso de outro projeto",
    shortDescription: "Após criar, abre o assistente para vincular a equipe de outro projeto seu; nenhum convite é enviado.",
    description:
      "Caixa opcional. Marcada, depois de criar o projeto o ACC abre o assistente Copiar estrutura (origem: cadastro) em vez do Start-up; você revisa pessoas e perfis antes de confirmar e nenhum convite ou e-mail é enviado.",
    consequences: ["Não copia nada por si só: a cópia só acontece se você confirmar no assistente."],
  },
  {
    id: "admin.novo.criar",
    kind: "button",
    module: M,
    version: V,
    title: "Criar projeto",
    shortDescription: "Cria o projeto com os dados informados e abre o Start-up (ou o assistente de cópia, se marcado).",
    description: "Envia o formulário. Valida os campos no servidor, cria o projeto pela função de banco e leva à tela seguinte. Em erro, a mensagem aparece acima dos botões e nada é criado.",
    permissions: ADMIN_ONLY,
    consequences: ["Cria o projeto e o seu vínculo de administrador.", "Não envia e-mail nem convites."],
  },
  {
    id: "admin.editar.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Editar projeto",
    shortDescription: "Altera somente os dados cadastrais da obra; documentos, eventos, integrações e usuários são preservados.",
    description:
      "Formulário de edição dos dados cadastrais da obra: nome, No. sistema UNO, número do contrato (opcional), cliente, localização e datas. Documentos, eventos, integrações, usuários e o Start-up do projeto não são afetados.",
    howItWorks:
      "A ação de servidor exige ADMINISTRADOR ativo do próprio projeto (mesma regra da política de banco), valida os campos como na criação e grava somente o que mudou; o resultado volta à seleção de projetos ou ao Dashboard conforme a origem.",
    permissions: ADMIN_ONLY,
    consequences: ["Atualiza o cadastro do projeto; os campos alterados são registrados."],
    limitations: ["Só obras contratadas (workspace OBRA) podem ser editadas aqui."],
  },
  {
    id: "admin.editar.contrato",
    kind: "field",
    module: M,
    version: V,
    title: "Número do contrato (opcional)",
    shortDescription: "Número do contrato da obra (opcional, até 80 caracteres); exibido no cartão do projeto.",
    description: "Número do contrato firmado com o cliente. Opcional; quando vazio é gravado como ausente. Limite de 80 caracteres.",
    missingData: "Vazio significa 'sem número informado', não zero.",
  },
  {
    id: "admin.editar.salvar",
    kind: "button",
    module: M,
    version: V,
    title: "Salvar alterações",
    shortDescription: "Grava as alterações cadastrais do projeto, se você for administrador ativo dele.",
    description: "Envia o formulário de edição. O servidor revalida sua permissão, os tamanhos e as datas e só então atualiza o projeto; se algo estiver inválido a mensagem aparece e nada é alterado.",
    permissions: ADMIN_ONLY,
    consequences: ["Atualiza nome, código, contrato, cliente, localização e datas do projeto."],
  },
  {
    id: "admin.editar.link-copiar",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Copiar estrutura de outro projeto (link)",
    shortDescription: "Abre o assistente para trazer equipe e perfis de acesso de outro projeto seu.",
    description: "Link abaixo do formulário de edição para o assistente de cópia de estrutura, com este projeto como destino.",
    permissions: ADMIN_ONLY,
    consequences: ["Apenas navega; nada é copiado sem confirmação no assistente."],
  },

  // ====================================================================================================
  // /projetos/[projectId]/copiar-estrutura
  // ====================================================================================================
  {
    id: "admin.copiar.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Copiar estrutura de outro projeto",
    shortDescription: "Assistente em cinco etapas que vincula ao projeto de destino as pessoas de outro projeto, com perfis revisados por você.",
    description:
      "Assistente do administrador para copiar a EQUIPE e os perfis de acesso de um projeto de origem para o destino. Etapas: Origem, Pessoas, Perfis, Prévia e Executar. Não copia documentos, registros, credenciais, autorizações de e-mail, destinatários de alertas nem pastas do Drive.",
    purpose: "Montar rapidamente a equipe de uma obra nova ou existente reaproveitando o cadastro de outra, sem convidar ninguém por e-mail.",
    howItWorks:
      "Só pessoas ativas na origem são candidatas; contas compartilhadas, CRM e usuários de teste ficam fora por padrão; quem já é membro do destino nunca tem o acesso sobrescrito; o Administrador da origem vira Gerente no destino, salvo confirmação explícita por pessoa. A prévia é recalculada no servidor e a execução é idempotente (repetir não cria duplicidade).",
    permissions: "Somente ADMINISTRADOR ativo do projeto de destino e da origem; as ações repetem a checagem e o banco também valida.",
    consequences: ["Ao executar, cria vínculos de membros no destino; nenhum convite ou e-mail é enviado."],
    limitations: ["Hoje só a categoria 'Equipe e perfis de acesso' existe; outras categorias de configuração não estão implementadas."],
  },
  {
    id: "admin.copiar.etapa-origem",
    kind: "tab",
    module: M,
    version: V,
    title: "Etapa 1 — Origem",
    shortDescription: "Escolha o projeto de origem entre os que você administra e carregue a equipe dele.",
    description:
      "Primeira etapa: mostra o que será copiado (Equipe e perfis de acesso) e pede o projeto de origem, restrito aos projetos em que você é Administrador ativo. Sem outro projeto administrado, não há origem disponível.",
    howToUse: ["Selecione o projeto de origem.", "Clique em Carregar equipe da origem."],
  },
  {
    id: "admin.copiar.etapa-pessoas",
    kind: "tab",
    module: M,
    version: V,
    title: "Etapa 2 — Pessoas",
    shortDescription: "Selecione, em lote, quais pessoas da origem serão vinculadas ao destino.",
    description:
      "Segunda etapa: tabela com as pessoas ativas da origem (perfil e área na origem) e a situação delas no destino. As sugeridas vêm marcadas; contas compartilhadas, CRM e usuários de teste ficam fora, podendo ser incluídas com 'Incluir mesmo assim'.",
    howToUse: ["Use Selecionar sugeridos ou Limpar seleção.", "Marque ou desmarque pessoas.", "Clique em Revisar perfis."],
    limitations: ["Você mesmo e quem está inativo na origem não podem ser selecionados."],
  },
  {
    id: "admin.copiar.etapa-perfis",
    kind: "tab",
    module: M,
    version: V,
    title: "Etapa 3 — Perfis",
    shortDescription: "Defina o perfil e a área de cada pessoa no destino; Administrador exige confirmação explícita.",
    description:
      "Terceira etapa: para cada pessoa selecionada, mostra o perfil e a área na origem e pede o perfil no destino (Gerente, Colaborador, Leitura ou Administrador) e a área (obrigatória). Quem era Administrador na origem é proposto como Gerente.",
    howToUse: ["Defina a área de todos.", "Se escolher Administrador, marque a confirmação desta pessoa.", "Clique em Gerar prévia."],
    limitations: ["Sem área definida ou sem confirmação de Administrador o botão Gerar prévia permanece desabilitado."],
  },
  {
    id: "admin.copiar.etapa-previa",
    kind: "tab",
    module: M,
    version: V,
    title: "Etapa 4 — Prévia",
    shortDescription: "Mostra o que seria feito (novos vínculos, já vinculadas, conflitos e bloqueios) sem gravar nada.",
    description:
      "Quarta etapa: prévia recalculada no servidor, em grupos — Novos vínculos (serão criados), Já vinculadas (mesmo perfil e área; nada muda), Conflitos (já são membros com outro perfil ou área; o acesso existente NÃO será alterado) e Bloqueadas (com o motivo, por exemplo perfil não encontrado). Nada foi gravado até aqui.",
    howToUse: ["Confira cada grupo.", "Continue para a confirmação se houver ao menos um novo vínculo."],
    consequences: ["Conflitos preservam o acesso existente da pessoa no destino."],
  },
  {
    id: "admin.copiar.etapa-executar",
    kind: "tab",
    module: M,
    version: V,
    title: "Etapa 5 — Confirmar e executar",
    shortDescription: "Confirma a prévia e cria os vínculos; mostra depois o resultado por pessoa.",
    description:
      "Quinta etapa: resume quantas pessoas serão vinculadas e de qual projeto, exige a caixa 'Revisei a prévia e confirmo a criação destes vínculos' (sem marcá-la o botão de cópia fica desabilitado) e executa. O resultado conta vinculadas, já membros, ignoradas e com erro.",
    consequences: [
      "Cria os vínculos de membros no destino com o perfil e a área revisados.",
      "Nenhum convite ou e-mail é enviado; se o destino tem coleta de e-mail habilitada, vincular uma pessoa aciona a leitura retroativa dos e-mails dela naquele projeto, como no cadastro manual.",
    ],
    permissions: "Administrador ativo da origem e do destino, revalidado no servidor e no banco.",
  },
  {
    id: "admin.copiar.projeto-origem",
    kind: "filter",
    module: M,
    version: V,
    title: "Projeto de origem",
    shortDescription: "Lista só os outros projetos em que você é Administrador ativo; é de onde a equipe será lida.",
    description: "Seletor do projeto de origem da cópia. Mostra nome e código dos projetos que você administra, exceto o destino.",
    missingData: "Sem outro projeto administrado, a tela informa que não há origem disponível.",
  },
  {
    id: "admin.copiar.carregar-equipe",
    kind: "button",
    module: M,
    version: V,
    title: "Carregar equipe da origem",
    shortDescription: "Lê as pessoas da origem e calcula a situação de cada uma no destino; não grava nada.",
    description: "Busca no servidor os membros da origem e os compara com o destino, classificando cada pessoa (nova, já membro, você) e as exclusões padrão. Somente leitura.",
    consequences: ["Não altera nenhum dado; apenas avança para a seleção de pessoas."],
  },
  {
    id: "admin.copiar.tabela-pessoas",
    kind: "table",
    module: M,
    version: V,
    title: "Pessoas da origem (tabela)",
    shortDescription: "Pessoa, perfil na origem, área e situação no destino de cada candidato à cópia.",
    description:
      "Tabela de seleção: Pessoa (nome, e-mail e cargo), Perfil na origem, Área e Situação no destino (Você, Já no destino com perfil e status, ou nova). A caixa à esquerda marca quem será copiado.",
    limitations: ["Pessoas já no destino não são sobrescritas: aparecem como 'Já no destino'."],
  },
  {
    id: "admin.copiar.perfil-destino",
    kind: "field",
    module: M,
    version: V,
    title: "Perfil no destino",
    shortDescription: "Perfil de acesso que a pessoa terá no projeto de destino (Gerente, Colaborador, Leitura ou Administrador).",
    description:
      "Seletor do perfil de acesso no destino. Os perfis oferecidos são Gerente, Colaborador, Leitura e Administrador. Escolhendo Administrador, aparece a caixa 'Confirmo conceder Administrador a esta pessoa': sem marcá-la a pessoa não é considerada pronta e a prévia não é gerada. Quem era Administrador na origem é proposto como Gerente.",
    consequences: ["Administrador pode gerenciar usuários, matriz de responsabilidades e integrações do projeto de destino."],
    permissions: ADMIN_ONLY,
  },
  {
    id: "admin.copiar.area-destino",
    kind: "field",
    module: M,
    version: V,
    title: "Área no destino",
    shortDescription: "Área da pessoa no projeto de destino; obrigatória para gerar a prévia.",
    description:
      "Seletor da área (Diretoria, Administrativo, Comercial, Financeiro, Engenharia, Orçamento, Jurídico, Planejamento, Compras ou SSMA/ESG). A área alimenta a Matriz de responsabilidades e o roteamento de alertas; é obrigatória.",
  },
  {
    id: "admin.copiar.aviso-email",
    kind: "message",
    module: M,
    version: V,
    title: "Aviso de coleta de e-mail no destino",
    shortDescription: "Avisa que vincular pessoas aciona a leitura retroativa dos e-mails delas no destino.",
    description:
      "Aviso exibido quando o destino tem coleta de e-mail habilitada: vincular uma pessoa aciona a leitura retroativa dos e-mails dela naquele projeto, como no cadastro manual. A configuração da coleta em si não é alterada.",
    humanReview: "Confirme que a pessoa deve mesmo ter os e-mails lidos no destino antes de executar.",
  },
  {
    id: "admin.copiar.executar",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Copiar N pessoa(s)",
    shortDescription: "Executa a cópia: cria os vínculos da prévia no projeto de destino.",
    description:
      "Executa a cópia da equipe. O servidor reautoriza origem e destino, recalcula a prévia e confere a assinatura da seleção antes de gravar; repetir a operação não cria duplicidades.",
    permissions: "Administrador ativo da origem e do destino.",
    consequences: ["Cria vínculos de membros no destino.", "Pessoas já membros não têm o acesso alterado.", "Nenhum e-mail ou convite é enviado."],
  },
  {
    id: "admin.copiar.resultado",
    kind: "message",
    module: M,
    version: V,
    title: "Resultado da cópia",
    shortDescription: "Quantas pessoas foram vinculadas, já eram membros, foram ignoradas ou deram erro, com o status de cada uma.",
    description:
      "Resumo final: vinculadas, já eram membros, ignoradas e com erro, e uma lista por pessoa com o status (Vinculada, Já era membro, Você, Não é ativa na origem, Perfil não encontrado, Administrador não confirmado, Dados inválidos ou Erro). Depois, leva à tela Usuários do destino.",
  },

  // ====================================================================================================
  // /[projectId]/usuarios
  // ====================================================================================================
  {
    id: "admin.usuarios.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Usuários & Permissões",
    shortDescription: "Gerencia quem acessa a obra, com qual perfil e área, e a matriz de responsabilidades; só para administradores.",
    description:
      "Tela do administrador para controlar o acesso ao projeto: adicionar ou pré-cadastrar usuários, escolher participantes, alterar perfil, cargo e situação, registrar o WhatsApp da Diretoria e configurar a Matriz de responsabilidades e prazos. Mostra também, por pessoa, os faróis das fontes que alimentam o ACC.",
    purpose: "Dar e retirar acesso com rastreabilidade e manter a base de responsáveis usada pelos alertas e escalonamentos.",
    howToUse: [
      "Use + Adicionar usuário para incluir alguém (por e-mail @axion.com.br).",
      "Use Participantes do projeto para ativar ou desativar vários de uma vez, revisando o resumo antes de confirmar.",
      "Na tabela, ajuste cargo, perfil e situação de cada pessoa.",
      "Ao final, configure a Matriz de responsabilidades e prazos.",
    ],
    howItWorks:
      "Toda escrita usa a sessão do usuário e funções de banco oficiais (SECURITY DEFINER) que revalidam o ADMINISTRADOR ativo; nunca há UPDATE direto nas tabelas de vínculo. As alterações de participantes são aplicadas e auditadas.",
    permissions: ADMIN_ONLY,
    consequences: ["Dar acesso permite ver os dados da obra conforme o perfil; desativar retira o acesso sem apagar histórico."],
    limitations: [
      "O banco impede que o último ADMINISTRADOR ativo seja removido e que alguém altere o próprio perfil por esta tela.",
      "Participar de um e-mail ou comunicação não concede acesso ao ACC.",
    ],
  },
  {
    id: "admin.usuarios.seletor-projeto",
    kind: "filter",
    module: M,
    version: V,
    title: "Projeto exibido nos faróis de fontes",
    shortDescription: "Troca o projeto cujos usuários e faróis são exibidos; só lista obras que você administra.",
    description:
      "Seletor que navega para a aba Usuários de outra obra que você administra (aparece quando há mais de uma). O acesso continua validado no servidor a cada navegação.",
    permissions: ADMIN_ONLY,
  },
  {
    id: "admin.usuarios.adicionar-usuario",
    kind: "admin-action",
    module: M,
    version: V,
    title: "+ Adicionar usuário",
    shortDescription: "Abre o formulário de busca por e-mail para incluir alguém no projeto, ou pré-cadastrar quem ainda não entrou.",
    description:
      "Alterna para o formulário de inclusão: busca por e-mail @axion.com.br; se a pessoa já fez login no ACC, escolhe-se permissão e área e confirma-se; se nunca entrou, oferece o pré-cadastro.",
    permissions: ADMIN_ONLY,
    consequences: ["Nada é gravado até confirmar o formulário."],
  },
  {
    id: "admin.usuarios.busca-email",
    kind: "field",
    module: M,
    version: V,
    title: "Buscar por e-mail @axion.com.br",
    shortDescription: "Procura o perfil pelo e-mail completo corporativo; busca por nome parcial não é suportada.",
    description:
      "Campo de e-mail completo. A busca só aceita endereços terminados em @axion.com.br e informa se a pessoa já pertence ao projeto ou se não existe perfil (ela nunca fez login).",
    missingData: "Sem perfil encontrado, a tela oferece o pré-cadastro em vez de inventar o usuário.",
  },
  {
    id: "admin.usuarios.permissao-novo",
    kind: "field",
    module: M,
    version: V,
    title: "Permissão (novo usuário)",
    shortDescription: "Perfil inicial da pessoa no projeto: Administrador, Gerente ou Colaborador.",
    description:
      "Perfil de acesso atribuído na inclusão. Para novos usuários o formulário oferece Administrador, Gerente e Colaborador (padrão Colaborador); o perfil Leitura só pode ser definido depois, na linha da tabela. 'Gerente' é o nome atual do perfil legado 'Gestor'.",
    permissions: ADMIN_ONLY,
    consequences: ["O perfil define o que a pessoa pode fazer; veja a coluna Permissão da tabela."],
  },
  {
    id: "admin.usuarios.area-novo",
    kind: "field",
    module: M,
    version: V,
    title: "Área (novo usuário)",
    shortDescription: "Área organizacional da pessoa neste projeto; obrigatória e usada em responsabilidades e alertas.",
    description:
      "Área da pessoa na obra: Diretoria, Administrativo, Comercial, Financeiro, Engenharia, Orçamento, Jurídico, Planejamento, Compras ou SSMA/ESG. É obrigatória e alimenta a pré-seleção da especialidade nos alertas e a elegibilidade na Matriz de responsabilidades.",
  },
  {
    id: "admin.usuarios.pre-cadastro",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Pré-cadastrar usuário",
    shortDescription: "Registra nome, cargo, perfil e área de quem ainda não fez login; o acesso só vale no primeiro login.",
    description:
      "Quando o e-mail não tem perfil, permite pré-cadastrar (restrito a e-mails @axion.com.br). A pessoa fica 'Aguardando primeiro login' e só ganha acesso quando entrar no ACC pela primeira vez com essa conta Google.",
    permissions: ADMIN_ONLY,
    consequences: ["Cria um convite pendente, elegível na Matriz de responsabilidades; não envia e-mail."],
  },
  {
    id: "admin.usuarios.participantes",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Participantes do projeto",
    shortDescription: "Marque quem participa da obra; desmarcar só desativa (reversível). Nada muda até revisar e confirmar.",
    description:
      "Painel de seleção por caixas: marcado = participante ativo (ou pendente). Desmarcar desativa a participação sem apagar histórico; marcar um ex-participante reativa; marcar quem nunca participou adiciona (com papel e área). Convites pendentes e o próprio usuário ficam travados.",
    howToUse: [
      "Busque e filtre a lista, marque ou desmarque pessoas.",
      "Para pessoas novas, escolha Papel e Área.",
      "Clique em Salvar alterações, revise o Resumo das alterações, marque a confirmação e clique em Confirmar e salvar.",
      "Use Descartar (visível quando há mudança pendente) para desfazer as marcações e voltar ao estado salvo, sem gravar nada.",
    ],
    howItWorks:
      "O plano de mudanças é calculado no navegador (adicionar, reativar, desativar) e reconferido no servidor, que aplica uma operação por vez por funções oficiais e audita cada alteração aplicada.",
    consequences: ["Desativar remove o acesso da pessoa ao projeto e a retira da Matriz de responsabilidades (reversível)."],
    limitations: ["Não permite alterar a si mesmo nem desativar o último Administrador ativo.", "A lista de pessoas fora do projeto depende de uma função de banco que pode não estar disponível no ambiente."],
    permissions: ADMIN_ONLY,
  },
  {
    id: "admin.usuarios.confirmar-adicao",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Confirmar (adicionar usuário ao projeto)",
    shortDescription: "Vincula ao projeto o usuário encontrado, com a permissão e a área escolhidas.",
    description:
      "Depois de a busca por e-mail encontrar um perfil, o botão chama a função de banco add_project_member com o projeto, a pessoa, a permissão (Administrador, Gerente ou Colaborador) e a área, ambas obrigatórias e revalidadas no servidor. A tela atualiza a lista de usuários ao concluir.",
    howToUse: ["Escolha Permissão e Área.", "Clique em Confirmar."],
    consequences: ["A pessoa passa a ter acesso ao projeto com o perfil escolhido; a mudança é auditada pelo banco."],
    permissions: ADMIN_ONLY,
    limitations: ["Quem já pertence ao projeto não é adicionado de novo; o erro do banco é exibido na tela."],
  },
  {
    id: "admin.usuarios.pre-cadastro-nome",
    kind: "field",
    module: M,
    version: V,
    title: "Nome (pré-cadastro)",
    shortDescription: "Nome completo de quem ainda não fez login; obrigatório no pré-cadastro.",
    description:
      "Nome gravado no convite pendente quando o e-mail não tem perfil no ACC. É obrigatório e gravado pela função de banco pre_register_project_member junto com o e-mail, o cargo opcional, a permissão e a área. O cargo (opcional) é só informativo e não concede acesso.",
    howToUse: ["Informe o nome completo da pessoa.", "Escolha Permissão e Área e clique em Pré-cadastrar."],
    missingData: "Sem nome o formulário não envia.",
    permissions: ADMIN_ONLY,
  },
  {
    id: "admin.usuarios.participantes-filtros",
    kind: "filter",
    module: M,
    version: V,
    title: "Buscar e filtrar participantes",
    shortDescription: "Busca por nome, e-mail ou área e filtra por situação (Ativos, Pendentes, Inativos, Fora do projeto).",
    description:
      "Campo de busca e seletor de situação da lista de participantes. 'Fora do projeto' só aparece quando a lista de usuários candidatos está disponível no ambiente.",
    howItWorks: "Filtro local sobre as linhas já carregadas; não consulta o banco a cada digitação.",
  },
  {
    id: "admin.usuarios.participantes-resumo",
    kind: "message",
    module: M,
    version: V,
    title: "Resumo das alterações",
    shortDescription: "Lista, antes de gravar, quantos usuários serão adicionados, reativados ou desativados e o que está bloqueado.",
    description:
      "Quadro que aparece quando há mudanças pendentes: contagem de adições, reativações e desativações, cada operação nominal e os bloqueios com o motivo (por exemplo, alteração do próprio usuário ou do último Administrador). Sem mudanças, mostra 'Nenhuma alteração pendente'.",
    humanReview: "Confirme o resumo: após confirmar, as alterações são aplicadas e auditadas.",
  },
  {
    id: "admin.usuarios.col-usuario",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Usuário",
    shortDescription: "Nome, e-mail e iniciais de cada pessoa com acesso ao projeto, incluindo convites pendentes.",
    description:
      "Identifica cada pessoa com acesso ao projeto. Convites pendentes aparecem esmaecidos, com as iniciais substituídas por traço, até o primeiro login.",
  },
  {
    id: "admin.usuarios.col-origem",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Origem",
    shortDescription: "Informa se a pessoa é interna da AXION ou terceiro.",
    description: "Origem do cadastro do usuário: Axion (Interno) ou Terceiro. É informação cadastral e não altera o perfil de permissão.",
  },
  {
    id: "admin.usuarios.col-cargo",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Cargo",
    shortDescription: "Cargo informado da pessoa; editável por administradores pela ação Editar cargo.",
    description: "Cargo (título profissional) do usuário. É um texto livre cadastral e não concede nem restringe acesso.",
    missingData: "Sem cargo informado mostra um traço.",
  },
  {
    id: "admin.usuarios.col-area",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Área",
    shortDescription: "Área da pessoa no projeto: Diretoria, Administrativo, Comercial, Financeiro, Engenharia, Orçamento, Jurídico, Planejamento, Compras ou SSMA/ESG.",
    description:
      "Área organizacional da pessoa neste projeto. Orienta a elegibilidade nas responsabilidades e a especialidade sugerida nas consultas de alerta; não substitui o perfil de permissão.",
    missingData: "Sem área mostra um traço.",
  },
  {
    id: "admin.usuarios.col-permissao",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Permissão (perfis)",
    shortDescription: "Perfil de acesso da pessoa: Administrador, Gerente (antigo Gestor), Colaborador ou Leitura.",
    description:
      "Perfil do usuário no projeto, conforme o código. ADMINISTRADOR: administra o projeto (usuários, matriz de responsabilidades, integrações, autorizações de e-mail, start-up, edição e cópia de estrutura), edita documentos, revisa e configura obrigações ESG; é o único perfil que escreve nas tabelas administrativas. GERENTE (GESTOR é o mesmo papel, nome legado): edita documentos e registra comprovações ESG, sem administrar o projeto. COLABORADOR: registra comprovações ESG e responde às ações de alerta como membro ativo, sem editar documentos. LEITURA: apenas consulta.",
    howItWorks:
      "Papéis em packages/types e lib/users/project-permission.ts: GESTOR e GERENTE têm o mesmo nível; a autoridade final são as políticas do banco (RLS e funções), e a interface só decide o que oferecer.",
    limitations: [
      "O resumo acima cobre as regras que o código da interface espelha (documentos, ESG, administração); outras telas podem aplicar regras adicionais por perfil ou área, como o dashboard financeiro.",
      "Inativo ou fora da obra não recebe nenhum perfil.",
    ],
    permissions: "Somente o ADMINISTRADOR altera perfis, e não o próprio.",
  },
  {
    id: "admin.usuarios.col-status",
    kind: "status",
    module: M,
    version: V,
    title: "Coluna Status",
    shortDescription: "Ativo ou Inativo para membros; Aguardando primeiro login, Ativado ou Cancelado para convites.",
    description:
      "Situação do vínculo: Ativo (acessa o projeto), Inativo (sem acesso; histórico preservado) ou, para convites, Aguardando primeiro login, Ativado ou Cancelado. Desativar nunca apaga dados.",
    consequences: ["Inativo não recebe permissão efetiva em nenhuma tela do projeto."],
  },
  {
    id: "admin.usuarios.col-fontes",
    kind: "status",
    module: M,
    version: V,
    title: "Coluna Fontes que alimentam o ACC neste projeto",
    shortDescription: "Faróis Aceite, Conexão, Coleta e Material por pessoa, derivados das evidências; não são editáveis.",
    description:
      "Quatro etapas por pessoa: Aceite (autorização de uso do e-mail), Conexão (conta conectada), Coleta (e-mails realmente coletados) e Material (conteúdo que chegou ao ACC). Cada etapa mostra ✓ ou ✕ com o motivo, e há um resumo geral. Convites pendentes mostram 'Sem dados até o primeiro login'.",
    howItWorks: "Resumo derivado das evidências de integração (lib/integrations/user-integration-matrix.ts); o detalhe completo fica na aba Integrações.",
    limitations: ["Não é editável: para mudar a situação, resolva a etapa pendente na aba Integrações ou em Autorizações."],
  },
  {
    id: "admin.usuarios.col-whatsapp",
    kind: "setting",
    module: M,
    version: V,
    title: "WhatsApp (alerta crítico na Diretoria)",
    shortDescription: "Telefone da pessoa e autorização do canal WhatsApp; só alertas CRÍTICOS que chegam à Diretoria o utilizam.",
    description:
      "Cadastro do telefone internacional (ex.: +5527999990000) e da caixa 'Canal autorizado pelo participante'. O canal é simulado nesta fase e destina-se apenas a alertas CRÍTICOS que chegam à Diretoria. O contato é da PESSOA e vale em todos os projetos em que ela tem vínculo; alterar o número exige reafirmar a autorização.",
    howToUse: ["Informe o telefone no formato internacional.", "Marque 'Canal autorizado pelo participante' somente com o consentimento da pessoa.", "Clique em Salvar; a tela confirma com 'Salvo'."],
    permissions: `${ADMIN_ONLY} A leitura do telefone também é restrita a administradores por política do banco.`,
    missingData: "Telefone vazio significa sem contato cadastrado; só membros ativos têm o formulário (os demais mostram traço).",
    consequences: ["Sem número e sem autorização, a pessoa não recebe aviso por WhatsApp."],
    limitations: ["Canal simulado: o envio real não está ativo."],
  },
  {
    id: "admin.usuarios.col-acoes",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Ações",
    shortDescription: "Ações por linha, visíveis só a administradores: editar cargo, alterar perfil e desativar ou reativar.",
    description:
      "Controles por pessoa, cada um chamando uma função oficial do banco. Editar cargo: altera o cargo (texto informativo, que pertence ao perfil da pessoa e vale em todos os projetos dela; depende de uma função de banco que, se não estiver aplicada no ambiente, devolve erro explícito). Seletor de perfil + Salvar: troca o perfil entre Administrador, Gerente, Colaborador e Leitura (a opção Gerente aparece uma só vez: se o valor salvo é o legado Gestor, o mesmo rótulo 'Gerente' ocupa o lugar, sem reescrever o dado a menos que você escolha outro perfil); não aparece para você mesmo ('Próprio usuário') e a função de banco bloqueia a saída do último Administrador ativo. Desativar/Reativar: alterna o vínculo entre Ativo e Inativo (reversível, histórico preservado, retira a pessoa das responsabilidades enquanto inativa). A remoção definitiva do vínculo não tem controle aqui, de propósito, para evitar exclusão acidental.",
    consequences: ["Alterar o perfil muda imediatamente o que a pessoa pode ver e fazer no projeto.", "Inativo perde o acesso e deixa de ser elegível na Matriz de responsabilidades."],
    permissions: ADMIN_ONLY,
  },
  {
    id: "admin.usuarios.matriz-secao",
    kind: "setting",
    module: M,
    version: V,
    title: "Matriz de responsabilidades e prazos",
    shortDescription: "Configuração, exclusiva do projeto, de quem trata, escala e responde aos alertas e dos prazos por grau de risco.",
    description:
      "Seção do administrador com Responsáveis por área, Prazos por grau de risco e Fuso horário e horário útil. O Nível 1 trata a ação, o Nível 2 recebe o primeiro escalonamento e o Nível 3 corresponde à Diretoria. Riscos médios e baixos são reunidos em um único e-mail às quartas-feiras, às 7h; riscos altos e críticos mantêm o alerta e o escalonamento imediato definidos na matriz. Só participantes ativos e convidados pendentes deste projeto são elegíveis.",
    howItWorks:
      "Cada bloco tem ajuda própria (Responsáveis por área, Prazos por grau de risco e Fuso horário). Prazo para assumir: CRÍTICO 1 hora corrida e ALTO 4 horas úteis; para MÉDIO e BAIXO, vale o que estiver na Matriz de SLA da obra, que o Administrador ajusta neste bloco.",
    validity:
      "Alterações na matriz valem para novos alertas; alertas já abertos mantêm o prazo de quando foram criados.",
    permissions: ADMIN_ONLY,
    consequences: ["A matriz define quem recebe e quem escala cada alerta do projeto."],
  },

  // ====================================================================================================
  // /[projectId]/auditoria
  // ====================================================================================================
  {
    id: "admin.auditoria.pagina",
    kind: "page",
    module: M,
    version: V,
    title: "Auditoria",
    shortDescription: "Trilha imutável das ações do projeto, com filtros por categoria, data, responsável e palavra-chave, contagem real e paginação.",
    description:
      "Lista, do mais recente ao mais antigo, os registros de auditoria do projeto: data e hora, ator, ação, entidade afetada e detalhe. A tabela é append-only: o banco impede UPDATE e DELETE, então um registro não pode ser editado nem apagado. A tela também sinaliza falhas operacionais para supervisão da Diretoria.",
    purpose: "Rastrear quem fez o quê e quando no projeto, e localizar falhas e indisponibilidades de integrações.",
    howToUse: ["Use os filtros para focar num tipo de registro.", "Leia ator, ação, entidade e detalhe; o selo 'Supervisão do ACC' indica falhas a investigar."],
    howItWorks:
      "Os registros vêm de audit_log_entries (filtrados pelo projeto e pela política is_project_member). Filtros, contagem e paginação são feitos no servidor sobre todos os registros autorizados, sem o antigo limite de 1.000 linhas. A categoria vem de um catálogo explícito de códigos de ação (lib/audit/audit-catalog.ts); código sem regra aparece em 'Não catalogados', nunca some.",
    permissions: "Leitura por qualquer membro do projeto (política de banco: is_project_member). Ninguém grava por esta tela: inserções são feitas pelo servidor.",
    limitations: [
      "A categoria é calculada pelo catálogo de códigos, não é um campo gravado no banco.",
      "Ator 'Sistema' indica registro automático; 'Usuário legado' vem de dados antigos.",
    ],
  },
  {
    id: "admin.auditoria.filtros",
    kind: "filter",
    module: M,
    version: V,
    title: "FILTRAR REGISTROS DE AUDITORIA",
    shortDescription: "Filtra a trilha por categoria, com a quantidade real de cada uma, e por data inicial e final, responsável e palavra-chave; Limpar filtros volta a Todos.",
    description:
      "Os filtros ficam na URL (?tipo=, de=, ate=, responsavel=, q=, pagina=): persistem ao atualizar a página e acompanham o histórico do navegador. As datas são dias no fuso de Brasília. A palavra-chave procura no detalhe, no código e na tradução da ação, na entidade e no identificador. Categorias: Todos, Projetos e versões, Atas de reunião, Relatórios e RDO, Medições, E-mails, Ações e SLA, SSMA/ESG, Integrações e falhas, Segurança e permissões. A lista mostra 50 registros por página (Primeira, Anterior, Próxima, Última).",
    howToUse: ["Clique na categoria desejada; preencha datas, responsável ou palavra-chave e clique em Aplicar filtros; Limpar filtros volta a Todos."],
    limitations: ["Valores desconhecidos na URL voltam para Todos.", "Eventos de segurança, permissões, congelamento de escrita e travas de módulos ficam em Segurança e permissões."],
  },
  {
    id: "admin.auditoria.supervisao",
    kind: "message",
    module: M,
    version: V,
    title: "Supervisão do ACC (falhas e indisponibilidades)",
    shortDescription: "Separa as falhas em ativas, aguardando investigação, recuperadas e históricas, com a evidência de cada uma, e leva ao filtro Integrações e falhas.",
    description:
      "Considera as ações de falha (_FAILED, _UNAVAILABLE, _DISCREPANCY, _ERROR) de todo o projeto. Tentativas repetidas da mesma falha na mesma entidade contam uma vez. Recuperada: existe registro de sucesso posterior para a mesma entidade. Ativa: sem recuperação e menos de 24 h. Aguardando investigação: sem recuperação, entre 24 h e 30 dias. Histórica: sem recuperação há mais de 30 dias.",
    howItWorks: "A situação independe dos filtros ativos. A faixa só fica vermelha quando há falha ativa.",
    limitations: ["A recuperação é reconhecida apenas para falhas com ação de sucesso correspondente (Drive, SSMA Drive, processamento de documento, envio de alerta)."],
    humanReview: "Falhas recorrentes devem ser analisadas por uma pessoa responsável pelas integrações.",
  },
  {
    id: "admin.auditoria.col-data-hora",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Data/Hora — Brasília",
    shortDescription: "Momento em que o fato foi registrado, no horário de Brasília (America/Sao_Paulo).",
    description: "Data e hora de registro (occurred_at) convertidas para o horário de Brasília; o valor original em UTC aparece ao passar o mouse e continua inalterado no banco. A lista é ordenada do mais recente para o mais antigo.",
  },
  {
    id: "admin.auditoria.col-ator",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Ator",
    shortDescription: "Quem executou a ação: nome do usuário, Sistema (automático) ou Usuário legado.",
    description:
      "Autor do registro. Para usuários, o nome é resolvido pelo cadastro; 'Usuário não disponível' aparece quando o cadastro não é mais legível; 'Sistema' indica rotina automática e 'Usuário legado' registros antigos sem vínculo de usuário.",
  },
  {
    id: "admin.auditoria.col-acao",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Ação",
    shortDescription: "Código da ação registrada, com texto antigo corrigido de codificação quando necessário.",
    description: "Nome da ação auditada, como gravada pelo servidor. Textos legados com caracteres corrompidos são normalizados apenas para exibição; o registro original não é alterado.",
  },
  {
    id: "admin.auditoria.col-entidade",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Entidade",
    shortDescription: "Tipo e identificador do objeto afetado; o texto flutuante mostra a categoria do filtro.",
    description: "Tipo da entidade e seu identificador (por exemplo, documento, evento ou ação). O identificador permite localizar o objeto original e preserva a rastreabilidade até a fonte.",
  },
  {
    id: "admin.auditoria.col-detalhe",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Detalhe",
    shortDescription: "Descrição complementar registrada junto com a ação.",
    description: "Detalhe gravado no registro (valores alterados, motivo ou resultado). Textos legados com codificação corrompida são normalizados apenas na exibição.",
    limitations: ["O conteúdo depende do que cada rotina gravou; alguns registros têm pouco detalhe."],
  },

  // ====================================================================================================
  // /[projectId]/autorizacoes
  // ====================================================================================================
  {
    id: "admin.autorizacoes.solicitar",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Solicitar autorização",
    shortDescription: "Registra o pedido de consentimento a um colaborador e envia a ele um e-mail individual.",
    description:
      "Bloco para pedir o consentimento de um colaborador ativo da obra para o ACC usar a conta de e-mail corporativa. O colaborador recebe um e-mail individual com finalidade, permissões e filtros e responde dentro do ACC. O aceite registrado é o consentimento no ACC; ele não conecta a conta Google (a conexão é feita à parte).",
    howItWorks:
      "A ação de servidor exige administrador ativo, cria a solicitação por função de banco (a regra também é aplicada no banco) e envia o e-mail pelo provedor de e-mail do ACC, sujeito à mesma guarda do modo piloto dos demais e-mails. Se o e-mail falhar, a solicitação continua registrada e a tela avisa que o colaborador ainda não foi avisado.",
    permissions: ADMIN_ONLY,
    consequences: ["Cria um registro PENDENTE e dispara um e-mail ao colaborador."],
  },
  {
    id: "admin.autorizacoes.colaborador",
    kind: "field",
    module: M,
    version: V,
    title: "Colaborador",
    shortDescription: "Escolha o colaborador ativo da obra que será convidado a autorizar o uso do e-mail dele.",
    description: "Seletor obrigatório com os membros ATIVOS da obra. Inativos e pessoas fora do projeto não aparecem.",
    missingData: "Sem escolher, a solicitação é recusada ('Escolha um colaborador da obra').",
  },
  {
    id: "admin.autorizacoes.conta",
    kind: "field",
    module: M,
    version: V,
    title: "Conta (em branco = e-mail do colaborador)",
    shortDescription: "Conta de e-mail corporativa a autorizar; vazia, usa o e-mail do cadastro do colaborador.",
    description:
      "Campo opcional com o endereço da conta de e-mail que será autorizada. Em branco, o ACC usa o e-mail do perfil do colaborador (em minúsculas).",
  },
  {
    id: "admin.autorizacoes.botao-solicitar",
    kind: "button",
    module: M,
    version: V,
    title: "Solicitar e enviar e-mail",
    shortDescription: "Cria a solicitação e envia o e-mail individual ao colaborador.",
    description:
      "Envia o formulário. Resultado possível: solicitação registrada e e-mail enviado; solicitação registrada sem e-mail (colaborador ainda não avisado); ou erro de permissão, de colaborador ou de validação, mostrado na faixa de resultado.",
    permissions: ADMIN_ONLY,
    consequences: ["Envia um e-mail ao colaborador; o histórico da solicitação é preservado."],
  },
  {
    id: "admin.autorizacoes.col-colaborador",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Colaborador",
    shortDescription: "Nome do colaborador a quem a autorização se refere.",
    description: "Pessoa que autorizou, recusou, revogou ou ainda deve responder a solicitação desta obra.",
  },
  {
    id: "admin.autorizacoes.col-conta",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Conta",
    shortDescription: "Conta de e-mail à qual a autorização se aplica.",
    description: "Endereço da conta de e-mail objeto do consentimento nesta obra.",
  },
  {
    id: "admin.autorizacoes.col-decisao",
    kind: "status",
    module: M,
    version: V,
    title: "Coluna Decisão",
    shortDescription: "Aguardando resposta, Autorizado, Não autorizado ou Revogado.",
    description:
      "Situação do consentimento no ACC: Aguardando resposta (pendente), Autorizado, Não autorizado (recusado) ou Revogado. Apenas 'Autorizado' vale como consentimento; o aceite não conecta a conta Google.",
  },
  {
    id: "admin.autorizacoes.col-data",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Data",
    shortDescription: "Data da decisão ou, se ainda não houve, da solicitação (horário de Brasília).",
    description: "Data e hora da decisão do colaborador; sem decisão, a data da solicitação. Exibida em America/Sao_Paulo.",
    missingData: "Sem data mostra um traço.",
  },
  {
    id: "admin.autorizacoes.col-conexao",
    kind: "status",
    module: M,
    version: V,
    title: "Coluna Conexão da conta",
    shortDescription: "Situação técnica da conta Google: conectada, sincronizando, reautorização necessária, erro ou não conectada.",
    description:
      "Estado da conexão da conta no ACC, separado do aceite: Conta conectada, Sincronizando, Reautorização no Google necessária, Erro na conexão, Conta não conectada ou Conta não registrada no ACC.",
    limitations: ["Estar Autorizado não significa conta conectada: são etapas independentes."],
  },
  {
    id: "admin.autorizacoes.col-acoes",
    kind: "table",
    module: M,
    version: V,
    title: "Coluna Ações",
    shortDescription: "Ver texto e histórico da autorização e, quando aplicável, revogar ou cancelar a solicitação.",
    description:
      "Link para o texto e o histórico da autorização e, para solicitações pendentes ou autorizadas, o controle de Cancelar solicitação ou Revogar, com campo de motivo opcional (até 500 caracteres) e confirmação obrigatória.",
    permissions: ADMIN_ONLY,
  },
  {
    id: "admin.autorizacoes.revogar",
    kind: "admin-action",
    module: M,
    version: V,
    title: "Revogar autorização / Cancelar solicitação",
    shortDescription: "Encerra o consentimento no ACC (ou cancela a solicitação pendente); o histórico é preservado.",
    description:
      "Registra o fim do consentimento no ACC por função de banco, com motivo opcional. Exige marcar 'Confirmo'. Não remove a permissão concedida ao Google: para isso o colaborador usa a conta Google dele ou o administrador do Google Workspace.",
    permissions: ADMIN_ONLY,
    consequences: ["O ACC deixa de considerar a conta autorizada nesta obra.", "O histórico da autorização é mantido."],
    humanReview: "A remoção da permissão no Google continua sendo ação humana fora do ACC.",
  },
  {
    id: "admin.autorizacoes.mensagem-resultado",
    kind: "message",
    module: M,
    version: V,
    title: "Mensagem de resultado",
    shortDescription: "Faixa no topo que informa o resultado da última solicitação, revogação ou erro.",
    description:
      "Faixa de status: solicitação registrada e e-mail enviado; solicitação registrada sem e-mail; autorização revogada; permissão negada (somente administradores); confirmação não marcada (nada foi alterado); colaborador não escolhido; ou mensagens amigáveis de erro conhecidas.",
  },
];
