-- Rollback de 20261211100000_tenant_admin_global_external_data.sql (Fase 7/H6e).
-- Restaura acc_external_assert_global_admin (ADMINISTRADOR do projeto) e acc_external_org_visible (sem TENANT_ADMIN) aos corpos anteriores
-- (20261209101000 e 20261203100000) e remove tenant_admins/tenant_admin_audit/acc_is_tenant_admin.
-- tenant_admins e tenant_admin_audit são EVIDÊNCIA de auditoria: o script RECUSA apagar se houver registro; exporte antes e decida com autorização.
-- ATENÇÃO: reverter devolve ao ADMINISTRADOR de projeto a alteração de dado global compartilhado entre projetos (risco que a H6e corrigiu).
begin;
create or replace function pg_temp.rb_has_rows(p_table text, p_where text default 'true') returns boolean
language plpgsql as $f$
declare r boolean;
begin
  if to_regclass('public.' || p_table) is null then return false; end if;
  execute format('select exists (select 1 from public.%I where %s)', p_table, p_where) into r;
  return r;
exception when undefined_column then return false;
end $f$;
do $$
begin
  if pg_temp.rb_has_rows('tenant_admins') or pg_temp.rb_has_rows('tenant_admin_audit') then
    raise exception 'ROLLBACK_BLOCKED: há TENANT_ADMIN registrado (evidência); exporte tenant_admins/tenant_admin_audit e remova manualmente com autorização';
  end if;
end $$;

create or replace function public.acc_external_assert_global_admin(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) <> 'ADMIN' then
    raise exception 'FORBIDDEN: dados globais de organização externa só podem ser alterados por ADMINISTRADOR ativo; GESTOR/GERENTE devem solicitar a alteração';
  end if;
end;
$$;
revoke all on function public.acc_external_assert_global_admin(uuid) from public, anon, authenticated;

create or replace function public.acc_external_org_visible(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.external_organizations o where o.id = p_org_id and o.created_by = auth.uid())
    or exists (
      select 1
      from public.external_org_project_links l
      join public.project_memberships pm on pm.project_id = l.project_id and pm.user_id = auth.uid() and pm.status = 'ACTIVE'
      where l.organization_id = p_org_id
    )
  );
$$;
revoke all on function public.acc_external_org_visible(uuid) from public, anon;
grant execute on function public.acc_external_org_visible(uuid) to authenticated;

drop table if exists public.tenant_admins;
drop table if exists public.tenant_admin_audit;
drop function if exists public.tenant_admins_guard();
drop function if exists public.tenant_admin_audit_guard();
drop function if exists public.acc_is_tenant_admin();
commit;
