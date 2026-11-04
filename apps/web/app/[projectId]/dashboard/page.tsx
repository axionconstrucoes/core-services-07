import type { Metadata } from "next";
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
import { getDashboardVisualData } from "@/lib/dashboard-visual/get-dashboard-visual-data";
import { getEvents } from "@/lib/data";
import { formatCurrency, formatDateTime } from "@/lib/labels";
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
    <div className="flex min-h-[78px] flex-col items-center justify-center rounded-[7px] border border-[#263b5c] bg-[#182941] px-3 py-2 text-center">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#c9d6e8]">
        <Icon className="size-3.5" />
        {label}
      </div>

      <div className="flex min-h-8 items-center justify-center text-center text-2xl font-bold leading-none text-white">
        {compactStatus(value)}
      </div>

      {subtitle ? <div className="text-[13px] leading-tight text-[#b8c7dc]">{subtitle}</div> : null}
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
      <div className="border-b border-[#263b5c] px-3 py-1.5">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.1em] text-white">{title}</h2>
      </div>

      <div className="px-3 py-1.5">{children}</div>
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
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-[3px] last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-[15px] font-medium leading-5 text-white">{label}</span>
      </div>

      <span className="shrink-0 text-right text-[15px] font-semibold text-white">{compactStatus(value)}</span>
    </div>
  );
}

