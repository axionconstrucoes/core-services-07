// WhatsApp SIMULADO: configuração, decisão, orquestração, os dois ganchos (ciclo e botão manual), revogação/desativação antes do
// disparo e concorrência sem duplicação. Sem rede, sem banco, sem credencial: tudo com provedor e armazenamento falsos.
// Limite declarado: o ciclo/Server Action reais (Supabase + Next) não rodam aqui; os ganchos são exercitados pelas funções
// extraídas (lib/whatsapp/hooks.ts) e o encaixe nos pontos de chamada é conferido de forma estrutural.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const { getWhatsappConfig } = await import("../apps/web/lib/whatsapp/config");
const { decideDirectorateWhatsapp } = await import("../apps/web/lib/whatsapp/decide");
const { runCycleEscalationHook, runManualEscalationHook } = await import("../apps/web/lib/whatsapp/hooks");
const { notifyDirectorateWhatsapp } = await import("../apps/web/lib/whatsapp/notify-directorate");
const { maskPhone, normalizeInternationalPhone } = await import("../apps/web/lib/whatsapp/phone");
const { SimulatedWhatsappProvider } = await import("../apps/web/lib/whatsapp/simulated-provider");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const lib = path.join(root, "lib", "whatsapp");
const ON = { ACC_WHATSAPP_ENABLED: "true" };
const ELIGIBLE = { phoneE164: "+5527999990000", channelAuthorized: true, activeMember: true, diretoriaMember: true };
const INPUT = {
  projectId: "p1", projectName: "Obra", recipientUserId: "u1", sourceType: "SLA_ACTION", sourceId: "a1",
  riskLevel: "CRITICAL", newLevel: "DIRETORIA", alertTitle: "Fio exposto", alertUrl: "https://acc.example/p1/acoes/a1",
};

/** Armazenamento falso com a mesma semântica do banco: chave única, inserção atômica, contato lido a CADA envio. */
function harness({ contact = ELIGIBLE, env = ON, latency = false } = {}) {
  const log = new Map();
  const state = { contact, loads: 0, audits: [], provider: new SimulatedWhatsappProvider() };
  return {
    state, log,
    deps: {
      env, provider: state.provider,
      loadContact: async () => { state.loads += 1; if (latency) await new Promise((r) => setTimeout(r, 5)); return state.contact; },
      record: async (row) => { if (log.has(row.idempotencyKey)) return { inserted: false }; log.set(row.idempotencyKey, row); return { inserted: true }; },
      audit: async (_p, action, _id, detail) => { state.audits.push({ action, detail }); },
    },
  };
}
const notifierFor = (h) => (input) => notifyDirectorateWhatsapp(input, h.deps);

test("desativado por padrão: sem variável, valor diferente de 'true' ou provedor desconhecido", async () => {
  assert.equal(getWhatsappConfig({}).enabled, false);
  for (const v of ["TRUE", "1", "yes", "false", ""]) assert.equal(getWhatsappConfig({ ACC_WHATSAPP_ENABLED: v }).enabled, false);
  assert.deepEqual(getWhatsappConfig({ ...ON, ACC_WHATSAPP_PROVIDER: "twilio" }), { enabled: false, reason: "PROVIDER_UNSUPPORTED" });
  assert.deepEqual(getWhatsappConfig(ON), { enabled: true, provider: "simulated" });
  const h = harness({ env: {} });
  assert.deepEqual(await notifyDirectorateWhatsapp(INPUT, h.deps), { outcome: "IGNORED", reason: "DISABLED" });
  assert.equal(h.state.loads + h.log.size + h.state.provider.sent.length, 0, "desligado não consulta, não registra e não envia");
});

test("só CRÍTICO na DIRETORIA: outros riscos e níveis são ignorados sem consulta nem registro", async () => {
  for (const [field, values] of [["riskLevel", ["LOW", "MEDIUM", "HIGH"]], ["newLevel", ["RESPONSAVEL", "ESCALAO_1", "ESCALAO_2"]]]) {
    for (const value of values) {
      const h = harness();
      const r = await notifyDirectorateWhatsapp({ ...INPUT, [field]: value }, h.deps);
      assert.equal(r.outcome, "IGNORED");
      assert.equal(h.state.loads + h.log.size + h.state.provider.sent.length, 0);
    }
  }
});

test("CRÍTICO na Diretoria com pessoa elegível: mensagem SIMULADA, registrada e auditada sem o telefone completo", async () => {
  const h = harness();
  const r = await notifyDirectorateWhatsapp(INPUT, h.deps);
  assert.equal(r.outcome, "SIMULATED");
  assert.match(r.providerMessageId, /^simulated:/);
  assert.deepEqual(h.state.provider.sent.map((m) => m.to), ["+5527999990000"]);
  assert.match(h.state.provider.sent[0].text, /CRÍTICO.*Diretoria.*Fio exposto.*https:\/\/acc\.example/);
  assert.equal([...h.log.values()][0].phoneMasked, "+55*******0000");
  assert.ok(!JSON.stringify(h.state.audits).includes("5527999990000"));
});

