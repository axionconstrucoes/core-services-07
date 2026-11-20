// Deriva deterministicamente um CommercialStrategyBrief a partir do
// contexto comercial carregado, para uso com o provider fake. Lógica
// específica deste Expert (nunca dentro do provider genérico). Não finge
// análise: só organiza o que foi carregado, cita a fonte de cada número,
// marca o que falta e pede a análise de Orçamentos — nunca inventa preço,
// custo, margem ou condição do cliente, e nunca autoriza concessão.

import { collectCitableCommercialNumbers } from "../../../commercial/format-commercial-context";
import { getInventoryEntry } from "../../../commercial/inventory";
import type { CommercialContext, CommercialContextItem } from "../../../commercial/types";
import type {
  CommercialStatement,
  CommercialStrategyBrief,
  CommercialStrategyMode,
  OpportunityStage,
  StrategyDraftType,
} from "./strategy-types";

const PROPOSAL_STATUS_TO_STAGE: Record<string, OpportunityStage> = {
  POSSIBLE_ADDITIONAL: "PROPOSTA_EM_ELABORACAO",
  UNDER_ANALYSIS: "PROPOSTA_APRESENTADA",
  IN_NEGOTIATION: "EM_NEGOCIACAO",
  CONTRACTED: "CONTRATADO",
  NOT_CONTRACTED: "NAO_CONTRATADO",
  CANCELLED: "NAO_CONTRATADO",
};

const DRAFT_REQUESTS: Array<{ keywords: string[]; type: StrategyDraftType }> = [
  { keywords: ["contraproposta"], type: "COUNTER_PROPOSAL" },
  { keywords: ["proposta"], type: "PROPOSAL" },
  { keywords: ["e-mail", "email"], type: "EMAIL" },
  { keywords: ["carta"], type: "LETTER" },
  { keywords: ["pauta"], type: "MEETING_AGENDA" },
  { keywords: ["aditivo"], type: "AMENDMENT_TEXT" },
  { keywords: ["memorando", "memo"], type: "MEMO" },
];

const DRAFT_VERBS = ["redija", "redigir", "prepare", "preparar", "escreva", "escrever", "elabore", "elaborar", "minuta"];

function detectDraftType(question: string, mode: CommercialStrategyMode): StrategyDraftType | null {
  const normalized = question.toLowerCase();
  const asksDraft = mode === "MINUTA" || DRAFT_VERBS.some((verb) => normalized.includes(verb));
  if (!asksDraft) return null;
  for (const { keywords, type } of DRAFT_REQUESTS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return type;
  }
  return "EMAIL";
}

function deriveStage(context: CommercialContext): OpportunityStage {
  const proposal = context.items.find((item) => item.key === "PROPOSTAS_ADICIONAIS" && item.availability === "DISPONIVEL");
  const status = typeof proposal?.value === "string" ? /status=([A-Z_]+)/.exec(proposal.value)?.[1] : undefined;
  return (status && PROPOSAL_STATUS_TO_STAGE[status]) || "INDEFINIDO";
}

function factFromItem(item: CommercialContextItem): CommercialStatement {
  const value = typeof item.value === "number" ? `valor registrado em numerosCitados (${item.id})` : String(item.value);
  return { tipo: "FATO", texto: `${item.label}: ${value}.`, fonte: item.id };
}

