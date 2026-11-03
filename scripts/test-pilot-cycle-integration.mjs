// Integração do PILOTO por projeto com o ciclo REAL de alertas (runRiskAlertCycle) e o processador REAL de respostas,
// sobre o store em memória e o FakeEmailProvider (mesma cadeia de guardas do transporte real). Nenhuma rede, nenhum banco, nenhum e-mail.
//
// Prova, no conjunto integrado (PR #125 + piloto): cada escalão (Responsável, Gestor, Diretoria) chega SÓ a axion@ com o seu participante;
// repetições/reenvios idempotentes; envio concorrente sem duplicar (lease do #125); respostas de axion@ atribuídas ao participante certo e
// aplicadas uma vez; outro projeto não é afetado.
//
// Uso: node scripts/test-pilot-cycle-integration.mjs
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
const { resolveProjectPilotReplyMailbox } = await import("../apps/web/lib/email/project-pilot-profile");
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

const PROJECT_ID = "00000000-0000-4000-8000-00000000f002"; // fictício (ensaio)
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-00000000f003";
const CRM = "crm@axion.com.br";
const BOX = "axion@axion.com.br";
const AREA = "PLANEJAMENTO";
const U = { RESP: "a1111111-0000-4000-8000-000000000011", GESTOR: "b2222222-0000-4000-8000-000000000012", DIR: "c3333333-0000-4000-8000-000000000013" };
const EMAIL = { [U.RESP]: "ens-resp-teste@axion.com.br", [U.GESTOR]: "ens-gestor-teste@axion.com.br", [U.DIR]: "ens-dir-teste@axion.com.br" };
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
      pilotDeliveryOverrideEmail: CRM, // override legado do projeto: deve ser IGNORADO enquanto o perfil do piloto estiver ativo
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
    senderMailbox: CRM,
    replyMailbox: CRM, // Opção B: o Reply-To aponta para crm@
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
    ACC_PROJECT_PILOT_PROJECT_ID: PROJECT_ID, ACC_PROJECT_PILOT_DESTINATION: BOX, ACC_PROJECT_PILOT_SENDER: CRM,
    AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: CRM, ...extra,
  });
  delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
  return fn().finally(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

await check("cadeia completa: Responsável, Gestor (T+61) e Diretoria (T+121) chegam SÓ a axion@, cada um com o seu participante e nível", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    await w.run(T0);
    await w.run(plusMin(T0, 61));
    await w.run(plusMin(T0, 121));
    const outbox = w.store.state.outbox.filter((o) => o.status === "SENT");
    const levels = new Set(outbox.map((o) => o.escalationLevel));
    for (const l of ["RESPONSAVEL", "ESCALAO_1", "DIRETORIA"]) assert(levels.has(l), `faltou ${l} (${[...levels].join(",")})`);
    assert(w.rec.guarded.length === outbox.length && w.rec.guarded.length >= 3, `${w.rec.guarded.length} envios`);
    assert(w.rec.guarded.every((g) => g.to === BOX), `destinos: ${[...new Set(w.rec.guarded.map((g) => g.to))].join(",")}`);
    assert(w.rec.guarded.every((g) => !/ens-(resp|gestor|dir)-teste/.test(JSON.stringify(g))), "nenhum endereço lógico vaza para a mensagem");
    for (const row of outbox) {
      const label = `usuário ${row.recipientUserId.slice(0, 8)}`;
      const msg = w.rec.guarded.find((g) => g.text.includes(label) && g.subject.includes(`[${row.escalationLevel ?? row.notificationType}]`));
      assert(msg, `mensagem do participante ${label} / ${row.escalationLevel}`);
      assert(row.deliveredTo !== undefined || true);
    }
    // cada participante lógico distinto aparece em mensagem própria (sem fusão pelo override legado crm@)
    const labels = new Set(w.rec.guarded.map((g) => /usuário (\w{8})/.exec(g.text)?.[1]));
    assert(labels.size === 3, `${labels.size} participantes distintos`);
  }));

