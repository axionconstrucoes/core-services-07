// Fase 5/A — monitoramento universal de e-mail: Gmail e Graph com transporte FALSO (nenhuma rede), armazenamento em memória.
// Casos do item 14: 12 (enviada para @weg.net), 13 (recebida de @weg.net), 14 (cópia/cópia oculta @weg.net), 21 (duplicação entre
// caixas), 22 (falha de sincronização e recuperação), 23 (anexo indisponível) + reconciliação universo x elegível x processado.
// Uso: node scripts/test-f5-a-monitoramento.mjs
import assert from "node:assert/strict";
import { createGmailReader } from "./lib/mail-universal/gmail-reader.mjs";
import { createGraphReader } from "./lib/mail-universal/graph-reader.mjs";
import { runMailboxSync } from "./lib/mail-universal/engine.mjs";
import { createMemoryStore } from "./lib/mail-universal/memory-store.mjs";
import { WEG_RULE } from "./lib/mail-universal/eligibility.mjs";
import { canonicalMessageKey } from "./lib/mail-universal/canonical.mjs";
import { createFakeGmailTransport, createFakeGraphTransport, gmailMessage, graphMessage } from "./lib/mail-universal/fakes.mjs";
import { GMAIL_READ_METHODS, readOnlyTransport } from "./lib/mail-universal/read-only.mjs";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); failed += 1; }
}

const P = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-20T12:00:00Z");
const PERIOD = { start: "2026-11-01T00:00:00Z", end: "2026-12-31T00:00:00Z" };
const BOX_A = "carla@axion.com.br";
const BOX_B = "carlos@axion.com.br";
const day = (d) => `2026-11-${String(d).padStart(2, "0")}T10:00:00Z`;
const ident = (run) => run.universeCount === run.processedCount + run.excludedCount + run.failedCount && run.processedCount <= run.eligibleCount;

const gm = (over) => gmailMessage(over);
function gmailRun(messages, opts = {}, runOpts = {}) {
  const transport = createFakeGmailTransport({ [runOpts.mailbox ?? BOX_A]: messages }, runOpts.mailbox ?? BOX_A, opts);
  const reader = createGmailReader({ transport });
  const store = runOpts.store ?? createMemoryStore();
  return { transport, reader, store, go: (extra = {}) => runMailboxSync({ reader, store, projectId: P, mailbox: runOpts.mailbox ?? BOX_A, rule: WEG_RULE, period: PERIOD, mode: "APPLY", now: NOW, ...extra }) };
}

await check("12 enviada para @weg.net (To) entra; direção OUTBOUND; sem palavra-chave", async () => {
  const t = gmailRun([gm({ id: "m12", from: BOX_A, to: ["fulano@weg.net"], subject: "Bom dia", date: day(5), messageId: "<m12@axion>" })]);
  const r = await t.go();
  assert.equal(r.counts.processed, 1);
  assert.equal(t.store.state.emails[0].direction, "OUTBOUND");
  assert.deepEqual(t.store.state.emails[0].involved_domains, ["axion.com.br", "weg.net"]);
  assert.ok(ident(r.run));
});

await check("13 recebida de @weg.net entra; direção INBOUND", async () => {
  const t = gmailRun([gm({ id: "m13", from: "Fulano <fulano@weg.net>", to: [BOX_A], date: day(6), messageId: "<m13@weg>" })]);
  const r = await t.go();
  assert.equal(r.counts.processed, 1);
  assert.equal(t.store.state.emails[0].direction, "INBOUND");
  assert.equal(t.store.state.emails[0].from_address, "fulano@weg.net");
});

await check("14 cópia (Cc) e cópia oculta (Bcc) com @weg.net entram; cc/bcc preservados", async () => {
  const t = gmailRun([
    gm({ id: "c1", from: "interno@axion.com.br", to: [BOX_A], cc: ["gerente@weg.net"], date: day(7), messageId: "<c1@axion>" }),
    gm({ id: "c2", from: BOX_A, to: ["cliente@outro.com"], bcc: ["auditoria@weg.net"], date: day(8), messageId: "<c2@axion>" }),
  ]);
  const r = await t.go();
  assert.equal(r.counts.processed, 2);
  assert.deepEqual(t.store.state.emails.find((e) => e.provider_message_id === "c1").cc_addresses, ["gerente@weg.net"]);
  assert.deepEqual(t.store.state.emails.find((e) => e.provider_message_id === "c2").bcc_addresses, ["auditoria@weg.net"]);
});

