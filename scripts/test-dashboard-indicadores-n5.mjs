// Frente N5 — indicadores do Dashboard executivo da obra.
// Testa os módulos PUROS (lib/dashboard/*, compute-sla-summary) e o leitor
// somente-leitura com um cliente Supabase falso. Sem rede, sem IA, sem banco real.
//   node --import ./scripts/lib/block-live-ai.mjs scripts/test-dashboard-indicadores-n5.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
register(
  "data:text/javascript," +
    encodeURIComponent(
      'export async function resolve(s,c,n){ if(s==="server-only") return {url:"data:text/javascript,export{}",shortCircuit:true}; return n(s,c); }'
    )
);

const RC = await import("../apps/web/lib/dashboard/risk-alert-cases-summary");
const SB = await import("../apps/web/lib/dashboard/sla-escalation-breakdown");
const EC = await import("../apps/web/lib/dashboard/elapsed-and-climate");
const WP = await import("../apps/web/lib/dashboard/weekly-planning-stages");
const EP = await import("../apps/web/lib/dashboard/email-pipeline-stages");
const { computeSlaActionsSummary } = await import("../apps/web/lib/dashboard-visual/compute-sla-summary");
const { getDashboardOperationalFacts } = await import("../apps/web/lib/dashboard/get-dashboard-operational-facts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.stack ?? error.message}`);
  }
}

// ---------------------------------------------------------------- casos de risco
const rc = (over = {}) => ({ id: `c${Math.random()}`, status: "OPEN", state: "OPEN", risk_level: "HIGH", title: "Caso", reference: null, sla_action_id: "a1", ...over });

await check("casos de risco: cenário de produção (21 OPEN + 22 CLOSED, todos state OPEN) => 21 abertos", () => {
  const rows = [
    ...Array.from({ length: 21 }, (_, i) => rc({ risk_level: i < 13 ? "HIGH" : "MEDIUM", sla_action_id: i < 13 ? `a${i}` : null })),
    ...Array.from({ length: 22 }, () => rc({ status: "CLOSED" })),
  ];
  const s = RC.summarizeRiskAlertCases(rows);
  assert.equal(s.open, 21);
  assert.equal(s.closed, 22);
  assert.equal(s.openWithSlaAction, 13);
  assert.equal(s.openBySeverity.ALTA, 13);
  assert.equal(s.openBySeverity.MEDIA, 8);
  assert.equal(s.openHighCriticalWithoutSlaAction, 0);
  assert.equal(s.totalRows, 43);
});

await check("casos de risco: state RESOLVED não conta como aberto; teste do piloto fica fora; REVIEW_REQUIRED não vira severidade", () => {
  const s = RC.summarizeRiskAlertCases([
    rc({ state: "RESOLVED" }),
    rc({ title: "[TESTE PILOTO] x" }),
    rc({ reference: "TESTE-PILOTO-1", status: "CLOSED" }),
    rc({ risk_level: "REVIEW_REQUIRED", sla_action_id: null }),
    rc({ risk_level: "CRITICAL", sla_action_id: null }),
  ]);
  assert.equal(s.open, 2);
  assert.equal(s.closed, 1);
  assert.equal(s.testOpen, 1);
  assert.equal(s.reviewRequired, 1);
  assert.equal(s.openBySeverity.CRITICA, 1);
  assert.equal(s.openHighCriticalWithoutSlaAction, 1, "CRÍTICO sem ação SLA é sinalizado");
});

await check("casos de risco: lista vazia => zeros verdadeiros (leitura ok, nada aberto)", () => {
  const s = RC.summarizeRiskAlertCases([]);
  assert.equal(s.open, 0);
  assert.equal(s.totalRows, 0);
});

