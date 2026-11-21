// FASE 4 / A — COMPETÊNCIAS PROFISSIONAIS (espelho, na interface, de public.project_competences / acc_has_competence,
// migrations 20261124100000..20261124102000). A UI NUNCA é a autoridade: o banco recusa (COMPETENCE_REQUIRED) o que a tela
// deixar passar. Este módulo só decide o que mostrar/habilitar, define o texto das mensagens e é verificado contra o SQL em
// scripts/test-competencias.mjs (puro) e scripts/test-competencias-realpg.mjs (Postgres real).
//
// REGRA: nível de acesso (ADMIN/MANAGE/...) mede AUTORIDADE DE GESTÃO; competência mede HABILITAÇÃO PROFISSIONAL declarada pelo
// administrador. GESTOR/GERENTE/ADMINISTRADOR NÃO são, por causa do papel, responsável técnico, advogado ou especialista em
// seguros. A competência é ADICIONAL ao nível: nunca o substitui.

export const COMPETENCES = ["TECNICO_RESPONSAVEL", "JURIDICO", "SEGUROS"] as const;
export type Competence = (typeof COMPETENCES)[number];

export const COMPETENCE_LABEL: Record<Competence, string> = {
  TECNICO_RESPONSAVEL: "Responsável técnico",
  JURIDICO: "Jurídico",
  SEGUROS: "Seguros",
};

export const COMPETENCE_DESCRIPTION: Record<Competence, string> = {
  TECNICO_RESPONSAVEL: "Habilita a assinar o laudo técnico da RNC (confirmar, não confirmar, encerrar) e o parecer de cobertura de garantia.",
  JURIDICO: "Habilita a registrar decisão, negativa, contestação e indenização de sinistro, e a aprovar minuta ou conferir endosso crítico.",
  SEGUROS: "Habilita a aprovar minuta para envio e a conferir endosso crítico (segurados, beneficiários, obrigações garantidas, valores, coberturas).",
};

export const REGISTRATION_KINDS = ["CREA", "CAU", "OAB", "SUSEP", "OUTRO"] as const;
export type RegistrationKind = (typeof REGISTRATION_KINDS)[number];

/** Atos que exigem competência. `any` = basta UMA das competências listadas. Espelha os gatilhos de 20261124101000/102000. */
export const COMPETENCE_REQUIREMENTS = {
  CLAIM_DECISAO: { any: ["JURIDICO"], label: "Decisão do sinistro" },
  CLAIM_NEGATIVA: { any: ["JURIDICO"], label: "Negativa de cobertura do sinistro" },
  CLAIM_CONTESTACAO: { any: ["JURIDICO"], label: "Contestação da negativa" },
  CLAIM_INDENIZACAO_CUMPRIMENTO: { any: ["JURIDICO"], label: "Indenização/cumprimento do sinistro" },
  DRAFT_APPROVE: { any: ["SEGUROS", "JURIDICO"], label: "Aprovação da minuta para envio" },
  ENDORSEMENT_CRITICAL_REVIEW: { any: ["SEGUROS", "JURIDICO"], label: "Conferência de endosso crítico" },
  QUALITY_NCR_CONFIRMADA: { any: ["TECNICO_RESPONSAVEL"], label: "Laudo técnico da RNC: confirmada" },
  QUALITY_NCR_NAO_CONFIRMADA: { any: ["TECNICO_RESPONSAVEL"], label: "Laudo técnico da RNC: não confirmada" },
  QUALITY_NCR_ENCERRADA: { any: ["TECNICO_RESPONSAVEL"], label: "Encerramento técnico da RNC" },
  QUALITY_WARRANTY_COBERTA: { any: ["TECNICO_RESPONSAVEL"], label: "Parecer de garantia: coberta" },
  QUALITY_WARRANTY_NAO_COBERTA: { any: ["TECNICO_RESPONSAVEL"], label: "Parecer de garantia: não coberta" },
} as const satisfies Record<string, { any: readonly Competence[]; label: string }>;
export type CompetenceAct = keyof typeof COMPETENCE_REQUIREMENTS;

