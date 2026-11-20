// Comandos de ESCRITA do módulo Qualidade (fase 2). Lógica das Server Actions, isolada para ser testável com um cliente simulado.
//  - RNC (criar e transicionar) escreve SOMENTE por RPC (quality_ncr_create / quality_ncr_transition): a máquina de estados é do banco.
//  - Registros-filhos (evidência, CAPA, inspeção, reclamação, ensaio, requisito, consequência, custo, recorrência, verificação de eficácia)
//    escrevem SOMENTE por RPC transacional SECURITY DEFINER (fase 3/D: quality_evidence_register, quality_capa_*, quality_verification_register, ...):
//    o INSERT/UPDATE direto de `authenticated` foi revogado no banco. Cada RPC valida no servidor, trava a linha-mãe, audita na mesma transação e usa
//    o JWT do usuário (nunca credencial administrativa), com project_id fixado pela rota.
//  - Concorrência: toda alteração de RNC/evidência/ação envia a row_version lida; divergência => VERSION_CONFLICT.
// A UI nunca é a autoridade: a checagem de papel aqui só evita uma ida ao banco; RLS/RPC recusam de qualquer forma.

import { roleSatisfies } from "./state-machine";
import type { QualityDb } from "./ui-queries";
import { initialQualityActionState, type QualityActionState } from "./ui-action-state";
import {
  CLASSIFICATION_LABEL,
  COMPLAINT_CHANNEL_LABEL,
  COST_CATEGORY_LABEL,
  describeQualityError,
  EPISTEMIC_LABEL,
  ORIGIN_LABEL,
  PILLAR_LABEL,
  PROBABILITY_LABEL,
  validateEvidenceDraft,
} from "./ui-model";
import type { QualityMinRole, QualityRole } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export interface FormLike {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}

export interface CommandCtx {
  db: QualityDb;
  role: QualityRole | null;
  projectId: string;
}

const nonce = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const fail = (code: string, error: string, conflict = false): QualityActionState => ({ ...initialQualityActionState, error, code, conflict });
const success = (message: string, entityId: string | null = null): QualityActionState => ({ ...initialQualityActionState, ok: true, message, nonce: nonce(), entityId });

function failFrom(raw: string | null | undefined): QualityActionState {
  const e = describeQualityError(raw);
  return fail(e.code, e.message, e.conflict);
}

