"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { createSupabaseAdminClient } from "@axion/db/admin";
import { deliverVersionReviewNotifications } from "@/lib/email/special-routine-deliveries";

export type VersionImpactReviewState = { success: boolean; error: string | null };

export async function submitVersionImpactReviewAction(
  _previous: VersionImpactReviewState,
  formData: FormData
): Promise<VersionImpactReviewState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const transitionId = String(formData.get("transitionId") ?? "").trim();
  const scheduleImpact = String(formData.get("scheduleImpact") ?? "").trim();
  const priceImpact = String(formData.get("priceImpact") ?? "").trim();
  const planningResponse = String(formData.get("planningResponse") ?? "").trim();
  const sendToBudget = formData.get("sendToBudget") === "on";
  const budgetUserId = String(formData.get("budgetUserId") ?? "").trim() || null;

  if (!projectId || !transitionId || !scheduleImpact || !priceImpact || planningResponse.length < 10) {
    return { success: false, error: "Responda todos os itens antes de enviar a análise." };
  }
  if (sendToBudget && !budgetUserId) {
    return { success: false, error: "Selecione o orçamentista responsável." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { success: false, error: "Sessão expirada. Entre novamente." };

  const { data: reviewId, error } = await supabase.rpc("submit_construmanager_version_impact_review", {
    p_project_id: projectId,
    p_transition_id: transitionId,
    p_schedule_impact: scheduleImpact,
    p_price_impact: priceImpact,
    p_planning_response: planningResponse,
    p_send_to_budget: sendToBudget,
    p_budget_user_id: sendToBudget ? budgetUserId : null,
  });

  if (error) {
    const message = error.message.includes("duplicate key")
      ? "Esta versão já possui uma análise registrada."
      : "Não foi possível registrar a análise. Confira seu perfil de Planejamento.";
    return { success: false, error: message };
  }

  // Avisos pela outbox persistente (construmanager_version_review_deliveries): reivindicação atômica, tentativas limitadas,
  // SENT só após o aceite do provedor. Orçamentista designado recebe o alerta que EXIGE AÇÃO (resposta do Orçamento nesta
  // tela); a gestão recebe o aviso INFORMATIVO. Falha transitória é retentada pelo cron remoto /api/cron/system-health.
  if (typeof reviewId === "string") {
    try {
      await deliverVersionReviewNotifications(createSupabaseAdminClient(), reviewId);
    } catch {
      // A análise JÁ está registrada; a falha de comunicação fica nas linhas de entrega e na auditoria.
    }
  }

  revalidatePath(`/${projectId}/integracoes`);
  return { success: true, error: null };
}

export async function submitBudgetResponseAction(
  _previous: VersionImpactReviewState,
  formData: FormData
): Promise<VersionImpactReviewState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const response = String(formData.get("budgetResponse") ?? "").trim();
  if (!projectId || !reviewId || response.length < 10) {
    return { success: false, error: "Registre uma resposta completa antes de enviar." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_construmanager_budget_response", {
    p_project_id: projectId,
    p_review_id: reviewId,
    p_response: response,
  });
  if (error) return { success: false, error: "Somente o orçamentista designado pode concluir esta análise." };
  revalidatePath(`/${projectId}/integracoes`);
  return { success: true, error: null };
}
