// FASE 2 / Frente B - CONGELAMENTO INTEGRAL DE ESCRITA (docs/implantacao/16-congelamento-integral.md; scripts em docs/implantacao/congelamento/).
// PARTE 1 (estatica, SEMPRE roda, inclusive no CI): varre apps/web e confirma o inventario dos caminhos de escrita do NAVEGADOR
//   (arquivos que importam @axion/db/browser) contra o documentado, e confere o texto do erro do congelamento com a fila offline do SSMA.
// PARTE 2 (PostgreSQL REAL e DESCARTAVEL, 127.0.0.1:55434; base propria acc_cong_*, apagada no fim; dados 100% SINTETICOS; sem ACC_REALPG_URL e PULADA):
//   replay das migrations -> foto -> aplicar -> escrita direta recusada em TODAS as tabelas e no Storage (authenticated e anon), leitura continua,
//   service_role/dono mantem escrita -> RPC SECURITY DEFINER de resposta de alerta (record_risk_alert_action) recusada a authenticated e
//   funcional para service_role -> aplicar 2x idempotente -> reverter = identidade de ACL/politicas/gatilhos -> pg_cron pausar/retomar.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-congelamento-realpg.mjs
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const web = path.join(repo, "apps", "web");
const readTxt = (p) => readFileSync(p, "utf8").replace(/^﻿/, "");
const sqlDir = path.join(repo, "docs", "implantacao", "congelamento");
const sql = (f) => readTxt(path.join(sqlDir, f));

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 900)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

// =====================================================================================================================
// PARTE 1 - INVENTARIO ESTATICO DO NAVEGADOR
// =====================================================================================================================
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(web, p).split(path.sep).join("/");
const RPC_SOMENTE_LEITURA = new Set(["find_document_by_sha256", "ssma_notification_summary"]);

// Inventario DOCUMENTADO: arquivo -> { rpcs de escrita, storage (upload/remove), tabelas (insert) }. "tipo": ESCRITA | AUTH | LEITURA.
const DOC = {
  "components/documents/contract-attachments/use-contract-attachments.ts": { tipo: "ESCRITA", rpcs: ["delete_contract_attachment", "register_document_version_file"], storage: true, tabelas: [] },
  "components/documents/document-upload-form.tsx": { tipo: "ESCRITA", rpcs: ["register_project_document_upload"], storage: true, tabelas: [] },
  "components/documents/multi-upload/use-document-upload-queue.ts": { tipo: "ESCRITA", rpcs: ["register_project_document_upload"], storage: true, tabelas: [] },
  "components/documents/permanent-delete-document-control.tsx": { tipo: "ESCRITA", rpcs: ["delete_project_document"], storage: true, tabelas: [] },
  "components/esg/esg-submission-form.tsx": { tipo: "ESCRITA", rpcs: [], storage: true, tabelas: ["esg_obligation_evidence"] },
  "components/legal/use-precontract-upload.ts": { tipo: "ESCRITA", rpcs: ["register_project_document_upload"], storage: true, tabelas: [] },
  "components/ssma/field-records/esg-evidence-link.tsx": { tipo: "ESCRITA", rpcs: ["esg_link_ssma_record", "esg_unlink_ssma_record"], storage: false, tabelas: [] },
  "components/ssma/field-records/record-detail.tsx": { tipo: "ESCRITA", rpcs: ["ssma_corrective_action_forward", "ssma_corrective_action_update"], storage: false, tabelas: [], via: "uploadActionEvidencePhoto" },
  "components/ssma/ssma-field-app.tsx": { tipo: "ESCRITA", rpcs: ["create_ssma_accident_submission", "create_ssma_form_submission", "finalize_ssma_form_submission", "register_ssma_submission_photo"], storage: true, tabelas: [] },
  "lib/ssma/field-records/use-field-queue.ts": { tipo: "ESCRITA", rpcs: [], storage: false, tabelas: [], via: "createSupabaseTransport" },
  // nao gravam no banco/Storage:
  "app/login/google-signin-button.tsx": { tipo: "AUTH", rpcs: [], storage: false, tabelas: [] },
  "components/documents/contract-attachments/contract-attachments-panel.tsx": { tipo: "LEITURA", rpcs: [], storage: false, tabelas: [] },
  "components/documents/document-download-button.tsx": { tipo: "LEITURA", rpcs: [], storage: false, tabelas: [] },
  "components/ssma/field-records/field-records-app.tsx": { tipo: "LEITURA", rpcs: [], storage: false, tabelas: [] },
  "lib/timeline-export/resolve-evidence-files.ts": { tipo: "LEITURA", rpcs: [], storage: false, tabelas: [] },
};
// Codigo de transporte da fila offline do SSMA (escreve em nome de use-field-queue.ts e record-detail.tsx)
const TRANSPORTE = "lib/ssma/field-records/supabase-transport.ts";
const TRANSPORTE_RPCS = ["ssma_field_record_register_photo", "ssma_field_record_submit"];

