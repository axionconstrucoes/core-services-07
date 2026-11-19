// Candidatos à adição no projeto (RPC list_addable_profiles_for_project — ver migration
// 20261116090000, PENDENTE de aplicação). Fail-closed: se a função não existir ou falhar,
// retorna lista vazia e available=false; a tela segue funcionando só para quem já é participante.

import { createSupabaseServerClient } from "@axion/db/server";
import type { CandidateInput } from "./participant-selection";

export async function getAddableProfiles(projectId: string): Promise<{ available: boolean; candidates: CandidateInput[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_addable_profiles_for_project", { p_project_id: projectId });
  if (error || !Array.isArray(data)) return { available: false, candidates: [] };
  return {
    available: true,
    candidates: (data as { id: string; name: string; email: string }[]).map((row) => ({ id: row.id, name: row.name, email: row.email })),
  };
}
