import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SsmaOperationEvidence } from "@/lib/ui/resolve-esg-ssma-display-status";

// Evidência REAL de operação do SSMA em um projeto (somente leitura, contagens "head" — nenhum registro é carregado nem alterado).
// Qualquer falha de leitura (RLS, rede, tabela ausente) devolve null: o Dashboard então mantém o status armazenado (fail-safe, nunca
// promove a "ATIVO" sem prova).
export async function getSsmaOperationEvidence(supabase: SupabaseClient, projectId: string): Promise<SsmaOperationEvidence | null> {
  const head = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
  try {
    const [forms, fields, actions, failedPhotos] = await Promise.all([
      head("ssma_form_submissions"),
      head("ssma_field_records"),
      head("ssma_corrective_actions"),
      supabase.from("ssma_submission_photos").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("drive_sync_status", "FAILED"),
    ]);
    if (forms.error || fields.error || actions.error || failedPhotos.error) return null;
    return {
      formSubmissions: forms.count ?? 0,
      fieldRecords: fields.count ?? 0,
      correctiveActions: actions.count ?? 0,
      photosFailed: failedPhotos.count ?? 0,
    };
  } catch {
    return null;
  }
}
