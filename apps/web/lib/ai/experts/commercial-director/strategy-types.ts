// Resposta estruturada estratégica do Diretor Comercial IA
// (CommercialStrategyBrief): diagnóstico da negociação, estratégia,
// momento e forma de abordagem, cenários de concessão, impactos,
// objeções, roteiro de reuniões, minuta, condições de fechamento e
// decisões que exigem aprovação humana. Validada em ./strategy-schema.ts
// contra o contexto comercial efetivamente carregado — nenhum número sem
// fonte carregada, nenhuma autorização de desconto/obrigação.

/** Modo pedido pelo usuário — orienta quais seções devem vir preenchidas. */
export type CommercialStrategyMode =
  | "COMPLETO"
  | "DIAGNOSTICO_NEGOCIACAO"
  | "ESTRATEGIA_RECOMENDADA"
  | "MOMENTO_E_ABORDAGEM"
  | "CENARIOS_CONCESSAO"
  | "IMPACTOS"
  | "OBJECOES_E_RESPOSTAS"
  | "ROTEIRO_REUNIOES"
  | "MINUTA"
  | "CONDICOES_FECHAMENTO"
  | "DECISOES_APROVACAO_HUMANA";

/** Natureza de cada afirmação — fato nunca sem fonte. */
export type CommercialStatementKind = "FATO" | "HIPOTESE" | "CENARIO" | "RISCO" | "RECOMENDACAO";

export interface CommercialStatement {
  tipo: CommercialStatementKind;
  texto: string;
  /** Obrigatória para FATO: id COM-n do contexto comercial ou referência do contexto do projeto (evento/cláusula/e-mail). */
  fonte: string | null;
}

export type OpportunityStage =
  | "PROSPECCAO"
  | "QUALIFICACAO"
  | "PROPOSTA_EM_ELABORACAO"
  | "PROPOSTA_APRESENTADA"
  | "EM_NEGOCIACAO"
  | "FECHAMENTO"
  | "CONTRATADO"
  | "NAO_CONTRATADO"
  | "INDEFINIDO";

export type MaturityLevel = "BAIXA" | "MEDIA" | "ALTA" | "INDEFINIDA";

export interface NegotiationDiagnosis {
  estagioOportunidade: OpportunityStage;
  interessesCliente: CommercialStatement[];
  restricoesCliente: CommercialStatement[];
  posicaoCompetitiva: CommercialStatement[];
  decisoresEInterlocutores: CommercialStatement[];
  maturidade: { tecnica: MaturityLevel; comercial: MaturityLevel; contratual: MaturityLevel };
}

/** Movimentos negociais cujo momento o Expert avalia. */
export type CommercialTimingMove =
  | "APRESENTAR_DEMANDA"
  | "PEDIR_REVISAO_PRECO"
  | "PROPOR_ALTERNATIVA_TECNICA"
  | "FORMALIZAR_PLEITO"
  | "NEGOCIAR_ADITIVO"
  | "PEDIR_CONTRAPARTIDAS"
  | "APRESENTAR_PROPOSTA_FINAL"
  | "ACELERAR_FECHAMENTO"
  | "POSTERGAR_FECHAMENTO"
  | "AGUARDAR_DADOS";

export interface TimingAndApproach {
  movimentoRecomendado: CommercialTimingMove;
  agoraOuAguardar: "AGORA" | "AGUARDAR";
  justificativa: CommercialStatement[];
  condicoesParaAvancar: string[];
  interlocutor: string | null;
  canal: string | null;
  tomEPosicionamento: string | null;
  argumentacaoTecnica: string[];
  argumentacaoComercial: string[];
  documentosDeSuporte: string[];
}

export type ConcessionAcceptability = "SUSTENTADA_PELOS_DADOS" | "REQUER_ANALISE_ORCAMENTOS" | "NAO_RECOMENDADA";

export interface ConcessionScenario {
  descricao: string;
  contrapartidaExigida: string | null;
  aceitabilidadeEconomica: ConcessionAcceptability;
  /** Ids COM-n que fundamentam a avaliação econômica (obrigatórios quando SUSTENTADA_PELOS_DADOS). */
  fontesEconomicas: string[];
  riscos: string[];
}

export interface ObjectionResponse {
  objecao: string;
  resposta: string;
  fundamento: string | null;
}

export interface MeetingStep {
  ordem: number;
  objetivo: string;
  participantesSugeridos: string[];
  pauta: string[];
}

export type StrategyDraftType = "EMAIL" | "PROPOSAL" | "COUNTER_PROPOSAL" | "LETTER" | "MEETING_AGENDA" | "MEMO" | "AMENDMENT_TEXT";

export interface StrategyDraft {
  type: StrategyDraftType;
  subject: string | null;
  body: string;
  status: "DRAFT_PENDING_REVIEW";
}

export interface HumanApprovalDecision {
  decisao: string;
  responsavelSugerido: string;
  motivo: string;
}

/** Número citado na resposta — sempre ligado a um item COM-n carregado. */
export interface CitedNumber {
  valor: number;
  descricao: string;
  fonte: string;
}

export interface CommercialStrategyBrief {
  mode: CommercialStrategyMode;
  diagnostico: NegotiationDiagnosis;
  estrategiaRecomendada: CommercialStatement[];
  momentoEAbordagem: TimingAndApproach;
  cenariosConcessao: ConcessionScenario[];
  impactos: { economicos: CommercialStatement[]; contratuais: CommercialStatement[]; prazo: CommercialStatement[] };
  objecoesERespostas: ObjectionResponse[];
  roteiroReunioes: MeetingStep[];
  minuta: StrategyDraft | null;
  condicoesRecomendadasFechamento: CommercialStatement[];
  decisoesAprovacaoHumana: HumanApprovalDecision[];
  /** Pedidos explícitos à área de Orçamentos — obrigatórios quando faltam dados econômicos. */
  solicitacoesOrcamentos: string[];
  numerosCitados: CitedNumber[];
  informacoesFaltantes: string[];
  requiresHumanReview: true;
}
