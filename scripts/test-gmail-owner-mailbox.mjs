// Coleta da caixa do titular (recebidos + enviados): regras puras, travas do script, workflow e recuperação
// histórica de cronogramas. Sem rede, sem banco, sem segredos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import {
  buildOwnerQueries,
  classifyOwnerMessage,
  dedupeRows,
  formatCheckpoint,
  maskId,
  missingOwnerCredentials,
  ownerCredentialNames,
  parseCheckpoint,
  planWindows,
  resolveStart,
} from "./lib/gmail-owner-mailbox.mjs";

register("./ts-module-resolver.mjs", import.meta.url);
const { applyHistoricalBackfillPolicy } = await import("../apps/web/lib/schedule/weekly-ingestion/evaluate-weekly-schedule-email");

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`OK   ${name}`);
};

const OWNER = "titular@empresa.test";
const CLIENT = new Set(["cliente.test"]);

await test("credenciais por prefixo: cliente do slot ou compartilhado; só nomes faltantes", () => {
  const env = { P_MAILBOX: OWNER, P_REFRESH_TOKEN: "x", GOOGLE_GMAIL_OWNER_CLIENT_ID: "c", GOOGLE_GMAIL_OWNER_CLIENT_SECRET: "s" };
  assert.equal(ownerCredentialNames("p", env).clientId, "GOOGLE_GMAIL_OWNER_CLIENT_ID");
  assert.deepEqual(missingOwnerCredentials("P", env), []);
  const own = { ...env, P_CLIENT_ID: "a", P_CLIENT_SECRET: "b" };
  assert.equal(ownerCredentialNames("P", own).clientId, "P_CLIENT_ID");
  const missing = missingOwnerCredentials("P", { P_MAILBOX: OWNER });
  assert.ok(missing.includes("P_REFRESH_TOKEN") && missing.every((n) => /^[A-Z0-9_]+$/.test(n)));
});

await test("consultas cobrem recebidos, enviados ao cliente e enviados com .mpp — somente leitura", () => {
  const q = buildOwnerQueries({ clientDomains: CLIENT, afterEpoch: 10, beforeEpoch: 20 });
  assert.deepEqual(q.map((x) => x.kind), ["RECEIVED", "SENT_TO_CLIENT", "SENT_MPP"]);
  assert.ok(q[0].q.includes("from:cliente.test") && q[0].q.includes("after:10 before:20"));
  assert.ok(q[1].q.includes("in:sent") && q[1].q.includes("to:cliente.test") && q[1].q.includes("cc:cliente.test"));
  assert.ok(q[2].q.includes("filename:mpp"));
  assert.throws(() => buildOwnerQueries({ clientDomains: new Set(), afterEpoch: 1, beforeEpoch: 2 }));
});

await test("classificação: recebido do cliente, enviado ao cliente, enviado com .mpp no escopo; resto fora", () => {
  const base = { mailbox: OWNER, clientDomains: CLIENT };
  assert.deepEqual(classifyOwnerMessage({ ...base, from: ["a@cliente.test"], recipients: [OWNER] }), { eligible: true, direction: "INBOUND", reason: "RECEIVED_FROM_CLIENT" });
  assert.equal(classifyOwnerMessage({ ...base, from: ["a@outro.test"], recipients: [OWNER] }).eligible, false);
  assert.equal(classifyOwnerMessage({ ...base, from: ["a@cliente.test", "b@cliente.test"], recipients: [] }).eligible, false);
  assert.deepEqual(classifyOwnerMessage({ ...base, from: [OWNER], recipients: ["x@cliente.test"] }).reason, "SENT_TO_CLIENT");
  assert.equal(classifyOwnerMessage({ ...base, from: [OWNER], recipients: ["x@empresa.test"], attachmentNames: ["CRONO.MPP"], projectMatch: true }).reason, "SENT_MPP_IN_SCOPE");
  assert.equal(classifyOwnerMessage({ ...base, from: [OWNER], recipients: ["x@empresa.test"], attachmentNames: ["c.mpp"], projectMatch: false }).eligible, false);
  assert.equal(classifyOwnerMessage({ ...base, from: [OWNER], recipients: ["x@empresa.test"] }).eligible, false);
});

