"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@axion/db/server";

import { getCurrentProjectPermission } from "@/lib/contract-review";
import {
  buildAcceptancePayload,
  buildCaseUpdatePayload,
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
  versionConflict,
  type ActionResult,
} from "@/lib/garantias/action-logic";
import { ERROR_MESSAGES } from "@/lib/garantias/labels";
import { roleSatisfies } from "@/lib/quality/state-machine";

// Este módulo é "use server" — só exporta funções async (Server Actions). Regras e validações vivem em lib/garantias/action-logic.ts.
// A UI NUNCA é a autoridade: criação e transição passam pelas RPCs quality_warranty_create / quality_warranty_transition (atômicas,
// com auditoria e controle de versão); os registros filhos usam INSERT/UPDATE sob RLS por projeto (não há RPC dedicada na fase 1).
// Nenhuma ação aqui envia e-mail, aviso ou comunicação a terceiros.

type Raw = Record<string, string | undefined>;

async function context(projectId: string, min: "REGISTER" | "MANAGE") {
  if (!isUuid(projectId)) return { error: fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN) } as const;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: fail("AUTH_REQUIRED", ERROR_MESSAGES.AUTH_REQUIRED) } as const;
  const role = await getCurrentProjectPermission(projectId);
  if (!roleSatisfies(role, min)) return { error: fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN) } as const;
  return { supabase, userId: data.user.id } as const;
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
  if ("error" in ctx) return ctx.error;
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
  if ("error" in ctx) return ctx.error;
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

/** UPDATE de campos descritivos com versão otimista: se a versão mudou, nada é gravado (VERSION_CONFLICT). */
async function updateCaseFields(projectId: string, caseId: string, expectedVersion: number, row: Record<string, unknown>): Promise<ActionResult<{ rowVersion: number }>> {
  const ctx = await context(projectId, "REGISTER");
  if ("error" in ctx) return ctx.error;
  if (!isUuid(caseId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return fail("VERSION_REQUIRED", ERROR_MESSAGES.VERSION_REQUIRED);
  const { data, error } = await ctx.supabase
    .from("quality_warranty_cases")
    .update(row)
    .eq("id", caseId)
    .eq("project_id", projectId)
    .eq("row_version", expectedVersion)
    .select("row_version");
  if (error) return translateDbError(error);
  if (!data || data.length === 0) return versionConflict();
  refresh(projectId, caseId);
  return { ok: true, rowVersion: Number((data[0] as { row_version: number }).row_version) };
}

export async function updateWarrantyCaseAction(projectId: string, caseId: string, expectedVersion: number, raw: Raw): Promise<ActionResult<{ rowVersion: number }>> {
  const built = buildCaseUpdatePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return updateCaseFields(projectId, caseId, expectedVersion, built.row);
}

export async function registerAcceptanceAction(projectId: string, caseId: string, expectedVersion: number, raw: Raw): Promise<ActionResult<{ rowVersion: number }>> {
  const built = buildAcceptancePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return updateCaseFields(projectId, caseId, expectedVersion, built.row);
}

async function insertChild(projectId: string, caseId: string, table: string, row: Record<string, unknown>, min: "REGISTER" | "MANAGE" = "REGISTER"): Promise<ActionResult<{ id: string }>> {
  const ctx = await context(projectId, min);
  if ("error" in ctx) return ctx.error;
  if (!isUuid(caseId)) return fail("VALIDATION", "Caso inválido.");
  const { data, error } = await ctx.supabase
    .from(table)
    .insert({ ...row, project_id: projectId, warranty_case_id: caseId, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return translateDbError(error);
  refresh(projectId, caseId);
  return { ok: true, id: String((data as { id: string }).id) };
}

export async function addMaintenanceAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildMaintenancePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return insertChild(projectId, caseId, "quality_warranty_maintenance", built.row);
}

export async function addSurveyAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildSurveyPayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  const ctx = await context(projectId, "REGISTER");
  if ("error" in ctx) return ctx.error;
  return insertChild(projectId, caseId, "quality_warranty_surveys", { ...built.row, surveyor_user_id: ctx.userId });
}

export async function addRepairAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildRepairPayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return insertChild(projectId, caseId, "quality_warranty_repairs", built.row);
}

export async function addEvidenceAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildEvidencePayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return insertChild(projectId, caseId, "quality_evidence", { ...built.row, source_table: "quality_warranty_cases" });
}

/** Verificação de eficácia: só quem GERE (RLS) e só com o caso em REPARADA (trigger); append-only. */
export async function registerVerificationAction(projectId: string, caseId: string, raw: Raw) {
  const built = buildVerificationPayload(raw);
  if (!built.ok) return failFromErrors(built.errors);
  return insertChild(projectId, caseId, "quality_effectiveness_verifications", built.row, "MANAGE");
}
