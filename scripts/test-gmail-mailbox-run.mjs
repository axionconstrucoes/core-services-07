// Decisões de execução por caixa no modo delegação (sem rede, sem banco real): cliente Supabase FALSO em memória.
// Cobre falha fechada sem a tabela de controles, Carlos/Jaime sem autorização, teste técnico antes do período,
// aceite individual mais restritivo, revogação durante a execução, janela de leitura, retentativa limitada e redação de erros.
// Uso: node scripts/test-gmail-mailbox-run.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_CONSECUTIVE_SYNC_ERRORS, evaluateMailboxCollection, resolveDelegatedReadWindow } from "./lib/gmail-mailbox-gate.mjs";
import {
  CONTROLS_MISSING_MESSAGE, assertStillCollectable, isMissingRelationError, isRetryableGmailError, prepareDelegatedRun, safeErrorDetail, withLimitedRetry,
} from "./lib/gmail-mailbox-run.mjs";

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); failed += 1; }
}

const P1 = "p1", P2 = "p2";
/** Cliente falso: tabelas em memória; `missing` simula tabela inexistente (erro PostgREST PGRST205). */
function fakeSupabase(tables, { missing = [] } = {}) {
  return {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, val) { filters.push([col, val]); return q; },
        order() { return q; },
        async maybeSingle() { const r = await q.then((x) => x); return r.error ? r : { data: r.data[0] ?? null, error: null }; },
        then(resolve) {
          if (missing.includes(table)) return resolve({ data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } });
          const rows = (tables[table] ?? []).filter((row) => filters.every(([c, v]) => row[c] === v));
          return resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  };
}
const NOW = new Date("2026-11-20T12:00:00Z");
const control = (over = {}) => ({
  project_id: P1, mailbox_address: "reynaldo@axion.com.br", corporate_authorization_status: "AUTORIZADA", individual_consent_status: "NAO_REGISTRADO",
  technical_permission_status: "CONFIRMADA", collection_enabled: true, period_start: "2026-08-01T00:00:00Z", period_end: "2026-12-31T00:00:00Z",
  revoked_at: null, last_sync_at: null, consecutive_errors: 0, ...over,
});
const base = (over = {}) => ({
  project_email_ingestion_configs: [{ id: "c1", project_id: P1 }, { id: "c2", project_id: P2 }],
  project_email_ingestion_mailboxes: [
    { config_id: "c1", mailbox_address: "reynaldo@axion.com.br", enabled: true },
    { config_id: "c1", mailbox_address: "corazza@axion.com.br", enabled: true },
  ],
  email_mailbox_collection_controls: [control()],
  email_access_authorizations: [{ id: "a1", project_id: P1, account_email: "reynaldo@axion.com.br", status: "AUTORIZADO", requested_at: "2026-11-11T13:00:00Z", decided_at: "2026-11-11T13:30:00Z" }],
  ...over,
});

