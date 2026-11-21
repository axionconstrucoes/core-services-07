// FASE 7 / H6e — TENANT_ADMIN em PostgreSQL REAL (adversarial). Replay das migrations numa base descartável (acc_f7h6e_*, apagada no fim);
// identidade por claims JWT (request.jwt.claims + set role); dados 100% SINTÉTICOS.
// PARTE 1 (antes da migration H6e): PROVA o comportamento anterior — o ADMINISTRADOR do projeto A altera dado GLOBAL de organização
// que também é usada pelo projeto B (risco confirmado). PARTE 2 (depois): dado global só por TENANT_ADMIN; sem TENANT_ADMIN => bloqueado
// (fail-closed); ADMIN de A/B, GESTOR, GERENTE, COLAB, LEITURA, inativo, anon e sem sub recusados; concessão só por manutenção; auditoria
// append-only; rollback com guarda; idempotência.
// NÃO roda no CI. Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-f7-h6e-tenant-admin-realpg.mjs
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
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
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const rbDir = path.join(here, "..", "supabase", "rollbacks");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE_FILE = "20261211100000_tenant_admin_global_external_data.sql";
const PRE = files.filter((f) => f < MINE_FILE);
const AFTER = files.filter((f) => f > MINE_FILE);
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
const sqlOf = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
const rbOf = (f) => readFileSync(path.join(rbDir, f.replace(/\.sql$/, ".rollback.sql")), "utf8").replace(/^﻿/, "");

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
const dbName = `acc_f7h6e_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}

const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
try {
  await su.query(platform);
  for (const f of PRE) {
    try { await su.query(sqlOf(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }

  const uid = (n) => `00000000-0000-4000-8000-${String(7600 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000076a0";
  const PB = "10000000-0000-4000-8000-0000000076b0";
  const U = { ADMA: 1, GESTORA: 2, GERENTEA: 3, COLABA: 4, LEITURAA: 5, INATIVOA: 6, ADMB: 7, GESTORB: 8, TENANT: 9, TADMA: 10 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f7h6e-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F7H6E ${n}`, `f7h6e-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F7A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F7B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMA, "ADMINISTRADOR");
  await mem(PA, U.TADMA, "ADMINISTRADOR");
  await mem(PA, U.GESTORA, "GESTOR");
  await mem(PA, U.GERENTEA, "GERENTE");
  await mem(PA, U.COLABA, "COLABORADOR");
  await mem(PA, U.LEITURAA, "LEITURA");
  await mem(PA, U.INATIVOA, "GESTOR", "INACTIVE");
  await mem(PB, U.ADMB, "ADMINISTRADOR");
  await mem(PB, U.GESTORB, "GESTOR");
  // U.TENANT não pertence a nenhum projeto (administração global independe de membership)

  const mkOrg = async (name) => (await su.query("insert into public.external_organizations (legal_name, org_kind) values ($1,'FORNECEDOR') returning id", [name])).rows[0].id;
  const mkLink = (org, project) => su.query("insert into public.external_org_project_links (organization_id, project_id, role_in_project, status) values ($1,$2,'FORNECEDOR','CANDIDATE')", [org, project]);
  const ORG_SHARED = await mkOrg("Fornecedora Compartilhada Sintética Ltda");
  await mkLink(ORG_SHARED, PA);
  await mkLink(ORG_SHARED, PB);
  const ORG_B = await mkOrg("Fornecedora Só do B Sintética Ltda");
  await mkLink(ORG_B, PB);

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
  const legalName = async (id) => (await su.query("select legal_name from public.external_organizations where id=$1", [id])).rows[0].legal_name;
  const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security/i;
  const saveOrg = (c, p, o) => rpc(c, "acc_external_org_save", p, JSON.stringify(o), "teste H6e");
  console.log(`PostgreSQL ${version}: ${PRE.length} migrations anteriores — base ${dbName}`);

  // ================= PARTE 1: comportamento ATUAL (antes da H6e) =================
  await check("H6E-01 [ANTES] RISCO CONFIRMADO: o ADMINISTRADOR do projeto A altera dado GLOBAL (razão social, domínio, contato) de organização que o projeto B também usa; organização só do B ele não alcança", async () => {
    const adA = await as(U.ADMA);
    await saveOrg(adA, PA, { id: ORG_SHARED, legal_name: "Renomeada Pelo Admin De A Ltda" });
    eq(await legalName(ORG_SHARED), "Renomeada Pelo Admin De A Ltda", "admin de A alterou dado que vale para o projeto B");
    await rpc(adA, "acc_external_domain_set", PA, ORG_SHARED, "global-h6e.com.br", true, "teste");
    await rpc(adA, "acc_external_contact_set", PA, ORG_SHARED, "pessoa@global-h6e.com.br", "Pessoa", "CONFIRMED", "teste");
    eq(await nq("select count(*)::int n from public.external_org_domains where organization_id=$1", [ORG_SHARED]), 1, "domínio global alterado pelo admin de A");
    // visível ao B: o efeito é global (o admin de B enxerga a alteração feita pelo admin de A)
    const adB = await as(U.ADMB);
    eq(Number((await adB.query("select count(*)::int n from public.external_org_domains where organization_id=$1", [ORG_SHARED])).rows[0].n), 1, "B enxerga o domínio criado por A");
    await rejects(saveOrg(adA, PA, { id: ORG_B, legal_name: "Invasão" }), DENIED, "org só do B está fora do alcance do admin de A");
    await su.query("delete from public.external_org_domains where organization_id=$1", [ORG_SHARED]);
    await su.query("delete from public.external_contacts where organization_id=$1", [ORG_SHARED]);
    await su.query("update public.external_organizations set legal_name='Fornecedora Compartilhada Sintética Ltda' where id=$1", [ORG_SHARED]);
  });

  // ================= aplica a migration H6e (e as posteriores), 2x =================
  for (const f of [MINE_FILE, ...AFTER]) {
    try { await su.query(sqlOf(f)); } catch (e) { console.log(`FAIL migration ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  await su.query(sqlOf(MINE_FILE));
  await su.query(sqlOf(MINE_FILE));
  console.log("migration H6e aplicada (reaplicada 2x: idempotente)");

  // ================= PARTE 2: depois da H6e =================
  const globalOps = (c, p, org) => [
    ["org_save(update)", () => saveOrg(c, p, { id: org, legal_name: "Hack Ltda" })],
    ["org_save(create)", () => saveOrg(c, p, { legal_name: "Org Nova Hack Ltda", org_kind: "OUTRO" })],
    ["domain_set", () => rpc(c, "acc_external_domain_set", p, org, "hack.com.br", true, null)],
    ["contact_set", () => rpc(c, "acc_external_contact_set", p, org, "hack@hack.com.br", null, "CONFIRMED", null)],
  ];
  const untouched = async () => {
    eq(await legalName(ORG_SHARED), "Fornecedora Compartilhada Sintética Ltda", "razão social intacta");
    eq(await nq("select count(*)::int n from public.external_org_domains"), 0, "nenhum domínio");
    eq(await nq("select count(*)::int n from public.external_contacts"), 0, "nenhum contato");
    eq(await nq("select count(*)::int n from public.external_organizations"), 2, "nenhuma organização criada");
  };

  await check("H6E-02 [FAIL-CLOSED] sem TENANT_ADMIN registrado, NINGUÉM altera dado global: ADMIN de A, ADMIN de B, GESTOR, GERENTE, COLAB, LEITURA, inativo, sem sub e anon", async () => {
    eq(await nq("select count(*)::int n from public.tenant_admins"), 0, "nenhum tenant admin");
    for (const [label, n, role, project] of [["ADMIN_A", U.ADMA, "authenticated", PA], ["ADMIN_B", U.ADMB, "authenticated", PB], ["ADMIN_B_em_A", U.ADMB, "authenticated", PA],
      ["GESTOR", U.GESTORA, "authenticated", PA], ["GERENTE", U.GERENTEA, "authenticated", PA], ["COLAB", U.COLABA, "authenticated", PA], ["LEITURA", U.LEITURAA, "authenticated", PA],
      ["INATIVO", U.INATIVOA, "authenticated", PA], ["SEM_SUB", null, "authenticated", PA], ["ANON", null, "anon", PA]]) {
      const c = await as(n, role);
      for (const [op, run] of globalOps(c, project, ORG_SHARED)) await rejects(run(), DENIED, `${label} ${op}`);
    }
    await untouched();
  });

  await check("H6E-03 [CONCESSÃO só por manutenção] authenticated/anon não leem, inserem, atualizam nem apagam tenant_admins (sem auto-concessão); acc_is_tenant_admin() é false para todos sem registro", async () => {
    for (const [label, n, role] of [["ADMIN_A", U.ADMA, "authenticated"], ["TENANT", U.TENANT, "authenticated"], ["anon", null, "anon"]]) {
      const c = await as(n, role);
      await rejects(c.query("insert into public.tenant_admins (user_id, reason) values ($1,'auto concessão')", [uid(U.ADMA)]), DENIED, `${label} insert`);
      await rejects(c.query("select * from public.tenant_admins"), DENIED, `${label} select`);
      await rejects(c.query("update public.tenant_admins set revoked_at = now()"), DENIED, `${label} update`);
      await rejects(c.query("delete from public.tenant_admins"), DENIED, `${label} delete`);
      await rejects(c.query("select * from public.tenant_admin_audit"), DENIED, `${label} audit`);
    }
    eq(await rpc(await as(U.ADMA), "acc_is_tenant_admin"), false, "admin de projeto não é tenant admin");
    eq(await rpc(await as(null, "authenticated"), "acc_is_tenant_admin"), false, "sem sub");
    await rejects(rpc(await as(null, "anon"), "acc_is_tenant_admin"), DENIED, "anon sem EXECUTE");
    const fn = (await su.query("select prosecdef, provolatile, proconfig from pg_proc where proname='acc_is_tenant_admin' and pronamespace='public'::regnamespace")).rows[0];
    ok(fn.prosecdef && fn.provolatile === "s" && (fn.proconfig ?? []).some((x) => /search_path=/.test(x)), "security definer, stable, search_path vazio");
    // nenhuma RPC de concessão exposta a authenticated
    eq(await nq("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname ~* 'tenant_admin' and proname <> 'acc_is_tenant_admin' and has_function_privilege('authenticated', oid, 'execute') and proname !~ '_guard'"), 0, "sem RPC de concessão para authenticated");
  });

  await check("H6E-04 [BOOTSTRAP por manutenção] SQL do superusuário concede TENANT_ADMIN; ele altera dado global de organização de QUALQUER projeto, sem ser membro; auditado", async () => {
    await su.query("insert into public.tenant_admins (user_id, reason) values ($1,'Bootstrap do primeiro administrador global (teste)')", [uid(U.TENANT)]);
    const t = await as(U.TENANT);
    eq(await rpc(t, "acc_is_tenant_admin"), true, "tenant admin reconhecido");
    await saveOrg(t, PA, { id: ORG_SHARED, legal_name: "Renomeada Pelo Tenant Admin Ltda" });
    eq(await legalName(ORG_SHARED), "Renomeada Pelo Tenant Admin Ltda", "alterou organização compartilhada sem ser membro");
    await saveOrg(t, PB, { id: ORG_B, legal_name: "Org Só Do B Renomeada Ltda" });
    eq(await legalName(ORG_B), "Org Só Do B Renomeada Ltda", "alterou organização que nenhum projeto dele alcança");
    const novo = await saveOrg(t, PA, { legal_name: "Org Criada Por Tenant Admin Ltda", org_kind: "OUTRO" });
    ok(novo, "criou organização");
    await rpc(t, "acc_external_domain_set", PA, ORG_SHARED, "tenant-h6e.com.br", true, "teste");
    await rpc(t, "acc_external_contact_set", PA, ORG_SHARED, "pessoa@tenant-h6e.com.br", "Pessoa", "CONFIRMED", "teste");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where actor_id=$1 and action in ('ORG_UPDATE','ORG_CREATE','DOMAIN_SET_ACTIVE','CONTACT_SET_CONFIRMED')", [uid(U.TENANT)]) >= 5, "auditoria externa das alterações");
    eq(await nq("select count(*)::int n from public.tenant_admin_audit where user_id=$1 and action='GRANT'", [uid(U.TENANT)]), 1, "auditoria da concessão");
    // restaura para as demais verificações
    await su.query("delete from public.external_org_domains"); await su.query("delete from public.external_contacts");
    await su.query("delete from public.external_organizations where id = $1", [novo]);
    await su.query("update public.external_organizations set legal_name='Fornecedora Compartilhada Sintética Ltda' where id=$1", [ORG_SHARED]);
    await su.query("update public.external_organizations set legal_name='Fornecedora Só do B Sintética Ltda' where id=$1", [ORG_B]);
  });

  await check("H6E-05 [AUTORIZAÇÃO NEGATIVA com TENANT_ADMIN ativo] ADMIN de A, ADMIN de B, GESTOR, GERENTE, COLAB, LEITURA, inativo, sem sub e anon continuam recusados; dado intacto", async () => {
    for (const [label, n, role, project] of [["ADMIN_A", U.ADMA, "authenticated", PA], ["ADMIN_B", U.ADMB, "authenticated", PB], ["ADMIN_B_em_A", U.ADMB, "authenticated", PA],
      ["GESTOR", U.GESTORA, "authenticated", PA], ["GERENTE", U.GERENTEA, "authenticated", PA], ["COLAB", U.COLABA, "authenticated", PA], ["LEITURA", U.LEITURAA, "authenticated", PA],
      ["INATIVO", U.INATIVOA, "authenticated", PA], ["SEM_SUB", null, "authenticated", PA], ["ANON", null, "anon", PA]]) {
      const c = await as(n, role);
      for (const [op, run] of globalOps(c, project, ORG_SHARED)) await rejects(run(), DENIED, `${label} ${op}`);
    }
    await untouched();
    // TENANT_ADMIN sem project_id válido também é recusado (fail-closed)
    await rejects(saveOrg(await as(U.TENANT), null, { id: ORG_SHARED, legal_name: "x" }), DENIED, "p_project_id nulo");
  });

  await check("H6E-06 [ISOLAMENTO] ADMINISTRADOR/GESTOR seguem administrando o PROJETO: vínculos do próprio projeto e SOLICITAÇÕES; não alteram vínculo de outro projeto; tenant admin sem membership não gere vínculo do projeto", async () => {
    const adA = await as(U.ADMA);
    const ges = await as(U.GESTORA);
    const lk = (await su.query("select id from public.external_org_project_links where organization_id=$1 and project_id=$2", [ORG_SHARED, PA])).rows[0].id;
    await rpc(adA, "acc_external_link_save", PA, JSON.stringify({ id: lk, status: "ACTIVE", contract_ref: "CT-H6E" }), "Contrato conferido");
    eq((await su.query("select status, contract_ref from public.external_org_project_links where id=$1", [lk])).rows[0], { status: "ACTIVE", contract_ref: "CT-H6E" }, "admin gere vínculo do projeto");
    await rpc(ges, "acc_external_link_save", PA, JSON.stringify({ id: lk, delegation_clause_ref: "Cl. 3" }), "Cláusula");
    await rejects(rpc(await as(U.ADMB), "acc_external_link_save", PA, JSON.stringify({ id: lk, status: "ENDED" }), null), DENIED, "admin de B não gere vínculo de A");
    await rejects(rpc(await as(U.TENANT), "acc_external_link_save", PA, JSON.stringify({ id: lk, status: "ENDED" }), null), DENIED, "tenant admin sem membership não gere vínculo do projeto");
    // solicitações continuam abertas a GESTOR/GERENTE/ADMIN do projeto; COLAB/LEITURA/outro projeto não
    const req = (c, p, o, payload) => rpc(c, "acc_external_change_request", p, "ORG_UPDATE", o, JSON.stringify(payload), "Correção de razão social conforme contrato");
    await req(ges, PA, ORG_SHARED, { legal_name: "Solicitada Pelo Gestor Ltda" });
    await req(adA, PA, ORG_SHARED, { legal_name: "Solicitada Pelo Admin Ltda" });
    await rejects(req(await as(U.COLABA), PA, ORG_SHARED, { legal_name: "x" }), DENIED, "COLAB solicita");
    await rejects(req(await as(U.LEITURAA), PA, ORG_SHARED, { legal_name: "x" }), DENIED, "LEITURA solicita");
    await rejects(req(await as(null, "anon"), PA, ORG_SHARED, { legal_name: "x" }), DENIED, "anon solicita");
    eq(await legalName(ORG_SHARED), "Fornecedora Compartilhada Sintética Ltda", "solicitar não altera");
  });

  await check("H6E-07 [DECISÃO de solicitação] ADMIN do projeto e GESTOR NÃO decidem mais; TENANT_ADMIN decide e a alteração global é aplicada e auditada; ORG_CREATE exige o tenant admin ser gestor do projeto (fail-closed documentado)", async () => {
    const pend = (await su.query("select id from public.external_org_change_requests where status='PENDING' and payload->>'legal_name' = 'Solicitada Pelo Gestor Ltda'")).rows[0].id;
    for (const [label, c] of [["ADMIN_A", await as(U.ADMA)], ["GESTOR", await as(U.GESTORA)], ["ADMIN_B", await as(U.ADMB)], ["COLAB", await as(U.COLABA)], ["anon", await as(null, "anon")]]) {
      await rejects(rpc(c, "acc_external_change_decide", pend, "APPROVE", null), DENIED, `${label} decide`);
    }
    await rejects(rpc(await as(U.ADMA), "acc_external_change_decide", pend, "REJECT", "motivo qualquer"), DENIED, "ADMIN_A nem recusa");
    eq(await legalName(ORG_SHARED), "Fornecedora Compartilhada Sintética Ltda", "nada aplicado");
    const t = await as(U.TENANT);
    const ap = await rpc(t, "acc_external_change_decide", pend, "APPROVE", "Conferido pelo administrador global");
    eq(ap.decision, "APPROVE", "aprovada");
    eq(await legalName(ORG_SHARED), "Solicitada Pelo Gestor Ltda", "aplicada pelo TENANT_ADMIN");
    eq((await su.query("select status, decided_by from public.external_org_change_requests where id=$1", [pend])).rows[0], { status: "APPROVED", decided_by: uid(U.TENANT) }, "estado");
    // ORG_CREATE: cria também vínculo CANDIDATO do projeto => exige gestão do projeto; tenant admin não-membro é recusado e a solicitação continua PENDENTE (transação desfeita)
    const rc = await rpc(await as(U.GESTORA), "acc_external_change_request", PA, "ORG_CREATE", null, JSON.stringify({ legal_name: "Nova Org Sintética Ltda", org_kind: "SUBCONTRATADA" }), "Cadastro solicitado pelo gestor");
    const antes = await nq("select count(*)::int n from public.external_organizations");
    await rejects(rpc(t, "acc_external_change_decide", rc, "APPROVE", null), DENIED, "tenant admin não-membro aprovando ORG_CREATE");
    eq(await nq("select count(*)::int n from public.external_organizations"), antes, "nenhuma organização criada");
    eq((await su.query("select status from public.external_org_change_requests where id=$1", [rc])).rows[0].status, "PENDING", "segue pendente");
    // tenant admin que também é ADMINISTRADOR do projeto aprova
    await su.query("insert into public.tenant_admins (user_id, reason) values ($1,'Segundo administrador global (teste)')", [uid(U.TADMA)]);
    const r2 = await rpc(await as(U.TADMA), "acc_external_change_decide", rc, "APPROVE", "Cadastro conferido");
    ok(r2.applied.organization_id, "organização criada");
    eq((await su.query("select status, confirmed_by from public.external_org_project_links where organization_id=$1 and project_id=$2", [r2.applied.organization_id, PA])).rows[0], { status: "CANDIDATE", confirmed_by: null }, "vínculo candidato sem autoridade");
    // recusa por tenant admin também é auditada
    const rd = await rpc(await as(U.GESTORA), "acc_external_change_request", PA, "DOMAIN_SET", ORG_SHARED, JSON.stringify({ domain: "recusado-h6e.com.br" }), "Domínio solicitado pelo gestor");
    await rpc(t, "acc_external_change_decide", rd, "REJECT", "Domínio não pertence à organização");
    eq(await nq("select count(*)::int n from public.external_org_domains where domain='recusado-h6e.com.br'"), 0, "recusa não altera");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where action in ('CHANGE_APPROVE_ORG_UPDATE','CHANGE_REJECT_DOMAIN_SET') and actor_id=$1", [uid(U.TENANT)]) >= 2, "decisões auditadas");
  });

  await check("H6E-08 [REVOGAÇÃO e AUDITORIA append-only] revogar bloqueia de novo; DELETE e alteração indevida são recusados; reconceder funciona; histórico GRANT/REVOKE/REGRANT imutável", async () => {
    const t = await as(U.TENANT);
    eq(await rpc(t, "acc_is_tenant_admin"), true, "ativo");
    await su.query("update public.tenant_admins set revoked_at = now(), revoked_by = $1 where user_id = $1", [uid(U.TADMA)]);
    const t2 = await as(U.TENANT);
    eq(await rpc(t2, "acc_is_tenant_admin"), true, "revogar outro não afeta este");
    await su.query("update public.tenant_admins set revoked_at = now() where user_id = $1", [uid(U.TENANT)]);
    const t3 = await as(U.TENANT);
    eq(await rpc(t3, "acc_is_tenant_admin"), false, "revogado");
    await rejects(saveOrg(t3, PA, { id: ORG_SHARED, legal_name: "Pós-revogação" }), DENIED, "revogado não altera");
    await rejects(rpc(await as(U.TADMA), "acc_external_domain_set", PA, ORG_SHARED, "pos-revogacao.com.br", true, null), DENIED, "TADMA revogado não altera");
    await rejects(su.query("delete from public.tenant_admins where user_id=$1", [uid(U.TENANT)]), /APPEND_ONLY/, "DELETE recusado");
    await rejects(su.query("update public.tenant_admins set reason='reescrita' where user_id=$1", [uid(U.TENANT)]), /APPEND_ONLY/, "reescrever motivo recusado");
    await rejects(su.query("update public.tenant_admins set user_id=$2 where user_id=$1", [uid(U.TENANT), uid(U.ADMA)]), /APPEND_ONLY/, "trocar user_id recusado");
    await su.query("update public.tenant_admins set revoked_at = null, revoked_by = null, granted_at = now(), granted_by = null where user_id = $1", [uid(U.TENANT)]);
    eq(await rpc(await as(U.TENANT), "acc_is_tenant_admin"), true, "reconcedido");
    const acts = (await su.query("select action from public.tenant_admin_audit where user_id=$1 order by id", [uid(U.TENANT)])).rows.map((r) => r.action);
    eq(acts, ["GRANT", "REVOKE", "REGRANT"], "histórico completo");
    await rejects(su.query("update public.tenant_admin_audit set action='GRANT'"), /APPEND_ONLY/, "auditoria imutável (update)");
    await rejects(su.query("delete from public.tenant_admin_audit"), /APPEND_ONLY/, "auditoria imutável (delete)");
  });

  await check("H6E-09 [PRIVILÉGIOS] funções novas/redefinidas: security definer, search_path vazio, anon sem EXECUTE; assert_global_admin interna; tabelas com RLS ligado e sem acesso de authenticated", async () => {
    for (const f of ["acc_is_tenant_admin", "acc_external_assert_global_admin", "acc_external_org_visible"]) {
      const r = (await su.query("select prosecdef, proconfig, has_function_privilege('anon', oid, 'execute') anon_exec from pg_proc where proname=$1 and pronamespace='public'::regnamespace", [f])).rows;
      ok(r.length === 1, `${f} existe uma vez`);
      ok(r[0].prosecdef, `${f} security definer`); ok((r[0].proconfig ?? []).some((c) => /search_path=/.test(c)), `${f} search_path`); eq(r[0].anon_exec, false, `${f} anon sem EXECUTE`);
    }
    eq((await su.query("select has_function_privilege('authenticated', 'public.acc_external_assert_global_admin(uuid)', 'execute') x")).rows[0].x, false, "assert_global_admin interna");
    for (const t of ["tenant_admins", "tenant_admin_audit"]) {
      eq((await su.query("select relrowsecurity r from pg_class where oid = $1::regclass", [`public.${t}`])).rows[0].r, true, `${t} com RLS`);
      eq((await su.query("select has_table_privilege('authenticated', $1, 'select,insert,update,delete') x", [`public.${t}`])).rows[0].x, false, `${t} sem acesso de authenticated`);
    }
  });

  await check("H6E-10 [ROLLBACK] recusa se houver tenant admin (evidência); com autorização manual restaura o comportamento anterior; reaplicar funciona", async () => {
    await rejects(su.query(rbOf(MINE_FILE)), /ROLLBACK_BLOCKED/, "rollback com registros");
    await su.query("rollback"); // o script abre transação (begin); a recusa a deixa abortada
    // remoção manual e autorizada da evidência (simulada: desabilita o gatilho append-only só nesta base descartável)
    await su.query("alter table public.tenant_admins disable trigger tenant_admins_guard_trg");
    await su.query("delete from public.tenant_admins");
    await su.query("alter table public.tenant_admins enable trigger tenant_admins_guard_trg");
    await su.query("alter table public.tenant_admin_audit disable trigger tenant_admin_audit_guard_trg");
    await su.query("delete from public.tenant_admin_audit");
    await su.query("alter table public.tenant_admin_audit enable trigger tenant_admin_audit_guard_trg");
    await su.query(rbOf(MINE_FILE));
    await su.query(rbOf(MINE_FILE)); // idempotente
    eq(await nq("select count(*)::int n from pg_proc where proname = 'acc_is_tenant_admin'"), 0, "função removida");
    eq(await nq("select count(*)::int n from pg_class where relname in ('tenant_admins','tenant_admin_audit')"), 0, "tabelas removidas");
    await saveOrg(await as(U.ADMA), PA, { id: ORG_SHARED, legal_name: "Comportamento Anterior Restaurado Ltda" });
    eq(await legalName(ORG_SHARED), "Comportamento Anterior Restaurado Ltda", "ADMIN de projeto volta a alterar (comportamento anterior)");
    await su.query(sqlOf(MINE_FILE));
    await rejects(saveOrg(await as(U.ADMA), PA, { id: ORG_SHARED, legal_name: "Bloqueado" }), DENIED, "reaplicada: bloqueia de novo");
  });
} finally {
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
