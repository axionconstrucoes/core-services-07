// Avaliação de cobertura: NUNCA automática. Produz uma INFERÊNCIA rastreável com uma das quatro conclusões
// (POTENCIALMENTE_COBERTO / NAO_COBERTO / CONDICIONADO / INFORMACOES_INSUFICIENTES) e sempre exige revisão humana.
// Princípios: cobertura só com evidência de cláusula COM FONTE; exclusão com fonte prevalece; endosso só vale se
// CONFERIDO; RC (geral/cruzada/profissional) NUNCA presume cobertura de defeito de execução nem de dano à própria obra.
import type { ClaimKind, ClauseEvidence, CoverageConclusion, EndorsementSummary, Epistemic, PolicyModality } from "./types";
import { endorsementExtendsCoverage } from "./endorsement-rules";
import type { NoticeDeadline } from "./claim-stages";

export interface CoverageInput {
  modality: PolicyModality | null;
  claimKind: ClaimKind;
  /** ISO yyyy-mm-dd */
  eventDate?: string | null;
  policy: { coverageStart?: string | null; coverageEnd?: string | null } | null;
  clauses: ClauseEvidence[];
  endorsements?: EndorsementSummary[];
  /** Endossos em que o argumento de cobertura se apoia. */
  reliesOnEndorsementIds?: string[];
  noticeDeadline?: NoticeDeadline | null;
}

export interface CoverageReason {
  code: string;
  epistemic: Epistemic;
  text: string;
  clauseId?: string;
}

export interface CoverageAssessment {
  conclusion: CoverageConclusion;
  automatic: false;
  requiresHumanReview: true;
  epistemic: "INFERENCIA";
  reasons: CoverageReason[];
  evidence: ClauseEvidence[];
  missing: string[];
  recommendations: string[];
}

const RC_MODALITIES: PolicyModality[] = ["RC_GERAL", "RC_CRUZADA", "RC_PROFISSIONAL"];
/** Tipos de evento que RC NÃO pode presumir cobertos. */
export const RC_NEVER_PRESUMED_KINDS: ClaimKind[] = ["DANO_PROPRIA_OBRA", "INADIMPLEMENTO", "ATRASO", "DEFEITO_POS_ENTREGA"];

const hasSource = (c: ClauseEvidence) => Boolean(c.source?.documentId || (c.source?.ref && c.source.ref.trim()));
const applies = (c: ClauseEvidence, kind: ClaimKind) => c.appliesTo.includes(kind);

