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
  /**
   * Checklist RCC pronto (10 perguntas com fonte e natureza do bem definida; insurance_rcc_readiness). Só é exigido quando a modalidade ou o evento
   * é de RC CRUZADA: sem ele (false/null/ausente) a conclusão nunca passa de INFORMACOES_INSUFICIENTES (exclusão com fonte ainda prevalece).
   */
  rccReady?: boolean | null;
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
/** Cláusula ESPECÍFICA de cobertura: tipo COBERTURA + identificação no texto da apólice (nº/título da cláusula) + fonte. */
export const hasClauseIdentifier = (c: ClauseEvidence) => typeof c.identifier === "string" && c.identifier.trim().length >= 2;
const isSpecificCoverage = (c: ClauseEvidence) => c.kind === "COBERTURA" && hasClauseIdentifier(c);

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

  // RC CRUZADA: sem o checklist RCC pronto não se afirma cobertura (apenas exclusão com fonte prevalece, tratada acima)
  const needsRcc = input.modality === "RC_CRUZADA" || input.claimKind === "RC_CRUZADA";
  if (needsRcc && input.rccReady !== true) {
    missing.push("CHECKLIST_RCC_COMPLETO");
    reasons.push({ code: "RCC_INCOMPLETO", epistemic: "FATO", text: "Responsabilidade civil cruzada: o checklist RCC (10 perguntas com fonte e natureza do bem definida) não está pronto; sem ele não se avalia cobertura." });
    recommendations.push("Complete o checklist RCC com fonte para cada pergunta antes de qualquer posição sobre cobertura.");
    return out("INFORMACOES_INSUFICIENTES");
  }

  // Fase 4/B: cláusula GENÉRICA não é prova de cobertura — só cobertura específica, identificada e com fonte conta.
  for (const c of sourced.filter((x) => (x.kind === "CLAUSULA" || x.kind === "OUTRO" || x.kind === "COBERTURA") && !isSpecificCoverage(x) && applies(x, input.claimKind))) {
    reasons.push({
      code: "CLAUSULA_GENERICA_NAO_E_COBERTURA",
      epistemic: "FATO",
      clauseId: c.id,
      text: c.kind === "COBERTURA"
        ? `Cobertura "${c.title}" sem identificação da cláusula no texto da apólice: não vale como prova de cobertura até ser identificada (ex.: Cláusula 4.2).`
        : `Cláusula "${c.title}" é genérica (${c.kind}): cláusula genérica não prova cobertura; é preciso uma cláusula de COBERTURA específica, identificada, com fonte.`,
    });
  }
  const covering = sourced.filter((c) => isSpecificCoverage(c) && applies(c, input.claimKind));
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
  // compara só a DATA (yyyy-mm-dd): um instante ISO do mesmo dia do fim da vigência não pode ser tratado como "fora da vigência"
  const eventDay = input.eventDate!.slice(0, 10);
  if (eventDay < coverageStart!.slice(0, 10) || eventDay > coverageEnd!.slice(0, 10)) {
    conditions.push({ code: "FORA_DA_VIGENCIA", epistemic: "INFERENCIA", text: "Data do evento fora da vigência cadastrada: depende da base temporal da apólice (ocorrência x reclamação), retroatividade e prazo complementar — verificar no texto." });
  }
  for (const c of covering) if (!c.verified) conditions.push({ code: "CLAUSULA_NAO_VERIFICADA", epistemic: "FATO", clauseId: c.id, text: `Cláusula "${c.title}" ainda não verificada por humano.` });
  // Cláusula RESTRITIVA sem fonte que declara aplicar-se ao evento não vale como evidência, mas também NÃO pode ser ignorada em silêncio:
  // "potencialmente coberto" com uma exclusão/condição cadastrada e sem fonte seria falso conforto. Vira condição (revisão humana).
  for (const c of unsourced.filter((x) => ["EXCLUSAO", "CONDICAO", "FRANQUIA", "SUBLIMITE"].includes(x.kind) && applies(x, input.claimKind))) {
    conditions.push({ code: "CLAUSULA_RESTRITIVA_SEM_FONTE", epistemic: "FATO", clauseId: c.id, text: `${c.kind} "${c.title}" cadastrada como aplicável ao evento, mas SEM fonte: confirme no texto da apólice antes de qualquer posição (não foi considerada como evidência).` });
  }
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
