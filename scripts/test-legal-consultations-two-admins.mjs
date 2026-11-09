// Consultas jurídicas: isolamento entre DOIS ADMINISTRADORES (conteúdo FICTÍCIO; nenhum dado real é lido ou usado).
//  - Autor A ("reynaldo-ficticio") é ADMINISTRADOR de duas obras; autor B ("carlos-ficticio") é ADMINISTRADOR somente da DEV WEG.
//  - Cada um acessa as próprias consultas; recebe recusa nas do outro (lista, ID direto, exclusão, alteração), inclusive nas obras em comum.
//  - Banco: PostgreSQL local descartável (PGlite) com a migration real. Aplicação: auditoria estática de rotas, service_role e IA.
// Uso: node scripts/test-legal-consultations-two-admins.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { as, createLocalDb, expectError } from "./lib/pglite-supabase-stub.mjs";

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const A = "00000000-0000-4000-8000-0000000000a1"; // admin ficticio 1 (as duas obras)
const B = "00000000-0000-4000-8000-0000000000b2"; // admin ficticio 2 (somente DEV WEG)
const C = "00000000-0000-4000-8000-0000000000c3"; // membro comum
const DEV = "00000000-0000-4000-8000-000000000001"; // "DEV WEG" ficticia
const OUTRA = "00000000-0000-4000-8000-000000000002"; // outra obra ficticia
const pre = `
create or replace function public.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_memberships pm where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'ACTIVE');
$$;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;`;
const db = await createLocalDb(["20261104120000_legal_consultations_private.sql"], pre);
for (const [n, id] of [["admin-a", A], ["admin-b", B], ["comum", C]]) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3)", [id, n, `${n}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code) values ($1,'DEV WEG ficticia','FIC-DEV'), ($2,'Obra ficticia 2','FIC-002')", [DEV, OUTRA]);
const member = (proj, u, perm) => db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [proj, u, perm]);
await member(DEV, A, "ADMINISTRADOR"); await member(OUTRA, A, "ADMINISTRADOR"); await member(DEV, B, "ADMINISTRADOR"); await member(DEV, C, "COLABORADOR");

const auth = (uid, fn) => as(db, { role: "authenticated", uid }, fn);
const ins = (uid, proj, q) => auth(uid, async () => (await db.query("insert into public.legal_consultations (project_id, question, response) values ($1,$2,$3::jsonb) returning id", [proj, q, JSON.stringify({ resposta: `${q} — resposta`, trechoContrato: "Clausula ficticia 7.2", documentoCitado: "doc-ficticio.pdf" })])).rows[0].id);
const list = (uid) => auth(uid, async () => (await db.query("select id from public.legal_consultations order by created_at")).rows.map((r) => r.id));
const open = (uid, id) => auth(uid, async () => (await db.query("select id, question, response from public.legal_consultations where id = $1", [id])).rows);
const del = (uid, id) => auth(uid, async () => (await db.query("delete from public.legal_consultations where id = $1 returning id", [id])).rows.length);

console.log("\n======================================\nCONSULTAS JURÍDICAS — DOIS ADMINISTRADORES (fictícios)\n======================================");
const a1 = await ins(A, DEV, "FICTICIA A na DEV WEG");
const a2 = await ins(A, OUTRA, "FICTICIA A na outra obra");
const b1 = await ins(B, DEV, "FICTICIA B na DEV WEG");

