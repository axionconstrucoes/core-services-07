// Destino do ENVIAR PARA por e-mail — PURO, sem I/O. Mesma regra para risco e SSMA.
//
// Elegíveis: membros ACTIVE da obra, perfil diferente de LEITURA/VIEWER, e-mail do domínio corporativo e diferente do
// remetente. O destino é resolvido por E-MAIL EXATO ou por NOME COMPLETO ÚNICO (sem diferenciar maiúsculas e acentos).
// Ausente, ambíguo (homônimos) ou inelegível => não resolve: o remetente recebe resposta pedindo correção.

export interface TargetCandidate {
  userId: string;
  name: string | null;
  email: string | null;
  membershipStatus: string | null;
  /** Perfil na obra (ADMINISTRADOR, GESTOR, COLABORADOR, LEITURA…). null = desconhecido. */
  permission: string | null;
}

export type TargetResolution =
  | { ok: true; userId: string; matchedBy: "EMAIL" | "NAME" }
  | { ok: false; reason: "TARGET_MISSING" | "TARGET_NOT_FOUND" | "TARGET_AMBIGUOUS" | "TARGET_NOT_ELIGIBLE" | "TARGET_IS_SENDER" };

const READ_ONLY = new Set(["LEITURA", "VIEWER"]);

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEligibleTarget(candidate: TargetCandidate, input: { senderUserId: string; corporateDomain: string }): boolean {
  const email = (candidate.email ?? "").trim().toLowerCase();
  return (
    candidate.membershipStatus === "ACTIVE" &&
    !READ_ONLY.has((candidate.permission ?? "").toUpperCase()) &&
    email.split("@")[1] === input.corporateDomain.toLowerCase() &&
    candidate.userId !== input.senderUserId
  );
}

export function resolveForwardTarget(input: {
  targetEmail: string | null;
  targetName: string | null;
  candidates: readonly TargetCandidate[];
  senderUserId: string;
  corporateDomain: string;
}): TargetResolution {
  const email = (input.targetEmail ?? "").trim().toLowerCase();
  const name = normalizePersonName(input.targetName ?? "");
  if (!email && name.length < 3) return { ok: false, reason: "TARGET_MISSING" };
  if (email) {
    const found = input.candidates.filter((c) => (c.email ?? "").trim().toLowerCase() === email);
    if (found.length === 0) return { ok: false, reason: "TARGET_NOT_FOUND" };
    if (found.length > 1) return { ok: false, reason: "TARGET_AMBIGUOUS" };
    if (found[0].userId === input.senderUserId) return { ok: false, reason: "TARGET_IS_SENDER" };
    return isEligibleTarget(found[0], input) ? { ok: true, userId: found[0].userId, matchedBy: "EMAIL" } : { ok: false, reason: "TARGET_NOT_ELIGIBLE" };
  }
  const byName = input.candidates.filter((c) => c.name && normalizePersonName(c.name) === name);
  if (byName.length === 0) return { ok: false, reason: "TARGET_NOT_FOUND" };
  const eligible = byName.filter((c) => isEligibleTarget(c, input));
  if (byName.length > 1 && eligible.length !== 1) return { ok: false, reason: eligible.length > 1 ? "TARGET_AMBIGUOUS" : "TARGET_NOT_ELIGIBLE" };
  // Homônimos: mesmo que só um seja elegível, o nome não identifica a pessoa com segurança.
  if (byName.length > 1) return { ok: false, reason: "TARGET_AMBIGUOUS" };
  if (byName[0].userId === input.senderUserId) return { ok: false, reason: "TARGET_IS_SENDER" };
  return eligible.length === 1 ? { ok: true, userId: eligible[0].userId, matchedBy: "NAME" } : { ok: false, reason: "TARGET_NOT_ELIGIBLE" };
}

export function forwardTargetMessage(reason: Exclude<TargetResolution, { ok: true }>["reason"]): string {
  switch (reason) {
    case "TARGET_MISSING":
      return "Informe o destino: \"ENVIAR PARA: nome completo\" ou \"ENVIAR PARA: e-mail corporativo\", seguido da justificativa.";
    case "TARGET_NOT_FOUND":
      return "O destino informado não corresponde a nenhum membro ativo desta obra. Confira o nome completo ou use o e-mail corporativo.";
    case "TARGET_AMBIGUOUS":
      return "Há mais de um membro com esse nome nesta obra. Use o e-mail corporativo do destinatário.";
    case "TARGET_IS_SENDER":
      return "O destino informado é você mesmo. Informe outro membro da obra.";
    default:
      return "O destino informado não pode receber a ação (precisa ser membro ativo da obra, com e-mail corporativo e perfil diferente de LEITURA).";
  }
}
