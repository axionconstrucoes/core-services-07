// Comandos de ESCRITA do módulo Qualidade (fase 2). Lógica das Server Actions, isolada para ser testável com um cliente simulado.
//  - RNC (criar e transicionar) escreve SOMENTE por RPC (quality_ncr_create / quality_ncr_transition): a máquina de estados é do banco.
//  - Registros-filhos (evidência, CAPA, inspeção, reclamação, ensaio, requisito, consequência, custo, recorrência, verificação de eficácia)
//    não têm RPC na fase 1: o INSERT/UPDATE acontece sob RLS com o JWT do usuário (nunca com credencial administrativa), com project_id fixado pela rota e
//    FK composta (id, project_id) no banco; auditoria por trigger. Decisão registrada no relatório.
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

export async function updateNcrCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const ncrId = str(fd, "ncrId");
  const version = Number(str(fd, "expectedVersion"));
  if (!isUuid(ncrId)) return fail("INVALID_DATA", "RNC inválida.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  const res = await ctx.db
    .from("quality_ncrs")
    .update({ root_cause: str(fd, "rootCause"), due_date: dateOnly(str(fd, "dueDate")) })
    .eq("id", ncrId)
    .eq("project_id", ctx.projectId)
    .eq("row_version", version)
    .select("id");
  if (res.error) return failFrom(res.error.message);
  if (!((res.data as unknown[] | null)?.length)) return failFrom("VERSION_CONFLICT: o registro foi alterado ou não existe neste projeto");
  return success("Dados da RNC atualizados.", ncrId);
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
  const res = await ctx.db.from("quality_evidence").insert({
    project_id: ctx.projectId,
    ncr_id: ncrId,
    source_type: draft.sourceType,
    source_ref: draft.sourceRef,
    source_url: str(fd, "sourceUrl", 2000),
    description: str(fd, "description"),
    classification: draft.classification,
    epistemic: draft.epistemic,
    captured_at: dateTime(str(fd, "capturedAt")),
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Evidência registrada com referência à fonte original.", (res.data as { id: string } | null)?.id ?? null);
}

export async function setEvidenceClassificationCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const id = str(fd, "evidenceId");
  const version = Number(str(fd, "expectedVersion"));
  const classification = oneOf(str(fd, "classification"), Object.keys(CLASSIFICATION_LABEL) as string[]);
  const epistemic = oneOf(str(fd, "epistemic"), Object.keys(EPISTEMIC_LABEL) as string[]);
  if (!isUuid(id) || !classification || !epistemic) return fail("INVALID_DATA", "Evidência, classificação ou tipo epistêmico inválido.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  if (classification === "NC_COMPROVADA" && epistemic !== "FATO") {
    return fail("INVALID_DATA", "NC comprovada exige tipo epistêmico FATO: inferência ou recomendação não comprovam uma não conformidade.");
  }
  const res = await ctx.db
    .from("quality_evidence")
    .update({ classification, epistemic })
    .eq("id", id)
    .eq("project_id", ctx.projectId)
    .eq("row_version", version)
    .select("id");
  if (res.error) return failFrom(res.error.message);
  if (!((res.data as unknown[] | null)?.length)) return failFrom("VERSION_CONFLICT: o registro foi alterado ou não existe neste projeto");
  return success("Classificação da evidência atualizada (a fonte original permanece imutável).", id);
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
  const res = await ctx.db.from("quality_corrective_actions").insert({
    project_id: ctx.projectId,
    ncr_id: ncrId,
    kind,
    description,
    due_date: dateOnly(str(fd, "dueDate")),
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Ação registrada.", (res.data as { id: string } | null)?.id ?? null);
}

export async function setActionStatusCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const id = str(fd, "actionId");
  const status = oneOf(str(fd, "status"), ["PLANEJADA", "EM_ANDAMENTO", "EXECUTADA", "CANCELADA"] as const);
  const version = Number(str(fd, "expectedVersion"));
  if (!isUuid(id) || !status) return fail("INVALID_DATA", "Ação ou status inválido.");
  if (!Number.isInteger(version) || version < 1) return fail("VERSION_REQUIRED", describeQualityError("VERSION_REQUIRED").message);
  const res = await ctx.db
    .from("quality_corrective_actions")
    .update({ status, executed_at: status === "EXECUTADA" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("project_id", ctx.projectId)
    .eq("row_version", version)
    .select("id");
  if (res.error) return failFrom(res.error.message);
  if (!((res.data as unknown[] | null)?.length)) return failFrom("VERSION_CONFLICT: o registro foi alterado ou não existe neste projeto");
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
  if (!isUuid(ncrId) || !result) return fail("INVALID_DATA", "RNC ou resultado inválido.");
  if (!criteria || criteria.length < 5) return fail("INVALID_DATA", "Descreva o critério de verificação (mínimo de 5 caracteres).");
  if (!isUuid(evidenceId)) return fail("EVIDENCE_REQUIRED", "Evidência obrigatória: selecione a evidência que sustenta a verificação.");
  // marca de ciclo: último evento de estado conhecido (invalida verificações anteriores a uma nova correção/reabertura)
  const last = await ctx.db.from("quality_state_events").select("seq").eq("project_id", ctx.projectId).eq("entity_type", "NCR").eq("entity_id", ncrId).order("seq", { ascending: false }).limit(1);
  if (last.error) return failFrom(last.error.message);
  const seq = Number(((last.data as Array<{ seq: number | string }> | null) ?? [])[0]?.seq ?? 0);
  const res = await ctx.db.from("quality_effectiveness_verifications").insert({
    project_id: ctx.projectId,
    ncr_id: ncrId,
    result,
    criteria,
    notes: str(fd, "notes"),
    evidence_id: evidenceId,
    event_seq_at: seq,
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success(`Verificação de eficácia registrada: ${result}.`, (res.data as { id: string } | null)?.id ?? null);
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
  const res = await ctx.db.from("quality_consequences").insert({
    project_id: ctx.projectId,
    ncr_id: ncrId,
    pillar,
    severity,
    probability: probability ?? null,
    probability_basis: probability ? basis : null,
    description: str(fd, "description"),
    source_type: str(fd, "sourceType", 100) ?? "MANUAL",
    source_ref: sourceRef,
    measures: str(fd, "measures"),
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success(`Consequência de ${PILLAR_LABEL[pillar]} registrada; a criticidade da RNC é recalculada pelo banco (pior pilar domina).`, (res.data as { id: string } | null)?.id ?? null);
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
  const res = await ctx.db.from("quality_nonquality_costs").insert({
    project_id: ctx.projectId,
    ncr_id: ncrId,
    category,
    description: str(fd, "description"),
    estimated_amount: est,
    actual_amount: act,
    source_ref: sourceRef,
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Custo de não qualidade registrado.", (res.data as { id: string } | null)?.id ?? null);
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
  const res = await ctx.db.from("quality_recurrences").insert({ project_id: ctx.projectId, ncr_id: ncrId, related_ncr_id: related, basis }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Recorrência registrada.", (res.data as { id: string } | null)?.id ?? null);
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
  const res = await ctx.db.from("quality_customer_complaints").insert({
    project_id: ctx.projectId,
    channel,
    received_at: receivedAt,
    complainant: str(fd, "complainant", 300),
    subject,
    description: str(fd, "description"),
    source_ref: sourceRef,
    source_url: str(fd, "sourceUrl", 2000),
    ncr_id: isUuid(ncrId) ? ncrId : null,
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Reclamação registrada com a fonte original.", (res.data as { id: string } | null)?.id ?? null);
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
  const res = await ctx.db.from("quality_inspections").insert({
    project_id: ctx.projectId,
    title,
    inspection_type: str(fd, "inspectionType", 200),
    location: str(fd, "location", 300),
    planned_at: dateTime(str(fd, "plannedAt")),
    performed_at: dateTime(str(fd, "performedAt")),
    result,
    notes: str(fd, "notes"),
    source_ref: str(fd, "sourceRef", 1000),
    ncr_id: isUuid(ncrId) ? ncrId : null,
    requirement_id: isUuid(requirementId) ? requirementId : null,
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Inspeção registrada.", (res.data as { id: string } | null)?.id ?? null);
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
  const res = await ctx.db.from("quality_tests").insert({
    project_id: ctx.projectId,
    test_type: testType,
    laboratory: str(fd, "laboratory", 300),
    sample_ref: str(fd, "sampleRef", 300),
    performed_at: dateTime(str(fd, "performedAt")),
    result,
    report_ref: reportRef,
    report_url: str(fd, "reportUrl", 2000),
    notes: str(fd, "notes"),
    ncr_id: isUuid(ncrId) ? ncrId : null,
    requirement_id: isUuid(requirementId) ? requirementId : null,
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Ensaio registrado.", (res.data as { id: string } | null)?.id ?? null);
}

export async function addRequirementCommand(ctx: CommandCtx, fd: FormLike): Promise<QualityActionState> {
  const denied = guard(ctx, "REGISTER");
  if (denied) return denied;
  const title = str(fd, "title", 300);
  const sourceRef = str(fd, "sourceRef", 1000);
  if (!title || title.length < 3) return fail("INVALID_DATA", "Informe o título (mínimo de 3 caracteres).");
  if (!sourceRef) return fail("INVALID_DATA", "Todo requisito aponta para a fonte (norma, projeto, especificação, contrato).");
  const res = await ctx.db.from("quality_requirements").insert({
    project_id: ctx.projectId,
    title,
    description: str(fd, "description"),
    source_ref: sourceRef,
    source_url: str(fd, "sourceUrl", 2000),
  }).select("id").single();
  if (res.error) return failFrom(res.error.message);
  return success("Requisito técnico registrado.", (res.data as { id: string } | null)?.id ?? null);
}
