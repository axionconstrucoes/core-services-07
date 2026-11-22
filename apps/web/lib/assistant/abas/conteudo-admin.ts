// Base por aba — parte 3: Integrações, Experts IA (só o USO das telas), administração, ajuda e temas transversais.
// A AXIA é o assistente de USO do ACC. As análises técnicas e contratuais são dos Experts IA: aqui só se ensina a abrir e usar
// as telas dos especialistas, sem nenhum conteúdo de especialista e sem criar dependência deles em relação à AXIA.

import { item, TEXTO_BLOQUEADA } from "./construtor";
import type { ItemConhecimento } from "./tipos";

export const ITENS_ADMIN: ItemConhecimento[] = [
  // ───────── Integrações ─────────
  item({
    id: "integracoes", nome: "Integrações", tipo: "menu", rota: "/[projectId]/integracoes", cap: "integracoes", acesso: "ADMINISTRADOR",
    fin: "Mostra e gerencia as fontes externas usadas pela obra: Gmail, Google Drive (somente ESG/SSMA) e demais conectores existentes, com a origem de cada fonte.",
    fun: ["Cartões por fonte com status e origem.", "Editar origem.", "Contas de e-mail AXION e configuração de ingestão.", "Prévia antes de importar e Confirmar sincronização.", "Verificação somente leitura da pasta SSMA/ESG."],
    ind: ["Status de cada fonte: ativo, atenção, erro ou pendente."],
    passos: ["Abra Integrações (Administrador).", "Confira os cartões de fonte.", "Para e-mail, registre a conta do domínio axion.com.br e salve a configuração de ingestão.", "Confira a prévia e confirme a sincronização."],
    regras: ["Contratos, aditivos, edital e serviços adicionais entram por upload manual do Administrador em Documentos.", "Drive de Orçamentos e Drive de Planejamento não estão integrados.", "Segredos de integração ficam no servidor e nunca aparecem nesta tela."],
    integ: ["Documentos, Timeline, Dashboard e ESG/SSMA."],
    q: [["O que a aba Integrações mostra?", "As fontes externas da obra (Gmail, Google Drive para ESG/SSMA e outras), cada uma com o status e a origem. Só o Administrador a vê. Contratos e aditivos não entram por aqui: entram por upload manual em Documentos.", ["aba integracoes", "tela integracoes", "fontes externas", "integracao gmail"]]],
    lim: ["Sem linha própria no roteiro de homologação autenticada."], ev: "Sem linha própria no roteiro; item restrito ao Administrador.", kw: ["aba integracoes", "tela integracoes", "fontes externas"],
    fontes: ["apps/web/app/[projectId]/integracoes/page.tsx", "apps/web/lib/ui/nav-items.ts", "docs/manual-referencia-acc.md (4.26)"],
  }),
  item({
    id: "integracoes.caixas", nome: "Caixas de e-mail da obra", tipo: "subaba", pai: "integracoes", rota: "/[projectId]/integracoes/caixas", cap: "integracoes", acesso: "ADMINISTRADOR",
    fin: "Diagnóstico por caixa de e-mail em sete etapas independentes, com as ações de autorização, habilitação e revogação.",
    fun: ["Ver as caixas e as sete etapas.", "Abrir uma caixa para ver evidências, ações e mensagens importadas."], ind: ["Estado de cada etapa: Comprovado, Indício, Parcial, Pendente, Bloqueado ou Indisponível."],
    passos: ["Abra Integrações e entre em Caixas de e-mail da obra.", "Leia o estado de cada etapa.", "Escolha uma caixa para ver os detalhes."],
    regras: ["Comprovado só com evidência própria; Indício nunca vale como prova."], integ: ["Autorizações e Integrações."],
    q: [["O que significa Indício nas caixas de e-mail?", "Indício é evidência indireta e nunca vale como prova: só o estado Comprovado tem evidência própria.", ["caixas de email da obra", "estado da etapa indicio", "caixas de email"]]],
    lim: ["Sem homologação em tela autenticada."], ev: "Sem linha própria no roteiro.", kw: ["caixas de email da obra", "diagnostico da caixa"], fontes: ["apps/web/app/[projectId]/integracoes/caixas/page.tsx", "apps/web/lib/ui/help/manifests/integracoes.ts"],
  }),
  item({
    id: "integracoes.contatos", nome: "Contatos externos monitorados", tipo: "subaba", pai: "integracoes", rota: "/[projectId]/integracoes/contatos-externos", cap: "integracoes", acesso: "ADMINISTRADOR",
    fin: "Cadastro das organizações e pessoas de fora da AXION que trocam e-mails com a obra, com domínios, contatos e o vínculo de cada uma com a obra.",
    fun: ["Cadastrar e consultar organizações, domínios e contatos."], ind: ["Papel e vínculo de cada organização na obra."], passos: ["Abra Contatos externos monitorados e consulte ou cadastre a organização."],
    regras: ["O cadastro é auditável."], integ: ["Sinais de e-mail e Caixas."],
    q: [["Para que servem os Contatos externos?", "Para cadastrar, de forma auditável, as organizações e pessoas de fora da AXION que trocam e-mails com a obra e o vínculo de cada uma com ela.", ["contatos externos monitorados", "contatos externos", "organizacoes externas"]]],
    lim: ["Sem homologação em tela autenticada."], ev: "Sem linha própria no roteiro.", kw: ["contatos externos", "organizacoes externas"], fontes: ["apps/web/app/[projectId]/integracoes/contatos-externos/page.tsx"],
  }),
  item({
    id: "integracoes.sinais", nome: "Sinais de risco de e-mail", tipo: "subaba", pai: "integracoes", rota: "/[projectId]/integracoes/sinais-email", cap: "integracoes", acesso: "ADMINISTRADOR",
    fin: "Lista indícios de risco extraídos de e-mails da obra, cada um para revisão humana: confirmar ou descartar.",
    fun: ["Confirmar ou descartar um sinal.", "Ver o pilar e a área do sinal."], ind: ["Pilar (Prazo, Custo, Segurança, Qualidade) e área de cada sinal."], passos: ["Abra Sinais de risco de e-mail.", "Leia o sinal e a origem.", "Confirme ou descarte, informando o motivo."],
    regras: ["O sinal é um indício, não um fato: exige revisão humana.", "Descartar ou revogar pede motivo."], integ: ["Eventos e alertas."],
    q: [["O que é um sinal de e-mail?", "É um indício de risco extraído de um e-mail da obra. Ele exige revisão humana: confirme ou descarte, informando o motivo.", ["sinais de risco de email", "sinais de email", "confirmar sinal"]]],
    lim: ["Sem homologação em tela autenticada."], ev: "Sem linha própria no roteiro.", kw: ["sinais de email", "sinais de risco"], fontes: ["apps/web/app/[projectId]/integracoes/sinais-email/page.tsx", "docs/experts-qualidade-sinais-provedor.md"],
  }),

  // ───────── Experts IA (somente o uso das telas) ─────────
  item({
    id: "experts-ia", nome: "Experts IA", tipo: "menu", rota: "/[projectId]/experts-ia", cap: "axia-especialistas", acesso: "TODOS",
    fin: "Reúne os especialistas de IA do ACC (jurídico, engenharia, planejamento, SSMA, qualidade e outros). São eles que analisam informações e produzem recomendações técnicas; a AXIA não faz isso.",
    fun: ["Abrir um especialista e fazer a pergunta.", "Abrir a Descrição dos Especialistas."], ind: ["Cada resposta separa fato, inferência e recomendação e exige revisão humana."],
    passos: ["Abra Experts IA.", "Escolha o especialista da sua pergunta.", "Escreva a pergunta e consulte.", "Revise a resposta: ela é apoio à decisão."],
    regras: ["A IA analisa e recomenda; decisões vinculantes permanecem humanas.", "A AXIA e os especialistas são separados: a AXIA ensina a usar o ACC; análise técnica ou contratual é do especialista."], integ: ["Alertas (ação ESPECIALISTA), Eventos e Jurídico."],
    q: [["Quando uso a AXIA e quando um especialista?", "Use a AXIA para saber como usar uma tela do ACC. Para analisar um contrato, um documento, um alerta ou uma questão técnica da obra, use um especialista em Experts IA; a resposta dele exige revisão humana.", ["aba experts ia", "tela experts ia", "abrir um especialista", "usar o especialista"]]],
    lim: ["Depende de o provedor de IA estar habilitado.", "Sem linha própria no roteiro de homologação autenticada."], ev: "Sem linha própria no roteiro.", kw: ["aba experts ia", "tela experts ia", "especialistas de ia"],
    fontes: ["apps/web/app/[projectId]/experts-ia/page.tsx", "docs/manual-referencia-acc.md (cap. 8)", "scripts/test-especialista-never-axia.mjs"],
  }),
  item({
    id: "experts.descricao", nome: "Descrição dos Especialistas", tipo: "subaba", pai: "experts-ia", rota: "/[projectId]/experts-ia/descricao", cap: "axia-especialistas", acesso: "TODOS",
    fin: "Página de referência dos especialistas oficiais: competências, fontes, limitações e o perfil simulado de cada um.",
    fun: ["Ler o que cada especialista faz e o que não faz."], ind: ["Competências, fontes (disponíveis ou futuras) e limitações."], passos: ["Abra Descrição dos Especialistas dentro de Experts IA."],
    regras: ["Fonte autorizada não significa fonte disponível: a tela mostra Disponível ou Fonte futura."], integ: ["Experts IA."],
    q: [["Onde vejo o que cada especialista faz?", "Em Experts IA, na Descrição dos Especialistas: competências, fontes, limitações e o perfil de cada um. Fonte autorizada não significa fonte já disponível.", ["descricao dos especialistas", "o que cada especialista faz", "quais especialistas existem"]]],
    lim: ["Sem homologação em tela autenticada."], ev: "Sem linha própria no roteiro.", kw: ["descricao dos especialistas", "perfil dos especialistas"], fontes: ["apps/web/app/[projectId]/experts-ia/descricao/page.tsx"],
  }),
  item({
    id: "experts.engenharia", nome: "Diretor de Engenharia e Construção IA", tipo: "subaba", pai: "experts-ia", rota: "/[projectId]/experts-ia/diretor-engenharia", cap: "axia-especialistas", acesso: "TODOS",
    fin: "Painel para perguntar ao especialista de engenharia e construção. A AXIA apenas explica como abrir e usar o painel.",
    fun: ["Escrever a pergunta e consultar."], ind: ["Resposta do especialista, sujeita a revisão humana."], passos: ["Abra Experts IA e escolha o Diretor de Engenharia e Construção IA.", "Escreva a pergunta e consulte."],
    regras: ["O especialista não substitui o responsável técnico; a resposta exige revisão humana."], integ: ["Experts IA."],
    q: [["Como pergunto ao Diretor de Engenharia IA?", "Abra Experts IA, escolha o Diretor de Engenharia e Construção IA, escreva a pergunta e consulte. A resposta é do especialista e exige revisão humana; a AXIA só explica o caminho.", ["diretor de engenharia", "especialista de engenharia", "painel de engenharia"]]],
    lim: ["Depende do provedor de IA habilitado."], ev: "Sem linha própria no roteiro.", kw: ["diretor de engenharia", "especialista de engenharia"], fontes: ["apps/web/app/[projectId]/experts-ia/diretor-engenharia/page.tsx"],
  }),
  item({
    id: "experts.planejamento", nome: "Diretor de Planejamento IA", tipo: "subaba", pai: "experts-ia", rota: "/[projectId]/experts-ia/diretor-planejamento", cap: "axia-especialistas", acesso: "TODOS",
    fin: "Painel para perguntar ao especialista de planejamento. A AXIA apenas explica como abrir e usar o painel.",
    fun: ["Escrever a pergunta e consultar."], ind: ["Resposta do especialista, sujeita a revisão humana."], passos: ["Abra Experts IA e escolha o Diretor de Planejamento IA.", "Escreva a pergunta e consulte."],
    regras: ["A resposta exige revisão humana."], integ: ["Experts IA."],
    q: [["Como pergunto ao Diretor de Planejamento IA?", "Abra Experts IA, escolha o Diretor de Planejamento IA, escreva a pergunta e consulte. A resposta é do especialista e exige revisão humana; a AXIA só explica o caminho.", ["diretor de planejamento", "especialista de planejamento", "painel de planejamento"]]],
    lim: ["Depende do provedor de IA habilitado."], ev: "Sem linha própria no roteiro.", kw: ["diretor de planejamento", "especialista de planejamento"], fontes: ["apps/web/app/[projectId]/experts-ia/diretor-planejamento/page.tsx"],
  }),

  // ───────── Administração ─────────
  item({
    id: "usuarios", nome: "Usuários", tipo: "menu", rota: "/[projectId]/usuarios", cap: "administracao", acesso: "ADMINISTRADOR",
    fin: "Controle de acesso da obra: usuários, cargos, áreas, permissões, WhatsApp de alerta crítico e a matriz de responsabilidades e prazos.",
    fun: ["Adicionar usuário que já fez login ou pré-cadastrar.", "Editar cargo e permissão.", "Desativar e reativar.", "Matriz de responsabilidades e prazos."], ind: ["Origem, cargo, área, permissão e status de cada pessoa."],
    passos: ["Abra Usuários (Administrador).", "Use + Adicionar usuário, busque o e-mail do domínio axion.com.br, escolha Permissão e Área e confirme.", "Se a pessoa nunca entrou, use Pré-cadastrar.", "Para tirar o acesso, use Desativar: o histórico é mantido."],
    regras: ["Participar de um e-mail ou comunicação não concede acesso ao ACC.", "Desativar mantém o histórico."], integ: ["Todas as abas dependem das permissões definidas aqui."],
    q: [["Como libero a obra para uma pessoa?", "Na tela Usuários (só o Administrador a vê): + Adicionar usuário, busque o e-mail do domínio axion.com.br, escolha a Permissão e a Área e confirme. Se a pessoa nunca entrou, use Pré-cadastrar.", ["adicionar usuario", "liberar acesso a obra", "aba usuarios", "dar acesso a uma pessoa"]]],
    lim: ["Sem linha própria no roteiro de homologação autenticada."], ev: "Sem linha própria no roteiro; item restrito ao Administrador.", kw: ["aba usuarios", "tela usuarios", "adicionar usuario"],
    fontes: ["apps/web/app/[projectId]/usuarios/page.tsx", "docs/manual-referencia-acc.md (4.30)"],
  }),
  item({
    id: "competencias", nome: "Competências", tipo: "menu", rota: "/[projectId]/competencias", cap: "administracao", acesso: "NIVEL_LEITURA",
    fin: `Governança das competências profissionais: solicitações, validação por pessoa independente, revalidação e validadores designados. ${TEXTO_BLOQUEADA}`,
    fun: ["Nenhuma operação de escrita está liberada nesta versão."], ind: ["A tela pode abrir para consulta."], passos: ["Não há passo a passo: as operações desta aba estão bloqueadas nesta versão."],
    regras: ["Situação: Bloqueada nesta versão.", "Atos que exigem habilitação continuam seguindo a regra vigente, sem passar por esta tela."], integ: ["Qualidade, Garantias e Seguros."],
    q: [["Posso solicitar uma competência pela aba Competências?", "Não nesta versão: as operações da aba Competências (solicitar, validar, revalidar, designar validador) estão bloqueadas. Não há instrução de uso a seguir; quando forem liberadas, o manual e a AXIA serão atualizados.", ["aba competencias", "solicitar competencia", "validador de competencia", "competencias bloqueada"]]],
    lim: [TEXTO_BLOQUEADA, "Sem homologação em tela autenticada (NAO-CONSTA no roteiro)."], sit: "BLOQUEADA", ev: "Decisão da Fase 2: as nove operações de escrita de competências estão na trava de módulos.", kw: ["aba competencias", "competencias profissionais"],
    fontes: ["apps/web/app/[projectId]/competencias/page.tsx", "apps/web/lib/permissions/nav-access.ts", "apps/web/lib/ui/help/manifests/governanca.ts"],
  }),
  item({
    id: "aprovacoes-externas", nome: "Aprovações externas", tipo: "menu", rota: "/[projectId]/aprovacoes-externas", cap: "administracao", acesso: "NIVEL_COLABORADOR",
    fin: "Preparação e decisão de comunicações a destinatários externos. A aprovação vale uma vez e fica presa ao conteúdo. Esta tela nunca envia e-mail.",
    fun: ["Preparar um envio informando destinatários, ação e conteúdo.", "Decidir (quem tem permissão)."], ind: ["Estado de cada preparação."], passos: ["Abra Aprovações externas (Colaborador ou superior).", "Prepare o envio.", "Quem decide aprova ou recusa."],
    regras: ["A aprovação é de uso único e fica ligada ao conteúdo (hash)."], integ: ["Seguros (minutas) e Solicitações."],
    q: [["A aba Aprovações externas envia e-mail?", "Não: ela só prepara e registra a decisão sobre comunicações a destinatários externos. A aprovação vale uma vez e fica presa ao conteúdo.", ["aprovacoes externas", "aba aprovacoes externas", "aprovar comunicacao externa"]]],
    lim: ["Sem linha própria no roteiro de homologação autenticada."], ev: "Sem linha própria no roteiro; nível mínimo Colaborador em nav-access.", kw: ["aprovacoes externas", "comunicacao externa"],
    perf: { leitura: "Não vê o item no menu e não abre a tela." }, fontes: ["apps/web/app/[projectId]/aprovacoes-externas/page.tsx", "apps/web/lib/permissions/nav-access.ts"],
  }),
  item({
    id: "autorizacoes", nome: "Autorizações", tipo: "menu", rota: "/[projectId]/autorizacoes", cap: "integracoes", acesso: "ADMINISTRADOR",
    fin: "Mostra, por colaborador, conta e obra, se o acesso aos e-mails foi autorizado, recusado ou revogado, quando, e a situação da conexão da conta.",
    fun: ["Solicitar autorização por e-mail.", "Cancelar solicitação.", "Revogar autorização com motivo.", "Ver texto e histórico."], ind: ["Decisão, data e conexão da conta."], passos: ["Abra Autorizações (Administrador).", "Escolha o colaborador e use Solicitar e enviar e-mail.", "Acompanhe a tabela."],
    regras: ["O aceite é registrado no ACC; a conexão da conta Google é separada e feita pelo administrador.", "A permissão do Google é somente leitura e não é limitada a uma obra; quem limita são os filtros do ACC."], integ: ["Integrações e Caixas de e-mail."],
    q: [["O que é a aba Autorizações?", "É onde o Administrador acompanha o consentimento de cada colaborador para o ACC usar a caixa de e-mail em uma obra: autorizado, recusado ou revogado, e a situação da conexão da conta.", ["aba autorizacoes", "tela autorizacoes", "autorizacoes de acesso aos emails"]]],
    lim: ["Sem homologação em tela autenticada (NAO-CONSTA)."], ev: "Sem linha própria para a tela; item restrito ao Administrador.", kw: ["aba autorizacoes", "autorizacoes de acesso aos emails"],
    fontes: ["apps/web/app/[projectId]/autorizacoes/page.tsx", "docs/manual-referencia-acc.md (4.31)"],
  }),
  item({
    id: "autorizacao-email", nome: "Autorização de acesso aos e-mails da obra", tipo: "pagina", pai: "autorizacoes", rota: "/autorizacao-email/[authorizationId]", cap: "integracoes", acesso: "SEM_MENU",
    fin: "Página do colaborador para autorizar, recusar ou revogar o acesso do ACC à caixa de e-mail corporativa em uma obra específica.",
    fun: ["Ler as seis seções do texto.", "Autorizar ou recusar em duas etapas.", "Revogar depois de autorizar."], ind: ["Texto do consentimento e histórico."], passos: ["Abra o link do e-mail.", "Leia as informações.", "Marque a caixa de confirmação e confirme."],
    regras: ["Abrir o link não registra nada; só a confirmação registra.", "Revogar no ACC não remove a permissão dada ao Google."], integ: ["Autorizações."],
    q: [["Autorizar o acesso ao e-mail é obrigatório?", "A autorização é o seu consentimento, feito dentro do ACC com login. Sua recusa fica registrada e não altera nada na sua conta Google. Veja as respostas sobre autorização para os detalhes.", ["pagina de autorizacao", "autorizar acesso ao email da obra"]]],
    lim: ["Sem homologação em tela autenticada."], ev: "Sem linha própria no roteiro.", kw: ["pagina de autorizacao de email", "link de autorizacao"], fontes: ["apps/web/app/autorizacao-email/[authorizationId]/page.tsx", "apps/web/lib/assistant/knowledge.ts (autorizacao-*)"],
  }),
  item({
    id: "startup", nome: "Start-up ACC", tipo: "menu", rota: "/[projectId]/startup", cap: "administracao", acesso: "ADMINISTRADOR",
    fin: "Validação dos riscos históricos Alto e Crítico anteriores ao início operacional do ACC, com uma decisão humana por achado.",
    fun: ["Configurar as datas da obra.", "Decidir cada achado histórico.", "Concluir o Start-up do projeto."], ind: ["Estado do Start-up e legenda de risco."], passos: ["Abra Start-up ACC (Administrador).", "Salve as datas.", "Decida cada achado.", "Clique em Concluir Start-up do projeto."],
    regras: ["Concluir grava o marco sem reescrever nenhum achado."], integ: ["Eventos e Dashboard."],
    q: [["Para que serve o Start-up ACC?", "Para validar, com decisão humana, os riscos Alto e Crítico do histórico anterior ao início operacional do ACC. Concluir grava o marco sem reescrever nenhum achado.", ["start up acc", "start-up acc", "aba startup", "riscos historicos", "concluir start up"]]],
    lim: ["Sem linha própria no roteiro de homologação autenticada."], ev: "Sem linha própria no roteiro; item restrito ao Administrador.", kw: ["start up acc", "start-up acc", "aba startup"], fontes: ["apps/web/app/[projectId]/startup/page.tsx", "docs/manual-referencia-acc.md (4.35)"],
  }),

  // ───────── Ajuda ─────────
  item({
    id: "ajuda", nome: "Ajuda e tutorial", tipo: "menu", rota: "/[projectId]/ajuda", cap: "demais", acesso: "TODOS",
    fin: "Reúne o tutorial do ACC: PDF para consulta e PowerPoint editável, com imagens das telas e dos e-mails de alerta (dados fictícios).",
    fun: ["Abrir o PDF.", "Baixar o PowerPoint.", "Abrir a conversa com a AXIA."], ind: ["Links do tutorial."], passos: ["Abra Ajuda e tutorial no menu da obra.", "Escolha PDF ou PowerPoint."], regras: ["Os ícones de ajuda nas telas explicam cada módulo."], integ: ["AXIA."],
    q: [["Onde fica o tutorial?", "Em Ajuda e tutorial, no menu da obra: PDF para consulta e PowerPoint para edição.", ["aba ajuda e tutorial", "tela de ajuda", "tela ajuda e tutorial"]]],
    lim: ["Sem linha própria no roteiro de homologação autenticada."], ev: "Sem linha própria no roteiro.", kw: ["aba ajuda e tutorial", "tela de ajuda"], fontes: ["apps/web/app/[projectId]/ajuda/page.tsx", "docs/manual-referencia-acc.md (4.33)"],
  }),
  item({
    id: "vera", nome: "Fale com a AXIA (rota /vera)", tipo: "pagina", rota: "/vera", cap: "axia-especialistas", acesso: "SEM_MENU",
    fin: "Atalho antigo que abre Ajuda e tutorial já com a conversa da AXIA. A AXIA é a assistente de uso do ACC: explica como usar as telas.",
    fun: ["Redirecionamento para Ajuda e tutorial com a conversa aberta."], ind: ["Conversa por texto."], passos: ["Use Fale com a AXIA na barra de cima, ou abra /vera."],
    regras: ["A AXIA não altera dados, não lê dados de obras e não analisa contratos; análise é dos especialistas."], integ: ["Ajuda e tutorial."],
    q: [["O que a AXIA faz?", "A AXIA ensina a usar o ACC: explica abas, botões e fluxos. Ela não altera nada, não lê dados da obra e não analisa contratos ou questões técnicas; para isso use os especialistas em Experts IA.", ["rota vera", "atalho vera", "o que a axia nao faz"]]],
    lim: ["A AXIA responde só com a base de uso aprovada."], ev: "Sem linha própria no roteiro.", kw: ["rota vera", "atalho vera"], fontes: ["apps/web/app/vera/page.tsx", "apps/web/lib/assistant/knowledge.ts"],
  }),

  // ───────── Temas transversais ─────────
  item({
    id: "tema.axia-especialistas", nome: "AXIA e Especialistas: quem responde o quê", tipo: "tema", cap: "axia-especialistas", acesso: "TODOS",
    fin: "A AXIA e os Especialistas de IA são coisas separadas. A AXIA responde dúvidas de USO do ACC. Os Especialistas (Experts IA) tratam de questões técnicas e contratuais da obra.",
    fun: ["AXIA: como usar telas, abas e fluxos.", "Especialistas: análise de documentos, alertas e questões técnicas, sempre com revisão humana."], ind: ["Cada resposta de especialista separa fato, inferência e recomendação."],
    passos: ["Dúvida de como usar o ACC: pergunte à AXIA (Fale com a AXIA).", "Dúvida técnica ou contratual: abra Experts IA ou use a ação ESPECIALISTA do alerta."],
    regras: ["A AXIA não lê dados da obra e não altera nada.", "Nenhum especialista consulta a AXIA nem depende dela."], integ: ["Experts IA e Ajuda e tutorial."],
    q: [["A AXIA analisa meu contrato?", "Não. A AXIA só ensina a usar o ACC. Para analisar um contrato ou documento use os especialistas em Experts IA; a resposta deles exige revisão humana.", ["axia analisa meu contrato", "diferenca entre axia e especialista", "axia ou especialista"]]],
    lim: ["Perguntas sobre um caso concreto recebem o aviso de que a AXIA explica só a regra geral."], ev: "Decisão do produto e guardas determinísticas da AXIA.", kw: ["axia ou especialista", "axia e especialistas"], fontes: ["apps/web/lib/assistant/guards.ts", "apps/web/lib/assistant/scope.ts", "scripts/test-especialista-never-axia.mjs"],
  }),
  item({
    id: "tema.perfis", nome: "Perfis e permissões", tipo: "tema", cap: "acesso-navegacao", acesso: "TODOS",
    fin: "Cada pessoa tem um perfil por obra, definido pelo Administrador na tela Usuários: Administrador, Gerente, Colaborador ou Leitura. O perfil decide o que aparece no menu e o que se pode gravar.",
    fun: ["Menu e rota repetem a mesma regra: esconder o menu nunca é a única barreira."], ind: ["Itens só do Administrador: Eventos, Integrações, Usuários, Autorizações, Reemissão de alertas e Start-up ACC."],
    passos: ["Se você não vê uma aba, o seu perfil não tem acesso a ela nesta obra.", "Peça ao Administrador na tela Usuários."],
    regras: ["Qualidade, Garantias, Seguros, Quatro Pilares e Competências exigem nível Leitura ou superior; Aprovações externas exige Colaborador ou superior.", "Financeiro exige acesso financeiro à obra."], integ: ["Usuários."],
    q: [["Por que não vejo uma aba?", "O seu perfil não tem acesso a ela nesta obra: menu e rota seguem a mesma regra. Peça ao Administrador, na tela Usuários.", ["nao vejo uma aba", "nao vejo o menu", "aba nao aparece", "sem acesso a aba"]]],
    lim: ["As diferenças detalhadas entre perfis seguem em revisão no Q&A da AXIA."], ev: "Conforme nav-items e nav-access.", kw: ["perfis e permissoes", "nao vejo uma aba"], fontes: ["apps/web/lib/permissions/nav-access.ts", "apps/web/lib/ui/nav-items.ts"],
  }),
  item({
    id: "tema.criticidade-sla", nome: "Criticidades e prazos (SLA)", tipo: "tema", cap: "alertas-sla", acesso: "TODOS",
    fin: "Os alertas têm quatro graus (Crítico, Alto, Médio, Baixo), cada um com um prazo padrão para o responsável assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis.",
    fun: ["Nível 1 Responsável, Nível 2 Gerência, Nível 3 Diretoria."], ind: ["Prazos padrão aprovados; cada obra pode ter valores próprios na matriz."],
    passos: ["Veja os prazos de cada ação em Ações e Escalonamentos.", "O Administrador consulta a matriz em Usuários."],
    regras: ["Só Alto e Crítico passam pelo escalonamento por prazo no ciclo automático.", "Os lembretes de repetição (Crítico 1 dia, Alto 2, Médio 4, Baixo 7, dias corridos) são outro mecanismo."], integ: ["Ações e Escalonamentos e alertas por e-mail."],
    q: [["Qual é o prazo de cada criticidade?", "Padrão aprovado para assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis. Cada obra pode ter valores próprios na matriz.", ["tabela de criticidade e prazos", "criticidades e prazos"]]],
    lim: ["A configuração da matriz e feriados são assuntos em revisão da AXIA.", "Textos antigos da AXIA ainda podem citar valores anteriores para Médio e Baixo; vale esta tabela."], ev: "SLA aprovado (decisão da Fase 2, migration de SLA validada em homologação).", kw: ["criticidades e prazos", "tabela de criticidade"],
    fontes: ["apps/web/lib/assistant/guards.ts", "apps/web/lib/assistant/approved-batch-1.ts (qa-E2, qa-R7)"],
  }),
  item({
    id: "tema.barra-lateral", nome: "Barra lateral de navegação", tipo: "tema", cap: "acesso-navegacao", acesso: "TODOS",
    fin: "A barra lateral lista as abas da obra, cada uma com ícone e texto sempre visíveis; não há texto que só aparece ao passar o mouse.",
    fun: ["Navegar entre as abas.", "Itens restritos só aparecem a quem tem acesso."], ind: ["Ícone e rótulo de cada aba."], passos: ["Clique no nome da aba na barra lateral."],
    regras: ["A ordem e os rótulos seguem o menu real do ACC.", "Revisão Contratual e Revisão de Cláusulas saíram do menu e abrem por link."], integ: ["Todas as abas."],
    q: [["Onde ficam as abas do ACC?", "Na barra lateral da obra: cada aba mostra ícone e texto sempre visíveis. Abas restritas só aparecem a quem tem acesso.", ["barra lateral", "menu lateral", "onde ficam as abas"]]],
    lim: ["A revisão visual da barra lateral (frente D) ainda não foi integrada a esta base."], ev: "Conforme nav-items e decisão da Fase 2.", kw: ["barra lateral", "menu lateral"], fontes: ["apps/web/lib/ui/nav-items.ts", "apps/web/components/layout/app-sidebar.tsx"],
  }),
];
