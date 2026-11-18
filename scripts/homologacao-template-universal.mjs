// Homologação VISUAL do template universal de alertas: gera o HTML REAL dos montadores (dados fictícios, nenhum envio)
// e captura imagens em desktop e celular com o Chrome instalado (DevTools Protocol). Nada vai para a rede, nenhum e-mail
// é enviado e nenhuma credencial é lida.
//
// Uso: node scripts/homologacao-template-universal.mjs [pastaDeSaida]
//   padrão: docs/homologacao/template-universal-20261118
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const outDir = path.resolve(process.argv[2] ?? path.join(repo, "docs/homologacao/template-universal-20261118"));
mkdirSync(path.join(outDir, "html"), { recursive: true });
mkdirSync(path.join(outDir, "img"), { recursive: true });

const { buildImmediateRiskAlertEmail, buildRiskDigestEmail } = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails.ts");
const { applyVeraEmailHeader, loadVeraInlineImage } = await import("../apps/web/lib/email/branding/vera-email-header.ts");
const { loadAccAlertLogos } = await import("../apps/web/lib/email/branding/load-acc-logo-inline-image.ts");

const BASE = "https://acc.homologacao.invalid";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-11-18T15:00:00.000Z";
const TZ = "America/Sao_Paulo";
const webRoot = path.join(repo, "apps/web");

const { images: logoImages, availability } = loadAccLogoPair();
function loadAccLogoPair() {
  return loadAccAlertLogos({ maroon: true, inverted: true }, webRoot);
}
if (!availability.maroon || !availability.inverted) throw new Error("logotipos oficiais não encontrados em apps/web/public/branding");

function immediate({ riskLevel, area, title, summary, impact, responsible, caseId }) {
  return buildImmediateRiskAlertEmail({
    content: {
      kind: "IMMEDIATE",
      changed: false,
      riskLevel,
      area,
      caseTitle: title,
      reference: "HOMOLOGAÇÃO-" + area,
      summary,
      impact,
      originPath: "documentos/exemplo",
      slaActionId: "act-exemplo",
      deadlineLabel: "Prazo para assumir",
      deadlineAt: "2026-11-20T18:00:00.000Z",
      levelLabel: "Responsável",
      previousLevelLabel: null,
      responsibleName: responsible,
      escalationReason: null,
      recommendation: "Registrar a providência no ACC e informar a previsão de conclusão.",
      requiresAcknowledgment: true,
      requiresJustification: false,
    },
    projectId: PROJECT,
    projectName: "WEG — Obra de Homologação",
    recipientName: responsible,
    baseUrl: BASE,
    timeZone: TZ,
    generatedAt: NOW,
    actionButtons: [],
    actionLinks: undefined,
    visibleCode: "HMLG" + caseId.slice(-4).toUpperCase(),
    caseId,
    logos: availability,
  });
}

const item = (n, riskLevel, area, title, state) => ({
  caseKey: `SCHEDULE_COMPARISON:hml-${n}`,
  riskLevel,
  area,
  title,
  reference: `HML-${n}`,
  summary: `Descrição fictícia da ocorrência ${n} para conferência visual do consolidado.`,
  deadlineAt: "2026-11-25T18:00:00.000Z",
  responsibleName: ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Reis"][n % 4],
  originPath: "documentos/exemplo",
  slaActionId: null,
  state,
});
const caseIdByKey = new Map([1, 2, 3, 4, 5].map((n) => [`SCHEDULE_COMPARISON:hml-${n}`, `cccccccc-0000-4000-8000-00000000000${n}`]));