await check("risco atual: considera casos abertos (antes 'SEM RISCO' com 21 casos) e não inventa com leitura indisponível", () => {
  const s = RC.summarizeRiskAlertCases([rc({ risk_level: "HIGH" })]);
  assert.equal(RC.resolveDashboardRiskLevel("SEM_RISCO_ATIVO", s), "ALTA");
  assert.equal(RC.resolveDashboardRiskLevel("CRITICA", s), "CRITICA");
  assert.equal(RC.resolveDashboardRiskLevel("SEM_RISCO_ATIVO", null), "SEM_RISCO_ATIVO");
  assert.equal(RC.resolveDashboardRiskLevel("MEDIA", null), "MEDIA");
  const onlyReview = RC.summarizeRiskAlertCases([rc({ risk_level: "REVIEW_REQUIRED" })]);
  assert.equal(RC.resolveDashboardRiskLevel("SEM_RISCO_ATIVO", onlyReview), "EM_REVISAO");
  assert.equal(RC.resolveDashboardRiskLevel("SEM_RISCO_ATIVO", RC.summarizeRiskAlertCases([])), "SEM_RISCO_ATIVO");
});

// ---------------------------------------------------------------- SLA
const NOW = new Date("2026-11-20T15:00:00Z");
const act = (over = {}) => ({
  id: `x${Math.random()}`, status: "PENDING", currentEscalationLevel: "RESPONSAVEL", origin: "OTHER",
  assumeDueAt: "2026-11-01T12:00:00Z", respondDueAt: null, completeDueAt: null, acknowledgedAt: null, completedAt: null, ...over,
});

await check("SLA: cenário de produção (16 ESCALATED + 9 PENDING, todas vencidas) => 25 abertas, 25 vencidas, 16 escalonadas", () => {
  const actions = [
    ...Array.from({ length: 15 }, () => act({ status: "ESCALATED", currentEscalationLevel: "DIRETORIA" })),
    act({ status: "ESCALATED", currentEscalationLevel: "ESCALAO_1" }),
    ...Array.from({ length: 9 }, () => act()),
  ];
  const s = computeSlaActionsSummary(actions, NOW);
  assert.deepEqual(s, { pending: 25, overdue: 25, dueToday: 0, escalated: 16 });
});

await check("SLA: ação CONCLUÍDA/CANCELADA que já subiu de nível NÃO conta como escalonada (corrigido)", () => {
  const s = computeSlaActionsSummary(
    [act({ status: "COMPLETED", currentEscalationLevel: "DIRETORIA", completedAt: "2026-11-02T00:00:00Z" }), act({ status: "CANCELLED", currentEscalationLevel: "ESCALAO_1" })],
    NOW
  );
  assert.deepEqual(s, { pending: 0, overdue: 0, dueToday: 0, escalated: 0 });
});

await check("escalonamentos: 16 ações escalonadas × 18 registros explicados (2 ações subiram dois níveis)", () => {
  const a = Array.from({ length: 15 }, (_, i) => act({ id: `d${i}`, status: "ESCALATED", currentEscalationLevel: "DIRETORIA", origin: i < 9 ? "EVENT" : "OTHER" }));
  const e1 = act({ id: "e1", status: "ESCALATED", currentEscalationLevel: "ESCALAO_1", origin: "MANUAL" });
  const p = Array.from({ length: 9 }, (_, i) => act({ id: `p${i}` }));
  const escalations = [
    ...a.map((x) => ({ actionId: x.id, toLevel: "DIRETORIA", notifiedUserId: "u" })),
    { actionId: "e1", toLevel: "ESCALAO_1", notifiedUserId: "u" },
    { actionId: "d0", toLevel: "ESCALAO_1", notifiedUserId: "u" },
    { actionId: "d1", toLevel: "ESCALAO_1", notifiedUserId: null },
  ];
  const b = SB.computeSlaEscalationBreakdown({ actions: [...a, e1, ...p], escalations, riskCaseActionIds: new Set(["d0", "d1", "p0"]) });
  assert.equal(b.openActions, 25);
  assert.equal(b.openEscalated, 16);
  assert.equal(b.escalationRecords, 18);
  assert.deepEqual(b.recordsByToLevel, { RESPONSAVEL: 0, ESCALAO_1: 3, ESCALAO_2: 0, DIRETORIA: 15 });
  assert.deepEqual(b.openByLevel, { RESPONSAVEL: 9, ESCALAO_1: 1, ESCALAO_2: 0, DIRETORIA: 15 });
  assert.equal(b.openEscalatedWithMultipleRecords, 2);
  assert.equal(b.openEscalatedWithoutRecord, 0);
  assert.equal(b.recordsWithoutRecipient, 1);
  assert.equal(b.openLinkedToRiskCase, 3);
  assert.equal(b.openByStatus.ESCALATED, 16);
  assert.equal(b.openByStatus.PENDING, 9);
});

