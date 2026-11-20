// Regras de endosso. REGRA DE OURO: pedido de endosso NÃO é endosso emitido; a cobertura ampliada só vale após
// emissão formal VERIFICADA (estado CONFERIDO com documento emitido). Espelha insurance_endorsement_advance (SQL).
import type { EndorsementState, EndorsementSummary } from "./types";

const NEXT: Record<EndorsementState, EndorsementState[]> = {
  SOLICITADO: ["EM_ANALISE", "EMITIDO", "RECUSADO"],
  EM_ANALISE: ["EMITIDO", "RECUSADO"],
  EMITIDO: ["CONFERIDO"],
  CONFERIDO: [],
  RECUSADO: [],
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
