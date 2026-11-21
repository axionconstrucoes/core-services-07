// Catálogo de ajuda — FASE 6 / H2a: Competências e Aprovações externas. Arquivo NOVO; entra no registry por 2 linhas.
// Descreve o que o CÓDIGO faz (app/[projectId]/competencias, app/[projectId]/aprovacoes-externas, lib/governance e as migrations
// 20261205100000, 20261205102000 e 20261208100000). A tela espelha as regras; a autoridade é a RPC/RLS do banco.
import type { FeatureHelpDefinition } from "../types";

const D = { module: "governanca", version: "2026-11-21" } as const;
const P_ADMIN = "Administrador do projeto (solicitar competência, designar e revogar validador). Validar e revalidar: administrador ou validador designado ativo, nunca a pessoa nem quem solicitou/concedeu. O banco recusa o que a tela deixar passar.";
const P_COMP = "Qualquer membro ativo vê a página; cada pessoa vê as próprias competências e solicitações, e administradores/gestores veem as da obra (RLS). Quem não é membro ativo recebe 404.";
const P_APROV = "Preparar: Colaborador, Gestor, Gerente ou Administrador. Decidir: Gestor, Gerente ou Administrador; a minuta de Seguros só o Administrador. Leitura e não-membros recebem 404; o banco repete a regra.";

type Extra = Partial<FeatureHelpDefinition>;
const e = (id: string, kind: NonNullable<FeatureHelpDefinition["kind"]>, title: string, shortDescription: string, description: string, extra: Extra = {}): FeatureHelpDefinition => ({
  ...D, id: `governanca.${id}`, kind, title, shortDescription, description, ...extra,
});
const field = (id: string, title: string, shortDescription: string, description: string, extra: Extra = {}) => e(id, "field", title, shortDescription, description, extra);
const action = (id: string, title: string, shortDescription: string, description: string, extra: Extra = {}) => e(id, "admin-action", title, shortDescription, description, extra);

