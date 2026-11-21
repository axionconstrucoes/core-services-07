// ACEITE DO CLIENTE da garantia — INFORMADO x COMPROVADO (Fase 4 / B). Puro, sem I/O.
// Espelha a migration 20261125100000 (quality_transition_blockers + quality_warranty_acceptance_prove). O banco é a autoridade:
// este módulo só antecipa na tela o que o banco vai recusar e explica o motivo.
//   INFORMADO  = lançado por usuário interno (nome + data + evidência do caso). NÃO libera o encerramento.
//   COMPROVADO = manifestação do cliente: evidência (e-mail/documento/ata ingerido, FATO) + hash SHA-256 + manifestante EXTERNO
//                (nome + e-mail de contato) + data não anterior ao último reparo. SÓ este libera o encerramento.
//   LEGADO     = accepted_at preenchido sem classificação (anterior à regra): vale para o que JÁ está encerrado; não libera caso aberto.

export type AcceptanceStatus = "NENHUM" | "INFORMADO" | "COMPROVADO";
export type AcceptanceDisplay = AcceptanceStatus | "LEGADO";

export const PROOF_SOURCE_TYPES = ["EMAIL", "DOCUMENTO"] as const;

export interface AcceptanceFacts {
  acceptanceStatus: string | null | undefined;
  acceptedAt: string | null | undefined;
  acceptedByName: string | null | undefined;
  state: string;
}

const present = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

/** Situação para exibição: "LEGADO" = aceite anterior à regra (status NENHUM com data e nome). */
export function acceptanceDisplay(f: AcceptanceFacts): AcceptanceDisplay {
  if (f.acceptanceStatus === "COMPROVADO") return "COMPROVADO";
  if (f.acceptanceStatus === "INFORMADO") return "INFORMADO";
  return present(f.acceptedAt) && present(f.acceptedByName) ? "LEGADO" : "NENHUM";
}

/**
 * Bloqueio de encerramento por aceite (espelho exato de quality_transition_blockers para ENCERRADA):
 * COMPROVADO libera; garantia JÁ encerrada com aceite legado continua válida; aceite informado/legado em caso aberto => NOT_PROVEN;
 * sem aceite => REQUIRED.
 */
export function acceptanceBlocker(f: AcceptanceFacts): "CUSTOMER_ACCEPTANCE_REQUIRED" | "CUSTOMER_ACCEPTANCE_NOT_PROVEN" | null {
  const d = acceptanceDisplay(f);
  if (d === "COMPROVADO") return null;
  if (d === "LEGADO" && f.state === "ENCERRADA") return null;
  if (d === "INFORMADO" || d === "LEGADO") return "CUSTOMER_ACCEPTANCE_NOT_PROVEN";
  return "CUSTOMER_ACCEPTANCE_REQUIRED";
}

export const isSha256Hex = (v: string): boolean => /^[0-9a-f]{64}$/.test(v);
export const isPlausibleEmail = (v: string): boolean => v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

