"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import type { InsuranceActionResult } from "@/lib/insurance-ui/action-types";
import {
  PersistenceInputError,
  buildPersistenceCall,
  isPersistenceOp,
  isPersistenceOpAllowed,
  mapPersistenceError,
  type PersistenceInput,
} from "@/lib/insurance-ui/persistence";

// Persistência do checklist RCC e dos sujeitos ESPERADOS (Fase 3 / E). Fluxo: valida a entrada -> espelha a permissão (fail-closed; o banco
// repete a checagem e é a autoridade) -> chama a RPC SECURITY DEFINER sob a sessão do usuário -> traduz o erro. Não envia nada a terceiros.
export async function runInsurancePersistence(input: PersistenceInput): Promise<InsuranceActionResult> {
  if (!input || typeof input !== "object" || !isPersistenceOp(input.op)) {
    return { ok: false, error: { code: "INVALID_OP", message: "Operação inválida.", conflict: false } };
  }
  let call;
  try {
    call = buildPersistenceCall(input);
  } catch (e) {
    const message = e instanceof PersistenceInputError ? e.message : "Entrada inválida.";
    return { ok: false, error: { code: "INVALID_INPUT", message, conflict: false } };
  }
  const permission = await getCurrentProjectPermission(input.projectId);
  if (!isPersistenceOpAllowed(permission, input.op)) return { ok: false, error: mapPersistenceError({ message: "FORBIDDEN" }) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(call.rpc, call.params);
  if (error) return { ok: false, error: mapPersistenceError(error) };
  if (input.op === "rcc_save" || input.op === "subject_save") revalidatePath(`/${input.projectId}/seguros`);
  return { ok: true, result: data };
}
