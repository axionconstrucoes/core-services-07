// Respostas no GRUPO interno do piloto (WEG_INTERNAL_FOUR): cada pessoa responde com a própria identidade; o CRM nunca vira outra pessoa.
// Transporte simulado: store em memória; nenhuma rede, nenhum banco, nenhum e-mail.
// Uso: node scripts/test-pilot-group-reply.mjs
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { resolveProjectPilotReplyGroup, resolveProjectPilotReplyMailbox } = await import("../apps/web/lib/email/project-pilot-profile");

let passed = 0, failed = 0;
async function check(name, fn) { try { await fn(); passed++; console.log(`OK   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : e}`); } }
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };

const WEG = "00000000-0000-4000-8000-000000000001";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GROUP_ENV = { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_DESTINATION: "axion@axion.com.br", ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br", ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" };
const GROUP = ["crm@axion.com.br", "reynaldo@axion.com.br", "jaime.ramos@axion.com.br", "carlos.evandro@axion.com.br"];
const CASE_A = "ca5e0000-0000-4000-8000-00000000000a";
const U = { crm: "u-crm", rey: "u-rey", jaime: "u-jaime", carlos: "u-carlos", marcio: "u-marcio" };
const EMAIL = { [U.crm]: "crm@axion.com.br", [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br", [U.marcio]: "marcio.galvao@axion.com.br" };
const TOKENS = { jaime: "TokenJaimeAAAAAAAAAA", marcio: "TokenMarcioBBBBBBBBB" };
const MSGID = { jaime: "<m-jaime@axion.local>", marcio: "<m-marcio@axion.local>" };

function buildIndex() {
  const byReplyTokenHash = new Map(), participantByReplyTokenHash = new Map(), byMessageId = new Map(), participantByMessageId = new Map();
  for (const key of Object.keys(TOKENS)) {
    const h = pipeline.hashReplyToken(TOKENS[key]);
    byReplyTokenHash.set(h, CASE_A); participantByReplyTokenHash.set(h, U[key]);
    byMessageId.set(MSGID[key], CASE_A); participantByMessageId.set(MSGID[key], U[key]);
  }
  return { byMessageId, byReplyTokenHash, byVisibleCode: new Map([["AAAA1111", CASE_A]]), seenMessageIds: new Set(Object.values(MSGID)), participantByMessageId, participantByReplyTokenHash };
}
let seq = 0;
function inbound({ from, token, inReplyTo = null, subject = "Re: alerta", body = "estou ciente", auth = null, messageId }) {
  const id = `m${++seq}`;
  return { id, projectId: WEG, providerMessageId: `p-${id}`, headers: { from, to: token ? [`crm+alerta-${token}@axion.com.br`] : ["crm@axion.com.br"], messageId: messageId ?? `<in-${id}@mail.invalid>`, inReplyTo, references: [], subject, authenticationResults: auth }, bodyOriginal: body };
}
async function run({ messages, recipients = [U.jaime, U.marcio], allowlist = [U.jaime, U.marcio], memberships = {}, group = GROUP, legacyMailbox = "crm@axion.com.br" }) {
  const updates = [], audits = [], applied = [];
  const store = {
    listInboundToProcess: async () => messages,
    loadProjectSnapshot: async () => ({ config: { senderDomain: "axion.com.br", pilotRecipientAllowlistUserIds: allowlist }, recipients: new Map(Object.values(U).map((id) => [id, { userId: id, email: EMAIL[id], membershipStatus: memberships[id] ?? "ACTIVE" }])), matrixRules: [], areaResponsibles: [], settings: null }),
    loadCorrelationIndex: async () => buildIndex(),
    loadCaseSnapshotForAction: async () => ({ alertRecipientUserIds: recipients, snapshot: { id: CASE_A, riskLevel: "CRITICAL", state: "OPEN", activeForward: null }, record: { area: "PLANEJAMENTO" } }),
    updateInboundMessage: async (id, patch) => updates.push({ id, ...patch }),
    audit: async (_p, entries) => audits.push(...entries),
    applyTransition: async (caseId, _t, actor) => { applied.push({ caseId, actor }); return { state: "X", escalationId: null }; },
  };
  const result = await processAlertReplies(store, WEG, "2026-11-12T12:00:00.000Z", ["crm@axion.com.br"], { pilotMailbox: legacyMailbox, pilotGroup: group });
  return { result, updates, audits, applied, by: Object.fromEntries(updates.map((u) => [u.id, u])) };
}

await check("grupo reconhecido só para a WEG com perfil válido; modo legado e outros projetos => null", () => {
  assert(JSON.stringify(resolveProjectPilotReplyGroup(WEG, GROUP_ENV)) === JSON.stringify(GROUP), "grupo");
  assert(resolveProjectPilotReplyGroup(OTHER, GROUP_ENV) === null, "outro projeto");
  assert(resolveProjectPilotReplyGroup(WEG, { ...GROUP_ENV, ACC_PROJECT_PILOT_TEST_GROUP: "" }) === null, "legado");
  assert(resolveProjectPilotReplyGroup(WEG, { ...GROUP_ENV, ACC_PROJECT_PILOT_SENDER: "x@x.invalid" }) === null, "perfil inválido");
  assert(resolveProjectPilotReplyMailbox(WEG, GROUP_ENV) === "crm@axion.com.br", "caixa remetente continua para filtro de auto-envio");
});

await check("remetente correto: Jaime responde ao próprio alerta => ação aplicada com a identidade de Jaime", async () => {
  const m = inbound({ from: "jaime.ramos@axion.com.br", token: TOKENS.jaime });
  const { by, applied } = await run({ messages: [m] });
  assert(by[m.id].senderUserId === U.jaime && applied.length === 1 && applied[0].actor === U.jaime, JSON.stringify([by[m.id], applied]));
});

await check("CRM responde ao token de Jaime: NÃO vira Jaime; registrado como CRM, sem ação", async () => {
  const m = inbound({ from: "crm@axion.com.br", token: TOKENS.jaime });
  const { by, applied, audits } = await run({ messages: [m] });
  assert(by[m.id].senderUserId === U.crm, `identidade=${by[m.id].senderUserId}`);
  assert(applied.length === 0 && by[m.id].status === "REVIEW_REQUIRED" && by[m.id].requiresHumanReview === true, "sem ação, em revisão");
  assert(audits.some((a) => a.action === "RISK_ALERT_PILOT_GROUP_REPLY") && !audits.some((a) => a.action === "RISK_ALERT_PILOT_MAILBOX_REPLY"), "auditoria correta");
});

await check("Jaime e CRM respondendo: cada um registra a própria identidade; um não vira o outro", async () => {
  const a = inbound({ from: "jaime.ramos@axion.com.br", token: TOKENS.marcio });
  const b = inbound({ from: "crm@axion.com.br", token: TOKENS.marcio });
  const { by } = await run({ messages: [a, b] });
  assert(by[a.id].senderUserId === U.jaime && by[b.id].senderUserId === U.crm && by[a.id].senderUserId !== by[b.id].senderUserId, JSON.stringify(Object.values(by).map((u) => u.senderUserId)));
});

await check("Reynaldo e Carlos (testadores não destinatários) respondem ao alerta de outro: registrados sob a própria identidade, nunca sob o destinatário, sem ação", async () => {
  const a = inbound({ from: "reynaldo@axion.com.br", token: TOKENS.jaime });
  const b = inbound({ from: "carlos.evandro@axion.com.br", inReplyTo: MSGID.marcio });
  const { by, applied } = await run({ messages: [a, b] });
  assert(by[a.id].senderUserId === U.rey && by[b.id].senderUserId === U.carlos && applied.length === 0, JSON.stringify(by));
});

await check("remetente fora do grupo (corporativo sem estar no grupo, e externo) => não autorizado", async () => {
  const outside = inbound({ from: "marcio.galvao@axion.com.br", token: TOKENS.jaime });
  const external = inbound({ from: "alguem@weg.net", token: TOKENS.jaime });
  const { by, applied } = await run({ messages: [outside, external], recipients: [U.jaime], allowlist: [U.jaime] });
  assert(by[outside.id].status === "UNAUTHORIZED_REPLY" && by[external.id].status === "UNAUTHORIZED_REPLY" && applied.length === 0, JSON.stringify(by));
});

await check("remetente do grupo sem vínculo ativo => não autorizado, nunca registrado como observador", async () => {
  const m = inbound({ from: "reynaldo@axion.com.br", token: TOKENS.jaime });
  const { by } = await run({ messages: [m], memberships: { [U.rey]: "INACTIVE" } });
  assert(by[m.id].status === "UNAUTHORIZED_REPLY" && /MEMBERSHIP_INACTIVE/.test(by[m.id].statusReason), JSON.stringify(by[m.id]));
});

await check("correlação fraca (código visível) de membro do grupo => recusada", async () => {
  const m = inbound({ from: "reynaldo@axion.com.br", subject: "Re ACC-ALERTA:AAAA1111" });
  const { by } = await run({ messages: [m] });
  assert(by[m.id].status === "UNAUTHORIZED_REPLY" && /WEAK_CORRELATION/.test(by[m.id].statusReason), JSON.stringify(by[m.id]));
});

await check("falha de autenticação (DKIM) de membro do grupo => recusada", async () => {
  const m = inbound({ from: "reynaldo@axion.com.br", token: TOKENS.jaime, auth: "mx; spf=pass; dkim=fail; dmarc=pass" });
  const { by } = await run({ messages: [m] });
  assert(by[m.id].status === "UNAUTHORIZED_REPLY", JSON.stringify(by[m.id]));
});

await check("token inexistente/de outro projeto => revisão humana, sem ação; Message-ID reutilizado => ignorado", async () => {
  const unknown = inbound({ from: "jaime.ramos@axion.com.br", token: "TokenOutroProjetoXXXXXX" });
  const dup1 = inbound({ from: "jaime.ramos@axion.com.br", token: TOKENS.jaime, messageId: "<repetido@mail.invalid>" });
  const dup2 = inbound({ from: "jaime.ramos@axion.com.br", token: TOKENS.jaime, messageId: "<repetido@mail.invalid>" });
  const { by, applied } = await run({ messages: [unknown, dup1, dup2] });
  assert(by[unknown.id].status === "PENDING_HUMAN_REVIEW", JSON.stringify(by[unknown.id]));
  assert(by[dup2.id].status === "IGNORED_LOOP" && applied.filter((a) => a.actor === U.jaime).length === 1, "reuso aplicado uma vez");
});

await check("destinatário do grupo sem allowlist não eleva permissão: nenhuma ação aplicada, identidade própria", async () => {
  const m = inbound({ from: "jaime.ramos@axion.com.br", token: TOKENS.jaime });
  const { by, applied } = await run({ messages: [m], allowlist: [U.marcio] });
  assert(applied.length === 0 && by[m.id].senderUserId === U.jaime, JSON.stringify(by[m.id]));
});

await check("função pura: recusa fora do grupo e correlação fraca; aceita membro ativo", () => {
  const ctx = { senderEmail: "jaime.ramos@axion.com.br", group: GROUP, correlationMethod: "REPLY_TO_TOKEN", profile: { userId: "u", email: "jaime.ramos@axion.com.br", active: true }, membershipStatus: "ACTIVE", authenticationResults: null };
  assert(pipeline.classifyPilotGroupReply(ctx).observer === true, "membro");
  assert(pipeline.classifyPilotGroupReply({ ...ctx, senderEmail: "x@weg.net" }).observer === false, "fora");
  assert(pipeline.classifyPilotGroupReply({ ...ctx, correlationMethod: "VISIBLE_CODE" }).observer === false, "fraca");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
