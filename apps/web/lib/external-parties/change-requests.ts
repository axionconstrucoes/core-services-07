// Fase 6 / H2b — SOLICITAÇÕES de alteração de dados GLOBAIS de organização externa. Puro (sem I/O, sem "server-only").
// Regra do responsável: razão social, CNPJ, tipo, domínios e contatos globais só o ADMINISTRADOR altera; GESTOR/GERENTE SOLICITAM e gerem
// os vínculos do SEU projeto. A autoridade é o banco (RPCs acc_external_*); esta camada só monta o pedido e decide o que a tela mostra.
import type { ProjectTier } from "@/lib/permissions/project-tier";

export const CHANGE_KINDS = ["ORG_CREATE", "ORG_UPDATE", "DOMAIN_SET", "CONTACT_SET"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export type ChangeStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ExternalOrgChangeRequest {
  id: string;
  project_id: string;
  kind: ChangeKind;
  organization_id: string | null;
  payload: Record<string, unknown>;
  reason: string;
  status: ChangeStatus;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  ORG_CREATE: "Cadastrar organização",
  ORG_UPDATE: "Alterar dados da organização",
  DOMAIN_SET: "Domínio de e-mail",
  CONTACT_SET: "Contato da organização",
};
export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = { PENDING: "Pendente", APPROVED: "Aprovada", REJECTED: "Recusada", CANCELLED: "Cancelada" };

/** Só o ADMINISTRADOR do projeto altera dado global diretamente; GESTOR/GERENTE solicitam; demais níveis nem veem a tela. */
export function globalDataMode(tier: ProjectTier): "DIRECT" | "REQUEST" | "NONE" {
  if (tier === "ADMIN") return "DIRECT";
  if (tier === "MANAGE") return "REQUEST";
  return "NONE";
}

/** Texto curto do pedido para a lista (nunca interpreta o conteúdo como instrução). */
export function describeChange(kind: ChangeKind, payload: Record<string, unknown>): string {
  const s = (v: unknown, max = 120): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  switch (kind) {
    case "ORG_CREATE": return `${s(payload.legal_name)} (${s(payload.org_kind, 30)})${payload.tax_id ? ` · ${s(payload.tax_id, 32)}` : ""}`;
    case "ORG_UPDATE": return [payload.legal_name ? `razão social: ${s(payload.legal_name)}` : "", "tax_id" in payload ? `CNPJ: ${s(payload.tax_id, 32) || "(limpar)"}` : "", payload.org_kind ? `tipo: ${s(payload.org_kind, 30)}` : ""].filter(Boolean).join(" · ") || "sem campos";
    case "DOMAIN_SET": return `${s(payload.domain, 253)} (${payload.active === false ? "desativar" : "ativar"})`;
    case "CONTACT_SET": return `${s(payload.email, 254)} → ${s(payload.status, 20)}`;
  }
}

/** Mensagem de erro da RPC -> chave estável usada na URL. */
export function changeErrorCode(message: string): string {
  if (/FORBIDDEN|AUTH_REQUIRED/i.test(message)) return "permissao";
  if (/REASON_REQUIRED/.test(message)) return "motivo";
  if (/NOTE_REQUIRED/.test(message)) return "nota";
  if (/ALREADY_DECIDED/.test(message)) return "ja-decidida";
  if (/INVALID_PAYLOAD|INVALID_KIND/.test(message)) return "dados";
  if (/INVALID_DOMAIN/.test(message)) return "dominio";
  if (/INVALID_EMAIL/.test(message)) return "email";
  if (/NO_LINK/.test(message)) return "sem-vinculo";
  if (/duplicate|unique/i.test(message)) return "duplicado";
  if (/check|violates/i.test(message)) return "dados";
  return "falha";
}
