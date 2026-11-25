// Triagem ASSISTIDA do Analista IA de Qualidade para UMA foto ou UM e-mail (puro: sem rede, sem banco, sem IA real).
// Fluxo: monta o contexto (conteúdo externo SEMPRE embrulhado como DADO) -> provedor devolve QualityAssessmentOutput ->
// validateQualityAssessment (linguagem definitiva, medidas de foto, fato sem evidência etc.) -> só então vira evidência
// classificada como INFERÊNCIA, com revisão humana. Nunca diagnóstico estrutural definitivo; nunca altera a fonte original.
// O provedor aqui é uma interface: nos testes e no modo atual é o SIMULADO (determinístico). Provedor real = fase futura.

import { EXTERNAL_CONTENT_RULE, outputObeysInjection, wrapExternalContent, type InjectionSignal } from "../../security/external-content";
import {
  computeOverallCriticality,
  QUALITY_PILLARS,
  validateQualityAssessment,
  type PillarImpact,
  type QualityAssessmentOutput,
  type QualityEvidenceRef,
  type QualityEvidenceSource,
} from "./output-schema";

export type QualityTriageKind = "PHOTO" | "EMAIL";

export interface QualityTriageSource {
  kind: QualityTriageKind;
  /** Tipo da evidência no contrato do Analista (PHOTO/EMAIL). */
  sourceType: Extract<QualityEvidenceSource, "PHOTO" | "EMAIL">;
  sourceId: string;
  label: string;
  /** Texto descritivo da fonte (relato do registro, corpo do e-mail). Conteúdo EXTERNO: vira DADO no prompt. */
  text: string;
  locator: string | null;
}

export interface QualityTriageContext {
  /** Prompt completo para o provedor (instrução de papel + dado externo embrulhado). */
  prompt: string;
  signals: InjectionSignal[];
  evidenceRef: QualityEvidenceRef;
}

const TRIAGE_ROLE =
  "Você é o Analista IA de Qualidade em TRIAGEM ASSISTIDA. Produza: observação objetiva, hipóteses (linguagem condicional), " +
  "incertezas e necessidade de inspeção. Nunca emita diagnóstico estrutural definitivo, nunca prove conformidade, nunca estime medidas a partir de foto, " +
  "nunca classifique como NC comprovada. Toda saída exige revisão humana.";

export function buildQualityTriageContext(source: QualityTriageSource): QualityTriageContext {
  const wrapped = wrapExternalContent(source.label, source.text || "SEM DADOS: a fonte não traz texto descritivo.");
  const evidenceRef: QualityEvidenceRef = {
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    label: source.label.slice(0, 200),
    locator: source.locator,
  };
  const prompt = [TRIAGE_ROLE, EXTERNAL_CONTENT_RULE, `Tipo de fonte: ${source.kind}`, wrapped.text].join("\n\n");
  return { prompt, signals: wrapped.signals, evidenceRef };
}

export interface QualityTriageProvider {
  readonly id: string;
  /** Saída bruta (ainda NÃO validada). */
  triage(context: QualityTriageContext, source: QualityTriageSource): Promise<unknown>;
}

function emptyPillars(): PillarImpact[] {
  return QUALITY_PILLARS.map((pillar) => ({ pillar, level: "SEM_DADOS" as const, rationale: "", evidenceRefs: [], probability: null }));
}

/** Provedor SIMULADO: determinístico, conservador e sem inventar conteúdo (não lê a imagem; não cita medidas). */
export const simulatedQualityTriageProvider: QualityTriageProvider = {
  id: "simulated",
  async triage(context, source) {
    const ref = context.evidenceRef;
    const injected = context.signals.length > 0;
    const uncertainties = [
      "Triagem SIMULADA: a imagem/o texto não foram interpretados por modelo real.",
      "Sem inspeção presencial não é possível confirmar a existência, a extensão ou a causa de qualquer não conformidade.",
      ...(injected ? [`A fonte contém texto com aparência de instrução (${context.signals.map((s) => s.id).join(", ")}); tratado como dado suspeito, não obedecido.`] : []),
    ];
    const photoTriage =
      source.kind === "PHOTO"
        ? [
            {
              photo: ref,
              objectiveObservation: `Registro fotográfico/relato "${ref.label}" encaminhado à triagem; conteúdo visual não interpretado neste modo simulado.`,
              hypotheses: ["Pode haver uma não conformidade de execução associada a este registro; hipótese a confirmar em inspeção."],
              uncertainty: uncertainties,
              inspectionNeed: "SIM" as const,
              definitiveStructuralDiagnosis: false as const,
              provesConformityOrStrength: false as const,
            },
          ]
        : [];
    const pillarImpacts = emptyPillars();
    const output: QualityAssessmentOutput = {
      subject: `Triagem assistida: ${ref.label}`,
      statements: [
        { kind: "FATO", text: `A fonte "${ref.label}" foi registrada para triagem de Qualidade.`, evidenceRefs: [ref] },
        { kind: "INFERENCIA", text: "O registro pode indicar um desvio de qualidade, a confirmar por inspeção e por pessoa competente.", evidenceRefs: [ref] },
        { kind: "RECOMENDACAO", text: "Recomenda-se inspeção presencial e revisão humana antes de qualquer classificação adicional.", evidenceRefs: [ref] },
      ],
      uncertainties,
      missingInformation: ["Inspeção presencial", "Requisito técnico aplicável (projeto/norma/contrato)"],
      inspection: { need: "SIM", reason: "Uma foto ou um e-mail isolado não comprova conformidade nem não conformidade.", suggestedRole: null },
      pillarImpacts,
      overallCriticality: computeOverallCriticality(pillarImpacts),
      nonQualityCost: { status: "SEM_DADOS", amount: null, currency: null, source: null },
      photoTriage,
      requiresHumanReview: true,
    };
    return output;
  },
};

