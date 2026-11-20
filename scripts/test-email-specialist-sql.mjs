// ESPECIALISTA por e-mail (Lote 3, migration 20261121170000) em PGlite (replay de TODAS as migrations; sem rede, sem Gmail/Supabase
// reais, sem e-mails reais) + fase real token-replies-phase com Gmail FAKE e consultor de IA FAKE:
//   A) SQL: tabela sem acesso de usuários; RPCs só service_role; registrar (membro ATIVO, não LEITURA, idempotente por mensagem,
//      ALTO/CRÍTICO força revisão humana, auditoria SEM a pergunta); concluir; nenhuma outra tabela é tocada;
//   B) fase: ESPECIALISTA em SLA / resumo / contrato (Expert pela área), o item NÃO muda e o token NÃO é consumido; RESOLVIDO com o mesmo
//      token continua valendo; desligado por padrão; remetentes forjados/LEITURA/não ator; duplicada; owner-strict;
//   C) resposta do Expert (consultor FAKE com limite) e entrega de recibo + resposta UMA vez, na conversa do remetente.
// Uso: node scripts/test-email-specialist-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const db = new PGlite();
await db.exec(platform);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, ""));
}
await db.exec("insert into storage.buckets (id, name) values ('project-documents', 'project-documents') on conflict do nothing");

const P = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000000b1",
  RESP: "00000000-0000-4000-8000-0000000000b2",
  COLAB2: "00000000-0000-4000-8000-0000000000b3",
  LEITURA: "00000000-0000-4000-8000-0000000000b4",
  OUTRA: "00000000-0000-4000-8000-0000000000b5",
};
const PEOPLE = [
  [U.ADMIN, "Admin Obra", "admin.obra@axion.com.br", "ADMINISTRADOR", P],
  [U.RESP, "Carlos Evandro", "carlos.evandro@axion.com.br", "COLABORADOR", P],
  [U.COLAB2, "Maria Souza", "maria.souza@axion.com.br", "COLABORADOR", P],
  [U.LEITURA, "Leo Leitura", "leo.leitura@axion.com.br", "LEITURA", P],
  [U.OUTRA, "Otto Outra", "otto.outra@axion.com.br", "COLABORADOR", P2],
];
for (const [id, name, email] of PEOPLE) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do update set name = excluded.name, email = excluded.email", [id, name, email]);
}
for (const [id, code] of [[P, "WEG-SIM"], [P2, "OUTRA-SIM"]]) {
  await db.query("insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ($1, $2, $2, 'x', 'x', date '2026-01-01', date '2027-01-01')", [id, code]);
}
for (const [id, , , permission, project] of PEOPLE) {
  await db.query("insert into public.project_memberships (project_id, user_id, permission, status, area) values ($1, $2, $3, 'ACTIVE', 'PLANEJAMENTO')", [project, id, permission]);
}

const as = (uid) => db.exec(`select set_config('app.uid','${uid ?? ""}',false)`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message).includes(code), `esperado ${code}, veio: ${error.message}`);
    return;
  }
  throw new Error(`esperado erro ${code}, mas a operação passou`);
}
let seq = 0;
const uuid = (prefix) => {
  seq += 1;
  return `00000000-0000-4000-8000-${prefix}${String(seq).padStart(12 - prefix.length, "0")}`;
};
async function newSla({ risk = "MEDIUM", responsible = U.RESP, status = "PENDING", project = P } = {}) {
  const id = uuid("1");
  await db.query(
    "insert into public.sla_actions (id, project_id, origin, title, risk_level, area, responsible_user_id, status, assume_due_at, complete_due_at, created_by_type) values ($1,$2,'OTHER',$3,$4,'PLANEJAMENTO',$5,$6, now() + interval '1 hour', now() + interval '3 days','SYSTEM')",
    [id, project, `Ação ${id.slice(-4)}`, risk, responsible, status]
  );
  return id;
}
async function newDigest({ recipient = U.RESP, n = 2 } = {}) {
  const actions = [];
  for (let i = 0; i < n; i += 1) actions.push(await newSla({ risk: i === 0 ? "MEDIUM" : "LOW", responsible: recipient }));
  seq += 1;
  const digest = (await one("insert into public.weekly_alert_digests (project_id, recipient_user_id, week_date, status, intended_recipient_email, sent_at) values ($1,$2,date '2026-01-05' + $3::int,'SENT','x@axion.com.br', now()) returning id", [P, recipient, seq])).id;
  const items = [];
  for (const [i, a] of actions.entries()) {
    items.push((await one("insert into public.weekly_alert_digest_items (digest_id, action_id, position, risk_level, title_snapshot) values ($1,$2,$3,$4,'Item') returning id", [digest, a, i + 1, i === 0 ? "MEDIUM" : "LOW"])).id);
  }
  return { digest, actions, items };
}
async function newBatch({ recipient = U.RESP, severities = ["ALTA", "MEDIA"] } = {}) {
  const batch = (await one("insert into public.contract_alert_batches (project_id, recipient_user_id, intended_recipient_email, status, sent_at) values ($1,$2,'carlos.evandro@axion.com.br','SENT', now()) returning id", [P, recipient])).id;
  const items = [];
  for (const [i, sev] of severities.entries()) {
    const ev = uuid("2");
    await db.query("insert into public.contract_events (id, project_id, occurred_at, title, description, source_type, status, created_by_type) values ($1,$2, now(), 'Evento', 'd', 'CONTRATO', 'NOVO', 'SYSTEM')", [ev, P]);
    items.push({ ev, id: (await one("insert into public.contract_alert_batch_items (batch_id,event_id,position,severity,title_snapshot) values ($1,$2,$3,$4,'Alerta') returning id", [batch, ev, i + 1, sev])).id });
  }
  return { batch, items };
}
const audits = async (entityId, action) => (await db.query("select actor_type, actor_user_id, detail from public.audit_log_entries where entity_id = $1 and action = $2 order by occurred_at, id", [entityId, action])).rows;
let msgSeq = 0;
const msg = () => `msg-${(msgSeq += 1)}`;

