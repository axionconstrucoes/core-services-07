// Base de conhecimento da VERA — Assistente ACC (piloto).
//
// Conteúdo CURADO e estático, derivado do tutorial publicado (ACC-apresentacao-e-tutorial) e da ajuda
// contextual (lib/ui/feature-help.ts). Não contém dados de nenhuma obra, contrato ou usuário: é o mesmo texto
// de orientação para qualquer obra. Isso garante dois limites do piloto:
//   1. a resposta nunca depende de dados confidenciais (isolamento entre obras por construção);
//   2. só texto de ajuda — nunca conteúdo contratual — pode ser enviado ao serviço de voz.
//
// Puro, sem I/O, sem "server-only": testável por script Node (mesmo padrão de lib/ui/feature-help.ts).

import { EMAIL_AUTH_FILTERS, GMAIL_OAUTH_SCOPE, GOOGLE_PERMISSIONS_URL } from "../email-authorization/notice";

export interface AssistantLink {
  label: string;
  /** Caminho relativo à obra, sem barra inicial (ex.: "documentos"). */
  path: string;
}

export interface AssistantEntry {
  id: string;
  title: string;
  /** Frases e palavras que indicam este assunto (sem acento, minúsculas). */
  keywords: string[];
  /** Resposta curta, em linguagem simples. */
  summary: string;
  /** Passos práticos; vazio quando o assunto é só conceito. */
  steps: string[];
  links: AssistantLink[];
  /** Slide do tutorial que detalha o assunto. */
  tutorialSlide: number | null;
}