test("elegibilidade: sem contato, sem vínculo ativo, fora da Diretoria, canal não autorizado ou telefone inválido => não envia e registra o motivo", async () => {
  const cases = [
    [null, "NO_CONTACT"],
    [{ ...ELIGIBLE, phoneE164: null }, "NO_CONTACT"],
    [{ ...ELIGIBLE, activeMember: false }, "NOT_ACTIVE_MEMBER"],
    [{ ...ELIGIBLE, diretoriaMember: false }, "NOT_DIRECTORATE_MEMBER"],
    [{ ...ELIGIBLE, channelAuthorized: false }, "CHANNEL_NOT_AUTHORIZED"],
    [{ ...ELIGIBLE, phoneE164: "27999990000" }, "INVALID_PHONE"],
  ];
  for (const [contact, reason] of cases) {
    const h = harness({ contact });
    assert.deepEqual(await notifyDirectorateWhatsapp(INPUT, h.deps), { outcome: "SKIPPED", reason });
    assert.equal(h.state.provider.sent.length, 0);
    assert.equal([...h.log.values()][0].skipReason, reason);
    assert.equal(h.state.audits[0].action, "WHATSAPP_ESCALATION_SKIPPED");
  }
});

test("revogação e desativação do vínculo ANTES do disparo: a elegibilidade é lida no momento do envio, não em cache", async () => {
  // 1) autorizada no cadastro, revogada antes do envio
  const revoked = harness();
  revoked.state.contact = { ...ELIGIBLE, channelAuthorized: false };
  assert.equal((await notifyDirectorateWhatsapp(INPUT, revoked.deps)).reason, "CHANNEL_NOT_AUTHORIZED");
  assert.equal(revoked.state.provider.sent.length, 0);
  // 2) vínculo com o projeto desativado antes do envio (a pessoa e seu telefone continuam cadastrados)
  const deactivated = harness();
  deactivated.state.contact = { ...ELIGIBLE, activeMember: false };
  assert.equal((await notifyDirectorateWhatsapp(INPUT, deactivated.deps)).reason, "NOT_ACTIVE_MEMBER");
  assert.equal(deactivated.state.provider.sent.length, 0);
  // 3) mudança entre dois escalonamentos distintos é respeitada em cada um (consulta a cada envio)
  const h = harness();
  assert.equal((await notifyDirectorateWhatsapp({ ...INPUT, sourceId: "a1" }, h.deps)).outcome, "SIMULATED");
  h.state.contact = { ...ELIGIBLE, channelAuthorized: false };
  assert.equal((await notifyDirectorateWhatsapp({ ...INPUT, sourceId: "a2" }, h.deps)).outcome, "SKIPPED");
  assert.equal(h.state.loads, 2);
  assert.equal(h.state.provider.sent.length, 1);
});

test("concorrência: 25 disparos simultâneos do mesmo escalonamento geram uma única mensagem e um único registro", async () => {
  const h = harness({ latency: true });
  const results = await Promise.all(Array.from({ length: 25 }, () => notifyDirectorateWhatsapp(INPUT, h.deps)));
  assert.equal(results.filter((r) => r.outcome === "SIMULATED").length, 1);
  assert.equal(results.filter((r) => r.outcome === "ALREADY_PROCESSED").length, 24);
  assert.equal(h.state.provider.sent.length, 1);
  assert.equal(h.log.size, 1);
  assert.equal(h.state.audits.length, 1);
  // escalonamentos distintos continuam independentes
  const many = await Promise.all(["a1", "a2", "a3"].map((id) => notifyDirectorateWhatsapp({ ...INPUT, sourceId: id }, h.deps)));
  assert.equal(many.filter((r) => r.outcome === "SIMULATED").length, 2, "a1 já foi processado; a2 e a3 são novos");
});

