// Concorrência em PostgreSQL REAL (conexões independentes, uma por "cliente"): migration 20261106100000.
// Reaplica TODAS as migrations numa base nova de um servidor PostgreSQL real e dispara operações simultâneas.
//   A) o MESMO registro enviado por N conexões ao mesmo tempo  => 1 registro, 1 ação SSMA, 1 ação SLA, 1 evento CRIADA;
//   B) M registros distintos simultâneos                        => M ações SSMA vinculadas a M ações SLA (1:1), sem erro;
//   C) vínculo SSMA↔SLA criado por N conexões (backfill/RPC)    => exatamente 1 ação SLA;
//   D) andamento pelo SSMA × reatribuição pelo módulo de Ações, em paralelo e repetido => sem deadlock, estados iguais;
//   E) reserva (claim) das notificações por N conexões          => cada destinatário recebe UM e-mail; falha reenvia só uma vez por claim;
//   G) vínculo registro SSMA -> comprovação ESG concorrente (idempotente; vincular x desvincular; sem permissão)
//   F) decisão humana de duplicidade (vínculo explícito) concorrente => no máximo um SAME_FACT por formulário/registro.
// NÃO roda no CI (exige um servidor PostgreSQL). Uso:
//   ACC_REALPG_URL=postgres://postgres:postgres@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//     node scripts/test-ssma-esg-concurrency-realpg.mjs
// Sem ACC_REALPG_URL o teste é PULADO (exit 0) com aviso.

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO: defina ACC_REALPG_URL (PostgreSQL real) e ACC_REALPG_PKG_DIR (pasta com node_modules/pg). Este teste não roda no CI.");
  process.exit(0);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const requireFrom = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"));
const pg = requireFrom("pg");
register("./ts-module-resolver.mjs", import.meta.url);
const core = await import("../apps/web/lib/ssma/field-notifications/core.ts");

const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_conc_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const base = new URL(url); base.pathname = `/${dbName}`;
const dbUrl = base.toString();

// Papéis são do cluster: cria só os que faltam; o restante da plataforma simulada vai na base nova.
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
const setup = new pg.Client({ connectionString: dbUrl });
await setup.connect();
await setup.query(PLATFORM.replace(/^create role .*$/gm, ""));
const t0 = Date.now();
for (const f of files) {
  const sql = readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
  try { await setup.query(sql); } catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); process.exit(1); }
}
console.log(`PostgreSQL ${version}: ${files.length} migrations (inclui 20261106100000 e 20261106110000) aplicadas em ${((Date.now() - t0) / 1000).toFixed(1)} s — base ${dbName}`);

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const uuid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001";
const ADM = 1, RESP = 2, REP = 3;
const reporters = Array.from({ length: 12 }, (_, i) => 20 + i);
for (const n of [ADM, RESP, REP, ...reporters]) {
  await setup.query("insert into auth.users (id,email) values ($1,$2)", [id(n), `u${n}@exemplo.invalid`]);
  await setup.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [id(n), `u${n}`, `u${n}@exemplo.invalid`]);
}
await setup.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra','O1','C','L','2026-01-01','2027-01-01')", [P1]);
await setup.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE'),($1,$3,'COLABORADOR','ACTIVE'),($1,$4,'COLABORADOR','ACTIVE')", [P1, id(ADM), id(RESP), id(REP)]);
for (const n of reporters) await setup.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'COLABORADOR','ACTIVE')", [P1, id(n)]);

/** Uma conexão INDEPENDENTE por cliente, já como o papel authenticated do usuário. */
async function client(uid) {
  const c = new pg.Client({ connectionString: dbUrl });
  await c.connect();
  await c.query("select set_config('app.uid', $1, false)", [uid]);
  await c.query("set role authenticated");
  return c;
}
const submitSql = "select public.ssma_field_record_submit($1::uuid,$2::uuid,$3::uuid,'OCORRENCIA','EPI','Operário sem capacete','Pavimento 3',$4::timestamptz,$4::timestamptz,'CRITICA',$5::uuid,$6::date) as id";
const submitArgs = (uid, rid, resp = id(RESP)) => [uid, rid, P1, new Date().toISOString(), resp, "2026-11-30"];
const count = async (sql, params = []) => Number((await setup.query(sql, params)).rows[0].n);

console.log("\n======================================\nSSMA/ESG — CONCORRÊNCIA em PostgreSQL REAL\n======================================");

