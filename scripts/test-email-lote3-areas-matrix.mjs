// MATRIZ área × emissor × ação (Lote 3): para CADA área (Planejamento, Jurídico, SSMA/ESG, Engenharia, Comercial, Financeiro,
// Orçamento, Administrativo, Diretoria) e CADA emissor com resposta por e-mail, prova que:
//   1. o e-mail tem os quatro botões na ordem RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA (layout universal);
//   2. com a chave do ESPECIALISTA, o painel "Responder por e-mail" tem os quatro atalhos mailto (3 sem a chave);
//   3. a resposta RESOLVIDO / EM ANDAMENTO / ENVIAR PARA é aceita pelo decisor do canal (risco, token por item, SSMA);
//   4. ESPECIALISTA aciona o Expert da ÁREA (ou, sem Expert dedicado, o tema; sem tema, orienta) — nunca a AXIA — e não altera o item.
// Imprime a tabela (linhas "MATRIZ|...") usada em docs/email-respostas-matriz-area-emissor-acao.md.
// Sem data fixa: relógio real. Uso: node scripts/test-email-lote3-areas-matrix.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const risk = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails.ts");
const { buildContractAlertEmail } = await import("../apps/web/lib/email/templates/contract-alert-template.ts");
const { buildContractAlertBatchEmail } = await import("../apps/web/lib/email/templates/contract-alert-batch-template.ts");
const { buildSlaEscalationEmail } = await import("../apps/web/lib/email/templates/sla-escalation-template.ts");
const { buildWeeklyAlertDigestEmail } = await import("../apps/web/lib/email/templates/weekly-alert-digest-template.ts");
const ssma = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const { buildReplyMailtoLinks } = await import("../apps/web/lib/email-replies/reply-mailto");
const { decideTokenReply } = await import("../apps/web/lib/email-replies/token-reply-decision");
const { decideSsmaReply } = await import("../apps/web/lib/ssma/field-notifications/replies");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { SUGGESTED_INGESTION_ALERT_SEVERITY } = await import("../apps/web/lib/risk-alerts/pilot-readiness");
const { loadAccAlertLogos } = await import("../apps/web/lib/email/branding/load-acc-logo-inline-image.ts");
const { expertForArea } = await import("../apps/web/lib/ai/routing/expert-topics");

import path from "node:path";
import { fileURLToPath } from "node:url";
const webRoot = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "apps/web");

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
const table = [];
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

