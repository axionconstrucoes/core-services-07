// Jurídico IA restrito a administradores ativos + "Minhas consultas" com exclusão pelo autor.
//  - banco (PostgreSQL via PGlite, função real create_precontract_workspace): administrador cria; gerente, colaborador, leitura,
//    administrador INATIVO e quem não participa são recusados;
//  - código: cada entrada (cartão, rota direta, página do espaço, ações, verificação de documentos, curadoria) repete a checagem
//    no servidor, com o critério já existente (ADMINISTRADOR ativo, lido com a sessão/RLS; nada de service_role no Jurídico);
//  - interface: botão visível "Excluir consulta" com confirmação, servidor confere autoria, lista atualizada e resposta aberta limpa.
// A exclusão pelo autor e a recusa à exclusão de consultas de outro autor (com RLS real) estão em test-legal-consultations-lib-sql.mjs
// e test-legal-consultations-privacy-sql.mjs (rodam no mesmo test:sql).
import { readFileSync } from "node:fs";
import { createLocalDb, as } from "./lib/pglite-supabase-stub.mjs";

let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ─────────────── banco: quem pode criar uma análise pré-contratual ───────────────
const U = { adm: "00000000-0000-4000-8000-0000000000a1", ger: "00000000-0000-4000-8000-0000000000b2", col: "00000000-0000-4000-8000-0000000000c3", lei: "00000000-0000-4000-8000-0000000000d4", inativo: "00000000-0000-4000-8000-0000000000e5", fora: "00000000-0000-4000-8000-0000000000f6", gestor: "00000000-0000-4000-8000-0000000000a7" };
const P = "00000000-0000-4000-8000-000000000001";
const db = await createLocalDb(["20260911120000_legal_precontract_workspaces.sql"], "alter table public.projects add column if not exists contract_number text;");
for (const [k, id] of Object.entries(U)) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3)", [id, k, `${k}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code) values ($1,'Obra Fictícia','FIC-001')", [P]);
for (const [u, perm, st] of [[U.adm, "ADMINISTRADOR", "ACTIVE"], [U.ger, "GERENTE", "ACTIVE"], [U.col, "COLABORADOR", "ACTIVE"], [U.lei, "LEITURA", "ACTIVE"], [U.inativo, "ADMINISTRADOR", "INACTIVE"], [U.gestor, "GESTOR", "ACTIVE"]]) {
  await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [P, u, perm, st]);
}
const create = async (uid) => {
  try { return await as(db, { role: "authenticated", uid }, async () => (await db.query("select public.create_precontract_workspace('Minuta Fictícia','Cliente Fictício') as id")).rows[0].id); }
  catch (e) { return `ERRO: ${e.message}`; }
};
const r = {};
for (const k of Object.keys(U)) r[k] = await create(U[k]);
t("banco: administrador ativo cria a análise pré-contratual", /^[0-9a-f-]{36}$/.test(r.adm));
t("banco: gerente, gestor, colaborador e leitura são RECUSADOS ('Somente administradores…')", ["ger", "gestor", "col", "lei"].every((k) => /Somente administradores/.test(r[k])));
t("banco: administrador INATIVO e quem não participa de nenhum projeto são RECUSADOS", /Somente administradores/.test(r.inativo) && /Somente administradores/.test(r.fora));
const none = await as(db, { role: "authenticated", uid: "" }, async () => { try { await db.query("select public.create_precontract_workspace('x','y')"); return "ok"; } catch (e) { return e.message; } });
t("banco: sem sessão é recusado ('Autenticação obrigatória')", /Autentica/.test(none));
const created = (await db.query("select workspace_type from public.projects where name='Minuta Fictícia'")).rows;
t("banco: só a chamada do administrador criou espaço (1 linha PRE_CONTRATUAL)", created.length === 1 && created[0].workspace_type === "PRE_CONTRATUAL");
const mem = (await db.query("select permission,area from public.project_memberships pm join public.projects p on p.id=pm.project_id where p.name='Minuta Fictícia'")).rows;
t("banco: o criador vira ADMINISTRADOR do espaço (área JURÍDICO)", mem.length === 1 && mem[0].permission === "ADMINISTRADOR");

