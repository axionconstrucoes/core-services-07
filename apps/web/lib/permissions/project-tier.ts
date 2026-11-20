// Espelho, na interface, de public.acc_project_tier(project_id) (migration 20261123100000) — UMA matriz para
// Qualidade, Garantias e Seguros. A UI NUNCA é a autoridade: o banco (RLS + RPCs) recusa o que a tela esconder ou
// deixar passar; este módulo só decide o que mostrar/habilitar e é verificado contra o SQL em teste de paridade
// (scripts/test-permissoes-unificadas-realpg.mjs). Qualquer mudança aqui exige mudar o SQL e docs/permissoes-matriz-central.md.
//
//   ADMIN     ADMINISTRADOR (legado ADMIN)
//   MANAGE    GESTOR, GERENTE
//   REGISTER  COLABORADOR (legado EDITOR)
//   READ      LEITURA (legado VIEWER)
//   NONE      sem membership ACTIVE no projeto, papel desconhecido, sem login (fail-closed)

export type ProjectTier = "ADMIN" | "MANAGE" | "REGISTER" | "READ" | "NONE";

export const PROJECT_TIER_RANK: Record<ProjectTier, number> = { NONE: 0, READ: 1, REGISTER: 2, MANAGE: 3, ADMIN: 4 };

const TIER_BY_ROLE: Readonly<Record<string, ProjectTier>> = {
  ADMINISTRADOR: "ADMIN",
  ADMIN: "ADMIN",
  GESTOR: "MANAGE",
  GERENTE: "MANAGE",
  COLABORADOR: "REGISTER",
  EDITOR: "REGISTER",
  LEITURA: "READ",
  VIEWER: "READ",
};

/** Papéis aceitos por nível mínimo (derivado da MESMA tabela; usado em textos e testes). */
export function rolesAtLeast(min: Exclude<ProjectTier, "NONE">): string[] {
  return Object.entries(TIER_BY_ROLE)
    .filter(([, tier]) => PROJECT_TIER_RANK[tier] >= PROJECT_TIER_RANK[min])
    .map(([role]) => role);
}

/** `permission` = papel do membro; `status` deve ser ACTIVE (inativo/pendente => NONE). null/desconhecido => NONE. */
export function projectTierFor(permission: string | null | undefined, status: string | null | undefined = "ACTIVE"): ProjectTier {
  if (!permission || status !== "ACTIVE") return "NONE";
  return TIER_BY_ROLE[permission] ?? "NONE";
}

export function tierAtLeast(tier: ProjectTier, min: Exclude<ProjectTier, "NONE">): boolean {
  return PROJECT_TIER_RANK[tier] >= PROJECT_TIER_RANK[min];
}
