// COERÊNCIA minuta x apólice x contrato (Fase 4 / B). Puro, sem I/O. Espelha insurance_int_coherence (SQL); o texto canônico é idêntico
// (paridade testada em Postgres real). Apoio à decisão: exige revisão humana; nunca presume valor ausente.
//   * valor ausente em um documento NÃO é divergência (SEM DADOS): só se comparam os valores presentes;
//   * faltar TODO o conjunto de termos de um dos três instrumentos => SEM_DADOS (a validação não pode ser feita) e a aprovação é bloqueada;
//   * divergência sem justificativa (texto + fonte, presa ao fingerprint dos valores) bloqueia a aprovação da minuta.
import { normalizeText, partyEqual, taxIdDigits } from "./tax-id";
import type { SourceRef } from "./types";

export const COHERENCE_INSTRUMENTS = ["CONTRATO", "APOLICE", "MINUTA"] as const;
export type CoherenceInstrument = (typeof COHERENCE_INSTRUMENTS)[number];

export const COHERENCE_FIELDS = ["SEGURADO", "BENEFICIARIO", "OBJETO", "VIGENCIA_INICIO", "VIGENCIA_FIM", "IMPORTANCIA_SEGURADA", "OBRIGACAO_GARANTIDA"] as const;
export type CoherenceField = (typeof COHERENCE_FIELDS)[number];

export interface InstrumentTerms {
  insuredName?: string | null;
  insuredTaxId?: string | null;
  beneficiaryName?: string | null;
  beneficiaryTaxId?: string | null;
  objectText?: string | null;
  /** AAAA-MM-DD */
  coverageStart?: string | null;
  coverageEnd?: string | null;
  insuredAmount?: number | null;
  guaranteedObligation?: string | null;
  source: SourceRef;
}

export type CoherenceStatus = "COERENTE" | "DIVERGENTE_JUSTIFICADA" | "DIVERGENTE" | "SEM_DADOS";

export interface CoherenceDivergence {
  field: CoherenceField;
  kind: "DIVERGENTE";
  canonical: string;
  /** Valor normalizado por instrumento (só os presentes). */
  values: Partial<Record<CoherenceInstrument, string>>;
  sources: Partial<Record<CoherenceInstrument, string>>;
  fingerprint: string | null;
  justified: boolean;
}

export interface CoherenceResult {
  status: CoherenceStatus;
  missingKinds: CoherenceInstrument[];
  divergences: CoherenceDivergence[];
  unjustified: number;
  justified: number;
  approvalAllowed: boolean;
}

const nz = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

type Party = { name: string | null; tax: string | null };

function partyOf(t: InstrumentTerms, field: "SEGURADO" | "BENEFICIARIO"): Party | null {
  const name = nz(field === "SEGURADO" ? t.insuredName : t.beneficiaryName);
  const tax = taxIdDigits(field === "SEGURADO" ? t.insuredTaxId : t.beneficiaryTaxId);
  return name || tax ? { name, tax } : null;
}

function scalarOf(t: InstrumentTerms, field: CoherenceField): string | null {
  switch (field) {
    case "OBJETO":
      return normalizeText(t.objectText) || null;
    case "OBRIGACAO_GARANTIDA":
      return normalizeText(t.guaranteedObligation) || null;
    case "VIGENCIA_INICIO":
      return nz(t.coverageStart);
    case "VIGENCIA_FIM":
      return nz(t.coverageEnd);
    case "IMPORTANCIA_SEGURADA":
      return typeof t.insuredAmount === "number" && Number.isFinite(t.insuredAmount) ? t.insuredAmount.toFixed(2) : null;
    default:
      return null;
  }
}

const srcText = (s: SourceRef): string => nz(s.ref) ?? (s.documentId ? `documento ${s.documentId}` : "");