const str = (fd: FormLike, name: string, max = 4000): string | null => {
  const v = fd.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | null => (v && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const dateOnly = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const dateTime = (v: string | null): string | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
export function parseAmount(v: string | null): number | null | "INVALID" {
  if (!v) return null;
  const cleaned = v.replace(/\s/g, "").replace(/^R\$/i, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "INVALID";
}

/** Guarda de papel (espelha quality_can_register / quality_can_manage). Usuário sem autorização NÃO chega ao banco. */
function guard(ctx: CommandCtx, min: QualityMinRole): QualityActionState | null {
  if (!isUuid(ctx.projectId)) return fail("INVALID_PROJECT", "Projeto inválido.");
  if (!ctx.role) return fail("AUTH_REQUIRED", describeQualityError("AUTH_REQUIRED").message);
  if (!roleSatisfies(ctx.role, min)) return fail("FORBIDDEN", describeQualityError("FORBIDDEN").message);
  return null;
}

// ------------------------------------------------------------------ RNC ----

export async function createNcrCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const title = str(fd, "title", 300);
  const originType = oneOf(str(fd, "originType"), Object.keys(ORIGIN_LABEL) as string[]);
  const originRef = str(fd, "originRef", 1000);
  if (!title || title.length < 3) return fail("INVALID_DATA", "Informe um título com pelo menos 3 caracteres.");
  if (!originType) return fail("INVALID_DATA", "Selecione a origem da RNC.");
  if (!originRef) return fail("ORIGIN_REQUIRED", describeQualityError("ORIGIN_REQUIRED: x").message);
  const requirementId = str(fd, "requirementId");
  const res = await ctx.db.rpc("quality_ncr_create", {
    p_project_id: ctx.projectId,
    p_title: title,
    p_description: str(fd, "description"),
    p_origin_type: originType,
    p_origin_ref: originRef,
    p_origin_url: str(fd, "originUrl", 2000),
    p_responsible_user_id: null,
    p_requirement_id: isUuid(requirementId) ? requirementId : null,
  });
  if (res.error) return failFrom(res.error.message);
  const d = res.data as { created: boolean; deduplicated: boolean; id: string; code: string } | null;
  if (!d) return fail("ERROR", "Resposta vazia do banco.");
  if (d.deduplicated) return { ...success(`Esta origem já possui a RNC ${d.code}; nenhuma RNC nova foi criada (sem duplicidade).`, d.id), code: "DEDUPLICATED" };
  return success(`RNC ${d.code} criada em DETECTADA.`, d.id);
}

export async function transitionNcrCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const to = str(fd, "toState");
  const version = Number(str(fd, "expectedVersion"));
  if (!isUuid(ncrId) || !to) return fail("INVALID_DATA", "RNC ou estado de destino inválido.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  const evidenceIds = fd.getAll("evidenceIds").filter((v): v is string => typeof v === "string" && isUuid(v));
  const duplicateOf = str(fd, "duplicateOf");
  const res = await ctx.db.rpc("quality_ncr_transition", {
    p_ncr_id: ncrId,
    p_to_state: to,
    p_expected_version: version,
    p_justification: str(fd, "justification"),
    p_evidence_ids: evidenceIds.length ? evidenceIds : null,
    p_duplicate_of: isUuid(duplicateOf) ? duplicateOf : null,
  });
  if (res.error) return failFrom(res.error.message);
  const d = res.data as { from: string; to: string; rowVersion: number } | null;
  return success(`Transição registrada: ${d?.from ?? "?"} → ${d?.to ?? to}.`, ncrId);
}

/** Chamada de RPC com tradução de erro estável; devolve o `data` (objeto jsonb) ou o estado de falha. */
async function callRpc(ctx: CommandCtx, fn: string, args: Record<string, unknown>): Promise<{ data: Record<string, unknown> } | { failure: QualityActionState }> {
  const res = await ctx.db.rpc(fn, args);
  if (res.error) return { failure: failFrom(res.error.message) };
  return { data: (res.data as Record<string, unknown> | null) ?? {} };
}
const idOf = (d: Record<string, unknown>): string | null => (typeof d.id === "string" ? d.id : null);
const versionOf = (fd: FormLike): number => Number(str(fd, "expectedVersion"));

/** Causa raiz e prazo: decisão de gestão (MANAGE). Alterar valores já definidos exige justificativa (a RPC também exige). */
export async function updateNcrCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "MANAGE");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const version = versionOf(fd);
  if (!isUuid(ncrId)) return fail("INVALID_DATA", "RNC inválida.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  const r = await callRpc(ctx, "quality_ncr_update_fields", {
    p_ncr_id: ncrId,
    p_expected_version: version,
    p_changes: { root_cause: str(fd, "rootCause"), due_date: dateOnly(str(fd, "dueDate")) },
    p_justification: str(fd, "justification"),
  });
  if ("failure" in r) return r.failure;
  return success(r.data.unchanged ? "Nada a alterar: os dados já estavam assim." : "Dados da RNC atualizados.", ncrId);
}

// ------------------------------------------------------------ evidências ----

export async function addEvidenceCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  if (!isUuid(ncrId)) return fail("INVALID_DATA", "RNC inválida.");
  const draft = {
    sourceType: str(fd, "sourceType") ?? "",
    sourceRef: str(fd, "sourceRef", 1000) ?? "",
    classification: str(fd, "classification") ?? "",
    epistemic: str(fd, "epistemic") ?? "",
  };
  const errors = validateEvidenceDraft(draft);
  if (errors.length) return fail("INVALID_DATA", errors.join(" "));
  const r = await callRpc(ctx, "quality_evidence_register", {
    p_project_id: ctx.projectId,
    p_source_type: draft.sourceType,
    p_source_ref: draft.sourceRef,
    p_classification: draft.classification,
    p_epistemic: draft.epistemic,
    p_ncr_id: ncrId,
    p_source_url: str(fd, "sourceUrl", 2000),
    p_description: str(fd, "description"),
    p_captured_at: dateTime(str(fd, "capturedAt")),
  });
  if ("failure" in r) return r.failure;
  return success("Evidência registrada com referência à fonte original.", idOf(r.data));
}

