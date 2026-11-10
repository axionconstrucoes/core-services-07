// Coerência de permissões da gestão de ações corretivas SSMA: INTERFACE x SERVIDOR x RPC (PostgreSQL 17 descartável em PGlite; dados sintéticos).
// Operação: concluir/andar uma ação corretiva que NÃO é do próprio usuário ("gestão"). No banco, ssma_corrective_action_update usa
// has_project_permission(obra, 'GESTOR'), que pela migration 20260829200000 só é satisfeito por ADMINISTRADOR. A interface não pode oferecer
// essa operação a quem o servidor recusa (Gerente/Gestor veriam o fluxo de conclusão e receberiam ACTION_ACCESS_DENIED).
// Este teste NÃO amplia permissões no banco: só exige que a interface mostre exatamente o que o banco permite.
// Uso: node scripts/test-ssma-manage-permission-coherence.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
let passed = 0, failed = 0;
async function check(name, fn) { try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 240)}`); failed += 1; } }
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

console.log("\n======================================\nGESTÃO DE AÇÕES SSMA — INTERFACE x SERVIDOR x RPC\n======================================");

// ---------- interface (código-fonte) ----------
const page = readFileSync(path.join(root, "apps/web/app/ssma/[projectId]/page.tsx"), "utf8");
const detail = readFileSync(path.join(root, "apps/web/components/ssma/field-records/record-detail.tsx"), "utf8");
const uiRoleSets = [...page.matchAll(/canManage[^\n]*?\[([^\]]*)\]\.includes\(/g)].map((m) => [...m[1].matchAll(/"([A-ZÀ-Ú]+)"/g)].map((x) => x[1]).sort());

await check("interface: as duas definições de canManage (obra atual e lista de obras) existem e coincidem", () => {
  eq(uiRoleSets.length, 2, "definições de canManage em ssma/[projectId]/page.tsx");
  eq(uiRoleSets[0], uiRoleSets[1], "as duas listas de perfis");
});

// ---------- banco (PGlite) ----------
const dir = path.join(root, "supabase", "migrations");
const LAST = "20261106110000_ssma_esg_evidence_reference.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().filter((f) => f <= LAST);
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");
const db = new PGlite(); await db.exec(PLATFORM); for (const f of files) await db.exec(clean(f));
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, fn) => { await db.exec(`select set_config('app.uid','${uid}',false); select set_config('app.role','authenticated',false); set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } };
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P = "10000000-0000-4000-8000-000000000001";
const ROLES = { ADMINISTRADOR: 1, GERENTE: 2, GESTOR: 3, COLABORADOR: 4, LEITURA: 5 }; // COLABORADOR (4) = usuário comum NÃO responsável
const RESP = 6;                                                                         // responsável da ação (COLABORADOR)
for (const n of [...Object.values(ROLES), RESP]) { await db.query("insert into auth.users (id,email) values ($1,$2)", [id(n), `u${n}@exemplo.invalid`]); await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), `u${n}`, `u${n}@exemplo.invalid`]); }
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','C','L','2026-01-01','2027-01-01')", [P]);
for (const [perm, n] of Object.entries(ROLES)) await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [P, id(n), perm]);
await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'COLABORADOR','ACTIVE')", [P, id(RESP)]);

const dbManagers = [];
await check("servidor: has_project_permission(obra, 'GESTOR') por perfil (base da decisão do RPC)", async () => {
  for (const [perm, n] of Object.entries(ROLES)) if ((await as(id(n), () => q("select public.has_project_permission($1,'GESTOR') ok", [P])))[0].ok) dbManagers.push(perm);
  dbManagers.sort();
  eq(dbManagers, ["ADMINISTRADOR"], "perfis que o servidor trata como gestão");
});

const rpcManagers = [];
await check("RPC: ssma_corrective_action_update em ação ALHEIA — só quem o servidor trata como gestão passa da checagem de acesso", async () => {
  const recId = crypto.randomUUID();
  await as(id(ROLES.ADMINISTRADOR), () => q("select public.ssma_field_record_submit($1,$2,$3,'OCORRENCIA','EPI','descricao','Bloco A',now(),now(),'ALTA',$4,'2026-12-31')", [id(ROLES.ADMINISTRADOR), recId, P, id(RESP)]));
  const action = (await q("select id from public.ssma_corrective_actions where record_id=$1", [recId]))[0].id;
  for (const [perm, n] of Object.entries(ROLES)) {
    const e = await err(as(id(n), () => q("select public.ssma_corrective_action_update($1,'ANDAMENTO','nota de andamento')", [action])));
    if (!/ACTION_ACCESS_DENIED/.test(e ?? "")) rpcManagers.push(perm);
  }
  rpcManagers.sort();
  eq(rpcManagers, dbManagers, "perfis aceitos pelo RPC x perfis de gestão do servidor");
});

await check("COERÊNCIA: a interface oferece a gestão exatamente aos perfis que o RPC aceita (nenhum a mais, nenhum a menos)", () => {
  eq(uiRoleSets[0], rpcManagers, "perfis na interface (canManage, obra atual)");
  eq(uiRoleSets[1], rpcManagers, "perfis na interface (canManage, lista de obras)");
});
await check("a interface NUNCA oferece mais do que o servidor permite (sem ampliar permissão no banco)", () => {
  for (const set of uiRoleSets) ok(set.every((r) => dbManagers.includes(r)), `perfis da interface fora do que o servidor permite: ${set.filter((r) => !dbManagers.includes(r))}`);
});
await check("texto da conclusão não promete a justificativa de 'gestor' a perfis sem acesso (diz Administrador)", () => {
  ok(!/\(gestor\)/.test(detail), 'record-detail.tsx ainda diz "(gestor)"');
  ok(/\(Administrador\)/.test(detail), 'record-detail.tsx deve dizer "(Administrador)"');
});
await check("canManage só controla o fluxo de conclusão/andamento em record-detail (nenhum outro efeito na interface SSMA)", () => {
  const uses = [...detail.matchAll(/canManage/g)].length;
  ok(uses >= 3, "canManage deixou de ser usado em record-detail.tsx");
  ok(/const canUpdate = action !== null && action\.status !== "CONCLUIDA" && \(isResponsible \|\| canManage\);/.test(detail), "canUpdate deve depender do responsável ou de canManage");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
