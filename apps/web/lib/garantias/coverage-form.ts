// Formulário estruturado da CONSULTA DE COBERTURA DE GARANTIA (Bloco 5.3). Puro, sem I/O, sem IA.
// A pessoa preenche os 16 itens (cada um com fonte) e os sinais; a conclusão é DERIVADA por
// deriveWarrantyCoverage (lib/ai/legal/warranty-coverage.ts) — nunca digitada livremente.
// Dado ausente = SEM DADOS (nunca zero, nunca "não coberto"). Nada é enviado, gravado ou decidido aqui.

import {
  WARRANTY_COVERAGE_ITEMS,
  deriveWarrantyCoverage,
  validateWarrantyCoverageOutput,
  validateWarrantyItems,
  type WarrantyCoverageDerivation,
  type WarrantyItemAssessment,
  type WarrantyItemStatus,
  type WarrantySignals,
} from "@/lib/ai/legal/warranty-coverage";
import type { WarrantyCaseView, MaintenanceStatusView } from "./types";
import { CAUSE_CATEGORY_LABELS } from "./labels";

export const COVERAGE_DISCLAIMER =
  "Consulta estruturada de apoio — NÃO é parecer jurídico. Toda conclusão exige revisão humana; a decisão final é do responsável humano (Jurídico/Gestão).";

export const COVERAGE_ESCALATION_NOTICE =
  "Há controvérsia jurídica relevante: encaminhe ao responsável humano (Jurídico). Esta consulta não resolve a controvérsia.";

export const UNCONFIRMED_REFERENCES_NOTICE =
  "Referências NÃO confirmadas em texto oficial: as normas e fontes listadas na aba Referências são um índice de conferência. Fonte secundária nunca fundamenta conclusão; confirme edição e vigência no texto oficial antes de usar.";

export const SOLIDITY_NOTICE =
  "Solidez e segurança: o caso foi marcado como envolvendo solidez e segurança. Esse regime tem tratamento próprio (distinto de vício aparente/oculto, decadência e prescrição); NÃO se aplica prazo universal nem exclusão automática. Encaminhe ao responsável humano.";

export const NO_AUTO_EXCLUSION_NOTICE =
  "Garantia contratual decorrida NÃO exclui a cobertura automaticamente: garantia legal, vício oculto, solidez e segurança e prazos legais são analisados à parte. Não existe prazo único de cinco anos para todo defeito.";

export const MAINTENANCE_FACT_NOTICE =
  "A situação dos comprovantes de manutenção é só constatação de fato (consulta de situação da manutenção do caso). Ela não conclui perda de garantia: a análise contratual/jurídica é separada.";

export interface CoverageItemInput {
  status: WarrantyItemStatus;
  value: string;
  source: string;
}

export interface CoverageFormState {
  items: Record<string, CoverageItemInput>;
  signals: WarrantySignals;
}

export const DEFAULT_SIGNALS: WarrantySignals = {
  contractualWarranty: "NAO_INFORMADA",
  legalWarrantyPotential: "INDETERMINADO",
  hiddenDefect: "INDETERMINADO",
  claimDeadline: "INDETERMINADO",
  maintenance: "SEM_DADOS",
  legalControversy: false,
};

export function emptyCoverageForm(): CoverageFormState {
  const items: Record<string, CoverageItemInput> = {};
  for (const def of WARRANTY_COVERAGE_ITEMS) items[def.key] = { status: "SEM_DADOS", value: "", source: "" };
  return { items, signals: { ...DEFAULT_SIGNALS } };
}

function fill(form: CoverageFormState, key: string, value: string | null | undefined, source: string): void {
  const v = (value ?? "").trim();
  if (!v) return;
  form.items[key] = { status: "PREENCHIDO", value: v, source };
}

/**
 * Pré-preenche a partir do caso e da constatação de manutenção. Só usa o que a pessoa já registrou no caso; a fonte
 * apontada é o próprio caso (conferir o documento original). Sinais jurídicos NUNCA são pré-decididos.
 */
