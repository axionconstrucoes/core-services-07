// "Copiar estrutura de outro projeto" — categoria EQUIPE E PERFIS DE ACESSO (lógica pura + serviço com store em memória).
// Cobre: exclusões por padrão (CRM, compartilhadas, teste), perfil proposto (nunca Administrador por padrão), prévia
// (novos / já vinculadas / conflitos / bloqueadas), autorização na ORIGEM e no DESTINO, confirmação obrigatória, assinatura da
// seleção (prévia obsoleta), idempotência, e invariantes estáticas (sem service-role, sem convite/e-mail, RPC aditiva).
// Sem rede e sem banco. Uso: node scripts/test-copy-project-team.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const STUBS = { "@axion/db/server": "export async function createSupabaseServerClient(){ return {}; }" };
register(
  "data:text/javascript," +
    encodeURIComponent(`const STUBS=${JSON.stringify(STUBS)};
export async function resolve(s,c,n){ if(STUBS[s]) return { url:"data:text/javascript,"+encodeURIComponent(STUBS[s]), shortCircuit:true }; return n(s,c); }`),
  import.meta.url
);

const plan = await import("../apps/web/lib/projects/copy-structure/team-plan.ts");
const svc = await import("../apps/web/lib/projects/copy-structure/service.ts");
const store = await import("../apps/web/lib/projects/copy-structure/supabase-store.ts");
const { availableStructureCategories, STRUCTURE_CATEGORIES } = await import("../apps/web/lib/projects/copy-structure/categories.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 260)}`); failed += 1; }
}

const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const SRC = "10000000-0000-4000-8000-000000000001";
const DST = "10000000-0000-4000-8000-000000000002";
const member = (n, name, email, permission, area, over = {}) => ({ userId: U(n), name, email, origin: "AXION_INTERNO", title: null, permission, area, status: "ACTIVE", ...over });
// Cenário sintético inspirado no pedido: equipe de uma obra (origem) -> outra obra (destino); o executor é Administrador de ambos.
const WEG = [
  member(1, "Admin Executor", "admin.executor@empresa.com.br", "ADMINISTRADOR", "DIRETORIA"),
  member(2, "Gerente Um", "gerente.um@empresa.com.br", "GESTOR", "PLANEJAMENTO"),
  member(3, "Gerente Dois", "gerente.dois@empresa.com.br", "GESTOR", "ENGENHARIA"),
  member(4, "Colaborador Um", "colaborador.um@empresa.com.br", "COLABORADOR", "COMERCIAL"),
  member(5, "CRM Empresa", "crm@empresa.com.br", "ADMINISTRADOR", "DIRETORIA"),
  member(6, "Admin Dois", "admin.dois@empresa.com.br", "ADMINISTRADOR", "ADMINISTRATIVO"),
  member(7, "teste-admin-001@example.com", "teste-admin-001@example.com", "ADMINISTRADOR", "DIRETORIA", { origin: "TERCEIRO" }),
  member(8, "Inativo Antigo", "antigo@empresa.com.br", "COLABORADOR", "COMPRAS", { status: "INACTIVE" }),
];
const NEWPORT = [{ userId: U(1), permission: "ADMINISTRADOR", area: "DIRETORIA", status: "ACTIVE" }];
const row = (candidates, n) => candidates.find((c) => c.userId === U(n));

console.log("\n======================================\nCopiar estrutura — equipe e perfis\n======================================");

await check("registro de categorias: só 'team' disponível (outras categorias não implementadas)", () => {
  assert.deepEqual(availableStructureCategories().map((c) => c.id), ["team"]);
  assert.equal(STRUCTURE_CATEGORIES.every((c) => c.available), true);
});

await check("exclusão por padrão: CRM, conta compartilhada, usuário de teste e inativo", () => {
  assert.equal(plan.classifyExclusion({ name: "CRM Empresa", email: "crm@empresa.com.br", status: "ACTIVE" }), "SHARED_ACCOUNT");
  assert.equal(plan.classifyExclusion({ name: "empresa oficial", email: "empresa@empresa.com.br", status: "ACTIVE" }), "SHARED_ACCOUNT");
  assert.equal(plan.classifyExclusion({ name: "Qualquer", email: "contato@empresa.com.br", status: "ACTIVE" }), "SHARED_ACCOUNT");
  assert.equal(plan.classifyExclusion({ name: "t", email: "teste-origin-002@example.com", status: "ACTIVE" }), "TEST_USER");
  assert.equal(plan.classifyExclusion({ name: "t", email: "login-test@empresa-test.local", status: "ACTIVE" }), "TEST_USER");
  assert.equal(plan.classifyExclusion({ name: "x", email: "pessoa@empresa.com.br", status: "INACTIVE" }), "INACTIVE_IN_SOURCE");
});

