// LOTE 4 — isolamento ENTRE PROJETOS, limites e auditoria dos Experts de IA em PostgreSQL REAL (adversarial).
// Reaplica TODAS as migrations numa base nova (acc_l4_*, apagada no fim) e exercita, com identidade por claims JWT
// (request.jwt.claims + set role — o caminho de produção do PostgREST, NÃO o stub app.uid):
//   A) limites 20/usuário/dia (somando obras) e 100/obra/dia, sob concorrência real (conexões independentes);
//   B) reserva/auditoria exigem vínculo ATIVO na obra; anon/authenticated sem acesso às variantes service_role;
//   C) ai_consult_usage e ai_consult_audit: um usuário/obra nunca vê dados de outro (autor ou ADMINISTRADOR da obra);
//   D) RLS de dados de projeto usados pelos Experts (contract_events, ai_curation_runs, audit_log_entries);
//   E) orçamento monetário DESLIGADO por padrão e inalterado; sem função de estorno.
// NÃO roda no CI. Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-lote4-isolation-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
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
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];

// Identidade por claims (GoTrue/PostgREST) no lugar do stub app.uid.
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
    // uma conexão por "cliente" é aberta por cenário; libera ao fim para não esgotar max_connections
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
const dbName = `acc_l4_${Date.now().toString(36)}`;
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
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (inclui 20261121174000_ai_consult_audit) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(1400 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000014a0";
  const PB = "10000000-0000-4000-8000-0000000014b0";
  const USERS = { UA: 1, ADMA: 2, UB: 3, UAB: 4, OUT: 5, OLD: 6 };
  const extra = Array.from({ length: 6 }, (_, i) => 20 + i); // para o teto de 100/obra
  for (const n of [...Object.values(USERS), ...extra]) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `l4-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `L4 ${n}`, `l4-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','L4A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','L4B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, USERS.UA, "COLABORADOR");
  await mem(PA, USERS.ADMA, "ADMINISTRADOR");
  await mem(PB, USERS.UB, "COLABORADOR");
  await mem(PA, USERS.UAB, "COLABORADOR");
  await mem(PB, USERS.UAB, "COLABORADOR");
  await mem(PA, USERS.OLD, "COLABORADOR", "INACTIVE");
  for (const n of extra) await mem(PA, n, "COLABORADOR");

  /** Conexão independente já como `role` com claims JWT (sub = uid). */
  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    const claims = JSON.stringify(n == null ? { role } : { sub: uid(n), role });
    await c.query("select set_config('request.jwt.claims', $1, false)", [claims]);
    await c.query(`set role ${role}`);
    return c;
  }
  const reserve = (c, p, expert = "legal-consultant", kind = "EXPERT_PANEL", subj = "s") => c.query("select public.ai_consult_reserve_expert($1,$2,$3,$4) as r", [p, kind, subj, expert]);
  const auditCall = (c, p, expert = "legal-consultant", kind = "EXPERT_PANEL", q = "pergunta?") =>
    c.query("select public.ai_consult_audit_record($1,$2,$3,$4,$5,'PROJECT',$6::jsonb,'OK','HIGH',0.7,$7::jsonb,'scripted','m',10,5) as id",
      [p, kind, "subj", expert, q, JSON.stringify([{ type: "evidence", id: "e1" }]), JSON.stringify({ requiresHumanReview: true })]);
  const n = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const clear = () => su.query("delete from public.ai_consult_usage; delete from public.ai_consult_audit");

  // ---------------------------------------------------------------- E (primeiro, estado de fábrica)
  await check("E1) orçamento monetário nasce DESLIGADO e nenhum teto/estimativa está configurado", async () => {
    const r = (await su.query("select enabled, estimated_cost_per_call_usd, per_user_day_usd, global_month_usd, decision_reference from public.ai_consult_budget_settings where scope='DEFAULT'")).rows[0];
    eq(r.enabled, false, "enabled");
    eq([r.estimated_cost_per_call_usd, r.per_user_day_usd, r.global_month_usd, r.decision_reference], [null, null, null, null], "tetos");
    await rejects(su.query("update public.ai_consult_budget_settings set enabled = true where scope='DEFAULT'"), /enable_requires_decision|check/i, "ativar sem decisão");
    eq((await su.query("select enabled from public.ai_consult_budget_settings")).rows[0].enabled, false, "continua desligado");
  });

  await check("E2) limites vigentes 20/usuário/dia e 100/obra/dia; authenticated/anon não leem nem alteram o orçamento", async () => {
    const l = (await su.query("select per_user_day, per_project_day from public.ai_consult_limits where scope='DEFAULT'")).rows[0];
    eq([l.per_user_day, l.per_project_day], [20, 100], "limites");
    const a = await as(USERS.UA);
    await rejects(a.query("select * from public.ai_consult_budget_settings"), /permission denied/i, "select budget");
    await rejects(a.query("update public.ai_consult_budget_settings set enabled = true"), /permission denied/i, "update budget");
    await rejects(a.query("update public.ai_consult_limits set per_user_day = 9999"), /permission denied/i, "update limits");
    const an = await as(null, "anon");
    eq((await an.query("select * from public.ai_consult_limits")).rows.length, 0, "anon não lê limites (RLS)");
  });

  await check("E3) não existe função de estorno/devolução de unidade de consumo", async () => {
    const r = await su.query("select proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and proname ~* '(refund|estorn|release|undo).*consult|ai_consult.*(refund|estorn|release|undo)'");
    eq(r.rows, [], "funções de estorno");
  });

  // ---------------------------------------------------------------- A limites
  await check("A1) 20/usuário/dia: 20 reservas passam e a 21ª é recusada (AI_CONSULT_USER_LIMIT) — sem chamar nada", async () => {
    await clear();
    const c = await as(USERS.UA);
    for (let i = 0; i < 20; i++) await reserve(c, PA, "planning-director", "EXPERT_PANEL", `s${i}`);
    await rejects(reserve(c, PA), /AI_CONSULT_USER_LIMIT/, "21ª");
    eq(await n("select count(*)::int n from public.ai_consult_usage where user_id=$1", [uid(USERS.UA)]), 20, "linhas de uso");
  });

  await check("A2) o limite do usuário soma TODAS as obras (10 na A + 10 na B; a 21ª em qualquer uma é recusada)", async () => {
    await clear();
    const c = await as(USERS.UAB);
    for (let i = 0; i < 10; i++) await reserve(c, PA, "commercial-director");
    for (let i = 0; i < 10; i++) await reserve(c, PB, "esg-director");
    await rejects(reserve(c, PA), /AI_CONSULT_USER_LIMIT/, "21ª na A");
    await rejects(reserve(c, PB), /AI_CONSULT_USER_LIMIT/, "21ª na B");
  });

  await check("A3) 100/obra/dia: 5 usuários × 20 = 100 passam; o 6º usuário (com cota própria) é recusado (AI_CONSULT_PROJECT_LIMIT); a obra B não é afetada", async () => {
    await clear();
    const five = [USERS.UA, USERS.ADMA, USERS.UAB, extra[0], extra[1]];
    for (const u of five) { const c = await as(u); for (let i = 0; i < 20; i++) await reserve(c, PA, "engineering-director"); }
    eq(await n("select count(*)::int n from public.ai_consult_usage where project_id=$1", [PA]), 100, "obra A");
    const sixth = await as(extra[2]);
    await rejects(reserve(sixth, PA), /AI_CONSULT_PROJECT_LIMIT/, "6º usuário");
    const ub = await as(USERS.UB);
    await reserve(ub, PB, "legal-consultant"); // obra B livre
  });

  await check("A4) concorrência REAL: 30 conexões do mesmo usuário em paralelo → exatamente 20 passam e 10 são recusadas", async () => {
    await clear();
    const conns = await Promise.all(Array.from({ length: 30 }, () => as(USERS.UA)));
    const res = await Promise.allSettled(conns.map((c) => reserve(c, PA, "legal-consultant", "CURATION")));
    eq(res.filter((r) => r.status === "fulfilled").length, 20, "aprovadas");
    ok(res.filter((r) => r.status === "rejected").every((r) => /AI_CONSULT_USER_LIMIT/.test(r.reason.message)), "recusas por limite");
    eq(await n("select count(*)::int n from public.ai_consult_usage where user_id=$1", [uid(USERS.UA)]), 20, "uso gravado");
  });

  await check("A5) cada Expert registra seu consumo (expert_id) e Expert inexistente (ex.: AXIA) é recusado", async () => {
    await clear();
    const c = await as(USERS.UA);
    for (const e of ["ceo", "commercial-director", "engineering-director", "esg-director", "legal-consultant", "planning-director"]) await reserve(c, PA, e);
    eq((await su.query("select expert_id from public.ai_consult_usage order by expert_id")).rows.map((r) => r.expert_id), ["ceo", "commercial-director", "engineering-director", "esg-director", "legal-consultant", "planning-director"], "experts");
    await rejects(reserve(c, PA, "axia"), /INVALID_EXPERT/, "axia");
  });

  // ---------------------------------------------------------------- B acesso
  await check("B1) sem vínculo ATIVO nada reserva: outro projeto, sem vínculo, vínculo inativo → PROJECT_ACCESS_DENIED", async () => {
    await clear();
    await rejects(reserve(await as(USERS.UA), PB), /PROJECT_ACCESS_DENIED/, "UA na obra B");
    await rejects(reserve(await as(USERS.UB), PA), /PROJECT_ACCESS_DENIED/, "UB na obra A");
    await rejects(reserve(await as(USERS.OUT), PA), /PROJECT_ACCESS_DENIED/, "sem vínculo");
    await rejects(reserve(await as(USERS.OLD), PA), /PROJECT_ACCESS_DENIED/, "inativo");
    eq(await n("select count(*)::int n from public.ai_consult_usage"), 0, "nada gravado");
  });

  await check("B2) anon sem EXECUTE; authenticated não alcança as variantes service_role nem os núcleos; sem sessão = AUTH_REQUIRED", async () => {
    const an = await as(null, "anon");
    await rejects(an.query("select public.ai_consult_reserve_expert($1,'EXPERT_PANEL','s','ceo')", [PA]), /permission denied/i, "anon reserve");
    await rejects(an.query("select public.ai_consult_audit_record($1,'EXPERT_PANEL','s','ceo','q','PROJECT','[]','OK',null,null,'{}',null,null,null,null)", [PA]), /permission denied/i, "anon audit");
    const a = await as(USERS.UA);
    await rejects(a.query("select public.ai_consult_reserve_for_actor($1,$2,'RISK_CYCLE','s','ceo')", [uid(USERS.UA), PA]), /permission denied/i, "authenticated for_actor");
    await rejects(a.query("select public.ai_consult_audit_record_for_actor($1,$2,'RISK_CYCLE','s','ceo','q','PROJECT','[]','OK',null,null,'{}',null,null,null,null)", [uid(USERS.UA), PA]), /permission denied/i, "authenticated audit for_actor");
    await rejects(a.query("select public.ai_consult_reserve_core($1,$2,'EXPERT_PANEL','s','ceo')", [uid(USERS.UA), PA]), /permission denied/i, "core");
    await rejects(a.query("select public.ai_consult_audit_record_core($1,$2,'EXPERT_PANEL','s','ceo','q','PROJECT','[]','OK',null,null,'{}',null,null,null,null)", [uid(USERS.UA), PA]), /permission denied/i, "audit core");
    const nos = await as(null, "authenticated");
    await rejects(nos.query("select public.ai_consult_reserve_expert($1,'EXPERT_PANEL','s','ceo')", [PA]), /AUTH_REQUIRED/, "sem sub");
  });

  await check("B3) service_role (sem sessão): só RISK_CYCLE/AUTOMATIC_CURATION, solicitante explícito com vínculo ATIVO; ator de outra obra recusado", async () => {
    await clear();
    const s = await as(null, "service_role");
    await s.query("select public.ai_consult_reserve_for_actor($1,$2,'RISK_CYCLE','risco:1','planning-director')", [uid(USERS.UA), PA]);
    await s.query("select public.ai_consult_reserve_for_actor($1,$2,'AUTOMATIC_CURATION','fonte:1','legal-consultant')", [uid(USERS.UA), PA]);
    await rejects(s.query("select public.ai_consult_reserve_for_actor($1,$2,'EXPERT_PANEL','x','ceo')", [uid(USERS.UA), PA]), /INVALID_KIND/, "kind de sessão");
    await rejects(s.query("select public.ai_consult_reserve_for_actor($1,$2,'RISK_CYCLE','x','ceo')", [uid(USERS.UA), PB]), /PROJECT_ACCESS_DENIED/, "ator em outra obra");
    await rejects(s.query("select public.ai_consult_reserve_for_actor(null,$1,'RISK_CYCLE','x','ceo')", [PA]), /AUTH_REQUIRED/, "sem solicitante");
    eq(await n("select count(*)::int n from public.ai_consult_usage where user_id=$1", [uid(USERS.UA)]), 2, "mesma cota do usuário");
  });

  // ---------------------------------------------------------------- C auditoria
  await check("C1) a auditoria grava quem/obra/Expert/pergunta/fontes/resultado/tokens e exige vínculo ATIVO; Expert/tipo inválidos recusados", async () => {
    await clear();
    const a = await as(USERS.UA);
    const id = (await auditCall(a, PA, "legal-consultant", "EXPERT_PANEL", "A multa se aplica?")).rows[0].id;
    const row = (await su.query("select * from public.ai_consult_audit where id=$1", [id])).rows[0];
    eq([row.project_id, row.user_id, row.expert_id, row.kind, row.question, row.severity, Number(row.confidence), row.input_tokens, row.output_tokens, row.requires_human_review, row.outcome],
      [PA, uid(USERS.UA), "legal-consultant", "EXPERT_PANEL", "A multa se aplica?", "HIGH", 0.7, 10, 5, true, "OK"], "linha");
    eq(row.sources, [{ id: "e1", type: "evidence" }], "fontes");
    await rejects(auditCall(a, PB), /PROJECT_ACCESS_DENIED/, "outra obra");
    await rejects(auditCall(await as(USERS.OUT), PA), /PROJECT_ACCESS_DENIED/, "sem vínculo");
    await rejects(auditCall(await as(USERS.OLD), PA), /PROJECT_ACCESS_DENIED/, "inativo");
    await rejects(auditCall(a, PA, "axia"), /INVALID_EXPERT/, "expert axia");
    await rejects(auditCall(a, PA, "ceo", "AXIA"), /INVALID_KIND/, "kind");
    await rejects(su.query("update public.ai_consult_audit set requires_human_review=false"), /check/i, "revisão humana é obrigatória");
  });

  await check("C2) isolamento da trilha: autor vê só a própria; ADMINISTRADOR da obra vê todas da obra; outra obra/sem vínculo/anon não veem nada", async () => {
    await clear();
    await auditCall(await as(USERS.UA), PA, "planning-director", "EXPERT_PANEL", "pergunta da UA");
    await auditCall(await as(USERS.UAB), PA, "esg-director", "EXPERT_PANEL", "UAB em A");
    await auditCall(await as(USERS.UAB), PB, "commercial-director", "EXPERT_PANEL", "UAB em B");
    await auditCall(await as(USERS.UB), PB, "engineering-director", "EXPERT_PANEL", "pergunta da UB");
    const q = async (u) => (await (await as(u)).query("select question from public.ai_consult_audit order by question")).rows.map((r) => r.question);
    eq(await q(USERS.UA), ["pergunta da UA"], "UA só a dela");
    eq(await q(USERS.ADMA), ["UAB em A", "pergunta da UA"], "ADMINISTRADOR de A vê as da obra A e nenhuma da B");
    eq(await q(USERS.UB), ["pergunta da UB"], "UB não vê a UAB na obra B (só a própria)");
    eq(await q(USERS.UAB), ["UAB em A", "UAB em B"], "UAB vê as próprias nas duas obras");
    eq(await q(USERS.OUT), [], "sem vínculo");
    eq(await q(USERS.OLD), [], "inativo");
    await rejects((await as(null, "anon")).query("select * from public.ai_consult_audit"), /permission denied/i, "anon");
  });

  await check("C3) a trilha é somente acréscimo: authenticated não insere/atualiza/apaga/trunca (nem o ADMINISTRADOR)", async () => {
    const adm = await as(USERS.ADMA);
    await rejects(adm.query("insert into public.ai_consult_audit (project_id,user_id,expert_id,kind,subject_id,question,outcome,usage_day) values ($1,$2,'ceo','EXPERT_PANEL','s','q','OK',current_date)", [PA, uid(USERS.ADMA)]), /permission denied/i, "insert");
    await rejects(adm.query("update public.ai_consult_audit set question='adulterada'"), /permission denied/i, "update");
    await rejects(adm.query("delete from public.ai_consult_audit"), /permission denied/i, "delete");
    await rejects(adm.query("truncate public.ai_consult_audit"), /permission denied/i, "truncate");
  });

  await check("C4) service_role grava a trilha do ciclo de risco com solicitante explícito (RISK_CYCLE) e só para quem tem vínculo ATIVO", async () => {
    await clear();
    const s = await as(null, "service_role");
    await s.query("select public.ai_consult_audit_record_for_actor($1,$2,'RISK_CYCLE','risco:9','esg-director','pergunta do ciclo','PROJECT','[]','OK','CRITICAL',0.5,'{}','scripted','m',null,null)", [uid(USERS.UA), PA]);
    await rejects(s.query("select public.ai_consult_audit_record_for_actor($1,$2,'RISK_CYCLE','risco:9','esg-director','q','PROJECT','[]','OK',null,null,'{}',null,null,null,null)", [uid(USERS.UB), PA]), /PROJECT_ACCESS_DENIED/, "ator de outra obra");
    await rejects(s.query("select public.ai_consult_audit_record_for_actor($1,$2,'EXPERT_PANEL','x','ceo','q','PROJECT','[]','OK',null,null,'{}',null,null,null,null)", [uid(USERS.UA), PA]), /INVALID_KIND/, "kind de sessão");
    const r = (await su.query("select severity, input_tokens, estimated_cost_micros from public.ai_consult_audit")).rows;
    eq(r.length, 1, "uma linha");
    eq([r[0].severity, r[0].input_tokens, r[0].estimated_cost_micros], ["CRITICAL", null, null], "tokens nulos e custo nulo (estimativa não configurada)");
  });

  await check("C5) ai_consult_usage: membro vê só o uso das obras onde é membro ATIVO; sem escrita direta", async () => {
    await clear();
    await reserve(await as(USERS.UA), PA, "ceo");
    await reserve(await as(USERS.UB), PB, "ceo");
    const cnt = async (u) => Number((await (await as(u)).query("select count(*)::int n from public.ai_consult_usage")).rows[0].n);
    eq(await cnt(USERS.UA), 1, "UA vê o uso da obra A");
    eq(await cnt(USERS.UB), 1, "UB vê só o da obra B");
    eq(await cnt(USERS.OUT), 0, "sem vínculo");
    eq(await cnt(USERS.OLD), 0, "inativo");
    await rejects((await as(USERS.UA)).query("delete from public.ai_consult_usage"), /permission denied/i, "delete");
    await rejects((await as(USERS.UA)).query("insert into public.ai_consult_usage (project_id,user_id,kind,subject_id,usage_day) values ($1,$2,'ALERTA','s',current_date)", [PA, uid(USERS.UA)]), /permission denied/i, "insert");
  });

  // ---------------------------------------------------------------- D RLS de dados de projeto
  await check("D1) dados de projeto lidos pelos Experts (eventos, curadorias, auditoria): usuário da obra A nunca vê linhas da obra B", async () => {
    for (const p of [PA, PB]) {
      await su.query("insert into public.contract_events (project_id,occurred_at,title,description,source_type,status,created_by_type,created_by_label) values ($1,now(),'ev','d','EMAIL','NOVO','LEGACY','x')", [p]);
      await su.query("insert into public.ai_curation_runs (project_id,source_type,source_id,source_fingerprint,trigger_type,created_by_type,created_by_label) values ($1,'MANUAL','m','f','MANUAL','LEGACY','x')", [p]);
      await su.query("insert into public.audit_log_entries (project_id,actor_type,actor_label,action,entity_type,entity_id,detail) values ($1::uuid,'LEGACY','x','CURADORIA','project',($1::uuid)::text,'d')", [p]);
    }
    for (const [u, mine, other] of [[USERS.UA, PA, PB], [USERS.UB, PB, PA]]) {
      const c = await as(u);
      for (const t of ["contract_events", "ai_curation_runs", "audit_log_entries"]) {
        const seen = (await c.query(`select distinct project_id from public.${t}`)).rows.map((r) => r.project_id);
        ok(!seen.includes(other), `${t}: usuário viu linhas da outra obra`);
        ok(seen.includes(mine) || t === "audit_log_entries", `${t}: usuário não viu a própria obra`);
      }
    }
    const out = await as(USERS.OUT);
    for (const t of ["contract_events", "ai_curation_runs", "audit_log_entries"]) eq((await out.query(`select 1 from public.${t}`)).rows.length, 0, `${t} sem vínculo`);
    eq((await (await as(null, "anon")).query("select 1 from public.contract_events")).rows.length, 0, "anon eventos (RLS)");
  });

  await check("D2) estrutural: toda tabela public com project_id tem RLS ligado e anon não lê nenhuma linha", async () => {
    const t = (await su.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attname='project_id' and not a.attisdropped
      where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`)).rows.map((r) => r.relname);
    eq(t, [], "tabelas com project_id sem RLS");
    // anon enxerga zero linhas de qualquer tabela de projeto (RLS sem policy para anon)
    const an = await as(null, "anon");
    for (const tbl of ["contract_events", "ai_curation_runs", "ai_findings", "audit_log_entries", "ai_consult_usage"]) {
      const r = await an.query(`select count(*)::int n from public.${tbl}`).then((x) => x.rows[0].n, (e) => (/permission denied/i.test(e.message) ? 0 : Promise.reject(e)));
      eq(r, 0, `anon em ${tbl}`);
    }
  });

  await check("D3) funções do Lote 4: SECURITY DEFINER com search_path vazio e sem EXECUTE para anon/public", async () => {
    const f = (await su.query(`select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon_x, has_function_privilege('public', p.oid, 'execute') as pub_x
      from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname like 'ai\\_consult\\_audit%' order by 1`)).rows;
    eq(f.length, 3, "três funções");
    for (const r of f) {
      ok(r.prosecdef, `${r.proname} não é security definer`);
      ok(JSON.stringify(r.proconfig).includes("search_path="), `${r.proname} sem search_path`);
      ok(!r.anon_x && !r.pub_x, `${r.proname} executável por anon/public`);
    }
  });
} finally {
  for (const c of open) await c.end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam (base ${dbName} apagada)`);
process.exit(failed > 0 ? 1 : 0);