export type QualityTriageResult =
  | { ok: true; providerId: string; assessment: QualityAssessmentOutput; signals: InjectionSignal[]; summary: string }
  | { ok: false; providerId: string; problems: string[]; signals: InjectionSignal[] };

/** Resumo humano e rastreável do que será gravado como evidência (INFERÊNCIA). */
export function summarizeTriage(assessment: QualityAssessmentOutput, providerId: string): string {
  const lines: string[] = [`TRIAGEM ASSISTIDA (provedor: ${providerId}) — INFERÊNCIA, revisão humana obrigatória.`];
  for (const triage of assessment.photoTriage) {
    lines.push(`Observação: ${triage.objectiveObservation}`);
    for (const h of triage.hypotheses) lines.push(`Hipótese: ${h}`);
  }
  for (const s of assessment.statements) if (s.kind !== "FATO") lines.push(`${s.kind === "INFERENCIA" ? "Inferência" : "Recomendação"}: ${s.text}`);
  lines.push(`Incerteza: ${assessment.uncertainties.join(" | ")}`);
  lines.push(`Necessidade de inspeção: ${assessment.inspection.need} — ${assessment.inspection.reason}`);
  return lines.join("\n").slice(0, 3900);
}

export async function runQualityTriage(provider: QualityTriageProvider, source: QualityTriageSource): Promise<QualityTriageResult> {
  const context = buildQualityTriageContext(source);
  let raw: unknown;
  try {
    raw = await provider.triage(context, source);
  } catch {
    return { ok: false, providerId: provider.id, problems: ["Falha do provedor de triagem."], signals: context.signals };
  }
  if (!raw || typeof raw !== "object") return { ok: false, providerId: provider.id, problems: ["Saída do provedor ausente ou inválida."], signals: context.signals };
  const assessment = raw as QualityAssessmentOutput;
  const problems = validateQualityAssessment(assessment);
  if (outputObeysInjection(assessment as unknown as { requiresHumanReview?: unknown; text?: string })) {
    problems.push("saída obedeceu a instrução embutida na fonte externa");
  }
  if (source.kind === "PHOTO" && assessment.photoTriage.length === 0) problems.push("triagem de foto sem photoTriage");
  if (problems.length > 0) return { ok: false, providerId: provider.id, problems, signals: context.signals };
  return { ok: true, providerId: provider.id, assessment, signals: context.signals, summary: summarizeTriage(assessment, provider.id) };
}

/** Linha de quality_evidence da triagem: SEMPRE INFERENCIA + SUSPEITA; ref distinta da fonte humana (não colide no índice único). */
export function buildTriageEvidenceRow(input: {
  projectId: string;
  ncrId: string;
  userId: string;
  evidenceSourceType: string;
  sourceTable: string | null;
  originRef: string;
  originUrl: string | null;
  result: Extract<QualityTriageResult, { ok: true }>;
}) {
  return {
    project_id: input.projectId,
    ncr_id: input.ncrId,
    source_type: input.evidenceSourceType,
    source_table: input.sourceTable,
    source_ref: `${input.originRef}#triagem-assistida`,
    source_url: input.originUrl,
    description: input.result.summary,
    classification: "SUSPEITA" as const,
    epistemic: "INFERENCIA" as const,
    created_by: input.userId,
  };
}

/**
 * Resolve o provedor de triagem. Nesta fase SÓ existe o provedor SIMULADO e ele fica desligado por padrão (fail-closed):
 * é ligado explicitamente por ACC_QUALITY_TRIAGE_PROVIDER=simulated (ambiente de homologação). Nunca chama IA real.
 */
export function resolveQualityTriageProvider(env: Record<string, string | undefined> = process.env): QualityTriageProvider | null {
  return env.ACC_QUALITY_TRIAGE_PROVIDER === "simulated" ? simulatedQualityTriageProvider : null;
}
