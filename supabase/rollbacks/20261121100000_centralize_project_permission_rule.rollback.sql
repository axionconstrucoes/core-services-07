-- ROLLBACK (manual, NAO e migration) de 20261121100000_centralize_project_permission_rule.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
-- restaura has_project_permission(uuid, text) com o corpo de 20260829200000_project_permission_gerente_compat
create or replace function public.has_project_permission(
  p_project_id uuid,
  p_min text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'ACTIVE'
      and (
        case pm.permission
          when 'ADMINISTRADOR' then 3

          -- Todos os demais perfis são somente leitura.
          when 'GESTOR' then 1
          when 'GERENTE' then 1
          when 'COLABORADOR' then 1
          when 'LEITURA' then 1

          -- Compatibilidade defensiva com dados antigos.
          when 'ADMIN' then 3
          when 'EDITOR' then 1
          when 'VIEWER' then 1
          else 0
        end
      ) >= (
        case p_min
          -- Escrita/administração.
          when 'ADMINISTRADOR' then 3
          when 'ADMIN' then 3

          -- Qualquer chamada histórica que exigia edição
          -- passa a ser satisfeita somente por ADMINISTRADOR.
          when 'GESTOR' then 2
          when 'GERENTE' then 2
          when 'COLABORADOR' then 2
          when 'EDITOR' then 2

          -- Leitura.
          when 'LEITURA' then 1
          when 'VIEWER' then 1

          else 999
        end
      )
  );
$$;
revoke all on function public.has_project_permission(uuid, text) from public;
grant execute on function public.has_project_permission(uuid, text) to authenticated;
-- restaura is_project_member(uuid) com o corpo de 20260824090000_project_membership_roles_status_area
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'ACTIVE'
  );
$$;
revoke all on function public.is_project_member(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;
commit;
