// Template OPERACIONAL dos e-mails de alerta de risco (imediato, escalonamento e acompanhamento):
// paleta única aprovada: vermelho (CRÍTICO), amarelo (ALTO), branco com faixa azul (MÉDIO) e verde (BAIXO); quatro botões na coluna lateral;
// instrução de resposta direta no corpo (status + previsão); contraste WCAG AA; sem faixa de TESTE/PILOTO no
// alerta real. Funções REAIS, dados fictícios, nenhum envio.
//
// Uso:
//   node scripts/test-risk-alert-email-theme.mjs                 (testes)
//   node scripts/test-risk-alert-email-theme.mjs --preview=<dir> (testes + grava prévias HTML de exemplo)

import { mkdirSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";

register("./ts-module-resolver.mjs", import.meta.url);

const { buildImmediateRiskAlertEmail, buildAlertFollowUpEmail, RISK_EMAIL_THEMES, replyInstructionFor } = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails");

let failed = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

// --- contraste (WCAG 2.x) ---------------------------------------------------------------------------------------
function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const PROJECT = "11111111-1111-4111-8111-111111111111";
const BASE = "https://acc.example";
const LINKS = {
  RESOLVED: `${BASE}/a/1`,
  TAKING_ACTION: `${BASE}/a/2`,
  FORWARD: `${BASE}/a/3`,
  EXPERT_CONSULTATION: `${BASE}/a/4`,
  OTHER: `${BASE}/a/5`,
};

function immediate(riskLevel, kind = "IMMEDIATE") {
  return buildImmediateRiskAlertEmail({
    content: {
      kind,
      changed: false,
      riskLevel,
      area: "PLANEJAMENTO",
      caseTitle: "EXEMPLO — Atividade crítica com atraso no cronograma",
      reference: "EXEMPLO-W99",
      summary: "EXEMPLO fictício para conferência visual do modelo.",
      impact: "EXEMPLO: impacto potencial no marco contratual.",
      originPath: "documentos/exemplo",
      slaActionId: "act-exemplo",
      deadlineLabel: "Prazo para assumir",
      deadlineAt: "2026-11-20T18:00:00.000Z",
      levelLabel: kind === "ESCALATION" ? "Gestor" : "Responsável",
      previousLevelLabel: kind === "ESCALATION" ? "Responsável" : null,
      responsibleName: "Pessoa Exemplo",
      escalationReason: kind === "ESCALATION" ? "Prazo para assumir vencido sem ação." : null,
      recommendation: "EXEMPLO: revisar a sequência das atividades.",
      requiresAcknowledgment: true,
      requiresJustification: true,
    },
    projectId: PROJECT,
    projectName: "Obra Exemplo",
    recipientName: "Pessoa Exemplo",
    baseUrl: BASE,
    timeZone: "America/Sao_Paulo",
    generatedAt: "2026-11-18T12:00:00.000Z",
    actionButtons: [],
    actionLinks: LINKS,
    visibleCode: "EXEMPLO1",
    caseId: "case-exemplo",
    logos: { maroon: true, inverted: true },
  });
}

const LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

check("temas (paleta ÚNICA aprovada): CRÍTICO vermelho, ALTO amarelo, MÉDIO e BAIXO brancos", () => {
  const isRed = (hex) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return r > 150 && g < 60 && b < 60;
  };
  const isYellow = (hex) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return r > 230 && g > 180 && b < 160;
  };
  assert(isRed(RISK_EMAIL_THEMES.CRITICAL.background), "CRÍTICO não é vermelho");
  assert(isYellow(RISK_EMAIL_THEMES.HIGH.background), "ALTO não é amarelo");
  assert(RISK_EMAIL_THEMES.MEDIUM.background.toUpperCase() === "#FFFFFF" && RISK_EMAIL_THEMES.LOW.background.toUpperCase() === "#FFFFFF", "MÉDIO/BAIXO não são brancos");
});

check("contraste WCAG AA (≥ 4,5:1) do texto sobre o fundo de cada grau e dos painéis/caixas brancos", () => {
  for (const level of LEVELS) {
    const t = RISK_EMAIL_THEMES[level];
    const ratio = contrast(t.foreground, t.background);
    assert(ratio >= 4.5, `${level}: ${ratio.toFixed(2)}:1`);
  }
  assert(contrast("#000000", "#FFFFFF") >= 4.5 && contrast("#111827", "#FFFFFF") >= 4.5 && contrast("#FFFFFF", "#111827") >= 4.5 && contrast("#4B5563", "#FFFFFF") >= 4.5);
});

