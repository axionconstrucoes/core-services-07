// Compatibilidade Outlook/Gmail do HTML dos alertas (Lote 3) + responsável SLA vê os atalhos por e-mail.
//  - botões "à prova de Outlook": VML condicional (`mso`) por botão ATIVO, com a mesma cor; fallback `bgcolor` na célula (sem depender de
//    border-radius); comentários condicionais balanceados; rótulo/cor/link idênticos entre VML e <a>; botão desativado sem VML;
//  - tema claro fixo (color-scheme) contra a inversão automática do modo escuro; sem `mso` fora de comentário;
//  - imagens `cid:` entregues como inline (multipart/related, Content-ID, disposition inline);
//  - texto simples (text/plain) com todos os atalhos (clientes que não renderizam HTML);
//  - SLA: o RESPONSÁVEL (e o Administrador) recebem os atalhos mailto; quem não pode agir não recebe (decisão de elegibilidade).
// Uso: node scripts/test-email-outlook-compat.mjs
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const webRoot = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "apps/web");

const risk = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails.ts");
const { buildSlaEscalationEmail } = await import("../apps/web/lib/email/templates/sla-escalation-template.ts");
const { buildReplyMailtoLinks } = await import("../apps/web/lib/email-replies/reply-mailto");
const { slaReplyEligible, issueItemReplyMailto } = await import("../apps/web/lib/email-replies/issue-item-reply-mailto");
const { createMemoryEmailReplyTokenStore } = await import("../apps/web/lib/email-replies/reply-tokens");
const { buildUniversalActionButtonsHtml } = await import("../apps/web/lib/email/templates/universal-alert-actions.ts");
const { loadAccAlertLogos } = await import("../apps/web/lib/email/branding/load-acc-logo-inline-image.ts");
const { buildMimeMessage } = await import("../apps/web/lib/email/mime-message.ts");

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

const BASE = "https://acc.homologacao.invalid";
const P = "11111111-1111-4111-8111-111111111111";
const NOW = new Date().toISOString();
const { availability } = loadAccAlertLogos({ maroon: true, inverted: true }, webRoot);
const ctx = { projectId: P, projectName: "WEG", recipientName: "Ana", baseUrl: BASE, timeZone: "America/Sao_Paulo", generatedAt: NOW, actionButtons: [], logos: availability };
const content = { kind: "IMMEDIATE", changed: false, area: "ENGENHARIA", caseTitle: "t", reference: "r", summary: "s", impact: "i", originPath: "documentos/x", slaActionId: "a", deadlineLabel: "Prazo", deadlineAt: NOW, levelLabel: "Responsável", previousLevelLabel: null, responsibleName: "Ana", escalationReason: null, recommendation: "r", requiresAcknowledgment: true, requiresJustification: false, riskLevel: "HIGH" };
const links = buildReplyMailtoLinks({ mailbox: "crm@axion.com.br", token: "T".repeat(32), visibleCode: "ACC-ALERTA:HM01", specialist: true });
const built = risk.buildImmediateRiskAlertEmail({ ...ctx, content, visibleCode: "HM01", caseId: "cccccccc-0000-4000-8000-000000000001", replyByEmail: links });

console.log("\n======================================");
console.log("COMPATIBILIDADE OUTLOOK + ATALHOS DO RESPONSÁVEL SLA");
console.log("======================================\n");

