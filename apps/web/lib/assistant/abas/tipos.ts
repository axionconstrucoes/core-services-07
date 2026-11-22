// Base de conhecimento POR ABA do ACC — FONTE ÚNICA estruturada (Fase 2, Frente E).
//
// Um único conjunto de dados alimenta DUAS saídas, para que nunca divirjam:
//   1. a AXIA (lib/assistant/abas/axia-entradas.ts converte cada item em entradas da base de respostas);
//   2. o Manual do Usuário (scripts/gerar-manual-usuario.mjs gera docs/manual/manual-usuario-acc.md a partir destes dados;
//      scripts/test-axia-manual-abas.mjs falha se o arquivo publicado divergir do gerado).
//
// Regras de conteúdo (verificadas por scripts/test-axia-manual-abas.mjs):
//  - só descrever o que o código REALMENTE faz; nunca inventar instrução para recurso não implementado;
//  - `nome` é o rótulo exato da tela (o mesmo de NAV_ITEMS, SEGUROS_TABS, QUALITY_TABS e das abas declaradas nas páginas);
//  - funcionalidade bloqueada nesta versão (decisão da Fase 2) tem situacao "BLOQUEADA": a AXIA diz que NÃO está disponível;
//  - a AXIA é o assistente de USO do ACC; questões técnicas da obra são dos ESPECIALISTAS de IA (Experts IA). Nunca confundir;
//  - SLA aprovado: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis;
//  - a barra lateral mostra ícone + texto SEMPRE visíveis, sem texto ao passar o mouse.
//
// Puro, sem I/O e sem importações de código (só tipos): importável pelo Next.js e por scripts Node.

/** Capítulo do Manual do Usuário em que o item é descrito (a ordem do manual segue CAPITULOS). */
export type CapituloId =
  | "acesso-navegacao"
  | "dashboard-indicadores"
  | "planejamento-custos"
  | "juridico-contratos"
  | "ssma"
  | "qualidade"
  | "seguros-garantias"
  | "integracoes"
  | "alertas-sla"
  | "respostas-email"
  | "axia-especialistas"
  | "administracao"
  | "demais";

/**
 * Situação para o usuário:
 *  - OPERACIONAL: existe e funciona conforme testes automatizados, mas ainda sem homologação em tela autenticada;
 *  - HOMOLOGADA: homologada em tela autenticada para todos os perfis (nenhuma tela está assim em 22/11/2026);
 *  - PARCIALMENTE_HOMOLOGADA: vista em sessão autenticada para parte dos perfis/casos (roteiro: EXECUTADO-AUTENTICADO parcial);
 *  - BLOQUEADA: travada nesta versão (por permissão no banco ou chave desligada por padrão) — NÃO disponível ao usuário.
 */
export type Situacao = "OPERACIONAL" | "HOMOLOGADA" | "PARCIALMENTE_HOMOLOGADA" | "BLOQUEADA";

/** Status da linha correspondente em docs/homologacao-autenticada-roteiro.md (quadro da seção 9 e seções 15/16). */
export type StatusRoteiro = "EXECUTADO-AUTENTICADO" | "EXECUTADO-BANCO-REAL" | "FIXTURE" | "BLOQUEADO" | "NAO-CONSTA";

/**
 * Quem vê o item no menu/na tela:
 *  TODOS: qualquer membro ATIVO da obra; ADMINISTRADOR: NAV_ITEMS restrictedTo "admin"; FINANCEIRO: restrictedTo "financial";
 *  NIVEL_LEITURA / NIVEL_COLABORADOR: TIER_GATED_SEGMENTS (READ / REGISTER); SEM_MENU: rota sem item de menu (aberta por link,
 *  botão, e-mail ou outra tela).
 */
export type AcessoMenu = "TODOS" | "ADMINISTRADOR" | "FINANCEIRO" | "NIVEL_LEITURA" | "NIVEL_COLABORADOR" | "SEM_MENU";

export type TipoItem = "menu" | "aba" | "subaba" | "pagina" | "global" | "tema";

export interface Captura {
  /** O que a captura mostra. */
  descricao: string;
  /** Caminho de uma captura EXISTENTE no repositório (relativo à raiz). Ausente = "captura pendente de sessão autenticada". */
  arquivo?: string;
}

export interface PerguntaExemplo {
  pergunta: string;
  /** Resposta que a AXIA dá (texto aprovado; aparece igual no manual). */
  resposta: string;
  /** Frases/palavras (minúsculas, sem acento) que levam a AXIA a esta pergunta. Preferir frases com o nome da aba. */
  palavrasChave: string[];
}

export interface DiferencasPerfis {
  administrador: string;
  /** GESTOR e GERENTE (mesmo nível; a tela mostra "Gerente"). */
  gestor: string;
  colaborador: string;
  leitura: string;
}

export interface ItemConhecimento {
  /** Identificador estável (minúsculas, hífens e pontos). Subabas: "<pai>.<aba>". */
  id: string;
  /** Rótulo EXATO exibido na tela. */
  nome: string;
  tipo: TipoItem;
  /** id do item pai (abas e subabas). */
  pai?: string;
  /** Rota real (padrão de pastas do Next.js, ex.: "/[projectId]/dashboard"). Temas não têm rota. */
  rota?: string;
  /** Outras rotas reais cobertas por este item (detalhes, redirecionamentos). */
  rotasRelacionadas?: string[];
  capitulo: CapituloId;
  acessoMenu: AcessoMenu;

