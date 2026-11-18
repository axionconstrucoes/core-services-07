// Testes do TEMPLATE UNIVERSAL de alertas (quatro botões, logotipo, cores por gravidade, consolidado).
// Puro, sem rede, sem envio. Uso: node scripts/test-universal-alert-template.mjs
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const t = await import("../apps/web/lib/email/templates/universal-alert-template.ts");
const style = await import("../apps/web/lib/email/templates/alert-box-style.ts");

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

const BASE = "https://acc.exemplo.invalid";
const LINKS = {
  RESOLVIDO: `${BASE}/p/1/alertas/o1/resolver?t=abc`,
  EM_ANDAMENTO: `${BASE}/p/1/alertas/o1/andamento?t=abc`,
  ENVIAR_PARA: `${BASE}/p/1/alertas/o1/enviar?t=abc`,
  ESPECIALISTA: `${BASE}/p/1/alertas/o1/especialista?t=abc`,
};
const LOGOS = { maroon: true, inverted: true };
const WORD = { CRITICA: "CRÍTICO", ALTA: "ALTO", MEDIA: "MÉDIO", BAIXA: "BAIXO" };
const AREAS = ["Engenharia", "Planejamento", "SSMA", "Contratos", "Jurídico", "Financeiro", "Suprimentos"];

function occ(severity, extra = {}) {
  return {
    code: "ACC-0001",
    projectName: "Obra WEG",
    areaLabel: "SSMA",
    severity,
    title: "Ação corretiva em atraso",
    description: "Descrição da ocorrência.",
    evidences: [{ label: "Foto 1", url: `${BASE}/e/1` }],
    responsibleName: "Fulano",
    originalDeadline: "20/11/2026 15:00",
    stateLabel: "Aberto",
    specialistLabel: "Especialista SSMA",
    openUrl: `${BASE}/p/1/alertas/o1`,
    actions: LINKS,
    ...extra,
  };
}
const card = (severity, extra) => t.buildUniversalOccurrenceHtml(occ(severity, extra), LOGOS);
const indexOfLabel = (html, label) => html.indexOf(`>${label}</`);

