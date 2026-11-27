// Auditoria (27/11/2026): catálogo explícito, contagem/paginação no servidor além de 1.000 linhas,
// horário de Brasília, situação das falhas e tela. Puro: sem rede, sem banco, sem e-mail.
// Uso: node scripts/test-auditoria-filtros.mjs
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./ts-module-resolver.mjs", import.meta.url);

const c = await import("../apps/web/lib/audit/audit-catalog");
const q = await import("../apps/web/lib/audit/audit-query-core");

let passed = 0;
let failed = 0;
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
const assert = (cond, msg = "asserção falhou") => {
  if (!cond) throw new Error(msg);
};
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg ?? ""} esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);

// Códigos distintos existentes em produção em 27/11/2026 (SELECT distinct action FROM audit_log_entries), com a entidade típica.
const PRODUCTION_CODES = [
  ["ACTION_ACKNOWLEDGED", "SLA_ACTION"], ["ACTION_COMPLETED", "SLA_ACTION"], ["ACTION_CREATED", "SLA_ACTION"], ["ACTION_ESCALATED", "SLA_ACTION"],
  ["ACTION_REASSIGNED", "SLA_ACTION"], ["Administrador adicionado ao projeto", "ProjectMembership"], ["AI_FINDING_CREATED", "AI_FINDING"],
  ["AI_FINDING_STATUS_CHANGED", "AI_FINDING"], ["AI_MULTI_EXPERT_CURATION_CREATED", "CONTRACT_EVENT"], ["ALERT_GOVERNOR_DEFERRED", "ALERT_SEND_SUPPRESSED"],
  ["ALERT_GOVERNOR_SUPPRESSED", "ALERT_SEND_SUPPRESSED"], ["AUDIT_NOTE_TECHNICAL_EXECUTOR", "PROJECT"], ["Backfill Gmail com janela explícita", "EmailIngestionRun"],
  ["Backfill Gmail dry-run com janela explícita", "EmailIngestionRun"], ["Backfill Gmail executado", "EmailIngestionRun"],
  ["CLAUSE_CREATED_FROM_EXTRACTION_CANDIDATE", "CLAUSE"], ["CLAUSE_DETECTION_COMPLETED", "DOCUMENT"], ["Configuração da integração de e-mail criada", "Integration"],
  ["CONSTRUMANAGER_DOCUMENT_PROMOTED", "DOCUMENT_VERSION"], ["CONSTRUMANAGER_NOVA_VERSAO_VIGENTE", "CONSTRUMANAGER_DOCUMENT"],
  ["CONSTRUMANAGER_VERSION_IMPACT_REVIEWED", "construmanager_version_impact_reviews"], ["CONTRACT_ALERT_BATCH_ITEM_RESPONDED", "CONTRACT_EVENT"],
  ["CONTRACT_ALERT_BATCH_RESPONDED", "CONTRACT_ALERT_BATCH"], ["CONTRACT_ALERT_BATCH_SENT", "CONTRACT_ALERT_BATCH"], ["CONTRACT_ALERT_EMAIL_SENT", "CONTRACT_EVENT"],
  ["CONTRACT_EVENT_CREATED", "CONTRACT_EVENT"], ["CONTRACT_EVENT_CREATED_FROM_EMAIL_THREAD", "EMAIL_THREAD_EVENT_CANDIDATE"],
  ["CONTRACT_REVIEW_CANDIDATE_REJECTED", "EMAIL_THREAD_EVENT_CANDIDATE"], ["CONTRACT_REVIEW_CANDIDATE_REOPENED_FOR_TEST_RESET", "EMAIL_THREAD_EVENT_CANDIDATE"],
  ["CONTRACTUAL_TIMELINE_EXPORTED", "TIMELINE_EXPORT"], ["DOCUMENT_CONTRACTUAL_ATTACHMENT_LINKED", "DOCUMENT"], ["DOCUMENT_CONTRACTUAL_ATTACHMENT_UNLINKED", "DOCUMENT"],
  ["DOCUMENT_DELETED", "DOCUMENT"], ["DOCUMENT_FILE_RELINKED", "DOCUMENT"], ["DOCUMENT_PROCESSING_COMPLETED", "DOCUMENT_VERSION"], ["DOCUMENT_PROCESSING_FAILED", "DOCUMENT_VERSION"],
  ["DOCUMENT_REPROCESSED", "DOCUMENT_VERSION"], ["DOCUMENT_RESET_BULK_DELETE", "PROJECT"], ["DOCUMENT_RESTORED", "DOCUMENT"], ["DOCUMENT_TRASHED", "DOCUMENT"],
  ["DOCUMENT_VERSION_CLIENT_RESPONSE_LINKED", "DOCUMENT_VERSION"], ["DOCUMENT_VERSION_FILE_ADDED", "DOCUMENT_VERSION_FILE"], ["DRIVE_FILE_SYNC_FAILED", "EMAIL_ATTACHMENT"],
  ["DRIVE_FILE_SYNCED", "EMAIL_ATTACHMENT"], ["EMAIL_ACCOUNT_CONNECTED", "EMAIL_ACCOUNT"], ["EMAIL_ACCOUNT_DISCONNECTED", "EMAIL_ACCOUNT"],
  ["EMAIL_ATTACHMENT_INGESTED", "EMAIL_ATTACHMENT"], ["EMAIL_ATTACHMENT_PROCESSED", "EMAIL_ATTACHMENT"], ["EMAIL_BACKFILL_ALREADY_QUEUED", "PROJECT_EMAIL_INGESTION_SYNC_RUN"],
  ["EMAIL_BACKFILL_SKIPPED_NO_CONFIG", "PROJECT"], ["EMAIL_SYNC_STARTED", "PROJECT_EMAIL_INGESTION_SYNC_RUN"], ["ESG_OBLIGATION_CREATED", "ESG_OBLIGATION"],
  ["ESG_OBLIGATION_EVIDENCE_SUBMITTED", "ESG_OBLIGATION_EVIDENCE"], ["ESG_OBLIGATION_REVIEWED", "ESG_OBLIGATION_SUBMISSION"], ["ESG_OBLIGATION_STATUS_UPDATED", "ESG_OBLIGATION_SUBMISSION"],
  ["EVENT_CLAUSE_CONFRONTATION_APPROVED", "EVENT_CROSS_REFERENCE"], ["EVENT_CLAUSE_CONFRONTATION_CANDIDATE_CREATED", "EVENT_CLAUSE_CONFRONTATION_CANDIDATE"],
  ["EVENT_CLAUSE_CONFRONTATION_REJECTED", "EVENT_CLAUSE_CONFRONTATION_CANDIDATE"], ["EVENT_NOTE_CREATED", "EVENT_NOTE"],
  ["FINANCIAL_INDICATOR_INFORMATIVE_ANALYSIS", "RISK_ALERT_CASE"], ["FINANCIAL_INDICATOR_REVIEW_PENDING", "RISK_ALERT_CASE"], ["GMAIL_MESSAGE_UNAVAILABLE", "EMAIL"],
  ["HISTORICAL_FINDING_ACTION_CREATED", "AI_FINDING"], ["HISTORICAL_FINDING_DISMISSED", "AI_FINDING"], ["HISTORICAL_FINDING_RESOLVED", "AI_FINDING"],
  ["INTEGRATION_ORIGIN_UPDATED", "PROJECT_INTEGRATION"], ["MEMBER_ADDED", "project_memberships"], ["MEMBER_INVITATION_ACTIVATED", "project_memberships"],
  ["MEMBER_INVITATION_AREA_CHANGED", "project_member_invitations"], ["MEMBER_INVITATION_CANCELLED", "project_member_invitations"], ["MEMBER_JOB_TITLE_SET", "profiles"],
  ["MEMBER_PRE_REGISTERED", "project_member_invitations"], ["MEMBER_REMOVED", "project_memberships"], ["MEMBER_ROLE_CHANGED", "project_memberships"],
  ["MODULE_LOCK_APPLIED", "DatabaseFunction"], ["Monitoramento Gmail ativado", "EmailIngestionConfig"], ["Perímetro de ingestão de e-mail configurado", "EmailIngestionConfig"],
  ["PILOT_SEND_DELIVERY_DISCREPANCY", "RISK_ALERT_CASE"], ["PILOT_SINGLE_SEND_CONFIRMED_MANUALLY", "RISK_ALERT_CASE"],
  ["PROJECT_ADDITIONAL_DOCUMENT_LINKED", "PROJECT_ADDITIONAL_PROPOSAL_LINK"], ["PROJECT_ADDITIONAL_PROPOSAL_CONTRACTED", "PROJECT_ADDITIONAL_PROPOSAL"],
  ["PROJECT_ADDITIONAL_PROPOSAL_CREATED", "PROJECT_ADDITIONAL_PROPOSAL"], ["PROJECT_DOCUMENT_UPLOADED", "DOCUMENT_VERSION"], ["PROJECT_DOCUMENT_VERSION_UPLOADED", "DOCUMENT_VERSION"],
  ["PROJECT_STARTUP_COMPLETED", "PROJECT"], ["PROJECT_STARTUP_REVIEW_STARTED", "PROJECT"], ["PROJECT_TEAM_COPIED", "PROJECT"], ["PROJECT_TEAM_COPY_USED_AS_SOURCE", "PROJECT"],
  ["PROJECT_UPDATED", "PROJECT"], ["RISK_ALERT_ACTION", "RISK_ALERT_CASE"], ["RISK_ALERT_AREA_INFORMATIVE_SET", "PROJECT_RISK_ALERT_AREA"],
  ["RISK_ALERT_AUTOMATION_SUSPENDED_BY_SCOPE", "RISK_ALERT_CASE"], ["RISK_ALERT_CASE_COMMUNICATION_SUSPENDED", "RISK_ALERT_CASE"], ["RISK_ALERT_CASE_DUPLICATE_IDENTIFIED", "RISK_ALERT_CASE"],
  ["RISK_ALERT_DEADLINE_EXPIRED", "SLA_ACTION"], ["RISK_ALERT_EMAIL_FAILED", "RISK_ALERT_OUTBOX"], ["RISK_ALERT_EMAIL_SENT", "RISK_ALERT_CASE"],
  ["RISK_ALERT_NOT_READY_FOR_REAL_SEND", "PROJECT"], ["RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET", "PROJECT_RISK_ALERT_AREA_LEVEL"], ["RISK_ALERT_PILOT_SINGLE_RUN", "RISK_ALERT_CASE"],
  ["RISK_ALERT_PLANNED", "RISK_ALERT_CASE"], ["RISK_ALERT_READY_FOR_REAL_SEND", "PROJECT"], ["RISK_ALERT_RECIPIENT_SUPPRESSED", "RISK_ALERT_CASE"],
  ["RISK_ALERT_REISSUE_DECISION_REQUIRED", "RISK_ALERT_CASE"], ["RISK_ALERT_RESPONSIBLE_TRANSFERRED", "RISK_ALERT_CASE"], ["RISK_ALERT_TOP_LEVEL_REACHED", "RISK_ALERT_CASE"],
  ["RISK_ALERT_UNAUTHORIZED_REPLY", "RISK_ALERT_CASE"], ["RISK_ALERTS_ENABLED", "PROJECT_WEEKLY_SCHEDULE_INGESTION_CONFIG"], ["SCHEDULE_RISK_THRESHOLDS_CONFIGURED", "PROJECT"],
  ["SCHEDULE_VERSION_COMPARISON_COMPUTED", "SCHEDULE_VERSION_COMPARISON"], ["SincronizaÃ§Ã£o incremental Gmail executada", "EmailIngestionRun"],
  ["Sincronização incremental Gmail executada", "EmailIngestionRun"], ["SLA_ACTION_RESPONSIBLE_TRANSFERRED", "SLA_ACTION"], ["SLA_AREA_RESPONSIBLES_UPDATED", "SLA_AREA_RESPONSIBLES"],
  ["SLA_CONFIGURATION_UPDATED", "sla_matrix_rules"], ["SLA_INTERIM_RESPONSIBLE_ASSIGNED", "SLA_AREA_RESPONSIBLES"], ["SLA_INTERIM_RESPONSIBLE_REVOKED", "SLA_AREA_RESPONSIBLES"],
  ["SLA_MATRIX_RULE_DUPLICATE_DEACTIVATED", "SLA_MATRIX_RULE"], ["SLA_MATRIX_RULE_UPDATED", "SLA_MATRIX_RULE"], ["SSMA_DRIVE_FILE_SYNC_FAILED", "SSMA_SUBMISSION_PHOTO"],
  ["SSMA_DRIVE_FILE_SYNCED", "SSMA_SUBMISSION_PHOTO"], ["SSMA_ESCALATION_CHANNEL_ACTIVATED", "PROJECT"], ["SSMA_ESCALATION_DECISION_REQUIRED", "SSMA_CORRECTIVE_ACTION"],
  ["SSMA_ESCALATION_LEVEL_APPLIED", "SSMA_CORRECTIVE_ACTION"], ["SSMA_ESCALATION_TOP_LEVEL_REACHED", "SSMA_CORRECTIVE_ACTION"], ["SSMA_FIELD_NOTIFICATION_SENT", "SSMA_FIELD_RECORD"],
  ["SSMA_FORM_SUBMITTED", "SSMA_FORM_SUBMISSION"], ["SSMA_REPLY_CONFIRMATION_CLAIMED", "SSMA_CORRECTIVE_ACTION"], ["SSMA_REPLY_CONFIRMATION_PENDING", "SSMA_CORRECTIVE_ACTION"],
  ["SSMA_REPLY_CONFIRMATION_SENT", "SSMA_CORRECTIVE_ACTION"], ["SSMA_REPLY_NOTICE_SENT", "SSMA_CORRECTIVE_ACTION"], ["SSMA_REPLY_PROCESSED", "SSMA_CORRECTIVE_ACTION"],
  ["SSMA_REPLY_TOKEN_ISSUED", "SSMA_CORRECTIVE_ACTION"], ["TEAM_TRANSITION_PLANNING_REGISTERED", "PROJECT"], ["USER_COMPLIANCE_TERM_APPROVED", "user_policy_acknowledgements"],
  ["USER_COMPLIANCE_TERM_SENT", "user_policy_acknowledgements"], ["USER_COMPLIANCE_TERM_VIEWED", "user_policy_acknowledgements"],
  ["WEEKLY_ABSENCE_ALERT_DETECTED_LATE", "WEEKLY_SCHEDULE_INGESTION_ALERT"], ["WEEKLY_ABSENCE_ALERT_RESOLVED", "WEEKLY_SCHEDULE_INGESTION_ALERT"],
  ["WEEKLY_ABSENCE_CURRENT_WEEK_INTEGRATION_PENDING", "WEEKLY_SCHEDULE_INGESTION_CONFIG"], ["WEEKLY_ABSENCE_INTEGRATION_PENDING", "WEEKLY_SCHEDULE_INGESTION_CONFIG"],
  ["WEEKLY_ABSENCE_MARKED_UNPROVEN", "WEEKLY_SCHEDULE_INGESTION_ALERT"], ["WEEKLY_ABSENCE_RECLASSIFIED_INTEGRATION_PENDING", "WEEKLY_SCHEDULE_INGESTION_ALERT"],
  ["WEEKLY_ABSENCE_WEEKS_VERIFIED_CHECKPOINT", "WEEKLY_SCHEDULE_INGESTION_CONFIG"], ["WEEKLY_ALERT_DIGEST_SENT", "WEEKLY_ALERT_DIGEST"],
  ["WEEKLY_REPORT_WORKBOOK_DUPLICATE_IDENTIFIED", "WEEKLY_REPORT_WORKBOOK"], ["WEEKLY_REPORT_WORKBOOK_MISSING_ALERT_CREATED", "WEEKLY_SCHEDULE_INGESTION_ALERT"],
  ["WEEKLY_REPORT_WORKBOOK_PROCESSED", "WEEKLY_REPORT_WORKBOOK"], ["WEEKLY_S_CURVE_MISSING_ALERT_CREATED", "WEEKLY_SCHEDULE_INGESTION_ALERT"],
  ["WEEKLY_SCHEDULE_CONFIG_INSERT", "project_weekly_schedule_ingestion_configs"], ["WEEKLY_SCHEDULE_CONFIG_UPDATE", "project_weekly_schedule_ingestion_configs"],
  ["WEEKLY_SCHEDULE_EMAIL_PENDING_HUMAN_REVIEW", "WEEKLY_SCHEDULE_EMAIL_INTAKE"], ["WEEKLY_SCHEDULE_HISTORICAL_FROM_STORAGE", "WEEKLY_SCHEDULE_EMAIL_INTAKE"],
  ["WEEKLY_SCHEDULE_HISTORICAL_RECOVERY", "WEEKLY_SCHEDULE_EMAIL_INTAKE"], ["WEEKLY_SCHEDULE_MISSING_ALERT_CREATED", "WEEKLY_SCHEDULE_INGESTION_ALERT"],
  ["WEEKLY_SCHEDULE_VERSION_CREATED", "WEEKLY_SCHEDULE_EMAIL_INTAKE"], ["WRITE_FREEZE_APPLIED", "Database"], ["WRITE_FREEZE_REVERTED", "Database"],
];

