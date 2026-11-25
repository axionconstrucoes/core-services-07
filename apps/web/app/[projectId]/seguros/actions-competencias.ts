"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import type { InsuranceActionResult } from "@/lib/insurance-ui/action-types";
import { mapInsuranceError } from "@/lib/insurance-ui/errors";
import { CompetenceInputError, buildCompetenceCall, isCompetenceOp, isCompetenceOpAllowed, type CompetenceActionInput } from "@/lib/permissions/competence-ops";

// ÚNICO ponto de escrita da tela de competências profissionais (Fase 4/A). Fluxo: valida a entrada (allowlist) -> espelha a permissão
// (SÓ Administrador; fail-closed; o banco repete e é a autoridade) -> chama a RPC SECURITY DEFINER sob a sessão do usuário -> traduz o erro.
export async function runCompetenceAction(input: CompetenceActionInput): Promise<InsuranceActionResult> {
  if (!input || typeof input !== "object" || !isCompetenceOp(input.op)) {
    return { ok: false, error: { code: "INVALID_OP", message: "Operação inválida.", conflict: false } };
  }
  let call;
  try {
    call = buildCompetenceCall(input);
  } catch (e) {
    const message = e instanceof CompetenceInputError ? e.message : "Entrada inválida.";
    return { ok: false, error: { code: "INVALID_INPUT", message, conflict: false } };
  }
  const permission = await getCurrentProjectPermission(input.projectId);
  if (!isCompetenceOpAllowed(permission)) return { ok: false, error: mapInsuranceError({ message: "FORBIDDEN" }) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(call.rpc, call.params);
  if (error) return { ok: false, error: mapInsuranceError(error) };
  revalidatePath(`/${input.projectId}/seguros`);
  return { ok: true, result: data };
}
