-- ============================================================
-- Autorização de acesso aos e-mails corporativos, por obra.
--
-- O QUE REGISTRA: o consentimento (aceite/recusa/revogação) de um colaborador para que o ACC use a sua conta
-- corporativa na sincronização de e-mails de UMA obra, com a versão do texto e o escopo que foram apresentados.
--
-- O QUE NÃO É: não conecta nem desconecta a conta no Google (a conexão real é o token OAuth guardado nos segredos
-- do servidor; ver email_accounts.status) e não altera filtros de ingestão. É o registro do aceite no ACC.
--
-- Segurança: nenhuma escrita direta; só as funções abaixo (SECURITY DEFINER, search_path vazio). Leitura por RLS:
-- administrador da obra ou o próprio colaborador. O histórico (eventos) é imutável.
-- Aditiva: não toca em nenhuma tabela existente.
-- ============================================================

create table public.email_access_authorizations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  account_email text not null,
  email_account_id uuid references public.email_accounts (id) on delete set null,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'AUTORIZADO', 'RECUSADO', 'REVOGADO')),
  requested_by_user_id uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id uuid references public.profiles (id) on delete set null,
  -- Versão do texto e escopo/filtros APRESENTADOS na solicitação — o aceite vale para eles.
  notice_version text not null check (btrim(notice_version) <> ''),
  scope_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_email = lower(btrim(account_email)) and account_email like '%@axion.com.br'),
  check ((status = 'PENDENTE' and decided_at is null) or (status <> 'PENDENTE' and decided_at is not null))
);

-- No máximo uma autorização "em aberto" (pendente ou vigente) por obra + colaborador + conta.
create unique index email_access_authorizations_open_uidx
  on public.email_access_authorizations (project_id, user_id, account_email)
  where status in ('PENDENTE', 'AUTORIZADO');

create index email_access_authorizations_project_idx on public.email_access_authorizations (project_id, requested_at desc);
create index email_access_authorizations_user_idx on public.email_access_authorizations (user_id);

create table public.email_access_authorization_events (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.email_access_authorizations (id) on delete cascade,
  event_type text not null check (event_type in ('SOLICITADA', 'AUTORIZADA', 'RECUSADA', 'REVOGADA')),
  actor_user_id uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  notice_version text not null,
  scope_snapshot jsonb not null,
  note text
);

create index email_access_authorization_events_auth_idx on public.email_access_authorization_events (authorization_id, occurred_at);

-- Histórico imutável: nenhuma alteração ou exclusão de evento, por ninguém.
create or replace function public.email_access_authorization_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'EVENTOS_IMUTAVEIS: o histórico de autorizações não pode ser alterado nem apagado.';
end;
$$;

create trigger email_access_authorization_events_no_update
  before update or delete on public.email_access_authorization_events
  for each row execute function public.email_access_authorization_events_immutable();

alter table public.email_access_authorizations enable row level security;
alter table public.email_access_authorization_events enable row level security;

revoke all on table public.email_access_authorizations from anon, authenticated;
revoke all on table public.email_access_authorization_events from anon, authenticated;
grant select on table public.email_access_authorizations to authenticated;
grant select on table public.email_access_authorization_events to authenticated;

create policy "email_access_authorizations_select_admin_or_subject"
  on public.email_access_authorizations
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_project_permission(project_id, 'ADMINISTRADOR')
  );

create policy "email_access_authorization_events_select_admin_or_subject"
  on public.email_access_authorization_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.email_access_authorizations a
      where a.id = authorization_id
        and (a.user_id = (select auth.uid()) or public.has_project_permission(a.project_id, 'ADMINISTRADOR'))
    )
  );

