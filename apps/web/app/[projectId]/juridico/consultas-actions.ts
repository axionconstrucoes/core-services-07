"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { deleteOwnLegalConsultation } from "@/lib/legal/consultations";

export type DeleteLegalConsultationResult = { ok: boolean; message: string };

// Exclui a consulta jurídica do PRÓPRIO autor (autoria vem da sessão no servidor; a RLS do banco é a barreira final).
// Exige confirmação explícita. Não revela se a consulta existe quando não é do autor: o resultado para quem não é o autor é
// idêntico ao de "não encontrada". Devolve o resultado (sem redirecionar) para a interface atualizar a lista e limpar a resposta aberta.
export async function deleteLegalConsultationAction(formData: FormData): Promise<DeleteLegalConsultationResult> {
  const fail: DeleteLegalConsultationResult = { ok: false, message: "Não foi possível excluir a consulta." };
  const projectId = String(formData.get("projectId") ?? "").trim();
  const consultationId = String(formData.get("consultationId") ?? "").trim();
  const confirmed = String(formData.get("confirmed") ?? "") === "true";

  if (!projectId || !consultationId || !confirmed) return fail;
  if ((await getCurrentProjectPermission(projectId)) === null) return fail;

  const deleted = await deleteOwnLegalConsultation(projectId, consultationId);
  if (!deleted) return fail;
  revalidatePath(`/${projectId}/juridico`);
  return { ok: true, message: "Consulta excluída do seu histórico." };
}
