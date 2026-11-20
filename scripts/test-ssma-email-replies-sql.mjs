// P2 — SSMA por e-mail de ponta a ponta em PGlite (replay de TODAS as migrations, sem rede, sem Gmail/Supabase reais).
//  A) RPCs *_by_email (migration 20261120160000): mesma regra das RPCs do app; originais inalteradas; grants só service_role;
//     email_reply_tokens / email_inbound_attachments / email_reply_inbound_log sem acesso de usuários.
//  B) Fase `replies` SSMA real (scripts/lib/ssma-replies-phase.mjs) contra o banco local via adaptador mínimo estilo
//     supabase-js e Gmail FAKE: bug do teto de 2000 linhas, andamento pela RPC, conclusão com/sem foto, encaminhar por nome,
//     nome ambíguo, token por item, autenticação ausente (resposta explicativa), idempotência, limite de taxa e
//     confirmação só depois da gravação.
// Uso: node scripts/test-ssma-email-replies-sql.mjs
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

const P = "00000000-0000-4000-8000-000000000001"; // obra WEG (escopo do piloto SSMA)
const U = {
  ADMIN: "00000000-0000-4000-8000-0000000000a1",
  RESP: "00000000-0000-4000-8000-0000000000a2",
  COLAB2: "00000000-0000-4000-8000-0000000000a3",
  LEITURA: "00000000-0000-4000-8000-0000000000a4",
  HOMONIMO1: "00000000-0000-4000-8000-0000000000a5",
  HOMONIMO2: "00000000-0000-4000-8000-0000000000a6",
};
const PEOPLE = [
  [U.ADMIN, "Admin Obra", "admin.obra@axion.com.br", "ADMINISTRADOR"],
  [U.RESP, "Carlos Evandro", "carlos.evandro@axion.com.br", "COLABORADOR"],
  [U.COLAB2, "Maria Souza", "maria.souza@axion.com.br", "COLABORADOR"],
  [U.LEITURA, "Leo Leitura", "leo.leitura@axion.com.br", "LEITURA"],
  [U.HOMONIMO1, "Ana Lima", "ana.lima1@axion.com.br", "COLABORADOR"],
  [U.HOMONIMO2, "Ana Lima", "ana.lima2@axion.com.br", "COLABORADOR"],
];
for (const [id, name, email] of PEOPLE) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("insert into public.profiles (id, name, email, origin) values ($1, $2, $3, 'AXION_INTERNO') on conflict (id) do update set name = excluded.name, email = excluded.email", [id, name, email]);
}
await db.query("insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ($1, 'WEG-SIM', 'WEG (SIMULADO)', 'x', 'x', date '2026-01-01', date '2027-01-01')", [P]);
for (const [id, , , permission] of PEOPLE) {
  await db.query("insert into public.project_memberships (project_id, user_id, permission, status, area) values ($1, $2, $3, 'ACTIVE', 'SSMA/ESG')", [P, id, permission]);
}

let seq = 0;
async function newSsmaAction({ linkSla = false, risk = "ALTA" } = {}) {
  seq += 1;
  const rec = `00000000-0000-4000-8000-0000000005${String(seq).padStart(2, "0")}`;
  const act = `00000000-0000-4000-8000-0000000006${String(seq).padStart(2, "0")}`;
  await db.query(
    "insert into public.ssma_field_records (id, project_id, kind, category, description, location, occurred_at, client_created_at, risk_level, reported_by_user_id, responsible_user_id, due_date) values ($1,$2,'OCORRENCIA','EPI','Sem capacete na frente B.','Pátio', now(), now(), $4, $3, $3, current_date + 3)",
    [rec, P, U.RESP, risk]
  );
  await db.query("insert into public.ssma_corrective_actions (id, record_id, project_id, responsible_user_id, due_date) values ($1,$2,$3,$4,current_date + 3)", [act, rec, P, U.RESP]);
  if (linkSla) await db.query("select public.ssma_link_sla_action($1)", [act]);
  return { rec, act };
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
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(2048, 7)]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function putObject(name) {
  await db.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [name]);
}