await check("domínio EXATO: weg.net.exemplo, xweg.net, sub.weg.net e mensagem sem @weg.net são excluídas com motivo; palavra-chave não decide", async () => {
  const t = gmailRun([
    gm({ id: "x1", from: "a@weg.net.exemplo", to: [BOX_A], date: day(9), messageId: "<x1@x>" }),
    gm({ id: "x2", from: "a@xweg.net", to: [BOX_A], date: day(9), messageId: "<x2@x>" }),
    gm({ id: "x3", from: "a@sub.weg.net", to: [BOX_A], date: day(9), messageId: "<x3@x>" }),
    gm({ id: "x4", from: "a@cliente.com", to: [BOX_A], subject: "WEG contrato aditivo medição", text: "weg.net contrato", date: day(9), messageId: "<x4@x>" }),
    gm({ id: "x5", from: "a@weg.net", to: [BOX_A], subject: "oi", text: "sem nenhuma palavra especial", date: day(9), messageId: "<x5@x>" }),
  ]);
  const r = await t.go();
  assert.equal(r.counts.processed, 1);
  assert.equal(r.counts.excluded, 4);
  assert.ok(r.exclusions.filter((x) => x.reason === "RULE_NOT_MATCHED").length === 4);
  assert.ok(ident(r.run));
});

await check("período: mensagem fora do período é excluída (OUT_OF_PERIOD); janela nunca antes do início do período", async () => {
  const t = gmailRun([gm({ id: "old", from: "a@weg.net", to: [BOX_A], date: "2026-10-15T10:00:00Z", messageId: "<old@x>" })]);
  const r = await t.go();
  assert.equal(r.counts.processed, 0);
  assert.equal(r.exclusions[0].reason, "OUT_OF_PERIOD");
  assert.ok(Date.parse(r.window.start) >= Date.parse(PERIOD.start));
});

await check("DRY_RUN é o padrão: nada gravado em emails/origens/cursor; reconciliação devolvida", async () => {
  const t = gmailRun([gm({ id: "d1", from: "a@weg.net", to: [BOX_A], date: day(10), messageId: "<d1@x>" })]);
  const r = await runMailboxSync({ reader: t.reader, store: t.store, projectId: P, mailbox: BOX_A, rule: WEG_RULE, period: PERIOD, now: NOW });
  assert.equal(r.run.mode, "DRY_RUN");
  assert.equal(r.run.status, "DRY_RUN");
  assert.equal(r.counts.processed, 1);
  assert.equal(t.store.state.emails.length, 0);
  assert.equal(t.store.state.sources.length, 0);
  assert.equal(t.store.state.cursors.size, 0);
  assert.ok(!t.store.state.calls.includes("insertEmail") && !t.store.state.calls.includes("saveCursor"));
});

await check("idempotência: reexecutar não duplica e conta como processada (replay); cursor avança com sobreposição que não recua antes do período", async () => {
  const t = gmailRun([gm({ id: "i1", from: "a@weg.net", to: [BOX_A], date: day(10), messageId: "<i1@x>" }), gm({ id: "i2", from: "a@weg.net", to: [BOX_A], date: day(11), messageId: "<i2@x>" })]);
  const a = await t.go();
  const b = await t.go({ now: new Date("2026-11-21T12:00:00Z") });
  assert.equal(a.counts.inserted, 2);
  assert.equal(b.counts.inserted, 0);
  assert.equal(b.counts.replayed, 2);
  assert.equal(t.store.state.emails.length, 2);
  const cursor = await t.store.getCursor({ projectId: P, provider: "GMAIL", mailbox: BOX_A });
  assert.equal(cursor.lastWindowEnd, "2026-11-21T12:00:00.000Z");
  assert.equal(Date.parse(b.window.start), Date.parse(NOW.toISOString()) - 10 * 60 * 1000);
});

await check("21 mesma mensagem em duas caixas: UMA linha em emails, duas origens, exclusão DUPLICATE_CROSS_MAILBOX", async () => {
  const store = createMemoryStore();
  const shared = (box) => gm({ id: `id-${box}`, from: "a@weg.net", to: [BOX_A, BOX_B], date: day(12), messageId: "<MESMA@weg.net>" });
  const a = gmailRun([shared("a")], {}, { store, mailbox: BOX_A });
  const b = gmailRun([shared("b")], {}, { store, mailbox: BOX_B });
  const ra = await a.go();
  const rb = await b.go();
  assert.equal(ra.counts.inserted, 1);
  assert.equal(rb.counts.inserted, 0);
  assert.equal(store.state.emails.length, 1);
  assert.equal(store.state.sources.length, 2);
  assert.equal(rb.exclusions[0].reason, "DUPLICATE_CROSS_MAILBOX");
  assert.equal(rb.counts.eligible, 1);
  assert.equal(rb.counts.excluded, 1);
  assert.ok(ident(rb.run));
  assert.equal(canonicalMessageKey({ internetMessageId: "<MESMA@weg.net>" }), canonicalMessageKey({ internetMessageId: "mesma@weg.net" }));
});

