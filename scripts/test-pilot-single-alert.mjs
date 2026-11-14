// Execução manual ÚNICA do piloto WEG (runPilotSingleAlert) sobre o store em memória e o provider simulado, com a MESMA cadeia
// de guardas do transporte real. Nenhuma rede, nenhum banco, nenhum e-mail.
// Uso: node scripts/test-pilot-single-alert.mjs
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

const { runPilotSingleAlert, MAX_PILOT_SINGLE_RECIPIENTS, authorizePilotSingleRequest, PILOT_SINGLE_CASE_ENV, PILOT_SINGLE_RECIPIENT_ENV } = await import("../apps/web/lib/risk-alerts/run-pilot-single-alert");
const { runRiskAlertCycle } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const { classifyGmailSendError, formatGmailSendDiagnostic } = await import("../apps/web/lib/email/gmail-send-error");
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

// Amostras do diagnóstico REAL gravado em last_error após contato com o Gmail (todas as classes) — nenhuma pode ser retentável.
const GMAIL_ERR = (status, reason) => ({ response: { status, data: { error: { errors: [{ reason }] } }, headers: {} }, config: { url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" } });
const DIAG_SAMPLES = [
  ["HTTP 400", GMAIL_ERR(400, "invalidArgument")],
  ["HTTP 403 API desativada", GMAIL_ERR(403, "accessNotConfigured")],
  ["HTTP 429", GMAIL_ERR(429, "rateLimitExceeded")],
  ["HTTP 503", GMAIL_ERR(503, "backendError")],
  ["timeout", { code: "ETIMEDOUT", config: { url: "https://gmail.googleapis.com/x" } }],
  ["erro sem estrutura", {}],
].map(([n, err]) => [n, `GmailEmailProvider: falha ao enviar via Gmail API. ${formatGmailSendDiagnostic(classifyGmailSendError(err))}`]);
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

await check("rota: exige cron-secret ANTES; delega a autorização (caso + destinatário) a authorizePilotSingleRequest; ramo único não chama o ciclo normal", async () => {
  const src = fs.readFileSync(new URL("../apps/web/app/api/cron/risk-alerts/route.ts", import.meta.url), "utf8");
  assert(/isCronRequestAuthorized\(request, process\.env\[RISK_ALERTS_CRON_SECRET_ENV\]\)/.test(src), "autenticação removida");
  assert(src.indexOf("isCronRequestAuthorized") < src.indexOf("authorizePilotSingleRequest(url.searchParams)"), "autenticação deve vir antes");
  assert(/if \(!pilotSingle\.ok\) return Response\.json\(\{ error: pilotSingle\.error \}, \{ status: pilotSingle\.status \}\)/.test(src), "403 não propagado");
  assert(/recipientUserId: pilotSingle\.recipientUserId/.test(src), "rota não repassa o destinatário ao motor");
  const branch = src.slice(src.indexOf("const pilotSingle = authorizePilotSingleRequest"), src.indexOf("return Response.json(single"));
  assert(branch.length > 50 && !/runRiskAlertCycle/.test(branch), "ramo único chama o ciclo normal");
  const wf = fs.readFileSync(new URL("../.github/workflows/pilot-single-alert.yml", import.meta.url), "utf8");
  assert(!/schedule:/.test(wf) && /workflow_dispatch:/.test(wf) && /refs\/heads\/main/.test(wf) && /ENVIAR-UMA-VEZ/.test(wf), "workflow fora do padrão");
  assert(!/\$\{\{ *secrets\.[A-Z_]+ *\}\}[^\n]*\?/.test(wf), "segredo em URL");
});

await check("autorização no servidor: dry-run sem armamento; real exige caso armado e, com destinatário selecionado, destinatário armado (ambos idênticos)", () => {
  const C = "0dc108da-409d-4792-907c-b21015d4e5ac";
  const P = (o) => new URLSearchParams(o);
  assert(authorizePilotSingleRequest(P({})) === null && authorizePilotSingleRequest(P({ dryRun: "1" })) === null, "requisição normal tratada como envio único");
  const dry = authorizePilotSingleRequest(P({ pilotSingleCase: C, dryRun: "1", pilotSingleRecipient: U.jaime.toUpperCase() }), {});
  assert(dry.ok && dry.dryRun && dry.recipientUserId === U.jaime, "dry-run exigiu armamento ou não repassou o destinatário");
  const arm = { [PILOT_SINGLE_CASE_ENV]: C, [PILOT_SINGLE_RECIPIENT_ENV]: U.jaime };
  assert(authorizePilotSingleRequest(P({ pilotSingleCase: C }), {}).status === 403, "real sem caso armado");
  assert(authorizePilotSingleRequest(P({ pilotSingleCase: C }), { [PILOT_SINGLE_CASE_ENV]: "DESARMADO" }).status === 403, "caso desarmado");
  assert(authorizePilotSingleRequest(P({ pilotSingleCase: C, pilotSingleRecipient: U.jaime }), { [PILOT_SINGLE_CASE_ENV]: C }).status === 403, "destinatário não armado");
  assert(authorizePilotSingleRequest(P({ pilotSingleCase: C, pilotSingleRecipient: U.rey }), arm).status === 403, "destinatário divergente do armado");
  assert(authorizePilotSingleRequest(P({ pilotSingleCase: "99999999-0000-4000-8000-000000000099", pilotSingleRecipient: U.jaime }), arm).status === 403, "caso divergente do armado");
  const ok = authorizePilotSingleRequest(P({ pilotSingleCase: C.toUpperCase(), pilotSingleRecipient: ` ${U.jaime.toUpperCase()} ` }), arm);
  assert(ok.ok && !ok.dryRun && ok.recipientUserId === U.jaime, JSON.stringify(ok));
  const blank = authorizePilotSingleRequest(P({ pilotSingleCase: C, pilotSingleRecipient: "  " }), { [PILOT_SINGLE_CASE_ENV]: C });
  assert(blank.ok && blank.recipientUserId === null, "destinatário em branco deveria virar null (e o motor exige seleção no destino exclusivo)");
});

// ---------------------------------------------------------------------------------------------------------------
// Reentrada ESTREITA: a mesma linha bloqueada ANTES de qualquer chamada de rede pode ser retentada; nada mais.
// ---------------------------------------------------------------------------------------------------------------
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
    assert(again.status === "BLOCKED" && again.blockedReason === "RECIPIENT_ALREADY_PROCESSED_NOT_RETRYABLE" && again.recipients[0].outcome === "JA_EXISTE" && w.rec.guarded.length === 1, "reenviou a mesma mensagem");
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
    assert(again.status === "BLOCKED" && again.blockedReason === "RECIPIENT_ALREADY_PROCESSED_NOT_RETRYABLE" && w.rec.guarded.length === 1, "reenviou");
  }));

