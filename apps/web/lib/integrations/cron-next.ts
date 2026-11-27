// Helper puro e mínimo para expressões cron de 5 campos (minuto hora
// dia-do-mês mês dia-da-semana), no formato usado pelo pg_cron do ACC
// (UTC). Suporta "*", números, listas "a,b", faixas "a-b" e passos
// "*/n" / "a-b/n" / "a/n". Não suporta nomes (JAN, MON) nem "@hourly" —
// nesses casos devolve null e a UI mostra a expressão crua.

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) return null;
    let start = min;
    let end = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      start = a;
      end = b ?? (m[2] ? max : a);
    }
    const step = m[2] ? Number(m[2]) : 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || step < 1 || start < min || end > max || start > end) return null;
    for (let v = start; v <= end; v += step) out.add(v === 7 && max === 7 ? 0 : v);
  }
  return out;
}

export function parseCron(expr: string | null | undefined): CronFields | null {
  if (!expr) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [mi, ho, dom, mo, dow] = parts;
  const minutes = parseField(mi, 0, 59);
  const hours = parseField(ho, 0, 23);
  const days = parseField(dom, 1, 31);
  const months = parseField(mo, 1, 12);
  const weekdays = parseField(dow, 0, 7);
  if (!minutes || !hours || !days || !months || !weekdays) return null;
  return { minutes, hours, days, months, weekdays, domRestricted: dom !== "*", dowRestricted: dow !== "*" };
}

function dayMatches(f: CronFields, d: Date): boolean {
  if (!f.months.has(d.getUTCMonth() + 1)) return false;
  const domOk = f.days.has(d.getUTCDate());
  const dowOk = f.weekdays.has(d.getUTCDay());
  // Semântica Vixie cron: se ambos os campos são restritos, basta um casar.
  if (f.domRestricted && f.dowRestricted) return domOk || dowOk;
  if (f.domRestricted) return domOk;
  if (f.dowRestricted) return dowOk;
  return true;
}

/** Próxima execução estritamente depois de `after` (UTC, como o pg_cron). null se a expressão não for suportada. */
export function nextCronRun(expr: string | null | undefined, after: Date): Date | null {
  const f = parseCron(expr);
  if (!f) return null;
  const t = new Date(after.getTime());
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);
  const minutes = [...f.minutes].sort((a, b) => a - b);
  const hours = [...f.hours].sort((a, b) => a - b);
  for (let dayOffset = 0; dayOffset < 366 * 5; dayOffset++) {
    const day = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + dayOffset));
    if (!dayMatches(f, day)) continue;
    for (const h of hours) {
      for (const m of minutes) {
        const candidate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
        if (candidate.getTime() >= t.getTime()) return candidate;
      }
    }
  }
  return null;
}

/** Intervalo típico (s) entre duas execuções consecutivas — usado quando o heartbeat não informa expected_interval. */
export function cronIntervalSeconds(expr: string | null | undefined, reference: Date = new Date(Date.UTC(2026, 0, 5))): number | null {
  const first = nextCronRun(expr, reference);
  if (!first) return null;
  const second = nextCronRun(expr, first);
  if (!second) return null;
  return Math.round((second.getTime() - first.getTime()) / 1000);
}

const BRT_OFFSET_HOURS = -3; // America/Sao_Paulo (sem horário de verão desde 2019)

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Frequência legível em PT-BR (horários convertidos para Brasília). Expressão não suportada => "cron <expr>". */
export function humanizeCron(expr: string | null | undefined): string {
  if (!expr) return "sem agendamento";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 || !parseCron(expr)) return `cron ${expr}`;
  const [mi, ho, dom, mo, dow] = parts;
  const restAll = dom === "*" && mo === "*" && dow === "*";
  const stepMin = /^(?:\*|\d+-59)\/(\d+)$/.exec(mi);
  if (stepMin && ho === "*" && restAll) return `a cada ${stepMin[1]} min`;
  if (mi === "*" && ho === "*" && restAll) return "a cada minuto";
  if (/^\d+$/.test(mi) && ho === "*" && restAll) return `a cada hora (minuto ${pad(Number(mi))})`;
  const stepHour = /^\*\/(\d+)$/.exec(ho);
  if (/^\d+$/.test(mi) && stepHour && restAll) return `a cada ${stepHour[1]} h (minuto ${pad(Number(mi))})`;
  if (/^\d+$/.test(mi) && /^\d+$/.test(ho) && restAll) {
    const brtHour = (Number(ho) + BRT_OFFSET_HOURS + 24) % 24;
    return `diariamente às ${pad(brtHour)}:${pad(Number(mi))} (Brasília)`;
  }
  return `cron ${expr} (UTC)`;
}
