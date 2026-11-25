#!/usr/bin/env node
// Validação do TENANT_ADMIN no acc-homolog (Fase 7 / H6e). SÓ roda em alvo aprovado pela guarda e marcado (connect.mjs).
// Prova, por CLAIMS JWT SIMULADOS NO BANCO (rótulo: BANCO-REAL, NÃO é sessão autenticada de tela), a separação:
//   ADMINISTRADOR de projeto ≠ TENANT_ADMIN (dado global) ≠ competência especializada (JURIDICO/TECNICO/SEGUROS).
// Fases:  A) antes do bootstrap: o ADMINISTRADOR NÃO altera dado global (fail-closed)           [transação revertida]
//         B) bootstrap do TENANT_ADMIN (SQL documentado em docs/permissoes-matriz-central.md §11)  [GRAVADO, com auditoria append-only]
//         C) depois: TENANT_ADMIN altera dado global, mas NÃO ganha competência nem poder em obra onde não é membro [transação revertida]
// Uso: --email=<e-mail do usuário já criado pelo login Google>   (dry-run por padrão: só as fases A e C simuladas; --apply grava o bootstrap)
import { openGuardedTarget, refuse } from "./connect.mjs";

const apply = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="))?.slice(8)?.trim().toLowerCase();
if (!emailArg || !/^[^@\s]+@axion\.com\.br$/.test(emailArg)) refuse("informe --email=<conta @axion.com.br já criada pelo login Google>");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); };
const DENIED = /FORBIDDEN|AUTH_REQUIRED|GLOBAL_ADMIN|TENANT|permission denied|row-level security|não autorizado/i;

const { db } = await openGuardedTarget();
try {
  const u = (await db.query("select id from auth.users where lower(email)=$1", [emailArg])).rows[0];
  if (!u) refuse("usuário não existe em auth.users: ele precisa entrar uma vez com o Google");
  const prof = (await db.query("select count(*)::int n from public.profiles where id=$1", [u.id])).rows[0].n;
  check("usuário criado pelo fluxo legítimo (identidade Google, perfil pelo trigger)", prof === 1 && (await db.query("select 1 from auth.identities where user_id=$1 and provider='google'", [u.id])).rowCount === 1);
  const teste = (await db.query("select id from public.projects where code='TESTE'")).rows[0]?.id;
  const teste2 = (await db.query("select id from public.projects where code='TESTE-2'")).rows[0]?.id;
  if (!teste || !teste2) refuse("obras TESTE/TESTE-2 ausentes: rode o seed antes");
  const tier = async (pid) => (await db.query("select public.acc_project_tier($1) t", [pid])).rows[0].t;

  const asUser = async (fn) => {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.id, role: "authenticated" })]);
      return await fn();
    } finally { await db.query("rollback"); }
  };
  const tryRpc = async (sql, params) => { await db.query("savepoint s"); try { const r = await db.query(sql, params); await db.query("release savepoint s"); return { ok: true, r }; } catch (e) { await db.query("rollback to savepoint s"); return { ok: false, e: String(e.message) }; } };
  const org = JSON.stringify({ legal_name: "ORGANIZACAO SINTETICA DE HOMOLOGACAO", org_kind: "FORNECEDOR" });

  // A) antes do bootstrap
  const jaTenant = (await db.query("select 1 from public.tenant_admins where user_id=$1 and revoked_at is null", [u.id])).rowCount > 0;
  if (!jaTenant) {
    await asUser(async () => {
      check("A1 ADMINISTRADOR do projeto TESTE (membership ativa) confirmado", (await tier(teste)) === "ADMIN", `tier=${await tier(teste)}`);
      check("A2 antes do bootstrap: acc_is_tenant_admin() = false", (await db.query("select public.acc_is_tenant_admin() v")).rows[0].v === false);
      const r = await tryRpc("select public.acc_external_org_save($1::uuid, $2::jsonb, $3)", [teste, org, "validacao A"]);
      check("A3 ADMINISTRADOR NÃO altera dado global sem TENANT_ADMIN (fail-closed)", !r.ok && DENIED.test(r.e), r.ok ? "ALTEROU (defeito)" : r.e.slice(0, 90));
      const c = (await db.query("select public.acc_has_competence($1::uuid,'JURIDICO') v", [teste])).rows[0].v;
      check("A4 ADMINISTRADOR NÃO carrega competência JURIDICO por ser administrador", c === false);
    });
  } else console.log("INFO bootstrap já existente: fase A pulada");

  // B) bootstrap (gravado)
  if (apply && !jaTenant) {
    await db.query("begin");
    await db.query("insert into public.tenant_admins (user_id, reason) values ($1, $2)", [u.id, "Bootstrap do administrador global do ambiente de HOMOLOGACAO (acc-homolog) aprovado pelo responsavel em 21/11/2026"]);
    await db.query("commit");
    const a = (await db.query("select count(*)::int n from public.tenant_admin_audit where user_id=$1 and action='GRANT'", [u.id])).rows[0].n;
    check("B1 bootstrap gravado com auditoria append-only (GRANT)", a === 1);
  } else if (!apply && !jaTenant) console.log("DRY-RUN: bootstrap NÃO gravado (use --apply); a fase C só roda depois dele");

  // C) depois do bootstrap
  const agoraTenant = (await db.query("select 1 from public.tenant_admins where user_id=$1 and revoked_at is null", [u.id])).rowCount > 0;
  if (agoraTenant) {
    await asUser(async () => {
      check("C1 depois do bootstrap: acc_is_tenant_admin() = true", (await db.query("select public.acc_is_tenant_admin() v")).rows[0].v === true);
      const r = await tryRpc("select public.acc_external_org_save($1::uuid, $2::jsonb, $3)", [teste, org, "validacao C"]);
      check("C2 TENANT_ADMIN altera dado global (organização sintética; transação REVERTIDA, nada fica gravado)", r.ok, r.ok ? "" : r.e.slice(0, 120));
      const c = (await db.query("select public.acc_has_competence($1::uuid,'JURIDICO') v", [teste])).rows[0].v;
      check("C3 TENANT_ADMIN NÃO ganha competência especializada (separação preservada)", c === false);
      check("C4 TENANT_ADMIN não vira administrador de obra onde NÃO é membro (TESTE-2 = NONE)", (await tier(teste2)) === "NONE", `tier TESTE-2=${await tier(teste2)}`);
    });
    const resid = (await db.query("select count(*)::int n from public.external_organizations where legal_name='ORGANIZACAO SINTETICA DE HOMOLOGACAO'")).rows[0].n;
    check("C5 nenhum resíduo da organização sintética (reversão confirmada)", resid === 0);
  }
} finally {
  await db.end().catch(() => {});
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} OK / ${bad} FAIL`);
process.exit(bad ? 1 : 0);
