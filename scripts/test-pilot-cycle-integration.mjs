// Integração do PILOTO por projeto com o ciclo REAL de alertas (runRiskAlertCycle) e o processador REAL de respostas,
// sobre o store em memória e o FakeEmailProvider (mesma cadeia de guardas do transporte real). Nenhuma rede, nenhum banco, nenhum e-mail.
//
// Prova, no conjunto integrado (modelo de ENTREGA DIRETA com cópia institucional): cada escalão (Responsável, Gestor, Diretoria) chega à PRÓPRIA caixa do colaborador, com Cc em crm@;
// repetições/reenvios idempotentes; envio concorrente sem duplicar (lease do #125); respostas atribuídas a QUEM RESPONDE (From real) e
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

await check("cadeia completa: Responsável, Gestor (T+61) e Diretoria (T+121) chegam cada um à PRÓPRIA caixa, com Cc crm@, nunca a axion@", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    await w.run(T0);
    await w.run(plusMin(T0, 61));
    await w.run(plusMin(T0, 121));
    const outbox = w.store.state.outbox.filter((o) => o.status === "SENT");
    const levels = new Set(outbox.map((o) => o.escalationLevel));
    for (const l of ["RESPONSAVEL", "ESCALAO_1", "DIRETORIA"]) assert(levels.has(l), `faltou ${l} (${[...levels].join(",")})`);
    assert(w.rec.guarded.length === outbox.length && w.rec.guarded.length >= 3, `${w.rec.guarded.length} envios`);
    assert(w.rec.guarded.every((g) => Object.values(EMAIL).includes(g.to)), `destinos: ${[...new Set(w.rec.guarded.map((g) => g.to))].join(",")}`);
    assert(w.rec.guarded.every((g) => JSON.stringify(g.cc) === JSON.stringify([ACC]) && !g.bcc), "Cc institucional ausente ou Bcc presente");
    assert(!w.rec.guarded.some((g) => JSON.stringify(g).includes(BOX)), "axion@ apareceu em alguma mensagem");
    for (const row of outbox) {
      const label = `usuário ${row.recipientUserId.slice(0, 8)}`;
      // Alerta operacional sem faixa de teste: a mensagem do usuário lógico é a que chegou à PRÓPRIA caixa dele.
      const msg = w.rec.guarded.find((g) => g.to === EMAIL[row.recipientUserId]);
      assert(msg, `mensagem do participante ${label} / ${row.escalationLevel}`);
      assert(msg.to === EMAIL[row.recipientUserId], `usuário lógico ${label} não recebeu na própria caixa (${msg.to})`);
    }
    // cada participante lógico distinto aparece em mensagem própria (sem fusão pelo override legado crm@)
    const labels = new Set(w.rec.guarded.map((g) => g.to));
    assert(!w.rec.guarded.some((g) => /PILOTO — TESTE CONTROLADO|\[PILOTO\]/.test(g.subject + g.text)), "faixa de teste em alerta operacional");
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

await check("respostas: cada colaborador responde com a PRÓPRIA identidade; a ação é do REMETENTE real (nunca de outro participante); resposta do ACC e cópia Cc são ignoradas; desconhecido não é autorizado", () =>
  withPilotEnv(async () => {
    const w = makeWorld();
    await w.run(T0);
    await w.run(plusMin(T0, 61));
    const respRow = w.store.state.outbox.find((o) => o.escalationLevel === "RESPONSAVEL" && o.status === "SENT");
    const gestorRow = w.store.state.outbox.find((o) => o.escalationLevel === "ESCALAO_1" && o.status === "SENT");
    const sendOf = (row) => w.rec.guarded.find((g) => g.to === EMAIL[row.recipientUserId]);
    assert(sendOf(respRow)?.replyTo && sendOf(gestorRow)?.replyTo && sendOf(respRow).replyTo !== sendOf(gestorRow).replyTo, "Reply-To distinto por mensagem");
    assert(sendOf(respRow).replyTo.startsWith("crm+alerta-") && sendOf(respRow).to === EMAIL[respRow.recipientUserId], "Reply-To em crm@ e entrega na caixa do próprio colaborador");
    const headers = (from, replyTo, mid, extra = {}) => ({ from, to: [replyTo], messageId: mid, inReplyTo: null, references: [], replyTo: null, autoSubmitted: null, authenticationResults: null, subject: "Re: alerta", ...extra });
    const body = "Estou tomando as providências: equipe acionada, andamento em execução hoje.";
    const status = (id) => w.store.state.messages.find((m) => m.id === id);

    // (a) Gestor responde da PRÓPRIA caixa => ação do Gestor, uma única vez
    const idGestor = w.store.receiveInbound(headers(EMAIL[gestorRow.recipientUserId], sendOf(gestorRow).replyTo, "<resp-gestor@axion.test>"), body, plusMin(T0, 70));
    // (b) a resposta do ACC (From crm@) ao Reply-To NUNCA é atribuída a participante
    const idAcc = w.store.receiveInbound(headers(ACC, sendOf(gestorRow).replyTo, "<resp-acc@axion.test>"), body, plusMin(T0, 71));
    // (c) a CÓPIA Cc entregue em crm@ (From = colaborador, mas marcada X-ACC-Outbound) é ignorada, não é "resposta"
    const idCc = w.store.receiveInbound(headers(EMAIL[respRow.recipientUserId], sendOf(respRow).replyTo, "<copia-cc@axion.test>", { xAccOutbound: "1" }), body, plusMin(T0, 72));
    // (d) remetente desconhecido não é autorizado
    const idUnknown = w.store.receiveInbound(headers("estranho@exemplo.com", sendOf(gestorRow).replyTo, "<resp-estranho@axion.test>"), body, plusMin(T0, 73));
    // (e) Responsável responde à mensagem do GESTOR (outro participante): ação atribuída ao REMETENTE (Responsável), nunca ao Gestor
    const idCross = w.store.receiveInbound(headers(EMAIL[respRow.recipientUserId], sendOf(gestorRow).replyTo, "<resp-cruzada@axion.test>"), "Ciente, tomei ciência.", plusMin(T0, 74));
    w.store.setClock(plusMin(T0, 80));
    await processAlertReplies(w.store, PROJECT_ID, plusMin(T0, 80), [ACC]);

    assert(status(idGestor).status === "PROCESSED" && status(idGestor).senderUserId === gestorRow.recipientUserId, `Gestor: ${status(idGestor).status}/${status(idGestor).senderUserId}`);
    assert(status(idAcc).status === "IGNORED_SELF", `resposta do ACC: ${status(idAcc).status}`);
    assert(status(idCc).status === "IGNORED_SELF", `cópia Cc: ${status(idCc).status}`);
    assert(status(idUnknown).status === "UNAUTHORIZED_REPLY", `desconhecido: ${status(idUnknown).status}`);
    assert(status(idCross).senderUserId === respRow.recipientUserId && status(idCross).senderUserId !== gestorRow.recipientUserId, "resposta cruzada atribuída ao participante errado");
    const events = w.store.state.events.length;
    await processAlertReplies(w.store, PROJECT_ID, plusMin(T0, 90), [ACC]);
    assert(w.store.state.events.length === events, "reprocessar repetiu a ação");
  }));

await check("outro projeto (fora do piloto): comportamento anterior da guarda global — nada vai para axion@, sem Cc institucional e sem faixa de piloto", () =>
  withPilotEnv(async () => {
    const w = makeWorld(OTHER_PROJECT_ID);
    await w.run(T0);
    assert(w.rec.guarded.length >= 1, "ciclo não enviou");
    assert(w.rec.guarded.every((g) => g.to !== BOX), "outro projeto recebeu no destino do piloto");
    assert(!w.rec.guarded.some((g) => g.subject.includes("[PILOTO]") || g.text.includes("Participante simulado")), "faixa do piloto em outro projeto");
    assert(w.rec.guarded.every((g) => !g.cc), "Cc institucional só existe no projeto piloto");
    assert(isProjectPilotActive(OTHER_PROJECT_ID) === false && isProjectPilotActive(PROJECT_ID) === true);
  }));

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