await check("A) o MESMO registro enviado por 12 conexões ao mesmo tempo: 1 registro, 1 ação SSMA, 1 ação SLA, 1 evento CRIADA; todas recebem o mesmo id e nenhuma falha", async () => {
  const rid = uuid(2, 1);
  const clients = await Promise.all(Array.from({ length: 12 }, () => client(id(REP))));
  const results = await Promise.allSettled(clients.map((c) => c.query(submitSql, submitArgs(id(REP), rid))));
  await Promise.all(clients.map((c) => c.end()));
  const rejected = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
  eq(rejected, [], "nenhuma conexão pode falhar (unique_violation tratado como reenvio)");
  eq([...new Set(results.map((r) => r.value.rows[0].id))], [rid], "todas devolvem o mesmo id");
  eq(await count("select count(*)::int n from public.ssma_field_records where id=$1", [rid]), 1, "registros");
  eq(await count("select count(*)::int n from public.ssma_corrective_actions where record_id=$1", [rid]), 1, "ações SSMA");
  eq(await count("select count(*)::int n from public.sla_actions s join public.ssma_corrective_actions a on a.sla_action_id=s.id where a.record_id=$1", [rid]), 1, "ações SLA vinculadas");
  eq(await count("select count(*)::int n from public.sla_actions where related_ssma_corrective_action_id in (select id from public.ssma_corrective_actions where record_id=$1)", [rid]), 1, "vínculo nos dois sentidos");
  eq(await count("select count(*)::int n from public.ssma_corrective_action_events e join public.ssma_corrective_actions a on a.id=e.action_id where a.record_id=$1 and e.kind='CRIADA'", [rid]), 1, "evento CRIADA");
});

await check("B) 12 registros DISTINTOS em paralelo por 12 usuários: 12 ações SSMA vinculadas a 12 ações SLA (1:1), sem erro", async () => {
  const clients = await Promise.all(reporters.map((n) => client(id(n))));
  const rids = reporters.map((_, i) => uuid(3, 100 + i));
  const results = await Promise.allSettled(clients.map((c, i) => c.query(submitSql, submitArgs(id(reporters[i]), rids[i]))));
  await Promise.all(clients.map((c) => c.end()));
  eq(results.filter((r) => r.status === "rejected").map((r) => r.reason.message), [], "sem falhas");
  eq(await count("select count(*)::int n from public.ssma_corrective_actions where record_id = any($1)", [rids]), 12, "ações SSMA");
  eq(await count("select count(*)::int n from public.ssma_corrective_actions a join public.sla_actions s on s.id=a.sla_action_id and s.related_ssma_corrective_action_id=a.id where a.record_id = any($1)", [rids]), 12, "pares 1:1");
});

await check("C) vínculo SSMA↔SLA criado por 10 conexões ao mesmo tempo para a MESMA ação (backfill/reexecução): exatamente 1 ação SLA, mesmo id para todas", async () => {
  const rid = uuid(4, 1), aid = uuid(5, 1);
  await setup.query("insert into public.ssma_field_records (id,project_id,kind,category,description,location,occurred_at,client_created_at,risk_level,responsible_user_id,due_date,reported_by_user_id) values ($1,$2,'OCORRENCIA','EPI','Legado','A',now(),now(),'ALTA',$3,'2026-11-30',$4)", [rid, P1, id(RESP), id(REP)]);
  await setup.query("insert into public.ssma_corrective_actions (id,record_id,project_id,responsible_user_id,due_date) values ($1,$2,$3,$4,'2026-11-30')", [aid, rid, P1, id(RESP)]);
  const conns = await Promise.all(Array.from({ length: 10 }, async () => { const c = new pg.Client({ connectionString: dbUrl }); await c.connect(); return c; }));
  const results = await Promise.allSettled(conns.map((c) => c.query("select public.ssma_link_sla_action($1::uuid) as id", [aid])));
  await Promise.all(conns.map((c) => c.end()));
  eq(results.filter((r) => r.status === "rejected").map((r) => r.reason.message), [], "sem falhas");
  eq([...new Set(results.map((r) => r.value.rows[0].id))].length, 1, "todas devolvem a mesma ação SLA");
  eq(await count("select count(*)::int n from public.sla_actions where related_ssma_corrective_action_id=$1", [aid]), 1, "uma ação SLA");
});

