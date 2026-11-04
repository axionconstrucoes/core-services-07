// Executa o código REAL de apps/web/lib/legal/consultations.ts (salvar, listar, abrir por ID, excluir) contra o banco de teste
// local (PGlite) com as políticas RLS reais da migration 20261104120000. A sessão autenticada é simulada: cada "usuário" é um
// auth.uid() diferente. Duas contas do MESMO projeto (autor e administradora) + gerente + sem sessão.
// Nenhum banco real é tocado; dados fictícios.
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-legal-consultations-lib-sql.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { as, createLocalDb } from "./lib/pglite-supabase-stub.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRequire = createRequire(path.join(root, "apps", "web", "package.json"));
const ts = webRequire("typescript");

const U = {
  autor: "00000000-0000-4000-8000-0000000000a1",
  adm: "00000000-0000-4000-8000-0000000000d4",
  gerente: "00000000-0000-4000-8000-0000000000b2",
};
const P = "00000000-0000-4000-8000-000000000001";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}

const pre = `
create or replace function public.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'ACTIVE');
$$;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;
`;
const db = await createLocalDb(["20261104120000_legal_consultations_private.sql"], pre);
for (const [k, id] of Object.entries(U)) await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3)", [id, k, `${k}@exemplo.invalid`]);
await db.query("insert into public.projects (id,name,code) values ($1,'Obra Fictícia','FIC-001')", [P]);
for (const [u, perm] of [[U.autor, "COLABORADOR"], [U.adm, "ADMINISTRADOR"], [U.gerente, "GERENTE"]]) {
  await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [P, u, perm]);
}

// ---- cliente Supabase simulado: executa as consultas do módulo como o usuário da sessão (papel authenticated + RLS) ----
let session = null; // uid da sessão atual (null = sem login)
const JSON_COLS = new Set(["response", "provider_meta"]);

function builder(table) {
  const st = { op: "select", cols: "*", values: null, eqs: [], order: null, limit: null, ret: null, mode: "many" };
  const api = {
    insert(v) { st.op = "insert"; st.values = v; return api; },
    select(c) { if (st.op === "select") st.cols = c; else st.ret = c; return api; },
    delete() { st.op = "delete"; return api; },
    eq(c, v) { st.eqs.push([c, v]); return api; },
    order(c, o) { st.order = [c, o?.ascending === false ? "desc" : "asc"]; return api; },
    limit(n) { st.limit = n; return api; },
    single() { st.mode = "single"; return api; },
    maybeSingle() { st.mode = "maybe"; return api; },
    then(resolve, reject) { return run().then(resolve, reject); },
  };
  async function run() {
    try {
      const params = [];
      const p = (v) => (params.push(v), `$${params.length}`);
      let sql;
      if (st.op === "insert") {
        const cols = Object.keys(st.values);
        sql = `insert into public.${table} (${cols.join(",")}) values (${cols.map((c) => (JSON_COLS.has(c) ? `${p(JSON.stringify(st.values[c]))}::jsonb` : p(st.values[c]))).join(",")}) returning ${st.ret ?? "*"}`;
      } else {
        const where = st.eqs.length ? ` where ${st.eqs.map(([c, v]) => `${c} = ${p(v)}`).join(" and ")}` : "";
        if (st.op === "delete") sql = `delete from public.${table}${where} returning ${st.ret ?? "id"}`;
        else sql = `select ${st.cols} from public.${table}${where}${st.order ? ` order by ${st.order[0]} ${st.order[1]}` : ""}${st.limit ? ` limit ${st.limit}` : ""}`;
      }
      if (!session) return { data: null, error: { message: "permission denied (sem sessão)" } };
      const rows = await as(db, { role: "authenticated", uid: session }, async () => (await db.query(sql, params)).rows);
      if (st.mode === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "esperava 1 linha" } };
      if (st.mode === "maybe") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error: { message: String(error.message) } };
    }
  }
  return api;
}
const fakeClient = { from: (t) => builder(t), auth: { getUser: async () => ({ data: { user: session ? { id: session } : null } }) } };

// ---- carrega o módulo REAL (TS → CJS) ----
const source = readFileSync(path.join(root, "apps", "web", "lib", "legal", "consultations.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
const shims = { "server-only": {}, "@axion/db/server": { createSupabaseServerClient: async () => fakeClient } };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (id) => { if (id in shims) return shims[id]; throw new Error(`import inesperado: ${id}`); }, console });
const { saveLegalConsultation, listOwnLegalConsultations, getOwnLegalConsultation, deleteOwnLegalConsultation } = mod.exports;

