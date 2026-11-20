// Trilha de auditoria de CADA consulta a um Expert de IA (Lote 4; migration 20261121174000_ai_consult_audit).
//
// Registra quem, em que obra, qual Expert, a pergunta, as fontes ENVIADAS ao provedor (identificadores — nunca o
// texto dos documentos), o resultado resumido (severidade, confiança, revisão humana sempre exigida) e tokens/custo
// quando o provedor informar — nunca inventados. A gravação é feita DEPOIS da chamada ao provedor, pelo servidor,
// via RPC SECURITY DEFINER; uma falha da auditoria nunca descarta a resposta já gerada (vira aviso no log), e o
// provedor nunca é chamado sem a reserva do limite (isso continua em quota-gated-provider.ts).
//
// Puro quanto à montagem da entrada (buildConsultAuditEntry); a gravação recebe o cliente Supabase por injeção.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiProviderCurationRequest, AiProviderQueryRequest, AiProviderRequest, AiProviderResponse } from "../providers/types";
import type { AiConsultKind } from "../alert-consult/consult-quota";

export interface ConsultAuditSource {
  type: string;
  id: string;
}

export interface ConsultAuditEntry {
  expertId: string;
  question: string;
  scope: string | null;
  sources: ConsultAuditSource[];
  outcome: "OK" | "PROVIDER_ERROR";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  confidence: number | null;
  resultSummary: Record<string, unknown>;
  providerId: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Quem recebe a entrada de auditoria (gravação best-effort; nunca lança). */
export type ConsultAuditSink = (entry: ConsultAuditEntry) => Promise<void>;

export type AnyProviderRequest = AiProviderRequest | AiProviderQueryRequest | AiProviderCurationRequest;

const MAX_SOURCES = 200;
const SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function pushSource(out: Map<string, ConsultAuditSource>, type: string, id: unknown) {
  if (typeof id !== "string" || id.length === 0 || out.size >= MAX_SOURCES) return;
  out.set(`${type}:${id}`, { type, id });
}

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

/** Identificadores das fontes que o servidor enviou ao provedor (evento, evidências, cláusulas, e-mails, notas...). */
export function extractContextSources(request: AnyProviderRequest): ConsultAuditSource[] {
  const out = new Map<string, ConsultAuditSource>();
  const contexts: unknown[] = [];
  if ("eventContext" in request) contexts.push(request.eventContext, request.projectContext);
  if ("context" in request) contexts.push(request.context);
  for (const ctx of contexts) {
    const record = asRecord(ctx);
    if (!record) continue;
    pushSource(out, "event", asRecord(record.event)?.id);
    for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) pushSource(out, key, asRecord(item)?.id);
    }
  }
  if ("positions" in request) {
    for (const p of request.positions) pushSource(out, "expert-position", p.expertId);
  }
  return Array.from(out.values());
}

function questionOf(request: AnyProviderRequest): string {
  if ("question" in request) return request.question;
  if ("situationSummary" in request) return request.situationSummary;
  return `${request.analysisType}`;
}

function summarizeOutput(output: unknown): Pick<ConsultAuditEntry, "severity" | "confidence" | "resultSummary"> {
  const record = asRecord(output);
  if (!record || Array.isArray(output)) return { severity: null, confidence: null, resultSummary: {} };
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  const severity = typeof record.severity === "string" && SEVERITIES.has(record.severity) ? (record.severity as ConsultAuditEntry["severity"]) : null;
  const confidence = typeof record.confidence === "number" && record.confidence >= 0 && record.confidence <= 1 ? record.confidence : null;
  return { severity, confidence, resultSummary: { itemCounts: counts, requiresHumanReview: true } };
}

/** Monta a entrada de auditoria de uma chamada ao provedor (resposta OU erro). Puro. */
export function buildConsultAuditEntry(
  expertId: string,
  request: AnyProviderRequest,
  providerId: string,
  response: AiProviderResponse | null
): ConsultAuditEntry {
  const summary = response ? summarizeOutput(response.output) : { severity: null, confidence: null, resultSummary: {} };
  return {
    expertId,
    question: questionOf(request),
    scope: "scope" in request ? request.scope : null,
    sources: extractContextSources(request),
    outcome: response ? "OK" : "PROVIDER_ERROR",
    severity: summary.severity,
    confidence: summary.confidence,
    resultSummary: summary.resultSummary,
    providerId: response?.providerId ?? providerId,
    model: response?.model ?? null,
    inputTokens: response?.usage?.inputTokens ?? null,
    outputTokens: response?.usage?.outputTokens ?? null,
  };
}

function toRpcParams(entry: ConsultAuditEntry) {
  return {
    p_expert_id: entry.expertId,
    p_question: entry.question,
    p_scope: entry.scope,
    p_sources: entry.sources,
    p_outcome: entry.outcome,
    p_severity: entry.severity,
    p_confidence: entry.confidence,
    p_result_summary: entry.resultSummary,
    p_provider_id: entry.providerId,
    p_model: entry.model,
    p_input_tokens: entry.inputTokens,
    p_output_tokens: entry.outputTokens,
  };
}

/** Sessão do usuário (auth.uid()). */
export function sessionAuditSink(supabase: SupabaseClient, projectId: string, kind: AiConsultKind, subjectId: string): ConsultAuditSink {
  return async (entry) => {
    try {
      const { error } = await supabase.rpc("ai_consult_audit_record", { p_project_id: projectId, p_kind: kind, p_subject_id: subjectId, ...toRpcParams(entry) });
      if (error) console.warn("[ai-audit] falha ao gravar a auditoria da consulta:", error.message);
    } catch {
      console.warn("[ai-audit] falha ao gravar a auditoria da consulta.");
    }
  };
}

/**
 * Anexa a trilha de auditoria à função de reserva (a mesma função continua sendo a reserva). O provedor com limite
 * (quota-gated-provider.ts) lê `reserve.audit` — assim cada caminho decide a trilha onde cria a reserva, sem mudar
 * as assinaturas intermediárias.
 */
export function withAuditSink<F extends (...args: never[]) => unknown>(reserve: F, audit: ConsultAuditSink): F & { audit: ConsultAuditSink } {
  return Object.assign(reserve, { audit });
}

export function auditSinkOf(reserve: unknown): ConsultAuditSink | undefined {
  const audit = (reserve as { audit?: unknown } | null | undefined)?.audit;
  return typeof audit === "function" ? (audit as ConsultAuditSink) : undefined;
}

/** Sem sessão (service_role): solicitante explícito (ciclo de risco, curadoria automática). */
export function actorAuditSink(
  adminClient: SupabaseClient,
  actorUserId: string | null | undefined,
  projectId: string,
  kind: "RISK_CYCLE" | "AUTOMATIC_CURATION",
  subjectId: string
): ConsultAuditSink {
  return async (entry) => {
    if (!actorUserId) return;
    try {
      const { error } = await adminClient.rpc("ai_consult_audit_record_for_actor", {
        p_actor_user_id: actorUserId,
        p_project_id: projectId,
        p_kind: kind,
        p_subject_id: subjectId,
        ...toRpcParams(entry),
      });
      if (error) console.warn("[ai-audit] falha ao gravar a auditoria da consulta:", error.message);
    } catch {
      console.warn("[ai-audit] falha ao gravar a auditoria da consulta.");
    }
  };
}
