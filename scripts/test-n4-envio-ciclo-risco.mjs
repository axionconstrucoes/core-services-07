// Frente N4 — ciclo REAL de alertas de risco (runRiskAlertCycle) sobre o store em memória e o FakeEmailProvider:
// classificação de falhas do provedor (permanente / incerta / transitória), retentativa limitada, e falha ao gravar DEPOIS
// do aceite do provedor (a linha nunca volta à fila). SENT = aceito pelo provedor (delivery_state ACCEPTED_BY_PROVIDER).
// Nenhuma rede, nenhum banco, nenhum e-mail. Montagem do mundo copiada de scripts/test-pilot-cycle-integration.mjs.
//
// Uso: node scripts/test-n4-envio-ciclo-risco.mjs
import net from "node:net";
import { register } from "node:module";

// Segurança: sem rede nem credenciais reais.
const leaked = Object.keys(process.env).filter((k) => /^(SUPABASE_|NEXT_PUBLIC_SUPABASE|GOOGLE_(?!GMAIL_INBOUND_MAILBOX$)|ANTHROPIC_API_KEY|ELEVENLABS_|CRON_SECRET|ACC_RISK_ALERTS_)/.test(k));
if (leaked.length > 0) {
  console.error(`ABORTADO: credenciais no ambiente (${leaked.join(", ")}). Rode com ambiente limpo.`);
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
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { isProjectPilotActive } = await import("../apps/web/lib/email/project-pilot-profile");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { createInMemoryRiskAlertStore } = await import("./lib/weg-alert-sim/in-memory-risk-alert-store.mjs");

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

const PROJECT_ID = "00000000-0000-4000-8000-000000000001"; // WEG (o piloto é exclusivo dela)
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-00000000f003";
const CRM = "crm@axion.com.br";
const BOX = "axion@axion.com.br"; // PROIBIDO no novo modelo: nada pode ser roteado para ele
const ACC = "crm@axion.com.br";
const AREA = "PLANEJAMENTO";
const U = { RESP: "a1111111-0000-4000-8000-000000000011", GESTOR: "b2222222-0000-4000-8000-000000000012", DIR: "c3333333-0000-4000-8000-000000000013" };
const EMAIL = { [U.RESP]: "reynaldo@axion.com.br", [U.GESTOR]: "jaime.ramos@axion.com.br", [U.DIR]: "carlos.evandro@axion.com.br" };
const T0 = "2026-11-04T13:00:00.000Z";
const plusMin = (iso, m) => new Date(new Date(iso).getTime() + m * 60_000).toISOString();

const rule = (projectId, riskLevel, timeUnit, assume, esc2, board, ack) => ({
  id: `rule-${projectId}-${riskLevel}`, projectId, riskLevel, area: null, timeUnit, assumeDeadlineValue: assume, respondDeadlineValue: null,
  completeDeadlineValue: null, escalation2AfterValue: esc2, boardAfterValue: board, notifyByEmail: true, requiresAcknowledgmentConfirmation: ack,
  requiresDelayJustification: true, isDefault: false, active: true,
});
const rulesFor = (projectId) => [
  rule(projectId, "LOW", "BUSINESS_DAYS", 3, 3, 2, false),
  rule(projectId, "MEDIUM", "BUSINESS_DAYS", 1, 1, 1, false),
  rule(projectId, "HIGH", "CLOCK_HOURS", 1, 1, 1, true),
  rule(projectId, "CRITICAL", "CLOCK_HOURS", 1, 1, 1, true),
];

function makeWorld(projectId = PROJECT_ID) {
  const recipients = new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
  const world = {
    projectId,
    projectName: "[ENSAIO] Obra fictícia",
    config: {
      enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: Object.values(U), senderDomain: "axion.com.br",
      severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" },
      pilotProjectConfirmedAt: T0,
      pilotDeliveryOverrideEmail: projectId === PROJECT_ID ? CRM : null, // override legado da WEG: deve ser IGNORADO enquanto o perfil do piloto estiver ativo
    },
    matrixRules: rulesFor(projectId),
    areaResponsibles: [{
      id: "resp-ens", projectId, area: AREA, responsibleDirectUserId: U.RESP, responsibleDirectInvitationId: null, responsibleDirectName: null,
      secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U.GESTOR,
      escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.DIR, boardInvitationId: null,
      boardName: null, updatedAt: T0,
    }],
    settings: null,
    recipients,
    senderMailbox: ACC,
    replyMailbox: ACC, // o Reply-To aponta para a caixa institucional acc@
    sourceCases: [{
      sourceType: "SCHEDULE_COMPARISON", sourceId: "ens-critical", area: AREA, riskLevel: "CRITICAL", title: "[ENSAIO] Risco crítico fictício",
      summary: "Desvio fictício.", impact: "Impacto fictício.", recommendation: "Ação fictícia.", fingerprint: "fp-critical-v1",
      originPath: "documentos?tab=registro-email", closed: false, reference: "ENS-CRITICAL",
    }],
    legacyNoClaim: false,
  };
  const store = createInMemoryRiskAlertStore(world);
  const rec = { guarded: [], gate: null };
  class Recording extends FakeEmailProvider {
    constructor() {
      super({ onGuardedInput: (g) => rec.guarded.push(g) });
    }
    async send(input) {
      await new Promise((r) => setImmediate(r));
      if (rec.gate) await rec.gate;
      const failure = rec.failure ? rec.failure(input) : null;
      if (failure) throw failure;
      return super.send(input);
    }
  }
  const provider = new Recording();
  const expert = { answer: async () => ({ answerText: "Resposta simulada.", confidence: 0.5, requiresHumanReview: true }) };
  const run = async (nowIso) => {
    store.setClock(nowIso);
    return runRiskAlertCycle({ now: new Date(nowIso), store, provider, expert });
  };
  return { world, store, rec, run };
}

function withPilotEnv(fn, extra = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, {
    ACC_PROJECT_PILOT_PROJECT_ID: PROJECT_ID, ACC_PROJECT_PILOT_SENDER: ACC, GOOGLE_GMAIL_INBOUND_MAILBOX: ACC,
    AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM, ...extra,
  });
  delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
  return fn().finally(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const gmailError = (classification) => new EmailSendError(`GmailEmailProvider: falha ao enviar via Gmail API. [etapa=SEND http=503 api=n/a motivo=SERVER_ERROR classe=${classification}]`, { classification, stage: "SEND", httpStatus: 503, apiCode: null, reason: "SERVER_ERROR", correlationId: null });
const rows = (w) => w.store.state.outbox.filter((o) => o.notificationType === "IMMEDIATE");

await check("N4-1. falha PERMANENTE do provedor: linha FAILED já na 1ª tentativa (sem retentativa), auditoria com a classe", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    w.rec.failure = () => gmailError("DEFINITIVE");
    await w.run(T0);
    const r = rows(w)[0];
    assert(r && r.status === "FAILED" && r.attemptCount === 1 && r.failureClass === "PERMANENT", JSON.stringify(r && { s: r.status, a: r.attemptCount, f: r.failureClass }));
    w.rec.failure = null;
    await w.run(plusMin(T0, 1));
    assert(rows(w)[0].status === "FAILED" && w.rec.guarded.length === 0, "falha permanente foi retentada");
    assert(w.store.state.audit.some((a) => a.action === "RISK_ALERT_EMAIL_FAILED" && /PERMANENT/.test(a.detail)), "auditoria sem classe");
  }));

