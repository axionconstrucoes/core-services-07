// Campo "Obra" dos formulários SSMA/ESG: regras PURAS (sem React/rede) de seleção inicial, autorização local
// e limpeza de campos dependentes ao trocar de obra. A autorização REAL é sempre do servidor (RLS/RPC);
// aqui só se impede digitar/escolher uma obra fora da lista de obras autorizadas do usuário.

export interface SelectableProject {
  id: string;
  label: string;
  /** Membros ativos que podem ser responsáveis (id e nome). */
  members: Array<{ userId: string; name: string }>;
}

export type ProjectSelectionReason = "context" | "single" | "needs-selection" | "none";

export interface ProjectSelection {
  projectId: string | null;
  reason: ProjectSelectionReason;
}

/**
 * Escolha inicial da obra:
 *  - dentro de uma obra (contexto válido e autorizado) → a obra atual;
 *  - sem contexto e com UM só projeto autorizado → esse projeto;
 *  - vários projetos e nenhum contexto → exige seleção (projectId null);
 *  - nenhum projeto autorizado → "none".
 */
export function resolveInitialProject(authorized: readonly SelectableProject[], contextProjectId?: string | null): ProjectSelection {
  if (authorized.length === 0) return { projectId: null, reason: "none" };
  if (contextProjectId && authorized.some((project) => project.id === contextProjectId)) return { projectId: contextProjectId, reason: "context" };
  if (authorized.length === 1) return { projectId: authorized[0].id, reason: "single" };
  return { projectId: null, reason: "needs-selection" };
}

/** Só aceita obras presentes na lista autorizada (nunca um id digitado/arbitrário). */
export function isAuthorizedProject(authorized: readonly SelectableProject[], projectId: string | null | undefined): projectId is string {
  return !!projectId && authorized.some((project) => project.id === projectId);
}

export function findProject(authorized: readonly SelectableProject[], projectId: string | null | undefined): SelectableProject | null {
  return authorized.find((project) => project.id === projectId) ?? null;
}

/** Campos dependentes da obra num rascunho de registro de campo. */
export interface ProjectDependentFields {
  responsibleUserId: string;
  dueDate: string;
}

/**
 * Ao trocar de obra: o responsável só é mantido se também for membro da nova obra; o prazo acompanha o
 * responsável. Os demais campos do rascunho (descrição, local, categoria, risco, fotos…) NÃO são tocados.
 */
export function reconcileDependentFields(
  fields: ProjectDependentFields,
  nextProject: SelectableProject | null
): { fields: ProjectDependentFields; cleared: Array<"responsavel" | "prazo"> } {
  if (!fields.responsibleUserId) return { fields, cleared: [] };
  const stillMember = !!nextProject && nextProject.members.some((member) => member.userId === fields.responsibleUserId);
  if (stillMember) return { fields, cleared: [] };
  return { fields: { responsibleUserId: "", dueDate: "" }, cleared: fields.dueDate ? ["responsavel", "prazo"] : ["responsavel"] };
}

/**
 * Obra de um registro pendente: a obra gravada no próprio registro, jamais a da navegação atual.
 */
export function pendingRecordProjectId(item: { projectId: string }): string {
  return item.projectId;
}
