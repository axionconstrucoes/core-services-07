// ESPECIALISTA por e-mail (Lote 3) + token vinculado ao destinatário (ACC_EMAIL_TOKEN_OWNER_STRICT) — PURO / memória, sem rede,
// sem banco, sem e-mail real. Cobre: parser; roteamento por ÁREA (nunca AXIA); decisão nos três tipos de token (SLA, resumo, contrato);
// padrão desligado; remetente forjado/não autorizado; revisão humana ALTO/CRÍTICO; caminho de RISCO com store em memória (o alerta NÃO
// é alterado e o token NÃO é consumido); mailto do ESPECIALISTA (só com a chave); texto das respostas; owner-strict (desligado por padrão).
// Uso: node scripts/test-email-specialist-by-email.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const spec = await import("../apps/web/lib/email-replies/specialist-email");
const flag = await import("../apps/web/lib/email-replies/specialist-flag");
const { decideTokenReply } = await import("../apps/web/lib/email-replies/token-reply-decision");
const mailto = await import("../apps/web/lib/email-replies/reply-mailto");
const panel = await import("../apps/web/lib/email/templates/reply-by-email-panel");
const consult = await import("../apps/web/lib/email-replies/specialist-consultations");
const sa = await import("../apps/web/lib/email-replies/sender-authentication");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { expertForArea } = await import("../apps/web/lib/ai/routing/expert-topics");

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

// ------------------------------------------------------------------ fixtures
const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const AUTH_FAIL = "mx.google.com; dkim=fail header.i=@axion.com.br; dmarc=fail header.from=axion.com.br";
const P = "00000000-0000-4000-8000-000000000001";
const U = { RESP: "00000000-0000-4000-8000-0000000000b2", ADMIN: "00000000-0000-4000-8000-0000000000b1", OTHER: "00000000-0000-4000-8000-0000000000b3", READ: "00000000-0000-4000-8000-0000000000b4", DIR: "00000000-0000-4000-8000-0000000000b6" };
const members = [
  { userId: U.ADMIN, email: "admin.obra@axion.com.br", name: "Admin Obra", status: "ACTIVE", permission: "ADMINISTRADOR" },
  { userId: U.RESP, email: "carlos.evandro@axion.com.br", name: "Carlos Evandro", status: "ACTIVE", permission: "COLABORADOR" },
  { userId: U.OTHER, email: "maria.souza@axion.com.br", name: "Maria Souza", status: "ACTIVE", permission: "COLABORADOR" },
  { userId: U.READ, email: "leo.leitura@axion.com.br", name: "Leo Leitura", status: "ACTIVE", permission: "LEITURA" },
  { userId: U.DIR, email: "diretor@axion.com.br", name: "Diretor", status: "ACTIVE", permission: "COLABORADOR" },
];
const target = (o = {}) => ({ kind: "SLA_ACTION", subjectId: "11111111-0000-4000-8000-000000000001", projectId: P, actorUserIds: [U.RESP], closed: false, severity: "MEDIUM", currentResponsibleUserId: U.RESP, evidenceRequired: false, area: "PLANEJAMENTO", ...o });
const message = (body, o = {}) => ({
  providerMessageId: o.id ?? `m-${Math.random().toString(36).slice(2)}`,
  receivedAt: new Date().toISOString(),
  bodyOriginal: body,
  headers: { from: o.from ?? "carlos.evandro@axion.com.br", to: ["crm+alerta-tok@axion.com.br"], messageId: "<x@mail>", inReplyTo: null, references: [], subject: "ESPECIALISTA [ACC-SLA:ABCD1234]", autoSubmitted: null, authenticationResults: o.auth === undefined ? AUTH_OK : o.auth },
});
const decide = (body, o = {}) => decideTokenReply({ message: message(body, o), target: o.target ?? target(), members, accMailboxes: ["crm@axion.com.br"], processedMessageIds: new Set(), specialistEnabled: o.enabled ?? true, ownerStrict: o.ownerStrict, tokenRecipientUserId: o.tokenRecipient });

console.log("\n======================================");
console.log("ESPECIALISTA POR E-MAIL + TOKEN DO DESTINATÁRIO");
console.log("======================================\n");

