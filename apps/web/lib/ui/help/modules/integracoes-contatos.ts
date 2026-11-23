// Catálogo de ajuda — FASE 5 / C: Integrações › Contatos externos monitorados. Arquivo NOVO; entra no registry por 2 linhas.
// Descreve o que o CÓDIGO faz (app/[projectId]/integracoes/contatos-externos, lib/external-parties e as migrations 20261203100000/110000).
import type { FeatureHelpDefinition } from "../types";

const D = { module: "integracoes", version: "2026-11-21" } as const;
const P_MANAGE = "Administrador, Gestor ou Gerente ativo da obra (nível MANAGE de acc_project_tier). Colaborador e Leitura não veem a tela (404) e o banco recusa a escrita; a interface espelha a regra, mas a autoridade é a RPC/RLS.";
const HUMAN = "Vínculo ATIVO e limites de competência são decisão humana conferida com o contrato e o documento de delegação; o ACC nunca presume autoridade por domínio, nome ou oficialidade da mensagem.";

export const INTEGRACOES_CONTATOS_HELP: FeatureHelpDefinition[] = [
  {
    ...D,
    id: "integracoes.contatos-externos.pagina",
    kind: "page",
    title: "Contatos externos monitorados",
    shortDescription: "Organizações e pessoas de fora da Axion que trocam e-mails com a obra, com vínculo e limite de competência.",
    description:
      "Cadastro auditável das organizações externas (cliente, gerenciadora, fornecedores, subcontratadas, seguradoras e outras), seus domínios de e-mail, contatos e o vínculo de cada uma com ESTA obra (papel, contrato, cláusula e documento de delegação, limites de competência e vigência). É o que permite ao ACC saber quem escreveu um e-mail e com que autoridade.",
    purpose: "Identificar corretamente quem é o remetente/destinatário externo sem vincular mensagens ao projeto por coincidência de domínio.",
    howToUse: [
      "Confira os contatos descobertos pendentes e confirme ou rejeite cada um, escolhendo a organização.",
      "Cadastre organizações novas com o papel e, quando conferido o contrato, confirme o vínculo como ATIVO.",
      "Em 'Corrigir vínculos, domínios e contatos', ajuste cláusula, limites de competência, vigência, domínios e contatos.",
    ],
    howItWorks:
      "Leitura pelo cliente de sessão (RLS por membership ativa). Toda gravação passa por RPC (acc_external_*), que exige nível de gestão, valida o dado e grava a linha de auditoria append-only. A resolução usada pelos demais módulos é a RPC acc_resolve_external_party, fail-closed: sem vínculo ATIVO o resultado é 'desconhecido'.",
    data: ["external_organizations, external_org_domains, external_contacts", "external_org_project_links, external_contact_candidates, external_contacts_audit", "emails (leitura), email_risk_signals e email_sync_reconciliation_runs (leitura, quando existirem)"],
    permissions: P_MANAGE,
    missingData: "Dado ausente aparece como 'SEM DADOS'; nunca como zero ou valor presumido.",
    limitations: ["Mensagens de terceiros são dado não confiável: o conteúdo nunca define vínculo nem autoridade.", "O ACC não envia e-mail por esta tela."],
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.contatos-externos.resumo",
    kind: "table",
    title: "Resumo dos contatos externos",
    shortDescription: "Contagens de organizações, vínculos ativos, candidatos pendentes e mensagens atribuídas, ambíguas ou sem vínculo.",
    description:
      "Quadro de contagens da obra. As mensagens vêm de uma AMOSTRA das mensagens mais recentes já ingeridas (a quantidade da amostra é exibida) e só são atribuídas a uma organização quando o endereço casa de forma não ambígua: contato confirmado ou domínio de uma única organização vinculada. Domínio compartilhado entre organizações conta como 'ambígua'; sem casamento conta como 'sem vínculo'.",
    source: "external_org_project_links, external_contact_candidates e emails (somente leitura).",
    criteria: ["Vínculo encerrado não conta como ativo e não atribui mensagem.", "Contato rejeitado não atribui mensagem à organização."],
    missingData: "Sem mensagens ingeridas, os números de mensagens ficam em 0 e a cobertura da sincronização informa 'SEM DADOS'.",
    limitations: ["É amostra das mensagens recentes, não o universo; a cobertura do universo está no bloco de cobertura da sincronização."],
    permissions: P_MANAGE,
  },
  {
    ...D,
    id: "integracoes.contatos-externos.cobertura",
    kind: "table",
    title: "Cobertura da sincronização",
    shortDescription: "Universo, elegíveis, processadas, excluídas e com falha na última reconciliação de cada caixa.",
    description:
      "Mostra a última reconciliação registrada por caixa (provedor e endereço) e soma universo, elegíveis, processadas, excluídas e com falha. Só caixas com reconciliação registrada entram: uma caixa não conectada ou nunca reconciliada não é considerada monitorada. Também informa se os sinais de risco por e-mail estão disponíveis (indício não é inadimplemento comprovado).",
    source: "email_sync_reconciliation_runs (somente leitura) e email_risk_signals (somente leitura).",
    missingData: "Sem reconciliação ou sem a tabela no ambiente, exibe 'SEM DADOS' e o motivo, sem alegar cobertura.",
    limitations: ["Não prova leitura de caixas que não aparecem na reconciliação.", "Percentual = processadas ÷ elegíveis da última reconciliação de cada caixa."],
    permissions: P_MANAGE,
  },
  {
    ...D,
    id: "integracoes.contatos-externos.candidatos",
    kind: "admin-action",
    title: "Contatos descobertos pendentes",
    shortDescription: "E-mails vistos sem vínculo confirmado; confirme com a organização ou rejeite.",
    description:
      "Lista os endereços externos vistos nas mensagens que ainda não são contato confirmado de nenhuma organização do projeto. Confirmar exige escolher uma organização que tenha vínculo neste projeto; rejeitar impede que o endereço seja tratado como contato daquela organização. O candidato NUNCA confere autoridade enquanto não for confirmado por uma pessoa.",
    criteria: ["A sugestão de organização só aparece quando o domínio pertence a uma única organização vinculada ao projeto.", "A mesma mensagem registrada duas vezes não aumenta a contagem."],
    consequences: ["Confirmar: o endereço vira contato CONFIRMADO (marcado como descoberto) e a decisão vai para a auditoria.", "Rejeitar: o candidato é encerrado e a decisão vai para a auditoria."],
    permissions: P_MANAGE,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.contatos-externos.organizacoes",
    kind: "table",
    title: "Organizações e vínculos",
    shortDescription: "Cada organização com papel, contrato, cláusula, limites de competência, vigência, domínios, contatos e atividade.",
    description:
      "Para cada organização vinculada à obra: situação de cada vínculo (Ativo, Candidato, Encerrado), papel, contrato, cláusula de delegação, limites de competência delegados (vazio = NENHUMA delegação), vigência, domínios (marcados quando compartilhados), contatos, mensagens, sinais de risco e alertas originados. Uma organização pode ter vários vínculos na mesma obra (por exemplo, contratos distintos) e isso é sinalizado.",
    criteria: ["Oficialidade da mensagem não é competência: só o que está em 'competência delegada' de um vínculo ATIVO e vigente é considerado delegado.", "Domínio compartilhado por mais de uma organização nunca vincula mensagem por si só."],
    consequences: ["Salvar vínculo como ATIVO exige confirmação e grava quem confirmou e quando.", "Encerrar um vínculo o remove da resolução (a organização deixa de ser reconhecida nesta obra)."],
    missingData: "Contrato, cláusula, domínios ou contatos ausentes aparecem como 'SEM DADOS'.",
    permissions: P_MANAGE,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.contatos-externos.nova-organizacao",
    kind: "admin-action",
    title: "Nova organização neste projeto",
    shortDescription: "Cadastra uma organização externa e seu vínculo com a obra; ATIVO só com sua confirmação.",
    description:
      "Cria a organização (razão social, CNPJ opcional, papel) e o vínculo com esta obra em um passo, com contrato, cláusula de delegação, limites de competência, vigência e domínio principal opcionais. Sem marcar a confirmação, o vínculo nasce CANDIDATO e não confere autoridade. Marcar a confirmação registra você como quem conferiu contrato e delegação. A criação da organização (dado global) é do administrador global (TENANT_ADMIN); Administrador, Gestor e Gerente da obra enviam uma solicitação.",
    howToUse: ["Preencha razão social e papel.", "Informe contrato, cláusula e limites quando houver documento de delegação.", "Marque a confirmação apenas se conferiu o documento."],
    criteria: ["Vigência até não pode ser anterior à vigência de.", "Domínio inválido é recusado e nada é gravado no domínio."],
    consequences: ["O cadastro e a confirmação ficam na auditoria (quem, quando, antes/depois)."],
    permissions: P_MANAGE,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.contatos-externos.auditoria",
    kind: "table",
    title: "Auditoria de contatos externos",
    shortDescription: "As últimas alterações em organizações, vínculos, domínios e contatos, com motivo.",
    description:
      "Mostra as 30 alterações mais recentes deste projeto na trilha append-only de contatos externos: quando, ação, tipo de item e motivo informado. A trilha guarda também o ator e o estado antes/depois; ela não pode ser alterada nem apagada, nem por superusuário.",
    source: "external_contacts_audit (somente leitura; escrita só pelas RPCs de gestão).",
    permissions: "Administrador, Gestor ou Gerente ativo da obra; Leitura e Colaborador não leem a trilha (RLS).",
    missingData: "Sem alterações, informa que nenhuma foi registrada.",
  },
  ...([
    ["campo-situacao", "field", "Situação", "Situação do vínculo, do domínio ou do contato: Ativo/Candidato/Encerrado ou Confirmado/Candidato/Rejeitado.", "Define o estado. Só vínculo ATIVO e vigente confere reconhecimento da organização; Candidato e Encerrado não conferem autoridade, e contato Rejeitado não casa com a organização. A mudança é auditada."],
    ["campo-contrato", "field", "Contrato / referência", "Contrato ou referência ao qual o vínculo da organização com a obra se refere.", "Texto livre informado por pessoa (por exemplo, número do contrato ou da ordem de compra). Permite vários vínculos da mesma organização na obra, um por contrato. Em branco aparece como SEM DADOS."],
    ["campo-clausula", "field", "Cláusula de delegação", "Cláusula do contrato que delega competência à organização.", "Referência à cláusula usada como base dos limites de competência. É apenas registro informado por pessoa; o ACC não valida o texto da cláusula. Em branco aparece como SEM DADOS."],
    ["campo-escopo", "field", "Limites de competência", "Lista (separada por vírgula) do que a organização pode determinar; vazio = nenhuma delegação.", "Cada item é normalizado em maiúsculas e sem repetição. Só o que está nesta lista, em vínculo ATIVO e vigente e sem ambiguidade, é tratado como delegado. Mensagem oficial nunca autoriza escopo, aditivo, prazo, reajuste ou preço fora do que está aqui."],
    ["campo-vigencia", "field", "Vigência", "Data inicial ou final da validade do vínculo; vazio no fim = sem data final.", "Vínculo só é vigente dentro do intervalo. Vigência final anterior à inicial é recusada pelo banco. Vínculo vencido continua listado, mas não é vigente."],
    ["campo-motivo", "field", "Motivo", "Motivo da alteração ou decisão; fica na auditoria.", "Texto opcional (até 500 caracteres) gravado junto com quem fez a alteração e o estado antes e depois, em trilha que não pode ser alterada nem apagada."],
    ["campo-organizacao", "field", "Organização do contato", "Organização à qual o contato descoberto será associado; precisa ter vínculo neste projeto.", "Lista as organizações vinculadas à obra. A sugestão aparece só quando o domínio do e-mail pertence a uma única organização do projeto. Sem vínculo na obra, a confirmação é recusada."],
    ["campo-dominio", "field", "Domínio de e-mail", "Domínio (por exemplo, empresa.com.br) usado pela organização.", "Validado no servidor e no banco. Um domínio pode pertencer a várias organizações; nesse caso fica marcado como compartilhado e o ACC não vincula mensagens à obra por coincidência de domínio."],
    ["campo-email", "field", "E-mail do contato", "Endereço do contato da organização.", "Validado e normalizado no servidor e no banco (sem quebra de linha nem lista de destinatários). Contato Confirmado identifica a pessoa exatamente e desempata domínio compartilhado."],
    ["campo-nome", "field", "Nome do contato", "Nome de exibição do contato; opcional.", "Apenas informativo; não participa da identificação, que é feita pelo endereço de e-mail."],
    ["campo-razao", "field", "Razão social", "Nome legal da organização externa.", "Obrigatório (mínimo de 2 caracteres). Informado por pessoa; o ACC não consulta cadastros externos."],
    ["campo-cnpj", "field", "CNPJ / identificação fiscal", "Identificação fiscal da organização; opcional e único.", "Se informada, não pode repetir a de outra organização. Informado por pessoa e não verificado em fonte externa."],
    ["campo-papel", "field", "Papel no projeto", "Papel da organização na obra: cliente, gerenciadora, fornecedor, subcontratada e outros.", "Define como a organização é classificada. O papel por si só não confere competência: os limites vêm do campo de limites de competência do vínculo ATIVO."],
    ["campo-observacoes", "field", "Observações", "Observações sobre a organização.", "Texto livre opcional (até 500 caracteres) gravado na organização."],
    ["campo-confirmacao", "field", "Confirmo o vínculo", "Marque somente se conferiu contrato e delegação; é o que torna o vínculo ATIVO.", "Sem esta marca o vínculo fica CANDIDATO e não confere autoridade. Com a marca, ficam registrados quem confirmou e quando. A decisão é humana e auditada."],
    ["acao-salvar-vinculo", "admin-action", "Salvar vínculo", "Grava as alterações do vínculo da organização com a obra.", "Chama a RPC de gestão (nível Gestor, Gerente ou Administrador), que valida os dados e grava a auditoria. Ativar exige a confirmação marcada."],
    ["acao-salvar-dominio", "admin-action", "Salvar domínio", "Registra ou altera a situação de um domínio da organização.", "Chama a RPC de gestão." + " Por serem dados globais, só o administrador global (TENANT_ADMIN) grava diretamente; Administrador, Gestor e Gerente da obra usam 'Solicitar', que registra um pedido para o administrador global decidir (nada muda até a decisão). Se o domínio já pertence a outra organização, avisa que é compartilhado. A alteração é auditada."],
    ["acao-salvar-contato", "admin-action", "Salvar contato", "Registra ou altera um contato da organização.", "Chama a RPC de gestão, que normaliza o e-mail e grava a auditoria." + " Por serem dados globais, só o administrador global (TENANT_ADMIN) grava diretamente; Administrador, Gestor e Gerente da obra usam 'Solicitar', que registra um pedido para o administrador global decidir (nada muda até a decisão). Contato Rejeitado deixa de casar com a organização."],
    ["acao-cadastrar", "admin-action", "Cadastrar organização", "Cria a organização e o vínculo com esta obra.", "Cria organização e vínculo em sequência pelas RPCs de gestão; o vínculo é CANDIDATO, salvo confirmação marcada. Tudo é auditado." + " Por serem dados globais, só o administrador global (TENANT_ADMIN) grava diretamente; Administrador, Gestor e Gerente da obra usam 'Solicitar', que registra um pedido para o administrador global decidir (nada muda até a decisão). Sem ser administrador global, o botão vira 'Solicitar cadastro' e o administrador global cria a organização com vínculo CANDIDATO ao aprovar."],
    ["acao-confirmar-contato", "admin-action", "Confirmar contato", "Transforma o endereço descoberto em contato confirmado da organização escolhida.", "Exige organização com vínculo neste projeto. O contato fica CONFIRMADO e marcado como descoberto; a decisão é auditada."],
    ["acao-rejeitar", "admin-action", "Rejeitar contato", "Rejeita o endereço descoberto; ele não será tratado como contato da organização.", "Encerra o candidato como REJEITADO e, se uma organização foi escolhida, registra o contato como rejeitado. A decisão é auditada."],
  ] as const).map(([id, kind, title, shortDescription, description]): FeatureHelpDefinition => ({
    ...D, id: `integracoes.contatos-externos.${id}`, kind, title, shortDescription, description, permissions: P_MANAGE, humanReview: HUMAN,
  })),
];
