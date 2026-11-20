// Auditoria dos SUJEITOS da apólice (partes). Compara o cadastrado com o esperado pelo contrato quando houver.
// Não presume que o beneficiário final deva ser segurado; ausência de dado vira achado de FATO, divergência vira INFERENCIA.
import type { Epistemic, PartyRole } from "./types";

export interface PolicyParty {
  role: PartyRole;
  name?: string | null;
  taxId?: string | null;
  identificationStatus: "IDENTIFICADO" | "NAO_IDENTIFICADO";
}
export interface ExpectedSubjects {
  /** Segurado esperado segundo o contrato (nome e/ou documento). */
  insured?: { name?: string | null; taxId?: string | null } | null;
  /** Há beneficiário/proprietário final mencionado no contrato? (true = o contrato fala de um) */
  contractMentionsFinalBeneficiary?: boolean | null;
}
export interface SubjectFinding {
  code: "SEGURADO_AUSENTE" | "SEGURADO_INCORRETO" | "BENEFICIARIO_FINAL_NAO_IDENTIFICADO" | "TOMADOR_AUSENTE" | "SEGURADORA_AUSENTE" | "SEGURADO_NAO_CONFERIDO";
  severity: "ALTA" | "MEDIA" | "INFO";
  epistemic: Epistemic;
  text: string;
}
export interface SubjectsAudit {
  findings: SubjectFinding[];
  notes: string[];
  requiresHumanReview: true;
}

const norm = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const digits = (s?: string | null) => (s ?? "").replace(/\D+/g, "");

export function auditPolicySubjects(parties: PolicyParty[], expected: ExpectedSubjects = {}): SubjectsAudit {
  const findings: SubjectFinding[] = [];
  const by = (r: PartyRole) => parties.filter((p) => p.role === r);

  const insureds = by("SEGURADO").filter((p) => p.identificationStatus === "IDENTIFICADO");
  if (!insureds.length) {
    findings.push({ code: "SEGURADO_AUSENTE", severity: "ALTA", epistemic: "FATO", text: "Nenhum segurado identificado na apólice." });
  } else if (expected.insured && (expected.insured.name || expected.insured.taxId)) {
    const match = insureds.some((p) => {
      const byDoc = digits(expected.insured?.taxId) && digits(p.taxId) && digits(expected.insured?.taxId) === digits(p.taxId);
      const byName = norm(expected.insured?.name) && norm(p.name) && norm(expected.insured?.name) === norm(p.name);
      return Boolean(byDoc || byName);
    });
    if (!match) {
      findings.push({ code: "SEGURADO_INCORRETO", severity: "ALTA", epistemic: "INFERENCIA", text: `Segurado cadastrado (${insureds.map((p) => p.name ?? "?").join("; ")}) não corresponde ao segurado esperado pelo contrato: avaliar endosso de correção.` });
    }
  } else {
    findings.push({ code: "SEGURADO_NAO_CONFERIDO", severity: "INFO", epistemic: "FATO", text: "Segurado cadastrado, mas o contrato não foi informado para conferência." });
  }

  const finals = [...by("PROPRIETARIO_FINAL"), ...by("BENEFICIARIO")];
  const finalIdentified = finals.some((p) => p.identificationStatus === "IDENTIFICADO");
  if (!finalIdentified && (expected.contractMentionsFinalBeneficiary ?? true)) {
    findings.push({ code: "BENEFICIARIO_FINAL_NAO_IDENTIFICADO", severity: "MEDIA", epistemic: "FATO", text: "Beneficiário/proprietário final não identificado no cadastro: buscar no contrato e na apólice." });
  }
  if (!by("TOMADOR").length) findings.push({ code: "TOMADOR_AUSENTE", severity: "MEDIA", epistemic: "FATO", text: "Tomador não cadastrado." });
  if (!by("SEGURADORA").length) findings.push({ code: "SEGURADORA_AUSENTE", severity: "MEDIA", epistemic: "FATO", text: "Seguradora não cadastrada como parte." });

  return {
    findings,
    notes: ["Não se presume que o beneficiário final deva figurar como segurado: a posição de cada sujeito decorre do texto da apólice e do contrato."],
    requiresHumanReview: true,
  };
}
