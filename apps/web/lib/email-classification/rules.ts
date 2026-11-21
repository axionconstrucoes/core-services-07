// Regras determinísticas (versão RULE_VERSION) de sinais de risco por pilar. Operam sobre a sentença NORMALIZADA (sem acento,
// minúscula). Uma sentença pode disparar várias regras (ex.: prazo + custo). Resultado é INDÍCIO, nunca fato comprovado.
import type { Pillar } from "./types";

export interface SignalRule {
  id: string;
  pillar: Pillar;
  kind: string;
  summary: string;
  /** Todas as expressões devem casar na MESMA sentença. */
  all: RegExp[];
  /** Se informado, apenas fornecedores/subcontratados disparam (taxonomia de fornecedor). */
  supplierOnly?: boolean;
}

const SUPPLY = /\b(fabricac|fabrica|entrega|embarque|fornecimento|producao|material|materiais|equipamento|montagem|pedido|oc\b|ordem de compra|lote)/;

export const SIGNAL_RULES: readonly SignalRule[] = [
  // ---- PRAZO ----
  { id: "p-atraso-entrega", pillar: "PRAZO", kind: "ATRASO_FABRICACAO_ENTREGA", summary: "Indício de atraso de fabricação/entrega/fornecimento.",
    all: [/\b(atraso|atrasad|atrasar|atrasou|atrasara|postergad|adiad|prorrog|nova data|replaneja|nao (conseguiremos|conseguimos|havera) (entregar|cumprir))/, SUPPLY] },
  { id: "p-paralisacao", pillar: "PRAZO", kind: "RISCO_PARALISACAO", summary: "Indício de risco de paralisação de frente/obra.",
    all: [/\b(paralisa|paralisacao|obra parada|frente parada|interrupcao (da|dos) (obra|servicos|trabalhos)|parada (da|de) (obra|frente|producao)|embargo)/] },
  { id: "p-suspensao", pillar: "PRAZO", kind: "SUSPENSAO_FORNECIMENTO", summary: "Indício de suspensão de fornecimento/serviço.",
    all: [/\bsuspend|suspens/, /\b(fornecimento|entregas?|servicos?|contrato|atividades|producao)/] },
  { id: "p-cancelamento", pillar: "PRAZO", kind: "CANCELAMENTO_PEDIDO", summary: "Indício de cancelamento de pedido/ordem/fornecimento.",
    all: [/\bcancel/, /\b(pedido|ordem de compra|oc\b|contrato|fornecimento|entrega|encomenda|locacao)/] },
  { id: "p-escassez", pillar: "PRAZO", kind: "ESCASSEZ_INSUMO", summary: "Indício de escassez de insumo/material/mão de obra.",
    all: [/\b(escassez|desabastecimento|falta de (material|materiais|insumo|insumos|aco|cimento|mao de obra|equipamento|componentes?)|indisponibilidade de (material|insumo|mao de obra))/] },
  { id: "p-substituicao", pillar: "PRAZO", kind: "NECESSIDADE_SUBSTITUICAO", summary: "Indício de necessidade de substituição de fornecedor/equipe/material.",
    all: [/\b(substitui|substituir|substituicao|troca de|trocar)\b/, /\b(fornecedor|subcontratad|empreiteir|equipe|empresa|material|equipamento)/] },
  // ---- CUSTO ----
  { id: "c-reajuste", pillar: "CUSTO", kind: "REAJUSTE_AUMENTO_PRECO", summary: "Indício de reajuste/aumento de preço (não formalizado).",
    all: [/\b(reajuste|reajustar|aumento (de|nos?) (preco|precos|valor|valores|custo)|majorac|reequilibri|repasse (de|do) custo|atualizacao de precos?|novo preco|acrescimo de \d)/] },
  { id: "c-renegociacao", pillar: "CUSTO", kind: "RENEGOCIACAO", summary: "Indício de pedido de renegociação comercial.",
    all: [/\b(renegocia|revisao (de|dos) (preco|precos|valores)|revisar (os )?(preco|precos|valores)|nova proposta comercial|rever (o )?valor)/] },
  { id: "c-custo-adicional", pillar: "CUSTO", kind: "CUSTO_ADICIONAL", summary: "Indício de custo adicional alegado.",
    all: [/\b(custos? adicional|custos adicionais|despesas? adicional|despesas adicionais|sobrecusto|extra[- ]contrato|servicos? extras?)/] },
  // ---- SEGURANÇA ----
  { id: "s-ocorrencia", pillar: "SEGURANCA", kind: "OCORRENCIA_SEGURANCA", summary: "Indício de ocorrência/risco de segurança do trabalho.",
    all: [/\b(acidente|quase[- ]acidente|incidente (de seguranca|com)|lesao|queda de (altura|material)|choque eletrico|sem epi|risco (grave|de vida)|interdicao|trabalhador (ferido|acidentado))/] },
  // ---- QUALIDADE ----
  { id: "q-defeito", pillar: "QUALIDADE", kind: "QUALIDADE_DEFEITO", summary: "Indício de defeito/não conformidade de qualidade.",
    all: [/\b(defeito|defeituos|nao conformidade|nao conforme|fissura|trinca|infiltracao|vazamento|retrabalho|reprovad|patologia|rejeitad[oa] (pela|pelo)|fora (de|do) (especificacao|padrao|projeto))/] },
  { id: "q-montagem", pillar: "QUALIDADE", kind: "QUALIDADE_MONTAGEM", summary: "Indício de falha de montagem/instalação.",
    all: [/\b(montagem|instalacao)\b/, /\b(incorret|errad|falha|defeit|desalinh|fora de prumo|mal executad)/] },
  // ---- JURÍDICO ----
  { id: "j-descumprimento", pillar: "JURIDICO", kind: "DESCUMPRIMENTO_INDICIO", summary: "Indício de descumprimento contratual alegado (não comprovado).",
    all: [/\b(descumpr|inadimpl|violacao contratual|quebra de contrato|rescisao|multa contratual|penalidades?|notificacao extrajudicial|inexecucao)/] },
  { id: "j-pleito", pillar: "JURIDICO", kind: "PLEITO", summary: "Indício de pleito/reivindicação (claim) contratual.",
    all: [/\b(pleito|pleitear|reivindic|claim|pedido de aditivo|solicitamos (aditivo|reequilibrio)|reequilibrio economico)/] },
  { id: "j-responsabilidade", pillar: "JURIDICO", kind: "CONFLITO_RESPONSABILIDADE", summary: "Indício de conflito de responsabilidade entre partes.",
    all: [/\b(responsabilidade (e|sera|eh|recai|cabe) (da|do|de)|nao (e|eh|somos) (de )?(nossa )?responsabilidade|transferir (a )?responsabilidade|quem (responde|arca)|culpa (da|do|de))/] },
  { id: "j-reclamacao", pillar: "JURIDICO", kind: "RECLAMACAO_FORMAL", summary: "Reclamação/insatisfação formal registrada na mensagem.",
    all: [/\b(reclamacao|reclamamos|reclamar|insatisf|inaceitavel|exigimos|formalmente (reclam|questionam)|protestamos)/] },
];