await check("propagação REAL workflow -> rota -> motor: o script do workflow monta a URL; a autorização do servidor a aceita; o motor envia UMA mensagem", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const wf = fs.readFileSync(new URL("../.github/workflows/pilot-single-alert.yml", import.meta.url), "utf8").split(/\r?\n/);
    const at = wf.findIndex((l) => /^\s*run: \|\s*$/.test(l));
    assert(at > 0, "script do workflow não encontrado");
    const script = wf.slice(at + 1).map((l) => l.replace(/^ {10}/, "")).join("\n");
    const prelude = 'curl() { local a last out=""; for a in "$@"; do last="$a"; done; while [ $# -gt 0 ]; do [ "$1" = "--output" ] && out="$2"; shift; done; printf "%s" "$last" > url.txt; echo "{}" > "$out"; echo 200; }\n';
    const CASE = "0dc108da-409d-4792-907c-b21015d4e5ac";
    const runWf = (inputs) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
      const r = spawnSync("bash", ["-c", prelude + script], {
        cwd: dir,
        env: { PATH: process.env.PATH, ACC_APP_BASE_URL: "https://acc.invalid", ACC_RISK_ALERTS_CRON_SECRET: "dummy", CASE_ID: CASE, MODE: "dry-run", CONFIRM: "", RECIPIENT_USER_ID: "", ...inputs },
        encoding: "utf8",
      });
      const urlFile = path.join(dir, "url.txt");
      const url = fs.existsSync(urlFile) ? fs.readFileSync(urlFile, "utf8") : null;
      fs.rmSync(dir, { recursive: true, force: true });
      return { code: r.status, url, err: `${r.stdout}${r.stderr}` };
    };
    // validações do workflow: send sem confirmação, send sem destinatário, UUID inválido => falha ANTES de chamar a rota
    assert(runWf({ MODE: "send", RECIPIENT_USER_ID: U.jaime }).code !== 0 && runWf({ MODE: "send", RECIPIENT_USER_ID: U.jaime }).url === null, "send sem confirmação chamou a rota");
    const noRec = runWf({ MODE: "send", CONFIRM: "ENVIAR-UMA-VEZ" });
    assert(noRec.code !== 0 && noRec.url === null, `send sem destinatário chamou a rota: ${noRec.err}`);
    assert(runWf({ MODE: "send", CONFIRM: "ENVIAR-UMA-VEZ", RECIPIENT_USER_ID: "nao-uuid" }).url === null, "UUID inválido chamou a rota");
    // dry-run: a URL carrega caso, dryRun=1 e o destinatário; segredo NUNCA na URL
    const dry = runWf({ MODE: "dry-run", RECIPIENT_USER_ID: U.jaime });
    assert(dry.code === 0 && dry.url, `dry-run do workflow falhou: ${dry.err}`);
    const dUrl = new URL(dry.url);
    assert(dUrl.pathname === "/api/cron/risk-alerts" && !dry.url.includes("dummy"), "URL fora do esperado ou com segredo");
    const dDec = authorizePilotSingleRequest(dUrl.searchParams, {});
    assert(dDec.ok && dDec.dryRun && dDec.caseId === CASE && dDec.recipientUserId === U.jaime, JSON.stringify(dDec));
    // send: a URL NÃO tem dryRun, carrega caso+destinatário; o servidor só autoriza com os DOIS armamentos
    const send = runWf({ MODE: "send", CONFIRM: "ENVIAR-UMA-VEZ", RECIPIENT_USER_ID: U.jaime });
    assert(send.code === 0 && send.url, `send do workflow falhou: ${send.err}`);
    const sUrl = new URL(send.url);
    assert(!sUrl.searchParams.has("dryRun") && sUrl.searchParams.get("pilotSingleRecipient") === U.jaime, "URL do send fora do esperado");
    assert(authorizePilotSingleRequest(sUrl.searchParams, { [PILOT_SINGLE_CASE_ENV]: CASE }).status === 403, "send autorizado sem armar o destinatário");
    const arm = { [PILOT_SINGLE_CASE_ENV]: "cccccccc-0000-4000-8000-000000000001", [PILOT_SINGLE_RECIPIENT_ENV]: U.jaime };
    const w = await seeded();
    const sUrl2 = new URL(send.url.replace(CASE, w.highCase.id));
    const dec = authorizePilotSingleRequest(sUrl2.searchParams, arm);
    assert(dec.ok && !dec.dryRun && dec.recipientUserId === U.jaime, JSON.stringify(dec));
    const r = await runPilotSingleAlert({ caseId: dec.caseId, dryRun: dec.dryRun, recipientUserId: dec.recipientUserId, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "EXECUTED" && r.sent === 1 && w.rec.guarded.length === 1 && String(w.rec.guarded[0].to).trim().toLowerCase() === BOX && !w.rec.guarded[0].cc && !w.rec.guarded[0].bcc, JSON.stringify(r));
  }));

