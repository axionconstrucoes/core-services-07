"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";

// Decisão HUMANA sobre possível duplicidade entre um acidente de formulário e uma ocorrência de campo.
// Só o Administrador ativo decide (o banco também recusa: RPC ssma_incident_link_set). Nada é apagado: a decisão é um
// vínculo auditado; "mesmo fato" desconta um relato do total e "fatos distintos" só para de sugerir.
export async function decideIncidentLinkAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const formSubmissionId = String(formData.get("formSubmissionId") ?? "");
  const fieldRecordId = String(formData.get("fieldRecordId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(projectId) || !uuid.test(formSubmissionId) || !uuid.test(fieldRecordId)) return;
  if (decision !== "SAME_FACT" && decision !== "DISTINCT_FACTS") return;

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;
  if ((await getCurrentProjectPermission(projectId)) !== "ADMINISTRADOR") return;

  await supabase.rpc("ssma_incident_link_set", {
    p_form_submission_id: formSubmissionId,
    p_field_record_id: fieldRecordId,
    p_decision: decision,
    p_note: note || null,
  });
  revalidatePath(`/${projectId}/ssma-registros`);
  revalidatePath(`/${projectId}/dashboard`);
}
