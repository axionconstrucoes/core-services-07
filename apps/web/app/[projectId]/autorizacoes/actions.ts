"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { isProjectAdmin } from "@/lib/email-authorization/guard";
import { friendlyAuthorizationError, requestEmailAuthorization } from "@/lib/email-authorization/request";

const UUID = /^[0-9a-fA-F-]{36}$/;

function back(projectId: string, query: string): never {
  redirect(`/${projectId}/autorizacoes${query}`);
}

// Solicitar: só administrador da obra (checado aqui e, de novo, no banco). Envia o e-mail individual ao colaborador.
export async function requestAuthorizationAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  if (!UUID.test(projectId)) redirect("/projetos");
  if (!(await isProjectAdmin(projectId)).isAdmin) back(projectId, "?erro=permissao");

  const userId = String(formData.get("userId") ?? "");
  if (!UUID.test(userId)) back(projectId, "?erro=colaborador");

  const supabase = await createSupabaseServerClient();
  let accountEmail = String(formData.get("accountEmail") ?? "").trim().toLowerCase();
  if (!accountEmail) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
    accountEmail = (profile?.email ?? "").toLowerCase();
  }

  const result = await requestEmailAuthorization({ projectId, userId, accountEmail });
  if (!result.ok) back(projectId, `?erro=${encodeURIComponent(result.message)}`);
  back(projectId, result.emailSent ? "?resultado=solicitada" : "?resultado=solicitada-sem-email");
}

// Revogar (ou cancelar solicitação pendente) pela aba: o banco só aceita administrador da obra ou o próprio titular.
export async function adminRevokeAuthorizationAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const id = String(formData.get("authorizationId") ?? "");
  if (!UUID.test(projectId) || !UUID.test(id)) redirect("/projetos");
  if (!(await isProjectAdmin(projectId)).isAdmin) back(projectId, "?erro=permissao");
  if (formData.get("confirm") !== "sim") back(projectId, "?erro=confirmacao");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_email_access_authorization", {
    p_id: id,
    p_note: String(formData.get("note") ?? "").slice(0, 500) || null,
  });
  if (error) back(projectId, `?erro=${encodeURIComponent(friendlyAuthorizationError(error.message))}`);
  back(projectId, "?resultado=revogada");
}
