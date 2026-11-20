// Frente N4 — envio corporativo e alertas informativos. Sem rede, sem banco real, sem e-mail real (FakeEmailProvider).
//  A. ACEITO PELO PROVEDOR × ENTREGA COMPROVADA (evidência), classificação de falhas.
//  B. Outbox das rotinas especiais (deliverInformative): aceite, duplicidade, retentativa limitada, falha permanente,
//     resultado incerto, falha ao gravar depois do aceite, concorrência, auditoria.
//  C. Layout informativo (sem os quatro botões) × alerta que exige ação (tratamento real: resposta do Orçamento).
//  D. Registros de campo SSMA: falha ao gravar após o aceite não reenvia; falha permanente não é retentada.
//
// Uso: node scripts/test-n4-envio-informativos.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

// Circuito fechado: modo piloto, destinatário único do piloto e trava de destino único (FakeEmailProvider = mesmas travas).
process.env.ACC_OUTBOUND_MODE = "pilot";
process.env.ACC_PILOT_RECIPIENT = "crm@axion.com.br";
process.env.ACC_EMAIL_ONLY_RECIPIENT = "crm@axion.com.br";
process.env.AXION_EMAIL_PROVIDER = "fake";
delete process.env.ACC_PROJECT_PILOT_PROJECT_ID;
register("./ts-module-resolver.mjs", import.meta.url);

const od = await import("../apps/web/lib/email/outbound-delivery.ts");
const inf = await import("../apps/web/lib/email/informative-delivery.ts");
const layout = await import("../apps/web/lib/email/informative-alert.ts");
const content = await import("../apps/web/lib/email/informative-alert-content.ts");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider.ts");
const { FakeEmailProvider, FAKE_FORCED_FAILURE_RECIPIENT } = await import("../apps/web/lib/email/fake-email-provider.ts");
const core = await import("../apps/web/lib/ssma/field-notifications/core.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); failed += 1; }
}
const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const T0 = "2026-11-21T12:00:00.000Z";
const plusH = (h) => new Date(Date.parse(T0) + h * 3600e3).toISOString();
const gmailError = (classification) => new EmailSendError(`GmailEmailProvider: falha. [etapa=SEND http=500 api=n/a motivo=X classe=${classification}]`, { classification, stage: "SEND", httpStatus: 500, apiCode: null, reason: "X", correlationId: null });

console.log("\n=== A. aceite × entrega comprovada; classificação de falhas ===");

