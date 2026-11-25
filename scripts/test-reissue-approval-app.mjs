// FRENTE D — camada de app do fluxo de aprovação de reemissão (unidade + estrutura). Sem banco, rede ou e-mail.
// Cobre: validação de entrada, mapeamento da RPC, mensagens, guardas de administrador (menu, página e ação no servidor),
// ausência de qualquer envio/outbox no fluxo de aprovação, interruptor de envio (desligado por padrão) ligado ao ciclo.
// Uso: node scripts/test-reissue-approval-app.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const lib = await import("../apps/web/lib/risk-alerts/reissue-approval.ts");
const gate = await import("../apps/web/lib/risk-alerts/reissue-send-gate.ts");

let ok = 0;
let bad = 0;
const t = (name, cond) => {
  if (cond) {
    ok += 1;
    console.log("OK  ", name);
  } else {
    bad += 1;
    console.log("FAIL", name);
  }
};
const read = (p) => readFileSync(p, "utf8");
const P = "00000000-0000-4000-8000-0000000d0001";
const C1 = "00000000-0000-4000-8000-0000000d3001";
const JUST = "Diretoria confirmou que o risco segue vigente e deve ser reemitido.";

// ---------- Validação ----------
const base = { projectId: P, caseIds: [C1], justification: JUST, confirmed: "sim" };
t("validação: entrada correta é aceita (deduplica ids)", (() => { const r = lib.validateReissueApprovalInput({ ...base, caseIds: [C1, C1] }); return r.ok && r.caseIds.length === 1 && r.justification === JUST; })());
t("validação: sem casos, id inválido, obra inválida e excesso de casos são recusados", !lib.validateReissueApprovalInput({ ...base, caseIds: [] }).ok && !lib.validateReissueApprovalInput({ ...base, caseIds: ["x"] }).ok && !lib.validateReissueApprovalInput({ ...base, projectId: "x" }).ok && !lib.validateReissueApprovalInput({ ...base, caseIds: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) }).ok);
t("validação: justificativa obrigatória (vazia/curta/longa)", !lib.validateReissueApprovalInput({ ...base, justification: "" }).ok && !lib.validateReissueApprovalInput({ ...base, justification: "curta" }).ok && !lib.validateReissueApprovalInput({ ...base, justification: "x".repeat(501) }).ok);
t("validação: sem confirmação não registra", !lib.validateReissueApprovalInput({ ...base, confirmed: null }).ok && !lib.validateReissueApprovalInput({ ...base, confirmed: "nao" }).ok);

// ---------- Mapeamento ----------
const mapped = lib.mapReissuePendingRow({ case_id: C1, visible_code: "AB12CD34", area: "PLANEJAMENTO", risk_level: "CRITICAL", title: "T", reference: "R", age_days: 12, stage: "DIRETORIA", gap_roles: ["RESPONSAVEL"], manually_suspended: true, approval_state: "NONE", last_approval_id: null, last_approved_at: null, eligible: false, reason: "MANUALLY_SUSPENDED" });
t("mapeamento da consulta: bloqueio manual, lacuna e motivo preservados", mapped.manuallySuspended === true && mapped.gapRoles[0] === "RESPONSAVEL" && mapped.ageDays === 12 && mapped.eligible === false);
const out = lib.mapReissueApprovalOutcome({ approved: [{ caseId: C1, visibleCode: "AB12CD34", auditId: "a1" }], ignored: [{ caseId: "c2", reason: "MANUALLY_SUSPENDED" }], emailSent: true });
t("resultado: por caso; emailSent é SEMPRE false na camada de app", out.approved.length === 1 && out.ignored[0].reason === "MANUALLY_SUSPENDED" && out.emailSent === false);
t("todo motivo da RPC tem rótulo em português", ["ELIGIBLE", "CASE_NOT_FOUND", "CASE_NOT_OPEN", "RISK_LEVEL_NOT_ELIGIBLE", "NO_SLA_ACTION", "MANUALLY_SUSPENDED", "ALREADY_APPROVED_AWAITING_SEND", "ALREADY_REISSUED", "NO_COMMUNICATION_GAP"].every((r) => lib.reissueReasonLabel(r) !== r));
t("erros da RPC viram mensagem amigável sem vazar detalhe interno", lib.friendlyReissueError("FORBIDDEN").includes("administradores") && lib.friendlyReissueError("JUSTIFICATION_SENSITIVE").includes("justificativa") && !lib.friendlyReissueError("PG: relation x violates").includes("relation"));

