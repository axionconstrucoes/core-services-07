// Janela HISTÓRICA EXPLÍCITA do backfill de Gmail (função pura, testável). Sem I/O.
// Regras: início e fim são instantes ISO com fuso (Z ou ±hh:mm); o fim nunca pode estar no futuro; início < fim.
// Sem --start, o comportamento legado é preservado (janela vem da configuração da obra e exige --apply).
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function flag(args, name) {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
}

function parseInstant(value, label) {
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) throw new Error(`--${label} deve ser um instante ISO com fuso (ex.: 2025-05-11T00:00:00-03:00).`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`--${label} inválido.`);
  return date;
}

export function parseBackfillArgs(args, now = new Date()) {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  const start = flag(args, "start");
  const end = flag(args, "end");
  const limitRaw = flag(args, "limit");
  if (start === undefined) {
    if (end !== undefined || dryRun || limitRaw !== undefined) throw new Error("--end, --dry-run e --limit só valem com --start (janela explícita).");
    if (!apply) throw new Error("ERRO: use --apply para autorizar gravação real.");
    return { mode: "LEGACY", apply: true, dryRun: false, startAt: null, endAt: null, limit: null };
  }
  if (apply === dryRun) throw new Error("Janela explícita exige exatamente um entre --apply e --dry-run.");
  if (end === undefined) throw new Error("Janela explícita exige --end (limite final fixo).");
  const startAt = parseInstant(start, "start");
  const endAt = parseInstant(end, "end");
  if (!(startAt < endAt)) throw new Error("--start precisa ser anterior a --end.");
  if (endAt > now) throw new Error("--end não pode estar no futuro.");
  let limit = null;
  if (limitRaw !== undefined) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit deve ser um inteiro positivo.");
  }
  return { mode: "EXPLICIT", apply, dryRun, startAt, endAt, limit };
}

export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function gmailDate(date) {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** after: um dia antes e before: um dia depois (datas do Gmail são por dia); o corte exato é feito por internalDate. */
export function buildWindowQuery({ startAt, endAt, senderQuery }) {
  const after = new Date(startAt); after.setUTCDate(after.getUTCDate() - 1);
  const before = new Date(endAt); before.setUTCDate(before.getUTCDate() + 1);
  return [`after:${gmailDate(after)}`, `before:${gmailDate(before)}`, `{${senderQuery}}`];
}

export function withinWindow(occurredAt, startAt, endAt) {
  return occurredAt >= startAt && occurredAt <= endAt;
}

export function emptyMonthStats() {
  return { candidatas: 0, pertinentes: 0, rejeitadas: 0, rejeitadas_por_dominio: 0, rejeitadas_por_escopo: 0, ja_existentes: 0, novas_recebidas: 0, novas_enviadas: 0, direcao_indeterminada: 0, gravadas: 0, falhas: 0 };
}

/** Fim CONGELADO: devolve o fim já registrado quando existe execução anterior com o mesmo início e fim diferente. */
export function findFrozenEndConflict(previousRows, startAt, endAt) {
  for (const row of previousRows) {
    const match = /Janela (\S+) -> (\S+)\./.exec(row?.detail ?? "");
    if (match && match[1] === startAt.toISOString() && match[2] !== endAt.toISOString()) return match[2];
  }
  return null;
}
