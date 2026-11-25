// Catálogo de ajuda — FASE 6 / H2b: Integrações › Sinais de risco de e-mail (revisão humana, delegação) e as novas regras de
// DADOS GLOBAIS de organização externa em Contatos externos (solicitação/decisão). Arquivo NOVO; entra no registry por 2 linhas.
// Descreve o que o CÓDIGO faz (app/[projectId]/integracoes/sinais-email, contatos-externos, lib/email-classification/review.ts,
// lib/external-parties/change-requests.ts e as migrations 20261209100000 / 20261209101000).
import type { FeatureHelpDefinition } from "../types";

const D = { module: "integracoes", version: "2026-11-21" } as const;
const P_VIEW = "Qualquer membro ativo da obra abre a tela e lê os sinais (RLS). Confirmar/descartar: Gestor, Gerente, Administrador ou profissional expressamente delegado, vigente e para a área do sinal; a autoridade é a RPC email_risk_signal_review, a interface apenas espelha a regra.";
const P_ADMIN = "Somente o Administrador ativo da obra (nível ADMIN de acc_project_tier); o banco recusa os demais.";
const P_MANAGE = "Administrador, Gestor ou Gerente ativo da obra (nível MANAGE ou ADMIN de acc_project_tier).";
const HUMAN = "Indício extraído de e-mail não é fato comprovado: confirmar ou descartar é decisão humana, registrada com quem, quando e por qual via. O ACC não altera a mensagem original nem executa nada a partir do sinal.";

