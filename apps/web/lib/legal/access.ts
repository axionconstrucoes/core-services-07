import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";

// Autorização do "Jurídico IA" (análise jurídica pré-contratual): SOMENTE administradores ativos. O critério é o mesmo já usado no ACC
// (project_memberships.permission = 'ADMINISTRADOR' com status ACTIVE, lido com a SESSÃO do usuário — RLS; nunca o cliente de serviço).
// Fail closed: qualquer erro ou ausência de sessão = não autorizado. O banco (create_precontract_workspace) aplica a mesma regra
// na criação; as demais barreiras (RLS por projeto) continuam valendo.

export const LEGAL_ADMIN_ONLY_MESSAGE = "A análise jurídica é restrita a administradores ativos.";

/** Administrador ativo DESTE projeto/espaço. */
export async function isActiveAdminOfProject(projectId: string): Promise<boolean> {
  try {
    return (await getCurrentProjectPermission(projectId)) === "ADMINISTRADOR";
  } catch {
    return false;
  }
}

/** Administrador ativo em ALGUM projeto (critério da tela "Selecione um projeto" e da lista/criação de análises). */
export async function isActiveAdminAnywhere(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { data, error } = await supabase
      .from("project_memberships")
      .select("project_id")
      .eq("user_id", auth.user.id)
      .eq("status", "ACTIVE")
      .eq("permission", "ADMINISTRADOR")
      .limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
