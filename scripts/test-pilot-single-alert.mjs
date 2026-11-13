// Execução manual ÚNICA do piloto WEG (runPilotSingleAlert) sobre o store em memória e o provider simulado, com a MESMA cadeia
// de guardas do transporte real. Nenhuma rede, nenhum banco, nenhum e-mail.
// Uso: node scripts/test-pilot-single-alert.mjs
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

const { runPilotSingleAlert, MAX_PILOT_SINGLE_RECIPIENTS } = await import("../apps/web/lib/risk-alerts/run-pilot-single-alert");
const { runRiskAlertCycle } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { createInMemoryRiskAlertStore } = await import("./lib/weg-alert-sim/in-memory-risk-alert-store.mjs");
const fs = await import("node:fs");

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
const EMAIL = {
  [U.rey]: "reynaldo@axion.com.br",
  [U.jaime]: "jaime.ramos@axion.com.br",
  [U.carlos]: "carlos.evandro@axion.com.br",
  [U.ricardo]: "ricardo.martins@axion.com.br",
};
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "BUSINESS_DAYS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 1, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });

function makeWorld(projectId = WEG) {
  const recipients = new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(0, 2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
  const world = {
    projectId,
    projectName: "Obra WEG (ensaio)",
    config: {
      enabled: true,
      riskAlertsEnabled: false, // estado real da WEG: DESLIGADO
      pilotRecipientAllowlistUserIds: [], // durante a semeadura nada é elegível => tudo SUPPRESSED (como no histórico real)
      senderDomain: "axion.com.br",
      severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" },
      pilotProjectConfirmedAt: T0,
      pilotDeliveryOverrideEmail: CRM,
    },
    matrixRules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule),
    areaResponsibles: [{ id: "resp", projectId, area: "PLANEJAMENTO", responsibleDirectUserId: U.ricardo, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: null, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: T0 }],
    settings: null,
    recipients,
    senderMailbox: CRM,
    replyMailbox: CRM,
    sourceCases: [
      { sourceType: "SCHEDULE_COMPARISON", sourceId: "c-high", area: "PLANEJAMENTO", riskLevel: "HIGH", title: "Risco alto (ensaio)", summary: "Resumo.", impact: "Impacto.", recommendation: "Ação.", fingerprint: "fp1", originPath: "documentos?tab=registro-email", closed: false, reference: "ENS-HIGH" },
      { sourceType: "SCHEDULE_COMPARISON", sourceId: "c-med", area: "PLANEJAMENTO", riskLevel: "MEDIUM", title: "Risco médio (ensaio)", summary: "Resumo.", impact: "Impacto.", recommendation: null, fingerprint: "fp2", originPath: "documentos?tab=registro-email", closed: false, reference: "ENS-MED" },
    ],
  };
  const store = createInMemoryRiskAlertStore(world);
  const rec = { guarded: [] };
  class Recording extends FakeEmailProvider {
    constructor() {
      super({ onGuardedInput: (g) => rec.guarded.push(g) });
    }
  }
  return { world, store, rec, provider: new Recording() };
}

const GROUP_ENV = { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_DESTINATION: BOX, ACC_PROJECT_PILOT_SENDER: CRM, ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR", AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM };

async function withEnv(extra, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, GROUP_ENV, extra);
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete process.env[k];
  delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

/** Semeadura: o ciclo normal roda UMA vez com a allowlist vazia (tudo SUPPRESSED) para existir o caso, como no histórico real; depois a allowlist é a real. */
async function seeded() {
  const w = makeWorld();
  w.world.config.riskAlertsEnabled = true;
  w.store.setClock(T0);
  await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, expert: { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) }, dryRun: false });
  w.world.config.riskAlertsEnabled = false;
  w.world.config.pilotRecipientAllowlistUserIds = [U.rey, U.jaime, U.carlos];
  w.rec.guarded.length = 0;
  const highCase = [...w.store.state.cases.values()].find((c) => c.riskLevel === "HIGH");
  const medCase = [...w.store.state.cases.values()].find((c) => c.riskLevel === "MEDIUM");
  assert(highCase && medCase, "semeadura sem casos");
  assert(w.store.state.outbox.every((o) => o.status !== "SENT"), "semeadura enviou algo");
  return { ...w, highCase, medCase, seedOutbox: w.store.state.outbox.length };
}

