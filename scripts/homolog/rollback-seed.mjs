#!/usr/bin/env node
// ROLLBACK PARCIAL do seed de homologação (Fase 6 / H1): remove os pré-cadastros PENDING e as memberships NÃO administrativas das obras fictícias
// TESTE/TESTE-2 (volta ao estado "só o primeiro administrador"). Só roda em alvo aprovado pela guarda e marcado. Padrão = dry-run; use --apply.
//
// LIMITE DELIBERADO (não é defeito): o banco impede, por gatilho, que uma obra fique sem Administrador ativo e a auditoria (audit_log_entries) é
// imutável com FK RESTRICT. Logo, remover as obras fictícias/o último administrador é RECUSADO pelo próprio produto, e este script NÃO tenta
// contornar (sem desabilitar gatilho, sem session_replication_role). O reset COMPLETO do ambiente é DESCARTAR o projeto Supabase de homologação
// (pausar/excluir no painel) e recriá-lo: provision -> apply-migrations -> seed. Ver docs/homologacao-ambiente-isolado.md, seção Rollback.
import { openGuardedTarget } from "./connect.mjs";

const apply = process.argv.includes("--apply");
const { db } = await openGuardedTarget();
try {
  await db.query("begin");
  const ids = (await db.query("select id from public.projects where code in ('TESTE','TESTE-2')")).rows.map((r) => r.id);
  console.log(`Obras fictícias encontradas: ${ids.length}`);
  if (ids.length) {
    const a = await db.query("delete from public.project_member_invitations where project_id = any($1::uuid[])", [ids]);
    const b = await db.query("delete from public.project_memberships where project_id = any($1::uuid[]) and permission <> 'ADMINISTRADOR'", [ids]);
    console.log(`removidos: ${a.rowCount} pré-cadastros, ${b.rowCount} memberships não administrativas (administradores e obras permanecem)`);
  }
  if (apply) { await db.query("commit"); console.log("APLICADO."); } else { await db.query("rollback"); console.log("DRY-RUN: nada removido (use --apply)."); }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(`ERRO (nada removido): ${String(e.message).split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
