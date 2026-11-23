// FASE 5 / E — GOVERNANÇA em PostgreSQL REAL (adversarial): (1) competência especializada só com validação INDEPENDENTE de habilitação,
// (2) caso encerrado (RNC, garantia, sinistro) sem alteração material, (3) confirmação de envio externo de USO ÚNICO vinculada a
// usuário+projeto+destinatários+ação+conteúdo, com os CENÁRIOS 25, 26 e 27 do item 14. Replay de TODAS as migrations numa base descartável
// (acc_f5e_*, apagada no fim); identidade por claims JWT (request.jwt.claims + set role); dados 100% SINTÉTICOS; nada é enviado.
// NÃO roda no CI.  Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-f5-e-governanca-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
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
const SB = await import("../apps/web/lib/governance/external-send-binding.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^20261205\d{6}_/.test(f));
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
const rejects = async (p, re, m) => {
  try { await p; } catch (e) { ok(re.test(e.message), `${m}: erro inesperado: ${e.message.split("\n")[0]}`); return; }
  throw new Error(`${m}: deveria ter sido recusado`);
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f5e_${Date.now().toString(36)}`;
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
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 5/E reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(5100 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000051a0";
  const PB = "10000000-0000-4000-8000-0000000051b0";
  const U = { ADMIN: 1, ADMIN2: 2, GESTOR: 3, GERENTE: 4, COLAB: 5, LEITURA: 6, INATIVO: 7, VALIDADOR: 8, ADMINB: 9, GESTORB: 10, COLAB2: 11 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f5e-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F5E ${n}`, `f5e-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F5A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F5B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.ADMIN2, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.COLAB2, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await mem(PB, U.GESTORB, "GESTOR");
  const doc = async (p, title) => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [p, title])).rows[0].id;
  const DA = await doc(PA, "Habilitação sintética A");
  const DA2 = await doc(PA, "Ata sintética A");
  const DB = await doc(PB, "Habilitação sintética B");
  const DB2 = await doc(PB, "Ata sintética B");

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const rpc = async (c, fn, ...args) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r;
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const has = async (user, project, comp) => (await (await as(user)).query("select public.acc_has_competence($1,$2) r", [project, comp])).rows[0].r;
  const reqCreate = (c, project, user, comp, data = { evidence_document_id: DA }) => rpc(c, "project_competence_request_create", project, uid(user), comp, JSON.stringify(data));
  const decide = (c, id, ver, decision, note, checked = true) => rpc(c, "project_competence_request_decide", id, ver, decision, note, checked);
  const NOTE = "Diploma e registro conferidos no documento anexado ao projeto.";

  // ======================= 1. COMPETÊNCIA: SOLICITAÇÃO NÃO DÁ PODER =======================
  let R1;
  await check("F5-E-01 SOLICITAÇÃO: só ADMINISTRADOR solicita; solicitação (inclusive a si mesmo) NÃO produz poderes; sem evidência, duplicada e fora do projeto são recusadas", async () => {
    R1 = await reqCreate(await as(U.ADMIN), PA, U.GESTOR, "JURIDICO", { evidence_document_id: DA, registration_kind: "OAB", registration_number: "SINT-5001" });
    eq([R1.status, R1.grantsAuthority], ["PENDING", false], "estado");
    eq(await has(U.GESTOR, PA, "JURIDICO"), false, "OAB declarada + solicitação NÃO dá competência");
    const self = await reqCreate(await as(U.ADMIN), PA, U.ADMIN, "SEGUROS");
    eq([self.status, self.grantsAuthority], ["PENDING", false], "autossolicitação");
    eq(await has(U.ADMIN, PA, "SEGUROS"), false, "autossolicitação não dá poder");
    for (const [label, who] of [["LEITURA", U.LEITURA], ["COLABORADOR", U.COLAB], ["GESTOR", U.GESTOR], ["GERENTE", U.GERENTE], ["INATIVO", U.INATIVO], ["OUTRO_PROJETO", U.ADMINB]]) {
      await rejects(reqCreate(await as(who), PA, U.GERENTE, "TECNICO_RESPONSAVEL"), /FORBIDDEN/, label);
    }
    await rejects(reqCreate(await as(null, "authenticated"), PA, U.GERENTE, "TECNICO_RESPONSAVEL"), /AUTH_REQUIRED/, "sem sub");
    await rejects(reqCreate(await as(null, "anon"), PA, U.GERENTE, "TECNICO_RESPONSAVEL"), /permission denied/i, "anon");
    const a = await as(U.ADMIN);
    await rejects(reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL", {}), /EVIDENCE_REQUIRED/, "sem evidência (CREA/OAB declarado não basta)");
    await rejects(reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL", { evidence_document_id: DB }), /REFERENCE_OUT_OF_PROJECT/, "evidência de outro projeto");
    await rejects(reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL", { registration_kind: "CREA", registration_number: "123" }), /EVIDENCE_REQUIRED/, "registro sem documento");
    await rejects(reqCreate(a, PA, U.GESTOR, "JURIDICO"), /ALREADY_PENDING/, "duplicada pendente");
    await rejects(reqCreate(a, PA, U.INATIVO, "JURIDICO"), /TARGET_NOT_ACTIVE_MEMBER/, "alvo inativo");
    await rejects(reqCreate(a, PA, U.GERENTE, "ADVOGADO"), /INVALID_COMPETENCE/, "competência fora da lista");
    eq(await nq("select count(*)::int n from public.project_competences where project_id=$1", [PA]), 0, "nenhuma competência criada");
  });

  await check("F5-E-02 VALIDAÇÃO INDEPENDENTE: solicitante, beneficiário e demais perfis NÃO validam; segundo administrador valida com evidência conferida; o poder só nasce aí", async () => {
    for (const [label, who] of [["SOLICITANTE", U.ADMIN], ["BENEFICIÁRIO", U.GESTOR]]) {
      await rejects(decide(await as(who), R1.id, 1, "APPROVE", NOTE), /INDEPENDENT_VALIDATOR_REQUIRED/, label);
    }
    for (const [label, who] of [["COLABORADOR", U.COLAB], ["GERENTE", U.GERENTE], ["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO], ["OUTRO_PROJETO", U.ADMINB], ["VALIDADOR_SEM_DESIGNACAO", U.VALIDADOR]]) {
      await rejects(decide(await as(who), R1.id, 1, "APPROVE", NOTE), /FORBIDDEN/, label);
    }
    await rejects(decide(await as(null, "anon"), R1.id, 1, "APPROVE", NOTE), /permission denied/i, "anon");
    eq(await has(U.GESTOR, PA, "JURIDICO"), false, "nada mudou");
    const v2 = await as(U.ADMIN2);
    await rejects(decide(v2, R1.id, 1, "APPROVE", NOTE, false), /EVIDENCE_CHECK_REQUIRED/, "sem conferir evidência");
    await rejects(decide(v2, R1.id, 1, "APPROVE", "curta", true), /NOTE_REQUIRED/, "nota curta");
    await rejects(decide(v2, R1.id, 7, "APPROVE", NOTE), /VERSION_CONFLICT/, "versão");
    await rejects(decide(v2, R1.id, 1, "TALVEZ", NOTE), /INVALID_DECISION/, "decisão inválida");
    const r = await decide(v2, R1.id, 1, "APPROVE", NOTE);
    eq([r.status, r.validatorKind, r.grantsAuthority], ["APPROVED", "SECOND_ADMIN", true], "aprovada");
    eq(await has(U.GESTOR, PA, "JURIDICO"), true, "agora vale");
    const c = (await su.query("select habilitation_status, granted_by, habilitation_request_id, registration_kind from public.project_competences where id=$1", [r.competenceId])).rows[0];
    eq([c.habilitation_status, c.granted_by, c.habilitation_request_id, c.registration_kind], ["VALIDATED", uid(U.ADMIN2), R1.id, "OAB"], "registro validado");
    await rejects(decide(v2, R1.id, 2, "APPROVE", NOTE), /NOT_PENDING/, "não reabre");
    ok(await nq("select count(*)::int n from public.project_competence_governance_events where request_id=$1 and action in ('REQUESTED','APPROVED')", [R1.id]) === 2, "trilha: solicitada e aprovada");
    ok(await nq("select count(*)::int n from public.audit_log_entries where action='PROJECT_COMPETENCE_GRANTED' and project_id=$1", [PA]) >= 1, "auditoria central");
    await rejects(su.query("update public.project_competence_governance_events set action='REJECTED' where request_id=$1", [R1.id]), /INSURANCE_APPEND_ONLY|APPEND/i, "trilha imutável");
    await rejects(su.query("delete from public.project_competence_requests where id=$1", [R1.id]), /COMPETENCE_REQUEST_IMMUTABLE/, "solicitação não é apagada");
  });

  await check("F5-E-03 ADMINISTRADOR ÚNICO (obra B): autovalidação impossível; regularização por VALIDADOR DESIGNADO (documento, prazo, ACEITE) com trilha", async () => {
    const b = await as(U.ADMINB);
    const R = await reqCreate(b, PB, U.ADMINB, "SEGUROS", { evidence_document_id: DB });
    await rejects(decide(b, R.id, 1, "APPROVE", NOTE), /INDEPENDENT_VALIDATOR_REQUIRED/, "o único administrador não valida a si mesmo");
    await rejects(decide(await as(U.GESTORB), R.id, 1, "APPROVE", NOTE), /FORBIDDEN/, "gestor da obra não valida");
    // designação: validações
    // data em UTC; o PostgreSQL local usa o fuso do Windows (BRT): entre 00:00 e 03:00 UTC "ontem" em UTC ainda e "hoje" no banco; -2 dias e vencido nos dois fusos
    const until = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    const REASON = "Ata da diretoria designa validador independente de habilitação.";
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.ADMINB), DB2, REASON, until(30)), /SELF_DESIGNATION_FORBIDDEN/, "autodesignação");
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), DA2, REASON, until(30)), /EVIDENCE_REQUIRED/, "documento de outro projeto");
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), null, REASON, until(30)), /EVIDENCE_REQUIRED/, "sem documento");
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), DB2, "curta", until(30)), /REASON_REQUIRED/, "justificativa curta");
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), DB2, REASON, until(181)), /INVALID_VALIDITY/, "mais de 180 dias");
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), DB2, REASON, until(-2)), /INVALID_VALIDITY/, "prazo vencido");
    await rejects(rpc(await as(U.GESTORB), "project_competence_validator_designate", PB, uid(U.VALIDADOR), DB2, REASON, until(30)), /FORBIDDEN/, "só administrador designa");
    const d = await rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), DB2, REASON, until(90));
    eq(d.status, "PROPOSED", "proposta");
    await rejects(rpc(b, "project_competence_validator_designate", PB, uid(U.VALIDADOR), DB2, REASON, until(90)), /ALREADY_DESIGNATED/, "duplicada");
    const v = await as(U.VALIDADOR);
    await rejects(decide(v, R.id, 1, "APPROVE", NOTE), /FORBIDDEN/, "designação só vale depois do aceite");
    await rejects(rpc(b, "project_competence_validator_accept", d.id), /FORBIDDEN/, "só o designado aceita");
    eq((await rpc(v, "project_competence_validator_accept", d.id)).status, "ACTIVE", "aceite");
    const r = await decide(v, R.id, 1, "APPROVE", NOTE);
    eq([r.status, r.validatorKind, r.grantsAuthority], ["APPROVED", "DESIGNATED", true], "aprovada pelo validador designado");
    eq(await has(U.ADMINB, PB, "SEGUROS"), true, "competência efetiva só depois da validação");
    eq(await has(U.ADMINB, PA, "SEGUROS"), false, "não vale em outro projeto");
    // o validador designado NÃO vira membro nem ganha acesso à obra
    eq(await nq("select count(*)::int n from public.project_memberships where user_id=$1", [uid(U.VALIDADOR)]), 0, "validador não é membro");
    eq((await (await as(U.VALIDADOR)).query("select count(*)::int n from public.documents")).rows[0].n, 0, "validador não lê documentos da obra");
    // revogação interrompe o poder de validar
    await rpc(b, "project_competence_validator_revoke", d.id, "Fim do prazo contratual da diretoria.");
    const R2 = await reqCreate(b, PB, U.ADMINB, "JURIDICO", { evidence_document_id: DB });
    await rejects(decide(v, R2.id, 1, "APPROVE", NOTE), /FORBIDDEN/, "validador revogado");
    await rejects(rpc(b, "project_competence_validator_revoke", d.id, "de novo outra vez"), /ALREADY_REVOKED/, "já revogado");
    ok(await nq("select count(*)::int n from public.project_competence_governance_events where project_id=$1 and action in ('VALIDATOR_DESIGNATED','VALIDATOR_ACCEPTED','VALIDATOR_REVOKED')", [PB]) === 3, "trilha de designação");
  });

  await check("F5-E-04 RECUSA e CANCELAMENTO e EXPIRAÇÃO: recusa exige motivo e não dá poder; cancelar só quem solicitou; solicitação vencida não valida", async () => {
    const a = await as(U.ADMIN);
    const R = await reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL");
    await rejects(decide(await as(U.ADMIN2), R.id, 1, "REJECT", "ruim"), /NOTE_REQUIRED/, "recusa sem motivo");
    const rj = await decide(await as(U.ADMIN2), R.id, 1, "REJECT", "Documento ilegível; reenvie a habilitação.");
    eq(rj.status, "REJECTED", "recusada");
    eq(await has(U.GERENTE, PA, "TECNICO_RESPONSAVEL"), false, "recusa não dá poder");
    const R3 = await reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL");
    await rejects(rpc(await as(U.ADMIN2), "project_competence_request_cancel", R3.id, 1, "motivo qualquer longo"), /FORBIDDEN/, "só quem solicitou cancela");
    eq((await rpc(a, "project_competence_request_cancel", R3.id, 1, "Pessoa errada; refazer a solicitação.")).status, "CANCELLED", "cancelada");
    const R4 = await reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL");
    await su.query("update public.project_competence_requests set expires_at = now() - interval '1 hour' where id=$1", [R4.id]);
    const ex = await decide(await as(U.ADMIN2), R4.id, 1, "APPROVE", NOTE);
    eq([ex.status, ex.grantsAuthority], ["EXPIRED", false], "vencida");
    eq(await has(U.GERENTE, PA, "TECNICO_RESPONSAVEL"), false, "vencida não dá poder");
    // pode solicitar de novo depois
    const R5 = await reqCreate(a, PA, U.GERENTE, "TECNICO_RESPONSAVEL");
    eq(R5.status, "PENDING", "nova solicitação");
  });

  await check("F5-E-05 CAMINHO ANTIGO FECHADO: project_competence_grant, INSERT direto (authenticated/service_role) e linha UNVALIDATED NÃO dão poder; só carga de manutenção (superusuário) é MAINTENANCE e identificável", async () => {
    await rejects(rpc(await as(U.ADMIN), "project_competence_grant", PA, uid(U.GERENTE), "SEGUROS", "{}"), /HABILITATION_VALIDATION_REQUIRED/, "RPC antiga");
    await rejects((await as(U.ADMIN)).query("insert into public.project_competences (project_id,user_id,competence,granted_by) values ($1,$2,'SEGUROS',$3)", [PA, uid(U.GERENTE), uid(U.ADMIN)]), /permission denied|HABILITATION/i, "INSERT direto authenticated");
    await rejects((await as(null, "service_role")).query("insert into public.project_competences (project_id,user_id,competence,granted_by) values ($1,$2,'SEGUROS',$3)", [PA, uid(U.GERENTE), uid(U.ADMIN)]), /permission denied|HABILITATION/i, "INSERT direto service_role");
    eq(await has(U.GERENTE, PA, "SEGUROS"), false, "nada concedido");
    const m = (await su.query("insert into public.project_competences (project_id,user_id,competence,granted_by,basis_note) values ($1,$2,'SEGUROS',$3,'carga-de-manutencao') returning id, habilitation_status", [PA, uid(U.GERENTE), uid(U.ADMIN)])).rows[0];
    eq(m.habilitation_status, "MAINTENANCE", "carga de manutenção identificável");
    eq(await has(U.GERENTE, PA, "SEGUROS"), true, "manutenção vale (e é listável)");
    await su.query("update public.project_competences set habilitation_status='UNVALIDATED' where id=$1", [m.id]);
    eq(await has(U.GERENTE, PA, "SEGUROS"), false, "UNVALIDATED não dá poder");
    await su.query("update public.project_competences set status='REVOKED', revoked_by=$2, revoked_at=now(), revoke_reason='limpeza do cenário de teste' where id=$1", [m.id, uid(U.ADMIN)]);
  });

  await check("F5-E-06 EFEITO NAS DECISÕES: etapa DECISAO do sinistro exige JURIDICO VALIDADO; sem validação (solicitação pendente ou UNVALIDATED) é COMPETENCE_REQUIRED", async () => {
    const cl = (await su.query("insert into public.insurance_claims (project_id,claim_kind,title,stage,no_instrument_reason,source_ref) values ($1,'OUTRO','Sinistro sintético','REGULACAO','sem apólice no cenário de teste','fonte-sintetica') returning id", [PA])).rows[0].id;
    const step = (user) => su.query("insert into public.insurance_claim_steps (project_id,claim_id,from_stage,stage,note,created_by) values ($1,$2,'REGULACAO','DECISAO','decisão sintética',$3)", [PA, cl, uid(user)]);
    await step(U.GESTOR); // JURIDICO validada em F5-E-02
    await rejects(step(U.GERENTE), /COMPETENCE_REQUIRED/, "GERENTE sem competência");
    await rejects(step(U.ADMIN), /COMPETENCE_REQUIRED/, "ADMIN só com solicitação pendente (SEGUROS) não decide sinistro");
  });

  // ======================= 2. CASO ENCERRADO =======================
  let NCR; let WAR; let CLAIM;
  await su.query("set session_replication_role = replica"); // só para montar fixtures de casos já encerrados na base descartável
  NCR = (await su.query("insert into public.quality_ncrs (project_id,code,title,state,origin_type,origin_ref,origin_key,closed_at) values ($1,'NCR-F5E-1','RNC sintética encerrada','ENCERRADA','MANUAL','ref-sintetica','chave-f5e-1',now()) returning id, row_version", [PA])).rows[0];
  WAR = (await su.query("insert into public.quality_warranty_cases (project_id,code,service_system,state,defect_description,closed_at) values ($1,'WAR-F5E-1','Impermeabilização','ENCERRADA','Infiltração sintética',now()) returning id", [PA])).rows[0];
  CLAIM = (await su.query("insert into public.insurance_claims (project_id,claim_kind,title,stage,no_instrument_reason,source_ref) values ($1,'OUTRO','Sinistro encerrado sintético','ENCERRADO','sem apólice no cenário de teste','fonte-sintetica') returning id, row_version", [PA])).rows[0];
  const OPEN_NCR = (await su.query("insert into public.quality_ncrs (project_id,code,title,state,origin_type,origin_ref,origin_key) values ($1,'NCR-F5E-2','RNC sintética aberta','INVESTIGACAO','MANUAL','ref-sintetica','chave-f5e-2') returning id", [PA])).rows[0];
  await su.query("set session_replication_role = origin");

  await check("F5-E-07 RNC e GARANTIA ENCERRADAS: UPDATE material recusado no banco (inclusive superusuário); filhos novos recusados; caso aberto segue editável", async () => {
    await rejects(su.query("update public.quality_ncrs set title='título alterado depois de encerrada' where id=$1", [NCR.id]), /CLOSED_CASE_IMMUTABLE/, "RNC título");
    await rejects(su.query("update public.quality_ncrs set root_cause='causa nova' where id=$1", [NCR.id]), /CLOSED_CASE_IMMUTABLE/, "RNC causa");
    await rejects(su.query("update public.quality_warranty_cases set actual_cost=9999.99 where id=$1", [WAR.id]), /CLOSED_CASE_IMMUTABLE/, "garantia custo");
    await rejects(su.query("update public.quality_warranty_cases set accepted_at=now(), accepted_by_name='Fulano' where id=$1", [WAR.id]), /CLOSED_CASE_IMMUTABLE/, "garantia aceite");
    await rejects(su.query("insert into public.quality_corrective_actions (project_id,ncr_id,kind,description) values ($1,$2,'CORRETIVA','ação nova em caso encerrado')", [PA, NCR.id]), /CLOSED_CASE_IMMUTABLE/, "CAPA nova");
    await rejects(su.query("insert into public.quality_warranty_maintenance (project_id,warranty_case_id,description) values ($1,$2,'manutenção nova em caso encerrado')", [PA, WAR.id]).catch((e) => { throw e; }), /CLOSED_CASE_IMMUTABLE|violates|null value/i, "manutenção nova");
    await su.query("update public.quality_ncrs set title='título alterado em caso aberto' where id=$1", [OPEN_NCR.id]); // aberto: segue editável
    eq((await su.query("select title from public.quality_ncrs where id=$1", [NCR.id])).rows[0].title, "RNC sintética encerrada", "original intacto");
  });

  await check("F5-E-08 SINISTRO ENCERRADO: UPDATE e passo novo recusados; reabertura SÓ por insurance_claim_reopen (MANAGE, motivo+fonte, auditada, evento append-only)", async () => {
    await rejects(su.query("update public.insurance_claims set title='alterado' where id=$1", [CLAIM.id]), /CLOSED_CASE_IMMUTABLE/, "UPDATE do sinistro");
    await rejects(su.query("insert into public.insurance_claim_steps (project_id,claim_id,from_stage,stage,note,created_by) values ($1,$2,'ENCERRADO','REGULACAO','passo forjado',$3)", [PA, CLAIM.id, uid(U.GESTOR)]), /CLOSED_CASE_IMMUTABLE/, "passo novo");
    const R = "Surgiu novo documento da seguradora após o encerramento.";
    for (const [label, who] of [["COLABORADOR", U.COLAB], ["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO]]) {
      await rejects(rpc(await as(who), "insurance_claim_reopen", CLAIM.id, 1, "REGULACAO", R, "carta-seguradora-sintetica"), /FORBIDDEN|NOT_FOUND/i, label);
    }
    const g = await as(U.GESTOR);
    await rejects(rpc(g, "insurance_claim_reopen", CLAIM.id, 1, "ENCERRADO", R, "carta"), /INVALID_TRANSITION/, "destino inválido");
    await rejects(rpc(g, "insurance_claim_reopen", CLAIM.id, 1, "REGULACAO", "curto", "carta"), /REASON_REQUIRED/, "motivo curto");
    await rejects(rpc(g, "insurance_claim_reopen", CLAIM.id, 1, "REGULACAO", R, ""), /SOURCE_REQUIRED/, "sem fonte");
    await rejects(rpc(g, "insurance_claim_reopen", CLAIM.id, 9, "REGULACAO", R, "carta"), /VERSION_CONFLICT/, "versão");
    await rejects(rpc(await as(U.ADMINB), "insurance_claim_reopen", CLAIM.id, 1, "REGULACAO", R, "carta"), /FORBIDDEN/, "outro projeto");
    const r = await rpc(g, "insurance_claim_reopen", CLAIM.id, 1, "REGULACAO", R, "carta-seguradora-sintetica");
    eq([r.stage, r.reopened], ["REGULACAO", true], "reaberto");
    eq((await su.query("select stage from public.insurance_claims where id=$1", [CLAIM.id])).rows[0].stage, "REGULACAO", "estágio");
    ok(await nq("select count(*)::int n from public.insurance_claim_reopen_events where claim_id=$1", [CLAIM.id]) === 1, "evento de reabertura");
    ok(await nq("select count(*)::int n from public.insurance_audit_events where entity_id=$1 and action='CLAIM_REOPENED'", [CLAIM.id]) === 1, "auditoria");
    await rejects(su.query("update public.insurance_claim_reopen_events set reason='adulterado por superusuário' where claim_id=$1", [CLAIM.id]), /INSURANCE_APPEND_ONLY|APPEND/i, "evento imutável");
    await rejects(rpc(g, "insurance_claim_reopen", CLAIM.id, 2, "REGULACAO", R, "carta"), /NOT_CLOSED/, "só encerrado reabre");
    // reaberto volta a ser editável pelo fluxo normal; encerrar de novo trava de novo
    await su.query("update public.insurance_claims set title='agora editável (reaberto)' where id=$1", [CLAIM.id]);
  });

  await check("F5-E-09 REGISTRO COMPLEMENTAR CONTROLADO: só gestão, só caso ENCERRADO, fonte obrigatória, original intacto, append-only, isolado por projeto", async () => {
    const NOTEC = "Cliente enviou laudo complementar após o encerramento (protocolo sintético).";
    const call = (c, type, id, kind = "DOCUMENTO_POSTERIOR", note = NOTEC, src = "email-cliente-sintetico", doc = null, project = PA) =>
      rpc(c, "acc_closed_case_complement_add", project, type, id, kind, note, src, doc);
    for (const [label, who] of [["COLABORADOR", U.COLAB], ["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO]]) await rejects(call(await as(who), "NCR", NCR.id), /FORBIDDEN/, label);
    await rejects(call(await as(U.ADMINB), "NCR", NCR.id), /FORBIDDEN/, "outro projeto");
    await rejects(call(await as(null, "anon"), "NCR", NCR.id), /permission denied/i, "anon");
    const g = await as(U.GESTOR);
    await rejects(call(g, "NCR", OPEN_NCR.id), /CASE_NOT_CLOSED/, "caso aberto usa o fluxo normal");
    await rejects(call(g, "NCR", NCR.id, "DOCUMENTO_POSTERIOR", NOTEC, ""), /SOURCE_REQUIRED/, "sem fonte");
    await rejects(call(g, "NCR", NCR.id, "DOCUMENTO_POSTERIOR", "curto"), /NOTE_REQUIRED/, "nota curta");
    await rejects(call(g, "NCR", NCR.id, "OUTRA_COISA"), /INVALID_KIND/, "tipo");
    await rejects(call(g, "NCR", NCR.id, "DOCUMENTO_POSTERIOR", NOTEC, "x", DB), /REFERENCE_OUT_OF_PROJECT/, "documento de outro projeto");
    await rejects(call(g, "COISA", NCR.id), /INVALID_ENTITY_TYPE/, "tipo de entidade");
    const before = JSON.stringify((await su.query("select * from public.quality_ncrs where id=$1", [NCR.id])).rows[0]);
    const a = await call(g, "NCR", NCR.id, "DOCUMENTO_POSTERIOR", NOTEC, "email-cliente-sintetico", DA);
    const b = await call(await as(U.ADMIN), "WARRANTY", WAR.id);
    eq([a.original_unchanged, b.entityType], [true, "WARRANTY"], "retorno");
    eq(JSON.stringify((await su.query("select * from public.quality_ncrs where id=$1", [NCR.id])).rows[0]), before, "RNC original idêntica byte a byte");
    ok(await nq("select count(*)::int n from public.closed_case_complements where project_id=$1", [PA]) === 2, "dois complementos");
    await rejects(su.query("update public.closed_case_complements set note='adulterado por superusuário aqui' where id=$1", [a.id]), /INSURANCE_APPEND_ONLY|APPEND/i, "append-only update");
    await rejects(su.query("delete from public.closed_case_complements where id=$1", [a.id]), /INSURANCE_NO_DELETE|APPEND/i, "append-only delete");
    eq((await (await as(U.LEITURA)).query("select count(*)::int n from public.closed_case_complements")).rows[0].n, 2, "LEITURA lê");
    eq((await (await as(U.ADMINB)).query("select count(*)::int n from public.closed_case_complements")).rows[0].n, 0, "outro projeto não lê");
    ok(await nq("select count(*)::int n from public.audit_log_entries where action='CLOSED_CASE_COMPLEMENT_ADDED'") === 2, "auditoria");
  });

  // ======================= 3. ENVIO EXTERNO DE USO ÚNICO (cenários 25, 26, 27) =======================
  const H1 = SB.hashExternalSendContent({ subject: "Solicitação", body: "Texto v1 do e-mail sintético." });
  const H2 = SB.hashExternalSendContent({ subject: "Solicitação", body: "Texto v2 ALTERADO." });
  const EXT = "contato@cliente-novo-qualquer-dominio.com.br";
  const INT = "pessoa@axion.com.br";
  const prep = (c, over = {}) => rpc(c, "acc_external_send_prepare", over.project ?? PA, over.ctx ?? "SOLICITACAO_ACAO", over.action ?? "SOLICITACAO_ACAO", over.rec ?? [INT, EXT], over.hash ?? H1, over.ver ?? "v1", "ACTION_REQUEST", null);
  const consume = (c, id, action = "SOLICITACAO_ACAO", rec = [INT, EXT], hash = H1) => rpc(c, "acc_external_send_consume", id, action, rec, hash);
  const REASON_E = "Cliente pediu retorno formal por escrito sobre a pendência.";

  await check("CENÁRIO 25 — destinatário externo SEM confirmação: preparar não autoriza nada; usar sem aprovação é recusado; qualquer domínio externo válido pode ser preparado (sem allowlist)", async () => {
    const col = await as(U.COLAB);
    const p = await prep(col);
    eq([p.status, p.requiresApproval, p.sent], ["PREPARED", true, false], "preparada, exige aprovação, nada enviado");
    eq(p.externalRecipients, [EXT], "apenas o externo exige confirmação");
    await rejects(consume(col, p.id), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "COLABORADOR não usa sem confirmação");
    await rejects(consume(await as(U.GESTOR), p.id), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "nem GESTOR usa sem aprovar antes");
    eq(await nq("select count(*)::int n from public.external_recipient_confirmation_uses"), 0, "nenhum uso");
    // sem allowlist: domínios nunca vistos, subdomínios, TLDs novos; só endereço INVÁLIDO é recusado
    for (const d of ["a@dominio-inedito-123.com", "b@sub.dominio-inedito.org.br", "c@empresa.engineering", "d@seguradora-x.com.br"]) ok((await prep(col, { rec: [d] })).requiresApproval === true, `domínio externo válido aceito: ${d}`);
    for (const bad of ["sem-arroba", "a@b.com\r\nBcc: x@y.com", "a@b.com, c@d.com", "x@example.com", ""]) await rejects(prep(col, { rec: [bad] }), /INVALID_RECIPIENT_EMAIL/, `inválido: ${JSON.stringify(bad)}`);
    await rejects(prep(col, { rec: Array.from({ length: 21 }, (_, i) => `u${i}@dominio${i}.com.br`) }), /TOO_MANY_RECIPIENTS/, "mais de 20");
    await rejects(prep(col, { hash: "nao-e-sha256" }), /INVALID_CONTENT_HASH/, "hash inválido");
    await rejects(prep(col, { ctx: "INVENTADO" }), /INVALID_CONTEXT/, "contexto");
    await rejects(prep(col, { action: "ENVIAR_TUDO" }), /INVALID_ACTION/, "ação");
    await rejects(prep(await as(U.LEITURA)), /FORBIDDEN/, "LEITURA não prepara");
    await rejects(prep(await as(U.INATIVO)), /FORBIDDEN/, "inativo não prepara");
    await rejects(prep(await as(U.ADMINB)), /FORBIDDEN/, "outro projeto não prepara");
    await rejects(prep(await as(null, "anon")), /permission denied/i, "anon");
  });

  await check("CENÁRIO 27 — COLABORADOR prepara; aprovação conforme a matriz (GESTOR/GERENTE/ADMIN; minuta só ADMIN); COLABORADOR/LEITURA/outros não aprovam", async () => {
    const col = await as(U.COLAB);
    const p = await prep(col);
    for (const [label, who] of [["COLABORADOR (o próprio preparador)", U.COLAB], ["COLABORADOR 2", U.COLAB2], ["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO], ["OUTRO_PROJETO", U.ADMINB]]) {
      await rejects(rpc(await as(who), "acc_external_send_decide", p.id, "APPROVE", REASON_E), /FORBIDDEN/, label);
    }
    await rejects(rpc(await as(null, "anon"), "acc_external_send_decide", p.id, "APPROVE", REASON_E), /permission denied/i, "anon");
    const g = await as(U.GESTOR);
    await rejects(rpc(g, "acc_external_send_decide", p.id, "APPROVE", "curto"), /REASON_REQUIRED/, "motivo curto");
    const ap = await rpc(g, "acc_external_send_decide", p.id, "APPROVE", REASON_E);
    eq([ap.status, ap.externalConfirmations, ap.singleUse, ap.sent], ["APPROVED", 1, true, false], "aprovada, 1 confirmação, uso único");
    const c = (await su.query("select confirmed_by, action_kind, content_hash, preparation_id, recipient_email, tier_at_confirmation from public.external_recipient_confirmations where preparation_id=$1", [p.id])).rows;
    eq(c.map((x) => [x.confirmed_by, x.action_kind, x.content_hash, x.recipient_email, x.tier_at_confirmation]), [[uid(U.GESTOR), "SOLICITACAO_ACAO", H1, EXT, "MANAGE"]], "confirmação vinculada a usuário, ação, hash e destinatário");
    await rejects(rpc(g, "acc_external_send_decide", p.id, "APPROVE", REASON_E), /NOT_PREPARED/, "não decide duas vezes");
    // GERENTE e ADMIN também aprovam (matriz); recusa exige motivo
    const p2 = await prep(col); eq((await rpc(await as(U.GERENTE), "acc_external_send_decide", p2.id, "APPROVE", REASON_E)).status, "APPROVED", "GERENTE");
    const p3 = await prep(col); await rejects(rpc(await as(U.ADMIN), "acc_external_send_decide", p3.id, "REJECT", "não"), /REASON_REQUIRED/, "recusa sem motivo");
    eq((await rpc(await as(U.ADMIN), "acc_external_send_decide", p3.id, "REJECT", "Destinatário não é o interlocutor do contrato.")).status, "REJECTED", "ADMIN recusa");
    await rejects(consume(await as(U.ADMIN), p3.id), /NOT_APPROVED/, "recusada não é usada");
    // minuta de Seguros: só ADMINISTRADOR
    const pm = await prep(col, { ctx: "SEGUROS_MINUTA", action: "ENVIO_NOVO", hash: H2 });
    eq(pm.requiredTier, "ADMIN", "minuta exige ADMIN");
    for (const who of [U.GESTOR, U.GERENTE]) await rejects(rpc(await as(who), "acc_external_send_decide", pm.id, "APPROVE", REASON_E), /FORBIDDEN/, "minuta só ADMIN");
    eq((await rpc(await as(U.ADMIN), "acc_external_send_decide", pm.id, "APPROVE", REASON_E)).status, "APPROVED", "ADMIN aprova minuta");
    // só destinatários internos: sem aprovação excepcional
    const pi = await prep(col, { rec: [INT] });
    eq([pi.requiresApproval, pi.externalRecipients], [false, []], "interno não exige aprovação");
    eq((await consume(col, pi.id, "SOLICITACAO_ACAO", [INT])).status, "CONSUMED", "preparador usa o interno");
    // cancelar
    const pc = await prep(col);
    await rejects(rpc(await as(U.COLAB2), "acc_external_send_cancel", pc.id, "cancelamento indevido aqui"), /FORBIDDEN/, "outro colaborador não cancela");
    eq((await rpc(col, "acc_external_send_cancel", pc.id, "Rascunho substituído por outro texto.")).status, "CANCELLED", "preparador cancela");
    await rejects(consume(await as(U.GESTOR), pc.id), /NOT_APPROVED/, "cancelada não é usada");
  });

  await check("CENÁRIO 26 — ENVIO BLOQUEADO / USO ÚNICO: confirmação vale para UM uso, só do aprovador, mesma ação+destinatários+conteúdo, 24 h; conteúdo alterado exige nova aprovação; nada é enviado", async () => {
    const p = await prep(await as(U.COLAB));
    const g = await as(U.GESTOR);
    await rpc(g, "acc_external_send_decide", p.id, "APPROVE", REASON_E);
    await rejects(consume(await as(U.GERENTE), p.id), /CONFIRMER_ONLY/, "confirmação é pessoal (GERENTE não usa a do GESTOR)");
    await rejects(consume(await as(U.COLAB), p.id), /CONFIRMER_ONLY/, "preparador não usa a confirmação do gestor");
    await rejects(consume(g, p.id, "SOLICITACAO_ACAO", [INT, EXT], H2), /CONTENT_CHANGED/, "conteúdo alterado");
    await rejects(consume(g, p.id, "RESPOSTA"), /ACTION_MISMATCH/, "outra ação");
    await rejects(consume(g, p.id, "SOLICITACAO_ACAO", [INT, EXT, "extra@outro-dominio.com.br"]), /RECIPIENTS_CHANGED/, "destinatário a mais");
    await rejects(consume(g, p.id, "SOLICITACAO_ACAO", [INT]), /RECIPIENTS_CHANGED/, "destinatário a menos");
    await rejects(consume(await as(U.LEITURA), p.id), /FORBIDDEN/, "LEITURA");
    await rejects(consume(await as(U.ADMINB), p.id), /FORBIDDEN/, "outro projeto");
    await rejects(consume(await as(null, "anon"), p.id), /permission denied/i, "anon");
    eq(await nq("select count(*)::int n from public.external_recipient_confirmation_uses where preparation_id=$1", [p.id]), 0, "tentativas recusadas não consomem");
    const ok1 = await consume(g, p.id, "SOLICITACAO_ACAO", [EXT, INT.toUpperCase()]); // ordem e caixa diferentes: mesma lista normalizada
    eq([ok1.status, ok1.authorized, ok1.sent], ["CONSUMED", true, false], "primeiro uso autoriza e NÃO envia");
    await rejects(consume(g, p.id), /CONFIRMATION_ALREADY_USED/, "SEGUNDO USO recusado (uso único)");
    eq(await nq("select count(*)::int n from public.external_recipient_confirmation_uses where preparation_id=$1", [p.id]), 1, "um único uso");
    await rejects(su.query("insert into public.external_recipient_confirmation_uses (confirmation_id,project_id,used_by,action_kind) select confirmation_id,project_id,used_by,action_kind from public.external_recipient_confirmation_uses where preparation_id=$1", [p.id]), /duplicate key|unique/i, "chave primária impede reuso");
    await rejects(su.query("update public.external_send_preparations set status='APPROVED' where id=$1", [p.id]), /EXTERNAL_SEND_PREPARATION_IMMUTABLE/, "consumida não reabre");
    await rejects(su.query("update public.external_send_preparations set content_hash=$2 where id=$1", [p.id, H2]), /EXTERNAL_SEND_PREPARATION_IMMUTABLE/, "conteúdo não muda");
    await rejects(su.query("update public.external_recipient_confirmation_uses set used_by=$1", [uid(U.ADMIN)]), /INSURANCE_APPEND_ONLY|APPEND/i, "usos append-only");
    // expiração de 24 h
    const pe = await prep(await as(U.COLAB));
    await rpc(g, "acc_external_send_decide", pe.id, "APPROVE", REASON_E);
    await su.query("update public.external_send_preparations set decided_at = now() - interval '25 hours' where id=$1", [pe.id]);
    await rejects(consume(g, pe.id), /CONFIRMATION_EXPIRED/, "aprovação com mais de 24 h");
    // perda de nível depois de aprovar: inativar o aprovador bloqueia o uso
    const pd = await prep(await as(U.COLAB));
    await rpc(await as(U.GERENTE), "acc_external_send_decide", pd.id, "APPROVE", REASON_E);
    await su.query("update public.project_memberships set status='INACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.GERENTE)]);
    await rejects(consume(await as(U.GERENTE), pd.id), /FORBIDDEN/, "aprovador inativado não usa");
    await su.query("update public.project_memberships set status='ACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.GERENTE)]);
    // espelho TS decide igual
    const row = { projectId: PA, context: "SOLICITACAO_ACAO", action: "SOLICITACAO_ACAO", recipients: [EXT, INT].sort(), externalRecipients: [EXT], contentHash: H1, preparedBy: uid(U.COLAB), status: "APPROVED", decidedBy: uid(U.GESTOR), decidedAtMs: Date.now() };
    eq(SB.canConsumeSend(row, { userId: uid(U.GESTOR), tier: "MANAGE", action: "SOLICITACAO_ACAO", recipients: [INT, EXT], contentHash: H1, nowMs: Date.now() }).ok, true, "TS: aprovador usa");
    eq(SB.canConsumeSend({ ...row, status: "CONSUMED" }, { userId: uid(U.GESTOR), tier: "MANAGE", action: "SOLICITACAO_ACAO", recipients: [INT, EXT], contentHash: H1, nowMs: Date.now() }).code, "ALREADY_USED", "TS: uso único");
  });

  await check("CANAL OFICIAL DE SEGUROS: a confirmação solta (24 h) agora é CONSUMIDA no cadastro; um segundo canal para o mesmo e-mail exige NOVA confirmação", async () => {
    const g = await as(U.GESTOR);
    const E = "atendimento@seguradora-nova-qualquer.com.br";
    const channel = (c, value) => rpc(c, "insurance_channel_register", PA, JSON.stringify({ entity_name: "Seguradora Sintética SA", source_ref: "apolice-sintetica p.1", channel_type: "EMAIL", channel_value: value }));
    await rejects(channel(g, E), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "sem confirmação");
    await rpc(g, "acc_external_recipient_confirm", PA, "SEGUROS_CANAL", "INSURANCE_CHANNEL", null, E, "Canal oficial informado pela corretora do contrato.", "ref-sintetica-1");
    await channel(g, E); // consome
    await rejects(channel(g, E), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "reuso da mesma confirmação recusado");
    eq(await nq("select count(*)::int n from public.external_recipient_confirmation_uses where project_id=$1 and action_kind='CADASTRO_CANAL'", [PA]), 1, "um uso registrado");
  });

  await check("ESTRUTURA E PRIVILÉGIOS: RLS ligado e sem escrita direta nas tabelas novas; funções internas fechadas; SECURITY DEFINER com search_path vazio; anon sem acesso; leitura de mensagens não passa por estas funções", async () => {
    const tables = ["project_competence_requests", "project_competence_validators", "project_competence_governance_events", "closed_case_complements",
      "insurance_claim_reopen_events", "external_send_preparations", "external_recipient_confirmation_uses"];
    for (const t of tables) {
      eq((await su.query("select relrowsecurity from pg_class where oid=$1::regclass", [`public.${t}`])).rows[0].relrowsecurity, true, `RLS ${t}`);
      eq((await su.query("select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name=$1 and grantee in ('anon','authenticated','public') and privilege_type <> 'SELECT'", [t])).rows, [], `escrita direta em ${t}`);
      eq(await nq("select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name=$1 and grantee='anon'", [t]), 0, `anon em ${t}`);
    }
    const pub = ["project_competence_request_create(uuid,uuid,text,jsonb)", "project_competence_request_cancel(uuid,integer,text)", "project_competence_request_decide(uuid,integer,text,text,boolean)",
      "project_competence_validator_designate(uuid,uuid,uuid,text,date)", "project_competence_validator_accept(uuid)", "project_competence_validator_revoke(uuid,text)",
      "insurance_claim_reopen(uuid,integer,text,text,text)", "acc_closed_case_complement_add(uuid,text,uuid,text,text,text,uuid)", "acc_external_send_prepare(uuid,text,text,text[],text,text,text,uuid)",
      "acc_external_send_decide(uuid,text,text)", "acc_external_send_consume(uuid,text,text[],text)", "acc_external_send_cancel(uuid,text)"];
    for (const sig of pub) {
      const r = (await su.query(`select has_function_privilege('anon','public.${sig}','execute') a, has_function_privilege('public','public.${sig}','execute') p, has_function_privilege('authenticated','public.${sig}','execute') u`)).rows[0];
      eq([r.a, r.p, r.u], [false, false, true], `EXECUTE ${sig}`);
    }
    const internal = ["acc_is_designated_competence_validator(uuid,uuid)", "acc_competence_gov_event(uuid,uuid,uuid,text,text,jsonb)", "acc_external_recipient_consume_unbound(uuid,text,text,uuid,text)",
      "acc_external_send_required_tier(text)", "acc_external_send_normalize_list(text[])", "acc_user_has_competence(uuid,uuid,text[])"];
    for (const sig of internal) {
      const r = (await su.query(`select has_function_privilege('anon','public.${sig}','execute') a, has_function_privilege('authenticated','public.${sig}','execute') u`)).rows[0];
      eq([r.a, r.u], [false, false], `interna fechada ${sig}`);
    }
    eq(await nq(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prosecdef and p.proname in (
      'project_competence_request_create','project_competence_request_cancel','project_competence_request_decide','project_competence_validator_designate','project_competence_validator_accept',
      'project_competence_validator_revoke','insurance_claim_reopen','acc_closed_case_complement_add','acc_external_send_prepare','acc_external_send_decide','acc_external_send_consume','acc_external_send_cancel')
      and p.proconfig @> array['search_path=""']`), 12, "SECURITY DEFINER + search_path vazio nas 12 RPCs");
    // isolamento de leitura por RLS: outro projeto e anon não leem as solicitações
    eq((await (await as(U.ADMINB)).query("select count(*)::int n from public.project_competence_requests where project_id=$1", [PA])).rows[0].n, 0, "outro projeto não lê solicitações");
    ok((await (await as(U.ADMIN)).query("select count(*)::int n from public.project_competence_requests where project_id=$1", [PA])).rows[0].n >= 4, "administrador lê as do próprio projeto");
    eq((await (await as(U.COLAB)).query("select count(*)::int n from public.project_competence_requests")).rows[0].n, 0, "colaborador não beneficiário não lê");
    await rejects((await as(null, "anon")).query("select * from public.external_send_preparations"), /permission denied/i, "anon");
    eq(await nq("select count(*)::int n from public.external_send_preparations where project_id=$1 and prepared_by=$2", [PA, uid(U.COLAB)]) > 0, true, "preparações do colaborador gravadas");
    eq((await (await as(U.COLAB2)).query("select count(*)::int n from public.external_send_preparations")).rows[0].n, 0, "colaborador vê só as próprias preparações");
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