  // ───── os 10 campos ─────
  /** 1. Nome e finalidade (o nome está em `nome`). */
  finalidade: string;
  /** 2. Funcionalidades. */
  funcionalidades: string[];
  /** 3. Informações e indicadores exibidos. */
  indicadores: string[];
  /** 4. Passo a passo. */
  passoAPasso: string[];
  /** 5. Regras e significados de status. */
  regrasEStatus: string[];
  /** 6. Permissões. */
  permissoes: string;
  /** 7. Integração com outros módulos. */
  integracoes: string[];
  /** 8. Exemplos de perguntas e respostas (a AXIA responde exatamente `resposta`). */
  perguntas: PerguntaExemplo[];
  /** 9. Limitações e o que não está homologado. */
  limitacoes: string[];
  /** 10. Diferenças entre perfis. */
  perfis: DiferencasPerfis;

  // ───── manual ─────
  situacao: Situacao;
  statusRoteiro: StatusRoteiro;
  /** De onde vem a situação (linha do roteiro, matriz de prontidão, decisão da Fase 2, chave de configuração). */
  evidenciaSituacao: string;
  /** Mensagens e estados que a pessoa vê na tela (literais quando possível). */
  mensagens?: string[];
  capturas: Captura[];

  // ───── AXIA ─────
  /** Frases/palavras (minúsculas, sem acento) que levam a AXIA à visão geral do item. */
  palavrasChave: string[];
  /** Arquivos do código/documentos que sustentam o conteúdo (rastreabilidade). */
  fontes: string[];
}

export interface Capitulo {
  id: CapituloId;
  numero: number;
  titulo: string;
  /** Texto de abertura do capítulo no manual. */
  introducao: string;
}

export const CAPITULOS: Capitulo[] = [
  { id: "acesso-navegacao", numero: 1, titulo: "Acesso, navegação e perfis", introducao: "Como entrar no ACC, escolher a obra, navegar pela barra lateral e entender o que cada perfil pode fazer." },
  { id: "dashboard-indicadores", numero: 2, titulo: "Dashboard e indicadores", introducao: "Visões executivas da obra: Dashboard, Quatro Pilares, Timeline e Auditoria." },
  { id: "planejamento-custos", numero: 3, titulo: "Planejamento e Custos", introducao: "Providências de entrega da obra, cronograma e o painel Financeiro (restrito)." },
  { id: "juridico-contratos", numero: 4, titulo: "Jurídico e contratos", introducao: "Documentos do contrato, cláusulas, eventos com implicação contratual e o Expert Jurídico." },
  { id: "ssma", numero: 5, titulo: "SSMA, ocorrências, ações e uso offline", introducao: "ESG/SSMA no ACC, registros de campo, avaliação e o app de campo que funciona sem internet." },
  { id: "qualidade", numero: 6, titulo: "Qualidade e RNC", introducao: "Módulo de Qualidade: RNC, evidências, ações (CAPA), eficácia e as abas bloqueadas nesta versão." },
  { id: "seguros-garantias", numero: 7, titulo: "Seguros e Garantias", introducao: "Apólices, endossos, adiantamentos, sinistros, minutas e canais oficiais; casos de garantia técnica." },
  { id: "integracoes", numero: 8, titulo: "Integrações", introducao: "Gmail, Outlook, Google Drive e demais conectores existentes, caixas de e-mail, contatos externos, sinais de e-mail e autorizações." },
  { id: "alertas-sla", numero: 9, titulo: "Alertas por e-mail, criticidades, SLA e escalonamentos", introducao: "Como os alertas nascem, os prazos por criticidade (SLA), o escalonamento e a reemissão." },
  { id: "respostas-email", numero: 10, titulo: "Respostas e resolução pelo e-mail", introducao: "O que já funciona pelo e-mail e o que continua bloqueado nesta versão." },
  { id: "axia-especialistas", numero: 11, titulo: "AXIA e Especialistas", introducao: "A AXIA esclarece dúvidas de USO do ACC; os Especialistas de IA tratam questões técnicas da obra." },
  { id: "administracao", numero: 12, titulo: "Administração, usuários, competências e permissões", introducao: "Gestão de pessoas e perfis, competências, aprovações externas, criação de obras e Start-up ACC." },
  { id: "demais", numero: 13, titulo: "Demais abas", introducao: "Ajuda e tutorial e as telas fora do menu que continuam acessíveis." },
];

export const SITUACAO_ROTULO: Record<Situacao, string> = {
  OPERACIONAL: "Operacional (sem homologação em tela autenticada)",
  HOMOLOGADA: "Homologada",
  PARCIALMENTE_HOMOLOGADA: "Parcialmente homologada",
  BLOQUEADA: "Bloqueada nesta versão",
};

export const ACESSO_ROTULO: Record<AcessoMenu, string> = {
  TODOS: "Todos os membros ativos da obra",
  ADMINISTRADOR: "Somente Administrador da obra",
  FINANCEIRO: "Somente quem tem acesso financeiro à obra",
  NIVEL_LEITURA: "Membros ativos com nível Leitura ou superior",
  NIVEL_COLABORADOR: "Membros ativos com nível Colaborador ou superior (Leitura não vê)",
  SEM_MENU: "Sem item no menu: aberta por link, botão, e-mail ou outra tela",
};
