// Exceção TEMPORÁRIA do piloto por nível: Nível 2 (Gestor) do Planejamento para um usuário da allowlist
// enquanto o titular definitivo (convite pendente) está fora do piloto. A Matriz não muda; prazos e SLA
// não mudam; mensagens diferenciam o nível mesmo com o mesmo destinatário; sem duplicação.
// Funções REAIS (planejador, política da Matriz, montagem do e-mail). Nenhum banco, rede ou e-mail.
// Uso: node scripts/test-pilot-level-overrides.mjs
import net from "node:net";
import { register } from "node:module";

const leaked = Object.keys(process.env).filter((k) => /^(SUPABASE_|NEXT_PUBLIC_SUPABASE|GOOGLE_(?!GMAIL_INBOUND_MAILBOX$)|ANTHROPIC_API_KEY|ELEVENLABS_|CRON_SECRET|ACC_RISK_ALERTS_)/.test(k));
if (leaked.length > 0) {
  console.error(`ABORTADO: credenciais no ambiente (${leaked.join(", ")}). Rode com ambiente limpo.`);
  process.exit(2);
}
globalThis.fetch = async () => {
  throw new Error("NETWORK_BLOCKED");
};
net.Socket.prototype.connect = function blockedConnect() {
  throw new Error("NETWORK_BLOCKED");
};
process.env.ACC_WEEKLY_REPORTS_ENABLED = "true";
process.env.AXION_APP_BASE_URL = "https://acc-simulacao.invalid";
process.env.GOOGLE_GMAIL_INBOUND_MAILBOX = "crm@axion.com.br";
register("./ts-module-resolver.mjs", import.meta.url);
register("./lib/weg-alert-sim/hooks.mjs", import.meta.url);

const mod = await import("../apps/web/lib/risk-alerts/pilot-level-overrides");
const { resolveMatrixPolicy } = await import("../apps/web/lib/sla/resolve-matrix-policy");
const { planRiskAlerts } = await import("../apps/web/lib/risk-alerts/plan-risk-alerts");
const { buildImmediateRiskAlertEmail } = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails");

let passed = 0;
let failed = 0;
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}

const WEG = "00000000-0000-4000-8000-000000000001";
const T0 = "2026-11-18T12:00:00.000Z";
const INVITE = "e5555555-0000-4000-8000-000000000015";
const U = { rey: "a1111111-0000-4000-8000-000000000011", jaime: "b2222222-0000-4000-8000-000000000012", carlos: "c3333333-0000-4000-8000-000000000013", gestor: "f6666666-0000-4000-8000-000000000016" };
const EMAIL = { [U.rey]: "reynaldo@axion.com.br", [U.jaime]: "jaime.ramos@axion.com.br", [U.carlos]: "carlos.evandro@axion.com.br", [U.gestor]: "gestor@axion.com.br" };
const ALLOW = [U.rey, U.jaime, U.carlos];
// CRÍTICO aprovado: assumir 1 h; Gestor após +1 h (T+61); Diretoria após +2 h... (aqui 1/1/2, como a regra vigente).
const rule = (riskLevel) => ({ id: `r-${riskLevel}`, projectId: WEG, riskLevel, area: null, timeUnit: "CLOCK_HOURS", assumeDeadlineValue: 1, respondDeadlineValue: null, completeDeadlineValue: null, escalation2AfterValue: 1, boardAfterValue: 2, notifyByEmail: true, requiresAcknowledgmentConfirmation: true, requiresDelayJustification: true, isDefault: false, active: true });
const resp = (o = {}) => ({ id: "resp-PLAN", projectId: WEG, area: "PLANEJAMENTO", responsibleDirectUserId: U.jaime, responsibleDirectInvitationId: null, responsibleDirectName: null, secondaryResponsibleUserId: U.rey, secondaryResponsibleInvitationId: null, secondaryResponsibleName: null, escalation1UserId: null, escalation1InvitationId: INVITE, escalation1Name: null, escalation2UserId: null, escalation2Name: null, boardUserId: U.rey, boardInvitationId: null, boardName: null, updatedAt: T0, ...o });
const recipients = () => new Map(Object.values(U).map((id) => [id, { userId: id, name: `Pessoa ${id.slice(-2)}`, email: EMAIL[id], membershipStatus: "ACTIVE" }]));
const config = (allow = ALLOW) => ({ enabled: true, riskAlertsEnabled: true, pilotRecipientAllowlistUserIds: allow, senderDomain: "axion.com.br", severityMap: { MISSING_WEEKLY_SCHEDULE: "HIGH", MISSING_WEEKLY_REPORT_WORKBOOK: "HIGH", MISSING_S_CURVE: "MEDIUM" }, pilotProjectConfirmedAt: T0, pilotDeliveryOverrideEmail: null });
const auditRow = (o = {}) => ({
  id: "aud-set-1",
  project_id: WEG,
  occurred_at: "2026-11-18T13:00:00.000Z",
  actor_type: "USER",
  actor_user_id: U.rey,
  action: mod.LEVEL_OVERRIDE_SET_ACTION,
  entity_type: mod.LEVEL_OVERRIDE_ENTITY_TYPE,
  entity_id: `${WEG}:PLANEJAMENTO:LEVEL_2`,
  detail: JSON.stringify({ area: "PLANEJAMENTO", level: "LEVEL_2", recipientUserId: U.rey, reason: "Exceção temporária do piloto" }),
  ...o,
});
const policyFor = ({ responsibles = [resp()], overrides = mod.resolvePilotLevelOverrides(WEG, [auditRow()]), allow = ALLOW } = {}) => (area, riskLevel) =>
  mod.applyPilotLevelOverride(resolveMatrixPolicy({ rules: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(rule), responsibles, settings: null, area, riskLevel }), overrides, allow);

