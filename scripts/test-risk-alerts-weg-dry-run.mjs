// Dry-run do ciclo recorrente da WEG ANTES de ligar risk_alerts_enabled (somente o projeto piloto, somente leitura).
// Store em memória + provider simulado; nenhuma rede, nenhum banco, nenhum e-mail.
// Uso: node scripts/test-risk-alerts-weg-dry-run.mjs
import net from "node:net";
import fs from "node:fs";
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

const { runRiskAlertCycle } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { shouldAssumeRiskAlertsEnabledForDryRun, dryRunEffectiveConfig, buildCycleDryRunPreviewItem } = await import("../apps/web/lib/risk-alerts/cycle-dry-run");
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
const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");

const WEG = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-00000000f003";
const CRM = "crm@axion.com.br";
const T0 = "2026-11-17T13:00:00.000Z";
const U = { rey: "a1111111-0000-4000-8000-000000000011", jaime: "b2222222-0000-4000-8000-000000000012", carlos: "c3333333-0000-4000-8000-000000000013", fora: "d4444444-0000-4000-8000-000000000014" };
const EMAIL = { [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br", [U.fora]: "fora.do.piloto@axion.com.br" };
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });

function makeWorld({ projectId = WEG, riskAlertsEnabled = false, direct = U.jaime } = {}) {
  const recipients = new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
  const world = {
    projectId,
    projectName: "[ENSAIO] Obra fictícia",
    config: { enabled: true, riskAlertsEnabled, pilotRecipientAllowlistUserIds: [U.rey, U.jaime, U.carlos], senderDomain: "axion.com.br", severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" }, pilotProjectConfirmedAt: T0, pilotDeliveryOverrideEmail: null },
    matrixRules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule),
    areaResponsibles: [{ id: "resp", projectId, area: "PLANEJAMENTO", responsibleDirectUserId: direct, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U.carlos, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: T0 }],
    settings: null,
    recipients,
    senderMailbox: CRM,
    replyMailbox: CRM,
    sourceCases: [{ sourceType: "SCHEDULE_COMPARISON", sourceId: "ens-high", area: "PLANEJAMENTO", riskLevel: "HIGH", title: "[ENSAIO] Risco alto fictício", summary: "s", impact: "i", recommendation: "r", fingerprint: "fp-1", originPath: "", closed: false, reference: "ENS-1" }],
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
  return { store, provider: new Recording(), sent };
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

const snapshotState = (store) => JSON.stringify({ outbox: store.state.outbox.length, cases: store.state.cases.size, audit: (store.state.audit ?? []).length });

await check("regra: só assume a flag em dryRun com projectId explícito = projeto piloto", () => {
  assert(shouldAssumeRiskAlertsEnabledForDryRun({ dryRun: true, requestedProjectId: WEG, projectId: WEG, pilotProjectId: WEG }));
  assert(!shouldAssumeRiskAlertsEnabledForDryRun({ dryRun: false, requestedProjectId: WEG, projectId: WEG, pilotProjectId: WEG }), "envio real nunca");
  assert(!shouldAssumeRiskAlertsEnabledForDryRun({ dryRun: true, requestedProjectId: null, projectId: WEG, pilotProjectId: WEG }), "sem projectId explícito");
  assert(!shouldAssumeRiskAlertsEnabledForDryRun({ dryRun: true, requestedProjectId: OTHER, projectId: OTHER, pilotProjectId: WEG }), "outro projeto");
  assert(!shouldAssumeRiskAlertsEnabledForDryRun({ dryRun: true, requestedProjectId: WEG, projectId: WEG, pilotProjectId: null }), "perfil inválido");
  const cfg = { enabled: true, riskAlertsEnabled: false };
  const eff = dryRunEffectiveConfig(cfg, true);
  assert(eff.riskAlertsEnabled === true && cfg.riskAlertsEnabled === false, "não muta a config original");
  assert(dryRunEffectiveConfig(cfg, false) === cfg);
});

await check("dry-run WEG com flag DESLIGADA planeja (Jaime no Planejamento), sem escrita e sem envio", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    const before = snapshotState(w.store);
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: true, projectId: WEG });
    const p = r.projects[0];
    assert(p.blockedReason === null, `não deveria bloquear: ${p.blockedReason}`);
    assert(p.dryRunAssumedEnabled === true, "dryRunAssumedEnabled");
    assert(p.planned >= 1 && Array.isArray(p.dryRunPreview) && p.dryRunPreview.length === p.planned, "preview");
    const item = p.dryRunPreview.find((x) => x.type === "IMMEDIATE");
    assert(item && item.recipientLabel === "P2", `Jaime = P2 (ordem Reynaldo, Jaime, Carlos); veio ${item?.recipientLabel}`);
    assert(item.delivery.ok === true && item.delivery.toIsOwnParticipant === true && item.delivery.cc === CRM && item.delivery.forbiddenAddress === false, "política de entrega");
    assert(snapshotState(w.store) === before, "nenhuma escrita no store");
    assert(w.sent.length === 0, "nenhum envio");
  }));