/** `fingerprint`: função md5 do texto canônico (opcional; o servidor usa o md5 do banco). Sem ela, nenhuma divergência é tida como justificada. */
export function computeCoherence(
  terms: Partial<Record<CoherenceInstrument, InstrumentTerms>>,
  justifiedFingerprints: ReadonlySet<string> = new Set(),
  fingerprint?: (canonical: string) => string,
): CoherenceResult {
  const missingKinds = COHERENCE_INSTRUMENTS.filter((k) => !terms[k]);
  const divergences: CoherenceDivergence[] = [];
  for (const field of COHERENCE_FIELDS) {
    const present: Array<{ kind: CoherenceInstrument; party: Party | null; scalar: string | null }> = [];
    const values: Partial<Record<CoherenceInstrument, string>> = {};
    const sources: Partial<Record<CoherenceInstrument, string>> = {};
    let canonical = `${field}|`;
    for (const kind of COHERENCE_INSTRUMENTS) {
      const t = terms[kind];
      if (!t) {
        canonical += `${kind}=;`;
        continue;
      }
      if (field === "SEGURADO" || field === "BENEFICIARIO") {
        const p = partyOf(t, field);
        if (p) {
          present.push({ kind, party: p, scalar: null });
          values[kind] = `${p.tax ?? ""}/${normalizeText(p.name)}`;
          sources[kind] = srcText(t.source);
          canonical += `${kind}=${p.tax ?? ""}/${normalizeText(p.name)};`;
        } else canonical += `${kind}=;`;
      } else {
        const s = scalarOf(t, field);
        if (s !== null) {
          present.push({ kind, party: null, scalar: s });
          values[kind] = s;
          sources[kind] = srcText(t.source);
          canonical += `${kind}=${s};`;
        } else canonical += `${kind}=;`;
      }
    }
    let diff = false;
    for (let i = 0; i < present.length && !diff; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) {
        const a = present[i];
        const b = present[j];
        const equal = a.party && b.party ? partyEqual({ name: a.party.name, taxId: a.party.tax }, { name: b.party.name, taxId: b.party.tax }) : a.scalar === b.scalar;
        if (!equal) {
          diff = true;
          break;
        }
      }
    }
    if (diff) {
      const fp = fingerprint ? fingerprint(canonical) : null;
      divergences.push({ field, kind: "DIVERGENTE", canonical, values, sources, fingerprint: fp, justified: fp !== null && justifiedFingerprints.has(fp) });
    }
  }
  const unjustified = divergences.filter((d) => !d.justified).length;
  const justified = divergences.length - unjustified;
  const status: CoherenceStatus = missingKinds.length > 0 ? "SEM_DADOS" : unjustified > 0 ? "DIVERGENTE" : justified > 0 ? "DIVERGENTE_JUSTIFICADA" : "COERENTE";
  return { status, missingKinds, divergences, unjustified, justified, approvalAllowed: status === "COERENTE" || status === "DIVERGENTE_JUSTIFICADA" };
}

export const COHERENCE_FIELD_LABELS: Record<CoherenceField, string> = {
  SEGURADO: "Segurado",
  BENEFICIARIO: "Beneficiário",
  OBJETO: "Objeto",
  VIGENCIA_INICIO: "Início da vigência",
  VIGENCIA_FIM: "Fim da vigência",
  IMPORTANCIA_SEGURADA: "Importância segurada",
  OBRIGACAO_GARANTIDA: "Obrigação garantida",
};
export const COHERENCE_STATUS_LABELS: Record<CoherenceStatus, string> = {
  COERENTE: "Coerente",
  DIVERGENTE_JUSTIFICADA: "Divergente — justificada",
  DIVERGENTE: "Divergente — aprovação bloqueada",
  SEM_DADOS: "SEM DADOS — faltam os termos de um instrumento (aprovação bloqueada)",
};
export const COHERENCE_INSTRUMENT_LABELS: Record<CoherenceInstrument, string> = { CONTRATO: "Contrato", APOLICE: "Apólice", MINUTA: "Minuta" };

/** Justificativa válida: texto de 20 a 4000 caracteres E fonte (documento ou referência). Espelha insurance_coherence_justify. */
export function validateJustification(input: { justification: string; sourceRef?: string | null; sourceDocumentId?: string | null }): string[] {
  const errors: string[] = [];
  const t = input.justification.trim();
  if (t.length < 20 || t.length > 4000) errors.push("A justificativa exige texto de 20 a 4000 caracteres.");
  if (!nz(input.sourceRef) && !input.sourceDocumentId) errors.push("A justificativa exige fonte (documento do projeto ou referência).");
  return errors;
}