// ======================================================================= B) fase real (adaptador + Gmail fake)
function createPgSupabase(database, { failRpc = new Set() } = {}) {
  class Builder {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.cols = "*";
      this.filters = [];
      this.params = [];
      this.orders = [];
      this.rangeArgs = null;
      this.limitN = null;
      this.single = null;
      this.returning = null;
    }
    p(v) {
      this.params.push(v);
      return `$${this.params.length}`;
    }
    select(cols = "*") {
      if (this.op === "select") this.cols = cols;
      else this.returning = cols;
      return this;
    }
    eq(c, v) { this.filters.push(`${c} = ${this.p(v)}`); return this; }
    neq(c, v) { this.filters.push(`${c} <> ${this.p(v)}`); return this; }
    gte(c, v) { this.filters.push(`${c} >= ${this.p(v)}`); return this; }
    lt(c, v) { this.filters.push(`${c} < ${this.p(v)}`); return this; }
    is(c, v) { this.filters.push(v === null ? `${c} is null` : `${c} is ${v}`); return this; }
    in(c, vs) { this.filters.push(vs.length ? `${c} in (${vs.map((v) => this.p(v)).join(",")})` : "false"); return this; }
    order(c, { ascending = true } = {}) { this.orders.push(`${c} ${ascending ? "asc" : "desc"}`); return this; }
    range(a, b) { this.rangeArgs = [a, b]; return this; }
    limit(n) { this.limitN = n; return this; }
    maybeSingle() { this.single = "maybe"; return this; }
    single() { this.single = "one"; return this; }
    insert(rows) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    update(obj) { this.op = "update"; this.obj = obj; return this; }
    where() { return this.filters.length ? ` where ${this.filters.join(" and ")}` : ""; }
    async exec() {
      try {
        let sql;
        if (this.op === "select") {
          sql = `select ${this.cols} from public.${this.table}${this.where()}${this.orders.length ? ` order by ${this.orders.join(", ")}` : ""}`;
          if (this.rangeArgs) sql += ` limit ${this.rangeArgs[1] - this.rangeArgs[0] + 1} offset ${this.rangeArgs[0]}`;
          else if (this.limitN) sql += ` limit ${this.limitN}`;
        } else if (this.op === "insert") {
          const cols = Object.keys(this.rows[0]);
          const values = this.rows.map((r) => `(${cols.map((c) => this.p(r[c] === undefined ? null : r[c])).join(",")})`).join(",");
          sql = `insert into public.${this.table} (${cols.join(",")}) values ${values}${this.returning ? ` returning ${this.returning}` : ""}`;
        } else {
          const sets = Object.entries(this.obj).map(([c, v]) => `${c} = ${this.p(v)}`).join(", ");
          // os filtros já usaram parâmetros: renumeração simples (sets primeiro)
          sql = `update public.${this.table} set ${sets}${this.where()}${this.returning ? ` returning ${this.returning}` : ""}`;
        }
        const { rows } = await database.query(sql, this.params);
        if (this.single === "maybe") return { data: rows[0] ?? null, error: null };
        if (this.single === "one") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not single" } };
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }
    }
    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  }
  const calls = { rpc: [] };
  return {
    calls,
    from: (table) => new Builder(table),
    async rpc(name, args) {
      calls.rpc.push(name);
      if (failRpc.has(name)) return { data: null, error: { message: "falha simulada de conexão" } };
      const keys = Object.keys(args);
      try {
        const { rows } = await database.query(`select * from public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`, keys.map((k) => args[k]));
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message } };
      }
    },
    storage: {
      from: () => ({
        async upload(name) {
          try {
            await putObject(name);
            return { data: { path: name }, error: null };
          } catch (error) {
            return { data: null, error: { message: error.message } };
          }
        },
      }),
    },
  };
}