await check("dry-run sem projectId explícito continua bloqueado (PROJECT_DISABLED)", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: true, projectId: null });
    assert(r.projects.every((p) => p.blockedReason === "PROJECT_DISABLED" || p.planned === 0), "sem projeto explícito não assume a flag");
    assert(w.sent.length === 0);
  }));

await check("execução REAL com flag desligada continua bloqueada (nada enviado, nada gravado)", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    const before = snapshotState(w.store);
    const r = await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, dryRun: false, projectId: WEG, expert: { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) } });
    assert(r.projects[0].blockedReason === "PROJECT_DISABLED", `real: ${r.projects[0].blockedReason}`);
    assert(w.sent.length === 0 && snapshotState(w.store) === before);
  }));

await check("rótulo FORA_DO_PILOTO e política de entrega falsa para destinatário fora dos participantes", () => {
  const entry = { idempotencyKey: "k", notificationType: "IMMEDIATE", escalationLevel: "RESPONSAVEL", riskLevel: "HIGH", caseKey: "c1", slaActionId: null, recipient: { userId: U.fora, email: EMAIL[U.fora], name: null, status: "SUPPRESSED", suppressionReason: "NOT_ALLOWLISTED" }, scheduledFor: T0, digestWindow: null, matrixRuleSnapshot: {}, payloadSummary: {}, content: {} };
  const item = buildCycleDryRunPreviewItem(entry, { visibleCodeByCaseId: new Map([["c1", "ABCD1234"]]), pilotParticipants: ["reynaldo@axion.com.br", "jaime.ramos@axion.com.br", "carlos.evandro@axion.com.br"] });
  assert(item.recipientLabel === "FORA_DO_PILOTO" && item.delivery.ok === false && item.visibleCode === "ABCD1234");
  const forb = buildCycleDryRunPreviewItem({ ...entry, recipient: { ...entry.recipient, email: "axion@axion.com.br" } }, { visibleCodeByCaseId: new Map(), pilotParticipants: ["reynaldo@axion.com.br"] });
  assert(forb.delivery.forbiddenAddress === true && forb.delivery.ok === false && forb.visibleCode === null);
});

await check("workflow de dry-run: manual, só main, sem schedule, só WEG, dryRun=1, log mascarado", () => {
  const wf = read(".github/workflows/risk-alerts-weg-dry-run.yml");
  assert(/workflow_dispatch/.test(wf) && !/schedule:/.test(wf), "manual, sem schedule");
  assert(/github\.ref == 'refs\/heads\/main'/.test(wf), "só main");
  assert(/dryRun=1/.test(wf) && /projectId=00000000-0000-4000-8000-000000000001/.test(wf), "dryRun + WEG fixo");
  assert(!/cat response\.json/.test(wf) && !/upload-artifact/.test(wf), "sem resposta bruta nem artefato");
  assert(!/recipientUserId|recipientEmail|\.email\b/.test(wf.split("node -e")[1] ?? ""), "log não imprime ids/e-mails");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
