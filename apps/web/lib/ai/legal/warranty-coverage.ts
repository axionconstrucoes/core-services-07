// COBERTURA DE GARANTIA PÓS-ENTREGA (Bloco 5.3): 16 itens, nesta ordem, que o Consultor Jurídico IA apresenta.
// A Qualidade monta os FATOS e DATAS (itens 1–6, 14); o Jurídico CONCLUI (itens 7–13, 15–16). Puro, sem I/O, sem IA.
// Distinto de COVERAGE_ITEMS/INSURANCE_COVERAGE_ITEMS (insurance-warranty.ts), que tratam da cobertura da APÓLICE em sinistro.
//
// Regras fixas: sem exclusão automática por mera expiração da garantia contratual; sem prazo universal de cinco anos;
// distinção entre solidez e segurança, vício aparente, vício oculto, decadência, prescrição e indenização; controvérsia
// jurídica vai ao responsável humano; a conclusão é DERIVADA, nunca livre.

import { AUTO_EXCLUSION_BY_EXPIRY, COVERAGE_CONCLUSIONS, FIVE_YEARS_UNIVERSAL, type CoverageConclusion } from "./insurance-warranty";

export interface WarrantyCoverageItemDefinition {
  order: number;
  key: string;
  label: string;
  /** Quem monta o item: fatos/datas = Qualidade; conclusão jurídica = Jurídico. */
  owner: "QUALIDADE" | "JURIDICO";
  /** Item 'quando cabível' pode ser NAO_APLICAVEL (com justificativa). */
  optional: boolean;
  /** Fundamental: sem ele não há conclusão além de INFORMAÇÕES INSUFICIENTES. */
  core: boolean;
}

export const WARRANTY_COVERAGE_ITEMS: readonly WarrantyCoverageItemDefinition[] = [
  { order: 1, key: "natureza-produto-servico", label: "Natureza do produto ou serviço", owner: "QUALIDADE", optional: false, core: true },
  { order: 2, key: "tipo-defeito", label: "Tipo do defeito", owner: "QUALIDADE", optional: false, core: true },
  { order: 3, key: "data-entrega", label: "Data de entrega", owner: "QUALIDADE", optional: false, core: true },
  { order: 4, key: "data-descoberta", label: "Data de descoberta", owner: "QUALIDADE", optional: false, core: true },
  { order: 5, key: "data-comunicacao", label: "Data da comunicação", owner: "QUALIDADE", optional: false, core: true },
  { order: 6, key: "documentos-analisados", label: "Documentos analisados", owner: "QUALIDADE", optional: false, core: true },
  { order: 7, key: "garantia-contratual", label: "Garantia contratual", owner: "JURIDICO", optional: false, core: false },
  { order: 8, key: "garantia-legal-potencial", label: "Garantia legal potencial", owner: "JURIDICO", optional: false, core: false },
  { order: 9, key: "vicio-oculto", label: "Eventual vício oculto", owner: "JURIDICO", optional: false, core: false },
  { order: 10, key: "prazo-reclamacao", label: "Prazo de reclamação", owner: "JURIDICO", optional: false, core: false },
  { order: 11, key: "prazo-decadencial", label: "Prazo decadencial, quando cabível", owner: "JURIDICO", optional: true, core: false },
  { order: 12, key: "prazo-prescricional", label: "Prazo prescricional, quando cabível", owner: "JURIDICO", optional: true, core: false },
  { order: 13, key: "responsabilidade-potencial", label: "Responsabilidade potencial", owner: "JURIDICO", optional: false, core: false },
  { order: 14, key: "exigencias-manutencao", label: "Exigências de manutenção e suas evidências", owner: "QUALIDADE", optional: false, core: false },
  { order: 15, key: "fundamentacao", label: "Fundamentação", owner: "JURIDICO", optional: false, core: false },
  { order: 16, key: "providencia-recomendada", label: "Providência recomendada", owner: "JURIDICO", optional: false, core: true },
];

export type WarrantyItemStatus = "PREENCHIDO" | "SEM_DADOS" | "NAO_APLICAVEL";

export interface WarrantyItemAssessment {
  key: string;
  status: WarrantyItemStatus;
  /** Conteúdo apresentado (data, descrição, conclusão parcial). */
  value: string | null;
  /** Fonte: documento/cláusula/e-mail. Obrigatória quando PREENCHIDO; justificativa quando NAO_APLICAVEL. */
  evidence: string | null;
}

