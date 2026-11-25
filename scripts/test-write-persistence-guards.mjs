// Nenhuma confirmação de sucesso sem persistência: as gravações de tela que antes confirmavam sucesso com UPDATE de
// 0 linhas (RLS) agora exigem a linha gravada de volta. Verificação estática do código (sem rede, sem banco); o
// comportamento no banco é coberto por test-sla-action-operations-sql.mjs.
// Uso: node scripts/test-write-persistence-guards.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log("OK  ", name);
  } catch (e) {
    failed += 1;
    console.log("FAIL", name, "->", String(e.message).split("\n")[0]);
  }
};

const acoes = read("apps/web/app/[projectId]/acoes/actions.ts");
const section = (name) => {
  const start = acoes.indexOf(`export async function ${name}(`);
  const end = acoes.indexOf("export async function", start + 10);
  return acoes.slice(start, end === -1 ? undefined : end);
};

for (const [fn, rpc, expect] of [
  ["assumeSlaActionAction", "sla_action_assume", 'row.status === "ACKNOWLEDGED"'],
  ["startSlaActionAction", "sla_action_start", 'row.status === "IN_PROGRESS"'],
  ["completeSlaActionAction", "sla_action_complete", 'row.status === "COMPLETED"'],
  ["reassignSlaActionAction", "sla_action_forward", "row.responsible_user_id === newResponsibleUserId"],
]) {
  check(`Ações: ${fn} grava pela RPC ${rpc} e só confirma com a linha devolvida no estado esperado`, () => {
    const body = section(fn);
    assert.ok(body.includes(`supabase.rpc("${rpc}"`), "não usa a RPC");
    assert.ok(!/from\("sla_actions"\)\s*\.update/.test(body), "ainda faz UPDATE direto");
    assert.ok(body.includes("persisted(data, actionId") && body.includes(expect), "sem verificação de persistência");
    assert.ok(body.includes("NOT_PERSISTED"), "sem mensagem de não persistido");
  });
}

check("Ações: a tela oferece as operações ao ADMINISTRADOR e ao responsável atual (não LEITURA), e manda ação de alerta de risco para a página do alerta", () => {
  const page = read("apps/web/app/[projectId]/acoes/page.tsx");
  assert.match(page, /permission === "ADMINISTRADOR" \|\| \(permission !== null && permission !== "LEITURA" && responsibleUserId !== null && responsibleUserId === currentUserId\)/);
  assert.ok(page.includes("riskCaseId={riskCaseByActionId.get(action.id) ?? null}"));
  const item = read("apps/web/components/sla/sla-action-item.tsx");
  assert.ok(item.includes("const operable = !riskCaseId;") && item.includes("/alertas/${riskCaseId}"));
});

for (const rel of [
  "apps/web/lib/additionals/update-additional-proposal-status.ts",
  "apps/web/lib/additionals/update-additional-proposal-approvals.ts",
  "apps/web/lib/additionals/mark-additional-proposal-contracted.ts",
  "apps/web/lib/startup/configure-startup.ts",
  "apps/web/lib/startup/complete-startup.ts",
  "apps/web/lib/startup/dismiss-historical-finding.ts",
  "apps/web/lib/startup/resolve-historical-finding.ts",
  "apps/web/lib/startup/create-action-for-historical-finding.ts",
]) {
  check(`${path.basename(rel)}: UPDATE devolve a linha (.select("id")) e falha se nada foi gravado`, () => {
    const src = read(rel);
    assert.ok(/\.update\([\s\S]*?\.select\("id"\)/.test(src), "UPDATE sem .select");
    assert.ok(src.includes("if (!persistedRows?.length)"), "sem verificação de linhas gravadas");
  });
}

check("Lote contratual: falha no espelho dos lembretes vira aviso na tela e registro na auditoria (não é mais engolida)", () => {
  const src = read("apps/web/lib/email-actions/respond-to-contract-alert-batch.ts");
  assert.ok(!/catch \{\s*\/\/ Complementar: não propaga\.\s*\}/.test(src), "catch silencioso ainda presente");
  assert.ok(src.includes("CONTRACT_ALERT_FOLLOWUP_NOT_APPLIED") && src.includes("followupWarning"));
  assert.ok(read("apps/web/app/alertas/acao/[projectId]/[batchId]/[eventId]/compact-action-form.tsx").includes("state.warning"));
  assert.ok(read("apps/web/app/[projectId]/ledger/lote-alertas/[batchId]/contract-alert-batch-form.tsx").includes("state.warning"));
});

check("E-mail de risco com caso registrado não emite os links de SLA concorrentes; resumo semanal exclui ações de caso de risco; escalonamento manual pula caso encerrado", () => {
  assert.ok(read("apps/web/lib/risk-alerts/run-risk-alert-cycle.ts").includes("actionButtons: entry.slaActionId && !caseId"));
  assert.ok(read("apps/web/lib/email/run-weekly-alert-digests.ts").includes("!riskLinked.has(action.id)"));
  const esc = section("processSlaEscalationsAction");
  assert.ok(esc.includes('row.status === "CLOSED" || row.state === "RESOLVED"') && esc.includes("if (closedRiskCaseActionIds.has(action.id)) continue;"));
});

console.log(failed ? `\n${failed} FALHA(S)` : "\nTUDO OK");
process.exit(failed ? 1 : 0);
