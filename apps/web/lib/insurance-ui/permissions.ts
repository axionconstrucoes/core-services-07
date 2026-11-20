// Espelho, na interface, de public.insurance_access(project_id, nível) (migration 20261122200000).
// A UI NUNCA é a autoridade: o banco (RLS + RPCs) recusa o que a UI esconder ou deixar passar. Este espelho só decide o que mostrar/habilitar.
//   READ     qualquer membro ACTIVE
//   REGISTER ADMINISTRADOR, ADMIN, GESTOR, GERENTE, COLABORADOR, EDITOR
//   MANAGE   ADMINISTRADOR, ADMIN, GESTOR, GERENTE
//   ADMIN    ADMINISTRADOR, ADMIN

export type InsuranceLevel = "READ" | "REGISTER" | "MANAGE" | "ADMIN";

const REGISTER = ["ADMINISTRADOR", "ADMIN", "GESTOR", "GERENTE", "COLABORADOR", "EDITOR"];
const MANAGE = ["ADMINISTRADOR", "ADMIN", "GESTOR", "GERENTE"];
const ADMIN = ["ADMINISTRADOR", "ADMIN"];

export const INSURANCE_LEVEL_ROLES: Record<InsuranceLevel, readonly string[] | "ANY_ACTIVE_MEMBER"> = {
  READ: "ANY_ACTIVE_MEMBER",
  REGISTER,
  MANAGE,
  ADMIN,
};

/** `permission` = papel do membro ACTIVE no projeto; null/undefined = sem membership ativa (fail-closed). */
export function hasInsuranceLevel(permission: string | null | undefined, level: InsuranceLevel): boolean {
  if (!permission) return false;
  const allowed = INSURANCE_LEVEL_ROLES[level];
  return allowed === "ANY_ACTIVE_MEMBER" ? true : allowed.includes(permission);
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
