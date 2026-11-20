// Espelho, na interface, de public.insurance_access(project_id, nível) (migration 20261122200000).
// A UI NUNCA é a autoridade: o banco (RLS + RPCs) recusa o que a UI esconder ou deixar passar. Este espelho só decide o que mostrar/habilitar.
//   READ     qualquer membro ACTIVE
//   REGISTER ADMINISTRADOR, ADMIN, GESTOR, GERENTE, COLABORADOR, EDITOR
//   MANAGE   ADMINISTRADOR, ADMIN, GESTOR, GERENTE
//   ADMIN    ADMINISTRADOR, ADMIN

// Fase 3: a tabela papel -> nível vive em lib/permissions/project-tier.ts (espelho de public.acc_project_tier).
import { projectTierFor, rolesAtLeast, tierAtLeast } from "../permissions/project-tier";

export type InsuranceLevel = "READ" | "REGISTER" | "MANAGE" | "ADMIN";

const REGISTER = rolesAtLeast("REGISTER");
const MANAGE = rolesAtLeast("MANAGE");
const ADMIN = rolesAtLeast("ADMIN");

export const INSURANCE_LEVEL_ROLES: Record<InsuranceLevel, readonly string[] | "ANY_ACTIVE_MEMBER"> = {
  READ: "ANY_ACTIVE_MEMBER",
  REGISTER,
  MANAGE,
  ADMIN,
};

/** `permission` = papel do membro ACTIVE no projeto; null/undefined = sem membership ativa (fail-closed). */
export function hasInsuranceLevel(permission: string | null | undefined, level: InsuranceLevel): boolean {
  return tierAtLeast(projectTierFor(permission), level);
}

/** Etapas do sinistro que registram DECISÃO/encerramento = ato de gestão (espelha insurance_claim_advance, 20261123102000). */
export const INSURANCE_CLAIM_MANAGE_STAGES: readonly string[] = ["DECISAO", "NEGATIVA", "CONTESTACAO", "INDENIZACAO_CUMPRIMENTO", "ENCERRADO"];

/** Nível exigido para avançar o sinistro até a etapa informada. */
export function claimStageLevel(toStage: string | null | undefined): InsuranceLevel {
  return toStage && INSURANCE_CLAIM_MANAGE_STAGES.includes(toStage) ? "MANAGE" : "REGISTER";
}

export interface InsuranceCapabilities {
  read: boolean;
  register: boolean;
  manage: boolean;
  admin: boolean;
}

export function insuranceCapabilities(permission: string | null | undefined): InsuranceCapabilities {
  return {
    read: hasInsuranceLevel(permission, "READ"),
    register: hasInsuranceLevel(permission, "REGISTER"),
    manage: hasInsuranceLevel(permission, "MANAGE"),
    admin: hasInsuranceLevel(permission, "ADMIN"),
  };
}

/** Texto curto para explicar por que uma ação está desabilitada (CASO 31). */
export function levelRequirementText(level: InsuranceLevel): string {
  switch (level) {
    case "READ":
      return "qualquer membro ativo do projeto";
    case "REGISTER":
      return "Administrador, Gestor, Gerente ou Colaborador";
    case "MANAGE":
      return "Administrador, Gestor ou Gerente";
    case "ADMIN":
      return "Administrador";
  }
}