/** Reclassificar evidência já registrada é decisão de gestão (MANAGE), com justificativa; a fonte original é imutável. */
export async function setEvidenceClassificationCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "MANAGE");
  if (denied) return denied;
  const id = str(fd, "evidenceId");
  const version = versionOf(fd);
  const classification = oneOf(str(fd, "classification"), Object.keys(CLASSIFICATION_LABEL) as string[]);
  const epistemic = oneOf(str(fd, "epistemic"), Object.keys(EPISTEMIC_LABEL) as string[]);
  const justification = str(fd, "justification");
  if (!isUuid(id) || !classification || !epistemic) return fail("INVALID_DATA", "Evidência, classificação ou tipo epistêmico inválido.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  if (classification === "NC_COMPROVADA" && epistemic !== "FATO") {
    return fail("INVALID_DATA", "NC comprovada exige tipo epistêmico FATO: inferência ou recomendação não comprovam uma não conformidade.");
  }
  if (!justification || justification.length < 10) return fail("JUSTIFICATION_REQUIRED", describeQualityError("JUSTIFICATION_REQUIRED").message);
  const r = await callRpc(ctx, "quality_evidence_revise", {
    p_evidence_id: id,
    p_expected_version: version,
    p_classification: classification,
    p_epistemic: epistemic,
    p_description: str(fd, "description"),
    p_justification: justification,
  });
  if ("failure" in r) return r.failure;
  return success("Classificação da evidência revisada e auditada (a fonte original permanece imutável).", id);
}

// ---------------------------------------------------------------- CAPA ----

export async function addActionCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const kind = oneOf(str(fd, "kind"), ["CONTENCAO", "CORRETIVA", "PREVENTIVA"] as const);
  const description = str(fd, "description");
  if (!isUuid(ncrId) || !kind) return fail("INVALID_DATA", "RNC ou tipo de ação inválido.");
  if (!description || description.length < 3) return fail("INVALID_DATA", "Descreva a ação (mínimo de 3 caracteres).");
  const r = await callRpc(ctx, "quality_capa_register", {
    p_ncr_id: ncrId,
    p_warranty_case_id: null,
    p_kind: kind,
    p_description: description,
    p_due_date: dateOnly(str(fd, "dueDate")),
    p_responsible_user_id: null,
  });
  if ("failure" in r) return r.failure;
  return success("Ação registrada.", idOf(r.data));
}

/** Atualizar status é REGISTER; CANCELAR a ação é MANAGE e, como desfazer uma ação executada, exige justificativa. */
export async function setActionStatusCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const id = str(fd, "actionId");
  const status = oneOf(str(fd, "status"), ["PLANEJADA", "EM_ANDAMENTO", "EXECUTADA", "CANCELADA"] as const);
  const denied = guard(ctx, status === "CANCELADA" ? "MANAGE" : "REGISTER");
  if (denied) return denied;
  const version = versionOf(fd);
  if (!isUuid(id) || !status) return fail("INVALID_DATA", "Ação ou status inválido.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  const r = await callRpc(ctx, "quality_capa_update_status", {
    p_action_id: id,
    p_expected_version: version,
    p_status: status,
    p_justification: str(fd, "justification"),
  });
  if ("failure" in r) return r.failure;
  return success("Status da ação atualizado. Ação executada NÃO equivale a RNC conforme: falta a verificação de eficácia.", id);
}

// ------------------------------------------------ verificação de eficácia ----

export async function addVerificationCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "MANAGE");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const result = oneOf(str(fd, "result"), ["EFICAZ", "INEFICAZ", "PARCIAL"] as const);
  const criteria = str(fd, "criteria", 2000);
  const evidenceId = str(fd, "evidenceId");
  const version = versionOf(fd);
  if (!isUuid(ncrId) || !result) return fail("INVALID_DATA", "RNC ou resultado inválido.");
  if (!criteria || criteria.length < 5) return fail("INVALID_DATA", "Descreva o critério de verificação (mínimo de 5 caracteres).");
  if (!isUuid(evidenceId)) return fail("EVIDENCE_REQUIRED", "Evidência obrigatória: selecione a evidência que sustenta a verificação.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  // o banco trava a RNC, grava a marca de ciclo (último evento de estado) e detecta verificação desatualizada após nova correção/reabertura
  const r = await callRpc(ctx, "quality_verification_register", {
    p_ncr_id: ncrId,
    p_warranty_case_id: null,
    p_expected_version: version,
    p_result: result,
    p_criteria: criteria,
    p_evidence_id: evidenceId,
    p_notes: str(fd, "notes"),
  });
  if ("failure" in r) return r.failure;
  return success(`Verificação de eficácia registrada: ${result}.`, idOf(r.data));
}

// ------------------------------------------------------- consequências ----