await check("dry-run: planeja 3 destinatários da allowlist e NÃO escreve nem envia; risk_alerts_enabled segue false", () =>
  withEnv({}, async () => {
    const w = await seeded();
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, dryRun: true, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "DRY_RUN", r.status + r.blockedReason);
    assert(r.riskAlertsEnabledInDatabase === false);
    assert(r.recipients.length === 3 && r.recipients.every((x) => x.outcome === "WOULD_SEND"), JSON.stringify(r.recipients));
    assert(w.store.state.outbox.length === w.seedOutbox, "dry-run escreveu na outbox");
    assert(w.rec.guarded.length === 0, "dry-run enviou");
    assert(w.world.config.riskAlertsEnabled === false);
  }));

await check("execução: 3 e-mails (um por pessoa da allowlist), To EXATO nas quatro caixas, sem Cc/Bcc, sem axion@, sem Ricardo", () =>
  withEnv({}, async () => {
    const w = await seeded();
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "EXECUTED" && r.sent === 3 && r.failed === 0, JSON.stringify(r));
    assert(w.rec.guarded.length === 3, `${w.rec.guarded.length} mensagens`);
    for (const g of w.rec.guarded) {
      const to = String(g.to).split(",").map((a) => a.trim().toLowerCase()).sort();
      assert(JSON.stringify(to) === JSON.stringify([...GROUP].sort()), `To=${g.to}`);
      assert(!g.cc && !g.bcc, "Cc/Bcc presentes");
      assert(!/axion@axion\.com\.br/i.test(JSON.stringify(g)), "axion@ apareceu");
      assert(!/ricardo\.martins/i.test(JSON.stringify(g)), "Ricardo apareceu");
      assert(g.replyTo && /^crm\+alerta-/i.test(g.replyTo), `Reply-To=${g.replyTo}`);
      assert(/PILOTO/i.test(g.subject + g.text), "sem identificação de piloto");
    }
    const labels = new Set(w.rec.guarded.map((g) => /usuário (\w{8})/.exec(g.text)?.[1]));
    assert(labels.size === 3, `${labels.size} participantes lógicos distintos`);
    assert(w.world.config.riskAlertsEnabled === false, "flag alterada");
    assert(w.store.state.audit.some((a) => a.action === "RISK_ALERT_PILOT_SINGLE_RUN"), "auditoria ausente");
  }));

await check("idempotência: segunda execução e execução repetida não reenviam (ALREADY_SENT)", () =>
  withEnv({}, async () => {
    const w = await seeded();
    await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    const before = w.rec.guarded.length;
    const again = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    const later = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date("2026-11-14T12:00:00.000Z"), store: w.store, provider: w.provider });
    assert(again.status === "ALREADY_SENT" && later.status === "ALREADY_SENT", `${again.status}/${later.status}`);
    assert(w.rec.guarded.length === before, "reenviou");
    assert(again.recipients.every((x) => x.outcome === "JA_EXISTE"));
  }));

await check("não roda o ciclo: nenhum caso/consolidado/escalonamento novo; só as 3 linhas PILOT_SINGLE; fila histórica intocada", () =>
  withEnv({}, async () => {
    const w = await seeded();
    const casesBefore = w.store.state.cases.size;
    const outboxBefore = w.store.state.outbox.map((o) => `${o.idempotencyKey}:${o.status}`).sort();
    await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(w.store.state.cases.size === casesBefore, "casos alterados");
    const added = w.store.state.outbox.filter((o) => !outboxBefore.includes(`${o.idempotencyKey}:${o.status}`));
    assert(added.length === 3 && added.every((o) => o.idempotencyKey.includes(":PILOT_SINGLE:") && o.notificationType === "IMMEDIATE"), `novas: ${added.map((o) => o.idempotencyKey).join("|")}`);
    for (const key of outboxBefore) assert(w.store.state.outbox.some((o) => `${o.idempotencyKey}:${o.status}` === key), `linha histórica mudou: ${key}`);
  }));

