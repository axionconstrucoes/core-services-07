// Caso de TESTE do piloto WEG ("[TESTE PILOTO]" / "TESTE-PILOTO"): identificação, exclusão de indicadores/ciclo e máquina de estados
// com sla_action_id NULO. Store em memória + provider simulado; nenhuma rede, nenhum banco, nenhum e-mail.
// Uso: node scripts/test-pilot-test-case.mjs
import net from "node:net";
import { register } from "node:module";
import fs from "node:fs";

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

const { isPilotTestCase } = await import("../apps/web/lib/risk-alerts/pilot-test-case");
const { applyAlertAction } = await import("../apps/web/lib/risk-alerts/alert-state-machine");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { runRiskAlertCycle } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { runPilotSingleAlert } = await import("../apps/web/lib/risk-alerts/run-pilot-single-alert");
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
const CRM = "crm@axion.com.br";
const BOX = "axion@axion.com.br";
const GROUP = ["crm@axion.com.br", "reynaldo@axion.com.br", "jaime.ramos@axion.com.br", "carlos.evandro@axion.com.br"];
const T0 = "2026-11-13T12:00:00.000Z";
const U = {
  rey: "a1111111-0000-4000-8000-000000000011",
  jaime: "b2222222-0000-4000-8000-000000000012",
  carlos: "c3333333-0000-4000-8000-000000000013",
  ricardo: "d4444444-0000-4000-8000-000000000014",
};
const EMAIL = { [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br", [U.ricardo]: "ricardo.martins@axion.com.br" };
const REAL_ID = "f05e1092-f9b5-44f7-bd4d-7e48e5d869be";
const TEST_ID = "e5e5e5e5-0000-4000-8000-0000000000e5";
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "BUSINESS_DAYS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const rules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule);
// Matriz real da WEG/PLANEJAMENTO: Nível 1 = Ricardo; sem Nível 2; Diretoria = Reynaldo.
const responsibles = [{ id: "resp", projectId: WEG, area: "PLANEJAMENTO", responsibleDirectUserId: U.ricardo, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: null, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: T0 }];
const settings = { projectId: WEG, timezone: "America/Sao_Paulo", businessDayStartHour: 8, businessDayEndHour: 18, updatedAt: "" };
const policy = resolveMatrixPolicy({ rules, responsibles, settings, area: "PLANEJAMENTO", riskLevel: "HIGH" });
const recipients = new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(0, 2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
const config = { enabled: true, riskAlertsEnabled: false, pilotRecipientAllowlistUserIds: [U.rey, U.jaime, U.carlos], senderDomain: "axion.com.br", severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" }, pilotProjectConfirmedAt: T0, pilotDeliveryOverrideEmail: CRM };

const GROUP_ENV = { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_DESTINATION: BOX, ACC_PROJECT_PILOT_SENDER: CRM, ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR", AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM };
async function withEnv(fn) {
  const saved = { ...process.env };
  Object.assign(process.env, GROUP_ENV);
  delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

function caseRecord(over) {
  return { id: "x", sourceType: "INGESTION_ALERT", sourceId: "s", area: "PLANEJAMENTO", riskLevel: "HIGH", previousRiskLevel: null, fingerprint: "fp", status: "OPEN", slaActionId: null, lastDigestWindow: null, firstSeenAt: T0, lastChangedAt: T0, closedAt: null, title: "t", summary: "s", impact: "i", recommendation: null, originPath: "", reference: "", state: "OPEN", currentLevel: "RESPONSAVEL", currentResponsibleUserId: null, previousResponsibleUserId: null, topLevelReachedAt: null, visibleCode: "AAAA0000", ...over };
}
const realCase = () => caseRecord({ id: REAL_ID, sourceType: "SCHEDULE_COMPARISON", sourceId: "caa59ec7-b287-4bdb-b7a0-a42c434b3f3d", title: "Cronograma semanal vs baseline oficial (W43)", reference: "W43 · vs baseline oficial", currentResponsibleUserId: U.ricardo, visibleCode: "1F493F8C" });
const testCase = () => caseRecord({ id: TEST_ID, sourceId: "e5e5e5e5-1111-4111-8111-1111111111e5", title: "[TESTE PILOTO] Caso isolado — validação de botões", reference: "TESTE-PILOTO", summary: "Caso de teste. Não representa risco real.", currentResponsibleUserId: U.rey, visibleCode: "7E57C0DE" });

function makeWorld() {
  const world = { projectId: WEG, projectName: "Obra WEG (ensaio)", config: { ...config }, matrixRules: rules, areaResponsibles: responsibles, settings: null, recipients, senderMailbox: CRM, replyMailbox: CRM, sourceCases: [] };
  const store = createInMemoryRiskAlertStore(world);
  store.state.cases.set(REAL_ID, realCase());
  store.state.cases.set(TEST_ID, testCase());
  const rec = { guarded: [] };
  class Recording extends FakeEmailProvider {
    constructor() {
      super({ onGuardedInput: (g) => rec.guarded.push(g) });
    }
  }
  store.setClock(T0);
  return { world, store, rec, provider: new Recording() };
}

await check("isPilotTestCase: marca por title OU reference; caso real e vazio não são teste", () => {
  assert(isPilotTestCase({ title: "[TESTE PILOTO] Caso isolado", reference: "" }));
  assert(isPilotTestCase({ title: "qualquer", reference: "TESTE-PILOTO" }));
  assert(isPilotTestCase({ title: "  [teste piloto] x", reference: null }), "case/espaço");
  assert(!isPilotTestCase({ title: "Cronograma semanal vs baseline oficial (W43)", reference: "W43 · vs baseline oficial" }));
  assert(!isPilotTestCase({ title: "Teste de cronograma", reference: "W12" }), "contém 'teste' mas não é prefixo");
  assert(!isPilotTestCase({}) && !isPilotTestCase(null) && !isPilotTestCase(undefined));
});

await check("todos os pontos que leem risk_alert_cases usam isPilotTestCase (e há rótulo TESTE nos painéis)", () => {
  assert(/isPilotTestCase/.test(read("apps/web/lib/risk-alerts/supabase-store.ts")) && /filter\(\(c\) => !isPilotTestCase\(c\)\)/.test(read("apps/web/lib/risk-alerts/supabase-store.ts")) && /testCases/.test(read("apps/web/lib/risk-alerts/supabase-store.ts")), "supabase-store");
  const cycleSrc = read("apps/web/lib/risk-alerts/run-risk-alert-cycle.ts");
  assert((cycleSrc.match(/isPilotTestCaseSendBlocked\(record, /g) ?? []).length === 2, "bloqueio de envio tardio deve estar em sendPlanned e sendPendingRow");
  const view = read("apps/web/lib/risk-alerts/pilot-risk-alerts-view-data.ts");
  assert(/isPilotTestCase/.test(view) && /testCasesOpen/.test(view) && /isTest:/.test(view) && /\.not\("case_id", "in"/.test(view), "view-data (contagens/outbox)");
  assert(/isPilotTestCase/.test(read("apps/web/lib/risk-alerts/alert-detail-data.ts")) && /isTestCase/.test(read("apps/web/lib/risk-alerts/alert-detail-data.ts")), "detalhe");
  assert(/isPilotTestCase/.test(read("apps/web/app/[projectId]/acoes/actions.ts")), "escalonamento manual");
  assert(/>TESTE</.test(read("components/sla/pilot-risk-alerts-panel.tsx".replace(/^/, "apps/web/"))) && /TESTE — caso isolado/.test(read("apps/web/app/[projectId]/alertas/[caseId]/page.tsx")), "rótulos TESTE");
  // O correlacionador de respostas NÃO filtra: respostas ao caso de teste precisam correlacionar.
  const store = read("apps/web/lib/risk-alerts/supabase-store.ts");
  const corr = store.slice(store.indexOf("async loadCorrelationIndex"), store.indexOf("async listInboundToProcess"));
  assert(!/isPilotTestCase/.test(corr), "correlação não pode filtrar o caso de teste");
});

// ---- máquina de estados com sla_action_id NULO (responsável Reynaldo; Ricardo/caso real fora) ----
const transitions = [];
function snapshotOf(over = {}) {
  return { id: TEST_ID, projectId: WEG, sourceType: "INGESTION_ALERT", sourceId: "e5e5e5e5-1111-4111-8111-1111111111e5", riskLevel: "HIGH", state: "OPEN", currentLevel: "RESPONSAVEL", topLevelReachedAt: null, currentResponsibleUserId: U.rey, previousResponsibleUserId: null, slaActionId: null, title: "[TESTE PILOTO] Caso isolado — validação de botões", reference: "TESTE-PILOTO", activeForward: null, escalatedLevels: [], ...over };
}
function act(snapshot, action, actor, payload = {}, extra = {}) {
  return applyAlertAction({ now: extra.now ?? T0, snapshot, action, actorUserId: actor, origin: "WEB", payload, policy, config, recipients, eligibleForwardUserIds: extra.eligible ?? [U.jaime, U.carlos] });
}
const next = (snap, t, extra = {}) => ({ ...snap, state: t.caseUpdate.state, currentLevel: t.caseUpdate.currentLevel ?? snap.currentLevel, currentResponsibleUserId: t.caseUpdate.currentResponsibleUserId ?? snap.currentResponsibleUserId, previousResponsibleUserId: t.caseUpdate.previousResponsibleUserId ?? snap.previousResponsibleUserId, escalatedLevels: [...snap.escalatedLevels, ...t.events.filter((e) => e.actionType === "IMMEDIATE_ESCALATION").map((e) => e.toLevel)], activeForward: t.forward ? { id: "fw1", fromUserId: t.forward.fromUserId, toUserId: t.forward.toUserId, assumeDueAt: t.forward.assumeDueAt, timeoutAt: t.forward.timeoutAt, state: "ACTIVE" } : (t.closeActiveForwardAs ? null : snap.activeForward), ...extra });

await check("máquina de estados (sla_action_id nulo): TAKING_ACTION, FORWARD, ação do encaminhado, proposta e confirmação de resolução", () => {
  let s = snapshotOf();
  const t1 = act(s, "TAKING_ACTION", U.rey, { text: "Assumindo o caso de teste." });
  assert(t1.ok && t1.caseUpdate.state === "IN_PROGRESS" && t1.caseUpdate.currentResponsibleUserId === U.rey, JSON.stringify(t1));
  // HIGH: ação humana escala (Matriz: sem Nível 2 => Diretoria = Reynaldo). Nunca Ricardo; saída só PENDING (sem ciclo não envia).
  assert(t1.escalation?.toLevel === "DIRETORIA", `escalonamento ${t1.escalation?.toLevel}`);
  assert(t1.outbox.every((o) => o.recipientUserId === U.rey && o.status === "PENDING"), JSON.stringify(t1.outbox));
  transitions.push(t1);
  s = next(s, t1);
  // FORWARD: self e alvo não elegível falham; válido vai a Jaime.
  assert(act(s, "FORWARD", U.rey, { targetUserId: U.rey, text: "x" }, { eligible: [U.rey, U.jaime] }).code === "FORWARD_SELF");
  assert(act(s, "FORWARD", U.rey, { targetUserId: U.ricardo, text: "x" }).code === "FORWARD_TARGET_INVALID", "Ricardo não é elegível");
  const t2 = act(s, "FORWARD", U.rey, { targetUserId: U.jaime, text: "Teste de encaminhamento." });
  assert(t2.ok && t2.caseUpdate.state === "AWAITING_RECIPIENT_ACTION" && t2.forward.toUserId === U.jaime && t2.caseUpdate.currentResponsibleUserId === U.jaime && t2.caseUpdate.previousResponsibleUserId === U.rey, JSON.stringify(t2));
  assert(t2.outbox.some((o) => o.notificationType === "FORWARD" && o.recipientUserId === U.jaime && o.status === "PENDING"));
  transitions.push(t2);
  s = next(s, t2);
  assert(act(s, "FORWARD", U.jaime, { targetUserId: U.carlos, text: "x" }).code === "ACTION_NOT_ALLOWED", "encaminhamento ativo bloqueia novo FORWARD");
  const t3 = act(s, "TAKING_ACTION", U.jaime, { text: "Assumi o encaminhamento." });
  assert(t3.ok && t3.closeActiveForwardAs === "ACTED" && t3.caseUpdate.currentResponsibleUserId === U.jaime, JSON.stringify(t3));
  transitions.push(t3);
  s = next(s, t3);
  // RESOLVED (HIGH): exige confirmação, justificativa e evidência; vira RESOLUTION_PROPOSED; só RESOLUTION_CONFIRMED encerra.
  assert(act(s, "RESOLVED", U.jaime, { text: "ok" }).code === "CONFIRMATION_REQUIRED");
  assert(act(s, "RESOLVED", U.jaime, { confirmed: true }).code === "JUSTIFICATION_REQUIRED");
  assert(act(s, "RESOLVED", U.jaime, { confirmed: true, justification: "Caso de teste." }).code === "EVIDENCE_REQUIRED");
  assert(act(s, "RESOLUTION_CONFIRMED", U.carlos, { confirmed: true }).code === "ACTION_NOT_ALLOWED", "confirmar sem proposta");
  const t4 = act(s, "RESOLVED", U.jaime, { confirmed: true, justification: "Caso de teste.", evidence: "Teste dos botões.", text: "Proposta de resolução (teste)." });
  assert(t4.ok && t4.caseUpdate.state === "RESOLUTION_PROPOSED", JSON.stringify(t4));
  transitions.push(t4);
  s = next(s, t4);
  assert(act(s, "RESOLUTION_CONFIRMED", U.carlos, { text: "x" }).code === "CONFIRMATION_REQUIRED");
  const t5 = act(s, "RESOLUTION_CONFIRMED", U.carlos, { confirmed: true, text: "Confirmado (teste)." });
  assert(t5.ok && t5.caseUpdate.state === "RESOLVED" && t5.caseUpdate.slaActionStatus === "COMPLETED", JSON.stringify(t5));
  transitions.push(t5);
  s = next(s, t5);
  assert(act(s, "TAKING_ACTION", U.rey, { text: "x" }).code === "ALREADY_RESOLVED", "resolvido é terminal");
  // Ricardo e o caso real não aparecem em nenhum evento/saída/destino.
  // Atores, alvos, destinatários, responsáveis e encaminhamentos: nunca Ricardo nem o caso real. (O matrixRuleSnapshot só ecoa a Matriz da área.)
  const refs = [];
  for (const tr of transitions) {
    for (const e of tr.events) refs.push(e.actorUserId, e.targetUserId);
    for (const o of tr.outbox) refs.push(o.recipientUserId);
    refs.push(tr.caseUpdate.currentResponsibleUserId, tr.caseUpdate.previousResponsibleUserId, tr.forward?.fromUserId, tr.forward?.toUserId);
  }
  assert(!refs.includes(U.ricardo), "Ricardo apareceu como ator, alvo, destinatário ou responsável");
  assert(!JSON.stringify(transitions).includes(REAL_ID), "caso real apareceu nas transições");
});

await check("envio tardio: linha PENDING de caso de teste NÃO sai no ciclo normal (fica PENDING e contada); controle: caso comum sai; caso real e Ricardo intocados", () =>
  withEnv(async () => {
    const w = makeWorld();
    const realBefore = JSON.stringify(w.store.state.cases.get(REAL_ID));
    const store = w.store;
    let s = snapshotOf();
    const a1 = act(s, "TAKING_ACTION", U.rey, { text: "Assumindo (teste)." });
    await store.applyTransition(TEST_ID, a1, U.rey);
    s = next(s, a1);
    const a2 = act(s, "FORWARD", U.rey, { targetUserId: U.jaime, text: "Encaminhando (teste)." });
    await store.applyTransition(TEST_ID, a2, U.rey);
    const pendingRows = store.state.outbox.filter((o) => o.caseId === TEST_ID && o.status === "PENDING");
    assert(pendingRows.length >= 2, `pendentes ${pendingRows.length}`);
    assert(w.rec.guarded.length === 0, "transição enviou e-mail sem ciclo");
    const caseBefore = JSON.parse(JSON.stringify(store.state.cases.get(TEST_ID)));
    // Liga a flag SÓ no ensaio (em memória) para provar que o ciclo não envia nem toca o caso de teste.
    w.world.config.riskAlertsEnabled = true;
    const cycle = await runRiskAlertCycle({ now: new Date(T0), store, provider: w.provider, expert: { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) }, dryRun: false });
    assert(w.rec.guarded.length === 0, `ciclo enviou ${w.rec.guarded.length} mensagem(ns) de caso de teste`);
    assert(cycle.projects[0].pilotTestCaseBlocked >= pendingRows.length, `contagem ${cycle.projects[0].pilotTestCaseBlocked}`);
    for (const row of pendingRows) {
      const now = store.state.outbox.find((o) => o.id === row.id);
      assert(now.status === "PENDING" && now.attemptCount === 0 && !now.sentAt, `linha ${row.idempotencyKey} foi alterada: ${now.status}`);
    }
    const after = store.state.cases.get(TEST_ID);
    for (const k of ["status", "state", "currentLevel", "currentResponsibleUserId", "closedAt", "riskLevel"]) assert(JSON.stringify(after[k]) === JSON.stringify(caseBefore[k]), `ciclo alterou ${k} do caso de teste`);
    assert(!store.state.outbox.some((o) => o.caseId === TEST_ID && o.notificationType === "DIGEST"), "consolidado incluiu o caso de teste");
    assert(JSON.stringify(store.state.cases.get(REAL_ID)) === realBefore, "caso real alterado");
    assert(!store.state.outbox.some((o) => o.caseId === REAL_ID) && !store.state.events.some((e) => e.caseId === REAL_ID) && !store.state.audit.some((a) => a.entityId === REAL_ID), "histórico do caso real recebeu registros");
    assert(store.state.cases.get(REAL_ID).currentResponsibleUserId === U.ricardo, "Ricardo deixou de ser o responsável do caso real");
    // ---- envio único ARMADO (pilotSingleCase): só as chaves PILOT_SINGLE saem, pelas guardas, To = 4 caixas; FORWARD/ESCALATION seguem PENDING.
    w.world.config.riskAlertsEnabled = false;
    const single = await runPilotSingleAlert({ caseId: TEST_ID, now: new Date(T0), store, provider: w.provider });
    assert(single.status === "EXECUTED" && single.sent === 3 && single.failed === 0, JSON.stringify(single));
    assert(w.rec.guarded.length === 3, `${w.rec.guarded.length} mensagens`);
    for (const g of w.rec.guarded) {
      const to = String(g.to).split(",").map((x) => x.trim().toLowerCase()).sort();
      assert(JSON.stringify(to) === JSON.stringify([...GROUP].sort()), `To=${g.to}`);
      assert(!g.cc && !g.bcc, "Cc/Bcc");
      const text = JSON.stringify(g);
      assert(!/axion@axion.com.br/i.test(text) && !/ricardo.martins/i.test(text), "axion@ ou Ricardo apareceu");
    }
    for (const row of pendingRows) assert(store.state.outbox.find((o) => o.id === row.id).status === "PENDING", "envio único enviou linha que não era sua");
    // ---- controle: caso COMUM com a mesma linha PENDING sai no ciclo (o bloqueio é específico do caso de teste).
    const c = makeWorld();
    const CTRL = "9c9c9c9c-0000-4000-8000-0000000000c9";
    c.store.state.cases.set(CTRL, caseRecord({ id: CTRL, sourceId: "ctrl-src", title: "Caso comum de controle", reference: "W44", currentResponsibleUserId: U.rey, visibleCode: "C0C0C0C0" }));
    const cs = snapshotOf({ id: CTRL, sourceId: "ctrl-src", title: "Caso comum de controle", reference: "W44" });
    await c.store.applyTransition(CTRL, act(cs, "TAKING_ACTION", U.rey, { text: "Assumindo (controle)." }), U.rey);
    c.world.config.riskAlertsEnabled = true;
    const cc = await runRiskAlertCycle({ now: new Date(T0), store: c.store, provider: c.provider, expert: { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) }, dryRun: false });
    assert(c.rec.guarded.length >= 1 && cc.projects[0].pilotTestCaseBlocked === 0, `controle: enviadas ${c.rec.guarded.length}, bloqueadas ${cc.projects[0].pilotTestCaseBlocked}`);
  }));

await check("sla_action_id nulo na camada do banco: todos os blocos de SLA da RPC são protegidos (leitura do repositório)", () => {
  const sql = fs.readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /\.sql$/.test(f)).map((f) => fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8")).join("\n");
  assert(/record_risk_alert_action/.test(sql), "RPC não encontrada nas migrations");
  assert(/v_case\.sla_action_id is not null/.test(sql), "guarda de sla_action_id ausente");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