await check("pessoas reais NÃO são excluídas (nomes parecidos com termos de teste/CRM)", () => {
  for (const [name, email] of [["Gerente Dois", "gerente.dois@empresa.com.br"], ["Admin Dois", "admin.dois@empresa.com.br"], ["Colaborador Um", "colaborador.um@empresa.com.br"], ["Teresa Testa", "teresa.testa@empresa.com.br"], ["Crimilda", "crimilda@empresa.com.br"]]) {
    assert.equal(plan.classifyExclusion({ name, email, status: "ACTIVE" }), null, name);
  }
});

await check("perfil proposto: Administrador vira Gerente (exige decisão explícita); GESTOR=Gerente; desconhecido=Leitura", () => {
  assert.deepEqual(plan.proposePermission("ADMINISTRADOR"), { permission: "GERENTE", adminNeedsExplicitDecision: true });
  assert.deepEqual(plan.proposePermission("GESTOR"), { permission: "GERENTE", adminNeedsExplicitDecision: false });
  assert.deepEqual(plan.proposePermission("COLABORADOR"), { permission: "COLABORADOR", adminNeedsExplicitDecision: false });
  assert.deepEqual(plan.proposePermission("LEITURA"), { permission: "LEITURA", adminNeedsExplicitDecision: false });
  assert.deepEqual(plan.proposePermission("QUALQUER_COISA"), { permission: "LEITURA", adminNeedsExplicitDecision: false });
});

await check("candidatos origem→destino: você=SELF, CRM/teste/inativo fora do padrão, nenhum Administrador proposto", () => {
  const c = plan.buildCandidates(WEG, NEWPORT, U(1));
  assert.equal(row(c, 1).state, "SELF");
  assert.equal(row(c, 1).defaultSelected, false);
  assert.equal(row(c, 5).exclusion, "SHARED_ACCOUNT");
  assert.equal(row(c, 7).exclusion, "TEST_USER");
  assert.equal(row(c, 8).exclusion, "INACTIVE_IN_SOURCE");
  const defaults = c.filter((x) => x.defaultSelected).map((x) => x.name).sort();
  assert.deepEqual(defaults, ["Admin Dois", "Gerente Dois", "Colaborador Um", "Gerente Um"].sort());
  assert.equal(c.some((x) => x.proposedPermission === "ADMINISTRADOR"), false);
  assert.equal(row(c, 6).adminNeedsExplicitDecision, true);
  assert.equal(row(c, 2).proposedPermission, "GERENTE");
  assert.equal(row(c, 4).proposedArea, "COMERCIAL");
});

const sel = (n, permission, area, extra = {}) => ({ userId: U(n), permission, area, ...extra });

await check("prévia: novos vínculos, já vinculadas e conflitos (nunca sobrescreve)", () => {
  const dest = [...NEWPORT,
    { userId: U(2), permission: "GERENTE", area: "PLANEJAMENTO", status: "ACTIVE" },   // igual ao proposto -> já vinculada
    { userId: U(3), permission: "COLABORADOR", area: "ENGENHARIA", status: "ACTIVE" }, // perfil diferente -> conflito
    { userId: U(4), permission: "COLABORADOR", area: "COMERCIAL", status: "INACTIVE" }, // inativo no destino -> conflito
  ];
  const c = plan.buildCandidates(WEG, dest, U(1));
  const p = plan.buildPreview([sel(2, "GERENTE", "PLANEJAMENTO"), sel(3, "GERENTE", "ENGENHARIA"), sel(4, "COLABORADOR", "COMERCIAL"), sel(6, "GERENTE", "ADMINISTRATIVO")], c);
  assert.deepEqual(p.newLinks.map((i) => i.userId), [U(6)]);
  assert.deepEqual(p.alreadyLinked.map((i) => i.userId), [U(2)]);
  assert.deepEqual(p.conflicts.map((i) => i.userId).sort(), [U(3), U(4)].sort());
  assert.equal(p.conflicts.find((i) => i.userId === U(3)).existingPermission, "COLABORADOR");
  assert.deepEqual(p.executable.map((i) => i.userId), [U(6)]); // só o novo é executável
});