// ------------------------------------------------------------------ 1. parser
await check("1. Parser: 'ESPECIALISTA: pergunta' abre o texto novo; sem comando => NO_COMMAND; mistura com outro comando => MIXED; pergunta curta => QUESTION_TOO_SHORT", () => {
  assert(spec.parseSpecialistCommand("ESPECIALISTA: a cláusula 7 permite multa por atraso?").question?.startsWith("a cláusula 7"));
  assert(spec.parseSpecialistCommand("especialista - qual o impacto no caminho crítico?\ncom a chuva de novembro").question.includes("chuva"));
  assert(spec.parseSpecialistCommand("Oi, tudo bem?").reason === "NO_COMMAND");
  assert(spec.parseSpecialistCommand("").reason === "NO_COMMAND");
  assert(spec.parseSpecialistCommand("ESPECIALISTA: posso resolver?\nRESOLVIDO: feito").reason === "MIXED");
  assert(spec.parseSpecialistCommand("RESOLVIDO: feito e conferido\nESPECIALISTA: posso fechar?").reason === "MIXED");
  assert(spec.parseSpecialistCommand("ESPECIALISTA: ok").reason === "QUESTION_TOO_SHORT");
  // texto-guia do mailto não conta como pergunta
  assert(spec.parseSpecialistCommand("ESPECIALISTA: (escreva aqui a sua pergunta ao especialista da área)").reason === "QUESTION_TOO_SHORT");
  assert(spec.parseSpecialistCommand(`ESPECIALISTA: ${"a".repeat(4000)}`).question.length === spec.MAX_SPECIALIST_QUESTION, "pergunta limitada");
});

// ------------------------------------------------------------------ 2. roteamento por área
await check("2. Roteamento por ÁREA: Planejamento, Engenharia, Jurídico, Comercial/Financeiro/Orçamento, SSMA/ESG => Expert da área; nunca AXIA", () => {
  const expected = { PLANEJAMENTO: "planning-director", ENGENHARIA: "engineering-director", JURIDICO: "legal-consultant", COMERCIAL: "commercial-director", FINANCEIRO: "commercial-director", ORCAMENTO: "commercial-director", ESG_SSMA: "esg-director" };
  for (const [area, expert] of Object.entries(expected)) {
    const r = spec.routeSpecialistByEmail({ area, question: "Pergunta qualquer sem tema específico aqui" });
    assert(r.ok && r.expertId === expert && r.source === "AREA", `${area} => ${JSON.stringify(r)}`);
    assert(expertForArea(area) === expert);
  }
  for (const area of ["ADMINISTRATIVO", "DIRETORIA", "COMPRAS", null, undefined]) {
    const r = spec.routeSpecialistByEmail({ area, question: "Pergunta qualquer sem tema específico aqui" });
    assert(!r.ok && r.code === "SPECIALIST_AREA_UNKNOWN", `${area} sem tema => revisão: ${JSON.stringify(r)}`);
  }
  assert(spec.routeSpecialistByEmail({ area: "ADMINISTRATIVO", question: "A multa contratual está correta?" }).expertId === "legal-consultant", "sem Expert na área: tema único");
  assert(spec.routeSpecialistByEmail({ area: null, question: "O atraso do cronograma gera multa contratual?" }).expertId === "ceo", "multitema => curadoria multi-Expert");
  // A pergunta pode pedir a AXIA: o destino continua sendo o Expert da área (a seleção vem só da área/tema).
  const axia = spec.routeSpecialistByEmail({ area: "JURIDICO", question: "AXIA, a cláusula 5 vale?" });
  assert(axia.ok && axia.expertId === "legal-consultant");
  const official = new Set(["planning-director", "engineering-director", "legal-consultant", "commercial-director", "esg-director", "ceo"]);
  for (const area of ["PLANEJAMENTO", "ENGENHARIA", "JURIDICO", "COMERCIAL", "FINANCEIRO", "ORCAMENTO", "ESG_SSMA", "ADMINISTRATIVO", "DIRETORIA", null]) {
    for (const question of ["Pergunte para a AXIA", "axia", "assistente AXIA: segurança no canteiro", "qualquer coisa sem tema"]) {
      const r = spec.routeSpecialistByEmail({ area, question });
      assert(!r.ok || official.has(r.expertId), `${area}/${question} => ${r.expertId}`);
    }
  }
  assert(!Object.keys(spec.SPECIALIST_EXPERT_LABEL).some((k) => /axia/i.test(k)), "rótulos sem AXIA");
});

