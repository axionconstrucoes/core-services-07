// Frente N5 — contrato de schema dos indicadores do Dashboard executivo.
// Replay de TODAS as migrations em PGlite (descartável, sem rede) e verificação de que cada coluna lida por
// lib/dashboard/get-dashboard-operational-facts.ts (e pelo bloco de clima da página) existe e é legível pelo papel
// `authenticated` (o Dashboard usa o client de SESSÃO). Uma coluna/grant ausente faria o indicador cair em
// "indisponível" silenciosamente — este teste torna isso visível.
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-dashboard-indicadores-n5-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 300)}`);
    failed += 1;
  }
}

const db = new PGlite();
await db.exec(platform);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
}

const READS = {
  risk_alert_cases: ["id", "status", "state", "risk_level", "title", "reference", "sla_action_id", "project_id"],
  sla_action_escalations: ["action_id", "to_level", "notified_user_id", "project_id"],
  risk_sla_consistency_issues: ["issue_code", "project_id"],
  risk_alert_outbox: ["status", "origin", "project_id"],
  emails: ["id", "sent_at", "project_id"],
  email_mailbox_collection_controls: ["collection_enabled", "revoked_at", "project_id"],
  project_schedule_baselines: ["schedule_version_id", "superseded_at", "project_id"],
  diario_de_obra_reports: ["reference_date", "weather", "project_id"],
  projects: ["project_start_date", "start_date"],
};

for (const [table, columns] of Object.entries(READS)) {
  await check(`${table}: colunas lidas pelo Dashboard existem (${columns.join(", ")})`, async () => {
    const { rows } = await db.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
      [table]
    );
    const have = new Set(rows.map((row) => row.column_name));
    const missing = columns.filter((column) => !have.has(column));
    if (missing.length) throw new Error(`faltam colunas: ${missing.join(", ")}`);
  });
  await check(`${table}: SELECT concedido a authenticated (client de sessão)`, async () => {
    const { rows } = await db.query("select has_table_privilege('authenticated', $1, 'SELECT') as ok", [`public.${table}`]);
    if (!rows[0].ok) throw new Error("sem SELECT para authenticated");
  });
}

await check("risk_alert_outbox.origin aceita EMAIL_REPLY (evidência de resposta processada)", async () => {
  const { rows } = await db.query(
    "select pg_get_constraintdef(c.oid) as def from pg_constraint c join pg_class t on t.oid = c.conrelid where t.relname = 'risk_alert_outbox' and c.contype = 'c'"
  );
  if (!rows.some((row) => /origin/.test(row.def) && /EMAIL_REPLY/.test(row.def))) throw new Error("check de origin sem EMAIL_REPLY");
});

await check("risk_alert_cases: status OPEN/CLOSED separado de state (máquina de tratamento) — base do critério de 'aberto'", async () => {
  const { rows } = await db.query(
    "select pg_get_constraintdef(c.oid) as def from pg_constraint c join pg_class t on t.oid = c.conrelid where t.relname = 'risk_alert_cases' and c.contype = 'c'"
  );
  const defs = rows.map((row) => row.def).join("\n");
  if (!/status.*'OPEN'.*'CLOSED'/s.test(defs)) throw new Error("status OPEN/CLOSED ausente");
  if (!/state.*'RESOLVED'/s.test(defs)) throw new Error("state RESOLVED ausente");
});

await db.close();
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
