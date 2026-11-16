// Participantes por projeto: diff estado atual -> plano, protecao do ultimo admin, isolamento por project_id,
// elegibilidade da Matriz de SLA e invariantes de fonte (sem DELETE, exige permissao/confirmacao, fail-closed).
// Sem rede e sem banco. Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-project-participants.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const m = await import("../apps/web/lib/users/participant-selection.ts");

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log(`OK   ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 240)}`); failed += 1; }
}
const P = "p1", OTHER = "p2";
const mem = (id, over = {}) => ({ projectId: P, userId: id, status: "ACTIVE", permission: "COLABORADOR", area: "ENGENHARIA", user: { name: id.toUpperCase(), email: `${id}@axion.com.br` }, ...over });
const members = [mem("adm", { permission: "ADMINISTRADOR" }), mem("a"), mem("b"), mem("c", { status: "INACTIVE" }), mem("x", { projectId: OTHER })];
const inv = [
  { id: "i1", projectId: P, status: "PENDING", name: "Pend", email: "pend@axion.com.br", permission: "COLABORADOR", area: "COMPRAS" },
  { id: "i2", projectId: P, status: "CANCELLED", name: "Canc", email: "c@axion.com.br", permission: "COLABORADOR", area: null },
  { id: "i3", projectId: OTHER, status: "PENDING", name: "Outra", email: "o@axion.com.br", permission: "COLABORADOR", area: null },
];
const cands = [{ id: "n1", name: "Novo", email: "n1@axion.com.br" }, { id: "a", name: "dup", email: "a@axion.com.br" }];
const base = { projectId: P, members, candidateIds: ["n1"], currentUserId: "me" };

