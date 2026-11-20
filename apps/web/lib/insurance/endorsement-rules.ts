// Regras de endosso. REGRA DE OURO: pedido de endosso NÃO é endosso emitido; a cobertura ampliada só vale após
// emissão formal VERIFICADA (estado CONFERIDO com documento emitido). Espelha insurance_endorsement_advance /
// insurance_endorsement_review (SQL).
//
// FASE 3 / C — DUPLA CONFERÊNCIA HUMANA INDEPENDENTE. Endossos que alteram segurados, beneficiários/partes, obrigações garantidas,
// valores ou coberturas exigem DUAS conferências aprovadas de usuários distintos entre si e distintos de quem SOLICITOU e de quem
// registrou a EMISSÃO. Classificação fail-closed: sem `change_kinds` válido = crítico. A autoridade é o banco; este módulo só
// espelha as regras para a interface (o que mostrar/habilitar) e é verificado contra o banco por scripts/test-endossos-dupla-conferencia.mjs.
import type { EndorsementState, EndorsementSummary } from "./types";

const NEXT: Record<EndorsementState, EndorsementState[]> = {
  SOLICITADO: ["EM_ANALISE", "EMITIDO", "RECUSADO"],
  EM_ANALISE: ["EMITIDO", "RECUSADO"],
  // EMITIDO -> CONFERIDO (conferências aprovadas) ou EM_REVISAO (uma conferência recusada)
  EMITIDO: ["CONFERIDO", "EM_REVISAO"],
  CONFERIDO: [],
  RECUSADO: [],
  // EM_REVISAO -> nova emissão (nova rodada de conferências) ou recusa definitiva
  EM_REVISAO: ["EMITIDO", "RECUSADO"],
};

export function canTransitionEndorsement(from: EndorsementState, to: EndorsementState): boolean {
  return NEXT[from].includes(to);
}

/** Só um endosso CONFERIDO, marcado como efetivo e com documento emitido altera a cobertura. */
export function endorsementExtendsCoverage(e: EndorsementSummary): boolean {
  return e.state === "CONFERIDO" && e.coverageEffective === true && Boolean(e.issuedDocumentId);
}

export function endorsementStatusLabel(e: EndorsementSummary): string {
  switch (e.state) {
    case "SOLICITADO":
      return "Solicitado — sem efeito de cobertura (pedido não é endosso emitido)";
    case "EM_ANALISE":
      return "Em análise pela seguradora — sem efeito de cobertura";
    case "EMITIDO":
      return "Emitido — aguardando conferência do texto emitido; ainda sem efeito de cobertura";
    case "CONFERIDO":
      return endorsementExtendsCoverage(e)
        ? "Emitido e conferido — efeito de cobertura conforme o TEXTO EMITIDO"
        : "Conferido sem documento emitido — inconsistente";
    case "RECUSADO":
      return "Recusado — sem efeito de cobertura";
    case "EM_REVISAO":
      return "Em revisão — uma conferência foi recusada; sem efeito de cobertura até nova emissão e nova conferência";
  }
}