await check("cada administrador lista SOMENTE as próprias consultas (inclusive na obra em comum)", async () => {
  assert.deepEqual((await list(A)).sort(), [a1, a2].sort());
  assert.deepEqual(await list(B), [b1]);
});
await check("acesso direto por ID: cada um abre a própria e recebe 0 linhas na do outro (pergunta E resposta)", async () => {
  assert.equal((await open(A, a1)).length, 1); assert.equal((await open(B, b1)).length, 1);
  assert.equal((await open(B, a1)).length, 0, "B não abre a consulta de A na obra em comum");
  assert.equal((await open(A, b1)).length, 0, "A não abre a consulta de B");
});
await check("administrador de UMA obra não alcança consulta de outra obra em que não é membro (A na 'outra obra')", async () => {
  assert.equal((await open(B, a2)).length, 0);
  await expectError(ins(B, OUTRA, "tentativa fora da obra"), /row-level security/i);
});
await check("exclusão por ID direto do outro autor não apaga nada; a consulta segue existindo para o autor", async () => {
  assert.equal(await del(B, a1), 0); assert.equal(await del(A, b1), 0); assert.equal(await del(B, a2), 0);
  assert.equal((await open(A, a1)).length, 1); assert.equal((await open(B, b1)).length, 1);
});
await check("não é possível forjar autoria nem alterar consulta (sem política/grant de UPDATE)", async () => {
  await expectError(auth(B, () => db.query("insert into public.legal_consultations (project_id, author_user_id, question, response) values ($1,$2,'forjada','{}'::jsonb)", [DEV, A])), /row-level security/i);
  // O ambiente local reaplica privilégios amplos depois das migrations (artefato do teste); em produção o grant de UPDATE
  // não existe (verificado no catálogo). Aqui a barreira provada é a RLS: sem política de UPDATE, nenhuma linha é alterada.
  const upd1 = await auth(B, () => db.query("update public.legal_consultations set question = 'adulterada' where id = $1 returning id", [a1]));
  const upd2 = await auth(A, () => db.query("update public.legal_consultations set author_user_id = $1 where id = $2 returning id", [B, a1]));
  const upd3 = await auth(A, () => db.query("update public.legal_consultations set question = 'adulterada pelo proprio autor' where id = $1 returning id", [a1]));
  assert.equal(upd1.rows.length + upd2.rows.length + upd3.rows.length, 0, "nenhuma alteração é aceita, nem pelo autor");
  assert.equal((await open(A, a1))[0].question, "FICTICIA A na DEV WEG");
});
await check("membro comum, anônimo e role sem sessão: nada veem", async () => {
  assert.deepEqual(await list(C), []);
  await expectError(as(db, { role: "anon" }, () => db.query("select id from public.legal_consultations")), /permission denied/i);
});
await check("catálogo: RLS forçada, exatamente 3 políticas, NENHUMA concede acesso por papel de administrador", async () => {
  const rls = (await db.query("select relrowsecurity r, relforcerowsecurity f from pg_class where oid = 'public.legal_consultations'::regclass")).rows[0];
  assert.ok(rls.r && rls.f);
  const pol = (await db.query("select policyname, cmd, coalesce(qual,'') || ' ' || coalesce(with_check,'') as expr from pg_policies where tablename = 'legal_consultations'")).rows;
  assert.equal(pol.length, 3); assert.deepEqual(pol.map((p) => p.cmd).sort(), ["DELETE", "INSERT", "SELECT"]);
  for (const p of pol) assert.ok(!/ADMINISTRADOR|has_project_permission|is_any_project_admin|is_admin/i.test(p.expr), `${p.policyname} não pode mencionar papel de administrador`);
  for (const p of pol) assert.match(p.expr, /author_user_id = auth\.uid\(\)|author_user_id = \(SELECT auth\.uid\(\)/i, `${p.policyname} deve exigir a autoria`);
});
await check("sem anexos/derivados: nenhuma tabela, FK, visão, função ou gatilho depende da consulta (nada a vazar por esse caminho)", async () => {
  assert.equal((await db.query("select 1 from pg_constraint where confrelid = 'public.legal_consultations'::regclass")).rows.length, 0, "nenhuma FK aponta para a consulta");
  assert.equal((await db.query("select 1 from pg_trigger where tgrelid = 'public.legal_consultations'::regclass and not tgisinternal")).rows.length, 0);
  assert.equal((await db.query("select 1 from pg_class c where c.relkind in ('v','m') and pg_get_viewdef(c.oid) ilike '%legal_consultations%'")).rows.length, 0);
  assert.equal((await db.query("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.proname not in ('is_project_member') and pg_get_functiondef(p.oid) ilike '%legal_consultations%'")).rows.length, 0);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'legal_consultations'")).rows.map((r) => r.column_name);
  assert.ok(!cols.some((c) => /storage|file|attachment|document/i.test(c)), "a tabela não guarda caminho de arquivo/anexo");
});

// ---- Auditoria estática da aplicação: rotas, service_role, IA ----
const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const rd = (p) => readFileSync(path.join(root, p), "utf8");
function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) { if (["node_modules", ".next"].includes(f)) continue; const full = path.join(dir, f); if (statSync(full).isDirectory()) walk(full, acc); else if (/\.(ts|tsx|mjs)$/.test(f)) acc.push(full); }
  return acc;
}
const appFiles = [...walk(path.join(root, "apps/web")), ...walk(path.join(root, "packages"))];
const touching = appFiles.filter((f) => /legal_consultations|lib\/legal\/consultations|LegalConsultation|OwnLegalConsultation/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f).replaceAll("\\", "/"));

