-- ============================================================
-- 20261106090000_sla_configuration_audit_system_actor.sql
--
-- CORREÇÃO PRIORITÁRIA — primeiro login com convite ligado à Matriz de SLA.
--
-- Problema (comprovado nos logs de produção): SQL 23514, constraint audit_log_entries_check.
--   handle_new_user (auth.users)
--     -> UPDATE project_member_invitations (ACTIVATED ou CANCELLED)
--       -> resolve_sla_matrix_invitation_on_activation()
--         -> UPDATE sla_area_responsibles
--           -> audit_sla_configuration_updated()  grava actor_type = 'USER' com auth.uid() NULO.
--   Durante a criação do usuário pelo Supabase Auth não há usuário autenticado (auth.uid() é nulo),
--   e audit_log_entries_check exige actor_user_id para actor_type = 'USER'. A transação inteira
--   falha e o cadastro é abortado; o tratamento de erro de handle_new_user (cancelar o convite)
--   dispara o MESMO gatilho e falha do mesmo modo, então nem o fallback salva o login.
--
-- Correção mínima (CREATE OR REPLACE; nenhuma migration histórica é editada):
--   - ação de usuário autenticado (auth.uid() presente)  -> 'USER' com o autor, exatamente como antes;
--   - alteração sem usuário autenticado (ativação/cancelamento automático de convite no primeiro
--     login, worker/service_role)                         -> 'SYSTEM' (sem autor, sem rótulo), com o
--     detalhe indicando que foi automática.
--   Mesmo precedente de 20261029110000 (audit_sla_action_updated).
--
-- NÃO remove nem relaxa audit_log_entries_check. NÃO desativa gatilho algum. NÃO altera
-- handle_new_user nem resolve_sla_matrix_invitation_on_activation. NÃO toca em dados,
-- permissões, vínculos de projeto nem em consultas jurídicas.
-- Corpo idêntico ao vigente (20260822123400) exceto o ator; search_path vazio como a definição
-- endurecida em produção (20260830100000) — só nomes qualificados e funções do pg_catalog.
-- Privilégios de EXECUTE preservados (CREATE OR REPLACE não os altera).
-- ============================================================

create or replace function public.audit_sla_configuration_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_entity_id text;
  v_detail text;
  v_actor uuid := auth.uid();
begin
  if tg_table_name = 'sla_matrix_rules' then
    v_project_id := coalesce(new.project_id, old.project_id);
    v_entity_id := coalesce(new.id, old.id)::text;
    v_detail := format('Regra de matriz SLA (risco %s) atualizada.', coalesce(new.risk_level, old.risk_level));
  elsif tg_table_name = 'sla_area_responsibles' then
    v_project_id := coalesce(new.project_id, old.project_id);
    v_entity_id := coalesce(new.id, old.id)::text;
    v_detail := format('Responsáveis da área %s atualizados.', coalesce(new.area, old.area));
  else
    -- sla_project_settings: chave primária é project_id (sem coluna id própria).
    v_project_id := coalesce(new.project_id, old.project_id);
    v_entity_id := v_project_id::text;
    v_detail := format(
      'Timezone/horário útil do projeto atualizado (timezone=%s, expediente=%s–%sh).',
      coalesce(new.timezone, old.timezone),
      coalesce(new.business_day_start_hour, old.business_day_start_hour),
      coalesce(new.business_day_end_hour, old.business_day_end_hour)
    );
  end if;

  if v_actor is null then
    v_detail := v_detail || ' Alteração automática do sistema, sem usuário autenticado (ex.: ativação ou cancelamento de pré-cadastro no primeiro login).';
  end if;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label,
    action, entity_type, entity_id, detail
  )
  values (
    v_project_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    v_actor,
    null,
    'SLA_CONFIGURATION_UPDATED', tg_table_name, v_entity_id,
    v_detail
  );

  return coalesce(new, old);
end;
$$;