export async function addConsequenceCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const pillar = oneOf(str(fd, "pillar"), Object.keys(PILLAR_LABEL) as string[]);
  const severity = oneOf(str(fd, "severity"), ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const);
  const sourceRef = str(fd, "sourceRef", 1000);
  const probability = oneOf(str(fd, "probability"), Object.keys(PROBABILITY_LABEL) as string[]);
  const basis = str(fd, "probabilityBasis");
  if (!isUuid(ncrId) || !pillar || !severity) return fail("INVALID_DATA", "RNC, pilar ou severidade inválido.");
  if (!sourceRef) return fail("INVALID_DATA", "Toda consequência precisa da fonte (documento, foto, laudo ou decisão que a sustenta).");
  if (probability && (!basis || basis.length < 5)) return fail("INVALID_DATA", "Probabilidade só pode ser registrada com fundamento (mínimo de 5 caracteres).");
  const r = await callRpc(ctx, "quality_consequence_register", {
    p_ncr_id: ncrId,
    p_warranty_case_id: null,
    p_pillar: pillar,
    p_severity: severity,
    p_source_type: str(fd, "sourceType", 100) ?? "MANUAL",
    p_source_ref: sourceRef,
    p_probability: probability ?? null,
    p_probability_basis: probability ? basis : null,
    p_description: str(fd, "description"),
    p_measures: str(fd, "measures"),
    p_responsible_user_id: null,
  });
  if ("failure" in r) return r.failure;
  return success(`Consequência de ${PILLAR_LABEL[pillar]} registrada; a criticidade da RNC é recalculada pelo banco (pior pilar domina).`, idOf(r.data));
}

// -------------------------------------------------------------- custos ----

export async function addCostCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const category = oneOf(str(fd, "category"), Object.keys(COST_CATEGORY_LABEL) as string[]);
  if (!isUuid(ncrId) || !category) return fail("INVALID_DATA", "RNC ou categoria inválida.");
  const est = parseAmount(str(fd, "estimatedAmount"));
  const act = parseAmount(str(fd, "actualAmount"));
  if (est === "INVALID" || act === "INVALID") return fail("INVALID_DATA", "Valor inválido: use números positivos (ex.: 1500,00).");
  const sourceRef = str(fd, "sourceRef", 1000);
  if ((est !== null || act !== null) && !sourceRef) return fail("INVALID_DATA", "Valor sem fonte não é aceito: informe a fonte (nota, orçamento, medição…). Sem valor, o custo fica SEM DADOS.");
  const r = await callRpc(ctx, "quality_cost_register", {
    p_ncr_id: ncrId,
    p_warranty_case_id: null,
    p_category: category,
    p_description: str(fd, "description"),
    p_estimated_amount: est,
    p_actual_amount: act,
    p_source_ref: sourceRef,
  });
  if ("failure" in r) return r.failure;
  return success("Custo de não qualidade registrado.", idOf(r.data));
}

// ---------------------------------------------------------- recorrências ----

export async function addRecurrenceCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const related = str(fd, "relatedNcrId");
  const basis = str(fd, "basis", 2000);
  if (!isUuid(ncrId) || !isUuid(related)) return fail("INVALID_DATA", "Selecione a RNC relacionada.");
  if (ncrId === related) return fail("INVALID_DATA", "Uma RNC não pode ser recorrência dela mesma.");
  if (!basis || basis.length < 5) return fail("INVALID_DATA", "Informe o fundamento da recorrência (mínimo de 5 caracteres).");
  const r = await callRpc(ctx, "quality_recurrence_register", {
    p_ncr_id: ncrId,
    p_warranty_case_id: null,
    p_related_ncr_id: related,
    p_related_warranty_case_id: null,
    p_basis: basis,
  });
  if ("failure" in r) return r.failure;
  return success("Recorrência registrada.", idOf(r.data));
}

// --------------------------------------- reclamação / inspeção / ensaio / requisito ----