check("imediato (template universal): fundo pelo grau, logotipo oficial, quatro botões na coluna lateral, faixa azul/verde em MÉDIO/BAIXO", () => {
  const ACCENT = { MEDIUM: "#1D4ED8", LOW: "#15803D" };
  for (const level of LEVELS) {
    const e = immediate(level);
    const t = RISK_EMAIL_THEMES[level];
    assert(e.html.includes(`background-color:${t.background}`), `${level}: sem fundo do tema`);
    assert(e.html.includes("acc-actions-col") && e.html.includes("acc-content-col"), "sem duas colunas (conteúdo e botões)");
    assert(e.html.includes("cid:acc-logo-" + (level === "CRITICAL" ? "inverted" : "signature")), `${level}: logotipo oficial ausente`);
    const side = e.html.slice(e.html.indexOf("acc-actions-col"));
    const order = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"].map((label) => side.indexOf(`>${label}<`));
    assert(order.every((i) => i > 0) && [...order].sort((a, b) => a - b).join() === order.join(), `${level}: quatro botões fora de ordem/ausentes`);
    for (const url of [LINKS.RESOLVED, LINKS.TAKING_ACTION, LINKS.FORWARD]) assert(e.html.includes(url) && e.text.includes(url), "link de ação ausente");
    assert(e.html.includes("Responder pelo e-mail") && e.text.includes("RESPONDER PELO E-MAIL:"));
    if (ACCENT[level]) assert(e.html.includes(`border-left:6px solid ${ACCENT[level]}`), `${level}: sem faixa de identificação`);
    else assert(!e.html.includes("border-left:6px"), `${level}: não deveria ter faixa`);
  }
});

check("instrução de resposta: ALTO/CRÍTICO pedem data E horário; MÉDIO/BAIXO pedem a data; no HTML e no texto", () => {
  for (const level of ["CRITICAL", "HIGH"]) {
    assert(/DATA e HORÁRIO/.test(replyInstructionFor(level)) && /não suspende prazos nem escalonamentos/.test(replyInstructionFor(level)));
    const e = immediate(level);
    assert(e.text.includes(`RESPONDER PELO E-MAIL: ${replyInstructionFor(level)}`));
    assert(e.html.includes("DATA e HORÁRIO"));
  }
  for (const level of ["MEDIUM", "LOW"]) {
    assert(/DATA prevista/.test(replyInstructionFor(level)) && !/HORÁRIO/.test(replyInstructionFor(level)));
    assert(immediate(level).text.includes(`RESPONDER PELO E-MAIL: ${replyInstructionFor(level)}`));
  }
});

check("escalonamento e acompanhamento usam o mesmo template (cabeçalho com logo, quatro botões, estado)", () => {
  const esc = immediate("CRITICAL", "ESCALATION");
  assert(esc.html.includes(RISK_EMAIL_THEMES.CRITICAL.background) && esc.html.includes("RISCO CRÍTICO | Obra Exemplo") && esc.html.includes("Escalonado — Gestor"));
  const fu = buildAlertFollowUpEmail({
    kind: "ACTION_CONFIRMATION",
    projectId: PROJECT,
    projectName: "Obra Exemplo",
    recipientName: "Pessoa Exemplo",
    baseUrl: BASE,
    timeZone: "America/Sao_Paulo",
    generatedAt: "2026-11-18T12:00:00.000Z",
    caseId: "case-exemplo",
    caseTitle: "EXEMPLO",
    riskLevel: "HIGH",
    visibleCode: "EXEMPLO1",
    rows: [["Status", "Em andamento"]],
    actionLinks: LINKS,
    logos: { maroon: true, inverted: true },
  });
  assert(fu.html.includes(RISK_EMAIL_THEMES.HIGH.background) && fu.html.includes("acc-actions-col") && fu.html.includes(">ESPECIALISTA<") && fu.html.includes("alertas/case-exemplo?acao=ESPECIALISTA"));
  assert(fu.text.includes("RESPONDER PELO E-MAIL:"));
});

check("alerta real: o modelo NÃO contém faixa/conteúdo de TESTE, PILOTO nem AXIA", () => {
  for (const level of LEVELS) {
    const e = immediate(level);
    const all = `${e.subject}\n${e.text}\n${e.html}`;
    assert(!/TESTE CONTROLADO|\[PILOTO\]|PILOTO —|data-acc-pilot|AXIA/i.test(all), `${level}: conteúdo de teste/AXIA no modelo`);
  }
});

const previewArg = process.argv.find((a) => a.startsWith("--preview="));
if (previewArg) {
  const dir = path.resolve(previewArg.split("=")[1]);
  mkdirSync(dir, { recursive: true });
  const names = { CRITICAL: "critico", HIGH: "alto", MEDIUM: "medio", LOW: "baixo" };
  const report = [];
  for (const level of LEVELS) {
    const e = immediate(level);
    const t = RISK_EMAIL_THEMES[level];
    writeFileSync(
      path.join(dir, `alerta-${names[level]}.html`),
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia — ${e.subject}</title></head><body style="margin:0;background:#F3F4F6;">${e.html}</body></html>`
    );
    report.push(`${level}: fundo ${t.background} / texto ${t.foreground} = ${contrast(t.foreground, t.background).toFixed(2)}:1 (AA ≥ 4,5)`);
  }
  const esc = immediate("CRITICAL", "ESCALATION");
  writeFileSync(path.join(dir, "escalonamento-critico.html"), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia — escalonamento</title></head><body style="margin:0;background:#F3F4F6;">${esc.html}</body></html>`);
  report.push(`Painéis/caixas: #000000 sobre #FFFFFF = ${contrast("#000000", "#FFFFFF").toFixed(2)}:1; #111827 sobre #FFFFFF = ${contrast("#111827", "#FFFFFF").toFixed(2)}:1; rodapé #4B5563 sobre #FFFFFF = ${contrast("#4B5563", "#FFFFFF").toFixed(2)}:1`);
  writeFileSync(path.join(dir, "contraste.txt"), `${report.join("\n")}\n`);
  console.log(`Prévias gravadas em ${dir}`);
}

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