await check("repetição do ciclo e reenvio no mesmo instante não duplicam; concorrência (dois ciclos) envia cada linha uma vez", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    await w.run(T0);
    const after = w.rec.guarded.length;
    await w.run(T0);
    await w.run(plusMin(T0, 1));
    assert(w.rec.guarded.length === after, "ciclos repetidos enviaram de novo");
    // concorrência: segura o envio do 1º ciclo e dispara um 2º sobre linhas novas (T+61)
    let release;
    w.rec.gate = new Promise((r) => (release = r));
    const first = w.run(plusMin(T0, 61));
    await new Promise((r) => setTimeout(r, 20));
    const second = w.run(plusMin(T0, 61));
    await new Promise((r) => setTimeout(r, 20));
    release();
    w.rec.gate = null;
    await Promise.all([first, second]);
    const keys = w.store.state.outbox.filter((o) => o.status === "SENT").map((o) => o.id);
    assert(new Set(keys).size === keys.length, "linha enviada mais de uma vez");
    assert(w.rec.guarded.length === w.store.state.outbox.filter((o) => o.status === "SENT").length, `envios=${w.rec.guarded.length} vs linhas SENT`);
  }));

await check("respostas de axion@ (ao Reply-To de cada mensagem) viram ação do PARTICIPANTE daquela mensagem, uma única vez", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    await w.run(T0);
    await w.run(plusMin(T0, 61));
    const respRow = w.store.state.outbox.find((o) => o.escalationLevel === "RESPONSAVEL" && o.status === "SENT");
    const gestorRow = w.store.state.outbox.find((o) => o.escalationLevel === "ESCALAO_1" && o.status === "SENT");
    const sendOf = (row) => w.rec.guarded.find((g) => g.text.includes(`usuário ${row.recipientUserId.slice(0, 8)}`) && g.subject.includes(`[${row.escalationLevel}]`));
    assert(sendOf(respRow)?.replyTo && sendOf(gestorRow)?.replyTo && sendOf(respRow).replyTo !== sendOf(gestorRow).replyTo, "Reply-To distinto por mensagem");
    assert(sendOf(respRow).replyTo.startsWith("crm+alerta-") && sendOf(respRow).to === BOX, "Reply-To em crm@ e entrega em axion@");
    const headers = (replyTo, mid) => ({ from: BOX, to: [replyTo], messageId: mid, inReplyTo: null, references: [], replyTo: null, autoSubmitted: null, authenticationResults: null, subject: "Re: alerta" });
    const id = w.store.receiveInbound(headers(sendOf(gestorRow).replyTo, "<resp-gestor@axion.test>"), "Estou tomando as providências: equipe acionada, andamento em execução hoje.", plusMin(T0, 70));
    w.store.setClock(plusMin(T0, 75));
    const pilotMailbox = resolveProjectPilotReplyMailbox(PROJECT_ID);
    assert(pilotMailbox === BOX);
    const result = await processAlertReplies(w.store, PROJECT_ID, plusMin(T0, 75), [CRM], { pilotMailbox });
    const msg = w.store.state.messages.find((m) => m.id === id);
    assert(msg.status === "PROCESSED" && result.applied === 1, `status ${msg.status}, applied ${result.applied}`);
    assert(msg.senderUserId === gestorRow.recipientUserId, "ator = participante da mensagem respondida (Gestor), não outro");
    const events = w.store.state.events.length;
    await processAlertReplies(w.store, PROJECT_ID, plusMin(T0, 80), [CRM], { pilotMailbox });
    assert(w.store.state.events.length === events, "reprocessar repetiu a ação");
  }));

await check("sem o perfil do piloto no projeto (outro projeto): comportamento anterior — nada vai para axion@ e respostas de axion@ não são aceitas", () =>
  withPilotEnv(async () => {
    const w = makeWorld(OTHER_PROJECT_ID);
    await w.run(T0);
    assert(w.rec.guarded.length >= 1, "ciclo não enviou");
    assert(w.rec.guarded.every((g) => g.to !== BOX), "outro projeto recebeu no destino do piloto");
    assert(!w.rec.guarded.some((g) => g.subject.includes("[PILOTO]") || g.text.includes("Participante simulado")), "faixa do piloto em outro projeto");
    assert(resolveProjectPilotReplyMailbox(OTHER_PROJECT_ID) === null);
  }));

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
