// Previsão de término (data de conclusão informada pelo responsável) — puro,
// determinístico, sem I/O.
//
// Regras (decisão de escopo do piloto WEG):
//   - "Em andamento" / "Providenciando" (ação TOMANDO PROVIDÊNCIAS, pela tela
//     ou por resposta de e-mail) solicita a data prevista de conclusão.
//   - Sem data válida: a pendência fica registrada e as cobranças aplicáveis
//     continuam (nada aqui altera prazos SLA nem cancela escalonamentos).
//   - ALTO/CRÍTICO: a previsão fica explícita para o responsável e acompanha os
//     escalonamentos (data atual, alteração e vencimento).
//   - MÉDIO/BAIXO: só registra e exibe a data — sem escalonamento adicional.
//   - Cada informação de data é um evento novo (histórico preservado). A
//     previsão vigente é a da informação MAIS RECENTE pela data de origem
//     (recebimento do e-mail ou registro na tela) — respostas processadas fora
//     de ordem não sobrescrevem uma previsão mais nova.
//
// Fuso: datas sem fuso são interpretadas no horário de Brasília (UTC-03:00,
// sem horário de verão desde 2019). Data sem hora = fim do dia (23:59).

import type { SlaRiskLevel } from "@/lib/sla/types";

const BRT_OFFSET = "-03:00";
const MAX_HORIZON_DAYS = 3 * 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ForecastParse =
  | { status: "VALID"; iso: string; matched: string | null; hasTime: boolean }
  | { status: "MISSING" }
  | { status: "INVALID"; reason: "UNPARSEABLE" | "PAST" | "TOO_FAR" | "AMBIGUOUS" | "TIME_REQUIRED"; matched: string | null };

export type ForecastTracking = "TRACKED" | "RECORD_ONLY";

