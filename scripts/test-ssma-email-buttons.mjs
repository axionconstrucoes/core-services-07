// E-mails SSMA (alerta, escalonamento e confirmação de resposta) no layout universal: cada botão ativo abre o REGISTRO
// específico com a ação correspondente pré-selecionada (nunca a lista genérica, nunca executa nada ao abrir); botões sem
// fluxo de SSMA no ACC (ENVIAR PARA, ESPECIALISTA) ficam no layout, desativados e com o motivo. Sem campos repetidos.
import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const c = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const esc = await import("../apps/web/lib/ssma/field-notifications/escalation-content.ts");
const r = await import("../apps/web/lib/ssma/field-notifications/replies.ts");
const link = await import("../apps/web/lib/ssma/field-records/deep-link.ts");

const BASE = "https://acc.axion.com.br";
const P = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const LIST = `${BASE}/${P}/ssma-registros`;
const recordLink = { baseUrl: BASE, projectId: P, recordId: R };
const RECORD = `${BASE}/ssma/${P}?registro=${R}`;
const amp = (u) => u.replace(/&/g, "&amp;");

const confirmation = (extra = {}) => c.buildSsmaReplyConfirmationEmail({ projectName: "WEG", recipientName: "Carlos", category: "EPI", location: "Pátio", visibleCode: "AB12CD34",
  originalSubject: "RES: [RISCO ALTO] ACC", severity: "ALTA", statusLabel: r.ssmaStatusLabel("OTHER"), forecastLine: null, pendingLine: null, outOfOrder: false, accUrl: LIST, recordLink, ...extra });
const SSMA = { projectName: "WEG", recipientName: "Carlos", category: "EPI", location: "Pátio", description: "Guarda-corpo ausente.", occurredAt: "06/11/2026 10:43", reportedByName: "Fulano",
  accUrl: LIST, recordLink, dueDate: "06/11/2026", daysOverdue: 12, responsibleName: "Carlos", visibleCode: "2BF391C1" };
const overdue = c.buildOperationalOverdueActionEmail({ ...SSMA, severity: "ALTA" });
const escalation = esc.buildSsmaEscalationEmail({ projectName: "WEG", recipientName: "Gestor", severity: "ALTA", category: "EPI", location: "Pátio", description: "d", occurredAt: "06/11/2026 10:43",
  accUrl: LIST, recordLink, visibleCode: "2BF391C1", responsibleName: "Carlos", assumeDue: "06/11/2026 12:00", completeDue: "07/11/2026 12:00", forecastLine: "PENDENTE",
  levelLabel: "Nível 2 · Gestor", thresholdAt: "08/11/2026 12:00", gestorSkipped: false, reissue: false, priorNotice: null });
const count = (html, needle) => html.split(needle).length - 1;

let fail = 0;
const check = (n, f) => { try { f(); console.log("OK  ", n); } catch (e) { fail++; console.log("FAIL", n, e.message); } };

for (const [id, m] of [["confirmação", confirmation()], ["ação em atraso", overdue], ["escalonamento", escalation], ["registro crítico", c.buildCriticalRecordEmail(SSMA)]]) {
  check(`${id}: quatro botões na ordem; RESOLVIDO e EM ANDAMENTO abrem o registro com a ação pré-selecionada`, () => {
    const order = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"].map((b) => m.html.indexOf(`>${b}<`));
    assert.ok(order.every((i) => i > 0) && [...order].sort((a, b) => a - b).join() === order.join(), "ordem/presença");
    assert.ok(m.html.includes(`href="${amp(`${RECORD}&acao=CONCLUIDA`)}"`), "RESOLVIDO → concluir ação do registro");
    assert.ok(m.html.includes(`href="${amp(`${RECORD}&acao=ANDAMENTO`)}"`), "EM ANDAMENTO → registrar andamento do registro");
    assert.ok(!m.html.includes(`href="${LIST}"`), "nenhum link para a lista genérica");
    assert.ok(m.text.includes(`ABRIR NO ACC: ${RECORD}`), "texto simples aponta para o registro");
  });
  check(`${id}: ENVIAR PARA e ESPECIALISTA desativados com o motivo (sem fluxo de SSMA no ACC)`, () => {
    assert.equal(count(m.html, 'aria-disabled="true"'), 2);
    assert.ok(m.html.includes(c.SSMA_FORWARD_UNAVAILABLE) && m.html.includes(c.SSMA_SPECIALIST_UNAVAILABLE));
    assert.ok(m.html.includes("#6B7280") && m.html.includes("#E5E7EB"), "ativos cinza, desativados cinza-claro");
  });
}

check("sem registro identificado: os quatro botões desativados com o motivo (nunca a lista genérica)", () => {
  const m = confirmation({ recordLink: null });
  assert.equal(count(m.html, 'aria-disabled="true"'), 4);
  assert.ok(m.html.includes(c.SSMA_RECORD_UNKNOWN));
  assert.ok(m.text.includes(`ABRIR NO ACC: ${LIST}`), "reserva: lista da obra no link ABRIR NO ACC");
});

check("link do registro: só aceita UUID e ação conhecida; nunca executa (apenas pré-seleciona)", () => {
  assert.deepEqual(link.parseSsmaRecordLink({ registro: R, acao: "concluida" }), { recordId: R, action: "CONCLUIDA" });
  assert.deepEqual(link.parseSsmaRecordLink({ registro: R, acao: "EXCLUIR" }), { recordId: R, action: null });
  assert.deepEqual(link.parseSsmaRecordLink({ registro: "1 OR 1=1", acao: "ANDAMENTO" }), { recordId: null, action: null });
  assert.deepEqual(link.parseSsmaRecordLink({ registro: [R, R], acao: "ANDAMENTO" }), { recordId: null, action: null });
});

check("sem campos repetidos: ação corretiva em atraso", () => {
  assert.equal(count(overdue.html, "Responsável atual:"), 1);
  assert.equal(count(overdue.html, "Prazo original"), 1, "prazo só no campo próprio");
  assert.ok(overdue.text.includes("Prazo original da ação: 06/11/2026") && overdue.text.includes("Responsável atual: Carlos"), "texto simples mantém os fatos");
});
check("sem campos repetidos: escalonamento", () => {
  assert.equal(count(escalation.html, "Responsável atual:"), 1);
});
check("sem campos repetidos: confirmação (obra no cabeçalho, código na Ocorrência, status no Estado)", () => {
  const m = confirmation();
  assert.ok(!m.html.includes(">Obra:<") && !m.html.includes(">Ação corretiva:<") && !m.html.includes(">Status registrado:<"));
  assert.equal(count(m.html, "AB12CD34"), 1, "código visível uma vez");
  assert.ok(m.text.includes("Ação corretiva: EPI — Pátio [ACC-SSMA:AB12CD34]"), "texto simples mantém a referência");
});
check("rótulo de status não reconhecido é orientativo", () => {
  const m = confirmation();
  assert.ok(!/sem status reconhecido/.test(m.html) && /andamento não identificado/.test(m.html) && /em andamento/.test(m.html));
});

console.log(fail ? "FALHOU" : "TUDO OK"); process.exit(fail ? 1 : 0);
