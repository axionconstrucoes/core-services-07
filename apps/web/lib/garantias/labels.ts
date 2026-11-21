// Rótulos em português do módulo GARANTIAS (puro). Os códigos vêm das migrations 20261122100000/101000
// (estados, causas, bloqueios e erros das RPCs quality_warranty_*). Nada aqui decide regra de negócio.

import type { Criticality, WarrantyState } from "@/lib/quality/types";

export const WARRANTY_STATE_LABELS: Record<WarrantyState, string> = {
  ABERTA: "Aberta",
  EM_VISTORIA: "Em vistoria",
  EM_ANALISE: "Em análise",
  COBERTA: "Coberta",
  NAO_COBERTA: "Não coberta",
  EM_REPARO: "Em reparo",
  REPARADA: "Reparada",
  VERIFICADA: "Verificada",
  ENCERRADA: "Encerrada",
  REABERTA: "Reaberta",
  CANCELADA: "Cancelada",
};

/** Estados sem saída útil para o dia a dia (ENCERRADA ainda pode ser reaberta; CANCELADA é terminal). */
export const WARRANTY_OPEN_STATES: readonly WarrantyState[] = ["ABERTA", "EM_VISTORIA", "EM_ANALISE", "COBERTA", "EM_REPARO", "REPARADA", "VERIFICADA", "REABERTA"];

export function warrantyStateLabel(state: string): string {
  return (WARRANTY_STATE_LABELS as Record<string, string>)[state] ?? state;
}

export const CAUSE_CATEGORY_LABELS: Record<string, string> = {
  A_DEFINIR: "A definir (causa em investigação)",
  VICIO_OCULTO: "Vício oculto",
  SOLIDEZ_SEGURANCA: "Solidez e segurança",
  EXECUCAO: "Execução",
  MATERIAL: "Material",
  PROJETO: "Projeto",
  MAU_USO: "Mau uso",
  DESGASTE_NORMAL: "Desgaste normal",
  MANUTENCAO_AUSENTE: "Manutenção ausente",
  OUTRA: "Outra",
};

export const ORIGIN_LABELS: Record<string, string> = {
  EMAIL: "E-mail",
  RECLAMACAO_CLIENTE: "Reclamação de cliente",
  DOCUMENTO: "Documento",
  DIARIO_OBRA: "Diário de obra",
  INSPECAO: "Inspeção",
  MANUAL: "Manual",
};

export const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  SSMA_FOTO: "Foto SSMA",
  EMAIL: "E-mail",
  DIARIO_OBRA: "Diário de obra",
  FISCALIZACAO: "Relatório de fiscalização",
  INSPECAO: "Inspeção",
  ENSAIO_LAUDO: "Ensaio / laudo",
  DOCUMENTO: "Documento",
  OUTRO: "Outro",
};

export const CLASSIFICATION_LABELS: Record<string, string> = {
  SUSPEITA: "Suspeita",
  INDICIO: "Indício",
  NC_COMPROVADA: "NC comprovada",
  RISCO_POTENCIAL: "Risco potencial",
};

export const EPISTEMIC_LABELS: Record<string, string> = {
  FATO: "Fato",
  INFERENCIA: "Inferência",
  RECOMENDACAO: "Recomendação",
};

export const VERIFICATION_RESULT_LABELS: Record<string, string> = {
  EFICAZ: "Eficaz",
  INEFICAZ: "Ineficaz",
  PARCIAL: "Parcial",
};

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  SEM_REGISTRO: "SEM DADOS — nenhum registro de manutenção",
  SEM_COMPROVANTE: "Há registros SEM comprovante",
  COMPROVADO: "Todos os registros têm comprovante",
};