await check("prévia: bloqueios (excluída, Administrador sem confirmação, área inválida, você, fora da origem, duplicada)", () => {
  const c = plan.buildCandidates(WEG, NEWPORT, U(1));
  const p = plan.buildPreview([
    sel(5, "GERENTE", "DIRETORIA"),                 // CRM sem 'incluir mesmo assim'
    sel(6, "ADMINISTRADOR", "ADMINISTRATIVO"),     // Administrador sem confirmação
    sel(4, "COLABORADOR", "AREA_INEXISTENTE"),     // área inválida
    sel(1, "GERENTE", "DIRETORIA"),                // você
    sel(8, "COLABORADOR", "COMPRAS"),              // inativo na origem
    sel(9, "COLABORADOR", "COMPRAS"),              // fora da origem
    sel(2, "GERENTE", "PLANEJAMENTO"), sel(2, "GERENTE", "PLANEJAMENTO"), // duplicada
  ], c);
  const reasons = Object.fromEntries(p.blocked.map((i) => [i.userId + (i.reason === "DUPLICATE_SELECTION" ? "d" : ""), i.reason]));
  assert.equal(reasons[U(5)], "EXCLUDED_BY_DEFAULT");
  assert.equal(reasons[U(6)], "ADMIN_NOT_CONFIRMED");
  assert.equal(reasons[U(4)], "INVALID_AREA");
  assert.equal(reasons[U(1)], "SELF");
  assert.equal(reasons[U(8)], "NOT_IN_SOURCE");
  assert.equal(reasons[U(9)], "NOT_IN_SOURCE");
  assert.equal(reasons[U(2) + "d"], "DUPLICATE_SELECTION");
  assert.deepEqual(p.executable.map((i) => i.userId), [U(2)]);
});

await check("inclusão deliberada: conta excluída e Administrador entram só com confirmação explícita", () => {
  const c = plan.buildCandidates(WEG, NEWPORT, U(1));
  const p = plan.buildPreview([sel(5, "GERENTE", "DIRETORIA", { includeExcluded: true }), sel(6, "ADMINISTRADOR", "ADMINISTRATIVO", { explicitAdmin: true })], c);
  assert.deepEqual(p.executable.map((i) => i.userId).sort(), [U(5), U(6)].sort());
  assert.equal(p.executable.find((i) => i.userId === U(6)).permission, "ADMINISTRADOR");
});

await check("assinatura da seleção: independe da ordem e muda com perfil/área", () => {
  const a = [sel(2, "GERENTE", "PLANEJAMENTO"), sel(3, "COLABORADOR", "ENGENHARIA")];
  assert.equal(svc.signatureDigest(a), svc.signatureDigest([...a].reverse()));
  assert.notEqual(svc.signatureDigest(a), svc.signatureDigest([sel(2, "COLABORADOR", "PLANEJAMENTO"), a[1]]));
});

// ---------- serviço com store em memória ----------
function makeStore({ actor = U(1), source = WEG, adminOf = [SRC, DST], destinationMembers = NEWPORT } = {}) {
  const state = { dest: destinationMembers.map((m) => ({ ...m })), calls: { copy: 0 }, lastItems: null };
  return {
    state,
    getActorId: async () => actor,
    getActiveMembership: async (projectId, userId) => (userId === actor && adminOf.includes(projectId) ? { permission: "ADMINISTRADOR", status: "ACTIVE" } : userId === actor ? { permission: "COLABORADOR", status: "ACTIVE" } : null),
    listAdminProjects: async () => [],
    listSourceMembers: async () => source,
    listDestinationMembers: async () => state.dest.map((m) => ({ ...m })),
    isEmailIngestionEnabled: async () => false,
    copyTeam: async (_s, _d, items) => {
      state.calls.copy += 1; state.lastItems = items;
      const out = [];
      for (const it of items) {
        if (state.dest.some((m) => m.userId === it.user_id)) { out.push({ userId: it.user_id, status: "ALREADY_MEMBER" }); continue; }
        state.dest.push({ userId: it.user_id, permission: it.permission, area: it.area, status: "ACTIVE" });
        out.push({ userId: it.user_id, status: "ADDED" });
      }
      return { added: out.filter((o) => o.status === "ADDED").length, alreadyMember: out.filter((o) => o.status === "ALREADY_MEMBER").length, skipped: 0, errors: 0, items: out };
    },
  };
}
const rejects = async (p, code) => { try { await p; } catch (e) { assert.equal(e.code, code); return; } throw new Error(`deveria rejeitar com ${code}`); };
const SELECTION = [sel(2, "GERENTE", "PLANEJAMENTO"), sel(3, "GERENTE", "ENGENHARIA"), sel(4, "COLABORADOR", "COMERCIAL"), sel(6, "GERENTE", "ADMINISTRATIVO")];

