// "[DESCONSIDERAR]" (seção 9) — exige justificativa; nunca apaga o
// finding, a fonte, o evento ou a evidência. Só humano (RLS EDITOR).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinding } from "../additionals/findings/get-findings";
import type { AiFinding } from "../additionals/findings/types";

export interface DismissHistoricalFindingInput {
  findingId: string;
  justification: string;
  reviewedByUserId: string;
}

export async function dismissHistoricalFinding(supabase: SupabaseClient, input: DismissHistoricalFindingInput): Promise<AiFinding> {
  if (!input.justification.trim()) {
    throw new Error("Justificativa é obrigatória para desconsiderar um finding histórico.");
  }

  const { data: persistedRows, error } = await supabase
    .from("ai_findings")
    .update({
      lifecycle_status: "DISMISSED_AT_STARTUP",
      reviewer_note: input.justification.trim(),
      reviewed_by_user_id: input.reviewedByUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.findingId)
    .select("id");

  if (error) throw new Error(`Falha ao desconsiderar finding: ${error.message}`);

  // UPDATE que casa 0 linhas não dá erro (RLS): sem a linha gravada de volta, nada foi persistido.
  if (!persistedRows?.length) throw new Error("A decisão de desconsiderar o finding não foi gravada: somente um ADMINISTRADOR ativo da obra pode alterar este registro (ou ele não existe mais).");

  const updated = await getFinding(supabase, input.findingId);
  if (!updated) throw new Error("Finding não encontrado após atualização.");
  return updated;
}