export const CRITICALITY_LABELS: Record<Criticality, string> = {
  SEM_DADOS: "SEM DADOS",
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

/** Bloqueios (quality_transition_blockers / evaluateTransition) em linguagem clara. */
export const BLOCKER_MESSAGES: Record<string, string> = {
  INVALID_TRANSITION: "Transição não prevista no ciclo de estados.",
  FORBIDDEN: "Seu perfil neste projeto não permite esta transição.",
  JUSTIFICATION_REQUIRED: "Justificativa obrigatória (mínimo de 10 caracteres).",
  EVIDENCE_REQUIRED: "Evidência obrigatória: vincule ao menos uma evidência do caso.",
  EFFECTIVENESS_VERIFICATION_REQUIRED: "Falta a verificação de eficácia do reparo (registre na aba Verificação e aceite).",
  VERIFICATION_EVIDENCE_REQUIRED: "A verificação de eficácia precisa de evidência.",
  LATEST_VERIFICATION_NOT_EFFECTIVE: "A última verificação de eficácia não foi EFICAZ.",
  VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN: "Houve novo reparo ou reabertura depois da última verificação: verifique de novo.",
  NOT_REPAIRED: "O caso ainda não está no estado Reparada.",
  NOT_VERIFIED: "O caso ainda não está no estado Verificada.",
  REPAIR_RECORD_REQUIRED: "Registre ao menos um reparo executado antes de marcar como Reparada.",
  CUSTOMER_ACCEPTANCE_REQUIRED: "Falta o aceite do cliente (data e nome de quem aceitou).",
  CUSTOMER_ACCEPTANCE_NOT_PROVEN: "O aceite do cliente foi apenas INFORMADO por usuário interno: registre o aceite COMPROVADO (evidência, hash e manifestante externo).",
};

export function blockerMessage(code: string): string {
  return BLOCKER_MESSAGES[code] ?? code;
}

/** Mensagens dos códigos de erro das RPCs / triggers (parseQualityError em lib/quality/mappers.ts). */
export const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  FORBIDDEN: "Você não tem permissão para esta ação neste projeto.",
  VERSION_REQUIRED: "Versão do caso não informada. Recarregue a página.",
  VERSION_CONFLICT: "O caso foi alterado por outra pessoa ou por outra aba. Nada foi gravado: recarregue para ver a versão atual e refaça a ação.",
  INVALID_TRANSITION: "Transição não permitida a partir do estado atual.",
  JUSTIFICATION_REQUIRED: "Justificativa obrigatória (mínimo de 10 caracteres).",
  EVIDENCE_REQUIRED: "Evidência obrigatória para esta transição.",
  EVIDENCE_INVALID: "Evidência inexistente ou de outro caso/projeto.",
  DUPLICATE_TARGET_INVALID: "Alvo de duplicidade inválido.",
  TRANSITION_BLOCKED: "Transição bloqueada pelas guardas do ciclo.",
  ORIGIN_REQUIRED: "Origem rastreável obrigatória.",
  INVALID_DATA: "Dados inválidos para este registro.",
  INVALID_STATE: "O caso não está num estado que permita esta ação.",
  EVIDENCE_LOCKED: "Esta evidência sustenta uma verificação, um aceite ou uma decisão; registre uma nova evidência em vez de reclassificá-la.",
  EPISTEMIC_INVALID: "NC comprovada exige tipo epistêmico FATO.",
  CASE_NOT_ACTIVE: "O caso está encerrado, cancelado ou fora do fluxo: reabra antes de registrar ou editar.",
  COST_SOURCE_REQUIRED: "Valor sem fonte não é aceito: informe a fonte do custo (nota, orçamento, medição). Sem valor o custo fica SEM DADOS.",
  DUPLICATE_EVIDENCE: "Esta fonte já foi registrada como evidência neste caso (nada foi duplicado).",
  DUPLICATE_RECORD: "Registro já existente (nada foi duplicado).",
  ACCEPTANCE_ALREADY_PROVEN: "O aceite deste ciclo já está comprovado; um lançamento interno não o substitui.",
  MANIFESTANT_CONTACT_REQUIRED: "Informe o e-mail de contato do manifestante externo (formato válido).",
  SOURCE_HASH_REQUIRED: "Informe o hash SHA-256 (64 caracteres hexadecimais) do documento ou e-mail ingerido.",
  MANIFESTANT_IS_INTERNAL: "O manifestante não pode ser quem registra nem membro do projeto: um lançamento interno não substitui a manifestação do cliente.",
  ACCEPTANCE_BEFORE_REPAIR: "A manifestação do cliente é anterior ao último reparo executado: o aceite deve ser posterior ao reparo.",
  ACCEPTANCE_PROOF_REQUIRED: "Aceite comprovado exige o registro de prova correspondente.",
};

/** Códigos cuja mensagem do banco já é legível e específica (em português): é exibida no lugar do texto genérico. */
export const DETAIL_ERROR_CODES = new Set(["INVALID_DATA", "INVALID_STATE", "CASE_NOT_ACTIVE", "COST_SOURCE_REQUIRED", "EPISTEMIC_INVALID", "EVIDENCE_LOCKED", "ACCEPTANCE_BEFORE_REPAIR", "EVIDENCE_INVALID", "MANIFESTANT_IS_INTERNAL"]);
