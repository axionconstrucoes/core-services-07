// Dedupe Qualidade x SSMA (e demais origens) por REFERÊNCIA DE ORIGEM. Espelha quality_origin_key (SQL).
// A mesma fonte original (foto SSMA, e-mail, diário, laudo...) não pode gerar duas RNC ativas no projeto.

import type { EvidenceClassification, OriginType } from "./types";

/** Chave canônica da origem: TIPO:ref (ref em minúsculas, sem <> do Message-ID). Igual a public.quality_origin_key. */
export function buildOriginKey(type: OriginType | string, ref: string): string {
  const cleaned = ref.trim().replace(/^</, "").replace(/>$/, "").toLowerCase();
  return `${type.trim().toUpperCase()}:${cleaned}`;
}

export interface OriginCandidate {
  id: string;
  state: string;
  originKey: string;
}

/** RNC ativa para a mesma origem, se houver (DUPLICADA e CANCELADA liberam a origem). */
export function findActiveByOrigin<T extends OriginCandidate>(
  existing: readonly T[],
  type: OriginType | string,
  ref: string,
): T | undefined {
  const key = buildOriginKey(type, ref);
  return existing.find((n) => n.originKey === key && n.state !== "DUPLICADA" && n.state !== "CANCELADA");
}

export type DedupeDecision =
  | { action: "CREATE"; originKey: string }
  | { action: "LINK_EXISTING"; originKey: string; existingId: string };

/** Decisão antes de abrir RNC: criar nova ou apontar a existente (sem criar). */
export function decideNcrCreation<T extends OriginCandidate>(
  existing: readonly T[],
  type: OriginType | string,
  ref: string,
): DedupeDecision {
  const originKey = buildOriginKey(type, ref);
  const hit = findActiveByOrigin(existing, type, ref);
  return hit ? { action: "LINK_EXISTING", originKey, existingId: hit.id } : { action: "CREATE", originKey };
}

/** Evidência repetida no mesmo caso = mesma fonte (tipo + ref normalizada). */
export function evidenceDedupeKey(sourceType: string, sourceRef: string): string {
  return buildOriginKey(sourceType, sourceRef);
}

const STRENGTH: Record<EvidenceClassification, number> = { SUSPEITA: 1, INDICIO: 2, NC_COMPROVADA: 3, RISCO_POTENCIAL: 0 };

/** Só NC_COMPROVADA sustenta a confirmação de uma RNC; INDICIO/SUSPEITA exigem investigação; RISCO_POTENCIAL não prova NC. */
export function canSupportConfirmation(c: EvidenceClassification): boolean {
  return c === "NC_COMPROVADA";
}

export function strongestClassification(list: readonly EvidenceClassification[]): EvidenceClassification | null {
  let best: EvidenceClassification | null = null;
  for (const c of list) if (best === null || STRENGTH[c] > STRENGTH[best]) best = c;
  return best;
}
