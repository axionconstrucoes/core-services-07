// N3 — respostas por e-mail de AÇÃO SLA, RESUMO SEMANAL (por item) e ALERTA DE CONTRATO: camada PURA (sem banco, sem rede).
//  1) decideTokenReply: cada tipo × comando, incompletos (descrição / previsão / horário / destino / justificativa / comando),
//     remetente LEITURA, não autorizado, externo, sem autenticação, item encerrado, Administrador, evidência ALTO/CRÍTICO.
//  2) DMARC/DKIM: fallback do locatário Google Workspace (desligado por padrão; só gappssmtp do PRÓPRIO domínio + SPF
//     alinhado; conflito/ARC/servidor não confiável continuam recusados).
//  3) Emissão: token por item gravado ANTES do link; tipos sem processamento, caixa ausente ou falha => sem atalhos;
//     elegibilidade do destinatário do escalonamento SLA.
//  4) Templates: atalhos por item no escalonamento SLA, resumo semanal, contrato individual e lote (HTML e texto).
//  5) Emissores (código-fonte): token emitido antes do envio; mapeamento de erros; texto da confirmação.
// Uso: node scripts/test-email-replies-n3-pure.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const decision = await import("../apps/web/lib/email-replies/token-reply-decision.ts");
const auth = await import("../apps/web/lib/email-replies/sender-authentication.ts");
const issue = await import("../apps/web/lib/email-replies/issue-item-reply-mailto.ts");
const tokens = await import("../apps/web/lib/email-replies/reply-tokens.ts");
const confirmations = await import("../apps/web/lib/email-replies/token-reply-confirmations.ts");
const { buildContractAlertEmail } = await import("../apps/web/lib/email/templates/contract-alert-template.ts");
const { buildContractAlertBatchEmail } = await import("../apps/web/lib/email/templates/contract-alert-batch-template.ts");
const { buildSlaEscalationEmail } = await import("../apps/web/lib/email/templates/sla-escalation-template.ts");
const { buildWeeklyAlertDigestEmail } = await import("../apps/web/lib/email/templates/weekly-alert-digest-template.ts");

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
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const AUTH_OK = "mx.google.com; dkim=pass header.i=@axion.com.br; spf=pass smtp.mailfrom=axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const MEMBERS = [
  { userId: "u-resp", email: "carlos.evandro@axion.com.br", name: "Carlos Evandro", status: "ACTIVE", permission: "COLABORADOR" },
  { userId: "u-maria", email: "maria.souza@axion.com.br", name: "Maria Souza", status: "ACTIVE", permission: "COLABORADOR" },
  { userId: "u-admin", email: "admin.obra@axion.com.br", name: "Admin Obra", status: "ACTIVE", permission: "ADMINISTRADOR" },
  { userId: "u-leitura", email: "leo.leitura@axion.com.br", name: "Leo Leitura", status: "ACTIVE", permission: "LEITURA" },
];
let n = 0;
function decide(kind, body, { from = "carlos.evandro@axion.com.br", authResults = AUTH_OK, severity = "MEDIUM", closed = false, evidenceRequired = false, env } = {}) {
  n += 1;
  return decision.decideTokenReply({
    message: { providerMessageId: `m${n}`, headers: { from, to: ["crm+alerta-x@axion.com.br"], messageId: `<m${n}@x>`, inReplyTo: null, references: [], authenticationResults: authResults, subject: "RESOLVIDO" }, bodyOriginal: body, receivedAt: "2026-11-20T12:00:00Z" },
    target: { kind, subjectId: "s1", projectId: "p1", actorUserIds: ["u-resp"], closed, closedReason: closed ? "Encerrado." : null, severity, currentResponsibleUserId: "u-resp", evidenceRequired },
    members: MEMBERS,
    accMailboxes: ["crm@axion.com.br"],
    processedMessageIds: new Set(),
    workspaceTenantDomains: env,
  });
}

