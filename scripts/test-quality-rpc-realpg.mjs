// FASE 3 / Frente D — RPCs TRANSACIONAIS de Qualidade e Garantias, INTEGRIDADE (impossibilidade de encerramento indevido) e VÍNCULOS
// ESTRUTURADOS alerta -> RNC/garantia/sinistro, em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base descartável
// (acc_f3d_*, apagada no fim; as 4 migrations da frente D reaplicadas 2x), identidade por claims JWT (request.jwt.claims + set role) e
// concorrência real (conexões independentes). Dados 100% SINTÉTICOS. NÃO roda no CI.
// Cobre CASO 1-9, 12-14, 31, 33-39 reexercitados por RPC e os casos novos 'CASO F3-D-NN'.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-quality-rpc-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grantCompetences } from "./lib/f4a-competences.mjs";

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
const MINE = files.filter((f) => /^2026112330\d{4}_/.test(f));
const read = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
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
const cache = new Map();
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 700)}`);
    failed += 1;
  } finally {
    cache.clear();
    while (open.length) await open.pop().end().catch(() => {});
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
async function rejects(promise, pattern, label) {
  try { await promise; } catch (e) { ok(pattern.test(e.message), `${label}: erro inesperado: ${e.message}`); return; }
  throw new Error(`${label}: esperava erro ${pattern}, mas a operação passou`);
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f3d_${Date.now().toString(36)}`;
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
    try { await su.query(read(f)); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  for (let i = 0; i < 2; i += 1) for (const f of MINE) await su.query(read(f)); // idempotência (2 reaplicações)
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 3/D reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(3300 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000033a0";
  const PB = "10000000-0000-4000-8000-0000000033b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, PENDENTE: 7, ADMINB: 8, GESTORB: 9 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `d3-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `D3 ${n}`, `d3-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','D3A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','D3B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await mem(PB, U.GESTORB, "GESTOR");
  await grantCompetences(su, PA, [uid(U.ADMIN), uid(U.GESTOR), uid(U.GERENTE)]); await grantCompetences(su, PB, [uid(U.ADMINB), uid(U.GESTORB)]);
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [PA, `d3-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);

  /** Conexão com a identidade (claims JWT + role). Memoizada por check; `fresh` força conexão nova (concorrência). */
  async function as(n, role = "authenticated", fresh = false) {
    const key = `${n}|${role}`;
    if (!fresh && cache.has(key)) return cache.get(key);
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    if (!fresh) cache.set(key, c);
    return c;
  }
  /** Superusuário FINGINDO ser um usuário (claims) — simula código de servidor/função futura que escreve direto na tabela. */
  async function suAs(n) {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? {} : { sub: uid(n), role: "authenticated" })]);
    return c;
  }
  const rpc = async (c, fn, ...args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r;
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const J = "Justificativa suficiente registrada pelo gestor.";
  let seq = 0;
  const uniq = () => `${Date.now().toString(36)}-${(seq += 1)}`;
  const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security/i;
  const RANK = { NONE: 0, READ: 1, REGISTER: 2, MANAGE: 3, ADMIN: 4 };
  const PROFILES = [
    ["LEITURA", U.LEITURA, "authenticated", "READ"], ["COLABORADOR", U.COLAB, "authenticated", "REGISTER"],
    ["GESTOR", U.GESTOR, "authenticated", "MANAGE"], ["GERENTE", U.GERENTE, "authenticated", "MANAGE"],
    ["ADMINISTRADOR", U.ADMIN, "authenticated", "ADMIN"], ["INATIVO", U.INATIVO, "authenticated", "NONE"],
    ["PENDENTE", U.PENDENTE, "authenticated", "NONE"], ["OUTRO_PROJETO", U.ADMINB, "authenticated", "NONE"],
    ["AUTHENTICATED_SEM_SUB", null, "authenticated", "NONE"], ["ANON", null, "anon", "NONE"],
  ];

  // ---------- helpers de domínio (tudo por RPC; leituras de estado como superusuário) ----------
  const ncrRow = async (id) => (await su.query("select * from public.quality_ncrs where id=$1", [id])).rows[0];
  const wRow = async (id) => (await su.query("select * from public.quality_warranty_cases where id=$1", [id])).rows[0];
  const mkNcr = async (c, { project = PA, ref, origin = "EMAIL", title } = {}) =>
    rpc(c ?? await as(U.GESTOR), "quality_ncr_create", project, title ?? `RNC sintética ${uniq()}`, "descrição", origin, ref ?? `ref-${uniq()}`);
  const mkWar = async (c, data = {}) =>
    rpc(c ?? await as(U.GESTOR), "quality_warranty_create", PA, "Pintura interna", "Descascamento de tinta com bolhas", JSON.stringify({ origin_type: "EMAIL", origin_ref: `w-${uniq()}`, ...data }));
  const ev = async (c, { ncr = null, warranty = null, cls = "NC_COMPROVADA", epi = "FATO", type = "DOCUMENTO", ref, project = PA } = {}) =>
    (await rpc(c ?? await as(U.GESTOR), "quality_evidence_register", project, type, ref ?? `ev-${uniq()}`, cls, epi, ncr, warranty)).id;
  const capa = async (c, ncr, kind = "CORRETIVA") => rpc(c ?? await as(U.GESTOR), "quality_capa_register", ncr, null, kind, "corrigir o item apontado", null, null);
  const capaSt = (c, id, ver, st, just = null) => rpc(c, "quality_capa_update_status", id, ver, st, just);
  const verifyN = async (c, ncrId, evId, result = "EFICAZ") =>
    rpc(c ?? await as(U.GESTOR), "quality_verification_register", ncrId, null, (await ncrRow(ncrId)).row_version, result, "critério de eficácia definido", evId, null, null);
  const verifyW = async (c, wId, evId, result = "EFICAZ") =>
    rpc(c ?? await as(U.GESTOR), "quality_verification_register", null, wId, (await wRow(wId)).row_version, result, "teste de estanqueidade por 72h", evId, null, null);
  const ntrans = (c, id, to, ver, just = null, evs = null, dup = null) => rpc(c, "quality_ncr_transition", id, to, ver, just, evs, dup);
  const wtrans = (c, id, to, ver, just = null, evs = null) => rpc(c, "quality_warranty_transition", id, to, ver, just, evs);
  const accept = async (c, wId, evId, name = "Cliente Sintético") =>
    rpc(c ?? await as(U.GESTOR), "quality_warranty_acceptance_register", wId, (await wRow(wId)).row_version, "2026-11-10", name, evId);

  /** Leva uma RNC nova ao estado `target` (caminho feliz, tudo por RPC). */
  async function ncrUntil(target) {
    const g = await as(U.GESTOR);
    const created = await mkNcr(g);
    const id = created.id;
    let v = created.rowVersion;
    let evProven = null;
    let action = null;
    for (const s of ["TRIAGEM", "INVESTIGACAO", "CONFIRMADA", "PLANO_ACAO", "CORRECAO", "VERIFICACAO"]) {
      if (s === "CONFIRMADA") { evProven = await ev(g, { ncr: id }); v = (await ntrans(g, id, s, v, J, [evProven])).rowVersion; }
      else if (s === "PLANO_ACAO") { action = await capa(g, id); v = (await ntrans(g, id, s, v)).rowVersion; }
      else if (s === "VERIFICACAO") {
        await capaSt(g, action.id, action.rowVersion, "EXECUTADA");
        v = (await ntrans(g, id, s, v)).rowVersion;
      } else v = (await ntrans(g, id, s, v)).rowVersion;
      if (s === target) break;
    }
    return { id, version: v, evProven, action };
  }
  /** Leva uma garantia ao estado alvo (COBERTA, EM_REPARO, REPARADA...). */
  async function warUntil(target) {
    const g = await as(U.GESTOR);
    const w = await mkWar(g);
    let v = w.rowVersion;
    let evCob = null;
    const steps = ["EM_VISTORIA", "EM_ANALISE", "COBERTA", "EM_REPARO", "REPARADA"];
    for (const s of steps) {
      if (s === "COBERTA") { evCob = await ev(g, { warranty: w.id }); v = (await wtrans(g, w.id, s, v, "Defeito de execução dentro do prazo.", [evCob])).rowVersion; }
      else if (s === "REPARADA") {
        await rpc(g, "quality_warranty_repair_register", w.id, "Refazer manta de impermeabilização", "2026-11-05T12:00:00Z", null, 900, 900, "nf-123", false, null);
        v = (await wtrans(g, w.id, s, v)).rowVersion;
      } else v = (await wtrans(g, w.id, s, v)).rowVersion;
      if (s === target) break;
    }
    return { id: w.id, version: v, evCob };
  }
  const mkAlert = async (project = PA) => {
    const id = (await su.query("select gen_random_uuid() id")).rows[0].id;
    await su.query("insert into public.risk_alert_cases (id,project_id,source_type,source_id,area,risk_level,title,fingerprint) values ($1,$2,'INGESTION_ALERT',gen_random_uuid(),'ENGENHARIA','HIGH','Alerta sintético',$3)", [id, project, `fp-${uniq()}`]);
    return id;
  };
  const mkClaim = async (project = PA, sourceRef = `c-${uniq()}`) =>
    (await su.query("insert into public.insurance_claims (project_id,claim_kind,title,stage,no_instrument_reason,source_ref) values ($1,'OUTRO','Evento sintético','AVISO','motivo suficiente para teste',$2) returning id", [project, sourceRef])).rows[0].id;

  // =====================================================================================================================
  // F3-D-12) infraestrutura: RPCs existem, SECURITY DEFINER, search_path vazio, anon sem EXECUTE; internos fechados
  // =====================================================================================================================
  const RPC_NAMES = [
    "quality_evidence_register", "quality_evidence_revise", "quality_capa_register", "quality_capa_update_status", "quality_verification_register",
    "quality_warranty_acceptance_register", "quality_warranty_repair_register", "quality_warranty_survey_register", "quality_warranty_maintenance_register",
    "quality_consequence_register", "quality_cost_register", "quality_recurrence_register", "quality_complaint_register", "quality_inspection_register",
    "quality_test_register", "quality_requirement_register", "quality_ncr_update_fields", "quality_warranty_case_update", "quality_closure_integrity_report",
    "acc_alert_link_create", "acc_alert_link_unlink", "acc_alert_links_for_alert", "acc_alert_links_for_entity"];
  const INTERNAL = ["quality_case_lookup", "quality_case_accepts_children", "quality_rpc_audit", "quality_member_active", "quality_ncr_state_guard",
    "quality_warranty_state_guard", "quality_evidence_lock", "acc_alert_link_guard", "acc_alert_links_backfill"];
  await check("F3-D-12) RPCs: SECURITY DEFINER + search_path vazio; anon/PUBLIC sem EXECUTE; authenticated executa; funções internas FECHADAS para clientes", async () => {
    for (const n of RPC_NAMES) {
      const r = (await su.query("select p.oid, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth, has_function_privilege('public', p.oid, 'execute') pub from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=$1", [n])).rows;
      eq(r.length, 1, `${n}: uma única assinatura`);
      ok(r[0].prosecdef, `${n} deve ser SECURITY DEFINER`);
      ok((r[0].proconfig ?? []).some((x) => /search_path=("")?$/.test(x) || x === 'search_path=""'), `${n} search_path vazio (${r[0].proconfig})`);
      eq([r[0].anon, r[0].pub, r[0].auth], [false, false, true], `${n} privilégios`);
    }
    for (const n of INTERNAL) {
      const r = (await su.query("select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=$1", [n])).rows;
      ok(r.length >= 1, `${n} existe`);
      for (const x of r) eq([x.anon, x.auth], [false, false], `${n} interno sem EXECUTE para clientes`);
    }
    // hotfix P0 e catálogo de SLA intactos: record_risk_alert_action não referencia Qualidade nem vínculos
    const body = (await su.query("select prosrc from pg_proc where proname='record_risk_alert_action'")).rows[0].prosrc;
    ok(!/quality_|acc_alert_links/i.test(body), "record_risk_alert_action não toca Qualidade/vínculos");
    eq((await su.query("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='risk_alert_cases' and not t.tgisinternal and pg_get_functiondef(t.tgfoid) ~* 'quality_|acc_alert_links'")).rows[0].n, 0, "nenhum trigger de alerta escreve em Qualidade");
  });

  // =====================================================================================================================
  // F3-D-01) escrita direta revogada
  // =====================================================================================================================
  const TABLES = ["quality_requirements", "quality_ncrs", "quality_warranty_cases", "quality_customer_complaints", "quality_inspections", "quality_tests",
    "quality_evidence", "quality_corrective_actions", "quality_warranty_maintenance", "quality_warranty_surveys", "quality_warranty_repairs",
    "quality_effectiveness_verifications", "quality_recurrences", "quality_nonquality_costs", "quality_consequences"];
  await check("CASO F3-D-01) INSERT/UPDATE/DELETE direto NEGADO em todas as tabelas de Qualidade/Garantias para TODOS os perfis (inclusive ADMINISTRADOR); SELECT segue permitido", async () => {
    const n0 = await mkNcr(); await ev(null, { ncr: n0.id });
    for (const [label, n, role, tier] of PROFILES) {
      const c = await as(n, role);
      for (const t of TABLES) {
        for (const sql of [`insert into public.${t} default values`, `update public.${t} set project_id = project_id`, `delete from public.${t}`]) {
          await rejects(c.query(sql), /permission denied/i, `${label}: ${sql}`);
        }
        const sel = c.query(`select count(*)::int n from public.${t}`);
        if (RANK[tier] >= RANK.READ) ok(Number((await sel).rows[0].n) >= 0, `${label} lê ${t}`);
        else { try { ok(Number((await sel).rows[0].n) === 0, `${label} não deveria ler ${t}`); } catch (e) { ok(/permission denied/i.test(e.message), `${label} leitura ${t}: ${e.message}`); } }
      }
    }
    // service_role (BYPASSRLS) tem GRANT por desenho do Supabase, mas os triggers de integridade continuam valendo (testes F3-D-04/05)
    const grants = (await su.query("select table_name, privilege_type from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name = any($1) and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')", [TABLES])).rows;
    eq(grants, [], "nenhum privilégio de escrita direta para authenticated");
    const cols = (await su.query("select table_name, column_name from information_schema.column_privileges where grantee='authenticated' and table_schema='public' and table_name = any($1) and privilege_type in ('INSERT','UPDATE')", [TABLES])).rows;
    eq(cols, [], "nenhum privilégio de escrita por coluna para authenticated");
  });

  // =====================================================================================================================
  // CASO 31) autorização negativa por RPC x perfil
  // =====================================================================================================================
  const OPS = [
    ["quality_evidence_register", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_evidence_register", PA, "DOCUMENTO", `ev-${uniq()}`, "INDICIO", "FATO", x.id, null)],
    ["quality_evidence_revise", "MANAGE", async () => { const n = await mkNcr(); const e = await ev(null, { ncr: n.id, cls: "INDICIO" }); return { e, v: (await su.query("select row_version v from public.quality_evidence where id=$1", [e])).rows[0].v }; },
      (c, x) => rpc(c, "quality_evidence_revise", x.e, x.v, "SUSPEITA", "FATO", "revisada", J)],
    ["quality_capa_register", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_capa_register", x.id, null, "CORRETIVA", "corrigir o item", null, null)],
    ["quality_capa_update_status (EXECUTADA)", "REGISTER", async () => { const n = await mkNcr(); return capa(null, n.id); }, (c, x) => capaSt(c, x.id, x.rowVersion, "EXECUTADA")],
    ["quality_capa_update_status (CANCELADA)", "MANAGE", async () => { const n = await mkNcr(); return capa(null, n.id); }, (c, x) => capaSt(c, x.id, x.rowVersion, "CANCELADA", J)],
    ["quality_verification_register", "MANAGE", async () => { const n = await ncrUntil("VERIFICACAO"); return { n, e: await ev(null, { ncr: n.id, ref: `ver-${uniq()}` }) }; },
      async (c, x) => rpc(c, "quality_verification_register", x.n.id, null, (await ncrRow(x.n.id)).row_version, "EFICAZ", "critério de eficácia definido", x.e, null, null)],
    ["quality_warranty_acceptance_register", "MANAGE", async () => { const w = await warUntil("REPARADA"); return { w, e: await ev(null, { warranty: w.id, ref: `ac-${uniq()}` }) }; },
      async (c, x) => rpc(c, "quality_warranty_acceptance_register", x.w.id, (await wRow(x.w.id)).row_version, "2026-11-10", "Cliente Sintético", x.e)],
    ["quality_warranty_repair_register", "REGISTER", async () => mkWar(), (c, x) => rpc(c, "quality_warranty_repair_register", x.id, "Repintura parcial", null, null, null, null, null, false, null)],
    ["quality_warranty_survey_register", "REGISTER", async () => mkWar(), (c, x) => rpc(c, "quality_warranty_survey_register", x.id, "2026-11-01T12:00:00Z", "Bolhas em 3 paredes", null)],
    ["quality_warranty_maintenance_register", "REGISTER", async () => mkWar(), (c, x) => rpc(c, "quality_warranty_maintenance_register", x.id, "Limpeza de trilhos", "2026-01-10", null, null, null)],
    ["quality_consequence_register", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_consequence_register", x.id, null, "PRAZO", "LOW", "DOCUMENTO", `cron-${uniq()}`, null, null, null, null, null)],
    ["quality_cost_register", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_cost_register", x.id, null, "RETRABALHO", null, null, null, null)],
    ["quality_recurrence_register", "REGISTER", async () => ({ a: await mkNcr(), b: await mkNcr() }), (c, x) => rpc(c, "quality_recurrence_register", x.a.id, null, x.b.id, null, "mesma causa raiz no mesmo serviço")],
    ["quality_complaint_register", "REGISTER", async () => ({}), (c) => rpc(c, "quality_complaint_register", PA, "EMAIL_CLIENTE", new Date().toISOString(), "Infiltração na sala", `msg-${uniq()}@exemplo.invalid`, null, null, null, null, null)],
    ["quality_inspection_register", "REGISTER", async () => ({}), (c) => rpc(c, "quality_inspection_register", PA, "Inspeção de armação", "NAO_CONFORME", null, null, null, null, null, null, null, null)],
    ["quality_test_register", "REGISTER", async () => ({}), (c) => rpc(c, "quality_test_register", PA, "Rompimento de corpo de prova", "PENDENTE", null, null, null, null, null, null, null, null)],
    ["quality_requirement_register", "REGISTER", async () => ({}), (c) => rpc(c, "quality_requirement_register", PA, "Resistência mínima do concreto", "NBR/projeto-estrutural-rev3", null, null)],
    ["quality_ncr_update_fields (título)", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_ncr_update_fields", x.id, x.rowVersion, JSON.stringify({ title: `Título ${uniq()}` }), null)],
    ["quality_ncr_update_fields (causa raiz)", "MANAGE", async () => mkNcr(), (c, x) => rpc(c, "quality_ncr_update_fields", x.id, x.rowVersion, JSON.stringify({ root_cause: "Falha de cura do concreto" }), null)],
    ["quality_warranty_case_update (defeito)", "REGISTER", async () => mkWar(), (c, x) => rpc(c, "quality_warranty_case_update", x.id, x.rowVersion, JSON.stringify({ defect_description: `Defeito ${uniq()}` }), null)],
    ["quality_warranty_case_update (causa)", "MANAGE", async () => mkWar(), (c, x) => rpc(c, "quality_warranty_case_update", x.id, x.rowVersion, JSON.stringify({ cause_category: "EXECUCAO" }), J)],
    ["acc_alert_link_create", "REGISTER", async () => ({ a: await mkAlert(), n: await mkNcr() }), (c, x) => rpc(c, "acc_alert_link_create", x.a, "RNC", x.n.id, null)],
    ["acc_alert_link_unlink", "MANAGE", async () => { const a = await mkAlert(); const n = await mkNcr(); return rpc(await as(U.GESTOR), "acc_alert_link_create", a, "RNC", n.id, null); }, (c, x) => rpc(c, "acc_alert_link_unlink", x.id, "Vínculo criado por engano no alerta errado")],
    ["quality_closure_integrity_report", "READ", async () => ({}), (c) => rpc(c, "quality_closure_integrity_report", PA)],
    ["acc_alert_links_for_alert", "READ", async () => ({ a: await mkAlert() }), (c, x) => rpc(c, "acc_alert_links_for_alert", x.a)],
  ];
  for (const [name, level, setup, run] of OPS) {
    await check(`CASO 31) ${name} — exige ${level}: só perfis >= ${level} passam; demais recusados SEM efeito`, async () => {
      for (const [label, n, role, tier] of PROFILES) {
        const ctx = await setup();
        const c = await as(n, role);
        const shouldPass = RANK[tier] >= RANK[level];
        let err = null;
        try { await run(c, ctx); } catch (e) { err = e; }
        if (shouldPass) ok(!err || !DENIED.test(err.message), `${label} deveria ser AUTORIZADO em "${name}" mas recebeu: ${err?.message}`);
        else ok(err && DENIED.test(err.message), `${label} deveria ser RECUSADO em "${name}" mas ${err ? `falhou por outro motivo: ${err.message}` : "a operação passou"}`);
      }
    });
  }
  await check("CASO 31) recusas não deixam efeito: contagens e auditoria inalteradas após tentativas de perfis sem autorização", async () => {
    const tables = ["quality_ncrs", "quality_warranty_cases", "quality_evidence", "quality_corrective_actions", "quality_consequences", "quality_nonquality_costs",
      "quality_customer_complaints", "quality_inspections", "quality_tests", "quality_requirements", "quality_warranty_repairs", "acc_alert_links", "audit_log_entries"];
    const snap = async () => { const o = {}; for (const t of tables) o[t] = await nq(`select count(*)::int n from public.${t}`); return o; };
    const ctxs = {};
    for (const [name, , setup] of OPS) ctxs[name] = await setup();
    const before = await snap();
    for (const [label, n, role, tier] of PROFILES.filter((p) => RANK[p[3]] < RANK.READ)) {
      const c = await as(n, role);
      for (const [name, , , run] of OPS) { try { await run(c, ctxs[name]); } catch { /* esperado */ } }
      void label;
    }
    eq(await snap(), before, "nada gravado por perfil sem acesso");
  });

  // =====================================================================================================================
  // EVIDÊNCIA: registro, dedupe, NC_COMPROVADA=FATO, revisão só por MANAGE, fonte imutável, lock (CASO 2, 5, 6; F3-D-02, -08, -14)
  // =====================================================================================================================
  await check("CASO 2/5/6) evidência por RPC: foto SSMA, diário de obra e fiscalização com fonte original; dedupe por fonte no mesmo caso; sem fonte não existe", async () => {
    const g = await as(U.GESTOR);
    const n = await mkNcr(g, { origin: "SSMA_FOTO" });
    for (const [type, ref] of [["SSMA_FOTO", "foto-ssma-123#frame2"], ["DIARIO_OBRA", "diario-2026-11-02#p3"], ["FISCALIZACAO", "relatorio-fiscalizacao-17"]]) {
      const id = await ev(g, { ncr: n.id, type, ref, cls: "INDICIO" });
      const row = (await su.query("select * from public.quality_evidence where id=$1", [id])).rows[0];
      eq([row.source_type, row.source_ref, row.created_by, row.row_version], [type, ref, uid(U.GESTOR), 1], `evidência ${type}`);
    }
    await rejects(ev(g, { ncr: n.id, type: "SSMA_FOTO", ref: "foto-ssma-123#frame2" }), /DUPLICATE_EVIDENCE/, "mesma fonte no mesmo caso");
    await rejects(rpc(g, "quality_evidence_register", PA, "DOCUMENTO", "  ", "INDICIO", "FATO", n.id, null), /INVALID_DATA/, "fonte vazia");
    await rejects(rpc(g, "quality_evidence_register", PA, "FOTO", "x", "INDICIO", "FATO", n.id, null), /INVALID_DATA/, "tipo de fonte inválido");
    await rejects(rpc(g, "quality_evidence_register", PA, "DOCUMENTO", "x", "INDICIO", "FATO", null, null), /INVALID_DATA/, "sem vínculo");
    await rejects(rpc(g, "quality_evidence_register", PB, "DOCUMENTO", "x", "INDICIO", "FATO", n.id, null), /FORBIDDEN/, "projeto sem acesso");
    await rejects(rpc(g, "quality_evidence_register", PA, "DOCUMENTO", "x", "INDICIO", "FATO", "00000000-0000-4000-8000-00000000dead", null), /FORBIDDEN/, "RNC inexistente");
  });

  await check("CASO F3-D-14) NC_COMPROVADA exige tipo epistêmico FATO (inferência/recomendação não comprovam); aceito como SUSPEITA/INDICIO", async () => {
    const n = await mkNcr();
    await rejects(rpc(await as(U.COLAB), "quality_evidence_register", PA, "DOCUMENTO", `x-${uniq()}`, "NC_COMPROVADA", "INFERENCIA", n.id, null), /EPISTEMIC_INVALID/, "NC com inferência");
    await rejects(rpc(await as(U.COLAB), "quality_evidence_register", PA, "DOCUMENTO", `x-${uniq()}`, "NC_COMPROVADA", "RECOMENDACAO", n.id, null), /EPISTEMIC_INVALID/, "NC com recomendação");
    await ev(await as(U.COLAB), { ncr: n.id, cls: "SUSPEITA", epi: "INFERENCIA" });
    const e = await ev(await as(U.COLAB), { ncr: n.id, cls: "INDICIO", epi: "FATO" });
    const v = (await su.query("select row_version v from public.quality_evidence where id=$1", [e])).rows[0].v;
    await rejects(rpc(await as(U.GESTOR), "quality_evidence_revise", e, v, "NC_COMPROVADA", "INFERENCIA", null, J), /EPISTEMIC_INVALID/, "revisão para NC com inferência");
  });

  await check("CASO F3-D-02) COLABORADOR NÃO reclassifica evidência já registrada; GESTOR reclassifica com justificativa; fonte original permanece imutável (nem superusuário)", async () => {
    const colab = await as(U.COLAB);
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const e = await ev(colab, { ncr: n.id, cls: "INDICIO", ref: "email-cliente-77" });
    let row = (await su.query("select * from public.quality_evidence where id=$1", [e])).rows[0];
    await rejects(rpc(colab, "quality_evidence_revise", e, row.row_version, "NC_COMPROVADA", "FATO", "tentativa", J), /FORBIDDEN/, "COLABORADOR reclassifica");
    await rejects(colab.query("update public.quality_evidence set classification='NC_COMPROVADA' where id=$1", [e]), /permission denied/i, "UPDATE direto do COLABORADOR");
    eq((await su.query("select classification from public.quality_evidence where id=$1", [e])).rows[0].classification, "INDICIO", "classificação intacta");
    await rejects(rpc(g, "quality_evidence_revise", e, row.row_version, "NC_COMPROVADA", "FATO", "x", "curta"), /JUSTIFICATION_REQUIRED/, "sem justificativa");
    await rejects(rpc(g, "quality_evidence_revise", e, row.row_version + 5, "NC_COMPROVADA", "FATO", "x", J), /VERSION_CONFLICT/, "versão errada");
    await rejects(rpc(g, "quality_evidence_revise", e, null, "NC_COMPROVADA", "FATO", "x", J), /VERSION_REQUIRED/, "sem versão");
    await rejects(rpc(g, "quality_evidence_revise", e, row.row_version, "INDICIO", "FATO", null, J), /INVALID_DATA/, "sem mudança");
    const r = await rpc(g, "quality_evidence_revise", e, row.row_version, "NC_COMPROVADA", "FATO", "foto confirma o defeito", J);
    eq(r.rowVersion, row.row_version + 1, "versão incrementada");
    row = (await su.query("select * from public.quality_evidence where id=$1", [e])).rows[0];
    eq([row.classification, row.source_ref, row.source_type], ["NC_COMPROVADA", "email-cliente-77", "DOCUMENTO"], "revisada; fonte intacta");
    await rejects(su.query("update public.quality_evidence set source_ref='outra' where id=$1", [e]), /EVIDENCE_SOURCE_IMMUTABLE/, "fonte (nem superusuário)");
    await rejects(su.query("update public.quality_evidence set source_url='http://x' where id=$1", [e]), /EVIDENCE_SOURCE_IMMUTABLE/, "url da fonte");
    const a = (await su.query("select detail from public.audit_log_entries where action='QUALITY_EVIDENCE_REVISE' and entity_id=$1", [e])).rows;
    eq(a.length, 1, "auditoria da revisão");
    const d = JSON.parse(a[0].detail);
    eq([d.before.classification, d.after.classification, d.justification], ["INDICIO", "NC_COMPROVADA", J], "antes/depois/justificativa auditados");
  });

  await check("CASO F3-D-08) evidência usada por verificação/decisão fica TRAVADA (reclassificação recusada); evidência NUNCA é apagada (nem superusuário)", async () => {
    const g = await as(U.GESTOR);
    const n = await ncrUntil("VERIFICACAO");
    const eVer = await ev(g, { ncr: n.id, ref: `ver-${uniq()}` });
    await verifyN(g, n.id, eVer);
    const v = (await su.query("select row_version v from public.quality_evidence where id=$1", [eVer])).rows[0].v;
    await rejects(rpc(g, "quality_evidence_revise", eVer, v, "SUSPEITA", "FATO", "x", J), /EVIDENCE_LOCKED/, "evidência da verificação");
    await rejects(su.query("update public.quality_evidence set classification='SUSPEITA' where id=$1", [eVer]), /EVIDENCE_LOCKED/, "UPDATE direto (superusuário)");
    await rejects(su.query("update public.quality_evidence set description='alterada' where id=$1", [n.evProven]), /EVIDENCE_LOCKED/, "evidência de decisão de transição (CONFIRMADA)");
    await rejects(su.query("delete from public.quality_evidence where id=$1", [eVer]), /EVIDENCE_DELETE_FORBIDDEN/, "DELETE da evidência da verificação");
    const free = await ev(g, { ncr: n.id, ref: `livre-${uniq()}` });
    await rejects(su.query("delete from public.quality_evidence where id=$1", [free]), /EVIDENCE_DELETE_FORBIDDEN/, "DELETE de evidência livre (superusuário)");
    await rejects((await as(U.ADMIN)).query("delete from public.quality_evidence where id=$1", [free]), /permission denied/i, "DELETE por ADMINISTRADOR");
  });

  // =====================================================================================================================
  // CAPA (CASO 35 base) e correção executada != conformidade
  // =====================================================================================================================
  await check("CASO F3-D-15) CAPA por RPC: registrar (REGISTER), executar, cancelar só com gestão+justificativa; transições inválidas e caso encerrado recusados; versão otimista", async () => {
    const colab = await as(U.COLAB);
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const a = await capa(colab, n.id, "CONTENCAO");
    eq(a.rowVersion, 1, "CAPA nasce na versão 1");
    await rejects(rpc(colab, "quality_capa_register", n.id, null, "OUTRA", "corrigir", null, null), /INVALID_DATA/, "tipo inválido");
    await rejects(rpc(colab, "quality_capa_register", n.id, null, "CORRETIVA", "ab", null, null), /INVALID_DATA/, "descrição curta");
    await rejects(rpc(colab, "quality_capa_register", n.id, null, "CORRETIVA", "corrigir bem", null, uid(U.ADMINB)), /INVALID_DATA/, "responsável de outro projeto");
    await rejects(rpc(colab, "quality_capa_register", n.id, "00000000-0000-4000-8000-00000000dead", "CORRETIVA", "corrigir bem", null, null), /INVALID_DATA/, "RNC e garantia ao mesmo tempo");
    const r1 = await capaSt(colab, a.id, a.rowVersion, "EM_ANDAMENTO");
    await rejects(capaSt(colab, a.id, a.rowVersion, "EXECUTADA"), /VERSION_CONFLICT/, "versão antiga");
    await rejects(capaSt(colab, a.id, null, "EXECUTADA"), /VERSION_REQUIRED/, "sem versão");
    await rejects(capaSt(colab, a.id, r1.rowVersion, "CANCELADA", J), /FORBIDDEN/, "COLABORADOR cancela");
    await rejects(capaSt(g, a.id, r1.rowVersion, "CANCELADA", "curta"), /JUSTIFICATION_REQUIRED/, "cancelar sem justificativa");
    const r2 = await capaSt(colab, a.id, r1.rowVersion, "EXECUTADA");
    eq((await su.query("select status, executed_at is not null ex from public.quality_corrective_actions where id=$1", [a.id])).rows[0], { status: "EXECUTADA", ex: true }, "executada");
    await rejects(capaSt(colab, a.id, r2.rowVersion, "PLANEJADA"), /INVALID_TRANSITION/, "EXECUTADA -> PLANEJADA");
    await rejects(capaSt(colab, a.id, r2.rowVersion, "EM_ANDAMENTO"), /JUSTIFICATION_REQUIRED/, "desfazer executada exige justificativa");
    const r3 = await capaSt(colab, a.id, r2.rowVersion, "EM_ANDAMENTO", J);
    const r4 = await capaSt(g, a.id, r3.rowVersion, "CANCELADA", J);
    await rejects(capaSt(g, a.id, r4.rowVersion, "EXECUTADA"), /INVALID_TRANSITION/, "CANCELADA é terminal");
    const au = (await su.query("select detail from public.audit_log_entries where action='QUALITY_CAPA_STATUS' and entity_id=$1 order by occurred_at, id", [a.id])).rows.map((x) => JSON.parse(x.detail).to);
    eq(au, ["EM_ANDAMENTO", "EXECUTADA", "EM_ANDAMENTO", "CANCELADA"], "cada mudança de status auditada");
    // caso encerrado/cancelado não recebe CAPA
    const c = await mkNcr(g);
    await ntrans(g, c.id, "CANCELADA", c.rowVersion, J);
    await rejects(capa(g, c.id), /CASE_NOT_ACTIVE/, "CAPA em RNC cancelada");
  });

  // =====================================================================================================================
  // ENCERRAMENTO INDEVIDO (CASO 35) — RNC: todos os caminhos
  // =====================================================================================================================
  await check("CASO 35 / F3-D-04) RNC: sem verificação, correção executada, INEFICAZ/PARCIAL, verificação vencida, COLABORADOR — ENCERRADA recusada por RPC", async () => {
    const g = await as(U.GESTOR);
    const n = await ncrUntil("VERIFICACAO");
    await rejects(ntrans(g, n.id, "ENCERRADA", n.version, J), /EFFECTIVENESS_VERIFICATION_REQUIRED/, "ações executadas, mas sem verificação");
    await rejects(ntrans(await as(U.COLAB), n.id, "ENCERRADA", n.version, J), /FORBIDDEN/, "COLABORADOR");
    const e1 = await ev(g, { ncr: n.id });
    await verifyN(g, n.id, e1, "INEFICAZ");
    await rejects(ntrans(g, n.id, "ENCERRADA", (await ncrRow(n.id)).row_version, J), /LATEST_VERIFICATION_NOT_EFFECTIVE/, "INEFICAZ");
    const e2 = await ev(g, { ncr: n.id });
    await verifyN(g, n.id, e2, "PARCIAL");
    await rejects(ntrans(g, n.id, "ENCERRADA", (await ncrRow(n.id)).row_version, J), /LATEST_VERIFICATION_NOT_EFFECTIVE/, "PARCIAL");
    const e3 = await ev(g, { ncr: n.id });
    await verifyN(g, n.id, e3, "EFICAZ");
    // nova rodada de correção invalida a verificação anterior
    let v = (await ntrans(g, n.id, "CORRECAO", (await ncrRow(n.id)).row_version, J)).rowVersion;
    v = (await ntrans(g, n.id, "VERIFICACAO", v)).rowVersion;
    await rejects(ntrans(g, n.id, "ENCERRADA", v, J), /VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN/, "verificação anterior à última correção");
    const e4 = await ev(g, { ncr: n.id });
    await verifyN(g, n.id, e4, "EFICAZ");
    const closed = await ntrans(g, n.id, "ENCERRADA", (await ncrRow(n.id)).row_version, J);
    eq(closed.to, "ENCERRADA", "com verificação EFICAZ posterior ao último ciclo: encerra");
    ok((await ncrRow(n.id)).closed_at, "closed_at preenchido");
  });

  await check("CASO 35 / F3-D-04) RNC: UPDATE direto, superusuário, service_role, INSERT já encerrada e salto de estado — todos barrados pelos triggers (incl. 'trigger bypass' por função)", async () => {
    const g = await as(U.GESTOR);
    const n = await ncrUntil("VERIFICACAO");     // ações executadas, SEM verificação
    const fresh = await mkNcr(g);
    // (a) superusuário sem ator
    await rejects(su.query("update public.quality_ncrs set state='ENCERRADA', closed_at=now() where id=$1", [n.id]), /STATE_CHANGE_REQUIRES_ACTOR/, "superusuário sem ator");
    // (b) service_role (BYPASSRLS) sem sub e com sub falso
    await rejects((await as(null, "service_role")).query("update public.quality_ncrs set state='ENCERRADA', closed_at=now() where id=$1", [n.id]), /STATE_CHANGE_REQUIRES_ACTOR/, "service_role sem sub");
    // (c) com identidade de GESTOR forjada: as condições de dados continuam exigidas
    const forged = await suAs(U.GESTOR);
    await rejects(forged.query("update public.quality_ncrs set state='ENCERRADA', closed_at=now() where id=$1", [n.id]), /TRANSITION_BLOCKED: .*EFFECTIVENESS_VERIFICATION_REQUIRED/, "identidade forjada sem verificação");
    // (d) salto de estado (DETECTADA -> ENCERRADA) mesmo com identidade forjada
    await rejects(forged.query("update public.quality_ncrs set state='ENCERRADA', closed_at=now() where id=$1", [fresh.id]), /INVALID_TRANSITION/, "salto DETECTADA -> ENCERRADA");
    // (e) closed_at/reopen_count sozinhos não mudam
    await rejects(su.query("update public.quality_ncrs set closed_at=now() where id=$1", [n.id]), /STATE_GUARD/, "closed_at sozinho");
    await rejects(su.query("update public.quality_ncrs set reopen_count=3 where id=$1", [n.id]), /STATE_GUARD/, "reopen_count sozinho");
    // (f) INSERT já encerrada / com reaberturas
    await rejects(su.query("insert into public.quality_ncrs (project_id,code,title,state,origin_type,origin_ref,origin_key,closed_at) values ($1,'RNC-9999','x indevido','ENCERRADA','EMAIL','r','EMAIL:r-ind',now())", [PA]), /STATE_GUARD/, "INSERT encerrada");
    await rejects(su.query("insert into public.quality_ncrs (project_id,code,title,origin_type,origin_ref,origin_key,reopen_count) values ($1,'RNC-9998','x indevido','EMAIL','r','EMAIL:r-ind2',2)", [PA]), /STATE_GUARD/, "INSERT com reaberturas");
    // (g) verificação forjada por superusuário fora do estado/sem evidência/de outro caso/não FATO
    await rejects(su.query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',null)", [PA, n.id]), /not-null|VERIFICATION_EVIDENCE_REQUIRED/i, "sem evidência");
    const other = await mkNcr(g);
    const eOther = await ev(g, { ncr: other.id });
    await rejects(su.query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',$3)", [PA, n.id, eOther]), /VERIFICATION_EVIDENCE_INVALID/, "evidência de outro caso");
    await rejects(su.query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',$3)", [PA, fresh.id, eOther]), /VERIFICATION_STATE_INVALID/, "RNC fora de VERIFICACAO");
    const eInf = await ev(g, { ncr: n.id, cls: "INDICIO", epi: "INFERENCIA" });
    await rejects(verifyN(g, n.id, eInf), /EVIDENCE_INVALID/, "evidência INFERENCIA não comprova eficácia");
    await rejects(rpc(g, "quality_verification_register", n.id, null, (await ncrRow(n.id)).row_version, "EFICAZ", "critério de eficácia definido", null, null, null), /EVIDENCE_REQUIRED/, "RPC sem evidência");
    await rejects(rpc(g, "quality_verification_register", fresh.id, null, (await ncrRow(fresh.id)).row_version, "EFICAZ", "critério de eficácia definido", eOther, null, null), /VERIFICATION_STATE_INVALID/, "RPC fora do estado");
    await rejects(rpc(g, "quality_verification_register", n.id, null, 1, "EFICAZ", "critério de eficácia definido", eInf, null, null), /VERSION_CONFLICT|EVIDENCE_INVALID/, "versão antiga do caso");
    // (h) verificação é append-only (nem superusuário apaga/edita)
    const e5 = await ev(g, { ncr: n.id });
    const vr = await verifyN(g, n.id, e5, "INEFICAZ");
    await rejects(su.query("update public.quality_effectiveness_verifications set result='EFICAZ' where id=$1", [vr.id]), /append-only/, "editar verificação");
    await rejects(su.query("delete from public.quality_effectiveness_verifications where id=$1", [vr.id]), /append-only/, "apagar verificação");
    eq((await ncrRow(n.id)).state, "VERIFICACAO", "a RNC continua em VERIFICACAO depois de todas as tentativas");
  });

  await check("CASO 35 / F3-D-04) prova ESTÁTICA: a única função que escreve `state` de RNC/garantia é quality_transition_core; ninguém além dela fecha", async () => {
    const rows = (await su.query("select proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prosrc ~* 'update\\s+public\\.quality_(ncrs|warranty_cases)\\s+set[^;]*\\mstate\\s*=' order by 1")).rows.map((r) => r.proname);
    eq(rows, ["quality_transition_core"], "únicas funções que atualizam o estado");
    const trig = (await su.query("select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relname in ('quality_ncrs','quality_warranty_cases') and pg_get_functiondef(t.tgfoid) ~* 'set\\s+state\\s*='")).rows;
    eq(trig, [], "nenhum trigger muda o estado");
    const upd = (await su.query("select table_name from information_schema.column_privileges where grantee in ('authenticated','anon') and table_schema='public' and table_name in ('quality_ncrs','quality_warranty_cases') and column_name in ('state','closed_at','reopen_count','row_version','criticality') and privilege_type='UPDATE'")).rows;
    eq(upd, [], "ninguém (authenticated/anon) tem UPDATE nas colunas de estado");
  });

  await check("CASO 35 / F3-D-18) relatório de integridade: consistente no fluxo normal; DETECTA encerramento forçado por quem desativou triggers (session_replication_role / disable trigger)", async () => {
    const g = await as(U.GESTOR);
    const ok1 = await ncrUntil("VERIFICACAO");
    await verifyN(g, ok1.id, await ev(g, { ncr: ok1.id }));
    await ntrans(g, ok1.id, "ENCERRADA", (await ncrRow(ok1.id)).row_version, J);
    const rep0 = await rpc(g, "quality_closure_integrity_report", PA);
    ok(rep0.checked >= 1, "há encerradas verificadas");
    eq(rep0.consistent, true, `fluxo normal consistente: ${JSON.stringify(rep0.violations)}`);
    // adulteração por superusuário com triggers desativados
    const bad = await ncrUntil("VERIFICACAO");
    await su.query("alter table public.quality_ncrs disable trigger quality_ncrs_state_guard_trg");
    try { await su.query("update public.quality_ncrs set state='ENCERRADA', closed_at=now() where id=$1", [bad.id]); }
    finally { await su.query("alter table public.quality_ncrs enable trigger quality_ncrs_state_guard_trg"); }
    const rep1 = await rpc(g, "quality_closure_integrity_report", PA);
    eq(rep1.consistent, false, "violação detectada");
    const v = rep1.violations.find((x) => x.id === bad.id);
    ok(v && v.blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED"), `relatório aponta o encerramento sem verificação: ${JSON.stringify(rep1.violations)}`);
    ok(!rep1.violations.some((x) => x.id === ok1.id), "a RNC legítima não é acusada");
    await rejects(rpc(await as(U.ADMINB), "quality_closure_integrity_report", PA), /FORBIDDEN/, "outro projeto não lê o relatório");
    // limpeza: devolve a RNC adulterada a um estado coerente para não contaminar os demais testes
    await su.query("alter table public.quality_ncrs disable trigger quality_ncrs_state_guard_trg");
    try { await su.query("update public.quality_ncrs set state='CANCELADA', closed_at=null where id=$1", [bad.id]); }
    finally { await su.query("alter table public.quality_ncrs enable trigger quality_ncrs_state_guard_trg"); }
    eq((await rpc(g, "quality_closure_integrity_report", PA)).consistent, true, "consistente após a correção");
  });

  // =====================================================================================================================
  // ENCERRAMENTO INDEVIDO — garantia (aceite do cliente) e CASO 36 reabertura
  // =====================================================================================================================
  await check("CASO F3-D-05) garantia: reparo executado não encerra; sem verificação/aceite não encerra; aceite exige MANAGE + evidência FATO do caso; UPDATE direto/forjado barrado", async () => {
    const g = await as(U.GESTOR);
    const w = await warUntil("REPARADA");
    await rejects(wtrans(g, w.id, "ENCERRADA", w.version, J), /INVALID_TRANSITION/, "reparada não encerra");
    await rejects(wtrans(g, w.id, "VERIFICADA", w.version, J), /EFFECTIVENESS_VERIFICATION_REQUIRED/, "verificação obrigatória");
    const evVer = await ev(g, { warranty: w.id, ref: `teste-${uniq()}` });
    await rejects(verifyW(await as(U.COLAB), w.id, evVer), /FORBIDDEN/, "COLABORADOR verifica");
    await verifyW(g, w.id, evVer);
    let v = (await wtrans(g, w.id, "VERIFICADA", (await wRow(w.id)).row_version, J)).rowVersion;
    await rejects(wtrans(g, w.id, "ENCERRADA", v, J), /CUSTOMER_ACCEPTANCE_REQUIRED/, "aceite do cliente obrigatório");
    // aceite: quem, evidência e estado
    const evAc = await ev(g, { warranty: w.id, ref: `termo-${uniq()}` });
    await rejects(accept(await as(U.COLAB), w.id, evAc), /FORBIDDEN/, "COLABORADOR registra aceite");
    await rejects(rpc(g, "quality_warranty_acceptance_register", w.id, (await wRow(w.id)).row_version, "2026-11-10", "Cliente", null), /EVIDENCE_REQUIRED/, "aceite sem evidência");
    const otherW = await mkWar(g);
    const evOther = await ev(g, { warranty: otherW.id });
    await rejects(accept(g, w.id, evOther), /EVIDENCE_INVALID/, "evidência de outro caso");
    const evInf = await ev(g, { warranty: w.id, cls: "INDICIO", epi: "INFERENCIA", ref: `inf-${uniq()}` });
    await rejects(accept(g, w.id, evInf), /EVIDENCE_INVALID/, "evidência não-FATO");
    await rejects(rpc(g, "quality_warranty_acceptance_register", w.id, (await wRow(w.id)).row_version, "2099-01-01", "Cliente", evAc), /INVALID_DATA/, "aceite no futuro");
    await rejects(rpc(g, "quality_warranty_acceptance_register", w.id, 1, "2026-11-10", "Cliente", evAc), /VERSION_CONFLICT/, "versão antiga");
    await rejects(accept(g, otherW.id, evOther), /INVALID_STATE/, "aceite com a garantia ainda ABERTA");
    // UPDATE direto de aceite não cria encerramento: superusuário forjado ainda esbarra nas guardas
    const forged = await suAs(U.GESTOR);
    await rejects(su.query("update public.quality_warranty_cases set state='ENCERRADA', closed_at=now() where id=$1", [w.id]), /STATE_CHANGE_REQUIRES_ACTOR/, "superusuário sem ator");
    await rejects(forged.query("update public.quality_warranty_cases set state='ENCERRADA', closed_at=now() where id=$1", [w.id]), /TRANSITION_BLOCKED: .*CUSTOMER_ACCEPTANCE_REQUIRED/, "identidade forjada sem aceite");
    await accept(g, w.id, evAc);
    const row = await wRow(w.id);
    eq([row.accepted_by_name, row.accepted_evidence_id], ["Cliente Sintético", evAc], "aceite registrado com a evidência");
    await rejects(rpc(g, "quality_evidence_revise", evAc, 1, "SUSPEITA", "FATO", null, J), /EVIDENCE_LOCKED|VERSION_CONFLICT/, "evidência do aceite travada");
    const done = await wtrans(g, w.id, "ENCERRADA", row.row_version, "Aceite do cliente registrado após reinspeção.");
    eq(done.to, "ENCERRADA", "encerrada com verificação EFICAZ + aceite");
    await rejects(su.query("insert into public.quality_warranty_cases (project_id,code,service_system,defect_description,state) values ($1,'GAR-9999','pintura','defeito','ENCERRADA')", [PA]), /STATE_GUARD/, "INSERT garantia já encerrada");
    await rejects(su.query("insert into public.quality_warranty_cases (project_id,code,service_system,defect_description,accepted_at,accepted_by_name) values ($1,'GAR-9998','pintura','defeito',now(),'Fulano')", [PA]), /STATE_GUARD/, "INSERT garantia já aceita");
  });

  await check("CASO 36 / F3-D-07) reabertura exige justificativa + evidência DO PRÓPRIO caso; invalida verificação e aceite anteriores (RNC e garantia)", async () => {
    const g = await as(U.GESTOR);
    // RNC
    const n = await ncrUntil("VERIFICACAO");
    await verifyN(g, n.id, await ev(g, { ncr: n.id }));
    let v = (await ntrans(g, n.id, "ENCERRADA", (await ncrRow(n.id)).row_version, J)).rowVersion;
    const other = await mkNcr(g);
    const eOther = await ev(g, { ncr: other.id });
    const eRe = await ev(g, { ncr: n.id, cls: "INDICIO" });
    await rejects(ntrans(g, n.id, "REABERTA", v, null, [eRe]), /JUSTIFICATION_REQUIRED/, "sem justificativa");
    await rejects(ntrans(g, n.id, "REABERTA", v, J, null), /EVIDENCE_REQUIRED/, "sem evidência");
    await rejects(ntrans(g, n.id, "REABERTA", v, J, [eOther]), /EVIDENCE_INVALID/, "evidência de outra RNC");
    await rejects(ntrans(await as(U.COLAB), n.id, "REABERTA", v, J, [eRe]), /FORBIDDEN/, "COLABORADOR reabre");
    await rejects(su.query("update public.quality_ncrs set state='REABERTA', reopen_count=reopen_count+1, closed_at=null where id=$1", [n.id]), /STATE_CHANGE_REQUIRES_ACTOR/, "reabrir por UPDATE direto");
    v = (await ntrans(g, n.id, "REABERTA", v, J, [eRe])).rowVersion;
    eq([(await ncrRow(n.id)).reopen_count, (await ncrRow(n.id)).closed_at], [1, null], "contador e closed_at");
    v = (await ntrans(g, n.id, "INVESTIGACAO", v)).rowVersion;
    await rejects(ntrans(g, n.id, "ENCERRADA", v, J), /INVALID_TRANSITION/, "não encerra direto após reabrir");
    // garantia: o aceite NÃO sobrevive à reabertura
    const w = await warUntil("REPARADA");
    await verifyW(g, w.id, await ev(g, { warranty: w.id, ref: `v-${uniq()}` }));
    await wtrans(g, w.id, "VERIFICADA", (await wRow(w.id)).row_version, J);
    await accept(g, w.id, await ev(g, { warranty: w.id, ref: `a-${uniq()}` }));
    await wtrans(g, w.id, "ENCERRADA", (await wRow(w.id)).row_version, J);
    const eRe2 = await ev(g, { warranty: w.id, cls: "INDICIO", ref: `re-${uniq()}` });
    await rejects(wtrans(g, w.id, "REABERTA", (await wRow(w.id)).row_version, J, [eOther]), /EVIDENCE_INVALID/, "evidência de outro caso");
    await wtrans(g, w.id, "REABERTA", (await wRow(w.id)).row_version, J, [eRe2]);
    const rr = await wRow(w.id);
    eq([rr.accepted_at, rr.accepted_by_name, rr.accepted_evidence_id, rr.reopen_count, rr.closed_at], [null, null, null, 1, null], "aceite anterior descartado na reabertura");
    ok((await su.query("select 1 from public.audit_log_entries where action='QUALITY_WARRANTY_ACCEPTANCE' and entity_id=$1", [w.id])).rowCount === 1, "o aceite anterior segue na trilha de auditoria");
    // novo ciclo: sem novo aceite não encerra
    let wv = (await wRow(w.id)).row_version;
    for (const s of ["EM_VISTORIA", "EM_ANALISE"]) wv = (await wtrans(g, w.id, s, wv)).rowVersion;
    wv = (await wtrans(g, w.id, "COBERTA", wv, "Reincidência dentro da garantia.", [eRe2])).rowVersion;
    wv = (await wtrans(g, w.id, "EM_REPARO", wv)).rowVersion;
    wv = (await wtrans(g, w.id, "REPARADA", wv)).rowVersion;
    await rejects(wtrans(g, w.id, "VERIFICADA", wv, J), /VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN/, "verificação anterior vencida");
    await verifyW(g, w.id, await ev(g, { warranty: w.id, ref: `v2-${uniq()}` }));
    wv = (await wtrans(g, w.id, "VERIFICADA", (await wRow(w.id)).row_version, J)).rowVersion;
    await rejects(wtrans(g, w.id, "ENCERRADA", wv, J), /CUSTOMER_ACCEPTANCE_REQUIRED/, "novo ciclo exige NOVO aceite");
  });

  await check("CASO F3-D-06) RESOLVIDO do alerta NÃO encerra RNC/garantia/sinistro vinculados; vincular não muda estado nem versão", async () => {
    const g = await as(U.GESTOR);
    const n = await ncrUntil("VERIFICACAO");
    const w = await warUntil("REPARADA");
    const claim = await mkClaim();
    const alert = await mkAlert();
    for (const [t, id] of [["RNC", n.id], ["GARANTIA", w.id], ["SINISTRO", claim]]) await rpc(g, "acc_alert_link_create", alert, t, id, "vínculo de teste");
    const before = [(await ncrRow(n.id)).row_version, (await wRow(w.id)).row_version, (await ncrRow(n.id)).state, (await wRow(w.id)).state];
    eq(before, [(await ncrRow(n.id)).row_version, (await wRow(w.id)).row_version, "VERIFICACAO", "REPARADA"], "vincular não alterou estado");
    // efeito do RESOLVIDO no alerta (mesma escrita final do fluxo humano)
    await su.query("update public.risk_alert_cases set state='RESOLVED', resolved_at=now() where id=$1", [alert]);
    eq([(await ncrRow(n.id)).state, (await wRow(w.id)).state, (await su.query("select stage from public.insurance_claims where id=$1", [claim])).rows[0].stage], ["VERIFICACAO", "REPARADA", "AVISO"], "RNC, garantia e sinistro intactos");
    const gn = await rpc(g, "quality_alert_resolved_guard", "NCR", n.id);
    const gw = await rpc(g, "quality_alert_resolved_guard", "WARRANTY", w.id);
    eq([gn.alertResolutionClosesEntity, gn.closureReady, gw.alertResolutionClosesEntity, gw.closureReady], [false, false, false, false], "guarda de encerramento");
    ok(gn.blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED"), "falta verificação de eficácia");
    eq([(await ncrRow(n.id)).row_version], [before[0]], "a RNC não foi tocada");
  });

  // =====================================================================================================================
  // Casos de domínio por RPC
  // =====================================================================================================================
  await check("CASO 1/34) falha estrutural: consequências nos 4 pilares por RPC; criticidade = PIOR pilar (nunca média); probabilidade só com fundamento; valor só com fonte", async () => {
    const g = await as(U.GESTOR);
    const n = await mkNcr(g, { origin: "FISCALIZACAO", title: "Fissura estrutural em pilar durante a execução" });
    const cons = (pillar, sev, extra = {}) => rpc(g, "quality_consequence_register", n.id, null, pillar, sev, "DOCUMENTO", extra.ref ?? `laudo-${uniq()}`, extra.prob ?? null, extra.basis ?? null, null, extra.measures ?? null, null);
    eq((await ncrRow(n.id)).criticality, "SEM_DADOS", "sem consequência = SEM DADOS");
    await cons("PRAZO", "LOW"); await cons("CUSTO", "MEDIUM"); await cons("QUALIDADE", "LOW");
    eq((await ncrRow(n.id)).criticality, "MEDIUM", "pior pilar (MEDIUM), não a média");
    const r = await cons("SEGURANCA", "CRITICAL", { measures: "isolar a área e escorar" });
    eq(r.criticality, "CRITICAL", "RPC devolve a criticidade recalculada");
    eq((await ncrRow(n.id)).criticality, "CRITICAL", "SEGURANCA CRITICAL domina com prazo/custo baixos");
    eq(await nq("select count(distinct pillar)::int n from public.quality_consequences where ncr_id=$1", [n.id]), 4, "quatro pilares registrados");
    await rejects(rpc(g, "quality_consequence_register", n.id, null, "PRAZO", "LOW", "DOCUMENTO", "  ", null, null, null, null, null), /INVALID_DATA/, "sem fonte (SEM DADOS)");
    await rejects(rpc(g, "quality_consequence_register", n.id, null, "PRAZO", "LOW", "DOCUMENTO", "x", "PROVAVEL", null, null, null, null), /INVALID_DATA/, "probabilidade sem fundamento");
    await rejects(rpc(g, "quality_consequence_register", n.id, null, "FINANCEIRO", "LOW", "DOCUMENTO", "x", null, null, null, null, null), /INVALID_DATA/, "pilar inválido");
    await cons("PRAZO", "HIGH", { prob: "POSSIVEL", basis: "recorrência em obras semelhantes" });
    eq(await nq("select count(*)::int n from public.quality_consequences where ncr_id=$1 and probability='POSSIVEL'", [n.id]), 1, "probabilidade com fundamento");
  });

  await check("CASO 33) dados insuficientes: custo com valor sem fonte recusado (sem valor = SEM DADOS); custo negativo recusado; aceito com fonte", async () => {
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    await rejects(rpc(g, "quality_cost_register", n.id, null, "MATERIAL", null, 1000, null, null), /COST_SOURCE_REQUIRED/, "valor sem fonte");
    await rejects(rpc(g, "quality_cost_register", n.id, null, "MATERIAL", null, -5, null, "orc"), /INVALID_DATA/, "valor negativo");
    await rejects(rpc(g, "quality_cost_register", n.id, null, "OUTRA", null, null, null, null), /INVALID_DATA/, "categoria inválida");
    await rpc(g, "quality_cost_register", n.id, null, "RETRABALHO", null, null, null, null);
    await rpc(g, "quality_cost_register", n.id, null, "MATERIAL", "cimento", 1000, 1200, "nf-123");
    const rows = (await su.query("select estimated_amount, actual_amount, source_ref from public.quality_nonquality_costs where ncr_id=$1 order by created_at", [n.id])).rows;
    eq([rows[0].estimated_amount, rows[0].actual_amount], [null, null], "sem valor = SEM DADOS (NULL)");
    eq([Number(rows[1].estimated_amount), Number(rows[1].actual_amount), rows[1].source_ref], [1000, 1200, "nf-123"], "valor com fonte");
    const w = await mkWar(g);
    await rejects(rpc(g, "quality_warranty_repair_register", w.id, "Refazer manta", null, null, null, 900, null, false, null), /COST_SOURCE_REQUIRED/, "custo de reparo sem fonte");
    await rejects(rpc(g, "quality_warranty_repair_register", w.id, "Refazer manta", null, null, null, null, null, true, null), /INVALID_DATA/, "reincidência sem reparo anterior");
    await rpc(g, "quality_warranty_repair_register", w.id, "Refazer manta", null, null, null, 900, "nf-77", false, null);
  });

  await check("CASO 3/4) reclamação por e-mail do cliente e por e-mail AXION, por RPC: fonte obrigatória, dedupe por canal+fonte, vínculo só dentro do projeto", async () => {
    const c = await as(U.COLAB);
    const ref = `msg-cliente-${uniq()}@exemplo.invalid`;
    const r1 = await rpc(c, "quality_complaint_register", PA, "EMAIL_CLIENTE", "2026-11-02T10:00:00Z", "Infiltração na sala", ref, "cliente sintético", "descrição", null, null, null);
    ok(/^REC-\d{4}$/.test(r1.code), "código automático");
    await rpc(c, "quality_complaint_register", PA, "EMAIL_AXION", "2026-11-03T10:00:00Z", "Mesma reclamação reencaminhada", ref, null, null, null, null, null);
    await rejects(rpc(c, "quality_complaint_register", PA, "EMAIL_CLIENTE", "2026-11-03T10:00:00Z", "duplicada", ref, null, null, null, null, null), /DUPLICATE_RECORD/, "mesmo canal + fonte");
    await rejects(rpc(c, "quality_complaint_register", PA, "EMAIL_CLIENTE", "2026-11-03T10:00:00Z", "sem fonte", " ", null, null, null, null, null), /INVALID_DATA/, "sem fonte");
    await rejects(rpc(c, "quality_complaint_register", PA, "FAX", "2026-11-03T10:00:00Z", "canal inválido", "x", null, null, null, null, null), /INVALID_DATA/, "canal inválido");
    const nB = await mkNcr(await as(U.GESTORB), { project: PB });
    await rejects(rpc(c, "quality_complaint_register", PA, "PORTAL", "2026-11-03T10:00:00Z", "vínculo cruzado", `p-${uniq()}`, null, null, null, nB.id, null), /FORBIDDEN/, "RNC de outro projeto");
    const nA = await mkNcr(await as(U.GESTOR));
    await rpc(c, "quality_complaint_register", PA, "PORTAL", "2026-11-03T10:00:00Z", "ligada à RNC", `p-${uniq()}`, null, null, null, nA.id, null);
  });

  await check("CASO 6/13) inspeção, ensaio e requisito por RPC: resultado conclusivo exige laudo; requisito exige fonte; FK de projeto", async () => {
    const c = await as(U.COLAB);
    const req = await rpc(c, "quality_requirement_register", PA, "Resistência mínima do concreto", "NBR/projeto-estrutural-rev3", null, null);
    ok(/^REQ-\d{4}$/.test(req.code), "código REQ");
    await rejects(rpc(c, "quality_requirement_register", PA, "Sem fonte", " ", null, null), /INVALID_DATA/, "requisito sem fonte");
    const ins = await rpc(c, "quality_inspection_register", PA, "Inspeção de armação", "NAO_CONFORME", null, null, null, null, null, null, null, req.id);
    ok(/^INS-\d{4}$/.test(ins.code), "código INS");
    await rejects(rpc(c, "quality_test_register", PA, "Rompimento de corpo de prova", "REPROVADO", null, null, null, null, null, null, null, null), /INVALID_DATA/, "laudo ausente");
    const ens = await rpc(c, "quality_test_register", PA, "Rompimento de corpo de prova", "REPROVADO", null, null, null, "laudo-lab-77", null, null, null, req.id);
    ok(/^ENS-\d{4}$/.test(ens.code), "código ENS");
    await rpc(c, "quality_test_register", PA, "Pendente", "PENDENTE", null, null, null, null, null, null, null, null);
    const reqB = await rpc(await as(U.GESTORB), "quality_requirement_register", PB, "Requisito de B", "norma B", null, null);
    await rejects(rpc(c, "quality_inspection_register", PA, "Req de outro projeto", "PENDENTE", null, null, null, null, null, null, null, reqB.id), /FORBIDDEN/, "requisito de outro projeto");
  });

  await check("CASO 7/8/9/12/13/14) garantia por RPC: vistoria, manutenção (com/sem comprovante), reparo e reincidência; flags de vício oculto/solidez; sem conclusão jurídica", async () => {
    const g = await as(U.GESTOR);
    const w = await mkWar(g, { hidden_defect: true, solidity_safety: true, cause_category: "SOLIDEZ_SEGURANCA", delivered_at: "2024-05-01", discovered_at: "2026-10-20" });
    const row = await wRow(w.id);
    eq([row.hidden_defect, row.solidity_safety, row.cause_category, row.criticality], [true, true, "SOLIDEZ_SEGURANCA", "SEM_DADOS"], "flags de vício oculto e solidez");
    await rpc(g, "quality_warranty_survey_register", w.id, "2026-11-01T12:00:00Z", "Bolhas em 3 paredes, umidade ascendente", "laudo-vistoria-1");
    await rejects(rpc(g, "quality_warranty_survey_register", w.id, "2099-01-01T12:00:00Z", "futuro", null), /INVALID_DATA/, "vistoria no futuro");
    const st = () => rpc(g, "quality_warranty_maintenance_status", w.id);
    eq((await st()).status, "SEM_REGISTRO", "sem registro");
    await rpc(g, "quality_warranty_maintenance_register", w.id, "Limpeza de trilhos (sem nota)", "2026-01-10", null, null, null);
    eq((await st()).status, "SEM_COMPROVANTE", "sem comprovante");
    await rpc(g, "quality_warranty_maintenance_register", w.id, "Revisão anual", "2026-02-10", "Oficina X", "os-123", "https://exemplo.invalid/os-123");
    await rejects(rpc(g, "quality_warranty_maintenance_register", w.id, "link inválido", null, null, null, "ftp://x"), /INVALID_DATA/, "link inválido");
    eq((await st()).withoutProof, 1, "um registro ainda sem comprovante (constatação factual)");
    const r1 = await rpc(g, "quality_warranty_repair_register", w.id, "Repintura parcial", "2026-11-05T12:00:00Z", null, 500, 620, "nf-501", false, null);
    const r2 = await rpc(g, "quality_warranty_repair_register", w.id, "Nova repintura (reincidência)", null, null, null, null, null, true, r1.id);
    eq((await su.query("select is_recurrence, previous_repair_id from public.quality_warranty_repairs where id=$1", [r2.id])).rows[0], { is_recurrence: true, previous_repair_id: r1.id }, "reincidência aponta o reparo anterior");
    const other = await mkWar(g);
    await rejects(rpc(g, "quality_warranty_repair_register", other.id, "x reincidência", null, null, null, null, null, true, r1.id), /INVALID_DATA/, "reparo anterior de OUTRO caso");
    await rpc(g, "quality_consequence_register", null, w.id, "SEGURANCA", "CRITICAL", "DOCUMENTO", "laudo-pos-entrega-9", null, null, null, "isolar a área e escorar", null);
    eq((await wRow(w.id)).criticality, "CRITICAL", "criticidade da garantia = pior pilar");
    const wr = await wRow(w.id);
    ok(!("legal_deadline" in wr) && !("warranty_expired" in wr), "sem conclusão jurídica no schema");
  });

  // =====================================================================================================================
  // F3-D-03) edição de campos: autoridade por campo, justificativa, custo só com fonte
  // =====================================================================================================================
  await check("CASO F3-D-03) COLABORADOR NÃO edita campos/custos do caso de garantia; edita só os descritivos; custo exige fonte; dados de cobertura exigem justificativa; diff e antes/depois auditados", async () => {
    const colab = await as(U.COLAB);
    const g = await as(U.GESTOR);
    const w = await mkWar(g, { delivered_at: "2026-03-10", estimated_cost: 1800.5 });
    let ver = w.rowVersion;
    const upd = (c, changes, just = null, v = ver) => rpc(c, "quality_warranty_case_update", w.id, v, JSON.stringify(changes), just);
    let r = await upd(colab, { defect_description: "Descascamento de tinta com bolhas (revisado)", customer_complaint: "Cliente relata bolhas", supplier_name: "Fornecedor X" });
    ver = r.rowVersion;
    eq(r.changed.sort(), ["customer_complaint", "defect_description", "supplier_name"], "campos descritivos alterados pelo COLABORADOR");
    for (const changes of [{ actual_cost: 250 }, { estimated_cost: 1 }, { cost_source_ref: "x" }, { cause_category: "EXECUCAO" }, { hidden_defect: true }, { delivered_at: "2026-01-01" }, { due_date: "2026-12-31" }, { warranty_terms: "novo termo" }, { responsible_user_id: uid(U.COLAB) }]) {
      await rejects(upd(colab, changes, J), /FORBIDDEN/, `COLABORADOR altera ${Object.keys(changes)[0]}`);
    }
    await rejects(upd(colab, { state: "ENCERRADA" }), /INVALID_DATA/, "campo de estado não é editável");
    await rejects(upd(colab, { criticality: "LOW" }), /INVALID_DATA/, "criticidade não é editável");
    await rejects(upd(colab, { accepted_at: "2026-01-01" }), /INVALID_DATA/, "aceite só pela RPC própria");
    eq((await wRow(w.id)).hidden_defect, false, "nada gravado pelas tentativas");
    // GESTOR: justificativa para dados já informados; custo exige fonte
    await rejects(upd(g, { delivered_at: "2026-01-01" }, null), /JUSTIFICATION_REQUIRED/, "alterar data de entrega já informada sem justificativa");
    await rejects(upd(g, { actual_cost: 250 }, J), /COST_SOURCE_REQUIRED/, "custo sem fonte");
    await rejects(upd(g, { actual_cost: -1, cost_source_ref: "nf" }, J), /INVALID_DATA/, "custo negativo");
    await rejects(upd(g, { due_date: "31/12/2026" }), /INVALID_DATA/, "data inválida");
    await rejects(upd(g, { cause_category: "QUALQUER" }, J), /INVALID_DATA/, "causa inválida");
    await rejects(upd(g, { responsible_user_id: uid(U.ADMINB) }, J), /INVALID_DATA/, "responsável de outro projeto");
    await rejects(upd(g, { hidden_defect: true }, null), /JUSTIFICATION_REQUIRED/, "sinalizador exige justificativa");
    r = await upd(g, { actual_cost: 250, cost_source_ref: "nf-77", supplier_name: "Esquadrias SA", hidden_defect: true, due_date: "2026-12-15" }, J);
    ver = r.rowVersion;
    const row = await wRow(w.id);
    eq([Number(row.actual_cost), row.cost_source_ref, row.supplier_name, row.hidden_defect, String(row.due_date).includes("2026")], [250, "nf-77", "Esquadrias SA", true, true], "gestor edita");
    eq(Number(row.estimated_cost), 1800.5, "campos não enviados permanecem");
    await rejects(upd(g, { supplier_name: "Outra" }, null, ver - 1), /VERSION_CONFLICT/, "versão antiga");
    await rejects(rpc(g, "quality_warranty_case_update", w.id, null, "{}", null), /VERSION_REQUIRED/, "sem versão");
    const same = await upd(g, { supplier_name: "Esquadrias SA" }, null, ver);
    eq([same.unchanged, same.rowVersion], [true, ver], "sem mudança real não consome versão");
    const au = (await su.query("select detail from public.audit_log_entries where action='QUALITY_WARRANTY_UPDATE' and entity_id=$1 order by occurred_at, id", [w.id])).rows.map((x) => JSON.parse(x.detail));
    eq(au.length, 2, "duas edições auditadas (as recusadas não geram auditoria)");
    eq([au[1].before.actual_cost, au[1].after.actual_cost, au[1].justification], [null, 250, J], "antes/depois/justificativa");
    // garantia encerrada/cancelada não é editável
    const c = await mkWar(g);
    await wtrans(g, c.id, "CANCELADA", c.rowVersion, J);
    await rejects(rpc(g, "quality_warranty_case_update", c.id, (await wRow(c.id)).row_version, JSON.stringify({ supplier_name: "x" }), null), /CASE_NOT_ACTIVE/, "garantia cancelada");
  });

  await check("CASO F3-D-03b) RNC: causa raiz/prazo/responsável são MANAGE (justificativa quando já definidos); título/descrição REGISTER; diff no servidor; caso fechado não edita", async () => {
    const colab = await as(U.COLAB);
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const upd = (c, changes, just = null, v = null) => rpc(c, "quality_ncr_update_fields", n.id, v ?? ncrRowVersion, JSON.stringify(changes), just);
    let ncrRowVersion = n.rowVersion;
    let r = await upd(colab, { title: "Título revisado pelo colaborador", description: "nova descrição" });
    ncrRowVersion = r.rowVersion;
    for (const changes of [{ root_cause: "x causa" }, { due_date: "2026-12-31" }, { responsible_user_id: uid(U.COLAB) }]) {
      await rejects(upd(colab, changes, J), /FORBIDDEN/, `COLABORADOR altera ${Object.keys(changes)[0]}`);
    }
    await rejects(upd(colab, { state: "ENCERRADA" }), /INVALID_DATA/, "estado não é editável");
    await rejects(upd(colab, { title: "ab" }), /INVALID_DATA/, "título curto");
    r = await upd(g, { root_cause: "Falha de cura do concreto", due_date: "2026-12-31", responsible_user_id: uid(U.GERENTE) });
    ncrRowVersion = r.rowVersion;
    await rejects(upd(g, { root_cause: "Outra causa" }, null), /JUSTIFICATION_REQUIRED/, "trocar causa raiz já definida exige justificativa");
    r = await upd(g, { root_cause: "Outra causa: traço do concreto" }, J);
    ncrRowVersion = r.rowVersion;
    await rejects(upd(g, { due_date: "2027-01-31" }, J, ncrRowVersion - 1), /VERSION_CONFLICT/, "versão antiga");
    eq((await ncrRow(n.id)).root_cause, "Outra causa: traço do concreto", "causa raiz atual");
    eq((await upd(g, { root_cause: "Outra causa: traço do concreto" })).unchanged, true, "sem mudança");
    const x = await mkNcr(g);
    await ntrans(g, x.id, "CANCELADA", x.rowVersion, J);
    await rejects(rpc(g, "quality_ncr_update_fields", x.id, (await ncrRow(x.id)).row_version, JSON.stringify({ title: "Título novo" }), null), /CASE_NOT_ACTIVE/, "RNC cancelada");
  });

  // =====================================================================================================================
  // CASO 38) concorrência real
  // =====================================================================================================================
  await check("CASO 38) concorrência: duas mudanças de status da MESMA CAPA / duas revisões da MESMA evidência / duas transições da MESMA RNC => uma vence, a outra VERSION_CONFLICT", async () => {
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const a = await capa(g, n.id);
    const [c1, c2] = [await as(U.GESTOR, "authenticated", true), await as(U.COLAB, "authenticated", true)];
    const res = await Promise.allSettled([capaSt(c1, a.id, a.rowVersion, "EM_ANDAMENTO"), capaSt(c2, a.id, a.rowVersion, "EXECUTADA")]);
    eq(res.filter((x) => x.status === "fulfilled").length, 1, "CAPA: exatamente uma vence");
    ok(res.filter((x) => x.status === "rejected").every((x) => /VERSION_CONFLICT/.test(x.reason.message)), "CAPA: a outra falha com VERSION_CONFLICT");

    const e = await ev(g, { ncr: n.id, cls: "INDICIO" });
    const ver = (await su.query("select row_version v from public.quality_evidence where id=$1", [e])).rows[0].v;
    const [m1, m2] = [await as(U.GESTOR, "authenticated", true), await as(U.GERENTE, "authenticated", true)];
    const res2 = await Promise.allSettled([rpc(m1, "quality_evidence_revise", e, ver, "SUSPEITA", "FATO", "a", J), rpc(m2, "quality_evidence_revise", e, ver, "RISCO_POTENCIAL", "FATO", "b", J)]);
    eq(res2.filter((x) => x.status === "fulfilled").length, 1, "evidência: exatamente uma revisão vence");
    ok(res2.filter((x) => x.status === "rejected").every((x) => /VERSION_CONFLICT/.test(x.reason.message)), "evidência: perdedora com VERSION_CONFLICT");

    const t = await mkNcr(g);
    const [t1, t2] = [await as(U.GESTOR, "authenticated", true), await as(U.GERENTE, "authenticated", true)];
    const res3 = await Promise.allSettled([ntrans(t1, t.id, "TRIAGEM", t.rowVersion), ntrans(t2, t.id, "CANCELADA", t.rowVersion, J)]);
    eq(res3.filter((x) => x.status === "fulfilled").length, 1, "transição: exatamente uma vence");
    ok(res3.filter((x) => x.status === "rejected").every((x) => /VERSION_CONFLICT/.test(x.reason.message)), "transição: perdedora com VERSION_CONFLICT");
    eq(await nq("select count(*)::int n from public.quality_state_events where entity_id=$1", [t.id]), 2, "um único evento de transição (criação + vencedora)");
  });

  await check("CASO 38b) concorrência: edição do caso de garantia x transição simultâneas; duas edições de campos da RNC; 10 vínculos idênticos simultâneos => 1 ativo", async () => {
    const g = await as(U.GESTOR);
    const w = await mkWar(g);
    const [a, b] = [await as(U.GESTOR, "authenticated", true), await as(U.GERENTE, "authenticated", true)];
    const res = await Promise.allSettled([
      rpc(a, "quality_warranty_case_update", w.id, w.rowVersion, JSON.stringify({ supplier_name: "A" }), null),
      wtrans(b, w.id, "EM_VISTORIA", w.rowVersion)]);
    eq(res.filter((x) => x.status === "fulfilled").length, 1, "edição x transição: uma vence");
    ok(res.some((x) => x.status === "rejected" && /VERSION_CONFLICT/.test(x.reason.message)), "perdedora VERSION_CONFLICT");
    const n = await mkNcr(g);
    const [c, d] = [await as(U.GESTOR, "authenticated", true), await as(U.GERENTE, "authenticated", true)];
    const res2 = await Promise.allSettled([
      rpc(c, "quality_ncr_update_fields", n.id, n.rowVersion, JSON.stringify({ root_cause: "causa A" }), null),
      rpc(d, "quality_ncr_update_fields", n.id, n.rowVersion, JSON.stringify({ root_cause: "causa B" }), null)]);
    eq(res2.filter((x) => x.status === "fulfilled").length, 1, "duas edições da RNC: uma vence");
    const alert = await mkAlert();
    const conns = await Promise.all(Array.from({ length: 10 }, () => as(U.COLAB, "authenticated", true)));
    const res3 = await Promise.allSettled(conns.map((cn) => rpc(cn, "acc_alert_link_create", alert, "RNC", n.id, null)));
    ok(res3.every((x) => x.status === "fulfilled"), `todas as chamadas idempotentes respondem OK: ${res3.filter((x) => x.status === "rejected").map((x) => x.reason.message)}`);
    eq(res3.filter((x) => x.value.created === true).length, 1, "exatamente uma criou");
    eq(await nq("select count(*)::int n from public.acc_alert_links where alert_case_id=$1 and unlinked_at is null", [alert]), 1, "um vínculo ativo");
  });

  // =====================================================================================================================
  // CASO 37) auditoria
  // =====================================================================================================================
  await check("CASO 37) auditoria: toda RPC autorizada deixa trilha com o ATOR correto na mesma transação; recusada não deixa trilha; audit_log_entries segue append-only", async () => {
    const colab = await as(U.COLAB);
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const base = await nq("select count(*)::int n from public.audit_log_entries where project_id=$1", [PA]);
    const e = await ev(colab, { ncr: n.id, ref: `aud-${uniq()}` });
    const a = await capa(colab, n.id);
    await rpc(colab, "quality_consequence_register", n.id, null, "CUSTO", "LOW", "DOCUMENTO", "orc-aud", null, null, null, null, null);
    await rpc(colab, "quality_cost_register", n.id, null, "MATERIAL", null, 10, null, "nf-aud");
    await rpc(colab, "quality_recurrence_register", n.id, null, (await mkNcr(g)).id, null, "mesma causa raiz no serviço");
    const after = await nq("select count(*)::int n from public.audit_log_entries where project_id=$1", [PA]);
    ok(after - base >= 5, `inserts por RPC geram auditoria (delta ${after - base})`);
    const rows = (await su.query("select entity_type, actor_user_id, actor_type from public.audit_log_entries where project_id=$1 and actor_user_id=$2 and action like '%_INSERT'", [PA, uid(U.COLAB)])).rows;
    for (const t of ["QUALITY_EVIDENCE", "QUALITY_CORRECTIVE_ACTIONS", "QUALITY_CONSEQUENCES", "QUALITY_NONQUALITY_COSTS", "QUALITY_RECURRENCES"]) {
      ok(rows.some((r) => r.entity_type === t && r.actor_type === "USER"), `trilha de ${t} com o colaborador como ator`);
    }
    const before = await nq("select count(*)::int n from public.audit_log_entries");
    for (const f of [async () => rpc(await as(U.LEITURA), "quality_capa_register", n.id, null, "CORRETIVA", "corrigir bem", null, null),
      async () => rpc(colab, "quality_evidence_revise", e, 1, "SUSPEITA", "FATO", null, J),
      async () => rpc(await as(U.ADMINB), "quality_cost_register", n.id, null, "MATERIAL", null, null, null, null)]) {
      await rejects(f(), /FORBIDDEN/, "recusada");
    }
    eq(await nq("select count(*)::int n from public.audit_log_entries"), before, "recusadas não geram trilha");
    await rejects(su.query("update public.audit_log_entries set detail='x' where project_id=$1", [PA]), /append-only/, "auditoria imutável (update)");
    await rejects(su.query("delete from public.audit_log_entries where project_id=$1", [PA]), /append-only/, "auditoria imutável (delete)");
  });

  // =====================================================================================================================
  // CASO 39) isolamento entre projetos
  // =====================================================================================================================
  await check("CASO 39) isolamento: ADMIN/GESTOR de B não registra, revisa, edita, verifica, aceita, vincula nem lê o relatório sobre dados de A (e vice-versa)", async () => {
    const g = await as(U.GESTOR);
    const n = await ncrUntil("VERIFICACAO");
    const w = await warUntil("REPARADA");
    const e = await ev(g, { ncr: n.id });
    const eW = await ev(g, { warranty: w.id });
    const a = await capa(g, n.id);
    const alert = await mkAlert();
    for (const who of [U.ADMINB, U.GESTORB]) {
      const b = await as(who);
      const ops = [
        () => rpc(b, "quality_evidence_register", PA, "DOCUMENTO", "x", "INDICIO", "FATO", n.id, null),
        () => rpc(b, "quality_evidence_register", PB, "DOCUMENTO", "x", "INDICIO", "FATO", n.id, null),
        () => rpc(b, "quality_evidence_revise", e, 1, "SUSPEITA", "FATO", null, J),
        () => rpc(b, "quality_capa_register", n.id, null, "CORRETIVA", "corrigir bem", null, null),
        () => capaSt(b, a.id, a.rowVersion, "EXECUTADA"),
        () => rpc(b, "quality_verification_register", n.id, null, 1, "EFICAZ", "critério de eficácia", e, null, null),
        () => rpc(b, "quality_warranty_acceptance_register", w.id, w.version, "2026-11-10", "Cliente", eW),
        () => rpc(b, "quality_warranty_repair_register", w.id, "Repintura", null, null, null, null, null, false, null),
        () => rpc(b, "quality_consequence_register", n.id, null, "PRAZO", "LOW", "DOCUMENTO", "x", null, null, null, null, null),
        () => rpc(b, "quality_ncr_update_fields", n.id, 1, JSON.stringify({ title: "invasão" }), null),
        () => rpc(b, "quality_warranty_case_update", w.id, w.version, JSON.stringify({ supplier_name: "invasão" }), null),
        () => rpc(b, "quality_closure_integrity_report", PA),
        () => rpc(b, "acc_alert_link_create", alert, "RNC", n.id, null),
        () => rpc(b, "acc_alert_links_for_alert", alert),
        () => rpc(b, "acc_alert_links_for_entity", "RNC", n.id),
      ];
      for (const f of ops) await rejects(f(), /FORBIDDEN/, `perfil ${who} de B sobre dados de A`);
      eq(Number((await b.query("select count(*)::int n from public.quality_evidence where project_id=$1", [PA])).rows[0].n), 0, "B não lê evidências de A");
      eq(Number((await b.query("select count(*)::int n from public.acc_alert_links")).rows[0].n), 0, "B não lê vínculos de A");
    }
    // vínculo cruzado (alerta de A + entidade de B) e vice-versa: sem revelar existência
    const nB = await mkNcr(await as(U.GESTORB), { project: PB });
    await rejects(rpc(g, "acc_alert_link_create", alert, "RNC", nB.id, null), /LINK_TARGET_INVALID/, "entidade de B no alerta de A");
    const alertB = await mkAlert(PB);
    await rejects(rpc(await as(U.GESTORB), "acc_alert_link_create", alertB, "RNC", n.id, null), /LINK_TARGET_INVALID/, "entidade de A no alerta de B");
    await rejects(rpc(g, "acc_alert_link_create", alert, "RNC", "00000000-0000-4000-8000-00000000dead", null), /LINK_TARGET_INVALID/, "entidade inexistente (mesma mensagem: sem vazamento)");
    // a garantia/RNC/evidência de A não aceitam FK cruzada vindo de B nem por superusuário (FK composta)
    await rejects(su.query("insert into public.acc_alert_links (project_id,alert_case_id,entity_type,entity_id,created_by) values ($1,$2,'RNC',$3,$4)", [PB, alert, nB.id, uid(U.GESTORB)]), /foreign key|violates/i, "FK composta alerta x projeto");
  });

  // =====================================================================================================================
  // VÍNCULOS ESTRUTURADOS
  // =====================================================================================================================
  await check("CASO F3-D-10) vínculos: criar (REGISTER), idempotente, desvincular só MANAGE com motivo, histórico append-only, relinkar cria nova linha, escrita direta negada", async () => {
    const colab = await as(U.COLAB);
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const w = await mkWar(g);
    const claim = await mkClaim();
    const alert = await mkAlert();
    const stateBefore = (await ncrRow(n.id)).row_version;
    const l1 = await rpc(colab, "acc_alert_link_create", alert, "RNC", n.id, "origem do alerta");
    eq(l1.created, true, "criado");
    eq((await rpc(colab, "acc_alert_link_create", alert, "RNC", n.id, null)).created, false, "idempotente");
    await rpc(colab, "acc_alert_link_create", alert, "GARANTIA", w.id, null);
    await rpc(colab, "acc_alert_link_create", alert, "SINISTRO", claim, null);
    await rejects(rpc(colab, "acc_alert_link_create", alert, "CONTRATO", n.id, null), /INVALID_DATA/, "tipo inválido");
    await rejects(rpc(colab, "acc_alert_link_create", alert, "GARANTIA", n.id, null), /LINK_TARGET_INVALID/, "id de RNC como GARANTIA");
    eq((await ncrRow(n.id)).row_version, stateBefore, "vincular não consome versão da RNC");
    const list = await rpc(await as(U.LEITURA), "acc_alert_links_for_alert", alert);
    eq(list.map((x) => x.entityType).sort(), ["GARANTIA", "RNC", "SINISTRO"], "leitura por alerta (LEITURA)");
    const back = await rpc(await as(U.LEITURA), "acc_alert_links_for_entity", "RNC", n.id);
    eq([back.length, back[0].alertCaseId], [1, alert], "leitura por entidade");
    await rejects(rpc(colab, "acc_alert_link_unlink", l1.id, J), /FORBIDDEN/, "COLABORADOR desvincula");
    await rejects(rpc(g, "acc_alert_link_unlink", l1.id, "curto"), /JUSTIFICATION_REQUIRED/, "sem motivo");
    await rpc(g, "acc_alert_link_unlink", l1.id, "Vínculo criado por engano no alerta errado");
    await rejects(rpc(g, "acc_alert_link_unlink", l1.id, "Vínculo criado por engano no alerta errado"), /INVALID_STATE/, "já desvinculado");
    const row = (await su.query("select * from public.acc_alert_links where id=$1", [l1.id])).rows[0];
    eq([row.unlinked_by, row.unlink_reason !== null, row.unlinked_at !== null], [uid(U.GESTOR), true, true], "desvínculo registrado");
    const l2 = await rpc(colab, "acc_alert_link_create", alert, "RNC", n.id, "refeito");
    ok(l2.created && l2.id !== l1.id, "relinkar cria NOVA linha (histórico preservado)");
    eq(await nq("select count(*)::int n from public.acc_alert_links where alert_case_id=$1 and entity_id=$2", [alert, n.id]), 2, "duas linhas (uma desvinculada, uma ativa)");
    eq(await nq("select count(*)::int n from public.acc_alert_links where alert_case_id=$1 and entity_id=$2 and unlinked_at is null", [alert, n.id]), 1, "uma ativa (unicidade)");
    eq((await su.query("select event from public.acc_alert_link_events where link_id=$1 order by seq", [l1.id])).rows.map((r) => r.event), ["LINKED", "UNLINKED"], "eventos do vínculo");
    // imutabilidade
    await rejects(su.query("update public.acc_alert_links set entity_id=$1 where id=$2", [w.id, l2.id]), /LINK_IMMUTABLE/, "alterar entidade");
    await rejects(su.query("update public.acc_alert_links set unlink_reason='x' where id=$1", [l1.id]), /LINK_IMMUTABLE|check/i, "reescrever vínculo desfeito");
    await rejects(su.query("delete from public.acc_alert_links where id=$1", [l1.id]), /append-only/, "apagar vínculo");
    await rejects(su.query("update public.acc_alert_link_events set detail='x'"), /append-only/, "editar evento");
    await rejects(su.query("delete from public.acc_alert_link_events"), /append-only/, "apagar evento");
    for (const [label, uidn, role] of [["ADMIN", U.ADMIN, "authenticated"], ["GESTOR", U.GESTOR, "authenticated"], ["ANON", null, "anon"]]) {
      const c = await as(uidn, role);
      for (const sql of ["insert into public.acc_alert_links default values", "update public.acc_alert_links set note='x'", "delete from public.acc_alert_links", "insert into public.acc_alert_link_events default values"]) {
        await rejects(c.query(sql), /permission denied/i, `${label}: ${sql}`);
      }
    }
    await rejects((await as(null, "anon")).query("select * from public.acc_alert_links"), /permission denied/i, "anon lê");
    await rejects(rpc(await as(null, "anon"), "acc_alert_link_create", alert, "RNC", n.id, null), /permission denied/i, "anon cria");
    await rejects(rpc(await as(null, "authenticated"), "acc_alert_link_create", alert, "RNC", n.id, null), /AUTH_REQUIRED/, "sem sub");
    const a = (await su.query("select action from public.audit_log_entries where entity_type='ACC_ALERT_LINK' order by occurred_at, id")).rows.map((r) => r.action);
    ok(a.includes("ACC_ALERT_LINK_CREATE") && a.includes("ACC_ALERT_LINK_UNLINK"), "auditoria do vínculo/desvínculo");
  });

  await check("CASO F3-D-11) backfill da convenção 'ALERTA:<id>': conservador (ambíguo/inexistente/outro projeto ignorados), idempotente, respeita desvínculo humano, não altera o texto original", async () => {
    const aA1 = await mkAlert(); const aA2 = await mkAlert(); const aB1 = await mkAlert(PB);
    const missing = "99999999-9999-4999-8999-999999999999";
    const mk = async (ref, project = PA) => (await su.query("insert into public.quality_ncrs (project_id,code,title,origin_type,origin_ref,origin_key) values ($1,$2,'RNC legada','EMAIL',$3,$4) returning id, origin_ref", [project, `RNC-L${uniq()}`.slice(0, 20), ref, `EMAIL:${uniq()}`])).rows[0];
    const nOk = await mk(`ALERTA:${aA1}`);
    const nAmb = await mk(`ALERTA:${aA1} e também ALERTA:${aA2}`);
    const nMiss = await mk(`ALERTA:${missing}`);
    const nOther = await mk(`ALERTA:${aB1}`);
    const nCode = await mk("ACC-ALERTA:ABCD1234 (código curto não é UUID)");
    const nSame = await mk(`ALERTA:${aA1} repetido ALERTA:${aA1}`);   // mesmo UUID duas vezes = 1 UUID distinto => vincula
    const wOk = (await su.query("insert into public.quality_warranty_cases (project_id,code,service_system,defect_description,origin_type,origin_ref) values ($1,$2,'pintura','defeito legado','EMAIL',$3) returning id", [PA, `GAR-L${uniq()}`.slice(0, 20), `alerta: ${aA2}`])).rows[0].id;
    const nEv = await mk("origem sem alerta");
    await su.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'EMAIL',$3,'INDICIO')", [PA, nEv.id, `ALERTA:${aA2} (encaminhado)`]);
    const claim = await mkClaim(PA, `ALERTA:${aA1}`);
    const before = (await su.query("select id, origin_ref from public.quality_ncrs where id = any($1)", [[nOk.id, nAmb.id, nMiss.id, nOther.id, nCode.id, nSame.id]])).rows;
    const r1 = (await su.query("select public.acc_alert_links_backfill() r")).rows[0].r;
    eq([r1.linked, r1.skippedAmbiguous, r1.skippedAlertNotFound, r1.skippedOtherProject], [5, 1, 1, 1], `contagens do backfill: ${JSON.stringify(r1)}`);
    const reasons = r1.skipped.map((s) => s.reason).sort();
    eq(reasons, ["ALERT_IN_OTHER_PROJECT", "ALERT_NOT_FOUND", "AMBIGUOUS_MULTIPLE_UUIDS"], "motivos relatados");
    const linked = (await su.query("select entity_type, entity_id, alert_case_id, link_source, source_ref, created_by from public.acc_alert_links where link_source='BACKFILL_CONVENTION' and alert_case_id = any($1)", [[aA1, aA2]])).rows;
    const has = (t, id, al) => linked.some((l) => l.entity_type === t && l.entity_id === id && l.alert_case_id === al);
    ok(has("RNC", nOk.id, aA1) && has("RNC", nSame.id, aA1) && has("GARANTIA", wOk, aA2) && has("RNC", nEv.id, aA2) && has("SINISTRO", claim, aA1), `vínculos esperados: ${JSON.stringify(linked.map((l) => [l.entity_type, l.alert_case_id === aA1 ? "A1" : "A2"]))}`);
    ok(!linked.some((l) => [nAmb.id, nMiss.id, nOther.id, nCode.id].includes(l.entity_id)), "ambíguo/inexistente/outro projeto/código curto NÃO vinculados");
    ok(linked.every((l) => l.created_by === null && /\[quality_|\[insurance_/.test(l.source_ref)), "rastreabilidade: sem autor humano e fonte registrada");
    eq((await su.query("select id, origin_ref from public.quality_ncrs where id = any($1)", [[nOk.id, nAmb.id, nMiss.id, nOther.id, nCode.id, nSame.id]])).rows, before, "texto original intacto");
    // idempotência
    const r2 = (await su.query("select public.acc_alert_links_backfill() r")).rows[0].r;
    eq([r2.linked, r2.alreadyHandled], [0, 5], `segunda execução não cria nada: ${JSON.stringify(r2)}`);
    // respeita a decisão humana
    const l = (await su.query("select id from public.acc_alert_links where entity_id=$1 and alert_case_id=$2", [nOk.id, aA1])).rows[0].id;
    await rpc(await as(U.GESTOR), "acc_alert_link_unlink", l, "Vínculo textual não corresponde à origem real");
    const r3 = (await su.query("select public.acc_alert_links_backfill() r")).rows[0].r;
    eq(r3.linked, 0, "não recria vínculo desfeito por humano");
    eq(await nq("select count(*)::int n from public.acc_alert_links where entity_id=$1 and unlinked_at is null", [nOk.id]), 0, "continua desvinculado");
    // backfill não é chamável por clientes
    await rejects((await as(U.ADMIN)).query("select public.acc_alert_links_backfill()"), /permission denied/i, "authenticated");
    await rejects((await as(null, "service_role")).query("select public.acc_alert_links_backfill()"), /permission denied/i, "service_role");
    // a camada de aplicação lê a tabela por RPC (RLS): o vínculo estruturado aparece para um membro
    const via = await rpc(await as(U.LEITURA), "acc_alert_links_for_alert", aA1);
    ok(via.some((x) => x.entityId === nSame.id && x.linkSource === "BACKFILL_CONVENTION"), "leitura do vínculo retroativo");
  });

  // =====================================================================================================================
  // F3-D-19) reversibilidade e retrocompatibilidade
  // =====================================================================================================================
  await check("CASO F3-D-19) reversível e retrocompatível: o rollback documentado devolve os GRANTs diretos da fase 1 (sem perda de dados); reaplicar a migration fecha de novo; RPCs da fase 1 intactas", async () => {
    const counts = async () => (await nq("select (select count(*) from public.quality_evidence)+(select count(*) from public.quality_ncrs)+(select count(*) from public.quality_warranty_cases)+(select count(*) from public.quality_corrective_actions) n"));
    const before = await counts();
    const rb = readFileSync(path.join(here, "..", "supabase", "rollbacks", "20261123302000_quality_revoke_direct_writes.rollback.sql"), "utf8");
    await su.query(rb);
    const g = await as(U.GESTOR);
    const n = await mkNcr(g);
    const direct = await g.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'DOCUMENTO',$3,'INDICIO') returning id", [PA, n.id, `rb-${uniq()}`]);
    ok(direct.rows[0].id, "com o rollback o INSERT direto volta (comportamento da fase 1)");
    eq((await g.query("update public.quality_evidence set classification='SUSPEITA' where id=$1 returning classification", [direct.rows[0].id])).rows[0].classification, "SUSPEITA", "UPDATE por coluna volta");
    await rejects(g.query("update public.quality_ncrs set state='ENCERRADA' where id=$1", [n.id]), /permission denied/i, "estado continua sem GRANT mesmo no modo fase 1");
    ok((await counts()) >= before, "nenhum dado perdido");
    await su.query(read(MINE.find((f) => /302000/.test(f))));
    cache.clear();
    const g2 = await as(U.GESTOR);
    await rejects(g2.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'DOCUMENTO','x','INDICIO')", [PA, n.id]), /permission denied/i, "reaplicar a migration fecha de novo");
    // RPCs da fase 1 seguem íntegras
    const r = await ntrans(g2, n.id, "TRIAGEM", n.rowVersion);
    eq(r.to, "TRIAGEM", "quality_ncr_transition (fase 1) funciona");
    eq((await rpc(g2, "quality_closure_readiness", "NCR", n.id)).ready, false, "quality_closure_readiness (fase 1) funciona");
  });
} finally {
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