const caseInput = { sourceType: "SCHEDULE_COMPARISON", sourceId: "src-x", area: "PLANEJAMENTO", riskLevel: "CRITICAL", title: "[ENSAIO] Risco crítico", summary: "s", impact: "i", recommendation: "r", fingerprint: "fp-x", originPath: "", closed: false, reference: "W47" };
const CASE_KEY = "SCHEDULE_COMPARISON:src-x";
const existing = { id: "case-x", sourceType: "SCHEDULE_COMPARISON", sourceId: "src-x", area: "PLANEJAMENTO", riskLevel: "CRITICAL", previousRiskLevel: null, fingerprint: "fp-x", status: "OPEN", slaActionId: "act-x", lastDigestWindow: null, firstSeenAt: T0, lastChangedAt: T0, closedAt: null, title: "t", summary: "s", impact: "", recommendation: null, originPath: "", reference: "W47", state: "OPEN", currentLevel: "RESPONSAVEL", currentResponsibleUserId: U.jaime, previousResponsibleUserId: null, topLevelReachedAt: null };
// Prazo de assumir em T0+1h; "agora" = T0+61 min (assumir vencido => Nível 2).
const linked = (o = {}) => ({ id: "act-x", status: "PENDING", currentEscalationLevel: "RESPONSAVEL", assumeDueAt: "2026-11-18T13:00:00.000Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, contractualDeadline: null, responsibleUserId: U.jaime, ...o });
const NOW_T61 = "2026-11-18T13:01:00.000Z";
const basePlan = (o = {}) => ({
  now: NOW_T61,
  projectId: WEG,
  projectName: "P",
  featureEnabled: true,
  providerConfigured: true,
  dryRun: false,
  config: config(),
  timeZone: "America/Sao_Paulo",
  cases: [caseInput],
  existingCases: [existing],
  linkedActions: new Map([["act-x", linked()]]),
  policyFor: policyFor(),
  recipients: recipients(),
  existingIdempotencyKeys: new Set([`${CASE_KEY}:IMMEDIATE:fp-x:${U.jaime}`, `${CASE_KEY}:IMMEDIATE:fp-x:${U.rey}`]),
  previousDigestSentAt: null,
  ...o,
});
const escalations = (plan) => plan.outbox.filter((e) => e.notificationType === "ESCALATION");

await check("1. Resolução auditável: registro humano mais recente decide; SYSTEM, detalhe inválido, outro projeto e destinatário inválido são ignorados; UNSET encerra", () => {
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow()]).length === 1);
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow({ actor_type: "SYSTEM", actor_user_id: null })]).length === 0, "SYSTEM ignorado");
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow({ detail: "{" })]).length === 0, "detalhe inválido");
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow({ detail: JSON.stringify({ area: "FINANCEIRO", level: "LEVEL_2", recipientUserId: U.rey }) })]).length === 0, "área do detalhe deve coincidir");
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow({ detail: JSON.stringify({ area: "PLANEJAMENTO", level: "LEVEL_2", recipientUserId: "nao-uuid" }) })]).length === 0, "uuid inválido");
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow({ project_id: "outro" })]).length === 0, "outro projeto");
  const unset = auditRow({ id: "aud-unset", occurred_at: "2026-11-19T10:00:00.000Z", action: mod.LEVEL_OVERRIDE_UNSET_ACTION });
  assert(mod.resolvePilotLevelOverrides(WEG, [auditRow(), unset]).length === 0, "UNSET mais recente encerra");
  assert(mod.resolvePilotLevelOverrides(WEG, [unset, auditRow({ id: "aud-set-2", occurred_at: "2026-11-20T10:00:00.000Z" })]).length === 1, "SET mais recente reativa");
});

