// Catálogo de ajuda do módulo "engenharia" — arquivo EXCLUSIVO do agente/módulo (não editar em outros módulos).
// Regras de conteúdo: ver lib/ui/help/types.ts. Ids novos: "modulo.tela.elemento".
//
// O ACC não tem tela de engenharia própria: a análise de engenharia vive no Diretor de Engenharia e Construção IA
// (rota /[projectId]/experts-ia/diretor-engenharia, inventariada no manifesto "experts"). Este arquivo guarda o PERFIL
// SIMULADO do especialista (id experts.engenharia.perfil, module "experts-ia"), descrito apenas pelo que o código define:
// lib/ai/expert-definitions/definitions.ts, lib/ai/experts/engineering-director/*, lib/ai/expert-knowledge/engineering.ts
// e lib/ai/expert-definitions/requested-skills.ts. Sem currículo, anos de experiência ou certificações.
import type { FeatureHelpDefinition } from "../types";
import {
  EXPERT_COMMON_HUMAN_REVIEW,
  EXPERT_COMMON_METHOD,
  EXPERT_COMMON_MISSING,
  EXPERT_COMMON_NOT_DO,
  EXPERT_COMMON_PERMISSIONS,
  EXPERT_COMMON_PROVIDER_NOTE,
  EXPERT_COMMON_REFRESH,
  EXPERT_COMMON_RISK_CRITERIA,
  EXPERT_SIMULATED_NOTICE,
} from "./experts";

