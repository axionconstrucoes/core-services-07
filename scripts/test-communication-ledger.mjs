// Supressão NÃO é entrega: livro-razão de comunicação (etapa alcançada x tentativa x supressão x
// aceite pelo Gmail) e trava de reemissão (nenhum e-mail sem decisão humana auditada).
// Funções REAIS + ciclo REAL com store em memória e provider simulado. Nenhum banco, rede ou e-mail.
// Uso: node scripts/test-communication-ledger.mjs
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

const ledgerMod = await import("../apps/web/lib/risk-alerts/communication-ledger");
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
const CRM = "crm@axion.com.br";
const T0 = "2026-11-17T13:00:00.000Z";
const U = { rey: "a1111111-0000-4000-8000-000000000011", jaime: "b2222222-0000-4000-8000-000000000012", carlos: "c3333333-0000-4000-8000-000000000013", outsider: "d4444444-0000-4000-8000-000000000014" };
const EMAIL = { [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br", [U.outsider]: "fora@axion.com.br" };
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const resp = (overrides = {}) => ({ id: "resp-PLAN", projectId: WEG, area: "PLANEJAMENTO", responsibleDirectUserId: U.jaime, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U.carlos, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: T0, ...overrides });
const recipients = () => new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
const config = (allow = [U.rey, U.jaime, U.carlos]) => ({ enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: allow, senderDomain: "axion.com.br", severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" }, pilotProjectConfirmedAt: T0, pilotDeliveryOverrideEmail: null });
const policyFor = (responsibles = [resp()]) => (area, riskLevel) => resolveMatrixPolicy({ rules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule), responsibles, settings: null, area, riskLevel });

const caseInput = { sourceType: "SCHEDULE_COMPARISON", sourceId: "src-w43", area: "PLANEJAMENTO", riskLevel: "CRITICAL", title: "[ENSAIO] W43 vs baseline", summary: "s", impact: "i", recommendation: "r", fingerprint: "fp-w43", originPath: "", closed: false, reference: "W43" };
const CASE_KEY = "SCHEDULE_COMPARISON:src-w43";
const existing = { id: "case-1", sourceType: "SCHEDULE_COMPARISON", sourceId: "src-w43", area: "PLANEJAMENTO", riskLevel: "CRITICAL", previousRiskLevel: null, fingerprint: "fp-w43", status: "OPEN", slaActionId: "act-1", lastDigestWindow: null, firstSeenAt: "2026-10-22T12:00:00.000Z", lastChangedAt: "2026-10-22T12:00:00.000Z", closedAt: null, title: "t", summary: "s", impact: "", recommendation: null, originPath: "", reference: "W43", state: "OPEN", currentLevel: "RESPONSAVEL", currentResponsibleUserId: U.jaime, previousResponsibleUserId: null, topLevelReachedAt: "2026-10-23T12:00:00.000Z" };
const linked = { id: "act-1", status: "ESCALATED", currentEscalationLevel: "DIRETORIA", assumeDueAt: "2026-10-23T12:00:00.000Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, contractualDeadline: null, responsibleUserId: U.jaime };
const row = (o) => ({ caseId: "case-1", notificationType: "IMMEDIATE", escalationLevel: "RESPONSAVEL", recipientUserId: U.jaime, recipientEmail: null, status: "SUPPRESSED", suppressionReason: "CONFIGURATION_REVIEW_REQUIRED", attemptCount: 0, providerMessageId: null, createdAt: "2026-10-22T12:00:00.000Z", sentAt: null, ...o });
// Histórico real da WEG: imediato suprimido ao responsável + escalonamento DIRETORIA suprimido.
const suppressedHistory = [row({}), row({ notificationType: "ESCALATION", escalationLevel: "DIRETORIA", recipientUserId: U.rey, createdAt: "2026-10-23T13:00:00.000Z" })];
const consumedKeys = new Set([`${CASE_KEY}:IMMEDIATE:fp-w43:${U.jaime}`, `${CASE_KEY}:ESCALATION:DIRETORIA:${U.rey}`]);
const approval = (o = {}) => ({ id: "aud-approve-1", occurred_at: "2026-11-18T12:00:00.000Z", actor_type: "USER", actor_user_id: U.rey, action: ledgerMod.REISSUE_APPROVED_ACTION, entity_type: "RISK_ALERT_CASE", entity_id: "case-1", ...o });

const basePlan = (o = {}) => ({
  now: "2026-11-18T13:00:00.000Z",
  projectId: WEG,
  projectName: "P",
  featureEnabled: true,
  providerConfigured: true,
  dryRun: false,
  config: config(),
  timeZone: "America/Sao_Paulo",
  cases: [caseInput],
  existingCases: [existing],
  linkedActions: new Map([["act-1", linked]]),
  policyFor: policyFor(),
  recipients: recipients(),
  existingIdempotencyKeys: consumedKeys,
  previousDigestSentAt: null,
  outboxHistory: suppressedHistory,
  ...o,
});

await check("1. Classificação: SUPPRESSED nunca é entrega; SENT em outra caixa = aceito pelo Gmail, mas não entregue; SENT ao próprio e-mail = entregue", () => {
  const profile = { userId: U.jaime, email: EMAIL[U.jaime], name: "J", membershipStatus: "ACTIVE" };
  assert(ledgerMod.classifyRecipientHistory([row({})], U.jaime, profile).status === "SUPPRESSED_ONLY");
  const elsewhere = ledgerMod.classifyRecipientHistory([row({ status: "SENT", recipientEmail: CRM, sentAt: T0, providerMessageId: "g1", attemptCount: 1 })], U.jaime, profile);
  assert(elsewhere.status === "ACCEPTED_ELSEWHERE" && elsewhere.acceptedByGmail.length === 1 && !elsewhere.acceptedByGmail[0].deliveredToRecipient, JSON.stringify(elsewhere));
  assert(ledgerMod.classifyRecipientHistory([row({ status: "SENT", recipientEmail: "JAIME.RAMOS@axion.com.br", sentAt: T0, providerMessageId: "g2", attemptCount: 1 })], U.jaime, profile).status === "DELIVERED");
  assert(ledgerMod.classifyRecipientHistory([row({ status: "FAILED", attemptCount: 3, suppressionReason: null })], U.jaime, profile).status === "ATTEMPTED_FAILED");
  assert(ledgerMod.classifyRecipientHistory([], U.jaime, profile).status === "NEVER_PLANNED");
});

await check("2. Etapa DIRETORIA alcançada com tudo suprimido: lacuna para Responsável, Gestor e Diretoria; NENHUM e-mail sem decisão; auditoria de decisão pendente uma vez", () => {
  const p = planRiskAlerts(basePlan());
  assert(p.outbox.length === 0, `nada planejado: ${p.outbox.map((e) => e.idempotencyKey).join(",")}`);
  assert(p.escalations.length === 0 && p.slaActionCreates.length === 0, "SLA/cadeia intocados");
  const l = p.communicationLedgers?.[0];
  assert(l && l.stageReached === "DIRETORIA" && l.decision === "REISSUE_DECISION_REQUIRED", JSON.stringify(l));
  assert(JSON.stringify(l.gaps.map((g) => [g.role, g.status])) === JSON.stringify([["RESPONSAVEL", "SUPPRESSED_ONLY"], ["ESCALAO_1", "NEVER_PLANNED"], ["DIRETORIA", "SUPPRESSED_ONLY"]]), JSON.stringify(l.gaps.map((g) => [g.role, g.status])));
  assert(p.audit.filter((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION).length === 1);
  const again = planRiskAlerts(basePlan({ reissueDecisionRecordedCaseIds: new Set(["case-1"]) }));
  assert(!again.audit.some((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION), "auditoria não se repete");
});

await check("3. Decisão de SYSTEM/sem usuário é ignorada; decisão de outro caso não vale", () => {
  const approvals = ledgerMod.resolveReissueApprovals([approval({ actor_type: "SYSTEM", actor_user_id: null }), approval({ id: "x", entity_id: "case-2" })]);
  const p = planRiskAlerts(basePlan({ reissueApprovals: approvals }));
  assert(p.outbox.length === 0 && p.communicationLedgers[0].decision === "REISSUE_DECISION_REQUIRED");
});

await check("4. Decisão humana auditada: uma reemissão por lacuna elegível, chave REISSUE:<decisão>, prazo ORIGINAL, sem reiniciar SLA nem cadeia", () => {
  const approvals = ledgerMod.resolveReissueApprovals([approval()]);
  const p = planRiskAlerts(basePlan({ reissueApprovals: approvals }));
  assert(p.outbox.length === 3, `3 entradas: ${p.outbox.length}`);
  for (const e of p.outbox) {
    assert(e.idempotencyKey.startsWith(`${CASE_KEY}:REISSUE:aud-approve-1:`), e.idempotencyKey);
    assert(e.recipient.status === "PENDING", `${e.recipient.userId} ${e.recipient.suppressionReason}`);
    assert(e.content.deadlineAt === linked.assumeDueAt, "prazo original preservado");
    assert(e.content.escalationReason === null && /SLA não reiniciado/.test(e.content.reissue?.note ?? ""), "texto da reemissão");
    assert(e.content.reissue.stageReachedLabel.includes("Diretoria"), "etapa real exibida");
    assert(e.content.reissue.priorCommunications.length === 2 && e.content.reissue.priorCommunications.every((p) => p.outcome === "SUPPRESSED"), "histórico do caso com datas");
  }
  assert(JSON.stringify(p.outbox.map((e) => [e.notificationType, e.escalationLevel, e.recipient.userId])) === JSON.stringify([["IMMEDIATE", "RESPONSAVEL", U.jaime], ["ESCALATION", "ESCALAO_1", U.carlos], ["ESCALATION", "DIRETORIA", U.rey]]));
  assert(p.escalations.length === 0 && p.slaActionCreates.length === 0, "SLA/cadeia intocados");
  // Mesma decisão já usada: as chaves existem => não repete.
  const keys = new Set([...consumedKeys, ...p.outbox.map((e) => e.idempotencyKey)]);
  assert(planRiskAlerts(basePlan({ reissueApprovals: approvals, existingIdempotencyKeys: keys })).outbox.length === 0, "uma reemissão por decisão");
});

await check("5. Após entrega efetiva (SENT ao próprio e-mail) o caso fica INFORMADO: nenhuma nova reemissão nem pendência", () => {
  const delivered = [U.jaime, U.carlos, U.rey].map((id) => row({ recipientUserId: id, status: "SENT", recipientEmail: EMAIL[id], sentAt: T0, providerMessageId: `g-${id}`, attemptCount: 1 }));
  const p = planRiskAlerts(basePlan({ outboxHistory: [...suppressedHistory, ...delivered], reissueApprovals: ledgerMod.resolveReissueApprovals([approval({ id: "aud-2" })]) }));
  assert(p.outbox.length === 0 && p.communicationLedgers[0].decision === "INFORMED");
  assert(!p.audit.some((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION));
});

await check("6. Destinatário inelegível hoje (fora da allowlist) não recebe reemissão mesmo com decisão; motivo exposto no livro-razão", () => {
  const p = planRiskAlerts(basePlan({ config: config([U.jaime, U.rey]), reissueApprovals: ledgerMod.resolveReissueApprovals([approval()]) }));
  assert(!p.outbox.some((e) => e.recipient.userId === U.carlos), "Carlos fora");
  const carlos = p.communicationLedgers[0].recipients.find((r) => r.userId === U.carlos);
  assert(carlos && !carlos.eligibleNow && carlos.ineligibleReason === "PILOT_RECIPIENT_SUPPRESSED");
});

await check("7. Caso superado (fechando neste ciclo), área informativa ou sem histórico carregado: sem livro-razão e sem e-mail", () => {
  assert((planRiskAlerts(basePlan({ cases: [{ ...caseInput, closed: true }] })).communicationLedgers ?? []).length === 0, "fechando");
  const inf = planRiskAlerts(basePlan({ informativeAreas: new Set(["PLANEJAMENTO"]), reissueApprovals: ledgerMod.resolveReissueApprovals([approval()]) }));
  assert(inf.outbox.length === 0 && (inf.communicationLedgers ?? []).length === 0, "informativa");
  const legacy = planRiskAlerts(basePlan({ outboxHistory: undefined }));
  assert(legacy.communicationLedgers === undefined && legacy.outbox.length === 0, "sem histórico => comportamento anterior");
});

await check("8. Ciclo REAL: supressão por prontidão → etapa avança pelo tempo; ao liberar, nada é reemitido sem decisão; dry-run mostra a lacuna (mascarada)", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_SENDER: CRM, GOOGLE_GMAIL_INBOUND_MAILBOX: CRM, AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM });
  try {
    const world = {
      projectId: WEG,
      projectName: "[ENSAIO] Obra",
      config: config(),
      matrixRules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule),
      // Outra área em uso com Matriz incompleta => CONFIGURATION_REVIEW_REQUIRED global (como o FINANCEIRO na WEG).
      areaResponsibles: [resp(), { ...resp({ responsibleDirectUserId: null }), id: "resp-ADM", area: "ADMINISTRATIVO" }],
      informativeAreas: [],
      settings: null,
      recipients: recipients(),
      senderMailbox: CRM,
      replyMailbox: CRM,
      sourceCases: [{ ...caseInput, riskLevel: "HIGH" }, { ...caseInput, sourceId: "src-adm", area: "ADMINISTRATIVO", riskLevel: "MEDIUM", fingerprint: "fp-adm", reference: "ADM" }],
      legacyNoClaim: false,
    };
    const store = createInMemoryRiskAlertStore(world);
    const baseLoad = store.loadProjectSnapshot.bind(store);
    store.loadProjectSnapshot = async (id) => {
      const snap = await baseLoad(id);
      const auditRows = (store.state.audit ?? []).map((a, i) => ({ id: `aud-${i}`, occurred_at: a.at ?? T0, actor_type: a.actorType ?? "SYSTEM", actor_user_id: a.actorUserId ?? null, action: a.action, entity_type: a.entityType, entity_id: a.entityId }));
      return {
        ...snap,
        outboxHistory: store.state.outbox.filter((o) => o.caseId).map((o) => ({ caseId: o.caseId, notificationType: o.notificationType, escalationLevel: o.escalationLevel, recipientUserId: o.recipientUserId, recipientEmail: o.deliveredTo ?? null, status: o.status, suppressionReason: o.suppressionReason, attemptCount: o.attemptCount, providerMessageId: o.provider ?? null, createdAt: T0, sentAt: o.sentAt })),
        reissueApprovals: ledgerMod.resolveReissueApprovals(auditRows),
        reissueDecisionRecordedCaseIds: new Set(auditRows.filter((a) => a.action === ledgerMod.REISSUE_DECISION_REQUIRED_ACTION).map((a) => a.entity_id)),
      };
    };
    const sent = [];
    class Recording extends FakeEmailProvider {
      constructor() {
        super({ onGuardedInput: (g) => sent.push(g) });
      }
    }
    const provider = new Recording();
    store.setClock(T0);
    const expert = { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) };
    const r1 = await runRiskAlertCycle({ now: new Date(T0), store, provider, dryRun: false, projectId: WEG, expert });
    assert(r1.projects[0].readinessBlockers.includes("CONFIGURATION_REVIEW_REQUIRED"), "bloqueado");
    assert(sent.length === 0, "nada enviado bloqueado");
    // Matriz corrigida, prazos todos vencidos (dias depois).
    world.areaResponsibles = [resp(), { ...resp(), id: "resp-ADM", area: "ADMINISTRATIVO" }];
    const later = "2026-11-18T13:00:00.000Z";
    store.setClock(later);
    const r2 = await runRiskAlertCycle({ now: new Date(later), store, provider, dryRun: false, projectId: WEG, expert });
    assert(r2.projects[0].readinessBlockers.length === 0, `sem bloqueio: ${r2.projects[0].readinessBlockers}`);
    // Escalonamento NOVO deste ciclo (Diretoria) pode sair normalmente; o que foi suprimido antes NÃO é reemitido.
    const reissued = store.state.outbox.filter((o) => o.idempotencyKey.includes(":REISSUE:"));
    assert(reissued.length === 0, "nenhuma reemissão sem decisão");
    const suppressedImmediate = store.state.outbox.find((o) => o.notificationType === "IMMEDIATE" && o.idempotencyKey.includes(":IMMEDIATE:"));
    assert(suppressedImmediate && suppressedImmediate.status === "SUPPRESSED", "imediato continua SUPPRESSED (não vira entrega)");
    const dry = await runRiskAlertCycle({ now: new Date("2026-11-18T14:00:00.000Z"), store, provider, dryRun: true, projectId: WEG, expert });
    const ledger = (dry.projects[0].communicationLedger ?? []).filter((l) => l.stageReached);
    assert(ledger.length === 1, `livro-razão: ${JSON.stringify(ledger)}`);
    const responsavel = ledger[0].recipients.find((r) => r.role === "RESPONSAVEL");
    assert(responsavel && responsavel.status === "SUPPRESSED_ONLY", JSON.stringify(ledger[0]));
    assert(!JSON.stringify(ledger).includes("@") && !JSON.stringify(ledger).includes(U.jaime), "mascarado");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

await check("9. E-mail de reemissão renderizado: assunto e título dizem REEMISSÃO, etapa real e comunicações anteriores NÃO entregues com data (Brasília)", async () => {
  const { buildImmediateRiskAlertEmail } = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails");
  const p = planRiskAlerts(basePlan({ reissueApprovals: ledgerMod.resolveReissueApprovals([approval()]) }));
  const responsible = p.outbox.find((e) => e.escalationLevel === "RESPONSAVEL");
  const built = buildImmediateRiskAlertEmail({ content: responsible.content, projectId: WEG, projectName: "P", recipientName: "J", baseUrl: "https://acc.invalid", timeZone: "America/Sao_Paulo", generatedAt: T0, actionButtons: [] });
  assert(/REEMISSÃO \(comunicação anterior não entregue\)/.test(built.subject), built.subject);
  assert(/REEMISSÃO — risco/.test(built.text) && !/Novo risco/.test(built.text), "título explícito");
  assert(/Comunicação anterior \(NÃO entregue\): 22\/10\/2026, 09:00 — Nível 1 · Responsável/.test(built.text) && /suprimida \(CONFIGURATION_REVIEW_REQUIRED\)/.test(built.text), built.text);
  assert(/Etapa atual do SLA: Nível 3 · Diretoria/.test(built.text), "etapa");
  const normal = buildImmediateRiskAlertEmail({ content: { ...responsible.content, reissue: undefined }, projectId: WEG, projectName: "P", recipientName: "J", baseUrl: "https://acc.invalid", timeZone: "America/Sao_Paulo", generatedAt: T0, actionButtons: [] });
  assert(!/REEMISSÃO/.test(normal.subject + normal.text), "sem reemissão, layout anterior");
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
