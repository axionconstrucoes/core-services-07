// Respostas escritas pela CAIXA do piloto (projeto piloto): vinculação ao alerta e ao participante simulado corretos, sem elevar permissões.
// Transporte simulado: processAlertReplies roda sobre um store em memória; nenhuma rede, nenhum banco, nenhum e-mail.
//
// Uso: node scripts/test-pilot-mailbox-reply.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { resolveProjectPilotReplyMailbox } = await import("../apps/web/lib/email/project-pilot-profile");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const assert = (cond, msg = "asserção falhou") => {
  if (!cond) throw new Error(msg);
};

const PILOT_PROJECT = "11111111-1111-4111-8111-111111111111";
const PILOT_ENV = { ACC_PROJECT_PILOT_PROJECT_ID: PILOT_PROJECT, ACC_PROJECT_PILOT_DESTINATION: "axion@axion.com.br", ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br" };
const BOX = "axion@axion.com.br";
const CASE_A = "ca5e0000-0000-4000-8000-00000000000a";
const U = { resp: "u0000000-0000-4000-8000-000000000001", esc1: "u0000000-0000-4000-8000-000000000002", dir: "u0000000-0000-4000-8000-000000000003", outsider: "u0000000-0000-4000-8000-000000000009" };
// Tokens opacos (16–64 caracteres base64url) por mensagem enviada a cada participante.
const TOKENS = { resp: "TokenRespAAAAAAAAAAAA", esc1: "TokenEsc1BBBBBBBBBBBB", dir: "TokenDirCCCCCCCCCCCC" };
const MSGID = { resp: "<m-resp@axion.local>", esc1: "<m-esc1@axion.local>", dir: "<m-dir@axion.local>" };

function buildIndex() {
  const byReplyTokenHash = new Map();
  const participantByReplyTokenHash = new Map();
  const byMessageId = new Map();
  const participantByMessageId = new Map();
  for (const key of Object.keys(TOKENS)) {
    const hash = pipeline.hashReplyToken(TOKENS[key]);
    byReplyTokenHash.set(hash, CASE_A);
    participantByReplyTokenHash.set(hash, U[key]);
    byMessageId.set(MSGID[key], CASE_A);
    participantByMessageId.set(MSGID[key], U[key]);
  }
  return { byMessageId, byReplyTokenHash, byVisibleCode: new Map([["AAAA1111", CASE_A]]), seenMessageIds: new Set(Object.values(MSGID)), participantByMessageId, participantByReplyTokenHash };
}

function inbound({ id, from = BOX, token, inReplyTo = null, subject = "Re: alerta", body = "ok" }) {
  return {
    id,
    projectId: PILOT_PROJECT,
    providerMessageId: `p-${id}`,
    headers: {
      from,
      to: token ? [`axion+alerta-${token}@axion.com.br`] : [BOX],
      messageId: `<in-${id}@mail.invalid>`,
      inReplyTo,
      references: [],
      subject,
      authenticationResults: null,
    },
    bodyOriginal: body,
  };
}

async function run({ messages, allowlist = [U.resp, U.esc1, U.dir], recipients = [U.resp, U.esc1, U.dir], memberships = {}, pilotMailbox = BOX, accMailboxes = [BOX] }) {
  const updates = [];
  const audits = [];
  const store = {
    listInboundToProcess: async () => messages,
    loadProjectSnapshot: async () => ({
      config: { senderDomain: "axion.com.br", pilotRecipientAllowlistUserIds: allowlist },
      recipients: new Map([...recipients, U.outsider].map((id) => [id, { userId: id, email: `${id.slice(-3)}@axion.com.br`, membershipStatus: memberships[id] ?? "ACTIVE" }])),
      matrixRules: [],
      areaResponsibles: [],
      settings: null,
    }),
    loadCorrelationIndex: async () => buildIndex(),
    loadCaseSnapshotForAction: async () => ({ alertRecipientUserIds: recipients, snapshot: { riskLevel: "CRITICAL", state: "OPEN", activeForward: null }, record: { area: "PLANEJAMENTO" } }),
    updateInboundMessage: async (id, patch) => updates.push({ id, ...patch }),
    audit: async (_project, entries) => audits.push(...entries),
    applyTransition: async () => {
      throw new Error("não deveria aplicar transição neste teste");
    },
  };
  const result = await processAlertReplies(store, PILOT_PROJECT, "2026-11-04T12:00:00.000Z", accMailboxes, { pilotMailbox });
  return { result, updates, audits };
}

await check("a caixa do piloto só é reconhecida para o projeto piloto com perfil válido", () => {
  assert(resolveProjectPilotReplyMailbox(PILOT_PROJECT, PILOT_ENV) === BOX);
  assert(resolveProjectPilotReplyMailbox("22222222-2222-4222-8222-222222222222", PILOT_ENV) === null, "outro projeto");
  assert(resolveProjectPilotReplyMailbox(PILOT_PROJECT, {}) === null, "sem perfil");
  assert(resolveProjectPilotReplyMailbox(PILOT_PROJECT, { ...PILOT_ENV, ACC_PROJECT_PILOT_DESTINATION: "pessoa@exemplo.invalid" }) === null, "perfil inválido");
});

await check("correlação: o participante vem da MENSAGEM respondida (token ou In-Reply-To); conflito ou código visível => nenhum", () => {
  const index = buildIndex();
  const h = (extra) => ({ from: BOX, to: [BOX], messageId: "<x@y>", inReplyTo: null, references: [], subject: "Re", ...extra });
  assert(pipeline.correlateReply(h({ to: [`axion+alerta-${TOKENS.esc1}@axion.com.br`] }), "", index).participantUserId === U.esc1, "token");
  assert(pipeline.correlateReply(h({ inReplyTo: MSGID.dir }), "", index).participantUserId === U.dir, "In-Reply-To");
  assert(pipeline.correlateReply(h({ inReplyTo: MSGID.dir, to: [`axion+alerta-${TOKENS.dir}@axion.com.br`] }), "", index).participantUserId === U.dir, "ambos concordam");
  assert(pipeline.correlateReply(h({ inReplyTo: MSGID.resp, to: [`axion+alerta-${TOKENS.dir}@axion.com.br`] }), "", index).participantUserId === null, "conflito");
  const byCode = pipeline.correlateReply(h({ subject: "Re ACC-ALERTA:AAAA1111" }), "", index);
  assert(byCode.caseId === CASE_A && byCode.method === "VISIBLE_CODE" && !byCode.participantUserId, "código visível não identifica participante");
});

await check("resposta de axion@ por token de cada mensagem é atribuída ao participante daquela mensagem (3 níveis, sem trocar de pessoa)", async () => {
  const messages = [
    inbound({ id: "1", token: TOKENS.resp }),
    inbound({ id: "2", token: TOKENS.esc1 }),
    inbound({ id: "3", inReplyTo: MSGID.dir }),
  ];
  const { updates, audits } = await run({ messages });
  const by = Object.fromEntries(updates.map((u) => [u.id, u]));
  assert(by["1"].senderUserId === U.resp && by["2"].senderUserId === U.esc1 && by["3"].senderUserId === U.dir, JSON.stringify(updates.map((u) => [u.id, u.senderUserId, u.status])));
  assert(updates.every((u) => u.caseId === CASE_A), "alerta correto");
  assert(updates.every((u) => u.status !== "UNAUTHORIZED" && !String(u.statusReason ?? "").includes("PILOT_")), "nenhuma recusada");
  assert(audits.filter((a) => a.action === "RISK_ALERT_PILOT_MAILBOX_REPLY").length === 3, "auditoria do uso da caixa do piloto");
});

await check("sem elevar permissões: código visível, participante fora da allowlist/destinatários/vínculo ativo e e-mail de outra pessoa continuam recusados", async () => {
  const cases = [
    ["código visível apenas", { messages: [inbound({ id: "v", subject: "Re ACC-ALERTA:AAAA1111" })] }],
    ["participante fora da allowlist", { messages: [inbound({ id: "a", token: TOKENS.esc1 })], allowlist: [U.resp] }],
    ["participante não é destinatário do alerta", { messages: [inbound({ id: "b", token: TOKENS.esc1 })], recipients: [U.resp, U.dir] }],
    ["vínculo inativo", { messages: [inbound({ id: "c", token: TOKENS.dir })], memberships: { [U.dir]: "INACTIVE" } }],
    ["token e In-Reply-To de participantes diferentes", { messages: [inbound({ id: "d", token: TOKENS.dir, inReplyTo: MSGID.resp })] }],
    ["remetente desconhecido (não é a caixa do piloto)", { messages: [inbound({ id: "e", from: "desconhecido@axion.com.br", token: TOKENS.resp })] }],
    ["remetente externo", { messages: [inbound({ id: "f", from: "alguem@externo.invalid", token: TOKENS.resp })] }],
  ];
  for (const [label, scenario] of cases) {
    const { updates } = await run(scenario);
    const u = updates[0];
    assert(u && !u.senderUserId, `${label}: não deveria atribuir participante (${JSON.stringify(u)})`);
    assert(u.status !== "PROCESSED" && u.status !== "REVIEW_REQUIRED", `${label}: status ${u.status}`);
  }
});

await check("falha de autenticação do remetente (SPF/DKIM/DMARC) impede a atribuição", async () => {
  const message = inbound({ id: "s", token: TOKENS.resp });
  message.headers.authenticationResults = "mx.google.com; spf=fail smtp.mailfrom=axion@axion.com.br; dkim=pass; dmarc=pass";
  const { updates } = await run({ messages: [message] });
  assert(!updates[0].senderUserId);
});

await check("outros projetos (sem caixa do piloto): resposta de axion@ continua IGNORADA como auto-envio, como antes", async () => {
  const { updates, result } = await run({ messages: [inbound({ id: "o", token: TOKENS.resp })], pilotMailbox: null });
  assert(updates[0].status === "IGNORED_SELF" && result.ignored === 1, JSON.stringify(updates[0]));
});

await check("auto-resposta e bounce da caixa do piloto continuam ignorados (sem laço)", async () => {
  const auto = inbound({ id: "au", token: TOKENS.resp });
  auto.headers.autoSubmitted = "auto-replied";
  const bounce = inbound({ id: "bo", from: "mailer-daemon@googlemail.com", token: TOKENS.resp });
  const { updates } = await run({ messages: [auto, bounce] });
  assert(updates.every((u) => /^IGNORED_/.test(u.status)), JSON.stringify(updates.map((u) => u.status)));
});

await check("a autorização do piloto age como o PARTICIPANTE (mesmas regras e transições) e nunca como a caixa", () => {
  const src = readFileSync(path.join(root, "apps/web/lib/risk-alerts/replies/process-alert-replies.ts"), "utf8");
  assert(src.includes("actorUserId: authorization.userId") && src.includes("applyTransition(correlation.caseId, transition, authorization.userId)"));
  const sender = pipeline.authorizePilotMailboxReply({
    senderEmail: "outra@axion.com.br", pilotMailbox: BOX, correlationMethod: "REPLY_TO_TOKEN", participantUserId: U.resp,
    participant: { userId: U.resp, active: true, membershipStatus: "ACTIVE" }, alertRecipientUserIds: [U.resp], allowlistUserIds: [U.resp], authenticationResults: null,
  });
  assert(sender.authorized === false && sender.reason === "NOT_PILOT_MAILBOX");
  for (const method of ["VISIBLE_CODE", "REFERENCES", "NONE"]) {
    const r = pipeline.authorizePilotMailboxReply({
      senderEmail: BOX, pilotMailbox: BOX, correlationMethod: method, participantUserId: U.resp,
      participant: { userId: U.resp, active: true, membershipStatus: "ACTIVE" }, alertRecipientUserIds: [U.resp], allowlistUserIds: [U.resp], authenticationResults: null,
    });
    assert(r.authorized === false && r.reason === "WEAK_CORRELATION", method);
  }
});

await check("ACC_EMAIL_ONLY_RECIPIENT global: o piloto passa pelo destino próprio; os demais projetos continuam presos ao valor global", async () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, PILOT_ENV, { ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: "crm@axion.com.br", ACC_EMAIL_ONLY_RECIPIENT: "crm@axion.com.br" });
    const msg = (projectId) => ({ to: "pessoa@exemplo.invalid", subject: "Alerta", text: "t", correlationId: "c", vera: { projectId, context: "alerta" } });
    let seen = null;
    await new FakeEmailProvider({ onGuardedInput: (i) => (seen = i) }).send(msg(PILOT_PROJECT));
    assert(seen.to === "axion@axion.com.br", "piloto chega ao destino do piloto");
    await new FakeEmailProvider({ onGuardedInput: (i) => (seen = i) }).send(msg("22222222-2222-4222-8222-222222222222"));
    assert(seen.to === "crm@axion.com.br", "outro projeto segue o valor global");
    // Outro projeto com valor global diferente do destino efetivo: continua bloqueado.
    process.env.ACC_EMAIL_ONLY_RECIPIENT = "axion@axion.com.br";
    let blocked = false;
    try {
      await new FakeEmailProvider().send(msg("22222222-2222-4222-8222-222222222222"));
    } catch (error) {
      blocked = error instanceof EmailSendError;
    }
    assert(blocked, "outro projeto com destino efetivo diferente do global deveria ser bloqueado");
    // Piloto nunca consegue contornar com destino diferente do próprio: o To é fixado pelo perfil.
    process.env.ACC_EMAIL_ONLY_RECIPIENT = "outra@axion.com.br";
    blocked = false;
    try {
      await new FakeEmailProvider().send(msg(PILOT_PROJECT));
    } catch (error) {
      blocked = error instanceof EmailSendError;
    }
    // Com o valor global apontando para um terceiro endereço, o destino do piloto continua liberado (destino próprio e fixo).
    assert(!blocked, "destino do piloto é fixo e liberado pela própria regra");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