// ------------------------------------------------------------------ 3. decisão nos tokens por item
await check("3. Token por item (SLA / resumo / contrato): remetente autorizado => SPECIALIST (nada a gravar no item; token não consumido)", () => {
  for (const [kind, area, expert] of [["SLA_ACTION", "PLANEJAMENTO", "planning-director"], ["WEEKLY_DIGEST_ITEM", "ENGENHARIA", "engineering-director"], ["SLA_ACTION", "JURIDICO", "legal-consultant"], ["WEEKLY_DIGEST_ITEM", "FINANCEIRO", "commercial-director"], ["SLA_ACTION", "ORCAMENTO", "commercial-director"]]) {
    const d = decide("ESPECIALISTA: qual a melhor alternativa para recuperar o atraso desta frente?", { target: target({ kind, area }) });
    assert(d.kind === "SPECIALIST" && d.record.expertId === expert && d.record.area === area && d.actorUserId === U.RESP, JSON.stringify(d));
    assert(!("note" in d) && !("forward" in d) && !("command" in d), "decisão sem comando de alteração do item");
  }
  const contract = decide("ESPECIALISTA: a cláusula de multa por atraso se aplica a este evento?", { target: target({ kind: "CONTRACT_ALERT_ITEM", area: null, actorUserIds: [U.RESP] }) });
  assert(contract.kind === "SPECIALIST" && contract.record.expertId === "legal-consultant" && contract.record.routingSource === "TOPIC", JSON.stringify(contract));
  const noTheme = decide("ESPECIALISTA: o que você acha disso aqui exatamente?", { target: target({ kind: "CONTRACT_ALERT_ITEM", area: null }) });
  assert(noTheme.kind === "REJECT" && noTheme.code === "SPECIALIST_AREA_UNKNOWN", JSON.stringify(noTheme));
});
await check("4. ALTO/CRÍTICO => revisão humana obrigatória no registro; MÉDIO/BAIXO => recomendada; gravidade e área seguem para o registro", () => {
  for (const [sev, review] of [["CRITICAL", true], ["HIGH", true], ["MEDIUM", false], ["LOW", false]]) {
    const d = decide("ESPECIALISTA: qual a providência recomendada para este item?", { target: target({ severity: sev }) });
    assert(d.kind === "SPECIALIST" && d.record.requiresHumanReview === review && d.record.severity === sev, `${sev}: ${JSON.stringify(d)}`);
  }
  assert(spec.specialistRequiresHumanReview("HIGH") && spec.specialistRequiresHumanReview("CRITICAL") && !spec.specialistRequiresHumanReview("LOW"));
});
await check("5. Padrão DESLIGADO (falha fechada): sem a chave, ESPECIALISTA é recusado com explicação e nada é registrado", () => {
  assert(flag.isSpecialistEmailEnabled({}) === false && flag.isSpecialistEmailEnabled({ ACC_EMAIL_SPECIALIST_ENABLED: "1" }) === false && flag.isSpecialistEmailEnabled({ ACC_EMAIL_SPECIALIST_ENABLED: "TRUE" }) === false);
  assert(flag.isSpecialistEmailEnabled({ ACC_EMAIL_SPECIALIST_ENABLED: "true" }) === true);
  const d = decide("ESPECIALISTA: qual a providência recomendada para este item?", { enabled: false });
  assert(d.kind === "REJECT" && d.code === "SPECIALIST_DISABLED" && /Nada foi alterado/.test(d.message), JSON.stringify(d));
  const direct = decideTokenReply({ message: message("ESPECIALISTA: qual a providência recomendada para este item?"), target: target(), members, accMailboxes: [], processedMessageIds: new Set() });
  assert(direct.kind === "REJECT" && direct.code === "SPECIALIST_DISABLED", "sem o parâmetro = desligado");
});
await check("6. Remetente forjado / não autorizado: não corporativo, desconhecido, autenticação ausente/falha, LEITURA e quem não é ator do item NÃO consultam", () => {
  const q = "ESPECIALISTA: qual a providência recomendada para este item?";
  assert(decide(q, { from: "invasor@gmail.com" }).kind === "UNAUTHORIZED");
  assert(decide(q, { from: "desconhecido@axion.com.br" }).reason === "SENDER_NOT_MEMBER");
  assert(decide(q, { auth: null }).kind === "UNAUTHORIZED");
  assert(decide(q, { auth: AUTH_FAIL }).kind === "UNAUTHORIZED");
  assert(decide(q, { from: "leo.leitura@axion.com.br" }).reason === "SENDER_READ_ONLY");
  assert(decide(q, { from: "maria.souza@axion.com.br" }).reason === "SENDER_NOT_ALLOWED");
  assert(decide(q, { from: "admin.obra@axion.com.br" }).kind === "SPECIALIST", "Administrador consulta");
  assert(decide(q, { target: target({ closed: true, closedReason: null }) }).code === "ITEM_CLOSED");
});
await check("7. Mistura e pergunta curta: respostas pedindo correção; texto novo apenas (citação ignorada)", () => {
  assert(decide("ESPECIALISTA: posso resolver isto?\nRESOLVIDO: feito e conferido").code === "COMMAND_AMBIGUOUS");
  assert(decide("ESPECIALISTA: ok").code === "SPECIALIST_QUESTION_REQUIRED");
  const quoted = "Obrigado.\n\nEm ter., 17 de nov. de 2026 às 10:00, ACC escreveu:\n> ESPECIALISTA: qual a providência recomendada para este item?";
  assert(decide(quoted).kind === "REJECT" && decide(quoted).code === "COMMAND_NOT_RECOGNIZED", "citação não é comando");
  // comandos de tratamento continuam funcionando e NÃO são afetados
  assert(decide("RESOLVIDO: cronograma revisado e enviado ao cliente").kind === "PROCESS");
});

