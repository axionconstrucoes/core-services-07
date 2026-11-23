// Fase 5/C — backfill de 18 meses em blocos mensais (checkpoint/retomada) e relatório de cobertura por caixa.
// Transporte FALSO + armazenamento em memória: nenhuma rede, nenhuma caixa real, nada é enviado.
// Uso: node scripts/test-f5-c-backfill-cobertura.mjs
import assert from "node:assert/strict";
import { createGmailReader } from "./lib/mail-universal/gmail-reader.mjs";
import { createGraphReader } from "./lib/mail-universal/graph-reader.mjs";
import { createMemoryStore } from "./lib/mail-universal/memory-store.mjs";
import { WEG_RULE } from "./lib/mail-universal/eligibility.mjs";
import { createFakeGmailTransport, createFakeGraphTransport, gmailMessage } from "./lib/mail-universal/fakes.mjs";
import { PILOT_HISTORY_WINDOW, backfillCursorMailbox, monthKeyBrt, planBackfillChunks, runChunkedBackfill } from "./lib/mail-universal/backfill-chunks.mjs";
import { buildMailboxCoverageReport, renderCoverageMarkdown } from "./lib/mail-universal/coverage-report.mjs";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); failed += 1; }
}

const P = "00000000-0000-4000-8000-000000000001";
const BOX = "caixa-teste@axion.com.br";
const NOW = new Date("2026-11-22T12:00:00Z");

// Transporte que respeita after:/before: da consulta (como o Gmail real), para os blocos mensais lerem só o seu mês.
function windowedTransport(messages, opts = {}) {
  const base = createFakeGmailTransport({ [BOX]: messages }, BOX, { pageSize: 3, ...opts });
  const listCalls = [];
  const transport = {
    get writes() { return base.writes; },
    listCalls,
    async listMessages({ query, pageToken }) {
      const after = Number(/after:(\d+)/.exec(query)[1]);
      const before = Number(/before:(\d+)/.exec(query)[1]);
      if (!pageToken) listCalls.push({ after, before });
      const inWindow = messages.filter((m) => Number(m.internalDate) / 1000 >= after && Number(m.internalDate) / 1000 < before);
      const start = Number(pageToken ?? 0);
      const slice = inWindow.slice(start, start + 3);
      return { messages: slice.map((m) => ({ id: m.id, threadId: m.threadId })), nextPageToken: start + 3 < inWindow.length ? String(start + 3) : undefined };
    },
    getMessage: (id) => base.getMessage(id),
    getAttachment: (a, b) => base.getAttachment(a, b),
    send: base.send, modify: base.modify, trash: base.trash,
  };
  return transport;
}

const msg = (id, date, over = {}) => gmailMessage({ id, from: "fulano@weg.net", to: [BOX], subject: "Assunto", date, messageId: `<${id}@weg>`, ...over });
// 1 mensagem por mês nos 19 meses da janela (maio/2025 a nov/2026), dia 25 (maio: 25/05, dentro da janela que começa em 22/05).
const monthly = [];
for (let i = 0; i < 19; i += 1) {
  const y = 2025 + Math.floor((4 + i) / 12);
  const m = ((4 + i) % 12) + 1;
  monthly.push(msg(`m${i}`, `${y}-${String(m).padStart(2, "0")}-${i === 18 ? "20" : "25"}T15:00:00Z`));
}

await check("plano: janela de 18 meses vira 19 blocos contíguos, sem sobreposição, do 1o ao último instante", () => {
  const chunks = planBackfillChunks(PILOT_HISTORY_WINDOW);
  assert.equal(chunks.length, 19);
  assert.equal(chunks[0].start, PILOT_HISTORY_WINDOW.start);
  assert.equal(chunks[0].label, "2025-05");
  assert.equal(chunks.at(-1).end, PILOT_HISTORY_WINDOW.end);
  assert.equal(chunks.at(-1).label, "2026-11");
  for (let i = 1; i < chunks.length; i += 1) assert.equal(Date.parse(chunks[i].start), Date.parse(chunks[i - 1].end) + 1, `contíguo em ${chunks[i].label}`);
  assert.equal(monthKeyBrt("2025-06-01T02:30:00Z"), "2025-05", "01/06 00:00 UTC ainda é maio em Brasília");
  assert.throws(() => planBackfillChunks({ start: "2026-02-01T00:00:00Z", end: "2026-01-01T00:00:00Z" }), /inválidos/);
});

