// Classificação determinística ÁREA/ASSUNTO → Expert. Fonte única dos padrões de tema usados por
// todos os caminhos de roteamento (caixa CONSULTAR IA, ESPECIALISTA do caso de risco e curadoria
// multi-Expert) — nunca uma segunda lista paralela de palavras-chave por caminho.
//
// Regras:
//   - Planejamento (cronograma, CPM, caminho crítico, folga, curva S, atraso, recuperação) → planning-director;
//   - Engenharia (fundações, estruturas, pisos, coberturas, métodos construtivos, construtibilidade,
//     compatibilização, engenharia de valor) → engineering-director — nunca o inverso;
//   - Jurídico (contrato, cláusula, obrigação, multa, notificação, aditivo) → legal-consultant;
//   - Comercial/Financeiro/Orçamento (custo, preço, medição, pagamento, orçamento, BDI) → commercial-director;
//   - SSMA/ESG (segurança, meio ambiente, acidente) → esg-director;
//   - dois ou mais temas → multidisciplinar (curadoria multi-Expert existente, nunca um Expert
//     simulando várias áreas).
// A AXIA (assistente de ajuda) nunca é um destino deste roteamento.
//
// Puro, sem I/O e sem "server-only".

export type TopicExpertId =
  | "planning-director"
  | "engineering-director"
  | "legal-consultant"
  | "commercial-director"
  | "esg-director";

/** Cada padrão conta um acerto; ordem estável = ordem de detecção. */
export const EXPERT_TOPIC_PATTERNS: ReadonlyArray<readonly [RegExp, TopicExpertId]> = [
  [
    /\b(prazos?|atividades?|mpp|cronogramas?|curva s|histogramas?|marcos?|caminho cr[íi]tico|caminhos cr[íi]ticos|baseline|linha de base|replanejamento|cpm|folgas?|sequenciamento|recupera[çc][ãa]o de prazo|acelera[çc][ãa]o|planejamento 4d|4d)\b/i,
    "planning-director",
  ],
  [
    /\b(funda[çc][ãa]o|funda[çc][õo]es|estacas?|sondagens?|sondagem|geot[ée]cnic[oa]s?|geotecnia|recalques?|estrutura met[áa]lica|estruturas met[áa]licas|estrutural|estruturais|pr[ée]-?moldad[oa]s?|concreto armado|concreto protendido|protendid[oa]|piso industrial|pisos industriais|planicidade|telhas?|telhado|cobertura met[áa]lica|m[ée]todos? construtivos?|processos? construtivos?|sistemas? construtivos?|construtibilidade|engenharia de valor|compatibiliza[çc][ãa]o|interfer[êe]ncias? de projeto|solu[çc][ãa]o t[ée]cnica|solu[çc][õo]es t[ée]cnicas|alternativas? constru(tiva|tivas))\b/i,
    "engineering-director",
  ],
  [
    /\b(contrat(o|os|ual|uais)|cl[áa]usulas?|obriga[çc][õo]es|obriga[çc][ãa]o|multas?|responsabilidades?|notifica[çc][õo]es|notifica[çc][ãa]o|penalidades?|aditivos?|inadimpl\w*|pleitos?)\b/i,
    "legal-consultant",
  ],
  [
    /\b(custos?|receitas?|faturamentos?|medi[çc][õo]es|medi[çc][ãa]o|pagamentos?|financeir[oa]s?|margem|fluxo de caixa|reajustes?|boletim de medi[çc][ãa]o|or[çc]amentos?|or[çc]ament[áa]ri[oa]s?|bdi|pre[çc]os?|proposta comercial|comercial)\b/i,
    "commercial-director",
  ],
  [
    /\b(seguran[çc]a( do trabalho)?|meio ambiente|ambientais?|acidentes?|incidentes?|ssma|esg|epi|licen[çc]a ambiental|sustentabilidade)\b/i,
    "esg-director",
  ],
];

/** Temas detectados no texto (Experts distintos, na ordem de detecção). */
export function detectTopicExperts(text: string | null | undefined): TopicExpertId[] {
  const value = (text ?? "").toLowerCase();
  if (!value.trim()) return [];
  return Array.from(new Set(EXPERT_TOPIC_PATTERNS.filter(([pattern]) => pattern.test(value)).map(([, id]) => id)));
}

/**
 * Expert pela ÁREA cadastrada (área SLA do alerta ou área do colaborador na obra). Áreas sem
 * especialista dedicado (Administrativo, Diretoria, Compras) voltam null — nunca uma suposição.
 */
export function expertForArea(area: string | null | undefined): TopicExpertId | null {
  switch ((area ?? "").toUpperCase()) {
    case "PLANEJAMENTO":
      return "planning-director";
    case "ENGENHARIA":
      return "engineering-director";
    case "JURIDICO":
    case "JURÍDICO":
      return "legal-consultant";
    case "COMERCIAL":
    case "FINANCEIRO":
    case "ORCAMENTO":
    case "ORÇAMENTO":
      return "commercial-director";
    case "ESG_SSMA":
    case "SSMA/ESG":
    case "SSMA":
    case "ESG":
      return "esg-director";
    default:
      return null;
  }
}

export type SubjectRouting =
  | { kind: "SINGLE"; expertId: TopicExpertId; topics: TopicExpertId[]; reason: string }
  | { kind: "MULTI"; expertIds: TopicExpertId[]; topics: TopicExpertId[]; reason: string };

/**
 * Roteamento pelo ASSUNTO concreto (texto da pergunta + título/contexto do registro), nunca só pelo
 * nome do módulo. Um tema → um Expert; dois ou mais → multidisciplinar; nenhum → a área cadastrada,
 * quando houver; sem área → multidisciplinar (a curadoria decide quem consultar).
 */
export function routeBySubject(input: { question: string; subjectText?: string | null; area?: string | null }): SubjectRouting {
  const questionTopics = detectTopicExperts(input.question);
  // A pergunta do usuário prevalece; o texto do registro só desempata quando a pergunta não tem tema.
  const topics = questionTopics.length > 0 ? questionTopics : detectTopicExperts(input.subjectText);
  if (topics.length === 1) {
    return { kind: "SINGLE", expertId: topics[0], topics, reason: `Tema único identificado no assunto: ${topics[0]}.` };
  }
  if (topics.length > 1) {
    return { kind: "MULTI", expertIds: topics, topics, reason: `Mais de um tema relevante (${topics.join(", ")}) — curadoria multi-Expert.` };
  }
  const byArea = expertForArea(input.area);
  if (byArea) {
    return { kind: "SINGLE", expertId: byArea, topics: [], reason: `Sem tema no texto — Expert da área cadastrada (${input.area}).` };
  }
  return { kind: "MULTI", expertIds: [], topics: [], reason: "Sem tema nem área reconhecidos — curadoria multi-Expert decide quem consultar." };
}