/** Ato correspondente a uma etapa de sinistro (null = a etapa não exige competência). */
export function claimStageCompetenceAct(stage: string | null | undefined): CompetenceAct | null {
  switch (stage) {
    case "DECISAO": return "CLAIM_DECISAO";
    case "NEGATIVA": return "CLAIM_NEGATIVA";
    case "CONTESTACAO": return "CLAIM_CONTESTACAO";
    case "INDENIZACAO_CUMPRIMENTO": return "CLAIM_INDENIZACAO_CUMPRIMENTO";
    default: return null;
  }
}

/** Ato correspondente a uma transição da Qualidade (null = não exige competência). */
export function qualityTransitionCompetenceAct(entityType: "NCR" | "WARRANTY", toState: string | null | undefined): CompetenceAct | null {
  if (entityType === "NCR") {
    if (toState === "CONFIRMADA") return "QUALITY_NCR_CONFIRMADA";
    if (toState === "NAO_CONFIRMADA") return "QUALITY_NCR_NAO_CONFIRMADA";
    if (toState === "ENCERRADA") return "QUALITY_NCR_ENCERRADA";
    return null;
  }
  if (toState === "COBERTA") return "QUALITY_WARRANTY_COBERTA";
  if (toState === "NAO_COBERTA") return "QUALITY_WARRANTY_NAO_COBERTA";
  return null;
}

export interface CompetenceGrantLite {
  userId: string;
  projectId: string;
  competence: string;
  status: string;
  validFrom: string; // yyyy-mm-dd
  validUntil: string | null; // yyyy-mm-dd
}

/**
 * Espelho de acc_user_has_competence: registro ACTIVE, do usuário e do projeto, dentro da validade (datas inclusivas) e o usuário
 * ainda é membro ATIVO (`memberActive`). Fail-closed: qualquer dado ausente => false. `today` = yyyy-mm-dd.
 */
export function hasCompetence(
  grants: readonly CompetenceGrantLite[] | null | undefined,
  userId: string | null | undefined,
  projectId: string | null | undefined,
  anyOf: readonly string[],
  today: string,
  memberActive: boolean,
): boolean {
  if (!grants || !userId || !projectId || !memberActive || anyOf.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return grants.some(
    (g) =>
      g.userId === userId &&
      g.projectId === projectId &&
      g.status === "ACTIVE" &&
      anyOf.includes(g.competence) &&
      (COMPETENCES as readonly string[]).includes(g.competence) &&
      g.validFrom <= today &&
      (g.validUntil === null || g.validUntil >= today),
  );
}

export function competenceActLabel(act: CompetenceAct): string {
  return COMPETENCE_REQUIREMENTS[act].label;
}

/** Mensagem clara quando a competência falta (sempre explica que nível de gestão não substitui). */
export function competenceBlockText(act: CompetenceAct): string {
  const r = COMPETENCE_REQUIREMENTS[act];
  const names = r.any.map((c) => COMPETENCE_LABEL[c]).join(" ou ");
  return `${r.label} exige a competência "${names}" registrada para você neste projeto. O nível de gestão (Gestor, Gerente ou Administrador) não substitui a competência: peça a um Administrador do projeto que a registre, se for o caso.`;
}

/** Texto usado nos botões/linhas quando o usuário tem a competência. */
export function competenceOkText(act: CompetenceAct): string {
  const r = COMPETENCE_REQUIREMENTS[act];
  return `Você tem a competência exigida (${r.any.map((c) => COMPETENCE_LABEL[c]).join(" ou ")}).`;
}

/** Quem pode conceder/revogar: SÓ ADMINISTRADOR (nível ADMIN) do projeto; ninguém concede a si mesmo. */
export function canGrantCompetence(actorTierIsAdmin: boolean, actorId: string | null | undefined, targetUserId: string | null | undefined): { ok: boolean; reason: string | null } {
  if (!actorTierIsAdmin) return { ok: false, reason: "Somente o Administrador do projeto concede ou revoga competência." };
  if (!actorId || !targetUserId) return { ok: false, reason: "Selecione a pessoa." };
  if (actorId === targetUserId) return { ok: false, reason: "O Administrador não concede competência a si mesmo: outro Administrador precisa conceder." };
  return { ok: true, reason: null };
}
