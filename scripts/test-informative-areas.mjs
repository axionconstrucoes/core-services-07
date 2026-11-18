// Área INFORMATIVA (ex.: FINANCEIRO da WEG nesta fase): dados continuam registrados/visíveis, mas sem
// alertas, repetições, consolidado, ação SLA, cobrança ou escalonamento, e a Matriz dela fora da prontidão.
// Funções REAIS + ciclo REAL com store em memória e provider simulado. Nenhum banco, rede ou e-mail.
// Uso: node scripts/test-informative-areas.mjs
import net from "node:net";
import { register } from "node:module";

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

const { resolveInformativeAreas } = await import("../apps/web/lib/risk-alerts/informative-areas");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { planRiskAlerts } = await import("../apps/web/lib/risk-alerts/plan-risk-alerts");
const { runRiskAlertCycle } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { createInMemoryRiskAlertStore } = await import("./lib/weg-alert-sim/in-memory-risk-alert-store.mjs");

let passed = 0;
let failed = 0;
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};
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

const WEG = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-00000000f003";
const CRM = "crm@axion.com.br";
const T0 = "2026-11-17T13:00:00.000Z";
const INVITE = "e5555555-0000-4000-8000-000000000015";
const U = { rey: "a1111111-0000-4000-8000-000000000011", jaime: "b2222222-0000-4000-8000-000000000012", carlos: "c3333333-0000-4000-8000-000000000013" };
const EMAIL = { [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br" };
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const resp = (area, overrides) => ({ id: `resp-${area}`, projectId: WEG, area, responsibleDirectUserId: null, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: null, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: T0, ...overrides });
const matrix = () => [resp("PLANEJAMENTO", { responsibleDirectUserId: U.jaime, escalation1UserId: U.carlos }), resp("FINANCEIRO", { responsibleDirectInvitationId: INVITE }), resp("ADMINISTRATIVO", { responsibleDirectInvitationId: INVITE, escalation1UserId: U.carlos })];
const planCase = { sourceType: "SCHEDULE_COMPARISON", sourceId: "ens-high", area: "PLANEJAMENTO", riskLevel: "HIGH", title: "[ENSAIO] Risco alto", summary: "s", impact: "i", recommendation: "r", fingerprint: "fp-1", originPath: "", closed: false, reference: "ENS-1" };
const finCase = (riskLevel = "HIGH") => ({ sourceType: "WEEKLY_REPORT_SHEET", sourceId: "ens-fin", area: "FINANCEIRO", riskLevel, title: "[ENSAIO] Relatório semanal — aba Financeiro", summary: "s", impact: "i", recommendation: null, fingerprint: `fp-fin-${riskLevel}`, originPath: "", closed: false, reference: "W43 · Financeiro" });
const audit = (overrides = {}) => ({ project_id: WEG, occurred_at: "2026-11-18T03:00:00.000Z", actor_type: "USER", actor_user_id: U.rey, action: "RISK_ALERT_AREA_INFORMATIVE_SET", entity_type: "PROJECT_RISK_ALERT_AREA", entity_id: `${WEG}:FINANCEIRO`, detail: JSON.stringify({ area: "FINANCEIRO", reason: "escopo" }), ...overrides });

function makeWorld({ informativeAreas = ["FINANCEIRO"], sourceCases = [planCase, finCase()], riskAlertsEnabled = true } = {}) {
  const recipients = new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
  const world = {
    projectId: WEG,
    projectName: "[ENSAIO] Obra fictícia",
    config: { enabled: true, riskAlertsEnabled, pilotRecipientAllowlistUserIds: [U.rey, U.jaime, U.carlos], senderDomain: "axion.com.br", severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" }, pilotProjectConfirmedAt: T0, pilotDeliveryOverrideEmail: null },
    matrixRules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule),
    areaResponsibles: matrix(),
    informativeAreas,
    settings: null,
    recipients,
    senderMailbox: CRM,
    replyMailbox: CRM,
    sourceCases,
    legacyNoClaim: false,
  };
  const store = createInMemoryRiskAlertStore(world);
  store.setClock(T0);
  const sent = [];
  class Recording extends FakeEmailProvider {
    constructor() {
      super({ onGuardedInput: (g) => sent.push(g) });
    }
  }
  return { store, provider: new Recording(), sent, world };
}
function withPilotEnv(fn) {
  const saved = { ...process.env };
  Object.assign(process.env, { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_SENDER: CRM, GOOGLE_GMAIL_INBOUND_MAILBOX: CRM, AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM });
  delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
  return fn().finally(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}
const expert = { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) };

await check("1. Configuração explícita: SET humano vale; UNSET posterior desfaz; SYSTEM, outro projeto e detalhe divergente são ignorados", () => {
  assert(resolveInformativeAreas(WEG, [audit()]).has("FINANCEIRO"));
  assert(resolveInformativeAreas(WEG, [audit(), audit({ action: "RISK_ALERT_AREA_INFORMATIVE_UNSET", occurred_at: "2026-11-19T00:00:00.000Z" })]).size === 0);
  assert(resolveInformativeAreas(WEG, [audit({ actor_type: "SYSTEM", actor_user_id: null })]).size === 0, "SYSTEM");
  assert(resolveInformativeAreas(WEG, [audit({ project_id: OTHER, entity_id: `${OTHER}:FINANCEIRO` })]).size === 0, "outro projeto");
  assert(resolveInformativeAreas(WEG, [audit({ detail: JSON.stringify({ area: "ADMINISTRATIVO" }) })]).size === 0, "detalhe divergente");
});

await check("2. Planejador: caso FINANCEIRO informativo é registrado, mas sem e-mail, ação SLA, consolidado, escalonamento ou auditoria de revisão", () => {
  const policyFor = (area, riskLevel) => resolveMatrixPolicy({ rules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule), responsibles: matrix(), settings: null, area, riskLevel });
  const base = { now: T0, projectId: WEG, projectName: "P", featureEnabled: true, providerConfigured: true, dryRun: false, config: makeWorld().world.config, timeZone: "America/Sao_Paulo", existingCases: [], linkedActions: new Map(), policyFor, recipients: makeWorld().world.recipients, existingIdempotencyKeys: new Set(), previousDigestSentAt: null, informativeAreas: new Set(["FINANCEIRO"]) };
  for (const level of ["HIGH", "CRITICAL", "MEDIUM", "LOW", "REVIEW_REQUIRED"]) {
    const p = planRiskAlerts({ ...base, now: "2026-11-18T10:30:00.000Z", cases: [finCase(level)] });
    assert(p.caseUpserts.length === 1 && p.caseUpserts[0].policy === null, `${level}: caso registrado`);
    assert(p.outbox.length === 0 && p.slaActionCreates.length === 0 && p.escalations.length === 0, `${level}: sem automação`);
    assert(!p.audit.some((a) => a.action === "RISK_ALERT_CONFIGURATION_REVIEW_REQUIRED"), `${level}: sem revisão de Matriz`);
  }
  // Caso existente com ação SLA vencida (cenário hipotético): sem escalonamento nem cobrança.
  const existing = { id: "c-fin", sourceType: "WEEKLY_REPORT_SHEET", sourceId: "ens-fin", area: "FINANCEIRO", riskLevel: "HIGH", previousRiskLevel: null, fingerprint: "fp-fin-HIGH", status: "OPEN", slaActionId: "a-fin", lastDigestWindow: null, firstSeenAt: T0, lastChangedAt: T0, closedAt: null, title: "t", summary: "s", impact: "", recommendation: null, originPath: "", reference: "" };
  const linked = { id: "a-fin", status: "PENDING", currentEscalationLevel: "RESPONSAVEL", assumeDueAt: "2026-11-01T00:00:00.000Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, contractualDeadline: null, responsibleUserId: U.rey };
  const late = planRiskAlerts({ ...base, cases: [finCase("HIGH")], existingCases: [existing], linkedActions: new Map([["a-fin", linked]]) });
  assert(late.escalations.length === 0 && late.outbox.length === 0, "ação vencida da área informativa não escala nem cobra");
  // Sem a configuração, o mesmo caso volta ao comportamento normal (validação da Matriz preservada).
  const normal = planRiskAlerts({ ...base, informativeAreas: undefined, cases: [finCase("HIGH")] });
  assert(normal.audit.some((a) => a.action === "RISK_ALERT_CONFIGURATION_REVIEW_REQUIRED"), "sem configuração: Matriz incompleta continua exigindo revisão");
});

await check("3. Ciclo REAL: FINANCEIRO informativo não bloqueia a prontidão; Planejamento segue enviando; nada do FINANCEIRO sai", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: false, projectId: WEG, expert });
    const p = r.projects[0];
    assert(p.readinessBlockers.length === 0, `sem bloqueio: ${p.readinessBlockers.join(",")}`);
    assert(JSON.stringify(p.informativeAreas) === JSON.stringify(["FINANCEIRO"]));
    const fin = [...w.store.state.cases.values()].find((c) => c.area === "FINANCEIRO");
    assert(fin && fin.status === "OPEN", "caso FINANCEIRO registrado e visível");
    assert(!w.store.state.outbox.some((o) => o.caseId === fin.id), "nenhuma linha de outbox do FINANCEIRO");
    assert(![...w.store.state.actions.values()].some((a) => a.area === "FINANCEIRO"), "nenhuma ação SLA do FINANCEIRO");
    assert(w.sent.length >= 1, "Planejamento enviado");
  }));

