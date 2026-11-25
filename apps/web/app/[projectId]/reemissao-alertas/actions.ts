"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";

import { isProjectAdmin } from "@/lib/email-authorization/guard";
import { friendlyReissueError, mapReissueApprovalOutcome, validateReissueApprovalInput } from "@/lib/risk-alerts/reissue-approval";

import type { ApproveReissueState } from "./actions-state";

// Aprova (REGISTRA) a reemissão dos casos selecionados. NÃO envia e-mail e NÃO escreve a outbox: a decisão é gravada pela RPC
// risk_alert_reissue_approve (ADMINISTRADOR da obra, falha fechada no banco) e consumida depois pelo ciclo, sob as travas do piloto.
export async function approveReissueAction(projectId: string, _previous: ApproveReissueState, formData: FormData): Promise<ApproveReissueState> {
  // Guarda no servidor (além do menu, da página e da RPC): quem não é administrador ativo da obra não chega ao banco.
  if (!(await isProjectAdmin(projectId)).isAdmin) return { error: "Somente administradores da obra podem aprovar reemissões.", outcome: null };

  const input = validateReissueApprovalInput({
    projectId,
    caseIds: formData.getAll("caseId"),
    justification: formData.get("justification"),
    confirmed: formData.get("confirm"),
  });
  if (!input.ok) return { error: input.message, outcome: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("risk_alert_reissue_approve", {
    p_project_id: input.projectId,
    p_case_ids: input.caseIds,
    p_justification: input.justification,
  });
  if (error) return { error: friendlyReissueError(error.message), outcome: null };

  revalidatePath(`/${projectId}/reemissao-alertas`);
  return { error: null, outcome: mapReissueApprovalOutcome(data) };
}