export const SINAIS_EMAIL_HELP: FeatureHelpDefinition[] = [
  {
    ...D,
    id: "integracoes.sinais-email.pagina",
    kind: "page",
    title: "Sinais de risco de e-mail",
    shortDescription: "Indícios de risco extraídos de e-mails da obra, com revisão humana (confirmar ou descartar).",
    description:
      "Lista os sinais que o motor determinístico de classificação extraiu de e-mails vinculados a esta obra. Cada sinal pertence a um pilar de impacto (Prazo, Custo, Segurança ou Qualidade) e/ou a uma área funcional (Jurídico ou Comercial; áreas não são pilares). Mostra o trecho de evidência e a referência até a mensagem original. Gestor, Gerente, Administrador ou profissional delegado confirma ou descarta cada sinal.",
    purpose: "Dar a decisão final sobre cada indício a uma pessoa habilitada, com trilha de auditoria, sem tratar indício como fato.",
    howToUse: [
      "Leia o trecho de evidência e abra o e-mail de origem quando precisar de contexto.",
      "Confirme o sinal ou descarte com justificativa.",
      "Sinais 'Pendentes de validação do vínculo' só podem ser descartados; valide o vínculo em Contatos externos para poder confirmar.",
    ],
    howItWorks:
      "Leitura pelo cliente de sessão (RLS por membership). Confirmar/descartar chama a RPC email_risk_signal_review, que confere papel ou delegação vigente, recusa decisão repetida, bloqueia a confirmação enquanto o vínculo da mensagem/organização não está validado e grava a linha append-only de auditoria. Descartado deixa de gerar casos de risco no coletor de alertas.",
    data: ["email_risk_signals e email_message_classifications (leitura)", "emails (assunto, remetente, data — leitura)", "external_org_project_links (para saber se o vínculo da organização está validado)", "email_signal_review_delegations e email_signal_review_audit"],
    permissions: P_VIEW,
    missingData: "Dado ausente aparece como 'SEM DADOS'; nunca como zero ou valor presumido. Se os sinais não estiverem disponíveis neste ambiente, a tela avisa e não lista sinais.",
    limitations: ["O conteúdo do e-mail é dado de terceiros: é exibido como texto, nunca interpretado como instrução.", "A lista carrega os 300 sinais mais recentes da obra.", "A tela não envia e-mail e não altera a mensagem original."],
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.sinais-email.resumo",
    kind: "table",
    title: "Resumo dos sinais",
    shortDescription: "Contagem dos sinais carregados por situação de revisão.",
    description: "Conta, entre os sinais carregados, quantos aguardam revisão, estão pendentes de validação do vínculo, foram confirmados ou foram descartados. É contagem simples da lista; não é indicador de risco.",
    source: "email_risk_signals (somente leitura).",
    permissions: P_VIEW,
  },
  {
    ...D,
    id: "integracoes.sinais-email.lista",
    kind: "table",
    title: "Lista de sinais",
    shortDescription: "Cada sinal com pilar/área, situação, evidência, e-mail de origem e ações de revisão.",
    description: "Um cartão por sinal: situação, pilar de impacto e área funcional, resumo, trecho de evidência e referência, dados do e-mail de origem (assunto, remetente, data), oficialidade e checagem de autoridade da classificação e, para quem pode revisar, o formulário de decisão.",
    source: "email_risk_signals, email_message_classifications, emails e external_organizations (somente leitura).",
    permissions: P_VIEW,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.sinais-email.estado",
    kind: "status",
    title: "Situação do sinal",
    shortDescription: "Aguardando revisão, Pendente de validação do vínculo, Confirmado ou Descartado.",
    description:
      "Aguardando revisão: o vínculo está validado e ninguém decidiu ainda. Pendente de validação do vínculo: a mensagem é candidata/ambígua ou a organização remetente só tem vínculo candidato, vencido ou encerrado; não há alerta definitivo e a confirmação é bloqueada, mas o descarte é permitido. Confirmado/Descartado: decisão humana registrada.",
    criteria: ["Mensagem só conta como vinculada com project_link_status LINKED e análise concluída.", "Organização do remetente precisa ter vínculo ATIVO e vigente neste projeto."],
    permissions: P_VIEW,
  },
  {
    ...D,
    id: "integracoes.sinais-email.pilar-area",
    kind: "status",
    title: "Pilar e área funcional",
    shortDescription: "Pilares: Prazo, Custo, Segurança, Qualidade. Jurídico e Comercial são áreas funcionais.",
    description:
      "O pilar indica o impacto do risco e só pode ser Prazo, Custo, Segurança ou Qualidade. Jurídico e Comercial são áreas funcionais que respondem pelo sinal e não são pilares. Um sinal jurídico pode não ter pilar, ou ter o pilar de impacto quando o tipo tem impacto claro (pleito => Custo). Sinais de Custo têm a área Comercial.",
    source: "Colunas pillar e functional_area de email_risk_signals; mapeamento por tipo de sinal em lib/email-classification/pillars.ts e na função email_signal_functional_area_for.",
    limitations: ["Sinais antigos foram reclassificados; o pilar original ficou preservado em legacy_pillar."],
    permissions: P_VIEW,
  },
  {
    ...D,
    id: "integracoes.sinais-email.evidencia",
    kind: "message",
    title: "Evidência do sinal",
    shortDescription: "Trecho do e-mail e referência até a mensagem original; é dado de terceiros.",
    description: "Trecho curto extraído da mensagem e a referência rastreável (e-mail, assunto/corpo/anexo e posição). O texto é de terceiros: é mostrado sem formatação e nunca é tratado como instrução. Trechos com instrução embutida são excluídos da análise e a classificação fica marcada.",
    source: "email_risk_signals.evidence_excerpt e evidence_ref.",
    permissions: P_VIEW,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.sinais-email.campo-justificativa",
    kind: "field",
    title: "Justificativa da decisão",
    shortDescription: "Texto livre; obrigatório (mínimo de 5 caracteres) para descartar.",
    description: "Registrada junto com a decisão na auditoria. Para confirmar é opcional; para descartar é obrigatória. O banco recusa descarte sem justificativa.",
    permissions: P_VIEW,
  },
  {
    ...D,
    id: "integracoes.sinais-email.acao-confirmar",
    kind: "admin-action",
    title: "Confirmar sinal",
    shortDescription: "Registra que uma pessoa habilitada confirma o indício. Bloqueado enquanto o vínculo não for validado.",
    description: "Marca o sinal como CONFIRMADO, grava quem, quando e por qual via (papel ou delegação) e permite que o sinal conste como confirmado nos alertas. Não prova inadimplemento por si: confirma que o indício procede.",
    consequences: ["Decisão única: depois de confirmado ou descartado o sinal não volta a pendente.", "A auditoria é append-only."],
    permissions: P_VIEW,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.sinais-email.acao-descartar",
    kind: "admin-action",
    title: "Descartar sinal",
    shortDescription: "Descarta o indício com justificativa; ele deixa de gerar casos de risco.",
    description: "Marca o sinal como DESCARTADO com a justificativa informada. O coletor de alertas ignora sinais descartados. A mensagem original e a classificação permanecem intactas; a decisão fica na auditoria. Permitido também para sinais pendentes de validação do vínculo.",
    permissions: P_VIEW,
    humanReview: HUMAN,
  },
  {
    ...D,
    id: "integracoes.sinais-email.delegacoes",
    kind: "admin-action",
    title: "Delegação de revisão",
    shortDescription: "O Administrador autoriza expressamente um profissional a confirmar/descartar sinais de uma área, por prazo.",
    description:
      "Concessão por projeto e área (Todas, Prazo, Custo, Segurança, Qualidade, Jurídico ou Comercial), com validade futura de no máximo 180 dias e motivo. O delegado precisa ser membro ativo da obra e perde o poder se for desativado, se a delegação vencer ou for revogada. Concessão e revogação ficam na auditoria.",
    permissions: P_ADMIN,
    limitations: ["A delegação vale só para a revisão de sinais; não concede nenhuma outra permissão."],
    humanReview: "Delegar é ato do Administrador com motivo registrado; revise periodicamente as delegações vigentes.",
  },
  ...([
    ["campo-delegado", "field", "Profissional delegado", "Membro ativo da obra que receberá a delegação.", "Lista os membros ativos do projeto. O banco recusa quem não é membro ativo."],
    ["campo-escopo", "field", "Área ou pilar da delegação", "Qual área/pilar o delegado pode revisar; 'Todas' cobre qualquer sinal.", "A delegação cobre o sinal quando o escopo é Todas ou igual ao pilar ou à área funcional do sinal."],
    ["campo-validade", "field", "Validade da delegação", "Último dia de vigência; no máximo 180 dias a partir de hoje.", "O banco recusa validade no passado ou acima de 180 dias. A vigência vai até o fim do dia escolhido (horário de Brasília)."],
    ["campo-motivo", "field", "Motivo da delegação", "Motivo da concessão; fica na auditoria.", "Obrigatório (mínimo de 5 caracteres). Gravado junto com quem concedeu."],
    ["acao-delegar", "admin-action", "Conceder delegação", "Cria a delegação de revisão para o profissional escolhido.", "Chama acc_email_signal_delegate_grant (somente Administrador) e grava a auditoria."],
    ["acao-revogar", "admin-action", "Revogar delegação", "Encerra a delegação imediatamente; o motivo é obrigatório.", "Chama acc_email_signal_delegate_revoke (somente Administrador). A delegação revogada deixa de valer na hora e o registro permanece."],
    ["auditoria", "table", "Auditoria da revisão", "As últimas decisões e delegações registradas, com via e nota.", "Trilha append-only (nem superusuário altera ou apaga). Visível a Administrador, Gestor e Gerente. Guarda também o ator e o estado antes/depois."],
  ] as const).map(([id, kind, title, shortDescription, description]): FeatureHelpDefinition => ({
    ...D, id: `integracoes.sinais-email.${id}`, kind, title, shortDescription, description, permissions: id.startsWith("campo-") || id === "acao-delegar" || id === "acao-revogar" ? P_ADMIN : P_MANAGE,
  })),

  // ---- Contatos externos: dados globais x solicitação ----
  {
    ...D,
    id: "integracoes.contatos-externos.dados-globais",
    kind: "message",
    title: "Dados globais da organização",
    shortDescription: "Razão social, CNPJ, tipo, domínios e contatos só o administrador global (TENANT_ADMIN) altera; Administrador, Gestor e Gerente da obra solicitam.",
    description:
      "A organização externa é um cadastro global, compartilhado entre obras. Por isso a alteração de razão social, CNPJ/identificação fiscal, tipo, domínios e contatos é do administrador global (TENANT_ADMIN). Administrador, Gestor e Gerente da obra solicitam a alteração (o pedido não muda nada) e continuam gerindo os vínculos e os contatos descobertos da PRÓPRIA obra.",
    permissions: P_MANAGE,
    humanReview: "A decisão sobre dado global é do administrador global (TENANT_ADMIN), com nota registrada na auditoria.",
  },
  {
    ...D,
    id: "integracoes.contatos-externos.solicitacoes",
    kind: "table",
    title: "Solicitações de alteração de dados globais",
    shortDescription: "Pedidos de Gestor/Gerente para alterar dados globais; o administrador global aprova (e aplica) ou recusa.",
    description:
      "Cada pedido registra o tipo (cadastrar organização, alterar dados, domínio ou contato), o conteúdo solicitado, o motivo, quem pediu e quando. Aprovar aplica a alteração na mesma operação e registra a auditoria; recusar exige motivo; o solicitante ou o Administrador pode cancelar enquanto pendente. Cadastro aprovado cria a organização com um vínculo CANDIDATO neste projeto (sem autoridade até a validação).",
    source: "external_org_change_requests; decisão por acc_external_change_decide, cancelamento por acc_external_change_cancel.",
    permissions: P_MANAGE,
    humanReview: "Somente o administrador global (TENANT_ADMIN) aprova ou recusa; o pedido nunca altera dado por si.",
  },
  ...([
    ["acao-alterar-dados", "admin-action", "Salvar / solicitar alteração dos dados da organização", "Administrador grava razão social, CNPJ e tipo; Gestor e Gerente registram a solicitação.", "Para o Administrador chama acc_external_org_save; para Gestor e Gerente chama acc_external_change_request (tipo ORG_UPDATE) e nada é alterado até a decisão."],
    ["campo-nota-decisao", "field", "Nota da decisão", "Observação sobre a decisão; obrigatória para recusar (mínimo de 5 caracteres).", "Gravada na solicitação e na trilha de auditoria append-only, junto com quem decidiu e quando; não é interpretada como instrução."],
    ["acao-aprovar-solicitacao", "admin-action", "Aprovar e aplicar solicitação", "Aprova o pedido e aplica a alteração global na mesma operação.", "Somente Administrador. Usa as RPCs administrativas (organização, domínio ou contato) e registra a decisão e a aplicação na auditoria."],
    ["acao-recusar-solicitacao", "admin-action", "Recusar solicitação", "Recusa o pedido com motivo; nada é alterado.", "Somente Administrador; o motivo é obrigatório e fica registrado."],
    ["acao-cancelar-solicitacao", "admin-action", "Cancelar solicitação", "Retira um pedido ainda pendente.", "Quem solicitou (ou um Administrador) cancela; solicitação já decidida não pode ser cancelada."],
  ] as const).map(([id, kind, title, shortDescription, description]): FeatureHelpDefinition => ({
    ...D, id: `integracoes.contatos-externos.${id}`, kind, title, shortDescription, description, permissions: id === "acao-aprovar-solicitacao" || id === "acao-recusar-solicitacao" ? P_ADMIN : P_MANAGE,
  })),
];
