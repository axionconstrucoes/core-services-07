// Catálogo de ajuda do módulo "fontes" — ingestão HUMANA de indícios de Qualidade a partir de outros módulos (SSMA, e-mails e anexos,
// diários de obra, relatórios de fiscalização) e triagem assistida. Arquivo EXCLUSIVO do agente deste módulo (I1).
// Tudo aqui descreve o que o CÓDIGO faz: lib/quality/ingestion.ts, app/[projectId]/fontes-qualidade/actions.ts, components/quality/register-quality-indication.tsx,
// lib/ai/experts/quality-analyst/triage.ts e as RPCs quality_find_by_origin / quality_ncr_create (migration 20261122101000).
import type { FeatureHelpDefinition } from "../types";

const D = { module: "fontes", version: "2026-11-20" } as const;

const PERMISSAO_REGISTRO =
  "Registrar exige papel ADMINISTRADOR, GERENTE, GESTOR ou COLABORADOR ativo na obra (função quality_can_register); LEITURA apenas consulta. A tela não é a autoridade: o banco (RLS e RPC) recusa quem não tem o papel.";

export const FONTES_HELP: FeatureHelpDefinition[] = [
  {
    ...D,
    id: "fontes.indicio.botao",
    kind: "button",
    title: "Registrar indício de Qualidade",
    shortDescription: "Leva esta foto, e-mail, diário ou relatório à Qualidade como indício, sem duplicar RNC já existente.",
    description:
      "Ação humana que transforma uma fonte já existente no ACC (registro de campo ou checklist SSMA, e-mail, anexo de e-mail ou documento como diário de obra e relatório de fiscalização) em um indício de Qualidade rastreável até a fonte original.",
    purpose: "Dar entrada na Qualidade a um possível desvio visto em outro módulo, uma única vez por fonte, sem que ninguém precise recopiar dados.",
    howToUse: [
      "Clique no botão: o ACC consulta primeiro se a mesma fonte já tem RNC ativa.",
      "Se já tem, a tela mostra o código e o estado da RNC existente e não cria nada.",
      "Se não tem, preencha o formulário (título, o que foi observado e classificação) e confirme.",
    ],
    howItWorks:
      "O botão chama a função quality_find_by_origin (dedupe por chave TIPO:referência da origem, em minúsculas). Sem RNC ativa, a ação de servidor chama a RPC quality_ncr_create (RNC nasce em DETECTADA, com código sequencial do projeto) e grava uma linha em quality_evidence apontando para a fonte original (tabela, id e caminho interno). RNC DUPLICADA ou CANCELADA libera a origem. Para documentos, a consulta cobre os três tipos (diário, fiscalização, documento), então mudar o tipo não gera uma segunda RNC da mesma versão.",
    data: ["Referência da fonte (id interno do registro, e-mail, anexo ou versão de documento).", "Título, descrição e classificação informados por quem registra."],
    criteria: [
      "A classificação oferecida é SUSPEITA, INDÍCIO ou RISCO POTENCIAL; NC COMPROVADA nunca é oferecida nem aceita aqui, porque exige investigação e confirmação da RNC.",
      "Uma mesma origem não gera duas RNC ativas no projeto (índice único no banco, além da consulta prévia).",
    ],
    source: "Tabelas quality_ncrs (RNC) e quality_evidence (evidência) via RPC quality_ncr_create e INSERT sob RLS; a fonte original não é alterada.",
    consequences: [
      "Cria uma RNC em DETECTADA com a evidência vinculada; a trilha de auditoria da Qualidade registra a criação.",
      "Não envia e-mail, não notifica o cliente e não classifica nada como NC comprovada.",
    ],
    permissions: PERMISSAO_REGISTRO,
    limitations: [
      "Na triagem de documentos (diário de obra e fiscalização) não há leitura automática do conteúdo; a pessoa descreve o que viu.",
      "Duas pessoas registrando a mesma origem ao mesmo tempo: o banco mantém uma única RNC e a outra recebe a informação de que ela já existe.",
    ],
    humanReview: "Toda RNC criada aqui segue o fluxo normal da Qualidade e só avança por decisão de pessoas autorizadas.",
  },
  {
    ...D,
    id: "fontes.indicio.tipo-fonte",
    kind: "field",
    title: "Tipo da fonte",
    shortDescription: "Escolha se o documento é diário de obra, relatório de fiscalização ou documento comum.",
    description:
      "Seletor que só aparece em documentos. Define o tipo de origem gravado na RNC e na evidência: DIÁRIO DE OBRA, FISCALIZAÇÃO ou DOCUMENTO. Para uma versão marcada como Diário de Obra o padrão já é Diário de Obra.",
    purpose: "Permitir distinguir, na Qualidade, de onde veio o indício, porque a origem muda a leitura (diário é relato da obra; fiscalização é parecer externo).",
    howToUse: ["Escolha o tipo que melhor descreve o documento antes de registrar."],
    criteria: ["O ACC não deduz fiscalização pelo conteúdo: a escolha é humana."],
    source: "Coluna origin_type de quality_ncrs e source_type de quality_evidence.",
    permissions: PERMISSAO_REGISTRO,
    missingData: "Sem escolha, vale o padrão sugerido pela versão do documento.",
  },
  {
    ...D,
    id: "fontes.indicio.titulo",
    kind: "field",
    title: "Título do indício",
    shortDescription: "Nome curto da RNC que será aberta (3 a 300 caracteres).",
    description: "Título da RNC. Vem preenchido com o rótulo da fonte (assunto do e-mail, categoria e local do registro de campo, título do documento) e pode ser ajustado.",
    purpose: "Identificar a RNC na lista da Qualidade.",
    criteria: ["Entre 3 e 300 caracteres (limites do banco)."],
    source: "Coluna title de quality_ncrs.",
    permissions: PERMISSAO_REGISTRO,
  },
  {
    ...D,
    id: "fontes.indicio.descricao",
    kind: "field",
    title: "O que foi observado",
    shortDescription: "Descreva o que você viu na fonte, sem concluir causa nem gravidade.",
    description:
      "Texto livre (até 4000 caracteres) com a observação de quem registra. É gravado na RNC e na evidência junto da referência à fonte original. Descreva o que se vê ou lê, não a causa nem o diagnóstico.",
    purpose: "Dar contexto à primeira avaliação da Qualidade.",
    howToUse: ["Escreva fatos observáveis; deixe hipóteses de causa para a investigação da RNC."],
    source: "Colunas description de quality_ncrs e de quality_evidence.",
    permissions: PERMISSAO_REGISTRO,
    missingData: "Campo opcional: vazio, a evidência usa o título como descrição.",
    limitations: ["O texto é conteúdo humano e pode estar incompleto; ele não prova a não conformidade."],
  },
  {
    ...D,
    id: "fontes.indicio.classificacao",
    kind: "field",
    title: "Classificação do indício",
    shortDescription: "Suspeita, Indício ou Risco potencial. NC comprovada não é oferecida aqui.",
    description:
      "Força probatória que você atribui à fonte: SUSPEITA (primeira impressão), INDÍCIO (há elemento concreto) ou RISCO POTENCIAL (não prova não conformidade, aponta um risco). A classificação NC COMPROVADA só se obtém na investigação da RNC.",
    purpose: "Evitar que um indício inicial seja tratado como não conformidade comprovada.",
    criteria: ["Apenas as três classificações acima são aceitas pela ação de servidor; NC COMPROVADA é rejeitada com mensagem."],
    source: "Coluna classification de quality_evidence; regra em lib/quality/ingestion.ts.",
    permissions: PERMISSAO_REGISTRO,
    humanReview: "A classificação é decisão de quem registra e pode ser revista pela Qualidade; nenhuma automação classifica NC COMPROVADA.",
  },
  {
    ...D,
    id: "fontes.indicio.confirmar",
    kind: "button",
    title: "Registrar RNC com esta evidência",
    shortDescription: "Confirma: cria a RNC em DETECTADA e a evidência apontando para a fonte original.",
    description: "Envia o formulário. A ação repete a consulta de duplicidade antes de criar, valida os campos e só então chama a RPC de criação.",
    consequences: [
      "Se a origem já tem RNC ativa, nada é criado e o código existente é mostrado.",
      "Se a RNC for criada mas a evidência falhar, a tela avisa para registrar a evidência na RNC; a RNC não é desfeita.",
    ],
    source: "RPC quality_ncr_create; INSERT em quality_evidence sob RLS (created_by = usuário logado).",
    permissions: PERMISSAO_REGISTRO,
  },
  {
    ...D,
    id: "fontes.indicio.duplicidade",
    kind: "message",
    title: "Origem já registrada",
    shortDescription: "Esta fonte já tem RNC ativa; o ACC não cria outra.",
    description:
      "Mensagem exibida quando quality_find_by_origin encontra uma RNC ativa para a mesma origem. Mostra o código e o estado e oferece o caminho para abrir a Qualidade.",
    purpose: "Garantir que a mesma foto, e-mail ou documento não gere duas RNC (dedupe Qualidade x SSMA e demais origens).",
    criteria: ["RNC em DUPLICADA ou CANCELADA não bloqueia: libera a origem para novo registro."],
    source: "Função quality_find_by_origin sobre quality_ncrs (chave de origem quality_origin_key).",
  },
  {
    ...D,
    id: "fontes.indicio.triagem",
    kind: "button",
    title: "Triagem assistida (inferência)",
    shortDescription: "Pede ao Analista de Qualidade uma observação, hipóteses e incertezas; grava como INFERÊNCIA para revisão.",
    description:
      "Disponível para foto SSMA, e-mail e anexo, depois que a RNC da origem existe. Monta o contexto da fonte (conteúdo externo tratado como dado, nunca como instrução), obtém a saída do provedor de triagem, valida-a e, se aprovada, anexa à RNC uma evidência classificada SUSPEITA com tipo epistêmico INFERÊNCIA.",
    purpose: "Acelerar a leitura inicial sem substituir a inspeção: a saída traz observação objetiva, hipótese, incerteza e necessidade de inspeção.",
    howToUse: ["Registre o indício primeiro; depois clique em Triagem assistida.", "Revise o resultado na evidência da RNC antes de qualquer decisão."],
    howItWorks:
      "A validação (validateQualityAssessment) rejeita linguagem de diagnóstico definitivo, prova de conformidade, medida estimada a partir de foto, fato sem evidência e criticidade que não siga a regra do pior pilar. Saída rejeitada não é gravada e a tela mostra os motivos. Nesta fase o único provedor é SIMULADO (determinístico, não lê a imagem) e fica desligado por padrão: sem a configuração do ambiente a ação responde que a triagem está indisponível. Nenhuma IA real é chamada.",
    data: ["Texto da fonte lido sob as permissões da obra (assunto e corpo do e-mail, categoria, local e descrição do registro de campo, título e campos do checklist)."],
    criteria: ["A evidência gravada é sempre INFERÊNCIA e SUSPEITA; nunca NC COMPROVADA.", "Uma triagem por fonte e RNC; repetir informa que já foi registrada."],
    source: "Evidência em quality_evidence (source_ref com sufixo #triagem-assistida); lógica em lib/ai/experts/quality-analyst/triage.ts.",
    consequences: ["Acrescenta uma evidência à RNC; não altera a fonte original, não muda o estado da RNC e não envia nada."],
    permissions: PERMISSAO_REGISTRO,
    limitations: [
      "Nunca é diagnóstico estrutural definitivo, laudo ou prova de conformidade.",
      "Provedor real de IA não está ligado nesta fase.",
      "Não cobre documentos de diário e fiscalização.",
    ],
    humanReview: "Revisão humana obrigatória: a inferência só vale depois de confirmada por inspeção e por pessoa competente.",
  },
];