await check("escalonamentos: registro de ação encerrada fica no histórico, fora das abertas; escalonada sem registro é sinalizada", () => {
  const b = SB.computeSlaEscalationBreakdown({
    actions: [act({ id: "c", status: "COMPLETED", currentEscalationLevel: "DIRETORIA" }), act({ id: "o", status: "ESCALATED", currentEscalationLevel: "DIRETORIA" })],
    escalations: [{ actionId: "c", toLevel: "DIRETORIA", notifiedUserId: "u" }],
    riskCaseActionIds: null,
  });
  assert.equal(b.recordsOnClosedOrUnknownActions, 1);
  assert.equal(b.recordsOnOpenActions, 0);
  assert.equal(b.openEscalatedWithoutRecord, 1);
  assert.equal(b.openLinkedToRiskCase, 0, "sem leitura de casos não afirma vínculo");
});

// ---------------------------------------------------------------- dias decorridos / clima
await check("dias decorridos: do início da obra até hoje, inclusivo; fallback para início contratual", () => {
  const r = EC.computeElapsedDays({ projectStartDate: "2026-11-01", contractStartDate: "2026-10-01", today: "2026-11-20" });
  assert.equal(r.available, true);
  assert.equal(r.value.days, 20);
  assert.equal(r.value.startSource, "PROJECT_START_DATE");
  const c = EC.computeElapsedDays({ projectStartDate: null, contractStartDate: "2026-11-20", today: "2026-11-20" });
  assert.equal(c.value.days, 1);
  assert.equal(c.value.startSource, "CONTRACT_START_DATE");
});

await check("dias decorridos: sem data de início ou início futuro => indisponível com motivo (nunca 0)", () => {
  const none = EC.computeElapsedDays({ projectStartDate: null, contractStartDate: null, today: "2026-11-20" });
  assert.equal(none.available, false);
  assert.match(none.reason, /não cadastrada/);
  const future = EC.computeElapsedDays({ projectStartDate: "2026-12-01", contractStartDate: null, today: "2026-11-20" });
  assert.equal(future.available, false);
  assert.match(future.reason, /não iniciada/);
  assert.equal(EC.computeElapsedDays({ projectStartDate: "lixo", contractStartDate: null, today: "2026-11-20" }).available, false);
});

await check("clima: sem RDO => indisponível (antes mostrava 0,0); com RDO calcula 0,5 por turno impraticável", () => {
  const none = EC.computeClimateImpact({ rows: [], windowStart: "2026-11-01" });
  assert.equal(none.available, false);
  assert.match(none.reason, /RDO/);
  assert.equal(EC.computeClimateImpact({ rows: [{ reference_date: "2026-11-02", weather: {} }], windowStart: null }).available, false);
  const r = EC.computeClimateImpact({
    windowStart: "2026-11-01",
    rows: [
      { reference_date: "2026-11-02", weather: { manha: { condicao: "Impraticável" }, tarde: { condicao: "Bom" } } },
      { reference_date: "2026-11-03", weather: { manha: { condicao: "impraticavel" }, tarde: { condicao: "IMPRATICÁVEL" } } },
      { reference_date: "2026-11-10", weather: { manha: { condicao: "Impraticável", ativo: false } } },
      { reference_date: "2026-10-30", weather: { manha: { condicao: "Impraticável" } } },
    ],
  });
  assert.equal(r.available, true);
  assert.equal(r.value.nonWorkedDays, 1.5);
  assert.equal(r.value.windowDays, 10);
  assert.equal(r.value.rdoCount, 3, "RDO anterior à janela fica fora");
  assert.equal(r.value.percent, 15);
});

