// FASE 3 / B — PERMISSÕES UNIFICADAS (acc_project_tier) em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa
// base descartável (acc_perm_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role) e dados 100% SINTÉTICOS.
// Cobre CASO 31 (usuário sem autorização), CASO 37 (auditoria) e CASO 39 (isolamento entre projetos) para Qualidade, Garantias e
// Seguros: matriz perfil x operação crítica (LEITURA, COLABORADOR, GESTOR, GERENTE, ADMINISTRADOR, inativo, pendente, outro
// projeto, anon, authenticated sem sub, service_role sem sub), paridade SQL x TS, equivalência com as definições ANTERIORES e
// idempotência. NÃO roda no CI.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-permissoes-unificadas-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
register("./ts-module-resolver.mjs", import.meta.url);
const T = await import("../apps/web/lib/permissions/project-tier.ts");
const IP = await import("../apps/web/lib/insurance-ui/permissions.ts");
const Q = await import("../apps/web/lib/quality/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^202611231\d{5}_/.test(f));
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

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_perm_${Date.now().toString(36)}`;
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
    try { await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  for (let i = 0; i < 2; i += 1) for (const f of MINE) await su.query(readFileSync(path.join(dir, f), "utf8")); // idempotência (2 reaplicações)
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 3/B reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(2300 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000023a0";
  const PB = "10000000-0000-4000-8000-0000000023b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, PENDENTE: 7, ADMINB: 8 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `perm-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `Perm ${n}`, `perm-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','PMA','C','L','2026-01-01','2027-01-01'),($2,'Obra B','PMB','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  // PENDENTE: convite pendente (sem membership) — convite NÃO concede acesso.
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [PA, `perm-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const rpc = async (c, fn, ...args) => {
    const ph = args.map((_, i) => `$${i + 1}`).join(",");
    return (await c.query(`select public.${fn}(${ph}) as r`, args)).rows[0].r;
  };
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);

  // Perfis avaliados: [rótulo, usuário, role db, nível esperado em PA]
  const PROFILES = [
    ["LEITURA", U.LEITURA, "authenticated", "READ"],
    ["COLABORADOR", U.COLAB, "authenticated", "REGISTER"],
    ["GESTOR", U.GESTOR, "authenticated", "MANAGE"],
    ["GERENTE", U.GERENTE, "authenticated", "MANAGE"],
    ["ADMINISTRADOR", U.ADMIN, "authenticated", "ADMIN"],
    ["INATIVO", U.INATIVO, "authenticated", "NONE"],
    ["PENDENTE", U.PENDENTE, "authenticated", "NONE"],
    ["OUTRO_PROJETO", U.ADMINB, "authenticated", "NONE"],
    ["AUTHENTICATED_SEM_SUB", null, "authenticated", "NONE"],
  ];
  const RANK = { NONE: 0, READ: 1, REGISTER: 2, MANAGE: 3, ADMIN: 4 };
  const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security/i;

  // ======================= acc_project_tier =======================
  await check("acc_project_tier: nível correto por perfil (inclui inativo, pendente, outro projeto, sem sub); fail-closed com projeto nulo/inexistente", async () => {
    for (const [label, n, role, exp] of PROFILES) {
      const c = await as(n, role);
      eq((await c.query("select public.acc_project_tier($1) t", [PA])).rows[0].t, exp, `tier de ${label} em A`);
      eq((await c.query("select public.acc_project_tier(null) t")).rows[0].t, "NONE", `projeto nulo (${label})`);
      eq((await c.query("select public.acc_project_tier(gen_random_uuid()) t")).rows[0].t, "NONE", `projeto inexistente (${label})`);
    }
    eq((await (await as(U.ADMIN)).query("select public.acc_project_tier($1) t", [PB])).rows[0].t, "NONE", "ADMIN de A em B");
    eq((await (await as(U.ADMINB)).query("select public.acc_project_tier($1) t", [PB])).rows[0].t, "ADMIN", "ADMIN de B em B");
  });

  await check("acc_project_tier: anon sem EXECUTE; service_role sem sub => NONE (ou sem EXECUTE); STABLE, SECURITY DEFINER, search_path vazio", async () => {
    try { await (await as(null, "anon")).query("select public.acc_project_tier($1)", [PA]); throw new Error("anon executou"); }
    catch (e) { ok(/permission denied/i.test(e.message), `anon: ${e.message}`); }
    try {
      eq((await (await as(null, "service_role")).query("select public.acc_project_tier($1) t", [PA])).rows[0].t, "NONE", "service_role sem sub");
    } catch (e) { ok(/permission denied/i.test(e.message), `service_role: ${e.message}`); }
    const f = (await su.query("select provolatile, prosecdef, proconfig, has_function_privilege('public','public.acc_project_tier(uuid)','execute') pub, has_function_privilege('authenticated','public.acc_project_tier(uuid)','execute') auth from pg_proc where oid='public.acc_project_tier(uuid)'::regprocedure")).rows[0];
    eq(f.provolatile, "s", "STABLE"); ok(f.prosecdef, "security definer"); eq(f.proconfig, ["search_path=\"\""], "search_path vazio");
    eq([f.pub, f.auth], [false, true], "EXECUTE: PUBLIC não, authenticated sim");
  });

  // ======================= wrappers: matriz + equivalência com as definições anteriores =======================
  // Listas de papéis das DEFINIÇÕES ANTERIORES (20261122100000 / 20261122200000), copiadas aqui como oráculo independente.
  const OLD = {
    quality_can_read: (p) => !!p,
    quality_can_register: (p) => ["ADMINISTRADOR", "GERENTE", "GESTOR", "COLABORADOR"].includes(p),
    quality_can_manage: (p) => ["ADMINISTRADOR", "GERENTE", "GESTOR"].includes(p),
    READ: () => true,
    REGISTER: (p) => ["ADMINISTRADOR", "ADMIN", "GESTOR", "GERENTE", "COLABORADOR", "EDITOR"].includes(p),
    MANAGE: (p) => ["ADMINISTRADOR", "ADMIN", "GESTOR", "GERENTE"].includes(p),
    ADMIN: (p) => ["ADMINISTRADOR", "ADMIN"].includes(p),
  };
  await check("wrappers quality_can_* / insurance_access: resultado == nível da matriz == definições anteriores, para todos os perfis", async () => {
    const roleOf = { LEITURA: "LEITURA", COLABORADOR: "COLABORADOR", GESTOR: "GESTOR", GERENTE: "GERENTE", ADMINISTRADOR: "ADMINISTRADOR" };
    for (const [label, n, role, exp] of PROFILES) {
      const c = await as(n, role);
      const active = roleOf[label] ?? null; // papel de membership ACTIVE (null = sem acesso)
      const q = (await c.query("select public.quality_can_read($1) r, public.quality_can_register($1) g, public.quality_can_manage($1) m", [PA])).rows[0];
      eq([q.r, q.g, q.m], [RANK[exp] >= 1, RANK[exp] >= 2, RANK[exp] >= 3], `quality_can_* de ${label}`);
      eq([q.r, q.g, q.m], [OLD.quality_can_read(active), OLD.quality_can_register(active), OLD.quality_can_manage(active)], `quality_can_* ${label} == definição anterior`);
      for (const lvl of ["READ", "REGISTER", "MANAGE", "ADMIN"]) {
        const v = (await c.query("select public.insurance_access($1,$2) v", [PA, lvl])).rows[0].v;
        eq(v, RANK[exp] >= RANK[lvl], `insurance_access(${lvl}) de ${label}`);
        eq(v, !!active && OLD[lvl](active), `insurance_access(${lvl}) ${label} == definição anterior`);
      }
      eq((await c.query("select public.insurance_access($1,'XPTO') v", [PA])).rows[0].v, false, `nível desconhecido (${label})`);
      eq((await c.query("select public.insurance_access($1,null) v", [PA])).rows[0].v, false, `nível nulo (${label})`);
      eq((await c.query("select public.insurance_access(null,'READ') v")).rows[0].v, false, `projeto nulo (${label})`);
    }
  });

  await check("wrappers: SECURITY DEFINER/search_path/GRANTs preservados (anon sem EXECUTE; authenticated com)", async () => {
    for (const sig of ["quality_can_read(uuid)", "quality_can_register(uuid)", "quality_can_manage(uuid)", "insurance_access(uuid,text)"]) {
      const f = (await su.query(`select prosecdef, proconfig, has_function_privilege('anon','public.${sig}','execute') anon, has_function_privilege('authenticated','public.${sig}','execute') auth from pg_proc where oid='public.${sig}'::regprocedure`)).rows[0];
      ok(f.prosecdef, `${sig} definer`); eq(f.proconfig, ["search_path=\"\""], `${sig} search_path`); eq([f.anon, f.auth], [false, true], `${sig} grants`);
    }
    const body = (await su.query("select prosrc from pg_proc where oid='public.insurance_access(uuid,text)'::regprocedure")).rows[0].prosrc;
    ok(/acc_project_tier/.test(body), "insurance_access delega a acc_project_tier");
    for (const fn of ["quality_can_read", "quality_can_register", "quality_can_manage"]) {
      ok(/acc_project_tier/.test((await su.query("select prosrc from pg_proc where proname=$1", [fn])).rows[0].prosrc), `${fn} delega`);
    }
  });

  await check("PARIDADE SQL x TS: projectTierFor / hasInsuranceLevel / roleSatisfies == acc_project_tier para todos os papéis (inclui legados e desconhecido)", async () => {
    // base descartável: afrouxa o CHECK só para provar o mapeamento dos papéis legados/desconhecido (impossíveis em produção)
    await su.query("alter table public.project_memberships drop constraint project_memberships_permission_check");
    const PC = "10000000-0000-4000-8000-0000000023c0";
    await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra C','PMC','C','L','2026-01-01','2027-01-01')", [PC]);
    const roles = ["ADMINISTRADOR", "ADMIN", "GESTOR", "GERENTE", "COLABORADOR", "EDITOR", "LEITURA", "VIEWER", "XPTO"];
    const base = 20;
    for (const [i, r] of roles.entries()) {
      const n = base + i;
      await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `perm-${n}@axion.com.br`]);
      await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `Perm ${n}`, `perm-${n}@axion.com.br`]);
      await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [PC, uid(n), r]);
      const c = await as(n);
      const sql = (await c.query("select public.acc_project_tier($1) t, public.quality_can_register($1) g, public.quality_can_manage($1) m, public.insurance_access($1,'REGISTER') ir, public.insurance_access($1,'MANAGE') im, public.insurance_access($1,'ADMIN') ia, public.insurance_access($1,'READ') iread", [PC])).rows[0];
      eq(sql.t, T.projectTierFor(r), `tier SQL x TS (${r})`);
      eq([sql.g, sql.m], [Q.roleSatisfies(r, "REGISTER"), Q.roleSatisfies(r, "MANAGE")], `roleSatisfies x quality_can_* (${r})`);
      eq([sql.iread, sql.ir, sql.im, sql.ia], ["READ", "REGISTER", "MANAGE", "ADMIN"].map((l) => IP.hasInsuranceLevel(r, l)), `hasInsuranceLevel x insurance_access (${r})`);
    }
    eq(T.projectTierFor("ADMINISTRADOR", "INACTIVE"), "NONE", "TS: inativo => NONE");
    eq(T.projectTierFor(null), "NONE", "TS: sem papel => NONE");
    eq(T.rolesAtLeast("MANAGE").sort(), ["ADMIN", "ADMINISTRADOR", "GERENTE", "GESTOR"], "TS: papéis MANAGE+");
    await su.query("set session_replication_role = replica"); // base descartável: ignora o gatilho "último administrador" só para limpar
    await su.query("delete from public.project_memberships where project_id=$1", [PC]);
    await su.query("set session_replication_role = origin");
    await su.query("alter table public.project_memberships add constraint project_memberships_permission_check check (permission in ('ADMINISTRADOR', 'GESTOR', 'GERENTE', 'COLABORADOR', 'LEITURA'))");
  });

  // ======================= matriz perfil x operação crítica (autorização NEGATIVA) =======================
  // Cada operação cria o seu próprio pré-requisito (como ADMIN) e exerce a operação como o perfil avaliado.
  const admC = async () => as(U.ADMIN);
  const seq = { n: 0 };
  const uniq = () => `${Date.now().toString(36)}-${(seq.n += 1)}`;
  const POL = { modality: "SEGURO_GARANTIA_EXECUTANTE", insurer_name: "Seguradora Sintética SA", policy_number: "PERM-001", coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000, status: "VIGENTE" };
  const doc = async () => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO','Doc sintético') returning id", [PA])).rows[0].id;
  const mkPolicy = async () => rpc(await admC(), "insurance_policy_create", PA, JSON.stringify({ ...POL, policy_number: `P-${uniq()}`, source_document_id: await doc() }));
  const mkClaim = async (stage = "AVISO") => rpc(await admC(), "insurance_claim_open", PA, JSON.stringify({ claim_kind: "OUTRO", title: "Evento sintético", stage, policy_id: (await mkPolicy()).id, source_ref: `c-${uniq()}` }));
  const mkNcr = async () => rpc(await as(U.GESTOR), "quality_ncr_create", PA, `RNC ${uniq()}`, "descrição", "EMAIL", `ref-${uniq()}`);
  const mkEndorsement = async () => { const p = await mkPolicy(); return rpc(await admC(), "insurance_endorsement_request", p.id, JSON.stringify({ requested_text: "Inclusão do beneficiário X", request_ref: `r-${uniq()}` })); };
  const mkDraft = async () => rpc(await admC(), "insurance_draft_create", PA, JSON.stringify({ policy_id: (await mkPolicy()).id, draft_kind: "AVISO_SINISTRO", subject: "Minuta sintética", body: "Texto de minuta sintética para teste de permissão." }));

  // [nome, nível exigido, setup(), run(c, ctx)]
  const OPS = [
    ["Q: registrar RNC (quality_ncr_create)", "REGISTER", async () => ({}), (c) => rpc(c, "quality_ncr_create", PA, `RNC ${uniq()}`, "d", "EMAIL", `ref-${uniq()}`)],
    ["Q: abrir caso de garantia (quality_warranty_create)", "REGISTER", async () => ({}), (c) => rpc(c, "quality_warranty_create", PA, "Pintura", "Descolamento sintético", JSON.stringify({ origin_ref: `w-${uniq()}` }))],
    ["Q: avançar triagem da RNC (DETECTADA->TRIAGEM)", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_ncr_transition", x.id, "TRIAGEM", x.rowVersion, null, null, null)],
    ["Q: cancelar RNC (decisão de gestão)", "MANAGE", async () => mkNcr(), (c, x) => rpc(c, "quality_ncr_transition", x.id, "CANCELADA", x.rowVersion, "Justificativa suficiente de teste.", null, null)],
    ["Q: registrar evidência (quality_evidence_register; INSERT direto revogado na fase 3/D)", "REGISTER", async () => mkNcr(), (c, x) => rpc(c, "quality_evidence_register", PA, "DOCUMENTO", `ev-${uniq()}`, "NC_COMPROVADA", "FATO", x.id)],
    ["S: cadastrar apólice (insurance_policy_create)", "MANAGE", async () => ({ d: await doc() }), (c, x) => rpc(c, "insurance_policy_create", PA, JSON.stringify({ ...POL, policy_number: `P-${uniq()}`, source_document_id: x.d }))],
    ["S: cadastrar canal oficial (insurance_channel_register)", "MANAGE", async () => ({}), (c) => rpc(c, "insurance_channel_register", PA, JSON.stringify({ channel_kind: "EMAIL", address: "sinistros@seguradora-sintetica.example", source_ref: `s-${uniq()}`, institution_name: "Seguradora Sintética" }))],
    ["S: cadastrar fiança bancária (bank_guarantee_register)", "MANAGE", async () => ({}), (c) => rpc(c, "bank_guarantee_register", PA, JSON.stringify({ bank_name: "Banco Sintético", source_ref: `b-${uniq()}` }))],
    ["S: solicitar endosso (insurance_endorsement_request)", "REGISTER", async () => mkPolicy(), (c, x) => rpc(c, "insurance_endorsement_request", x.id, JSON.stringify({ requested_text: "Inclusão de beneficiário", request_ref: `r-${uniq()}` }))],
    ["S: pôr endosso em análise (EM_ANALISE)", "REGISTER", async () => mkEndorsement(), (c, x) => rpc(c, "insurance_endorsement_advance", x.id, x.rowVersion, "EM_ANALISE", "{}")],
    ["S: emitir/conferir endosso (EMITIDO)", "MANAGE", async () => mkEndorsement(), (c, x) => rpc(c, "insurance_endorsement_advance", x.id, x.rowVersion, "EMITIDO", "{}")],
    ["S: registrar adiantamento (insurance_advance_register)", "REGISTER", async () => ({}), (c) => rpc(c, "insurance_advance_register", PA, JSON.stringify({ amount: 1000, description: "Adiantamento sintético", source_ref: `a-${uniq()}` }))],
    ["S: abrir aviso/sinistro (insurance_claim_open)", "REGISTER", async () => mkPolicy(), (c, x) => rpc(c, "insurance_claim_open", PA, JSON.stringify({ claim_kind: "OUTRO", title: "Aviso sintético", stage: "AVISO", policy_id: x.id, source_ref: `c-${uniq()}` }))],
    ["S: avançar sinistro para REGULACAO (andamento operacional)", "REGISTER", async () => mkClaim(), (c, x) => rpc(c, "insurance_claim_advance", x.id, x.rowVersion, "REGULACAO", JSON.stringify({ note: "Seguradora iniciou regulação" }))],
    ["S: encerrar sinistro (ENCERRADO = ato de gestão)", "MANAGE", async () => mkClaim(), (c, x) => rpc(c, "insurance_claim_advance", x.id, x.rowVersion, "ENCERRADO", JSON.stringify({ note: "Encerrado conforme carta da seguradora" }))],
    ["S: registrar negativa de cobertura (NEGATIVA = ato de gestão)", "MANAGE", async () => mkClaim("RECLAMACAO"), (c, x) => rpc(c, "insurance_claim_advance", x.id, x.rowVersion, "NEGATIVA", JSON.stringify({ note: "Seguradora negou: alega exclusão (carta anexa)" }))],
    ["S: criar minuta de comunicação (insurance_draft_create)", "REGISTER", async () => mkPolicy(), (c, x) => rpc(c, "insurance_draft_create", PA, JSON.stringify({ policy_id: x.id, draft_kind: "AVISO_SINISTRO", subject: "Minuta", body: "Texto de minuta sintética para teste." }))],
    ["S: aprovar minuta (insurance_draft_approve)", "ADMIN", async () => mkDraft(), (c, x) => rpc(c, "insurance_draft_approve", x.id, x.rowVersion, "APROVO O CONTEUDO PARA ENVIO")],
    ["S: tentar envio real (insurance_draft_attempt_send; trava fail-closed)", "REGISTER", async () => mkDraft(), (c, x) => rpc(c, "insurance_draft_attempt_send", x.id)],
    ["S: sincronizar dossiê (insurance_dossier_sync)", "MANAGE", async () => mkPolicy(), (c, x) => rpc(c, "insurance_dossier_sync", x.id, JSON.stringify([]))],
  ];

  for (const [name, level, setup, run, opts] of OPS) {
    await check(`CASO 31) ${name} — exige ${level}: só perfis >= ${level} passam; demais recusados sem efeito`, async () => {
      // service_role tem BYPASSRLS por desenho (chave de servidor, nunca no frontend): em acesso direto a tabela não é avaliado por RLS.
      for (const [label, n, role, tier] of [...PROFILES, ["ANON", null, "anon", "NONE"], ...(opts?.direct ? [] : [["SERVICE_ROLE_SEM_SUB", null, "service_role", "NONE"]])]) {
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

  await check("CASO 31) autorização negativa não deixa efeito: contagens inalteradas após tentativas de todos os perfis sem autorização", async () => {
    const tables = ["quality_ncrs", "quality_warranty_cases", "quality_evidence", "insurance_policies", "bank_guarantees", "insurance_official_channels", "insurance_endorsements", "insurance_advances", "insurance_claims", "insurance_drafts"];
    const snap = async () => { const o = {}; for (const t of tables) o[t] = await nq(`select count(*)::int n from public.${t}`); return o; };
    const before = await snap();
    for (const [label, n, role] of [["LEITURA", U.LEITURA, "authenticated"], ["INATIVO", U.INATIVO, "authenticated"], ["PENDENTE", U.PENDENTE, "authenticated"], ["OUTRO", U.ADMINB, "authenticated"], ["SEM_SUB", null, "authenticated"], ["ANON", null, "anon"]]) {
      const c = await as(n, role);
      for (const [, , , run] of OPS.filter(([, lv]) => RANK[lv] >= RANK.REGISTER)) { try { await run(c, await (async () => ({ id: "00000000-0000-4000-8000-000000000000", rowVersion: 1, d: null }))()); } catch { /* esperado */ } }
      void label;
    }
    eq(await snap(), before, "nenhuma linha criada por perfil sem autorização");
  });

  // ======================= leitura =======================
  await check("CASO 31) leitura: todo membro ACTIVE lê Qualidade/Seguros do próprio projeto; inativo, pendente, outro projeto, sem sub e anon não leem nada", async () => {
    await mkNcr(); await mkPolicy();
    for (const [label, n, role, tier] of [...PROFILES, ["ANON", null, "anon", "NONE"]]) {
      const c = await as(n, role);
      for (const t of ["quality_ncrs", "insurance_policies"]) {
        let cnt = null; let err = null;
        try { cnt = Number((await c.query(`select count(*)::int n from public.${t} where project_id=$1`, [PA])).rows[0].n); } catch (e) { err = e; }
        if (RANK[tier] >= RANK.READ) ok(!err && cnt > 0, `${label} deveria ler ${t} (cnt=${cnt}, err=${err?.message})`);
        else ok(err ? /permission denied/i.test(err.message) : cnt === 0, `${label} NÃO deveria ler ${t} (cnt=${cnt})`);
      }
    }
  });

  // ======================= CASO 39: isolamento entre projetos =======================
  await check("CASO 39) isolamento: ADMINISTRADOR de B não lê, não cria, não transiciona nem referencia dados de A; ADMIN de A idem em B", async () => {
    const polB = await rpc(await as(U.ADMINB), "insurance_policy_create", PB, JSON.stringify({ ...POL, policy_number: "B-1", source_document_id: (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO','Doc B') returning id", [PB])).rows[0].id }));
    ok(polB.id, "ADMIN de B cria em B");
    const b = await as(U.ADMINB);
    const ncrA = await mkNcr(); const polA = await mkPolicy();
    eq((await b.query("select count(*)::int n from public.quality_ncrs where project_id=$1", [PA])).rows[0].n, 0, "B vê RNC de A");
    eq((await b.query("select count(*)::int n from public.insurance_policies where project_id=$1", [PA])).rows[0].n, 0, "B vê apólice de A");
    eq((await b.query("select count(*)::int n from public.insurance_policies where project_id=$1", [PB])).rows[0].n, 1, "B vê só a sua");
    for (const f of [
      () => rpc(b, "quality_ncr_create", PA, "x", "d", "EMAIL", `iso-${uniq()}`),
      () => rpc(b, "quality_ncr_transition", ncrA.id, "TRIAGEM", ncrA.rowVersion, null, null, null),
      () => rpc(b, "insurance_policy_new_version", polA.id, 1, JSON.stringify({ notes: "invasão" }), "tentativa de invasão entre obras"),
      () => rpc(b, "insurance_endorsement_request", polA.id, JSON.stringify({ requested_text: "invasão", request_ref: "x" })),
      () => rpc(b, "insurance_claim_open", PA, JSON.stringify({ claim_kind: "OUTRO", title: "x", stage: "AVISO", source_ref: "r", no_instrument_reason: "motivo suficiente para teste" })),
    ]) { try { await f(); throw new Error("operação cruzada passou"); } catch (e) { ok(DENIED.test(e.message), `esperava recusa, obtive: ${e.message}`); } }
    try { await rpc(b, "quality_evidence_register", PA, "DOCUMENTO", "x", "NC_COMPROVADA", "FATO", ncrA.id); throw new Error("evidência cruzada passou"); }
    catch (e) { ok(/FORBIDDEN/i.test(e.message), `evidência cruzada: ${e.message}`); }
    // papel alto em outro projeto não vira privilégio: B é ADMINISTRADOR em B mas NONE em A.
    eq((await b.query("select public.acc_project_tier($1) a, public.acc_project_tier($2) b", [PA, PB])).rows[0], { a: "NONE", b: "ADMIN" }, "tier por projeto");
  });

  await check("CASO 39) membership de A com papel baixo em A e alto em B: o nível vale SÓ no projeto consultado", async () => {
    await mem(PB, U.LEITURA, "ADMINISTRADOR"); // LEITURA em A, ADMINISTRADOR em B
    const c = await as(U.LEITURA);
    eq((await c.query("select public.acc_project_tier($1) a, public.acc_project_tier($2) b", [PA, PB])).rows[0], { a: "READ", b: "ADMIN" }, "tiers");
    try { await rpc(c, "quality_ncr_create", PA, "x", "d", "EMAIL", `iso2-${uniq()}`); throw new Error("passou"); } catch (e) { ok(/FORBIDDEN/.test(e.message), `LEITURA em A cria: ${e.message}`); }
    ok((await rpc(c, "quality_ncr_create", PB, "RNC em B", "d", "EMAIL", `iso3-${uniq()}`)).id, "ADMIN em B cria em B");
  });

  // ======================= dinâmica: mudança de papel/status vale já na próxima chamada =======================
  await check("papel/status mudam o nível imediatamente: rebaixar ou inativar corta o acesso; reativar restaura; sem cache", async () => {
    const PD = "10000000-0000-4000-8000-0000000023d0";
    await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra D','PMD','C','L','2026-01-01','2027-01-01')", [PD]);
    await mem(PD, U.GESTOR, "GESTOR");
    const tier = async () => (await (await as(U.GESTOR)).query("select public.acc_project_tier($1) t", [PD])).rows[0].t;
    eq(await tier(), "MANAGE", "GESTOR");
    await su.query("update public.project_memberships set permission='LEITURA' where project_id=$1 and user_id=$2", [PD, uid(U.GESTOR)]);
    eq(await tier(), "READ", "rebaixado");
    await su.query("update public.project_memberships set status='INACTIVE' where project_id=$1 and user_id=$2", [PD, uid(U.GESTOR)]);
    eq(await tier(), "NONE", "inativado");
    await su.query("update public.project_memberships set status='ACTIVE', permission='GERENTE' where project_id=$1 and user_id=$2", [PD, uid(U.GESTOR)]);
    eq(await tier(), "MANAGE", "reativado como GERENTE");
  });

  // ======================= CASO 37: auditoria =======================
  await check("CASO 37) auditoria: operação autorizada gera trilha com o ator correto; recusada NÃO gera trilha", async () => {
    const aud = () => nq("select (select count(*) from public.audit_log_entries) + (select count(*) from public.insurance_audit_events) n");
    const before = await aud();
    for (const n of [U.LEITURA, U.ADMINB]) {
      try { await rpc(await as(n), "quality_ncr_create", PA, "x", "d", "EMAIL", `aud-${uniq()}`); } catch { /* esperado */ }
      try { await rpc(await as(n), "insurance_policy_create", PA, JSON.stringify(POL)); } catch { /* esperado */ }
    }
    eq(await aud(), before, "recusas não geram auditoria");
    const ncr = await rpc(await as(U.COLAB), "quality_ncr_create", PA, "RNC auditada", "d", "EMAIL", `aud-${uniq()}`);
    const a1 = (await su.query("select actor_user_id from public.audit_log_entries where entity_id=$1 order by created_at desc limit 1", [ncr.id])).rows;
    ok(a1.length === 1 && a1[0].actor_user_id === uid(U.COLAB), `auditoria da RNC com ator COLAB: ${JSON.stringify(a1)}`);
    const pol = await mkPolicy();
    const a2 = (await su.query("select actor_user_id from public.insurance_audit_events where entity_id=$1", [pol.id])).rows;
    ok(a2.length >= 1 && a2.every((r) => r.actor_user_id === uid(U.ADMIN)), `auditoria da apólice com ator ADMIN: ${JSON.stringify(a2)}`);
    const t = await rpc(await as(U.GESTOR), "quality_ncr_transition", ncr.id, "TRIAGEM", ncr.rowVersion, null, null, null);
    ok(t.auditId, "transição devolve auditId");
    eq((await su.query("select actor_user_id from public.audit_log_entries where id=$1", [t.auditId])).rows[0].actor_user_id, uid(U.GESTOR), "ator da transição");
    // trilhas append-only: authenticated não altera nem apaga
    for (const [tbl] of [["audit_log_entries"], ["insurance_audit_events"]]) {
      const cnt = () => nq(`select count(*)::int n from public.${tbl}`);
      const c0 = await cnt();
      for (const sql of [`update public.${tbl} set id=id`, `delete from public.${tbl}`]) {
        let res = null;
        try { res = await (await as(U.ADMIN)).query(sql); } catch (e) { ok(/permission denied|append|row-level|NO_DELETE|APPEND_ONLY/i.test(e.message), `${tbl}: ${e.message}`); continue; }
        eq(res.rowCount, 0, `${tbl}: "${sql}" não pode afetar linhas`);
      }
      eq(await cnt(), c0, `${tbl} intacta`);
    }
  });
} finally {
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
