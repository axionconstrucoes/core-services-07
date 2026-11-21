"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { buildCompetenceRequestCall, type CompetenceRequestInput } from "@/lib/governance/competence-request-ops";
import { explainGovernanceError } from "@/lib/governance/governance-errors";
import { getProjectTier } from "@/lib/permissions/project-tier-server";

// ÚNICO ponto de escrita da tela de Competências (Fase 6/H2a). Server actions FINAS sobre as RPCs SECURITY DEFINER (migrations 20261205100000
// e 20261208100000): (1) formato (allowlist em lib/governance/competence-request-ops); (2) pertença ao projeto (fail-closed; a RPC é a autoridade
// e repete tudo: papel, independência, evidência, versão); (3) RPC sob a sessão do usuário; (4) o resultado vai para a URL como código
// conhecido (a página só mostra mensagem do catálogo). Nada aqui concede poder: só a RPC de validação o faz, com pessoa independente.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = (projectId: string) => `/${projectId}/competencias`;

const field = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const intField = (f: FormData, k: string): number | undefined => {
  const n = Number(field(f, k));
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

async function run(formData: FormData, make: (projectId: string) => CompetenceRequestInput, okCode: string): Promise<never> {
  const projectId = field(formData, "projectId");
  if (!UUID.test(projectId)) redirect("/projetos");
  if ((await getProjectTier(projectId)) === "NONE") redirect(`${BASE(projectId)}?erro=FORBIDDEN`);
  let call: { rpc: string; params: Record<string, unknown> };
  try {
    call = buildCompetenceRequestCall(make(projectId));
  } catch {
    // a mensagem específica nunca vai para a URL (texto refletido): a página mostra o aviso genérico e os requisitos do formulário
    redirect(`${BASE(projectId)}?erro=ENTRADA`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(call.rpc, call.params);
  if (error) redirect(`${BASE(projectId)}?erro=${explainGovernanceError(error.message).code}`);
  redirect(`${BASE(projectId)}?ok=${okCode}`);
}

export async function requestCompetenceAction(f: FormData): Promise<void> {
  await run(f, (projectId) => ({
    projectId, op: "request_create", userId: field(f, "userId"), competence: field(f, "competence"), evidenceDocumentId: field(f, "evidenceDocumentId"),
    registrationKind: field(f, "registrationKind") || undefined, registrationNumber: field(f, "registrationNumber") || undefined,
    basisNote: field(f, "basisNote") || undefined, validFrom: field(f, "validFrom") || undefined, validUntil: field(f, "validUntil") || undefined,
  }), "solicitada");
}

export async function cancelRequestAction(f: FormData): Promise<void> {
  await run(f, () => ({ op: "request_cancel", id: field(f, "id"), expectedRowVersion: intField(f, "version"), reason: field(f, "reason") }), "cancelada");
}

export async function approveRequestAction(f: FormData): Promise<void> {
  await run(f, () => ({ op: "request_approve", id: field(f, "id"), expectedRowVersion: intField(f, "version"), note: field(f, "note"), evidenceChecked: f.get("evidenceChecked") === "sim" }), "validada");
}

export async function rejectRequestAction(f: FormData): Promise<void> {
  await run(f, () => ({ op: "request_reject", id: field(f, "id"), expectedRowVersion: intField(f, "version"), note: field(f, "note") }), "recusada");
}

export async function revalidateCompetenceAction(f: FormData): Promise<void> {
  await run(f, () => ({ op: "competence_revalidate", id: field(f, "id"), expectedRowVersion: intField(f, "version"), note: field(f, "note"), evidenceChecked: f.get("evidenceChecked") === "sim" }), "revalidada");
}

export async function designateValidatorAction(f: FormData): Promise<void> {
  await run(f, (projectId) => ({
    projectId, op: "validator_designate", userId: field(f, "externalUserId") || field(f, "userId"), designationDocumentId: field(f, "designationDocumentId"),
    reason: field(f, "reason"), validUntil: field(f, "validUntil"),
  }), "designado");
}

export async function acceptValidatorAction(f: FormData): Promise<void> {
  await run(f, () => ({ op: "validator_accept", id: field(f, "id") }), "aceito");
}

export async function revokeValidatorAction(f: FormData): Promise<void> {
  await run(f, () => ({ op: "validator_revoke", id: field(f, "id"), reason: field(f, "reason") }), "revogado");
}
