// Limite de consumo das consultas de IA ao especialista (migration 20261120120000, ai_consult_reserve).
// Cada consulta reserva UMA unidade no banco ANTES de chamar o provedor; atingido o limite (por usuário/dia ou por
// obra/dia, dia civil de America/Sao_Paulo), a consulta é recusada sem chamar a IA. O registro de uso é a auditoria.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiConsultKind = "ALERTA" | "RISCO" | "SSMA";
export type AiConsultReservation = { ok: true } | { ok: false; error: string };

const QUOTA_ERRORS: Array<[RegExp, string]> = [
  [/AI_CONSULT_USER_LIMIT/, "Você atingiu o limite diário de consultas ao especialista de IA. Tente novamente amanhã ou fale com o ADMINISTRADOR da obra."],
  [/AI_CONSULT_PROJECT_LIMIT/, "Esta obra atingiu o limite diário de consultas ao especialista de IA. Tente novamente amanhã ou fale com o ADMINISTRADOR da obra."],
  [/PROJECT_ACCESS_DENIED/, "Você não possui acesso ativo a esta obra."],
  [/AUTH_REQUIRED/, "Sessão expirada. Faça login novamente."],
];

export async function reserveAiConsult(
  supabase: SupabaseClient,
  projectId: string,
  kind: AiConsultKind,
  subjectId: string
): Promise<AiConsultReservation> {
  const { error } = await supabase.rpc("ai_consult_reserve", { p_project_id: projectId, p_kind: kind, p_subject_id: subjectId });
  if (!error) return { ok: true };
  const mapped = QUOTA_ERRORS.find(([pattern]) => pattern.test(error.message ?? ""));
  // Falha fechada: sem reserva confirmada, a IA não é chamada.
  return { ok: false, error: mapped?.[1] ?? "Não foi possível verificar o limite de consultas de IA agora. Tente novamente." };
}
