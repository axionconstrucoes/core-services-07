// FASE 5 / A — monitoramento universal em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base descartável
// (acc_f5a_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role), dados 100% SINTÉTICOS.
// Cobre: estrutura e compatibilidade da migration 20261201100000 (2 reaplicações; inserção no formato antigo de emails continua
// valendo; provider OUTLOOK); CHECK de identidade de reconciliação; append-only (inclusive superusuário); RLS por tier
// (ADMIN/GESTOR leem; COLABORADOR, LEITURA, outro projeto, anon e execução sem projeto não leem; cursor invisível); e o MOTOR
// completo (Gmail e Graph com transporte FALSO) gravando num banco real: dedupe entre caixas, recuperação após falha, DRY_RUN sem escrita.
// NÃO roda no CI. Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-f5-a-monitoramento-realpg.mjs
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGmailReader } from "./lib/mail-universal/gmail-reader.mjs";
import { createGraphReader } from "./lib/mail-universal/graph-reader.mjs";
import { runMailboxSync } from "./lib/mail-universal/engine.mjs";
import { WEG_RULE } from "./lib/mail-universal/eligibility.mjs";
import { createFakeGmailTransport, createFakeGraphTransport, gmailMessage, graphMessage } from "./lib/mail-universal/fakes.mjs";

const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO: defina ACC_REALPG_URL (PostgreSQL real local) e ACC_REALPG_PKG_DIR. Este teste não roda no CI.");
  process.exit(0);
}
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") {
  console.error("RECUSADO: só aceito 127.0.0.1:55434 (PostgreSQL local de homologação).");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^20261201100000_/.test(f));
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const GOTRUE = `
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;`;
const platform = PLATFORM.replace(/^create role .*$/gm, "").replace(/^create function auth\.(uid|role|jwt)\(\).*$/gm, "-- stub removido") + "\n" + GOTRUE;

