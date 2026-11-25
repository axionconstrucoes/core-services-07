// Persistência do checklist RCC (10 perguntas) e dos sujeitos ESPERADOS por apólice (Fase 3 / E). Módulo puro (sem "use server", sem rede).
// A UI escreve SOMENTE por estas RPCs (SECURITY DEFINER, auditoria na mesma transação, versão otimista, append-only):
//   insurance_rcc_checklist_save / insurance_rcc_checklist_get / insurance_expected_subject_save / insurance_expected_subjects_get.
// O banco é a autoridade; o espelho de permissão aqui só decide o que mostrar. Toda resposta do RCC exige FONTE; sem resposta = SEM DADOS.
import { RCC_QUESTIONS, type RccAnswer, type RccKey } from "../insurance/rcc-checklist";
import type { ExpectedSubject, ExpectedSubjects } from "../insurance/subjects-audit";
import type { PartyRole } from "../insurance/types";
import { mapInsuranceError, type InsuranceActionError } from "./errors";
import { hasInsuranceLevel, type InsuranceLevel } from "./permissions";

export type PersistenceOp = "rcc_save" | "rcc_get" | "subject_save" | "subjects_get";
export const ALL_PERSISTENCE_OPS: PersistenceOp[] = ["rcc_save", "rcc_get", "subject_save", "subjects_get"];
export const isPersistenceOp = (v: unknown): v is PersistenceOp => typeof v === "string" && (ALL_PERSISTENCE_OPS as string[]).includes(v);

export interface PersistenceInput {
  projectId: string;
  op: PersistenceOp;
  policyId: string;
  claimId?: string | null;
  /** última versão conhecida na tela (0 = ainda não existe) */
  expectedVersion?: number;
  rccAnswers?: Partial<Record<RccKey, RccAnswer>>;
  note?: string | null;
  subject?: ExpectedSubjectForm;
}

export interface PersistenceCall {
  rpc: string;
  params: Record<string, unknown>;
  level: InsuranceLevel;
}

export class PersistenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceInputError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Nível exigido por operação (espelha a RPC): RCC grava com REGISTER; sujeitos esperados com MANAGE (alteram o parâmetro da auditoria). */
export function levelForPersistenceOp(op: PersistenceOp): InsuranceLevel {
  switch (op) {
    case "rcc_save":
      return "REGISTER";
    case "subject_save":
      return "MANAGE";
    default:
      return "READ";
  }
}

export function isPersistenceOpAllowed(permission: string | null | undefined, op: PersistenceOp): boolean {
  return hasInsuranceLevel(permission, levelForPersistenceOp(op));
}

export const SUBJECT_ROLES: Array<{ role: PartyRole; label: string }> = [
  { role: "SEGURADO", label: "Segurado esperado" },
  { role: "BENEFICIARIO", label: "Beneficiário esperado" },
  { role: "PROPRIETARIO_FINAL", label: "Proprietário/beneficiário final esperado" },
  { role: "TOMADOR", label: "Tomador esperado" },
  { role: "TITULAR_INTERESSE_SEGURAVEL", label: "Titular do interesse segurável esperado" },
];
export const SUBJECT_SOURCE_KINDS = [
  { value: "CONTRATO", label: "Contrato" },
  { value: "EDITAL", label: "Edital" },
  { value: "INSTRUCAO_CLIENTE", label: "Instrução do cliente" },
  { value: "OUTRO", label: "Outro documento" },
] as const;
export type SubjectSourceKind = (typeof SUBJECT_SOURCE_KINDS)[number]["value"];

export interface ExpectedSubjectForm {
  partyRole: PartyRole;
  expectation: "ESPERADO" | "NAO_ESPERADO";
  expectedName?: string | null;
  expectedTaxId?: string | null;
  sourceKind: SubjectSourceKind;
  sourceDocumentId?: string | null;
  sourceRef?: string | null;
  note?: string | null;
}