const arquivos = walk(web);
const importadores = arquivos.filter((f) => /@axion\/db\/browser/.test(readTxt(f))).map(rel).sort();

await check("E1) importadores do cliente Supabase do NAVEGADOR (@axion/db/browser) em apps/web = os 15 documentados", async () => {
  eq(importadores, Object.keys(DOC).sort(), "importadores");
});
await check("E2) por arquivo: RPCs de escrita, upload/remove no Storage e insert em tabela batem com o documentado", async () => {
  const dif = [];
  for (const f of Object.keys(DOC)) {
    const t = readTxt(path.join(web, f));
    const rpcs = [...new Set([...t.matchAll(/\brpc\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]))].filter((n) => !RPC_SOMENTE_LEITURA.has(n)).sort();
    const storage = /\.(upload|remove)\(/.test(t);
    const tabelas = [...new Set([...t.matchAll(/\.from\(\s*"([a-z0-9_]+)"\s*\)\s*\.(?:insert|upsert|update|delete)\(/g)].map((m) => m[1]))].sort();
    const d = DOC[f];
    if (JSON.stringify(rpcs) !== JSON.stringify(d.rpcs)) dif.push(`${f}: rpcs ${JSON.stringify(rpcs)} != ${JSON.stringify(d.rpcs)}`);
    if (storage !== d.storage) dif.push(`${f}: storage ${storage} != ${d.storage}`);
    if (JSON.stringify(tabelas) !== JSON.stringify(d.tabelas)) dif.push(`${f}: tabelas ${JSON.stringify(tabelas)} != ${JSON.stringify(d.tabelas)}`);
    if (d.via && !t.includes(d.via)) dif.push(`${f}: nao usa ${d.via}`);
  }
  eq(dif, [], "divergencias");
});
await check("E3) escrevem de verdade (ESCRITA) = 10 arquivos (9 componentes + a fila offline do SSMA); AUTH = 1; LEITURA = 4", async () => {
  const c = (t) => Object.values(DOC).filter((d) => d.tipo === t).length;
  eq([c("ESCRITA"), c("AUTH"), c("LEITURA")], [10, 1, 4], "contagem por tipo");
  // os nao-escritores realmente nao escrevem (nenhum upload/remove/insert/rpc nao-leitura) - ja garantido por E2 (rpcs/storage/tabelas vazios)
});
await check("E4) transporte da fila offline do SSMA (supabase-transport.ts): RPCs e upload no Storage documentados", async () => {
  const t = readTxt(path.join(web, TRANSPORTE));
  const rpcs = [...new Set([...t.matchAll(/\brpc\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]))].sort();
  eq(rpcs, TRANSPORTE_RPCS, "rpcs do transporte");
  ok(/storage\.from\("project-documents"\)\.upload\(/.test(t), "upload no bucket project-documents");
});
await check("E5) nenhum outro arquivo de apps/web cria cliente Supabase de navegador (@supabase/ssr / createBrowserClient fora de packages/db) nem usa chave de servico no cliente", async () => {
  const fora = [];
  for (const f of arquivos) {
    const t = readTxt(f);
    if (/createBrowserClient|from "@supabase\/ssr"/.test(t) && rel(f) !== "proxy.ts" && !/lib\/http\/same-origin\.ts$/.test(rel(f))) fora.push(rel(f));
    if (/^\s*["']use client["']/m.test(t) && /SUPABASE_SECRET_KEY|createSupabaseAdminClient|service_role/.test(t.replace(/\/\/.*$/gm, ""))) fora.push(`${rel(f)} (segredo/admin em componente client)`);
  }
  eq(fora, [], "usos fora do inventario");
});
await check("E6) acesso direto ao endpoint do Storage por URL (NEXT_PUBLIC_SUPABASE_URL) so em proxy.ts, chat-budget (servidor) e no upload pre-contrato (XHR)", async () => {
  const usos = arquivos.filter((f) => /NEXT_PUBLIC_SUPABASE_URL/.test(readTxt(f))).map(rel).sort();
  eq(usos, ["components/legal/use-precontract-upload.ts", "lib/assistant/chat-budget.ts", "proxy.ts"], "arquivos");
});
await check("E7) todas as RPCs do navegador (e do transporte) existem em supabase/migrations", async () => {
  const dir = path.join(repo, "supabase", "migrations");
  const mig = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readTxt(path.join(dir, f))).join("\n");
  const nomes = new Set([...Object.values(DOC).flatMap((d) => d.rpcs), ...TRANSPORTE_RPCS, ...RPC_SOMENTE_LEITURA]);
  const faltam = [...nomes].filter((n) => !new RegExp(`function\\s+public\\.${n}\\s*\\(`, "i").test(mig));
  eq(faltam, [], "RPCs sem definicao nas migrations");
});
await check("E8) texto do erro do congelamento nao contem codigo permanente nem mensagem mapeada da fila offline do SSMA (item fica na fila e e reenviado)", async () => {
  const msg = sql("1-aplicar-congelamento.sql").match(/raise exception '([^']+)'/)[1];
  ok(/ACC_JANELA_CONGELAMENTO/.test(msg), "mensagem do guard");
  const types = readTxt(path.join(web, "lib", "ssma", "field-records", "types.ts"));
  const perm = [...types.match(/PERMANENT_ERROR_CODES[^=]*=\s*\[([\s\S]*?)\]/)[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
  const mapeadas = [...types.match(/SERVER_ERROR_MESSAGES[^=]*=\s*\{([\s\S]*?)\n\}/)[1].matchAll(/^\s*([A-Z_]{5,})\s*:/gm)].map((m) => m[1]);
  ok(perm.length >= 5, "codigos permanentes lidos");
  const tokens = [...msg.matchAll(/[A-Z][A-Z_]{4,}/g)].map((m) => m[0]);
  eq(tokens.filter((t) => perm.includes(t) || mapeadas.includes(t)), [], "tokens conflitantes");
});

// =====================================================================================================================
// PARTE 2 - POSTGRESQL REAL LOCAL
// =====================================================================================================================
const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO (parte 2): defina ACC_REALPG_URL (PostgreSQL real local) e ACC_REALPG_PKG_DIR. A parte estatica rodou.");
  console.log(`\n${passed} OK, ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
}
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") {
  console.error("RECUSADO: so aceito 127.0.0.1:55434 (PostgreSQL local descartavel).");
  process.exit(2);
}
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const migDir = path.join(repo, "supabase", "migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const GOTRUE = `
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
-- Plataforma Supabase: a API de Storage e o pg_cron. Stubs minimos para o teste (o pg_cron real so existe no Supabase).
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, active boolean not null default true);
create table cron.job_run_details (runid bigserial primary key, status text);
create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null)
  returns void language plpgsql as $$ begin update cron.job set active = coalesce(alter_job.active, job.active) where jobid = job_id; end $$;`;
const platform = PLATFORM.replace(/^create role .*$/gm, "").replace(/^create function auth\.(uid|role|jwt)\(\).*$/gm, "-- stub removido") + "\n" + GOTRUE;

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_cong_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
const open = [];
try {
  await su.query(platform);
  for (const f of files) {
    try { await su.query(readTxt(path.join(migDir, f))); } catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas - base ${dbName}`);
  await su.query("insert into cron.job (jobname, active) select 'acc-job-' || g, g <> 11 from generate_series(1, 11) g"); // 10 ativos + 1 ja inativo (estado original tem de voltar identico)

  const uid = (n) => `00000000-0000-4000-8000-${String(9300 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000093a0";
  for (const n of [1, 2]) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `cong-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `Cong ${n}`, `cong-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra Congelamento','CNG','C','L','2026-01-01','2027-01-01')", [PA]);
  await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE'),($1,$3,'ADMINISTRADOR','ACTIVE')", [PA, uid(1), uid(2)]);

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    await c.query("begin");
    return c;
  }
  /** Executa uma instrucao sob savepoint; devolve { st: 'OK' | sqlstate, msg } (uma recusa nao aborta a sessao). */
  async function tente(c, text, params = []) {
    await c.query("savepoint s");
    try { const r = await c.query(text, params); await c.query("release savepoint s"); return { st: "OK", rows: r.rows }; }
    catch (e) { await c.query("rollback to savepoint s"); return { st: e.code ?? "ERR", msg: e.message }; }
  }
  const um = async (text) => (await su.query(text)).rows[0];

  // ----- foto: relacoes (ACL por tabela e por coluna), funcoes, politicas, gatilhos, tabelas
  const foto = async () => ({
    rel: (await su.query(
      `select c.relname, c.relkind::text k,
              (select string_agg(a.grantor::regrole::text || '>' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') || ':' || a.privilege_type || ':' || a.is_grantable, ',' order by a.grantee::regrole::text, a.privilege_type, a.grantor::regrole::text)
                 from aclexplode(c.relacl) a) as acl,
              (select string_agg(t.attname || '=' || a.grantor::regrole::text || '>' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') || ':' || a.privilege_type || ':' || a.is_grantable, ',' order by t.attname, a.grantee::regrole::text, a.privilege_type)
                 from pg_attribute t, aclexplode(t.attacl) a where t.attrelid = c.oid and t.attacl is not null) as colacl
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','f','S') order by 1`)).rows,
    fn: (await su.query(
      `select p.oid::regprocedure::text fn, (select string_agg(a.grantor::regrole::text || '>' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') || ':' || a.privilege_type, ',' order by a.grantee::regrole::text, a.privilege_type)
                 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a) acl
         from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows,
    pol: (await su.query("select schemaname, tablename, policyname, permissive, cmd, roles::text from pg_policies where schemaname in ('public','storage') order by 1,2,3")).rows,
    trg: (await su.query("select tgrelid::regclass::text t, tgname from pg_trigger where not tgisinternal order by 1,2")).rows,
    tabelas: (await su.query("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p') order by 1")).rows.map((r) => r.relname),
  });
  const cron = async () => (await su.query("select jobid, jobname, active from cron.job order by jobid")).rows;
  const auditCount = async (action) => Number((await su.query("select count(*) n from public.audit_log_entries where action = $1", [action])).rows[0].n);

  const APLICAR = sql("1-aplicar-congelamento.sql");
  const REVERTER = sql("2-reverter-congelamento.sql");
  const VERIFICAR = sql("3-verificar-congelamento.sql");
  const ST_CONG = sql("4-storage-congelar.sql");
  const ST_DESC = sql("5-storage-descongelar.sql");
  const CR_PAUSAR = sql("6-pg-cron-pausar.sql");
  const CR_RETOMAR = sql("7-pg-cron-retomar.sql");
  const lastSelect = (res) => (Array.isArray(res) ? res : [res]).filter((r) => r.command === "SELECT");

  const base = await foto();
  const baseCron = await cron();
  const NEGOCIO = base.tabelas; // todas as tabelas base de public existentes antes da janela
  console.log(`     tabelas base em public: ${NEGOCIO.length}; relacoes (tabelas/views/sequencias): ${base.rel.length}; funcoes: ${base.fn.length}`);

  // ---------------------------------------------------------------- fixtures: alerta de risco + objeto no Storage
  const CASE = "20000000-0000-4000-8000-0000000093c0";
  await su.query(
    `insert into public.risk_alert_cases (id, project_id, source_type, source_id, area, risk_level, title, fingerprint, current_responsible_user_id)
     values ($1, $2, 'EMAIL', $3, 'ENGENHARIA', 'MEDIUM', 'Alerta sintetico', 'fp-cong-1', $4)`, [CASE, PA, CASE, uid(1)]);
  const transicao = (n) => ({
    actionType: "OTHER",
    summary: "ciente",
    events: [{ actionType: "OTHER", fromState: "OPEN", toState: "ACKNOWLEDGED", text: "ciente na janela", idempotencyKey: `${CASE}:cong-${n}` }],
    caseUpdate: { state: "ACKNOWLEDGED" },
  });
  const chamaAlerta = (c, n, estado = "OPEN") => tente(c, "select public.record_risk_alert_action($1::uuid, $2, $3::jsonb)", [CASE, estado, JSON.stringify(transicao(n))]);
  const resetaAlerta = async () => {
    await su.query("delete from public.risk_alert_action_events where case_id = $1", [CASE]);
    await su.query("update public.risk_alert_cases set state = 'OPEN' where id = $1", [CASE]);
  };

  await check("B0) pre-condicao: sem congelamento, authenticated TEM privilegio de escrita em varias tabelas (o teste mede uma mudanca real) e as 3 relacoes de sequencia/views gravaveis existem", async () => {
    const r = await um(`select count(*)::int n from pg_class c where relnamespace = 'public'::regnamespace and relkind in ('r','p','v')
      and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE'))`);
    ok(r.n > 50, `tabelas com escrita para authenticated antes: ${r.n}`);
    console.log(`     antes: ${r.n} tabelas/views com INSERT/UPDATE/DELETE para authenticated; anon: ${(await um(`select count(*)::int n from pg_class c where relnamespace='public'::regnamespace and relkind in ('r','p','v') and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))`)).n}`);
    ok(base.rel.some((r) => r.colacl), "esperava ao menos 1 ACL por coluna (cenario real das migrations)");
  });
  await check("B1) sem congelamento, o caminho de resposta de alerta (record_risk_alert_action) FUNCIONA para authenticated (linha de base)", async () => {
    const c = await as(1);
    const r = await chamaAlerta(c, 1);
    ok(r.st === "OK", `esperava sucesso antes do congelamento; obteve ${r.st}: ${r.msg}`);
    const n = Number((await c.query("select count(*) n from public.risk_alert_action_events where case_id = $1", [CASE])).rows[0].n);
    eq(n, 1, "evento gravado");
    await c.query("rollback"); // desfaz (o teste repete a chamada em outros estados)
    await resetaAlerta();
  });
  await check("B2) sem congelamento, authenticated (EDITOR) grava no Storage (linha de base)", async () => {
    const c = await as(1);
    const r = await tente(c, "insert into storage.objects (bucket_id, name, owner) values ('project-documents', $1, $2)", [`${PA}/base.txt`, uid(1)]);
    ok(r.st === "OK", `insert antes do congelamento: ${r.st} ${r.msg}`);
    await c.query("rollback");
  });

  // ---------------------------------------------------------------- aplicar
  await check("C1) aplicar: Conferencia 1 = 0 tabelas sem guarda; Conferencia 2 = 0 tabelas/views com escrita; 1 auditoria por obra", async () => {
    const res = lastSelect(await su.query(APLICAR));
    eq(res.length, 2, "2 conferencias");
    eq([Number(res[0].rows[0].tabelas_base), Number(res[0].rows[0].tabelas_sem_guarda_esperado_0)], [NEGOCIO.length, 0], "conferencia 1");
    eq(Number(res[1].rows[0].com_escrita_esperado_0), 0, "conferencia 2");
    eq(await auditCount("WRITE_FREEZE_APPLIED"), 1, "auditoria (1 obra)");
    console.log(`     guarda em ${res[0].rows[0].tabelas_base} tabelas`);
  });
  await check("C2) ESCRITA DIRETA RECUSADA (42501) em TODAS as tabelas de public (INSERT, UPDATE, DELETE, TRUNCATE) para authenticated (membro ADMINISTRADOR) e anon", async () => {
    const colunas = new Map((await su.query("select c.relname, (array_agg(a.attname order by a.attnum))[1] col from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attidentity = '' and a.attgenerated = '' where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') group by 1")).rows.map((r) => [r.relname, r.col]));
    const falhas = [];
    let total = 0;
    for (const [papel, n] of [["authenticated", 1], ["anon", null]]) {
      const c = await as(n, papel);
      for (const t of NEGOCIO) {
        const col = colunas.get(t);
        for (const [op, text] of [["INSERT", `insert into public."${t}" default values`], ["UPDATE", `update public."${t}" set "${col}" = "${col}" where false`], ["DELETE", `delete from public."${t}" where false`], ["TRUNCATE", `truncate public."${t}"`]]) {
          total += 1;
          const r = await tente(c, text);
          if (r.st !== "42501") falhas.push(`${papel}:${t}:${op}=${r.st}`);
        }
      }
      await c.query("rollback");
    }
    eq(falhas.slice(0, 15), [], `chamadas nao recusadas com 42501 (de ${total})`);
    console.log(`     ${total} tentativas de escrita direta recusadas (42501) = ${NEGOCIO.length} tabelas x 4 operacoes x 2 perfis`);
  });
  await check("C3) o GATILHO-GUARDA recusa sozinho (sem depender de GRANT): com GRANT de escrita devolvido por engano, a gravacao ainda e recusada com a mensagem do congelamento", async () => {
    await su.query("grant insert on public.projects to authenticated"); // simula grant "vazado" por migration futura
    const c = await as(1);
    const r = await tente(c, "insert into public.projects (name,code,client,location,start_date,baseline_end_date) values ('x','x','c','l','2026-01-01','2027-01-01')");
    await c.query("rollback");
    await su.query("revoke insert on public.projects from authenticated");
    eq(r.st, "42501", "sqlstate");
    ok(/ACC_JANELA_CONGELAMENTO/.test(r.msg), `mensagem: ${r.msg}`);
    // claim de JWT 'authenticated' em sessao com papel de dono (definer) tambem e recusada
    const d = await as(1);
    await d.query("reset role");
    const r2 = await tente(d, "insert into public.projects (name,code,client,location,start_date,baseline_end_date) values ('x','x','c','l','2026-01-01','2027-01-01')");
    await d.query("rollback");
    eq(r2.st, "42501", "claim authenticated com papel postgres (caminho SECURITY DEFINER)");
  });
  await check("C4) RPC SECURITY DEFINER de resposta de alerta (record_risk_alert_action) e RECUSADA a authenticated durante a janela (42501, nada gravado, caso intacto) - decisao correta: o link/token NAO e consumido e vale apos a janela", async () => {
    const c = await as(1);
    const r = await chamaAlerta(c, 2);
    await c.query("rollback");
    eq(r.st, "42501", `sqlstate (${r.msg})`);
    ok(/ACC_JANELA_CONGELAMENTO/.test(r.msg), `mensagem: ${r.msg}`);
    const x = await um(`select (select count(*)::int from public.risk_alert_action_events where case_id = '${CASE}') ev, (select state from public.risk_alert_cases where id = '${CASE}') st`);
    eq([x.ev, x.st], [0, "OPEN"], "nenhum efeito parcial");
    // idem a RPC de confirmacao por token de e-mail (usa a sessao do usuario): recusada por guarda/privilegio, nunca grava
    const c2 = await as(1);
    const r2 = await tente(c2, "select * from public.confirm_email_alert_action($1, null, null)", ["0".repeat(64)]);
    await c2.query("rollback");
    ok(r2.st !== "OK", "confirm_email_alert_action nao deve gravar durante a janela");
  });
  await check("C5) service_role MANTEM o caminho do servidor: a mesma resposta de alerta pelo worker (service_role com actorUserId) FUNCIONA durante a janela; escrita direta de service_role e do dono (SQL direto) tambem", async () => {
    const svc = await as(null, "service_role");
    const w = await tente(svc, "select public.record_risk_alert_action($1::uuid, 'OPEN', $2::jsonb)", [CASE, JSON.stringify({ ...transicao(3), actorUserId: uid(1) })]);
    ok(w.st === "OK", `worker service_role: ${w.st} ${w.msg}`);
    const ins = await tente(svc, "insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail) values ($1,'SYSTEM','TESTE_SERVICE','X','x','x')", [PA]);
    ok(ins.st === "OK", `insert direto service_role: ${ins.st} ${ins.msg}`);
    await svc.query("rollback");
    await resetaAlerta();
    await su.query("insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail) values ($1,'SYSTEM','TESTE_DONO','X','x','x')", [PA]); // SQL direto (dono): nao pode falhar
  });
  await check("C6) LEITURA continua: authenticated mantem SELECT em todas as tabelas/views em que tinha (ACL de SELECT identica) e le de verdade (membro)", async () => {
    const selAntes = base.rel.filter((r) => /authenticated:SELECT/.test(r.acl ?? "")).map((r) => r.relname);
    const selDepois = (await foto()).rel.filter((r) => /authenticated:SELECT/.test(r.acl ?? "")).map((r) => r.relname);
    eq(selDepois, selAntes, "tabelas com SELECT");
    ok(selDepois.length > 100, `tabelas legiveis: ${selDepois.length}`);
    const c = await as(1);
    const falhas = [];
    for (const t of ["projects", "project_memberships", "profiles", "risk_alert_cases", "audit_log_entries", "documents"]) {
      const r = await tente(c, `select count(*) from public."${t}"`);
      if (r.st !== "OK") falhas.push(`${t}=${r.st}`);
    }
    await c.query("rollback");
    eq(falhas, [], "leituras recusadas");
    const rpcLeitura = await as(1);
    const f = await tente(rpcLeitura, "select public.is_project_member($1::uuid)", [PA]);
    await rpcLeitura.query("rollback");
    ok(f.st === "OK" && f.rows[0].is_project_member === true, "funcao de leitura/RLS (is_project_member) continua funcionando");
  });
  await check("C7) Storage (4-storage-congelar.sql): authenticated e anon NAO inserem, alteram nem apagam objetos; leitura e service_role continuam", async () => {
    await su.query("insert into storage.objects (bucket_id, name, owner) values ('project-documents', $1, $2)", [`${PA}/existente.txt`, uid(1)]);
    // antes de congelar o Storage: o upload legitimo do EDITOR passa (provado em B2); aplica as politicas restritivas
    const res = lastSelect(await su.query(ST_CONG));
    eq(Number(res[0].rows[0].politicas_de_congelamento_esperado_3), 3, "3 politicas");
    const falhas = [];
    for (const [papel, n] of [["authenticated", 1], ["anon", null]]) {
      const c = await as(n, papel);
      const i = await tente(c, "insert into storage.objects (bucket_id, name, owner) values ('project-documents', $1, $2)", [`${PA}/novo.txt`, uid(1)]);
      const u = await tente(c, "update storage.objects set name = name || 'x' where name = $1 returning 1", [`${PA}/existente.txt`]);
      const d = await tente(c, "delete from storage.objects where name = $1 returning 1", [`${PA}/existente.txt`]);
      if (i.st !== "42501") falhas.push(`${papel}:insert=${i.st}`);
      // UPDATE/DELETE restritivos: RLS filtra a linha (0 linhas afetadas) ou recusa; em ambos nada muda
      if (!(d.st === "42501" || (d.st === "OK" && d.rows.length === 0))) falhas.push(`${papel}:delete=${d.st}/${d.rows?.length}`);
      if (!(u.st === "42501" || (u.st === "OK" && u.rows.length === 0))) falhas.push(`${papel}:update=${u.st}/${u.rows?.length}`);
      await c.query("rollback");
    }
    eq(falhas, [], "operacoes de Storage nao recusadas");
    const intacto = await um(`select count(*)::int n from storage.objects where name = '${PA}/existente.txt'`);
    eq(intacto.n, 1, "objeto original preservado");
    const lei = await as(1);
    const l = await tente(lei, "select count(*)::int n from storage.objects where bucket_id = 'project-documents'");
    await lei.query("rollback");
    ok(l.st === "OK", `leitura do Storage: ${l.st}`);
    const svc = await as(null, "service_role");
    const s = await tente(svc, "insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [`${PA}/servico.txt`]);
    await svc.query("rollback");
    ok(s.st === "OK", `service_role no Storage: ${s.st} ${s.msg}`);
  });
  await check("C8) VERIFICAR (3-verificar-congelamento.sql) retorna o estado esperado durante a janela", async () => {
    const rows = (await su.query(VERIFICAR)).rows;
    const v = Object.fromEntries(rows.map((r) => [r.item, r.valor]));
    eq([Number(v.tabelas_com_gatilho_guarda), Number(v.tabelas_base_public)], [NEGOCIO.length, NEGOCIO.length], "gatilhos = tabelas");
    eq([v.tabelas_views_com_escrita_para_anon_authenticated, v.politicas_restritivas_storage_janela, v.privilegios_guardados_para_reversao], ["0", "3", "1"], "verificacao");
  });
  await check("C9) aplicar 2x e IDEMPOTENTE: mesmo estado (ACL, politicas, gatilhos, privilegios guardados), sem erro", async () => {
    const aposAplicar = await foto();
    const guardados = Number((await um("select count(*)::int n from public.acc_congelamento_estado")).n);
    await su.query(APLICAR);
    await su.query(ST_CONG);
    const f2 = await foto();
    const dif = (a, b, k) => JSON.stringify(a[k]) === JSON.stringify(b[k]) ? null : k;
    eq(["rel", "fn", "pol", "trg", "tabelas"].map((k) => dif(aposAplicar, f2, k)).filter(Boolean), [], "partes que mudaram na 2a aplicacao");
    eq(Number((await um("select count(*)::int n from public.acc_congelamento_estado")).n), guardados, "estado guardado nao duplica nem sobrescreve");
    ok(guardados > 100, `privilegios guardados: ${guardados}`);
  });

  // ---------------------------------------------------------------- reverter
  await check("R1) reverter: gatilhos = 0, estado removido, auditoria WRITE_FREEZE_REVERTED; Storage descongelado (0 politicas)", async () => {
    const res = lastSelect(await su.query(REVERTER));
    eq([Number(res[0].rows[0].gatilhos_restantes_esperado_0), res[0].rows[0].estado_guardado_esperado_false], [0, false], "conferencia");
    eq(await auditCount("WRITE_FREEZE_REVERTED"), 1, "auditoria");
    const d = lastSelect(await su.query(ST_DESC));
    eq(Number(d[0].rows[0].politicas_de_congelamento_esperado_0), 0, "politicas removidas");
  });
  await check("R2) IDENTIDADE: ACL de tabelas/views/sequencias (por tabela E por coluna), ACL das funcoes, politicas (public+storage), gatilhos e lista de tabelas = foto inicial", async () => {
    const f = await foto();
    const dif = [];
    f.rel.forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(base.rel[i])) dif.push(`${r.relname}: ${base.rel[i]?.acl} -> ${r.acl}`); });
    eq(f.rel.length, base.rel.length, "numero de relacoes");
    eq(dif.slice(0, 10), [], "relacoes com ACL diferente");
    eq(f.fn, base.fn, "ACL das funcoes");
    eq(f.pol, base.pol, "politicas");
    eq(f.trg, base.trg, "gatilhos");
    eq(f.tabelas, base.tabelas, "tabelas (a tabela de estado foi removida)");
  });
  await check("R3) apos reverter, o caminho volta: authenticated grava de novo (resposta de alerta e Storage) - nada ficou travado", async () => {
    const c = await as(1);
    const r = await chamaAlerta(c, 4);
    await c.query("rollback");
    ok(r.st === "OK", `resposta de alerta apos reverter: ${r.st} ${r.msg}`);
    const s = await as(1);
    const i = await tente(s, "insert into storage.objects (bucket_id, name, owner) values ('project-documents', $1, $2)", [`${PA}/apos.txt`, uid(1)]);
    await s.query("rollback");
    ok(i.st === "OK", `Storage apos descongelar: ${i.st} ${i.msg}`);
    await resetaAlerta();
  });
  await check("R4) reverter 2x e idempotente (sem estado: so garante remocao; nao falha, nao altera ACL)", async () => {
    const antes = await foto();
    await su.query(REVERTER);
    await su.query(ST_DESC);
    const f = await foto();
    eq(JSON.stringify(f.rel) === JSON.stringify(antes.rel) && JSON.stringify(f.fn) === JSON.stringify(antes.fn), true, "ACL alterada pela 2a reversao");
  });
  await check("R5) ciclo repetido (aplicar, reverter, aplicar, reverter) mantem a identidade; grants EXTRAS dados durante a janela (privilegio novo por migration) NAO somem na reversao", async () => {
    for (let i = 0; i < 2; i++) { await su.query(APLICAR); await su.query(REVERTER); }
    const f = await foto();
    eq(JSON.stringify(f.rel), JSON.stringify(base.rel), "ACL apos 2 ciclos");
    // restauracao de privilegio por coluna e com grant option (cenario mais dificil): o proprio replay ja tem ACL por coluna (B0); aqui, com grant option
    await su.query("grant update (name) on public.projects to anon with grant option");
    const b2 = await foto();
    await su.query(APLICAR);
    const aut = await um("select has_any_column_privilege('anon', 'public.projects'::regclass, 'UPDATE') x");
    eq(aut.x, false, "coluna revogada na janela");
    await su.query(REVERTER);
    eq(JSON.stringify((await foto()).rel), JSON.stringify(b2.rel), "ACL com coluna+grant option restaurada");
    await su.query("revoke update (name) on public.projects from anon");
    eq(JSON.stringify((await foto()).rel), JSON.stringify(base.rel), "estado final = foto inicial");
  });
  await check("R6) VERIFICAR apos reverter: 0 gatilhos, 0 politicas, sem estado", async () => {
    const v = Object.fromEntries((await su.query(VERIFICAR)).rows.map((r) => [r.item, r.valor]));
    eq([v.tabelas_com_gatilho_guarda, v.politicas_restritivas_storage_janela, v.privilegios_guardados_para_reversao], ["0", "0", "0"], "estado apos reverter");
  });

  // ---------------------------------------------------------------- pg_cron
  await check("P1) pg_cron: pausar (0 ativos) -> congelar -> reverter -> retomar restaura EXATAMENTE o estado original (10 ativos, 1 inativo); pausar 2x nao perde o estado", async () => {
    const r1 = lastSelect(await su.query(CR_PAUSAR)).slice(-2);
    eq([Number(r1[0].rows[0].jobs_pausados), Number(r1[1].rows[0].ativos_esperado_0)], [11, 0], "pausa");
    await su.query(CR_PAUSAR); // 2a vez: o estado guardado nao pode ser sobrescrito com "tudo inativo"
    await su.query(APLICAR);
    await su.query(REVERTER);
    await su.query(CR_RETOMAR);
    eq(await cron(), baseCron, "jobs apos retomar");
    eq(await um("select to_regclass('public.acc_janela_cron_estado') is not null x").then((r) => r.x), false, "tabela auxiliar removida");
    let msg = "";
    try { await su.query(CR_RETOMAR); } catch (e) { msg = e.message; }
    ok(/RETOMADA: sem estado/.test(msg), "retomar sem estado deve abortar (nunca ativar tudo as cegas)");
    eq(await cron(), baseCron, "jobs inalterados apos retomada abortada");
    const f = await foto();
    eq(JSON.stringify(f.rel) + JSON.stringify(f.tabelas), JSON.stringify(base.rel) + JSON.stringify(base.tabelas), "identidade apos o ciclo completo da janela");
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