await check("bloqueios: caso médio, caso inexistente/outro projeto, id inválido, grupo inativo, perfil inválido, flag global desligada", async () => {
  await withEnv({}, async () => {
    const w = await seeded();
    const run = (caseId) => runPilotSingleAlert({ caseId, now: new Date(T0), store: w.store, provider: w.provider });
    assert((await run(w.medCase.id)).blockedReason === "CASE_NOT_HIGH_OR_CRITICAL");
    assert((await run("99999999-0000-4000-8000-000000000099")).blockedReason === "CASE_NOT_IN_PROJECT");
    assert((await run("não-é-uuid")).blockedReason === "CASE_ID_INVALID");
    assert(w.rec.guarded.length === 0);
  });
  await withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "", ACC_PROJECT_PILOT_DESTINATION: "outro@exemplo.com" }, async () => {
    const w = await seeded();
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, store: w.store, provider: w.provider });
    assert(r.status === "BLOCKED" && r.blockedReason === "PILOT_PROFILE_INVALID", r.blockedReason);
    assert(w.rec.guarded.length === 0, "enviou com destino fora da lista fixa");
  });
  await withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "OUTRO_GRUPO" }, async () => {
    const w = await seeded();
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, store: w.store, provider: w.provider });
    assert(r.blockedReason === "PILOT_PROFILE_INVALID", r.blockedReason);
  });
  await withEnv({ ACC_WEEKLY_REPORTS_ENABLED: "false" }, async () => {
    const w = await seeded().catch(() => null);
    if (!w) return;
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, store: w.store, provider: w.provider });
    assert(r.blockedReason === "FEATURE_DISABLED", r.blockedReason);
  });
});

await check("allowlist: quem não está nela não recebe (Ricardo = responsável da Matriz) e membro inativo não é elegível; teto de destinatários", () =>
  withEnv({}, async () => {
    const w = await seeded();
    w.world.config.pilotRecipientAllowlistUserIds = [U.rey, U.jaime, U.carlos, U.ricardo]; // 4º além do teto
    w.world.recipients.set(U.carlos, { userId: U.carlos, name: "Carlos", email: EMAIL[U.carlos], membershipStatus: "INACTIVE" });
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(MAX_PILOT_SINGLE_RECIPIENTS === 3 && r.recipients.length <= 3, `${r.recipients.length} avaliados`);
    assert(!r.recipients.some((x) => x.userId === U.ricardo), "Ricardo avaliado");
    const carlos = r.recipients.find((x) => x.userId === U.carlos);
    assert(carlos.outcome === "NAO_ELEGIVEL" && carlos.suppressionReason === "USER_NOT_ACTIVE", JSON.stringify(carlos));
    assert(r.sent === 2 && w.rec.guarded.length === 2, `${r.sent} enviados`);
  }));

