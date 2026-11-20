// Leitura (SOMENTE SELECT/RPC de leitura, sessão do usuário => RLS por projeto) dos fatos do dashboard dos QUATRO PILARES.
// Reutiliza as leituras/cálculos já existentes do Dashboard Executivo (getDashboardVisualData, getDashboardOperationalFacts,
// computeSsmaDashboardMetrics, summarizeRiskAlertCases, computeSlaActionsSummary via getDashboardVisualData): nenhum cálculo é duplicado;
// aqui só se encaminham linhas ao modelo puro (lib/pilares/model.ts). Cada leitura falha de forma isolada => null (SEM DADOS), nunca 0.

import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

import { getDashboardOperationalFacts } from "@/lib/dashboard/get-dashboard-operational-facts";
import { summarizeRiskAlertCases } from "@/lib/dashboard/risk-alert-cases-summary";
import { getDashboardVisualData } from "@/lib/dashboard-visual/get-dashboard-visual-data";
import type { FieldRecordRow } from "@/lib/ssma/field-records/field-record-view";
import { computeSsmaDashboardMetrics, type SsmaFormMetricsRow, type SsmaIncidentLinkRow } from "@/lib/ssma/dashboard-metrics";

import {
  buildPillarsDashboard,
  type ActionRow,
  type ClaimRow,
  type ComplaintRow,
  type ConsequenceRow,
  type InspectionRow,
  type InsuranceItemRow,
  type InsuranceTotals,
  type NcrRow,
  type NonQualityCostRow,
  type PillarsDashboard,
  type RecurrenceRow,
  type RepairRow,
  type SafetyFacts,
  type ScheduleFacts,
  type WarrantyRow,
} from "./model";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ROW_LIMIT = 5000;

async function safe<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function rows<T>(client: Client, table: string, columns: string, projectId: string): Promise<T[] | null> {
  return safe(async () => {
    const { data, error } = await client.from(table).select(columns).eq("project_id", projectId).limit(ROW_LIMIT);
    return error ? null : ((data ?? []) as unknown as T[]);
  });
}