const MODELS = [
  { id: "01-critico-engenharia", title: "E-mail CRÍTICO — Engenharia", build: () => immediate({ riskLevel: "CRITICAL", area: "ENGENHARIA", title: "Estrutura metálica sem liberação de projeto executivo", summary: "A montagem da estrutura do galpão C100 está parada por falta de liberação do projeto executivo revisado.", impact: "Risco iminente de descumprimento do marco contratual de entrega da cobertura.", responsible: "Ana Souza", caseId: "cccccccc-0000-4000-8000-000000000001" }) },
  { id: "02-alto-ssma", title: "E-mail ALTO — SSMA", build: () => immediate({ riskLevel: "HIGH", area: "ESG_SSMA", title: "Ação corretiva de SSMA em atraso", summary: "A ação corretiva de proteção coletiva em altura permanece sem evidência de conclusão.", impact: "Exposição de trabalhadores a risco de queda e possível embargo da frente.", responsible: "Bruno Lima", caseId: "cccccccc-0000-4000-8000-000000000002" }) },
  { id: "03-medio-planejamento", title: "E-mail MÉDIO — Planejamento", build: () => immediate({ riskLevel: "MEDIUM", area: "PLANEJAMENTO", title: "Atividade fora da linha de base do cronograma", summary: "A atividade de concretagem do bloco B está 6 dias úteis além da linha de base.", impact: "Possível deslocamento de marcos intermediários se não houver recuperação.", responsible: "Carla Dias", caseId: "cccccccc-0000-4000-8000-000000000003" }) },
  { id: "04-baixo-contratos", title: "E-mail BAIXO — Contratos (Jurídico)", build: () => immediate({ riskLevel: "LOW", area: "JURIDICO", title: "Pendência de documento contratual de acompanhamento", summary: "O termo aditivo assinado ainda não foi anexado ao registro do contrato.", impact: "Risco processual de rastreabilidade documental, sem efeito imediato em prazo.", responsible: "Diego Reis", caseId: "cccccccc-0000-4000-8000-000000000004" }) },
  {
    id: "05-consolidado-varias",
    title: "Consolidado — várias ocorrências",
    build: () =>
      buildRiskDigestEmail({
        content: {
          kind: "DIGEST",
          window: "2026-11-18",
          mediumItems: [item(1, "MEDIUM", "PLANEJAMENTO", "Atividade fora da linha de base", "NEW"), item(2, "MEDIUM", "ENGENHARIA", "Medição pendente de conferência", "OPEN")],
          lowItems: [item(3, "LOW", "JURIDICO", "Documento contratual pendente de anexo", "CHANGED"), item(4, "LOW", "FINANCEIRO", "Nota fiscal aguardando conciliação", "OPEN")],
          closedItems: [],
        },
        projectId: PROJECT,
        projectName: "WEG — Obra de Homologação",
        recipientName: "Ana Souza",
        baseUrl: BASE,
        timeZone: TZ,
        generatedAt: NOW,
        caseIdByKey,
        logos: availability,
      }),
  },
  {
    id: "06-consolidado-concluida",
    title: "Consolidado — com ocorrência concluída (tique verde)",
    build: () =>
      buildRiskDigestEmail({
        content: {
          kind: "DIGEST",
          window: "2026-11-18",
          mediumItems: [item(1, "MEDIUM", "PLANEJAMENTO", "Atividade fora da linha de base", "OPEN")],
          lowItems: [item(3, "LOW", "JURIDICO", "Documento contratual pendente de anexo", "OPEN")],
          closedItems: [item(5, "LOW", "ESG_SSMA", "Registro de DDS regularizado", "CLOSED")],
        },
        projectId: PROJECT,
        projectName: "WEG — Obra de Homologação",
        recipientName: "Ana Souza",
        baseUrl: BASE,
        timeZone: TZ,
        generatedAt: NOW,
        caseIdByKey,
        logos: availability,
      }),
  },
];

const dataUri = (img) => `data:${img.mimeType};base64,${img.contentBase64}`;

// ---------- 1) HTML (como o provider entrega: cabeçalho FALE COM A AXIA + imagens por Content-ID resolvidas para data:)
const pages = [];
for (const model of MODELS) {
  const built = model.build();
  const withAxia = applyVeraEmailHeader(
    { to: "destinatario@exemplo.invalid", subject: built.subject, text: built.text, html: built.html, inlineImages: logoImages, correlationId: "hml", vera: { projectId: PROJECT, context: "alerta" } },
    { axiaAvailable: true, baseUrl: BASE, loadImage: () => loadVeraInlineImage(webRoot) }
  );
  let html = withAxia.html;
  for (const image of withAxia.inlineImages ?? []) html = html.split(`cid:${image.cid}`).join(dataUri(image));
  const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${built.subject.replace(/</g, "&lt;")}</title></head><body style="margin:0;background:#F3F4F6;">${html}</body></html>`;
  const file = path.join(outDir, "html", `${model.id}.html`);
  writeFileSync(file, doc);
  pages.push({ ...model, file, subject: built.subject, logoNeeds: built.logoNeeds, hasAxia: html.includes("FALE COM A AXIA"), fourButtons: ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"].every((l) => html.includes(`>${l}<`)) });
}

// ---------- 2) capturas via DevTools Protocol (Chrome headless)
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!chromePath) throw new Error("Chrome não encontrado");
const port = 9333 + Math.floor(Math.random() * 300);
const profile = path.join(os.tmpdir(), `acc-hml-${Date.now()}`);
const chrome = spawn(chromePath, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

async function waitForDebugger() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("DevTools do Chrome não respondeu");
}

function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { opened, send, close: () => ws.close() };
}

const VIEWPORTS = [
  { name: "desktop", width: 980, height: 900, mobile: false, scale: 1 },
  { name: "celular", width: 390, height: 844, mobile: true, scale: 2 },
];

const captured = [];
try {
  await waitForDebugger();
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = cdpConnect(target.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send("Page.enable");
  for (const page of pages) {
    for (const vp of VIEWPORTS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.scale, mobile: vp.mobile });
      await cdp.send("Page.navigate", { url: `file:///${page.file.replace(/\\/g, "/")}` });
      await new Promise((r) => setTimeout(r, 900));
      const metrics = await cdp.send("Runtime.evaluate", { expression: "JSON.stringify({h:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),w:document.documentElement.scrollWidth,iw:window.innerWidth})", returnByValue: true });
      const { h, w, iw } = JSON.parse(metrics.result.value);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(h, 12000), scale: 1 } });
      const file = path.join(outDir, "img", `${page.id}-${vp.name}.png`);
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      captured.push({ id: page.id, viewport: vp.name, file: path.relative(outDir, file).replace(/\\/g, "/"), height: h, horizontalScroll: w > iw + 1 });
    }
  }
  cdp.close();
} finally {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* perfil temporário: limpeza best-effort */
  }
}