// ---------- Interruptor ----------
t("interruptor: desligado por padrão (ausente, vazio, outro valor)", !gate.isReissueSendEnabled({}) && !gate.isReissueSendEnabled({ ACC_RISK_ALERT_REISSUE_SEND_ENABLED: "" }) && !gate.isReissueSendEnabled({ ACC_RISK_ALERT_REISSUE_SEND_ENABLED: "1" }) && gate.isReissueSendEnabled({ ACC_RISK_ALERT_REISSUE_SEND_ENABLED: " True " }));
const approvals = new Map([[C1, { auditId: "a1", caseId: C1, approvedAt: "2026-11-20T00:00:00.000Z", approvedByUserId: "u" }]]);
t("interruptor: ciclo real desligado retém as aprovações; dry-run as enxerga", gate.applyReissueSendGate(approvals, { dryRun: false, env: {} }).held === 1 && gate.applyReissueSendGate(approvals, { dryRun: true, env: {} }).approvals.size === 1);

// ---------- Estrutura ----------
const cycle = read("apps/web/lib/risk-alerts/run-risk-alert-cycle.ts");
t("ciclo: o planejador recebe as aprovações SÓ pelo interruptor (applyReissueSendGate)", cycle.includes("applyReissueSendGate(snapshot.reissueApprovals, { dryRun })") && cycle.includes("reissueApprovals: reissueGate.approvals") && !cycle.includes("reissueApprovals: snapshot.reissueApprovals"));

const nav = read("apps/web/lib/ui/nav-items.ts").split("\n").find((l) => l.includes('href: "reemissao-alertas"')) ?? "";
t("menu: Reemissão de alertas restrito a administrador", nav.includes('restrictedTo: "admin"'));
const page = read("apps/web/app/[projectId]/reemissao-alertas/page.tsx");
const action = read("apps/web/app/[projectId]/reemissao-alertas/actions.ts");
const form = read("apps/web/app/[projectId]/reemissao-alertas/reissue-approval-form.tsx");
t("página: guarda de administrador no servidor (404 para os demais) e leitura só pela RPC de consulta", page.includes("isProjectAdmin(projectId)).isAdmin) notFound()") && page.includes("risk_alert_reissue_pending"));
t("ação: guarda de administrador ANTES de qualquer chamada ao banco; usa a RPC de aprovação", action.indexOf("isProjectAdmin(projectId)") > 0 && action.indexOf("isProjectAdmin(projectId)") < action.indexOf("createSupabaseServerClient()") && action.includes("risk_alert_reissue_approve"));
t("ação: uma única função exportada e 'use server'", (action.match(/^export async function /gm) ?? []).length === 1 && action.startsWith('"use server"'));
const everything = [page, action, form, read("apps/web/lib/risk-alerts/reissue-approval.ts")].join("\n");
t("fluxo de aprovação NÃO envia nem escreve outbox: sem provedor de e-mail, sem risk_alert_outbox, sem insert/update direto", !/getEmailProvider|sendEmail|gmail|risk_alert_outbox|\.insert\(|\.update\(|\.delete\(|service[_-]?role|createSupabaseAdminClient/i.test(everything));
t("sem segredo no frontend: componente cliente não lê process.env", !/process\.env/.test(form));
t("formulário exige confirmação explícita e justificativa; casos inelegíveis ficam desabilitados", form.includes('name="confirm"') && form.includes("required") && form.includes("disabled={!row.eligible}") && form.includes('name="justification"'));
t("tela mostra código, área, risco, idade, lacuna, bloqueio manual e resultado por caso", ["Código", "Área", "Risco", "Idade", "Bloqueio manual", "Lacuna"].every((h) => form.includes(h)) && form.includes("state.outcome.ignored") && form.includes("state.outcome.approved"));

const mig = read("supabase/migrations/20261121178000_reissue_approval_flow.sql");
t("migration: não escreve em risk_alert_outbox/sla_actions/risk_alert_cases (só insere auditoria)", !/insert\s+into\s+public\.(risk_alert_outbox|sla_actions|risk_alert_cases)|update\s+public\.(risk_alert_outbox|sla_actions|risk_alert_cases)|delete\s+from/i.test(mig) && /insert into public\.audit_log_entries/.test(mig));
t("migration: SECURITY DEFINER com search_path vazio, revoke de public/anon e grant só a authenticated", (mig.match(/security definer/g) ?? []).length === 3 && (mig.match(/set search_path = ''/g) ?? []).length === 3 && /revoke all on function public\.risk_alert_reissue_approve\(uuid, uuid\[\], text\) from public, anon;/.test(mig) && /grant execute on function public\.risk_alert_reissue_approve\(uuid, uuid\[\], text\) to authenticated;/.test(mig) && !/grant[^;]*to[^;]*(anon|public|service_role)/i.test(mig));
t("migration: NULL-safe/falha fechada (coalesce na permissão e auth.uid obrigatório)", mig.includes("coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false)") && mig.includes("AUTH_REQUIRED"));

const hotfix = readFileSync("supabase/migrations/20261121090000_hotfix_risk_alert_action_authorization.sql");
t("hotfix P0 intocável: migration do hotfix não foi alterada por esta frente (arquivo presente e sem referência à nova função)", !hotfix.toString("utf8").includes("risk_alert_reissue"));

console.log(`\nRESULTADO: ${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
