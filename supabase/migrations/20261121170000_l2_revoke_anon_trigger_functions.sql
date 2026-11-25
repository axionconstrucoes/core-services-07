-- ============================================================
-- 20261121170000_l2_revoke_anon_trigger_functions.sql  (LOTE 2 — endurecimento de grants)
--
-- Das 8 funções SECURITY DEFINER herdadas com EXECUTE para anon, 4 são FUNÇÕES DE TRIGGER (retornam `trigger`):
--   handle_new_user, prevent_last_administrator_removal, project_delivery_items_log_risk_change,
--   set_document_version_project_id.
-- O PostgreSQL só confere EXECUTE da função de gatilho em CREATE TRIGGER (quem cria o gatilho); ao DISPARAR, o privilégio
-- do papel que executa o DML NÃO é verificado. Logo, retirar anon (e PUBLIC) não altera nenhum fluxo do app (RLS/RPC) e
-- fecha uma superfície sem uso. authenticated e service_role permanecem como estão (nada novo é revogado deles).
--
-- NÃO tocadas (pendência registrada em docs/lote2-permissoes-sla-acompanhamento.md): has_project_permission,
-- is_project_member, is_any_project_admin e is_shared_project_admin. 91 políticas RLS do schema public são `TO public`
-- e as chamam: o papel anon as avalia ao ler essas tabelas; sem EXECUTE a leitura anônima deixaria de devolver 0 linhas
-- e passaria a falhar com "permission denied for function" — mudança de comportamento sem ganho de segurança comprovado.
--
-- Migration NOVA, idempotente, sem alterar corpo de função, dados ou políticas.
-- ============================================================

do $grants$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.handle_new_user()',
    'public.prevent_last_administrator_removal()',
    'public.project_delivery_items_log_risk_change()',
    'public.set_document_version_project_id()'
  ] loop
    if to_regprocedure(v_sig) is not null then
      execute format('revoke all on function %s from public, anon', v_sig);
    end if;
  end loop;
end
$grants$;