export const ASSISTANT_ENTRIES: AssistantEntry[] = [
  {
    id: "acesso",
    title: "Entrar no ACC e escolher a obra",
    keywords: ["entrar", "login", "acessar", "acesso", "senha", "google", "conta", "escolher obra", "trocar de obra", "selecionar obra", "nao vejo a obra", "nao aparece a obra"],
    summary:
      "O ACC usa somente a conta Google corporativa; não existe senha própria do ACC. Depois de entrar, você vê apenas as obras de que participa.",
    steps: [
      "Abra acc.axion.com.br e toque em entrar com Google.",
      "Escolha a obra no cartão da tela de seleção; o menu lateral mostra os módulos da obra.",
      "Se uma obra não aparece, a sua conta ainda não foi liberada nela: peça a um administrador da obra em Usuários.",
    ],
    links: [{ label: "Usuários e permissões", path: "usuarios" }],
    tutorialSlide: 5,
  },
  {
    id: "documentos",
    title: "Enviar documentos e anexos",
    keywords: ["documento", "documentos", "enviar documento", "upload", "anexo", "anexos", "contrato", "aditivo", "versao", "nova versao", "vincular", "arquivo", "arquivos", "subir arquivo"],
    summary:
      "Em Documentos você envia vários arquivos de uma vez (até 50 MB cada), acompanha as versões e vincula anexos ao contrato.",
    steps: [
      "Abra Documentos no menu da obra.",
      "Use “Selecionar arquivos” para enviar vários de uma vez; o “Upload individual (avançado)” serve para escolher tipo e versão manualmente.",
      "Cada documento aparece em um cartão com suas versões e a situação: Processado, Aguardando processamento ou Revisão humana necessária.",
      "Para vincular um anexo ao contrato, informe o fundamento (mínimo de 20 caracteres).",
    ],
    links: [{ label: "Documentos", path: "documentos" }],
    tutorialSlide: 7,
  },
  {
    id: "clausulas",
    title: "Revisar cláusulas detectadas",
    keywords: ["clausula", "clausulas", "revisao de clausulas", "revisar clausula", "aprovar clausula", "rejeitar", "candidato", "deteccao"],
    summary:
      "A detecção apenas sugere cláusulas. A cláusula definitiva só existe depois da aprovação humana, conferida com a página original.",
    steps: [
      "Abra Documentos e vá à revisão de cláusulas.",
      "Escolha um candidato da fila e confira número, título, texto e a página de origem.",
      "Corrija o texto se preciso e use “Aprovar cláusula”; para recusar, “Rejeitar candidato” exige uma justificativa.",
      "Todas as decisões ficam na auditoria.",
    ],
    links: [{ label: "Revisão de cláusulas", path: "revisao-clausulas" }],
    tutorialSlide: 8,
  },
  {
    id: "criterios-risco",
    title: "Graus de risco e o que significam",
    keywords: ["risco", "grau", "graus", "critico", "alto", "medio", "baixo", "criterio", "criterios", "classificacao", "classificar", "severidade"],
    summary:
      "Crítico: risco iminente de descumprimento e penalização contratual, que exige ação imediata. Alto: iminente, mas com tempo para mitigação. Médio: possível consequência a médio prazo. Baixo: risco processual, de acompanhamento ou de organização.",
    steps: [
      "Não há um número fixo de dias que separe os graus; o sistema não inventa esse limite.",
      "A sugestão automática só indica um grau quando os dados permitem; toda classificação exige revisão humana com justificativa.",
      "Para reclassificar, abra o evento em EVENTOS e use “Registrar classificação”; o histórico é imutável.",
    ],
    links: [{ label: "EVENTOS", path: "ledger" }],
    tutorialSlide: 9,
  },
  {
    id: "cores-repeticao",
    title: "Cores dos alertas e repetição dos lembretes",
    keywords: ["cor", "cores", "vermelho", "amarelo", "repeticao", "repete", "lembrete", "lembretes", "intervalo", "intervalos", "a cada", "frequencia", "quantos dias"],
    summary:
      "Crítico é vermelho e repete a cada 1 dia; Alto é amarelo e repete a cada 2 dias; Médio repete a cada 4 dias; Baixo, a cada 7 dias. Os lembretes continuam até a conclusão.",
    steps: [
      "A contagem usa dias corridos, nunca dias úteis.",
      "O texto “Repete: a cada N dia(s) até a conclusão” aparece em cada alerta.",
      "O agendador pode atrasar algumas horas; execuções atrasadas enviam um lembrete por alerta, sem acumular.",
    ],
    links: [],
    tutorialSlide: 10,
  },
  {
    id: "alertas-resposta",
    title: "Responder aos alertas e respostas parciais",
    keywords: ["alerta", "alertas", "responder", "resposta", "resposta parcial", "parcial", "acao obrigatoria", "confirmar tudo", "lote", "email de alerta", "salvar acao", "responder ao acc"],
    summary:
      "Os alertas de uma obra chegam agrupados em um e-mail. Cada alerta recebe uma ação obrigatória; você pode salvar aos poucos e só confirma tudo quando todos tiverem ação.",
    steps: [
      "Abra o link do e-mail; o ACC pede login e leva à tela certa.",
      "Em cada alerta escolha a ação (por exemplo Resolvido, Em andamento ou Enviado para outra pessoa) e use “Salvar esta ação”.",
      "O painel mostra quantos alertas já foram respondidos (por exemplo 2 de 4).",
      "“Confirmar tudo” só fica disponível depois que todos os alertas tiverem ação; abrir o link por si só não registra nada.",
    ],
    links: [{ label: "EVENTOS", path: "ledger" }],
    tutorialSlide: 13,
  },
  {
    id: "consultar-ia",
    title: "CONSULTAR IA em um alerta",
    keywords: ["consultar ia", "consultar", "especialista", "ia", "inteligencia artificial", "pergunta ao especialista", "como mitigar"],
    summary:
      "CONSULTAR IA parte sempre de um alerta da sua obra e pede a opinião de um especialista (Contratual/Jurídico, Engenharia, Planejamento e Prazo, SSMA, Documentação e Entrega ou Geral).",
    steps: [
      "No e-mail ou na tela do alerta, toque em CONSULTAR IA.",
      "Confira o especialista sugerido para a sua área e edite a pergunta se quiser.",
      "Toque em Consultar. A consulta só lê: não altera o alerta e não registra providência.",
      "A resposta separa interpretação (sugestão, não fato), fatos documentados, base legal, riscos e recomendações, e exige revisão humana.",
    ],
    links: [],
    tutorialSlide: 15,
  },
  {
    id: "providencias",
    title: "Providências, prazos e CNO",
    keywords: ["providencia", "providencias", "prazo", "prazos", "cno", "entrega", "d-60", "d60", "nova providencia", "responsavel", "protocolo", "concessionaria"],
    summary:
      "Providências são os itens necessários para a entrega da obra. Os alertas de entrega começam 60 dias corridos antes do término previsto, ou no prazo individual se vencer antes.",
    steps: [
      "Abra Providências e use “Nova providência” (nasce com grau Médio provisório).",
      "Informe responsável, prazo, situação e evidência em Editar; selos como “Sem responsável” e “Sem prazo” mostram o que falta.",
      "CNO: o prazo de referência é o início das atividades mais 30 dias, e fica como “estimado” até o início ser confirmado.",
      "Mudar o término previsto recalcula os marcos e grava o histórico.",
    ],
    links: [{ label: "Providências", path: "providencias" }],
    tutorialSlide: 17,
  },
  {
    id: "ssma-instalar",
    title: "Instalar o SSMA no celular",
    keywords: ["ssma", "instalar", "celular", "aplicativo", "app", "pwa", "iphone", "android", "qr", "qr code", "tela inicial", "campo"],
    summary:
      "O app de campo do SSMA instala direto do navegador, sem loja de aplicativos. O QR Code leva só ao endereço; quem escaneia ainda entra com a própria conta.",
    steps: [
      "No ACC, abra os Registros de campo SSMA e use “Instalar no celular”.",
      "iPhone (Safari): Compartilhar, depois “Adicionar à Tela de Início”.",
      "Android (Chrome): menu, depois “Instalar app” ou “Adicionar à tela inicial”.",
      "A instalação ainda não foi validada em iPhone e Android reais.",
    ],
    links: [{ label: "Registros SSMA", path: "ssma-registros" }],
    tutorialSlide: 19,
  },
  {
    id: "ssma-registrar",
    title: "Registrar ocorrência ou inspeção no SSMA",
    keywords: ["registrar ocorrencia", "ocorrencia", "inspecao", "registro de campo", "foto", "fotos", "acao corretiva", "andamento", "concluir acao", "sincronizar", "sincronizacao"],
    summary:
      "No app do SSMA você registra ocorrência ou inspeção com categoria, descrição, local, data e hora, risco, fotos, responsável e prazo. Funciona sem sinal e envia quando a internet voltar.",
    steps: [
      "Abra o app, escolha a obra e toque em “Registrar ocorrência / inspeção”.",
      "Preencha os campos obrigatórios e anexe fotos JPG ou PNG (até 15 MB e 20 por registro; HEIC não é aceito).",
      "O registro passa por Salvo no aparelho, Aguardando envio e Sincronizado.",
      "Registrar andamento e concluir ação corretiva exigem internet; concluir exige foto de evidência (um gestor pode concluir com justificativa de 10 caracteres ou mais).",
    ],
    links: [{ label: "Registros SSMA", path: "ssma-registros" }],
    tutorialSlide: 20,
  },
  {
    id: "sem-internet",
    title: "O que funciona sem internet",
    keywords: ["sem internet", "offline", "sem sinal", "sem conexao", "sem rede", "internet"],
    summary:
      "Sem sinal, o app do SSMA ainda registra ocorrências e inspeções (com fotos) e mantém tudo salvo no aparelho. Para entrar, ver a lista da obra, registrar andamento, concluir ações ou consultar a IA é preciso internet.",
    steps: [
      "Abra o app uma vez com internet antes de usar sem sinal.",
      "O envio é automático quando o sinal volta, sem duplicar.",
      "O iOS pode apagar dados de apps pouco usados; não deixe registros pendentes por muito tempo.",
    ],
    links: [],
    tutorialSlide: 22,
  },
  {
    id: "permissoes",
    title: "Permissões e quem vê o quê",
    keywords: ["permissao", "permissoes", "perfil", "administrador", "gerente", "colaborador", "usuario", "usuarios", "adicionar usuario", "liberar acesso", "nao consigo", "sem acesso", "restrito"],
    summary:
      "Há três perfis por obra: Administrador, Gerente e Colaborador. Itens restritos, como Financeiro e Start-up ACC, só aparecem a quem tem acesso.",
    steps: [
      "Administradores adicionam e editam pessoas em Usuários, onde também ficam a matriz de responsabilidades e os prazos por grau de risco.",
      "Se você não vê um módulo, o seu perfil não tem acesso a ele nesta obra.",
    ],
    links: [{ label: "Usuários", path: "usuarios" }],
    tutorialSlide: 24,
  },
  {
    id: "ajuda-tutorial",
    title: "Tutorial e ajuda do ACC",
    keywords: ["tutorial", "ajuda", "manual", "apresentacao", "pdf", "pptx", "powerpoint", "como usar", "baixar tutorial", "treinamento"],
    summary:
      "O tutorial completo do ACC está em “Ajuda e tutorial”: o PDF abre para consulta e o PowerPoint pode ser baixado para edição. Os ícones ⓘ nas telas explicam cada módulo.",
    steps: ["Abra “Ajuda e tutorial” no menu lateral da obra e escolha PDF ou PowerPoint."],
    links: [{ label: "Ajuda e tutorial", path: "ajuda" }],
    tutorialSlide: 3,
  },
  {
    id: "dashboard",
    title: "Dashboard e o selo das integrações",
    keywords: ["dashboard", "painel", "selo", "sistema operacional", "operacao parcial", "integracoes parciais", "integracao", "integracoes", "nao operacional", "falha em integracao", "indicadores"],
    summary:
      "O Dashboard é a visão executiva da obra. O selo do cabeçalho mede as integrações: “Integrações ativas” quando todas estão ativas, “Integrações parciais” quando alguma está pendente ou pede atenção (o selo diz qual), e “Falha em integração” quando uma fonte está com erro. Ele não indica que o ACC esteja fora do ar.",
    steps: ["Passe o mouse sobre o selo ou leia o texto abaixo dele para ver quais integrações estão pendentes."],
    links: [{ label: "Dashboard", path: "dashboard" }],
    tutorialSlide: null,
  },
  {
    id: "vera",
    title: "Quem é a VERA",
    keywords: ["vera", "quem e voce", "quem e a vera", "assistente", "voce faz", "o que voce faz", "seu nome"],
    summary:
      "Sou a VERA, a Assistente ACC. Oriento sobre o uso do ACC com base no tutorial e na ajuda do sistema. Não altero dados, não aprovo nem envio nada: quem executa as ações é você, com o seu perfil.",
    steps: ["Posso explicar módulos, alertas, graus de risco, providências, SSMA e a autorização de e-mails.", "Quando eu não souber, indico como consultar o administrador da obra."],
    links: [],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-finalidade",
    title: "Para que serve a autorização de e-mails",
    keywords: ["autorizacao", "autorizar", "autorizacao de e mail", "autorizacao de acesso", "acesso aos emails", "para que serve", "finalidade", "por que preciso autorizar", "consentimento"],
    summary:
      "A autorização é o seu consentimento para o ACC usar a sua conta de e-mail corporativa em uma obra específica: registrar as comunicações e anexos relacionados ao contrato, formar a linha do tempo e gerar alertas. Cada obra tem a sua própria autorização.",
    steps: [
      "Você responde dentro do ACC, com login: abrir o link do e-mail não registra nada.",
      "Seu aceite fica registrado com a data e a versão do texto apresentado.",
      "O aceite no ACC não conecta a conta Google sozinho: a conexão é feita à parte pelo administrador.",
    ],
    links: [],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-permissoes",
    title: "O que o ACC poderá ler na sua conta",
    keywords: ["permissao", "permissoes", "o que o acc le", "o que o acc pode ler", "o que o acc podera ler", "pode ler", "ler meus emails", "escopo", "gmail", "somente leitura", "envia email", "apaga", "caixa inteira", "toda a caixa"],
    summary:
      `A permissão do Google usada é “Ver e baixar seus e-mails (somente leitura)” (${GMAIL_OAUTH_SCOPE}). Com ela o ACC apenas lê mensagens e anexos: não envia e-mails pela sua conta, não apaga e não altera mensagens.`,
    steps: [
      "Atenção: essa permissão do Google não é limitada a uma obra. Tecnicamente ela permite ler a caixa inteira.",
      "Quem limita a leitura à obra são os filtros do próprio ACC (veja “Quais filtros o ACC aplica”), não o Google.",
    ],
    links: [],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-filtros",
    title: "Quais filtros o ACC aplica",
    keywords: ["filtro", "filtros", "quais filtros", "dominios", "palavras chave", "escopo da obra", "o que e guardado", "o que fica guardado", "mensagens pessoais", "emails pessoais", "privacidade"],
    summary: "Os filtros do ACC delimitam o que é mantido para a obra:",
    steps: [...EMAIL_AUTH_FILTERS],
    links: [],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-recusa",
    title: "O que acontece se eu não autorizar",
    keywords: ["recusar", "recusa", "nao autorizar", "nao quero autorizar", "se eu recusar", "se eu nao autorizar", "negar"],
    summary: "Sua recusa fica registrada (data, obra e conta) e visível aos administradores da obra. Ela não altera nada na sua conta Google.",
    steps: [
      "A recusa só é registrada depois que você confirma na página.",
      "A conexão da conta é feita separadamente pelo administrador. Em caso de dúvida sobre o que acontece depois da recusa, consulte o administrador da obra (a aba Usuários mostra quem são).",
    ],
    links: [{ label: "Usuários", path: "usuarios" }],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-revogacao",
    title: "Como revogar a autorização no ACC",
    keywords: ["revogar", "revogo", "revogue", "revogo a autorizacao", "revogar a autorizacao", "revogacao", "cancelar autorizacao", "desfazer autorizacao", "mudei de ideia", "retirar autorizacao", "parar de autorizar"],
    summary:
      "Depois de autorizar, você pode revogar a qualquer momento na própria página da autorização (botão “Revogar autorização desta obra”). Um administrador da obra também pode registrar a revogação pela aba Autorizações.",
    steps: [
      "A revogação fica no histórico, com data e autor, e vale para aquela obra.",
      "E-mails já registrados antes da revogação continuam preservados como evidência do contrato.",
      "Revogar no ACC não remove a permissão dada ao Google: veja “Como revogar a permissão no Google”.",
    ],
    links: [],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-google",
    title: "Como revogar a permissão no Google",
    keywords: ["revogar no google", "permissao no google", "remover acesso", "acesso de terceiros", "conta google", "myaccount", "remover o acc do google", "revogar permissao do google"],
    summary: "A permissão concedida ao Google é separada do aceite no ACC e precisa ser removida na sua conta Google.",
    steps: [
      `Acesse ${GOOGLE_PERMISSIONS_URL} com a sua conta, abra “Acesso de terceiros” e escolha o aplicativo do ACC.`,
      "Use “Remover acesso”.",
      "O administrador do Google Workspace da AXION também pode remover o acesso pelo Console de administração (Segurança › Controles de API).",
      "O nome exato do aplicativo é o que aparece na tela de consentimento do Google; se não o encontrar, consulte o administrador do ACC.",
    ],
    links: [],
    tutorialSlide: null,
  },
  {
    id: "autorizacao-conexao",
    title: "Aceite no ACC × conexão da conta Google",
    keywords: ["conexao", "conectada", "conta conectada", "diferenca", "aceite", "aceitei", "ja autorizei", "porque ainda nao conectou", "conexao da conta", "conectar a conta"],
    summary:
      "São duas coisas diferentes. O aceite é o seu consentimento, registrado no ACC por obra. A conexão da conta é a credencial do Google guardada nos segredos do servidor, feita pelo administrador; a situação dela aparece na aba Autorizações (conectada, não conectada, reautorização necessária ou erro).",
    steps: [
      "Aceitar no ACC não conecta a conta sozinho, e recusar ou revogar no ACC não remove a permissão no Google.",
      "Se o aceite está registrado mas a conta aparece como não conectada, consulte o administrador da obra.",
    ],
    links: [],
    tutorialSlide: null,
  },
];

/** Texto usado quando nenhum assunto corresponde à pergunta. */
export const ASSISTANT_FALLBACK = {
  id: "fallback",
  summary:
    "Não encontrei uma orientação específica para essa pergunta. Posso ajudar com: entrar e escolher a obra, documentos e cláusulas, graus de risco, alertas e respostas parciais, CONSULTAR IA, providências e CNO, SSMA no celular, permissões, a autorização de e-mails e o tutorial. Se a dúvida for sobre acesso ou permissões que eu não saiba responder, consulte o administrador da obra.",
  steps: ["Reformule a pergunta com uma dessas palavras ou abra o tutorial completo."],
} as const;

/** Texto exibido quando a pergunta pede para alterar dados — a assistente só orienta. */
export const ASSISTANT_READ_ONLY_NOTICE =
  "A VERA só orienta: ela não altera dados nem executa ações no sistema. Os passos abaixo mostram como fazer isso você mesmo, com o seu perfil.";

export function getAssistantEntry(id: string): AssistantEntry | null {
  return ASSISTANT_ENTRIES.find((entry) => entry.id === id) ?? null;
}