await check("2. Política: substituto só vale na allowlist; Matriz/regra/status intactos (LEVEL_2_MISSING listado e não bloqueante)", () => {
  const p = policyFor()("PLANEJAMENTO", "CRITICAL");
  assert(p.level2UserId === U.rey && p.level2Override?.recipientUserId === U.rey && p.level2Override.definitiveUserId === null, JSON.stringify(p.level2Override));
  assert(p.status === "OK" && p.missing.includes("LEVEL_2_MISSING"), `${p.status} ${p.missing}`);
  assert(p.assumeDeadlineValue === 1 && p.escalation2AfterValue === 1 && p.boardAfterValue === 2, "prazos da regra inalterados");
  const outside = policyFor({ allow: [U.jaime, U.carlos] })("PLANEJAMENTO", "CRITICAL");
  assert(outside.level2UserId === null && !outside.level2Override, "fora da allowlist => exceção ignorada");
  const otherArea = policyFor({ responsibles: [resp(), { ...resp(), id: "resp-ADM", area: "ADMINISTRATIVO", escalation1InvitationId: null, escalation1UserId: U.carlos }] })("ADMINISTRATIVO", "CRITICAL");
  assert(otherArea.level2UserId === U.carlos && !otherArea.level2Override, "outras áreas intactas");
});

await check("3. Exceção ativa: assumir vencido (T+61) => Nível 2 para Reynaldo, rotulado como substituição temporária, chave por nível", () => {
  const p = planRiskAlerts(basePlan());
  const esc = escalations(p);
  assert(esc.length === 1, `uma mensagem: ${esc.map((e) => e.idempotencyKey)}`);
  const e = esc[0];
  assert(e.escalationLevel === "ESCALAO_1" && e.recipient.userId === U.rey && e.recipient.status === "PENDING", JSON.stringify(e.recipient));
  assert(e.idempotencyKey === `${CASE_KEY}:ESCALATION:ESCALAO_1:${U.rey}`, e.idempotencyKey);
  assert(e.content.levelLabel === mod.LEVEL_2_OVERRIDE_LABEL && /substituto temporário do Gestor/.test(e.content.levelNote ?? ""), `${e.content.levelLabel} | ${e.content.levelNote}`);
  assert(p.escalations.length === 1 && p.escalations[0].newLevel === "ESCALAO_1", "cadeia: RESPONSAVEL → Nível 2");
});

await check("4. Sem exceção (ou UNSET): Nível 2 é só convite => cadeia pula para a Diretoria (comportamento atual)", () => {
  const p = planRiskAlerts(basePlan({ policyFor: policyFor({ overrides: [] }) }));
  const esc = escalations(p);
  assert(esc.length === 1 && esc[0].escalationLevel === "DIRETORIA" && esc[0].recipient.userId === U.rey, JSON.stringify(esc.map((e) => [e.escalationLevel, e.recipient.userId])));
  assert(esc[0].content.levelLabel === "Nível 3 · Diretoria" && !esc[0].content.levelNote, esc[0].content.levelLabel);
});