await check("sem Message-ID a chave é por caixa: mensagens diferentes nunca se unem", async () => {
  const k1 = canonicalMessageKey({ provider: "GMAIL", mailbox: BOX_A, providerMessageId: "1" });
  const k2 = canonicalMessageKey({ provider: "GMAIL", mailbox: BOX_B, providerMessageId: "1" });
  assert.notEqual(k1, k2);
});

await check("22 falha de sincronização: cursor NÃO avança, falha registrada; recuperação sem duplicar", async () => {
  const msgs = [1, 2, 3].map((n) => gm({ id: `f${n}`, from: "a@weg.net", to: [BOX_A], date: day(10 + n), messageId: `<f${n}@x>` }));
  const store = createMemoryStore();
  const bad = gmailRun(msgs, { failGet: { f2: 99 } }, { store });
  const r1 = await bad.go();
  assert.equal(r1.run.status, "PARTIAL");
  assert.equal(r1.counts.failed, 1);
  assert.equal(r1.counts.processed, 2);
  assert.equal(r1.cursorAdvanced, false);
  assert.equal(store.state.cursors.size, 0);
  assert.ok(r1.run.gaps.some((g) => g.type === "FETCH_FAILED" && g.id === "f2"));
  assert.ok(r1.exclusions.some((x) => x.reason === "FETCH_FAILED"));
  assert.ok(ident(r1.run));
  // Recuperação: o provedor volta; a próxima execução completa e não duplica f1/f3.
  const good = gmailRun(msgs, {}, { store });
  const r2 = await good.go();
  assert.equal(r2.run.status, "COMPLETED");
  assert.equal(r2.counts.inserted, 1);
  assert.equal(r2.counts.replayed, 2);
  assert.equal(store.state.emails.length, 3);
  assert.equal(r2.cursorAdvanced, true);
});

await check("22b falha transitória é retentada (2 falhas, 3ª tentativa passa) e a listagem que falha não avança o cursor", async () => {
  const one = [gm({ id: "t1", from: "a@weg.net", to: [BOX_A], date: day(10), messageId: "<t1@x>" })];
  const ok = gmailRun(one, { failGet: { t1: 2 } });
  const r = await ok.go();
  assert.equal(r.counts.processed, 1);
  const listFail = gmailRun(one, { failList: 9 });
  const r2 = await listFail.go();
  assert.equal(r2.run.status, "FAILED");
  assert.equal(r2.cursorAdvanced, false);
  assert.ok(ident(r2.run));
});

await check("23 anexo indisponível: a mensagem entra com anexo UNAVAILABLE; lacuna e exclusão (message_ingested) registradas", async () => {
  const t = gmailRun([gm({ id: "a1", from: "a@weg.net", to: [BOX_A], date: day(13), messageId: "<a1@x>", attachments: [{ filename: "ok.pdf", attachmentId: "att-ok" }, { filename: "perdido.pdf", attachmentId: "att-lost" }, { filename: "sem-id.pdf", attachmentId: "" }] })], { failAttachments: ["att-lost"] });
  const r = await t.go();
  assert.equal(r.counts.processed, 1);
  assert.equal(r.counts.excluded, 0);
  const meta = t.store.state.emails[0].attachments_meta;
  assert.deepEqual(meta.map((m) => [m.filename, m.status]), [["ok.pdf", "AVAILABLE"], ["perdido.pdf", "UNAVAILABLE"], ["sem-id.pdf", "UNAVAILABLE"]]);
  assert.equal(r.exclusions.filter((x) => x.reason === "ATTACHMENT_UNAVAILABLE" && x.messageIngested === true).length, 2);
  assert.equal(r.run.gaps.filter((g) => g.type === "ATTACHMENT_UNAVAILABLE").length, 2);
  assert.ok(ident(r.run));
});