const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const b64 = (b) => Buffer.from(b).toString("base64url");
let gmailSeq = 0;
function createFakeGmail() {
  const messages = new Map();
  const attachments = new Map();
  return {
    messages,
    add({ from = "carlos.evandro@axion.com.br", token, body, at = new Date(Date.now() - 60_000).toISOString(), auth = AUTH_OK, file = null }) {
      gmailSeq += 1;
      const id = `n3-gmail-${gmailSeq}`;
      const parts = [{ mimeType: "text/plain", body: { data: b64(body) } }];
      if (file) {
        attachments.set(`att-${id}`, file.bytes);
        parts.push({ mimeType: file.mime ?? "application/pdf", filename: file.name ?? "evidencia.pdf", body: { attachmentId: `att-${id}`, size: file.bytes.length } });
      }
      const headers = [
        { name: "From", value: from },
        { name: "To", value: `crm+alerta-${token}@axion.com.br` },
        { name: "Subject", value: "RESOLVIDO [ACC-SLA:X]" },
        { name: "Message-ID", value: `<${id}@mail.axion.com.br>` },
      ];
      if (auth) headers.push({ name: "Authentication-Results", value: auth });
      messages.set(id, { id, threadId: `t-${id}`, internalDate: String(Date.parse(at)), labelIds: ["INBOX"], payload: { mimeType: "multipart/mixed", headers, parts } });
      return id;
    },
    users: {
      messages: {
        list: async () => ({ data: { messages: [...messages.keys()].map((id) => ({ id })) } }),
        get: async ({ id }) => ({ data: messages.get(id) }),
        attachments: { get: async ({ id }) => ({ data: { data: b64(attachments.get(id)) } }) },
      },
    },
  };
}
async function putObject(name) {
  await db.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1) on conflict do nothing", [name]);
}

const { runTokenRepliesPhase } = await import("./lib/token-replies-phase.mjs");
const { deliverEmailReplyConfirmations } = await import("../apps/web/lib/email-replies/token-reply-confirmations");
const { hashReplyToken, generateReplyToken } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
// Sem data fixa: relógio real (tokens expiram em 30 dias a partir de agora; mensagens chegaram há 1 minuto).
const NOW = () => new Date();
async function issue(kind, subjectId, recipient = U.RESP, project = P) {
  const token = generateReplyToken();
  await db.query("insert into public.email_reply_tokens (token_hash, project_id, subject_kind, subject_id, recipient_user_id, expires_at) values ($1,$2,$3,$4,$5, now() + interval '30 days')", [hashReplyToken(token), project, kind, subjectId, recipient]);
  return token;
}
const run = (gmail, opts = {}) => runTokenRepliesPhase({ supabase: createPgSupabase(db, opts), gmail, mailbox: "crm@axion.com.br", projectIds: [P, P2], now: NOW, env: opts.env ?? { ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "200" } });
const confirmationOf = (gmailId) => one("select * from public.email_reply_confirmations where inbound_provider_message_id = $1", [gmailId]);
const logOf = (gmailId) => one("select outcome, reason from public.email_reply_inbound_log where flow = 'TOKEN' and provider_message_id = $1", [gmailId]);

// ======================================================================= ESPECIALISTA por e-mail (Lote 3)
const { answerPendingSpecialistConsultations, deliverSpecialistMails, recordSpecialistConsultation } = await import("../apps/web/lib/email-replies/specialist-consultations");
const SPEC_ENV = { ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "200", ACC_EMAIL_SPECIALIST_ENABLED: "true" };
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const consultOf = (gmailId) => one("select * from public.email_specialist_consultations where provider_message_id = $1", [gmailId]);
const SLA_FINGERPRINT = "select status, responsible_user_id, assume_due_at, complete_due_at, current_escalation_level, acknowledged_by_user_id, completed_at from public.sla_actions where id = $1";
const Q = "ESPECIALISTA: qual a melhor alternativa para recuperar o atraso desta frente de trabalho?";

