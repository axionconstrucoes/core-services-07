"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { ApprovalInputError, buildDecisionCall, buildPrepareCall, type ApprovalOp } from "@/lib/governance/external-approval-ui";
import { canPrepareSend } from "@/lib/governance/external-send-binding";
import { explainGovernanceError } from "@/lib/governance/governance-errors";
import { getProjectTier } from "@/lib/permissions/project-tier-server";

// ÚNICO ponto de escrita da tela de Aprovações externas (Fase 6/H2a). Server actions FINAS sobre as RPCs acc_external_send_* (migrations
// 20261205102000 e 20261208100000). NUNCA envia e-mail e nunca consome a autorização (o uso único é do fluxo de envio, ainda bloqueado
// pelas travas do ACC). Preparar: COLABORADOR ou acima. Decidir: GESTOR/GERENTE/ADMINISTRADOR (minuta de Seguros só ADMINISTRADOR).
// A RPC é a autoridade e repete tudo; a ação só espelha o nível (fail-closed) e traduz o erro para um código do catálogo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = (projectId: string) => `/${projectId}/aprovacoes-externas`;
const field = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

function projectOf(f: FormData): string {
  const projectId = field(f, "projectId");
  if (!UUID.test(projectId)) redirect("/projetos");
  return projectId;
}

export async function prepareSendAction(f: FormData): Promise<void> {
  const projectId = projectOf(f);
  const tier = await getProjectTier(projectId);
  if (!canPrepareSend(tier)) redirect(`${BASE(projectId)}?erro=FORBIDDEN`);
  let call: { rpc: string; params: Record<string, unknown> };
  try {
    call = buildPrepareCall({
      projectId, context: field(f, "context"), action: field(f, "action"), recipientsText: String(f.get("recipients") ?? ""),
      subject: String(f.get("subject") ?? ""), body: String(f.get("body") ?? ""), attachmentsText: String(f.get("attachments") ?? ""), version: field(f, "version"),
    });
  } catch (e) {
    // mensagem específica nunca vai para a URL: a página mostra o aviso genérico e os requisitos do formulário
    redirect(`${BASE(projectId)}?erro=${e instanceof ApprovalInputError ? "ENTRADA" : "FALHA"}`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(call.rpc, call.params);
  if (error) redirect(`${BASE(projectId)}?erro=${explainGovernanceError(error.message).code}`);
  redirect(`${BASE(projectId)}?ok=preparada`);
}

async function decide(f: FormData, op: ApprovalOp, okCode: string): Promise<never> {
  const projectId = projectOf(f);
  const tier = await getProjectTier(projectId);
  if (tier === "NONE" || tier === "READ") redirect(`${BASE(projectId)}?erro=FORBIDDEN`);
  let call: { rpc: string; params: Record<string, unknown> };
  try {
    call = buildDecisionCall({ op, id: field(f, "id"), reason: String(f.get("reason") ?? ""), externalCount: Number(field(f, "externalCount") || "1") });
  } catch {
    redirect(`${BASE(projectId)}?erro=ENTRADA`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(call.rpc, call.params);
  if (error) redirect(`${BASE(projectId)}?erro=${explainGovernanceError(error.message).code}`);
  redirect(`${BASE(projectId)}?ok=${okCode}`);
}

export async function approveSendAction(f: FormData): Promise<void> {
  await decide(f, "approve", "aprovada");
}
export async function rejectSendAction(f: FormData): Promise<void> {
  await decide(f, "reject", "recusada");
}
export async function cancelSendAction(f: FormData): Promise<void> {
  await decide(f, "cancel", "cancelada");
}