await test("janelas de 30 dias contíguas, sem lacuna nem sobreposição; checkpoint formata e relê", () => {
  const w = planWindows("2025-01-01T00:00:00Z", "2025-03-15T00:00:00Z");
  assert.equal(w.length, 3);
  for (let i = 1; i < w.length; i += 1) assert.equal(w[i].start.getTime(), w[i - 1].end.getTime());
  assert.equal(w.at(-1).end.toISOString(), "2025-03-15T00:00:00.000Z");
  const cp = parseCheckpoint(formatCheckpoint({ mode: "history", through: w[0].end }));
  assert.equal(cp.mode, "history");
  assert.equal(cp.through.getTime(), w[0].end.getTime());
  assert.equal(parseCheckpoint("lixo"), null);
});

await test("início: histórico retoma do checkpoint; contínuo com sobreposição; sem checkpoint nem --since => nada", () => {
  const through = new Date("2026-01-01T00:00:00Z");
  assert.equal(resolveStart({ mode: "history", checkpoint: { through }, since: "2020-01-01" }).getTime(), through.getTime());
  assert.equal(resolveStart({ mode: "incremental", checkpoint: { through } }).getTime(), through.getTime() - 10 * 60 * 1000);
  assert.equal(resolveStart({ mode: "incremental", checkpoint: null, since: null }), null);
  assert.throws(() => resolveStart({ mode: "history", since: "não-data" }));
});

await test("deduplicação: mesmo id nesta caixa, mesmo Message-ID de outra caixa e repetição no lote", () => {
  const rows = [
    { provider_message_id: "1", message_id_header: "<A@x>" },
    { provider_message_id: "2", message_id_header: "<b@x>" },
    { provider_message_id: "3", message_id_header: "<c@x>" },
    { provider_message_id: "4", message_id_header: "<C@x>" },
    { provider_message_id: "5", message_id_header: null },
  ];
  const r = dedupeRows(rows, { existingProviderIds: new Set(["2"]), existingMessageIds: new Set(["<a@x>"]) });
  assert.deepEqual(r.fresh.map((x) => x.provider_message_id), ["3", "5"]);
  assert.equal(r.sameMailbox, 1);
  assert.equal(r.crossMailbox, 2);
});

await test("recuperação histórica: .mpp vira revisão humana, nunca versão automática; ignorados intactos", () => {
  const mpp = { gmailAttachmentId: "a", fileName: "c.mpp" };
  const auto = { status: "AUTHORIZED_AUTO", rule: "AUTHORIZED_PLANNER_TIER", reasons: ["ok"], senderUserId: "u", senderTier: "FIRST_TIER", selectedAttachment: mpp, mppCandidates: [mpp] };
  const h = applyHistoricalBackfillPolicy(auto);
  assert.equal(h.status, "PENDING_HUMAN_REVIEW");
  assert.equal(h.rule, "HISTORICAL_BACKFILL_REVIEW");
  assert.equal(h.selectedAttachment, null);
  assert.ok(h.reasons.some((r) => r.includes("AUTHORIZED_AUTO")));
  const rejected = { ...auto, status: "REJECTED_UNAUTHORIZED_SENDER", rule: "SENDER_TIER_NOT_AUTHORIZED", selectedAttachment: null };
  assert.equal(applyHistoricalBackfillPolicy(rejected).status, "PENDING_HUMAN_REVIEW");
  const ignored = { ...auto, status: "IGNORED_NO_MPP", rule: "NO_MPP_ATTACHMENT", selectedAttachment: null, mppCandidates: [] };
  assert.equal(applyHistoricalBackfillPolicy(ignored), ignored);
  const ingest = rd("apps/web/lib/schedule/weekly-ingestion/ingest-weekly-schedule-email.ts");
  assert.ok(ingest.includes("candidate.historicalBackfill ? applyHistoricalBackfillPolicy(evaluated) : evaluated"));
});

