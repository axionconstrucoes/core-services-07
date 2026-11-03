import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

/**
 * Administrador ativo da obra? Mesmo critério do layout (project_memberships). É a checagem do SERVIDOR da aba
 * "Autorizações"; o banco aplica a mesma regra por RLS e nas funções (has_project_permission 'ADMINISTRADOR').
 */
export async function isProjectAdmin(projectId: string): Promise<{ isAdmin: boolean; userId: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { isAdmin: false, userId: null };
  const { data: membership } = await supabase
    .from("project_memberships")
    .select("permission,status")
    .eq("project_id", projectId)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  return { isAdmin: membership?.status === "ACTIVE" && membership?.permission === "ADMINISTRADOR", userId: authData.user.id };
}
