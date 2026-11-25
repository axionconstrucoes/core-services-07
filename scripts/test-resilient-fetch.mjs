// Testes do retry centralizado (scripts/lib/resilient-fetch.mjs) — incidente HTTP 522 de 25/11/2026.
// Usa um servidor HTTP REAL local (scripts/lib/fake-postgrest-server.mjs) e o cliente @supabase/supabase-js REAL.
// Nenhuma rede externa, nenhum segredo. Cobre:
//   1. política (quais status/métodos repetem; Retry-After; backoff com jitter e teto);
//   2. indisponibilidade temporária do Supabase e recuperação após 522;
//   3. falhas consecutivas além do limite (erro curto, sem HTML);
//   4. escrita: 522 (não entregue) repete sem duplicar; 504 após gravar (ambíguo) NÃO repete;
//   5. sincronização interrompida: checkpoint preservado na falha, retomada sem duplicidade;
//   6. concorrência entre agendadores (duas execuções simultâneas com falhas injetadas);
//   7. recuperação da importação de anexos (upsert idempotente);
//   8. mecanismo real dos workflows: processo filho com NODE_OPTIONS=--import=install-resilient-fetch.mjs,
//      o heartbeat e o gmail-inbound-sync (mensagem de erro de comunicação ≠ "configuração não encontrada");
//   9. logs sem HTML, sem query string e sem chave; hosts fora do Supabase intocados.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  computeDelay,
  createResilientFetch,
  decideRetry,
  parseRetryAfter,
} from "./lib/resilient-fetch.mjs";
import { startFakePostgrest } from "./lib/fake-postgrest-server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const KEY = "sb_secret_FAKE_teste_nao_e_chave_real_000000";
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FALHOU - ${name}`);
    throw error;
  }
}

function makeClient(server, { logs = [], sleeps = [], maxAttempts = 5 } = {}) {
  const fetchImpl = createResilientFetch({
    fetchImpl: globalThis.fetch,
    hosts: [server.host],
    maxAttempts,
    baseDelayMs: 2,
    maxDelayMs: 50,
    log: (line) => logs.push(line),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  const client = createClient(server.url, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
  return { client, logs, sleeps };
}

const isTable = (table, method) => (hit) => hit.path === `/rest/v1/${table}` && (!method || hit.method === method);

// ---------------------------------------------------------------- 1. Política
await test("política: GET repete em 408/429/502/503/504/52x; 4xx/500 não", () => {
  for (const status of [408, 429, 502, 503, 504, 520, 521, 522, 523, 524]) {
    assert.equal(decideRetry({ method: "GET", path: "/storage/v1/x", status }).retry, true, `GET ${status}`);
  }
  for (const status of [400, 401, 403, 404, 409, 500]) {
    assert.equal(decideRetry({ method: "GET", path: "/rest/v1/x", status }).retry, false, `GET ${status}`);
  }
});

await test("política: escrita só repete quando a requisição comprovadamente não chegou à origem", () => {
  for (const status of [408, 429, 503, 521, 522, 523]) {
    assert.equal(decideRetry({ method: "POST", path: "/rest/v1/emails", status }).retry, true, `POST ${status}`);
    assert.equal(decideRetry({ method: "PATCH", path: "/rest/v1/emails", status }).retry, true, `PATCH ${status}`);
  }
  for (const status of [502, 504, 520, 524]) {
    assert.equal(decideRetry({ method: "POST", path: "/rest/v1/emails", status }).retry, false, `POST ${status} ambíguo`);
  }
  // Upsert (Prefer resolution=merge-duplicates) é idempotente: repete inclusive em 504.
  assert.equal(
    decideRetry({ method: "POST", path: "/rest/v1/x", status: 504, headers: { Prefer: "resolution=merge-duplicates" } }).retry,
    true
  );
});

await test("política: erros de rede — conexão recusada repete até escrita; ECONNRESET em escrita não", () => {
  const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  const reset = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.equal(decideRetry({ method: "POST", networkError: refused }).retry, true);
  assert.equal(decideRetry({ method: "POST", networkError: reset }).retry, false);
  assert.equal(decideRetry({ method: "GET", networkError: reset }).retry, true);
  assert.equal(decideRetry({ method: "GET", networkError: abort }).retry, false);
});

await test("política: não duplica o retry próprio do postgrest-js (GET /rest/v1 com 503/520)", () => {
  assert.equal(decideRetry({ method: "GET", path: "/rest/v1/emails", status: 503 }).retry, false);
  assert.equal(decideRetry({ method: "GET", path: "/rest/v1/emails", status: 520 }).retry, false);
  assert.equal(decideRetry({ method: "GET", path: "/rest/v1/emails", status: 522 }).retry, true);
  assert.equal(decideRetry({ method: "GET", path: "/storage/v1/object/x", status: 503 }).retry, true);
});

await test("Retry-After (segundos e data HTTP) e backoff exponencial com jitter limitado", () => {
  assert.equal(parseRetryAfter("3"), 3000);
  assert.equal(parseRetryAfter(new Date(10_000 + 5000).toUTCString(), 10_000) <= 5000, true);
  assert.equal(parseRetryAfter("lixo"), null);
  assert.equal(computeDelay(0, { baseDelayMs: 1000, maxDelayMs: 30000, retryAfterMs: 120000 }), 30000, "Retry-After limitado ao teto");
  for (let i = 0; i < 8; i += 1) {
    for (const r of [0, 0.5, 0.999]) {
      const d = computeDelay(i, { baseDelayMs: 1000, maxDelayMs: 30000, random: () => r });
      const ceiling = Math.min(30000, 1000 * 2 ** i);
      assert.ok(d >= ceiling / 2 && d <= ceiling, `tentativa ${i}: ${d} fora de [${ceiling / 2}, ${ceiling}]`);
    }
  }
});

// ---------------------------------------------------------------- 2-3. Indisponibilidade e falhas consecutivas
await test("indisponibilidade temporária: 2x 522 no GET de configuração → recupera na 3ª tentativa", async () => {
  const server = await startFakePostgrest({ tables: { project_email_ingestion_configs: [{ id: "cfg-1", project_id: "p1", enabled: true }] } });
  try {
    server.inject(isTable("project_email_ingestion_configs", "GET"), 2, "522");
    const { client, logs } = makeClient(server);
    const { data, error } = await client.from("project_email_ingestion_configs").select("*").eq("project_id", "p1").single();
    assert.equal(error, null);
    assert.equal(data.id, "cfg-1");
    assert.equal(server.hits.filter(isTable("project_email_ingestion_configs")).length, 3);
    assert.match(logs.at(-1), /action=recuperado/);
    assert.equal(logs.length, 3);
  } finally {
    await server.close();
  }
});

await test("falhas consecutivas além do limite: erro curto (HTTP_522), sem HTML, sem query string, sem chave", async () => {
  const server = await startFakePostgrest({ tables: { project_email_ingestion_mailboxes: [] } });
  try {
    server.inject(isTable("project_email_ingestion_mailboxes"), 99, "522");
    const { client, logs, sleeps } = makeClient(server, { maxAttempts: 4 });
    const { data, error, status } = await client
      .from("project_email_ingestion_mailboxes")
      .select("mailbox_address")
      .eq("config_id", "reynaldo@exemplo.test");
    assert.equal(data, null);
    assert.equal(status, 522);
    assert.equal(error.code, "HTTP_522");
    assert.match(error.message, /^HTTP 522 \(Cloudflare: Connection timed out\) em supabase após 4 tentativa\(s\)/);
    assert.doesNotMatch(error.message, /<|DOCTYPE/i);
    assert.equal(error.details, "cf-ray=a60238eaab8d3eb7");
    assert.equal(server.hits.length, 4);
    assert.equal(sleeps.length, 3);
    const joined = logs.join("\n");
    assert.doesNotMatch(joined, /<|DOCTYPE|exemplo\.test|config_id|sb_secret|eq\./);
    assert.match(logs.at(-1), /attempt=4\/4 result=HTTP_522 action=desistiu\(limite\)/);
  } finally {
    await server.close();
  }
});

await test("522 com corpo vazio também vira erro com mensagem (não é confundido com 'não encontrado')", async () => {
  const server = await startFakePostgrest({ tables: { t: [] } });
  try {
    server.inject(isTable("t"), 99, "522-empty");
    const { client } = makeClient(server, { maxAttempts: 2 });
    const { error } = await client.from("t").select("*").eq("a", "1").single();
    assert.equal(error.code, "HTTP_522");
    assert.match(error.message, /corpo vazio omitido/);
  } finally {
    await server.close();
  }
});

await test("429 com Retry-After em segundos e em data HTTP é respeitado", async () => {
  const server = await startFakePostgrest({ tables: { t: [{ id: "1", a: "x" }] } });
  try {
    server.inject(isTable("t"), 1, "429:7");
    const { client, sleeps } = makeClient(server);
    const r1 = await client.from("t").select("*");
    assert.equal(r1.error, null);
    assert.deepEqual(sleeps, [50], "Retry-After 7 s limitado ao maxDelayMs do teste (50 ms)");

    server.inject(isTable("t"), 1, "429-date:0");
    const second = makeClient(server);
    const r2 = await second.client.from("t").select("*");
    assert.equal(r2.error, null);
    assert.ok(second.sleeps[0] <= 50);
  } finally {
    await server.close();
  }
});

await test("GET 503 em /rest/v1 fica com o retry do postgrest-js (sem empilhar camadas)", async () => {
  const server = await startFakePostgrest({ tables: { t: [{ id: "1" }] } });
  try {
    server.inject(isTable("t"), 1, "503");
    const { client, logs } = makeClient(server);
    const { error } = await client.from("t").select("*");
    assert.equal(error, null);
    assert.equal(server.hits.length, 2, "1 falha + 1 retry do postgrest-js");
    assert.match(logs[0], /sem-retry\(HTTP 503 \(repetido pelo postgrest-js\)\)/);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- 4. Escrita sem duplicidade
await test("escrita: POST com 522 (não entregue) é repetido e grava UMA vez", async () => {
  const server = await startFakePostgrest({ tables: { emails: [] }, uniqueKeys: { emails: ["project_id", "provider_message_id"] } });
  try {
    server.inject(isTable("emails", "POST"), 2, "522");
    const { client } = makeClient(server);
    const { error } = await client.from("emails").insert([{ project_id: "p1", provider_message_id: "m1" }, { project_id: "p1", provider_message_id: "m2" }]);
    assert.equal(error, null);
    assert.equal(server.state.emails.length, 2);
  } finally {
    await server.close();
  }
});

await test("escrita: 504 APÓS gravar (ambíguo) não é repetido; nova tentativa da rodada seguinte dá 23505 e não duplica", async () => {
  const server = await startFakePostgrest({ tables: { emails: [] }, uniqueKeys: { emails: ["project_id", "provider_message_id"] } });
  try {
    server.inject(isTable("emails", "POST"), 1, "504-after-commit");
    const { client, logs } = makeClient(server);
    const first = await client.from("emails").insert({ project_id: "p1", provider_message_id: "m1" });
    assert.equal(first.status, 504);
    assert.equal(server.hits.filter(isTable("emails", "POST")).length, 1, "escrita ambígua não repetida");
    assert.match(logs[0], /escrita ambígua: não repetida/);
    const again = await client.from("emails").insert({ project_id: "p1", provider_message_id: "m1" });
    assert.equal(again.error.code, "23505");
    assert.equal(server.state.emails.length, 1);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- 5-6. Sincronização interrompida e concorrência
// Mesmo encadeamento do scripts/gmail-inbound-sync.mjs: lê checkpoint → filtra existentes → insere em lote
// (fallback linha a linha tratando 23505) → avança last_sync_at SOMENTE no fim.
async function miniSync(client, messages, completedAt) {
  const { data: config, error: cfgErr } = await client.from("project_email_ingestion_configs").select("*").eq("project_id", "p1").single();
  if (cfgErr) throw new Error(cfgErr.message);
  const { data: existing, error: exErr } = await client.from("emails").select("provider_message_id").eq("project_id", "p1");
  if (exErr) throw new Error(exErr.message);
  const known = new Set(existing.map((r) => r.provider_message_id));
  const rows = messages.filter((m) => !known.has(m)).map((m) => ({ project_id: "p1", provider: "GMAIL", provider_message_id: m }));
  let inserted = 0;
  let duplicates = 0;
  if (rows.length) {
    const { error } = await client.from("emails").insert(rows);
    if (!error) inserted = rows.length;
    else {
      for (const row of rows) {
        const r = await client.from("emails").insert(row);
        if (!r.error) inserted += 1;
        else if (r.error.code === "23505") duplicates += 1;
        else throw new Error(r.error.message);
      }
    }
  }
  const { error: upErr } = await client.from("project_email_ingestion_configs").update({ last_sync_at: completedAt }).eq("id", config.id);
  if (upErr) throw new Error(upErr.message);
  return { inserted, duplicates };
}

function syncServer() {
  return startFakePostgrest({
    tables: { project_email_ingestion_configs: [{ id: "cfg-1", project_id: "p1", last_sync_at: "2026-11-25T14:00:00Z" }], emails: [] },
    uniqueKeys: { emails: ["project_id", "provider", "provider_message_id"] },
  });
}

await test("sincronização interrompida: checkpoint preservado na falha e retomada sem duplicidade", async () => {
  const server = await syncServer();
  try {
    // Falha persistente no PATCH do checkpoint (como o run 45538773637 das 03:16, PATCH 522).
    server.inject(isTable("project_email_ingestion_configs", "PATCH"), 99, "522");
    const { client } = makeClient(server, { maxAttempts: 3 });
    await assert.rejects(() => miniSync(client, ["m1", "m2", "m3"], "2026-11-25T15:00:00Z"), /HTTP 522/);
    assert.equal(server.state.project_email_ingestion_configs[0].last_sync_at, "2026-11-25T14:00:00Z", "checkpoint NÃO avançou");
    assert.equal(server.state.emails.length, 3);

    server.clearRules();
    const retomada = await miniSync(makeClient(server).client, ["m1", "m2", "m3", "m4"], "2026-11-25T15:15:00Z");
    assert.deepEqual(retomada, { inserted: 1, duplicates: 0 });
    assert.equal(server.state.emails.length, 4, "sem duplicidade após a retomada");
    assert.equal(server.state.project_email_ingestion_configs[0].last_sync_at, "2026-11-25T15:15:00Z");
  } finally {
    await server.close();
  }
});

await test("recuperação dentro da própria execução: 522 transitório em cada etapa não derruba a sincronização", async () => {
  const server = await syncServer();
  try {
    server.inject(isTable("project_email_ingestion_configs", "GET"), 1, "522");
    server.inject(isTable("emails", "GET"), 1, "522");
    server.inject(isTable("emails", "POST"), 1, "522");
    server.inject(isTable("project_email_ingestion_configs", "PATCH"), 1, "522");
    const result = await miniSync(makeClient(server).client, ["a", "b"], "2026-11-25T17:02:00Z");
    assert.deepEqual(result, { inserted: 2, duplicates: 0 });
    assert.equal(server.state.project_email_ingestion_configs[0].last_sync_at, "2026-11-25T17:02:00Z");
  } finally {
    await server.close();
  }
});

await test("concorrência entre agendadores: duas execuções simultâneas (pg_cron × schedule) com falhas → sem duplicidade", async () => {
  const server = await syncServer();
  try {
    server.inject(isTable("emails", "POST"), 2, "522");
    server.inject(isTable("emails", "GET"), 1, "502");
    const msgs = Array.from({ length: 25 }, (_, i) => `msg-${i}`);
    const results = await Promise.all([
      miniSync(makeClient(server).client, msgs, "2026-11-25T17:01:00Z"),
      miniSync(makeClient(server).client, msgs, "2026-11-25T17:01:30Z"),
    ]);
    const ids = server.state.emails.map((e) => e.provider_message_id);
    assert.equal(ids.length, 25);
    assert.equal(new Set(ids).size, 25);
    assert.equal(results[0].inserted + results[1].inserted, 25);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- 7. Importação de anexos
await test("importação de anexos: upsert idempotente repete em 504 e mantém um registro por anexo", async () => {
  const server = await startFakePostgrest({ tables: { email_attachments: [] }, uniqueKeys: { email_attachments: ["email_id", "gmail_attachment_id"] } });
  try {
    server.inject(isTable("email_attachments", "POST"), 1, "504-after-commit");
    server.inject(isTable("email_attachments", "POST"), 1, "522");
    const { client } = makeClient(server);
    const row = { email_id: "e1", gmail_attachment_id: "att-1", processing_status: "PROCESSED" };
    const { error } = await client.from("email_attachments").upsert(row, { onConflict: "email_id,gmail_attachment_id" });
    assert.equal(error, null);
    assert.equal(server.state.email_attachments.length, 1);
    assert.equal(server.hits.length, 3);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- 8. Mecanismo real dos workflows (processos filhos)
function runNode(args, env, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}
const FAST = { ACC_RETRY_BASE_DELAY_MS: "5", ACC_RETRY_MAX_DELAY_MS: "20" };
const INSTALL = "--import=./scripts/lib/install-resilient-fetch.mjs";

await test("NODE_OPTIONS do workflow: processo filho com supabase-js comum se recupera de 522", async () => {
  const server = await startFakePostgrest({ tables: { project_integrations: [{ id: "i1", project_id: "p1", source_type: "EMAIL" }] } });
  try {
    server.inject(isTable("project_integrations"), 2, "522");
    const code = [
      'import { createClient } from "@supabase/supabase-js";',
      "const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });",
      'const r = await c.from("project_integrations").select("id").eq("project_id", "p1");',
      "console.log(JSON.stringify({ error: r.error, n: r.data?.length }));",
    ].join("\n");
    const r = await runNode(["--input-type=module", "-e", code], {
      NODE_OPTIONS: INSTALL,
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      SUPABASE_SECRET_KEY: KEY,
      ...FAST,
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\{"error":null,"n":1\}/);
    assert.match(r.out, /\[acc-retry\] service=supabase op="GET \/rest\/v1\/project_integrations" attempt=3\/5 result=HTTP_200 action=recuperado/);
    assert.doesNotMatch(r.out, /sb_secret|DOCTYPE/);
  } finally {
    await server.close();
  }
});

await test("sem o instalador (comportamento anterior), o mesmo 522 chega ao script como HTML — prova do defeito", async () => {
  const server = await startFakePostgrest({ tables: { project_integrations: [] } });
  try {
    server.inject(isTable("project_integrations"), 1, "522");
    const code = [
      'import { createClient } from "@supabase/supabase-js";',
      "const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });",
      'const r = await c.from("project_integrations").select("id");',
      "console.log(String(r.error?.message).slice(0, 15));",
    ].join("\n");
    const r = await runNode(["--input-type=module", "-e", code], { NEXT_PUBLIC_SUPABASE_URL: server.url, SUPABASE_SECRET_KEY: KEY });
    assert.match(r.out, /<!DOCTYPE html>/);
  } finally {
    await server.close();
  }
});

await test("instalador não toca hosts fora do Supabase (Gmail/Construmanager passam direto)", async () => {
  const supa = await startFakePostgrest();
  const other = await startFakePostgrest({ tables: { t: [] } });
  try {
    other.inject(isTable("t"), 1, "522");
    const code = `const r = await fetch(process.env.OTHER + "/rest/v1/t"); console.log("status=" + r.status);`;
    const r = await runNode(["--input-type=module", "-e", code], {
      NODE_OPTIONS: INSTALL,
      NEXT_PUBLIC_SUPABASE_URL: supa.url,
      OTHER: other.url,
      ...FAST,
    });
    assert.match(r.out, /status=522/);
    assert.equal(other.hits.length, 1);
    assert.doesNotMatch(r.out, /acc-retry/);
  } finally {
    await supa.close();
    await other.close();
  }
});

await test("heartbeat: 522 transitório não perde o registro (idempotente, mesmo run_id)", async () => {
  const server = await startFakePostgrest();
  try {
    server.inject((h) => h.path.endsWith("/acc_scheduler_record_heartbeat"), 1, "522");
    server.inject((h) => h.path.endsWith("/acc_scheduler_record_heartbeat"), 1, "504-after-commit");
    const r = await runNode(["scripts/scheduler-heartbeat.mjs", "gmail-sync", "started"], {
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      SUPABASE_SECRET_KEY: KEY,
      GITHUB_RUN_ID: "45660161019",
      GITHUB_RUN_ATTEMPT: "1",
    });
    assert.equal(r.code, 0);
    assert.match(r.out, /Heartbeat registrado: gmail-sync started\./);
    assert.equal(server.heartbeats.length, 1);
    assert.equal(server.heartbeats[0].last_started_run_id, 45660161019);
    assert.doesNotMatch(r.out, /DOCTYPE|sb_secret/);
  } finally {
    await server.close();
  }
});

await test("heartbeat: indisponibilidade persistente só avisa e sai com 0 (nunca falha o workflow)", async () => {
  const server = await startFakePostgrest();
  try {
    server.inject(() => true, 99, "522");
    const r = await runNode(["scripts/scheduler-heartbeat.mjs", "gmail-sync", "started"], {
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      SUPABASE_SECRET_KEY: KEY,
    });
    assert.equal(r.code, 0);
    assert.match(r.out, /::warning::Heartbeat não registrado \(HTTP 522\)\./);
    assert.equal(server.hits.length, 4);
  } finally {
    await server.close();
  }
}, 90000);

await test("gmail-inbound-sync: falha de comunicação no GET de configuração NÃO vira 'configuração não encontrada'", async () => {
  const server = await startFakePostgrest({ tables: { project_email_ingestion_configs: [] } });
  try {
    server.inject(isTable("project_email_ingestion_configs"), 99, "522");
    const r = await runNode(["scripts/gmail-inbound-sync.mjs", "--apply"], {
      NODE_OPTIONS: INSTALL,
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      SUPABASE_SECRET_KEY: KEY,
      GOOGLE_GMAIL_INBOUND_MAILBOX: "teste@exemplo.test",
      ACC_RETRY_MAX_ATTEMPTS: "2",
      ...FAST,
    });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /Falha ao ler a configuração de ingestão \(HTTP 522, HTTP_522\): HTTP 522 \(Cloudflare: Connection timed out\)/);
    assert.doesNotMatch(r.out, /não encontrada|DOCTYPE/);
  } finally {
    await server.close();
  }
});

await test("gmail-inbound-sync: configuração realmente ausente continua 'não encontrada' (regra preservada)", async () => {
  const server = await startFakePostgrest({ tables: { project_email_ingestion_configs: [] } });
  try {
    const r = await runNode(["scripts/gmail-inbound-sync.mjs", "--apply"], {
      NODE_OPTIONS: INSTALL,
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      SUPABASE_SECRET_KEY: KEY,
      GOOGLE_GMAIL_INBOUND_MAILBOX: "teste@exemplo.test",
      ...FAST,
    });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /Configuração de ingestão não encontrada\./);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- 9. Logs: Construmanager sem página HTML
await test("Construmanager: página HTML de erro não vai para o log (antes: 'FALHA: <!DOCTYPE html>')", async () => {
  const { register } = await import("node:module");
  register("./ts-module-resolver.mjs", import.meta.url);
  const { sanitizeConstrumanagerApiError } = await import("../apps/web/lib/integrations/construmanager/sanitize-error.ts");
  const { cloudflareHtml } = await import("./lib/fake-postgrest-server.mjs");
  const out = sanitizeConstrumanagerApiError(new Error(cloudflareHtml(522)));
  assert.doesNotMatch(out, /</);
  assert.match(out, /^Resposta HTML de erro/);
  // Mensagem normalizada pelo retry (caminho principal) passa intacta.
  const normalized = "HTTP 522 (Cloudflare: Connection timed out) em supabase após 5 tentativa(s); corpo HTML omitido.";
  assert.equal(sanitizeConstrumanagerApiError(new Error(normalized)), normalized);
  // Regras anteriores preservadas.
  assert.match(sanitizeConstrumanagerApiError(new Error("System.Data.SqlClient.SqlException: x")), /Detalhe técnico omitido/);
});

// ---------------------------------------------------------------- 10. Workflows: ligação do mecanismo
await test("workflows: workers com Supabase carregam o instalador; heartbeat não; actions em Node 24; guarda de agendador", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = path.join(root, ".github", "workflows");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yml"));
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(text, /actions\/(checkout|setup-node)@v4\b/, `${f}: action em Node 20`);
    assert.doesNotMatch(text, /actions\/(setup-python@v5|setup-java@v4|github-script@v7)\b/, `${f}: action em Node 20`);
    for (const m of text.matchAll(/uses: (actions\/[a-z-]+)@([^\s]+)/g)) {
      assert.match(m[2], /^[0-9a-f]{40}$/, `${f}: ${m[1]} deve estar fixada por SHA`);
    }
  }
  const mustInstall = {
    "gmail-inbound-sync.yml": 2,
    "construmanager-content-ingestion.yml": 1,
    "diario-de-obra-sync.yml": 1,
    "document-processing-worker.yml": 1,
    "mpp-document-worker.yml": 1,
    "weekly-schedule-email-ingestion.yml": 1,
    "ssma-drive-photo-sync.yml": 1,
  };
  for (const [f, n] of Object.entries(mustInstall)) {
    const text = readFileSync(path.join(dir, f), "utf8");
    const count = (text.match(/NODE_OPTIONS: [^\r\n]*--import=\.\/scripts\/lib\/install-resilient-fetch\.mjs/g) ?? []).length;
    assert.equal(count, n, `${f}: instalador em ${count} step(s), esperado ${n}`);
    // continue-on-error continua restrito aos steps de heartbeat (nenhum erro de worker mascarado).
    const coe = (text.match(/continue-on-error: true/g) ?? []).length;
    const hb = (text.match(/run: node scripts\/scheduler-heartbeat\.mjs/g) ?? []).length;
    assert.ok(coe <= hb, `${f}: continue-on-error (${coe}) fora dos heartbeats (${hb})`);
  }
  for (const f of ["gmail-inbound-sync.yml", "construmanager-content-ingestion.yml", "diario-de-obra-sync.yml"]) {
    const text = readFileSync(path.join(dir, f), "utf8");
    assert.match(text, /if: \$\{\{ github\.event_name != 'schedule' \|\| vars\.ACC_SCHEDULER_PG_CRON_ENABLED != 'true' \}\}/, `${f}: guarda de agendador`);
  }
  const diarioWatch = readFileSync(path.join(dir, "diario-de-obra-monitoring-watchdog.yml"), "utf8");
  assert.match(diarioWatch, /conclusion != 'skipped'/);
});

console.log(`\nresilient-fetch: ${passed} teste(s) OK`);
