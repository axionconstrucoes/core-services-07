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
  /**
   * Expectativas PERSISTIDAS por papel (insurance_expected_subjects; cada uma com a fonte: contrato, edital, instrução do cliente).
   * ESPERADO = a fonte indica quem deveria figurar; NAO_ESPERADO = a fonte indica que não há esse sujeito. Sem registro = não conferido.
   */
  expectedByRole?: Partial<Record<PartyRole, ExpectedSubject>>;
}
export interface ExpectedSubject {
  expectation: "ESPERADO" | "NAO_ESPERADO";
  name?: string | null;
  taxId?: string | null;
  /** Descrição curta da fonte da expectativa (para o texto do achado). */
  sourceLabel?: string | null;
}
export interface SubjectFinding {
  code: "SEGURADO_AUSENTE" | "SEGURADO_INCORRETO" | "BENEFICIARIO_FINAL_NAO_IDENTIFICADO" | "TOMADOR_AUSENTE" | "SEGURADORA_AUSENTE" | "SEGURADO_NAO_CONFERIDO" | "SUJEITO_ESPERADO_DIVERGENTE" | "SUJEITO_NAO_ESPERADO_CADASTRADO";
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

const matches = (expected: { name?: string | null; taxId?: string | null }, p: PolicyParty): boolean => {
  const byDoc = digits(expected.taxId) && digits(p.taxId) && digits(expected.taxId) === digits(p.taxId);
  const byName = norm(expected.name) && norm(p.name) && norm(expected.name) === norm(p.name);
  return Boolean(byDoc || byName);
};

/** Papéis conferidos contra a expectativa persistida (além do segurado, que tem tratamento próprio). Beneficiário e proprietário final são conferidos em conjunto. */
const GROUPS: Array<{ label: string; roles: PartyRole[]; expectedRole: PartyRole }> = [
  { label: "beneficiário", roles: ["BENEFICIARIO", "PROPRIETARIO_FINAL"], expectedRole: "BENEFICIARIO" },
  { label: "proprietário final", roles: ["BENEFICIARIO", "PROPRIETARIO_FINAL"], expectedRole: "PROPRIETARIO_FINAL" },
  { label: "tomador", roles: ["TOMADOR"], expectedRole: "TOMADOR" },
  { label: "titular do interesse segurável", roles: ["TITULAR_INTERESSE_SEGURAVEL"], expectedRole: "TITULAR_INTERESSE_SEGURAVEL" },
];

export function auditPolicySubjects(parties: PolicyParty[], rawExpected: ExpectedSubjects = {}): SubjectsAudit {
  const findings: SubjectFinding[] = [];
  const persisted = rawExpected.expectedByRole ?? {};
  // Expectativa persistida do segurado vale quando nada foi digitado na tela; beneficiário final: ESPERADO => contrato cita; NAO_ESPERADO => não cita.
  const finalPersisted = persisted.PROPRIETARIO_FINAL ?? persisted.BENEFICIARIO;
  const expected: ExpectedSubjects = {
    ...rawExpected,
    insured: rawExpected.insured ?? (persisted.SEGURADO?.expectation === "ESPERADO" ? { name: persisted.SEGURADO.name, taxId: persisted.SEGURADO.taxId } : null),
    contractMentionsFinalBeneficiary: rawExpected.contractMentionsFinalBeneficiary ?? (finalPersisted ? finalPersisted.expectation === "ESPERADO" : null),
  };
  const by = (r: PartyRole) => parties.filter((p) => p.role === r);

  const insureds = by("SEGURADO").filter((p) => p.identificationStatus === "IDENTIFICADO");
  if (!insureds.length) {
    findings.push({ code: "SEGURADO_AUSENTE", severity: "ALTA", epistemic: "FATO", text: "Nenhum segurado identificado na apólice." });
  } else if (expected.insured && (expected.insured.name || expected.insured.taxId)) {
    const match = insureds.some((p) => matches(expected.insured ?? {}, p));
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
  // Conferência com as expectativas PERSISTIDAS (fonte registrada): divergência = INFERÊNCIA; nunca presume que o beneficiário final deva ser segurado.
  for (const g of GROUPS) {
    const exp = persisted[g.expectedRole];
    if (!exp) continue;
    const candidates = parties.filter((p) => g.roles.includes(p.role) && p.identificationStatus === "IDENTIFICADO");
    const via = exp.sourceLabel ? ` (fonte da expectativa: ${exp.sourceLabel})` : "";
    if (exp.expectation === "ESPERADO") {
      if (candidates.length > 0 && !candidates.some((p) => matches(exp, p))) {
        findings.push({ code: "SUJEITO_ESPERADO_DIVERGENTE", severity: "MEDIA", epistemic: "INFERENCIA", text: `O ${g.label} esperado (${exp.name ?? exp.taxId ?? "?"})${via} não corresponde ao cadastrado (${candidates.map((p) => p.name ?? "?").join("; ")}): conferir apólice e contrato e avaliar endosso de correção.` });
      }
    } else if (candidates.length > 0) {
      findings.push({ code: "SUJEITO_NAO_ESPERADO_CADASTRADO", severity: "INFO", epistemic: "INFERENCIA", text: `A fonte registrada indica que não há ${g.label}${via}, mas há ${g.label} cadastrado (${candidates.map((p) => p.name ?? "?").join("; ")}): conferir.` });
    }
  }
  if (!by("TOMADOR").length) findings.push({ code: "TOMADOR_AUSENTE", severity: "MEDIA", epistemic: "FATO", text: "Tomador não cadastrado." });
  if (!by("SEGURADORA").length) findings.push({ code: "SEGURADORA_AUSENTE", severity: "MEDIA", epistemic: "FATO", text: "Seguradora não cadastrada como parte." });

  return {
    findings,
    notes: ["Não se presume que o beneficiário final deva figurar como segurado: a posição de cada sujeito decorre do texto da apólice e do contrato."],
    requiresHumanReview: true,
  };
}