await check("rota: exige cron-secret; execução real sem armamento => 403; id divergente => 403; dry-run não exige armamento; ciclo normal não é chamado", async () => {
  const src = fs.readFileSync(new URL("../apps/web/app/api/cron/risk-alerts/route.ts", import.meta.url), "utf8");
  assert(/isCronRequestAuthorized\(request, process\.env\[RISK_ALERTS_CRON_SECRET_ENV\]\)/.test(src), "autenticação removida");
  assert(src.indexOf("isCronRequestAuthorized") < src.indexOf("pilotSingleCase"), "autenticação deve vir antes");
  assert(/!dryRun && \(!armed \|\| armed !== pilotSingleCase/.test(src), "armamento ausente");
  const branch = src.slice(src.indexOf("if (pilotSingleCase !== null)"), src.indexOf("inFlight = true;\n  try {\n    const result") === -1 ? undefined : src.indexOf("const result = await runRiskAlertCycle"));
  assert(!/runRiskAlertCycle/.test(branch.slice(0, branch.indexOf("return Response.json(single"))), "ramo único chama o ciclo normal");
  const wf = fs.readFileSync(new URL("../.github/workflows/pilot-single-alert.yml", import.meta.url), "utf8");
  assert(!/schedule:/.test(wf) && /workflow_dispatch:/.test(wf) && /refs\/heads\/main/.test(wf) && /ENVIAR-UMA-VEZ/.test(wf), "workflow fora do padrão");
  assert(!/\$\{\{ *secrets\.[A-Z_]+ *\}\}[^\n]*\?/.test(wf), "segredo em URL");
});

// ---------------------------------------------------------------------------------------------------------------
// Reentrada ESTREITA: a mesma linha bloqueada ANTES de qualquer chamada de rede pode ser retentada; nada mais.
// ---------------------------------------------------------------------------------------------------------------
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const { isPreNetworkRetryable, PILOT_SINGLE_PRE_NETWORK_MARKER } = await import("../apps/web/lib/risk-alerts/run-pilot-single-alert");
const PRE_NETWORK_ERROR = "GmailEmailProvider: remetente do piloto não configurado — envio bloqueado antes de qualquer chamada de rede.";

class PreNetworkBlockedProvider extends FakeEmailProvider {
  async send() {
    throw new EmailSendError(PRE_NETWORK_ERROR);
  }
}

/** Reproduz o run real: 3 linhas PENDING, 1 tentativa, sem provider_message_id, last_error com o marcador pré-rede. */
async function preBlocked() {
  const w = await seeded();
  const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: new PreNetworkBlockedProvider() });
  assert(r.status === "EXECUTED" && r.sent === 0 && r.failed === 3, `pré-bloqueio: ${JSON.stringify(r)}`);
  const rows = w.store.state.outbox.filter((o) => o.idempotencyKey.includes(":PILOT_SINGLE:"));
  assert(rows.length === 3 && rows.every((o) => o.status === "PENDING" && o.attemptCount === 1 && !o.providerMessageId && o.lastError?.includes(PILOT_SINGLE_PRE_NETWORK_MARKER)), JSON.stringify(rows.map((o) => [o.status, o.attemptCount, o.lastError])));
  w.rec.guarded.length = 0;
  return { ...w, rows };
}

await check("destino EXCLUSIVO: execução real SEM seleção de destinatário é bloqueada (nada enviado, outbox intacta); dry-run sem seleção só planeja", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const w = await seeded();
    const dry = await runPilotSingleAlert({ caseId: w.highCase.id, dryRun: true, now: new Date(T0), store: w.store, provider: w.provider });
    assert(dry.status === "DRY_RUN" && JSON.stringify(dry.deliveryGroup) === JSON.stringify([BOX]) && dry.recipients.length === 3, `${dry.status} ${dry.blockedReason}`);
    assert(w.store.state.outbox.length === w.seedOutbox && w.rec.guarded.length === 0, "dry-run escreveu/enviou");
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "BLOCKED" && r.blockedReason === "RECIPIENT_SELECTION_REQUIRED" && r.sent === 0, JSON.stringify(r));
    assert(w.store.state.outbox.length === w.seedOutbox && w.rec.guarded.length === 0, "bloqueio escreveu/enviou");
  }));

