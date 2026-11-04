"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { deleteOwnLegalConsultation } from "@/lib/legal/consultations";

// Exclui a consulta jurídica do PRÓPRIO autor (autoria da sessão; RLS no banco). Exige confirmação explícita.
// Não revela se a consulta existe quando não é do autor: o resultado para quem não é o autor é idêntico ao de "não encontrada".
export async function deleteLegalConsultationAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const consultationId = String(formData.get("consultationId") ?? "").trim();
  const confirmed = String(formData.get("confirmed") ?? "") === "true";

  if (!projectId || !consultationId || !confirmed) redirect(`/${projectId}/juridico?consulta=nao-excluida`);
  if ((await getCurrentProjectPermission(projectId)) === null) redirect(`/${projectId}/juridico?consulta=nao-excluida`);

  const deleted = await deleteOwnLegalConsultation(projectId, consultationId);
  revalidatePath(`/${projectId}/juridico`);
  redirect(`/${projectId}/juridico?consulta=${deleted ? "excluida" : "nao-excluida"}`);
}