const BASE = "https://acc.homologacao.invalid";
const P = "11111111-1111-4111-8111-111111111111";
const TZ = "America/Sao_Paulo";
const NOW_MS = Date.now();
const NOW = new Date(NOW_MS).toISOString();
const RECEIVED = new Date(NOW_MS - 30 * 60_000).toISOString();
const FUTURE = new Date(NOW_MS + 5 * 86_400_000);
const FUTURE_BR = `${String(FUTURE.getUTCDate()).padStart(2, "0")}/${String(FUTURE.getUTCMonth() + 1).padStart(2, "0")}/${FUTURE.getUTCFullYear()}`;
const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const { availability } = loadAccAlertLogos({ maroon: true, inverted: true }, webRoot);
const BUTTONS = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"];
const AREAS = ["PLANEJAMENTO", "JURIDICO", "ESG_SSMA", "ENGENHARIA", "COMERCIAL", "FINANCEIRO", "ORCAMENTO", "ADMINISTRATIVO", "DIRETORIA"];
const AREA_LABEL = { PLANEJAMENTO: "Planejamento", JURIDICO: "Jurídico", ESG_SSMA: "SSMA/ESG", ENGENHARIA: "Engenharia", COMERCIAL: "Comercial", FINANCEIRO: "Financeiro", ORCAMENTO: "Orçamento", ADMINISTRATIVO: "Administrativo", DIRETORIA: "Diretoria" };
const SPEC_EXPERT = { PLANEJAMENTO: "planning-director", JURIDICO: "legal-consultant", ESG_SSMA: "esg-director", ENGENHARIA: "engineering-director", COMERCIAL: "commercial-director", FINANCEIRO: "commercial-director", ORCAMENTO: "commercial-director", ADMINISTRATIVO: null, DIRETORIA: null };
const Q_AREA = "ESPECIALISTA: qual a providência recomendada para este item agora?"; // sem tema: só a área decide
const orderOk = (html) => {
  const idx = BUTTONS.map((b) => html.indexOf(`>${b}<`));
  return idx.every((i) => i > 0) && [...idx].sort((a, b) => a - b).join() === idx.join();
};
const TOKEN = "T".repeat(32);
const links = (code) => buildReplyMailtoLinks({ mailbox: "crm@axion.com.br", token: TOKEN, visibleCode: code, evidenceAttachment: "OPTIONAL", forecastNeedsTime: false, specialist: true });
const mailtoCount = (html) => (html.match(/href="mailto:/g) ?? []).length;

// ------------------------------------------------------------------ pessoas do canal por token
const U = { RESP: "00000000-0000-4000-8000-0000000000b2", ADMIN: "00000000-0000-4000-8000-0000000000b1", ESC: "00000000-0000-4000-8000-0000000000b3" };
const members = [
  { userId: U.ADMIN, email: "admin.obra@axion.com.br", name: "Admin Obra", status: "ACTIVE", permission: "ADMINISTRADOR" },
  { userId: U.RESP, email: "carlos.evandro@axion.com.br", name: "Carlos Evandro", status: "ACTIVE", permission: "COLABORADOR" },
  { userId: U.ESC, email: "maria.souza@axion.com.br", name: "Maria Souza", status: "ACTIVE", permission: "COLABORADOR" },
];
const msg = (body, o = {}) => ({ providerMessageId: `m-${Math.random().toString(36).slice(2)}`, receivedAt: RECEIVED, bodyOriginal: body, headers: { from: o.from ?? "carlos.evandro@axion.com.br", to: ["crm+alerta-tok@axion.com.br"], messageId: "<x@mail>", inReplyTo: null, references: [], subject: "x", autoSubmitted: null, authenticationResults: AUTH_OK } });
const tokenDecide = (kind, area, body, severity = "MEDIUM") =>
  decideTokenReply({ message: msg(body), target: { kind, subjectId: "s1", projectId: P, actorUserIds: [U.RESP], closed: false, severity, currentResponsibleUserId: U.RESP, evidenceRequired: false, area }, members, accMailboxes: ["crm@axion.com.br"], processedMessageIds: new Set(), specialistEnabled: true });
const CMDS = {
  RESOLVIDO: "RESOLVIDO: item verificado e concluído com sucesso",
  "EM ANDAMENTO": `EM ANDAMENTO: tratando com o fornecedor\nPrevisão: ${FUTURE_BR}`,
  "ENVIAR PARA": "ENVIAR PARA: Maria Souza\nJustificativa: Maria responde por esta frente",
};

// ------------------------------------------------------------------ risco (store em memória, uma área por vez)
const U_RESP = "aaaaaaaa-0000-4000-8000-000000000001";
const U_L2 = "aaaaaaaa-0000-4000-8000-000000000002";
const U_L3 = "aaaaaaaa-0000-4000-8000-000000000003";
const CASE_ID = "cccccccc-0000-4000-8000-000000000001";
const settings = { projectId: P, timezone: TZ, businessDayStartHour: 8, businessDayEndHour: 18, updatedAt: "" };
const responsibles = AREAS.map((area) => ({ id: `r-${area}`, projectId: P, area, responsibleDirectUserId: U_RESP, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: null, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: U_L2, escalation1InvitationId: null, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U_L3, boardInvitationId: null, boardName: null, updatedAt: "" }));
const rule = (riskLevel) => ({ id: `rule-${riskLevel}`, projectId: P, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 2, boardAfterValue: 3, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const matrixRules = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule);
const recipients = () => new Map([[U_RESP, { userId: U_RESP, name: "Responsavel", email: "responsavel@axion.com.br", membershipStatus: "ACTIVE" }], [U_L2, { userId: U_L2, name: "Nivel Dois", email: "nivel.dois@axion.com.br", membershipStatus: "ACTIVE" }], [U_L3, { userId: U_L3, name: "Diretoria", email: "diretoria@axion.com.br", membershipStatus: "ACTIVE" }]]);
const config = { enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: [U_RESP, U_L2, U_L3], senderDomain: "axion.com.br", severityMap: SUGGESTED_INGESTION_ALERT_SEVERITY, pilotProjectConfirmedAt: NOW };
function riskRun(area, body, { informative = [], specialist = false } = {}) {
  const calls = { applied: [], updates: [], confirmations: [], audits: [] };
  const snap = { id: CASE_ID, projectId: P, sourceType: "SCHEDULE_COMPARISON", sourceId: "c", riskLevel: "MEDIUM", state: "OPEN", currentLevel: "RESPONSAVEL", topLevelReachedAt: null, currentResponsibleUserId: U_RESP, previousResponsibleUserId: null, slaActionId: "act-1", title: "T", reference: "W", activeForward: null, escalatedLevels: [] };
  const store = {
    async listInboundToProcess() { return [{ id: "in-1", projectId: P, providerMessageId: "in-1", receivedAt: RECEIVED, bodyOriginal: body, headers: { from: "responsavel@axion.com.br", to: ["crm+alerta-tok@axion.com.br"], messageId: "<in-1@mail>", inReplyTo: "<root@acc>", references: [], subject: "RE", autoSubmitted: null, authenticationResults: AUTH_OK } }]; },
    async loadProjectSnapshot() { return { config, recipients: recipients(), matrixRules, areaResponsibles: responsibles, settings, informativeAreas: informative }; },
    async loadCorrelationIndex() { return { byMessageId: new Map([["<root@acc>", CASE_ID]]), byReplyTokenHash: new Map(), byVisibleCode: new Map(), seenMessageIds: new Set() }; },
    async updateInboundMessage(id, patch) { calls.updates.push({ id, ...patch }); },
    async loadCaseSnapshotForAction() { return { snapshot: snap, record: { id: CASE_ID, area, riskLevel: "MEDIUM", status: "OPEN", state: "OPEN", visibleCode: "ABCD1234" }, alertRecipientUserIds: [U_RESP, U_L2] }; },
    async audit(_p, events) { calls.audits.push(...events); },
    async applyTransition(caseId, transition) { calls.applied.push({ caseId, transition }); return { state: transition.caseUpdate.state, escalationId: null }; },
    async loadCaseForecastEvents() { return []; },
    async recordForecastReply() {},
    async enqueueReplyConfirmation(_p, _c, entry) { calls.confirmations.push(entry); },
  };
  const records = [];
  return processAlertReplies(store, P, NOW, ["crm@axion.com.br"], { specialistEnabled: specialist, specialistRecorder: async (i) => { records.push(i); return { ok: true, id: "c1" }; }, targetCandidates: [] }).then((result) => ({ result, calls, records }));
}

// ------------------------------------------------------------------ emissores
const ctx = { projectId: P, projectName: "WEG", recipientName: "Ana", baseUrl: BASE, timeZone: TZ, generatedAt: NOW, actionButtons: [], logos: availability };
const riskBase = (area, code) => ({ kind: "IMMEDIATE", changed: false, area, caseTitle: "t", reference: "r", summary: "s", impact: "i", originPath: "documentos/x", slaActionId: "a", deadlineLabel: "Prazo", deadlineAt: NOW, levelLabel: "Responsável", previousLevelLabel: null, responsibleName: "Ana", escalationReason: null, recommendation: "r", requiresAcknowledgment: true, requiresJustification: false });
const contract = { recipientName: "Ana", projectName: "WEG", title: "t", summary: "s", relatedEventTitle: "e", contractualBasis: null, confrontationBlocks: [], impactedClause: { label: "8.2", text: "x" }, keyEvidence: [], potentialImpact: "p", recommendedAction: "r", responsibleName: "Bruno", dueDate: "25/11/2026", eventUrl: `${BASE}/ev/1`, actionButtons: [], hasInlineLogo: true, hasInlineInvertedLogo: true, quickActionUrls: { RESOLVIDO: `${BASE}/q?acao=RESOLVIDO`, EM_ANDAMENTO: `${BASE}/q?acao=EM_ANDAMENTO`, ENVIADO_PARA: `${BASE}/q?acao=ENVIADO_PARA` }, aiConsultUrl: `${BASE}/consulta`, repeatNotice: false };
const SSMA = { projectName: "WEG", recipientName: "Carlos", category: "EPI", location: "Pátio", description: "d", occurredAt: "06/11/2026 10:43", reportedByName: "Fulano", accUrl: `${BASE}/p/ssma-registros`, recordLink: { baseUrl: BASE, projectId: P, recordId: "22222222-2222-4222-8222-222222222222" }, dueDate: "06/11/2026", daysOverdue: 12, responsibleName: "Carlos", visibleCode: "2BF391C1" };

console.log("\n======================================");
console.log("MATRIZ ÁREA × EMISSOR × AÇÃO (Lote 3)");
console.log("======================================\n");

for (const area of AREAS) {
  await check(`${AREA_LABEL[area]} · risco imediato: 4 botões + 4 atalhos + RESOLVIDO/EM ANDAMENTO/ENVIAR PARA aplicados + ESPECIALISTA do Expert da área sem alterar o alerta`, async () => {
    const built = risk.buildImmediateRiskAlertEmail({ ...ctx, content: { ...riskBase(area), riskLevel: "MEDIUM" }, visibleCode: "HM01", caseId: CASE_ID, replyByEmail: links("ACC-ALERTA:HM01") });
    assert(orderOk(built.html), "ordem dos botões");
    assert(mailtoCount(built.html) === 4, `atalhos: ${mailtoCount(built.html)}`);
    const out = {};
    for (const [name, body] of Object.entries(CMDS)) {
      const { result, calls } = await riskRun(area, name === "ENVIAR PARA" ? "ENVIAR PARA: nivel.dois@axion.com.br favor assumir" : body);
      assert(result.applied === 1 || (result.recorded === 1 && name === "EM ANDAMENTO"), `${name}: ${JSON.stringify(result)}`);
      out[name] = calls.applied.length === 1 || calls.updates.some((u) => u.status === "PROCESSED") ? "OK" : "?";
    }
    const spec = await riskRun(area, Q_AREA, { specialist: true });
    const expected = SPEC_EXPERT[area];
    if (expected) {
      assert(spec.result.specialist === 1 && spec.records[0].record.expertId === expected && spec.calls.applied.length === 0, `${area}: ${JSON.stringify(spec.result)}`);
    } else {
      assert(!spec.result.specialist && spec.records.length === 0 && spec.calls.applied.length === 0 && spec.calls.confirmations[0]?.payloadSummary?.rejectionCode === "SPECIALIST_AREA_UNKNOWN", `${area}: ${JSON.stringify(spec.calls.confirmations)}`);
    }
    table.push([AREA_LABEL[area], "risco imediato (RISK_CASE)", "OK", "OK", "OK", expected ? `OK → ${expected}` : "orienta (sem Expert dedicado; cite o tema)"]);
  });

  await check(`${AREA_LABEL[area]} · SLA / resumo semanal: RESOLVIDO, EM ANDAMENTO, ENVIAR PARA e ESPECIALISTA pelo token por item`, () => {
    const sla = buildSlaEscalationEmail({ recipientName: "Ana", projectName: "WEG", severity: "ALTA", actionTitle: "t", currentResponsibleName: "Bruno", originalDeadline: "22/08/2026 14:00", overdueBy: "2h", previousLevelLabel: "Responsável", escalationLevelLabel: "Diretoria", recommendedAction: "r", eventUrl: `${BASE}/ev/1`, actionButtons: [], code: "SLA1", areaLabel: AREA_LABEL[area], logos: availability, replyByEmail: links("ACC-SLA:ABCD1234") });
    assert(orderOk(sla.html) && mailtoCount(sla.html) === 4, `SLA botões/atalhos ${mailtoCount(sla.html)}`);
    const dig = buildWeeklyAlertDigestEmail({ recipientName: "Ana", projectName: "WEG", responseUrl: `${BASE}/resposta`, logos: availability, items: [{ actionId: "aaaaaaaa-0000-4000-8000-000000000001", title: "t", description: "d", riskLevel: "MEDIUM", dueAt: "25/11/2026", replyByEmail: links("ACC-RESUMO:AAAAAAAA") }] });
    assert(orderOk(dig.html) && mailtoCount(dig.html) === 4, `resumo botões/atalhos ${mailtoCount(dig.html)}`);
    const expected = SPEC_EXPERT[area];
    for (const kind of ["SLA_ACTION", "WEEKLY_DIGEST_ITEM"]) {
      for (const name of Object.keys(CMDS)) assert(tokenDecide(kind, area, CMDS[name]).kind === "PROCESS", `${kind} ${name}`);
      const s = tokenDecide(kind, area, Q_AREA);
      if (expected) assert(s.kind === "SPECIALIST" && s.record.expertId === expected && s.record.area === area, `${kind}: ${JSON.stringify(s)}`);
      else assert(s.kind === "REJECT" && s.code === "SPECIALIST_AREA_UNKNOWN", `${kind}: ${JSON.stringify(s)}`);
    }
    const ee = expected ? `OK → ${expected}` : "orienta (sem Expert dedicado; cite o tema)";
    table.push([AREA_LABEL[area], "escalonamento de SLA (SLA_ACTION)", "OK", "OK", "OK", ee]);
    table.push([AREA_LABEL[area], "resumo semanal (WEEKLY_DIGEST_ITEM)", "OK", "OK", "OK", ee]);
  });
}

await check("Contrato (individual e em lote; sem área no modelo): 4 botões + 4 atalhos; ações pelo token; ESPECIALISTA por TEMA (jurídico/cronograma/custo/SSMA) ou orienta", () => {
  const single = buildContractAlertEmail({ ...contract, severity: "CRITICA", replyByEmail: links("ACC-CONTRATO:AAAAAAAA") });
  assert(orderOk(single.html) && mailtoCount(single.html) === 4, `individual ${mailtoCount(single.html)}`);
  const batch = buildContractAlertBatchEmail({ recipientName: "Ana", projectName: "WEG", batchUrl: `${BASE}/lote`, hasInlineLogo: true, hasInlineInvertedLogo: true, items: ["CRITICA", "MEDIA"].map((severity, i) => ({ eventId: `e${i}`, projectName: "WEG", title: "t", severity, riskDescription: "d", clauseLabel: "8.2", clauseText: "x", evidence: [], eventUrl: `${BASE}/ev/${i}`, respondItemUrl: `${BASE}/lote#${i}`, quickActionUrl: `${BASE}/q/${i}`, aiConsultUrl: `${BASE}/c/${i}`, replyByEmail: links(`ACC-CONTRATO:BBBBBBB${i}`) })) });
  assert(orderOk(batch.html) && mailtoCount(batch.html) === 8, `lote ${mailtoCount(batch.html)}`);
  for (const name of Object.keys(CMDS)) assert(tokenDecide("CONTRACT_ALERT_ITEM", null, CMDS[name]).kind === "PROCESS", name);
  const themes = [["A multa contratual prevista na cláusula se aplica?", "legal-consultant"], ["O atraso no cronograma afeta o caminho crítico?", "planning-director"], ["O custo e a medição do período estão corretos?", "commercial-director"], ["A fundação exige nova solução técnica?", "engineering-director"], ["Há acidente e questão de segurança envolvidos?", "esg-director"]];
  for (const [question, expert] of themes) {
    const d = tokenDecide("CONTRACT_ALERT_ITEM", null, `ESPECIALISTA: ${question}`);
    assert(d.kind === "SPECIALIST" && d.record.expertId === expert, `${question}: ${JSON.stringify(d)}`);
  }
  assert(tokenDecide("CONTRACT_ALERT_ITEM", null, Q_AREA).code === "SPECIALIST_AREA_UNKNOWN");
  table.push(["(qualquer; sem área no modelo)", "alerta de contrato individual e em lote (CONTRACT_ALERT_ITEM)", "OK", "OK", "OK", "OK → por tema (legal/planning/commercial/engineering/esg) ou orienta"]);
});

await check("SSMA/ESG: aviso de ação corretiva (atraso, confirmação, registro crítico) com 4 botões ATIVOS + 4 atalhos; RESOLVIDO/EM ANDAMENTO/ENVIAR PARA pelo token; ESPECIALISTA = ESG/SSMA", () => {
  const mk = (build) => build(links("ACC-SSMA:2BF391C1"));
  const overdue = ssma.buildOperationalOverdueActionEmail({ ...SSMA, severity: "ALTA", replyByEmail: links("ACC-SSMA:2BF391C1") });
  const conf = ssma.buildSsmaReplyConfirmationEmail({ ...SSMA, originalSubject: "x", severity: "ALTA", statusLabel: "Em andamento", forecastLine: null, pendingLine: null, outOfOrder: false, replyByEmail: links("ACC-SSMA:2BF391C1") });
  for (const m of [overdue, conf]) assert(orderOk(m.html) && !m.html.includes('aria-disabled="true"') && mailtoCount(m.html) === 4, `SSMA: ${mailtoCount(m.html)} / ${(m.html.match(/aria-disabled/g) ?? []).length}`);
  const target = { actionId: "a1", recordId: "r1", projectId: P, actionStatus: "ABERTA", responsibleUserId: U.RESP, severity: "ALTA", lastProcessedReceivedAt: null };
  const dec = (body) => decideSsmaReply({ message: msg(body), target, members, accMailboxes: ["crm@axion.com.br"], processedMessageIds: new Set(), specialistEnabled: true });
  for (const name of Object.keys(CMDS)) {
    const body = name === "EM ANDAMENTO" ? `EM ANDAMENTO: tratando\nPrevisão: ${FUTURE_BR} 16:00` : CMDS[name];
    assert(dec(body).kind === "PROCESS", name);
  }
  const s = dec(Q_AREA);
  assert(s.kind === "SPECIALIST" && s.record.expertId === "esg-director" && s.record.requiresHumanReview === true, JSON.stringify(s));
  void mk;
  table.push(["SSMA/ESG", "ação corretiva SSMA (atraso, confirmação, registro crítico) (SSMA_ACTION)", "OK (exige foto)", "OK", "OK", "OK → esg-director"]);
});

await check("Informativos por desenho (acidente SSMA, falha operacional, impacto de versão): sem botões e sem resposta por e-mail — DECISÃO PENDENTE registrada, nunca inventada", async () => {
  const info = await import("../apps/web/lib/email/informative-alert-content.ts");
  const built = info.buildSsmaAccidentAlertContent({ submissionId: "aaaaaaaa-0000-4000-8000-000000000001", projectName: "WEG", recipientName: "Ana", severity: "CRITICA", employeeName: "F", leaveClassification: "Com afastamento", occurredAt: "20/11/2026 10:00", informedCause: "c", consultUrl: `${BASE}/p/ssma-registros`, footer: "f", logos: availability });
  assert(!BUTTONS.some((b) => built.html.includes(`>${b}<`)) && mailtoCount(built.html) === 0, "informativo sem botões nem mailto");
  table.push(["SSMA/ESG", "acidente SSMA (informativo)", "n/a", "n/a", "n/a", "n/a — decisão pendente (ver relatório)"]);
  table.push(["Diretoria/TI", "falha operacional e impacto de versão (informativos)", "n/a", "n/a", "n/a", "n/a — decisão pendente (ver relatório)"]);
});

await check("Área informativa no piloto (FINANCEIRO): resposta por e-mail é REGISTRADA sem ação automática (política existente preservada)", async () => {
  const { result, calls } = await riskRun("FINANCEIRO", CMDS.RESOLVIDO, { informative: ["FINANCEIRO"] });
  assert(result.applied === 0 && calls.applied.length === 0 && result.recorded === 1 && /informativa/i.test(calls.updates.at(-1).statusReason), JSON.stringify(result));
});

console.log("\nMATRIZ|Área|Emissor|RESOLVIDO|EM ANDAMENTO|ENVIAR PARA|ESPECIALISTA");
for (const row of table) console.log(`MATRIZ|${row.join("|")}`);
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
