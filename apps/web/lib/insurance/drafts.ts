// Minutas de comunicação. SEMPRE nascem DRAFT; lacunas viram [PREENCHER ...] (a RPC de aprovação recusa texto com
// placeholder). Nunca inventa destinatário/endereço: o canal vem do cadastro (insurance_official_channels).
// A minuta separa FATOS, INFERÊNCIAS e RECOMENDAÇÕES no campo basis.
import type { DraftKind, DraftState } from "./types";

export interface DraftFacts {
  insurerOrBankName?: string | null;
  policyOrGuaranteeNumber?: string | null;
  contractRef?: string | null;
  eventDescription?: string | null;
  eventDate?: string | null;
  protocol?: string | null;
  endorsementRequestedText?: string | null;
  amount?: number | null;
  /** Ids/URLs dos documentos-fonte anexáveis. */
  sources: string[];
}
export interface DraftBasis {
  facts: string[];
  inferences: string[];
  recommendations: string[];
}
export interface BuiltDraft {
  draftKind: DraftKind;
  state: Extract<DraftState, "DRAFT">;
  subject: string;
  body: string;
  basis: DraftBasis;
  placeholders: string[];
  generatedByAi: boolean;
  internalNote: string;
}

const need = (v: string | number | null | undefined, label: string, ph: string[]): string => {
  if (v === null || v === undefined || String(v).trim() === "") {
    ph.push(label);
    return `[PREENCHER ${label}]`;
  }
  return String(v);
};

const OPENING: Record<DraftKind, string> = {
  AVISO_SINISTRO: "Vimos, por meio desta, comunicar a ocorrência do evento descrito abaixo, para as providências cabíveis nos termos da apólice.",
  EXPECTATIVA_SINISTRO: "Vimos, por meio desta, comunicar a expectativa de sinistro descrita abaixo, nos termos previstos contratualmente.",
  RECLAMACAO: "Vimos, por meio desta, apresentar reclamação formal referente ao evento descrito abaixo.",
  ENDOSSO: "Vimos, por meio desta, solicitar a emissão do endosso descrito abaixo.",
  COBRANCA_FIANCA: "Vimos, por meio desta, formalizar a cobrança referente à fiança identificada abaixo, nos termos do instrumento.",
};
const SUBJECT: Record<DraftKind, string> = {
  AVISO_SINISTRO: "Aviso de sinistro",
  EXPECTATIVA_SINISTRO: "Comunicação de expectativa de sinistro",
  RECLAMACAO: "Reclamação formal",
  ENDOSSO: "Solicitação de endosso",
  COBRANCA_FIANCA: "Cobrança de fiança",
};

export function buildDraft(kind: DraftKind, f: DraftFacts, opts: { generatedByAi?: boolean } = {}): BuiltDraft {
  const ph: string[] = [];
  const instrument = need(f.policyOrGuaranteeNumber, "número da apólice/instrumento", ph);
  const lines = [
    `Ref.: ${instrument}${f.contractRef ? ` — contrato ${f.contractRef}` : ""}`,
    "",
    OPENING[kind],
    "",
    kind === "ENDOSSO"
      ? `Texto solicitado: ${need(f.endorsementRequestedText, "texto do endosso solicitado", ph)}`
      : `Descrição do evento: ${need(f.eventDescription, "descrição do evento", ph)}`,
    kind === "ENDOSSO" ? "" : `Data do evento: ${need(f.eventDate, "data do evento", ph)}`,
    f.protocol ? `Protocolo anterior: ${f.protocol}` : "",
    f.amount != null ? `Valor envolvido (informado): ${f.amount.toFixed(2)}` : "",
    "",
    "Documentos de suporte: " + (f.sources.length ? f.sources.join("; ") : need(null, "documentos anexos", ph)),
    "",
    "Solicitamos confirmação de recebimento e de eventual protocolo.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  const facts = [
    f.insurerOrBankName ? `Instrumento junto a ${f.insurerOrBankName}` : "",
    f.eventDate ? `Data do evento informada: ${f.eventDate}` : "",
    ...f.sources.map((s) => `Fonte: ${s}`),
  ].filter(Boolean);
  return {
    draftKind: kind,
    state: "DRAFT",
    subject: SUBJECT[kind] + (f.policyOrGuaranteeNumber ? ` — ${f.policyOrGuaranteeNumber}` : ""),
    body: lines.join("\n"),
    basis: {
      facts,
      inferences: [],
      recommendations: ["Revisar o texto com jurídico/seguros", "Conferir o canal oficial cadastrado e verificado antes de qualquer envio humano fora do ACC"],
    },
    placeholders: ph,
    generatedByAi: opts.generatedByAi ?? false,
    internalNote: "MINUTA — NÃO ENVIADA. Aprovação humana expressa (ADMINISTRADOR) não equivale a envio: a fase 1 não envia.",
  };
}