export async function addComplaintCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const channel = oneOf(str(fd, "channel"), Object.keys(COMPLAINT_CHANNEL_LABEL) as string[]);
  const receivedAt = dateTime(str(fd, "receivedAt"));
  const subject = str(fd, "subject", 300);
  const sourceRef = str(fd, "sourceRef", 1000);
  if (!channel) return fail("INVALID_DATA", "Selecione o canal da reclamação.");
  if (!receivedAt) return fail("INVALID_DATA", "Informe a data e hora de recebimento.");
  if (!subject || subject.length < 3) return fail("INVALID_DATA", "Informe o assunto (mínimo de 3 caracteres).");
  if (!sourceRef) return fail("INVALID_DATA", "Informe a fonte original (ex.: assunto/ID do e-mail, protocolo).");
  const ncrId = str(fd, "ncrId");
  const r = await callRpc(ctx, "quality_complaint_register", {
    p_project_id: ctx.projectId,
    p_channel: channel,
    p_received_at: receivedAt,
    p_subject: subject,
    p_source_ref: sourceRef,
    p_complainant: str(fd, "complainant", 300),
    p_description: str(fd, "description"),
    p_source_url: str(fd, "sourceUrl", 2000),
    p_ncr_id: isUuid(ncrId) ? ncrId : null,
    p_warranty_case_id: null,
  });
  if ("failure" in r) return r.failure;
  return success("Reclamação registrada com a fonte original.", idOf(r.data));
}

export async function addInspectionCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const title = str(fd, "title", 300);
  const result = oneOf(str(fd, "result"), ["PENDENTE", "CONFORME", "NAO_CONFORME", "PARCIAL"] as const);
  if (!title || title.length < 3) return fail("INVALID_DATA", "Informe o título (mínimo de 3 caracteres).");
  if (!result) return fail("INVALID_DATA", "Resultado inválido.");
  const ncrId = str(fd, "ncrId");
  const requirementId = str(fd, "requirementId");
  const r = await callRpc(ctx, "quality_inspection_register", {
    p_project_id: ctx.projectId,
    p_title: title,
    p_result: result,
    p_inspection_type: str(fd, "inspectionType", 200),
    p_location: str(fd, "location", 300),
    p_planned_at: dateTime(str(fd, "plannedAt")),
    p_performed_at: dateTime(str(fd, "performedAt")),
    p_notes: str(fd, "notes"),
    p_source_ref: str(fd, "sourceRef", 1000),
    p_ncr_id: isUuid(ncrId) ? ncrId : null,
    p_requirement_id: isUuid(requirementId) ? requirementId : null,
  });
  if ("failure" in r) return r.failure;
  return success("Inspeção registrada.", idOf(r.data));
}

export async function addTestCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const testType = str(fd, "testType", 200);
  const result = oneOf(str(fd, "result"), ["PENDENTE", "APROVADO", "REPROVADO", "INCONCLUSIVO"] as const);
  const reportRef = str(fd, "reportRef", 1000);
  if (!testType || testType.length < 2) return fail("INVALID_DATA", "Informe o tipo de ensaio.");
  if (!result) return fail("INVALID_DATA", "Resultado inválido.");
  if (result !== "PENDENTE" && result !== "INCONCLUSIVO" && !reportRef) {
    return fail("INVALID_DATA", "Resultado conclusivo (aprovado/reprovado) exige o laudo ou relatório de origem.");
  }
  const ncrId = str(fd, "ncrId");
  const requirementId = str(fd, "requirementId");
  const r = await callRpc(ctx, "quality_test_register", {
    p_project_id: ctx.projectId,
    p_test_type: testType,
    p_result: result,
    p_laboratory: str(fd, "laboratory", 300),
    p_sample_ref: str(fd, "sampleRef", 300),
    p_performed_at: dateTime(str(fd, "performedAt")),
    p_report_ref: reportRef,
    p_report_url: str(fd, "reportUrl", 2000),
    p_notes: str(fd, "notes"),
    p_ncr_id: isUuid(ncrId) ? ncrId : null,
    p_requirement_id: isUuid(requirementId) ? requirementId : null,
  });
  if ("failure" in r) return r.failure;
  return success("Ensaio registrado.", idOf(r.data));
}

export async function addRequirementCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const title = str(fd, "title", 300);
  const sourceRef = str(fd, "sourceRef", 1000);
  if (!title || title.length < 3) return fail("INVALID_DATA", "Informe o título (mínimo de 3 caracteres).");
  if (!sourceRef) return fail("INVALID_DATA", "Todo requisito aponta para a fonte (norma, projeto, especificação, contrato).");
  const r = await callRpc(ctx, "quality_requirement_register", {
    p_project_id: ctx.projectId,
    p_title: title,
    p_source_ref: sourceRef,
    p_description: str(fd, "description"),
    p_source_url: str(fd, "sourceUrl", 2000),
  });
  if ("failure" in r) return r.failure;
  return success("Requisito técnico registrado.", idOf(r.data));
}
