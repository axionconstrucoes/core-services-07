import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";
import { canAccessSegment, normalizeTier } from "./nav-access";
import { projectTierFor, type ProjectTier } from "./project-tier";

/**
 * Nível do usuário logado no projeto. Autoridade: public.acc_project_tier (RPC). Se a RPC não estiver disponível (migration
 * 20261123100000 ainda não aplicada no ambiente), usa a MESMA regra sobre a membership ATIVA (mapa idêntico em project-tier.ts) —
 * nunca abre mais do que a membership permite. Qualquer outra falha => NONE (fail-closed).
 */
export async function getProjectTier(projectId: string): Promise<ProjectTier> {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return "NONE";
  const { data, error } = await supabase.rpc("acc_project_tier", { p_project_id: projectId });
  if (!error && typeof data === "string") return normalizeTier(data);
  const { data: membership, error: membershipError } = await supabase
    .from("project_memberships")
    .select("permission,status")
    .eq("project_id", projectId)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (membershipError || !membership) return "NONE";
  return projectTierFor(membership.permission, membership.status);
}

/** Guarda de ROTA de um segmento restrito por nível: sem nível suficiente => 404 (a página nem revela que existe). */
export async function requireSegmentAccess(projectId: string, segment: string): Promise<void> {
  if (!canAccessSegment(segment, await getProjectTier(projectId))) notFound();
}