// ======================================================================= 1) decisão
await check("1.1 cada tipo × comando (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA) => PROCESS com o ator real", () => {
  for (const kind of decision.TOKEN_REPLY_KINDS) {
    const r = decide(kind, "RESOLVIDO: pagamento conferido e liberado");
    const p = decide(kind, "EM ANDAMENTO: aguardando o cliente\nPrevisão: 25/11/2026");
    const f = decide(kind, "ENVIAR PARA: Maria Souza\nJustificativa: Maria responde pelo tema");
    assert(r.kind === "PROCESS" && r.command === "RESOLVE" && r.actorUserId === "u-resp" && r.note === "pagamento conferido e liberado", `${kind} R ${JSON.stringify(r)}`);
    assert(p.kind === "PROCESS" && p.command === "IN_PROGRESS" && /aguardando o cliente/.test(p.note) && /25\/11\/2026/.test(p.note), `${kind} A ${JSON.stringify(p)}`);
    assert(f.kind === "PROCESS" && f.command === "FORWARD" && f.forward.targetUserId === "u-maria" && /Maria responde/.test(f.forward.reason), `${kind} E ${JSON.stringify(f)}`);
  }
});
await check("1.2 incompletos => REJECT com o que falta (nada a gravar)", () => {
  const cases = [
    ["RESOLVIDO", "RESOLVE_DESCRIPTION_REQUIRED"],
    ["RESOLVIDO: ok", "RESOLVE_DESCRIPTION_REQUIRED"],
    ["EM ANDAMENTO: tratando", "FORECAST_REQUIRED"],
    ["EM ANDAMENTO:\nPrevisão: 25/11/2026", "IN_PROGRESS_INCOMPLETE"],
    ["EM ANDAMENTO: tratando\nPrevisão: 01/01/2020", "IN_PROGRESS_INCOMPLETE"],
    ["ENVIAR PARA:\nJustificativa: alguém assume", "TARGET_MISSING"],
    ["ENVIAR PARA: Fulano Inexistente\nJustificativa: assumir", "TARGET_NOT_FOUND"],
    ["ENVIAR PARA: Leo Leitura\nJustificativa: assumir o tema", "TARGET_NOT_ELIGIBLE"],
    ["ENVIAR PARA: Carlos Evandro\nJustificativa: assumir", "TARGET_IS_SENDER"],
    ["ENVIAR PARA: Maria Souza, ok", "FORWARD_REASON_REQUIRED"],
    ["RESOLVIDO: feito\nENVIAR PARA: Maria Souza", "COMMAND_AMBIGUOUS"],
    ["Vou verificar.", "COMMAND_NOT_RECOGNIZED"],
  ];
  for (const [body, code] of cases) {
    const d = decide("SLA_ACTION", body);
    assert(d.kind === "REJECT" && d.code === code && d.actorUserId === "u-resp" && d.message.length > 10, `${body} => ${JSON.stringify(d)}`);
  }
  const hi = decide("SLA_ACTION", "EM ANDAMENTO: tratando\nPrevisão: 25/11/2026", { severity: "HIGH" });
  assert(hi.kind === "REJECT" && /hor[áa]rio/i.test(hi.message), "ALTO exige horário");
  const hiOk = decide("SLA_ACTION", "EM ANDAMENTO: tratando\nPrevisão: 25/11/2026 15:00", { severity: "CRITICAL" });
  assert(hiOk.kind === "PROCESS", "CRÍTICO com data e horário");
});
await check("1.3 remetentes: LEITURA, colaborador sem vínculo com o item, externo, sem autenticação => UNAUTHORIZED; Administrador pode; item encerrado => REJECT", () => {
  const body = "RESOLVIDO: pagamento conferido e liberado";
  const l = decide("CONTRACT_ALERT_ITEM", body, { from: "leo.leitura@axion.com.br" });
  assert(l.kind === "UNAUTHORIZED" && l.reason === "SENDER_READ_ONLY" && l.explainTo === "u-leitura", JSON.stringify(l));
  const m = decide("WEEKLY_DIGEST_ITEM", body, { from: "maria.souza@axion.com.br" });
  assert(m.kind === "UNAUTHORIZED" && m.reason === "SENDER_NOT_ALLOWED" && /destinatário do resumo/.test(m.explanation), JSON.stringify(m));
  const e = decide("SLA_ACTION", body, { from: "carlos@gmail.com" });
  assert(e.kind === "UNAUTHORIZED" && e.reason === "SENDER_NOT_CORPORATE" && e.explainTo === null, JSON.stringify(e));
  const x = decide("SLA_ACTION", body, { from: "otto.outra@axion.com.br" });
  assert(x.kind === "UNAUTHORIZED" && x.reason === "SENDER_NOT_MEMBER" && x.explainTo === null, "membro de outra obra");
  const a = decide("SLA_ACTION", body, { authResults: null });
  assert(a.kind === "UNAUTHORIZED" && a.reason === "AUTH_RESULTS_MISSING" && a.explainTo === "u-resp", JSON.stringify(a));
  const adm = decide("SLA_ACTION", body, { from: "admin.obra@axion.com.br" });
  assert(adm.kind === "PROCESS" && adm.isAdmin, "Administrador pode agir");
  const c = decide("SLA_ACTION", body, { closed: true });
  assert(c.kind === "REJECT" && c.code === "ITEM_CLOSED", JSON.stringify(c));
  const auto = decision.decideTokenReply({
    message: { providerMessageId: "auto", headers: { from: "carlos.evandro@axion.com.br", to: [], messageId: null, inReplyTo: null, references: [], autoSubmitted: "auto-replied", authenticationResults: AUTH_OK }, bodyOriginal: "RESOLVIDO: x", receivedAt: "2026-11-20T12:00:00Z" },
    target: { kind: "SLA_ACTION", subjectId: "s", projectId: "p", actorUserIds: ["u-resp"], closed: false, severity: "LOW", currentResponsibleUserId: "u-resp", evidenceRequired: false },
    members: MEMBERS, accMailboxes: ["crm@axion.com.br"], processedMessageIds: new Set(),
  });
  assert(auto.kind === "IGNORE" && auto.reason === "IGNORED_AUTO_REPLY", "autoresposta ignorada");
});
await check("1.4 evidência: RESOLVIDO de ação SLA ALTO/CRÍTICO sinaliza evidenceRequired (o worker exige o anexo); demais não", () => {
  assert(decide("SLA_ACTION", "RESOLVIDO: guarda-corpo reinstalado", { severity: "CRITICAL", evidenceRequired: true }).evidenceRequired === true);
  assert(decide("CONTRACT_ALERT_ITEM", "RESOLVIDO: aditivo assinado pelas partes", { severity: "CRITICAL" }).evidenceRequired === false);
});
await check("1.5 erros das RPCs => texto ao remetente; desconhecido => null (nova tentativa)", () => {
  for (const code of ["EVIDENCE_REQUIRED", "READ_ONLY_PROFILE", "PROJECT_ACCESS_DENIED", "ACTION_CLOSED", "RISK_CASE_LINKED", "SSMA_ACTION_USE_SSMA_CHANNEL", "ITEM_ALREADY_RESPONDED", "FORWARD_REASON_REQUIRED", "NEW_RESPONSIBLE_NOT_ELIGIBLE"]) {
    const m = decision.tokenReplyRpcErrorMessage(`ERROR: ${code}`);
    assert(m && m.code === code && /Nada foi alterado|nada foi alterado|não foi registrada/.test(m.text), `${code}: ${JSON.stringify(m)}`);
  }
  assert(decision.tokenReplyRpcErrorMessage("O item \"X\" agora está sob responsabilidade de outra pessoa; a resposta não foi registrada.").code === "RULE_REJECTED");
  assert(decision.tokenReplyRpcErrorMessage("connection reset") === null);
});