await check("seleção: zero mensagens elegíveis => BLOQUEIO explícito (inelegível, já processada, entrega possível, SENT); nada é enviado nem alterado", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    // inelegível (membro inativo)
    const a = await seeded();
    a.world.recipients.set(U.carlos, { userId: U.carlos, name: "Carlos", email: EMAIL[U.carlos], membershipStatus: "INACTIVE" });
    const ra = await runPilotSingleAlert({ caseId: a.highCase.id, recipientUserId: U.carlos, now: new Date(T0), store: a.store, provider: a.provider });
    assert(ra.status === "BLOCKED" && ra.blockedReason === "RECIPIENT_NOT_ELIGIBLE" && ra.sent === 0, JSON.stringify(ra));
    assert(a.rec.guarded.length === 0 && a.store.state.outbox.length === a.seedOutbox, "inelegível escreveu/enviou");
    // linhas pré-rede criadas pelo app em modo grupo; depois cada variação de risco de entrega anterior
    const variants = [
      ["erro incerto sem marcador", (o) => { o.lastError = "timeout aguardando resposta do Gmail"; }],
      ...DIAG_SAMPLES.map(([n, text]) => [`diagnóstico Gmail pós-rede (${n})`, (o) => { o.lastError = text; }]),
      ["last_error nulo", (o) => { o.lastError = null; }],
      ["provider_message_id preenchido", (o) => { o.providerMessageId = "msg-qualquer"; }],
      ["sent_at preenchido", (o) => { o.sentAt = "2026-11-13T12:00:00.000Z"; }],
      ["status SENT", (o) => { o.status = "SENT"; }],
      ["tentativas esgotadas", (o) => { o.attemptCount = 3; }],
    ];
    for (const [label, mutate] of variants) {
      const w = await withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" }, () => preBlocked());
      prodLikeSnapshot(w.store);
      const row = w.rows.find((o) => o.idempotencyKey.endsWith(U.jaime));
      mutate(row);
      const fp = () => JSON.stringify(w.store.state.outbox.map((o) => [o.id, o.status, o.attemptCount, o.lastError, o.providerMessageId, o.sentAt]));
      const before = fp();
      const r = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider });
      assert(r.status === "BLOCKED" && r.blockedReason === "RECIPIENT_ALREADY_PROCESSED_NOT_RETRYABLE" && r.sent === 0 && r.retried === 0, `${label}: ${JSON.stringify(r)}`);
      assert(w.rec.guarded.length === 0, `${label}: enviou`);
      assert(fp() === before, `${label}: a outbox mudou`);
    }
  }));

