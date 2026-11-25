// FASE 3 / C — ENDOSSOS COM DUPLA CONFERÊNCIA HUMANA INDEPENDENTE em PostgreSQL REAL (adversarial). Replay de TODAS as migrations
// numa base descartável (acc_endc_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role), concorrência real
// (conexões independentes) e dados 100% SINTÉTICOS. Segunda base descartável reproduz o estado LEGADO (endosso CONFERIDO pelo
// fluxo antigo, com conferência única) e aplica a migration da frente C por cima. NÃO roda no CI.
// Cobre CASO 21-24, 31, 37, 38, 39 e CASO F3-C-01..F3-C-12.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-endossos-dupla-conferencia-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grantCompetences } from "./lib/f4a-competences.mjs";
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
const I = await import("../apps/web/lib/insurance/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE_FILE = "20261123200000_endorsement_dual_review.sql";
// Fase 4/A redefine a regra de conferência (solicitante pode conferir com competência); é reaplicada DEPOIS da migration da Fase 3.
const F4_FILE = "20261124102000_endorsement_review_requester_competence.sql";
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
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 400)}`);
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
  const name = `acc_endc_${tag}_${stamp}`;
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
const strip = (s) => s.replace(/^﻿/, "");

const main = await newDb("m");
const su = main.su;
const dbUrl = main.dbUrl;
try {
  for (const f of files) {
    try { await su.query(strip(readFileSync(path.join(dir, f), "utf8"))); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  const mineSql = strip(readFileSync(path.join(dir, MINE_FILE), "utf8"));
  await su.query(mineSql);
  await su.query(mineSql);
  const f4Sql = strip(readFileSync(path.join(dir, F4_FILE), "utf8"));
  await su.query(f4Sql);
  await su.query(f4Sql);
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE_FILE} e ${F4_FILE} reaplicadas 2x) — base ${main.name}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(2400 + n).padStart(12, "0")}`;
  const P = "10000000-0000-4000-8000-0000000024a0";
  const P2 = "10000000-0000-4000-8000-0000000024b0";
  const U = { ADMIN: 1, ADMIN2: 2, GESTOR: 3, GERENTE: 4, COLAB: 5, LEITURA: 6, INATIVO: 7, PENDENTE: 8, ADMINB: 9, GSC: 10 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `endc-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `ENDC ${n}`, `endc-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','ECA','C','L','2026-01-01','2027-01-01'),($2,'Obra B','ECB','C','L','2026-01-01','2027-01-01')", [P, P2]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(P, U.ADMIN, "ADMINISTRADOR");
  await mem(P, U.ADMIN2, "ADMINISTRADOR");
  await mem(P, U.GESTOR, "GESTOR");
  await mem(P, U.GERENTE, "GERENTE");
  await mem(P, U.GSC, "GESTOR"); // GESTOR SEM competência registrada (Fase 4/A)
  await mem(P, U.COLAB, "COLABORADOR");
  await mem(P, U.LEITURA, "LEITURA");
  await mem(P, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(P2, U.ADMINB, "ADMINISTRADOR");
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [P, `endc-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);
  const doc = async (project, title) => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [project, title])).rows[0].id;
  await grantCompetences(su, P, [uid(U.ADMIN), uid(U.ADMIN2), uid(U.GESTOR), uid(U.GERENTE)]);
  const D1 = await doc(P, "Apólice A (sintético)");
  const D2 = await doc(P, "Endosso emitido (sintético)");

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
  const n = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const POL = { modality: "SEGURO_GARANTIA_EXECUTANTE", insurer_name: "Seguradora Sintética SA", policy_number: "SINT-C-001", source_document_id: D1, coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000, status: "VIGENTE" };
  let polSeq = 0;
  const mkPolicy = async () => rpc(await as(U.ADMIN), "insurance_policy_create", P, JSON.stringify({ ...POL, policy_number: `SINT-C-${++polSeq}` }));
  const REQ_TEXT = "Inclusão do beneficiário Alfa nas condições vigentes";
  /** Cria endosso até EMITIDO: solicita (requester) e emite (issuer). Padrão: COLAB solicita, GESTOR emite. */
  async function mkIssued({ kinds, requester = U.COLAB, issuer = U.GESTOR, requestedText = REQ_TEXT, issuedText = REQ_TEXT, issueKinds, noKinds = false } = {}) {
    const pol = await mkPolicy();
    const data = { requested_text: requestedText, request_ref: "email-sintetico" };
    if (!noKinds && kinds !== undefined) data.change_kinds = kinds;
    const e = await rpc(await as(requester), "insurance_endorsement_request", pol.id, JSON.stringify(data));
    const issueData = { issued_text: issuedText, issued_document_id: D2, issued_number: `E-${Math.random().toString(36).slice(2, 8)}` };
    if (issueKinds) issueData.change_kinds = issueKinds;
    const em = await rpc(await as(issuer), "insurance_endorsement_advance", e.id, 1, "EMITIDO", JSON.stringify(issueData));
    return { pol, id: e.id, requested: e, issued: em };
  }
  const row = async (id) => (await su.query("select * from public.insurance_endorsements where id=$1", [id])).rows[0];
  const reviews = async (id) => (await su.query("select * from public.insurance_endorsement_reviews where endorsement_id=$1 order by review_round, review_no", [id])).rows;
  const NOTE = "Texto emitido confere com o documento anexo; conferência independente sintética.";
  const review = (c, id, ver, outcome = "APROVADO", note = NOTE) => rpc(c, "insurance_endorsement_review", id, ver, outcome, JSON.stringify({ note }));

  // ---------------------------------------------------------------------------------------------------------------
  await check("ESTRUTURA: tabela de conferências com RLS, sem escrita direta a anon/authenticated, append-only; EM_REVISAO permitido; trava de envio intacta", async () => {
    const t = (await su.query("select relrowsecurity from pg_class where oid='public.insurance_endorsement_reviews'::regclass")).rows[0];
    ok(t.relrowsecurity, "RLS desligado");
    const g = (await su.query(`select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='insurance_endorsement_reviews'
      and grantee in ('anon','authenticated','public') and privilege_type <> 'SELECT'`)).rows;
    eq(g, [], "privilégios de escrita");
    eq(await n("select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name='insurance_endorsement_reviews' and grantee='anon'"), 0, "anon sem acesso");
    const def = (await su.query("select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.insurance_endorsements'::regclass and conname='insurance_endorsements_state_values_check'")).rows[0].d;
    ok(/EM_REVISAO/.test(def), "estado EM_REVISAO");
    eq((await su.query("select count(*)::int n from pg_constraint where conrelid='public.insurance_endorsements'::regclass and contype='c' and pg_get_constraintdef(oid) like '%SOLICITADO%' and conname <> 'insurance_endorsements_state_values_check'")).rows[0].n, 0, "um único CHECK de estados");
    await su.query("insert into public.insurance_settings (project_id) values ($1) on conflict do nothing", [P]);
    eq((await su.query("select real_send_enabled from public.insurance_settings where project_id=$1", [P])).rows[0].real_send_enabled, false, "envio real desligado por padrão");
  });

  await check("PARIDADE SQL x TS: classificação (motivo da dupla conferência), normalização de change_kinds e máquina de estados idênticas", async () => {
    const kindsCases = [null, [], ["SEGURADO"], ["DADOS_CADASTRAIS"], ["PRORROGACAO_VIGENCIA", "OUTRO_NAO_CRITICO"], ["DADOS_CADASTRAIS", "VALOR_PREMIO"], ...I.CRITICAL_CHANGE_KINDS.map((k) => [k])];
    for (const kinds of kindsCases) for (const tm of [null, true, false]) {
      const sql = (await su.query("select public.insurance_int_endorsement_dual_reason($1::text[], $2::boolean) r", [kinds, tm])).rows[0].r;
      eq(sql, I.dualReviewReason(kinds, tm), `${JSON.stringify(kinds)}/${tm}`);
    }
    for (const raw of [[" dados_cadastrais ", "DADOS_CADASTRAIS", ""], ["segurado", "valor_premio"], []]) {
      const sql = (await su.query("select public.insurance_int_endorsement_kinds($1::jsonb) r", [JSON.stringify({ change_kinds: raw })])).rows[0].r;
      eq(sql, I.normalizeChangeKinds(raw), JSON.stringify(raw));
    }
    for (const bad of [["INVENTADO"], "SEGURADO", { a: 1 }]) await rejects(su.query("select public.insurance_int_endorsement_kinds($1::jsonb)", [JSON.stringify({ change_kinds: bad })]), /INVALID_CHANGE_KINDS/, JSON.stringify(bad));
    eq((await su.query("select public.insurance_int_endorsement_kinds('{}'::jsonb) r")).rows[0].r, null, "ausente => null");
    // estados: toda transição que o TS permite é compatível com o que o banco aceita a partir do estado (EM_REVISAO/EMITIDO/CONFERIDO exercitados nos demais casos)
    const states = ["SOLICITADO", "EM_ANALISE", "EMITIDO", "CONFERIDO", "RECUSADO", "EM_REVISAO"];
    const def = (await su.query("select pg_get_constraintdef(oid) d from pg_constraint where conname='insurance_endorsements_state_values_check'")).rows[0].d;
    for (const s of states) ok(def.includes(s), `estado ${s} no CHECK`);
    const sqlSrc = (await su.query("select prosrc from pg_proc where proname='insurance_endorsement_advance'")).rows[0].prosrc;
    for (const from of states) for (const to of ["EM_ANALISE", "EMITIDO", "RECUSADO"]) {
      const sqlAllows = new RegExp(String.raw`e\.state = '${from}' and p_to_state in \([^)]*'${to}'`).test(sqlSrc);
      eq(sqlAllows, I.canTransitionEndorsement(from, to), `${from} -> ${to}`);
    }
  });

  await check("CASO 23 + CASO F3-C: pedido NÃO é endosso emitido; sem efeito de cobertura até as DUAS conferências; comparação solicitado x emitido preservada", async () => {
    const x = await mkIssued({ kinds: ["BENEFICIARIO_PARTES"], issuedText: "Inclusão do beneficiário Alfa nas condições vigentes, exceto danos à própria obra" });
    eq([x.requested.state, x.requested.coverageEffective, x.requested.requiresDualReview], ["SOLICITADO", false, true], "pedido crítico");
    eq([x.issued.state, x.issued.coverageEffective, x.issued.textsMatch, x.issued.requiresDualReview], ["EMITIDO", false, false, true], "emitido sem efeito; texto diverge");
    const r = await row(x.id);
    eq([r.change_kinds, r.dual_review_reason, r.review_round], [["BENEFICIARIO_PARTES"], "CLASSIFICACAO_CRITICA", 1], "classificação");
    const pend = (await (await as(U.ADMIN)).query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='ENDOSSO_PENDENTE' and entity_id=$2", [P, x.id])).rows;
    eq([pend.length, pend[0].severity, pend[0].detail.coverageEffective, pend[0].detail.reviewsApproved], [1, "CONFERENCIA_PENDENTE", false, 0], "pendente");
    // solicitado -> conferido continua impossível
    const pol = await mkPolicy();
    const e = await rpc(await as(U.COLAB), "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Pedido sem emissão", change_kinds: ["VALOR_PREMIO"] }));
    await rejects(review(await as(U.ADMIN), e.id, 1), /INVALID_TRANSITION/, "SOLICITADO não é conferido");
    await rejects(rpc(await as(U.ADMIN), "insurance_endorsement_advance", e.id, 1, "CONFERIDO", "{}"), /INVALID_TRANSITION/, "avanço direto SOLICITADO -> CONFERIDO");
  });

  await check("CASO 24 (endosso emitido) + dupla conferência feliz: 1ª aprovação NÃO dá efeito; 2ª (outro usuário MANAGE, independente) torna CONFERIDO; divergência exige nota >= 20", async () => {
    const x = await mkIssued({ kinds: ["COBERTURA_EXCLUSAO"], issuedText: "Inclusão do beneficiário Alfa nas condições vigentes, exceto danos à própria obra" });
    await rejects(rpc(await as(U.ADMIN), "insurance_endorsement_review", x.id, x.issued.rowVersion, "APROVADO", JSON.stringify({ note: "curta" })), /DIVERGENCE_NOTE_REQUIRED/, "divergência sem nota");
    const r1 = await review(await as(U.ADMIN), x.id, x.issued.rowVersion);
    eq([r1.state, r1.coverageEffective, r1.approved, r1.required], ["EMITIDO", false, 1, 2], "1ª conferência sem efeito");
    const mid = await row(x.id);
    eq([mid.coverage_effective, mid.verified_by], [false, null], "banco: sem efeito/verificado");
    const r2 = await review(await as(U.ADMIN2), x.id, r1.rowVersion, "APROVADO", "Segunda conferência independente: cláusula nova de exclusão confirmada no documento.");
    eq([r2.state, r2.coverageEffective, r2.approved], ["CONFERIDO", true, 2], "2ª conferência confere");
    const fin = await row(x.id);
    eq([fin.verified_by, fin.coverage_effective], [uid(U.ADMIN2), true], "verificado pelo 2º");
    const rv = await reviews(x.id);
    eq(rv.map((r) => [r.review_no, r.reviewer_id, r.outcome, r.dual_required]), [[1, uid(U.ADMIN), "APROVADO", true], [2, uid(U.ADMIN2), "APROVADO", true]], "histórico de conferências");
    ok(rv.every((r) => r.requested_by_snapshot === uid(U.COLAB) && r.issued_by_snapshot === uid(U.GESTOR) && r.note.length >= 20), "snapshots e notas");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1 and note is null", [x.id]), 0, "nota sempre registrada");
    // texto idêntico exige apenas 1 caractere de nota? não: nota opcional quando idêntico
    const y = await mkIssued({ kinds: ["VALOR_LIMITE"] });
    const a1 = await rpc(await as(U.ADMIN), "insurance_endorsement_review", y.id, y.issued.rowVersion, "APROVADO", "{}");
    const a2 = await rpc(await as(U.GERENTE), "insurance_endorsement_review", y.id, a1.rowVersion, "APROVADO", "{}");
    eq(a2.state, "CONFERIDO", "texto idêntico dispensa nota");
    const gone = (await (await as(U.ADMIN)).query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='ENDOSSO_PENDENTE' and entity_id=$2", [P, x.id])).rows;
    eq(gone.length, 0, "conferido sai das pendências");
  });

  await check("CASO F3-C-01 (autoconferência dupla impossível): mesmo usuário não confere duas vezes — RPC e constraint no banco", async () => {
    const x = await mkIssued({ kinds: ["VALOR_IMPORTANCIA_SEGURADA"] });
    const a = await as(U.ADMIN);
    const r1 = await review(a, x.id, x.issued.rowVersion);
    await rejects(review(a, x.id, r1.rowVersion), /ALREADY_REVIEWED/, "2ª conferência do mesmo usuário");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1", [x.id]), 1, "só uma conferência gravada");
    // direto no banco (superusuário, ignorando a RPC): UNIQUE (endosso, rodada, conferente)
    await rejects(su.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,2,$3,'APROVADO',$4,true)", [P, x.id, uid(U.ADMIN), NOTE]), /duplicate key|unique/i, "UNIQUE do conferente");
    eq((await row(x.id)).state, "EMITIDO", "continua EMITIDO (1 de 2)");
    // tentativa de conferir direto no endosso sem as duas conferências
    await rejects(su.query("update public.insurance_endorsements set state='CONFERIDO', coverage_effective=true, verified_at=now(), verified_by=$2 where id=$1", [x.id, uid(U.ADMIN)]), /DUAL_REVIEW_REQUIRED/, "guarda do endosso (1 de 2)");
    // via avanço genérico: 'CONFERIDO' delega à conferência (mesmo usuário continua barrado)
    await rejects(rpc(a, "insurance_endorsement_advance", x.id, r1.rowVersion, "CONFERIDO", "{}"), /ALREADY_REVIEWED/, "avanço CONFERIDO delega à regra");
  });

  await check("CASO F3-C-02 / F4-A-01 (conferente = solicitante): PODE conferir com nível MANAGE + competência SEGUROS/JURIDICO; sem competência, sem nível, competência vencida ou de outra área NÃO; independência do emissor intacta", async () => {
    // solicitante GERENTE (com competência) confere; o 2º conferente é outro usuário; o emissor GESTOR não confere
    const x = await mkIssued({ kinds: ["SEGURADO"], requester: U.GERENTE, issuer: U.GESTOR });
    const r1 = await review(await as(U.GERENTE), x.id, x.issued.rowVersion);
    eq([r1.state, r1.approved, r1.coverageEffective], ["EMITIDO", 1, false], "solicitante é o 1º conferente; ainda sem efeito");
    await rejects(review(await as(U.GESTOR), x.id, r1.rowVersion), /REVIEWER_IS_ISSUER/, "emissor não confere");
    const r2 = await review(await as(U.ADMIN2), x.id, r1.rowVersion);
    eq([r2.state, r2.coverageEffective, r2.approved], ["CONFERIDO", true, 2], "solicitante + outro conferente independente do emissor");
    const rv = await reviews(x.id);
    eq(rv.map((r) => [r.reviewer_id === uid(U.GERENTE), r.reviewer_is_requester, r.reviewer_competence !== null]), [[true, true, true], [false, false, true]], "snapshots de auditoria: solicitante identificado e competência registrada");
    // ADMINISTRADOR solicitante também pode (com competência)
    const y = await mkIssued({ kinds: ["SEGURADO"], requester: U.ADMIN, issuer: U.GESTOR });
    eq((await review(await as(U.ADMIN), y.id, y.issued.rowVersion)).approved, 1, "ADMINISTRADOR solicitante confere");
    // solicitante SEM competência (GESTOR sem registro): bloqueado na RPC e no banco (gatilho), mesmo forjando dual_required=false
    const z = await mkIssued({ kinds: ["VALOR_PREMIO"], requester: U.GSC, issuer: U.GESTOR });
    await rejects(review(await as(U.GSC), z.id, z.issued.rowVersion), /COMPETENCE_REQUIRED/, "GESTOR solicitante sem competência");
    await rejects(su.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,1,$3,'APROVADO',$4,false)", [P, z.id, uid(U.GSC), NOTE]), /COMPETENCE_REQUIRED/, "gatilho: dual_required forjado é refeito e a competência é exigida");
    // competência VENCIDA não vale
    await su.query("insert into public.project_competences (project_id,user_id,competence,valid_from,valid_until,granted_by) values ($1,$2,'SEGUROS','2025-01-01','2025-12-31',$3)", [P, uid(U.GSC), uid(U.ADMIN)]);
    await rejects(review(await as(U.GSC), z.id, z.issued.rowVersion), /COMPETENCE_REQUIRED/, "competência vencida");
    // competência de OUTRA área (técnica) não habilita endosso
    await su.query("insert into public.project_competences (project_id,user_id,competence,granted_by) values ($1,$2,'TECNICO_RESPONSAVEL',$3)", [P, uid(U.GSC), uid(U.ADMIN)]);
    await rejects(review(await as(U.GSC), z.id, z.issued.rowVersion), /COMPETENCE_REQUIRED/, "competência técnica não substitui seguros/jurídico");
    // COLABORADOR com competência registrada continua barrado pelo NÍVEL (competência é adicional, nunca substitui)
    await su.query("insert into public.project_competences (project_id,user_id,competence,granted_by) values ($1,$2,'SEGUROS',$3)", [P, uid(U.COLAB), uid(U.ADMIN)]);
    await rejects(review(await as(U.COLAB), z.id, z.issued.rowVersion), /FORBIDDEN/, "COLABORADOR com competência: nível insuficiente");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1", [z.id]), 0, "nada gravado nas tentativas barradas");
    // a independência do EMISSOR também vale no banco (CHECK), mesmo com competência
    await rejects(su.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,1,$3,'APROVADO',$4,true)", [P, z.id, uid(U.GESTOR), NOTE]), /check constraint|violates/i, "constraint: conferente = emissor");
  });

  await check("CASO F3-C-03 (conferente = quem registrou a emissão): bloqueado na RPC e no banco", async () => {
    const x = await mkIssued({ kinds: ["OBRIGACAO_GARANTIDA"], requester: U.COLAB, issuer: U.ADMIN });
    await rejects(review(await as(U.ADMIN), x.id, x.issued.rowVersion), /REVIEWER_IS_ISSUER/, "emissor confere a própria emissão");
    await rejects(su.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,1,$3,'APROVADO',$4,false)", [P, x.id, uid(U.ADMIN), NOTE]), /check constraint|violates/i, "constraint: conferente = emissor (dual_required forjado é refeito pelo trigger)");
    const r = await row(x.id);
    eq([r.issued_by, r.state], [uid(U.ADMIN), "EMITIDO"], "emissor registrado, ainda EMITIDO");
    // outros dois independentes completam
    const r1 = await review(await as(U.GESTOR), x.id, x.issued.rowVersion);
    const r2 = await review(await as(U.ADMIN2), x.id, r1.rowVersion);
    eq(r2.state, "CONFERIDO", "dupla conferência independente");
  });

  await check("CASO F3-C-04 (mesmo usuário em duas conferências, aprovando e depois recusando): barrado; uma recusa só vale por usuário e rodada", async () => {
    const x = await mkIssued({ kinds: ["VALOR_PREMIO"] });
    const a = await as(U.ADMIN);
    const r1 = await review(a, x.id, x.issued.rowVersion, "APROVADO");
    await rejects(review(a, x.id, r1.rowVersion, "RECUSADO", "Mudei de ideia depois de aprovar o mesmo endosso sintético."), /ALREADY_REVIEWED/, "aprova e depois recusa");
    eq((await row(x.id)).state, "EMITIDO", "estado intacto");
  });

  await check("CASO F3-C-05 (corrida): duas conferências simultâneas com a mesma versão — uma vence, a outra VERSION_CONFLICT; mesmo usuário em paralelo = 1 só; nunca CONFERIDO com 1 aprovação", async () => {
    // (a) dois usuários distintos, mesma versão lida
    const x = await mkIssued({ kinds: ["COBERTURA_SUBLIMITE"] });
    const conns = await Promise.all([as(U.ADMIN), as(U.ADMIN2), as(U.GERENTE), as(U.GESTOR)]);
    const res = await Promise.allSettled(conns.map((c) => review(c, x.id, x.issued.rowVersion)));
    const okN = res.filter((r) => r.status === "fulfilled").length;
    const bad = res.filter((r) => r.status === "rejected").map((r) => r.reason.message);
    eq(okN, 1, "exatamente um vencedor com a mesma versão");
    ok(bad.every((m) => /VERSION_CONFLICT|REVIEWER_IS_ISSUER/.test(m)), `erros inesperados: ${bad.find((m) => !/VERSION_CONFLICT|REVIEWER_IS_ISSUER/.test(m))}`);
    const mid = await row(x.id);
    eq([mid.state, mid.coverage_effective], ["EMITIDO", false], "1 aprovação não confere");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1", [x.id]), 1, "uma conferência");
    // (b) retry com versão atualizada confere
    const winner = (await reviews(x.id))[0].reviewer_id;
    const second = [U.ADMIN, U.ADMIN2, U.GERENTE].find((u) => uid(u) !== winner);
    const fin = await review(await as(second), x.id, mid.row_version);
    eq(fin.state, "CONFERIDO", "retry completa a dupla conferência");
    // (c) o MESMO usuário em 6 conexões paralelas: no máximo uma conferência
    const y = await mkIssued({ kinds: ["COBERTURA_FRANQUIA"] });
    const six = await Promise.all(Array.from({ length: 6 }, () => as(U.ADMIN)));
    const res2 = await Promise.allSettled(six.map((c) => review(c, y.id, y.issued.rowVersion)));
    eq(res2.filter((r) => r.status === "fulfilled").length, 1, "mesmo usuário: um só vence");
    ok(res2.filter((r) => r.status === "rejected").every((r) => /VERSION_CONFLICT|ALREADY_REVIEWED/.test(r.reason.message)), "erros claros");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1 and reviewer_id=$2", [y.id, uid(U.ADMIN)]), 1, "uma linha por usuário");
    eq((await row(y.id)).state, "EMITIDO", "ainda EMITIDO");
    // (d) 1 aprovação x 1 recusa simultâneas: o estado final é coerente com as conferências gravadas
    const z = await mkIssued({ kinds: ["SEGURADO"] });
    const [c1, c2] = await Promise.all([as(U.ADMIN), as(U.ADMIN2)]);
    await Promise.allSettled([review(c1, z.id, z.issued.rowVersion, "APROVADO"), review(c2, z.id, z.issued.rowVersion, "RECUSADO", "Segurado incorreto na minuta emitida; devolver à seguradora (sintético).")]);
    const zr = await row(z.id);
    const zrv = await reviews(z.id);
    eq(zrv.length, 1, "uma só conferência venceu");
    eq([zr.state, zr.coverage_effective], [zrv[0].outcome === "RECUSADO" ? "EM_REVISAO" : "EMITIDO", false], "estado coerente com o vencedor");
  });

  await check("CASO F3-C-06 (não crítico: conferência simples): prorrogação de vigência / dados cadastrais com texto idêntico confere com UMA aprovação; texto divergente OU sem classificação => dupla", async () => {
    const x = await mkIssued({ kinds: ["PRORROGACAO_VIGENCIA"], requestedText: "Prorrogação da vigência até 31/12/2027", issuedText: "prorrogação  da vigência até 31/12/2027" });
    eq([x.requested.requiresDualReview, x.issued.requiresDualReview], [false, false], "simples");
    const s = await review(await as(U.ADMIN), x.id, x.issued.rowVersion, "APROVADO", "");
    eq([s.state, s.coverageEffective, s.required], ["CONFERIDO", true, 1], "uma aprovação confere");
    // via avanço genérico (compatibilidade com a tela anterior)
    const y = await mkIssued({ kinds: ["DADOS_CADASTRAIS", "PRORROGACAO_VIGENCIA"], requestedText: "Alteração de endereço do tomador", issuedText: "Alteração de endereço do tomador" });
    const s2 = await rpc(await as(U.GESTOR), "insurance_endorsement_advance", y.id, y.issued.rowVersion, "CONFERIDO", "{}");
    eq([s2.state, s2.coverageEffective], ["CONFERIDO", true], "avanço genérico CONFERIDO com conferência simples");
    eq((await reviews(y.id)).length, 1, "conferência simples também fica registrada");
    // não crítico mas o emitido DIVERGE do pedido => o texto emitido pode ter alterado item crítico: dupla
    const z = await mkIssued({ kinds: ["PRORROGACAO_VIGENCIA"], requestedText: "Prorrogação da vigência", issuedText: "Prorrogação da vigência e redução do limite de indenização" });
    eq([z.requested.requiresDualReview, z.issued.requiresDualReview], [false, true], "divergência torna dupla");
    eq((await row(z.id)).dual_review_reason, "TEXTO_DIVERGENTE", "motivo");
    // classificação declarada na emissão só AUMENTA a criticidade
    const w = await mkIssued({ kinds: ["DADOS_CADASTRAIS"], requestedText: "Alteração cadastral", issuedText: "Alteração cadastral", issueKinds: ["BENEFICIARIO_PARTES"] });
    eq([w.issued.requiresDualReview, (await row(w.id)).change_kinds], [true, ["BENEFICIARIO_PARTES", "DADOS_CADASTRAIS"]], "emissão eleva para crítico");
  });

  await check("CASO F3-C-07 (fail-closed): sem classificação / lista vazia = crítico; valor desconhecido rejeitado; banco impede conferência simples sem classificação válida e rebaixamento", async () => {
    const a = await mkIssued({ noKinds: true });
    eq([a.requested.requiresDualReview, a.requested.dualReviewReason], [true, "SEM_CLASSIFICACAO"], "sem change_kinds");
    const b = await mkIssued({ kinds: [] });
    eq(b.requested.requiresDualReview, true, "lista vazia");
    const pol = await mkPolicy();
    const c = await as(U.COLAB);
    for (const bad of [["INVENTADO"], "BENEFICIARIO_PARTES", { a: 1 }]) {
      await rejects(rpc(c, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "x y z", change_kinds: bad })), /INVALID_CHANGE_KINDS/, `change_kinds ${JSON.stringify(bad)}`);
    }
    // normalização: caixa/espaços
    const d = await rpc(c, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Cadastral", change_kinds: [" dados_cadastrais "] }));
    eq(d.requiresDualReview, false, "normaliza e aceita não crítico");
    // banco: forçar conferência simples em endosso sem classificação
    await rejects(su.query("update public.insurance_endorsements set requires_dual_review=false, dual_review_reason=null where id=$1", [a.id]), /check constraint|CLASSIFICATION_DOWNGRADE/i, "rebaixar sem classificação");
    await rejects(su.query("update public.insurance_endorsements set change_kinds=array['SEGURADO'], requires_dual_review=false, dual_review_reason=null where id=$1", [a.id]), /check constraint|CLASSIFICATION_DOWNGRADE/i, "rebaixar com classificação crítica");
    await rejects(su.query("update public.insurance_endorsements set change_kinds=array['PRORROGACAO_VIGENCIA'], requires_dual_review=false, dual_review_reason=null where id=$1", [a.id]), /CLASSIFICATION_DOWNGRADE/, "a dupla conferência exigida não é removida");
    await rejects(su.query("update public.insurance_endorsements set change_kinds=array['XYZ'] where id=$1", [a.id]), /check constraint/i, "valor desconhecido no banco");
    // texto divergente + classificação não crítica não pode estar CONFERIDO com 1 aprovação (guarda)
    const z = await mkIssued({ kinds: ["DADOS_CADASTRAIS"], requestedText: "Cadastral A", issuedText: "Cadastral B com mais coisas" });
    const r1 = await review(await as(U.ADMIN), z.id, z.issued.rowVersion, "APROVADO", "Divergência analisada: acréscimo de cláusula não pedida, aceito (sintético).");
    eq(r1.state, "EMITIDO", "texto divergente: 1 aprovação não basta");
    // regressão: COLABORADOR não confere
    await rejects(review(await as(U.COLAB), z.id, r1.rowVersion), /FORBIDDEN/, "COLAB não confere");
  });

  await check("CASO F3-C-08 (recusa de conferente): leva a EM_REVISAO sem efeito de cobertura; nota >= 20; nova emissão abre NOVA rodada de dupla conferência", async () => {
    const x = await mkIssued({ kinds: ["VALOR_GARANTIDO"] });
    const a = await review(await as(U.ADMIN), x.id, x.issued.rowVersion);
    await rejects(review(await as(U.ADMIN2), x.id, a.rowVersion, "RECUSADO", "curta"), /REVIEW_NOTE_REQUIRED/, "recusa sem nota");
    const rf = await review(await as(U.ADMIN2), x.id, a.rowVersion, "RECUSADO", "Valor garantido do documento emitido difere do contrato; revisar com a seguradora.");
    eq([rf.state, rf.coverageEffective], ["EM_REVISAO", false], "recusa => revisão sem efeito");
    const dash = (await (await as(U.ADMIN)).query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='ENDOSSO_PENDENTE' and entity_id=$2", [P, x.id])).rows;
    eq([dash.length, dash[0].severity], [1, "REVISAO_PENDENTE"], "pendência em revisão");
    await rejects(review(await as(U.GERENTE), x.id, rf.rowVersion), /INVALID_TRANSITION/, "EM_REVISAO não é conferido");
    await rejects(su.query("update public.insurance_endorsements set state='CONFERIDO', coverage_effective=true, verified_at=now(), verified_by=$2 where id=$1", [x.id, uid(U.ADMIN)]), /DUAL_REVIEW_REQUIRED/, "banco: não confere com recusa na rodada");
    await rejects(su.query("update public.insurance_endorsements set state='EM_REVISAO' where id=$1", [(await mkIssued({ kinds: ["SEGURADO"] })).id]), /INVALID_TRANSITION/, "EM_REVISAO exige recusa registrada");
    // nova emissão (outro emissor) => rodada 2
    const re = await rpc(await as(U.GERENTE), "insurance_endorsement_advance", x.id, rf.rowVersion, "EMITIDO", JSON.stringify({ issued_text: REQ_TEXT, issued_document_id: D2, issued_number: "E-REEMISSAO-1" }));
    eq([re.state, re.reviewRound, re.requiresDualReview], ["EMITIDO", 2, true], "reemitido: rodada 2");
    const b1 = await review(await as(U.ADMIN), x.id, re.rowVersion);
    const b2 = await review(await as(U.ADMIN2), x.id, b1.rowVersion);
    eq([b2.state, b2.coverageEffective], ["CONFERIDO", true], "rodada 2 aprovada pelas duas conferências");
    const rv = await reviews(x.id);
    eq(rv.map((r) => [r.review_round, r.review_no, r.outcome]), [[1, 1, "APROVADO"], [1, 2, "RECUSADO"], [2, 1, "APROVADO"], [2, 2, "APROVADO"]], "histórico completo, nada sobrescrito");
    // RECUSADO definitivo a partir de EM_REVISAO
    const y = await mkIssued({ kinds: ["SEGURADO"] });
    const y1 = await review(await as(U.ADMIN), y.id, y.issued.rowVersion, "RECUSADO", "Segurado errado e seguradora não corrigirá; encerrar (sintético).");
    const yr = await rpc(await as(U.GESTOR), "insurance_endorsement_advance", y.id, y1.rowVersion, "RECUSADO", JSON.stringify({ refusal_note: "Encerrado sem efeito de cobertura" }));
    eq([yr.state, yr.coverageEffective], ["RECUSADO", false], "recusado definitivo");
  });

  await check("CASO F3-C-09 (dados legados): endosso CONFERIDO pelo fluxo antigo permanece válido, sem reabrir e sem perda; flag legado imutável e inatribuível a linhas novas", async () => {
    const legacy = await newDb("legacy");
    try {
      for (const f of files.filter((x) => x < MINE_FILE)) await legacy.su.query(strip(readFileSync(path.join(dir, f), "utf8")));
      const lu = (k) => `00000000-0000-4000-8000-${String(2500 + k).padStart(12, "0")}`;
      const LP = "10000000-0000-4000-8000-0000000025a0";
      for (const k of [1, 2, 3]) {
        await legacy.su.query("insert into auth.users (id,email) values ($1,$2)", [lu(k), `leg-${k}@exemplo.invalid`]);
        await legacy.su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [lu(k), `LEG ${k}`, `leg-${k}@exemplo.invalid`]);
      }
      await legacy.su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra L','LEG','C','L','2026-01-01','2027-01-01')", [LP]);
      await legacy.su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE'),($1,$3,'GESTOR','ACTIVE')", [LP, lu(1), lu(2)]);
      const ld = (await legacy.su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO','D') returning id", [LP])).rows[0].id;
      const lc = async (k) => {
        const c = new pg.Client({ connectionString: legacy.dbUrl });
        await c.connect();
        open.push(c);
        await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: lu(k), role: "authenticated" })]);
        await c.query("set role authenticated");
        return c;
      };
      const lr = async (c, fn, ...args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r;
      const a = await lc(1);
      const pol = await lr(a, "insurance_policy_create", LP, JSON.stringify({ modality: "SEGURO_GARANTIA_EXECUTANTE", insurer_name: "Seg", policy_number: "L-1", source_document_id: ld, status: "VIGENTE" }));
      const e = await lr(a, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Inclusão de beneficiário legado" }));
      const em = await lr(a, "insurance_endorsement_advance", e.id, 1, "EMITIDO", JSON.stringify({ issued_text: "Inclusão de beneficiário legado", issued_document_id: ld, issued_number: "L-E1" }));
      const cf = await lr(a, "insurance_endorsement_advance", e.id, em.rowVersion, "CONFERIDO", JSON.stringify({}));
      eq([cf.state, cf.coverageEffective], ["CONFERIDO", true], "fluxo antigo: conferência única");
      // pendente (EMITIDO) legado: segue o novo fluxo, fail-closed
      const e2 = await lr(a, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Legado pendente" }));
      await lr(a, "insurance_endorsement_advance", e2.id, 1, "EMITIDO", JSON.stringify({ issued_text: "Legado pendente", issued_document_id: ld, issued_number: "L-E2" }));
      const before = (await legacy.su.query("select * from public.insurance_endorsements where id=$1", [e.id])).rows[0];
      const mineSql = strip(readFileSync(path.join(dir, MINE_FILE), "utf8"));
      await legacy.su.query(mineSql);
      await legacy.su.query(mineSql); // idempotente
      const after = (await legacy.su.query("select * from public.insurance_endorsements where id=$1", [e.id])).rows[0];
      for (const k of ["state", "coverage_effective", "verified_by", "verified_at", "issued_text", "issued_number", "texts_match", "row_version", "requested_text", "updated_at"]) {
        eq(String(after[k]), String(before[k]), `legado preservado: ${k}`);
      }
      eq([after.legacy_single_review, after.requires_dual_review, after.dual_review_reason], [true, false, null], "marcado como legado (conferência única histórica)");
      const pend = (await legacy.su.query("select requires_dual_review, dual_review_reason, legacy_single_review, state from public.insurance_endorsements where id=$1", [e2.id])).rows[0];
      eq([pend.legacy_single_review, pend.requires_dual_review, pend.dual_review_reason, pend.state], [false, true, "SEM_CLASSIFICACAO", "EMITIDO"], "pendente legado cai em dupla (fail-closed)");
      eq((await legacy.su.query("select count(*)::int n from public.insurance_endorsement_reviews")).rows[0].n, 0, "sem conferências inventadas para o legado");
      // o legado continua CONFERIDO e não é reaberto nem reconferido; flag imutável
      await rejects(legacy.su.query("update public.insurance_endorsements set state='EM_REVISAO' where id=$1", [e.id]), /INVALID_TRANSITION/, "CONFERIDO não reabre");
      await rejects(legacy.su.query("update public.insurance_endorsements set legacy_single_review=false where id=$1", [e.id]), /LEGACY_FLAG_IMMUTABLE/, "flag legado imutável");
      await rejects(legacy.su.query("update public.insurance_endorsements set legacy_single_review=true where id=$1", [e2.id]), /LEGACY_FLAG_IMMUTABLE/, "não se atribui legado a endosso pendente");
      await rejects(lr(await lc(1), "insurance_endorsement_review", e.id, after.row_version, "APROVADO", "{}"), /INVALID_TRANSITION/, "CONFERIDO legado não é conferido de novo");
      // a cobertura do legado continua valendo (regra de ouro preservada: CONFERIDO + documento + efetivo)
      eq((await legacy.su.query("select coverage_effective and issued_document_id is not null and verified_by is not null ok from public.insurance_endorsements where id=$1", [e.id])).rows[0].ok, true, "efeito de cobertura preservado");
    } finally {
      await legacy.su.end().catch(() => {});
    }
    // linha NOVA não pode nascer legada nem CONFERIDO sem conferências
    await rejects(su.query("insert into public.insurance_endorsements (project_id,policy_id,endorsement_seq,state,requested_text,legacy_single_review,requires_dual_review,dual_review_reason) select project_id,id,99,'SOLICITADO','x',true,false,null from public.insurance_policies limit 1"), /LEGACY_FLAG_IMMUTABLE/, "endosso novo não nasce legado");
  });

  await check("CASO 31 (usuário sem autorização): LEITURA, COLABORADOR, inativo, convite pendente, ADMIN de outro projeto, anon e authenticated sem sub NÃO conferem; escrita direta negada", async () => {
    const x = await mkIssued({ kinds: ["SEGURADO"] });
    const v = x.issued.rowVersion;
    for (const [who, who_n] of [["LEITURA", U.LEITURA], ["COLAB", U.COLAB], ["INATIVO", U.INATIVO], ["PENDENTE", U.PENDENTE], ["ADMIN de outro projeto", U.ADMINB]]) {
      await rejects(review(await as(who_n), x.id, v), /FORBIDDEN/, `${who} confere`);
      await rejects(rpc(await as(who_n), "insurance_endorsement_advance", x.id, v, "CONFERIDO", "{}"), /FORBIDDEN/, `${who} confere via avanço`);
    }
    await rejects(review(await as(null, "authenticated"), x.id, v), /AUTH_REQUIRED/, "authenticated sem sub");
    await rejects(review(await as(null, "anon"), x.id, v), /permission denied/i, "anon");
    await rejects(review(await as(null, "service_role"), x.id, v), /AUTH_REQUIRED|permission denied/i, "service_role sem usuário");
    const a = await as(U.ADMIN);
    await rejects(a.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,1,$3,'APROVADO',$4,true)", [P, x.id, uid(U.ADMIN), NOTE]), /permission denied|row-level/i, "insert direto");
    await rejects(a.query("update public.insurance_endorsements set state='CONFERIDO', coverage_effective=true where id=$1", [x.id]), /permission denied/i, "update direto no endosso");
    await rejects(a.query("update public.insurance_endorsement_reviews set outcome='APROVADO'"), /permission denied/i, "update direto nas conferências");
    await rejects(a.query("delete from public.insurance_endorsement_reviews"), /permission denied/i, "delete direto");
    await rejects(rpc(await as(U.ADMIN), "insurance_endorsement_review", x.id, null, "APROVADO", "{}"), /EXPECTED_VERSION_REQUIRED/, "versão obrigatória");
    await rejects(rpc(await as(U.ADMIN), "insurance_endorsement_review", x.id, v, "TALVEZ", "{}"), /INVALID_OUTCOME/, "resultado inválido");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1", [x.id]), 0, "nada gravado");
    eq((await row(x.id)).state, "EMITIDO", "estado intacto");
    // anon não executa a RPC nem lê a tabela
    eq(await n("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='insurance_endorsement_review' and has_function_privilege('anon', p.oid, 'execute')"), 0, "anon sem EXECUTE");
    eq(await n("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('insurance_endorsement_guard','insurance_endorsement_review_prepare','insurance_int_endorsement_kinds') and has_function_privilege('authenticated', p.oid, 'execute')"), 0, "internas sem EXECUTE");
  });

  await check("CASO 37 (auditoria): cada conferência/recusa/conferido auditada append-only; conferências imutáveis até para superusuário", async () => {
    const x = await mkIssued({ kinds: ["COBERTURA_CLAUSULA"] });
    const r1 = await review(await as(U.ADMIN), x.id, x.issued.rowVersion);
    await review(await as(U.ADMIN2), x.id, r1.rowVersion);
    const au = (await su.query("select action, actor_user_id, project_id, detail from public.insurance_audit_events where entity_id=$1 order by occurred_at, id", [x.id])).rows;
    // os dois últimos eventos nascem na MESMA transação (mesmo occurred_at): a ordem entre eles não é contratual
    eq(au.map((r) => r.action).sort(), ["ENDORSEMENT_CONFERIDO", "ENDORSEMENT_EMITIDO", "ENDORSEMENT_REQUESTED", "ENDORSEMENT_REVIEW_APROVADO", "ENDORSEMENT_REVIEW_APROVADO"], "trilha");
    eq(au.map((r) => r.actor_user_id).sort(), [uid(U.COLAB), uid(U.GESTOR), uid(U.ADMIN), uid(U.ADMIN2), uid(U.ADMIN2)].sort(), "autores");
    ok(au.every((r) => r.project_id === P), "projeto");
    const revEv = au.filter((r) => r.action === "ENDORSEMENT_REVIEW_APROVADO").map((r) => r.detail.approved).sort();
    eq([revEv, au.find((r) => r.action === "ENDORSEMENT_CONFERIDO").detail.coverageEffective], [[1, 2], true], "contagens na trilha");
    await rejects(su.query("update public.insurance_endorsement_reviews set note='alterada para algo bem diferente aqui' where endorsement_id=$1", [x.id]), /INSURANCE_APPEND_ONLY/, "update");
    await rejects(su.query("delete from public.insurance_endorsement_reviews where endorsement_id=$1", [x.id]), /INSURANCE_APPEND_ONLY|INSURANCE_NO_DELETE/, "delete");
    await rejects(su.query("truncate public.insurance_endorsement_reviews"), /INSURANCE_NO_DELETE|INSURANCE_APPEND_ONLY/, "truncate");
    await rejects(su.query("update public.insurance_audit_events set action='x' where entity_id=$1", [x.id]), /INSURANCE_APPEND_ONLY/, "auditoria append-only");
    // tentativa recusada não deixa rastro de conferência nem de efeito
    const y = await mkIssued({ kinds: ["SEGURADO"], requester: U.GSC });
    const before = await n("select count(*)::int n from public.insurance_audit_events where entity_id=$1", [y.id]);
    await rejects(review(await as(U.GSC), y.id, y.issued.rowVersion), /COMPETENCE_REQUIRED/, "recusada");
    eq(await n("select count(*)::int n from public.insurance_audit_events where entity_id=$1", [y.id]), before, "tentativa barrada não grava auditoria de conferência");
  });

  await check("CASO 38 (concorrência): 8 conexões na MESMA conferência/emissão de endosso = exatamente 1 vence; versão otimista preservada", async () => {
    const x = await mkIssued({ kinds: ["VALOR_LIMITE"] });
    const conns = await Promise.all(Array.from({ length: 8 }, (_, i) => as(i % 2 ? U.ADMIN : U.ADMIN2)));
    const res = await Promise.allSettled(conns.map((c) => review(c, x.id, x.issued.rowVersion)));
    eq(res.filter((r) => r.status === "fulfilled").length, 1, "um vencedor");
    ok(res.filter((r) => r.status === "rejected").every((r) => /VERSION_CONFLICT|ALREADY_REVIEWED/.test(r.reason.message)), "erros claros");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews where endorsement_id=$1", [x.id]), 1, "uma conferência");
    eq((await row(x.id)).row_version, x.issued.rowVersion + 1, "versão +1");
    // emissão concorrente
    const pol = await mkPolicy();
    const e = await rpc(await as(U.COLAB), "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Emissão concorrente", change_kinds: ["VALOR_PREMIO"] }));
    const c2 = await Promise.all(Array.from({ length: 6 }, (_, i) => as(i % 2 ? U.GESTOR : U.GERENTE)));
    const r2 = await Promise.allSettled(c2.map((c, i) => rpc(c, "insurance_endorsement_advance", e.id, 1, "EMITIDO", JSON.stringify({ issued_text: "Emissão concorrente", issued_document_id: D2, issued_number: `C-${i}` }))));
    eq(r2.filter((r) => r.status === "fulfilled").length, 1, "emissão: um vencedor");
  });

  await check("CASO 39 (isolamento entre projetos): ADMIN de outra obra não lê conferências, não confere, não referencia endosso alheio", async () => {
    const x = await mkIssued({ kinds: ["SEGURADO"] });
    const r1 = await review(await as(U.ADMIN), x.id, x.issued.rowVersion);
    ok(r1.approved === 1, "conferência na obra A");
    const b = await as(U.ADMINB);
    eq((await b.query("select count(*)::int n from public.insurance_endorsement_reviews")).rows[0].n, 0, "obra B não vê conferências");
    eq((await b.query("select count(*)::int n from public.insurance_endorsements where project_id=$1", [P])).rows[0].n, 0, "obra B não vê endossos da A");
    await rejects(review(b, x.id, r1.rowVersion), /FORBIDDEN/, "obra B não confere");
    const a = await as(U.ADMIN2);
    eq((await a.query("select count(*)::int n from public.insurance_endorsement_reviews where project_id=$1", [P2])).rows[0].n, 0, "obra A não vê B");
    // conferência não herda projeto de cliente: project_id vem do endosso (trigger)
    await su.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,2,$3,'APROVADO',$4,true)", [P2, x.id, uid(U.ADMIN2), NOTE]);
    eq((await su.query("select project_id from public.insurance_endorsement_reviews where endorsement_id=$1 and reviewer_id=$2", [x.id, uid(U.ADMIN2)])).rows[0].project_id, P, "project_id forçado ao do endosso");
  });

  await check("CASO F3-C-10 (integridade): conferência só no estado EMITIDO; coverage_effective continua exigindo CONFERIDO+documento+verificador; pedido x emitido separados", async () => {
    const pol = await mkPolicy();
    const e = await rpc(await as(U.COLAB), "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Pedido ainda não emitido", change_kinds: ["SEGURADO"] }));
    await rejects(su.query("insert into public.insurance_endorsement_reviews (project_id,endorsement_id,review_round,review_no,reviewer_id,outcome,note,dual_required) values ($1,$2,1,1,$3,'APROVADO',$4,true)", [P, e.id, uid(U.ADMIN), NOTE]), /INVALID_TRANSITION/, "conferência de endosso não emitido");
    await rejects(su.query("update public.insurance_endorsements set coverage_effective = true where id=$1", [e.id]), /check constraint/i, "cobertura sem verificação");
    const r = await row(e.id);
    eq([r.state, r.coverage_effective, r.issued_text, r.issued_by], ["SOLICITADO", false, null, null], "pedido separado do emitido");
    // conferência com 3ª tentativa é impossível (review_no só 1 ou 2)
    const x = await mkIssued({ kinds: ["SEGURADO"] });
    const a1 = await review(await as(U.ADMIN), x.id, x.issued.rowVersion);
    const a2 = await review(await as(U.ADMIN2), x.id, a1.rowVersion);
    eq(a2.state, "CONFERIDO", "conferido");
    await rejects(review(await as(U.GERENTE), x.id, a2.rowVersion), /INVALID_TRANSITION/, "3ª conferência");
    // rebaixar CONFERIDO ou apagar
    await rejects(su.query("update public.insurance_endorsements set state='EMITIDO' where id=$1", [x.id]), /INVALID_TRANSITION/, "CONFERIDO não retrocede");
    await rejects(su.query("delete from public.insurance_endorsements where id=$1", [x.id]), /INSURANCE_NO_DELETE/, "sem exclusão");
  });

  await check("CASO F3-C-11 (envio real impossível): minuta de endosso segue DRAFT; tentativa de envio bloqueada; trava intacta", async () => {
    const x = await mkIssued({ kinds: ["SEGURADO"] });
    const a = await as(U.ADMIN);
    const d = await rpc(a, "insurance_draft_create", P, JSON.stringify({ draft_kind: "ENDOSSO", endorsement_id: x.id, subject: "Pedido de endosso", body: "Prezados, solicitamos o endosso conforme texto anexo ao pedido sintético." }));
    eq(d.state, "DRAFT", "minuta em DRAFT");
    const att = await rpc(a, "insurance_draft_attempt_send", d.id);
    eq([att.sent, att.blocked], [false, true], "envio bloqueado");
    eq((await su.query("select real_send_enabled from public.insurance_settings where project_id=$1", [P])).rows[0].real_send_enabled, false, "trava desligada");
  });

  await check("CASO F3-C-12 (replay): migration idempotente (3 aplicações) sem alterar dados; funções com EXECUTE só para authenticated", async () => {
    const snap = async () => JSON.stringify((await su.query("select id,state,row_version,change_kinds,requires_dual_review,dual_review_reason,legacy_single_review,review_round from public.insurance_endorsements order by id")).rows);
    const before = await snap();
    const cnt = await n("select count(*)::int n from public.insurance_endorsement_reviews");
    await su.query(strip(readFileSync(path.join(dir, MINE_FILE), "utf8")));
    await su.query(strip(readFileSync(path.join(dir, F4_FILE), "utf8")));
    eq(await snap(), before, "dados preservados na reaplicação");
    eq(await n("select count(*)::int n from public.insurance_endorsement_reviews"), cnt, "conferências preservadas");
    eq(await n("select count(*)::int n from pg_trigger where tgname in ('insurance_endorsements_guard','insurance_endorsement_reviews_prepare','insurance_endorsement_reviews_append_only') and not tgisinternal"), 3, "triggers únicos");
    eq(await n("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='insurance_endorsement_review' and has_function_privilege('authenticated', p.oid, 'execute')"), 1, "authenticated executa");
  });
} finally {
  await su.end().catch(() => {});
  for (const c of open) await c.end().catch(() => {});
  for (const d of dbs) await admin.query(`drop database if exists ${d} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