// ======================================================================= 2) DMARC/DKIM
const TENANT_ONLY = "mx.google.com; dkim=pass header.i=@axion-com-br.20230601.gappssmtp.com header.s=20230601 header.b=abc; spf=pass (google.com: domain of carlos.evandro@axion.com.br designates 209.85.220.41 as permitted sender) smtp.mailfrom=carlos.evandro@axion.com.br";
await check("2.1 interno sem DMARC/DKIM próprios: recusado por padrão (AUTH_NOT_ALIGNED); aceito SÓ com o fallback do locatário habilitado para o domínio", () => {
  assert(auth.verifySenderAuthentication({ fromEmail: "carlos.evandro@axion.com.br", authenticationResults: TENANT_ONLY }).reason === "AUTH_NOT_ALIGNED", "padrão P2 inalterado");
  const ok = auth.verifySenderAuthentication({ fromEmail: "carlos.evandro@axion.com.br", authenticationResults: TENANT_ONLY, workspaceTenantDomains: ["axion.com.br"] });
  assert(ok.ok && ok.method === "WORKSPACE_TENANT" && ok.authservId === "mx.google.com", JSON.stringify(ok));
  assert(auth.verifySenderAuthentication({ fromEmail: "carlos.evandro@axion.com.br", authenticationResults: AUTH_OK, workspaceTenantDomains: ["axion.com.br"] }).method === "DMARC", "DMARC continua tendo precedência");
});
await check("2.2 fallback NÃO aceita: chave de outro locatário, SPF de outro domínio, SPF sozinho, DKIM sozinho, dmarc=fail, servidor não confiável, ARC, domínio não listado", () => {
  const T = ["axion.com.br"];
  const v = (results, from = "carlos.evandro@axion.com.br", domains = T) => auth.verifySenderAuthentication({ fromEmail: from, authenticationResults: results, workspaceTenantDomains: domains });
  assert(v(TENANT_ONLY.replace("axion-com-br.", "outra-empresa-com-br.")).ok === false, "outro locatário");
  assert(v(TENANT_ONLY.replace("axion-com-br.20230601", "axion-com-br.2023")).ok === false, "chave fora do formato");
  assert(v(TENANT_ONLY.replace("smtp.mailfrom=carlos.evandro@axion.com.br", "smtp.mailfrom=bounce@gmail.com")).ok === false, "SPF de outro domínio");
  assert(v("mx.google.com; spf=pass smtp.mailfrom=axion.com.br").ok === false, "SPF sozinho");
  assert(v("mx.google.com; dkim=pass header.d=axion-com-br.20230601.gappssmtp.com").ok === false, "DKIM do locatário sem SPF alinhado");
  assert(v(`${TENANT_ONLY}; dmarc=fail header.from=axion.com.br`).reason === "AUTH_FAILED", "conflito nunca vira aceitação");
  assert(v(TENANT_ONLY.replace("mx.google.com", "evil.example")).reason === "AUTH_UNTRUSTED_SERVER", "servidor não confiável");
  assert(v(TENANT_ONLY, "carlos@outra.com.br", T).ok === false, "domínio do From fora da lista");
  assert(v(TENANT_ONLY, "carlos.evandro@axion.com.br", []).ok === false, "fallback desligado");
  assert(auth.verifySenderAuthentication({ fromEmail: "carlos.evandro@axion.com.br", authenticationResults: [], workspaceTenantDomains: T }).reason === "AUTH_RESULTS_MISSING", "ARC-Authentication-Results não é lido (sem Authentication-Results => ausente)");
  assert(auth.resolveWorkspaceTenantDomains({}).length === 0 && auth.resolveWorkspaceTenantDomains({ ACC_EMAIL_WORKSPACE_TENANT_DOMAINS: "axion.com.br, x" }).join(",") === "axion.com.br");
  assert(auth.isWorkspaceTenantSigningDomain("axion-com-br.20230601.gappssmtp.com", "axion.com.br") && !auth.isWorkspaceTenantSigningDomain("axion-com-br.20230601.gappssmtp.com.evil.com", "axion.com.br"));
});
await check("2.3 decisão usa o fallback só quando configurado", () => {
  assert(decide("SLA_ACTION", "RESOLVIDO: pagamento conferido e liberado", { authResults: TENANT_ONLY }).reason === "AUTH_NOT_ALIGNED");
  assert(decide("SLA_ACTION", "RESOLVIDO: pagamento conferido e liberado", { authResults: TENANT_ONLY, env: ["axion.com.br"] }).kind === "PROCESS");
});

