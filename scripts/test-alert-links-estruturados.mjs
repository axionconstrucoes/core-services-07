// FASE 3 / Frente D — camada de APLICAÇÃO (pura, sem banco): vínculo estruturado alerta -> RNC/garantia/sinistro com fallback à convenção
// 'ALERTA:<id>', e prova ESTÁTICA de que nenhuma Server Action/comando escreve nas tabelas de Qualidade/Garantias por INSERT/UPDATE direto
// (a escrita direta foi revogada no banco na migration 20261123302000). O SQL real é provado em scripts/test-quality-rpc-realpg.mjs.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-alert-links-estruturados.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const L = await import("../apps/web/lib/pilares/alert-links.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
let passed = 0;
let failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };

const alert = { caseId: "11111111-2222-3333-4444-555555555555", visibleCode: "ALR-00042" };
const row = (o) => ({ type: "NCR", id: "x", code: "RNC-0001", title: "t", state: "INVESTIGACAO", refs: [], dueDate: null, ...o });
const link = (o) => ({ entityType: "RNC", entityId: "n1", active: true, linkSource: "MANUAL", ...o });

check("CASO F3-D-10: vínculo estruturado ATIVO aparece sem nenhum texto de origem (origem ESTRUTURADO)", () => {
  const out = L.combineLinkedEntities([link({ entityId: "n1" })], [row({ id: "n1", refs: [] })], [], alert);
  assert.deepEqual(out.map((r) => [r.id, r.origin]), [["n1", "ESTRUTURADO"]]);
});
check("CASO F3-D-11: dados antigos continuam funcionando pela CONVENÇÃO TEXTUAL (fallback), com origem CONVENCAO", () => {
  const out = L.combineLinkedEntities([], [], [row({ id: "n2", refs: ["ALERTA:" + alert.caseId] }), row({ id: "n3", refs: ["sem relação"] })], alert);
  assert.deepEqual(out.map((r) => [r.id, r.origin]), [["n2", "CONVENCAO"]]);
});
check("vínculo DESFEITO por humano exclui a ligação por texto (a decisão humana prevalece sobre a convenção)", () => {
  const out = L.combineLinkedEntities([link({ entityId: "n2", active: false })], [], [row({ id: "n2", refs: ["ALERTA:" + alert.caseId] })], alert);
  assert.deepEqual(out, []);
});
check("sem duplicidade: estruturado e convenção para a MESMA entidade geram uma única linha (a estruturada)", () => {
  const out = L.combineLinkedEntities([link({ entityId: "n1" })], [row({ id: "n1" })], [row({ id: "n1", refs: ["ALERTA:" + alert.caseId] })], alert);
  assert.equal(out.length, 1);
  assert.equal(out[0].origin, "ESTRUTURADO");
});
check("só entidades ABERTAS aparecem (RNC encerrada, garantia encerrada e sinistro encerrado não geram aviso), por tipo", () => {
  const out = L.combineLinkedEntities(
    [link({ entityId: "n1" }), link({ entityType: "GARANTIA", entityId: "w1" }), link({ entityType: "SINISTRO", entityId: "c1" }), link({ entityType: "SINISTRO", entityId: "c2" })],
    [row({ id: "n1", state: "ENCERRADA" }), row({ type: "WARRANTY", id: "w1", state: "EM_REPARO" }), row({ type: "CLAIM", id: "c1", state: "ENCERRADO" }), row({ type: "CLAIM", id: "c2", state: "AVISO" })],
    [], alert);
  assert.deepEqual(out.map((r) => r.id).sort(), ["c2", "w1"]);
});
check("o mesmo id em tipos diferentes não se confunde (chave = tipo + id) e o tipo estruturado mapeia para o tipo da entidade", () => {
  const out = L.combineLinkedEntities([link({ entityType: "GARANTIA", entityId: "same" })], [row({ type: "WARRANTY", id: "same", state: "ABERTA" })], [row({ type: "NCR", id: "same", refs: ["ALERTA:" + alert.caseId] })], alert);
  assert.deepEqual(out.map((r) => [r.type, r.origin]).sort(), [["NCR", "CONVENCAO"], ["WARRANTY", "ESTRUTURADO"]]);
  assert.deepEqual(L.STRUCTURED_TO_ENTITY, { RNC: "NCR", GARANTIA: "WARRANTY", SINISTRO: "CLAIM" });
  assert.equal(L.isStructuredEntityType("RNC") && L.isStructuredEntityType("SINISTRO") && !L.isStructuredEntityType("CONTRATO"), true);
});
check("a regra de que RESOLVIDO não encerra continua intacta (título fixo, guarda, rótulos)", () => {
  assert.equal(L.RESOLVED_NOTICE_TITLE, "RESOLVIDO não encerra a RNC/garantia/sinistro vinculada");
  assert.equal(L.parseGuardPayload({ alertResolutionClosesEntity: true, closureReady: true, blockers: [], rule: "x" }), null);
});

