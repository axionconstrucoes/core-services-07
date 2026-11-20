// PARECER DE COBERTURA DE GARANTIA — persistência (Fase 3 / E). Puro, sem I/O, sem IA.
// O servidor RECALCULA a conclusão a partir dos itens e sinais (deriveWarrantyCoverage); o banco a reverifica
// (quality_warranty_coverage_check) e rejeita divergência. Nunca se grava conclusão digitada livremente.
// Cada reavaliação é uma NOVA versão (append-only; supersedes_id aponta para a anterior). NÃO é parecer jurídico: apoio à decisão humana.

import { INSURANCE_WARRANTY_REFERENCES, INSURANCE_WARRANTY_REFERENCES_VERSION } from "@/lib/ai/legal/references-insurance-warranty";
import { WARRANTY_COVERAGE_ITEMS, type WarrantyItemAssessment, type WarrantySignals } from "@/lib/ai/legal/warranty-coverage";
import { evaluateCoverageForm, type CoverageFormState } from "./coverage-form";

/** Versão do código/lista de itens + conjunto de referências usado: mudou qualquer um, a versão muda (reprodutibilidade). */
export const WARRANTY_COVERAGE_ENGINE_VERSION = `warranty-coverage/items16-v1;refs/${INSURANCE_WARRANTY_REFERENCES_VERSION}`;

export const OPINION_NOT_LEGAL_NOTICE = "Parecer de apoio — NÃO é parecer jurídico. Cada versão é gravada sem sobrescrever a anterior; a decisão final é do responsável humano.";

export interface OpinionReferenceSnapshot {
  id: string;
  verification: string;
  isSecondary: boolean;
}

export interface OpinionSavePayload {
  items: WarrantyItemAssessment[];
  signals: WarrantySignals;
  conclusion: string;
  reasons: string[];
  missing: string[];
  referencesSnapshot: OpinionReferenceSnapshot[];
  referencesVersion: string;
  engineVersion: string;
}

export function referencesSnapshot(): OpinionReferenceSnapshot[] {
  return INSURANCE_WARRANTY_REFERENCES.map((r) => ({ id: r.id, verification: r.verification, isSecondary: r.isSecondary === true }));
}

export type OpinionBuild = { ok: true; payload: OpinionSavePayload } | { ok: false; errors: string[] };

/** Monta o payload a partir do formulário. Pendências estruturais (item preenchido sem fonte, linguagem proibida) IMPEDEM a gravação. */
export function buildOpinionPayload(form: CoverageFormState): OpinionBuild {
  const evaluation = evaluateCoverageForm(form);
  const errors = [...evaluation.itemProblems, ...evaluation.outputProblems];
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      items: evaluation.items.map((i) => ({ key: i.key, status: i.status, value: i.value, evidence: i.evidence })),
      signals: { ...form.signals },
      conclusion: evaluation.derivation.conclusion,
      reasons: evaluation.derivation.reasons,
      missing: evaluation.missingLabels,
      referencesSnapshot: referencesSnapshot(),
      referencesVersion: INSURANCE_WARRANTY_REFERENCES_VERSION,
      engineVersion: WARRANTY_COVERAGE_ENGINE_VERSION,
    },
  };
}