export const GOVERNANCA_HELP: FeatureHelpDefinition[] = [
  // ---------------- Competências ----------------
  e("competencias.menu", "module", "Competências", "Habilitação profissional validada por pessoa independente, revalidação e validadores designados.",
    "Item do menu que abre a tela de Competências da obra: solicitações de competência (Responsável técnico, Jurídico, Seguros), validação independente da habilitação, revalidação das competências anteriores e validadores designados.", { permissions: P_COMP }),
  e("competencias.pagina", "page", "Competências", "Quem pode praticar atos que exigem habilitação (laudo técnico, minuta, sinistro) e como essa habilitação foi comprovada.",
    "Tela de governança das competências profissionais. A competência só vale com evidência documental conferida por pessoa independente da solicitação; competências concedidas antes da regra de revalidação não valem para atos críticos até serem revalidadas. Cargo de gestão e registro CREA/OAB declarado não comprovam habilitação.",
    {
      purpose: "Impedir autoconcessão de poderes especializados e deixar a trilha de quem validou o quê.",
      howToUse: ["Administrador: registre a solicitação com o documento de evidência; outra pessoa (segundo administrador ou validador designado) valida.", "Validador: confira o documento, marque a confirmação e descreva o que conferiu; só então a competência passa a valer.", "Competências anteriores aparecem em Revalidação pendente e precisam ser revalidadas."],
      howItWorks: "Leitura pelo cliente de sessão (RLS). Toda gravação passa por RPC (project_competence_request_create/_cancel/_decide, project_competence_validator_designate/_accept/_revoke e project_competence_revalidate), que valida papel, independência, evidência e versão do registro e grava trilha append-only e auditoria.",
      data: ["project_competences, project_competence_requests, project_competence_validators", "project_competence_governance_events (trilha), documents (evidência)"],
      permissions: P_COMP,
      missingData: "Dado ausente aparece como SEM DADOS; nunca como 'ninguém tem competência'.",
      limitations: ["O ACC não consulta o conselho profissional (CREA/OAB/SUSEP): quem valida a habilitação é uma pessoa, com evidência documental.", "Esta tela não envia e-mail."],
      humanReview: "A validação de habilitação é decisão humana documentada; o sistema só registra e impede a autovalidação.",
    }),
  e("competencias.resumo", "message", "Como a competência passa a valer", "Resumo das regras: evidência documental, validação independente e revalidação antes de atos críticos.",
    "Explica, em uma frase por regra, que cargo de gestão não é competência, que o registro profissional declarado não comprova habilitação e que a competência só vale com evidência conferida por pessoa independente e, no caso das anteriores, revalidada.", { permissions: P_COMP }),
  e("competencias.lista", "table", "Competências da obra", "Competências registradas com a situação atual, vigência, evidência e quem concedeu ou revalidou.",
    "Lista as competências que você pode ver (administradores e gestores veem todas; os demais, as próprias). Cada linha mostra a situação derivada: Vale, Aguarda revalidação, Sem validação, Vencida, Ainda não iniciou ou Revogada.",
    { source: "project_competences (somente leitura, RLS).", criteria: ["Só 'Vale' concede poder: habilitação validada, dentro da vigência e com revalidação em dia.", "Valor ausente ou desconhecido nunca vale (fail-closed)."], missingData: "Sem registros visíveis a tela informa SEM DADOS e explica que isso não prova ausência de competência.", permissions: P_COMP }),
  e("competencias.situacao", "status", "Situação da competência", "Vale, aguarda revalidação, sem validação, vencida, ainda não iniciou ou revogada.",
    "Selo calculado a partir dos dados do registro com a mesma regra do banco (acc_user_has_competence). 'Aguarda revalidação' significa que a competência foi concedida antes da regra de revalidação e não vale para atos críticos até ser revalidada.", { criteria: ["Habilitação VALIDATED ou MAINTENANCE, status ACTIVE, dentro da vigência e revalidação CURRENT => Vale."], permissions: P_COMP }),
  e("competencias.revalidacao", "table", "Revalidação pendente", "Competências anteriores que precisam de revalidação independente antes de qualquer ato crítico.",
    "Lista as competências concedidas antes da regra de revalidação (marcadas como exigindo revalidação pela migration 20261208100000). Enquanto não forem revalidadas, os atos críticos (decisão de sinistro, aprovação de minuta, laudo técnico) são recusados com mensagem clara. Revalidar exige administrador ou validador designado ativo que não seja a pessoa nem quem concedeu.",
    { source: "project_competences (revalidation_status = REQUIRED).", consequences: ["Revalidar devolve o poder e grava a trilha REVALIDATED e a auditoria central.", "Sem evidência documental no projeto, a revalidação é recusada: revogue e solicite de novo."], permissions: P_ADMIN }),
  field("competencias.campo-nota", "Nota da validação / do que foi conferido", "Descreva o que foi conferido no documento de evidência (mín. 20 caracteres; recusa: mín. 10).",
    "Texto obrigatório que fica na trilha: o validador registra o que verificou (documento, registro, validade). Nota curta é recusada pelo banco.", { permissions: P_ADMIN }),
  field("competencias.campo-evidencia-conferida", "Conferi a evidência documental", "Confirmação expressa de que o documento de evidência foi realmente conferido.",
    "Sem marcar esta confirmação o banco recusa a validação e a revalidação (EVIDENCE_CHECK_REQUIRED).", { permissions: P_ADMIN }),
  action("competencias.acao-revalidar", "Revalidar competência", "Revalida uma competência anterior e devolve o poder para atos críticos.",
    "Chama project_competence_revalidate com a versão do registro. Recusa quem recebeu ou concedeu a competência, quem não é administrador nem validador designado ativo, nota curta, evidência não conferida ou ausente e versão desatualizada.", { permissions: P_ADMIN }),
  e("competencias.solicitacoes", "table", "Solicitações de competência", "Solicitações pendentes e decididas, com quem solicitou, evidência, validador e nota.",
    "Cada solicitação mostra a pessoa, a competência, o documento de evidência, o prazo para validar (30 dias) e a decisão. Uma solicitação NÃO produz poderes: só a validação independente aprovada cria a competência.",
    { source: "project_competence_requests (somente leitura, RLS).", consequences: ["Validar cria a competência na mesma transação.", "Solicitação vencida sem decisão é encerrada e não concede nada."], permissions: P_ADMIN }),
  action("competencias.nova-solicitacao", "Solicitar competência", "Registra uma solicitação de competência com documento de evidência; não concede poder.",
    "Formulário exclusivo do administrador. A pessoa precisa ser membro ativo e o documento de evidência precisa estar no projeto. Mesmo a autossolicitação do administrador não concede poder.", { permissions: P_ADMIN }),
  field("competencias.campo-pessoa", "Pessoa", "Membro ativo do projeto que receberá a competência.", "Lista os membros ativos da obra. O banco recusa quem não for membro ativo.", { permissions: P_ADMIN }),
  field("competencias.campo-competencia", "Competência", "Responsável técnico, Jurídico ou Seguros.", "Lista fechada de competências; cada uma habilita atos específicos (laudo técnico, decisão de sinistro, aprovação de minuta e conferência de endosso crítico).", { permissions: P_ADMIN }),
  field("competencias.campo-documento", "Documento de evidência", "Documento do projeto que comprova a habilitação (diploma, registro, certidão).", "Obrigatório. Precisa estar anexado ao próprio projeto. O registro CREA/OAB digitado não substitui o documento.", { permissions: P_ADMIN }),
  field("competencias.campo-registro-tipo", "Tipo de registro declarado", "CREA, CAU, OAB, SUSEP ou outro (opcional).", "Informação declarada, guardada junto à solicitação. Não comprova habilitação e não é validada junto ao conselho.", { permissions: P_ADMIN }),
  field("competencias.campo-registro-numero", "Número do registro", "Número do registro profissional declarado (opcional, exige o tipo).", "Até 60 caracteres. Texto declarado, sem nenhuma validação externa junto ao conselho profissional.", { permissions: P_ADMIN }),
  field("competencias.campo-vigencia", "Vigência até", "Data final da competência (opcional); depois dela a competência deixa de valer.", "Sem data final a competência não vence por prazo. Datas já passadas são recusadas.", { permissions: P_ADMIN }),
  field("competencias.campo-observacao", "Observação", "Base da solicitação (até 1000 caracteres).", "Texto livre, de até 1000 caracteres, que acompanha a solicitação e fica registrado na trilha.", { permissions: P_ADMIN }),
  action("competencias.acao-solicitar", "Registrar solicitação", "Registra a solicitação; ela aguarda a validação independente.", "Chama project_competence_request_create. Não concede poder e não envia e-mail.", { permissions: P_ADMIN }),
  action("competencias.acao-validar", "Validar habilitação", "Valida a habilitação com evidência conferida e cria a competência.", "Chama project_competence_request_decide (APPROVE). Exige administrador ou validador designado ativo diferente de quem solicitou e de quem receberá; exige confirmação de evidência conferida e nota de 20+ caracteres.", { permissions: P_ADMIN }),
  action("competencias.acao-recusar", "Recusar solicitação", "Recusa a solicitação com motivo; nenhum poder é concedido.", "Chama project_competence_request_decide (REJECT) com nota de 10+ caracteres.", { permissions: P_ADMIN }),
  action("competencias.acao-cancelar", "Cancelar solicitação", "Cancela uma solicitação pendente (quem solicitou).", "Chama project_competence_request_cancel com o motivo (10+ caracteres) e a versão do registro.", { permissions: P_ADMIN }),
  field("competencias.campo-motivo", "Motivo", "Motivo com no mínimo 10 caracteres, gravado na trilha.", "Obrigatório em cancelamentos e revogações; fica na trilha e na auditoria.", { permissions: P_ADMIN }),
  e("competencias.validadores", "table", "Validadores designados", "Pessoas designadas (com documento, prazo de até 180 dias e aceite) para validar habilitação.",
    "Regularização segura para obra com um único administrador: o administrador designa um validador independente com documento (ata ou ofício), prazo de no máximo 180 dias e justificativa; a designação só vale depois do aceite da própria pessoa e é revogável. O validador não vira membro nem ganha acesso à obra por isso; para abrir esta tela ele precisa de ao menos uma membership ativa.",
    { source: "project_competence_validators (somente leitura, RLS).", permissions: P_ADMIN, limitations: ["Validador vencido ou revogado não valida."] }),
  action("competencias.acao-aceitar", "Aceitar designação", "A pessoa designada aceita ser validadora; sem aceite a designação não vale.", "Chama project_competence_validator_accept; só a própria pessoa designada pode aceitar, dentro do prazo.", { permissions: P_COMP }),
  field("competencias.campo-validador-pessoa", "Membro do projeto (validador)", "Membro ativo do projeto a designar como validador.", "Escolha um membro; ou informe abaixo o perfil de uma pessoa externa. O administrador não pode designar a si mesmo.", { permissions: P_ADMIN }),
  field("competencias.campo-validador-externo", "ID do perfil externo", "UUID do perfil da pessoa externa, quando ela não é membro do projeto.", "A pessoa precisa já ter perfil no ACC (entrou uma vez com a conta Google). Quando preenchido, prevalece sobre a escolha do membro.", { permissions: P_ADMIN }),
  field("competencias.campo-validador-documento", "Documento da designação", "Ata ou ofício da diretoria, anexado ao projeto, que designa o validador.", "Obrigatório; o documento precisa estar anexado ao próprio projeto e fica ligado à designação na trilha.", { permissions: P_ADMIN }),
  field("competencias.campo-validador-justificativa", "Justificativa da designação", "Por que esta pessoa é validadora (mín. 20 caracteres).", "Texto obrigatório (mínimo de 20 caracteres) que explica a escolha e fica gravado na trilha da designação.", { permissions: P_ADMIN }),
  field("competencias.campo-validador-prazo", "Prazo da designação", "Data final da designação, no máximo 180 dias a partir de hoje.", "O banco recusa prazo já vencido ou superior a 180 dias a partir de hoje; depois do prazo o validador deixa de validar.", { permissions: P_ADMIN }),
  action("competencias.acao-designar", "Designar validador", "Registra a designação (proposta); ela só vale depois do aceite.", "Chama project_competence_validator_designate. Recusa autodesignação, documento fora do projeto, justificativa curta e prazo inválido.", { permissions: P_ADMIN }),
  action("competencias.acao-revogar", "Revogar designação", "Revoga o validador imediatamente, com motivo.", "Chama project_competence_validator_revoke. Revogar não desfaz validações já feitas; apenas impede novas.", { permissions: P_ADMIN }),
  e("competencias.trilha", "table", "Trilha de governança", "Eventos recentes de solicitação, validação, revalidação e validadores.",
    "Últimos eventos da trilha append-only de governança de competências (ninguém altera nem apaga, nem o superusuário). Visível a administradores e gestores.", { source: "project_competence_governance_events (somente leitura, RLS).", permissions: P_ADMIN }),

  // ---------------- Aprovações externas ----------------
  e("aprovacoes.menu", "module", "Aprovações externas", "Preparação e decisão de comunicações a destinatários externos (uso único, com hash do conteúdo).",
    "Item do menu que abre a tela de aprovação de comunicações externas. Esta tela nunca envia e-mail.", { permissions: P_APROV }),
  e("aprovacoes.pagina", "page", "Aprovações externas", "Prepare e decida envios a destinatários externos; a aprovação vale uma vez e fica presa ao conteúdo.",
    "Colaborador (ou acima) prepara o envio informando destinatários, ação e conteúdo; gestor, gerente ou administrador decide (minuta de Seguros: só administrador). Aprovar grava uma confirmação de uso único, ligada à ação, aos destinatários e ao hash SHA-256 do conteúdo; qualquer mudança exige nova aprovação. A análise de e-mails externos recebidos ou enviados é automática e independente desta aprovação.",
    {
      purpose: "Garantir que cada envio a destinatário externo foi autorizado por quem tem alçada, para aquele conteúdo e aqueles destinatários.",
      howToUse: ["Prepare: escolha contexto e ação, informe destinatários, assunto, texto e anexos.", "O aprovador vê destinatários (externos destacados), ação, conteúdo, versão e a conferência do hash e decide.", "Aprovações valem 24 horas e uma única vez."],
      howItWorks: "Server actions finas chamam acc_external_send_prepare_with_content, acc_external_send_decide e acc_external_send_cancel. O banco confere que o hash informado é o SHA-256 do conteúdo, grava o conteúdo (append-only) e a auditoria. O consumo da autorização é do fluxo de envio.",
      data: ["external_send_preparations, external_send_preparation_contents", "external_recipient_confirmations (uso único) e auditoria"],
      permissions: P_APROV,
      missingData: "Sem conteúdo registrado, a tela avisa SEM DADOS e sugere recusar e preparar de novo.",
      limitations: ["Nada é enviado por esta tela; o envio real continua bloqueado pelas travas do ACC.", "Esta tela não consome a autorização (uso único)."],
      humanReview: "Aprovar um envio é decisão humana; o ACC só garante que o que foi aprovado é exatamente o que será usado.",
    }),
  e("aprovacoes.pendentes", "table", "Aguardando decisão", "Preparações abertas, com destinatários, ação, conteúdo, versão e hash.",
    "Cada cartão mostra contexto, ação, quem preparou, versão, destinatários (externos destacados), o conteúdo registrado e a conferência do hash. Quem não tem alçada vê o motivo; o preparador pode cancelar.", { source: "external_send_preparations e external_send_preparation_contents (somente leitura, RLS).", permissions: P_APROV }),
  e("aprovacoes.destinatarios", "status", "Destinatários da preparação", "Destinatário EXTERNO (exige aprovação) ou interno/permitido (dispensa).",
    "A classificação vem do banco no momento da preparação (acc_recipient_domain_status). Qualquer domínio externo válido pode ser usado, mediante aprovação; a lista de domínios internos/permitidos só dispensa a confirmação, não é allowlist.", { permissions: P_APROV }),
  e("aprovacoes.hash", "status", "Hash do conteúdo", "SHA-256 do conteúdo aprovado e sua conferência com o conteúdo guardado.",
    "O hash é calculado sobre o JSON canônico (assunto, texto com quebras LF e aparado, anexos ordenados). A tela recalcula o hash do conteúdo guardado e informa se confere; divergência desabilita a aprovação.", { formula: "SHA-256 hex minúsculo de {subject, body, attachments} canônico (lib/governance/external-send-binding.ts e acc_external_send_content_hash).", permissions: P_APROV }),
  field("aprovacoes.campo-motivo", "Motivo da decisão", "Motivo de pelo menos 10 caracteres (obrigatório para aprovar envio externo, recusar ou cancelar).", "Texto gravado na própria preparação e na auditoria; motivo curto (menos de 10 caracteres) é recusado pelo banco.", { permissions: P_APROV }),
  action("aprovacoes.acao-aprovar", "Aprovar (uso único)", "Aprova o envio: grava confirmação de uso único ligada à ação, destinatários e hash. Não envia.", "Chama acc_external_send_decide (APPROVE). Minuta de Seguros só o administrador. A aprovação vale 24 horas e é pessoal: só quem aprovou a usa.", { permissions: P_APROV }),
  action("aprovacoes.acao-recusar", "Recusar", "Recusa a preparação com motivo; nada é autorizado.", "Chama acc_external_send_decide (REJECT) com motivo de 10+ caracteres.", { permissions: P_APROV }),
  action("aprovacoes.acao-cancelar", "Cancelar preparação", "Cancela a preparação aberta (preparador ou gestão), com motivo.", "Chama acc_external_send_cancel; uma preparação cancelada não reabre.", { permissions: P_APROV }),
  action("aprovacoes.nova", "Preparar envio externo", "Registra a preparação (destinatários, ação, conteúdo, versão); não envia.", "Formulário de colaborador ou acima. O ACC normaliza o conteúdo, calcula o hash SHA-256 e o banco o confere antes de gravar.", { permissions: P_APROV }),
  field("aprovacoes.campo-contexto", "Contexto", "Em qual fluxo o envio acontece (Seguros, Garantias, Qualidade, Solicitação de ação, Outro).", "A minuta de Seguros exige o administrador para aprovar; os demais, gestão.", { permissions: P_APROV }),
  field("aprovacoes.campo-acao", "Ação", "Envio novo, resposta, encaminhamento, cadastro de canal ou solicitação de ação.", "A autorização vale só para a ação aprovada; usar em outra ação é recusado.", { permissions: P_APROV }),
  field("aprovacoes.campo-versao", "Versão do conteúdo", "Rótulo da versão (1 a 60 caracteres), por exemplo v1.", "Fica ligado à preparação; mudar o conteúdo exige nova preparação e nova aprovação.", { permissions: P_APROV }),
  field("aprovacoes.campo-destinatarios", "Destinatários", "Um e-mail por linha, no máximo 20; endereços inválidos são recusados.", "Normalizados (minúsculas, sem repetição). Quem vier como externo exigirá aprovação.", { permissions: P_APROV }),
  field("aprovacoes.campo-assunto", "Assunto", "Assunto do e-mail (até 300 caracteres).", "Faz parte do conteúdo protegido pelo hash: mudar o assunto depois da aprovação exige nova aprovação.", { permissions: P_APROV }),
  field("aprovacoes.campo-texto", "Texto do envio", "Corpo do e-mail (até 20000 caracteres).", "Obrigatório. Conteúdo de terceiros citado aqui continua sendo dado não confiável.", { permissions: P_APROV }),
  field("aprovacoes.campo-anexos", "Anexos", "Nomes dos anexos, um por linha (até 20).", "Apenas os nomes entram no hash; os arquivos em si não são enviados por esta tela.", { permissions: P_APROV }),
  action("aprovacoes.acao-preparar", "Preparar (não envia)", "Registra a preparação e o conteúdo; aguarda a decisão de quem tem alçada.", "Chama acc_external_send_prepare_with_content. Nada é enviado.", { permissions: P_APROV }),
  e("aprovacoes.historico", "table", "Histórico de aprovações", "Preparações já decididas, canceladas ou usadas, com destinatários e motivo.", "Lista as preparações encerradas com quem decidiu, quando e o motivo registrado.", { source: "external_send_preparations (somente leitura, RLS).", permissions: P_APROV }),
];