// ---------------------------------------------------------------- planejamento semanal
await check("planejamento: aba existente com MISSING_SHEET/FAILED não fica verde (antes ficava)", () => {
  assert.equal(WP.sheetStage("EXTRACTED").tone, "ok");
  assert.equal(WP.sheetStage("MISSING_SHEET").tone, "error");
  assert.equal(WP.sheetStage("FAILED").tone, "error");
  assert.equal(WP.sheetStage("PENDING_HUMAN_REVIEW").tone, "warning");
  assert.equal(WP.sheetStage(null).tone, "neutral");
});

await check("planejamento: MPP recebido PENDING => amarelo 'Recebido, não processado' (antes ponto verde)", () => {
  const s = WP.mppFileStage({ attachmentReceived: true, processingStatus: "PENDING" });
  assert.equal(s.tone, "warning");
  assert.match(s.text, /não processado/);
  assert.equal(WP.mppFileStage({ attachmentReceived: false, processingStatus: null }).text, "Não recebido");
  assert.equal(WP.mppFileStage({ attachmentReceived: true, processingStatus: "PROCESSED" }).tone, "ok");
});

await check("planejamento: relatório recebido × processado; baseline; cronograma semanal", () => {
  assert.equal(WP.weeklyReportStage({ attachmentReceived: true, workbookStatus: null }).text, "Recebido, não processado");
  assert.equal(WP.weeklyReportStage({ attachmentReceived: true, workbookStatus: "EXTRACTED" }).tone, "ok");
  assert.equal(WP.weeklyReportStage({ attachmentReceived: true, workbookStatus: "FAILED" }).tone, "error");
  assert.equal(WP.baselineStage({ configRead: true, baselineScheduleVersionId: null }).text, "Não configurada");
  assert.equal(WP.baselineStage({ configRead: false, baselineScheduleVersionId: null }).tone, "neutral");
  const pend = WP.scheduleUpdatedStage({ status: "PENDENTE", detail: "recebido só o Excel, sem MPP (sem. 09/11)", evaluated: true });
  assert.equal(pend.tone, "warning");
  assert.match(pend.text, /Excel/);
  assert.equal(WP.scheduleUpdatedStage({ status: "CONECTADO", detail: null, evaluated: true }).tone, "ok");
  assert.equal(WP.scheduleUpdatedStage({ status: "PENDENTE", detail: null, evaluated: false }).tone, "neutral");
});

// ---------------------------------------------------------------- e-mail por etapa
const facts = (over = {}) => ({
  serviceStatus: "CONECTADO", ingestionEnabled: true, lastSuccessfulSyncAt: "2026-11-19T10:00:00Z", enabledMailboxes: 2,
  individualCollectionsEnabled: 1, individualCollectionsTotal: 2, persistedEmails: 120, latestEmailAt: "2026-11-19T10:00:00Z",
  outbox: { sent: 7, suppressed: 28, pending: 1, failed: 0, skipped: 0 }, emailReplyOrigins: 2, ...over,
});

await check("e-mail: serviço conectado mas respostas não comprovadas => PARCIAL, nunca verde global", () => {
  const p = EP.resolveEmailPipelineStages(facts({ emailReplyOrigins: 0 }));
  assert.equal(p.allProven, false);
  assert.equal(EP.resolveEmailDisplayStatus("CONECTADO", p), "PARCIAL");
  const sending = p.stages.find((s) => s.key === "SENDING");
  assert.equal(sending.state, "OK");
  assert.match(sending.detail, /7 enviado\(s\), 28 suprimido\(s\), 1 pendente\(s\)/);
});

