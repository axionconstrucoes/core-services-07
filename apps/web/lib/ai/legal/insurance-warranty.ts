// Contrato de SAÍDA ESTRUTURADA da competência SEGUROS, GARANTIAS, ENDOSSOS E SINISTROS do Consultor
// Jurídico IA (fase 1: puro, sem I/O, sem IA). Tudo aqui é conferência DETERMINÍSTICA de uma análise já
// produzida (por humano ou por provedor): nada reconhece cobertura em nome de seguradora.
//
// NOTA SOBRE OS 16 ITENS: o texto do "Bloco 5.3" do briefing original NÃO foi disponibilizado ao agente de
// implementação. Os 16 itens abaixo são uma proposta de trabalho (coerente com a prática de análise de
// cobertura) a ser CONCILIADA com o Bloco 5.3 antes da fase 2. Os identificadores são estáveis.

export type InsuranceInstrumentType =
  | "GARANTIA_LEGAL"
  | "GARANTIA_CONTRATUAL"
  | "SEGURO_GARANTIA_PERFORMANCE_BOND"
  | "SEGURO_GARANTIA_ADIANTAMENTO"
  | "SEGURO_GARANTIA_RETENCAO"
  | "SEGURO_GARANTIA_POS_ENTREGA"
  | "SEGURO_RISCOS_ENGENHARIA"
  | "SEGURO_RC_GERAL"
  | "SEGURO_RC_CRUZADA"
  | "SEGURO_RC_PROFISSIONAL"
  | "SEGURO_MAQUINAS_EQUIPAMENTOS"
  | "FIANCA_BANCARIA"
  | "CAUCAO"
  | "ENDOSSO";

/** Natureza jurídica — garantia legal, seguro-garantia, RC e fiança NÃO são a mesma coisa. */
export type InstrumentNature = "GARANTIA_LEGAL" | "GARANTIA_CONTRATUAL" | "SEGURO_GARANTIA" | "SEGURO_RC" | "SEGURO_PATRIMONIAL_OU_RISCOS" | "FIANCA" | "CAUCAO" | "ENDOSSO_DE_APOLICE";

export const INSTRUMENT_NATURE: Readonly<Record<InsuranceInstrumentType, InstrumentNature>> = {
  GARANTIA_LEGAL: "GARANTIA_LEGAL",
  GARANTIA_CONTRATUAL: "GARANTIA_CONTRATUAL",
  SEGURO_GARANTIA_PERFORMANCE_BOND: "SEGURO_GARANTIA",
  SEGURO_GARANTIA_ADIANTAMENTO: "SEGURO_GARANTIA",
  SEGURO_GARANTIA_RETENCAO: "SEGURO_GARANTIA",
  SEGURO_GARANTIA_POS_ENTREGA: "SEGURO_GARANTIA",
  SEGURO_RISCOS_ENGENHARIA: "SEGURO_PATRIMONIAL_OU_RISCOS",
  SEGURO_RC_GERAL: "SEGURO_RC",
  SEGURO_RC_CRUZADA: "SEGURO_RC",
  SEGURO_RC_PROFISSIONAL: "SEGURO_RC",
  SEGURO_MAQUINAS_EQUIPAMENTOS: "SEGURO_PATRIMONIAL_OU_RISCOS",
  FIANCA_BANCARIA: "FIANCA",
  CAUCAO: "CAUCAO",
  ENDOSSO: "ENDOSSO_DE_APOLICE",
};

export const COVERAGE_CONCLUSIONS = [
  "POTENCIALMENTE COBERTO",
  "POTENCIALMENTE NÃO COBERTO",
  "COBERTURA CONDICIONADA",
  "INFORMAÇÕES INSUFICIENTES",
] as const;
export type CoverageConclusion = (typeof COVERAGE_CONCLUSIONS)[number];

/** Estado de cada item: nunca "atendido" sem evidência. */
export type CoverageItemStatus = "ATENDIDO" | "NAO_ATENDIDO" | "CONDICIONADO" | "NAO_VERIFICADO" | "SEM_DADOS";

