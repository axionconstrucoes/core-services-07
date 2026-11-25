// Fase 3/B — matriz central de permissões (acc_project_tier), parte PURA (sem banco): espelho TS x texto da migration,
// delegação dos wrappers e coerência da interface (Qualidade, Garantias, Seguros). A prova em Postgres real está em
// scripts/test-permissoes-unificadas-realpg.mjs. Nada acessa banco, rede ou IA.
//
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-permissoes-tier.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const T = await import("../apps/web/lib/permissions/project-tier.ts");
const IP = await import("../apps/web/lib/insurance-ui/permissions.ts");
const Q = await import("../apps/web/lib/quality/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => readFileSync(path.join(here, "..", "supabase", "migrations", f), "utf8");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}

const TIER_SQL = mig("20261123100000_acc_project_tier.sql");
const WRAP_SQL = mig("20261123101000_unified_permission_wrappers.sql");
const sqlMap = Object.fromEntries([...TIER_SQL.matchAll(/when '([A-Z]+)' then '([A-Z]+)'/g)].map((m) => [m[1], m[2]]));

check("espelho TS == CASE da migration acc_project_tier (todos os papéis, incluindo legados)", () => {
  assert.deepEqual(Object.keys(sqlMap).sort(), ["ADMIN", "ADMINISTRADOR", "COLABORADOR", "EDITOR", "GERENTE", "GESTOR", "LEITURA", "VIEWER"]);
  for (const [role, tier] of Object.entries(sqlMap)) assert.equal(T.projectTierFor(role), tier, role);
});

check("fail-closed no espelho: sem papel, papel desconhecido, membership inativa/pendente => NONE", () => {
  for (const x of [null, undefined, "", "XPTO", "administrador"]) assert.equal(T.projectTierFor(x), "NONE", String(x));
  for (const st of ["INACTIVE", "PENDING", "", null]) assert.equal(T.projectTierFor("ADMINISTRADOR", st), "NONE", String(st));
  assert.equal(T.projectTierFor("LEITURA"), "READ");
});

check("migration exige membership ACTIVE do próprio projeto, auth.uid(), security definer, search_path vazio e só authenticated", () => {
  assert.match(TIER_SQL, /pm\.status = 'ACTIVE'/);
  assert.match(TIER_SQL, /pm\.user_id = auth\.uid\(\)/);
  assert.match(TIER_SQL, /pm\.project_id = p_project_id/);
  assert.match(TIER_SQL, /security definer\s+set search_path = ''/);
  assert.match(TIER_SQL, /revoke all on function public\.acc_project_tier\(uuid\) from public, anon;/);
  assert.match(TIER_SQL, /grant execute on function public\.acc_project_tier\(uuid\) to authenticated;/);
  assert.doesNotMatch(TIER_SQL, /to anon|to public/i);
});

check("wrappers delegam a acc_project_tier e não repetem lista de papéis", () => {
  const bodies = WRAP_SQL.replace(/--.*$/gm, "");
  assert.equal((bodies.match(/acc_project_tier/g) ?? []).length >= 7, true);
  assert.doesNotMatch(bodies, /'ADMINISTRADOR'|'GESTOR'|'GERENTE'|'COLABORADOR'|'LEITURA'/);
});

check("hasInsuranceLevel == nível da matriz; LEITURA só lê; COLABORADOR registra mas não gere; GESTOR/GERENTE gerem mas não aprovam; ADMINISTRADOR aprova", () => {
  const exp = { LEITURA: [1, 0, 0, 0], COLABORADOR: [1, 1, 0, 0], GESTOR: [1, 1, 1, 0], GERENTE: [1, 1, 1, 0], ADMINISTRADOR: [1, 1, 1, 1] };
  for (const [role, v] of Object.entries(exp)) {
    const got = ["READ", "REGISTER", "MANAGE", "ADMIN"].map((l) => Number(IP.hasInsuranceLevel(role, l)));
    assert.deepEqual(got, v, role);
  }
  for (const x of [null, undefined, "XPTO"]) assert.equal(IP.hasInsuranceLevel(x, "READ"), false, String(x));
  assert.deepEqual(IP.insuranceCapabilities("GERENTE"), { read: true, register: true, manage: true, admin: false });
});

check("etapas do sinistro que exigem MANAGE: TS == SQL (20261123102000) e levelForOp/claimStageLevel coerentes", () => {
  const sql = mig("20261123102000_insurance_claim_advance_manage_stages.sql");
  const m = /case when p_to_stage in \(([^)]*)\) then 'MANAGE' else 'REGISTER' end/.exec(sql);
  assert.ok(m, "regra de etapa não encontrada na migration");
  const sqlStages = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual([...IP.INSURANCE_CLAIM_MANAGE_STAGES].sort(), sqlStages);
  for (const st of ["EXPECTATIVA", "AVISO", "RECLAMACAO", "DOC_COMPLEMENTAR", "REGULACAO"]) assert.equal(IP.claimStageLevel(st), "REGISTER", st);
  for (const st of sqlStages) assert.equal(IP.claimStageLevel(st), "MANAGE", st);
  assert.equal(IP.claimStageLevel(null), "REGISTER");
});

check("roleSatisfies (Qualidade/Garantias) == nível da matriz", () => {
  for (const [role, reg, man] of [["LEITURA", false, false], ["COLABORADOR", true, false], ["GESTOR", true, true], ["GERENTE", true, true], ["ADMINISTRADOR", true, true], [null, false, false]]) {
    assert.equal(Q.roleSatisfies(role, "REGISTER"), reg, `${role} REGISTER`);
    assert.equal(Q.roleSatisfies(role, "MANAGE"), man, `${role} MANAGE`);
  }
});

check("documento da matriz existe e lista todos os perfis e as três áreas", () => {
  const doc = readFileSync(path.join(here, "..", "docs", "permissoes-matriz-central.md"), "utf8");
  for (const w of ["acc_project_tier", "LEITURA", "COLABORADOR", "GESTOR", "GERENTE", "ADMINISTRADOR", "Qualidade", "Garantias", "Seguros", "Lacuna", "CASO 31", "CASO 37", "CASO 39"]) {
    assert.ok(doc.includes(w), `faltou "${w}" em docs/permissoes-matriz-central.md`);
  }
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