await check("autorização no servidor: sem sessão, não-admin no destino, não-admin na origem, mesmo projeto, ids inválidos", async () => {
  await rejects(svc.loadTeamStep(makeStore({ actor: null }), { sourceId: SRC, destinationId: DST }), "AUTH_REQUIRED");
  await rejects(svc.loadTeamStep(makeStore({ adminOf: [SRC] }), { sourceId: SRC, destinationId: DST }), "DESTINATION_FORBIDDEN");
  await rejects(svc.loadTeamStep(makeStore({ adminOf: [DST] }), { sourceId: SRC, destinationId: DST }), "SOURCE_FORBIDDEN");
  await rejects(svc.loadTeamStep(makeStore({ adminOf: [] }), { sourceId: SRC, destinationId: DST }), "DESTINATION_FORBIDDEN");
  await rejects(svc.loadTeamStep(makeStore(), { sourceId: SRC, destinationId: SRC }), "SAME_PROJECT");
  await rejects(svc.loadTeamStep(makeStore(), { sourceId: "x", destinationId: DST }), "INVALID_INPUT");
});

await check("prévia não grava nada (copyTeam nunca é chamado)", async () => {
  const s = makeStore();
  const p = await svc.previewTeamCopy(s, { sourceId: SRC, destinationId: DST, selection: SELECTION });
  assert.equal(p.preview.newLinks.length, 4);
  assert.equal(s.state.calls.copy, 0);
});

await check("execução exige confirmação, assinatura igual à prévia e seleção não vazia", async () => {
  const s = makeStore();
  const base = { sourceId: SRC, destinationId: DST, selection: SELECTION };
  const { signature } = await svc.previewTeamCopy(s, base);
  await rejects(svc.executeTeamCopy(s, { ...base, confirmed: false, signature }), "NOT_CONFIRMED");
  await rejects(svc.executeTeamCopy(s, { ...base, confirmed: true, signature: "outra" }), "PREVIEW_STALE");
  await rejects(svc.executeTeamCopy(s, { ...base, selection: [], confirmed: true, signature }), "INVALID_INPUT");
  assert.equal(s.state.calls.copy, 0);
});

await check("execução: só o executável vai ao banco, sem Administrador por padrão; reexecutar não duplica", async () => {
  const s = makeStore();
  const input = { sourceId: SRC, destinationId: DST, selection: [...SELECTION, sel(5, "GERENTE", "DIRETORIA")] }; // CRM bloqueada
  const { signature } = await svc.previewTeamCopy(s, input);
  const done = await svc.executeTeamCopy(s, { ...input, confirmed: true, signature });
  assert.equal(done.result.added, 4);
  assert.equal(s.state.calls.copy, 1);
  assert.deepEqual(s.state.lastItems.map((i) => i.user_id).sort(), [U(2), U(3), U(4), U(6)].sort()); // CRM fora
  assert.equal(s.state.lastItems.some((i) => i.permission === "ADMINISTRADOR" || i.explicit_admin), false);
  // repetir: tudo já vinculado -> nada a copiar e nenhuma nova chamada ao banco
  const again = await svc.previewTeamCopy(s, input);
  assert.equal(again.preview.newLinks.length, 0);
  assert.equal(again.preview.alreadyLinked.length, 4);
  await rejects(svc.executeTeamCopy(s, { ...input, confirmed: true, signature: again.signature }), "NOTHING_TO_COPY");
  assert.equal(s.state.calls.copy, 1);
  assert.equal(s.state.dest.length, 5); // executor + 4, sem duplicidade
});

await check("a execução reautoriza e recalcula: seleção alterada depois da prévia => PREVIEW_STALE", async () => {
  const s = makeStore();
  const input = { sourceId: SRC, destinationId: DST, selection: SELECTION };
  const { signature } = await svc.previewTeamCopy(s, input);
  s.state.dest.push({ userId: U(4), permission: "COLABORADOR", area: "COMERCIAL", status: "ACTIVE" }); // outra pessoa vinculou no meio
  await rejects(svc.executeTeamCopy(s, { ...input, confirmed: true, signature }), "PREVIEW_STALE");
  assert.equal(s.state.calls.copy, 0);
  // perdeu o acesso de Administrador no destino entre a prévia e a execução
  const s2 = makeStore();
  const sig2 = (await svc.previewTeamCopy(s2, input)).signature;
  const lost = { ...s2, getActiveMembership: async (p, u) => (p === SRC ? { permission: "ADMINISTRADOR", status: "ACTIVE" } : { permission: "GERENTE", status: "ACTIVE" }) };
  await rejects(svc.executeTeamCopy(lost, { ...input, confirmed: true, signature: sig2 }), "DESTINATION_FORBIDDEN");
});