await check("A1. sem evidência, só Enviados ou só ausência de devolução: continua ACEITO PELO PROVEDOR (entrega nunca presumida)", () => {
  assert.equal(od.evaluateDeliveryEvidence([], T0), "ACCEPTED_BY_PROVIDER");
  assert.equal(od.evaluateDeliveryEvidence([{ kind: "SENT_COPY_VERIFIED", observedAt: plusH(1), reference: "msg-1" }], T0), "ACCEPTED_BY_PROVIDER");
  assert.equal(od.evaluateDeliveryEvidence([{ kind: "NO_BOUNCE_AFTER_WINDOW", observedAt: plusH(48), reference: "verif-1" }], T0), "ACCEPTED_BY_PROVIDER");
});
await check("A2. Enviados verificado + nenhuma devolução após 24 h => ENTREGUE; janela curta não basta", () => {
  const sent = { kind: "SENT_COPY_VERIFIED", observedAt: plusH(1), reference: "msg-1" };
  assert.equal(od.evaluateDeliveryEvidence([sent, { kind: "NO_BOUNCE_AFTER_WINDOW", observedAt: plusH(25), reference: "v" }], T0), "DELIVERED");
  assert.equal(od.evaluateDeliveryEvidence([sent, { kind: "NO_BOUNCE_AFTER_WINDOW", observedAt: plusH(2), reference: "v" }], T0), "ACCEPTED_BY_PROVIDER");
  assert.equal(od.evaluateDeliveryEvidence([sent, { kind: "NO_BOUNCE_AFTER_WINDOW", observedAt: plusH(25), reference: "v" }], null), "ACCEPTED_BY_PROVIDER", "sem data de aceite não há janela");
});
await check("A3. resposta do destinatário / caixa verificada => ENTREGUE; devolução => DEVOLVIDO; evidência sem referência é ignorada", () => {
  assert.equal(od.evaluateDeliveryEvidence([{ kind: "RECIPIENT_REPLY", observedAt: plusH(3), reference: "gmail-reply-1" }], T0), "DELIVERED");
  assert.equal(od.evaluateDeliveryEvidence([{ kind: "RECIPIENT_MAILBOX_VERIFIED", observedAt: plusH(3), reference: "chk" }], T0), "DELIVERED");
  assert.equal(od.evaluateDeliveryEvidence([{ kind: "RECIPIENT_REPLY", observedAt: plusH(3), reference: "  " }], T0), "ACCEPTED_BY_PROVIDER");
  assert.equal(od.evaluateDeliveryEvidence([{ kind: "RECIPIENT_REPLY", observedAt: plusH(3), reference: "r" }, { kind: "BOUNCE_RECEIVED", observedAt: plusH(1), reference: "ndr" }], T0), "BOUNCED");
});
await check("A4. estado exibível: PENDING/FAILED = não aceito; SENT sem estado = aceito (nunca 'entregue')", () => {
  assert.equal(od.outboundStateOf({ status: "PENDING" }), "NOT_ACCEPTED");
  assert.equal(od.outboundStateOf({ status: "FAILED", deliveryState: null }), "NOT_ACCEPTED");
  assert.equal(od.outboundStateOf({ status: "SENT", deliveryState: null }), "ACCEPTED_BY_PROVIDER");
  assert.equal(od.outboundStateOf({ status: "SENT", deliveryState: "DELIVERED" }), "DELIVERED");
  assert.match(od.OUTBOUND_STATE_LABELS.ACCEPTED_BY_PROVIDER, /entrega não comprovada/);
});
await check("A5. classificação: DEFINITIVE=permanente, UNCERTAIN=incerta (sem retentativa), demais=retentável; limite => EXHAUSTED", () => {
  assert.equal(od.classifySendFailure(gmailError("DEFINITIVE")), "PERMANENT");
  assert.equal(od.classifySendFailure(gmailError("UNCERTAIN")), "UNCERTAIN");
  assert.equal(od.classifySendFailure(gmailError("TEMPORARY")), "RETRYABLE");
  assert.equal(od.classifySendFailure(new EmailSendError("bloqueado antes de qualquer chamada de rede")), "RETRYABLE");
  assert.equal(od.classifySendFailure(new Error("x")), "RETRYABLE");
  assert.deepEqual(od.failureOutcome("RETRYABLE", 2, 5), { failureClass: "RETRYABLE", terminal: false });
  assert.deepEqual(od.failureOutcome("RETRYABLE", 5, 5), { failureClass: "EXHAUSTED", terminal: true });
  assert.deepEqual(od.failureOutcome("UNCERTAIN", 1, 5), { failureClass: "UNCERTAIN", terminal: true });
  assert.deepEqual(od.failureOutcome("PERMANENT", 1, 5), { failureClass: "PERMANENT", terminal: true });
});

console.log("\n=== B. outbox das rotinas especiais ===");

