// Dashboard dos QUATRO PILARES (PRAZO, CUSTO, SEGURANÇA, QUALIDADE) + painel JURÍDICO/SEGUROS — modelo PURO.
// Sem I/O, sem rede, sem IA. Recebe linhas já lidas sob RLS (lib/pilares/data.ts) e devolve KPIs com fonte e fórmula.
//
// REGRAS (CLAUDE.md 11/12; brief da fase 2):
//  - SEM DADOS explícito: fonte indisponível (null) OU fonte sem nenhum registro no projeto => value = null (nunca 0).
//    Zero só aparece quando há registros na fonte e nenhum atende ao critério (zero verdadeiro).
//  - Criticidade = "pior pilar domina" (computeCriticality de lib/quality/criticality) sobre as consequências ABERTAS;
//    nunca média; probabilidade não entra na severidade.
//  - Valores monetários só somam linhas com valor registrado (a tabela já exige fonte); estimado e realizado nunca se misturam.
//  - Nada aqui calcula indenização, cobertura ou prazo contratual: só conta/soma fatos registrados e informa a fonte.

import { computeCriticality, type CriticalityResult } from "@/lib/quality/criticality";
import { PILLARS, type Pillar, type Severity } from "@/lib/quality/types";

export const NO_DATA_LABEL = "SEM DADOS";

export type PillarsPanelId = "PRAZO" | "CUSTO" | "SEGURANCA" | "QUALIDADE" | "JURIDICO_SEGUROS";

export type KpiUnit = "contagem" | "BRL" | "percentual" | "dias" | "data";

export interface PillarKpi {
  /** Identificador estável do KPI dentro do painel. */
  id: string;
  /** helpId (catálogo lib/ui/help/modules/pilares.ts) com fórmula, fonte, unidade, atualização e dado ausente. */
  helpId: string;
  label: string;
  unit: KpiUnit;
  /** null = SEM DADOS. */
  value: number | string | null;
  /** Texto exibido (SEM DADOS quando value é null). */
  display: string;
  /** Linha de contexto (denominador, motivo do SEM DADOS, ressalva). */
  detail: string | null;
  /** Fonte resumida (tabela/RPC) exibida no cartão. */
  source: string;
  /** Tom visual semântico (nunca é a única pista: o valor e o rótulo sempre aparecem em texto). */
  tone: "neutral" | "attention" | "critical" | "nodata";
  /** Rota relativa ao projeto (ex.: "qualidade") para aprofundar; null quando a tela de destino não depende deste módulo. */
  href: string | null;
}

export interface PillarsPanel {
  id: PillarsPanelId;
  title: string;
  helpId: string;
  /** Pior severidade aberta do pilar (só PRAZO/CUSTO/SEGURANÇA/QUALIDADE); null = SEM DADOS de consequência no pilar. */
  worstSeverity: Severity | null;
  kpis: PillarKpi[];
}

// ---------------------------------------------------------------- entradas (linhas já lidas)
export interface NcrRow { id: string; code: string; title: string; state: string; criticality: string; reopen_count: number | null }
export interface WarrantyRow { id: string; code: string; service_system: string; state: string; criticality: string; due_date: string | null; estimated_cost: number | null; actual_cost: number | null }
export interface ComplaintRow { id: string; status: string }
export interface InspectionRow { id: string; result: string }
export interface RecurrenceRow { id: string }
export interface RepairRow { id: string; is_recurrence: boolean }
export interface ActionRow { id: string; status: string; due_date: string | null }
export interface ConsequenceRow {
  id: string;
  ncr_id: string | null;
  warranty_case_id: string | null;
  pillar: string;
  severity: string;
  status: string;
  description: string | null;
  source_ref: string;
}
export interface NonQualityCostRow { id: string; category: string; estimated_amount: number | null; actual_amount: number | null }
export interface InsuranceItemRow { kind: string; entity_type: string; entity_id: string; title: string; severity: string; days_to_due: number | null }
export interface ClaimRow { id: string; stage: string; claimed_amount: number | null }
export interface InsuranceTotals { instruments: number; endorsements: number; advances: number; claims: number }

