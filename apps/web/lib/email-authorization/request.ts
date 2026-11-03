import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { appendAccEmailSignature } from "@/lib/email/branding/acc-email-signature";
import { loadAccLogoInlineImage } from "@/lib/email/branding/load-acc-logo-inline-image";
import { getEmailProvider } from "@/lib/email/get-email-provider";
import { EMAIL_AUTH_NOTICE_VERSION, buildEmailAuthScopeSnapshot } from "./notice";
import { buildAuthorizationRequestEmail } from "./request-email";

export type RequestAuthorizationResult = { ok: true; authorizationId: string; emailSent: boolean } | { ok: false; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "Somente administradores da obra podem solicitar autorizações.",
  USER_NOT_PROJECT_MEMBER: "O colaborador precisa ser membro ativo desta obra.",
  INVALID_ACCOUNT: "Informe uma conta de e-mail @axion.com.br.",
  ALREADY_OPEN: "Já existe uma solicitação pendente ou uma autorização vigente para este colaborador, conta e obra.",
};

/** Mensagens que a página pode exibir vindas da URL (lista fechada: nunca texto arbitrário). */
export const KNOWN_AUTHORIZATION_MESSAGES: ReadonlySet<string> = new Set([...Object.values(ERROR_MESSAGES), "Não foi possível concluir a operação. Tente novamente."]);

export function friendlyAuthorizationError(message: string): string {
  const code = Object.keys(ERROR_MESSAGES).find((key) => message.includes(key));
  return code ? ERROR_MESSAGES[code] : "Não foi possível concluir a operação. Tente novamente.";
}

/**
 * Cria a solicitação (RPC — a regra "só administrador da obra" é aplicada no banco) e envia o e-mail individual ao
 * colaborador. O envio passa por getEmailProvider(), logo pela mesma guarda do modo piloto dos demais e-mails.
 * Se o e-mail falhar, a solicitação continua registrada e o resultado informa emailSent=false.
 */
export async function requestEmailAuthorization(input: { projectId: string; userId: string; accountEmail: string }): Promise<RequestAuthorizationResult> {
  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("request_email_access_authorization", {
    p_project_id: input.projectId,
    p_user_id: input.userId,
    p_account_email: input.accountEmail,
    p_notice_version: EMAIL_AUTH_NOTICE_VERSION,
    p_scope_snapshot: buildEmailAuthScopeSnapshot(),
  });
  if (error || typeof id !== "string") return { ok: false, message: friendlyAuthorizationError(error?.message ?? "") };

  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from("profiles").select("name, email").eq("id", input.userId).maybeSingle(),
    supabase.from("projects").select("name").eq("id", input.projectId).maybeSingle(),
  ]);
  if (!profile?.email || !project?.name) return { ok: true, authorizationId: id, emailSent: false };

  const email = buildAuthorizationRequestEmail({
    collaboratorName: profile.name,
    accountEmail: input.accountEmail.trim().toLowerCase(),
    projectName: project.name,
    authorizationId: id,
    baseUrl: getAppBaseUrl(),
  });
  const logo = loadAccLogoInlineImage();
  const signed = appendAccEmailSignature({ text: email.text, html: email.html }, logo !== null);

  try {
    await getEmailProvider().send({
      to: profile.email,
      subject: email.subject,
      text: signed.text,
      html: signed.html,
      inlineImages: logo ? [logo] : undefined,
      correlationId: crypto.randomUUID(),
      vera: { projectId: input.projectId, context: "autorizacao", authorizationId: id },
    });
    return { ok: true, authorizationId: id, emailSent: true };
  } catch {
    return { ok: true, authorizationId: id, emailSent: false };
  }
}