await check("e-mail: etapa não verificável (perfil sem acesso à coleta individual) também impede o verde", () => {
  const p = EP.resolveEmailPipelineStages(facts({ individualCollectionsEnabled: null, individualCollectionsTotal: null }));
  assert.equal(p.stages.find((s) => s.key === "INDIVIDUAL").state, "NAO_VERIFICAVEL");
  assert.equal(EP.resolveEmailDisplayStatus("CONECTADO", p), "PARCIAL");
});

await check("e-mail: todas as etapas comprovadas => CONECTADO; serviço ERRO/ATENCAO/PENDENTE prevalecem", () => {
  const p = EP.resolveEmailPipelineStages(facts());
  assert.equal(p.allProven, true);
  assert.equal(EP.resolveEmailDisplayStatus("CONECTADO", p), "CONECTADO");
  assert.equal(EP.resolveEmailDisplayStatus("ERRO", p), "ERRO");
  assert.equal(EP.resolveEmailDisplayStatus("ATENCAO", p), "ATENCAO");
  assert.equal(EP.resolveEmailDisplayStatus("PENDENTE", p), "PENDENTE");
});

await check("e-mail: leituras indisponíveis => NAO_VERIFICAVEL (nunca 0); falha de envio => ATENCAO; sem envio => PENDENTE", () => {
  const p = EP.resolveEmailPipelineStages(facts({ persistedEmails: null, outbox: null, emailReplyOrigins: null, enabledMailboxes: null }));
  for (const key of ["CONTENT", "SENDING", "REPLIES", "SHARED_SOURCES"]) assert.equal(p.stages.find((s) => s.key === key).state, "NAO_VERIFICAVEL", key);
  assert.equal(EP.resolveEmailPipelineStages(facts({ outbox: { sent: 3, suppressed: 0, pending: 0, failed: 1, skipped: 0 } })).stages.find((s) => s.key === "SENDING").state, "ATENCAO");
  const none = EP.resolveEmailPipelineStages(facts({ outbox: { sent: 0, suppressed: 0, pending: 0, failed: 0, skipped: 0 } })).stages.find((s) => s.key === "SENDING");
  assert.equal(none.state, "PENDENTE");
  assert.equal(none.detail, "nenhum envio registrado");
  const ing = EP.resolveEmailPipelineStages(facts({ lastSuccessfulSyncAt: null })).stages.find((s) => s.key === "INGESTION");
  assert.equal(ing.state, "ATENCAO");
});