export interface CoverageItemDefinition {
  key: string;
  label: string;
  /** Núcleo: sem este item verificado não há conclusão além de INFORMAÇÕES INSUFICIENTES. */
  core: boolean;
  /** Item cujo NAO_ATENDIDO sustenta POTENCIALMENTE NÃO COBERTO. */
  excludingWhenNotMet: boolean;
}

export const COVERAGE_ITEMS: readonly CoverageItemDefinition[] = [ // itens de COBERTURA DA APÓLICE (sinistro); a garantia pós-entrega usa WARRANTY_COVERAGE_ITEMS (warranty-coverage.ts)
  { key: "instrumento-identificado", label: "Instrumento/apólice/garantia identificado (tipo, número, emissor)", core: true, excludingWhenNotMet: false },
  { key: "segurado-beneficiario", label: "Segurado, tomador e beneficiário correspondem às partes do contrato", core: true, excludingWhenNotMet: true },
  { key: "vigencia-instrumento", label: "Vigência da APÓLICE/instrumento na data do evento ou do aviso (não confundir com o prazo de garantia contratual)", core: true, excludingWhenNotMet: true },
  { key: "objeto-risco-coberto", label: "Objeto e risco descritos na apólice/cláusula alcançam o evento", core: true, excludingWhenNotMet: true },
  { key: "evento-caracterizado", label: "Evento/defeito documentado (fato, data de ocorrência e data de ciência)", core: true, excludingWhenNotMet: false },
  { key: "local-escopo", label: "Local e escopo da obra/serviço abrangidos", core: false, excludingWhenNotMet: true },
  { key: "exclusoes", label: "Exclusões e riscos não cobertos aplicáveis ao evento", core: false, excludingWhenNotMet: true },
  { key: "limites-sublimites", label: "Limite máximo, importância segurada e sublimites", core: false, excludingWhenNotMet: false },
  { key: "franquia-participacao", label: "Franquia/participação obrigatória do segurado", core: false, excludingWhenNotMet: false },
  { key: "endossos-condicoes", label: "Condições particulares e endossos VÁLIDOS (emitidos e conferidos; pedido de endosso não é endosso emitido)", core: false, excludingWhenNotMet: false },
  { key: "obrigacoes-segurado", label: "Obrigações do segurado (manutenção comprovada, uso adequado, salvamento/mitigação)", core: false, excludingWhenNotMet: false },
  { key: "aviso-prazo", label: "Aviso de sinistro/reclamação no prazo e pelo canal oficial", core: false, excludingWhenNotMet: false },
  { key: "nexo-causal", label: "Nexo entre o evento e o objeto garantido (causa comprovada, não só hipótese)", core: false, excludingWhenNotMet: false },
  { key: "natureza-prazos-legais", label: "Natureza do instrumento e prazos legais distinguidos (garantia legal × seguro-garantia × RC × fiança; solidez e segurança × vício aparente × vício oculto × decadência × prescrição × indenização)", core: false, excludingWhenNotMet: false },
  { key: "documentacao-comprobatoria", label: "Documentação comprobatória (laudo, fotos, RNC, comprovantes de manutenção, notificações)", core: false, excludingWhenNotMet: false },
  { key: "situacao-seguradora", label: "Situação perante a seguradora (aviso, regulação, negativa, indenização) e dados faltantes", core: false, excludingWhenNotMet: false },
];

/** Nome explícito dos 16 itens de cobertura da APÓLICE (mesma lista de COVERAGE_ITEMS; nada quebra). */
export const INSURANCE_COVERAGE_ITEMS = COVERAGE_ITEMS;

export interface CoverageItemAssessment {
  key: string;
  status: CoverageItemStatus;
  /** Evidência/fonte do item: documento, cláusula, e-mail... Obrigatória quando status != SEM_DADOS/NAO_VERIFICADO. */
  evidence: string | null;
  note?: string | null;
}

export interface CoverageDerivationInput {
  items: CoverageItemAssessment[];
  /**
   * Prazo de garantia CONTRATUAL já decorrido? Informação registrada, mas NUNCA causa exclusão automática:
   * garantia legal, responsabilidade por solidez e segurança e a apólice podem subsistir.
   */
  contractualWarrantyExpired?: boolean | null;
}

