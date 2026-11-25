"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import type { InsuranceActionResult } from "@/lib/insurance-ui/action-types";
import { prepareRecipient } from "@/lib/email/external-recipient";
import { mapInsuranceError } from "@/lib/insurance-ui/errors";
import { InsuranceInputError, buildRpcCall, isInsuranceOp, isOpAllowedForPermission, type InsuranceActionInput } from "@/lib/insurance-ui/rpc-ops";

// ÚNICO ponto de escrita da interface de Seguros. Fluxo: valida a entrada (allowlist de operação e de chaves) -> espelha a permissão
// (fail-closed; o banco repete a checagem e é a autoridade) -> chama a RPC SECURITY DEFINER sob a sessão do usuário (RLS) -> traduz o erro.
// Não existe operação de envio real: a única "tentativa de envio" apenas registra o bloqueio (insurance_draft_attempt_send).
export async function runInsuranceAction(input: InsuranceActionInput): Promise<InsuranceActionResult> {
  if (!input || typeof input !== "object" || !isInsuranceOp(input.op)) {
    return { ok: false, error: { code: "INVALID_OP", message: "Operação inválida.", conflict: false } };
  }
  // Canal oficial do tipo E-MAIL: validação/normalização NO SERVIDOR; domínio externo exige confirmação explícita + motivo, gravados na
  // trilha append-only ANTES da RPC. O banco repete a regra (gatilho em insurance_official_channels): esta etapa não é a única barreira.
  if (input.op === "channel_register" && input.data?.channel_type === "EMAIL") {
    const permissionForChannel = await getCurrentProjectPermission(input.projectId);
    if (!isOpAllowedForPermission(permissionForChannel, input)) return { ok: false, error: mapInsuranceError({ message: "FORBIDDEN" }) };
    const prepared = await prepareRecipient({
      projectId: input.projectId,
      context: "SEGUROS_CANAL",
      entityType: "INSURANCE_CHANNEL",
      email: input.data.channel_value,
      confirmed: input.data.external_confirm === true,
      reason: typeof input.data.external_reason === "string" ? input.data.external_reason : "",
      sourceRef: typeof input.data.source_ref === "string" ? input.data.source_ref : null,
    });
    if (!prepared.ok) return { ok: false, error: { code: prepared.code, message: prepared.message, conflict: false } };
    input = { ...input, data: { ...input.data, channel_value: prepared.email } };
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