await check("R1 tabela de controles AUSENTE (produção hoje) => falha FECHADA com mensagem clara; nada é lido", async () => {
  const sb = fakeSupabase(base(), { missing: ["email_mailbox_collection_controls"] });
  for (const mode of ["collect", "technical_check"]) {
    const d = await prepareDelegatedRun({ supabase: sb, projectId: P1, mailbox: "reynaldo@axion.com.br", mode, now: NOW });
    assert.equal(d.proceed, false); assert.equal(d.failClosed, true); assert.equal(d.reason, CONTROLS_MISSING_MESSAGE);
    assert.match(d.reason, /20261107090000/);
  }
  assert.ok(isMissingRelationError({ code: "42P01", message: 'relation "x" does not exist' }));
  assert.ok(!isMissingRelationError({ code: "23505", message: "duplicate" }));
});
await check("R2 Carlos e Jaime (cadastrados, sem autorização, fora da lista) => bloqueados na coleta E no teste técnico", async () => {
  const sb = fakeSupabase(base());
  for (const mb of ["carlos.evandro@axion.com.br", "jaime.ramos@axion.com.br"]) {
    for (const mode of ["collect", "technical_check"]) {
      const d = await prepareDelegatedRun({ supabase: sb, projectId: P1, mailbox: mb, mode, now: NOW });
      assert.equal(d.proceed, false, `${mb} ${mode}`); assert.deepEqual(d.blockers, ["SEM_REGISTRO_DE_CONTROLE"]);
    }
  }
});
await check("R3 corazza: na lista da obra mas SEM controle/autorização => bloqueada (lista não autoriza)", async () => {
  const d = await prepareDelegatedRun({ supabase: fakeSupabase(base()), projectId: P1, mailbox: "corazza@axion.com.br", now: NOW });
  assert.equal(d.proceed, false); assert.deepEqual(d.blockers, ["SEM_REGISTRO_DE_CONTROLE"]);
});
await check("R4 teste técnico roda ANTES de habilitar a coleta (sem período, sem permissão técnica) — antes era bloqueado por PERIODO_NAO_DEFINIDO", async () => {
  const sb = fakeSupabase(base({ email_mailbox_collection_controls: [control({ technical_permission_status: "NAO_VERIFICADA", collection_enabled: false, period_start: null, period_end: null })] }));
  const tech = await prepareDelegatedRun({ supabase: sb, projectId: P1, mailbox: "reynaldo@axion.com.br", mode: "technical_check", now: NOW });
  assert.equal(tech.proceed, true, tech.blockers.join(","));
  const collect = await prepareDelegatedRun({ supabase: sb, projectId: P1, mailbox: "reynaldo@axion.com.br", mode: "collect", now: NOW });
  assert.equal(collect.proceed, false);
  for (const b of ["PERMISSAO_TECNICA_NAO_CONFIRMADA", "COLETA_NAO_HABILITADA", "PERIODO_NAO_DEFINIDO"]) assert.ok(collect.blockers.includes(b), b);
});
await check("R5 aceite individual REVOGADO em email_access_authorizations bloqueia mesmo com o controle desatualizado (vale o mais restritivo)", async () => {
  const sb = fakeSupabase(base({ email_access_authorizations: [
    { id: "a1", project_id: P1, account_email: "reynaldo@axion.com.br", status: "AUTORIZADO", requested_at: "2026-11-11T13:00:00Z", decided_at: "2026-11-11T13:30:00Z" },
    { id: "a2", project_id: P1, account_email: "reynaldo@axion.com.br", status: "REVOGADO", requested_at: "2026-11-12T10:00:00Z", decided_at: "2026-11-19T10:00:00Z" },
  ] }));
  for (const mode of ["collect", "technical_check"]) {
    const d = await prepareDelegatedRun({ supabase: sb, projectId: P1, mailbox: "reynaldo@axion.com.br", mode, now: NOW });
    assert.equal(d.proceed, false); assert.ok(d.blockers.includes("ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO"), d.blockers.join(","));
  }
  // aceite de OUTRA obra não conta para esta
  const other = fakeSupabase(base({ email_access_authorizations: [{ id: "x", project_id: P2, account_email: "reynaldo@axion.com.br", status: "REVOGADO", requested_at: "2026-11-19T00:00:00Z" }] }));
  assert.equal((await prepareDelegatedRun({ supabase: other, projectId: P1, mailbox: "reynaldo@axion.com.br", now: NOW })).proceed, true);
});
await check("R6 revogação DURANTE a execução: a releitura antes de gravar bloqueia", async () => {
  const tables = base();
  const sb = fakeSupabase(tables);
  assert.equal((await prepareDelegatedRun({ supabase: sb, projectId: P1, mailbox: "reynaldo@axion.com.br", now: NOW })).proceed, true);
  tables.email_mailbox_collection_controls[0] = control({ revoked_at: "2026-11-20T12:01:00Z", collection_enabled: false, corporate_authorization_status: "REVOGADA" });
  const still = await assertStillCollectable({ supabase: sb, projectId: P1, mailbox: "reynaldo@axion.com.br", now: NOW });
  assert.equal(still.ok, false); assert.ok(still.blockers.includes("REVOGADA"));
  tables.email_mailbox_collection_controls = [];
  assert.equal((await assertStillCollectable({ supabase: fakeSupabase(tables, { missing: ["email_mailbox_collection_controls"] }), projectId: P1, mailbox: "reynaldo@axion.com.br", now: NOW })).ok, false);
});
await check("R7 controle de uma OBRA não autoriza a mesma caixa em outra obra", async () => {
  const sb = fakeSupabase(base({ project_email_ingestion_mailboxes: [...base().project_email_ingestion_mailboxes, { config_id: "c2", mailbox_address: "reynaldo@axion.com.br", enabled: true }] }));
  const d = await prepareDelegatedRun({ supabase: sb, projectId: P2, mailbox: "reynaldo@axion.com.br", now: NOW });
  assert.equal(d.proceed, false); assert.deepEqual(d.blockers, ["SEM_REGISTRO_DE_CONTROLE"]);
});
await check("R8 janela: cursor próprio da caixa; sobreposição nunca antes do início do período; fim nunca depois do período", () => {
  const w1 = resolveDelegatedReadWindow(control(), { now: NOW });
  assert.equal(w1.overlapStart.toISOString(), "2026-08-01T00:00:00.000Z"); // sem cursor: início do período, SEM recuar 10 min
  const w2 = resolveDelegatedReadWindow(control({ last_sync_at: "2026-11-20T10:00:00Z" }), { now: NOW });
  assert.equal(w2.overlapStart.toISOString(), "2026-11-20T09:50:00.000Z"); assert.equal(w2.end.toISOString(), NOW.toISOString());
  const w3 = resolveDelegatedReadWindow(control({ period_end: "2026-11-01T00:00:00Z", last_sync_at: "2026-11-01T00:00:00Z" }), { now: NOW });
  assert.equal(w3.end.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(resolveDelegatedReadWindow(control({ period_start: null, last_sync_at: null }), { now: NOW }), null);
});
await check("R9 retentativa limitada: teto de erros seguidos bloqueia; só cota/5xx são repetidos; tentativas finitas", async () => {
  const r = evaluateMailboxCollection(control({ consecutive_errors: MAX_CONSECUTIVE_SYNC_ERRORS }), { now: NOW, allowlisted: true });
  assert.ok(r.blockers.includes("RETENTATIVAS_ESGOTADAS"));
  assert.ok(isRetryableGmailError({ status: 429 })); assert.ok(isRetryableGmailError({ code: 503 }));
  assert.ok(isRetryableGmailError({ status: 403, errors: [{ reason: "userRateLimitExceeded" }] }));
  assert.ok(!isRetryableGmailError({ status: 403, errors: [{ reason: "forbidden" }] })); assert.ok(!isRetryableGmailError({ status: 401 })); assert.ok(!isRetryableGmailError({ status: 404 }));
  let calls = 0;
  await assert.rejects(() => withLimitedRetry(async () => { calls += 1; throw Object.assign(new Error("x"), { status: 503 }); }, { attempts: 4, sleep: async () => {} }));
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(() => withLimitedRetry(async () => { calls += 1; throw Object.assign(new Error("x"), { status: 401 }); }, { attempts: 4, sleep: async () => {} }));
  assert.equal(calls, 1);
});
await check("R10 detalhe de erro registrado não carrega token nem assertion", () => {
  assert.equal(safeErrorDetail(new Error("DWD_TOKEN_EXCHANGE_FAILED:unauthorized_client")), "DWD_TOKEN_EXCHANGE_FAILED:unauthorized_client");
  const d = safeErrorDetail(Object.assign(new Error("falhou com ya29.AAAsegredo e eyJhbGciOi.payload.sig"), { status: 401 }));
  assert.ok(!d.includes("ya29.AAA") && !d.includes("eyJhbGciOi") && d.startsWith("HTTP 401"), d);
});
await check("S1 coletor: porta única por caixa, releitura antes de gravar, falha registrada na caixa, cursor nunca da configuração no modo delegação", () => {
  const src = readFileSync(new URL("./gmail-inbound-sync.mjs", import.meta.url), "utf8");
  assert.ok(src.includes("prepareDelegatedRun(") && src.includes("assertStillCollectable("), "porta e releitura");
  assert.ok(src.indexOf("assertStillCollectable(") < src.indexOf('.from("emails")\n      .insert') || src.indexOf("assertStillCollectable(") < src.lastIndexOf(".insert(batch)"), "releitura antes da gravação");
  assert.ok(/record_mailbox_technical_check[\s\S]{0,120}p_ok: false/.test(src) && /p_status: "ERRO"/.test(src), "falhas registradas");
  assert.ok(src.includes("decision.failClosed") && src.includes("process.exit(1)"), "falha fechada encerra com erro");
  assert.ok(!/evaluateMailboxCollection\([\s\S]{0,200}technical_permission_status: "CONFIRMADA"/.test(src), "não pode mais fingir permissão técnica no teste técnico");
});
await check("S2 worker de anexos: isolado por CAIXA e com a mesma porta no modo delegação", () => {
  const src = readFileSync(new URL("./gmail-ata-ingestion-worker.mjs", import.meta.url), "utf8");
  assert.equal((src.match(/\.eq\("mailbox_address", mailbox\)/g) ?? []).length, 3, "as 3 consultas precisam filtrar a caixa");
  assert.ok(src.includes("prepareDelegatedRun(") && src.includes("createDelegatedGmailAuth("), "delegação passa pela porta");
});
await check("S3 workflows: delegação continua manual e sem schedule; coletor agendado continua com a caixa fixa", () => {
  const wf = readFileSync(new URL("../.github/workflows/gmail-delegated-sync.yml", import.meta.url), "utf8");
  assert.ok(!/^\s*schedule:/m.test(wf.replace(/#[^\n]*/g, "")) && /workflow_dispatch/.test(wf));
  assert.ok(/gmail-ata-ingestion-worker\.mjs/.test(wf) && /mode != 'technical_check'/.test(wf), "anexos por delegação só fora do teste técnico");
  const cron = readFileSync(new URL("../.github/workflows/gmail-inbound-sync.yml", import.meta.url), "utf8");
  // Agendador unico: o coletor e agendado pelo pg_cron (acc-gmail-sync, 15 min) via workflow_dispatch, sem schedule proprio.
  assert.ok(!/^\s*schedule:/m.test(cron.replace(/#[^\n]*/g, "")) && /^  workflow_dispatch:/m.test(cron) && cron.includes("GOOGLE_GMAIL_INBOUND_MAILBOX: reynaldo@axion.com.br"));
});

await check("S4 caminhos OAuth históricos (coletor agendado e caixa do titular) param com recusa/revogação explícita do aceite no ACC", () => {
  for (const file of ["./gmail-inbound-sync.mjs", "./gmail-owner-mailbox-sync.mjs"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(src.includes("deriveIndividualConsent(") && /consent\.status === "RECUSADO" \|\| consent\.status === "REVOGADO"/.test(src), file);
    assert.ok(src.indexOf("deriveIndividualConsent(consentRows") < src.indexOf("setCredentials"), `${file}: checagem antes de autenticar no Google`);
  }
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