await check("5. Convite do titular ativado depois (vira usuário): roteamento NÃO troca sozinho enquanto a exceção estiver SET", () => {
  const activated = [resp({ escalation1InvitationId: null, escalation1UserId: U.gestor })];
  const p = planRiskAlerts(basePlan({ policyFor: policyFor({ responsibles: activated }) }));
  const esc = escalations(p);
  assert(esc.length === 1 && esc[0].recipient.userId === U.rey && esc[0].escalationLevel === "ESCALAO_1", JSON.stringify(esc.map((e) => e.recipient.userId)));
  const pol = policyFor({ responsibles: activated })("PLANEJAMENTO", "CRITICAL");
  assert(pol.level2Override?.definitiveUserId === U.gestor, "titular definitivo continua visível");
  // Só um UNSET explícito devolve ao titular.
  const back = planRiskAlerts(basePlan({ policyFor: policyFor({ responsibles: activated, overrides: [] }), config: config([...ALLOW, U.gestor]) }));
  assert(escalations(back)[0].recipient.userId === U.gestor, "após UNSET => titular");
});

await check("6. Sem duplicação: Nível 2 e Diretoria ao mesmo endereço geram UMA mensagem por etapa, com rótulos distintos; replanejar não repete", () => {
  const first = planRiskAlerts(basePlan());
  const keys = new Set([...basePlan().existingIdempotencyKeys, ...first.outbox.map((e) => e.idempotencyKey)]);
  // Mesmo instante: nada novo.
  assert(planRiskAlerts(basePlan({ existingIdempotencyKeys: keys })).outbox.length === 0, "mesma etapa não repete");
  // Nível 2 já em curso e o prazo dele vencido (T+61 + 1 h): Diretoria, mesma pessoa, outra chave e outro rótulo.
  const atLevel2 = linked({ status: "ESCALATED", currentEscalationLevel: "ESCALAO_1", escalatedAt: NOW_T61 });
  const p2 = planRiskAlerts(basePlan({ now: "2026-11-18T14:02:00.000Z", existingIdempotencyKeys: keys, linkedActions: new Map([["act-x", atLevel2]]) }));
  const esc = escalations(p2);
  assert(esc.length === 1, `exatamente uma (Diretoria): ${esc.map((e) => e.idempotencyKey)}`);
  {
    assert(esc[0].escalationLevel === "DIRETORIA" && esc[0].recipient.userId === U.rey && esc[0].idempotencyKey === `${CASE_KEY}:ESCALATION:DIRETORIA:${U.rey}`, esc[0].idempotencyKey);
    assert(esc[0].content.levelLabel === "Nível 3 · Diretoria" && esc[0].content.previousLevelLabel === mod.LEVEL_2_OVERRIDE_LABEL, `${esc[0].content.levelLabel} / ${esc[0].content.previousLevelLabel}`);
  }
  const all = [...first.outbox, ...p2.outbox].filter((e) => e.notificationType === "ESCALATION");
  assert(new Set(all.map((e) => e.idempotencyKey)).size === all.length, "chaves únicas por (caso, etapa, nível, destinatário)");
});

await check("7. E-mail do Nível 2 substituto: assunto/selo com o rótulo do nível e observação do titular; Diretoria sem observação", () => {
  const p = planRiskAlerts(basePlan());
  const content = escalations(p)[0].content;
  const built = buildImmediateRiskAlertEmail({ content, projectId: WEG, projectName: "P", recipientName: "R", baseUrl: "https://acc-simulacao.invalid", timeZone: "America/Sao_Paulo", generatedAt: NOW_T61, actionButtons: [], actionLinks: {}, visibleCode: "ABC12345" });
  assert(built.subject.includes(mod.LEVEL_2_OVERRIDE_LABEL.toUpperCase()), built.subject);
  assert(built.html.includes("Observação do nível") && built.text.includes("substituto temporário do Gestor"), "observação no HTML e no texto");
  const dir = planRiskAlerts(basePlan({ policyFor: policyFor({ overrides: [] }) }));
  const builtDir = buildImmediateRiskAlertEmail({ content: escalations(dir)[0].content, projectId: WEG, projectName: "P", recipientName: "R", baseUrl: "https://acc-simulacao.invalid", timeZone: "America/Sao_Paulo", generatedAt: NOW_T61, actionButtons: [], actionLinks: {}, visibleCode: "ABC12345" });
  assert(!builtDir.html.includes("Observação do nível"), "sem observação fora da exceção");
});

console.log(`\n${passed} OK, ${failed} falha(s).`);
process.exit(failed > 0 ? 1 : 0);
