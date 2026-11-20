// QUALIDADE (fase 1) em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base nova (acc_q1_*, apagada no
// fim), identidade por claims JWT (request.jwt.claims + set role — caminho do PostgREST) e concorrência real (conexões
// independentes). Dados 100% SINTÉTICOS. NÃO roda no CI.
// Cobre CASO 1-9, 12-14, 31, 33-39 (parte Qualidade/garantia-dados) + paridade TS x SQL.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-quality-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
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
const Q = await import("../apps/web/lib/quality/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const TARGETS = ["20261122100000_quality_foundation.sql", "20261122101000_quality_rpcs.sql"];
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
const dbName = `acc_q1_${Date.now().toString(36)}`;
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
  for (let i = 0; i < 2; i += 1) for (const f of TARGETS) await su.query(readFileSync(path.join(dir, f), "utf8")); // idempotência (2 reaplicações)
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ migrations de Qualidade reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(2200 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000022a0";
  const PB = "10000000-0000-4000-8000-0000000022b0";
  const U = { ADMIN: 1, GESTOR: 2, COLAB: 3, LEITURA: 4, ADMINB: 5, INATIVO: 6, GERENTE: 7 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `q1-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `Q1 ${n}`, `q1-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','Q1A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','Q1B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const rpc = async (c, sql, params) => (await c.query(sql, params)).rows[0].r;
  let seq = 0;
  const create = (c, { project = PA, origin = "EMAIL", ref, title } = {}) => {
    seq += 1;
    return rpc(c, "select public.quality_ncr_create($1,$2,$3,$4,$5) as r", [project, title ?? `RNC sintética ${seq}`, "descrição", origin, ref ?? `ref-${Date.now()}-${seq}`]);
  };
  const trans = (c, id, to, ver, just = null, evs = null, dup = null) =>
    rpc(c, "select public.quality_ncr_transition($1,$2,$3,$4,$5::uuid[],$6) as r", [id, to, ver, just, evs, dup]);
  const wtrans = (c, id, to, ver, just = null, evs = null) =>
    rpc(c, "select public.quality_warranty_transition($1,$2,$3,$4,$5::uuid[]) as r", [id, to, ver, just, evs]);
  const ncrRow = async (id) => (await su.query("select * from public.quality_ncrs where id=$1", [id])).rows[0];
  const wRow = async (id) => (await su.query("select * from public.quality_warranty_cases where id=$1", [id])).rows[0];
  const addEvidence = async (c, { ncr = null, warranty = null, cls = "NC_COMPROVADA", type = "DOCUMENTO", ref } = {}) => {
    seq += 1;
    return (await c.query(
      "insert into public.quality_evidence (project_id,ncr_id,warranty_case_id,source_type,source_ref,classification,description) values ($1,$2,$3,$4,$5,$6,'sintética') returning id",
      [PA, ncr, warranty, type, ref ?? `ev-${seq}-${Date.now()}`, cls])).rows[0].id;
  };
  const addAction = async (c, ncr, status = "PLANEJADA") =>
    (await c.query("insert into public.quality_corrective_actions (project_id,ncr_id,kind,description,status,executed_at) values ($1,$2,'CORRETIVA','corrigir',$3,$4) returning id",
      [PA, ncr, status, status === "EXECUTADA" ? new Date().toISOString() : null])).rows[0].id;
  const verify = async (c, ncr, evidence, result = "EFICAZ") =>
    (await c.query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,$3,'critério de eficácia definido',$4) returning id", [PA, ncr, result, evidence])).rows[0].id;
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const J = "Justificativa suficiente registrada pelo gestor.";

  /** Leva uma RNC nova até o estado `target` pelo caminho feliz (gestor). */
  async function ncrUntil(target) {
    const g = await as(U.GESTOR);
    const created = await create(g);
    const id = created.id;
    const steps = ["TRIAGEM", "INVESTIGACAO", "CONFIRMADA", "PLANO_ACAO", "CORRECAO", "VERIFICACAO"];
    let version = created.rowVersion;
    let evProven = null;
    let actionId = null;
    for (const s of steps) {
      if (s === "CONFIRMADA") {
        evProven = await addEvidence(g, { ncr: id });
        const r = await trans(g, id, s, version, J, [evProven]);
        version = r.rowVersion;
      } else if (s === "PLANO_ACAO") {
        actionId = await addAction(g, id);
        version = (await trans(g, id, s, version)).rowVersion;
      } else if (s === "VERIFICACAO") {
        await g.query("update public.quality_corrective_actions set status='EXECUTADA', executed_at=now() where id=$1", [actionId]);
        version = (await trans(g, id, s, version)).rowVersion;
      } else version = (await trans(g, id, s, version)).rowVersion;
      if (s === target) break;
    }
    return { id, version, evProven, actionId };
  }

  // ======================= PARIDADE =======================
  await check("paridade: quality_state_transitions (SQL) == TRANSITIONS (TS) — 100% das regras", async () => {
    const rows = (await su.query("select entity_type,from_state,to_state,min_role,requires_justification,requires_evidence from public.quality_state_transitions")).rows
      .map((r) => `${r.entity_type}|${r.from_state}|${r.to_state}|${r.min_role}|${r.requires_justification}|${r.requires_evidence}`).sort();
    const ts = Q.TRANSITIONS.map((r) => `${r.entity}|${r.from}|${r.to}|${r.minRole}|${r.requiresJustification}|${r.requiresEvidence}`).sort();
    eq(rows, ts, "catálogo");
  });

  // ======================= CASO 31 / 39 =======================
  await check("CASO 31) usuário sem autorização: LEITURA, inativo, anon, authenticated sem sub e não-membro NÃO criam nem transicionam; nada gravado", async () => {
    const before = await nq("select count(*)::int n from public.quality_ncrs");
    for (const [who, n] of [["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO], ["ADMINB(outro projeto)", U.ADMINB]]) {
      await rejects(create(await as(n)), /FORBIDDEN/, `${who} cria`);
    }
    await rejects(create(await as(null, "authenticated")), /AUTH_REQUIRED/, "sem sub");
    await rejects(create(await as(null, "anon")), /permission denied/i, "anon");
    eq(await nq("select count(*)::int n from public.quality_ncrs"), before, "nenhuma RNC criada");
    const t = await create(await as(U.GESTOR), { ref: "caso31" });
    for (const [who, n] of [["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO], ["ADMINB", U.ADMINB]]) {
      await rejects(trans(await as(n), t.id, "TRIAGEM", 1), /FORBIDDEN/, `${who} transiciona`);
    }
    await rejects(trans(await as(null, "authenticated"), t.id, "TRIAGEM", 1), /AUTH_REQUIRED/, "sem sub transiciona");
    await rejects(trans(await as(null, "anon"), t.id, "TRIAGEM", 1), /permission denied/i, "anon transiciona");
    eq((await ncrRow(t.id)).state, "DETECTADA", "estado intacto");
  });

  await check("CASO 31b) papéis: COLABORADOR registra/avança mas NÃO cancela/encerra/reabre; GERENTE/GESTOR/ADMINISTRADOR gerem", async () => {
    const colab = await as(U.COLAB);
    const t = await create(colab, { ref: "caso31b" });
    const v2 = (await trans(colab, t.id, "TRIAGEM", t.rowVersion)).rowVersion;
    await rejects(trans(colab, t.id, "CANCELADA", v2, J), /FORBIDDEN/, "colab cancela");
    for (const n of [U.GERENTE, U.GESTOR, U.ADMIN]) {
      const x = await create(await as(n), { ref: `caso31b-${n}` });
      const r = await trans(await as(n), x.id, "CANCELADA", x.rowVersion, J);
      eq(r.to, "CANCELADA", `papel ${n}`);
    }
  });

  await check("CASO 31c) escrita direta bloqueada: sem INSERT/DELETE em RNC e garantia; UPDATE de estado/versão/criticidade negado; evidência não altera a fonte", async () => {
    const g = await as(U.GESTOR);
    await rejects(g.query("insert into public.quality_ncrs (project_id,code,title,origin_type,origin_ref,origin_key) values ($1,'X','xxx','EMAIL','r','EMAIL:r')", [PA]), /permission denied/i, "insert direto");
    await rejects(g.query("insert into public.quality_warranty_cases (project_id,code,service_system,defect_description) values ($1,'G','pintura','defeito')", [PA]), /permission denied/i, "insert direto garantia");
    const t = await create(g, { ref: "caso31c" });
    await rejects(g.query("update public.quality_ncrs set state='ENCERRADA' where id=$1", [t.id]), /permission denied/i, "update estado");
    await rejects(g.query("update public.quality_ncrs set criticality='LOW' where id=$1", [t.id]), /permission denied/i, "update criticidade");
    await rejects(g.query("update public.quality_ncrs set row_version=99 where id=$1", [t.id]), /permission denied/i, "update versão");
    await rejects(g.query("delete from public.quality_ncrs where id=$1", [t.id]), /permission denied/i, "delete");
    const e = await addEvidence(g, { ncr: t.id, ref: "src-imutavel" });
    await rejects(g.query("update public.quality_evidence set source_ref='outra' where id=$1", [e]), /permission denied/i, "fonte (coluna sem grant)");
    await rejects(su.query("update public.quality_evidence set source_ref='outra' where id=$1", [e]), /EVIDENCE_SOURCE_IMMUTABLE/, "fonte (nem superusuário)");
    await rejects(g.query("delete from public.quality_evidence where id=$1", [e]), /permission denied/i, "delete evidência");
    eq((await g.query("update public.quality_evidence set classification='INDICIO' where id=$1 returning classification", [e])).rows[0].classification, "INDICIO", "classificação é revisável");
    await rejects((await as(U.LEITURA)).query("update public.quality_evidence set classification='SUSPEITA' where id=$1", [e]).then((r) => { if (r.rowCount === 0) throw new Error("permission denied (0 linhas)"); }), /permission denied/i, "LEITURA edita");
  });

  await check("CASO 39) isolamento entre projetos: leitura, escrita, transição e FK composta", async () => {
    const a = await create(await as(U.GESTOR), { ref: "iso-a" });
    const b = await create(await as(U.ADMINB), { project: PB, ref: "iso-b" });
    const asB = await as(U.ADMINB);
    eq((await asB.query("select id from public.quality_ncrs where id=$1", [a.id])).rowCount, 0, "B não vê RNC de A");
    eq((await (await as(U.GESTOR)).query("select id from public.quality_ncrs where id=$1", [b.id])).rowCount, 0, "A não vê RNC de B");
    await rejects(trans(asB, a.id, "TRIAGEM", 1), /FORBIDDEN/, "B transiciona RNC de A");
    await rejects(asB.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'EMAIL','x','INDICIO')", [PB, a.id]), /foreign key|violates/i, "evidência de B apontando RNC de A");
    await rejects(asB.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'EMAIL','x','INDICIO')", [PA, a.id]), /row-level security/i, "B escreve em A");
    eq((await asB.query("select count(*)::int n from public.quality_state_events where entity_id=$1", [a.id])).rows[0].n, 0, "eventos de A invisíveis a B");
    eq((await asB.query("select count(*)::int n from public.audit_log_entries where entity_id=$1", [a.id])).rows[0].n, 0, "auditoria de A invisível a B");
    await rejects(asB.query("select * from public.quality_closure_readiness('NCR',$1)", [a.id]), /FORBIDDEN/, "prontidão de A para B");
    await rejects(asB.query("select * from public.quality_find_by_origin($1,'EMAIL','iso-a')", [PA]), /FORBIDDEN/, "find_by_origin de A para B");
    await rejects(su.query("insert into public.quality_corrective_actions (project_id,ncr_id,kind,description) values ($1,$2,'CORRETIVA','cruzada')", [PB, a.id]), /foreign key/i, "FK composta bloqueia até superusuário");
    // mesma origem em projetos diferentes não colide
    const b2 = await create(asB, { project: PB, ref: "iso-a" });
    eq(b2.created, true, "mesma origin_ref em outro projeto cria RNC própria");
  });

  // ======================= CASO 2 / dedupe =======================
  await check("CASO 2) NC em foto SSMA: criar duas vezes a mesma foto = UMA RNC; 12 criações concorrentes = 1 linha; SSMA localiza por origem", async () => {
    const g = await as(U.GESTOR);
    const r1 = await create(g, { origin: "SSMA_FOTO", ref: "FOTO-SSMA-0001", title: "Trinca em viga (foto SSMA)" });
    eq(r1.created, true, "primeira cria");
    const r2 = await create(g, { origin: "SSMA_FOTO", ref: " foto-ssma-0001 " });
    eq([r2.created, r2.deduplicated, r2.id], [false, true, r1.id], "segunda deduplica (case/trim)");
    const found = (await g.query("select * from public.quality_find_by_origin($1,'SSMA_FOTO','FOTO-SSMA-0001')", [PA])).rows;
    eq(found.map((x) => x.id), [r1.id], "find_by_origin");
    const clients = await Promise.all(Array.from({ length: 12 }, () => as(U.GESTOR)));
    const res = await Promise.all(clients.map((c) => create(c, { origin: "SSMA_FOTO", ref: "FOTO-SSMA-CONC" })));
    eq(res.filter((x) => x.created).length, 1, "só uma criada");
    eq(new Set(res.map((x) => x.id)).size, 1, "todas apontam a mesma RNC");
    eq(await nq("select count(*)::int n from public.quality_ncrs where project_id=$1 and origin_key='SSMA_FOTO:foto-ssma-conc'", [PA]), 1, "uma linha");
    // origem liberada quando a RNC é DUPLICADA/CANCELADA
    const orig = await create(g, { ref: "orig-dup" });
    const dupe = await create(g, { origin: "EMAIL", ref: "dup-fonte" });
    const t = (await trans(g, dupe.id, "DUPLICADA", dupe.rowVersion, J, null, orig.id));
    eq(t.to, "DUPLICADA", "duplicada");
    eq((await ncrRow(dupe.id)).duplicate_of_id, orig.id, "aponta a original");
    eq((await create(g, { origin: "EMAIL", ref: "dup-fonte" })).created, true, "origem liberada após DUPLICADA");
    await rejects(create(g, { ref: "" }), /ORIGIN_REQUIRED/, "sem origem não cria");
  });

  await check("DUPLICADA: alvo inválido (próprio, inexistente, de outro projeto, já cancelado) é recusado", async () => {
    const g = await as(U.GESTOR);
    const a = await create(g, { ref: "dup-a" });
    const other = await create(await as(U.ADMINB), { project: PB, ref: "dup-b" });
    await rejects(trans(g, a.id, "DUPLICADA", a.rowVersion, J, null, a.id), /DUPLICATE_TARGET_INVALID/, "próprio");
    await rejects(trans(g, a.id, "DUPLICADA", a.rowVersion, J, null, null), /DUPLICATE_TARGET_INVALID/, "nulo");
    await rejects(trans(g, a.id, "DUPLICADA", a.rowVersion, J, null, other.id), /DUPLICATE_TARGET_INVALID/, "outro projeto");
    const c = await create(g, { ref: "dup-c" });
    await trans(g, c.id, "CANCELADA", c.rowVersion, J);
    await rejects(trans(g, a.id, "DUPLICADA", a.rowVersion, J, null, c.id), /DUPLICATE_TARGET_INVALID/, "alvo cancelado");
  });

  // ======================= máquina de estados =======================
  await check("máquina: transição inválida/pulo de etapa/terminais são recusados com INVALID_TRANSITION; nada muda", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { ref: "inval" });
    for (const to of ["ENCERRADA", "CONFIRMADA", "CORRECAO", "VERIFICACAO", "REABERTA", "DETECTADA"]) {
      await rejects(trans(g, t.id, to, t.rowVersion, J, ["00000000-0000-4000-8000-000000000001"]), /INVALID_TRANSITION/, `DETECTADA->${to}`);
    }
    await rejects(trans(g, t.id, "NAO_EXISTE", t.rowVersion, J), /INVALID_TRANSITION/, "estado inexistente");
    eq((await ncrRow(t.id)).row_version, t.rowVersion, "versão intacta");
    const c = await trans(g, t.id, "CANCELADA", t.rowVersion, J);
    await rejects(trans(g, t.id, "TRIAGEM", c.rowVersion), /INVALID_TRANSITION/, "CANCELADA é terminal");
    await rejects(trans(g, t.id, "REABERTA", c.rowVersion, J, ["00000000-0000-4000-8000-000000000001"]), /INVALID_TRANSITION/, "CANCELADA não reabre");
  });

  await check("justificativa e evidência obrigatórias onde exigido (curta/nula recusadas; evidência de outro caso recusada)", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { ref: "just" });
    await rejects(trans(g, t.id, "CANCELADA", t.rowVersion, null), /JUSTIFICATION_REQUIRED/, "sem justificativa");
    await rejects(trans(g, t.id, "CANCELADA", t.rowVersion, "curta"), /JUSTIFICATION_REQUIRED/, "justificativa curta");
    await rejects(trans(g, t.id, "CANCELADA", t.rowVersion, "          "), /JUSTIFICATION_REQUIRED/, "só espaços");
    const v = (await trans(g, t.id, "TRIAGEM", t.rowVersion)).rowVersion;
    const v2 = (await trans(g, t.id, "INVESTIGACAO", v)).rowVersion;
    await rejects(trans(g, t.id, "NAO_CONFIRMADA", v2, J), /EVIDENCE_REQUIRED/, "sem evidência");
    const outro = await create(g, { ref: "just-outro" });
    const evOutro = await addEvidence(g, { ncr: outro.id });
    await rejects(trans(g, t.id, "NAO_CONFIRMADA", v2, J, [evOutro]), /EVIDENCE_INVALID/, "evidência de outro caso");
    const evOk = await addEvidence(g, { ncr: t.id, cls: "SUSPEITA" });
    eq((await trans(g, t.id, "NAO_CONFIRMADA", v2, J, [evOk])).to, "NAO_CONFIRMADA", "com justificativa+evidência");
  });

  await check("CASO 5/6) indício (diário de obra) e relatório de fiscalização: distinguem SUSPEITA/INDÍCIO/NC COMPROVADA/RISCO POTENCIAL; só NC_COMPROVADA confirma a RNC", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { origin: "DIARIO_OBRA", ref: "diario-2026-11-02#p3", title: "Indício de concretagem fora do traço" });
    let v = (await trans(g, t.id, "TRIAGEM", t.rowVersion)).rowVersion;
    v = (await trans(g, t.id, "INVESTIGACAO", v)).rowVersion;
    const indicio = await addEvidence(g, { ncr: t.id, cls: "INDICIO", type: "DIARIO_OBRA", ref: "diario-2026-11-02#p3" });
    const fisc = await addEvidence(g, { ncr: t.id, cls: "RISCO_POTENCIAL", type: "FISCALIZACAO", ref: "relatorio-fiscalizacao-07" });
    const susp = await addEvidence(g, { ncr: t.id, cls: "SUSPEITA", type: "EMAIL", ref: "msg-001" });
    await rejects(trans(g, t.id, "CONFIRMADA", v, J, [indicio, fisc, susp]), /TRANSITION_BLOCKED.*CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE/, "indício/risco/suspeita não confirmam");
    const proof = await addEvidence(g, { ncr: t.id, cls: "NC_COMPROVADA", type: "ENSAIO_LAUDO", ref: "laudo-ensaio-33" });
    eq((await trans(g, t.id, "CONFIRMADA", v, J, [proof])).to, "CONFIRMADA", "NC_COMPROVADA confirma");
    await rejects(g.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'DIARIO_OBRA','diario-2026-11-02#p3','INDICIO')", [PA, t.id]), /duplicate key|unique/i, "mesma fonte duas vezes no mesmo caso");
    await rejects(g.query("insert into public.quality_evidence (project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,'FOTO','x','INDICIO')", [PA, t.id]), /check constraint/i, "tipo de fonte inválido");
    await rejects(g.query("insert into public.quality_evidence (project_id,source_type,source_ref,classification) values ($1,'EMAIL','solta','INDICIO')", [PA]), /check constraint/i, "evidência sem vínculo a caso");
    const row = (await su.query("select source_type,source_ref,classification,epistemic from public.quality_evidence where id=$1", [fisc])).rows[0];
    eq([row.source_type, row.classification, row.epistemic], ["FISCALIZACAO", "RISCO_POTENCIAL", "FATO"], "campos de rastreabilidade");
  });

  // ======================= CICLO COMPLETO / ENCERRAMENTO INDEVIDO / REABERTURA =======================
  await check("ciclo completo DETECTADA→...→ENCERRADA com verificação de eficácia; eventos append-only na ordem; closed_at preenchido", async () => {
    const g = await as(U.GESTOR);
    const { id, version, evProven } = await ncrUntil("VERIFICACAO");
    eq((await ncrRow(id)).state, "VERIFICACAO", "em verificação");
    const rdy0 = await rpc(g, "select public.quality_closure_readiness('NCR',$1) as r", [id]);
    eq([rdy0.ready, rdy0.blockers], [false, ["EFFECTIVENESS_VERIFICATION_REQUIRED"]], "pronto? não, falta verificação");
    await verify(g, id, evProven, "EFICAZ");
    const rdy1 = await rpc(g, "select public.quality_closure_readiness('NCR',$1) as r", [id]);
    eq(rdy1.ready, true, "pronto");
    const r = await trans(g, id, "ENCERRADA", version, "Eficácia verificada em reinspeção e laudo.");
    eq(r.to, "ENCERRADA", "encerrada");
    ok((await ncrRow(id)).closed_at, "closed_at");
    const ev = (await su.query("select from_state,to_state from public.quality_state_events where entity_id=$1 order by seq", [id])).rows.map((x) => `${x.from_state ?? ""}>${x.to_state}`);
    eq(ev, [">DETECTADA", "DETECTADA>TRIAGEM", "TRIAGEM>INVESTIGACAO", "INVESTIGACAO>CONFIRMADA", "CONFIRMADA>PLANO_ACAO", "PLANO_ACAO>CORRECAO", "CORRECAO>VERIFICACAO", "VERIFICACAO>ENCERRADA"], "eventos");
  });

  await check("CASO 35) RNC com encerramento indevido: correção executada NÃO encerra; sem verificação / ineficaz / parcial / ação pendente / verificação vencida são bloqueados", async () => {
    const g = await as(U.GESTOR);
    const { id, version, evProven, actionId } = await ncrUntil("VERIFICACAO");
    await rejects(trans(g, id, "ENCERRADA", version, J), /TRANSITION_BLOCKED.*EFFECTIVENESS_VERIFICATION_REQUIRED/, "ação executada, sem verificação");
    await verify(g, id, evProven, "INEFICAZ");
    await rejects(trans(g, id, "ENCERRADA", version, J), /LATEST_VERIFICATION_NOT_EFFECTIVE/, "verificação ineficaz");
    await verify(g, id, evProven, "PARCIAL");
    await rejects(trans(g, id, "ENCERRADA", version, J), /LATEST_VERIFICATION_NOT_EFFECTIVE/, "verificação parcial");
    await verify(g, id, evProven, "EFICAZ");
    // ação adicional pendente reabre a lacuna
    await addAction(g, id, "PLANEJADA");
    await rejects(trans(g, id, "ENCERRADA", version, J), /ACTIONS_NOT_EXECUTED/, "ação pendente");
    await g.query("update public.quality_corrective_actions set status='CANCELADA' where ncr_id=$1 and status='PLANEJADA'", [id]);
    // volta à correção (VERIFICACAO->CORRECAO) e a verificação antiga perde validade
    const v2 = (await trans(g, id, "CORRECAO", version, "Verificação indicou necessidade de nova correção.")).rowVersion;
    const v3 = (await trans(g, id, "VERIFICACAO", v2)).rowVersion;
    await rejects(trans(g, id, "ENCERRADA", v3, J), /VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN/, "verificação vencida");
    await verify(g, id, evProven, "EFICAZ");
    eq((await trans(g, id, "ENCERRADA", v3, J)).to, "ENCERRADA", "nova verificação vigente encerra");
    // não há atalho CORRECAO->ENCERRADA
    const o = await ncrUntil("CORRECAO");
    await rejects(trans(g, o.id, "ENCERRADA", o.version, J), /INVALID_TRANSITION/, "CORRECAO->ENCERRADA");
    void actionId;
  });

  await check("CASO 35b) verificação de eficácia: só em RNC VERIFICACAO, só gestão, evidência obrigatória do MESMO caso, append-only", async () => {
    const g = await as(U.GESTOR);
    const early = await create(g, { ref: "verif-early" });
    const eEarly = await addEvidence(g, { ncr: early.id });
    await rejects(verify(g, early.id, eEarly), /VERIFICATION_STATE_INVALID/, "RNC fora de VERIFICACAO");
    const { id, evProven } = await ncrUntil("VERIFICACAO");
    await rejects((await as(U.COLAB)).query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',$3)", [PA, id, evProven]), /row-level security/i, "colaborador registra verificação");
    await rejects((await as(U.LEITURA)).query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',$3)", [PA, id, evProven]), /row-level security/i, "leitura registra verificação");
    await rejects(g.query("insert into public.quality_effectiveness_verifications (project_id,ncr_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',null)", [PA, id]), /VERIFICATION_EVIDENCE_REQUIRED/, "sem evidência");
    await rejects(verify(g, id, eEarly), /VERIFICATION_EVIDENCE_INVALID/, "evidência de outro caso");
    const vId = await verify(g, id, evProven);
    await rejects(su.query("update public.quality_effectiveness_verifications set result='INEFICAZ' where id=$1", [vId]), /append-only/, "update");
    await rejects(su.query("delete from public.quality_effectiveness_verifications where id=$1", [vId]), /append-only/, "delete");
  });

  await check("CASO 36) reabertura de RNC: ENCERRADA→REABERTA só com justificativa+evidência e perfil de gestão; novo encerramento exige NOVA verificação", async () => {
    const g = await as(U.GESTOR);
    const { id, version, evProven } = await ncrUntil("VERIFICACAO");
    await verify(g, id, evProven);
    const closed = await trans(g, id, "ENCERRADA", version, J);
    const newEv = await addEvidence(g, { ncr: id, cls: "NC_COMPROVADA", ref: "reincidencia-foto-2" });
    await rejects(trans(await as(U.COLAB), id, "REABERTA", closed.rowVersion, J, [newEv]), /FORBIDDEN/, "colaborador reabre");
    await rejects(trans(g, id, "REABERTA", closed.rowVersion, null, [newEv]), /JUSTIFICATION_REQUIRED/, "sem justificativa");
    await rejects(trans(g, id, "REABERTA", closed.rowVersion, J), /EVIDENCE_REQUIRED/, "sem evidência");
    const re = await trans(g, id, "REABERTA", closed.rowVersion, "Defeito reapareceu após chuva forte.", [newEv]);
    const row = await ncrRow(id);
    eq([row.state, row.reopen_count, row.closed_at], ["REABERTA", 1, null], "estado/contador/closed_at");
    await rejects(trans(g, id, "ENCERRADA", re.rowVersion, J), /INVALID_TRANSITION/, "REABERTA não encerra direto");
    let v = (await trans(g, id, "INVESTIGACAO", re.rowVersion)).rowVersion;
    v = (await trans(g, id, "CONFIRMADA", v, J, [evProven])).rowVersion;
    v = (await trans(g, id, "PLANO_ACAO", v)).rowVersion;
    await addAction(g, id, "EXECUTADA");
    v = (await trans(g, id, "CORRECAO", v)).rowVersion;
    await g.query("update public.quality_corrective_actions set status='EXECUTADA', executed_at=now() where ncr_id=$1 and status<>'CANCELADA'", [id]);
    v = (await trans(g, id, "VERIFICACAO", v)).rowVersion;
    await rejects(trans(g, id, "ENCERRADA", v, J), /VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN/, "verificação do ciclo anterior não vale");
    await verify(g, id, newEv);
    eq((await trans(g, id, "ENCERRADA", v, "Segundo ciclo verificado com sucesso.")).to, "ENCERRADA", "reencerrada");
    // NAO_CONFIRMADA também reabre (com evidência)
    const nc = await create(g, { ref: "nc-reabre" });
    let w = (await trans(g, nc.id, "TRIAGEM", nc.rowVersion)).rowVersion;
    w = (await trans(g, nc.id, "INVESTIGACAO", w)).rowVersion;
    const e1 = await addEvidence(g, { ncr: nc.id, cls: "SUSPEITA" });
    w = (await trans(g, nc.id, "NAO_CONFIRMADA", w, J, [e1])).rowVersion;
    eq((await trans(g, nc.id, "REABERTA", w, "Novo indício surgiu na vistoria.", [e1])).to, "REABERTA", "NAO_CONFIRMADA reabre");
  });

  await check("alerta RESOLVIDO não encerra: quality_alert_resolved_guard é somente leitura, sempre alertResolutionClosesEntity=false e informa bloqueios", async () => {
    const g = await as(U.GESTOR);
    const { id, version, evProven } = await ncrUntil("VERIFICACAO");
    const before = await ncrRow(id);
    const r = await rpc(g, "select public.quality_alert_resolved_guard('NCR',$1) as r", [id]);
    eq([r.alertResolutionClosesEntity, r.closureReady, r.entityState], [false, false, "VERIFICACAO"], "guarda sem verificação");
    ok(r.blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED"), "bloqueio informado");
    await verify(g, id, evProven);
    const r2 = await rpc(g, "select public.quality_alert_resolved_guard('NCR',$1) as r", [id]);
    eq([r2.alertResolutionClosesEntity, r2.closureReady], [false, true], "pronta, mas o alerta nunca fecha");
    const after = await ncrRow(id);
    eq([after.state, after.row_version], [before.state, before.row_version], "guarda não altera a RNC");
    await rejects((await as(U.ADMINB)).query("select public.quality_alert_resolved_guard('NCR',$1)", [id]), /FORBIDDEN/, "não-membro");
    void version;
  });

  // ======================= CASO 37 auditoria =======================
  await check("CASO 37) auditoria: criação, edição direta e transição geram audit_log_entries (ator, ação, justificativa); trilha append-only", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { ref: "audit-1" });
    await g.query("update public.quality_ncrs set title='Título revisado' where id=$1", [t.id]);
    const r = await trans(g, t.id, "CANCELADA", (await ncrRow(t.id)).row_version, "Cancelada por erro de registro (teste).");
    const rows = (await su.query("select action, actor_type, actor_user_id, detail from public.audit_log_entries where entity_id=$1 order by occurred_at, id", [t.id])).rows;
    const acts = rows.map((x) => x.action);
    ok(acts.includes("QUALITY_QUALITY_NCRS_INSERT"), `insert auditado: ${acts}`);
    ok(acts.includes("QUALITY_QUALITY_NCRS_UPDATE"), "update direto auditado");
    ok(acts.includes("QUALITY_NCR_TRANSITION"), "transição auditada");
    const tr = rows.find((x) => x.action === "QUALITY_NCR_TRANSITION");
    eq([tr.actor_type, tr.actor_user_id], ["USER", uid(U.GESTOR)], "ator");
    const d = JSON.parse(tr.detail);
    eq([d.from, d.to, d.justification], ["DETECTADA", "CANCELADA", "Cancelada por erro de registro (teste)."], "detalhe com justificativa");
    eq(rows.filter((x) => x.action === "QUALITY_QUALITY_NCRS_UPDATE").length, 1, "transição não duplica a linha de update");
    ok(JSON.parse(rows.find((x) => x.action === "QUALITY_QUALITY_NCRS_UPDATE").detail).changedColumns.includes("title"), "colunas alteradas");
    const ev = (await su.query("select * from public.quality_state_events where entity_id=$1 order by seq", [t.id])).rows;
    eq(ev.map((x) => x.to_state), ["DETECTADA", "CANCELADA"], "histórico de estados");
    eq(ev[1].justification, "Cancelada por erro de registro (teste).", "justificativa no histórico");
    await rejects(su.query("update public.audit_log_entries set detail='x' where entity_id=$1", [t.id]), /append-only/, "audit update");
    await rejects(su.query("delete from public.audit_log_entries where entity_id=$1", [t.id]), /append-only/, "audit delete");
    await rejects(su.query("update public.quality_state_events set justification='x' where entity_id=$1", [t.id]), /append-only/, "events update");
    await rejects(su.query("delete from public.quality_state_events where entity_id=$1", [t.id]), /append-only/, "events delete");
    await rejects(g.query("insert into public.audit_log_entries (project_id,actor_type,action,entity_type,entity_id,detail) values ($1,'SYSTEM','X','X','x','x')", [PA]), /permission denied|row-level security/i, "usuário não forja auditoria");
    // tentativas recusadas não deixam rastro de transição
    const nBefore = await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_NCR_TRANSITION' and entity_id=$1", [t.id]);
    await rejects(trans(g, t.id, "TRIAGEM", r.rowVersion), /INVALID_TRANSITION/, "inválida");
    eq(await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_NCR_TRANSITION' and entity_id=$1", [t.id]), nBefore, "recusa sem auditoria de sucesso");
  });

  // ======================= CASO 38 concorrência =======================
  await check("CASO 38) concorrência: 10 transições simultâneas com a mesma versão => UMA vence, as demais VERSION_CONFLICT; versão avança 1", async () => {
    const t = await create(await as(U.GESTOR), { ref: "conc-1" });
    const clients = await Promise.all(Array.from({ length: 10 }, (_, i) => as([U.GESTOR, U.ADMIN, U.GERENTE, U.COLAB][i % 4])));
    const settled = await Promise.allSettled(clients.map((c) => trans(c, t.id, "TRIAGEM", t.rowVersion)));
    const wins = settled.filter((s) => s.status === "fulfilled");
    const losses = settled.filter((s) => s.status === "rejected");
    eq(wins.length, 1, "vencedoras");
    ok(losses.every((l) => /VERSION_CONFLICT/.test(l.reason.message)), `perdedoras: ${losses.map((l) => l.reason.message)}`);
    const row = await ncrRow(t.id);
    eq([row.state, row.row_version], ["TRIAGEM", t.rowVersion + 1], "estado e versão");
    eq(await nq("select count(*)::int n from public.quality_state_events where entity_id=$1 and to_state='TRIAGEM'", [t.id]), 1, "um evento");
    eq(await nq("select count(*)::int n from public.audit_log_entries where entity_id=$1 and action='QUALITY_NCR_TRANSITION'", [t.id]), 1, "uma auditoria");
  });

  await check("CASO 38b) concorrência: destinos conflitantes (INVESTIGACAO x CANCELADA) — só um resultado; edição direta concorrente também invalida a versão", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { ref: "conc-2" });
    const v = (await trans(g, t.id, "TRIAGEM", t.rowVersion)).rowVersion;
    const [a, b] = await Promise.all([as(U.GESTOR), as(U.ADMIN)]);
    const s = await Promise.allSettled([trans(a, t.id, "INVESTIGACAO", v), trans(b, t.id, "CANCELADA", v, J)]);
    eq(s.filter((x) => x.status === "fulfilled").length, 1, "um vencedor");
    ok(s.find((x) => x.status === "rejected").reason.message.startsWith("VERSION_CONFLICT"), "erro claro");
    // edição direta bumpa versão: transição com versão lida antes falha
    const t2 = await create(g, { ref: "conc-3" });
    await g.query("update public.quality_ncrs set description='editada' where id=$1", [t2.id]);
    await rejects(trans(g, t2.id, "TRIAGEM", t2.rowVersion), /VERSION_CONFLICT/, "versão velha após edição");
    await rejects(trans(g, t2.id, "TRIAGEM", null), /VERSION_REQUIRED/, "versão obrigatória");
    // adicionar consequência (muda só a criticidade) NÃO invalida a versão
    await g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,source_type,source_ref) values ($1,$2,'PRAZO','LOW','DOCUMENTO','cron-1')", [PA, t2.id]);
    const cur = (await ncrRow(t2.id)).row_version;
    eq((await trans(g, t2.id, "TRIAGEM", cur)).to, "TRIAGEM", "criticidade não consome versão");
  });

  await check("CASO 38c) concorrência: verificação e encerramento simultâneos — encerramento único; duas RNC não interferem", async () => {
    const g = await as(U.GESTOR);
    const { id, version, evProven } = await ncrUntil("VERIFICACAO");
    await verify(g, id, evProven);
    const clients = await Promise.all(Array.from({ length: 6 }, () => as(U.GESTOR)));
    const s = await Promise.allSettled(clients.map((c) => trans(c, id, "ENCERRADA", version, J)));
    eq(s.filter((x) => x.status === "fulfilled").length, 1, "um encerramento");
    eq(await nq("select count(*)::int n from public.quality_state_events where entity_id=$1 and to_state='ENCERRADA'", [id]), 1, "um evento de encerramento");
  });

  // ======================= consequências / criticidade (CASO 1, 33, 34) =======================
  await check("CASO 1) falha estrutural em execução: SEGURANCA CRITICAL domina prazo/custo baixos no banco; versão não é consumida", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { origin: "INSPECAO", ref: "insp-estrutura-01", title: "Falha estrutural em laje em execução" });
    eq((await ncrRow(t.id)).criticality, "SEM_DADOS", "antes: SEM_DADOS");
    const add = (pillar, severity, extra = "") => g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,source_type,source_ref,description) values ($1,$2,$3,$4,'INSPECAO','insp-estrutura-01',$5)", [PA, t.id, pillar, severity, extra]);
    await add("PRAZO", "LOW"); await add("CUSTO", "LOW");
    eq((await ncrRow(t.id)).criticality, "LOW", "prazo/custo baixos => LOW");
    await add("SEGURANCA", "CRITICAL", "colapso parcial de laje");
    const row = await ncrRow(t.id);
    eq(row.criticality, "CRITICAL", "pior pilar domina");
    eq(row.row_version, t.rowVersion, "versão não consumida");
    await add("QUALIDADE", "MEDIUM");
    eq((await ncrRow(t.id)).criticality, "CRITICAL", "nunca média");
  });

  await check("CASO 33/34) dados insuficientes e 4 pilares: probabilidade NULL ok, só com fundamento; sem fonte recusada; paridade TS x SQL em 40 combinações aleatórias", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { ref: "pilares" });
    await g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,source_type,source_ref) values ($1,$2,'CUSTO','MEDIUM','DOCUMENTO','orc-9')", [PA, t.id]);
    const p = (await su.query("select probability, probability_basis from public.quality_consequences where ncr_id=$1", [t.id])).rows[0];
    eq([p.probability, p.probability_basis], [null, null], "probabilidade nullable");
    await rejects(g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,probability,source_type,source_ref) values ($1,$2,'PRAZO','LOW','PROVAVEL','DOCUMENTO','x')", [PA, t.id]), /check constraint/i, "probabilidade sem fundamento");
    await rejects(g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,source_type,source_ref) values ($1,$2,'PRAZO','LOW','DOCUMENTO','')", [PA, t.id]), /check constraint/i, "sem fonte");
    await rejects(g.query("insert into public.quality_consequences (project_id,pillar,severity,source_type,source_ref) values ($1,'PRAZO','LOW','DOCUMENTO','x')", [PA]), /check constraint/i, "sem caso");
    await rejects(g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,source_type,source_ref) values ($1,$2,'FINANCEIRO','LOW','DOCUMENTO','x')", [PA, t.id]), /check constraint/i, "pilar inválido");
    await g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,probability,probability_basis,source_type,source_ref) values ($1,$2,'PRAZO','HIGH','POSSIVEL','recorrência em 2 de 5 pavimentos','DOCUMENTO','cron-2')", [PA, t.id]);
    // sweep de paridade
    const sev = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const pil = ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"];
    let rnd = 12345;
    const next = (n) => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd % n; };
    for (let i = 0; i < 40; i += 1) {
      const n = await create(g, { ref: `sweep-${i}` });
      const list = Array.from({ length: next(5) }, () => ({ pillar: pil[next(4)], severity: sev[next(4)], sourceRef: "s" }));
      for (const c of list) await g.query("insert into public.quality_consequences (project_id,ncr_id,pillar,severity,source_type,source_ref) values ($1,$2,$3,$4,'DOCUMENTO','s')", [PA, n.id, c.pillar, c.severity]);
      eq((await ncrRow(n.id)).criticality, Q.computeCriticality(list).criticality, `combinação ${i} ${JSON.stringify(list.map((x) => x.pillar[0] + x.severity[0]))}`);
    }
  });

  await check("CASO 33b) custos de não qualidade: sem valor = SEM DADOS (aceito); valor sem fonte recusado; negativo recusado; recorrência não aponta para si mesma", async () => {
    const g = await as(U.GESTOR);
    const t = await create(g, { ref: "custos" });
    await g.query("insert into public.quality_nonquality_costs (project_id,ncr_id,category) values ($1,$2,'RETRABALHO')", [PA, t.id]);
    await rejects(g.query("insert into public.quality_nonquality_costs (project_id,ncr_id,category,estimated_amount) values ($1,$2,'MATERIAL',1000)", [PA, t.id]), /check constraint/i, "valor sem fonte");
    await rejects(g.query("insert into public.quality_nonquality_costs (project_id,ncr_id,category,estimated_amount,source_ref) values ($1,$2,'MATERIAL',-5,'orc')", [PA, t.id]), /check constraint/i, "negativo");
    await g.query("insert into public.quality_nonquality_costs (project_id,ncr_id,category,estimated_amount,actual_amount,source_ref) values ($1,$2,'MATERIAL',1000,1200,'nf-123')", [PA, t.id]);
    const other = await create(g, { ref: "custos-rel" });
    await g.query("insert into public.quality_recurrences (project_id,ncr_id,related_ncr_id,basis) values ($1,$2,$3,'mesma causa raiz no mesmo serviço')", [PA, t.id, other.id]);
    await rejects(g.query("insert into public.quality_recurrences (project_id,ncr_id,related_ncr_id,basis) values ($1,$2,$2,'auto-referência indevida')", [PA, t.id]), /check constraint/i, "recorrência própria");
  });

  // ======================= reclamações / origens (CASO 3, 4) =======================
  await check("CASO 3/4) reclamação de cliente por e-mail e por e-mail AXION: rastreável à mensagem; mesma mensagem não duplica; vincula RNC", async () => {
    const g = await as(U.GESTOR);
    const ins = (channel, ref) => g.query("insert into public.quality_customer_complaints (project_id,channel,received_at,complainant,subject,source_ref) values ($1,$2,now(),'cliente sintético','Infiltração na sala',$3) returning id, code", [PA, channel, ref]);
    const c1 = (await ins("EMAIL_CLIENTE", "msg-cliente-001@exemplo.invalid")).rows[0];
    const c2 = (await ins("EMAIL_AXION", "msg-axion-002@exemplo.invalid")).rows[0];
    ok(/^REC-\d{4}$/.test(c1.code) && c1.code !== c2.code, "códigos automáticos distintos");
    await rejects(ins("EMAIL_CLIENTE", "msg-cliente-001@exemplo.invalid"), /duplicate key|unique/i, "mesmo e-mail duas vezes");
    await rejects(g.query("insert into public.quality_customer_complaints (project_id,channel,received_at,subject,source_ref) values ($1,'EMAIL_CLIENTE',now(),'sem fonte','')", [PA]), /check constraint/i, "sem fonte");
    const ncr = await create(g, { origin: "RECLAMACAO_CLIENTE", ref: "msg-cliente-001@exemplo.invalid", title: "Infiltração reclamada pelo cliente" });
    await g.query("update public.quality_customer_complaints set ncr_id=$1 where id=$2", [ncr.id, c1.id]);
    eq((await su.query("select ncr_id from public.quality_customer_complaints where id=$1", [c1.id])).rows[0].ncr_id, ncr.id, "vínculo");
    await g.query("insert into public.quality_evidence (project_id,ncr_id,complaint_id,source_type,source_ref,source_url,classification) values ($1,$2,$3,'EMAIL','msg-cliente-001@exemplo.invalid','https://exemplo.invalid/mail/1','INDICIO')", [PA, ncr.id, c1.id]);
    eq((await create(g, { origin: "RECLAMACAO_CLIENTE", ref: "MSG-CLIENTE-001@exemplo.invalid" })).deduplicated, true, "RNC da mesma reclamação deduplica");
  });

  await check("inspeções, ensaios/laudos e requisitos: códigos automáticos, resultado conclusivo exige laudo rastreável, vínculo à RNC", async () => {
    const g = await as(U.GESTOR);
    const req = (await g.query("insert into public.quality_requirements (project_id,title,source_ref) values ($1,'Resistência mínima do concreto','NBR/projeto-estrutural-rev3') returning id,code", [PA])).rows[0];
    ok(/^REQ-\d{4}$/.test(req.code), "REQ");
    const ins = (await g.query("insert into public.quality_inspections (project_id,title,result,requirement_id) values ($1,'Inspeção de armação','NAO_CONFORME',$2) returning code", [PA, req.id])).rows[0];
    ok(/^INS-\d{4}$/.test(ins.code), "INS");
    await rejects(g.query("insert into public.quality_tests (project_id,test_type,result) values ($1,'Rompimento de corpo de prova','REPROVADO')", [PA]), /check constraint/i, "laudo sem relatório");
    const ens = (await g.query("insert into public.quality_tests (project_id,test_type,result,report_ref,requirement_id) values ($1,'Rompimento de corpo de prova','REPROVADO','laudo-lab-77',$2) returning code", [PA, req.id])).rows[0];
    ok(/^ENS-\d{4}$/.test(ens.code), "ENS");
    await g.query("insert into public.quality_tests (project_id,test_type) values ($1,'Pendente')", [PA]);
    await rejects(g.query("insert into public.quality_inspections (project_id,title,requirement_id) values ($1,'Req de outro projeto','00000000-0000-4000-8000-00000000dead')", [PA]), /foreign key/i, "requisito inexistente");
  });

  // ======================= garantias (CASO 7, 8, 9, 12, 13, 14) =======================
  const wcreate = (c, system, defect, data = {}) => rpc(c, "select public.quality_warranty_create($1,$2,$3,$4::jsonb) as r", [PA, system, defect, JSON.stringify(data)]);

  await check("CASO 7/8/9) defeito pós-entrega (pintura e impermeabilização): campos de garantia completos, origem rastreável e dedupe por origem", async () => {
    const g = await as(U.GESTOR);
    const data = {
      contract_ref: "CT-2026/045", delivered_at: "2026-03-10", discovered_at: "2026-09-02", communicated_at: "2026-09-05",
      warranty_terms: "Termo de garantia conforme contrato (texto integral no documento)", warranty_terms_ref: "doc-termo-garantia-v1",
      customer_complaint: "Bolhas e descascamento na parede da sala", cause_category: "EXECUCAO", responsible_user_id: uid(U.GESTOR),
      due_date: "2026-12-15", supplier_name: "Fornecedor sintético", supplier_warranty_until: "2027-03-10", builder_warranty_until: "2031-03-10",
      origin_type: "RECLAMACAO_CLIENTE", origin_ref: "msg-pintura-001@exemplo.invalid", estimated_cost: 1800.5,
    };
    const pint = await wcreate(g, "Pintura interna", "Descascamento de tinta com bolhas", data);
    eq([pint.created, /^GAR-\d{4}$/.test(pint.code)], [true, true], "pintura criada");
    const row = await wRow(pint.id);
    eq([row.state, row.service_system, row.contract_ref, String(row.delivered_at).slice(0, 15) !== "", row.criticality], ["ABERTA", "Pintura interna", "CT-2026/045", true, "SEM_DADOS"], "campos");
    ok(row.supplier_warranty_until && row.builder_warranty_until, "garantia do fornecedor e da construtora distintas");
    eq(Number(row.estimated_cost), 1800.5, "custo estimado");
    eq(row.actual_cost, null, "custo realizado ainda sem dado (NULL)");
    const again = await wcreate(g, "Pintura interna", "mesmo e-mail", { origin_type: "RECLAMACAO_CLIENTE", origin_ref: "MSG-PINTURA-001@exemplo.invalid" });
    eq([again.created, again.deduplicated, again.id], [false, true, pint.id], "dedupe por origem");
    const imp = await wcreate(g, "Impermeabilização da laje de cobertura", "Infiltração em teto do último pavimento", { origin_type: "EMAIL", origin_ref: "msg-imper-77", discovered_at: "2026-10-01" });
    eq(imp.created, true, "impermeabilização criada");
    await rejects(wtrans(await as(U.LEITURA), pint.id, "EM_VISTORIA", 1), /FORBIDDEN/, "LEITURA");
    await rejects(wtrans(await as(U.ADMINB), pint.id, "EM_VISTORIA", 1), /FORBIDDEN/, "outro projeto");
    await rejects(rpc(await as(U.LEITURA), "select public.quality_warranty_create($1,'x','yyyy','{}'::jsonb) as r", [PA]), /FORBIDDEN/, "LEITURA cria");
    await g.query("insert into public.quality_warranty_surveys (project_id,warranty_case_id,surveyed_at,findings,surveyor_user_id) values ($1,$2,now(),'Bolhas em 3 paredes, umidade ascendente',$3)", [PA, pint.id, uid(U.GESTOR)]);
    const rep1 = (await g.query("insert into public.quality_warranty_repairs (project_id,warranty_case_id,executed_at,description,estimated_cost,actual_cost) values ($1,$2,now(),'Repintura parcial',500,620) returning id", [PA, pint.id])).rows[0].id;
    await g.query("insert into public.quality_warranty_repairs (project_id,warranty_case_id,description,is_recurrence,previous_repair_id) values ($1,$2,'Nova repintura (reincidência)',true,$3)", [PA, pint.id, rep1]);
    await rejects(g.query("insert into public.quality_warranty_repairs (project_id,warranty_case_id,description,is_recurrence) values ($1,$2,'reincidência sem anterior',true)", [PA, pint.id]), /check constraint/i, "reincidência exige reparo anterior");
  });

  await check("CASO 12/13) vício oculto e solidez/segurança: sinalizados; consequência SEGURANCA CRITICAL domina a garantia", async () => {
    const g = await as(U.GESTOR);
    const w = await wcreate(g, "Estrutura de concreto", "Fissuras estruturais em pilar de garagem", {
      cause_category: "SOLIDEZ_SEGURANCA", hidden_defect: true, solidity_safety: true, delivered_at: "2024-05-01", discovered_at: "2026-10-20",
      origin_type: "DOCUMENTO", origin_ref: "laudo-pos-entrega-9",
    });
    const row = await wRow(w.id);
    eq([row.hidden_defect, row.solidity_safety, row.cause_category], [true, true, "SOLIDEZ_SEGURANCA"], "flags");
    await g.query("insert into public.quality_consequences (project_id,warranty_case_id,pillar,severity,source_type,source_ref) values ($1,$2,'CUSTO','LOW','DOCUMENTO','orc-x')", [PA, w.id]);
    await g.query("insert into public.quality_consequences (project_id,warranty_case_id,pillar,severity,source_type,source_ref,measures) values ($1,$2,'SEGURANCA','CRITICAL','DOCUMENTO','laudo-pos-entrega-9','isolar a área e escorar')", [PA, w.id]);
    const after = await wRow(w.id);
    eq([after.criticality, after.row_version], ["CRITICAL", row.row_version], "criticidade da garantia, sem consumir versão");
    // sem análise jurídica inventada: o banco não calcula prazo legal nem conclui exclusão
    ok(!("legal_deadline" in after) && !("warranty_expired" in after), "sem conclusão jurídica no schema");
  });

  await check("CASO 14) ausência de comprovantes de manutenção: SEM_REGISTRO / SEM_COMPROVANTE / COMPROVADO (constatação factual, sem concluir exclusão)", async () => {
    const g = await as(U.GESTOR);
    const w = await wcreate(g, "Esquadrias de alumínio", "Vazamento na janela", { origin_type: "MANUAL", origin_ref: "caso14" });
    const st = async () => rpc(g, "select public.quality_warranty_maintenance_status($1) as r", [w.id]);
    eq((await st()).status, "SEM_REGISTRO", "sem registro algum");
    await g.query("insert into public.quality_warranty_maintenance (project_id,warranty_case_id,performed_at,description) values ($1,$2,'2026-01-10','Limpeza de trilhos (sem nota)')", [PA, w.id]);
    const s2 = await st();
    eq([s2.status, s2.records, s2.withoutProof], ["SEM_COMPROVANTE", 1, 1], "registro sem comprovante");
    ok(/não conclui exclusão/i.test(s2.note), "nota de cautela");
    await g.query("update public.quality_warranty_maintenance set proof_ref='os-123' where warranty_case_id=$1", [w.id]);
    eq((await st()).status, "COMPROVADO", "comprovado");
    await rejects((await as(U.ADMINB)).query("select public.quality_warranty_maintenance_status($1)", [w.id]), /FORBIDDEN/, "isolamento");
  });

  await check("garantia: ciclo completo com reparo, verificação de eficácia e ACEITE do cliente; reparo executado NÃO encerra; reincidência invalida", async () => {
    const g = await as(U.GESTOR);
    const w = await wcreate(g, "Impermeabilização de banheiro", "Infiltração no apartamento 301", { origin_type: "EMAIL", origin_ref: "ciclo-garantia" });
    let v = w.rowVersion;
    v = (await wtrans(g, w.id, "EM_VISTORIA", v)).rowVersion;
    v = (await wtrans(g, w.id, "EM_ANALISE", v)).rowVersion;
    await rejects(wtrans(g, w.id, "COBERTA", v, J), /EVIDENCE_REQUIRED/, "cobertura exige evidência");
    const evCob = await addEvidence(g, { warranty: w.id, cls: "NC_COMPROVADA", type: "DOCUMENTO", ref: "laudo-vistoria-301" });
    await rejects(wtrans(g, w.id, "COBERTA", v, null, [evCob]), /JUSTIFICATION_REQUIRED/, "cobertura exige justificativa");
    v = (await wtrans(g, w.id, "COBERTA", v, "Defeito de execução dentro do prazo de garantia da construtora.", [evCob])).rowVersion;
    v = (await wtrans(g, w.id, "EM_REPARO", v)).rowVersion;
    await rejects(wtrans(g, w.id, "REPARADA", v), /REPAIR_RECORD_REQUIRED/, "reparada sem reparo registrado");
    await g.query("insert into public.quality_warranty_repairs (project_id,warranty_case_id,executed_at,description,actual_cost) values ($1,$2,now(),'Refazer manta',900)", [PA, w.id]);
    v = (await wtrans(g, w.id, "REPARADA", v)).rowVersion;
    await rejects(wtrans(g, w.id, "ENCERRADA", v, J), /INVALID_TRANSITION/, "reparada não encerra");
    await rejects(wtrans(g, w.id, "VERIFICADA", v, J), /EFFECTIVENESS_VERIFICATION_REQUIRED/, "verificação obrigatória");
    const evVer = await addEvidence(g, { warranty: w.id, cls: "NC_COMPROVADA", ref: "teste-estanqueidade-301" });
    await g.query("insert into public.quality_effectiveness_verifications (project_id,warranty_case_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','teste de estanqueidade por 72h',$3)", [PA, w.id, evVer]);
    v = (await wtrans(g, w.id, "VERIFICADA", v, J)).rowVersion;
    await rejects(wtrans(g, w.id, "ENCERRADA", v, J), /CUSTOMER_ACCEPTANCE_REQUIRED/, "aceite do cliente obrigatório");
    await g.query("update public.quality_warranty_cases set accepted_at=now(), accepted_by_name='Cliente Sintético' where id=$1", [w.id]);
    v = (await wRow(w.id)).row_version;
    const rdy = await rpc(g, "select public.quality_alert_resolved_guard('WARRANTY',$1) as r", [w.id]);
    eq([rdy.alertResolutionClosesEntity, rdy.closureReady], [false, true], "guarda de alerta (garantia)");
    eq((await wtrans(g, w.id, "ENCERRADA", v, "Aceite do cliente registrado após reinspeção.")).to, "ENCERRADA", "encerrada");
    ok((await wRow(w.id)).closed_at, "closed_at");
    // reabertura exige justificativa+evidência e invalida a verificação anterior
    const evRe = await addEvidence(g, { warranty: w.id, cls: "INDICIO", ref: "reclamacao-2-301" });
    v = (await wRow(w.id)).row_version;
    v = (await wtrans(g, w.id, "REABERTA", v, "Cliente relatou nova infiltração.", [evRe])).rowVersion;
    v = (await wtrans(g, w.id, "EM_VISTORIA", v)).rowVersion;
    v = (await wtrans(g, w.id, "EM_ANALISE", v)).rowVersion;
    v = (await wtrans(g, w.id, "COBERTA", v, "Reincidência dentro da garantia.", [evRe])).rowVersion;
    v = (await wtrans(g, w.id, "EM_REPARO", v)).rowVersion;
    v = (await wtrans(g, w.id, "REPARADA", v)).rowVersion;
    await rejects(wtrans(g, w.id, "VERIFICADA", v, J), /VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN/, "verificação anterior vencida");
    eq((await wRow(w.id)).reopen_count, 1, "contador de reabertura");
  });

  await check("garantia: estados/permissões e verificação fora do estado; sem DELETE; edição direta limitada por coluna", async () => {
    const g = await as(U.GESTOR);
    const w = await wcreate(g, "Esquadrias", "Folga em janela", { origin_type: "MANUAL", origin_ref: "gar-perm" });
    await rejects(wtrans(await as(U.COLAB), w.id, "CANCELADA", w.rowVersion, J), /FORBIDDEN/, "colaborador cancela");
    await rejects(g.query("update public.quality_warranty_cases set state='ENCERRADA' where id=$1", [w.id]), /permission denied/i, "estado direto");
    await rejects(g.query("update public.quality_warranty_cases set criticality='LOW' where id=$1", [w.id]), /permission denied/i, "criticidade direta");
    await rejects(g.query("delete from public.quality_warranty_cases where id=$1", [w.id]), /permission denied/i, "delete");
    const ev = await addEvidence(g, { warranty: w.id });
    await rejects(g.query("insert into public.quality_effectiveness_verifications (project_id,warranty_case_id,result,criteria,evidence_id) values ($1,$2,'EFICAZ','critério de eficácia',$3)", [PA, w.id, ev]), /VERIFICATION_STATE_INVALID/, "verificação fora de REPARADA");
    await g.query("update public.quality_warranty_cases set actual_cost=250.00, supplier_name='Esquadrias SA' where id=$1", [w.id]);
    eq(Number((await wRow(w.id)).actual_cost), 250, "custo realizado editável");
  });

  // ======================= privilégios =======================
  await check("privilégios: anon sem EXECUTE/SELECT; funções internas (core, next_code) não expostas a authenticated; RLS ativo em todas as tabelas quality_*", async () => {
    const anon = await as(null, "anon");
    await rejects(anon.query("select * from public.quality_ncrs"), /permission denied/i, "anon lê");
    await rejects(anon.query("select public.quality_closure_readiness('NCR',gen_random_uuid())"), /permission denied/i, "anon readiness");
    const auth = await as(U.GESTOR);
    await rejects(auth.query("select public.quality_transition_core('NCR',gen_random_uuid(),'TRIAGEM',1,null,null,null)"), /permission denied/i, "core direto");
    await rejects(auth.query("select public.quality_next_code($1,'RNC')", [PA]), /permission denied/i, "next_code direto");
    await rejects(auth.query("select * from public.quality_counters"), /row-level security|0 rows|permission/i, "contadores").catch(async () => {
      eq((await auth.query("select * from public.quality_counters")).rowCount, 0, "contadores invisíveis");
    });
    const bad = (await su.query("select relname from pg_class where relname like 'quality\\_%' and relkind='r' and not relrowsecurity")).rows;
    eq(bad, [], "tabelas sem RLS");
    // 18 tabelas da fase 1 + as acrescentadas depois (Fase 3/E: quality_warranty_coverage_opinions); a RLS de TODAS já foi conferida acima.
    ok((await su.query("select count(*)::int n from pg_class where relname like 'quality\\_%' and relkind='r'")).rows[0].n >= 18, "ao menos 18 tabelas quality_*");
  });
} finally {
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