async function countOf(client: Client, table: string, projectId: string): Promise<number | null> {
  return safe(async () => {
    const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
    return error ? null : (count ?? 0);
  });
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function numericMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Hoje (AAAA-MM-DD) no fuso do projeto — o mesmo critério do Dashboard Executivo. */
export function todayInProjectTimezone(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function loadSafety(client: Client, projectId: string, today: string): Promise<SafetyFacts | null> {
  return safe(async () => {
    const [forms, records, links] = await Promise.all([
      client.from("ssma_form_submissions").select("id,checklist_slug,occurred_at,field_values").eq("project_id", projectId).eq("status", "SUBMITTED"),
      client
        .from("ssma_field_records")
        .select("id,kind,category,description,location,occurred_at,client_created_at,received_at,risk_level,responsible_user_id,due_date,reported_by_user_id,ssma_corrective_actions(id,status,due_date,concluded_at,responsible_user_id)")
        .eq("project_id", projectId),
      client.from("ssma_incident_links").select("form_submission_id,field_record_id,decision").eq("project_id", projectId),
    ]);
    if (forms.error || records.error) return null;
    const m = computeSsmaDashboardMetrics({
      links: links.error ? [] : ((links.data ?? []) as SsmaIncidentLinkRow[]),
      forms: (forms.data ?? []) as unknown as SsmaFormMetricsRow[],
      fieldRecords: (records.data ?? []) as unknown as FieldRecordRow[],
      today,
    });
    return {
      hasData: m.hasData,
      occurrences: m.occurrences,
      accidentsWithLeave: m.accidentsWithLeave,
      criticalOpen: m.criticalOpen,
      openCorrectiveActions: m.openCorrectiveActions,
      overdueCorrectiveActions: m.overdueCorrectiveActions,
    };
  });
}

async function loadSchedule(client: Client, projectId: string): Promise<ScheduleFacts> {
  // Reuso: deadlineSummary (prorrogação solicitada) e slaSummary (ações vencidas) vêm do pacote do Dashboard Executivo.
  const visual = await safe(() => getDashboardVisualData(projectId, { range: "PROJECT" }));
  const wb = await safe(async () => {
    const { data, error } = await client
      .from("weekly_report_workbooks")
      .select("id,schedule_version_id,extracted_at")
      .eq("project_id", projectId)
      .order("extracted_at", { ascending: false })
      .limit(1);
    return error ? null : (data?.[0] ?? null);
  });
  const sheet = wb
    ? await safe(async () => {
        const { data, error } = await client.from("weekly_report_sheets").select("metrics").eq("workbook_id", wb.id).eq("category", "CURVA_S").maybeSingle();
        return error ? null : data;
      })
    : null;
  const metrics = asObject(sheet?.metrics);
  const physical = numericMetric(metrics?.actualAtCutoff) ?? numericMetric(metrics?.actualPercent) ?? numericMetric(metrics?.actualCumulative) ?? null;
  const versionId = typeof wb?.schedule_version_id === "string" ? wb.schedule_version_id : null;
  const activities = versionId
    ? await safe(async () => {
        const { data, error } = await client.from("schedule_activities").select("status,baseline_end,planned_end").eq("schedule_version_id", versionId).limit(ROW_LIMIT);
        return error ? null : ((data ?? []) as Array<{ status: string; baseline_end: string; planned_end: string }>);
      })
    : null;
  const deadline = visual?.deadlineSummary ?? null;
  return {
    baselineEndDate: deadline?.originalEndDate ?? null,
    requestedExtensionDays: deadline && deadline.requestedExtensionSourceCount > 0 ? deadline.requestedExtensionDays : null,
    physicalProgressPercent: physical,
    activities,
    overdueSlaActions: visual ? visual.slaSummary.overdue : null,
  };
}

export async function getPillarsDashboard(projectId: string): Promise<{ dashboard: PillarsDashboard; today: string }> {
  const client = await createSupabaseServerClient();
  const today = todayInProjectTimezone();

  const [schedule, safety, opFacts] = await Promise.all([
    loadSchedule(client, projectId),
    loadSafety(client, projectId, today),
    safe(() => getDashboardOperationalFacts(client, projectId, { isAdmin: false })),
  ]);

  const riskCases = opFacts?.riskCases ? summarizeRiskAlertCases(opFacts.riskCases) : null;

  const [ncrs, warranties, complaints, inspections, recurrences, repairs, actions, consequences, costs, claims, items, totals] = await Promise.all([
    rows<NcrRow>(client, "quality_ncrs", "id,code,title,state,criticality,reopen_count", projectId),
    rows<{ id: string; code: string; service_system: string; state: string; criticality: string; due_date: string | null; estimated_cost: unknown; actual_cost: unknown }>(client, "quality_warranty_cases", "id,code,service_system,state,criticality,due_date,estimated_cost,actual_cost", projectId),
    rows<ComplaintRow>(client, "quality_customer_complaints", "id,status", projectId),
    rows<InspectionRow>(client, "quality_inspections", "id,result", projectId),
    rows<RecurrenceRow>(client, "quality_recurrences", "id", projectId),
    rows<RepairRow>(client, "quality_warranty_repairs", "id,is_recurrence", projectId),
    rows<ActionRow>(client, "quality_corrective_actions", "id,status,due_date", projectId),
    rows<ConsequenceRow>(client, "quality_consequences", "id,ncr_id,warranty_case_id,pillar,severity,status,description,source_ref", projectId),
    rows<{ id: string; category: string; estimated_amount: unknown; actual_amount: unknown }>(client, "quality_nonquality_costs", "id,category,estimated_amount,actual_amount", projectId),
    rows<{ id: string; stage: string; claimed_amount: unknown }>(client, "insurance_claims", "id,stage,claimed_amount", projectId),
    safe(async () => {
      const { data, error } = await client.rpc("insurance_dashboard_items", { p_project_id: projectId, p_today: today, p_horizon_days: 30 });
      return error ? null : ((data ?? []) as InsuranceItemRow[]);
    }),
    loadInsuranceTotals(client, projectId),
  ]);

  const dashboard = buildPillarsDashboard({
    today,
    schedule,
    safety,
    openRiskAlerts: riskCases ? { critical: riskCases.openBySeverity.CRITICA, high: riskCases.openBySeverity.ALTA, total: riskCases.open } : null,
    quality: {
      ncrs,
      warranties: warranties ? warranties.map((w): WarrantyRow => ({ ...w, estimated_cost: num(w.estimated_cost), actual_cost: num(w.actual_cost) })) : null,
      complaints,
      inspections,
      recurrences,
      repairs,
      actions,
      consequences,
      nonQualityCosts: costs ? costs.map((c): NonQualityCostRow => ({ id: c.id, category: c.category, estimated_amount: num(c.estimated_amount), actual_amount: num(c.actual_amount) })) : null,
    },
    insurance: { items, claims: claims ? claims.map((c): ClaimRow => ({ id: c.id, stage: c.stage, claimed_amount: num(c.claimed_amount) })) : null, totals },
  });
  return { dashboard, today };
}

async function loadInsuranceTotals(client: Client, projectId: string): Promise<InsuranceTotals | null> {
  const [policies, bank, other, endorsements, advances, claims] = await Promise.all([
    countOf(client, "insurance_policies", projectId),
    countOf(client, "bank_guarantees", projectId),
    countOf(client, "other_guarantees", projectId),
    countOf(client, "insurance_endorsements", projectId),
    countOf(client, "insurance_advances", projectId),
    countOf(client, "insurance_claims", projectId),
  ]);
  if ([policies, bank, other, endorsements, advances, claims].some((v) => v === null)) return null;
  return { instruments: (policies ?? 0) + (bank ?? 0) + (other ?? 0), endorsements: endorsements ?? 0, advances: advances ?? 0, claims: claims ?? 0 };
}