const resposta = { interpretacao: "Resposta fictícia", fatosDocumentados: [] };
const as_ = (uid) => { session = uid; };

console.log("\n======================================");
console.log("CONSULTAS JURÍDICAS — CÓDIGO REAL DO APP × RLS (PGlite, 2 contas do mesmo projeto)");
console.log("======================================\n");

let id;
await check("AUTOR cria: a consulta é gravada com a autoria da sessão", async () => {
  as_(U.autor);
  const r = await saveLegalConsultation({ projectId: P, question: "Pergunta fictícia sobre reajuste", response: resposta, providerMeta: { providerLabel: "teste" } });
  assert.equal(r.saved, true);
  id = r.id;
  assert.equal((await db.query("select author_user_id from public.legal_consultations where id=$1", [id])).rows[0].author_user_id, U.autor);
});

await check("AUTOR lista e abre a própria consulta (por ID)", async () => {
  as_(U.autor);
  const l = await listOwnLegalConsultations(P);
  assert.equal(l.available, true);
  assert.equal(l.items.length, 1); assert.equal(l.items[0].id, id);
  const d = await getOwnLegalConsultation(P, id);
  assert.equal(d?.question, "Pergunta fictícia sobre reajuste");
  assert.equal(d?.response.interpretacao, "Resposta fictícia");
});

await check("ADMINISTRADORA do mesmo projeto: lista vazia, abrir por ID direto = nada, excluir por ID = falha", async () => {
  as_(U.adm);
  assert.equal((await listOwnLegalConsultations(P)).items.length, 0);
  assert.equal(await getOwnLegalConsultation(P, id), null);
  assert.equal(await deleteOwnLegalConsultation(P, id), false);
  as_(U.autor);
  assert.equal((await listOwnLegalConsultations(P)).items.length, 1, "a consulta do autor deve continuar intacta");
});

await check("outro membro (gerente) do mesmo projeto também é bloqueado (listar, abrir por ID, excluir)", async () => {
  as_(U.gerente);
  assert.equal((await listOwnLegalConsultations(P)).items.length, 0);
  assert.equal(await getOwnLegalConsultation(P, id), null);
  assert.equal(await deleteOwnLegalConsultation(P, id), false);
});

await check("sem sessão: não grava, não lista, não abre, não exclui", async () => {
  as_(null);
  assert.equal((await saveLegalConsultation({ projectId: P, question: "x", response: resposta, providerMeta: null })).saved, false);
  assert.equal((await listOwnLegalConsultations(P)).items.length, 0);
  assert.equal(await getOwnLegalConsultation(P, id), null);
  assert.equal(await deleteOwnLegalConsultation(P, id), false);
});

await check("ID malformado ou de outro projeto não abre nem exclui", async () => {
  as_(U.autor);
  assert.equal(await getOwnLegalConsultation(P, "1; drop table x"), null);
  assert.equal(await deleteOwnLegalConsultation(P, "not-a-uuid"), false);
  assert.equal(await getOwnLegalConsultation("00000000-0000-4000-8000-0000000000ff", id), null);
});

await check("a administradora grava a PRÓPRIA consulta: privada a ela; o autor original não a vê", async () => {
  as_(U.adm);
  const r = await saveLegalConsultation({ projectId: P, question: "Pergunta fictícia da administradora", response: resposta, providerMeta: null });
  assert.equal(r.saved, true);
  assert.equal((await listOwnLegalConsultations(P)).items.length, 1);
  as_(U.autor);
  assert.equal(await getOwnLegalConsultation(P, r.id), null);
  as_(U.adm);
  assert.equal(await deleteOwnLegalConsultation(P, r.id), true);
});

await check("AUTOR exclui a própria consulta; depois ela não aparece na lista nem por ID", async () => {
  as_(U.autor);
  assert.equal(await deleteOwnLegalConsultation(P, id), true);
  assert.equal((await listOwnLegalConsultations(P)).items.length, 0);
  assert.equal(await getOwnLegalConsultation(P, id), null);
  assert.equal((await db.query("select count(*)::int c from public.legal_consultations where id=$1", [id])).rows[0].c, 0);
});

await check("histórico ainda inexistente no banco (migration não aplicada): listar devolve available=false e salvar não derruba a consulta", async () => {
  await db.query("alter table public.legal_consultations rename to legal_consultations_off");
  as_(U.autor);
  const l = await listOwnLegalConsultations(P);
  assert.equal(l.available, false);
  assert.equal((await saveLegalConsultation({ projectId: P, question: "x", response: resposta, providerMeta: null })).saved, false);
  await db.query("alter table public.legal_consultations_off rename to legal_consultations");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
