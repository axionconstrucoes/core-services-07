// Governador de envio de alertas (doc 35) contra PostgreSQL LOCAL descartável (PGlite) com a tabela REAL audit_log_entries
// (migration 20260819195713) e o CICLO REAL de alertas de risco (runRiskAlertCycle) sobre o store em memória e provedores FAKE.
// Nenhuma rede, nenhum banco real, nenhum e-mail. Prova: abaixo do limite envia; no limite suprime e audita; lote maior que o tamanho
// divide; fonte/projeto não habilitados bloqueiam; configuração inválida bloqueia; kill switch; reexecução não reenvia; padrão
// (variáveis ausentes) preserva o comportamento atual; consultas de monitoramento somente leitura.
//
// Uso: node scripts/test-alert-send-governor-sql.mjs
import net from "node:net";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const leaked = Object.keys(process.env).filter((k) => /^(SUPABASE_|NEXT_PUBLIC_SUPABASE|GOOGLE_(?!GMAIL_INBOUND_MAILBOX$)|ANTHROPIC_API_KEY|ELEVENLABS_|CRON_SECRET|ACC_RISK_ALERTS_|ACC_ALERT_)/.test(k));
if (leaked.length > 0) {
  console.error(`ABORTADO: credenciais/variáveis no ambiente (${leaked.join(", ")}). Rode com ambiente limpo.`);
  process.exit(2);
}
globalThis.fetch = async () => {
  throw new Error("NETWORK_BLOCKED");
};
net.Socket.prototype.connect = function blockedConnect() {
  throw new Error("NETWORK_BLOCKED");
};
process.env.ACC_WEEKLY_REPORTS_ENABLED = "true";
process.env.AXION_APP_BASE_URL = "https://acc-simulacao.invalid";
process.env.GOOGLE_GMAIL_INBOUND_MAILBOX = "crm@axion.com.br";
register("./ts-module-resolver.mjs", import.meta.url);
register("./lib/weg-alert-sim/hooks.mjs", import.meta.url);