// Armazenamento falso com a MESMA semântica da tabela (chave única, claim condicional, SENT irreversível).
function fakeStore({ failAccept = 0 } = {}) {
  const rows = new Map();
  let acceptFailures = failAccept;
  return {
    rows,
    async ensure(r) {
      if (!rows.has(r.email)) rows.set(r.email, { id: r.email, status: "PENDING", attemptCount: 0, failureClass: null, claimed: false });
      const row = rows.get(r.email);
      return { id: row.id, status: row.status, attemptCount: row.attemptCount, failureClass: row.failureClass };
    },
    async claim(id) {
      const row = rows.get(id);
      await new Promise((r) => setImmediate(r));
      if (!row || row.claimed || row.status === "SENT" || row.attemptCount >= inf.INFORMATIVE_MAX_ATTEMPTS || (row.failureClass && row.failureClass !== "RETRYABLE")) return false;
      row.claimed = true;
      row.attemptCount += 1;
      return true;
    },
    async markAccepted(id, accepted) {
      if (acceptFailures !== 0) { acceptFailures -= 1; throw new Error("banco indisponível"); }
      Object.assign(rows.get(id), { status: "SENT", deliveryState: "ACCEPTED_BY_PROVIDER", providerMessageId: accepted.providerMessageId, failureClass: null, claimed: false });
    },
    async markFailed(id, input) {
      const row = rows.get(id);
      if (row.status === "SENT") return; // nunca regride (o banco também recusa)
      Object.assign(row, { status: "FAILED", failureClass: input.failureClass, lastError: input.error, claimed: false });
    },
  };
}
function harness({ failFor = () => null, store = fakeStore(), delayMs = 0 } = {}) {
  const calls = [];
  const audits = [];
  const provider = new FakeEmailProvider();
  const run = (recipients) =>
    inf.deliverInformative({
      store,
      recipients,
      nowIso: T0,
      label: "Teste",
      audit: async (e) => void audits.push(e),
      deliverMessage: async (r) => {
        calls.push(r.email);
        if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
        const err = failFor(r.email, calls.filter((c) => c === r.email).length);
        if (err) throw err;
        const sent = await provider.send({ to: r.email, subject: "s", text: "t", correlationId: `${r.email}-${calls.length}` });
        return { provider: sent.provider, providerMessageId: sent.providerMessageId, sentAt: sent.sentAt };
      },
    });
  return { run, calls, audits, store };
}
const R = [{ email: "Ana@axion.com.br", name: "Ana" }, { email: "bruno@axion.com.br", name: "Bruno" }];

await check("B1. aceite gravado só após o provedor devolver id; auditoria diz 'aceite não é confirmação de entrega'", async () => {
  const h = harness();
  const s = await h.run(R);
  assert.equal(s.accepted, 2);
  for (const row of h.store.rows.values()) { assert.equal(row.status, "SENT"); assert.equal(row.deliveryState, "ACCEPTED_BY_PROVIDER"); assert.match(row.providerMessageId, /^fake-message-/); }
  assert.ok(h.audits.every((a) => a.action === "INFORMATIVE_EMAIL_ACCEPTED" && /não é confirmação de entrega/.test(a.detail)));
});
await check("B2. duplicidade: nova execução não reenvia; destinatário repetido (maiúsc./minúsc.) recebe um único e-mail", async () => {
  const h = harness();
  await h.run([...R, { email: "ana@AXION.com.br", name: "Ana" }]);
  assert.equal(h.calls.length, 2);
  const again = await h.run(R);
  assert.equal(again.alreadyAccepted, 2);
  assert.equal(h.calls.length, 2, "nenhum reenvio");
});
await check("B3. retentativa LIMITADA: falha transitória repete até 5 tentativas e para (EXHAUSTED, auditada)", async () => {
  const h = harness({ failFor: (e) => (e === "bruno@axion.com.br" ? gmailError("TEMPORARY") : null) });
  for (let i = 0; i < 8; i += 1) await h.run(R);
  assert.equal(h.calls.filter((c) => c === "bruno@axion.com.br").length, inf.INFORMATIVE_MAX_ATTEMPTS);
  const row = h.store.rows.get("bruno@axion.com.br");
  assert.equal(row.status, "FAILED");
  assert.equal(row.failureClass, "EXHAUSTED");
  assert.ok(h.audits.some((a) => a.action === "INFORMATIVE_EMAIL_FAILED" && /EXHAUSTED/.test(a.detail)));
});
await check("B4. falha PERMANENTE: uma única tentativa, linha terminal, sem nova tentativa automática", async () => {
  const h = harness({ failFor: (e) => (e === "bruno@axion.com.br" ? gmailError("DEFINITIVE") : null) });
  const first = await h.run(R);
  assert.equal(first.terminalFailures, 1);
  const second = await h.run(R);
  assert.equal(second.terminalSkipped, 1);
  assert.equal(h.calls.filter((c) => c === "bruno@axion.com.br").length, 1);
  assert.equal(h.store.rows.get("bruno@axion.com.br").failureClass, "PERMANENT");
});
await check("B5. resultado INCERTO (5xx/timeout): nunca retentado automaticamente (evita duplicidade)", async () => {
  const h = harness({ failFor: (e) => (e === "bruno@axion.com.br" ? gmailError("UNCERTAIN") : null) });
  await h.run(R);
  await h.run(R);
  assert.equal(h.calls.filter((c) => c === "bruno@axion.com.br").length, 1);
  assert.equal(h.store.rows.get("bruno@axion.com.br").failureClass, "UNCERTAIN");
});
await check("B6. falha ao GRAVAR depois do aceite: linha não volta à fila (marcada incerta), sem reenvio; uma falha isolada é regravada", async () => {
  const h = harness({ store: fakeStore({ failAccept: -1 }) });
  const s = await h.run([R[0]]);
  assert.equal(s.acceptedUnrecorded, 1);
  assert.equal(h.store.rows.get("ana@axion.com.br").failureClass, "UNCERTAIN");
  await h.run([R[0]]);
  assert.equal(h.calls.length, 1, "nenhum reenvio do que o provedor já aceitou");
  assert.ok(h.audits.some((a) => a.action === "INFORMATIVE_EMAIL_ACCEPTED_UNRECORDED"));
  const once = harness({ store: fakeStore({ failAccept: 1 }) });
  const s2 = await once.run([R[0]]);
  assert.equal(s2.accepted, 1);
  assert.equal(once.store.rows.get("ana@axion.com.br").status, "SENT");
});
await check("B7. concorrência: duas execuções simultâneas enviam UM e-mail por destinatário", async () => {
  const store = fakeStore();
  const h = harness({ store, delayMs: 5 });
  const [a, b] = await Promise.all([h.run(R), h.run(R)]);
  assert.equal(h.calls.length, 2);
  assert.equal(a.accepted + b.accepted, 2);
  assert.equal(a.claimedElsewhere + b.claimedElsewhere + a.alreadyAccepted + b.alreadyAccepted, 2);
});
await check("B8. FakeEmailProvider (mesmas travas do provedor real): falha forçada vira FAILED retentável com motivo limpo", async () => {
  const h = harness();
  const s = await h.run([{ email: FAKE_FORCED_FAILURE_RECIPIENT, name: null }]);
  assert.equal(s.retryableFailures, 1);
  const row = h.store.rows.get(FAKE_FORCED_FAILURE_RECIPIENT);
  assert.equal(row.status, "FAILED");
  assert.match(row.lastError, /falha simulada/);
  assert.ok(!/token|secret/i.test(row.lastError));
  assert.equal(inf.informativeDeliveryOk(s), false);
});