await check("falha do Gmail pós-rede: diagnóstico no resultado; a linha fica bloqueada (sem retentativa, sem novo envio) mesmo com 6 execuções simultâneas", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    for (const [label, text] of DIAG_SAMPLES) {
      const w = await seeded();
      let calls = 0;
      const failing = { send: async () => { calls += 1; throw new EmailSendError(text); } };
      const fp = () => JSON.stringify(w.store.state.outbox.map((o) => [o.id, o.status, o.attemptCount, o.lastError, o.providerMessageId, o.sentAt]));
      const first = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: failing });
      assert(first.status === "EXECUTED" && first.sent === 0 && first.failed === 1 && calls === 1, `${label}: ${JSON.stringify(first)}`);
      const diag = first.recipients[0].failureDiagnostic;
      assert(typeof diag === "string" && text.endsWith(diag) && /^\[etapa=/.test(diag), `${label}: diagnóstico ausente/incorreto: ${diag}`);
      const row = w.store.state.outbox.find((o) => o.idempotencyKey.endsWith(`:PILOT_SINGLE:${U.jaime}`));
      assert(row && row.status === "PENDING" && !row.providerMessageId && !row.sentAt && row.attemptCount >= 1 && !row.lastError.includes(PILOT_SINGLE_PRE_NETWORK_MARKER), `${label}: linha inesperada ${JSON.stringify(row)}`);
      const before = fp();
      const again = await Promise.all(Array.from({ length: 6 }, () => runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: failing })));
      assert(again.every((r) => r.status === "BLOCKED" && r.blockedReason === "RECIPIENT_ALREADY_PROCESSED_NOT_RETRYABLE" && r.sent === 0 && r.retried === 0), `${label}: ${JSON.stringify(again.map((r) => [r.status, r.blockedReason]))}`);
      assert(calls === 1, `${label}: reenviou (${calls} chamadas)`);
      assert(fp() === before, `${label}: a outbox mudou`);
    }
  }));