// ------------------------------------------------------------------ 8. owner strict
await check("8. ACC_EMAIL_TOKEN_OWNER_STRICT: desligado por padrão (comportamento atual); ligado, só o dono, o responsável atual ou o Administrador respondem", () => {
  assert(sa.resolveTokenOwnerStrict({}) === false && sa.resolveTokenOwnerStrict({ ACC_EMAIL_TOKEN_OWNER_STRICT: "1" }) === false && sa.resolveTokenOwnerStrict({ ACC_EMAIL_TOKEN_OWNER_STRICT: "true" }) === true);
  const t = target({ actorUserIds: [U.RESP, U.OTHER], currentResponsibleUserId: U.RESP });
  const resolved = "RESOLVIDO: cronograma revisado e enviado ao cliente";
  // token emitido para DIR; Maria (ator do item, mas não dona nem responsável atual) usa o e-mail encaminhado
  assert(decide(resolved, { target: t, from: "maria.souza@axion.com.br", tokenRecipient: U.DIR }).kind === "PROCESS", "desligado: aceito como hoje");
  const strict = decide(resolved, { target: t, from: "maria.souza@axion.com.br", tokenRecipient: U.DIR, ownerStrict: true });
  assert(strict.kind === "UNAUTHORIZED" && strict.reason === "TOKEN_NOT_OWNER" && /outra pessoa/.test(strict.explanation) && strict.explainTo === U.OTHER, JSON.stringify(strict));
  assert(decide(resolved, { target: t, from: "maria.souza@axion.com.br", tokenRecipient: U.OTHER, ownerStrict: true }).kind === "PROCESS", "dono do token");
  assert(decide(resolved, { target: t, from: "carlos.evandro@axion.com.br", tokenRecipient: U.DIR, ownerStrict: true }).kind === "PROCESS", "responsável atual");
  assert(decide(resolved, { target: t, from: "admin.obra@axion.com.br", tokenRecipient: U.DIR, ownerStrict: true }).kind === "PROCESS", "Administrador");
  assert(decide(resolved, { target: t, from: "maria.souza@axion.com.br", tokenRecipient: null, ownerStrict: true }).kind === "PROCESS", "token sem destinatário gravado: não bloqueia");
  // vale também para o ESPECIALISTA
  assert(decide("ESPECIALISTA: qual a providência recomendada para este item?", { target: t, from: "maria.souza@axion.com.br", tokenRecipient: U.DIR, ownerStrict: true }).reason === "TOKEN_NOT_OWNER");
  // não enfraquece nada: autenticação/membro continuam antes
  assert(decide(resolved, { target: t, from: "maria.souza@axion.com.br", tokenRecipient: U.DIR, ownerStrict: true, auth: AUTH_FAIL }).reason !== "TOKEN_NOT_OWNER");
});