await check("os 9 filtros pedidos existem, na ordem, com os rótulos da tela", () => {
  eq(c.AUDIT_FILTERS.slice(0, 9).map((f) => f.label), [
    "Todos", "Projetos e versões", "Atas de reunião", "Relatórios e RDO", "Medições", "E-mails", "Ações e SLA", "SSMA/ESG", "Integrações e falhas",
  ]);
});

await check("todo código existente em produção tem regra explícita (nenhum cai em Não catalogados)", () => {
  const orphans = PRODUCTION_CODES.filter(([a, e]) => c.classifyAuditEntry(a, e).category === "NAO_CATALOGADO").map(([a]) => a);
  eq(orphans, [], "códigos sem regra:");
});

await check("todo código técnico de produção tem tradução em português", () => {
  const missing = PRODUCTION_CODES.map(([a]) => a).filter((a) => /^[A-Z][A-Z0-9_]+$/.test(a) && !c.translateAuditAction(a).translated);
  eq(missing, [], "sem tradução:");
});

await check("código desconhecido não some: vai para Não catalogados e mantém o código na tela", () => {
  eq(c.classifyAuditEntry("ALGO_NOVO_XYZ", "QUALQUER"), { category: "NAO_CATALOGADO", ruleId: "sem-regra" });
  eq(c.translateAuditAction("ALGO_NOVO_XYZ").label, "ALGO_NOVO_XYZ");
});