// ---------- 3) índice HTML (miniaturas + imagem integral) e relatório JSON
const rows = pages
  .map((p) => {
    const d = captured.find((c) => c.id === p.id && c.viewport === "desktop");
    const m = captured.find((c) => c.id === p.id && c.viewport === "celular");
    return `<section><h2>${p.title}</h2><p class="meta">Assunto: ${p.subject.replace(/</g, "&lt;")}<br>Logotipo oficial: ${p.logoNeeds?.inverted ? "invertido (branco)" : "vinho"} · Quatro botões: ${p.fourButtons ? "sim" : "NÃO"} · FALE COM A AXIA: ${p.hasAxia ? "sim" : "NÃO"} · Rolagem horizontal no celular: ${m.horizontalScroll ? "SIM (falha)" : "não"}</p><div class="pair"><figure><a href="${d.file}" target="_blank"><img src="${d.file}" alt="${p.title} desktop"></a><figcaption>Desktop (980 px)</figcaption></figure><figure class="m"><a href="${m.file}" target="_blank"><img src="${m.file}" alt="${p.title} celular"></a><figcaption>Celular (390 px)</figcaption></figure></div></section>`;
  })
  .join("\n");
writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Homologação — template universal de alertas</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:24px;background:#f3f4f6;color:#111827}h1{font-size:22px}h2{font-size:17px;margin:28px 0 4px}.meta{font-size:13px;color:#374151;margin:0 0 10px}.pair{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}figure{margin:0}figure img{display:block;border:1px solid #9ca3af;background:#fff;max-width:520px;height:auto}figure.m img{max-width:230px}figcaption{font-size:12px;color:#4b5563;margin-top:4px}.note{background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:12px 16px;font-size:13px}</style></head><body><h1>Homologação visual — template universal de alertas ACC</h1><div class="note"><strong>O que são estas imagens:</strong> o HTML REAL gerado pelos montadores do ACC (dados fictícios; nenhum envio), renderizado no Chrome (desktop e celular emulado). <strong>Não foi verificado em Gmail nem Outlook</strong> — clientes de e-mail aplicam regras próprias. Clique em uma miniatura para ver em tamanho integral.</div>${rows}<p class="note">Interfaces autenticadas (calendário, lista de colaboradores, caixa do ESPECIALISTA, confirmação de resolução): veja <a href="interface/index.html">interface/index.html</a>, quando gerado.</p></body></html>`
);
writeFileSync(path.join(outDir, "relatorio.json"), JSON.stringify({ geradoEm: new Date().toISOString(), modelos: pages.map(({ id, title, subject, hasAxia, fourButtons, logoNeeds }) => ({ id, title, subject, hasAxia, fourButtons, logoNeeds })), capturas: captured }, null, 2));
console.log(`OK ${captured.length} imagens em ${outDir}`);
for (const p of pages) console.log(`${p.id}: quatro botões=${p.fourButtons} axia=${p.hasAxia}`);
if (captured.some((c) => c.horizontalScroll)) {
  console.log("ATENÇÃO: rolagem horizontal detectada em:", captured.filter((c) => c.horizontalScroll).map((c) => `${c.id}/${c.viewport}`).join(", "));
  process.exitCode = 1;
}
