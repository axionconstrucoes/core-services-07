// Escopo restrito das notificações SSMA (WEG_CORRECTIVE_ACTIONS), aviso operacional e respostas no corpo do e-mail.
// Puro: sem rede, sem banco, sem e-mail. Uso: node scripts/test-ssma-corrective-scope.mjs

import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveSsmaNotificationScope, scopeAllowsProject, WEG_PROJECT_ID } = await import("../apps/web/lib/ssma/field-notifications/enabled.ts");
const { resolveRecipients } = await import("../apps/web/lib/ssma/field-notifications/core.ts");
const { buildOperationalOverdueActionEmail, buildSsmaReplyConfirmationEmail } = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const { decideSsmaReply, detectSsmaReplyStatus, confirmationPendingLine, confirmationForecastLine } = await import("../apps/web/lib/ssma/field-notifications/replies.ts");
const { applyProjectPilotProfile } = await import("../apps/web/lib/email/project-pilot-profile.ts");
const { resolveGuardedReplyTo } = await import("../apps/web/lib/email/pilot-outbound-guard.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 400)}`);
    failed += 1;
  }
}

const CARLOS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const ACTION = "44444444-4444-4444-8444-444444444444";
const RECORD = "55555555-5555-4555-8555-555555555555";
const members = [
  { userId: CARLOS, name: "Carlos", email: "carlos.evandro@axion.com.br", area: "ADMINISTRATIVO", permission: "ADMINISTRADOR", status: "ACTIVE" },
  { userId: OTHER, name: "Outro", email: "outro@axion.com.br", area: "ESG_SSMA", permission: "COLABORADOR", status: "ACTIVE" },
  { userId: ADMIN, name: "Adm", email: "adm@axion.com.br", area: "DIRETORIA", permission: "ADMINISTRADOR", status: "ACTIVE" },
];

await check("escopo: desligado sem a chave; legado sem escopo; WEG restrito; valor inválido fecha tudo", () => {
  assert.equal(resolveSsmaNotificationScope({}).mode, "DISABLED");
  assert.equal(resolveSsmaNotificationScope({ ACC_SSMA_NOTIFICATIONS_SCOPE: "WEG_CORRECTIVE_ACTIONS" }).mode, "DISABLED");
  const legacy = resolveSsmaNotificationScope({ ACC_SSMA_NOTIFICATIONS_ENABLED: "true" });
  assert.equal(legacy.mode, "LEGACY_ALL");
  assert.equal(legacy.criticalRecords, true);
  const weg = resolveSsmaNotificationScope({ ACC_SSMA_NOTIFICATIONS_ENABLED: "true", ACC_SSMA_NOTIFICATIONS_SCOPE: "WEG_CORRECTIVE_ACTIONS" });
  assert.equal(weg.mode, "WEG_CORRECTIVE_ACTIONS");
  assert.equal(weg.criticalRecords, false);
  assert.equal(weg.overdueActions, true);
  assert.equal(weg.responsibleOnly, true);
  assert.equal(weg.replyEnabled, true);
  assert.equal(weg.operational, true);
  assert.equal(scopeAllowsProject(weg, WEG_PROJECT_ID), true);
  assert.equal(scopeAllowsProject(weg, "970118c0-956c-4122-ac4b-076022ad4556"), false);
  const bad = resolveSsmaNotificationScope({ ACC_SSMA_NOTIFICATIONS_ENABLED: "true", ACC_SSMA_NOTIFICATIONS_SCOPE: "weg" });
  assert.equal(bad.mode, "INVALID_SCOPE");
  assert.equal(bad.overdueActions, false);
  assert.equal(bad.criticalRecords, false);
});

await check("destinatários: escopo restrito => somente o responsável (sem lista da área SSMA)", () => {
  const legacy = resolveRecipients({ event: "ACTION_OVERDUE", responsibleUserId: CARLOS, members });
  assert.deepEqual(legacy.recipients.map((r) => r.userId).sort(), [CARLOS, OTHER].sort());
  const scoped = resolveRecipients({ event: "ACTION_OVERDUE", responsibleUserId: CARLOS, members, responsibleOnly: true });
  assert.deepEqual(scoped.recipients.map((r) => r.userId), [CARLOS]);
});

const baseCtx = {
  projectName: "WEG", recipientName: "Carlos", category: "Ato inseguro", location: "Galpao principal", description: "desc",
  occurredAt: "06/11/2026 10:43", reportedByName: "Fulano", accUrl: "https://acc.axion.com.br/x/ssma-registros", dueDate: "06/11/2026",
  daysOverdue: 12, responsibleName: "Carlos", visibleCode: "2BF391C1",
};

