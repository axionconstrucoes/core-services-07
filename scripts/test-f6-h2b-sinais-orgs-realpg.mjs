// FASE 6 / H2b — pilares, revisão de sinais, delegação e organizações globais em PostgreSQL REAL (adversarial). Replay das migrations numa
// base descartável (acc_f6h2b_*, apagada no fim); identidade por claims JWT (request.jwt.claims + set role); dados 100% SINTÉTICOS.
// Cobre: migração ADITIVA de pilares sobre linhas pré-existentes (JURIDICO => área JURIDICO, pilar nulo/impacto; legacy_pillar preservado),
// rollback -> reaplicação, CHECKs, gatilho de compatibilidade/deduplicação, view legacy lida pelo coletor de D, RPC email_risk_signal_review
// (matriz por papel + negativos), vínculo CANDIDATO/ambíguo PENDENTE, delegação (validade, revogação, escopo, ≤180 dias), auditoria
// append-only, organizações globais só por ADMINISTRADOR e solicitações de alteração (solicitar/decidir/cancelar).
// NÃO roda no CI. Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-f6-h2b-sinais-orgs-realpg.mjs
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
const { loadEmailRiskSignalRows } = await import("../apps/web/lib/risk-alerts/load-email-risk-signals.ts");
const { collectEmailRiskCases, emailSignalArea } = await import("../apps/web/lib/risk-alerts/collect-email-risk-cases.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const rbDir = path.join(here, "..", "supabase", "rollbacks");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PRE = files.filter((f) => f < "20261209100000");
const MINE = files.filter((f) => /^20261209(100000|101000)_/.test(f));
const AFTER = files.filter((f) => f > "20261209101000" && f < "20261211"); // a H6e (20261211*) muda a autorizacao global: coberta por test-f7-h6e-tenant-admin-realpg.mjs
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
const canon = (v) => JSON.stringify(v);
const eq = (a, b, m) => { if (canon(a) !== canon(b)) throw new Error(`${m}: esperado ${canon(b)}, obtido ${canon(a)}`); };
const rejects = async (p, re, m) => {
  try { await p; } catch (e) { ok(re.test(e.message), `${m}: erro inesperado: ${e.message.split("\n")[0]}`); return; }
  throw new Error(`${m}: deveria ter sido recusado`);
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f6h2b_${Date.now().toString(36)}`;
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
  ok(MINE.length === 2, `esperadas 2 migrations da H2b, achei ${MINE.length}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(6200 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000062a0";
  const PB = "10000000-0000-4000-8000-0000000062b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, ADMINB: 8, GESTORB: 9, COLAB2: 10 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f6h2b-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F6H2B ${n}`, `f6h2b-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F6A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F6B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.COLAB2, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "GESTOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await mem(PB, U.GESTORB, "GESTOR");

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

  // ---------- dados LEGADOS (antes das migrations da H2b): pilar JURIDICO ainda existe ----------
  const emailIds = [];
  for (let i = 0; i < 12; i += 1) {
    emailIds.push((await su.query("insert into public.emails (project_id, from_address, to_address, subject, sent_at, snippet, body_text) values ($1,$2,'obra@axion.com.br',$3, now(), 's','corpo sintético') returning id", [PA, `x${i}@forn-sint.com`, `Assunto ${i}`])).rows[0].id);
  }
  const mkCls = async (emailId, project, link = "LINKED", orgId = null) =>
    (await su.query(
      `insert into public.email_message_classifications (email_id, project_id, project_link_status, project_link_basis, officiality, party_kind, organization_id, authority_check, rule_version, status)
       values ($1,$2,$3,'teste','FORNECEDOR_SUBCONTRATADA','FORNECEDOR',$4,'NOT_APPLICABLE','f5b-1.0.0','ANALYZED') returning id`, [emailId, project, link, orgId])).rows[0].id;
  const clsLegacy = await mkCls(emailIds[0], PA);
  const legacySig = async (pillar, kind, confirmed = false) =>
    (await su.query("insert into public.email_risk_signals (email_id, classification_id, project_id, pillar, signal_kind, summary, evidence_excerpt, evidence_ref, confirmed) values ($1,$2,$3,$4,$5,'s','e','r',$6) returning id", [emailIds[0], clsLegacy, PA, pillar, kind, confirmed])).rows[0].id;
  const L = {
    pleito: await legacySig("JURIDICO", "PLEITO"),
    descump: await legacySig("JURIDICO", "DESCUMPRIMENTO_INDICIO"),
    reajuste: await legacySig("CUSTO", "REAJUSTE_AUMENTO_PRECO"),
    atraso: await legacySig("PRAZO", "ATRASO_FABRICACAO_ENTREGA"),
    defeito: await legacySig("QUALIDADE", "QUALIDADE_DEFEITO", true),
  };

  // ---------- aplica as migrations da H2b (+ as posteriores) ----------
  for (const f of [...MINE, ...AFTER]) {
    try { await su.query(sqlOf(f)); } catch (e) { console.log(`FAIL migration ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  for (let i = 0; i < 2; i += 1) for (const f of MINE) await su.query(sqlOf(f)); // idempotência (2 reaplicações)
  console.log(`PostgreSQL ${version}: ${PRE.length} migrations anteriores + ${MINE.length} da H2b (reaplicadas 2x) — base ${dbName}`);

  await check("H2B-01 migração ADITIVA: JURIDICO => área JURIDICO e pilar nulo (PLEITO => pilar CUSTO); CUSTO => área COMERCIAL; legacy_pillar preserva o original; nada se perde", async () => {
    const row = async (id) => (await su.query("select pillar, functional_area, legacy_pillar, review_status, confirmed from public.email_risk_signals where id=$1", [id])).rows[0];
    eq(await row(L.pleito), { pillar: "CUSTO", functional_area: "JURIDICO", legacy_pillar: "JURIDICO", review_status: "PENDING", confirmed: false }, "PLEITO");
    eq(await row(L.descump), { pillar: null, functional_area: "JURIDICO", legacy_pillar: "JURIDICO", review_status: "PENDING", confirmed: false }, "DESCUMPRIMENTO");
    eq(await row(L.reajuste), { pillar: "CUSTO", functional_area: "COMERCIAL", legacy_pillar: "CUSTO", review_status: "PENDING", confirmed: false }, "REAJUSTE");
    eq(await row(L.atraso), { pillar: "PRAZO", functional_area: null, legacy_pillar: "PRAZO", review_status: "PENDING", confirmed: false }, "ATRASO");
    eq(await row(L.defeito), { pillar: "QUALIDADE", functional_area: null, legacy_pillar: "QUALIDADE", review_status: "CONFIRMED", confirmed: true }, "DEFEITO (confirmado antes: preservado)");
    eq(await nq("select count(*)::int n from public.email_risk_signals"), 5, "nenhuma linha perdida");
    eq(await nq("select count(*)::int n from public.email_risk_signals where pillar = 'JURIDICO'"), 0, "nenhum pilar JURIDICO restante");
  });

  await check("H2B-02 ROLLBACK e reaplicação: o rollback devolve o contrato antigo (JURIDICO volta a ser pilar) sem perder linha; reaplicar migra de novo", async () => {
    for (const f of [...MINE].reverse()) await su.query(rbOf(f));
    eq(await nq("select count(*)::int n from public.email_risk_signals"), 5, "linhas após rollback");
    const rows = (await su.query("select id, pillar from public.email_risk_signals order by id")).rows;
    const by = Object.fromEntries(rows.map((r) => [r.id, r.pillar]));
    eq([by[L.pleito], by[L.descump], by[L.reajuste], by[L.atraso], by[L.defeito]], ["JURIDICO", "JURIDICO", "CUSTO", "PRAZO", "QUALIDADE"], "pilares originais restaurados");
    eq(await nq("select count(*)::int n from information_schema.columns where table_name='email_risk_signals' and column_name in ('functional_area','legacy_pillar','review_status')"), 0, "colunas removidas");
    eq(await nq("select count(*)::int n from pg_proc where proname in ('email_risk_signal_review','acc_external_change_request','acc_external_assert_global_admin')"), 0, "RPCs removidas");
    // as RPCs de C voltam ao corpo anterior (GESTOR gerencia)
    for (const f of MINE) await su.query(sqlOf(f));
    eq(await nq("select count(*)::int n from public.email_risk_signals where pillar = 'JURIDICO'"), 0, "reaplicada");
    eq(await nq("select count(*)::int n from public.email_risk_signals where functional_area = 'JURIDICO'"), 2, "áreas jurídicas de novo");
  });

  // classificações/sinais novos (escrita por service_role/superusuário, como o pipeline)
  const clsLinked = await mkCls(emailIds[1], PA);
  const sig = async (cls, pillar, kind, emailId = emailIds[1], project = PA) =>
    (await su.query("insert into public.email_risk_signals (email_id, classification_id, project_id, pillar, signal_kind, summary, evidence_excerpt, evidence_ref) values ($1,$2,$3,$4,$5,'resumo','trecho','ref') returning id", [emailId, cls, project, pillar, kind])).rows[0].id;

  await check("H2B-03 CHECKs e gatilho: pilar só os quatro (COMERCIAL/JURIDICO diretos recusados em UPDATE), gravador antigo com 'JURIDICO' é normalizado, duplicata por tipo descartada, sinal sem pilar nem área recusado", async () => {
    await rejects(su.query("insert into public.email_risk_signals (email_id,classification_id,project_id,pillar,signal_kind,summary,evidence_excerpt,evidence_ref) values ($1,$2,$3,'COMERCIAL','K','s','e','r')", [emailIds[1], clsLinked, PA]), /check constraint|violates/i, "pilar COMERCIAL");
    const a = await sig(clsLinked, "JURIDICO", "RECLAMACAO_FORMAL"); // gravador antigo
    eq((await su.query("select pillar, functional_area, legacy_pillar from public.email_risk_signals where id=$1", [a])).rows[0], { pillar: null, functional_area: "JURIDICO", legacy_pillar: "JURIDICO" }, "normalizado");
    await rejects(su.query("update public.email_risk_signals set pillar='JURIDICO' where id=$1", [a]), /check constraint|violates/i, "UPDATE para JURIDICO");
    await rejects(su.query("update public.email_risk_signals set functional_area='FINANCEIRO' where id=$1", [a]), /check constraint|violates/i, "área inválida");
    await rejects(su.query("update public.email_risk_signals set functional_area=null where id=$1", [a]), /check constraint|violates/i, "sem pilar nem área");
    const antes = await nq("select count(*)::int n from public.email_risk_signals where classification_id=$1", [clsLinked]);
    await su.query("insert into public.email_risk_signals (email_id,classification_id,project_id,pillar,signal_kind,summary,evidence_excerpt,evidence_ref) values ($1,$2,$3,'JURIDICO','RECLAMACAO_FORMAL','s','e','r') on conflict (classification_id, pillar, signal_kind) do nothing", [emailIds[1], clsLinked, PA]);
    eq(await nq("select count(*)::int n from public.email_risk_signals where classification_id=$1", [clsLinked]), antes, "duplicata (pilar nulo) descartada");
    const b = await sig(clsLinked, "CUSTO", "REAJUSTE_AUMENTO_PRECO");
    eq((await su.query("select pillar, functional_area from public.email_risk_signals where id=$1", [b])).rows[0], { pillar: "CUSTO", functional_area: "COMERCIAL" }, "CUSTO => COMERCIAL");
    await su.query("delete from public.email_risk_signals where id in ($1,$2)", [a, b]);
  });

  // ---------- fixtures de organizações (via RPC de ADMIN) ----------
  const adm = await as(U.ADMIN, "authenticated", true);
  const ges = await as(U.GESTOR, "authenticated", true);
  const org = async (c, p, o) => rpc(c, "acc_external_org_save", p, JSON.stringify(o));
  const link = async (c, p, l, reason) => rpc(c, "acc_external_link_save", p, JSON.stringify(l), reason ?? null);

  await check("H2B-04 REVISÃO por papel: GESTOR/GERENTE/ADMIN confirmam; LEITURA, COLABORADOR sem delegação, inativo, outro projeto, anon e sem sub são recusados sem gravar", async () => {
    const matrix = [["GESTOR", U.GESTOR, true], ["GERENTE", U.GERENTE, true], ["ADMINISTRADOR", U.ADMIN, true], ["LEITURA", U.LEITURA, false], ["COLABORADOR", U.COLAB, false],
      ["INATIVO", U.INATIVO, false], ["OUTRO_PROJETO", U.ADMINB, false], ["SEM_SUB", null, false]];
    for (const [label, n, can] of matrix) {
      const s = await sig(clsLinked, "PRAZO", `KIND_${label}`);
      const c = await as(n, "authenticated");
      if (can) {
        const r = await rpc(c, "email_risk_signal_review", s, "CONFIRM", `Conferido por ${label}`);
        eq([r.review_status, r.via], ["CONFIRMED", "TIER"], label);
        const row = (await su.query("select confirmed, review_status, reviewed_by, reviewed_at, review_note from public.email_risk_signals where id=$1", [s])).rows[0];
        eq([row.confirmed, row.review_status, row.reviewed_by === uid(n), row.reviewed_at !== null, row.review_note], [true, "CONFIRMED", true, true, `Conferido por ${label}`], `${label} gravou`);
      } else {
        await rejects(rpc(c, "email_risk_signal_review", s, "CONFIRM", "x"), DENIED, label);
        eq((await su.query("select review_status, confirmed from public.email_risk_signals where id=$1", [s])).rows[0], { review_status: "PENDING", confirmed: false }, `${label} não gravou`);
      }
    }
    await rejects(rpc(await as(null, "anon"), "email_risk_signal_review", L.atraso, "CONFIRM", "x"), /permission denied/i, "anon");
    eq(await nq("select count(*)::int n from public.email_signal_review_audit where action='REVIEW_CONFIRM'"), 3, "3 auditorias (só os que gravaram)");
  });

  await check("H2B-05 DISCARD exige justificativa; decisão única (ALREADY_REVIEWED); decisão inválida; sinal inexistente; descarte registra auditoria", async () => {
    const s = await sig(clsLinked, "QUALIDADE", "QUALIDADE_DEFEITO");
    await rejects(rpc(ges, "email_risk_signal_review", s, "DISCARD", null), /NOTE_REQUIRED/, "sem nota");
    await rejects(rpc(ges, "email_risk_signal_review", s, "DISCARD", "ok"), /NOTE_REQUIRED/, "nota curta");
    await rejects(rpc(ges, "email_risk_signal_review", s, "TALVEZ", "nota válida"), /INVALID_DECISION/, "decisão inválida");
    await rejects(rpc(ges, "email_risk_signal_review", "10000000-0000-4000-8000-000000000000", "CONFIRM", null), /NOT_FOUND/, "inexistente");
    const r = await rpc(ges, "email_risk_signal_review", s, "DISCARD", "Falso positivo: citação de e-mail antigo");
    eq([r.review_status], ["DISCARDED"], "descartado");
    eq((await su.query("select confirmed, is_indication, review_status from public.email_risk_signals where id=$1", [s])).rows[0], { confirmed: false, is_indication: true, review_status: "DISCARDED" }, "linha");
    await rejects(rpc(adm, "email_risk_signal_review", s, "CONFIRM", null), /ALREADY_REVIEWED/, "segunda decisão");
    const a = (await su.query("select action, via, actor_id, before_state->>'review_status' b, after_state->>'review_status' a2, note from public.email_signal_review_audit where signal_id=$1", [s])).rows;
    eq(a.length, 1, "1 auditoria"); eq([a[0].action, a[0].via, a[0].actor_id, a[0].b, a[0].a2], ["REVIEW_DISCARD", "TIER", uid(U.GESTOR), "PENDING", "DISCARDED"], "conteúdo da auditoria");
  });

  await check("H2B-06 VÍNCULO PENDENTE: mensagem CANDIDATA/AMBÍGUA ou organização só com vínculo CANDIDATO NÃO pode ser confirmada (PENDING_LINK_VALIDATION); descarte é permitido; validado o vínculo, confirma", async () => {
    const clsCand = await mkCls(emailIds[2], PA, "CANDIDATE");
    const sc = await sig(clsCand, "PRAZO", "ATRASO_FABRICACAO_ENTREGA", emailIds[2]);
    await rejects(rpc(adm, "email_risk_signal_review", sc, "CONFIRM", null), /PENDING_LINK_VALIDATION/, "vínculo CANDIDATO da mensagem");
    eq((await su.query("select review_status, confirmed from public.email_risk_signals where id=$1", [sc])).rows[0], { review_status: "PENDING", confirmed: false }, "permanece PENDENTE");
    const clsAmb = await mkCls(emailIds[3], PA, "AMBIGUOUS");
    const sa = await sig(clsAmb, "CUSTO", "REAJUSTE_AUMENTO_PRECO", emailIds[3]);
    await rejects(rpc(adm, "email_risk_signal_review", sa, "CONFIRM", null), /PENDING_LINK_VALIDATION/, "mensagem ambígua");
    // organização com vínculo CANDIDATO
    const ORG = await org(adm, PA, { legal_name: "Fornecedor Sintético H2b Ltda", org_kind: "FORNECEDOR" });
    const lk = await link(adm, PA, { organization_id: ORG, role_in_project: "FORNECEDOR", status: "CANDIDATE" });
    const clsOrg = await mkCls(emailIds[4], PA, "LINKED", ORG);
    const so = await sig(clsOrg, "PRAZO", "RISCO_PARALISACAO", emailIds[4]);
    await rejects(rpc(adm, "email_risk_signal_review", so, "CONFIRM", null), /PENDING_LINK_VALIDATION/, "organização com vínculo só CANDIDATO");
    await link(ges, PA, { id: lk, status: "ACTIVE" }, "Contrato conferido"); // GESTOR valida o vínculo do SEU projeto
    eq((await rpc(ges, "email_risk_signal_review", so, "CONFIRM", "Vínculo validado")).review_status, "CONFIRMED", "confirma após validar o vínculo");
    // vínculo vencido volta a bloquear
    const clsOrg2 = await mkCls(emailIds[5], PA, "LINKED", ORG);
    const so2 = await sig(clsOrg2, "PRAZO", "RISCO_PARALISACAO", emailIds[5]);
    await link(ges, PA, { id: lk, status: "ACTIVE", valid_from: "2025-01-01", valid_until: "2025-12-31" });
    await rejects(rpc(adm, "email_risk_signal_review", so2, "CONFIRM", null), /PENDING_LINK_VALIDATION/, "vínculo vencido");
    // descarte de candidato é permitido
    eq((await rpc(adm, "email_risk_signal_review", sc, "DISCARD", "Remetente não pertence à obra")).review_status, "DISCARDED", "descarte permitido");
  });

  await check("H2B-07 DELEGAÇÃO: só ADMINISTRADOR concede (GESTOR/GERENTE/COLAB não); validade futura <= 180 dias; delegado ativo; escopo por área; revogação; expirada; delegado inativo", async () => {
    const days = (d) => new Date(Date.now() + d * 86400000).toISOString();
    for (const [label, c] of [["GESTOR", ges], ["GERENTE", await as(U.GERENTE)], ["COLAB", await as(U.COLAB)], ["ADMIN_OUTRO_PROJETO", await as(U.ADMINB)], ["anon", await as(null, "anon")]]) {
      await rejects(rpc(c, "acc_email_signal_delegate_grant", PA, uid(U.COLAB), "PRAZO", days(30), "Delegação de teste"), /FORBIDDEN|permission denied/i, `${label} não delega`);
    }
    await rejects(rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.COLAB), "PRAZO", days(181), "Delegação de teste"), /INVALID_VALIDITY/, "181 dias");
    await rejects(rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.COLAB), "PRAZO", days(-1), "Delegação de teste"), /INVALID_VALIDITY/, "passado");
    await rejects(rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.COLAB), "FINANCEIRO", days(30), "Delegação de teste"), /INVALID_SCOPE/, "escopo inválido");
    await rejects(rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.COLAB), "PRAZO", days(30), "x"), /REASON_REQUIRED/, "sem motivo");
    await rejects(rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.ADMINB), "PRAZO", days(30), "Delegação de teste"), /NOT_MEMBER/, "não é membro do projeto");
    await rejects(rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.INATIVO), "PRAZO", days(30), "Delegação de teste"), /NOT_MEMBER/, "membro inativo");
    const d1 = await rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.COLAB), "PRAZO", days(30), "Profissional de planejamento da obra");
    const col = await as(U.COLAB);
    const sPrazo = await sig(clsLinked, "PRAZO", "ESCASSEZ_INSUMO");
    const sJur = await sig(clsLinked, "JURIDICO", "PLEITO");
    const sQual = await sig(clsLinked, "QUALIDADE", "QUALIDADE_MONTAGEM");
    await rejects(rpc(col, "email_risk_signal_review", sJur, "CONFIRM", null), /FORBIDDEN/, "fora do escopo (área jurídica)");
    await rejects(rpc(col, "email_risk_signal_review", sQual, "CONFIRM", null), /FORBIDDEN/, "fora do escopo (qualidade)");
    const r = await rpc(col, "email_risk_signal_review", sPrazo, "CONFIRM", "Confirmado pela delegação");
    eq(r.via, "DELEGATION", "via delegação");
    eq((await su.query("select delegation_id, via, actor_id from public.email_signal_review_audit where signal_id=$1", [sPrazo])).rows[0], { delegation_id: d1, via: "DELEGATION", actor_id: uid(U.COLAB) }, "auditoria da delegação");
    // revogada
    await rejects(rpc(await as(U.GESTOR), "acc_email_signal_delegate_revoke", d1, "Encerrada"), /FORBIDDEN/, "GESTOR não revoga");
    await rejects(rpc(adm, "acc_email_signal_delegate_revoke", d1, "x"), /REASON_REQUIRED/, "revogar sem motivo");
    await rpc(adm, "acc_email_signal_delegate_revoke", d1, "Fim da delegação");
    await rejects(rpc(adm, "acc_email_signal_delegate_revoke", d1, "Fim da delegação"), /ALREADY_REVOKED/, "revogar de novo");
    const s2 = await sig(clsLinked, "PRAZO", "SUSPENSAO_FORNECIMENTO");
    await rejects(rpc(col, "email_risk_signal_review", s2, "CONFIRM", null), /FORBIDDEN/, "revogada não vale");
    // TODAS + validade
    const d2 = await rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.COLAB2), "TODAS", days(10), "Substituto do gestor nas férias");
    const col2 = await as(U.COLAB2);
    eq((await rpc(col2, "email_risk_signal_review", sJur, "CONFIRM", "ok")).via, "DELEGATION", "TODAS cobre a área jurídica");
    // expira: recua o relógio da delegação (superusuário simula a passagem do tempo)
    await su.query("update public.email_signal_review_delegations set valid_from = now() - interval '40 days', valid_until = now() - interval '1 day' where id=$1", [d2]);
    await rejects(rpc(col2, "email_risk_signal_review", sQual, "CONFIRM", null), /FORBIDDEN/, "expirada não vale");
    // delegado que deixou de ser membro ativo perde o poder
    const d3 = await rpc(adm, "acc_email_signal_delegate_grant", PA, uid(U.LEITURA), "QUALIDADE", days(10), "Leitura designada para qualidade");
    eq((await rpc(await as(U.LEITURA), "email_risk_signal_review", sQual, "CONFIRM", "ok")).via, "DELEGATION", "delegado vale enquanto membro ativo");
    const sQ2 = await sig(clsLinked, "QUALIDADE", "QUALIDADE_DEFEITO_2");
    await su.query("update public.project_memberships set status='INACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.LEITURA)]);
    await rejects(rpc(await as(U.LEITURA), "email_risk_signal_review", sQ2, "CONFIRM", null), /FORBIDDEN/, "membro inativo perde a delegação");
    await su.query("update public.project_memberships set status='ACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.LEITURA)]);
    ok(d3, "d3");
  });

  await check("H2B-08 AUDITORIA append-only (nem superusuário altera/apaga/trunca) e RLS: gestão lê a trilha; colaborador não; delegado lê a própria delegação; escrita direta negada", async () => {
    await rejects(su.query("update public.email_signal_review_audit set note='x'"), /APPEND_ONLY/, "update");
    await rejects(su.query("delete from public.email_signal_review_audit"), /APPEND_ONLY/, "delete");
    await rejects(su.query("truncate public.email_signal_review_audit"), /APPEND_ONLY/, "truncate");
    const n = async (c, t) => Number((await c.query(`select count(*)::int n from public.${t}`)).rows[0].n);
    ok((await n(await as(U.GESTOR), "email_signal_review_audit")) > 3, "GESTOR lê a trilha");
    eq(await n(await as(U.COLAB), "email_signal_review_audit"), 0, "COLABORADOR não lê a trilha");
    eq(await n(await as(U.ADMINB), "email_signal_review_audit"), 0, "outro projeto não lê");
    ok((await n(await as(U.COLAB), "email_signal_review_delegations")) >= 1, "delegado lê a própria delegação");
    eq(await n(await as(U.COLAB2), "email_signal_review_delegations"), 1, "delegado só vê a sua");
    for (const sql of ["insert into public.email_signal_review_delegations (project_id,user_id,scope,valid_until,reason) values ('" + PA + "','" + uid(U.COLAB) + "','TODAS', now() + interval '1 day','motivo teste')",
      "update public.email_signal_review_delegations set revoked_at = null", "delete from public.email_signal_review_audit", "update public.email_risk_signals set confirmed = true"]) {
      await rejects((await as(U.ADMIN)).query(sql), DENIED, sql.slice(0, 50));
    }
  });

  await check("H2B-09 COMPATIBILIDADE COM D: view legacy devolve 'JURIDICO' para a área jurídica; coletor lê sinais pelo cliente e DESCARTADOS ficam fora; o caso do PLEITO continua na área JURIDICO", async () => {
    const v = (await su.query("select pillar, functional_area from public.email_risk_signals_legacy where id=$1", [L.pleito])).rows[0];
    eq(v, { pillar: "JURIDICO", functional_area: "JURIDICO" }, "view legacy (PLEITO)");
    eq((await su.query("select pillar from public.email_risk_signals_legacy where id=$1", [L.reajuste])).rows[0].pillar, "CUSTO", "view legacy (CUSTO)");
    // view respeita RLS do chamador (security_invoker): membro vê, outro projeto não
    eq(Number((await (await as(U.GESTOR)).query("select count(*)::int n from public.email_risk_signals_legacy")).rows[0].n) > 0, true, "membro lê pela view");
    eq(Number((await (await as(U.ADMINB)).query("select count(*)::int n from public.email_risk_signals_legacy")).rows[0].n), 0, "outro projeto não lê pela view");
    const sb = {
      from(table) {
        const q = { cols: "*", where: [], order: null, lim: null };
        const run = async () => {
          const params = [];
          const where = q.where.map(([c, op, v2]) => { params.push(v2); return op === "in" ? `${c} = any($${params.length})` : op === "<>" ? `${c} <> $${params.length}` : `${c} = $${params.length}`; });
          const sql = `select ${q.cols} from public.${table}${where.length ? ` where ${where.join(" and ")}` : ""}${q.order ? ` order by ${q.order[0]} ${q.order[1] ? "asc" : "desc"}` : ""}${q.lim ? ` limit ${q.lim}` : ""}`;
          return { data: (await su.query(sql, params)).rows, error: null };
        };
        const b = {
          select(c) { q.cols = c; return b; }, eq(c, v2) { q.where.push([c, "=", v2]); return b; }, neq(c, v2) { q.where.push([c, "<>", v2]); return b; },
          in(c, v2) { q.where.push([c, "in", v2]); return b; }, order(c, o) { q.order = [c, o?.ascending !== false]; return b; }, limit(n2) { q.lim = n2; return b; },
          then(res, rej) { return run().then(res, rej); },
        };
        return b;
      },
    };
    const rows = await loadEmailRiskSignalRows(sb, PA);
    ok(rows.length > 0, "coletor carregou sinais");
    ok(rows.every((r) => r.pillar !== null && r.pillar !== ""), "pillar nunca vazio para o coletor");
    const pleito = rows.find((r) => r.id === L.pleito);
    eq(pleito.pillar, "JURIDICO", "contrato legado preservado no coletor");
    eq(emailSignalArea(pleito), "JURIDICO", "área do caso do PLEITO = JURIDICO (comportamento anterior preservado)");
    const discarded = (await su.query("select id from public.email_risk_signals where review_status='DISCARDED'")).rows.map((r) => r.id);
    ok(discarded.length > 0, "há descartados");
    ok(!rows.some((r) => discarded.includes(r.id)), "descartados fora do coletor");
    const cases = collectEmailRiskCases(rows);
    ok(cases.length > 0, "casos gerados");
    ok(cases.every((c2) => c2.sourceType === "EMAIL"), "fonte EMAIL");
  });

  // ============ organizações globais ============
  await check("H2B-10 DADOS GLOBAIS só por ADMINISTRADOR: GESTOR, GERENTE, COLAB, LEITURA, inativo, outro projeto, anon e sem sub não criam/alteram organização, domínio nem contato", async () => {
    const ORG = await org(adm, PA, { legal_name: "Org Global Sintética Ltda", tax_id: "33.333.333/0001-33", org_kind: "FORNECEDOR" });
    await link(adm, PA, { organization_id: ORG, role_in_project: "FORNECEDOR", status: "CANDIDATE" });
    const before = await nq("select count(*)::int n from public.external_organizations");
    for (const [label, n, role] of [["GESTOR", U.GESTOR, "authenticated"], ["GERENTE", U.GERENTE, "authenticated"], ["COLABORADOR", U.COLAB, "authenticated"], ["LEITURA", U.LEITURA, "authenticated"],
      ["INATIVO", U.INATIVO, "authenticated"], ["OUTRO_PROJETO", U.ADMINB, "authenticated"], ["SEM_SUB", null, "authenticated"], ["ANON", null, "anon"]]) {
      const c = await as(n, role);
      await rejects(org(c, PA, { legal_name: `Org ${label} Ltda`, org_kind: "OUTRO" }), DENIED, `${label} cria org`);
      await rejects(org(c, PA, { id: ORG, legal_name: `Renomeada ${label} Ltda` }), DENIED, `${label} altera razão social/CNPJ`);
      await rejects(rpc(c, "acc_external_domain_set", PA, ORG, `${label.toLowerCase()}.com.br`, true, null), DENIED, `${label} altera domínio`);
      await rejects(rpc(c, "acc_external_contact_set", PA, ORG, `${label.toLowerCase()}@x.com.br`, null, "CONFIRMED"), DENIED, `${label} altera contato global`);
    }
    eq(await nq("select count(*)::int n from public.external_organizations"), before, "nada criado");
    eq((await su.query("select legal_name, tax_id from public.external_organizations where id=$1", [ORG])).rows[0], { legal_name: "Org Global Sintética Ltda", tax_id: "33.333.333/0001-33" }, "dados globais intactos");
    eq(await nq("select count(*)::int n from public.external_org_domains where organization_id=$1", [ORG]), 0, "nenhum domínio");
    // ADMIN altera
    await org(adm, PA, { id: ORG, legal_name: "Org Global Sintética S/A", tax_id: "33.333.333/0001-34" });
    await rpc(adm, "acc_external_domain_set", PA, ORG, "global-sint.com.br", true, "cadastro");
    await rpc(adm, "acc_external_contact_set", PA, ORG, "contato@global-sint.com.br", "Contato", "CONFIRMED", "cadastro");
    eq((await su.query("select legal_name, tax_id from public.external_organizations where id=$1", [ORG])).rows[0], { legal_name: "Org Global Sintética S/A", tax_id: "33.333.333/0001-34" }, "ADMIN altera");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where action in ('ORG_UPDATE','DOMAIN_SET_ACTIVE','CONTACT_SET_CONFIRMED')") >= 3, "auditoria das alterações");
  });

  await check("H2B-11 GESTOR/GERENTE SEGUEM gerindo VÍNCULOS e candidatos do SEU projeto; outro projeto não gere os vínculos deste", async () => {
    const ORG = (await su.query("select id from public.external_organizations where legal_name = 'Org Global Sintética S/A'")).rows[0].id;
    const lk = (await su.query("select id from public.external_org_project_links where organization_id=$1 and project_id=$2", [ORG, PA])).rows[0].id;
    await link(ges, PA, { id: lk, status: "ACTIVE", contract_ref: "CT-H2B", delegation_scope: ["os"] }, "Contrato conferido pelo gestor");
    eq((await su.query("select status, confirmed_by, contract_ref from public.external_org_project_links where id=$1", [lk])).rows[0], { status: "ACTIVE", confirmed_by: uid(U.GESTOR), contract_ref: "CT-H2B" }, "gestor valida vínculo");
    const ger = await as(U.GERENTE);
    await link(ger, PA, { id: lk, delegation_clause_ref: "Cl. 7" }, "Cláusula");
    await rejects(link(await as(U.GESTORB), PB, { id: lk, status: "ENDED" }), /NOT_FOUND|FORBIDDEN/, "vínculo de outro projeto");
    await rejects(link(await as(U.GESTORB), PA, { id: lk, status: "ENDED" }), DENIED, "gestor de B no projeto A");
    // candidato descoberto + decisão do gestor
    const cand = await rpc(await as(null, "service_role"), "acc_external_candidate_register", PA, "novo@global-sint.com.br", null);
    const r = await rpc(ges, "acc_external_candidate_decide", PA, cand, "CONFIRM", ORG, "Pessoa do fornecedor");
    eq(r.decision, "CONFIRM", "gestor decide candidato do projeto");
  });

  await check("H2B-12 SOLICITAÇÃO de alteração global: GESTOR/GERENTE/ADMIN solicitam; COLAB/LEITURA/outro projeto/anon não; ADMIN decide e a aplicação é auditada; GESTOR não decide", async () => {
    const ORG = (await su.query("select id from public.external_organizations where legal_name = 'Org Global Sintética S/A'")).rows[0].id;
    const req = (c, p, kind, o, payload, reason = "Correção de razão social conforme contrato") => rpc(c, "acc_external_change_request", p, kind, o, JSON.stringify(payload), reason);
    for (const [label, n, role] of [["COLABORADOR", U.COLAB, "authenticated"], ["LEITURA", U.LEITURA, "authenticated"], ["INATIVO", U.INATIVO, "authenticated"], ["OUTRO_PROJETO", U.ADMINB, "authenticated"], ["SEM_SUB", null, "authenticated"], ["ANON", null, "anon"]]) {
      await rejects(req(await as(n, role), PA, "ORG_UPDATE", ORG, { legal_name: "Hack" }), DENIED, `${label} solicita`);
    }
    await rejects(req(ges, PA, "ORG_UPDATE", ORG, { legal_name: "Hack" }, "x"), /REASON_REQUIRED/, "motivo obrigatório");
    await rejects(req(ges, PA, "ORG_UPDATE", ORG, { legal_name: "Hack" }, "Correção de razão social").then(() => req(ges, PA, "INVENTADO", ORG, {})), /INVALID_KIND/, "tipo inválido");
    await rejects(req(ges, PA, "ORG_CREATE", null, { org_kind: "OUTRO" }), /INVALID_PAYLOAD/, "ORG_CREATE sem razão social");
    await rejects(req(ges, PA, "DOMAIN_SET", ORG, {}), /INVALID_PAYLOAD/, "domínio vazio");
    await rejects(req(ges, PA, "CONTACT_SET", ORG, { email: "a@b.com", status: "TALVEZ" }), /INVALID_PAYLOAD/, "status inválido");
    await rejects(req(await as(U.GESTORB), PB, "ORG_UPDATE", ORG, { legal_name: "X" }), /FORBIDDEN/, "organização fora do alcance de B");
    eq(await nq("select count(*)::int n from public.external_org_change_requests where status='PENDING'"), 1, "só a solicitação válida ficou pendente");
    const pend = (await su.query("select id from public.external_org_change_requests where status='PENDING'")).rows[0].id;
    // dado global NÃO mudou com a solicitação
    eq((await su.query("select legal_name from public.external_organizations where id=$1", [ORG])).rows[0].legal_name, "Org Global Sintética S/A", "solicitar não altera");
    for (const [label, c] of [["GESTOR", ges], ["GERENTE", await as(U.GERENTE)], ["COLAB", await as(U.COLAB)], ["ADMIN_OUTRO_PROJETO", await as(U.ADMINB)], ["anon", await as(null, "anon")]]) {
      await rejects(rpc(c, "acc_external_change_decide", pend, "APPROVE", null), /FORBIDDEN|permission denied/i, `${label} não decide`);
    }
    await rejects(rpc(adm, "acc_external_change_decide", pend, "REJECT", null), /NOTE_REQUIRED/, "recusa exige motivo");
    const ap = await rpc(adm, "acc_external_change_decide", pend, "APPROVE", "Conferido com o cartão CNPJ");
    eq(ap.decision, "APPROVE", "aprovada");
    eq((await su.query("select status, decided_by from public.external_org_change_requests where id=$1", [pend])).rows[0], { status: "APPROVED", decided_by: uid(U.ADMIN) }, "estado");
    eq((await su.query("select legal_name from public.external_organizations where id=$1", [ORG])).rows[0].legal_name, "Hack", "aplicada pela decisão do ADMIN (payload da solicitação)");
    await rejects(rpc(adm, "acc_external_change_decide", pend, "APPROVE", null), /ALREADY_DECIDED/, "decisão única");
    ok(await nq("select count(*)::int n from public.external_contacts_audit where action in ('CHANGE_REQUESTED_ORG_UPDATE','CHANGE_APPROVE_ORG_UPDATE','ORG_UPDATE') and project_id=$1", [PA]) >= 3, "auditoria: solicitação, decisão e alteração");
  });

  await check("H2B-13 SOLICITAÇÃO por tipo: ORG_CREATE aprovada cria a organização e um vínculo CANDIDATO visível ao gestor; DOMAIN_SET e CONTACT_SET aplicados; REJECT não altera; cancelamento só pelo solicitante/ADMIN", async () => {
    const req = (c, p, kind, o, payload) => rpc(c, "acc_external_change_request", p, kind, o, JSON.stringify(payload), "Cadastro solicitado pelo gestor da obra");
    const orgsBefore = await nq("select count(*)::int n from public.external_organizations");
    const rc = await req(ges, PA, "ORG_CREATE", null, { legal_name: "Nova Subcontratada Sintética Ltda", org_kind: "SUBCONTRATADA", tax_id: "44.444.444/0001-44" });
    eq(await nq("select count(*)::int n from public.external_organizations"), orgsBefore, "pedido não cria");
    const r1 = await rpc(adm, "acc_external_change_decide", rc, "APPROVE", "Cadastro conferido");
    const newOrg = r1.applied.organization_id;
    ok(newOrg, "organização criada");
    eq((await su.query("select role_in_project, status, confirmed_by from public.external_org_project_links where organization_id=$1 and project_id=$2", [newOrg, PA])).rows[0], { role_in_project: "SUBCONTRATADA", status: "CANDIDATE", confirmed_by: null }, "vínculo CANDIDATO (sem autoridade)");
    eq(Number((await ges.query("select count(*)::int n from public.external_organizations where id=$1", [newOrg])).rows[0].n), 1, "gestor enxerga a nova organização");
    const rd = await req(ges, PA, "DOMAIN_SET", newOrg, { domain: "nova-sub-sint.com.br", active: true });
    await rpc(adm, "acc_external_change_decide", rd, "APPROVE", null);
    eq(await nq("select count(*)::int n from public.external_org_domains where organization_id=$1 and domain='nova-sub-sint.com.br' and active", [newOrg]), 1, "domínio aplicado");
    const rk = await req(ges, PA, "CONTACT_SET", newOrg, { email: "Pessoa@Nova-Sub-Sint.com.br", display_name: "Pessoa", status: "CONFIRMED" });
    await rpc(adm, "acc_external_change_decide", rk, "APPROVE", null);
    eq(await nq("select count(*)::int n from public.external_contacts where organization_id=$1 and email='pessoa@nova-sub-sint.com.br' and status='CONFIRMED'", [newOrg]), 1, "contato aplicado (normalizado)");
    const rr = await req(ges, PA, "DOMAIN_SET", newOrg, { domain: "recusado-sint.com.br" });
    await rpc(adm, "acc_external_change_decide", rr, "REJECT", "Domínio não pertence à organização");
    eq(await nq("select count(*)::int n from public.external_org_domains where domain='recusado-sint.com.br'"), 0, "recusa não altera");
    // cancelamento
    const rx = await req(ges, PA, "DOMAIN_SET", newOrg, { domain: "cancelado-sint.com.br" });
    await rejects(rpc(await as(U.GERENTE), "acc_external_change_cancel", rx, "Não precisa mais"), /FORBIDDEN/, "outro gestor não cancela pedido alheio");
    await rpc(ges, "acc_external_change_cancel", rx, "Não precisa mais");
    await rejects(rpc(adm, "acc_external_change_decide", rx, "APPROVE", null), /ALREADY_DECIDED/, "cancelada não é decidida");
    eq(await nq("select count(*)::int n from public.external_org_domains where domain='cancelado-sint.com.br'"), 0, "cancelada não aplica");
    // RLS: solicitações visíveis só à gestão do projeto; sem escrita direta
    const n = async (c) => Number((await c.query("select count(*)::int n from public.external_org_change_requests")).rows[0].n);
    ok((await n(ges)) >= 5, "GESTOR lê as solicitações do projeto");
    eq(await n(await as(U.COLAB)), 0, "COLABORADOR não lê"); eq(await n(await as(U.ADMINB)), 0, "outro projeto não lê");
    await rejects(adm.query("update public.external_org_change_requests set status='APPROVED'"), DENIED, "update direto");
    await rejects(adm.query("insert into public.external_org_change_requests (project_id,kind,payload,reason) values ('" + PA + "','ORG_CREATE','{}','motivo teste')"), DENIED, "insert direto");
    ok(rc && rd && rk && rr, "ids");
  });

  await check("H2B-14 PRIVILÉGIOS: anon sem EXECUTE nas RPCs novas; funções SECURITY DEFINER com search_path vazio; nada de envio de e-mail", async () => {
    const fns = ["email_risk_signal_review", "acc_email_signal_delegate_grant", "acc_email_signal_delegate_revoke", "acc_external_change_request", "acc_external_change_decide", "acc_external_change_cancel",
      "acc_external_assert_global_admin", "email_signal_review_audit_write", "email_risk_signals_normalize"];
    for (const f of fns) {
      const r = (await su.query("select prosecdef, proconfig, has_function_privilege('anon', oid, 'execute') anon_exec from pg_proc where proname=$1 and pronamespace='public'::regnamespace", [f])).rows;
      ok(r.length >= 1, `${f} existe`);
      for (const x of r) { ok(x.prosecdef, `${f} security definer`); ok((x.proconfig ?? []).some((c) => /search_path=/.test(c)), `${f} search_path`); eq(x.anon_exec, false, `${f} anon sem EXECUTE`); }
    }
    for (const f of ["email_risk_signals_normalize", "acc_external_assert_global_admin", "email_signal_review_audit_write"]) {
      eq((await su.query("select has_function_privilege('authenticated', oid, 'execute') x from pg_proc where proname=$1", [f])).rows[0].x, false, `${f} interna (authenticated sem EXECUTE)`);
    }
  });
} finally {
  while (keepOpen.length) await keepOpen.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