await check("adaptador: resposta da RPC é mapeada; status desconhecido vira ERROR", () => {
  const r = store.mapCopyRpcResult({ added: 2, already_member: 1, skipped: 1, errors: 1, items: [{ user_id: U(2), status: "ADDED" }, { user_id: U(3), status: "XYZ", message: "m" }] });
  assert.deepEqual([r.added, r.alreadyMember, r.skipped, r.errors], [2, 1, 1, 1]);
  assert.equal(r.items[1].status, "ERROR");
  assert.deepEqual(store.mapCopyRpcResult(null), { added: 0, alreadyMember: 0, skipped: 0, errors: 0, items: [] });
});

// ---------- invariantes estáticas ----------
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const FILES = ["apps/web/lib/projects/copy-structure/team-plan.ts", "apps/web/lib/projects/copy-structure/service.ts", "apps/web/lib/projects/copy-structure/supabase-store.ts", "apps/web/lib/projects/copy-structure/categories.ts", "apps/web/app/projetos/[projectId]/copiar-estrutura/actions.ts", "apps/web/app/projetos/[projectId]/copiar-estrutura/page.tsx", "apps/web/components/projects/copy-structure-wizard.tsx"];

await check("sem service-role, sem INSERT/UPDATE direto em memberships, sem envio de convite/e-mail no código novo", () => {
  for (const f of FILES) {
    const src = read(f).replace(/\/\/.*$/gm, "");
    assert.equal(/@axion\/db\/admin|createSupabaseAdminClient|SUPABASE_SECRET|service_role/i.test(src), false, `${f}: service-role`);
    assert.equal(/\.from\("project_memberships"\)\s*\.(insert|update|upsert|delete)/.test(src.replace(/\s+/g, " ")), false, `${f}: escrita direta`);
    assert.equal(/pre_register_project_member|project_member_invitations|sendEmail|nodemailer|gmail|notification|webhook/i.test(src), false, `${f}: convite/e-mail`);
  }
});

await check("ações: todas usam guard() (autorização + só erros conhecidos) e 'use server'", () => {
  const a = read("apps/web/app/projetos/[projectId]/copiar-estrutura/actions.ts");
  assert.equal(a.trimStart().startsWith('"use server"'), true);
  const fns = (a.match(/^export async function /gm) ?? []).length;
  assert.equal(fns, 3);
  assert.equal((a.match(/return guard\(/g) ?? []).length, 2); // load e preview
  assert.equal((a.match(/await guard\(/g) ?? []).length, 1); // execute (revalida a página depois)
});

await check("página e rotas: guarda de Administrador do destino no servidor; links só para admin", () => {
  const page = read("apps/web/app/projetos/[projectId]/copiar-estrutura/page.tsx");
  assert.match(page, /permission !== "ADMINISTRADOR"/);
  const list = read("apps/web/app/projetos/page.tsx");
  assert.match(list, /adminProjectIds\.has\(project\.id\)[\s\S]{0,400}copiar-estrutura/);
  assert.match(read("apps/web/app/projetos/actions.ts"), /copyStructure/);
  // Cadastro de obra: concluir OU pular a cópia continua para o Start-up (destino fixo, nunca vindo do navegador).
  assert.match(page, /origem === "cadastro" \? `\/\$\{project\.id\}\/startup`/);
  assert.match(page, /fromRegistration=\{origem === "cadastro"\}/);
  const wiz = read("apps/web/components/projects/copy-structure-wizard.tsx");
  assert.match(wiz, /Pular a cópia e continuar para o Start-up/);
  assert.match(wiz, /Continuar para o Start-up/);
});

await check("migration da RPC: aditiva, valida Administrador nos DOIS projetos, reusa add_project_member, sem convites/e-mail/Drive/documentos", () => {
  const sql = read("supabase/migrations/20261111120000_copy_project_team.sql");
  const code = sql.replace(/--.*$/gm, "");
  assert.equal((code.match(/has_project_permission\(/g) ?? []).length, 2);
  assert.match(code, /perform public\.add_project_member\(/);
  assert.match(code, /revoke all on function public\.copy_project_team\(uuid, uuid, jsonb\) from anon/);
  assert.match(code, /grant execute on function public\.copy_project_team\(uuid, uuid, jsonb\) to authenticated/);
  assert.match(code, /security definer[\s\S]*set search_path = ''/);
  assert.equal(/\b(delete|truncate|drop)\b/i.test(code.replace(/format\([\s\S]*?\);/g, "")), false);
  assert.equal(/update public\.project_memberships|insert into public\.project_memberships/.test(code), false); // só via add_project_member
  assert.equal(/project_member_invitations|notification|email|drive|document|alert|credential|token/i.test(code), false);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