await check("regressões da heurística antiga: Atas, SSMA, Cadastro e congelamento", () => {
  eq(c.classifyAuditEntry("SLA_MATRIX_RULE_DUPLICATE_DEACTIVATED", "SLA_MATRIX_RULE").category, "ACOES", "'DATA ' não é ata:");
  eq(c.classifyAuditEntry("RISK_ALERT_REISSUE_DECISION_REQUIRED", "RISK_ALERT_CASE").category, "ACOES", "alerta não é relatório:");
  eq(c.classifyAuditEntry("DOCUMENT_PROCESSING_COMPLETED", "DOCUMENT_VERSION").category, "PROJETOS", "documento não é SSMA:");
  for (const a of ["MEMBER_ROLE_CHANGED", "MEMBER_INVITATION_AREA_CHANGED", "MEMBER_INVITATION_CANCELLED", "WRITE_FREEZE_APPLIED", "WRITE_FREEZE_REVERTED", "MODULE_LOCK_APPLIED"]) {
    eq(c.classifyAuditEntry(a, "x").category, "SEGURANCA", `${a}:`);
  }
  eq(c.classifyAuditEntry("Sincronização incremental Gmail executada", "EmailIngestionRun").category, "EMAILS");
  eq(c.classifyAuditEntry("SSMA_FORM_SUBMITTED", "SSMA_FORM_SUBMISSION").category, "SSMA");
});

