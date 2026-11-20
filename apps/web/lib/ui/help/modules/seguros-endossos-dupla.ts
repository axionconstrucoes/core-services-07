// Catálogo de ajuda do módulo "seguros" — FASE 3 / C: endossos com DUPLA CONFERÊNCIA HUMANA INDEPENDENTE.
// Arquivo NOVO (não edita os catálogos existentes em massa); conectado por UMA linha em ./seguros.ts e pelas entradas de
// ../manifests/seguros-endossos-dupla.ts (spread em ../manifests/seguros.ts). Ids: "seguros.<tela>.<elemento>".
import type { FeatureHelpDefinition } from "../types";
import { P_MANAGE, P_READ, seg } from "./seguros-base";

const INDEP =
  "Independência imposta pelo banco: os dois conferentes são pessoas distintas entre si, ambas com nível de gestão, e nenhuma delas é quem solicitou o endosso nem quem registrou a emissão.";
const CONFLICT = "Se outra pessoa alterou o endosso antes (VERSION_CONFLICT), nada é gravado e a tela oferece Recarregar dados.";

export const SEGUROS_ENDOSSOS_DUPLA: FeatureHelpDefinition[] = [
  seg("endossos.campo-classificacao", "field", "O que o endosso altera (classificação)", "Marque os itens que o endosso altera; itens críticos exigem dupla conferência independente.",
    "Lista declarada (change_kinds) validada pelo banco. Críticos: segurado, beneficiário ou partes, obrigação garantida, valores (importância segurada, limite, prêmio, valor garantido) e coberturas (cláusula, exclusão, sublimite, franquia). Não críticos: prorrogação de vigência, dados cadastrais e outro comprovadamente sem item crítico.",
    {
      criteria: [
        "Qualquer item crítico marcado => dupla conferência humana independente",
        "Nada marcado, ou lista inválida => tratado como CRÍTICO (fail-closed)",
        "Mesmo classificado como não crítico, texto emitido diferente do solicitado exige dupla conferência",
      ],
      consequences: ["A classificação não pode ser rebaixada depois de crítica; o banco recusa a remoção da dupla conferência exigida."],
      missingData: "Em branco = SEM CLASSIFICAÇÃO: o endosso é tratado como crítico.",
      permissions: "Informada por quem registra o pedido (Administrador, Gestor, Gerente ou Colaborador).",
    }),
  seg("endossos.campo-classificacao-emissao", "field", "Itens que o texto emitido altera", "Acrescenta itens críticos que o texto EMITIDO traz e o pedido não declarou.",
    "Na emissão, quem registra pode marcar itens críticos que o texto emitido altera. O banco une o declarado no pedido ao declarado na emissão: a classificação só aumenta a criticidade, nunca a reduz.",
    { permissions: P_MANAGE, consequences: ["Marcar um item crítico torna a dupla conferência independente obrigatória."] }),
  seg("endossos.conferencias", "message", "Conferência humana independente", "Estado de cada conferência do endosso: autor, instante, resultado e nota.",
    `Lista as conferências da rodada atual (insurance_endorsement_reviews, append-only) e o andamento (por exemplo, 1 de 2 aprovadas). O endosso só passa a Conferido, e só então tem efeito de cobertura, depois das conferências exigidas. ${INDEP}`,
    {
      data: ["Conferências: número, resultado (aprovada ou recusada), autor, data e hora, nota", "Classificação declarada e motivo da dupla conferência"],
      criteria: [
        "Dupla conferência: 2 aprovações de usuários distintos; conferência simples: 1 aprovação",
        "Uma conferência recusada leva o endosso a Em revisão, sem efeito de cobertura",
        "Nova emissão abre uma nova rodada de conferências",
      ],
      source: "insurance_endorsement_reviews e insurance_endorsements (SELECT sob RLS).",
      permissions: P_READ,
      missingData: "Sem conferências na rodada, a tela informa que nenhuma foi registrada.",
    }),
  seg("endossos.status-dupla", "status", "Dupla conferência exigida, conferência simples ou histórica", "Indica quantas conferências humanas o endosso exige.",
    "Dupla conferência: endosso crítico, sem classificação ou com texto emitido diferente do solicitado. Conferência simples: classificação inteiramente não crítica e texto emitido igual ao solicitado. Conferência única (histórico): endosso conferido antes da dupla conferência; permanece válido e não é reaberto.",
    { criteria: ["Sem classificação válida = dupla conferência (fail-closed)", "O banco impede conferência simples sem classificação válida"], permissions: P_READ }),
  seg("endossos.coluna-conferencias", "table", "Coluna: conferências", "Conferências aprovadas sobre as exigidas na rodada atual.",
    "Mostra, para endossos emitidos, quantas conferências humanas foram aprovadas e quantas são exigidas (1 ou 2). Endossos solicitados, em análise ou recusados mostram Não se aplica; os históricos mostram Única (histórico).",
    { source: "insurance_endorsement_reviews (SELECT sob RLS).", permissions: P_READ }),
  seg("endossos.form-conferencia-recusa", "button", "Formulário: recusar a conferência", "Recusa a conferência do texto emitido, com motivo, e leva o endosso a Em revisão.",
    `Chama insurance_endorsement_review com resultado RECUSADO. Exige nota de pelo menos 20 caracteres. O endosso vai para EM_REVISAO, sem efeito de cobertura; a seguradora precisa corrigir e uma nova emissão abre nova rodada de conferências. ${INDEP}`,
    { permissions: P_MANAGE, consequences: ["Recusa de qualquer conferente impede o efeito de cobertura até nova emissão e nova dupla conferência."] }),
  seg("endossos.campo-nota-recusa-conferencia", "field", "Motivo da recusa da conferência", "Por que o texto emitido não pôde ser conferido.",
    "Obrigatório, mínimo de 20 caracteres (REVIEW_NOTE_REQUIRED). Fica gravado na conferência, que é append-only, e na auditoria.",
    { permissions: P_MANAGE }),
  seg("acoes.endosso-conferencia-recusar-abrir", "button", "Recusar conferência (abrir)", "Abre o formulário para recusar a conferência do endosso emitido.",
    "Apenas abre o formulário de recusa da conferência; nada é gravado até enviar. Fica bloqueado para quem solicitou o endosso, para quem registrou a emissão e para quem já conferiu na rodada.",
    { permissions: P_MANAGE }),
  seg("acoes.endosso-conferencia-recusar", "button", "Registrar recusa da conferência", "Grava a recusa da conferência e leva o endosso a Em revisão.",
    `Chama a RPC insurance_endorsement_review (SECURITY DEFINER, com auditoria e controle de versão) com resultado RECUSADO. Estado EM_REVISAO; sem efeito de cobertura. ${CONFLICT}`,
    { permissions: P_MANAGE }),
];