const { runRiskAlertCycle } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { GovernedEmailProvider, AlertSendBlockedError } = await import("../apps/web/lib/email/governed-email-provider");
const { createSupabaseGovernorLedger } = await import("../apps/web/lib/email/alert-send-governor-ledger");
const { createInMemoryRiskAlertStore } = await import("./lib/weg-alert-sim/in-memory-risk-alert-store.mjs");
const { createLocalDb } = await import("./lib/pglite-supabase-stub.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-00000000f003";
const CRM = "crm@axion.com.br";
const AREA = "PLANEJAMENTO";
const U = { RESP: "a1111111-0000-4000-8000-000000000011", GESTOR: "b2222222-0000-4000-8000-000000000012", DIR: "c3333333-0000-4000-8000-000000000013" };
const EMAIL = { [U.RESP]: "reynaldo@axion.com.br", [U.GESTOR]: "jaime.ramos@axion.com.br", [U.DIR]: "carlos.evandro@axion.com.br" };
const T0 = "2026-11-04T13:00:00.000Z";
const plusMin = (iso, m) => new Date(new Date(iso).getTime() + m * 60_000).toISOString();

// ------------------------------------------------------------------ banco local (tabela real audit_log_entries)
const db = await createLocalDb(
  ["20260819195713_audit_foundation.sql"],
  "create function public.is_project_member(p_project_id uuid) returns boolean language sql stable as $$ select false $$;"
);
await db.query("insert into public.projects (id, name) values ($1, 'Obra piloto'), ($2, 'Outra obra')", [PROJECT_ID, OTHER_PROJECT_ID]);
await db.exec("set role service_role");
const base = Date.now();
let clock = new Date(base);
const setClock = (ms) => (clock = new Date(base + ms));

/** Cliente com a forma mínima do supabase-js sobre o PGlite (service_role). O relógio do banco é o do teste (occurred_at explícito). */
function pgliteClient() {
  return {
    from(table) {
      return {
        select(columns) {
          const where = [];
          const params = [];
          let limit = "";
          const b = {
            eq(c, v) { params.push(v); where.push(`${c} = $${params.length}`); return b; },
            in(c, vs) { params.push(vs); where.push(`${c} = any($${params.length})`); return b; },
            gte(c, v) { params.push(v); where.push(`${c} >= $${params.length}`); return b; },
            like(c, v) { params.push(v); where.push(`${c} like $${params.length}`); return b; },
            limit(n) { limit = ` limit ${Number(n)}`; return b; },
            then(res, rej) {
              db.query(`select ${columns} from public.${table}${where.length ? ` where ${where.join(" and ")}` : ""}${limit}`, params)
                .then((r) => ({ data: r.rows, error: null }))
                .then(res, rej);
            },
          };
          return b;
        },
        async insert(row) {
          const full = { ...row, occurred_at: clock.toISOString() };
          const cols = Object.keys(full);
          await db.query(`insert into public.${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => full[c]));
          return { error: null };
        },
      };
    },
  };
}
const ledger = () => createSupabaseGovernorLedger(pgliteClient());
const count = async (where, params = []) => Number((await db.query(`select count(*)::int as n from public.audit_log_entries where ${where}`, params)).rows[0].n);
const cleanLedger = async () => {
  // O ledger é append-only por trigger; cada cenário usa um PROJETO/relógio novos em vez de apagar. Aqui só reposiciona o relógio.
};

// ------------------------------------------------------------------ mundo do ciclo (3 casos CRÍTICOS => 3 e-mails ao Responsável por execução)
const rule = (projectId, riskLevel, timeUnit, assume, esc2, board, ack) => ({
  id: `rule-${projectId}-${riskLevel}`, projectId, riskLevel, area: null, timeUnit, assumeDeadlineValue: assume, respondDeadlineValue: null,
  completeDeadlineValue: null, escalation2AfterValue: esc2, boardAfterValue: board, notifyByEmail: true, requiresAcknowledgmentConfirmation: ack,
  requiresDelayJustification: true, isDefault: false, active: true,
});
let worldSeq = 0;
// Cada mundo usa casos DIFERENTES (chaves de idempotência novas): o governador, corretamente, barra o mesmo evento por 24 h.
function makeWorld(projectId = PROJECT_ID, { governed = true, caseCount = 3, shouldFail = undefined } = {}) {
  const tag = (worldSeq += 1);
  const recipients = new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
  const world = {
    projectId,
    projectName: "[ENSAIO] Obra fictícia",
    config: {
      enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: Object.values(U), senderDomain: "axion.com.br",
      severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" },
      pilotProjectConfirmedAt: T0,
      pilotDeliveryOverrideEmail: null,
    },
    matrixRules: [
      rule(projectId, "LOW", "BUSINESS_DAYS", 3, 3, 2, false), rule(projectId, "MEDIUM", "BUSINESS_DAYS", 1, 1, 1, false),
      rule(projectId, "HIGH", "CLOCK_HOURS", 1, 1, 1, true), rule(projectId, "CRITICAL", "CLOCK_HOURS", 1, 1, 1, true),
    ],
    areaResponsibles: [{
      id: "resp-ens", projectId, area: AREA, responsibleDirectUserId: U.RESP, responsibleDirectInvitationId: null, responsibleDirectName: null,
      secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U.GESTOR,
      escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.DIR, boardInvitationId: null,
      boardName: null, updatedAt: T0,
    }],
    settings: null,
    recipients,
    senderMailbox: CRM,
    replyMailbox: CRM,
    sourceCases: Array.from({ length: caseCount }, (_, i) => i + 1).map((n) => ({
      sourceType: "SCHEDULE_COMPARISON", sourceId: `ens-critical-${tag}-${n}`, area: AREA, riskLevel: "CRITICAL", title: `[ENSAIO] Risco crítico fictício ${n}`,
      summary: "Desvio fictício.", impact: "Impacto fictício.", recommendation: "Ação fictícia.", fingerprint: `fp-critical-${tag}-${n}-v1`,
      originPath: "documentos?tab=registro-email", closed: false, reference: `ENS-CRITICAL-${tag}-${n}`,
    })),
    legacyNoClaim: false,
  };
  const store = createInMemoryRiskAlertStore(world);
  const rec = { guarded: [] };
  const inner = new FakeEmailProvider({ onGuardedInput: (g) => rec.guarded.push(g), shouldFail });
  const provider = governed ? new GovernedEmailProvider({ inner, ledger, now: () => clock }) : inner;
  const expert = { answer: async () => ({ answerText: "Resposta simulada.", confidence: 0.5, requiresHumanReview: true }) };
  const run = async (nowIso) => {
    store.setClock(nowIso);
    return runRiskAlertCycle({ now: new Date(nowIso), store, provider, expert });
  };
  return { world, store, rec, run, provider };
}
async function withEnv(vars, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, {
    ACC_PROJECT_PILOT_PROJECT_ID: PROJECT_ID, ACC_PROJECT_PILOT_SENDER: CRM, AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM, ...vars,
  });
  delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
const sentRows = (w) => w.store.state.outbox.filter((o) => o.status === "SENT");

// ------------------------------------------------------------------ cenários
let baselineSends = 0;
await check("PADRÃO (variáveis ausentes): ciclo governado envia exatamente o que o ciclo sem governador envia (3 casos), sem uma linha no ledger", () =>
  withEnv({}, async () => {
    setClock(0);
    const plain = makeWorld(PROJECT_ID, { governed: false });
    await plain.run(T0);
    baselineSends = plain.rec.guarded.length;
    assert(baselineSends >= 3, `linha de base ${baselineSends}`);
    const before = await count("true");
    const gov = makeWorld();
    await gov.run(T0);
    assert(gov.rec.guarded.length === baselineSends, `governado ${gov.rec.guarded.length} != base ${baselineSends}`);
    assert(JSON.stringify(gov.rec.guarded.map((g) => [g.to, g.cc])) === JSON.stringify(plain.rec.guarded.map((g) => [g.to, g.cc])), "destinos/cópias diferem do comportamento atual");
    assert((await count("true")) === before, "o caminho padrão escreveu no ledger");
  }));

await check("ABAIXO do limite (10/h): envia tudo e registra uma admissão por e-mail; trava do piloto intacta (nenhum destino fora do piloto)", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "10" }, async () => {
    setClock(10 * 60e3);
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === baselineSends, `enviou ${w.rec.guarded.length}`);
    assert(sentRows(w).length === baselineSends);
    const admitted = await count("action = 'ALERT_GOVERNOR_ADMITTED' and occurred_at = $1", [clock.toISOString()]);
    assert(admitted === baselineSends, `admissões ${admitted}`);
    assert(w.rec.guarded.every((g) => Object.values(EMAIL).includes(g.to) && JSON.stringify(g.cc) === JSON.stringify([CRM])), "destino/cópia fora do perfil do piloto");
  }));

await check("NO limite (2/h): suprime o excedente, audita com motivo, cota devolvida; linhas excedentes não ficam como enviadas", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "2" }, async () => {
    setClock(3 * 3600e3); // janela nova: nada em aberto na última hora
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === 2, `enviou ${w.rec.guarded.length}, esperado 2`);
    assert(sentRows(w).length === 2);
    const sup = await count("action in ('ALERT_GOVERNOR_SUPPRESSED', 'ALERT_GOVERNOR_DEFERRED') and detail like '%HOURLY_LIMIT%' and occurred_at = $1", [clock.toISOString()]);
    assert(sup >= 1, "supressão por limite não auditada");
    const net = await db.query(`select count(*)::int n from public.audit_log_entries a where action='ALERT_GOVERNOR_ADMITTED' and occurred_at >= $1 and not exists (select 1 from public.audit_log_entries r where r.action='ALERT_GOVERNOR_RELEASED' and r.entity_id=a.entity_id)`, [new Date(clock.getTime() - 3600e3).toISOString()]);
    assert(net.rows[0].n === 2, `admissões líquidas ${net.rows[0].n}`);
    // a linha bloqueada fica retentável (não terminal): depois que a janela passa, o MESMO evento sai sem duplicar os já enviados
    setClock(3 * 3600e3 + 61 * 60e3);
    await w.run(plusMin(T0, 1));
    assert(w.rec.guarded.length === baselineSends && sentRows(w).length === baselineSends, `após a janela: ${w.rec.guarded.length}/${baselineSends}`);
    const dupe = new Set(w.rec.guarded.map((g) => g.subject));
    assert(dupe.size === w.rec.guarded.length, "mesmo e-mail enviado duas vezes");
  }));

await check("LOTE por execução (ACC_ALERT_BATCH_SIZE=1): lote maior que o tamanho divide em execuções; linhas não enviadas continuam PENDING sem gastar tentativa", () =>
  withEnv({ ACC_ALERT_BATCH_SIZE: "1" }, async () => {
    setClock(6 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === 1, `1ª execução enviou ${w.rec.guarded.length}`);
    const pending = w.store.state.outbox.filter((o) => o.status === "PENDING");
    assert(pending.length >= baselineSends - 1 && pending.every((o) => (o.attemptCount ?? 0) === 0), "linhas não enviadas foram reivindicadas ou gastaram tentativa");
    await w.run(plusMin(T0, 1));
    assert(w.rec.guarded.length === 2, `2ª execução acumulou ${w.rec.guarded.length}`);
    await w.run(plusMin(T0, 2));
    assert(w.rec.guarded.length === 3, `3ª execução acumulou ${w.rec.guarded.length}`);
    assert(new Set(w.rec.guarded.map((g) => g.subject)).size === w.rec.guarded.length, "duplicidade entre lotes");
  }));

await check("REEXECUÇÃO não reenvia: ciclo repetido (mesmo instante e depois) e reenvio direto da mesma chave não geram novo e-mail", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "50" }, async () => {
    setClock(9 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    const first = w.rec.guarded.length;
    await w.run(T0);
    await w.run(plusMin(T0, 1));
    assert(w.rec.guarded.length === first, `reexecução enviou ${w.rec.guarded.length - first} a mais`);
    // mesma chave de evento diretamente no provedor governado => DUPLICATE (proteção do governador, além da outbox/claim)
    const row = sentRows(w)[0];
    const msg = { to: EMAIL[row.recipientUserId], subject: "reenvio", text: "x", correlationId: "x", governance: { type: "RISK_IMMEDIATE", projectId: PROJECT_ID, dedupKey: row.idempotencyKey } };
    const first2 = await w.provider.send({ ...msg, governance: { ...msg.governance, dedupKey: "chave-nova-1" } });
    assert(first2.providerMessageId);
    const e = await w.provider.send({ ...msg, governance: { ...msg.governance, dedupKey: "chave-nova-1" } }).catch((x) => x);
    assert(e instanceof AlertSendBlockedError && e.reason === "DUPLICATE", `reenvio da mesma chave: ${e?.reason ?? "enviou"}`);
  }));

await check("PROJETO não habilitado bloqueia (e audita no projeto); projeto habilitado envia", () =>
  withEnv({ ACC_ALERT_ENABLED_PROJECTS: OTHER_PROJECT_ID, ACC_ALERT_MAX_PER_HOUR: "50" }, async () => {
    setClock(12 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === 0 && sentRows(w).length === 0, "enviou para projeto não habilitado");
    assert((await count("action in ('ALERT_GOVERNOR_SUPPRESSED', 'ALERT_GOVERNOR_DEFERRED') and detail like '%PROJECT_NOT_ENABLED%' and project_id = $1", [PROJECT_ID])) >= 1, "supressão não auditada");
  }));
await check("FONTE não habilitada bloqueia (RISCO fora da lista); fonte reservada (CRONOGRAMA) bloqueada por padrão", () =>
  withEnv({ ACC_ALERT_ENABLED_SOURCES: "SSMA" }, async () => {
    setClock(15 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === 0, "enviou com a fonte RISCO desabilitada");
    const e = await withEnv({}, () => w.provider.send({ to: CRM, subject: "s", text: "t", correlationId: "c", governance: { type: "SCHEDULE_ALERT", projectId: PROJECT_ID } }).catch((x) => x));
    assert(e instanceof AlertSendBlockedError && e.reason === "SOURCE_NOT_ENABLED", "fonte reservada deveria estar bloqueada por padrão");
  }));
await check("TIPO não habilitado bloqueia só o tipo (IMMEDIATE habilitado, ESCALATION não)", () =>
  withEnv({ ACC_ALERT_ENABLED_TYPES: "RISK_IMMEDIATE" }, async () => {
    setClock(18 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    const afterFirst = w.rec.guarded.length;
    assert(afterFirst === baselineSends, `IMMEDIATE habilitado enviou ${afterFirst}`);
    await w.run(plusMin(T0, 61)); // escalonamento ao Gestor = RISK_ESCALATION (não habilitado)
    assert(w.rec.guarded.length === afterFirst, "tipo não habilitado enviou");
    assert((await count("action in ('ALERT_GOVERNOR_SUPPRESSED', 'ALERT_GOVERNOR_DEFERRED') and detail like '%TYPE_NOT_ENABLED%'")) >= 1, "supressão de tipo não auditada");
  }));
await check("CONFIGURAÇÃO inválida bloqueia tudo e audita INVALID_CONFIG; valor corrigido libera", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "muitos" }, async () => {
    setClock(21 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === 0, "enviou com configuração inválida");
    assert((await count("action in ('ALERT_GOVERNOR_SUPPRESSED', 'ALERT_GOVERNOR_DEFERRED') and detail like '%INVALID_CONFIG%'")) >= 1, "INVALID_CONFIG não auditada");
    // o texto auditado não vaza o valor lido
    const { rows } = await db.query("select detail from public.audit_log_entries where detail like '%INVALID_CONFIG%' limit 1");
    assert(!rows[0].detail.includes("muitos"), "valor da variável vazou na auditoria");
  }));
await check("KILL SWITCH: nenhum envio, mesmo com tudo habilitado; auditado", () =>
  withEnv({ ACC_ALERT_KILL_SWITCH: "true", ACC_ALERT_ENABLED_PROJECTS: PROJECT_ID, ACC_ALERT_MAX_PER_HOUR: "100" }, async () => {
    setClock(24 * 3600e3);
    const w = makeWorld();
    await w.run(T0);
    assert(w.rec.guarded.length === 0 && sentRows(w).length === 0);
    assert((await count("action in ('ALERT_GOVERNOR_SUPPRESSED', 'ALERT_GOVERNOR_DEFERRED') and detail like '%KILL_SWITCH%'")) >= 1);
  }));

// ------------------------------------------------------------------ P1: adiamento ANTES da reivindicação (sem consumir tentativa)
await check("P1 ADIAMENTO: limite 2/h e 5 linhas PENDING — excedentes não consomem tentativa nem vão a FAILED; 2 saem por janela; nada reenviado nem perdido", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "2" }, async () => {
    const h = 3600e3;
    setClock(50 * h);
    const w = makeWorld(PROJECT_ID, { caseCount: 5 });
    await w.run(T0);
    assert(w.rec.guarded.length === 2, `1ª execução enviou ${w.rec.guarded.length}`);
    // várias execuções na MESMA janela: nada novo sai e nenhuma tentativa é gasta
    for (let i = 0; i < 4; i += 1) {
      setClock(50 * h + (i + 1) * 5 * 60e3);
      await w.run(T0);
    }
    assert(w.rec.guarded.length === 2, `execuções repetidas na janela enviaram ${w.rec.guarded.length}`);
    const rows = w.store.state.outbox;
    const pending = rows.filter((o) => o.status === "PENDING");
    assert(sentRows(w).length === 2 && pending.length === 3 && rows.every((o) => o.status !== "FAILED"), `SENT=${sentRows(w).length} PENDING=${pending.length} FAILED=${rows.filter((o) => o.status === "FAILED").length}`);
    assert(pending.every((o) => (o.attemptCount ?? 0) === 0), `tentativas gastas pelas excedentes: ${pending.map((o) => o.attemptCount).join(",")}`);
    assert((await count("action = 'ALERT_GOVERNOR_DEFERRED' and detail like '%ADIADO%' and detail like '%HOURLY_LIMIT%'")) >= 1, "adiamento não auditado");
    // janela seguinte: mais 2; depois o último — nenhum reenviado, nenhum perdido
    setClock(52 * h);
    await w.run(T0);
    assert(w.rec.guarded.length === 4, `2ª janela acumulou ${w.rec.guarded.length}`);
    setClock(54 * h);
    await w.run(T0);
    assert(w.rec.guarded.length === 5 && sentRows(w).length === 5, `3ª janela acumulou ${w.rec.guarded.length}`);
    assert(new Set(w.rec.guarded.map((g) => g.subject)).size === 5, "reenvio detectado");
    setClock(56 * h);
    await w.run(T0);
    assert(w.rec.guarded.length === 5, "execução extra enviou de novo");
  }));

await check("P1 FALHA REAL de envio (não de limite) continua consumindo tentativa como antes", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "10" }, async () => {
    setClock(80 * 3600e3);
    const w = makeWorld(PROJECT_ID, { caseCount: 2, shouldFail: () => true });
    await w.run(T0);
    const rows = w.store.state.outbox;
    assert(rows.length >= 2 && rows.every((o) => o.status !== "SENT"), "algo foi enviado com falha simulada");
    assert(rows.every((o) => (o.attemptCount ?? 0) >= 1), `tentativas: ${rows.map((o) => o.attemptCount).join(",")}`);
    // a falha certa devolveu a cota do ledger (nada consumido)
    const net = await db.query(`select count(*)::int n from public.audit_log_entries a where action='ALERT_GOVERNOR_ADMITTED' and occurred_at >= $1 and not exists (select 1 from public.audit_log_entries r where r.action='ALERT_GOVERNOR_RELEASED' and r.entity_id=a.entity_id)`, [new Date(clock.getTime() - 3600e3).toISOString()]);
    assert(net.rows[0].n === 0, `cota consumida por falha real: ${net.rows[0].n}`);
  }));

// ------------------------------------------------------------------ MASSA: 200 alertas, valores F0 aprovados (10/h, 30/dia, lote 5, só a WEG)
await check("MASSA 200 alertas (F0 aprovado: 10/h, 30/dia, lote 5, só WEG): nunca >10 em 1 h, >30 em 24 h, lote >5 nem duplicidade; nada perdido; outro projeto bloqueado", () =>
  withEnv({ ACC_ALERT_MAX_PER_HOUR: "10", ACC_ALERT_MAX_PER_DAY: "30", ACC_ALERT_BATCH_SIZE: "5", ACC_ALERT_ENABLED_PROJECTS: PROJECT_ID }, async () => {
    const h = 3600e3;
    const start = 120 * h;
    const inner = new FakeEmailProvider();
    const provider = new GovernedEmailProvider({ inner, ledger, now: () => clock });
    const queue = Array.from({ length: 200 }, (_, i) => ({ key: `massa-${i}`, critical: i % 10 === 0 }));
    const sentAt = [];
    const sentKeys = [];
    let dupBlocked = 0;
    let maxBatch = 0;
    const batchSize = 5;
    for (let run = 0; run < 8 * 24 * 6 && queue.length > 0; run += 1) {
      setClock(start + run * 10 * 60e3);
      let used = 0;
      for (const item of [...queue].sort((a, b) => Number(b.critical) - Number(a.critical))) {
        if (used >= batchSize) break;
        const governance = { type: "RISK_IMMEDIATE", projectId: PROJECT_ID, dedupKey: item.key, priority: item.critical ? "CRITICAL" : null };
        if (!(await provider.checkCapacity(governance)).allowed) break; // adiado: fica na fila, sem tentativa
        used += 1;
        await provider.send({ to: "colab@axion.com.br", subject: item.key, text: "t", correlationId: item.key, governance });
        sentAt.push(clock.getTime());
        sentKeys.push(item.key);
        queue.splice(queue.indexOf(item), 1);
        // reexecução do mesmo lote: o mesmo evento nunca é admitido de novo
        if (sentKeys.length % 7 === 0) {
          const dup = await provider.send({ to: "colab@axion.com.br", subject: item.key, text: "t", correlationId: item.key, governance }).catch((e) => e);
          assert(dup instanceof AlertSendBlockedError && dup.reason === "DUPLICATE", `reenvio não barrado: ${dup?.reason ?? "enviou"}`);
          dupBlocked += 1;
        }
      }
      maxBatch = Math.max(maxBatch, used);
    }
    assert(queue.length === 0 && sentKeys.length === 200, `enviados ${sentKeys.length}/200, restaram ${queue.length} (nada pode ser perdido)`);
    assert(new Set(sentKeys).size === 200, "duplicidade entre os enviados");
    assert(dupBlocked >= 20, `poucos reenvios testados: ${dupBlocked}`);
    assert(maxBatch <= batchSize, `lote ${maxBatch} > ${batchSize}`);
    let maxHour = 0;
    let maxDay = 0;
    for (const t of sentAt) {
      maxHour = Math.max(maxHour, sentAt.filter((x) => x > t - h && x <= t).length);
      maxDay = Math.max(maxDay, sentAt.filter((x) => x > t - 24 * h && x <= t).length);
    }
    assert(maxHour <= 10, `máximo em 1 h = ${maxHour}`);
    assert(maxDay <= 30, `máximo em 24 h = ${maxDay}`);
    console.log(`     (massa: pico 1 h = ${maxHour}, pico 24 h = ${maxDay}, maior lote = ${maxBatch}, reenvios barrados = ${dupBlocked})`);
    // críticos saem antes dos comuns: o último crítico sai antes do último comum
    const lastCritical = Math.max(...sentKeys.map((k, i) => (Number(k.split("-")[1]) % 10 === 0 ? i : -1)));
    assert(lastCritical < sentKeys.length - 1, "críticos não tiveram prioridade");
    // outro projeto (não habilitado): bloqueado e nada na fila perdida
    const other = await provider.send({ to: "colab@axion.com.br", subject: "x", text: "t", correlationId: "x", governance: { type: "RISK_IMMEDIATE", projectId: OTHER_PROJECT_ID } }).catch((e) => e);
    assert(other instanceof AlertSendBlockedError && other.reason === "PROJECT_NOT_ENABLED");
  }));

await check("PADRÃO e INVÁLIDO nas variáveis de F0: ausentes => piloto igual ao atual; inválidas => bloqueia e audita sem vazar o valor", async () => {
  const bad = "valor-secreto-xyz";
  for (const vars of [{ ACC_ALERT_MAX_PER_DAY: bad }, { ACC_ALERT_ENABLED_PROJECTS: bad }, { ACC_ALERT_BATCH_SIZE: bad }, { ACC_ALERT_CRITICAL_RESERVE_PER_HOUR: bad }]) {
    await withEnv(vars, async () => {
      setClock(300 * 3600e3);
      const provider = new GovernedEmailProvider({ inner: new FakeEmailProvider(), ledger, now: () => clock });
      const e = await provider.send({ to: "colab@axion.com.br", subject: "x", text: "t", correlationId: "c", governance: { type: "RISK_IMMEDIATE", projectId: PROJECT_ID } }).catch((x) => x);
      assert(e instanceof AlertSendBlockedError && e.reason === "INVALID_CONFIG", `${Object.keys(vars)[0]}: ${e?.reason ?? "enviou"}`);
      assert(!String(e.message).includes(bad), "valor vazou na mensagem de erro");
    });
  }
  const { rows } = await db.query("select detail from public.audit_log_entries where detail like '%INVALID_CONFIG%'");
  assert(rows.length >= 4 && rows.every((r) => !r.detail.includes(bad)), "valor vazou na auditoria");
  await withEnv({}, async () => {
    const guarded = [];
    const provider = new GovernedEmailProvider({ inner: new FakeEmailProvider({ onGuardedInput: (g) => guarded.push(g) }), ledger, now: () => clock });
    const before = await count("true");
    assert((await provider.checkCapacity({ type: "RISK_IMMEDIATE", projectId: PROJECT_ID })).allowed);
    await provider.send({ to: "colab.real@axion.com.br", subject: "x", text: "t", correlationId: "c", governance: { type: "RISK_IMMEDIATE", projectId: PROJECT_ID } });
    assert(guarded.length === 1 && guarded[0].to === CRM, "padrão não preservou o piloto");
    assert((await count("true")) === before, "padrão escreveu no ledger");
  });
});

// ------------------------------------------------------------------ monitoramento (somente leitura)
await check("MONITORAMENTO: G1-G5 executam, são somente leitura e batem com o ledger; G4 (duplicidade) vazio", async () => {
  const sql = readFileSync(path.join(here, "sql", "monitoramento-limite-alertas.sql"), "utf8");
  const parts = sql.split(/^-- @query /m).slice(1);
  assert(parts.length === 6, `esperava 6 consultas, achei ${parts.length}`);
  const before = await count("true");
  setClock(24 * 3600e3 + 1000); // relógio do banco (now()) é o real; as linhas do teste estão até +24 h no futuro: ficam dentro das janelas
  const out = {};
  for (const part of parts) {
    const id = part.split(/\s/)[0];
    const stmt = part.replace(/^[^\n]*\n/, "");
    const code = stmt.replace(/--.*$/gm, "").trim();
    assert(/^select\b/i.test(code) && !/\b(insert|update|delete|drop|alter|truncate|create|grant)\b/i.test(code), `${id} não é somente leitura`);
    out[id] = (await db.query(code)).rows;
  }
  assert((await count("true")) === before, "as consultas alteraram dados");
  assert(out.G1.length > 0 && out.G1.every((r) => r.fonte === "RISCO" && String(r.tipo).startsWith("RISK_")), "G1 sem fonte/tipo");
  const blocked = [...out.G2, ...out.G6].map((r) => r.motivo);
  assert(blocked.includes("KILL_SWITCH") && blocked.includes("HOURLY_LIMIT"), "G2/G6 sem motivos esperados");
  assert(out.G3.length > 0, "G3 (cota devolvida) vazio");
  assert(out.G6.some((r) => r.motivo === "HOURLY_LIMIT" && Number(r.adiados) >= 1), "G6 sem adiamentos por limite");
  assert(out.G4.length === 0, `G4 acusou duplicidade: ${JSON.stringify(out.G4)}`);
  assert(Number(out.G5[0].ultimas_24h) >= 1, "G5 vazio");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
await db.exec("reset role");
process.exit(failed ? 1 : 0);