/** Sinais estruturados (decididos pelo Jurídico/humano a partir dos itens) que alimentam a derivação determinística. */
export interface WarrantySignals {
  contractualWarranty: "VIGENTE" | "DECORRIDA" | "NAO_PREVISTA" | "NAO_INFORMADA";
  legalWarrantyPotential: "SIM" | "NAO" | "INDETERMINADO";
  hiddenDefect: "SIM" | "NAO" | "INDETERMINADO";
  /** Dentro do(s) prazo(s) de reclamação aplicável(is), segundo enquadramento fundamentado. */
  claimDeadline: "DENTRO" | "FORA" | "INDETERMINADO";
  maintenance: "COMPROVADA" | "NAO_COMPROVADA" | "NAO_EXIGIDA" | "SEM_DADOS";
  /** Há controvérsia jurídica relevante (regime aplicável, intertemporal, consumo × empresarial...)? */
  legalControversy: boolean;
}

export interface WarrantyCoverageDerivation {
  conclusion: CoverageConclusion;
  reasons: string[];
  missingCoreItems: string[];
  /** Controvérsia jurídica sempre vai ao responsável humano. */
  routeToHumanResponsible: boolean;
  requiresHumanReview: true;
  automaticExclusionByContractualExpiry: false;
  universalFiveYears: false;
}

export function validateWarrantyItems(items: WarrantyItemAssessment[]): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, WarrantyItemAssessment>();
  for (const item of items) {
    if (byKey.has(item.key)) problems.push(`item duplicado: ${item.key}`);
    byKey.set(item.key, item);
    const def = WARRANTY_COVERAGE_ITEMS.find((d) => d.key === item.key);
    if (!def) { problems.push(`item desconhecido: ${item.key}`); continue; }
    if (item.status === "PREENCHIDO" && (!(item.value ?? "").trim() || !(item.evidence ?? "").trim())) problems.push(`item ${item.key} PREENCHIDO sem valor/evidência`);
    if (item.status === "NAO_APLICAVEL" && (!def.optional || !(item.evidence ?? "").trim())) problems.push(`item ${item.key}: NAO_APLICAVEL só para itens 'quando cabível' e com justificativa`);
  }
  for (const def of WARRANTY_COVERAGE_ITEMS) if (!byKey.has(def.key)) problems.push(`item ausente: ${def.key}`);
  // Ordem apresentada = ordem do Bloco 5.3
  const order = items.map((i) => WARRANTY_COVERAGE_ITEMS.findIndex((d) => d.key === i.key));
  if (order.some((o, idx) => idx > 0 && o < order[idx - 1])) problems.push("itens fora da ordem 1–16");
  return problems;
}

/**
 * Derivação determinística. Prioridade:
 *  1. item fundamental ausente (1–6, 16) → INFORMAÇÕES INSUFICIENTES;
 *  2. controvérsia jurídica, qualquer sinal INDETERMINADO, manutenção não comprovada/sem dados, vício oculto SIM,
 *     garantia legal potencial SIM com garantia contratual decorrida → COBERTURA CONDICIONADA (humano decide);
 *  3. NÃO COBERTO só quando TODOS os sinais estão definidos: contratual decorrida/não prevista, legal NAO, vício oculto NAO,
 *     prazo FORA e fundamentação preenchida — nunca por mera expiração;
 *  4. (contratual VIGENTE ou garantia legal potencial SIM) + prazo DENTRO + manutenção comprovada/não exigida → POTENCIALMENTE COBERTO;
 *  5. demais → COBERTURA CONDICIONADA.
 */