await check("toda falha vai para Integrações e falhas, de qualquer módulo", () => {
  for (const a of ["DOCUMENT_PROCESSING_FAILED", "RISK_ALERT_EMAIL_FAILED", "SSMA_DRIVE_FILE_SYNC_FAILED", "DRIVE_FILE_SYNC_FAILED", "GMAIL_MESSAGE_UNAVAILABLE", "PILOT_SEND_DELIVERY_DISCREPANCY"]) {
    eq(c.classifyAuditEntry(a, "x"), { category: "INTEGRACOES", ruleId: "falha" }, `${a}:`);
  }
});

await check("traduções pedidas pelo proprietário", () => {
  eq(c.translateAuditAction("MEMBER_INVITATION_AREA_CHANGED").label, "Área do convite alterada");
  eq(c.translateAuditAction("MEMBER_ROLE_CHANGED").label, "Perfil do colaborador alterado");
  eq(c.translateAuditAction("WRITE_FREEZE_REVERTED").label, "Congelamento de escrita revertido");
  eq(c.translateAuditAction("MODULE_LOCK_APPLIED").label, "Bloqueio de módulos aplicado");
  eq(c.translateAuditAction("WRITE_FREEZE_APPLIED").label, "Congelamento de escrita aplicado");
});

await check("horário em Brasília (UTC−3), sem alterar o valor original", () => {
  eq(c.formatAuditDateTime("2026-11-27T15:33:19.049584+00:00"), "27/11/2026, 12:33:19");
  eq(c.formatAuditDateTime("2026-11-25T02:16:22Z"), "24/11/2026, 23:16:22", "virada de dia:");
  eq(c.brasiliaDayStartUtc("2026-11-25"), "2026-11-25T03:00:00.000Z");
  eq(c.brasiliaNextDayStartUtc("2026-11-25"), "2026-11-26T03:00:00.000Z");
  eq(c.brasiliaDayStartUtc("25/11/2026"), null);
});