await check("D) andamento pelo SSMA × reatribuição/início pelo módulo de Ações em paralelo (30 rodadas, ações distintas): sem deadlock e estados iguais nos dois módulos", async () => {
  const rounds = 30;
  const rids = Array.from({ length: rounds }, (_, i) => uuid(6, i + 1));
  const rep = await client(id(REP));
  for (const rid of rids) await rep.query(submitSql, submitArgs(id(REP), rid));
  await rep.end();
  const errors = [];
  for (let i = 0; i < rounds; i += 4) {
    await Promise.all(rids.slice(i, i + 4).map(async (rid) => {
      const aid = (await setup.query("select a.id, a.sla_action_id from public.ssma_corrective_actions a where a.record_id=$1", [rid])).rows[0];
      const resp = await client(id(RESP));
      const adm = await client(id(ADM));
      const admin2 = await client(id(ADM));
      const ops = [
        resp.query("select public.ssma_corrective_action_update($1::uuid,'ANDAMENTO','Isolando a área',null)", [aid.id]),
        adm.query("update public.sla_actions set responsible_user_id=$2 where id=$1", [aid.sla_action_id, id(REP)]),
        admin2.query("update public.sla_actions set status='IN_PROGRESS', acknowledged_at=coalesce(acknowledged_at, now()), acknowledged_by_user_id=coalesce(acknowledged_by_user_id, $2) where id=$1 and status='PENDING'", [aid.sla_action_id, id(ADM)]),
      ];
      const r = await Promise.allSettled(ops);
      for (const x of r) if (x.status === "rejected") errors.push(x.reason.message);
      await Promise.all([resp.end(), adm.end(), admin2.end()]);
    }));
  }
  ok(!errors.some((e) => /deadlock/i.test(e)), `deadlock detectado: ${errors.filter((e) => /deadlock/i.test(e))[0]}`);
  // permissão: RESP perde o direito se foi reatribuído antes (ACTION_ACCESS_DENIED é um resultado válido da corrida); nada mais pode falhar
  const unexpected = errors.filter((e) => !/ACTION_ACCESS_DENIED/.test(e));
  eq(unexpected, [], "erros inesperados na corrida");
  const mismatched = await count(`select count(*)::int n from public.ssma_corrective_actions a join public.sla_actions s on s.id=a.sla_action_id
    where a.record_id = any($1) and ((a.status='EM_ANDAMENTO') <> (s.status='IN_PROGRESS') or a.responsible_user_id is distinct from s.responsible_user_id)`, [rids]);
  eq(mismatched, 0, "ações com estado/responsável divergentes entre SSMA e SLA");
});

await check("F) decisão humana de duplicidade concorrente: no máximo UM 'mesmo fato' por formulário e por registro; sem erro inesperado", async () => {
  const form = uuid(7, 1);
  await setup.query("insert into public.ssma_form_submissions (id,project_id,checklist_slug,checklist_number,checklist_title,drive_folder_name,occurred_at,technician_user_id,field_values,checklist_values,status,submitted_at) values ($1,$2,'ocorrencia-acidente',12,'Ocorrência / acidente','12',now(),$3,'{\"afastamento\":\"Sem afastamento\"}'::jsonb,'{}'::jsonb,'SUBMITTED',now())", [form, P1, id(REP)]);
  const recs = [uuid(2, 1), uuid(3, 100), uuid(3, 101), uuid(3, 102)];
  const clients = await Promise.all(recs.map(() => client(id(ADM))));
  const results = await Promise.allSettled(clients.map((c, i) => c.query("select public.ssma_incident_link_set($1::uuid,$2::uuid,'SAME_FACT',null)", [form, recs[i]])));
  await Promise.all(clients.map((c) => c.end()));
  const unexpected = results.filter((r) => r.status === "rejected" && !/ALREADY_LINKED/.test(r.reason.message));
  eq(unexpected.map((r) => r.reason.message), [], "só ALREADY_LINKED é aceitável");
  eq(await count("select count(*)::int n from public.ssma_incident_links where form_submission_id=$1 and decision='SAME_FACT'", [form]), 1, "um único SAME_FACT");
  eq(results.filter((r) => r.status === "fulfilled").length, 1, "uma decisão vence");
});

