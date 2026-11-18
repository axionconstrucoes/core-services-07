// Calendário de feriados do SLA (lib/sla/holidays/calendars.ts + time-units.ts):
// listas explícitas 2026/2027, pontos facultativos fora, horas/dias úteis
// cruzando feriado, mapeamento explícito por projeto. Puro, sem banco.
//
// Uso:
//   node scripts/test-sla-holidays.mjs

import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { holidaysFor, isHoliday, easterSunday, holidayCalendarForProject, VALIDATED_YEARS } = await import(
  "../apps/web/lib/sla/holidays/calendars"
);
const { addBusinessHours, addBusinessDays, addTimeUnits, AXION_DEFAULT_BUSINESS_HOURS_CONFIG } = await import(
  "../apps/web/lib/sla/time-units"
);
const { resolveBusinessHoursConfig } = await import("../apps/web/lib/sla/resolve-matrix-rule");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");

const WEG = "00000000-0000-4000-8000-000000000001";
const OTHER = "11111111-1111-4111-8111-111111111111";
const CAL = { ...AXION_DEFAULT_BUSINESS_HOURS_CONFIG, holidayCalendarId: "BR-ES-LINHARES" };
const NOCAL = AXION_DEFAULT_BUSINESS_HOURS_CONFIG;

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}
function eq(actual, expected, label = "") {
  if (actual !== expected) throw new Error(`${label} esperado ${expected}, obtido ${actual}`);
}
// Brasília (UTC-3, sem horário de verão desde 2019).
const brt = (s) => new Date(`${s}:00-03:00`);
const iso = (d) => d.toISOString();

check("Páscoa 2026 = 05/04 e 2027 = 28/03", () => {
  eq(JSON.stringify(easterSunday(2026)), JSON.stringify({ year: 2026, month: 4, day: 5 }));
  eq(JSON.stringify(easterSunday(2027)), JSON.stringify({ year: 2027, month: 3, day: 28 }));
});

check("Feriados nacionais 2026 — lista explícita", () => {
  const dates = holidaysFor("BR", 2026).map((h) => h.date).sort().join(",");
  eq(dates, "2026-01-01,2026-04-03,2026-04-21,2026-05-01,2026-09-07,2026-10-12,2026-11-02,2026-11-15,2026-11-20,2026-12-25");
});

check("Feriados nacionais 2027 — lista explícita (Paixão 26/03)", () => {
  const dates = holidaysFor("BR", 2027).map((h) => h.date).sort().join(",");
  eq(dates, "2027-01-01,2027-03-26,2027-04-21,2027-05-01,2027-09-07,2027-10-12,2027-11-02,2027-11-15,2027-11-20,2027-12-25");
});

check("ES: Nossa Senhora da Penha 13/04/2026 e 05/04/2027 (segunda 8 dias após a Páscoa)", () => {
  eq(isHoliday("BR-ES-LINHARES", 2026, 4, 13), true, "2026");
  eq(isHoliday("BR-ES-LINHARES", 2027, 4, 5), true, "2027");
  eq(isHoliday("BR", 2026, 4, 13), false, "não é nacional");
});

check("Pontos facultativos NÃO são feriados: Carnaval 16–17/02/2026, Corpus Christi 04/06/2026, 23/05", () => {
  eq(isHoliday("BR-ES-LINHARES", 2026, 2, 16), false, "carnaval seg");
  eq(isHoliday("BR-ES-LINHARES", 2026, 2, 17), false, "carnaval ter");
  eq(isHoliday("BR-ES-LINHARES", 2026, 6, 4), false, "corpus christi");
  eq(isHoliday("BR-ES-LINHARES", 2026, 5, 23), false, "23/05");
});

check("Linhares: nenhum feriado municipal sem fonte oficial (22/08 pendente)", () => {
  eq(isHoliday("BR-ES-LINHARES", 2026, 8, 22), false);
});

check("Anos validados = 2026 e 2027", () => eq(VALIDATED_YEARS.join(","), "2026,2027"));

check("20/11/2026 (sexta): +1 dia útil de qui 19/11 10:00 => seg 23/11 10:00 com calendário; sex 20/11 sem", () => {
  eq(iso(addBusinessDays(brt("2026-11-19T10:00"), 1, CAL)), iso(brt("2026-11-23T10:00")), "com calendário");
  eq(iso(addBusinessDays(brt("2026-11-19T10:00"), 1, NOCAL)), iso(brt("2026-11-20T10:00")), "sem calendário");
});

