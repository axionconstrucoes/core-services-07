#!/usr/bin/env node
// Seed SINTÉTICO + perfis de teste pelo FLUXO LEGÍTIMO (Fase 6 / H1). Só roda em alvo aprovado pela guarda (guard.mjs) e marcado.
//
// O QUE FAZ
//  - cria as obras fictícias "TESTE" e "TESTE 2" (dados 100% sintéticos);
//  - para cada conta de teste informada pelo responsável (HOMOLOG_TEST_ACCOUNTS):
//      * se a pessoa JÁ entrou uma vez com o Google (existe profile criado pelo trigger handle_new_user): cria/atualiza a membership;
//      * se ainda NÃO entrou: grava o PRÉ-CADASTRO (project_member_invitations, status PENDING) — o acesso só nasce no primeiro login
//        Google real daquela conta, exatamente como no app (trigger handle_new_user, comparação exata do e-mail).
//  - NUNCA cria usuário em auth.users, NUNCA grava sessão/JWT, NUNCA define senha.
//
// BOOTSTRAP DO 1º ADMINISTRADOR: o app só deixa ADMINISTRADOR pré-cadastrar membros; no projeto novo ainda não há ninguém. Por isso o
// P-ADM precisa entrar UMA vez com o Google (gera profile sem acesso a nada) e só então este script concede ADMINISTRADOR na obra TESTE
// (ação do DONO do projeto de homologação, com a string de conexão dele — equivale a "primeiro administrador" de qualquer instalação).
//
// Entrada: HOMOLOG_TEST_ACCOUNTS="P-ADM=nome1@axion.com.br;P-GES=nome2@axion.com.br;..."  (códigos do roteiro, seção 1). O domínio DEVE ser
// @axion.com.br (o app e o pré-cadastro recusam qualquer outro). Mapa de papéis em ROLE_MAP. Uso: --dry-run (padrão) | --apply
import { openGuardedTarget, refuse } from "./connect.mjs";
import { PROJECTS, parseAccounts } from "./seed-lib.mjs";

const apply = process.argv.includes("--apply");
let accounts;
try { accounts = parseAccounts(process.env.HOMOLOG_TEST_ACCOUNTS); } catch (e) { refuse(e.message); }
if (!accounts.length) refuse("HOMOLOG_TEST_ACCOUNTS vazio (indique as contas Google de teste reais)");
if (!accounts.some((a) => a.code === "P-ADM")) refuse("P-ADM é obrigatório (primeiro administrador)");

const { db } = await openGuardedTarget();
try {
  await db.query("begin");
  const ids = {};
  for (const p of PROJECTS) {
    const r = await db.query(
      `insert into public.projects (code, name, client, status, location, contract_number, start_date, baseline_end_date)
       values ($1,$2,$3,'ATIVO',$4,$5, current_date - 30, current_date + 365)
       on conflict (code) do update set name = excluded.name returning id`,
      [p.code, p.name, p.client, p.location, p.contract_number]);
    ids[p.code] = r.rows[0].id;
  }
  const projId = (name) => ids[name === "TESTE" ? "TESTE" : "TESTE-2"];
  const prof = async (email) => (await db.query("select id from public.profiles where lower(email)=lower($1)", [email])).rows[0]?.id ?? null;

  const adm = accounts.find((a) => a.code === "P-ADM");
  const admId = await prof(adm.email);
  if (!admId) {
    console.log("P-ADM ainda NÃO entrou com o Google neste projeto. Peça para a pessoa abrir o app de homologação e entrar com a conta Google UMA vez; depois rode de novo.");
    await db.query("rollback");
    process.exitCode = 3;
  } else {
    const report = [];
    for (const a of accounts) {
      const pid = projId(a.project);
      const profileId = await prof(a.email);
      if (profileId && !a.pendingOnly) {
        await db.query(
          `insert into public.project_memberships (project_id, user_id, permission, area, status)
           values ($1,$2,$3,null,$4)
           on conflict (project_id, user_id) do update set permission = excluded.permission, status = excluded.status`,
          [pid, profileId, a.permission, a.inactive ? "INACTIVE" : "ACTIVE"]);
        report.push(`${a.code}: membership ${a.permission}${a.inactive ? " (INATIVA)" : ""} em ${a.project}`);
      } else {
        if (a.inactive) report.push(`${a.code}: pré-cadastro PENDING; após o 1º login, rode de novo para inativar a membership`);
        await db.query(
          `insert into public.project_member_invitations (project_id, email, name, area, permission, status, created_by)
           values ($1,$2,$3,null,$4,'PENDING',$5)
           on conflict (project_id, email) do nothing`,
          [pid, a.email, `Perfil de teste ${a.code}`, a.permission, admId]);
        report.push(`${a.code}: pré-cadastro PENDING (${a.permission}) em ${a.project}${a.pendingOnly ? " — NÃO deve entrar" : " — ativa no 1º login Google"}`);
      }
    }
    console.log(report.join("\n"));
    if (apply) { await db.query("commit"); console.log("APLICADO."); }
    else { await db.query("rollback"); console.log("DRY-RUN: nada gravado (use --apply)."); }
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(`ERRO: ${String(e.message).split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
