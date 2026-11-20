"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { isUuid } from "@/lib/garantias/action-logic";
import type { CoverageFormState } from "@/lib/garantias/coverage-form";
import { buildOpinionPayload, mapOpinionError, mapOpinionVersions, sanitizeCoverageForm, type OpinionActionResult } from "@/lib/garantias/opinion";
import { roleSatisfies } from "@/lib/quality/state-machine";

// Parecer de cobertura de garantia (Fase 3 / E). O SERVIDOR recalcula a conclusão a partir dos itens e sinais (a conclusão enviada pelo
// navegador nunca é usada) e o banco a reverifica (quality_warranty_coverage_check); gravação append-only por versão. Não envia nada a terceiros.
export async function saveCoverageOpinionAction(projectId: string, caseId: string, form: CoverageFormState, expectedVersion: number, note: string | null): Promise<OpinionActionResult> {
  if (!isUuid(projectId) || !isUuid(caseId)) return { ok: false, code: "FORBIDDEN", message: "Caso inválido." };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { ok: false, code: "VERSION_REQUIRED", message: "Versão do parecer ausente: recarregue a página." };
  const role = await getCurrentProjectPermission(projectId);
  if (!roleSatisfies(role, "REGISTER")) return { ok: false, code: "FORBIDDEN", message: "Você não tem permissão para registrar o parecer neste projeto." };
  const clean = sanitizeCoverageForm(form);
  if (!clean) return { ok: false, code: "VALIDATION", message: "Formulário inválido." };
  const built = buildOpinionPayload(clean);
  if (!built.ok) return { ok: false, code: "VALIDATION", message: built.errors.join(" ") };
  const p = built.payload;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("quality_warranty_opinion_save", {
    p_case_id: caseId,
    p_items: p.items,
    p_signals: p.signals,
    p_conclusion: p.conclusion,
    p_reasons: p.reasons,
    p_missing: p.missing,
    p_references_snapshot: p.referencesSnapshot,
    p_references_version: p.referencesVersion,
    p_engine_version: p.engineVersion,
    p_expected_version: expectedVersion,
    p_note: note?.trim() || null,
  });
  if (error) return mapOpinionError(error);
  revalidatePath(`/${projectId}/garantias/${caseId}`);
  const r = (data ?? {}) as { versionNo?: number; conclusion?: string };
  return { ok: true, versionNo: Number(r.versionNo ?? 0), conclusion: String(r.conclusion ?? p.conclusion) };
}

export async function loadCoverageOpinionsAction(projectId: string, caseId: string) {
  if (!isUuid(projectId) || !isUuid(caseId)) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("quality_warranty_opinion_versions", { p_case_id: caseId });
  if (error) return [];
  return mapOpinionVersions(data);
}