// ------------------------------------------------------------------ 9. mailto
await check("9. Atalho mailto ESPECIALISTA: só com a chave; endereço do MESMO token por item; corpo-guia sem dados; painel com 3 (padrão) ou 4 links", () => {
  const input = { mailbox: "crm@axion.com.br", token: "T".repeat(32), visibleCode: "ACC-SLA:ABCD1234" };
  const off = mailto.buildReplyMailtoLinks({ ...input, specialist: false });
  assert(off && Object.keys(off).length === 3 && !off.ESPECIALISTA, JSON.stringify(Object.keys(off)));
  const on = mailto.buildReplyMailtoLinks({ ...input, specialist: true });
  assert(on && Object.keys(on).length === 4 && mailto.isSafeReplyMailto(on.ESPECIALISTA), JSON.stringify(on));
  assert(on.ESPECIALISTA.startsWith(`mailto:crm+alerta-${"T".repeat(32)}@axion.com.br?subject=ESPECIALISTA%20%5BACC-SLA%3AABCD1234%5D`), on.ESPECIALISTA);
  assert(decodeURIComponent(on.ESPECIALISTA).includes("ESPECIALISTA: (escreva aqui a sua pergunta ao especialista da área)"));
  assert(!/\d{3}\.\d{3}|R\$|@gmail/.test(decodeURIComponent(on.ESPECIALISTA)), "sem dados no corpo");
  assert(on.ESPECIALISTA.length < mailto.MAILTO_MAX_LENGTH);
  const prev = process.env.ACC_EMAIL_SPECIALIST_ENABLED;
  try {
    delete process.env.ACC_EMAIL_SPECIALIST_ENABLED;
    assert(!mailto.buildReplyMailtoLinks(input).ESPECIALISTA, "sem a chave no ambiente: 3 links");
    process.env.ACC_EMAIL_SPECIALIST_ENABLED = "true";
    assert(mailto.buildReplyMailtoLinks(input).ESPECIALISTA, "com a chave: 4 links");
  } finally {
    if (prev === undefined) delete process.env.ACC_EMAIL_SPECIALIST_ENABLED;
    else process.env.ACC_EMAIL_SPECIALIST_ENABLED = prev;
  }
  const htmlOff = panel.buildReplyByEmailPanelHtml(off);
  const htmlOn = panel.buildReplyByEmailPanelHtml(on);
  assert(!htmlOff.includes("ESPECIALISTA por e-mail") && htmlOff.includes("RESOLVIDO por e-mail") && htmlOff.includes("ENVIAR PARA por e-mail"));
  assert(htmlOn.includes("ESPECIALISTA por e-mail") && (htmlOn.match(/href="mailto:/g) ?? []).length === 4);
  assert(panel.replyByEmailTextLines(on).some((l) => l.startsWith("ESPECIALISTA: mailto:")));
  assert(panel.safeReplyByEmail({ ...off, ESPECIALISTA: "mailto:evil@x.com?subject=a&body=b" }) === null, "link especialista inseguro invalida o painel");
  // texto do botão de link do ACC (desativado) aponta para o caminho por e-mail
  assert(/ESPECIALISTA por e-mail/.test(panel.ESPECIALISTA_BY_EMAIL_REASON));
});

// ------------------------------------------------------------------ 10. textos
await check("10. Resposta do Expert: rotulada como RECOMENDAÇÃO de IA com revisão humana (obrigatória em ALTO/CRÍTICO); recibo e aviso de limite sem alterar o item", () => {
  const high = spec.buildSpecialistAnswerText({ expertLabel: "Diretor de Planejamento", answerText: "Reprogramar a frente B.", requiresHumanReview: true, confidence: 0.62 });
  assert(/RECOMENDAÇÃO, não decisão/.test(high) && /ALTO\/CRÍTICO/.test(high) && /REVISÃO HUMANA/.test(high) && /62%/.test(high) && /não alterou o item/.test(high), high);
  const low = spec.buildSpecialistAnswerText({ expertLabel: "Expert Jurídico", answerText: "x", requiresHumanReview: false, confidence: null });
  assert(!/ALTO\/CRÍTICO/.test(low) && /revisada por uma pessoa/.test(low));
  const receipt = consult.buildSpecialistReceiptEmail({ expert_id: "legal-consultant", original_subject: "RE: ESPECIALISTA [ACC-SLA:X]" });
  assert(receipt.subject.startsWith("Re: ") && /Expert Jurídico/.test(receipt.text) && /NÃO altera o item/.test(receipt.text) && !/AXIA/i.test(receipt.html));
  const quota = consult.buildSpecialistAnswerEmail({ expert_id: "planning-director", status: "QUOTA_BLOCKED", requires_human_review: true, answer_text: null, answer_confidence: null, original_subject: null });
  assert(/limite diário/.test(quota.text) && /Nada foi alterado/.test(quota.text));
  const failedMail = consult.buildSpecialistAnswerEmail({ expert_id: "planning-director", status: "FAILED", requires_human_review: true, answer_text: null, answer_confidence: null, original_subject: null });
  assert(/Não foi possível obter a resposta/.test(failedMail.text));
});

// ------------------------------------------------------------------ 11. caminho de RISCO (store em memória)
const PROJECT = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "cccccccc-0000-4000-8000-000000000001";
const U_RESP = "aaaaaaaa-0000-4000-8000-000000000001";
const NOW = "2026-11-18T13:00:00.000Z";
const RECEIVED = "2026-11-18T12:30:00.000Z";
const recipients = () => new Map([[U_RESP, { userId: U_RESP, name: "Responsavel", email: "responsavel@axion.com.br", membershipStatus: "ACTIVE" }]]);
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: [U_RESP], senderDomain: "axion.com.br", severityMap: {}, pilotProjectConfirmedAt: NOW };
function riskStore({ riskLevel = "HIGH", area = "ENGENHARIA", state = "OPEN", inbound, informative = [] }) {
  const calls = { applied: [], updates: [], audits: [], confirmations: [] };
  const snap = { id: CASE_ID, projectId: PROJECT, sourceType: "SCHEDULE_COMPARISON", sourceId: "c", riskLevel, state, currentLevel: "RESPONSAVEL", topLevelReachedAt: null, currentResponsibleUserId: U_RESP, previousResponsibleUserId: null, slaActionId: "act-1", title: "T", reference: "W", activeForward: null, escalatedLevels: [] };
  const store = {
    async listInboundToProcess() { return inbound; },
    async loadProjectSnapshot() { return { config, recipients: recipients(), matrixRules: [], areaResponsibles: [], settings: { projectId: PROJECT, timezone: "America/Sao_Paulo", businessDayStartHour: 8, businessDayEndHour: 18, updatedAt: "" }, informativeAreas: informative }; },
    async loadCorrelationIndex() { return { byMessageId: new Map([["<root@acc>", CASE_ID]]), byReplyTokenHash: new Map(), byVisibleCode: new Map(), seenMessageIds: new Set() }; },
    async updateInboundMessage(id, patch) { calls.updates.push({ id, ...patch }); },
    async loadCaseSnapshotForAction() { return { snapshot: snap, record: { id: CASE_ID, area, riskLevel, status: "OPEN", state, visibleCode: "ABCD1234" }, alertRecipientUserIds: [U_RESP] }; },
    async audit(_p, events) { calls.audits.push(...events); },
    async applyTransition(caseId, transition) { calls.applied.push({ caseId, transition }); return { state: transition.caseUpdate.state, escalationId: null }; },
    async loadCaseForecastEvents() { return []; },
    async recordForecastReply() {},
    async enqueueReplyConfirmation(_p, _c, entry) { calls.confirmations.push(entry); },
  };
  return { store, calls };
}
const inboundMsg = (body, o = {}) => ({ id: o.id ?? "in-1", projectId: PROJECT, providerMessageId: o.id ?? "in-1", receivedAt: RECEIVED, bodyOriginal: body, headers: { from: o.from ?? "responsavel@axion.com.br", to: ["crm+alerta-tok@axion.com.br"], messageId: `<${o.id ?? "in-1"}@mail>`, inReplyTo: "<root@acc>", references: [], subject: "ESPECIALISTA [ACC-ALERTA:ABCD1234]", autoSubmitted: null, authenticationResults: o.auth === undefined ? AUTH_OK : o.auth } });
const recorderOk = () => {
  const records = [];
  return { records, specialistRecorder: async (input) => { records.push(input); return { ok: true, id: "consult-1" }; } };
};

await check("11. RISCO: ESPECIALISTA por e-mail registra a consulta e NÃO altera o alerta (sem transição, sem escalonamento, sem confirmação de tratamento); Expert pela área", async () => {
  for (const [area, expert, level] of [["ENGENHARIA", "engineering-director", "HIGH"], ["PLANEJAMENTO", "planning-director", "CRITICAL"], ["JURIDICO", "legal-consultant", "MEDIUM"], ["FINANCEIRO", "commercial-director", "LOW"], ["ESG_SSMA", "esg-director", "HIGH"]]) {
    const { store, calls } = riskStore({ area, riskLevel: level, inbound: [inboundMsg("ESPECIALISTA: qual a providência recomendada para este alerta?")] });
    const rec = recorderOk();
    const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, ...rec });
    assert(r.specialist === 1 && r.applied === 0, `${area}: ${JSON.stringify(r)}`);
    assert(calls.applied.length === 0, "NENHUMA transição de estado");
    assert(calls.confirmations.length === 0, "sem confirmação de tratamento (o recibo vai pela fila do ESPECIALISTA)");
    assert(rec.records.length === 1 && rec.records[0].record.expertId === expert && rec.records[0].record.severity === level && rec.records[0].record.requiresHumanReview === (level === "HIGH" || level === "CRITICAL"), `${area}: ${JSON.stringify(rec.records)}`);
    assert(rec.records[0].caseId === CASE_ID && rec.records[0].actorUserId === U_RESP && rec.records[0].recipientEmail === "responsavel@axion.com.br");
    assert(calls.audits.some((a) => a.action === "RISK_ALERT_EXPERT_EMAIL_CONSULT" && !/qual a provid/i.test(a.detail)), "auditoria sem o texto da pergunta");
    assert(/o alerta não foi alterado/i.test(calls.updates.at(-1).statusReason) && calls.updates.at(-1).status === "PROCESSED");
  }
});
await check("12. RISCO: desligado (padrão), sem gravador, mistura, pergunta curta, área informativa, alerta resolvido e remetente forjado => nada executado/gravado", async () => {
  const q = "ESPECIALISTA: qual a providência recomendada para este alerta?";
  const rec = recorderOk();
  let { store, calls } = riskStore({ inbound: [inboundMsg(q)] });
  let r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { ...rec });
  assert(rec.records.length === 0 && calls.applied.length === 0 && calls.confirmations[0]?.payloadSummary?.rejectionCode === "SPECIALIST_DISABLED", `desligado: ${JSON.stringify(calls.confirmations)}`);
  ({ store, calls } = riskStore({ inbound: [inboundMsg(q)] }));
  r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true });
  assert(r.reviewRequired === 1 && calls.updates.at(-1).status === "REVIEW_REQUIRED" && calls.applied.length === 0, "sem gravador => revisão humana");
  for (const [body, code] of [["ESPECIALISTA: ok", "SPECIALIST_QUESTION_REQUIRED"], ["ESPECIALISTA: posso fechar este alerta agora?\nRESOLVIDO: feito e conferido", "COMMAND_AMBIGUOUS"]]) {
    ({ store, calls } = riskStore({ inbound: [inboundMsg(body)] }));
    await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, ...rec });
    assert(calls.confirmations[0]?.payloadSummary?.rejectionCode === code && calls.applied.length === 0, `${code}: ${JSON.stringify(calls.confirmations)}`);
  }
  ({ store, calls } = riskStore({ inbound: [inboundMsg(q)], informative: ["ENGENHARIA"] }));
  r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, ...rec });
  assert(calls.updates.at(-1).status === "PROCESSED" && /informativa/i.test(calls.updates.at(-1).statusReason) && rec.records.length === 0);
  ({ store, calls } = riskStore({ inbound: [inboundMsg(q)], state: "RESOLVED" }));
  await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, ...rec });
  assert(calls.confirmations[0]?.payloadSummary?.rejectionCode === "ALREADY_RESOLVED" && rec.records.length === 0);
  for (const [from, auth] of [["invasor@gmail.com", undefined], ["responsavel@axion.com.br", AUTH_FAIL], ["responsavel@axion.com.br", null]]) {
    ({ store, calls } = riskStore({ inbound: [inboundMsg(q, { from, auth })] }));
    r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, ...rec });
    assert(r.unauthorized === 1 && rec.records.length === 0 && calls.applied.length === 0, `${from}/${auth}: ${JSON.stringify(r)}`);
  }
});
await check("13. RISCO: duplicada (mesma mensagem, recorder idempotente) não duplica; falha do gravador explica sem alterar; outros comandos continuam intactos", async () => {
  const q = "ESPECIALISTA: qual a providência recomendada para este alerta?";
  let { store, calls } = riskStore({ inbound: [inboundMsg(q)] });
  let r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, specialistRecorder: async () => ({ ok: false, code: "MESSAGE_ALREADY_APPLIED", text: "x" }) });
  assert(!r.specialist && calls.updates.at(-1).status === "PROCESSED", "duplicada: sem nova consulta");
  ({ store, calls } = riskStore({ inbound: [inboundMsg(q)] }));
  r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, specialistRecorder: async () => ({ ok: false, code: "READ_ONLY_PROFILE", text: "Seu perfil nesta obra é somente leitura: nada foi alterado." }) });
  assert(calls.confirmations[0]?.payloadSummary?.rejectionCode === "READ_ONLY_PROFILE" && calls.applied.length === 0);
  ({ store, calls } = riskStore({ riskLevel: "MEDIUM", inbound: [inboundMsg("RESOLVIDO: item entregue e conferido")] }));
  r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { specialistEnabled: true, ...recorderOk() });
  assert(r.applied === 1 && calls.applied.length === 1, "RESOLVIDO segue pela máquina de estados");
});
await check("14. RISCO owner-strict: token do item emitido a OUTRO destinatário é recusado (ligado) e aceito (desligado, padrão)", async () => {
  const tokens = new Map([["h", { tokenHash: "h", projectId: PROJECT, subjectKind: "RISK_CASE", subjectId: CASE_ID, recipientUserId: "aaaaaaaa-0000-4000-8000-0000000000ff", issuedAt: "2026-11-18T00:00:00Z", expiresAt: "2026-12-18T00:00:00Z", consumedByMessageId: null }]]);
  const reply = { id: "in-t", to: ["crm+alerta-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA@axion.com.br"] };
  const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
  const tok = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const tokensByHash = new Map([[pipeline.hashReplyToken(tok), tokens.get("h")]]);
  const run = async (ownerStrict) => {
    const { store, calls } = riskStore({ riskLevel: "MEDIUM", inbound: [{ ...inboundMsg("RESOLVIDO: item entregue e conferido"), headers: { ...inboundMsg("x").headers, to: reply.to } }] });
    const r = await processAlertReplies(store, PROJECT, NOW, ["crm@axion.com.br"], { itemReplyTokens: tokensByHash, ownerStrict, targetCandidates: [] });
    return { r, calls };
  };
  const off = await run(false);
  assert(off.calls.applied.length === 1, "desligado: aplicado como hoje");
  const on = await run(true);
  assert(on.calls.applied.length === 0 && on.calls.confirmations[0]?.payloadSummary?.rejectionCode === "TOKEN_NOT_OWNER", JSON.stringify(on.calls.confirmations));
});

