// Layout universal em TODOS os e-mails de alerta: escalonamento de SLA, ocorrência/acidente de SSMA e resumo semanal
// (além dos de risco, contrato e SSMA de campo já cobertos por test-universal-alert-template.mjs / test-alert-box-templates.mjs).
// Puro, sem rede, sem banco, sem envio. Uso: node scripts/test-alert-layout-todos.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const { buildSlaEscalationEmail } = await import("../apps/web/lib/email/templates/sla-escalation-template.ts");
const { buildSsmaAccidentAlertEmail } = await import("../apps/web/lib/email/templates/ssma-accident-alert-template.ts");
const { buildWeeklyAlertDigestEmail } = await import("../apps/web/lib/email/templates/weekly-alert-digest-template.ts");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}

const ORDER = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"];
function assertFourButtonsInOrder(html, label) {
  let last = -1;
  for (const name of ORDER) {
    const at = html.indexOf(name, last + 1);
    assert(at > last, `${label}: botão ${name} ausente ou fora de ordem`);
    last = at;
  }
}

const sla = (over = {}) => ({
  recipientName: "Bruna",
  projectName: "WEG Fábrica de Arames",
  severity: "ALTA",
  actionTitle: "Responder cliente <b>x</b>",
  currentResponsibleName: "Carlos Mendes",
  originalDeadline: "22/08/2026 14:00",
  overdueBy: "2h15min",
  previousLevelLabel: "Nível 1 · Responsável",
  escalationLevelLabel: "2º Escalão",
  recommendedAction: "Ligar para o cliente",
  eventUrl: "https://acc.exemplo/proj-1/ledger/evt-1",
  actionButtons: [{ action: "RESPOND", url: "https://acc.exemplo/email-actions/tok-respond" }],
  logos: { maroon: true, inverted: false },
  actionCode: "ABCD1234",
  ...over,
});

// ------------------------------------------------------------------ escalonamento de SLA
check("SLA: quatro botões na ordem, cabeçalho com logotipo e rótulo de escalonamento", () => {
  const e = buildSlaEscalationEmail(sla());
  assertFourButtonsInOrder(e.html, "SLA");
  assert(e.html.includes("cid:") && e.logoNeeds.maroon && !e.logoNeeds.inverted, "logotipo vinho esperado no ALTO");
  assert(e.html.includes("RISCO ALTO · ESCALONADO PARA 2º ESCALÃO"), "cabeçalho com nível de escalonamento");
  assert(e.text.includes("Ocorrência: ABCD1234") && e.text.includes("Responsável atual: Carlos Mendes"));
});
check("SLA: CRÍTICO usa o logotipo invertido; sem logotipo disponível não referencia cid:", () => {
  const critical = buildSlaEscalationEmail(sla({ severity: "CRITICA", logos: { maroon: false, inverted: true } }));
  assert(critical.logoNeeds.inverted && !critical.logoNeeds.maroon);
  const none = buildSlaEscalationEmail(sla({ logos: undefined }));
  assert(!none.html.includes("cid:"), "nunca referencia imagem inexistente");
});
check("SLA: botões sem URL válida ficam desativados com motivo (nunca simulam ação); só o título abre a ação", () => {
  const e = buildSlaEscalationEmail(sla());
  assert(e.html.includes("acc-btn-disabled"), "botões desativados");
  assert(e.html.includes("Abra a ação no ACC para tratar este escalonamento."));
  assert(e.text.includes("RESOLVIDO: indisponível") && e.text.includes("ESPECIALISTA: indisponível"));
  assert(e.html.includes('href="https://acc.exemplo/proj-1/ledger/evt-1"'));
});
check("SLA: assunto e ações por token preservados (Outras ações); conteúdo escapado", () => {
  const e = buildSlaEscalationEmail(sla());
  assert(e.subject.includes("OBRA WEG FÁBRICA DE ARAMES") && /RISCO ALTO/.test(e.subject) && !e.subject.includes("Responder cliente"), e.subject);
  assert(e.html.includes("Outras ações") && e.html.includes("https://acc.exemplo/email-actions/tok-respond") && e.html.includes("RESPONDER AO ACC"));
  assert(!e.html.includes("<b>x</b>") && e.html.includes("&lt;b&gt;x&lt;/b&gt;"), "HTML do título deve ser escapado");
  assert(!e.html.includes("ACOMPANHAMENTO") && !e.text.includes("Acompanhamento"));
});