console.log("\n=== C. informativos sem botões × exige ação com tratamento real ===");
const logos = { maroon: true, inverted: true };
const BUTTONS = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"];
const noButtons = (b) => BUTTONS.every((l) => !b.html.includes(`>${l}<`) && !b.text.includes(`${l}:`));
const accident = () => content.buildSsmaAccidentAlertContent({ submissionId: "abcdef12-0000-4000-8000-000000000001", projectName: "WEG — Obra", recipientName: "Ana", severity: "CRITICA", employeeName: "Fulano <b>", leaveClassification: "Com afastamento", occurredAt: "20/11/2026 10:00", informedCause: "queda", consultUrl: "https://acc.axion.com.br/p/ssma-registros", footer: "f", logos });
const health = () => content.buildSystemHealthAlertContent({ projectName: "WEG", sourceType: "GMAIL", summary: "Token expirado", auditUrl: "https://acc.axion.com.br/p/auditoria?tipo=INTEGRACOES", footer: "f", logos });
const version = (isDesignatedBudgetReviewer) => content.buildVersionImpactReviewContent({ recipientName: "Ana", projectName: "WEG", documentName: "Planta A", previousRevision: "R01", newRevision: "R02", scheduleImpact: "SIM", priceImpact: "NAO", response: "Análise do planejamento", sentToBudget: true, isDesignatedBudgetReviewer, accUrl: "https://acc.axion.com.br/p/integracoes", footer: "f", logos });

