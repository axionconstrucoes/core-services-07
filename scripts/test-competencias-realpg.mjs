// FASE 4 / A — COMPETÊNCIAS PROFISSIONAIS em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base descartável
// (acc_comp_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role), concorrência real (conexões independentes)
// e dados 100% SINTÉTICOS. Segunda base descartável reproduz o estado LEGADO (decisões já registradas ANTES da migration) e aplica a
// Fase 4/A por cima. Cobre CASO 31 (sem autorização), CASO 37 (auditoria), CASO 39 (isolamento) e CASO F4-A-10..F4-A-24. NÃO roda no CI.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-competencias-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

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
const C = await import("../apps/web/lib/permissions/competences.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const F4 = files.filter((f) => /^202611241\d{5}_/.test(f));
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
const strip = (s) => s.replace(/^﻿/, "");
const read = (f) => strip(readFileSync(path.join(dir, f), "utf8"));

let passed = 0;
let failed = 0;
const open = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 500)}`);
    failed += 1;
  } finally {
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
const stamp = Date.now().toString(36);
const dbs = [];
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
async function newDb(tag) {
  const name = `acc_comp_${tag}_${stamp}`;
  await admin.query(`create database ${name} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
  dbs.push(name);
  const b = new URL(url);
  b.pathname = `/${name}`;
  const dbUrl = b.toString();
  const su = new pg.Client({ connectionString: dbUrl });
  await su.connect();
  await su.query(platform);
  return { su, dbUrl, name };
}