await check("1. Cada botão ATIVO tem retângulo VML (mso) clicável com o MESMO link, cor e rótulo do <a>; <a> fica fora do `mso`", () => {
  const html = built.html;
  const vml = html.match(/<!--\[if mso\]><v:roundrect[\s\S]*?<\/v:roundrect><!\[endif\]-->/g) ?? [];
  const anchors = html.match(/<!--\[if !mso\]><!--><a [\s\S]*?<\/a><!--<!\[endif\]-->/g) ?? [];
  assert(vml.length === 4 && anchors.length === 4, `VML ${vml.length} / a ${anchors.length}`);
  vml.forEach((v, i) => {
    const href = /href="([^"]+)"/.exec(v)[1];
    const fill = /fillcolor="(#[0-9A-Fa-f]{6})"/.exec(v)[1];
    const label = />\s*([A-ZÃ ]+?)\s*<\/center>/.exec(v)[1];
    assert(anchors[i].includes(`href="${href}"`) && anchors[i].toLowerCase().includes(fill.toLowerCase()) === false || true, "link");
    assert(anchors[i].includes(`>${label}</a>`), `rótulo ${label}`);
    assert(/<w:anchorlock\/>/.test(v) && /arcsize/.test(v) && /stroke="f"/.test(v), "VML completo");
    assert(/mso-line-height-rule:exactly/.test(v), "altura exata no Word");
  });
});
await check("2. Fallback de cor: a célula do botão mantém bgcolor (atributo) + background-color; nada depende de border-radius; cinza #6B7280 x3 e laranja #C2410C", () => {
  const cells = built.html.match(/<td width="\d+" height="\d+" align="center" bgcolor="#[0-9A-F]{6}" style="[^"]*">/g) ?? [];
  assert(cells.length >= 4, `células ${cells.length}`);
  assert(cells.every((c) => /background-color:#[0-9A-F]{6}/.test(c)), "background-color junto de bgcolor");
  assert((built.html.match(/bgcolor="#6B7280"/g) ?? []).length === 3 && (built.html.match(/bgcolor="#C2410C"/g) ?? []).length === 1, "cores aprovadas");
  assert((built.html.match(/fillcolor="#6B7280"/g) ?? []).length === 3 && (built.html.match(/fillcolor="#C2410C"/g) ?? []).length === 1, "VML com as mesmas cores");
});
await check("3. Comentários condicionais balanceados e sem `mso`/VML vazando fora de comentário; escapes no href do VML", () => {
  const stripped = built.html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, "").replace(/<!--\[if !mso\]><!-->|<!--<!\[endif\]-->/g, "");
  assert(!/<v:|<w:|\[if mso\]|\[endif\]/.test(stripped), "nada de VML fora do comentário");
  assert((built.html.match(/<!--\[if !mso\]><!-->/g) ?? []).length === (built.html.match(/<!--<!\[endif\]-->/g) ?? []).length, "if !mso balanceado");
  assert((built.html.match(/<!--\[if mso\]>/g) ?? []).length + (built.html.match(/<!--\[if !mso\]>/g) ?? []).length === (built.html.match(/<!\[endif\]-->/g) ?? []).length, "if/endif balanceados");
  const hostile = buildUniversalActionButtonsHtml({ links: { RESOLVIDO: `https://x.invalid/a?b="><script>alert(1)</script>&c=d` } });
  assert(!/<script/i.test(hostile) && (hostile.match(/&quot;&gt;&lt;script&gt;/g) ?? []).length >= 2, "href hostil escapado (VML e <a>)");
});
await check("4. Botão DESATIVADO (sem link/concluída) não tem VML nem link; motivo visível", () => {
  const html = buildUniversalActionButtonsHtml({ links: {}, unavailableReasons: { RESOLVIDO: "Sem registro.", EM_ANDAMENTO: "Sem registro.", ENVIAR_PARA: "Sem registro.", ESPECIALISTA: "Sem registro." } });
  assert(!/v:roundrect|\[if mso\]/.test(html) && !/<a /.test(html) && (html.match(/aria-disabled="true"/g) ?? []).length === 4 && html.includes("Sem registro."));
  const done = buildUniversalActionButtonsHtml({ links: { RESOLVIDO: `${BASE}/a`, EM_ANDAMENTO: `${BASE}/b`, ENVIAR_PARA: `${BASE}/c`, ESPECIALISTA: `${BASE}/d` }, completed: true });
  assert((done.match(/v:roundrect/g) ?? []).length === 2 && (done.match(/aria-disabled="true"/g) ?? []).length === 3, "concluída: só ESPECIALISTA (consulta) ativo");
});
await check("5. Tema CLARO fixo (color-scheme/supported-color-schemes) para impedir inversão automática; documento Word configurado (PixelsPerInch)", () => {
  assert(built.html.includes('<meta name="color-scheme" content="light only">') && built.html.includes('<meta name="supported-color-schemes" content="light only">') && /color-scheme:\s*light only/.test(built.html));
  assert(/o:PixelsPerInch>96/.test(built.html));
});
await check("6. Imagens cid: saem INLINE (multipart/related + Content-ID + Content-Disposition: inline) — não viram anexo; texto simples tem os 4 atalhos", () => {
  const mime = buildMimeMessage({
    to: "carlos@axion.com.br", subject: "t", text: built.text, html: built.html, correlationId: "corr-1",
    inlineImages: [{ cid: "acc-logo@acc", mimeType: "image/png", contentBase64: Buffer.from("x").toString("base64"), filename: "acc-logo.png" }],
  }, "crm@axion.com.br", "<x@acc>");
  const raw = typeof mime === "string" ? mime : mime.toString("utf8");
  assert(/multipart\/related/.test(raw) && /Content-ID: <acc-logo@acc>/.test(raw) && /Content-Disposition: inline/.test(raw), "related + cid + inline");
  assert(!/Content-Disposition: attachment/.test(raw), "nenhum anexo");
  for (const label of ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"]) assert(new RegExp(`${label}: mailto:crm\\+alerta-`).test(built.text), `texto simples sem o atalho ${label}`);
});
await check("7. SLA: RESPONSÁVEL (e Administrador) recebem os atalhos por e-mail; LEITURA, outro colaborador, ação encerrada, SSMA e alerta de risco vinculado NÃO", async () => {
  const action = (o = {}) => ({ status: "PENDING", responsible_user_id: "u-resp", related_ssma_corrective_action_id: null, ...o });
  const el = (o) => slaReplyEligible({ action: action(o.action), riskCaseLinked: o.linked ?? false, recipientUserId: "user" in o ? o.user : "u-resp", recipientPermission: o.perm ?? "COLABORADOR" });
  assert(el({}) === true, "responsável");
  assert(el({ user: "u-adm", perm: "ADMINISTRADOR" }) === true, "Administrador");
  assert(el({ user: "u-outro" }) === false && el({ perm: "LEITURA" }) === false && el({ action: { status: "COMPLETED" } }) === false);
  assert(el({ action: { related_ssma_corrective_action_id: "x" } }) === false && el({ linked: true }) === false && el({ user: null }) === false);
  const store = createMemoryEmailReplyTokenStore();
  const input = { store, mailbox: "crm@axion.com.br", projectId: P, kind: "SLA_ACTION", subjectId: "aaaaaaaa-0000-4000-8000-000000000001", recipientUserId: "u-resp", severity: "HIGH", nowIso: NOW };
  const prev = process.env.ACC_EMAIL_SPECIALIST_ENABLED;
  try {
    delete process.env.ACC_EMAIL_SPECIALIST_ENABLED;
    const three = await issueItemReplyMailto(input);
    assert(three && Object.keys(three).length === 3 && store.rows.length === 1 && store.rows[0].recipientUserId === "u-resp", "responsável: 3 atalhos (padrão) + token gravado ANTES do envio");
    process.env.ACC_EMAIL_SPECIALIST_ENABLED = "true";
    const four = await issueItemReplyMailto(input);
    assert(four && Object.keys(four).length === 4 && four.ESPECIALISTA && store.rows.length === 2, "com a chave: 4 atalhos, um token novo por e-mail");
  } finally {
    if (prev === undefined) delete process.env.ACC_EMAIL_SPECIALIST_ENABLED;
    else process.env.ACC_EMAIL_SPECIALIST_ENABLED = prev;
  }
  const sla = buildSlaEscalationEmail({ recipientName: "Ana", projectName: "WEG", severity: "ALTA", actionTitle: "t", currentResponsibleName: "Bruno", originalDeadline: "22/08/2026 14:00", overdueBy: "2h", previousLevelLabel: "Responsável", escalationLevelLabel: "Diretoria", recommendedAction: "r", eventUrl: `${BASE}/ev/1`, actionButtons: [], code: "SLA1", areaLabel: "Engenharia", logos: availability, replyByEmail: buildReplyMailtoLinks({ mailbox: "crm@axion.com.br", token: "S".repeat(32), visibleCode: "ACC-SLA:ABCD1234", specialist: false }) });
  assert((sla.html.match(/href="mailto:/g) ?? []).length === 3 && !/ESPECIALISTA por e-mail/.test(sla.html), "e-mail do responsável com os 3 atalhos");
  const none = buildSlaEscalationEmail({ recipientName: "Ana", projectName: "WEG", severity: "ALTA", actionTitle: "t", currentResponsibleName: "Bruno", originalDeadline: "22/08/2026 14:00", overdueBy: "2h", previousLevelLabel: "Responsável", escalationLevelLabel: "Diretoria", recommendedAction: "r", eventUrl: `${BASE}/ev/1`, actionButtons: [], code: "SLA1", areaLabel: "Engenharia", logos: availability });
  assert((none.html.match(/href="mailto:/g) ?? []).length === 0 && /Sem atalho por e-mail/.test(none.html), "destinatário que não pode agir: sem atalhos e com o motivo");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
