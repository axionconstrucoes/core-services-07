// Backfill histórico x coleta incremental: execução simultânea e sobreposição de janelas NÃO perdem nem duplicam mensagens.
// PostgreSQL 17 DESCARTÁVEL (PGlite) com TODAS as migrations (inclui o índice único real de e-mails do Gmail) e dados sintéticos.
// Os dois escritores usam a MESMA inserção idempotente (lote -> linha a linha; 23505 = duplicada; outro erro aborta).
// Uso: node scripts/test-gmail-backfill-concurrency-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insertEmailsIdempotent } from "./lib/gmail-insert-idempotent.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "-- pgcrypto: omitido no PGlite");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 260)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const db = new PGlite();
await db.exec(PLATFORM);
for (const f of files) {
  try { await db.exec(clean(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message}`); process.exit(1); }
}
const PROJECT = "10000000-0000-4000-8000-0000000000aa";
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra sintetica','OS','Cliente','Cidade','2026-01-01','2027-01-01')", [PROJECT]);

const COLS = ["project_id", "from_address", "to_address", "subject", "snippet", "sent_at", "provider", "provider_message_id", "mailbox_address", "direction"];
// Cliente compatível com Supabase sobre o PGlite: insert(linha | linhas) é ATÔMICO (um comando), como no PostgREST.
const client = {
  from(table) {
    ok(table === "emails", "somente a tabela emails é escrita");
    return {
      async insert(input) {
        const rows = Array.isArray(input) ? input : [input];
        const params = [];
        const tuples = rows.map((r) => `(${COLS.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(",")})`);
        try { await db.query(`insert into public.emails (${COLS.join(",")}) values ${tuples.join(",")}`, params); return { error: null }; }
        catch (e) { return { error: { code: e.code, message: e.message } }; }
      },
    };
  },
};
const row = (i, extra = {}) => ({ project_id: PROJECT, from_address: "a@exemplo.invalid", to_address: "b@exemplo.invalid", subject: `Assunto ${i}`, snippet: "", sent_at: new Date(Date.UTC(2025, 5, 1 + (i % 28))).toISOString(), provider: "GMAIL", provider_message_id: `msg-${i}`, mailbox_address: "caixa@exemplo.invalid", direction: "INBOUND", ...extra });
const range = (a, b) => Array.from({ length: b - a }, (_, i) => row(a + i));
const count = async () => (await db.query("select count(*)::int n, count(distinct provider_message_id)::int d from public.emails where project_id=$1", [PROJECT])).rows[0];
const sideTables = async () => JSON.stringify([
  (await db.query("select count(*)::int n from public.email_attachments")).rows[0].n,
  (await db.query("select count(*)::int n from public.notifications")).rows[0].n,
  (await db.query("select count(*)::int n from public.project_email_ingestion_configs")).rows[0].n,
]);

console.log("\n======================================\nBackfill x incremental — simultaneidade e duplicidade (PGlite)\n======================================");

await check("o índice único real de e-mails do Gmail existe (projeto, provedor, caixa, id da mensagem)", async () => {
  const r = (await db.query("select indexdef from pg_indexes where indexname='emails_gmail_mailbox_message_unique_idx'")).rows;
  eq(r.length, 1, "índice");
});

await check("reexecução: a 2ª rodada do mesmo lote insere 0 e conta todas como já existentes", async () => {
  const a = await insertEmailsIdempotent(client, range(0, 30));
  eq(a, { inserted: 30, duplicates: 0 }, "1ª rodada");
  const b = await insertEmailsIdempotent(client, range(0, 30));
  eq(b, { inserted: 0, duplicates: 30 }, "2ª rodada");
  eq(await count(), { n: 30, d: 30 }, "sem duplicidade");
});

await check("sobreposição: o incremental já gravou parte da janela; o backfill grava só o que falta, sem perder nem duplicar", async () => {
  await db.query("delete from public.emails where project_id=$1", [PROJECT]);
  const incremental = await insertEmailsIdempotent(client, range(5, 15));
  const backfill = await insertEmailsIdempotent(client, range(0, 20));
  eq([incremental.inserted, backfill.inserted, backfill.duplicates], [10, 10, 10], "contagens");
  eq(await count(), { n: 20, d: 20 }, "união exata, sem duplicar");
});

await check("simultâneo: dois escritores intercalados com janelas sobrepostas -> união exata, soma das inseridas = total, sem erro", async () => {
  await db.query("delete from public.emails where project_id=$1", [PROJECT]);
  const [a, b] = await Promise.all([insertEmailsIdempotent(client, range(0, 50), 10), insertEmailsIdempotent(client, range(25, 75), 10)]);
  eq(await count(), { n: 75, d: 75 }, "união de 75 mensagens únicas, nenhuma perdida");
  eq(a.inserted + b.inserted, 75, "toda mensagem foi inserida exatamente uma vez");
  eq(a.duplicates + b.duplicates, 25, "as 25 sobrepostas foram contadas como duplicadas por quem chegou depois");
});

await check("pré-existentes preservados: linhas já gravadas não são alteradas pela reinserção", async () => {
  await db.query("delete from public.emails where project_id=$1", [PROJECT]);
  await insertEmailsIdempotent(client, [row(1, { subject: "ORIGINAL", direction: "OUTBOUND" })]);
  await insertEmailsIdempotent(client, [row(1, { subject: "SUBSTITUIDO", direction: "INBOUND" })]);
  const r = (await db.query("select subject, direction from public.emails where project_id=$1 and provider_message_id='msg-1'", [PROJECT])).rows;
  eq(r, [{ subject: "ORIGINAL", direction: "OUTBOUND" }], "a linha original permanece");
});

await check("erro diferente de 23505 ABORTA (não é engolido) e não corrompe o que já foi gravado", async () => {
  await db.query("delete from public.emails where project_id=$1", [PROJECT]);
  let falhou = null;
  try { await insertEmailsIdempotent(client, [row(1), row(2, { subject: null }), row(3)]); } catch (e) { falhou = e.message; }
  ok(falhou, "deveria abortar com a violação de NOT NULL");
  const n = (await count()).n;
  ok(n <= 1, "somente linhas válidas anteriores ao erro podem ter sido gravadas");
});

await check("a inserção só escreve em emails: anexos, notificações e configuração da coleta ficam intactos", async () => {
  const antes = await sideTables();
  await insertEmailsIdempotent(client, range(100, 130));
  eq(await sideTables(), antes, "nenhuma outra tabela alterada");
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