await test("script de coleta: travas antes de ler, sem escrita no Gmail, logs mascarados, checkpoint após gravar", () => {
  const src = rd("scripts/gmail-owner-mailbox-sync.mjs");
  assert.ok(!/messages\.(delete|trash|modify|batchDelete|batchModify|send|insert|import)\b|users\.drafts|gmail\.modify|mail\.google\.com/.test(src), "nenhuma escrita no Gmail");
  const order = ["missingOwnerCredentials(PREFIX)", "config.enabled", "de caixas da obra. Coleta pulada", "getProfile", "messages.list"];
  const idx = order.map((s) => src.indexOf(s));
  assert.ok(idx.every((v, i) => v > 0 && (i === 0 || v > idx[i - 1])), `ordem das travas: ${idx}`);
  assert.ok(src.includes("caixa#${maskId(mailbox)}"));
  assert.ok(!/console\.(log|table|error)\([^)]*\bmailbox\b(?!\))/.test(src.replace(/maskId\(mailbox\)/g, "")), "endereço não é impresso");
  assert.ok(!/console\.[a-z]+\([^)]*subject/.test(src), "assunto não é impresso");
  assert.ok(src.indexOf('from("emails").insert(batch)') < src.indexOf("formatCheckpoint({ mode: MODE, through: window.end })"));
  assert.ok(src.includes('.like("detail", `mode=${MODE};%`)'), "checkpoints separados por modo");
  assert.ok(src.includes("if (!APPLY)") === false && src.includes("if (APPLY)"), "simulação não grava");
});

await test("intake do titular: janela explícita, histórico sem versão automática, cursor compartilhado intocado", () => {
  const src = rd("scripts/weekly-schedule-email-ingest.mjs");
  assert.ok(src.includes("WEEKLY_INTAKE_CREDENTIAL_PREFIX"));
  assert.ok(src.includes('phaseArg !== "intake" || !sinceArg'));
  assert.ok(src.includes("apply && !explicitWindow && maxSentAt"));
  assert.ok(src.includes("historicalBackfill,"));
});

await test("workflow: condicional aos segredos do slot, leitura, sem nomes/endereços, sem histórico agendado", () => {
  const wf = rd(".github/workflows/gmail-owner-mailbox-sync.yml");
  assert.ok(wf.includes("steps.check.outputs.ready == 'true'"));
  assert.ok(wf.includes("permissions:\n  contents: read"));
  assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(wf), "nenhum endereço no workflow público");
  assert.ok(!/ricardo|jaime|reynaldo/i.test(wf), "nenhum nome de pessoa no workflow público");
  assert.ok(wf.includes("INPUT_MODE: ${{ github.event.inputs.mode || 'incremental' }}"), "agendado = incremental");
  assert.ok(wf.includes('"--historical"'));
  assert.ok(wf.includes("concurrency:\n  group: gmail-owner-mailbox-sync\n"));
});

await test("OAuth: modo manual (--print-url / --callback-url) sem imprimir tokens; escopo só leitura", () => {
  const src = rd("scripts/gmail-inbound-oauth.mjs");
  assert.ok(src.includes('"--print-url"') && src.includes("--callback-url="));
  assert.ok(src.includes("returnedState !== state"));
  assert.ok(!/console\.[a-z]+\([^)]*(refresh_token|tokens\b)/.test(src), "token nunca impresso");
  const scopes = src.match(/https:\/\/www\.googleapis\.com\/auth\/[a-z._]+/g) ?? [];
  assert.deepEqual([...new Set(scopes)], ["https://www.googleapis.com/auth/gmail.readonly"]);
});

await test("identificador opaco estável e sem o endereço", () => {
  assert.equal(maskId("A@B.test"), maskId("a@b.test"));
  assert.match(maskId(OWNER), /^[0-9a-f]{10}$/);
});

console.log(`\n${passed} testes OK.`);