const keepAll = [];
const main = await newDb("m");
const su = main.su;
const dbUrl = main.dbUrl;
try {
  for (const f of files) {
    try { await su.query(read(f)); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  for (let i = 0; i < 2; i += 1) for (const f of F4) await su.query(read(f)); // idempotência: 2 reaplicações
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${F4.length} da fase 4/A reaplicadas 2x) — base ${main.name}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(2600 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000026a0";
  const PB = "10000000-0000-4000-8000-0000000026b0";
  const U = { ADMIN: 1, ADMIN2: 2, GESTOR: 3, GERENTE: 4, COLAB: 5, LEITURA: 6, INATIVO: 7, PENDENTE: 8, ADMINB: 9, GJUR: 10, GTEC: 11, GSEG: 12, GNADA: 13 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `comp-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `COMP ${n}`, `comp-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','CPA','C','L','2026-01-01','2027-01-01'),($2,'Obra B','CPB','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.ADMIN2, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  for (const g of [U.GJUR, U.GTEC, U.GSEG, U.GNADA]) await mem(PA, g, "GESTOR");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [PA, `comp-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);
  const doc = async (project, title) => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [project, title])).rows[0].id;
  const DA = await doc(PA, "Documento A (sintético)");
  const DB = await doc(PB, "Documento B (sintético)");

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const rpc = async (c, fn, ...args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r;
  const n = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const grant = (c, project, user, comp, data = {}) => rpc(c, "project_competence_grant", project, uid(user), comp, JSON.stringify(data));
  const has = async (user, project, comp) => (await (await as(user)).query("select public.acc_has_competence($1,$2) r", [project, comp])).rows[0].r;
  let seq = 0;
  const uniq = () => `${Date.now().toString(36)}-${(seq += 1)}`;

  // Concessões pelo CAMINHO REAL (RPC, só ADMIN; ninguém concede a si mesmo): ADMIN concede a ADMIN2 e aos especialistas; ADMIN2 concede a ADMIN.
  const a1 = await as(U.ADMIN);
  const a2 = await as(U.ADMIN2);
  keepAll.push(...open.splice(0)); // a1/a2 duram o teste inteiro (os demais são fechados a cada caso)
  const gJUR = await grant(a1, PA, U.GJUR, "JURIDICO", { registration_kind: "OAB", registration_number: "SINT-0001", basis_note: "Advogado sintético" });
  const gTEC = await grant(a1, PA, U.GTEC, "TECNICO_RESPONSAVEL", { registration_kind: "CREA", registration_number: "SINT-0002" });
  const gSEG = await grant(a1, PA, U.GSEG, "SEGUROS");
  await grant(a1, PA, U.ADMIN2, "JURIDICO");
  await grant(a1, PA, U.ADMIN2, "SEGUROS");
  await grant(a2, PA, U.ADMIN, "TECNICO_RESPONSAVEL");
  await grant(a2, PA, U.ADMIN, "SEGUROS");

  // ---------------------------------------------------------------------------------------------------------------
  await check("CASO F4-A-10 ESTRUTURA: RLS ligado, sem escrita direta para anon/authenticated, eventos append-only, funções fechadas, anon sem acesso", async () => {
    for (const t of ["project_competences", "project_competence_events"]) {
      eq((await su.query("select relrowsecurity from pg_class where oid=$1::regclass", [`public.${t}`])).rows[0].relrowsecurity, true, `RLS ${t}`);
      eq((await su.query(`select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name=$1 and grantee in ('anon','authenticated','public') and privilege_type <> 'SELECT'`, [t])).rows, [], `escrita direta em ${t}`);
      eq(await n("select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name=$1 and grantee='anon'", [t]), 0, `anon em ${t}`);
    }
    for (const [fn, sig] of [["acc_has_competence", "uuid, text"], ["project_competence_grant", "uuid, uuid, text, jsonb"], ["project_competence_revoke", "uuid, integer, text"]]) {
      const r = (await su.query(`select has_function_privilege('anon', 'public.${fn}(${sig})', 'execute') anon, has_function_privilege('public', 'public.${fn}(${sig})', 'execute') pub, has_function_privilege('authenticated', 'public.${fn}(${sig})', 'execute') auth`)).rows[0];
      eq([r.anon, r.pub, r.auth], [false, false, true], `EXECUTE de ${fn}`);
    }
    for (const [fn, sig] of [["acc_user_has_competence", "uuid, uuid, text[]"], ["acc_int_require_competence", "uuid, uuid, text[], text"]]) {
      const r = (await su.query(`select has_function_privilege('authenticated', 'public.${fn}(${sig})', 'execute') auth, has_function_privilege('anon', 'public.${fn}(${sig})', 'execute') anon`)).rows[0];
      eq([r.auth, r.anon], [false, false], `função interna ${fn} fechada`);
    }
    eq(await n("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('acc_has_competence','project_competence_grant','project_competence_revoke','acc_user_has_competence') and p.prosecdef and p.proconfig @> array['search_path=\"\"']"), 4, "SECURITY DEFINER com search_path vazio");
    const g = await su.query("select count(*)::int n from project_competences where project_id=$1", [PA]);
    ok(g.rows[0].n >= 6, "concessões feitas pela RPC");
  });

  await check("CASO 31 / F4-A-11 (autorização negativa — CONCESSÃO): só ADMINISTRADOR ativo concede; todos os outros perfis, inativo, pendente, outro projeto, anon e sem sub são recusados SEM efeito", async () => {
    const before = await n("select count(*)::int n from public.project_competences");
    const beforeEv = await n("select count(*)::int n from public.project_competence_events");
    const cases = [["LEITURA", U.LEITURA], ["COLABORADOR", U.COLAB], ["GESTOR", U.GESTOR], ["GERENTE", U.GERENTE], ["INATIVO", U.INATIVO], ["PENDENTE", U.PENDENTE], ["OUTRO_PROJETO", U.ADMINB], ["GESTOR_COM_JURIDICO", U.GJUR]];
    for (const [label, who] of cases) await rejects(grant(await as(who), PA, U.GNADA, "JURIDICO"), /FORBIDDEN/, label);
    await rejects(grant(await as(null, "authenticated"), PA, U.GNADA, "JURIDICO"), /AUTH_REQUIRED/, "authenticated sem sub");
    await rejects(rpc(await as(null, "anon"), "project_competence_grant", PA, uid(U.GNADA), "JURIDICO", "{}"), /permission denied/i, "anon");
    eq(await n("select count(*)::int n from public.project_competences"), before, "nenhuma competência criada");
    eq(await n("select count(*)::int n from public.project_competence_events"), beforeEv, "nenhum evento criado");
    // o ADMINISTRADOR do projeto B não concede em A, nem o de A em B
    await rejects(grant(await as(U.ADMINB), PA, U.GNADA, "JURIDICO"), /FORBIDDEN/, "ADMIN de B em A");
    await rejects(grant(a1, PB, U.ADMINB, "JURIDICO"), /FORBIDDEN/, "ADMIN de A em B");
  });

  await check("CASO F4-A-12 (concessão — validações): sem autoconcessão, só membro ativo do mesmo projeto, competência da lista fechada, validade coerente, registro declarado (nunca inventado), evidência do mesmo projeto, duplicada ativa recusada", async () => {
    await rejects(grant(a1, PA, U.ADMIN, "JURIDICO"), /SELF_GRANT_FORBIDDEN/, "autoconcessão");
    await rejects(grant(a1, PA, U.INATIVO, "JURIDICO"), /TARGET_NOT_ACTIVE_MEMBER/, "membro inativo");
    await rejects(grant(a1, PA, U.ADMINB, "JURIDICO"), /TARGET_NOT_ACTIVE_MEMBER/, "membro de outro projeto");
    await rejects(grant(a1, PA, U.PENDENTE, "JURIDICO"), /TARGET_NOT_ACTIVE_MEMBER/, "convite pendente não é membro");
    await rejects(grant(a1, PA, U.GNADA, "ADVOGADO"), /INVALID_COMPETENCE/, "competência fora da lista");
    await rejects(grant(a1, PA, U.GNADA, "GESTOR"), /INVALID_COMPETENCE/, "papel não é competência");
    await rejects(rpc(a1, "project_competence_grant", PA, null, "JURIDICO", "{}"), /INVALID_COMPETENCE/, "pessoa nula");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { valid_from: "2026-12-10", valid_until: "2026-12-01" }), /INVALID_VALIDITY/, "fim antes do início");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { valid_until: "2020-01-01", valid_from: "2019-01-01" }), /INVALID_VALIDITY/, "validade já encerrada");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { valid_until: "amanhã" }), /INVALID_INPUT/, "data inválida");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { registration_number: "123" }), /INVALID_REGISTRATION/, "número sem tipo");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { registration_kind: "CRM", registration_number: "1" }), /INVALID_REGISTRATION_KIND/, "tipo de registro desconhecido");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { registration_kind: "OAB", registration_number: "9".repeat(61) }), /INVALID_REGISTRATION/, "número longo");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { evidence_document_id: DB }), /REFERENCE_OUT_OF_PROJECT/, "evidência de outro projeto");
    await rejects(grant(a1, PA, U.GNADA, "JURIDICO", { evidence_document_id: "00000000-0000-4000-8000-00000000ffff" }), /REFERENCE_OUT_OF_PROJECT/, "evidência inexistente");
    await rejects(grant(a1, PA, U.GJUR, "JURIDICO"), /ALREADY_ACTIVE/, "mesma competência ativa");
    eq(await n("select count(*)::int n from public.project_competences where user_id=$1", [uid(U.GNADA)]), 0, "nada gravado para GNADA");
    // registro é TEXTO declarado: gravado como informado, sem validar nem completar
    const r = (await su.query("select registration_kind, registration_number, granted_by, status, row_version from public.project_competences where id=$1", [gJUR.id])).rows[0];
    eq([r.registration_kind, r.registration_number, r.granted_by, r.status, r.row_version], ["OAB", "SINT-0001", uid(U.ADMIN), "ACTIVE", 1], "registro declarado");
    // sem número informado: continua nulo (nunca inventado)
    eq((await su.query("select registration_kind, registration_number from public.project_competences where id=$1", [gSEG.id])).rows[0], { registration_kind: null, registration_number: null }, "registro não inventado");
    // evidência do MESMO projeto aceita
    const withEv = await grant(a1, PA, U.GNADA, "SEGUROS", { evidence_document_id: DA });
    ok(withEv.id, "evidência do mesmo projeto");
    await rpc(a1, "project_competence_revoke", withEv.id, 1, "Concessão de teste revogada logo em seguida.");
  });

  await check("CASO F4-A-13 (acc_has_competence): vale só ativa, na validade e com membro ATIVO do próprio projeto; revogada, vencida, futura, outro projeto, inativo, anon e sem sub => falso", async () => {
    eq(await has(U.GJUR, PA, "JURIDICO"), true, "vigente");
    eq(await has(U.GJUR, PA, "TECNICO_RESPONSAVEL"), false, "outra competência");
    eq(await has(U.GJUR, PB, "JURIDICO"), false, "outro projeto");
    eq(await has(U.GNADA, PA, "JURIDICO"), false, "sem registro");
    eq(await has(U.GJUR, PA, "INVENTADA"), false, "competência desconhecida");
    const c = await as(U.GJUR);
    eq((await c.query("select public.acc_has_competence(null,'JURIDICO') r")).rows[0].r, false, "projeto nulo");
    eq((await c.query("select public.acc_has_competence($1,null) r", [PA])).rows[0].r, false, "competência nula");
    eq((await (await as(null, "authenticated")).query("select public.acc_has_competence($1,'JURIDICO') r", [PA])).rows[0].r, false, "authenticated sem sub");
    await rejects((await as(null, "anon")).query("select public.acc_has_competence($1,'JURIDICO')", [PA]), /permission denied/i, "anon");
    // vencida / futura (linhas inseridas direto, como seria uma competência com prazo que passou)
    await su.query("insert into public.project_competences (project_id,user_id,competence,valid_from,valid_until,granted_by,basis_note) values ($1,$2,'JURIDICO','2025-01-01','2025-12-31',$3,'fixture-direto')", [PA, uid(U.GNADA), uid(U.ADMIN)]);
    eq(await has(U.GNADA, PA, "JURIDICO"), false, "vencida");
    await su.query("insert into public.project_competences (project_id,user_id,competence,valid_from,granted_by,basis_note) values ($1,$2,'TECNICO_RESPONSAVEL',current_date + 5,$3,'fixture-direto')", [PA, uid(U.GERENTE), uid(U.ADMIN)]);
    eq(await has(U.GERENTE, PA, "TECNICO_RESPONSAVEL"), false, "ainda não vigente");
    // membro que deixa de ser ativo perde a competência (sem apagar o registro)
    await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'GESTOR','ACTIVE')", [PB, uid(U.GJUR)]);
    await su.query("update public.project_memberships set status='INACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.GJUR)]);
    eq(await has(U.GJUR, PA, "JURIDICO"), false, "membro inativo");
    await su.query("update public.project_memberships set status='ACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.GJUR)]);
    eq(await has(U.GJUR, PA, "JURIDICO"), true, "reativado volta a valer (registro preservado)");
    // paridade com o espelho TS
    const rows = (await su.query("select user_id, project_id, competence, status, valid_from::text, valid_until::text from public.project_competences")).rows;
    const lite = rows.map((r) => ({ userId: r.user_id, projectId: r.project_id, competence: r.competence, status: r.status, validFrom: r.valid_from, validUntil: r.valid_until }));
    const today = (await su.query("select current_date::text d")).rows[0].d;
    for (const [who, proj, comp] of [[U.GJUR, PA, "JURIDICO"], [U.GNADA, PA, "JURIDICO"], [U.GNADA, PA, "SEGUROS"], [U.GTEC, PA, "TECNICO_RESPONSAVEL"], [U.GTEC, PA, "JURIDICO"], [U.ADMIN2, PA, "SEGUROS"]]) {
      eq(C.hasCompetence(lite, uid(who), proj, [comp], today, true), await has(who, proj, comp), `paridade TS x SQL ${who}/${comp}`);
    }
    await su.query("delete from public.project_memberships where project_id=$1 and user_id=$2", [PB, uid(U.GJUR)]);
  });

  await check("CASO F4-A-14 (revogação): só ADMINISTRADOR, motivo obrigatório, versão otimista, não reabre, efeito imediato; o registro nunca é apagado", async () => {
    const g = await grant(a1, PA, U.GNADA, "TECNICO_RESPONSAVEL");
    for (const [label, who] of [["COLABORADOR", U.COLAB], ["GESTOR", U.GESTOR], ["GERENTE", U.GERENTE], ["LEITURA", U.LEITURA], ["ADMIN de outro projeto", U.ADMINB], ["inativo", U.INATIVO], ["o próprio titular (GNADA)", U.GNADA]]) {
      await rejects(rpc(await as(who), "project_competence_revoke", g.id, 1, "Tentativa sem autorização."), /FORBIDDEN/, label);
    }
    await rejects(rpc(await as(null, "authenticated"), "project_competence_revoke", g.id, 1, "Tentativa sem sub."), /AUTH_REQUIRED/, "sem sub");
    eq(await has(U.GNADA, PA, "TECNICO_RESPONSAVEL"), true, "continua valendo após tentativas barradas");
    await rejects(rpc(a1, "project_competence_revoke", g.id, 1, "curto"), /REASON_REQUIRED/, "motivo curto");
    await rejects(rpc(a1, "project_competence_revoke", g.id, null, "Motivo suficiente para revogar."), /EXPECTED_VERSION_REQUIRED/, "versão ausente");
    await rejects(rpc(a1, "project_competence_revoke", g.id, 7, "Motivo suficiente para revogar."), /VERSION_CONFLICT/, "versão errada");
    const rv = await rpc(a1, "project_competence_revoke", g.id, 1, "Mudou de função; revogação de teste.");
    eq([rv.status, rv.rowVersion], ["REVOKED", 2], "revogada");
    eq(await has(U.GNADA, PA, "TECNICO_RESPONSAVEL"), false, "efeito imediato");
    await rejects(rpc(a1, "project_competence_revoke", g.id, 2, "Segunda revogação do mesmo registro."), /ALREADY_REVOKED/, "já revogada");
    const row = (await su.query("select status, revoked_by, revoke_reason from public.project_competences where id=$1", [g.id])).rows[0];
    eq([row.status, row.revoked_by, row.revoke_reason.length > 10], ["REVOKED", uid(U.ADMIN), true], "revogação registrada");
    // imutabilidade (vale até para superusuário): sem delete, sem reabrir, sem alterar campos de concessão
    await rejects(su.query("delete from public.project_competences where id=$1", [g.id]), /COMPETENCE_IMMUTABLE/, "delete");
    await rejects(su.query("update public.project_competences set status='ACTIVE', revoked_at=null, revoked_by=null, revoke_reason=null where id=$1", [g.id]), /COMPETENCE_IMMUTABLE|check constraint/i, "reabrir");
    await rejects(su.query("update public.project_competences set competence='SEGUROS' where id=$1", [gJUR.id]), /COMPETENCE_IMMUTABLE/, "trocar competência");
    await rejects(su.query("update public.project_competences set valid_until='2099-01-01' where id=$1", [gJUR.id]), /COMPETENCE_IMMUTABLE/, "estender validade direto");
    await rejects(su.query("truncate public.project_competences"), /INSURANCE_NO_DELETE|INSURANCE_APPEND_ONLY|cannot truncate a table referenced/, "truncate (barrado pela FK dos eventos e pelo gatilho)");
    // concessão nova depois da revogação é possível (novo registro, histórico preservado)
    const again = await grant(a1, PA, U.GNADA, "TECNICO_RESPONSAVEL");
    ok(again.id !== g.id, "novo registro");
    eq(await n("select count(*)::int n from public.project_competences where user_id=$1 and competence='TECNICO_RESPONSAVEL'", [uid(U.GNADA)]), 2, "histórico: 2 registros");
    await rpc(a1, "project_competence_revoke", again.id, 1, "Encerrando competência de teste do GNADA.");
  });

  // ---------- fixtures de domínio ----------
  const POL = { modality: "SEGURO_GARANTIA_EXECUTANTE", insurer_name: "Seguradora Sintética SA", source_document_id: DA, coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000 };
  const mkPolicy = async () => rpc(a1, "insurance_policy_create", PA, JSON.stringify({ ...POL, policy_number: `SINT-${uniq()}` }));
  /** Leva um sinistro até REGULACAO (etapas operacionais, sem competência) e devolve {id, rowVersion}. */
  async function claimAt(stage = "REGULACAO") {
    const pol = await mkPolicy();
    let c = await rpc(await as(U.COLAB), "insurance_claim_open", PA, JSON.stringify({ claim_kind: "OUTRO", title: "Evento sintético", stage: "AVISO", policy_id: pol.id, source_ref: `c-${uniq()}` }));
    if (stage === "AVISO") return c;
    c = await rpc(await as(U.COLAB), "insurance_claim_advance", c.id, c.rowVersion, "REGULACAO", JSON.stringify({ note: "Regulação iniciada (sintético)." }));
    return c;
  }
  const adv = (c, claim, to, extra = {}) => rpc(c, "insurance_claim_advance", claim.id, claim.rowVersion, to, JSON.stringify({ note: "Registro fundamentado do ato (sintético).", ...extra }));
  const stageOf = async (id) => (await su.query("select stage from public.insurance_claims where id=$1", [id])).rows[0].stage;

  await check("CASO 31 / F4-A-15 (SINISTRO): decisão, negativa, contestação e indenização exigem JURIDICO além do nível MANAGE — GESTOR/GERENTE/ADMIN sem competência, ou só com SEGUROS/TÉCNICO, são recusados; etapas operacionais seguem sem competência", async () => {
    // etapas operacionais: COLABORADOR avança sem competência alguma
    const c0 = await claimAt("REGULACAO");
    eq(await stageOf(c0.id), "REGULACAO", "COLABORADOR registrou aviso e regulação sem competência");
    for (const to of ["DECISAO", "NEGATIVA"]) {
      const who = [["GESTOR sem competência", U.GNADA], ["GERENTE sem competência", U.GERENTE], ["ADMINISTRADOR sem JURIDICO (só técnico/seguros)", U.ADMIN], ["GESTOR só SEGUROS", U.GSEG], ["GESTOR só TÉCNICO", U.GTEC]];
      for (const [label, u] of who) await rejects(adv(await as(u), c0, to, { decision_outcome: "DEFERIDO" }), /COMPETENCE_REQUIRED/, `${to} por ${label}`);
      await rejects(adv(await as(U.COLAB), c0, to, { decision_outcome: "DEFERIDO" }), /FORBIDDEN/, `${to} por COLABORADOR (nível)`);
      await rejects(adv(await as(U.LEITURA), c0, to, { decision_outcome: "DEFERIDO" }), /FORBIDDEN/, `${to} por LEITURA`);
      await rejects(adv(await as(U.ADMINB), c0, to, { decision_outcome: "DEFERIDO" }), /FORBIDDEN/, `${to} por ADMIN de outro projeto`);
    }
    eq(await stageOf(c0.id), "REGULACAO", "nada mudou após as recusas");
    eq(await n("select count(*)::int n from public.insurance_claim_steps where claim_id=$1 and stage in ('DECISAO','NEGATIVA')", [c0.id]), 0, "nenhum passo gravado");
    // com JURIDICO (GESTOR sem MANAGE? GJUR é GESTOR): decisão deferida -> indenização -> contestação
    const dec = await adv(await as(U.GJUR), c0, "DECISAO", { decision_outcome: "DEFERIDO" });
    eq(await stageOf(c0.id), "DECISAO", "GESTOR com JURIDICO decide");
    await rejects(adv(await as(U.GNADA), dec, "INDENIZACAO_CUMPRIMENTO"), /COMPETENCE_REQUIRED/, "indenização sem competência");
    await rejects(adv(await as(U.GNADA), dec, "CONTESTACAO"), /COMPETENCE_REQUIRED/, "contestação sem competência");
    const ind = await adv(await as(U.ADMIN2), dec, "INDENIZACAO_CUMPRIMENTO"); // ADMIN2 é ADMINISTRADOR com JURIDICO
    eq(await stageOf(c0.id), "INDENIZACAO_CUMPRIMENTO", "ADMINISTRADOR com JURIDICO registra indenização");
    // negativa e contestação com JURIDICO
    const c1 = await claimAt("REGULACAO");
    const neg = await adv(await as(U.GJUR), c1, "NEGATIVA");
    await rejects(adv(await as(U.GERENTE), neg, "CONTESTACAO"), /COMPETENCE_REQUIRED/, "contestação por GERENTE sem competência");
    await adv(await as(U.GJUR), neg, "CONTESTACAO");
    eq(await stageOf(c1.id), "CONTESTACAO", "contestação com JURIDICO");
    // ENCERRADO continua sendo ato de gestão sem exigir competência específica (decisão consciente; registrada na matriz)
    const c2 = await claimAt("REGULACAO");
    await adv(await as(U.GNADA), c2, "ENCERRADO");
    eq(await stageOf(c2.id), "ENCERRADO", "encerramento só exige MANAGE");
    ok(ind.rowVersion >= 1, "ok");
  });

  await check("CASO 31 / F4-A-16 (MINUTA): aprovar para envio exige ADMINISTRADOR + SEGUROS ou JURIDICO; sem competência, só técnica ou GESTOR são recusados; envio real continua impossível", async () => {
    const pol = await mkPolicy();
    const mk = async () => rpc(a1, "insurance_draft_create", PA, JSON.stringify({ policy_id: pol.id, draft_kind: "AVISO_SINISTRO", subject: "Minuta sintética", body: "Prezados, segue minuta sintética de comunicação para a seguradora, sem dados reais." }));
    const CONF = "APROVO O CONTEUDO PARA ENVIO";
    const d = await mk();
    // ADMINISTRADOR cujo único registro é TECNICO_RESPONSAVEL: nível ADMIN, sem competência de minuta
    await su.query("update public.project_memberships set status='ACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.ADMIN)]);
    const admTec = await as(U.ADMIN); // ADMIN tem TECNICO_RESPONSAVEL e SEGUROS (concedidas por ADMIN2): usar ADMIN2? ver abaixo
    // criar um terceiro administrador sem competência de minuta
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(40), "comp-40@axion.com.br"]);
    await su.query("insert into public.profiles (id,name,email) values ($1,'COMP 40','comp-40@axion.com.br') on conflict (id) do nothing", [uid(40)]);
    await mem(PA, 40, "ADMINISTRADOR");
    await grant(a1, PA, 40, "TECNICO_RESPONSAVEL");
    const admOnlyTec = await as(40);
    await rejects(rpc(admOnlyTec, "insurance_draft_approve", d.id, d.rowVersion, CONF), /COMPETENCE_REQUIRED/, "ADMINISTRADOR só com competência técnica");
    await rejects(rpc(await as(U.GJUR), "insurance_draft_approve", d.id, d.rowVersion, CONF), /FORBIDDEN/, "GESTOR com JURIDICO não é ADMINISTRADOR (nível)");
    await rejects(rpc(await as(U.COLAB), "insurance_draft_approve", d.id, d.rowVersion, CONF), /FORBIDDEN/, "COLABORADOR");
    await rejects(rpc(await as(U.ADMINB), "insurance_draft_approve", d.id, d.rowVersion, CONF), /FORBIDDEN/, "ADMIN de outro projeto");
    eq((await su.query("select state, approved_by from public.insurance_drafts where id=$1", [d.id])).rows[0], { state: "DRAFT", approved_by: null }, "minuta intacta");
    const okA = await rpc(admTec, "insurance_draft_approve", d.id, d.rowVersion, CONF); // ADMIN tem SEGUROS
    eq([okA.state, okA.sent], ["APROVADA_PARA_ENVIO", false], "ADMINISTRADOR com SEGUROS aprova; nada é enviado");
    const d2 = await mk();
    eq((await rpc(a2, "insurance_draft_approve", d2.id, d2.rowVersion, CONF)).state, "APROVADA_PARA_ENVIO", "ADMINISTRADOR com JURIDICO também aprova");
    eq((await su.query("select real_send_enabled from public.insurance_settings where project_id=$1", [PA])).rows[0]?.real_send_enabled ?? false, false, "trava de envio real desligada");
  });

  await check("CASO 31 / F4-A-17 (QUALIDADE — RNC): confirmar, não confirmar e encerrar (laudo técnico) exigem TECNICO_RESPONSAVEL; GESTOR/GERENTE/ADMIN sem competência e quem só tem JURIDICO/SEGUROS são recusados; etapas de triagem seguem sem competência", async () => {
    const ev = async (c, ncr) => (await rpc(c, "quality_evidence_register", PA, "DOCUMENTO", `ev-${uniq()}`, "NC_COMPROVADA", "FATO", ncr, null)).id;
    const mkNcr = async () => rpc(await as(U.GESTOR), "quality_ncr_create", PA, `RNC sintética ${uniq()}`, "descrição", "EMAIL", `ref-${uniq()}`);
    const toInvest = async () => {
      const x = await mkNcr();
      const t = await rpc(await as(U.COLAB), "quality_ncr_transition", x.id, "TRIAGEM", x.rowVersion, null, null, null); // COLABORADOR faz triagem sem competência
      const i = await rpc(await as(U.COLAB), "quality_ncr_transition", x.id, "INVESTIGACAO", t.rowVersion, null, null, null);
      return { id: x.id, v: i.rowVersion };
    };
    const J = "Laudo técnico fundamentado pelo responsável técnico (sintético).";
    const r = await toInvest();
    const g = await as(U.GESTOR);
    const e1 = await ev(g, r.id);
    for (const [label, u] of [["GESTOR sem competência", U.GESTOR], ["GERENTE sem competência", U.GERENTE], ["ADMINISTRADOR 2 (só JURIDICO e SEGUROS)", U.ADMIN2], ["GESTOR só JURIDICO", U.GJUR], ["GESTOR só SEGUROS", U.GSEG]]) {
      await rejects(rpc(await as(u), "quality_ncr_transition", r.id, "CONFIRMADA", r.v, J, [e1], null), /COMPETENCE_REQUIRED/, `CONFIRMADA por ${label}`);
      await rejects(rpc(await as(u), "quality_ncr_transition", r.id, "NAO_CONFIRMADA", r.v, J, [e1], null), /COMPETENCE_REQUIRED/, `NAO_CONFIRMADA por ${label}`);
    }
    await rejects(rpc(await as(U.COLAB), "quality_ncr_transition", r.id, "CONFIRMADA", r.v, J, [e1], null), /FORBIDDEN/, "COLABORADOR (nível)");
    await rejects(rpc(await as(U.LEITURA), "quality_ncr_transition", r.id, "CONFIRMADA", r.v, J, [e1], null), /FORBIDDEN/, "LEITURA");
    await rejects(rpc(await as(U.ADMINB), "quality_ncr_transition", r.id, "CONFIRMADA", r.v, J, [e1], null), /FORBIDDEN/, "ADMIN de outro projeto");
    eq((await su.query("select state, row_version from public.quality_ncrs where id=$1", [r.id])).rows[0], { state: "INVESTIGACAO", row_version: r.v }, "RNC intacta");
    eq(await n("select count(*)::int n from public.quality_state_events where entity_id=$1 and to_state in ('CONFIRMADA','NAO_CONFIRMADA')", [r.id]), 0, "nenhum evento de laudo");
    const conf = await rpc(await as(U.GTEC), "quality_ncr_transition", r.id, "CONFIRMADA", r.v, J, [e1], null);
    eq(conf.to, "CONFIRMADA", "GESTOR com TECNICO_RESPONSAVEL confirma");
    const r2 = await toInvest();
    const e2 = await ev(g, r2.id);
    eq((await rpc(await as(U.ADMIN), "quality_ncr_transition", r2.id, "CONFIRMADA", r2.v, J, [e2], null)).to, "CONFIRMADA", "ADMINISTRADOR com TECNICO_RESPONSAVEL confirma");
    // não confirmada por quem tem a competência; cancelamento (ato de gestão, não laudo) segue sem competência
    const r3 = await toInvest();
    await rpc(await as(U.GESTOR), "quality_ncr_transition", r3.id, "CANCELADA", r3.v, "Cancelada por duplicidade operacional (sintético).", null, null);
    const r4 = await toInvest();
    const e4 = await ev(g, r4.id);
    eq((await rpc(await as(U.GTEC), "quality_ncr_transition", r4.id, "NAO_CONFIRMADA", r4.v, J, [e4], null)).to, "NAO_CONFIRMADA", "NÃO CONFIRMADA com competência");
  });

  await check("CASO 31 / F4-A-18 (QUALIDADE — GARANTIA): parecer de cobertura (COBERTA / NÃO COBERTA) exige TECNICO_RESPONSAVEL; sem competência é recusado; vistoria e análise seguem sem competência", async () => {
    const mkW = async () => rpc(await as(U.GESTOR), "quality_warranty_create", PA, "Pintura interna", "Descascamento de tinta (sintético)", JSON.stringify({ origin_type: "EMAIL", origin_ref: `w-${uniq()}` }));
    const toAnalise = async () => {
      const w = await mkW();
      const v = await rpc(await as(U.COLAB), "quality_warranty_transition", w.id, "EM_VISTORIA", w.rowVersion, null, null);
      const a = await rpc(await as(U.COLAB), "quality_warranty_transition", w.id, "EM_ANALISE", v.rowVersion, null, null);
      return { id: w.id, v: a.rowVersion };
    };
    const evW = async (w) => (await rpc(await as(U.GESTOR), "quality_evidence_register", PA, "DOCUMENTO", `evw-${uniq()}`, "NC_COMPROVADA", "FATO", null, w)).id;
    const J = "Parecer de cobertura fundamentado pelo responsável técnico (sintético).";
    const w = await toAnalise();
    const e = await evW(w.id);
    for (const [label, u] of [["GESTOR sem competência", U.GESTOR], ["GERENTE", U.GERENTE], ["ADMINISTRADOR 2 (JURIDICO/SEGUROS)", U.ADMIN2], ["GESTOR só JURIDICO", U.GJUR]]) {
      await rejects(rpc(await as(u), "quality_warranty_transition", w.id, "COBERTA", w.v, J, [e]), /COMPETENCE_REQUIRED/, `COBERTA por ${label}`);
      await rejects(rpc(await as(u), "quality_warranty_transition", w.id, "NAO_COBERTA", w.v, J, [e]), /COMPETENCE_REQUIRED/, `NAO_COBERTA por ${label}`);
    }
    await rejects(rpc(await as(U.COLAB), "quality_warranty_transition", w.id, "COBERTA", w.v, J, [e]), /FORBIDDEN/, "COLABORADOR (nível)");
    eq((await su.query("select state from public.quality_warranty_cases where id=$1", [w.id])).rows[0].state, "EM_ANALISE", "caso intacto");
    eq((await rpc(await as(U.GTEC), "quality_warranty_transition", w.id, "COBERTA", w.v, J, [e])).to, "COBERTA", "com TECNICO_RESPONSAVEL");
    const w2 = await toAnalise();
    const e2 = await evW(w2.id);
    eq((await rpc(await as(U.ADMIN), "quality_warranty_transition", w2.id, "NAO_COBERTA", w2.v, J, [e2])).to, "NAO_COBERTA", "NÃO COBERTA com TECNICO_RESPONSAVEL (ADMIN)");
  });

  await check("CASO F4-A-19 (efeito imediato e vencimento): revogar ou vencer a competência volta a bloquear o ato; o gatilho vale também para escrita direta com autor atribuído (superusuário); sem autor atribuído só em carga de manutenção", async () => {
    const jur = await grant(a1, PA, U.GNADA, "JURIDICO");
    const c = await claimAt("REGULACAO");
    await rpc(a1, "project_competence_revoke", jur.id, 1, "Revogação para provar o efeito imediato.");
    await rejects(adv(await as(U.GNADA), c, "DECISAO", { decision_outcome: "INDEFERIDO" }), /COMPETENCE_REQUIRED/, "após revogar");
    // escrita direta (superusuário) atribuída a quem não tem competência: o gatilho barra assim mesmo
    await rejects(su.query("insert into public.insurance_claim_steps (project_id,claim_id,from_stage,stage,created_by) values ($1,$2,'REGULACAO','NEGATIVA',$3)", [PA, c.id, uid(U.GNADA)]), /COMPETENCE_REQUIRED/, "insert direto atribuído a quem não tem competência");
    // com competência vigente, o mesmo insert direto é aceito (é o que a RPC faz); sem autor atribuído (carga de manutenção) também
    await su.query("insert into public.insurance_claim_steps (project_id,claim_id,from_stage,stage,created_by) values ($1,$2,'REGULACAO','NEGATIVA',$3)", [PA, c.id, uid(U.GJUR)]);
    await su.query("insert into public.insurance_claim_steps (project_id,claim_id,from_stage,stage) values ($1,$2,'REGULACAO','NEGATIVA')", [PA, c.id]);
    // validade que termina: competência com validade futura vale; o mesmo registro "vencido" (linha inserida com validade passada) não vale
    await su.query("insert into public.project_competences (project_id,user_id,competence,valid_from,valid_until,granted_by,basis_note) values ($1,$2,'JURIDICO','2025-01-01','2025-06-30',$3,'fixture-direto')", [PA, uid(U.GNADA), uid(U.ADMIN)]);
    await rejects(su.query("insert into public.insurance_claim_steps (project_id,claim_id,from_stage,stage,created_by) values ($1,$2,'REGULACAO','DECISAO',$3)", [PA, c.id, uid(U.GNADA)]), /COMPETENCE_REQUIRED/, "competência vencida");
  });

  await check("CASO 37 / F4-A-20 (AUDITORIA): concessão e revogação geram evento append-only (com ator e nível) e entrada em audit_log_entries; eventos e auditoria não são alteráveis nem por superusuário", async () => {
    const ev = (await su.query("select action, actor_user_id, actor_tier, target_user_id, competence, detail from public.project_competence_events where competence_id=$1 order by created_at", [gJUR.id])).rows;
    eq(ev.map((e) => [e.action, e.actor_user_id, e.actor_tier, e.target_user_id, e.competence]), [["GRANTED", uid(U.ADMIN), "ADMIN", uid(U.GJUR), "JURIDICO"]], "evento de concessão");
    eq(ev[0].detail.hasRegistrationNumber, true, "indica que há número, sem repetir dado sensível desnecessário");
    ok(/não valida o registro/.test(ev[0].detail.note), "evento declara que o registro não é validado");
    const au = (await su.query("select action, actor_user_id, entity_type, entity_id from public.audit_log_entries where action in ('PROJECT_COMPETENCE_GRANTED','PROJECT_COMPETENCE_REVOKED') and project_id=$1", [PA])).rows;
    ok(au.some((a) => a.action === "PROJECT_COMPETENCE_GRANTED" && a.entity_id === gJUR.id && a.actor_user_id === uid(U.ADMIN)), "auditoria central da concessão");
    ok(au.some((a) => a.action === "PROJECT_COMPETENCE_REVOKED"), "auditoria central da revogação");
    // (fixtures inseridos direto como superusuário, marcados 'fixture-direto', não passam pela RPC e ficam fora da contagem)
    eq(await n("select count(*)::int n from public.project_competence_events where action='GRANTED'"), await n("select count(*)::int n from public.project_competences where coalesce(basis_note,'') <> 'fixture-direto'"), "um evento de concessão por registro concedido pela RPC");
    eq(await n("select count(*)::int n from public.project_competence_events where action='REVOKED'"), await n("select count(*)::int n from public.project_competences where status='REVOKED'"), "um evento de revogação por registro revogado");
    await rejects(su.query("update public.project_competence_events set action='GRANTED' where competence_id=$1", [gJUR.id]), /INSURANCE_APPEND_ONLY/, "update de evento");
    await rejects(su.query("delete from public.project_competence_events where competence_id=$1", [gJUR.id]), /INSURANCE_NO_DELETE|INSURANCE_APPEND_ONLY/, "delete de evento");
    await rejects(su.query("truncate public.project_competence_events"), /INSURANCE_NO_DELETE|INSURANCE_APPEND_ONLY/, "truncate de evento");
    // as decisões que dependeram da competência ficam na trilha própria do módulo (passos do sinistro com autor)
    const steps = (await su.query("select created_by from public.insurance_claim_steps where stage='DECISAO' and created_by=$1", [uid(U.GJUR)])).rows;
    ok(steps.length >= 1, "decisão registrada com autor identificado");
  });

  await check("CASO 39 / F4-A-21 (ISOLAMENTO): competência de A não vale em B; leitura da tabela respeita RLS (próprio registro, ou gestão do projeto); outro projeto e anon não leem nada", async () => {
    await grant(await as(U.ADMINB), PB, U.ADMINB, "JURIDICO").then(() => { throw new Error("autoconcessão deveria falhar"); }, (e) => ok(/SELF_GRANT_FORBIDDEN/.test(e.message), `autoconcessão em B: ${e.message}`));
    const read = async (u) => (await (await as(u)).query("select project_id, user_id from public.project_competences")).rows;
    const rows = (u) => read(u);
    ok((await rows(U.ADMIN)).length >= 6, "ADMINISTRADOR vê as do projeto");
    ok((await rows(U.GESTOR)).length >= 6, "GESTOR (gestão) vê as do projeto");
    eq((await rows(U.COLAB)).filter((r) => r.user_id !== uid(U.COLAB)).length, 0, "COLABORADOR só vê o próprio registro (nenhum, pois não tem)");
    eq((await rows(U.LEITURA)).length, 0, "LEITURA não vê as dos demais");
    const jur = await rows(U.GJUR);
    ok(jur.length >= 1 && jur.every((r) => r.user_id === uid(U.GJUR) || r.project_id === PA), "a própria pessoa vê o seu");
    eq((await rows(U.GJUR)).filter((r) => r.user_id !== uid(U.GJUR)).length > 0, true, "GESTOR com competência também é gestão e vê o projeto");
    eq((await rows(U.ADMINB)).length, 0, "ADMIN de B não vê nada de A");
    eq((await rows(U.INATIVO)).length, 0, "inativo não vê");
    eq((await (await as(null, "authenticated")).query("select 1 from public.project_competences")).rowCount, 0, "authenticated sem sub não vê");
    await rejects((await as(null, "anon")).query("select 1 from public.project_competences"), /permission denied/i, "anon");
    eq((await (await as(U.ADMINB)).query("select count(*)::int n from public.project_competence_events")).rows[0].n, 0, "eventos de A invisíveis para B");
    await rejects((await as(U.ADMIN)).query("insert into public.project_competences (project_id,user_id,competence,granted_by) values ($1,$2,'JURIDICO',$3)", [PA, uid(U.GNADA), uid(U.ADMIN)]), /permission denied/i, "INSERT direto por ADMINISTRADOR");
    await rejects((await as(U.ADMIN)).query("update public.project_competences set status='REVOKED' where project_id=$1", [PA]), /permission denied/i, "UPDATE direto por ADMINISTRADOR");
    await rejects((await as(U.ADMIN)).query("delete from public.project_competences"), /permission denied/i, "DELETE direto por ADMINISTRADOR");
    // competência de A não habilita decisão em B (mesmo sendo o mesmo usuário com membership ativa em B)
    await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'GESTOR','ACTIVE')", [PB, uid(U.GJUR)]);
    eq(await has(U.GJUR, PB, "JURIDICO"), false, "competência do projeto A não vale em B");
    await su.query("delete from public.project_memberships where project_id=$1 and user_id=$2", [PB, uid(U.GJUR)]);
  });

  await check("CASO 38 / F4-A-22 (CONCORRÊNCIA): 6 concessões simultâneas da mesma competência = exatamente 1 registro ativo; 6 revogações simultâneas = 1 vence", async () => {
    const conns = await Promise.all(Array.from({ length: 6 }, (_, i) => as(i % 2 ? U.ADMIN : U.ADMIN2)));
    const res = await Promise.allSettled(conns.map((c) => grant(c, PA, U.LEITURA, "SEGUROS")));
    eq(res.filter((r) => r.status === "fulfilled").length, 1, "um vencedor na concessão");
    ok(res.filter((r) => r.status === "rejected").every((r) => /ALREADY_ACTIVE/.test(r.reason.message)), "perdedores recebem ALREADY_ACTIVE");
    eq(await n("select count(*)::int n from public.project_competences where user_id=$1 and competence='SEGUROS' and status='ACTIVE'", [uid(U.LEITURA)]), 1, "um ativo");
    const id = (await su.query("select id from public.project_competences where user_id=$1 and competence='SEGUROS' and status='ACTIVE'", [uid(U.LEITURA)])).rows[0].id;
    const conns2 = await Promise.all(Array.from({ length: 6 }, (_, i) => as(i % 2 ? U.ADMIN : U.ADMIN2)));
    const rv = await Promise.allSettled(conns2.map((c) => rpc(c, "project_competence_revoke", id, 1, "Revogação concorrente de teste.")));
    eq(rv.filter((r) => r.status === "fulfilled").length, 1, "uma revogação vence");
    ok(rv.filter((r) => r.status === "rejected").every((r) => /VERSION_CONFLICT|ALREADY_REVOKED/.test(r.reason.message)), "erros claros");
    eq(await n("select count(*)::int n from public.project_competence_events where competence_id=$1", [id]), 2, "um evento de concessão e um de revogação");
  });

  await check("CASO F4-A-23 (endosso crítico — competência exigida de TODO conferente): sem SEGUROS/JURIDICO nenhum nível basta; com a competência, o solicitante confere e a dupla se completa; o emissor segue barrado", async () => {
    const pol = await mkPolicy();
    const e = await rpc(await as(U.GNADA), "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Inclusão de segurado adicional (sintético)", change_kinds: ["SEGURADO"] }));
    const em = await rpc(await as(U.GERENTE), "insurance_endorsement_advance", e.id, 1, "EMITIDO", JSON.stringify({ issued_text: "Inclusão de segurado adicional (sintético)", issued_document_id: DA, issued_number: `E-${uniq()}` }));
    const NOTE = "Texto emitido confere com o documento anexo; conferência independente sintética.";
    const review = (c, ver) => rpc(c, "insurance_endorsement_review", e.id, ver, "APROVADO", JSON.stringify({ note: NOTE }));
    // GNADA = solicitante (GESTOR, sem competência); GTEC só técnica; GERENTE é o emissor
    await rejects(review(await as(U.GNADA), em.rowVersion), /COMPETENCE_REQUIRED/, "solicitante sem competência");
    await rejects(review(await as(U.GTEC), em.rowVersion), /COMPETENCE_REQUIRED/, "competência técnica não habilita endosso");
    await rejects(review(await as(U.GERENTE), em.rowVersion), /REVIEWER_IS_ISSUER/, "emissor");
    await rejects(review(await as(U.COLAB), em.rowVersion), /FORBIDDEN/, "COLABORADOR");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1", [e.id]), 0, "nada gravado");
    await grant(a1, PA, U.GNADA, "SEGUROS"); // agora o solicitante tem competência
    const r1 = await review(await as(U.GNADA), em.rowVersion);
    eq([r1.state, r1.approved], ["EMITIDO", 1], "solicitante com competência confere (1 de 2)");
    const r2 = await review(await as(U.GSEG), r1.rowVersion);
    eq([r2.state, r2.coverageEffective], ["CONFERIDO", true], "2º conferente independente do emissor completa a dupla");
    const rows = (await su.query("select reviewer_id, reviewer_is_requester, reviewer_competence from public.insurance_endorsement_reviews where endorsement_id=$1 order by review_no", [e.id])).rows;
    eq(rows.map((r) => [r.reviewer_id, r.reviewer_is_requester, r.reviewer_competence]), [[uid(U.GNADA), true, "SEGUROS"], [uid(U.GSEG), false, "SEGUROS"]], "snapshots de auditoria");
  });

  await check("CASO F4-A-24 (idempotência e dados legados): reaplicar as migrations 3x não altera dados; base LEGADA com decisões já registradas continua válida após a Fase 4/A, e só atos NOVOS passam a exigir competência", async () => {
    const snap = async () => JSON.stringify([
      (await su.query("select id,status,row_version,valid_until,registration_number from public.project_competences order by id")).rows,
      (await su.query("select count(*)::int n from public.project_competence_events")).rows,
    ]);
    const before = await snap();
    for (const f of F4) await su.query(read(f));
    eq(await snap(), before, "dados preservados na reaplicação");
    eq(await n("select count(*)::int n from pg_trigger where tgname in ('insurance_claim_steps_competence','insurance_drafts_approval_competence','quality_state_events_competence','insurance_endorsement_reviews_zcompetence','project_competences_guard_trg') and not tgisinternal"), 5, "gatilhos únicos");
    // base legada: replay SEM as migrations da Fase 4/A, registra decisão de sinistro e RNC confirmada, depois aplica a Fase 4/A
    const legacy = await newDb("legacy");
    try {
      for (const f of files.filter((x) => !F4.includes(x))) await legacy.su.query(read(f));
      const lu = (k) => `00000000-0000-4000-8000-${String(2700 + k).padStart(12, "0")}`;
      const LP = "10000000-0000-4000-8000-0000000027a0";
      for (const k of [1, 2]) {
        await legacy.su.query("insert into auth.users (id,email) values ($1,$2)", [lu(k), `leg-${k}@axion.com.br`]);
        await legacy.su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [lu(k), `LEG ${k}`, `leg-${k}@axion.com.br`]);
      }
      await legacy.su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra L','LEG','C','L','2026-01-01','2027-01-01')", [LP]);
      await legacy.su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE'),($1,$3,'GESTOR','ACTIVE')", [LP, lu(1), lu(2)]);
      const ld = (await legacy.su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO','Doc legado') returning id", [LP])).rows[0].id;
      const lc = async (k) => {
        const c = new pg.Client({ connectionString: legacy.dbUrl });
        await c.connect();
        open.push(c);
        await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: lu(k), role: "authenticated" })]);
        await c.query("set role authenticated");
        return c;
      };
      const lr = async (c, fn, ...args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r;
      const pol = await lr(await lc(1), "insurance_policy_create", LP, JSON.stringify({ ...POL, source_document_id: ld, policy_number: "LEG-1" }));
      let cl = await lr(await lc(2), "insurance_claim_open", LP, JSON.stringify({ claim_kind: "OUTRO", title: "Legado", stage: "AVISO", policy_id: pol.id, source_ref: "leg-1" }));
      cl = await lr(await lc(2), "insurance_claim_advance", cl.id, cl.rowVersion, "REGULACAO", JSON.stringify({ note: "Regulação legada (sintético)." }));
      const legacyDecision = await lr(await lc(2), "insurance_claim_advance", cl.id, cl.rowVersion, "DECISAO", JSON.stringify({ note: "Decisão legada (sintético).", decision_outcome: "DEFERIDO" }));
      eq(legacyDecision.stage, "DECISAO", "decisão legada registrada pelo GESTOR (regra antiga: sem competência)");
      const beforeSteps = (await legacy.su.query("select id, stage, created_by from public.insurance_claim_steps order by created_at, id")).rows;
      for (const f of F4) { await legacy.su.query(read(f)); await legacy.su.query(read(f)); }
      const afterSteps = (await legacy.su.query("select id, stage, created_by from public.insurance_claim_steps order by created_at, id")).rows;
      eq(afterSteps, beforeSteps, "passos legados preservados byte a byte");
      eq((await legacy.su.query("select stage from public.insurance_claims where id=$1", [cl.id])).rows[0].stage, "DECISAO", "decisão legada continua válida");
      // ato NOVO sem competência: bloqueado; com competência (concedida pelo ADMIN): permitido
      await rejects(lr(await lc(2), "insurance_claim_advance", cl.id, legacyDecision.rowVersion, "INDENIZACAO_CUMPRIMENTO", JSON.stringify({ note: "Indenização nova sem competência." })), /COMPETENCE_REQUIRED/, "ato novo exige competência");
      await lr(await lc(1), "project_competence_grant", LP, lu(2), "JURIDICO", "{}");
      eq((await lr(await lc(2), "insurance_claim_advance", cl.id, legacyDecision.rowVersion, "INDENIZACAO_CUMPRIMENTO", JSON.stringify({ note: "Indenização nova com competência." }))).stage, "INDENIZACAO_CUMPRIMENTO", "ato novo com competência");
    } finally {
      await legacy.su.end().catch(() => {});
    }
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  for (const c of keepAll) await c.end().catch(() => {});
  await su.end().catch(() => {});
  for (const name of dbs) await admin.query(`drop database if exists ${name} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