check("Horas úteis cruzando feriado: qui 19/11 16:00 + 4h => seg 23/11 10:00", () => {
  eq(iso(addBusinessHours(brt("2026-11-19T16:00"), 4, CAL)), iso(brt("2026-11-23T10:00")));
  eq(iso(addBusinessHours(brt("2026-11-19T16:00"), 4, NOCAL)), iso(brt("2026-11-20T10:00")), "sem calendário");
});

check("Início dentro do feriado: sex 20/11 09:00 + 1h útil => seg 23/11 09:00", () => {
  eq(iso(addBusinessHours(brt("2026-11-20T09:00"), 1, CAL)), iso(brt("2026-11-23T09:00")));
});

check("Véspera da Paixão + fim de semana: qui 02/04/2026 17:00 + 2h => seg 06/04 09:00", () => {
  eq(iso(addBusinessHours(brt("2026-04-02T17:00"), 2, CAL)), iso(brt("2026-04-06T09:00")));
});

check("Penha (ES): sex 10/04/2026 17:00 + 2h => ter 14/04 09:00", () => {
  eq(iso(addBusinessHours(brt("2026-04-10T17:00"), 2, CAL)), iso(brt("2026-04-14T09:00")));
});

check("BAIXO 3 dias úteis de qua 18/11/2026 10:00 => ter 24/11 com calendário (pula 20/11); seg 23/11 sem", () => {
  // qui 19 (1), sex 20 feriado, seg 23 (2), ter 24 (3)
  eq(iso(addBusinessDays(brt("2026-11-18T10:00"), 3, CAL)), iso(brt("2026-11-24T10:00")));
  eq(iso(addBusinessDays(brt("2026-11-18T10:00"), 3, NOCAL)), iso(brt("2026-11-23T10:00")), "sem calendário");
});

check("Horas corridas não mudam com feriado", () => {
  eq(iso(addTimeUnits(brt("2026-11-20T10:00"), 1, "CLOCK_HOURS", CAL)), iso(brt("2026-11-20T11:00")));
});

check("resolveBusinessHoursConfig: WEG recebe o calendário BR-ES-LINHARES; outro projeto e null ficam sem calendário", () => {
  eq(resolveBusinessHoursConfig(null, WEG).holidayCalendarId, "BR-ES-LINHARES", "WEG");
  eq(resolveBusinessHoursConfig(null, OTHER).holidayCalendarId, undefined, "outro");
  eq(resolveBusinessHoursConfig(null), AXION_DEFAULT_BUSINESS_HOURS_CONFIG, "default inalterado");
  eq(holidayCalendarForProject(WEG), "BR-ES-LINHARES");
  const withSettings = resolveBusinessHoursConfig({ projectId: WEG, timezone: "America/Sao_Paulo", businessDayStartHour: 7, businessDayEndHour: 17, updatedAt: "" });
  eq(withSettings.holidayCalendarId, "BR-ES-LINHARES", "settings da WEG");
  eq(withSettings.businessDayStartHour, 7, "expediente do projeto preservado");
});

check("resolveMatrixPolicy deduz o projeto pelos responsáveis e aplica o calendário", () => {
  const responsibles = [{ id: "r", projectId: WEG, area: "PLANEJAMENTO", responsibleDirectUserId: "u1", secondaryResponsibleUserId: null, escalation1UserId: null, escalation2UserId: null, boardUserId: "u3" }];
  const policy = resolveMatrixPolicy({ rules: [], responsibles, settings: null, area: "PLANEJAMENTO", riskLevel: "HIGH" });
  eq(policy.businessHours.holidayCalendarId, "BR-ES-LINHARES");
  const other = resolveMatrixPolicy({ rules: [], responsibles: [{ ...responsibles[0], projectId: OTHER }], settings: null, area: "PLANEJAMENTO", riskLevel: "HIGH" });
  eq(other.businessHours.holidayCalendarId, undefined, "outro projeto");
});

console.log("");
console.log(`${passed} OK, ${failed} FALHA(S)`);
if (failed > 0) process.exit(1);