await check("4. Ciclo REAL sem a configuração: a Matriz incompleta do FINANCEIRO continua bloqueando (validação global preservada)", () =>
  withPilotEnv(async () => {
    const w = makeWorld({ informativeAreas: [] });
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: false, projectId: WEG, expert });
    assert(r.projects[0].readinessBlockers.includes("CONFIGURATION_REVIEW_REQUIRED"));
    assert(w.sent.length === 0, "bloqueado => nada enviado");
  }));

await check("5. Outra área com Matriz incompleta (ADMINISTRATIVO, não informativa) continua bloqueando", () =>
  withPilotEnv(async () => {
    const adm = { ...planCase, sourceId: "ens-adm", area: "ADMINISTRATIVO", fingerprint: "fp-adm" };
    const w = makeWorld({ sourceCases: [planCase, finCase(), adm] });
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: false, projectId: WEG, expert });
    assert(r.projects[0].readinessBlockers.includes("CONFIGURATION_REVIEW_REQUIRED"));
    assert(w.sent.length === 0);
  }));

await check("6. Linha PENDING de outra origem para caso FINANCEIRO informativo é SKIPPED (INFORMATIVE_AREA), sem envio", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: false, projectId: WEG, expert });
    const fin = [...w.store.state.cases.values()].find((c) => c.area === "FINANCEIRO");
    const sentBefore = w.sent.length;
    w.store.state.outbox.push({ id: "manual-fin", caseId: fin.id, slaActionId: null, riskLevel: "HIGH", notificationType: "FORWARD", escalationLevel: null, recipientUserId: U.carlos, scheduledFor: T0, status: "PENDING", suppressionReason: null, digestWindow: null, idempotencyKey: "manual-fin", matrixRuleSnapshot: {}, payloadSummary: { title: "t" }, origin: "WEB_ACTION", attemptCount: 0, deliveredTo: null, sentAt: null, provider: null, lastError: null });
    await runRiskAlertCycle({ now: new Date("2026-11-17T13:05:00.000Z"), store: w.store, provider: w.provider, dryRun: false, projectId: WEG, expert });
    const row = w.store.state.outbox.find((o) => o.id === "manual-fin");
    assert(row.status === "SKIPPED" && /INFORMATIVE_AREA/.test(row.lastError ?? row.skipReason ?? JSON.stringify(row)), JSON.stringify(row));
    assert(w.sent.length === sentBefore, "nada enviado");
  }));

await check("7. Dry-run da WEG com FINANCEIRO informativo: sem bloqueio, nenhum item do FINANCEIRO, nada gravado nem enviado", () =>
  withPilotEnv(async () => {
    const w = makeWorld({ riskAlertsEnabled: false });
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: true, projectId: WEG });
    const p = r.projects[0];
    assert(p.readinessBlockers.length === 0 && p.dryRunAssumedEnabled === true, JSON.stringify(p.readinessBlockers));
    assert(p.dryRunPreview.every((x) => !String(x.idempotencyKey).includes("ens-fin")), "nenhum item do FINANCEIRO");
    assert(w.sent.length === 0 && w.store.state.outbox.length === 0 && w.store.state.cases.size === 0);
  }));

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
