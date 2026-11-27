// Leitura do estado do agendador pelo client de SESSÃO (RLS/permissões
// preservadas: a RPC exige membro ativo do projeto). Qualquer erro — RPC
// ausente porque a migration 20261213100000 não foi aplicada, permissão
// negada, rede — vira { available: false }, e o resolvedor mostra
// "estado do agendador indisponível" em vez de OPERACIONAL.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SCHEDULER_UNAVAILABLE_REASON, type SchedulerJobRow, type SchedulerSnapshot } from "./effective-status";

export async function getSchedulerSnapshot(supabase: SupabaseClient, projectId: string): Promise<SchedulerSnapshot> {
  try {
    const { data, error } = await supabase.rpc("acc_scheduler_status_for_project", { p_project: projectId });
    if (error || !Array.isArray(data)) {
      return { available: false, reason: SCHEDULER_UNAVAILABLE_REASON };
    }
    return { available: true, jobs: data as SchedulerJobRow[] };
  } catch {
    return { available: false, reason: SCHEDULER_UNAVAILABLE_REASON };
  }
}