// ---------------------------------------------------------------- leitor somente-leitura
function fakeClient({ fail = new Set() } = {}) {
  const calls = [];
  const data = {
    risk_alert_cases: [{ id: "c1", status: "OPEN", state: "OPEN", risk_level: "HIGH", title: "t", reference: null, sla_action_id: "a1" }],
    sla_action_escalations: [{ action_id: "a1", to_level: "DIRETORIA", notified_user_id: "u" }],
    risk_sla_consistency_issues: [{ issue_code: "LEVEL_DIVERGENT" }, { issue_code: "LEVEL_DIVERGENT" }],
    risk_alert_outbox: [
      { status: "SENT", origin: "AUTOMATIC" },
      { status: "SUPPRESSED", origin: "AUTOMATIC" },
      { status: "SENT", origin: "EMAIL_REPLY" },
    ],
    emails: [{ sent_at: "2026-11-19T10:00:00Z" }],
    email_mailbox_collection_controls: [{ collection_enabled: true, revoked_at: null }, { collection_enabled: false, revoked_at: null }],
    project_schedule_baselines: [],
  };
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const result = () => {
        if (fail.has(table)) return { data: null, error: { message: "boom" }, count: null };
        const rows = data[table];
        if (q.head) return { data: null, error: null, count: Array.isArray(rows) ? rows.length : 0 };
        if (q.single) return { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null };
        return { data: rows, error: null };
      };
      const builder = {
        select(_cols, opts) { q.ops.push("select"); if (opts?.head) q.head = true; return builder; },
        eq(col, val) { q.ops.push(`eq:${col}=${val}`); return builder; },
        is(col, val) { q.ops.push(`is:${col}=${val}`); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { q.single = true; return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      for (const forbidden of ["insert", "update", "upsert", "delete", "rpc"]) builder[forbidden] = () => { throw new Error(`escrita proibida: ${forbidden}`); };
      return builder;
    },
    rpc() { throw new Error("rpc proibida"); },
  };
}

await check("leitor: só select, sempre filtrado por project_id; conta outbox e respostas por e-mail", async () => {
  const client = fakeClient();
  const f = await getDashboardOperationalFacts(client, "P1", { isAdmin: true });
  for (const call of client.calls) assert.ok(call.ops.includes("eq:project_id=P1"), `${call.table} sem filtro de projeto`);
  assert.equal(f.riskCases.length, 1);
  assert.deepEqual(f.consistencyIssues, { LEVEL_DIVERGENT: 2 });
  assert.deepEqual(f.outbox, { sent: 2, suppressed: 1, pending: 0, failed: 0, skipped: 0 });
  assert.equal(f.emailReplyOrigins, 1);
  assert.equal(f.persistedEmails, 1);
  assert.deepEqual(f.individualCollections, { enabled: 1, total: 2 });
  assert.deepEqual(f.weeklyConfig, { read: true, baselineScheduleVersionId: null });
});

await check("leitor: falha isolada => null (indisponível), nunca zero; não-admin não lê coleta individual", async () => {
  const client = fakeClient({ fail: new Set(["risk_alert_cases", "risk_alert_outbox", "risk_sla_consistency_issues", "emails", "project_schedule_baselines"]) });
  const f = await getDashboardOperationalFacts(client, "P1", { isAdmin: false });
  assert.equal(f.riskCases, null);
  assert.equal(f.outbox, null);
  assert.equal(f.emailReplyOrigins, null);
  assert.equal(f.consistencyIssues, null);
  assert.equal(f.persistedEmails, null);
  assert.equal(f.individualCollections, null);
  assert.equal(f.weeklyConfig.read, false);
  assert.ok(!client.calls.some((c) => c.table === "email_mailbox_collection_controls"), "não-admin não consulta a tabela restrita");
  assert.equal(f.escalations.length, 1, "falha de uma leitura não derruba as outras");
});

// ---------------------------------------------------------------- ligação com a página
await check("página: alertas de risco separados dos achados de IA; sem zero para clima ausente; farol de e-mail por etapa", () => {
  const page = src("apps/web/app/[projectId]/dashboard/page.tsx");
  assert.ok(page.includes("summarizeRiskAlertCases") && page.includes('label="Alertas de risco abertos"') && page.includes('label="Achados de IA ativos"'));
  assert.ok(page.includes("resolveDashboardRiskLevel(data.generalSituation, riskCases)"));
  assert.ok(page.includes('label="Ações abertas (SLA)"') && !page.includes('label="Ações pendentes"'));
  assert.ok(page.includes('label="Registros de escalonamento"'));
  assert.ok(!/equivalentNonWorkedDays\.toLocaleString/.test(page), "dias não trabalhados não pode mais mostrar 0,0 sem RDO");
  assert.ok(page.includes("computeElapsedDays(") && page.includes("computeClimateImpact("));
  assert.ok(page.includes("email-pipeline-stages") && page.includes("resolveEmailDisplayStatus("));
  assert.ok(page.includes("resolveSystemStatus(data.integrationStatusGroups)"));
  assert.ok(!/status=\{sheetByCategory\.get\("[A-Z_]+"\) \? "ok"/.test(page), "aba não pode ficar verde só por existir");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