export interface CoverageDerivation {
  conclusion: CoverageConclusion;
  reasons: string[];
  missingCoreItems: string[];
  /** Sempre true: nenhuma conclusão dispensa revisão jurídica humana. */
  requiresHumanReview: true;
  /** Sempre false: o ACC/IA nunca reconhece cobertura em nome da seguradora. */
  recognizesCoverageOnBehalfOfInsurer: false;
}

const NEEDS_EVIDENCE: CoverageItemStatus[] = ["ATENDIDO", "NAO_ATENDIDO", "CONDICIONADO"];

/** Validação do conjunto de 16 itens (todos presentes, sem duplicata, evidência quando afirma). */
export function validateCoverageItems(items: CoverageItemAssessment[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const item of items) {
    if (keys.has(item.key)) problems.push(`item duplicado: ${item.key}`);
    keys.add(item.key);
    if (!COVERAGE_ITEMS.some((definition) => definition.key === item.key)) problems.push(`item desconhecido: ${item.key}`);
    if (NEEDS_EVIDENCE.includes(item.status) && !(item.evidence ?? "").trim()) problems.push(`item ${item.key} com status ${item.status} sem evidência`);
  }
  for (const definition of COVERAGE_ITEMS) if (!keys.has(definition.key)) problems.push(`item ausente: ${definition.key}`);
  return problems;
}

/**
 * Regras determinísticas (a IA propõe os itens; a conclusão é derivada, nunca livre):
 *  1. item NÚCLEO sem dado/verificação → INFORMAÇÕES INSUFICIENTES;
 *  2. item excludente NÃO ATENDIDO (com evidência) → POTENCIALMENTE NÃO COBERTO;
 *  3. item condicionado, pendente de verificação, ou aviso/obrigação/endosso não conferidos → COBERTURA CONDICIONADA;
 *  4. todos os núcleos atendidos e nenhum impedimento → POTENCIALMENTE COBERTO (nunca "coberto").
 * A expiração do prazo de garantia contratual NÃO é critério de exclusão.
 */
export function deriveCoverageConclusion(input: CoverageDerivationInput): CoverageDerivation {
  const problems = validateCoverageItems(input.items);
  const reasons: string[] = [];
  const byKey = new Map(input.items.map((item) => [item.key, item]));
  const missingCoreItems: string[] = [];

  for (const definition of COVERAGE_ITEMS) {
    const item = byKey.get(definition.key);
    if (definition.core && (!item || item.status === "SEM_DADOS" || item.status === "NAO_VERIFICADO")) missingCoreItems.push(definition.key);
  }

  const base = { requiresHumanReview: true as const, recognizesCoverageOnBehalfOfInsurer: false as const, missingCoreItems };
  if (input.contractualWarrantyExpired) {
    reasons.push(
      "Prazo de garantia contratual decorrido: registrado, mas NÃO exclui automaticamente — garantia legal, solidez e segurança, vício oculto e a vigência da apólice são analisados à parte."
    );
  }
  if (problems.length > 0) {
    return { ...base, conclusion: "INFORMAÇÕES INSUFICIENTES", reasons: [...reasons, ...problems.map((problem) => `análise incompleta: ${problem}`)] };
  }
  if (missingCoreItems.length > 0) {
    return { ...base, conclusion: "INFORMAÇÕES INSUFICIENTES", reasons: [...reasons, `itens essenciais sem dado ou sem verificação: ${missingCoreItems.join(", ")}`] };
  }
  const excluding = COVERAGE_ITEMS.filter((definition) => definition.excludingWhenNotMet && byKey.get(definition.key)?.status === "NAO_ATENDIDO");
  if (excluding.length > 0) {
    return { ...base, conclusion: "POTENCIALMENTE NÃO COBERTO", reasons: [...reasons, ...excluding.map((definition) => `não atendido: ${definition.label}`)] };
  }
  const conditional = input.items.filter((item) => item.status === "CONDICIONADO" || item.status === "NAO_VERIFICADO" || item.status === "SEM_DADOS" || item.status === "NAO_ATENDIDO");
  if (conditional.length > 0) {
    return { ...base, conclusion: "COBERTURA CONDICIONADA", reasons: [...reasons, ...conditional.map((item) => `pendente/condicionado: ${item.key} (${item.status})`)] };
  }
  return { ...base, conclusion: "POTENCIALMENTE COBERTO", reasons: [...reasons, "Todos os itens atendidos com evidência; confirmação exclusiva da seguradora/regulação."] };
}

