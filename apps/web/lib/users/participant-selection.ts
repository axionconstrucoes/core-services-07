// Seleção de participantes por projeto — lógica PURA (sem I/O).
//
// Fonte de verdade: project_memberships (status ACTIVE/INACTIVE). Desmarcar
// = status INACTIVE (reversível, preserva histórico; nunca DELETE). Marcar um
// ex-participante = reativar. Marcar quem nunca participou = adicionar.
// Convites PENDENTES são exibidos e elegíveis na Matriz de SLA, mas não são
// alterados por esta tela. Nada aqui executa ação automática: o plano só
// descreve o que mudaria; a execução exige confirmação explícita e RPCs.

export type ParticipantStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "NOT_MEMBER";

export interface ParticipantRow {
  /** user_id (membros/candidatos) ou id do convite (pendentes). */
  id: string;
  kind: "member" | "invitation" | "candidate";
  name: string;
  email: string;
  permission: string | null;
  area: string | null;
  status: ParticipantStatus;
}

export interface MemberInput {
  projectId: string;
  userId: string;
  status: "ACTIVE" | "INACTIVE";
  permission: string;
  area: string | null;
  user: { name: string; email: string };
}

export interface InvitationInput {
  id: string;
  projectId: string;
  status: string;
  name: string;
  email: string;
  permission: string;
  area: string | null;
}

export interface CandidateInput {
  id: string;
  name: string;
  email: string;
}

export interface Addition {
  permission: string;
  area: string;
}

export type ParticipantOperation =
  | { type: "REACTIVATE"; userId: string }
  | { type: "DEACTIVATE"; userId: string }
  | { type: "ADD"; userId: string; permission: string; area: string };

export interface BlockedChange {
  userId: string;
  reason: "SELF" | "LAST_ADMIN" | "ADDITION_INCOMPLETE" | "UNKNOWN_USER";
  message: string;
}

export interface ParticipantPlan {
  operations: ParticipantOperation[];
  blocked: BlockedChange[];
}

export const NEW_PARTICIPANT_PERMISSIONS = ["ADMINISTRADOR", "GERENTE", "COLABORADOR"] as const;