// ---------------------------------------------------------------- A) SQL
await check("A1 grants: tabela sem acesso de anon/authenticated (RLS); RPCs só service_role; nenhuma função anterior redefinida pela migration", async () => {
  const t = await one("select relrowsecurity as rls, has_table_privilege('authenticated','public.email_specialist_consultations','select') as a, has_table_privilege('anon','public.email_specialist_consultations','select') as n, has_table_privilege('service_role','public.email_specialist_consultations','update') as s from pg_class where oid = 'public.email_specialist_consultations'::regclass");
  assert(t.rls && !t.a && !t.n && t.s, JSON.stringify(t));
  for (const fn of ["public.email_specialist_consult_record(uuid,uuid,text,text,text,text,text,text,text,text,text,boolean,text,text,text,text)", "public.email_specialist_consult_complete(uuid,text,text,numeric)"]) {
    const r = await one(`select has_function_privilege('authenticated','${fn}','execute') as a, has_function_privilege('anon','${fn}','execute') as n, has_function_privilege('service_role','${fn}','execute') as s`);
    assert(!r.a && !r.n && r.s, `${fn}: ${JSON.stringify(r)}`);
  }
  const mig = readFileSync(path.join(dir, "20261121170000_email_specialist_consultations.sql"), "utf8");
  assert(!/create or replace function public\.(record_risk_alert_action|sla_action_|submit_weekly|save_contract|ssma_corrective|email_reply_)/i.test(mig), "a migration não redefine funções existentes (hotfix P0 e *_by_email intactos)");
  assert(/set search_path = ''/.test(mig) && (mig.match(/security definer/g) ?? []).length === 2);
});
await check("A2 registrar: membro ATIVO comum grava; idempotente por mensagem; LEITURA e não membro recusados; ALTO/CRÍTICO força revisão; auditoria SEM a pergunta; item de origem intocado", async () => {
  const a = await newSla({ risk: "HIGH" });
  const before = await one(SLA_FINGERPRINT, [a]);
  const call = (actor, mid, over = {}) => db.query("select public.email_specialist_consult_record($1,$2,'TOKEN','SLA_ACTION',$3,$4,'PLANEJAMENTO',$5,'planning-director','AREA',$6,$7,'carlos.evandro@axion.com.br','<x@m>','<x@m>','RE: ESPECIALISTA')", [actor, over.project ?? P, a, mid, over.severity ?? "HIGH", over.question ?? "Pergunta SEGREDOSIGILOSO sobre a frente B?", over.review ?? false]);
  const m1 = msg();
  const r = await call(U.RESP, m1);
  assert(r.rows[0].email_specialist_consult_record, "id retornado");
  const row = await consultOf(m1);
  assert(row.requires_human_review === true && row.severity === "HIGH" && row.status === "RECEIVED" && row.receipt_status === "PENDING" && row.answer_mail_status === "NONE", JSON.stringify(row));
  await expectError(call(U.RESP, m1), "MESSAGE_ALREADY_APPLIED");
  await expectError(call(U.LEITURA, msg()), "READ_ONLY_PROFILE");
  await expectError(call(U.OUTRA, msg()), "PROJECT_ACCESS_DENIED");
  await expectError(call(U.RESP, msg(), { project: P2 }), "PROJECT_ACCESS_DENIED");
  await expectError(call(null, msg()), "AUTH_REQUIRED");
  await expectError(call(U.RESP, msg(), { question: "curta" }), "QUESTION_REQUIRED");
  await expectError(db.query("select public.email_specialist_consult_record($1,$2,'TOKEN','SLA_ACTION','x','m-x','PLANEJAMENTO','HIGH','axia','AREA','Pergunta válida aqui',true,'a@axion.com.br',null,null,null)", [U.RESP, P]), "email_specialist_consultations_expert_id_check");
  const medium = await call(U.RESP, msg(), { severity: "MEDIUM", review: false });
  const mediumRow = await one("select requires_human_review from public.email_specialist_consultations where id = $1", [medium.rows[0].email_specialist_consult_record]);
  assert(mediumRow.requires_human_review === false, "MÉDIO respeita o parâmetro; ALTO/CRÍTICO sempre true");
  const audit = await audits(row.id, "EMAIL_SPECIALIST_CONSULT_REQUESTED");
  assert(audit.length === 1 && audit[0].actor_type === "USER" && audit[0].actor_user_id === U.RESP && !/SEGREDOSIGILOSO/.test(audit[0].detail) && /não foi alterado/.test(audit[0].detail), JSON.stringify(audit));
  const after = await one(SLA_FINGERPRINT, [a]);
  assert(JSON.stringify(before) === JSON.stringify(after), "ação SLA idêntica antes/depois");
  assert((await rows("select 1 from public.email_reply_command_receipts where subject_id = $1", [a])).length === 0, "nenhum recibo de comando (não é tratamento)");
});
await check("A3 concluir: ANSWERED/QUOTA_BLOCKED/FAILED; segunda conclusão e status inválido recusados; resposta exigida; auditoria SEM a resposta", async () => {
  const a = await newSla();
  const ids = [];
  for (let i = 0; i < 4; i += 1) ids.push((await db.query("select public.email_specialist_consult_record($1,$2,'TOKEN','SLA_ACTION',$3,$4,'PLANEJAMENTO','MEDIUM','planning-director','AREA','Pergunta válida para o especialista',false,'carlos.evandro@axion.com.br',null,null,null) as id", [U.RESP, P, a, msg()])).rows[0].id);
  await expectError(db.query("select public.email_specialist_consult_complete($1,'ANSWERED','  ',0.5)", [ids[0]]), "ANSWER_REQUIRED");
  await expectError(db.query("select public.email_specialist_consult_complete($1,'OUTRO','x',0.5)", [ids[0]]), "INVALID_STATUS");
  await db.query("select public.email_specialist_consult_complete($1,'ANSWERED','RESPOSTASIGILOSA recomendada',0.7)", [ids[0]]);
  await expectError(db.query("select public.email_specialist_consult_complete($1,'FAILED',null,null)", [ids[0]]), "CONSULTATION_ALREADY_CLOSED");
  await db.query("select public.email_specialist_consult_complete($1,'QUOTA_BLOCKED',null,null)", [ids[1]]);
  await db.query("select public.email_specialist_consult_complete($1,'FAILED',null,null)", [ids[2]]);
  const r0 = await one("select status, answer_mail_status, answer_confidence from public.email_specialist_consultations where id = $1", [ids[0]]);
  assert(r0.status === "ANSWERED" && r0.answer_mail_status === "PENDING" && Number(r0.answer_confidence) === 0.7, JSON.stringify(r0));
  const sys = await audits(ids[0], "EMAIL_SPECIALIST_CONSULT_ANSWERED");
  assert(sys.length === 1 && sys[0].actor_type === "SYSTEM" && !/RESPOSTASIGILOSA/.test(sys[0].detail), JSON.stringify(sys));
  await expectError(db.query("select public.email_specialist_consult_complete($1,'ANSWERED','x',0.5)", ["00000000-0000-4000-8000-00000000dead"]), "CONSULTATION_NOT_FOUND");
});