// ------------------------------------------------------------------ saída estruturada da análise

export interface InsuranceWarrantyOutput {
  originDocument: { documentId: string | null; title: string | null };
  /** Versão e data do documento de origem; null quando desconhecidas ("SEM DADOS"). */
  documentVersion: string | null;
  documentDate: string | null;
  provision: { clause: string | null; excerpt: string | null };
  instrumentType: InsuranceInstrumentType | null;
  knownFacts: string[];
  hypotheses: string[];
  missingData: string[];
  limitations: string[];
  nextStep: string;
  coverage: { conclusion: CoverageConclusion; items: CoverageItemAssessment[] } | null;
  requiresHumanReview: true;
}

export const FORBIDDEN_COVERAGE_RECOGNITION = [
  /\ba seguradora (reconhece|reconheceu|aceitou|aprovou|vai pagar|pagará)\b/i,
  /\b(sinistro|cobertura) (est[áa] )?(aceit[oa]|aprovad[oa]|reconhecid[oa]|garantid[oa])\b/i,
  /\bcobertura garantida\b/i,
  /\bindeniza[çc][ãa]o (garantida|assegurada)\b/i,
  /\bdireito (l[ií]quido e certo )?(à|a) indeniza[çc][ãa]o\b/i,
];
export const FIVE_YEARS_UNIVERSAL = [
  /\btodo (e qualquer )?(defeito|v[ií]cio)[^.]{0,80}\b(5|cinco) anos\b/i,
  /\b(sempre|em qualquer caso|universalmente)[^.]{0,60}\b(5|cinco) anos\b/i,
  // ordem inversa ("prazo de cinco anos para todo e qualquer defeito"): mesma presunção proibida, antes não detectada (Fase 3/E)
  /\b(5|cinco) anos\b[^.]{0,80}\b(para|a|em) (todo|qualquer|toda)( e qualquer)? (defeito|v[ií]cio|caso)\b/i,
];
export const AUTO_EXCLUSION_BY_EXPIRY = [
  /\bgarantia (contratual )?(expirou|venceu|encerrada|expirada)[^.]{0,80}\b(portanto|logo|assim)[^.]{0,60}(n[ãa]o (h[áa]|existe)|exclu[ií]d|sem) (cobertura|direito|responsabilidade)/i,
  /\bpor ter (expirado|vencido) a garantia[^.]{0,60}(n[ãa]o (h[áa]|existe)|exclu[ií]d)/i,
];
const INVENTED_CHANNEL = /\b(0800[\s\d-]{6,}|\(?\d{2}\)?\s?9?\d{4}-?\d{4})\b|\bhttps?:\/\/\S+/i;

/** Conferência da saída: devolve a lista de problemas (vazia = aceitável). Nunca "corrige" em silêncio. */
export function validateInsuranceWarrantyOutput(output: InsuranceWarrantyOutput, options: { registeredChannels?: readonly string[] } = {}): string[] {
  const problems: string[] = [];
  if (output.requiresHumanReview !== true) problems.push("requiresHumanReview deve ser true");
  if (!output.nextStep?.trim()) problems.push("próxima providência obrigatória");
  if (!Array.isArray(output.limitations) || output.limitations.length === 0) problems.push("limitações obrigatórias");
  if (!Array.isArray(output.missingData)) problems.push("dados faltantes devem ser listados (pode ser vazio)");
  if (!output.originDocument?.documentId && !output.originDocument?.title) problems.push("documento de origem obrigatório (ou 'SEM DADOS' explícito em missingData)");
  const allText = [...output.knownFacts, ...output.hypotheses, output.nextStep, ...output.limitations].join("\n");
  for (const pattern of FORBIDDEN_COVERAGE_RECOGNITION) if (pattern.test(allText)) problems.push("reconhece cobertura em nome da seguradora");
  for (const pattern of FIVE_YEARS_UNIVERSAL) if (pattern.test(allText)) problems.push("aplica 5 anos universalmente");
  for (const pattern of AUTO_EXCLUSION_BY_EXPIRY) if (pattern.test(allText)) problems.push("exclusão automática por expiração da garantia contratual");
  const channelMatch = allText.match(INVENTED_CHANNEL);
  const channelText = channelMatch ? channelMatch[0].replace(/[.,;:)]+$/, "") : null;
  if (channelText && !(options.registeredChannels ?? []).some((channel) => channel.includes(channelText))) {
    problems.push(`canal não registrado/inventado: ${channelText}`);
  }
  if (output.coverage) {
    if (!COVERAGE_CONCLUSIONS.includes(output.coverage.conclusion)) problems.push("conclusão de cobertura fora das quatro permitidas");
    const derived = deriveCoverageConclusion({ items: output.coverage.items });
    if (derived.conclusion !== output.coverage.conclusion) problems.push(`conclusão (${output.coverage.conclusion}) diverge da derivação determinística (${derived.conclusion})`);
  }
  return problems;
}