// ------------------------------------------------------------------ 16. SSMA
await check("16. SSMA: ESPECIALISTA do responsável => Expert ESG/SSMA, ação corretiva INALTERADA, token não consumido; desligado por padrão; LEITURA/forjado recusados; ALTA/CRÍTICA => revisão humana", async () => {
  const { decideSsmaReply } = await import("../apps/web/lib/ssma/field-notifications/replies");
  const ssmaTarget = (o = {}) => ({ actionId: "a1", recordId: "r1", projectId: P, actionStatus: "ABERTA", responsibleUserId: U.RESP, severity: "ALTA", lastProcessedReceivedAt: null, ...o });
  const run = (body, o = {}) => decideSsmaReply({ message: message(body, o), target: o.target ?? ssmaTarget(), members, accMailboxes: ["crm@axion.com.br"], processedMessageIds: new Set(), specialistEnabled: o.enabled ?? true });
  const q = "ESPECIALISTA: o guarda-corpo provisório atende à NR-18 neste pavimento?";
  const ok = run(q);
  assert(ok.kind === "SPECIALIST" && ok.record.expertId === "esg-director" && ok.record.area === "ESG_SSMA" && ok.record.severity === "HIGH" && ok.record.requiresHumanReview === true, JSON.stringify(ok));
  assert(run(q, { target: ssmaTarget({ severity: "BAIXA" }) }).record.requiresHumanReview === false);
  assert(run(q, { target: ssmaTarget({ severity: "CRITICA" }) }).record.severity === "CRITICAL");
  assert(run(q, { enabled: false }).code === "SPECIALIST_DISABLED");
  assert(run(q, { from: "leo.leitura@axion.com.br" }).kind === "UNAUTHORIZED" && run(q, { from: "maria.souza@axion.com.br" }).reason === "SENDER_NOT_RESPONSIBLE");
  assert(run(q, { auth: AUTH_FAIL }).kind === "UNAUTHORIZED" && run(q, { from: "invasor@gmail.com" }).kind === "UNAUTHORIZED");
  assert(run(q, { from: "admin.obra@axion.com.br" }).kind === "SPECIALIST", "Administrador");
  assert(run("ESPECIALISTA: ok").code === "SPECIALIST_QUESTION_REQUIRED" && run("ESPECIALISTA: posso concluir?\nRESOLVIDO: feito e conferido").code === "COMMAND_AMBIGUOUS");
  assert(run(q, { target: ssmaTarget({ actionStatus: "CONCLUIDA" }) }).kind === "IGNORE", "ação concluída é ignorada como antes");
  assert(run("RESOLVIDO: guarda-corpo instalado e conferido").kind === "PROCESS", "comandos de tratamento intactos");
});

// ------------------------------------------------------------------ 15. AXIA nunca
await check("15. Código-fonte do ESPECIALISTA por e-mail não importa a AXIA nem aponta para as suas rotas; Expert vem só da área/tema", () => {
  for (const file of ["apps/web/lib/email-replies/specialist-email.ts", "apps/web/lib/email-replies/specialist-consultations.ts", "apps/web/lib/email-replies/specialist-flag.ts"]) {
    const src = read(file);
    assert(!/from\s+["'][^"']*(assistant|axia)[^"']*["']/i.test(src), `${file} importa a AXIA`);
    assert(!/\/axia|\/assistente|\/ajuda/i.test(src), `${file} aponta para rota da AXIA`);
  }
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
