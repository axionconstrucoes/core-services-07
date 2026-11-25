#!/usr/bin/env node
// Plano IDEMPOTENTE de reconciliação do histórico de migrations (7 versões locais ≠ versão registrada no banco operacional).
// NÃO renomeia nada: lista os 7 `git mv`, TODAS as referências (nome completo e versão) a atualizar e, opcionalmente,
// valida em PostgreSQL REAL que o replay na ordem RENOMEADA gera o MESMO schema que na ordem original.
// Plano de origem: reconciliacao-historico-migrations.md (opção (b), recomendada; documento fora do repositório).
//
// Uso:
//   node scripts/reconciliacao-rename-plan.mjs                       # relatório (texto)
//   node scripts/reconciliacao-rename-plan.mjs --json                # relatório (JSON)
//   node scripts/reconciliacao-rename-plan.mjs --commands            # só os comandos git mv (os já aplicados saem comentados)
//   node scripts/reconciliacao-rename-plan.mjs --check              # exit 1 se restar referência ao nome/versão antiga FORA dos arquivos de plano/histórico
//   node scripts/reconciliacao-rename-plan.mjs --replay-realpg      # replay das duas ordens em PG real 127.0.0.1:55434 (bancos acc_ren_*, apagados ao final)
//
// Idempotente: se um renomeio já foi feito (arquivo com a versão remota existe e o antigo não), é reportado como DONE e
// as referências já atualizadas não reaparecem. Somente leitura no repositório; o --replay-realpg só cria/apaga bancos acc_ren_*.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migDir = path.join(root, "supabase", "migrations");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);

// versão LOCAL (antiga) -> versão REMOTA (registrada pelo conector no banco operacional); nome idêntico.
export const RENAMES = [
  { name: "axia_chat_budget", from: "20261105150000", to: "20261105173838" },
  { name: "sla_configuration_audit_system_actor", from: "20261106090000", to: "20261106195625" },
  { name: "ssma_esg_acoes_perfis_notificacoes", from: "20261106100000", to: "20261111042824" },
  { name: "ssma_esg_evidence_reference", from: "20261106110000", to: "20261111043023" },
  { name: "esg_ssma_reference_consistency_guard", from: "20261106115000", to: "20261111043226" },
  { name: "copy_project_team", from: "20261111120000", to: "20261111121457" },
  { name: "scheduler_pg_cron_dispatch", from: "20261118093000", to: "20261119034721" },
];
const file = (version, name) => `${version}_${name}.sql`;

// Arquivos que DOCUMENTAM o histórico (citam as versões antigas de propósito) — fora do --check.
const HISTORICAL = new Set([
  "docs/migrations-conciliacao-historico-remoto.md",
  "docs/lote2-permissoes-sla-acompanhamento.md",
  "scripts/reconciliacao-rename-plan.mjs",
]);

const tracked = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
const textExt = /\.(mjs|cjs|js|ts|tsx|json|md|sql|yml|yaml|txt|ps1|sh)$/i;

function status() {
  return RENAMES.map((r) => {
    const oldFile = file(r.from, r.name);
    const newFile = file(r.to, r.name);
    const oldExists = existsSync(path.join(migDir, oldFile));
    const newExists = existsSync(path.join(migDir, newFile));
    const state = newExists && !oldExists ? "DONE" : oldExists && !newExists ? "PENDING" : newExists && oldExists ? "CONFLICT" : "MISSING";
    return { ...r, oldFile, newFile, state };
  });
}

function references() {
  const out = [];
  for (const rel of tracked) {
    if (!textExt.test(rel)) continue;
    const abs = path.join(root, rel);
    let text;
    try { text = readFileSync(abs, "utf8"); } catch { continue; }
    if (text.length > 6 * 1024 * 1024) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const r of RENAMES) {
        // nome do arquivo antigo OU versão antiga como token numérico isolado
        if (line.includes(file(r.from, r.name)) || new RegExp(`(?<![0-9])${r.from}(?![0-9])`).test(line)) {
          out.push({ file: rel, line: i + 1, from: r.from, to: r.to, name: r.name, kind: line.includes(file(r.from, r.name)) ? "FILENAME" : "VERSION", historical: HISTORICAL.has(rel) || (rel.startsWith("supabase/migrations/") && (rel.includes(r.from) || RENAMES.some((x) => rel.includes(x.to)))), text: line.trim().slice(0, 160) });
        }
      }
    });
  }
  return out;
}

