// FASE 4 / B — Garantias (aceite informado x comprovado) + Seguros (coerência, fundamentação, fonte, consolidação, cobertura específica, RCC,
// identificação) em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base descartável (acc_f4b_*, apagada no fim),
// identidade por claims JWT (request.jwt.claims + set role) e dados 100% SINTÉTICOS. Cobre 31, 33, 35, 36, 37, 38, 39 e os 'CASO F4-B-Rnn'.
// NÃO roda no CI. Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-f4b-garantias-seguros-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
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
const I = await import("../apps/web/lib/insurance/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^202611251\d{5}_|^202611252\d{5}_/.test(f));
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
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" && !(v instanceof Date) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const eq = (a, b, m) => { if (JSON.stringify(sortKeys(a)) !== JSON.stringify(sortKeys(b))) throw new Error(`${m}: esperado ${JSON.stringify(sortKeys(b))}, obtido ${JSON.stringify(sortKeys(a))}`); };
async function rejects(promise, pattern, label) {
  try { await promise; } catch (e) { ok(pattern.test(e.message), `${label}: erro inesperado: ${e.message}`); return; }
  throw new Error(`${label}: esperava erro ${pattern}, mas a operação passou`);
}
const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security|REFERENCE_OUT_OF_PROJECT|NOT_FOUND/i;

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f4b_${Date.now().toString(36)}`;
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
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 4/B reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(4200 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000042a0";
  const PB = "10000000-0000-4000-8000-0000000042b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, PENDENTE: 7, ADMINB: 8, GESTORB: 9 };
  const email = (n) => `f4b-${n}@exemplo.invalid`;
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), email(n)]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F4B Pessoa ${n}`, email(n)]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F4A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F4B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await mem(PB, U.GESTORB, "GESTOR");
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [PA, `f4b-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);
  // Interação Fase 4/A x 4/B: parecer COBERTA/NAO_COBERTA (TECNICO_RESPONSAVEL), decisão de sinistro (JURIDICO) e aprovação de minuta (SEGUROS/JURIDICO)
  // agora exigem competência registrada. Este teste verifica as regras de B, então as fixtures concedem as competências a quem decide (carga de
  // manutenção como superusuário, marcada 'fixture-direto'; a concessão pela RPC e a autorização negativa por competência são provadas em test-competencias-realpg).
  for (const n of [U.ADMIN, U.GESTOR, U.GERENTE]) {
    for (const comp of ["TECNICO_RESPONSAVEL", "JURIDICO", "SEGUROS"]) {
      await su.query("insert into public.project_competences (project_id,user_id,competence,valid_from,granted_by,basis_note) values ($1,$2,$3,'2025-01-01',$4,'fixture-direto')", [PA, uid(n), comp, uid(n === U.ADMIN ? U.GESTOR : U.ADMIN)]);
    }
  }

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
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const TODAY = new Date().toISOString().slice(0, 10);
  const PROFILES = [
    ["LEITURA", U.LEITURA, "authenticated", 1], ["COLABORADOR", U.COLAB, "authenticated", 2], ["GESTOR", U.GESTOR, "authenticated", 3], ["GERENTE", U.GERENTE, "authenticated", 3],
    ["ADMINISTRADOR", U.ADMIN, "authenticated", 4], ["inativo", U.INATIVO, "authenticated", 0], ["convite pendente", U.PENDENTE, "authenticated", 0],
    ["outro projeto", U.ADMINB, "authenticated", 0], ["anon", null, "anon", 0], ["authenticated sem sub", null, "authenticated", 0],
  ];
  /** Para cada perfil, a chamada deve passar se o rank >= exigido e ser recusada (DENIED) caso contrário. */
  async function matrix(label, needRank, make, call) {
    for (const [name, n, role, rank] of PROFILES) {
      const c = await as(n, role, true);
      const x = await make();
      if (rank >= needRank) { await call(c, x); } else { await rejects(call(c, x), DENIED, `${label}: ${name} deveria ser recusado`); }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // GARANTIAS — aceite informado x comprovado
  // ---------------------------------------------------------------------------------------------------------------
  const mkWar = async (c, data = {}) => rpc(c ?? await as(U.GESTOR), "quality_warranty_create", PA, "Pintura interna", "Descascamento de tinta com bolhas", JSON.stringify({ origin_type: "EMAIL", origin_ref: `w-${uniq()}`, ...data }));
  const ev = async (c, { warranty = null, cls = "NC_COMPROVADA", epi = "FATO", type = "DOCUMENTO", ref, project = PA } = {}) =>
    (await rpc(c ?? await as(U.GESTOR), "quality_evidence_register", project, type, ref ?? `ev-${uniq()}`, cls, epi, null, warranty)).id;
  const wRow = async (id) => (await su.query("select * from public.quality_warranty_cases where id=$1", [id])).rows[0];
  const wtrans = (c, id, to, ver, just = null, evs = null) => rpc(c, "quality_warranty_transition", id, to, ver, just, evs);
  const REPAIR_AT = "2026-11-05T12:00:00Z";
  async function warUntil(target) {
    const g = await as(U.GESTOR);
    const w = await mkWar(g);
    let v = w.rowVersion;
    for (const s of ["EM_VISTORIA", "EM_ANALISE", "COBERTA", "EM_REPARO", "REPARADA", "VERIFICADA"]) {
      if (s === "COBERTA") { const e = await ev(g, { warranty: w.id }); v = (await wtrans(g, w.id, s, v, "Defeito de execução dentro do prazo.", [e])).rowVersion; }
      else if (s === "REPARADA") {
        await rpc(g, "quality_warranty_repair_register", w.id, "Refazer manta de impermeabilização", REPAIR_AT, null, 900, 900, "nf-123", false, null);
        v = (await wtrans(g, w.id, s, v)).rowVersion;
      } else if (s === "VERIFICADA") {
        const e = await ev(g, { warranty: w.id, ref: `teste-${uniq()}` });
        await rpc(g, "quality_verification_register", null, w.id, (await wRow(w.id)).row_version, "EFICAZ", "teste de estanqueidade por 72h", e, null, null);
        v = (await wtrans(g, w.id, s, (await wRow(w.id)).row_version, "Reparo verificado com ensaio de estanqueidade.")).rowVersion;
      } else v = (await wtrans(g, w.id, s, v)).rowVersion;
      if (s === target) break;
    }
    return { id: w.id };
  }
  const CONTACT = "Maria.Cliente@cliente.exemplo.invalid";
  const prove = (c, wId, o = {}) => rpc(c, "quality_warranty_acceptance_prove", wId, o.version ?? undefined, o.at ?? TODAY, o.name ?? "Maria Cliente", o.org ?? "Cliente Exemplo SA", o.contact ?? CONTACT, o.evidence, "hash" in o ? o.hash : sha("e-mail sintético do cliente"), o.note ?? null);
  const proveNow = async (c, wId, o = {}) => prove(c, wId, { ...o, version: o.version ?? (await wRow(wId)).row_version });

  await check("CASO F4-B-R01 / 36) aceite do cliente: INFORMADO não encerra; só o COMPROVADO (evidência + hash + manifestante externo) libera; histórico append-only; ciclo", async () => {
    const g = await as(U.GESTOR);
    const w = await warUntil("VERIFICADA");
    const evEmail = await ev(g, { warranty: w.id, type: "EMAIL", ref: `msg-${uniq()}` });
    const evFoto = await ev(g, { warranty: w.id, type: "SSMA_FOTO", ref: `foto-${uniq()}` });
    const evInf = await ev(g, { warranty: w.id, type: "EMAIL", cls: "INDICIO", epi: "INFERENCIA", ref: `inf-${uniq()}` });
    const other = await mkWar(g);
    const evOther = await ev(g, { warranty: other.id, type: "EMAIL", ref: `outro-${uniq()}` });
    const ver = async () => (await wRow(w.id)).row_version;
    await rejects(wtrans(g, w.id, "ENCERRADA", await ver(), J), /CUSTOMER_ACCEPTANCE_REQUIRED/, "sem aceite algum");

    // ---- INFORMADO (lançamento interno) ----
    const inf = await rpc(g, "quality_warranty_acceptance_register", w.id, await ver(), "2026-11-10", "Cliente Informado", evEmail);
    eq(inf.kind, "INFORMADO", "kind informado");
    let row = await wRow(w.id);
    eq([row.acceptance_status, row.accepted_by_name], ["INFORMADO", "Cliente Informado"], "status informado");
    await rejects(wtrans(g, w.id, "ENCERRADA", await ver(), J), /CUSTOMER_ACCEPTANCE_NOT_PROVEN/, "aceite apenas informado não encerra");
    eq((await rpc(g, "quality_closure_readiness", "WARRANTY", w.id)).blockers.includes("CUSTOMER_ACCEPTANCE_NOT_PROVEN"), true, "prontidão aponta o bloqueio");

    // ---- COMPROVADO: negativas ----
    const p = (o) => proveNow(g, w.id, { evidence: evEmail, ...o });
    await rejects(proveNow(await as(U.COLAB), w.id, { evidence: evEmail }), /FORBIDDEN/, "COLABORADOR");
    await rejects(proveNow(await as(U.LEITURA), w.id, { evidence: evEmail }), /FORBIDDEN/, "LEITURA");
    await rejects(proveNow(await as(U.INATIVO), w.id, { evidence: evEmail }), /FORBIDDEN/, "inativo");
    await rejects(proveNow(await as(U.PENDENTE), w.id, { evidence: evEmail }), /FORBIDDEN/, "convite pendente");
    await rejects(proveNow(await as(U.ADMINB), w.id, { evidence: evEmail }), /FORBIDDEN/, "ADMIN de outro projeto (CASO 39)");
    await rejects(proveNow(await as(null, "anon"), w.id, { evidence: evEmail }), /AUTH_REQUIRED|permission denied/, "anon");
    await rejects(proveNow(await as(null, "authenticated"), w.id, { evidence: evEmail }), /AUTH_REQUIRED|FORBIDDEN/, "authenticated sem sub");
    await rejects(prove(g, w.id, { evidence: evEmail, version: 1 }), /VERSION_CONFLICT/, "versão antiga (CASO 38)");
    await rejects(prove(g, w.id, { evidence: evEmail, version: null }), /VERSION_REQUIRED/, "versão ausente");
    await rejects(p({ hash: "abc" }), /SOURCE_HASH_REQUIRED/, "hash curto");
    await rejects(p({ hash: "z".repeat(64) }), /SOURCE_HASH_REQUIRED/, "hash não hexadecimal");
    await rejects(p({ hash: null }), /SOURCE_HASH_REQUIRED/, "sem hash");
    await rejects(p({ contact: "sem-arroba" }), /MANIFESTANT_CONTACT_REQUIRED/, "contato inválido");
    await rejects(p({ contact: email(U.GESTOR) }), /MANIFESTANT_IS_INTERNAL/, "e-mail do próprio registrante");
    await rejects(p({ contact: email(U.COLAB) }), /MANIFESTANT_IS_INTERNAL/, "e-mail de membro ativo do projeto");
    const myName = (await su.query("select name from public.profiles where id=$1", [uid(U.GESTOR)])).rows[0].name;
    await rejects(p({ name: `  ${myName.toUpperCase()}  ` }), /MANIFESTANT_IS_INTERNAL/, "nome do próprio registrante (normalizado)");
    await rejects(p({ name: "A" }), /INVALID_DATA/, "nome curto");
    await rejects(p({ at: "2099-01-01" }), /INVALID_DATA/, "data futura");
    await rejects(p({ at: "2026-11-01" }), /ACCEPTANCE_BEFORE_REPAIR/, "manifestação anterior ao reparo");
    await rejects(p({ evidence: null }), /EVIDENCE_REQUIRED/, "sem evidência");
    await rejects(p({ evidence: evFoto }), /EVIDENCE_INVALID/, "foto SSMA não prova aceite");
    await rejects(p({ evidence: evInf }), /EVIDENCE_INVALID/, "inferência não prova aceite");
    await rejects(p({ evidence: evOther }), /EVIDENCE_INVALID/, "evidência de outro caso");
    await rejects(rpc(g, "quality_warranty_acceptance_prove", other.id, (await wRow(other.id)).row_version, TODAY, "Maria Cliente", null, CONTACT, evOther, sha("x"), null), /INVALID_STATE/, "caso ainda ABERTO");
    eq((await wRow(w.id)).acceptance_status, "INFORMADO", "recusas não alteram o caso");
    eq(await nq("select count(*)::int n from public.quality_warranty_acceptances where warranty_case_id=$1", [w.id]), 1, "recusas não deixam registro de prova");

    // ---- COMPROVADO: sucesso ----
    const auditBefore = await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_WARRANTY_ACCEPTANCE' and entity_id=$1", [w.id]);
    const hash = sha("e-mail sintético do cliente");
    const proven = await p({ hash, note: "e-mail de aceite recebido" });
    eq([proven.kind, proven.ok], ["COMPROVADO", true], "retorno");
    row = await wRow(w.id);
    eq([row.acceptance_status, row.accepted_by_name, row.accepted_evidence_id], ["COMPROVADO", "Maria Cliente", evEmail], "estado do caso");
    const hist = (await su.query("select * from public.quality_warranty_acceptances where warranty_case_id=$1 order by created_at, kind", [w.id])).rows;
    eq(hist.map((h) => h.kind).sort(), ["COMPROVADO", "INFORMADO"], "histórico preserva informado e comprovado");
    const cp = hist.find((h) => h.kind === "COMPROVADO");
    eq([cp.source_hash, cp.manifestant_contact, cp.manifestant_organization, cp.evidence_source_ref.startsWith("msg-"), cp.supersedes_id, cp.created_by], [hash, CONTACT.toLowerCase(), "Cliente Exemplo SA", true, hist.find((h) => h.kind === "INFORMADO").id, uid(U.GESTOR)], "campos da prova");
    eq(row.current_acceptance_id, cp.id, "ponteiro do aceite vigente");
    eq(await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_WARRANTY_ACCEPTANCE' and entity_id=$1", [w.id]), auditBefore + 1, "auditoria do aceite comprovado");
    const aud = JSON.parse((await su.query("select detail from public.audit_log_entries where action='QUALITY_WARRANTY_ACCEPTANCE' and entity_id=$1 order by created_at desc limit 1", [w.id])).rows[0].detail);
    eq([aud.kind, aud.sourceHash, aud.manifestantContact, aud.acceptanceId], ["COMPROVADO", hash, CONTACT.toLowerCase(), cp.id], "auditoria com hash e manifestante");
    await rejects(rpc(g, "quality_warranty_acceptance_register", w.id, await ver(), "2026-11-12", "Interno de novo", evEmail), /ACCEPTANCE_ALREADY_PROVEN/, "lançamento interno não substitui o comprovado");
    await rejects(p({}), /ACCEPTANCE_ALREADY_PROVEN/, "comprovar de novo no mesmo ciclo");
    // histórico append-only e sem exclusão (nem superusuário)
    await rejects(su.query("update public.quality_warranty_acceptances set accepted_by_name='x' where id=$1", [cp.id]), /F4B_APPEND_ONLY/, "update");
    await rejects(su.query("delete from public.quality_warranty_acceptances where id=$1", [cp.id]), /F4B_APPEND_ONLY|F4B_NO_DELETE/, "delete");
    await rejects(su.query("truncate public.quality_warranty_acceptances"), /F4B_NO_DELETE|F4B_APPEND_ONLY|cannot truncate/, "truncate");
    // a evidência do aceite fica travada
    await rejects(rpc(g, "quality_evidence_revise", evEmail, 1, "SUSPEITA", "FATO", null, J), /EVIDENCE_LOCKED|VERSION_CONFLICT/, "evidência do aceite travada");

    // ---- encerramento e reabertura (novo ciclo) ----
    const done = await wtrans(g, w.id, "ENCERRADA", await ver(), "Aceite comprovado do cliente registrado.");
    eq(done.to, "ENCERRADA", "encerrada com aceite comprovado");
    const rep = await rpc(g, "quality_closure_integrity_report", PA);
    ok(!JSON.stringify(rep.violations).includes(w.id), "relatório de integridade não acusa a garantia encerrada");
    const eRe = await ev(g, { warranty: w.id, cls: "INDICIO", ref: `reabre-${uniq()}` });
    await wtrans(g, w.id, "REABERTA", await ver(), J, [eRe]);
    row = await wRow(w.id);
    eq([row.acceptance_status, row.current_acceptance_id, row.accepted_at, row.accepted_by_name], ["NENHUM", null, null, null], "reabertura inicia novo ciclo sem aceite");
    eq(await nq("select count(*)::int n from public.quality_warranty_acceptances where warranty_case_id=$1", [w.id]), 2, "histórico do ciclo anterior permanece");
  });

  await check("CASO F4-B-R02 / 35) 'comprovado' nunca nasce por atalho: UPDATE direto, superusuário e INSERT forjados barrados; legado já encerrado continua válido; legado aberto não encerra", async () => {
    const g = await as(U.GESTOR);
    const w = await warUntil("VERIFICADA");
    const forged = await suAs(U.GESTOR);
    await rejects(forged.query("update public.quality_warranty_cases set acceptance_status='COMPROVADO' where id=$1", [w.id]), /ACCEPTANCE_PROOF_REQUIRED/, "status comprovado sem prova");
    await rejects(su.query("update public.quality_warranty_cases set acceptance_status='COMPROVADO' where id=$1", [w.id]), /ACCEPTANCE_PROOF_REQUIRED/, "superusuário sem prova");
    // prova INFORMADA não vira comprovada
    const e = await ev(g, { warranty: w.id, type: "EMAIL", ref: `m-${uniq()}` });
    await rpc(g, "quality_warranty_acceptance_register", w.id, (await wRow(w.id)).row_version, "2026-11-10", "Cliente", e);
    await rejects(su.query("update public.quality_warranty_cases set acceptance_status='COMPROVADO' where id=$1", [w.id]), /ACCEPTANCE_PROOF_REQUIRED/, "ponteiro aponta registro INFORMADO");
    await rejects(su.query("insert into public.quality_warranty_acceptances (project_id,warranty_case_id,kind,accepted_at,accepted_by_name,case_row_version,created_by) values ($1,$2,'COMPROVADO',current_date,'Fulano',1,$3)", [PA, w.id, uid(U.GESTOR)]), /check|violates/i, "COMPROVADO sem evidência/hash/contato (CHECK)");
    await rejects(su.query("insert into public.quality_warranty_cases (project_id,code,service_system,defect_description,acceptance_status) values ($1,'GAR-F4B1','pintura','defeito','COMPROVADO')", [PA]), /STATE_GUARD/, "garantia nasce sem aceite");
    await rejects(su.query("update public.quality_warranty_cases set acceptance_status='XPTO' where id=$1", [w.id]), /check|violates/i, "status inválido");
    // legado: garantia ENCERRADA antes da regra (aceite sem classificação) segue consistente; legado em caso ABERTO não encerra
    const legacyClosed = await warUntil("VERIFICADA");
    await su.query("set session_replication_role = replica");
    await su.query("update public.quality_warranty_cases set state='ENCERRADA', closed_at=now(), accepted_at=now(), accepted_by_name='Cliente legado' where id=$1", [legacyClosed.id]);
    await su.query("set session_replication_role = origin");
    const rep = await rpc(g, "quality_closure_integrity_report", PA);
    ok(!JSON.stringify(rep.violations).includes(legacyClosed.id), "legado já encerrado não é violação");
    const legacyOpen = await warUntil("VERIFICADA");
    await su.query("set session_replication_role = replica");
    await su.query("update public.quality_warranty_cases set accepted_at=now(), accepted_by_name='Cliente legado aberto' where id=$1", [legacyOpen.id]);
    await su.query("set session_replication_role = origin");
    await rejects(wtrans(g, legacyOpen.id, "ENCERRADA", (await wRow(legacyOpen.id)).row_version, J), /CUSTOMER_ACCEPTANCE_NOT_PROVEN/, "legado em caso aberto exige novo aceite comprovado");
    // sem NENHUM legado (sem accepted_at) o bloqueio é REQUIRED
    const semAceite = await warUntil("VERIFICADA");
    await rejects(wtrans(g, semAceite.id, "ENCERRADA", (await wRow(semAceite.id)).row_version, J), /CUSTOMER_ACCEPTANCE_REQUIRED/, "sem aceite");
  });

  await check("CASO F4-B-R03 / 38 / 39 / 37) aceite: concorrência (um vence), isolamento por projeto/RLS, anon e escrita direta negados", async () => {
    const g = await as(U.GESTOR);
    const w = await warUntil("VERIFICADA");
    const e = await ev(g, { warranty: w.id, type: "DOCUMENTO", ref: `ata-${uniq()}` });
    const v = (await wRow(w.id)).row_version;
    const a = await as(U.GESTOR, "authenticated", true);
    const b = await as(U.GERENTE, "authenticated", true);
    const res = await Promise.allSettled([
      prove(a, w.id, { evidence: e, version: v, contact: "a@cliente.exemplo.invalid" }),
      prove(b, w.id, { evidence: e, version: v, contact: "b@cliente.exemplo.invalid", name: "Outro Cliente" }),
    ]);
    eq(res.filter((r) => r.status === "fulfilled").length, 1, "uma transição vence");
    ok(res.some((r) => r.status === "rejected" && /VERSION_CONFLICT|ACCEPTANCE_ALREADY_PROVEN/.test(r.reason.message)), "a outra falha com erro claro");
    eq(await nq("select count(*)::int n from public.quality_warranty_acceptances where warranty_case_id=$1 and kind='COMPROVADO'", [w.id]), 1, "um único aceite comprovado");
    // isolamento (CASO 39)
    eq(await nq("select count(*)::int n from public.quality_warranty_acceptances"), await nq("select count(*)::int n from public.quality_warranty_acceptances where project_id=$1", [PA]), "só há registros do projeto A neste banco");
    const adminB = await as(U.ADMINB);
    eq((await adminB.query("select id from public.quality_warranty_acceptances")).rowCount, 0, "RLS: projeto B não lê aceites de A");
    eq((await (await as(U.LEITURA)).query("select id from public.quality_warranty_acceptances where warranty_case_id=$1", [w.id])).rowCount, 1, "LEITURA lê o histórico do próprio projeto");
    await rejects(rpc(adminB, "quality_warranty_acceptances_list", w.id), /FORBIDDEN/, "listagem de outro projeto");
    eq((await rpc(await as(U.LEITURA), "quality_warranty_acceptances_list", w.id)).length, 1, "listagem do próprio projeto");
    await rejects((await as(null, "anon")).query("select id from public.quality_warranty_acceptances"), /permission denied/, "anon não lê");
    for (const role of [[U.GESTOR, "authenticated"], [U.ADMIN, "authenticated"], [null, "anon"]]) {
      const c = await as(role[0], role[1]);
      await rejects(c.query("insert into public.quality_warranty_acceptances (project_id,warranty_case_id,kind,accepted_at,accepted_by_name,case_row_version,created_by) values ($1,$2,'INFORMADO',current_date,'Fulano',1,$3)", [PA, w.id, uid(U.GESTOR)]), /permission denied|row-level security/, "INSERT direto negado");
    }
    await rejects((await as(U.ADMIN)).query("update public.quality_warranty_cases set acceptance_status='NENHUM' where id=$1", [w.id]), /permission denied|row-level security|F4B|STATE_GUARD/, "UPDATE direto do caso continua revogado");
    eq(await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_WARRANTY_ACCEPTANCE' and entity_id=$1 and detail like '%COMPROVADO%'", [w.id]), 1, "auditoria do aceite (CASO 37)");
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SEGUROS — base de dados
  // ---------------------------------------------------------------------------------------------------------------
  const doc = async (project, title) => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [project, title])).rows[0].id;
  const D1 = await doc(PA, "Apólice A (sintético)");
  const DB = await doc(PB, "Documento da obra B");
  const POL = { modality: "SEGURO_GARANTIA_EXECUTANTE", insurer_name: "Seguradora Sintética SA", policy_number: "SINT-001", source_document_id: D1, coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000, status: "VIGENTE" };
  const mkPolicy = async (extra = {}) => rpc(await as(U.ADMIN), "insurance_policy_create", PA, JSON.stringify({ ...POL, ...extra }));
  const pRow = async (id) => (await su.query("select * from public.insurance_policies where id=$1", [id])).rows[0];
  const mkDraft = async (pol, extra = {}) => rpc(await as(U.ADMIN), "insurance_draft_create", PA, JSON.stringify({ draft_kind: "AVISO_SINISTRO", policy_id: pol.id, subject: "Aviso de sinistro (minuta)", body: "Prezados, comunicamos formalmente o evento descrito no dossiê, para as providências cabíveis, em 01/12/2026.", ...extra }));
  const TERMS = { insured_name: "Construtora Alfa Ltda", insured_tax_id: "11.222.333/0001-81", beneficiary_name: "Incorporadora Beta SA", beneficiary_tax_id: "12.345.678/0001-95", object_text: "Edifício comercial, Fase 1", coverage_start: "2026-01-01", coverage_end: "2027-01-01", insured_amount: 1000000, guaranteed_obligation: "Execução da obra conforme contrato" };
  const saveTerms = (c, pol, kind, draftId, o = {}) => rpc(c, "insurance_instrument_terms_save", pol.id, kind, draftId, JSON.stringify({ ...TERMS, source_ref: `${kind}-sint p.1`, ...o }));
  const saveAll = async (pol, d, m = {}, a = {}, c = {}) => {
    const g = await as(U.GESTOR);
    await saveTerms(g, pol, "CONTRATO", null, c);
    await saveTerms(g, pol, "APOLICE", null, a);
    await saveTerms(await as(U.COLAB), pol, "MINUTA", d.id, m);
  };
  const approve = async (d) => rpc(await as(U.ADMIN), "insurance_draft_approve", d.id, (await su.query("select row_version from public.insurance_drafts where id=$1", [d.id])).rows[0].row_version, "APROVO O CONTEUDO PARA ENVIO");
  const check1 = async (pol, d) => rpc(await as(U.LEITURA), "insurance_coherence_check", pol.id, d.id);

  await check("CASO F4-B-R04 / 31 / 39) termos dos instrumentos: níveis por papel (contrato/apólice = gestão; minuta = registro), fonte obrigatória, append-only, isolamento", async () => {
    const pol = await mkPolicy();
    const d = await mkDraft(pol);
    await matrix("terms CONTRATO", 3, async () => pol, (c, p) => saveTerms(c, p, "CONTRATO", null));
    await matrix("terms APOLICE", 3, async () => pol, (c, p) => saveTerms(c, p, "APOLICE", null));
    await matrix("terms MINUTA", 2, async () => pol, (c, p) => saveTerms(c, p, "MINUTA", d.id));
    const g = await as(U.GESTOR);
    await rejects(rpc(g, "insurance_instrument_terms_save", pol.id, "CONTRATO", null, JSON.stringify({ ...TERMS })), /SOURCE_REQUIRED/, "sem fonte");
    await rejects(rpc(g, "insurance_instrument_terms_save", pol.id, "CONTRATO", null, JSON.stringify({ source_ref: "x" })), /check|violates/i, "termos vazios (sem nenhum valor)");
    await rejects(rpc(g, "insurance_instrument_terms_save", pol.id, "OUTRO", null, JSON.stringify({ ...TERMS, source_ref: "x" })), /INVALID_INPUT/, "tipo inválido");
    await rejects(rpc(g, "insurance_instrument_terms_save", pol.id, "MINUTA", null, JSON.stringify({ ...TERMS, source_ref: "x" })), /INVALID_INPUT|check|violates/i, "minuta sem id");
    await rejects(rpc(g, "insurance_instrument_terms_save", pol.id, "CONTRATO", d.id, JSON.stringify({ ...TERMS, source_ref: "x" })), /INVALID_INPUT|check|violates/i, "contrato com minuta");
    await rejects(rpc(g, "insurance_instrument_terms_save", pol.id, "CONTRATO", null, JSON.stringify({ ...TERMS, source_document_id: DB })), /REFERENCE_OUT_OF_PROJECT/, "documento de outro projeto");
    const other = await mkPolicy({ policy_number: "OUTRA" });
    const dOther = await mkDraft(other);
    await rejects(rpc(await as(U.COLAB), "insurance_instrument_terms_save", pol.id, "MINUTA", dOther.id, JSON.stringify({ ...TERMS, source_ref: "x" })), /INVALID_INPUT/, "minuta de outra apólice");
    await rejects(rpc(await as(U.ADMINB), "insurance_instrument_terms_save", pol.id, "CONTRATO", null, JSON.stringify({ ...TERMS, source_ref: "x" })), /FORBIDDEN/, "outro projeto");
    // append-only
    const id = (await su.query("select id from public.insurance_instrument_terms where policy_id=$1 limit 1", [pol.id])).rows[0].id;
    await rejects(su.query("update public.insurance_instrument_terms set object_text='x' where id=$1", [id]), /F4B_APPEND_ONLY/, "update");
    await rejects(su.query("delete from public.insurance_instrument_terms where id=$1", [id]), /F4B_APPEND_ONLY|F4B_NO_DELETE/, "delete");
    eq((await (await as(U.ADMINB)).query("select id from public.insurance_instrument_terms")).rowCount, 0, "RLS: outro projeto não lê os termos");
    eq((await (await as(U.LEITURA)).query("select id from public.insurance_instrument_terms where policy_id=$1", [pol.id])).rowCount >= 3, true, "LEITURA lê os termos do projeto");
    await rejects((await as(U.ADMIN)).query("insert into public.insurance_instrument_terms (project_id,policy_id,source_kind,object_text,source_ref,created_by) values ($1,$2,'CONTRATO','x','y',$3)", [PA, pol.id, uid(U.ADMIN)]), /permission denied|row-level security/, "escrita direta negada");
  });

  await check("CASO F4-B-R05) coerência minuta x apólice x contrato: aprovação bloqueada sem termos/com divergência; justificativa (texto + fonte) presa aos valores; paridade TS x SQL", async () => {
    const pol = await mkPolicy();
    const d = await mkDraft(pol);
    const adm = await as(U.ADMIN);
    // sem termos: SEM_DADOS e bloqueio
    let chk = await check1(pol, d);
    eq([chk.status, chk.approvalAllowed, chk.missingKinds], ["SEM_DADOS", false, ["CONTRATO", "APOLICE", "MINUTA"]], "sem termos");
    await rejects(approve(d), /COHERENCE_BLOCKED/, "aprovar sem termos");
    // só dois conjuntos: ainda SEM_DADOS
    const g = await as(U.GESTOR);
    await saveTerms(g, pol, "CONTRATO", null);
    await saveTerms(g, pol, "APOLICE", null);
    await rejects(approve(d), /COHERENCE_BLOCKED/, "falta a minuta");
    // coerente
    await saveTerms(await as(U.COLAB), pol, "MINUTA", d.id);
    chk = await check1(pol, d);
    eq([chk.status, chk.approvalAllowed, chk.divergences.length], ["COERENTE", true, 0], "coerente");
    // divergência (nova versão dos termos da minuta; a mais recente vale)
    await saveTerms(await as(U.COLAB), pol, "MINUTA", d.id, { coverage_end: "2027-06-01", insured_amount: 900000 });
    chk = await check1(pol, d);
    eq([chk.status, chk.unjustified, chk.divergences.map((x) => x.field).sort()], ["DIVERGENTE", 2, ["IMPORTANCIA_SEGURADA", "VIGENCIA_FIM"]], "duas divergências");
    await rejects(approve(d), /COHERENCE_BLOCKED/, "divergência sem justificativa");
    // paridade TS x SQL sobre os MESMOS termos
    const rows = (await su.query("select distinct on (source_kind) * from public.insurance_instrument_terms where policy_id=$1 and (draft_id is null or draft_id=$2) order by source_kind, created_at desc, id desc", [pol.id, d.id])).rows;
    const toTerms = (r) => ({ insuredName: r.insured_name, insuredTaxId: r.insured_tax_id, beneficiaryName: r.beneficiary_name, beneficiaryTaxId: r.beneficiary_tax_id, objectText: r.object_text, coverageStart: r.coverage_start ? new Date(r.coverage_start.getTime() - r.coverage_start.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null, coverageEnd: r.coverage_end ? new Date(r.coverage_end.getTime() - r.coverage_end.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null, insuredAmount: r.insured_amount === null ? null : Number(r.insured_amount), guaranteedObligation: r.guaranteed_obligation, source: { ref: r.source_ref } });
    const ts = I.computeCoherence(Object.fromEntries(rows.map((r) => [r.source_kind, toTerms(r)])), new Set(), (s) => createHash("md5").update(s).digest("hex"));
    eq(ts.status, chk.status, "TS e SQL: mesma situação");
    eq(ts.divergences.map((x) => [x.field, x.canonical, x.fingerprint]), chk.divergences.map((x) => [x.field, x.canonical, x.fingerprint]), "TS e SQL: mesmos campos, texto canônico e fingerprint");
    eq(ts.divergences.map((x) => x.values), chk.divergences.map((x) => x.values), "TS e SQL: mesmos valores normalizados");
    // justificar: níveis, texto, fonte, estado
    const just = (c, field, text, ref, doc = null) => rpc(c, "insurance_coherence_justify", d.id, field, text, ref, doc);
    await rejects(just(await as(U.COLAB), "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", "aditivo-2"), /FORBIDDEN/, "COLABORADOR não justifica");
    await rejects(just(await as(U.LEITURA), "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", "aditivo-2"), /FORBIDDEN/, "LEITURA");
    await rejects(just(await as(U.ADMINB), "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", "aditivo-2"), /FORBIDDEN/, "outro projeto");
    await rejects(just(g, "VIGENCIA_FIM", "curta", "aditivo-2"), /JUSTIFICATION_REQUIRED/, "texto curto");
    await rejects(just(g, "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", null), /SOURCE_REQUIRED/, "sem fonte");
    await rejects(just(g, "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", null, DB), /REFERENCE_OUT_OF_PROJECT/, "documento de outro projeto");
    await rejects(just(g, "OBJETO", "Aditivo n. 2 estendeu a vigência da apólice.", "x"), /NOT_DIVERGENT/, "campo sem divergência");
    await rejects(just(g, "SEGURADO", "Aditivo n. 2 estendeu a vigência da apólice.", "x"), /NOT_DIVERGENT/, "segurado coerente");
    await just(g, "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", "aditivo-2");
    await rejects(just(g, "VIGENCIA_FIM", "Aditivo n. 2 estendeu a vigência da apólice.", "aditivo-2"), /ALREADY_JUSTIFIED/, "já justificada");
    chk = await check1(pol, d);
    eq([chk.status, chk.unjustified, chk.justified], ["DIVERGENTE", 1, 1], "uma justificada, uma não");
    await rejects(approve(d), /COHERENCE_BLOCKED/, "ainda há divergência sem justificativa");
    await just(g, "IMPORTANCIA_SEGURADA", "Importância reduzida pelo endosso 3 (conferido).", null, D1);
    chk = await check1(pol, d);
    eq([chk.status, chk.approvalAllowed], ["DIVERGENTE_JUSTIFICADA", true], "tudo justificado");
    // a justificativa está presa aos valores: mudar um valor reabre o bloqueio
    await saveTerms(await as(U.COLAB), pol, "MINUTA", d.id, { coverage_end: "2027-09-01", insured_amount: 900000 });
    chk = await check1(pol, d);
    eq([chk.status, chk.unjustified], ["DIVERGENTE", 1], "valor mudou: justificativa anterior não vale");
    await rejects(approve(d), /COHERENCE_BLOCKED/, "bloqueia de novo");
    await just(g, "VIGENCIA_FIM", "Nova data conforme aditivo n. 4 (carta anexa).", "aditivo-4");
    // aprovação: guardas antigas continuam, auditoria guarda o resultado da coerência, nada é enviado
    await rejects(rpc(adm, "insurance_draft_approve", d.id, (await su.query("select row_version from public.insurance_drafts where id=$1", [d.id])).rows[0].row_version, "ok"), /EXPRESS_CONFIRMATION_REQUIRED/, "confirmação expressa continua exigida");
    await rejects(rpc(await as(U.GESTOR), "insurance_draft_approve", d.id, 1, "APROVO O CONTEUDO PARA ENVIO"), /FORBIDDEN/, "só ADMINISTRADOR aprova");
    const ap = await approve(d);
    eq([ap.state, ap.sent], ["APROVADA_PARA_ENVIO", false], "aprovada, não enviada");
    const aud = (await su.query("select detail from public.insurance_audit_events where entity_id=$1 and action='DRAFT_APPROVED_FOR_SEND'", [d.id])).rows[0].detail;
    eq([aud.coherence.status, aud.realSendPerformed], ["DIVERGENTE_JUSTIFICADA", false], "auditoria da aprovação registra a coerência e o não-envio");
    eq(await nq("select count(*)::int n from public.insurance_audit_events where entity_id=$1 and action='COHERENCE_DIVERGENCE_JUSTIFIED'", [d.id]), 3, "auditoria das justificativas");
    await rejects(just(g, "VIGENCIA_FIM", "Depois de aprovada a minuta não aceita justificativa.", "x"), /INVALID_STATE|NOT_DIVERGENT/, "minuta aprovada não é justificada");
    // minuta sem apólice (fiança) não está sujeita à coerência de apólice
    const bank = await rpc(adm, "bank_guarantee_register", PA, JSON.stringify({ bank_name: "Banco Sintético SA", source_ref: "carta-sint" }));
    const dBank = await rpc(adm, "insurance_draft_create", PA, JSON.stringify({ draft_kind: "COBRANCA_FIANCA", bank_guarantee_id: bank.id, subject: "Cobrança de fiança (minuta)", body: "Prezados, solicitamos as providências cabíveis sobre a fiança em referência, conforme o instrumento." }));
    eq((await approve(dBank)).state, "APROVADA_PARA_ENVIO", "fiança segue sem o portão de apólice");
    // isolamento
    await rejects(rpc(await as(U.ADMINB), "insurance_coherence_check", pol.id, d.id), /FORBIDDEN/, "check em outro projeto");
    await rejects(rpc(await as(null, "anon"), "insurance_coherence_check", pol.id, d.id), /permission denied|AUTH_REQUIRED/, "anon");
    // matriz de leitura
    await matrix("coherence_check READ", 1, async () => pol, (c, p) => rpc(c, "insurance_coherence_check", p.id, null));
  });

  await check("CASO F4-B-R06) normalização e documento fiscal: paridade TS x SQL (texto, parte, CPF/CNPJ) em lote determinístico", async () => {
    let s = 12345;
    const rnd = (n) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
    const dv14 = (base) => { const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const d = [...base].map(Number); let t = d.reduce((a, x, i) => a + x * w1[i], 0); let r = t % 11; d.push(r < 2 ? 0 : 11 - r); t = d.reduce((a, x, i) => a + x * w2[i], 0); r = t % 11; d.push(r < 2 ? 0 : 11 - r); return d.join(""); };
    const dv11 = (base) => { const d = [...base].map(Number); let t = d.reduce((a, x, i) => a + x * (10 - i), 0); let r = (t * 10) % 11; if (r === 10) r = 0; d.push(r); t = d.reduce((a, x, i) => a + x * (11 - i), 0); r = (t * 10) % 11; if (r === 10) r = 0; d.push(r); return d.join(""); };
    const digits = (n) => Array.from({ length: n }, () => rnd(10)).join("");
    const samples = ["", "abc", "11.111.111/0001-11", "00000000000", "00000000000000", "123", "52998224725", "529.982.247-25", "11222333000181", "12.345.678/0001-95"];
    for (let i = 0; i < 120; i += 1) {
      const v = i % 2 ? dv14(digits(12)) : dv11(digits(9));
      samples.push(v, v.slice(0, -1) + String((Number(v.at(-1)) + 1) % 10), v.slice(0, 5) + "." + v.slice(5), `  ${v}  `, v + "0");
    }
    const sqlValid = (await su.query("select x, public.insurance_tax_id_valid(x) as v from unnest($1::text[]) x", [samples])).rows;
    for (const r of sqlValid) eq(r.v, I.isValidTaxId(r.x), `CPF/CNPJ "${r.x}"`);
    ok(sqlValid.filter((r) => r.v).length >= 110, "o lote tem válidos suficientes");
    ok(sqlValid.filter((r) => !r.v).length >= 110, "o lote tem inválidos suficientes");
    const texts = ["Construção  ÁÉÍÓÚ, Ç-ã", "  OBRA Fase-1 (Lote 2) ", "Ação/Reação 100%", "ÀÂÃÄ ÈÊË ÌÎÏ ÒÔÕÖ ÙÛÜ ÇÑ", "", "   ", "São João & Cia. Ltda.", "x", "Edifício comercial, Fase 1", "ñandú"];
    const nt = (await su.query("select x, public.f4b_norm_text(x) as n from unnest($1::text[]) x", [texts])).rows;
    for (const r of nt) eq(r.n, I.normalizeText(r.x), `norm "${r.x}"`);
    const pairs = [["Construtora Alfa", "11222333000181", "CONSTRUTORA ALFA.", null], ["A", "11222333000181", "B", "11.222.333/0001-81"], ["A", "11222333000181", "A", "12345678000195"], ["", null, "", null], [null, null, "x", null], ["Alfa", null, "Alfa", "11222333000181"], ["Ação", "", "acao", ""]];
    for (const [n1, t1, n2, t2] of pairs) {
      const r = (await su.query("select public.f4b_party_equal($1,$2,$3,$4) as e", [n1, t1, n2, t2])).rows[0].e;
      eq(r, I.partyEqual({ name: n1, taxId: t1 }, { name: n2, taxId: t2 }), `parte ${JSON.stringify([n1, t1, n2, t2])}`);
    }
  });

  await check("CASO F4-B-R07 / 21 / 22) identificação de partes: documento válido e obrigatório (identificado), dedupe por documento/nome normalizado, reativação, NAO_IDENTIFICADO explícito, legado preservado", async () => {
    const pol = await mkPolicy();
    const a = await as(U.ADMIN);
    const add = async (data, c = a) => rpc(c, "insurance_policy_party_add", pol.id, (await pRow(pol.id)).row_version, JSON.stringify({ source_ref: "apólice p.2", ...data }));
    await rejects(add({ party_role: "SEGURADO", party_name: "Construtora Alfa Ltda", tax_id: "11.111.111/0001-11" }), /INVALID_TAX_ID/, "CNPJ inválido");
    await rejects(add({ party_role: "SEGURADO", party_name: "Construtora Alfa Ltda" }), /TAX_ID_REQUIRED/, "segurado identificado sem documento");
    await rejects(add({ party_role: "BENEFICIARIO", party_name: "Beta SA" }), /TAX_ID_REQUIRED/, "beneficiário identificado sem documento");
    await rejects(add({ party_role: "PROPRIETARIO_FINAL", party_name: "Dono Final" }), /TAX_ID_REQUIRED/, "proprietário final identificado sem documento");
    const s1 = await add({ party_role: "SEGURADO", party_name: "Construtora Alfa Ltda", tax_id: "11.222.333/0001-81" });
    eq((await su.query("select tax_id_normalized from public.insurance_policy_parties where id=$1", [s1.id])).rows[0].tax_id_normalized, "11222333000181", "documento normalizado (só dígitos)");
    await rejects(add({ party_role: "SEGURADO", party_name: "OUTRO NOME", tax_id: "11222333000181" }), /DUPLICATE_PARTY/, "mesmo documento com formatação diferente");
    await add({ party_role: "BENEFICIARIO", party_name: "Construtora Alfa Ltda", tax_id: "11222333000181" }); // papéis diferentes não duplicam
    await add({ party_role: "TOMADOR", party_name: "Tomadora Gama SA" });
    await rejects(add({ party_role: "TOMADOR", party_name: "TOMADORA  gama sa" }), /DUPLICATE_PARTY/, "mesmo nome normalizado sem documento");
    const nid = await add({ party_role: "PROPRIETARIO_FINAL", identification_status: "NAO_IDENTIFICADO", source_ref: "contrato cl.2" });
    await add({ party_role: "PROPRIETARIO_FINAL", identification_status: "NAO_IDENTIFICADO", source_ref: "contrato cl.3" }); // estado explícito repetível
    ok(nid.id, "NAO_IDENTIFICADO é aceito (sem inventar documento)");
    // reativação não pode recriar duplicidade
    const second = await add({ party_role: "SEGURADO", party_name: "Delta Engenharia SA", tax_id: "12.345.678/0001-95" });
    await rpc(a, "insurance_policy_party_set_active", s1.id, (await pRow(pol.id)).row_version, false, "Segurado substituído por endosso de correção");
    await add({ party_role: "SEGURADO", party_name: "Construtora Alfa Ltda", tax_id: "11222333000181" }); // o antigo está inativo: pode entrar
    await rejects(rpc(a, "insurance_policy_party_set_active", s1.id, (await pRow(pol.id)).row_version, true, "Reativando o segurado antigo por engano"), /DUPLICATE_PARTY/, "reativar duplica");
    ok(second.id, "segundo segurado registrado");
    // legado (linha sem documento normalizado) continua legível e não é alterado
    await su.query("alter table public.insurance_policy_parties disable trigger insurance_party_guard_ins");
    const legacy = (await su.query("insert into public.insurance_policy_parties (project_id,policy_id,party_role,party_name,tax_id,identification_status,source_ref,created_by) values ($1,$2,'SEGURADO','Legado sem doc',null,'IDENTIFICADO','legado',$3) returning id, tax_id_normalized", [PA, pol.id, uid(U.ADMIN)])).rows[0];
    await su.query("alter table public.insurance_policy_parties enable trigger insurance_party_guard_ins");
    eq(legacy.tax_id_normalized, null, "linha legada sem documento permanece");
    const parties = (await su.query("select party_role as role, party_name as name, tax_id, identification_status, active from public.insurance_policy_parties where policy_id=$1", [pol.id])).rows;
    const audit = I.auditPolicySubjects(parties.filter((p) => p.active).map((p) => ({ role: p.role, name: p.name, taxId: p.tax_id, identificationStatus: p.identification_status })));
    ok(audit.findings.some((f) => f.code === "PARTE_SEM_DOCUMENTO_FISCAL"), "a auditoria acusa o segurado legado identificado sem documento");
    // sujeitos esperados: documento inválido
    await rejects(rpc(await as(U.GESTOR), "insurance_expected_subject_save", pol.id, JSON.stringify({ party_role: "SEGURADO", expectation: "ESPERADO", expected_name: "X", expected_tax_id: "11.111.111/0001-11", source_kind: "CONTRATO", source_ref: "contrato" }), 0), /INVALID_TAX_ID/, "documento esperado inválido");
    const okExp = await rpc(await as(U.GESTOR), "insurance_expected_subject_save", pol.id, JSON.stringify({ party_role: "SEGURADO", expectation: "ESPERADO", expected_name: "Construtora Alfa Ltda", expected_tax_id: "11.222.333/0001-81", source_kind: "CONTRATO", source_ref: "contrato" }), 0);
    ok(okExp.id, "documento esperado válido é gravado");
    // isolamento
    await rejects(rpc(await as(U.ADMINB), "insurance_policy_party_add", pol.id, 1, JSON.stringify({ party_role: "TOMADOR", party_name: "X", source_ref: "x" })), /FORBIDDEN/, "outro projeto");
  });

  await check("CASO F4-B-R08 / 20) cláusula de COBERTURA exige identificação específica; genérica é aceita como cadastro mas nunca prova cobertura (avaliação TS sobre dados reais)", async () => {
    const pol = await mkPolicy();
    const g = await as(U.GESTOR);
    const clause = async (data) => rpc(g, "insurance_policy_clause_add", pol.id, (await pRow(pol.id)).row_version, JSON.stringify({ title: "Cobertura de inadimplemento", source_document_id: D1, applies_to: ["INADIMPLEMENTO"], verified: true, ...data }));
    await rejects(clause({ kind: "COBERTURA" }), /CLAUSE_IDENTIFIER_REQUIRED/, "cobertura sem identificação");
    await rejects(clause({ kind: "COBERTURA", clause_identifier: " " }), /CLAUSE_IDENTIFIER_REQUIRED/, "identificação em branco");
    await rejects(clause({ kind: "COBERTURA", clause_identifier: "x" }), /CLAUSE_IDENTIFIER_REQUIRED/, "identificação curta");
    await rejects(rpc(await as(U.COLAB), "insurance_policy_clause_add", pol.id, 1, JSON.stringify({ kind: "COBERTURA", title: "x", clause_identifier: "Cláusula 1", source_ref: "x" })), /FORBIDDEN/, "COLABORADOR");
    const generic = await clause({ kind: "CLAUSULA", title: "Disposição geral de cobertura" });
    const spec = await clause({ kind: "COBERTURA", clause_identifier: "Cláusula 4.2" });
    ok(generic.id && spec.id, "genérica e específica cadastradas");
    const rows = (await su.query("select id, kind, title, clause_identifier, applies_to, source_document_id, source_ref, source_page, verified from public.insurance_policy_clauses where policy_id=$1 order by created_at", [pol.id])).rows;
    const ev1 = (r) => ({ id: r.id, kind: r.kind, title: r.title, identifier: r.clause_identifier, appliesTo: r.applies_to, source: { documentId: r.source_document_id, ref: r.source_ref, page: r.source_page }, verified: r.verified });
    const base = { modality: "SEGURO_GARANTIA_EXECUTANTE", claimKind: "INADIMPLEMENTO", eventDate: "2026-06-01", policy: { coverageStart: "2026-01-01", coverageEnd: "2027-01-01" }, endorsements: [] };
    eq(I.assessCoverage({ ...base, clauses: rows.filter((r) => r.kind === "CLAUSULA").map(ev1) }).conclusion, "INFORMACOES_INSUFICIENTES", "só a genérica: não prova");
    eq(I.assessCoverage({ ...base, clauses: rows.map(ev1) }).conclusion, "POTENCIALMENTE_COBERTO", "com a específica identificada e com fonte");
    // legado: COBERTURA sem identificação (inserida fora da RPC) é lida, mas não prova cobertura
    await su.query("insert into public.insurance_policy_clauses (project_id,policy_id,kind,title,applies_to,source_ref,created_by) values ($1,$2,'COBERTURA','Cobertura legada',array['ATRASO'],'apólice p.9',$3)", [PA, pol.id, uid(U.ADMIN)]);
    const legacy = (await su.query("select id, kind, title, clause_identifier, applies_to, source_document_id, source_ref, source_page, verified from public.insurance_policy_clauses where title='Cobertura legada'")).rows.map(ev1);
    eq(I.assessCoverage({ ...base, claimKind: "ATRASO", clauses: legacy }).conclusion, "INFORMACOES_INSUFICIENTES", "legado sem identificação não prova");
    eq((await su.query("select clause_identifier from public.insurance_policy_clauses where title='Cobertura legada'")).rows[0].clause_identifier, null, "legado não foi alterado");
  });

  await check("CASO F4-B-R09 / 28) fundamentação de sinistro: Decisão/Indenização/Negativa/Contestação sem nota/fonte bloqueadas; RC cruzada exige RCC pronto; paridade da prontidão TS x SQL", async () => {
    const pol = await mkPolicy({ modality: "RC_CRUZADA", policy_number: "RC-1" });
    const a = await as(U.ADMIN);
    const g = await as(U.GESTOR);
    const claim = async (kind = "RC_CRUZADA") => rpc(a, "insurance_claim_open", PA, JSON.stringify({ claim_kind: kind, title: "Evento sintético", stage: "AVISO", policy_id: pol.id, source_ref: `evento-${uniq()}` }));
    const adv = async (c, to, data) => rpc(g, "insurance_claim_advance", c.id, (await su.query("select row_version from public.insurance_claims where id=$1", [c.id])).rows[0].row_version, to, JSON.stringify(data));
    const c = await claim();
    await adv(c, "REGULACAO", { note: "Seguradora iniciou a regulação" });
    const NOTE = "Decisão da seguradora após regulação do evento";
    // grounds
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO" }), /GROUNDS_REQUIRED/, "decisão sem nota");
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: "curta" }), /GROUNDS_REQUIRED/, "decisão com nota curta");
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE }), /GROUNDS_SOURCES_REQUIRED/, "decisão sem fonte");
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE, source_refs: ["  ", ""] }), /GROUNDS_SOURCES_REQUIRED/, "fontes em branco");
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE, document_id: DB }), /REFERENCE_OUT_OF_PROJECT/, "documento de outro projeto");
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE, source_refs: "texto" }), /INVALID_INPUT/, "source_refs deve ser lista");
    // RCC não pronto bloqueia a decisão (mesmo fundamentada)
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE, source_refs: ["carta 1"] }), /RCC_NOT_READY/, "RCC não pronto");
    // checklist RCC: 10 respostas com fonte, mas natureza do bem INDEFINIDA => ainda não pronto
    const KEYS = ["CAUSADOR", "VITIMA", "ABRANGENCIA_SEGURADOS", "OBJETO", "BENS_TERCEIROS_X_PROPRIA_OBRA", "EXCLUSOES", "SUBLIMITES", "FRANQUIAS", "ENDOSSOS", "AVISO"];
    const items = (scope, skip = []) => KEYS.filter((k) => !skip.includes(k)).map((k) => ({ key: k, answer: `resposta ${k}`, sourceRef: `apólice cl.${k}`, ...(k === "BENS_TERCEIROS_X_PROPRIA_OBRA" ? { propertyScope: scope } : {}) }));
    let ver = 0;
    const saveRcc = async (its) => { const r = await rpc(a, "insurance_rcc_checklist_save", pol.id, c.id, JSON.stringify(its), ver, null); ver = r.versionNo; return r; };
    const sqlReady = async () => rpc(await as(U.LEITURA), "insurance_rcc_readiness", pol.id, c.id);
    eq((await sqlReady()).ready, false, "sem checklist");
    await saveRcc(items("INDEFINIDO"));
    let r = await sqlReady();
    eq([r.ready, r.scopeUndefined, r.answeredWithSource], [false, true, 10], "natureza INDEFINIDA não conta");
    await rejects(adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE, source_refs: ["carta 1"] }), /RCC_NOT_READY/, "indefinido continua bloqueando");
    await saveRcc(items("PROPRIA_OBRA", ["AVISO"]));
    r = await sqlReady();
    eq([r.ready, r.missing], [false, ["AVISO"]], "falta uma pergunta");
    // paridade TS x SQL
    const tsAns = (its) => Object.fromEntries(its.map((i) => [i.key, { answer: i.answer, source: { ref: i.sourceRef }, propertyScope: i.propertyScope ?? null }]));
    for (const [its, label] of [[items("INDEFINIDO"), "indefinido"], [items("PROPRIA_OBRA", ["AVISO"]), "falta AVISO"], [items("AMBOS"), "pronto"], [items("BENS_TERCEIROS", ["OBJETO", "FRANQUIAS"]), "faltam duas"]]) {
      await saveRcc(its);
      const sql = await sqlReady();
      const ts = I.evaluateRccChecklist(tsAns(its));
      eq([sql.ready, sql.scopeUndefined, [...sql.missing].sort()], [ts.readyForCoverageAssessment, ts.scopeUndefined, [...ts.missingKeys].sort()], `paridade RCC: ${label}`);
    }
    await saveRcc(items("AMBOS"));
    eq((await sqlReady()).ready, true, "checklist pronto");
    // agora a decisão passa; a fundamentação fica no passo e na auditoria
    const dc = await adv(c, "DECISAO", { decision_outcome: "DEFERIDO", note: NOTE, source_refs: ["carta 1", "e-mail 2"], document_id: D1 });
    eq(dc.stage, "DECISAO", "decisão registrada");
    const step = (await su.query("select source_refs, note, document_id from public.insurance_claim_steps where claim_id=$1 and stage='DECISAO'", [c.id])).rows[0];
    eq([step.source_refs, step.note, step.document_id], [["carta 1", "e-mail 2"], NOTE, D1], "passo com texto e fontes");
    const aud = (await su.query("select detail from public.insurance_audit_events where entity_id=$1 and action='CLAIM_STAGE_DECISAO'", [c.id])).rows[0].detail;
    eq([aud.sourceRefs, aud.rccReady, aud.documentId], [["carta 1", "e-mail 2"], true, D1], "auditoria da fundamentação");
    await rejects(adv(c, "INDENIZACAO_CUMPRIMENTO", { note: "Pagamento confirmado pela seguradora" }), /GROUNDS_SOURCES_REQUIRED/, "indenização sem fonte");
    await rejects(adv(c, "INDENIZACAO_CUMPRIMENTO", { source_refs: ["comprovante"] }), /GROUNDS_REQUIRED/, "indenização sem nota");
    const pay = await adv(c, "INDENIZACAO_CUMPRIMENTO", { note: "Pagamento confirmado pela seguradora", source_refs: ["comprovante 77"] });
    eq(pay.stage, "INDENIZACAO_CUMPRIMENTO", "indenização fundamentada");
    // autorização por etapa preservada: COLABORADOR não registra decisão (MANAGE), nem com fundamentação
    const c2 = await claim("OUTRO");
    await rpc(g, "insurance_claim_advance", c2.id, 1, "RECLAMACAO", "{}");
    await rejects(rpc(await as(U.COLAB), "insurance_claim_advance", c2.id, 2, "DECISAO", JSON.stringify({ decision_outcome: "DEFERIDO", note: NOTE, source_refs: ["x"] })), /FORBIDDEN/, "COLABORADOR não decide");
    // evento não-RCC não exige RCC
    const dc2 = await rpc(g, "insurance_claim_advance", c2.id, 2, "DECISAO", JSON.stringify({ decision_outcome: "INDEFERIDO", note: NOTE, source_refs: ["x"] }));
    eq(dc2.stage, "DECISAO", "RCC só é exigido em RC cruzada");
    // negativa/contestação também exigem fontes
    const c3 = await claim("OUTRO");
    await rpc(g, "insurance_claim_advance", c3.id, 1, "RECLAMACAO", "{}");
    await rejects(rpc(g, "insurance_claim_advance", c3.id, 2, "NEGATIVA", JSON.stringify({ note: "Negada pela seguradora por exclusão" })), /GROUNDS_SOURCES_REQUIRED/, "negativa sem fonte");
    await rejects(rpc(g, "insurance_claim_advance", c3.id, 2, "NEGATIVA", JSON.stringify({ note: "curta" })), /NOTE_REQUIRED/, "negativa com nota curta (código antigo preservado)");
  });

  await check("CASO F4-B-R10 / 18) atualização de fiança/caução exige FONTE + motivo; histórico append-only com antes/depois; versão otimista; isolamento", async () => {
    const a = await as(U.ADMIN);
    const g = await as(U.GESTOR);
    const bank = await rpc(a, "bank_guarantee_register", PA, JSON.stringify({ bank_name: "Banco Sintético SA", guarantee_number: "FB-1", amount: 500000, source_ref: "carta-fianca-sint" }));
    const caucao = await rpc(a, "other_guarantee_register", PA, JSON.stringify({ guarantee_type: "CAUCAO", caucao_form: "DINHEIRO", amount: 1000, source_ref: "recibo-sint" }));
    const upd = (fn, id, ver, data, c = g) => rpc(c, fn, id, ver, JSON.stringify(data));
    for (const [fn, g1, kind] of [["bank_guarantee_update", bank, "FIANCA_BANCARIA"], ["other_guarantee_update", caucao, "CAUCAO_OUTRA"]]) {
      await rejects(upd(fn, g1.id, 1, { amount: 400000 }), /UPDATE_SOURCE_REQUIRED/, `${kind}: sem fonte`);
      await rejects(upd(fn, g1.id, 1, { amount: 400000, update_source_ref: "   " }), /UPDATE_SOURCE_REQUIRED/, `${kind}: fonte em branco`);
      await rejects(upd(fn, g1.id, 1, { amount: 400000, update_source_ref: "aditivo-3" }), /UPDATE_REASON_REQUIRED/, `${kind}: sem motivo`);
      await rejects(upd(fn, g1.id, 1, { amount: 400000, update_source_ref: "aditivo-3", update_reason: "curto" }), /UPDATE_REASON_REQUIRED/, `${kind}: motivo curto`);
      await rejects(upd(fn, g1.id, 1, { update_source_ref: "aditivo-3", update_reason: "Aditivo n. 3 reduziu o valor" }), /UPDATE_EMPTY/, `${kind}: sem campo alterado`);
      await rejects(upd(fn, g1.id, 1, { amount: 400000, update_source_document_id: DB, update_reason: "Aditivo n. 3 reduziu o valor" }), /REFERENCE_OUT_OF_PROJECT/, `${kind}: documento de outro projeto`);
      await rejects(upd(fn, g1.id, 1, { amount: 400000, update_source_ref: "aditivo-3", update_reason: "Aditivo n. 3 reduziu o valor" }, await as(U.COLAB)), /FORBIDDEN/, `${kind}: COLABORADOR`);
      await rejects(upd(fn, g1.id, 1, { amount: 400000, update_source_ref: "aditivo-3", update_reason: "Aditivo n. 3 reduziu o valor" }, await as(U.ADMINB)), /FORBIDDEN/, `${kind}: outro projeto`);
      await rejects(upd(fn, g1.id, 7, { amount: 400000, update_source_ref: "aditivo-3", update_reason: "Aditivo n. 3 reduziu o valor" }), /VERSION_CONFLICT/, `${kind}: versão antiga`);
      eq(await nq("select count(*)::int n from public.insurance_guarantee_updates where guarantee_id=$1", [g1.id]), 0, `${kind}: recusas não gravam histórico`);
      const r = await upd(fn, g1.id, 1, { amount: 400000, update_source_ref: "aditivo-3", update_reason: "Aditivo n. 3 reduziu o valor" });
      eq(r.rowVersion, 2, `${kind}: versão`);
      const h = (await su.query("select * from public.insurance_guarantee_updates where guarantee_id=$1", [g1.id])).rows[0];
      eq([h.guarantee_kind, h.changed_keys, h.source_ref, h.from_row_version, h.to_row_version, Number(h.before_state.amount), Number(h.after_state.amount)], [kind, ["amount"], "aditivo-3", 1, 2, kind === "FIANCA_BANCARIA" ? 500000 : 1000, 400000], `${kind}: histórico antes/depois`);
      const r2 = await upd(fn, g1.id, 2, { notes: "observação", update_source_document_id: D1, update_reason: "Conferência documental do projeto" });
      eq(r2.rowVersion, 3, `${kind}: fonte por documento`);
      await rejects(su.query("update public.insurance_guarantee_updates set reason='x' where guarantee_id=$1", [g1.id]), /F4B_APPEND_ONLY/, `${kind}: histórico imutável`);
      await rejects(su.query("delete from public.insurance_guarantee_updates where guarantee_id=$1", [g1.id]), /F4B_APPEND_ONLY|F4B_NO_DELETE/, `${kind}: histórico sem exclusão`);
    }
    eq((await (await as(U.ADMINB)).query("select id from public.insurance_guarantee_updates")).rowCount, 0, "RLS: outro projeto não lê o histórico");
    eq((await (await as(U.LEITURA)).query("select id from public.insurance_guarantee_updates")).rowCount, 4, "LEITURA lê o histórico do projeto");
    eq(await nq("select count(*)::int n from public.insurance_audit_events where action in ('BANK_GUARANTEE_UPDATED','OTHER_GUARANTEE_UPDATED') and detail ->> 'updateSourceRef' is not null"), 2, "auditoria registra a fonte da atualização");
  });

  await check("CASO F4-B-R11 / 17) adiantamentos consolidados: soma, amortizado e saldo SEM dupla contagem; paridade TS x SQL (duplicidades, amortização acima, teto, centavos); isolamento", async () => {
    const pol = await mkPolicy({ policy_number: "ADI-1", modality: "ADIANTAMENTO_PAGAMENTO", max_amount: 5000 });
    const a = await as(U.ADMIN);
    const reg = (data) => rpc(a, "insurance_advance_register", PA, JSON.stringify({ policy_id: pol.id, contract_number: "CT-77", advance_date: "2026-03-01", purpose: "Mobilização", source_ref: "NF 100", ...data }));
    const am = async (adv, data) => rpc(a, "insurance_advance_amortize", adv.id, (await su.query("select row_version from public.insurance_advances where id=$1", [adv.id])).rows[0].row_version, JSON.stringify({ amortized_on: "2026-04-01", source_ref: "medição 1", ...data }));
    const a1 = await reg({ advanced_amount: 1000.1 });
    const a1dup = await reg({ advanced_amount: 1000.1, contract_number: "ct  77" }); // duplicado (contrato normalizado)
    const a2 = await reg({ advanced_amount: 2000, source_ref: "NF 200", guaranteed_limit: 1500 });
    const a3 = await reg({ advanced_amount: 0.3, source_ref: "NF 300", contract_number: "CT-78" });
    const aNoPol = await rpc(a, "insurance_advance_register", PA, JSON.stringify({ advanced_amount: 100, purpose: "Sem apólice", source_ref: "NF 400" }));
    await am(a1, { amount: 100.05 });
    await am(a1, { amount: 100.05 }); // amortização duplicada (mesma data/valor/fonte)
    await am(a1dup, { amount: 50.02, source_ref: "medição 9" }); // amortização do duplicado: passa ao mantido
    await am(a2, { amount: 700, source_ref: "medição 2" });
    await am(a3, { amount: 0.1, source_ref: "m3a" });
    await am(a3, { amount: 0.2, source_ref: "m3b" });
    // legado: amortização acima do adiantado (inserida fora da RPC)
    await su.query("insert into public.insurance_advance_amortizations (project_id,advance_id,amount,amortized_on,source_ref,created_by) values ($1,$2,150,'2026-05-01','legado',$3)", [PA, aNoPol.id, uid(U.ADMIN)]);
    const sql = await rpc(await as(U.LEITURA), "insurance_advances_consolidated", PA, null);
    // TS sobre as MESMAS linhas
    const iso = (t) => new Date(t).toISOString();
    const advs = (await su.query("select a.*, to_char(a.created_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as cts, to_char(a.advance_date,'YYYY-MM-DD') as d from public.insurance_advances a where a.project_id=$1", [PA])).rows;
    const ams = (await su.query("select m.*, to_char(m.created_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as cts, to_char(m.amortized_on,'YYYY-MM-DD') as d from public.insurance_advance_amortizations m where m.project_id=$1", [PA])).rows;
    const rows = advs.map((x) => ({ id: x.id, policyId: x.policy_id, contractNumber: x.contract_number, advanceDate: x.d, advancedAmount: Number(x.advanced_amount), guaranteedLimit: x.guaranteed_limit === null ? null : Number(x.guaranteed_limit), sourceDocumentId: x.source_document_id, sourceRef: x.source_ref, createdAt: iso(x.cts.replace(/(\.\d{3})\d*Z$/, "$1Z")), amortizations: ams.filter((m) => m.advance_id === x.id).map((m) => ({ id: m.id, amount: Number(m.amount), amortizedOn: m.d, sourceDocumentId: m.source_document_id, sourceRef: m.source_ref, createdAt: iso(m.cts.replace(/(\.\d{3})\d*Z$/, "$1Z")) })) }));
    const ts = I.consolidateAdvances(rows, { [pol.id]: 5000 });
    const num = (v) => (v === null ? null : Number(v));
    eq(Object.fromEntries(Object.entries(sql.totals).map(([k, v]) => [k, Number(v)])), ts.totals, "totais TS x SQL");
    eq(sql.advances.map((x) => [x.id, x.policyId, Number(x.advanced), Number(x.amortized), Number(x.unamortized), x.overAmortized, Number(x.overAmount), x.guarantee, num(x.uncoveredExcess)]),
       ts.advances.map((x) => [x.id, x.policyId, x.advanced, x.amortized, x.unamortized, x.overAmortized, x.overAmount, x.guarantee, x.uncoveredExcess]), "linhas TS x SQL");
    eq(sql.byPolicy.map((x) => [x.policyId, Number(x.advances), Number(x.advanced), Number(x.amortized), Number(x.unamortized), num(x.ceiling), x.guarantee, num(x.uncoveredExcess)]),
       ts.byPolicy.map((x) => [x.policyId, x.advances, x.advanced, x.amortized, x.unamortized, x.ceiling, x.guarantee, x.uncoveredExcess]), "por apólice TS x SQL");
    eq([sql.duplicates.advances, sql.duplicates.amortizations], [ts.duplicates.advances, ts.duplicates.amortizations], "duplicidades TS x SQL");
    // valores esperados (calculados à mão)
    eq(ts.totals, { advanced: 3100.4, amortized: 950.37, unamortized: 2150.03, advances: 4, duplicateAdvances: 1, duplicateAmortizations: 1, overAmortized: 1 }, "valores esperados");
    // sem dupla contagem: o duplicado não soma; o saldo nunca é negativo
    ok(sql.advances.every((x) => Number(x.unamortized) >= 0), "saldo nunca negativo");
    eq(sql.duplicates.advances.map((x) => x.duplicateOf), [a1.id], "o mais antigo é o mantido");
    // filtro por apólice e isolamento
    const only = await rpc(await as(U.LEITURA), "insurance_advances_consolidated", PA, pol.id);
    eq(Number(only.totals.advances), 3, "filtro por apólice");
    await rejects(rpc(await as(U.ADMINB), "insurance_advances_consolidated", PA, null), /FORBIDDEN/, "outro projeto");
    await rejects(rpc(await as(U.LEITURA), "insurance_advances_consolidated", PB, null), /FORBIDDEN/, "projeto alheio");
    await rejects(rpc(await as(null, "anon"), "insurance_advances_consolidated", PA, null), /permission denied|AUTH_REQUIRED/, "anon");
    eq((await rpc(await as(U.ADMINB), "insurance_advances_consolidated", PB, null)).totals.advances, 0, "projeto B vazio (não vê os de A)");
    // apólice de outro projeto não vaza existência
    await rejects(rpc(await as(U.ADMINB), "insurance_advances_consolidated", PB, pol.id), /REFERENCE_OUT_OF_PROJECT/, "apólice de outro projeto");
    await matrix("consolidado READ", 1, async () => null, (c) => rpc(c, "insurance_advances_consolidated", PA, null));
  });

  await check("CASO F4-B-R12) idempotência e privilégios: novas funções sem EXECUTE para anon/PUBLIC; tabelas novas com RLS, sem escrita direta; migrations reaplicadas 3x sem alterar dados; hotfix P0 intacto", async () => {
    const fns = ["quality_warranty_acceptance_register", "quality_warranty_acceptance_prove", "quality_warranty_acceptances_list", "insurance_instrument_terms_save", "insurance_coherence_check",
      "insurance_coherence_justify", "insurance_draft_approve", "insurance_policy_clause_add", "bank_guarantee_update", "other_guarantee_update", "insurance_claim_advance", "insurance_advances_consolidated",
      "insurance_rcc_readiness", "insurance_tax_id_valid", "f4b_norm_text", "f4b_tax_digits", "f4b_party_equal"];
    for (const f of fns) {
      const r = (await su.query("select p.oid, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth, p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1", [f])).rows;
      ok(r.length >= 1, `${f} existe`);
      for (const x of r) {
        eq([f, x.anon, x.auth], [f, false, true], "EXECUTE: anon não, authenticated sim");
        if (x.prosecdef) ok((x.proconfig ?? []).some((c) => /^search_path=("")?$/.test(c)), `${f}: search_path vazio`);
      }
    }
    for (const f of ["f4b_block_mutation", "insurance_party_guard", "insurance_expected_subject_guard", "insurance_int_coherence"]) {
      const r = (await su.query("select has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1", [f])).rows[0];
      eq([f, r.anon, r.auth], [f, false, false], "funções internas sem EXECUTE para clientes");
    }
    for (const t of ["quality_warranty_acceptances", "insurance_instrument_terms", "insurance_coherence_justifications", "insurance_guarantee_updates"]) {
      const r = (await su.query("select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass", [t])).rows[0];
      ok(r.relrowsecurity, `${t}: RLS habilitado`);
      for (const priv of ["insert", "update", "delete", "truncate"]) {
        const p = (await su.query("select has_table_privilege('authenticated', ('public.' || $1)::regclass, $2) as a, has_table_privilege('anon', ('public.' || $1)::regclass, $2) as n", [t, priv])).rows[0];
        eq([t, priv, p.a, p.n], [t, priv, false, false], "sem escrita direta");
      }
      eq((await su.query("select has_table_privilege('anon', ('public.' || $1)::regclass, 'select') as n", [t])).rows[0].n, false, `${t}: anon não lê`);
    }
    // dados não mudam ao reaplicar
    const snapshot = async () => JSON.stringify(await Promise.all(["quality_warranty_acceptances", "insurance_instrument_terms", "insurance_coherence_justifications", "insurance_guarantee_updates", "insurance_policy_parties", "insurance_claim_steps"].map(async (t) => nq(`select count(*)::int n from public.${t}`))));
    const before = await snapshot();
    for (const f of MINE) await su.query(read(f));
    eq(await snapshot(), before, "reaplicar não altera dados");
    // hotfix P0 intacto: corpo de record_risk_alert_action não foi tocado por nenhuma migration F4-B
    for (const f of MINE) ok(!/create or replace function public\.record_risk_alert_action/i.test(read(f)), `${f} não redefine record_risk_alert_action`);
    const hot = (await su.query("select md5(replace(prosrc, E'\\r', '')) as m, prosecdef, proconfig, has_function_privilege('anon', oid, 'execute') as anon from pg_proc where proname='record_risk_alert_action' and pronamespace='public'::regnamespace")).rows[0];
    eq([hot.prosecdef, hot.anon], [true, false], "record_risk_alert_action: security definer e sem EXECUTE para anon");
    ok(/search_path=("")?$/.test((hot.proconfig ?? [])[0] ?? ""), "record_risk_alert_action: search_path vazio");
  });

  // ---------------------------------------------------------------------------------------------------------------
  // matriz de autorização das RPCs novas de Garantias (CASO 31)
  await check("CASO F4-B-R13 / 31) autorização negativa por perfil: aceite informado/comprovado/listagem (REGISTER/MANAGE/READ) para os 10 perfis", async () => {
    const g = await as(U.GESTOR);
    const mk = async () => {
      const w = await warUntil("VERIFICADA");
      const e = await ev(g, { warranty: w.id, type: "EMAIL", ref: `m-${uniq()}` });
      return { w, e };
    };
    await matrix("acceptance_register (MANAGE)", 3, mk, async (c, x) => rpc(c, "quality_warranty_acceptance_register", x.w.id, (await wRow(x.w.id)).row_version, "2026-11-10", "Cliente", x.e));
    await matrix("acceptance_prove (MANAGE)", 3, mk, async (c, x) => proveNow(c, x.w.id, { evidence: x.e }));
    const x0 = await mk();
    await matrix("acceptances_list (READ)", 1, async () => x0, (c, x) => rpc(c, "quality_warranty_acceptances_list", x.w.id));
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