export interface ScheduleFacts {
  /** Término contratual (baseline) do projeto; null = SEM DADOS. */
  baselineEndDate: string | null;
  /** Soma de dias de extensão solicitados (lib/dashboard-visual/compute-deadline-summary); null = sem alterações com extensão. */
  requestedExtensionDays: number | null;
  /** Avanço físico real (% da Curva S do último relatório semanal); null = SEM DADOS. */
  physicalProgressPercent: number | null;
  /** Atividades do MPP vinculado (status/datas); null = sem cronograma processado. */
  activities: Array<{ status: string; baseline_end: string; planned_end: string }> | null;
  /** Ações SLA vencidas (lib/dashboard-visual/compute-sla-summary); null = leitura indisponível. */
  overdueSlaActions: number | null;
}

export interface SafetyFacts {
  hasData: boolean;
  occurrences: number | null;
  accidentsWithLeave: number | null;
  criticalOpen: number | null;
  openCorrectiveActions: number | null;
  overdueCorrectiveActions: number | null;
}

export interface PillarsInput {
  /** AAAA-MM-DD no fuso do projeto (injetado: o modelo nunca lê o relógio). */
  today: string;
  schedule: ScheduleFacts;
  safety: SafetyFacts | null;
  /** Alertas de risco ABERTOS críticos/altos (lib/dashboard/risk-alert-cases-summary); null = indisponível. */
  openRiskAlerts: { critical: number; high: number; total: number } | null;
  quality: {
    ncrs: NcrRow[] | null;
    warranties: WarrantyRow[] | null;
    complaints: ComplaintRow[] | null;
    inspections: InspectionRow[] | null;
    recurrences: RecurrenceRow[] | null;
    repairs: RepairRow[] | null;
    actions: ActionRow[] | null;
    consequences: ConsequenceRow[] | null;
    nonQualityCosts: NonQualityCostRow[] | null;
  };
  insurance: { items: InsuranceItemRow[] | null; claims: ClaimRow[] | null; totals: InsuranceTotals | null };
}

export interface TopConsequence {
  id: string;
  pillar: Pillar;
  severity: Severity;
  description: string | null;
  sourceRef: string;
  entity: { type: "NCR" | "WARRANTY"; id: string; code: string | null };
}

export interface PillarsDashboard {
  panels: PillarsPanel[];
  /** Criticidade geral (pior pilar domina) sobre as consequências abertas; "SEM_DADOS" sem consequência. */
  criticality: CriticalityResult;
  /** Consequências abertas HIGH/CRITICAL com a fonte (rastreabilidade), da mais grave para a menos grave. */
  topConsequences: TopConsequence[];
  consequencesTotal: number | null;
}

// ---------------------------------------------------------------- estados "abertos" (espelham as máquinas de estado/CHECKs)
const NCR_CLOSED = new Set(["ENCERRADA", "NAO_CONFIRMADA", "DUPLICADA", "CANCELADA"]);
const WARRANTY_CLOSED = new Set(["ENCERRADA", "CANCELADA"]);
const COMPLAINT_CLOSED = new Set(["ENCERRADA", "IMPROCEDENTE"]);
const CONSEQUENCE_OPEN = new Set(["ABERTA", "EM_TRATAMENTO"]);
const ACTION_OPEN = new Set(["PLANEJADA", "EM_ANDAMENTO"]);
const SEVERITY_RANK: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export const isNcrOpen = (state: string): boolean => !NCR_CLOSED.has(state);
export const isWarrantyOpen = (state: string): boolean => !WARRANTY_CLOSED.has(state);
export const isConsequenceOpen = (status: string): boolean => CONSEQUENCE_OPEN.has(status);

// ---------------------------------------------------------------- formatação
const nf = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

interface KpiArgs {
  id: string;
  helpId: string;
  label: string;
  unit: KpiUnit;
  value: number | string | null;
  detail?: string | null;
  source: string;
  tone?: PillarKpi["tone"];
  href?: string | null;
  /** Motivo do SEM DADOS (substitui detail quando value é null). */
  noDataReason?: string;
}