// ───── G) vínculo registro SSMA -> comprovação ESG (migration 20261106110000) ─────
const catC = (await setup.query("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'esg_obligations_category_check'")).rows[0].d.match(/'([A-Z_]+)'/)[1];
const perC = (await setup.query("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'esg_obligations_periodicity_check'")).rows[0].d.match(/'([A-Z_]+)'/)[1];
const OBL1 = uuid(8, 1), SUB1 = uuid(9, 1), SUB2 = uuid(9, 2), GREC = uuid(2, 1);
await setup.query("insert into public.esg_obligations (id,project_id,title,category,periodicity,created_by_user_id) values ($1,$2,'Obrigação G',$3,$4,$5)", [OBL1, P1, catC, perC, id(ADM)]);
await setup.query("insert into public.esg_obligation_submissions (id,project_id,obligation_id,reference_date,status,filled_by_user_id) values ($1,$2,$3,'2026-10-01','PENDENTE',$4),($5,$2,$3,'2026-10-02','PENDENTE',$4)", [SUB1, P1, OBL1, id(ADM), SUB2]);
const esgState = async () => JSON.stringify((await setup.query("select to_jsonb(s) r from public.esg_obligation_submissions s order by id")).rows) + JSON.stringify((await setup.query("select to_jsonb(o) r from public.esg_obligations o order by id")).rows);

await check("G1) vínculo ESG criado por 12 conexões ao mesmo tempo (mesma comprovação e mesmo registro): UMA referência ativa, mesmo id para todas, uma auditoria, obrigação NÃO cumprida", async () => {
  const before = await esgState();
  const clients = await Promise.all(Array.from({ length: 12 }, () => client(id(ADM))));
  const results = await Promise.allSettled(clients.map((c) => c.query("select public.esg_link_ssma_record($1::uuid,$2::uuid,null) as id", [SUB1, GREC])));
  await Promise.all(clients.map((c) => c.end()));
  eq(results.filter((r) => r.status === "rejected").map((r) => r.reason.message), [], "nenhuma conexão pode falhar (idempotente)");
  eq([...new Set(results.map((r) => r.value.rows[0].id))].length, 1, "todas devolvem a mesma referência");
  eq(await count("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1 and field_record_id=$2 and revoked_at is null", [SUB1, GREC]), 1, "referências ativas");
  eq(await count("select count(*)::int n from public.audit_log_entries where action='ESG_SSMA_RECORD_LINKED' and detail like $1", [`%${SUB1}%`]), 1, "auditorias do vínculo");
  eq(await esgState(), before, "estado das obrigações/comprovações não pode mudar");
});
await check("G2) vincular e desvincular ao mesmo tempo (6 vínculos + 6 desvínculos): no máximo UMA referência ativa, histórico preservado, nenhum erro inesperado, obrigação intacta", async () => {
  const before = await esgState();
  const ref = (await setup.query("select id from public.esg_ssma_record_references where submission_id=$1 and field_record_id=$2 and revoked_at is null", [SUB1, GREC])).rows[0].id;
  const links = await Promise.all(Array.from({ length: 6 }, () => client(id(ADM))));
  const unlinks = await Promise.all(Array.from({ length: 6 }, () => client(id(ADM))));
  const results = await Promise.allSettled([
    ...links.map((c) => c.query("select public.esg_link_ssma_record($1::uuid,$2::uuid,null)", [SUB1, GREC])),
    ...unlinks.map((c) => c.query("select public.esg_unlink_ssma_record($1::uuid,'motivo do teste de concorrência')", [ref])),
  ]);
  await Promise.all([...links, ...unlinks].map((c) => c.end()));
  const unexpected = results.filter((r) => r.status === "rejected" && !/ALREADY_REVOKED/.test(r.reason.message)).map((r) => r.reason.message);
  eq(unexpected, [], "só ALREADY_REVOKED é aceitável");
  ok((await count("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1 and field_record_id=$2 and revoked_at is null", [SUB1, GREC])) <= 1, "mais de uma referência ativa");
  eq(await count("select count(*)::int n from public.esg_ssma_record_references where id=$1 and revoked_at is not null", [ref]), 1, "a referência original ficou revogada (histórico preservado)");
  eq(await count("select count(*)::int n from public.esg_ssma_record_references where id=$1", [ref]), 1, "a linha original nunca é apagada");
  eq(await esgState(), before, "estado das obrigações/comprovações não pode mudar");
});
await check("G3) quem NÃO pode vincular, mesmo em paralelo: Colaborador na comprovação alheia => FORBIDDEN em todas; nenhuma referência criada", async () => {
  const clients = await Promise.all(Array.from({ length: 6 }, () => client(id(RESP))));
  const results = await Promise.allSettled(clients.map((c) => c.query("select public.esg_link_ssma_record($1::uuid,$2::uuid,null)", [SUB2, GREC])));
  await Promise.all(clients.map((c) => c.end()));
  eq(results.map((r) => (r.status === "rejected" ? (/FORBIDDEN/.test(r.reason.message) ? "FORBIDDEN" : r.reason.message) : "ok")), Array(6).fill("FORBIDDEN"), "todas recusadas");
  eq(await count("select count(*)::int n from public.esg_ssma_record_references where submission_id=$1", [SUB2]), 0, "nenhuma referência");
});