// ======================================================================= A) SQL
await check("A1 tabelas novas: RLS ligada, nenhum privilégio para anon/authenticated; service_role lê/grava; tipos de token previstos", async () => {
  for (const t of ["email_reply_tokens", "email_inbound_attachments", "email_reply_inbound_log"]) {
    const r = await one(`select relrowsecurity as rls, has_table_privilege('authenticated', 'public.${t}', 'select') as auth_sel, has_table_privilege('anon', 'public.${t}', 'select') as anon_sel, has_table_privilege('authenticated', 'public.${t}', 'insert') as auth_ins, has_table_privilege('service_role', 'public.${t}', 'insert') as svc_ins from pg_class where oid = 'public.${t}'::regclass`);
    assert(r.rls === true && !r.auth_sel && !r.anon_sel && !r.auth_ins && r.svc_ins, `${t}: ${JSON.stringify(r)}`);
  }
  for (const kind of ["RISK_CASE", "SSMA_ACTION", "SLA_ACTION", "WEEKLY_DIGEST_ITEM", "CONTRACT_ALERT_ITEM", "VERSION_REVIEW"]) {
    await db.query("insert into public.email_reply_tokens (token_hash, project_id, subject_kind, subject_id, expires_at) values ($1, $2, $3, 'x', now() + interval '1 day')", [sha(Buffer.from(kind)), P, kind]);
  }
  await expectError(db.query("insert into public.email_reply_tokens (token_hash, project_id, subject_kind, subject_id, expires_at) values ($1, $2, 'OUTRO', 'x', now() + interval '1 day')", [sha(Buffer.from("o")), P]), "check");
  await expectError(db.query("insert into public.email_reply_tokens (token_hash, project_id, subject_kind, subject_id, expires_at) values ($1, $2, 'RISK_CASE', 'x', now() + interval '1 day')", [sha(Buffer.from("RISK_CASE")), P]), "duplicate");
  await db.query("delete from public.email_reply_tokens");
});
await check("A2 *_by_email só para service_role; núcleos sem execução por usuários; originais continuam para authenticated", async () => {
  const fns = {
    "public.ssma_corrective_action_update_by_email(uuid,uuid,text,text,uuid)": false,
    "public.ssma_corrective_action_forward_by_email(uuid,uuid,uuid,text)": false,
    "public.ssma_field_record_register_photo_by_email(uuid,uuid,uuid,text,text,text,bigint,text)": false,
    "public.ssma_corrective_action_update_core(uuid,uuid,text,text,uuid)": false,
    "public.ssma_corrective_action_forward_core(uuid,uuid,uuid,text)": false,
    "public.ssma_corrective_action_update(uuid,text,text,uuid)": true,
    "public.ssma_corrective_action_forward(uuid,uuid,text)": true,
  };
  for (const [fn, authOk] of Object.entries(fns)) {
    const r = await one(`select has_function_privilege('authenticated', '${fn}', 'execute') as auth, has_function_privilege('anon', '${fn}', 'execute') as anon`);
    assert(r.auth === authOk && r.anon === false, `${fn}: ${JSON.stringify(r)}`);
  }
  for (const fn of ["ssma_corrective_action_update_by_email(uuid,uuid,text,text,uuid)", "ssma_corrective_action_forward_by_email(uuid,uuid,uuid,text)", "ssma_field_record_register_photo_by_email(uuid,uuid,uuid,text,text,text,bigint,text)"]) {
    assert((await one(`select has_function_privilege('service_role', 'public.${fn}', 'execute') as ok`)).ok, fn);
  }
});
await check("A3 originais inalteradas: sem sessão => AUTH_REQUIRED; responsável registra ANDAMENTO pela sessão", async () => {
  const { act } = await newSsmaAction();
  await as(null);
  await expectError(db.query("select public.ssma_corrective_action_update($1,'ANDAMENTO','x',null)", [act]), "AUTH_REQUIRED");
  await as(U.RESP);
  await db.query("select public.ssma_corrective_action_update($1,'ANDAMENTO','Isolamento da área.',null)", [act]);
  assert((await one("select status from public.ssma_corrective_actions where id = $1", [act])).status === "EM_ANDAMENTO");
  await as(null);
});
await check("A4 update_by_email ANDAMENTO (sem sessão): mesma regra — responsável grava (evento com o ator, SLA assumido); outro colaborador => ACTION_ACCESS_DENIED", async () => {
  const { act } = await newSsmaAction({ linkSla: true });
  await as(null);
  await expectError(db.query("select public.ssma_corrective_action_update_by_email($1,$2,'ANDAMENTO','x',null)", [U.COLAB2, act]), "ACTION_ACCESS_DENIED");
  await expectError(db.query("select public.ssma_corrective_action_update_by_email(null,$1,'ANDAMENTO','x',null)", [act]), "AUTH_REQUIRED");
  await expectError(db.query("select public.ssma_corrective_action_update_by_email($1,$2,'ANDAMENTO','',null)", [U.RESP, act]), "NOTE_REQUIRED");
  await db.query("select public.ssma_corrective_action_update_by_email($1,$2,'ANDAMENTO','Tomando providências.',null)", [U.RESP, act]);
  const a = await one("select status, sla_action_id from public.ssma_corrective_actions where id = $1", [act]);
  const ev = await one("select actor_user_id from public.ssma_corrective_action_events where action_id = $1 and kind = 'ANDAMENTO'", [act]);
  const sla = await one("select status, acknowledged_by_user_id from public.sla_actions where id = $1", [a.sla_action_id]);
  assert(a.status === "EM_ANDAMENTO" && ev.actor_user_id === U.RESP && sla.status === "IN_PROGRESS" && sla.acknowledged_by_user_id === U.RESP, JSON.stringify({ a, ev, sla }));
});
await check("A5 CONCLUIDA by_email: responsável sem foto => EVIDENCE_REQUIRED; foto by_email (mesma validação do app) => concluída, SLA COMPLETED", async () => {
  const { rec, act } = await newSsmaAction({ linkSla: true });
  await as(null);
  await expectError(db.query("select public.ssma_corrective_action_update_by_email($1,$2,'CONCLUIDA','Feito',null)", [U.RESP, act]), "EVIDENCE_REQUIRED");
  const photo = "00000000-0000-4000-8000-0000000007a1";
  const okPath = `${P}/ssma-registros/${rec}/${photo}-foto.jpg`;
  const reg = (pathName, mime = "image/jpeg", size = JPEG.length, actor = U.RESP) => db.query("select public.ssma_field_record_register_photo_by_email($1,$2,$3,$4,'foto.jpg',$5,$6,$7) as id", [actor, photo, rec, pathName, mime, size, sha(JPEG)]);
  await expectError(reg(`${P}/outra-pasta/${photo}-foto.jpg`), "INVALID_STORAGE_PATH");
  await expectError(reg(okPath, "image/gif"), "INVALID_PHOTO_TYPE");
  await expectError(reg(okPath, "image/jpeg", 15728641), "INVALID_PHOTO_SIZE");
  await expectError(reg(okPath), "STORAGE_OBJECT_NOT_FOUND");
  await expectError(reg(okPath, "image/jpeg", JPEG.length, U.LEITURA), "RECORD_ACCESS_DENIED");
  await putObject(okPath);
  const { rows } = await reg(okPath);
  assert(rows[0].id === photo);
  const p = await one("select purpose, uploaded_by_user_id, sha256_hash from public.ssma_field_record_photos where id = $1", [photo]);
  assert(p.purpose === "EVIDENCIA_ACAO" && p.uploaded_by_user_id === U.RESP && p.sha256_hash === sha(JPEG), JSON.stringify(p));
  await db.query("select public.ssma_corrective_action_update_by_email($1,$2,'CONCLUIDA','Capacetes distribuídos.',$3)", [U.RESP, act, photo]);
  const a = await one("select status, concluded_by_user_id, sla_action_id from public.ssma_corrective_actions where id = $1", [act]);
  const sla = await one("select status from public.sla_actions where id = $1", [a.sla_action_id]);
  assert(a.status === "CONCLUIDA" && a.concluded_by_user_id === U.RESP && sla.status === "COMPLETED", JSON.stringify({ a, sla }));
});
await check("A6 forward_by_email: com vínculo SLA grava UM evento REATRIBUIDA com o ator; original pela sessão continua com UM evento (gatilho); justificativa obrigatória", async () => {
  const viaEmail = await newSsmaAction({ linkSla: true });
  await as(null);
  await expectError(db.query("select * from public.ssma_corrective_action_forward_by_email($1,$2,$3,'abc')", [U.RESP, viaEmail.act, U.COLAB2]), "FORWARD_REASON_REQUIRED");
  await expectError(db.query("select * from public.ssma_corrective_action_forward_by_email($1,$2,$3,'Motivo válido')", [U.RESP, viaEmail.act, U.LEITURA]), "NEW_RESPONSIBLE_NOT_ELIGIBLE");
  await db.query("select * from public.ssma_corrective_action_forward_by_email($1,$2,$3,'Técnico da frente B assume.')", [U.RESP, viaEmail.act, U.COLAB2]);
  const evEmail = await db.query("select actor_user_id from public.ssma_corrective_action_events where action_id = $1 and kind = 'REATRIBUIDA'", [viaEmail.act]);
  assert(evEmail.rows.length === 1 && evEmail.rows[0].actor_user_id === U.RESP, JSON.stringify(evEmail.rows));
  assert((await one("select responsible_user_id from public.ssma_corrective_actions where id = $1", [viaEmail.act])).responsible_user_id === U.COLAB2);
  const viaApp = await newSsmaAction({ linkSla: true });
  await as(U.RESP);
  await db.query("select * from public.ssma_corrective_action_forward($1,$2,'Técnico da frente B assume.')", [viaApp.act, U.COLAB2]);
  await as(null);
  const evApp = await db.query("select actor_user_id from public.ssma_corrective_action_events where action_id = $1 and kind = 'REATRIBUIDA'", [viaApp.act]);
  assert(evApp.rows.length === 1 && evApp.rows[0].actor_user_id === U.RESP, `app: ${JSON.stringify(evApp.rows)}`);
});

