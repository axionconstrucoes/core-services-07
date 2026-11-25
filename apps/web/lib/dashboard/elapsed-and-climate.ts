// Prazo decorrido e impacto climático do Dashboard executivo. Puro, sem I/O.
//
// DIAS DECORRIDOS (calendário):
//   início = projects.project_start_date (data real de início da obra) ou, na
//   falta dela, projects.start_date (data contratual de início);
//   fim    = hoje (AAAA-MM-DD no fuso da obra, injetado pelo chamador);
//   contagem inclusiva (o dia de início conta como dia 1).
//   Antes dependia do MPP vinculado ao relatório semanal + último RDO e ficava
//   "Não disponível" sempre que o cronograma não estava processado, embora a
//   data de início da obra estivesse cadastrada e exibida no próprio painel.
//   Sem data de início, ou com início no futuro => indisponível com motivo.
//
// DIAS NÃO TRABALHADOS / IMPACTO CLIMÁTICO (RDO — Diário de Obra):
//   1 turno "impraticável" = 0,5 dia; 2 turnos = 1,0 dia (regra existente);
//   janela = [início da janela .. último RDO]; o início é a 1ª data do MPP
//   vinculado ao relatório semanal ou, sem MPP, a data de início da obra;
//   impacto (%) = dias não trabalhados ÷ dias da janela.
//   Sem nenhum RDO na janela => INDISPONÍVEL (nunca "0,0": ausência de RDO
//   não prova que não houve chuva/impraticabilidade).

export type Availability<T> = { available: true; value: T } | { available: false; reason: string };

export interface ElapsedDays {
  days: number;
  startDate: string;
  startSource: "PROJECT_START_DATE" | "CONTRACT_START_DATE";
}

function isDateOnly(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function inclusiveDaysBetween(startDate: string, endDate: string): number | null {
  if (!isDateOnly(startDate) || !isDateOnly(endDate)) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (end < start) return null;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function computeElapsedDays(input: {
  projectStartDate: string | null | undefined;
  contractStartDate: string | null | undefined;
  today: string;
}): Availability<ElapsedDays> {
  const fromProject = isDateOnly(input.projectStartDate) ? input.projectStartDate : null;
  const fromContract = isDateOnly(input.contractStartDate) ? input.contractStartDate : null;
  const startDate = fromProject ?? fromContract;
  if (!startDate) return { available: false, reason: "data de início da obra não cadastrada" };
  if (!isDateOnly(input.today)) return { available: false, reason: "data de referência inválida" };
  const days = inclusiveDaysBetween(startDate, input.today);
  if (days === null) return { available: false, reason: "obra ainda não iniciada (início futuro)" };
  return { available: true, value: { days, startDate, startSource: fromProject ? "PROJECT_START_DATE" : "CONTRACT_START_DATE" } };
}

export interface RdoWeatherRow {
  reference_date: string | null;
  weather: unknown;
}

export interface ClimateImpact {
  nonWorkedDays: number;
  windowDays: number;
  percent: number;
  windowStart: string;
  lastRdoDate: string;
  rdoCount: number;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isImpraticavel(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase() === "impraticavel"
  );
}

/** Dia-equivalente não trabalhado de um RDO (0, 0,5 ou 1). Turno inativo (ativo === false) não conta. */
export function rdoEquivalentNonWorkedDay(weather: unknown): number {
  const w = asObject(weather);
  let equivalent = 0;
  for (const shift of [asObject(w?.manha), asObject(w?.tarde)]) {
    if (shift?.ativo !== false && isImpraticavel(shift?.condicao)) equivalent += 0.5;
  }
  return equivalent;
}

export function computeClimateImpact(input: { rows: readonly RdoWeatherRow[]; windowStart: string | null }): Availability<ClimateImpact> {
  if (!isDateOnly(input.windowStart)) {
    return { available: false, reason: "sem data de início (MPP ou início da obra) para delimitar o período" };
  }
  const windowStart = input.windowStart;
  const rows = input.rows.filter((row) => isDateOnly(row.reference_date) && (row.reference_date as string) >= windowStart);
  if (rows.length === 0) return { available: false, reason: "nenhum RDO (Diário de Obra) recebido no período" };
  const lastRdoDate = rows.map((row) => row.reference_date as string).sort().at(-1) as string;
  const windowDays = inclusiveDaysBetween(windowStart, lastRdoDate);
  if (!windowDays) return { available: false, reason: "período do RDO inválido" };
  const nonWorkedDays = rows.reduce((total, row) => total + rdoEquivalentNonWorkedDay(row.weather), 0);
  return {
    available: true,
    value: { nonWorkedDays, windowDays, percent: (nonWorkedDays / windowDays) * 100, windowStart, lastRdoDate, rdoCount: rows.length },
  };
}
