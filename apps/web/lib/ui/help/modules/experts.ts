// Catálogo de ajuda do módulo "experts" (Experts IA) — arquivo EXCLUSIVO do agente/módulo (não editar em outros módulos).
// Regras de conteúdo: ver lib/ui/help/types.ts. Ids novos: "modulo.tela.elemento".
//
// PERFIS DOS ESPECIALISTAS (kind "expert"): cada perfil descreve o que o CÓDIGO do ACC define para o especialista
// (apps/web/lib/ai/expert-definitions/definitions.ts, apps/web/lib/ai/experts/<expert>/identity.ts e query.ts,
// apps/web/lib/ai/expert-knowledge/*, apps/web/lib/ai/expert-definitions/requested-skills.ts). Nada aqui é currículo:
// o perfil é SIMULADO (papel de apoio assumido pela IA), sem anos de experiência, certificações, instituições ou
// acesso a bases que o código não declare. O teste scripts/test-help-experts-profiles.mjs trava isso.
import type { FeatureHelpDefinition } from "../types";

const VERSION = "2026-11-20";
const MODULE = "experts-ia";

/** Ids dos perfis por especialista oficial (usado pelas telas para exibir o perfil a partir do catálogo). */
export const EXPERT_PROFILE_HELP_ID = {
  "planning-director": "experts.planejamento.perfil",
  "legal-consultant": "experts.juridico.perfil",
  "esg-director": "experts.ssma-esg.perfil",
  "engineering-director": "experts.engenharia.perfil",
  "commercial-director": "experts.comercial.perfil",
  "quality-analyst": "experts.qualidade.perfil",
  ceo: "experts.gestao-executiva.perfil",
} as const;

// ---- blocos comuns (texto único, reutilizado pelos sete perfis; nunca reescrito por perfil) ----

export const EXPERT_SIMULATED_NOTICE =
  "Perfil profissional SIMULADO: descreve o papel de apoio que a IA assume nas análises, conforme definido no código do ACC. Não é uma pessoa, não representa um profissional real e não substitui projetista, responsável técnico, Jurídico ou decisão da Diretoria.";

export const EXPERT_COMMON_METHOD =
  "Toda resposta segue o Framework Comum dos Especialistas AXION (versão 1): FATO → FONTE → EVIDÊNCIA → REQUISITO/CLÁUSULA → ANÁLISE → RISCO → ALTERNATIVAS → RECOMENDAÇÃO → DECISÃO HUMANA. A resposta estruturada separa fatos documentados, contexto interno declarado (anotação de usuário, nunca fato confirmado), base contratual, base legal, interpretação (inferência, em linguagem condicional) e recomendações, mais riscos e informações faltantes. A saída é validada por regra determinística antes de ser exibida e exige revisão humana.";

export const EXPERT_COMMON_PERMISSIONS =
  "Exige vínculo ativo com a obra (verificado no servidor e no banco). Limites de uso implementados: 20 consultas por usuário por dia (somando todas as obras) e 100 por obra por dia, no dia civil de America/Sao_Paulo; cada chamada a um especialista consome 1 unidade, reservada antes da chamada ao provedor de IA, e atingido o limite a consulta é recusada sem chamar a IA. São valores operacionais atuais, não uma política aprovada pela Diretoria. Cada consulta é auditada (quem, obra, especialista, pergunta, identificadores das fontes enviadas, resumo do resultado e tokens quando o provedor informa) e o contexto é isolado por projeto: só dados da obra consultada são enviados.";

export const EXPERT_COMMON_NOT_DO: string[] = [
  "Nunca executa ações: não envia e-mail, não aprova nem encerra alerta, não altera responsável, prazo de SLA, escalonamento, contrato ou status.",
  "Nunca altera nem apaga evidências e documentos originais: a consulta é somente leitura sobre o contexto da obra.",
  "Todo rascunho de comunicação sai com status DRAFT_PENDING_REVIEW; nada é enviado sem decisão humana.",
  "Não aprova a própria recomendação nem assume compromisso em nome da AXION.",
];

export const EXPERT_COMMON_RISK_CRITERIA =
  "Critério: o grau de risco sugerido usa só a definição AXION: CRÍTICO = risco iminente de descumprimento e penalização contratual, exigindo ação imediata; ALTO = risco iminente, com tempo para mitigação; MÉDIO = possível consequência a médio prazo; BAIXO = risco processual de acompanhamento. Não existe número fixo de dias entre os níveis e penalização só é afirmada com a cláusula que a prevê.";

export const EXPERT_COMMON_HUMAN_REVIEW =
  "Revisão humana obrigatória em toda resposta (requiresHumanReview é sempre verdadeiro). Exigem decisão humana explícita: informação insuficiente, conflito entre documentos ou fontes, valor econômico ausente, decisão que gere obrigação para a AXION, concessão comercial, envio de qualquer comunicação, interpretação jurídica crítica, risco ALTO ou CRÍTICO e ação já escalada à Diretoria.";

export const EXPERT_COMMON_MISSING =
  "Dado ausente nunca é preenchido nem tratado como zero: a resposta declara a informação como ausente (campo de informações faltantes) e pede a definição humana.";

export const EXPERT_COMMON_REFRESH =
  "O contexto é montado no momento de cada consulta, a partir dos dados atuais da obra; não há cópia armazenada do contexto nem histórico de conversa entre consultas.";

export const EXPERT_COMMON_PROVIDER_NOTE =
  "O provedor de IA é escolhido por especialista no servidor; quando o provedor é o determinístico (fake), o painel avisa que a resposta não é IA real.";