export const ENGENHARIA_HELP: FeatureHelpDefinition[] = [
  {
    id: "experts.engenharia.perfil",
    kind: "expert",
    module: "experts-ia",
    version: "2026-11-20",
    title: "Diretor de Engenharia e Construção IA — perfil",
    shortDescription: "Especialista de apoio em solução técnica e construtibilidade. Perfil simulado; nunca dimensiona nem substitui o responsável técnico.",
    description:
      `Diretor de Engenharia e Construção IA (engineering-director, prompt v1): ampara decisões técnicas de engenharia e construção em obras logísticas, industriais e de saúde — solução técnica, construtibilidade, alternativas e consequência técnico-econômica — sem substituir projetista ou responsável técnico. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: comparar alternativas de fundação, estrutura, piso ou cobertura com premissas e riscos; avaliar construtibilidade e engenharia de valor; apontar interferências e pendências entre disciplinas numa revisão de projeto; tratar atraso, devolução ou má qualidade de fornecimento como possível não conformidade; ligar a questão técnica à consequência de qualidade, custo, prazo ou contrato que as fontes mostrem.",
    howToUse: [
      "Abra Experts IA › Diretor de Engenharia e Construção IA e digite a pergunta no campo do projeto.",
      "Quais alternativas de fundação ou estrutura são compatíveis com as sondagens registradas?",
      "A revisão de projeto recebida tem interferências entre disciplinas?",
      "Que soluções de engenharia de valor podem reduzir custo sem perder desempenho?",
      "Quais riscos de execução existem no piso industrial ou na cobertura?",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico da Engenharia: distingue FATO DOCUMENTADO, CONTEXTO DECLARADO, BASE CONTRATUAL, INFERÊNCIA TÉCNICA (em linguagem condicional) e RECOMENDAÇÃO; conhecimento técnico geral orienta o raciocínio, mas nunca é apresentado como fato, especificação, quantidade ou preço da obra. Quando há escolha a fazer, apresenta 2 ou 3 alternativas por sistema, comparadas em matriz (custo, prazo, desempenho, manutenção, flexibilidade futura, risco de execução e sustentabilidade), com premissas e estudos ainda necessários. Em nova revisão de projeto ou interferência, lista revisões comparadas, interferências e pendências documentadas e diferencia "sem indício nos dados disponíveis" de "sem impacto". Quando falta dado técnico necessário, declara "NÃO DISPONÍVEL — NECESSÁRIA DEFINIÇÃO HUMANA" em vez de estimar. Todo rascunho passa pela checagem de fidelidade (grounding) quando o provedor é real.`,
    uses: [
      "Competência: engenharia civil e industrial; fundações e geotecnia; estruturas de concreto, metálicas e pré-moldadas; pisos industriais e coberturas.",
      "Competência: métodos e processos construtivos; alternativas técnicas por sistema; construtibilidade; engenharia de valor.",
      "Competência: sistemas construtivos logísticos, industriais e hospitalares; compatibilização de projetos e interferências entre disciplinas.",
      "Competência: análise técnico-econômica de soluções e análise de não conformidades de compras e execução que afetem a qualidade técnica.",
      "Especialização declarada: obras logísticas, industriais e de saúde.",
      'Experiência técnica representada: o prompt incorpora um resumo técnico próprio do ACC (expert-knowledge/engineering.ts, versão 1) escrito a partir da skill "engenharia-industrial-logistica", com procedência registrada (nome, sha256 e data de leitura); o texto original da skill não está no repositório.',
    ],
    criteria: [
      "Conhecimento declarado no resumo técnico: implantação e terraplenagem; fundações e geotecnia (leitura de sondagens; ausência de sondagem é informação faltante, nunca premissa favorável); estruturas; pisos industriais; coberturas e fechamentos; instalações e sistemas (incêndio, energia, SPDA, climatização, utilidades); sistemas construtivos por tipologia; compatibilização; análise técnico-econômica.",
      "Conhecimento normativo: o código não carrega nenhuma norma técnica para a Engenharia; normas, instruções de bombeiros e preços só são citados com número e versão quando estiverem no contexto, caso contrário a referência é marcada como a confirmar pela versão vigente.",
      "Critério: toda conclusão técnica cita o documento, evento ou evidência que a sustenta; alternativas são comparadas com premissas explícitas; sem preço ou quantidade no contexto, o valor é informação ausente.",
      "Critério: no máximo ordem de grandeza marcada como pré-dimensionamento, com a observação de que o projeto deve ser elaborado e assinado por profissional habilitado (ART/RRT).",
      EXPERT_COMMON_RISK_CRITERIA,
    ],
    data: [
      "Disponível: metadados do projeto, até os 50 eventos mais recentes com categorias e resumo das obrigações ESG/SSMA (consulta de projeto), ou o evento com evidências (rótulo e localizador), cláusulas relacionadas, e-mails (assunto, trecho, metadados de anexos) e anotações declaradas (consulta de evento).",
      "Não disponível: conteúdo dos arquivos de projeto e dos anexos de e-mail, orçamento e custos estruturados, cronograma (que é do Diretor de Planejamento IA), Construmanager e Diário de Obra (fontes futuras) e Change Orders (existem como tabela, mas ainda não chegam ao contexto de nenhum especialista).",
    ],
    source:
      "Contexto da obra montado por lib/ai/context (build-project-context.ts e build-event-context.ts) e resumo técnico versionado em lib/ai/expert-knowledge/engineering.ts.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Preço, quantidade, especificação e norma ausentes do contexto são declarados como informação ausente, nunca estimados.`,
    result:
      "Entregáveis (tipos de saída): análise, recomendação, avaliação de risco, sugestão de ação, rascunho de e-mail e análise de lacunas documentais, sempre pendentes de revisão.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não emite dimensionamento, cálculo estrutural ou especificação definitiva e não substitui ART/RRT.",
      "Não altera projeto, fornecedor, matriz de escalonamento, prazos de SLA nem responsáveis.",
    ],
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: [
      "Não substitui projetistas nem responsáveis técnicos (ART/RRT); nunca apresenta dimensionamento ou cálculo definitivo.",
      "Não analisa cronograma, caminho crítico ou recuperação de prazo: encaminha ao Diretor de Planejamento IA e trata o efeito em prazo só como inferência.",
      "Nunca inventa preço, quantidade, especificação ou norma ausente do contexto.",
      "Em acidentes, risco à vida ou dúvida normativa, encaminha ao especialista humano competente.",
      "Consulta conversacional apenas (escopos projeto e evento); sem avaliação formal persistida dedicada nesta fase.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: `${EXPERT_COMMON_HUMAN_REVIEW} Decisão que depende de projeto, cálculo ou laudo de profissional habilitado exige a declaração DECISÃO HUMANA NECESSÁRIA.`,
  },
];