check("selecao inicial = estado atual => plano vazio (nada muda sozinho)", () => {
  const rows = m.buildParticipantRows(P, members, inv, cands);
  const plan = m.planParticipantChanges({ ...base, selectedIds: m.initialSelection(rows) });
  assert.equal(plan.operations.length, 0); assert.equal(plan.blocked.length, 0);
});
check("linhas: so o projeto, pendente do projeto, candidato nao duplica membro", () => {
  const rows = m.buildParticipantRows(P, members, inv, cands);
  const ids = rows.map((r) => r.id).sort();
  assert.deepEqual(ids, ["a", "adm", "b", "c", "i1", "n1"]);
  assert.equal(rows.find((r) => r.id === "i1").status, "PENDING");
});
check("desmarcar => DEACTIVATE; marcar inativo => REACTIVATE; marcar candidato => ADD", () => {
  const plan = m.planParticipantChanges({ ...base, selectedIds: ["adm", "b", "c", "n1"], additions: { n1: { permission: "COLABORADOR", area: "COMPRAS" } } });
  const t = plan.operations.map((o) => `${o.type}:${o.userId}`).sort();
  assert.deepEqual(t, ["ADD:n1", "DEACTIVATE:a", "REACTIVATE:c"]);
  assert.ok(plan.operations.findIndex((o) => o.type === "DEACTIVATE") > plan.operations.findIndex((o) => o.type === "ADD"));
});
check("adicao sem papel/area ou com papel invalido e bloqueada", () => {
  for (const add of [{}, { permission: "COLABORADOR" }, { permission: "LEITURA", area: "COMPRAS" }]) {
    const plan = m.planParticipantChanges({ ...base, selectedIds: ["adm", "a", "b", "n1"], additions: { n1: add } });
    assert.ok(plan.blocked.some((b) => b.reason === "ADDITION_INCOMPLETE")); assert.ok(!plan.operations.some((o) => o.type === "ADD"));
  }
});
check("protege ultimo administrador", () => {
  const plan = m.planParticipantChanges({ ...base, selectedIds: ["a", "b"] });
  assert.ok(plan.blocked.some((b) => b.reason === "LAST_ADMIN" && b.userId === "adm"));
  assert.ok(!plan.operations.some((o) => o.userId === "adm"));
});
check("permite desativar admin se outro admin permanece (ou e adicionado)", () => {
  const two = [...members, mem("adm2", { permission: "ADMINISTRADOR" })];
  const ok = m.planParticipantChanges({ ...base, members: two, selectedIds: ["adm2", "a", "b"] });
  assert.ok(ok.operations.some((o) => o.type === "DEACTIVATE" && o.userId === "adm")); assert.equal(ok.blocked.length, 0);
  const add = m.planParticipantChanges({ ...base, selectedIds: ["n1", "a", "b"], additions: { n1: { permission: "ADMINISTRADOR", area: "DIRETORIA" } } });
  assert.ok(add.operations.some((o) => o.type === "DEACTIVATE" && o.userId === "adm"));
});
check("nunca altera o proprio usuario", () => {
  const self = [...members, mem("me", { permission: "ADMINISTRADOR" })];
  const plan = m.planParticipantChanges({ ...base, members: self, selectedIds: ["adm", "a", "b"] });
  assert.ok(plan.blocked.some((b) => b.reason === "SELF")); assert.ok(!plan.operations.some((o) => o.userId === "me"));
});
check("isolamento: membro de outro projeto, convite e ids desconhecidos nunca viram operacao", () => {
  const plan = m.planParticipantChanges({ ...base, selectedIds: ["adm", "a", "b", "x", "i1", "zzz"] });
  assert.equal(plan.operations.length, 0);
});
check("Matriz: so ativos + convites PENDING do projeto", () => {
  const opts = m.resolveEligibleSlaPeople(P, members, inv, (u) => `member:${u}`, (i) => `invitation:${i}`, (a) => a ?? "Sem area");
  assert.deepEqual(opts.map((o) => o.value).sort(), ["invitation:i1", "member:a", "member:adm", "member:b"]);
  assert.ok(opts.find((o) => o.value === "invitation:i1").label.includes("Aguardando primeiro login"));
});
check("filtro por busca e situacao", () => {
  const rows = m.buildParticipantRows(P, members, inv, cands);
  assert.deepEqual(m.filterParticipantRows(rows, "pend@", "ALL").map((r) => r.id), ["i1"]);
  assert.deepEqual(m.filterParticipantRows(rows, "", "INACTIVE").map((r) => r.id), ["c"]);
});

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const actions = src("apps/web/app/[projectId]/usuarios/actions.ts");
const fn = actions.slice(actions.indexOf("export async function saveProjectParticipantsAction"));
check("acao: exige administrador, confirmacao e usa so RPCs existentes; sem DELETE", () => {
  assert.ok(fn.includes('getCurrentProjectPermission(projectId)) !== "ADMINISTRADOR"'));
  assert.ok(fn.includes('formData.get("confirmed") !== "on"'));
  assert.ok(fn.includes("add_project_member") && fn.includes("set_project_member_status"));
  assert.ok(!/\.delete\(|remove_project_member|service[_-]?role|\.from\("project_memberships"\)/i.test(fn));
  assert.ok(fn.includes("planParticipantChanges"));
});
check("tela e lib nao fazem DELETE nem escrita direta", () => {
  for (const f of ["apps/web/components/users/project-participants-panel.tsx", "apps/web/lib/users/participant-selection.ts"]) {
    assert.ok(!/remove_project_member|\.from\(|\.insert\(|\.upsert\(|\.update\(|supabase\.rpc/.test(src(f)), f);
  }
});
check("candidatos: fail-closed quando a RPC nao existe; migration sem escrita e exige admin", () => {
  const a = src("apps/web/lib/users/addable-profiles.ts");
  assert.ok(a.includes("available: false, candidates: []"));
  const sql = src("supabase/migrations/20261116090000_list_addable_profiles_for_project.sql");
  assert.ok(sql.includes("has_project_permission(p_project_id, 'ADMINISTRADOR')"));
  assert.ok(!/\b(insert|update|delete)\b\s+(into|from|public)/i.test(sql.replace(/--.*$/gm, "")));
});
check("paginas usam a elegibilidade centralizada da Matriz", () => {
  for (const f of ["apps/web/app/[projectId]/usuarios/page.tsx", "apps/web/app/[projectId]/acoes/configuracao/page.tsx"]) assert.ok(src(f).includes("resolveEligibleSlaPeople"), f);
});
console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