// ------------------------------------------------------------------ prazos e institutos (distinção obrigatória)

export type LimitationInstitute = "SOLIDEZ_E_SEGURANCA" | "VICIO_APARENTE" | "VICIO_OCULTO" | "DECADENCIA" | "PRESCRICAO" | "INDENIZACAO";

export const LIMITATION_INSTITUTES: Readonly<Record<LimitationInstitute, string>> = {
  SOLIDEZ_E_SEGURANCA: "Responsabilidade por solidez e segurança (empreitada de edifício/construção considerável): regime e prazo legais próprios; depende do enquadramento do contrato.",
  VICIO_APARENTE: "Vício perceptível na entrega/recebimento: reclamação condicionada ao regime aplicável (contrato, CC ou CDC) e ao momento do aceite.",
  VICIO_OCULTO: "Vício não detectável na entrega: o marco costuma ser o conhecimento/aparecimento do vício; confirmar o regime aplicável.",
  DECADENCIA: "Perda do DIREITO potestativo por não exercício no prazo; distinta da prescrição.",
  PRESCRICAO: "Perda da PRETENSÃO por não exercício no prazo; pode haver causas de suspensão/interrupção a verificar.",
  INDENIZACAO: "Reparação de danos: pressupostos e prazos próprios, distintos do prazo de garantia contratual.",
};

/** Regra explícita: não existe prazo universal. Sem enquadramento fundamentado, o resultado é INDETERMINADO. */
export function classifyLimitationRegime(input: { contractFramed: boolean | null; instituteFramed: LimitationInstitute | null }): "ENQUADRADO" | "INDETERMINADO" {
  return input.contractFramed === true && input.instituteFramed !== null ? "ENQUADRADO" : "INDETERMINADO";
}

// ------------------------------------------------------------------ preparação de acionamento (minutas apenas)

export type ClaimPreparationStep = "AVISO_DE_SINISTRO" | "RECLAMACAO" | "REGULACAO" | "INDENIZACAO" | "RESPOSTA_A_NEGATIVA";

export interface ClaimPreparation {
  step: ClaimPreparationStep;
  /** Estado travado: só minuta. Envio real exige trava fail-closed + aprovação humana expressa (fora desta fase). */
  status: "DRAFT_PENDING_REVIEW";
  /** Canal oficial REGISTRADO (apólice/ACC); null → "CANAL OFICIAL NÃO REGISTRADO" — nunca inventado. */
  officialChannel: string | null;
  channelNote: string;
  missingData: string[];
  requiresHumanApproval: true;
  realSendAllowed: false;
}

export const CHANNEL_NOT_REGISTERED_NOTE = "CANAL OFICIAL NÃO REGISTRADO — localizar na apólice ou no site oficial da seguradora/SUSEP; nenhum canal foi inventado.";

export function prepareClaimDraft(input: { step: ClaimPreparationStep; officialChannel?: string | null; missingData?: string[] }): ClaimPreparation {
  const channel = (input.officialChannel ?? "").trim() || null;
  return {
    step: input.step,
    status: "DRAFT_PENDING_REVIEW",
    officialChannel: channel,
    channelNote: channel ? "Canal registrado — conferir com a apólice antes de qualquer uso." : CHANNEL_NOT_REGISTERED_NOTE,
    missingData: input.missingData ?? [],
    requiresHumanApproval: true,
    realSendAllowed: false,
  };
}
