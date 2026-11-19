// REGRA: TODO alerta/e-mail operacional (qualquer área) sai com: quatro botões ATIVOS na ordem RESOLVIDO / EM ANDAMENTO /
// ENVIAR PARA / ESPECIALISTA (cinza #6B7280 e laranja #C2410C), acesso "FALE COM A AXIA" COM a foto da AXIA embutida (CID),
// e o logotipo oficial do ACC. A verificação é feita sobre o resultado FINAL (como o provider entrega), não só sobre o montador.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
register("./ts-module-resolver.mjs", import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(root, "apps/web");
const BASE = "https://acc.homologacao.invalid";
const P = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-11-18T15:00:00.000Z";
const TZ = "America/Sao_Paulo";
const BUTTONS = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"];

const risk = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails.ts");
const { buildContractAlertEmail } = await import("../apps/web/lib/email/templates/contract-alert-template.ts");
const { buildContractAlertBatchEmail } = await import("../apps/web/lib/email/templates/contract-alert-batch-template.ts");
const { buildSlaEscalationEmail } = await import("../apps/web/lib/email/templates/sla-escalation-template.ts");
const { buildWeeklyAlertDigestEmail } = await import("../apps/web/lib/email/templates/weekly-alert-digest-template.ts");
const ssma = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const { buildUniversalAlertEmail } = await import("../apps/web/lib/email/templates/universal-alert-template.ts");
const { applyVeraEmailHeader, loadVeraInlineImage, VERA_EMAIL_IMAGE_CID } = await import("../apps/web/lib/email/branding/vera-email-header.ts");
const { loadAccAlertLogos } = await import("../apps/web/lib/email/branding/load-acc-logo-inline-image.ts");

const { images: logoImages, availability } = loadAccAlertLogos({ maroon: true, inverted: true }, webRoot);
const SSMA = { projectName: "WEG", recipientName: "Carlos", category: "EPI", location: "Pátio", description: "d", occurredAt: "06/11/2026 10:43", reportedByName: "Fulano", accUrl: `${BASE}/p/ssma-registros`, dueDate: "06/11/2026", daysOverdue: 12, responsibleName: "Carlos", visibleCode: "2BF391C1" };
const riskBase = { kind: "IMMEDIATE", changed: false, area: "ENGENHARIA", caseTitle: "t", reference: "r", summary: "s", impact: "i", originPath: "documentos/x", slaActionId: "a", deadlineLabel: "Prazo", deadlineAt: NOW, levelLabel: "Responsável", previousLevelLabel: null, responsibleName: "Ana", escalationReason: null, recommendation: "r", requiresAcknowledgment: true, requiresJustification: false };
const ctx = { projectId: P, projectName: "WEG", recipientName: "Ana", baseUrl: BASE, timeZone: TZ, generatedAt: NOW, actionButtons: [], logos: availability };
const item = (n, lvl) => ({ caseKey: `K:${n}`, riskLevel: lvl, area: "JURIDICO", title: "t" + n, reference: "R" + n, summary: "s", deadlineAt: NOW, responsibleName: "Ana", originPath: "x", slaActionId: null, state: "OPEN" });
const caseIdByKey = new Map([["K:1", "cccccccc-0000-4000-8000-000000000001"], ["K:2", "cccccccc-0000-4000-8000-000000000002"]]);
const NEEDS = { logoNeeds: { maroon: true, inverted: true } };
const contract = { recipientName: "Ana", projectName: "WEG", title: "t", summary: "s", relatedEventTitle: "e", contractualBasis: null, confrontationBlocks: [], impactedClause: { label: "8.2", text: "x" }, keyEvidence: [], potentialImpact: "p", recommendedAction: "r", responsibleName: "Bruno", dueDate: "25/11/2026", eventUrl: `${BASE}/ev/1`, actionButtons: [], hasInlineLogo: true, hasInlineInvertedLogo: true, quickActionUrls: { RESOLVIDO: `${BASE}/q?acao=RESOLVIDO`, EM_ANDAMENTO: `${BASE}/q?acao=EM_ANDAMENTO`, ENVIADO_PARA: `${BASE}/q?acao=ENVIADO_PARA` }, aiConsultUrl: `${BASE}/consulta`, repeatNotice: false };

// Cobre engenharia, comercial/jurídico, planejamento, financeiro, SSMA, SLA, contratos e resumo semanal.
const EMITTERS = [
  ...["ENGENHARIA", "COMERCIAL", "JURIDICO", "PLANEJAMENTO", "FINANCEIRO", "ESG_SSMA"].map((area) => ({
    id: `risco imediato · ${area}`,
    build: () => risk.buildImmediateRiskAlertEmail({ ...ctx, content: { ...riskBase, riskLevel: "HIGH", area }, visibleCode: "HM01", caseId: "cccccccc-0000-4000-8000-000000000001" }),
  })),
  { id: "risco consolidado", build: () => risk.buildRiskDigestEmail({ ...ctx, content: { kind: "DIGEST", window: "2026-11-18", mediumItems: [item(1, "MEDIUM")], lowItems: [item(2, "LOW")], closedItems: [] }, caseIdByKey }) },
  { id: "risco confirmação de resposta", build: () => risk.buildAlertFollowUpEmail({ kind: "ACTION_CONFIRMATION", projectId: P, projectName: "WEG", recipientName: "Ana", baseUrl: BASE, timeZone: TZ, generatedAt: NOW, caseId: "cccccccc-0000-4000-8000-000000000001", caseTitle: "t", riskLevel: "HIGH", visibleCode: "HM01", area: "FINANCEIRO", logos: availability, rows: [["Status registrado", "Em andamento"]], paragraphs: [] }) },
  { id: "contrato individual", build: () => ({ ...buildContractAlertEmail({ ...contract, severity: "CRITICA" }), ...NEEDS }) },
  { id: "contrato em lote", build: () => ({ ...buildContractAlertBatchEmail({ recipientName: "Ana", projectName: "WEG", batchUrl: `${BASE}/lote`, hasInlineLogo: true, hasInlineInvertedLogo: true, items: ["CRITICA", "MEDIA"].map((severity, i) => ({ eventId: `e${i}`, projectName: "WEG", title: "t", severity, riskDescription: "d", clauseLabel: "8.2", clauseText: "x", evidence: [], eventUrl: `${BASE}/ev/${i}`, respondItemUrl: `${BASE}/lote#${i}`, quickActionUrl: `${BASE}/q/${i}`, aiConsultUrl: `${BASE}/c/${i}` })) }), ...NEEDS }) },
  { id: "escalonamento de SLA", build: () => ({ ...buildSlaEscalationEmail({ recipientName: "Ana", projectName: "WEG", severity: "ALTA", actionTitle: "t", currentResponsibleName: "Bruno", originalDeadline: "22/08/2026 14:00", overdueBy: "2h", previousLevelLabel: "Responsável", escalationLevelLabel: "Diretoria", recommendedAction: "r", eventUrl: `${BASE}/ev/1`, actionButtons: [], code: "SLA1", areaLabel: "Engenharia", logos: availability }), ...NEEDS }) },
  { id: "resumo semanal", build: () => ({ ...buildWeeklyAlertDigestEmail({ recipientName: "Ana", projectName: "WEG", responseUrl: `${BASE}/resposta`, logos: availability, items: [{ actionId: "aaaaaaaa-0000-4000-8000-000000000001", title: "t", description: "d", riskLevel: "MEDIUM", dueAt: "25/11/2026" }, { actionId: "bbbbbbbb-0000-4000-8000-000000000002", title: "t2", description: "d", riskLevel: "LOW", dueAt: null }] }), ...NEEDS }) },
  { id: "SSMA ação corretiva em atraso", build: () => ssma.buildOperationalOverdueActionEmail({ ...SSMA, severity: "ALTA" }) },
  { id: "SSMA confirmação de resposta", build: () => ssma.buildSsmaReplyConfirmationEmail({ ...SSMA, originalSubject: "x", severity: "ALTA", statusLabel: "Em andamento", forecastLine: null, pendingLine: null, outOfOrder: false }) },
  { id: "SSMA registro crítico", build: () => ssma.buildCriticalRecordEmail({ ...SSMA, severity: "CRITICA" }) },
  // Emissores server-only (acidente SSMA, falha operacional, impacto de versão): mesmo montador, com openUrl como no código real.
  ...["acidente SSMA", "falha operacional", "impacto de versão"].map((id) => ({
    id,
    build: () => buildUniversalAlertEmail({ recipientName: null, logos: availability, footer: "f", occurrence: { code: "", projectName: "WEG", areaLabel: "x", severity: "ALTA", title: "t", description: "d", stateLabel: "e", responsibleName: "", specialistLabel: "x", openUrl: `${BASE}/acc`, actions: {} } }),
  })),
];

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log("OK  ", name); } catch (e) { failed += 1; console.log("FAIL", name, "->", String(e.message).split("\n")[0]); }
};