/** Diretivas (ordens/instruções contratuais) e seu tópico — base da checagem de autoridade/delegação. */
export interface DirectiveTopic {
  topic: string; // chave comparada com delegation_scope (maiúscula)
  contractual: boolean; // altera termos do contrato (escopo/aditivo/prazo/reajuste/preço) => exige formalização
  re: RegExp;
}
export const DIRECTIVE_VERB = /\b(determinamos|determino|ordenamos|ordeno|fica determinado|solicito|solicitamos|exigimos|autorizamos|autorizo|aprovamos|aprovo|instruimos|instruo|deverao?|devera|favor (executar|realizar|providenciar))\b/;

export const DIRECTIVE_TOPICS: readonly DirectiveTopic[] = [
  { topic: "ESCOPO", contractual: true, re: /\b(escopo|servicos? adicional|servicos adicionais|servico extra|obra adicional|demolicao adicional|acrescimo de (servico|escopo)|supressao de servico)/ },
  { topic: "ADITIVO", contractual: true, re: /\b(aditivo|termo aditivo|alteracao contratual|alterar (o )?contrato)/ },
  { topic: "PRAZO", contractual: true, re: /\b(prorrogacao de prazo|novo prazo|alterar (o )?prazo|antecipar (o )?prazo|reprogramar|reprogramacao do cronograma|alteracao (do|de) prazo)/ },
  { topic: "REAJUSTE", contractual: true, re: /\b(reajuste|reequilibrio|atualizacao monetaria|indice de reajuste)/ },
  { topic: "PRECO", contractual: true, re: /\b(alterar (o )?(preco|valor)|novo (preco|valor)|desconto|revisao de preco|preco unitario)/ },
  { topic: "OS", contractual: false, re: /\b(ordem de servico|ordens de servico|os[- ]?(n|no|numero)?\.? ?\d+)/ },
  { topic: "RNC", contractual: false, re: /\b(rnc|relatorio de nao conformidade|nao conformidade)/ },
  { topic: "EXECUCAO", contractual: false, re: /\b(executar|refazer|corrigir|substituir|demolir|reforcar|isolar|interditar|paralisar)/ },
];

/** Indica impacto de custo/prazo numa diretiva operacional (exige aprovação do cliente se não delegado). */
export const IMPACT_RE = /\b(custo|custos|valor adicional|prazo|cronograma|reprograma|medicao|pagamento)\b/;

export const NOTIFICATION_RE = /\b(notificacao (formal|oficial|extrajudicial)|notificamos|ficam? (v\.?sas?\.?|voces) notificad|prazo de \d+ \(?\w*\)? ?(dias|horas|dia util|dias uteis) para (resposta|manifestacao|regularizacao|saneamento))/;

export const PERCENT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?%/g;
export const MONEY_RE = /r\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/g;
export const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
