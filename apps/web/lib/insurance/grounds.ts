// FUNDAMENTAÇÃO das decisões de sinistro e FONTE das atualizações de fiança/caução (Fase 4 / B). Puro. Espelha as RPCs
// insurance_claim_advance, bank_guarantee_update e other_guarantee_update (migration 20261125202000).
import type { ClaimStage } from "./types";

/** Etapas que exigem fundamentação (nota >= 20 caracteres + ao menos uma fonte). */
export const GROUNDS_STAGES: readonly ClaimStage[] = ["DECISAO", "INDENIZACAO_CUMPRIMENTO", "NEGATIVA", "CONTESTACAO"];
export const GROUNDS_MIN_NOTE = 20;
export const GUARANTEE_UPDATE_MIN_REASON = 10;

export const stageRequiresGrounds = (stage: string): boolean => (GROUNDS_STAGES as readonly string[]).includes(stage);

export interface GroundsInput {
  note?: string | null;
  sourceRefs?: readonly string[] | null;
  documentId?: string | null;
}

export type GroundsCode = "NOTE_REQUIRED" | "GROUNDS_REQUIRED" | "GROUNDS_SOURCES_REQUIRED";

/** Mesma ordem de verificação da RPC: NOTE_REQUIRED (>= 10, etapas já existentes), depois GROUNDS_REQUIRED (>= 20) e GROUNDS_SOURCES_REQUIRED. */
export function checkClaimGrounds(stage: string, input: GroundsInput): GroundsCode | null {
  const note = (input.note ?? "").trim();
  const refs = (input.sourceRefs ?? []).map((r) => r.trim()).filter(Boolean);
  if (["NEGATIVA", "CONTESTACAO", "DOC_COMPLEMENTAR", "ENCERRADO"].includes(stage) && note.length < 10) return "NOTE_REQUIRED";
  if (stageRequiresGrounds(stage)) {
    if (note.length < GROUNDS_MIN_NOTE) return "GROUNDS_REQUIRED";
    if (refs.length === 0 && !input.documentId) return "GROUNDS_SOURCES_REQUIRED";
  }
  return null;
}

export const GROUNDS_MESSAGES: Record<GroundsCode, string> = {
  NOTE_REQUIRED: "Esta etapa exige uma nota fundamentada (mínimo de 10 caracteres).",
  GROUNDS_REQUIRED: "Decisão, indenização/cumprimento, negativa e contestação exigem fundamentação: nota com no mínimo 20 caracteres.",
  GROUNDS_SOURCES_REQUIRED: "A fundamentação exige ao menos uma fonte: documento do projeto e/ou referência (uma por linha).",
};

export type GuaranteeUpdateCode = "UPDATE_SOURCE_REQUIRED" | "UPDATE_REASON_REQUIRED" | "UPDATE_EMPTY";

/** Atualização de fiança/caução: fonte da mudança + motivo + ao menos um campo alterado. Mesma ordem da RPC. */
export function checkGuaranteeUpdate(input: {
  changedKeys: readonly string[];
  updateSourceRef?: string | null;
  updateSourceDocumentId?: string | null;
  updateReason?: string | null;
}): GuaranteeUpdateCode | null {
  if (!(input.updateSourceRef ?? "").trim() && !input.updateSourceDocumentId) return "UPDATE_SOURCE_REQUIRED";
  if ((input.updateReason ?? "").trim().length < GUARANTEE_UPDATE_MIN_REASON) return "UPDATE_REASON_REQUIRED";
  if (input.changedKeys.filter((k) => !k.startsWith("update_")).length === 0) return "UPDATE_EMPTY";
  return null;
}
export const GUARANTEE_UPDATE_MESSAGES: Record<GuaranteeUpdateCode, string> = {
  UPDATE_SOURCE_REQUIRED: "A atualização exige a fonte da mudança (documento do projeto ou referência).",
  UPDATE_REASON_REQUIRED: "Informe o motivo da atualização (mínimo de 10 caracteres).",
  UPDATE_EMPTY: "Nenhum campo a atualizar.",
};