export interface OpinionVersionView {
  id: string;
  versionNo: number;
  engineVersion: string;
  items: WarrantyItemAssessment[];
  signals: WarrantySignals;
  conclusion: string;
  reasons: string[];
  missing: string[];
  legalControversy: boolean;
  routeToHuman: boolean;
  referencesSnapshot: OpinionReferenceSnapshot[];
  referencesVersion: string | null;
  note: string | null;
  supersedesId: string | null;
  createdBy: string | null;
  createdAt: string;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/** Mapeia o JSON de quality_warranty_opinion_versions (mais recente primeiro). Entrada inesperada => lista vazia (sem inventar versão). */
export function mapOpinionVersions(raw: unknown): OpinionVersionView[] {
  if (!Array.isArray(raw)) return [];
  const out: OpinionVersionView[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    if (!r || typeof r.id !== "string" || typeof r.versionNo !== "number") continue;
    out.push({
      id: r.id,
      versionNo: r.versionNo,
      engineVersion: String(r.engineVersion ?? ""),
      items: Array.isArray(r.items) ? (r.items as WarrantyItemAssessment[]) : [],
      signals: (r.signals ?? {}) as WarrantySignals,
      conclusion: String(r.conclusion ?? ""),
      reasons: strArr(r.reasons),
      missing: strArr(r.missing),
      legalControversy: r.legalControversy === true,
      routeToHuman: r.routeToHuman === true,
      referencesSnapshot: Array.isArray(r.referencesSnapshot) ? (r.referencesSnapshot as OpinionReferenceSnapshot[]) : [],
      referencesVersion: typeof r.referencesVersion === "string" ? r.referencesVersion : null,
      note: typeof r.note === "string" ? r.note : null,
      supersedesId: typeof r.supersedesId === "string" ? r.supersedesId : null,
      createdBy: typeof r.createdBy === "string" ? r.createdBy : null,
      createdAt: String(r.createdAt ?? ""),
    });
  }
  return out;
}

/** Recarrega uma versão gravada no formulário (para reavaliar). Itens ausentes viram SEM DADOS. */
export function formFromOpinion(v: OpinionVersionView): CoverageFormState {
  const items: CoverageFormState["items"] = {};
  for (const def of WARRANTY_COVERAGE_ITEMS) {
    const it = v.items.find((i) => i.key === def.key);
    items[def.key] = it
      ? { status: it.status, value: it.value ?? "", source: it.evidence ?? "" }
      : { status: "SEM_DADOS", value: "", source: "" };
  }
  return { items, signals: { ...v.signals } };
}

/** A versão gravada ainda corresponde ao conjunto de referências/código atuais? Se não, a reavaliação é recomendada (não obrigatória). */
export function isOpinionStale(v: Pick<OpinionVersionView, "engineVersion">): boolean {
  return v.engineVersion !== WARRANTY_COVERAGE_ENGINE_VERSION;
}

// ------------------------------------------------------------------ entrada/saída das Server Actions

export type OpinionActionResult =
  | { ok: true; versionNo: number; conclusion: string }
  | { ok: false; code: string; message: string };

const OPINION_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  FORBIDDEN: "Você não tem permissão para registrar o parecer neste projeto (o banco recusou).",
  EXPECTED_VERSION_REQUIRED: "Versão do parecer ausente: recarregue a página.",
  VERSION_CONFLICT: "Outra pessoa gravou uma nova versão do parecer depois que você abriu a tela. Nada foi gravado: recarregue, confira a versão mais recente e refaça.",
  CONCLUSION_MISMATCH: "A conclusão não confere com a derivação determinística dos itens e sinais. Nada foi gravado (a conclusão nunca é digitada livremente).",
  ITEM_SOURCE_REQUIRED: "Todo item preenchido exige valor e fonte. Nada foi gravado.",
  INVALID_ITEMS: "Os 16 itens estão inválidos (ordem, duplicidade ou item 'não aplicável' sem justificativa). Nada foi gravado.",
  INVALID_SIGNALS: "Os sinais estão inválidos. Nada foi gravado.",
  INVALID_INPUT: "Algum campo está inválido. Nada foi gravado.",
  ENGINE_VERSION_REQUIRED: "Versão do motor de avaliação ausente.",
};

export function mapOpinionError(error: { message?: string | null; code?: string | null } | null | undefined): { ok: false; code: string; message: string } {
  const message = error?.message ?? "";
  const m = /^\s*([A-Z][A-Z0-9_]{2,60})/.exec(message);
  if (m && OPINION_ERRORS[m[1]]) return { ok: false, code: m[1], message: OPINION_ERRORS[m[1]] };
  if (error?.code === "42501" || /row-level security|permission denied/i.test(message)) return { ok: false, code: "FORBIDDEN", message: OPINION_ERRORS.FORBIDDEN };
  if (error?.code === "42P01" || error?.code === "42883" || error?.code === "PGRST202" || error?.code === "PGRST205") {
    return { ok: false, code: "UNAVAILABLE", message: "Persistência do parecer indisponível neste ambiente (migrations pendentes)." };
  }
  return { ok: false, code: "UNKNOWN", message: "Não foi possível gravar o parecer. Nada foi gravado; tente de novo ou acione o administrador." };
}

const STATUSES = new Set(["PREENCHIDO", "SEM_DADOS", "NAO_APLICAVEL"]);

/** O formulário vem do navegador (não confiável): reconstrói só com as chaves/estados conhecidos e textos limitados. */
export function sanitizeCoverageForm(form: unknown): CoverageFormState | null {
  if (!form || typeof form !== "object") return null;
  const f = form as { items?: Record<string, { status?: unknown; value?: unknown; source?: unknown }>; signals?: Record<string, unknown> };
  if (!f.items || typeof f.items !== "object" || !f.signals || typeof f.signals !== "object") return null;
  const items: CoverageFormState["items"] = {};
  for (const def of WARRANTY_COVERAGE_ITEMS) {
    const it = f.items[def.key];
    const status = typeof it?.status === "string" && STATUSES.has(it.status) ? (it.status as WarrantyItemAssessment["status"]) : "SEM_DADOS";
    items[def.key] = {
      status,
      value: typeof it?.value === "string" ? it.value.slice(0, 4000) : "",
      source: typeof it?.source === "string" ? it.source.slice(0, 2000) : "",
    };
  }
  const s = f.signals;
  return {
    items,
    signals: {
      contractualWarranty: s.contractualWarranty as WarrantySignals["contractualWarranty"],
      legalWarrantyPotential: s.legalWarrantyPotential as WarrantySignals["legalWarrantyPotential"],
      hiddenDefect: s.hiddenDefect as WarrantySignals["hiddenDefect"],
      claimDeadline: s.claimDeadline as WarrantySignals["claimDeadline"],
      maintenance: s.maintenance as WarrantySignals["maintenance"],
      legalControversy: s.legalControversy === true,
    },
  };
}