export function deriveFakeCommercialStrategyBrief(
  question: string,
  mode: CommercialStrategyMode,
  context: CommercialContext
): CommercialStrategyBrief {
  const available = context.items.filter((item) => item.availability === "DISPONIVEL");
  const missing = context.items.filter((item) => item.availability !== "DISPONIVEL");
  const economicMissing = context.missingEconomicKeys.length > 0;
  const markerFor = (key: string) => context.items.find((item) => item.key === key && item.availability !== "DISPONIVEL");

  const facts = available
    .filter((item) =>
      ["PROPOSTAS_ADICIONAIS", "RESPOSTAS_DE_ORCAMENTOS", "ALTERACOES_CONTRATUAIS", "PRECO_DE_VENDA"].includes(item.key)
    )
    .map(factFromItem);

  const economicGaps: CommercialStatement[] = context.missingEconomicKeys.map((key) => ({
    tipo: "RISCO",
    texto: `${getInventoryEntry(key).label}: dado não disponível no ACC — sem ele nenhuma concessão pode ser avaliada economicamente.`,
    fonte: markerFor(key)?.id ?? null,
  }));

  const draftType = detectDraftType(question, mode);
  const citable = Array.from(collectCitableCommercialNumbers(context).values());

  return {
    mode,
    diagnostico: {
      estagioOportunidade: deriveStage(context),
      interessesCliente: [],
      restricoesCliente: [],
      posicaoCompetitiva: [],
      decisoresEInterlocutores: [],
      maturidade: {
        tecnica: "INDEFINIDA",
        comercial: facts.length > 0 ? "MEDIA" : "INDEFINIDA",
        contratual: "INDEFINIDA",
      },
    },
    estrategiaRecomendada: [
      ...facts,
      {
        tipo: "RECOMENDACAO",
        texto: economicMissing
          ? "Consolidar a posição econômica com Orçamentos antes de qualquer movimento de preço ou concessão."
          : "Conduzir a negociação a partir dos dados econômicos carregados, sujeita a aprovação humana.",
        fonte: null,
      },
    ],
    momentoEAbordagem: {
      movimentoRecomendado: economicMissing ? "AGUARDAR_DADOS" : "PEDIR_CONTRAPARTIDAS",
      agoraOuAguardar: economicMissing ? "AGUARDAR" : "AGORA",
      justificativa: economicMissing
        ? economicGaps
        : [{ tipo: "HIPOTESE", texto: "Base econômica disponível; maturidade técnica e contratual ainda não avaliadas.", fonte: null }],
      condicoesParaAvancar: economicMissing
        ? ["Receber de Orçamentos custos, BDI, margem e contingências da proposta.", "Aprovação humana da faixa de negociação."]
        : ["Aprovação humana da faixa de negociação."],
      interlocutor: null,
      canal: null,
      tomEPosicionamento: null,
      argumentacaoTecnica: [],
      argumentacaoComercial: [],
      documentosDeSuporte: available
        .filter((item) => item.key === "ORCAMENTO_BASE_E_REVISOES")
        .map((item) => `${item.label} (${item.id})`),
    },
    cenariosConcessao: [
      {
        descricao: "Qualquer concessão de preço, prazo ou escopo.",
        contrapartidaExigida: null,
        aceitabilidadeEconomica: "REQUER_ANALISE_ORCAMENTOS",
        fontesEconomicas: [],
        riscos: economicMissing ? ["Concessão sem base de custo/margem pode comprometer o resultado da obra."] : [],
      },
    ],
    impactos: {
      economicos: economicGaps,
      contratuais: available
        .filter((item) => item.key === "ALTERACOES_CONTRATUAIS" || item.key === "CONDICOES_DE_CONTRATACAO")
        .map(factFromItem),
      prazo: available.filter((item) => item.key === "CRONOGRAMA_E_IMPACTOS_FINANCEIROS").map(factFromItem),
    },
    objecoesERespostas: [],
    roteiroReunioes: [
      {
        ordem: 1,
        objetivo: "Alinhamento interno com Orçamentos sobre a posição econômica.",
        participantesSugeridos: ["Diretoria Comercial", "Orçamentos", "Gerente do contrato"],
        pauta: ["Custos, BDI, margem e contingências da proposta", "Faixa de negociação a aprovar"],
      },
    ],
    minuta: draftType
      ? {
          type: draftType,
          subject: null,
          body:
            "[RASCUNHO GERADO PELO PROVIDER DE TESTE (FAKE) — apenas estrutura, sem conteúdo comercial real]\n\n" +
            `Pergunta original: "${question}"\n\n` +
            "Este rascunho não contém preço, condição ou compromisso — necessária definição humana e análise de Orçamentos antes de qualquer envio.",
          status: "DRAFT_PENDING_REVIEW",
        }
      : null,
    condicoesRecomendadasFechamento: [
      {
        tipo: "RECOMENDACAO",
        texto: "Fechar somente após validação de Orçamentos e aprovação formal da Diretoria.",
        fonte: null,
      },
    ],
    decisoesAprovacaoHumana: [
      {
        decisao: "Autorizar qualquer desconto, concessão de preço ou condição de pagamento.",
        responsavelSugerido: "Diretoria Comercial",
        motivo: "O Expert nunca autoriza descontos nem concessões.",
      },
      {
        decisao: "Aprovar o envio de proposta ou comunicação ao cliente.",
        responsavelSugerido: "Gerente do contrato / Diretoria Comercial",
        motivo: "Toda comunicação é rascunho pendente de revisão humana.",
      },
      {
        decisao: "Assumir obrigação contratual, aditivo ou conclusão do contrato.",
        responsavelSugerido: "Diretoria com apoio do Jurídico",
        motivo: "O Expert nunca assume obrigações nem conclui contratos.",
      },
    ],
    solicitacoesOrcamentos: context.missingEconomicKeys.map(
      (key) => `Solicitar à área de Orçamentos: ${getInventoryEntry(key).label} da proposta/obra (dado não disponível no ACC).`
    ),
    numerosCitados: citable.map((item) => ({ valor: item.value as number, descricao: item.label, fonte: item.id })),
    informacoesFaltantes: missing.map((item) => `${item.label} — ${item.availability}${item.note ? ` (${item.note})` : ""}`),
    requiresHumanReview: true,
  };
}