test("gancho do ciclo (outbox ESCALATION): dispara só para CRÍTICO/DIRETORIA, deriva a origem da chave e não repete", async () => {
  const base = {
    notificationType: "ESCALATION", escalationLevel: "DIRETORIA", riskLevel: "CRITICAL",
    idempotencyKey: "RISK_ALERT:case-7:ESCALATION:DIRETORIA:u1", projectId: "p1", projectName: "Obra", recipientUserId: "u1",
    caseId: "case-7", baseUrl: "https://acc.example", subject: "Alerta crítico",
  };
  const h = harness();
  assert.equal(await runCycleEscalationHook(base, notifierFor(h)), true);
  assert.equal(h.state.provider.sent.length, 1);
  const row = [...h.log.values()][0];
  assert.deepEqual([row.sourceType, row.sourceId], ["RISK_ALERT", "case-7"]);
  assert.match(h.state.provider.sent[0].text, /https:\/\/acc\.example\/p1\/alertas\/case-7/);
  await runCycleEscalationHook(base, notifierFor(h)); // ciclo repetido
  assert.equal(h.state.provider.sent.length, 1);
  for (const override of [{ notificationType: "FORWARD" }, { escalationLevel: "ESCALAO_1" }, { riskLevel: "HIGH" }, { riskLevel: undefined }]) {
    const other = harness();
    assert.equal(await runCycleEscalationHook({ ...base, ...override }, notifierFor(other)), false);
    assert.equal(other.state.loads + other.state.provider.sent.length, 0);
  }
});

test("gancho manual e gancho do ciclo para a MESMA ação não duplicam (mesma chave de origem)", async () => {
  const h = harness();
  const manual = { projectId: "p1", projectName: "Obra", recipientUserId: "u1", actionId: "a1", actionTitle: "Fio exposto", actionUrl: "https://acc.example/p1/acoes/a1", riskLevel: "CRITICAL", newLevel: "DIRETORIA" };
  assert.equal(await runManualEscalationHook(manual, notifierFor(h)), true);
  await runCycleEscalationHook({ notificationType: "ESCALATION", escalationLevel: "DIRETORIA", riskLevel: "CRITICAL", idempotencyKey: "SLA_ACTION:a1:ESCALATION:DIRETORIA:u1", projectId: "p1", projectName: "Obra", recipientUserId: "u1", caseId: null, baseUrl: "https://acc.example", subject: "x" }, notifierFor(h));
  assert.equal(h.state.provider.sent.length, 1);
  for (const override of [{ riskLevel: "HIGH" }, { newLevel: "ESCALAO_1" }, { recipientUserId: null }, { projectName: null }]) {
    const other = harness();
    assert.equal(await runManualEscalationHook({ ...manual, ...override }, notifierFor(other)), false);
    assert.equal(other.state.provider.sent.length, 0);
  }
});

test("telefone: normalização E.164 e máscara", () => {
  assert.equal(normalizeInternationalPhone("+55 (27) 99999-0000"), "+5527999990000");
  assert.equal(normalizeInternationalPhone("0055 27 99999-0000"), "+5527999990000");
  for (const bad of ["27999990000", "+0551234567", "+12", "+5527abc", "", null, "+1234567890123456"]) assert.equal(normalizeInternationalPhone(bad), null);
  assert.equal(maskPhone("+5527999990000"), "+55*******0000");
  assert.equal(decideDirectorateWhatsapp({ enabled: false, riskLevel: "CRITICAL", newLevel: "DIRETORIA", contact: null }).reason, "DISABLED");
});

test("estrutural: sem rede nem credencial; ganchos ligados nos dois pontos com o notificador que nunca lança; elegibilidade vem do banco", () => {
  for (const file of readdirSync(lib).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(path.join(lib, file), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/\bfetch\(|node:https?|from "https?"|XMLHttpRequest|WebSocket|twilio|graph\.facebook/i.test(src), `${file} não pode usar rede`);
    assert.ok(!/process\.env\.[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD)/.test(src), `${file} não pode ler credencial`);
  }
  const cycle = readFileSync(path.join(root, "lib", "risk-alerts", "run-risk-alert-cycle.ts"), "utf8");
  const actions = readFileSync(path.join(root, "app", "[projectId]", "acoes", "actions.ts"), "utf8");
  assert.ok(/runCycleEscalationHook\([\s\S]*?notifyDirectorateWhatsappSafely\s*\)\.catch/.test(cycle));
  assert.ok(/runManualEscalationHook\([\s\S]*?notifyDirectorateWhatsappSafely\s*\)\.catch/.test(actions));
  // o gancho do ciclo fica depois do envio bem-sucedido do e-mail e antes do `return "SENT"`
  assert.ok(cycle.indexOf("RISK_ALERT_EMAIL_SENT") < cycle.indexOf("runCycleEscalationHook(") && cycle.indexOf("runCycleEscalationHook(") < cycle.indexOf('return "SENT"'));
  // o gancho manual fica depois do ramo vinculado a alerta de risco (que dá `continue`) => caminhos exclusivos
  assert.ok(actions.indexOf("enqueue_manual_escalation_email") < actions.indexOf("runManualEscalationHook("));
  const server = readFileSync(path.join(lib, "notify-directorate-server.ts"), "utf8");
  assert.ok(server.includes("whatsapp_dispatch_target") && server.includes("ignoreDuplicates: true") && server.includes('onConflict: "idempotency_key"'));
});