const isRealDay = (v: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

function addDays(day: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

export interface ProofInput {
  acceptedAt: string;
  manifestantName: string;
  manifestantOrganization: string | null;
  manifestantContact: string;
  evidenceId: string;
  sourceHash: string;
  note: string | null;
}

export interface ProofContext {
  /** Dia de hoje (AAAA-MM-DD) — a data da manifestação não pode ser futura (tolerância de 1 dia, como o banco). */
  today: string;
  /** Dia do último reparo executado (AAAA-MM-DD) ou null. */
  lastRepairDay: string | null;
  /** E-mails de membros ativos do projeto + do registrante. */
  internalEmails: readonly string[];
  /** Nome do registrante (comparado normalizado). */
  registrantName: string | null;
  /** undefined = não verificar a evidência (a RPC verifica no banco); null = evidência não encontrada. */
  evidence?: { id: string; epistemic: string; sourceType: string } | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

export type ProofResult = { ok: true; input: ProofInput } | { ok: false; codes: string[]; messages: string[] };

const PROOF_MESSAGES: Record<string, string> = {
  INVALID_DATA: "Informe o nome do manifestante (2 a 200 caracteres) e uma data válida e não futura.",
  MANIFESTANT_CONTACT_REQUIRED: "Informe o e-mail de contato do manifestante externo (formato válido).",
  SOURCE_HASH_REQUIRED: "Informe o hash SHA-256 (64 caracteres hexadecimais) do documento/e-mail ingerido.",
  EVIDENCE_REQUIRED: "Selecione a evidência (e-mail, documento ou ata ingerida) que comprova a manifestação do cliente.",
  EVIDENCE_INVALID: "A prova do aceite deve ser uma evidência FATO do tipo e-mail ou documento/ata, do próprio caso.",
  MANIFESTANT_IS_INTERNAL: "O manifestante não pode ser quem registra nem membro do projeto: um lançamento interno não substitui a manifestação do cliente.",
  ACCEPTANCE_BEFORE_REPAIR: "A manifestação do cliente é anterior ao último reparo executado: o aceite deve ser posterior ao reparo.",
};

/** Validação antecipada (a RPC repete tudo no banco). Devolve TODOS os problemas, sem inventar valores. */
export function validateProofInput(raw: Record<string, string | undefined | null>, ctx: ProofContext): ProofResult {
  const t = (k: string) => (raw[k] ?? "").trim();
  const codes: string[] = [];
  const acceptedAt = t("acceptedAt");
  const name = t("manifestantName");
  const org = t("manifestantOrganization");
  const contact = t("manifestantContact").toLowerCase();
  const hash = t("sourceHash").toLowerCase();
  const evidenceId = t("evidenceId");
  const note = t("note");
  if (name.length < 2 || name.length > 200 || !isRealDay(acceptedAt) || acceptedAt > addDays(ctx.today, 1) || org.length > 200 || note.length > 2000) codes.push("INVALID_DATA");
  if (!isPlausibleEmail(contact)) codes.push("MANIFESTANT_CONTACT_REQUIRED");
  if (!isSha256Hex(hash)) codes.push("SOURCE_HASH_REQUIRED");
  if (!evidenceId) codes.push("EVIDENCE_REQUIRED");
  else if (ctx.evidence !== undefined && (!ctx.evidence || ctx.evidence.id !== evidenceId || ctx.evidence.epistemic !== "FATO" || !(PROOF_SOURCE_TYPES as readonly string[]).includes(ctx.evidence.sourceType))) codes.push("EVIDENCE_INVALID");
  if (isPlausibleEmail(contact) && ctx.internalEmails.map((e) => e.toLowerCase()).includes(contact)) codes.push("MANIFESTANT_IS_INTERNAL");
  else if (name.length >= 2 && ctx.registrantName && norm(ctx.registrantName) === norm(name)) codes.push("MANIFESTANT_IS_INTERNAL");
  if (isRealDay(acceptedAt) && ctx.lastRepairDay && acceptedAt < ctx.lastRepairDay) codes.push("ACCEPTANCE_BEFORE_REPAIR");
  if (codes.length) return { ok: false, codes, messages: codes.map((c) => PROOF_MESSAGES[c] ?? c) };
  return { ok: true, input: { acceptedAt, manifestantName: name, manifestantOrganization: org || null, manifestantContact: contact, evidenceId, sourceHash: hash, note: note || null } };
}

export const ACCEPTANCE_DISPLAY_LABELS: Record<AcceptanceDisplay, string> = {
  NENHUM: "Sem aceite (SEM DADOS)",
  INFORMADO: "Aceite INFORMADO por usuário interno — não comprovado",
  COMPROVADO: "Aceite COMPROVADO (manifestação do cliente com evidência e hash)",
  LEGADO: "Aceite legado (anterior à regra do aceite comprovado) — não libera caso aberto",
};
