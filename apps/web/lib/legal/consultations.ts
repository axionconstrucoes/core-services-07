import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";
import type { ExpertQueryResponse } from "@/lib/ai/query/types";

// Histórico PRIVADO das consultas ao Especialista Jurídico (migration 20261104120000_legal_consultations_private).
// Regras (aplicadas aqui no servidor E por RLS no banco — a RLS é a barreira final):
//  - a AUTORIA vem sempre da sessão autenticada (supabase.auth.getUser()); nada do cliente define o autor;
//  - toda leitura/exclusão filtra por author_user_id = usuário da sessão, além da RLS;
//  - ninguém além do autor lista, abre ou exclui — nem outro membro do projeto, nem administrador pela interface do ACC.

export interface LegalConsultationListItem {
  id: string;
  question: string;
  createdAt: string;
}

export interface LegalConsultationDetail extends LegalConsultationListItem {
  response: ExpertQueryResponse;
  providerMeta: { providerLabel?: string; model?: string } | null;
}

/** Texto exibido na interface sobre o alcance REAL da exclusão. */
export const LEGAL_CONSULTATION_DELETE_SCOPE_NOTICE =
  "Excluir remove a pergunta e a resposta do seu histórico no ACC. Cópias técnicas (backups do banco de dados, ainda sem prazo de rotação definido) e o que o provedor de IA tenha retido pela política dele não são apagadas por este botão.";

async function sessionUserId(): Promise<{ supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; userId: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

/** Grava a consulta no histórico do autor. Nunca derruba a consulta: devolve false se não foi possível gravar. */
export async function saveLegalConsultation(input: {
  projectId: string;
  question: string;
  response: ExpertQueryResponse;
  providerMeta: unknown;
}): Promise<{ saved: boolean; id: string | null }> {
  try {
    const { supabase, userId } = await sessionUserId();
    if (!userId) return { saved: false, id: null };
    const { data, error } = await supabase
      .from("legal_consultations")
      .insert({
        project_id: input.projectId,
        author_user_id: userId,
        question: input.question.slice(0, 8000),
        response: input.response as unknown as Record<string, unknown>,
        provider_meta: (input.providerMeta ?? null) as Record<string, unknown> | null,
      })
      .select("id")
      .single();
    if (error || !data) return { saved: false, id: null };
    return { saved: true, id: (data as { id: string }).id };
  } catch {
    return { saved: false, id: null };
  }
}

/** Lista SOMENTE as consultas do autor da sessão neste projeto. `available=false` quando o histórico ainda não existe no banco. */
export async function listOwnLegalConsultations(projectId: string): Promise<{ items: LegalConsultationListItem[]; available: boolean }> {
  try {
    const { supabase, userId } = await sessionUserId();
    if (!userId) return { items: [], available: true };
    const { data, error } = await supabase
      .from("legal_consultations")
      .select("id,question,created_at")
      .eq("project_id", projectId)
      .eq("author_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { items: [], available: false };
    return {
      available: true,
      items: ((data ?? []) as Array<{ id: string; question: string; created_at: string }>).map((row) => ({
        id: row.id,
        question: row.question,
        createdAt: row.created_at,
      })),
    };
  } catch {
    return { items: [], available: false };
  }
}

/** Abre uma consulta por ID. Devolve null se não existir OU se não for do autor da sessão (não há distinção para quem não é o autor). */
export async function getOwnLegalConsultation(projectId: string, consultationId: string): Promise<LegalConsultationDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(consultationId)) return null;
  try {
    const { supabase, userId } = await sessionUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from("legal_consultations")
      .select("id,question,response,provider_meta,created_at")
      .eq("id", consultationId)
      .eq("project_id", projectId)
      .eq("author_user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: string; question: string; response: ExpertQueryResponse; provider_meta: LegalConsultationDetail["providerMeta"]; created_at: string };
    return { id: row.id, question: row.question, createdAt: row.created_at, response: row.response, providerMeta: row.provider_meta };
  } catch {
    return null;
  }
}

/** Exclui a consulta do autor da sessão. true somente se a linha existia e era dele. */
export async function deleteOwnLegalConsultation(projectId: string, consultationId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(consultationId)) return false;
  try {
    const { supabase, userId } = await sessionUserId();
    if (!userId) return false;
    const { data, error } = await supabase
      .from("legal_consultations")
      .delete()
      .eq("id", consultationId)
      .eq("project_id", projectId)
      .eq("author_user_id", userId)
      .select("id");
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}