export const EXPERTS_HELP: FeatureHelpDefinition[] = [
  // ====================================================================================================
  // PERFIS DOS ESPECIALISTAS (kind "expert") — o de Engenharia fica em modules/engenharia.ts
  // ====================================================================================================
  {
    id: "experts.planejamento.perfil",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Diretor de Planejamento IA — perfil",
    shortDescription: "Especialista de apoio em cronograma, caminho crítico e prazo. Perfil simulado; sem MPP estruturado não conclui atraso.",
    description:
      `Diretor de Planejamento IA (planning-director, prompt v6): apoia decisões de planejamento e prazo em obras logísticas, industriais e de saúde — cronograma, linha de base, caminho crítico, folgas, desvios, recuperação e consequência contratual do prazo. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: entender a data final prevista e o caminho crítico; localizar atividades com menor folga; avaliar se um atraso afeta marco contratual, multa ou custo; comparar alternativas de recuperação ou aceleração de prazo; correlacionar um evento do Event Ledger com atividades do cronograma; separar indício de impacto em cronograma e em preço numa nova versão de projeto.",
    howToUse: [
      "Abra Experts IA › Diretor de Planejamento IA e digite a pergunta no campo do projeto.",
      "Qual é a data final prevista da obra e quais atividades estão no caminho crítico?",
      "Quais atividades têm menor folga e maior risco de atraso?",
      "Quais relações entre atividades podem comprometer o prazo final?",
      "Que alternativas de recuperação de prazo o cronograma permite?",
      "Este atraso pode gerar penalidade? (a resposta só cita multa quando houver cláusula no contexto)",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico do Planejamento: só aprofunda atraso ou aceleração quando há consequência econômica ou contratual identificável nas fontes (PRAZO → IMPACTO ECONÔMICO/CONTRATUAL → RECOMENDAÇÃO) e toda correlação evento–cronograma cita a atividade ou o evento de origem. Para avaliação formal de prazo exige o arquivo Microsoft Project (.mpp) lido de forma estruturada: sem ele a análise formal é declarada indisponível e a consulta é recusada com mensagem própria, sem consumir unidade do limite. Para nova versão de projeto recebida do Construmanager responde, separadamente, se há indício documentado de impacto no cronograma e no preço, distinguindo "sem indício nos dados disponíveis" de "sem impacto".`,
    uses: [
      "Competência: analisar cronogramas e linhas de base (baseline x atual), CPM, caminho crítico e folgas.",
      "Competência: ler curva S e histogramas de recursos; avaliar produtividade e recursos como premissas de duração.",
      "Competência: analisar sequenciamento, frentes de serviço, acompanhamento físico e atrasos com suas atividades afetadas.",
      "Competência: propor alternativas de recuperação ou aceleração de prazo e considerar planejamento 4D quando o modelo estiver no contexto.",
      "Competência: identificar impacto potencial no prazo contratual, risco de multa por atraso, custo adicional e possível ganho comercial de aceleração.",
      "Especialização declarada: obras logísticas, industriais e de saúde.",
      'Experiência técnica representada: o prompt incorpora um resumo técnico próprio do ACC (expert-knowledge/planning.ts, versão 1) escrito a partir da skill "planejamento-obras-log-ind-saude", com procedência registrada; o texto original da skill não está no repositório.',
    ],
    criteria: [
      "Conhecimento declarado: técnica de cronograma (linha de base, CPM, caminho crítico e quase-crítico, folga total e livre, curva S, histogramas), recuperação e aceleração, suprimentos de longo prazo e trilha de aprovações e licenças.",
      "Conhecimento normativo: o código não carrega nenhuma norma ou prazo de órgão para o Planejamento; prazos de órgãos, fornecedores e normas só são afirmados quando estiverem no contexto, caso contrário viram informação a confirmar.",
      EXPERT_COMMON_RISK_CRITERIA,
      "Critério: nunca calcula datas, folgas ou caminho crítico sem os dados estruturados do cronograma no contexto e nunca inventa impacto sem correlação real com evento ou atividade.",
    ],
    data: [
      "Disponível: cronograma estruturado do arquivo .mpp extraído (atividades, datas de linha de base e planejadas, duração, folga total, percentual concluído, marcos, atividades críticas, relações de precedência).",
      "Disponível: metadados do projeto, até os 50 eventos mais recentes com categorias (consulta de projeto) ou o evento com evidências, cláusulas relacionadas, e-mails (assunto e trecho) e anotações declaradas (consulta de evento).",
      "Não disponível: PDF, XLSX, DOCX, imagens e relatórios não substituem o .mpp (são só evidência complementar); orçamento, custos e Diário de Obra não são carregados.",
    ],
    source:
      "Cronograma extraído do .mpp do projeto e contexto da obra (projeto, Event Ledger, cláusulas, e-mails) montados em lib/ai/context e lib/ai/experts/planning-director/schedule-context.ts.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Sem .mpp estruturado, atraso, caminho crítico, folga, desvio, recuperação e projeção de término não são concluídos.`,
    result:
      "Entregáveis (tipos de saída): análise, recomendação, avaliação de risco, sugestão de ação e análise de cronologia (timeline). Não produz rascunhos de comunicação.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não altera o cronograma, a linha de base nem o prazo contratual: a resposta é só leitura e recomendação.",
    ],
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: [
      "Não substitui projetistas, responsáveis técnicos, SSMA, orçamento, Jurídico ou decisão da Diretoria.",
      "Não analisa solução técnica de engenharia (fundações, estruturas, pisos, coberturas, métodos construtivos, compatibilização): encaminha ao Diretor de Engenharia e Construção IA.",
      "Não implementa Lean Construction, Last Planner System, PPC, Pull Planning ou Lookahead e não faz gestão operacional de produção.",
      "Se não houver consequência econômica ou contratual identificável, não aprofunda a análise.",
      "Consulta conversacional apenas (escopos projeto e evento); não há avaliação formal persistida dedicada nesta fase.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },
  {
    id: "experts.juridico.perfil",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Consultor Jurídico IA — perfil",
    shortDescription: "Especialista de apoio em contratos, cláusulas e cronologia factual. Perfil simulado; sem base legal carregada.",
    description:
      `Consultor Jurídico IA (legal-consultant, prompt v7): realiza análise jurídica aprofundada de contratos, fatos, comunicações e evidências dos projetos da AXION. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: interpretar contrato e aditivos; reconstruir a cronologia factual de um caso; identificar direitos, obrigações e possíveis descumprimentos; localizar lacunas documentais e contradições entre documentos; indicar quais documentos sustentam uma tese; preparar minutas de carta, notificação e resposta a notificação (sempre rascunho).",
    howToUse: [
      "Na análise jurídica pré-contratual (Jurídico IA, somente administrador) ou numa consulta de evento/alerta, digite a pergunta.",
      "Quais documentos sustentam nossa posição sobre este evento?",
      "Que cláusulas do contrato tratam de prazo, multa e notificação neste fato?",
      "Há contradição entre o aditivo e o contrato-base sobre esta questão?",
      "Que lacunas documentais existem para sustentar este pleito?",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico do Jurídico: distingue FATO DOCUMENTADO, CONTEXTO DECLARADO, BASE CONTRATUAL, BASE LEGAL, INTERPRETAÇÃO DA IA e RECOMENDAÇÃO, e classifica exigências como legal, contratual, prática negocial ou recomendação da IA. Aplica uma hierarquia padrão de precedência entre documentos (aditivo aprovado, contrato assinado, anexos formalmente incorporados, edital/RFP, documentos informativos), mas a cláusula de precedência do próprio contrato sempre prevalece e cada conclusão cita documento, versão, cláusula, vínculo e regra aplicada. Todo rascunho passa por uma checagem determinística de fidelidade (grounding) quando o provedor é real; trecho sem suporte é substituído por marcação de confirmação humana.`,
    uses: [
      "Competência: interpretar contrato e aditivos; reconstruir cronologia factual; identificar direitos, obrigações e inadimplementos.",
      "Competência: identificar lacunas documentais e contradições entre documentos; diferenciar fato, interpretação e alegação.",
      "Competência: avaliar posição favorável ou desfavorável à AXION e risco jurídico; preparar estratégia jurídica não vinculante.",
      "Competência: sugerir notificação e resposta a notificação; apoiar litígio, arbitragem e perícia; identificar documentos que sustentam uma tese.",
      "Competência: SEGUROS, GARANTIAS, ENDOSSOS E SINISTROS — Performance Bond, adiantamento, retenção, pós-entrega, riscos de engenharia, RC Geral, Cruzada e Profissional, máquinas e equipamentos, fiança bancária, cauções, endossos e o trâmite de aviso, reclamação, regulação e indenização; distingue garantia legal, garantia contratual, seguro-garantia, RC e fiança.",
      "Saída da competência de seguros: documento de origem, versão e data, cláusula, fatos conhecidos, hipóteses, dados faltantes, limitações e próxima providência; conclusão de cobertura somente como POTENCIALMENTE COBERTO, POTENCIALMENTE NÃO COBERTO, COBERTURA CONDICIONADA ou INFORMAÇÕES INSUFICIENTES, derivada de 16 itens de verificação. Na consulta de cobertura de garantia pós-entrega apresenta outros 16 itens, em ordem fixa: natureza do produto ou serviço, tipo do defeito, datas de entrega, descoberta e comunicação, documentos analisados, garantia contratual, garantia legal potencial, vício oculto, prazos de reclamação, decadencial e prescricional, responsabilidade potencial, manutenção e evidências, fundamentação e providência recomendada; os fatos e datas são montados pela Qualidade e a conclusão é do Jurídico.",
      "Especialização declarada: contratos e evidências de obras da AXION; comparação de cláusulas da minuta pré-contratual com sugestões de modificar, excluir ou adicionar.",
      'Experiência técnica representada: nenhuma além da definição acima; a skill "/juridico-contratos-construcao" está apenas associada (pendente de integração) e seu conteúdo NÃO chega ao prompt.',
    ],
    criteria: [
      "Conhecimento normativo: nenhum. O corpus de fontes legais oficiais não está ingerido; o Consultor nunca cita artigo de lei, norma ou jurisprudência de memória e a base legal fica vazia. A skill associada cita, em seu propósito declarado, temas como Lei 14.133, FIDIC, EPC e reequilíbrio, mas está pendente de integração e esse conteúdo não é carregado.",
      "Critério: toda afirmação de base contratual cita a cláusula ou o documento de origem; sem cláusula, não afirma penalidade nem obrigação.",
      "Critério (seguros e garantias): nunca reconhece cobertura em nome da seguradora; a expiração do prazo de garantia contratual não exclui a cobertura nem a responsabilidade legal por si só; não aplica um prazo único e universal a todo defeito e distingue solidez e segurança, vício aparente, vício oculto, decadência, prescrição e indenização; nunca inventa canal de atendimento; prepara apenas minutas.",
      "Referências de seguros e garantias: um índice versionado de FONTES a conferir (Lei 15.040/2024 e sua vigência, Código Civil art. 618, CDC, SUSEP/CNSP, Circular SUSEP 662/2022, contratação pública, ABNT NBR 17170:2022, NBR 15575, NBR 5674, NBR 14037 e o Manual do Proprietário do Secovi-SP e SindusCon-SP, referência histórica de edificação habitacional). Não é texto de lei; links de terceiros são fonte secundária e exigem conferência em texto oficial.",
      'Critério: interpretação é apresentada em linguagem condicional ("pode configurar", "sugere") e nunca como fato.',
      EXPERT_COMMON_RISK_CRITERIA,
    ],
    data: [
      "Disponível (consulta pré-contratual): texto extraído dos documentos contratuais legíveis (PDF, DOCX, TXT) com cobertura declarada; se parte do texto não coube no limite de contexto, o painel avisa conteúdo parcial; documento ilegível é informado e sem nenhum documento legível a consulta é recusada sem chamar a IA.",
      "Disponível (consulta de evento/alerta): evento, evidências (rótulo e localizador), cláusulas relacionadas e candidatas de confronto, e-mails (assunto, trecho, remetente, destinatário, metadados de anexos) e anotações declaradas do evento.",
      "Não disponível: apólices, garantias e sinistros como entidades estruturadas (fonte futura: hoje só como documento ou e-mail); base legal oficial; atas de reunião, Diário de Obra, Construmanager, relatórios semanais e notificações formais como entidades próprias (fontes futuras).",
    ],
    source:
      "Documentos, cláusulas, e-mails, evidências e eventos da obra montados por lib/ai/context (build-project-context.ts e build-event-context.ts); nenhuma fonte legal externa.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Quando a análise exigiria citar norma, declara que a base legal oficial não está disponível.`,
    result:
      "Entregáveis (tipos de saída): análise, recomendação, avaliação de risco, rascunho de carta, rascunho de notificação, análise de lacunas documentais e análise de cronologia. Na minuta pré-contratual, comparação de cláusulas com fundamento e risco mitigado de cada sugestão.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não substitui parecer de advogado: a decisão jurídica final é humana.",
    ],
    permissions: `${EXPERT_COMMON_PERMISSIONS} A consulta direta do Jurídico IA (espaço pré-contratual) é restrita a administrador ativo.`,
    limitations: [
      "Nunca inventa artigo de lei, citação legal ou base normativa; enquanto o corpus legal oficial não estiver carregado, declara essa limitação.",
      "A consulta jurídica direta só funciona em espaço pré-contratual e com texto de documento legível; no espaço de obra a análise ocorre por evento ou alerta.",
      "Consulta conversacional apenas; sem avaliação formal persistida dedicada nesta fase.",
      "Documentos acima do limite de contexto são cortados e o corte é declarado; confirme as cláusulas nos arquivos originais.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },
  {
    id: "experts.ssma-esg.perfil",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Diretor de ESG IA (SSMA/ESG) — perfil",
    shortDescription: "Especialista de apoio em obrigações ESG/SSMA contratuais. Perfil simulado; o risco é calculado por regra, não pela IA.",
    description:
      `Diretor de ESG IA (esg-director, prompt v4), que atende SSMA/ESG: gerencia e analisa exclusivamente obrigações ESG/SSMA de origem contratual cujo descumprimento possa gerar consequência econômica ou contratual para a AXION. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: saber quais obrigações ESG/SSMA contratuais estão sem comprovação ou vencendo; que evidência falta; se há risco de multa, penalidade, retenção ou paralisação; como regularizar ou cobrar a pendência; como tratar a comunicação de um registro de acidente (campos obrigatórios e ciência da cadeia de Engenharia).",
    howToUse: [
      "Abra ESG/SSMA › Consultar e digite a pergunta sobre o projeto.",
      "Quais obrigações estão sem comprovação?",
      "Que obrigações ESG/SSMA têm prazo próximo e qual a penalidade prevista?",
      "Que evidência falta para comprovar esta obrigação?",
      "Há risco de multa ou paralisação por alguma pendência?",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico do ESG: o grau de risco (LOW/MEDIUM/HIGH/CRITICAL) de cada obrigação é calculado antes, por regra determinística (lib/esg/compute-obligation-risk.ts), e a IA apenas complementa a interpretação, sem substituir esse cálculo. Cada obrigação analisada cita sua origem contratual (documento e cláusula). Em registro de acidente, confere antes os campos estruturados (com ou sem afastamento, nome do funcionário, data e hora, causa informada, foto do local e foto da remoção) e declara dado faltante; recomenda ciência imediata à cadeia de Engenharia e, havendo afastamento, ao gerente e ao Diretor Comercial, sem diagnosticar nem inventar causa ou gravidade.`,
    uses: [
      "Competência: identificar obrigação ESG/SSMA, seu prazo e a evidência exigida; verificar comprovação (fotos, documentos, DDS).",
      "Competência: identificar pendência ou vencimento e risco de multa, penalidade, retenção ou paralisação.",
      "Competência: sugerir regularização ou cobrança de pendência e preparar minuta de e-mail ou documento de cobrança.",
      "Especialização declarada: somente obrigações ESG/SSMA com origem contratual explícita.",
      'Experiência técnica representada: nenhuma além da definição acima; a skill "/ssma-esg-construcao" está apenas associada (pendente de integração) e seu conteúdo NÃO chega ao prompt.',
    ],
    criteria: [
      "Conhecimento normativo: nenhum carregado. A skill associada cita, em seu propósito declarado, segurança NR-18, NR-35 e PGR, resíduos e licenciamento, mas está pendente de integração; o Diretor de ESG não cita norma a partir de memória.",
      "Critério: só analisa obrigação com origem contratual (contrato, aditivos, anexos, edital, RFP, requisitos do cliente incorporados); ESG corporativo genérico e gestão operacional de segurança do trabalho estão fora do escopo.",
      "Critério: prioriza obrigações cujo descumprimento gere multa, penalidade, retenção, suspensão, paralisação, atraso ou custo adicional; sem consequência contratual relevante, não precisa gerar alerta.",
      EXPERT_COMMON_RISK_CRITERIA,
    ],
    data: [
      "Disponível: até 100 obrigações ESG/SSMA ativas do projeto, com título, categoria, periodicidade, descrição da evidência exigida, descrição da penalidade, status, prazo e risco da submissão mais recente e contagem de evidências.",
      "Disponível: metadados do projeto, eventos recentes do Event Ledger e, na consulta de evento, evidências, cláusulas e e-mails relacionados.",
      "Não disponível: histórico completo de cada obrigação (só o registro mais recente), conteúdo dos arquivos de evidência (só a contagem) e normas técnicas.",
    ],
    source:
      "Obrigações e comprovações ESG/SSMA do projeto (tabelas esg_obligations e submissões), Event Ledger e documentos montados por lib/ai/context/build-project-context.ts.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Em acidente, campo estruturado ausente é indicado como dado faltante, nunca preenchido.`,
    result:
      "Entregáveis (tipos de saída): análise, recomendação, avaliação de risco, sugestão de ação e rascunho de e-mail (interno, ao cliente, cobrança de pendência, comunicação preventiva), sempre pendente de revisão.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não altera status de obrigação nem de comprovação e não declara obrigação cumprida sem validação humana.",
      "Não diagnostica acidente nem substitui investigação, responsável de SSMA ou atendimento médico.",
    ],
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: [
      "Não é um sistema de ESG corporativo amplo e não faz gestão operacional completa de SSMA.",
      "Só analisa obrigações com origem contratual explícita.",
      "O risco é sempre o valor determinístico já calculado; a IA nunca o substitui.",
      "Não enxerga o conteúdo dos arquivos de evidência, apenas a quantidade enviada.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },
  {
    id: "experts.comercial.perfil",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Diretor Comercial IA — perfil",
    shortDescription: "Especialista de apoio em negociação, aditivos e pleitos. Perfil simulado; não inventa preço, margem nem desconto.",
    description:
      `Diretor Comercial IA (commercial-director, prompt v5): apoia decisões e negociações comerciais ligadas aos contratos e projetos da AXION — propostas, adicionais, pleitos, aditivos, preço, prazo, medição, retenção, reajuste, multas, garantias e formas de pagamento — em integração permanente com Orçamentos. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: definir estratégia e momento de uma negociação ou de um aditivo; mapear concessões possíveis e contrapartidas; antecipar objeções do cliente e respostas; preparar reuniões e roteiro; avaliar impactos financeiros, contratuais e de prazo; apontar que dados de Orçamentos faltam para avaliar uma proposta.",
    howToUse: [
      "Abra o Dashboard ou o evento no Event Ledger e use o painel do Diretor Comercial IA para perguntar sobre o projeto ou sobre o evento.",
      "Qual estratégia recomenda para este aditivo?",
      "Que concessões e contrapartidas são possíveis nesta alteração de escopo?",
      "Que objeções o cliente provavelmente levantará e como responder?",
      "Que dados de Orçamentos faltam para avaliar esta proposta?",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico do Comercial: cada afirmação é classificada como FATO (sempre com fonte), HIPÓTESE, CENÁRIO, RISCO ou RECOMENDAÇÃO e todo número (R$, %, dias) cita o item de origem do contexto comercial (identificador COM-n). Avalia a maturidade técnica, comercial e contratual e, sem base econômica de Orçamentos, o movimento recomendado sobre preço é aguardar dados. Regras validadas automaticamente: nunca autorizar desconto, assumir obrigação ou concluir contrato, nem em minuta.`,
    uses: [
      "Competência: analisar estratégia de negociação, posição da AXION e da contraparte, objetivos, cenários e prioridades.",
      "Competência: analisar propostas, contrapropostas, Change Orders e aditivos (escopo, preço, medição, pagamento, retenção, reajuste, multas e garantias).",
      "Competência: avaliar impactos financeiros e comerciais; preparar reuniões e antecipar objeções com respostas.",
      "Competência: redigir e-mails, cartas, propostas e minutas comerciais, sempre como rascunho.",
      "Especialização declarada: dinâmica comercial de obras; modos de saída estruturada (diagnóstico da negociação, estratégia, momento e abordagem, cenários de concessão, impactos, objeções, roteiro de reuniões, minuta, condições de fechamento e decisões que exigem aprovação humana).",
      'Experiência técnica representada: nenhuma além da definição acima; a skill "/comercial-construcao" está apenas associada (pendente de integração) e seu conteúdo NÃO chega ao prompt.',
    ],
    criteria: [
      "Conhecimento normativo: nenhum carregado. A skill associada cita, em seu propósito declarado, editais, SINAPI, SICRO, BDI e orçamentos, mas está pendente de integração; preços e índices só são usados se estiverem no contexto da obra.",
      "Critério: toda posição comercial cita a evidência ou cláusula que a sustenta; interpretação comercial nunca é apresentada como fato.",
      'Critério: aceitabilidade econômica de uma concessão só é "sustentada pelos dados" com base econômica DISPONÍVEL e fontes; caso contrário exige análise de Orçamentos.',
      EXPERT_COMMON_RISK_CRITERIA,
    ],
    data: [
      "Disponível: contexto comercial × orçamentário lido com a sessão do usuário (cada item com tabela, registro e campo de origem; dados financeiros do relatório semanal só quando o usuário tem acesso ao dashboard financeiro).",
      "Disponível: metadados do projeto, eventos recentes e, na consulta de evento, evidências, cláusulas, e-mails e anotações declaradas.",
      "Não disponível: custos, BDI, margem, contingências, premissas e produtividade de forma estruturada (marcados como dado não disponível no ACC); limites de negociação e descontos autorizados não existem no sistema.",
    ],
    source:
      "Contexto comercial (lib/commercial/load-commercial-context.ts, somente leitura, sem service role) e contexto do projeto ou evento montado por lib/ai/context.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Dado comercial ausente aparece como "NÃO DISPONÍVEL — NECESSÁRIA DEFINIÇÃO HUMANA", "sem registro na obra" ou "sem autorização", e a análise de Orçamentos é solicitada explicitamente.`,
    result:
      "Entregáveis (tipos de saída): análise, recomendação, avaliação de risco e rascunhos de e-mail, proposta, contraproposta e carta, sempre pendentes de revisão.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não concede desconto, não fixa preço nem condição comercial e não conclui contrato.",
    ],
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: [
      "Nunca inventa margem, desconto autorizado, limite de negociação, preço ou condição comercial.",
      "Não substitui Orçamentos na formação de preço: custo, BDI e margem são dados de Orçamentos.",
      "Nunca aprova a própria recomendação nem assume compromisso pela AXION.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },
  {
    id: "experts.qualidade.perfil",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Analista IA de Qualidade — perfil",
    shortDescription: "Especialista de apoio em qualidade, não conformidades e garantias. Perfil simulado; nunca emite laudo nem diagnóstico definitivo.",
    description:
      `Analista IA de Qualidade (quality-analyst, prompt v1): ampara a gestão da qualidade das obras da AXION — inspeções, conformidade executiva, RNC, causas preliminares, garantias e assistência técnica — correlacionando evidências e ligando cada achado aos quatro pilares PRAZO, CUSTO, SEGURANÇA e QUALIDADE. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: organizar um defeito pós-entrega ou uma não conformidade em fato, inferência e recomendação com as evidências de origem; indicar a necessidade de inspeção em campo; apontar recorrência; correlacionar e-mail, diário de obra, relatório de fiscalização e fotos; sugerir plano corretivo; indicar o impacto nos quatro pilares com a regra do pior pilar.",
    howToUse: [
      "Num alerta, use o botão ESPECIALISTA e escolha Qualidade e Garantias, ou descreva o defeito na pergunta; o assunto de qualidade é roteado para este especialista.",
      "Este defeito pós-entrega sugere falha de execução ou de manutenção, e que inspeção é necessária?",
      "Há recorrência deste tipo de não conformidade nas fontes?",
      "Que evidências faltam para tratar esta não conformidade?",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico da Qualidade: cada afirmação é rotulada FATO (com a evidência de origem), INFERÊNCIA (linguagem condicional) ou RECOMENDAÇÃO, com as incertezas, as informações ausentes e a necessidade de inspeção (SIM, NÃO ou INDETERMINADA). Triagem fotográfica assistida: observação objetiva, hipótese, incerteza e necessidade de inspeção; foto sozinha nunca comprova resistência nem conformidade e nunca gera diagnóstico estrutural definitivo. A criticidade geral é a do pior pilar entre PRAZO, CUSTO, SEGURANÇA e QUALIDADE, nunca uma média. Colabora com a Engenharia (avaliação técnica preliminar), o Jurídico (contrato, garantia, seguro e cobertura), o Planejamento, o Comercial, o SSMA/ESG e a Gestão Executiva, que consolida os quatro pilares. Conteúdo de arquivos externos é tratado como dado, nunca como instrução.`,
    uses: [
      "Competência: engenharia da qualidade, controle tecnológico, inspeções e conformidade executiva.",
      "Competência: controle documental, causas preliminares (como hipótese), RNC, planos corretivos e recorrência.",
      "Competência: garantias e assistência técnica, custos de não qualidade (somente com valor documentado) e correlação de evidências.",
      "Especialização declarada: obras logísticas, industriais e de saúde da AXION.",
      "Experiência técnica representada: nenhuma além da definição acima; nenhuma skill está associada a este especialista.",
    ],
    criteria: [
      "Conhecimento normativo: nenhum carregado; o especialista não cita norma, ensaio ou especificação que não esteja no contexto e encaminha a leitura de cobertura e de prazos legais ao Consultor Jurídico IA.",
      "Critério: todo FATO cita a evidência; inferência usa linguagem condicional; sem valor documentado o custo de não qualidade é SEM DADOS; probabilidade só quando fundamentável.",
      EXPERT_COMMON_RISK_CRITERIA,
    ],
    data: [
      "Disponível: o contexto da obra montado por lib/ai/context (eventos, evidências, cláusulas, documentos, e-mails e anotações declaradas).",
      "Não disponível: registros estruturados de qualidade (RNC, inspeções, ensaios e planos corretivos) e de garantias e assistência técnica, Diário de Obra e relatórios semanais como entidades próprias (fontes futuras).",
    ],
    source:
      "Contexto da obra montado por lib/ai/context (build-project-context.ts e build-event-context.ts); definição e contrato de saída em lib/ai/experts/quality-analyst.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Resultado de ensaio, valor de reparo e prazo de garantia ausentes das fontes são declarados como SEM DADOS, nunca estimados.`,
    result:
      "Entregáveis (tipos de saída): análise, recomendação, avaliação de risco, sugestão de ação, rascunho de e-mail e análise de lacunas documentais, sempre pendentes de revisão.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não emite laudo, não atesta conformidade, não aprova serviço ou medição e não encerra nem reabre RNC.",
      "Não substitui o responsável técnico habilitado (ART/RRT) nem o Jurídico.",
    ],
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: [
      "Foto sozinha nunca comprova resistência nem conformidade; não há diagnóstico estrutural definitivo.",
      "Não conclui sobre cobertura de seguro ou garantia, direito, penalidade ou prazo legal.",
      "Nesta fase o especialista consulta o contexto genérico da obra; os registros estruturados de qualidade ainda não chegam ao contexto.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },
  {
    id: "experts.gestao-executiva.perfil",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "CEO IA (Gestão Executiva) — perfil",
    shortDescription: "Camada executiva que consolida os demais especialistas. Perfil simulado; nunca decide nem substitui uma análise.",
    description:
      `CEO IA (ceo, prompt v5) — Gestão Executiva e multi-especialista: camada integradora sobre o Diretor Comercial IA, o Consultor Jurídico IA, o Diretor de Planejamento IA, o Diretor de Engenharia e Construção IA, o Analista IA de Qualidade e o Diretor de ESG IA. Consolida, compara e prioriza; consolida os quatro pilares PRAZO, CUSTO, SEGURANÇA e QUALIDADE com a regra do pior pilar (nunca média simples); nunca substitui uma análise especializada nem executa decisão. ${EXPERT_SIMULATED_NOTICE}`,
    purpose:
      "Problemas que pode ajudar a resolver: ver numa só resposta a situação de um assunto que cruza áreas (comercial, jurídico, prazo, engenharia, ESG/SSMA); identificar divergências entre especialistas; priorizar riscos ALTO e CRÍTICO; listar as decisões humanas pendentes; comparar alternativas executivas; apontar a informação que falta para decidir.",
    howToUse: [
      'Use a curadoria multi-especialista (Event Ledger, adicionais, análise pré-contratual) ou a consulta geral "pelo assunto" de um alerta: o CEO IA consolida depois dos pareceres.',
      "Qual é a situação executiva deste problema e qual alternativa recomenda?",
      "Há divergência entre os especialistas sobre este evento?",
      "Quais decisões humanas estão pendentes e que informação falta?",
      "Quais riscos ALTO ou CRÍTICO merecem prioridade?",
    ],
    howItWorks:
      `${EXPERT_COMMON_METHOD} Específico do CEO: na consolidação recebe somente as posições que os especialistas realmente produziram naquela rodada (no máximo uma rodada de especialistas e uma consolidação por execução) e nunca infere a posição de quem não foi consultado. A saída segue a ordem: SITUAÇÃO, FATOS PRINCIPAIS, POSIÇÃO DE CADA ESPECIALISTA REALMENTE CONSULTADO, DIVERGÊNCIAS, RISCOS, ALTERNATIVAS, RECOMENDAÇÃO e DECISÕES HUMANAS NECESSÁRIAS. Divergências são explicitadas, nunca resolvidas em silêncio. Quando recebe registros de saúde das integrações, trata falha de conectividade ou de sincronização como incidente operacional e recomenda aviso aos administradores, sem afirmar que o aviso foi enviado.`,
    uses: [
      "Competência: solicitar e receber análises dos demais especialistas e consolidar conclusões.",
      "Competência: identificar divergências e conflitos entre áreas; priorizar riscos; destacar riscos ALTO e CRÍTICO.",
      "Competência: identificar decisões pendentes, comparar cenários, apresentar alternativas executivas e recomendar uma decisão (nunca executá-la).",
      "Competência: apontar informação faltante para a decisão e destacar ações já escaladas à Diretoria (Matriz de SLA).",
      "Especialização declarada: visão executiva e integradora; sem repertório técnico próprio de uma disciplina.",
      'Experiência técnica representada: nenhuma além da definição acima; a skill "/ceo-construcao" está apenas associada (pendente de integração) e seu conteúdo NÃO chega ao prompt.',
    ],
    criteria: [
      "Conhecimento normativo: nenhum carregado; o CEO IA não reinterpreta o domínio de outro especialista.",
      "Critério: só consolida posição que um especialista realmente produziu; divergência entre especialistas é sempre explicitada e a decisão final é humana.",
      "Critério: nunca cria fato que nenhum especialista ou fonte consultada suporte e nunca produz rascunho de comunicação.",
      EXPERT_COMMON_RISK_CRITERIA,
    ],
    data: [
      "Disponível (consolidação): as posições dos especialistas consultados na rodada, mais o contexto do projeto ou evento.",
      "Disponível (consulta individual): contexto de projeto ou evento montado por lib/ai/context (projeto, eventos recentes, obrigações ESG/SSMA resumidas; evidências, cláusulas, e-mails e anotações no escopo de evento).",
      "Autorizadas na definição (Event Ledger, Matriz de SLA, Timeline, obrigações ESG/SSMA e Change Orders), mas a consulta individual só recebe o contexto de projeto ou evento descrito acima; ações da Matriz de SLA não são carregadas diretamente nesse caminho.",
    ],
    source:
      "Pareceres dos especialistas da rodada de curadoria (lib/ai/curation, lib/ai/experts/ceo/consolidate.ts) e contexto da obra montado por lib/ai/context.",
    refresh: EXPERT_COMMON_REFRESH,
    missingData: `${EXPERT_COMMON_MISSING} Especialista que ficou sem parecer na rodada (por exemplo, Planejamento sem .mpp) é registrado como indisponível, e a consolidação não preenche a posição dele.`,
    result:
      "Entregáveis (tipos de saída): resumo executivo, análise, recomendação e avaliação de risco. Não produz rascunhos.",
    consequences: [
      ...EXPERT_COMMON_NOT_DO,
      "Não resolve divergência entre especialistas escolhendo um vencedor e não substitui nenhum parecer especializado.",
    ],
    permissions: `${EXPERT_COMMON_PERMISSIONS} A curadoria multi-especialista reserva 1 unidade por especialista chamado e mais 1 para a consolidação do CEO IA; se uma reserva é recusada, a rodada é interrompida e nenhuma consolidação parcial é apresentada como completa. A página Experts IA informa que o CEO IA não tem painel de consulta dedicado nesta fase.`,
    limitations: [
      "Nunca substitui a análise de um especialista: consolida, não reinterpreta a fundo outro domínio.",
      "Nunca executa uma decisão: a decisão e a execução são humanas.",
      "Não tem interface de consulta própria nesta fase; atua pela curadoria multi-especialista e pela consulta geral dos alertas.",
      "A qualidade da consolidação depende dos pareceres recebidos; especialista não consultado não tem posição representada.",
      EXPERT_COMMON_PROVIDER_NOTE,
    ],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },

  // ====================================================================================================
  // ROTEAMENTO, AXIA
  // ====================================================================================================
  {
    id: "experts.alertas.botao-especialista",
    kind: "button",
    module: MODULE,
    version: VERSION,
    title: "Botão ESPECIALISTA dos alertas",
    shortDescription: "Abre uma consulta somente leitura ao especialista da área do alerta. Nunca altera o alerta e nunca aciona a AXIA.",
    description:
      "Botão ESPECIALISTA do alerta de risco (e do formulário CONSULTAR IA): abre uma consulta de IA, somente leitura, a um dos especialistas oficiais do ACC, escolhido pela área do alerta e pelo assunto. A AXIA não é um especialista e nunca participa: ela é exclusivamente o assistente de dúvidas sobre o uso do ACC.",
    purpose:
      "Obter opções práticas de tratamento de um risco sob a ótica da especialidade certa, sem sair do alerta, mantendo a decisão e a providência com a pessoa responsável.",
    howToUse: [
      "Abra o alerta (link do e-mail ou tela do caso) e clique em ESPECIALISTA.",
      "Confira a especialidade pré-selecionada pela área do alerta e troque se preferir.",
      "Escreva a pergunta (até 2000 caracteres) ou use a pergunta padrão e confirme.",
      "Leia a resposta, registre a providência pelas ações do alerta e valide qualquer sugestão antes de agir.",
    ],
    howItWorks:
      'O roteamento é determinístico (lib/ai/routing/expert-topics.ts): Planejamento → Diretor de Planejamento IA; Engenharia → Diretor de Engenharia e Construção IA; Jurídico → Consultor Jurídico IA; Comercial, Financeiro e Orçamento → Diretor Comercial IA; SSMA/ESG → Diretor de ESG IA; Qualidade e Garantias (não conformidade, RNC, inspeção, defeito, vício, garantia e assistência técnica) → Analista IA de Qualidade; a especialidade "Seguros e Garantias Financeiras" (apólice, seguro-garantia, fiança, caução, endosso, sinistro) usa o Consultor Jurídico IA; a especialidade "Documentação e Entrega" usa o Consultor Jurídico IA com foco próprio. Em "Geral (pelo assunto)", um único tema leva ao especialista do tema; dois ou mais temas, ou nenhum reconhecido, levam à curadoria multi-especialista (um parecer por especialista e a consolidação do CEO IA). Áreas sem especialista dedicado (Administrativo, Diretoria, Compras) voltam para "Geral". A pergunta enviada inclui o contexto do alerta, o foco da especialidade e regras de resposta (opções práticas, fontes citadas, fato separado de inferência e recomendação).',
    data: [
      "Contexto do alerta (evento, providência ou caso de risco) lido no servidor; o navegador nunca é a fonte final do contexto.",
      "Área SLA do alerta e área cadastrada do colaborador na obra, para a especialidade inicial.",
    ],
    consequences: [
      "A consulta não altera o estado do alerta, o responsável, o prazo de SLA nem o escalonamento.",
      "Consome 1 unidade do limite de IA por especialista chamado (e 1 pela consolidação do CEO IA na curadoria), contada por usuário e por obra.",
      "O ESPECIALISTA de um caso de risco pode ser respondido pelo ciclo automático de alertas, em nome do usuário que perguntou, com a mesma contagem.",
    ],
    permissions:
      "Exige vínculo ativo com a obra. Sem usuário solicitante identificável a reserva do limite não é feita e a IA não é chamada.",
    limitations: [
      "A resposta é uma sugestão: não afirma providência concluída sem registro correspondente.",
      "Penalização só é citada quando houver cláusula que a preveja no contexto.",
    ],
    humanReview:
      "Toda resposta exige revisão humana; risco ALTO ou CRÍTICO e qualquer envio de comunicação exigem decisão humana explícita.",
  },
  {
    id: "experts.hub.axia-diferenca",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "AXIA × especialistas",
    shortDescription: "A AXIA responde dúvidas de uso do ACC; não é um dos sete especialistas e não analisa contratos nem dados da obra.",
    description:
      "A AXIA é exclusivamente o assistente de dúvidas sobre o uso do ACC (onde fica cada tela, o que significa cada termo, como executar uma tarefa). Não é um dos sete especialistas (Planejamento, Jurídico, SSMA/ESG, Engenharia, Qualidade, Comercial e Gestão Executiva), não emite parecer sobre contratos, riscos ou dados da obra e não recebe os pedidos do botão ESPECIALISTA.",
    purpose:
      "Evitar confundir os dois recursos: dúvida de uso do sistema vai para a AXIA; análise técnica, contratual, comercial ou de prazo vai para o especialista da área.",
    howItWorks:
      "A AXIA responde a partir de uma base de conhecimento aprovada sobre o uso do ACC (modo determinístico por padrão; a conversa natural é opcional e controlada por configuração do servidor). Os especialistas usam contexto da obra e provedor de IA próprio, com limites e auditoria por consulta.",
    limitations: [
      "A AXIA não substitui nenhum especialista nem a revisão humana.",
      "O limite de 20 consultas por usuário por dia e 100 por obra por dia vale para os especialistas; a AXIA tem controle de uso próprio.",
    ],
    humanReview:
      "Qualquer decisão sobre contrato, risco ou obra continua humana, com apoio dos especialistas quando necessário.",
  },

  // ====================================================================================================
  // HUB /[projectId]/experts-ia
  // ====================================================================================================
  {
    id: "experts.hub.pagina",
    kind: "page",
    module: MODULE,
    version: VERSION,
    title: "Experts IA (hub dos especialistas)",
    shortDescription: "Reúne os sete especialistas oficiais do ACC, o estado de cada um e o acesso à consulta; toda sugestão exige revisão humana.",
    description:
      "Hub central dos sete especialistas oficiais de IA do ACC para este projeto: Planejamento, Jurídico, SSMA/ESG, Engenharia, Qualidade, Comercial e Gestão Executiva. Cada cartão mostra a missão, o estado de implantação, o provedor de IA, as skills associadas e o acesso ao especialista.",
    purpose:
      "Escolher o especialista certo para a pergunta e entender o que cada um pode e não pode fazer antes de consultar.",
    howToUse: [
      "Passe o mouse ou foque o ícone de informação ao lado do nome do especialista para ver o perfil completo.",
      "Clique em Abrir Expert para ir ao painel ou à tela onde ele atua.",
      "Use Descrição dos Especialistas para ler competências, fontes, limitações e o roteamento dos alertas.",
    ],
    howItWorks:
      "Nome, missão e estado vêm do catálogo formal dos especialistas (lib/ai/expert-definitions), fonte única; o provedor vem da configuração de cada especialista no servidor. O hub não substitui os acessos já existentes (Dashboard, ESG/SSMA, Jurídico, Event Ledger).",
    permissions: "Disponível a quem tem acesso ativo à obra. A consulta em si segue as regras e os limites de cada especialista.",
    limitations: [
      "O hub não executa análise; ele só direciona.",
      "O CEO IA não tem painel de consulta dedicado nesta fase.",
    ],
    humanReview: "Toda sugestão dos especialistas exige revisão humana antes de qualquer ação.",
  },
  {
    id: "experts.hub.descricao-botao",
    kind: "button",
    module: MODULE,
    version: VERSION,
    title: "Descrição dos Especialistas",
    shortDescription: "Abre a página com competências, fontes, limitações e perfil de cada especialista.",
    description:
      "Link para a página Descrição dos Especialistas, que lista, para cada um dos sete especialistas, as competências, as skills selecionadas, as fontes autorizadas, as limitações e o perfil de apoio simulado completo.",
    purpose: "Consultar o manual de cada especialista sem precisar fazer uma consulta de IA.",
    consequences: ["Apenas navega; não consome unidade do limite de IA."],
  },
  {
    id: "experts.hub.status-expert",
    kind: "status",
    module: MODULE,
    version: VERSION,
    title: "Estado do especialista (Ativo / Em implantação)",
    shortDescription: "Informa se o especialista já tem operação real no ACC ou se ainda é só a definição formal.",
    description:
      "Selo do cartão do especialista: Ativo quando o catálogo formal declara o especialista como implementado (com consulta operacional); Em implantação quando existe só a definição formal, sem operação real. Hoje os sete estão declarados como implementados.",
    howItWorks:
      "Derivado do campo status da definição oficial (IMPLEMENTED ou PLANNED) em lib/ai/expert-definitions; não mede disponibilidade do provedor em tempo real.",
    limitations: ["Ativo não significa que o provedor de IA esteja respondendo agora nem que haja dados suficientes na obra."],
  },
  {
    id: "experts.hub.provider",
    kind: "status",
    module: MODULE,
    version: VERSION,
    title: "Provedor de IA do especialista",
    shortDescription: "Mostra qual provedor de IA atende este especialista e se a resposta vem de IA real ou do modo determinístico.",
    description:
      "Rótulo do provedor configurado no servidor para este especialista. Provedor real (Anthropic) gera a resposta por IA; o provedor determinístico (fake) devolve respostas de teste que não são análise inteligente.",
    howItWorks:
      "Cada especialista resolve o próprio provedor a partir da configuração do servidor (resolveAiProviderForExpert). Ativar um provedor para um especialista não ativa para os outros; a chave nunca é exposta ao navegador.",
    limitations: ["O rótulo mostra a configuração, não o resultado de uma chamada; o painel de consulta exibe o provedor efetivamente usado após a primeira resposta."],
  },
  {
    id: "experts.hub.skills",
    kind: "table",
    module: MODULE,
    version: VERSION,
    title: "Skills selecionadas para o especialista",
    shortDescription: "Skills do Claude Code associadas ao especialista e se o conteúdo delas já chega ao ACC.",
    description:
      "Lista, por especialista, as skills do Claude Code que a AXION associou a ele, com a finalidade e o estado: Pendente de integração (só a associação foi pedida; nada do conteúdo chega ao prompt) ou Conhecimento técnico integrado por resumo próprio (um resumo versionado do ACC entra no prompt; a skill original existe só no ambiente Claude Code local).",
    howItWorks:
      "Dados de lib/ai/expert-definitions/requested-skills.ts. O ACC não executa skills do Claude Code: instalação no Claude Code não ativa o uso pelas consultas. Hoje Planejamento e Engenharia têm resumo próprio integrado, com procedência (nome da skill, sha256 e data de leitura); as demais estão pendentes.",
    limitations: [
      "Uma skill pendente não influencia as respostas do especialista.",
      "O texto original das skills não está no repositório.",
    ],
  },
  {
    id: "experts.hub.abrir-expert",
    kind: "button",
    module: MODULE,
    version: VERSION,
    title: "Abrir Expert",
    shortDescription: "Leva à tela onde o especialista atua (painel próprio, Dashboard, ESG/SSMA ou Jurídico).",
    description:
      "Link para o local de consulta do especialista: Planejamento e Engenharia têm painel próprio em Experts IA; Comercial atua no Dashboard e no Event Ledger; SSMA/ESG na tela ESG/SSMA; Jurídico na tela Jurídico. O CEO IA não tem painel e mostra apenas uma nota informativa.",
    consequences: ["Apenas navega; a consulta e o consumo do limite de IA só ocorrem ao enviar uma pergunta."],
  },
  {
    id: "experts.hub.nota-skills",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Nota sobre a ferramenta de busca de skills",
    shortDescription: "Explica que a ferramenta de busca de skills é administrativa e não é um especialista.",
    description:
      "Nota no rodapé do hub: a ferramenta administrativa selecionada (busca de skills) serve para localizar skills e não é um especialista; as skills informadas como instaladas no Claude Code não ativam sozinhas o uso nas consultas do ACC.",
    howItWorks:
      "Texto fixo da tela, coerente com o estado das skills em requested-skills.ts: apenas Planejamento e Engenharia recebem um resumo técnico próprio versionado; as demais seguem pendentes de integração.",
  },

  // ====================================================================================================
  // DESCRIÇÃO /[projectId]/experts-ia/descricao
  // ====================================================================================================
  {
    id: "experts.descricao.pagina",
    kind: "page",
    module: MODULE,
    version: VERSION,
    title: "Descrição dos Especialistas",
    shortDescription: "Manual dos sete especialistas: competências, fontes, limitações, perfil simulado e roteamento dos alertas.",
    description:
      "Página de referência dos especialistas oficiais do ACC. Para cada um mostra competências, skills selecionadas, fontes autorizadas, limitações e o perfil de apoio simulado completo, lido do catálogo de ajuda; ao final explica o botão ESPECIALISTA dos alertas e a diferença para a AXIA.",
    purpose: "Entender, antes de consultar, o que cada especialista faz, em que fontes se apoia, o que não faz e quando a revisão humana é obrigatória.",
    howToUse: [
      "Role até o especialista desejado e leia as seções.",
      "Abra o bloco Perfil de apoio simulado para ver perguntas recomendadas, fontes efetivas, critérios, limites de uso e casos de revisão humana.",
      "Use Voltar aos especialistas para retornar ao hub.",
    ],
    howItWorks:
      "Competências, fontes e limitações vêm da definição formal (lib/ai/expert-definitions); o perfil completo vem do catálogo de ajuda (módulo experts); nenhuma dessas informações é digitada na página.",
    humanReview: "Decisões e recomendações dos especialistas exigem revisão humana.",
  },
  {
    id: "experts.descricao.competencias",
    kind: "table",
    module: MODULE,
    version: VERSION,
    title: "Principais competências",
    shortDescription: "Lista de capacidades declaradas na definição oficial do especialista.",
    description:
      "Relação das competências que a definição formal do especialista declara (capabilities). É o escopo pretendido da análise: o que não está listado, ou está fora do escopo descrito nas limitações, deve ser encaminhado a outro especialista ou a um profissional humano.",
    howItWorks: "Lista lida de lib/ai/expert-definitions/definitions.ts; o texto da lista é o mesmo usado pelos testes de capacidade dos especialistas.",
    limitations: ["Ter uma competência declarada não garante dados suficientes na obra para exercê-la."],
  },
  {
    id: "experts.descricao.fontes",
    kind: "table",
    module: MODULE,
    version: VERSION,
    title: "Fontes autorizadas",
    shortDescription: "Fontes que a definição autoriza para o especialista e se cada uma está disponível ou é futura.",
    description:
      "Lista das fontes que o especialista pode usar segundo a definição formal, com o estado Disponível (a fonte existe e é consultável hoje) ou Fonte futura (ainda sem tabela ou integração). Atenção: autorizada não significa que o carregador de contexto já a entregue em cada consulta; o perfil do especialista detalha o que chega de fato.",
    howItWorks: "Lido de authorizedSources em lib/ai/expert-definitions; o campo status distingue AVAILABLE de FUTURE_SOURCE.",
    limitations: [
      "Fontes futuras (atas, Diário de Obra, Construmanager, relatórios semanais, notificações formais, base legal) não são consultadas.",
      "Algumas fontes disponíveis ainda não estão conectadas ao contexto de nenhum especialista.",
    ],
  },
  {
    id: "experts.descricao.limitacoes",
    kind: "table",
    module: MODULE,
    version: VERSION,
    title: "Limitações e revisão humana",
    shortDescription: "Limites declarados do especialista e lembrete de que toda recomendação exige revisão humana.",
    description:
      "Lista das limitações que a definição formal impõe ao especialista (o que ele nunca faz, encaminhamentos a outros especialistas e restrições de fonte) e o aviso de que decisões e recomendações exigem revisão humana.",
    howItWorks: "Lido de limitations em lib/ai/expert-definitions; o aviso final é fixo porque requiresHumanReview é sempre verdadeiro em toda definição.",
    humanReview: "Sempre obrigatória; riscos ALTO e CRÍTICO e qualquer envio de comunicação exigem decisão humana explícita.",
  },
  {
    id: "experts.descricao.perfil-simulado",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Perfil de apoio simulado (bloco expansível)",
    shortDescription: "Abre o perfil completo do especialista, lido do catálogo, com a declaração de que é um perfil simulado.",
    description:
      "Bloco expansível que exibe o perfil completo do especialista a partir do catálogo de ajuda: identificação e função, competências, experiência técnica representada, conhecimentos declarados, metodologia, perguntas recomendadas, fontes efetivas, critérios, entregáveis, limitações, limites de uso e casos de revisão humana. O perfil é simulado e não descreve uma pessoa.",
    limitations: [
      "Não contém currículo, anos de experiência nem certificações: só o que o código do ACC define.",
      "Mostra o que o código faz hoje; mudanças de prompt ou de carregador de contexto exigem atualizar o texto do catálogo.",
    ],
    humanReview: "O perfil não substitui a leitura crítica das respostas: toda resposta exige revisão humana.",
  },

  // ====================================================================================================
  // PÁGINAS DOS DIRETORES (painéis próprios)
  // ====================================================================================================
  {
    id: "experts.planejamento.pagina",
    kind: "page",
    module: MODULE,
    version: VERSION,
    title: "Painel do Diretor de Planejamento IA",
    shortDescription: "Consulta ao especialista de planejamento sobre cronograma, caminho crítico e prazo do projeto.",
    description:
      "Tela de consulta do Diretor de Planejamento IA: exibe consultas recomendadas e o painel para perguntar sobre o projeto. A análise formal de prazo depende do cronograma Microsoft Project (.mpp) extraído de forma estruturada.",
    purpose: "Perguntar sobre data final, caminho crítico, folgas, relações entre atividades e alternativas de recuperação de prazo.",
    howToUse: [
      "Leia as consultas recomendadas e escreva a pergunta no campo do painel.",
      "Clique em Consultar e aguarde; a resposta anterior sai da tela quando uma nova consulta começa.",
      "Revise fatos, interpretação, riscos e recomendações antes de agir.",
    ],
    howItWorks:
      "A Server Action valida o vínculo com a obra, faz a pré-verificação do limite de IA e chama o especialista. Sem .mpp extraído a consulta é recusada com mensagem própria e sem consumir unidade.",
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: ["Veja o perfil completo para limitações, fontes e casos de revisão humana."],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },
  {
    id: "experts.engenharia.pagina",
    kind: "page",
    module: MODULE,
    version: VERSION,
    title: "Painel do Diretor de Engenharia e Construção IA",
    shortDescription: "Consulta ao especialista de engenharia sobre solução técnica, construtibilidade e compatibilização.",
    description:
      "Tela de consulta do Diretor de Engenharia e Construção IA: exibe consultas recomendadas e o painel para perguntar sobre o projeto. Não substitui projetista nem responsável técnico e nunca apresenta dimensionamento definitivo.",
    purpose: "Comparar alternativas técnicas, avaliar construtibilidade e riscos de execução e apontar interferências entre disciplinas.",
    howToUse: [
      "Leia as consultas recomendadas e escreva a pergunta no campo do painel.",
      "Clique em Consultar e aguarde a resposta.",
      "Valide qualquer solução técnica com o projetista ou responsável técnico antes de executar.",
    ],
    howItWorks:
      "A Server Action valida o vínculo com a obra, faz a pré-verificação do limite de IA e chama o especialista com o contexto do projeto.",
    permissions: EXPERT_COMMON_PERMISSIONS,
    limitations: ["Veja o perfil completo para limitações, fontes e casos de revisão humana."],
    humanReview: EXPERT_COMMON_HUMAN_REVIEW,
  },

  // ====================================================================================================
  // PAINEL DE CONSULTA (components/ai/expert-query-panel.tsx — compartilhado por várias telas)
  // ====================================================================================================
  {
    id: "experts.painel.pergunta",
    kind: "field",
    module: MODULE,
    version: VERSION,
    title: "Pergunta ao especialista",
    shortDescription: "Campo obrigatório onde você descreve o contexto e a pergunta para o especialista.",
    description:
      "Campo de texto da consulta. Descreva o contexto e a pergunta; o especialista usará os documentos e dados disponíveis neste projeto (ou neste evento, quando a tela é de evento) e a resposta exigirá revisão humana.",
    howToUse: [
      "Seja específico: cite o assunto, o documento ou a atividade que interessa.",
      "Pergunte uma coisa por vez; perguntas que cruzam várias áreas funcionam melhor pela curadoria multi-especialista.",
    ],
    data: ["Texto digitado; o escopo (projeto ou evento) e o identificador da obra são enviados em campos ocultos e revalidados no servidor."],
    limitations: ["O campo é obrigatório; sem pergunta a consulta não é feita.", "Não há memória entre consultas: cada pergunta é independente."],
  },
  {
    id: "experts.painel.consultar",
    kind: "button",
    module: MODULE,
    version: VERSION,
    title: "Consultar",
    shortDescription: "Envia a pergunta ao especialista; consome 1 unidade do limite diário de consultas de IA.",
    description:
      "Envia a pergunta ao especialista. O servidor confere o vínculo com a obra, a pré-verificação do limite, reserva 1 unidade imediatamente antes de chamar o provedor de IA, monta o contexto da obra, valida a resposta e registra a auditoria.",
    howToUse: ["Clique uma vez e aguarde o indicador de consulta; o botão fica desabilitado enquanto a consulta roda."],
    consequences: [
      "Consome 1 unidade do limite (20 por usuário por dia e 100 por obra por dia, valores operacionais atuais), exceto quando uma validação anterior ao provedor recusa a consulta.",
      "A consulta fica registrada na trilha de auditoria de consumo de IA.",
      "Não altera nenhum dado da obra.",
    ],
    limitations: ["Atingido o limite, a consulta é recusada com mensagem e a IA não é chamada."],
    humanReview: "A resposta exige revisão humana antes de qualquer ação.",
  },
  {
    id: "experts.painel.provider",
    kind: "status",
    module: MODULE,
    version: VERSION,
    title: "Aviso de provedor da resposta",
    shortDescription: "Informa se a resposta veio de IA real (com modelo) ou do provedor determinístico de teste.",
    description:
      "Faixa do painel que mostra o provedor e o modelo usados na última resposta. Com IA real, lembra que a sugestão exige revisão humana. Com o provedor determinístico (fake), a faixa vira um aviso: a resposta não é análise inteligente. Antes da primeira consulta mostra apenas que o provedor aparecerá após a consulta.",
    howItWorks: "Lido do metadado devolvido pela Server Action (buildAiProviderUiMetadata) a partir do provedor efetivamente usado.",
    limitations: ["Não informa custo nem tokens; esses dados ficam na trilha de auditoria."],
  },
  {
    id: "experts.painel.severidade-confianca",
    kind: "status",
    module: MODULE,
    version: VERSION,
    title: "Severidade e confiança da resposta",
    shortDescription: "Grau de risco sugerido e confiança declarada pelo especialista; ambos são sugestões, não decisão.",
    description:
      "Selo de severidade (Baixo, Médio, Alto, Crítico) e percentual de confiança da resposta. A severidade segue a definição AXION de risco e é uma sugestão provisória; a classificação efetiva é a revisão da pessoa autorizada.",
    criteria: [
      "CRÍTICO: risco iminente de descumprimento e penalização contratual, exigindo ação imediata.",
      "ALTO: risco iminente, com tempo para mitigação.",
      "MÉDIO: possível consequência a médio prazo.",
      "BAIXO: risco processual de acompanhamento.",
    ],
    howItWorks:
      "Valores devolvidos pelo especialista e validados pelo servidor. A confiança pode ser reduzida pela checagem de fidelidade (grounding) quando aplicável. Não existe número fixo de dias entre os níveis.",
    limitations: ["Confiança não é probabilidade estatística: é um indicador declarado pela resposta."],
    humanReview: "Risco ALTO ou CRÍTICO exige decisão humana explícita.",
  },
  {
    id: "experts.painel.interpretacao",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Interpretação (sugestão, não fato)",
    shortDescription: "Leitura da IA sobre os fatos; é inferência em linguagem condicional, nunca um fato confirmado.",
    description:
      "Seção com a interpretação do especialista. Diferente dos fatos documentados, é uma inferência: deve usar linguagem condicional e pode estar errada. Use-a como hipótese a verificar nas fontes.",
    howItWorks: "Campo interpretacao da resposta estruturada; o prompt proíbe transformar inferência em fato e a checagem de fidelidade se aplica a rascunhos.",
    humanReview: "Confirme a interpretação nos documentos antes de usá-la.",
  },
  {
    id: "experts.painel.fatos",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Fatos documentados",
    shortDescription: "Itens que o especialista afirma estarem comprovados nas fontes da obra.",
    description:
      "Lista do que a resposta apresenta como comprovado no contexto enviado (documento, cláusula, evento, evidência). Cada fato deve poder ser conferido na fonte original; se o contexto foi truncado, a conferência nos arquivos originais é indispensável.",
    howItWorks: "Campo fatosDocumentados da resposta estruturada, validado pelo servidor.",
    missingData: 'Sem fatos identificados, o painel mostra "Nenhum item identificado" — isso não é prova de ausência do fato.',
    humanReview: "Confira cada fato na fonte original antes de decidir.",
  },
  {
    id: "experts.painel.contexto-declarado",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Contexto interno declarado",
    shortDescription: "Anotações de usuários sobre o evento; são informação declarada, nunca fato confirmado por documento.",
    description:
      "Seção exibida quando há anotações de usuários sobre o evento. Cada item mostra categoria, autor e texto. É contexto declarado internamente, sem confirmação documental, e a conclusão do especialista que depende dele deve ser tratada como dependente de contexto não confirmado.",
    howItWorks: "Vem das anotações do evento (event_notes), marcadas como USER_NOTE com status probatório DECLARED_CONTEXT.",
    humanReview: "Valide a anotação com documento ou responsável antes de basear uma decisão nela.",
  },
  {
    id: "experts.painel.base-contratual",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Base contratual",
    shortDescription: "Cláusulas e documentos contratuais citados pelo especialista para sustentar a análise.",
    description:
      "Lista das cláusulas ou referências contratuais que a resposta cita (número e título). Toda afirmação de obrigação ou penalidade deve ter cláusula citada; sem cláusula a resposta deve declarar a informação como pendente de confirmação.",
    howItWorks: "Campo baseContratual da resposta, derivado das cláusulas presentes no contexto enviado.",
    humanReview: "Leia a cláusula no contrato original: a citação é um ponteiro, não substitui o documento.",
  },
  {
    id: "experts.painel.base-legal",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Base legal",
    shortDescription: "Normas oficiais citadas; hoje nenhum corpus legal está carregado, então a lista é vazia.",
    description:
      "Seção de base legal. O ACC não tem corpus normativo oficial versionado nesta fase; por isso a lista fica vazia e o painel informa que a base legal oficial não está disponível. Os especialistas são proibidos de citar lei, norma ou jurisprudência de memória.",
    howItWorks: "Campo baseLegal da resposta; só aceita citação de fonte legal oficial versionada (lib/ai/legal/types.ts), que hoje não existe.",
    limitations: ["Ausência de base legal não impede a análise contratual; impede apenas citar norma externa ao contrato."],
    humanReview: "Questões que dependem de norma exigem consulta ao jurídico ou ao profissional competente.",
  },
  {
    id: "experts.painel.praticas",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Práticas negociais e classificações",
    shortDescription: "Classifica cada exigência como legal, contratual, prática negocial (não obrigação) ou recomendação da IA.",
    description:
      "Seção que rotula cada afirmação com a origem da exigência: Exigência legal, Exigência contratual, Prática negocial (não é obrigação) ou Recomendação da IA. Uma boa prática nunca deve ser lida como obrigação.",
    howItWorks: "Campo praticasNegociais da resposta; o Framework Comum exige classificar a origem de toda exigência.",
  },
  {
    id: "experts.painel.riscos",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Riscos",
    shortDescription: "Riscos que o especialista identifica a partir do contexto, sem prazo ou penalidade inventados.",
    description:
      "Lista de riscos apontados na resposta. Penalização só é afirmada quando há cláusula que a preveja no contexto; sem prazo ou vínculo contratual a resposta deve dizer que a informação está ausente em vez de afirmar certeza.",
    howItWorks: "Campo riscos da resposta, alinhado aos critérios de risco AXION.",
    humanReview: "Riscos ALTO e CRÍTICO exigem decisão humana explícita.",
  },
  {
    id: "experts.painel.recomendacoes",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Recomendações e ações sugeridas",
    shortDescription: "Sugestões do especialista; são recomendações, nunca decisões executadas.",
    description:
      "Recomendações e ações sugeridas pela resposta. São propostas para a pessoa responsável avaliar: o especialista não executa, não aprova e não registra providência. Quem decide e registra é o usuário.",
    howItWorks: "Campos recomendacoes e acoesSugeridas da resposta estruturada; a seção de ações só aparece quando há itens.",
    consequences: ["Nenhuma ação é disparada pela resposta; providências são registradas pelas telas próprias (por exemplo, ações do alerta)."],
    humanReview: "Valide e decida antes de executar; envio de comunicação exige decisão humana.",
  },
  {
    id: "experts.painel.informacoes-faltantes",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Informações faltantes",
    shortDescription: "O que o especialista não encontrou nas fontes e que precisa ser confirmado por uma pessoa.",
    description:
      "Lista do que faltou para concluir: documento ausente, valor econômico não disponível, prazo sem fonte, norma sem base legal carregada. É onde o especialista declara que não vai inventar o dado e pede definição humana.",
    howItWorks: "Campo informacoesFaltantes da resposta; dado ausente nunca é tratado como zero.",
    humanReview: "Providencie ou confirme a informação antes de decidir com base na resposta.",
  },
  {
    id: "experts.painel.rascunho",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Rascunho sugerido",
    shortDescription: "Minuta de comunicação preparada pelo especialista; sempre pendente de revisão e nunca enviada.",
    description:
      "Minuta de e-mail, carta, notificação ou proposta preparada pelo especialista, com assunto e corpo. O status é sempre DRAFT_PENDING_REVIEW e nada é enviado pelo ACC a partir daqui; copiar, ajustar e enviar é decisão humana.",
    howItWorks: "Campo rascunhoSugerido; o servidor trava o status do rascunho e, com provedor real, passa o texto pela checagem de fidelidade (grounding).",
    consequences: ["Não envia e-mail nem registra comunicação."],
    humanReview: "Revise fatos, valores e compromissos do texto antes de qualquer envio.",
  },
  {
    id: "experts.painel.grounding",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Checagem de fidelidade (grounding) do rascunho",
    shortDescription: "Verificação automática que separa afirmações com suporte, inferências e afirmações sem suporte no rascunho.",
    description:
      "Resumo do guardrail determinístico que confere o rascunho contra o contexto enviado: agrupa afirmações em Fato documentado, Interpretação da IA, Informação não comprovada e Depende de definição humana. Trecho sem suporte é substituído por marcação [CONFIRMAR INTERNAMENTE…] e, se não houver correção segura, o rascunho é removido.",
    howItWorks: "Executado no servidor somente para respostas do provedor Anthropic que contêm rascunho (lib/ai/grounding); é a autoridade final sobre o texto, acima do reforço de prompt.",
    limitations: ["Não roda para o provedor determinístico nem para respostas sem rascunho.", "Não garante que o rascunho esteja correto, apenas que afirmações sem suporte foram sinalizadas ou removidas."],
    humanReview: "Trechos marcados exigem confirmação humana antes de qualquer envio.",
  },
  {
    id: "experts.painel.comparacao-clausulas",
    kind: "table",
    module: MODULE,
    version: VERSION,
    title: "Comparação das cláusulas e sugestões",
    shortDescription: "Compara cada cláusula da minuta com a sugestão do Consultor Jurídico (modificar, excluir ou adicionar).",
    description:
      "Tabela da análise pré-contratual: para cada cláusula mostra o texto da minuta ao lado da sugestão do Consultor Jurídico IA, a ação (Modificar, Excluir ou Adicionar), a severidade, o botão de fundamento e a confiança, sempre com revisão humana obrigatória.",
    howItWorks: 'Campo analiseClausulas da resposta jurídica, verificado contra as cláusulas do documento analisado; o fundamento e o risco mitigado de cada sugestão ficam no painel "Por que alterar?".',
    humanReview: "Cada alteração de cláusula sugerida exige validação do jurídico antes de negociar ou assinar.",
  },
  {
    id: "experts.painel.aviso-conteudo-parcial",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Aviso de análise com conteúdo parcial",
    shortDescription: "Avisa que parte dos documentos excedeu o limite de contexto e não foi lida pelo especialista.",
    description:
      "Aviso calculado pelo servidor quando os documentos contratuais excederam o limite de contexto da consulta. Mostra documentos incluídos e omitidos, não legíveis e caracteres omitidos. A conclusão do especialista vale só para o trecho lido.",
    howItWorks: "Metadado de cobertura (ContextDocumentCoverage) calculado no servidor; nunca depende de o modelo mencionar o corte.",
    missingData: "Documento omitido ou não legível não entra na análise; ele é declarado, nunca tratado como vazio.",
    humanReview: "Confirme as cláusulas diretamente nos arquivos originais quando o aviso aparecer.",
  },
  {
    id: "experts.painel.consultas-recomendadas",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Consultas recomendadas",
    shortDescription: "Exemplos de perguntas adequadas ao escopo do especialista desta tela.",
    description:
      "Cartão com exemplos de perguntas coerentes com o escopo do especialista da tela. São sugestões de formulação, não consultas já feitas e não consomem o limite de IA.",
    howItWorks: "Texto fixo da tela, alinhado às perguntas recomendadas do perfil do especialista; copie, adapte ao seu caso e envie pelo painel.",
  },
  {
    id: "experts.painel.por-que-alterar",
    kind: "button",
    module: MODULE,
    version: VERSION,
    title: "Por que alterar? (fundamento da sugestão)",
    shortDescription: "Abre o fundamento, o risco mitigado e a base jurídica da sugestão do Consultor Jurídico para aquela cláusula.",
    description:
      "Botão de cada cartão da comparação de cláusulas. Ao passar o mouse ou focar com o teclado, exibe três blocos: Fundamento da sugestão, Risco que a mudança busca reduzir e, quando houver, Base jurídica disponível no contexto. O texto vem da própria análise da cláusula.",
    purpose: "Dar a justificativa de cada alteração sugerida para que a revisão jurídica possa aceitá-la ou rejeitá-la com conhecimento.",
    howItWorks: "Mostra os campos rationale, mitigatedRisk e legalBasis de cada item de analiseClausulas da resposta jurídica; o item só chega à tela se passou pela verificação contra as cláusulas do documento analisado.",
    missingData: "Sem base jurídica no contexto o terceiro bloco simplesmente não aparece; o ACC não completa com base inventada.",
    limitations: ["A base jurídica é a disponível no contexto do projeto; não há corpus normativo oficial versionado nesta fase."],
    humanReview: "A sugestão é apoio; a alteração da cláusula só vale após validação do jurídico.",
  },
  {
    id: "experts.painel.grounding-grupos",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Grupos da checagem de fidelidade",
    shortDescription: "Separa as afirmações do rascunho em Informação não comprovada, Depende de definição humana, Interpretação da IA e Fato documentado.",
    description:
      "Cada título de grupo mostra quantas afirmações do rascunho caem naquela situação. Informação não comprovada: sem suporte no contexto enviado ao especialista. Depende de definição humana: falta dado que só uma pessoa pode decidir. Interpretação da IA: inferência sobre os fatos. Fato documentado: apoiada no contexto.",
    howItWorks: "A ordem de exibição põe primeiro o que exige mais atenção (não comprovada, depende de definição humana, interpretação) e por último o fato documentado.",
    humanReview: "Afirmação não comprovada ou dependente de definição humana precisa ser confirmada por pessoa antes de qualquer envio.",
  },
  {
    id: "experts.curadoria.resumo",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Análise multidisciplinar (resumo)",
    shortDescription: "Informa o tema classificado, quantos pareceres de especialistas foram obtidos e que há consolidação do CEO IA.",
    description:
      "Linha de abertura da consulta multidisciplinar de um alerta: o tema encontrado pela classificação do assunto e a quantidade de pareceres obtidos. Quando o assunto envolve mais de uma área, o ACC consulta um especialista por área e o CEO IA consolida as posições.",
    howItWorks: "O assunto do alerta e a pergunta são classificados por regras (roteamento por assunto); cada especialista roteado responde com o contexto somente desta obra e o CEO IA consolida apenas as respostas realmente recebidas.",
    limitations: ["Cada especialista consultado consome uma unidade do limite de uso de IA; recusa determinística antes do modelo não consome."],
    humanReview: "A consulta não altera o alerta nem registra providência; qualquer decisão é humana.",
  },
  {
    id: "experts.curadoria.parecer",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Parecer do especialista",
    shortDescription: "Resposta de um especialista de IA específico, com autoria preservada, fatos, riscos e recomendações próprios.",
    description:
      "Seção com o parecer de um dos especialistas consultados (por exemplo Consultor Jurídico IA ou Diretor de Engenharia e Construção IA). Traz severidade e confiança, interpretação, fatos documentados, base contratual, riscos, recomendações e informações faltantes, conforme o painel de resposta do especialista.",
    howItWorks: "Mesmo formato estruturado das consultas diretas: cada parecer é validado por regra determinística e mantém o nome do especialista autor; nenhum parecer é fundido ao de outro.",
    limitations: ["Parecer limitado ao contexto e aos documentos disponíveis na obra; documento ausente ou não legível não entra na análise.", "É perfil simulado de apoio, não um profissional real."],
    humanReview: "Revisão humana obrigatória antes de qualquer decisão ou envio.",
  },
  {
    id: "experts.curadoria.sem-parecer",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Sem parecer de um especialista",
    shortDescription: "Informa que um especialista roteado não emitiu parecer e o motivo, em vez de inventar uma posição.",
    description:
      "Aviso em linha tracejada quando um especialista indicado pelo roteamento não pôde responder por bloqueio determinístico (por exemplo, análise formal de prazo sem cronograma estruturado). O motivo é exibido e o CEO IA consolida somente os pareceres realmente obtidos.",
    missingData: "A ausência do parecer é declarada; a posição daquele especialista não é presumida nem preenchida.",
    humanReview: "Providencie o dado faltante citado no motivo e consulte novamente, ou trate a área com a pessoa responsável.",
  },
  {
    id: "experts.curadoria.consolidacao-ceo",
    kind: "expert",
    module: MODULE,
    version: VERSION,
    title: "Consolidação do CEO IA",
    shortDescription: "Síntese do CEO IA sobre os pareceres: situação, divergências, riscos, recomendação e decisões humanas.",
    description:
      "Bloco final da consulta multidisciplinar. O CEO IA não faz análise de domínio própria nem escreve rascunho de comunicação: apenas consolida as posições dos especialistas consultados, apontando a situação, as divergências entre eles, os riscos, a recomendação e o que depende de decisão humana. A severidade consolidada é a mais alta entre as posições recebidas.",
    howItWorks: "Recebe somente os pareceres produzidos nesta rodada (nunca de especialista não consultado) e devolve situação, fatos principais, posições, divergências, riscos, alternativas, recomendação e decisões humanas necessárias.",
    limitations: ["Depende da qualidade e da cobertura dos pareceres individuais.", "É perfil simulado de apoio; não substitui a Diretoria."],
    humanReview: "A recomendação sempre exige revisão humana; a decisão final é da Diretoria ou da pessoa responsável.",
  },
  {
    id: "experts.curadoria.divergencias",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Divergências entre especialistas",
    shortDescription: "Lista o tema em que as posições dos especialistas diferem, cada posição e o provável motivo.",
    description:
      "Cada item traz o tema, as posições de cada especialista (nome e posição) separadas por ×, e o provável motivo da diferença. O CEO IA registra a divergência explicitamente e nunca escolhe um vencedor em silêncio. Sem divergência aparece Nenhuma divergência registrada.",
    missingData: "Sem divergências aparece a frase de nenhuma divergência registrada; isso não indica concordância total, apenas que nenhuma foi identificada.",
    humanReview: "Divergência entre especialistas é um ponto para decisão humana.",
  },
  {
    id: "experts.curadoria.riscos-consolidados",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Riscos consolidados",
    shortDescription: "Riscos apontados pelos especialistas reunidos pelo CEO IA em uma lista única.",
    description:
      "Lista dos riscos que o CEO IA reuniu a partir dos pareceres. Não é uma avaliação independente: reflete o que os especialistas consultados indicaram. Sem itens aparece Nenhum risco consolidado.",
    missingData: "Lista vazia significa que nenhum risco foi consolidado a partir dos pareceres, não que o risco seja zero.",
    humanReview: "Confira cada risco no parecer do especialista que o originou.",
  },
  {
    id: "experts.curadoria.recomendacao",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Recomendação do CEO IA",
    shortDescription: "Recomendação consolidada, sempre sujeita a revisão humana, nunca uma ordem nem uma decisão.",
    description:
      "Texto de recomendação do CEO IA sobre como tratar o assunto, considerando os pareceres e as divergências. É uma recomendação diferenciada de fato e de inferência dos pareceres e não executa nenhuma ação: nada é alterado no alerta, no responsável, no SLA ou nas providências.",
    humanReview: "Sujeita a revisão humana; a decisão e a execução cabem às pessoas responsáveis.",
  },
  {
    id: "experts.curadoria.decisoes-humanas",
    kind: "message",
    module: MODULE,
    version: VERSION,
    title: "Incertezas e decisões humanas necessárias",
    shortDescription: "Pontos que a IA não pode resolver e dependem de uma pessoa: dados faltantes, escolhas e confirmações.",
    description:
      "Lista de itens que ficam em aberto para decisão humana: incertezas, informações que faltam e escolhas entre alternativas. Sem itens aparece Nenhuma registrada.",
    purpose: "Deixar explícito o limite da análise automatizada e o que a equipe precisa decidir ou confirmar.",
    missingData: "Lista vazia indica que o CEO IA não registrou pendências humanas, o que não dispensa a revisão humana obrigatória.",
    humanReview: "Cada item deve ser tratado e registrado por pessoa autorizada.",
  },
];