await check("filtros da URL: valores inválidos voltam ao padrão seguro", () => {
  eq(c.parseAuditFilter("projetos"), "PROJETOS");
  eq(c.parseAuditFilter("DROP"), "TODOS");
  eq(q.parseAuditActor("SYSTEM"), "SYSTEM");
  eq(q.parseAuditActor("c7bfe367-bac6-4263-8dd1-2b8b561e8cec"), "c7bfe367-bac6-4263-8dd1-2b8b561e8cec");
  eq(q.parseAuditActor("x' or 1=1"), undefined);
  eq(q.parseAuditDay("2026-11-27"), "2026-11-27");
  eq(q.parseAuditDay("ontem"), undefined);
});

await check("palavra-chave: sintaxe do PostgREST neutralizada e busca também pela tradução", () => {
  const f = q.buildKeywordOrFilter("congelamento),detail.eq.(x");
  assert(f && !/[(),]/.test(f.split(",")[0].replace("detail.ilike.", "")), f);
  assert(f.split(",").length === 5, "a injeção não pode criar condições extras: " + f);
  const t = q.buildKeywordOrFilter("congelamento");
  assert(t.includes("action.in.(") && t.includes("WRITE_FREEZE_APPLIED"), "deveria incluir códigos cuja tradução contém o termo");
  eq(q.buildKeywordOrFilter("  ,,  "), null);
  assert(q.buildKeywordOrFilter("crm@axion.com.br").includes("*crm@axion.com.br*"), "e-mail deveria ser pesquisável");
});