/** Validação local (o banco repete tudo): mensagens para a pessoa antes de ir ao servidor. */
export function validateExpectedSubjectForm(f: ExpectedSubjectForm): string[] {
  const errors: string[] = [];
  if (!SUBJECT_ROLES.some((r) => r.role === f.partyRole)) errors.push("Papel esperado inválido.");
  if (f.expectation !== "ESPERADO" && f.expectation !== "NAO_ESPERADO") errors.push("Informe se o sujeito é esperado ou não esperado.");
  if (!SUBJECT_SOURCE_KINDS.some((k) => k.value === f.sourceKind)) errors.push("Informe o tipo da fonte (contrato, edital, instrução do cliente...).");
  const name = (f.expectedName ?? "").trim();
  const tax = (f.expectedTaxId ?? "").trim();
  const ref = (f.sourceRef ?? "").trim();
  if (!f.sourceDocumentId && !ref) errors.push("A expectativa exige a fonte: selecione o documento ou descreva a cláusula/referência.");
  if (f.sourceDocumentId && !isUuid(f.sourceDocumentId)) errors.push("Documento de fonte inválido.");
  if (f.expectation === "ESPERADO" && !name && !tax) errors.push("Informe o nome e/ou o CNPJ/CPF do sujeito esperado.");
  if (f.expectation === "NAO_ESPERADO" && (name || tax)) errors.push("\"Não esperado\" não leva nome nem CNPJ/CPF.");
  return errors;
}

export function validateRccAnswers(answers: Partial<Record<RccKey, RccAnswer>>): string[] {
  const errors: string[] = [];
  for (const q of RCC_QUESTIONS) {
    const a = answers[q.key];
    const text = (a?.answer ?? "").trim();
    const hasSource = Boolean(a?.source?.documentId || (a?.source?.ref ?? "").trim());
    if (text && !hasSource) errors.push(`${q.label} — a resposta exige fonte (documento, página ou cláusula).`);
    if (!text && hasSource) errors.push(`${q.label} — há fonte sem resposta (sem resposta = SEM DADOS).`);
    if (text && q.key === "BENS_TERCEIROS_X_PROPRIA_OBRA" && !a?.propertyScope) errors.push("Bens de terceiros x própria obra — informe a natureza do bem atingido (ou Indefinido).");
  }
  return errors;
}

function rccItemsPayload(answers: Partial<Record<RccKey, RccAnswer>>) {
  const items: Array<Record<string, unknown>> = [];
  for (const q of RCC_QUESTIONS) {
    const a = answers[q.key];
    const text = (a?.answer ?? "").trim();
    if (!text) continue; // sem resposta = SEM DADOS (o banco registra a linha como NULL)
    const item: Record<string, unknown> = { key: q.key, answer: text };
    if (a?.source?.documentId) item.sourceDocumentId = a.source.documentId;
    if ((a?.source?.ref ?? "").trim()) item.sourceRef = (a?.source?.ref ?? "").trim();
    if ((a?.source?.page ?? "").trim()) item.sourcePage = (a?.source?.page ?? "").trim();
    if (q.key === "BENS_TERCEIROS_X_PROPRIA_OBRA" && a?.propertyScope) item.propertyScope = a.propertyScope;
    items.push(item);
  }
  return items;
}

