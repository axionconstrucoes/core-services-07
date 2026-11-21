-- 20261211100000_tenant_admin_global_external_data.sql
-- Fase 7 / Frente H6e: papel TENANT_ADMIN (administração global). Prova em Postgres real (scripts/test-f7-h6e-tenant-admin-realpg.mjs) de que,
-- antes desta migration, o ADMINISTRADOR de UM projeto alterava dados GLOBAIS (organização, domínio, contato) de organizações também usadas por
-- OUTRO projeto (a visibilidade da organização vem de qualquer vínculo do projeto do usuário). Menor ajuste: dado global passa a exigir TENANT_ADMIN.
-- Modelo (o mais simples e seguro): a concessão/revogação NÃO tem RPC para authenticated (sem auto-concessão); é feita SOMENTE por manutenção
-- (superusuário/service_role fora do app, mediante aprovação), por SQL documentado em docs/permissoes-matriz-central.md. Sem nenhum TENANT_ADMIN
-- registrado, alterações globais ficam BLOQUEADAS (fail-closed). ADMINISTRADOR/GESTOR/GERENTE do projeto seguem gerindo o PROJETO (vínculos,
-- competências, delegações, solicitações) como antes.
-- REDEFINE (justificado): acc_external_assert_global_admin (autorização: ADMIN do projeto => TENANT_ADMIN; lido por org_save/domain_set/contact_set e
-- pela decisão de solicitações) e acc_external_org_visible (+ TENANT_ADMIN enxerga todas as organizações, necessário para editá-las).
-- Idempotente. Reversível: supabase/rollbacks/20261211100000_tenant_admin_global_external_data.rollback.sql.

create table if not exists public.tenant_admins (
  user_id uuid primary key references auth.users (id) on delete restrict,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  reason text not null check (char_length(btrim(reason)) >= 5),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  check (revoked_at is null or revoked_at >= granted_at)
);

-- Auditoria append-only das concessões/revogações (o estado atual fica em tenant_admins; o histórico aqui).
create table if not exists public.tenant_admin_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null check (action in ('GRANT', 'REVOKE', 'REGRANT')),
  actor uuid,
  at timestamptz not null default now(),
  snapshot jsonb not null
);

alter table public.tenant_admins enable row level security;
alter table public.tenant_admin_audit enable row level security;
revoke all on public.tenant_admins from public, anon, authenticated;
revoke all on public.tenant_admin_audit from public, anon, authenticated;
grant all on public.tenant_admins to service_role;
grant select, insert on public.tenant_admin_audit to service_role;
-- sem policies: authenticated/anon não leem nem escrevem; a verificação é feita por acc_is_tenant_admin() (security definer).

create or replace function public.tenant_admins_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'APPEND_ONLY: tenant_admins não admite DELETE; revogue (revoked_at/revoked_by)';
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'APPEND_ONLY: user_id imutável'; end if;
    if old.revoked_at is null and new.revoked_at is not null then
      if new.granted_by is distinct from old.granted_by or new.granted_at is distinct from old.granted_at or new.reason is distinct from old.reason then
        raise exception 'APPEND_ONLY: a revogação só preenche revoked_at/revoked_by';
      end if;
      insert into public.tenant_admin_audit (user_id, action, actor, snapshot) values (new.user_id, 'REVOKE', coalesce(new.revoked_by, auth.uid()), to_jsonb(new));
    elsif old.revoked_at is not null and new.revoked_at is null then
      insert into public.tenant_admin_audit (user_id, action, actor, snapshot) values (new.user_id, 'REGRANT', coalesce(new.granted_by, auth.uid()), to_jsonb(new));
    else
      raise exception 'APPEND_ONLY: alteração não permitida (apenas revogar ou reconceder)';
    end if;
    return new;
  end if;
  insert into public.tenant_admin_audit (user_id, action, actor, snapshot) values (new.user_id, 'GRANT', coalesce(new.granted_by, auth.uid()), to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.tenant_admins_guard() from public, anon, authenticated;
drop trigger if exists tenant_admins_guard_trg on public.tenant_admins;
create trigger tenant_admins_guard_trg before insert or update or delete on public.tenant_admins
  for each row execute function public.tenant_admins_guard();

create or replace function public.tenant_admin_audit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'APPEND_ONLY: tenant_admin_audit não admite UPDATE/DELETE';
end;
$$;
revoke all on function public.tenant_admin_audit_guard() from public, anon, authenticated;
drop trigger if exists tenant_admin_audit_guard_trg on public.tenant_admin_audit;
create trigger tenant_admin_audit_guard_trg before update or delete on public.tenant_admin_audit
  for each row execute function public.tenant_admin_audit_guard();

-- TENANT_ADMIN ativo? STABLE, security definer, search_path vazio, fail-closed (sem sub => false).
create or replace function public.acc_is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select true from public.tenant_admins t where t.user_id = auth.uid() and t.revoked_at is null limit 1),
    false);
$$;
revoke all on function public.acc_is_tenant_admin() from public, anon;
grant execute on function public.acc_is_tenant_admin() to authenticated, service_role;

-- Dado GLOBAL exige TENANT_ADMIN (antes: ADMINISTRADOR do projeto de origem). p_project_id segue obrigatório (auditoria).
create or replace function public.acc_external_assert_global_admin(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.acc_is_tenant_admin() then
    raise exception 'FORBIDDEN: dados globais de organização externa só podem ser alterados por TENANT_ADMIN; ADMINISTRADOR/GESTOR/GERENTE do projeto devem solicitar a alteração';
  end if;
end;
$$;
revoke all on function public.acc_external_assert_global_admin(uuid) from public, anon, authenticated;

-- TENANT_ADMIN enxerga todas as organizações (para poder editá-las); demais mantêm a regra por vínculo/criador.
create or replace function public.acc_external_org_visible(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.acc_is_tenant_admin()
    or exists (select 1 from public.external_organizations o where o.id = p_org_id and o.created_by = auth.uid())
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

comment on table public.tenant_admins is
  'Fase 7/H6e: TENANT_ADMIN (administração global). Concessão/revogação somente por manutenção (superusuário/service_role), sem RPC para authenticated. Sem linha ativa => dados globais de organização externa bloqueados.';
comment on table public.tenant_admin_audit is 'Fase 7/H6e: histórico append-only de concessão/revogação de TENANT_ADMIN.';
