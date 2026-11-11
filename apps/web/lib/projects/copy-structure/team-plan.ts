// Plano de cópia de EQUIPE entre projetos (lógica pura, sem acesso a banco).
//
// Regras:
//  - só pessoas ATIVAS no projeto de origem são candidatas;
//  - contas compartilhadas, CRM e usuários de teste ficam FORA por padrão (podem ser incluídos de forma explícita);
//  - o perfil proposto nunca é ADMINISTRADOR por padrão (Administrador exige confirmação explícita por pessoa);
//  - quem já é membro do destino NUNCA tem o acesso sobrescrito: vira "já vinculada" ou "conflito";
//  - a própria pessoa que executa não é copiada (já pertence a ambos).

export type TeamPermission = "ADMINISTRADOR" | "GERENTE" | "COLABORADOR" | "LEITURA";

export const TEAM_PERMISSIONS: readonly TeamPermission[] = ["GERENTE", "COLABORADOR", "LEITURA", "ADMINISTRADOR"];

export const TEAM_AREAS = [
  "DIRETORIA",
  "ADMINISTRATIVO",
  "COMERCIAL",
  "FINANCEIRO",
  "ENGENHARIA",
  "ORÇAMENTO",
  "JURÍDICO",
  "PLANEJAMENTO",
  "COMPRAS",
  "SSMA/ESG",
] as const;

export type TeamArea = (typeof TEAM_AREAS)[number];

export interface SourceMember {
  userId: string;
  name: string;
  email: string | null;
  origin: string | null;
  title: string | null;
  permission: string;
  area: string | null;
  status: string;
}

export interface DestinationMember {
  userId: string;
  permission: string;
  area: string | null;
  status: string;
}

export type ExclusionReason = "SHARED_ACCOUNT" | "TEST_USER" | "INACTIVE_IN_SOURCE";
export type CandidateState = "NEW" | "ALREADY_MEMBER" | "SELF";

export interface CandidateRow {
  userId: string;
  name: string;
  email: string | null;
  origin: string | null;
  title: string | null;
  sourcePermission: string;
  sourceArea: string | null;
  proposedPermission: TeamPermission;
  /** O papel de origem é Administrador: o destino propõe GERENTE e só concede Administrador com confirmação explícita. */
  adminNeedsExplicitDecision: boolean;
  proposedArea: TeamArea | null;
  state: CandidateState;
  exclusion: ExclusionReason | null;
  /** Marcado por padrão na seleção em lote (novo, ativo, não excluído). */
  defaultSelected: boolean;
  destination: DestinationMember | null;
}

// ---------- Classificação de contas ----------

// Caixas compartilhadas/institucionais: correspondência EXATA da parte local (conservador, para não excluir pessoas).
const SHARED_LOCAL_PARTS = new Set([
  "crm",
  "contato",
  "comercial",
  "financeiro",
  "administrativo",
  "suporte",
  "sac",
  "atendimento",
  "naoresponda",
  "no-reply",
  "noreply",
  "axion",
  "recepcao",
]);

const SHARED_NAME_PATTERN = /(^|\s)(crm|oficial)(\s|$)|conta (compartilhada|corporativa|institucional)|caixa (compartilhada|corporativa)/i;
const TEST_DOMAIN_PATTERN = /@(example\.(com|org|net)|[^@]*\.(local|test|invalid|localhost))$/i;
const TEST_LOCAL_PATTERN = /^(teste?|test|qa|demo)[-_.0-9]/i;
const TEST_NAME_PATTERN = /^(teste?|test)[-_.\s0-9@]/i;

export function classifyExclusion(member: Pick<SourceMember, "name" | "email" | "status">): ExclusionReason | null {
  if (member.status !== "ACTIVE") return "INACTIVE_IN_SOURCE";
  const email = (member.email ?? "").trim().toLowerCase();
  const local = email.split("@")[0] ?? "";
  const name = (member.name ?? "").trim();
  if (email && (TEST_DOMAIN_PATTERN.test(email) || TEST_LOCAL_PATTERN.test(local))) return "TEST_USER";
  if (TEST_NAME_PATTERN.test(name)) return "TEST_USER";
  if (email && SHARED_LOCAL_PARTS.has(local)) return "SHARED_ACCOUNT";
  if (SHARED_NAME_PATTERN.test(name)) return "SHARED_ACCOUNT";
  return null;
}

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  SHARED_ACCOUNT: "Conta compartilhada/CRM",
  TEST_USER: "Usuário de teste",
  INACTIVE_IN_SOURCE: "Inativo na origem",
};

// ---------- Perfil e área propostos ----------

export function normalizeTeamPermission(permission: string | null | undefined): TeamPermission | null {
  switch (permission) {
    case "ADMINISTRADOR":
    case "GERENTE":
    case "COLABORADOR":
    case "LEITURA":
      return permission;
    case "GESTOR": // valor legado de GERENTE
      return "GERENTE";
    default:
      return null;
  }
}

export function proposePermission(sourcePermission: string): { permission: TeamPermission; adminNeedsExplicitDecision: boolean } {
  const normalized = normalizeTeamPermission(sourcePermission);
  if (normalized === "ADMINISTRADOR") return { permission: "GERENTE", adminNeedsExplicitDecision: true };
  // Papel desconhecido: o menor privilégio, nunca um papel mais alto por suposição.
  return { permission: normalized ?? "LEITURA", adminNeedsExplicitDecision: false };
}

export function isTeamArea(value: string | null | undefined): value is TeamArea {
  return typeof value === "string" && (TEAM_AREAS as readonly string[]).includes(value);
}

// ---------- Candidatos ----------