/** Valida a entrada e monta a chamada da RPC. Lança PersistenceInputError em entrada inválida (nada é enviado ao banco). */
export function buildPersistenceCall(input: PersistenceInput): PersistenceCall {
  if (!isUuid(input.projectId)) throw new PersistenceInputError("Projeto inválido.");
  if (!isUuid(input.policyId)) throw new PersistenceInputError("Apólice inválida.");
  if (input.claimId != null && !isUuid(input.claimId)) throw new PersistenceInputError("Evento/sinistro inválido.");
  const level = levelForPersistenceOp(input.op);
  const expected = input.expectedVersion;
  const needVersion = () => {
    if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) throw new PersistenceInputError("Versão ausente: recarregue a tela.");
    return expected;
  };
  switch (input.op) {
    case "rcc_get":
      return { rpc: "insurance_rcc_checklist_get", params: { p_policy_id: input.policyId, p_claim_id: input.claimId ?? null }, level };
    case "subjects_get":
      return { rpc: "insurance_expected_subjects_get", params: { p_policy_id: input.policyId }, level };
    case "rcc_save": {
      const answers = input.rccAnswers ?? {};
      const errors = validateRccAnswers(answers);
      if (errors.length) throw new PersistenceInputError(errors.join(" "));
      return {
        rpc: "insurance_rcc_checklist_save",
        params: { p_policy_id: input.policyId, p_claim_id: input.claimId ?? null, p_items: rccItemsPayload(answers), p_expected_version: needVersion(), p_note: (input.note ?? "").trim() || null },
        level,
      };
    }
    case "subject_save": {
      const f = input.subject;
      if (!f) throw new PersistenceInputError("Dados do sujeito esperado ausentes.");
      const errors = validateExpectedSubjectForm(f);
      if (errors.length) throw new PersistenceInputError(errors.join(" "));
      const data: Record<string, unknown> = { party_role: f.partyRole, expectation: f.expectation, source_kind: f.sourceKind };
      if ((f.expectedName ?? "").trim()) data.expected_name = (f.expectedName ?? "").trim();
      if ((f.expectedTaxId ?? "").trim()) data.expected_tax_id = (f.expectedTaxId ?? "").trim();
      if (f.sourceDocumentId) data.source_document_id = f.sourceDocumentId;
      if ((f.sourceRef ?? "").trim()) data.source_ref = (f.sourceRef ?? "").trim();
      if ((f.note ?? "").trim()) data.note = (f.note ?? "").trim();
      return { rpc: "insurance_expected_subject_save", params: { p_policy_id: input.policyId, p_data: data, p_expected_version: needVersion() }, level };
    }
    default:
      throw new PersistenceInputError("Operação desconhecida.");
  }
}

// ------------------------------------------------------------------ leitura (RPC -> modelo)

export interface RccChecklistView {
  id: string;
  versionNo: number;
  policyId: string;
  claimId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  answers: Partial<Record<RccKey, RccAnswer>>;
}
export interface RccVersionSummary {
  id: string;
  versionNo: number;
  createdBy: string | null;
  createdAt: string;
  answered: number;
}
export interface RccLoad {
  latest: RccChecklistView | null;
  versions: RccVersionSummary[];
}

const RCC_KEYS = new Set<string>(RCC_QUESTIONS.map((q) => q.key));

export function mapRccGet(raw: unknown): RccLoad {
  const r = (raw ?? {}) as { latest?: Record<string, unknown> | null; versions?: Array<Record<string, unknown>> };
  let latest: RccChecklistView | null = null;
  if (r.latest && typeof r.latest.id === "string") {
    const answers: Partial<Record<RccKey, RccAnswer>> = {};
    for (const it of (Array.isArray(r.latest.items) ? r.latest.items : []) as Array<Record<string, unknown>>) {
      const key = String(it.key);
      if (!RCC_KEYS.has(key) || typeof it.answer !== "string") continue;
      answers[key as RccKey] = {
        answer: it.answer,
        source: { documentId: typeof it.sourceDocumentId === "string" ? it.sourceDocumentId : null, ref: typeof it.sourceRef === "string" ? it.sourceRef : null, page: typeof it.sourcePage === "string" ? it.sourcePage : null },
        propertyScope: (typeof it.propertyScope === "string" ? it.propertyScope : null) as RccAnswer["propertyScope"],
      };
    }
    latest = {
      id: r.latest.id,
      versionNo: Number(r.latest.versionNo ?? 0),
      policyId: String(r.latest.policyId ?? ""),
      claimId: typeof r.latest.claimId === "string" ? r.latest.claimId : null,
      note: typeof r.latest.note === "string" ? r.latest.note : null,
      createdBy: typeof r.latest.createdBy === "string" ? r.latest.createdBy : null,
      createdAt: String(r.latest.createdAt ?? ""),
      answers,
    };
  }
  const versions = (Array.isArray(r.versions) ? r.versions : []).filter((v) => typeof v.id === "string").map((v) => ({
    id: String(v.id),
    versionNo: Number(v.versionNo ?? 0),
    createdBy: typeof v.createdBy === "string" ? v.createdBy : null,
    createdAt: String(v.createdAt ?? ""),
    answered: Number(v.answered ?? 0),
  }));
  return { latest, versions };
}

