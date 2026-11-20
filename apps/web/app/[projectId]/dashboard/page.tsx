import { formatAdditivesMil, resolveAdditivesDisplay } from "@/lib/dashboard/additives-display";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  HardHat,
  MailCheck,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { computeClimateImpact, computeElapsedDays } from "@/lib/dashboard/elapsed-and-climate";
import { resolveEmailDisplayStatus, resolveEmailPipelineStages, type EmailStageState } from "@/lib/dashboard/email-pipeline-stages";
import { getDashboardOperationalFacts } from "@/lib/dashboard/get-dashboard-operational-facts";
import { resolveDashboardRiskLevel, summarizeRiskAlertCases } from "@/lib/dashboard/risk-alert-cases-summary";
import { computeSlaEscalationBreakdown } from "@/lib/dashboard/sla-escalation-breakdown";
import { baselineStage, mppFileStage, scheduleUpdatedStage, sheetStage, weeklyReportStage } from "@/lib/dashboard/weekly-planning-stages";
import type { EsgSummary } from "@/lib/dashboard-visual/compute-esg-summary";
import { getDashboardVisualData } from "@/lib/dashboard-visual/get-dashboard-visual-data";
import { getEvents } from "@/lib/data";
import { formatCurrency, formatDateTime } from "@/lib/labels";
import type { FieldRecordRow } from "@/lib/ssma/field-records/field-record-view";
import { computeSsmaDashboardMetrics, type SsmaFormMetricsRow, type SsmaIncidentLinkRow } from "@/lib/ssma/dashboard-metrics";
import { resolveSystemStatus } from "@/lib/ui/resolve-system-status";

export const metadata: Metadata = { title: "Dashboard" };

type MetricValue = number | string | null;

function ExecutiveKpi({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex min-h-[64px] flex-col items-center justify-center rounded-[7px] border border-[#263b5c] bg-[#182941] px-3 py-1 text-center">
      <div className="flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-[0.04em] text-[#c9d6e8]">
        <Icon className="size-3.5" />
        {label}
      </div>

      <div className="flex min-h-7 items-center justify-center text-center text-xl font-normal leading-none text-white">
        {compactStatus(value)}
      </div>

      {subtitle ? <div className="text-[11px] leading-tight text-[#b8c7dc]">{subtitle}</div> : null}
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[7px] border border-[#263b5c] bg-[#182941] ${className}`}>
      <div className="border-b border-[#263b5c] px-2.5 py-1">
        <h2 className="text-[15px] font-medium tracking-[0.005em] text-white">{title}</h2>
      </div>

      <div className="px-2.5 py-1">{children}</div>
    </section>
  );
}

function StatusLine({
  label,
  value,
  status = "ok",
}: {
  label: string;
  value: React.ReactNode;
  status?: "ok" | "warning" | "error" | "neutral";
}) {
  const dot =
    status === "ok"
      ? "bg-emerald-400"
      : status === "warning"
        ? "bg-amber-400"
        : status === "error"
          ? "bg-red-400"
          : "bg-slate-400";

  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] py-px last:border-b-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="break-words text-[12px] font-normal leading-[18px] text-white">{label}</span>
      </div>

      <span className="shrink-0 whitespace-nowrap text-right text-[13px] font-normal text-white">{compactStatus(value)}</span>
    </div>
  );
}

function EsgObligationsBlock({ projectId, summary }: { projectId: string; summary: EsgSummary }) {
  const hasObligations = summary.occurrences > 0;
  const cells: Array<{ label: string; filtro: string; value: number; tone: "ok" | "warning" | "error" | "neutral" }> = [
    { label: "Cumpridas", filtro: "cumpridas", value: summary.cumprida, tone: "ok" },
    { label: "Pendentes", filtro: "pendentes", value: summary.pendente, tone: summary.pendente > 0 ? "warning" : "ok" },
    { label: "Vencidas", filtro: "vencidas", value: summary.vencida, tone: summary.vencida > 0 ? "error" : "ok" },
    { label: "Ag. revisão", filtro: "revisao", value: summary.aguardandoRevisao, tone: summary.aguardandoRevisao > 0 ? "warning" : "ok" },
    { label: "Evid. pend.", filtro: "evidencias", value: summary.evidenciaPendente, tone: summary.evidenciaPendente > 0 ? "warning" : "ok" },
  ];
  const color = { ok: "text-emerald-300", warning: "text-amber-300", error: "text-red-300", neutral: "text-slate-300" };
  return (
    <div className="border-b border-white/[0.07] py-px">
      <div className="text-[12px] leading-[18px] text-white">Obrigações ESG (posição atual)</div>
      <div className="grid grid-cols-5 gap-1">
        {cells.map((cell) => (
          <Link
            key={cell.filtro}
            href={`/${projectId}/esg?filtro=${cell.filtro}`}
            className="flex flex-col items-center rounded px-0.5 text-center hover:bg-white/10"
            title={`Ver as obrigações: ${cell.label}`}
          >
            <span className={`text-[14px] leading-4 ${color[hasObligations ? cell.tone : "neutral"]}`}>
              {hasObligations ? cell.value : "—"}
            </span>
            <span className="text-[9px] leading-3 text-[#b8c7dc]">{cell.label}</span>
          </Link>
        ))}
      </div>
      {hasObligations && summary.dispensada > 0 ? (
        <div className="text-[9px] leading-3 text-[#b8c7dc]">
          {summary.dispensada} dispensada(s)/não aplicável(is), fora das pendências. Total: {summary.occurrences}.
        </div>
      ) : null}
      {!hasObligations ? <div className="text-[9px] leading-3 text-[#b8c7dc]">Sem obrigações cadastradas.</div> : null}
    </div>
  );
}