for (const severity of ["CRITICA", "ALTA", "MEDIA", "BAIXA"]) {
  check(`${severity}: quatro botões na ordem RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA, cada um com seu link`, () => {
    const html = card(severity);
    const order = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"].map((l) => indexOfLabel(html, l));
    assert.ok(order.every((i) => i > 0), `faltou botão: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, "ordem errada");
    for (const url of Object.values(LINKS)) assert.ok(html.includes(url.replace(/&/g, "&amp;")), `sem link ${url}`);
  });
  check(`${severity}: cabeçalho "RISCO ${WORD[severity]} | OBRA" com logotipo ${style.ALERT_TONES[severity].logo} por Content-ID`, () => {
    const html = card(severity);
    assert.ok(html.includes(`RISCO ${WORD[severity]} | Obra WEG`));
    const cid = style.logoCidFor(style.ALERT_TONES[severity].logo);
    assert.ok(html.includes(`src="cid:${cid}"`), "logo não referenciado");
  });
  check(`${severity}: cores da gravidade preservadas (fundo, borda, texto)`, () => {
    const tone = style.ALERT_TONES[severity];
    const html = card(severity);
    assert.ok(html.includes(`background-color:${tone.background}`) && html.includes(tone.border));
    assert.ok(style.contrastRatio(tone.text, tone.background) >= 4.5);
  });
}

check("cores aprovadas: CRÍTICO vermelho/branco/logo invertido; ALTO amarelo/preto/logo vinho; MÉDIO e BAIXO brancos", () => {
  const T = style.ALERT_TONES;
  assert.equal(T.CRITICA.background, "#CC0000");
  assert.equal(T.CRITICA.text, "#FFFFFF");
  assert.equal(T.CRITICA.logo, "inverted");
  assert.equal(T.ALTA.background, "#FFC700");
  assert.equal(T.ALTA.text, "#000000");
  assert.equal(T.ALTA.logo, "maroon");
  assert.equal(T.MEDIA.background, "#FFFFFF");
  assert.equal(T.BAIXA.background, "#FFFFFF");
});

check("estrutura idêntica em todas as áreas (só mudam os dados)", () => {
  const shape = (html) => html.replace(/>[^<]*</g, "><");
  const reference = shape(card("ALTA", { areaLabel: AREAS[0] }));
  for (const area of AREAS) assert.equal(shape(card("ALTA", { areaLabel: area })), reference, area);
  for (const area of AREAS) assert.ok(card("ALTA", { areaLabel: area }).includes(`Área:</span> ${area}`) || card("ALTA", { areaLabel: area }).includes(area));
});

check("conteúdo exigido: projeto, ocorrência, área, gravidade, descrição, evidências, responsável, prazo original, estado", () => {
  const html = card("MEDIA");
  for (const part of ["Obra WEG", "ACC-0001", "SSMA", "MÉDIO", "Descrição da ocorrência.", "Foto 1", "Fulano", "20/11/2026 15:00", "Aberto"]) assert.ok(html.includes(part), part);
});

check("ação sem URL fica no layout, desativada e com o motivo visível (nunca simula)", () => {
  const html = card("ALTA", { actions: { ...LINKS, ESPECIALISTA: null }, unavailableReasons: { ESPECIALISTA: "Especialista SSMA indisponível no momento." } });
  assert.ok(indexOfLabel(html, "ESPECIALISTA") > 0, "botão sumiu do layout");
  assert.ok(html.includes("aria-disabled=\"true\"") && html.includes("Especialista SSMA indisponível no momento."));
  assert.ok(!html.includes(LINKS.ESPECIALISTA));
  assert.ok(html.includes(LINKS.RESOLVIDO), "as demais continuam ativas");
});

check("URL insegura (javascript:, data:, relativa) nunca vira link", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relativa", "ftp://x/y", " "]) {
    const html = card("BAIXA", { actions: { ...LINKS, RESOLVIDO: bad } });
    assert.ok(!html.includes(`href="${bad}"`) && !html.includes("javascript:"), bad);
    assert.ok(html.includes("aria-disabled=\"true\""), bad);
  }
});

check("ocorrência concluída: sinalização CONCLUÍDO e os quatro botões desativados", () => {
  const html = card("ALTA", { completed: true, completedAtLabel: "21/11/2026 10:00" });
  assert.ok(html.includes("CONCLUÍDO em 21/11/2026 10:00"));
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 4);
  for (const url of Object.values(LINKS)) assert.ok(!html.includes(url));
});

check("texto escapado: HTML injetado em título/descrição/responsável não vira marcação", () => {
  const html = card("ALTA", { title: "<script>x</script>", description: "<img src=x onerror=1>", responsibleName: "\"><b>y" });
  assert.ok(!html.includes("<script>") && !html.includes("<img src=x") && !html.includes("\"><b>y"));
});

check("e-mail individual: assunto, saudação, logoNeeds corretos e sem GET que altera estado", () => {
  const crit = t.buildUniversalAlertEmail({ recipientName: "Ana", occurrence: occ("CRITICA"), logos: LOGOS });
  assert.ok(crit.subject.includes("CRÍTICO") || crit.subject.toUpperCase().includes("CRITIC"));
  assert.ok(crit.html.includes("Olá, Ana."));
  assert.deepEqual(crit.logoNeeds, { maroon: false, inverted: true });
  assert.deepEqual(t.buildUniversalAlertEmail({ recipientName: null, occurrence: occ("ALTA"), logos: LOGOS }).logoNeeds, { maroon: true, inverted: false });
  for (const url of Object.values(LINKS)) assert.ok(!/[?&](confirm|apply|execute|resolve)=1/i.test(url));
  for (const line of crit.text.split("\n").filter((l) => /^(RESOLVIDO|EM ANDAMENTO|ENVIAR PARA|ESPECIALISTA):/.test(l))) assert.match(line, /https:\/\//);
  assert.equal(crit.text.split("\n").filter((l) => /^(RESOLVIDO|EM ANDAMENTO|ENVIAR PARA|ESPECIALISTA):/.test(l)).length, 4);
});

check("consolidado: logotipo, quatro botões POR ocorrência, colunas desktop e empilhamento no celular", () => {
  const items = [occ("MEDIA", { code: "A1", title: "Item A" }), occ("BAIXA", { code: "A2", title: "Item B" }), occ("MEDIA", { code: "A3", title: "Item C" })];
  const email = t.buildUniversalDigestEmail({ recipientName: "Ana", projectName: "Obra WEG", summaryLine: "2 MÉDIOS, 1 BAIXO", windowLabel: "Quarta 07:00", occurrences: items, logos: LOGOS });
  assert.equal((email.html.match(/>RESOLVIDO</g) ?? []).length, 3);
  assert.equal((email.html.match(/>ESPECIALISTA</g) ?? []).length, 3);
  assert.equal((email.html.match(/class="acc-actions-col"/g) ?? []).length, 3);
  assert.ok(email.html.includes("acc-content-col") && email.html.includes("@media only screen and (max-width:640px)"));
  assert.ok(/\.acc-content-col, \.acc-actions-col \{ display:block !important; width:100% !important;/.test(email.html), "sem empilhamento no celular");
  assert.ok(email.html.includes("cid:") && email.logoNeeds.maroon && !email.logoNeeds.inverted);
  assert.ok(!/Responder todos os itens/i.test(email.html), "não pode depender do botão geral");
  assert.ok(!/overflow-x|min-width:\s*[7-9]\d\d/.test(email.html), "rolagem horizontal");
  assert.equal((email.text.match(/^RESOLVIDO: https/gm) ?? []).length, 3);
});

check("consolidado vazio não quebra", () => {
  const email = t.buildUniversalDigestEmail({ recipientName: null, projectName: "X", summaryLine: "0", windowLabel: "w", occurrences: [], logos: LOGOS });
  assert.ok(email.html.includes("Nenhuma ocorrência"));
  assert.deepEqual(email.logoNeeds, { maroon: false, inverted: false });
});

check("largura dos botões e da coluna não ultrapassa o container (sem corte no celular)", () => {
  assert.ok(style.BUTTON_COLUMN_WIDTH_PX <= 200 && style.BUTTON_WIDTH_PX <= 160);
  for (const label of ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"]) assert.ok(label.length * 9.5 <= style.BUTTON_WIDTH_PX, label);
});

check("nenhum segredo/token embutido além das URLs recebidas", () => {
  const email = t.buildUniversalAlertEmail({ recipientName: "A", occurrence: occ("ALTA"), logos: LOGOS });
  assert.ok(!/GOCSPX|ya29\.|refresh_token|service_role|sb_secret/i.test(email.html + email.text));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