export interface ExpectedSubjectView {
  id: string;
  /** apólice a que pertence (presente quando lido das tabelas; a RPC de leitura já filtra por apólice) */
  policyId?: string;
  partyRole: PartyRole;
  expectation: "ESPERADO" | "NAO_ESPERADO";
  expectedName: string | null;
  expectedTaxId: string | null;
  sourceKind: SubjectSourceKind;
  sourceDocumentId: string | null;
  sourceRef: string | null;
  versionNo: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}
export interface ExpectedSubjectsLoad {
  current: ExpectedSubjectView[];
  history: ExpectedSubjectView[];
}

function mapSubject(o: Record<string, unknown>): ExpectedSubjectView | null {
  if (typeof o.id !== "string" || !SUBJECT_ROLES.some((r) => r.role === o.partyRole)) return null;
  return {
    id: o.id,
    partyRole: o.partyRole as PartyRole,
    expectation: o.expectation === "NAO_ESPERADO" ? "NAO_ESPERADO" : "ESPERADO",
    expectedName: typeof o.expectedName === "string" ? o.expectedName : null,
    expectedTaxId: typeof o.expectedTaxId === "string" ? o.expectedTaxId : null,
    sourceKind: (typeof o.sourceKind === "string" ? o.sourceKind : "OUTRO") as SubjectSourceKind,
    sourceDocumentId: typeof o.sourceDocumentId === "string" ? o.sourceDocumentId : null,
    sourceRef: typeof o.sourceRef === "string" ? o.sourceRef : null,
    versionNo: Number(o.versionNo ?? 0),
    note: typeof o.note === "string" ? o.note : null,
    createdBy: typeof o.createdBy === "string" ? o.createdBy : null,
    createdAt: String(o.createdAt ?? ""),
  };
}

export function mapExpectedSubjectsGet(raw: unknown): ExpectedSubjectsLoad {
  const r = (raw ?? {}) as { current?: unknown; history?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>).map(mapSubject).filter((x): x is ExpectedSubjectView => x !== null) : []);
  return { current: list(r.current), history: list(r.history) };
}

const SOURCE_KIND_LABEL: Record<string, string> = Object.fromEntries(SUBJECT_SOURCE_KINDS.map((k) => [k.value, k.label]));

/** Expectativas PERSISTIDAS -> entrada da auditoria de sujeitos (lib/insurance/subjects-audit). Sem registro = não conferido. */
export function toAuditExpected(current: ExpectedSubjectView[]): ExpectedSubjects {
  const expectedByRole: Partial<Record<PartyRole, ExpectedSubject>> = {};
  for (const s of current) {
    const via = [SOURCE_KIND_LABEL[s.sourceKind] ?? s.sourceKind, s.sourceRef].filter(Boolean).join(" — ");
    expectedByRole[s.partyRole] = { expectation: s.expectation, name: s.expectedName, taxId: s.expectedTaxId, sourceLabel: via || null };
  }
  return { expectedByRole };
}

// ------------------------------------------------------------------ erros
const EXTRA_MESSAGES: Record<string, string> = {
  SOURCE_REQUIRED: "Toda resposta ou expectativa exige a fonte (documento ou referência da cláusula). Nada foi gravado.",
  PROPERTY_SCOPE_REQUIRED: "Informe se o dano atinge bens de terceiros, a própria obra, ambos ou se é indefinido.",
  INVALID_ITEMS: "Há itens inválidos no formulário. Nada foi gravado.",
  INVALID_INPUT: "Algum campo está inválido. Nada foi gravado.",
  CLAIM_POLICY_MISMATCH: "O evento escolhido não pertence a esta apólice.",
};

export function mapPersistenceError(error: { message?: string | null; code?: string | null } | null | undefined): InsuranceActionError {
  const base = mapInsuranceError(error);
  if (base.code !== "UNKNOWN") return base;
  const m = /^\s*([A-Z][A-Z0-9_]{2,60})/.exec(error?.message ?? "");
  if (m && EXTRA_MESSAGES[m[1]]) return { code: m[1], message: EXTRA_MESSAGES[m[1]], conflict: false };
  return base;
}