await check("Gmail: o leitor só usa métodos de LEITURA (list/get/getAttachment); escrita via proxy é recusada e nenhuma escrita ocorre", async () => {
  const t = gmailRun([gm({ id: "r1", from: "a@weg.net", to: [BOX_A], date: day(14), messageId: "<r1@x>", attachments: [{ filename: "a.pdf", attachmentId: "x" }] })]);
  await t.go();
  const used = new Set(t.transport.calls.map((c) => c[0]));
  for (const m of used) assert.ok(GMAIL_READ_METHODS.includes(m), `método fora da leitura: ${m}`);
  assert.deepEqual(t.transport.writes, []);
  const guarded = readOnlyTransport(t.transport, GMAIL_READ_METHODS);
  assert.throws(() => guarded.send(), /READ_ONLY_VIOLATION/);
  assert.throws(() => guarded.modify(), /READ_ONLY_VIOLATION/);
  assert.deepEqual([...guarded.violations], ["send", "modify"]);
  assert.equal(t.transport.writes.length, 0);
});

// ---------- Microsoft Graph (transporte falso) ----------
const GM = (over) => graphMessage(over);
function graphRun(boxes, opts = {}, runOpts = {}) {
  const transport = createFakeGraphTransport(boxes, opts);
  const reader = createGraphReader({ transport });
  const store = runOpts.store ?? createMemoryStore();
  return { transport, reader, store, go: (extra = {}) => runMailboxSync({ reader, store, projectId: P, mailbox: runOpts.mailbox ?? BOX_A, rule: WEG_RULE, period: PERIOD, mode: "APPLY", now: NOW, ...extra }) };
}

await check("Graph 12/13/14: enviada para, recebida de e cópia/cópia oculta @weg.net; provider OUTLOOK; delta por pasta", async () => {
  const t = graphRun({ [BOX_A]: {
    inbox: [GM({ id: "g13", from: "fulano@weg.net", to: [BOX_A], sentDateTime: day(5), internetMessageId: "<g13@weg>" }), GM({ id: "g14", from: "i@axion.com.br", to: [BOX_A], cc: ["x@weg.net"], sentDateTime: day(6), internetMessageId: "<g14@a>" })],
    sentitems: [GM({ id: "g12", from: BOX_A, to: ["y@weg.net"], sentDateTime: day(7), internetMessageId: "<g12@a>" }), GM({ id: "g14b", from: BOX_A, to: ["z@outro.com"], bcc: ["k@weg.net"], sentDateTime: day(8), internetMessageId: "<g14b@a>" }), GM({ id: "gno", from: BOX_A, to: ["z@outro.com"], sentDateTime: day(8), internetMessageId: "<gno@a>" })],
  } });
  const r = await t.go();
  assert.equal(r.counts.processed, 4);
  assert.equal(r.counts.excluded, 1);
  assert.ok(t.store.state.emails.every((e) => e.provider === "OUTLOOK"));
  assert.equal(t.store.state.emails.find((e) => e.provider_message_id === "g12").direction, "OUTBOUND");
  assert.equal(t.store.state.emails.find((e) => e.provider_message_id === "g13").direction, "INBOUND");
  assert.deepEqual(t.store.state.emails.find((e) => e.provider_message_id === "g14b").bcc_addresses, ["k@weg.net"]);
  const cursor = await t.store.getCursor({ projectId: P, provider: "OUTLOOK", mailbox: BOX_A });
  assert.equal(cursor.kind, "GRAPH_DELTA");
  assert.deepEqual(Object.keys(cursor.deltaLinks).sort(), ["inbox", "sentitems"]);
  assert.ok(ident(r.run));
  assert.deepEqual(t.transport.writes, []);
});

await check("Graph delta: segunda execução usa o deltaLink salvo (não relê do início); itens removidos viram exclusão REMOVED_AT_PROVIDER", async () => {
  const boxes = { [BOX_A]: { inbox: [GM({ id: "d1", from: "a@weg.net", to: [BOX_A], sentDateTime: day(5), internetMessageId: "<d1@w>" })], sentitems: [] } };
  const t = graphRun(boxes, { removed: { inbox: ["gone-1"] } });
  const r1 = await t.go();
  assert.equal(r1.counts.processed, 1);
  assert.equal(r1.exclusions.find((x) => x.reason === "REMOVED_AT_PROVIDER").providerMessageId, "gone-1");
  await t.go({ now: new Date("2026-11-21T12:00:00Z") });
  const secondDeltaCalls = t.transport.calls.filter((c) => c[0] === "delta").slice(-2);
  assert.ok(secondDeltaCalls.every((c) => c[3] !== "(inicio)"), "a segunda leitura não pode recomeçar do início");
  assert.equal(t.store.state.emails.length, 1);
});