export function buildCandidates(
  source: readonly SourceMember[],
  destination: readonly DestinationMember[],
  actorUserId: string
): CandidateRow[] {
  const inDestination = new Map(destination.map((member) => [member.userId, member]));
  const seen = new Set<string>();
  const rows: CandidateRow[] = [];
  for (const member of source) {
    if (seen.has(member.userId)) continue; // uma linha por pessoa
    seen.add(member.userId);
    const proposal = proposePermission(member.permission);
    const existing = inDestination.get(member.userId) ?? null;
    const exclusion = classifyExclusion(member);
    const state: CandidateState = member.userId === actorUserId ? "SELF" : existing ? "ALREADY_MEMBER" : "NEW";
    rows.push({
      userId: member.userId,
      name: member.name,
      email: member.email,
      origin: member.origin,
      title: member.title,
      sourcePermission: member.permission,
      sourceArea: member.area,
      proposedPermission: proposal.permission,
      adminNeedsExplicitDecision: proposal.adminNeedsExplicitDecision,
      proposedArea: isTeamArea(member.area) ? member.area : null,
      state,
      exclusion,
      defaultSelected: state === "NEW" && exclusion === null,
      destination: existing,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ---------- Seleção, validação e prévia ----------

export interface TeamSelection {
  userId: string;
  permission: string;
  area: string | null;
  /** Confirmação explícita de Administrador (obrigatória quando permission = ADMINISTRADOR). */
  explicitAdmin?: boolean;
  /** Inclusão deliberada de conta que seria excluída por padrão (compartilhada/CRM/teste). */
  includeExcluded?: boolean;
}

export type BlockReason =
  | "NOT_IN_SOURCE"
  | "SELF"
  | "EXCLUDED_BY_DEFAULT"
  | "INVALID_PERMISSION"
  | "INVALID_AREA"
  | "ADMIN_NOT_CONFIRMED"
  | "DUPLICATE_SELECTION";

export const BLOCK_LABELS: Record<BlockReason, string> = {
  NOT_IN_SOURCE: "Não é membro ativo da origem",
  SELF: "É você: já pertence aos dois projetos",
  EXCLUDED_BY_DEFAULT: "Conta excluída por padrão (inclua de forma explícita se for o caso)",
  INVALID_PERMISSION: "Perfil inválido",
  INVALID_AREA: "Área obrigatória/inválida",
  ADMIN_NOT_CONFIRMED: "Administrador exige confirmação explícita",
  DUPLICATE_SELECTION: "Pessoa repetida na seleção",
};

export interface PreviewItem {
  userId: string;
  name: string;
  email: string | null;
  permission: string;
  area: string | null;
  existingPermission?: string;
  existingArea?: string | null;
  existingStatus?: string;
  reason?: BlockReason;
}

export interface TeamCopyPreview {
  newLinks: PreviewItem[];
  alreadyLinked: PreviewItem[];
  conflicts: PreviewItem[];
  blocked: PreviewItem[];
  /** Seleções que a execução enviará ao servidor (somente "novos vínculos" válidos). */
  executable: TeamSelection[];
}

export function buildPreview(selection: readonly TeamSelection[], candidates: readonly CandidateRow[]): TeamCopyPreview {
  const byUser = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  const preview: TeamCopyPreview = { newLinks: [], alreadyLinked: [], conflicts: [], blocked: [], executable: [] };
  const seen = new Set<string>();

  for (const item of selection) {
    const candidate = byUser.get(item.userId);
    const base: PreviewItem = {
      userId: item.userId,
      name: candidate?.name ?? "(desconhecido)",
      email: candidate?.email ?? null,
      permission: item.permission,
      area: item.area ?? null,
    };
    const block = (reason: BlockReason) => preview.blocked.push({ ...base, reason });

    if (seen.has(item.userId)) { block("DUPLICATE_SELECTION"); continue; }
    seen.add(item.userId);
    if (!candidate || candidate.exclusion === "INACTIVE_IN_SOURCE") { block("NOT_IN_SOURCE"); continue; }
    if (candidate.state === "SELF") { block("SELF"); continue; }

    // Quem já é membro do destino nunca é alterado: igual => já vinculada; diferente/inativo => conflito.
    if (candidate.destination) {
      const existing = candidate.destination;
      const detail = { existingPermission: existing.permission, existingArea: existing.area, existingStatus: existing.status };
      const samePermission = normalizeTeamPermission(existing.permission) === normalizeTeamPermission(item.permission);
      const sameArea = (existing.area ?? null) === (item.area ?? null);
      if (existing.status === "ACTIVE" && samePermission && sameArea) preview.alreadyLinked.push({ ...base, ...detail });
      else preview.conflicts.push({ ...base, ...detail });
      continue;
    }

    if (candidate.exclusion && !item.includeExcluded) { block("EXCLUDED_BY_DEFAULT"); continue; }
    const normalized = normalizeTeamPermission(item.permission);
    if (!normalized) { block("INVALID_PERMISSION"); continue; }
    if (normalized === "ADMINISTRADOR" && !item.explicitAdmin) { block("ADMIN_NOT_CONFIRMED"); continue; }
    if (!isTeamArea(item.area)) { block("INVALID_AREA"); continue; }

    preview.newLinks.push({ ...base, permission: normalized });
    preview.executable.push({ ...item, permission: normalized });
  }
  return preview;
}

/** Resumo estável da seleção executável: a execução só roda o que foi visto na prévia. */
export function selectionSignature(items: readonly TeamSelection[]): string {
  return [...items]
    .map((item) => `${item.userId}|${normalizeTeamPermission(item.permission) ?? item.permission}|${item.area ?? ""}|${item.explicitAdmin ? "A" : "-"}|${item.includeExcluded ? "X" : "-"}`)
    .sort()
    .join(";");
}