// ---------------------------------------------------------------- B) fase
await check("B1 ESPECIALISTA em SLA / resumo / contrato: Expert pela área; item INALTERADO; token NÃO consumido; RESOLVIDO com o MESMO token ainda funciona; sem confirmação de tratamento", async () => {
  const sla = await newSla({ risk: "HIGH" });
  const { items } = await newDigest({ recipient: U.RESP, n: 1 });
  const digestAction = (await one("select action_id from public.weekly_alert_digest_items where id = $1", [items[0]])).action_id;
  const { items: cItems } = await newBatch({ recipient: U.RESP, severities: ["ALTA"] });
  const before = { sla: await one(SLA_FINGERPRINT, [sla]), digest: await one(SLA_FINGERPRINT, [digestAction]), contractResp: (await one("select * from public.contract_alert_batch_items where id = $1", [cItems[0].id])) };
  const gmail = createFakeGmail();
  const tSla = await issue("SLA_ACTION", sla);
  const gSla = gmail.add({ token: tSla, body: Q });
  const gDig = gmail.add({ token: await issue("WEEKLY_DIGEST_ITEM", items[0]), body: Q });
  const gCon = gmail.add({ token: await issue("CONTRACT_ALERT_ITEM", cItems[0].id), body: "ESPECIALISTA: a cláusula de multa por atraso se aplica a este evento do contrato?" });
  const supa = createPgSupabase(db);
  const s = await runTokenRepliesPhase({ supabase: supa, gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  assert(s.specialist === 3 && s.processed === 0 && s.errors === 0, JSON.stringify(s));
  assert(supa.calls.rpc.every((fn) => fn === "email_specialist_consult_record"), `só a RPC do ESPECIALISTA: ${supa.calls.rpc}`);
  const [cs, cd, cc] = [await consultOf(gSla), await consultOf(gDig), await consultOf(gCon)];
  assert(cs.expert_id === "planning-director" && cs.routing_source === "AREA" && cs.requires_human_review === true && cs.severity === "HIGH" && cs.subject_kind === "SLA_ACTION" && cs.flow === "TOKEN", JSON.stringify(cs));
  assert(cd.expert_id === "planning-director" && cd.subject_kind === "WEEKLY_DIGEST_ITEM" && cd.requires_human_review === false, JSON.stringify(cd));
  assert(cc.expert_id === "legal-consultant" && cc.routing_source === "TOPIC" && cc.subject_kind === "CONTRACT_ALERT_ITEM" && cc.requires_human_review === true, JSON.stringify(cc));
  assert(cs.recipient_email === "carlos.evandro@axion.com.br" && cs.requested_by_user_id === U.RESP);
  assert(JSON.stringify(before.sla) === JSON.stringify(await one(SLA_FINGERPRINT, [sla])) && JSON.stringify(before.digest) === JSON.stringify(await one(SLA_FINGERPRINT, [digestAction])), "SLA/resumo intactos");
  assert(JSON.stringify(before.contractResp) === JSON.stringify(await one("select * from public.contract_alert_batch_items where id = $1", [cItems[0].id])), "item do contrato intacto");
  for (const id of [gSla, gDig, gCon]) {
    assert(!(await confirmationOf(id)), "sem confirmação de tratamento (o recibo vai pela fila do ESPECIALISTA)");
    assert((await logOf(id)).outcome === "APPLIED" && (await logOf(id)).reason === "SPECIALIST");
  }
  assert((await rows("select consumed_by_message_id from public.email_reply_tokens where subject_id = any($1)", [[sla, items[0], cItems[0].id]])).every((r) => r.consumed_by_message_id === null), "tokens NÃO consumidos");
  const again = await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  assert(again.matched === 0 && (await rows("select 1 from public.email_specialist_consultations where subject_id = $1", [sla])).length === 1, `idempotente: ${JSON.stringify(again)}`);
  // o MESMO token ainda aplica RESOLVIDO depois da consulta
  const gRes = gmail.add({ token: tSla, body: "RESOLVIDO: frente B replanejada e validada", file: { bytes: Buffer.from("%PDF-1.4 evidencia"), name: "ev.pdf" }, at: new Date(Date.now() - 30_000).toISOString() });
  const sr = await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  assert(sr.processed === 1, JSON.stringify(sr));
  assert((await one("select status from public.sla_actions where id = $1", [sla])).status === "COMPLETED" && (await confirmationOf(gRes)).outcome === "APPLIED");
});
await check("B2 padrão DESLIGADO: sem ACC_EMAIL_SPECIALIST_ENABLED a pergunta é recusada com explicação (nada gravado); contrato sem tema => pede o tema", async () => {
  const sla = await newSla();
  const { items: cItems } = await newBatch({ recipient: U.RESP, severities: ["MEDIA"] });
  const gmail = createFakeGmail();
  const g1 = gmail.add({ token: await issue("SLA_ACTION", sla), body: Q });
  const s = await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: { ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "200" } });
  assert(s.rejected === 1 && s.specialist === undefined, JSON.stringify(s));
  const c = await confirmationOf(g1);
  assert(c.outcome === "INCOMPLETE" && /ainda não está habilitada/.test(c.detail_line) && !(await consultOf(g1)), JSON.stringify(c));
  const g2 = gmail.add({ token: await issue("CONTRACT_ALERT_ITEM", cItems[0].id), body: "ESPECIALISTA: o que você acha disso aqui exatamente?" });
  await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  assert((await logOf(g2)).reason === "SPECIALIST_AREA_UNKNOWN" && !(await consultOf(g2)) && /Cite o tema/.test((await confirmationOf(g2)).detail_line));
});
await check("B3 remetente forjado / não autorizado: sem autenticação, não corporativo, LEITURA, outra obra e colaborador que não é ator do item NÃO geram consulta", async () => {
  const sla = await newSla();
  const token = await issue("SLA_ACTION", sla);
  const gmail = createFakeGmail();
  const bad = [
    gmail.add({ token, body: Q, auth: null }),
    gmail.add({ token, body: Q, from: "invasor@gmail.com" }),
    gmail.add({ token, body: Q, from: "leo.leitura@axion.com.br" }),
    gmail.add({ token, body: Q, from: "otto.outra@axion.com.br" }),
    gmail.add({ token, body: Q, from: "maria.souza@axion.com.br" }),
    gmail.add({ token, body: Q, auth: "mx.google.com; dkim=fail header.i=@axion.com.br; dmarc=fail header.from=axion.com.br" }),
  ];
  const s = await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P, P2], now: NOW, env: SPEC_ENV });
  assert(s.unauthorized === bad.length && s.specialist === undefined, JSON.stringify(s));
  for (const id of bad) assert(!(await consultOf(id)), "nenhuma consulta");
});
await check("B4 forjado via banco: o RPC revalida membro ATIVO / não LEITURA mesmo com decisão errada do worker; mistura e pergunta curta pedem correção", async () => {
  const sla = await newSla();
  const gmail = createFakeGmail();
  const tok = await issue("SLA_ACTION", sla);
  const gMix = gmail.add({ token: tok, body: "ESPECIALISTA: posso fechar esta ação agora?\nRESOLVIDO: feito e conferido" });
  const gShort = gmail.add({ token: tok, body: "ESPECIALISTA: ok" });
  await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  assert((await logOf(gMix)).reason === "COMMAND_AMBIGUOUS" && (await logOf(gShort)).reason === "SPECIALIST_QUESTION_REQUIRED");
  assert((await one("select status from public.sla_actions where id = $1", [sla])).status === "PENDING", "mistura não resolveu a ação");
  const direct = await recordSpecialistConsultation(createPgSupabase(db), { actorUserId: U.LEITURA, projectId: P, flow: "TOKEN", subjectKind: "SLA_ACTION", subjectId: sla, providerMessageId: msg(), record: { expertId: "planning-director", routingSource: "AREA", question: "Pergunta válida para o especialista", area: "PLANEJAMENTO", severity: "LOW", requiresHumanReview: false }, recipientEmail: "leo.leitura@axion.com.br", inReplyTo: null, references: [], originalSubject: null });
  assert(!direct.ok && direct.code === "READ_ONLY_PROFILE", JSON.stringify(direct));
});