await check("aviso operacional: sem faixa de teste, prazo original, assunção sem culpa retroativa, instrução de resposta, cores por nível", () => {
  const high = buildOperationalOverdueActionEmail({ ...baseCtx, severity: "ALTA", takeover: { name: "Carlos", date: "18/11/2026" } });
  assert.equal(high.operational, true);
  assert.doesNotMatch(high.text + high.html + high.subject, /TESTE|PILOTO/);
  assert.match(high.text, /Prazo original da ação: 06\/11\/2026/);
  assert.match(high.text, /assumido por Carlos em 18\/11\/2026/);
  assert.match(high.text, /não é atribuído ao responsável atual/);
  assert.match(high.text, /DATA E HORÁRIO/);
  assert.match(high.html, /#fef3c7/); // ALTO amarelo
  assert.match(high.html, /acc-side/); // caixa de ação lateral
  assert.match(buildOperationalOverdueActionEmail({ ...baseCtx, severity: "CRITICA" }).html, /#fde2e1/);
  assert.match(buildOperationalOverdueActionEmail({ ...baseCtx, severity: "BAIXA" }).html, /background:#ffffff;color:#111827">/);
  const medium = buildOperationalOverdueActionEmail({ ...baseCtx, severity: "MEDIA", takeover: null });
  assert.doesNotMatch(medium.text, /assumido por/);
  assert.doesNotMatch(medium.text, /DATA E HORÁRIO/);
});

const pilotEnv = { ACC_PROJECT_PILOT_PROJECT_ID: WEG_PROJECT_ID, ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br", GOOGLE_GMAIL_INBOUND_MAILBOX: "crm@axion.com.br" };
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx12";

await check("perfil do piloto: mensagem operacional mantém To/Cc/Reply-To e não recebe faixa/etiqueta de teste", () => {
  const routed = applyProjectPilotProfile({
    to: "carlos.evandro@axion.com.br", subject: "[RISCO ALTO] ACC - aviso", text: "corpo", html: "<p>corpo</p>", correlationId: "c",
    pilot: { projectId: WEG_PROJECT_ID, operational: true },
    replyTo: `crm+alerta-${TOKEN}@axion.com.br`, replyToContext: { kind: "SSMA_CORRECTIVE_ACTION", actionId: ACTION, recordId: RECORD },
  }, pilotEnv);
  assert.equal(routed.routed, true);
  assert.equal(routed.to, "carlos.evandro@axion.com.br");
  assert.deepEqual(routed.cc, ["crm@axion.com.br"]);
  assert.equal(routed.sender, "crm@axion.com.br");
  assert.equal(routed.input.subject, "[RISCO ALTO] ACC - aviso");
  assert.equal(routed.input.text, "corpo");
  assert.equal(routed.input.replyTo, `crm+alerta-${TOKEN}@axion.com.br`);
  const test = applyProjectPilotProfile({ to: "carlos.evandro@axion.com.br", subject: "x", text: "y", correlationId: "c", pilot: { projectId: WEG_PROJECT_ID } }, pilotEnv);
  assert.match(test.input.text, /TESTE CONTROLADO/);
  assert.throws(() => applyProjectPilotProfile({ to: "axion@axion.com.br", subject: "x", text: "y", correlationId: "c", pilot: { projectId: WEG_PROJECT_ID, operational: true } }, pilotEnv));
  assert.throws(() => applyProjectPilotProfile({ to: "outro@axion.com.br", subject: "x", text: "y", correlationId: "c", pilot: { projectId: WEG_PROJECT_ID, operational: true } }, pilotEnv));
});

await check("Reply-To: contexto SSMA válido aceito; ids inválidos removem o cabeçalho", () => {
  const ok = resolveGuardedReplyTo({ replyTo: `crm+alerta-${TOKEN}@axion.com.br`, replyToContext: { kind: "SSMA_CORRECTIVE_ACTION", actionId: ACTION, recordId: RECORD } }, { alertReplyMailbox: "crm@axion.com.br" });
  assert.equal(ok.replyTo, `crm+alerta-${TOKEN}@axion.com.br`);
  const bad = resolveGuardedReplyTo({ replyTo: `crm+alerta-${TOKEN}@axion.com.br`, replyToContext: { kind: "SSMA_CORRECTIVE_ACTION", actionId: "x", recordId: RECORD } }, { alertReplyMailbox: "crm@axion.com.br" });
  assert.equal(bad.replyTo, undefined);
});

const headers = (over = {}) => ({ from: "carlos.evandro@axion.com.br", to: [`crm+alerta-${TOKEN}@axion.com.br`], messageId: "<m1@mail>", inReplyTo: "<o@acc>", references: ["<o@acc>"], subject: "Re: aviso", ...over });
const target = (over = {}) => ({ actionId: ACTION, recordId: RECORD, projectId: WEG_PROJECT_ID, actionStatus: "ABERTA", responsibleUserId: CARLOS, severity: "ALTA", lastProcessedReceivedAt: null, ...over });
const decide = (body, over = {}) =>
  decideSsmaReply({
    message: { providerMessageId: over.id ?? "g1", headers: headers(over.headers), bodyOriginal: body, receivedAt: over.receivedAt ?? "2026-11-18T12:00:00.000Z" },
    target: target(over.target),
    members,
    accMailboxes: ["crm@axion.com.br"],
    processedMessageIds: new Set(over.processed ?? []),
  });

await check("resposta: 'Tomando providências' + data e horário (ALTO) => em andamento, previsão válida, ABERTA->EM_ANDAMENTO, assume", () => {
  const d = decide("Estou tomando providências. Conclusão prevista para 20/11/2026 às 15h.\n\nAtenciosamente,\nCarlos");
  assert.equal(d.kind, "PROCESS");
  assert.equal(d.status, "IN_PROGRESS");
  assert.equal(d.forecast.status, "VALID");
  assert.equal(d.forecast.iso, "2026-11-20T18:00:00.000Z");
  assert.equal(d.newActionStatus, "EM_ANDAMENTO");
  assert.equal(d.acknowledge, true);
  assert.equal(confirmationPendingLine(d), null);
  assert.match(confirmationForecastLine(d), /20\/11\/2026/);
});

await check("resposta ALTO só com data (sem horário) => previsão PENDENTE com pedido de horário; cobrança não suspensa", () => {
  const d = decide("Em andamento. Previsão: 20/11/2026.");
  assert.equal(d.kind, "PROCESS");
  assert.equal(d.forecast.status, "INVALID");
  assert.equal(d.forecast.reason, "TIME_REQUIRED");
  assert.match(confirmationPendingLine(d), /horário/i);
});

await check("resposta MÉDIA só com data => válida (fim do dia)", () => {
  const d = decide("Em andamento. Previsão: 20/11/2026.", { target: { severity: "MEDIA" } });
  assert.equal(d.forecast.status, "VALID");
});

await check("resposta sem data => PENDENTE; datas contraditórias => AMBIGUOUS", () => {
  assert.equal(decide("Providenciando.").forecast.status, "MISSING");
  const amb = decide("Em andamento, previsão 20/11/2026 às 10h ou previsão 22/11/2026 às 10h");
  assert.equal(amb.forecast.reason, "AMBIGUOUS");
});

await check("histórico citado e assinatura não contam (data na citação ignorada)", () => {
  const d = decide("Providenciando.\n\nEm qua., 18 de nov. de 2026 às 10:00, ACC escreveu:\n> Previsão prevista para 30/11/2026 às 10h");
  assert.equal(d.kind, "PROCESS");
  assert.equal(d.forecast.status, "MISSING");
  assert.doesNotMatch(d.cleanText, /30\/11/);
});

await check("remetente não autorizado: não-membro e membro que não é o responsável (nem admin)", () => {
  assert.equal(decide("Em andamento", { headers: { from: "estranho@gmail.com" } }).kind, "UNAUTHORIZED");
  assert.equal(decide("Em andamento", { headers: { from: "outro@axion.com.br" } }).kind, "UNAUTHORIZED");
  assert.equal(decide("Em andamento. Conclusão prevista para 20/11/2026 às 15h", { headers: { from: "adm@axion.com.br" } }).kind, "PROCESS");
});

await check("duplicada, autoresposta, cópia do próprio ACC e ação concluída => ignoradas", () => {
  assert.deepEqual(decide("Em andamento", { processed: ["g1"] }), { kind: "IGNORE", reason: "ALREADY_PROCESSED" });
  assert.equal(decide("Fora do escritório", { headers: { autoSubmitted: "auto-replied" } }).reason, "IGNORED_AUTO_REPLY");
  assert.equal(decide("x", { headers: { xAccOutbound: "1" } }).reason, "IGNORED_SELF");
  assert.equal(decide("Em andamento", { target: { actionStatus: "CONCLUIDA" } }).reason, "ACTION_CLOSED");
});

await check("fora de ordem: mensagem anterior à última processada não altera status/previsão nem assume", () => {
  const d = decide("Em andamento. Conclusão prevista para 25/11/2026 às 15h", { receivedAt: "2026-11-18T10:00:00.000Z", target: { lastProcessedReceivedAt: "2026-11-18T11:00:00.000Z" } });
  assert.equal(d.kind, "PROCESS");
  assert.equal(d.outOfOrder, true);
  assert.equal(d.newActionStatus, null);
  assert.match(d.note, /FORA DE ORDEM/);
});

await check("status: conclusão informada sem previsão; texto sem status => OTHER com pendência", () => {
  assert.equal(detectSsmaReplyStatus("Já foi concluído hoje."), "CONCLUSION_REPORTED");
  const other = decide("Ok, obrigado");
  assert.equal(other.status, "OTHER");
  assert.match(confirmationPendingLine(other), /Status não reconhecido/);
});

await check("confirmação: Re: na mesma thread, previsão com fuso, sem faixa de teste", () => {
  const c = buildSsmaReplyConfirmationEmail({
    projectName: "WEG", recipientName: "Carlos", category: "Ato inseguro", location: "Galpao", visibleCode: "2BF391C1", originalSubject: "[RISCO ALTO] aviso",
    statusLabel: "Em andamento", forecastLine: "20/11/2026 15:00 (horário de Brasília — America/Sao_Paulo)", pendingLine: null, outOfOrder: false, accUrl: "https://acc",
  });
  assert.equal(c.subject, "Re: [RISCO ALTO] aviso");
  assert.match(c.text, /America\/Sao_Paulo/);
  assert.doesNotMatch(c.text, /TESTE|PILOTO/);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
