// Contrato de saída do Analista IA de Qualidade (fase 1 — puro, sem I/O, sem IA).
// Cobre: fato × inferência × recomendação com evidências, incerteza, necessidade de inspeção, impacto
// nos quatro pilares (PIOR PILAR domina — nunca média), custo de não qualidade só com valor documentado e
// TRIAGEM FOTOGRÁFICA assistida (observação objetiva, hipótese, incerteza, necessidade de inspeção).
// A validação devolve problemas; nunca corrige em silêncio nem decide nada pelo humano.

export type QualityEvidenceSource = "DOCUMENT" | "CLAUSE" | "EVENT" | "EMAIL" | "PHOTO" | "DIARIO_OBRA" | "FISCALIZACAO" | "RNC" | "LABORATORIO" | "OTHER";

export interface QualityEvidenceRef {
  sourceType: QualityEvidenceSource;
  sourceId: string;
  label: string;
  locator: string | null;
}

export type QualityStatementKind = "FATO" | "INFERENCIA" | "RECOMENDACAO";

export interface QualityStatement {
  kind: QualityStatementKind;
  text: string;
  evidenceRefs: QualityEvidenceRef[];
}

export type InspectionNeed = "SIM" | "NAO" | "INDETERMINADA";

export const QUALITY_PILLARS = ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"] as const;
export type QualityPillar = (typeof QUALITY_PILLARS)[number];

export type PillarLevel = "SEM_DADOS" | "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
const LEVEL_ORDER: Record<PillarLevel, number> = { SEM_DADOS: 0, BAIXO: 1, MEDIO: 2, ALTO: 3, CRITICO: 4 };

export interface PillarImpact {
  pillar: QualityPillar;
  level: PillarLevel;
  rationale: string;
  evidenceRefs: QualityEvidenceRef[];
  /** Probabilidade só quando fundamentável; null caso contrário. Nunca inventada. */
  probability: number | null;
}

export interface PhotoTriage {
  photo: QualityEvidenceRef;
  objectiveObservation: string;
  hypotheses: string[];
  uncertainty: string[];
  inspectionNeed: InspectionNeed;
  /** Travados: a triagem nunca emite diagnóstico estrutural definitivo nem prova conformidade. */
  definitiveStructuralDiagnosis: false;
  provesConformityOrStrength: false;
}

export interface QualityAssessmentOutput {
  subject: string;
  statements: QualityStatement[];
  uncertainties: string[];
  missingInformation: string[];
  inspection: { need: InspectionNeed; reason: string; suggestedRole: string | null };
  pillarImpacts: PillarImpact[];
  /** Calculada por computeOverallCriticality — se vier divergente, é rejeitada. */
  overallCriticality: PillarLevel;
  nonQualityCost: { status: "DOCUMENTADO" | "SEM_DADOS"; amount: number | null; currency: string | null; source: QualityEvidenceRef | null };
  photoTriage: PhotoTriage[];
  requiresHumanReview: true;
}

/** Regra "pior pilar domina": a criticidade é o MAIOR nível entre os pilares com dado — nunca a média. */
export function computeOverallCriticality(impacts: readonly PillarImpact[]): PillarLevel {
  let worst: PillarLevel = "SEM_DADOS";
  for (const impact of impacts) if (LEVEL_ORDER[impact.level] > LEVEL_ORDER[worst]) worst = impact.level;
  return worst;
}

// Linguagem proibida: diagnóstico/conclusão definitiva sobre foto ou estrutura.
const DEFINITIVE_PATTERNS: readonly RegExp[] = [
  /\b(n[ãa]o h[áa]|sem|inexiste|descartad[oa]) (qualquer )?risco estrutural\b/i,
  /\b(estruturalmente|estrutura) (est[áa] )?(segur[oa]|est[áa]vel|[ií]ntegr[oa]|aprovad[oa])\b/i,
  /\b(a )?(foto|imagem|fotografia) (comprova|prova|confirma|atesta|demonstra) (a )?(conformidade|resist[êe]ncia|integridade|seguran[çc]a|qualidade|estanqueidade)\b/i,
  /\bdiagn[óo]stico (estrutural )?(definitivo|final|conclusivo)\b/i,
  /\b(resist[êe]ncia|capacidade portante) (adequada|suficiente|garantida|comprovada)\b/i,
  /\b(colapso|ru[ií]na) (iminente|certo|inevit[áa]vel)\b/i,
  /\bobra (est[áa] )?(conforme|aprovada)\b/i,
];

// Medidas inventadas a partir de foto (abertura de fissura, profundidade, etc.).
const PHOTO_MEASURE =
  /\b(\d+([.,]\d+)?)\s?(mm|cm|m)\b[^.\n]{0,25}\b(fissura|trinca|abertura|profundidade|espessura|recalque)|\b(fissura|trinca|abertura|profundidade|espessura|recalque)\b[^.\n]{0,30}\b(\d+([.,]\d+)?)\s?(mm|cm|m)\b/i;

export function findDefinitiveLanguage(text: string): string[] {
  const hits = DEFINITIVE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source.slice(0, 60));
  return hits;
}

const HEDGE = /\b(pode|poderia|sugere|sugerem|indica|indicam|compat[ií]vel|prov[áa]vel|hip[óo]tese|possivelmente|talvez|a confirmar|ao que parece)\b/i;