function ProgressRing({ percent, size = 84 }: { percent: number | null; size?: number }) {
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
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#c9d6e8]">Realizado</span>
        <span className="text-lg font-bold leading-tight text-white">
          {percent !== null ? `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
        </span>
      </div>
    </div>
  );
}
function compactStatus(value: React.ReactNode): React.ReactNode {
  if (
    typeof value === "string" &&
    (value === "EXTRACTED" || value === "PROCESSED")
  ) {
    return (
      <span className="inline-flex rounded-md bg-emerald-600 px-2.5 py-1 text-[15px] font-semibold leading-none text-white">
        OK
      </span>
    );
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

function inclusiveDaysBetween(
  startDate: string | null,
  endDate: string | null
): number | null {
  if (!startDate || !endDate) return null;

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return Math.floor((end - start) / 86400000) + 1;
}

// Dias inteiros desde um instante, calculados a cada renderização da página
// (rota dinâmica): o contador "dias sem acidente" acompanha o relógio.
function elapsedDaysSince(timestamp: number): number {
  return Math.max(
    0,
    Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
  );
}

function isImpraticavel(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() === "impraticavel"
  );
}

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

  const { data: rdoRows } = mppStartDate
    ? await supabase
        .from("diario_de_obra_reports")
        .select("reference_date,weather")
        .eq("project_id", projectId)
        .gte("reference_date", mppStartDate)
        .lte("reference_date", mppEndDate ?? "9999-12-31")
        .order("reference_date", { ascending: true })
    : { data: [] };

  const latestRdoDate =
    (rdoRows ?? [])
      .map((row) => row.reference_date)
      .filter((value): value is string => typeof value === "string")
      .at(-1) ?? null;

  const elapsedDays = inclusiveDaysBetween(mppStartDate, latestRdoDate);

  const equivalentNonWorkedDays = (rdoRows ?? []).reduce((total, row) => {
    const weather = asObject(row.weather);
    const morning = asObject(weather?.manha);
    const afternoon = asObject(weather?.tarde);

    let equivalent = 0;

    if (morning?.ativo !== false && isImpraticavel(morning?.condicao)) {
      equivalent += 0.5;
    }

    if (afternoon?.ativo !== false && isImpraticavel(afternoon?.condicao)) {
      equivalent += 0.5;
    }

    return total + equivalent;
  }, 0);

  const climateImpactPercent =
    elapsedDays && elapsedDays > 0
      ? (equivalentNonWorkedDays / elapsedDays) * 100
      : null;

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

  // Valor original do contrato-base WEG:
  // Cláusula 5.1 = R$ 33.450.000,00.
  //
  // A fonte estruturada de aditivos ainda pode retornar zero.
  // Enquanto isso, usamos a diferença comprovável entre o
  // valor vigente do relatório e o contrato-base.
  const dashboardBaseContractValue = 33_450_000;

  const dashboardAdditives =
    dashboardContractTotal !== null
      ? Math.max(0, dashboardContractTotal - dashboardBaseContractValue)
      : formalizedVariation !== 0
        ? formalizedVariation
        : null;

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
  // SSMA — fonte oficial: formulários SSMA
  // ----------------------------------------------------------

  const { data: dashboardSsmaForms } = await supabase
    .from("ssma_form_submissions")
    .select(
      "id,checklist_slug,checklist_title,occurred_at,field_values,checklist_values,risk_level,status"
    )
    .eq("project_id", projectId)
    .eq("status", "SUBMITTED")
    .order("occurred_at", { ascending: false });

  const submittedSsmaForms = dashboardSsmaForms ?? [];

  const ssmaFormText = (
    row: (typeof submittedSsmaForms)[number]
  ): string =>
    [
      row.checklist_slug,
      row.checklist_title,
      JSON.stringify(row.field_values ?? {}),
      JSON.stringify(row.checklist_values ?? {}),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR");

  const accidentWithLeaveRows = submittedSsmaForms.filter((row) => {
    const text = ssmaFormText(row);

    return (
      /acidente/.test(text) &&
      !/quase[\s-]*acidente/.test(text) &&
      /com[\s-]*afastamento|afastamento[\s-]*sim/.test(text)
    );
  });

  const accidentWithoutLeaveRows = submittedSsmaForms.filter((row) => {
    const text = ssmaFormText(row);

    return (
      /acidente/.test(text) &&
      !/quase[\s-]*acidente/.test(text) &&
      /sem[\s-]*afastamento|afastamento[\s-]*(não|nao)/.test(text)
    );
  });

  const safetyOccurrenceRows = submittedSsmaForms.filter((row) => {
    const text = ssmaFormText(row);

    return (
      /ocorr[eê]ncia/.test(text) ||
      /incidente/.test(text) ||
      /quase[\s-]*acidente/.test(text) ||
      /desvio[\s-]*(de[\s-]*)?seguran/.test(text)
    );
  });

  const accidentRows = submittedSsmaForms.filter((row) => {
    const text = ssmaFormText(row);

    return (
      /acidente/.test(text) &&
      !/quase[\s-]*acidente/.test(text)
    );
  });

  const dashboardAccidentsWithLeave =
    accidentWithLeaveRows.length > 0
      ? accidentWithLeaveRows.length
      : null;

  const dashboardAccidentsWithoutLeave =
    accidentWithoutLeaveRows.length > 0
      ? accidentWithoutLeaveRows.length
      : null;

  const dashboardSafetyOccurrences =
    safetyOccurrenceRows.length > 0
      ? safetyOccurrenceRows.length
      : null;

  const latestAccidentTimestamp =
    accidentRows
      .map((row) => row.occurred_at)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0] ?? null;

  const dashboardDaysWithoutAccident =
    latestAccidentTimestamp !== null
      ? elapsedDaysSince(latestAccidentTimestamp)
      : null;

  const activeIntegrations =
    data.integrationStatusGroups.find(
      (group) => group.status === "CONECTADO"
    )?.count ?? 0;

  const totalIntegrations = data.integrationStatusGroups.reduce(
    (sum, group) => sum + group.count,
    0
  );

  const highestRisk =
    data.generalSituation === "SEM_RISCO_ATIVO"
      ? "SEM RISCO"
      : data.generalSituation === "CRITICA"
        ? "CRÍTICO"
        : data.generalSituation === "ALTA"
          ? "ALTO"
          : data.generalSituation === "MEDIA"
            ? "MÉDIO"
            : "BAIXO";


  const systemStatus = resolveSystemStatus(data.integrationStatusGroups);

  return (
    <div className="-m-6 min-h-full bg-[var(--dashboard-bg)] p-2 text-white xl:h-[calc(100%+3rem)] xl:overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-col gap-2">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263b5c] pb-1.5">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#c9d6e8]">AXION CONTROLE DE CONTRATOS</p>

            <h1 className="text-xl font-semibold leading-tight tracking-tight text-white">
              Dashboard Executivo
              <span className="ml-3 text-[15px] font-normal text-[#c9d6e8]">
                {data.project?.name ?? "Projeto não disponível"}
                {" · "}
                {data.project?.code ?? "Código não disponível"}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
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
                <span className="block whitespace-nowrap text-center text-[14px] font-bold uppercase tracking-wide leading-none">
                  {systemStatus.label}
                </span>
              </div>
              {systemStatus.reason ? (
                <p className="max-w-[360px] text-[13px] leading-tight text-[#c9d6e8]">{systemStatus.reason}</p>
              ) : null}
            </div>

            <div className="rounded-[5px] border border-[#263b5c] bg-[#182941] px-3 py-1 text-right">
              <p className="text-[12px] uppercase tracking-wider text-[#b8c7dc]">Atualização operacional</p>
              <p className="text-[14px] font-semibold text-white">Dados persistidos no ACC</p>
            </div>
          </div>
        </header>

        {/* KPIs — números centralizados */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <ExecutiveKpi
            label="Alertas ativos"
            value={data.activeFindingsSummary.totalActive}
            subtitle="Achados ainda ativos"
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
                      : highestRisk === "MÉDIO"
                        ? "text-amber-300"
                        : "text-[#2fbf71]"
                }
              >
                {highestRisk}
              </span>
            }
            subtitle="Situação consolidada"
            icon={TriangleAlert}
          />

          <ExecutiveKpi
            label="Integrações"
            value={`${activeIntegrations}/${totalIntegrations}`}
            subtitle="Fontes conectadas"
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

        <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-4">
          {/* COLUNA 1 */}
          <div className="flex flex-col gap-2">
            <Panel title="Situação contratual">
              <StatusLine
                label="Alertas ativos"
                value={data.activeFindingsSummary.totalActive}
                status={data.activeFindingsSummary.totalActive > 0 ? "warning" : "ok"}
              />
              <StatusLine label="Ações pendentes" value={data.slaSummary.pending} status={data.slaSummary.pending > 0 ? "warning" : "ok"} />
              <StatusLine
                label="Ações vencidas"
                value={data.slaSummary.overdue}
                status={data.slaSummary.overdue > 0 ? "error" : "ok"}
              />
              <StatusLine
                label="Escalonamentos"
                value={data.slaSummary.escalated}
                status={data.slaSummary.escalated > 0 ? "warning" : "ok"}
              />
              <StatusLine
                label="Data de início"
                value={formatDashboardDate(contractStartDate)}
                status={contractStartDate ? "ok" : "neutral"}
              />
              <StatusLine
                label="Data de término"
                value={formatDashboardDate(dashboardContractEndDate)}
                status={dashboardContractEndDate ? "ok" : "neutral"}
              />
            </Panel>

            <Panel title="Financeiro resumido — R$ mil">
              <StatusLine
                label="Contrato + aditivos"
                value={formatDashboardMil(dashboardContractTotal)}
                status={dashboardContractTotal !== null ? "ok" : "neutral"}
              />
              <StatusLine
                label="Aditivos"
                value={formatDashboardMil(dashboardAdditives)}
                status={dashboardAdditives !== null ? "ok" : "neutral"}
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
              <p className="pt-1 text-[12px] leading-tight text-[#b8c7dc]">
                Valores em R$ mil · realizado inclui faturamento AXION + faturamento direto WEG.
              </p>
            </Panel>

            <Panel title="SSMA — Segurança">
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
                label="Dias sem acidente"
                value={dashboardDaysWithoutAccident !== null ? dashboardDaysWithoutAccident : "—"}
                status={dashboardDaysWithoutAccident !== null ? "ok" : "neutral"}
              />
              <p className="pt-1 text-[12px] leading-tight text-[#b8c7dc]">Fonte: formulários SSMA registrados no ACC.</p>
            </Panel>
          </div>

          {/* COLUNA 2 */}
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
                  <p className="pt-1 text-[12px] leading-tight text-[#b8c7dc]">
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

          {/* COLUNA 3 */}
          <div className="flex flex-col gap-2">
            <Panel title="Planejamento — recebimento por e-mail">
              <StatusLine
                label="Cronograma atualizado"
                value={scheduleAttachment ? scheduleAttachment.processing_status : "Não recebido"}
                status={scheduleAttachment ? "ok" : "warning"}
              />

              {scheduleEmail ? (
                <details className="pb-1 pl-4 text-[13px] leading-snug text-[#c9d6e8]">
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
                label="Relatório semanal"
                value={latestWorkbook?.status ?? weeklyAttachment?.processing_status ?? "Não recebido"}
                status={weeklyAttachment ? "ok" : "warning"}
              />

              {weeklyEmail ? (
                <details className="pb-1 pl-4 text-[13px] leading-snug text-[#c9d6e8]">
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
                  value={elapsedDays ?? "Não disponível"}
                  status={elapsedDays !== null ? "ok" : "neutral"}
                />
                <StatusLine
                  label="Dias não trabalhados"
                  value={equivalentNonWorkedDays.toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  status={equivalentNonWorkedDays > 0 ? "warning" : "ok"}
                />
                <StatusLine
                  label="Impacto climático"
                  value={
                    climateImpactPercent !== null
                      ? `${climateImpactPercent.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}%`
                      : "Não disponível"
                  }
                  status={climateImpactPercent !== null && climateImpactPercent > 0 ? "warning" : "ok"}
                />
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
                  <p className="text-right text-[12px] text-[#b8c7dc]">Histograma {dashboardCurrentWorkforcePeriod}</p>
                ) : null}
              </div>
            </Panel>

            <Panel title="Relatório semanal processado">
              <StatusLine
                label="Curva S"
                value={sheetByCategory.get("CURVA_S")?.status ?? "Ausente"}
                status={sheetByCategory.get("CURVA_S") ? "ok" : "neutral"}
              />
              <StatusLine
                label="Linha de Base"
                value={sheetByCategory.get("LINHA_BASE")?.status ?? "Ausente"}
                status={sheetByCategory.get("LINHA_BASE") ? "ok" : "neutral"}
              />
              <StatusLine
                label="Financeiro"
                value={sheetByCategory.get("FINANCEIRO")?.status ?? "Ausente"}
                status={sheetByCategory.get("FINANCEIRO") ? "ok" : "neutral"}
              />
              <StatusLine
                label="SSMA"
                value={sheetByCategory.get("SSMA")?.status ?? "Ausente"}
                status={sheetByCategory.get("SSMA") ? "ok" : "neutral"}
              />
            </Panel>
          </div>

          {/* COLUNA 4 */}
          <div className="flex flex-col gap-2">
            <Panel title="Status das integrações">
              {data.integrationStatusGroups.flatMap((group) =>
                group.labels.map((label) => (
                  <div
                    key={`${group.status}-${label}`}
                    className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-[3px] last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          group.status === "CONECTADO"
                            ? "bg-emerald-400"
                            : group.status === "ATENCAO"
                              ? "bg-amber-400"
                              : group.status === "ERRO"
                                ? "bg-red-400"
                                : "bg-slate-400"
                        }`}
                      />
                      <span className="truncate text-[15px] font-medium text-white">{label}</span>
                    </div>

                    <span
                      className={`shrink-0 rounded-[3px] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide ${
                        group.status === "CONECTADO"
                          ? "bg-emerald-600 text-white"
                          : group.status === "ATENCAO"
                            ? "bg-amber-400 text-black"
                            : group.status === "ERRO"
                              ? "bg-red-600 text-white"
                              : "bg-slate-500 text-white"
                      }`}
                    >
                      {group.status === "CONECTADO"
                        ? "ATIVO"
                        : group.status === "ATENCAO"
                          ? "ATENÇÃO"
                          : group.status === "ERRO"
                            ? "ERRO"
                            : "PENDENTE"}
                    </span>
                  </div>
                ))
              )}
            </Panel>

            <Panel title="Distribuição dos alertas">
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["Baixo", data.activeFindingsSummary.countsBySeverity.BAIXA, "bg-emerald-500", "text-white"],
                  ["Médio", data.activeFindingsSummary.countsBySeverity.MEDIA, "bg-yellow-400", "text-black"],
                  ["Alto", data.activeFindingsSummary.countsBySeverity.ALTA, "bg-orange-500", "text-white"],
                  ["Crítico", data.activeFindingsSummary.countsBySeverity.CRITICA, "bg-red-500", "text-white"],
                ].map(([label, value, color, textColor]) => (
                  <div
                    key={String(label)}
                    className={`flex h-14 flex-col items-center justify-center rounded-[5px] ${color} ${textColor}`}
                  >
                    <span className="text-[13px] font-medium leading-none">{label}</span>
                    <span className="mt-1 text-xl font-bold leading-none">{Number(value)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="rounded-[7px] border border-[#263b5c] bg-[#182941] px-3 py-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#8fb8f0]" />
                <div>
                  <p className="text-[14px] font-semibold text-white">Atualização automática</p>
                  <p className="text-[12px] leading-snug text-[#b8c7dc]">
                    Cronograma, relatório semanal, financeiro e SSMA são exibidos somente após o respectivo e-mail/anexo
                    ter sido persistido e processado pelo ACC.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#263b5c] pt-1 text-[12px] text-[#b8c7dc]">
          <span>ACC · Dashboard executivo</span>
          <span>Nenhum indicador financeiro ou SSMA é estimado quando a fonte não está disponível.</span>
        </footer>
      </div>
    </div>
  );
}