export function normalizeEndorsementText(t: string): string {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface EndorsementComparison {
  textsMatch: boolean;
  /** Termos só no texto solicitado: pedido que a seguradora NÃO emitiu. */
  onlyRequested: string[];
  /** Termos só no texto emitido: acréscimos/restrições que ninguém pediu (ex.: nova exclusão). */
  onlyIssued: string[];
  requiresHumanReview: true;
  epistemic: "FATO";
}

/** Comparação textual solicitado x emitido (mesma normalização do SQL). Não interpreta efeito jurídico. */
export function compareEndorsementTexts(requested: string, issued: string): EndorsementComparison {
  const a = normalizeEndorsementText(requested);
  const b = normalizeEndorsementText(issued);
  const ta = a.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tb = b.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const sa = new Set(ta);
  const sb = new Set(tb);
  return {
    textsMatch: a === b,
    onlyRequested: [...new Set(ta.filter((x) => !sb.has(x)))],
    onlyIssued: [...new Set(tb.filter((x) => !sa.has(x)))],
    requiresHumanReview: true,
    epistemic: "FATO",
  };
}

/* ------------------------------------------------------------------ classificação (change_kinds) ------------------------------------------------------------------ */

/** Itens CRÍTICOS: segurados, beneficiários/partes, obrigações garantidas, valores e coberturas. Qualquer um => dupla conferência. */
export const CRITICAL_CHANGE_KINDS = [
  "SEGURADO",
  "BENEFICIARIO_PARTES",
  "OBRIGACAO_GARANTIDA",
  "VALOR_IMPORTANCIA_SEGURADA",
  "VALOR_LIMITE",
  "VALOR_PREMIO",
  "VALOR_GARANTIDO",
  "COBERTURA_CLAUSULA",
  "COBERTURA_EXCLUSAO",
  "COBERTURA_SUBLIMITE",
  "COBERTURA_FRANQUIA",
] as const;

/** Itens que, SOZINHOS e com texto emitido idêntico ao solicitado, admitem conferência simples. */
export const NON_CRITICAL_CHANGE_KINDS = ["PRORROGACAO_VIGENCIA", "DADOS_CADASTRAIS", "OUTRO_NAO_CRITICO"] as const;

export const ALL_CHANGE_KINDS: readonly string[] = [...CRITICAL_CHANGE_KINDS, ...NON_CRITICAL_CHANGE_KINDS];

export type EndorsementChangeKind = (typeof CRITICAL_CHANGE_KINDS)[number] | (typeof NON_CRITICAL_CHANGE_KINDS)[number];

/** SEM_CLASSIFICACAO: nada declarado (fail-closed). CLASSIFICACAO_CRITICA: algum item crítico. TEXTO_DIVERGENTE: emitido difere do pedido. */
export type DualReviewReason = "SEM_CLASSIFICACAO" | "CLASSIFICACAO_CRITICA" | "TEXTO_DIVERGENTE";

/** Mesma normalização do SQL (insurance_int_endorsement_kinds): caixa alta, sem espaços, sem vazios, sem repetição; valor desconhecido => erro. */
export function normalizeChangeKinds(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new Error("INVALID_CHANGE_KINDS: informe uma lista");
  const out = new Set<string>();
  for (const x of raw) {
    const k = String(x ?? "").trim().toUpperCase();
    if (!k) continue;
    if (!ALL_CHANGE_KINDS.includes(k)) throw new Error("INVALID_CHANGE_KINDS: valor desconhecido");
    out.add(k);
  }
  return [...out].sort();
}

/** Motivo da dupla conferência; `null` = conferência simples. FAIL-CLOSED: sem classificação válida => crítico. Espelha insurance_int_endorsement_dual_reason. */
export function dualReviewReason(kinds: readonly string[] | null | undefined, textsMatch: boolean | null | undefined): DualReviewReason | null {
  if (!kinds || kinds.length === 0) return "SEM_CLASSIFICACAO";
  if (kinds.some((k) => !(NON_CRITICAL_CHANGE_KINDS as readonly string[]).includes(k))) return "CLASSIFICACAO_CRITICA";
  if (textsMatch === false) return "TEXTO_DIVERGENTE";
  return null;
}

export function requiresDualReview(kinds: readonly string[] | null | undefined, textsMatch: boolean | null | undefined): boolean {
  return dualReviewReason(kinds, textsMatch) !== null;
}

/* ------------------------------------------------------------------ conferências ------------------------------------------------------------------ */

export interface EndorsementReviewLite {
  reviewRound: number;
  reviewNo: number;
  reviewerId: string;
  outcome: "APROVADO" | "RECUSADO";
}

export interface EndorsementReviewState {
  requiresDualReview: boolean;
  /** Conferência única histórica (anterior à Fase 3/C): permanece válida. */
  legacySingleReview: boolean;
  state: EndorsementState;
  reviewRound: number;
  requestedBy: string | null;
  issuedBy: string | null;
}

/** Quantas conferências aprovadas são exigidas na rodada (legado: 1, já cumprida). */
export function reviewsRequired(e: Pick<EndorsementReviewState, "requiresDualReview" | "legacySingleReview">): number {
  return e.requiresDualReview && !e.legacySingleReview ? 2 : 1;
}

export interface ReviewProgress {
  round: number;
  required: number;
  approved: number;
  refused: number;
  remaining: number;
  reviewerIds: string[];
}

export function reviewProgress(e: EndorsementReviewState, reviews: readonly EndorsementReviewLite[]): ReviewProgress {
  const mine = reviews.filter((r) => r.reviewRound === e.reviewRound);
  const required = reviewsRequired(e);
  const approved = mine.filter((r) => r.outcome === "APROVADO").length;
  return {
    round: e.reviewRound,
    required,
    approved,
    refused: mine.filter((r) => r.outcome === "RECUSADO").length,
    remaining: Math.max(required - approved, 0),
    reviewerIds: mine.map((r) => r.reviewerId),
  };
}

export type ReviewBlockCode = "NOT_EMITTED" | "NO_USER" | "NOT_MANAGER" | "IS_REQUESTER" | "IS_ISSUER" | "ALREADY_REVIEWED";

const BLOCK_TEXT: Record<ReviewBlockCode, string> = {
  NOT_EMITTED: "O endosso só pode ser conferido depois de EMITIDO e enquanto aguarda conferência.",
  NO_USER: "Não foi possível identificar o usuário; recarregue a página.",
  NOT_MANAGER: "Conferir endosso exige nível de gestão (Gestor, Gerente ou Administrador).",
  IS_REQUESTER: "Você solicitou este endosso: a conferência precisa ser de outra pessoa (independência).",
  IS_ISSUER: "Você registrou a emissão deste endosso: a conferência precisa ser de outra pessoa (independência).",
  ALREADY_REVIEWED: "Você já conferiu este endosso nesta rodada; a segunda conferência precisa ser de outro usuário.",
};

export function reviewBlockText(code: ReviewBlockCode): string {
  return BLOCK_TEXT[code];
}

/**
 * Espelho do que insurance_endorsement_review recusa. A tela usa para bloquear os botões e explicar o motivo; o banco repete
 * TODAS as checagens (e as impõe por constraint), então divergência aqui nunca abre brecha — só mostraria um botão que o banco recusa.
 */
export function reviewBlock(
  userId: string | null | undefined,
  canManage: boolean,
  e: EndorsementReviewState,
  reviews: readonly EndorsementReviewLite[],
): ReviewBlockCode | null {
  if (e.state !== "EMITIDO") return "NOT_EMITTED";
  if (!userId) return "NO_USER";
  if (!canManage) return "NOT_MANAGER";
  if (e.requiresDualReview) {
    if (e.requestedBy && e.requestedBy === userId) return "IS_REQUESTER";
    if (e.issuedBy && e.issuedBy === userId) return "IS_ISSUER";
  }
  if (reviews.some((r) => r.reviewRound === e.reviewRound && r.reviewerId === userId)) return "ALREADY_REVIEWED";
  return null;
}

/** Texto curto do andamento das conferências (ex.: "1 de 2 conferências aprovadas"). */
export function reviewProgressLabel(e: EndorsementReviewState, p: ReviewProgress): string {
  if (e.legacySingleReview) return "Conferência única histórica (anterior à dupla conferência); permanece válida.";
  if (e.state === "CONFERIDO") return `${p.approved} de ${p.required} conferência(s) aprovada(s) — conferido.`;
  if (e.state === "EM_REVISAO") return "Uma conferência foi recusada: sem efeito de cobertura até nova emissão e nova rodada de conferências.";
  if (e.state !== "EMITIDO") return "Conferências só começam depois da emissão.";
  return `${p.approved} de ${p.required} conferência(s) aprovada(s)${p.required > 1 ? " (dupla conferência independente)" : " (conferência simples)"}.`;
}
