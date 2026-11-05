// Primeiro lote do Q&A da AXIA — 20 entradas APROVADAS para integração (classificadas PRONTAS em docs/qa-axia-lote-1.md).
//
// Fonte das respostas: docs/qa-axia-lote-1.md (texto aprovado) e Manual do ACC (seção citada em manualSection).
// As 18 entradas restantes do lote (N1, N3, N4, N5, N6, R2, R6, R8, R9, R10, R11, E5, E6, E8, E10, X7, X8, X9)
// continuam em revisão e NÃO estão aqui: perguntas sobre elas seguem o encaminhamento para a Ajuda.
//
// Palavras-chave em minúsculas e sem acento (mesma convenção de knowledge.ts). Texto puro, sem I/O.

import type { AssistantEntry } from "./knowledge";

const AJUDA = [{ label: "Ajuda e tutorial", path: "ajuda" }];

export const APPROVED_BATCH_1_IDS = [
  "N2", "N7", "N8", "R1", "R3", "R4", "R5", "R7", "E1", "E2", "E3", "E4", "E7", "E9",
  "X1", "X2", "X3", "X4", "X5", "X6",
] as const;

export const APPROVED_BATCH_1_ENTRIES: AssistantEntry[] = [
  {
    id: "qa-N2",
    title: "Como entro no ACC e escolho a obra?",
    keywords: [
      "como entro no acc", "entrar com google", "nao consigo entrar", "como troco de obra", "trocar de obra", "login", "como entro", "entrar no acc",
      "escolher a obra", "selecione um projeto", "conta corporativa", "dominio axion", "sair do acc",
    ],
    summary:
      "Abra o endereço do ACC e clique em Entrar com Google, usando a conta corporativa do domínio axion.com.br; contas de outro domínio são recusadas. Em Selecione um projeto, clique no cartão da obra: o Dashboard abre. Para trocar de obra, use o seletor de projeto na barra de cima. O ícone Sair encerra a sessão. Se a sua obra não aparece, o acesso é concedido por obra pelo Administrador, na tela Usuários.",
    steps: [],
    links: [{ label: "Usuários e permissões", path: "usuarios" }],
    tutorialSlide: null,
    manualSection: "4.1 (fluxo principal, passos 1 a 6; permissões)",
    coverage: "completa",
  },
  {
    id: "qa-N7",
    title: "Onde fica o tutorial e como falo com a AXIA?",
    keywords: [
      "onde esta o tutorial", "onde fica o tutorial", "onde esta o manual", "onde fica o manual", "como peco ajuda",
      "a axia fala", "fale com a axia", "axia fala", "abrir o tutorial", "tutorial completo",
    ],
    summary:
      "O tutorial está em Ajuda e tutorial, em PDF (consulta) e PowerPoint (editável). O botão Fale com a AXIA, na barra de cima, abre a conversa por texto e traz o link “Abrir o tutorial completo”. A AXIA ensina a usar o ACC; ela não lê os dados da sua obra e não altera nada. A leitura em voz fica para uma fase futura.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "4.33; 4.34; 8.5",
    coverage: "completa",
  },
  {
    id: "qa-N8",
    title: "O que é a faixa “SISTEMA EM TESTE”?",
    keywords: ["sistema em teste", "faixa de teste", "faixa sistema em teste", "aviso de teste", "fase de testes"],
    summary:
      "É o aviso de que o sistema está em fase de testes. Aparece em todas as páginas e só some por configuração e novo deploy, não por data.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "1; 4.1",
    coverage: "completa",
  },
  {
    id: "qa-R1",
    title: "O que significam os graus de risco?",
    keywords: [
      "graus de risco", "grau de risco", "o que e critico", "o que e risco critico", "diferenca entre alto e medio",
      "criterios de risco", "niveis de risco", "quatro niveis", "o que significa risco alto",
    ],
    summary:
      "Crítico: risco iminente de descumprimento e penalização contratual, com necessidade de ação imediata. Alto: iminente, mas ainda há tempo para mitigação. Médio: possível consequência a médio prazo. Baixo: risco processual, de acompanhamento e organização. Não existe um número fixo de dias que separe os níveis. A sugestão automática só indica um grau quando os dados permitem; toda classificação exige revisão humana com justificativa.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "6.5 (Os quatro níveis)",
    coverage: "completa",
  },
  {
    id: "qa-R3",
    title: "Como o sistema sugere o grau?",
    keywords: [
      "como o sistema sugere o grau", "sugestao de grau", "sugere o grau", "grau indeterminado",
      "por que o grau ficou indeterminado", "o que a sugestao considera", "sugestao automatica de risco",
    ],
    summary:
      "A sugestão é uma regra determinística, sem IA. Ela considera a natureza do risco (descumprimento contratual ou processual), a obrigação e a cláusula verificada, a penalidade (só conta se houver descrição e cláusula verificada), a situação do prazo (vencido, a vencer, sem prazo) e dois fatos declarados por pessoa autorizada: se é iminente e se há tempo para mitigação. Se faltar informação, o sistema não escolhe: mostra a faixa de níveis possíveis e o que falta confirmar.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "6.3; 6.5 (linha “sem nível”)",
    coverage: "completa",
  },
  {
    id: "qa-R4",
    title: "De onde nasce um risco?",
    keywords: [
      "de onde nasce um risco", "como nasce um risco", "como o contrato vira alerta", "contrato vira alerta",
      "candidato a clausula", "candidatos a clausula", "confronto evento clausula", "quando a pessoa precisa revisar",
    ],
    summary:
      "O sistema lê o contrato e os aditivos (com OCR nas páginas digitalizadas), detecta candidatos a cláusula, e uma pessoa aprova ou rejeita cada um (intervenção humana nº 1). Um evento nasce por triagem de e-mail, candidato aprovado ou obrigação ESG/SSMA; o sistema propõe um confronto evento × cláusula, que uma pessoa aprova ou rejeita (nº 2). A severidade do evento e o grau são revisados por pessoa autorizada (nº 3). O alerta só sai depois desses passos, com o texto original preservado.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "6.2 (passos 1 a 9)",
    coverage: "completa",
  },
  {
    id: "qa-R5",
    title: "O que acontece com cláusula ambígua, OCR parcial ou falta de prazo?",
    keywords: [
      "clausula ambigua", "ocr parcial", "falta de prazo", "cobertura parcial", "classificacao ambigua",
      "pagina nao lida", "sem prazo calculado", "selo conferir",
    ],
    summary:
      "Cláusula ambígua: o detector reduz a confiança e a lista mostra o selo “conferir” com os motivos; a pessoa aprova, edita ou rejeita. Classificação ambígua: o sistema devolve a faixa de níveis e o que confirmar. OCR parcial: o ACC marca a página não lida, avisa “cobertura parcial” e mantém a versão em revisão humana; não trate como leitura integral. Falta de prazo: “desconhecido” entra em “Informações que faltam”; uma providência sem data fica sem prazo calculado até alguém preencher.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "6.6 (Casos especiais)",
    coverage: "completa",
  },
  {
    id: "qa-R7",
    title: "O prazo vale também para Médio e Baixo?",
    keywords: [
      "prazo vale para medio e baixo", "prazo para medio e baixo", "prazo de medio e baixo", "medio e baixo escalonam",
      "medio e baixo sobem", "consolidado semanal prazo", "prazo para assumir medio",
    ],
    summary:
      "O prazo existe para os quatro graus, mas só Alto e Crítico passam pelo escalonamento por prazo no ciclo automático. Para Médio e Baixo, o prazo vale em ações manuais e aparece como “Prazo para assumir” no consolidado semanal.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "6.7.1 (ressalva b); 7.2 (item 9)",
    coverage: "completa",
  },
  {
    id: "qa-E1",
    title: "Qual a diferença entre os dois mecanismos de escalonamento?",
    keywords: [
      "o que e escalonar", "escalonamento e lembrete", "mecanismos de escalonamento", "dois mecanismos de escalonamento",
      "diferenca entre escalonamento e lembrete", "mecanismo a e b", "o que e escalonamento",
    ],
    summary:
      "Mecanismo A — alertas de risco e ações SLA: o alerta sobe por hierarquia (Nível 1, depois Nível 2 da gerência, depois Nível 3 da Diretoria, depois o limite), conforme os prazos da Matriz de SLA. Mecanismo B — acompanhamento recorrente: manda lembretes ao responsável atual a cada 1, 2, 4 ou 7 dias, sem hierarquia. A matriz de prazos (1 h, 4 h úteis, 1 dia útil, 3 dias úteis) é do mecanismo A; os intervalos de 1/2/4/7 dias são do B.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "7.1",
    coverage: "completa",
  },
  {
    id: "qa-E2",
    title: "Como o alerta sobe de nível? (mecanismo A)",
    keywords: [
      "como o alerta sobe de nivel", "alerta sobe de nivel", "como sobe de nivel", "sobe ao nivel 2", "nivel 1 nivel 2 nivel 3",
      "marcos de escalonamento", "t0 do alerta", "quando o alerta sobe para a diretoria", "alerta sobe para a diretoria",
    ],
    summary:
      "O Nível 1 é o responsável da área, definido na Matriz de responsabilidades. A contagem começa em T0, quando o ciclo automático detecta o caso. Enquanto o responsável não assume, valem três marcos, cada um contado a partir do vencimento calculado do anterior (e não do horário em que o e-mail saiu). Para Crítico no padrão (1 h, +1 h, +2 h, horas corridas), desde T0:",
    steps: [
      "Nível 2 (gerência): em +1 h — vence o prazo para assumir.",
      "Diretoria (Nível 3): em +2 h — o primeiro intervalo (1 h) conta do marco anterior.",
      "Limite de escalonamento atingido: em +4 h — o segundo intervalo (2 h) conta do marco da Diretoria.",
      "Exemplo com T0 às 14:20: Nível 2 às 15:20, Diretoria às 16:20, limite às 18:20.",
      "No padrão, o total até o limite é de 12 h úteis em Alto, 3 dias úteis em Médio e 8 dias úteis em Baixo. No ciclo automático, só Alto e Crítico sobem por prazo; cada obra pode ter valores próprios.",
    ],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "7.2 (itens 1 a 4 e 9); 6.7.1 (Tabela 1); Anexo F",
    coverage: "completa",
  },
  {
    id: "qa-E3",
    title: "O que é “Limite de escalonamento atingido”?",
    keywords: [
      "limite de escalonamento atingido", "limite de escalonamento", "limite atingido", "top level reached",
    ],
    summary:
      "Significa que a Diretoria também deixou o prazo vencer. Não é um nível, não tem destinatário e não envia e-mail: o ACC só registra uma vez e mostra a mensagem na tela.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "7.2.1",
    coverage: "completa",
  },
  {
    id: "qa-E4",
    title: "O que muda se eu responder o alerta?",
    keywords: [
      "o que muda se eu responder o alerta", "responder o alerta", "responder alerta", "tomando providencias",
      "enviar para outro responsavel", "resolvido no alerta", "confirmar resolucao", "como resolvo o alerta",
    ],
    summary:
      "Resolvido: exige confirmação, justificativa se a Matriz exigir e, em Alto e Crítico, evidência; o caso vai à revisão humana e só Confirmar resolução o encerra; não escala. Tomando providências: marca como assumido e, em Alto/Crítico, escala imediatamente ao próximo nível; o alerta continua aberto. Enviar para: troca o responsável (também escala em Alto/Crítico); sem ação do encaminhado no prazo, volta ao anterior. Especialista e Outro: também escalam em Alto/Crítico. Depois da primeira ação humana, a subida por tempo para, salvo se a Matriz tiver prazos de responder ou concluir.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "7.3 (tabela de respostas)",
    coverage: "completa",
  },
  {
    id: "qa-E7",
    title: "E se não houver Nível 2 ou destinatário cadastrado?",
    keywords: [
      "nao houver nivel 2", "sem nivel 2", "nivel 2 nao cadastrado", "destinatario nao cadastrado",
      "destinatario ausente", "sem destinatario", "revisao de configuracao necessaria", "matriz de responsabilidades",
    ],
    summary:
      "Se o Nível 2 não está cadastrado, o aviso vai direto ao Nível 3. Se falta o Nível 1 ou o Nível 3, nenhum e-mail sai e o sistema registra “revisão de configuração necessária”. Destinatário sem e-mail na hora do envio gera falha registrada. O Administrador corrige na Matriz de responsabilidades.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "7.2 (item 7); 7.7 (Destinatário ausente)",
    coverage: "completa",
  },
  {
    id: "qa-E9",
    title: "O que faz o botão “Verificar escalonamentos”?",
    keywords: [
      "verificar escalonamentos", "botao verificar escalonamentos", "botao de verificar escalonamentos", "0 escaladas",
    ],
    summary:
      "Varre as ações abertas de qualquer grau e escala as que passaram do prazo, sem duplicar avisos. Exige perfil Administrador; para outros perfis a tela mostra o botão, mas o resultado é “0 escaladas”. Ele não depende da rotina automática.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "7.3; 4.9",
    coverage: "completa",
  },
  {
    id: "qa-X1",
    title: "Quais especialistas existem?",
    keywords: [
      "quais especialistas", "quais especialistas existem", "o que e experts ia", "experts ia", "ceo ia",
      "o que faz o ceo ia", "especialistas de ia", "especialistas do acc",
    ],
    summary:
      "Existem 5 especialistas de IA no ACC: CEO IA, Diretor Comercial IA, Consultor Jurídico IA, Diretor de Planejamento IA e Diretor de ESG IA. Todos respondem em modo de leitura, e toda resposta exige revisão humana. O CEO IA consolida as posições dos demais e não tem tela própria. As skills do repositório não são especialistas do produto. A AXIA não é um especialista.",
    steps: [],
    links: [{ label: "Experts IA", path: "experts-ia" }],
    tutorialSlide: null,
    manualSection: "8.1; 8.2",
    coverage: "completa",
  },
  {
    id: "qa-X2",
    title: "Quando uso a AXIA e quando abro um especialista?",
    keywords: [
      "quando uso a axia", "axia ou especialista", "quando abro um especialista", "axia e especialista",
      "qual especialista devo usar", "curadoria multiagente", "acao especialista", "quando usar um especialista",
    ],
    summary:
      "Use a AXIA para dúvidas de uso do sistema (“como faço”, “o que significa”, “onde fica”). Abra o especialista para analisar a obra: Consultor Jurídico para contrato e aditivos; Diretor Comercial para estratégia, aditivo, medição e pagamento (pelo Evento); Diretor de Planejamento para prazo e atraso; Diretor de ESG para obrigações SSMA/ESG. Para dúvida sobre um alerta específico, use a ação ESPECIALISTA do alerta; para assunto que cruza áreas, a curadoria multiagente.",
    steps: [],
    links: [{ label: "Experts IA", path: "experts-ia" }],
    tutorialSlide: null,
    manualSection: "8.3 (tabela)",
    coverage: "completa",
  },
  {
    id: "qa-X3",
    title: "A AXIA consulta os especialistas ou lê os dados da obra?",
    keywords: [
      "axia consulta os especialistas", "axia le os dados da obra", "axia le os dados", "axia usa ia generativa",
      "a axia consulta", "axia encaminha ao especialista", "base curada da axia",
    ],
    summary:
      "Não. A AXIA responde com uma base curada do tutorial e da ajuda, sem IA generativa, não lê dados da obra, não grava nada e não encaminha a um especialista. Ela cita um link de módulo e, quando existe, o slide do tutorial.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "8.5",
    coverage: "completa",
  },
  {
    id: "qa-X4",
    title: "O especialista altera dados ou envia e-mails?",
    keywords: [
      "especialista altera dados", "especialista envia emails", "especialista envia e-mails", "especialista grava",
      "avaliar risco de atraso", "especialista resolve o alerta", "o especialista altera", "especialista escala",
    ],
    summary:
      "Os especialistas apenas respondem. Há três registros que gravam algo, sem alterar contrato, cronograma, e-mail ou prazo: o botão “Avaliar risco de atraso” (registra a avaliação e a auditoria), a curadoria multiagente (registra auditoria) e a ação ESPECIALISTA no alerta (registra a resposta na conversa do alerta). A resposta não resolve nem escala o alerta sozinha.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "8.4",
    coverage: "completa",
  },
  {
    id: "qa-X5",
    title: "Quem pode consultar um especialista?",
    keywords: [
      "quem pode consultar um especialista", "quem pode usar os especialistas", "quem consulta especialista",
      "perfil para consultar especialista", "leitura pode consultar especialista", "quem acessa os especialistas",
    ],
    summary:
      "Qualquer membro ativo da obra, inclusive Leitura, pode consultar; o acesso é isolado por obra. A curadoria multiagente e a avaliação de atraso exigem perfil Gerente, Gestor ou Administrador (na tela da avaliação, o botão é do Administrador).",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "8.1 (“Perfis”); 8.2 (linha “Perfis”)",
    coverage: "completa",
  },
  {
    id: "qa-X6",
    title: "Como confiro a resposta de um especialista?",
    keywords: [
      "como confiro a resposta de um especialista", "conferir resposta do especialista", "conferir a resposta do especialista",
      "base contratual do especialista", "fontes utilizadas", "fatos documentados", "resposta do especialista confiavel",
    ],
    summary:
      "A resposta separa fatos documentados, interpretação (sugestão, não fato), riscos, recomendações e informações faltantes. Confira a Base contratual (documento, cláusula e trecho) abrindo a cláusula citada, e as Fontes utilizadas quando houver. Rascunhos ficam pendentes de revisão humana; nada é enviado. A tela indica se o provedor é IA real ou modo de teste.",
    steps: [],
    links: AJUDA,
    tutorialSlide: null,
    manualSection: "8.1 (“Fonte da resposta”); 8.6",
    coverage: "completa",
  },
];

/**
 * Perguntas das entradas EM REVISÃO. Se a pergunta casar com um destes padrões (texto normalizado), a AXIA não responde
 * com nenhuma entrada (nem do lote 1, nem do texto genérico antigo): encaminha como pergunta sem resposta aprovada.
 */
export const PENDING_REVIEW_PATTERNS: RegExp[] = [
  /quem (define|decide|pode (mudar|alterar|reclassificar|registrar)|reclassifica|revisa).*(grau|risco|nivel)/, // R2
  /(reclassificar|reclassifica|reclassificado)/, // R2, R10
  /(prazo|sla).*(feriado|fim de semana|sabado|domingo)|(feriado|fim de semana).*(prazo|sla)/, // E6, R6
  /(como|quando) .*(alerta|aviso) .*(e enviado|enviado|chega)/, // R8, R9, E5
  /\bsla\b|matriz de prazos/, // E10 (configuração da matriz); prazos por grau são respondidos por E2/R7 (guards.ts)
  /(quais|quantos) (sao )?(os )?perfis|\bperfis\b.*\b(pode|podem|diferenca)\b|diferenca entre (gerente|gestor|colaborador|administrador|leitura)/, // N4
];