// ------------------------------------------------------------------ SSMA ocorrência/acidente
const accident = (over = {}) => ({
  submissionId: "11112222-3333-4444-5555-666677778888",
  projectName: "WEG",
  recipientName: "Carlos",
  severity: "CRITICA",
  employeeName: "Fulano <script>",
  leaveClassification: "Com afastamento",
  occurredAt: "18/11/2026 09:30",
  informedCause: "Queda de nível",
  accUrl: "https://acc.exemplo/weg/ssma/sub-1",
  logos: { maroon: false, inverted: true },
  ...over,
});
check("SSMA acidente: quatro botões, cabeçalho CRÍTICO com logotipo invertido, campos e link RESPONDER AO ACC", () => {
  const e = buildSsmaAccidentAlertEmail(accident());
  assertFourButtonsInOrder(e.html, "SSMA acidente");
  assert(e.logoNeeds.inverted && e.html.includes("RISCO CRÍTICO · OCORRÊNCIA/ACIDENTE"));
  for (const t of ["Funcionário", "Classificação", "Data e hora", "Causa informada"]) assert(e.text.includes(`${t}:`), t);
  assert(e.text.includes("RESPONDER AO ACC: https://acc.exemplo/weg/ssma/sub-1"));
});
check("SSMA acidente: assunto preservado, dados escapados, botões desativados com motivo", () => {
  const e = buildSsmaAccidentAlertEmail(accident({ severity: "ALTA", logos: { maroon: true, inverted: false } }));
  assert(e.subject.includes("WEG") && /ALTO/.test(e.subject), e.subject);
  assert(!e.html.includes("<script>") && e.html.includes("&lt;script&gt;"));
  assert(e.html.includes("acc-btn-disabled") && e.html.includes("Registre o tratamento da ocorrência pelo ACC"));
});

// ------------------------------------------------------------------ resumo semanal
const digestInput = {
  recipientName: "Reynaldo",
  projectName: "Obra Piloto",
  responseUrl: "https://acc.exemplo/obra/acoes/resumo-semanal/123",
  logos: { maroon: true, inverted: false },
  items: [
    { actionId: "low-0000-aaaa", title: "Baixo primeiro na entrada", description: "Detalhe baixo", riskLevel: "LOW", dueAt: null },
    { actionId: "medium-000-bbbb", title: "RFI pendente", description: "Responder sobre condutores", riskLevel: "MEDIUM", dueAt: "16/09/2026 07:00" },
  ],
};
check("Resumo semanal: uma caixa por item com os quatro botões; médio antes de baixo; logotipo vinho", () => {
  const e = buildWeeklyAlertDigestEmail(digestInput);
  const boxes = (e.html.match(/class="acc-actions-panel/g) ?? []).length;
  assert.equal(boxes, 2, "cada item tem seu conjunto de botões");
  assertFourButtonsInOrder(e.html, "Resumo semanal");
  assert(e.html.indexOf("RFI pendente") < e.html.indexOf("Baixo primeiro"));
  assert(e.logoNeeds.maroon && e.html.includes("cid:"));
  assert.equal(e.mediumCount, 1);
  assert.equal(e.lowCount, 1);
});
check("Resumo semanal: assunto preservado; os botões de tratamento abrem a MESMA tela de resposta; ESPECIALISTA desativado", () => {
  const e = buildWeeklyAlertDigestEmail(digestInput);
  assert(e.subject.startsWith("🔵 [RESUMO SEMANAL] RISCOS MÉDIOS E BAIXOS"));
  assert(e.html.includes('href="https://acc.exemplo/obra/acoes/resumo-semanal/123"'));
  assert(e.text.includes("RESOLVIDO: https://acc.exemplo/obra/acoes/resumo-semanal/123"));
  assert(e.text.includes("ESPECIALISTA: indisponível"));
  assert.equal((e.html.match(/Responder todos os itens no ACC/g) ?? []).length, 1, "um único chamado textual");
});

// ------------------------------------------------------------------ inventário estático
check("Inventário: todo montador de e-mail de alerta usa o layout universal (ou é declarado fora do escopo)", () => {
  const universal = [
    "apps/web/lib/risk-alerts/build-risk-alert-emails.ts",
    "apps/web/lib/ssma/field-notifications/content.ts",
    "apps/web/lib/email/templates/sla-escalation-template.ts",
    "apps/web/lib/email/templates/ssma-accident-alert-template.ts",
    "apps/web/lib/email/templates/weekly-alert-digest-template.ts",
  ];
  for (const f of universal) assert(/buildUniversal(Alert|Digest)Email/.test(read(f)), `${f} deveria usar o template universal`);
  // Alerta de contrato (individual e em lote) usa a mesma caixa/cabeçalho e o painel dos quatro botões.
  for (const f of ["apps/web/lib/email/templates/contract-alert-template.ts", "apps/web/lib/email/templates/contract-alert-batch-template.ts"]) {
    const src = read(f);
    assert(src.includes("buildUniversalActionsPanelHtml") && src.includes("buildAlertBoxHtml"), `${f} deveria usar caixa e painel universais`);
  }
  // Remetentes carregam o logotipo da gravidade ANTES de montar o HTML e não repetem a imagem na assinatura.
  for (const f of ["apps/web/lib/email/send-sla-escalation-email.ts", "apps/web/lib/email/send-ssma-accident-alert-email.ts", "apps/web/lib/email/send-weekly-alert-digest-email.ts"]) {
    const src = read(f);
    assert(src.includes("loadAccAlertLogos") && /appendAccEmailSignature\([^)]*false\)/.test(src), `${f}: logotipo da gravidade e assinatura sem imagem duplicada`);
  }
  // Fora do escopo por não serem avisos de ocorrência a um responsável (sem caso, ação ou botão aplicável).
  const outOfScope = ["send-system-health-alert-email.ts", "send-version-impact-review-email.ts", "action-request-notification-core.ts"];
  for (const f of outOfScope) assert(!read(`apps/web/lib/email/${f}`).includes("buildUniversal"), `${f} mudou: reavaliar o escopo`);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