// ---------------------------------------------------------------- C) resposta do Expert + entrega
function fakeConsultant({ failFor = new Set(), quotaFor = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    async answer(input) {
      calls.push(input);
      if (quotaFor.has(input.question)) throw new Error("Limite de IA não reservado (planning-director): Você atingiu o limite diário de consultas ao especialista de IA.");
      if (failFor.has(input.question)) throw new Error("provedor indisponível");
      return { answerText: `Recomendação (${input.expertId}): reprogramar a frente e validar com o cliente.`, confidence: 0.64, requiresHumanReview: true };
    },
  };
}
function fakeProvider({ failTo = new Set() } = {}) {
  const sent = [];
  return { sent, async send(m) { if (failTo.has(m.to)) throw new Error("falha"); sent.push(m); return { providerMessageId: `prov-${sent.length}`, sentAt: "2026-11-20T13:00:00.000Z" }; } };
}
await check("C1 resposta do Expert: consultor FAKE (limite reservado por usuário/obra no consultor real); AXIA nunca; resposta é recomendação com revisão humana; limite => QUOTA_BLOCKED; falhas repetem 3x e viram FAILED", async () => {
  await db.exec("delete from public.email_specialist_consultations");
  const sla = await newSla({ risk: "CRITICAL" });
  const gmail = createFakeGmail();
  const qOk = "ESPECIALISTA: como recuperar o atraso da frente B sem custo adicional ao cliente?";
  const qQuota = "ESPECIALISTA: qual o impacto do atraso no caminho crítico do cronograma?";
  const qFail = "ESPECIALISTA: a atividade de montagem precisa de nova sequência de execução?";
  const g1 = gmail.add({ token: await issue("SLA_ACTION", sla), body: qOk });
  const g2 = gmail.add({ token: await issue("SLA_ACTION", sla), body: qQuota });
  const g3 = gmail.add({ token: await issue("SLA_ACTION", sla), body: qFail });
  await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  const consultant = fakeConsultant({ quotaFor: new Set([qQuota.replace(/^ESPECIALISTA:\s*/, "")]), failFor: new Set([qFail.replace(/^ESPECIALISTA:\s*/, "")]) });
  const supa = createPgSupabase(db);
  const r1 = await answerPendingSpecialistConsultations({ client: supa, consultant });
  assert(r1.answered === 1 && r1.quotaBlocked === 1 && r1.retry === 1 && r1.failed === 0, JSON.stringify(r1));
  assert(consultant.calls.length === 3 && consultant.calls.every((c) => ["planning-director"].includes(c.expertId) && c.askedByUserId === U.RESP && c.projectId === P), JSON.stringify(consultant.calls));
  assert(!JSON.stringify(consultant.calls).match(/axia/i), "AXIA nunca");
  assert((await consultOf(g1)).status === "ANSWERED" && (await consultOf(g2)).status === "QUOTA_BLOCKED" && (await consultOf(g3)).status === "RECEIVED");
  await answerPendingSpecialistConsultations({ client: supa, consultant });
  const r3 = await answerPendingSpecialistConsultations({ client: supa, consultant });
  assert(r3.failed === 1 && (await consultOf(g3)).status === "FAILED" && (await consultOf(g3)).answer_attempts === 3, JSON.stringify(r3));
  const again = await answerPendingSpecialistConsultations({ client: supa, consultant });
  assert(again.pending === 0, "nada mais pendente");
  assert((await consultOf(g1)).answer_text.startsWith("Recomendação (planning-director)"));
  // o item de origem continua intacto durante todo o processo
  assert((await one("select status from public.sla_actions where id = $1", [sla])).status === "PENDING");
});
await check("C2 entrega: recibo + resposta UMA vez cada, na conversa do remetente; ALTO/CRÍTICO com aviso de revisão humana; limite/falha explicados; falha de envio repete (até 5)", async () => {
  const provider = fakeProvider();
  const supa = createPgSupabase(db);
  const d1 = await deliverSpecialistMails({ client: supa, provider });
  assert(d1.receiptsSent === 3 && d1.answersSent === 3 && d1.failed === 0, JSON.stringify(d1));
  const answer = provider.sent.find((m) => /Parecer de Diretor de Planejamento/.test(m.text));
  assert(answer && /RECOMENDAÇÃO, não decisão/.test(answer.text) && /ALTO\/CRÍTICO/.test(answer.text) && /REVISÃO HUMANA/.test(answer.text) && /não alterou o item/.test(answer.text), answer?.text);
  assert(provider.sent.some((m) => /limite diário/.test(m.text)) && provider.sent.some((m) => /Não foi possível obter a resposta/.test(m.text)), "limite e falha explicados");
  assert(provider.sent.every((m) => m.to === "carlos.evandro@axion.com.br" && m.inReplyTo && m.vera?.projectId === P && !/axia/i.test(`${m.subject}${m.text}`)), "mesma conversa, só ao remetente, sem AXIA");
  const d2 = await deliverSpecialistMails({ client: supa, provider });
  assert(d2.receiptsSent === 0 && d2.answersSent === 0, `UMA vez: ${JSON.stringify(d2)}`);
  // falha de envio: tenta de novo
  await db.exec("delete from public.email_specialist_consultations");
  const sla = await newSla();
  const gmail = createFakeGmail();
  const g = gmail.add({ token: await issue("SLA_ACTION", sla), body: Q });
  await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: SPEC_ENV });
  const flaky = fakeProvider({ failTo: new Set(["carlos.evandro@axion.com.br"]) });
  const f1 = await deliverSpecialistMails({ client: supa, provider: flaky });
  assert(f1.failed === 1 && (await consultOf(g)).receipt_status === "FAILED", JSON.stringify(f1));
  const f2 = await deliverSpecialistMails({ client: supa, provider: fakeProvider() });
  assert(f2.receiptsSent === 1 && (await consultOf(g)).receipt_status === "SENT" && (await consultOf(g)).receipt_attempts === 2, JSON.stringify(f2));
});
await check("D1 owner-strict na fase (ACC_EMAIL_TOKEN_OWNER_STRICT=true): token emitido a outro destinatário só vale para o dono, o responsável atual ou o Administrador", async () => {
  const sla = await newSla();
  const gmail = createFakeGmail();
  // token emitido ao colaborador 2 (que não é responsável): o responsável atual (Carlos) e o Administrador continuam podendo
  const t = await issue("SLA_ACTION", sla, U.COLAB2);
  const g = gmail.add({ token: t, body: Q });
  const s = await runTokenRepliesPhase({ supabase: createPgSupabase(db), gmail, mailbox: "crm@axion.com.br", projectIds: [P], now: NOW, env: { ...SPEC_ENV, ACC_EMAIL_TOKEN_OWNER_STRICT: "true" } });
  assert(s.specialist === 1 && (await consultOf(g)), JSON.stringify(s));
});

console.log(`
RESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
