import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadEventAlertContexts } from "@/lib/alerts/load-event-alert-context";
import { DELIVERY_ITEM_COLUMNS, toDeliveryItem, type DeliveryItemRow } from "@/lib/delivery/delivery-mappers";
import { DELIVERY_PHASE_LABELS } from "@/lib/delivery/delivery-items";

import type { AlertConsultSource, AlertConsultSubject } from "./run-alert-consult";
import type { AlertConsultSubjectKind } from "./specialties";

const NOT_DEFINED = "A definir";

/**
 * Carrega o alerta SOMENTE da obra informada, com o cliente do USUÁRIO (RLS): quem não participa
 * da obra, ou um id de outra obra, resulta em null. Nada é gravado. Links são caminhos relativos
 * do ACC (exigem login e participação na obra).
 */
export async function loadAlertConsultSubject(
  supabase: SupabaseClient,
  projectId: string,
  subject: AlertConsultSubjectKind,
  id: string
): Promise<AlertConsultSubject | null> {
  if (subject === "risco") return loadRiskSubject(supabase, projectId, id);
  return subject === "evento" ? loadEventSubject(supabase, projectId, id) : loadDeliverySubject(supabase, projectId, id);
}

async function loadEventSubject(supabase: SupabaseClient, projectId: string, eventId: string): Promise<AlertConsultSubject | null> {
  const { data: event } = await supabase
    .from("contract_events")
    .select("id,project_id,title")
    .eq("id", eventId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!event) return null;

  const contexts = await loadEventAlertContexts(supabase, [eventId], "");
  const context = contexts.get(eventId);
  const eventHref = `/${projectId}/ledger/${eventId}`;

  const sources: AlertConsultSource[] = [{ kind: "EVENTO", label: event.title as string, href: eventHref }];
  sources.push(
    context?.clause
      ? { kind: "CLAUSULA", label: context.clause.label, href: eventHref, note: "vínculo aprovado evento↔cláusula" }
      : { kind: "CLAUSULA", label: "Cláusula impactada", href: null, note: "Pendente de confirmação" }
  );
  for (const item of context?.evidence ?? []) {
    if (typeof item === "string") sources.push({ kind: "EVIDENCIA", label: item, href: null, note: "Pendente de confirmação" });
    else if (item.kind === "OTHER") sources.push({ kind: "EVIDENCIA", label: `${item.sourceTypeLabel}: ${item.label}`, href: item.url });
    else sources.push({ kind: "EVIDENCIA", label: item.subject, href: item.url, note: "e-mail" });
  }

  return {
    projectId,
    subject: "evento",
    id: eventId,
    title: event.title as string,
    projectName: context?.projectName ?? "Obra",
    scope: "EVENT",
    contextText: null,
    sources,
  };
}

/**
 * Alerta de RISCO (risk_alert_cases): contexto AUTORIZADO = só os campos do próprio caso (título, área, risco,
 * estado, resumo, impacto, recomendação). Cliente do usuário (RLS) + filtro por obra: id de outra obra = null.
 * Somente leitura: a consulta nunca altera estado, responsável, prazo, evidência nem escalonamento.
 */
async function loadRiskSubject(supabase: SupabaseClient, projectId: string, caseId: string): Promise<AlertConsultSubject | null> {
  const [{ data: row }, { data: project }] = await Promise.all([
    supabase
      .from("risk_alert_cases")
      .select("id,project_id,title,summary,impact,recommendation,risk_level,area,reference,state,visible_code")
      .eq("id", caseId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
  ]);
  if (!row || !project) return null;

  const lines = [
    `Alerta de risco: ${row.title as string}`,
    `Grau de risco: ${row.risk_level as string}`,
    `Área: ${row.area as string}`,
    `Estado vigente: ${row.state as string}`,
    `Origem: ${(row.reference as string | null) ?? NOT_DEFINED}`,
    `Resumo: ${(row.summary as string | null)?.trim() || NOT_DEFINED}`,
    `Impacto: ${(row.impact as string | null)?.trim() || NOT_DEFINED}`,
    `Recomendação registrada: ${(row.recommendation as string | null)?.trim() || "nenhuma"}`,
  ];

  return {
    projectId,
    subject: "risco",
    id: caseId,
    title: row.title as string,
    projectName: project.name as string,
    scope: "PROJECT",
    contextText: lines.join("\n"),
    sources: [{ kind: "ALERTA", label: `${row.title as string} (${(row.visible_code as string | null) ?? "sem código"})`, href: `/${projectId}/alertas/${caseId}` }],
  };
}

async function loadDeliverySubject(supabase: SupabaseClient, projectId: string, itemId: string): Promise<AlertConsultSubject | null> {
  const [{ data: row }, { data: project }] = await Promise.all([
    supabase.from("project_delivery_items").select(DELIVERY_ITEM_COLUMNS).eq("id", itemId).eq("project_id", projectId).maybeSingle(),
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
  ]);
  if (!row || !project) return null;

  const item = toDeliveryItem(row as unknown as DeliveryItemRow);
  const lines = [
    `Providência: ${item.title}`,
    `Fase: ${DELIVERY_PHASE_LABELS[item.phase]}`,
    `Situação registrada: ${item.status}`,
    `Data limite: ${item.deadline ?? NOT_DEFINED}`,
    `Prazo interno: ${item.internalDeadline ?? NOT_DEFINED}`,
    `Risco registrado: ${item.risk ?? NOT_DEFINED}`,
    `Aplicabilidade/responsabilidade confirmadas por pessoa: ${item.applicabilityConfirmed ? "sim" : "não"}`,
    `Evidência registrada: ${item.evidence?.trim() || "nenhuma"}`,
    `Justificativa registrada: ${item.justification?.trim() || "nenhuma"}`,
  ];

  return {
    projectId,
    subject: "providencia",
    id: itemId,
    title: item.title,
    projectName: project.name as string,
    scope: "PROJECT",
    contextText: lines.join("\n"),
    sources: [
      { kind: "PROVIDENCIA", label: item.title, href: `/${projectId}/providencias` },
      ...(item.evidence?.trim()
        ? [{ kind: "EVIDENCIA" as const, label: item.evidence.trim(), href: `/${projectId}/providencias`, note: "evidência registrada na providência" }]
        : [{ kind: "EVIDENCIA" as const, label: "Evidência da providência", href: null, note: "Pendente de confirmação" }]),
    ],
  };
}