function kpi(a: KpiArgs): PillarKpi {
  const nodata = a.value === null;
  let display = NO_DATA_LABEL;
  if (!nodata) {
    if (a.unit === "BRL") display = brl.format(a.value as number);
    else if (a.unit === "percentual") display = `${(a.value as number).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    else if (a.unit === "dias") display = `${nf.format(a.value as number)} d`;
    else if (a.unit === "data") display = fmtDate(String(a.value));
    else display = typeof a.value === "number" ? nf.format(a.value) : String(a.value);
  }
  return {
    id: a.id,
    helpId: a.helpId,
    label: a.label,
    unit: a.unit,
    value: a.value,
    display,
    detail: nodata ? (a.noDataReason ?? a.detail ?? null) : (a.detail ?? null),
    source: a.source,
    tone: nodata ? "nodata" : (a.tone ?? "neutral"),
    href: a.href ?? null,
  };
}

/** Conta linhas que atendem ao critério. null (SEM DADOS) quando a fonte está indisponível ou não tem NENHUM registro. */
function countWhere<T>(rows: T[] | null, pred: (r: T) => boolean): number | null {
  if (rows === null || rows.length === 0) return null;
  return rows.filter(pred).length;
}

/** Soma só valores registrados; null quando nenhuma linha tem valor (nunca 0 por omissão). */
function sumRegistered<T>(rows: T[] | null, pick: (r: T) => number | null, where: (r: T) => boolean = () => true): number | null {
  if (rows === null) return null;
  const values = rows.filter(where).map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + Number(v), 0) * 100) / 100;
}

function toneForCount(n: number | null, critical = false): PillarKpi["tone"] {
  if (n === null) return "nodata";
  if (n > 0) return critical ? "critical" : "attention";
  return "neutral";
}

const NO_SOURCE = "fonte indisponível ou sem registros no projeto";

// ---------------------------------------------------------------- consequências abertas
function openConsequences(rows: ConsequenceRow[] | null): ConsequenceRow[] {
  return (rows ?? []).filter((c) => isConsequenceOpen(c.status) && c.pillar in { PRAZO: 1, CUSTO: 1, SEGURANCA: 1, QUALIDADE: 1 } && c.severity in SEVERITY_RANK);
}

function pillarConsequenceCount(rows: ConsequenceRow[] | null, pillar: Pillar): number | null {
  if (rows === null || rows.length === 0) return null;
  return rows.filter((c) => c.pillar === pillar && isConsequenceOpen(c.status)).length;
}

// ---------------------------------------------------------------- construção do dashboard
export function buildPillarsDashboard(input: PillarsInput): PillarsDashboard {
  const q = input.quality;
  const open = openConsequences(q.consequences);
  const criticality = computeCriticality(
    open.map((c) => ({ pillar: c.pillar as Pillar, severity: c.severity as Severity, sourceRef: c.source_ref })),
  );
  const worst = (p: Pillar): Severity | null => criticality.byPillar[p];

  const ncrCode = new Map((q.ncrs ?? []).map((n) => [n.id, n.code]));
  const warrantyCode = new Map((q.warranties ?? []).map((w) => [w.id, w.code]));
  const topConsequences: TopConsequence[] = open
    .filter((c) => c.severity === "HIGH" || c.severity === "CRITICAL")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 8)
    .map((c) => {
      const entity = c.ncr_id
        ? ({ type: "NCR", id: c.ncr_id, code: ncrCode.get(c.ncr_id) ?? null } as const)
        : ({ type: "WARRANTY", id: c.warranty_case_id ?? "", code: warrantyCode.get(c.warranty_case_id ?? "") ?? null } as const);
      return { id: c.id, pillar: c.pillar as Pillar, severity: c.severity as Severity, description: c.description, sourceRef: c.source_ref, entity };
    });

  // ---------- PRAZO
  const s = input.schedule;
  const activities = s.activities && s.activities.length > 0 ? s.activities : null;
  const delayed = activities ? activities.filter((a) => a.status === "ATRASADA").length : null;
  const deviations = activities
    ? activities.map((a) => Math.round((Date.parse(a.planned_end) - Date.parse(a.baseline_end)) / 86_400_000)).filter((d) => Number.isFinite(d))
    : [];
  const maxDeviation = activities && deviations.length ? Math.max(0, ...deviations) : null;
  const prazo: PillarsPanel = {
    id: "PRAZO",
    title: "PRAZO",
    helpId: "pilares.pagina.painel-prazo",
    worstSeverity: worst("PRAZO"),
    kpis: [
      kpi({ id: "termino-baseline", helpId: "pilares.prazo.kpi-termino-baseline", label: "Término contratual (baseline)", unit: "data", value: s.baselineEndDate, source: "projects.baseline_end_date", noDataReason: "Data de término da baseline não cadastrada." }),
      kpi({ id: "extensao-solicitada", helpId: "pilares.prazo.kpi-extensao-solicitada", label: "Prorrogação solicitada", unit: "dias", value: s.requestedExtensionDays, source: "contract_changes (EXTENSION_REQUIRED)", detail: "Solicitada, não aprovada formalmente.", noDataReason: "Nenhuma alteração contratual com extensão de prazo registrada." }),
      kpi({ id: "avanco-fisico", helpId: "pilares.prazo.kpi-avanco-fisico", label: "Avanço físico", unit: "percentual", value: s.physicalProgressPercent, source: "weekly_report_sheets (CURVA_S)", noDataReason: "Sem Curva S no último relatório semanal processado." }),
      kpi({ id: "atividades-atrasadas", helpId: "pilares.prazo.kpi-atividades-atrasadas", label: "Atividades atrasadas (MPP)", unit: "contagem", value: delayed, detail: activities ? `de ${nf.format(activities.length)} atividades do cronograma vinculado` : null, tone: toneForCount(delayed), source: "schedule_activities.status", noDataReason: "Sem cronograma (MPP) processado e vinculado." }),
      kpi({ id: "desvio-maximo", helpId: "pilares.prazo.kpi-desvio-maximo", label: "Maior desvio de término vs baseline", unit: "dias", value: maxDeviation, tone: maxDeviation !== null && maxDeviation > 0 ? "attention" : "neutral", source: "schedule_activities (planned_end - baseline_end)", noDataReason: "Sem atividades de cronograma para comparar." }),
      kpi({ id: "acoes-sla-vencidas", helpId: "pilares.prazo.kpi-acoes-sla-vencidas", label: "Ações SLA vencidas", unit: "contagem", value: s.overdueSlaActions, tone: toneForCount(s.overdueSlaActions, true), source: "sla_actions (computeSlaActionsSummary)", href: "acoes", noDataReason: "Leitura das ações SLA indisponível." }),
      kpi({ id: "impacto-retrabalho", helpId: "pilares.prazo.kpi-impacto-retrabalho", label: "Consequências de PRAZO abertas (RNC/garantia)", unit: "contagem", value: pillarConsequenceCount(q.consequences, "PRAZO"), detail: worst("PRAZO") ? `pior severidade aberta: ${worst("PRAZO")}` : null, tone: toneForCount(pillarConsequenceCount(q.consequences, "PRAZO")), source: "quality_consequences (pilar PRAZO)", noDataReason: "Nenhuma consequência registrada na Qualidade." }),
    ],
  };

  // ---------- CUSTO
  const costs = q.nonQualityCosts;
  const rework = sumRegistered(costs, (c) => c.actual_amount, (c) => c.category === "RETRABALHO");
  const nqActual = sumRegistered(costs, (c) => c.actual_amount);
  const nqEstimated = sumRegistered(costs, (c) => c.estimated_amount);
  const warrantyActual = sumRegistered(q.warranties, (w) => w.actual_cost);
  const warrantyEstimated = sumRegistered(q.warranties, (w) => w.estimated_cost);
  const claimed = sumRegistered(input.insurance.claims, (c) => c.claimed_amount, (c) => c.stage !== "ENCERRADO");
  const custo: PillarsPanel = {
    id: "CUSTO",
    title: "CUSTO",
    helpId: "pilares.pagina.painel-custo",
    worstSeverity: worst("CUSTO"),
    kpis: [
      kpi({ id: "retrabalho-realizado", helpId: "pilares.custo.kpi-retrabalho", label: "Retrabalho — realizado", unit: "BRL", value: rework, source: "quality_nonquality_costs (RETRABALHO, actual_amount)", href: "qualidade", noDataReason: "Nenhum custo de retrabalho com valor realizado e fonte registrada." }),
      kpi({ id: "nao-qualidade-realizado", helpId: "pilares.custo.kpi-nao-qualidade-realizado", label: "Custos de não qualidade — realizado", unit: "BRL", value: nqActual, source: "quality_nonquality_costs.actual_amount", href: "qualidade", noDataReason: "Nenhum custo de não qualidade com valor realizado registrado." }),
      kpi({ id: "nao-qualidade-estimado", helpId: "pilares.custo.kpi-nao-qualidade-estimado", label: "Custos de não qualidade — estimado", unit: "BRL", value: nqEstimated, source: "quality_nonquality_costs.estimated_amount", detail: "Estimativa registrada com fonte; não é previsão do sistema.", noDataReason: "Nenhum custo de não qualidade com valor estimado registrado." }),
      kpi({ id: "garantia-realizado", helpId: "pilares.custo.kpi-garantia-realizado", label: "Garantias — custo realizado", unit: "BRL", value: warrantyActual, source: "quality_warranty_cases.actual_cost", href: "garantias", noDataReason: "Nenhum caso de garantia com custo realizado registrado." }),
      kpi({ id: "garantia-estimado", helpId: "pilares.custo.kpi-garantia-estimado", label: "Garantias — custo estimado", unit: "BRL", value: warrantyEstimated, source: "quality_warranty_cases.estimated_cost", href: "garantias", noDataReason: "Nenhum caso de garantia com custo estimado registrado." }),
      kpi({ id: "exposicao-sinistros", helpId: "pilares.custo.kpi-exposicao", label: "Exposição — valor reclamado em sinistros em andamento", unit: "BRL", value: claimed, detail: "Soma do valor reclamado informado; não é indenização esperada.", source: "insurance_claims.claimed_amount (estágio ≠ ENCERRADO)", href: "seguros", noDataReason: "Nenhum sinistro em andamento com valor reclamado informado." }),
      kpi({ id: "consequencias-custo", helpId: "pilares.custo.kpi-consequencias-custo", label: "Consequências de CUSTO abertas", unit: "contagem", value: pillarConsequenceCount(q.consequences, "CUSTO"), detail: worst("CUSTO") ? `pior severidade aberta: ${worst("CUSTO")}` : null, tone: toneForCount(pillarConsequenceCount(q.consequences, "CUSTO")), source: "quality_consequences (pilar CUSTO)", noDataReason: "Nenhuma consequência registrada na Qualidade." }),
    ],
  };

  // ---------- SEGURANÇA
  const sf = input.safety;
  const seg = (v: number | null | undefined): number | null => (sf && sf.hasData && v !== null && v !== undefined ? v : null);
  const ra = input.openRiskAlerts;
  const seguranca: PillarsPanel = {
    id: "SEGURANCA",
    title: "SEGURANÇA",
    helpId: "pilares.pagina.painel-seguranca",
    worstSeverity: worst("SEGURANCA"),
    kpis: [
      kpi({ id: "ocorrencias", helpId: "pilares.seguranca.kpi-ocorrencias", label: "Ocorrências de segurança", unit: "contagem", value: seg(sf?.occurrences), tone: toneForCount(seg(sf?.occurrences)), source: "ssma_form_submissions + ssma_field_records (computeSsmaDashboardMetrics)", href: "esg", noDataReason: "Sem registros SSMA na obra." }),
      kpi({ id: "acidentes-afastamento", helpId: "pilares.seguranca.kpi-acidentes-afastamento", label: "Acidentes com afastamento", unit: "contagem", value: seg(sf?.accidentsWithLeave), tone: toneForCount(seg(sf?.accidentsWithLeave), true), source: "ssma_form_submissions (ocorrencia-acidente)", href: "esg", noDataReason: "Sem registros SSMA na obra." }),
      kpi({ id: "riscos-criticos-ssma", helpId: "pilares.seguranca.kpi-riscos-criticos", label: "Registros críticos de SSMA em aberto", unit: "contagem", value: seg(sf?.criticalOpen), tone: toneForCount(seg(sf?.criticalOpen), true), source: "ssma_field_records.risk_level", href: "esg", noDataReason: "Sem registros de campo SSMA na obra." }),
      kpi({ id: "alertas-criticos", helpId: "pilares.seguranca.kpi-alertas-criticos", label: "Alertas de risco abertos CRÍTICOS (todas as áreas)", unit: "contagem", value: ra ? ra.critical : null, detail: ra ? `${nf.format(ra.high)} ALTO(s) e ${nf.format(ra.total)} aberto(s) no total` : null, tone: toneForCount(ra ? ra.critical : null, true), source: "risk_alert_cases (summarizeRiskAlertCases)", noDataReason: "Leitura dos alertas de risco indisponível." }),
      kpi({ id: "acoes-pendentes", helpId: "pilares.seguranca.kpi-acoes-pendentes", label: "Ações corretivas SSMA pendentes", unit: "contagem", value: seg(sf?.openCorrectiveActions), detail: sf && sf.hasData && sf.overdueCorrectiveActions !== null ? `${nf.format(sf.overdueCorrectiveActions)} em atraso` : null, tone: toneForCount(seg(sf?.openCorrectiveActions)), source: "ssma_corrective_actions", href: "esg", noDataReason: "Sem registros de campo SSMA na obra." }),
      kpi({ id: "consequencias-seguranca", helpId: "pilares.seguranca.kpi-consequencias-seguranca", label: "Consequências de SEGURANÇA abertas (RNC/garantia)", unit: "contagem", value: pillarConsequenceCount(q.consequences, "SEGURANCA"), detail: worst("SEGURANCA") ? `pior severidade aberta: ${worst("SEGURANCA")}` : null, tone: toneForCount(pillarConsequenceCount(q.consequences, "SEGURANCA"), worst("SEGURANCA") === "CRITICAL"), source: "quality_consequences (pilar SEGURANCA)", noDataReason: "Nenhuma consequência registrada na Qualidade." }),
    ],
  };

  // ---------- QUALIDADE
  const ncrOpen = countWhere(q.ncrs, (n) => isNcrOpen(n.state));
  const ncrCritical = countWhere(q.ncrs, (n) => isNcrOpen(n.state) && n.criticality === "CRITICAL");
  const reopens = q.ncrs === null || q.ncrs.length === 0 ? null : q.ncrs.reduce((acc, n) => acc + (n.reopen_count ?? 0), 0);
  const complaintsOpen = countWhere(q.complaints, (c) => !COMPLAINT_CLOSED.has(c.status));
  const inspectionsNc = countWhere(q.inspections, (i) => i.result === "NAO_CONFORME" || i.result === "PARCIAL");
  const warrantyOpen = countWhere(q.warranties, (w) => isWarrantyOpen(w.state));
  const warrantyOverdue = countWhere(q.warranties, (w) => isWarrantyOpen(w.state) && w.due_date !== null && w.due_date < input.today);
  const recurrenceCount = q.recurrences === null || q.recurrences.length === 0 ? null : q.recurrences.length;
  const repairsRecurrent = countWhere(q.repairs, (r) => r.is_recurrence);
  const actionsOverdue = countWhere(q.actions, (a) => ACTION_OPEN.has(a.status) && a.due_date !== null && a.due_date < input.today);
  const qualidade: PillarsPanel = {
    id: "QUALIDADE",
    title: "QUALIDADE",
    helpId: "pilares.pagina.painel-qualidade",
    worstSeverity: worst("QUALIDADE"),
    kpis: [
      kpi({ id: "rnc-abertas", helpId: "pilares.qualidade.kpi-rnc-abertas", label: "RNC abertas", unit: "contagem", value: ncrOpen, detail: q.ncrs ? `de ${nf.format(q.ncrs.length)} RNC registradas` : null, tone: toneForCount(ncrOpen), source: "quality_ncrs.state", href: "qualidade", noDataReason: NO_SOURCE }),
      kpi({ id: "rnc-criticas", helpId: "pilares.qualidade.kpi-rnc-criticas", label: "RNC críticas abertas", unit: "contagem", value: ncrCritical, tone: toneForCount(ncrCritical, true), source: "quality_ncrs.criticality (pior pilar domina)", href: "qualidade", noDataReason: NO_SOURCE }),
      kpi({ id: "reaberturas", helpId: "pilares.qualidade.kpi-reaberturas", label: "Reaberturas de RNC (total)", unit: "contagem", value: reopens, tone: toneForCount(reopens), source: "quality_ncrs.reopen_count", href: "qualidade", noDataReason: NO_SOURCE }),
      kpi({ id: "reclamacoes", helpId: "pilares.qualidade.kpi-reclamacoes", label: "Reclamações de clientes em aberto", unit: "contagem", value: complaintsOpen, tone: toneForCount(complaintsOpen), source: "quality_customer_complaints.status", href: "qualidade", noDataReason: NO_SOURCE }),
      kpi({ id: "recorrencias", helpId: "pilares.qualidade.kpi-recorrencias", label: "Recorrências registradas", unit: "contagem", value: recurrenceCount, tone: toneForCount(recurrenceCount), source: "quality_recurrences", href: "qualidade", noDataReason: NO_SOURCE }),
      kpi({ id: "inspecoes-nc", helpId: "pilares.qualidade.kpi-inspecoes", label: "Inspeções não conformes ou parciais", unit: "contagem", value: inspectionsNc, detail: q.inspections ? `de ${nf.format(q.inspections.length)} inspeções` : null, tone: toneForCount(inspectionsNc), source: "quality_inspections.result", href: "qualidade", noDataReason: NO_SOURCE }),
      kpi({ id: "reparos-reincidentes", helpId: "pilares.qualidade.kpi-reparos", label: "Reparos reincidentes", unit: "contagem", value: repairsRecurrent, detail: q.repairs ? `de ${nf.format(q.repairs.length)} reparos` : null, tone: toneForCount(repairsRecurrent), source: "quality_warranty_repairs.is_recurrence", href: "garantias", noDataReason: NO_SOURCE }),
      kpi({ id: "garantias-pendentes", helpId: "pilares.qualidade.kpi-garantias-pendentes", label: "Garantias pendentes (casos abertos)", unit: "contagem", value: warrantyOpen, detail: warrantyOverdue !== null && warrantyOpen ? `${nf.format(warrantyOverdue)} com prazo de conclusão vencido` : null, tone: toneForCount(warrantyOpen), source: "quality_warranty_cases.state / due_date", href: "garantias", noDataReason: NO_SOURCE }),
      kpi({ id: "acoes-vencidas", helpId: "pilares.qualidade.kpi-acoes-vencidas", label: "Ações corretivas/preventivas vencidas", unit: "contagem", value: actionsOverdue, tone: toneForCount(actionsOverdue, true), source: "quality_corrective_actions.due_date", href: "qualidade", noDataReason: NO_SOURCE }),
    ],
  };

  // ---------- JURÍDICO / SEGUROS
  const items = input.insurance.items;
  const tot = input.insurance.totals;
  const claims = input.insurance.claims;
  const byKind = (kind: string, pred: (i: InsuranceItemRow) => boolean = () => true): number | null => (items === null ? null : items.filter((i) => i.kind === kind && pred(i)).length);
  const gated = (n: number | null, total: number | null | undefined): number | null => (n === null || !total ? null : n);
  const expired = gated(byKind("VENCIMENTO", (i) => i.severity === "VENCIDO"), tot?.instruments);
  const toExpire = gated(byKind("VENCIMENTO", (i) => i.severity === "A_VENCER"), tot?.instruments);
  const pendingEndorsements = gated(byKind("ENDOSSO_PENDENTE"), tot?.endorsements);
  const insufficient = gated(byKind("GARANTIA_INSUFICIENTE"), tot?.advances);
  const unknownGuarantee = gated(byKind("GARANTIA_SEM_DADOS"), tot?.advances);
  const claimsOpen = gated(byKind("SINISTRO_EM_ANDAMENTO"), tot?.claims);
  const claimsByStage = (stage: string): number | null => (claims === null || claims.length === 0 ? null : claims.filter((c) => c.stage === stage).length);
  const juridico: PillarsPanel = {
    id: "JURIDICO_SEGUROS",
    title: "JURÍDICO / SEGUROS",
    helpId: "pilares.pagina.painel-juridico-seguros",
    worstSeverity: null,
    kpis: [
      kpi({ id: "vencidos", helpId: "pilares.juridico.kpi-vencidos", label: "Apólices/garantias vencidas", unit: "contagem", value: expired, tone: toneForCount(expired, true), source: "insurance_dashboard_items (VENCIMENTO/VENCIDO)", href: "seguros", noDataReason: "Nenhuma apólice, fiança ou garantia cadastrada." }),
      kpi({ id: "a-vencer", helpId: "pilares.juridico.kpi-a-vencer", label: "Vencem em até 30 dias", unit: "contagem", value: toExpire, tone: toneForCount(toExpire), source: "insurance_dashboard_items (VENCIMENTO/A_VENCER)", href: "seguros", noDataReason: "Nenhuma apólice, fiança ou garantia cadastrada." }),
      kpi({ id: "endossos-pendentes", helpId: "pilares.juridico.kpi-endossos", label: "Endossos pendentes (sem efeito de cobertura)", unit: "contagem", value: pendingEndorsements, detail: "Pedido não é endosso emitido.", tone: toneForCount(pendingEndorsements), source: "insurance_dashboard_items (ENDOSSO_PENDENTE)", href: "seguros", noDataReason: "Nenhum endosso registrado." }),
      kpi({ id: "garantias-insuficientes", helpId: "pilares.juridico.kpi-garantia-insuficiente", label: "Garantias insuficientes (adiantamento)", unit: "contagem", value: insufficient, detail: unknownGuarantee ? `${nf.format(unknownGuarantee)} adiantamento(s) sem limite para comparar (SEM DADOS)` : null, tone: toneForCount(insufficient, true), source: "insurance_dashboard_items (GARANTIA_INSUFICIENTE)", href: "seguros", noDataReason: "Nenhum adiantamento registrado." }),
      kpi({ id: "sinistros-andamento", helpId: "pilares.juridico.kpi-sinistros", label: "Sinistros em andamento", unit: "contagem", value: claimsOpen, tone: toneForCount(claimsOpen), source: "insurance_dashboard_items (SINISTRO_EM_ANDAMENTO)", href: "seguros", noDataReason: "Nenhum sinistro registrado." }),
      kpi({ id: "expectativas", helpId: "pilares.juridico.kpi-expectativas", label: "Expectativas de sinistro (sem aviso)", unit: "contagem", value: claimsByStage("EXPECTATIVA"), tone: toneForCount(claimsByStage("EXPECTATIVA")), source: "insurance_claims.stage = EXPECTATIVA", href: "seguros", noDataReason: "Nenhum sinistro registrado." }),
      kpi({ id: "reclamacoes-seguradora", helpId: "pilares.juridico.kpi-reclamacoes", label: "Reclamações à seguradora/banco", unit: "contagem", value: claimsByStage("RECLAMACAO"), tone: toneForCount(claimsByStage("RECLAMACAO")), source: "insurance_claims.stage = RECLAMACAO", href: "seguros", noDataReason: "Nenhum sinistro registrado." }),
      kpi({ id: "indenizacoes", helpId: "pilares.juridico.kpi-indenizacoes", label: "Sinistros em estágio de indenização/cumprimento", unit: "contagem", value: claimsByStage("INDENIZACAO_CUMPRIMENTO"), detail: "Valor recebido: SEM DADOS (o modelo não registra valor de indenização recebida).", source: "insurance_claims.stage = INDENIZACAO_CUMPRIMENTO", href: "seguros", noDataReason: "Nenhum sinistro registrado." }),
    ],
  };

  return {
    panels: [prazo, custo, seguranca, qualidade, juridico],
    criticality,
    topConsequences,
    consequencesTotal: q.consequences === null ? null : q.consequences.length,
  };
}

export const PILLAR_LABELS: Record<Pillar, string> = { PRAZO: "Prazo", CUSTO: "Custo", SEGURANCA: "Segurança", QUALIDADE: "Qualidade" };
export const SEVERITY_LABELS: Record<Severity | "SEM_DADOS", string> = { LOW: "BAIXO", MEDIUM: "MÉDIO", HIGH: "ALTO", CRITICAL: "CRÍTICO", SEM_DADOS: NO_DATA_LABEL };
export { PILLARS };
