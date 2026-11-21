// Fonte de caso de risco "EMAIL" (Fase 5 / Frente D) — puro, sem I/O.
// Normaliza `email_risk_signals` (Frente B) + a classificação da mensagem (`email_message_classifications`) em
// RiskCaseInput. O motor existente (plan-risk-alerts / SLAs da Matriz / ações / experts) passa a tratar o e-mail como
// mais uma fonte, sem caminho paralelo.
//
// Regras (CLAUDE.md 11/12 + briefing Fase 5):
//   - SÓ sinais com is_indication = true, de mensagem VINCULADA a um projeto (project_link_status = LINKED) e ANALISADA.
//     Sem classificação, candidata, ambígua ou não vinculada => NÃO vira alerta (fail-closed; nunca presume projeto).
//   - INDÍCIO ≠ inadimplemento comprovado: um sinal não confirmado nunca passa de ALTO (CRÍTICO exige confirmed = true).
//   - Nível por regra determinística do tipo do sinal; tipo desconhecido => REVIEW_REQUIRED (revisão humana, nunca default).
//   - Conteúdo do e-mail de terceiros é DADO NÃO CONFIÁVEL: sanitizado, truncado, e qualquer instrução embutida
//     (detectEmbeddedInstructions ou injection_flag) => REVIEW_REQUIRED e o trecho NÃO é reproduzido no alerta.
//   - Fato (trecho do e-mail), inferência (regra/rule_version) e recomendação ficam separados no texto.
//   - Sem dado de impacto => "SEM DADOS" (nunca valor/prazo/cláusula inventado).
//   - A mensagem original e a cláusula usada são REFERENCIADAS (originPath, reference), nunca copiadas/alteradas.
//   - Um caso por sinal (source_id = id do sinal): mensagem repetida/duas caixas já é deduplicada pela Frente B/A.

import { createHash } from "node:crypto";

import { detectEmbeddedInstructions } from "@/lib/ai/security/external-content";
import type { SlaArea } from "@/lib/sla/types";

import type { RiskCaseInput, RiskCaseLevel } from "./types";

export type EmailSignalPillar = "PRAZO" | "CUSTO" | "SEGURANCA" | "QUALIDADE" | "JURIDICO";

/** Linha de email_risk_signals (contrato da Frente B) já unida à classificação da mensagem. */
export interface EmailRiskSignalRow {
  id: string;
  email_id: string;
  project_id: string | null;
  pillar: EmailSignalPillar | string;
  signal_kind: string;
  summary: string | null;
  evidence_excerpt: string | null;
  evidence_ref: string | null;
  is_indication: boolean;
  confirmed: boolean;
  quantified_impact: unknown;
  created_at: string;
  /** Classificação da mesma mensagem (email_message_classifications); ausente => sinal ignorado. */
  classification?: {
    project_link_status: string;
    status: string;
    officiality: string | null;
    authority_check: string | null;
    clause_ref: string | null;
    rule_version: string | null;
    injection_flag: boolean;
  } | null;
}

/** Pilar => área da Matriz de SLA. Não há área "Qualidade" na Matriz: Qualidade responde pela ENGENHARIA (decisão documentada). */
export const EMAIL_PILLAR_AREA: Record<EmailSignalPillar, SlaArea> = {
  PRAZO: "PLANEJAMENTO",
  CUSTO: "COMERCIAL",
  SEGURANCA: "ESG_SSMA",
  QUALIDADE: "ENGENHARIA",
  JURIDICO: "JURIDICO",
};

const PILLAR_LABEL: Record<EmailSignalPillar, string> = {
  PRAZO: "Prazo",
  CUSTO: "Custo",
  SEGURANCA: "Segurança",
  QUALIDADE: "Qualidade",
  JURIDICO: "Jurídico",
};

// Seguros, garantias e sinistros respondem pelo Jurídico (a leitura de cobertura é jurídica — expert-topics.ts),
// qualquer que seja o pilar atribuído pela classificação.
const LEGAL_KIND = /SEGURO|APOLICE|SINISTRO|GARANTIA|FIANCA|CAUCAO|ENDOSSO/;

// Regras por tipo do sinal (taxonomia da Frente B, comparada sem acento/caixa). Ordem = precedência.
const KIND_LEVEL_RULES: ReadonlyArray<readonly [RegExp, RiskCaseLevel]> = [
  [/PARALISACAO|SUSPENSAO|ACIDENTE|EMBARGO/, "CRITICAL"],
  [/CANCELAMENTO|DESCUMPRIMENTO|PLEITO|FORA_?(DA_)?COMPETENCIA|OUT_?OF_?SCOPE|NOTIFICACAO|RNC|ATRASO|SINISTRO|FORMAL_?CHANGE/, "HIGH"],
  [/REAJUSTE|AUMENTO|RENEGOCIACAO|ESCASSEZ|SUBSTITUICAO|DEFEITO|QUALIDADE|CONFLITO|RECLAMACAO|MONTAGEM/, "MEDIUM"],
];