-- ------------------------------------------------------------
-- Solicitar (somente administrador da obra).
-- ------------------------------------------------------------
create or replace function public.request_email_access_authorization(
  p_project_id uuid,
  p_user_id uuid,
  p_account_email text,
  p_notice_version text,
  p_scope_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(p_account_email));
  v_account_id uuid;
  v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.has_project_permission(p_project_id, 'ADMINISTRADOR') then
    raise exception 'PERMISSION_DENIED: somente administradores da obra solicitam autorizações.';
  end if;
  if not exists (
    select 1 from public.project_memberships m
    where m.project_id = p_project_id and m.user_id = p_user_id and m.status = 'ACTIVE'
  ) then
    raise exception 'USER_NOT_PROJECT_MEMBER: o colaborador precisa ser membro ativo da obra.';
  end if;
  if v_email is null or v_email = '' or v_email not like '%@axion.com.br' then
    raise exception 'INVALID_ACCOUNT: informe uma conta @axion.com.br.';
  end if;
  if exists (
    select 1 from public.email_access_authorizations a
    where a.project_id = p_project_id and a.user_id = p_user_id and a.account_email = v_email
      and a.status in ('PENDENTE', 'AUTORIZADO')
  ) then
    raise exception 'ALREADY_OPEN: já existe solicitação pendente ou autorização vigente para este colaborador, conta e obra.';
  end if;

  select id into v_account_id from public.email_accounts where email_address = v_email;

  insert into public.email_access_authorizations
    (project_id, user_id, account_email, email_account_id, requested_by_user_id, notice_version, scope_snapshot)
  values
    (p_project_id, p_user_id, v_email, v_account_id, v_actor, p_notice_version, p_scope_snapshot)
  returning id into v_id;

  insert into public.email_access_authorization_events (authorization_id, event_type, actor_user_id, notice_version, scope_snapshot)
  values (v_id, 'SOLICITADA', v_actor, p_notice_version, p_scope_snapshot);

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Decidir (somente o próprio colaborador, e somente uma vez).
-- A versão do texto confirmada na tela precisa ser a que foi solicitada.
-- ------------------------------------------------------------
create or replace function public.decide_email_access_authorization(
  p_id uuid,
  p_decision text,
  p_notice_version text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.email_access_authorizations%rowtype;
  v_status text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_decision not in ('AUTORIZADO', 'RECUSADO') then raise exception 'INVALID_DECISION'; end if;

  select * into v_row from public.email_access_authorizations where id = p_id for update;
  if not found or v_row.user_id <> v_actor then raise exception 'NOT_FOUND'; end if;
  if v_row.status <> 'PENDENTE' then raise exception 'ALREADY_DECIDED'; end if;
  if v_row.notice_version <> p_notice_version then raise exception 'NOTICE_VERSION_MISMATCH'; end if;

  v_status := p_decision;
  update public.email_access_authorizations
     set status = v_status, decided_at = now(), decided_by_user_id = v_actor, updated_at = now()
   where id = p_id;

  insert into public.email_access_authorization_events (authorization_id, event_type, actor_user_id, notice_version, scope_snapshot)
  values (p_id, case when v_status = 'AUTORIZADO' then 'AUTORIZADA' else 'RECUSADA' end, v_actor, v_row.notice_version, v_row.scope_snapshot);

  return v_status;
end;
$$;

-- ------------------------------------------------------------
-- Revogar (o próprio colaborador ou um administrador da obra). Preserva o histórico.
-- ------------------------------------------------------------
create or replace function public.revoke_email_access_authorization(
  p_id uuid,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.email_access_authorizations%rowtype;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_row from public.email_access_authorizations where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.user_id <> v_actor and not public.has_project_permission(v_row.project_id, 'ADMINISTRADOR') then
    raise exception 'NOT_FOUND';
  end if;
  if v_row.status not in ('AUTORIZADO', 'PENDENTE') then raise exception 'NOT_REVOCABLE'; end if;
  -- Só o administrador cancela uma solicitação ainda pendente; o colaborador recusa em vez de revogar.
  if v_row.status = 'PENDENTE' and v_row.user_id = v_actor and not public.has_project_permission(v_row.project_id, 'ADMINISTRADOR') then
    raise exception 'NOT_REVOCABLE';
  end if;

  update public.email_access_authorizations
     set status = 'REVOGADO', decided_at = now(), decided_by_user_id = v_actor, updated_at = now()
   where id = p_id;

  insert into public.email_access_authorization_events (authorization_id, event_type, actor_user_id, notice_version, scope_snapshot, note)
  values (p_id, 'REVOGADA', v_actor, v_row.notice_version, v_row.scope_snapshot, nullif(btrim(coalesce(p_note, '')), ''));

  return 'REVOGADO';
end;
$$;

revoke all on function public.email_access_authorization_events_immutable() from public;
revoke all on function public.request_email_access_authorization(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.decide_email_access_authorization(uuid, text, text) from public;
revoke all on function public.revoke_email_access_authorization(uuid, text) from public;
grant execute on function public.request_email_access_authorization(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.decide_email_access_authorization(uuid, text, text) to authenticated;
grant execute on function public.revoke_email_access_authorization(uuid, text) to authenticated;

comment on table public.email_access_authorizations is
  'Consentimento por obra para o ACC usar a conta de e-mail corporativa de um colaborador. Registra o aceite no ACC; não representa a conexão efetiva da conta Google (ver email_accounts.status).';
comment on table public.email_access_authorization_events is
  'Histórico imutável (solicitada/autorizada/recusada/revogada) com a versão do texto e o escopo apresentados.';
