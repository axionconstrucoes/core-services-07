// Catálogo de ajuda do módulo "shared" — arquivo EXCLUSIVO do agente/módulo (não editar em outros módulos).
// Regras de conteúdo: ver lib/ui/help/types.ts. Ids novos: "shared.global.elemento".
// Cobre os elementos globais (presentes em todas as telas): menu lateral, cabeçalho, seletor de projeto, badges de criticidade e de status
// e o próprio ícone de ajuda. Os itens do menu reaproveitam os helpIds legados de NAV_ITEMS (lib/ui/nav-items.ts).
import type { FeatureHelpDefinition } from "../types";

const V = "2026-11-20";
const M = "shared";

// Divergência SLA aprovado x configuração operacional publicada (declarada em `validity`, nunca apresentada como regra ativa).
const SLA_VALIDITY =
  "Prazo para assumir: CRÍTICO 1 hora corrida e ALTO 4 horas úteis; para MÉDIO e BAIXO, o prazo vem da Matriz de SLA configurada para a obra (tela Usuários, bloco Prazos por grau de risco). Alterações na matriz valem para novos alertas; alertas já abertos mantêm o prazo de quando foram criados. Selo e prazo seguem a Matriz de SLA da obra.";

export const SHARED_HELP: FeatureHelpDefinition[] = [
  {
    id: "shared.global.criticidade-baixo",
    title: "Criticidade Baixo",
    shortDescription: "Impacto limitado; acompanhamento de rotina. Selo verde-escuro. Prazo para assumir: conforme a Matriz de SLA da obra.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Nível mais baixo da escala de criticidade (BAIXO, MÉDIO, ALTO, CRÍTICO). Indica impacto limitado, com acompanhamento de rotina. É o selo verde-escuro com texto branco em negrito (#166534 sobre #FFFFFF).",
    purpose: "Padronizar em todo o ACC como um risco ou achado é classificado e com que urgência deve ser tratado.",
    criteria: [
      "A mesma paleta vale em todas as telas (fonte única: severityClasses em components/shared/badges.tsx); cor nunca é a única informação, o rótulo Baixo sempre acompanha o selo.",
      "Prazo para assumir a ação: conforme a Matriz de SLA configurada para a obra.",
    ],
    source: "Classificação de risco do ACC (AlertSeverity BAIXA) e matriz de SLA da obra.",
    validity: SLA_VALIDITY,
    humanReview: "A criticidade é uma classificação de apoio; quem trata a ação decide a conduta.",
  },
  {
    id: "shared.global.criticidade-medio",
    title: "Criticidade Médio",
    shortDescription: "Exige atenção e acompanhamento. Selo azul. Prazo para assumir: conforme a Matriz de SLA da obra.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Segundo nível da escala (BAIXO, MÉDIO, ALTO, CRÍTICO). Indica situação que exige atenção e acompanhamento. É o selo azul com texto branco em negrito (#2563EB sobre #FFFFFF).",
    purpose: "Padronizar em todo o ACC como um risco ou achado é classificado e com que urgência deve ser tratado.",
    criteria: [
      "A mesma paleta vale em todas as telas (severityClasses em components/shared/badges.tsx); o rótulo Médio sempre acompanha o selo.",
      "Prazo para assumir a ação: conforme a Matriz de SLA configurada para a obra.",
    ],
    source: "Classificação de risco do ACC (AlertSeverity MEDIA) e matriz de SLA da obra.",
    validity: SLA_VALIDITY,
    humanReview: "A criticidade é uma classificação de apoio; quem trata a ação decide a conduta.",
  },
  {
    id: "shared.global.criticidade-alto",
    title: "Criticidade Alto",
    shortDescription: "Pode gerar impacto relevante. Selo amarelo forte com texto preto. Prazo para assumir: 4 horas úteis.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Terceiro nível da escala (BAIXO, MÉDIO, ALTO, CRÍTICO). Indica situação que pode gerar impacto contratual, econômico ou operacional relevante. É o selo amarelo forte com texto PRETO em negrito (#FFD600 sobre #000000), nunca laranja.",
    purpose: "Padronizar em todo o ACC como um risco ou achado é classificado e com que urgência deve ser tratado.",
    criteria: [
      "A mesma paleta vale em todas as telas (severityClasses em components/shared/badges.tsx); o rótulo Alto sempre acompanha o selo.",
      "Prazo aprovado para assumir a ação: 4 horas úteis.",
      "Ação de nível Alto exige confirmação de ciência (matriz de SLA padrão).",
    ],
    source: "Classificação de risco do ACC (AlertSeverity ALTA) e matriz de SLA da obra.",
    validity: SLA_VALIDITY,
    humanReview: "A criticidade é uma classificação de apoio; quem trata a ação decide a conduta.",
  },
  {
    id: "shared.global.criticidade-critico",
    title: "Criticidade Crítico",
    shortDescription: "Consequência grave, atenção prioritária. Selo vermelho. Prazo para assumir: 1 hora corrida.",
    kind: "status",
    module: M,
    version: V,
    description:
      "Nível máximo da escala (BAIXO, MÉDIO, ALTO, CRÍTICO). Indica situação que pode gerar consequência grave e exige atenção prioritária. É o selo vermelho forte com texto branco em negrito (#DC2626 sobre #FFFFFF).",
    purpose: "Padronizar em todo o ACC como um risco ou achado é classificado e com que urgência deve ser tratado.",
    criteria: [
      "A mesma paleta vale em todas as telas (severityClasses em components/shared/badges.tsx); o rótulo Crítico sempre acompanha o selo.",
      "Prazo aprovado para assumir a ação: 1 hora corrida (não depende de expediente).",
      "Ação de nível Crítico exige confirmação de ciência (matriz de SLA padrão).",
    ],
    source: "Classificação de risco do ACC (AlertSeverity CRITICA) e matriz de SLA da obra.",
    validity: SLA_VALIDITY,
    humanReview: "A criticidade é uma classificação de apoio; quem trata a ação decide a conduta.",
  },
  {
    id: "shared.global.status-global",
    title: "Selos de status",
    shortDescription: "Cores e significados dos selos de situação (evento, integração, solicitação, adicional, anexo, conta de e-mail).",
    kind: "status",
    module: M,
    version: V,
    description:
      "Selos de situação padronizados em components/shared/badges.tsx. Evento: Novo, Em Análise, Confrontado, Resolvido. Integração: Ativo (verde-escuro), Pendente (amarelo forte com texto preto), Atenção (laranja) e Erro (vermelho), sempre sólidos e em negrito. Solicitação: Aberta, Encerrada, Cancelada. Candidato de confronto: Pendente de revisão, Aprovado, Rejeitado. Adicional: Possível adicional, Em análise, Em negociação, Contratado, Não contratado, Cancelado. Anexo de e-mail: pendente, em processamento, processado ou falha. Conta de e-mail: Não conectada, Conectada, Sincronizando, Autorização expirada, Erro.",
    purpose: "Dar a mesma linguagem visual de situação em todas as telas.",
    criteria: [
      "Atenção é sempre distinto de Erro: autorização expirada, nova tentativa ou falha não bloqueante não significam que a fonte não consegue operar.",
      "A cor identifica o ESTADO, nunca a FONTE da integração.",
      "O rótulo textual sempre acompanha a cor.",
    ],
    source: "components/shared/badges.tsx e rótulos em lib/labels.ts.",
    humanReview: "Selo de situação informa o estado registrado; não substitui a conferência da fonte original.",
  },
  {
    id: "shared.global.seletor-projeto",
    title: "Seletor de projeto",
    shortDescription: "Troca a obra em exibição; abre o Dashboard do projeto escolhido.",
    kind: "filter",
    module: M,
    version: V,
    description:
      "Lista suspensa no cabeçalho com os projetos aos quais você tem acesso. Ao escolher um projeto o ACC abre o Dashboard dele; o nome completo aparece ao pairar sobre o seletor. Ao lado aparece o número do contrato do projeto atual, quando cadastrado.",
    purpose: "Alternar entre obras sem voltar à tela de projetos.",
    howToUse: ["Abra a lista e escolha o projeto.", "A troca leva sempre ao Dashboard do projeto novo, não à tela em que você estava."],
    howItWorks: "A lista vem de getProjects (projetos com acesso ativo do usuário); a escolha navega por /<projeto>/dashboard. Nenhum dado é alterado.",
    permissions: "Mostra apenas projetos em que o usuário tem acesso; o menu e as telas aplicam a permissão do projeto escolhido.",
  },
  {
    id: "shared.global.icone-ajuda",
    title: "Ícone de ajuda (i)",
    shortDescription: "Abre o texto explicativo de cada tela, aba, botão, indicador, status ou campo.",
    kind: "message",
    module: M,
    version: V,
    description:
      "O ícone (i) ao lado de títulos, abas, campos, botões, indicadores, selos e colunas abre um painel com a explicação do elemento: o que é, para que serve, como usar, como funciona, fonte dos dados, limitações e quando exige revisão humana.",
    purpose: "Funcionar como manual contextual, sem sair da tela.",
    howToUse: [
      "Computador: passe o mouse sobre o ícone para abrir; o painel permanece aberto enquanto o ponteiro estiver sobre o ícone ou o painel (dá para rolar). Clique no ícone para fixar.",
      "Teclado: Tab até o ícone e Enter ou Espaço para abrir; ESC fecha e devolve o foco.",
      "Celular ou toque: toque no ícone para abrir uma folha na parte inferior, com rolagem e botão Fechar; toque fora também fecha.",
    ],
    howItWorks:
      "O texto de cada ajuda vem do catálogo único; só um painel fica aberto por vez. Clicar no ícone nunca navega, seleciona linha ou executa a ação do elemento ao lado. O número da versão do texto aparece no rodapé do painel.",
    limitations: [
      "No menu lateral, cada item tem o seu próprio ícone (i) ao lado do link (com o menu recolhido ele continua ao lado do ícone do item); o ícone não é o link: abrir a ajuda não navega.",
      "O ícone nunca usa a dica nativa do navegador (atributo title); em toque, a ajuda abre como folha inferior e não depende de pairar o mouse.",
    ],
  },
  {
    id: "shared.global.menu-lateral",
    title: "Menu lateral",
    shortDescription: "Navegação principal do projeto; alguns itens só aparecem para administradores ou autorizados.",
    kind: "module",
    module: M,
    version: V,
    description:
      "Barra lateral com os itens de navegação do projeto atual (Dashboard, Timeline, Eventos, Solicitações, Ações e Escalonamentos, Jurídico, Documentos, Providências, Financeiro, ESG/SSMA, Experts IA, Integrações, Usuários, Autorizações, Reemissão de alertas, Auditoria, Ajuda e tutorial e Start-up ACC). O botão no rodapé recolhe ou expande o menu e a escolha fica salva neste navegador.",
    purpose: "Levar a cada área do projeto com um clique.",
    howToUse: [
      "Clique no item para abrir a área.",
      "Use o ícone (i) ao lado de cada item para ler o resumo da área: pairar o mouse, Tab + Enter/Espaço ou um toque abrem a ajuda, inclusive com o menu recolhido.",
      "Use Recolher para liberar espaço; em telas estreitas o menu fica sempre recolhido.",
    ],
    howItWorks:
      "Os itens vêm de NAV_ITEMS (lib/ui/nav-items.ts). Eventos, Integrações, Usuários, Autorizações, Reemissão de alertas e Start-up ACC só aparecem para administrador; Financeiro só para quem passa na regra de acesso financeiro. Esconder o item não é a única barreira: rota, carregamento de dados, ações e RLS aplicam a mesma regra.",
    permissions: "Itens restritos conforme o perfil do usuário no projeto (administrador ou acesso financeiro).",
  },
  {
    id: "shared.global.cabecalho",
    title: "Cabeçalho do ACC",
    shortDescription: "Título, seletor de projeto, contrato, Editar projeto, assistente AXIA, avatar e Sair.",
    kind: "module",
    module: M,
    version: V,
    description:
      "Faixa superior fixa de todas as telas do projeto. Reúne o título AXION Controle de Contratos, o seletor de projeto, o número do contrato, o botão Editar projeto (somente para quem pode editar o projeto), o atalho Fale com a AXIA (assistente de dúvidas sobre o uso do ACC), o avatar e o botão Sair, que encerra a sessão.",
    purpose: "Dar contexto (qual obra) e acesso rápido às ações globais.",
    howToUse: ["Use o seletor para trocar de obra.", "Use Fale com a AXIA para perguntar como usar o ACC.", "Use Sair para encerrar a sessão."],
    howItWorks:
      "A AXIA é exclusivamente o assistente de dúvidas sobre o uso do ACC; ela não é um especialista e não se confunde com os Experts IA. O avatar exibe um texto fixo (AS) e não as iniciais do usuário logado.",
    permissions: "Editar projeto só aparece para quem tem permissão de edição do projeto.",
  },
  {
    id: "shared.global.menu-recolher",
    title: "Recolher / Expandir menu lateral",
    shortDescription: "Alterna o menu lateral entre completo (ícone e nome) e recolhido (só ícones); a escolha fica salva neste navegador.",
    kind: "button",
    module: M,
    version: V,
    description:
      "Botão no rodapé do menu lateral. Com o menu completo ele aparece como Recolher; com o menu recolhido, como um ícone que expande de volta. Não altera dados do projeto, só a largura da barra.",
    purpose: "Liberar espaço na tela sem perder a navegação.",
    howToUse: [
      "Clique em Recolher para deixar só os ícones (cada item continua com o seu ícone (i) de ajuda e o nome acessível pelo leitor de tela).",
      "Clique de novo para expandir e voltar a ver os nomes dos itens.",
    ],
    howItWorks:
      "O estado recolhido é gravado no armazenamento local deste navegador (chave acc.sidebar.collapsed); outro navegador ou dispositivo começa com o menu expandido. Em telas estreitas (celular) o menu fica sempre recolhido, independentemente da escolha.",
    data: ["Preferência de exibição do usuário neste navegador; nada é enviado ao servidor."],
    permissions: "Disponível a qualquer usuário autenticado.",
  },
];
