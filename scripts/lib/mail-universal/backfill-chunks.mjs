// Fase 5/C — backfill HISTÓRICO do Gmail em blocos mensais, com checkpoint por bloco e retomada. Puro: leitor e armazenamento
// são injetados (testes usam transporte FALSO + armazenamento em memória). SOMENTE LEITURA na caixa; nada é enviado.
//
// Por que existe: runMailboxSync lê UMA janela inteira por execução (18 meses de uma caixa grande = milhares de getMessage numa
// só passada) e, se algo falha, o cursor não avança e a próxima execução relê tudo. Aqui a janela é fatiada por mês
// (fronteiras no fuso de Brasília), cada bloco COMPLETO avança o checkpoint, e a execução para no primeiro bloco com falha;
// a retomada recomeça desse bloco, sem reler os anteriores. A idempotência (provedor+caixa+id) garante que reler não duplica.
//
// O checkpoint do backfill fica numa chave PRÓPRIA ("backfill.<caixa>"), separada do cursor incremental: um cursor incremental
// já avançado até "agora" NÃO pode fazer o histórico ser pulado (o motor, sozinho, começaria a janela no cursor).
import { runMailboxSync } from "./engine.mjs";
import { normalizeMailbox } from "./reader.mjs";

/** Janela do piloto: 18 meses, 22/05/2025 (00:00 em Brasília) até o fim de 22/11/2026 (Brasília). */
export const PILOT_HISTORY_WINDOW = Object.freeze({ start: "2025-05-22T03:00:00.000Z", end: "2026-11-23T02:59:59.999Z" });

const BRT_OFFSET_MS = 3 * 3600 * 1000; // America/Sao_Paulo sem horário de verão desde 2019

/** "YYYY-MM" do mês civil em Brasília. */
export function monthKeyBrt(iso) {
  const d = new Date(Date.parse(iso) - BRT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthStartMs(ms) {
  const d = new Date(ms - BRT_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) + BRT_OFFSET_MS;
}

/**
 * Fatia [start, end] em blocos mensais contíguos e SEM sobreposição (o primeiro e o último podem ser parciais).
 * @returns {{ index:number, label:string, start:string, end:string }[]}
 */
export function planBackfillChunks({ start, end }) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(startMs < endMs)) throw new Error("planBackfillChunks: start/end inválidos (start < end, ISO).");
  const chunks = [];
  let cursorMs = startMs;
  while (cursorMs < endMs) {
    const boundary = nextMonthStartMs(cursorMs);
    const chunkEnd = boundary - 1 < endMs ? boundary - 1 : endMs; // fim inclusivo: 1 ms antes do mês seguinte
    chunks.push({ index: chunks.length, label: monthKeyBrt(new Date(cursorMs).toISOString()), start: new Date(cursorMs).toISOString(), end: new Date(chunkEnd).toISOString() });
    cursorMs = chunkEnd + 1;
  }
  return chunks;
}

/** Chave do checkpoint do backfill (distinta do cursor incremental; respeita CHECK mailbox = lower e com '@'). */
export const backfillCursorMailbox = (mailbox) => `backfill.${normalizeMailbox(mailbox)}`;

/** Redireciona SÓ o cursor para a chave do backfill; todo o resto (idempotência, inserção, auditoria) passa direto. */
export function withBackfillCursor(store) {
  const remap = (p) => ({ ...p, mailbox: backfillCursorMailbox(p.mailbox) });
  return new Proxy(store, {
    get(target, prop) {
      if (prop === "getCursor") return (p) => target.getCursor(remap(p));
      if (prop === "saveCursor") return (p) => target.saveCursor(remap(p));
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/**
 * @param {{ reader: object, store: object, projectId: string, mailbox: string, rule: object,
 *   period?: { start: string, end: string }, mode?: "DRY_RUN"|"APPLY", now?: Date, maxChunks?: number, overlapMs?: number,
 *   retry?: object, sleep?: Function }} options
 * @returns {Promise<{ status: "COMPLETE"|"PAUSED"|"STOPPED_ON_FAILURE"|"DRY_RUN", complete: boolean, chunks: object[], totals: object, resumeFrom: string|null, remaining: number }>}
 *   maxChunks = orçamento de blocos por execução (cota/tempo); ao esgotar, PAUSED e a próxima execução retoma.
 */
export async function runChunkedBackfill(options) {
  const { reader, store, projectId, rule, mode = "DRY_RUN", now = new Date(), maxChunks = Infinity, overlapMs, retry, sleep } = options;
  const period = options.period ?? PILOT_HISTORY_WINDOW;
  if (reader.provider !== "GMAIL") throw new Error("runChunkedBackfill: só o Gmail é fatiado por janela; o Outlook usa delta (cursor próprio por pasta).");
  const mailbox = normalizeMailbox(options.mailbox);
  const apply = mode === "APPLY";
  const plan = planBackfillChunks(period).filter((c) => Date.parse(c.start) < now.getTime());
  const bstore = withBackfillCursor(store);
  const saved = apply ? await bstore.getCursor({ projectId, provider: reader.provider, mailbox }) : null;
  const doneUntil = saved?.lastWindowEnd ? Date.parse(saved.lastWindowEnd) : null;

  const results = [];
  const totals = { universe: 0, eligible: 0, processed: 0, excluded: 0, failed: 0, inserted: 0, replayed: 0, attachmentsUnavailable: 0 };
  let status = apply ? "COMPLETE" : "DRY_RUN";
  let resumeFrom = null;
  let ran = 0;

  for (const chunk of plan) {
    if (apply && doneUntil !== null && doneUntil >= Math.min(Date.parse(chunk.end), now.getTime())) {
      results.push({ ...chunk, outcome: "SKIPPED_ALREADY_COMPLETE" });
      continue;
    }
    if (ran >= maxChunks) { status = "PAUSED"; resumeFrom = chunk.label; break; }
    ran += 1;
    const r = await runMailboxSync({ reader, store: bstore, projectId, mailbox, rule, period: { start: chunk.start, end: chunk.end }, mode, now, overlapMs, retry, sleep });
    // O motor grava a reconciliação com a caixa real (store original não é remapeado em recordRun) e avança o checkpoint do backfill.
    for (const k of Object.keys(totals)) totals[k] += r.counts[k] ?? 0;
    results.push({ ...chunk, outcome: r.run.status, counts: r.counts, cursorAdvanced: r.cursorAdvanced });
    if (r.run.status === "FAILED" || r.run.status === "PARTIAL") { status = "STOPPED_ON_FAILURE"; resumeFrom = chunk.label; break; }
  }
  const remaining = plan.length - results.length;
  return { status, complete: apply && status === "COMPLETE" && remaining === 0, chunks: results, totals, resumeFrom, remaining };
}
