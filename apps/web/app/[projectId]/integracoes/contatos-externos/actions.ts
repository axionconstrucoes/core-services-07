"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { ORG_KINDS } from "@/lib/external-parties/types";
import { getProjectTier } from "@/lib/permissions/project-tier-server";

const UUID = /^[0-9a-fA-F-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function back(projectId: string, query: string): never {
  redirect(`/${projectId}/integracoes/contatos-externos?${query}`);
}

// Toda ação: (1) formato; (2) nível MANAGE/ADMIN no servidor (acc_project_tier); (3) RPC (o banco repete a checagem e grava a auditoria).
// Sucesso só é informado depois que a RPC retorna sem erro. Nunca envia e-mail nem altera mensagens.
async function guard(formData: FormData): Promise<string> {
  const projectId = String(formData.get("projectId") ?? "");
  if (!UUID.test(projectId)) redirect("/projetos");
  const tier = await getProjectTier(projectId);
  if (tier !== "MANAGE" && tier !== "ADMIN") back(projectId, "erro=permissao");
  return projectId;
}

function errCode(message: string): string {
  if (/FORBIDDEN|AUTH_REQUIRED/i.test(message)) return "permissao";
  if (/INVALID_DOMAIN/.test(message)) return "dominio";
  if (/INVALID_EMAIL/.test(message)) return "email";
  if (/NO_LINK/.test(message)) return "sem-vinculo";
  if (/duplicate|unique/i.test(message)) return "duplicado";
  if (/check|violates/i.test(message)) return "dados";
  return "falha";
}

const text = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const scopeOf = (raw: string): string[] => raw.split(/[,;\n]/).map((s) => s.trim().toUpperCase().replace(/\s+/g, "_")).filter(Boolean).slice(0, 20);

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData);
  const kind = text(formData, "orgKind");
  const name = text(formData, "legalName");
  if (!(ORG_KINDS as readonly string[]).includes(kind) || name.length < 2) back(projectId, "erro=dados");
  const confirm = formData.get("confirm") === "sim";
  const validFrom = text(formData, "validFrom");
  const validUntil = text(formData, "validUntil");
  if ((validFrom && !DATE.test(validFrom)) || (validUntil && !DATE.test(validUntil))) back(projectId, "erro=dados");
  const supabase = await createSupabaseServerClient();
  const org = await supabase.rpc("acc_external_org_save", {
    p_project_id: projectId,
    p_org: { legal_name: name, tax_id: text(formData, "taxId"), org_kind: kind, notes: text(formData, "notes") },
    p_reason: null,
  });
  if (org.error || typeof org.data !== "string") back(projectId, `erro=${errCode(org.error?.message ?? "")}`);
  const link = await supabase.rpc("acc_external_link_save", {
    p_project_id: projectId,
    p_link: {
      organization_id: org.data,
      role_in_project: kind,
      contract_ref: text(formData, "contractRef"),
      delegation_clause_ref: text(formData, "clauseRef"),
      delegation_scope: scopeOf(text(formData, "scope")),
      valid_from: validFrom || undefined,
      valid_until: validUntil || undefined,
      status: confirm ? "ACTIVE" : "CANDIDATE",
    },
    p_reason: text(formData, "reason") || null,
  });
  if (link.error) back(projectId, `erro=${errCode(link.error.message)}`);
  const domain = text(formData, "domain");
  if (domain) {
    const d = await supabase.rpc("acc_external_domain_set", { p_project_id: projectId, p_org_id: org.data, p_domain: domain, p_active: true, p_reason: null });
    if (d.error) back(projectId, `erro=${errCode(d.error.message)}`);
  }
  back(projectId, confirm ? "ok=organizacao-ativa" : "ok=organizacao-candidata");
}

export async function setLinkAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData);
  const linkId = text(formData, "linkId");
  const status = text(formData, "status");
  if (!UUID.test(linkId) || !["ACTIVE", "CANDIDATE", "ENDED"].includes(status)) back(projectId, "erro=dados");
  if (status === "ACTIVE" && formData.get("confirm") !== "sim") back(projectId, "erro=confirmacao");
  const validUntil = text(formData, "validUntil");
  if (validUntil && !DATE.test(validUntil)) back(projectId, "erro=dados");
  const link: Record<string, unknown> = { id: linkId, status, delegation_scope: scopeOf(text(formData, "scope")), delegation_clause_ref: text(formData, "clauseRef"), contract_ref: text(formData, "contractRef"), valid_until: validUntil || null };
  const supabase = await createSupabaseServerClient();
  const r = await supabase.rpc("acc_external_link_save", { p_project_id: projectId, p_link: link, p_reason: text(formData, "reason") || null });
  if (r.error) back(projectId, `erro=${errCode(r.error.message)}`);
  back(projectId, "ok=vinculo");
}

export async function addDomainAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData);
  const orgId = text(formData, "orgId");
  if (!UUID.test(orgId)) back(projectId, "erro=dados");
  const supabase = await createSupabaseServerClient();
  const r = await supabase.rpc("acc_external_domain_set", { p_project_id: projectId, p_org_id: orgId, p_domain: text(formData, "domain"), p_active: formData.get("active") !== "nao", p_reason: text(formData, "reason") || null });
  if (r.error) back(projectId, `erro=${errCode(r.error.message)}`);
  back(projectId, (r.data as { domain_shared?: boolean } | null)?.domain_shared ? "ok=dominio-compartilhado" : "ok=dominio");
}

export async function setContactAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData);
  const orgId = text(formData, "orgId");
  const status = text(formData, "status");
  if (!UUID.test(orgId) || !["CONFIRMED", "CANDIDATE", "REJECTED"].includes(status)) back(projectId, "erro=dados");
  const supabase = await createSupabaseServerClient();
  const r = await supabase.rpc("acc_external_contact_set", { p_project_id: projectId, p_org_id: orgId, p_email: text(formData, "email"), p_display_name: text(formData, "displayName") || null, p_status: status, p_reason: text(formData, "reason") || null });
  if (r.error) back(projectId, `erro=${errCode(r.error.message)}`);
  back(projectId, "ok=contato");
}

export async function decideCandidateAction(formData: FormData): Promise<void> {
  const projectId = await guard(formData);
  const candidateId = text(formData, "candidateId");
  const decision = text(formData, "decision");
  const orgId = text(formData, "orgId");
  if (!UUID.test(candidateId) || !["CONFIRM", "REJECT"].includes(decision)) back(projectId, "erro=dados");
  if (decision === "CONFIRM" && !UUID.test(orgId)) back(projectId, "erro=organizacao");
  const supabase = await createSupabaseServerClient();
  const r = await supabase.rpc("acc_external_candidate_decide", { p_project_id: projectId, p_candidate_id: candidateId, p_decision: decision, p_org_id: UUID.test(orgId) ? orgId : null, p_reason: text(formData, "reason") || null });
  if (r.error) back(projectId, `erro=${errCode(r.error.message)}`);
  back(projectId, decision === "CONFIRM" ? "ok=candidato-confirmado" : "ok=candidato-rejeitado");
}