export function deriveWarrantyCoverage(input: { items: WarrantyItemAssessment[]; signals: WarrantySignals }): WarrantyCoverageDerivation {
  const { signals } = input;
  const problems = validateWarrantyItems(input.items);
  const byKey = new Map(input.items.map((i) => [i.key, i]));
  const filled = (key: string) => byKey.get(key)?.status === "PREENCHIDO";
  const missingCoreItems = WARRANTY_COVERAGE_ITEMS.filter((d) => d.core && !filled(d.key)).map((d) => d.key);
  const base = { missingCoreItems, requiresHumanReview: true as const, automaticExclusionByContractualExpiry: false as const, universalFiveYears: false as const };
  const reasons: string[] = [];
  if (signals.contractualWarranty === "DECORRIDA") reasons.push("Garantia contratual decorrida: registrado, mas NÃO exclui automaticamente — garantia legal, vício oculto, solidez e segurança e prazos legais são analisados à parte.");

  if (problems.length > 0) return { ...base, conclusion: "INFORMAÇÕES INSUFICIENTES", reasons: [...reasons, ...problems.map((p) => `análise incompleta: ${p}`)], routeToHumanResponsible: signals.legalControversy };
  if (missingCoreItems.length > 0) return { ...base, conclusion: "INFORMAÇÕES INSUFICIENTES", reasons: [...reasons, `itens fundamentais sem dado: ${missingCoreItems.join(", ")}`], routeToHumanResponsible: signals.legalControversy };

  const conditional: string[] = [];
  if (signals.legalControversy) conditional.push("controvérsia jurídica relevante — decisão do responsável humano");
  if (signals.legalWarrantyPotential === "INDETERMINADO") conditional.push("garantia legal potencial indeterminada");
  if (signals.hiddenDefect === "INDETERMINADO") conditional.push("vício oculto indeterminado");
  if (signals.claimDeadline === "INDETERMINADO") conditional.push("prazo de reclamação não enquadrado com fundamento");
  if (signals.maintenance === "NAO_COMPROVADA") conditional.push("manutenção exigida sem comprovação");
  if (signals.maintenance === "SEM_DADOS") conditional.push("exigência de manutenção sem dados");
  if (signals.hiddenDefect === "SIM") conditional.push("vício oculto potencial — prazos e responsabilidade a confirmar");
  if (signals.contractualWarranty === "NAO_INFORMADA") conditional.push("garantia contratual não informada");
  if (conditional.length > 0) return { ...base, conclusion: "COBERTURA CONDICIONADA", reasons: [...reasons, ...conditional], routeToHumanResponsible: signals.legalControversy };

  const fullyDefinedNegative =
    (signals.contractualWarranty === "DECORRIDA" || signals.contractualWarranty === "NAO_PREVISTA") &&
    signals.legalWarrantyPotential === "NAO" && signals.hiddenDefect === "NAO" && signals.claimDeadline === "FORA" && filled("fundamentacao");
  if (fullyDefinedNegative) return { ...base, conclusion: "POTENCIALMENTE NÃO COBERTO", reasons: [...reasons, "Todos os regimes (contratual, legal, vício oculto, prazo) analisados e fundamentados como não alcançando o fato — não decorre só da expiração."], routeToHumanResponsible: false };

  // Regime potencialmente aplicável (garantia legal potencial OU contratual vigente) E prazo DENTRO. Garantia legal potencial com prazo FORA
  // não é "potencialmente coberto" (correção Fase 3/E: antes bastava legalWarrantyPotential = SIM, mesmo com o prazo de reclamação FORA).
  if (signals.claimDeadline === "DENTRO" && (signals.legalWarrantyPotential === "SIM" || signals.contractualWarranty === "VIGENTE")) {
    return { ...base, conclusion: "POTENCIALMENTE COBERTO", reasons: [...reasons, "Há regime potencialmente aplicável dentro do prazo, sem pendências; confirmação final é humana."], routeToHumanResponsible: false };
  }
  return { ...base, conclusion: "COBERTURA CONDICIONADA", reasons: [...reasons, "Combinação de sinais sem enquadramento conclusivo."], routeToHumanResponsible: signals.legalControversy };
}

export interface WarrantyCoverageOutput {
  items: WarrantyItemAssessment[];
  signals: WarrantySignals;
  conclusion: CoverageConclusion;
  requiresHumanReview: true;
}

/** Conferência da saída (lista de problemas; vazia = aceitável). */
export function validateWarrantyCoverageOutput(output: WarrantyCoverageOutput): string[] {
  const problems = [...validateWarrantyItems(output.items)];
  if (output.requiresHumanReview !== true) problems.push("requiresHumanReview deve ser true");
  if (!COVERAGE_CONCLUSIONS.includes(output.conclusion)) problems.push("conclusão fora das quatro permitidas");
  const derived = deriveWarrantyCoverage({ items: output.items, signals: output.signals });
  if (derived.conclusion !== output.conclusion) problems.push(`conclusão (${output.conclusion}) diverge da derivação determinística (${derived.conclusion})`);
  const text = output.items.map((i) => `${i.value ?? ""} ${i.evidence ?? ""}`).join("\n");
  for (const p of FIVE_YEARS_UNIVERSAL) if (p.test(text)) problems.push("aplica cinco anos universalmente");
  for (const p of AUTO_EXCLUSION_BY_EXPIRY) if (p.test(text)) problems.push("exclusão automática por expiração da garantia contratual");
  if (/\b(prazo|garantia)\b[^.\n]{0,40}\b(expirou|venceu|decorrid[ao])\b[^.\n]{0,40}\b(logo|portanto|assim)\b[^.\n]{0,40}\b(sem direito|n[ãa]o cabe|indevid)/i.test(text)) problems.push("exclusão automática por expiração da garantia contratual");
  if (output.signals.legalControversy && derived.routeToHumanResponsible !== true) problems.push("controvérsia jurídica deve ir ao responsável humano");
  return problems;
}

/** Itens 1–6 e 14 são montados pela Qualidade (fatos/datas) e entregues ao Jurídico, que conclui os demais. */
export function qualityOwnedItemKeys(): string[] {
  return WARRANTY_COVERAGE_ITEMS.filter((d) => d.owner === "QUALIDADE").map((d) => d.key);
}
