// FASE 6 / H2a — em PostgreSQL REAL (adversarial): (1) REVALIDAÇÃO de competências anteriores antes de atos críticos (marcação única e
// idempotente, gate com mensagem clara, revalidação só por pessoa independente com evidência), (2) conteúdo da preparação de envio externo
// (hash SHA-256 idêntico ao do TypeScript, aprovação por papel, minuta de Seguros só ADMIN, nada é enviado, RLS).
// Replay de TODAS as migrations numa base descartável (acc_f6h2a_*, apagada no fim); a migration 20261208* é aplicada DEPOIS de dados
// "anteriores" (carga de manutenção) para provar a marcação REQUIRED. Identidade por claims JWT; dados 100% SINTÉTICOS.
// NÃO roda no CI.  Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-f6-h2a-governanca-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
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
const MINE = files.filter((f) => /^20261208\d{6}_/.test(f));
const BEFORE = files.filter((f) => !MINE.includes(f));
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
const dbName = `acc_f6h2a_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}

const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
try {
  await su.query(platform);
  for (const f of BEFORE) {
    try { await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }

  const uid = (n) => `00000000-0000-4000-8000-${String(6100 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000061a0";
  const PB = "10000000-0000-4000-8000-0000000061b0";
  const U = { ADMIN: 1, ADMIN2: 2, GESTOR: 3, GERENTE: 4, COLAB: 5, LEITURA: 6, VALIDADOR: 7, ADMINB: 8, COLAB2: 9, JUR: 10 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f6h2a-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F6H2A ${n}`, `f6h2a-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F6A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F6B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.ADMIN2, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.COLAB2, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.JUR, "GESTOR");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  const doc = async (p, title) => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [p, title])).rows[0].id;
  const DA = await doc(PA, "Habilitação sintética A");
  const DA2 = await doc(PA, "Ata sintética A");

  // ---- competência "ANTERIOR" (carga de manutenção por superusuário, antes da migration H2a) ----
  const legacy = (await su.query(
    `insert into public.project_competences (project_id,user_id,competence,granted_by,evidence_document_id) values ($1,$2,'JURIDICO',$3,$4) returning id, habilitation_status`,
    [PA, uid(U.JUR), uid(U.ADMIN), DA])).rows[0];
  eq(legacy.habilitation_status, "MAINTENANCE", "carga de manutenção anterior");

  for (let i = 0; i < 3; i += 1) for (const f of MINE) await su.query(readFileSync(path.join(dir, f), "utf8")); // aplica e reaplica 2x (idempotência)
  console.log(`PostgreSQL ${version}: ${BEFORE.length} migrations + ${MINE.length} da H2a (aplicada 3x) — base ${dbName}`);

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
  const gate = (project, user, comp) => su.query("select public.acc_int_require_competence($1,$2,$3,'a etapa DECISAO do sinistro')", [project, uid(user), [comp]]);
  const NOTE = "Diploma e registro conferidos no documento anexado ao projeto.";
  const until = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

  // ======================= 1. REVALIDAÇÃO =======================
  await check("F6-H2A-01 MARCAÇÃO: competência anterior fica REQUIRED (e idempotente); não vale e o gate crítico dá mensagem clara de revalidação", async () => {
    const row = (await su.query("select revalidation_status, status, habilitation_status from public.project_competences where id=$1", [legacy.id])).rows[0];
    eq([row.revalidation_status, row.status, row.habilitation_status], ["REQUIRED", "ACTIVE", "MAINTENANCE"], "anterior marcada após 3 aplicações");
    eq(await has(U.JUR, PA, "JURIDICO"), false, "competência anterior NÃO vale até revalidar (fail-closed)");
    await rejects(gate(PA, U.JUR, "JURIDICO"), /COMPETENCE_REVALIDATION_REQUIRED/, "gate crítico com mensagem de revalidação");
    await rejects(gate(PA, U.GESTOR, "JURIDICO"), /COMPETENCE_REQUIRED: /, "sem competência alguma continua COMPETENCE_REQUIRED");
    await rejects(gate(PA, U.GESTOR, "JURIDICO"), /^((?!REVALIDATION).)*$/s, "mensagem genérica não menciona revalidação");
    eq(await nq("select count(*)::int n from public.project_competences where project_id=$1 and revalidation_status='REQUIRED'", [PA]), 1, "só a anterior");
  });

  await check("F6-H2A-02 REVALIDAR é INDEPENDENTE: beneficiário, concessor, colaborador, gestor, leitura, outro projeto e anon são recusados; exige evidência conferida, nota e versão", async () => {
    const rv = (c, ver = 1, note = NOTE, checked = true) => rpc(c, "project_competence_revalidate", legacy.id, ver, note, checked);
    await rejects(rv(await as(U.JUR)), /INDEPENDENT_VALIDATOR_REQUIRED/, "beneficiário");
    await rejects(rv(await as(U.ADMIN)), /INDEPENDENT_VALIDATOR_REQUIRED/, "quem concedeu");
    for (const [label, who] of [["COLABORADOR", U.COLAB], ["GESTOR", U.GESTOR], ["GERENTE", U.GERENTE], ["LEITURA", U.LEITURA], ["OUTRO_PROJETO", U.ADMINB], ["VALIDADOR_SEM_DESIGNACAO", U.VALIDADOR]]) {
      await rejects(rv(await as(who)), /FORBIDDEN/, label);
    }
    await rejects(rv(await as(null, "anon")), /permission denied/i, "anon");
    await rejects(rv(await as(null, "authenticated")), /AUTH_REQUIRED/, "sem sub");
    const a2 = await as(U.ADMIN2);
    await rejects(rv(a2, 1, NOTE, false), /EVIDENCE_CHECK_REQUIRED/, "sem conferir evidência");
    await rejects(rv(a2, 1, "curta", true), /NOTE_REQUIRED/, "nota curta");
    await rejects(rv(a2, 9, NOTE, true), /VERSION_CONFLICT/, "versão");
    eq(await has(U.JUR, PA, "JURIDICO"), false, "nada mudou");
  });

  await check("F6-H2A-03 REVALIDAR por segundo administrador devolve o poder, com trilha e auditoria; não revalida duas vezes; validador designado também revalida", async () => {
    const a2 = await as(U.ADMIN2);
    const r = await rpc(a2, "project_competence_revalidate", legacy.id, 1, NOTE, true);
    eq([r.revalidationStatus, r.validatorKind, r.rowVersion], ["CURRENT", "SECOND_ADMIN", 2], "revalidada");
    eq(await has(U.JUR, PA, "JURIDICO"), true, "agora vale");
    await gate(PA, U.JUR, "JURIDICO");
    await rejects(rpc(a2, "project_competence_revalidate", legacy.id, 2, NOTE, true), /NOT_REQUIRED/, "não revalida de novo");
    const row = (await su.query("select revalidated_by, revalidation_status from public.project_competences where id=$1", [legacy.id])).rows[0];
    eq([row.revalidated_by, row.revalidation_status], [uid(U.ADMIN2), "CURRENT"], "quem revalidou");
    eq(await nq("select count(*)::int n from public.project_competence_governance_events where project_id=$1 and action='REVALIDATED'", [PA]), 1, "trilha");
    eq(await nq("select count(*)::int n from public.audit_log_entries where project_id=$1 and action='COMPETENCE_GOV_REVALIDATED'", [PA]), 1, "auditoria central");
    // concedida depois da migration (fluxo normal) já nasce CURRENT
    const a = await as(U.ADMIN);
    const q = await rpc(a, "project_competence_request_create", PA, uid(U.GERENTE), "TECNICO_RESPONSAVEL", JSON.stringify({ evidence_document_id: DA }));
    const d = await rpc(a2, "project_competence_request_decide", q.id, 1, "APPROVE", NOTE, true);
    eq((await su.query("select revalidation_status from public.project_competences where id=$1", [d.competenceId])).rows[0].revalidation_status, "CURRENT", "nova concessão nasce CURRENT");
    eq(await has(U.GERENTE, PA, "TECNICO_RESPONSAVEL"), true, "nova vale");
    // reaplicar a migration NÃO remarca nada
    for (const f of MINE) await su.query(readFileSync(path.join(dir, f), "utf8"));
    eq(await nq("select count(*)::int n from public.project_competences where revalidation_status='REQUIRED'"), 0, "reaplicação não remarca");
    // validador designado ativo revalida uma competência anterior de OUTRO projeto (carga de manutenção em B)
    const legB = (await su.query(`insert into public.project_competences (project_id,user_id,competence,granted_by,evidence_document_id) values ($1,$2,'SEGUROS',$3,$4) returning id`, [PB, uid(U.ADMINB), uid(U.ADMIN), null])).rows[0];
    ok(legB.id, "carga B");
  });

  await check("F6-H2A-04 VALIDADOR DESIGNADO: só ativo revalida; prazo <= 180 dias; revogado perde o poder; evidência obrigatória", async () => {
    // nova competência anterior (REQUIRED) para a pessoa GESTOR na obra A, para o validador designado revalidar
    const x = (await su.query(`insert into public.project_competences (project_id,user_id,competence,granted_by,evidence_document_id,revalidation_status) values ($1,$2,'SEGUROS',$3,$4,'REQUIRED') returning id, row_version`, [PA, uid(U.GESTOR), uid(U.ADMIN), DA])).rows[0];
    const a = await as(U.ADMIN);
    const REASON = "Ata da diretoria designa validador independente de habilitação.";
    await rejects(rpc(a, "project_competence_validator_designate", PA, uid(U.VALIDADOR), DA2, REASON, until(181)), /INVALID_VALIDITY/, "mais de 180 dias");
    await rejects(rpc(await as(U.GESTOR), "project_competence_validator_designate", PA, uid(U.VALIDADOR), DA2, REASON, until(30)), /FORBIDDEN/, "só administrador designa");
    const d = await rpc(a, "project_competence_validator_designate", PA, uid(U.VALIDADOR), DA2, REASON, until(90));
    const v = await as(U.VALIDADOR);
    await rejects(rpc(v, "project_competence_revalidate", x.id, 1, NOTE, true), /FORBIDDEN/, "proposta ainda não aceita");
    await rpc(v, "project_competence_validator_accept", d.id);
    // evidência removida do projeto => recusa (a competência 'x' aponta para DA; simulamos competência sem evidência)
    const y = (await su.query(`insert into public.project_competences (project_id,user_id,competence,granted_by,revalidation_status) values ($1,$2,'JURIDICO',$3,'REQUIRED') returning id`, [PA, uid(U.GERENTE), uid(U.ADMIN)])).rows[0];
    await rejects(rpc(v, "project_competence_revalidate", y.id, 1, NOTE, true), /EVIDENCE_REQUIRED/, "sem documento de evidência");
    const r = await rpc(v, "project_competence_revalidate", x.id, 1, NOTE, true);
    eq([r.revalidationStatus, r.validatorKind], ["CURRENT", "DESIGNATED"], "validador designado ativo revalida");
    eq(await has(U.GESTOR, PA, "SEGUROS"), true, "poder devolvido");
    await rpc(a, "project_competence_validator_revoke", d.id, "Fim do prazo contratual da diretoria.");
    await rejects(rpc(v, "project_competence_revalidate", y.id, 1, NOTE, true), /FORBIDDEN/, "validador revogado");
  });

  // ======================= 2. ENVIO EXTERNO COM CONTEÚDO =======================
  const EXT = "contato@seguradora-qualquer-dominio.com.br";
  const INT = "pessoa@axion.com.br";
  const mk = (subject, body, attachments = []) => {
    const c = { subject: subject.replace(/\r\n/g, "\n").trim(), body: body.replace(/\r\n/g, "\n").trim(), attachments: attachments.map((a) => a.trim()).sort() };
    return { ...c, hash: SB.hashExternalSendContent(c) };
  };
  const prepC = (c, content, over = {}) => rpc(c, "acc_external_send_prepare_with_content", over.project ?? PA, over.ctx ?? "SOLICITACAO_ACAO", over.action ?? "SOLICITACAO_ACAO",
    over.rec ?? [INT, EXT], over.hash ?? content.hash, "v1", content.subject, content.body, content.attachments, "ACTION_REQUEST", null);

  await check("F6-H2A-05 HASH do banco == hash do TypeScript (acentos, aspas, barra, quebra de linha, emoji, controle, anexos)", async () => {
    const samples = [
      mk("Solicitação de reajuste", "Prezados,\r\nsegue o \"pleito\" nº 12 — conforme cláusula 5ª.\r\nAtt."),
      mk("", "Texto \\ com barra, tab\t e aspas \"duplas\" e 'simples' / barra"),
      mk("Emoji 😀 e ç", "Linha 1\n\nLinha 3 com {chaves} e [colchetes] e <tags>", ["z-final.pdf", "a-inicial.pdf", "ç-anexo.docx"]),
      mk("Controle", "bell\u0007 e nul-free e del\u007f fim"),
    ];
    for (const s of samples) {
      const dbHash = (await su.query("select public.acc_external_send_content_hash($1,$2,$3) h", [s.subject, s.body, s.attachments])).rows[0].h;
      eq(dbHash, s.hash, `hash de "${s.body.slice(0, 20).replace(/\n/g, " ")}"`);
    }
  });

  let P1;
  await check("F6-H2A-06 PREPARAR COM CONTEÚDO: colaborador prepara; hash divergente, conteúdo vazio e papéis sem permissão são recusados; nada é enviado", async () => {
    const c = mk("Solicitação formal", "Texto sintético do e-mail para o destinatário externo.");
    P1 = await prepC(await as(U.COLAB), c);
    eq([P1.status, P1.requiresApproval, P1.sent], ["PREPARED", true, false], "preparada");
    const row = (await su.query("select subject, body, attachments from public.external_send_preparation_contents where preparation_id=$1", [P1.id])).rows[0];
    eq([row.subject, row.body], [c.subject, c.body], "conteúdo guardado");
    await rejects(prepC(await as(U.COLAB), c, { hash: "0".repeat(64) }), /CONTENT_HASH_MISMATCH/, "hash divergente");
    await rejects(prepC(await as(U.COLAB), mk("x", "  ")), /CONTENT_REQUIRED|CONTENT_HASH_MISMATCH/, "corpo vazio");
    await rejects(prepC(await as(U.LEITURA), c), /FORBIDDEN/, "leitura não prepara");
    await rejects(prepC(await as(U.ADMINB), c), /FORBIDDEN/, "outro projeto não prepara");
    await rejects(prepC(await as(null, "anon"), c), /permission denied/i, "anon");
    await rejects(prepC(await as(U.COLAB), c, { rec: [INT, "invalido"] }), /INVALID_RECIPIENT_EMAIL/, "destinatário inválido");
    await rejects(su.query("update public.external_send_preparation_contents set body='adulterado' where preparation_id=$1", [P1.id]), /INSURANCE_APPEND_ONLY|APPEND/i, "conteúdo imutável");
    await rejects(su.query("delete from public.external_send_preparation_contents where preparation_id=$1", [P1.id]), /INSURANCE_NO_DELETE|APPEND/i, "conteúdo não é apagado");
    // RLS do conteúdo
    const sel = async (n) => (await (await as(n)).query("select count(*)::int n from public.external_send_preparation_contents")).rows[0].n;
    eq(await sel(U.COLAB), 1, "preparador lê o próprio conteúdo");
    eq(await sel(U.GESTOR), 1, "gestor lê para aprovar");
    eq(await sel(U.COLAB2), 0, "outro colaborador não lê");
    eq(await sel(U.LEITURA), 0, "leitura não lê");
    eq(await sel(U.ADMINB), 0, "outro projeto não lê");
    await rejects((await as(null, "anon")).query("select * from public.external_send_preparation_contents"), /permission denied/i, "anon");
  });

  await check("F6-H2A-07 DECIDIR por papel: colaborador e leitura não aprovam; gestor aprova (motivo p/ externo); minuta de Seguros só ADMIN; aprovar não envia; cancelar", async () => {
    await rejects(rpc(await as(U.COLAB), "acc_external_send_decide", P1.id, "APPROVE", "Motivo suficiente aqui."), /FORBIDDEN/, "colaborador");
    await rejects(rpc(await as(U.LEITURA), "acc_external_send_decide", P1.id, "APPROVE", "Motivo suficiente aqui."), /FORBIDDEN/, "leitura");
    await rejects(rpc(await as(U.ADMINB), "acc_external_send_decide", P1.id, "APPROVE", "Motivo suficiente aqui."), /FORBIDDEN/, "outro projeto");
    await rejects(rpc(await as(U.GESTOR), "acc_external_send_decide", P1.id, "APPROVE", "curto"), /REASON_REQUIRED/, "motivo curto");
    const ap = await rpc(await as(U.GERENTE), "acc_external_send_decide", P1.id, "APPROVE", "Cliente pediu retorno formal por escrito.");
    eq([ap.status, ap.sent, ap.singleUse], ["APPROVED", false, true], "aprovada, nada enviado");
    await rejects(rpc(await as(U.GESTOR), "acc_external_send_decide", P1.id, "APPROVE", "Motivo suficiente aqui."), /NOT_PREPARED/, "decide uma vez");
    // minuta de Seguros
    const m = mk("Minuta de apólice", "Minuta sintética de Seguros para a seguradora.");
    const PM = await prepC(await as(U.COLAB), m, { ctx: "SEGUROS_MINUTA", action: "ENVIO_NOVO" });
    eq(PM.requiredTier, "ADMIN", "minuta exige ADMIN");
    await rejects(rpc(await as(U.GESTOR), "acc_external_send_decide", PM.id, "APPROVE", "Motivo suficiente aqui."), /FORBIDDEN: a aprovação deste envio exige ADMINISTRADOR/, "gestor não aprova minuta");
    await rejects(rpc(await as(U.GERENTE), "acc_external_send_decide", PM.id, "APPROVE", "Motivo suficiente aqui."), /FORBIDDEN/, "gerente não aprova minuta");
    const rj = await rpc(await as(U.ADMIN), "acc_external_send_decide", PM.id, "REJECT", "Minuta incompleta, refazer o texto.");
    eq(rj.status, "REJECTED", "admin recusa");
    // conteúdo não muda mesmo após decisão e consumo exige o mesmo hash
    const c = mk("Solicitação formal", "Texto sintético do e-mail para o destinatário externo.");
    await rejects(rpc(await as(U.GERENTE), "acc_external_send_consume", P1.id, "SOLICITACAO_ACAO", [INT, EXT], mk("Solicitação formal", "ALTERADO depois.").hash), /CONTENT_CHANGED/, "conteúdo alterado");
    const cancelP = await prepC(await as(U.COLAB), mk("Outra", "Outro texto sintético para cancelar."));
    await rejects(rpc(await as(U.COLAB2), "acc_external_send_cancel", cancelP.id, "Motivo de cancelamento longo."), /FORBIDDEN/, "outro colaborador não cancela");
    eq((await rpc(await as(U.COLAB), "acc_external_send_cancel", cancelP.id, "Preparador desistiu do envio.")).status, "CANCELLED", "preparador cancela");
    ok(c.hash.length === 64, "hash sha256");
    eq(await nq("select count(*)::int n from public.audit_log_entries where project_id=$1 and action in ('EXTERNAL_SEND_PREPARED','EXTERNAL_SEND_APPROVED','EXTERNAL_SEND_REJECTED','EXTERNAL_SEND_CANCELLED')", [PA]) >= 4, true, "auditoria");
  });

  await check("F6-H2A-08 PRIVILÉGIOS: novas RPCs só para authenticated; internas fechadas; SECURITY DEFINER com search_path vazio", async () => {
    const pub = ["project_competence_revalidate(uuid,integer,text,boolean)", "acc_external_send_prepare_with_content(uuid,text,text,text[],text,text,text,text,text[],text,uuid)"];
    for (const sig of pub) {
      const r = (await su.query(`select has_function_privilege('anon','public.${sig}','execute') a, has_function_privilege('public','public.${sig}','execute') p, has_function_privilege('authenticated','public.${sig}','execute') u`)).rows[0];
      eq([r.a, r.p, r.u], [false, false, true], `EXECUTE ${sig}`);
    }
    for (const sig of ["acc_external_send_content_hash(text,text,text[])", "acc_int_require_competence(uuid,uuid,text[],text)", "acc_user_has_competence(uuid,uuid,text[])"]) {
      const r = (await su.query(`select has_function_privilege('anon','public.${sig}','execute') a, has_function_privilege('authenticated','public.${sig}','execute') u`)).rows[0];
      eq([r.a, r.u], [false, false], `interna fechada ${sig}`);
    }
    eq(await nq(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prosecdef
      and p.proname in ('project_competence_revalidate','acc_external_send_prepare_with_content','acc_int_require_competence') and p.proconfig @> array['search_path=""']`), 3, "search_path vazio");
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