// ======================================================================= 3) emissão
const MAILBOX = "crm@axion.com.br";
await check("3.1 issueItemReplyMailto: grava o hash ANTES de devolver os três atalhos; código visível por tipo; nada de dado do alerta no corpo", async () => {
  const store = tokens.createMemoryEmailReplyTokenStore();
  for (const [kind, prefix] of [["SLA_ACTION", "ACC-SLA"], ["WEEKLY_DIGEST_ITEM", "ACC-RESUMO"], ["CONTRACT_ALERT_ITEM", "ACC-CONTRATO"]]) {
    const links = await issue.issueItemReplyMailto({ store, mailbox: MAILBOX, projectId: "p1", kind, subjectId: "abcdef12-0000-4000-8000-000000000001", recipientUserId: "u-resp", severity: "HIGH", nowIso: "2026-11-20T12:00:00Z", evidenceRequired: kind === "SLA_ACTION" });
    assert(links && Object.keys(links).length === 3, kind);
    const row = store.rows.find((r) => r.subjectKind === kind);
    assert(row && row.recipientUserId === "u-resp" && /^[0-9a-f]{64}$/.test(row.tokenHash), `${kind}: hash gravado`);
    const dec = decodeURIComponent(links.RESOLVIDO);
    assert(dec.includes(`[${prefix}:ABCDEF12]`), dec);
    assert(!/pagamento|Carlos|WEG/.test(dec), "sem dados do alerta");
    assert(decodeURIComponent(links.EM_ANDAMENTO).includes("hh:mm"), "ALTO pede horário");
  }
  assert(decodeURIComponent((await issue.issueItemReplyMailto({ store, mailbox: MAILBOX, projectId: "p1", kind: "SLA_ACTION", subjectId: "s2", recipientUserId: "u", severity: "CRITICAL", nowIso: "2026-11-20T12:00:00Z", evidenceRequired: true })).RESOLVIDO).includes("anexe a evidência"));
});
await check("3.2 sem atalhos: tipo sem processamento (VERSION_REVIEW), caixa ausente/inválida, sem store, falha ao gravar o token", async () => {
  const base = { projectId: "p1", subjectId: "s", recipientUserId: "u", severity: "LOW", nowIso: "2026-11-20T12:00:00Z" };
  const store = tokens.createMemoryEmailReplyTokenStore();
  assert((await issue.issueItemReplyMailto({ ...base, store, mailbox: MAILBOX, kind: "VERSION_REVIEW" })) === null);
  assert((await issue.issueItemReplyMailto({ ...base, store, mailbox: "", kind: "SLA_ACTION" })) === null);
  assert((await issue.issueItemReplyMailto({ ...base, store, mailbox: "não é caixa", kind: "SLA_ACTION" })) === null);
  assert((await issue.issueItemReplyMailto({ ...base, store: null, mailbox: MAILBOX, kind: "SLA_ACTION" })) === null);
  const broken = { insert: async () => { throw new Error("db"); }, findByHashes: async () => [], consume: async () => false, release: async () => {} };
  assert((await issue.issueItemReplyMailto({ ...base, store: broken, mailbox: MAILBOX, kind: "SLA_ACTION" })) === null, "falha ao gravar => sem link");
  assert(store.rows.length === 0, "nenhum token para quem não recebe atalho");
});
await check("3.3 escalonamento SLA: atalhos só para quem pode agir (responsável não LEITURA ou Administrador), ação aberta, sem SSMA/alerta de risco", () => {
  const action = { status: "OVERDUE", responsible_user_id: "u-resp", related_ssma_corrective_action_id: null };
  const e = (over) => issue.slaReplyEligible({ action, riskCaseLinked: false, recipientUserId: "u-resp", recipientPermission: "COLABORADOR", ...over });
  assert(e({}) === true, "responsável");
  assert(e({ recipientUserId: "u-chefe", recipientPermission: "GESTOR" }) === false, "superior não administrador não pode agir");
  assert(e({ recipientUserId: "u-adm", recipientPermission: "ADMINISTRADOR" }) === true, "Administrador");
  assert(e({ recipientPermission: "LEITURA" }) === false, "LEITURA");
  assert(e({ riskCaseLinked: true }) === false, "alerta de risco");
  assert(e({ action: { ...action, related_ssma_corrective_action_id: "x" } }) === false, "SSMA");
  assert(e({ action: { ...action, status: "COMPLETED" } }) === false, "encerrada");
  assert(e({ recipientUserId: null }) === false, "destinatário sem perfil");
});