/** Linhas da lista: SOMENTE o projeto informado (isolamento) + candidatos opcionais. */
export function buildParticipantRows(
  projectId: string,
  members: MemberInput[],
  invitations: InvitationInput[],
  candidates: CandidateInput[]
): ParticipantRow[] {
  const projectMembers = members.filter((m) => m.projectId === projectId);
  const memberIds = new Set(projectMembers.map((m) => m.userId));
  const rows: ParticipantRow[] = [
    ...projectMembers.map<ParticipantRow>((m) => ({
      id: m.userId,
      kind: "member",
      name: m.user.name,
      email: m.user.email,
      permission: m.permission,
      area: m.area,
      status: m.status,
    })),
    ...invitations
      .filter((i) => i.projectId === projectId && i.status === "PENDING")
      .map<ParticipantRow>((i) => ({
        id: i.id,
        kind: "invitation",
        name: i.name,
        email: i.email,
        permission: i.permission,
        area: i.area,
        status: "PENDING",
      })),
    ...candidates
      .filter((c) => !memberIds.has(c.id))
      .map<ParticipantRow>((c) => ({
        id: c.id,
        kind: "candidate",
        name: c.name,
        email: c.email,
        permission: null,
        area: null,
        status: "NOT_MEMBER",
      })),
  ];
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Estado "marcado" inicial = exatamente o estado atual do banco (nada muda sozinho). */
export function initialSelection(rows: ParticipantRow[]): string[] {
  return rows.filter((r) => r.status === "ACTIVE" || r.status === "PENDING").map((r) => r.id);
}

function isActiveAdmin(m: MemberInput): boolean {
  return m.status === "ACTIVE" && m.permission === "ADMINISTRADOR";
}

/**
 * Diff entre o estado atual (membros do projeto) e a seleção -> plano.
 * - Convites pendentes nunca geram operação (ignorados).
 * - O próprio usuário logado nunca é alterado (as RPCs também recusam).
 * - Nunca deixa o projeto sem Administrador ativo (o trigger do banco é a 2a camada).
 * - Ordem: ADD/REACTIVATE antes de DEACTIVATE.
 */
export function planParticipantChanges(input: {
  projectId: string;
  members: MemberInput[];
  selectedIds: Iterable<string>;
  additions?: Record<string, Partial<Addition> | undefined>;
  candidateIds?: Iterable<string>;
  currentUserId: string | null;
}): ParticipantPlan {
  const selected = new Set(input.selectedIds);
  const additions = input.additions ?? {};
  const candidateIds = new Set(input.candidateIds ?? []);
  const members = input.members.filter((m) => m.projectId === input.projectId);
  const byId = new Map(members.map((m) => [m.userId, m]));
  const operations: ParticipantOperation[] = [];
  const blocked: BlockedChange[] = [];

  for (const id of selected) {
    const member = byId.get(id);
    if (member) {
      if (member.status === "INACTIVE") {
        if (id === input.currentUserId) {
          blocked.push({ userId: id, reason: "SELF", message: "Não é permitido alterar a própria participação." });
        } else {
          operations.push({ type: "REACTIVATE", userId: id });
        }
      }
      continue;
    }
    // Convites pendentes, membros de outro projeto e ids desconhecidos
    // (fora da lista de candidatos) nunca viram operação.
    if (!candidateIds.has(id)) continue;
    if (id === input.currentUserId) {
      blocked.push({ userId: id, reason: "SELF", message: "Não é permitido alterar a própria participação." });
      continue;
    }
    const extra = additions[id];
    const permission = extra?.permission;
    const area = extra?.area;
    if (
      !permission ||
      !area ||
      !(NEW_PARTICIPANT_PERMISSIONS as readonly string[]).includes(permission)
    ) {
      blocked.push({ userId: id, reason: "ADDITION_INCOMPLETE", message: "Informe papel e área para adicionar o usuário." });
      continue;
    }
    operations.push({ type: "ADD", userId: id, permission, area });
  }

  const deactivations: ParticipantOperation[] = [];
  for (const member of members) {
    if (member.status !== "ACTIVE" || selected.has(member.userId)) continue;
    if (member.userId === input.currentUserId) {
      blocked.push({ userId: member.userId, reason: "SELF", message: "Não é permitido desativar a própria participação." });
      continue;
    }
    deactivations.push({ type: "DEACTIVATE", userId: member.userId });
  }

  // Proteção do último administrador: considera admins que continuam ativos
  // + admins que serão reativados.
  const deactivatedIds = new Set(deactivations.map((d) => d.userId));
  const reactivatedAdmins = operations.filter(
    (op) => op.type === "REACTIVATE" && byId.get(op.userId)?.permission === "ADMINISTRADOR"
  ).length;
  const addedAdmins = operations.filter((op) => op.type === "ADD" && op.permission === "ADMINISTRADOR").length;
  const remainingAdmins =
    members.filter((m) => isActiveAdmin(m) && !deactivatedIds.has(m.userId)).length + reactivatedAdmins + addedAdmins;

  const finalDeactivations: ParticipantOperation[] = [];
  if (remainingAdmins === 0) {
    for (const op of deactivations) {
      const m = byId.get(op.userId);
      if (m && isActiveAdmin(m)) {
        blocked.push({
          userId: op.userId,
          reason: "LAST_ADMIN",
          message: "O projeto ficaria sem Administrador ativo. Mantenha ao menos um Administrador marcado.",
        });
      } else {
        finalDeactivations.push(op);
      }
    }
  } else {
    finalDeactivations.push(...deactivations);
  }

  return { operations: [...operations, ...finalDeactivations], blocked };
}

export function summarizePlan(plan: ParticipantPlan): { adds: number; reactivations: number; deactivations: number } {
  return {
    adds: plan.operations.filter((o) => o.type === "ADD").length,
    reactivations: plan.operations.filter((o) => o.type === "REACTIVATE").length,
    deactivations: plan.operations.filter((o) => o.type === "DEACTIVATE").length,
  };
}

export interface SlaPersonOption {
  value: string;
  label: string;
  kind: "member" | "invitation";
}

/**
 * Elegibilidade da Matriz de Responsabilidades (SLA): somente participantes
 * ATIVOS do próprio projeto + convites PENDENTES do próprio projeto.
 * Inativos, cancelados/ativados e qualquer registro de outro projeto ficam de fora.
 */
export function resolveEligibleSlaPeople(
  projectId: string,
  members: MemberInput[],
  invitations: InvitationInput[],
  formatMember: (userId: string) => string,
  formatInvitation: (invitationId: string) => string,
  areaLabel: (area: string | null) => string
): SlaPersonOption[] {
  return [
    ...members
      .filter((m) => m.projectId === projectId && m.status === "ACTIVE")
      .map<SlaPersonOption>((m) => ({
        kind: "member",
        value: formatMember(m.userId),
        label: `${m.user.name} — ${areaLabel(m.area)} — ${m.user.email}`,
      })),
    ...invitations
      .filter((i) => i.projectId === projectId && i.status === "PENDING")
      .map<SlaPersonOption>((i) => ({
        kind: "invitation",
        value: formatInvitation(i.id),
        label: `${i.name} — ${areaLabel(i.area)} — ${i.email} — Aguardando primeiro login`,
      })),
  ].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function filterParticipantRows(rows: ParticipantRow[], query: string, status: "ALL" | ParticipantStatus): ParticipantRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (status !== "ALL" && r.status !== status) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.area ?? "").toLowerCase().includes(q);
  });
}