let passed = 0;
let failed = 0;
const open = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 600)}`);
    failed += 1;
  } finally {
    while (open.length) await open.pop().end().catch(() => {});
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
const rejects = async (p, re, m) => {
  try { await p; } catch (e) { ok(re.test(e.message), `${m}: erro inesperado: ${e.message.split("\n")[0]}`); return; }
  throw new Error(`${m}: deveria ter sido recusado`);
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f5a_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
try {
  await su.query(platform);
  for (const f of files) {
    try { await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); } catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  for (let i = 0; i < 2; i += 1) for (const f of MINE) await su.query(readFileSync(path.join(dir, f), "utf8"));
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 5/A reaplicada 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(5100 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000051a0";
  const PB = "10000000-0000-4000-8000-0000000051b0";
  const U = { ADMIN: 1, GESTOR: 2, COLAB: 3, LEITURA: 4, ADMINB: 5 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f5a-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F5A ${n}`, `f5a-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F5A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F5B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm) => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [p, uid(n), perm]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const run = (over = {}) => ({ provider: "GMAIL", mailbox: "carla@axion.com.br", project_id: PA, period_start: "2026-11-01", period_end: "2026-11-20", universe_count: 5, eligible_count: 4, processed_count: 3, excluded_count: 1, failed_count: 1, gaps: "[]", status: "PARTIAL", ...over });
  const insertRun = async (c, r) => (await c.query(
    "insert into public.email_sync_reconciliation_runs (provider,mailbox,project_id,period_start,period_end,universe_count,eligible_count,processed_count,excluded_count,failed_count,gaps,status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id",
    [r.provider, r.mailbox, r.project_id, r.period_start, r.period_end, r.universe_count, r.eligible_count, r.processed_count, r.excluded_count, r.failed_count, r.gaps, r.status])).rows[0].id;

  // ======================= estrutura e compatibilidade =======================
  await check("ESTRUTURA: 5 colunas novas em emails, 4 tabelas, RLS ligada; reaplicação idempotente já feita 2x", async () => {
    eq(await nq("select count(*) n from information_schema.columns where table_schema='public' and table_name='emails' and column_name in ('cc_addresses','bcc_addresses','involved_domains','canonical_message_key','attachments_meta')"), 5, "colunas");
    eq(await nq("select count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('email_sync_cursors','email_message_sources','email_sync_reconciliation_runs','email_ingestion_exclusions') and c.relrowsecurity"), 4, "RLS");
  });

  const legacyInsert = (id, prov = "GMAIL") => su.query("insert into public.emails (project_id,from_address,to_address,subject,sent_at,snippet,provider,provider_message_id,mailbox_address,direction) values ($1,'a@weg.net','b@axion.com.br','legado','2026-11-01','s',$3,$2,'b@axion.com.br','INBOUND')", [PA, id, prov]);

  await check("COMPAT: inserção no formato ANTIGO de emails (sem as colunas novas) segue válida; defaults aplicados; índice único do Gmail preservado", async () => {
    await legacyInsert("legacy-1");
    const r = (await su.query("select cc_addresses, bcc_addresses, involved_domains, canonical_message_key, attachments_meta from public.emails where provider_message_id='legacy-1'")).rows[0];
    eq([r.cc_addresses, r.bcc_addresses, r.involved_domains, r.canonical_message_key, r.attachments_meta], [[], [], [], null, []], "defaults");
    await rejects(legacyInsert("legacy-1"), /duplicate key|emails_gmail_mailbox_message_unique_idx/, "índice único do Gmail preservado");
  });

  await check("PROVIDER: OUTLOOK aceito (com índice único próprio); provedor desconhecido recusado", async () => {
    await legacyInsert("out-1", "OUTLOOK");
    await rejects(legacyInsert("out-1", "OUTLOOK"), /duplicate key|emails_outlook_mailbox_message_unique_idx/, "duplicata Outlook");
    await rejects(legacyInsert("imap-1", "IMAP"), /emails_provider_check/, "provedor inválido");
  });

  // ======================= integridade =======================
  await check("CHECK: identidade universo = processadas + excluídas + falhas; elegível >= processadas; período coerente; status/provedor/caixa válidos", async () => {
    ok(await insertRun(su, run()), "execução válida deveria entrar");
    await rejects(insertRun(su, run({ universe_count: 6 })), /email_sync_runs_identity_check/, "identidade");
    await rejects(insertRun(su, run({ eligible_count: 2 })), /email_sync_runs_eligible_check/, "elegível < processadas");
    await rejects(insertRun(su, run({ period_end: "2026-10-01" })), /email_sync_runs_period_check/, "período invertido");
    await rejects(insertRun(su, run({ status: "OK" })), /status_check/, "status");
    await rejects(insertRun(su, run({ provider: "IMAP" })), /provider_check/, "provedor");
    await rejects(insertRun(su, run({ mailbox: "Carla@AXION.com.br" })), /mailbox_check/, "caixa precisa estar em minúsculas");
  });

  await check("APPEND-ONLY: reconciliação, exclusões e origens não admitem UPDATE/DELETE (nem superusuário)", async () => {
    const runId = await insertRun(su, run());
    await su.query("insert into public.email_ingestion_exclusions (run_id,project_id,provider,provider_message_id,reason) values ($1,$2,'GMAIL','m-1','RULE_NOT_MATCHED')", [runId, PA]);
    await rejects(su.query("update public.email_sync_reconciliation_runs set status='COMPLETED' where id=$1", [runId]), /EMAIL_INGESTION_APPEND_ONLY/, "update run");
    await rejects(su.query("delete from public.email_sync_reconciliation_runs where id=$1", [runId]), /EMAIL_INGESTION_APPEND_ONLY/, "delete run");
    await rejects(su.query("update public.email_ingestion_exclusions set reason='FETCH_FAILED' where run_id=$1", [runId]), /EMAIL_INGESTION_APPEND_ONLY/, "update exclusão");
    await rejects(su.query("delete from public.email_ingestion_exclusions where run_id=$1", [runId]), /EMAIL_INGESTION_APPEND_ONLY/, "delete exclusão");
    await rejects(su.query("insert into public.email_ingestion_exclusions (run_id,provider,provider_message_id,reason) values ($1,'GMAIL','m-2','INVENTADO')", [runId]), /reason_check/, "motivo fora do enum");
    const emailId = (await su.query("select id from public.emails where provider_message_id='legacy-1'")).rows[0].id;
    await su.query("insert into public.email_message_sources (email_id,project_id,provider,mailbox,provider_message_id) values ($1,$2,'GMAIL','b@axion.com.br','legacy-1')", [emailId, PA]);
    await rejects(su.query("update public.email_message_sources set mailbox='x@axion.com.br'"), /EMAIL_INGESTION_APPEND_ONLY/, "update origem");
  });

  // ======================= RLS =======================
  await check("RLS: ADMIN e GESTOR do projeto leem reconciliação/exclusões; COLABORADOR, LEITURA, outro projeto, anon e execução sem projeto NÃO leem", async () => {
    const runId = await insertRun(su, run());
    await su.query("insert into public.email_ingestion_exclusions (run_id,project_id,provider,provider_message_id,reason) values ($1,$2,'GMAIL','rls-1','RULE_NOT_MATCHED')", [runId, PA]);
    const orphan = await insertRun(su, run({ project_id: null }));
    const count = async (c, table, extra = "") => Number((await c.query(`select count(*) n from public.${table} ${extra}`)).rows[0].n);
    for (const [who, n, expectVisible] of [["ADMIN", U.ADMIN, true], ["GESTOR", U.GESTOR, true], ["COLAB", U.COLAB, false], ["LEITURA", U.LEITURA, false], ["ADMIN de outro projeto", U.ADMINB, false]]) {
      const c = await as(n);
      eq((await count(c, "email_sync_reconciliation_runs", `where id='${runId}'`)) > 0, expectVisible, `${who}: leitura da execução`);
      eq((await count(c, "email_ingestion_exclusions", "where provider_message_id='rls-1'")) > 0, expectVisible, `${who}: leitura da exclusão`);
      eq(await count(c, "email_sync_reconciliation_runs", `where id='${orphan}'`), 0, `${who}: execução sem projeto é invisível`);
    }
    const anon = await as(null, "anon");
    await rejects(anon.query("select count(*) from public.email_sync_reconciliation_runs"), /permission denied/, "anon sem acesso");
  });

  await check("RLS/GRANT: cursor invisível a authenticated; nenhuma escrita por authenticated; service_role escreve", async () => {
    const c = await as(U.ADMIN);
    await rejects(c.query("select * from public.email_sync_cursors"), /permission denied/, "cursor");
    await rejects(c.query("insert into public.email_sync_cursors (project_id,provider,mailbox,cursor) values ($1,'GMAIL','x@axion.com.br','{}')", [PA]), /permission denied/, "insert cursor");
    await rejects(c.query("insert into public.email_sync_reconciliation_runs (provider,mailbox,project_id,period_start,period_end,universe_count,eligible_count,processed_count,excluded_count,failed_count,status) values ('GMAIL','x@axion.com.br',$1,now(),now(),0,0,0,0,0,'COMPLETED')", [PA]), /permission denied|row-level security/, "insert run");
    await rejects(c.query("insert into public.email_ingestion_exclusions (run_id,provider,provider_message_id,reason) values (gen_random_uuid(),'GMAIL','x','FETCH_FAILED')"), /permission denied|row-level security/, "insert exclusão");
    const s = await as(null, "service_role");
    await s.query("insert into public.email_sync_cursors (project_id,provider,mailbox,cursor) values ($1,'GMAIL','svc@axion.com.br','{\"k\":1}')", [PA]);
    eq(await nq("select count(*) n from public.email_sync_cursors where mailbox='svc@axion.com.br'"), 1, "service_role grava cursor");
  });

  // ======================= motor ponta a ponta no banco real =======================
  function pgStore() {
    const fail = (e) => Object.assign(new Error(e.message), { code: e.code });
    return {
      async getCursor(p) { return (await su.query("select cursor from public.email_sync_cursors where project_id=$1 and provider=$2 and mailbox=$3", [p.projectId, p.provider, p.mailbox])).rows[0]?.cursor ?? null; },
      async saveCursor(p) { await su.query("insert into public.email_sync_cursors (project_id,provider,mailbox,cursor,last_success_at) values ($1,$2,$3,$4,$5) on conflict (project_id,provider,mailbox) do update set cursor=excluded.cursor,last_success_at=excluded.last_success_at,updated_at=now()", [p.projectId, p.provider, p.mailbox, JSON.stringify(p.cursor), p.lastSuccessAt]); },
      async findBySource(p) { return (await su.query("select id from public.emails where project_id=$1 and provider=$2 and mailbox_address=$3 and provider_message_id=$4", [p.projectId, p.provider, p.mailbox, p.providerMessageId])).rows[0] ?? null; },
      async findByCanonicalKey(p) { return (await su.query("select id from public.emails where project_id=$1 and canonical_message_key=$2 limit 1", [p.projectId, p.key])).rows[0] ?? null; },
      async insertEmail(row) {
        const cols = Object.keys(row);
        try {
          return (await su.query(`insert into public.emails (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, cols.map((c) => (c === "attachments_meta" ? JSON.stringify(row[c]) : row[c])))).rows[0];
        } catch (e) { throw fail(e); }
      },
      async addSource(p) { await su.query("insert into public.email_message_sources (email_id,project_id,provider,mailbox,provider_message_id) values ($1,$2,$3,$4,$5) on conflict do nothing", [p.emailId, p.projectId, p.provider, p.mailbox, p.providerMessageId]); },
      async recordRun(r, exclusions) {
        const id = (await su.query("insert into public.email_sync_reconciliation_runs (provider,mailbox,project_id,period_start,period_end,universe_count,eligible_count,processed_count,excluded_count,failed_count,gaps,status,mode,rule_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id",
          [r.provider, r.mailbox, r.projectId, r.periodStart, r.periodEnd, r.universeCount, r.eligibleCount, r.processedCount, r.excludedCount, r.failedCount, JSON.stringify(r.gaps), r.status, r.mode, r.ruleId])).rows[0].id;
        for (const x of exclusions) await su.query("insert into public.email_ingestion_exclusions (run_id,project_id,provider,provider_message_id,reason,detail,message_ingested) values ($1,$2,$3,$4,$5,$6,$7)", [id, r.projectId, x.provider, x.providerMessageId, x.reason, x.detail, x.messageIngested]);
        return id;
      },
    };
  }
  const NOW = new Date("2026-11-20T12:00:00Z");
  const PERIOD = { start: "2026-11-01T00:00:00Z", end: "2026-12-31T00:00:00Z" };
  const day = (d) => `2026-11-${String(d).padStart(2, "0")}T10:00:00Z`;
  const A = "carla.f5@axion.com.br";
  const B = "carlos.f5@axion.com.br";
  const gm = (over) => gmailMessage(over);
  const go = (reader, mailbox, extra = {}) => runMailboxSync({ reader, store: pgStore(), projectId: PA, mailbox, rule: WEG_RULE, period: PERIOD, now: NOW, mode: "APPLY", ...extra });

  await check("MOTOR (Gmail, banco real): grava cc/bcc/domínios/chave canônica; dedupe entre caixas; reconciliação e exclusões persistidas", async () => {
    const msgs = (box) => [
      gm({ id: `s-${box}`, from: "x@weg.net", to: [A, B], date: day(5), messageId: "<compartilhada-f5@weg.net>" }),
      gm({ id: `o-${box}`, from: A, to: ["cliente@outro.com"], bcc: ["aud@weg.net"], date: day(6), messageId: `<enviada-${box}@axion>` }),
      gm({ id: `n-${box}`, from: "z@outro.com", to: [box], date: day(7), messageId: `<fora-${box}@x>` }),
    ];
    const ra = await go(createGmailReader({ transport: createFakeGmailTransport({ [A]: msgs("a") }, A) }), A);
    const rb = await go(createGmailReader({ transport: createFakeGmailTransport({ [B]: msgs("b") }, B) }), B);
    eq([ra.counts.universe, ra.counts.processed, ra.counts.excluded], [3, 2, 1], "caixa A");
    eq([rb.counts.universe, rb.counts.processed, rb.counts.excluded], [3, 1, 2], "caixa B (compartilhada vira duplicata; fora da regra exclui)");
    eq(await nq("select count(*) n from public.emails where canonical_message_key='rfc:compartilhada-f5@weg.net'"), 1, "uma linha para a mensagem compartilhada");
    eq(await nq("select count(*) n from public.email_message_sources where provider_message_id in ('s-a','s-b')"), 2, "duas origens");
    const row = (await su.query("select bcc_addresses, involved_domains from public.emails where provider_message_id='o-a'")).rows[0];
    eq([row.bcc_addresses, row.involved_domains], [["aud@weg.net"], ["axion.com.br", "outro.com", "weg.net"]], "bcc e domínios");
    eq(await nq("select count(*) n from public.email_sync_reconciliation_runs where mailbox in ($1,$2) and status='COMPLETED'", [A, B]), 2, "duas execuções COMPLETED");
    eq(await nq("select count(*) n from public.email_ingestion_exclusions where reason='DUPLICATE_CROSS_MAILBOX' and provider_message_id='s-b'"), 1, "motivo da duplicata");
    eq(await nq("select count(*) n from public.email_sync_cursors where mailbox in ($1,$2)", [A, B]), 2, "cursores por caixa");
  });

  await check("MOTOR (banco real): falha mantém o cursor e a recuperação não duplica; DRY_RUN não grava nada", async () => {
    const C = "recuperacao.f5@axion.com.br";
    const msgs = [1, 2, 3].map((n) => gm({ id: `r${n}`, from: "x@weg.net", to: [C], date: day(8 + n), messageId: `<rec${n}@weg.net>` }));
    const bad = await go(createGmailReader({ transport: createFakeGmailTransport({ [C]: msgs }, C, { failGet: { r2: 99 } }) }), C);
    eq([bad.run.status, bad.counts.failed, bad.cursorAdvanced], ["PARTIAL", 1, false], "falha");
    eq(await nq("select count(*) n from public.email_sync_cursors where mailbox=$1", [C]), 0, "cursor não avançou");
    const good = await go(createGmailReader({ transport: createFakeGmailTransport({ [C]: msgs }, C) }), C);
    eq([good.run.status, good.counts.inserted, good.counts.replayed], ["COMPLETED", 1, 2], "recuperação");
    eq(await nq("select count(*) n from public.emails where mailbox_address=$1", [C]), 3, "sem duplicar");
    const D = "dry.f5@axion.com.br";
    const before = await nq("select count(*) n from public.emails");
    const dry = await go(createGmailReader({ transport: createFakeGmailTransport({ [D]: [gm({ id: "dry1", from: "x@weg.net", to: [D], date: day(5), messageId: "<dry1@weg.net>" })] }, D) }), D, { mode: "DRY_RUN" });
    eq([dry.run.mode, dry.run.status, dry.counts.processed], ["DRY_RUN", "DRY_RUN", 1], "dry-run");
    eq(await nq("select count(*) n from public.emails"), before, "dry-run não grava e-mails");
    eq(await nq("select count(*) n from public.email_sync_cursors where mailbox=$1", [D]), 0, "dry-run não grava cursor");
  });

  await check("MOTOR (Graph, banco real): provider OUTLOOK gravado; anexo indisponível preservado em attachments_meta", async () => {
    const E = "graph.f5@axion.com.br";
    const t = createFakeGraphTransport(
      { [E]: { inbox: [graphMessage({ id: "g1", from: "x@weg.net", to: [E], sentDateTime: day(5), internetMessageId: "<g1-f5@weg>", hasAttachments: true })], sentitems: [] } },
      { attachments: { g1: [{ id: "a1", name: "ok.pdf", isAvailable: true }, { id: "a2", name: "ruim.pdf", isAvailable: false }] } },
    );
    const r = await go(createGraphReader({ transport: t }), E);
    eq([r.run.status, r.counts.processed], ["COMPLETED", 1], "execução");
    const row = (await su.query("select provider, attachments_meta from public.emails where provider_message_id='g1'")).rows[0];
    eq(row.provider, "OUTLOOK", "provedor");
    eq(row.attachments_meta.map((m) => m.status), ["AVAILABLE", "UNAVAILABLE"], "anexos");
    eq(await nq("select count(*) n from public.email_ingestion_exclusions where reason='ATTACHMENT_UNAVAILABLE' and message_ingested"), 1, "lacuna registrada");
  });

  // Por último: o rollback altera o esquema da própria base de teste.
  await check("ROLLBACK: com e-mails OUTLOOK o rollback RECUSA; sem eles executa, remove colunas/tabelas e a migration é reaplicável", async () => {
    const rb = readFileSync(path.join(here, "..", "supabase", "rollbacks", "20261201100000_email_universal_monitoring.rollback.sql"), "utf8");
    await rejects(su.query(rb), /ROLLBACK_BLOCKED/, "rollback com OUTLOOK");
    await su.query("delete from public.emails where provider = 'OUTLOOK'");
    await su.query(rb);
    eq(await nq("select count(*) n from information_schema.columns where table_name='emails' and column_name in ('cc_addresses','canonical_message_key')"), 0, "colunas removidas");
    eq(await nq("select count(*) n from pg_class where relname in ('email_sync_reconciliation_runs','email_ingestion_exclusions','email_message_sources','email_sync_cursors')"), 0, "tabelas removidas");
    for (let i = 0; i < 2; i += 1) await su.query(readFileSync(path.join(dir, MINE[0]), "utf8"));
    eq(await nq("select count(*) n from information_schema.columns where table_name='emails' and column_name='canonical_message_key'"), 1, "reaplicável após o rollback");
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
