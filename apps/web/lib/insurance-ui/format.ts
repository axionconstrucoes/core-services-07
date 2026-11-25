// Formatação e leitura de números/datas. Dado ausente é SEMPRE "SEM DADOS" (nunca zero, nunca traço mudo).

export const NO_DATA = "SEM DADOS";

export function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(v: number | string | null | undefined, currency = "BRL"): string {
  const n = toNumber(v);
  if (n === null) return NO_DATA;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** yyyy-mm-dd (coluna `date`) -> dd/mm/aaaa sem passar por fuso (evita deslocar um dia). */
export function formatDate(v: string | null | undefined): string {
  if (!v) return NO_DATA;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : NO_DATA;
}

/** timestamptz -> dd/mm/aaaa hh:mm (America/Sao_Paulo). */
export function formatDateTime(v: string | null | undefined): string {
  if (!v) return NO_DATA;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return NO_DATA;
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
}

/**
 * Data de emissão do endosso: o formulário envia só a DATA (meia-noite UTC). Mostrar essa data no fuso
 * de São Paulo recuaria um dia (21/11 virava 20/11 21:00); então, quando o instante é exatamente
 * meia-noite UTC, exibe-se somente a data. Com hora real (sem data informada), mantém data e hora locais.
 */
export function formatIssuedAt(v: string | null | undefined): string {
  if (!v) return NO_DATA;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return NO_DATA;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return formatDate(d.toISOString());
  }
  return formatDateTime(v);
}

export function textOrNoData(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t ? t : NO_DATA;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : NO_DATA;
}

/** "1.234,56" / "1234,56" / "1234.56" -> 1234.56; vazio -> null; inválido -> NaN. */
export function parseDecimalPtBr(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  let s = t;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}
