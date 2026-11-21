// Fase 5/A — adaptador Supabase do armazenamento, com cliente Supabase FALSO (sem rede, sem banco). Prova o mapeamento de colunas
// e tabelas, o tratamento de duplicata (23505) e que a escrita só usa as tabelas da migration 20261201100000.
// Uso: node scripts/test-f5-a-store-adapter.mjs
import assert from "node:assert/strict";
import { createSupabaseStore } from "./lib/mail-universal/supabase-store.mjs";
import { createGmailReader } from "./lib/mail-universal/gmail-reader.mjs";
import { runMailboxSync } from "./lib/mail-universal/engine.mjs";
import { WEG_RULE } from "./lib/mail-universal/eligibility.mjs";
import { createFakeGmailTransport, gmailMessage } from "./lib/mail-universal/fakes.mjs";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); }
}

function fakeClient({ duplicateOn = [] } = {}) {
  const log = [];
  const tables = {};
  const from = (table) => {
    const filters = [];
    const q = {
      select() { return q; },
      eq(col, val) { filters.push([col, val]); return q; },
      limit() { return q; },
      insert(row) {
        const rows = Array.isArray(row) ? row : [row];
        log.push(["insert", table, rows]);
        const dup = duplicateOn.includes(table);
        const res = { data: dup ? null : { id: `${table}-${log.length}` }, error: dup ? { code: "23505", message: "duplicate key" } : null };
        const chain = { select() { return chain; }, single: async () => res, then: (resolve) => resolve(res) };
        return chain;
      },
      upsert(row, opts) { log.push(["upsert", table, row, opts]); return Promise.resolve({ error: null }); },
      maybeSingle: async () => ({ data: (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
      then(resolve) { return resolve({ data: (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }); },
    };
    return q;
  };
  return { from, log, tables };
}

const P = "00000000-0000-4000-8000-000000000001";
const MB = "carla@axion.com.br";

await check("grava somente nas tabelas da migration (emails, email_message_sources, email_sync_*, email_ingestion_exclusions)", async () => {
  const client = fakeClient();
  const store = createSupabaseStore(client);
  const t = createFakeGmailTransport({ [MB]: [
    gmailMessage({ id: "a", from: "x@weg.net", to: [MB], date: "2026-11-05T10:00:00Z", messageId: "<a@weg.net>" }),
    gmailMessage({ id: "b", from: "z@fora.com", to: [MB], date: "2026-11-05T11:00:00Z", messageId: "<b@fora>" }),
  ] }, MB);
  const r = await runMailboxSync({ reader: createGmailReader({ transport: t }), store, projectId: P, mailbox: MB, rule: WEG_RULE, period: { start: "2026-11-01T00:00:00Z", end: "2026-12-31T00:00:00Z" }, mode: "APPLY", now: new Date("2026-11-20T12:00:00Z") });
  assert.equal(r.run.status, "COMPLETED");
  const tablesTouched = new Set(client.log.map((l) => l[1]));
  assert.deepEqual([...tablesTouched].sort(), ["email_ingestion_exclusions", "email_message_sources", "email_sync_cursors", "email_sync_reconciliation_runs", "emails"]);
  const run = client.log.find((l) => l[1] === "email_sync_reconciliation_runs")[2][0];
  assert.deepEqual([run.universe_count, run.processed_count, run.excluded_count, run.failed_count], [2, 1, 1, 0]);
  assert.equal(run.universe_count, run.processed_count + run.excluded_count + run.failed_count);
  const email = client.log.find((l) => l[1] === "emails")[2][0];
  assert.equal(email.project_id, P);
  assert.equal(email.canonical_message_key, "rfc:a@weg.net");
  const cursor = client.log.find((l) => l[0] === "upsert");
  assert.equal(cursor[3].onConflict, "project_id,provider,mailbox");
  const exclusion = client.log.find((l) => l[1] === "email_ingestion_exclusions")[2][0];
  assert.equal(exclusion.reason, "RULE_NOT_MATCHED");
  assert.equal("body_text" in exclusion, false, "a exclusão não guarda conteúdo da mensagem");
});

await check("DRY_RUN pelo adaptador: nenhuma escrita em emails/origens/cursor (só a reconciliação, que é o resultado do dry-run)", async () => {
  const client = fakeClient();
  const store = createSupabaseStore(client);
  const t = createFakeGmailTransport({ [MB]: [gmailMessage({ id: "a", from: "x@weg.net", to: [MB], date: "2026-11-05T10:00:00Z", messageId: "<a@weg.net>" })] }, MB);
  await runMailboxSync({ reader: createGmailReader({ transport: t }), store, projectId: P, mailbox: MB, rule: WEG_RULE, period: { start: "2026-11-01T00:00:00Z", end: "2026-12-31T00:00:00Z" }, now: new Date("2026-11-20T12:00:00Z") });
  assert.deepEqual([...new Set(client.log.map((l) => l[1]))], ["email_sync_reconciliation_runs"]);
});

await check("duplicata (23505) na inserção é tratada como já processada; origem duplicada é ignorada", async () => {
  const client = fakeClient({ duplicateOn: ["emails"] });
  const store = createSupabaseStore(client);
  const t = createFakeGmailTransport({ [MB]: [gmailMessage({ id: "a", from: "x@weg.net", to: [MB], date: "2026-11-05T10:00:00Z", messageId: "<a@weg.net>" })] }, MB);
  const r = await runMailboxSync({ reader: createGmailReader({ transport: t }), store, projectId: P, mailbox: MB, rule: WEG_RULE, period: { start: "2026-11-01T00:00:00Z", end: "2026-12-31T00:00:00Z" }, mode: "APPLY", now: new Date("2026-11-20T12:00:00Z") });
  assert.equal(r.counts.processed, 1);
  assert.equal(r.counts.replayed, 1);
  assert.equal(r.run.status, "COMPLETED");
  await createSupabaseStore(fakeClient({ duplicateOn: ["email_message_sources"] })).addSource({ emailId: "e", projectId: P, provider: "GMAIL", mailbox: MB, providerMessageId: "m" });
});

await check("erro que não é duplicata sobe (nunca engolido)", async () => {
  const bad = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }) }) }) }) };
  await assert.rejects(createSupabaseStore(bad).insertEmail({ project_id: P }), /permission denied/);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