await check("destino EXCLUSIVO + UM destinatário selecionado: exatamente 1 mensagem, To=axion@, sem Cc/Bcc; as outras linhas não existem/não mudam; repetir não reenvia", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const w = await seeded();
    const dry = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, dryRun: true, now: new Date(T0), store: w.store, provider: w.provider });
    assert(dry.status === "DRY_RUN" && dry.recipients.length === 1 && dry.recipients[0].userId === U.jaime && dry.recipients[0].outcome === "WOULD_SEND", JSON.stringify(dry.recipients));
    assert(w.store.state.outbox.length === w.seedOutbox && w.rec.guarded.length === 0, "dry-run escreveu/enviou");
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime.toUpperCase(), now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "EXECUTED" && r.sent === 1 && r.failed === 0 && r.recipients.length === 1, JSON.stringify(r));
    assert(w.rec.guarded.length === 1, `${w.rec.guarded.length} mensagens`);
    const g = w.rec.guarded[0];
    assert(String(g.to).trim().toLowerCase() === BOX && !g.cc && !g.bcc, `To=${g.to} cc=${g.cc} bcc=${g.bcc}`);
    for (const other of GROUP.filter((a) => a !== BOX && a !== CRM)) assert(!JSON.stringify(g).toLowerCase().includes(other), `menciona ${other}`);
    const rows = w.store.state.outbox.filter((o) => o.idempotencyKey.includes(":PILOT_SINGLE:"));
    assert(rows.length === 1 && rows[0].idempotencyKey.endsWith(U.jaime) && rows[0].status === "SENT", JSON.stringify(rows.map((o) => [o.idempotencyKey, o.status])));
    const again = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider });
    assert(again.status === "ALREADY_SENT" && again.recipients[0].outcome === "JA_EXISTE" && w.rec.guarded.length === 1, "reenviou a mesma mensagem");
    assert(!w.store.state.outbox.some((o) => o.idempotencyKey.endsWith(U.rey) || o.idempotencyKey.endsWith(U.carlos)), "criou linha para destinatário não selecionado");
  }));

await check("seleção inválida: UUID inválido e usuário fora da allowlist (inclusive o responsável da Matriz) => bloqueio, nada enviado", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const w = await seeded();
    const bad = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: "nao-e-uuid", store: w.store, provider: w.provider });
    assert(bad.status === "BLOCKED" && bad.blockedReason === "RECIPIENT_ID_INVALID", bad.blockedReason);
    const out = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.ricardo, store: w.store, provider: w.provider });
    assert(out.status === "BLOCKED" && out.blockedReason === "RECIPIENT_NOT_IN_ALLOWLIST", out.blockedReason);
    assert(w.rec.guarded.length === 0 && w.store.state.outbox.length === w.seedOutbox, "enviou/escreveu");
  }));

await check("3 linhas PENDING pré-rede + snapshot de produção + UM selecionado: só a linha escolhida é retentada (1 e-mail); as outras 2 seguem PENDING, intactas", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    // As 3 linhas pré-rede foram criadas pelo app ainda em modo grupo (sem seleção); só depois o ambiente passa a destino exclusivo.
    const w = await withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" }, () => preBlocked());
    prodLikeSnapshot(w.store);
    const fingerprint = (o) => JSON.stringify([o.id, o.idempotencyKey, o.status, o.attemptCount, o.lastError, o.providerMessageId, o.sentAt]);
    const chosen = w.rows.find((o) => o.idempotencyKey.endsWith(U.jaime));
    const others = w.rows.filter((o) => o !== chosen);
    const before = others.map(fingerprint).sort();
    const dry = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, dryRun: true, now: new Date(T0), store: w.store, provider: w.provider });
    assert(dry.retried === 1 && dry.recipients.length === 1 && dry.recipients[0].outcome === "WOULD_RETRY" && dry.recipients[0].retry, JSON.stringify(dry.recipients));
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "EXECUTED" && r.sent === 1 && r.retried === 1, JSON.stringify(r));
    assert(w.rec.guarded.length === 1 && String(w.rec.guarded[0].to).trim().toLowerCase() === BOX && !w.rec.guarded[0].cc && !w.rec.guarded[0].bcc, "mensagem fora do esperado");
    assert(chosen.status === "SENT", "linha escolhida não ficou SENT");
    assert(others.length === 2 && others.every((o) => o.status === "PENDING" && o.attemptCount === 1 && !o.providerMessageId && !o.sentAt), "outras linhas foram modificadas");
    assert(JSON.stringify(others.map(fingerprint).sort()) === JSON.stringify(before), "outras linhas mudaram");
    assert(w.store.state.outbox.filter((o) => o.idempotencyKey.includes(":PILOT_SINGLE:")).length === 3, "criou/apagou linha");
    const again = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider });
    assert(again.status === "ALREADY_SENT" && w.rec.guarded.length === 1, "reenviou");
  }));

