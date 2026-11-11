// Perfis do ESG alinhados em TRÊS camadas: interface, ações do servidor e políticas do banco (a RLS em si é provada em
// scripts/test-ssma-esg-migration-sql.mjs, PostgreSQL descartável). Aqui: tabela de verdade dos perfis, uso nas telas e
// nas ações, caminho do upload × política de Storage e varredura de service_role/bypass nos caminhos do ESG.
// Uso: node scripts/test-esg-profiles.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { canRegisterEsgCompliance, canReviewEsg, canConfigureEsg } = await import("../apps/web/lib/esg/esg-permissions.ts");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8");
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; } }

console.log("\n======================================\nESG — PERFIS (interface × servidor × banco)\n======================================");

check("tabela de verdade: registram Administrador/Gerente/Gestor/Colaborador; Leitura, inativo/fora (null) e papel desconhecido não", () => {
  for (const p of ["ADMINISTRADOR", "GERENTE", "GESTOR", "COLABORADOR"]) assert.equal(canRegisterEsgCompliance(p), true, p);
  for (const p of ["LEITURA", null, undefined, "", "VIEWER", "QUALQUER"]) assert.equal(canRegisterEsgCompliance(p), false, String(p));
});
check("revisão e configuração: somente Administrador", () => {
  assert.equal(canReviewEsg("ADMINISTRADOR"), true);
  assert.equal(canConfigureEsg("ADMINISTRADOR"), true);
  for (const p of ["GERENTE", "GESTOR", "COLABORADOR", "LEITURA", null]) { assert.equal(canReviewEsg(p), false, p); assert.equal(canConfigureEsg(p), false, p); }
});

const page = rd("apps/web/app/[projectId]/esg/page.tsx");
const actions = rd("apps/web/app/[projectId]/esg/actions.ts");
check("interface: a página decide pelos helpers (não compara o papel bruto)", () => {
  assert.ok(page.includes("canRegisterEsgCompliance(permission)") && page.includes("canReviewEsg(permission)") && page.includes("canConfigureEsg(permission)"));
  assert.ok(!/permission === "ADMINISTRADOR"/.test(page), "comparação direta com ADMINISTRADOR ainda presente");
});
check("servidor: criar obrigação, registrar comprovação e revisar conferem o perfil ANTES de chegar ao banco (e a revisão confere a sessão)", () => {
  const create = actions.slice(actions.indexOf("export async function createEsgObligationAction"), actions.indexOf("export async function createEsgObligationSubmissionAction"));
  const submit = actions.slice(actions.indexOf("export async function createEsgObligationSubmissionAction"), actions.indexOf("export async function reviewEsgObligationSubmissionAction"));
  const review = actions.slice(actions.indexOf("export async function reviewEsgObligationSubmissionAction"));
  assert.ok(create.includes("canConfigureEsg(await getCurrentProjectPermission(projectId))") && create.indexOf("canConfigureEsg") < create.indexOf(".insert("));
  assert.ok(submit.includes("canRegisterEsgCompliance(await getCurrentProjectPermission(projectId))") && submit.indexOf("canRegisterEsgCompliance") < submit.indexOf(".insert("));
  assert.ok(review.includes("auth.getUser()") && review.includes("canReviewEsg(await getCurrentProjectPermission(projectId))") && review.indexOf("canReviewEsg") < review.indexOf(".rpc("));
});

const migration = rd("supabase/migrations/20261106100000_ssma_esg_acoes_perfis_notificacoes.sql");
check("banco: policies de INSERT usam can_register_esg_compliance (ativo, Administrador/Gerente/Gestor/Colaborador); revisão e configuração NÃO foram alteradas", () => {
  assert.ok(/permission in \('ADMINISTRADOR', 'GERENTE', 'GESTOR', 'COLABORADOR'\)/.test(migration) && migration.includes("pm.status = 'ACTIVE'"));
  assert.ok(migration.includes("esg_obligation_submissions_insert_registrars_self_authored") && migration.includes("esg_obligation_evidence_insert_registrars_self_authored"));
  assert.ok(!/esg_obligations_insert|esg_obligations_update|review_esg_obligation_submission/.test(migration.replace(/--[^\n]*/g, "")), "configuração e RPC de revisão intactas");
});
check("upload: o caminho gravado pelo formulário bate com a policy de Storage (<obra>/esg-evidence/<obrigação>/<comprovação>/…)", () => {
  const form = rd("apps/web/components/esg/esg-submission-form.tsx");
  assert.ok(/\$\{projectId\}\/esg-evidence\/\$\{obligationId\}\/\$\{submissionId\}\//.test(form), "caminho do upload");
  assert.ok(migration.includes("v_parts[2] <> 'esg-evidence'") && migration.includes("can_upload_esg_evidence_object"));
  assert.ok(migration.includes("s.filled_by_user_id = auth.uid()"), "colaborador só anexa na própria comprovação");
});

function walk(dir) { return readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
check("service_role/bypass: nenhum caminho do ESG (telas, ações, lib, componentes, IA do ESG, rotas) usa cliente de serviço; não há rota de API de ESG", () => {
  const files = [
    ...walk(path.join(root, "apps/web/app/[projectId]/esg")), ...walk(path.join(root, "apps/web/lib/esg")), ...walk(path.join(root, "apps/web/components/esg")),
    path.join(root, "apps/web/lib/ai/esg-query-action.ts"), ...walk(path.join(root, "apps/web/lib/dashboard-visual")),
  ].filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(!/createSupabaseAdminClient|SUPABASE_SECRET_KEY|service_role/.test(readFileSync(f, "utf8")), `${path.relative(root, f)} usa service_role`);
  assert.ok(!walk(path.join(root, "apps/web/app/api")).some((f) => /[\\/]esg[\\/]/i.test(f)), "rota de API de ESG inesperada");
});
check("a RPC de revisão continua restrita a ADMIN no banco e é a única escrita de status (sem UPDATE direto nas actions)", () => {
  assert.ok(!/\.update\(/.test(actions), "update direto nas ações do ESG");
  const foundation = rd("supabase/migrations/20260822050000_esg_obligations_foundation.sql");
  assert.ok(/has_project_permission\(v_submission\.project_id, 'ADMIN'\)|has_project_permission\([^)]*'ADMIN'\)/.test(foundation));
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
