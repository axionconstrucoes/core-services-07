// Calendários de feriados do SLA — configuração EXPLÍCITA e versionada no
// código (puro, sem I/O). Um projeto só desconta feriados quando está
// mapeado em PROJECT_HOLIDAY_CALENDARS; sem mapeamento o comportamento é
// o anterior (só sábado/domingo).
//
// Fontes oficiais verificadas em 18/11/2026:
//  - Lei 662/1949, art. 1º, na redação da Lei 10.607/2002 (planalto.gov.br/ccivil_03/leis/l0662.htm):
//    1º/1, 21/4, 1º/5, 7/9, 2/11, 15/11 e 25/12.
//  - Lei 6.802/1980 (planalto.gov.br/ccivil_03/leis/l6802.htm): 12/10.
//  - Lei 14.759/2023 (planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm): 20/11.
//  - Lei 9.093/1995, art. 2º (planalto.gov.br/ccivil_03/leis/l9093.htm): feriado religioso da
//    Sexta-Feira da Paixão (incluída expressamente no limite de dias de guarda) — observada em
//    todo o país; incluída no calendário nacional do SLA.
//  - Espírito Santo: Lei Estadual 11.010/2019 — Nossa Senhora da Penha, data magna do Estado
//    (art. 1º, II, da Lei 9.093/1995), na segunda-feira oito dias após o Domingo de Páscoa
//    (2026: 13/04, conforme calendário oficial do TRE-ES, Ato 237/2025).
//
// DECISÕES DOCUMENTADAS:
//  - Carnaval (segunda e terça) e Corpus Christi são PONTOS FACULTATIVOS no calendário federal
//    (não são feriados por lei federal) → NÃO descontados.
//  - 23/05 (Colonização do Solo Espírito-Santense) é ponto facultativo estadual → NÃO descontado.
//  - Linhares/ES: nenhum feriado municipal foi confirmado por fonte oficial (lei municipal ou
//    Diário Oficial do município). O aniversário da cidade (22/08) aparece apenas em agregadores
//    não oficiais → PENDENTE DE CONFIRMAÇÃO, não incluído. Em 2026 (sábado) e 2027 (domingo)
//    cairia em fim de semana, sem efeito sobre o cálculo.
//
// Vigência validada: anos 2026 e 2027 (testes com as listas explícitas). As regras são
// calculadas (datas fixas + Páscoa) e valem para outros anos, mas qualquer ano fora de
// VALIDATED_YEARS deve ser revisado contra as fontes antes de confiar no resultado.

export type HolidayCalendarId = "BR" | "BR-ES" | "BR-ES-LINHARES";

export const VALIDATED_YEARS: readonly number[] = [2026, 2027];

export interface HolidayEntry {
  /** YYYY-MM-DD (data civil local do projeto). */
  date: string;
  name: string;
  scope: "NACIONAL" | "ESTADUAL" | "MUNICIPAL";
  legalBasis: string;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): { year: number; month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function shiftDays(base: { year: number; month: number; day: number }, days: number): string {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function nationalHolidays(year: number): HolidayEntry[] {
  const fixed: Array<[number, number, string, string]> = [
    [1, 1, "Confraternização Universal", "Lei 662/1949 (red. Lei 10.607/2002)"],
    [4, 21, "Tiradentes", "Lei 662/1949 (red. Lei 10.607/2002)"],
    [5, 1, "Dia do Trabalho", "Lei 662/1949 (red. Lei 10.607/2002)"],
    [9, 7, "Independência do Brasil", "Lei 662/1949 (red. Lei 10.607/2002)"],
    [10, 12, "Nossa Senhora Aparecida", "Lei 6.802/1980"],
    [11, 2, "Finados", "Lei 662/1949 (red. Lei 10.607/2002)"],
    [11, 15, "Proclamação da República", "Lei 662/1949 (red. Lei 10.607/2002)"],
    [11, 20, "Dia Nacional de Zumbi e da Consciência Negra", "Lei 14.759/2023"],
    [12, 25, "Natal", "Lei 662/1949 (red. Lei 10.607/2002)"],
  ];
  const entries: HolidayEntry[] = fixed.map(([m, d, name, legalBasis]) => ({
    date: ymd(year, m, d),
    name,
    scope: "NACIONAL",
    legalBasis,
  }));
  entries.push({
    date: shiftDays(easterSunday(year), -2),
    name: "Sexta-Feira da Paixão",
    scope: "NACIONAL",
    legalBasis: "Lei 9.093/1995, art. 2º",
  });
  return entries;
}

function espiritoSantoHolidays(year: number): HolidayEntry[] {
  return [
    {
      date: shiftDays(easterSunday(year), 8),
      name: "Nossa Senhora da Penha (data magna do ES)",
      scope: "ESTADUAL",
      legalBasis: "Lei Estadual ES 11.010/2019",
    },
  ];
}

// Linhares/ES: nenhum feriado municipal confirmado por fonte oficial (ver cabeçalho).
function linharesHolidays(): HolidayEntry[] {
  return [];
}

export function holidaysFor(calendarId: HolidayCalendarId, year: number): HolidayEntry[] {
  switch (calendarId) {
    case "BR":
      return nationalHolidays(year);
    case "BR-ES":
      return [...nationalHolidays(year), ...espiritoSantoHolidays(year)];
    case "BR-ES-LINHARES":
      return [...nationalHolidays(year), ...espiritoSantoHolidays(year), ...linharesHolidays()];
  }
}

const dateSetCache = new Map<string, Set<string>>();

/** true quando a data civil (YYYY-MM-DD local) é feriado no calendário informado. */
export function isHoliday(calendarId: HolidayCalendarId, year: number, month: number, day: number): boolean {
  const key = `${calendarId}:${year}`;
  let set = dateSetCache.get(key);
  if (!set) {
    set = new Set(holidaysFor(calendarId, year).map((h) => h.date));
    dateSetCache.set(key, set);
  }
  return set.has(ymd(year, month, day));
}

/**
 * Mapeamento EXPLÍCITO projeto → calendário (sem migration). A WEG (Fábrica de Fios, Linhares/ES —
 * cidade inferida do nome do projeto; o campo `location` do cadastro não traz cidade/UF) usa o
 * calendário nacional + Espírito Santo (+ municipal de Linhares quando confirmado).
 */
export const PROJECT_HOLIDAY_CALENDARS: Readonly<Record<string, HolidayCalendarId>> = {
  "00000000-0000-4000-8000-000000000001": "BR-ES-LINHARES",
};

export function holidayCalendarForProject(projectId: string | null | undefined): HolidayCalendarId | undefined {
  if (!projectId) return undefined;
  return PROJECT_HOLIDAY_CALENDARS[projectId];
}