for (const e of EMITTERS) {
  check(`${e.id}: quatro botões ativos + AXIA (acesso e foto) + logotipo ACC`, () => {
    const built = e.build();
    assert.ok(built.html, "sem HTML");
    // Resultado FINAL: como o provider de e-mail entrega.
    const out = applyVeraEmailHeader(
      { to: "x@exemplo.invalid", subject: built.subject ?? "s", text: built.text ?? "t", html: built.html, inlineImages: logoImages, correlationId: "t", vera: { projectId: P, context: "alerta" } },
      { axiaAvailable: true, baseUrl: BASE, loadImage: () => loadVeraInlineImage(webRoot) }
    );
    const html = out.html;
    const pos = BUTTONS.map((l) => html.indexOf(`>${l}<`));
    assert.ok(pos.every((i) => i > 0), "faltam botões: " + pos.join());
    assert.deepEqual(pos, [...pos].sort((a, b) => a - b), "ordem dos botões");
    assert.ok(!/aria-disabled="true"/.test(html), "há botão desativado");
    for (const l of BUTTONS) assert.match(html, new RegExp(`<a href="https?://[^"]+"[^>]*>[^<]*${l}<`), `botão ${l} sem link`);
    assert.ok(html.includes("#6B7280") && html.includes("#C2410C"), "cores dos botões");
    // Acesso à AXIA + foto da AXIA embutida.
    assert.ok(html.includes("FALE COM A AXIA"), "sem acesso à AXIA");
    assert.match(html, /data-vera-header="1"/);
    assert.ok(html.includes(`cid:${VERA_EMAIL_IMAGE_CID}`), "sem a foto da AXIA no cabeçalho");
    const axiaImg = (out.inlineImages ?? []).find((i) => i.cid === VERA_EMAIL_IMAGE_CID);
    assert.ok(axiaImg && axiaImg.contentBase64.length > 1000 && axiaImg.mimeType === "image/png", "foto da AXIA não anexada");
    // Logotipo oficial do ACC.
    assert.ok(/cid:acc-logo-(signature|inverted)/.test(html), "sem logotipo ACC");
    assert.ok((out.inlineImages ?? []).some((i) => /acc-logo/.test(i.cid)), "logotipo ACC não anexado");
  });
}

check("providers aplicam o cabeçalho da AXIA a TODO envio (gmail e fake)", () => {
  for (const f of ["gmail-email-provider.ts", "fake-email-provider.ts"]) {
    assert.match(readFileSync(path.join(webRoot, "lib/email", f), "utf8"), /applyVeraEmailHeader\(/, f);
  }
});
check("emissores server-only passam openUrl (botões ativos) e usam o template universal", () => {
  for (const f of ["send-ssma-accident-alert-email.ts", "send-system-health-alert-email.ts", "send-version-impact-review-email.ts"]) {
    const s = readFileSync(path.join(webRoot, "lib/email", f), "utf8");
    assert.ok(/buildUniversalAlertEmail\(/.test(s) && /openUrl:/.test(s), f);
  }
});
check("imagem da AXIA está no repositório e no tracing da Vercel", () => {
  assert.ok(loadVeraInlineImage(webRoot), "ajuda-acc-email.png ausente");
  assert.match(readFileSync(path.join(webRoot, "next.config.ts"), "utf8"), /public\/assistente\/ajuda-acc-email\.png/);
});

console.log(failed ? `\n${failed} FALHA(S)` : "\nTUDO OK");
process.exit(failed ? 1 : 0);