/** ALTO/CRÍTICO acompanham os escalonamentos; MÉDIO/BAIXO apenas registram e exibem. */
export function forecastTracking(riskLevel: SlaRiskLevel | string): ForecastTracking {
  return riskLevel === "HIGH" || riskLevel === "CRITICAL" ? "TRACKED" : "RECORD_ONLY";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildIso(year: number, month: number, day: number, hour: number, minute: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const local = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${BRT_OFFSET}`;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return null;
  // Rejeita datas que "transbordam" (31/02 -> 03/03).
  const check = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return date.toISOString();
}

function validateWindow(iso: string, referenceIso: string, matched: string | null, hasTime: boolean): ForecastParse {
  const at = new Date(iso).getTime();
  const ref = new Date(referenceIso).getTime();
  if (at < ref) return { status: "INVALID", reason: "PAST", matched };
  if (at - ref > MAX_HORIZON_DAYS * DAY_MS) return { status: "INVALID", reason: "TOO_FAR", matched };
  return { status: "VALID", iso, matched, hasTime };
}

/**
 * ALTO/CRÍTICO exigem data E horário; MÉDIO/BAIXO aceitam só a data (fim do dia).
 * Data sem horário em ALTO/CRÍTICO => TIME_REQUIRED (pendência; nunca inventamos o horário).
 */
export function applyForecastPrecision(parse: ForecastParse, tracking: ForecastTracking): ForecastParse {
  if (parse.status === "VALID" && tracking === "TRACKED" && !parse.hasTime) return { status: "INVALID", reason: "TIME_REQUIRED", matched: parse.matched };
  return parse;
}

function yearFor(raw: string | undefined, referenceIso: string): number {
  if (!raw) return new Date(new Date(referenceIso).getTime() - 3 * 60 * 60 * 1000).getUTCFullYear();
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

/**
 * Valor estruturado (campo da tela): ISO com fuso, "AAAA-MM-DD", "AAAA-MM-DDTHH:mm"
 * (datetime-local, horário de Brasília) ou "DD/MM/AAAA[ HH:mm]".
 * referenceIso = momento da informação (agora, na tela).
 */
export function parseForecastInput(value: string | null | undefined, referenceIso: string): ForecastParse {
  const raw = (value ?? "").trim();
  if (!raw) return { status: "MISSING" };
  let iso: string | null = null;
  let hasTime = false;
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (m) {
    hasTime = Boolean(m[4]);
    iso = buildIso(Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 23, m[5] ? Number(m[5]) : 59);
  } else if ((m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2})[:h](\d{2}))?$/))) {
    hasTime = Boolean(m[4]);
    iso = buildIso(yearFor(m[3], referenceIso), Number(m[2]), Number(m[1]), m[4] ? Number(m[4]) : 23, m[5] ? Number(m[5]) : 59);
  } else if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    hasTime = true;
    const d = new Date(raw);
    iso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (!iso) return { status: "INVALID", reason: "UNPARSEABLE", matched: raw.slice(0, 40) };
  return validateWindow(iso, referenceIso, null, hasTime);
}

// Expressões que, no texto livre da resposta, introduzem a data de conclusão.
const CUE = String.raw`(?:previs[ãa]o(?:\s+de\s+(?:conclus[ãa]o|t[ée]rmino|entrega|finaliza[çc][ãa]o))?|conclus[ãa]o\s+prevista(?:\s+para)?|t[ée]rmino\s+previsto(?:\s+para)?|prevista?\s+para|prazo(?:\s+de\s+conclus[ãa]o)?|conclu[íi]d[oa]s?\s+(?:em|at[ée])|concluir(?:emos)?\s+(?:em|at[ée])|conclus[ãa]o\s+(?:em|at[ée])|termin\w*\s+(?:em|at[ée])|finaliz\w*\s+(?:em|at[ée])|entreg\w*\s+(?:em|at[ée])|at[ée](?:\s+o)?(?:\s+dia)?|para\s+o\s+dia|no\s+dia)`;
// dd/mm[/aaaa] [às] HH[:mm | hMM | h]
const DATE = String.raw`(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?(?:\s*,?\s*(?:(?:[àa]s|a\s+partir\s+das|at[ée]\s+[àa]s)\s*)?(\d{1,2})\s*(?:(?:h(?:oras?|rs?)?)\s*(\d{2})?|:(\d{2})))?`;
const CUED_DATE = new RegExp(String.raw`${CUE}\s*[:\-–]?\s*(?:o\s+dia\s+|dia\s+)?${DATE}`, "gi");

/**
 * Extrai a previsão de conclusão do texto LIMPO de uma resposta (sem citação/assinatura).
 * Só considera datas introduzidas por uma expressão de previsão/conclusão; datas soltas
 * são ignoradas. Mais de uma data distinta => AMBIGUOUS (pendência, sem adivinhar).
 * referenceIso = recebimento do e-mail (respostas processadas com atraso não "vencem" à toa).
 */
export function extractForecastFromText(text: string | null | undefined, referenceIso: string): ForecastParse {
  const source = (text ?? "").slice(0, 8000);
  const candidates = new Map<string, { matched: string; hasTime: boolean }>();
  let invalid: ForecastParse | null = null;
  for (const match of source.matchAll(CUED_DATE)) {
    const [whole, d, mo, y, h, mi1, mi2] = match;
    const explicitYear = Boolean(y);
    const hasTime = Boolean(h);
    const minute = mi1 ?? mi2;
    let year = yearFor(y, referenceIso);
    let iso = buildIso(year, Number(mo), Number(d), hasTime ? Number(h) : 23, hasTime ? Number(minute ?? 0) : 59);
    if (!iso) {
      invalid = invalid ?? { status: "INVALID", reason: "UNPARSEABLE", matched: whole.trim().slice(0, 60) };
      continue;
    }
    // Sem ano e já passada há mais de 30 dias: refere-se ao próximo ano (ex.: "até 05/01" em dezembro).
    if (!explicitYear && new Date(iso).getTime() < new Date(referenceIso).getTime() - 30 * DAY_MS) {
      year += 1;
      iso = buildIso(year, Number(mo), Number(d), hasTime ? Number(h) : 23, hasTime ? Number(minute ?? 0) : 59);
      if (!iso) continue;
    }
    const previous = candidates.get(iso);
    candidates.set(iso, { matched: whole.trim().slice(0, 60), hasTime: hasTime || Boolean(previous?.hasTime) });
  }
  // Datas distintas (inclusive mesmo dia com horários diferentes) => contradição: não escolhemos.
  if (candidates.size > 1) return { status: "INVALID", reason: "AMBIGUOUS", matched: Array.from(candidates.values()).map((c) => c.matched).join(" | ").slice(0, 120) };
  if (candidates.size === 1) {
    const [[iso, info]] = Array.from(candidates.entries());
    return validateWindow(iso, referenceIso, info.matched, info.hasTime);
  }
  return invalid ?? { status: "MISSING" };
}

export function describeForecastProblem(parse: ForecastParse): string | null {
  if (parse.status === "VALID") return null;
  if (parse.status === "MISSING") return "Previsão de conclusão não informada.";
  switch (parse.reason) {
    case "PAST":
      return "A previsão informada já passou — informe uma data futura.";
    case "TOO_FAR":
      return "A previsão informada está a mais de 3 anos — confira a data.";
    case "AMBIGUOUS":
      return "Mais de uma data de conclusão foi informada — confirme qual é a previsão.";
    case "TIME_REQUIRED":
      return "Risco ALTO/CRÍTICO: informe a data E o horário previstos de conclusão (ex.: 20/11/2026 às 15h).";
    default:
      return "Data de previsão não reconhecida — use DD/MM/AAAA.";
  }
}

// ------------------------------------------------------------------
// Previsão vigente a partir do histórico de eventos
// ------------------------------------------------------------------

export interface ForecastEventInput {
  /** Tipo do evento (TAKING_ACTION, REPLY_RECEIVED, ...). */
  actionType: string;
  forecastAt: string | null;
  /** Momento da informação: recebimento do e-mail quando houver; senão o registro do evento. */
  effectiveAt: string;
  createdAt: string;
  actorUserId: string | null;
  /** Texto da resposta/providência (justificativa de alteração da previsão). */
  text?: string | null;
}

export type ForecastStatus = "NOT_REQUESTED" | "PENDING" | "ON_TRACK" | "EXPIRED" | "CLOSED";

export interface ForecastSummary {
  status: ForecastStatus;
  tracking: ForecastTracking;
  /** Previsão vigente (ISO) — null quando pendente/não solicitada. */
  forecastAt: string | null;
  informedAt: string | null;
  informedByUserId: string | null;
  /** Previsão imediatamente anterior, quando houve alteração. */
  previousForecastAt: string | null;
  /** Quantas vezes a data foi informada/alterada (eventos com data). */
  changes: number;
  /** Texto que acompanhou a previsão vigente (justificativa da data/alteração), truncado. */
  forecastNote: string | null;
  /** Última resposta "em andamento" do responsável (momento de origem e autor). */
  lastStatusAt: string | null;
  lastStatusByUserId: string | null;
}

const ms = (iso: string) => new Date(iso).getTime();

function byEffective(a: ForecastEventInput, b: ForecastEventInput): number {
  const diff = ms(a.effectiveAt) - ms(b.effectiveAt);
  return diff !== 0 ? diff : ms(a.createdAt) - ms(b.createdAt);
}

/** true quando `candidateIso` é estritamente posterior a `referenceIso` (comparação temporal, não textual). */
export function isAfter(candidateIso: string, referenceIso: string): boolean {
  return ms(candidateIso) > ms(referenceIso);
}

/**
 * Estado da previsão de um alerta. "Em andamento" sem data => PENDING (cobranças continuam).
 * A previsão vigente é a de maior effectiveAt — uma resposta antiga processada depois NÃO
 * substitui uma previsão mais nova (fora de ordem), mas continua no histórico.
 */
export function resolveForecast(input: { events: ForecastEventInput[]; riskLevel: SlaRiskLevel | string; caseClosed: boolean; nowIso: string }): ForecastSummary {
  const tracking = forecastTracking(input.riskLevel);
  const withDate = input.events.filter((e) => Boolean(e.forecastAt)).sort(byEffective);
  const statusEvents = input.events.filter((e) => e.actionType === "TAKING_ACTION" || e.actionType === "REPLY_RECEIVED").sort(byEffective);
  const inProgress = input.events.some((e) => e.actionType === "TAKING_ACTION" || e.actionType === "REPLY_RECEIVED");
  const lastStatus = statusEvents.at(-1) ?? null;
  const current = withDate.at(-1) ?? null;
  let previousForecastAt: string | null = null;
  for (let i = withDate.length - 2; i >= 0; i -= 1) {
    if (withDate[i].forecastAt !== current?.forecastAt) {
      previousForecastAt = withDate[i].forecastAt;
      break;
    }
  }
  const base = {
    tracking,
    forecastAt: current?.forecastAt ?? null,
    informedAt: current?.effectiveAt ?? null,
    informedByUserId: current?.actorUserId ?? null,
    previousForecastAt,
    changes: withDate.length,
    forecastNote: current?.text ? current.text.replace(/\s+/g, " ").trim().slice(0, 200) : null,
    lastStatusAt: lastStatus?.effectiveAt ?? null,
    lastStatusByUserId: lastStatus?.actorUserId ?? null,
  };
  if (input.caseClosed) return { status: "CLOSED", ...base };
  if (!current) return { status: inProgress ? "PENDING" : "NOT_REQUESTED", ...base };
  return { status: new Date(current.forecastAt!).getTime() < new Date(input.nowIso).getTime() ? "EXPIRED" : "ON_TRACK", ...base };
}

const STATUS_LABEL: Record<ForecastStatus, string> = {
  NOT_REQUESTED: "não solicitada",
  PENDING: "PENDENTE — informe a data (e, em ALTO/CRÍTICO, o horário) prevista de conclusão",
  ON_TRACK: "no prazo",
  EXPIRED: "VENCIDA",
  CLOSED: "alerta encerrado",
};

export function forecastStatusLabel(status: ForecastStatus): string {
  return STATUS_LABEL[status];
}

/** Linha legível (e-mail / tela). formatDate recebe ISO e devolve data/hora no fuso do projeto. */
export function formatForecastLine(summary: ForecastSummary, formatDate: (iso: string) => string): string | null {
  if (summary.status === "NOT_REQUESTED") return null;
  if (summary.status === "PENDING") return STATUS_LABEL.PENDING;
  if (!summary.forecastAt) return null;
  const parts = [formatDate(summary.forecastAt)];
  if (summary.status === "EXPIRED") parts.push("(VENCIDA — informe nova previsão ou resolva)");
  if (summary.previousForecastAt) parts.push(`· alterada (anterior: ${formatDate(summary.previousForecastAt)})`);
  if (summary.previousForecastAt && summary.forecastNote) parts.push(`· justificativa: "${summary.forecastNote}"`);
  return parts.join(" ");
}

/** Instrução padrão de como informar a previsão por resposta de e-mail. */
export const FORECAST_REPLY_HINT = "Se o tratamento estiver em andamento, responda informando a previsão de conclusão com data e horário (ex.: \"Em andamento. Conclusão prevista para 25/11/2026 às 15h\"), horário de Brasília.";