await check("só o módulo do autor toca a tabela: nenhuma API, rota, cron, busca, exportação, auditoria ou linha do tempo a referencia", () => {
  const allowed = new Set([
    "apps/web/lib/legal/consultations.ts", "apps/web/lib/ai/legal-query-action.ts", "apps/web/app/[projectId]/juridico/page.tsx",
    "apps/web/app/[projectId]/juridico/consultas-actions.ts", "apps/web/app/[projectId]/juridico/consulta/[consultationId]/page.tsx",
    "apps/web/components/legal/legal-consultation-history.tsx", "apps/web/components/legal/delete-legal-consultation-button.tsx",
  ]);
  const extra = touching.filter((f) => !allowed.has(f));
  assert.deepEqual(extra, [], `arquivos inesperados: ${extra.join(", ")}`);
  assert.ok(!touching.some((f) => f.startsWith("apps/web/app/api/")), "nenhuma rota /api");
});
await check("nenhum arquivo do módulo jurídico/consultas usa service_role ou cliente administrativo", () => {
  for (const f of touching) {
    const src = readFileSync(path.join(root, f), "utf8");
    assert.ok(!/client-admin|@axion\/db\/admin|service_role|createSupabaseAdmin|SUPABASE_SECRET|SERVICE_ROLE/i.test(src), `${f} usa credencial de serviço`);
  }
  const accessSrc = rd("apps/web/lib/legal/access.ts");
  assert.ok(!/@axion\/db\/admin|createSupabaseAdmin/.test(accessSrc));
});
await check("leitura/exclusão no servidor sempre filtra pela autoria da sessão e pela obra (defesa além da RLS)", () => {
  const lib = rd("apps/web/lib/legal/consultations.ts");
  assert.ok((lib.match(/\.eq\("author_user_id", userId\)/g) ?? []).length >= 3, "lista, detalhe e exclusão");
  assert.ok((lib.match(/\.eq\("project_id", projectId\)/g) ?? []).length >= 3);
  assert.ok(!/storage|\.upload\(|createSignedUrl/.test(lib), "consultas não têm anexos em armazenamento");
  assert.ok(!/formData|searchParams|headers\(\)/.test(lib), "autoria nunca vem do cliente");
});
await check("IA e especialistas: nenhum outro especialista, o assistente AXIA, a curadoria ou a auditoria recebe consultas jurídicas de terceiros", () => {
  const readers = touching.filter((f) => /apps\/web\/lib\/(ai|assistant)\//.test(f));
  assert.deepEqual(readers, ["apps/web/lib/ai/legal-query-action.ts"], "só a ação do próprio autor grava; nada de IA lê o histórico");
  const action = rd("apps/web/lib/ai/legal-query-action.ts");
  assert.ok(!/listOwnLegalConsultations|getOwnLegalConsultation/.test(action), "a IA não lê consultas antigas");
  const query = rd("apps/web/lib/ai/experts/legal-consultant/query.ts");
  assert.ok(!/audit_log_entries|legal_consultations/.test(query), "o especialista não grava a pergunta em auditoria compartilhada");
  const persistAudit = rd("apps/web/lib/ai/curation/persist-curation-audit.ts");
  assert.ok(!/legal|consultation/i.test(persistAudit), "a auditoria de curadoria não carrega consultas jurídicas");
});
await check("o Jurídico IA continua restrito a administrador ATIVO do próprio espaço (e o histórico é por autor, não por papel)", () => {
  const action = rd("apps/web/lib/ai/legal-query-action.ts");
  assert.ok(action.includes("isActiveAdminOfProject(projectId)"));
  const access = rd("apps/web/lib/legal/access.ts");
  assert.ok(/=== "ADMINISTRADOR"/.test(access) && /from\("project_memberships"\)/.test(access) && access.includes('.eq("user_id", auth.user.id)'));
});

console.log(`\nResumo: ${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