await check("seleção: allowlist com a MESMA pessoa duplicada (inclusive em caixa diferente) gera UMA mensagem, em seleção e em modo grupo", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const w = await seeded();
    w.world.config.pilotRecipientAllowlistUserIds = [U.jaime, U.jaime.toUpperCase(), U.rey];
    const r = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider });
    assert(r.status === "EXECUTED" && r.sent === 1 && r.recipients.length === 1 && w.rec.guarded.length === 1, JSON.stringify(r));
    assert(w.store.state.outbox.filter((o) => o.idempotencyKey.includes(":PILOT_SINGLE:")).length === 1, "mais de uma linha para a mesma pessoa");
    const g = await withEnv({}, async () => {
      const w2 = await seeded();
      w2.world.config.pilotRecipientAllowlistUserIds = [U.rey, U.rey.toUpperCase(), U.jaime];
      const r2 = await runPilotSingleAlert({ caseId: w2.highCase.id, now: new Date(T0), store: w2.store, provider: w2.provider });
      return { r2, sent: w2.rec.guarded.length };
    });
    assert(g.r2.recipients.length === 2 && g.r2.sent === 2 && g.sent === 2, "modo grupo não deduplicou");
  }));

await check("CONCORRÊNCIA: 6 execuções simultâneas da MESMA mensagem selecionada => exatamente UM envio; linha SENT com 1 tentativa; demais linhas intocadas", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const w = await withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" }, () => preBlocked());
    prodLikeSnapshot(w.store);
    const chosen = w.rows.find((o) => o.idempotencyKey.endsWith(U.jaime));
    const others = w.rows.filter((o) => o !== chosen);
    const fp = (o) => JSON.stringify([o.id, o.status, o.attemptCount, o.lastError, o.providerMessageId, o.sentAt]);
    const before = others.map(fp).sort();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, dryRun: i === 5, now: new Date(T0), store: w.store, provider: w.provider }))
    );
    const sentTotal = results.reduce((n, r) => n + r.sent, 0);
    assert(sentTotal === 1 && w.rec.guarded.length === 1, `enviados=${sentTotal} mensagens=${w.rec.guarded.length} ${JSON.stringify(results.map((r) => [r.status, r.sent, r.recipients.map((x) => x.outcome)]))}`);
    assert(chosen.status === "SENT" && chosen.attemptCount === 2, `linha escolhida: ${fp(chosen)}`); // 1 tentativa pré-rede + 1 envio
    assert(JSON.stringify(others.map(fp).sort()) === JSON.stringify(before), "outras linhas mudaram");
    assert(w.store.state.outbox.filter((o) => o.idempotencyKey.includes(":PILOT_SINGLE:")).length === 3, "criou/apagou linha");
    const again = await runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider });
    assert(again.status === "BLOCKED" && again.blockedReason === "RECIPIENT_ALREADY_PROCESSED_NOT_RETRYABLE" && w.rec.guarded.length === 1, "reenviou depois de SENT");
  }));

await check("CONCORRÊNCIA (mensagem nova, sem linha prévia): 6 execuções simultâneas => exatamente UM envio e UMA linha", () =>
  withEnv({ ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const w = await seeded();
    const results = await Promise.all(Array.from({ length: 6 }, () => runPilotSingleAlert({ caseId: w.highCase.id, recipientUserId: U.jaime, now: new Date(T0), store: w.store, provider: w.provider })));
    const sentTotal = results.reduce((n, r) => n + r.sent, 0);
    assert(sentTotal === 1 && w.rec.guarded.length === 1, `enviados=${sentTotal} mensagens=${w.rec.guarded.length}`);
    const rows = w.store.state.outbox.filter((o) => o.idempotencyKey.includes(":PILOT_SINGLE:"));
    assert(rows.length === 1 && rows[0].status === "SENT" && rows[0].attemptCount === 1, JSON.stringify(rows.map((o) => [o.status, o.attemptCount])));
  }));

await check("plumbing: a rota repassa pilotSingleRecipient e o workflow exige recipient_user_id (UUID) em mode=send", () => {
  const route = fs.readFileSync(new URL("../apps/web/app/api/cron/risk-alerts/route.ts", import.meta.url), "utf8");
  const engine = fs.readFileSync(new URL("../apps/web/lib/risk-alerts/run-pilot-single-alert.ts", import.meta.url), "utf8");
  assert(/pilotSingleRecipient/.test(engine) && /recipientUserId/.test(route), "seleção não repassada rota -> motor");
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
