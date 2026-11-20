// P2 — atalhos "Responder por e-mail" (mailto com token POR ITEM).
// PRESENTES só nos tipos com processamento efetivo por e-mail: risco (imediato, escalonamento, acompanhamento e CADA item do
// consolidado, cada um com o seu token) e aviso de ação corretiva SSMA ao responsável — e, desde a N3, escalonamento de SLA,
// resumo semanal (por item) e contrato individual/lote (por item), quando o emissor informa o token (ver
// test-email-replies-n3-pure.mjs). AUSENTES nos demais (registro crítico SSMA, escalonamento SSMA à Matriz, acidente, falha
// técnica, impacto de versão) — nenhum e-mail aparenta ação operacional inexistente.
// Token gravado (hash) ANTES do envio; link < 2000 caracteres e codificado; nada de dado do alerta no corpo.
// Uso: node scripts/test-email-reply-mailto.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
// Ganchos de simulação (stubs de server-only / admin) para importar o ciclo de alertas sem rede.
register("./lib/weg-alert-sim/hooks.mjs", import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const risk = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails.ts");
const { issueReplyMailtoForCase } = await import("../apps/web/lib/risk-alerts/run-risk-alert-cycle");
const { buildContractAlertEmail } = await import("../apps/web/lib/email/templates/contract-alert-template.ts");
const { buildContractAlertBatchEmail } = await import("../apps/web/lib/email/templates/contract-alert-batch-template.ts");
const { buildSlaEscalationEmail } = await import("../apps/web/lib/email/templates/sla-escalation-template.ts");
const { buildWeeklyAlertDigestEmail } = await import("../apps/web/lib/email/templates/weekly-alert-digest-template.ts");
const ssma = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const ssmaEsc = await import("../apps/web/lib/ssma/field-notifications/escalation-content.ts");
const mailto = await import("../apps/web/lib/email-replies/reply-mailto.ts");
const tokens = await import("../apps/web/lib/email-replies/reply-tokens.ts");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

const BASE = "https://acc.homologacao.invalid";
const P = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-11-20T15:00:00.000Z";
const TZ = "America/Sao_Paulo";
const MAILBOX = "crm@axion.com.br";
const logos = { maroon: true, inverted: true };
const C1 = "cccccccc-0000-4000-8000-000000000001";
const C2 = "cccccccc-0000-4000-8000-000000000002";
const C3 = "cccccccc-0000-4000-8000-000000000003";

const MAILTO_RE = /mailto:[^"\s<]+/g;
const mailtosOf = (s) => [...new Set((s.match(MAILTO_RE) ?? []).map((m) => m.replace(/&amp;/g, "&")))];
const tokenOf = (url) => /\+alerta-([A-Za-z0-9_-]+)@/.exec(url)?.[1] ?? null;

async function issue(store, caseId, code, riskLevel = "HIGH") {
  const issued = await tokens.issueEmailReplyToken(store, { projectId: P, subjectKind: "RISK_CASE", subjectId: caseId, recipientUserId: "u1", nowIso: NOW });
  return mailto.buildReplyMailtoLinks({ mailbox: MAILBOX, token: issued.token, visibleCode: `ACC-ALERTA:${code}`, evidenceAttachment: riskLevel === "HIGH" ? "REQUIRED_FILE" : "OPTIONAL", forecastNeedsTime: riskLevel === "HIGH" });
}

const riskBase = { kind: "IMMEDIATE", changed: false, area: "ENGENHARIA", caseTitle: "Concretagem", reference: "R1", summary: "Atraso na concretagem do bloco B", impact: "i", originPath: "documentos/x", slaActionId: "a", deadlineLabel: "Prazo", deadlineAt: NOW, levelLabel: "Responsável", previousLevelLabel: null, responsibleName: "Ana", escalationReason: null, recommendation: "r", requiresAcknowledgment: true, requiresJustification: false, riskLevel: "HIGH" };
const ctx = { projectId: P, projectName: "WEG", recipientName: "Ana", baseUrl: BASE, timeZone: TZ, generatedAt: NOW, actionButtons: [], logos };

await check("1. Risco imediato com atalhos: HTML e texto trazem os TRÊS mailto (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA) do token do item", async () => {
  const store = tokens.createMemoryEmailReplyTokenStore();
  const links = await issue(store, C1, "HM01");
  const built = risk.buildImmediateRiskAlertEmail({ ...ctx, content: riskBase, visibleCode: "HM01", caseId: C1, replyByEmail: links });
  const html = mailtosOf(built.html);
  const text = mailtosOf(built.text);
  assert(html.length === 3 && text.length === 3, `html ${html.length} texto ${text.length}`);
  assert(html.every((u) => tokenOf(u) && tokens.hashEmailReplyToken(tokenOf(u)) === store.rows[0].tokenHash), "token do item (hash gravado)");
  for (const label of ["RESOLVIDO por e-mail", "EM ANDAMENTO por e-mail", "ENVIAR PARA por e-mail"]) assert(built.html.includes(`>${label}<`), label);
  assert(built.html.includes("Responder por e-mail") && built.text.includes("RESPONDER POR E-MAIL"));
  assert(built.html.includes("&amp;body="), "& escapado no atributo href");
  for (const u of html) {
    assert(u.length < 2000 && mailto.isSafeReplyMailto(u), u);
    const body = decodeURIComponent(u.split("&body=")[1]);
    assert(!/Concretagem|concretagem|bloco B|WEG|Ana/.test(body), `dado do alerta no corpo: ${body}`);
  }
  const plain = risk.buildImmediateRiskAlertEmail({ ...ctx, content: riskBase, visibleCode: "HM01", caseId: C1 });
  assert(mailtosOf(plain.html).length === 0 && mailtosOf(plain.text).length === 0, "sem atalhos quando não emitidos");
});
await check("2. Consolidado: CADA item aberto tem o SEU token (tokens distintos); item encerrado não recebe atalho", async () => {
  const store = tokens.createMemoryEmailReplyTokenStore();
  const item = (n, lvl, state = "OPEN") => ({ caseKey: `K:${n}`, riskLevel: lvl, area: "JURIDICO", title: "t" + n, reference: "R" + n, summary: "s", deadlineAt: NOW, responsibleName: "Ana", originPath: "x", slaActionId: null, state });
  const caseIdByKey = new Map([["K:1", C1], ["K:2", C2], ["K:3", C3]]);
  const replyByEmailByCaseId = new Map([[C1, await issue(store, C1, "AA000001", "MEDIUM")], [C2, await issue(store, C2, "AA000002", "LOW")], [C3, await issue(store, C3, "AA000003", "LOW")]]);
  const built = risk.buildRiskDigestEmail({ ...ctx, content: { kind: "DIGEST", window: "2026-11-18", mediumItems: [item(1, "MEDIUM")], lowItems: [item(2, "LOW")], closedItems: [item(3, "LOW", "CLOSED")] }, caseIdByKey, replyByEmailByCaseId });
  const urls = mailtosOf(built.html);
  const toks = new Set(urls.map(tokenOf));
  assert(urls.length === 6 && toks.size === 2, `mailto ${urls.length}, tokens ${toks.size}`);
  assert(!urls.some((u) => tokenOf(u) === tokenOf(replyByEmailByCaseId.get(C3).RESOLVIDO)), "encerrado sem atalho");
  assert(urls.some((u) => decodeURIComponent(u).includes("[ACC-ALERTA:AA000001]")) && urls.some((u) => decodeURIComponent(u).includes("[ACC-ALERTA:AA000002]")), "assunto com o código visível de cada item");
});
await check("3. Ciclo: issueReplyMailtoForCase grava o hash ANTES (store), usa a caixa de resposta; área informativa, sem caixa ou sem store => sem atalho", async () => {
  assert(typeof issueReplyMailtoForCase === "function", "função exportada pelo ciclo");
  const store = tokens.createMemoryEmailReplyTokenStore();
  const sendCtx = { projectId: P, nowIso: NOW, replyTokens: store, snapshot: { replyMailbox: MAILBOX, informativeAreas: ["FINANCEIRO"] } };
  const links = await issueReplyMailtoForCase(sendCtx, { caseId: C1, recipientUserId: "u1", visibleCode: "HM01", riskLevel: "HIGH", area: "ENGENHARIA" });
  assert(links && store.rows.length === 1 && store.rows[0].subjectKind === "RISK_CASE" && store.rows[0].subjectId === C1 && store.rows[0].recipientUserId === "u1");
  assert(tokens.hashEmailReplyToken(tokenOf(links.RESOLVIDO)) === store.rows[0].tokenHash);
  assert(decodeURIComponent(links.EM_ANDAMENTO).includes("Previsão: dd/mm/aaaa hh:mm"), "ALTO pede horário");
  assert((await issueReplyMailtoForCase(sendCtx, { caseId: C1, recipientUserId: "u1", visibleCode: "HM01", riskLevel: "HIGH", area: "FINANCEIRO" })) === null, "área informativa");
  assert((await issueReplyMailtoForCase({ ...sendCtx, snapshot: { replyMailbox: null } }, { caseId: C1, recipientUserId: "u1", visibleCode: null, riskLevel: "LOW", area: "ENGENHARIA" })) === null, "sem caixa");
  assert((await issueReplyMailtoForCase({ ...sendCtx, replyTokens: null }, { caseId: C1, recipientUserId: "u1", visibleCode: null, riskLevel: "LOW", area: "ENGENHARIA" })) === null, "sem store");
  const failing = { ...sendCtx, replyTokens: { insert: async () => { throw new Error("db"); } } };
  assert((await issueReplyMailtoForCase(failing, { caseId: C1, recipientUserId: "u1", visibleCode: null, riskLevel: "LOW", area: "ENGENHARIA" })) === null, "falha ao gravar => sem link (nunca link sem hash)");
});
await check("4. Acompanhamento de risco (encaminhado / confirmação) aceita atalhos; SSMA ao responsável (atraso, previsão vencida, confirmação) também", async () => {
  const store = tokens.createMemoryEmailReplyTokenStore();
  const fw = risk.buildAlertFollowUpEmail({ kind: "FORWARD", projectId: P, projectName: "WEG", recipientName: "Ana", baseUrl: BASE, timeZone: TZ, generatedAt: NOW, caseId: C1, caseTitle: "t", riskLevel: "HIGH", visibleCode: "HM01", area: "ENGENHARIA", logos, rows: [], paragraphs: [], replyByEmail: await issue(store, C1, "HM01") });
  assert(mailtosOf(fw.html).length === 3);
  const token = tokens.generateEmailReplyToken();
  const sm = ssma.ssmaReplyMailto(token, "2BF391C1", MAILBOX, "ALTA");
  const SSMA = { projectName: "WEG", recipientName: "Carlos", category: "EPI", location: "Pátio", description: "d", occurredAt: "06/11/2026 10:43", reportedByName: "Fulano", accUrl: `${BASE}/p/ssma-registros`, recordLink: { baseUrl: BASE, projectId: P, recordId: "22222222-2222-4222-8222-222222222222" }, dueDate: "06/11/2026", daysOverdue: 12, responsibleName: "Carlos", visibleCode: "2BF391C1" };
  const overdue = ssma.buildOperationalOverdueActionEmail({ ...SSMA, severity: "ALTA", replyByEmail: sm });
  assert(mailtosOf(overdue.html).length === 3 && mailtosOf(overdue.text).length === 3, "aviso de atraso");
  assert(decodeURIComponent(sm.RESOLVIDO).includes("FOTO de evidência") && decodeURIComponent(sm.RESOLVIDO).includes("[ACC-SSMA:2BF391C1]"), "SSMA pede a foto");
  const followCtx = { projectName: "WEG", recipientName: "Carlos", severity: "ALTA", category: "EPI", location: "Pátio", description: "d", occurredAt: "x", accUrl: BASE, recordLink: SSMA.recordLink, visibleCode: "2BF391C1", responsibleName: "Carlos", assumeDue: "x", completeDue: null, forecastLine: "x" };
  const expired = ssmaEsc.buildSsmaForecastExpiredEmail({ ...followCtx, forecastAt: "x", escalationState: "x", replyByEmail: sm });
  assert(mailtosOf(expired.html).length === 3, "previsão vencida ao responsável");
  const conf = ssma.buildSsmaReplyConfirmationEmail({ ...SSMA, originalSubject: "x", severity: "ALTA", statusLabel: "Em andamento", forecastLine: null, pendingLine: null, outOfOrder: false, replyByEmail: sm });
  assert(mailtosOf(conf.html).length === 3, "confirmação");
  const rejected = ssma.buildSsmaReplyConfirmationEmail({ ...SSMA, originalSubject: "x", severity: "ALTA", statusLabel: "NÃO aplicado", forecastLine: null, pendingLine: "Envie a foto.", outOfOrder: false, rejected: true });
  assert(/RESPOSTA NÃO APLICADA/.test(rejected.html) && !/RESPOSTA REGISTRADA/.test(rejected.html) && /Envie a foto/.test(rejected.text), "recusa nunca afirma registro");
  assert(ssma.ssmaReplyMailto(token, "X", "", "ALTA") === null, "sem caixa => sem atalho");
});
await check("5. AUSENTES quando o emissor não informa atalhos (SLA, resumo semanal, contrato individual/lote sem token emitido) e nos tipos SEM processamento (registro crítico SSMA, escalonamento SSMA)", () => {
  const none = {
    "escalonamento de SLA": buildSlaEscalationEmail({ recipientName: "Ana", projectName: "WEG", severity: "ALTA", actionTitle: "t", currentResponsibleName: "Bruno", originalDeadline: "x", overdueBy: "2h", previousLevelLabel: "Responsável", escalationLevelLabel: "Diretoria", recommendedAction: "r", eventUrl: `${BASE}/ev/1`, actionButtons: [], code: "SLA1", areaLabel: "Engenharia", logos }),
    "resumo semanal": buildWeeklyAlertDigestEmail({ recipientName: "Ana", projectName: "WEG", responseUrl: `${BASE}/resposta`, logos, items: [{ actionId: "aaaaaaaa-0000-4000-8000-000000000001", title: "t", description: "d", riskLevel: "MEDIUM", dueAt: "25/11/2026" }] }),
    "contrato individual": buildContractAlertEmail({ recipientName: "Ana", projectName: "WEG", title: "t", summary: "s", relatedEventTitle: "e", contractualBasis: null, confrontationBlocks: [], impactedClause: { label: "8.2", text: "x" }, keyEvidence: [], potentialImpact: "p", recommendedAction: "r", responsibleName: "Bruno", dueDate: "x", eventUrl: `${BASE}/ev/1`, actionButtons: [], hasInlineLogo: true, hasInlineInvertedLogo: true, quickActionUrls: { RESOLVIDO: `${BASE}/q`, EM_ANDAMENTO: `${BASE}/q2`, ENVIADO_PARA: `${BASE}/q3` }, aiConsultUrl: `${BASE}/c`, repeatNotice: false, severity: "CRITICA" }),
    "contrato em lote": buildContractAlertBatchEmail({ recipientName: "Ana", projectName: "WEG", batchUrl: `${BASE}/lote`, hasInlineLogo: true, hasInlineInvertedLogo: true, items: [{ eventId: "e1", projectName: "WEG", title: "t", severity: "ALTA", riskDescription: "d", clauseLabel: "8.2", clauseText: "x", evidence: [], eventUrl: `${BASE}/ev/1`, respondItemUrl: `${BASE}/lote#1`, quickActionUrl: `${BASE}/q/1`, aiConsultUrl: `${BASE}/c/1` }] }),
    "registro crítico SSMA": ssma.buildCriticalRecordEmail({ projectName: "WEG", recipientName: "C", category: "EPI", location: "x", description: "d", occurredAt: "x", reportedByName: "F", accUrl: BASE }),
    "escalonamento SSMA à Matriz": ssmaEsc.buildSsmaEscalationEmail({ projectName: "WEG", recipientName: "Gestor", severity: "ALTA", category: "EPI", location: "x", description: "d", occurredAt: "x", accUrl: BASE, visibleCode: "X", responsibleName: "C", assumeDue: "x", completeDue: null, forecastLine: "x", levelLabel: "Nível 2 · Gestor", thresholdAt: "x", gestorSkipped: false, reissue: false, priorNotice: null }),
  };
  for (const [name, built] of Object.entries(none)) {
    assert(mailtosOf(`${built.html}\n${built.text}`).length === 0, `${name} não pode ter mailto`);
    assert(!/Responder por e-mail|RESPONDER POR E-MAIL/.test(`${built.html}${built.text}`), `${name}: bloco de resposta por e-mail`);
  }
});
await check("6. Emissores sem processamento NÃO usam token por item nem atalho (código-fonte): acidente, falha técnica, impacto de versão (SLA, resumo e contrato passaram a ter processamento — N3)", () => {
  for (const rel of [
    "apps/web/lib/email/send-ssma-accident-alert-email.ts",
    "apps/web/lib/email/send-system-health-alert-email.ts",
    "apps/web/lib/email/send-version-impact-review-email.ts",
  ]) {
    const src = read(rel);
    assert(!/replyByEmail|mailto:|email_reply_tokens|issueEmailReplyToken|buildReplyMailto/.test(src), rel);
  }
  // O processamento por e-mail existe para RISK_CASE, SSMA_ACTION e (N3) SLA_ACTION, WEEKLY_DIGEST_ITEM, CONTRACT_ALERT_ITEM.
  assert([...tokens.EMAIL_REPLY_PROCESSABLE_KINDS].sort().join(",") === "CONTRACT_ALERT_ITEM,RISK_CASE,SLA_ACTION,SSMA_ACTION,WEEKLY_DIGEST_ITEM");
  // Escalonamento SSMA à Matriz (Gestor/Diretoria) não recebe atalho no envio.
  const followUp = read("apps/web/lib/ssma/field-notifications/follow-up.ts");
  const escalationCall = followUp.slice(followUp.indexOf("buildSsmaEscalationEmail({"), followUp.indexOf("buildSsmaEscalationEmail({") + 400);
  assert(!/replyByEmail/.test(escalationCall), "escalonamento SSMA sem atalho");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