/** Validação (lista de problemas; vazia = aceitável). */
export function validateQualityAssessment(output: QualityAssessmentOutput): string[] {
  const problems: string[] = [];
  if (output.requiresHumanReview !== true) problems.push("requiresHumanReview deve ser true");
  if (!output.subject?.trim()) problems.push("assunto obrigatório");
  if (!["SIM", "NAO", "INDETERMINADA"].includes(output.inspection?.need)) problems.push("necessidade de inspeção obrigatória (SIM/NAO/INDETERMINADA)");
  if (!output.inspection?.reason?.trim()) problems.push("motivo da necessidade de inspeção obrigatório");
  if (!Array.isArray(output.uncertainties)) problems.push("incertezas devem ser informadas (pode ser vazio)");

  for (const [index, statement] of (output.statements ?? []).entries()) {
    if (statement.kind === "FATO" && (statement.evidenceRefs ?? []).length === 0) problems.push(`statements[${index}]: FATO sem evidência`);
    if (statement.kind === "INFERENCIA" && !HEDGE.test(statement.text)) problems.push(`statements[${index}]: INFERENCIA sem linguagem condicional`);
    for (const hit of findDefinitiveLanguage(statement.text)) problems.push(`statements[${index}]: linguagem definitiva proibida (${hit})`);
  }

  const seen = new Set<string>();
  for (const impact of output.pillarImpacts ?? []) {
    if (seen.has(impact.pillar)) problems.push(`pilar duplicado: ${impact.pillar}`);
    seen.add(impact.pillar);
    if (impact.level !== "SEM_DADOS" && (impact.evidenceRefs ?? []).length === 0 && !impact.rationale?.trim()) problems.push(`pilar ${impact.pillar} com nível sem justificativa/evidência`);
    if (impact.probability !== null && !(impact.probability >= 0 && impact.probability <= 1)) problems.push(`pilar ${impact.pillar}: probabilidade fora de 0..1`);
    if (impact.probability !== null && (impact.evidenceRefs ?? []).length === 0) problems.push(`pilar ${impact.pillar}: probabilidade sem evidência`);
  }
  for (const pillar of QUALITY_PILLARS) if (!seen.has(pillar)) problems.push(`pilar ausente: ${pillar} (use SEM_DADOS)`);
  const expected = computeOverallCriticality(output.pillarImpacts ?? []);
  if (output.overallCriticality !== expected) problems.push(`criticidade geral (${output.overallCriticality}) diverge da regra do pior pilar (${expected})`);

  const cost = output.nonQualityCost;
  if (!cost || (cost.status === "DOCUMENTADO" && (cost.amount === null || !cost.source))) problems.push("custo de não qualidade documentado exige valor e fonte");
  if (cost && cost.status === "SEM_DADOS" && cost.amount !== null) problems.push("custo de não qualidade SEM_DADOS não pode ter valor");

  for (const [index, triage] of (output.photoTriage ?? []).entries()) {
    const label = `photoTriage[${index}]`;
    if (triage.photo?.sourceType !== "PHOTO") problems.push(`${label}: evidência deve ser do tipo PHOTO`);
    if (!triage.objectiveObservation?.trim()) problems.push(`${label}: observação objetiva obrigatória`);
    if (!(triage.uncertainty ?? []).length) problems.push(`${label}: incerteza obrigatória`);
    if (!["SIM", "INDETERMINADA"].includes(triage.inspectionNeed)) problems.push(`${label}: foto sozinha nunca dispensa inspeção (SIM ou INDETERMINADA)`);
    if (triage.definitiveStructuralDiagnosis !== false || triage.provesConformityOrStrength !== false) problems.push(`${label}: diagnóstico definitivo/prova de conformidade proibidos`);
    const joined = [triage.objectiveObservation, ...(triage.hypotheses ?? []), ...(triage.uncertainty ?? [])].join("\n");
    for (const hit of findDefinitiveLanguage(joined)) problems.push(`${label}: linguagem definitiva proibida (${hit})`);
    if (PHOTO_MEASURE.test(joined)) problems.push(`${label}: medida estimada a partir de foto não é permitida`);
    for (const [hIndex, hypothesis] of (triage.hypotheses ?? []).entries()) if (!HEDGE.test(hypothesis)) problems.push(`${label}.hypotheses[${hIndex}]: hipótese sem linguagem condicional`);
  }
  return problems;
}

/** Colaboração: quem recebe o quê (dados, não chamada). Fonte usada pelos testes de regras de colaboração. */
export const QUALITY_COLLABORATION_RULES = [
  { with: "engineering-director", role: "AVALIACAO_TECNICA_PRELIMINAR" },
  { with: "legal-consultant", role: "CONTRATO_GARANTIA_SEGURO_COBERTURA" },
  { with: "planning-director", role: "EFEITO_EM_PRAZO" },
  { with: "commercial-director", role: "EFEITO_EM_CUSTO_MEDICAO_RETENCAO" },
  { with: "esg-director", role: "SSMA_RISCO_A_PESSOAS_E_AMBIENTE" },
  { with: "ceo", role: "CONSOLIDA_QUATRO_PILARES_PRAZO_CUSTO_SEGURANCA_QUALIDADE" },
] as const;