await check("N4-2. resultado INCERTO (5xx/timeout): sem retentativa automática (evita e-mail duplicado)", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    w.rec.failure = () => gmailError("UNCERTAIN");
    await w.run(T0);
    w.rec.failure = null;
    await w.run(plusMin(T0, 1));
    await w.run(plusMin(T0, 2));
    const r = rows(w)[0];
    assert(r.status === "FAILED" && r.failureClass === "UNCERTAIN" && r.attemptCount === 1, JSON.stringify({ s: r.status, f: r.failureClass, a: r.attemptCount }));
    assert(w.rec.guarded.length === 0, "incerta foi reenviada");
  }));

await check("N4-3. falha TRANSITÓRIA: retentada no ciclo seguinte e gravada como ACEITA PELO PROVEDOR (não 'entregue')", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    w.rec.failure = () => gmailError("TEMPORARY");
    await w.run(T0);
    assert(rows(w)[0].status === "PENDING" && rows(w)[0].failureClass === "RETRYABLE", "transitória deveria voltar à fila");
    w.rec.failure = null;
    await w.run(plusMin(T0, 1));
    const r = rows(w)[0];
    assert(r.status === "SENT" && r.deliveryState === "ACCEPTED_BY_PROVIDER" && r.attemptCount === 2, JSON.stringify({ s: r.status, d: r.deliveryState, a: r.attemptCount }));
  }));

await check("N4-4. retentativa LIMITADA: transitória para em MAX_SEND_ATTEMPTS (3) e não insiste mais", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    let calls = 0;
    w.rec.failure = () => { calls += 1; return gmailError("TEMPORARY"); };
    for (let i = 0; i < 6; i += 1) await w.run(plusMin(T0, i));
    const r = rows(w).find((o) => o.escalationLevel === "RESPONSAVEL");
    assert(r.status === "FAILED" && r.attemptCount === 3 && r.failureClass === "EXHAUSTED", JSON.stringify({ s: r.status, a: r.attemptCount, f: r.failureClass }));
  }));

await check("N4-5. falha ao gravar DEPOIS do aceite (markSent falha sempre): linha incerta, nunca reenviada", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    const original = w.store.markSent;
    w.store.markSent = async () => { throw new Error("banco indisponível"); };
    await w.run(T0);
    const sentOnce = w.rec.guarded.length;
    assert(sentOnce >= 1, "deveria ter enviado");
    const r = rows(w)[0];
    assert(r.status === "FAILED" && r.failureClass === "UNCERTAIN", JSON.stringify({ s: r.status, f: r.failureClass }));
    assert(w.store.state.audit.some((a) => a.action === "RISK_ALERT_EMAIL_ACCEPTED_UNRECORDED"), "auditoria do aceite não gravado");
    w.store.markSent = original;
    await w.run(plusMin(T0, 15));
    assert(w.rec.guarded.length === sentOnce, "mensagem já aceita foi reenviada");
  }));

await check("N4-6. falha em passo posterior (conversa/auditoria) depois de gravado o aceite: SENT preservado, sem reenvio", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    const original = w.store.recordOutboundMessage;
    w.store.recordOutboundMessage = async () => { throw new Error("falha ao registrar mensagem"); };
    await w.run(T0);
    const r = rows(w)[0];
    assert(r.status === "SENT", `status ${r.status}`);
    w.store.recordOutboundMessage = original;
    const n = w.rec.guarded.length;
    await w.run(plusMin(T0, 15));
    assert(w.rec.guarded.length === n, "reenviado");
  }));

console.log("");
console.log(`Resultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
