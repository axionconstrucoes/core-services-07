"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@axion/db/server";

import { getCurrentProjectPermission } from "@/lib/contract-review";
import {
  buildAcceptanceInput,
  buildCaseUpdatePayload,
  buildEditJustification,
  buildCreateCasePayload,
  buildEvidencePayload,
  buildMaintenancePayload,
  buildRepairPayload,
  buildSurveyPayload,
  buildVerificationPayload,
  fail,
  isUuid,
  translateDbError,
  validateTransitionInput,
  type ActionResult,
} from "@/lib/garantias/action-logic";
import { ERROR_MESSAGES } from "@/lib/garantias/labels";
import { roleSatisfies } from "@/lib/quality/state-machine";

// Este módulo é "use server" — só exporta funções async (Server Actions). Regras e validações vivem em lib/garantias/action-logic.ts.
// A UI NUNCA é a autoridade: criação e transição passam pelas RPCs quality_warranty_create / quality_warranty_transition (atômicas,
// com auditoria e controle de versão); desde a fase 3/D os registros filhos e a edição do caso também passam por RPCs transacionais
// (quality_warranty_case_update, quality_warranty_acceptance_register, quality_warranty_repair_register, quality_evidence_register, ...):
// o INSERT/UPDATE direto de `authenticated` foi revogado no banco.
// Nenhuma ação aqui envia e-mail, aviso ou comunicação a terceiros.

type Raw = Record<string, string | undefined>;

async function context(projectId: string, min: "REGISTER" | "MANAGE") {
  if (!isUuid(projectId)) return { error: fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN) } as const;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: fail("AUTH_REQUIRED", ERROR_MESSAGES.AUTH_REQUIRED) } as const;
  const role = await getCurrentProjectPermission(projectId);
  if (!roleSatisfies(role, min)) return { error: fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN) } as const;
  return { error: null, supabase, userId: data.user.id } as const;
}

function refresh(projectId: string, caseId?: string) {
  revalidatePath(`/${projectId}/garantias`);
  if (caseId) revalidatePath(`/${projectId}/garantias/${caseId}`);
}

function failFromErrors(errors: string[]) {
  return fail("VALIDATION", errors.join(" "));
}

export async function createWarrantyCaseAction(projectId: string, raw: Raw): Promise<ActionResult<{ id: string; code: string; deduplicated: boolean }>> {
  const ctx = await context(projectId, "REGISTER");
  if (ctx.error) return ctx.error;
  const built = buildCreateCasePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  const { data, error } = await ctx.supabase.rpc("quality_warranty_create", {
    p_project_id: projectId,
    p_service_system: built.payload.serviceSystem,
    p_defect_description: built.payload.defectDescription,
    p_data: built.payload.data,
  });
  if (error) return translateDbError(error);
  const result = (data ?? {}) as { id?: string; code?: string; deduplicated?: boolean };
  if (!result.id) return fail("UNKNOWN", "Resposta inesperada ao criar o caso.");
  refresh(projectId);
  return { ok: true, id: result.id, code: String(result.code ?? ""), deduplicated: result.deduplicated === true };
}

export async function transitionWarrantyAction(
  projectId: string,
  input: { caseId: string; fromState: string; toState: string; expectedVersion: number; justification: string | null; evidenceIds: string[] },
): Promise<ActionResult<{ rowVersion: number; to: string }>> {
  const ctx = await context(projectId, "REGISTER");
  if (ctx.error) return ctx.error;
  const errors = validateTransitionInput(input);
  if (errors.length) return failFromErrors(errors);
  const { data, error } = await ctx.supabase.rpc("quality_warranty_transition", {
    p_case_id: input.caseId,
    p_to_state: input.toState,
    p_expected_version: input.expectedVersion,
    p_justification: input.justification?.trim() || null,
    p_evidence_ids: input.evidenceIds.length ? input.evidenceIds : null,
  });
  if (error) return translateDbError(error);
  const result = (data ?? {}) as { rowVersion?: number; to?: string };
  refresh(projectId, input.caseId);
  return { ok: true, rowVersion: Number(result.rowVersion ?? 0), to: String(result.to ?? input.toState) };
}