export function assessCoverage(input: CoverageInput): CoverageAssessment {
  const reasons: CoverageReason[] = [];
  const missing: string[] = [];
  const recommendations: string[] = ["Submeter a conclusão a revisão humana (jurídico/seguros) antes de qualquer comunicação."];
  const base = { automatic: false as const, requiresHumanReview: true as const, epistemic: "INFERENCIA" as const };
  const out = (conclusion: CoverageConclusion, evidence: ClauseEvidence[] = []): CoverageAssessment => ({
    conclusion, ...base, reasons, evidence, missing, recommendations,
  });

  if (!input.policy) {
    missing.push("APOLICE");
    reasons.push({ code: "APOLICE_AUSENTE", epistemic: "FATO", text: "Nenhuma apólice vinculada ao evento: sem texto contratual não há como avaliar cobertura." });
    recommendations.push("Localizar a apólice/condições e cadastrá-las com a fonte; até lá, não afirmar cobertura nem ausência dela.");
    return out("INFORMACOES_INSUFICIENTES");
  }
  const { coverageStart, coverageEnd } = input.policy;
  if (!coverageStart || !coverageEnd) missing.push("VIGENCIA");
  if (!input.eventDate) missing.push("DATA_DO_EVENTO");
  if (missing.length) {
    reasons.push({ code: "DADOS_BASICOS_AUSENTES", epistemic: "FATO", text: `Faltam dados: ${missing.join(", ")}.` });
    return out("INFORMACOES_INSUFICIENTES");
  }

  const sourced = input.clauses.filter(hasSource);
  const unsourced = input.clauses.filter((c) => !hasSource(c));
  for (const c of unsourced) reasons.push({ code: "CLAUSULA_SEM_FONTE", epistemic: "FATO", clauseId: c.id, text: `Cláusula "${c.title}" sem fonte documental: desconsiderada como evidência.` });

  const exclusions = sourced.filter((c) => c.kind === "EXCLUSAO" && applies(c, input.claimKind));
  if (exclusions.length) {
    for (const c of exclusions) reasons.push({ code: "EXCLUSAO_APLICAVEL", epistemic: "INFERENCIA", clauseId: c.id, text: `Exclusão "${c.title}" declara aplicar-se a ${input.claimKind}.` });
    recommendations.push("Conferir o texto integral da exclusão e eventual contra-cláusula/endosso antes de qualquer posição.");
    return out("NAO_COBERTO", exclusions);
  }

  const covering = sourced.filter((c) => (c.kind === "COBERTURA" || c.kind === "CLAUSULA") && applies(c, input.claimKind));
  if (!covering.length) {
    missing.push("CLAUSULA_DE_COBERTURA_PARA_O_EVENTO");
    reasons.push({
      code: RC_MODALITIES.includes(input.modality as PolicyModality) && RC_NEVER_PRESUMED_KINDS.includes(input.claimKind) ? "RC_SEM_PRESUNCAO" : "SEM_EVIDENCIA_DE_COBERTURA",
      epistemic: "FATO",
      text:
        RC_MODALITIES.includes(input.modality as PolicyModality) && RC_NEVER_PRESUMED_KINDS.includes(input.claimKind)
          ? `Apólice de responsabilidade civil: não se presume cobertura de ${input.claimKind} (defeito de execução/dano à própria obra) sem cláusula expressa com fonte.`
          : `Nenhuma cláusula com fonte declara cobrir ${input.claimKind}.`,
    });
    return out("INFORMACOES_INSUFICIENTES");
  }

  const conditions: CoverageReason[] = [];
  if (input.eventDate! < coverageStart! || input.eventDate! > coverageEnd!) {
    conditions.push({ code: "FORA_DA_VIGENCIA", epistemic: "INFERENCIA", text: "Data do evento fora da vigência cadastrada: depende da base temporal da apólice (ocorrência x reclamação), retroatividade e prazo complementar — verificar no texto." });
  }
  for (const c of covering) if (!c.verified) conditions.push({ code: "CLAUSULA_NAO_VERIFICADA", epistemic: "FATO", clauseId: c.id, text: `Cláusula "${c.title}" ainda não verificada por humano.` });
  for (const c of sourced.filter((x) => ["CONDICAO", "FRANQUIA", "SUBLIMITE"].includes(x.kind) && applies(x, input.claimKind))) {
    conditions.push({ code: `${c.kind}_APLICAVEL`, epistemic: "INFERENCIA", clauseId: c.id, text: `${c.kind} "${c.title}" declara aplicar-se ao evento.` });
  }
  if (input.noticeDeadline?.status === "VENCIDO") {
    conditions.push({ code: "PRAZO_DE_AVISO_VENCIDO", epistemic: "FATO", text: "Prazo de aviso cadastrado já venceu: consequência depende do texto da apólice/lei aplicável (não presumida)." });
  }
  for (const id of input.reliesOnEndorsementIds ?? []) {
    const e = (input.endorsements ?? []).find((x) => x.id === id);
    if (!e) conditions.push({ code: "ENDOSSO_NAO_ENCONTRADO", epistemic: "FATO", text: `Endosso ${id} citado não consta do cadastro.` });
    else if (!endorsementExtendsCoverage(e)) conditions.push({ code: "ENDOSSO_SEM_EFEITO", epistemic: "FATO", text: `Endosso ${id} está ${e.state}: pedido/emissão não conferida NÃO amplia cobertura.` });
  }
  reasons.push({ code: "CLAUSULA_DE_COBERTURA", epistemic: "INFERENCIA", clauseId: covering[0].id, text: `Cláusula "${covering[0].title}" declara cobrir ${input.claimKind}.` });
  if (conditions.length) {
    reasons.push(...conditions);
    return out("CONDICIONADO", covering);
  }
  return out("POTENCIALMENTE_COBERTO", covering);
}