await check("situação das falhas: ativa, aguardando investigação, recuperada e histórica, com evidência", () => {
  const now = new Date("2026-11-27T20:00:00Z");
  const failures = [
    { id: "1", action: "DOCUMENT_PROCESSING_FAILED", entityId: "doc-a", occurredAt: "2026-11-27T10:00:00Z" },
    { id: "2", action: "GMAIL_MESSAGE_UNAVAILABLE", entityId: "mail-b", occurredAt: "2026-11-18T09:14:00Z" },
    { id: "3", action: "GMAIL_MESSAGE_UNAVAILABLE", entityId: "mail-b", occurredAt: "2026-11-18T01:46:00Z" },
    { id: "4", action: "DRIVE_FILE_SYNC_FAILED", entityId: "att-c", occurredAt: "2026-08-23T05:20:59Z" },
    { id: "5", action: "SSMA_DRIVE_FILE_SYNC_FAILED", entityId: "photo-d", occurredAt: "2026-09-10T00:05:27Z" },
  ];
  const recoveries = [
    { action: "SSMA_DRIVE_FILE_SYNCED", entityId: "photo-d", occurredAt: "2026-09-10T00:23:59Z" },
    { action: "DRIVE_FILE_SYNCED", entityId: "att-c", occurredAt: "2026-08-23T05:00:00Z" }, // anterior à falha: não recupera
  ];
  const r = Object.fromEntries(c.assessFailures(failures, recoveries, now).map((f) => [f.entityId, f]));
  eq(r["doc-a"].status, "ATIVA");
  eq(r["mail-b"].status, "AGUARDANDO_INVESTIGACAO");
  eq(r["mail-b"].occurrences, 2, "tentativas repetidas contam uma vez:");
  eq(r["att-c"].status, "HISTORICA");
  eq(r["photo-d"].status, "RECUPERADA");
  assert(r["photo-d"].evidence.includes("SSMA_DRIVE_FILE_SYNCED"));
});