// ======================================================================= 4) templates
const mailtosOf = (s) => s.match(/mailto:[^"\s<>]+/g) ?? [];
const links = await issue.issueItemReplyMailto({ store: tokens.createMemoryEmailReplyTokenStore(), mailbox: MAILBOX, projectId: "p1", kind: "SLA_ACTION", subjectId: "11111111-0000-4000-8000-000000000001", recipientUserId: "u", severity: "MEDIUM", nowIso: "2026-11-20T12:00:00Z" });
const logos = { maroon: false, inverted: false };
const BASE = "https://acc.example.com";
await check("4.1 escalonamento SLA com atalhos: três mailto (HTML e texto) e motivo dos botões aponta para eles; sem atalhos => texto anterior", () => {
  const input = { recipientName: "Ana", projectName: "WEG", severity: "MEDIA", actionTitle: "t", currentResponsibleName: "Carlos", originalDeadline: "x", overdueBy: "2h", previousLevelLabel: "Responsável", escalationLevelLabel: "1º Escalão", recommendedAction: "r", eventUrl: `${BASE}/ev/1`, actionButtons: [], code: "SLA1", areaLabel: "Engenharia", logos };
  const withLinks = buildSlaEscalationEmail({ ...input, replyByEmail: links });
  assert(mailtosOf(withLinks.html).length === 3 && mailtosOf(withLinks.text).length === 3, "atalhos");
  assert(/Use os atalhos/.test(withLinks.html) && !/Sem atalho por e-mail/.test(withLinks.html), "motivo coerente");
  const without = buildSlaEscalationEmail(input);
  assert(mailtosOf(without.html).length === 0 && /Sem atalho por e-mail/.test(without.html), "sem atalhos");
});
await check("4.2 resumo semanal: atalhos POR ITEM (cada item com o seu); item sem token sai só com o formulário", () => {
  const items = [
    { actionId: "aaaaaaaa-0000-4000-8000-000000000001", title: "Item A", description: "d", riskLevel: "MEDIUM", dueAt: "25/11/2026", replyByEmail: links },
    { actionId: "aaaaaaaa-0000-4000-8000-000000000002", title: "Item B", description: "d", riskLevel: "LOW", dueAt: null },
  ];
  const built = buildWeeklyAlertDigestEmail({ recipientName: "Ana", projectName: "WEG", responseUrl: `${BASE}/r`, logos, items });
  assert(mailtosOf(built.html).length === 3 && mailtosOf(built.text).length === 3, `${mailtosOf(built.html).length}/${mailtosOf(built.text).length}`);
});
await check("4.3 contrato individual e lote: painel de atalhos por alerta (HTML e texto)", () => {
  const single = buildContractAlertEmail({ recipientName: "Ana", projectName: "WEG", title: "t", summary: "s", relatedEventTitle: "e", contractualBasis: null, confrontationBlocks: [], impactedClause: { label: "8.2", text: "x" }, keyEvidence: [], potentialImpact: "p", recommendedAction: "r", responsibleName: "B", dueDate: "x", eventUrl: `${BASE}/ev/1`, actionButtons: [], hasInlineLogo: true, hasInlineInvertedLogo: true, quickActionUrls: { RESOLVIDO: `${BASE}/q`, EM_ANDAMENTO: `${BASE}/q2`, ENVIADO_PARA: `${BASE}/q3` }, aiConsultUrl: `${BASE}/c`, repeatNotice: true, severity: "ALTA", replyByEmail: links });
  assert(mailtosOf(single.html).length === 3 && mailtosOf(single.text).length === 3, "individual");
  const item = (eventId, reply) => ({ eventId, projectName: "WEG", title: "t", severity: "MEDIA", riskDescription: "d", clauseLabel: null, clauseText: null, evidence: [], eventUrl: `${BASE}/ev/${eventId}`, respondItemUrl: `${BASE}/lote#${eventId}`, quickActionUrl: `${BASE}/q/${eventId}`, aiConsultUrl: `${BASE}/c/${eventId}`, replyByEmail: reply });
  const batch = buildContractAlertBatchEmail({ recipientName: "Ana", projectName: "WEG", batchUrl: `${BASE}/lote`, hasInlineLogo: true, hasInlineInvertedLogo: true, items: [item("e1", links), item("e2", null)] });
  assert(mailtosOf(batch.html).length === 3 && mailtosOf(batch.text).length === 3, "lote: só o item com token");
});

// ======================================================================= 5) emissores e confirmação
await check("5.1 emissores (código-fonte): token por item emitido ANTES do provider.send; tipos certos; falha nunca bloqueia o envio", () => {
  const files = {
    "apps/web/lib/email/send-sla-escalation-email.ts": "SLA_ACTION",
    "apps/web/lib/email/send-weekly-alert-digest-email.ts": "WEEKLY_DIGEST_ITEM",
    "apps/web/lib/email/create-and-send-contract-alert-batch.ts": "CONTRACT_ALERT_ITEM",
    "apps/web/lib/email/send-contract-alert-email.ts": "CONTRACT_ALERT_ITEM",
  };
  for (const [rel, kind] of Object.entries(files)) {
    const src = read(rel);
    const i = src.indexOf("issueItemReplyMailto(");
    const s = src.indexOf("provider.send(");
    assert(i > 0 && s > 0 && i < s, `${rel}: token antes do envio`);
    assert(src.includes(`kind: "${kind}"`), `${rel}: ${kind}`);
    assert(/catch \{/.test(src), `${rel}: falha não bloqueia`);
  }
  const ssmaAccident = read("apps/web/lib/email/send-ssma-accident-alert-email.ts");
  assert(!/issueItemReplyMailto|replyByEmail/.test(ssmaAccident), "acidente sem atalhos");
});
await check("5.2 confirmação: aplicada x recusada (recusa nunca afirma registro); assunto Re:", () => {
  const ok = confirmations.buildTokenReplyConfirmationEmail({ subject_kind: "SLA_ACTION", original_subject: "RESOLVIDO [ACC-SLA:X]", outcome: "APPLIED", status_label: "Resolvido por e-mail", detail_line: null });
  assert(/REGISTRADA/.test(ok.text) && ok.subject === "Re: RESOLVIDO [ACC-SLA:X]", JSON.stringify(ok.subject));
  const no = confirmations.buildTokenReplyConfirmationEmail({ subject_kind: "CONTRACT_ALERT_ITEM", original_subject: "Re: x", outcome: "INCOMPLETE", status_label: "NÃO aplicado", detail_line: "Descreva <b>" });
  assert(/NÃO foi aplicada/.test(no.text) && !/REGISTRADA/.test(no.text) && no.html.includes("&lt;b&gt;") && no.subject === "Re: x", "recusa");
});
await check("5.3 tipos processáveis: RISK_CASE, SSMA_ACTION e (N3) SLA_ACTION, WEEKLY_DIGEST_ITEM, CONTRACT_ALERT_ITEM; VERSION_REVIEW não", () => {
  assert([...tokens.EMAIL_REPLY_PROCESSABLE_KINDS].sort().join(",") === "CONTRACT_ALERT_ITEM,RISK_CASE,SLA_ACTION,SSMA_ACTION,WEEKLY_DIGEST_ITEM");
  assert(!tokens.isProcessableReplyKind("VERSION_REVIEW"));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