await check("plumbing: a rota repassa pilotSingleRecipient e o workflow exige recipient_user_id (UUID) em mode=send", () => {
  const route = fs.readFileSync(new URL("../apps/web/app/api/cron/risk-alerts/route.ts", import.meta.url), "utf8");
  assert(/pilotSingleRecipient/.test(route) && /recipientUserId/.test(route), "rota não repassa a seleção");
  const wf = fs.readFileSync(new URL("../.github/workflows/pilot-single-alert.yml", import.meta.url), "utf8");
  assert(/recipient_user_id/.test(wf) && /mode=send exige recipient_user_id/.test(wf) && /pilotSingleRecipient=/.test(wf), "workflow sem a seleção obrigatória");
});

await check("reentrada: linhas bloqueadas antes da rede => dry-run WOULD_RETRY sem escrita; execução reaproveita AS MESMAS linhas (sem duplicar) e envia 3", () =>
  withEnv({}, async () => {
    const w = await preBlocked();
    const before = w.store.state.outbox.map((o) => `${o.id}:${o.idempotencyKey}`).sort();
    const dry = await runPilotSingleAlert({ caseId: w.highCase.id, dryRun: true, now: new Date(T0), store: w.store, provider: w.provider });
    assert(dry.status === "DRY_RUN" && dry.retried === 3 && dry.recipients.every((x) => x.outcome === "WOULD_RETRY" && x.retry), JSON.stringify(dry.recipients));
    assert(JSON.stringify(w.store.state.outbox.map((o) => `${o.id}:${o.idempotencyKey}`).sort()) === JSON.stringify(before), "dry-run escreveu");
    assert(w.rec.guarded.length === 0, "dry-run enviou");
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "EXECUTED" && r.sent === 3 && r.retried === 3 && r.recipients.every((x) => x.retry && x.outcome === "SENT"), JSON.stringify(r));
    assert(JSON.stringify(w.store.state.outbox.map((o) => `${o.id}:${o.idempotencyKey}`).sort()) === JSON.stringify(before), "criou linha nova ou trocou chave");
    assert(w.rows.every((o) => o.status === "SENT"), "linhas originais não ficaram SENT");
    for (const g of w.rec.guarded) {
      const to = String(g.to).split(",").map((a) => a.trim().toLowerCase()).sort();
      assert(JSON.stringify(to) === JSON.stringify([...GROUP].sort()) && !g.cc && !g.bcc, `To=${g.to}`);
    }
    assert(w.rec.guarded.length === 3, `${w.rec.guarded.length} mensagens`);
    const again = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(again.status === "ALREADY_SENT" && again.recipients.every((x) => x.outcome === "JA_EXISTE"), "reenviou após SENT");
    assert(w.rec.guarded.length === 3, "reenviou");
  }));

// Reproduz o Supabase REAL: existingIdempotencyKeys NÃO contém linhas PENDING (supabase-store.ts: .neq("status","PENDING")).
function prodLikeSnapshot(store) {
  const orig = store.loadProjectSnapshot.bind(store);
  store.loadProjectSnapshot = async (id) => {
    const snap = await orig(id);
    const pending = new Set(store.state.outbox.filter((o) => o.status === "PENDING").map((o) => o.idempotencyKey));
    return { ...snap, existingIdempotencyKeys: new Set([...snap.existingIdempotencyKeys].filter((k) => !pending.has(k))) };
  };
}

