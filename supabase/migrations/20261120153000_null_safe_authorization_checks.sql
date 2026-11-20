-- ============================================================
-- 20261120153000_null_safe_authorization_checks.sql
--
-- Autorização "falha fechada" contra NULL (mesma classe de defeito corrigida em record_risk_alert_action em
-- 20261120151000): em sla_action_authorize_operation, ação SLA sem responsável (responsible_user_id nulo) fazia
-- "responsible_user_id = auth.uid()" resultar NULL; "false or NULL" = NULL e "if not NULL" não recusava — qualquer
-- membro ativo operava a ação. Também ssma_corrective_action_forward ganha coalesce defensivo (a coluna é NOT NULL
-- hoje). Restante dos corpos idêntico.
-- ============================================================

create or replace function public.sla_action_authorize_operation(p_action_id uuid, p_operation text)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.sla_actions%rowtype;
  v_permission text;
  v_is_admin boolean;
  v_is_responsible boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_operation not in ('ASSUME', 'START', 'COMPLETE', 'FORWARD') then raise exception 'INVALID_OPERATION'; end if;

  select * into v_action from public.sla_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;

  select pm.permission into v_permission
  from public.project_memberships pm
  where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE';
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');
  v_is_responsible := coalesce(v_action.responsible_user_id = v_user, false) and v_permission not in ('LEITURA', 'VIEWER');
  if not coalesce(v_is_admin or v_is_responsible, false) then raise exception 'ACTION_ACCESS_DENIED'; end if;

  if v_action.status in ('COMPLETED', 'CANCELLED') then raise exception 'ACTION_CLOSED'; end if;

  if exists (select 1 from public.risk_alert_cases c where c.sla_action_id = v_action.id) then
    raise exception 'RISK_CASE_LINKED';
  end if;

  return v_action;
end;
$$;

create or replace function public.ssma_corrective_action_forward(
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.ssma_corrective_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_permission text;
  v_is_admin boolean;
  v_previous uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Ordem de bloqueio: ação SLA primeiro, depois a ação SSMA (a mesma do ssma_corrective_action_update).
  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;

  select pm.permission into v_permission
  from public.project_memberships pm
  where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE';
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');
  if not coalesce(v_is_admin or (coalesce(v_action.responsible_user_id = v_user, false) and v_permission not in ('LEITURA', 'VIEWER')), false) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  v_previous := v_action.responsible_user_id;
  if p_new_responsible_user_id is null then raise exception 'NEW_RESPONSIBLE_REQUIRED'; end if;
  if p_new_responsible_user_id = v_previous then raise exception 'SAME_RESPONSIBLE'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = v_action.project_id and pm.user_id = p_new_responsible_user_id
      and pm.status = 'ACTIVE' and pm.permission not in ('LEITURA', 'VIEWER')
  ) then raise exception 'NEW_RESPONSIBLE_NOT_ELIGIBLE'; end if;
  if not v_is_admin and (v_reason is null or char_length(v_reason) < 5) then raise exception 'FORWARD_REASON_REQUIRED'; end if;

  if v_sla_id is not null then
    -- sla_action_ssma_guard propaga o novo responsável à ação SSMA e ao registro e grava o evento REATRIBUIDA.
    update public.sla_actions set responsible_user_id = p_new_responsible_user_id where id = v_sla_id;
  else
    update public.ssma_corrective_actions set responsible_user_id = p_new_responsible_user_id where id = v_action.id;
    update public.ssma_field_records set responsible_user_id = p_new_responsible_user_id where id = v_action.record_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (v_action.id, v_action.project_id, 'REATRIBUIDA', coalesce(v_reason, 'Encaminhada pelo administrador.'), v_user);
  end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail, occurred_at)
  values (
    v_action.project_id, 'USER', v_user, null, 'SSMA_ACTION_FORWARDED', 'SSMA_CORRECTIVE_ACTION', v_action.id::text,
    format('Ação corretiva SSMA encaminhada de %s para %s. Motivo: %s', coalesce(v_previous::text, 'não atribuído'),
      p_new_responsible_user_id::text, coalesce(v_reason, 'não informado (administrador)')),
    now()
  );

  select * into v_action from public.ssma_corrective_actions where id = p_action_id;
  if v_action.responsible_user_id is distinct from p_new_responsible_user_id then
    raise exception 'FORWARD_NOT_PERSISTED';
  end if;
  return v_action;
end;
$$;

revoke all on function public.sla_action_authorize_operation(uuid, text) from public, anon, authenticated;
revoke all on function public.ssma_corrective_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.ssma_corrective_action_forward(uuid, uuid, text) to authenticated;