// ---- Cliente Supabase simulado: aplica eq/gte/lt/or/in/order/range/limit e devolve no máximo 1.000 linhas (como o PostgREST).
function fakeClient(rows, log) {
  return {
    from(table) {
      assert(table === "audit_log_entries" || table === "profiles", table);
      const state = { filters: [], range: null, limit: null };
      const api = {
        select() { return api; },
        eq(col, val) { state.filters.push((r) => r[col] === val); return api; },
        gte(col, val) { state.filters.push((r) => r[col] >= val); return api; },
        lt(col, val) { state.filters.push((r) => r[col] < val); return api; },
        in(col, vals) { state.filters.push((r) => vals.includes(r[col])); return api; },
        or(expr) { log.or.push(expr); return api; },
        order() { return api; },
        range(a, b) { state.range = [a, b]; return api; },
        limit(n) { state.limit = n; return api; },
        then(resolve) {
          let out = rows.filter((r) => state.filters.every((f) => f(r)));
          if (state.range) out = out.slice(state.range[0], state.range[1] + 1);
          out = out.slice(0, Math.min(state.limit ?? 1000, 1000));
          log.requests += 1;
          resolve({ data: out, error: null });
        },
      };
      return api;
    },
  };
}

const P = "00000000-0000-4000-8000-000000000001";
function makeRows() {
  const rows = [];
  const base = Date.parse("2026-11-27T20:00:00Z");
  for (let i = 0; i < 4519; i += 1) {
    let action = "Sincronização incremental Gmail executada";
    let entity = "EmailIngestionRun";
    if (i % 10 === 3) [action, entity] = ["MEMBER_ROLE_CHANGED", "project_memberships"];
    if (i % 10 === 5) [action, entity] = ["DOCUMENT_PROCESSING_COMPLETED", "DOCUMENT_VERSION"];
    if (i === 4500) [action, entity] = ["SSMA_FORM_SUBMITTED", "SSMA_FORM_SUBMISSION"]; // muito antigo: antes ficava fora dos 1.000
    rows.push({
      id: `id-${String(i).padStart(5, "0")}`, project_id: P, occurred_at: new Date(base - i * 60_000).toISOString(),
      actor_type: "SYSTEM", actor_user_id: null, actor_label: null, action, entity_type: entity, entity_id: `e${i}`, detail: "x",
    });
  }
  rows.push({ id: "outro", project_id: "11111111-0000-4000-8000-000000000000", occurred_at: new Date(base).toISOString(), actor_type: "SYSTEM", actor_user_id: null, actor_label: null, action: "SSMA_FORM_SUBMITTED", entity_type: "x", entity_id: "y", detail: "outro projeto" });
  return rows;
}

