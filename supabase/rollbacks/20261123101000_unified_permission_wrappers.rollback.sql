-- ROLLBACK (manual, NAO e migration) de 20261123101000_unified_permission_wrappers.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
-- restaura quality_can_read(uuid) com o corpo de 20261122100000_quality_foundation
create or replace function public.quality_can_read(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.quality_role_for(p_project_id) is not null, false);
$$;
-- restaura quality_can_register(uuid) com o corpo de 20261122100000_quality_foundation
create or replace function public.quality_can_register(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.quality_role_for(p_project_id) in ('ADMINISTRADOR', 'GERENTE', 'GESTOR', 'COLABORADOR'), false);
$$;
-- restaura quality_can_manage(uuid) com o corpo de 20261122100000_quality_foundation
create or replace function public.quality_can_manage(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.quality_role_for(p_project_id) in ('ADMINISTRADOR', 'GERENTE', 'GESTOR'), false);
$$;
-- restaura insurance_access(uuid, text) com o corpo de 20261122200000_seguros_garantias_model
create or replace function public.insurance_access(p_project_id uuid, p_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_level
      when 'READ' then true
      when 'REGISTER' then pm.permission in ('ADMINISTRADOR', 'ADMIN', 'GESTOR', 'GERENTE', 'COLABORADOR', 'EDITOR')
      when 'MANAGE' then pm.permission in ('ADMINISTRADOR', 'ADMIN', 'GESTOR', 'GERENTE')
      when 'ADMIN' then pm.permission in ('ADMINISTRADOR', 'ADMIN')
      else false
    end
    from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'ACTIVE'
    limit 1
  ), false);
$$;
revoke all on function public.insurance_access(uuid, text) from public, anon;
grant execute on function public.insurance_access(uuid, text) to authenticated;
commit;