const st = status();
const refs = references();
// o próprio arquivo a renomear não conta como referência (o nome do arquivo muda, o conteúdo pode citar a versão no cabeçalho)
const refsToUpdate = refs.filter((r) => !r.historical);
const byFile = new Map();
for (const r of refsToUpdate) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);

if (has("commands")) {
  for (const s of st) {
    const cmd = `git mv supabase/migrations/${s.oldFile} supabase/migrations/${s.newFile}`;
    console.log(s.state === "PENDING" ? cmd : `# ${s.state}: ${cmd}`);
  }
  process.exit(0);
}

if (has("json")) {
  console.log(JSON.stringify({ renames: st, filesToUpdate: [...byFile.keys()].sort(), references: refsToUpdate }, null, 2));
} else if (!has("replay-realpg")) {
  console.log("== Renomeios (versão local -> versão remota) ==");
  for (const s of st) console.log(`[${s.state}] git mv supabase/migrations/${s.oldFile} supabase/migrations/${s.newFile}`);
  console.log(`\n== Referências a atualizar (${refsToUpdate.length} em ${byFile.size} arquivo(s)) ==`);
  for (const [f, list] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n${f}`);
    for (const r of list) console.log(`  L${r.line} [${r.kind}] ${r.from} -> ${r.to}  ${r.text}`);
  }
  console.log("\nSubstituição sugerida (por arquivo acima; nome completo primeiro, depois a versão isolada):");
  for (const r of RENAMES) console.log(`  ${file(r.from, r.name)} -> ${file(r.to, r.name)}   |   ${r.from} -> ${r.to}`);
  console.log("\nApós renomear e atualizar: `node scripts/reconciliacao-rename-plan.mjs --check` deve sair com 0 e `npm run test:sql` deve passar.");
}

if (has("check")) {
  const pending = refsToUpdate.length + st.filter((s) => s.state === "PENDING").length;
  console.log(pending === 0 ? "CHECK OK: nenhuma referência/renomeio pendente." : `CHECK: ${st.filter((s) => s.state === "PENDING").length} renomeio(s) e ${refsToUpdate.length} referência(s) pendente(s).`);
  process.exit(pending === 0 ? 0 : 1);
}

// ------------------------------------------------------------------------------------------------------------------
// Validação em PostgreSQL REAL: replay na ordem ORIGINAL × RENOMEADA => mesmo schema e nenhuma falha.
// ------------------------------------------------------------------------------------------------------------------
if (has("replay-realpg")) {
  const die = (m) => { console.error(`RECUSADO/ERRO: ${m}`); process.exit(2); };
  const raw = process.env.ACC_REALPG_URL;
  if (!raw) die("defina ACC_REALPG_URL/ACC_REALPG_PKG_DIR (postgres17-local-setup.ps1 -Authorized ...)");
  const U0 = new URL(raw);
  if (U0.hostname !== "127.0.0.1" || U0.port !== "55434" || U0.search) die("só aceito 127.0.0.1:55434 sem query string");
  const pgLib = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR, "x.js"))("pg");
  const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1].replace(/^create role .*$/gm, "");
  const names = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  // ordem original: nomes atuais; ordem renomeada: troca a versão dos 7 (se já renomeados, as duas ordens coincidem)
  const renamedOf = (f) => {
    const hit = RENAMES.find((r) => f === file(r.from, r.name));
    return hit ? file(hit.to, hit.name) : f;
  };
  const orderA = names;
  const orderB = names.map((f) => ({ f, key: renamedOf(f) })).sort((a, b) => a.key.localeCompare(b.key)).map((x) => x.f);
  const clean = (s) => s.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const admin = new pgLib.Client({ connectionString: U0.toString() });
  await admin.connect();
  const created = [];
  try {
    for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
      await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
    }
    const foreign = (await admin.query("select datname from pg_database where datname not in ('postgres','template0','template1') and datname not like 'acc\\_%'")).rows;
    if (foreign.length) die(`bancos alheios no cluster: ${foreign.map((r) => r.datname)}`);
    async function replay(tag, order) {
      const name = `acc_ren_${tag}_${Date.now().toString(36)}`;
      await admin.query(`create database ${name} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
      created.push(name);
      const u = new URL(U0.toString()); u.pathname = `/${name}`;
      const c = new pgLib.Client({ connectionString: u.toString() });
      await c.connect();
      await c.query("set statement_timeout = '120s'");
      await c.query(platform);
      const falhas = [];
      for (const f of order) {
        try { await c.query(clean(readFileSync(path.join(migDir, f), "utf8"))); } catch (e) { falhas.push(`${f}: ${String(e.message).split("\n")[0]}`); }
      }
      const L = [];
      const add = (k, rows) => rows.forEach((r) => L.push(`${k}|${r.r}`));
      const rows = async (sql) => (await c.query(sql)).rows;
      add("T", await rows("select relname||'|'||relkind::text||'|'||relrowsecurity r from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m','S')"));
      add("C", await rows("select table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') r from information_schema.columns where table_schema='public'"));
      add("K", await rows("select k.relname||'|'||o.conname||'|'||pg_get_constraintdef(o.oid) r from pg_constraint o join pg_class k on k.oid=o.conrelid where o.connamespace='public'::regnamespace"));
      add("I", await rows("select indexdef r from pg_indexes where schemaname='public'"));
      add("F", await rows("select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(pg_get_functiondef(p.oid))||'|'||p.prosecdef||'|anon='||has_function_privilege('anon',p.oid,'execute')||'|auth='||has_function_privilege('authenticated',p.oid,'execute')||'|svc='||has_function_privilege('service_role',p.oid,'execute') r from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')"));
      add("G", await rows("select pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text r from pg_trigger t join pg_class k on k.oid=t.tgrelid where not t.tgisinternal and k.relnamespace='public'::regnamespace"));
      add("P", await rows("select tablename||'|'||policyname||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') r from pg_policies where schemaname='public'"));
      add("V", await rows("select c.relname||'|'||md5(pg_get_viewdef(c.oid)) r from pg_class c where relnamespace='public'::regnamespace and relkind='v'"));
      add("R", await rows("select table_name||'|'||grantee||'|'||privilege_type r from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')"));
      await c.end();
      return { falhas, lines: L.sort() };
    }
    console.log(`== replay ORIGINAL (${orderA.length} arquivos)`);
    const A = await replay("a", orderA);
    console.log(`   falhas: ${A.falhas.length}  linhas de schema: ${A.lines.length}`);
    console.log(`== replay RENOMEADO (${orderB.length} arquivos)`);
    const B = await replay("b", orderB);
    console.log(`   falhas: ${B.falhas.length}  linhas de schema: ${B.lines.length}`);
    const onlyA = A.lines.filter((x) => !new Set(B.lines).has(x));
    const onlyB = B.lines.filter((x) => !new Set(A.lines).has(x));
    const moved = orderA.map((f, i) => (orderB[i] !== f ? f : null)).filter(Boolean).length;
    console.log(`   posições que mudam de ordem: ${moved}`);
    console.log(`== diff de schema original × renomeado: só-original=${onlyA.length} só-renomeado=${onlyB.length}`);
    for (const f of [...A.falhas, ...B.falhas]) console.log(`   FALHA ${f}`);
    const ok = A.falhas.length === 0 && B.falhas.length === 0 && onlyA.length === 0 && onlyB.length === 0;
    console.log(ok ? "RESULTADO: OK — replay na ordem renomeada = mesmo schema, 0 falhas." : "RESULTADO: DIVERGENTE");
    process.exitCode = ok ? 0 : 1;
  } finally {
    for (const n of created) await admin.query(`drop database if exists ${n} with (force)`).catch(() => {});
    await admin.end();
  }
}
