// Limite de consumo das consultas de IA ao especialista (migrations 20261120120000/20261120140000,
// ai_consult_reserve; estendido em 20261120170000 para TODOS os caminhos de IA de Expert).
// Cada consulta reserva UMA unidade no banco ANTES de chamar o provedor; atingido o limite (por usuário/dia somando
// todas as obras, ou por obra/dia; dia civil de America/Sao_Paulo), a consulta é recusada sem chamar a IA. O registro
// de uso (ai_consult_usage: obra, usuário, tipo, assunto e Expert) é a trilha de auditoria do consumo.
//
// Tipos (kind):
//   ALERTA / RISCO / SSMA — caixa CONSULTAR IA de alerta/risco e consulta do registro SSMA;
//   EXPERT_PANEL          — painéis de consulta direta a um Expert (experts-ia, /juridico, /esg, Diretor Comercial);
//   CURATION              — curadoria multi-Expert: 1 unidade por Expert chamado (cada especialista e a consolidação CEO);
//   RISK_CYCLE            — ESPECIALISTA do caso de risco respondido pelo ciclo (sem sessão: variante service_role com
//                           o usuário que fez a pergunta; mesma contagem por usuário e por obra).
//   AUTOMATIC_CURATION    — curadoria automática de fonte do cliente (sem sessão: variante service_role com o usuário
//                           que originou a fonte; sem solicitante identificável a IA não é chamada). Migration
//                           20261121150000.
//
// Política N6 (docs/ai/governanca-consumo-ia.md): a unidade é reservada na FRONTEIRA DO PROVEDOR
// (lib/ai/governance/quota-gated-provider.ts) — depois dos guards determinísticos (MPP ausente, contrato ilegível,
// validação) e imediatamente antes da chamada. Recusa determinística = nenhuma unidade consumida, sem estorno.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiConsultKind = "ALERTA" | "RISCO" | "SSMA" | "EXPERT_PANEL" | "CURATION" | "RISK_CYCLE" | "AUTOMATIC_CURATION";
/** Tipos exclusivos da variante service_role (ai_consult_reserve_for_actor). */
export type AiConsultActorKind = Extract<AiConsultKind, "RISK_CYCLE" | "AUTOMATIC_CURATION">;
export type AiConsultReservation = { ok: true } | { ok: false; error: string };

const QUOTA_ERRORS: Array<[RegExp, string]> = [
  [/AI_CONSULT_BUDGET_/, "O orçamento de consultas ao especialista de IA foi atingido. Fale com o ADMINISTRADOR da obra."],
  [/AI_CONSULT_USER_LIMIT/, "Você atingiu o limite diário de consultas ao especialista de IA. Tente novamente amanhã ou fale com o ADMINISTRADOR da obra."],
  [/AI_CONSULT_PROJECT_LIMIT/, "Esta obra atingiu o limite diário de consultas ao especialista de IA. Tente novamente amanhã ou fale com o ADMINISTRADOR da obra."],
  [/PROJECT_ACCESS_DENIED/, "Você não possui acesso ativo a esta obra."],
  [/AUTH_REQUIRED/, "Sessão expirada. Faça login novamente."],
];

const QUOTA_UNAVAILABLE = "Não foi possível verificar o limite de consultas de IA agora. Tente novamente.";

function toReservation(error: { message?: string } | null): AiConsultReservation {
  if (!error) return { ok: true };
  const mapped = QUOTA_ERRORS.find(([pattern]) => pattern.test(error.message ?? ""));
  // Falha fechada: sem reserva confirmada, a IA não é chamada.
  return { ok: false, error: mapped?.[1] ?? QUOTA_UNAVAILABLE };
}

/**
 * Reserva com a SESSÃO do usuário (auth.uid()). Sem `expertId` usa a função original de 3 argumentos (mantida
 * para os caminhos já existentes); com `expertId` usa ai_consult_reserve_expert, que também registra o Expert.
 */
export async function reserveAiConsult(
  supabase: SupabaseClient,
  projectId: string,
  kind: AiConsultKind,
  subjectId: string,
  expertId?: string
): Promise<AiConsultReservation> {
  try {
    const { error } = expertId
      ? await supabase.rpc("ai_consult_reserve_expert", { p_project_id: projectId, p_kind: kind, p_subject_id: subjectId, p_expert_id: expertId })
      : await supabase.rpc("ai_consult_reserve", { p_project_id: projectId, p_kind: kind, p_subject_id: subjectId });
    return toReservation(error);
  } catch {
    return { ok: false, error: QUOTA_UNAVAILABLE };
  }
}

/**
 * Reserva SEM sessão (worker do ciclo de alertas, cliente admin/service_role): o usuário que fez a pergunta é
 * informado explicitamente e a função confere o vínculo ativo dele com a obra. Execução concedida só a
 * service_role (ai_consult_reserve_for_actor). Sem usuário identificado não há reserva — nem chamada à IA.
 */
export async function reserveAiConsultForActor(
  adminClient: SupabaseClient,
  actorUserId: string | null | undefined,
  projectId: string,
  kind: AiConsultActorKind,
  subjectId: string,
  expertId: string
): Promise<AiConsultReservation> {
  if (!actorUserId) {
    return { ok: false, error: "Consulta sem usuário solicitante identificado — o limite de IA não pode ser reservado." };
  }
  try {
    const { error } = await adminClient.rpc("ai_consult_reserve_for_actor", {
      p_actor_user_id: actorUserId,
      p_project_id: projectId,
      p_kind: kind,
      p_subject_id: subjectId,
      p_expert_id: expertId,
    });
    return toReservation(error);
  } catch {
    return { ok: false, error: QUOTA_UNAVAILABLE };
  }
}

/**
 * Pré-verificação SOMENTE LEITURA (ai_consult_precheck, sessão): recusa cedo quem já esgotou o limite, ANTES dos
 * guards e da montagem de contexto. Não grava nada e não substitui a reserva na fronteira do provedor.
 */
export async function precheckAiConsult(supabase: SupabaseClient, projectId: string): Promise<AiConsultReservation> {
  try {
    const { error } = await supabase.rpc("ai_consult_precheck", { p_project_id: projectId });
    return toReservation(error);
  } catch {
    return { ok: false, error: QUOTA_UNAVAILABLE };
  }
}

/** Reserva de UMA unidade para um Expert (assinatura usada pelas curadorias e pelo provedor com limite). */
export type ExpertReserve = (expertId: string) => Promise<AiConsultReservation>;

/** Sessão: reserva por Expert para um tipo/assunto fixos. */
export function sessionExpertReserve(
  supabase: SupabaseClient,
  projectId: string,
  kind: Exclude<AiConsultKind, AiConsultActorKind>,
  subjectId: string
): ExpertReserve {
  return (expertId) => reserveAiConsult(supabase, projectId, kind, subjectId, expertId);
}

/** Sem sessão (service_role): reserva por Expert em nome do usuário solicitante explícito. */
export function actorExpertReserve(
  adminClient: SupabaseClient,
  actorUserId: string | null | undefined,
  projectId: string,
  kind: AiConsultActorKind,
  subjectId: string
): ExpertReserve {
  return (expertId) => reserveAiConsultForActor(adminClient, actorUserId, projectId, kind, subjectId, expertId);
}