// ======================================================================= B) fase replies (adaptador + Gmail fake)
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
let seqMsg = 0;
function createFakeGmail() {
  const messages = new Map();
  const attachments = new Map();

  return {
    messages,
    add({ from = "carlos.evandro@axion.com.br", token, body, at = "2026-11-20T12:00:00Z", auth = AUTH_OK, photo = null }) {
      seqMsg += 1;
      const id = `gmail-${seqMsg}`;
      const parts = [{ mimeType: "text/plain", body: { data: b64(body) } }];
      if (photo) {
        attachments.set(`att-${id}`, photo.bytes);
        parts.push({ mimeType: photo.mime ?? "image/jpeg", filename: photo.name ?? "evidencia.jpg", body: { attachmentId: `att-${id}`, size: photo.bytes.length } });
      }
      const headers = [
        { name: "From", value: from },
        { name: "To", value: `crm+alerta-${token}@axion.com.br` },
        { name: "Subject", value: "RESPOSTA [ACC-SSMA:X]" },
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

const { runSsmaRepliesPhase, loadSsmaReplyAuditRows } = await import("./lib/ssma-replies-phase.mjs");
const { hashReplyToken, generateReplyToken } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const NOW = () => new Date("2026-11-20T13:00:00Z");
async function issueLegacyToken(act, rec) {
  const token = generateReplyToken();
  await db.query("insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail) values ($1,'SYSTEM','SSMA_REPLY_TOKEN_ISSUED','SSMA_CORRECTIVE_ACTION',$2,$3)", [P, act, JSON.stringify({ tokenSha256: hashReplyToken(token), recordId: rec })]);
  return token;
}
async function issueItemToken(act) {
  const token = generateReplyToken();
  await db.query("insert into public.email_reply_tokens (token_hash, project_id, subject_kind, subject_id, recipient_user_id, expires_at) values ($1,$2,'SSMA_ACTION',$3,$4, timestamptz '2026-12-20T00:00:00Z')", [hashReplyToken(token), P, act, U.RESP]);
  return token;
}
const auditsOf = async (act, action) => (await db.query("select detail from public.audit_log_entries where entity_id = $1 and action = $2 order by occurred_at, id", [act, action])).rows.map((r) => JSON.parse(r.detail));
const runPhase = (gmail, opts = {}) => runSsmaRepliesPhase({ supabase: createPgSupabase(db, opts), gmail, mailbox: "crm@axion.com.br", projectId: P, now: NOW, env: opts.env ?? {} });

await check("B1 BUG 2000: auditoria com > 2000 linhas é lida PAGINADA — token emitido depois da linha 2000 resolve; id processado na linha 2400 não reprocessa", async () => {
  const { rec, act } = await newSsmaAction();
  await db.query(
    `insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail, occurred_at)
     select $1, 'SYSTEM', 'SSMA_REPLY_IGNORED', 'SSMA_CORRECTIVE_ACTION', 'antiga-' || g, json_build_object('providerMessageId', 'antigo-' || g, 'reason', 'IGNORED_AUTO_REPLY')::text, timestamptz '2026-10-01T00:00:00Z' + g * interval '1 second'
     from generate_series(1, 2500) g`,
    [P]
  );
  const rows = await loadSsmaReplyAuditRows(createPgSupabase(db), P);
  assert(rows.length >= 2500, `linhas lidas: ${rows.length}`);
  const small = await loadSsmaReplyAuditRows(createPgSupabase(db), P, 300);
  assert(small.length === rows.length, "paginação com outra página produz o mesmo total");
  const token = await issueLegacyToken(act, rec);
  const gmail = createFakeGmail();
  const fresh = gmail.add({ token, body: "EM ANDAMENTO: isolamento da área\nPrevisão: 25/11/2026 15:00" });
  // id já processado registrado na posição ~2400 (antes, com limit(2000) crescente, NÃO carregava e seria reprocessado).
  gmail.messages.set("antigo-2400", { ...gmail.messages.get(fresh), id: "antigo-2400" });
  const summary = await runPhase(gmail);
  assert(summary.processed === 1, JSON.stringify(summary));
  assert((await auditsOf(act, "SSMA_REPLY_PROCESSED")).length === 1, "só a mensagem nova foi processada");
});
await check("B2 EM ANDAMENTO por e-mail grava pela RPC by_email (status, evento com o ator); confirmação DEPOIS da gravação; repetir a fase é idempotente", async () => {
  const { rec, act } = await newSsmaAction({ linkSla: true });
  const token = await issueLegacyToken(act, rec);
  const gmail = createFakeGmail();
  gmail.add({ token, body: "EM ANDAMENTO: isolamento da área e orientação da equipe\nPrevisão: 25/11/2026 15:00" });
  const supa = createPgSupabase(db);
  const s1 = await runSsmaRepliesPhase({ supabase: supa, gmail, mailbox: "crm@axion.com.br", projectId: P, now: NOW, env: {} });
  assert(s1.processed === 1 && supa.calls.rpc.includes("ssma_corrective_action_update_by_email"), JSON.stringify({ s1, rpc: supa.calls.rpc }));
  const a = await one("select status from public.ssma_corrective_actions where id = $1", [act]);
  const ev = await db.query("select actor_user_id, note from public.ssma_corrective_action_events where action_id = $1 and kind = 'ANDAMENTO'", [act]);
  assert(a.status === "EM_ANDAMENTO" && ev.rows.length === 1 && ev.rows[0].actor_user_id === U.RESP && /25\/11\/2026/.test(ev.rows[0].note), JSON.stringify(ev.rows));
  const conf = await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING");
  assert(conf.length === 1 && conf[0].rejected === false && /25\/11\/2026/.test(conf[0].forecastLine) && conf[0].to === "carlos.evandro@axion.com.br", JSON.stringify(conf));
  const processedAt = (await one("select occurred_at from public.audit_log_entries where entity_id = $1 and action = 'SSMA_REPLY_PROCESSED'", [act])).occurred_at;
  const confAt = (await one("select occurred_at from public.audit_log_entries where entity_id = $1 and action = 'SSMA_REPLY_CONFIRMATION_PENDING'", [act])).occurred_at;
  assert(new Date(confAt) >= new Date(processedAt), "confirmação depois do registro");
  const s2 = await runPhase(gmail);
  assert(s2.processed === 0, JSON.stringify(s2));
  assert((await db.query("select 1 from public.ssma_corrective_action_events where action_id = $1 and kind = 'ANDAMENTO'", [act])).rows.length === 1, "mesma mensagem duas vezes => um evento");
  assert((await db.query("select 1 from public.email_reply_inbound_log where provider_message_id = $1", [[...gmail.messages.keys()][0]])).rows.length === 1, "registro único por mensagem");
});
await check("B3 RESOLVIDO SEM foto => resposta pedindo a evidência; a ação NÃO é concluída", async () => {
  const { rec, act } = await newSsmaAction();
  const token = await issueLegacyToken(act, rec);
  const gmail = createFakeGmail();
  gmail.add({ token, body: "RESOLVIDO: capacetes distribuídos" });
  const s = await runPhase(gmail);
  assert(s.rejected === 1 && s.processed === 0, JSON.stringify(s));
  assert((await one("select status from public.ssma_corrective_actions where id = $1", [act])).status === "ABERTA");
  const conf = await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING");
  assert(conf.length === 1 && conf[0].rejected === true && /FOTO de evidência/.test(conf[0].pendingLine), JSON.stringify(conf));
  assert((await auditsOf(act, "SSMA_REPLY_REJECTED"))[0].code === "EVIDENCE_REQUIRED");
});
await check("B4 RESOLVIDO COM foto JPEG => Storage + foto EVIDENCIA_ACAO (sha256) do MESMO registro + conclusão pela RPC; GIF renomeado é recusado", async () => {
  const bad = await newSsmaAction();
  const badToken = await issueLegacyToken(bad.act, bad.rec);
  const good = await newSsmaAction({ linkSla: true });
  const goodToken = await issueItemToken(good.act);
  const gmail = createFakeGmail();
  gmail.add({ token: badToken, body: "RESOLVIDO", photo: { bytes: Buffer.from("GIF89a-nao-e-jpeg"), name: "foto.jpg" } });
  gmail.add({ token: goodToken, body: "RESOLVIDO: capacetes distribuídos e conferidos", photo: { bytes: JPEG, name: "Evidência final.jpg" } });
  const s = await runPhase(gmail);
  assert(s.processed === 1 && s.rejected === 1, JSON.stringify(s));
  assert((await one("select status from public.ssma_corrective_actions where id = $1", [bad.act])).status === "ABERTA", "GIF não conclui");
  assert((await auditsOf(bad.act, "SSMA_REPLY_REJECTED"))[0].code === "PHOTO_TYPE_INVALID");
  const a = await one("select status from public.ssma_corrective_actions where id = $1", [good.act]);
  const photo = await one("select id, purpose, sha256_hash, record_id, storage_path, uploaded_by_user_id from public.ssma_field_record_photos where record_id = $1", [good.rec]);
  const ev = await one("select evidence_photo_id, actor_user_id from public.ssma_corrective_action_events where action_id = $1 and kind = 'CONCLUIDA'", [good.act]);
  assert(a.status === "CONCLUIDA" && photo.purpose === "EVIDENCIA_ACAO" && photo.sha256_hash === sha(JPEG) && ev.evidence_photo_id === photo.id && ev.actor_user_id === U.RESP, JSON.stringify({ a, photo, ev }));
  assert(photo.storage_path.startsWith(`${P}/ssma-registros/${good.rec}/${photo.id}-`), photo.storage_path);
  assert((await one("select count(*)::int as n from storage.objects where name = $1", [photo.storage_path])).n === 1, "arquivo no Storage");
  assert((await one("select count(*)::int as n from public.email_inbound_attachments where sha256 = $1", [sha(JPEG)])).n === 1, "anexo rastreável");
  const tok = await one("select consumed_by_message_id from public.email_reply_tokens where subject_id = $1", [good.act]);
  assert(tok.consumed_by_message_id, "token por item consumido pela conclusão");
});
await check("B5 ENVIAR PARA por NOME único => RPC forward_by_email; nome AMBÍGUO e justificativa curta => resposta pedindo correção, nada muda", async () => {
  const ok = await newSsmaAction();
  const amb = await newSsmaAction();
  const short = await newSsmaAction();
  const gmail = createFakeGmail();
  gmail.add({ token: await issueLegacyToken(ok.act, ok.rec), body: "ENVIAR PARA: maria souza\nJustificativa: técnica da frente B assume" });
  gmail.add({ token: await issueLegacyToken(amb.act, amb.rec), body: "ENVIAR PARA: Ana Lima\nJustificativa: assumir a frente" });
  gmail.add({ token: await issueLegacyToken(short.act, short.rec), body: "ENVIAR PARA: Maria Souza, ok" });
  const s = await runPhase(gmail);
  assert(s.processed === 1 && s.rejected === 2, JSON.stringify(s));
  assert((await one("select responsible_user_id from public.ssma_corrective_actions where id = $1", [ok.act])).responsible_user_id === U.COLAB2);
  assert((await one("select responsible_user_id from public.ssma_corrective_actions where id = $1", [amb.act])).responsible_user_id === U.RESP);
  assert((await auditsOf(amb.act, "SSMA_REPLY_REJECTED"))[0].code === "TARGET_AMBIGUOUS");
  assert((await auditsOf(short.act, "SSMA_REPLY_REJECTED"))[0].code === "FORWARD_REASON_REQUIRED");
  assert(/Justificativa: técnica da frente B assume|técnica da frente B assume/.test((await one("select detail from public.audit_log_entries where entity_id = $1 and action = 'SSMA_ACTION_FORWARDED'", [ok.act])).detail));
});
await check("B6 sem Authentication-Results / servidor não confiável / domínio externo => nada muda; membro conhecido recebe explicação; externo não", async () => {
  const { rec, act } = await newSsmaAction();
  const token = await issueLegacyToken(act, rec);
  const gmail = createFakeGmail();
  gmail.add({ token, body: "EM ANDAMENTO: x\nPrevisão: 25/11/2026 15:00", auth: null });
  gmail.add({ token, body: "EM ANDAMENTO: x\nPrevisão: 25/11/2026 15:00", auth: "evil.example; dmarc=pass header.from=axion.com.br", at: "2026-11-20T12:01:00Z" });
  gmail.add({ token, from: "carlos.evandro@gmail.com", body: "EM ANDAMENTO: x\nPrevisão: 25/11/2026 15:00", at: "2026-11-20T12:02:00Z" });
  const s = await runPhase(gmail);
  assert(s.unauthorized === 3 && s.processed === 0, JSON.stringify(s));
  assert((await one("select status from public.ssma_corrective_actions where id = $1", [act])).status === "ABERTA");
  const ignored = await auditsOf(act, "SSMA_REPLY_IGNORED");
  assert(ignored.map((d) => d.reason).sort().join(",") === "AUTH_RESULTS_MISSING,AUTH_UNTRUSTED_SERVER,SENDER_NOT_CORPORATE", JSON.stringify(ignored));
  const conf = await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING");
  assert(conf.length === 2 && conf.every((c) => c.rejected && c.to === "carlos.evandro@axion.com.br"), JSON.stringify(conf));
});
await check("B7 limite de taxa: acima de N mensagens/hora do mesmo remetente => revisão humana (sem gravar nem responder)", async () => {
  const { rec, act } = await newSsmaAction();
  const token = await issueLegacyToken(act, rec);
  const gmail = createFakeGmail();
  gmail.add({ token, body: "EM ANDAMENTO: a\nPrevisão: 25/11/2026 15:00", at: "2026-11-20T12:10:00Z" });
  gmail.add({ token, body: "EM ANDAMENTO: b\nPrevisão: 25/11/2026 16:00", at: "2026-11-20T12:11:00Z" });
  gmail.add({ token, body: "EM ANDAMENTO: c\nPrevisão: 25/11/2026 17:00", at: "2026-11-20T12:12:00Z" });
  await db.query("delete from public.email_reply_inbound_log");
  const s = await runPhase(gmail, { env: { ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "2" } });
  assert(s.processed === 2 && s.rateLimited === 1, JSON.stringify(s));
  assert((await db.query("select 1 from public.ssma_corrective_action_events where action_id = $1 and kind = 'ANDAMENTO'", [act])).rows.length === 2);
  assert((await one("select count(*)::int as n from public.email_reply_inbound_log where outcome = 'RATE_LIMITED'")).n === 1);
  assert((await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING")).length === 2, "excedente sem resposta");
});
await check("B8 falha da RPC (erro desconhecido) => nada auditado como processado e NENHUMA confirmação; próxima rodada reprocessa", async () => {
  const { rec, act } = await newSsmaAction();
  const token = await issueLegacyToken(act, rec);
  const gmail = createFakeGmail();
  gmail.add({ token, body: "EM ANDAMENTO: troca\nPrevisão: 25/11/2026 15:00" });
  await db.query("delete from public.email_reply_inbound_log");
  const s1 = await runPhase(gmail, { failRpc: new Set(["ssma_corrective_action_update_by_email"]) });
  assert(s1.errors === 1 && s1.processed === 0, JSON.stringify(s1));
  assert((await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING")).length === 0 && (await auditsOf(act, "SSMA_REPLY_PROCESSED")).length === 0);
  const s2 = await runPhase(gmail);
  assert(s2.processed === 1, JSON.stringify(s2));
  assert((await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING")).length === 1);
});
await check("B9 EM ANDAMENTO explícito sem horário (ALTA) => pede a previsão completa; nada gravado", async () => {
  const { rec, act } = await newSsmaAction();
  const gmail = createFakeGmail();
  gmail.add({ token: await issueLegacyToken(act, rec), body: "EM ANDAMENTO: troca do guarda-corpo\nPrevisão: 25/11/2026" });
  const s = await runPhase(gmail);
  assert(s.rejected === 1, JSON.stringify(s));
  assert((await one("select status from public.ssma_corrective_actions where id = $1", [act])).status === "ABERTA");
  assert(/hor[áa]rio/i.test((await auditsOf(act, "SSMA_REPLY_CONFIRMATION_PENDING"))[0].pendingLine));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