const MAX_TEXT = 240;
// remove controles (inclui CR/LF/NUL) e marcas bidi/zero-width de texto de terceiros
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]", "g");

function norm(value: string): string {
  return value.normalize("NFD").replace(new RegExp("[\u0300-\u036f]", "g"), "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Texto de terceiros => uma linha, sem controles/bidi, com limite. Nunca interpretado como instrução. */
export function sanitizeThirdPartyText(value: string | null | undefined, max: number = MAX_TEXT): string {
  const clean = (value ?? "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function isPillar(value: string): value is EmailSignalPillar {
  return value in EMAIL_PILLAR_AREA;
}

export function emailSignalArea(row: Pick<EmailRiskSignalRow, "pillar" | "signal_kind">): SlaArea | null {
  if (LEGAL_KIND.test(norm(row.signal_kind))) return "JURIDICO";
  return isPillar(row.pillar) ? EMAIL_PILLAR_AREA[row.pillar] : null;
}

/** Nível por regra; sinal não confirmado nunca excede ALTO (indício ≠ fato comprovado). */
export function emailSignalLevel(row: Pick<EmailRiskSignalRow, "signal_kind" | "confirmed">): RiskCaseLevel {
  const kind = norm(row.signal_kind);
  const rule = KIND_LEVEL_RULES.find(([pattern]) => pattern.test(kind));
  if (!rule) return "REVIEW_REQUIRED";
  const level = rule[1];
  return level === "CRITICAL" && !row.confirmed ? "HIGH" : level;
}

function impactText(value: unknown): string {
  if (value === null || value === undefined) return "Impacto quantificado: SEM DADOS";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length === 0 || record.status === "SEM_DADOS" || record.semDados === true) return "Impacto quantificado: SEM DADOS";
    return `Impacto quantificado (conforme sinal registrado): ${sanitizeThirdPartyText(JSON.stringify(record), 200)}`;
  }
  return "Impacto quantificado: SEM DADOS";
}

export function isEligibleEmailSignal(row: EmailRiskSignalRow): boolean {
  const c = row.classification;
  return Boolean(row.is_indication && row.project_id && c && c.project_link_status === "LINKED" && c.status === "ANALYZED" && emailSignalArea(row));
}

export function collectEmailRiskCases(rows: EmailRiskSignalRow[]): RiskCaseInput[] {
  return rows.filter(isEligibleEmailSignal).map((row) => {
    const c = row.classification!;
    const area = emailSignalArea(row)!;
    const pillar = isPillar(row.pillar) ? PILLAR_LABEL[row.pillar] : row.pillar;
    const excerpt = sanitizeThirdPartyText(row.evidence_excerpt);
    const summaryText = sanitizeThirdPartyText(row.summary);
    const injected = Boolean(c.injection_flag) || detectEmbeddedInstructions(`${row.summary ?? ""}\n${row.evidence_excerpt ?? ""}`).length > 0;
    const level: RiskCaseLevel = injected ? "REVIEW_REQUIRED" : emailSignalLevel(row);
    const kindLabel = sanitizeThirdPartyText(row.signal_kind.replace(/_/g, " ").toLowerCase(), 80);
    const authority = c.authority_check && c.authority_check !== "NOT_APPLICABLE" ? ` · Autoridade: ${c.authority_check}` : "";
    const clause = c.clause_ref ? ` · Cláusula usada: ${sanitizeThirdPartyText(c.clause_ref, 80)}` : "";
    const summary = injected
      ? "E-mail com texto que parece instrução (possível prompt injection). O conteúdo NÃO foi reproduzido nem obedecido; revisão humana obrigatória."
      : `INDÍCIO (não comprovado) · FATO no e-mail: "${excerpt || summaryText || "SEM DADOS"}" · INFERÊNCIA da regra ${c.rule_version ?? "SEM DADOS"}: ${summaryText || "SEM DADOS"}.`;
    return {
      sourceType: "EMAIL",
      sourceId: row.id,
      area,
      riskLevel: level,
      title: `E-mail: indício de risco de ${pillar} — ${kindLabel}`,
      summary,
      impact: `${impactText(row.quantified_impact)}${authority}${clause}${c.officiality ? ` · Oficialidade: ${c.officiality}` : ""}`,
      recommendation: "RECOMENDAÇÃO: conferir a mensagem original e confirmar ou descartar o indício; nenhuma providência contratual decorre só do e-mail.",
      fingerprint: createHash("sha256")
        .update(JSON.stringify({ level, pillar: row.pillar, kind: row.signal_kind, confirmed: row.confirmed, authority: c.authority_check, injected, rule: c.rule_version }))
        .digest("hex")
        .slice(0, 32),
      originPath: `documentos/emails/${row.email_id}`,
      closed: false,
      reference: `E-mail ${row.email_id.slice(0, 8)} · ${pillar} · ${row.evidence_ref ? sanitizeThirdPartyText(row.evidence_ref, 60) : "sem referência"}`,
    } satisfies RiskCaseInput;
  });
}