await check("Todos alcança os 4.519 registros por paginação (sem o corte de 1.000) e conta por categoria", async () => {
  const log = { requests: 0, or: [] };
  const r = await q.queryAuditLogWithClient(fakeClient(makeRows(), log), { projectId: P, category: "TODOS", page: 1 }, new Date("2026-11-27T20:00:00Z"));
  eq(r.counts.TODOS, 4519);
  eq(r.counts.SEGURANCA, 452);
  eq(r.counts.SSMA, 1, "registro antigo de SSMA precisa aparecer:");
  eq(r.counts.SEGURANCA + r.counts.PROJETOS + r.counts.EMAILS + r.counts.SSMA, 4519, "soma das categorias = Todos:");
  eq(r.pageCount, Math.ceil(4519 / 50));
  eq(r.rows.length, 50);
  const last = await q.queryAuditLogWithClient(fakeClient(makeRows(), log), { projectId: P, category: "TODOS", page: 999 });
  eq(last.page, r.pageCount, "página além do fim volta para a última:");
  eq(last.rows.length, 4519 - (r.pageCount - 1) * 50);
});

await check("filtro por categoria e isolamento por projeto", async () => {
  const log = { requests: 0, or: [] };
  const r = await q.queryAuditLogWithClient(fakeClient(makeRows(), log), { projectId: P, category: "SSMA" });
  eq(r.totalMatching, 1);
  eq(r.rows.map((x) => x.id), ["id-04500"], "outro projeto não pode aparecer:");
  assert(r.rows.every((x) => x.category === "SSMA"));
});

await check("datas em Brasília e palavra-chave vão para a consulta do banco", async () => {
  const log = { requests: 0, or: [] };
  const r = await q.queryAuditLogWithClient(fakeClient(makeRows(), log), { projectId: P, category: "TODOS", from: "2026-11-27", to: "2026-11-27", keyword: "perfil" });
  assert(r.counts.TODOS > 0 && r.counts.TODOS < 4519, String(r.counts.TODOS));
  assert(log.or.some((e) => e.includes("MEMBER_ROLE_CHANGED")), "busca por 'perfil' deveria incluir o código traduzido");
});

await check("tela: label novo, cabeçalho de Brasília, mensagem de vazio, sem leitura direta não paginada", () => {
  const page = readFileSync(new URL("../apps/web/app/[projectId]/auditoria/page.tsx", import.meta.url), "utf8");
  const bar = readFileSync(new URL("../apps/web/components/audit/audit-filter-bar.tsx", import.meta.url), "utf8");
  assert(bar.includes("FILTRAR REGISTROS DE AUDITORIA") && !bar.includes("Filtrar logs"));
  assert(page.includes("Data/Hora — Brasília"));
  assert(page.includes("Nenhum registro encontrado para os filtros selecionados."));
  assert(page.includes("queryAuditLog(") && !page.includes("getAuditLog("), "a tela deve usar a consulta paginada no servidor");
  assert(bar.includes("Carregando registros") && bar.includes("Limpar filtros"));
  assert(page.includes('tipo: "INTEGRACOES"'), "o aviso de falhas deve levar ao filtro Integrações e falhas");
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