/** Edição de campos do caso: RPC com versão otimista, diff no servidor e autoridade por campo (descritivos = REGISTER; cobertura/custos/causa = MANAGE). */
async function updateCaseFields(projectId: string, caseId: string, expectedVersion: number, changes: Record<string, unknown>, justification: string | null): Promise<ActionResult<{ rowVersion: number }>> {
  const ctx = await context(projectId, "REGISTER");
  if (ctx.error) return ctx.error;
  if (!isUuid(caseId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return fail("VERSION_REQUIRED", ERROR_MESSAGES.VERSION_REQUIRED);
  const { data, error } = await ctx.supabase.rpc("quality_warranty_case_update", {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_changes: changes,
    p_justification: justification,
  });
  if (error) return translateDbError(error);
  refresh(projectId, caseId);
  return { ok: true, rowVersion: Number((data as { rowVersion?: number } | null)?.rowVersion ?? expectedVersion) };
}

export async function updateWarrantyCaseAction(projectId: string, caseId: string, expectedVersion: number, raw: Raw): Promise<ActionResult<{ rowVersion: number }>> {
  const built = buildCaseUpdatePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return updateCaseFields(projectId, caseId, expectedVersion, built.row, buildEditJustification(raw));
}

/** Aceite do cliente: decisão de gestão (MANAGE), com evidência do caso (FATO); vale para um ciclo (novo reparo/reabertura exige novo aceite). */
export async function registerAcceptanceAction(projectId: string, caseId: string, expectedVersion: number, raw: Raw): Promise<ActionResult<{ rowVersion: number }>> {
  const built = buildAcceptanceInput(raw);
  if (!built.ok) return failFromErrors(built.errors);
  const ctx = await context(projectId, "MANAGE");
  if (ctx.error) return ctx.error;
  if (!isUuid(caseId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return fail("VERSION_REQUIRED", ERROR_MESSAGES.VERSION_REQUIRED);
  const { data, error } = await ctx.supabase.rpc("quality_warranty_acceptance_register", {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_accepted_at: built.args.acceptedAt,
    p_accepted_by_name: built.args.acceptedByName,
    p_evidence_id: built.args.evidenceId,
  });
  if (error) return translateDbError(error);
  refresh(projectId, caseId);
  return { ok: true, rowVersion: Number((data as { rowVersion?: number } | null)?.rowVersion ?? expectedVersion) };
}

async function rpcChild(projectId: string, caseId: string, fn: string, args: Record<string, unknown>, min: "REGISTER" | "MANAGE" = "REGISTER"): Promise<ActionResult<{ id: string }>> {
  const ctx = await context(projectId, min);
  if (ctx.error) return ctx.error;
  if (!isUuid(caseId)) return fail("VALIDATION", "Caso inválido.");
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) return translateDbError(error);
  refresh(projectId, caseId);
  return { ok: true, id: String((data as { id?: string } | null)?.id ?? "") };
}

export async function addMaintenanceAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildMaintenancePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return rpcChild(projectId, caseId, "quality_warranty_maintenance_register", {
    p_case_id: caseId,
    p_description: built.row.description,
    p_performed_at: built.row.performed_at,
    p_performed_by: built.row.performed_by,
    p_proof_ref: built.row.proof_ref,
    p_proof_url: built.row.proof_url,
  });
}

export async function addSurveyAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildSurveyPayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return rpcChild(projectId, caseId, "quality_warranty_survey_register", {
    p_case_id: caseId,
    p_surveyed_at: built.row.surveyed_at,
    p_findings: built.row.findings,
    p_report_ref: built.row.report_ref,
  });
}

export async function addRepairAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildRepairPayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return rpcChild(projectId, caseId, "quality_warranty_repair_register", {
    p_case_id: caseId,
    p_description: built.row.description,
    p_executed_at: built.row.executed_at,
    p_performed_by: built.row.performed_by,
    p_estimated_cost: built.row.estimated_cost,
    p_actual_cost: built.row.actual_cost,
    p_cost_source_ref: built.row.cost_source_ref,
    p_is_recurrence: built.row.is_recurrence,
    p_previous_repair_id: built.row.previous_repair_id,
  });
}

export async function addEvidenceAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildEvidencePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return rpcChild(projectId, caseId, "quality_evidence_register", {
    p_project_id: projectId,
    p_source_type: built.row.source_type,
    p_source_ref: built.row.source_ref,
    p_classification: built.row.classification,
    p_epistemic: built.row.epistemic,
    p_warranty_case_id: caseId,
    p_source_url: built.row.source_url,
    p_description: built.row.description,
    p_source_table: "quality_warranty_cases",
  });
}

/** Verificação de eficácia: só quem GERE, com a versão lida do caso, só em REPARADA e com evidência FATO do caso; append-only. */
export async function registerVerificationAction(projectId: string, caseId: string, expectedVersion: number, raw: Raw) {
  const built = buildVerificationPayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return fail("VERSION_REQUIRED", ERROR_MESSAGES.VERSION_REQUIRED);
  return rpcChild(projectId, caseId, "quality_verification_register", {
    p_ncr_id: null,
    p_warranty_case_id: caseId,
    p_expected_version: expectedVersion,
    p_result: built.row.result,
    p_criteria: built.row.criteria,
    p_evidence_id: built.row.evidence_id,
    p_notes: built.row.notes,
  }, "MANAGE");
}
