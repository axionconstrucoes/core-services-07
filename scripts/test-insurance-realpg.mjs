// S1 — SEGUROS / FIANÇAS / ENDOSSOS / SINISTROS em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base
// descartável (acc_ins_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role) e concorrência real
// (conexões independentes). Dados 100% SINTÉTICOS. NÃO roda no CI.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-insurance-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
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
const MINE = files.filter((f) => /^20261122(20\d{4})_/.test(f));
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
const dbName = `acc_ins_${Date.now().toString(36)}`;
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
  for (const f of MINE) { // idempotência: reaplicadas 2x
    const sql = readFileSync(path.join(dir, f), "utf8");
    await su.query(sql);
    await su.query(sql);
  }
  // A reaplicação do S1 recoloca as definições ORIGINAIS das funções; as migrations POSTERIORES (Fase 3: permissões/B e endossos/C,
  // que redefinem insurance_claim_advance, insurance_endorsement_* e insurance_dashboard_items) voltam por cima, na ordem, como no deploy.
  for (const f of files.filter((x) => x > MINE[MINE.length - 1] && /^20261123/.test(x))) await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, ""));
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} do S1 reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(2200 + n).padStart(12, "0")}`;
  const P = "10000000-0000-4000-8000-0000000022a0";
  const P2 = "10000000-0000-4000-8000-0000000022b0";
  const U = { ADMIN: 1, GESTOR: 2, COLAB: 3, LEITURA: 4, ADMIN2: 5, INATIVO: 6, ADMINB: 7 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `ins-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `INS ${n}`, `ins-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','INSA','C','L','2026-01-01','2027-01-01'),($2,'Obra B','INSB','C','L','2026-01-01','2027-01-01')", [P, P2]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(P, U.ADMIN, "ADMINISTRADOR");
  await mem(P, U.ADMINB, "ADMINISTRADOR");
  await mem(P, U.GESTOR, "GESTOR");
  await mem(P, U.COLAB, "COLABORADOR");
  await mem(P, U.LEITURA, "LEITURA");
  await mem(P, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(P2, U.ADMIN2, "ADMINISTRADOR");
  const doc = async (project, title) => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [project, title])).rows[0].id;
  const D1 = await doc(P, "Apólice A (sintético)");
  const D2 = await doc(P, "Endosso emitido (sintético)");
  const D3 = await doc(P, "Comprovante de aplicação (sintético)");
  const DB = await doc(P2, "Documento da obra B");

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
  const POL = { modality: "SEGURO_GARANTIA_EXECUTANTE", insurer_name: "Seguradora Sintética SA", policy_number: "SINT-001", source_document_id: D1, coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000, status: "VIGENTE" };
  const mkPolicy = async (c = null, extra = {}) => rpc(c ?? (await as(U.ADMIN)), "insurance_policy_create", P, JSON.stringify({ ...POL, ...extra }));
  const audits = (entity, action) => n("select count(*)::int n from public.insurance_audit_events where entity_id=$1 and ($2::text is null or action=$2)", [entity, action ?? null]);

  // ---------------------------------------------------------------------------------------------------------------
  await check("ESTRUTURA: toda tabela nova com RLS habilitado, sem grant de escrita a anon/authenticated, sem estado 'enviada'", async () => {
    const t = (await su.query(`select c.relname, c.relrowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'
      and (c.relname like 'insurance\\_%' or c.relname in ('bank_guarantees','other_guarantees'))`)).rows;
    // 16 tabelas da fase 1 + as acrescentadas depois (Fase 3: sujeitos esperados, checklist RCC...). As asserções seguintes (RLS, sem escrita direta, sem anon) valem para TODAS.
    ok(t.length >= 16, `esperava ao menos 16 tabelas, obtive ${t.length}`);
    ok(t.every((r) => r.relrowsecurity), "RLS desligado em alguma tabela");
    const g = (await su.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public'
      and (table_name like 'insurance\\_%' or table_name in ('bank_guarantees','other_guarantees')) and grantee in ('anon','authenticated','public') and privilege_type <> 'SELECT'`)).rows;
    eq(g, [], "privilégios de escrita");
    const anonSel = (await su.query(`select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name like 'insurance\\_%' and grantee='anon'`)).rows[0].n;
    eq(anonSel, 0, "anon sem acesso");
    await rejects(su.query("insert into public.insurance_drafts (project_id,draft_kind,claim_id,subject,body,state) values ($1,'AVISO_SINISTRO',null,'x','y','ENVIADA')", [P]), /check constraint/i, "estado ENVIADA inexistente");
    await su.query("insert into public.insurance_settings (project_id) values ($1) on conflict do nothing", [P]);
    eq((await su.query("select real_send_enabled from public.insurance_settings where project_id=$1", [P])).rows[0].real_send_enabled, false, "flag desligada por padrão");
  });

  await check("PARIDADE SQL x TS: máquina de estados do sinistro idêntica em todos os pares de estados", async () => {
    const I = await import("../apps/web/lib/insurance/index.ts");
    for (const a of I.CLAIM_STAGES) for (const b of I.CLAIM_STAGES) {
      const sql = (await su.query("select public.insurance_claim_transition_allowed($1,$2) v", [a, b])).rows[0].v;
      eq(sql, I.canTransitionClaim(a, b), `${a}->${b}`);
    }
  });

  await check("CASO 31 (sem autorização): LEITURA/inativo/outro projeto/anon/sem sub não gravam; COLABORADOR não cria apólice; escrita direta negada", async () => {
    const before = await n("select count(*)::int n from public.insurance_policies");
    for (const [who, who_n] of [["LEITURA", U.LEITURA], ["COLAB", U.COLAB], ["INATIVO", U.INATIVO], ["ADMIN2", U.ADMIN2]]) {
      await rejects(rpc(await as(who_n), "insurance_policy_create", P, JSON.stringify(POL)), /FORBIDDEN/, `${who} cria apólice`);
    }
    await rejects(rpc(await as(null, "authenticated"), "insurance_policy_create", P, JSON.stringify(POL)), /AUTH_REQUIRED/, "authenticated sem sub");
    await rejects(rpc(await as(null, "anon"), "insurance_policy_create", P, JSON.stringify(POL)), /permission denied/i, "anon");
    await rejects(rpc(await as(null, "service_role"), "insurance_policy_create", P, JSON.stringify(POL)), /AUTH_REQUIRED|permission denied/i, "service_role sem usuário");
    const a = await as(U.ADMIN);
    await rejects(a.query("insert into public.insurance_policies (project_id,modality,insurer_name,source_ref) values ($1,'RC_GERAL','x','y')", [P]), /permission denied|row-level/i, "insert direto");
    await rejects(a.query("update public.insurance_policies set max_amount = 1"), /permission denied/i, "update direto");
    await rejects(a.query("delete from public.insurance_policies"), /permission denied/i, "delete direto");
    await rejects(a.query("insert into public.insurance_audit_events (project_id,entity_type,action) values ($1,'x','y')", [P]), /permission denied/i, "audit direto");
    eq(await n("select count(*)::int n from public.insurance_policies"), before, "nada gravado");
    // COLABORADOR registra pedido de endosso, mas não aprova minuta
    const pol = await mkPolicy();
    const c = await as(U.COLAB);
    const e = await rpc(c, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Inclusão do beneficiário X", request_ref: "email-sintetico-1" }));
    eq(e.coverageEffective, false, "pedido não amplia cobertura");
    const d = await rpc(c, "insurance_draft_create", P, JSON.stringify({ draft_kind: "ENDOSSO", endorsement_id: e.id, subject: "Pedido de endosso", body: "Prezados, solicitamos o endosso conforme texto anexo ao pedido sintético." }));
    await rejects(rpc(c, "insurance_draft_approve", d.id, d.rowVersion, "APROVO O CONTEUDO PARA ENVIO"), /FORBIDDEN/, "COLAB aprova minuta");
    await rejects(rpc(await as(U.GESTOR), "insurance_draft_approve", d.id, d.rowVersion, "APROVO O CONTEUDO PARA ENVIO"), /FORBIDDEN/, "GESTOR aprova minuta");
    // LEITURA consulta mas não escreve
    const l = await as(U.LEITURA);
    ok((await l.query("select count(*)::int n from public.insurance_policies")).rows[0].n >= 1, "LEITURA consulta");
    await rejects(rpc(l, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "x y z" })), /FORBIDDEN/, "LEITURA pede endosso");
  });

  await check("CASO 39 (isolamento entre projetos): outra obra não lê, não referencia documento alheio, não altera; dashboard só do que enxerga", async () => {
    const pol = await mkPolicy();
    const b = await as(U.ADMIN2);
    eq((await b.query("select count(*)::int n from public.insurance_policies where project_id=$1", [P])).rows[0].n, 0, "B não lê A");
    eq((await b.query("select count(*)::int n from public.insurance_audit_events where project_id=$1", [P])).rows[0].n, 0, "B não lê auditoria de A");
    await rejects(rpc(b, "insurance_policy_new_version", pol.id, 1, JSON.stringify({ notes: "invasão" }), "tentativa de invasão entre obras"), /FORBIDDEN/, "B altera A");
    await rejects(rpc(b, "insurance_policy_create", P2, JSON.stringify({ ...POL, source_document_id: D1 })), /REFERENCE_OUT_OF_PROJECT/, "documento de A em B");
    const okB = await rpc(b, "insurance_policy_create", P2, JSON.stringify({ ...POL, source_document_id: DB, policy_number: "B-1" }));
    ok(okB.id, "B cria na própria obra");
    const dashB = (await b.query("select * from public.insurance_dashboard_items(null, date '2026-06-01', 3650)")).rows;
    ok(dashB.every((r) => r.project_id === P2), "dashboard B só vê B");
    const dashA = (await (await as(U.ADMIN)).query("select * from public.insurance_dashboard_items(null, date '2026-06-01', 3650)")).rows;
    ok(dashA.every((r) => r.project_id === P) && dashA.length > 0, "dashboard A só vê A");
    // referência cruzada em sinistro/endosso/minuta
    const a = await as(U.ADMIN);
    await rejects(rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "x", stage: "AVISO", policy_id: okB.id, source_ref: "r" })), /REFERENCE_OUT_OF_PROJECT/, "apólice de B em claim de A");
  });

  await check("VERSÕES DA APÓLICE: nova versão preserva as anteriores (snapshot imutável), exige motivo e versão otimista; partes e cláusulas entram na versão", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const v2 = await rpc(a, "insurance_policy_new_version", pol.id, 1, JSON.stringify({ max_amount: 1500000, coverage_end: "2027-06-30" }), "Aditivo de prazo e valor máximo");
    eq(v2.versionNo, 2, "versão 2");
    await rejects(rpc(a, "insurance_policy_new_version", pol.id, 1, JSON.stringify({ max_amount: 1 }), "versão velha reaplicada"), /VERSION_CONFLICT/, "versão desatualizada");
    await rejects(rpc(a, "insurance_policy_new_version", pol.id, 2, JSON.stringify({ max_amount: 1 }), "curto"), /REASON_REQUIRED/, "motivo curto");
    const snaps = (await su.query("select version_no, snapshot->'policy'->>'max_amount' as m from public.insurance_policy_versions where policy_id=$1 order by version_no", [pol.id])).rows;
    eq(snaps.map((s) => [s.version_no, Number(s.m)]), [[1, 1000000], [2, 1500000]], "versões preservadas");
    await rejects(su.query("update public.insurance_policy_versions set change_reason='x' where policy_id=$1", [pol.id]), /APPEND_ONLY/, "versão imutável");
    await rejects(su.query("delete from public.insurance_policy_versions where policy_id=$1", [pol.id]), /APPEND_ONLY|NO_DELETE/, "versão sem delete");
    const p1 = await rpc(a, "insurance_policy_party_add", pol.id, 2, JSON.stringify({ party_role: "SEGURADO", party_name: "Contratante Sintética SA", source_document_id: D1 }));
    eq(p1.versionNo, 3, "parte gera versão");
    const c1 = await rpc(a, "insurance_policy_clause_add", pol.id, 3, JSON.stringify({ kind: "EXCLUSAO", title: "Exclusão sintética", clause_text: "texto sintético", source_document_id: D1, source_page: "p.4", applies_to: ["DANO_PROPRIA_OBRA"] }));
    eq(c1.versionNo, 4, "cláusula gera versão");
    const last = (await su.query("select jsonb_array_length(snapshot->'parties') pa, jsonb_array_length(snapshot->'clauses') cl from public.insurance_policy_versions where policy_id=$1 and version_no=4", [pol.id])).rows[0];
    eq([last.pa, last.cl], [1, 1], "snapshot v4 contém partes/cláusulas");
    await rejects(rpc(a, "insurance_policy_clause_add", pol.id, 4, JSON.stringify({ kind: "EXCLUSAO", title: "Sem fonte" })), /source_ref|check/i, "cláusula sem fonte");
    await rejects(su.query("delete from public.insurance_policies where id=$1", [pol.id]), /NO_DELETE/, "apólice não se apaga");
  });

  await check("CASO 15 (Performance Bond por inadimplemento) e CASO 16 (por atraso): eventos distintos vinculados à mesma apólice, sem decisão automática de cobertura", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const inad = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "INADIMPLEMENTO", title: "Inadimplemento do executante", stage: "AVISO", policy_id: pol.id, source_ref: "notificacao-sintetica-1", protocol: "PRT-INAD-1" }));
    const atraso = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "ATRASO", title: "Atraso na execução", stage: "AVISO", policy_id: pol.id, source_ref: "diario-sintetico-2" }));
    const rows = (await su.query("select claim_kind, stage, decision_outcome, protocol from public.insurance_claims where id in ($1,$2) order by claim_kind", [inad.id, atraso.id])).rows;
    eq(rows.map((r) => [r.claim_kind, r.stage, r.decision_outcome]), [["ATRASO", "AVISO", null], ["INADIMPLEMENTO", "AVISO", null]], "sem decisão automática");
  });

  await check("CASO 25 (aviso), 26 (expectativa só se contratualmente prevista), 27 (regulação), 28 (negativa e contestação): máquina de estados + passos append-only", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    await rejects(rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "Expectativa sem base", stage: "EXPECTATIVA", policy_id: pol.id, source_ref: "r" })), /EXPECTATIVA_BASIS_REQUIRED/, "expectativa sem base contratual");
    const v = await rpc(a, "insurance_policy_clause_add", pol.id, 1, JSON.stringify({ kind: "PRAZO_AVISO", title: "Comunicação de expectativa", deadline_days: 5, source_document_id: D1, source_page: "p.7" }));
    const clauseId = (await su.query("select id from public.insurance_policy_clauses where policy_id=$1", [pol.id])).rows[0].id;
    const polOther = await mkPolicy(a, { policy_number: "OUTRA" });
    await rejects(rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "Cláusula de outra apólice", stage: "EXPECTATIVA", policy_id: polOther.id, contractual_basis_clause_id: clauseId, source_ref: "r" })), /EXPECTATIVA_BASIS_MISMATCH/, "cláusula de outra apólice");
    const exp = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "ATRASO", title: "Expectativa prevista", stage: "EXPECTATIVA", policy_id: pol.id, contractual_basis_clause_id: clauseId, source_ref: "r", notice_deadline_at: "2026-12-30T00:00:00Z", notice_deadline_basis: "cláusula PRAZO_AVISO" }));
    eq(exp.stage, "EXPECTATIVA", "expectativa");
    await rejects(rpc(a, "insurance_claim_advance", exp.id, 1, "REGULACAO", JSON.stringify({})), /INVALID_TRANSITION/, "expectativa -> regulação direto");
    const av = await rpc(a, "insurance_claim_advance", exp.id, 1, "AVISO", JSON.stringify({ protocol: "PRT-AV-77", note: "Aviso enviado pelo canal oficial (registro manual)" }));
    const rc = await rpc(a, "insurance_claim_advance", exp.id, av.rowVersion, "RECLAMACAO", JSON.stringify({ note: "Reclamação formal" }));
    const rg = await rpc(a, "insurance_claim_advance", exp.id, rc.rowVersion, "REGULACAO", JSON.stringify({ note: "Seguradora iniciou regulação" }));
    await rejects(rpc(a, "insurance_claim_advance", exp.id, rg.rowVersion, "NEGATIVA", JSON.stringify({ note: "curta" })), /NOTE_REQUIRED/, "negativa sem fundamento registrado");
    const ng = await rpc(a, "insurance_claim_advance", exp.id, rg.rowVersion, "NEGATIVA", JSON.stringify({ note: "Seguradora negou: alega exclusão (texto da carta anexa)" }));
    eq((await su.query("select decision_outcome from public.insurance_claims where id=$1", [exp.id])).rows[0].decision_outcome, "INDEFERIDO", "negativa registra INDEFERIDO");
    await rejects(rpc(a, "insurance_claim_advance", exp.id, ng.rowVersion, "INDENIZACAO_CUMPRIMENTO", JSON.stringify({})), /INVALID_TRANSITION/, "negativa não vira pagamento");
    const ct = await rpc(a, "insurance_claim_advance", exp.id, ng.rowVersion, "CONTESTACAO", JSON.stringify({ note: "Contestação protocolada com documentos" }));
    eq(ct.stage, "CONTESTACAO", "contestação");
    const dc = await rpc(a, "insurance_claim_advance", exp.id, ct.rowVersion, "DECISAO", JSON.stringify({ decision_outcome: "PARCIAL", note: "Revisão parcial" }));
    const pay = await rpc(a, "insurance_claim_advance", exp.id, dc.rowVersion, "INDENIZACAO_CUMPRIMENTO", JSON.stringify({ note: "Pagamento parcial confirmado" }));
    const fim = await rpc(a, "insurance_claim_advance", exp.id, pay.rowVersion, "ENCERRADO", JSON.stringify({ note: "Encerrado após pagamento parcial" }));
    await rejects(rpc(a, "insurance_claim_advance", exp.id, fim.rowVersion, "AVISO", JSON.stringify({})), /INVALID_TRANSITION/, "encerrado é terminal");
    const steps = (await su.query("select stage from public.insurance_claim_steps where claim_id=$1 order by occurred_at, created_at, id", [exp.id])).rows.map((r) => r.stage);
    eq(steps, ["EXPECTATIVA", "AVISO", "RECLAMACAO", "REGULACAO", "NEGATIVA", "CONTESTACAO", "DECISAO", "INDENIZACAO_CUMPRIMENTO", "ENCERRADO"], "linha do tempo completa");
    await rejects(su.query("update public.insurance_claim_steps set note='x'"), /APPEND_ONLY/, "passos imutáveis");
    const dc2 = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "Decisão sem desfecho", stage: "AVISO", policy_id: pol.id, source_ref: "r" }));
    const rc2 = await rpc(a, "insurance_claim_advance", dc2.id, 1, "RECLAMACAO", JSON.stringify({}));
    await rejects(rpc(a, "insurance_claim_advance", dc2.id, rc2.rowVersion, "DECISAO", JSON.stringify({})), /DECISION_OUTCOME_REQUIRED/, "decisão exige desfecho");
    void v;
  });

  await check("CASO 29 (apólice ausente): evento sem instrumento só com motivo explícito; aparece no dashboard como instrumentMissing", async () => {
    const a = await as(U.ADMIN);
    await rejects(rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "INADIMPLEMENTO", title: "Sem apólice", stage: "AVISO", source_ref: "r" })), /check|violates/i, "sem instrumento e sem motivo");
    const c = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "INADIMPLEMENTO", title: "Sem apólice (motivo)", stage: "AVISO", source_ref: "r", no_instrument_reason: "Apólice não localizada no contrato nem no e-mail do corretor (registro sintético)" }));
    const dash = (await a.query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='SINISTRO_EM_ANDAMENTO' and entity_id=$2", [P, c.id])).rows;
    eq(dash[0].detail.instrumentMissing, true, "marcado como instrumento ausente");
    await rejects(rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "Dois instrumentos", stage: "AVISO", source_ref: "r", policy_id: (await mkPolicy(a)).id, bank_guarantee_id: (await rpc(a, "bank_guarantee_register", P, JSON.stringify({ bank_name: "Banco Sintético", source_ref: "x" }))).id })), /check|violates/i, "dois instrumentos no mesmo evento");
  });

  await check("CASO 23 (endosso solicitado e pendente) e CASO 24 (endosso emitido): pedido != emitido; cobertura só após CONFERIDO com documento emitido; comparação pedido x emitido", async () => {
    const a = await as(U.ADMIN);
    const g = await as(U.GESTOR);
    const pol = await mkPolicy(a);
    const e = await rpc(await as(U.COLAB), "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Inclusão de  BENEFICIÁRIO Alfa\nnas condições vigentes", request_ref: "email-sintetico" }));
    eq([e.state, e.coverageEffective], ["SOLICITADO", false], "solicitado sem efeito");
    // o banco impede coverage_effective sem verificação — mesmo para superusuário
    await rejects(su.query("update public.insurance_endorsements set coverage_effective = true where id=$1", [e.id]), /check constraint/i, "cobertura sem emissão verificada");
    await rejects(rpc(g, "insurance_endorsement_advance", e.id, 1, "CONFERIDO", JSON.stringify({})), /INVALID_TRANSITION/, "SOLICITADO -> CONFERIDO");
    const pend = (await a.query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='ENDOSSO_PENDENTE' and entity_id=$2", [P, e.id])).rows;
    eq([pend.length, pend[0].detail.coverageEffective], [1, false], "pendente no dashboard sem cobertura");
    await rejects(rpc(await as(U.COLAB), "insurance_endorsement_advance", e.id, 1, "EMITIDO", JSON.stringify({})), /FORBIDDEN/, "COLAB não emite/confere");
    const an = await rpc(await as(U.COLAB), "insurance_endorsement_advance", e.id, 1, "EM_ANALISE", JSON.stringify({}));
    eq(an.state, "EM_ANALISE", "em análise");
    await rejects(rpc(g, "insurance_endorsement_advance", e.id, an.rowVersion, "EMITIDO", JSON.stringify({ issued_text: "texto", issued_number: "E-1" })), /ISSUED_DOCUMENT_REQUIRED/, "emitido sem documento");
    await rejects(rpc(g, "insurance_endorsement_advance", e.id, an.rowVersion, "EMITIDO", JSON.stringify({ issued_text: "texto", issued_document_id: DB, issued_number: "E-1" })), /REFERENCE_OUT_OF_PROJECT/, "documento de outra obra");
    const em = await rpc(g, "insurance_endorsement_advance", e.id, an.rowVersion, "EMITIDO", JSON.stringify({ issued_text: "Inclusão de beneficiário alfa nas condições vigentes, exceto danos à própria obra", issued_document_id: D2, issued_number: "E-1/2026" }));
    eq([em.state, em.coverageEffective, em.textsMatch], ["EMITIDO", false, false], "emitido ainda sem efeito; texto diverge");
    // Fase 3/C: pedido sem classificação (fail-closed) exige DUAS conferências independentes (nem o solicitante COLAB nem o emissor GESTOR).
    await rejects(rpc(g, "insurance_endorsement_advance", e.id, em.rowVersion, "CONFERIDO", JSON.stringify({})), /REVIEWER_IS_ISSUER/, "emissor não confere a própria emissão");
    await rejects(rpc(a, "insurance_endorsement_advance", e.id, em.rowVersion, "CONFERIDO", JSON.stringify({})), /DIVERGENCE_NOTE_REQUIRED/, "divergência exige nota");
    const cf1 = await rpc(a, "insurance_endorsement_advance", e.id, em.rowVersion, "CONFERIDO", JSON.stringify({ divergence_note: "Emitido acrescenta exclusão de danos à própria obra; aceito após análise jurídica" }));
    eq([cf1.state, cf1.coverageEffective], ["EMITIDO", false], "primeira conferência não produz efeito");
    const cf = await rpc(await as(U.ADMINB), "insurance_endorsement_advance", e.id, cf1.rowVersion, "CONFERIDO", JSON.stringify({ divergence_note: "Segunda conferência: exclusão de danos à própria obra confirmada no documento emitido" }));
    eq([cf.state, cf.coverageEffective], ["CONFERIDO", true], "conferido (2 conferências) produz efeito");
    const naoPend = (await a.query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='ENDOSSO_PENDENTE' and entity_id=$2", [P, e.id])).rows;
    eq(naoPend.length, 0, "conferido sai das pendências");
    // texto idêntico (normalizado) => texts_match true
    const e2 = await rpc(a, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Prorrogação  da vigência" }));
    const em2 = await rpc(a, "insurance_endorsement_advance", e2.id, 1, "EMITIDO", JSON.stringify({ issued_text: "prorrogação da vigência", issued_document_id: D2, issued_number: "E-2" }));
    eq(em2.textsMatch, true, "texto normalizado igual");
    const rf = await rpc(a, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Redução de franquia" }));
    await rejects(rpc(a, "insurance_endorsement_advance", rf.id, 1, "RECUSADO", JSON.stringify({ refusal_note: "x" })), /REFUSAL_NOTE_REQUIRED/, "recusa sem motivo");
    eq((await rpc(a, "insurance_endorsement_advance", rf.id, 1, "RECUSADO", JSON.stringify({ refusal_note: "Seguradora recusou por escrito (carta sintética)" }))).coverageEffective, false, "recusado sem efeito");
    eq(e.seq, 1, "sequência 1"); eq(e2.seq, 2, "sequência 2");
  });

  await check("CASO 17 (adiantamento não amortizado): valor adiantado != saldo não amortizado != saldo devido != indenizável; amortização append-only; garantia insuficiente no dashboard", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a, { modality: "ADIANTAMENTO_PAGAMENTO", max_amount: 400000 });
    await rejects(rpc(a, "insurance_advance_register", P, JSON.stringify({ advanced_amount: 0, purpose: "x", source_ref: "r" })), /check|violates/i, "valor zero");
    const adv = await rpc(a, "insurance_advance_register", P, JSON.stringify({ policy_id: pol.id, advanced_amount: 500000, purpose: "Mobilização e compra de materiais", source_ref: "contrato-sintetico cl.9", guaranteed_limit: 450000, advance_date: "2026-03-01" }));
    const am1 = await rpc(a, "insurance_advance_amortize", adv.id, 1, JSON.stringify({ amount: 100000, amortized_on: "2026-04-01", source_ref: "medicao-1" }));
    eq(am1.unamortized, 400000, "saldo após amortização");
    await rejects(rpc(a, "insurance_advance_amortize", adv.id, 2, JSON.stringify({ amount: 400000.01, source_ref: "m" })), /AMORTIZATION_EXCEEDS_BALANCE/, "excede saldo");
    await rejects(rpc(a, "insurance_advance_amortize", adv.id, 2, JSON.stringify({ amount: -5, source_ref: "m" })), /AMOUNT_INVALID/, "valor negativo");
    const bal = (await a.query("select * from public.insurance_advance_balance($1)", [adv.id])).rows[0];
    eq([Number(bal.advanced_amount), Number(bal.unamortized_amount), bal.balance_due_informed, bal.indemnifiable_informed], [500000, 400000, null, null], "saldo devido e indenizável NÃO são derivados");
    eq(Number(bal.uncovered_excess), 0, "400000 <= limite 450000");
    const ins = (await a.query("select * from public.insurance_dashboard_items($1, current_date, 30) where kind='GARANTIA_INSUFICIENTE' and entity_id=$2", [P, adv.id])).rows;
    eq(ins.length, 0, "saldo 400000 não excede limite 450000 nem valor máximo 400000");
    await rejects(su.query("update public.insurance_advance_amortizations set amount=1"), /APPEND_ONLY/, "amortização imutável");
  });

  await check("CASO 17b: adiantamento com saldo acima do limite/valor máximo => GARANTIA_INSUFICIENTE; sem limite nem valor máximo => GARANTIA_SEM_DADOS (CASO 33 dados insuficientes)", async () => {
    const a = await as(U.ADMIN);
    const adv = await rpc(a, "insurance_advance_register", P, JSON.stringify({ advanced_amount: 300000, purpose: "Adiantamento acima do limite", source_ref: "c", guaranteed_limit: 200000 }));
    const semDados = await rpc(a, "insurance_advance_register", P, JSON.stringify({ advanced_amount: 100000, purpose: "Adiantamento sem limite informado", source_ref: "c" }));
    const rows = (await a.query("select kind, entity_id from public.insurance_dashboard_items($1, current_date, 30) where kind in ('GARANTIA_INSUFICIENTE','GARANTIA_SEM_DADOS')", [P])).rows;
    ok(rows.some((r) => r.kind === "GARANTIA_INSUFICIENTE" && r.entity_id === adv.id), "insuficiente detectada");
    ok(rows.some((r) => r.kind === "GARANTIA_SEM_DADOS" && r.entity_id === semDados.id), "sem dados sinalizado, não inferido");
    ok(!rows.some((r) => r.kind === "GARANTIA_INSUFICIENTE" && r.entity_id === semDados.id), "sem dado não vira insuficiência");
    const nulls = (await su.query("select balance_due_informed, indemnifiable_informed, guaranteed_limit, application_documented from public.insurance_advances where id=$1", [semDados.id])).rows[0];
    eq([nulls.balance_due_informed, nulls.indemnifiable_informed, nulls.guaranteed_limit, nulls.application_documented], [null, null, null, false], "campos desconhecidos ficam NULL");
    await rejects(su.query("update public.insurance_advances set application_documented=true where id=$1", [semDados.id]), /check constraint/i, "aplicação documentada exige documento");
  });

  await check("CASO 18 (fiança bancária): entidade própria; 'primeira demanda' não presumido (NULL); evento vinculado à fiança, nunca à apólice; canal oficial só como dado cadastrado", async () => {
    const a = await as(U.ADMIN);
    const f = await rpc(a, "bank_guarantee_register", P, JSON.stringify({ bank_name: "Banco Sintético SA", guarantee_number: "FB-1", amount: 250000, end_date: "2026-12-31", source_document_id: D1, status: "VIGENTE" }));
    const row = (await su.query("select calls_on_first_demand, claim_procedure_note from public.bank_guarantees where id=$1", [f.id])).rows[0];
    eq([row.calls_on_first_demand, row.claim_procedure_note], [null, null], "sem presumir primeira demanda nem procedimento");
    const c = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "FIANCA_BANCARIA", title: "Cobrança de fiança", stage: "AVISO", bank_guarantee_id: f.id, source_ref: "notif-banco-sint" }));
    eq((await su.query("select policy_id, bank_guarantee_id from public.insurance_claims where id=$1", [c.id])).rows[0], { policy_id: null, bank_guarantee_id: f.id }, "evento na fiança");
    const ch = await rpc(a, "insurance_channel_register", P, JSON.stringify({ bank_guarantee_id: f.id, entity_name: "Banco Sintético SA", channel_type: "PORTAL", channel_value: "portal-sintetico (cadastro manual)", source_ref: "carta-fianca-sintetica p.2" }));
    eq(ch.verified, false, "canal nasce não verificado");
    await rejects(rpc(a, "insurance_channel_register", P, JSON.stringify({ entity_name: "Sem fonte", channel_type: "EMAIL", channel_value: "x" })), /check|violates/i, "canal sem fonte");
    const u = await rpc(a, "bank_guarantee_update", f.id, 1, JSON.stringify({ calls_on_first_demand: true, claim_procedure_note: "Conforme cláusula 5 do instrumento (sintético)" }));
    await rejects(rpc(a, "bank_guarantee_update", f.id, 1, JSON.stringify({ amount: 1 })), /VERSION_CONFLICT/, "fiança concorrência otimista");
    eq(u.rowVersion, 2, "versão da fiança");
    const caucao = await rpc(a, "other_guarantee_register", P, JSON.stringify({ guarantee_type: "CARTA_FIANCA_NAO_BANCARIA", issuer_name: "Empresa Sintética", source_ref: "carta-sint" }));
    const caucao2 = await rpc(a, "other_guarantee_register", P, JSON.stringify({ guarantee_type: "CAUCAO", caucao_form: "DINHEIRO", amount: 1000, source_ref: "recibo-sint" }));
    ok(caucao.id && caucao2.id, "carta de fiança não bancária e caução em entidade separada");
    await rejects(rpc(a, "other_guarantee_register", P, JSON.stringify({ guarantee_type: "FIANCA_BANCARIA", source_ref: "x" })), /check|violates/i, "fiança bancária não entra em other_guarantees");
  });

  await check("CASO 21 (segurado incorreto) / CASO 22 (beneficiário final não identificado): partes aceitam NAO_IDENTIFICADO explícito; identificado exige nome; tudo com fonte", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const p1 = await rpc(a, "insurance_policy_party_add", pol.id, 1, JSON.stringify({ party_role: "SEGURADO", party_name: "Empresa Errada Ltda", source_document_id: D1 }));
    const p2 = await rpc(a, "insurance_policy_party_add", pol.id, 2, JSON.stringify({ party_role: "PROPRIETARIO_FINAL", identification_status: "NAO_IDENTIFICADO", source_ref: "contrato-sint cl.2" }));
    await rejects(rpc(a, "insurance_policy_party_add", pol.id, 3, JSON.stringify({ party_role: "BENEFICIARIO", source_ref: "x" })), /check|violates/i, "identificado sem nome");
    await rejects(rpc(a, "insurance_policy_party_add", pol.id, 3, JSON.stringify({ party_role: "FIADOR", party_name: "X", source_ref: "x" })), /check|violates/i, "papel inexistente");
    const st = await rpc(a, "insurance_policy_party_set_active", (await su.query("select id from public.insurance_policy_parties where policy_id=$1 and party_role='SEGURADO'", [pol.id])).rows[0].id, p2.rowVersion, false, "Segurado informado incorretamente, será substituído por endosso");
    eq(st.versionNo, 4, "desativar também gera versão (histórico preservado)");
    eq(Number((await su.query("select count(*)::int n from public.insurance_policy_parties where policy_id=$1", [pol.id])).rows[0].n), 2, "linha preservada");
    void p1;
  });

  await check("CASO 32 (tentativa de envio real bloqueada) + CASO 30 (seguradora indisponível/sem canal): minuta sempre DRAFT; aprovação humana expressa só ADMINISTRADOR; envio bloqueado com flag desligada E ligada", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const d = await rpc(a, "insurance_draft_create", P, JSON.stringify({ draft_kind: "AVISO_SINISTRO", policy_id: pol.id, subject: "Aviso de sinistro (minuta)", body: "Prezados, comunicamos formalmente o evento descrito no dossiê, para as providências cabíveis. [PREENCHER data]", basis: { facts: ["fato 1"], inferences: [], recommendations: [] } }));
    eq(d.state, "DRAFT", "nasce DRAFT");
    await rejects(rpc(a, "insurance_draft_approve", d.id, 1, "ok"), /EXPRESS_CONFIRMATION_REQUIRED/, "sem confirmação expressa");
    await rejects(rpc(a, "insurance_draft_approve", d.id, 1, "APROVO O CONTEUDO PARA ENVIO"), /DRAFT_HAS_PLACEHOLDERS/, "placeholder pendente");
    const ed = await rpc(a, "insurance_draft_update", d.id, 1, null, "Prezados, comunicamos formalmente o evento descrito no dossiê, para as providências cabíveis, em 01/12/2026.");
    // CASO 30: sem canal oficial cadastrado
    const r0 = await rpc(a, "insurance_draft_attempt_send", d.id);
    ok(r0.sent === false && r0.blocked === true, "não enviou");
    for (const reason of ["FLAG_OFF", "NOT_APPROVED", "NO_OFFICIAL_CHANNEL", "PHASE1_NO_SEND_TRANSPORT"]) ok(r0.reasons.includes(reason), `motivo ${reason}`);
    const ap = await rpc(a, "insurance_draft_approve", d.id, ed.rowVersion, "APROVO O CONTEUDO PARA ENVIO");
    eq([ap.state, ap.sent], ["APROVADA_PARA_ENVIO", false], "aprovada mas não enviada");
    const r1 = await rpc(a, "insurance_draft_attempt_send", d.id);
    ok(r1.reasons.includes("FLAG_OFF") && r1.reasons.includes("NO_OFFICIAL_CHANNEL") && !r1.reasons.includes("NOT_APPROVED"), "aprovada, mas flag/canal ainda bloqueiam");
    // liga a flag (somente superusuário consegue) e cadastra+verifica canal: AINDA bloqueado (fase 1 sem transporte)
    await su.query("insert into public.insurance_settings (project_id, real_send_enabled) values ($1, true) on conflict (project_id) do update set real_send_enabled = true", [P]);
    const chn = await rpc(a, "insurance_channel_register", P, JSON.stringify({ policy_id: pol.id, entity_name: "Seguradora Sintética SA", channel_type: "EMAIL", channel_value: "sinistros@seguradora-sintetica.invalid", source_document_id: D1 }));
    const r2 = await rpc(a, "insurance_draft_attempt_send", d.id);
    ok(r2.sent === false && r2.reasons.includes("PHASE1_NO_SEND_TRANSPORT"), "flag ligada ainda bloqueia");
    await su.query("update public.insurance_drafts set official_channel_id=$2 where id=$1", [d.id, chn.id]);
    const r3 = await rpc(a, "insurance_draft_attempt_send", d.id);
    ok(r3.reasons.includes("CHANNEL_NOT_VERIFIED"), "canal não verificado bloqueia");
    await rpc(a, "insurance_channel_verify", chn.id);
    const r4 = await rpc(a, "insurance_draft_attempt_send", d.id);
    eq([r4.sent, r4.blocked, r4.reasons], [false, true, ["PHASE1_NO_SEND_TRANSPORT"]], "todas as condições ok => ainda bloqueado na fase 1");
    await su.query("update public.insurance_settings set real_send_enabled = false where project_id=$1", [P]);
    // editar depois de aprovada revoga a aprovação
    const ed2 = await rpc(a, "insurance_draft_update", d.id, ap.rowVersion, null, "Texto alterado após a aprovação, que precisa ser reaprovado por um administrador.");
    eq([ed2.state, ed2.approvalRevoked], ["DRAFT", true], "edição revoga aprovação");
    await rejects(su.query("update public.insurance_drafts set state='APROVADA_PARA_ENVIO', approved_by=$2, approved_at=now(), approved_body_hash='x' where id=$1", [d.id, uid(U.ADMIN)]), /check constraint/i, "aprovação sem hash do texto");
    const bl = await n("select count(*)::int n from public.insurance_audit_events where entity_id=$1 and action='DRAFT_SEND_BLOCKED'", [d.id]);
    eq(bl, 5, "toda tentativa registrada na auditoria");
    const cn = await rpc(a, "insurance_draft_cancel", d.id, ed2.rowVersion, "Minuta substituída por nova redação");
    eq(cn.state, "CANCELADA", "cancelada");
    await rejects(rpc(a, "insurance_draft_update", d.id, cn.rowVersion, null, "x"), /DRAFT_CANCELLED/, "cancelada não edita");
    eq(await n("select count(*)::int n from public.insurance_drafts where state not in ('DRAFT','APROVADA_PARA_ENVIO','CANCELADA')"), 0, "nenhum estado enviado");
  });

  await check("DOSSIÊ: checklist por apólice idempotente, anexado exige documento, dispensa exige justificativa", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const items = [{ key: "apolice", label: "Apólice e condições" }, { key: "endossos", label: "Endossos emitidos" }];
    eq((await rpc(a, "insurance_dossier_sync", pol.id, JSON.stringify(items))).created, 2, "criados");
    eq((await rpc(a, "insurance_dossier_sync", pol.id, JSON.stringify(items))).created, 0, "idempotente");
    const it = (await su.query("select id, row_version from public.insurance_dossier_items where policy_id=$1 and item_key='apolice'", [pol.id])).rows[0];
    await rejects(rpc(a, "insurance_dossier_item_set", it.id, it.row_version, "ANEXADO", null, null), /check constraint/i, "anexado sem documento");
    await rejects(rpc(a, "insurance_dossier_item_set", it.id, it.row_version, "DISPENSADO", null, null), /check constraint/i, "dispensa sem justificativa");
    const r = await rpc(a, "insurance_dossier_item_set", it.id, it.row_version, "ANEXADO", D1, "ok");
    await rejects(rpc(a, "insurance_dossier_item_set", it.id, it.row_version, "PENDENTE", null, null), /VERSION_CONFLICT/, "item concorrente");
    eq(r.rowVersion, 2, "versão do item");
  });

  await check("DASHBOARD: vencimentos (vencido/a vencer), endossos pendentes, garantia insuficiente, sinistros em andamento, prazo de aviso — datas relativas", async () => {
    const a = await as(U.ADMIN);
    const base = (await su.query("select current_date d")).rows[0].d;
    const iso = (days) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10); };
    const venc = await mkPolicy(a, { policy_number: "VENCIDA", coverage_start: iso(-400), coverage_end: iso(-1) });
    const breve = await mkPolicy(a, { policy_number: "BREVE", coverage_start: iso(-100), coverage_end: iso(10) });
    const longe = await mkPolicy(a, { policy_number: "LONGE", coverage_start: iso(-10), coverage_end: iso(300) });
    const sem = await mkPolicy(a, { policy_number: "SEMFIM", coverage_start: null, coverage_end: null });
    const cl = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "Prazo de aviso", stage: "EXPECTATIVA", policy_id: breve.id, contractual_basis_note: "Cláusula de comunicação prévia (sintético)", source_ref: "r", notice_deadline_at: new Date(Date.parse(iso(-2) + "T12:00:00Z")).toISOString() }));
    const rows = (await a.query("select * from public.insurance_dashboard_items($1, current_date, 30)", [P])).rows;
    const sev = (id) => rows.find((r) => r.kind === "VENCIMENTO" && r.entity_id === id)?.severity;
    eq([sev(venc.id), sev(breve.id), sev(longe.id), sev(sem.id)], ["VENCIDO", "A_VENCER", undefined, undefined], "severidades");
    eq(rows.find((r) => r.kind === "PRAZO_AVISO" && r.entity_id === cl.id)?.severity, "VENCIDO", "prazo de aviso vencido");
    ok(rows.some((r) => r.kind === "SINISTRO_EM_ANDAMENTO" && r.entity_id === cl.id), "sinistro em andamento");
    await rejects(a.query("select * from public.insurance_dashboard_items($1, current_date, 30)", [P]).then(() => as(null, "anon")).then((c) => c.query("select * from public.insurance_dashboard_items(null, current_date, 30)")), /permission denied/i, "anon não lista");
  });

  await check("CASO 38 (concorrência): 8 conexões na MESMA transição de endosso = exatamente 1 vence; demais VERSION_CONFLICT/INVALID_TRANSITION; idem nova versão de apólice, sinistro e amortização", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const e = await rpc(a, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Endosso concorrente" }));
    const run = async (mk, count = 8) => {
      const conns = await Promise.all(Array.from({ length: count }, (_, i) => as(i % 2 ? U.ADMIN : U.ADMINB)));
      const res = await Promise.allSettled(conns.map((c, i) => mk(c, i)));
      await Promise.all(conns.map((c) => c.end().catch(() => {})));
      const okN = res.filter((r) => r.status === "fulfilled").length;
      const bad = res.filter((r) => r.status === "rejected").map((r) => r.reason.message);
      ok(bad.every((m) => /VERSION_CONFLICT|INVALID_TRANSITION|AMORTIZATION_EXCEEDS/.test(m)), `erros inesperados: ${bad.find((m) => !/VERSION_CONFLICT|INVALID_TRANSITION|AMORTIZATION_EXCEEDS/.test(m))}`);
      return okN;
    };
    eq(await run((c) => rpc(c, "insurance_endorsement_advance", e.id, 1, "EM_ANALISE", "{}")), 1, "endosso: um vencedor");
    eq((await su.query("select state, row_version from public.insurance_endorsements where id=$1", [e.id])).rows[0], { state: "EM_ANALISE", row_version: 2 }, "estado final");
    eq(await run((c, i) => rpc(c, "insurance_policy_new_version", pol.id, 1, JSON.stringify({ notes: `n${i}` }), "Atualização concorrente de teste")), 1, "apólice: um vencedor");
    eq(Number((await su.query("select count(*)::int n from public.insurance_policy_versions where policy_id=$1", [pol.id])).rows[0].n), 2, "sem versões duplicadas");
    const cl = await rpc(a, "insurance_claim_open", P, JSON.stringify({ claim_kind: "OUTRO", title: "Concorrente", stage: "AVISO", policy_id: pol.id, source_ref: "r" }));
    eq(await run((c) => rpc(c, "insurance_claim_advance", cl.id, 1, "RECLAMACAO", "{}")), 1, "sinistro: um vencedor");
    eq(Number((await su.query("select count(*)::int n from public.insurance_claim_steps where claim_id=$1", [cl.id])).rows[0].n), 2, "passos sem duplicidade");
    const adv = await rpc(a, "insurance_advance_register", P, JSON.stringify({ advanced_amount: 100, purpose: "Concorrência de amortização", source_ref: "c" }));
    eq(await run((c) => rpc(c, "insurance_advance_amortize", adv.id, 1, JSON.stringify({ amount: 60, source_ref: "m" }))), 1, "amortização: um vencedor");
    // mesmo com versão fresca em todas, o saldo nunca passa do adiantado (serialização por FOR UPDATE)
    const adv2 = await rpc(a, "insurance_advance_register", P, JSON.stringify({ advanced_amount: 100, purpose: "Saldo não pode ficar negativo", source_ref: "c" }));
    let wins = 0;
    for (let round = 0; round < 3; round++) {
      const cur = Number((await su.query("select row_version from public.insurance_advances where id=$1", [adv2.id])).rows[0].row_version);
      wins += await run((c) => rpc(c, "insurance_advance_amortize", adv2.id, cur, JSON.stringify({ amount: 60, source_ref: "m" })), 6);
    }
    eq(wins, 1, "só uma amortização de 60 cabe em 100");
    ok(Number((await su.query("select coalesce(sum(amount),0) s from public.insurance_advance_amortizations where advance_id=$1", [adv2.id])).rows[0].s) <= 100, "saldo nunca negativo");
  });

  await check("CASO 37 (auditoria): cada mutação registra ator/ação/entidade/projeto na mesma transação; trilha append-only até para superusuário; falha de RPC não deixa auditoria órfã", async () => {
    const a = await as(U.ADMIN);
    const pol = await mkPolicy(a);
    const e = await rpc(a, "insurance_endorsement_request", pol.id, JSON.stringify({ requested_text: "Auditoria endosso" }));
    await rpc(a, "insurance_endorsement_advance", e.id, 1, "EM_ANALISE", "{}");
    const rows = (await su.query("select action, actor_user_id, project_id, entity_type from public.insurance_audit_events where entity_id=$1 order by occurred_at, id", [e.id])).rows;
    eq(rows.map((r) => r.action), ["ENDORSEMENT_REQUESTED", "ENDORSEMENT_EM_ANALISE"], "ações");
    ok(rows.every((r) => r.actor_user_id === uid(U.ADMIN) && r.project_id === P && r.entity_type === "INSURANCE_ENDORSEMENT"), "ator/projeto/entidade");
    ok((await audits(pol.id, "POLICY_CREATED")) === 1, "criação da apólice auditada");
    const before = await n("select count(*)::int n from public.insurance_audit_events");
    await rejects(rpc(a, "insurance_endorsement_advance", e.id, 1, "EMITIDO", "{}"), /VERSION_CONFLICT/, "falha");
    eq(await n("select count(*)::int n from public.insurance_audit_events"), before, "falha não audita");
    await rejects(su.query("update public.insurance_audit_events set action='x'"), /APPEND_ONLY/, "update bloqueado");
    await rejects(su.query("delete from public.insurance_audit_events"), /APPEND_ONLY|NO_DELETE/, "delete bloqueado");
    await rejects(su.query("truncate public.insurance_audit_events"), /NO_DELETE/, "truncate bloqueado");
    await rejects(su.query("truncate public.insurance_policies cascade"), /NO_DELETE/, "truncate de apólices bloqueado");
    const s = await as(U.LEITURA);
    ok((await s.query("select count(*)::int n from public.insurance_audit_events where project_id=$1", [P])).rows[0].n > 0, "LEITURA consulta a trilha");
  });

  await check("CASO 33 (dados insuficientes): campos sem dado ficam NULL; nada é inventado por padrão (valor máximo, vigência, número da apólice)", async () => {
    const a = await as(U.ADMIN);
    const pol = await rpc(a, "insurance_policy_create", P, JSON.stringify({ modality: "RC_CRUZADA", insurer_name: "Seguradora Sintética SA", source_ref: "e-mail corretor (sintético)" }));
    const r = (await su.query("select policy_number, coverage_start, coverage_end, max_amount, broker_name, contract_number, status from public.insurance_policies where id=$1", [pol.id])).rows[0];
    eq([r.policy_number, r.coverage_start, r.coverage_end, r.max_amount, r.broker_name, r.contract_number, r.status], [null, null, null, null, null, null, "RASCUNHO"], "tudo NULL/rascunho");
    await rejects(rpc(a, "insurance_policy_create", P, JSON.stringify({ modality: "RC_CRUZADA", insurer_name: "S" })), /check|violates/i, "sem fonte");
    await rejects(rpc(a, "insurance_policy_create", P, JSON.stringify({ modality: "CAUCAO", insurer_name: "S", source_ref: "r" })), /check|violates/i, "modalidade inexistente");
    await rejects(rpc(a, "insurance_policy_create", P, JSON.stringify({ ...POL, coverage_start: "2027-01-02", coverage_end: "2027-01-01" })), /check|violates/i, "vigência invertida");
  });
} finally {
  await su.end().catch(() => {});
  for (const c of open) await c.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