export function prefillCoverageForm(c: WarrantyCaseView, maintenance: MaintenanceStatusView | null): CoverageFormState {
  const form = emptyCoverageForm();
  const src = (campo: string) => `Caso ${c.code} › ${campo} (registrado por pessoa; conferir o documento original)`;
  fill(form, "natureza-produto-servico", c.serviceSystem, src("serviço/sistema"));
  const cause = c.causeCategory !== "A_DEFINIR" ? ` [causa registrada: ${CAUSE_CATEGORY_LABELS[c.causeCategory] ?? c.causeCategory}]` : "";
  fill(form, "tipo-defeito", c.defectDescription ? `${c.defectDescription}${cause}` : null, src("descrição do defeito"));
  fill(form, "data-entrega", c.deliveredAt, src("data de entrega"));
  fill(form, "data-descoberta", c.discoveredAt, src("data de descoberta"));
  fill(form, "data-comunicacao", c.communicatedAt, src("data da comunicação"));
  if (c.warrantyTermsRef) fill(form, "documentos-analisados", c.warrantyTermsRef, src("referência dos termos de garantia"));
  if (c.warrantyTerms && c.warrantyTermsRef) fill(form, "garantia-contratual", c.warrantyTerms, `Termos de garantia — ${c.warrantyTermsRef}`);
  if (maintenance && maintenance.records > 0) {
    fill(
      form,
      "exigencias-manutencao",
      `${maintenance.records} registro(s) de manutenção; ${maintenance.withoutProof} sem comprovante`,
      `quality_warranty_maintenance_status (caso ${c.code})`,
    );
    form.signals.maintenance = maintenance.withoutProof > 0 ? "NAO_COMPROVADA" : "COMPROVADA";
  }
  if (c.hiddenDefect) form.signals.hiddenDefect = "SIM";
  return form;
}

export interface CoverageEvaluation {
  items: WarrantyItemAssessment[];
  derivation: WarrantyCoverageDerivation;
  /** Problemas estruturais dos itens (itens PREENCHIDO sem valor/fonte etc.). */
  itemProblems: string[];
  /** Problemas de linguagem proibida (cinco anos universal, exclusão automática por expiração). */
  outputProblems: string[];
  /** Itens sem dado (SEM DADOS) por rótulo — nunca apresentados como zero. */
  missingLabels: string[];
}

export function toAssessments(form: CoverageFormState): WarrantyItemAssessment[] {
  return WARRANTY_COVERAGE_ITEMS.map((def) => {
    const input = form.items[def.key] ?? { status: "SEM_DADOS" as const, value: "", source: "" };
    if (input.status === "SEM_DADOS") return { key: def.key, status: "SEM_DADOS", value: null, evidence: null };
    return {
      key: def.key,
      status: input.status,
      value: input.status === "NAO_APLICAVEL" ? null : input.value.trim() || null,
      evidence: input.source.trim() || null,
    };
  });
}

export function evaluateCoverageForm(form: CoverageFormState): CoverageEvaluation {
  const items = toAssessments(form);
  const derivation = deriveWarrantyCoverage({ items, signals: form.signals });
  const itemProblems = validateWarrantyItems(items);
  const outputProblems = validateWarrantyCoverageOutput({
    items,
    signals: form.signals,
    conclusion: derivation.conclusion,
    requiresHumanReview: true,
  }).filter((p) => !itemProblems.includes(p));
  const missingLabels = WARRANTY_COVERAGE_ITEMS.filter((def) => items.find((i) => i.key === def.key)?.status === "SEM_DADOS").map((def) => def.label);
  return { items, derivation, itemProblems, outputProblems, missingLabels };
}

export const SIGNAL_OPTIONS = {
  contractualWarranty: [
    ["VIGENTE", "Vigente"],
    ["DECORRIDA", "Decorrida"],
    ["NAO_PREVISTA", "Não prevista"],
    ["NAO_INFORMADA", "Não informada"],
  ],
  legalWarrantyPotential: [
    ["SIM", "Sim"],
    ["NAO", "Não"],
    ["INDETERMINADO", "Indeterminado"],
  ],
  hiddenDefect: [
    ["SIM", "Sim"],
    ["NAO", "Não"],
    ["INDETERMINADO", "Indeterminado"],
  ],
  claimDeadline: [
    ["DENTRO", "Dentro do prazo"],
    ["FORA", "Fora do prazo"],
    ["INDETERMINADO", "Indeterminado"],
  ],
  maintenance: [
    ["COMPROVADA", "Comprovada"],
    ["NAO_COMPROVADA", "Não comprovada"],
    ["NAO_EXIGIDA", "Não exigida"],
    ["SEM_DADOS", "Sem dados"],
  ],
} as const;

/** Avisos permanentes + os contextuais (solidez e segurança, controvérsia). */
export function coverageNotices(opts: { solidityAndSafety?: boolean; legalControversy?: boolean }): string[] {
  const out = [COVERAGE_DISCLAIMER, NO_AUTO_EXCLUSION_NOTICE, UNCONFIRMED_REFERENCES_NOTICE];
  if (opts.solidityAndSafety) out.push(SOLIDITY_NOTICE);
  if (opts.legalControversy) out.push(COVERAGE_ESCALATION_NOTICE);
  return out;
}
