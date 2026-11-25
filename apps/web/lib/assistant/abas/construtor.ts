// Construtor da base de conhecimento por aba (Fase 2, Frente E): reduz a repetição dos campos comuns e aplica padrões
// SEGUROS (perfis/permissões genéricos, captura pendente) para que nenhum dos 10 campos fique vazio.
// Puro: só tipos de ./tipos; sem I/O. Não contém conteúdo de especialista: só orientação de USO da tela.

import type {
  AcessoMenu,
  CapituloId,
  DiferencasPerfis,
  ItemConhecimento,
  Situacao,
  StatusRoteiro,
  TipoItem,
} from "./tipos";

export const PERMISSAO_PADRAO: Record<AcessoMenu, string> = {
  TODOS: "Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.",
  ADMINISTRADOR: "Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).",
  FINANCEIRO: "Só quem tem acesso financeiro à obra vê o item no menu e abre a tela; os demais não a veem (a rota também é protegida, não só o menu).",
  NIVEL_LEITURA: "Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).",
  NIVEL_COLABORADOR: "Membros ATIVOS com nível Colaborador ou superior veem a tela; o perfil Leitura não a vê (o menu esconde, mas a rota e o banco também bloqueiam).",
  SEM_MENU: "A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.",
};

export const PERFIS_PADRAO: Record<AcessoMenu, DiferencasPerfis> = {
  TODOS: {
    administrador: "Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.",
    gestor: "Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).",
    colaborador: "Vê a tela e faz os registros que o nível Colaborador permite.",
    leitura: "Só consulta; não grava.",
  },
  ADMINISTRADOR: {
    administrador: "Vê o item no menu, abre a tela e executa as ações.",
    gestor: "Não vê o item no menu e não abre a tela.",
    colaborador: "Não vê o item no menu e não abre a tela.",
    leitura: "Não vê o item no menu e não abre a tela.",
  },
  FINANCEIRO: {
    administrador: "Vê a tela quando tem acesso financeiro à obra.",
    gestor: "Vê a tela somente se tiver acesso financeiro à obra.",
    colaborador: "Vê a tela somente se tiver acesso financeiro à obra.",
    leitura: "Vê a tela somente se tiver acesso financeiro à obra.",
  },
  NIVEL_LEITURA: {
    administrador: "Vê a tela e executa as ações disponíveis.",
    gestor: "Vê a tela; as ações seguem o nível Gerente.",
    colaborador: "Vê a tela; registra o que o nível Colaborador permite.",
    leitura: "Vê a tela e consulta; não grava.",
  },
  NIVEL_COLABORADOR: {
    administrador: "Vê a tela e executa as ações disponíveis.",
    gestor: "Vê a tela; as ações seguem o nível Gerente.",
    colaborador: "Vê a tela e faz o que o nível Colaborador permite.",
    leitura: "Não vê o item no menu e não abre a tela.",
  },
  SEM_MENU: {
    administrador: "Abre pelo link ou botão e executa as ações disponíveis.",
    gestor: "Abre pelo link ou botão; as ações seguem o nível Gerente.",
    colaborador: "Abre pelo link ou botão; as ações seguem o nível Colaborador.",
    leitura: "Abre pelo link ou botão apenas para consultar, quando o servidor liberar.",
  },
};

export interface EntradaItem {
  id: string;
  nome: string;
  tipo: TipoItem;
  pai?: string;
  rota?: string;
  rel?: string[];
  cap: CapituloId;
  acesso: AcessoMenu;
  /** 1. finalidade */
  fin: string;
  /** 2. funcionalidades */
  fun: string[];
  /** 3. informações e indicadores */
  ind: string[];
  /** 4. passo a passo */
  passos: string[];
  /** 5. regras e status */
  regras: string[];
  /** 6. permissões (padrão pelo acesso) */
  perm?: string;
  /** 7. integrações */
  integ: string[];
  /** 8. perguntas: [pergunta, resposta, palavras-chave] */
  q: Array<[string, string, string[]]>;
  /** 9. limitações */
  lim: string[];
  /** 10. perfis (parcial sobrescreve o padrão) */
  perf?: Partial<DiferencasPerfis>;
  sit?: Situacao;
  rot?: StatusRoteiro;
  /** evidência da situação */
  ev: string;
  msg?: string[];
  /** palavras-chave da visão geral */
  kw: string[];
  fontes: string[];
}

export function item(e: EntradaItem): ItemConhecimento {
  const sit = e.sit ?? "OPERACIONAL";
  return {
    id: e.id,
    nome: e.nome,
    tipo: e.tipo,
    pai: e.pai,
    rota: e.rota,
    rotasRelacionadas: e.rel,
    capitulo: e.cap,
    acessoMenu: e.acesso,
    finalidade: e.fin,
    funcionalidades: e.fun,
    indicadores: e.ind,
    passoAPasso: e.passos,
    regrasEStatus: e.regras,
    permissoes: e.perm ?? PERMISSAO_PADRAO[e.acesso],
    integracoes: e.integ,
    perguntas: e.q.map(([pergunta, resposta, palavrasChave]) => ({ pergunta, resposta, palavrasChave })),
    limitacoes: e.lim,
    perfis: { ...PERFIS_PADRAO[e.acesso], ...(e.perf ?? {}) },
    situacao: sit,
    statusRoteiro: e.rot ?? "NAO-CONSTA",
    evidenciaSituacao: e.ev,
    mensagens: e.msg,
    capturas: [{ descricao: `Tela "${e.nome}" (captura de tela ainda não disponível)` }],
    palavrasChave: e.kw,
    fontes: e.fontes,
  };
}

/** Texto padrão de uma aba BLOQUEADA nesta versão (a AXIA diz que NÃO está disponível). */
export const TEXTO_BLOQUEADA =
  "Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.";
