// FASE 5 / C — organizações e contatos externos em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base descartável
// (acc_f5c_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role), dados 100% SINTÉTICOS.
// Cobre: resolução fail-closed (acc_resolve_external_party) e PARIDADE com resolveFromRows (TS); cenários 16 (contato novo descoberto),
// 17 (contato em dois projetos), 18 (domínio compartilhado por várias relações); RLS por membership; gestão só MANAGE/ADMIN; auditoria
// append-only; idempotência das migrations. NÃO roda no CI.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-f5-c-contatos-realpg.mjs
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
const R = await import("../apps/web/lib/external-parties/resolve.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^202612031[0-9]{5}_external_parties/.test(f));
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
const keepOpen = [];
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
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const eq = (a, b, m) => { if (canon(a) !== canon(b)) throw new Error(`${m}: esperado ${canon(b)}, obtido ${canon(a)}`); };
const rejects = async (p, re, m) => {
  try { await p; } catch (e) { ok(re.test(e.message), `${m}: erro inesperado: ${e.message.split("\n")[0]}`); return; }
  throw new Error(`${m}: deveria ter sido recusado`);
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f5c_${Date.now().toString(36)}`;
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
  ok(MINE.length === 2, `esperadas 2 migrations da frente C, achei ${MINE.length}`);
  for (let i = 0; i < 2; i += 1) for (const f of MINE) await su.query(readFileSync(path.join(dir, f), "utf8")); // idempotência
  // Fase 6/H2b: a migration 20261209101000 REDEFINE as RPCs de gestão global (somente ADMINISTRADOR); reaplicada depois das da C para valer na ordem real.
  for (const f of files.filter((x) => /^20261209101000_/.test(x))) await su.query(readFileSync(path.join(dir, f), "utf8"));
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 5/C reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(5300 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000053a0";
  const PB = "10000000-0000-4000-8000-0000000053b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, ADMINB: 8, LEITURAB: 9 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f5c-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F5C ${n}`, `f5c-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F5A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F5B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await mem(PB, U.LEITURAB, "LEITURA");

  async function as(n, role = "authenticated", keep = false) {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    if (keep) keepOpen.push(c); else open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const rpc = async (c, fn, ...args) => {
    const ph = args.map((_, i) => `$${i + 1}`).join(",");
    return (await c.query(`select public.${fn}(${ph}) as r`, args)).rows[0].r;
  };
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security/i;
  const resolve = (c, p, e) => rpc(c, "acc_resolve_external_party", p, e);
  const saveOrg = (c, p, o) => rpc(c, "acc_external_org_save", p, JSON.stringify(o));
  const saveLink = (c, p, l, reason) => rpc(c, "acc_external_link_save", p, JSON.stringify(l), reason ?? null);

  // Estado compartilhado dos cenários (criado pela gestão, não por INSERT direto).
  const g = await as(U.GESTOR, "authenticated", true);
  const adm = await as(U.ADMIN, "authenticated", true); // Fase 6/H2b: dados globais (organização, domínio, contato) só por ADMINISTRADOR
  let ORG_G, ORG_FORN1, ORG_FORN2, ORG_CLI;

  await check("gestão: ADMINISTRADOR cria organizações (GERENCIADORA, CLIENTE, 2 FORNECEDORES) e o banco guarda criador e auditoria", async () => {
    ORG_G = await saveOrg(adm, PA, { legal_name: "Gerenciadora Sintética Ltda", tax_id: "11.111.111/0001-11", org_kind: "GERENCIADORA" });
    ORG_CLI = await saveOrg(adm, PA, { legal_name: "Cliente Sintético SA", tax_id: "22.222.222/0001-22", org_kind: "CLIENTE" });
    ORG_FORN1 = await saveOrg(adm, PA, { legal_name: "Fornecedor Um Ltda", org_kind: "FORNECEDOR" });
    ORG_FORN2 = await saveOrg(adm, PA, { legal_name: "Fornecedor Dois Ltda", org_kind: "FORNECEDOR" });
    ok(ORG_G && ORG_CLI && ORG_FORN1 && ORG_FORN2, "ids");
    eq(await nq("select count(*)::int n from public.external_organizations where created_by=$1", [uid(U.ADMIN)]), 4, "criador gravado");
    eq(await nq("select count(*)::int n from public.external_contacts_audit where action='ORG_CREATE' and actor_id=$1", [uid(U.ADMIN)]), 4, "auditoria de criação");
  });

  await check("gestão de dados GLOBAIS (Fase 6/H2b): só ADMINISTRADOR grava; GESTOR, GERENTE, LEITURA, COLABORADOR, inativo, outro projeto, anon e sem sub são recusados sem gravar", async () => {
    for (const [label, n, role, can] of [["LEITURA", U.LEITURA, "authenticated", false], ["COLABORADOR", U.COLAB, "authenticated", false], ["GESTOR", U.GESTOR, "authenticated", false],
      ["GERENTE", U.GERENTE, "authenticated", false], ["ADMINISTRADOR", U.ADMIN, "authenticated", true], ["INATIVO", U.INATIVO, "authenticated", false],
      ["OUTRO_PROJETO", U.ADMINB, "authenticated", false], ["SEM_SUB", null, "authenticated", false], ["ANON", null, "anon", false]]) {
      const c = await as(n, role);
      const before = await nq("select count(*)::int n from public.external_organizations");
      if (can) { ok(await saveOrg(c, PA, { legal_name: `Org ${label}`, org_kind: "OUTRO" }), label); eq(await nq("select count(*)::int n from public.external_organizations"), before + 1, label); }
      else { await rejects(saveOrg(c, PA, { legal_name: `Org ${label}`, org_kind: "OUTRO" }), DENIED, label); eq(await nq("select count(*)::int n from public.external_organizations"), before, `${label} não grava`); }
    }
  });

  await check("escrita direta nas tabelas é negada a authenticated (só RPC); anon não lê", async () => {
    const c = await as(U.ADMIN);
    for (const sql of ["insert into public.external_organizations (legal_name, org_kind) values ('X Ltda','OUTRO')", "update public.external_organizations set notes='x'",
      "delete from public.external_org_domains", "insert into public.external_contacts_audit (action, entity_type) values ('X','Y')", "update public.external_org_project_links set status='ACTIVE'"]) {
      await rejects(c.query(sql), DENIED, sql);
    }
    await rejects((await as(null, "anon")).query("select * from public.external_organizations"), /permission denied/i, "anon");
  });

  await check("vínculo: ACTIVE grava confirmado_por/em; GERENCIADORA com contratante, contrato, cláusula, delegação, vigência; domínio e contato", async () => {
    await saveLink(adm, PA, { organization_id: ORG_G, role_in_project: "GERENCIADORA", contract_ref: "CT-001", delegation_clause_ref: "Cl. 4.2", delegation_scope: ["os_rotina", "NOTIFICACAO_PRAZO", "OS_ROTINA"], valid_from: "2026-01-01", status: "ACTIVE" }, "Delegação conferida com a cláusula 4.2");
    const l = (await su.query("select * from public.external_org_project_links where organization_id=$1", [ORG_G])).rows[0];
    eq(l.status, "ACTIVE", "status"); eq(l.confirmed_by, uid(U.ADMIN), "confirmado por"); ok(l.confirmed_at, "confirmado em");
    eq(l.delegation_scope.sort(), ["NOTIFICACAO_PRAZO", "OS_ROTINA"], "escopo normalizado sem duplicata");
    await rpc(adm, "acc_external_domain_set", PA, ORG_G, "gerenciadora-sintetica.com.br", true, null);
    await rpc(adm, "acc_external_contact_set", PA, ORG_G, "Fiscal.Obra@Gerenciadora-Sintetica.com.br", "Fiscal de obra", "CONFIRMED");
    await rejects(rpc(adm, "acc_external_domain_set", PA, ORG_G, "nao é domínio", true, null), /INVALID_DOMAIN/, "domínio inválido");
    await rejects(rpc(adm, "acc_external_contact_set", PA, ORG_G, "a@b.com\r\nBcc: x@y.com", null, "CONFIRMED"), /INVALID_EMAIL/, "e-mail com injeção");
    await rejects(saveLink(g, PA, { organization_id: ORG_G, role_in_project: "GERENCIADORA", status: "ACTIVE", valid_from: "2026-05-01", valid_until: "2026-01-01" }), /check|violates/i, "vigência invertida");
  });

  // ======================= resolução (fail-closed) =======================
  await check("RESOLVE: contato confirmado e domínio da gerenciadora => known, papel e escopo, valid_now; não ambíguo", async () => {
    const r = await resolve(g, PA, "fiscal.obra@gerenciadora-sintetica.com.br");
    eq(r.known, true, "known"); eq(r.ambiguous, false, "ambiguous"); eq(r.domain_shared, false, "shared");
    eq(r.matches.length, 1, "1 casamento"); eq(r.matches[0].organization_id, ORG_G, "org"); eq(r.matches[0].role_in_project, "GERENCIADORA", "papel");
    eq(r.matches[0].valid_now, true, "vigente"); eq([...r.matches[0].delegation_scope].sort(), ["NOTIFICACAO_PRAZO", "OS_ROTINA"], "escopo");
    const r2 = await resolve(g, PA, "OUTRA.PESSOA@GERENCIADORA-SINTETICA.COM.BR ");
    eq(r2.known, true, "por domínio (caixa alta/espaço)");
    ok(R.hasDelegatedScope(r2, "OS_ROTINA") && !R.hasDelegatedScope(r2, "ADITIVO_PRAZO"), "autoridade só no escopo delegado");
  });

  await check("RESOLVE fail-closed: e-mail inválido/injeção, projeto nulo/inexistente, sem vínculo, outro projeto, LEITURA de outro projeto, anon, sem sub => known=false", async () => {
    const U0r = { matches: [], ambiguous: false, domain_shared: false, known: false };
    for (const e of ["lixo", "a@b.com\r\nBcc: x@y.com", null, "", "a@example.com"]) eq(await resolve(g, PA, e), U0r, `inválido ${JSON.stringify(e)}`);
    eq(await resolve(g, null, "fiscal.obra@gerenciadora-sintetica.com.br"), U0r, "projeto nulo");
    eq(await resolve(g, "10000000-0000-4000-8000-000000000000", "fiscal.obra@gerenciadora-sintetica.com.br"), U0r, "projeto inexistente");
    eq(await resolve(g, PA, "alguem@desconhecido.com.br"), U0r, "desconhecido");
    eq(await resolve(await as(U.ADMINB), PB, "fiscal.obra@gerenciadora-sintetica.com.br"), U0r, "projeto B sem vínculo (segregação por projeto)");
    eq(await resolve(await as(U.ADMINB), PA, "fiscal.obra@gerenciadora-sintetica.com.br"), U0r, "membro de B não resolve no projeto A");
    eq(await resolve(await as(U.INATIVO), PA, "fiscal.obra@gerenciadora-sintetica.com.br"), U0r, "membro inativo");
    eq(await resolve(await as(null, "authenticated"), PA, "fiscal.obra@gerenciadora-sintetica.com.br"), U0r, "sem sub");
    await rejects(resolve(await as(null, "anon"), PA, "fiscal.obra@gerenciadora-sintetica.com.br"), /permission denied/i, "anon");
    eq((await resolve(await as(U.LEITURA), PA, "fiscal.obra@gerenciadora-sintetica.com.br")).known, true, "LEITURA do projeto pode resolver (só leitura)");
    eq((await resolve(await as(null, "service_role"), PA, "fiscal.obra@gerenciadora-sintetica.com.br")).known, true, "service_role (ingestão server-side)");
  });

  await check("RESOLVE: vínculo CANDIDATE aparece mas known=false; vencido => valid_now=false; ENDED não casa; contato REJECTED não casa", async () => {
    await rpc(adm, "acc_external_domain_set", PA, ORG_CLI, "cliente-sintetico.com.br", true, null);
    const lc = await saveLink(adm, PA, { organization_id: ORG_CLI, role_in_project: "CLIENTE", contract_ref: "CT-001", status: "CANDIDATE" });
    let r = await resolve(g, PA, "obra@cliente-sintetico.com.br");
    eq(r.known, false, "candidato não é conhecido"); eq(r.matches[0].link_status, "CANDIDATE", "listado como candidato"); eq(r.matches[0].valid_now, false, "não vigente");
    await saveLink(g, PA, { id: lc, status: "ACTIVE", valid_from: "2025-01-01", valid_until: "2025-12-31" });
    r = await resolve(g, PA, "obra@cliente-sintetico.com.br");
    eq(r.known, true, "ACTIVE"); eq(r.matches[0].valid_now, false, "vencido: nunca vigente");
    await rpc(adm, "acc_external_contact_set", PA, ORG_CLI, "spam@cliente-sintetico.com.br", null, "REJECTED");
    eq((await resolve(g, PA, "spam@cliente-sintetico.com.br")).matches.length, 0, "rejeitado não casa mesmo com domínio");
    await saveLink(g, PA, { id: lc, status: "ENDED" });
    eq(await resolve(g, PA, "obra@cliente-sintetico.com.br"), { matches: [], ambiguous: false, domain_shared: false, known: false }, "ENDED não casa");
    await saveLink(g, PA, { id: lc, status: "ACTIVE", valid_until: null, valid_from: "2026-01-01" });
  });

  // ======================= cenário 16 =======================
  let CAND;
  await check("CENÁRIO 16 — contato novo descoberto: vira candidato PENDING (sem autoridade), idempotente por mensagem, confirmado só por decisão humana de gestão", async () => {
    const sr = await as(null, "service_role");
    const email1 = "20000000-0000-4000-8000-000000000001";
    CAND = await rpc(sr, "acc_external_candidate_register", PA, "Novo.Contato@gerenciadora-sintetica.com.br", email1);
    await rpc(sr, "acc_external_candidate_register", PA, "novo.contato@gerenciadora-sintetica.com.br", email1); // mesma mensagem: não duplica
    await rpc(sr, "acc_external_candidate_register", PA, "novo.contato@gerenciadora-sintetica.com.br", "20000000-0000-4000-8000-000000000002");
    const c = (await su.query("select * from public.external_contact_candidates where id=$1", [CAND])).rows[0];
    eq(c.status, "PENDING", "pendente"); eq(c.message_count, 2, "2 mensagens distintas (a repetida não conta)"); eq(c.suggested_org_id, ORG_G, "sugestão por domínio único no projeto"); eq(c.domain, "gerenciadora-sintetica.com.br", "domínio");
    // Candidato não é contato confirmado: o domínio ainda casa por si, mas o contato exato não existe.
    eq(await nq("select count(*)::int n from public.external_contacts where email='novo.contato@gerenciadora-sintetica.com.br'"), 0, "ainda não é contato");
    await rejects(rpc(await as(U.COLAB), "acc_external_candidate_decide", PA, CAND, "CONFIRM", ORG_G, null), DENIED, "COLABORADOR não decide");
    await rejects(rpc(await as(U.LEITURA), "acc_external_candidate_register", PA, "x@gerenciadora-sintetica.com.br", null), DENIED, "LEITURA não registra");
    ok(await rpc(await as(U.COLAB), "acc_external_candidate_register", PA, "colab.viu@fornecedor-um.com.br", null), "COLABORADOR (REGISTER) pode registrar descoberta");
    await rejects(rpc(g, "acc_external_candidate_decide", PA, CAND, "CONFIRM", ORG_FORN1, null), /NO_LINK/, "organização sem vínculo no projeto");
    const d = await rpc(g, "acc_external_candidate_decide", PA, CAND, "CONFIRM", ORG_G, "Conferido com a gerenciadora");
    eq(d.decision, "CONFIRM", "decisão");
    eq((await su.query("select status, discovered from public.external_contacts where id=$1", [d.contact_id])).rows[0], { status: "CONFIRMED", discovered: true }, "contato confirmado e marcado como descoberto");
    eq((await su.query("select status from public.external_contact_candidates where id=$1", [CAND])).rows[0].status, "CONFIRMED", "candidato confirmado");
    eq(await nq("select count(*)::int n from public.external_contacts_audit where action in ('CANDIDATE_CONFIRM') and actor_id=$1", [uid(U.GESTOR)]), 1, "auditoria da decisão");
    const rej = await rpc(g, "acc_external_candidate_decide", PA, (await su.query("select id from public.external_contact_candidates where email='colab.viu@fornecedor-um.com.br'")).rows[0].id, "REJECT", null, "Não é do projeto");
    eq(rej.decision, "REJECT", "rejeição");
  });

  // ======================= cenário 17 =======================
  await check("CENÁRIO 17 — contato em dois projetos: mesma organização com vínculos distintos; resolução por projeto, sem vazar entre projetos", async () => {
    const a = await as(U.ADMINB);
    await rpc(adm, "acc_external_domain_set", PA, ORG_FORN1, "fornecedor-um.com.br", true, null);
    await rpc(adm, "acc_external_contact_set", PA, ORG_FORN1, "vendas@fornecedor-um.com.br", "Vendas", "CONFIRMED");
    await saveLink(adm, PA, { organization_id: ORG_FORN1, role_in_project: "FORNECEDOR", contract_ref: "OC-100", status: "ACTIVE" });
    // Projeto B: o ADMIN de B não enxerga a organização enquanto ela não tiver vínculo em B (segregação).
    eq((await a.query("select count(*)::int n from public.external_organizations where id=$1", [ORG_FORN1])).rows[0].n, 0, "B não vê a organização de A");
    await rejects(saveLink(a, PB, { organization_id: ORG_FORN1, role_in_project: "FORNECEDOR", status: "CANDIDATE" }), DENIED, "B não vincula organização que não enxerga");
    // O dono do tenant (criador) a leva ao projeto B por decisão própria: precisa ser gestão de B.
    await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'GESTOR','ACTIVE')", [PB, uid(U.GESTOR)]);
    await saveLink(g, PB, { organization_id: ORG_FORN1, role_in_project: "SUBCONTRATADA", contract_ref: "SUB-9", status: "ACTIVE" });
    const rA = await resolve(g, PA, "vendas@fornecedor-um.com.br");
    const rB = await resolve(g, PB, "vendas@fornecedor-um.com.br");
    eq(rA.matches.map((m) => m.role_in_project), ["FORNECEDOR"], "papel no projeto A");
    eq(rB.matches.map((m) => m.role_in_project), ["SUBCONTRATADA"], "papel no projeto B");
    eq(rA.ambiguous || rB.ambiguous, false, "mesma organização não é ambígua");
    // A agora enxerga a organização via vínculo em B? O ADMIN de B vê (vínculo em B) mas NÃO vê vínculos/candidatos de A.
    eq((await a.query("select count(*)::int n from public.external_org_project_links where project_id=$1", [PA])).rows[0].n, 0, "B não vê vínculos de A");
    eq((await a.query("select count(*)::int n from public.external_org_project_links where project_id=$1", [PB])).rows[0].n, 1, "B vê os seus");
    eq((await resolve(a, PB, "vendas@fornecedor-um.com.br")).matches[0].role_in_project, "SUBCONTRATADA", "ADMIN de B resolve em B");
    eq((await resolve(a, PA, "vendas@fornecedor-um.com.br")).known, false, "ADMIN de B não resolve em A");
    // Dois vínculos da MESMA organização no MESMO projeto (contratos distintos) são permitidos; duplicata exata não.
    await saveLink(g, PA, { organization_id: ORG_FORN1, role_in_project: "FORNECEDOR", contract_ref: "OC-200", status: "ACTIVE" });
    eq((await resolve(g, PA, "vendas@fornecedor-um.com.br")).matches.length, 2, "dois vínculos no mesmo projeto");
    await rejects(saveLink(g, PA, { organization_id: ORG_FORN1, role_in_project: "FORNECEDOR", contract_ref: "OC-200", status: "ACTIVE", valid_from: (await su.query("select valid_from::text v from public.external_org_project_links where contract_ref='OC-200'")).rows[0].v }), /duplicate|unique/i, "duplicata exata");
  });

  // ======================= cenário 18 =======================
  await check("CENÁRIO 18 — domínio compartilhado: duas organizações no mesmo domínio => ambiguous/domain_shared; contato confirmado exato desempata; nunca vincula por coincidência", async () => {
    await rpc(adm, "acc_external_domain_set", PA, ORG_FORN2, "grupo-comum.com.br", true, null);
    const r1 = await rpc(adm, "acc_external_domain_set", PA, ORG_FORN2, "grupo-comum.com.br", true, null);
    eq(r1.domain_shared, false, "sozinho ainda não é compartilhado");
    const x = await saveOrg(adm, PA, { legal_name: "Prestador Sintético ME", org_kind: "PRESTADOR" });
    const r2 = await rpc(adm, "acc_external_domain_set", PA, x, "grupo-comum.com.br", true, null);
    eq(r2.domain_shared, true, "agora compartilhado");
    await saveLink(adm, PA, { organization_id: ORG_FORN2, role_in_project: "FORNECEDOR", contract_ref: "OC-300", status: "ACTIVE" });
    // Só uma das duas organizações está vinculada ao projeto: AINDA assim é ambíguo (compartilhado, sem contato exato).
    let r = await resolve(g, PA, "alguem@grupo-comum.com.br");
    eq(r.domain_shared, true, "domain_shared"); eq(r.ambiguous, true, "ambíguo por domínio compartilhado"); eq(r.matches.length, 1, "1 vínculo");
    await saveLink(adm, PA, { organization_id: x, role_in_project: "PRESTADOR", contract_ref: "PS-1", status: "ACTIVE" });
    r = await resolve(g, PA, "alguem@grupo-comum.com.br");
    eq(r.ambiguous, true, "duas organizações casam"); eq(r.matches.length, 2, "2 casamentos");
    // Contato confirmado exato desempata (uma organização só): deixa de ser ambíguo, mas domain_shared continua verdadeiro.
    await rpc(adm, "acc_external_contact_set", PA, ORG_FORN2, "joao@grupo-comum.com.br", "João", "CONFIRMED");
    r = await resolve(g, PA, "joao@grupo-comum.com.br");
    eq(r.matches.length, 2, "o domínio ainda casa as duas, mas...");
    eq(r.ambiguous, true, "...com 2 organizações casando continua ambíguo (consumidor NUNCA vincula)");
    ok(!R.hasDelegatedScope(r, "OS_ROTINA"), "ambíguo nunca autoriza");
    // Desativar o domínio da outra organização resolve a ambiguidade de domínio.
    await rpc(adm, "acc_external_domain_set", PA, x, "grupo-comum.com.br", false, "Domínio não é mais usado por esta organização");
    r = await resolve(g, PA, "joao@grupo-comum.com.br");
    eq(r.domain_shared, false, "deixou de ser compartilhado"); eq(r.ambiguous, false, "sem ambiguidade"); eq(r.matches.length, 1, "1 casamento"); eq(r.matches[0].organization_id, ORG_FORN2, "org do contato");
  });

  // ======================= paridade TS x SQL =======================
  await check("PARIDADE: resolveFromRows (TS) == acc_resolve_external_party (SQL) para todos os e-mails dos cenários, nos projetos A e B", async () => {
    const emails = ["fiscal.obra@gerenciadora-sintetica.com.br", "outra.pessoa@gerenciadora-sintetica.com.br", "novo.contato@gerenciadora-sintetica.com.br", "obra@cliente-sintetico.com.br",
      "spam@cliente-sintetico.com.br", "vendas@fornecedor-um.com.br", "alguem@grupo-comum.com.br", "joao@grupo-comum.com.br", "alguem@desconhecido.com.br", "lixo", "a@example.com", "VENDAS@Fornecedor-Um.com.br"];
    for (const proj of [PA, PB]) {
      const links = (await su.query(`select l.organization_id, o.org_kind, l.role_in_project, l.status, l.delegation_scope, l.valid_from::text valid_from, l.valid_until::text valid_until
        from public.external_org_project_links l join public.external_organizations o on o.id = l.organization_id where l.project_id=$1`, [proj])).rows;
      const domains = (await su.query("select organization_id, domain, active from public.external_org_domains")).rows;
      const contacts = (await su.query("select organization_id, email, status from public.external_contacts")).rows;
      for (const e of emails) {
        const sql = await resolve(await as(null, "service_role"), proj, e);
        const ts = R.resolveFromRows({ links, domains, contacts }, e);
        eq(JSON.parse(JSON.stringify(ts)), sql, `paridade ${e} @ ${proj === PA ? "A" : "B"}`);
      }
    }
  });

  // ======================= RLS e auditoria =======================
  await check("RLS: leitura só com membership ATIVA; LEITURA lê organização/vínculo do projeto mas NÃO lê a auditoria; gestão lê a auditoria; sem sub/inativo/outro projeto não leem", async () => {
    const n = async (c, t, w = "true") => (await c.query(`select count(*)::int n from public.${t} where ${w}`)).rows[0].n;
    ok((await n(await as(U.LEITURA), "external_organizations")) >= 4, "LEITURA lê organizações do projeto");
    ok((await n(await as(U.LEITURA), "external_org_project_links")) >= 1, "LEITURA lê vínculos");
    eq(await n(await as(U.LEITURA), "external_contacts_audit"), 0, "LEITURA não lê auditoria");
    ok((await n(await as(U.GESTOR), "external_contacts_audit")) > 10, "GESTOR lê auditoria");
    eq(await n(await as(U.INATIVO), "external_organizations"), 0, "inativo não vê");
    eq(await n(await as(null, "authenticated"), "external_organizations"), 0, "sem sub não vê");
    eq(await n(await as(U.LEITURAB), "external_org_project_links", `project_id='${PA}'`), 0, "outro projeto não vê vínculos de A");
    eq(await n(await as(U.LEITURAB), "external_contact_candidates", `project_id='${PA}'`), 0, "outro projeto não vê candidatos de A");
    eq(await n(await as(U.LEITURAB), "external_contacts_audit"), 0, "outro projeto não vê auditoria");
  });

  await check("AUDITORIA append-only: nem superusuário altera/apaga/trunca; toda escrita deixou ator, antes/depois e motivo", async () => {
    await rejects(su.query("update public.external_contacts_audit set reason='x'"), /EXTERNAL_CONTACTS_AUDIT_APPEND_ONLY/, "update");
    await rejects(su.query("delete from public.external_contacts_audit"), /EXTERNAL_CONTACTS_AUDIT_APPEND_ONLY/, "delete");
    await rejects(su.query("truncate public.external_contacts_audit"), /EXTERNAL_CONTACTS_AUDIT_APPEND_ONLY/, "truncate");
    eq(await nq("select count(*)::int n from public.external_contacts_audit where actor_id is null"), 0, "toda linha tem ator");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where action like 'LINK_UPDATE_%' and before_state is not null and after_state is not null") >= 1, "update guarda antes/depois");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where reason is not null") >= 1, "motivo registrado");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where action='DOMAIN_SET_INACTIVE'") === 1, "desativação de domínio auditada");
  });

  await check("RPCs de escrita não são executáveis por anon; funções auxiliares internas não são executáveis por authenticated", async () => {
    const a = await as(null, "anon");
    await rejects(rpc(a, "acc_external_org_save", PA, JSON.stringify({ legal_name: "Zz Ltda", org_kind: "OUTRO" })), /permission denied/i, "anon org_save");
    const c = await as(U.ADMIN);
    await rejects(rpc(c, "acc_external_audit_write", PA, "X", "Y", null, null, null, null), /permission denied/i, "audit_write direto");
    await rejects(rpc(c, "acc_external_assert_manage", PA), /permission denied/i, "assert_manage direto");
  });
} finally {
  for (const c of keepOpen) await c.end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
