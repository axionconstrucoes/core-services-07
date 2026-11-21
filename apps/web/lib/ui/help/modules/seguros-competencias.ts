// Catálogo de ajuda do módulo "seguros" — FASE 4 / A: competências profissionais por membro/projeto (painel na aba Auditoria).
// Arquivo NOVO; conectado por UMA linha em ./seguros.ts e pelas entradas de ../manifests/seguros-competencias.ts (spread em ../manifests/seguros.ts).
import type { FeatureHelpDefinition } from "../types";
import { P_ADMIN, P_READ, seg } from "./seguros-base";

const LIMITE =
  "A identificação profissional (CREA, CAU, OAB, SUSEP) é um texto declarado pelo Administrador: o sistema não a valida junto ao conselho nem a inventa. Conferir a habilitação real é uma revisão humana.";
const ATOS =
  "Atos que exigem competência (o banco recusa sem ela, com a mensagem COMPETENCE_REQUIRED): Jurídico para decisão, negativa, contestação e indenização/cumprimento de sinistro; Seguros ou Jurídico para aprovar minuta para envio e conferir endosso crítico; Responsável técnico para o laudo técnico da RNC (confirmar, não confirmar, encerrar) e para o parecer de cobertura de garantia (coberta ou não coberta).";

export const SEGUROS_COMPETENCIAS: FeatureHelpDefinition[] = [
  seg(
    "competencias.painel",
    "page",
    "Competências profissionais",
    "Quem tem habilitação registrada (técnica, jurídica, seguros) para decisões que exigem mais que o nível de acesso.",
    `Competência é a habilitação profissional registrada pelo Administrador para uma pessoa neste projeto (tabela project_competences). O nível de acesso (Leitura, Colaborador, Gestor, Gerente, Administrador) mede autoridade de gestão e não substitui a competência: um Gestor não é, por isso, responsável técnico nem advogado. ${ATOS} ${LIMITE}`,
    {
      data: ["Pessoa, competência, situação (ativa, vencida, revogada), validade, registro declarado, quem concedeu e quando"],
      criteria: ["Vale se o registro está ativo, dentro da validade e a pessoa continua membro ativo do projeto", "Fail-closed: sem registro, vencida, revogada ou não carregada = sem competência"],
      source: "project_competences e project_competence_events (SELECT sob RLS: cada pessoa vê as próprias; gestão e administração veem as do projeto).",
      permissions: "Consulta: a própria pessoa e Gestor, Gerente ou Administrador. Concessão e revogação: somente Administrador.",
      humanReview: "Conferir a habilitação real da pessoa antes de conceder.",
    },
  ),
  seg("competencias.minhas", "message", "Minhas competências vigentes", "Lista as competências ativas que você tem neste projeto.", `Mostra apenas competências ativas e dentro da validade. Sem competência, as ações que a exigem ficam desabilitadas com a explicação. ${ATOS}`, { permissions: P_READ }),
  seg(
    "competencias.coluna-situacao",
    "status",
    "Coluna: situação da competência",
    "Ativa, vencida, ainda não vigente ou revogada.",
    "Ativa: dentro da validade e não revogada. Vencida: a data final passou. Ainda não vigente: começa no futuro. Revogada: o Administrador a revogou, com motivo (a revogação não apaga o histórico). Só competência ativa habilita decisões.",
    { permissions: P_READ },
  ),
  seg(
    "competencias.coluna-registro",
    "table",
    "Coluna: registro profissional (declarado)",
    "Tipo e número do registro profissional informados pelo Administrador, se houver.",
    `Texto opcional (CREA, CAU, OAB, SUSEP ou outro). ${LIMITE} Em branco aparece Não informado.`,
    { permissions: P_READ, missingData: "Registro não informado: a competência continua válida, mas sem identificação profissional registrada." },
  ),
  seg(
    "competencias.form-conceder",
    "button",
    "Formulário: conceder competência",
    "Registra a competência de uma pessoa neste projeto, com validade e identificação opcional.",
    `Chama project_competence_grant (SECURITY DEFINER, com auditoria na mesma transação). Exige que a pessoa seja membro ativo do projeto. O Administrador não concede a si mesmo: outro Administrador precisa conceder. Já existindo a mesma competência ativa, é preciso revogá-la antes. ${LIMITE}`,
    {
      permissions: P_ADMIN,
      consequences: ["A pessoa passa a poder executar, se tiver também o nível de acesso exigido, os atos que dependem dessa competência", "A concessão fica na trilha append-only de competências e na auditoria"],
    },
  ),
  seg("competencias.campo-pessoa", "field", "Pessoa (membro ativo)", "Quem receberá a competência; você não aparece na lista.", "Somente membros ativos do projeto, exceto você: o banco recusa a concessão a si mesmo (SELF_GRANT_FORBIDDEN).", { permissions: P_ADMIN }),
  seg("competencias.campo-competencia", "field", "Competência", "Responsável técnico, Jurídico ou Seguros.", ATOS, { permissions: P_ADMIN }),
  seg(
    "competencias.campo-validade",
    "field",
    "Validade da competência",
    "Data inicial e final da habilitação; sem data final, sem fim.",
    "Início padrão: hoje. A data final não pode ser anterior à inicial nem já ter passado. Depois da data final a competência deixa de valer sozinha.",
    { permissions: P_ADMIN },
  ),
  seg("competencias.campo-registro", "field", "Registro profissional (opcional)", "Tipo e número do registro, como declarados por você.", `Informe o tipo para informar o número (até 60 caracteres). ${LIMITE}`, { permissions: P_ADMIN }),
  seg("competencias.campo-observacao", "field", "Observação / base da concessão", "Por que a pessoa tem essa competência (opcional).", "Texto livre de até 1000 caracteres, gravado no registro e na trilha de auditoria.", { permissions: P_ADMIN }),
  seg("competencias.conceder", "button", "Conceder competência", "Grava a competência e a auditoria.", "Chama project_competence_grant. Se a pessoa, a competência ou a validade forem inválidas, nada é gravado e a mensagem explica o motivo.", { permissions: P_ADMIN }),
  seg("competencias.revogar-abrir", "button", "Revogar (abrir)", "Abre o formulário para revogar a competência desta linha.", "Apenas abre o formulário; nada é gravado até confirmar com o motivo.", { permissions: P_ADMIN }),
  seg(
    "competencias.form-revogar",
    "button",
    "Formulário: revogar competência",
    "Revoga a competência com motivo; o histórico é preservado.",
    "Chama project_competence_revoke com controle de versão e motivo de pelo menos 10 caracteres. A competência revogada não é reaberta: para restabelecer, conceda de novo. Decisões já registradas não são alteradas.",
    { permissions: P_ADMIN },
  ),
  seg("competencias.campo-motivo-revogacao", "field", "Motivo da revogação", "Por que a competência foi revogada (mínimo de 10 caracteres).", "Obrigatório (REASON_REQUIRED). Fica gravado no registro e na trilha de auditoria.", { permissions: P_ADMIN }),
  seg("competencias.revogar", "button", "Confirmar revogação", "Grava a revogação e a auditoria.", "Chama project_competence_revoke. Se outra pessoa alterou o registro antes (VERSION_CONFLICT), nada é gravado e a tela pede para recarregar.", { permissions: P_ADMIN }),
];
