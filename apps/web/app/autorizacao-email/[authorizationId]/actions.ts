"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { EMAIL_AUTH_NOTICE_VERSION } from "@/lib/email-authorization/notice";

// Única forma de registrar a resposta: server actions chamadas por formulários com confirmação explícita.
// Abrir a página por link (GET) nunca chega aqui. A regra "só o próprio colaborador decide" e "uma única vez"
// é aplicada no banco (decide_email_access_authorization); aqui só se traduz o resultado.

const UUID = /^[0-9a-fA-F-]{36}$/;

function back(id: string, query: string): never {
  redirect(`/autorizacao-email/${id}${query}`);
}

function errorCode(message: string): string {
  for (const code of ["ALREADY_DECIDED", "NOTICE_VERSION_MISMATCH", "NOT_REVOCABLE", "NOT_FOUND"]) if (message.includes(code)) return code.toLowerCase();
  return "falha";
}

export async function decideAuthorizationAction(formData: FormData) {
  const id = String(formData.get("authorizationId") ?? "");
  if (!UUID.test(id)) redirect("/projetos");
  const decision = String(formData.get("decision") ?? "");
  const noticeVersion = String(formData.get("noticeVersion") ?? "");
  const confirmed = formData.get("confirm") === "sim";

  // Confirmação explícita: a caixa de leitura é obrigatória para autorizar; recusar também exige o botão de confirmação.
  if (!["AUTORIZADO", "RECUSADO"].includes(decision) || !confirmed || noticeVersion !== EMAIL_AUTH_NOTICE_VERSION) {
    back(id, "?erro=confirmacao");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_email_access_authorization", { p_id: id, p_decision: decision, p_notice_version: noticeVersion });
  if (error) back(id, `?erro=${errorCode(error.message)}`);
  back(id, `?resultado=${decision === "AUTORIZADO" ? "autorizado" : "recusado"}`);
}

export async function revokeAuthorizationAction(formData: FormData) {
  const id = String(formData.get("authorizationId") ?? "");
  if (!UUID.test(id)) redirect("/projetos");
  if (formData.get("confirm") !== "sim") back(id, "?erro=confirmacao");
  const note = String(formData.get("note") ?? "").slice(0, 500);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_email_access_authorization", { p_id: id, p_note: note || null });
  if (error) back(id, `?erro=${errorCode(error.message)}`);
  back(id, "?resultado=revogado");
}