check("camada de dados: lê acc_alert_links filtrando por projeto e alerta, sob a sessão do usuário; somente leitura; sem service role; sem RPC nova", () => {
  const src = read("apps/web/lib/pilares/alert-links-data.ts");
  assert.match(src, /from\("acc_alert_links"\)/);
  assert.match(src, /\.eq\("project_id", projectId\)\.eq\("alert_case_id", alert\.caseId\)/);
  assert.match(src, /combineLinkedEntities/);
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(src, /service[_-]?role|createSupabaseAdmin/i);
  assert.doesNotMatch(src, /\.rpc\("(?!quality_alert_resolved_guard)/);
  assert.match(src, /MISSING_RELATION_CODES\.has\(error\.code\)/, "tabela ausente => só convenção (migration pendente não derruba a tela)");
});
check("UI do alerta mostra a origem do vínculo com Hover Text; a regra do aviso não mudou", () => {
  const notice = read("apps/web/components/risk-alerts/linked-quality-notice.tsx");
  assert.match(notice, /pilares\.alerta\.origem-vinculo/);
  assert.match(notice, /vínculo registrado/);
  assert.match(notice, /dado antigo/);
  assert.ok(ACC_FEATURE_HELP["pilares.alerta.origem-vinculo"], "help catalogado");
  assert.match(ACC_FEATURE_HELP["pilares.alerta.origem-vinculo"].description, /acc_alert_links/);
});

// ------------------------------------------------------------------ escrita direta eliminada da aplicação
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p);
  }
  return acc;
}
const QUALITY_TABLES = ["quality_requirements", "quality_ncrs", "quality_warranty_cases", "quality_customer_complaints", "quality_inspections", "quality_tests", "quality_evidence", "quality_corrective_actions", "quality_warranty_maintenance", "quality_warranty_surveys", "quality_warranty_repairs", "quality_effectiveness_verifications", "quality_recurrences", "quality_nonquality_costs", "quality_consequences", "acc_alert_links"];
check("nenhum código da aplicação faz INSERT/UPDATE/UPSERT/DELETE direto nas tabelas de Qualidade/Garantias/vínculos (só RPC)", () => {
  const offenders = [];
  for (const f of [...walk(path.join(root, "apps/web/app")), ...walk(path.join(root, "apps/web/lib")), ...walk(path.join(root, "apps/web/components"))]) {
    const text = readFileSync(f, "utf8");
    for (const t of QUALITY_TABLES) {
      const re = new RegExp(`from\\(\\s*["'\`]${t}["'\`]\\s*\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`, "g");
      if (re.test(text)) offenders.push(`${path.relative(root, f)} -> ${t}`);
    }
  }
  assert.deepEqual(offenders, []);
});
check("comandos de Qualidade e Server Actions de Garantias chamam as RPCs transacionais da fase 3/D", () => {
  const cmds = read("apps/web/lib/quality/ui-commands.ts");
  for (const fn of ["quality_evidence_register", "quality_evidence_revise", "quality_capa_register", "quality_capa_update_status", "quality_verification_register", "quality_consequence_register", "quality_cost_register", "quality_recurrence_register", "quality_complaint_register", "quality_inspection_register", "quality_test_register", "quality_requirement_register", "quality_ncr_update_fields"]) {
    assert.match(cmds, new RegExp(`"${fn}"`), fn);
  }
  const gar = read("apps/web/app/[projectId]/garantias/actions.ts");
  for (const fn of ["quality_warranty_case_update", "quality_warranty_acceptance_register", "quality_warranty_maintenance_register", "quality_warranty_survey_register", "quality_warranty_repair_register", "quality_evidence_register", "quality_verification_register"]) {
    assert.match(gar, new RegExp(`"${fn}"`), fn);
  }
  const fontes = read("apps/web/app/[projectId]/fontes-qualidade/actions.ts");
  assert.match(fontes, /rpc\(\s*"quality_evidence_register"/);
  assert.match(fontes, /rpc\("quality_evidence_register"/);
});
check("autoridade por operação espelha a matriz: reclassificar evidência, causa raiz/prazo e aceite exigem MANAGE; cancelar CAPA exige MANAGE", () => {
  const cmds = read("apps/web/lib/quality/ui-commands.ts");
  assert.match(cmds, /export async function setEvidenceClassificationCommand[\s\S]*?guard\(ctx, "MANAGE"\)/);
  assert.match(cmds, /export async function updateNcrCommand[\s\S]*?guard\(ctx, "MANAGE"\)/);
  assert.match(cmds, /status === "CANCELADA" \? "MANAGE" : "REGISTER"/);
  const gar = read("apps/web/app/[projectId]/garantias/actions.ts");
  assert.match(gar, /registerAcceptanceAction[\s\S]*?context\(projectId, "MANAGE"\)/);
  const matrix = read("docs/permissoes-matriz-central.md");
  assert.match(matrix, /Reclassificar evidência \(`quality_evidence_revise`\) \| \*\*MANAGE\*\*/);
  assert.match(matrix, /Aceite do cliente \(`quality_warranty_acceptance_register`\) \| \*\*MANAGE\*\*/);
});
check("migrations da frente D: idempotentes, sem redefinir função existente, sem tocar record_risk_alert_action nem SLAs; rollbacks documentados", () => {
  const dir = path.join(root, "supabase/migrations");
  const mine = readdirSync(dir).filter((f) => /^2026112330\d{4}_/.test(f));
  assert.equal(mine.length, 4);
  for (const f of mine) {
    const sql = readFileSync(path.join(dir, f), "utf8").replace(/^\s*--.*$/gm, "");   // só código (os cabeçalhos citam o hotfix para dizer que NÃO o tocam)
    assert.doesNotMatch(sql, /record_risk_alert_action|sla_matrix|risk_sla/i, `${f} não toca hotfix/SLA`);
    assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i, `${f} não apaga tabela/coluna`);
    assert.doesNotMatch(sql, /\bdelete\s+from\b|\btruncate\b\s+(?!on)/i, `${f} não apaga dados`);
    assert.doesNotMatch(sql, /service_role.*(secret|key)|password|api[_-]?key/i, `${f} sem segredos`);
  }
  for (const rb of ["20261123300000_quality_integrity_guards", "20261123301000_quality_rpcs_children", "20261123302000_quality_revoke_direct_writes", "20261123303000_acc_alert_links"]) {
    assert.ok(read(`supabase/rollbacks/${rb}.rollback.sql`).length > 100, rb);
  }
  // nomes novos: nenhuma função da frente D redefine uma função de migration anterior
  const earlier = readdirSync(dir).filter((f) => f < "20261123300000").map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  for (const f of mine) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    for (const m of sql.matchAll(/create or replace function public\.([a-z_0-9]+)\(/gi)) {
      assert.ok(!new RegExp(`function public\\.${m[1]}\\(`, "i").test(earlier), `${f}: ${m[1]} já existia em migration anterior`);
    }
  }
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