await check("C1. acidente: INFORMATIVO, sem os quatro botões, sem 'Responder ao ACC', só consulta em Registros SSMA", () => {
  const b = accident();
  assert.equal(b.nature, "INFORMATIVE");
  assert.ok(noButtons(b));
  assert.ok(!/RESPONDER AO ACC/i.test(b.html + b.text));
  assert.ok(b.html.includes("ALERTA INFORMATIVO") && b.html.includes("CONSULTAR REGISTROS SSMA") && b.html.includes("/p/ssma-registros"));
  assert.ok(b.html.includes("Fulano &lt;b&gt;"), "conteúdo escapado");
  assert.match(b.subject, /RISCO CRÍTICO.*INFORMATIVO/);
  assert.ok(b.text.includes(layout.INFORMATIVE_NOTICE));
});
await check("C2. falha técnica: INFORMATIVO, sem botões, link CONSULTAR AUDITORIA", () => {
  const b = health();
  assert.equal(b.nature, "INFORMATIVE");
  assert.ok(noButtons(b));
  assert.ok(b.html.includes("CONSULTAR AUDITORIA") && /FALHA OPERACIONAL.*INFORMATIVO/.test(b.subject));
});
await check("C3. impacto de versão — gestão: INFORMATIVO; orçamentista designado: EXIGE AÇÃO com o tratamento real (Integrações)", () => {
  const g = version(false);
  assert.equal(g.nature, "INFORMATIVE");
  assert.ok(noButtons(g) && !g.html.includes("REGISTRAR RESPOSTA DO ORÇAMENTO"));
  const o = version(true);
  assert.equal(o.nature, "ACTION_REQUIRED");
  assert.ok(noButtons(o), "nem o alerta que exige ação usa os quatro botões do caso de risco");
  assert.ok(o.html.includes("AÇÃO NECESSÁRIA") && o.html.includes("REGISTRAR RESPOSTA DO ORÇAMENTO") && o.html.includes("/p/integracoes"));
  assert.match(o.subject, /AÇÃO DO ORÇAMENTO/);
});
await check("C4. o tratamento real existe: RPC de resposta do Orçamento, ação de servidor e formulário em Integrações", () => {
  assert.match(rd("supabase/migrations/20260911100000_special_routines_accident.sql"), /create or replace function public\.submit_construmanager_budget_response/);
  assert.match(rd("apps/web/app/[projectId]/integracoes/version-impact-actions.ts"), /submit_construmanager_budget_response/);
  assert.match(rd("apps/web/components/integrations/construmanager-version-impact-form.tsx"), /submitBudgetResponseAction/);
});
await check("C5. guarda: 'exige ação' sem tratamento (link) é recusado; link inseguro é recusado", () => {
  const base = { recipientName: null, projectName: "W", severity: "ALTA", areaLabel: "x", title: "t", description: "d", details: [], consultLink: { label: "C", url: "https://acc.axion.com.br/x" }, footer: "f", logos, subject: "s" };
  assert.throws(() => layout.buildInformativeAlertEmail({ ...base, nature: "ACTION_REQUIRED", action: null }), /tratamento operacional real/);
  assert.throws(() => layout.buildInformativeAlertEmail({ ...base, nature: "ACTION_REQUIRED", action: { link: { label: "A", url: "javascript:alert(1)" }, instruction: "i" } }), /tratamento operacional real/);
  assert.throws(() => layout.buildInformativeAlertEmail({ ...base, nature: "INFORMATIVE", consultLink: { label: "C", url: "mailto:x@y" } }), /consulta inválido/);
  assert.equal(layout.classifyInformativeAlert("SSMA_ACCIDENT"), "INFORMATIVE");
  assert.equal(layout.classifyInformativeAlert("SYSTEM_HEALTH"), "INFORMATIVE");
  assert.equal(layout.classifyInformativeAlert("VERSION_IMPACT_REVIEW", { isDesignatedBudgetReviewer: false }), "INFORMATIVE");
});
await check("C6. código-fonte: emissores e chamadores usam a outbox (sem SENT gravado à mão; destinatários inalterados)", () => {
  const route = rd("apps/web/app/api/ssma/accident-notifications/route.ts");
  const actions = rd("apps/web/app/[projectId]/integracoes/version-impact-actions.ts");
  const special = rd("apps/web/lib/email/special-routine-deliveries.ts");
  for (const src of [route, actions]) assert.ok(!/status: "SENT"/.test(src), "SENT só pelo store da outbox");
  assert.match(actions, /deliverVersionReviewNotifications\(/);
  assert.match(route, /deliverAccidentNotifications\(/);
  assert.match(special, /m\.area === "ENGENHARIA" \|\| \(withLeave && m\.area === "COMERCIAL"\)/);
  assert.match(special, /membership\.permission === "GERENTE" \|\| membership\.area === "DIRETORIA"/);
  assert.ok(!/actor_label: "/.test(route + special), "SYSTEM sem actor_label");
  const health = rd("apps/web/app/api/cron/system-health/route.ts");
  assert.match(health, /sweepSpecialRoutineRetries\(/);
  assert.match(health, /deliverSystemHealthIncident\(/);
});

console.log("\n=== D. registros de campo SSMA ===");
function ssmaStore({ markSentFails = 0 } = {}) {
  const rows = new Map();
  let fails = markSentFails;
  return {
    rows,
    async ensureDelivery(key, r) { if (!rows.has(r.email)) rows.set(r.email, { id: r.email, status: "PENDING", attemptCount: 0, failureClass: null }); const x = rows.get(r.email); return { ...x }; },
    async ensureSuppressed() {},
    async claim(id) { const x = rows.get(id); if (!["PENDING", "FAILED"].includes(x.status) || (x.failureClass && x.failureClass !== "RETRYABLE")) return false; x.attemptCount += 1; return true; },
    async markSent(id) { if (fails !== 0) { fails -= 1; throw new Error("db"); } rows.get(id).status = "SENT"; },
    async markFailed(id, error, failureClass) { const x = rows.get(id); if (x.status === "SENT") return; Object.assign(x, { status: "FAILED", error, failureClass }); },
  };
}
const KEY = { projectId: "p1", recordId: "r1", actionId: null, event: "CRITICAL_RECORD", eventDate: "2026-11-21" };
const mail = { subject: "s", text: "t", html: "<p>t</p>" };
async function ssmaRun(store, deliverImpl) {
  let calls = 0;
  const deps = { store, audit: async () => {}, mailer: { async deliver(i) { calls += 1; return deliverImpl(i, calls); } } };
  const summary = await core.notifyEvent(deps, { key: KEY, recipients: [{ userId: "u1", name: "Ana", email: "ana@axion.com.br" }], content: () => mail, entityLabel: "registro" });
  return { summary, calls: () => calls };
}
await check("D1. aceito pelo provedor e falha ao gravar: NÃO volta a FAILED retentável (sem reenvio)", async () => {
  const store = ssmaStore({ markSentFails: -1 });
  const ok = async () => ({ providerMessageId: "g1", sentAt: T0 });
  await ssmaRun(store, ok);
  const row = store.rows.get("ana@axion.com.br");
  assert.equal(row.failureClass, "UNCERTAIN");
  const again = await ssmaRun(store, ok);
  assert.equal(again.calls(), 0, "nenhum reenvio");
});
await check("D2. falha PERMANENTE do provedor: linha terminal, não retentada na execução seguinte", async () => {
  const store = ssmaStore();
  await ssmaRun(store, async () => { throw gmailError("DEFINITIVE"); });
  assert.equal(store.rows.get("ana@axion.com.br").failureClass, "PERMANENT");
  const again = await ssmaRun(store, async () => ({ providerMessageId: "g", sentAt: T0 }));
  assert.equal(again.calls(), 0);
  assert.equal(again.summary.skipped, 1);
});
await check("D3. falha transitória continua retentável (RETRYABLE) e o envio seguinte grava SENT", async () => {
  const store = ssmaStore();
  await ssmaRun(store, async () => { throw gmailError("TEMPORARY"); });
  assert.equal(store.rows.get("ana@axion.com.br").failureClass, "RETRYABLE");
  await ssmaRun(store, async () => ({ providerMessageId: "g", sentAt: T0 }));
  assert.equal(store.rows.get("ana@axion.com.br").status, "SENT");
});

console.log("");
console.log(`Resultado: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
