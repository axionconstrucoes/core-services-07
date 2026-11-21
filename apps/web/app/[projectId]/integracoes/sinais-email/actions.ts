"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { DELEGATION_SCOPES, reviewErrorCode } from "@/lib/email-classification/review";
import { getProjectTier } from "@/lib/permissions/project-tier-server";

const UUID = /^[0-9a-fA-F-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function back(projectId: string, query: string): never {
  redirect(`/${projectId}/integracoes/sinais-email?${query}`);
}

const text = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

// Toda ação: (1) formato; (2) membership ativa no servidor (a autoridade final é a RPC, que repete a checagem de papel/delegação e
// grava a auditoria append-only); (3) sucesso só é informado depois que a RPC retorna sem erro. Nunca envia e-mail nem altera a mensagem.
async function guard(formData: FormData, needAdmin = false): Promise<string> {
  const projectId = text(formData, "projectId");
  if (!UUID.test(projectId)) redirect("/projetos");
  const tier = await getProjectTier(projectId);
  if (tier === "NONE" || (needAdmin && tier !== "ADMIN")) back(projectId, "erro=permissao");
  return projectId;
}

export async function reviewSignalAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData);
  const signalId = text(formData, "signalId");
  const decision = text(formData, "decision");
  if (!UUID.test(signalId) || !["CONFIRM", "DISCARD"].includes(decision)) back(projectId, "erro=falha");
  const note = text(formData, "note").slice(0, 1000);
  if (decision === "DISCARD" && note.length < 5) back(projectId, "erro=justificativa");
  const supabase = await createSupabaseServerClient();
  const r = await supabase.rpc("email_risk_signal_review", { p_signal_id: signalId, p_decision: decision, p_note: note || null });
  if (r.error) back(projectId, `erro=${reviewErrorCode(r.error.message)}`);
  back(projectId, decision === "CONFIRM" ? "ok=confirmado" : "ok=descartado");
}

export async function grantDelegationAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData, true);
  const userId = text(formData, "userId");
  const scope = text(formData, "scope");
  const until = text(formData, "validUntil");
  const reason = text(formData, "reason");
  if (!UUID.test(userId) || !(DELEGATION_SCOPES as readonly string[]).includes(scope) || !DATE.test(until)) back(projectId, "erro=dados");
  if (reason.length < 5) back(projectId, "erro=motivo");
  const supabase = await createSupabaseServerClient();
  // validade até o FIM do dia escolhido (horário de Brasília); o banco recusa passado e > 180 dias
  const r = await supabase.rpc("acc_email_signal_delegate_grant", { p_project_id: projectId, p_user_id: userId, p_scope: scope, p_valid_until: `${until}T23:59:59-03:00`, p_reason: reason.slice(0, 500) });
  if (r.error) back(projectId, `erro=${reviewErrorCode(r.error.message)}`);
  back(projectId, "ok=delegacao");
}

export async function revokeDelegationAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData, true);
  const id = text(formData, "delegationId");
  const reason = text(formData, "reason");
  if (!UUID.test(id)) back(projectId, "erro=dados");
  if (reason.length < 5) back(projectId, "erro=motivo");
  const supabase = await createSupabaseServerClient();
  const r = await supabase.rpc("acc_email_signal_delegate_revoke", { p_delegation_id: id, p_reason: reason.slice(0, 500) });
  if (r.error) back(projectId, `erro=${reviewErrorCode(r.error.message)}`);
  back(projectId, "ok=revogada");
}