await check("APPLY completo: lê os 19 meses, grava 19 mensagens, checkpoint próprio, cursor incremental intocado", async () => {
  const store = createMemoryStore();
  const transport = windowedTransport(monthly);
  const reader = createGmailReader({ transport });
  const r = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW });
  assert.equal(r.status, "COMPLETE");
  assert.equal(r.complete, true);
  assert.equal(r.totals.inserted, 19);
  assert.equal(store.state.emails.length, 19);
  assert.ok(store.state.cursors.has(`${P}|GMAIL|${backfillCursorMailbox(BOX)}`));
  assert.ok(!store.state.cursors.has(`${P}|GMAIL|${BOX}`), "o cursor incremental não é tocado pelo backfill");
  assert.deepEqual(transport.writes, [], "somente leitura");
});

await check("retomada: falha no bloco 2025-09 para no bloco, mantém checkpoint do anterior; a próxima execução NÃO relê os anteriores", async () => {
  const store = createMemoryStore();
  const transport = windowedTransport(monthly, { failGet: { m4: 3 } }); // 2025-09: falha nas 3 tentativas
  const reader = createGmailReader({ transport });
  const first = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW });
  assert.equal(first.status, "STOPPED_ON_FAILURE");
  assert.equal(first.resumeFrom, "2025-09");
  assert.equal(first.complete, false);
  assert.equal(store.state.emails.length, 4, "meses 2025-05..2025-08 gravados");
  const afterFirst = transport.listCalls.length;
  const second = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW });
  assert.equal(second.status, "COMPLETE");
  assert.equal(store.state.emails.length, 19, "sem duplicar");
  assert.equal(second.chunks.filter((c) => c.outcome === "SKIPPED_ALREADY_COMPLETE").length, 4, "4 blocos já completos pulados");
  const resumedAfters = transport.listCalls.slice(afterFirst).map((c) => c.after);
  assert.ok(resumedAfters[0] >= Math.floor(Date.parse("2025-09-01T03:00:00Z") / 1000) - 1, "retomou a partir do bloco que falhou, não do início");
});

await check("orçamento por execução (maxChunks): PAUSED e retoma até completar em várias execuções", async () => {
  const store = createMemoryStore();
  const reader = createGmailReader({ transport: windowedTransport(monthly) });
  let runs = 0;
  let res;
  do {
    res = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW, maxChunks: 7 });
    runs += 1;
    if (!res.complete) assert.equal(res.status, "PAUSED");
  } while (!res.complete && runs < 10);
  assert.equal(runs, 3, "19 blocos / 7 por execução");
  assert.equal(store.state.emails.length, 19);
});

await check("DRY_RUN: não grava mensagens nem checkpoint; mede o universo por bloco", async () => {
  const store = createMemoryStore();
  const reader = createGmailReader({ transport: windowedTransport(monthly) });
  const r = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "DRY_RUN", now: NOW });
  assert.equal(r.status, "DRY_RUN");
  assert.equal(store.state.emails.length, 0);
  assert.equal(store.state.cursors.size, 0);
  assert.equal(r.totals.processed, 19);
});

await check("cursor incremental já em 'agora' NÃO faz o histórico ser pulado", async () => {
  const store = createMemoryStore();
  await store.saveCursor({ projectId: P, provider: "GMAIL", mailbox: BOX, cursor: { kind: "GMAIL_WINDOW", lastWindowEnd: NOW.toISOString() } });
  const reader = createGmailReader({ transport: windowedTransport(monthly) });
  const r = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW });
  assert.equal(r.totals.inserted, 19);
});