// ───── E) reserva das notificações: o MESMO núcleo (core.ts), cada execução com a sua conexão ─────
function pgStore(c) {
  const stale = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();
  return {
    async ensureDelivery(key, rcpt) {
      const email = rcpt.email.trim().toLowerCase();
      await c.query("insert into public.ssma_field_notification_deliveries (project_id,record_id,action_id,event,event_date,recipient_email,recipient_name,status) values ($1,$2,$3,$4,$5,$6,$7,'PENDING') on conflict (record_id,event,event_date,recipient_email) do nothing", [key.projectId, key.recordId, key.actionId, key.event, key.eventDate, email, rcpt.name]);
      const r = (await c.query("select id,status,attempt_count from public.ssma_field_notification_deliveries where record_id=$1 and event=$2 and event_date=$3 and recipient_email=$4", [key.recordId, key.event, key.eventDate, email])).rows[0];
      return { id: r.id, status: r.status, attemptCount: Number(r.attempt_count) };
    },
    async ensureSuppressed(key, reason) {
      await c.query("insert into public.ssma_field_notification_deliveries (project_id,record_id,action_id,event,event_date,recipient_email,status,suppression_reason) values ($1,$2,$3,$4,$5,$6,'SUPPRESSED',$7) on conflict (record_id,event,event_date,recipient_email) do nothing", [key.projectId, key.recordId, key.actionId, key.event, key.eventDate, core.NO_RECIPIENT_PLACEHOLDER, reason]);
    },
    // Mesma condição do store do servidor (server.ts): leitura do contador + UPDATE condicional por contador/lease.
    async claim(rowId) {
      const row = (await c.query("select attempt_count,status from public.ssma_field_notification_deliveries where id=$1", [rowId])).rows[0];
      if (!row || !["PENDING", "FAILED"].includes(row.status)) return false;
      const r = await c.query("update public.ssma_field_notification_deliveries set claimed_at=now(), attempt_count=attempt_count+1 where id=$1 and attempt_count=$2 and status in ('PENDING','FAILED') and (claimed_at is null or claimed_at < $3) returning id", [rowId, row.attempt_count, stale()]);
      return r.rowCount === 1;
    },
    async markSent(rowId, res) { await c.query("update public.ssma_field_notification_deliveries set status='SENT', sent_at=$2, provider_message_id=$3, last_error=null, claimed_at=null where id=$1", [rowId, res.sentAt, res.providerMessageId]); },
    async markFailed(rowId, error) { await c.query("update public.ssma_field_notification_deliveries set status='FAILED', last_error=$2, claimed_at=null where id=$1", [rowId, error.slice(0, 2000)]); },
  };
}
async function runNotify(key, recipients, sent, failFor = new Set()) {
  const c = new pg.Client({ connectionString: dbUrl });
  await c.connect();
  await c.query("set role service_role");
  const deps = {
    store: pgStore(c),
    mailer: { async deliver({ to }) { await new Promise((r) => setTimeout(r, 15)); if (failFor.has(to)) throw new Error("falha simulada do provedor"); sent.push(to); return { providerMessageId: `m-${sent.length}`, sentAt: new Date().toISOString() }; } },
    audit: async () => {},
  };
  try { return await core.notifyEvent(deps, { key, recipients, content: () => ({ subject: "s", text: "t", html: "h" }), entityLabel: "registro" }); }
  finally { await c.end(); }
}
const RCPT = ["ana@exemplo.invalid", "bruno@exemplo.invalid", "carla@exemplo.invalid"].map((email, i) => ({ userId: `u${i}`, name: `N${i}`, email }));
const NKEY = { projectId: P1, recordId: uuid(2, 1), actionId: null, event: "CRITICAL_RECORD", eventDate: "2026-11-05" };