function ProgressRing({ percent, size = 72 }: { percent: number | null; size?: number }) {
  const deg = percent === null ? 0 : Math.max(0, Math.min(100, percent)) * 3.6;
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background:
          percent === null
            ? "rgba(255,255,255,0.1)"
            : `conic-gradient(#22c55e 0deg, #22c55e ${deg}deg, rgba(255,255,255,0.1) ${deg}deg, rgba(255,255,255,0.1) 360deg)`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-full bg-[#182941]"
        style={{ width: size - 12, height: size - 12 }}
      >
        <span className="text-[10px] font-normal uppercase tracking-[0.04em] text-[#c9d6e8]">Realizado</span>
        <span className="text-[15px] font-normal leading-tight text-white">
          {percent !== null ? `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
        </span>
      </div>
    </div>
  );
}
// Selo de status padrão do Dashboard (o mesmo de "Status das integrações"): mesma altura, espaçamento, fonte, cantos
// e alinhamento à direita nos três painéis. ATIVO/OK = verde-escuro #166534 com texto branco; PENDENTE = laranja
// #FB923C com texto preto. Só o TEXTO exibido muda (ex.: PENDING → PENDENTE); o valor interno do sistema não é alterado.
type BadgeTone = "ok" | "pending" | "warning" | "error" | "neutral";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  ok: "bg-[#166534] text-[#ffffff]",
  pending: "bg-[#fb923c] text-[#000000]",
  warning: "bg-amber-400 text-black",
  error: "bg-red-600 text-white",
  neutral: "bg-[#475569] text-[#ffffff]",
};

function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[3px] px-2 py-0.5 text-[10px] font-normal uppercase leading-[15px] tracking-[0.02em] ${BADGE_TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

function compactStatus(value: React.ReactNode): React.ReactNode {
  if (typeof value === "string") {
    if (value === "EXTRACTED" || value === "PROCESSED") return <StatusBadge tone="ok">OK</StatusBadge>;
    if (value === "PENDING") return <StatusBadge tone="pending">PENDENTE</StatusBadge>;
    if (value === "Ausente" || value === "Não recebido") return <StatusBadge tone="neutral">{value}</StatusBadge>;
  }

  return value;
}

function formatDashboardCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Não disponível";
  }

  return Math.round(value / 1000).toLocaleString("en-US");
}
function numericMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function latestIndicatorValue(
  indicators: unknown[],
  pattern: RegExp
): { label: string; value: number; period: string | null } | null {
  for (const raw of indicators) {
    const item = asObject(raw);
    if (!item) continue;

    const key = String(item.key ?? "");
    const label = String(item.label ?? key);

    if (!pattern.test(`${key} ${label}`)) continue;

    const value = numericMetric(item.latest);
    if (value === null) continue;

    return {
      label,
      value,
      period: typeof item.latestPeriod === "string" ? item.latestPeriod : null,
    };
  }

  return null;
}


function formatDashboardDate(value: string | null): string {
  if (!value) return "Não disponível";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return "Não disponível";

  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

const STAGE_STATE_TONE: Record<EmailStageState, "ok" | "warning" | "error" | "neutral"> = {
  OK: "ok",
  PENDENTE: "warning",
  ATENCAO: "warning",
  ERRO: "error",
  NAO_VERIFICAVEL: "neutral",
};

/** Linha secund\u00e1ria (detalhe/motivo) sob um StatusLine \u2014 evid\u00eancia da contagem ou motivo da indisponibilidade. */
function SubNote({ children }: { children: React.ReactNode }) {
  return <p className="pb-0.5 pl-4 text-[10px] leading-tight text-[#b8c7dc]">{children}</p>;
}

const LEVEL_LABEL: Record<string, string> = { RESPONSAVEL: "Respons\u00e1vel", ESCALAO_1: "Escal\u00e3o 1", ESCALAO_2: "Escal\u00e3o 2", DIRETORIA: "Diretoria" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [data, events] = await Promise.all([
    getDashboardVisualData(projectId, { range: "PROJECT" }),
    getEvents(projectId),
  ]);

  const supabase = await createSupabaseServerClient();
  // Datas oficiais da obra exibidas exclusivamente no Dashboard, não no Start-up.
  const { data: projectDates, error: projectDatesError } = await supabase
    .from("projects")
    .select("project_start_date,baseline_end_date,acc_operational_start_date")
    .eq("id", projectId)
    .maybeSingle();
  if (projectDatesError) throw projectDatesError;


  /*
   * Leitura do pacote semanal diretamente das tabelas persistidas.
   * Não cria dado novo e não presume recebimento.
   */
  const { data: recentEmails } = await supabase
    .from("emails")
    .select(
      "id,subject,from_address,sent_at,document_classification,classification_status,work_week_label"
    )
    .eq("project_id", projectId)
    .order("sent_at", { ascending: false })
    .limit(100);

  const emailIds = (recentEmails ?? []).map((email) => email.id);

  const { data: recentAttachments } =
    emailIds.length > 0
      ? await supabase
          .from("email_attachments")
          .select(
            "id,email_id,original_file_name,confirmed_classification,suggested_classification,processing_status"
          )
          .in("email_id", emailIds)
      : { data: [] };

  const emailById = new Map(
    (recentEmails ?? []).map((email) => [email.id, email])
  );

  const scheduleAttachment = (recentAttachments ?? [])
    .filter(
      (attachment) =>
        attachment.confirmed_classification === "CRONOGRAMA_MPP" ||
        attachment.suggested_classification === "CRONOGRAMA_MPP"
    )
    .sort((a, b) => {
      const aDate = emailById.get(a.email_id)?.sent_at ?? "";
      const bDate = emailById.get(b.email_id)?.sent_at ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })[0];

  const weeklyAttachment = (recentAttachments ?? [])
    .filter(
      (attachment) =>
        attachment.confirmed_classification ===
          "RELATORIO_SEMANAL_PLANEJAMENTO" ||
        attachment.suggested_classification ===
          "RELATORIO_SEMANAL_PLANEJAMENTO"
    )
    .sort((a, b) => {
      const aDate = emailById.get(a.email_id)?.sent_at ?? "";
      const bDate = emailById.get(b.email_id)?.sent_at ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })[0];

  const weeklyWorkbookAttachmentIds = weeklyAttachment
    ? [weeklyAttachment.id]
    : [];

  const { data: workbookRows } =
    weeklyWorkbookAttachmentIds.length > 0
      ? await supabase
          .from("weekly_report_workbooks")
          .select("id,email_attachment_id,status,extracted_at,schedule_version_id")
          .in("email_attachment_id", weeklyWorkbookAttachmentIds)
          .order("extracted_at", { ascending: false })
          .limit(1)
      : { data: [] };

  const latestWorkbook = workbookRows?.[0] ?? null;

  const { data: weeklySheets } = latestWorkbook
    ? await supabase
        .from("weekly_report_sheets")
        .select(
          "category,status,metrics,data,risk_classification,mapped_at,original_sheet_name"
        )
        .eq("workbook_id", latestWorkbook.id)
    : { data: [] };

  const sheetByCategory = new Map(
    (weeklySheets ?? []).map((sheet) => [sheet.category, sheet])
  );

  const physicalMetrics = asObject(sheetByCategory.get("CURVA_S")?.metrics);
  const financialMetrics = asObject(
    sheetByCategory.get("FINANCEIRO")?.metrics
  );
  const ssmaMetrics = asObject(sheetByCategory.get("SSMA")?.metrics);

  const physicalActual =
    numericMetric(physicalMetrics?.actualAtCutoff) ??
    numericMetric(physicalMetrics?.actualPercent) ??
    numericMetric(physicalMetrics?.actualCumulative) ??
    null;

  const financialActual =
    numericMetric(financialMetrics?.actualTotal) ??
    numericMetric(financialMetrics?.realizedTotal) ??
    null;

  const financialPlanned =
    numericMetric(financialMetrics?.plannedTotal) ?? null;

  const financialProgressPercent =
    financialActual !== null &&
    financialPlanned !== null &&
    financialPlanned > 0
      ? Math.max(0, Math.min(100, (financialActual / financialPlanned) * 100))
      : null;

  const financialAxion =
    numericMetric(financialMetrics?.faturado) ?? null;

  const financialDirect =
    financialActual !== null && financialAxion !== null
      ? financialActual - financialAxion
      : null;

  const financialBalance =
    financialPlanned !== null && financialActual !== null
      ? financialPlanned - financialActual
      : null;

  const formatFinancialMil = (value: number | null): string =>
    value === null
      ? "Não disponível"
      : `R$ ${Math.round(value / 1000).toLocaleString("pt-BR")}`;


  /*
   * PRAZO OPERACIONAL
   * Fonte: MPP vinculado ao último relatório semanal.
   * Dias não trabalhados: RDO / Diário de Obra.
   * 1 turno impraticável = 0,5 dia equivalente.
   * 2 turnos impraticáveis = 1,0 dia equivalente.
   */
  const scheduleVersionId =
    typeof latestWorkbook?.schedule_version_id === "string"
      ? latestWorkbook.schedule_version_id
      : null;

  const { data: scheduleActivities } = scheduleVersionId
    ? await supabase
        .from("schedule_activities")
        .select("planned_start,planned_end")
        .eq("schedule_version_id", scheduleVersionId)
    : { data: [] };

  const plannedStarts = (scheduleActivities ?? [])
    .map((item) => item.planned_start)
    .filter((value): value is string => typeof value === "string")
    .sort();

  const plannedEnds = (scheduleActivities ?? [])
    .map((item) => item.planned_end)
    .filter((value): value is string => typeof value === "string")
    .sort();

  const mppStartDate = plannedStarts[0] ?? null;
  const mppEndDate = plannedEnds.at(-1) ?? null;

  const contractStartDate = data.project?.startDate ?? null;
  const contractEndDate = data.project?.baselineEndDate ?? null;

  const dashboardContractEndDate =
    [contractEndDate, mppEndDate]
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;

  // Dias decorridos: calendário desde o início da obra (project_start_date, senão start_date contratual) até hoje
  // (fuso America/Sao_Paulo). Antes dependia do MPP + último RDO e ficava indisponível sem cronograma processado.
  const dashboardToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const elapsed = computeElapsedDays({
    projectStartDate: projectDates?.project_start_date ?? null,
    contractStartDate,
    today: dashboardToday,
  });

  // Clima (RDO): janela a partir do início do MPP vinculado ou, sem MPP, do início da obra. Sem RDO => indisponível (nunca 0).
  const climateWindowStart = mppStartDate ?? (elapsed.available ? elapsed.value.startDate : null);
  const { data: rdoRows, error: rdoError } = climateWindowStart
    ? await supabase
        .from("diario_de_obra_reports")
        .select("reference_date,weather")
        .eq("project_id", projectId)
        .gte("reference_date", climateWindowStart)
        .lte("reference_date", mppEndDate ?? "9999-12-31")
        .order("reference_date", { ascending: true })
    : { data: [], error: null };

  const climate = rdoError
    ? ({ available: false, reason: "leitura do Diário de Obra indisponível" } as const)
    : computeClimateImpact({ rows: rdoRows ?? [], windowStart: climateWindowStart });

  const indicators = Array.isArray(ssmaMetrics?.indicators)
    ? ssmaMetrics.indicators
    : [];

  const accidents = latestIndicatorValue(
    indicators,
    /\bacidentes?\b/i
  );

  const accidentsWithLeave = latestIndicatorValue(
    indicators,
    /acidente.*afastamento|afastamento.*acidente/i
  );

  const incidents = latestIndicatorValue(
    indicators,
    /\bincidentes?\b/i
  );

  const dds = latestIndicatorValue(indicators, /\bdds\b/i);
  const dda = latestIndicatorValue(indicators, /\bdda\b/i);

  const scheduleEmail = scheduleAttachment
    ? emailById.get(scheduleAttachment.email_id)
    : null;

  const weeklyEmail = weeklyAttachment
    ? emailById.get(weeklyAttachment.email_id)
    : null;


  // ==========================================================
  // Dashboard executivo — valores derivados de fontes reais
  // ==========================================================

  const formalizedVariation = data.contractValueTable.totalAditivosChange;

  const formatDashboardMil = (value: number | null): string =>
    value === null
      ? "Não disponível"
      : `R$ ${Math.round(value / 1000).toLocaleString("pt-BR")}`;

  // O total previsto do Financeiro W39 já representa
  // contrato vigente incluindo o Aditivo 01.
  const dashboardContractTotal = financialPlanned;

  // Aditivos: SOMENTE da fonte estruturada (aditivos contratuais formalizados).
  // Não há valor de contrato-base em tabela alguma; nenhum número fixo no código
  // e nenhuma subtração "total - base". Sem fonte = "Sem fonte", nunca zero.
  const dashboardAdditives = resolveAdditivesDisplay(data.aditivosSummary);

  const dashboardFinancialRealized = financialActual;

  const dashboardFinancialBalance =
    dashboardContractTotal !== null &&
    dashboardFinancialRealized !== null
      ? dashboardContractTotal - dashboardFinancialRealized
      : null;


  // ----------------------------------------------------------
  // HISTOGRAMA — efetivo atual
  //
  // NÃO usar actualTotal, pois ele é a soma das semanas.
  // Usar o último registro disponível em data.rows.
  // ----------------------------------------------------------

  const histogramData = asObject(
    sheetByCategory.get("HISTOGRAMA")?.data
  );

  const histogramRows = Array.isArray(histogramData?.rows)
    ? histogramData.rows
    : [];

  const latestWorkforceRow =
    [...histogramRows]
      .reverse()
      .map((row) => asObject(row))
      .find(
        (row) =>
          row !== null &&
          (
            numericMetric(row.actual) !== null ||
            numericMetric(row.quantity) !== null
          )
      ) ?? null;

  const dashboardCurrentWorkforce =
    latestWorkforceRow !== null
      ? (
          numericMetric(latestWorkforceRow.actual) ??
          numericMetric(latestWorkforceRow.quantity)
        )
      : null;

  const dashboardCurrentWorkforcePeriod =
    latestWorkforceRow !== null &&
    typeof latestWorkforceRow.period === "string"
      ? latestWorkforceRow.period
      : null;


  // ----------------------------------------------------------
  // SSMA — indicadores ESTRUTURADOS (sem regex sobre texto livre):
  //   trilha A = formulários enviados (acidente = checklist "ocorrencia-acidente", campo "afastamento");
  //   trilha B = registros de campo + ações corretivas. Zero verdadeiro ≠ sem dado (lib/ssma/dashboard-metrics.ts).
  // ----------------------------------------------------------

  const [{ data: dashboardSsmaForms }, { data: dashboardSsmaFieldRecords }, dashboardIncidentLinks] = await Promise.all([
    supabase
      .from("ssma_form_submissions")
      .select("id,checklist_slug,occurred_at,field_values")
      .eq("project_id", projectId)
      .eq("status", "SUBMITTED"),
    supabase
      .from("ssma_field_records")
      .select(
        "id,kind,category,description,location,occurred_at,client_created_at,received_at,risk_level,responsible_user_id,due_date,reported_by_user_id,ssma_corrective_actions(id,status,due_date,concluded_at,responsible_user_id)"
      )
      .eq("project_id", projectId),
    // Decisões humanas sobre duplicidade acidente × ocorrência de campo. Tabela ausente (migration pendente) ou erro:
    // sem vínculos => nada é descontado (comportamento seguro).
    supabase.from("ssma_incident_links").select("form_submission_id,field_record_id,decision").eq("project_id", projectId),
  ]);

  const ssmaDash = computeSsmaDashboardMetrics({
    links: dashboardIncidentLinks.error ? [] : ((dashboardIncidentLinks.data ?? []) as SsmaIncidentLinkRow[]),
    forms: (dashboardSsmaForms ?? []) as SsmaFormMetricsRow[],
    fieldRecords: (dashboardSsmaFieldRecords ?? []) as unknown as FieldRecordRow[],
    today: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  });

  const dashboardAccidentsWithLeave = ssmaDash.accidentsWithLeave;
  const dashboardAccidentsWithoutLeave = ssmaDash.accidentsWithoutLeave;
  const dashboardSafetyOccurrences = ssmaDash.occurrences;
  const dashboardDaysWithoutAccident = ssmaDash.daysWithoutAccident;

  // ----------------------------------------------------------
  // Fatos operacionais (somente leitura, RLS da sessão): casos de risco, escalonamentos, outbox, e-mails.
  // ----------------------------------------------------------
  const permission = await getCurrentProjectPermission(projectId);
  const opFacts = await getDashboardOperationalFacts(supabase, projectId, { isAdmin: permission === "ADMINISTRADOR" });

  // Alertas de risco = risk_alert_cases abertos (os mesmos de /alertas/{caseId} e dos e-mails de alerta).
  // Achados de IA (ai_findings) continuam exibidos, mas SEPARADOS — nunca somados aos alertas.
  const riskCases = opFacts.riskCases ? summarizeRiskAlertCases(opFacts.riskCases) : null;
  const riskCaseActionIds = opFacts.riskCases
    ? new Set(opFacts.riskCases.map((row) => row.sla_action_id).filter((id): id is string => Boolean(id)))
    : null;
  const slaBreakdown = computeSlaEscalationBreakdown({
    actions: data.slaActions,
    escalations: opFacts.escalations ?? [],
    riskCaseActionIds,
  });
  const consistencyIssuesTotal = opFacts.consistencyIssues
    ? Object.values(opFacts.consistencyIssues).reduce((sum, value) => sum + value, 0)
    : null;

  // E-mail por etapa: farol verde só com todas as etapas comprovadas.
  const emailPipeline = resolveEmailPipelineStages({
    ...data.emailFacts,
    individualCollectionsEnabled: opFacts.individualCollections?.enabled ?? null,
    individualCollectionsTotal: opFacts.individualCollections?.total ?? null,
    persistedEmails: opFacts.persistedEmails,
    latestEmailAt: opFacts.latestEmailAt,
    outbox: opFacts.outbox,
    emailReplyOrigins: opFacts.emailReplyOrigins,
  });
  const emailDisplayStatus = resolveEmailDisplayStatus(data.emailFacts.serviceStatus, emailPipeline);
  const integrationRows = data.integrationEntries.map((entry) => ({
    ...entry,
    displayStatus: entry.sourceType === "EMAIL" ? emailDisplayStatus : entry.status,
  }));

  const activeIntegrations = integrationRows.filter((row) => row.displayStatus === "CONECTADO").length;
  const partialIntegrations = integrationRows.filter((row) => row.displayStatus === "PARCIAL").length;
  const totalIntegrations = integrationRows.length;

  const dashboardRisk = resolveDashboardRiskLevel(data.generalSituation, riskCases);
  const highestRisk =
    dashboardRisk === "SEM_RISCO_ATIVO"
      ? "SEM RISCO"
      : dashboardRisk === "EM_REVISAO"
        ? "EM REVISÃO"
        : dashboardRisk === "CRITICA"
          ? "CRÍTICO"
          : dashboardRisk === "ALTA"
            ? "ALTO"
            : dashboardRisk === "MEDIA"
              ? "MÉDIO"
              : "BAIXO";

  const systemStatusBase = resolveSystemStatus(data.integrationStatusGroups);
  // Nenhum verde global quando o e-mail só está parcialmente comprovado (etapas acima).
  const systemStatus =
    systemStatusBase.level === "OPERACIONAL" && emailDisplayStatus === "PARCIAL"
      ? {
          level: "PARCIAL" as const,
          label: "INTEGRAÇÕES PARCIAIS",
          reason: `E-mail com ${emailPipeline.proven} de ${emailPipeline.total} etapas comprovadas.`,
        }
      : systemStatusBase;

  // Planejamento semanal por etapa (recebido × processado × extraído × reconhecido × atualizado).
  const cronogramaEvaluated = data.cronogramaResolution.cause !== null || data.cronogramaResolution.status !== "PENDENTE";
  const planningStages = {
    weeklyReport: weeklyReportStage({ attachmentReceived: Boolean(weeklyAttachment), workbookStatus: latestWorkbook?.status ?? null }),
    mppFile: mppFileStage({ attachmentReceived: Boolean(scheduleAttachment), processingStatus: scheduleAttachment?.processing_status ?? null }),
    baseline: baselineStage({ configRead: opFacts.weeklyConfig.read, baselineScheduleVersionId: opFacts.weeklyConfig.baselineScheduleVersionId }),
    scheduleUpdated: scheduleUpdatedStage({
      status: data.cronogramaResolution.status,
      detail: data.cronogramaResolution.detail,
      evaluated: cronogramaEvaluated,
    }),
  };
  const projectName = data.project?.name ?? "Projeto não disponível";
  const projectCode = data.project?.code ?? "Código não disponível";
  // Se o nome cadastrado já termina com o código (ex.: "… Goiânia · 0079"), não repete o código.
  const projectLabel = projectName.includes(projectCode) ? projectName : `${projectName} · ${projectCode}`;

  return (
    <div className="-m-6 min-h-full bg-[var(--dashboard-bg)] p-2 text-white xl:h-[calc(100%+3rem)] xl:overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-col gap-2">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263b5c] pb-1">
          {/* Marca fica só na barra superior. Nome e código da obra ativa: uma linha, peso regular; em tela estreita
              trunca com reticências e o texto completo aparece no title (mouse) e ao focar com o teclado (Tab). */}
          <div className="flex min-w-[16rem] flex-1 items-baseline gap-3">
            <h1 className="shrink-0 text-xl font-medium leading-tight tracking-tight text-white">Dashboard Executivo</h1>
            <p
              tabIndex={0}
              title={projectLabel}
              className="min-w-0 truncate rounded-[3px] text-[14px] font-normal text-[#c9d6e8] outline-none focus-visible:whitespace-normal focus-visible:break-words focus-visible:ring-1 focus-visible:ring-[#8fb8f0]"
            >
              {projectLabel}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                title={systemStatus.reason || undefined}
                className={`grid h-9 place-items-center rounded-[5px] px-4 text-center ${
                  systemStatus.level === "OPERACIONAL"
                    ? "bg-emerald-600 text-white"
                    : systemStatus.level === "PARCIAL"
                      ? "bg-amber-400 text-black"
                      : systemStatus.level === "FALHA"
                        ? "bg-red-600 text-white"
                        : "bg-slate-500 text-white"
                }`}
              >
                <span className="block whitespace-nowrap text-center text-[12px] font-normal uppercase tracking-[0.02em] leading-none">
                  {systemStatus.label}
                </span>
              </div>
              {systemStatus.reason ? (
                <p className="max-w-[360px] text-[11px] leading-tight text-[#c9d6e8]">{systemStatus.reason}</p>
              ) : null}
            </div>

            <div className="rounded-[5px] border border-[#263b5c] bg-[#182941] px-3 py-1 text-right">
              <p className="text-[10px] font-normal uppercase tracking-[0.04em] text-[#b8c7dc]">Atualização operacional</p>
              <p className="text-[12px] font-normal text-white">Dados persistidos no ACC</p>
            </div>
          </div>
        </header>

        {/* KPIs — números centralizados */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <ExecutiveKpi
            label="Alertas de risco"
            value={riskCases ? riskCases.open : "—"}
            subtitle={riskCases ? "Casos de risco abertos" : "Leitura indisponível"}
            icon={AlertTriangle}
          />

          <ExecutiveKpi label="Eventos Ledger" value={events.length} subtitle="Eventos registrados" icon={Activity} />

          <ExecutiveKpi
            label="Risco atual"
            value={
              <span
                className={
                  highestRisk === "CRÍTICO"
                    ? "text-red-400"
                    : highestRisk === "ALTO"
                      ? "text-orange-400"
                      : highestRisk === "MÉDIO" || highestRisk === "EM REVISÃO"
                        ? "text-amber-300"
                        : "text-[#2fbf71]"
                }
              >
                {highestRisk}
              </span>
            }
            subtitle={riskCases ? "Alertas de risco + achados de IA" : "Só achados de IA (alertas indisponíveis)"}
            icon={TriangleAlert}
          />

          <ExecutiveKpi
            label="Integrações"
            value={`${activeIntegrations}/${totalIntegrations}`}
            subtitle={partialIntegrations > 0 ? `Comprovadas · ${partialIntegrations} parcial(is)` : "Fontes comprovadas"}
            icon={CheckCircle2}
          />

          <ExecutiveKpi
            label="Aditivos"
            value={data.aditivosSummary.quantity}
            subtitle={
              formalizedVariation !== 0
                ? formatDashboardCurrency(formalizedVariation)
                : "Nenhum valor formalizado"
            }
            icon={CircleDollarSign}
          />

          <ExecutiveKpi
            label="Avanço físico"
            value={
              physicalActual !== null
                ? `${physicalActual.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}%`
                : "—"
            }
            subtitle={physicalActual === null ? "Aguardando Curva S" : "Último relatório semanal"}
            icon={CalendarClock}
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-5">
          {/* COLUNA 1 */}
          <div className="flex flex-col gap-2">
            <Panel title="Situação contratual">
              <StatusLine
                label="Alertas de risco abertos"
                value={riskCases ? riskCases.open : "Indisponível"}
                status={riskCases ? (riskCases.open > 0 ? "warning" : "ok") : "neutral"}
              />
              {riskCases ? (
                <SubNote>
                  Casos de risco (status aberto, não resolvidos) · {riskCases.openWithSlaAction} com ação SLA ·{" "}
                  {riskCases.closed} encerrado(s){riskCases.testOpen > 0 ? ` · ${riskCases.testOpen} de teste fora da contagem` : ""}
                </SubNote>
              ) : (
                <SubNote>Não foi possível ler os casos de risco (permissão ou falha de leitura).</SubNote>
              )}
              {riskCases && riskCases.openHighCriticalWithoutSlaAction > 0 ? (
                <StatusLine
                  label="Alto/crítico sem ação SLA"
                  value={riskCases.openHighCriticalWithoutSlaAction}
                  status="error"
                />
              ) : null}
              <StatusLine
                label="Achados de IA ativos"
                value={data.activeFindingsSummary.totalActive}
                status={data.activeFindingsSummary.totalActive > 0 ? "warning" : "ok"}
              />
              <StatusLine
                label="Ações abertas (SLA)"
                value={data.slaSummary.pending}
                status={data.slaSummary.pending > 0 ? "warning" : "ok"}
              />
              {slaBreakdown.openActions > 0 ? (
                <SubNote>
                  Status:{" "}
                  {Object.entries(slaBreakdown.openByStatus)
                    .map(([status, count]) => `${status} ${count}`)
                    .join(", ")}
                  {riskCaseActionIds ? ` · ${slaBreakdown.openLinkedToRiskCase} vinculada(s) a caso de risco` : ""}
                </SubNote>
              ) : null}
              <StatusLine
                label="Ações vencidas"
                value={data.slaSummary.overdue}
                status={data.slaSummary.overdue > 0 ? "error" : "ok"}
              />
              <StatusLine
                label="Ações escalonadas (abertas)"
                value={data.slaSummary.escalated}
                status={data.slaSummary.escalated > 0 ? "warning" : "ok"}
              />
              {slaBreakdown.openEscalated > 0 ? (
                <SubNote>
                  Nível atual:{" "}
                  {(["ESCALAO_1", "ESCALAO_2", "DIRETORIA"] as const)
                    .filter((level) => slaBreakdown.openByLevel[level] > 0)
                    .map((level) => `${LEVEL_LABEL[level]} ${slaBreakdown.openByLevel[level]}`)
                    .join(", ")}
                </SubNote>
              ) : null}
              <StatusLine
                label="Registros de escalonamento"
                value={opFacts.escalations ? slaBreakdown.escalationRecords : "Indisponível"}
                status="neutral"
              />
              {opFacts.escalations && slaBreakdown.escalationRecords > 0 ? (
                <SubNote>
                  Histórico (uma ação pode subir mais de um nível):{" "}
                  {(["ESCALAO_1", "ESCALAO_2", "DIRETORIA"] as const)
                    .filter((level) => slaBreakdown.recordsByToLevel[level] > 0)
                    .map((level) => `→ ${LEVEL_LABEL[level]} ${slaBreakdown.recordsByToLevel[level]}`)
                    .join(", ")}
                  {slaBreakdown.recordsOnClosedOrUnknownActions > 0 ? ` · ${slaBreakdown.recordsOnClosedOrUnknownActions} de ações encerradas` : ""}
                  {slaBreakdown.openEscalatedWithMultipleRecords > 0 ? ` · ${slaBreakdown.openEscalatedWithMultipleRecords} ação(ões) com mais de um registro` : ""}
                  {slaBreakdown.openEscalatedWithoutRecord > 0 ? ` · ${slaBreakdown.openEscalatedWithoutRecord} escalonada(s) sem registro` : ""}
                </SubNote>
              ) : null}
              <StatusLine
                label="Divergências caso × ação"
                value={consistencyIssuesTotal ?? "Indisponível"}
                status={consistencyIssuesTotal === null ? "neutral" : consistencyIssuesTotal > 0 ? "warning" : "ok"}
              />
              {opFacts.consistencyIssues && consistencyIssuesTotal ? (
                <SubNote>
                  {Object.entries(opFacts.consistencyIssues)
                    .map(([code, count]) => `${code} ${count}`)
                    .join(", ")}
                </SubNote>
              ) : null}
              <StatusLine
                label="Início da obra"
                value={formatDashboardDate(projectDates?.project_start_date ?? contractStartDate)}
                status={(projectDates?.project_start_date ?? contractStartDate) ? "ok" : "neutral"}
              />
              <StatusLine
                label="Término da baseline"
                value={formatDashboardDate(projectDates?.baseline_end_date ?? dashboardContractEndDate)}
                status={(projectDates?.baseline_end_date ?? dashboardContractEndDate) ? "ok" : "neutral"}
              />
              <StatusLine
                label="Início operacional ACC"
                value={formatDashboardDate(projectDates?.acc_operational_start_date ?? null)}
                status={projectDates?.acc_operational_start_date ? "ok" : "neutral"}
              />
            </Panel>

            <Panel title="Distribuição dos alertas de risco abertos">
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["Baixo", riskCases?.openBySeverity.BAIXA ?? null, "bg-[#166534]", "text-[#ffffff]"],
                  ["Médio", riskCases?.openBySeverity.MEDIA ?? null, "bg-yellow-400", "text-[#000000]"],
                  ["Alto", riskCases?.openBySeverity.ALTA ?? null, "bg-[#c2410c]", "text-[#ffffff]"],
                  ["Crítico", riskCases?.openBySeverity.CRITICA ?? null, "bg-[#b91c1c]", "text-[#ffffff]"],
                ].map(([label, value, color, textColor]) => (
                  <div
                    key={String(label)}
                    className={`flex h-11 flex-col items-center justify-center rounded-[5px] ${color} ${textColor}`}
                  >
                    <span className="text-[12px] font-normal leading-none">{label}</span>
                    <span className="mt-1 text-xl font-normal leading-none">{value === null ? "—" : Number(value)}</span>
                  </div>
                ))}
              </div>
              <p className="pt-1 text-[10px] leading-tight text-[#b8c7dc]">
                {riskCases
                  ? `${riskCases.reviewRequired > 0 ? `${riskCases.reviewRequired} caso(s) em revisão (sem nível definido) fora das colunas. ` : ""}Achados de IA ativos por severidade: baixo ${data.activeFindingsSummary.countsBySeverity.BAIXA}, médio ${data.activeFindingsSummary.countsBySeverity.MEDIA}, alto ${data.activeFindingsSummary.countsBySeverity.ALTA}, crítico ${data.activeFindingsSummary.countsBySeverity.CRITICA}.`
                  : "Casos de risco indisponíveis: “—” significa sem dado, não zero."}
              </p>
            </Panel>
          </div>

          {/* COLUNA 2 */}
          <div className="flex flex-col gap-2">
            <Panel title="Financeiro resumido — R$ mil">
              <StatusLine
                label="Contrato + aditivos"
                value={formatDashboardMil(dashboardContractTotal)}
                status={dashboardContractTotal !== null ? "ok" : "neutral"}
              />
              <StatusLine
                label="Aditivos"
                value={formatAdditivesMil(dashboardAdditives)}
                status={dashboardAdditives.value !== null ? "ok" : "neutral"}
              />
              <StatusLine
                label="Realizado total"
                value={formatDashboardMil(dashboardFinancialRealized)}
                status={dashboardFinancialRealized !== null ? "ok" : "neutral"}
              />
              <StatusLine
                label="Saldo"
                value={formatDashboardMil(dashboardFinancialBalance)}
                status={dashboardFinancialBalance !== null ? "ok" : "neutral"}
              />
              <p className="pt-1 text-[10px] leading-tight text-[#b8c7dc]">
                Valores em R$ mil · realizado inclui faturamento AXION + faturamento direto WEG.
              </p>
            </Panel>

            <Panel title="SSMA / ESG — Segurança">
              <StatusLine
                label="Acidentes com afastamento"
                value={dashboardAccidentsWithLeave !== null ? dashboardAccidentsWithLeave : "—"}
                status={
                  dashboardAccidentsWithLeave !== null ? (dashboardAccidentsWithLeave > 0 ? "error" : "ok") : "neutral"
                }
              />
              <StatusLine
                label="Acidentes sem afastamento"
                value={dashboardAccidentsWithoutLeave !== null ? dashboardAccidentsWithoutLeave : "—"}
                status={
                  dashboardAccidentsWithoutLeave !== null
                    ? dashboardAccidentsWithoutLeave > 0
                      ? "warning"
                      : "ok"
                    : "neutral"
                }
              />
              <StatusLine
                label="Ocorrências de segurança"
                value={dashboardSafetyOccurrences !== null ? dashboardSafetyOccurrences : "—"}
                status={
                  dashboardSafetyOccurrences !== null ? (dashboardSafetyOccurrences > 0 ? "warning" : "ok") : "neutral"
                }
              />
              <StatusLine
                label="Near Misses (quase-acidentes)"
                value={ssmaDash.nearMisses !== null ? ssmaDash.nearMisses : "—"}
                status={ssmaDash.nearMisses !== null ? (ssmaDash.nearMisses > 0 ? "warning" : "ok") : "neutral"}
              />
              <p className="text-[10px] leading-tight text-[#b8c7dc]" data-testid="near-miss-period">
                {ssmaDash.nearMissSource?.period
                  ? `Período: ${new Date(ssmaDash.nearMissSource.period.firstAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} a ${new Date(ssmaDash.nearMissSource.period.lastAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · `
                  : ssmaDash.nearMisses === 0 ? "Nenhum Near Miss registrado · " : ""}
                <Link href={`/${projectId}/ssma-registros#near-misses`} className="font-bold text-[#ffd0c7] underline">Ver registros</Link>
              </p>
              <StatusLine
                label="Dias sem acidente"
                value={dashboardDaysWithoutAccident !== null ? dashboardDaysWithoutAccident : "—"}
                status={dashboardDaysWithoutAccident !== null ? "ok" : "neutral"}
              />
              {dashboardDaysWithoutAccident === null && ssmaDash.hasData ? (
                <SubNote>
                  Indisponível: nenhum acidente registrado em formulário SSMA, logo não há data-base para a contagem
                  (ausência de registro não prova ausência de acidente).
                </SubNote>
              ) : null}
              <StatusLine
                label="Ações corretivas em aberto"
                value={ssmaDash.openCorrectiveActions !== null ? ssmaDash.openCorrectiveActions : "—"}
                status={ssmaDash.openCorrectiveActions !== null ? (ssmaDash.openCorrectiveActions > 0 ? "warning" : "ok") : "neutral"}
              />
              <StatusLine
                label="Ações corretivas em atraso"
                value={ssmaDash.overdueCorrectiveActions !== null ? ssmaDash.overdueCorrectiveActions : "—"}
                status={ssmaDash.overdueCorrectiveActions !== null ? (ssmaDash.overdueCorrectiveActions > 0 ? "error" : "ok") : "neutral"}
              />
              <EsgObligationsBlock projectId={projectId} summary={data.esgSummary} />
              <p className="pt-1 text-[10px] leading-tight text-[#b8c7dc]">
                {ssmaDash.hasData
                  ? `Fonte: ${ssmaDash.sources.forms} formulário(s) e ${ssmaDash.sources.fieldRecords} registro(s) de campo SSMA${ssmaDash.period ? `, de ${new Date(ssmaDash.period.firstAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} a ${new Date(ssmaDash.period.lastAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}${ssmaDash.occurrenceSources && ssmaDash.occurrenceSources.confirmedSameFact > 0 ? `; ${ssmaDash.occurrenceSources.confirmedSameFact} mesmo(s) fato(s) confirmado(s) por humano contado(s) uma vez` : ""}${ssmaDash.occurrenceSources && ssmaDash.occurrenceSources.possibleDuplicates > 0 ? `; ${ssmaDash.occurrenceSources.possibleDuplicates} possível(is) duplicidade(s) aguardando confirmação (não descontada(s))` : ""}${ssmaDash.nearMissSource && ssmaDash.nearMissSource.period ? `; quase-acidentes (${ssmaDash.nearMissSource ? `${ssmaDash.nearMissSource.fieldRecords} de registros de campo, ${ssmaDash.nearMissSource.forms} de formulários` : ""}): classificação "Quase-acidente" de ${new Date(ssmaDash.nearMissSource.period.firstAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} a ${new Date(ssmaDash.nearMissSource.period.lastAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}. Zero = nenhum registrado.`
                  : "Sem registros SSMA nesta obra ainda: “—” significa sem dado, não zero."}
              </p>
            </Panel>
          </div>

          {/* COLUNA 3 */}
          <div className="flex flex-col gap-2">
            <Panel title="Avanço físico do contrato">
              <div className="flex items-center gap-3">
                <ProgressRing percent={physicalActual !== null ? Number(physicalActual) : null} />
                <div className="min-w-0 flex-1">
                  <StatusLine
                    label="Avanço físico atual"
                    value={
                      physicalActual !== null
                        ? `${physicalActual.toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}%`
                        : "Não disponível"
                    }
                    status={physicalActual !== null ? "ok" : "neutral"}
                  />
                  <p className="pt-1 text-[10px] leading-tight text-[#b8c7dc]">
                    {physicalActual !== null
                      ? "Percentual acumulado apurado pela Curva S."
                      : "Aguardando processamento da Curva S."}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Avanço financeiro do contrato">
              <div className="flex items-center gap-3">
                <ProgressRing percent={financialProgressPercent} />
                <div className="min-w-0 flex-1">
                  <StatusLine
                    label="Avanço financeiro"
                    value={
                      financialProgressPercent !== null
                        ? `${financialProgressPercent.toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}%`
                        : "Não disponível"
                    }
                    status={financialProgressPercent !== null ? "ok" : "neutral"}
                  />
                </div>
              </div>

              <div className="mt-1">
                <StatusLine
                  label="Faturamento AXION"
                  value={formatFinancialMil(financialAxion)}
                  status={financialAxion !== null ? "ok" : "neutral"}
                />
                <StatusLine
                  label="Faturamento Direto WEG"
                  value={formatFinancialMil(financialDirect)}
                  status={financialDirect !== null ? "ok" : "neutral"}
                />
                <StatusLine
                  label="Realizado total"
                  value={formatFinancialMil(financialActual)}
                  status={financialActual !== null ? "ok" : "neutral"}
                />
                <StatusLine
                  label="Base contratual"
                  value={formatFinancialMil(financialPlanned)}
                  status={financialPlanned !== null ? "ok" : "neutral"}
                />
                <StatusLine
                  label="Saldo"
                  value={formatFinancialMil(financialBalance)}
                  status={financialBalance !== null ? "ok" : "neutral"}
                />
              </div>
            </Panel>
          </div>

          {/* COLUNA 4 */}
          <div className="flex flex-col gap-2">
            <Panel title="Status das integrações">
              {integrationRows.map((row) => (
                <div key={row.sourceType} className="border-b border-white/[0.07] py-px last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          row.displayStatus === "CONECTADO"
                            ? "bg-emerald-400"
                            : row.displayStatus === "ATENCAO" || row.displayStatus === "PARCIAL"
                              ? "bg-amber-400"
                              : row.displayStatus === "ERRO"
                                ? "bg-red-400"
                                : "bg-slate-400"
                        }`}
                      />
                      <span className="break-words text-[12px] font-normal leading-[18px] text-white">{row.label}</span>
                    </div>

                    <StatusBadge
                      tone={
                        row.displayStatus === "CONECTADO"
                          ? "ok"
                          : row.displayStatus === "ATENCAO" || row.displayStatus === "PARCIAL"
                            ? "warning"
                            : row.displayStatus === "ERRO"
                              ? "error"
                              : "pending"
                      }
                    >
                      {row.displayStatus === "CONECTADO"
                        ? "ATIVO"
                        : row.displayStatus === "PARCIAL"
                          ? "PARCIAL"
                          : row.displayStatus === "ATENCAO"
                            ? "ATENÇÃO"
                            : row.displayStatus === "ERRO"
                              ? "ERRO"
                              : "PENDENTE"}
                    </StatusBadge>
                  </div>
                  {row.sourceType === "EMAIL" ? (
                    <div className="pb-0.5 pl-4" data-testid="email-pipeline-stages">
                      {emailPipeline.stages.map((stage) => (
                        <div key={stage.key} className="flex items-start justify-between gap-2 text-[10px] leading-tight">
                          <span className="flex min-w-0 items-center gap-1 text-[#c9d6e8]">
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${
                                STAGE_STATE_TONE[stage.state] === "ok"
                                  ? "bg-emerald-400"
                                  : STAGE_STATE_TONE[stage.state] === "warning"
                                    ? "bg-amber-400"
                                    : STAGE_STATE_TONE[stage.state] === "error"
                                      ? "bg-red-400"
                                      : "bg-slate-400"
                              }`}
                            />
                            {stage.label}
                          </span>
                          <span className="text-right text-[#b8c7dc]">{stage.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </Panel>

            <Panel title="Relatório semanal — abas extraídas">
              {(
                [
                  ["CURVA_S", "Curva S"],
                  ["LINHA_BASE", "Linha de base (aba do Excel)"],
                  ["FINANCEIRO", "Financeiro"],
                  ["SSMA", "SSMA"],
                ] as const
              ).map(([category, label]) => {
                const stage = sheetStage(sheetByCategory.get(category)?.status ?? null);
                return <StatusLine key={category} label={label} value={stage.text} status={stage.tone} />;
              })}
              <p className="pt-1 text-[10px] leading-tight text-[#b8c7dc]">
                Abas lidas da planilha do relatório semanal. Extrair a Curva S ou a aba de linha de base não atualiza o
                cronograma: isso exige o MPP da semana processado.
              </p>
            </Panel>

            <div className="rounded-[7px] border border-[#263b5c] bg-[#182941] px-3 py-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#8fb8f0]" />
                <div>
                  <p className="text-[12px] font-normal text-white">Atualização automática</p>
                  <p className="text-[10px] leading-snug text-[#b8c7dc]">
                    Cronograma, relatório semanal, financeiro e SSMA são exibidos somente após o respectivo e-mail/anexo
                    ter sido persistido e processado pelo ACC.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* COLUNA 5 */}
          <div className="flex flex-col gap-2">
            <Panel title="Planejamento — recebimento por e-mail">
              <StatusLine
                label="Cronograma atualizado (semana)"
                value={planningStages.scheduleUpdated.tone === "ok" ? "PROCESSED" :planningStages.scheduleUpdated.tone === "neutral" ? "Não verificável" : "PENDING"}
                status={planningStages.scheduleUpdated.tone}
              />
              {planningStages.scheduleUpdated.tone !== "ok" ? <SubNote>{planningStages.scheduleUpdated.text}</SubNote> : null}
              <StatusLine label="Arquivo de cronograma (MPP)" value={planningStages.mppFile.text} status={planningStages.mppFile.tone} />
              <StatusLine label="Baseline oficial do cronograma" value={planningStages.baseline.text} status={planningStages.baseline.tone} />

              {scheduleEmail ? (
                <details className="pb-1 pl-4 text-[11px] leading-snug text-[#c9d6e8]">
                  <summary className="cursor-pointer select-none text-[#8fb8f0]">Detalhes do cronograma</summary>
                  <div className="break-words pt-0.5">
                    {scheduleAttachment?.original_file_name}
                    <br />
                    {scheduleEmail.from_address}
                    <br />
                    {formatDateTime(scheduleEmail.sent_at)}
                  </div>
                </details>
              ) : null}

              <StatusLine
                label="Relatório semanal (Excel)"
                value={planningStages.weeklyReport.text}
                status={planningStages.weeklyReport.tone}
              />

              {weeklyEmail ? (
                <details className="pb-1 pl-4 text-[11px] leading-snug text-[#c9d6e8]">
                  <summary className="cursor-pointer select-none text-[#8fb8f0]">Detalhes do relatório semanal</summary>
                  <div className="break-words pt-0.5">
                    {weeklyAttachment?.original_file_name}
                    <br />
                    {weeklyEmail.work_week_label ?? weeklyEmail.subject}
                    <br />
                    {weeklyEmail.from_address}
                    <br />
                    {formatDateTime(weeklyEmail.sent_at)}
                  </div>
                </details>
              ) : null}

              <div className="mt-1 border-t border-[#263b5c] pt-1">
                <StatusLine
                  label="Dias decorridos"
                  value={elapsed.available ? elapsed.value.days : "Não disponível"}
                  status={elapsed.available ? "ok" : "neutral"}
                />
                <SubNote>
                  {elapsed.available
                    ? `Calendário, desde ${formatDashboardDate(elapsed.value.startDate)} (${elapsed.value.startSource === "PROJECT_START_DATE" ? "início da obra" : "início contratual"}) até hoje.`
                    : `Motivo: ${elapsed.reason}.`}
                </SubNote>
                <StatusLine
                  label="Dias não trabalhados (clima)"
                  value={
                    climate.available
                      ? climate.value.nonWorkedDays.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                      : "Não disponível"
                  }
                  status={climate.available ? (climate.value.nonWorkedDays > 0 ? "warning" : "ok") : "neutral"}
                />
                <StatusLine
                  label="Impacto climático"
                  value={
                    climate.available
                      ? `${climate.value.percent.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}%`
                      : "Não disponível"
                  }
                  status={climate.available ? (climate.value.percent > 0 ? "warning" : "ok") : "neutral"}
                />
                <SubNote>
                  {climate.available
                    ? `${climate.value.rdoCount} RDO(s) de ${formatDashboardDate(climate.value.windowStart)} a ${formatDashboardDate(climate.value.lastRdoDate)} (${climate.value.windowDays} dias); turno impraticável = 0,5 dia.`
                    : `Motivo: ${climate.reason}.`}
                </SubNote>
                <StatusLine
                  label="Efetivo atual"
                  value={
                    dashboardCurrentWorkforce !== null
                      ? `${dashboardCurrentWorkforce.toLocaleString("pt-BR")} pessoas`
                      : "Não disponível"
                  }
                  status={dashboardCurrentWorkforce !== null ? "ok" : "neutral"}
                />
                {dashboardCurrentWorkforcePeriod ? (
                  <p className="text-right text-[10px] text-[#b8c7dc]">Histograma {dashboardCurrentWorkforcePeriod}</p>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>

        <footer className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#263b5c] pt-1 text-[10px] text-[#b8c7dc]">
          <span>ACC · Dashboard executivo</span>
          <span>Nenhum indicador financeiro ou SSMA é estimado quando a fonte não está disponível.</span>
        </footer>
      </div>
    </div>
  );
}