// ─────────────── código: barreiras no servidor ───────────────
const access = rd("apps/web/lib/legal/access.ts");
t("critério único: ADMINISTRADOR ativo, sessão/RLS, fail closed, sem cliente de serviço", access.includes('=== "ADMINISTRADOR"') && access.includes('.eq("status", "ACTIVE")') && access.includes('.eq("permission", "ADMINISTRADOR")') && !/createSupabaseAdminClient|SUPABASE_SECRET_KEY/.test(access) && /catch/.test(access));
const projetos = rd("apps/web/app/projetos/page.tsx");
t("cartão 'Jurídico IA' na seleção de projetos só aparece para administrador ativo", projetos.includes("showLegalCard = await isActiveAdminAnywhere()") && /\{showLegalCard \? \(\s*<Link\s+href="\/juridico"/.test(projetos));
t("rota direta /juridico: 404 para quem não é administrador ativo", rd("apps/web/app/juridico/page.tsx").includes("if (!(await isActiveAdminAnywhere())) notFound();"));
const create_ = rd("apps/web/app/juridico/actions.ts");
t("ação de criar análise: checagem no servidor antes do RPC (que também recusa no banco)", create_.indexOf("isActiveAdminAnywhere") > -1 && create_.indexOf("isActiveAdminAnywhere()") < create_.indexOf("supabase.rpc"));
const pageProj = rd("apps/web/app/[projectId]/juridico/page.tsx");
t("página do espaço pré-contratual: 404 se não for administrador ativo do espaço", pageProj.includes('isPrecontract && permission !== "ADMINISTRADOR"') && pageProj.includes("notFound()"));
const ask = rd("apps/web/lib/ai/legal-query-action.ts");
t("consulta ao especialista jurídico: recusa não administrador ANTES de montar contexto ou chamar a IA", ask.includes("isActiveAdminOfProject(projectId)") && ask.indexOf("isActiveAdminOfProject(projectId)") < ask.indexOf("createSupabaseServerClient()") && ask.indexOf("isActiveAdminOfProject(projectId)") < ask.indexOf("answerLegalConsultantQuery("));
const verify = rd("apps/web/lib/legal/precontract-document-verify-action.ts");
t("verificação de documentos (individual e lote): permissão ADMINISTRADOR antes de ler qualquer arquivo", verify.includes('permission !== "ADMINISTRADOR"') && verify.indexOf('permission !== "ADMINISTRADOR"') < verify.indexOf("extractDocumentText(") );
const cur = rd("apps/web/lib/ai/precontract-curation-action.ts");
t("curadoria pré-contratual: administrador ativo do espaço antes de consultar os especialistas", cur.includes("isActiveAdminOfProject(projectId)") && cur.indexOf("isActiveAdminOfProject(projectId)") < cur.indexOf("runMultiExpertCuration("));
const legalFiles = ["apps/web/app/juridico/page.tsx", "apps/web/app/juridico/actions.ts", "apps/web/app/[projectId]/juridico/page.tsx", "apps/web/app/[projectId]/juridico/consultas-actions.ts", "apps/web/app/[projectId]/juridico/consulta/[consultationId]/page.tsx", "apps/web/lib/legal/access.ts", "apps/web/lib/legal/consultations.ts", "apps/web/lib/ai/legal-query-action.ts", "apps/web/lib/ai/precontract-curation-action.ts", "apps/web/lib/legal/precontract-document-verify-action.ts", "apps/web/lib/legal/run-precontract-upload.ts", "apps/web/lib/legal/precontract-upload-transport.ts"];
t(`revisão de service_role: nenhum dos ${legalFiles.length} caminhos do Jurídico usa o cliente de serviço (só sessão + RLS)`, legalFiles.every((f) => !/createSupabaseAdminClient|SUPABASE_SECRET_KEY|service_role/.test(rd(f))));

// ─────────────── "Minhas consultas" e exclusão ───────────────
const btn = rd("apps/web/components/legal/delete-legal-consultation-button.tsx");
t("botão visível 'Excluir consulta' com confirmação em duas etapas", btn.includes("Excluir consulta") && btn.includes("Confirmar exclusão") && btn.includes("Cancelar") && btn.includes("não pode ser desfeita"));
const act = rd("apps/web/app/[projectId]/juridico/consultas-actions.ts");
t("servidor exige confirmed=true e participação; devolve resultado sem revelar existência (mesma mensagem)", act.includes('"true"') && act.includes("getCurrentProjectPermission(projectId)") && act.includes("deleteOwnLegalConsultation(projectId, consultationId)") && (act.match(/Não foi possível excluir a consulta\./g) ?? []).length === 1 && !act.includes("redirect("));
const lib = rd("apps/web/lib/legal/consultations.ts");
t("autoria validada no servidor: exclusão filtra por author_user_id da sessão (além da RLS)", /\.delete\(\)[\s\S]*\.eq\("author_user_id", userId\)/.test(lib) && lib.includes("supabase.auth.getUser()"));
t("depois de excluir: lista atualizada (replace da rota com aviso) e evento que limpa a resposta aberta", btn.includes("router.replace(`/${projectId}/juridico?consulta=excluida`)") && btn.includes("LEGAL_CONSULTATION_DELETED_EVENT") && btn.includes("dispatchEvent"));
const panel = rd("apps/web/components/ai/expert-query-panel.tsx");
t("resposta aberta é limpa só quando o consultationId coincide", panel.includes("acc:legal-consultation-deleted") && panel.includes("rawState.consultationId === dismissedId ? initialState : rawState"));
t("a consulta jurídica devolve o id gravado (permite o vínculo resposta aberta ↔ histórico)", ask.includes("consultationId: saved.id") && rd("apps/web/lib/ai/expert-query-state.ts").includes("consultationId?: string | null"));
const hist = rd("apps/web/components/legal/legal-consultation-history.tsx");
t("lista 'Minhas consultas': cada registro do autor tem Abrir e o botão 'Excluir consulta'", hist.includes("<DeleteLegalConsultationButton projectId={projectId} consultationId={item.id} />") && hist.includes("Minhas consultas jurídicas"));
t("tela da consulta (só autor) volta à lista após excluir", rd("apps/web/app/[projectId]/juridico/consulta/[consultationId]/page.tsx").includes('afterDelete="list"'));
console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
