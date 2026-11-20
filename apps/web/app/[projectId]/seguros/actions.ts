"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import type { InsuranceActionResult } from "@/lib/insurance-ui/action-types";
import { mapInsuranceError } from "@/lib/insurance-ui/errors";
import { InsuranceInputError, buildRpcCall, isInsuranceOp, isOpAllowedForPermission, type InsuranceActionInput } from "@/lib/insurance-ui/rpc-ops";

// ÚNICO ponto de escrita da interface de Seguros. Fluxo: valida a entrada (allowlist de operação e de chaves) -> espelha a permissão
// (fail-closed; o banco repete a checagem e é a autoridade) -> chama a RPC SECURITY DEFINER sob a sessão do usuário (RLS) -> traduz o erro.
// Não existe operação de envio real: a única "tentativa de envio" apenas registra o bloqueio (insurance_draft_attempt_send).
export async function runInsuranceAction(input: InsuranceActionInput): Promise<InsuranceActionResult> {
  if (!input || typeof input !== "object" || !isInsuranceOp(input.op)) {
    return { ok: false, error: { code: "INVALID_OP", message: "Operação inválida.", conflict: false } };
  }
  let call;
  try {
    call = buildRpcCall(input);
  } catch (e) {
    const message = e instanceof InsuranceInputError ? e.message : "Entrada inválida.";
    return { ok: false, error: { code: "INVALID_INPUT", message, conflict: false } };
  }
  const permission = await getCurrentProjectPermission(input.projectId);
  if (!isOpAllowedForPermission(permission, input)) return { ok: false, error: mapInsuranceError({ message: "FORBIDDEN" }) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(call.rpc, call.params);
  if (error) return { ok: false, error: mapInsuranceError(error) };
  revalidatePath(`/${input.projectId}/seguros`);
  return { ok: true, result: data };
}