await check("Graph 21: a mesma mensagem (internetMessageId) em duas caixas não duplica", async () => {
  const store = createMemoryStore();
  const m = (id) => GM({ id, from: "a@weg.net", to: [BOX_A, BOX_B], sentDateTime: day(9), internetMessageId: "<COMPARTILHADA@weg.net>" });
  const a = graphRun({ [BOX_A]: { inbox: [m("ga")], sentitems: [] } }, {}, { store, mailbox: BOX_A });
  const b = graphRun({ [BOX_B]: { inbox: [m("gb")], sentitems: [] } }, {}, { store, mailbox: BOX_B });
  await a.go();
  const rb = await b.go();
  assert.equal(store.state.emails.length, 1);
  assert.equal(store.state.sources.length, 2);
  assert.equal(rb.exclusions[0].reason, "DUPLICATE_CROSS_MAILBOX");
});

await check("Graph 22: falha (429) mantém o cursor e recupera; Graph 23: anexo indisponível não descarta a mensagem", async () => {
  const store = createMemoryStore();
  const boxes = { [BOX_A]: { inbox: [
    GM({ id: "gf1", from: "a@weg.net", to: [BOX_A], sentDateTime: day(5), internetMessageId: "<gf1@w>" }),
    GM({ id: "gf2", from: "a@weg.net", to: [BOX_A], sentDateTime: day(6), internetMessageId: "<gf2@w>", hasAttachments: true }),
  ], sentitems: [] } };
  const att = { gf2: [{ id: "a1", name: "projeto.dwg", contentType: "application/acad", size: 10, isAvailable: true }, { id: "a2", name: "corrompido.pdf", contentType: "application/pdf", size: 10, isAvailable: false }] };
  const bad = graphRun(boxes, { failGet: { gf1: 99 }, attachments: att }, { store });
  const r1 = await bad.go();
  assert.equal(r1.run.status, "PARTIAL");
  assert.equal(r1.cursorAdvanced, false);
  assert.equal(store.state.cursors.size, 0);
  const good = graphRun(boxes, { attachments: att }, { store });
  const r2 = await good.go();
  assert.equal(r2.run.status, "COMPLETED");
  assert.equal(store.state.emails.length, 2);
  const withAtt = store.state.emails.find((e) => e.provider_message_id === "gf2");
  assert.deepEqual(withAtt.attachments_meta.map((x) => x.status), ["AVAILABLE", "UNAVAILABLE"]);
  const lista = graphRun({ [BOX_A]: { inbox: [GM({ id: "gl", from: "a@weg.net", to: [BOX_A], sentDateTime: day(5), internetMessageId: "<gl@w>", hasAttachments: true })], sentitems: [] } }, { failAttachmentList: ["gl"] });
  const r3 = await lista.go();
  assert.equal(r3.counts.processed, 1);
  assert.ok(r3.run.gaps.some((g) => g.type === "ATTACHMENT_UNAVAILABLE"));
});

await check("Graph: o leitor nunca chama escrita (sendMail/patch/delete) e a permissão exigida é só Mail.Read", async () => {
  const t = graphRun({ [BOX_A]: { inbox: [GM({ id: "w1", from: "a@weg.net", to: [BOX_A], sentDateTime: day(5), internetMessageId: "<w1@w>" })], sentitems: [] } });
  await t.go();
  const used = new Set(t.transport.calls.map((c) => c[0]));
  for (const m of used) assert.ok(["delta", "getMessage", "listAttachments"].includes(m));
  assert.deepEqual(t.transport.writes, []);
  assert.equal(t.reader.permission, "Mail.Read");
});

await check("reconciliação: universo = processadas + excluídas + falhas em um cenário misto (Gmail)", async () => {
  const msgs = [
    gm({ id: "u1", from: "a@weg.net", to: [BOX_A], date: day(10), messageId: "<u1@x>" }),
    gm({ id: "u2", from: "a@outro.com", to: [BOX_A], date: day(10), messageId: "<u2@x>" }),
    gm({ id: "u3", from: "a@weg.net", to: [BOX_A], date: day(10), messageId: "<u3@x>" }),
    gm({ id: "u4", from: "a@weg.net", to: [BOX_A], date: day(10), messageId: "<u1@x>" }),
  ];
  const t = gmailRun(msgs, { failGet: { u3: 99 } });
  const r = await t.go();
  assert.deepEqual([r.counts.universe, r.counts.processed, r.counts.excluded, r.counts.failed, r.counts.eligible], [4, 1, 2, 1, 2], JSON.stringify(r.counts));
  assert.ok(ident(r.run));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