await check("reexecução depois de completo é idempotente (tudo pulado, 0 inserções)", async () => {
  const store = createMemoryStore();
  const reader = createGmailReader({ transport: windowedTransport(monthly) });
  await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW });
  const again = await runChunkedBackfill({ reader, store, projectId: P, mailbox: BOX, rule: WEG_RULE, mode: "APPLY", now: NOW });
  assert.equal(again.totals.inserted, 0);
  assert.equal(store.state.emails.length, 19);
});

await check("Outlook/Graph é recusado (usa delta, não janela fatiada)", async () => {
  const reader = createGraphReader({ transport: createFakeGraphTransport({}) });
  await assert.rejects(() => runChunkedBackfill({ reader, store: createMemoryStore(), projectId: P, mailbox: BOX, rule: WEG_RULE, now: NOW }), /Outlook usa delta/);
});

const WIN = { start: "2025-05-22T03:00:00.000Z", end: "2026-11-23T02:59:59.999Z" };
const rowsFrom = (from) => planBackfillChunks(WIN).filter((c) => c.label >= from).map((c) => ({ month: c.label, inbound: 3, outbound: 1 }));

await check("cobertura: OPERACIONAL só com prova de início da janela + sync recente + sem falhas", () => {
  const rep = buildMailboxCoverageReport({
    window: WIN, now: NOW,
    mailboxes: [
      { label: "CAIXA-1", rows: rowsFrom("2025-05"), coveredFrom: WIN.start, lastSuccessAt: "2026-11-22T10:00:00Z" },
      { label: "CAIXA-2", rows: rowsFrom("2025-09"), coveredFrom: null, lastSuccessAt: "2026-11-22T10:00:00Z" },
      { label: "CAIXA-3", rows: rowsFrom("2025-05"), coveredFrom: WIN.start, lastSuccessAt: "2026-11-10T10:00:00Z" },
      { label: "CAIXA-4", rows: [], lastSuccessAt: null },
      { label: "CAIXA-5", rows: rowsFrom("2025-05"), coveredFrom: WIN.start, lastSuccessAt: "2026-11-22T10:00:00Z", openFailures: 2 },
    ],
  });
  const by = Object.fromEntries(rep.mailboxes.map((m) => [m.label, m]));
  assert.equal(by["CAIXA-1"].status, "OPERACIONAL");
  assert.equal(by["CAIXA-2"].status, "PARCIAL");
  assert.ok(by["CAIXA-2"].gaps.some((g) => g.startsWith("SEM_PROVA_DE_COBERTURA")));
  assert.ok(by["CAIXA-2"].gaps.some((g) => g.includes("4_MES(ES)_INICIAIS")), "maio..agosto/2025 sem mensagens");
  assert.equal(by["CAIXA-2"].emptyMonths.length, 4);
  assert.equal(by["CAIXA-3"].status, "PARCIAL");
  assert.ok(by["CAIXA-3"].gaps.some((g) => g.startsWith("SINCRONIZACAO_DEFASADA")));
  assert.equal(by["CAIXA-4"].status, "NAO_CONECTADA");
  assert.equal(by["CAIXA-5"].status, "PARCIAL");
  assert.equal(rep.months, 19);
});

await check("cobertura: mensagens fora da janela são sinalizadas; Markdown só contém rótulos", () => {
  const rep = buildMailboxCoverageReport({ window: WIN, now: NOW, mailboxes: [{ label: "CAIXA-1", rows: [{ month: "2025-01", inbound: 5 }, ...rowsFrom("2025-05")], coveredFrom: WIN.start, lastSuccessAt: "2026-11-22T10:00:00Z" }] });
  assert.ok(rep.mailboxes[0].gaps.some((g) => g.includes("FORA_DA_JANELA")));
  const md = renderCoverageMarkdown(rep);
  assert.ok(md.includes("CAIXA-1"));
  assert.ok(!/@/.test(md), "nenhum endereço no relatório");
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
