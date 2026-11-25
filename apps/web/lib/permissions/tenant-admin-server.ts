import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

/**
 * TENANT_ADMIN (administração global). Autoridade: public.acc_is_tenant_admin (RPC, security definer). A concessão é feita
 * apenas por manutenção no banco (sem RPC para o app). Qualquer falha (RPC ausente, erro, sem sessão) => false (fail-closed):
 * a interface só espelha a regra; o banco repete a checagem em cada RPC de dado global.
 */
export async function getIsTenantAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return false;
  const { data, error } = await supabase.rpc("acc_is_tenant_admin");
  return !error && data === true;
}
