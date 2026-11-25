"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@axion/db/server";

import type { SubmitWeeklyDigestState } from "./actions-state";

const RESPONSE_VALUES = new Set(["AWARE", "STUDYING", "RESOLVED", "FORWARDED"]);

export async function submitWeeklyDigestAction(
  digestId: string,
  projectId: string,
  _previousState: SubmitWeeklyDigestState,
  formData: FormData
): Promise<SubmitWeeklyDigestState> {
  const actionIds = formData.getAll("actionId").map(String);
  if (actionIds.length === 0 || new Set(actionIds).size !== actionIds.length) {
    return { success: false, error: "Não foi possível identificar todos os itens do resumo." };
  }

  const responses = [];
  for (const actionId of actionIds) {
    const resolution = String(formData.get(`resolution:${actionId}`) ?? "");
    const directedToUserId = String(formData.get(`directedToUserId:${actionId}`) ?? "").trim() || null;
    const note = String(formData.get(`note:${actionId}`) ?? "").trim() || null;
    const evidence = String(formData.get(`evidence:${actionId}`) ?? "").trim() || null;

    if (!RESPONSE_VALUES.has(resolution)) {
      return { success: false, error: "Responda todos os itens antes de enviar." };
    }
    if (resolution === "FORWARDED" && !directedToUserId) {
      return { success: false, error: "Selecione para quem cada ação será direcionada." };
    }

    if (resolution === "RESOLVED" && (!note || note.length < 10)) {
      return { success: false, error: "Descreva o que foi feito em cada item resolvido (mínimo de 10 caracteres)." };
    }

    responses.push({ actionId, resolution, directedToUserId, note, evidence });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_weekly_alert_digest", {
    p_digest_id: digestId,
    p_responses: responses,
  });

  if (error) {
    return { success: false, error: error.message || "Falha ao registrar as respostas." };
  }
  // Sucesso só com a confirmação do banco: todos os itens gravados.
  if ((data as { respondedItems?: number } | null)?.respondedItems !== actionIds.length) {
    return { success: false, error: "As respostas não foram confirmadas pelo banco de dados. Atualize a página e tente novamente." };
  }

  revalidatePath(`/${projectId}/acoes`);
  revalidatePath(`/${projectId}/acoes/resumo-semanal/${digestId}`);
  return { success: true, error: null };
}