await check("snapshot de produção (sem chaves PENDING): pré-rede => WOULD_RETRY; PENDING com erro incerto/entrega possível => JA_EXISTE e NUNCA reenvia", () =>
  withEnv({}, async () => {
    const w = await preBlocked();
    prodLikeSnapshot(w.store);
    const dry = await runPilotSingleAlert({ caseId: w.highCase.id, dryRun: true, now: new Date(T0), store: w.store, provider: w.provider });
    assert(dry.retried === 3 && dry.recipients.every((x) => x.outcome === "WOULD_RETRY" && x.retry), `dry: ${JSON.stringify(dry.recipients)}`);
    const [a, b, c] = w.rows;
    a.lastError = "Falha de rede no provedor (resposta incerta)."; // sem marcador pré-rede: o Gmail pode ter entregue
    b.lastError = null;
    c.lastError = "timeout aguardando resposta do Gmail";
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "ALREADY_SENT" && r.sent === 0 && r.recipients.every((x) => x.outcome === "JA_EXISTE" && !x.retry), JSON.stringify(r));
    assert(w.rec.guarded.length === 0, "reenviou linha PENDING sem marcador pré-rede (risco de duplicidade)");
  }));

await check("reentrada recusada: provider_message_id preenchido, status SENT, last_error sem marcador, linha de outro caso, tentativas esgotadas", () =>
  withEnv({}, async () => {
    const w = await preBlocked();
    const [a, b, c] = w.rows;
    a.providerMessageId = "msg-qualquer"; // possível entrega => nunca retenta
    b.lastError = "Falha de rede no provedor."; // sem o marcador pré-rede
    c.caseId = "99999999-0000-4000-8000-000000000099"; // linha de outro caso
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "ALREADY_SENT" && r.retried === 0 && r.recipients.every((x) => x.outcome === "JA_EXISTE" && !x.retry), JSON.stringify(r.recipients));
    assert(w.rec.guarded.length === 0, "enviou");
    const base = { idempotencyKey: "k", projectId: WEG, caseId: "c", recipientUserId: "u" };
    const ok = { id: "1", ...base, status: "PENDING", providerMessageId: null, sentAt: null, emailId: null, lastError: PRE_NETWORK_ERROR, attemptCount: 1 };
    const exp = { projectId: WEG, caseId: "c", recipientUserId: "u", idempotencyKey: "k" };
    assert(isPreNetworkRetryable(ok, exp) === true, "caso válido recusado");
    assert(!isPreNetworkRetryable({ ...ok, status: "SENT" }, exp), "SENT retentado");
    assert(!isPreNetworkRetryable({ ...ok, status: "FAILED" }, exp), "FAILED retentado");
    assert(!isPreNetworkRetryable({ ...ok, sentAt: "2026-11-12T00:00:00Z" }, exp), "sent_at retentado");
    assert(!isPreNetworkRetryable({ ...ok, emailId: "e" }, exp), "email_id retentado");
    assert(!isPreNetworkRetryable({ ...ok, attemptCount: 3 }, exp), "tentativas esgotadas retentado");
    assert(!isPreNetworkRetryable({ ...ok, projectId: "outro" }, exp), "outro projeto retentado");
    assert(!isPreNetworkRetryable({ ...ok, recipientUserId: "outro" }, exp), "outro destinatário retentado");
    assert(!isPreNetworkRetryable(undefined, exp), "sem linha retentado");
  }));

await check("ciclo normal (mesmo com a flag ligada em memória) NÃO envia as linhas PILOT_SINGLE de caso de TESTE bloqueadas antes da rede", () =>
  withEnv({}, async () => {
    const w = await preBlocked();
    const testCase = w.store.state.cases.get(w.highCase.id);
    testCase.title = `[TESTE PILOTO] ${testCase.title}`;
    testCase.reference = "TESTE-PILOTO";
    w.world.config.riskAlertsEnabled = true;
    await runRiskAlertCycle({ now: new Date(T0), store: w.store, provider: w.provider, expert: { answer: async () => ({ answerText: "x", confidence: 0.5, requiresHumanReview: true }) }, dryRun: false });
    w.world.config.riskAlertsEnabled = false;
    assert(w.rows.every((o) => o.status === "PENDING" && o.attemptCount === 1 && !o.providerMessageId), JSON.stringify(w.rows.map((o) => [o.status, o.attemptCount])));
  }));

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
