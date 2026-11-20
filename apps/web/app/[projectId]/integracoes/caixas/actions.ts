"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { isProjectAdmin } from "@/lib/email-authorization/guard";
import { getMailboxDiagnosticsEvidence } from "@/lib/email/ingestion/get-mailbox-diagnostics-evidence";
import {
  authorizeMailboxAdminAction,
  buildMailboxDiagnostics,
  friendlyMailboxRpcError,
  type MailboxAdminAction,
} from "@/lib/email/ingestion/mailbox-diagnostics";

const UUID = /^[0-9a-fA-F-]{36}$/;
const MAILBOX = /^[a-z0-9._%+-]+@axion\.com\.br$/;

function back(projectId: string, mailbox: string, query: string): never {
  redirect(`/${projectId}/integracoes/caixas?caixa=${encodeURIComponent(mailbox)}&${query}`);
}

type Ctx = { projectId: string; mailbox: string };

// Toda ação: (1) formato; (2) administrador ATIVO da obra no servidor; (3) estado ATUAL da caixa relido no servidor e a
// ação precisa estar liberada (nunca confia no botão da página); (4) RPC (o banco repete as checagens); (5) sucesso SÓ
// depois de reler o controle e confirmar a persistência.
async function guard(formData: FormData, action: MailboxAdminAction): Promise<Ctx> {
  const projectId = String(formData.get("projectId") ?? "");
  const mailbox = String(formData.get("mailbox") ?? "").trim().toLowerCase();
  if (!UUID.test(projectId)) redirect("/projetos");
  if (!MAILBOX.test(mailbox)) back(projectId, "", "erro=caixa");
  const { isAdmin } = await isProjectAdmin(projectId);
  const supabase = await createSupabaseServerClient();
  const evidence = isAdmin ? await getMailboxDiagnosticsEvidence(supabase, projectId) : null;
  const row = evidence ? buildMailboxDiagnostics(evidence).find((item) => item.mailbox === mailbox) ?? null : null;
  const decision = authorizeMailboxAdminAction({ isAdmin, row, action });
  if (!decision.ok) back(projectId, mailbox, `erro=${encodeURIComponent(decision.reason)}`);
  return { projectId, mailbox };
}

async function readControl(ctx: Ctx) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_mailbox_collection_controls")
    .select("corporate_authorization_status,collection_enabled,period_start,period_end,revoked_at")
    .eq("project_id", ctx.projectId).eq("mailbox_address", ctx.mailbox).maybeSingle();
  return error ? null : data;
}

const NOT_CONFIRMED = encodeURIComponent("A operação não pôde ser confirmada no banco. Recarregue a página antes de tentar de novo.");

export async function registerCorporateAuthorizationAction(formData: FormData) {
  const ctx = await guard(formData, "REGISTRAR_AUTORIZACAO");
  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length < 3 || reference.length > 300) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent("Informe a referência da decisão (3 a 300 caracteres).")}`);
  if (formData.get("confirm") !== "sim") back(ctx.projectId, ctx.mailbox, "erro=confirmacao");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_mailbox_corporate_authorization", { p_project_id: ctx.projectId, p_mailbox: ctx.mailbox, p_reference: reference });
  if (error) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent(friendlyMailboxRpcError(error.message))}`);
  const after = await readControl(ctx);
  if (after?.corporate_authorization_status !== "AUTORIZADA") back(ctx.projectId, ctx.mailbox, `erro=${NOT_CONFIRMED}`);
  back(ctx.projectId, ctx.mailbox, "resultado=autorizada");
}

function parseDate(value: FormDataEntryValue | null, endOfDay: boolean): string | null {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  // Datas no fuso de São Paulo (UTC-3): início às 00:00, fim às 23:59:59.
  return new Date(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}-03:00`).toISOString();
}

export async function enableCollectionAction(formData: FormData) {
  const ctx = await guard(formData, "HABILITAR_COLETA");
  const start = parseDate(formData.get("periodStart"), false);
  const end = parseDate(formData.get("periodEnd"), true);
  if (!start || !end) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent("Informe início e fim do período autorizado.")}`);
  if (Date.parse(end) <= Date.parse(start)) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent("O fim do período precisa ser posterior ao início.")}`);
  if (formData.get("confirm") !== "sim") back(ctx.projectId, ctx.mailbox, "erro=confirmacao");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_mailbox_collection", { p_project_id: ctx.projectId, p_mailbox: ctx.mailbox, p_enabled: true, p_period_start: start, p_period_end: end });
  if (error) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent(friendlyMailboxRpcError(error.message))}`);
  const after = await readControl(ctx);
  if (!after?.collection_enabled || Date.parse(String(after.period_start)) !== Date.parse(start) || Date.parse(String(after.period_end)) !== Date.parse(end)) {
    back(ctx.projectId, ctx.mailbox, `erro=${NOT_CONFIRMED}`);
  }
  back(ctx.projectId, ctx.mailbox, "resultado=habilitada");
}

export async function disableCollectionAction(formData: FormData) {
  const ctx = await guard(formData, "DESABILITAR_COLETA");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_mailbox_collection", { p_project_id: ctx.projectId, p_mailbox: ctx.mailbox, p_enabled: false, p_period_start: null, p_period_end: null });
  if (error) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent(friendlyMailboxRpcError(error.message))}`);
  const after = await readControl(ctx);
  if (!after || after.collection_enabled) back(ctx.projectId, ctx.mailbox, `erro=${NOT_CONFIRMED}`);
  back(ctx.projectId, ctx.mailbox, "resultado=desabilitada");
}

export async function revokeCollectionAction(formData: FormData) {
  const ctx = await guard(formData, "REVOGAR");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent("Informe o motivo (3 a 500 caracteres).")}`);
  if (formData.get("confirm") !== "sim") back(ctx.projectId, ctx.mailbox, "erro=confirmacao");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_mailbox_collection", { p_project_id: ctx.projectId, p_mailbox: ctx.mailbox, p_reason: reason });
  if (error) back(ctx.projectId, ctx.mailbox, `erro=${encodeURIComponent(friendlyMailboxRpcError(error.message))}`);
  const after = await readControl(ctx);
  if (!after?.revoked_at || after.collection_enabled) back(ctx.projectId, ctx.mailbox, `erro=${NOT_CONFIRMED}`);
  back(ctx.projectId, ctx.mailbox, "resultado=revogada");
}