await check("E1) reserva das notificações: 10 execuções simultâneas (10 conexões) para 3 destinatários => exatamente 3 e-mails, 3 linhas SENT com 1 tentativa", async () => {
  const sent = [];
  const summaries = await Promise.all(Array.from({ length: 10 }, () => runNotify(NKEY, RCPT, sent)));
  eq(sent.length, 3, "e-mails enviados");
  eq([...new Set(sent)].sort(), RCPT.map((r) => r.email).sort(), "um por destinatário");
  const rows = (await setup.query("select status, attempt_count from public.ssma_field_notification_deliveries where record_id=$1 and event='CRITICAL_RECORD'", [NKEY.recordId])).rows;
  eq([rows.length, rows.every((r) => r.status === "SENT" && Number(r.attempt_count) === 1)], [3, true], "linhas");
  eq(summaries.reduce((n, s) => n + s.sent, 0), 3, "soma dos envios nos resumos");
});

await check("E2) repetir a solicitação depois do envio (nova rodada de 6 conexões) não envia nada e reporta 'já enviado'", async () => {
  const sent = [];
  const summaries = await Promise.all(Array.from({ length: 6 }, () => runNotify(NKEY, RCPT, sent)));
  eq(sent.length, 0, "nenhum e-mail novo");
  ok(summaries.every((s) => s.alreadySent === 3 && s.sent === 0), "resumos");
});

await check("E3) falha de um destinatário com 8 execuções simultâneas: os outros enviam uma vez; o que falhou fica FAILED sem e-mail duplicado; nova rodada reenvia só ele", async () => {
  const key = { ...NKEY, recordId: uuid(3, 100), eventDate: "2026-11-06" };
  const sent = [];
  const failFor = new Set(["bruno@exemplo.invalid"]);
  await Promise.all(Array.from({ length: 8 }, () => runNotify(key, RCPT, sent, failFor)));
  eq([...sent].sort(), ["ana@exemplo.invalid", "carla@exemplo.invalid"], "só os que não falharam, uma vez cada");
  const failed = (await setup.query("select recipient_email, status, attempt_count from public.ssma_field_notification_deliveries where record_id=$1 and event='CRITICAL_RECORD' and event_date=$2 order by recipient_email", [key.recordId, key.eventDate])).rows;
  eq(failed.map((r) => [r.recipient_email, r.status]), [["ana@exemplo.invalid", "SENT"], ["bruno@exemplo.invalid", "FAILED"], ["carla@exemplo.invalid", "SENT"]], "estados");
  ok(failed.filter((r) => r.status === "SENT").every((r) => Number(r.attempt_count) === 1), "quem enviou, 1 tentativa");
  failFor.clear();
  const again = [];
  await Promise.all(Array.from({ length: 5 }, () => runNotify(key, RCPT, again)));
  eq(again, ["bruno@exemplo.invalid"], "a nova rodada reenvia só o que falhou, uma vez");
});

await check("E4) ausência de destinatário com 6 execuções simultâneas: UMA linha SUPPRESSED, nenhum e-mail", async () => {
  const key = { ...NKEY, recordId: uuid(3, 101), eventDate: "2026-11-07" };
  const sent = [];
  await Promise.all(Array.from({ length: 6 }, () => runNotify(key, [], sent)));
  eq(sent.length, 0, "sem e-mail");
  eq(await count("select count(*)::int n from public.ssma_field_notification_deliveries where record_id=$1 and status='SUPPRESSED'", [key.recordId]), 1, "uma linha suprimida");
});

// invariantes globais
await check("invariantes: nenhuma ação SLA de origem SSMA sem ação SSMA correspondente e nenhuma ação SSMA com mais de uma ação SLA", async () => {
  eq(await count("select count(*)::int n from public.sla_actions s where s.origin='SSMA_CORRECTIVE_ACTION' and not exists (select 1 from public.ssma_corrective_actions a where a.id=s.related_ssma_corrective_action_id and a.sla_action_id=s.id)"), 0, "órfãs");
  eq(await count("select count(*)::int n from (select related_ssma_corrective_action_id from public.sla_actions where related_ssma_corrective_action_id is not null group by 1 having count(*)>1) x"), 0, "duplicadas");
  eq(await count("select count(*)::int n from (select record_id,event,event_date,recipient_email from public.ssma_field_notification_deliveries group by 1,2,3,4 having count(*)>1) x"), 0, "entregas duplicadas");
});

await setup.end();
await admin.query(`drop database ${dbName} with (force)`);
await admin.end();
console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
